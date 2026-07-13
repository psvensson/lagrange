import {v4 as uuidv4} from 'uuid';
import {NUM} from '../constants/index.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {
  MANAGED_MERGE_ERROR_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
  SPLIT_MERGE_DEFAULT,
  SPLIT_MERGE_ID,
} from './partition-constants.js';
import {
  buildPartitionDescriptorEpochDecision,
  isPartitionDescriptorEpochAccepted,
} from './partition-descriptor-epoch-contract.js';

const LOCAL_STR_COMMA = ',';
const LOCAL_STR_NORMAL_PARTITION_STATE = 'NORMAL';
const MERGE_WORKFLOW_ID_SEPARATOR = '-';

function resolvePartitionTableId(partitionInfo) {
  return partitionInfo.table_id || partitionInfo.tableId;
}

function resolvePartitionRowId(partitionRow) {
  return String(
    partitionRow?.partition_id ?? partitionRow?.partitionId ?? '',
  );
}

function resolvePartitionRowVersion(partitionRow) {
  const version = Number(
    partitionRow?.partition_version ?? partitionRow?.partitionVersion,
  );
  return Number.isInteger(version) && version > 0 ? version : 1;
}

function isActivePartitionRowState(partitionRow) {
  const state = String(
    partitionRow?.state ?? LOCAL_STR_NORMAL_PARTITION_STATE,
  ).toUpperCase();
  return state === LOCAL_STR_NORMAL_PARTITION_STATE;
}

/**
 * Merge plan and admission-precondition methods for ManagedMergeWorkflow:
 * source-pair validation (adjacency, shared table, leadership, criticality),
 * table-context resolution, size-threshold admission, target version /
 * merged-partition-id / workflow-id resolution against the descriptor epoch
 * contract.
 */
class ManagedMergeWorkflowPlanMethods {
  /**
   * Resolve the configured merge storage threshold.
   * @return {number}
   * @private
   */
  resolveConfiguredMergeStorageThresholdBytes() {
    const config = ConfigurationManager.getInstance();
    const configuredThreshold = Number(
      config.get(CONFIG_KEY.PARTITION_MERGE_THRESHOLD_BYTES),
    );
    return Number.isFinite(configuredThreshold) && configuredThreshold > 0 ?
      configuredThreshold :
      SPLIT_MERGE_DEFAULT.MERGE_STORAGE_THRESHOLD_BYTES;
  }

  /**
   * Validate the merge source pair: existence, shared table, adjacency,
   * local leadership, and non-critical classification.
   * @param {string[]} sourcePartitionIds
   * @return {Object} {leftInfo, rightInfo, leftRange, rightRange, tableId}
   * @private
   */
  validateMergeSourcePair(sourcePartitionIds) {
    const [leftPartitionId, rightPartitionId] = sourcePartitionIds;
    const leftInfo = this.getPartitionInfo(leftPartitionId);
    const rightInfo = this.getPartitionInfo(rightPartitionId);
    if (!leftInfo || !rightInfo) {
      throw new Error(MANAGED_MERGE_ERROR_MSG.PARTITION_NOT_FOUND);
    }
    const leftTableId = resolvePartitionTableId(leftInfo);
    if (!leftTableId ||
        leftTableId !== resolvePartitionTableId(rightInfo)) {
      throw new Error(MANAGED_MERGE_ERROR_MSG.TABLE_MISMATCH);
    }
    const leftRange = this.resolvePartitionKeyRange(leftInfo);
    const rightRange = this.resolvePartitionKeyRange(rightInfo);
    if (leftRange.end === null ||
        rightRange.start === null ||
        leftRange.end !== rightRange.start) {
      throw new Error(MANAGED_MERGE_ERROR_MSG.NOT_ADJACENT);
    }
    if (!this.isLocalManagedMergeLeader(leftInfo)) {
      throw new Error(MANAGED_MERGE_ERROR_MSG.LEADER_REQUIRED);
    }
    if (this.isSystemTablePartitionId(leftPartitionId) === true ||
        this.isSystemTablePartitionId(rightPartitionId) === true) {
      throw new Error(MANAGED_MERGE_ERROR_MSG.CRITICAL_PARTITION);
    }
    return {
      leftInfo,
      rightInfo,
      leftRange,
      rightRange,
      tableId: leftTableId,
    };
  }

