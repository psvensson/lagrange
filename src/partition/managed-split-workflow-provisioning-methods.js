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
  STORAGE_ADMISSION_DECISION_TYPE,
} from '../rebalancer/storage-admission-constants.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
import {
  buildPartitionDescriptorEpochDecision,
  isPartitionDescriptorEpochAccepted,
} from './partition-descriptor-epoch-contract.js';
import {SPLIT_PARTICIPANT_PREFIX} from './split-ack-constants.js';
import {
  isRetryableManagedSplitExecutionFailure,
  resolveRetryableManagedSplitExecutionDecisionType,
} from './managed-split-retry-policy.js';

const LOCAL_NUM_TWO = 2;
const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_HO8X3 = 'split_execution_failure';
const LOCAL_STR_1KKL2 = 'Failed to persist managed split workflow failure';
const LOCAL_STR_93870 = 'Managed split child partition metadata is inconsistent: exactly one ';
const LOCAL_STR_CHILD_ROW_EXISTS = 'child row exists';
const LOCAL_STR_PARTITION_ID = 'partition_id';
const LOCAL_STR_TABLE_ID = 'table_id';
const LOCAL_STR_TABLE_NAME = 'table_name';
const LOCAL_STR_S87I2 = 'partition_key_start';
const LOCAL_STR_PARTITION_KEY_END = 'partition_key_end';
const LOCAL_STR_PARTITION_VERSION = 'partition_version';
const LOCAL_STR_1BLIL = 'Managed split child partition metadata mismatch for ';
const LOCAL_STR_DESCRIPTOR_EPOCH_REJECTED =
  'Managed split partition descriptor epoch rejected stale evidence';

const CRITICAL_SPLIT_MINIMUM_ROUTABLE_SOURCE_COUNT = 1;

class ManagedSplitWorkflowProvisioningMethods {
  resolvePersistedSplitPlan(existingTransition, sourcePartitionInfo) {
    if (!this.isRetryableAdmissionState(existingTransition)) {
      return null;
    }

    const splitKey = existingTransition?.metadata?.[
      PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY
    ];
    const targetPartitionIds = Array.isArray(
      existingTransition?.metadata?.[
        PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
      ],
    ) ?
      existingTransition.metadata[
        PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
      ] :
      null;
    if (!splitKey ||
        !targetPartitionIds ||
        targetPartitionIds.length !== LOCAL_NUM_TWO ||
        !targetPartitionIds[LOCAL_NUM_ZERO] ||
        !targetPartitionIds[LOCAL_NUM_ONE]) {
      return null;
    }

    const [leftPartitionId, rightPartitionId] = targetPartitionIds;
    const sourceRange = this.resolvePartitionKeyRange(sourcePartitionInfo);
    const leftPartitionInfo = this.getPartitionInfo(leftPartitionId);
    const rightPartitionInfo = this.getPartitionInfo(rightPartitionId);
    const leftRange = this.resolvePartitionKeyRange(
      leftPartitionInfo,
      {
        start: sourceRange.start,
        end: splitKey,
      },
    );
    const rightRange = this.resolvePartitionKeyRange(
      rightPartitionInfo,
      {
        start: splitKey,
        end: sourceRange.end,
      },
    );

    return {
      medianKey: splitKey,
      leftPartition: {
        partitionId: String(leftPartitionId),
        keyRange: leftRange,
      },
      rightPartition: {
        partitionId: String(rightPartitionId),
        keyRange: rightRange,
      },
    };
  }

  /**
   * Resolve one partition key range with optional fallback defaults.
   * @param {Object|null} partitionInfo
   * @param {Object} fallbackRange
   * @return {{start: *, end: *}}
   * @private
   */
  resolvePartitionKeyRange(partitionInfo, fallbackRange = {}) {
    return {
      start: partitionInfo?.partition_key_start ??
        partitionInfo?.partitionKeyStart ??
        fallbackRange.start ??
        null,
      end: partitionInfo?.partition_key_end ??
        partitionInfo?.partitionKeyEnd ??
        fallbackRange.end ??
        null,
    };
  }

