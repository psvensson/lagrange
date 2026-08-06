import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {TIMEOUT_BUDGET_DEFAULT} from '../control-plane/timeout-budget.js';
import {DurableWorkflowCoordinator} from '../workflow/durable-workflow-coordinator.js';
import {OperationLane} from '../workflow/operation-lane.js';
import {TimeoutPolicy} from '../workflow/timeout-policy.js';
import {WorkflowStepRunner} from '../workflow/workflow-step-runner.js';
import {
  PARTICIPANT_ACK_FIELD,
} from '../workflow/workflow-constants.js';

import {
  MANAGED_MERGE_ERROR_MSG,
  MANAGED_MERGE_LOG_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
import {
  MERGE_ACK_STATUS,
  MERGE_PARTICIPANT_PREFIX,
} from './merge-ack-constants.js';
import {
  ManagedSplitWorkflowStateMethods,
} from './managed-split-workflow-state-methods.js';
import {
  ManagedSplitWorkflowProvisioningMethods,
} from './managed-split-workflow-provisioning-methods.js';
import {
  buildMergeWorkflowOwnerId,
  ManagedMergeWorkflowStateMethods,
} from './managed-merge-workflow-state-methods.js';
import {
  ManagedMergeWorkflowPersistenceMethods,
} from './managed-merge-workflow-persistence-methods.js';
import {
  ManagedMergeWorkflowExecutionGateMethods,
} from './managed-merge-workflow-execution-gate-methods.js';
import {
  ManagedMergeWorkflowDissolutionMethods,
} from './managed-merge-workflow-dissolution-methods.js';
import {
  ManagedMergeWorkflowPlanMethods,
} from './managed-merge-workflow-plan-methods.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_CONSTRUCTOR = 'constructor';
const LOCAL_STR_MANAGED_MERGE = 'managed_merge';
const LOCAL_STR_MANAGED_MERGE_WORKFLOW = 'managed-merge-workflow';
const LOCAL_STR_GETCDCINTEGRATIONSERVICE = 'getCDCIntegrationService';

const ACTIVE_PARTITION_STATE = 'NORMAL';
const DEFAULT_QUORUM_REPLICA_COUNT = 1;
const DEFAULT_RETRY_BASE_DELAY_MS = 5000;
const DEFAULT_RETRY_MAX_DELAY_MS = 60000;
// Durable ownership lease for merge workflow claims (same rationale as
// the split owner: covers an idle ack gap during backfill, stolen
// promptly after lease expiry, renewed on every owner-lane step).
const DEFAULT_WORKFLOW_LEASE_MS = 60000;
const MERGE_BOOTSTRAP_ROUTING_READINESS_DIMENSION =
  CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;

/**
 * Topology-adapter method bindings resolved in constructor order:
 * bound adapter method, then explicit option, then the listed fallback.
 */
const TOPOLOGY_BOUND_METHOD_SPECS = Object.freeze([
  {property: 'getPartitionInfo', fallback: () => null},
  {property: 'getTableInfo', fallback: () => null},
  {property: 'listTableInfos', fallback: () => []},
  {property: 'parsePartitionTransition', fallback: () => null},
  {property: 'isLocalManagedMergeLeader', fallback: () => false},
  {property: 'resolveActivePartitionVersion', fallback: () => 1},
  {property: 'resolveProvisionTargetNodeIds', fallback: () => []},
  {property: 'getRoutablePartitionServiceNodeIds', fallback: () => []},
  {property: 'isSystemTablePartitionId', fallback: () => false},
  {
    property: 'calculateQuorumReplicaCount',
    fallback: () => DEFAULT_QUORUM_REPLICA_COUNT,
  },
  {property: 'createExecutionTimeoutBudget', fallback: null},
  {property: 'waitForTablePartitionMetadata', fallback: async () => {}},
  {property: 'probeInitialTablePartitionProvisioning', fallback: null},
  {property: 'provisionInitialTablePartition', fallback: async () => {}},
  {property: 'startMergeReplicationOnSourcePartition',
    fallback: async () => {}},
  {property: 'listTablePartitionRows', fallback: () => []},
  {property: 'listPartitionServiceRows', fallback: () => []},
  {property: 'deliverReplicaRemoval', fallback: async () => null},
]);

/**
 * Plain option fields resolved in constructor order. Each resolver owns
 * its fallback chain so the constructor stays a single decision table.
 */
const OPTION_FIELD_RESOLVERS = Object.freeze([
  ['storageAdmissionService', (options, workflow) =>
    options.storageAdmissionService ||
    workflow.topologyAdapter?.storageAdmissionService || null],
  ['captureTopologySnapshot', (options) =>
    options.captureTopologySnapshot || null],
  ['messageRouter', (options, workflow) =>
    options.messageRouter || workflow.topologyAdapter?.messageRouter || null],
  ['pressureGovernor', (options) => options.pressureGovernor || null],
  ['logger', (options, workflow) =>
    options.logger || workflow.topologyAdapter?.logger || console],
  ['now', (options) => options.now || (() => Date.now())],
  ['retryBaseDelayMs', (options) => resolvePositiveInteger(
    options.retryBaseDelayMs, DEFAULT_RETRY_BASE_DELAY_MS,
  )],
  ['retryMaxDelayMs', (options) => resolvePositiveInteger(
    options.retryMaxDelayMs, DEFAULT_RETRY_MAX_DELAY_MS,
  )],
  ['transactionCoordinator', (options, workflow) =>
    options.transactionCoordinator ||
    workflow.topologyAdapter?.transactionCoordinator || null],
]);

function resolvePositiveInteger(value, fallback) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/**
 * Generic helpers reused verbatim from the split workflow method classes.
 * These are shape-neutral (retry scheduling, node-list normalization,
 * participant serialization, admission compaction) — the merge workflow
 * borrows them instead of duplicating the logic.
 */
const REUSED_SPLIT_STATE_METHOD_NAMES = Object.freeze([
  'persistWorkflowParticipantState',
  'restoreParticipantsFromMetadata',
  'cloneTransitionValue',
  'compactAdmissionResult',
  'compactIneligibleNodes',
  'probeChildProvisioningAdmissions',
  'compactChildProvisioningRejectedTargetNodePlans',
  'resolveChildProvisioningDecisionType',
]);
const REUSED_SPLIT_PROVISIONING_METHOD_NAMES = Object.freeze([
  'serializeParticipantsForMetadata',
  'resolvePartitionKeyRange',
  'resolveAdmissionCandidateTargetNodeIds',
  'resolveAdmissionDeniedState',
  'resolvePendingRetryMetadata',
  'resolveScheduledRetry',
  'buildScheduledRetryMetadata',
  'resolveTopologySnapshot',
  'normalizeNodeIdList',
  'planChildProvisioningTargetNodeIds',
  'resolveChildProvisioningAnchorNodeId',
]);

function bindTopologyMethod(topologyAdapter, methodName) {
  if (!topologyAdapter ||
      typeof topologyAdapter[methodName] !== LOCAL_STR_FUNCTION) {
    return null;
  }
  return topologyAdapter[methodName].bind(topologyAdapter);
}

/**
 * First-class managed merge workflow owner.
 *
 * Mirrors ManagedSplitWorkflow in the merge direction: two adjacent
 * under-threshold source partitions drain into one provisioned target via
 * per-source CDC mirror fan-in; a durable epoch cutover collapses the two
 * key ranges in the authoritative topology; the retired source raft groups
 * are dissolved through the existing replica-removal teardown.
 */
class ManagedMergeWorkflow {
  /**
   * @param {Object} options - Workflow options.
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this.topologyAdapter = options.topologyAdapter || null;
    this.getCDCIntegrationService =
      bindTopologyMethod(
        this.topologyAdapter, LOCAL_STR_GETCDCINTEGRATIONSERVICE,
      ) ||
      options.getCDCIntegrationService ||
      (() => options.cdcIntegrationService || null);
    for (const methodSpec of TOPOLOGY_BOUND_METHOD_SPECS) {
      this[methodSpec.property] =
        bindTopologyMethod(this.topologyAdapter, methodSpec.property) ||
        options[methodSpec.property] ||
        methodSpec.fallback;
    }
    for (const [property, resolveField] of OPTION_FIELD_RESOLVERS) {
      this[property] = resolveField(options, this);
    }
    this.mergeStorageThresholdBytes = resolvePositiveInteger(
      options.mergeStorageThresholdBytes,
      this.resolveConfiguredMergeStorageThresholdBytes(),
    );
    this.initializeMergeCollaborators(options);
  }

  /**
   * Initialize the durable coordination collaborators (workflow
   * coordinator, timeout policy, single-flight lane, step runner).
   * @param {Object} options - Workflow options.
   * @private
   */
  initializeMergeCollaborators(options) {
    // Durable ownership identity (nodeId + boot nonce; see
    // buildMergeWorkflowOwnerId).
    this.workflowOwnerId = buildMergeWorkflowOwnerId(options, this.nodeId);
    this.workflowLeaseMs = Number.isFinite(options.workflowLeaseMs) &&
      options.workflowLeaseMs > 0 ?
      Math.floor(options.workflowLeaseMs) :
      DEFAULT_WORKFLOW_LEASE_MS;
    this.workflowCoordinator = options.workflowCoordinator ||
      new DurableWorkflowCoordinator({
        persistWorkflow: async (workflow) =>
          this.persistWorkflowTransition(workflow),
        persistWorkflowClaim: async (workflow, context) =>
          this.persistMergeWorkflowClaim(workflow, context),
        persistWorkflowTransition: async (workflow, context) =>
          this.persistMergeWorkflowTransitionFence(workflow, context),
        persistParticipant: async (participant) =>
          this.persistWorkflowParticipantState(participant),
        isParticipantTransitionAllowed: (participantKey, from, to) =>
          this.isMergeParticipantTransitionAllowed(participantKey, from, to),
        now: this.now,
      });
    this.executionTimeoutPolicy = options.executionTimeoutPolicy ||
      new TimeoutPolicy({
        operationName: LOCAL_STR_MANAGED_MERGE,
        configuredBudgetMs: TIMEOUT_BUDGET_DEFAULT.SPLIT_OPERATION_BUDGET_MS,
        now: this.now,
      });
    this.mergeOperationLane = options.mergeOperationLane ||
      new OperationLane({
        name: LOCAL_STR_MANAGED_MERGE_WORKFLOW,
        workflowCoordinator: this.workflowCoordinator,
        ownerKeyFactory: ({partitionId, ownerKey}) =>
          String(ownerKey || partitionId || ''),
      });
    this.workflowStepRunner = options.workflowStepRunner ||
      new WorkflowStepRunner({
        workflowCoordinator: this.workflowCoordinator,
        operationLane: this.mergeOperationLane,
        timeoutPolicy: this.executionTimeoutPolicy,
        now: this.now,
      });
    this.mergeOwnerLaneTailByOwnerKey = new Map();
  }

  /**
   * Execute one managed partition merge.
   * @param {Object} candidate - {leftPartitionId, rightPartitionId}.
   * @param {Object} [executionOptions={}] - Optional admission metadata.
   * @return {Promise<Object>} Merge orchestration result.
   */
  execute(candidate = {}, executionOptions = {}) {
    const leftPartitionId = String(
      candidate.leftPartitionId || candidate.leftId || '',
    );
    const rightPartitionId = String(
      candidate.rightPartitionId || candidate.rightId || '',
    );
    if (!leftPartitionId || !rightPartitionId ||
        leftPartitionId === rightPartitionId) {
      throw new Error(MANAGED_MERGE_ERROR_MSG.SOURCE_PARTITIONS_REQUIRED);
    }

    const sourcePartitionIds = [leftPartitionId, rightPartitionId];
    const ownerKey = this.buildMergeOwnerKey(sourcePartitionIds);
    return this.mergeOperationLane.run(
      {partitionId: leftPartitionId, ownerKey, ...executionOptions},
      async (laneExecution) => this.executeInternal(sourcePartitionIds, {
        ...executionOptions,
        timeoutBudget:
          laneExecution?.timeoutBudget ||
          executionOptions.timeoutBudget ||
          null,
      }),
    );
  }

  /**
   * Execute one managed merge after single-flight admission.
   * @param {string[]} sourcePartitionIds
   * @param {Object} executionContext
   * @return {Promise<Object>} Merge orchestration result.
   * @private
   */
  async executeInternal(sourcePartitionIds, executionContext = {}) {
    const context = this.resolveMergeExecutionContext(sourcePartitionIds);
    const {
      leftInfo,
      rightInfo,
      leftRange,
      rightRange,
      tableInfo,
      tableId,
      tableName,
      primaryKeyColumn,
      existingTransition,
    } = context;

    const estimatedBytes = this.estimateMergedBytes(leftInfo, rightInfo);
    this.assertUnderMergeThreshold(estimatedBytes);

    const replicaCount = resolvePositiveInteger(
      leftInfo.replica_count,
      DEFAULT_QUORUM_REPLICA_COUNT,
    );
    const mergeBootstrapReplicaCount =
      this.calculateQuorumReplicaCount(replicaCount);
    const sourceRoutableNodeIds = this.normalizeNodeIdList([
      ...this.getRoutablePartitionServiceNodeIds(sourcePartitionIds[0]),
      ...this.getRoutablePartitionServiceNodeIds(sourcePartitionIds[1]),
    ]);
    const discoveredTargetNodeIds = this.resolveProvisionTargetNodeIds(
      Number.MAX_SAFE_INTEGER,
    );
    const candidateTargetNodeIds = this.resolveAdmissionCandidateTargetNodeIds(
      discoveredTargetNodeIds,
      sourceRoutableNodeIds,
      mergeBootstrapReplicaCount,
    );
    const targetVersion = this.resolveTargetPartitionVersion(
      tableInfo,
      existingTransition,
    );
    const mergedPartitionId = this.resolveMergedPartitionId(
      tableId,
      existingTransition,
    );
    const workflowId = this.resolveWorkflowId(
      tableId,
      sourcePartitionIds,
      targetVersion,
      existingTransition,
    );
    const siblingPartitionIds = this.resolveMergeSiblingPartitionIds({
      tableId,
      tableInfo,
      sourcePartitionIds,
      mergedPartitionId,
    });
    const retryMetadata = this.resolvePendingRetryMetadata(existingTransition);
    const scheduledRetry = this.resolveScheduledRetry(existingTransition);
    const scheduledRetryOutcome = await this.resolveMergeExecutionGateOutcome({
      sourcePartitionIds,
      tableId,
      tableName,
      workflowId,
      targetVersion,
      existingTransition,
      scheduledRetry,
    });
    if (scheduledRetryOutcome.blocked === true) {
      return scheduledRetryOutcome.result;
    }
    const pressureDecision = this.evaluatePressure(executionContext);
    const pressureGateOutcome = await this.resolveMergeExecutionGateOutcome({
      sourcePartitionIds,
      tableId,
      tableName,
      workflowId,
      targetVersion,
      retryMetadata,
      pressureDecision,
    });
    if (pressureGateOutcome.blocked === true) {
      return pressureGateOutcome.result;
    }

    this.logger.info(MANAGED_MERGE_LOG_MSG.MERGE_START, {
      sourcePartitionIds,
      tableId,
      tableName,
      mergedPartitionId,
      targetVersion,
    });
    const now = this.now();
    const executionTimeoutBudget =
      this.resolveMergeExecutionTimeoutBudget(executionContext);
    const topologySnapshot = await this.resolveTopologySnapshot({
      tableId,
      tableName,
      tableInfo,
      partitionId: sourcePartitionIds[0],
      partitionInfo: leftInfo,
      targetVersion,
      requiredReplicaCount: mergeBootstrapReplicaCount,
      sourceRoutableNodeIds,
      discoveredTargetNodeIds,
      candidateTargetNodeIds,
      retryMetadata,
    });
    // The workflow-mutating phase runs as ONE FIFO owner-lane slot: the
    // FIFO is the single serialization owner for every durable mutation
    // of this workflow (phase advances, the fail-safe abort, and this
    // execution), so a fire-and-forget abort enqueued around a retry can
    // never interleave with — or be swallowed by — the retry's writes.
    // The coalescing mergeOperationLane wrapping execute() remains solely
    // the cross-caller dedup for concurrent execute() invocations.
    return this.runSerializedOwnerStep(
      this.buildMergeOwnerKey(sourcePartitionIds),
      () => this.runRegisteredMergeExecution({
        workflowId,
        sourcePartitionIds,
        siblingPartitionIds,
        mergedPartitionId,
        tableId,
        tableName,
        tableInfo,
        primaryKeyColumn,
        leftInfo,
        leftRange,
        rightRange,
        replicaCount,
        mergeBootstrapReplicaCount,
        candidateTargetNodeIds,
        sourceRoutableNodeIds,
        estimatedBytes,
        targetVersion,
        retryMetadata,
        executionTimeoutBudget,
        topologySnapshot,
        now,
      }),
    );
  }

  /**
   * Register the durable workflow and run the admitted execution. Runs
   * inside one FIFO owner-lane slot (see executeInternal).
   * @param {Object} input
   * @return {Promise<Object>} Merge orchestration result.
   * @private
   */
  async runRegisteredMergeExecution(input) {
    const {workflowId, sourcePartitionIds, tableId, tableName} = input;
    const workflow = await this.workflowCoordinator.registerWorkflow({
      workflowId,
      ownerKey: this.buildMergeOwnerKey(sourcePartitionIds),
      tableId,
      tableName,
      partitionId: sourcePartitionIds[0],
      status: PARTITION_TRANSITION_STATE.ADMISSION_PENDING,
      metadata: this.buildPendingTransitionMetadata({
        workflowId,
        sourcePartitionIds,
        siblingPartitionIds: input.siblingPartitionIds,
        targetPartitionId: input.mergedPartitionId,
        primaryKeyColumn: input.primaryKeyColumn,
        targetVersion: input.targetVersion,
        requiredReplicaCount: input.mergeBootstrapReplicaCount,
        minimumRoutableSourceCount: input.mergeBootstrapReplicaCount,
        isCriticalSystemPartition: false,
        candidateTargetNodeIds: input.candidateTargetNodeIds,
        sourceRoutableNodeIds: input.sourceRoutableNodeIds,
        topologySnapshot: input.topologySnapshot,
        retryMetadata: input.retryMetadata,
        estimatedBytes: input.estimatedBytes,
      }),
      createdAt: input.now,
      updatedAt: input.now,
    });

    // Durable ownership claim (new fence epoch, mirrors the split
    // owner): exactly one node holds the live lease for this workflow;
    // a refused claim is a typed outcome.
    const ownershipRefusal = await this.claimMergeWorkflowAtStart(
      workflowId,
      sourcePartitionIds,
    );
    if (ownershipRefusal) {
      return ownershipRefusal;
    }

    try {
      return await this.runAdmittedMergeExecution({
        workflow,
        workflowId,
        sourcePartitionIds,
        mergedPartitionId: input.mergedPartitionId,
        tableId,
        tableName,
        tableInfo: input.tableInfo,
        primaryKeyColumn: input.primaryKeyColumn,
        leftInfo: input.leftInfo,
        leftRange: input.leftRange,
        rightRange: input.rightRange,
        replicaCount: input.replicaCount,
        mergeBootstrapReplicaCount: input.mergeBootstrapReplicaCount,
        candidateTargetNodeIds: input.candidateTargetNodeIds,
        sourceRoutableNodeIds: input.sourceRoutableNodeIds,
        estimatedBytes: input.estimatedBytes,
        targetVersion: input.targetVersion,
        retryMetadata: input.retryMetadata,
        executionTimeoutBudget: input.executionTimeoutBudget,
        topologySnapshot: input.topologySnapshot,
      });
    } catch (error) {
      const activeWorkflow = this.workflowCoordinator.getWorkflowById(
        workflowId,
      );
      const deferredExecution =
        await this.handleRetryablePostAdmissionExecutionFailure({
          workflowId,
          sourcePartitionIds,
          tableId,
          tableName,
          targetVersion: input.targetVersion,
          retryMetadata: input.retryMetadata,
          admission:
            activeWorkflow?.metadata?.[
              PARTITION_TRANSITION_METADATA_FIELD.ADMISSION
            ] || null,
          error,
        });
      if (this.isManagedMergeDeferredExecutionOutcome(deferredExecution)) {
        return deferredExecution;
      }
      await this.persistExecutionFailure(workflowId, error);
      throw error;
    } finally {
      this.workflowCoordinator.removeWorkflow(workflow.workflowId);
    }
  }

  /**
   * Resolve the merge execution timeout budget from the lane execution,
   * the adapter factory, or the workflow's own timeout policy.
   * @param {Object} executionContext
   * @return {Object}
   * @private
   */
  resolveMergeExecutionTimeoutBudget(executionContext) {
    return executionContext.timeoutBudget ||
      (typeof this.createExecutionTimeoutBudget === LOCAL_STR_FUNCTION ?
        this.createExecutionTimeoutBudget() :
        this.executionTimeoutPolicy.createTopLevelBudget({
          configuredBudgetMs:
            TIMEOUT_BUDGET_DEFAULT.SPLIT_OPERATION_BUDGET_MS,
        }));
  }

  /**
   * Plan the merged-target provisioning cohort and probe its per-node
   * admission before any durable metadata insert.
   * @param {Object} input
   * @param {Object} compactAdmission
   * @return {Promise<{targetNodeIdsByPartitionId: Object,
   *   targetProvisioningAdmission: Object|null}>}
   * @private
   */
  async planMergeTargetProvisioning(input, compactAdmission) {
    const targetNodeIdsByPartitionId =
      this.planChildProvisioningTargetNodeIds({
        childPartitionIds: [input.mergedPartitionId],
        eligibleNodeIds: compactAdmission.eligibleNodeIds,
        candidateTargetNodeIds: input.candidateTargetNodeIds,
        sourceRoutableNodeIds: input.sourceRoutableNodeIds,
        replicaCount: input.replicaCount,
        preferredAnchorNodeId:
          input.leftInfo.leader_node_id ||
          input.leftInfo.leaderNodeId ||
          this.nodeId,
      });
    const provisioningAdmissionByPartitionId =
      await this.probeChildProvisioningAdmissions({
        childProvisioningTargetNodeIdsByPartitionId:
          targetNodeIdsByPartitionId,
        minimumRoutableReplicaCount: input.mergeBootstrapReplicaCount,
      });
    const targetProvisioningAdmission =
      provisioningAdmissionByPartitionId[input.mergedPartitionId] || null;
    if (targetProvisioningAdmission &&
        targetProvisioningAdmission.allowed !== true) {
      throw new Error(
        MANAGED_MERGE_ERROR_MSG.TARGET_PROVISIONING_NOT_VIABLE,
      );
    }
    return {targetNodeIdsByPartitionId, targetProvisioningAdmission};
  }

  /**
   * Evaluate target capacity admission for the merged partition.
   *
   * Deliberately REUSES storageAdmissionService.checkSplit: its capacity
   * math (can the candidate node cohort absorb estimatedBytes with the
   * required replica count) is operation-agnostic and the admission owner
   * exposes no separate checkMerge surface. The durable admission
   * metadata carries the merge-specific operation label
   * (MANAGED_MERGE_ADMISSION_OPERATION_TYPE), not the split one.
   * @param {Object} input
   * @return {Promise<Object>} Admission result.
   * @private
   */
  async evaluateMergeCapacityAdmission(input) {
    if (!this.storageAdmissionService ||
        typeof this.storageAdmissionService.checkSplit !==
          LOCAL_STR_FUNCTION) {
      throw new Error(MANAGED_MERGE_ERROR_MSG.ADMISSION_OWNER_REQUIRED);
    }
    return this.storageAdmissionService.checkSplit({
      targetNodeIds: input.candidateTargetNodeIds,
      estimatedBytes: input.estimatedBytes,
      requiredReplicaCount: input.mergeBootstrapReplicaCount,
      minimumRoutableSourceCount: input.mergeBootstrapReplicaCount,
      sourceRoutableNodeIds: input.sourceRoutableNodeIds,
    });
  }

  /**
   * Run the post-registration merge execution: capacity admission, target
   * provisioning, and source replication start.
   * @param {Object} input
   * @return {Promise<Object>}
   * @private
   */
  async runAdmittedMergeExecution(input) {
    const admissionResult =
      await this.evaluateMergeCapacityAdmission(input);
    const compactAdmission = this.compactAdmissionResult(
      admissionResult,
      {
        discoveredTargetNodeIds: input.candidateTargetNodeIds,
        candidateTargetNodeIds: input.candidateTargetNodeIds,
        minimumRoutableSourceCount: input.mergeBootstrapReplicaCount,
        estimatedBytes: input.estimatedBytes,
        sourceRoutableNodeIds: input.sourceRoutableNodeIds,
        isCriticalSystemPartition: false,
      },
    );
    const admissionGateOutcome = await this.resolveMergeExecutionGateOutcome({
      sourcePartitionIds: input.sourcePartitionIds,
      tableId: input.tableId,
      tableName: input.tableName,
      workflowId: input.workflowId,
      targetVersion: input.targetVersion,
      retryMetadata: input.retryMetadata,
      admissionResult,
      compactAdmission,
      workflowMetadata: input.workflow.metadata,
    });
    if (admissionGateOutcome.blocked === true) {
      return admissionGateOutcome.result;
    }

    const {targetNodeIdsByPartitionId, targetProvisioningAdmission} =
      await this.planMergeTargetProvisioning(input, compactAdmission);

    const transitionMetadata = {
      ...input.workflow.metadata,
      [PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]: compactAdmission,
    };
    this.ensureCanonicalMergeParticipants(input.workflowId, transitionMetadata);
    await this.workflowCoordinator.updateWorkflow(input.workflowId, {
      status: PARTITION_TRANSITION_STATE.MERGE_PREPARING,
      metadata: transitionMetadata,
    });

    const now = this.now();
    const mergedPartitionMetadata = {
      partition_id: input.mergedPartitionId,
      table_id: input.tableId,
      table_name: input.tableName,
      partition_key_start: input.leftRange.start,
      partition_key_end: input.rightRange.end,
      partition_version: input.targetVersion,
      replica_count: input.replicaCount,
      size_bytes: 0,
      leader_node_id: null,
      state: ACTIVE_PARTITION_STATE,
      created_at: now,
      updated_at: now,
    };
    if (!this.resolveMergedPartitionMetadataRow(input.mergedPartitionId)) {
      await this.insertMergedPartitionMetadata(mergedPartitionMetadata);
    }
    await this.waitForTablePartitionMetadata(
      input.tableId,
      input.mergedPartitionId,
      input.executionTimeoutBudget,
    );
    await this.provisionInitialTablePartition({
      tableId: input.tableId,
      tableName: input.tableName,
      tableMetadata: input.tableInfo,
      partitionId: input.mergedPartitionId,
      partitionMetadata: mergedPartitionMetadata,
      replicaCount: input.replicaCount,
      minimumRoutableReplicaCount: input.mergeBootstrapReplicaCount,
      targetNodeIds:
        targetNodeIdsByPartitionId[input.mergedPartitionId] ||
        input.candidateTargetNodeIds,
      admissionConvergence: targetProvisioningAdmission,
      timeoutBudget: input.executionTimeoutBudget,
      topologySnapshot: input.topologySnapshot,
      routingReadinessDimension:
        MERGE_BOOTSTRAP_ROUTING_READINESS_DIMENSION,
    });
    await this.workflowCoordinator.acknowledgeParticipant(input.workflowId, {
      [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
        MERGE_PARTICIPANT_PREFIX.MERGED_TARGET,
      [PARTICIPANT_ACK_FIELD.STATUS]: MERGE_ACK_STATUS.TARGET_PROVISIONED,
      [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: this.now(),
    });

    await this.workflowCoordinator.updateWorkflow(input.workflowId, {
      status: PARTITION_TRANSITION_STATE.MERGE_BACKFILLING,
      metadata: transitionMetadata,
    });
    const persistedTransitionMetadata = this.buildPersistedTransitionMetadata(
      this.workflowCoordinator.getWorkflowById(input.workflowId) ||
        input.workflow,
    );
    for (const sourcePartitionId of input.sourcePartitionIds) {
      await this.startMergeReplicationOnSourcePartition(
        sourcePartitionId,
        input.tableId,
        input.tableName,
        persistedTransitionMetadata,
      );
    }

    this.logger.info(MANAGED_MERGE_LOG_MSG.MERGE_PREPARED, {
      sourcePartitionIds: input.sourcePartitionIds,
      tableId: input.tableId,
      tableName: input.tableName,
      mergedPartitionId: input.mergedPartitionId,
      targetVersion: input.targetVersion,
      workflowId: input.workflowId,
    });

    return {
      success: true,
      sourcePartitionIds: [...input.sourcePartitionIds],
      tableId: input.tableId,
      tableName: input.tableName,
      workflowId: input.workflowId,
      targetVersion: input.targetVersion,
      targetPartitionId: input.mergedPartitionId,
      admission: compactAdmission,
    };
  }
}

function assignWorkflowMethods(targetPrototype, sourcePrototype, methodNames) {
  const selectedNames = Array.isArray(methodNames) ?
    methodNames :
    Object.getOwnPropertyNames(sourcePrototype).filter(
      (methodName) => methodName !== LOCAL_STR_CONSTRUCTOR,
    );
  for (const methodName of selectedNames) {
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    if (descriptor) {
      Object.defineProperty(targetPrototype, methodName, descriptor);
    }
  }
}

assignWorkflowMethods(
  ManagedMergeWorkflow.prototype,
  ManagedSplitWorkflowStateMethods.prototype,
  REUSED_SPLIT_STATE_METHOD_NAMES,
);
assignWorkflowMethods(
  ManagedMergeWorkflow.prototype,
  ManagedSplitWorkflowProvisioningMethods.prototype,
  REUSED_SPLIT_PROVISIONING_METHOD_NAMES,
);
assignWorkflowMethods(
  ManagedMergeWorkflow.prototype,
  ManagedMergeWorkflowPlanMethods.prototype,
);
assignWorkflowMethods(
  ManagedMergeWorkflow.prototype,
  ManagedMergeWorkflowStateMethods.prototype,
);
assignWorkflowMethods(
  ManagedMergeWorkflow.prototype,
  ManagedMergeWorkflowPersistenceMethods.prototype,
);
assignWorkflowMethods(
  ManagedMergeWorkflow.prototype,
  ManagedMergeWorkflowExecutionGateMethods.prototype,
);
assignWorkflowMethods(
  ManagedMergeWorkflow.prototype,
  ManagedMergeWorkflowDissolutionMethods.prototype,
);

export {
  ManagedMergeWorkflow,
};
