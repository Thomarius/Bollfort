import { AUDIO_LICENCES, audioCredits, type AudioManifest, type CreditedFile } from './audio.js';

/**
 * Who made the game (the user's, 2026-11-22): the in-game Credits and `CREDITS.md` both read
 * these, and the `LICENSE`'s copyright line and the desktop app's `copyright` say the same.
 */
export const GAME_AUTHOR = 'Thomas Arnold';
/** The year of the first commit (2026-09-18), as the copyright notice gives it. */
export const COPYRIGHT_YEAR = 2026;
/**
 * The play-testers, by the nicknames they chose, in the order they joined; more to come (the
 * user's, 2026-11-22).
 */
export const PLAY_TESTERS: readonly string[] = ['Mausica', 'Xenon'];

/** Credits are free text: whatever Markdown would read as formatting is shown as itself. */
function plain(text: string): string {
  return text.replace(/[\\`*_[\]<>]/g, '\\$&');
}

function line({ path, credit }: CreditedFile): string {
  if (credit === null) return `- \`${path}\`: not yet credited`;
  const what = path.endsWith('/') ? `Every file in \`${path}\`` : `\`${path}\``;
  const title = credit.title === undefined ? '' : `“${plain(credit.title)}” `;
  const changes = credit.changes === undefined ? '' : ` Changes: ${plain(credit.changes)}`;
  return (
    `- ${what}: ${title}by ${plain(credit.author)}, ` +
    `[${credit.licence}](${AUDIO_LICENCES[credit.licence]}), from <${credit.source}>.${changes}`
  );
}

/**
 * `CREDITS.md`, the audio's authors and licences. The game's disclaimer is not in it: on a
 * lawyer's advice (2026-11-11) the original is named only in the in-game Credits
 * (`credits.disclaimer`) and the README — not in the menu, the desktop app's window, the release
 * notes nor this file.
 *
 * Made from the manifest by `npm run credits` and checked against it by a
 * test, so the file in the repository cannot fall behind the sounds the game plays.
 */
export function creditsMarkdown(audio: AudioManifest): string {
  const { music, sfx } = audioCredits(audio);
  return [
    '# Credits',
    '',
    `**Bollfort**, a game by ${GAME_AUTHOR}.`,
    '',
    `- Design and development: ${GAME_AUTHOR}`,
    `- Play-testing: ${PLAY_TESTERS.join(', ')}`,
    '',
    `© ${COPYRIGHT_YEAR} ${GAME_AUTHOR}. The code is under the MIT licence ([\`LICENSE\`](LICENSE)).`,
    '',
    '## Audio',
    '',
    'Made from `config/audio.manifest.json` and the credits the styles bring themselves',
    '(`packages/client/src/styles/`) by `npm run credits`: edit those, not this file.',
    '',
    '### Music',
    '',
    ...music.map(line),
    '',
    '### Sound effects',
    '',
    ...sfx.map(line),
    '',
  ].join('\n');
}
