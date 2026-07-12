import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  MANAGED_MERGE_LOG_MSG,
} from '../../../../src/partition/partition-constants.js';
import {
  buildMergeWindows,
  buildPartitionRangeIndex,
  classifyProbeSamples,
  diffAcknowledgedLedgerAgainstScan,
  findPartitionIdForKey,
  parseLogLineTimestampMs,
  resolveParticipantsByWindow,
  resolveRetiredAndAddedPartitionIds,
  scanManagedMergeLifecycleEvents,
  selectEvenlySpacedProbeKeys,
  summarizeMergeLifecycle,
} from '../../scenarios/partition-merge-under-load-helpers.js';

function buildLogLine(timestampIso, message) {
  return JSON.stringify({
    timestamp: timestampIso,
    level: 'info',
    message,
  });
}

describe('partition-merge-under-load lifecycle log scanning', () => {
  it('matches the exact MANAGED_MERGE_LOG_MSG constants with timestamps', () => {
    const logText = [
      buildLogLine('2026-07-12T10:00:00.000Z', 'unrelated line'),
      buildLogLine(
        '2026-07-12T10:00:01.000Z',
        MANAGED_MERGE_LOG_MSG.MERGE_START,
      ),
      buildLogLine(
        '2026-07-12T10:00:02.000Z',
        MANAGED_MERGE_LOG_MSG.MERGE_PREPARED,
      ),
      buildLogLine(
        '2026-07-12T10:00:03.000Z',
        MANAGED_MERGE_LOG_MSG.CUTOVER_APPLIED,
      ),
      buildLogLine(
        '2026-07-12T10:00:04.000Z',
        MANAGED_MERGE_LOG_MSG.DISSOLUTION_DISPATCHED,
      ),
      buildLogLine(
        '2026-07-12T10:00:05.000Z',
        MANAGED_MERGE_LOG_MSG.TERMINAL_TRANSITION_CLEARED,
      ),
    ].join('\n');

    const events = scanManagedMergeLifecycleEvents(logText, 'node-1');
    assert.deepEqual(
      events.map((event) => event.key),
      [
        'MERGE_START',
        'MERGE_PREPARED',
        'CUTOVER_APPLIED',
        'DISSOLUTION_DISPATCHED',
        'TERMINAL_TRANSITION_CLEARED',
      ],
    );
    assert.ok(events.every((event) => event.nodeId === 'node-1'));
    assert.equal(
      events[0].timestampMs,
      Date.parse('2026-07-12T10:00:01.000Z'),
    );

    const summary = summarizeMergeLifecycle(events);
    assert.equal(summary.startedMergeCount, 1);
    assert.equal(summary.completedMergeCount, 1);
    assert.equal(summary.abortedMergeCount, 0);
    assert.equal(summary.failureEventCount, 0);
  });

  it('counts abort and failure events', () => {
    const logText = [
      buildLogLine(
        '2026-07-12T10:00:01.000Z',
        MANAGED_MERGE_LOG_MSG.MERGE_START,
      ),
      buildLogLine(
        '2026-07-12T10:00:02.000Z',
        MANAGED_MERGE_LOG_MSG.MERGE_ABORTED_ON_SOURCE_FAILURE,
      ),
    ].join('\n');
    const summary = summarizeMergeLifecycle(
      scanManagedMergeLifecycleEvents(logText, 'node-2'),
    );
    assert.equal(summary.abortedMergeCount, 1);
    assert.equal(summary.failureEventCount, 1);
    assert.equal(summary.completedMergeCount, 0);
  });

  it('parses timestamps from JSON fields and ISO prefixes', () => {
    assert.equal(
      parseLogLineTimestampMs(
        '{"timestamp":"2026-07-12T10:00:01.000Z","message":"x"}',
      ),
      Date.parse('2026-07-12T10:00:01.000Z'),
    );
    assert.equal(
      parseLogLineTimestampMs('2026-07-12T10:00:02.000Z stdout text'),
      Date.parse('2026-07-12T10:00:02.000Z'),
    );
    assert.equal(parseLogLineTimestampMs('no timestamp here'), null);
  });

  it('pairs merge windows from start and terminal-clear events', () => {
    const logText = [
      buildLogLine(
        '2026-07-12T10:00:01.000Z',
        MANAGED_MERGE_LOG_MSG.MERGE_START,
      ),
      buildLogLine(
        '2026-07-12T10:00:05.000Z',
        MANAGED_MERGE_LOG_MSG.TERMINAL_TRANSITION_CLEARED,
      ),
      buildLogLine(
        '2026-07-12T10:00:10.000Z',
        MANAGED_MERGE_LOG_MSG.MERGE_START,
      ),
      buildLogLine(
        '2026-07-12T10:00:20.000Z',
        MANAGED_MERGE_LOG_MSG.TERMINAL_TRANSITION_CLEARED,
      ),
    ].join('\n');
    const windows = buildMergeWindows(
      scanManagedMergeLifecycleEvents(logText, 'node-1'),
    );
    assert.equal(windows.length, 2);
    assert.equal(windows[0].startMs, Date.parse('2026-07-12T10:00:01.000Z'));
    assert.equal(windows[0].endMs, Date.parse('2026-07-12T10:00:05.000Z'));
    assert.equal(windows[1].startMs, Date.parse('2026-07-12T10:00:10.000Z'));
    assert.equal(windows[1].endMs, Date.parse('2026-07-12T10:00:20.000Z'));
  });
});

