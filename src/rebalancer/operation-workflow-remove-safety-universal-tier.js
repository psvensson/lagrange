// The universal PARTITION execution-time remove-safety floor (audit finding
// 1). These helpers close the floor for an ordinary (non-system) partition: the
// REPLACE replacement-voter-ready guard, the projected peer-ping check, and
// the post-removal voter-ready/min-replica projection. They are extracted from
// operation-workflow-remove-safety-evaluator.js to hold that module under the
// source-size ratchet. The deeper published-membership / leader-tenure /
// priority-control-plane checks are intentionally NOT here — they stay scoped
// to system entities in the evaluator.

import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const QUORUM_PEER_UNCONTACTABLE_REASON =
  'Quorum check failed: peer node ';
const ROUTER_CONNECTION_STATE_DISCONNECTED = 'disconnected';

// Typed guard outcome. The helpers below return a deferred evaluation object
// when the guard fails, or REMOVE_SAFETY_GUARD_PASSED when it passes — never a
// raw null, so a passing guard is not confused with an absent/empty state.
const REMOVE_SAFETY_GUARD_PASSED = Object.freeze({
  guardPassed: true,
});

/**
 * True when a guard helper returned the pass marker (not a deferred
 * evaluation).
 * @param {Object|null} guardResult
 * @returns {boolean}
 */
function isRemoveSafetyGuardPassed(guardResult) {
  return guardResult === REMOVE_SAFETY_GUARD_PASSED;
}

/**
 * Guard a REPLACE-remove initial dispatch on the replacement replica being
 * voter-ready. Returns a deferred evaluation when the guard fails, or
 * REMOVE_SAFETY_GUARD_PASSED when it passes.
 * @param {Object} context
 * @param {Object} operation
 * @param {Object} input
 * @returns {Object}
 */
function evaluateReplaceReplacementVoterReady(context, operation, input) {
  if (!input.replacementReplicaId) {
    return context.buildDeferredRemoveSafetyEvaluationForOperation(
      operation,
      OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION +
        operation.partitionId +
        OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA +
        OPERATION_WORKFLOW_OWNER_LITERAL.IS_UNAVAILABLE,
    );
  }
  const replacementReplicaVoterReady =
    input.priorityRecoveryCompletionSafe === true ?
      context.isVoterReadyReplicaTopology(input.replacementReplicaRow) :
      context.isVoterReadyRoutableReplica(
        input.replacementReplicaRow,
        input.removeSafetyReadiness,
      ) ||
        context.isPriorityActiveReplaceTopologyVoterEvidenceSufficient(
          operation,
          input.replacementReplicaRow,
        );
  if (!replacementReplicaVoterReady) {
    return context.buildDeferredRemoveSafetyEvaluationForOperation(
      operation,
      OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION +
        operation.partitionId +
        OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA_2 +
        input.replacementReplicaId +
        OPERATION_WORKFLOW_OWNER_LITERAL.IS_NOT_VOTER_DASH_READY,
    );
  }
  return REMOVE_SAFETY_GUARD_PASSED;
}

/**
 * Ping every projected post-removal voter-ready peer. Returns a deferred
 * evaluation when a peer is uncontactable, null when all are reachable (or no
 * router is available).
 * @param {Object} context
 * @param {Object} operation
 * @param {Object[]} projectedVoterReadyRows
 * @returns {Promise<Object|null>}
 */
