import {test} from '../../src/test-helpers/tap.js';
import {
  COLUMN,
  NUM,
  STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
} from '../../src/cdc/cdc-integration-service.js';
import {
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
} from '../../src/control-plane/priority-recovery-snapshot.js';

const TEST_DESCRIPTOR_STATE = Object.freeze({
  NONE: 'none',
});
const TEST_MISSING_NODE_READINESS_STATE = Object.freeze({
  SELF_RUNTIME_GRACE: 'self_runtime_grace',
});
const TEST_PROVISIONING_STATE = Object.freeze({
  CONVERGENCE_GRACE: 'convergence_grace',
  STEADY: 'steady',
});
const TEST_RUNTIME_AUTHORITY_PUBLICATION_STATE = Object.freeze({
  HEALTHY: 'healthy',
});
const TEST_RUNTIME_AUTHORITY_REPAIR_STATE = Object.freeze({
  NOT_ATTEMPTED: 'not_attempted',
});
const TEST_RUNTIME_AUTHORITY_STATE = Object.freeze({
  CONFIRMED: 'confirmed',
  ESTABLISHING: 'establishing',
  RETAINED: 'retained',
});
const TEST_RUNTIME_AUTHORITY_VISIBILITY_STATE = Object.freeze({
  CONFIRMED: 'confirmed',
  PENDING_PUBLICATION: 'pending_publication',
  RETAINED_LOCAL_RUNTIME: 'retained_local_runtime',
});

function createCache({nodes = [], services = []} = {}) {
  const nodeRows = new Map(nodes.map((row) => [row[COLUMN.NODE_ID], row]));
  const serviceRows = new Map(
    services.map((row) => [row[COLUMN.SERVICE_ID], row]),
  );
  const listeners = new Set();

  function notify(tableName, operation, row) {
    for (const listener of listeners) {
      listener(tableName, operation, row, null);
    }
  }

  return {
    get(tableName, key) {
      if (tableName === TABLES.NODES) {
        return nodeRows.get(key) || null;
      }
      return null;
    },
    getAll(tableName) {
      if (tableName === TABLES.NODES) {
        return [...nodeRows.values()];
      }
      if (tableName === TABLES.SERVICES) {
        return [...serviceRows.values()];
      }
      return [];
    },
    filter(tableName, predicate) {
      if (tableName !== TABLES.SERVICES) {
        return [];
      }
      return [...serviceRows.values()].filter((row) => predicate(row));
    },
    applySystemTableChange(tableName, operation, row) {
      const normalizedOperation = String(operation || '').toUpperCase();
      if (tableName === TABLES.NODES) {
        const key = row?.[COLUMN.NODE_ID];
        if (!key) {
          return;
        }
        if (normalizedOperation === 'DELETE') {
          nodeRows.delete(key);
          notify(tableName, normalizedOperation, row);
          return;
        }
        const existing = nodeRows.get(key) || {};
        nodeRows.set(
          key,
          normalizedOperation === 'UPDATE' ?
            {...existing, ...row} :
            {...row},
        );
        notify(tableName, normalizedOperation, nodeRows.get(key));
      }
      if (tableName === TABLES.SERVICES) {
        const key = row?.[COLUMN.SERVICE_ID];
        if (!key) {
          return;
        }
        if (normalizedOperation === 'DELETE') {
          serviceRows.delete(key);
          notify(tableName, normalizedOperation, row);
          return;
        }
        const existing = serviceRows.get(key) || {};
        serviceRows.set(
          key,
          normalizedOperation === 'UPDATE' ?
            {...existing, ...row} :
            {...row},
        );
        notify(tableName, normalizedOperation, serviceRows.get(key));
      }
    },
    onCacheChange(listener) {
      listeners.add(listener);
    },
  };
}

function createAccountingService(snapshots = {}) {
  return {
    async getCapacitySnapshotForNode(nodeId) {
      return snapshots[nodeId] || null;
    },
  };
}

function createPublicationService(snapshot) {
  return {
    getPublicationModeDiagnostics() {
      return snapshot;
    },
  };
}

