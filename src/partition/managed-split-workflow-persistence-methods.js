import {SIBLING_DESCRIPTOR_ACTION} from './partition-sibling-descriptor-effect.js';
import {submitSplitSiblingDescriptor} from './managed-split-sibling-descriptor.js';
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
import {RECORD_CHANGE_KIND} from './managed-workflow-record-store.js';
import {SPLIT_PARTICIPANT_PREFIX} from './split-ack-constants.js';
import {submitSplitChildFinalization} from './managed-split-child-descriptor.js';
import {childFinalIntent} from './managed-split-descriptor-cleanup.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_CONSTRUCTOR = 'constructor';
const LOCAL_STR_SPLIT_EXECUTION_FAILURE = 'split_execution_failure';
const LOCAL_STR_FAILED_TO_PERSIST_MANAGED_SPLIT_WORKFLOW = 'Failed to persist managed split workflow failure';
const LOCAL_STR_EPOCH_EFFECT_DETAIL =
  ': expected exactly 1 tables row update for workflow ';

class ManagedSplitWorkflowPersistenceMethods {
  /**
   * Persist an execution failure after a split has already been admitted.
   * @param {string} workflowId
   * @param {Error} error
   * @return {Promise<void>}
   * @private
   */
  async persistExecutionFailure(workflowId, error, origin) {
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
      const failure = {
        classification: LOCAL_STR_SPLIT_EXECUTION_FAILURE,
        message: error?.message || QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED,
        failedAt: new Date(this.now()).toISOString(),
        ...(timeoutClassification ? {timeoutClassification} : {}),
      };
      // Pre-cutover only: after the cutover the failure is a typed
      // incident and the phase never moves backwards (round 7, D4).
      await this.workflowCoordinator.recordExecutionOutcome(workflowId, {
        status: PARTITION_TRANSITION_STATE.FAILED,
        delta: {[PARTITION_TRANSITION_METADATA_FIELD.FAILURE]: failure},
        incident: {reason: failure.message,
          classification: failure.classification}}, origin);
    } catch (persistError) {
      this.logger.error(LOCAL_STR_FAILED_TO_PERSIST_MANAGED_SPLIT_WORKFLOW, {
        workflowId,
        error: persistError?.message || persistError,
      });
    }
  }

  /**
   * Encode one change's next workflow for the record store
   * (managed-workflow-record-store.js): the full transition payload (epoch
   * fields included) or, for a claim, the metadata alone. The canonical
   * split participants ride every write. Fail-closed: a transition with no
   * CDC bridge throws (nothing is written).
   * @param {Object} workflow - The change's next workflow.
   * @param {string} kind - RECORD_CHANGE_KIND.
   * @return {Object} {data, options}.
   * @private
   */
  encodeWorkflowRecord(workflow, kind) {
    const candidate = this.withCanonicalSplitParticipants(workflow);
    if (kind === RECORD_CHANGE_KIND.CLAIM) {
      return {
        data: {
          partition_transition_metadata: JSON.stringify(
            this.buildPersistedTransitionMetadata(candidate)),
          updated_at: candidate.updatedAt,
        },
        // Claim/renew writes answer at their commit like every routed
        // write (the compare-and-swap carries the race guarantee).
        options: this.buildManagedSplitMutationOptions(),
      };
    }
    const cdcIntegrationService = this.getCDCIntegrationService();
    if (!cdcIntegrationService ||
        typeof cdcIntegrationService.updateSystemTableRow !== LOCAL_STR_FUNCTION) {
      throw new Error(
        QUERY_ERROR_MSG.TABLE_SPLIT_TRANSITION_PERSIST_UNAVAILABLE,
      );
    }
    const built = this.buildSplitTransitionUpdatePayload(candidate);
    return {
      data: built.updatePayload,
      // An epoch transition is the committed write: it answers at its commit
      // like every routed write (no cache-visibility condition).
      options: this.buildManagedSplitMutationOptions(),
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
      options: this.buildManagedSplitMutationOptions(),
    };
  }

  /**
   * The full tables-row transition payload for one split workflow state:
   * serialized metadata, the pending epoch, and the status-dependent epoch
   * effects (cutover promotes the target epoch; FAILED withdraws it).
   * @param {Object} workflow - Workflow state.
   * @return {Object} {updatePayload, serializedMetadata}.
   * @private
   */
  buildSplitTransitionUpdatePayload(workflow) {
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

    return {updatePayload, serializedMetadata};
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
   * @param {Object} workflow - Record that issued the promotion.
   * @param {Object} subject - Captured immutable descriptor preimage.
   * @return {Promise<void>}
   * @private
   */
  async promoteSiblingPartitionVersion(workflow, subject) {
    return submitSplitSiblingDescriptor(this, workflow, subject, SIBLING_DESCRIPTOR_ACTION.PROMOTE);
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
    // The completion is the record's last write: a change cleared only
    // while the record is this owner's at its fence in the state the caller
    // finished it in.
    await this.workflowCoordinator.clearWorkflowRecord(workflow.workflowId,
      new Set([String(workflow.status)]));
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

  async finalizeAbortedSplitChild(workflow, partitionId) {
    const intent = childFinalIntent(workflow.metadata, workflow.tableId, partitionId);
    return submitSplitChildFinalization(this, intent);
  }

  /**
   * Delete the dissolved source descriptor after successful cutover.
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
    }, this.buildManagedSplitMutationOptions());
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
