import {randomUUID} from 'node:crypto';

import {
  MANAGED_MERGE_ADMISSION_OPERATION_TYPE,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
import {
  WORKFLOW_DEFAULT_NODE_ID,
} from '../workflow/workflow-constants.js';
import {
  isRetryableManagedSplitTransition,
} from './managed-split-retry-policy.js';
import {
  MERGE_PARTICIPANT_PREFIX,
  buildMergeSourceParticipantKey,
} from './merge-ack-constants.js';
import {durableOwnershipClaimOf} from './managed-workflow-ownership-core.js';
import {storedTransitionOf} from './managed-workflow-record-store.js';
import {registrationInputsRefusalOf} from
  './managed-workflow-registration-inputs.js';

/**
 * Build the durable ownership identity for a merge coordinator process:
 * nodeId + a per-process boot nonce so a restarted same-node process
 * can never tie on ownerId; the fence token carries the epoch (mirrors
 * the schema-provisioning owner).
 * @param {Object} options - Constructor options.
 * @param {string|undefined} nodeId - Local node identity.
 * @return {string}
 */
function buildMergeWorkflowOwnerId(options, nodeId) {
  return options.workflowOwnerId ||
    String(nodeId || WORKFLOW_DEFAULT_NODE_ID) +
      `-merge-${randomUUID()}`;
}

const MERGE_SOURCE_PARTITION_COUNT = 2;
const MERGE_OWNER_KEY_SEPARATOR = '+';
const DURABLE_ROW_TABLE_ID_KEYS = Object.freeze(['table_id', 'tableId']);
const DURABLE_ROW_TABLE_NAME_KEYS = Object.freeze([
  'table_name', 'tableName',
]);
const DURABLE_ROW_CREATED_AT_KEYS = Object.freeze([
  'created_at', 'createdAt', 'updated_at', 'updatedAt',
]);
const DURABLE_ROW_UPDATED_AT_KEYS = Object.freeze([
  'updated_at', 'updatedAt', 'created_at', 'createdAt',
]);
const MANAGED_MERGE_WORKFLOW_STATE = Object.freeze({
  UNAVAILABLE: Symbol('managed_merge_workflow_unavailable'),
});

/**
 * Resolve the first defined, non-null value among the listed keys.
 * @param {Object|null} record
 * @param {ReadonlyArray<string>} keys
 * @param {*} fallbackValue
 * @return {*}
 */
function resolveFirstDefinedValue(record, keys, fallbackValue) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return fallbackValue;
}

/**
 * Merge-specific workflow state methods: pending metadata construction,
 * canonical participant materialization, and durable-row recovery.
 *
 * Generic helpers shared with the split workflow (participant restore,
 * admission compaction, retry scheduling, node-list normalization) are
 * borrowed from the split method classes in managed-merge-workflow.js
 * instead of being redeclared here.
 */
class ManagedMergeWorkflowStateMethods {
  /**
   * Build the initial merge transition metadata persisted before admission.
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
      [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_IDS]:
        [...options.sourcePartitionIds],
      [PARTITION_TRANSITION_METADATA_FIELD.SIBLING_PARTITION_IDS]:
        [...(options.siblingPartitionIds || [])],
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]:
        [options.targetPartitionId],
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PROVISIONING]:
        {...(options.targetProvisioning || {})},
      [PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT]:
        JSON.parse(JSON.stringify({
          ...options.topologySnapshot,
          // The source partitions' key ranges at registration, persisted
          // so the durable transition row alone proves which key ranges
          // this in-flight merge covers (F23 overlap guard).
          ...(options.leftRange && options.rightRange ?
            {
              sourcePartitionKeyRanges: {
                [options.sourcePartitionIds[0]]: {...options.leftRange},
                [options.sourcePartitionIds[1]]: {...options.rightRange},
              },
            } :
            {}),
        })),
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]:
        options.targetVersion,
      [PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]: {
        state: PARTITION_TRANSITION_STATE.ADMISSION_PENDING,
        operationType: MANAGED_MERGE_ADMISSION_OPERATION_TYPE,
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
   * Resolve the two source partition ids from merge transition metadata.
   * @param {Object} metadata
   * @return {string[]}
   * @private
   */
  resolveMergeSourcePartitionIds(metadata) {
    const sourcePartitionIds =
      metadata?.[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_IDS];
    if (!Array.isArray(sourcePartitionIds)) {
      return [];
    }
    return sourcePartitionIds.map((partitionId) =>
      String(partitionId || '')).filter((partitionId) => partitionId);
  }

