/**
 * Focused startup replay regression for cached replica_operations dispatch.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ReplicaDispatchService} from
  '../../src/control-plane/replica-dispatch-service.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';

const TEST_NODE_ID = 'node-1';
const TEST_SOURCE_NODE_ID = 'node-2';
const TEST_OPERATION_ID = 'startup-replay-op-1';
const TEST_PARTITION_ID = 'control_plane_publications-p1';
const TEST_REPLICA_ID = 'control_plane_publications-p1-r4';
const TEST_OPERATION_STATUS = 'pending';
const TEST_EMPTY_STEPS_HISTORY = '[]';
const TEST_LOG_LEVEL_ERROR = 'error';
const TEST_QUEUE_DRAIN_TICKS = 8;
const TEST_DRAIN_INITIAL_INDEX = 0;
const TEST_DRAIN_INCREMENT = 1;
const TEST_EXPECTED_SINGLE_DISPATCH_COUNT = 1;
const TEST_FIRST_DISPATCH_INDEX = 0;
const TEST_OBSERVED_EVENT_CACHE_GET = 'cache-get';
const TEST_OBSERVED_EVENT_CACHE_GET_ALL = 'cache-get-all';
const TEST_OBSERVED_EVENT_CACHE_LISTENER_REGISTERED =
  'cache-listener-registered';
const TEST_NAME_STARTUP_REPLAYS_CACHED_PENDING =
  'ReplicaDispatchService initializes by dispatching locally owned cached ' +
  'PENDING replica_operations rows';
const TEST_ASSERT_DISPATCHED_ON_STARTUP =
  'startup replay should dispatch the cached pending operation';
const TEST_ASSERT_DISPATCHED_OPERATION_ID =
  'startup replay should dispatch the cached operation id';
const TEST_ASSERT_COORDINATOR_LISTENER_NOT_TRIGGER =
  'coordinator listener should be registered but not needed to trigger replay';
const TEST_ASSERT_CACHE_DIRECT_SCAN =
  'startup replay should inspect cached replica_operations rows directly';

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({logging: {level: TEST_LOG_LEVEL_ERROR}});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: TEST_LOG_LEVEL_ERROR});
  }
}

async function waitForQueueDrain() {
  for (
    let tick = TEST_DRAIN_INITIAL_INDEX;
    tick < TEST_QUEUE_DRAIN_TICKS;
    tick += TEST_DRAIN_INCREMENT
  ) {
    await Promise.resolve();
  }
}

test(TEST_NAME_STARTUP_REPLAYS_CACHED_PENDING,
  async (t) => {
    initEnv();

    const observedEvents = [];
    const operationRow = {
      operation_id: TEST_OPERATION_ID,
      type: OperationType.REPLACE,
      partition_id: TEST_PARTITION_ID,
      entity_type: SERVICE_TYPE.PARTITION,
      entity_id: TEST_PARTITION_ID,
      replica_id: TEST_REPLICA_ID,
      source_node_id: TEST_SOURCE_NODE_ID,
      target_node_id: TEST_NODE_ID,
      status: TEST_OPERATION_STATUS,
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: Date.now(),
      updated_at: Date.now(),
      steps_history: TEST_EMPTY_STEPS_HISTORY,
    };
    const serviceRow = {
      [COLUMN.NODE_ID]: TEST_NODE_ID,
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    };
    const dispatchedOperations = [];
    const coordinatorListeners = [];
    const service = new ReplicaDispatchService({
      nodeId: TEST_NODE_ID,
      messageRouter: {},
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      systemTableCache: {
        get: (tableName, key) => {
          observedEvents.push({
            type: TEST_OBSERVED_EVENT_CACHE_GET,
            tableName,
            key,
          });
          if (
            tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
          key === TEST_OPERATION_ID
          ) {
            return operationRow;
          }
          return null;
        },
        getAll: (tableName) => {
          observedEvents.push({
            type: TEST_OBSERVED_EVENT_CACHE_GET_ALL,
            tableName,
          });
          if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
            return [operationRow];
          }
          if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
            return [serviceRow];
          }
          return [];
        },
        onCacheChange: (listener) => {
          observedEvents.push({
            type: TEST_OBSERVED_EVENT_CACHE_LISTENER_REGISTERED,
            listener,
          });
        },
        offCacheChange: () => {},
      },
      rebalanceCoordinator: {
        on: (eventName, listener) => {
          coordinatorListeners.push({eventName, listener});
        },
        off: () => {},
        resolveOperationOwnerNodeId: (operation) => operation?.target_node_id ||
        operation?.targetNodeId ||
        null,
        dispatchOperation: async (operation) => {
          dispatchedOperations.push(operation);
          return {success: true};
        },
      },
    });

    service.initialize();
    await waitForQueueDrain();

    t.equal(
      dispatchedOperations.length,
      TEST_EXPECTED_SINGLE_DISPATCH_COUNT,
      TEST_ASSERT_DISPATCHED_ON_STARTUP,
    );
    t.equal(
      dispatchedOperations[TEST_FIRST_DISPATCH_INDEX]?.operationId,
      TEST_OPERATION_ID,
      TEST_ASSERT_DISPATCHED_OPERATION_ID,
    );
    t.equal(
      coordinatorListeners.length,
      TEST_EXPECTED_SINGLE_DISPATCH_COUNT,
      TEST_ASSERT_COORDINATOR_LISTENER_NOT_TRIGGER,
    );
    t.same(
      observedEvents.filter((event) =>
        event.type === TEST_OBSERVED_EVENT_CACHE_GET_ALL &&
      event.tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS),
      [{
        type: TEST_OBSERVED_EVENT_CACHE_GET_ALL,
        tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      }],
      TEST_ASSERT_CACHE_DIRECT_SCAN,
    );

    service.stop();
  });