  /**
   * Resolve the shared table context for one validated merge pair.
   * @param {Object} pairContext - validateMergeSourcePair output.
   * @return {Object} {tableInfo, tableName, primaryKeyColumn,
   *   existingTransition}
   * @private
   */
  resolveMergeTableContext(pairContext) {
    const tableName =
      pairContext.leftInfo.table_name || pairContext.leftInfo.tableName;
    const tableInfo = this.getTableInfo(tableName || pairContext.tableId);
    if (!tableInfo) {
      throw new Error(MANAGED_MERGE_ERROR_MSG.TABLE_NOT_FOUND);
    }
    const existingTransition = this.parsePartitionTransition(tableInfo);
    if (existingTransition &&
        !this.isRetryableAdmissionState(existingTransition)) {
      throw new Error(MANAGED_MERGE_ERROR_MSG.ALREADY_IN_PROGRESS);
    }
    const primaryKeyColumn = String(
      tableInfo.partition_key || tableInfo.partitionKey || '',
    );
    if (!primaryKeyColumn || primaryKeyColumn.includes(LOCAL_STR_COMMA)) {
      throw new Error(MANAGED_MERGE_ERROR_MSG.PRIMARY_KEY_REQUIRED);
    }
    return {tableInfo, tableName, primaryKeyColumn, existingTransition};
  }

  /**
   * Validate the merge pair and resolve the shared table context.
   * @param {string[]} sourcePartitionIds
   * @return {Object} {leftInfo, rightInfo, tableInfo, tableId, tableName,
   *   primaryKeyColumn, existingTransition}
   * @private
   */
  resolveMergeExecutionContext(sourcePartitionIds) {
    const pairContext = this.validateMergeSourcePair(sourcePartitionIds);
    return {
      ...pairContext,
      ...this.resolveMergeTableContext(pairContext),
    };
  }

  /**
   * Estimate the combined admission bytes for the merged target.
   * @param {Object} leftInfo
   * @param {Object} rightInfo
   * @return {number}
   * @private
   */
  estimateMergedBytes(leftInfo, rightInfo) {
    const resolveSize = (partitionInfo) => {
      const sizeBytes = Number(
        partitionInfo?.size_bytes ?? partitionInfo?.sizeBytes,
      );
      return Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0;
    };
    return Math.max(1, resolveSize(leftInfo) + resolveSize(rightInfo));
  }

  /**
   * Refuse merges whose combined durable size already exceeds the merge
   * storage threshold (the sources are not "under-threshold" partitions).
   * @param {number} estimatedBytes
   * @return {void}
   * @private
   */
  assertUnderMergeThreshold(estimatedBytes) {
    if (estimatedBytes > this.mergeStorageThresholdBytes) {
      throw new Error(MANAGED_MERGE_ERROR_MSG.OVER_THRESHOLD);
    }
  }

  /**
   * Validate one merge target version against the table descriptor epoch.
   * @param {Object} tableInfo
   * @param {number} targetVersion
   * @return {Object}
   * @private
   */
  assertMergeTargetDescriptorEpoch(tableInfo, targetVersion) {
    const decision = buildPartitionDescriptorEpochDecision({
      tableDescriptor: tableInfo,
      routeTargetPartitionVersion: targetVersion,
      requireRouteTargetVersion: true,
      allowNextActivePartitionVersion: true,
    });
    if (!isPartitionDescriptorEpochAccepted(decision)) {
      throw new Error(MANAGED_MERGE_ERROR_MSG.DESCRIPTOR_EPOCH_REJECTED);
    }
    return decision;
  }

  /**
   * Resolve the target version for a new or retried merge workflow.
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
      this.assertMergeTargetDescriptorEpoch(tableInfo, persistedVersion);
      return persistedVersion;
    }
    const targetVersion =
      this.resolveActivePartitionVersion(tableInfo) + 1;
    this.assertMergeTargetDescriptorEpoch(tableInfo, targetVersion);
    return targetVersion;
  }

  /**
   * Resolve the merged target partition id, reusing a persisted retry plan
   * when present.
   * @param {string} tableId
   * @param {Object|null} existingTransition
   * @return {string}
   * @private
   */
  resolveMergedPartitionId(tableId, existingTransition) {
    if (this.isRetryableAdmissionState(existingTransition)) {
      const persistedTargetPartitionId = this.resolveMergeTargetPartitionId(
        existingTransition?.metadata || {},
      );
      if (persistedTargetPartitionId) {
        return persistedTargetPartitionId;
      }
    }
    return `${tableId}${SPLIT_MERGE_ID.PARTITION_SEPARATOR}` +
      `${uuidv4().substring(0, NUM.EIGHT)}${SPLIT_MERGE_ID.MERGED_SUFFIX}`;
  }