function createActiveNode(nodeId) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.READY_LEASE_EXPIRES_AT]: 2000,
    [COLUMN.LAST_HEARTBEAT]: 1000,
    [COLUMN.CPU_USAGE_PERCENT]: 10,
    [COLUMN.MEMORY_USAGE_PERCENT]: 20,
    [COLUMN.DISK_USAGE_PERCENT]: 30,
    [COLUMN.STORAGE_BUDGET_BYTES]: 1000,
  };
}

function createMessageGroupService(nodeId) {
  return {
    [COLUMN.SERVICE_ID]: `mg-${nodeId}`,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${nodeId}/message-group/mg-${nodeId}`,
  };
}

function createPartitionService(nodeId, serviceId = `part-${nodeId}`) {
  return {
    [COLUMN.SERVICE_ID]: serviceId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${nodeId}/partition/${serviceId}`,
  };
}

test('ControlPlaneReadinessService getAllNodeReadiness propagates ' +
  'authoritative refresh for stale connected rows',
async (t) => {
  const now = 350000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-bulk-refresh'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [createMessageGroupService('node-bulk-refresh')],
  });
  const repairedNodeRow = {
    ...createActiveNode('node-bulk-refresh'),
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.LAST_HEARTBEAT]: now - 250,
    [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
  };
  const authoritativeReads = [];
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-bulk-refresh': {
        nodeId: 'node-bulk-refresh',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(tableName, sql, params) {
        authoritativeReads.push({tableName, sql, params});
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [repairedNodeRow],
            count: 1,
            source: 'local_partition_replica',
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [createMessageGroupService('node-bulk-refresh')],
            count: 1,
            source: 'local_partition_replica',
          };
        }
        return {
          success: false,
          rows: [],
        };
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const readinessEntries = await readinessService.getAllNodeReadiness({
    allowAuthoritativeRefresh: true,
  });

  t.equal(readinessEntries.length, 1);
  t.equal(readinessEntries[0].nodeId, 'node-bulk-refresh');
  t.equal(readinessEntries[0].dimensions.clusterMemberHealthy, true);
  t.equal(readinessEntries[0].nodeEvidence.lastHeartbeat,
    repairedNodeRow[COLUMN.LAST_HEARTBEAT],
    'bulk readiness should use the repaired heartbeat evidence');
  t.equal(authoritativeReads.length, 2,
    'bulk readiness should perform authoritative node and service reads');
  t.end();
});

