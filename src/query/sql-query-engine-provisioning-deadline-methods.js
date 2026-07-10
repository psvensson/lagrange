import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';

const {
  QUERY_LOG_MSG,
  getRemainingBudgetMs,
} = SQL_QUERY_ENGINE_SHARED;

/**
 * Owns the one parent-deadline re-wait allowed after initial provisioning
 * admission encounters a whole-cluster transient hold.
 */
class SQLQueryEngineProvisioningDeadlineMethods {
  isWholeClusterTransientProvisioningHold(options = {}) {
    const admissionConvergence = options.admissionConvergence || null;
    const maximumProvisionableReplicaCount = Number.isInteger(
      admissionConvergence?.maximumProvisionableReplicaCount,
    ) ?
      admissionConvergence.maximumProvisionableReplicaCount :
      null;
    return (
      maximumProvisionableReplicaCount === 0 &&
      options.hasExplicitMinimumRoutableReplicaCount !== true &&
      this.hasOnlyTransientProvisioningShortfall(
        admissionConvergence?.rejectedTargetNodePlans,
      )
    );
  }

  async waitOutWholeClusterTransientProvisioningHold(options = {}) {
    if (!this.isWholeClusterTransientProvisioningHold(options)) {
      return null;
    }
    const remainingBudgetMs = getRemainingBudgetMs(options.timeoutBudget, {
      now: this.nowFn,
    });
    this.logTransientProvisioningHoldWait(options, remainingBudgetMs);
    if (remainingBudgetMs <= 0) {
      return null;
    }
    return this.waitForProvisionTargetNodeIds({
      partitionId: options.partitionId,
      requiredReplicaCount: options.requiredReplicaCount,
      timeoutBudget: options.timeoutBudget,
      failOnTimeout: false,
      maxWaitMs: remainingBudgetMs,
      explicitTargetNodeIds: options.explicitTargetNodeIds || [],
      allowAdaptiveAdmissionConvergenceWait: false,
      cancellationToken: options.cancellationToken || null,
    });
  }

  logTransientProvisioningHoldWait(options, remainingBudgetMs) {
    const admissionConvergence = options.admissionConvergence || null;
    this.logger.warn(QUERY_LOG_MSG.TABLE_PARTITION_TRANSIENT_HOLD_WAIT, {
      partitionId: options.partitionId || null,
      requiredReplicaCount: options.requiredReplicaCount || null,
      rejectedTargetNodePlans:
        admissionConvergence?.rejectedTargetNodePlans || [],
      remainingBudgetMs,
    });
  }
}

function createSQLQueryEngineProvisioningDeadlineMethods() {
  return Object.fromEntries(
    Object.entries(
      Object.getOwnPropertyDescriptors(
        SQLQueryEngineProvisioningDeadlineMethods.prototype,
      ),
    ).filter(([name]) => name !== LOCAL_STR_CONSTRUCTOR),
  );
}

export {createSQLQueryEngineProvisioningDeadlineMethods};
