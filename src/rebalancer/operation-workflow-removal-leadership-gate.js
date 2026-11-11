/**
 * Owner contract:
 * Owner: the removal leadership gate - the one rule every partition replica
 * removal passes at its dispatch boundary, for every partition class and
 * both removal kinds (a REPLACE's source, a plain REMOVE's replica): a
 * replica that is its group's current leader is never the subject of a
 * removal effect. Every removal decision reads the group's leader authority
 * first; a leading subject gets one named-target leadership transfer and the
 * removal waits, in a named state, until a surviving member is corroborated
 * as leader (owner rule 2026-11-11; it replaces the per-class
 * isReplaceSourceLeaderHandoffRequiredPartition predicate, which left user
 * partitions, plain REMOVEs and non-priority system tables ungated).
 * Inputs: the removal's identities (replaceReplicaIdsOf: subject, and the
 * REPLACE's target); the REPLACE target's own read (the witness); the
 * group's corroborated current leader with its confirming voters
 * (readReplaceCorroboratedConfiguration: the leader's own answer, applied at
 * its commit index, confirmed by a majority at its term); routes from the
 * partition's cached rows (a route, never an answer). The decision itself is
 * decideRemovalNamedHandoff's.
 * Canonical output: a remove-safety evaluation - SAFE when the subject does
 * not lead (LEADERSHIP_SAFE, LEADER_RETAINED); DEFER in a named state
 * otherwise, carrying one named STEP_DOWN_REPLICA handoff request when the
 * subject leads (ISSUE); FAIL only for a REPLACE whose target answered
 * NOT_FOUND (the planner's, B3). An unreadable or uncorroborated authority
 * is a wait, never a permission and never a terminal failure: a plain
 * REMOVE defers with REMOVE_SAFETY_BLOCKED whatever its replica count.
 * Wake: every deferral re-enters through the existing deferred-safety
 * re-entry (the 1 s fallback and the level-triggered owner wake).
 * Not here: group retirement - a managed split/merge dissolution retires the
 * whole group by its durable workflow record (group-retirement-evidence.js)
 * and sends REMOVE_REPLICA with that evidence directly; it never passes the
 * rebalancer's removal workflow, so a group teardown is never held by this
 * gate. A dead subject cannot transfer: its survivors elect, and the gate
 * waits (WAIT_LEADER_NOT_CORROBORATED) until a survivor is corroborated.
 * Prohibited: no row, role column or leader_node_id is read as leadership;
 * no elapsed time permits a removal.
 */
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  REPLACE_HANDOFF_DECISION,
  buildReplaceLeaderNotCorroboratedDeferral,
  decideRemovalNamedHandoff,
} from './operation-workflow-replace-handoff-attempt.js';
import {
  readReplaceWitnessMembership,
  replaceReplicaIdsOf,
} from './operation-workflow-replace-witness.js';
import {
  memberRouteOf,
  readReplaceCorroboratedConfiguration,
} from './operation-workflow-replace-surviving-membership.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationReason,
} from './replica-operation-constants.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  REBALANCE_COORDINATOR_DEFER_REASON,
} = OPERATION_WORKFLOW_OWNER_SHARED;

// The decisions under which the subject may be removed: it does not lead.
const REMOVAL_LEADERSHIP_SAFE_DECISIONS = Object.freeze(new Set([
  REPLACE_HANDOFF_DECISION.LEADERSHIP_SAFE,
  REPLACE_HANDOFF_DECISION.LEADER_RETAINED,
]));

// The deferral text of a plain REMOVE's leadership wait, around the
// partition, the replica and the named state.
const REMOVE_LEADERSHIP_WAIT_DEFERRAL = Object.freeze({
  PARTITION_PREFIX: 'Partition ',
  REPLICA_INFIX: ' replica ',
  STATE_INFIX: ' removal waits on its group\'s leadership: ',
  REASON_INFIX: ' - ',
});

/**
 * @param {Object} operation
 * @param {string} subjectReplicaId
 * @param {Object} decision
 * @return {string} A plain REMOVE's leadership deferral message.
 */
function buildRemoveLeadershipWaitDeferral(
  operation, subjectReplicaId, decision) {
  const reason = typeof decision.authorityReason === 'string' ?
    REMOVE_LEADERSHIP_WAIT_DEFERRAL.REASON_INFIX + decision.authorityReason :
    OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING;
  return REMOVE_LEADERSHIP_WAIT_DEFERRAL.PARTITION_PREFIX +
    operation.partitionId + REMOVE_LEADERSHIP_WAIT_DEFERRAL.REPLICA_INFIX +
    subjectReplicaId + REMOVE_LEADERSHIP_WAIT_DEFERRAL.STATE_INFIX +
    decision.state + reason;
}

