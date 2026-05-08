import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
} from '../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  EntityType,
  ReplicaStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  createMockControlPlaneReadinessService,
  createMockCoordinator,
  createTestRebalancer,
} from './test-helpers.js';

const TEST_OWNER_NODE_ID = 'node-priority-owner';
const TEST_SOURCE_NODE_ID = 'node-priority-source';
const TEST_TARGET_NODE_ID = 'node-priority-target';
const TEST_SUPPORTING_NODE_ID = 'node-priority-support';
const TEST_PARTITION_ID = 'sql_write_operations-p1';
const TEST_REPLICA_ID = 'sql_write_operations-p1-r1';
const TEST_OPERATION_ID = 'op-priority-recovery-live';
const TEST_PUBLICATION_EPOCH = 4;
const TEST_BLOCKER_ELIGIBLE_NO_OPERATION =
  'eligible_but_no_operation_created';
const TEST_WAIT_FOR_OPERATION_PROGRESS =
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS;
const TEST_CREATE_RECOVERY_OPERATION =
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.CREATE_RECOVERY_OPERATION;

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: TEST_OWNER_NODE_ID},
      logging: {level: 'error'},
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function buildInFlightReplaceOperation() {
  return Object.freeze({
    operation_id: TEST_OPERATION_ID,
    operationId: TEST_OPERATION_ID,
    type: 'REPLACE',
    entity_type: EntityType.PARTITION,
    entity_id: TEST_PARTITION_ID,
    partition_id: TEST_PARTITION_ID,
    partitionId: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    replicaId: TEST_REPLICA_ID,
    source_node_id: TEST_SOURCE_NODE_ID,
    sourceNodeId: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    status: ReplicaStatus.SYNCING,
    workflow_step: WORKFLOW_STEP.SYNCING,
    workflowStep: WORKFLOW_STEP.SYNCING,
    steps_history: JSON.stringify([
      {step: WORKFLOW_STEP.PENDING, status: 'pending', inFlight: true},
      {step: WORKFLOW_STEP.SENDING, status: 'pending', inFlight: true},
      {step: WORKFLOW_STEP.CREATING, status: 'creating', inFlight: true},
      {step: WORKFLOW_STEP.SYNCING, status: 'syncing', inFlight: true},
    ]),
  });
}

function buildStalePlanningSnapshot() {
  return Object.freeze({
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    publishedActiveNodeIds: Object.freeze([
      TEST_SOURCE_NODE_ID,
      TEST_TARGET_NODE_ID,
      TEST_SUPPORTING_NODE_ID,
    ]),
    projectedServingNodeIds: Object.freeze([
      TEST_SOURCE_NODE_ID,
      TEST_TARGET_NODE_ID,
      TEST_SUPPORTING_NODE_ID,
    ]),
    locallyEligibleNodeIds: Object.freeze([
      TEST_SOURCE_NODE_ID,
      TEST_TARGET_NODE_ID,
      TEST_SUPPORTING_NODE_ID,
    ]),
    priorityPartitionSummary: Object.freeze({
      satisfied: false,
      requiredDistinctNodeCount: 3,
      missingPartitionIds: Object.freeze([TEST_PARTITION_ID]),
      blockedPartitions: Object.freeze([Object.freeze({
        partitionId: TEST_PARTITION_ID,
        readyDistinctNodeCount: 2,
        requiredDistinctNodeCount: 3,
        spreadGap: 1,
      })]),
    }),
    priorityRecoveryDecisionSnapshots: Object.freeze({
      snapshots: Object.freeze([Object.freeze({
        partitionId: TEST_PARTITION_ID,
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
        blockerReasons: Object.freeze([
          TEST_BLOCKER_ELIGIBLE_NO_OPERATION,
        ]),
        progress: Object.freeze({
          nextRequiredAction: TEST_CREATE_RECOVERY_OPERATION,
        }),
        planner: Object.freeze({
          readyDistinctNodeCount: 2,
          requiredDistinctNodeCount: 3,
          spreadGap: 1,
        }),
        admission: Object.freeze({
          effectiveEligibleNodeIds: Object.freeze([
            TEST_SOURCE_NODE_ID,
            TEST_TARGET_NODE_ID,
            TEST_SUPPORTING_NODE_ID,
          ]),
        }),
        publication: Object.freeze({
          recoveryActiveNodeIds: Object.freeze([
            TEST_SOURCE_NODE_ID,
            TEST_TARGET_NODE_ID,
            TEST_SUPPORTING_NODE_ID,
          ]),
        }),
      })]),
    }),
  });
}

