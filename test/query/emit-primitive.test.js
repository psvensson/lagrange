/**
 * Tests for emit primitive — ctx.emit(key, value).
 *
 * Verifies shuffle buffer, backpressure, spill-to-disk,
 * and budget enforcement.
 *
 * Requirements: 5.1, 5.3, 9.1
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  validateEmitArgs,
  computeEmitRecordBytes,
  ShuffleBuffer,
} from '../../src/query/emit-primitive.js';
import {
  EMIT_FIELD,
  EMIT_QUEUE_STATE,
  PRIMITIVE_ERROR_MSG,
} from '../../src/query/distributed/distributed-context-constants.js';

// --- validateEmitArgs ---

test('validateEmitArgs - valid string key + Uint8Array', (t) => {
  const result = validateEmitArgs(
    'partition-key',
    new Uint8Array([1, 2, 3]),
  );
  t.ok(result.valid);
  t.equal(result.error, null);
  t.end();
});

test('validateEmitArgs - valid Uint8Array key', (t) => {
  const result = validateEmitArgs(
    new Uint8Array([1]),
    new Uint8Array([2]),
  );
  t.ok(result.valid);
  t.end();
});

test('validateEmitArgs - null key rejected', (t) => {
  const result = validateEmitArgs(
    null,
    new Uint8Array([1]),
  );
  t.notOk(result.valid);
  t.equal(result.error, PRIMITIVE_ERROR_MSG.EMIT_KEY_REQUIRED);
  t.end();
});

test('validateEmitArgs - numeric key rejected', (t) => {
  const result = validateEmitArgs(123, new Uint8Array([1]));
  t.notOk(result.valid);
  t.equal(result.error, PRIMITIVE_ERROR_MSG.EMIT_KEY_REQUIRED);
  t.end();
});

test('validateEmitArgs - null value rejected', (t) => {
  const result = validateEmitArgs('key', null);
  t.notOk(result.valid);
  t.equal(result.error, PRIMITIVE_ERROR_MSG.EMIT_VALUE_REQUIRED);
  t.end();
});

test('validateEmitArgs - non-Uint8Array value rejected', (t) => {
  const result = validateEmitArgs('key', 'string-value');
  t.notOk(result.valid);
  t.equal(
    result.error,
    PRIMITIVE_ERROR_MSG.EMIT_VALUE_MUST_BE_UINT8ARRAY,
  );
  t.end();
});

// --- computeEmitRecordBytes ---

test('computeEmitRecordBytes - string key', (t) => {
  const bytes = computeEmitRecordBytes(
    'abc',
    new Uint8Array([1, 2, 3, 4]),
  );
  t.equal(bytes, 7); // 3 + 4
  t.end();
});

test('computeEmitRecordBytes - Uint8Array key', (t) => {
  const bytes = computeEmitRecordBytes(
    new Uint8Array([1, 2]),
    new Uint8Array([3, 4, 5]),
  );
  t.equal(bytes, 5); // 2 + 3
  t.end();
});

// --- ShuffleBuffer ---

test('ShuffleBuffer - emits and tracks bytes', async (t) => {
  const buf = new ShuffleBuffer({maxBytes: 1000});
  const result = await buf.emit('k1', new Uint8Array([1, 2, 3]));

  t.equal(result[EMIT_FIELD.BYTE_COUNT], 5); // 2 + 3
  t.equal(result[EMIT_FIELD.QUEUE_SIZE], 1);
  t.notOk(result[EMIT_FIELD.SPILLED]);
  t.notOk(result[EMIT_FIELD.BACKPRESSURE]);
  t.equal(buf.totalBytes, 5);
  t.equal(buf.totalRecords, 1);
  t.end();
});

test('ShuffleBuffer - rejects after budget exceeded', async (t) => {
  const buf = new ShuffleBuffer({maxBytes: 10});
  await buf.emit('k', new Uint8Array([1, 2, 3])); // 4 bytes

  await t.rejects(
    buf.emit('k', new Uint8Array(new Array(20).fill(0))),
    {message: PRIMITIVE_ERROR_MSG.EMIT_MAX_BYTES_EXCEEDED},
  );
  t.equal(buf.state, EMIT_QUEUE_STATE.CLOSED);
  t.end();
});

test('ShuffleBuffer - rejects emit after close', async (t) => {
  const buf = new ShuffleBuffer();
  buf.close();

  await t.rejects(
    buf.emit('k', new Uint8Array([1])),
    {message: PRIMITIVE_ERROR_MSG.EMIT_QUEUE_CLOSED},
  );
  t.end();
});

test('ShuffleBuffer - triggers backpressure at high water', async (t) => {
  const buf = new ShuffleBuffer({
    maxBytes: 100000,
    highWaterMark: 2,
  });

  await buf.emit('k1', new Uint8Array([1]));
  t.equal(buf.state, EMIT_QUEUE_STATE.ACCEPTING);

  const result = await buf.emit('k2', new Uint8Array([2]));
  t.ok(result[EMIT_FIELD.BACKPRESSURE]);
  t.equal(buf.state, EMIT_QUEUE_STATE.BACKPRESSURE);
  t.end();
});

test('ShuffleBuffer - spills when threshold reached', async (t) => {
  const spilled = [];
  const buf = new ShuffleBuffer({
    maxBytes: 100000,
    spillThresholdBytes: 5,
    onSpill: async (records) => {
      spilled.push(...records);
    },
  });

  await buf.emit('k1', new Uint8Array([1, 2])); // 4 bytes
  t.equal(spilled.length, 0);

  await buf.emit('k2', new Uint8Array([3, 4])); // 4 more = 8 total
  t.ok(spilled.length > 0);
  t.equal(buf.spillCount, 1);
  t.equal(buf.records.length, 0); // buffer cleared after spill
  t.end();
});

test('ShuffleBuffer - drain returns buffered records', async (t) => {
  const buf = new ShuffleBuffer({maxBytes: 1000});
  await buf.emit('k1', new Uint8Array([1]));
  await buf.emit('k2', new Uint8Array([2]));

  const drained = buf.drain();
  t.equal(drained.length, 2);
  t.equal(buf.records.length, 0);
  t.end();
});

test('ShuffleBuffer - close returns summary', async (t) => {
  const buf = new ShuffleBuffer({maxBytes: 1000});
  await buf.emit('k1', new Uint8Array([1, 2]));

  const summary = buf.close();
  t.equal(summary.totalBytes, 4); // 2 + 2
  t.equal(summary.totalRecords, 1);
  t.equal(summary.spillCount, 0);
  t.equal(summary.state, EMIT_QUEUE_STATE.CLOSED);
  t.end();
});

test('ShuffleBuffer - calls telemetry callback', async (t) => {
  let telemetryData = null;
  const buf = new ShuffleBuffer({
    maxBytes: 1000,
    onTelemetry: (data) => {
      telemetryData = data;
    },
  });

  await buf.emit('k1', new Uint8Array([1, 2, 3]));

  t.ok(telemetryData);
  t.equal(telemetryData.primitive, 'emit');
  t.equal(telemetryData.recordBytes, 5);
  t.equal(telemetryData.totalBytes, 5);
  t.equal(telemetryData.totalRecords, 1);
  t.equal(telemetryData.queueSize, 1);
  t.equal(telemetryData.state, EMIT_QUEUE_STATE.ACCEPTING);
  t.end();
});

test('ShuffleBuffer - validates emit args', async (t) => {
  const buf = new ShuffleBuffer();

  await t.rejects(
    buf.emit(null, new Uint8Array([1])),
    {message: PRIMITIVE_ERROR_MSG.EMIT_KEY_REQUIRED},
  );
  await t.rejects(
    buf.emit('k', null),
    {message: PRIMITIVE_ERROR_MSG.EMIT_VALUE_REQUIRED},
  );
  t.end();
});
