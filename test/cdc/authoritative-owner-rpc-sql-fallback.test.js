import {afterEach, beforeEach, test} from '../../src/test-helpers/tap.js';
import {
  CDCIntegrationService,
} from '../../src/cdc/cdc-integration-service.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  QUERY_ERROR_MSG,
} from '../../src/query/query-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {buildControlPlaneReadAuthority} from
  '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {ROUTER_MESSAGE_TIMEOUT_ERROR_CODE} from '../../src/transport/transport-error-codes.js';

const TEST_NODE_ID = 'test-node';
const TEST_SEED_NODE_ID = 'node-seed';
const TEST_AUTHORITATIVE_NODE_ID = 'node-owner-rpc-timeout-recovery';
const TEST_NODE_STATUS = 'active';
const TEST_CONNECTION_STATE = 'ready';
const TEST_LOCAL_READ_CONSISTENCY = 'local_leader';
const TEST_TRANSPORT_READY = true;
const TEST_TIMEOUT_MS = 1234;
const TEST_RETRY_AFTER_MS = 250;
const TEST_QUERY_TIMEOUT_AFTER_MS = 3000;
const TEST_QUERY_TIMEOUT_AFTER_MESSAGE =
  `${QUERY_ERROR_MSG.QUERY_TIMEOUT_AFTER_PREFIX}${TEST_QUERY_TIMEOUT_AFTER_MS}` +
  QUERY_ERROR_MSG.QUERY_TIMEOUT_AFTER_SUFFIX;
const TEST_OWNER_RPC_SOURCE = 'owner_rpc_lane';
const TEST_NODES_SQL = 'SELECT * FROM nodes WHERE node_id = ?';
const TEST_OWNER_RPC_TIMEOUT_NAME =
  'CDCIntegrationService - a timeout-shaped owner read refuses SQL and heals through the same owner';
const TEST_OWNER_RPC_MESSAGE_ONLY_TIMEOUT_NAME =
  'CDCIntegrationService - a message-only owner timeout refuses SQL and heals through the same owner';
const TEST_OWNER_RPC_REPAIR_READ_LEADER_FIRST_NAME =
  'CDCIntegrationService - required owner-RPC repair reads preserve declared leader routing';
const TEST_ROUTING_SNAPSHOT_SERVICE_ROW_COUNT = 2;
const TEST_ROUTING_SNAPSHOT_ROUTABLE_SERVICE_COUNT = 2;
const TEST_LAST_HEARTBEAT_MS = 5000;
const TEST_READY_STATE = 'ready';
const TEST_LOCAL_QUERY_TRANSPORT_READINESS = Object.freeze({
  ready: TEST_TRANSPORT_READY,
  state: TEST_READY_STATE,
});
const TEST_ROUTING_SNAPSHOT = Object.freeze({
  canonicalLeaderNodeId: TEST_SEED_NODE_ID,
  serviceRowCount: TEST_ROUTING_SNAPSHOT_SERVICE_ROW_COUNT,
  routableServiceCount: TEST_ROUTING_SNAPSHOT_ROUTABLE_SERVICE_COUNT,
  deniedByNodeId: Object.freeze({}),
});
const TEST_AUTHORITATIVE_NODE_ROW = Object.freeze({
  node_id: TEST_AUTHORITATIVE_NODE_ID,
  status: TEST_NODE_STATUS,
  connection_state: TEST_CONNECTION_STATE,
  last_heartbeat: TEST_LAST_HEARTBEAT_MS,
});
const TEST_EMPTY_MAP_FACTORY = () => new Map();

