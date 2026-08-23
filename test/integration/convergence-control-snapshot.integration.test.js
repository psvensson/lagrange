import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {waitForConvergence} from '../distributed/harness/assertions.js';
import {NODE_CLIENT_CONTROL_SNAPSHOT_SQL} from '../distributed/harness/constants.js';
import {
  cleanupTestEnvironment,
  getUniquePort,
  initializeTestEnvironment,
  waitFor,
} from './helpers/cluster-test-helpers.js';

const PARTICIPANT_FAILURE_ERROR =
  'Distributed operation failed due to participant failures';
const DISTRIBUTED_PARTICIPANT_FAILURE_CODE =
  'DISTRIBUTED_PARTICIPANT_FAILURE';
const SERVICES_QUERY = 'SELECT * FROM services WHERE service_type = \'partition\'';
const MOCK_REACHABILITY_SOURCE = 'admin_local';
const CONTROL_SNAPSHOT_TIMEOUT_MS = 120000;
const CONTROL_SNAPSHOT_POLL_INTERVAL_MS = 50;

function createQueryId() {
  return 'q-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

function createAdminBackedConvergenceNode(nodeId, adminApi) {
  const query = async (sql, params = []) => {
    const result = await adminApi.executeLocalQueryEnvelope({
      queryId: createQueryId(),
      sql,
      params,
    });
    if (result?.success === false) {
      throw new Error(result.error || 'Admin API query failed');
    }
    return {
      rows: Array.isArray(result?.rows) ? result.rows : [],
      count: result?.count,
      partitions: result?.partitions,
      tableName: result?.tableName,
    };
  };

  return {
    id: nodeId,
    getReachabilityDiagnostics: async () => ({
      nodeId,
      reachable: true,
      reachableBy: MOCK_REACHABILITY_SOURCE,
      lastError: null,
    }),
    query,
    getControlSnapshot: async () => query(NODE_CLIENT_CONTROL_SNAPSHOT_SQL),
  };
}

async function waitForControlSnapshotLeaderCoverage(node) {
  return waitFor(async () => {
    const snapshotResult = await node.getControlSnapshot();
    const rows = Array.isArray(snapshotResult?.rows) ? snapshotResult.rows : [];
    if (rows.length === 0) {
      return false;
    }

    const snapshot = rows[0];
    const partitions = Array.isArray(snapshot?.partitions) ?
      snapshot.partitions :
      [];
    if (partitions.length === 0) {
      return false;
    }

    const leaders = snapshot?.leaders && typeof snapshot.leaders === 'object' ?
      snapshot.leaders :
      {};
    return partitions.every((partitionId) => {
      const leader = leaders[String(partitionId)];
      return typeof leader === 'string' && leader.length > 0;
    });
  }, CONTROL_SNAPSHOT_TIMEOUT_MS, CONTROL_SNAPSHOT_POLL_INTERVAL_MS);
}

test('Convergence uses local control snapshot when distributed admin SQL reads fail',
  {timeout: 120000}, async (t) => {
    initializeTestEnvironment({
      raft: {
        electionTimeoutMinMs: 300,
        electionTimeoutMaxMs: 900,
        heartbeatIntervalMs: 75,
      },
      rebalancer: {
        periodicCheckIntervalMs: 4000,
        periodicCheckJitterMs: 500,
        criticalCheckDelayMs: 1000,
        stabilizationPeriodMs: 2000,
      },
      replicaHandler: {
        syncTimeoutMs: 15000,
      },
    });

    const seedNodeId = '550e8400-e29b-41d4-a716-446655440261';
    const seedWsPort = getUniquePort();
    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
    });

    let bootstrapResult = null;
    let adminApi = null;
    let restoreExecuteRequest = () => {};

    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');
      if (!bootstrapResult.success) {
        return;
      }

      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const sqlQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });

      adminApi = new AdminWebSocketAPI({
        nodeId: seedNodeId,
        systemTableCache,
        sqlQueryEngine,
      });
      await adminApi.initialize(0, {listen: false});

      const convergenceNode = createAdminBackedConvergenceNode(
        seedNodeId,
        adminApi,
      );
      const snapshotReady = await waitForControlSnapshotLeaderCoverage(
        convergenceNode,
      );
      t.equal(
        snapshotReady,
        true,
        'control snapshot should expose full leader coverage before fault injection',
      );
      if (!snapshotReady) {
        return;
      }

      const originalExecuteLocalQuery =
        adminApi.executeLocalQueryEnvelope.bind(adminApi);
      adminApi.executeLocalQueryEnvelope = async (payload, ctx) => {
        const statement = String(payload?.sql || '').toLowerCase();
        if (statement.includes('from services') ||
          statement.includes('from partitions') ||
          statement.includes('from replica_operations')) {
          return {
            success: false,
            errorCode: DISTRIBUTED_PARTICIPANT_FAILURE_CODE,
            error: PARTICIPANT_FAILURE_ERROR,
          };
        }
        return originalExecuteLocalQuery(payload, ctx);
      };
      restoreExecuteRequest = () => {
        adminApi.executeLocalQueryEnvelope =
          originalExecuteLocalQuery;
      };

      let servicesQueryError = null;
      try {
        await convergenceNode.query(SERVICES_QUERY);
      } catch (error) {
        servicesQueryError = error;
      }
      t.ok(
        servicesQueryError,
        'services query should fail after participant failure fault injection',
      );
      t.match(
        String(servicesQueryError?.message || ''),
        /participant failures/i,
        'services query failure should expose participant failure error',
      );

      const convergence = await waitForConvergence([convergenceNode], {
        settleTimeoutMs: 3000,
        quietWindowMs: 0,
        maxSustainedOverTargetMs: 2000,
        sampleIntervalMs: 50,
        targetVoterCount: 3,
      });
      t.equal(
        Number.isFinite(convergence?.settledAfterMs),
        true,
        'convergence should succeed using local control snapshots',
      );
      t.equal(
        Number.isFinite(convergence?.leaderChanges),
        true,
        'convergence result should include leader change count',
      );
    } finally {
      restoreExecuteRequest();
      if (adminApi) {
        await adminApi.shutdown().catch(() => {});
      }
      await bootstrapService.shutdown().catch(() => {});
      await cleanupTestEnvironment();
    }
  });
