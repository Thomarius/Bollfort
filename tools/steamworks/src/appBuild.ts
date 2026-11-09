import { vdf, type Vdf } from './vdf.js';

/**
 * The app build script `steamcmd +run_app_build` reads (STEAM.md §9.2), written by the release
 * job from the repository's variables once our App ID and depots exist: the Steam build's two
 * folders, as the build job packages them, each its own depot, set live on the beta branch —
 * a password-protected branch the user promotes to the public one by hand in Steamworks, since
 * Steam never sets the default branch live from a script.
 */
export interface AppBuild {
  appId: string;
  /** The depot of each system, and its folder under `contentRoot`. */
  depots: { id: string; folder: string }[];
  /** The branch the build goes live on; never `default`, which Steam refuses. */
  branch: string;
  desc: string;
  /** Where the folders are, and where Steam's cache and logs go: absolute paths. */
  contentRoot: string;
  buildOutput: string;
  /** Checks the script without uploading anything. */
  preview?: boolean;
}

const ID = /^\d{1,10}$/;

export function appBuildVdf(build: AppBuild): string {
  if (!ID.test(build.appId)) throw new Error(`not an App ID: ${build.appId}`);
  for (const d of build.depots) if (!ID.test(d.id)) throw new Error(`not a depot ID: ${d.id}`);
  if (build.branch === '' || build.branch === 'default')
    throw new Error('Steam sets no build live on the default branch from a script');
  const depots: Vdf = build.depots.map(({ id, folder }): [string, Vdf] => [
    id,
    {
      FileMapping: { LocalPath: `${folder}/*`, DepotPath: '.', recursive: '1' },
    },
  ]);
  const script: Vdf = [
    ['AppID', build.appId],
    ['Desc', build.desc],
    ...(build.preview === true ? [['Preview', '1'] as [string, string]] : []),
    ['ContentRoot', build.contentRoot],
    ['BuildOutput', build.buildOutput],
    ['SetLive', build.branch],
    ['Depots', depots],
  ];
  return `${vdf('AppBuild', script)}\n`;
}