beforeEach(() => {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

// The historical fixture required a different source to answer after an owner
// failure. The single-path contract retains that failure, then permits a new
// read through the same owner when it actually heals. SQL remains plausible bait.
async function assertOwnerRpcRecovery(t, ownerRpcFailure) {
  const ownerRpcReads = [];
  const sqlReads = [];
  let healed = false;
  const service = new CDCIntegrationService({
    nodeId: TEST_NODE_ID,
    sqlQueryEngine: {
      queryExecutor: {
        getPartitionRoutingSnapshot: () => TEST_ROUTING_SNAPSHOT,
        async executeOnPartition(partitionId, sql, params, forRead, preferLeader,
          preferSameLatencyGroup, options) {
          ownerRpcReads.push({partitionId, sql, params, forRead, preferLeader,
            preferSameLatencyGroup, options});
          return healed ? {success: true, rows: [{...TEST_AUTHORITATIVE_NODE_ROW}]} : ownerRpcFailure;
        },
      },
      async executeQuery(sql, params, options) {
        sqlReads.push({sql, params, options});
        return {success: true, rows: [{...TEST_AUTHORITATIVE_NODE_ROW}]};
      },
    },
    partitionServicesProvider: TEST_EMPTY_MAP_FACTORY,
  });
  service.initialize();
  service.setMessageRouter({
    getQueryDataPlaneTransportReadiness: () => TEST_LOCAL_QUERY_TRANSPORT_READINESS,
  });
  const options = {
    readAuthority: buildControlPlaneReadAuthority({
      authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      localReadConsistency: TEST_LOCAL_READ_CONSISTENCY,
    }),
    queryOptions: {timeoutMs: TEST_TIMEOUT_MS},
  };
  try {
    const failed = await service.executeAuthoritativeSystemTableRead(SYSTEM_TABLE_NAME.NODES,
      TEST_NODES_SQL, [TEST_AUTHORITATIVE_NODE_ID], options);
    t.equal(ownerRpcReads.length, 1, 'one requested owner attempt');
    t.equal(sqlReads.length, 0, 'an owner timeout never invokes ordinary SQL');
    t.equal(failed.success, false, 'the unavailable owner remains the failure');
    t.equal(failed.source, TEST_OWNER_RPC_SOURCE);
    t.equal(failed.localReadHit, false);
    t.same(failed.rows, []);
    t.equal(failed.errorCode, ownerRpcFailure.errorCode, 'preserve the original typed cause');
    t.equal(failed.error, ownerRpcFailure.error, 'preserve the original message-only cause');
    t.equal(failed.retryAfterMs, ownerRpcFailure.retryAfterMs, 'preserve the owner retry hint');
    healed = true;
    const recovered = await service.executeAuthoritativeSystemTableRead(SYSTEM_TABLE_NAME.NODES,
      TEST_NODES_SQL, [TEST_AUTHORITATIVE_NODE_ID], options);
    t.equal(recovered.success, true, 'the same owner can satisfy a later read after healing');
    t.equal(recovered.source, TEST_OWNER_RPC_SOURCE);
    t.same(recovered.rows, [{...TEST_AUTHORITATIVE_NODE_ROW}]);
    t.equal(ownerRpcReads.length, 2, 'healing does not introduce another execution lane');
    t.equal(sqlReads.length, 0);
    for (const read of ownerRpcReads) {
      t.equal(read.partitionId, INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES]);
      t.equal(read.sql, TEST_NODES_SQL);
      t.same(read.params, [TEST_AUTHORITATIVE_NODE_ID]);
      t.equal(read.options.routingReadinessDimension,
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE);
      t.equal(read.options.timeoutMs, TEST_TIMEOUT_MS);
      t.equal(read.preferLeader, false, 'the ANY leader contract does not acquire a leader pin');
    }
  } finally {
    service.markShuttingDown();
  }
}

test(TEST_OWNER_RPC_TIMEOUT_NAME, async (t) => {
  await assertOwnerRpcRecovery(t, {success: false, errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
    retryAfterMs: TEST_RETRY_AFTER_MS, rows: []});
});

test(TEST_OWNER_RPC_MESSAGE_ONLY_TIMEOUT_NAME, async (t) => {
  await assertOwnerRpcRecovery(t, {success: false, error: TEST_QUERY_TIMEOUT_AFTER_MESSAGE, rows: []});
});

test(TEST_OWNER_RPC_REPAIR_READ_LEADER_FIRST_NAME, async (t) => {
  const ownerRpcReads = [];
  const service = new CDCIntegrationService({
    nodeId: TEST_NODE_ID,
    sqlQueryEngine: {
      queryExecutor: {
        getPartitionRoutingSnapshot() {
          return TEST_ROUTING_SNAPSHOT;
        },
        async executeOnPartition(
          partitionId,
          sql,
          params = [],
          forRead,
          preferLeader,
          preferSameLatencyGroup,
          options = {},
        ) {
          ownerRpcReads.push({
            partitionId,
            sql,
            params,
            forRead,
            preferLeader,
            preferSameLatencyGroup,
            options,
          });
          return {
            success: true,
            rows: [{...TEST_AUTHORITATIVE_NODE_ROW}],
          };
        },
      },
    },
    partitionServicesProvider: TEST_EMPTY_MAP_FACTORY,
  });
  service.initialize();

  const result = await service.executeAuthoritativeSystemTableRead(
    SYSTEM_TABLE_NAME.NODES,
    TEST_NODES_SQL,
    [TEST_AUTHORITATIVE_NODE_ID],
    {
      readAuthority: buildControlPlaneReadAuthority({
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE
            .OWNER_RPC_REQUIRED,
      }),
      queryOptions: {timeoutMs: TEST_TIMEOUT_MS},
    },
  );

  t.equal(result.success, true, 'owner-rpc repair read should succeed');
  t.equal(ownerRpcReads.length, 1, 'repair read should use one owner-rpc call');
  t.equal(
    ownerRpcReads[0]?.partitionId,
    INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES],
    'repair read should target the canonical nodes partition',
  );
  t.equal(
    ownerRpcReads[0]?.forRead,
    true,
    'repair read should stay on the read execution path',
  );
  t.equal(
    ownerRpcReads[0]?.preferLeader,
    false,
    'owner-rpc repair reads should let routing pick a healthy replica first',
  );
  t.equal(
    ownerRpcReads[0]?.options?.timeoutMs,
    TEST_TIMEOUT_MS,
    'repair read should keep the caller timeout budget',
  );
});
