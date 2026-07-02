/**
 * Integration test: preflight critical-path hop coverage.
 *
 * Validates the three critical hops needed for strict preload readiness:
 * 1. Service registration yields discoverable sys-postgres-wire rows.
 * 2. CDC forwarding advances cache watermarks.
 * 3. Service discovery returns sys-postgres-wire endpoints once caches are healthy.
 *
 * Requirements: 5.1, 5.2, 5.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {v4 as uuidv4} from 'uuid';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {ADMIN_SERVICE_DISCOVERY} from '../../src/admin/admin-constants.js';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';
import {
  CDC_OPERATION,
  COLUMN,
  NUM,
  TABLES,
  TYPEOF,
} from '../../src/constants/index.js';
import {
  EP_COL,
  EP_ID_SEPARATOR,
} from '../../src/wasm-service/service-endpoint-builder.js';
import {
  WASM_SERVICE_HEALTH_STATUS,
  WASM_SERVICE_PROTOCOL,
} from '../../src/wasm-service/wasm-service-constants.js';
import {
  cleanupTestEnvironment,
  createInProcHttpPost,
  getUniquePort,
  gracefulJoiningShutdown,
  gracefulShutdown,
  initializeTestEnvironment,
  TEST_CONFIG,
  waitFor,
} from './helpers/cluster-test-helpers.js';

const TEST_TIMEOUT_MS = 30000;
const REBALANCER_IDLE_INTERVAL_MS = 600000;
const REBALANCER_STABILIZATION_MS = 10000;
const JOIN_LEADERSHIP_WAIT_TIMEOUT_MS = 8000;
const WAIT_TIMEOUT_MS = 10000;
const POLL_INTERVAL_MS = 50;
const SERVICE_DISCOVERY_QUERY_PREFIX = 'SELECT * FROM service_discovery_local';
const METADATA_MIN_LENGTH = 1;

function getAllMessageGroupServices(bootstrapResult, joinResults) {
  const seedMessageGroups = bootstrapResult?.messageGroupServices ?
    [...bootstrapResult.messageGroupServices.values()] :
    [];
  const joinMessageGroups = [];
  if (Array.isArray(joinResults)) {
    for (const joinResult of joinResults) {
      if (!joinResult?.messageGroupServices) {
        continue;
      }
      joinMessageGroups.push(...joinResult.messageGroupServices.values());
    }
  }
  return [...seedMessageGroups, ...joinMessageGroups];
}

function selectFollowerMessageGroup(messageGroups) {
  for (const messageGroup of messageGroups) {
    if (!messageGroup ||
        typeof messageGroup.isCurrentRaftLeader !== 'function') {
      continue;
    }
    if (!Array.isArray(messageGroup.replicaIds) ||
        messageGroup.replicaIds.length <= 1) {
      continue;
    }
    if (messageGroup.isCurrentRaftLeader()) {
      continue;
    }
    const leaderId = typeof messageGroup.getLeaderId === 'function' ?
      messageGroup.getLeaderId() :
      messageGroup.leaderId;
    if (!leaderId) {
      continue;
    }
    return messageGroup;
  }
  return null;
}

function buildPostgresWireEndpointId(nodeId) {
  return META_SERVICE_ID.POSTGRES_WIRE + EP_ID_SEPARATOR + nodeId;
}

function assertEndpointRow(t, row, expectedNodeId) {
  t.equal(row[EP_COL.SERVICE_ID], META_SERVICE_ID.POSTGRES_WIRE, 'service_id matches');
  t.equal(row[EP_COL.NODE_ID], expectedNodeId, 'node_id matches');
  t.equal(row[EP_COL.PROTOCOL], WASM_SERVICE_PROTOCOL.POSTGRESQL, 'protocol matches');
  t.equal(row[EP_COL.HEALTH_STATUS], WASM_SERVICE_HEALTH_STATUS.HEALTHY, 'endpoint healthy');
  t.equal(
    typeof row[EP_COL.PORT],
    TYPEOF.NUMBER,
    'port should be a number',
  );
  t.ok(Number.isInteger(row[EP_COL.PORT]) && row[EP_COL.PORT] > 0, 'port should be > 0');
  t.equal(
    typeof row[EP_COL.METADATA],
    TYPEOF.STRING,
    'metadata should be a JSON string',
  );
  t.ok(
    row[EP_COL.METADATA].length >= METADATA_MIN_LENGTH,
    'metadata should be non-empty',
  );
  let parsedMetadata = null;
  try {
    parsedMetadata = JSON.parse(row[EP_COL.METADATA]);
  } catch {
    parsedMetadata = null;
  }
  t.ok(parsedMetadata, 'metadata should be parseable JSON');
}

function buildServiceDiscoveryQuery(tableName) {
  const normalized = String(tableName || '');
  if (normalized.length === 0) {
    return SERVICE_DISCOVERY_QUERY_PREFIX + '()';
  }
  return `${SERVICE_DISCOVERY_QUERY_PREFIX}('${normalized}')`;
}

test('preflight critical-path hop integration', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  initializeTestEnvironment({
    rebalancer: {
      periodicCheckIntervalMs: REBALANCER_IDLE_INTERVAL_MS,
      periodicCheckJitterMs: NUM.HUNDRED,
      stabilizationPeriodMs: REBALANCER_STABILIZATION_MS,
    },
  });

  const seedNodeId = uuidv4();
  const joiningNodeIds = [uuidv4(), uuidv4()];
  const seedWsPort = getUniquePort();
  const joiningWsPorts = joiningNodeIds.map(() => getUniquePort());

  const bootstrapService = new BootstrapService({
    nodeId: seedNodeId,
    nodeAddress: `ws://localhost:${seedWsPort}`,
    wsPort: seedWsPort,
    config: {
      ...TEST_CONFIG.bootstrap,
      leadershipWaitTimeoutMs: JOIN_LEADERSHIP_WAIT_TIMEOUT_MS,
    },
  });

  let bootstrapResult = null;
  let seedApi = null;
  let seedQueryEngine = null;
  const joiningServices = [];
  const joinResults = [];
  let adminApi = null;

  try {
    bootstrapResult = await bootstrapService.bootstrap();
    t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

    const systemTableCache = NodeService.getInstance().getSystemTableCache();
    t.ok(systemTableCache, 'system table cache should be available');

    seedApi = new BootstrapAPI({
      seedNodeId: seedNodeId,
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
      nodeId: seedNodeId,
    });
    seedApi.setSqlQueryEngine(seedQueryEngine);

    const httpPost = createInProcHttpPost(seedApi);
    for (let index = 0; index < joiningNodeIds.length; index += 1) {
      const joiningNodeId = joiningNodeIds[index];
      const joiningWsPort = joiningWsPorts[index];
      const joiningService = new NodeJoiningService({
        nodeId: joiningNodeId,
        nodeAddress: `ws://localhost:${joiningWsPort}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort,
        config: {
          ...TEST_CONFIG.bootstrap,
          leadershipWaitTimeoutMs: JOIN_LEADERSHIP_WAIT_TIMEOUT_MS,
        },
        httpPost,
      });
      joiningServices.push(joiningService);

      const joinResult = await joiningService.join();
      joinResults.push(joinResult);
      t.equal(
        joinResult.success,
        true,
        `joining node ${joiningNodeId} should join successfully`,
      );
    }

    await t.test('service registration produces sys-postgres-wire rows', async (t) => {
      const definition = systemTableCache.get(
        TABLES.SERVICE_DEFINITIONS,
        META_SERVICE_ID.POSTGRES_WIRE,
      );
      t.ok(definition, 'sys-postgres-wire definition should exist');
      t.equal(
        definition?.[COLUMN.SERVICE_ID],
        META_SERVICE_ID.POSTGRES_WIRE,
        'definition service_id should match',
      );

      const nodeIds = [seedNodeId, ...joiningNodeIds];
      const endpointIds = nodeIds.map((nodeId) => buildPostgresWireEndpointId(nodeId));

      const endpointsReady = await waitFor(() => {
        return endpointIds.every((endpointId) =>
          Boolean(systemTableCache.get(TABLES.SERVICE_ENDPOINTS, endpointId)),
        );
      }, WAIT_TIMEOUT_MS, POLL_INTERVAL_MS);
      t.equal(
        endpointsReady,
        true,
        'service_endpoints should include sys-postgres-wire endpoints for all nodes',
      );

      for (const nodeId of nodeIds) {
        const endpointId = buildPostgresWireEndpointId(nodeId);
        const endpoint = systemTableCache.get(TABLES.SERVICE_ENDPOINTS, endpointId);
        t.ok(endpoint, `sys-postgres-wire endpoint present for ${nodeId}`);
        if (endpoint) {
          assertEndpointRow(t, endpoint, nodeId);
        }
      }
    });

    await t.test('CDC forwarding advances cache watermarks', async (t) => {
      const messageGroups = getAllMessageGroupServices(bootstrapResult, joinResults);
      t.ok(messageGroups.length > 0, 'should have message group services');

      const followerReady = await waitFor(() => {
        return selectFollowerMessageGroup(messageGroups) !== null;
      }, WAIT_TIMEOUT_MS, POLL_INTERVAL_MS);
      t.equal(followerReady, true, 'should find a follower message-group replica');

      const follower = selectFollowerMessageGroup(messageGroups);
      t.ok(follower, 'follower message group selected');
      t.equal(
        follower?.isCurrentRaftLeader?.(),
        false,
        'selected message group should not be the Raft leader',
      );
      const leaderId = follower?.getLeaderId?.();
      t.equal(typeof leaderId, TYPEOF.STRING, 'follower should have a leaderId string');
      t.ok(leaderId && leaderId.length > 0, 'follower should know the leader replica id');
      t.equal(
        leaderId === follower?.replicaId,
        false,
        'follower leaderId should not match its local replica id',
      );

      const seedNodeRow = systemTableCache.get(TABLES.NODES, seedNodeId);
      t.ok(seedNodeRow, 'seed node row should exist in cache');

      const beforeAppliedAtMs = systemTableCache.getLastAppliedAtMs(TABLES.NODES);
      const beforeWatermark = systemTableCache.getAppliedSchemaVersion(TABLES.NODES);

      // Forward the event for a SYNTHETIC node row, not the seed's own row:
      // the seed's background stats/heartbeat writer keeps rewriting its row
      // with newer timestamps, so a synthetic update to the same key can be
      // legitimately superseded by last-write-wins conflict resolution — the
      // historical ~1/3 flake in this subtest. A fabricated node id has no
      // concurrent writer, so the forwarded event's effect is deterministic.
      const syntheticNodeId = uuidv4();
      const nextCpu = 42;
      const causeId = `hop-test-cdc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const updateRow = {
        ...seedNodeRow,
        [COLUMN.NODE_ID]: syntheticNodeId,
        [COLUMN.CPU_USAGE_PERCENT]: nextCpu,
        [COLUMN.UPDATED_AT]: Date.now(),
      };

      // Observe the apply through the cache-change event stream, not through
      // live row state or getLastAppliedCauseId: the seed's own background
      // stats/heartbeat CDC traffic keeps rewriting the nodes row (both the
      // cpu value and the last-applied metadata are moving targets), which
      // was the historical ~1/3 flake in this subtest. The notification for
      // OUR causeId carries the record snapshot as applied — that is the
      // stable evidence the forwarded event landed.
      let notifiedRecord = null;
      const causeIdListener = (tableName, _operation, record, metadata) => {
        if (tableName === TABLES.NODES && metadata?.causeId === causeId) {
          notifiedRecord = record;
        }
      };
      systemTableCache.onCacheChange(causeIdListener);

      try {
        await follower.applyCDCEvent(TABLES.NODES, CDC_OPERATION.UPDATE, updateRow, {causeId});

        const watermarkAdvanced = await waitFor(() => {
          if (!notifiedRecord) {
            return false;
          }
          const afterAppliedAtMs = systemTableCache.getLastAppliedAtMs(TABLES.NODES);
          const afterWatermark = systemTableCache.getAppliedSchemaVersion(TABLES.NODES);
          if (afterAppliedAtMs === null || beforeAppliedAtMs === null) {
            return false;
          }
          // >= (not >): the apply can land within the same millisecond as the
          // captured before-value on a fast machine.
          if (!(afterAppliedAtMs >= beforeAppliedAtMs)) {
            return false;
          }
          return String(afterWatermark || '') !== String(beforeWatermark || '');
        }, WAIT_TIMEOUT_MS, POLL_INTERVAL_MS);

        t.equal(watermarkAdvanced, true, 'cache should apply forwarded CDC event and advance watermarks');
        t.equal(
          notifiedRecord?.[COLUMN.CPU_USAGE_PERCENT],
          nextCpu,
          'cache change notification should carry the forwarded record for the updated table',
        );
      } finally {
        systemTableCache.offCacheChange(causeIdListener);
      }
    });

    await t.test('discovery returns endpoints once rows and cache are healthy', async (t) => {
      const discoveryNodeId = joiningNodeIds[joiningNodeIds.length - 1] || seedNodeId;
      const discoveryJoiningService =
        joiningServices[joiningServices.length - 1] || null;
      adminApi = new AdminWebSocketAPI({
        nodeId: discoveryNodeId,
        systemTableCache,
        sqlQueryEngine: discoveryJoiningService?.cdcIntegrationService?.sqlQueryEngine ||
          seedQueryEngine,
      });
      await adminApi.initialize(0, {listen: false});

      const expectedNodeIds = new Set([seedNodeId, ...joiningNodeIds]);
      const discoveryReady = await waitFor(async () => {
        const sql = buildServiceDiscoveryQuery(TABLES.NODES);
        const result = await adminApi.executeLocalQueryEnvelope({
          queryId: 'hop-discovery-' + Date.now(),
          sql,
          params: [],
        });
        const snapshot = Array.isArray(result?.rows) ? result.rows[0] : null;
        if (!snapshot) {
          return false;
        }
        if (snapshot.schemaVersion !== ADMIN_SERVICE_DISCOVERY.SCHEMA_VERSION) {
          return false;
        }
        const services = Array.isArray(snapshot.services) ? snapshot.services : [];
        const service = services.find((entry) => {
          const serviceIds = Array.isArray(entry?.serviceIds) ? entry.serviceIds : [];
          return entry?.protocol === WASM_SERVICE_PROTOCOL.POSTGRESQL &&
            serviceIds.includes(META_SERVICE_ID.POSTGRES_WIRE);
        });
        if (!service) {
          return false;
        }
        const replicas = Array.isArray(service.replicas) ? service.replicas : [];
        if (replicas.length < expectedNodeIds.size) {
          return false;
        }
        const nodesSeen = new Set(replicas.map((replica) => replica?.nodeId).filter(Boolean));
        for (const expectedNodeId of expectedNodeIds) {
          if (!nodesSeen.has(expectedNodeId)) {
            return false;
          }
        }
        return replicas.every((replica) =>
          replica?.readiness?.routingReady === true &&
          replica?.readiness?.schemaReady === true &&
          replica?.readiness?.topologyReady === true,
        );
      }, WAIT_TIMEOUT_MS, POLL_INTERVAL_MS);

      t.equal(discoveryReady, true, 'service_discovery_local should return ready postgres-wire endpoints');
    });
  } finally {
    if (adminApi) {
      await adminApi.shutdown().catch(() => {});
    }
    for (let index = joiningServices.length - 1; index >= 0; index -= 1) {
      await gracefulJoiningShutdown(joiningServices[index]);
    }
    await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
    await cleanupTestEnvironment();
  }
});
