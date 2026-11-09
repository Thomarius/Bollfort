import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { appBuildVdf } from './appBuild.js';
import { PRESENCE_DIR, presenceFiles, steamText } from './presenceFiles.js';
import { quote, vdf } from './vdf.js';

describe('rich presence’s localisation files', () => {
  it('are written for English and German alone, from the game’s texts', () => {
    const files = presenceFiles();
    expect(files.map((f) => f.name)).toEqual([
      'rich_presence_english.vdf',
      'rich_presence_german.vdf',
    ]);
    const english = files[0]!.text;
    expect(english).toContain('"Language"\t"english"');
    expect(english).toContain('"#Match"\t"In a match, round %round% of %rounds%"');
    expect(files[1]!.text).toContain('"#Lobby"\t"In der Lobby"');
  });

  it('are as in assets/steam/ (npx tsx tools/steamworks/src/write.ts presence)', () => {
    for (const file of presenceFiles())
      expect(readFileSync(path.join(PRESENCE_DIR, file.name), 'utf8')).toBe(file.text);
  });

  it('write placeholders as Steam’s', () => {
    expect(steamText('round {round} of {rounds}')).toBe('round %round% of %rounds%');
  });
});

describe('the app build script', () => {
  const build = {
    appId: '1234560',
    depots: [
      { id: '1234561', folder: 'steam-windows-latest' },
      { id: '1234562', folder: 'steam-ubuntu-latest' },
    ],
    branch: 'beta',
    desc: 'Bollfort v1.0.0',
    contentRoot: '/work/steam',
    buildOutput: '/work/out',
  };

  it('maps each system’s folder whole to its depot, live on the beta branch', () => {
    expect(appBuildVdf(build)).toBe(
      [
        '"AppBuild"',
        '{',
        '\t"AppID"\t"1234560"',
        '\t"Desc"\t"Bollfort v1.0.0"',
        '\t"ContentRoot"\t"/work/steam"',
        '\t"BuildOutput"\t"/work/out"',
        '\t"SetLive"\t"beta"',
        '\t"Depots"',
        '\t{',
        '\t\t"1234561"',
        '\t\t{',
        '\t\t\t"FileMapping"',
        '\t\t\t{',
        '\t\t\t\t"LocalPath"\t"steam-windows-latest/*"',
        '\t\t\t\t"DepotPath"\t"."',
        '\t\t\t\t"recursive"\t"1"',
        '\t\t\t}',
        '\t\t}',
        '\t\t"1234562"',
        '\t\t{',
        '\t\t\t"FileMapping"',
        '\t\t\t{',
        '\t\t\t\t"LocalPath"\t"steam-ubuntu-latest/*"',
        '\t\t\t\t"DepotPath"\t"."',
        '\t\t\t\t"recursive"\t"1"',
        '\t\t\t}',
        '\t\t}',
        '\t}',
        '}',
        '',
      ].join('\n'),
    );
    expect(appBuildVdf({ ...build, preview: true })).toContain('\t"Preview"\t"1"');
  });

  it('refuses the default branch, which Steam never sets live from a script, and bad IDs', () => {
    expect(() => appBuildVdf({ ...build, branch: 'default' })).toThrow(/default branch/);
    expect(() => appBuildVdf({ ...build, appId: '12a' })).toThrow(/App ID/);
    expect(() => appBuildVdf({ ...build, depots: [{ id: '', folder: 'x' }] })).toThrow(/depot/);
  });
});

describe('VDF', () => {
  it('escapes quotes and backslashes, and keeps a repeated key', () => {
    expect(quote('a "b" \\c')).toBe('"a \\"b\\" \\\\c"');
    expect(
      vdf('k', [
        ['x', '1'],
        ['x', '2'],
      ]),
    ).toBe('"k"\n{\n\t"x"\t"1"\n\t"x"\t"2"\n}');
  });
});