  /**
   * The registration's partitions-row inputs re-validated at its change's
   * turn against the compared record (managed-workflow-registration-inputs).
   * @param {Object} registration
   * @param {Object|null} storedRow - The compared `tables` row.
   * @return {string|null} The input that moved, or null.
   * @private
   */
  registrationInputsRefusal(registration, storedRow) {
    const metadata = registration.metadata || {};
    const sourcePartitionIds = this.resolveMergeSourcePartitionIds(metadata);
    return registrationInputsRefusalOf(this, {registration, storedRow,
      sourceIds: sourcePartitionIds,
      deriveSiblings: (tableInfo) => this.resolveMergeSiblingPartitionIds({
        tableId: registration.tableId, tableInfo, sourcePartitionIds,
        mergedPartitionId: this.resolveMergeTargetPartitionId(metadata)})});
  }

  /**
   * Resolve the merged target partition id from merge transition metadata.
   * @param {Object} metadata
   * @return {string|null}
   * @private
   */
  resolveMergeTargetPartitionId(metadata) {
    const targetPartitionIds =
      metadata?.[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS];
    if (!Array.isArray(targetPartitionIds) || targetPartitionIds.length < 1) {
      return null;
    }
    return String(targetPartitionIds[0] || '') || null;
  }

  /**
   * Resolve one workflow from memory or recover it from the durable
   * transition row when async source-side execution resumes after
   * execute() returns.
   * @param {string} workflowId
   * @return {Object|symbol}
   * @private
   */
  resolveWorkflowState(workflowId) {
    const normalizedWorkflowId = String(workflowId || '');
    if (!normalizedWorkflowId) {
      return MANAGED_MERGE_WORKFLOW_STATE.UNAVAILABLE;
    }
    const existingWorkflow =
      this.workflowCoordinator.getWorkflowById(normalizedWorkflowId);
    if (existingWorkflow) {
      return existingWorkflow;
    }
    return this.recoverWorkflowState(normalizedWorkflowId);
  }

  /**
   * Recover one merge workflow snapshot from the canonical tables
   * transition row.
   * @param {string} workflowId
   * @return {Object|symbol}
   * @private
   */
  recoverWorkflowState(workflowId) {
    const durableTransition = this.findDurableMergeTransition(workflowId);
    if (!durableTransition) {
      return MANAGED_MERGE_WORKFLOW_STATE.UNAVAILABLE;
    }
    return this.rebuildWorkflowFromDurableTransition(
      workflowId,
      durableTransition,
    );
  }

