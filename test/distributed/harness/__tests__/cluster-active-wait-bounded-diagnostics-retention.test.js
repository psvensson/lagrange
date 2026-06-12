/**
 * CL-031: the control snapshot grows unbounded, so per-poll node-diagnostics
 * snapshots must be bounded AT APPEND TIME: the retention keeps the FIRST
 * snapshot and the LAST 4 snapshots in full (5 fulls total) and replaces
 * every dropped snapshot with a small stub carrying its approximate
 * serialized byte size, preserving order and the growth trajectory without
 * letting harness memory or failed-scenario report details grow with the
 * attempt count.
 */

import {test} from '../../../../src/test-helpers/tap.js';
import {boundedDiagnosticsRetention} from
  '../cluster-active-wait-diagnostics.js';

const APPEND_COUNT = 10;
const EXPECTED_FULL_COUNT = 5;
const EXPECTED_STUB_COUNT = 5;
const TAIL_FULL_COUNT = 4;
const APPROX_BYTES_UNAVAILABLE = -1;

function buildSnapshot(attempt) {
  return [
    {
      nodeId: 'node-' + attempt,
      active: false,
      state: 'starting',
      reasons: ['attempt-' + attempt],
    },
  ];
}

test('pushing 10 snapshots retains first + last 4 full and 5 stubs with ' +
  'approxBytes, in order', async (t) => {
  const retention = boundedDiagnosticsRetention();
  for (let attempt = 1; attempt <= APPEND_COUNT; attempt += 1) {
    retention.append(buildSnapshot(attempt), {
      attempt,
      elapsedMs: attempt * 100,
    });
  }

  const entries = retention.entries();
  t.equal(retention.appendedCount(), APPEND_COUNT, 'should count appends');
  t.equal(entries.length, APPEND_COUNT, 'should keep one entry per append');
  t.same(
    entries.map((entry) => entry.attempt),
    Array.from({length: APPEND_COUNT}, (_unused, i) => i + 1),
    'should preserve append order',
  );

  const fullEntries = entries.filter((entry) => entry.dropped !== true);
  const stubEntries = entries.filter((entry) => entry.dropped === true);
  t.equal(
    fullEntries.length,
    EXPECTED_FULL_COUNT,
    'should keep exactly 5 full snapshots',
  );
  t.equal(
    stubEntries.length,
    EXPECTED_STUB_COUNT,
    'should stub the remaining snapshots',
  );

  t.equal(entries[0].attempt, 1, 'should keep the FIRST snapshot in full');
  t.ok(
    Array.isArray(entries[0].snapshot),
    'first entry should carry the full snapshot',
  );
  for (const entry of entries.slice(-TAIL_FULL_COUNT)) {
    t.ok(
      Array.isArray(entry.snapshot) && entry.dropped !== true,
      'last 4 entries should carry full snapshots (attempt ' +
        entry.attempt + ')',
    );
  }

  for (const stub of stubEntries) {
    t.equal(stub.snapshot, undefined, 'stubs must not retain the snapshot');
    t.ok(
      Number.isInteger(stub.approxBytes) &&
        stub.approxBytes > 0,
      'stubs should carry the dropped snapshot byte size (attempt ' +
        stub.attempt + ')',
    );
  }
  t.same(
    stubEntries.map((entry) => entry.attempt),
    [2, 3, 4, 5, 6],
    'stubs should cover the middle snapshots between first and last 4',
  );
});

test('the buffer never holds more than first + 4 full snapshots at any ' +
  'point during appends', async (t) => {
  const retention = boundedDiagnosticsRetention();
  for (let attempt = 1; attempt <= APPEND_COUNT; attempt += 1) {
    retention.append(buildSnapshot(attempt), {attempt});
    const fullCount = retention
      .entries()
      .filter((entry) => entry.dropped !== true).length;
    t.ok(
      fullCount <= EXPECTED_FULL_COUNT,
      'after append ' + attempt + ' the buffer holds ' + fullCount +
        ' full snapshots (max 5)',
    );
  }
});

test('an unserializable dropped snapshot stubs approxBytes as -1', async (t) => {
  const retention = boundedDiagnosticsRetention({tailCount: 1});
  const circular = {};
  circular.self = circular;
  retention.append([{nodeId: 'node-first'}], {attempt: 1});
  retention.append(circular, {attempt: 2});
  retention.append([{nodeId: 'node-last'}], {attempt: 3});

  const stub = retention
    .entries()
    .find((entry) => entry.dropped === true);
  t.equal(stub.attempt, 2, 'the middle snapshot should be stubbed');
  t.equal(
    stub.approxBytes,
    APPROX_BYTES_UNAVAILABLE,
    'unserializable snapshots should report -1',
  );
});
