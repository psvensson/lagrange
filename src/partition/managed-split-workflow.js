import {
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
} from '../query/query-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {TIMEOUT_BUDGET_DEFAULT} from '../control-plane/timeout-budget.js';
import {DurableWorkflowCoordinator} from '../workflow/durable-workflow-coordinator.js';
import {OperationLane} from '../workflow/operation-lane.js';
import {TimeoutPolicy} from '../workflow/timeout-policy.js';
import {WorkflowStepRunner} from '../workflow/workflow-step-runner.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
import {resolvePartitionRowKeyRange} from './partition-transition-overlap-guard.js';
import {
  ManagedSplitWorkflowStateMethods,
} from './managed-split-workflow-state-methods.js';
import {
  ManagedSplitWorkflowProvisioningMethods,
} from './managed-split-workflow-provisioning-methods.js';
import {
  ManagedSplitWorkflowExecutionGateMethods,
} from './managed-split-workflow-execution-gate-methods.js';
import {
  ManagedSplitWorkflowDissolutionMethods,
} from './managed-split-workflow-dissolution-methods.js';
import {
  buildSplitWorkflowOwnerId,
  ManagedSplitWorkflowOwnershipMethods,
} from './managed-split-workflow-ownership-methods.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_GETCDCINTEGRATIONSERVICE = 'getCDCIntegrationService';
const LOCAL_STR_GETPARTITIONINFO = 'getPartitionInfo';
const LOCAL_STR_GETTABLEINFO = 'getTableInfo';
const LOCAL_STR_LISTTABLEINFOS = 'listTableInfos';
const LOCAL_STR_PARSEPARTITIONTRANSITION = 'parsePartitionTransition';
const LOCAL_STR_ISLOCALMANAGEDSPLITLEADER = 'isLocalManagedSplitLeader';
const LOCAL_STR_RESOLVEACTIVEPARTITIONVERSION = 'resolveActivePartitionVersion';
const LOCAL_STR_BUILDMANAGEDSPLITPLAN = 'buildManagedSplitPlan';
const LOCAL_STR_RESOLVEPROVISIONTARGETNODEIDS = 'resolveProvisionTargetNodeIds';
const LOCAL_STR_GETROUTABLEPARTITIONSERVICENODEIDS = 'getRoutablePartitionServiceNodeIds';
const LOCAL_STR_ISSYSTEMTABLEPARTITIONID = 'isSystemTablePartitionId';
const LOCAL_STR_CAPTURETOPOLOGYSNAPSHOT = 'captureTopologySnapshot';
const LOCAL_STR_CALCULATEQUORUMREPLICACOUNT = 'calculateQuorumReplicaCount';
const LOCAL_STR_CREATEEXECUTIONTIMEOUTBUDGET = 'createExecutionTimeoutBudget';
const LOCAL_STR_ESTIMATESPLITADMISSIONBYTES = 'estimateSplitAdmissionBytes';
const LOCAL_STR_WAITFORTABLEPARTITIONMETADATA = 'waitForTablePartitionMetadata';
const LOCAL_STR_PROBEINITIALTABLEPARTITIONPROVISIONING = 'probeInitialTablePartitionProvisioning';
const LOCAL_STR_PROVISIONINITIALTABLEPARTITION = 'provisionInitialTablePartition';
const LOCAL_STR_STARTSPLITREPLICATIONONSOURCEPARTITION = 'startSplitReplicationOnSourcePartition';
const LOCAL_STR_LISTTABLEPARTITIONROWS = 'listTablePartitionRows';
const LOCAL_STR_LISTPARTITIONSERVICEROWS = 'listPartitionServiceRows';
const LOCAL_STR_DELIVERREPLICAREMOVAL = 'deliverReplicaRemoval';
const LOCAL_STR_MANAGED_SPLIT = 'managed_split';
const LOCAL_STR_MANAGED_SPLIT_WORKFLOW = 'managed-split-workflow';
const LOCAL_STR_COMMA = ',';
const LOCAL_STR_CONSTRUCTOR = 'constructor';

const ACTIVE_PARTITION_STATE = 'NORMAL';
const DEFAULT_QUORUM_REPLICA_COUNT = 1;
const DEFAULT_RETRY_BASE_DELAY_MS = 5000;
const DEFAULT_RETRY_MAX_DELAY_MS = 60000;
// Durable ownership lease for split workflow claims: long enough to
// cover an idle ack gap during backfill, short enough that a dead owner
// is stolen promptly after lease expiry. Renewal happens on every
// owner-lane step.
const DEFAULT_WORKFLOW_LEASE_MS = 60000;
const SPLIT_BOOTSTRAP_ROUTING_READINESS_DIMENSION =
  CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
