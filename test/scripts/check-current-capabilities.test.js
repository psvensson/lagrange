import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {CHECKED_FILE_PATHS, checkCurrentCapabilities} from
  '../../scripts/check-current-capabilities.js';

import {generate, renderCurrentCapabilitiesDocument} from
  '../../scripts/generate-current-capabilities-doc.js';

const TEMP_PREFIX = 'current-capabilities-';
const FIXTURE_PATHS = CHECKED_FILE_PATHS;

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

test('current capabilities detect drift in both raft-rs source owners', () => {
  const driftCases = [
    ['src/partition/partition-service-core-base.js',
      'new RaftRsWasmProvider()'],
    ['src/partition/partition-snapshot-cadence.js',
      'RAFT_SNAPSHOT_CADENCE_OUTCOME.COMMITTED_LOG_UNSUPPORTED'],
  ];
  for (const [relativePath, marker] of driftCases) {
    const fixtureRoot = createFixture();
    try {
      const sourcePath = path.join(fixtureRoot, relativePath);
      const source = fs.readFileSync(sourcePath, 'utf8');
      assert.ok(source.includes(marker), `missing source marker: ${relativePath}`);
      fs.writeFileSync(
        sourcePath, source.replace(marker, '__test_owner_drift__'), 'utf8',
      );
      const result = checkCurrentCapabilities(fixtureRoot);
      assert.equal(result.valid, false, relativePath);
      assert.match(result.problems.join('\n'),
        /replication capability fields contradict the active snapshot path/u);
    } finally {
      fs.rmSync(fixtureRoot, {recursive: true, force: true});
    }
  }
});

test('generated public service status exposes one runtime-neutral API', () => {
  const document = generate();
  assert.match(
    document, /Managed WASM execution: \*\*Genuine WASI component Cell\*\*/u,
  );
  assert.match(document, /one service API across execution providers/iu);
  assert.match(document, /Execution provider/iu);
  assert.doesNotMatch(document, /native_js|JavaScript-envelope|legacy callback/iu);
});

test('managed WASM summary follows the portability status', () => {
  const capabilities = JSON.parse(fs.readFileSync(
    'docs/current-capabilities.json', 'utf8',
  ));
  const portability = JSON.parse(fs.readFileSync(
    'docs/service-portability-capabilities.json', 'utf8',
  ));
  portability.runtimes.wasm_component.managedExecution = 'unsupported';
  const document = renderCurrentCapabilitiesDocument(capabilities, portability);
  assert.match(document, /Managed WASM execution: \*\*Unsupported\*\*/u);
  assert.doesNotMatch(document, /Managed WASM execution: \*\*Genuine/u);
});