  /**
   * Resolve the table's non-participating sibling partitions at the
   * current active epoch. These descriptors MUST be carried forward into
   * the target epoch at cutover, or their key ranges would become
   * unroutable (routing requires partition_version to equal the table's
   * active version exactly).
   * @param {Object} options
   * @param {string} options.tableId
   * @param {Object} options.tableInfo
   * @param {string[]} options.sourcePartitionIds
   * @param {string} options.mergedPartitionId
   * @return {string[]} Sibling partition ids.
   * @private
   */
  resolveMergeSiblingPartitionIds(options) {
    const activeVersion = this.resolveActivePartitionVersion(
      options.tableInfo,
    );
    const excludedPartitionIds = new Set([
      ...options.sourcePartitionIds.map((partitionId) =>
        String(partitionId || '')),
      String(options.mergedPartitionId || ''),
    ]);
    const siblingPartitionIds = [];
    for (const partitionRow of this.listTablePartitionRows(options.tableId)) {
      const partitionId = resolvePartitionRowId(partitionRow);
      if (!partitionId ||
          excludedPartitionIds.has(partitionId) ||
          resolvePartitionRowVersion(partitionRow) !== activeVersion ||
          !isActivePartitionRowState(partitionRow)) {
        continue;
      }
      siblingPartitionIds.push(partitionId);
    }
    return siblingPartitionIds;
  }

  /**
   * Resolve the sibling set to carry forward at cutover: the union of the
   * plan-time sibling set persisted in the workflow metadata and a fresh
   * recomputation against the authoritative partitions rows (the
   * transition gate prevents concurrent topology changes, so these should
   * match; the union is the safe superset — promoting a descriptor that no
   * longer exists is a no-op update).
   * @param {Object} workflow - Workflow snapshot.
   * @return {string[]} Sibling partition ids to promote.
   * @private
   */
  resolveCutoverSiblingPartitionIds(workflow) {
    const metadata = workflow?.metadata || {};
    const plannedSiblingIds =
      metadata[PARTITION_TRANSITION_METADATA_FIELD.SIBLING_PARTITION_IDS];
    const freshSiblingIds = this.resolveMergeSiblingPartitionIds({
      tableId: workflow.tableId,
      tableInfo: this.getTableInfo(workflow.tableName || workflow.tableId),
      sourcePartitionIds: this.resolveMergeSourcePartitionIds(metadata),
      mergedPartitionId: this.resolveMergeTargetPartitionId(metadata),
    });
    const siblingPartitionIds = new Set(freshSiblingIds);
    for (const partitionId of Array.isArray(plannedSiblingIds) ?
      plannedSiblingIds : []) {
      const normalizedPartitionId = String(partitionId || '');
      if (normalizedPartitionId) {
        siblingPartitionIds.add(normalizedPartitionId);
      }
    }
    return [...siblingPartitionIds];
  }

  /**
   * Resolve the durable workflow identifier for a new or retried merge.
   * @param {string} tableId
   * @param {string[]} sourcePartitionIds
   * @param {number} targetVersion
   * @param {Object|null} existingTransition
   * @return {string}
   * @private
   */
  resolveWorkflowId(
    tableId,
    sourcePartitionIds,
    targetVersion,
    existingTransition,
  ) {
    const persistedWorkflowId = String(
      existingTransition?.metadata?.[
        PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID
      ] || '',
    );
    return persistedWorkflowId ||
      `merge-${tableId}-` +
      `${sourcePartitionIds.join(MERGE_WORKFLOW_ID_SEPARATOR)}` +
      `-v${targetVersion}`;
  }
}

export {ManagedMergeWorkflowPlanMethods};
