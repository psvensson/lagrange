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
  stampOwnershipClaimMetadata,
} from './managed-workflow-ownership-core.js';
import {RECORD_CHANGE_KIND} from './managed-workflow-record-store.js';
import {
  isRetryableManagedSplitExecutionFailure,
  resolveRetryableManagedSplitExecutionDecisionType,
} from './managed-split-retry-policy.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_MERGE_EXECUTION_FAILURE = 'merge_execution_failure';
const LOCAL_STR_MERGE_EXECUTION_DEFERRED = 'merge_execution_deferred';
const LOCAL_STR_PARTITION_ID = 'partition_id';
const LOCAL_STR_EPOCH_EFFECT_DETAIL =
  ': expected exactly 1 row update for workflow ';
const POST_ADMISSION_EXECUTION_FAILURE_OUTCOME = Object.freeze({
  NOT_RETRYABLE: Symbol('post_admission_execution_failure_not_retryable'),
});

/**
 * Assert an epoch-changing mutation landed exactly one row. A zero-row
 * "success" (duplicate/coalesced delivery, stale where-clause) means the
 * durable row did NOT change; advancing in-memory status on that outcome
 * silently applies an epoch flip the durable state never saw.
 * @param {Object} mutationResult - Gateway mutation result.
 * @param {Object} workflow - Workflow state (workflowId used in message).
 * @return {void}
 */
