/**
 * The desktop app's entry: the launcher (`main.ts`, the GitHub builds) or the Steam build
 * (`steamMain.ts`, STEAM.md §3.5), chosen when it is built (`BOLLFORT_STEAM=1` in `build.js`).
 * The other is left out of the bundle, so a GitHub build never loads `steamworks.js`.
 */
declare const __BOLLFORT_STEAM__: boolean;

if (__BOLLFORT_STEAM__) await import('./steamMain.js');
else await import('./main.js');
