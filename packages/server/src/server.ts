import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';

import { loadConfigBundle } from '@bollfort/config/node';
import { PROTOCOL_VERSION, type RoomList } from '@bollfort/protocol';
import { WebSocketServer, type WebSocket } from 'ws';

import { openableUrls } from './addresses.js';
import { Gateway } from './gateway.js';
import { openRecordingStore } from './recordings.js';
import { codeVersion } from './version.js';
import { RoomManager } from './rooms.js';
import { PortOpener, type InternetStatus } from './upnp.js';

/**
 * The server as something a program starts and stops (PLAN 11.17 A1): the command line in
 * `main.ts` for `npm start` and the image, and the desktop app for a release. Everything
 * found by walking up from the server's own file before is passed in, since a packaged
 * app keeps its config and client in its resources and cannot write recordings inside
 * itself.
 */

export interface ServerOptions {
  /** Where `config/` is: the repository, or a packaged app's resources. */
  root: string;
  /** The built client it serves; the repository's `packages/client/dist` by default. */
  clientDir?: string;
  /**
   * Where recordings go; the config's folder under `root` by default. A packaged app passes
   * a folder of the user's, which it can write to. `recordings.enabled` still decides.
   */
  recordingsDir?: string;
  /**
   * Whether to record at all; the config's `recordings.enabled` by default. A packaged app
   * passes false (STEAM.md, package R): recordings are for tuning on the user's own server,
   * not part of a release, and a player's disk is no place to gather them.
   */
  record?: boolean;
  /** The config's by default. Port 0 takes any free one, as tests do. */
  port?: number;
  host?: string;
  /** The code stamped into recordings; asked of git under `root` by default. */
  commit?: string | null;
  /** Where the server's own news goes; stderr by default, as its start-up line does. */
  log?: (message: string) => void;
  /**
   * Ask the router to open the port as the server starts (PLAN 11.21): the host's choice,
   * never a default. `setInternet` changes it while running.
   */
  upnp?: boolean;
  /** The port opener; a real one by default, a fake in tests. */
  opener?: PortOpener;
  /** The config's `reconnect.heartbeatMs` by default; short in tests. */
  heartbeatMs?: number;
}

export interface RunningServer {
  port: number;
  host: string;
  /** Where a browser can reach it: this machine, then each network address. */
  urls: string[];
  /** Closes every connection, room and timer, and resolves once the port is free. */
  stop(): Promise<void>;
  /** Whether the port is open to the internet, and where. */
  readonly internet: InternetStatus;
  /** Asks the router to open the port, or closes it; resolves with what happened. */
  setInternet(on: boolean): Promise<InternetStatus>;
  /** Told whenever `internet` changes. */
  onInternet(listener: (status: InternetStatus) => void): void;
  /**
   * An address reaching this server from the internet by another way than the router — the
   * desktop app's tunnel — or null. While set, the lobby's invitation uses it, ahead of the
   * router's opened port.
   */
  setInvite(url: string | null): void;
}

/** A start that could not bind: told as such, so a caller can say so rather than crash. */
export type StartResult =
  | { ok: true; server: RunningServer }
  | { ok: false; reason: 'port_in_use' | 'no_permission'; port: number; host: string };

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  // Audio cues may be supplied in any format the browser can decode, so the manifest
  // names whatever file exists and this has to be able to describe it. `decodeAudioData`
  // reads the bytes and ignores the content type, so getting one of these wrong is not
  // fatal — but serving a sound as an unknown binary blob confuses caches and anything
  // else that looks at the response before the game does.
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
};

/**
 * How a static file is answered: always with an `ETag` from its size and modification time and
 * `Cache-Control: no-cache`, so a browser keeps every file and asks once a load whether it
 * changed; a request whose `If-None-Match` names the same tag gets 304 and no body. The sound and
 * music are some 10 MB a guest downloads from a host's home connection, which every load did
 * again before (ARCHIVE 14b); a new release's changed files have new tags, so none is
 * ever kept stale.
 */
export function staticAnswer(
  file: { size: number; mtimeMs: number },
  ifNoneMatch: string | undefined,
): { status: 200 | 304; etag: string } {
  const etag = `W/"${file.size.toString(16)}-${Math.floor(file.mtimeMs).toString(16)}"`;
  const asked = (ifNoneMatch ?? '').split(',').map((tag) => tag.trim());
  return { status: asked.includes(etag) || asked.includes('*') ? 304 : 200, etag };
}

