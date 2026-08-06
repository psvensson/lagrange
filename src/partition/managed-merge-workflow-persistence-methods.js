import {TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {
  WORKFLOW_ERROR_MSG,
} from '../workflow/workflow-constants.js';
import {
  MANAGED_MERGE_ERROR_MSG,
  MANAGED_MERGE_LOG_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
import {
  stampOwnershipClaimMetadata,
} from './managed-workflow-ownership-core.js';
import {
  isRetryableManagedSplitExecutionFailure,
  resolveRetryableManagedSplitExecutionDecisionType,
} from './managed-split-retry-policy.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_MERGE_EXECUTION_FAILURE = 'merge_execution_failure';
const LOCAL_STR_MERGE_EXECUTION_DEFERRED = 'merge_execution_deferred';
const LOCAL_STR_MERGE_SOURCE_EXECUTION_FAILURE =
  'merge_source_execution_failure';
const LOCAL_STR_PARTITION_ID = 'partition_id';
const LOCAL_STR_TABLE_ID = 'table_id';
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

  async persistWorkflowTransition(workflow) {
    const cdcIntegrationService = this.getCDCIntegrationService();
    if (!cdcIntegrationService ||
        typeof cdcIntegrationService.updateSystemTableRow !==
          LOCAL_STR_FUNCTION) {
      throw new Error(
        MANAGED_MERGE_ERROR_MSG.TRANSITION_PERSIST_UNAVAILABLE,
      );
    }

    const {
      updatePayload,
      serializedMetadata,
      isEpochTransition,
    } = this.buildMergeTransitionUpdatePayload(workflow);
    const mutationResult = await this.getControlPlaneSystemTableGateway()
      .submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.TABLES,
        whereClause: {[LOCAL_STR_TABLE_ID]: workflow.tableId},
        data: updatePayload,
      }, this.buildManagedMergeMutationOptions({
        allowPendingVisibility: !isEpochTransition,
        expectedCacheFields: {
          pending_partition_version:
            updatePayload.pending_partition_version,
          partition_transition_state: workflow.status,
          partition_transition_metadata: serializedMetadata,
        },
      }));
    if (isEpochTransition) {
      assertManagedMergeEpochMutationEffect(mutationResult, workflow);
    }
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
   * Durable claim persistence for the ownership machinery (mirrors the
   * split owner): the claim lands through the tables transition row
   * write, compare-and-swapped on the previously persisted transition
   * metadata so two nodes claiming concurrently can never both succeed.
   * @param {Object} workflow - Claim candidate.
   * @param {Object} [context] - ({previousWorkflow}).
   * @return {Promise<Object>} {accepted: boolean, workflow}.
   * @private
   */
  async persistMergeWorkflowClaim(workflow, context = {}) {
    const cdcIntegrationService = this.getCDCIntegrationService();
    if (!cdcIntegrationService ||
        typeof cdcIntegrationService.updateSystemTableRow !==
          LOCAL_STR_FUNCTION) {
      return {accepted: false, workflow};
    }
    const previousWorkflow = context.previousWorkflow || {};
    const expectedSerializedMetadata = JSON.stringify(
      this.buildPersistedTransitionMetadata(previousWorkflow),
    );
    const serializedMetadata = JSON.stringify(
      this.buildPersistedTransitionMetadata(workflow),
    );
    const mutationResult = await cdcIntegrationService.updateSystemTableRow(
      TABLES.TABLES,
      {
        [LOCAL_STR_TABLE_ID]: workflow.tableId,
        partition_transition_metadata: expectedSerializedMetadata,
      },
      {
        partition_transition_metadata: serializedMetadata,
        updated_at: workflow.updatedAt,
      },
      // Claim/renew writes are not epoch transitions: they tolerate
      // pending cache visibility like every other routine transition
      // write (the CAS witness carries the race guarantee).
      this.buildManagedMergeMutationOptions({
        allowPendingVisibility: true,
      }),
    );
    if (mutationResult?.success === false) {
      return {accepted: false, workflow};
    }
    const affectedRows = Number(
      mutationResult?.partitionResult?.affectedRows ??
        mutationResult?.affectedRows,
    );
    return {accepted: affectedRows === 1, workflow};
  }

  /**
   * Durable transition persistence for the ownership machinery (mirrors
   * the split owner): a fenced workflow transition lands with the FULL
   * transition payload (epoch fields included) compare-and-swapped on
   * the previously persisted transition metadata. Returns the storage-
   * hook shape ({accepted}); the machinery throws STALE_FENCE_TOKEN on
   * rejection.
   * @param {Object} workflow - Transition candidate.
   * @param {Object} [context] - ({previousWorkflow}).
   * @return {Promise<Object>} {accepted: boolean, workflow}.
   * @private
   */
  async persistMergeWorkflowTransitionFence(workflow, context = {}) {
    const cdcIntegrationService = this.getCDCIntegrationService();
    if (!cdcIntegrationService ||
        typeof cdcIntegrationService.updateSystemTableRow !==
          LOCAL_STR_FUNCTION) {
      return {accepted: false, workflow};
    }
    const previousWorkflow = context.previousWorkflow || {};
    const expectedSerializedMetadata = JSON.stringify(
      this.buildPersistedTransitionMetadata(previousWorkflow),
    );
    const {
      updatePayload,
      serializedMetadata,
      isEpochTransition,
    } = this.buildMergeTransitionUpdatePayload(workflow);
    const mutationResult = await cdcIntegrationService.updateSystemTableRow(
      TABLES.TABLES,
      {
        [LOCAL_STR_TABLE_ID]: workflow.tableId,
        partition_transition_metadata: expectedSerializedMetadata,
      },
      updatePayload,
      this.buildManagedMergeMutationOptions({
        allowPendingVisibility: !isEpochTransition,
        expectedCacheFields: {
          partition_transition_state: workflow.status,
          partition_transition_metadata: serializedMetadata,
        },
      }),
    );
    if (mutationResult?.success === false) {
      return {accepted: false, workflow};
    }
    const affectedRows = Number(
      mutationResult?.partitionResult?.affectedRows ??
        mutationResult?.affectedRows,
    );
    return {accepted: affectedRows === 1, workflow};
  }

  /**
   * Test whether a step-runner failure is the fenced-transition CAS
   * rejection the storage-ownership machinery raises when the CAS
   * witness no longer matches the durable row.
   * @param {*} error
   * @return {boolean}
   * @private
   */
  isMergeStaleFenceTransitionError(error) {
    return error?.message === WORKFLOW_ERROR_MSG.STALE_FENCE_TOKEN;
  }

  /**
   * Run one serialized owner-lane step, transparently recovering the
   * SAME-owner durable-write race: a participant acknowledgement flush
   * can rewrite the durable row while an earlier durable write is still
   * in flight (the R1 held-cutover shape), leaving the in-memory record
   * ahead of the row every later CAS witnesses against. On the CAS
   * rejection the live record is re-synced from the durable row — only
   * when the row is still owned by THIS owner at the same fence — and
   * the step is re-executed at the same fence. A foreign claim, or a
   * rejection after re-sync, rethrows untouched: the fence's
   * cross-process guarantee is never retried away.
   * @param {Object} stepOptions - workflowStepRunner.runStep options.
   * @param {number} [attempts] - Total attempts (initial + one retry).
   * @return {Promise<*>} The step's own settlement.
   * @private
   */
  async runMergeOwnerLaneStepWithSameOwnerResync(stepOptions, attempts = 2) {
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await this.workflowStepRunner.runStep(stepOptions);
      } catch (error) {
        lastError = error;
        if (!this.isMergeStaleFenceTransitionError(error) ||
            !this.syncLiveMergeWorkflowFromDurable(
              stepOptions.workflowId,
            )) {
          throw error;
        }
      }
    }
    throw lastError;
  }

  /**
   * Persist the fail-safe FAILED transition after the fenced abort step
   * exhausted its same-owner re-sync retries, CAS-guarding on the CURRENT
   * durable row's transition payload instead of the divergent in-memory
   * record. The candidate still carries this owner's fence and owner
   * identity into the durable mutation, so the guard only ever engages
   * for this owner's own race — a durable row claimed by another owner
   * makes the CAS miss and the failure propagates.
   * @param {string} workflowId
   * @param {string} ackStatus - The failure MERGE_ACK_STATUS received.
   * @param {Object} abortOutcomeEnum - The MERGE_ABORT_OUTCOME variants.
   * @param {ReadonlySet<string>} preCutoverStates - Pre-cutover states
   *   from which an abort may still persist FAILED.
   * @return {Promise<string>} An abortOutcomeEnum value.
   * @private
   */
  async persistOwnedMergeAbortFallback(
    workflowId,
    ackStatus,
    abortOutcomeEnum,
    preCutoverStates,
  ) {
    const workflow = this.syncLiveMergeWorkflowFromDurable(workflowId);
    if (!workflow) {
      throw new Error(
        MANAGED_MERGE_ERROR_MSG.OWNED_TRANSITION_PERSIST_REJECTED +
        ` (${workflowId})`,
      );
    }
    if (workflow.status === PARTITION_TRANSITION_STATE.FAILED) {
      return abortOutcomeEnum.ALREADY_ABORTED;
    }
    if (!preCutoverStates.has(workflow.status)) {
      this.logger.error(
        MANAGED_MERGE_LOG_MSG.POST_CUTOVER_SOURCE_FAILURE_RECORDED,
        {workflowId, status: workflow.status, ackStatus},
      );
      return abortOutcomeEnum.REFUSED_POST_CUTOVER;
    }
    const persistence = await this.persistMergeWorkflowTransitionFence(
      {
        ...workflow,
        status: PARTITION_TRANSITION_STATE.FAILED,
        metadata: {
          ...(workflow.metadata || {}),
          [PARTITION_TRANSITION_METADATA_FIELD.FAILURE]: {
            classification: LOCAL_STR_MERGE_SOURCE_EXECUTION_FAILURE,
            message: ackStatus,
            failedAt: new Date(this.now()).toISOString(),
            retryable: true,
          },
        },
        updatedAt: this.now(),
      },
      {previousWorkflow: workflow},
    );
    if (persistence?.accepted !== true) {
      throw new Error(
        MANAGED_MERGE_ERROR_MSG.OWNED_TRANSITION_PERSIST_REJECTED +
        ` (${workflowId})`,
      );
    }
    this.syncLiveMergeWorkflowFromDurable(workflowId);
    return abortOutcomeEnum.ABORTED;
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
    const mutationResult = await this.getControlPlaneSystemTableGateway()
      .submitMutation({
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
        allowPendingVisibility: false,
        expectedCacheFields: {
          partition_transition_state: null,
          partition_transition_metadata: null,
        },
      }));
    assertManagedMergeEpochMutationEffect(mutationResult, workflow);
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
