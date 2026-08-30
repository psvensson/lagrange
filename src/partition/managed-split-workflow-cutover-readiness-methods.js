import {
  QUERY_DEFAULTS,
} from '../query/query-constants.js';
import {
  TIMEOUT_BUDGET_DEFAULT,
  getRemainingBudgetMs,
} from '../control-plane/timeout-budget.js';
import {
  MANAGED_SPLIT_LOG_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
import {
  SPLIT_CUTOVER_READINESS_DECISION,
  SPLIT_CUTOVER_REFUSAL_REASON,
} from './split-ack-constants.js';
import {
  PRE_CUTOVER_SPLIT_STATES,
} from './managed-split-workflow-execution-gate-methods.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_NUM_SPLIT_CHILD_COUNT = 2;

/**
 * Build one typed refusal outcome of the cutover readiness decision.
 * @param {string} reason - SPLIT_CUTOVER_REFUSAL_REASON value.
 * @param {Object} evidence - Child evidence carried on the refusal.
 * @return {Object}
 */
function buildCutoverRefusal(reason, evidence) {
  return Object.freeze({
    decision: SPLIT_CUTOVER_READINESS_DECISION.REFUSED,
    reason,
    ...evidence,
  });
}

/**
 * Cutover readiness methods for ManagedSplitWorkflow (run
 * 2026-08-30T12:20:17Z, MovieLens five-node load): the durable cutover
 * promoted the target epoch and the source dissolved 0.6 s later while
 * the right child's canonical leader service was readiness-denied
 * (planning_snapshot_refresh_pending), so writes to the right key range
 * had no routable participant. The owner now decides cutover readiness
 * from the query plane's routing evidence: every child partition's
 * canonical leader must be serve-routable. While it is not, the owner
 * waits on the existing provisioning budget and poll cadence (the same
 * bound the child routable wait uses) and the source keeps serving; a
 * budget that expires is a typed refusal, never a promoted epoch.
 */
class ManagedSplitWorkflowCutoverReadinessMethods {
  /**
   * Evaluate, from routing evidence, whether every child partition's
   * canonical leader service is routable for serving writes. Single
   * decision path: the first missing piece of evidence is the typed
   * refusal; nothing is inferred from a follower being routable.
   * @param {Object} workflow - Workflow snapshot.
   * @return {Object} SPLIT_CUTOVER_READINESS_DECISION outcome.
   * @private
   */
  evaluateSplitChildLeaderRoutability(workflow) {
    const targetPartitionIds = Array.isArray(
      workflow?.metadata?.[
        PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
      ],
    ) ?
      workflow.metadata[
        PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
      ].map((partitionId) => String(partitionId || '')) :
      [];
    if (targetPartitionIds.length !== LOCAL_NUM_SPLIT_CHILD_COUNT ||
        targetPartitionIds.some((partitionId) => partitionId.length === 0)) {
      return buildCutoverRefusal(
        SPLIT_CUTOVER_REFUSAL_REASON.TARGET_PARTITIONS_MISSING,
        {targetPartitionIds},
      );
    }
    const childLeaderNodeIds = {};
    for (const childPartitionId of targetPartitionIds) {
      const evidence = this.resolveSplitChildLeaderRoutingEvidence(
        childPartitionId,
      );
      const leaderNodeId = String(evidence?.leaderNodeId || '');
      const routableNodeIds = this.normalizeNodeIdList(
        evidence?.routableNodeIds,
      );
      if (!leaderNodeId) {
        return buildCutoverRefusal(
          SPLIT_CUTOVER_REFUSAL_REASON.CHILD_LEADER_UNKNOWN,
          {childPartitionId, routableNodeIds},
        );
      }
      if (!routableNodeIds.includes(leaderNodeId)) {
        return buildCutoverRefusal(
          SPLIT_CUTOVER_REFUSAL_REASON.CHILD_LEADER_NOT_ROUTABLE,
          {childPartitionId, leaderNodeId, routableNodeIds},
        );
      }
      childLeaderNodeIds[childPartitionId] = leaderNodeId;
    }
    return Object.freeze({
      decision: SPLIT_CUTOVER_READINESS_DECISION.ROUTABLE,
      childLeaderNodeIds,
    });
  }

  /**
   * Wait, on the existing child-provisioning budget and poll cadence,
   * until every child leader is serve-routable. The wait runs OUTSIDE
   * the serialized owner lane; the cutover step re-evaluates the same
   * decision inside the lane before the epoch write.
   * @param {Object} workflow - Workflow snapshot.
   * @return {Promise<Object>} The final readiness decision.
   * @private
   */
  async awaitSplitChildLeadersRoutable(workflow) {
    const budget = this.createSplitCutoverReadinessBudget();
    const pollIntervalMs = this.resolveRoutingWaitPollIntervalMs();
    let waitLogged = false;
    for (;;) {
      const decision = this.evaluateSplitChildLeaderRoutability(workflow);
      if (decision.decision === SPLIT_CUTOVER_READINESS_DECISION.ROUTABLE) {
        return decision;
      }
      const remainingMs = getRemainingBudgetMs(budget, {now: this.now});
      if (remainingMs <= 0) {
        return decision;
      }
      if (!waitLogged) {
        waitLogged = true;
        this.logger.info(MANAGED_SPLIT_LOG_MSG.CUTOVER_AWAITING_CHILD_LEADERS, {
          workflowId: workflow.workflowId,
          ...decision,
          remainingBudgetMs: remainingMs,
        });
      }
      await this.delay(Math.min(pollIntervalMs, remainingMs));
    }
  }

  /**
   * The readiness wait budget: the topology adapter's execution budget
   * (the engine's table-partition provisioning timeout, the same bound
   * the child routable wait runs under), else the split operation
   * budget of the owner's timeout policy.
   * @return {Object} Timeout budget.
   * @private
   */
  createSplitCutoverReadinessBudget() {
    if (typeof this.createExecutionTimeoutBudget === LOCAL_STR_FUNCTION) {
      const budget = this.createExecutionTimeoutBudget();
      if (budget) {
        return budget;
      }
    }
    return this.executionTimeoutPolicy.createTopLevelBudget({
      configuredBudgetMs: TIMEOUT_BUDGET_DEFAULT.SPLIT_OPERATION_BUDGET_MS,
    });
  }

  /**
   * Resolve the typed cutover outcome for one CATCHUP_READY ack: the
   * readiness decision (every child leader serve-routable) gates the
   * durable cutover; a refused decision leaves the workflow in its
   * pre-cutover state with the source still serving.
   * @param {string} workflowId
   * @return {Promise<{applied: boolean, readiness: Object|null}>}
   * @private
   */
  async resolveSplitCutoverOutcome(workflowId) {
    const workflow = this.resolveWorkflowState(workflowId);
    if (this.isSplitWorkflowStateUnavailable(workflow) ||
        workflow.status === PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE ||
        !PRE_CUTOVER_SPLIT_STATES.has(workflow.status)) {
      return {
        applied: await this.applySplitCutoverIfReady(workflowId),
        readiness: null,
      };
    }
    const readiness = await this.awaitSplitChildLeadersRoutable(workflow);
    if (readiness.decision !== SPLIT_CUTOVER_READINESS_DECISION.ROUTABLE) {
      this.logSplitCutoverRefused(workflowId, readiness);
      return {applied: false, readiness};
    }
    return {
      applied: await this.applySplitCutoverIfReady(workflowId),
      readiness,
    };
  }

  /**
   * Log the typed cutover refusal once the readiness budget is spent.
   * @param {string} workflowId
   * @param {Object} decision - Refused readiness decision.
   * @return {void}
   * @private
   */
  logSplitCutoverRefused(workflowId, decision) {
    this.logger.warn(
      MANAGED_SPLIT_LOG_MSG.CUTOVER_REFUSED_CHILD_LEADER_UNROUTABLE,
      {workflowId, ...decision},
    );
  }
}

/**
 * Default poll cadence when no topology adapter supplies the engine's
 * provisioning poll interval.
 * @return {number}
 */
function defaultRoutingWaitPollIntervalMs() {
  return QUERY_DEFAULTS.TABLE_CREATE_PROVISION_POLL_INTERVAL_MS;
}

export {
  ManagedSplitWorkflowCutoverReadinessMethods,
  defaultRoutingWaitPollIntervalMs,
};
