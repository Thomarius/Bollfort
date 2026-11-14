// `npm run check`: format, lint, typecheck and tests at once rather than one after another,
// each one's output shown whole once it has finished, in that order; failing if any fails.
// The tests take most of the time on their own, so the others cost almost nothing beside
// them. CI runs the same four as separate steps (.github/workflows/ci.yml).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

// The private supporter styles (STEAM.md §6.1), where checked out: their tests run with the
// rest, lint covers them, and this step typechecks and formats them — `format:check` and
// `typecheck` pass over a folder that is in `.gitignore` and no workspace.
const supporter = existsSync('supporter/src/index.ts');
const steps = [
  'format:check',
  'lint',
  'typecheck',
  'test',
  ...(supporter ? ['supporter:check'] : []),
];
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const started = Date.now();

interface Run {
  step: string;
  code: number | null;
  output: string;
}

const runs = steps.map(
  (step) =>
    new Promise<Run>((resolve) => {
      const child = spawn(npm, ['run', '-s', step], {
        shell: process.platform === 'win32',
        // Colour only on a terminal: the children write to pipes, and would otherwise drop it.
        env: process.stdout.isTTY ? { ...process.env, FORCE_COLOR: '1' } : process.env,
      });
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
      child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
      child.on('close', (code) => resolve({ step, code, output }));
    }),
);

let failed = 0;
for (const run of runs) {
  const { step, code, output } = await run;
  process.stdout.write(`\n=== ${step} ${code === 0 ? 'passed' : 'FAILED'}\n${output}`);
  if (code !== 0) failed++;
}
const seconds = ((Date.now() - started) / 1000).toFixed(0);
console.log(`\n${failed === 0 ? 'all passed' : `${failed} failed`} in ${seconds} s`);
process.exit(failed === 0 ? 0 : 1);
