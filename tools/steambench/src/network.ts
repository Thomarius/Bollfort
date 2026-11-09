// The guest's network, shaped with `tc netem` (STEAM.md 3.4): this machine's side of the VM's
// interface (`vnetN`, what reaches the VM) and the VM's own (`enp1s0`, what leaves it), so both
// directions — Steam's relay or a direct path alike — and nothing but the guest's traffic.
// Root for `tc` here by a sudoers line for /usr/sbin/tc alone; the VM's tester has sudo.
import { execFileSync } from 'node:child_process';

import { sleep, vmTap, type VmMachine } from './machines.js';

const TC = '/usr/sbin/tc';
const VM_IFACE = 'enp1s0';

/** One direction's shaping: a round trip gains twice the delay. */
export interface Shape {
  delayMs: number;
  jitterMs: number;
  lossPct: number;
}

function netem(shape: Shape): string {
  const parts = [];
  if (shape.delayMs > 0)
    parts.push(`delay ${shape.delayMs}ms ${shape.jitterMs}ms distribution normal`);
  if (shape.lossPct > 0) parts.push(`loss ${shape.lossPct}%`);
  return parts.join(' ');
}

export class Network {
  private readonly tap = vmTap();
  constructor(private readonly vm: VmMachine) {}

  private local(args: string): void {
    execFileSync('sudo', ['-n', TC, ...args.split(' ')], { timeout: 10_000, stdio: 'pipe' });
  }

  /** Whether `tc` runs here as root without a password: the shaping scenarios need it. */
  static canShape(): boolean {
    try {
      execFileSync('sudo', ['-n', TC, 'qdisc', 'show'], { stdio: 'pipe', timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  }

  shape(shape: Shape): void {
    const rule = netem(shape);
    this.local(`qdisc replace dev ${this.tap} root netem ${rule}`);
    this.vm.sh(`sudo ${TC} qdisc replace dev ${VM_IFACE} root netem ${rule}`);
  }

  /** Both sides plain again; quiet where there was nothing to remove. */
  clear(): void {
    try {
      this.local(`qdisc del dev ${this.tap} root`);
    } catch {
      // none
    }
    try {
      this.vm.sh(`sudo ${TC} qdisc del dev ${VM_IFACE} root 2>/dev/null; true`);
    } catch {
      // unreachable: a cut still running clears itself
    }
  }

  /**
   * The guest cut off for `seconds`. The VM's half removes itself, since SSH cannot reach it
   * while it is cut; it begins a second after the command returns, so the command's own answer
   * gets out.
   */
  async cut(seconds: number): Promise<void> {
    this.vm.sh(
      `setsid -f sh -c 'sleep 1; sudo ${TC} qdisc replace dev ${VM_IFACE} root netem loss 100%; ` +
        `sleep ${seconds}; sudo ${TC} qdisc del dev ${VM_IFACE} root' > /dev/null 2>&1 < /dev/null`,
    );
    await sleep(1000);
    this.local(`qdisc replace dev ${this.tap} root netem loss 100%`);
    await sleep(seconds * 1000);
    this.local(`qdisc del dev ${this.tap} root`);
    // The VM's half ends on its own clock: give it a moment.
    await sleep(1500);
  }
}