/**
 * The build's own files are named by a hash of their contents (`assets/index-De-tDLdd.js`), so
 * a new release's are new names and an old name never changes: a browser may keep them for good
 * without asking again. Everything else — the page, the sound and music under fixed names — is
 * asked after once a load, as `staticAnswer` says.
 */
export function cacheControl(rel: string): string {
  return /^[/\\]?assets[/\\][^/\\]+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/.test(rel)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
}

export async function startServer(options: ServerOptions): Promise<StartResult> {
  const bundle = loadConfigBundle(options.root);
  const log = options.log ?? ((message: string) => console.error(message));
  const clientDist = options.clientDir ?? join(options.root, 'packages', 'client', 'dist');
  const port = options.port ?? bundle.server.port;
  const host = options.host ?? bundle.server.host;

  /**
   * Recordings of every match, for tuning the rules against people rather than bots; see
   * `recordings.ts`. On by default: the files are small, and a test session is exactly the
   * data there is least of.
   */
  const store =
    (options.record ?? bundle.server.recordings.enabled)
      ? openRecordingStore(
          options.recordingsDir ?? join(options.root, bundle.server.recordings.dir),
          bundle.server.recordings.maxUploadBytes,
          bundle,
          log,
          options.commit === undefined ? codeVersion(options.root) : options.commit,
        )
      : null;
  // The public address while the port is open, for the lobby's invitation (PLAN 11.21).
  let internet: InternetStatus = { state: 'off' };
  let invite: string | null = null;
  const internetListeners: ((status: InternetStatus) => void)[] = [];
  const rooms = new RoomManager(
    bundle,
    undefined,
    store === null ? undefined : () => store.writer(),
    () => invite ?? (internet.state === 'open' ? internet.url : null),
  );

  /**
   * A local match's recording, sent a few lines at a time by the browser playing it:
   * `POST /recordings/<id>` with the lines as the body.
   */
  const receiveRecording = (req: IncomingMessage, res: ServerResponse, id: string): void => {
    if (store === null) {
      res.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > bundle.server.recordings.maxUploadBytes) req.destroy();
      else chunks.push(chunk);
    });
    req.on('end', () => {
      const result = store.upload(id, Buffer.concat(chunks).toString('utf8'));
      res.writeHead(result.ok ? 204 : 400, { 'content-type': 'text/plain' });
      res.end(result.ok ? undefined : result.reason);
    });
  };

  /** Serves the built client, so one process is the whole deployment. */
  const serveStatic = (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const rel = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
    let file = join(clientDist, rel);
    let kept = cacheControl(rel);
    if (!existsSync(file) || statSync(file).isDirectory()) {
      // The page in place of a missing file must never be kept under the file's name.
      file = join(clientDist, 'index.html');
      kept = 'no-cache';
    }

    if (!existsSync(file)) {
      res.writeHead(503, { 'content-type': 'text/plain' });
      res.end('client not built — run: npm run build -w @bollfort/client');
      return;
    }
    const stat = statSync(file);
    const { status, etag } = staticAnswer(stat, req.headers['if-none-match']);
    const headers = { etag, 'cache-control': kept };
    if (status === 304) {
      res.writeHead(304, headers).end();
      return;
    }
    // Its length too, so the loading screen's bar moves through a file from a slow host.
    res.writeHead(200, {
      ...headers,
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'content-length': stat.size,
    });
    createReadStream(file).pipe(res);
  };

  const http = createServer((req, res) => {
    const upload = /^\/recordings\/([^/]+)$/.exec(req.url ?? '');
    if (req.method === 'POST' && upload !== null) {
      receiveRecording(req, res, upload[1] as string);
      return;
    }
    // The games browser: open public rooms, polled by the menu, which has no socket open.
    // With the protocol, so a page from an older build can tell it cannot join them.
    if (req.method === 'GET' && (req.url ?? '').split('?')[0] === '/api/rooms') {
      const body: RoomList = { protocol: PROTOCOL_VERSION, rooms: rooms.listOpen() };
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
      return;
    }
    serveStatic(req, res);
  });

  // Bind first: a port somebody else holds is the one failure a host will meet, and it
  // must come back as an answer, not as an error thrown from deep inside the server.
  const bound = await new Promise<'ok' | 'port_in_use' | 'no_permission'>((resolve, reject) => {
    const failed = (error: NodeJS.ErrnoException): void => {
      if (error.code === 'EADDRINUSE') resolve('port_in_use');
      else if (error.code === 'EACCES') resolve('no_permission');
      else reject(error);
    };
    http.once('error', failed);
    http.listen(port, host, () => {
      http.off('error', failed);
      resolve('ok');
    });
  });
  if (bound !== 'ok') return { ok: false, reason: bound, port, host };

  const { maxMessageBytes, maxTournamentBytes } = bundle.server.limits;
  // The limits below count characters; a character is at most three bytes in UTF-8. Without
  // this `ws` took a frame of up to 100 MiB whole before the size was ever checked.
  const wss = new WebSocketServer({
    server: http,
    maxPayload: 3 * Math.max(maxMessageBytes, maxTournamentBytes),
  });
  const gateway = new Gateway(bundle, rooms);

  /** Sockets heard from since the last heartbeat; see `reconnect.heartbeatMs`. */
  const heard = new WeakSet<WebSocket>();
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!heard.has(socket)) {
        // Closes it at once, without the closing handshake a silent peer would never answer;
        // its 'close' hands the seat on as any leaving does.
        socket.terminate();
        continue;
      }
      heard.delete(socket);
      socket.ping();
    }
  }, options.heartbeatMs ?? bundle.server.reconnect.heartbeatMs);

  wss.on('connection', (socket: WebSocket) => {
    heard.add(socket);
    socket.on('pong', () => heard.add(socket));
    const session = gateway.accept({
      send(text) {
        if (socket.readyState === socket.OPEN) socket.send(text);
      },
      close() {
        socket.close();
      },
    });
    socket.on('message', (raw: Buffer | string) => {
      heard.add(socket);
      session.receive(typeof raw === 'string' ? raw : raw.toString('utf8'));
    });
    socket.on('close', () => session.closed());
    socket.on('error', () => session.closed());
  });

  const tickMs = 1000 / bundle.ruleset.tickRateHz;
  let last = Date.now();
  const ticking = setInterval(() => {
    const now = Date.now();
    rooms.update(now - last);
    last = now;
  }, tickMs);

  const address = http.address();
  const actualPort = typeof address === 'object' && address !== null ? address.port : port;
  let stopping: Promise<void> | null = null;
  const opener =
    options.opener ??
    new PortOpener({
      leaseSeconds: bundle.server.upnp.leaseSeconds,
      searchMs: bundle.server.upnp.searchMs,
      interfaces: networkInterfaces,
    });
  const announce = (status: InternetStatus): InternetStatus => {
    internet = status;
    rooms.refreshLobbies();
    for (const listener of internetListeners) listener(status);
    return status;
  };
  // The latest request wins: an answer to one the host has since withdrawn is dropped.
  let request = 0;
  const setInternet = async (on: boolean): Promise<InternetStatus> => {
    const mine = ++request;
    if (!on) {
      await opener.close();
      return announce({ state: 'off' });
    }
    announce({ state: 'searching' });
    const status = await opener.open(actualPort);
    if (mine !== request || stopping !== null) return internet;
    if (status.state === 'open') log(`reachable from the internet at ${status.url}`);
    return announce(status);
  };
  if (options.upnp === true) void setInternet(true);
  return {
    ok: true,
    server: {
      get internet() {
        return internet;
      },
      setInternet,
      onInternet(listener) {
        internetListeners.push(listener);
      },
      setInvite(url) {
        if (url === invite) return;
        invite = url;
        if (url !== null) log(`reachable from the internet at ${url}`);
        rooms.refreshLobbies();
      },
      port: actualPort,
      host,
      // The addresses to open, not the one bound: a browser refuses http://0.0.0.0:8080.
      urls: openableUrls(host, actualPort, networkInterfaces()),
      stop() {
        // The mapping goes first, so a router is not left pointing at a port nobody holds;
        // bounded, since a router that does not answer must not hold up a stop.
        const unmapped = Promise.race([
          opener.close(),
          new Promise<void>((resolve) => setTimeout(resolve, 2000).unref()),
        ]);
        stopping ??= new Promise<void>((resolve) => {
          clearInterval(ticking);
          clearInterval(heartbeat);
          for (const client of wss.clients) client.terminate();
          wss.close();
          http.closeAllConnections();
          http.close(() => resolve());
        })
          // A recording's last lines, appended without blocking, are on disk before stop returns.
          .then(() => store?.flushed())
          .then(() => unmapped);
        return stopping;
      },
    },
  };
}
