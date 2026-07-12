/**
 * Pure helpers for the partition-merge-under-load scenario.
 *
 * Covers managed-merge lifecycle log scanning (against the exact
 * MANAGED_MERGE_LOG_MSG constants the workflow emits), acknowledged-write
 * ledger diffing, partition key-range mapping, and sibling-routability
 * probe classification. Everything here is side-effect free so the
 * scenario's binding predicates stay unit-testable without a cluster.
 */

import {
  MANAGED_MERGE_LOG_MSG,
} from '../../../src/partition/partition-constants.js';

const ZERO = 0;
const ONE = 1;
const MAX_MATCHED_LINE_LENGTH = 400;
const MAX_MISSING_ID_SAMPLE = 20;
const TIMESTAMP_FIELD_PATTERN = /"timestamp"\s*:\s*"([^"]+)"/;
const ISO_TIMESTAMP_PREFIX_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/;

/**
 * Lifecycle keys of MANAGED_MERGE_LOG_MSG the scenario scans for. The
 * order mirrors the workflow's happy-path progression; failure/abort keys
 * follow it.
 */
const MERGE_LIFECYCLE_EVENT_KEYS = Object.freeze([
  'MERGE_START',
  'MERGE_PREPARED',
  'CUTOVER_AWAITING_SOURCES',
  'CUTOVER_APPLIED',
  'DISSOLUTION_DISPATCHED',
  'DISSOLUTION_FAILED',
  'MERGE_ABORTED_ON_SOURCE_FAILURE',
  'POST_CUTOVER_SOURCE_FAILURE_RECORDED',
  'EXECUTION_FAILURE_PERSISTED',
  'TERMINAL_TRANSITION_CLEARED',
]);

const MERGE_FAILURE_EVENT_KEYS = Object.freeze([
  'DISSOLUTION_FAILED',
  'MERGE_ABORTED_ON_SOURCE_FAILURE',
  'EXECUTION_FAILURE_PERSISTED',
]);

const PROBE_FAILURE_CLASS = Object.freeze({
  SIBLING: 'sibling',
  PARTICIPANT: 'participant',
  OUTSIDE_WINDOW: 'outside_window',
  UNMAPPED: 'unmapped',
});

/**
 * Extract a millisecond timestamp from one raw log line.
 * @param {string} line
 * @return {number|null}
 */
function parseLogLineTimestampMs(line) {
  const fieldMatch = TIMESTAMP_FIELD_PATTERN.exec(line);
  const candidate = fieldMatch ?
    fieldMatch[ONE] :
    (ISO_TIMESTAMP_PREFIX_PATTERN.exec(line) || [])[ONE];
  if (!candidate) {
    return null;
  }
  const parsedMs = Date.parse(candidate);
  return Number.isFinite(parsedMs) ? parsedMs : null;
}

/**
 * Scan one node's raw log text for managed-merge lifecycle messages.
 * @param {string} logText - Raw container log text (any format; matching
 *   is by exact MANAGED_MERGE_LOG_MSG substring).
 * @param {string} nodeId
 * @return {Array<{nodeId: string, key: string, message: string,
 *   timestampMs: number|null, line: string}>}
 */
function scanManagedMergeLifecycleEvents(logText, nodeId) {
  const events = [];
  const lines = String(logText || '').split('\n');
  for (const line of lines) {
    for (const key of MERGE_LIFECYCLE_EVENT_KEYS) {
      if (!line.includes(MANAGED_MERGE_LOG_MSG[key])) {
        continue;
      }
      events.push({
        nodeId: String(nodeId || ''),
        key,
        message: MANAGED_MERGE_LOG_MSG[key],
        timestampMs: parseLogLineTimestampMs(line),
        line: line.trim().slice(ZERO, MAX_MATCHED_LINE_LENGTH),
      });
    }
  }
  return events;
}

/**
 * Sort lifecycle events chronologically; events without timestamps keep
 * their relative scan order at the end.
 * @param {Array<Object>} events
 * @return {Array<Object>}
 */
