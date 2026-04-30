import {
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
} from '../query/query-constants.js';
import {
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../control-plane/pressure-governor.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {TIMEOUT_BUDGET_DEFAULT} from '../control-plane/timeout-budget.js';
import {DurableWorkflowCoordinator} from '../workflow/durable-workflow-coordinator.js';
import {OperationLane} from '../workflow/operation-lane.js';
import {TimeoutPolicy} from '../workflow/timeout-policy.js';
import {WorkflowStepRunner} from '../workflow/workflow-step-runner.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  SPLIT_OWNER_MANAGED_PHASES,
} from './partition-constants.js';
import {
  ManagedSplitWorkflowStateMethods,
} from './managed-split-workflow-state-methods.js';
import {
  ManagedSplitWorkflowProvisioningMethods,
} from './managed-split-workflow-provisioning-methods.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_1CWET = 'getCDCIntegrationService';
const LOCAL_STR_GETPARTITIONINFO = 'getPartitionInfo';
const LOCAL_STR_GETTABLEINFO = 'getTableInfo';
const LOCAL_STR_LISTTABLEINFOS = 'listTableInfos';
const LOCAL_STR_13EV6 = 'parsePartitionTransition';
const LOCAL_STR_1OE64 = 'isLocalManagedSplitLeader';
const LOCAL_STR_1OAEZ = 'resolveActivePartitionVersion';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_FBFR4 = 'buildManagedSplitPlan';
const LOCAL_STR_HRKK1 = 'resolveProvisionTargetNodeIds';
const LOCAL_STR_1IQXE = 'getRoutablePartitionServiceNodeIds';
const LOCAL_STR_18K48 = 'isCriticalSystemPartition';
const LOCAL_STR_1GLE7 = 'captureTopologySnapshot';
const LOCAL_STR_VWH5M = 'calculateQuorumReplicaCount';
const LOCAL_STR_2DB32 = 'createExecutionTimeoutBudget';
const LOCAL_STR_3FLMF = 'estimateSplitAdmissionBytes';
const LOCAL_STR_Z50CU = 'waitForTablePartitionMetadata';
const LOCAL_STR_13QHT = 'probeInitialTablePartitionProvisioning';
const LOCAL_STR_W8LVO = 'provisionInitialTablePartition';
const LOCAL_STR_5AZGL = 'startSplitReplicationOnSourcePartition';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_MANAGED_SPLIT = 'managed_split';
const LOCAL_STR_X9S84 = 'managed-split-workflow';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_12R5E = 'partition:split:workflow';
const LOCAL_STR_10NUJ = 'control-plane:write';
const LOCAL_STR_WR5H7 = 'control_plane_backpressure';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_COMMA = ',';
const LOCAL_STR_CONSTRUCTOR = 'constructor';

const ACTIVE_PARTITION_STATE = 'NORMAL';
const DEFAULT_QUORUM_REPLICA_COUNT = 1;
const DEFAULT_RETRY_BASE_DELAY_MS = 5000;
const DEFAULT_RETRY_MAX_DELAY_MS = 60000;
const SPLIT_BOOTSTRAP_ROUTING_READINESS_DIMENSION =
  CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
const MANAGED_SPLIT_MUTATION_OPTIONS = Object.freeze({
  allowPressureDefer: false,
  workClass: PRESSURE_WORK_CLASS.CRITICAL,
});

function bindTopologyMethod(topologyAdapter, methodName) {
  if (!topologyAdapter ||
      typeof topologyAdapter[methodName] !== LOCAL_STR_FUNCTION) {
    return null;
  }
  return topologyAdapter[methodName].bind(topologyAdapter);
}

/**
 * First-class managed split workflow owner.
 */
