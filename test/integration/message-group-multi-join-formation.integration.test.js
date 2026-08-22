/**
 * Message Group Multi-Join Formation Integration Test.
 *
 * Verifies message-group creation and availability for each joining node
 * across a larger topology than seed + 2 nodes.
 */

import {test} from '../../src/test-helpers/tap.js';
import {request as httpRequest} from 'node:http';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {isNodeRecordReady} from '../../src/node/node-readiness-policy.js';
import {NodeService} from '../../src/node/node-service.js';
import {COLUMN, NODE_STATE, NUM, SERVICE_STATUS, SERVICE_TYPE, TABLES}
  from '../../src/constants/index.js';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  createInProcHttpPost,
  getUniquePort,
  TEST_CONFIG,
  waitFor,
  gracefulJoiningShutdown,
  gracefulShutdown,
} from './helpers/cluster-test-helpers.js';

const TEST_TIMEOUT_MS = 480000;
// A joining node's router self-connection can time out transiently when the
// single-process multi-node cluster saturates the event loop; the production
// entrypoint join loop retries retryable join failures, so the test does too.
const JOIN_ATTEMPTS_PER_NODE = 3;
const READY_WAIT_TIMEOUT_MS = 15000;
const MESSAGE_GROUP_WAIT_TIMEOUT_MS = 10000;
const POLL_INTERVAL_MS = 100;
const MIN_LOCAL_MESSAGE_GROUPS = 1;
// A distributed fan-out query over the 7-node single-process cluster can
// transiently exceed several seconds while readiness refresh churn saturates
// the shared event loop; give the admin probes room and retry them.
const ADMIN_HEALTH_WAIT_TIMEOUT_MS = 30000;
const ADMIN_QUERY_TIMEOUT_MS = 15000;

const HTTP_STATUS_OK = 200;
const LOCALHOST = '127.0.0.1';
const ADMIN_HEALTH_PATH = '/health';
const ADMIN_STREAM_PATH = '/api/admin/stream';
const ADMIN_MESSAGE_TYPE_QUERY = 'query';
const ADMIN_MESSAGE_TYPE_QUERY_RESULT = 'query_result';
const ADMIN_SMOKE_QUERY_SQL = 'SELECT node_id FROM nodes LIMIT 1';
const ADMIN_DISCOVERY_TABLE_NAME = 'nodes';
const ADMIN_DISCOVERY_SQL =
  'SELECT * FROM service_discovery_local(\'' + ADMIN_DISCOVERY_TABLE_NAME + '\')';
const ADMIN_DISCOVERY_SERVICE_ID = 'sys-postgres-wire';
const ADMIN_DISCOVERY_PROTOCOL = 'postgresql';
const ADMIN_DISCOVERY_HEALTHY_STATUS = 'healthy';

const SEED_NODE_ID = '550e8400-e29b-41d4-a716-446655440600';
const JOINING_NODE_IDS = Object.freeze([
  '550e8400-e29b-41d4-a716-446655440601',
  '550e8400-e29b-41d4-a716-446655440602',
  '550e8400-e29b-41d4-a716-446655440603',
  '550e8400-e29b-41d4-a716-446655440604',
  '550e8400-e29b-41d4-a716-446655440605',
  '550e8400-e29b-41d4-a716-446655440606',
]);

const JOINING_CONFIG = Object.freeze({
  httpTimeoutMs: NUM.FIVE_THOUSAND,
  leadershipWaitTimeoutMs: 12000,
  leadershipWaitInitialDelayMs: NUM.TEN,
  leadershipWaitMaxDelayMs: NUM.HUNDRED,
  replicaStaggerDelayMs: 20,
});

