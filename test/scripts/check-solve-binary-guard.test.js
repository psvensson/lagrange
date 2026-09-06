/**
 * Solver evidence rule (solve-v2 phase 1): an archive or a file over 1 MB
 * under solve/ is refused at commit time with the evidence-store hint; the
 * single allowlisted text log and everything outside solve/ pass.
 */

import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {
  ALLOWLIST,
  MAX_BYTES,
  solveBinaryOffences,
} from '../../scripts/checks/check-solve-binary-guard.js';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function writeScratch(relative, bytes) {
  const absolute = path.join(REPO_ROOT, relative);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, Buffer.alloc(bytes, 120));
  return relative;
}

test('archives and files over 1 MB under solve/ are refused, nothing else is', () => {
  const big = writeScratch('solve/changes/scratch-guard/big.ndjson', MAX_BYTES + 1);
  const exact = writeScratch('solve/changes/scratch-guard/exact.ndjson', MAX_BYTES);
  const small = writeScratch('solve/changes/scratch-guard/small.json', 10);
  try {
    const offences = solveBinaryOffences([
      'solve/changes/scratch-guard/node-logs.tar.gz',
      'solve/report/x/run.tgz',
      big, exact, small,
      'src/big/but-outside-solve.tar.gz',
      ALLOWLIST[0],
      'solve/changes/scratch-guard/missing.tar.gz',
    ]);
    assert.deepEqual(offences, [
      {path: 'solve/changes/scratch-guard/node-logs.tar.gz', reason: 'archive'},
      {path: 'solve/report/x/run.tgz', reason: 'archive'},
      {path: big, reason: 'larger than 1 MB'},
      {path: 'solve/changes/scratch-guard/missing.tar.gz', reason: 'archive'},
    ]);
  } finally {
    fs.rmSync(path.join(REPO_ROOT, 'solve/changes/scratch-guard'),
      {recursive: true, force: true});
  }
});

test('the allowlist holds exactly the one pre-v2 text log', () => {
  assert.deepEqual([...ALLOWLIST],
    ['solve/log/rolling-restart-core-stability.ndjson']);
});
