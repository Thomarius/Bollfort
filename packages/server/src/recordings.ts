import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';

import { statsCsv, statsOfRecording } from '@bollwerk/analysis';
import type { ConfigBundle } from '@bollwerk/config';
import { RecordingLineSchema, parseRecording, type RecordingLine } from '@bollwerk/protocol';

/**
 * Match recordings on disk, one file per match (`<id>.jsonl`), for tuning the rules
 * against people. See `recording.ts` in the protocol for the format.
 *
 * Lines are appended as the match runs, so a match abandoned halfway, or a server
 * stopped mid-game, keeps everything up to that point. The server records its own rooms
 * directly, a tick's lines gathered and appended without blocking, since the rooms' ticks
 * run on the same thread; a browser playing a match on its own sends its lines here
 * instead, since it has no disk to write to.
 *
 * Bounded twice: a file stops growing at `maxFileBytes`, and once the folder holds
 * `maxTotalBytes` no new recording is begun. Nothing is ever deleted to make room.
 *
 * When a match ends its statistics are written beside it, `<id>.stats.csv`: the same
 * per-round table `--replay` produces, by the same replay, so nothing has to be run by
 * hand after a session. An abandoned match has no end and gets none; `--replay` still
 * reads it.
 */
export class RecordingStore {
  /** The folder's size, counted once at the start and kept up as files are written. */
  private used = 0;
  /** Appends under way, so a stop can wait for them (`flushed`). */
  private readonly writing = new Set<Promise<void>>();

  constructor(
    private readonly dir: string,
    private readonly maxUploadBytes: number,
    /** The rules the statistics are measured by; the recording carries its own ruleset. */
    private readonly bundle: ConfigBundle,
    /** Where to say that a statistics file was written, or why not. */
    private readonly log: (message: string) => void = () => undefined,
    /** The code this server runs, stamped into every header it writes; see `version.ts`. */
    private readonly commit: string | null = null,
  ) {
    mkdirSync(dir, { recursive: true });
    for (const name of readdirSync(dir)) {
      const stat = statSync(join(dir, name), { throwIfNoEntry: false });
      if (stat?.isFile() === true) this.used += stat.size;
    }
  }

  private get limits(): { maxFileBytes: number; maxTotalBytes: number } {
    return this.bundle.server.recordings;
  }

  /** Whether the folder being full has been logged yet: once a session is enough. */
  private saidFull = false;

  /** Whether a new recording may begin, saying once a session when it may not. */
  private roomForAnother(id: string): boolean {
    if (this.used < this.limits.maxTotalBytes) return true;
    if (!this.saidFull) {
      this.log(
        `recording ${id}: not recorded — ${this.dir} holds ${this.used} bytes, ` +
          `the most allowed (recordings.maxTotalBytes)`,
      );
      this.saidFull = true;
    }
    return false;
  }

  /** Resolves once every append begun so far is on disk, and any statistics after it. */
  async flushed(): Promise<void> {
    while (this.writing.size > 0) await Promise.all(this.writing);
  }

  /**
   * Replays a finished match into its statistics. Deferred to after the current turn of
   * the event loop, so the step that ended the match — and its broadcast — go first;
   * the replay itself takes a fraction of a second.
   */
  private finish(id: string): void {
    const done = new Promise<void>((resolve) =>
      setImmediate(() => {
        try {
          const lines = parseRecording(readFileSync(join(this.dir, `${id}.jsonl`), 'utf8'));
          const { rows, replay } = statsOfRecording(this.bundle, lines);
          const csv = statsCsv(rows);
          writeFileSync(join(this.dir, `${id}.stats.csv`), csv, 'utf8');
          this.used += Buffer.byteLength(csv);
          const exact = replay.mismatches.length === 0 && replay.refused === 0;
          this.log(
            `recording ${id}: ${rows.length} statistics row(s)` +
              (exact
                ? ''
                : ' — the replay DIVERGED from the match, so these are not to be trusted'),
          );
        } catch (error) {
          this.log(`recording ${id}: no statistics (${String(error).slice(0, 120)})`);
        }
        resolve();
      }),
    );
    this.track(done);
  }

  private track(work: Promise<void>): void {
    this.writing.add(work);
    void work.finally(() => this.writing.delete(work));
  }

  /** A header as this server writes it: carrying its code, whatever it said before. */
  private stamped(line: RecordingLine): RecordingLine {
    if (line.kind !== 'header') return line;
    const { commit: _claimed, ...rest } = line;
    return this.commit === null ? rest : { ...rest, commit: this.commit };
  }