function bindTopologyMethod(topologyAdapter, methodName) {
  if (!topologyAdapter ||
      typeof topologyAdapter[methodName] !== LOCAL_STR_FUNCTION) {
    return null;
  }
  return topologyAdapter[methodName].bind(topologyAdapter);
}

/**
 * First-class managed split workflow owner.
 */
class ManagedSplitWorkflow {
  /**
   * @param {Object} options - Workflow options.
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this.topologyAdapter = options.topologyAdapter || null;
    this.getCDCIntegrationService =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_GETCDCINTEGRATIONSERVICE) ||
      options.getCDCIntegrationService ||
      (() => options.cdcIntegrationService || null);
    this.getPartitionInfo =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_GETPARTITIONINFO) ||
      options.getPartitionInfo || (() => null);
    this.getTableInfo =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_GETTABLEINFO) ||
      options.getTableInfo || (() => null);
    this.listTableInfos =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_LISTTABLEINFOS) ||
      options.listTableInfos || (() => []);
    this.parsePartitionTransition =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_PARSEPARTITIONTRANSITION) ||
      options.parsePartitionTransition ||
      (() => null);
    this.isLocalManagedSplitLeader =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_ISLOCALMANAGEDSPLITLEADER) ||
      options.isLocalManagedSplitLeader ||
      (() => false);
    this.resolveActivePartitionVersion =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_RESOLVEACTIVEPARTITIONVERSION) ||
      options.resolveActivePartitionVersion ||
      (() => 1);
    this.buildManagedSplitPlan =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_BUILDMANAGEDSPLITPLAN) ||
      options.buildManagedSplitPlan ||
      (async () => {
        throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED);
      });
    this.resolveProvisionTargetNodeIds =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_RESOLVEPROVISIONTARGETNODEIDS) ||
      options.resolveProvisionTargetNodeIds ||
      (() => []);
    this.getRoutablePartitionServiceNodeIds =
      bindTopologyMethod(
        this.topologyAdapter,
        LOCAL_STR_GETROUTABLEPARTITIONSERVICENODEIDS,
      ) ||
      options.getRoutablePartitionServiceNodeIds ||
      (() => []);
    this.isSystemTablePartitionId =
      bindTopologyMethod(
        this.topologyAdapter,
        LOCAL_STR_ISSYSTEMTABLEPARTITIONID,
      ) ||
      options.isSystemTablePartitionId ||
      (() => false);
    this.captureTopologySnapshot =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_CAPTURETOPOLOGYSNAPSHOT) ||
      options.captureTopologySnapshot || null;
    this.calculateQuorumReplicaCount =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_CALCULATEQUORUMREPLICACOUNT) ||
      options.calculateQuorumReplicaCount ||
      (() => DEFAULT_QUORUM_REPLICA_COUNT);
    this.storageAdmissionService =
      options.storageAdmissionService ||
      this.topologyAdapter?.storageAdmissionService || null;
    this.createExecutionTimeoutBudget =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_CREATEEXECUTIONTIMEOUTBUDGET) ||
      options.createExecutionTimeoutBudget || null;
    this.messageRouter =
      options.messageRouter || this.topologyAdapter?.messageRouter || null;
    this.pressureGovernor = options.pressureGovernor || null;
    this.estimateSplitAdmissionBytes =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_ESTIMATESPLITADMISSIONBYTES) ||
      options.estimateSplitAdmissionBytes ||
      ((partitionInfo) => this.defaultEstimateSplitAdmissionBytes(partitionInfo));
    this.waitForTablePartitionMetadata =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_WAITFORTABLEPARTITIONMETADATA) ||
      options.waitForTablePartitionMetadata || (async () => {});
    this.probeInitialTablePartitionProvisioning =
      bindTopologyMethod(
        this.topologyAdapter,
        LOCAL_STR_PROBEINITIALTABLEPARTITIONPROVISIONING,
      ) ||
      options.probeInitialTablePartitionProvisioning || null;
    this.provisionInitialTablePartition =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_PROVISIONINITIALTABLEPARTITION) ||
      options.provisionInitialTablePartition || (async () => {});
    this.startSplitReplicationOnSourcePartition =
      bindTopologyMethod(
        this.topologyAdapter,
        LOCAL_STR_STARTSPLITREPLICATIONONSOURCEPARTITION,
      ) ||
      options.startSplitReplicationOnSourcePartition || (async () => {});
    this.listTablePartitionRows =
      bindTopologyMethod(
        this.topologyAdapter,
        LOCAL_STR_LISTTABLEPARTITIONROWS,
      ) ||
      options.listTablePartitionRows || (() => []);
    this.listPartitionServiceRows =
      bindTopologyMethod(
        this.topologyAdapter,
        LOCAL_STR_LISTPARTITIONSERVICEROWS,
      ) ||
      options.listPartitionServiceRows || (() => []);
    this.deliverReplicaRemoval =
      bindTopologyMethod(
        this.topologyAdapter,
        LOCAL_STR_DELIVERREPLICAREMOVAL,
      ) ||
      options.deliverReplicaRemoval || (async () => null);
    this.splitCompletionListener =
      typeof options.splitCompletionListener === LOCAL_STR_FUNCTION ?
        options.splitCompletionListener :
        null;
    this.splitOwnerLaneTailByOwnerKey = new Map();
    this.logger = options.logger || this.topologyAdapter?.logger || console;
    this.now = options.now || (() => Date.now());
    this.retryBaseDelayMs =
      Number.isFinite(options.retryBaseDelayMs) &&
      options.retryBaseDelayMs > 0 ?
        Math.floor(options.retryBaseDelayMs) :
        DEFAULT_RETRY_BASE_DELAY_MS;
    this.retryMaxDelayMs =
      Number.isFinite(options.retryMaxDelayMs) &&
      options.retryMaxDelayMs > 0 ?
        Math.floor(options.retryMaxDelayMs) :
        DEFAULT_RETRY_MAX_DELAY_MS;
    this.transactionCoordinator =
      options.transactionCoordinator ||
      this.topologyAdapter?.transactionCoordinator ||
      null;
    // Durable ownership identity (nodeId + boot nonce; see
    // buildSplitWorkflowOwnerId).
    this.workflowOwnerId = buildSplitWorkflowOwnerId(options, this.nodeId);
    this.workflowLeaseMs = Number.isFinite(options.workflowLeaseMs) &&
      options.workflowLeaseMs > 0 ?
      Math.floor(options.workflowLeaseMs) :
      DEFAULT_WORKFLOW_LEASE_MS;
    this.workflowCoordinator = options.workflowCoordinator ||
      new DurableWorkflowCoordinator({
        persistWorkflow: async (workflow) =>
          this.persistWorkflowTransition(workflow),
        persistWorkflowClaim: async (workflow, context) =>
          this.persistSplitWorkflowClaim(workflow, context),
        persistWorkflowTransition: async (workflow, context) =>
          this.persistSplitWorkflowTransitionFence(workflow, context),
        persistParticipant: async (participant) =>
          this.persistWorkflowParticipantState(participant),
        isParticipantTransitionAllowed: (participantKey, from, to) =>
          this.isSplitParticipantTransitionAllowed(participantKey, from, to),
        now: this.now,
      });
    this.executionTimeoutPolicy = options.executionTimeoutPolicy ||
      new TimeoutPolicy({
        operationName: LOCAL_STR_MANAGED_SPLIT,
        configuredBudgetMs: TIMEOUT_BUDGET_DEFAULT.SPLIT_OPERATION_BUDGET_MS,
        now: this.now,
      });
    this.splitOperationLane = options.splitOperationLane ||
      new OperationLane({
        name: LOCAL_STR_MANAGED_SPLIT_WORKFLOW,
        workflowCoordinator: this.workflowCoordinator,
        ownerKeyFactory: ({partitionId, ownerKey}) =>
          String(ownerKey || partitionId || ''),
      });
    this.workflowStepRunner = options.workflowStepRunner ||
      new WorkflowStepRunner({
        workflowCoordinator: this.workflowCoordinator,
        operationLane: this.splitOperationLane,
        timeoutPolicy: this.executionTimeoutPolicy,
        now: this.now,
      });
  }

  /**
   * Execute one managed partition split.
   * @param {string} partitionId - Source partition ID.
   * @param {Object} [executionOptions={}] - Optional admission metadata.
   * @return {Promise<Object>} Split orchestration result.
   */
  execute(partitionId, executionOptions = {}) {
    if (!partitionId) {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_PARTITION_NOT_FOUND);
    }

