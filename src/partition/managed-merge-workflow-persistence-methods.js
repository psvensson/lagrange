import {TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {
  MANAGED_MERGE_ERROR_MSG,
  MANAGED_MERGE_LOG_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
import {
  isRetryableManagedSplitExecutionFailure,
  resolveRetryableManagedSplitExecutionDecisionType,
} from './managed-split-retry-policy.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_MERGE_EXECUTION_FAILURE = 'merge_execution_failure';
const LOCAL_STR_MERGE_EXECUTION_DEFERRED = 'merge_execution_deferred';
const LOCAL_STR_PARTITION_ID = 'partition_id';
const LOCAL_STR_TABLE_ID = 'table_id';

/**
 * Durable persistence methods for ManagedMergeWorkflow.
 *
 * Writes flow through the same control-plane system-table gateway the
 * split workflow uses: the tables row carries the canonical transition
 * state, and cutover activation promotes the pending partition version to
 * active in the same mutation (collapsing the two source key ranges out of
 * the routable epoch).
 */
class ManagedMergeWorkflowPersistenceMethods {
  /**
   * Persist an execution failure after a merge has already been admitted.
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
        typeof error.timeoutClassification === LOCAL_STR_OBJECT ?
          error.timeoutClassification :
          null;
      await this.workflowCoordinator.updateWorkflow(workflowId, {
        status: PARTITION_TRANSITION_STATE.FAILED,
        metadata: {
          ...(workflow.metadata || {}),
          [PARTITION_TRANSITION_METADATA_FIELD.FAILURE]: {
            classification: LOCAL_STR_MERGE_EXECUTION_FAILURE,
            message: error?.message || MANAGED_MERGE_ERROR_MSG.START_FAILED,
            failedAt: new Date(this.now()).toISOString(),
            ...(timeoutClassification ? {timeoutClassification} : {}),
          },
        },
      });
    } catch (persistError) {
      this.logger.error(MANAGED_MERGE_LOG_MSG.PERSIST_FAILURE_FAILED, {
        workflowId,
        error: persistError?.message || persistError,
      });
    }
  }

  /**
   * Persist one retryable merge deferral for transient execution failures
   * discovered after admission has already been accepted. Reuses the
   * message-classification retry policy shared with the split workflow.
   * @param {Object} options
   * @return {Promise<Object|null>}
   * @private
   */
  async handleRetryablePostAdmissionExecutionFailure(options) {
    if (!isRetryableManagedSplitExecutionFailure(options.error)) {
      return null;
    }

    const decisionType = resolveRetryableManagedSplitExecutionDecisionType(
      options.error,
    );
    const deferredState = this.resolveAdmissionDeniedState(decisionType);
    const workflow = this.workflowCoordinator.getWorkflowById(
      options.workflowId,
    );
    const retry = this.buildScheduledRetryMetadata(
      options.retryMetadata,
      deferredState,
    );
    const errorMessage = options.error?.message ||
      MANAGED_MERGE_ERROR_MSG.START_FAILED;
    const deferredMetadata = {
      ...(workflow?.metadata || {}),
      [PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]:
        options.admission,
      [PARTITION_TRANSITION_METADATA_FIELD.RETRY]:
        retry,
      [PARTITION_TRANSITION_METADATA_FIELD.FAILURE]: {
        classification: LOCAL_STR_MERGE_EXECUTION_DEFERRED,
        message: errorMessage,
        failedAt: new Date(this.now()).toISOString(),
        retryable: true,
        decisionType,
      },
    };

    if (workflow) {
      await this.workflowCoordinator.updateWorkflow(options.workflowId, {
        status: deferredState,
        metadata: deferredMetadata,
      });
    }

    return {
      success: false,
      sourcePartitionIds: options.sourcePartitionIds,
      tableId: options.tableId,
      tableName: options.tableName,
      workflowId: options.workflowId,
      targetVersion: options.targetVersion,
      state: deferredState,
      admission: options.admission,
      retry,
      error: errorMessage,
    };
  }

  /**
   * Persist workflow state through the canonical tables transition row.
   *
   * On MERGE_CUTOVER_ACTIVE the pending partition version is promoted to
   * active and cleared in the same durable mutation — this is the epoch
   * cutover that makes the merged target routable and turns the two source
   * key ranges into stale routes.
   * @param {Object} workflow - Workflow state.
   * @return {Promise<void>}
   * @private
   */
  async persistWorkflowTransition(workflow) {
    const cdcIntegrationService = this.getCDCIntegrationService();
    if (!cdcIntegrationService ||
        typeof cdcIntegrationService.updateSystemTableRow !==
          LOCAL_STR_FUNCTION) {
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

    this.applyMergeTransitionEpochFields(
      updatePayload,
      workflow,
      pendingPartitionVersion,
    );

    await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.TABLES,
      whereClause: {[LOCAL_STR_TABLE_ID]: workflow.tableId},
      data: updatePayload,
    }, this.buildManagedMergeMutationOptions({
      allowPendingVisibility: true,
      expectedCacheFields: {
        pending_partition_version:
          updatePayload.pending_partition_version,
        partition_transition_state: workflow.status,
        partition_transition_metadata: serializedMetadata,
      },
    }));
  }

  /**
   * Apply the status-dependent epoch fields to one tables-row mutation.
   *
   * MERGE_CUTOVER_ACTIVE promotes the pending epoch to active and counts
   * the merged target plus every carried-forward sibling as the new
   * epoch's routable set. FAILED (the fail-safe abort) withdraws the
   * pending epoch so the provisioned target can never satisfy routing —
   * the sources remain authoritative.
   * @param {Object} updatePayload - Mutation data payload (mutated).
   * @param {Object} workflow - Workflow state.
   * @param {number} pendingPartitionVersion - Merge target epoch.
   * @return {void}
   * @private
   */
  applyMergeTransitionEpochFields(
    updatePayload,
    workflow,
    pendingPartitionVersion,
  ) {
    if (workflow.status === PARTITION_TRANSITION_STATE.FAILED) {
      updatePayload.pending_partition_version = null;
      return;
    }
    if (workflow.status !==
        PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE) {
      return;
    }
    const targetIds = workflow.metadata?.[
      PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
    ];
    const siblingIds = workflow.metadata?.[
      PARTITION_TRANSITION_METADATA_FIELD.SIBLING_PARTITION_IDS
    ];
    if (Number.isInteger(pendingPartitionVersion)) {
      updatePayload.active_partition_version = pendingPartitionVersion;
      updatePayload.pending_partition_version = null;
    }
    if (Array.isArray(targetIds) && targetIds.length > 0) {
      updatePayload.partition_count = targetIds.length +
        (Array.isArray(siblingIds) ? siblingIds.length : 0);
    }
  }

  /**
   * Build the durable transition metadata for one workflow snapshot.
   * @param {Object} workflow - Workflow state.
   * @return {Object}
   * @private
   */
  buildPersistedTransitionMetadata(workflow) {
    const metadata = workflow.metadata &&
      typeof workflow.metadata === LOCAL_STR_OBJECT ?
      {...workflow.metadata} :
      {};
    const participants = this.serializeParticipantsForMetadata(workflow);
    if (participants) {
      metadata[PARTITION_TRANSITION_METADATA_FIELD.PARTICIPANTS] =
        participants;
    } else {
      delete metadata[PARTITION_TRANSITION_METADATA_FIELD.PARTICIPANTS];
    }
    return metadata;
  }

  /**
   * Insert the merged target partition metadata row.
   * @param {Object} partitionMetadata - Partition row payload.
   * @return {Promise<void>}
   * @private
   */
  async insertMergedPartitionMetadata(partitionMetadata) {
    await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
      tableName: TABLES.PARTITIONS,
      row: partitionMetadata,
    }, this.buildManagedMergeMutationOptions({skipCacheWait: true}));
  }

  /**
   * Delete one retired source partition descriptor row from the
   * authoritative partitions system table.
   * @param {string} partitionId - Retired source partition ID.
   * @return {Promise<void>}
   * @private
   */
  async deleteSourcePartitionMetadata(partitionId) {
    await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.DELETE,
      tableName: TABLES.PARTITIONS,
      whereClause: {[LOCAL_STR_PARTITION_ID]: partitionId},
    }, this.buildManagedMergeMutationOptions({skipCacheWait: true}));
  }

  /**
   * Carry one non-participating sibling partition descriptor forward into
   * the merge target epoch. Without this, the routing predicate
   * (partition_version must equal active_partition_version exactly) would
   * blackhole the sibling's key range the moment the cutover promotes the
   * epoch.
   * @param {string} partitionId - Sibling partition ID.
   * @param {number} targetVersion - Merge target epoch.
   * @return {Promise<void>}
   * @private
   */
  async promoteSiblingPartitionVersion(partitionId, targetVersion) {
    await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.PARTITIONS,
      whereClause: {[LOCAL_STR_PARTITION_ID]: partitionId},
      data: {
        partition_version: targetVersion,
        updated_at: this.now(),
      },
    }, this.buildManagedMergeMutationOptions({skipCacheWait: true}));
    this.logger.info(MANAGED_MERGE_LOG_MSG.SIBLING_CARRIED_FORWARD, {
      partitionId,
      targetVersion,
    });
  }

  /**
   * Clear the durable transition columns after dissolution completes.
   * Without this terminal clear the tables row would keep
   * merge_cutover_active forever and every later split/merge on the table
   * would be refused as already-in-progress.
   * @param {Object} workflow - Workflow snapshot.
   * @return {Promise<void>}
   * @private
   */
  async persistTerminalTransitionClear(workflow) {
    await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.TABLES,
      whereClause: {[LOCAL_STR_TABLE_ID]: workflow.tableId},
      data: {
        partition_transition_state: null,
        partition_transition_metadata: null,
        pending_partition_version: null,
        updated_at: this.now(),
      },
    }, this.buildManagedMergeMutationOptions({
      allowPendingVisibility: true,
      expectedCacheFields: {
        partition_transition_state: null,
        partition_transition_metadata: null,
      },
    }));
    this.logger.info(MANAGED_MERGE_LOG_MSG.TERMINAL_TRANSITION_CLEARED, {
      workflowId: workflow.workflowId,
      tableId: workflow.tableId,
    });
  }

  /**
   * Resolve one merged partition metadata row when a retried workflow has
   * already inserted it.
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  resolveMergedPartitionMetadataRow(partitionId) {
    if (!partitionId) {
      return null;
    }
    const partition = this.getPartitionInfo(partitionId);
    const resolvedPartitionId = String(
      partition?.partition_id ?? partition?.partitionId ?? '',
    );
    if (!resolvedPartitionId || resolvedPartitionId !== partitionId) {
      return null;
    }
    return partition;
  }

  getControlPlaneSystemTableGateway() {
    if (this.controlPlaneSystemTableGateway) {
      return this.controlPlaneSystemTableGateway;
    }
    this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle({
      nodeId: this.nodeId,
      getCdcIntegrationService: () => this.getCDCIntegrationService(),
      getMessageRouter: () => this.messageRouter,
    }).controlPlaneSystemTableGateway;
    return this.controlPlaneSystemTableGateway;
  }
}

export {ManagedMergeWorkflowPersistenceMethods};
