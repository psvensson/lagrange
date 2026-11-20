import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

const ADAPTER = fileURLToPath(new URL(
  '../../scripts/quest-evidence/strict-operation-outcomes.js', import.meta.url));
const MANAGED = '--managed-evidence-dir';
const RED = '--evidence-dir';
const HISTORICAL = '--historical-evidence-dir';
const OUTPUT = '--output';
const EXISTING_RECEIPT = '{ "status": "pass", "receipts": [{ "passed": true }] }\n';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'strict-outcomes-proof-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const originals = path.join(root, 'originals');
  const output = path.join(root, 'receipt.json');
  fs.mkdirSync(originals);
  fs.writeFileSync(output, EXISTING_RECEIPT);
  return {root, originals, output};
}

function invoke(...args) {
  return spawnSync(process.execPath, [ADAPTER, ...args], {encoding: 'utf8'});
}

test('synthetic COMPLETE status cannot admit native evidence or preserve stale pass', (t) => {
  const {originals, output} = fixture(t);
  const status = path.join(originals, 'status.json');
  const synthetic = JSON.stringify({
    job_id: '2378f3a8-3dc2-4ddf-982b-d8d13b6efe3a',
    host: 'tv-dator', state: 'COMPLETE', exit_code: 0, workload_started: true,
    execution_scope_closed: true, source_execution_started: true,
  });
  fs.writeFileSync(status, synthetic);

  const result = invoke(MANAGED, originals, OUTPUT, output);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /status\.json hash mismatch/u);
  const receipt = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(receipt.status, 'unavailable');
  assert.deepEqual(receipt.receipts, []);
  assert.equal(fs.readFileSync(status, 'utf8'), synthetic);
});

test('a managed original symlink is refused before its hash can be trusted', (t) => {
  const {root, originals, output} = fixture(t);
  const substitute = path.join(root, 'substitute.json');
  fs.writeFileSync(substitute, '{}');
  fs.symlinkSync(substitute, path.join(originals, 'status.json'));

  const result = invoke(MANAGED, originals, OUTPUT, output);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /invalid original file: status\.json/u);
  assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).status, 'unavailable');
});

test('ambiguous evidence selection leaves the prior receipt alone', (t) => {
  const {originals, output} = fixture(t);
  const result = invoke(RED, originals, MANAGED, originals, OUTPUT, output);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /specify one of/u);
  assert.equal(fs.readFileSync(output, 'utf8'), EXISTING_RECEIPT);
});

test('a symlink cannot place derived output inside the retained originals', (t) => {
  const {root, originals} = fixture(t);
  const alias = path.join(root, 'alias');
  fs.symlinkSync(originals, alias);
  const result = invoke(MANAGED, originals, OUTPUT, path.join(alias, 'receipt.json'));
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /outside retained original evidence/u);
  assert.deepEqual(fs.readdirSync(originals), []);
});


test('historical originals can extend only the managed positive evidence', (t) => {
  const {originals, output} = fixture(t);
  const result = invoke(RED, originals, HISTORICAL, originals, OUTPUT, output);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /requires --managed-evidence-dir/u);
  assert.equal(fs.readFileSync(output, 'utf8'), EXISTING_RECEIPT);
});

test('derived output cannot replace any retained historical original', (t) => {
  const {root, originals} = fixture(t);
  const historical = path.join(root, 'historical');
  const alias = path.join(root, 'historical-alias');
  fs.mkdirSync(historical);
  fs.symlinkSync(historical, alias);
  const original = path.join(historical, 'manifest.json');
  fs.writeFileSync(original, '{}');
  const result = invoke(MANAGED, originals, HISTORICAL, alias, OUTPUT, original);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /outside retained original evidence/u);
  assert.equal(fs.readFileSync(original, 'utf8'), '{}');
});