    return this.splitOperationLane.run(
      {partitionId, ...executionOptions},
      async (laneExecution) => this.executeInternal(partitionId, {
        ...executionOptions,
        timeoutBudget:
          laneExecution?.timeoutBudget ||
          executionOptions.timeoutBudget ||
          null,
      }),
    );
  }

  /**
   * Execute one managed split after single-flight admission.
   * @param {string} partitionId - Source partition ID.
   * @return {Promise<Object>} Split orchestration result.
   * @private
   */
  async executeInternal(partitionId, executionContext = {}) {
    const partitionInfo = this.getPartitionInfo(partitionId);
    if (!partitionInfo) {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_PARTITION_NOT_FOUND);
    }
    if (!this.isLocalManagedSplitLeader(partitionInfo)) {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_LEADER_REQUIRED);
    }

    const {tableName, tableId, tableInfo, existingTransition} =
      this.resolveSplitAdmissionTableContext(partitionInfo);
    this.assertSplitTransitionAdmission(
      partitionInfo, tableId, existingTransition,
    );

    const primaryKeyColumn = String(
      tableInfo.partition_key || tableInfo.partitionKey || '',
    );
    if (!primaryKeyColumn || primaryKeyColumn.includes(LOCAL_STR_COMMA)) {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_PRIMARY_KEY_REQUIRED);
    }

    const replicaCount = Number.isInteger(partitionInfo.replica_count) &&
      partitionInfo.replica_count > 0 ?
      partitionInfo.replica_count :
      DEFAULT_QUORUM_REPLICA_COUNT;
    const splitBootstrapReplicaCount =
      this.calculateQuorumReplicaCount(replicaCount);
    const criticalSystemPartition =
      this.isSystemTablePartitionId(partitionId) === true;
    const sourceRoutableNodeIds = this.getRoutablePartitionServiceNodeIds(
      partitionId,
    );
    const discoveredTargetNodeIds = this.resolveProvisionTargetNodeIds(
      Number.MAX_SAFE_INTEGER,
    );
    const candidateTargetNodeIds = this.resolveAdmissionCandidateTargetNodeIds(
      discoveredTargetNodeIds,
      sourceRoutableNodeIds,
      splitBootstrapReplicaCount,
    );
    const targetVersion = this.resolveTargetPartitionVersion(
      tableInfo,
      existingTransition,
    );
    const workflowId = this.resolveWorkflowId(
      tableId,
      partitionId,
      targetVersion,
      existingTransition,
    );
    this.assertSplitRegistrationOverlapClear(
      {partitionInfo, partitionId, tableId, workflowId});
    const retryMetadata = this.resolvePendingRetryMetadata(
      existingTransition,
    );
    const scheduledRetry = this.resolveScheduledRetry(existingTransition);
    const scheduledRetryOutcome = await this.resolveExecutionGateOutcome({
      partitionId,
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
    const pressureGateOutcome = await this.resolveExecutionGateOutcome({
      partitionId,
      tableId,
      tableName,
      retryMetadata,
      pressureDecision,
    });
    if (pressureGateOutcome.blocked === true) {
      return pressureGateOutcome.result;
    }
    this.logger.info(QUERY_LOG_MSG.TABLE_SPLIT_START, {
      partitionId,
      tableId,
      tableName,
      primaryKeyColumn,
    });
    const now = this.now();
    const executionTimeoutBudget = executionContext.timeoutBudget ||
      (typeof this.createExecutionTimeoutBudget === 'function' ?
        this.createExecutionTimeoutBudget() :
        this.executionTimeoutPolicy.createTopLevelBudget({
          configuredBudgetMs:
            TIMEOUT_BUDGET_DEFAULT.SPLIT_OPERATION_BUDGET_MS,
        }));
    const estimatedBytes = this.estimateSplitAdmissionBytes(
      partitionInfo,
      tableInfo,
    );
    const topologySnapshot = await this.resolveTopologySnapshot({
      tableId,
      tableName,
      tableInfo,
      partitionId,
      partitionInfo,
      targetVersion,
      requiredReplicaCount: splitBootstrapReplicaCount,
      sourceRoutableNodeIds,
      discoveredTargetNodeIds,
      candidateTargetNodeIds,
      retryMetadata,
    });
    const snapshotSourceRoutableNodeIds = this.normalizeNodeIdList(
      topologySnapshot?.sourceRoutableNodeIds,
      sourceRoutableNodeIds,
    );
    const snapshotCandidateTargetNodeIds = this.normalizeNodeIdList(
      topologySnapshot?.candidateTargetNodeIds,
      candidateTargetNodeIds,
    );
    const snapshotDiscoveredTargetNodeIds = this.normalizeNodeIdList(
      topologySnapshot?.discoveredTargetNodeIds,
      discoveredTargetNodeIds,
    );
    const minimumRoutableSourceCount = this.resolveSplitMinimumRoutableSourceCount({
      requiredReplicaCount: splitBootstrapReplicaCount,
      isCriticalSystemPartition: criticalSystemPartition,
    });
    const persistedTopologySnapshot = {
      ...topologySnapshot,
      discoveredTargetNodeIds: snapshotDiscoveredTargetNodeIds,
      candidateTargetNodeIds: snapshotCandidateTargetNodeIds,
      sourceRoutableNodeIds: snapshotSourceRoutableNodeIds,
      // The source partition's key range at registration, persisted so
      // the durable transition row alone proves which key range this
      // in-flight split covers (F23 overlap guard).
      sourcePartitionKeyRanges: {
        [partitionId]: resolvePartitionRowKeyRange(partitionInfo),
      },
    };
    // The plan-time sibling set: every same-table partition at the
    // active epoch outside this split. Carried forward into the target
    // epoch at cutover so their key ranges never blackhole (F1).
    const siblingPartitionIds = this.resolveSplitSiblingPartitionIds({
      tableId,
      tableInfo,
      sourcePartitionId: partitionId,
    });
    const workflow = await this.workflowCoordinator.registerWorkflow({
      workflowId,
      ownerKey: partitionId,
      tableId,
      tableName,
      partitionId,
      status: PARTITION_TRANSITION_STATE.ADMISSION_PENDING,
      metadata: this.buildPendingTransitionMetadata({
        workflowId,
        partitionId,
        primaryKeyColumn,
        targetVersion,
        requiredReplicaCount: splitBootstrapReplicaCount,
        minimumRoutableSourceCount,
        isCriticalSystemPartition: criticalSystemPartition,
        candidateTargetNodeIds: snapshotCandidateTargetNodeIds,
        sourceRoutableNodeIds: snapshotSourceRoutableNodeIds,
        topologySnapshot: persistedTopologySnapshot,
        retryMetadata,
        estimatedBytes,
        siblingPartitionIds,
      }),
      createdAt: now,
      updatedAt: now,
    });

    // Durable ownership claim (new fence epoch): exactly one node holds
    // the live lease for this workflow. A refused claim is a typed
    // outcome — this node must not drive the workflow.
    const ownershipRefusal = await this.claimSplitWorkflowAtStart(
      workflowId,
      partitionId,
    );
    if (ownershipRefusal) {
      return ownershipRefusal;
    }

    try {
      const admissionResult = await this.evaluateSplitAdmission({
        candidateTargetNodeIds: snapshotCandidateTargetNodeIds,
        estimatedBytes,
        requiredReplicaCount: splitBootstrapReplicaCount,
        minimumRoutableSourceCount,
        sourceRoutableNodeIds: snapshotSourceRoutableNodeIds,
        isCriticalSystemPartition: criticalSystemPartition,
      });
      const compactAdmission = this.compactAdmissionResult(
        admissionResult,
        {
          discoveredTargetNodeIds: snapshotDiscoveredTargetNodeIds,
          candidateTargetNodeIds: snapshotCandidateTargetNodeIds,
          minimumRoutableSourceCount,
          estimatedBytes,
          sourceRoutableNodeIds: snapshotSourceRoutableNodeIds,
          isCriticalSystemPartition: criticalSystemPartition,
        },
      );
      const admissionGateOutcome = await this.resolveExecutionGateOutcome({
        partitionId,
        tableId,
        tableName,
        workflowId,
        targetVersion,
        retryMetadata,
        admissionResult,
        compactAdmission,
        workflowMetadata: workflow.metadata,
      });
      if (admissionGateOutcome.blocked === true) {
        return admissionGateOutcome.result;
      }

      let splitPlan = this.resolvePersistedSplitPlan(
        existingTransition,
        partitionInfo,
      );
      if (!splitPlan) {
        try {
          splitPlan = await this.buildManagedSplitPlan(
            partitionInfo,
            tableName,
            tableId,
            primaryKeyColumn,
          );
        } catch (error) {
          const deferredExecution =
            await this.handleRetryableSplitPlanningFailure({
              workflowId,
              partitionId,
              tableId,
              tableName,
              targetVersion,
              admission: compactAdmission,
              retryMetadata,
              error,
            });
          if (deferredExecution) {
            return deferredExecution;
          }
          throw error;
        }
      }
      const childProvisioningTargetNodeIdsByPartitionId =
        this.planChildProvisioningTargetNodeIds({
          childPartitionIds: [
            splitPlan.leftPartition.partitionId,
            splitPlan.rightPartition.partitionId,
          ],
          eligibleNodeIds: compactAdmission.eligibleNodeIds,
          candidateTargetNodeIds: snapshotCandidateTargetNodeIds,
          sourceRoutableNodeIds: snapshotSourceRoutableNodeIds,
          replicaCount,
          preferredAnchorNodeId:
            partitionInfo.leader_node_id ||
            partitionInfo.leaderNodeId ||
            this.nodeId,
        });
      const childProvisioningAdmissionByPartitionId =
        await this.probeChildProvisioningAdmissions({
          childProvisioningTargetNodeIdsByPartitionId,
          minimumRoutableReplicaCount: splitBootstrapReplicaCount,
        });
      const transitionTopologySnapshot = {
        ...persistedTopologySnapshot,
        childProvisioningTargetNodeIdsByPartitionId: JSON.parse(
          JSON.stringify(childProvisioningTargetNodeIdsByPartitionId),
        ),
        childProvisioningAdmissionByPartitionId: JSON.parse(
          JSON.stringify(childProvisioningAdmissionByPartitionId),
        ),
      };
      const childProvisioningDeferral =
        await this.handleChildProvisioningPrecheckFailure({
          workflowId,
          partitionId,
          tableId,
          tableName,
          targetVersion,
          admission: compactAdmission,
          topologySnapshot: transitionTopologySnapshot,
          retryMetadata,
          minimumRoutableReplicaCount: splitBootstrapReplicaCount,
          childProvisioningAdmissionByPartitionId,
        });
      if (childProvisioningDeferral) {
        return childProvisioningDeferral;
      }
      const transitionMetadata = {
        ...workflow.metadata,
        [PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]:
          compactAdmission,
        [PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT]:
          transitionTopologySnapshot,
        [PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY]:
          splitPlan.medianKey,
        [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]: [
          splitPlan.leftPartition.partitionId,
          splitPlan.rightPartition.partitionId,
        ],
      };
      this.ensureCanonicalSplitParticipants(
        workflowId,
        transitionMetadata,
      );
      await this.workflowCoordinator.updateWorkflow(workflowId, {
        status: PARTITION_TRANSITION_STATE.SPLIT_PREPARING,
        metadata: transitionMetadata,
      });

      const leftPartitionMetadata = {
        partition_id: splitPlan.leftPartition.partitionId,
        table_id: tableId,
        table_name: tableName,
        partition_key_start: splitPlan.leftPartition.keyRange.start,
        partition_key_end: splitPlan.leftPartition.keyRange.end,
        partition_version: targetVersion,
        replica_count: replicaCount,
        size_bytes: 0,
        leader_node_id: null,
        state: ACTIVE_PARTITION_STATE,
        created_at: now,
        updated_at: now,
      };
      const rightPartitionMetadata = {
        partition_id: splitPlan.rightPartition.partitionId,
        table_id: tableId,
        table_name: tableName,
        partition_key_start: splitPlan.rightPartition.keyRange.start,
        partition_key_end: splitPlan.rightPartition.keyRange.end,
        partition_version: targetVersion,
        replica_count: replicaCount,
        size_bytes: 0,
        leader_node_id: null,
        state: ACTIVE_PARTITION_STATE,
        created_at: now,
        updated_at: now,
      };

      await this.ensureChildPartitionMetadata({
        leftPartitionMetadata,
        rightPartitionMetadata,
      });
      await Promise.all([
        this.waitForTablePartitionMetadata(
          tableId,
          splitPlan.leftPartition.partitionId,
          executionTimeoutBudget,
        ),
        this.waitForTablePartitionMetadata(
          tableId,
          splitPlan.rightPartition.partitionId,
          executionTimeoutBudget,
        ),
      ]);

      await this.provisionInitialTablePartition({
        tableId,
        tableName,
        tableMetadata: tableInfo,
        partitionId: splitPlan.leftPartition.partitionId,
        partitionMetadata: leftPartitionMetadata,
        replicaCount,
        minimumRoutableReplicaCount: splitBootstrapReplicaCount,
        targetNodeIds:
          childProvisioningTargetNodeIdsByPartitionId[
            splitPlan.leftPartition.partitionId
          ] || snapshotCandidateTargetNodeIds,
        admissionConvergence:
          childProvisioningAdmissionByPartitionId[
            splitPlan.leftPartition.partitionId
          ] || null,
        timeoutBudget: executionTimeoutBudget,
        topologySnapshot: transitionTopologySnapshot,
        routingReadinessDimension:
          SPLIT_BOOTSTRAP_ROUTING_READINESS_DIMENSION,
      });
      await this.provisionInitialTablePartition({
        tableId,
        tableName,
        tableMetadata: tableInfo,
        partitionId: splitPlan.rightPartition.partitionId,
        partitionMetadata: rightPartitionMetadata,
        replicaCount,
        minimumRoutableReplicaCount: splitBootstrapReplicaCount,
        targetNodeIds:
          childProvisioningTargetNodeIdsByPartitionId[
            splitPlan.rightPartition.partitionId
          ] || snapshotCandidateTargetNodeIds,
        admissionConvergence:
          childProvisioningAdmissionByPartitionId[
            splitPlan.rightPartition.partitionId
          ] || null,
        timeoutBudget: executionTimeoutBudget,
        topologySnapshot: transitionTopologySnapshot,
        routingReadinessDimension:
          SPLIT_BOOTSTRAP_ROUTING_READINESS_DIMENSION,
      });

      await this.workflowCoordinator.updateWorkflow(workflowId, {
        status: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
        metadata: transitionMetadata,
      });

      await this.startSplitReplicationOnSourcePartition(
        partitionId,
        tableId,
        tableName,
        transitionMetadata,
      );

      this.logger.info(QUERY_LOG_MSG.TABLE_SPLIT_PREPARED, {
        partitionId,
        tableId,
        tableName,
        targetVersion,
        targetPartitionIds:
          transitionMetadata[
            PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
          ],
        workflowId,
      });

      return {
        success: true,
        partitionId,
        tableId,
        tableName,
        workflowId,
        targetVersion,
        admission: compactAdmission,
        splitKey:
          transitionMetadata[PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY],
        targetPartitionIds:
          transitionMetadata[
            PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
          ],
      };
    } catch (error) {
      const activeWorkflow = this.workflowCoordinator.getWorkflowById(
        workflowId,
      );
      const deferredExecution =
        await this.handleRetryablePostAdmissionExecutionFailure({
          workflowId,
          partitionId,
          tableId,
          tableName,
          targetVersion,
          retryMetadata,
          admission:
            activeWorkflow?.metadata?.[
              PARTITION_TRANSITION_METADATA_FIELD.ADMISSION
            ] || null,
          error,
        });
      if (deferredExecution) {
        return deferredExecution;
      }
      await this.persistExecutionFailure(workflowId, error);
      throw error;
    } finally {
      this.workflowCoordinator.removeWorkflow(workflow.workflowId);
    }
  }
}

function assignManagedSplitWorkflowMethods(targetPrototype, sourcePrototype) {
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetPrototype, methodName, descriptor);
  }
}

assignManagedSplitWorkflowMethods(
  ManagedSplitWorkflow.prototype,
  ManagedSplitWorkflowStateMethods.prototype,
);
assignManagedSplitWorkflowMethods(
  ManagedSplitWorkflow.prototype,
  ManagedSplitWorkflowExecutionGateMethods.prototype,
);
assignManagedSplitWorkflowMethods(
  ManagedSplitWorkflow.prototype,
  ManagedSplitWorkflowProvisioningMethods.prototype,
);
assignManagedSplitWorkflowMethods(
  ManagedSplitWorkflow.prototype,
  ManagedSplitWorkflowDissolutionMethods.prototype,
);
assignManagedSplitWorkflowMethods(
  ManagedSplitWorkflow.prototype,
  ManagedSplitWorkflowOwnershipMethods.prototype,
);

export {
  ManagedSplitWorkflow,
};
