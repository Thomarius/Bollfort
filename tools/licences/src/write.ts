// `npm run licences`: writes THIRD_PARTY_LICENSES.md at the repository root from the builds.
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { noticesMarkdown, REPO, shippedPackages } from './licences.js';

const target = path.join(REPO, 'THIRD_PARTY_LICENSES.md');
const packages = await shippedPackages();
writeFileSync(target, noticesMarkdown(packages));
process.stdout.write(`wrote ${target}: ${packages.length} packages\n`);