async function evaluateProjectedPeersContactable(
  context,
  operation,
  projectedVoterReadyRows,
) {
  if (!context.messageRouter) {
    return null;
  }
  const router = context.messageRouter;
  for (const row of projectedVoterReadyRows) {
    const nodeId = row.nodeId || row.node_id;
    if (!nodeId || nodeId === context.nodeId) {
      continue;
    }
    let isConnected = true;
    if (typeof router.getConnectionState === 'function') {
      if (router.getConnectionState(nodeId) === ROUTER_CONNECTION_STATE_DISCONNECTED) {
        isConnected = false;
      }
    }
    if (isConnected && typeof router.pingNode === 'function') {
      const pingResult = await router.pingNode(nodeId).catch(() => false);
      if (!pingResult) {
        isConnected = false;
      }
    }
    if (!isConnected) {
      console.warn(
        `${QUORUM_PEER_UNCONTACTABLE_REASON}${nodeId} is uncontactable or disconnected`,
      );
      return context.buildDeferredRemoveSafetyEvaluationForOperation(
        operation,
        `${QUORUM_PEER_UNCONTACTABLE_REASON}${nodeId} is uncontactable`,
      );
    }
  }
  return null;
}

/**
 * The universal partition execution-time remove-safety floor for an ordinary
 * (non-system) partition. The concurrent-operation lock and the
 * replica-row gathering have already run in evaluateRemoveSafety; here the
 * post-removal voter-ready/min-replica floor, the REPLACE replacement guard,
 * and the peer-ping check close the floor.
 * @param {Object} context
 * @param {Object} operation
 * @param {Object} input
 * @returns {Promise<Object>}
 */
async function evaluateUniversalPartitionRemoveSafety(
  context,
  operation,
  input,
) {
  const {projectQuorumAfterRemoval, QUORUM_PROJECTION_SCOPE} = input;
  if (input.isReplaceRemoveInitialDispatch) {
    const replacementGuard = evaluateReplaceReplacementVoterReady(
      context,
      operation,
      {
        replacementReplicaId: input.replacementReplicaId,
        replacementReplicaRow: input.replacementReplicaRow,
        removeSafetyReadiness: input.removeSafetyReadiness,
        priorityRecoveryCompletionSafe: false,
      },
    );
    if (!isRemoveSafetyGuardPassed(replacementGuard)) {
      return replacementGuard;
    }
    // Lenient REPLACE (operator decision, audit finding 1): once the
    // replacement replica is confirmed voter-ready, removing the REPLACE
    // source cannot drop the post-removal voter-ready count below the floor —
    // the replacement already holds quorum. The strict min-replica projection
    // below is for plain REMOVE, where the removed replica's vote is simply
    // lost. Applying it to REPLACE would strand a legitimate mid-drain
    // same-node move whose source already stepped down.
    const peerPingGuard = await evaluateProjectedPeersContactable(
      context,
      operation,
      input.projectedVoterReadyRows,
    );
    if (peerPingGuard) {
      return peerPingGuard;
    }
    return context.buildSafeRemoveSafetyEvaluation();
  }

  const minReplicaCount = await context.getCriticalMinReplicaCount(
    operation.partitionId,
  );
  const projectedVoterReadyCount = input.projectedVoterReadyRows.length;
  const simpleFloor = projectQuorumAfterRemoval({
    projectedVoterReadyRows: input.projectedVoterReadyRows,
    minReplicaCount,
    completionSafe: false,
    scope: QUORUM_PROJECTION_SCOPE.SIMPLE_FLOOR,
  });
  if (!simpleFloor.floorSatisfied) {
    return context.buildDeferredRemoveSafetyEvaluationForOperation(
      operation,
      `Critical partition ${operation.partitionId}` +
        OPERATION_WORKFLOW_OWNER_LITERAL.WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM +
        ` (${projectedVoterReadyCount}/${minReplicaCount})`,
    );
  }

  const peerPingGuard = await evaluateProjectedPeersContactable(
    context,
    operation,
    input.projectedVoterReadyRows,
  );
  if (peerPingGuard) {
    return peerPingGuard;
  }

  return context.buildSafeRemoveSafetyEvaluation();
}

export {
  evaluateProjectedPeersContactable,
  evaluateReplaceReplacementVoterReady,
  evaluateUniversalPartitionRemoveSafety,
  isRemoveSafetyGuardPassed,
};
