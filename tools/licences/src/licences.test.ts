import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { noticesMarkdown, packageDir, REPO, shippedPackages } from './licences.js';

describe('licences', () => {
  it('finds the package a bundled file belongs to, scoped or not, never our own', () => {
    expect(packageDir('/r/node_modules/pixi.js/lib/index.mjs')).toBe('/r/node_modules/pixi.js');
    expect(packageDir('/r/node_modules/@pixi/colord/index.mjs?commonjs-proxy')).toBe(
      '/r/node_modules/@pixi/colord',
    );
    // A nested copy is its own package, at its own version.
    expect(packageDir('/r/node_modules/a/node_modules/err-code/index.js')).toBe(
      '/r/node_modules/a/node_modules/err-code',
    );
    expect(packageDir('\0/r/node_modules/ws/index.js')).toBe('/r/node_modules/ws');
    expect(packageDir('C:\\r\\node_modules\\zod\\index.js')).toBe('C:/r/node_modules/zod');
    expect(packageDir('/r/node_modules/@bollfort/sim/src/match.ts')).toBeNull();
    expect(packageDir('/r/packages/client/src/main.ts')).toBeNull();
  });

  it('has THIRD_PARTY_LICENSES.md made from the builds as they stand', async () => {
    // Bundles the client, the desktop app and the server in memory: some seconds.
    const packages = await shippedPackages();
    const names = packages.map((p) => p.name);
    // The ones a build cannot do without, so an empty or broken collection cannot pass.
    for (const name of ['pixi.js', 'zod', 'ws', 'steamworks.js', 'koffi'])
      expect(names).toContain(name);
    for (const p of packages) expect(p.text.length, p.name).toBeGreaterThan(100);
    const file = readFileSync(path.join(REPO, 'THIRD_PARTY_LICENSES.md'), 'utf8');
    expect(file, 'stale: run `npm run licences`').toBe(noticesMarkdown(packages));
  }, 120_000);
});
