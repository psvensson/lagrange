import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {createTestCoordinator} from './test-helpers.js';

const NODE_ID = 'formation-progress-seed';
const TARGET_NODE_ID = 'formation-progress-joiner';
const PARTITION_ID = 'sql_transactions-p1';
const OPERATION_ID = 'formation-cure-progress-op';
const REPLICA_ID = 'sql_transactions-p1-r4';
const OWNER_UNAVAILABLE_ERROR = 'fixture-owner-rpc-temporarily-unavailable';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: NODE_ID},
    logging: {level: 'error'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

test(
  'formation cure creation retains its canonical progress obligation when ' +
  'post-reservation operation authority is temporarily unavailable',
  async (t) => {
    initializeTestEnvironment();

    const coordinator = createTestCoordinator({
      nodeId: NODE_ID,
      autoProgressCreatedOperations: true,
      enableTimeouts: false,
    });
    const gateway = coordinator.controlPlaneSystemTableGateway;
    const originalExecuteQuery = gateway.executeQuery.bind(gateway);
    const originalReadAuthoritativeRows =
      gateway.readAuthoritativeRows.bind(gateway);

    let reservationInsertCount = 0;
    let operationInsertCount = 0;
    let postReservationOperationOwnerReadCount = 0;
    let reservationInserted = false;
    let operationAuthorityAvailable = false;
    const armedOperationIds = [];

    gateway.executeQuery = async (sql, params = [], options = {}) => {
      const statement = String(sql);
      if (statement.includes('INSERT INTO replica_operations')) {
        operationInsertCount += 1;
      }
      if (statement.includes('INSERT INTO storage_reservations')) {
        reservationInsertCount += 1;
        reservationInserted = true;
      }
      return originalExecuteQuery(sql, params, options);
    };

    gateway.readAuthoritativeRows = async (
      tableName,
      sql,
      params = [],
      options = {},
    ) => {
      if (
        reservationInserted &&
        tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
        operationAuthorityAvailable !== true
      ) {
        postReservationOperationOwnerReadCount += 1;
        return {
          success: false,
          rows: [],
          error: OWNER_UNAVAILABLE_ERROR,
          source: 'owner_rpc_lane',
        };
      }
      return originalReadAuthoritativeRows(
        tableName,
        sql,
        params,
        options,
      );
    };

    coordinator.workflowOwner.armCoordinatorCreatedOperation =
      async (operation) => {
        armedOperationIds.push(operation.operationId);
        return true;
      };

    try {
      const created = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: PARTITION_ID,
        entityType: 'partition',
        entityId: PARTITION_ID,
        nodeId: TARGET_NODE_ID,
        replicaIntentId: REPLICA_ID,
        operationIntentId: OPERATION_ID,
        operationCreationAdmission: {allowed: true},
        deferDispatchUntilBootstrapTopology: true,
        emitOperationCreated: true,
      });

      t.equal(
        created.operationId,
        OPERATION_ID,
        'the durable operation keeps the deterministic formation-cure identity',
      );
      t.equal(
        operationInsertCount,
        1,
        'exactly one durable operation CREATE is attempted',
      );
      t.equal(
        reservationInsertCount,
        1,
        'exactly one deterministic reservation INSERT is attempted',
      );
      t.same(
        armedOperationIds,
        [OPERATION_ID],
        'the persisted operation retains one canonical owner progress obligation',
      );
      t.equal(
        postReservationOperationOwnerReadCount,
        0,
        'aggregate control: creation does not insert a new unowned ' +
          'post-reservation authority wait before arming progress',
      );

      operationAuthorityAvailable = true;
      const durable = await coordinator.repository.queryOperationById(
        OPERATION_ID,
      );
      t.equal(
        durable?.operationId,
        OPERATION_ID,
        'the durable PENDING operation remains observable after authority returns',
      );
    } finally {
      await coordinator.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);
