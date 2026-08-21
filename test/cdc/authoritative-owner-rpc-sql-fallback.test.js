import {afterEach, beforeEach, test} from '../../src/test-helpers/tap.js';
import {
  CDCIntegrationService,
} from '../../src/cdc/cdc-integration-service.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  QUERY_ERROR_CODE,
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

const TEST_NODE_ID = 'test-node';
const TEST_SEED_NODE_ID = 'node-seed';
const TEST_AUTHORITATIVE_NODE_ID = 'node-owner-rpc-timeout-fallback';
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
const TEST_ROUTED_SQL_SOURCE = 'sql_query_engine';
const TEST_NODES_SQL = 'SELECT * FROM nodes WHERE node_id = ?';
const TEST_OWNER_RPC_SQL_FALLBACK_NAME =
  'CDCIntegrationService - owner-RPC preferred SQL fallback recovers ' +
  'timeout-shaped nodes reads through routed SQL';
const TEST_OWNER_RPC_MESSAGE_ONLY_SQL_FALLBACK_NAME =
  'CDCIntegrationService - owner-RPC preferred SQL fallback recovers ' +
  'message-only query-timeout-shaped nodes reads through routed SQL';
const TEST_OWNER_RPC_REPAIR_READ_LEADER_FIRST_NAME =
  'CDCIntegrationService - owner-RPC preferred repair reads do not force ' +
  'leader-first routing';
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

async function assertOwnerRpcSqlFallbackRecovers(t, ownerRpcFailure) {
  const ownerRpcReads = [];
  const sqlFallbackReads = [];
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
          _forRead,
          preferLeader,
          _preferSameLatencyGroup,
          options = {},
        ) {
          ownerRpcReads.push({partitionId, sql, params, preferLeader, options});
          return ownerRpcFailure;
        },
      },
      async executeQuery(sql, params = [], options = {}) {
        sqlFallbackReads.push({sql, params, options});
        return {
          success: true,
          rows: [{...TEST_AUTHORITATIVE_NODE_ROW}],
        };
      },
    },
    partitionServicesProvider: TEST_EMPTY_MAP_FACTORY,
  });
  service.initialize();
  service.setMessageRouter({
    getQueryDataPlaneTransportReadiness() {
      return TEST_LOCAL_QUERY_TRANSPORT_READINESS;
    },
  });

  const result = await service.executeAuthoritativeSystemTableRead(
    SYSTEM_TABLE_NAME.NODES,
    TEST_NODES_SQL,
    [TEST_AUTHORITATIVE_NODE_ID],
    {
      readAuthority: buildControlPlaneReadAuthority({
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE
            .OWNER_RPC_PREFERRED_SQL_FALLBACK,
        localReadConsistency: TEST_LOCAL_READ_CONSISTENCY,
      }),
      queryOptions: {timeoutMs: TEST_TIMEOUT_MS},
    },
  );

  t.equal(
    ownerRpcReads.length,
    1,
    'owner-rpc preferred reads should still attempt the owner lane first',
  );
  t.equal(
    ownerRpcReads[0]?.partitionId,
    INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES],
    'owner-rpc preferred reads should target the canonical nodes partition',
  );
  t.equal(
    sqlFallbackReads.length,
    1,
    'timeout-shaped owner-rpc failures should recover through routed SQL',
  );
  t.equal(
    result.success,
    true,
    'routed SQL fallback should recover the authoritative nodes read',
  );
  t.equal(
    result.source,
    TEST_ROUTED_SQL_SOURCE,
    'routed SQL fallback should surface the canonical SQL source',
  );
  t.equal(
    result.localReadHit,
    false,
    'routed SQL fallback should not report a local authoritative hit',
  );
  t.same(
    result.rows,
    [{...TEST_AUTHORITATIVE_NODE_ROW}],
    'routed SQL fallback should return the authoritative node rows',
  );
  t.equal(
    sqlFallbackReads[0]?.options?.routingReadinessDimension,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    'routed SQL fallback should preserve recovery-eligible routing',
  );
  t.equal(
    sqlFallbackReads[0]?.options?.timeoutMs,
    TEST_TIMEOUT_MS,
    'routed SQL fallback should preserve the query timeout budget',
  );
  t.equal(
    sqlFallbackReads[0]?.options?.preferLeader,
    false,
    'routed SQL fallback should avoid leader-first repair routing',
  );
}

test(TEST_OWNER_RPC_SQL_FALLBACK_NAME, async (t) => {
  await assertOwnerRpcSqlFallbackRecovers(t, {
    success: false,
    errorCode: QUERY_ERROR_CODE.ROUTER_MESSAGE_TIMEOUT,
    retryAfterMs: TEST_RETRY_AFTER_MS,
    rows: [],
  });
});

test(TEST_OWNER_RPC_MESSAGE_ONLY_SQL_FALLBACK_NAME, async (t) => {
  await assertOwnerRpcSqlFallbackRecovers(t, {
    success: false,
    error: TEST_QUERY_TIMEOUT_AFTER_MESSAGE,
    rows: [],
  });
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
            .OWNER_RPC_PREFERRED_SQL_FALLBACK,
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
