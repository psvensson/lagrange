import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from
  '../../src/admin/admin-control-snapshot.js';
import {AdminWebSocketAPI} from
  '../../src/admin/admin-websocket-api.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {createReadOnlyCache} from
  '../../src/cache/read-only-system-table-cache.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'error'});

const NODE_ID = 'node-local';
const NOW_MS = 1740589945123;
const OPEN_PUBLICATION_ROW = Object.freeze({
  publication_id: 'publication-8',
  publication_kind: 'cluster_membership',
  publication_epoch: 8,
  status: 'OPEN',
  published_active_node_ids: [NODE_ID, 'node-2'],
  required_ack_node_ids: [NODE_ID, 'node-2'],
  acknowledged_node_ids: [NODE_ID],
});

function createOpenMembershipCache() {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
    id: NODE_ID,
    node_id: NODE_ID,
    address: 'localhost:8080',
    node_address: 'localhost:8080',
    status: 'active',
    connection_state: 'ready',
    last_heartbeat: NOW_MS,
    ready_lease_expires_at: NOW_MS + 15000,
  });
  cache.applySystemTableChange(
    TABLES.CONTROL_PLANE_PUBLICATIONS,
    'INSERT',
    {...OPEN_PUBLICATION_ROW},
  );
  return cache;
}

function createReadinessService(options = {}) {
  const publishedReadOptions = [];
  const readinessCalls = [];
  const throwOnAuthoritativePublishedRead =
    options.throwOnAuthoritativePublishedRead === true;
  const membershipPublicationService = {
    getLatestClusterPublicationSync() {
      return {...OPEN_PUBLICATION_ROW};
    },
    getLatestPublishedClusterPublicationSync() {
      return null;
    },
    async getLatestPublishedClusterPublication(readOptions = {}) {
      publishedReadOptions.push({...readOptions});
      if (
        throwOnAuthoritativePublishedRead &&
        readOptions.preferAuthoritativeRead === true
      ) {
        throw new Error('unexpected_authoritative_published_membership_read');
      }
      return null;
    },
  };
  return {
    publishedReadOptions,
    readinessCalls,
    service: {
      membershipPublicationService,
      async getAllNodeReadiness(readOptions = {}) {
        readinessCalls.push({...readOptions});
        return [{
          nodeId: NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
          membershipPublication: {
            publicationEpoch: OPEN_PUBLICATION_ROW.publication_epoch,
            status: OPEN_PUBLICATION_ROW.status,
            publishedActiveNodeIds:
              OPEN_PUBLICATION_ROW.published_active_node_ids,
            requiredAckNodeIds: OPEN_PUBLICATION_ROW.required_ack_node_ids,
            acknowledgedNodeIds: OPEN_PUBLICATION_ROW.acknowledged_node_ids,
          },
        }];
      },
    },
  };
}

test(
  'snapshot lane control snapshot keeps published-membership recovery local',
  async (t) => {
    const writableCache = createOpenMembershipCache();
    const readiness = createReadinessService({
      throwOnAuthoritativePublishedRead: true,
    });
    const api = new AdminWebSocketAPI({
      nodeId: NODE_ID,
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneReadinessService: readiness.service,
      nowFn: () => NOW_MS,
    });

    const result = await api.executeLocalQueryEnvelope(
      {
        queryId: 'q-snapshot-no-authoritative-membership-recovery',
        sql: 'SELECT * FROM control_snapshot_local()',
        params: [],
      },
      {
        clientInfo: {
          lane: 'snapshot',
        },
      },
    );

    t.equal(result.success, true, 'snapshot lane query should succeed');
    t.same(
      readiness.publishedReadOptions,
      [],
      'snapshot lane should remain cache-local and bounded',
    );
    t.match(
      result.rows?.[0]?.controlPlaneDiagnostics?.publishedMembershipObservation,
      {
        publicationObservation: {
          state: 'unavailable',
        },
      },
      'snapshot should expose missing durable published membership locally',
    );
  },
);

test(
  'explicit control snapshot recovery may use authoritative published membership',
  async (t) => {
    const writableCache = createOpenMembershipCache();
    const readiness = createReadinessService();
    const snapshot = new AdminControlSnapshot({
      nodeId: NODE_ID,
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneReadinessService: readiness.service,
      nowFn: () => NOW_MS,
    });

    await snapshot.buildLocalControlSnapshot({
      allowAuthoritativePublishedMembershipRecovery: true,
    });

    t.same(
      readiness.publishedReadOptions,
      [
        {readProfile: 'diagnostics'},
        {
          preferAuthoritativeRead: true,
          readProfile: 'diagnostics',
          deliveryPriority: 'readiness',
        },
      ],
      'explicit recovery should retain the authoritative published-membership fallback',
    );
  },
);