  /**
   * A writer for one match: the header names the file, every later line joins it. Lines
   * wait in memory while an append is under way and go in the next one, in order; none
   * holds a file open between appends, so a match abandoned without an end leaves nothing
   * behind. The statistics follow the append that carried the end.
   */
  writer(): (line: RecordingLine) => void {
    let id: string | null = null;
    let file = '';
    let size = 0;
    let pending = '';
    let ended = false;
    let busy = false;
    const drain = async (): Promise<void> => {
      while (pending !== '') {
        const chunk = pending;
        const ends = ended;
        pending = '';
        ended = false;
        try {
          await appendFile(file, chunk);
        } catch (error) {
          this.log(`recording ${id}: a write failed (${String(error).slice(0, 120)})`);
        }
        if (ends && id !== null) this.finish(id);
      }
      busy = false;
    };
    return (given) => {
      const line = this.stamped(given);
      if (line.kind === 'header') {
        id = this.roomForAnother(line.id) ? line.id : null;
        file = join(this.dir, `${line.id}.jsonl`);
      }
      if (id === null) return;
      const text = `${JSON.stringify(line)}\n`;
      const bytes = Buffer.byteLength(text);
      if (size + bytes > this.limits.maxFileBytes) {
        this.log(`recording ${id}: stopped at ${size} bytes (recordings.maxFileBytes)`);
        id = null;
        return;
      }
      size += bytes;
      this.used += bytes;
      pending += text;
      if (line.kind === 'end') ended = true;
      if (!busy) {
        busy = true;
        this.track(drain());
      }
    };
  }

  /**
   * Lines a browser sent for its own match. Refused whole unless every line is a valid
   * recording line, the first a header naming this id when the file does not exist yet,
   * and no later one another header — nothing but recordings gets written, and nothing
   * lands in a file that another match began.
   *
   * Only a browser's own recording, named and headed as one (`recordingId('local', …)`):
   * a server's is named by its start and its room's code, which the games browser shows
   * anyone, and lines posted to that name were added to the server's own file.
   */
  upload(id: string, body: string): { ok: true } | { ok: false; reason: string } {
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return { ok: false, reason: 'bad id' };
    if (!id.includes('-local-')) return { ok: false, reason: 'not a browser recording' };
    const bytes = Buffer.byteLength(body);
    if (bytes > this.maxUploadBytes) return { ok: false, reason: 'too large' };
    const lines: RecordingLine[] = [];
    try {
      for (const text of body.split('\n')) {
        if (text.trim() === '') continue;
        const parsed = RecordingLineSchema.safeParse(JSON.parse(text));
        if (!parsed.success) return { ok: false, reason: 'not a recording line' };
        lines.push(this.stamped(parsed.data));
      }
    } catch {
      return { ok: false, reason: 'not JSON' };
    }
    const file = join(this.dir, `${id}.jsonl`);
    const exists = existsSync(file);
    if (!exists && !this.roomForAnother(id)) return { ok: false, reason: 'recordings full' };
    if ((exists ? statSync(file).size : 0) + bytes > this.limits.maxFileBytes) {
      return { ok: false, reason: 'too large' };
    }
    for (const [i, line] of lines.entries()) {
      const opens = !exists && i === 0;
      if (line.kind === 'header' && (!opens || line.id !== id)) {
        return { ok: false, reason: 'misplaced header' };
      }
      if (line.kind === 'header' && line.source !== 'local') {
        return { ok: false, reason: 'not a browser recording' };
      }
      if (opens && line.kind !== 'header') return { ok: false, reason: 'no header' };
    }
    if (lines.length > 0) {
      // Still synchronous: a request's few lines, and the next request's header check reads
      // whether this file exists.
      const text = lines.map((line) => `${JSON.stringify(line)}\n`).join('');
      appendFileSync(file, text);
      this.used += Buffer.byteLength(text);
    }
    if (lines.some((line) => line.kind === 'end')) this.finish(id);
    return { ok: true };
  }
}

/**
 * The store, or null with a warning when its folder cannot be made — the server runs on
 * without recording rather than not at all. A recording is never worth a game server:
 * the deployment image once crashed at start-up because it runs as an unprivileged user
 * who could not create `recordings/` in a directory owned by root (ARCHIVE 11e).
 */
export function openRecordingStore(
  dir: string,
  maxUploadBytes: number,
  bundle: ConfigBundle,
  log: (message: string) => void,
  commit: string | null = null,
): RecordingStore | null {
  try {
    return new RecordingStore(dir, maxUploadBytes, bundle, log, commit);
  } catch (error) {
    log(`recordings disabled: cannot use ${dir} (${String(error).slice(0, 120)})`);
    return null;
  }
}
