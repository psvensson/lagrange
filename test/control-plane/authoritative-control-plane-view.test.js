import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {
  AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE,
  AuthoritativeControlPlaneView,
} from '../../src/control-plane/authoritative-control-plane-view.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  PRESSURE_WORK_CLASS,
} from '../../src/control-plane/pressure-governor.js';

const FIXTURE_NODE_ID = 'node-a';
const FIXTURE_LOCAL_NODE_ID = 'node-local';
const FIXTURE_NOW_MS = 2000;
const FIXTURE_LAST_HEARTBEAT_MS = 1700;

test('AuthoritativeControlPlaneView reads canonical node/service evidence ' +
  'through the authoritative owner path', async (t) => {
  const calls = [];
  const view = new AuthoritativeControlPlaneView({
    nodeId: FIXTURE_LOCAL_NODE_ID,
    now: () => FIXTURE_NOW_MS,
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        options,
      ) {
        calls.push({tableName, sql, params, options});
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [{
              node_id: FIXTURE_NODE_ID,
              last_heartbeat: FIXTURE_LAST_HEARTBEAT_MS,
            }],
            source: 'sql_query_engine',
          };
        }
        return {
          success: true,
          rows: [{
            service_id: 'svc-1',
            node_id: FIXTURE_NODE_ID,
            status: 'ACTIVE',
          }],
          source: 'local_partition_replica',
        };
      },
    },
  });

  const snapshot = await view.readNodeSnapshot(FIXTURE_NODE_ID);

  t.equal(calls.length, 2, 'nodes and services must both be read');
  for (const call of calls) {
    t.equal(
      call.options.localReadConsistency,
      'local_leader',
      'authoritative reads must start from the leader-local consistency',
    );
    t.equal(
      call.options.allowSqlFallback,
      true,
      'authoritative reads may route through the canonical SQL path',
    );
    t.equal(
      call.options.queryOptions?.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      'authoritative fallback should stay on control-plane recovery routing',
    );
    t.match(
      String(call.options.queryOptions?.sessionId || ''),
      /^authoritative-control-plane-read:/,
      'authoritative fallback should isolate the SQL session',
    );
    t.equal(
      call.options.replicaFallbackConsistency,
      'any_replica',
      'node/service repair should retry against a local replica before routed SQL',
    );
  }

  t.equal(snapshot.nodeId, FIXTURE_NODE_ID);
  t.equal(snapshot.nodeRow.node_id, FIXTURE_NODE_ID);
  t.equal(snapshot.snapshotVersion, FIXTURE_LAST_HEARTBEAT_MS);
  t.equal(snapshot.freshness.lastHeartbeat, FIXTURE_LAST_HEARTBEAT_MS);
  t.equal(
    snapshot.freshness.heartbeatAgeMs,
    FIXTURE_NOW_MS - FIXTURE_LAST_HEARTBEAT_MS,
  );
  t.equal(
    snapshot.tables.nodes.source,
    AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.SQL_QUERY_ENGINE,
  );
  t.equal(
    snapshot.tables.services.source,
    AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.LOCAL_PARTITION_REPLICA,
  );
  t.equal(
    snapshot.source,
    AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.MIXED,
    'snapshot should retain mixed-source visibility diagnostics',
  );
});

test('AuthoritativeControlPlaneView readNodeSnapshot enables bounded ' +
  'any-replica fallback before routed SQL for node/service repair',
async (t) => {
  const calls = [];
  const view = new AuthoritativeControlPlaneView({
    nodeId: FIXTURE_LOCAL_NODE_ID,
    now: () => FIXTURE_NOW_MS,
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        options,
      ) {
        calls.push({tableName, sql, params, options});
        if (options?.replicaFallbackConsistency !== 'any_replica') {
          return {
            success: false,
            error: 'authoritative_row_source_unavailable',
            rows: [],
          };
        }
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [{
              node_id: FIXTURE_NODE_ID,
              last_heartbeat: FIXTURE_LAST_HEARTBEAT_MS,
            }],
            source: 'local_partition_replica',
          };
        }
        return {
          success: true,
          rows: [{
            service_id: 'svc-1',
            node_id: FIXTURE_NODE_ID,
            status: 'ACTIVE',
          }],
          source: 'local_partition_replica',
        };
      },
    },
  });

  const snapshot = await view.readNodeSnapshot(FIXTURE_NODE_ID);

  t.equal(snapshot.tables.nodes.success, true,
    'node evidence should succeed through the bounded local follower fallback');
  t.equal(snapshot.tables.services.success, true,
    'service evidence should succeed through the bounded local follower fallback');
  t.equal(snapshot.tables.nodes.source,
    AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.LOCAL_PARTITION_REPLICA,
    'node repair should avoid routed SQL when a local replica can satisfy it');
  t.equal(snapshot.tables.services.source,
    AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.LOCAL_PARTITION_REPLICA,
    'service repair should avoid routed SQL when a local replica can satisfy it');
  for (const call of calls) {
    t.equal(
      call.options?.replicaFallbackConsistency,
      'any_replica',
      'node/service repair should request bounded any-replica fallback before routed SQL',
    );
  }
});

