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
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
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
const LOCAL_STR_MANAGED_SPLIT_CHILD_PARTITION_METADATA_I = 'Managed split child partition metadata is inconsistent: exactly one ';
const LOCAL_STR_CHILD_ROW_EXISTS = 'child row exists';
const LOCAL_STR_PARTITION_ID = 'partition_id';
const LOCAL_STR_TABLE_ID = 'table_id';
const LOCAL_STR_TABLE_NAME = 'table_name';
const LOCAL_STR_PARTITION_KEY_START = 'partition_key_start';
const LOCAL_STR_PARTITION_KEY_END = 'partition_key_end';
const LOCAL_STR_PARTITION_VERSION = 'partition_version';
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
   * @param {Object} workflow - Workflow state.
   * @return {Promise<void>}
   * @private
   */
  async persistWorkflowTransition(workflow) {
    const cdcIntegrationService = this.getCDCIntegrationService();
    if (!cdcIntegrationService ||
        typeof cdcIntegrationService.updateSystemTableRow !== LOCAL_STR_FUNCTION) {
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
    // by PartitionService.markSplitCutoverActive() directly; now the
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

    await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.TABLES,
      whereClause: {table_id: workflow.tableId},
      data: updatePayload,
    }, this.buildManagedSplitMutationOptions({
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
      throw new Error(
        LOCAL_STR_MANAGED_SPLIT_CHILD_PARTITION_METADATA_I +
        LOCAL_STR_CHILD_ROW_EXISTS,
      );
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
