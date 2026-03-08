import {TABLES} from '../constants/index.js';
import {
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
} from '../query/query-constants.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
  STORAGE_ADMISSION_OPERATION_TYPE,
} from '../rebalancer/storage-admission-constants.js';
import {TIMEOUT_BUDGET_DEFAULT} from '../control-plane/timeout-budget.js';
import {DurableWorkflowCoordinator} from '../workflow/durable-workflow-coordinator.js';
import {OperationLane} from '../workflow/operation-lane.js';
import {TimeoutPolicy} from '../workflow/timeout-policy.js';
import {PARTICIPANT_ACK_FIELD} from '../workflow/workflow-constants.js';
import {WorkflowStepRunner} from '../workflow/workflow-step-runner.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  RETRYABLE_PARTITION_TRANSITION_STATES,
  SPLIT_OWNER_MANAGED_PHASES,
  SPLIT_MERGE_LOG_MSG,
} from './partition-constants.js';
import {SPLIT_PARTICIPANT_PREFIX} from './split-ack-constants.js';

const ACTIVE_PARTITION_STATE = 'NORMAL';
const DEFAULT_QUORUM_REPLICA_COUNT = 1;
const DEFAULT_RETRY_BASE_DELAY_MS = 5000;
const DEFAULT_RETRY_MAX_DELAY_MS = 60000;

/**
 * First-class managed split workflow owner.
 */
class ManagedSplitWorkflow {
  /**
   * @param {Object} options - Workflow options.
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this.getCDCIntegrationService = options.getCDCIntegrationService ||
      (() => options.cdcIntegrationService || null);
    this.getPartitionInfo = options.getPartitionInfo || (() => null);
    this.getTableInfo = options.getTableInfo || (() => null);
    this.parsePartitionTransition = options.parsePartitionTransition ||
      (() => null);
    this.isLocalManagedSplitLeader = options.isLocalManagedSplitLeader ||
      (() => false);
    this.resolveActivePartitionVersion = options.resolveActivePartitionVersion ||
      (() => 1);
    this.buildManagedSplitPlan = options.buildManagedSplitPlan ||
      (async () => {
        throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED);
      });
    this.resolveProvisionTargetNodeIds =
      options.resolveProvisionTargetNodeIds ||
      (() => []);
    this.getRoutablePartitionServiceNodeIds =
      options.getRoutablePartitionServiceNodeIds ||
      (() => []);
    this.captureTopologySnapshot =
      options.captureTopologySnapshot || null;
    this.calculateQuorumReplicaCount =
      options.calculateQuorumReplicaCount ||
      (() => DEFAULT_QUORUM_REPLICA_COUNT);
    this.storageAdmissionService = options.storageAdmissionService || null;
    this.createExecutionTimeoutBudget =
      options.createExecutionTimeoutBudget || null;
    this.estimateSplitAdmissionBytes =
      options.estimateSplitAdmissionBytes ||
      ((partitionInfo) => this.defaultEstimateSplitAdmissionBytes(partitionInfo));
    this.waitForTablePartitionMetadata =
      options.waitForTablePartitionMetadata || (async () => {});
    this.probeInitialTablePartitionProvisioning =
      options.probeInitialTablePartitionProvisioning || null;
    this.provisionInitialTablePartition =
      options.provisionInitialTablePartition || (async () => {});
    this.startSplitReplicationOnSourcePartition =
      options.startSplitReplicationOnSourcePartition || (async () => {});
    this.logger = options.logger || console;
    this.now = options.now || (() => Date.now());
    this.retryBaseDelayMs =
      Number.isFinite(options.retryBaseDelayMs) &&
      options.retryBaseDelayMs > 0 ?
        Math.floor(options.retryBaseDelayMs) :
        DEFAULT_RETRY_BASE_DELAY_MS;
    this.retryMaxDelayMs =
      Number.isFinite(options.retryMaxDelayMs) &&
      options.retryMaxDelayMs > 0 ?
        Math.floor(options.retryMaxDelayMs) :
        DEFAULT_RETRY_MAX_DELAY_MS;
    this.transactionCoordinator = options.transactionCoordinator || null;
    this.workflowCoordinator = options.workflowCoordinator ||
      new DurableWorkflowCoordinator({
        persistWorkflow: async (workflow) =>
          this.persistWorkflowTransition(workflow),
        now: this.now,
      });
    this.executionTimeoutPolicy = options.executionTimeoutPolicy ||
      new TimeoutPolicy({
        operationName: 'managed_split',
        configuredBudgetMs: TIMEOUT_BUDGET_DEFAULT.SPLIT_OPERATION_BUDGET_MS,
        now: this.now,
      });
    this.splitOperationLane = options.splitOperationLane ||
      new OperationLane({
        name: 'managed-split-workflow',
        workflowCoordinator: this.workflowCoordinator,
        ownerKeyFactory: ({partitionId, ownerKey}) =>
          String(ownerKey || partitionId || ''),
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
   * @return {Promise<Object>} Split orchestration result.
   */
  execute(partitionId) {
    if (!partitionId) {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_PARTITION_NOT_FOUND);
    }