function getNodeMessageGroupRows(systemTableCache, nodeId) {
  return systemTableCache.filter(TABLES.SERVICES, (row) => {
    return row[COLUMN.NODE_ID] === nodeId &&
      row[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
      row[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE;
  }) || [];
}

function getNodeMessageGroupRowsAnyStatus(systemTableCache, nodeId) {
  return systemTableCache.filter(TABLES.SERVICES, (row) => {
    return row[COLUMN.NODE_ID] === nodeId &&
      row[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP;
  }) || [];
}

function hasHealthyLocalMessageGroup(service) {
  if (!service || typeof service.getStatus !== 'function') {
    return false;
  }
  const status = service.getStatus();
  const hasAddress = typeof service.unifiedAddress === 'string' &&
    service.unifiedAddress.length > 0;
  return Boolean(status?.initialized) && hasAddress;
}

function createQueryId() {
  return 'q-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

function resolveAdminApiPort(adminApi) {
  const listenerAddress = adminApi?.getFastify?.()?.server?.address?.();
  if (!listenerAddress || typeof listenerAddress !== 'object') {
    return 0;
  }
  return Number.isInteger(listenerAddress.port) && listenerAddress.port > 0 ?
    listenerAddress.port :
    0;
}

async function probeAdminHealth(port) {
  return new Promise((resolve) => {
    let settled = false;
    const complete = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const request = httpRequest({
      host: LOCALHOST,
      port,
      path: ADMIN_HEALTH_PATH,
      method: 'GET',
      headers: {
        Connection: 'close',
      },
      agent: false,
    }, (response) => {
      let rawBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        rawBody += chunk;
      });
      response.on('end', () => {
        let parsedBody = null;
        if (rawBody.length > 0) {
          try {
            parsedBody = JSON.parse(rawBody);
          } catch {
            parsedBody = null;
          }
        }
        complete({
          statusCode: Number.isInteger(response.statusCode) ?
            response.statusCode :
            null,
          body: parsedBody,
        });
      });
    });

    request.on('error', () => {
      complete({
        statusCode: null,
        body: null,
      });
    });

    request.setTimeout(ADMIN_QUERY_TIMEOUT_MS, () => {
      request.destroy();
      complete({
        statusCode: null,
        body: null,
      });
    });

    request.end();
  });
}

async function queryAdminWebSocket(port, sql) {
  const {default: WebSocket} = await import('ws');
  const endpoint = 'ws://' + LOCALHOST + ':' + port + ADMIN_STREAM_PATH;
  const queryId = createQueryId();

  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = new WebSocket(endpoint);
    const timeoutId = setTimeout(() => {
      finalize(new Error(
        'timed out waiting for admin query response on port ' + port,
      ));
    }, ADMIN_QUERY_TIMEOUT_MS);
    if (typeof timeoutId.unref === 'function') {
      timeoutId.unref();
    }

    const finalize = (error, rows = []) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      // ws close() is a no-op on an already-closed socket and does not
      // throw for a plain no-argument close, so no catch guard is needed.
      socket.close();
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    };

    socket.once('open', () => {
      try {
        socket.send(JSON.stringify({
          type: ADMIN_MESSAGE_TYPE_QUERY,
          queryId,
          sql,
          params: [],
        }));
      } catch (error) {
        finalize(error);
      }
    });

    socket.on('message', (data) => {
      let payload = null;
      try {
        payload = JSON.parse(data.toString());
      } catch {
        payload = null;
      }
      if (!payload || typeof payload !== 'object') {
        return;
      }
      if (payload.type !== ADMIN_MESSAGE_TYPE_QUERY_RESULT) {
        return;
      }
      if (payload.queryId !== queryId) {
        return;
      }
      if (typeof payload.error === 'string' && payload.error.length > 0) {
        finalize(new Error(payload.error));
        return;
      }
      finalize(null, Array.isArray(payload.results) ? payload.results : []);
    });

    socket.once('error', (error) => {
      finalize(error);
    });

    socket.once('close', () => {
      if (!settled) {
        finalize(new Error(
          'admin websocket closed before query result on port ' + port,
        ));
      }
    });
  });
}

function extractPostgresWireReplicas(discoveryRows) {
  const snapshot = discoveryRows[0];
  const services = Array.isArray(snapshot?.services) ? snapshot.services : [];
  const service = services.find((entry) => {
    if (!entry || typeof entry !== 'object') {
      return false;
    }
    if (entry.protocol !== ADMIN_DISCOVERY_PROTOCOL) {
      return false;
    }
    const serviceIds = Array.isArray(entry.serviceIds) ? entry.serviceIds : [];
    return serviceIds.includes(ADMIN_DISCOVERY_SERVICE_ID);
  });
  return Array.isArray(service?.replicas) ? service.replicas : [];
}

