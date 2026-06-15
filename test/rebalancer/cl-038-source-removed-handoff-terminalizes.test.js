import {test} from '../../src/test-helpers/tap.js';
import {PriorityPublicationLeaderSafety} from '../../src/rebalancer/priority-publication-leader-safety.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SHARED} from '../../src/rebalancer/priority-publication-safety-shared.js';

// CL-038: A surplus-drain REPLACE on an over-target priority partition removes the
// surplus voter (the SOURCE). The remove-safety gate requires a source-leader
// handoff first. In the wedge, the source replica (e.g. replica_operations-p1-r2)
// is locally REMOVED, but the durable workflow's source_removal step stays gated on
// the handoff: resolvePriorityPublicationSourceRoleState infers LEADER from the
// now-stale partitionRow.leader_node_id (still naming the removed source's node when
// no successor has been elected), so the gate never reaches SAFE and re-dispatches a
// STEP_DOWN handoff to a replica that no longer exists — forever. That unsettled drain
// keeps priorityRecoveryReasonCodes non-empty, oscillating node readiness, which
// node-wide-flips backgroundReady and churns ~30 rebalancer schedulers (the "153
// leadership cycles" symptom). The fix: when the source replica row is ABSENT from the
// authoritative-merged critical rows, the source is already removed (a removed replica
// cannot be a raft leader), so source removal is leadership-safe → SAFE → the existing
// REMOVE->NOT_FOUND->stop-phase machinery terminalizes the op.

const {
  OperationType,
  PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE,
  PRIORITY_PUBLICATION_SOURCE_ROLE_STATE,
} = SHARED;

const SEED = 'seed-node';
const NODE_B = 'node-2';
const PARTITION_ID = 'replica_operations-p1'; // non-publication: skip publication-status gates
const SOURCE_REPLICA_ID = 'replica_operations-p1-r2';
const TARGET_REPLICA_ID = 'replica_operations-p1-r3';

function roleFromRow(row) {
  if (!row) {
    return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.UNKNOWN;
  }
  if (row.raft_role === 'leader') {
    return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.LEADER;
  }
  if (row.raft_role === 'follower') {
    return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER;
  }
  return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.UNKNOWN;
}

// Real builder + real resolvePriorityPublicationSourceRoleState + real
// getReplicaRowIdentity via the prototype chain; only the external-state leaf helpers
// are stubbed deterministically so the test exercises the actual gate logic.
function makeSafety() {
  const instance = Object.create(PriorityPublicationLeaderSafety.prototype);
  instance.repository = {
    getReplaceSourceReplicaId: (op) => op?.sourceReplicaId ?? null,
    getReplaceTargetReplicaId: (op) => op?.targetReplicaId ?? null,
  };
  instance.getPriorityPublicationSourceRoleState = roleFromRow;
  instance.getPriorityPublicationReplacementRoleState = roleFromRow;
  instance.getCriticalPartitionLeaderNodeIdForSafety = (partitionRow) =>
    (typeof partitionRow?.leader_node_id === 'string' &&
      partitionRow.leader_node_id) ||
    null;
  instance.getPriorityPublicationLeaderHandoffEvidence = () => null;
  instance.isPriorityPublicationLeaderHandoffRetrySuppressed = () => false;
  instance.getPriorityPublicationReplacementLeaderElectionEvidence = () => null;
  instance.isPriorityActiveReplaceTopologyVoterEvidenceSufficient = () => false;
  instance.normalizePriorityPublicationStatus = () => 'PUBLISHED';
  instance.isReplaceSourceLeaderHandoffRequiredPartition = () => true;
  return instance;
}

function replaceOperation(extra = {}) {
  return {
    type: OperationType.REPLACE,
    partitionId: PARTITION_ID,
    sourceNodeId: SEED,
    sourceReplicaId: SOURCE_REPLICA_ID,
    targetReplicaId: TARGET_REPLICA_ID,
    targetNodeId: NODE_B,
    ...extra,
  };
}

// A non-leader replacement so the only thing that can make removal safe is the
// source-removed signal (no canonical successor, no replacement leadership observed).
const replacementFollower = {
  replica_id: TARGET_REPLICA_ID,
  node_id: NODE_B,
  raft_role: 'follower',
};
// Stale: the partition still names the removed source's node as leader because no
// successor has been elected/published — this is what poisons the role resolution.
const stalePartitionRow = {leader_node_id: SEED};

test('CL-038 source-removed REPLACE reaches SAFE (terminalizes) instead of re-dispatching a dead handoff', async (t) => {
  const safety = makeSafety();

  const snapshot = safety.buildPriorityPublicationLeaderRemoveSafetySnapshot(
    replaceOperation(),
    null, // source replica row ABSENT from the authoritative critical rows = removed
    replacementFollower,
    stalePartitionRow,
    {},
  );

  t.equal(
    snapshot.sourceReplicaRemoved,
    true,
    'a REPLACE whose declared source replica is absent from the authoritative ' +
      'critical rows is recognized as already-removed',
  );
  t.equal(
    snapshot.state,
    PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.SAFE,
    'source removal is leadership-safe when the source replica is already gone — ' +
      'no live source leader remains to hand off from (red on revert: without the ' +
      'sourceReplicaRemoved disjunct the stale leader_node_id resolves source=LEADER ' +
      'and the state is REQUEST_SOURCE_LEADER_HANDOFF, looping forever)',
  );
  t.end();
});

test('CL-038 a source that is still present and leader is NOT released without a real handoff', async (t) => {
  const safety = makeSafety();

  const snapshot = safety.buildPriorityPublicationLeaderRemoveSafetySnapshot(
    replaceOperation(),
    {replica_id: SOURCE_REPLICA_ID, node_id: SEED, raft_role: 'leader'},
    replacementFollower,
    stalePartitionRow,
    {},
  );

  t.not(
    snapshot.state,
    PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.SAFE,
    'a present+leader source must still require a genuine handoff (fix must not ' +
      'weaken safety for a source that has not been removed)',
  );
  t.equal(
    snapshot.state,
    PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.REQUEST_SOURCE_LEADER_HANDOFF,
    'present+leader source with no successor still requests the source-leader handoff',
  );
  t.end();
});

test('CL-038 source-removed signal requires the operation to declare a replace source (no false positive on a malformed op)', async (t) => {
  const safety = makeSafety();

  const snapshot = safety.buildPriorityPublicationLeaderRemoveSafetySnapshot(
    replaceOperation({sourceReplicaId: null}),
    null,
    replacementFollower,
    stalePartitionRow,
    {},
  );

  t.not(
    snapshot.state,
    PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.SAFE,
    'an op that does not declare a replace source must not be treated as ' +
      'source-removed (the signal is row-absence of a DECLARED source, not a bare null)',
  );
  t.end();
});
