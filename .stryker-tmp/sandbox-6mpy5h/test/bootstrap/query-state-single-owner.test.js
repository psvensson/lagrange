/**
 * Architecture guard: query-state logic must have one runtime owner.
 */
// @ts-nocheck


import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {test} from '../../src/test-helpers/tap.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '../..');

test('Node join query-state has a single runtime owner', async (t) => {
  const nodeJoiningPath = path.join(
    repoRoot,
    'src/bootstrap/node-joining-service.js',
  );
  const legacyPhasePath = path.join(
    repoRoot,
    'src/bootstrap/phases/query-state-phase.js',
  );

  const nodeJoiningSource = fs.readFileSync(nodeJoiningPath, 'utf8');
  t.match(
    nodeJoiningSource,
    /phaseQuerySystemState\s*\(/,
    'NodeJoiningService should own query-state execution',
  );

  t.equal(
    fs.existsSync(legacyPhasePath),
    false,
    'legacy QueryStatePhase duplicate path must be removed',
  );
});
