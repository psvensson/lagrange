import {TABLES} from '../constants/index.js';
import {
  QUERY_ERROR_MSG,
} from '../query/query-constants.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {
  MANAGED_SPLIT_LOG_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
import {
  stampOwnershipClaimMetadata,
} from './managed-workflow-ownership-core.js';
import {
  buildPartitionDescriptorEpochDecision,
  isPartitionDescriptorEpochAccepted,
} from './partition-descriptor-epoch-contract.js';
import {SPLIT_PARTICIPANT_PREFIX} from './split-ack-constants.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_CONSTRUCTOR = 'constructor';
const LOCAL_STR_SPLIT_EXECUTION_FAILURE = 'split_execution_failure';
const LOCAL_STR_FAILED_TO_PERSIST_MANAGED_SPLIT_WORKFLOW = 'Failed to persist managed split workflow failure';
const LOCAL_STR_PARTITION_ID = 'partition_id';
const LOCAL_STR_TABLE_ID = 'table_id';
const LOCAL_STR_TABLE_NAME = 'table_name';
const LOCAL_STR_PARTITION_KEY_START = 'partition_key_start';
const LOCAL_STR_PARTITION_KEY_END = 'partition_key_end';
const LOCAL_STR_PARTITION_VERSION = 'partition_version';
const LOCAL_STR_EPOCH_EFFECT_DETAIL =
  ': expected exactly 1 tables row update for workflow ';
const LOCAL_STR_MANAGED_SPLIT_CHILD_PARTITION_METADATA_M = 'Managed split child partition metadata mismatch for ';