function createPlanningReadinessService(planningSnapshot) {
  const readinessService = createMockControlPlaneReadinessService();
  readinessService.getPriorityRecoveryPlanningAnswerBestEffort = async () =>
    planningSnapshot;
  readinessService.getPriorityRecoveryPlanningAnswerSync = () =>
    planningSnapshot;
  return readinessService;
}

function createPriorityRebalancer(options = {}) {
  const planningSnapshot = options.planningSnapshot || buildStalePlanningSnapshot();
  const readinessService =
    createPlanningReadinessService(planningSnapshot);
  const rebalanceCoordinator =
    options.rebalanceCoordinator || createMockCoordinator();
  return createTestRebalancer({
    entityId: TEST_PARTITION_ID,
    entityType: EntityType.PARTITION,
    nodeId: TEST_OWNER_NODE_ID,
    cacheData: {
      partitions: [{
        partition_id: TEST_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
      }],
      replicaOperations: options.replicaOperations || [],
    },
    controlPlaneReadinessService: readinessService,
    rebalanceCoordinator,
  });
}

test(
  'UnifiedRebalancer current priority follow-up snapshot prefers the coordinator decision over stale planning reconstruction',
  async (t) => {
    initializeTestEnvironment();

    const planningSnapshot = buildStalePlanningSnapshot();
    const coordinator = createMockCoordinator();
    coordinator.workflowOwner = {
      async getPriorityRecoveryDecisionSnapshotForPartitionOperations() {
        return Object.freeze({
          partitionId: TEST_PARTITION_ID,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
          blockerReasons: Object.freeze([]),
          progress: Object.freeze({
            nextRequiredAction: TEST_WAIT_FOR_OPERATION_PROGRESS,
          }),
        });
      },
    };
    const rebalancer = createPriorityRebalancer({
      planningSnapshot,
      replicaOperations: [buildInFlightReplaceOperation()],
      rebalanceCoordinator: coordinator,
    });

    const decision =
      await rebalancer.getCurrentPriorityRecoveryFollowUpDecisionSnapshot();

    t.equal(
      decision?.decisionSnapshot?.semanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
      'the async follow-up reader should expose the coordinator-owned workflow-progress state instead of the stale planning-only needs_operation witness',
    );
    t.equal(
      decision?.decisionSnapshot?.progress?.nextRequiredAction,
      TEST_WAIT_FOR_OPERATION_PROGRESS,
      'the async follow-up reader should route the successor boundary to workflow progress',
    );
  },
);

test(
  'UnifiedRebalancer planning reconstruction does not recreate needs_operation after a live replace is cache-visible',
  async (t) => {
    initializeTestEnvironment();

    const planningSnapshot = buildStalePlanningSnapshot();
    const rebalancer = createPriorityRebalancer({
      planningSnapshot,
      replicaOperations: [buildInFlightReplaceOperation()],
    });

    const decisionSnapshot =
      rebalancer.buildPriorityRecoveryFollowUpDecisionSnapshotFromPlanning(
        planningSnapshot,
        {
          partitionId: TEST_PARTITION_ID,
          includeNonRequiredSnapshot: true,
        },
      );

    t.equal(
      decisionSnapshot?.semanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
      'planning reconstruction should reflect the cache-visible in-flight replace instead of recreating needs_operation',
    );
    t.notOk(
      decisionSnapshot?.blockerReasons?.includes(
        TEST_BLOCKER_ELIGIBLE_NO_OPERATION,
      ),
      'the cache-refreshed reconstruction should drop the stale eligible_but_no_operation_created blocker',
    );
    t.equal(
      rebalancer.isPriorityRecoveryFollowUpOperationRequired(
        decisionSnapshot,
      ),
      false,
      'the refreshed decision should stop the follow-up path from requesting another recovery operation',
    );
  },
);

test(
  'UnifiedRebalancer planning-gate snapshot stops advertising operation creation once live replace progress exists',
  async (t) => {
    initializeTestEnvironment();

    const rebalancer = createPriorityRebalancer({
      replicaOperations: [buildInFlightReplaceOperation()],
    });

    const planningGateSnapshot =
      rebalancer.buildPriorityRecoveryOperationCreationPlanningGateSnapshot(
        TEST_PARTITION_ID,
      );

    t.same(
      planningGateSnapshot,
      Object.freeze({
        operationCreationRequired: false,
        operationCreationPartitionId: null,
        operationCreationScope: null,
      }),
      'the sync planning gate should not recreate eligible_but_no_operation_created after move execution has already advanced the same partition',
    );
  },
);
