/**
 * Partition HLC cross-leader / cross-restart monotonicity.
 *
 * Quest: hlc-cross-leader-monotonicity.
 *  - Fix 1 (merge-on-apply): applyCommittedEntry advances the applying replica's
 *    HLC to >= the committed entry's HLC, so a new leader's next write exceeds the
 *    last entry it applied (cross-leader monotonicity).
 *  - Fix 2 (restart high-water-mark): on init the clock is warmed from the max
 *    committed HLC on the durable log, so a restarted node never emits an HLC
 *    below one it previously committed.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';

const SCHEMA = {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]};

function buildPartition(overrides = {}) {
  return new PartitionService({
    partitionId: 'hlc-mono-partition',
    tableId: 't',
    tableName: 't',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema: SCHEMA,
    deferElection: true,
    dbPath: ':memory:',
    ...overrides,
  });
}

test('Fix 1: applyCommittedEntry witnesses a remote HLC so the next local ' +
  'timestamp exceeds it (cross-leader monotonicity)', async (t) => {
  const partition = buildPartition();
  await partition.initialize();

  // A remote leader's write stamped with an HLC far ahead of this node's wall
  // clock — the exact skew case that previously let a new leader regress.
  const remote = `${Date.now() + 1_000_000}-7-remote-node`;
  const remoteTs = HLCTimestamp.fromString(remote);

  partition.applyCommittedEntry({
    entryId: 'e-remote',
    type: 'INSERT',
    sql: 'INSERT INTO t (id) VALUES (?)',
    params: ['a'],
    timestamp: remote,
  });

  const next = partition.hlcClock.now();
  t.ok(next.compare(remoteTs) > 0,
    'local now() after witnessing must be strictly greater than the remote HLC');

  await partition.shutdown();
});

test('Fix 1: a missing/unparseable timestamp is skipped, never fatal',
  async (t) => {
    const partition = buildPartition();
    await partition.initialize();

    const before = partition.hlcClock.current();
    t.doesNotThrow(() => {
      partition.applyCommittedEntry({
        entryId: 'e-no-ts',
        type: 'INSERT',
        sql: 'INSERT INTO t (id) VALUES (?)',
        params: ['b'],
        // no timestamp field
      });
    }, 'applying an entry without an HLC must not throw');

    const after = partition.hlcClock.now();
    t.ok(after.compare(before) >= 0, 'clock must not regress');

    await partition.shutdown();
  });

test('Fix 2: restart warms the HLC from the max committed log entry',
  async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hlc-mono-'));
    const dbPath = path.join(dir, 'replica-1.db');
    const highHlc = `${Date.now() + 1_000_000}-3-remote-node`;

    try {
      const first = buildPartition({dbPath});
      await first.initialize();

      // Persist a committed log entry carrying a far-future HLC, as if applied
      // before a crash, then shut down (durable file survives).
      first.logAdapter.put({
        index: 1,
        term: 1,
        committed: true,
        responses: [],
        command: {
          entryId: 'e-committed',
          type: 'INSERT',
          sql: 'INSERT INTO t (id) VALUES (?)',
          params: ['x'],
          timestamp: highHlc,
        },
      });
      first.logAdapter.setCommittedIndex(1);
      await first.shutdown();

      // Restart on the same durable DB: a fresh HLC clock seeded from wall time
      // would be ~16 minutes behind highHlc; the warm must lift it above.
      const restarted = buildPartition({dbPath});
      await restarted.initialize();

      const next = restarted.hlcClock.now();
      t.ok(next.compare(HLCTimestamp.fromString(highHlc)) > 0,
        'restarted now() must exceed the max committed HLC on the log');

      await restarted.shutdown();
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
