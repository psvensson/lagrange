/**
 * Durable split/merge mirror replay cursor: the snapshot barrier index
 * (every Raft log entry up to and including it is covered by the
 * snapshot backfill) and the replay watermark (the highest log index
 * whose delta has been mirrored to the target). Both are persisted with
 * the transition metadata via the source ack checkpoint so a restarted
 * source replays deltas from the durable Raft log — never from the
 * volatile in-memory pendingEntries array.
 */

import {TABLES} from '../constants/tables.js';
import {PARTITION_SERVICE_OPERATION} from './partition-service-constants.js';

/**
 * Resolve the current Raft log barrier index for a snapshot about to be
 * taken: every entry up to and including this index is covered by the
 * backfill, so the replay watermark starts here.
 * @param {Object} service - PartitionService-like context.
 * @return {number|null} The barrier index, or null when no durable log
 *   is available (in-memory test databases).
 */
function resolveSnapshotBarrierIndex(service) {
  const lastIndex = Number(service?.storage?.getLastIndex?.());
  return Number.isSafeInteger(lastIndex) && lastIndex > 0 ?
    lastIndex :
    null;
}

/**
 * Normalize a persisted replay cursor from transition metadata: both
 * indices are integers or null (never undefined), so a recovered worker
 * can distinguish "no durable cursor recorded" from "cursor at index 0".
 * @param {Object} metadata - Normalized transition metadata.
 * @param {Object} checkpointField - *_ACK_CHECKPOINT_FIELD enum.
 * @return {{snapshotBarrierIndex: number|null,
 *   replayWatermarkIndex: number|null}}
 */
function normalizeReplayCursor(metadata, checkpointField) {
  const barrier = Number(metadata?.[checkpointField.SNAPSHOT_BARRIER_INDEX]);
  const watermark = Number(
    metadata?.[checkpointField.REPLAY_WATERMARK_INDEX],
  );
  return {
    snapshotBarrierIndex: Number.isSafeInteger(barrier) && barrier > 0 ?
      barrier :
      null,
    replayWatermarkIndex: Number.isSafeInteger(watermark) && watermark > 0 ?
      watermark :
      null,
  };
}

/**
 * Build the checkpoint fragment carrying the replay cursor for one
 * source acknowledgement.
 * @param {Object} checkpointField - *_ACK_CHECKPOINT_FIELD enum.
 * @param {number|null} barrierIndex
 * @param {number|null} watermarkIndex
 * @return {Object}
 */
function buildReplayCursorCheckpoint(
  checkpointField,
  barrierIndex,
  watermarkIndex,
) {
  return {
    [checkpointField.SNAPSHOT_BARRIER_INDEX]:
      Number.isSafeInteger(barrierIndex) ? barrierIndex : null,
    [checkpointField.REPLAY_WATERMARK_INDEX]:
      Number.isSafeInteger(watermarkIndex) ? watermarkIndex : null,
  };
}

/**
 * The operation types whose committed log entries carry mirrorable
 * writes (mirrors the applyCommittedEntry predicate in
 * partition-service-entry-apply-base.js).
 */
const MIRRORABLE_LOG_OPERATION_TYPES = Object.freeze(new Set([
  PARTITION_SERVICE_OPERATION.WRITE,
  PARTITION_SERVICE_OPERATION.INSERT,
  PARTITION_SERVICE_OPERATION.UPDATE,
  PARTITION_SERVICE_OPERATION.DELETE,
  PARTITION_SERVICE_OPERATION.UPSERT,
  PARTITION_SERVICE_OPERATION.QUERY,
]));

/**
 * Load the durable deltas behind the persisted replay watermark from
 * the source partition's Raft log: every committed write entry with
 * `index > watermarkIndex`, in log order, each stamped with its
 * logIndex so the drain advances the watermark per delivery. Returns
 * an empty list when no durable log or no watermark is available — the
 * caller then falls back to the volatile queue only for writes that
 * arrive AFTER resumption.
 * @param {Object} service - PartitionService-like context.
 * @param {number|null} watermarkIndex - Persisted replay watermark.
 * @return {Array<Object>}
 */
function loadDurableDeltasBehindWatermark(service, watermarkIndex) {
  if (!Number.isSafeInteger(watermarkIndex) || watermarkIndex < 1) {
    return [];
  }
  if (typeof service?.storage?.getEntriesFrom !== 'function') {
    return [];
  }
  const entries = service.storage.getEntriesFrom(watermarkIndex + 1) || [];
  const deltas = [];
  for (const logEntry of entries) {
    const data = logEntry?.data || null;
    if (!data || !MIRRORABLE_LOG_OPERATION_TYPES.has(data.type)) {
      continue;
    }
    deltas.push({...data, logIndex: Number(logEntry.index)});
  }
  return deltas;
}

/**
 * Find the durable transition row naming this partition as the source
 * of an in-flight split or merge: the leader-activation resumption
 * witness. Returns the parsed row (state + raw metadata) or null.
 * @param {Object} service - PartitionService-like context.
 * @param {Object} options
 * @param {Array<string>} options.activeStates - Resumable states.
 * @param {Function} options.matchesSource - (metadata) => boolean:
 *   whether the parsed metadata names this service as the source.
 * @param {Function} options.normalizeMetadata - (rawMetadata) =>
 *   Object|null: the service's transition-metadata normalizer.
 * @return {{state: string, metadata: Object}|null}
 */
function findDurableMirrorTransitionForService(
  service,
  {activeStates, matchesSource, normalizeMetadata},
) {
  const cache = service?.systemTableCache;
  if (!cache || typeof cache.getAll !== 'function') {
    return null;
  }
  const rows = cache.getAll(TABLES.TABLES) || [];
  for (const row of rows) {
    const state = String(row?.partition_transition_state || '');
    if (!activeStates.includes(state)) {
      continue;
    }
    const metadata = normalizeMetadata(row?.partition_transition_metadata);
    if (metadata && matchesSource(metadata)) {
      return {state, metadata};
    }
  }
  return null;
}

export {
  buildReplayCursorCheckpoint,
  findDurableMirrorTransitionForService,
  loadDurableDeltasBehindWatermark,
  normalizeReplayCursor,
  resolveSnapshotBarrierIndex,
};
