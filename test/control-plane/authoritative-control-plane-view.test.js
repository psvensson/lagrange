import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {
  AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE,
  AuthoritativeControlPlaneView,
} from '../../src/control-plane/authoritative-control-plane-view.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

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
      CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      'authoritative fallback should stay on repairEligible routing',
    );
    t.match(
      String(call.options.queryOptions?.sessionId || ''),
      /^authoritative-control-plane-read:/,
      'authoritative fallback should isolate the SQL session',
    );
    t.equal(
      call.options.replicaFallbackConsistency,
      undefined,
      'authoritative reads must not trust follower replica fallback rows',
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