function sortLifecycleEvents(events) {
  const timestamped = events.filter(
    (event) => Number.isFinite(event.timestampMs),
  );
  const untimestamped = events.filter(
    (event) => !Number.isFinite(event.timestampMs),
  );
  timestamped.sort((a, b) => a.timestampMs - b.timestampMs);
  return [...timestamped, ...untimestamped];
}

/**
 * Summarize scanned lifecycle events into per-key counts plus the
 * completion/abort counters the scenario binds on.
 * @param {Array<Object>} events
 * @return {{countsByKey: Object, completedMergeCount: number,
 *   startedMergeCount: number, abortedMergeCount: number,
 *   failureEventCount: number}}
 */
function summarizeMergeLifecycle(events) {
  const countsByKey = {};
  for (const key of MERGE_LIFECYCLE_EVENT_KEYS) {
    countsByKey[key] = ZERO;
  }
  for (const event of events) {
    if (Object.prototype.hasOwnProperty.call(countsByKey, event.key)) {
      countsByKey[event.key] += ONE;
    }
  }
  const failureEventCount = MERGE_FAILURE_EVENT_KEYS.reduce(
    (total, key) => total + countsByKey[key],
    ZERO,
  );
  return {
    countsByKey,
    completedMergeCount: countsByKey.TERMINAL_TRANSITION_CLEARED,
    startedMergeCount: countsByKey.MERGE_START,
    abortedMergeCount: countsByKey.MERGE_ABORTED_ON_SOURCE_FAILURE,
    failureEventCount,
  };
}

/**
 * Pair the k-th MERGE_START with the k-th TERMINAL_TRANSITION_CLEARED to
 * approximate per-merge windows. Windows lacking either timestamp are
 * dropped (they cannot bound a probe classification).
 * @param {Array<Object>} events
 * @return {Array<{startMs: number, endMs: number}>}
 */
function buildMergeWindows(events) {
  const ordered = sortLifecycleEvents(events);
  const startTimes = ordered
    .filter((event) => event.key === 'MERGE_START')
    .map((event) => event.timestampMs)
    .filter((timestampMs) => Number.isFinite(timestampMs));
  const clearTimes = ordered
    .filter((event) => event.key === 'TERMINAL_TRANSITION_CLEARED')
    .map((event) => event.timestampMs)
    .filter((timestampMs) => Number.isFinite(timestampMs));
  const windows = [];
  const pairCount = Math.min(startTimes.length, clearTimes.length);
  for (let index = ZERO; index < pairCount; index += ONE) {
    if (clearTimes[index] >= startTimes[index]) {
      windows.push({startMs: startTimes[index], endMs: clearTimes[index]});
    }
  }
  return windows;
}

/**
 * Diff the acknowledged-write ledger against a post-merge scan result.
 * @param {Array<string>} ledgerIds - Acknowledged INSERT identifiers.
 * @param {Iterable<string>} scannedIds - Identifiers visible post-merge.
 * @return {{ledgerCount: number, scannedMatchCount: number,
 *   missingCount: number, missingSample: Array<string>}}
 */
function diffAcknowledgedLedgerAgainstScan(ledgerIds, scannedIds) {
  const ledger = [...new Set(
    (Array.isArray(ledgerIds) ? ledgerIds : [])
      .filter((id) => typeof id === 'string' && id.length > ZERO),
  )];
  const scanned = new Set(scannedIds || []);
  const missing = ledger.filter((id) => !scanned.has(id));
  return {
    ledgerCount: ledger.length,
    scannedMatchCount: ledger.length - missing.length,
    missingCount: missing.length,
    missingSample: missing.slice(ZERO, MAX_MISSING_ID_SAMPLE),
  };
}

/**
 * Normalize raw partitions-table rows into a key-range index.
 * @param {Array<Object>} rows - Rows with partition_id,
 *   partition_key_start, partition_key_end, leader_node_id.
 * @return {Array<{partitionId: string, startKey: string|null,
 *   endKey: string|null, leaderNodeId: string|null}>}
 */