    return this.splitOperationLane.run(
      {partitionId},
      async () => this.executeInternal(partitionId),
    );
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
      this.workflowCoordinator.getWorkflowById(workflowId);
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
    return this.workflowCoordinator.acknowledgeParticipant(
      workflowId,
      ack,
    );
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
        !this.isRetryableAdmissionState(existingTransition.state)) {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_ALREADY_IN_PROGRESS);
    }

    const primaryKeyColumn = String(
      tableInfo.partition_key || tableInfo.partitionKey || '',
    );
    if (!primaryKeyColumn || primaryKeyColumn.includes(',')) {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_PRIMARY_KEY_REQUIRED);
    }

    this.logger.info(QUERY_LOG_MSG.TABLE_SPLIT_START, {
      partitionId,
      tableId,
      tableName,
      primaryKeyColumn,
    });

    const replicaCount = Number.isInteger(partitionInfo.replica_count) &&
      partitionInfo.replica_count > 0 ?
      partitionInfo.replica_count :
      DEFAULT_QUORUM_REPLICA_COUNT;
    const splitBootstrapReplicaCount =
      this.calculateQuorumReplicaCount(replicaCount);
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
    if (scheduledRetry && scheduledRetry.retryDue === false) {
      return {
        success: false,
        partitionId,
        tableId,
        tableName,
        workflowId,
        targetVersion,
        state: existingTransition.state,
        retryScheduled: true,
        nextAttemptAt: scheduledRetry.nextAttemptAt,
        retry: scheduledRetry,
      };
    }
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
        sourceRoutableNodeIds: snapshotSourceRoutableNodeIds,
      });
      const compactAdmission = this.compactAdmissionResult(
        admissionResult,
        {
          discoveredTargetNodeIds: snapshotDiscoveredTargetNodeIds,
          candidateTargetNodeIds: snapshotCandidateTargetNodeIds,
          estimatedBytes,
          sourceRoutableNodeIds: snapshotSourceRoutableNodeIds,
        },
      );
      if (!admissionResult.allowed) {
        const deniedState = this.resolveAdmissionDeniedState(
          admissionResult.decisionType,
        );
        const deniedRetryMetadata = this.buildScheduledRetryMetadata(
          retryMetadata,
          deniedState,
        );
        const deniedMetadata = {
          ...workflow.metadata,
          [PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]:
            compactAdmission,
          [PARTITION_TRANSITION_METADATA_FIELD.RETRY]:
            deniedRetryMetadata,
        };
        await this.workflowCoordinator.updateWorkflow(workflowId, {
          status: deniedState,
          metadata: deniedMetadata,
        });
        return {
          success: false,
          partitionId,
          tableId,
          tableName,
          workflowId,
          targetVersion,
          state: deniedState,
          admission: compactAdmission,
          retry: deniedRetryMetadata,
        };
      }

      let splitPlan;
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

      await this.insertPartitionMetadataAtomically(
        leftPartitionMetadata,
        rightPartitionMetadata,
      );
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
        timeoutBudget: executionTimeoutBudget,
        topologySnapshot: transitionTopologySnapshot,
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
        timeoutBudget: executionTimeoutBudget,
        topologySnapshot: transitionTopologySnapshot,
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
      await this.persistExecutionFailure(workflowId, error);
      throw error;
    } finally {
      this.workflowCoordinator.removeWorkflow(workflow.workflowId);
    }
  }

  /**
   * Build the initial transition metadata persisted before admission.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  buildPendingTransitionMetadata(options) {
    return {
      [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]: options.workflowId,
      [PARTITION_TRANSITION_METADATA_FIELD.PRIMARY_KEY_COLUMN]:
        options.primaryKeyColumn,
      [PARTITION_TRANSITION_METADATA_FIELD.RETRY]:
        JSON.parse(JSON.stringify(options.retryMetadata)),
      [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID]:
        options.partitionId,
      [PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT]:
        JSON.parse(JSON.stringify(options.topologySnapshot)),
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]:
        options.targetVersion,
      [PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]: {
        state: PARTITION_TRANSITION_STATE.ADMISSION_PENDING,
        operationType: STORAGE_ADMISSION_OPERATION_TYPE.PARTITION_SPLIT,
        requiredReplicaCount: options.requiredReplicaCount,
        candidateTargetNodeIds: [...options.candidateTargetNodeIds],
        sourceRoutableNodeIds: [...options.sourceRoutableNodeIds],
        estimatedBytes: options.estimatedBytes,
        decisionTimestamp: new Date(this.now()).toISOString(),
      },
    };
  }

  /**
   * Reduce the admission result to durable workflow diagnostics.
   * @param {Object} result
   * @param {Object} context
   * @return {Object}
   * @private
   */
  compactAdmissionResult(result, context) {
    const compact = {
      state: result.decisionType,
      allowed: result.allowed === true,
      decisionType: result.decisionType,
      decision: result.decision,
      reason: result.reason,
      operationType: result.operationType,
      requiredReplicaCount: result.requiredReplicaCount,
      discoveredTargetNodeIds: Array.isArray(context.discoveredTargetNodeIds) ?
        [...context.discoveredTargetNodeIds] :
        [],
      candidateTargetNodeIds: [...context.candidateTargetNodeIds],
      sourceRoutableNodeIds: [...context.sourceRoutableNodeIds],
      eligibleNodeIds: Array.isArray(result.eligibleNodeIds) ?
        [...result.eligibleNodeIds] :
        [],
      ineligibleNodes: this.compactIneligibleNodes(result.ineligibleNodes),
      blockingReasons: Array.isArray(result.blockingReasons) ?
        [...result.blockingReasons] :
        [],
      decisionTimestamp: result.decisionTimestamp,
      estimatedBytes: context.estimatedBytes,
    };
    if (result.projectedUtilizationByNodeId &&
        typeof result.projectedUtilizationByNodeId === 'object') {
      compact.projectedUtilizationByNodeId = JSON.parse(
        JSON.stringify(result.projectedUtilizationByNodeId),
      );
    }
    if (result.projectedUtilization &&
        typeof result.projectedUtilization === 'object') {
      compact.projectedUtilization = JSON.parse(
        JSON.stringify(result.projectedUtilization),
      );
    }
    if (result.readinessSnapshots &&
        typeof result.readinessSnapshots === 'object') {
      compact.readinessSnapshots = JSON.parse(
        JSON.stringify(result.readinessSnapshots),
      );
    }
    return compact;
  }

  /**
   * Reduce ineligible-node entries to stable diagnostic fields.
   * @param {Object[]} entries
   * @return {Object[]}
   * @private
   */
  compactIneligibleNodes(entries) {
    if (!Array.isArray(entries)) {
      return [];
    }
    return entries.map((entry) => {
      return {
        nodeId: entry.nodeId,
        failedDimensions: Array.isArray(entry.failedDimensions) ?
          [...entry.failedDimensions] :
          [],
        reasonCodes: Array.isArray(entry.reasonCodes) ?
          [...entry.reasonCodes] :
          [],
        projectedUtilization:
          entry?.projectedUtilization &&
            typeof entry.projectedUtilization === 'object' ?
            JSON.parse(JSON.stringify(entry.projectedUtilization)) :
            null,
        nodeSummary: entry?.nodeSummary &&
          typeof entry.nodeSummary === 'object' ?
          JSON.parse(JSON.stringify(entry.nodeSummary)) :
          null,
      };
    });
  }

  /**
   * Probe each planned child cohort before any child partition metadata is
   * inserted so the workflow can defer instead of leaving metadata-only
   * children behind.
   * @param {Object} options
   * @return {Promise<Object<string, Object>>}
   * @private
   */
  async probeChildProvisioningAdmissions(options = {}) {
    const childProvisioningTargetNodeIdsByPartitionId =
      options.childProvisioningTargetNodeIdsByPartitionId &&
      typeof options.childProvisioningTargetNodeIdsByPartitionId === 'object' ?
        options.childProvisioningTargetNodeIdsByPartitionId :
        {};
    const minimumRoutableReplicaCount = Number.isInteger(
      options.minimumRoutableReplicaCount,
    ) && options.minimumRoutableReplicaCount > 0 ?
      options.minimumRoutableReplicaCount :
      1;
    const childProvisioningAdmissionByPartitionId = {};

    for (const [childPartitionId, targetNodeIdsRaw] of Object.entries(
      childProvisioningTargetNodeIdsByPartitionId,
    )) {
      const targetNodeIds = this.normalizeNodeIdList(targetNodeIdsRaw);
      const precheck = typeof this.probeInitialTablePartitionProvisioning ===
        'function' ?
        await this.probeInitialTablePartitionProvisioning({
          partitionId: childPartitionId,
          targetNodeIds,
          minimumRoutableReplicaCount,
        }) :
        null;
      const existingRoutableNodeIds = this.normalizeNodeIdList(
        precheck?.existingRoutableNodeIds,
      );
      const candidateTargetNodeIds = this.normalizeNodeIdList(
        precheck?.candidateTargetNodeIds,
        targetNodeIds,
      );
      const admittedTargetNodeIds = this.normalizeNodeIdList(
        precheck?.admittedTargetNodeIds,
      );
      const rejectedTargetNodePlans =
        this.compactChildProvisioningRejectedTargetNodePlans(
          precheck?.rejectedTargetNodePlans,
        );
      const maximumProvisionableReplicaCount = Number.isInteger(
        precheck?.maximumProvisionableReplicaCount,
      ) ?
        precheck.maximumProvisionableReplicaCount :
        (existingRoutableNodeIds.length + admittedTargetNodeIds.length);
      const allowed =
        maximumProvisionableReplicaCount >= minimumRoutableReplicaCount;

      childProvisioningAdmissionByPartitionId[childPartitionId] = {
        targetNodeIds,
        existingRoutableNodeIds,
        candidateTargetNodeIds,
        admittedTargetNodeIds,
        rejectedTargetNodePlans,
        maximumProvisionableReplicaCount,
        minimumRoutableReplicaCount,
        allowed,
        decisionType: allowed ?
          STORAGE_ADMISSION_DECISION_TYPE.ADMITTED :
          this.resolveChildProvisioningDecisionType(rejectedTargetNodePlans),
      };
    }

    return childProvisioningAdmissionByPartitionId;
  }

  /**
   * Reduce child provisioning rejections to stable durable diagnostics.
   * @param {Object[]} entries
   * @return {Object[]}
   * @private
   */
  compactChildProvisioningRejectedTargetNodePlans(entries) {
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries.map((entry) => {
      return {
        targetNodeId: String(entry?.targetNodeId || ''),
        decisionType: entry?.decisionType || null,
        blockingReasons: Array.isArray(entry?.blockingReasons) ?
          [...entry.blockingReasons] :
          [],
        reasonCodes: Array.isArray(entry?.reasonCodes) ?
          [...entry.reasonCodes] :
          [],
        nodeSummary: entry?.nodeSummary &&
          typeof entry.nodeSummary === 'object' ?
          JSON.parse(JSON.stringify(entry.nodeSummary)) :
          null,
        readinessSnapshot: entry?.readinessSnapshot &&
          typeof entry.readinessSnapshot === 'object' ?
          JSON.parse(JSON.stringify(entry.readinessSnapshot)) :
          null,
        message: entry?.message || null,
      };
    });
  }

  /**
   * Resolve one retryable denial type for child provisioning prechecks.
   * @param {Object[]} rejectedTargetNodePlans
   * @return {string}
   * @private
   */
  resolveChildProvisioningDecisionType(rejectedTargetNodePlans) {
    let sawBlocked = false;
    let sawDeferred = false;
    for (const rejection of rejectedTargetNodePlans || []) {
      const decisionType = String(rejection?.decisionType || '');
      if (decisionType === STORAGE_ADMISSION_DECISION_TYPE.BLOCKED) {
        sawBlocked = true;
      }
      if (decisionType === STORAGE_ADMISSION_DECISION_TYPE.DEFERRED) {
        sawDeferred = true;
      }
    }
    if (sawBlocked && !sawDeferred) {
      return STORAGE_ADMISSION_DECISION_TYPE.BLOCKED;
    }
    return STORAGE_ADMISSION_DECISION_TYPE.DEFERRED;
  }

  /**
   * Persist a retryable split deferral when one or more child provisioning
   * cohorts are not viable before child metadata insertion.
   * @param {Object} options
   * @return {Promise<Object|null>}
   * @private
   */
  async handleChildProvisioningPrecheckFailure(options) {
    const childProvisioningAdmissionByPartitionId =
      options.childProvisioningAdmissionByPartitionId &&
      typeof options.childProvisioningAdmissionByPartitionId === 'object' ?
        options.childProvisioningAdmissionByPartitionId :
        {};
    const failingChildPartitionIds = Object.entries(
      childProvisioningAdmissionByPartitionId,
    ).filter(([, admission]) => admission?.allowed !== true)
      .map(([childPartitionId]) => childPartitionId);

    if (failingChildPartitionIds.length === 0) {
      return null;
    }

    const failedAdmissions = failingChildPartitionIds.map((childPartitionId) =>
      childProvisioningAdmissionByPartitionId[childPartitionId],
    );
    const decisionType = failedAdmissions.every((admission) =>
      admission?.decisionType === STORAGE_ADMISSION_DECISION_TYPE.BLOCKED,
    ) ?
      STORAGE_ADMISSION_DECISION_TYPE.BLOCKED :
      STORAGE_ADMISSION_DECISION_TYPE.DEFERRED;
    const deniedState = this.resolveAdmissionDeniedState(decisionType);
    const workflow = this.workflowCoordinator.getWorkflowById(
      options.workflowId,
    );
    const retry = this.buildScheduledRetryMetadata(
      options.retryMetadata,
      deniedState,
    );
    const failureMessage = this.buildChildProvisioningPrecheckFailureMessage(
      failingChildPartitionIds,
      childProvisioningAdmissionByPartitionId,
    );
    const deniedMetadata = {
      ...(workflow?.metadata || {}),
      [PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]:
        options.admission,
      [PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT]:
        JSON.parse(JSON.stringify(options.topologySnapshot || {})),
      [PARTITION_TRANSITION_METADATA_FIELD.RETRY]:
        retry,
      [PARTITION_TRANSITION_METADATA_FIELD.FAILURE]: {
        classification: 'split_child_provisioning_precheck_failed',
        message: failureMessage,
        failedAt: new Date(this.now()).toISOString(),
        retryable: true,
        decisionType,
        minimumRoutableReplicaCount: options.minimumRoutableReplicaCount,
        childPartitionIds: [...failingChildPartitionIds],
      },
    };

    if (workflow) {
      await this.workflowCoordinator.updateWorkflow(options.workflowId, {
        status: deniedState,
        metadata: deniedMetadata,
      });
    }

    return {
      success: false,
      partitionId: options.partitionId,
      tableId: options.tableId,
      tableName: options.tableName,
      workflowId: options.workflowId,
      targetVersion: options.targetVersion,
      state: deniedState,
      admission: options.admission,
      retry,
      error: failureMessage,
      childProvisioningAdmissionByPartitionId:
        JSON.parse(JSON.stringify(childProvisioningAdmissionByPartitionId)),
    };
  }

  /**
   * Build one diagnostic message for insufficient child provisioning cohorts.
   * @param {string[]} failingChildPartitionIds
   * @param {Object<string, Object>} childProvisioningAdmissionByPartitionId
   * @return {string}
   * @private
   */
  buildChildProvisioningPrecheckFailureMessage(
    failingChildPartitionIds,
    childProvisioningAdmissionByPartitionId,
  ) {
    const details = [];
    for (const childPartitionId of failingChildPartitionIds) {
      const admission =
        childProvisioningAdmissionByPartitionId?.[childPartitionId] || {};
      details.push(
        `${childPartitionId}(required=` +
          `${admission.minimumRoutableReplicaCount || 0}, ` +
          `provisionable=${admission.maximumProvisionableReplicaCount || 0}, ` +
          `decision=${admission.decisionType || 'deferred'})`,
      );
    }

    return 'Managed split child provisioning precheck could not satisfy ' +
      'minimum routable cohorts: ' + details.join('; ');
  }

  /**
   * Resolve whether an existing transition may be retried through admission.
   * @param {string} state
   * @return {boolean}
   * @private
   */
  isRetryableAdmissionState(state) {
    return RETRYABLE_PARTITION_TRANSITION_STATES.has(state);
  }

  /**
   * Persist a retryable split-planning deferral when the source partition
   * simply has not accumulated enough rows yet.
   * @param {Object} options
   * @return {Promise<Object|null>}
   * @private
   */
  async handleRetryableSplitPlanningFailure(options) {
    if (!this.isRetryableSplitPlanningError(options.error)) {
      return null;
    }

    const workflow = this.workflowCoordinator.getWorkflowById(
      options.workflowId,
    );
    const deferredMetadata = {
      ...(workflow?.metadata || {}),
      [PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]:
        options.admission,
      [PARTITION_TRANSITION_METADATA_FIELD.RETRY]:
        this.buildScheduledRetryMetadata(
          options.retryMetadata,
          PARTITION_TRANSITION_STATE.DEFERRED,
        ),
      [PARTITION_TRANSITION_METADATA_FIELD.FAILURE]: {
        classification: 'split_plan_deferred',
        message:
          options.error?.message || SPLIT_MERGE_LOG_MSG.INSUFFICIENT_ROWS_FOR_SPLIT,
        failedAt: new Date(this.now()).toISOString(),
        retryable: true,
      },
    };

    if (workflow) {
      await this.workflowCoordinator.updateWorkflow(options.workflowId, {
        status: PARTITION_TRANSITION_STATE.DEFERRED,
        metadata: deferredMetadata,
      });
    }

    return {
      success: false,
      partitionId: options.partitionId,
      tableId: options.tableId,
      tableName: options.tableName,
      workflowId: options.workflowId,
      targetVersion: options.targetVersion,
      state: PARTITION_TRANSITION_STATE.DEFERRED,
      admission: options.admission,
      retry:
        deferredMetadata[PARTITION_TRANSITION_METADATA_FIELD.RETRY],
      error:
        options.error?.message || SPLIT_MERGE_LOG_MSG.INSUFFICIENT_ROWS_FOR_SPLIT,
    };
  }

  /**
   * Determine whether a split-planning error should be retried later rather
   * than persisted as a terminal workflow failure.
   * @param {Error} error
   * @return {boolean}
   * @private
   */
  isRetryableSplitPlanningError(error) {
    return String(error?.message || '') ===
      SPLIT_MERGE_LOG_MSG.INSUFFICIENT_ROWS_FOR_SPLIT;
  }

  /**
   * Resolve admission candidate targets from active discovery first, then
   * source-routable fallbacks when needed to satisfy split quorum.
   * @param {string[]} discoveredTargetNodeIds
   * @param {string[]} sourceRoutableNodeIds
   * @param {number} requiredReplicaCount
   * @return {string[]}
   * @private
   */
  resolveAdmissionCandidateTargetNodeIds(
    discoveredTargetNodeIds,
    sourceRoutableNodeIds,
    requiredReplicaCount,
  ) {
    const candidates = [];
    const seenNodeIds = new Set();
    const appendNodeIds = (nodeIds) => {
      if (!Array.isArray(nodeIds)) {
        return;
      }
      for (const nodeId of nodeIds) {
        const normalizedNodeId = String(nodeId || '');
        if (!normalizedNodeId || seenNodeIds.has(normalizedNodeId)) {
          continue;
        }
        seenNodeIds.add(normalizedNodeId);
        candidates.push(normalizedNodeId);
      }
    };

    appendNodeIds(discoveredTargetNodeIds);
    if (candidates.length < requiredReplicaCount) {
      appendNodeIds(sourceRoutableNodeIds);
    }

    return candidates;
  }

  /**
   * Resolve the denied transition state from an admission result.
   * @param {string} decisionType
   * @return {string}
   * @private
   */
  resolveAdmissionDeniedState(decisionType) {
    return decisionType === STORAGE_ADMISSION_DECISION_TYPE.DEFERRED ?
      PARTITION_TRANSITION_STATE.DEFERRED :
      PARTITION_TRANSITION_STATE.BLOCKED;
  }

  /**
   * Resolve the persisted retry metadata for the next workflow attempt.
   * @param {Object|null} existingTransition
   * @return {Object}
   * @private
   */
  resolvePendingRetryMetadata(existingTransition) {
    const previousAttemptCount = Number(
      existingTransition?.metadata?.[
        PARTITION_TRANSITION_METADATA_FIELD.RETRY
      ]?.attemptCount,
    );
    const isRetryingExistingWorkflow =
      this.isRetryableAdmissionState(existingTransition?.state);
    const attemptCount = Number.isInteger(previousAttemptCount) &&
      previousAttemptCount > 0 ?
        previousAttemptCount + 1 :
        (isRetryingExistingWorkflow ? 2 : 1);
    return {
      attemptCount,
      lastAttemptAt: new Date(this.now()).toISOString(),
      nextAttemptAt: null,
      backoffMs: 0,
    };
  }

  /**
   * Resolve one retry schedule from persisted transition metadata.
   * @param {Object|null} existingTransition
   * @return {Object|null}
   * @private
   */
  resolveScheduledRetry(existingTransition) {
    if (!this.isRetryableAdmissionState(existingTransition?.state)) {
      return null;
    }

    const retryMetadata = existingTransition?.metadata?.[
      PARTITION_TRANSITION_METADATA_FIELD.RETRY
    ];
    if (!retryMetadata || typeof retryMetadata !== 'object') {
      return null;
    }

    const nextAttemptAtRaw = retryMetadata.nextAttemptAt;
    if (!nextAttemptAtRaw) {
      return null;
    }
    const nextAttemptAtMs = Date.parse(nextAttemptAtRaw);
    if (!Number.isFinite(nextAttemptAtMs)) {
      return null;
    }

    return {
      ...retryMetadata,
      nextAttemptAt: nextAttemptAtRaw,
      retryDue: nextAttemptAtMs <= this.now(),
    };
  }

  /**
   * Build one scheduled retry window for a retryable split state.
   * @param {Object} retryMetadata
   * @param {string} state
   * @return {Object}
   * @private
   */
  buildScheduledRetryMetadata(retryMetadata, state) {
    const attemptCount = Number.isInteger(retryMetadata?.attemptCount) &&
      retryMetadata.attemptCount > 0 ?
        retryMetadata.attemptCount :
        1;
    const backoffMs = Math.min(
      this.retryMaxDelayMs,
      this.retryBaseDelayMs * Math.pow(2, attemptCount - 1),
    );
    return {
      attemptCount,
      lastAttemptAt:
        retryMetadata?.lastAttemptAt || new Date(this.now()).toISOString(),
      nextAttemptAt: new Date(this.now() + backoffMs).toISOString(),
      backoffMs,
      scheduledState: state,
    };
  }

  /**
   * Capture one authoritative topology snapshot for the current split attempt.
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async resolveTopologySnapshot(options) {
    const baseSnapshot = {
      snapshotVersion: options.retryMetadata?.attemptCount || 1,
      capturedAt: new Date(this.now()).toISOString(),
      tableId: options.tableId,
      tableName: options.tableName,
      partitionId: options.partitionId,
      sourceLeaderNodeId:
        options.partitionInfo?.leader_node_id ||
        options.partitionInfo?.leaderNodeId ||
        null,
      sourcePartitionVersion:
        options.partitionInfo?.partition_version ||
        options.partitionInfo?.partitionVersion ||
        null,
      activePartitionVersion:
        options.tableInfo?.active_partition_version ||
        options.tableInfo?.activePartitionVersion ||
        null,
      targetPartitionVersion: options.targetVersion,
      requiredReplicaCount: options.requiredReplicaCount,
      discoveredTargetNodeIds: [...options.discoveredTargetNodeIds],
      candidateTargetNodeIds: [...options.candidateTargetNodeIds],
      sourceRoutableNodeIds: [...options.sourceRoutableNodeIds],
    };
    if (typeof this.captureTopologySnapshot !== 'function') {
      return baseSnapshot;
    }

    const capturedSnapshot = await this.captureTopologySnapshot({
      ...options,
      baseSnapshot,
    });
    if (!capturedSnapshot || typeof capturedSnapshot !== 'object') {
      return baseSnapshot;
    }

    return {
      ...baseSnapshot,
      ...JSON.parse(JSON.stringify(capturedSnapshot)),
    };
  }

  /**
   * Normalize a node-id list and fall back to one existing cohort.
   * @param {Array<string>} nodeIds
   * @param {Array<string>} fallbackNodeIds
   * @return {string[]}
   * @private
   */
  normalizeNodeIdList(nodeIds, fallbackNodeIds = []) {
    const resolvedNodeIds = Array.isArray(nodeIds) &&
      nodeIds.length > 0 ?
        nodeIds :
        fallbackNodeIds;
    const normalizedNodeIds = [];
    const seenNodeIds = new Set();
    for (const nodeId of resolvedNodeIds) {
      const normalizedNodeId = String(nodeId || '');
      if (!normalizedNodeId || seenNodeIds.has(normalizedNodeId)) {
        continue;
      }
      seenNodeIds.add(normalizedNodeId);
      normalizedNodeIds.push(normalizedNodeId);
    }
    return normalizedNodeIds;
  }

  /**
   * Build stable child bootstrap target lists from the admitted split target
   * pool. The first replicaCount entries form the preferred spread-first
   * cohort; any remaining entries are preserved as ordered fallbacks for later
   * per-node admission checks during child provisioning.
   * @param {Object} options
   * @return {Object<string, string[]>}
   * @private
   */
  planChildProvisioningTargetNodeIds(options = {}) {
    const childPartitionIds = this.normalizeNodeIdList(
      options.childPartitionIds,
    );
    if (childPartitionIds.length === 0) {
      return {};
    }

    const replicaCount = Number.isInteger(options.replicaCount) &&
      options.replicaCount > 0 ?
        options.replicaCount :
        1;
    const sourceRoutableNodeIds = this.normalizeNodeIdList(
      options.sourceRoutableNodeIds,
    );
    const candidateTargetNodeIds = this.normalizeNodeIdList(
      options.eligibleNodeIds,
      this.normalizeNodeIdList(
        options.candidateTargetNodeIds,
        sourceRoutableNodeIds,
      ),
    );
    const anchorNodeId = this.resolveChildProvisioningAnchorNodeId(
      candidateTargetNodeIds,
      sourceRoutableNodeIds,
      options.preferredAnchorNodeId,
    );
    const sourceNodeIdSet = new Set(sourceRoutableNodeIds);
    const candidateOrderByNodeId = new Map();
    for (let index = 0; index < candidateTargetNodeIds.length; index += 1) {
      candidateOrderByNodeId.set(candidateTargetNodeIds[index], index);
    }

    const usageByNodeId = new Map();
    for (const nodeId of sourceRoutableNodeIds) {
      usageByNodeId.set(nodeId, (usageByNodeId.get(nodeId) || 0) + 1);
    }

    const childTargetNodeIdsByPartitionId = {};
    for (const childPartitionId of childPartitionIds) {
      const targetNodeIds = [];
      if (anchorNodeId) {
        targetNodeIds.push(anchorNodeId);
        usageByNodeId.set(
          anchorNodeId,
          (usageByNodeId.get(anchorNodeId) || 0) + 1,
        );
      }

      while (targetNodeIds.length < replicaCount) {
        const remainingNodeIds = candidateTargetNodeIds.filter((nodeId) =>
          !targetNodeIds.includes(nodeId),
        );
        if (remainingNodeIds.length === 0) {
          break;
        }

        remainingNodeIds.sort((leftNodeId, rightNodeId) => {
          const leftUsage = usageByNodeId.get(leftNodeId) || 0;
          const rightUsage = usageByNodeId.get(rightNodeId) || 0;
          if (leftUsage !== rightUsage) {
            return leftUsage - rightUsage;
          }
          const leftSourcePenalty = sourceNodeIdSet.has(leftNodeId) ? 1 : 0;
          const rightSourcePenalty = sourceNodeIdSet.has(rightNodeId) ? 1 : 0;
          if (leftSourcePenalty !== rightSourcePenalty) {
            return leftSourcePenalty - rightSourcePenalty;
          }
          return (
            (candidateOrderByNodeId.get(leftNodeId) || 0) -
            (candidateOrderByNodeId.get(rightNodeId) || 0)
          );
        });

        const selectedNodeId = remainingNodeIds[0];
        targetNodeIds.push(selectedNodeId);
        usageByNodeId.set(
          selectedNodeId,
          (usageByNodeId.get(selectedNodeId) || 0) + 1,
        );
      }

      const fallbackNodeIds = candidateTargetNodeIds.filter((nodeId) =>
        !targetNodeIds.includes(nodeId),
      );
      fallbackNodeIds.sort((leftNodeId, rightNodeId) => {
        const leftUsage = usageByNodeId.get(leftNodeId) || 0;
        const rightUsage = usageByNodeId.get(rightNodeId) || 0;
        if (leftUsage !== rightUsage) {
          return leftUsage - rightUsage;
        }
        const leftSourcePenalty = sourceNodeIdSet.has(leftNodeId) ? 1 : 0;
        const rightSourcePenalty = sourceNodeIdSet.has(rightNodeId) ? 1 : 0;
        if (leftSourcePenalty !== rightSourcePenalty) {
          return leftSourcePenalty - rightSourcePenalty;
        }
        return (
          (candidateOrderByNodeId.get(leftNodeId) || 0) -
          (candidateOrderByNodeId.get(rightNodeId) || 0)
        );
      });

      childTargetNodeIdsByPartitionId[childPartitionId] = [
        ...targetNodeIds,
        ...fallbackNodeIds,
      ];
    }

    return childTargetNodeIdsByPartitionId;
  }

  /**
   * Choose one stable anchor node to keep child bootstrap leadership local
   * when possible without forcing every follower back onto the source cohort.
   * @param {string[]} candidateTargetNodeIds
   * @param {string[]} sourceRoutableNodeIds
   * @param {string|null|undefined} preferredAnchorNodeId
   * @return {string|null}
   * @private
   */
  resolveChildProvisioningAnchorNodeId(
    candidateTargetNodeIds,
    sourceRoutableNodeIds,
    preferredAnchorNodeId,
  ) {
    const preferredNodeId = String(
      preferredAnchorNodeId || this.nodeId || '',
    );
    if (preferredNodeId &&
        candidateTargetNodeIds.includes(preferredNodeId)) {
      return preferredNodeId;
    }

    for (const nodeId of sourceRoutableNodeIds) {
      if (candidateTargetNodeIds.includes(nodeId)) {
        return nodeId;
      }
    }

    return candidateTargetNodeIds[0] || null;
  }

  /**
   * Resolve the target version for a new or retried split workflow.
   * @param {Object} tableInfo
   * @param {Object|null} existingTransition
   * @return {number}
   * @private
   */
  resolveTargetPartitionVersion(tableInfo, existingTransition) {
    const persistedVersion = Number(
      existingTransition?.metadata?.[
        PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION
      ],
    );
    if (Number.isInteger(persistedVersion) && persistedVersion > 0) {
      return persistedVersion;
    }
    return this.resolveActivePartitionVersion(tableInfo) + 1;
  }

  /**
   * Resolve the durable workflow identifier for a new or retried split.
   * @param {string} tableId
   * @param {string} partitionId
   * @param {number} targetVersion
   * @param {Object|null} existingTransition
   * @return {string}
   * @private
   */
  resolveWorkflowId(tableId, partitionId, targetVersion, existingTransition) {
    const persistedWorkflowId = String(
      existingTransition?.metadata?.[
        PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID
      ] || '',
    );
    return persistedWorkflowId ||
      this.createWorkflowId(tableId, partitionId, targetVersion);
  }

  /**
   * Obtain a canonical split admission result.
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async evaluateSplitAdmission(options) {
    return this.storageAdmissionService.checkSplit({
      targetNodeIds: options.candidateTargetNodeIds,
      estimatedBytes: options.estimatedBytes,
      requiredReplicaCount: options.requiredReplicaCount,
      minimumRoutableSourceCount: options.requiredReplicaCount,
      sourceRoutableNodeIds: options.sourceRoutableNodeIds,
    });
  }

  /**
   * Estimate split-admission bytes when no explicit estimator is injected.
   * @param {Object} partitionInfo
   * @return {number}
   * @private
   */
  defaultEstimateSplitAdmissionBytes(partitionInfo) {
    const sizeBytes = Number(
      partitionInfo?.size_bytes ?? partitionInfo?.sizeBytes,
    );
    if (Number.isFinite(sizeBytes) && sizeBytes > 0) {
      return Math.ceil(sizeBytes);
    }
    return 1;
  }

  /**
   * Persist an execution failure after a split has already been admitted.
   * @param {string} workflowId
   * @param {Error} error
   * @return {Promise<void>}
   * @private
   */
  async persistExecutionFailure(workflowId, error) {
    const workflow = this.workflowCoordinator.getWorkflowById(workflowId);
    if (!workflow) {
      return;
    }

    try {
      const timeoutClassification =
        error?.timeoutClassification &&
        typeof error.timeoutClassification === 'object' ?
          error.timeoutClassification :
          null;
      await this.workflowCoordinator.updateWorkflow(workflowId, {
        status: PARTITION_TRANSITION_STATE.FAILED,
        metadata: {
          ...(workflow.metadata || {}),
          [PARTITION_TRANSITION_METADATA_FIELD.FAILURE]: {
            classification: 'split_execution_failure',
            message: error?.message || QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED,
            failedAt: new Date(this.now()).toISOString(),
            ...(timeoutClassification ? {timeoutClassification} : {}),
          },
        },
      });
    } catch (persistError) {
      this.logger.error('Failed to persist managed split workflow failure', {
        workflowId,
        error: persistError?.message || persistError,
      });
    }
  }

  /**
   * Persist workflow state through the canonical tables transition row.
   * @param {Object} workflow - Workflow state.
   * @return {Promise<void>}
   * @private
   */
  async persistWorkflowTransition(workflow) {
    const cdcIntegrationService = this.getCDCIntegrationService();
    if (!cdcIntegrationService ||
        typeof cdcIntegrationService.updateSystemTableRow !== 'function') {
      return;
    }

    const pendingPartitionVersion = Number(
      workflow.metadata?.[
        PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION
      ],
    );
    const serializedMetadata = JSON.stringify(
      this.buildPersistedTransitionMetadata(workflow),
    );
    const updatePayload = {
      pending_partition_version: Number.isInteger(pendingPartitionVersion) ?
        pendingPartitionVersion :
        null,
      partition_transition_state: workflow.status,
      partition_transition_metadata: serializedMetadata,
      updated_at: workflow.updatedAt,
    };

    // Cutover activation promotes the target partition version to active
    // and clears the pending version. These fields were previously written
    // by PartitionService.markSplitCutoverActive() directly — now the
    // workflow owner persists them as part of the canonical transition.
    if (workflow.status ===
        PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE) {
      const targetIds = workflow.metadata?.[
        PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
      ];
      if (Number.isInteger(pendingPartitionVersion)) {
        updatePayload.active_partition_version =
          pendingPartitionVersion;
        updatePayload.pending_partition_version = null;
      }
      if (Array.isArray(targetIds) && targetIds.length > 0) {
        updatePayload.partition_count = targetIds.length;
      }
    }

    await cdcIntegrationService.updateSystemTableRow(
      TABLES.TABLES,
      {table_id: workflow.tableId},
      updatePayload,
      {
        expectedCacheFields: {
          pending_partition_version:
            updatePayload.pending_partition_version,
          partition_transition_state: workflow.status,
          partition_transition_metadata: serializedMetadata,
        },
      },
    );
  }

  /**
   * Build the durable transition metadata for one workflow snapshot.
   * @param {Object} workflow - Workflow state.
   * @return {Object}
   * @private
   */
  buildPersistedTransitionMetadata(workflow) {
    const metadata = workflow.metadata &&
      typeof workflow.metadata === 'object' ?
      {...workflow.metadata} :
      {};
    const participants = this.serializeParticipantsForMetadata(workflow);
    if (participants) {
      metadata[PARTITION_TRANSITION_METADATA_FIELD.PARTICIPANTS] = participants;
    } else {
      delete metadata[PARTITION_TRANSITION_METADATA_FIELD.PARTICIPANTS];
    }

    const sourceCheckpoint = this.resolveSourceCheckpoint(workflow);
    if (sourceCheckpoint) {
      metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_CHECKPOINT] =
        sourceCheckpoint;
    } else {
      delete metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_CHECKPOINT];
    }

    return metadata;
  }

  /**
   * Serialize workflow participants into durable metadata.
   * @param {Object} workflow - Workflow state.
   * @return {Object|null}
   * @private
   */
  serializeParticipantsForMetadata(workflow) {
    if (!(workflow.participants instanceof Map) ||
        workflow.participants.size === 0) {
      return null;
    }

    const serialized = {};
    for (const [participantKey, participant] of workflow.participants.entries()) {
      serialized[participantKey] = JSON.parse(JSON.stringify(participant));
    }
    return serialized;
  }

  /**
   * Extract the source participant checkpoint for durable recovery.
   * @param {Object} workflow - Workflow state.
   * @return {Object|null}
   * @private
   */
  resolveSourceCheckpoint(workflow) {
    if (!(workflow.participants instanceof Map) ||
        workflow.participants.size === 0) {
      return null;
    }

    for (const [participantKey, participant] of workflow.participants.entries()) {
      if (!String(participantKey).startsWith(
        SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
      )) {
        continue;
      }
      if (participant?.checkpoint === undefined ||
          participant?.checkpoint === null) {
        return null;
      }
      return JSON.parse(JSON.stringify(participant.checkpoint));
    }

    return null;
  }

  /**
   * Insert one child partition row without a per-row cache wait.
   * @param {Object} partitionMetadata - Partition row payload.
   * @return {Promise<void>}
   * @private
   */
  async insertPartitionMetadata(partitionMetadata) {
    const cdcIntegrationService = this.getCDCIntegrationService();
    if (!cdcIntegrationService ||
        typeof cdcIntegrationService.insertSystemTableRow !== 'function') {
      return;
    }
    await cdcIntegrationService.insertSystemTableRow(
      TABLES.PARTITIONS,
      partitionMetadata,
      {skipCacheWait: true},
    );
  }

  /**
   * Insert two partition metadata rows atomically using the
   * distributed transaction coordinator when available.
   *
   * @param {Object} leftMetadata - Left partition metadata.
   * @param {Object} rightMetadata - Right partition metadata.
   * @return {Promise<void>}
   * @private
   */
  async insertPartitionMetadataAtomically(leftMetadata, rightMetadata) {
    const txCoordinator = this.transactionCoordinator;
    if (!txCoordinator ||
        typeof txCoordinator.begin !== 'function' ||
        typeof txCoordinator.commit !== 'function' ||
        typeof txCoordinator.rollback !== 'function') {
      throw new Error(
        QUERY_ERROR_MSG.TABLE_SPLIT_TRANSACTION_COORDINATOR_REQUIRED,
      );
    }

    const sessionId =
      `split-${leftMetadata.partition_id}:` +
      `${rightMetadata.partition_id}`;
    const beginResult = await txCoordinator.begin(sessionId);
    if (!beginResult.success) {
      throw new Error(beginResult.error);
    }
    try {
      await Promise.all([
        this.insertPartitionMetadata(leftMetadata),
        this.insertPartitionMetadata(rightMetadata),
      ]);
      const commitResult = await txCoordinator.commit(sessionId);
      if (!commitResult.success) {
        throw new Error(commitResult.error);
      }
    } catch (error) {
      await txCoordinator.rollback(sessionId);
      throw error;
    }
  }

  /**
   * Build a deterministic workflow ID for one split transition.
   * @param {string} tableId - Table ID.
   * @param {string} partitionId - Source partition ID.
   * @param {number} targetVersion - Target partition version.
   * @return {string} Workflow ID.
   * @private
   */
  createWorkflowId(tableId, partitionId, targetVersion) {
    return `split-${tableId}-${partitionId}-v${targetVersion}`;
  }
}

export {
  ManagedSplitWorkflow,
};
// placeholder