  /**
   * Locate the durable tables transition row carrying one workflow id.
   * @param {string} workflowId
   * @return {{tableInfo: Object, transition: Object}|null}
   * @private
   */
  findDurableMergeTransition(workflowId) {
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
      if (persistedWorkflowId === workflowId) {
        return {tableInfo, transition};
      }
    }
    return null;
  }

  /**
   * Rebuild an in-memory workflow record from one durable transition row (a
   * projection of the record as read).
   * @param {string} workflowId
   * @param {{tableInfo: Object, transition: Object}} durableTransition
   * @return {Object|symbol}
   * @private
   */
  rebuildWorkflowFromDurableTransition(workflowId, durableTransition) {
    const decoded = this.decodeWorkflowRecord(workflowId,
      durableTransition.tableInfo);
    if (!decoded) {
      return MANAGED_MERGE_WORKFLOW_STATE.UNAVAILABLE;
    }
    const workflow = this.workflowCoordinator.adoptWorkflowProjection(decoded);
    if (workflow.step) {
      this.workflowCoordinator.markTransitionCommitted(
        workflow.workflowId,
        workflow.step,
      );
    }
    return workflow;
  }

  /**
   * Decode one `tables` row into the merge workflow it holds (state,
   * metadata, participants with the canonical ones materialized, ownership
   * claim triple), or null when it holds no merge of `workflowId`. Pure: the
   * record store's decoder (managed-workflow-record-store.js).
   * @param {string} workflowId
   * @param {Object} tableInfo
   * @return {Object|null}
   * @private
   */
  decodeWorkflowRecord(workflowId, tableInfo) {
    const transition = storedTransitionOf(tableInfo);
    if (!transition?.metadata || String(transition.metadata[
      PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] || '') !==
        String(workflowId)) {
      return null;
    }
    const sourcePartitionIds = this.resolveMergeSourcePartitionIds(
      transition.metadata,
    );
    if (sourcePartitionIds.length !== MERGE_SOURCE_PARTITION_COUNT) {
      return null;
    }
    return this.withCanonicalMergeParticipants({
      workflowId,
      ownerKey: this.buildMergeOwnerKey(sourcePartitionIds),
      tableId: resolveFirstDefinedValue(
        tableInfo, DURABLE_ROW_TABLE_ID_KEYS, null,
      ),
      tableName: resolveFirstDefinedValue(
        tableInfo, DURABLE_ROW_TABLE_NAME_KEYS, null,
      ),
      partitionId: sourcePartitionIds[0],
      step: transition.state,
      status: transition.state,
      metadata: this.cloneTransitionValue(transition.metadata),
      participants: this.restoreParticipantsFromMetadata(
        workflowId,
        transition.metadata,
      ),
      // The durable ownership claim triple.
      ...durableOwnershipClaimOf(transition.metadata),
      createdAt: Number(resolveFirstDefinedValue(
        tableInfo, DURABLE_ROW_CREATED_AT_KEYS, this.now(),
      )),
      updatedAt: Number(resolveFirstDefinedValue(
        tableInfo, DURABLE_ROW_UPDATED_AT_KEYS, this.now(),
      )),
    });
  }

  /**
   * Test the explicit unavailable variant returned by workflow recovery.
   * @param {Object|symbol} workflow
   * @return {boolean}
   * @private
   */
  isMergeWorkflowStateUnavailable(workflow) {
    return workflow === MANAGED_MERGE_WORKFLOW_STATE.UNAVAILABLE;
  }

  /**
   * The workflow with its canonical merge participants (two sources plus
   * the merged target its metadata names) materialized when missing; the
   * others untouched. Pure.
   * @param {Object} workflow
   * @return {Object} A new workflow object.
   * @private
   */
  withCanonicalMergeParticipants(workflow) {
    const transitionMetadata = workflow.metadata || {};
    const participants = workflow.participants instanceof Map ?
      new Map(workflow.participants) : new Map();
    const targetPartitionId = this.resolveMergeTargetPartitionId(
      transitionMetadata,
    );
    const participantSpecs = this.resolveMergeSourcePartitionIds(
      transitionMetadata).map((partitionId) => ({
      participantKey: buildMergeSourceParticipantKey(partitionId),
      partitionId,
    }));
    if (targetPartitionId) {
      participantSpecs.push({
        participantKey: MERGE_PARTICIPANT_PREFIX.MERGED_TARGET,
        partitionId: targetPartitionId,
      });
    }
    for (const spec of participantSpecs) {
      if (!participants.has(spec.participantKey)) {
        // The split owner's canonical participant (fence seeded from the
        // claim epoch).
        participants.set(spec.participantKey,
          this.canonicalParticipantOf(workflow, spec));
      }
    }
    return {...workflow, participants};
  }

  /**
   * Resolve whether every merge source participant currently carries one
   * of the given statuses.
   * @param {Object} workflow
   * @param {ReadonlySet<string>} statusSet
   * @return {boolean}
   * @private
   */
  areAllMergeSourcesAtStatus(workflow, statusSet) {
    const sourcePartitionIds = this.resolveMergeSourcePartitionIds(
      workflow?.metadata || {},
    );
    if (sourcePartitionIds.length !== MERGE_SOURCE_PARTITION_COUNT ||
        !(workflow?.participants instanceof Map)) {
      return false;
    }
    return sourcePartitionIds.every((partitionId) => {
      const participant = workflow.participants.get(
        buildMergeSourceParticipantKey(partitionId),
      );
      return statusSet.has(String(participant?.status || ''));
    });
  }

  /**
   * Build the single-flight owner key for one merge candidate pair.
   * @param {string[]} sourcePartitionIds
   * @return {string}
   * @private
   */
  buildMergeOwnerKey(sourcePartitionIds) {
    return (Array.isArray(sourcePartitionIds) ? sourcePartitionIds : [])
      .map((partitionId) => String(partitionId || ''))
      .join(MERGE_OWNER_KEY_SEPARATOR);
  }

  /**
   * Resolve whether an existing transition may be retried through admission.
   * Reuses the split retry classification (message- and state-based, not
   * split-specific).
   * @param {Object|string} transitionOrState
   * @return {boolean}
   * @private
   */
  isRetryableAdmissionState(transitionOrState) {
    if (transitionOrState && typeof transitionOrState === 'object') {
      return isRetryableManagedSplitTransition(transitionOrState);
    }
    return isRetryableManagedSplitTransition({
      state: String(transitionOrState || ''),
    });
  }
}

export {buildMergeWorkflowOwnerId, ManagedMergeWorkflowStateMethods};
