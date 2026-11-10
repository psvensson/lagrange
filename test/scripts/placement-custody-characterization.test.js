import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {createPlacementArtifactCustody} from '../../scripts/lab/placement-artifact-custody.js';

const BINDING = Object.freeze({candidate: 'a'.repeat(40), base: 'b'.repeat(40),
  run: 'characterization', host: 'fixture'});
const DECLARED = [{path: 'record.ndjson', required: true, maxBytes: 128}];
const BYTES = Buffer.from('exact\nrecord\u0000bytes\n');
const SUMMARY = {index: 0, path: 'record.ndjson', required: true, state: 'saved',
  bytes: BYTES.length, sha256: createHash('sha256').update(BYTES).digest('hex')};
const FILE_FRAME = {kind: 'file', binding: BINDING, ...SUMMARY, data: BYTES.toString('base64')};
const TERMINAL = {kind: 'terminal', binding: BINDING, index: 1,
  declared: DECLARED, files: [SUMMARY], state: 'complete', exitStatus: 7};
const NO_CUSTODY_FAILURES = Object.freeze([]);
const line = (frame) => `placement-artifact=${JSON.stringify(frame)}`;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'custody-characterization-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const directory = path.join(root, 'test-output/placement-artifacts/characterization-fixture');
  return {directory, custody: createPlacementArtifactCustody({root,
    artifacts: DECLARED, binding: BINDING})};
}

function envelope(directory, overrides = {}) {
  return {state: 'complete', binding: BINDING, directory, declared: DECLARED,
    files: [SUMMARY], reasons: NO_CUSTODY_FAILURES, exitStatus: 7, ...overrides};
}

function retained(directory) {
  return JSON.parse(fs.readFileSync(path.join(directory, 'custody.json'), 'utf8'));
}

test('custody returns and retains the complete envelope and exact bytes', (t) => {
  const {custody, directory} = fixture(t);
  assert.equal(custody.accept('ordinary test output'), false);
  assert.equal(custody.accept(line(FILE_FRAME)), true);
  assert.equal(custody.accept(line(TERMINAL)), true);
  const first = custody.finish();
  assert.deepEqual(first, envelope(directory));
  assert.deepEqual(retained(directory), first);
  assert.deepEqual(fs.readFileSync(path.join(directory, DECLARED[0].path)), BYTES);
  assert.deepEqual(custody.finish(), envelope(directory,
    {state: 'incomplete', reasons: ['destination-write-failed']}));
  assert.deepEqual(retained(directory), first, 'exclusive second write cannot replace evidence');
});

test('file and envelope exclusive-write failures retain ordered duplicate WRITE reasons', (t) => {
  const {custody, directory} = fixture(t);
  const file = path.join(directory, DECLARED[0].path);
  const receipt = path.join(directory, 'custody.json');
  fs.writeFileSync(file, 'original file');
  fs.writeFileSync(receipt, 'original receipt');
  custody.accept(line(FILE_FRAME));
  custody.accept(line(TERMINAL));
  assert.deepEqual(custody.finish('caller-failure'), envelope(directory,
    {state: 'incomplete', reasons: ['destination-write-failed', 'caller-failure',
      'destination-write-failed']}));
  assert.equal(fs.readFileSync(file, 'utf8'), 'original file');
  assert.equal(fs.readFileSync(receipt, 'utf8'), 'original receipt');
});

test('returned files remain a live reference while the retained receipt is a snapshot', (t) => {
  const {custody, directory} = fixture(t);
  const first = custody.finish();
  assert.deepEqual(first, envelope(directory, {state: 'incomplete', files: [],
    reasons: ['terminal-missing'], exitStatus: null}));
  custody.accept(line(FILE_FRAME));
  custody.accept(line(TERMINAL));
  assert.deepEqual(first.files, [SUMMARY]);
  assert.deepEqual(retained(directory).files, []);
  const second = custody.finish();
  assert.equal(second.files, first.files);
  assert.deepEqual(second, envelope(directory, {state: 'incomplete',
    reasons: ['terminal-missing', 'destination-write-failed']}));
});

test('identity, frame order and supplied failure reasons preserve first insertion order', (t) => {
  const {custody, directory} = fixture(t);
  custody.accept(line({...FILE_FRAME, binding: {...BINDING, host: 'other'}}));
  custody.accept(line(TERMINAL));
  custody.accept(line(FILE_FRAME));
  custody.accept(line(FILE_FRAME));
  custody.accept(line(TERMINAL));
  const expected = envelope(directory, {state: 'incomplete',
    reasons: ['invalid-identity', 'frame-order', 'caller-failure']});
  assert.deepEqual(custody.finish('caller-failure'), expected);
  assert.deepEqual(retained(directory), expected);
});