  /**
   * Persist one retryable split deferral for transient child provisioning
   * failures discovered after split admission has already been accepted.
   * @param {Object} options
   * @return {Promise<Object|null>}
   * @private
   */
  async handleRetryablePostAdmissionExecutionFailure(options) {
    if (!this.isRetryablePostAdmissionExecutionError(options.error)) {
      return null;
    }

    const decisionType = this.resolveRetryableExecutionDecisionType(
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
      QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED;
    const deferredMetadata = {
      ...(workflow?.metadata || {}),
      [PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]:
        options.admission,
      [PARTITION_TRANSITION_METADATA_FIELD.RETRY]:
        retry,
      [PARTITION_TRANSITION_METADATA_FIELD.FAILURE]: {
        classification: 'split_child_provisioning_deferred',
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
      partitionId: options.partitionId,
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
   * Determine whether one split execution failure should be retried.
   * @param {Error} error
   * @return {boolean}
   * @private
   */
  isRetryablePostAdmissionExecutionError(error) {
    return isRetryableManagedSplitExecutionFailure(error);
  }

  /**
   * Resolve one decision type for retryable post-admission failures.
   * @param {Error} error
   * @return {string}
   * @private
   */
  resolveRetryableExecutionDecisionType(error) {
    return resolveRetryableManagedSplitExecutionDecisionType(error);
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
      this.isRetryableAdmissionState(existingTransition);
    const attemptCount = Number.isInteger(previousAttemptCount) &&
      previousAttemptCount > 0 ?
      previousAttemptCount + 1 :
      (isRetryingExistingWorkflow ? 2 : 1);
    return {
      attemptCount,
      lastAttemptAt: new Date(this.now()).toISOString(),
      nextAttemptAt: null,
      backoffMs: LOCAL_NUM_ZERO,
    };
  }

  /**
   * Resolve one retry schedule from persisted transition metadata.
   * @param {Object|null} existingTransition
   * @return {Object|null}
   * @private
   */
  resolveScheduledRetry(existingTransition) {
    if (!this.isRetryableAdmissionState(existingTransition)) {
      return null;
    }

    const retryMetadata = existingTransition?.metadata?.[
      PARTITION_TRANSITION_METADATA_FIELD.RETRY
    ];
    if (!retryMetadata || typeof retryMetadata !== LOCAL_STR_OBJECT) {
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
      minimumRoutableSourceCount: options.minimumRoutableSourceCount,
      isCriticalSystemPartition: options.isCriticalSystemPartition === true,
      discoveredTargetNodeIds: [...options.discoveredTargetNodeIds],
      candidateTargetNodeIds: [...options.candidateTargetNodeIds],
      sourceRoutableNodeIds: [...options.sourceRoutableNodeIds],
    };
    if (typeof this.captureTopologySnapshot !== LOCAL_STR_FUNCTION) {
      return baseSnapshot;
    }

    const capturedSnapshot = await this.captureTopologySnapshot({
      ...options,
      baseSnapshot,
    });
    if (!capturedSnapshot || typeof capturedSnapshot !== LOCAL_STR_OBJECT) {
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
    if (childPartitionIds.length === LOCAL_NUM_ZERO) {
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
    for (let index = LOCAL_NUM_ZERO; index < candidateTargetNodeIds.length; index += LOCAL_NUM_ONE) {
      candidateOrderByNodeId.set(candidateTargetNodeIds[index], index);
    }

    const usageByNodeId = new Map();
    for (const nodeId of sourceRoutableNodeIds) {
      usageByNodeId.set(nodeId, (usageByNodeId.get(nodeId) || LOCAL_NUM_ZERO) + LOCAL_NUM_ONE);
    }

    const childTargetNodeIdsByPartitionId = {};
    for (const childPartitionId of childPartitionIds) {
      const targetNodeIds = [];
      if (anchorNodeId) {
        targetNodeIds.push(anchorNodeId);
        usageByNodeId.set(
          anchorNodeId,
          (usageByNodeId.get(anchorNodeId) || LOCAL_NUM_ZERO) + LOCAL_NUM_ONE,
        );
      }

      while (targetNodeIds.length < replicaCount) {
        const remainingNodeIds = candidateTargetNodeIds.filter((nodeId) =>
          !targetNodeIds.includes(nodeId),
        );
        if (remainingNodeIds.length === LOCAL_NUM_ZERO) {
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
            (candidateOrderByNodeId.get(leftNodeId) || LOCAL_NUM_ZERO) -
            (candidateOrderByNodeId.get(rightNodeId) || LOCAL_NUM_ZERO)
          );
        });

        const selectedNodeId = remainingNodeIds[0];
        targetNodeIds.push(selectedNodeId);
        usageByNodeId.set(
          selectedNodeId,
          (usageByNodeId.get(selectedNodeId) || LOCAL_NUM_ZERO) + LOCAL_NUM_ONE,
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
          (candidateOrderByNodeId.get(leftNodeId) || LOCAL_NUM_ZERO) -
          (candidateOrderByNodeId.get(rightNodeId) || LOCAL_NUM_ZERO)
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

    return candidateTargetNodeIds[LOCAL_NUM_ZERO] || null;
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
    if (Number.isInteger(persistedVersion) && persistedVersion > LOCAL_NUM_ZERO) {
      this.assertSplitTargetDescriptorEpoch(tableInfo, persistedVersion);
      return persistedVersion;
    }
    const targetVersion =
      this.resolveActivePartitionVersion(tableInfo) + LOCAL_NUM_ONE;
    this.assertSplitTargetDescriptorEpoch(tableInfo, targetVersion);
    return targetVersion;
  }

  /**
   * Validate one split target version against the table descriptor epoch.
   * @param {Object} tableInfo
   * @param {number} targetVersion
   * @return {Object}
   * @private
   */
  assertSplitTargetDescriptorEpoch(tableInfo, targetVersion) {
    const decision = buildPartitionDescriptorEpochDecision({
      tableDescriptor: tableInfo,
      routeTargetPartitionVersion: targetVersion,
      requireRouteTargetVersion: true,
      allowNextActivePartitionVersion: true,
    });
    if (!isPartitionDescriptorEpochAccepted(decision)) {
      throw new Error(LOCAL_STR_DESCRIPTOR_EPOCH_REJECTED);
    }
    return decision;
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
  resolveSplitMinimumRoutableSourceCount(options = {}) {
    if (options.isCriticalSystemPartition === true) {
      return CRITICAL_SPLIT_MINIMUM_ROUTABLE_SOURCE_COUNT;
    }
    return options.requiredReplicaCount;
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
      minimumRoutableSourceCount: options.minimumRoutableSourceCount,
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
    if (Number.isFinite(sizeBytes) && sizeBytes > LOCAL_NUM_ZERO) {
      return Math.ceil(sizeBytes);
    }
    return LOCAL_NUM_ONE;
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
            classification: LOCAL_STR_HO8X3,
            message: error?.message || QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED,
            failedAt: new Date(this.now()).toISOString(),
            ...(timeoutClassification ? {timeoutClassification} : {}),
          },
        },
      });
    } catch (persistError) {
      this.logger.error(LOCAL_STR_1KKL2, {
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
      if (Array.isArray(targetIds) && targetIds.length > LOCAL_NUM_ZERO) {
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
        workflow.participants.size === LOCAL_NUM_ZERO) {
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
        workflow.participants.size === LOCAL_NUM_ZERO) {
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
        LOCAL_STR_93870 +
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
      LOCAL_STR_S87I2,
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

    if (mismatches.length > LOCAL_NUM_ZERO) {
      throw new Error(
        LOCAL_STR_1BLIL +
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

export {ManagedSplitWorkflowProvisioningMethods};