test('ControlPlaneReadinessService getAllNodeReadiness retains fresh stored readiness for service-visible nodes whose node row lags cache',
async (t) => {
  const now = 360000;
  const cache = createCache({
    nodes: [
      {
        ...createActiveNode('node-visible'),
        [COLUMN.CONNECTION_STATE]: STATE.READY,
        [COLUMN.LAST_HEARTBEAT]: now - 1000,
        [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
      },
      {
        ...createActiveNode('node-lagged'),
        [COLUMN.CONNECTION_STATE]: STATE.READY,
        [COLUMN.LAST_HEARTBEAT]: now - 1000,
        [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
      },
    ],
    services: [
      createMessageGroupService('node-visible'),
      createMessageGroupService('node-lagged'),
    ],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-visible': {
        nodeId: 'node-visible',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
      'node-lagged': {
        nodeId: 'node-lagged',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead() {
        return {success: false, rows: []};
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const initialLaggedReadiness =
    await readinessService.getNodeReadiness('node-lagged', {
      allowAuthoritativeRefresh: false,
    });
  t.equal(
    initialLaggedReadiness.dimensions.clusterMemberHealthy,
    true,
    'fixture should capture a healthy readiness snapshot before the node row lags',
  );

  cache.applySystemTableChange(TABLES.NODES, 'DELETE', {
    [COLUMN.NODE_ID]: 'node-lagged',
  });

  const readinessEntries = await readinessService.getAllNodeReadiness({
    allowAuthoritativeRefresh: false,
  });
  const readinessByNodeId = Object.fromEntries(
    readinessEntries.map((entry) => [entry.nodeId, entry]),
  );

  t.ok(
    readinessByNodeId['node-lagged'],
    'bulk readiness should still enumerate service-visible nodes when a fresh stored snapshot exists',
  );
  t.equal(
    readinessByNodeId['node-lagged'].dimensions.clusterMemberHealthy,
    true,
    'bulk readiness should reuse the fresh stored snapshot for the lagged node',
  );
});

test('ControlPlaneReadinessService getAllNodeReadiness includes authoritative-only nodes during bulk refresh',
async (t) => {
  const now = 365000;
  const cacheVisibleNode = {
    ...createActiveNode('node-cache-visible'),
    [COLUMN.CONNECTION_STATE]: STATE.READY,
    [COLUMN.LAST_HEARTBEAT]: now - 250,
    [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
  };
  const authoritativeOnlyNode = {
    ...createActiveNode('node-authoritative-only'),
    [COLUMN.CONNECTION_STATE]: STATE.READY,
    [COLUMN.LAST_HEARTBEAT]: now - 250,
    [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
  };
  let authoritativeNodeListCalls = 0;
  let cachedNodeListCalls = 0;
  let authoritativeServiceListCalls = 0;
  let cachedServiceListCalls = 0;
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: createCache({
      nodes: [cacheVisibleNode],
      services: [createMessageGroupService('node-cache-visible')],
    }),
    nodesOwner: {
      async listNodes() {
        authoritativeNodeListCalls += 1;
        return {
          success: true,
          rows: [cacheVisibleNode, authoritativeOnlyNode],
        };
      },
      async listNodesFromCache() {
        cachedNodeListCalls += 1;
        return {
          success: true,
          rows: [cacheVisibleNode],
        };
      },
    },
    servicesOwner: {
      async listServices() {
        authoritativeServiceListCalls += 1;
        return {
          success: true,
          rows: [
            createMessageGroupService('node-cache-visible'),
            createMessageGroupService('node-authoritative-only'),
          ],
        };
      },
      async listServicesFromCache() {
        cachedServiceListCalls += 1;
        return {
          success: true,
          rows: [createMessageGroupService('node-cache-visible')],
        };
      },
    },
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-cache-visible': {
        nodeId: 'node-cache-visible',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
      'node-authoritative-only': {
        nodeId: 'node-authoritative-only',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const readinessEntries = await readinessService.getAllNodeReadiness({
    allowAuthoritativeRefresh: true,
  });

  t.same(
    readinessEntries.map((entry) => entry.nodeId).sort(),
    ['node-authoritative-only', 'node-cache-visible'],
    'bulk readiness should include nodes that are only visible on the authoritative owner path',
  );
  t.equal(
    authoritativeNodeListCalls,
    1,
    'bulk readiness should enumerate nodes from the authoritative owner path',
  );
  t.equal(
    authoritativeServiceListCalls,
    1,
    'bulk readiness should enumerate services from the authoritative owner path',
  );
  t.equal(
    cachedNodeListCalls,
    0,
    'bulk readiness should not fall back to cached node enumeration during authoritative refresh',
  );
  t.equal(
    cachedServiceListCalls,
    0,
    'bulk readiness should not fall back to cached service enumeration during authoritative refresh',
  );
  t.equal(
    readinessEntries.find((entry) => entry.nodeId === 'node-authoritative-only')
      ?.dimensions.clusterMemberHealthy,
    true,
    'the authoritative-only node should be evaluated as healthy once it is discovered',
  );
});

test('ControlPlaneReadinessService repairs medium-stale connected heartbeats ' +
  'before the node becomes unhealthy',
async (t) => {
  const now = 375000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-medium-stale'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 15000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now + 15000,
    }],
    services: [createMessageGroupService('node-medium-stale')],
  });
  const repairedNodeRow = {
    ...createActiveNode('node-medium-stale'),
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.LAST_HEARTBEAT]: now - 500,
    [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
  };
  const authoritativeReads = [];
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-medium-stale': {
        nodeId: 'node-medium-stale',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(tableName, sql, params) {
        authoritativeReads.push({tableName, sql, params});
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [repairedNodeRow],
            count: 1,
            source: 'local_partition_replica',
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [createMessageGroupService('node-medium-stale')],
            count: 1,
            source: 'local_partition_replica',
          };
        }
        return {
          success: false,
          rows: [],
        };
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    authoritativeReadinessRepairStaleHeartbeatMaxAgeMs: 10000,
    now: () => now,
  });

  const readinessEntries = await readinessService.getAllNodeReadiness({
    allowAuthoritativeRefresh: true,
  });

  t.equal(readinessEntries.length, 1);
  t.equal(readinessEntries[0].dimensions.clusterMemberHealthy, true,
    'medium-stale cache heartbeat should still look healthy before repair');
  t.equal(
    readinessEntries[0].nodeEvidence.lastHeartbeat,
    repairedNodeRow[COLUMN.LAST_HEARTBEAT],
    'bulk readiness should refresh medium-stale heartbeat evidence',
  );
  t.equal(authoritativeReads.length, 2,
    'medium-stale heartbeat refresh should read nodes and services');
  t.end();
});

test('ControlPlaneReadinessService trusts fresh local reporter success ' +
  'for self readiness before blocking on stale cache rows',
async (t) => {
  const now = 395000;
  const nodeId = 'node-self-reporter-fresh';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [createMessageGroupService(nodeId)],
  });
  const authoritativeReads = [];
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    heartbeatService: {
      getHeartbeatPublicationDiagnostics() {
        return {
          lastAttemptAt: new Date(now - 400).toISOString(),
          lastSuccessAt: new Date(now - 400).toISOString(),
          lastFailureAt: null,
          lastFailureStage: null,
          lastFailureReason: null,
          publicationPath: 'node_state_reporter',
          targetAddress: 'seed-node/message-group/mg-1-r1',
          targetNodeId: 'seed-node',
          targetServiceType: SERVICE_TYPE.MESSAGE_GROUP,
          targetServiceId: 'mg-1-r1',
          consecutiveFailures: 0,
        };
      },
    },
    storageAccountingService: createAccountingService({
      [nodeId]: {
        nodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(tableName, sql, params) {
        authoritativeReads.push({tableName, sql, params});
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [{
              ...createActiveNode(nodeId),
              [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
              [COLUMN.LAST_HEARTBEAT]: now - 200,
              [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
            }],
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [createMessageGroupService(nodeId)],
          };
        }
        return {success: false, rows: []};
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const readiness = await readinessService.getNodeReadiness(
    nodeId,
    {
      allowAuthoritativeRefresh: true,
      requireFreshOnIneligible: true,
      decisionDimension: CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
    },
  );

  t.equal(readiness.dimensions.clusterMemberHealthy, true,
    'fresh local reporter success should keep self cluster membership healthy');
  t.equal(readiness.dimensions.controlPlaneWritable, true,
    'fresh local reporter success should keep self control-plane writes admitted');
  t.equal(readiness.dimensions.serveEligible, true,
    'fresh local reporter success should keep self load serving admitted');
  t.same(authoritativeReads, [],
    'fresh local reporter success should avoid blocking authoritative self repairs');
  t.end();
});

test('ControlPlaneReadinessService keeps self readiness healthy through one ' +
  'timed-out reporter attempt when the last confirmed heartbeat is still fresh',
async (t) => {
  const now = 395000;
  const nodeId = 'node-self-reporter-timeout-grace';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [createMessageGroupService(nodeId)],
  });
  const authoritativeReads = [];
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    heartbeatService: {
      getHeartbeatPublicationDiagnostics() {
        return {
          lastAttemptAt: new Date(now - 1000).toISOString(),
          lastSuccessAt: new Date(now - 4000).toISOString(),
          lastFailureAt: new Date(now - 1000).toISOString(),
          lastFailureStage: 'attempt_timeout',
          lastFailureReason: 'Heartbeat attempt timed out after 6000ms',
          publicationPath: 'node_state_reporter',
          targetAddress: 'seed-node/message-group/mg-1-r1',
          targetNodeId: 'seed-node',
          targetServiceType: SERVICE_TYPE.MESSAGE_GROUP,
          targetServiceId: 'mg-1-r1',
          consecutiveFailures: 1,
        };
      },
    },
    storageAccountingService: createAccountingService({
      [nodeId]: {
        nodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(tableName, sql, params) {
        authoritativeReads.push({tableName, sql, params});
        return {success: false, rows: []};
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const readiness = await readinessService.getNodeReadiness(
    nodeId,
    {
      allowAuthoritativeRefresh: true,
      requireFreshOnIneligible: true,
      decisionDimension: CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
    },
  );

  t.equal(readiness.dimensions.clusterMemberHealthy, true,
    'recent confirmed reporter success should keep self membership healthy');
  t.equal(readiness.dimensions.controlPlaneWritable, true,
    'self control-plane writes should remain admitted through one timed-out attempt');
  t.equal(readiness.dimensions.serveEligible, true,
    'load-lane self admission should not flap during the timeout grace window');
  t.same(authoritativeReads, [],
    'timeout grace should avoid blocking on bounded authoritative self repair');
  t.end();
});

test('ControlPlaneReadinessService exposes one canonical publication story ' +
  'for diagnostics consumers',
async (t) => {
  const now = 420000;
  const nodeId = 'node-publication-story';
  const publicationRow = {
    publication_epoch: 12,
    status: 'PUBLISHED',
    published_active_node_ids: [nodeId],
    required_ack_node_ids: [nodeId],
    acknowledged_node_ids: [nodeId],
    created_at: now - 2000,
    updated_at: now - 1000,
  };
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: createCache({
      nodes: [createActiveNode(nodeId)],
      services: [createMessageGroupService(nodeId)],
    }),
    heartbeatService: {
      lastHeartbeatPublicationDecision: {
        publicationMode:
          CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_STEADY,
      },
      getHeartbeatPublicationDiagnostics() {
        return {
          lastAttemptAt: new Date(now - 250).toISOString(),
          lastSuccessAt: new Date(now - 250).toISOString(),
          publicationPath: 'node_state_reporter',
          targetAddress: 'seed-node/message-group/mg-1-r1',
          targetNodeId: 'seed-node',
          targetServiceType: SERVICE_TYPE.MESSAGE_GROUP,
          targetServiceId: 'mg-1-r1',
          consecutiveFailures: 0,
        };
      },
    },
    membershipPublicationService: {
      getLatestPublicationForNodeSync(requestedNodeId) {
        return requestedNodeId === nodeId ? publicationRow : null;
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const story = readinessService.getControlPlanePublicationStorySync(
    nodeId,
    new Date(now).toISOString(),
  );

  t.match(story, {
    nodeId,
    publishedControlPlaneEpoch: 12,
    publishedControlPlaneStatus: 'PUBLISHED',
    publishedControlPlaneObservationState: 'authoritative',
    metadataPublication: {
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
    },
    nodeStatePublication: {
      publicationMode:
        CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_STEADY,
      publicationPath: 'node_state_reporter',
      targetNodeId: 'seed-node',
      targetServiceType: SERVICE_TYPE.MESSAGE_GROUP,
      targetServiceId: 'mg-1-r1',
    },
    membershipPublication: {
      publicationEpoch: 12,
      status: 'PUBLISHED',
      publicationObservationState: 'authoritative',
    },
  }, 'publication story should bundle metadata, node-state, and membership publication diagnostics');
  t.end();
});

test('ControlPlaneReadinessService avoids synchronous authoritative self ' +
  'repair when local active service evidence is already present',
async (t) => {
  const now = 410000;
  const nodeId = 'node-self-local-evidence';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [createMessageGroupService(nodeId)],
  });
  const authoritativeReads = [];
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      [nodeId]: {
        nodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(tableName, sql, params) {
        authoritativeReads.push({tableName, sql, params});
        return {success: false, rows: []};
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const readiness = await readinessService.getNodeReadiness(
    nodeId,
    {
      allowAuthoritativeRefresh: true,
      requireFreshOnIneligible: true,
      decisionDimension: CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
    },
  );

  t.equal(readiness.dimensions.clusterMemberHealthy, true,
    'self-node local execution must keep membership healthy even with stale cached lease');
  t.equal(readiness.dimensions.controlPlaneWritable, true,
    'locally hosted active control-plane services should keep self writes admitted');
  t.equal(readiness.dimensions.serveEligible, true,
    'self-node should remain serve-eligible while authoritative state catches up');
  t.same(authoritativeReads, [],
    'self-node hot-path readiness should not force synchronous authoritative self repair');
  t.end();
});

test('ControlPlaneReadinessService reuses a recent readiness snapshot ' +
  'instead of repeating timed-out authoritative repairs on the hot path',
async (t) => {
  let now = 410000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-hot-path-cache'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [createMessageGroupService('node-hot-path-cache')],
  });
  const authoritativeReads = [];
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-hot-path-cache': {
        nodeId: 'node-hot-path-cache',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(tableName, sql, params) {
        authoritativeReads.push({tableName, sql, params});
        return {
          success: false,
          error: 'Query timeout after 1500ms',
          rows: [],
        };
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const first = await readinessService.getNodeReadiness(
    'node-hot-path-cache',
    {
      allowAuthoritativeRefresh: true,
      maxCachedAgeMs: 5000,
    },
  );

  now += 1500;

  const second = await readinessService.getNodeReadiness(
    'node-hot-path-cache',
    {
      allowAuthoritativeRefresh: true,
      maxCachedAgeMs: 5000,
    },
  );

  t.equal(first.dimensions.clusterMemberHealthy, false,
    'transport-connected node no longer stays healthy on stale cache alone');
  t.equal(second.dimensions.clusterMemberHealthy, false,
    'cached snapshot preserves the ineligible transport-only state');
  t.equal(
    authoritativeReads.length,
    2,
    'recent cached readiness should prevent a second nodes/services ' +
      'repair pair',
  );
  t.equal(
    first,
    second,
    'hot-path callers should receive the same cached readiness snapshot',
  );
  t.end();
});

test('ControlPlaneReadinessService backs off repeated failed authoritative ' +
  'repairs beyond the hot-path snapshot cache window',
async (t) => {
  let now = 415000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-repair-backoff'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [createMessageGroupService('node-repair-backoff')],
  });
  const authoritativeReads = [];
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-repair-backoff': {
        nodeId: 'node-repair-backoff',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(tableName, sql, params) {
        authoritativeReads.push({tableName, sql, params});
        return {
          success: false,
          error: 'Query timeout after 1500ms',
          rows: [],
        };
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    authoritativeReadinessRepairFailureCooldownMs: 30000,
    now: () => now,
  });

  await readinessService.getNodeReadiness(
    'node-repair-backoff',
    {
      allowAuthoritativeRefresh: true,
      maxCachedAgeMs: 5000,
    },
  );

  now += 10000;

  await readinessService.getNodeReadiness(
    'node-repair-backoff',
    {
      allowAuthoritativeRefresh: true,
      maxCachedAgeMs: 5000,
    },
  );

  t.equal(
    authoritativeReads.length,
    2,
    'failed repair should not repeat nodes/services reads before failure backoff expires',
  );

  now += 25000;

  await readinessService.getNodeReadiness(
    'node-repair-backoff',
    {
      allowAuthoritativeRefresh: true,
      maxCachedAgeMs: 5000,
    },
  );

  t.equal(
    authoritativeReads.length,
    4,
    'repair should retry once the failure backoff expires',
  );
  t.end();
});

test('ControlPlaneReadinessService invalidates cached readiness snapshots ' +
  'when node rows change',
async (t) => {
  const now = 420000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-cache-invalidation'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 500,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
    }],
    services: [createMessageGroupService('node-cache-invalidation')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-cache-invalidation': {
        nodeId: 'node-cache-invalidation',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const first = await readinessService.getNodeReadiness(
    'node-cache-invalidation',
    {maxCachedAgeMs: 5000},
  );

  cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
    ...createActiveNode('node-cache-invalidation'),
    [COLUMN.NODE_ID]: 'node-cache-invalidation',
    [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.LAST_HEARTBEAT]: now - 60000,
    [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
  });
  await new Promise((resolve) => setImmediate(resolve));

  const second = await readinessService.getNodeReadiness(
    'node-cache-invalidation',
    {maxCachedAgeMs: 5000},
  );

  t.equal(first.dimensions.clusterMemberHealthy, true);
  t.equal(second.dimensions.clusterMemberHealthy, false);
  t.not(
    first,
    second,
    'cache invalidation should force a fresh readiness evaluation',
  );
  t.end();
});

test('ControlPlaneReadinessService can reuse last-known-good readiness on ' +
  'cache invalidation while refreshing in the background',
async (t) => {
  let now = 520000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-stale-on-change'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 500,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
    }],
    services: [createMessageGroupService('node-stale-on-change')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-stale-on-change': {
        nodeId: 'node-stale-on-change',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const first = await readinessService.getNodeReadiness(
    'node-stale-on-change',
    {maxCachedAgeMs: 5000},
  );

  cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
    ...createActiveNode('node-stale-on-change'),
    [COLUMN.NODE_ID]: 'node-stale-on-change',
    [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.LAST_HEARTBEAT]: now - 60000,
    [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
  });
  await new Promise((resolve) => setImmediate(resolve));

  const second = await readinessService.getNodeReadiness(
    'node-stale-on-change',
    {
      maxCachedAgeMs: 5000,
      allowStaleOnCacheChange: true,
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  const third = await readinessService.getNodeReadiness(
    'node-stale-on-change',
    {
      maxCachedAgeMs: 5000,
      allowStaleOnCacheChange: true,
    },
  );

  t.equal(first.dimensions.clusterMemberHealthy, true);
  t.equal(second.dimensions.clusterMemberHealthy, true);
  t.equal(third.dimensions.clusterMemberHealthy, false);
  t.equal(
    first,
    second,
    'load-lane callers may reuse the cached readiness snapshot during refresh',
  );
  t.not(
    second,
    third,
    'background refresh should publish a new snapshot after invalidation',
  );
  t.end();
});

test('ControlPlaneReadinessService refreshes invalidated ineligible snapshots ' +
  'synchronously for serve decisions', async (t) => {
  const now = 530000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-ineligible-refresh'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [{
      ...createMessageGroupService('node-ineligible-refresh'),
      [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
    }],
  });
  const authoritativeReads = [];
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-ineligible-refresh': {
        nodeId: 'node-ineligible-refresh',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(
        tableName, sql, params, options,
      ) {
        authoritativeReads.push({tableName, sql, params, options});
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [{
              ...createActiveNode('node-ineligible-refresh'),
              [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
              [COLUMN.LAST_HEARTBEAT]: now - 100,
              [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
            }],
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [
              createMessageGroupService('node-ineligible-refresh'),
            ],
          };
        }
        return {success: false, rows: []};
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const initial = await readinessService.getNodeReadiness(
    'node-ineligible-refresh',
    {maxCachedAgeMs: 5000},
  );

  cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
    ...createActiveNode('node-ineligible-refresh'),
    [COLUMN.NODE_ID]: 'node-ineligible-refresh',
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.LAST_HEARTBEAT]: now - 61000,
    [COLUMN.READY_LEASE_EXPIRES_AT]: now - 31000,
  });
  await new Promise((resolve) => setImmediate(resolve));

  const refreshed = await readinessService.getNodeReadiness(
    'node-ineligible-refresh',
    {
      maxCachedAgeMs: 5000,
      allowStaleOnCacheChange: true,
      allowAuthoritativeRefresh: true,
      requireFreshOnIneligible: true,
      decisionDimension: 'serveEligible',
    },
  );

  t.equal(initial.dimensions.serveEligible, false);
  t.equal(refreshed.dimensions.serveEligible, true);
  t.equal(
    authoritativeReads.length,
    2,
    'serve-gating callers should bypass stale ineligible snapshots and refresh immediately',
  );
  t.end();
});