test('AuthoritativeControlPlaneView coalesces identical in-flight table reads',
  async (t) => {
    const calls = [];
    let releaseRead = null;
    const readBlocked = new Promise((resolve) => {
      releaseRead = resolve;
    });
    const view = new AuthoritativeControlPlaneView({
      nodeId: FIXTURE_LOCAL_NODE_ID,
      cdcIntegrationService: {
        async executeAuthoritativeSystemTableRead(
          tableName,
          sql,
          params,
        ) {
          calls.push({tableName, sql, params});
          await readBlocked;
          return {
            success: true,
            rows: [{node_id: FIXTURE_NODE_ID}],
            source: 'local_partition_replica',
          };
        },
      },
    });

    const firstRead = view.readRows(
      TABLES.NODES,
      `SELECT * FROM ${TABLES.NODES} WHERE node_id = ?`,
      [FIXTURE_NODE_ID],
    );
    const secondRead = view.readRows(
      TABLES.NODES,
      `SELECT * FROM ${TABLES.NODES} WHERE node_id = ?`,
      [FIXTURE_NODE_ID],
    );
    await Promise.resolve();

    t.equal(
      calls.length,
      1,
      'concurrent identical reads should share one authoritative in-flight read',
    );

    releaseRead();
    const [firstResult, secondResult] = await Promise.all([
      firstRead,
      secondRead,
    ]);
    t.same(
      secondResult,
      firstResult,
      'coalesced callers should observe the same authoritative result',
    );

    await view.readRows(
      TABLES.NODES,
      `SELECT * FROM ${TABLES.NODES} WHERE node_id = ?`,
      [FIXTURE_NODE_ID],
    );
    t.equal(
      calls.length,
      2,
      'settled in-flight reads should be cleared so later callers can refresh',
    );
  });

test('AuthoritativeControlPlaneView coalesces concurrent readNodeSnapshot calls',
  async (t) => {
    const calls = [];
    let releaseReads = null;
    const readsBlocked = new Promise((resolve) => {
      releaseReads = resolve;
    });
    const view = new AuthoritativeControlPlaneView({
      nodeId: FIXTURE_LOCAL_NODE_ID,
      cdcIntegrationService: {
        async executeAuthoritativeSystemTableRead(
          tableName,
          sql,
          params,
        ) {
          calls.push({tableName, sql, params});
          await readsBlocked;
          if (tableName === TABLES.NODES) {
            return {
              success: true,
              rows: [{
                node_id: FIXTURE_NODE_ID,
                last_heartbeat: FIXTURE_LAST_HEARTBEAT_MS,
              }],
              source: 'local_partition_replica',
            };
          }
          return {
            success: true,
            rows: [{
              service_id: 'svc-1',
              node_id: FIXTURE_NODE_ID,
              status: 'ACTIVE',
            }],
            source: 'local_partition_replica',
          };
        },
      },
    });

    const firstSnapshot = view.readNodeSnapshot(FIXTURE_NODE_ID);
    const secondSnapshot = view.readNodeSnapshot(FIXTURE_NODE_ID);
    await Promise.resolve();

    t.equal(
      calls.length,
      2,
      'concurrent node snapshots should issue one authoritative read per table, not per caller',
    );

    releaseReads();
    const [firstResult, secondResult] = await Promise.all([
      firstSnapshot,
      secondSnapshot,
    ]);
    t.same(
      secondResult,
      firstResult,
      'coalesced snapshot callers should observe the same authoritative snapshot',
    );
  });

test('AuthoritativeControlPlaneView readRows fails with typed degraded result ' +
  'when pressure disables SQL fallback', async (t) => {
  const calls = [];
  const view = new AuthoritativeControlPlaneView({
    nodeId: FIXTURE_LOCAL_NODE_ID,
    messageRouter: {
      getOutboundPressureSummary() {
        return {
          backpressured: true,
          saturatedNodeCount: 1,
          totalPending: 64,
          maxPendingUtilization: 1,
        };
      },
    },
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        options,
      ) {
        calls.push({tableName, sql, params, options});
        return {
          success: false,
          error: 'authoritative owner unavailable',
          rows: [],
        };
      },
    },
  });

  const result = await view.readRows(
    TABLES.NODES,
    `SELECT * FROM ${TABLES.NODES} WHERE node_id = ?`,
    [FIXTURE_NODE_ID],
    {
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
    },
  );

  t.equal(calls.length, 1, 'authoritative owner path should still run once');
  t.equal(
    calls[0].options.allowSqlFallback,
    false,
    'pressure degrade should disable routed SQL fallback',
  );
  t.equal(result.success, false, 'degraded read should fail closed');
  t.equal(
    result.errorCode,
    'CONTROL_PLANE_PRESSURE_DEGRADED',
    'view should return a typed degraded result',
  );
});
