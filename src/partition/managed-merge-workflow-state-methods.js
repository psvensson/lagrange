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
   * Re-sync the LIVE in-memory workflow from the durable transition row
   * after a same-owner fenced transition is CAS-rejected. A participant
   * acknowledgement flush can rewrite the row while an earlier durable
   * write is still in flight (the R1 held-cutover shape); the in-flight
   * write then lands on a stale witness, and the durable row — not the
   * in-memory record — is the post-race truth every later CAS witnesses
   * against. Only a durable row still owned by THIS owner at the same
   * fence is synced; a foreign claim is real contention, never a race,
   * and stays a hard stale fence.
   * @param {string} workflowId
   * @return {Object|null} The synced in-memory workflow, or null when the
   *   durable row is unavailable or belongs to another owner.
   * @private
   */
  syncLiveMergeWorkflowFromDurable(workflowId) {
    const existingWorkflow = this.workflowCoordinator.getWorkflowById(
      workflowId,
    );
    if (!existingWorkflow) {
      return null;
    }
    const durableTransition = this.findDurableMergeTransition(workflowId);
    if (!durableTransition) {
      return null;
    }
    const durableMetadata = durableTransition.transition.metadata;
    if (String(
      durableMetadata?.[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_OWNER_ID] ||
      '',
    ) !== this.workflowOwnerId) {
      return null;
    }
    const rebuiltWorkflow = this.rebuildWorkflowFromDurableTransition(
      workflowId,
      durableTransition,
    );
    if (this.isMergeWorkflowStateUnavailable(rebuiltWorkflow) ||
        rebuiltWorkflow.fenceToken !== existingWorkflow.fenceToken) {
      return null;
    }
    return rebuiltWorkflow;
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
   * Rebuild an in-memory workflow record from one durable transition row.
   * @param {string} workflowId
   * @param {{tableInfo: Object, transition: Object}} durableTransition
   * @return {Object|symbol}
   * @private
   */
  rebuildWorkflowFromDurableTransition(workflowId, durableTransition) {
    const {tableInfo, transition} = durableTransition;
    const sourcePartitionIds = this.resolveMergeSourcePartitionIds(
      transition.metadata,
    );
    if (sourcePartitionIds.length !== MERGE_SOURCE_PARTITION_COUNT) {
      return MANAGED_MERGE_WORKFLOW_STATE.UNAVAILABLE;
    }

    const durableMetadata = transition.metadata || {};
    const workflow = this.workflowCoordinator.createWorkflowRecord({
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
      // Restore the durable ownership claim triple: the fenced-transition
      // CAS witnesses against it, and a recovered/resynced record that
      // dropped it would diverge from the durable row on the next renew.
      fenceToken: Number.isInteger(
        durableMetadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_FENCE_TOKEN],
      ) ?
        durableMetadata[
          PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_FENCE_TOKEN
        ] :
        undefined,
      workflowOwnerId:
        durableMetadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_OWNER_ID],
      leaseExpiresAt: Number.isFinite(
        durableMetadata[
          PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_LEASE_EXPIRES_AT
        ],
      ) ?
        Number(durableMetadata[
          PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_LEASE_EXPIRES_AT
        ]) :
        undefined,
      createdAt: Number(resolveFirstDefinedValue(
        tableInfo, DURABLE_ROW_CREATED_AT_KEYS, this.now(),
      )),
      updatedAt: Number(resolveFirstDefinedValue(
        tableInfo, DURABLE_ROW_UPDATED_AT_KEYS, this.now(),
      )),
    });
    this.workflowCoordinator.setWorkflowState(workflow);
    if (workflow.step) {
      this.workflowCoordinator.markTransitionCommitted(
        workflow.workflowId,
        workflow.step,
      );
    }
    this.ensureCanonicalMergeParticipants(
      workflow.workflowId,
      workflow.metadata,
    );
    return workflow;
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
   * Ensure the canonical merge participants (two sources plus the merged
   * target) exist on the workflow snapshot.
   * @param {string} workflowId
   * @param {Object} transitionMetadata
   * @return {Object|null}
   * @private
   */
  ensureCanonicalMergeParticipants(workflowId, transitionMetadata = {}) {
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
    const sourcePartitionIds = this.resolveMergeSourcePartitionIds(
      transitionMetadata,
    );
    const targetPartitionId = this.resolveMergeTargetPartitionId(
      transitionMetadata,
    );

    const participantSpecs = sourcePartitionIds.map((partitionId) => ({
      participantKey: buildMergeSourceParticipantKey(partitionId),
      partitionId,
    }));
    if (targetPartitionId) {
      participantSpecs.push({
        participantKey: MERGE_PARTICIPANT_PREFIX.MERGED_TARGET,
        partitionId: targetPartitionId,
      });
    }

    for (const participantSpec of participantSpecs) {
      if (workflow.participants.has(participantSpec.participantKey)) {
        continue;
      }
      workflow.participants.set(participantSpec.participantKey, {
        workflowId,
        participantId: participantSpec.participantKey,
        participantKey: participantSpec.participantKey,
        partitionId: participantSpec.partitionId,
        status: null,
        // Seed the participant fence from the workflow claim epoch so a
        // source ack stamped with an older fence is rejected as
        // STALE_FENCE (mirrors the split owner).
        fenceToken: Number.isInteger(workflow.fenceToken) ?
          workflow.fenceToken :
          null,
        createdAt,
        updatedAt,
      });
    }
    return workflow;
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