describe('partition-merge-under-load ledger diff', () => {
  it('reports zero missing when every acked id is scanned', () => {
    const diff = diffAcknowledgedLedgerAgainstScan(
      ['a', 'b', 'c', 'b'],
      new Set(['a', 'b', 'c', 'd']),
    );
    assert.equal(diff.ledgerCount, 3);
    assert.equal(diff.missingCount, 0);
    assert.deepEqual(diff.missingSample, []);
  });

  it('reports missing acked ids with a bounded sample', () => {
    const diff = diffAcknowledgedLedgerAgainstScan(
      ['a', 'b', 'c'],
      new Set(['b']),
    );
    assert.equal(diff.missingCount, 2);
    assert.deepEqual(diff.missingSample, ['a', 'c']);
  });
});

describe('partition-merge-under-load range mapping', () => {
  const rangeIndex = buildPartitionRangeIndex([
    {
      partition_id: 'p-mid',
      partition_key_start: 'g',
      partition_key_end: 'p',
      leader_node_id: 'node-2',
    },
    {
      partition_id: 'p-low',
      partition_key_start: null,
      partition_key_end: 'g',
      leader_node_id: 'node-1',
    },
    {
      partition_id: 'p-high',
      partition_key_start: 'p',
      partition_key_end: null,
      leader_node_id: 'node-3',
    },
  ]);

  it('sorts open-start ranges first and maps keys to partitions', () => {
    assert.deepEqual(
      rangeIndex.map((entry) => entry.partitionId),
      ['p-low', 'p-mid', 'p-high'],
    );
    assert.equal(findPartitionIdForKey(rangeIndex, 'a'), 'p-low');
    assert.equal(findPartitionIdForKey(rangeIndex, 'g'), 'p-mid');
    assert.equal(findPartitionIdForKey(rangeIndex, 'k'), 'p-mid');
    assert.equal(findPartitionIdForKey(rangeIndex, 'z'), 'p-high');
  });

  it('splits retired vs added partition ids', () => {
    const {retiredIds, addedIds} = resolveRetiredAndAddedPartitionIds(
      ['p-low', 'p-mid', 'p-high'],
      ['p-merged', 'p-high'],
    );
    assert.deepEqual(retiredIds, ['p-low', 'p-mid']);
    assert.deepEqual(addedIds, ['p-merged']);
  });

  it('classifies probe failures by merge window participation', () => {
    const mergeWindows = [{startMs: 1000, endMs: 2000}];
    const participantsByWindow = [['p-low', 'p-mid']];
    const classification = classifyProbeSamples({
      samples: [
        {key: 'a', tsMs: 1500, ok: true, errorMessage: null},
        {key: 'z', tsMs: 1500, ok: false, errorMessage: 'timeout'},
        {key: 'a', tsMs: 1500, ok: false, errorMessage: 'timeout'},
        {key: 'z', tsMs: 5000, ok: false, errorMessage: 'timeout'},
      ],
      rangeIndex,
      mergeWindows,
      participantsByWindow,
    });
    assert.equal(classification.sampleCount, 4);
    assert.equal(classification.successCount, 1);
    assert.equal(classification.failureCount, 3);
    assert.equal(classification.siblingFailures.length, 1);
    assert.equal(classification.siblingFailures[0].partitionId, 'p-high');
    assert.equal(classification.participantFailures.length, 1);
    assert.equal(classification.participantFailures[0].partitionId, 'p-low');
    assert.equal(classification.outsideWindowFailures.length, 1);
  });

  it('resolves window participants from transition observations', () => {
    const participants = resolveParticipantsByWindow(
      [{startMs: 1000, endMs: 2000}, {startMs: 3000, endMs: 4000}],
      [
        {
          tsMs: 1500,
          sourcePartitionIds: ['p-low', 'p-mid'],
          targetPartitionIds: ['p-merged'],
        },
      ],
      ['fallback-a', 'fallback-b'],
    );
    assert.deepEqual(participants[0], ['p-low', 'p-merged', 'p-mid']);
    assert.deepEqual(participants[1], ['fallback-a', 'fallback-b']);
  });
});

describe('partition-merge-under-load probe key selection', () => {
  it('returns all ids when fewer than requested', () => {
    assert.deepEqual(
      selectEvenlySpacedProbeKeys(['b', 'a'], 5),
      ['a', 'b'],
    );
  });

  it('picks evenly spaced unique keys from a larger id set', () => {
    const ids = [];
    for (let index = 0; index < 100; index += 1) {
      ids.push('id-' + String(index).padStart(3, '0'));
    }
    const keys = selectEvenlySpacedProbeKeys(ids, 5);
    assert.equal(keys.length, 5);
    assert.equal(keys[0], 'id-000');
    assert.equal(keys[keys.length - 1], 'id-099');
    assert.equal(new Set(keys).size, keys.length);
  });
});