test('message group formation across multi-node joins', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  initializeTestEnvironment({
    rebalancer: {
      periodicCheckIntervalMs: 600000,
      periodicCheckJitterMs: NUM.HUNDRED,
      stabilizationPeriodMs: 10000,
    },
  });

  const seedWsPort = getUniquePort();
  const bootstrapService = new BootstrapService({
    nodeId: SEED_NODE_ID,
    nodeAddress: `ws://localhost:${seedWsPort}`,
    wsPort: seedWsPort,
    config: TEST_CONFIG.bootstrap,
  });

  let bootstrapResult = null;
  let seedApi = null;
  let seedQueryEngine = null;
  const joiningServices = [];
  const joiningServicesByNode = new Map();
  const joinResultsByNode = new Map();
  const adminApis = [];

  try {
    bootstrapResult = await bootstrapService.bootstrap();
    t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

    const systemTableCache = NodeService.getInstance().getSystemTableCache();
    t.ok(systemTableCache, 'system table cache should be available');

    seedApi = new BootstrapAPI({
      seedNodeId: SEED_NODE_ID,
      seedNodeAddress: `ws://localhost:${seedWsPort}`,
      seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
      messageGroupServices: bootstrapResult.messageGroupServices,
      partitionServices: bootstrapResult.partitionServices,
      systemTableCache,
      messageRouter: bootstrapResult.messageRouter,
      epochManager: bootstrapResult.epochManager,
      bootstrapService,
    });
    await seedApi.initialize(0, {listen: false});
    seedQueryEngine = new SQLQueryEngine({
      systemCache: systemTableCache,
      messageRouter: bootstrapResult.messageRouter,
      nodeId: SEED_NODE_ID,
    });
    seedApi.setSqlQueryEngine(seedQueryEngine);

    const httpPost = createInProcHttpPost(seedApi);
    const expectedReadyNodeCount = JOINING_NODE_IDS.length + 1;

    for (const joiningNodeId of JOINING_NODE_IDS) {
      let joiningService = null;
      let joinResult = null;
      for (let attempt = 1; attempt <= JOIN_ATTEMPTS_PER_NODE; attempt += 1) {
        const joiningWsPort = getUniquePort();
        joiningService = new NodeJoiningService({
          nodeId: joiningNodeId,
          nodeAddress: `ws://localhost:${joiningWsPort}`,
          seedNodeAddress: 'http://localhost:0',
          seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
          wsPort: joiningWsPort,
          config: {
            ...TEST_CONFIG.bootstrap,
            ...JOINING_CONFIG,
          },
          httpPost,
        });
        joiningServices.push(joiningService);

        joinResult = await joiningService.join();
        if (joinResult.success) {
          break;
        }
        t.comment(
          `join attempt ${attempt} failed for ${joiningNodeId}: ` +
            `${joinResult.error || 'unknown error'}`,
        );
        if (attempt < JOIN_ATTEMPTS_PER_NODE) {
          joiningServices.pop();
          await gracefulJoiningShutdown(joiningService);
          joiningService = null;
        }
      }
      joiningServicesByNode.set(joiningNodeId, joiningService);

      joinResultsByNode.set(joiningNodeId, joinResult);
      t.equal(joinResult.success, true, `${joiningNodeId} should join successfully`);
      if (!joinResult.success) {
        t.comment(`join failed for ${joiningNodeId}: ${joinResult.error || 'unknown error'}`);
        break;
      }
      t.ok(
        joinResult.messageGroupServices.size >= MIN_LOCAL_MESSAGE_GROUPS,
        `${joiningNodeId} should have at least one local message group service`,
      );

      const assignmentStrategy = joinResult.bootstrapResponse?.
        messageGroupAssignment?.
        strategy;
      const hasAssignmentStrategy = typeof assignmentStrategy === 'string' &&
        assignmentStrategy.length > 0;
      t.equal(
        hasAssignmentStrategy,
        true,
        `${joiningNodeId} should receive a message group assignment strategy`,
      );

      const localServices = [...joinResult.messageGroupServices.values()];
      const healthyLocalServices = localServices.filter((service) =>
        hasHealthyLocalMessageGroup(service),
      );
      t.ok(
        healthyLocalServices.length >= MIN_LOCAL_MESSAGE_GROUPS,
        `${joiningNodeId} should initialize healthy local message group service(s)`,
      );

      const lifecycleState = joinResult.lifecycleStateMachine?.getState?.();
      t.equal(
        lifecycleState,
        NODE_STATE.READY,
        `${joiningNodeId} lifecycle should transition to READY`,
      );
    }

    const allNodesReady = await waitFor(() => {
      const now = Date.now();
      const nodeRows = systemTableCache.getAll(TABLES.NODES) || [];
      const readyNodeIds = new Set(
        nodeRows
          .filter((row) => isNodeRecordReady(row, {now, requireActiveStatus: true}))
          .map((row) => row[COLUMN.NODE_ID]),
      );
      return readyNodeIds.size >= expectedReadyNodeCount &&
        readyNodeIds.has(SEED_NODE_ID) &&
        JOINING_NODE_IDS.every((nodeId) => readyNodeIds.has(nodeId));
    }, READY_WAIT_TIMEOUT_MS, POLL_INTERVAL_MS);
    t.equal(allNodesReady, true, 'seed and all joining nodes should reach ready state');

    for (const joiningNodeId of JOINING_NODE_IDS) {
      const hasCacheRows = await waitFor(() => {
        const rows = getNodeMessageGroupRows(systemTableCache, joiningNodeId);
        return rows.length >= MIN_LOCAL_MESSAGE_GROUPS;
      }, MESSAGE_GROUP_WAIT_TIMEOUT_MS, POLL_INTERVAL_MS);
      if (!hasCacheRows) {
        const seedRowsAnyStatus = getNodeMessageGroupRowsAnyStatus(
          systemTableCache,
          joiningNodeId,
        );
        const localSystemTableCache = joiningServicesByNode
          .get(joiningNodeId)?.cdcIntegrationService?.systemTableCache;
        const localRowsAnyStatus = localSystemTableCache ?
          getNodeMessageGroupRowsAnyStatus(localSystemTableCache, joiningNodeId) :
          [];
        t.comment(
          `[diag] missing active message-group rows for ${joiningNodeId}; ` +
          `seedRowsAnyStatus=${JSON.stringify(seedRowsAnyStatus.map((row) => ({
            serviceId: row[COLUMN.SERVICE_ID],
            status: row[COLUMN.STATUS],
            groupId: row[COLUMN.GROUP_ID],
            raftRole: row[COLUMN.RAFT_ROLE] || null,
          })))}; localRowsAnyStatus=${JSON.stringify(localRowsAnyStatus.map((row) => ({
            serviceId: row[COLUMN.SERVICE_ID],
            status: row[COLUMN.STATUS],
            groupId: row[COLUMN.GROUP_ID],
            raftRole: row[COLUMN.RAFT_ROLE] || null,
          })))}`,
        );
      }
      t.equal(
        hasCacheRows,
        true,
        `services cache should include active message group rows for ${joiningNodeId}`,
      );

      const rows = getNodeMessageGroupRows(systemTableCache, joiningNodeId);
      const allRowsAddressable = rows.every((row) =>
        typeof row[COLUMN.ADDRESS] === 'string' &&
        row[COLUMN.ADDRESS].length > 0,
      );
      t.equal(
        allRowsAddressable,
        true,
        `services cache rows for ${joiningNodeId} should include routable addresses`,
      );
    }

    const totalLocalMessageGroups = JOINING_NODE_IDS.reduce((count, nodeId) => {
      const joinResult = joinResultsByNode.get(nodeId);
      const localCount = joinResult?.messageGroupServices?.size || 0;
      return count + localCount;
    }, 0);
    t.ok(
      totalLocalMessageGroups >= JOINING_NODE_IDS.length,
      'multi-join run should create at least one local message-group replica per joiner',
    );

    const seedAdminApi = new AdminWebSocketAPI({
      nodeId: SEED_NODE_ID,
      systemTableCache,
      sqlQueryEngine: seedQueryEngine,
    });
    await seedAdminApi.initialize(0, {
      listen: true,
      host: LOCALHOST,
    });
    adminApis.push({
      nodeId: SEED_NODE_ID,
      adminApi: seedAdminApi,
    });

    for (const joiningNodeId of JOINING_NODE_IDS) {
      const joiningService = joiningServicesByNode.get(joiningNodeId);
      const joiningSystemTableCache =
        joiningService?.cdcIntegrationService?.systemTableCache;
      const joiningSqlQueryEngine =
        joiningService?.cdcIntegrationService?.sqlQueryEngine;
      t.ok(
        joiningSystemTableCache,
        `${joiningNodeId} should expose a system table cache for admin API`,
      );
      t.ok(
        joiningSqlQueryEngine,
        `${joiningNodeId} should expose an SQL query engine for admin API`,
      );
      if (!joiningSystemTableCache || !joiningSqlQueryEngine) {
        continue;
      }

      const joiningAdminApi = new AdminWebSocketAPI({
        nodeId: joiningNodeId,
        systemTableCache: joiningSystemTableCache,
        sqlQueryEngine: joiningSqlQueryEngine,
      });
      await joiningAdminApi.initialize(0, {
        listen: true,
        host: LOCALHOST,
      });
      adminApis.push({
        nodeId: joiningNodeId,
        adminApi: joiningAdminApi,
      });
    }

    for (const adminEntry of adminApis) {
      const adminNodeId = adminEntry.nodeId;
      const adminPort = resolveAdminApiPort(adminEntry.adminApi);
      t.ok(
        adminPort > 0,
        `${adminNodeId} admin API should bind a network port`,
      );
      if (!(adminPort > 0)) {
        continue;
      }

      const healthReady = await waitFor(async () => {
        const probe = await probeAdminHealth(adminPort);
        return probe.statusCode === HTTP_STATUS_OK &&
          probe.body?.status === 'healthy';
      }, ADMIN_HEALTH_WAIT_TIMEOUT_MS, POLL_INTERVAL_MS);
      t.equal(
        healthReady,
        true,
        `${adminNodeId} admin API /health should be reachable`,
      );

      let queryRows = [];
      let queryError = null;
      // Retry the smoke query: a single distributed read can time out
      // transiently while the in-process cluster is saturated.
      await waitFor(async () => {
        try {
          queryRows = await queryAdminWebSocket(
            adminPort,
            ADMIN_SMOKE_QUERY_SQL,
          );
          queryError = null;
          return true;
        } catch (error) {
          queryError = error;
          return false;
        }
      }, ADMIN_HEALTH_WAIT_TIMEOUT_MS, POLL_INTERVAL_MS);
      t.equal(
        queryError,
        null,
        `${adminNodeId} admin websocket query should succeed`,
      );
      if (!queryError) {
        t.ok(
          queryRows.length >= 1,
          `${adminNodeId} admin websocket should return node rows`,
        );
      }

      let latestDiscoveryReplicaSummary = null;
      const allReplicaReadinessReady = await waitFor(async () => {
        try {
          const discoveryRows = await queryAdminWebSocket(
            adminPort,
            ADMIN_DISCOVERY_SQL,
          );
          const replicas = extractPostgresWireReplicas(discoveryRows)
            .filter((replica) => {
              if (!replica || typeof replica !== 'object') {
                return false;
              }
              const replicaNodeId = String(replica.nodeId || '');
              if (!replicaNodeId) {
                return false;
              }
              const healthStatus = String(replica.healthStatus || '').toLowerCase();
              return healthStatus === ADMIN_DISCOVERY_HEALTHY_STATUS;
            });
          latestDiscoveryReplicaSummary = replicas.map((replica) => ({
            nodeId: replica.nodeId,
            routingReady: replica?.readiness?.routingReady,
            schemaReady: replica?.readiness?.schemaReady,
          }));
          if (replicas.length < expectedReadyNodeCount) {
            return false;
          }
          return replicas.every((replica) =>
            replica?.readiness?.routingReady === true &&
            replica?.readiness?.schemaReady === true,
          );
        } catch (_error) {
          return false;
        }
      }, ADMIN_HEALTH_WAIT_TIMEOUT_MS, POLL_INTERVAL_MS);

      t.equal(
        allReplicaReadinessReady,
        true,
        `${adminNodeId} table-scoped discovery should keep ` +
          'postgres-wire replicas route/schema ready',
      );
      if (!allReplicaReadinessReady) {
        t.comment(
          '[diag] ' + adminNodeId + ' readiness snapshot=' +
            JSON.stringify(latestDiscoveryReplicaSummary),
        );
      }
    }
  } finally {
    for (let index = adminApis.length - 1; index >= 0; index -= 1) {
      await adminApis[index].adminApi.shutdown().catch(() => {});
    }
    for (let index = joiningServices.length - 1; index >= 0; index -= 1) {
      await gracefulJoiningShutdown(joiningServices[index]);
    }
    await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
    await cleanupTestEnvironment();
  }
});
