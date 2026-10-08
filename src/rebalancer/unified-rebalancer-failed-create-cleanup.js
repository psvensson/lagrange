import {SYSTEM_TABLE_NAME} from
  '../bootstrap/system-table-schemas-constants.js';
import {WORKFLOW_STEP} from '../constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from './replica-status.js';
import {normalizeReplicaOperationRecord} from
  './replica-operation-liveness.js';

const LOCAL_TYPEOF_FUNCTION = 'function';

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
    if (typeof this.rebalanceCoordinator
      ?.decideFailedCreateTargetCleanup !== LOCAL_TYPEOF_FUNCTION) {
      this.failedCreateTargetCleanupPreconditionByReplicaId = decisions;
      this.terminalFailedCreateTargetReplicaIds = terminalTargets;
      return decisions;
    }
    for (const operation of this.getTerminalFailedCreateOperations()) {
      const targetReplicaId = this.getReplicaIdFromOperationRow(operation);
      if (targetReplicaId.length > 0) terminalTargets.add(targetReplicaId);
      const decision = await this.rebalanceCoordinator
        .decideFailedCreateTargetCleanup(
          normalizeReplicaOperationRecord(operation, {nowMs: this.nowFn()}),
        );
      if (targetReplicaId.length > 0 &&
          decision?.cleanupEligible === true &&
          decision.lifecyclePrecondition) {
        decisions.set(targetReplicaId, decision.lifecyclePrecondition);
      }
    }
    this.failedCreateTargetCleanupPreconditionByReplicaId = decisions;
    this.terminalFailedCreateTargetReplicaIds = terminalTargets;
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
});

export {UNIFIED_REBALANCER_FAILED_CREATE_CLEANUP_METHODS};
