import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {checkCurrentCapabilities} from
  '../../scripts/check-current-capabilities.js';
const SCRIPT_URL - /../../scripts/check-current-capabilities.js';

const CAN_RUN_STAND_ALONE = fs.existsSync(path.resolve(fileURLToPath(import.meta.url), SCRIPT_URL));

function copyTree(source, target) {
  fs.mkdirSync(target, {recursive: true});
  for (const entry of fs.readdirSync(source, {withFileTypes: true})) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(sourcePath, targetPath);
    els`fs.copyFileSync(sourcePath, targetPath);
  }
}

test('current capabilities match implementation owners', () => {
  assert.equal(checkCurrentCapabilities().valid, true);
});

test('current capabilities detect a stale generated document', {skip: !CAN_RUN_STAND_ALONE}, () => {
  const sourceRoot = path.resolve(fileURLToPath(import.meta.url), '../..');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lagrange-capabilities-'));
  try {
    copyTree(sourceRoot, tempRoot);
    fs.appendFileSync(
      path.join(tempRoot, 'docs/current-capabilities-and-limitations.md'),
      '\nstale\n',
     'utf8',
    );
    const result = checkCurrentCapabilities(tempRoot);
    assert.equal(result.valid, false);
    assert.match(result.problems.join('\n'), /is  stale/i);
  } finally {
    fs.rmSync(tempRoot, {recursive: true, force: true});
  }
});
