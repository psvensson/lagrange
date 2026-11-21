import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {readManagedOriginals} from '../../scripts/quest-evidence/strict-operation-outcomes-managed-custody.js';

const ADAPTER = fileURLToPath(new URL(
  '../../scripts/quest-evidence/strict-operation-outcomes.js', import.meta.url));
const MANAGED = '--managed-evidence-dir';
const RED = '--evidence-dir';
const HISTORICAL = '--historical-evidence-dir';
const OUTPUT = '--output';
const CLASSIFIED = '--classified-evidence-dir';
const CLASSIFIED_INPUT = '--classified-review-input';
const ROOT = path.resolve(path.dirname(ADAPTER), '../..');
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


function writeOriginal(directory, name, value) {
  const bytes = JSON.stringify(value) + '\n';
  fs.writeFileSync(path.join(directory, name), bytes);
  return createHash('sha256').update(bytes).digest('hex');
}

function currentGit(ref) {
  const result = spawnSync('git', ['rev-parse', ref], {encoding: 'utf8', cwd: ROOT});
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('classified validation refuses receipt-writing arguments without changing the receipt', (t) => {
  const {root, originals, output} = fixture(t);
  const input = path.join(root, 'review.json');
  const result = invoke(CLASSIFIED, originals, CLASSIFIED_INPUT, input, OUTPUT, output);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /accepts no receipt options/u);
  assert.equal(fs.readFileSync(output, 'utf8'), EXISTING_RECEIPT);
});

test('matching forged prepared bytes cannot bind a foreign Git tree', (t) => {
  const {root, originals, output} = fixture(t);
  const source = currentGit('HEAD');
  const tree = '0'.repeat(40);
  const ref = 'refs/heads/wip/classified-negative-control';
  const preparedManifestSha256 = writeOriginal(originals, 'prepared-manifest.json',
    {source, tree, ref});
  const input = path.join(root, 'review.json');
  writeOriginal(root, 'review.json', {source, tree, ref, preparedManifestSha256});
  const result = invoke(CLASSIFIED, originals, CLASSIFIED_INPUT, input);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /reviewed classified source tree differs/u);
  assert.equal(fs.readFileSync(output, 'utf8'), EXISTING_RECEIPT);
});

test('changed prepared bytes refuse even with the exact reviewed Git tree', (t) => {
  const {root, originals} = fixture(t);
  const source = currentGit('HEAD');
  const tree = currentGit('HEAD^{tree}');
  const ref = 'refs/heads/wip/classified-negative-control';
  const preparedManifestSha256 = writeOriginal(originals, 'prepared-manifest.json', {source, tree, ref});
  writeOriginal(root, 'review.json', {source, tree, ref, preparedManifestSha256});
  writeOriginal(originals, 'prepared-manifest.json', {source, tree, ref, fileCount: 85});
  const result = invoke(CLASSIFIED, originals, CLASSIFIED_INPUT, path.join(root, 'review.json'));
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /prepared-manifest\.json hash mismatch/u);
  assert.equal(result.stdout, '');
});

test('a verified inventory page with a continuation cannot stand for the final page', (t) => {
  const {originals} = fixture(t);
  const requestId = 'f28b2308-bade-4b2b-a2f4-18f988704b04';
  const host = 'adams-gamla';
  const anchors = {
    'manifest.json': writeOriginal(originals, 'manifest.json', {requestId, entries: []}),
    'artifacts-0.json': writeOriginal(originals, 'artifacts-0.json', {
      job_id: requestId, host, state: 'ARTIFACTS', names: ['page-boundary'], next_cursor: 'page-boundary',
    }),
  };
  assert.throws(() => readManagedOriginals(originals, {host, anchors, requestId}),
    /original artifact inventory incomplete/u);
});

test('COMPLETE originals must match the reviewed generation and record source execution', (t) => {
  const {originals} = fixture(t);
  const requestId = 'f28b2308-bade-4b2b-a2f4-18f988704b04';
  const host = 'adams-gamla';
  const generation = '168fc2e7-9758-4684-b861-85289329243c';
  const source = currentGit('HEAD');
  const ref = 'refs/heads/wip/classified-negative-control';
  const repo = 'psvensson/lagrange';
  const status = {job_id: requestId, host, generation, state: 'COMPLETE', exit_code: 0,
    execution_scope_closed: true, source_execution_started: true, workload_started: true,
    reason: null, source: {sha: source, ref, repo}};
  const anchors = {
    'manifest.json': writeOriginal(originals, 'manifest.json', {requestId, entries: []}),
    'artifacts-0.json': writeOriginal(originals, 'artifacts-0.json', {
      job_id: requestId, host, state: 'ARTIFACTS', names: ['runner.stdout'], next_cursor: null,
    }),
  };

  for (const departure of [{generation: requestId}, {source_execution_started: false}]) {
    anchors['status.json'] = writeOriginal(originals, 'status.json', {...status, ...departure});
    assert.throws(() => readManagedOriginals(originals, {host, requestId, generation, anchors,
      source, ref, repo, controllerState: 'COMPLETE', exitStatus: 0}),
    /controller did not complete the identified managed source execution/u);
  }
});