class ManagedSplitWorkflow {
  /**
   * @param {Object} options - Workflow options.
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this.topologyAdapter = options.topologyAdapter || null;
    this.getCDCIntegrationService =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_1CWET) ||
      options.getCDCIntegrationService ||
      (() => options.cdcIntegrationService || null);
    this.getPartitionInfo =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_GETPARTITIONINFO) ||
      options.getPartitionInfo || (() => null);
    this.getTableInfo =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_GETTABLEINFO) ||
      options.getTableInfo || (() => null);
    this.listTableInfos =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_LISTTABLEINFOS) ||
      options.listTableInfos || (() => []);
    this.parsePartitionTransition =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_13EV6) ||
      options.parsePartitionTransition ||
      (() => null);
    this.isLocalManagedSplitLeader =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_1OE64) ||
      options.isLocalManagedSplitLeader ||
      (() => false);
    this.resolveActivePartitionVersion =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_1OAEZ) ||
      options.resolveActivePartitionVersion ||
      (() => LOCAL_NUM_ONE);
    this.buildManagedSplitPlan =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_FBFR4) ||
      options.buildManagedSplitPlan ||
      (async () => {
        throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED);
      });
    this.resolveProvisionTargetNodeIds =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_HRKK1) ||
      options.resolveProvisionTargetNodeIds ||
      (() => []);
    this.getRoutablePartitionServiceNodeIds =
      bindTopologyMethod(
        this.topologyAdapter,
        LOCAL_STR_1IQXE,
      ) ||
      options.getRoutablePartitionServiceNodeIds ||
      (() => []);
    this.isCriticalSystemPartition =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_18K48) ||
      options.isCriticalSystemPartition ||
      (() => false);
    this.captureTopologySnapshot =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_1GLE7) ||
      options.captureTopologySnapshot || null;
    this.calculateQuorumReplicaCount =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_VWH5M) ||
      options.calculateQuorumReplicaCount ||
      (() => DEFAULT_QUORUM_REPLICA_COUNT);
    this.storageAdmissionService =
      options.storageAdmissionService ||
      this.topologyAdapter?.storageAdmissionService || null;
    this.createExecutionTimeoutBudget =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_2DB32) ||
      options.createExecutionTimeoutBudget || null;
    this.messageRouter =
      options.messageRouter || this.topologyAdapter?.messageRouter || null;
    this.pressureGovernor = options.pressureGovernor || null;
    this.estimateSplitAdmissionBytes =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_3FLMF) ||
      options.estimateSplitAdmissionBytes ||
      ((partitionInfo) => this.defaultEstimateSplitAdmissionBytes(partitionInfo));
    this.waitForTablePartitionMetadata =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_Z50CU) ||
      options.waitForTablePartitionMetadata || (async () => {});
    this.probeInitialTablePartitionProvisioning =
      bindTopologyMethod(
        this.topologyAdapter,
        LOCAL_STR_13QHT,
      ) ||
      options.probeInitialTablePartitionProvisioning || null;
    this.provisionInitialTablePartition =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_W8LVO) ||
      options.provisionInitialTablePartition || (async () => {});
    this.startSplitReplicationOnSourcePartition =
      bindTopologyMethod(
        this.topologyAdapter,
        LOCAL_STR_5AZGL,
      ) ||
      options.startSplitReplicationOnSourcePartition || (async () => {});
    this.logger = options.logger || this.topologyAdapter?.logger || console;
    this.now = options.now || (() => Date.now());
    this.retryBaseDelayMs =
      Number.isFinite(options.retryBaseDelayMs) &&
      options.retryBaseDelayMs > LOCAL_NUM_ZERO ?
        Math.floor(options.retryBaseDelayMs) :
        DEFAULT_RETRY_BASE_DELAY_MS;
    this.retryMaxDelayMs =
      Number.isFinite(options.retryMaxDelayMs) &&
      options.retryMaxDelayMs > LOCAL_NUM_ZERO ?
        Math.floor(options.retryMaxDelayMs) :
        DEFAULT_RETRY_MAX_DELAY_MS;
    this.transactionCoordinator =
      options.transactionCoordinator ||
      this.topologyAdapter?.transactionCoordinator ||
      null;
    this.workflowCoordinator = options.workflowCoordinator ||
      new DurableWorkflowCoordinator({
        persistWorkflow: async (workflow) =>
          this.persistWorkflowTransition(workflow),
        persistParticipant: async (participant) =>
          this.persistWorkflowParticipantState(participant),
        now: this.now,
      });
    this.executionTimeoutPolicy = options.executionTimeoutPolicy ||
      new TimeoutPolicy({
        operationName: LOCAL_STR_MANAGED_SPLIT,
        configuredBudgetMs: TIMEOUT_BUDGET_DEFAULT.SPLIT_OPERATION_BUDGET_MS,
        now: this.now,
      });
    this.splitOperationLane = options.splitOperationLane ||
      new OperationLane({
        name: LOCAL_STR_X9S84,
        workflowCoordinator: this.workflowCoordinator,
        ownerKeyFactory: ({partitionId, ownerKey}) =>
          String(ownerKey || partitionId || LOCAL_STR_EMPTY),
      });
    this.workflowStepRunner = options.workflowStepRunner ||
      new WorkflowStepRunner({
        workflowCoordinator: this.workflowCoordinator,
        operationLane: this.splitOperationLane,
        timeoutPolicy: this.executionTimeoutPolicy,
        now: this.now,
      });
  }

  /**
   * Execute one managed partition split.
   * @param {string} partitionId - Source partition ID.
   * @param {Object} [executionOptions={}] - Optional admission metadata.
   * @return {Promise<Object>} Split orchestration result.
   */
  execute(partitionId, executionOptions = {}) {
    if (!partitionId) {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_PARTITION_NOT_FOUND);
    }

