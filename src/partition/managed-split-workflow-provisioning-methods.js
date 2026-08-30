import {
  QUERY_ERROR_MSG,
} from '../query/query-constants.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
} from '../rebalancer/storage-admission-constants.js';
import {
  MANAGED_SPLIT_LOG_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
import {
  buildPartitionDescriptorEpochDecision,
  isPartitionDescriptorEpochAccepted,
} from './partition-descriptor-epoch-contract.js';
import {
  isRetryableManagedSplitExecutionFailure,
  resolveRetryableManagedSplitExecutionDecisionType,
} from './managed-split-retry-policy.js';
import {
  applyManagedSplitWorkflowPersistenceMethods,
} from './managed-split-workflow-persistence-methods.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_FUNCTION = 'function';
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
        targetPartitionIds.length !== 2 ||
        !targetPartitionIds[0] ||
        !targetPartitionIds[1]) {
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
   * Resolve the split plan for one admitted execution: a persisted plan
   * is resumed as-is (never re-planned); otherwise the planner runs and
   * a retryable planning failure becomes a typed deferral.
   * @param {Object} input
   * @return {Promise<{splitPlan: Object}|{deferredExecution: Object}>}
   * @private
   */
  async resolveExecutionSplitPlan(input) {
    if (input.persistedSplitPlan) {
      this.logger.info(MANAGED_SPLIT_LOG_MSG.PERSISTED_PLAN_RESUMED, {
        workflowId: input.deferralContext.workflowId,
        partitionId: input.deferralContext.partitionId,
        ...this.buildSplitPlanTransitionMetadata(input.persistedSplitPlan),
      });
      return {splitPlan: input.persistedSplitPlan};
    }
    try {
      return {
        splitPlan: await this.buildManagedSplitPlan(
          input.partitionInfo,
          input.tableName,
          input.tableId,
          input.primaryKeyColumn,
        ),
      };
    } catch (error) {
      const deferredExecution =
        await this.handleRetryableSplitPlanningFailure({
          ...input.deferralContext,
          error,
        });
      if (deferredExecution) {
        return {deferredExecution};
      }
      throw error;
    }
  }

  /**
   * Build the durable plan fields (split key + child ids) carried on
   * every transition row once a plan exists, so a deferred or blocked
   * retry resumes the same children instead of planning new ones.
   * @param {Object|null} splitPlan - Resolved or persisted split plan.
   * @return {Object} Metadata fields ({} when no plan exists yet).
   * @private
   */
  buildSplitPlanTransitionMetadata(splitPlan) {
    if (!splitPlan) {
      return {};
    }
    return {
      [PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY]: splitPlan.medianKey,
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]: [
        splitPlan.leftPartition.partitionId,
        splitPlan.rightPartition.partitionId,
      ],
    };
  }

  /**
   * Resolve the child partition ids of one plan ([] when no plan).
   * @param {Object|null} splitPlan
   * @return {string[]}
   * @private
   */
  resolveSplitPlanTargetPartitionIds(splitPlan) {
    return this.buildSplitPlanTransitionMetadata(splitPlan)[
      PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
    ] || [];
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
    for (
      let index = 0;
      index < candidateTargetNodeIds.length;
      index += 1
    ) {
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
      this.assertSplitTargetDescriptorEpoch(tableInfo, persistedVersion);
      return persistedVersion;
    }
    const targetVersion =
      this.resolveActivePartitionVersion(tableInfo) + 1;
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
    if (Number.isFinite(sizeBytes) && sizeBytes > 0) {
      return Math.ceil(sizeBytes);
    }
    return 1;
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

applyManagedSplitWorkflowPersistenceMethods(
  ManagedSplitWorkflowProvisioningMethods,
);

export {ManagedSplitWorkflowProvisioningMethods};