// A REPLACE's deferral text is the REPLACE owner's (unchanged messages).
function buildReplaceLeadershipWaitDeferral(operation, replicaIds, decision) {
  if (decision.state ===
      REPLACE_HANDOFF_DECISION.WAIT_LEADER_NOT_CORROBORATED) {
    return buildReplaceLeaderNotCorroboratedDeferral(
      operation.partitionId, replicaIds.sourceReplicaId);
  }
  return OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION +
    operation.partitionId +
    OPERATION_WORKFLOW_OWNER_LITERAL.SOURCE_LEADER +
    replicaIds.sourceReplicaId +
    OPERATION_WORKFLOW_OWNER_LITERAL
      .REPLACEMENT_LEADER_OWNERSHIP_PENDING_BEFORE_SAFE_REMOVAL;
}

// The one named transfer a leading subject is asked for: a STEP_DOWN to the
// transferee naming itself (the follower forwards it to the leader).
function buildNamedHandoffRequest(transferee) {
  return Object.freeze({
    dispatchNodeId: transferee.nodeId,
    messageType: ReplicaOperationMessageType.STEP_DOWN_REPLICA,
    requestReason: ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION,
    requestReplicaId: transferee.replicaId,
    // The attempt opens when the request actually leaves (dispatch).
    leadershipHandoffAttempt: true,
  });
}

/**
 * Read the removal's leadership and decide it.
 * @param {Object} owner - The operation workflow owner.
 * @param {Object} operation - A partition REPLACE or REMOVE at its removal
 *   dispatch boundary.
 * @return {Promise<{decision: Object, replicaIds: Object}>}
 */
async function readRemovalLeadershipDecision(owner, operation) {
  const replicaIds = replaceReplicaIdsOf(owner, operation);
  const witness = replicaIds.targetReplicaId === null ? null :
    await readReplaceWitnessMembership(owner, operation);
  const decision = await decideRemovalNamedHandoff(owner, operation, {
    witness,
    replicaIds,
    readLeaderAuthority: () =>
      readReplaceCorroboratedConfiguration(owner, operation),
    routeOf: (replicaId) => memberRouteOf(owner, operation, replicaId),
  });
  return {decision, replicaIds};
}

/**
 * The removal leadership gate as a remove-safety evaluation.
 * @param {Object} owner - The operation workflow owner.
 * @param {Object} operation - A partition REPLACE or REMOVE at its removal
 *   dispatch boundary.
 * @return {Promise<Object>} SAFE, a named DEFER (with the handoff request
 *   when the subject leads), or FAIL (REPLACE target NOT_FOUND).
 */
async function evaluateRemovalLeadershipSafety(owner, operation) {
  const {decision, replicaIds} =
    await readRemovalLeadershipDecision(owner, operation);
  if (REMOVAL_LEADERSHIP_SAFE_DECISIONS.has(decision.state)) {
    return owner.buildSafeRemoveSafetyEvaluation();
  }
  const isReplace = operation.type === OperationType.REPLACE;
  if (decision.state === REPLACE_HANDOFF_DECISION.TARGET_NOT_FOUND) {
    return owner.buildFailedRemoveSafetyEvaluation(
      OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION +
        operation.partitionId +
        OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA_2 +
        replicaIds.targetReplicaId +
        OPERATION_WORKFLOW_OWNER_LITERAL
          .REPLACEMENT_LEADER_ELECTION_RETURNED_NOT_FOUND,
    );
  }
  const message = isReplace ?
    buildReplaceLeadershipWaitDeferral(operation, replicaIds, decision) :
    buildRemoveLeadershipWaitDeferral(
      operation, replicaIds.sourceReplicaId, decision);
  return owner.buildDeferredRemoveSafetyEvaluation(
    message,
    isReplace ?
      REBALANCE_COORDINATOR_DEFER_REASON.REPLACE_REMOVE_SAFETY_BLOCKED :
      REBALANCE_COORDINATOR_DEFER_REASON.REMOVE_SAFETY_BLOCKED,
    decision.state === REPLACE_HANDOFF_DECISION.ISSUE ?
      {handoffRequest: buildNamedHandoffRequest(decision.transferee)} : {},
  );
}

/**
 * Whether the group's corroborated current leader is the removal's subject
 * (the STOPPING owner's fence before it proposes the subject's RemoveNode
 * through that leader).
 * @param {Object} owner
 * @param {Object} operation
 * @param {Object|null} authority - A corroborated authority observation.
 * @return {boolean}
 */
function isRemovalSubjectCorroboratedLeader(owner, operation, authority) {
  const {sourceReplicaId} = replaceReplicaIdsOf(owner, operation);
  return typeof sourceReplicaId === 'string' &&
    typeof authority?.replicaId === 'string' &&
    authority.leaderReplicaId === authority.replicaId &&
    authority.replicaId === sourceReplicaId;
}

export {
  evaluateRemovalLeadershipSafety,
  isRemovalSubjectCorroboratedLeader,
};
