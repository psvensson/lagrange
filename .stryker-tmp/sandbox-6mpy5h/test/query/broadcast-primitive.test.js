/**
 * Tests for broadcast primitive — ctx.broadcast(ref, dataset)
 * and ctx.useBroadcast(ref).
 *
 * Verifies version tagging, hard size caps, store operations,
 * and telemetry hooks.
 *
 * Requirements: 5.1, 5.4
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {
  validateBroadcastArgs,
  validateUseBroadcastArgs,
  estimateBroadcastBytes,
  BroadcastStore,
} from '../../src/query/broadcast-primitive.js';
import {
  BROADCAST_FIELD,
  PRIMITIVE_ERROR_MSG,
} from '../../src/query/distributed/distributed-context-constants.js';

// --- validateBroadcastArgs ---

test('validateBroadcastArgs - valid args', (t) => {
  const result = validateBroadcastArgs(
    'ref-1',
    {version: 1, rows: [{id: 1}]},
  );
  t.ok(result.valid);
  t.equal(result.error, null);
  t.end();
});

test('validateBroadcastArgs - missing ref', (t) => {
  const result = validateBroadcastArgs(
    null,
    {version: 1},
  );
  t.notOk(result.valid);
  t.equal(result.error, PRIMITIVE_ERROR_MSG.BROADCAST_REF_REQUIRED);
  t.end();
});

test('validateBroadcastArgs - ref not string', (t) => {
  const result = validateBroadcastArgs(
    123,
    {version: 1},
  );
  t.notOk(result.valid);
  t.equal(
    result.error,
    PRIMITIVE_ERROR_MSG.BROADCAST_REF_MUST_BE_STRING,
  );
  t.end();
});

test('validateBroadcastArgs - missing dataset', (t) => {
  const result = validateBroadcastArgs('ref-1', null);
  t.notOk(result.valid);
  t.equal(
    result.error,
    PRIMITIVE_ERROR_MSG.BROADCAST_PAYLOAD_REQUIRED,
  );
  t.end();
});

test('validateBroadcastArgs - missing version', (t) => {
  const result = validateBroadcastArgs(
    'ref-1',
    {rows: [{id: 1}]},
  );
  t.notOk(result.valid);
  t.equal(
    result.error,
    PRIMITIVE_ERROR_MSG.BROADCAST_VERSION_REQUIRED,
  );
  t.end();
});

test('validateBroadcastArgs - exceeds size cap', (t) => {
  const bigPayload = {
    version: 1,
    data: 'x'.repeat(300),
  };
  const result = validateBroadcastArgs(
    'ref-1',
    bigPayload,
    {BROADCAST_MAX_PAYLOAD_BYTES: 100},
  );
  t.notOk(result.valid);
  t.equal(
    result.error,
    PRIMITIVE_ERROR_MSG.BROADCAST_MAX_PAYLOAD_EXCEEDED,
  );
  t.end();
});

// --- validateUseBroadcastArgs ---

test('validateUseBroadcastArgs - valid ref', (t) => {
  const result = validateUseBroadcastArgs('ref-1');
  t.ok(result.valid);
  t.end();
});

test('validateUseBroadcastArgs - missing ref', (t) => {
  const result = validateUseBroadcastArgs(null);
  t.notOk(result.valid);
  t.equal(result.error, PRIMITIVE_ERROR_MSG.BROADCAST_REF_REQUIRED);
  t.end();
});

test('validateUseBroadcastArgs - ref not string', (t) => {
  const result = validateUseBroadcastArgs(42);
  t.notOk(result.valid);
  t.equal(
    result.error,
    PRIMITIVE_ERROR_MSG.BROADCAST_REF_MUST_BE_STRING,
  );
  t.end();
});

// --- estimateBroadcastBytes ---

test('estimateBroadcastBytes - estimates correctly', (t) => {
  const bytes = estimateBroadcastBytes({version: 1, data: 'abc'});
  t.ok(bytes > 0);
  t.end();
});

test('estimateBroadcastBytes - null returns zero', (t) => {
  t.equal(estimateBroadcastBytes(null), 0);
  t.end();
});

// --- BroadcastStore ---

test('BroadcastStore - broadcast and useBroadcast', (t) => {
  const store = new BroadcastStore();
  const dataset = {version: 1, rows: [{id: 1}]};

  const desc = store.broadcast('ref-1', dataset);
  t.equal(desc[BROADCAST_FIELD.REF], 'ref-1');
  t.equal(desc[BROADCAST_FIELD.VERSION], 1);
  t.ok(desc[BROADCAST_FIELD.BYTE_COUNT] > 0);

  const view = store.useBroadcast('ref-1');
  t.equal(view[BROADCAST_FIELD.REF], 'ref-1');
  t.equal(view[BROADCAST_FIELD.VERSION], 1);
  t.same(view[BROADCAST_FIELD.PAYLOAD], dataset);
  t.ok(view[BROADCAST_FIELD.BYTE_COUNT] > 0);
  t.end();
});

test('BroadcastStore - rejects oversized payload', (t) => {
  const store = new BroadcastStore({maxPayloadBytes: 50});
  const bigDataset = {version: 1, data: 'x'.repeat(200)};

  t.throws(
    () => store.broadcast('ref-1', bigDataset),
    {message: PRIMITIVE_ERROR_MSG.BROADCAST_MAX_PAYLOAD_EXCEEDED},
  );
  t.end();
});

test('BroadcastStore - rejects missing version', (t) => {
  const store = new BroadcastStore();

  t.throws(
    () => store.broadcast('ref-1', {rows: []}),
    {message: PRIMITIVE_ERROR_MSG.BROADCAST_VERSION_REQUIRED},
  );
  t.end();
});

test('BroadcastStore - useBroadcast ref not found', (t) => {
  const store = new BroadcastStore();

  t.throws(
    () => store.useBroadcast('missing-ref'),
    {message: PRIMITIVE_ERROR_MSG.BROADCAST_REF_NOT_FOUND},
  );
  t.end();
});

test('BroadcastStore - useBroadcast validates ref', (t) => {
  const store = new BroadcastStore();

  t.throws(
    () => store.useBroadcast(null),
    {message: PRIMITIVE_ERROR_MSG.BROADCAST_REF_REQUIRED},
  );
  t.end();
});

test('BroadcastStore - overwrites same ref', (t) => {
  const store = new BroadcastStore();
  store.broadcast('ref-1', {version: 1, data: 'old'});
  store.broadcast('ref-1', {version: 2, data: 'new'});

  const view = store.useBroadcast('ref-1');
  t.equal(view[BROADCAST_FIELD.VERSION], 2);
  t.equal(view[BROADCAST_FIELD.PAYLOAD].data, 'new');
  t.equal(store.size, 1);
  t.end();
});

test('BroadcastStore - has/delete/clear', (t) => {
  const store = new BroadcastStore();
  store.broadcast('ref-1', {version: 1, data: 'a'});
  store.broadcast('ref-2', {version: 1, data: 'b'});

  t.ok(store.has('ref-1'));
  t.equal(store.size, 2);

  t.ok(store.delete('ref-1'));
  t.notOk(store.has('ref-1'));
  t.equal(store.size, 1);

  store.clear();
  t.equal(store.size, 0);
  t.end();
});

test('BroadcastStore - calls telemetry on broadcast', (t) => {
  let telemetryData = null;
  const store = new BroadcastStore({
    onTelemetry: (data) => {
      telemetryData = data;
    },
  });

  store.broadcast('ref-1', {version: 3, rows: []});

  t.ok(telemetryData);
  t.equal(telemetryData.primitive, 'broadcast');
  t.equal(telemetryData.ref, 'ref-1');
  t.equal(telemetryData.version, 3);
  t.ok(telemetryData.byteCount > 0);
  t.ok(telemetryData.timestamp > 0);
  t.end();
});

test('BroadcastStore - calls telemetry on useBroadcast', (t) => {
  const calls = [];
  const store = new BroadcastStore({
    onTelemetry: (data) => {
      calls.push(data);
    },
  });

  store.broadcast('ref-1', {version: 1, rows: []});
  store.useBroadcast('ref-1');

  t.equal(calls.length, 2);
  t.equal(calls[1].primitive, 'useBroadcast');
  t.equal(calls[1].ref, 'ref-1');
  t.equal(calls[1].version, 1);
  t.end();
});