class ManagedSplitWorkflowPersistenceMethods {
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
            classification: LOCAL_STR_SPLIT_EXECUTION_FAILURE,
            message: error?.message || QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED,
            failedAt: new Date(this.now()).toISOString(),
            ...(timeoutClassification ? {timeoutClassification} : {}),
          },
        },
      });
    } catch (persistError) {
      this.logger.error(LOCAL_STR_FAILED_TO_PERSIST_MANAGED_SPLIT_WORKFLOW, {
        workflowId,
        error: persistError?.message || persistError,
      });
    }
  }

  /**
   * Persist workflow state through the canonical tables transition row.
   *
   * Fail-closed: a missing CDC bridge THROWS (the caller must never
   * advance in-memory status without a durable row), the epoch-flip
   * mutation must land exactly one row, and pending visibility is not
   * accepted for the cutover — an unconverged epoch flip is a failed
   * epoch flip.
   * @param {Object} workflow - Workflow state.
   * @return {Promise<void>}
   * @private
   */
  async persistWorkflowTransition(workflow) {
    const cdcIntegrationService = this.getCDCIntegrationService();
    if (!cdcIntegrationService ||
        typeof cdcIntegrationService.updateSystemTableRow !== LOCAL_STR_FUNCTION) {
      throw new Error(
        QUERY_ERROR_MSG.TABLE_SPLIT_TRANSITION_PERSIST_UNAVAILABLE,
      );
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
    // by PartitionService.markSplitCutoverActive() directly; now the
    // workflow owner persists them as part of the canonical transition.
    if (workflow.status ===
        PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE) {
      const targetIds = workflow.metadata?.[
        PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
      ];
      const siblingIds = workflow.metadata?.[
        PARTITION_TRANSITION_METADATA_FIELD.SIBLING_PARTITION_IDS
      ];
      if (Number.isInteger(pendingPartitionVersion)) {
        updatePayload.active_partition_version =
          pendingPartitionVersion;
        updatePayload.pending_partition_version = null;
      }
      if (Array.isArray(targetIds) && targetIds.length > 0) {
        // oldCount + 1: the two children replace the source, and every
        // non-participating sibling is carried forward into the new
        // epoch by the cutover step before this mutation lands.
        updatePayload.partition_count = targetIds.length +
          (Array.isArray(siblingIds) ? siblingIds.length : 0);
      }
    }

    // A FAILED split withdraws the pending epoch in the same mutation
    // (mirrors the merge abort contract): the source partition stays
    // authoritative at the active epoch and no pending split target may
    // remain accepted by the descriptor-epoch contract.
    if (workflow.status === PARTITION_TRANSITION_STATE.FAILED) {
      updatePayload.pending_partition_version = null;
    }

    const isEpochTransition =
      workflow.status === PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE ||
      workflow.status === PARTITION_TRANSITION_STATE.FAILED;
    const mutationOptions = this.buildSplitTransitionMutationOptions(
      workflow,
      updatePayload,
      serializedMetadata,
      isEpochTransition,
    );
    const mutationResult = await this.getControlPlaneSystemTableGateway()
      .submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.TABLES,
        whereClause: {table_id: workflow.tableId},
        data: updatePayload,
      }, mutationOptions);
    if (isEpochTransition) {
      this.assertSplitEpochMutationEffect(mutationResult, workflow);
    }
  }

  /**
   * Build the mutation options for one split transition row write.
   * Routine transitions tolerate pending cache visibility; the epoch
   * transitions (cutover promotion, FAILED pending withdrawal) do not —
   * an unconverged epoch mutation is a failed epoch mutation.
   * @param {Object} workflow - Workflow state.
   * @param {Object} updatePayload - Mutation data payload.
   * @param {string} serializedMetadata - Durable transition metadata.
   * @param {boolean} isEpochTransition - Epoch-changing transition.
   * @return {Object} Gateway mutation options.
   * @private
   */
  buildSplitTransitionMutationOptions(
    workflow,
    updatePayload,
    serializedMetadata,
    isEpochTransition,
  ) {
    return this.buildManagedSplitMutationOptions({
      allowPendingVisibility: !isEpochTransition,
      expectedCacheFields: {
        pending_partition_version:
          updatePayload.pending_partition_version,
        partition_transition_state: workflow.status,
        partition_transition_metadata: serializedMetadata,
      },
    });
  }

  /**
   * Assert the cutover epoch flip landed exactly one row. A zero-row
   * "success" (duplicate/coalesced delivery, stale where-clause) means
   * the tables row did NOT change; advancing in-memory status on that
   * outcome silently activates a cutover the durable state never saw.
   * @param {Object} mutationResult - Gateway mutation result.
   * @param {Object} workflow - Workflow state.
   * @return {void}
   * @private
   */
  assertSplitEpochMutationEffect(mutationResult, workflow) {
    if (mutationResult?.success === false) {
      throw new Error(
        mutationResult.error ||
          QUERY_ERROR_MSG.TABLE_SPLIT_EPOCH_PERSIST_EFFECT_FAILED,
      );
    }
    const affectedRows = Number(
      mutationResult?.partitionResult?.affectedRows ??
        mutationResult?.affectedRows,
    );
    if (!Number.isFinite(affectedRows) || affectedRows !== 1) {
      throw new Error(
        QUERY_ERROR_MSG.TABLE_SPLIT_EPOCH_PERSIST_EFFECT_FAILED +
        LOCAL_STR_EPOCH_EFFECT_DETAIL +
        `${workflow.workflowId}, observed ${affectedRows}`,
      );
    }
  }

  /**
   * Carry one non-participating sibling partition descriptor forward
   * into the split target epoch. Without this, the routing predicate
   * (partition_version must equal active_partition_version exactly)
   * would blackhole the sibling's key range the moment the cutover
   * promotes the epoch (merge already enforces this carry-forward).
   * Fail-closed: a zero-row update throws.
   * @param {string} partitionId - Sibling partition ID.
   * @param {number} targetVersion - Split target epoch.
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
      }, this.buildManagedSplitMutationOptions({skipCacheWait: true}));
    this.assertSplitEpochMutationEffect(mutationResult, {
      workflowId: `sibling:${partitionId}`,
    });
    this.logger.info(MANAGED_SPLIT_LOG_MSG.SIBLING_CARRIED_FORWARD, {
      partitionId,
      targetVersion,
    });
  }

  /**
   * Clear the durable transition columns after dissolution completes.
   * Without this terminal clear the tables row would keep
   * split_cutover_active forever and every later split/merge on the
   * table would be refused as already-in-progress (merge already
   * enforces this terminal clear).
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
      }, this.buildManagedSplitMutationOptions({
        allowPendingVisibility: false,
        expectedCacheFields: {
          partition_transition_state: null,
          partition_transition_metadata: null,
        },
      }));
    this.assertSplitEpochMutationEffect(mutationResult, workflow);
    this.logger.info(MANAGED_SPLIT_LOG_MSG.TERMINAL_TRANSITION_CLEARED, {
      workflowId: workflow.workflowId,
      tableId: workflow.tableId,
    });
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

    // Durable ownership claim triple: the tables transition row carries
    // the fencing state so a recovering node observes who owns the
    // workflow, at which fence epoch, and until when — no schema change
    // required (embedded in the serialized metadata).
    return stampOwnershipClaimMetadata(metadata, workflow);
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
   * Ensure child partition metadata rows exist with the expected identity.
   * Retries after deferred execution reuse existing rows instead of reinserting.
   * @param {Object} options
   * @return {Promise<void>}
   * @private
   */
  async ensureChildPartitionMetadata(options = {}) {
    const leftPartitionMetadata = options.leftPartitionMetadata;
    const rightPartitionMetadata = options.rightPartitionMetadata;
    const leftPartitionId = String(leftPartitionMetadata?.partition_id || '');
    const rightPartitionId = String(rightPartitionMetadata?.partition_id || '');
    const leftExistingPartition = this.resolveChildPartitionMetadataRow(
      leftPartitionId,
    );
    const rightExistingPartition = this.resolveChildPartitionMetadataRow(
      rightPartitionId,
    );
    const leftExists = !!leftExistingPartition;
    const rightExists = !!rightExistingPartition;

    if (!leftExists && !rightExists) {
      await this.insertPartitionMetadataAtomically(
        leftPartitionMetadata,
        rightPartitionMetadata,
      );
      return;
    }

    if (leftExists !== rightExists) {
      // A prior attempt crashed between the two child inserts. The
      // survivor is unroutable (the epoch never promoted) and carries no
      // data, so remove it and let this attempt re-insert both rows —
      // wedging the split forever on a phantom child is worse.
      const orphanPartitionId = leftExists ?
        leftPartitionId :
        rightPartitionId;
      await this.deletePartitionMetadata(orphanPartitionId);
      await this.insertPartitionMetadataAtomically(
        leftPartitionMetadata,
        rightPartitionMetadata,
      );
      return;
    }

    this.assertExistingChildPartitionMetadataMatches(
      leftPartitionMetadata,
      leftExistingPartition,
    );
    this.assertExistingChildPartitionMetadataMatches(
      rightPartitionMetadata,
      rightExistingPartition,
    );
  }

  /**
   * Resolve one existing child metadata row by partition identity.
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  resolveChildPartitionMetadataRow(partitionId) {
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

  /**
   * Assert an existing child row matches expected split metadata fields.
   * @param {Object} expected
   * @param {Object} existing
   * @return {void}
   * @private
   */
  assertExistingChildPartitionMetadataMatches(expected, existing) {
    const mismatches = [];
    const compareField = (label, expectedValue, existingValue) => {
      if (expectedValue !== existingValue) {
        mismatches.push({
          field: label,
          expected: expectedValue,
          actual: existingValue,
        });
      }
    };

    compareField(
      LOCAL_STR_PARTITION_ID,
      expected.partition_id,
      existing.partition_id ?? existing.partitionId ?? null,
    );
    compareField(
      LOCAL_STR_TABLE_ID,
      expected.table_id,
      existing.table_id ?? existing.tableId ?? null,
    );
    compareField(
      LOCAL_STR_TABLE_NAME,
      expected.table_name,
      existing.table_name ?? existing.tableName ?? null,
    );
    compareField(
      LOCAL_STR_PARTITION_KEY_START,
      expected.partition_key_start,
      existing.partition_key_start ?? existing.partitionKeyStart ?? null,
    );
    compareField(
      LOCAL_STR_PARTITION_KEY_END,
      expected.partition_key_end,
      existing.partition_key_end ?? existing.partitionKeyEnd ?? null,
    );
    compareField(
      LOCAL_STR_PARTITION_VERSION,
      expected.partition_version,
      existing.partition_version ?? existing.partitionVersion ?? null,
    );
    const descriptorEpochDecision = buildPartitionDescriptorEpochDecision({
      tableDescriptor: {
        active_partition_version: expected.partition_version,
      },
      partitionDescriptor: existing,
      requirePartitionDescriptor: true,
    });
    if (!isPartitionDescriptorEpochAccepted(descriptorEpochDecision)) {
      mismatches.push({
        field: LOCAL_STR_PARTITION_VERSION,
        expected: expected.partition_version,
        actual: existing.partition_version ?? existing.partitionVersion ?? null,
      });
    }

    if (mismatches.length > 0) {
      throw new Error(
        LOCAL_STR_MANAGED_SPLIT_CHILD_PARTITION_METADATA_M +
        `${expected.partition_id}: ${JSON.stringify(mismatches)}`,
      );
    }
  }

  /**
   * Insert one child partition row without a per-row cache wait.
   * @param {Object} partitionMetadata - Partition row payload.
   * @return {Promise<void>}
   * @private
   */
  async insertPartitionMetadata(partitionMetadata) {
    const cdcIntegrationService = this.getCDCIntegrationService();
    if (!cdcIntegrationService && !this.controlPlaneSystemTableGateway) {
      return;
    }
    await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
      tableName: TABLES.PARTITIONS,
      row: partitionMetadata,
    }, this.buildManagedSplitMutationOptions({skipCacheWait: true}));
  }

  /**
   * Delete one partition metadata row (orphan-child cleanup before a
   * split retry re-inserts both children).
   * @param {string} partitionId - Partition row identity.
   * @return {Promise<Object|null>} The gateway mutation result, or null
   *   when no mutation path is wired.
   * @private
   */
  async deletePartitionMetadata(partitionId) {
    const cdcIntegrationService = this.getCDCIntegrationService();
    if (!cdcIntegrationService && !this.controlPlaneSystemTableGateway) {
      return null;
    }
    return this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.DELETE,
      tableName: TABLES.PARTITIONS,
      whereClause: {partition_id: partitionId},
    }, this.buildManagedSplitMutationOptions({skipCacheWait: true}));
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
        typeof txCoordinator.begin !== LOCAL_STR_FUNCTION ||
        typeof txCoordinator.commit !== LOCAL_STR_FUNCTION ||
        typeof txCoordinator.rollback !== LOCAL_STR_FUNCTION) {
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

function applyManagedSplitWorkflowPersistenceMethods(targetClass) {
  const sourcePrototype = ManagedSplitWorkflowPersistenceMethods.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyManagedSplitWorkflowPersistenceMethods};
