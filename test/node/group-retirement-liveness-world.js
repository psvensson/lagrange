/**
 * The shared world of the group-retirement liveness and fail-closed
 * witnesses (group-retirement-liveness.test.js, group-retirement-fail-
 * closed.test.js): the durable record shape of each (family, aborted) pair,
 * its owner, its step, and bounded-round drains (never wall time).
 */
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
} from '../../src/partition/split-ack-constants.js';
import {
  MERGE_ACK_STATUS,
  buildMergeSourceParticipantKey,
} from '../../src/partition/merge-ack-constants.js';
import {
  TABLE_ID,
  createWorkflowOwner,
  driveUntilRemoved,
  nextTurns,
} from './group-retirement-as-a-unit-fixture.js';

const GROUP_RETIRED = 'group-retired';
const WORKFLOW_ID = 'wf-live-1';
const FENCE = 3;
const SOURCE_KEY = SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION;

// The record shape of each (family, aborted) pair: what it names, its
// transition state, its active epoch, and its finished source participants.
const SHAPE = Object.freeze({
  'split:false': (p) => ({
    names: {sourcePartitionId: p, targetPartitionIds: [`${p}-l`, `${p}-r`]},
    state: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE, active: 2,
    participants: [{participantKey: SOURCE_KEY,
      status: SPLIT_ACK_STATUS.CLEANUP_COMPLETED}]}),
  // The aborted split's sibling child was never provisioned: its durable
  // mark says so (target-provisioning-mark.js); this world's child was.
  'split:true': (p) => ({
    names: {sourcePartitionId: `${p}-src`,
      targetPartitionIds: [p, `${p}-sib`],
      targetProvisioning: {[p]: 'dispatched', [`${p}-sib`]: 'none'}},
    state: PARTITION_TRANSITION_STATE.FAILED, active: 1, participants: []}),
  'merge:false': (p) => ({
    names: {sourcePartitionIds: [p, `${p}-sib`],
      targetPartitionIds: [`${p}-m`]},
    state: PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE, active: 2,
    participants: [
      {participantKey: buildMergeSourceParticipantKey(p),
        status: MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED},
      {participantKey: buildMergeSourceParticipantKey(`${p}-sib`),
        status: MERGE_ACK_STATUS.SOURCE_DISSOLVED}]}),
  'merge:true': (p) => ({
    names: {sourcePartitionIds: [`${p}-a`, `${p}-b`],
      targetPartitionIds: [p], targetProvisioning: {[p]: 'dispatched'}},
    state: PARTITION_TRANSITION_STATE.FAILED, active: 1, participants: []}),
});

function install(world, {family = 'split', aborted = false,
  targetVersion = 2} = {}) {
  const shape = SHAPE[`${family}:${aborted}`](world.partitionId);
  const metadata = {workflowId: WORKFLOW_ID, workflowFenceToken: FENCE,
    targetPartitionVersion: targetVersion, ...shape.names,
    participants: Object.fromEntries(shape.participants.map((part) =>
      [part.participantKey, {status: part.status}]))};
  world.setTablesRow({table_id: TABLE_ID,
    active_partition_version: shape.active,
    partition_transition_state: shape.state,
    partition_transition_metadata: JSON.stringify(metadata)});
  return {family, aborted, metadata, state: shape.state,
    participants: shape.participants};
}

function openOwner(world, shape, {resume = false, recover = false,
  owner: ownerFields = {}} = {}) {
  return createWorkflowOwner(world, {family: shape.family, resume, recover,
    workflow: {
      workflowId: WORKFLOW_ID, fenceToken: FENCE, tableId: TABLE_ID,
      partitionId: world.partitionId, status: shape.state,
      metadata: shape.metadata, participants: shape.participants,
      ...ownerFields}});
}

function drive(owner, shape) {
  if (shape.aborted) {
    return shape.family === 'split' ?
      owner.teardownAbortedSplitChildren(WORKFLOW_ID,
        owner.resolveWorkflowState(WORKFLOW_ID)) :
      owner.teardownAbortedMergeTarget(WORKFLOW_ID,
        owner.resolveWorkflowState(WORKFLOW_ID));
  }
  return shape.family === 'split' ?
    owner.finalizeSplitDissolutionIfReady(WORKFLOW_ID) :
    owner.finalizeMergeDissolutionIfReady(WORKFLOW_ID);
}

async function settle(world, rounds = 10) {
  await driveUntilRemoved(world, [], rounds);
  await nextTurns();
}

// Drive the world one round at a time until the awaited state holds (a
// bound in rounds, never in wall time): an outcome that depends on how many
// turns a slower host needs is drained to, not sampled at a fixed count.
async function drainUntil(world, holds, maxRounds = 400) {
  for (let round = 0; round < maxRounds; round += 1) {
    if (holds()) {
      return true;
    }
    await settle(world, 1);
  }
  return holds();
}

function recordState(world) {
  return world.tablesRows.get(TABLE_ID)?.partition_transition_state ?? null;
}

function retired(world, replicaId) {
  return world.exitsOf(replicaId).includes(GROUP_RETIRED) &&
    world.cluster.node(replicaId).readStatus().outcome ===
      RAFT_OPERATION_OUTCOME.CORE_REFUSED;
}

function logsOf(owner, level, pattern) {
  return owner.ownerLog.filter((line) => line.level === level &&
    pattern.test(line.message));
}

function assertQuiet(t, world, label) {
  t.same(world.consensusWaits, [], `${label}: no consensus-exit wait`);
  t.same(world.proposals, [], `${label}: no conf change proposed`);
}

export {
  assertQuiet,
  drainUntil,
  drive,
  FENCE,
  GROUP_RETIRED,
  install,
  logsOf,
  openOwner,
  recordState,
  retired,
  settle,
  SOURCE_KEY,
  WORKFLOW_ID,
};
