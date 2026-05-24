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
import {
  ManagedSplitWorkflowStateMethods,
} from './managed-split-workflow-state-methods.js';
import {
  ManagedSplitWorkflowProvisioningMethods,
} from './managed-split-workflow-provisioning-methods.js';
import {
  ManagedSplitWorkflowExecutionGateMethods,
} from './managed-split-workflow-execution-gate-methods.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_1CWET = 'getCDCIntegrationService';
const LOCAL_STR_GETPARTITIONINFO = 'getPartitionInfo';
const LOCAL_STR_GETTABLEINFO = 'getTableInfo';
const LOCAL_STR_LISTTABLEINFOS = 'listTableInfos';
const LOCAL_STR_13EV6 = 'parsePartitionTransition';
const LOCAL_STR_1OE64 = 'isLocalManagedSplitLeader';
const LOCAL_STR_1OAEZ = 'resolveActivePartitionVersion';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_FBFR4 = 'buildManagedSplitPlan';
const LOCAL_STR_HRKK1 = 'resolveProvisionTargetNodeIds';
const LOCAL_STR_1IQXE = 'getRoutablePartitionServiceNodeIds';
const LOCAL_STR_18K48 = 'isCriticalSystemPartition';
const LOCAL_STR_1GLE7 = 'captureTopologySnapshot';
const LOCAL_STR_VWH5M = 'calculateQuorumReplicaCount';
const LOCAL_STR_2DB32 = 'createExecutionTimeoutBudget';
const LOCAL_STR_3FLMF = 'estimateSplitAdmissionBytes';
const LOCAL_STR_Z50CU = 'waitForTablePartitionMetadata';
const LOCAL_STR_13QHT = 'probeInitialTablePartitionProvisioning';
const LOCAL_STR_W8LVO = 'provisionInitialTablePartition';
const LOCAL_STR_5AZGL = 'startSplitReplicationOnSourcePartition';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_MANAGED_SPLIT = 'managed_split';
const LOCAL_STR_X9S84 = 'managed-split-workflow';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_COMMA = ',';
const LOCAL_STR_CONSTRUCTOR = 'constructor';

const ACTIVE_PARTITION_STATE = 'NORMAL';
const DEFAULT_QUORUM_REPLICA_COUNT = 1;
const DEFAULT_RETRY_BASE_DELAY_MS = 5000;
const DEFAULT_RETRY_MAX_DELAY_MS = 60000;
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
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_1CWET) ||
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
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_13EV6) ||
      options.parsePartitionTransition ||
      (() => null);
    this.isLocalManagedSplitLeader =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_1OE64) ||
      options.isLocalManagedSplitLeader ||
      (() => false);
    this.resolveActivePartitionVersion =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_1OAEZ) ||
      options.resolveActivePartitionVersion ||
      (() => LOCAL_NUM_ONE);
    this.buildManagedSplitPlan =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_FBFR4) ||
      options.buildManagedSplitPlan ||
      (async () => {
        throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED);
      });
    this.resolveProvisionTargetNodeIds =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_HRKK1) ||
      options.resolveProvisionTargetNodeIds ||
      (() => []);
    this.getRoutablePartitionServiceNodeIds =
      bindTopologyMethod(
        this.topologyAdapter,
        LOCAL_STR_1IQXE,
      ) ||
      options.getRoutablePartitionServiceNodeIds ||
      (() => []);
    this.isCriticalSystemPartition =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_18K48) ||
      options.isCriticalSystemPartition ||
      (() => false);
    this.captureTopologySnapshot =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_1GLE7) ||
      options.captureTopologySnapshot || null;
    this.calculateQuorumReplicaCount =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_VWH5M) ||
      options.calculateQuorumReplicaCount ||
      (() => DEFAULT_QUORUM_REPLICA_COUNT);
    this.storageAdmissionService =
      options.storageAdmissionService ||
      this.topologyAdapter?.storageAdmissionService || null;
    this.createExecutionTimeoutBudget =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_2DB32) ||
      options.createExecutionTimeoutBudget || null;
    this.messageRouter =
      options.messageRouter || this.topologyAdapter?.messageRouter || null;
    this.pressureGovernor = options.pressureGovernor || null;
    this.estimateSplitAdmissionBytes =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_3FLMF) ||
      options.estimateSplitAdmissionBytes ||
      ((partitionInfo) => this.defaultEstimateSplitAdmissionBytes(partitionInfo));
    this.waitForTablePartitionMetadata =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_Z50CU) ||
      options.waitForTablePartitionMetadata || (async () => {});
    this.probeInitialTablePartitionProvisioning =
      bindTopologyMethod(
        this.topologyAdapter,
        LOCAL_STR_13QHT,
      ) ||
      options.probeInitialTablePartitionProvisioning || null;
    this.provisionInitialTablePartition =
      bindTopologyMethod(this.topologyAdapter, LOCAL_STR_W8LVO) ||
      options.provisionInitialTablePartition || (async () => {});
    this.startSplitReplicationOnSourcePartition =
      bindTopologyMethod(
        this.topologyAdapter,
        LOCAL_STR_5AZGL,
      ) ||
      options.startSplitReplicationOnSourcePartition || (async () => {});
    this.logger = options.logger || this.topologyAdapter?.logger || console;
    this.now = options.now || (() => Date.now());
    this.retryBaseDelayMs =
      Number.isFinite(options.retryBaseDelayMs) &&
      options.retryBaseDelayMs > LOCAL_NUM_ZERO ?
        Math.floor(options.retryBaseDelayMs) :
        DEFAULT_RETRY_BASE_DELAY_MS;
    this.retryMaxDelayMs =
      Number.isFinite(options.retryMaxDelayMs) &&
      options.retryMaxDelayMs > LOCAL_NUM_ZERO ?
        Math.floor(options.retryMaxDelayMs) :
        DEFAULT_RETRY_MAX_DELAY_MS;
    this.transactionCoordinator =
      options.transactionCoordinator ||
      this.topologyAdapter?.transactionCoordinator ||
      null;
    this.workflowCoordinator = options.workflowCoordinator ||
      new DurableWorkflowCoordinator({
        persistWorkflow: async (workflow) =>
          this.persistWorkflowTransition(workflow),
        persistParticipant: async (participant) =>
          this.persistWorkflowParticipantState(participant),
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
        name: LOCAL_STR_X9S84,
        workflowCoordinator: this.workflowCoordinator,
        ownerKeyFactory: ({partitionId, ownerKey}) =>
          String(ownerKey || partitionId || LOCAL_STR_EMPTY),
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

    const tableName = partitionInfo.table_name || partitionInfo.tableName;
    const tableId = partitionInfo.table_id || partitionInfo.tableId;
    const tableInfo = this.getTableInfo(tableName || tableId);
    if (!tableInfo) {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_TABLE_NOT_FOUND);
    }
    const existingTransition = this.parsePartitionTransition(tableInfo);
    if (existingTransition &&
        !this.isRetryableAdmissionState(existingTransition)) {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_ALREADY_IN_PROGRESS);
    }

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
      this.isCriticalSystemPartition(partitionId) === true;
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
    };
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
      }),
      createdAt: now,
      updatedAt: now,
    });

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

export {
  ManagedSplitWorkflow,
};
