import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {checkCurrentCapabilities} from
  '../../scripts/check-current-capabilities.js';

const TEMP_PREFIX = 'current-capabilities-';
const FIXTURE_PATHS = Object.freeze([
  'architecture/process-partitioning.md',
  'architecture/process-replication.md',
  'charts/lagrange-node/values.yaml',
  'docs/current-capabilities-and-limitations.md',
  'docs/current-capabilities.json',
  'docs/service-portability-capabilities.json',
  'src/transport/router-server-manager.js',
  'src/service/request-cell-http-authenticator.js',
]);

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  for (const relativePath of FIXTURE_PATHS) {
    const destination = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.copyFileSync(path.join(process.cwd(), relativePath), destination);
  }
  return root;
}

test('current capabilities match implementation owners', () => {
  assert.equal(checkCurrentCapabilities().valid, true);
});

test('current capabilities detect a stale generated document', () => {
  const fixtureRoot = createFixture();
  try {
    fs.appendFileSync(
      path.join(fixtureRoot, 'docs/current-capabilities-and-limitations.md'),
      '\nstale\n',
      'utf8',
    );
    const result = checkCurrentCapabilities(fixtureRoot);
    assert.equal(result.valid, false);
    assert.match(result.problems.join('\n'), /stale/iu);
  } finally {
    fs.rmSync(fixtureRoot, {recursive: true, force: true});
  }
});
