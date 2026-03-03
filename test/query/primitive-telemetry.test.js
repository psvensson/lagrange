/**
 * Tests for per-primitive telemetry counters and trace hooks.
 *
 * Verifies request counting, byte tracking, latency stats,
 * trace hook invocation, and diagnostics snapshots.
 *
 * Requirements: 5.5, 10.2, 10.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  PrimitiveCounter,
  PrimitiveTelemetry,
  TELEMETRY_FIELD as TF,
  TELEMETRY_ERROR_MSG,
  VALID_PRIMITIVES,
} from '../../src/query/primitive-telemetry.js';
import {
  PRIMITIVE_TYPE,
} from '../../src/query/distributed/distributed-context-constants.js';

// --- PrimitiveCounter ---

test('PrimitiveCounter - starts at zero', (t) => {
  const counter = new PrimitiveCounter();
  const snap = counter.snapshot();
  t.equal(snap[TF.REQUEST_COUNT], 0);
  t.equal(snap[TF.TOTAL_BYTES], 0);
  t.equal(snap[TF.TOTAL_DURATION_MS], 0);
  t.equal(snap[TF.MIN_DURATION_MS], 0);
  t.equal(snap[TF.MAX_DURATION_MS], 0);
  t.end();
});

test('PrimitiveCounter - records single invocation', (t) => {
  const counter = new PrimitiveCounter();
  counter.record(100, 5);
  const snap = counter.snapshot();
  t.equal(snap[TF.REQUEST_COUNT], 1);
  t.equal(snap[TF.TOTAL_BYTES], 100);
  t.equal(snap[TF.TOTAL_DURATION_MS], 5);
  t.equal(snap[TF.MIN_DURATION_MS], 5);
  t.equal(snap[TF.MAX_DURATION_MS], 5);
  t.end();
});

test('PrimitiveCounter - accumulates multiple records', (t) => {
  const counter = new PrimitiveCounter();
  counter.record(50, 2);
  counter.record(150, 8);
  counter.record(100, 3);
  const snap = counter.snapshot();
  t.equal(snap[TF.REQUEST_COUNT], 3);
  t.equal(snap[TF.TOTAL_BYTES], 300);
  t.equal(snap[TF.TOTAL_DURATION_MS], 13);
  t.equal(snap[TF.MIN_DURATION_MS], 2);
  t.equal(snap[TF.MAX_DURATION_MS], 8);
  t.end();
});

test('PrimitiveCounter - snapshot is frozen', (t) => {
  const counter = new PrimitiveCounter();
  counter.record(10, 1);
  const snap = counter.snapshot();
  t.ok(Object.isFrozen(snap));
  t.end();
});

// --- PrimitiveTelemetry ---

test('PrimitiveTelemetry - requires queryId', (t) => {
  t.throws(
    () => new PrimitiveTelemetry({tenantId: 't1'}),
    {message: TELEMETRY_ERROR_MSG.QUERY_ID_REQUIRED},
  );
  t.end();
});

test('PrimitiveTelemetry - requires tenantId', (t) => {
  t.throws(
    () => new PrimitiveTelemetry({queryId: 'q1'}),
    {message: TELEMETRY_ERROR_MSG.TENANT_ID_REQUIRED},
  );
  t.end();
});

test('PrimitiveTelemetry - records lookup', (t) => {
  const tel = new PrimitiveTelemetry({
    queryId: 'q1',
    tenantId: 't1',
  });
  tel.record(PRIMITIVE_TYPE.LOOKUP, 200, 10);
  const snap = tel.getCounter(PRIMITIVE_TYPE.LOOKUP);
  t.equal(snap[TF.REQUEST_COUNT], 1);
  t.equal(snap[TF.TOTAL_BYTES], 200);
  t.equal(snap[TF.TOTAL_DURATION_MS], 10);
  t.end();
});

test('PrimitiveTelemetry - records emit', (t) => {
  const tel = new PrimitiveTelemetry({
    queryId: 'q1',
    tenantId: 't1',
  });
  tel.record(PRIMITIVE_TYPE.EMIT, 50, 2);
  tel.record(PRIMITIVE_TYPE.EMIT, 75, 3);
  const snap = tel.getCounter(PRIMITIVE_TYPE.EMIT);
  t.equal(snap[TF.REQUEST_COUNT], 2);
  t.equal(snap[TF.TOTAL_BYTES], 125);
  t.end();
});

test('PrimitiveTelemetry - records broadcast', (t) => {
  const tel = new PrimitiveTelemetry({
    queryId: 'q1',
    tenantId: 't1',
  });
  tel.record(PRIMITIVE_TYPE.BROADCAST, 1000, 15);
  const snap = tel.getCounter(PRIMITIVE_TYPE.BROADCAST);
  t.equal(snap[TF.REQUEST_COUNT], 1);
  t.equal(snap[TF.TOTAL_BYTES], 1000);
  t.end();
});

test('PrimitiveTelemetry - records useBroadcast', (t) => {
  const tel = new PrimitiveTelemetry({
    queryId: 'q1',
    tenantId: 't1',
  });
  tel.record(PRIMITIVE_TYPE.USE_BROADCAST, 500, 4);
  const snap = tel.getCounter(PRIMITIVE_TYPE.USE_BROADCAST);
  t.equal(snap[TF.REQUEST_COUNT], 1);
  t.equal(snap[TF.TOTAL_BYTES], 500);
  t.end();
});

test('PrimitiveTelemetry - rejects invalid primitive', (t) => {
  const tel = new PrimitiveTelemetry({
    queryId: 'q1',
    tenantId: 't1',
  });
  t.throws(
    () => tel.record('invalid_prim', 10, 1),
    {message: TELEMETRY_ERROR_MSG.INVALID_PRIMITIVE},
  );
  t.end();
});

test('PrimitiveTelemetry - rejects missing primitive', (t) => {
  const tel = new PrimitiveTelemetry({
    queryId: 'q1',
    tenantId: 't1',
  });
  t.throws(
    () => tel.record(null, 10, 1),
    {message: TELEMETRY_ERROR_MSG.PRIMITIVE_REQUIRED},
  );
  t.end();
});

test('PrimitiveTelemetry - getCounter rejects invalid', (t) => {
  const tel = new PrimitiveTelemetry({
    queryId: 'q1',
    tenantId: 't1',
  });
  t.throws(
    () => tel.getCounter('bad'),
    {message: TELEMETRY_ERROR_MSG.INVALID_PRIMITIVE},
  );
  t.end();
});

test('PrimitiveTelemetry - full snapshot', (t) => {
  const tel = new PrimitiveTelemetry({
    queryId: 'q1',
    tenantId: 't1',
  });
  tel.record(PRIMITIVE_TYPE.LOOKUP, 100, 5);
  tel.record(PRIMITIVE_TYPE.EMIT, 50, 2);

  const snap = tel.snapshot();
  t.equal(snap[TF.QUERY_ID], 'q1');
  t.equal(snap[TF.TENANT_ID], 't1');
  t.ok(snap.primitives);
  t.ok(snap.primitives[PRIMITIVE_TYPE.LOOKUP]);
  t.ok(snap.primitives[PRIMITIVE_TYPE.EMIT]);
  t.ok(snap.primitives[PRIMITIVE_TYPE.BROADCAST]);
  t.ok(snap.primitives[PRIMITIVE_TYPE.USE_BROADCAST]);
  t.equal(
    snap.primitives[PRIMITIVE_TYPE.LOOKUP][TF.REQUEST_COUNT],
    1,
  );
  t.equal(
    snap.primitives[PRIMITIVE_TYPE.EMIT][TF.REQUEST_COUNT],
    1,
  );
  t.equal(
    snap.primitives[PRIMITIVE_TYPE.BROADCAST][TF.REQUEST_COUNT],
    0,
  );
  t.ok(Object.isFrozen(snap));
  t.ok(Object.isFrozen(snap.primitives));
  t.end();
});

test('PrimitiveTelemetry - trace hook called', (t) => {
  const traces = [];
  const tel = new PrimitiveTelemetry({
    queryId: 'q1',
    tenantId: 't1',
    traceHook: (data) => traces.push(data),
  });

  tel.record(PRIMITIVE_TYPE.LOOKUP, 100, 5);
  tel.record(PRIMITIVE_TYPE.EMIT, 50, 2);

  t.equal(traces.length, 2);
  t.equal(traces[0].queryId, 'q1');
  t.equal(traces[0].tenantId, 't1');
  t.equal(traces[0].primitive, PRIMITIVE_TYPE.LOOKUP);
  t.equal(traces[0].bytes, 100);
  t.equal(traces[0].durationMs, 5);
  t.equal(traces[1].primitive, PRIMITIVE_TYPE.EMIT);
  t.end();
});

test('PrimitiveTelemetry - createCallback integration', (t) => {
  const tel = new PrimitiveTelemetry({
    queryId: 'q1',
    tenantId: 't1',
  });
  const cb = tel.createCallback();

  // Simulate lookup telemetry data
  cb({primitive: 'lookup', byteCount: 200, durationMs: 10});
  // Simulate emit telemetry data
  cb({primitive: 'emit', recordBytes: 50, durationMs: 2});
  // Simulate broadcast telemetry data (no durationMs)
  cb({primitive: 'broadcast', byteCount: 1000});

  const snap = tel.snapshot();
  t.equal(
    snap.primitives[PRIMITIVE_TYPE.LOOKUP][TF.REQUEST_COUNT],
    1,
  );
  t.equal(
    snap.primitives[PRIMITIVE_TYPE.LOOKUP][TF.TOTAL_BYTES],
    200,
  );
  t.equal(
    snap.primitives[PRIMITIVE_TYPE.EMIT][TF.REQUEST_COUNT],
    1,
  );
  t.equal(
    snap.primitives[PRIMITIVE_TYPE.EMIT][TF.TOTAL_BYTES],
    50,
  );
  t.equal(
    snap.primitives[PRIMITIVE_TYPE.BROADCAST][TF.REQUEST_COUNT],
    1,
  );
  t.equal(
    snap.primitives[PRIMITIVE_TYPE.BROADCAST][TF.TOTAL_BYTES],
    1000,
  );
  t.end();
});

test('VALID_PRIMITIVES - contains all four types', (t) => {
  t.equal(VALID_PRIMITIVES.size, 4);
  t.ok(VALID_PRIMITIVES.has(PRIMITIVE_TYPE.LOOKUP));
  t.ok(VALID_PRIMITIVES.has(PRIMITIVE_TYPE.EMIT));
  t.ok(VALID_PRIMITIVES.has(PRIMITIVE_TYPE.BROADCAST));
  t.ok(VALID_PRIMITIVES.has(PRIMITIVE_TYPE.USE_BROADCAST));
  t.end();
});
