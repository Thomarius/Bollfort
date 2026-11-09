// The bench's two machines (STEAM.md 3.4): this one, and the VM "bollfort-guest" reached over
// SSH. Each runs the app under test with Chromium's remote debugging on, so both are driven the
// same way, by Playwright over CDP; the VM's port comes through an SSH tunnel.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const VM_NAME = 'bollfort-guest';
/** The VM's state folder: its SSH key and known hosts (`vm/create.sh`), never the repository. */
export const VM_DIR = process.env['STEAMBENCH_VM_DIR'] ?? path.join(os.homedir(), 'vm', VM_NAME);
/** Where the app under test lives on the VM. */
const VM_APP_DIR = '/home/tester/spike';
const EXE = 'bollfort-steam-spike';

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function virsh(args: string): string {
  return execFileSync('sg', ['libvirt', '-c', `virsh -c qemu:///system ${args}`], {
    encoding: 'utf8',
    timeout: 20_000,
  });
}

/**
 * The VM's address, asked of its guest agent: libvirt forgets its own DHCP leases when this
 * machine restarts, while the VM keeps its address (2026-11-09).
 */
function vmAddress(): string {
  const out = virsh(`domifaddr ${VM_NAME} --source agent`);
  const line = out.split('\n').find((l) => /^\s*enp\S*\s/.test(l) && l.includes('ipv4'));
  const ip = line?.match(/(\d+\.\d+\.\d+\.\d+)\//)?.[1];
  if (ip === undefined) throw new Error(`no address for ${VM_NAME}: is it running?\n${out}`);
  return ip;
}

/** The VM's interface on this machine (`vnetN`): shaping it touches the guest's traffic only. */
export function vmTap(): string {
  const out = virsh(`domiflist ${VM_NAME}`);
  const tap = out.match(/^\s*(vnet\d+)\s/m)?.[1];
  if (tap === undefined) throw new Error(`no interface for ${VM_NAME}:\n${out}`);
  return tap;
}

export type Where = 'local' | 'vm';

export interface Machine {
  readonly where: Where;
  /** Where the app under test lives on the machine; its logs in `logs/` beside it. */
  readonly appDir: string;
  /** The port on this machine where its app's DevTools answer. */
  readonly cdpPort: number;
  /** A shell command on the machine, its output. Throws on failure or after `timeoutMs`. */
  sh(command: string, timeoutMs?: number): string;
  /** Starts the app under test, detached, with these arguments. */
  start(args: readonly string[]): void;
  /** Stops every process of the app under test, and waits for its ports. */
  stop(): Promise<void>;
  /** Busy and total time of all cores so far, from /proc/stat. */
  cpu(): { idle: number; total: number };
  close(): void;
}

function cpuOf(stat: string): { idle: number; total: number } {
  const f = (stat.split('\n')[0] ?? '').trim().split(/\s+/).slice(1).map(Number);
  return { idle: (f[3] ?? 0) + (f[4] ?? 0), total: f.reduce((a, b) => a + b, 0) };
}

/** The start command: no sandbox, as the Steam build on Linux (STEAM.md 3.1), DevTools on. */
function startCommand(dir: string, port: number, args: readonly string[]): string {
  const quoted = args.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ');
  return (
    `cd '${dir}' && rm -rf logs && DISPLAY=\${DISPLAY:-:0} setsid -f ./${EXE} --no-sandbox ` +
    `--remote-debugging-port=${port} ${quoted} > run.log 2>&1 < /dev/null`
  );
}

const PORTS = [8090, 8091];

export class LocalMachine implements Machine {
  readonly where = 'local';
  readonly cdpPort = 9223;
  constructor(readonly appDir: string) {}

  sh(command: string, timeoutMs = 20_000): string {
    return execFileSync('sh', ['-c', command], { encoding: 'utf8', timeout: timeoutMs });
  }
  start(args: readonly string[]): void {
    this.sh(startCommand(this.appDir, this.cdpPort, args));
  }
  async stop(): Promise<void> {
    // pkill without a shell, so its pattern cannot match the command that runs it; it fails
    // when nothing matches.
    for (const pattern of [path.join(this.appDir, EXE), `./${EXE} --no-sandbox`])
      try {
        execFileSync('pkill', ['-f', pattern]);
      } catch {
        // none running
      }
    for (let i = 0; i < 30; i++) {
      const busy = this.sh(
        `ss -ltnH '( sport = :${PORTS.join(' or sport = :')} or sport = :${this.cdpPort} )'`,
      );
      if (busy.trim() === '') return;
      await sleep(1000);
    }
    throw new Error('the local app still holds its ports');
  }
  cpu(): { idle: number; total: number } {
    return cpuOf(fs.readFileSync('/proc/stat', 'utf8'));
  }
  close(): void {}
}

export class VmMachine implements Machine {
  readonly where = 'vm';
  readonly cdpPort = 19222;
  readonly appDir = VM_APP_DIR;
  private readonly ip = vmAddress();
  private tunnel: ChildProcess | null = null;

  private sshArgs(): string[] {
    return [
      '-i',
      path.join(VM_DIR, 'id_vm'),
      '-o',
      'IdentitiesOnly=yes',
      '-o',
      'StrictHostKeyChecking=accept-new',
      '-o',
      `UserKnownHostsFile=${path.join(VM_DIR, 'known_hosts')}`,
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=5',
    ];
  }
  sh(command: string, timeoutMs = 20_000): string {
    // stdin closed, or ssh waits on it as long as anything started remotely lives (2026-11-08).
    return execFileSync('ssh', [...this.sshArgs(), `tester@${this.ip}`, command], {
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  /** Copies the app under test in; Electron refuses to start unless chrome-sandbox is root's. */
  deploy(appDir: string): void {
    execFileSync(
      'rsync',
      [
        '-a',
        '--delete',
        '--exclude',
        'logs',
        '-e',
        ['ssh', ...this.sshArgs()].join(' '),
        `${appDir}/`,
        `tester@${this.ip}:${VM_APP_DIR}/`,
      ],
      { timeout: 300_000 },
    );
    this.sh(
      `cd ${VM_APP_DIR} && sudo chown root:root chrome-sandbox && sudo chmod 4755 chrome-sandbox`,
    );
  }
  start(args: readonly string[]): void {
    this.sh(startCommand(VM_APP_DIR, 9222, args));
    this.openTunnel();
  }
  private openTunnel(): void {
    if (this.tunnel !== null && this.tunnel.exitCode === null) return;
    this.tunnel = spawn(
      'ssh',
      [...this.sshArgs(), '-N', '-L', `${this.cdpPort}:127.0.0.1:9222`, `tester@${this.ip}`],
      { stdio: 'ignore' },
    );
  }
  async stop(): Promise<void> {
    // Electron shows its path whole (`/home/tester/spike/…`); the bracket keeps the pattern
    // from matching the shell that runs it.
    this.sh(`pkill -f '${VM_APP_DIR}/[b]${EXE.slice(1)}' ; true`);
    for (let i = 0; i < 30; i++) {
      const busy = this.sh(`ss -ltnH '( sport = :8090 or sport = :8091 or sport = :9222 )'`);
      if (busy.trim() === '') return;
      await sleep(1000);
    }
    throw new Error("the VM's app still holds its ports");
  }
  cpu(): { idle: number; total: number } {
    return cpuOf(this.sh('cat /proc/stat'));
  }
  close(): void {
    this.tunnel?.kill();
    this.tunnel = null;
  }
}

/** The share of the cores busy between two readings, in percent. */
export function busy(
  a: { idle: number; total: number },
  b: { idle: number; total: number },
): number {
  return Math.round(100 * (1 - (b.idle - a.idle) / Math.max(1, b.total - a.total)));
}