    return this.splitOperationLane.run(
      {partitionId, ...executionOptions},
      async (laneExecution) => this.executeInternal(partitionId, {
        ...executionOptions,
        timeoutBudget:
          laneExecution?.timeoutBudget ||
          executionOptions.timeoutBudget ||
          null,
      }),
    );
  }

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

  /**
   * Execute one managed split after single-flight admission.
   * @param {string} partitionId - Source partition ID.
   * @return {Promise<Object>} Split orchestration result.
   * @private
   */
  async executeInternal(partitionId, executionContext = {}) {
    const partitionInfo = this.getPartitionInfo(partitionId);
    if (!partitionInfo) {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_PARTITION_NOT_FOUND);
    }
    if (!this.isLocalManagedSplitLeader(partitionInfo)) {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_LEADER_REQUIRED);
    }

    const tableName = partitionInfo.table_name || partitionInfo.tableName;
    const tableId = partitionInfo.table_id || partitionInfo.tableId;
    const tableInfo = this.getTableInfo(tableName || tableId);
    if (!tableInfo) {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_TABLE_NOT_FOUND);
    }
    const existingTransition = this.parsePartitionTransition(tableInfo);
    if (existingTransition &&
        !this.isRetryableAdmissionState(existingTransition)) {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_ALREADY_IN_PROGRESS);
    }

    const primaryKeyColumn = String(
      tableInfo.partition_key || tableInfo.partitionKey || '',
    );
    if (!primaryKeyColumn || primaryKeyColumn.includes(LOCAL_STR_COMMA)) {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_PRIMARY_KEY_REQUIRED);
    }

    const replicaCount = Number.isInteger(partitionInfo.replica_count) &&
      partitionInfo.replica_count > 0 ?
      partitionInfo.replica_count :
      DEFAULT_QUORUM_REPLICA_COUNT;
    const splitBootstrapReplicaCount =
      this.calculateQuorumReplicaCount(replicaCount);
    const criticalSystemPartition =
      this.isCriticalSystemPartition(partitionId) === true;
    const sourceRoutableNodeIds = this.getRoutablePartitionServiceNodeIds(
      partitionId,
    );
    const discoveredTargetNodeIds = this.resolveProvisionTargetNodeIds(
      Number.MAX_SAFE_INTEGER,
    );
    const candidateTargetNodeIds = this.resolveAdmissionCandidateTargetNodeIds(
      discoveredTargetNodeIds,
      sourceRoutableNodeIds,
      splitBootstrapReplicaCount,
    );
    const targetVersion = this.resolveTargetPartitionVersion(
      tableInfo,
      existingTransition,
    );
    const workflowId = this.resolveWorkflowId(
      tableId,
      partitionId,
      targetVersion,
      existingTransition,
    );
    const retryMetadata = this.resolvePendingRetryMetadata(
      existingTransition,
    );
    const scheduledRetry = this.resolveScheduledRetry(existingTransition);
    const scheduledRetryOutcome = await this.resolveExecutionGateOutcome({
      partitionId,
      tableId,
      tableName,
      workflowId,
      targetVersion,
      existingTransition,
      scheduledRetry,
    });
    if (scheduledRetryOutcome.blocked === true) {
      return scheduledRetryOutcome.result;
    }
    const pressureDecision = this.evaluatePressure(executionContext);
    const pressureGateOutcome = await this.resolveExecutionGateOutcome({
      partitionId,
      tableId,
      tableName,
      retryMetadata,
      pressureDecision,
    });
    if (pressureGateOutcome.blocked === true) {
      return pressureGateOutcome.result;
    }
    this.logger.info(QUERY_LOG_MSG.TABLE_SPLIT_START, {
      partitionId,
      tableId,
      tableName,
      primaryKeyColumn,
    });
    const now = this.now();
    const executionTimeoutBudget = executionContext.timeoutBudget ||
      (typeof this.createExecutionTimeoutBudget === 'function' ?
        this.createExecutionTimeoutBudget() :
        this.executionTimeoutPolicy.createTopLevelBudget({
          configuredBudgetMs:
            TIMEOUT_BUDGET_DEFAULT.SPLIT_OPERATION_BUDGET_MS,
        }));
    const estimatedBytes = this.estimateSplitAdmissionBytes(
      partitionInfo,
      tableInfo,
    );
    const topologySnapshot = await this.resolveTopologySnapshot({
      tableId,
      tableName,
      tableInfo,
      partitionId,
      partitionInfo,
      targetVersion,
      requiredReplicaCount: splitBootstrapReplicaCount,
      sourceRoutableNodeIds,
      discoveredTargetNodeIds,
      candidateTargetNodeIds,
      retryMetadata,
    });
    const snapshotSourceRoutableNodeIds = this.normalizeNodeIdList(
      topologySnapshot?.sourceRoutableNodeIds,
      sourceRoutableNodeIds,
    );
    const snapshotCandidateTargetNodeIds = this.normalizeNodeIdList(
      topologySnapshot?.candidateTargetNodeIds,
      candidateTargetNodeIds,
    );
    const snapshotDiscoveredTargetNodeIds = this.normalizeNodeIdList(
      topologySnapshot?.discoveredTargetNodeIds,
      discoveredTargetNodeIds,
    );
    const minimumRoutableSourceCount = this.resolveSplitMinimumRoutableSourceCount({
      requiredReplicaCount: splitBootstrapReplicaCount,
      isCriticalSystemPartition: criticalSystemPartition,
    });
    const persistedTopologySnapshot = {
      ...topologySnapshot,
      discoveredTargetNodeIds: snapshotDiscoveredTargetNodeIds,
      candidateTargetNodeIds: snapshotCandidateTargetNodeIds,
      sourceRoutableNodeIds: snapshotSourceRoutableNodeIds,
    };
    const workflow = await this.workflowCoordinator.registerWorkflow({
      workflowId,
      ownerKey: partitionId,
      tableId,
      tableName,
      partitionId,
      status: PARTITION_TRANSITION_STATE.ADMISSION_PENDING,
      metadata: this.buildPendingTransitionMetadata({
        workflowId,
        partitionId,
        primaryKeyColumn,
        targetVersion,
        requiredReplicaCount: splitBootstrapReplicaCount,
        minimumRoutableSourceCount,
        isCriticalSystemPartition: criticalSystemPartition,
        candidateTargetNodeIds: snapshotCandidateTargetNodeIds,
        sourceRoutableNodeIds: snapshotSourceRoutableNodeIds,
        topologySnapshot: persistedTopologySnapshot,
        retryMetadata,
        estimatedBytes,
      }),
      createdAt: now,
      updatedAt: now,
    });

    try {
      const admissionResult = await this.evaluateSplitAdmission({
        candidateTargetNodeIds: snapshotCandidateTargetNodeIds,
        estimatedBytes,
        requiredReplicaCount: splitBootstrapReplicaCount,
        minimumRoutableSourceCount,
        sourceRoutableNodeIds: snapshotSourceRoutableNodeIds,
        isCriticalSystemPartition: criticalSystemPartition,
      });
      const compactAdmission = this.compactAdmissionResult(
        admissionResult,
        {
          discoveredTargetNodeIds: snapshotDiscoveredTargetNodeIds,
          candidateTargetNodeIds: snapshotCandidateTargetNodeIds,
          minimumRoutableSourceCount,
          estimatedBytes,
          sourceRoutableNodeIds: snapshotSourceRoutableNodeIds,
          isCriticalSystemPartition: criticalSystemPartition,
        },
      );
      const admissionGateOutcome = await this.resolveExecutionGateOutcome({
        partitionId,
        tableId,
        tableName,
        workflowId,
        targetVersion,
        retryMetadata,
        admissionResult,
        compactAdmission,
        workflowMetadata: workflow.metadata,
      });
      if (admissionGateOutcome.blocked === true) {
        return admissionGateOutcome.result;
      }

      let splitPlan = this.resolvePersistedSplitPlan(
        existingTransition,
        partitionInfo,
      );
      if (!splitPlan) {
        try {
          splitPlan = await this.buildManagedSplitPlan(
            partitionInfo,
            tableName,
            tableId,
            primaryKeyColumn,
          );
        } catch (error) {
          const deferredExecution =
            await this.handleRetryableSplitPlanningFailure({
              workflowId,
              partitionId,
              tableId,
              tableName,
              targetVersion,
              admission: compactAdmission,
              retryMetadata,
              error,
            });
          if (deferredExecution) {
            return deferredExecution;
          }
          throw error;
        }
      }
      const childProvisioningTargetNodeIdsByPartitionId =
        this.planChildProvisioningTargetNodeIds({
          childPartitionIds: [
            splitPlan.leftPartition.partitionId,
            splitPlan.rightPartition.partitionId,
          ],
          eligibleNodeIds: compactAdmission.eligibleNodeIds,
          candidateTargetNodeIds: snapshotCandidateTargetNodeIds,
          sourceRoutableNodeIds: snapshotSourceRoutableNodeIds,
          replicaCount,
          preferredAnchorNodeId:
            partitionInfo.leader_node_id ||
            partitionInfo.leaderNodeId ||
            this.nodeId,
        });
      const childProvisioningAdmissionByPartitionId =
        await this.probeChildProvisioningAdmissions({
          childProvisioningTargetNodeIdsByPartitionId,
          minimumRoutableReplicaCount: splitBootstrapReplicaCount,
        });
      const transitionTopologySnapshot = {
        ...persistedTopologySnapshot,
        childProvisioningTargetNodeIdsByPartitionId: JSON.parse(
          JSON.stringify(childProvisioningTargetNodeIdsByPartitionId),
        ),
        childProvisioningAdmissionByPartitionId: JSON.parse(
          JSON.stringify(childProvisioningAdmissionByPartitionId),
        ),
      };
      const childProvisioningDeferral =
        await this.handleChildProvisioningPrecheckFailure({
          workflowId,
          partitionId,
          tableId,
          tableName,
          targetVersion,
          admission: compactAdmission,
          topologySnapshot: transitionTopologySnapshot,
          retryMetadata,
          minimumRoutableReplicaCount: splitBootstrapReplicaCount,
          childProvisioningAdmissionByPartitionId,
        });
      if (childProvisioningDeferral) {
        return childProvisioningDeferral;
      }
      const transitionMetadata = {
        ...workflow.metadata,
        [PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]:
          compactAdmission,
        [PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT]:
          transitionTopologySnapshot,
        [PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY]:
          splitPlan.medianKey,
        [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]: [
          splitPlan.leftPartition.partitionId,
          splitPlan.rightPartition.partitionId,
        ],
      };
      this.ensureCanonicalSplitParticipants(
        workflowId,
        transitionMetadata,
      );
      await this.workflowCoordinator.updateWorkflow(workflowId, {
        status: PARTITION_TRANSITION_STATE.SPLIT_PREPARING,
        metadata: transitionMetadata,
      });

      const leftPartitionMetadata = {
        partition_id: splitPlan.leftPartition.partitionId,
        table_id: tableId,
        table_name: tableName,
        partition_key_start: splitPlan.leftPartition.keyRange.start,
        partition_key_end: splitPlan.leftPartition.keyRange.end,
        partition_version: targetVersion,
        replica_count: replicaCount,
        size_bytes: 0,
        leader_node_id: null,
        state: ACTIVE_PARTITION_STATE,
        created_at: now,
        updated_at: now,
      };
      const rightPartitionMetadata = {
        partition_id: splitPlan.rightPartition.partitionId,
        table_id: tableId,
        table_name: tableName,
        partition_key_start: splitPlan.rightPartition.keyRange.start,
        partition_key_end: splitPlan.rightPartition.keyRange.end,
        partition_version: targetVersion,
        replica_count: replicaCount,
        size_bytes: 0,
        leader_node_id: null,
        state: ACTIVE_PARTITION_STATE,
        created_at: now,
        updated_at: now,
      };

      await this.ensureChildPartitionMetadata({
        leftPartitionMetadata,
        rightPartitionMetadata,
      });
      await Promise.all([
        this.waitForTablePartitionMetadata(
          tableId,
          splitPlan.leftPartition.partitionId,
          executionTimeoutBudget,
        ),
        this.waitForTablePartitionMetadata(
          tableId,
          splitPlan.rightPartition.partitionId,
          executionTimeoutBudget,
        ),
      ]);

      await this.provisionInitialTablePartition({
        tableId,
        tableName,
        tableMetadata: tableInfo,
        partitionId: splitPlan.leftPartition.partitionId,
        partitionMetadata: leftPartitionMetadata,
        replicaCount,
        minimumRoutableReplicaCount: splitBootstrapReplicaCount,
        targetNodeIds:
          childProvisioningTargetNodeIdsByPartitionId[
            splitPlan.leftPartition.partitionId
          ] || snapshotCandidateTargetNodeIds,
        admissionConvergence:
          childProvisioningAdmissionByPartitionId[
            splitPlan.leftPartition.partitionId
          ] || null,
        timeoutBudget: executionTimeoutBudget,
        topologySnapshot: transitionTopologySnapshot,
        routingReadinessDimension:
          SPLIT_BOOTSTRAP_ROUTING_READINESS_DIMENSION,
      });
      await this.provisionInitialTablePartition({
        tableId,
        tableName,
        tableMetadata: tableInfo,
        partitionId: splitPlan.rightPartition.partitionId,
        partitionMetadata: rightPartitionMetadata,
        replicaCount,
        minimumRoutableReplicaCount: splitBootstrapReplicaCount,
        targetNodeIds:
          childProvisioningTargetNodeIdsByPartitionId[
            splitPlan.rightPartition.partitionId
          ] || snapshotCandidateTargetNodeIds,
        admissionConvergence:
          childProvisioningAdmissionByPartitionId[
            splitPlan.rightPartition.partitionId
          ] || null,
        timeoutBudget: executionTimeoutBudget,
        topologySnapshot: transitionTopologySnapshot,
        routingReadinessDimension:
          SPLIT_BOOTSTRAP_ROUTING_READINESS_DIMENSION,
      });

      await this.workflowCoordinator.updateWorkflow(workflowId, {
        status: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
        metadata: transitionMetadata,
      });

      await this.startSplitReplicationOnSourcePartition(
        partitionId,
        tableId,
        tableName,
        transitionMetadata,
      );

      this.logger.info(QUERY_LOG_MSG.TABLE_SPLIT_PREPARED, {
        partitionId,
        tableId,
        tableName,
        targetVersion,
        targetPartitionIds:
          transitionMetadata[
            PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
          ],
        workflowId,
      });

      return {
        success: true,
        partitionId,
        tableId,
        tableName,
        workflowId,
        targetVersion,
        admission: compactAdmission,
        splitKey:
          transitionMetadata[PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY],
        targetPartitionIds:
          transitionMetadata[
            PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
          ],
      };
    } catch (error) {
      const activeWorkflow = this.workflowCoordinator.getWorkflowById(
        workflowId,
      );
      const deferredExecution =
        await this.handleRetryablePostAdmissionExecutionFailure({
          workflowId,
          partitionId,
          tableId,
          tableName,
          targetVersion,
          retryMetadata,
          admission:
            activeWorkflow?.metadata?.[
              PARTITION_TRANSITION_METADATA_FIELD.ADMISSION
            ] || null,
          error,
        });
      if (deferredExecution) {
        return deferredExecution;
      }
      await this.persistExecutionFailure(workflowId, error);
      throw error;
    } finally {
      this.workflowCoordinator.removeWorkflow(workflow.workflowId);
    }
  }
}

function assignManagedSplitWorkflowMethods(targetPrototype, sourcePrototype) {
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetPrototype, methodName, descriptor);
  }
}

assignManagedSplitWorkflowMethods(
  ManagedSplitWorkflow.prototype,
  ManagedSplitWorkflowStateMethods.prototype,
);
assignManagedSplitWorkflowMethods(
  ManagedSplitWorkflow.prototype,
  ManagedSplitWorkflowProvisioningMethods.prototype,
);

export {
  ManagedSplitWorkflow,
};
