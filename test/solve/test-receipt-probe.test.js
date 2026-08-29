import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import tap from 'tap';

import {
  evidenceIdentityMatchesEvent,
} from '../../scripts/solve/evidence-identity.js';
import {testReceiptProbe} from '../../scripts/solve/probes/test-receipt.js';
import {evaluate, getProbe} from '../../scripts/solve/probe.js';

const REQUIRED = ['receipt-a', 'receipt-b'];

function writeReceipt(dir, payload, name = 'receipt.json') {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(payload));
  return file;
}

function receiptFile(t, payload) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-receipt-'));
  t.teardown(() => fs.rmSync(dir, {recursive: true, force: true}));
  return writeReceipt(dir, payload);
}

function passingPayload(generatedAt = '2026-08-29T10:00:00.000Z') {
  return {
    schema: 'test-receipt/1',
    quest: 'identity-test',
    status: 'pass',
    generatedAt,
    receipts: [
      {id: 'receipt-a', passed: true, command: 'npm run test:file -- a.js'},
      {id: 'receipt-b', passed: true, command: 'npm run test:file -- b.js'},
    ],
  };
}

tap.test('test-receipt probe is registered under its canonical name', (t) => {
  t.equal(getProbe('test-receipt').name, 'test-receipt');
  t.equal(getProbe('test-receipt').evidenceClass, 'live',
    'v1 receipts stay freshness-sensitive until they bind candidate/proof inputs');
  t.end();
});

tap.test('a missing receipt file is a non-measuring sample', (t) => {
  const result = testReceiptProbe.measure({
    file: path.join(os.tmpdir(), 'definitely-absent-receipt.json'),
    requiredReceipts: REQUIRED,
  });
  t.equal(result.metric, null);
  t.equal(result.done, false);
  t.equal(result.invalidSample, true);
  t.end();
});

tap.test('a malformed or command-less receipt file is non-measuring', (t) => {
  const wrongSchema = testReceiptProbe.measure({
    file: receiptFile(t, {schema: 'other/9', receipts: []}),
    requiredReceipts: REQUIRED,
  });
  t.equal(wrongSchema.invalidSample, true, 'wrong schema is invalid');

  const noReceipts = testReceiptProbe.measure({
    file: receiptFile(t, {schema: 'test-receipt/1', receipts: []}),
    requiredReceipts: REQUIRED,
  });
  t.equal(noReceipts.invalidSample, true, 'empty receipts is invalid');

  const commandless = testReceiptProbe.measure({
    file: receiptFile(t, {
      schema: 'test-receipt/1',
      status: 'pass',
      receipts: [{id: 'receipt-a', passed: true}],
    }),
    requiredReceipts: REQUIRED,
  });
  t.equal(
    commandless.invalidSample,
    true,
    'a receipt without its producing command never measures',
  );
  t.end();
});

tap.test('metric counts required receipts that are missing or failing',
  (t) => {
    const file = receiptFile(t, {
      schema: 'test-receipt/1',
      status: 'fail',
      receipts: [
        {id: 'receipt-a', passed: true, command: 'npm run test:file -- a.js'},
        {id: 'receipt-b', passed: false, command: 'npm run test:file -- b.js'},
      ],
    });
    const result = testReceiptProbe.measure({
      file,
      requiredReceipts: REQUIRED,
    });
    t.equal(result.metric, 1, 'one outstanding required receipt');
    t.equal(result.done, false, 'status fail keeps done false');
    t.equal(result.invalidSample, false);
    t.same(result.satisfiedInvariants, ['receipt-a']);
    t.end();
  });

tap.test('done requires zero outstanding and a passing status', (t) => {
  const file = receiptFile(t, {
    schema: 'test-receipt/1',
    status: 'pass',
    receipts: [
      {id: 'receipt-a', passed: true, command: 'npm run test:file -- a.js'},
      {id: 'receipt-b', passed: true, command: 'npm run test:file -- b.js'},
      {id: 'receipt-extra', passed: false, command: 'npm run x'},
    ],
  });
  const result = testReceiptProbe.measure({
    file,
    requiredReceipts: REQUIRED,
  });
  t.equal(result.metric, 0);
  t.equal(result.done, true, 'extra non-required receipts do not block done');
  t.same(
    result.satisfiedInvariants.sort(),
    ['receipt-a', 'receipt-b'],
    'only required receipts feed the satisfied-invariant ratchet',
  );
  t.end();
});

tap.test('unbound test-receipt v1 keeps timestamp and storage freshness', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-receipt-identity-'));
  t.teardown(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = writeReceipt(dir, passingPayload());
  const spec = {
    probe: 'test-receipt',
    args: {file, requiredReceipts: REQUIRED},
  };
  const first = evaluate(spec, {root: dir});
  t.equal(first.evidenceIdentity.schemaVersion, 2);
  t.equal(first.evidenceIdentity.evidenceClass, 'live');

  writeReceipt(dir, passingPayload('2026-08-29T11:00:00.000Z'));
  const second = evaluate(spec, {root: dir});
  t.not(second.evidenceFingerprint, first.evidenceFingerprint,
    'a new v1 receipt run remains fresh evidence until source/input binding exists');

  const copy = writeReceipt(dir, passingPayload('2026-08-29T11:00:00.000Z'),
    'receipt-copy.json');
  const copied = evaluate({
    probe: 'test-receipt',
    args: {file: copy, requiredReceipts: REQUIRED},
  }, {root: dir});
  t.not(copied.evidenceFingerprint, second.evidenceFingerprint,
    'legacy live receipt identity remains storage-path sensitive');
  t.end();
});

tap.test('deterministic evidence framework ignores storage time/path when probe owns semantics', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-evidence-identity-'));
  t.teardown(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = path.join(dir, 'oracle.json');
  fs.writeFileSync(file, JSON.stringify({metric: 0, target: 0}));
  const first = evaluate({probe: 'oracle', args: {file}}, {root: dir});
  t.equal(first.evidenceIdentity.evidenceClass, 'deterministic');

  const later = new Date(Date.now() + 10_000);
  fs.utimesSync(file, later, later);
  const touched = evaluate({probe: 'oracle', args: {file}}, {root: dir});
  t.equal(touched.evidenceFingerprint, first.evidenceFingerprint,
    'mtime alone does not create new deterministic proof meaning');

  const copy = path.join(dir, 'oracle-copy.json');
  fs.copyFileSync(file, copy);
  const copied = evaluate({probe: 'oracle', args: {file: copy}}, {root: dir});
  t.equal(copied.evidenceFingerprint, first.evidenceFingerprint,
    'probe-owned deterministic identity is storage-path independent');
  t.equal(evidenceIdentityMatchesEvent(copied.evidenceIdentity, {
    evidenceFingerprint: first.evidenceFingerprint,
    evidenceIdentity: first.evidenceIdentity,
  }, {requireProbeSpec: true}), true,
  'declared-probe dedupe compares the semantic probe key');

  fs.writeFileSync(file, JSON.stringify({metric: 1, target: 0}));
  const changed = evaluate({probe: 'oracle', args: {file}}, {root: dir});
  t.not(changed.evidenceFingerprint, first.evidenceFingerprint,
    'changed deterministic proof content changes identity');
  t.end();
});
