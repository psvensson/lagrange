import {TABLES} from '../constants/index.js';
import {
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
} from '../query/query-constants.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
  STORAGE_ADMISSION_OPERATION_TYPE,
} from '../rebalancer/storage-admission-constants.js';
import {DurableWorkflowCoordinator} from '../workflow/durable-workflow-coordinator.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';

const ACTIVE_PARTITION_STATE = 'NORMAL';
const DEFAULT_QUORUM_REPLICA_COUNT = 1;

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
    this.provisionInitialTablePartition =
      options.provisionInitialTablePartition || (async () => {});
    this.startSplitReplicationOnSourcePartition =
      options.startSplitReplicationOnSourcePartition || (async () => {});
    this.logger = options.logger || console;
    this.now = options.now || (() => Date.now());
    this.transactionCoordinator = options.transactionCoordinator || null;
    this.workflowCoordinator = options.workflowCoordinator ||
      new DurableWorkflowCoordinator({
        persistWorkflow: async (workflow) =>
          this.persistWorkflowTransition(workflow),
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

    return this.workflowCoordinator.runExclusive(
      partitionId,
      async () => this.executeInternal(partitionId),
    );
  }

  /**
   * Execute one managed split after single-flight admission.
   * @param {string} partitionId - Source partition ID.
   * @return {Promise<Object>} Split orchestration result.
   * @private
   */
  async executeInternal(partitionId) {
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
    const now = this.now();
    const executionTimeoutBudget =
      typeof this.createExecutionTimeoutBudget === 'function' ?
        this.createExecutionTimeoutBudget() :
        null;
    const estimatedBytes = this.estimateSplitAdmissionBytes(
      partitionInfo,
      tableInfo,
    );
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
        candidateTargetNodeIds,
        sourceRoutableNodeIds,
        estimatedBytes,
      }),
      createdAt: now,
      updatedAt: now,
    });

    try {
      const admissionResult = await this.evaluateSplitAdmission({
        candidateTargetNodeIds,
        estimatedBytes,
        requiredReplicaCount: splitBootstrapReplicaCount,
        sourceRoutableNodeIds,
      });
      const compactAdmission = this.compactAdmissionResult(
        admissionResult,
        {
          candidateTargetNodeIds,
          estimatedBytes,
          sourceRoutableNodeIds,
        },
      );
      if (!admissionResult.allowed) {
        const deniedState = this.resolveAdmissionDeniedState(
          admissionResult.decisionType,
        );
        const deniedMetadata = {
          ...workflow.metadata,
          [PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]:
            compactAdmission,
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
        };
      }

      const splitPlan = await this.buildManagedSplitPlan(
        partitionInfo,
        tableName,
        tableId,
        primaryKeyColumn,
      );
      const transitionMetadata = {
        ...workflow.metadata,
        [PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]:
          compactAdmission,
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
        targetNodeIds: candidateTargetNodeIds,
        timeoutBudget: executionTimeoutBudget,
      });
      await this.provisionInitialTablePartition({
        tableId,
        tableName,
        tableMetadata: tableInfo,
        partitionId: splitPlan.rightPartition.partitionId,
        partitionMetadata: rightPartitionMetadata,
        replicaCount,
        minimumRoutableReplicaCount: splitBootstrapReplicaCount,
        targetNodeIds: candidateTargetNodeIds,
        timeoutBudget: executionTimeoutBudget,
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
      [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID]:
        options.partitionId,
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
    return {
      state: result.decisionType,
      allowed: result.allowed === true,
      decisionType: result.decisionType,
      operationType: result.operationType,
      requiredReplicaCount: result.requiredReplicaCount,
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
      };
    });
  }

  /**
   * Resolve whether an existing transition may be retried through admission.
   * @param {string} state
   * @return {boolean}
   * @private
   */
  isRetryableAdmissionState(state) {
    return state === PARTITION_TRANSITION_STATE.BLOCKED ||
      state === PARTITION_TRANSITION_STATE.DEFERRED;
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
    const serializedMetadata = JSON.stringify(workflow.metadata);
    await cdcIntegrationService.updateSystemTableRow(
      TABLES.TABLES,
      {table_id: workflow.tableId},
      {
        pending_partition_version: Number.isInteger(pendingPartitionVersion) ?
          pendingPartitionVersion :
          null,
        partition_transition_state: workflow.status,
        partition_transition_metadata: serializedMetadata,
        updated_at: workflow.updatedAt,
      },
      {
        expectedCacheFields: {
          pending_partition_version: Number.isInteger(pendingPartitionVersion) ?
            pendingPartitionVersion :
            null,
          partition_transition_state: workflow.status,
          partition_transition_metadata: serializedMetadata,
        },
      },
    );
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
    if (txCoordinator) {
      const sessionId =
        `split-${leftMetadata.partition_id}:` +
        `${rightMetadata.partition_id}`;
      const beginResult = await txCoordinator.begin(sessionId);
      if (!beginResult.success) {
        throw new Error(beginResult.error);
      }
      try {
        await this.insertPartitionMetadata(leftMetadata);
        await this.insertPartitionMetadata(rightMetadata);
        const commitResult = await txCoordinator.commit(sessionId);
        if (!commitResult.success) {
          throw new Error(commitResult.error);
        }
      } catch (error) {
        await txCoordinator.rollback(sessionId);
        throw error;
      }
    } else {
      await this.insertPartitionMetadata(leftMetadata);
      await this.insertPartitionMetadata(rightMetadata);
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