function buildPartitionRangeIndex(rows) {
  const index = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row.partition_id === 'string')
    .map((row) => ({
      partitionId: row.partition_id,
      startKey: typeof row.partition_key_start === 'string' &&
        row.partition_key_start.length > ZERO ?
        row.partition_key_start :
        null,
      endKey: typeof row.partition_key_end === 'string' &&
        row.partition_key_end.length > ZERO ?
        row.partition_key_end :
        null,
      leaderNodeId: typeof row.leader_node_id === 'string' &&
        row.leader_node_id.length > ZERO ?
        row.leader_node_id :
        null,
    }));
  index.sort((a, b) => {
    if (a.startKey === null) {
      return b.startKey === null ? ZERO : -ONE;
    }
    if (b.startKey === null) {
      return ONE;
    }
    return a.startKey < b.startKey ? -ONE : a.startKey > b.startKey ? ONE : ZERO;
  });
  return index;
}

/**
 * Find the partition owning a key (start inclusive, end exclusive; null
 * bounds are open).
 * @param {Array<Object>} rangeIndex - From buildPartitionRangeIndex.
 * @param {string} key
 * @return {string|null}
 */
function findPartitionIdForKey(rangeIndex, key) {
  for (const entry of rangeIndex || []) {
    const aboveStart = entry.startKey === null || key >= entry.startKey;
    const belowEnd = entry.endKey === null || key < entry.endKey;
    if (aboveStart && belowEnd) {
      return entry.partitionId;
    }
  }
  return null;
}

/**
 * Split pre-merge vs post-merge partition id sets into retired/added ids.
 * @param {Iterable<string>} preIds
 * @param {Iterable<string>} postIds
 * @return {{retiredIds: Array<string>, addedIds: Array<string>}}
 */
function resolveRetiredAndAddedPartitionIds(preIds, postIds) {
  const pre = new Set(preIds || []);
  const post = new Set(postIds || []);
  return {
    retiredIds: [...pre].filter((id) => !post.has(id)).sort(),
    addedIds: [...post].filter((id) => !pre.has(id)).sort(),
  };
}

/**
 * Locate the merge window (if any) containing one timestamp.
 * @param {Array<{startMs: number, endMs: number}>} mergeWindows
 * @param {number} timestampMs
 * @return {number} Window index, or -1.
 */
function findMergeWindowIndex(mergeWindows, timestampMs) {
  for (let index = ZERO; index < (mergeWindows || []).length; index += ONE) {
    const window = mergeWindows[index];
    if (timestampMs >= window.startMs && timestampMs <= window.endMs) {
      return index;
    }
  }
  return -ONE;
}

/**
 * Classify probe samples against the pre-merge range index and observed
 * merge windows. A failed probe on a key whose pre-merge partition did
 * NOT participate in the overlapping merge window is a sibling-routing
 * failure — the scenario's binding observable.
 * @param {Object} options
 * @param {Array<{key: string, tsMs: number, ok: boolean,
 *   errorMessage: string|null, nodeId: string}>} options.samples
 * @param {Array<Object>} options.rangeIndex - Pre-merge range index.
 * @param {Array<{startMs: number, endMs: number}>} options.mergeWindows
 * @param {Array<Array<string>>} options.participantsByWindow - Partition
 *   ids participating in each window (sources plus target).
 * @return {{sampleCount: number, successCount: number,
 *   failureCount: number, siblingFailures: Array<Object>,
 *   participantFailures: Array<Object>, outsideWindowFailures:
 *   Array<Object>, unmappedFailures: Array<Object>}}
 */
