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
  t.equal(getProbe('test-receipt').evidenceClass, 'deterministic');
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

tap.test('deterministic receipt identity ignores generation time, mtime, and storage path', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-receipt-identity-'));
  t.teardown(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = writeReceipt(dir, passingPayload());
  const spec = {
    probe: 'test-receipt',
    args: {file, requiredReceipts: REQUIRED},
  };
  const first = evaluate(spec, {root: dir});
  t.equal(first.evidenceIdentity.schemaVersion, 2);
  t.equal(first.evidenceIdentity.evidenceClass, 'deterministic');

  writeReceipt(dir, passingPayload('2026-08-29T11:00:00.000Z'));
  const later = new Date(Date.now() + 10_000);
  fs.utimesSync(file, later, later);
  const second = evaluate(spec, {root: dir});
  t.equal(second.evidenceFingerprint, first.evidenceFingerprint,
    'volatile receipt time and filesystem time do not create new proof meaning');
  t.not(second.evidenceIdentity.sha256, first.evidenceIdentity.sha256,
    'raw artifact identity remains available for forensic provenance');

  const copy = writeReceipt(dir, passingPayload('2026-08-29T12:00:00.000Z'),
    'receipt-copy.json');
  const copied = evaluate({
    probe: 'test-receipt',
    args: {file: copy, requiredReceipts: [...REQUIRED].reverse()},
  }, {root: dir});
  t.equal(copied.evidenceFingerprint, first.evidenceFingerprint,
    'the same deterministic proof bytes and semantic args are storage-path independent');
  t.equal(evidenceIdentityMatchesEvent(copied.evidenceIdentity, {
    evidenceFingerprint: first.evidenceFingerprint,
    evidenceIdentity: first.evidenceIdentity,
  }, {requireProbeSpec: true}), true,
  'declared-probe dedupe uses the semantic probe key rather than the storage path');

  const changed = passingPayload('2026-08-29T13:00:00.000Z');
  changed.receipts[1].passed = false;
  writeReceipt(dir, changed);
  const third = evaluate(spec, {root: dir});
  t.not(third.evidenceFingerprint, first.evidenceFingerprint,
    'a changed proof outcome changes semantic evidence identity');
  t.end();
});