function assertManagedMergeEpochMutationEffect(mutationResult, workflow) {
  if (mutationResult?.success === false) {
    throw new Error(
      mutationResult.error || MANAGED_MERGE_ERROR_MSG.EPOCH_PERSIST_EFFECT_FAILED,
    );
  }
  const affectedRows = Number(
    mutationResult?.partitionResult?.affectedRows ??
      mutationResult?.affectedRows,
  );
  if (!Number.isFinite(affectedRows) || affectedRows !== 1) {
    throw new Error(
      MANAGED_MERGE_ERROR_MSG.EPOCH_PERSIST_EFFECT_FAILED +
      LOCAL_STR_EPOCH_EFFECT_DETAIL +
      `${workflow?.workflowId}, observed ${affectedRows}`,
    );
  }
}

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
      const failure = {
        classification: LOCAL_STR_MERGE_EXECUTION_FAILURE,
        message: error?.message || MANAGED_MERGE_ERROR_MSG.START_FAILED,
        failedAt: new Date(this.now()).toISOString(),
        ...(timeoutClassification ? {timeoutClassification} : {}),
      };
      await this.workflowCoordinator.updateWorkflow(workflowId,
        (current) => ({...current,
          status: PARTITION_TRANSITION_STATE.FAILED,
          metadata: {...(current.metadata || {}),
            [PARTITION_TRANSITION_METADATA_FIELD.FAILURE]: failure}}));
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
   * @return {Promise<Object|symbol>}
   * @private
   */
  async handleRetryablePostAdmissionExecutionFailure(options) {
    if (!isRetryableManagedSplitExecutionFailure(options.error)) {
      return POST_ADMISSION_EXECUTION_FAILURE_OUTCOME.NOT_RETRYABLE;
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
    const deferredDelta = {
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
      await this.workflowCoordinator.updateWorkflow(options.workflowId,
        (current) => ({...current, status: deferredState,
          metadata: {...current.metadata, ...deferredDelta}}));
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
   * Test whether post-admission failure handling produced a deferral result.
   * @param {Object|symbol} outcome
   * @return {boolean}
   * @private
   */
  isManagedMergeDeferredExecutionOutcome(outcome) {
    return outcome !==
      POST_ADMISSION_EXECUTION_FAILURE_OUTCOME.NOT_RETRYABLE;
  }

  /**
   * Build the full tables-row transition mutation payload for one
   * workflow: serialized transition metadata, the pending epoch field,
   * and the status-dependent epoch effects applied in place.
   * @param {Object} workflow - Workflow state.
   * @return {Object} {updatePayload, serializedMetadata,
   *   pendingPartitionVersion, isEpochTransition}.
   * @private
   */
  buildMergeTransitionUpdatePayload(workflow) {
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
    const isEpochTransition = workflow.status ===
        PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE ||
      workflow.status === PARTITION_TRANSITION_STATE.FAILED;
    return {
      updatePayload,
      serializedMetadata,
      pendingPartitionVersion,
      isEpochTransition,
    };
  }

  /**
   * Encode one change's next workflow for the record store
   * (managed-workflow-record-store.js): the full transition payload (the
   * cutover's epoch promotion, FAILED's withdrawal) or, for a claim, the
   * metadata alone. The canonical merge participants ride every write.
   * Fail-closed: a transition with no CDC bridge throws (nothing is
   * written).
   * @param {Object} workflow - The change's next workflow.
   * @param {string} kind - RECORD_CHANGE_KIND.
   * @return {Object} {data, options}.
   * @private
   */
  encodeWorkflowRecord(workflow, kind) {
    const candidate = this.withCanonicalMergeParticipants(workflow);
    if (kind === RECORD_CHANGE_KIND.CLAIM) {
      return {
        data: {
          partition_transition_metadata: JSON.stringify(
            this.buildPersistedTransitionMetadata(candidate)),
          updated_at: candidate.updatedAt,
        },
        // Claim/renew writes are not epoch transitions: they tolerate pending
        // cache visibility (the compare-and-swap carries the race guarantee).
        options: this.buildManagedMergeMutationOptions({
          allowPendingVisibility: true,
        }),
      };
    }
    const cdcIntegrationService = this.getCDCIntegrationService();
    if (!cdcIntegrationService ||
        typeof cdcIntegrationService.updateSystemTableRow !==
          LOCAL_STR_FUNCTION) {
      throw new Error(
        MANAGED_MERGE_ERROR_MSG.TRANSITION_PERSIST_UNAVAILABLE,
      );
    }
    const {updatePayload, serializedMetadata, isEpochTransition} =
      this.buildMergeTransitionUpdatePayload(candidate);
    return {
      data: updatePayload,
      options: this.buildManagedMergeMutationOptions({
        allowPendingVisibility: !isEpochTransition,
        expectedCacheFields: {
          pending_partition_version: updatePayload.pending_partition_version,
          partition_transition_state: candidate.status,
          partition_transition_metadata: serializedMetadata,
        },
      }),
    };
  }

  /**
   * Encode the terminal clear for the record store.
   * @return {Object} {data, options}.
   * @private
   */
  encodeWorkflowRecordClear() {
    return {
      data: {
        partition_transition_state: null,
        partition_transition_metadata: null,
        pending_partition_version: null,
        updated_at: this.now(),
      },
      options: this.buildManagedMergeMutationOptions({
        allowPendingVisibility: false,
        expectedCacheFields: {
          partition_transition_state: null,
          partition_transition_metadata: null,
        },
      }),
    };
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
    // Durable ownership claim triple (mirrors the split owner): the
    // tables transition row carries the fencing state without a schema
    // change.
    return stampOwnershipClaimMetadata(metadata, workflow);
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
    return this.getControlPlaneSystemTableGateway().submitMutation({
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
    const mutationResult = await this.getControlPlaneSystemTableGateway()
      .submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.PARTITIONS,
        whereClause: {[LOCAL_STR_PARTITION_ID]: partitionId},
        data: {
          partition_version: targetVersion,
          updated_at: this.now(),
        },
      }, this.buildManagedMergeMutationOptions({skipCacheWait: true}));
    assertManagedMergeEpochMutationEffect(mutationResult, {
      workflowId: `sibling:${partitionId}`,
    });
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
    // The completion is the record's last write: a change cleared only
    // while the record is this owner's at its fence in the state the caller
    // finished it in.
    await this.workflowCoordinator.clearWorkflowRecord(workflow.workflowId,
      new Set([String(workflow.status)]));
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