function classifyProbeSamples(options = {}) {
  const samples = Array.isArray(options.samples) ? options.samples : [];
  const rangeIndex = options.rangeIndex || [];
  const mergeWindows = options.mergeWindows || [];
  const participantsByWindow = options.participantsByWindow || [];
  const classified = {
    sampleCount: samples.length,
    successCount: samples.filter((sample) => sample.ok === true).length,
    failureCount: ZERO,
    siblingFailures: [],
    participantFailures: [],
    outsideWindowFailures: [],
    unmappedFailures: [],
  };
  for (const sample of samples) {
    if (sample.ok === true) {
      continue;
    }
    classified.failureCount += ONE;
    const partitionId = findPartitionIdForKey(rangeIndex, sample.key);
    const record = {...sample, partitionId};
    if (partitionId === null) {
      classified.unmappedFailures.push(record);
      continue;
    }
    const windowIndex = findMergeWindowIndex(mergeWindows, sample.tsMs);
    if (windowIndex < ZERO) {
      record.failureClass = PROBE_FAILURE_CLASS.OUTSIDE_WINDOW;
      classified.outsideWindowFailures.push(record);
      continue;
    }
    const participants = new Set(participantsByWindow[windowIndex] || []);
    if (participants.has(partitionId)) {
      record.failureClass = PROBE_FAILURE_CLASS.PARTICIPANT;
      classified.participantFailures.push(record);
    } else {
      record.failureClass = PROBE_FAILURE_CLASS.SIBLING;
      record.mergeWindowIndex = windowIndex;
      classified.siblingFailures.push(record);
    }
  }
  return classified;
}

/**
 * Resolve the participant partition ids for each merge window from the
 * transition-row observations sampled during the merge phase. Windows
 * without any overlapping observation fall back to the conservative
 * participant set (all retired plus added partition ids), which can only
 * under-report sibling failures, never invent them.
 * @param {Array<{startMs: number, endMs: number}>} mergeWindows
 * @param {Array<{tsMs: number, sourcePartitionIds: Array<string>,
 *   targetPartitionIds: Array<string>}>} transitionObservations
 * @param {Array<string>} fallbackParticipants
 * @return {Array<Array<string>>}
 */
function resolveParticipantsByWindow(
  mergeWindows,
  transitionObservations,
  fallbackParticipants,
) {
  const observations = Array.isArray(transitionObservations) ?
    transitionObservations :
    [];
  return (mergeWindows || []).map((window) => {
    const participants = new Set();
    for (const observation of observations) {
      if (
        !Number.isFinite(observation?.tsMs) ||
        observation.tsMs < window.startMs ||
        observation.tsMs > window.endMs
      ) {
        continue;
      }
      for (const id of observation.sourcePartitionIds || []) {
        participants.add(id);
      }
      for (const id of observation.targetPartitionIds || []) {
        participants.add(id);
      }
    }
    if (participants.size === ZERO) {
      return [...(fallbackParticipants || [])];
    }
    return [...participants].sort();
  });
}

/**
 * Pick up to sampleCount probe keys evenly spaced over a sorted id list.
 * @param {Array<string>} ids
 * @param {number} sampleCount
 * @return {Array<string>}
 */
function selectEvenlySpacedProbeKeys(ids, sampleCount) {
  const sorted = [...new Set(
    (Array.isArray(ids) ? ids : [])
      .filter((id) => typeof id === 'string' && id.length > ZERO),
  )].sort();
  if (sorted.length <= sampleCount) {
    return sorted;
  }
  const keys = [];
  for (let index = ZERO; index < sampleCount; index += ONE) {
    const position = Math.floor(
      (index * (sorted.length - ONE)) / Math.max(ONE, sampleCount - ONE),
    );
    keys.push(sorted[position]);
  }
  return [...new Set(keys)];
}

export {
  MERGE_LIFECYCLE_EVENT_KEYS,
  MERGE_FAILURE_EVENT_KEYS,
  PROBE_FAILURE_CLASS,
  buildMergeWindows,
  buildPartitionRangeIndex,
  classifyProbeSamples,
  diffAcknowledgedLedgerAgainstScan,
  findMergeWindowIndex,
  findPartitionIdForKey,
  parseLogLineTimestampMs,
  resolveParticipantsByWindow,
  resolveRetiredAndAddedPartitionIds,
  scanManagedMergeLifecycleEvents,
  selectEvenlySpacedProbeKeys,
  sortLifecycleEvents,
  summarizeMergeLifecycle,
};
