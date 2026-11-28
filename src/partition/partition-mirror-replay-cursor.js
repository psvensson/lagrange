/**
 * Durable split/merge mirror replay cursor: the snapshot barrier index
 * (every Raft log entry up to and including it is covered by the
 * snapshot backfill) and the replay watermark (the highest log index
 * whose delta has been mirrored to the target). Both are persisted with
 * the transition metadata via the source ack checkpoint so a restarted
 * source replays the committed statement effects and commands retained by
 * the partition state machine, including across snapshot installation.
 */

import {readMirrorReplayCommandsIn} from './partition-mirror-effect-retention.js';
import {TABLES} from '../constants/tables.js';
import {assertAppliedMirrorEffect} from './partition-mirror-custody-codec.js';
import {
  committedStatementEntryKey,
  readCommittedStatementOutcome,
} from './partition-committed-statement-outcome.js';
import {
  readPartitionAppliedIndex,
} from './partition-committed-log.js';
import {decodeTypedParams} from '../query/sql-value-codec.js';

/**
 * Resolve the current Raft log barrier index for a snapshot about to be
 * taken: the rs-raft applied index, written atomically with the state
 * machine the backfill copies (the commit index can run ahead of it).
 * Every entry up to and including it is covered by the backfill, so the
 * replay watermark starts here.
 * @param {Object} service - PartitionService-like context.
 * @return {number|null} The barrier index, or null when the partition has
 *   no open database or no applied entry yet.
 */
function resolveSnapshotBarrierIndex(service) {
  if (!service?.db?.open) {
    return null;
  }
  const appliedIndex = Number(readPartitionAppliedIndex(service));
  return Number.isSafeInteger(appliedIndex) && appliedIndex > 0 ?
    appliedIndex :
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

function appendAppliedDeltaAtLogIndex(service, command, logIndex, previousIndex, deltas) {
  const recorded = readCommittedStatementOutcome(service, committedStatementEntryKey(command));
  assertAppliedMirrorEffect(command, logIndex, previousIndex, recorded.affectedRows?.length,
    recorded);
  deltas.push({
    ...command,
    ...(command?.typedParams ?
      {params: decodeTypedParams(command.typedParams)} :
      {}),
    logIndex,
    ...(typeof recorded.mutationKind === 'string' ?
      {mutationKind: recorded.mutationKind} :
      {}),
    ...(Number.isInteger(recorded.changes) ?
      {changes: recorded.changes} :
      {}),
    ...(Array.isArray(recorded.affectedRows) ?
      {affectedRows: recorded.affectedRows.map((row) => ({...row}))} :
      {}),
  });
}

function loadDurableDeltasBehindWatermark(service, watermarkIndex) {
  if (!Number.isSafeInteger(watermarkIndex) || watermarkIndex < 1) {
    return [];
  }
  if (!service?.db?.open) {
    return [];
  }
  const deltas = [];
  let previousIndex = watermarkIndex;
  for (const entry of readMirrorReplayCommandsIn(service.db, watermarkIndex)) {
    appendAppliedDeltaAtLogIndex(service, entry.command, entry.index, previousIndex, deltas);
    previousIndex = entry.index;
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
