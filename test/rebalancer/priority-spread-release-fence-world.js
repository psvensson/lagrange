// A small world for the ordinary-work release fence tests: rebalancers that
// share one hand-written readiness owner, one cached replica_operations
// projection, and one clock the test drives (nowFn); nothing sleeps.
import {EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {REBALANCER_LOG_MSG} from '../../src/rebalancer/rebalancer-constants.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  statePrioritySpreadReleaseReadiness,
} from './priority-spread-release-condition-fixture.js';
import {
  createTestRebalancer,
  initializeSpreadTestEnvironment,
} from './test-helpers.js';

const FENCE_TEST_NODE_ID = 'node-1';
const FENCE_REQUIRED_NODE_IDS = Object.freeze(['node-1', 'node-2', 'node-3']);
const FENCE_PRIORITY_PARTITION_ID = 'schema_operations-p1';
const FENCE_START_MS = 500_000;
const FENCE_BLOCKED_TO_CLEAR_MS = 1_000;
const NO_JITTER_DRAW = 0;

function createOperationCache(world) {
  return {
    get: (tableName, key) =>
      (tableName === SYSTEM_TABLE_NAME.PARTITIONS ?
        world.partitionRows[key] :
        undefined),
    getAll: () => [],
    filter: (tableName, predicate) => {
      if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
        return world.replicaOperations.filter(predicate);
      }
      return tableName === SYSTEM_TABLE_NAME.SERVICES ?
        world.services.filter(predicate) :
        [];
    },
  };
}

function buildOperationRow({
  operationId,
  type,
  partitionId,
  status,
  workflowStep,
  atMs,
}) {
  return {
    operation_id: operationId,
    type,
    partition_id: partitionId,
    entity_type: EntityType.PARTITION,
    entity_id: partitionId,
    replica_id: `${partitionId}-r4`,
    source_replica_id: `${partitionId}-r1`,
    source_node_id: FENCE_TEST_NODE_ID,
    target_node_id: 'node-2',
    status,
    workflow_step: workflowStep,
    created_at: atMs,
    updated_at: atMs,
    completed_at: null,
    error_message: null,
    steps_history: '[]',
  };
}

// A REPLACE whose add side converged and whose source removal is dispatched
// but not finished: the phase the planner's view leaves out.
function buildSourceRemovalReplace(operationId, partitionId, atMs) {
  return buildOperationRow({
    operationId,
    type: 'REPLACE',
    partitionId,
    status: 'active',
    workflowStep: 'ACTIVE',
    atMs,
  });
}

function completeReplace(operation, atMs) {
  operation.status = 'removed';
  operation.workflow_step = 'REMOVED';
  operation.updated_at = atMs;
  operation.completed_at = atMs;
}

function createFenceWorld() {
  initializeSpreadTestEnvironment(FENCE_TEST_NODE_ID);
  const world = {
    nowMs: FENCE_START_MS,
    replicaOperations: [],
    services: [],
    partitionRows: {},
    readinessOwner: {},
    prioritySpreadBlocker: {
      requiredDistinctNodeCount: FENCE_REQUIRED_NODE_IDS.length,
      blockedPartitions: [
        {partitionId: FENCE_PRIORITY_PARTITION_ID, spreadGap: 1},
      ],
    },
    rebalancers: [],
  };
  world.readiness = statePrioritySpreadReleaseReadiness(
    world.readinessOwner,
    FENCE_REQUIRED_NODE_IDS,
  );
  world.createRebalancer = (entityId) => {
    const rebalancer = createTestRebalancer({
      entityId,
      entityType: EntityType.PARTITION,
      nodeId: FENCE_TEST_NODE_ID,
      systemTableCache: createOperationCache(world),
      controlPlaneReadinessService: world.readinessOwner,
      nowFn: () => world.nowMs,
    });
    rebalancer.getControlPlanePrioritySpreadBlocker =
      () => world.prioritySpreadBlocker;
    rebalancer.randomSource = {random: () => NO_JITTER_DRAW};
    rebalancer.wakeReasons = [];
    rebalancer.enqueueRebalanceCheck = (reason) => {
      rebalancer.wakeReasons.push(reason);
      return true;
    };
    rebalancer.releaseLogs = [];
    rebalancer.logger = {
      info: (message, payload) => {
        if (message === REBALANCER_LOG_MSG.PRIORITY_SPREAD_FENCE_RELEASED) {
          rebalancer.releaseLogs.push(payload);
        }
      },
      debug: () => {},
      warn: () => {},
      error: () => {},
    };
    world.rebalancers.push(rebalancer);
    return rebalancer;
  };
  world.shutdown = () => {
    for (const rebalancer of world.rebalancers) {
      rebalancer.shutdown();
    }
  };
  return world;
}

// A gate decision's blocker and log context; an absent decision (released
// fence) reads as empty, so a field of it is undefined.
function blockerOf(decision) {
  return decision?.blocker ?? {};
}

function logContextOf(decision) {
  return decision?.logContext ?? {};
}

// Arm the shared fence with one blocked observation, then clear the spread
// blocker so later evaluations take the cleared-fence branch.
function armFenceThenClearSpread(world, rebalancer) {
  const blockedDecision = rebalancer.resolvePrioritySpreadPlanningGateDecision();
  world.prioritySpreadBlocker = null;
  world.nowMs += FENCE_BLOCKED_TO_CLEAR_MS;
  return blockedDecision;
}

export {
  FENCE_PRIORITY_PARTITION_ID,
  FENCE_REQUIRED_NODE_IDS,
  armFenceThenClearSpread,
  blockerOf,
  buildOperationRow,
  buildSourceRemovalReplace,
  completeReplace,
  createFenceWorld,
  logContextOf,
};
