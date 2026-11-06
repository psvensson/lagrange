import {SYSTEM_TABLE_NAME} from
  '../bootstrap/system-table-schemas-constants.js';
import {WORKFLOW_STEP} from '../constants/index.js';
import {
  OPERATION_METADATA_KEY,
  OperationType,
  ReplicaStatus,
  getOperationMetadataObject,
} from './replica-status.js';
import {isFailedCreateCleanupToken} from './failed-create-cleanup-token.js';
import {normalizeReplicaOperationRecord} from
  './replica-operation-liveness.js';

const LOCAL_TYPEOF_FUNCTION = 'function';

function resolveTerminalFailedCreateClaimCandidate(
  normalizedOperation,
  decision,
) {
  const claimedPrecondition = getOperationMetadataObject(
    normalizedOperation.stepsHistory,
    OPERATION_METADATA_KEY.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION,
  );
  if (isFailedCreateCleanupToken(claimedPrecondition?.cleanup_token)) {
    return claimedPrecondition;
  }
  if (decision?.cleanupEligible === true &&
      isFailedCreateCleanupToken(decision.lifecyclePrecondition?.cleanup_token)) {
    return decision.lifecyclePrecondition;
  }
  return null;
}

function appendTerminalClaim(terminalClaims, targetReplicaId, claimCandidate) {
  if (!claimCandidate) return;
  const claims = terminalClaims.get(targetReplicaId) || [];
  terminalClaims.set(
    targetReplicaId,
    Object.freeze([...claims, claimCandidate]),
  );
}

const UNIFIED_REBALANCER_FAILED_CREATE_CLEANUP_METHODS = Object.freeze({
  /**
   * A terminal ADD or REPLACE may leave a closed target in committed raft
   * membership. The terminal operation records the exact authoritative FAILED
   * lifecycle generation. Only that matching generation is exposed to the
   * planner for REMOVE -> REMOVING -> row-driven RemoveNode cleanup.
   * @return {Array<Object>}
   */
  getTerminalFailedCreateOperations() {
    return this.systemTableCache.filter(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      (operation) => {
        if (!this.isOperationForEntity(operation)) return false;
        const normalized = normalizeReplicaOperationRecord(operation, {
          nowMs: this.nowFn(),
        });
        return (
          (normalized.type === OperationType.REPLACE ||
            normalized.type === OperationType.ADD) &&
          (normalized.status === ReplicaStatus.FAILED ||
            normalized.workflowStep === WORKFLOW_STEP.FAILED)
        );
      },
    );
  },

  async refreshFailedCreateTargetCleanupDecisions() {
    const decisions = new Map();
    const terminalTargets = new Set();
    const terminalClaims = new Map();
    if (typeof this.rebalanceCoordinator
      ?.decideFailedCreateTargetCleanup !== LOCAL_TYPEOF_FUNCTION) {
      this.failedCreateTargetCleanupPreconditionByReplicaId = decisions;
      this.terminalFailedCreateTargetReplicaIds = terminalTargets;
      this.terminalFailedCreateTargetClaimByReplicaId = terminalClaims;
      return decisions;
    }
    for (const operation of this.getTerminalFailedCreateOperations()) {
      const normalizedOperation = normalizeReplicaOperationRecord(operation, {
        nowMs: this.nowFn(),
      });
      const targetReplicaId = this.getReplicaIdFromOperationRow(operation);
      const decision = await this.rebalanceCoordinator
        .decideFailedCreateTargetCleanup(normalizedOperation);
      if (targetReplicaId.length === 0) continue;
      terminalTargets.add(targetReplicaId);
      appendTerminalClaim(
        terminalClaims,
        targetReplicaId,
        resolveTerminalFailedCreateClaimCandidate(
          normalizedOperation,
          decision,
        ),
      );
      if (decision?.cleanupEligible === true &&
          decision.lifecyclePrecondition) {
        decisions.set(targetReplicaId, decision.lifecyclePrecondition);
      }
    }
    this.failedCreateTargetCleanupPreconditionByReplicaId = decisions;
    this.terminalFailedCreateTargetReplicaIds = terminalTargets;
    this.terminalFailedCreateTargetClaimByReplicaId = terminalClaims;
    return decisions;
  },

  getTerminalFailedCreateTargetReplicaIds() {
    return new Set(this.terminalFailedCreateTargetReplicaIds || []);
  },

  getTerminalFailedReplaceTargetReplicaIds() {
    return new Set(
      this.failedCreateTargetCleanupPreconditionByReplicaId?.keys?.() || [],
    );
  },

  getFailedCreateTargetCleanupPrecondition(replicaId) {
    return this.failedCreateTargetCleanupPreconditionByReplicaId?.get(
      replicaId,
    ) || null;
  },

  getTerminalFailedCreateTargetClaims(replicaId) {
    return this.terminalFailedCreateTargetClaimByReplicaId?.get(replicaId) ||
      Object.freeze([]);
  },
});

export {UNIFIED_REBALANCER_FAILED_CREATE_CLEANUP_METHODS};
