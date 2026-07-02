import {
  STORAGE_ADMISSION_DECISION_TYPE,
  STORAGE_ADMISSION_OPERATION_TYPE,
} from '../rebalancer/storage-admission-constants.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  isRetryablePartitionTransitionState,
  SPLIT_MERGE_LOG_MSG,
} from './partition-constants.js';
import {SPLIT_PARTICIPANT_PREFIX} from './split-ack-constants.js';
import {
  isRetryableManagedSplitTransition,
} from './managed-split-retry-policy.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_DEFERRED = 'deferred';
const LOCAL_STR_MANAGED_SPLIT_CHILD_PROVISIONING_PRECHEC = 'Managed split child provisioning precheck could not satisfy ';
const LOCAL_STR_MINIMUM_ROUTABLE_COHORTS = 'minimum routable cohorts: ';
const LOCAL_STR_SEMI_SPACE = '; ';

class ManagedSplitWorkflowStateMethods {
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
        minimumRoutableSourceCount: options.minimumRoutableSourceCount,
        isCriticalSystemPartition: options.isCriticalSystemPartition === true,
        candidateTargetNodeIds: [...options.candidateTargetNodeIds],
        sourceRoutableNodeIds: [...options.sourceRoutableNodeIds],
        estimatedBytes: options.estimatedBytes,
        decisionTimestamp: new Date(this.now()).toISOString(),
      },
    };
  }

  /**
   * Persist one participant acknowledgement by flushing the owning workflow
   * through the canonical tables transition row.
   * @param {Object} participant
   * @return {Promise<void>}
   * @private
   */
  async persistWorkflowParticipantState(participant) {
    const workflowId = String(participant?.workflowId || '');
    if (!workflowId) {
      return;
    }
    const workflow = this.workflowCoordinator.getWorkflowById(workflowId);
    if (!workflow) {
      return;
    }
    workflow.updatedAt = Number.isFinite(participant?.updatedAt) ?
      participant.updatedAt :
      this.now();
    await this.persistWorkflowTransition(workflow);
  }

  /**
   * Resolve one workflow from memory or recover it from the durable transition
   * row when async source-side execution resumes after execute() returns.
   * @param {string} workflowId
   * @return {Object|null}
   * @private
   */
  resolveWorkflowState(workflowId) {
    const normalizedWorkflowId = String(workflowId || '');
    if (!normalizedWorkflowId) {
      return null;
    }
    const existingWorkflow =
      this.workflowCoordinator.getWorkflowById(normalizedWorkflowId);
    if (existingWorkflow) {
      return existingWorkflow;
    }
    return this.recoverWorkflowState(normalizedWorkflowId);
  }

  /**
   * Recover one workflow snapshot from the canonical tables transition row.
   * @param {string} workflowId
   * @return {Object|null}
   * @private
   */
  recoverWorkflowState(workflowId) {
    for (const tableInfo of this.listTableInfos()) {
      const transition = this.parsePartitionTransition(tableInfo);
      if (!transition || !transition.metadata) {
        continue;
      }
      const persistedWorkflowId = String(
        transition.metadata[
          PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID
        ] || '',
      );
      if (persistedWorkflowId !== workflowId) {
        continue;
      }

      const partitionId = String(
        transition.metadata[
          PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID
        ] || '',
      );
      if (!partitionId) {
        return null;
      }

      const workflow = this.workflowCoordinator.createWorkflowRecord({
        workflowId,
        ownerKey: partitionId,
        tableId: tableInfo?.table_id || tableInfo?.tableId || null,
        tableName: tableInfo?.table_name || tableInfo?.tableName || null,
        partitionId,
        step: transition.state,
        status: transition.state,
        metadata: this.cloneTransitionValue(transition.metadata),
        participants: this.restoreParticipantsFromMetadata(
          workflowId,
          transition.metadata,
        ),
        createdAt: Number(
          tableInfo?.created_at ??
            tableInfo?.createdAt ??
            tableInfo?.updated_at ??
            tableInfo?.updatedAt ??
            this.now(),
        ),
        updatedAt: Number(
          tableInfo?.updated_at ??
            tableInfo?.updatedAt ??
            tableInfo?.created_at ??
            tableInfo?.createdAt ??
            this.now(),
        ),
      });
      this.workflowCoordinator.setWorkflowState(workflow);
      if (workflow.step) {
        this.workflowCoordinator.markTransitionCommitted(
          workflow.workflowId,
          workflow.step,
        );
      }
      this.ensureCanonicalSplitParticipants(
        workflow.workflowId,
        workflow.metadata,
      );
      return workflow;
    }

    return null;
  }

  /**
   * Restore persisted split participants from transition metadata.
   * @param {string} workflowId
   * @param {Object} metadata
   * @return {Map<string, Object>}
   * @private
   */
  restoreParticipantsFromMetadata(workflowId, metadata = {}) {
    const participants = new Map();
    const persistedParticipants =
      metadata[PARTITION_TRANSITION_METADATA_FIELD.PARTICIPANTS];
    if (!persistedParticipants ||
        typeof persistedParticipants !== LOCAL_STR_OBJECT) {
      return participants;
    }

    for (const [participantKey, participant] of Object.entries(
      persistedParticipants,
    )) {
      participants.set(participantKey, {
        ...this.cloneTransitionValue(participant),
        workflowId,
        participantId: String(participant?.participantId || participantKey),
        participantKey,
        createdAt: Number.isFinite(participant?.createdAt) ?
          participant.createdAt :
          this.now(),
        updatedAt: Number.isFinite(participant?.updatedAt) ?
          participant.updatedAt :
          this.now(),
      });
    }
    return participants;
  }

  /**
   * Ensure the canonical split participants exist on the workflow snapshot.
   * @param {string} workflowId
   * @param {Object} transitionMetadata
   * @return {Object|null}
   * @private
   */
  ensureCanonicalSplitParticipants(workflowId, transitionMetadata = {}) {
    const workflow = this.workflowCoordinator.getWorkflowById(workflowId);
    if (!workflow) {
      return null;
    }
    if (!(workflow.participants instanceof Map)) {
      workflow.participants = new Map();
    }

    const createdAt = Number.isFinite(workflow.createdAt) ?
      workflow.createdAt :
      this.now();
    const updatedAt = Number.isFinite(workflow.updatedAt) ?
      workflow.updatedAt :
      this.now();
    const sourcePartitionId = String(
      transitionMetadata?.[
        PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID
      ] || workflow.partitionId || '',
    );
    const targetPartitionIds = Array.isArray(
      transitionMetadata?.[
        PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
      ],
    ) ?
      transitionMetadata[
        PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
      ] :
      [];
    const participantSpecs = [{
      participantKey: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
      participantId: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
      partitionId: sourcePartitionId || null,
    }];

    if (targetPartitionIds.length > 0) {
      participantSpecs.push({
        participantKey: SPLIT_PARTICIPANT_PREFIX.LEFT_CHILD,
        participantId: SPLIT_PARTICIPANT_PREFIX.LEFT_CHILD,
        partitionId: targetPartitionIds[0] || null,
      });
    }
    if (targetPartitionIds.length > 1) {
      participantSpecs.push({
        participantKey: SPLIT_PARTICIPANT_PREFIX.RIGHT_CHILD,
        participantId: SPLIT_PARTICIPANT_PREFIX.RIGHT_CHILD,
        partitionId: targetPartitionIds[1] || null,
      });
    }

    for (const participantSpec of participantSpecs) {
      if (!participantSpec.partitionId &&
          participantSpec.participantKey !==
            SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION) {
        continue;
      }
      if (workflow.participants.has(participantSpec.participantKey)) {
        continue;
      }
      workflow.participants.set(participantSpec.participantKey, {
        workflowId,
        participantId: participantSpec.participantId,
        participantKey: participantSpec.participantKey,
        partitionId: participantSpec.partitionId,
        status: null,
        createdAt,
        updatedAt,
      });
    }
    return workflow;
  }

  /**
   * Clone one transition metadata value through JSON serialization.
   * @param {*} value
   * @return {*}
   * @private
   */
  cloneTransitionValue(value) {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    return JSON.parse(JSON.stringify(value));
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
      minimumRoutableSourceCount: context.minimumRoutableSourceCount,
      isCriticalSystemPartition: context.isCriticalSystemPartition === true,
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
        typeof result.projectedUtilizationByNodeId === LOCAL_STR_OBJECT) {
      compact.projectedUtilizationByNodeId = JSON.parse(
        JSON.stringify(result.projectedUtilizationByNodeId),
      );
    }
    if (result.projectedUtilization &&
        typeof result.projectedUtilization === LOCAL_STR_OBJECT) {
      compact.projectedUtilization = JSON.parse(
        JSON.stringify(result.projectedUtilization),
      );
    }
    if (result.readinessSnapshots &&
        typeof result.readinessSnapshots === LOCAL_STR_OBJECT) {
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
            typeof entry.projectedUtilization === LOCAL_STR_OBJECT ?
            JSON.parse(JSON.stringify(entry.projectedUtilization)) :
            null,
        nodeSummary: entry?.nodeSummary &&
          typeof entry.nodeSummary === LOCAL_STR_OBJECT ?
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
          typeof entry.nodeSummary === LOCAL_STR_OBJECT ?
          JSON.parse(JSON.stringify(entry.nodeSummary)) :
          null,
        readinessSnapshot: entry?.readinessSnapshot &&
          typeof entry.readinessSnapshot === LOCAL_STR_OBJECT ?
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
          `decision=${admission.decisionType || LOCAL_STR_DEFERRED})`,
      );
    }

    return LOCAL_STR_MANAGED_SPLIT_CHILD_PROVISIONING_PRECHEC +
      LOCAL_STR_MINIMUM_ROUTABLE_COHORTS + details.join(LOCAL_STR_SEMI_SPACE);
  }

  /**
   * Resolve whether an existing transition may be retried through admission.
   * @param {string} state
   * @return {boolean}
   * @private
   */
  isRetryableAdmissionState(transitionOrState) {
    if (transitionOrState &&
        typeof transitionOrState === LOCAL_STR_OBJECT) {
      return isRetryableManagedSplitTransition(transitionOrState);
    }
    const state = String(transitionOrState || '');
    if (isRetryablePartitionTransitionState(state)) {
      return true;
    }
    return isRetryableManagedSplitTransition({state});
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
}

export {ManagedSplitWorkflowStateMethods};
