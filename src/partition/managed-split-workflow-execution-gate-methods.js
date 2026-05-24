import {
  QUERY_ERROR_MSG,
} from '../query/query-constants.js';
import {
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../control-plane/pressure-governor.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  SPLIT_OWNER_MANAGED_PHASES,
} from './partition-constants.js';

const LOCAL_NUM_ONE = 1;
const LOCAL_STR_12R5E = 'partition:split:workflow';
const LOCAL_STR_10NUJ = 'control-plane:write';
const LOCAL_STR_WR5H7 = 'control_plane_backpressure';
const LOCAL_STR_OBJECT = 'object';

const DEFAULT_RETRY_BASE_DELAY_MS = 5000;
const MANAGED_SPLIT_MUTATION_OPTIONS = Object.freeze({
  allowPressureDefer: false,
  workClass: PRESSURE_WORK_CLASS.CRITICAL,
});

class ManagedSplitWorkflowExecutionGateMethods {
  /**
   * Resolve the shared pressure governor for this node.
   * @return {PressureGovernor}
   * @private
   */
  getPressureGovernor() {
    if (this.pressureGovernor) {
      this.pressureGovernor.configure?.({
        messageRouter: this.messageRouter,
      });
      return this.pressureGovernor;
    }
    this.pressureGovernor = PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
    });
    return this.pressureGovernor;
  }

  /**
   * Evaluate node-local pressure for split execution.
   * @param {Object} [executionContext={}]
   * @return {Object}
   * @private
   */
  evaluatePressure(executionContext = {}) {
    return this.getPressureGovernor().evaluate({
      workClass: executionContext.workClass || PRESSURE_WORK_CLASS.BACKGROUND,
      resourceKeys: [
        LOCAL_STR_12R5E,
        LOCAL_STR_10NUJ,
      ],
      allowDegrade: false,
      allowDefer: executionContext.allowPressureDefer !== false,
      retryAfterMs: executionContext.pressureRetryAfterMs,
    });
  }

  /**
   * Build a typed split deferral without creating new durable control-plane
   * writes while the local node is already hot.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  buildPressureDeferredResult(options = {}) {
    const retryAfterMs = Number.isFinite(options?.pressureDecision?.retryAfterMs) ?
      options.pressureDecision.retryAfterMs :
      DEFAULT_RETRY_BASE_DELAY_MS;
    const nextAttemptAt = new Date(this.now() + retryAfterMs).toISOString();
    return {
      success: false,
      partitionId: options.partitionId,
      tableId: options.tableId || null,
      tableName: options.tableName || null,
      workflowId: options.workflowId || null,
      targetVersion: options.targetVersion || null,
      state: PARTITION_TRANSITION_STATE.DEFERRED,
      error: LOCAL_STR_WR5H7,
      retryScheduled: true,
      nextAttemptAt,
      retry: {
        attemptCount:
          options.retryMetadata?.attemptCount || LOCAL_NUM_ONE,
        lastAttemptAt:
          options.retryMetadata?.lastAttemptAt ||
          new Date(this.now()).toISOString(),
        nextAttemptAt,
        backoffMs: retryAfterMs,
        scheduledState: PARTITION_TRANSITION_STATE.DEFERRED,
      },
      pressureAction: options?.pressureDecision?.action || null,
      pressureSummary: options?.pressureDecision?.summary || null,
    };
  }

  /**
   * Build canonical control-plane mutation options for managed split
   * lifecycle writes.
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildManagedSplitMutationOptions(options = {}) {
    return {
      ...MANAGED_SPLIT_MUTATION_OPTIONS,
      ...(options && typeof options === LOCAL_STR_OBJECT ? options : {}),
    };
  }

  /**
   * Advance the durable split phase for a given workflow.
   *
   * This is the ONLY entry point for persisting split lifecycle phase
   * transitions. Execution participants (PartitionService, child
   * partitions) MUST NOT write partition_transition_state directly.
   * They call this method through the workflow owner callback.
   *
   * @param {string} workflowId - Active workflow identifier.
   * @param {string} nextPhase - Target PARTITION_TRANSITION_STATE value.
   * @param {Object} [phaseMetadata] - Additional fields to merge into
   *   the persisted transition metadata (e.g. active_partition_version,
   *   partition_count for cutover).
   * @return {Promise<void>}
   */
  async advanceSplitPhase(workflowId, nextPhase, phaseMetadata = {}) {
    if (!SPLIT_OWNER_MANAGED_PHASES.has(nextPhase)) {
      throw new Error(
        QUERY_ERROR_MSG.TABLE_SPLIT_INVALID_PHASE_TRANSITION,
      );
    }

    const workflow =
      this.resolveWorkflowState(workflowId);
    if (!workflow) {
      throw new Error(
        QUERY_ERROR_MSG.TABLE_SPLIT_WORKFLOW_NOT_FOUND,
      );
    }

    const updatedMetadata = {
      ...(workflow.metadata || {}),
      ...phaseMetadata,
    };

    await this.workflowStepRunner.runStep({
      workflowId,
      ownerKey: workflow.ownerKey,
      stepName: nextPhase,
      execute: async () => {
        return {
          nextStep: nextPhase,
          reason: nextPhase,
          updates: {
            status: nextPhase,
            metadata: updatedMetadata,
          },
          result: null,
        };
      },
    });
  }

  /**
   * Accept a typed source-side participant acknowledgement and persist
   * it through the canonical DurableWorkflowCoordinator path.
   *
   * PartitionService calls this at each execution boundary instead of
   * owning split phase transitions directly.
   *
   * @param {string} workflowId - Durable workflow identity.
   * @param {Object} ack - Acknowledgement payload using
   *   PARTICIPANT_ACK_FIELD keys (participantKey, status, fenceToken,
   *   checkpoint, acknowledgedAt).
   * @return {Promise<Object>} acknowledgeParticipant result.
   */
  async acknowledgeSourceParticipant(workflowId, ack) {
    if (!workflowId) {
      throw new Error(
        QUERY_ERROR_MSG.TABLE_SPLIT_WORKFLOW_NOT_FOUND,
      );
    }
    const workflow = this.resolveWorkflowState(workflowId);
    if (!workflow) {
      throw new Error(
        QUERY_ERROR_MSG.TABLE_SPLIT_WORKFLOW_NOT_FOUND,
      );
    }
    this.ensureCanonicalSplitParticipants(
      workflow.workflowId,
      workflow.metadata,
    );
    return this.workflowCoordinator.acknowledgeParticipant(
      workflowId,
      ack,
    );
  }

  /**
   * Build one canonical scheduled-retry gate result.
   * @param {Object} input - Scheduled-retry execution context.
   * @return {Object} Split execution result.
   * @private
   */
  buildScheduledRetryExecutionResult(input) {
    return {
      success: false,
      partitionId: input.partitionId,
      tableId: input.tableId,
      tableName: input.tableName,
      workflowId: input.workflowId,
      targetVersion: input.targetVersion,
      state: input.existingTransition.state,
      retryScheduled: true,
      nextAttemptAt: input.scheduledRetry.nextAttemptAt,
      retry: input.scheduledRetry,
    };
  }

  /**
   * Build one canonical admission-denied execution result.
   * @param {Object} input - Admission-denied execution context.
   * @return {Object} Split execution result.
   * @private
   */
  buildAdmissionDeniedExecutionResult(input) {
    return {
      success: false,
      partitionId: input.partitionId,
      tableId: input.tableId,
      tableName: input.tableName,
      workflowId: input.workflowId,
      targetVersion: input.targetVersion,
      state: input.deniedState,
      admission: input.compactAdmission,
      retry: input.deniedRetryMetadata,
    };
  }

  /**
   * Build an open execution-gate outcome.
   * @return {{blocked: boolean}} Open gate outcome.
   * @private
   */
  buildOpenExecutionGateOutcome() {
    return {blocked: false};
  }

  /**
   * Build a blocked execution-gate outcome.
   * @param {Object} result - Blocked execution result.
   * @return {{blocked: boolean, result: Object}} Blocked gate outcome.
   * @private
   */
  buildBlockedExecutionGateOutcome(result) {
    return {
      blocked: true,
      result,
    };
  }

  /**
   * Resolve one canonical execution-gate outcome.
   * @param {Object} input - Execution-gate evidence.
   * @return {Promise<{blocked: boolean, result?: Object}>} Gate outcome.
   * @private
   */
  async resolveExecutionGateOutcome(input) {
    if (input.scheduledRetry &&
        input.scheduledRetry.retryDue === false) {
      return this.buildBlockedExecutionGateOutcome(
        this.buildScheduledRetryExecutionResult(input),
      );
    }

    if (input.pressureDecision &&
        input.pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER) {
      return this.buildBlockedExecutionGateOutcome(
        this.buildPressureDeferredResult({
          partitionId: input.partitionId,
          tableId: input.tableId,
          tableName: input.tableName,
          retryMetadata: input.retryMetadata,
          pressureDecision: input.pressureDecision,
        }),
      );
    }

    if (input.admissionResult &&
        input.admissionResult.allowed === false) {
      const deniedState = this.resolveAdmissionDeniedState(
        input.admissionResult.decisionType,
      );
      const deniedRetryMetadata = this.buildScheduledRetryMetadata(
        input.retryMetadata,
        deniedState,
      );
      const deniedMetadata = {
        ...input.workflowMetadata,
        [PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]:
          input.compactAdmission,
        [PARTITION_TRANSITION_METADATA_FIELD.RETRY]:
          deniedRetryMetadata,
      };
      await this.workflowCoordinator.updateWorkflow(input.workflowId, {
        status: deniedState,
        metadata: deniedMetadata,
      });
      return this.buildBlockedExecutionGateOutcome(
        this.buildAdmissionDeniedExecutionResult({
          partitionId: input.partitionId,
          tableId: input.tableId,
          tableName: input.tableName,
          workflowId: input.workflowId,
          targetVersion: input.targetVersion,
          deniedState,
          compactAdmission: input.compactAdmission,
          deniedRetryMetadata,
        }),
      );
    }

    return this.buildOpenExecutionGateOutcome();
  }
}

export {
  ManagedSplitWorkflowExecutionGateMethods,
};
