import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { creditsMarkdown } from '@bollfort/config';

import { audioManifest } from './styles/data.js';

/**
 * `npm run credits`: writes `CREDITS.md` at the repository root from the audio manifest and
 * the tracks the styles bring themselves (`styles/data.ts`), which is why it is the client's.
 */
const target = fileURLToPath(new URL('../../../CREDITS.md', import.meta.url));
writeFileSync(target, creditsMarkdown(audioManifest));
process.stdout.write(`wrote ${target}\n`);
