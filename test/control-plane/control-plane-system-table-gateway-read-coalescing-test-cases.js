import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  CONTROL_PLANE_READ_OUTCOME,
  CONTROL_PLANE_READ_STRATEGY,
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  buildControlPlaneReadAuthority,
} from '../../src/control-plane/control-plane-system-table-gateway-shared.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';

const GATEWAY_REPLICA_OPERATION_ID = 'op-gateway-1';
const GATEWAY_REPLICA_OPERATION_ID_TWO = 'op-gateway-2';
const GATEWAY_REPLICA_OPERATION_READ_COALESCING_KEY =
  'replica-operation:op-gateway-1';
const TEST_CACHE_COALESCING_KEY = 'explicit:cache-key';
const TEST_NODE_A = 'node-a';
const TEST_NODE_B = 'node-b';

function registerControlPlaneSystemTableGatewayReadCoalescingTests() {
  test('ControlPlaneSystemTableGateway keeps leader-pinned operation reads ' +
    'separate from concurrent generic reads', async (t) => {
    let releaseGenericRead = null;
    let markGenericReadStarted = null;
    const genericReadStarted = new Promise((resolve) => {
      markGenericReadStarted = resolve;
    });
    const executions = [];
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-gateway',
      cdcIntegrationService: {
        async executeAuthoritativeSystemTableRead(
          _tableName,
          _sql,
          _params,
          options,
        ) {
          executions.push(options);
          if (
            options?.readAuthority?.leaderMode ===
              CONTROL_PLANE_READ_LEADER_MODE.PREFERRED
          ) {
            return {
              success: true,
              rows: [{operation_id: GATEWAY_REPLICA_OPERATION_ID}],
            };
          }
          markGenericReadStarted();
          await new Promise((resolve) => {
            releaseGenericRead = resolve;
          });
          return {success: true, rows: []};
        },
      },
    });
    const sql = 'SELECT * FROM replica_operations WHERE operation_id = ?';
    const genericRead = gateway.readRows(
      TABLES.REPLICA_OPERATIONS,
      sql,
      [GATEWAY_REPLICA_OPERATION_ID],
      {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        coalescingKey: GATEWAY_REPLICA_OPERATION_READ_COALESCING_KEY,
      },
    );
    await genericReadStarted;
    const leaderPinnedRead = gateway.readRows(
      TABLES.REPLICA_OPERATIONS,
      sql,
      [GATEWAY_REPLICA_OPERATION_ID],
      {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        coalescingKey: GATEWAY_REPLICA_OPERATION_READ_COALESCING_KEY,
        leaderMode: CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
      },
    );

    await Promise.resolve();
    releaseGenericRead();
    const [genericResult, leaderPinnedResult] = await Promise.all([
      genericRead,
      leaderPinnedRead,
    ]);

    t.equal(executions.length, 2,
      'different leader-routing requirements should execute independently');
    t.equal(
      executions[0]?.readAuthority?.leaderMode,
      CONTROL_PLANE_READ_LEADER_MODE.ANY,
      'the generic operation read should keep the unpinned default',
    );
    t.equal(
      executions[1]?.readAuthority?.leaderMode,
      CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
      'the collision confirmation should execute with the leader pin',
    );
    t.equal(genericResult.rows.length, 0,
      'the generic read should retain its own empty observation');
    t.equal(leaderPinnedResult.rows.length, 1,
      'the leader-pinned read should retain the leader observation');
  });

  test('ControlPlaneSystemTableGateway does not coalesce unkeyed readFromCache or ' +
    'cachePredicate reads across different closures', async (t) => {
    const cache = new SystemTableCache();
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, CDC_OPERATION.INSERT, {
      operation_id: GATEWAY_REPLICA_OPERATION_ID,
      partition_id: 'logs-p1',
    });
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, CDC_OPERATION.INSERT, {
      operation_id: GATEWAY_REPLICA_OPERATION_ID_TWO,
      partition_id: 'service_bindings-p1',
    });
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {
      node_id: TEST_NODE_A,
      status: 'active',
    });
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {
      node_id: TEST_NODE_B,
      status: 'stopped',
    });

    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-gateway',
      systemTableCache: cache,
      pressureGovernor: {
        configure() {},
        async admit() {
          await Promise.resolve();
          return {action: 'allow', reason: 'test-allow'};
        },
      },
    });

    const [firstOpResult, secondOpResult] = await Promise.all([
      gateway.executeRead({
        tableName: TABLES.REPLICA_OPERATIONS,
        strategy: CONTROL_PLANE_READ_STRATEGY.CACHE,
        readFromCache: (systemCache) => {
          const row = systemCache.get(
            TABLES.REPLICA_OPERATIONS,
            GATEWAY_REPLICA_OPERATION_ID,
          );
          return row ? [row] : [];
        },
      }),
      gateway.executeRead({
        tableName: TABLES.REPLICA_OPERATIONS,
        strategy: CONTROL_PLANE_READ_STRATEGY.CACHE,
        readFromCache: (systemCache) => {
          const row = systemCache.get(
            TABLES.REPLICA_OPERATIONS,
            GATEWAY_REPLICA_OPERATION_ID_TWO,
          );
          return row ? [row] : [];
        },
      }),
    ]);

    t.equal(firstOpResult.outcome, CONTROL_PLANE_READ_OUTCOME.CACHE_HIT);
    t.equal(secondOpResult.outcome, CONTROL_PLANE_READ_OUTCOME.CACHE_HIT);
    t.equal(
      firstOpResult.rows[0]?.operation_id,
      GATEWAY_REPLICA_OPERATION_ID,
      'first readFromCache closure should retain its own row',
    );
    t.equal(
      secondOpResult.rows[0]?.operation_id,
      GATEWAY_REPLICA_OPERATION_ID_TWO,
      'second readFromCache closure must not coalesce onto the first closure result',
    );

    const [activeNodes, stoppedNodes] = await Promise.all([
      gateway.readProjectionRows(TABLES.NODES, {
        cachePredicate: (row) => row?.node_id === TEST_NODE_A,
      }),
      gateway.readProjectionRows(TABLES.NODES, {
        cachePredicate: (row) => row?.node_id === TEST_NODE_B,
      }),
    ]);

    t.same(
      activeNodes.rows.map((row) => row.node_id),
      [TEST_NODE_A],
      'first cachePredicate read must retain node-a',
    );
    t.same(
      stoppedNodes.rows.map((row) => row.node_id),
      [TEST_NODE_B],
      'second cachePredicate read must retain node-b',
    );
    t.equal(
      gateway.getStats().metrics.readSingleFlightJoinCount,
      0,
      'unkeyed closure-backed cache reads must never join in-flight requests',
    );
  });

  test('ControlPlaneSystemTableGateway buildReadRequestKey skips implicit coalescing ' +
    'for unkeyed cache and bootstrap closures while preserving explicit keys',
  async (t) => {
    const gateway = new ControlPlaneSystemTableGateway({nodeId: 'node-gateway'});
    const readAuthority = buildControlPlaneReadAuthority({});

    t.equal(
      gateway.buildReadRequestKey(TABLES.REPLICA_OPERATIONS, null, [], {
        readAuthority,
        readFromCache: () => [],
      }),
      null,
      'unkeyed readFromCache should bypass coalescing',
    );
    t.equal(
      gateway.buildReadRequestKey(TABLES.NODES, null, [], {
        readAuthority,
        cachePredicate: () => true,
      }),
      null,
      'unkeyed cachePredicate should bypass coalescing',
    );
    t.equal(
      gateway.buildReadRequestKey(TABLES.NODES, null, [], {
        readAuthority,
        readBootstrapSnapshot: () => [],
      }),
      null,
      'unkeyed readBootstrapSnapshot should bypass coalescing',
    );
    t.equal(
      gateway.buildReadRequestKey(TABLES.NODES, null, [], {
        readAuthority,
        bootstrapSnapshotRows: [{node_id: TEST_NODE_A}],
      }),
      null,
      'unkeyed bootstrapSnapshotRows should bypass coalescing',
    );
    t.type(
      gateway.buildReadRequestKey(TABLES.REPLICA_OPERATIONS, null, [], {
        readAuthority,
        readFromCache: () => [],
        coalescingKey: TEST_CACHE_COALESCING_KEY,
      }),
      'string',
      'explicit coalescingKey should still generate a scoped request key',
    );
  });
}

export {registerControlPlaneSystemTableGatewayReadCoalescingTests};
