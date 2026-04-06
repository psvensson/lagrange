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
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
} from '../../src/cdc/cdc-integration-service.js';

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

test('ControlPlaneReadinessService classifies a fully ready node', async (t) => {
  const cache = createCache({
    nodes: [createActiveNode('node-1')],
    services: [createMessageGroupService('node-1')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-1',
    systemTableCache: cache,
    storageAccountingService: createAccountingService({
      'node-1': {
        nodeId: 'node-1',
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
    now: () => 1500,
  });

  const readiness = await readinessService.getNodeReadiness('node-1');

  t.equal(readiness.dimensions.processAlive, true);
  t.equal(readiness.dimensions.clusterMemberHealthy, true);
  t.equal(readiness.dimensions.routingReady, true);
  t.equal(readiness.dimensions.loadReady, true);
  t.equal(readiness.dimensions.controlPlaneWritable, true);
  t.equal(readiness.dimensions.placementEligible, true);
  t.equal(readiness.dimensions.metadataPublicationHealthy, true);
  t.same(readiness.reasons, []);
  t.end();
});

test('ControlPlaneReadinessService surfaces self local query transport ' +
  'gating in readiness evidence', async (t) => {
  const nodeId = 'node-self-query-transport';
  const cache = createCache({
    nodes: [createActiveNode(nodeId)],
    services: [createMessageGroupService(nodeId)],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
      getQueryDataPlaneTransportReadiness() {
        return {
          ready: false,
          reason: 'query ingress owner not ready',
          retryAfterMs: 321,
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
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });

  const readiness = await readinessService.getNodeReadiness(nodeId);

  t.equal(
    readiness.nodeEvidence?.localQueryTransportState,
    'deferred',
    'self readiness should expose the deferred local query transport state',
  );
  t.equal(
    readiness.nodeEvidence?.localQueryTransportReady,
    false,
    'self readiness should preserve the local query transport readiness bit',
  );
  t.equal(
    readiness.nodeEvidence?.localQueryTransportReason,
    'query ingress owner not ready',
    'self readiness should preserve the local query transport reason',
  );
  t.equal(
    readiness.nodeEvidence?.localQueryTransportRetryAfterMs,
    321,
    'self readiness should preserve retry timing for local query transport',
  );
  t.end();
});

test('ControlPlaneReadinessService marks the self node unroutable for routed ' +
  'reads while local query transport is deferred', async (t) => {
  const nodeId = 'node-self-query-routing-gate';
  const cache = createCache({
    nodes: [createActiveNode(nodeId)],
    services: [createMessageGroupService(nodeId)],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
      getQueryDataPlaneTransportReadiness() {
        return {
          ready: false,
          reason: 'query ingress owner not ready',
          retryAfterMs: 654,
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
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });

  const readiness = await readinessService.getNodeReadiness(nodeId);
  const reasonCodes = readiness.reasons.map((reason) => reason.code);

  t.equal(
    readiness.dimensions.routingReady,
    false,
    'self node should not remain routing-ready while local query transport is deferred',
  );
  t.equal(
    readiness.dimensions.repairEligible,
    false,
    'self node should not remain repair-eligible while routed self queries are blocked',
  );
  t.equal(
    readiness.dimensions.serveEligible,
    false,
    'self node should not remain serve-eligible while routed self queries are blocked',
  );
  t.ok(
    reasonCodes.includes(
      CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
    ),
    'readiness reasons should preserve the local query transport gating code',
  );
  t.end();
});

test('ControlPlaneReadinessService allows local replica-operation owner reads ' +
  'to bypass self transport defer', async (t) => {
  const nodeId = 'node-self-owner-read-local-safe';
  const cache = createCache({
    nodes: [createActiveNode(nodeId)],
    services: [createMessageGroupService(nodeId)],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
      getQueryDataPlaneTransportReadiness() {
        return {
          ready: false,
          reason: 'query ingress owner not ready',
          retryAfterMs: 654,
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
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });

  const participation = readinessService.getControlPlaneParticipationSync(
    nodeId,
    {
      participationKind:
        CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ,
      decisionDimension:
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
    },
  );

  t.equal(
    participation.decision,
    'defer',
    'owner-read participation should still expose the transport defer decision',
  );
  t.equal(
    participation.reasonCode,
    CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
    'owner-read participation should preserve the canonical transport blocker',
  );
  t.equal(
    participation.localExecutionAllowed,
    true,
    'owner-read participation should explicitly allow the local-safe execution path',
  );
  t.end();
});

test('ControlPlaneReadinessService uses injected owners for async shared metadata reads',
  async (t) => {
    const nodeRow = createActiveNode('node-1');
    const serviceRow = createMessageGroupService('node-1');
    let cacheGetCalls = 0;
    let cacheGetAllCalls = 0;
    let cacheFilterCalls = 0;
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-1',
      systemTableCache: {
        get() {
          cacheGetCalls += 1;
          throw new Error('direct cache get should not be used');
        },
        getAll() {
          cacheGetAllCalls += 1;
          throw new Error('direct cache getAll should not be used');
        },
        filter() {
          cacheFilterCalls += 1;
          throw new Error('direct cache filter should not be used');
        },
        onCacheChange() {},
      },
      nodesOwner: {
        async getNodeFromCache(nodeId) {
          return {
            success: true,
            rows: nodeId === 'node-1' ? [nodeRow] : [],
          };
        },
      },
      servicesOwner: {
        async listServicesForNodeFromCache(nodeId) {
          return {
            success: true,
            rows: nodeId === 'node-1' ? [serviceRow] : [],
          };
        },
      },
      storageAccountingService: createAccountingService({
        'node-1': {
          nodeId: 'node-1',
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
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness('node-1');

    t.equal(readiness.dimensions.routingReady, true);
    t.equal(readiness.dimensions.controlPlaneWritable, true);
    t.equal(cacheGetCalls, 0, 'async owner path should not use cache.get');
    t.equal(cacheGetAllCalls, 0, 'async owner path should not use cache.getAll');
    t.equal(cacheFilterCalls, 0, 'async owner path should not use cache.filter');
  });

test('ControlPlaneReadinessService reuses one owner-key evaluation for ' +
  'concurrent readiness reads', async (t) => {
  let releaseCapacityRead;
  const capacityReadBarrier = new Promise((resolve) => {
    releaseCapacityRead = resolve;
  });
  let capacityReadCount = 0;
  const cache = createCache({
    nodes: [createActiveNode('node-1')],
    services: [createMessageGroupService('node-1')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-1',
    systemTableCache: cache,
    storageAccountingService: {
      async getCapacitySnapshotForNode(nodeId) {
        capacityReadCount += 1;
        await capacityReadBarrier;
        return {
          nodeId,
          budgetBytes: 1000,
          pressureState: 'normal',
        };
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });

  const first = readinessService.getNodeReadiness('node-1');
  const second = readinessService.getNodeReadiness('node-1');

  releaseCapacityRead();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  t.equal(capacityReadCount, 1, 'shared readiness lane must evaluate once');
  t.same(firstResult, secondResult, 'concurrent callers must observe one evaluation result');
  t.end();
});

test('ControlPlaneReadinessService records serve and repair eligibility flips',
  async (t) => {
    let now = 1500;
    const cache = createCache({
      nodes: [{
        ...createActiveNode('node-1'),
        [COLUMN.CONNECTION_STATE]: STATE.READY,
        [COLUMN.LAST_HEARTBEAT]: 1400,
        [COLUMN.READY_LEASE_EXPIRES_AT]: 5000,
      }],
      services: [createMessageGroupService('node-1')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'observer-node',
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        'node-1': {
          nodeId: 'node-1',
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

    const initial = await readinessService.getNodeReadiness('node-1');
    t.same(initial.recentTransitions, [],
      'first readiness evaluation should not fabricate a transition');

    cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      [COLUMN.NODE_ID]: 'node-1',
      [COLUMN.CONNECTION_STATE]: STATE.DISCONNECTED,
      [COLUMN.LAST_HEARTBEAT]: 1000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: 1200,
    });
    now = 46000;

    const degraded = await readinessService.getNodeReadiness('node-1');

    t.equal(degraded.dimensions.repairEligible, false);
    t.equal(degraded.dimensions.serveEligible, false);
    t.equal(degraded.recentTransitions.length, 1,
      'eligibility flip should be recorded once');
    t.same(
      degraded.recentTransitions[0].flippedDimensions,
      ['serveEligible', 'repairEligible'],
      'transition should capture both flipped dimensions',
    );
    t.equal(
      degraded.recentTransitions[0].rawInputs.heartbeatAgeMs,
      45000,
      'transition should capture heartbeat age at flip time',
    );
    t.equal(
      degraded.recentTransitions[0].rawInputs.readyLeaseLagMs,
      44800,
      'transition should capture ready-lease lag at flip time',
    );
    t.end();
  });

test('ControlPlaneReadinessService fails closed for stale lease rows even ' +
  'when transport is connected', async (t) => {
  const now = 100000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-stale'),
      [COLUMN.CONNECTION_STATE]: STATE.DISCONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 5000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 1000,
    }],
    services: [createMessageGroupService('node-stale')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState(nodeId) {
        return nodeId === 'node-stale' ? STATE.CONNECTED : STATE.DISCONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-stale': {
        nodeId: 'node-stale',
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

  const readiness = await readinessService.getNodeReadiness('node-stale');

  t.equal(readiness.dimensions.clusterMemberHealthy, false);
  t.equal(readiness.dimensions.controlPlaneWritable, false);
  t.equal(readiness.dimensions.placementEligible, false);
  t.equal(readiness.dimensions.controlPlaneRecoveryEligible, true);
  t.end();
});

test('ControlPlaneReadinessService fails closed when router transport ' +
  'evidence is explicitly disconnected', async (t) => {
  const now = 120000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-router-lag'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 4000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 1000,
    }],
    services: [createMessageGroupService('node-router-lag')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.DISCONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-router-lag': {
        nodeId: 'node-router-lag',
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

  const readiness = await readinessService.getNodeReadiness('node-router-lag');
  const reasonCodes = readiness.reasons.map((reason) => reason.code);

  t.equal(readiness.dimensions.clusterMemberHealthy, false);
  t.equal(readiness.dimensions.repairEligible, false);
  t.equal(readiness.dimensions.serveEligible, false);
  t.equal(readiness.dimensions.controlPlaneWritable, false);
  t.equal(readiness.dimensions.placementEligible, false);
  t.ok(
    reasonCodes.includes(CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY),
  );
  t.end();
});

test('ControlPlaneReadinessService does not preserve cluster membership from ' +
  'stale row evidence when router transport is unknown', async (t) => {
  const now = 120000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-router-unknown'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 4000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 1000,
    }],
    services: [createMessageGroupService('node-router-unknown')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return null;
      },
    },
    storageAccountingService: createAccountingService({
      'node-router-unknown': {
        nodeId: 'node-router-unknown',
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

  const readiness = await readinessService
    .getNodeReadiness('node-router-unknown');

  t.equal(readiness.dimensions.clusterMemberHealthy, false);
  t.equal(readiness.dimensions.repairEligible, false);
  t.equal(readiness.dimensions.serveEligible, false);
  t.equal(readiness.dimensions.controlPlaneWritable, false);
  t.equal(readiness.dimensions.placementEligible, false);
  t.end();
});

test('ControlPlaneReadinessService rejects stale-lease rows once heartbeat ' +
  'evidence is too old (transport disconnected, verifies §1.4.12)',
async (t) => {
  const now = 200000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-too-stale'),
      [COLUMN.CONNECTION_STATE]: STATE.DISCONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [createMessageGroupService('node-too-stale')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.DISCONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-too-stale': {
        nodeId: 'node-too-stale',
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

  const readiness = await readinessService.getNodeReadiness('node-too-stale');
  const reasonCodes = readiness.reasons.map((reason) => reason.code);

  t.equal(readiness.dimensions.clusterMemberHealthy, false);
  t.ok(
    reasonCodes.includes(
      CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY,
    ),
  );
  t.end();
});

test('ControlPlaneReadinessService marks disconnected members unhealthy ' +
  'once heartbeat staleness crosses 30s (verifies §1.4.12)',
async (t) => {
  const now = 250000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-31s-stale'),
      [COLUMN.CONNECTION_STATE]: STATE.DISCONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 31000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 15000,
    }],
    services: [createMessageGroupService('node-31s-stale')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.DISCONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-31s-stale': {
        nodeId: 'node-31s-stale',
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

  const readiness = await readinessService.getNodeReadiness('node-31s-stale');
  const reasonCodes = readiness.reasons.map((reason) => reason.code);
  const clusterReason = readiness.reasons.find((reason) =>
    reason.code ===
      CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY,
  );

  t.equal(readiness.dimensions.clusterMemberHealthy, false);
  t.equal(readiness.dimensions.controlPlaneWritable, false);
  t.ok(
    reasonCodes.includes(
      CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY,
    ),
  );
  t.ok(clusterReason);
  t.equal(clusterReason?.details?.heartbeatAgeMs, 31000);
  t.equal(clusterReason?.details?.staleHeartbeatLimitMs, 30000);
  t.equal(clusterReason?.details?.transportConnected, false);
  t.end();
});

test('ControlPlaneReadinessService repairs stale connected node evidence ' +
  'from authoritative local rows before marking the node unhealthy',
async (t) => {
  const now = 300000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-authoritative-refresh'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [createMessageGroupService('node-authoritative-refresh')],
  });
  const repairedNodeRow = {
    ...createActiveNode('node-authoritative-refresh'),
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
      'node-authoritative-refresh': {
        nodeId: 'node-authoritative-refresh',
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
            rows: [createMessageGroupService('node-authoritative-refresh')],
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

  const readiness = await readinessService.getNodeReadiness(
    'node-authoritative-refresh',
    {allowAuthoritativeRefresh: true},
  );

  t.equal(readiness.dimensions.clusterMemberHealthy, true);
  t.equal(readiness.dimensions.controlPlaneWritable, true);
  t.equal(readiness.dimensions.placementEligible, true);
  t.equal(
    cache.get(TABLES.NODES, 'node-authoritative-refresh')
      ?.ready_lease_expires_at,
    repairedNodeRow[COLUMN.READY_LEASE_EXPIRES_AT],
    'authoritative repair should update the cached node lease',
  );
  t.equal(authoritativeReads.length, 2,
    'readiness repair should refresh nodes and services authoritatively');
  t.end();
});

test('ControlPlaneReadinessService repairs missing node rows from ' +
  'authoritative evidence even when transport is disconnected',
async (t) => {
  const now = 310000;
  const nodeId = 'node-missing-authoritative-repair';
  const cache = createCache({
    nodes: [],
    services: [],
  });
  const authoritativeReads = [];
  const repairedNodeRow = {
    ...createActiveNode(nodeId),
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.LAST_HEARTBEAT]: now - 100,
    [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
  };
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.DISCONNECTED;
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
      async executeAuthoritativeSystemTableRead(tableName) {
        authoritativeReads.push(tableName);
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [repairedNodeRow],
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [createMessageGroupService(nodeId)],
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

  const readiness = await readinessService.getNodeReadiness(
    nodeId,
    {
      allowAuthoritativeRefresh: true,
      requireFreshOnIneligible: true,
      decisionDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    },
  );

  t.same(
    authoritativeReads,
    [TABLES.NODES, TABLES.SERVICES],
    'missing node evidence should trigger one authoritative node/service repair',
  );
  t.equal(
    cache.get(TABLES.NODES, nodeId)?.[COLUMN.NODE_ID],
    nodeId,
    'authoritative repair should hydrate the missing node row in cache',
  );
  t.equal(
    readiness.dimensions.repairEligible,
    true,
    'authoritative repair should restore repair eligibility for the recovered node',
  );
  t.notOk(
    readiness.reasons.some((reason) =>
      reason.code === CONTROL_PLANE_READINESS_REASON.NODE_ROW_MISSING,
    ),
    'repaired snapshots should not keep the missing-node blocker reason',
  );
  t.end();
});

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

test('ControlPlaneReadinessService refreshes cached ineligible snapshots ' +
  'in the background for serve decisions', async (t) => {
  const now = 529000;
  const nodeId = 'node-cached-ineligible-background';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [{
      ...createMessageGroupService(nodeId),
      [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
    }],
  });
  const authoritativeReads = [];
  let releaseAuthoritativeRead = null;
  const authoritativeReadGate = new Promise((resolve) => {
    releaseAuthoritativeRead = resolve;
  });
  let backgroundReadStartedResolve = null;
  const backgroundReadStarted = new Promise((resolve) => {
    backgroundReadStartedResolve = resolve;
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
      [nodeId]: {
        nodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(tableName) {
        authoritativeReads.push(tableName);
        backgroundReadStartedResolve?.();
        await authoritativeReadGate;
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [{
              ...createActiveNode(nodeId),
              [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
              [COLUMN.LAST_HEARTBEAT]: now - 100,
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

  const initial = await readinessService.getNodeReadiness(
    nodeId,
    {maxCachedAgeMs: 5000},
  );

  const repeated = await readinessService.getNodeReadiness(
    nodeId,
    {
      maxCachedAgeMs: 5000,
      allowAuthoritativeRefresh: true,
      preferBackgroundRefreshOnIneligible: true,
      decisionDimension: CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
    },
  );

  t.equal(initial.dimensions.serveEligible, false);
  t.equal(repeated.dimensions.serveEligible, false,
    'background-refresh mode should return the cached ineligible snapshot immediately');

  await backgroundReadStarted;
  t.equal(authoritativeReads.length, 2,
    'background-refresh mode should start the owner-path refresh without blocking the caller');

  releaseAuthoritativeRead();
  await new Promise((resolve) => setImmediate(resolve));

  const refreshed = await readinessService.getNodeReadiness(
    nodeId,
    {maxCachedAgeMs: 5000},
  );
  t.equal(refreshed.dimensions.serveEligible, true,
    'later callers should observe the asynchronously refreshed readiness snapshot');
  t.end();
});

test('ControlPlaneReadinessService refreshes cached ineligible snapshots ' +
  'synchronously for serve decisions', async (t) => {
  const now = 530000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-cached-ineligible-refresh'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [{
      ...createMessageGroupService('node-cached-ineligible-refresh'),
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
      'node-cached-ineligible-refresh': {
        nodeId: 'node-cached-ineligible-refresh',
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
              ...createActiveNode('node-cached-ineligible-refresh'),
              [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
              [COLUMN.LAST_HEARTBEAT]: now - 100,
              [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
            }],
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [createMessageGroupService(
              'node-cached-ineligible-refresh',
            )],
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
    'node-cached-ineligible-refresh',
    {maxCachedAgeMs: 5000},
  );

  const refreshed = await readinessService.getNodeReadiness(
    'node-cached-ineligible-refresh',
    {
      maxCachedAgeMs: 5000,
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
    'serve-gating callers should bypass cached ineligible snapshots and ' +
      'refresh immediately',
  );
  t.end();
});

test('ControlPlaneReadinessService bypasses authoritative repair cooldown ' +
  'for fresh ineligible repair decisions', async (t) => {
  let now = 540000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-repair-cooldown-bypass'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [{
      ...createMessageGroupService('node-repair-cooldown-bypass'),
      [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
    }],
  });
  const authoritativeReads = [];
  let repairAttempt = 0;
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
      'node-repair-cooldown-bypass': {
        nodeId: 'node-repair-cooldown-bypass',
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
          repairAttempt += 1;
          return {
            success: true,
            rows: [{
              ...createActiveNode('node-repair-cooldown-bypass'),
              [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
              [COLUMN.LAST_HEARTBEAT]: now - 100,
              [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
            }],
          };
        }
        if (tableName === TABLES.SERVICES) {
          if (repairAttempt <= 1) {
            return {
              success: true,
              rows: [{
                ...createMessageGroupService(
                  'node-repair-cooldown-bypass',
                ),
                [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
              }],
            };
          }
          return {
            success: true,
            rows: [createMessageGroupService(
              'node-repair-cooldown-bypass',
            )],
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
    authoritativeReadinessRepairCooldownMs: 30000,
    now: () => now,
  });

  const first = await readinessService.getNodeReadiness(
    'node-repair-cooldown-bypass',
    {
      allowAuthoritativeRefresh: true,
      requireFreshOnIneligible: true,
      decisionDimension: 'repairEligible',
    },
  );

  now += 1000;

  const second = await readinessService.getNodeReadiness(
    'node-repair-cooldown-bypass',
    {
      allowAuthoritativeRefresh: true,
      requireFreshOnIneligible: true,
      decisionDimension: 'repairEligible',
    },
  );

  t.equal(first.dimensions.repairEligible, false);
  t.equal(second.dimensions.repairEligible, true);
  t.equal(
    authoritativeReads.length,
    4,
    'repair-eligibility fresh decisions should bypass cooldown and re-read',
  );
  t.end();
});

test('ControlPlaneReadinessService bypasses authoritative repair cooldown ' +
  'for fresh ineligible serve decisions', async (t) => {
  let now = 640000;
  const nodeId = 'node-serve-cooldown-bypass';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [{
      ...createMessageGroupService(nodeId),
      [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
    }],
  });
  const authoritativeReads = [];
  let repairAttempt = 0;
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
      [nodeId]: {
        nodeId,
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
          repairAttempt += 1;
          return {
            success: true,
            rows: [{
              ...createActiveNode(nodeId),
              [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
              [COLUMN.LAST_HEARTBEAT]: now - 100,
              [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
            }],
          };
        }
        if (tableName === TABLES.SERVICES) {
          if (repairAttempt <= 1) {
            return {
              success: true,
              rows: [{
                ...createMessageGroupService(nodeId),
                [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
              }],
            };
          }
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
    authoritativeReadinessRepairCooldownMs: 30000,
    now: () => now,
  });

  const first = await readinessService.getNodeReadiness(
    nodeId,
    {
      allowAuthoritativeRefresh: true,
      requireFreshOnIneligible: true,
      decisionDimension: 'serveEligible',
    },
  );

  now += 1000;

  const second = await readinessService.getNodeReadiness(
    nodeId,
    {
      allowAuthoritativeRefresh: true,
      requireFreshOnIneligible: true,
      decisionDimension: 'serveEligible',
    },
  );

  t.equal(first.dimensions.serveEligible, false);
  t.equal(second.dimensions.serveEligible, true);
  t.equal(
    authoritativeReads.length,
    4,
    'serve-eligibility fresh decisions should bypass cooldown and re-read',
  );
  t.end();
});

test('ControlPlaneReadinessService refreshes a transport-connected stale ' +
  'stopped node row before denying repair routing', async (t) => {
  const now = 640000;
  const nodeId = 'node-restarted';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: null,
    }],
    services: [createMessageGroupService(nodeId)],
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
      [nodeId]: {
        nodeId,
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
              ...createActiveNode(nodeId),
              [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
              [COLUMN.LAST_HEARTBEAT]: now - 100,
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
      decisionDimension: 'repairEligible',
    },
  );

  t.equal(readiness.dimensions.processAlive, true,
    'authoritative refresh should replace the stale stopped lifecycle state');
  t.equal(readiness.dimensions.repairEligible, true,
    'transport-connected restarted nodes should recover repair routing after authoritative refresh');
  t.equal(authoritativeReads.length, 2,
    'stale stopped transport-connected rows should trigger authoritative node and service refresh');
  t.equal(
    cache.get(TABLES.NODES, nodeId)?.[COLUMN.STATUS],
    SERVICE_STATUS.ACTIVE,
    'authoritative refresh should update the cached node row back to active',
  );
  t.end();
});

test('ControlPlaneReadinessService authoritative repair can route to the ' +
  'leader path through repair-eligible SQL fallback instead of trusting ' +
  'local replica fallback rows',
async (t) => {
  const now = 390000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-routed-refresh'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [createMessageGroupService('node-routed-refresh')],
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
      'node-routed-refresh': {
        nodeId: 'node-routed-refresh',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(tableName, sql, params, options) {
        authoritativeReads.push({tableName, sql, params, options});
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [{
              ...createActiveNode('node-routed-refresh'),
              [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
              [COLUMN.LAST_HEARTBEAT]: now - 100,
              [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
            }],
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [createMessageGroupService('node-routed-refresh')],
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
    'node-routed-refresh',
    {allowAuthoritativeRefresh: true},
  );

  t.equal(readiness.dimensions.clusterMemberHealthy, true);
  t.equal(authoritativeReads.length, 2,
    'repair should perform bounded authoritative node and service reads');
  for (const read of authoritativeReads) {
    t.match(read.options, {
      localReadConsistency: 'local_leader',
      allowSqlFallback: true,
    });
    t.equal(
      read.options.replicaFallbackConsistency,
      'any_replica',
      'readiness repair should prefer a local replica repair read before routed SQL',
    );
    t.equal(
      read.options?.queryOptions?.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      'readiness repair fallback must stay on control-plane recovery routing',
    );
    t.match(
      String(read.options?.queryOptions?.sessionId || ''),
      /^authoritative-control-plane-read:/,
      'readiness repair fallback should isolate the SQL session',
    );
  }
  t.end();
});

test('ControlPlaneReadinessService keeps self-node hot-path readiness off the ' +
  'authoritative owner path when local service evidence is available',
async (t) => {
  const now = 395000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-self-fallback'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [createMessageGroupService('node-self-fallback')],
  });
  const authoritativeReads = [];
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-self-fallback',
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-self-fallback': {
        nodeId: 'node-self-fallback',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(tableName, sql, params, options) {
        authoritativeReads.push({tableName, sql, params, options});
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [{
              ...createActiveNode('node-self-fallback'),
              [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
              [COLUMN.LAST_HEARTBEAT]: now - 100,
              [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
            }],
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [createMessageGroupService('node-self-fallback')],
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
    'node-self-fallback',
    {
      allowAuthoritativeRefresh: true,
    },
  );

  t.equal(readiness.dimensions.clusterMemberHealthy, true);
  t.equal(authoritativeReads.length, 0,
    'self readiness should rely on local active service evidence instead of synchronous authoritative self repair');
  t.end();
});

test('ControlPlaneReadinessService repairs self readiness through the ' +
  'authoritative owner using repair-eligible SQL fallback when local ' +
  'leader reads are unavailable', async (t) => {
  const now = 396000;
  const nodeId = 'node-self-routed-refresh';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [{
      ...createMessageGroupService(nodeId),
      [COLUMN.STATUS]: 'syncing',
    }],
  });
  const authoritativeReads = [];
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState(targetNodeId) {
        return targetNodeId === nodeId ? STATE.CONNECTED : STATE.DISCONNECTED;
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
      async executeAuthoritativeSystemTableRead(tableName, sql, params, options) {
        authoritativeReads.push({tableName, sql, params, options});
        const queryOptions = options?.queryOptions || {};
        if (options?.allowSqlFallback !== true ||
            queryOptions?.routingReadinessDimension !==
              CONTROL_PLANE_READINESS_DIMENSION
                .CONTROL_PLANE_RECOVERY_ELIGIBLE ||
            typeof queryOptions?.sessionId !== 'string' ||
            queryOptions.sessionId.length === 0) {
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
              ...createActiveNode(nodeId),
              [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
              [COLUMN.LAST_HEARTBEAT]: now - 100,
              [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
            }],
            source: 'sql_query_engine',
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [createMessageGroupService(nodeId)],
            source: 'sql_query_engine',
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
    {allowAuthoritativeRefresh: true},
  );

  t.equal(readiness.dimensions.clusterMemberHealthy, true,
    'authoritative refresh should repair the stale heartbeat evidence');
  t.equal(readiness.dimensions.routingReady, true,
    'authoritative refresh should repair inactive self service evidence');
  t.equal(readiness.dimensions.serveEligible, true,
    'load-lane callers should admit once the owner path repairs self evidence');
  t.equal(authoritativeReads.length, 2,
    'repair should read both node and service evidence');
  for (const read of authoritativeReads) {
    t.equal(read.options?.allowSqlFallback, true,
      'self readiness repair should be allowed to route through canonical SQL');
    t.equal(
      read.options?.queryOptions?.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      'repair fallback must stay on control-plane recovery routing',
    );
    t.match(
      String(read.options?.queryOptions?.sessionId || ''),
      /^authoritative-control-plane-read:/,
      'repair fallback should isolate the SQL session',
    );
  }
  t.end();
});

test('ControlPlaneReadinessService classifies degraded publication separately',
  async (t) => {
    const cache = createCache({
      nodes: [createActiveNode('node-2')],
      services: [createMessageGroupService('node-2')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-2',
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        'node-2': {
          nodeId: 'node-2',
          budgetBytes: 1000,
          pressureState: 'normal',
        },
      }),
      cdcGroupPropagationService: createPublicationService({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.CONSERVATIVE_FANOUT,
        reasonCode: 'grouped_delivery_failure',
        enteredAt: '2026-03-04T00:00:00.000Z',
        recentTransitions: [],
      }),
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness('node-2');
    const reasonCodes = readiness.reasons.map((reason) => reason.code);

    t.equal(readiness.dimensions.metadataPublicationHealthy, false);
    t.equal(readiness.dimensions.controlPlaneWritable, false);
    t.equal(readiness.dimensions.placementEligible, false);
    t.ok(
      reasonCodes.includes(
        CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_DEGRADED,
      ),
    );
    t.ok(
      reasonCodes.includes(
        CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
      ),
    );
    t.end();
  });

test('ControlPlaneReadinessService treats config-safe publication as writable',
  async (t) => {
    const cache = createCache({
      nodes: [createActiveNode('node-safe')],
      services: [createMessageGroupService('node-safe')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-safe',
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        'node-safe': {
          nodeId: 'node-safe',
          budgetBytes: 1000,
          pressureState: 'normal',
        },
      }),
      cdcGroupPropagationService: createPublicationService({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY,
        reasonCode: 'config_safe_mode',
        enteredAt: '2026-03-04T00:00:00.000Z',
        recentTransitions: [],
      }),
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness('node-safe');
    const reasonCodes = readiness.reasons.map((reason) => reason.code);

    t.equal(readiness.dimensions.metadataPublicationHealthy, true);
    t.equal(readiness.dimensions.controlPlaneWritable, true);
    t.equal(readiness.dimensions.placementEligible, true);
    t.notOk(
      reasonCodes.includes(
        CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_REPAIR_ONLY,
      ),
    );
    t.notOk(
      reasonCodes.includes(
        CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
      ),
    );
    t.end();
  });

test('ControlPlaneReadinessService exposes active priority control-plane recovery mode while publication is pending',
  async (t) => {
    let publicationReadOptions = null;
    const cache = createCache({
      nodes: [createActiveNode('node-priority-recovery')],
      services: [createMessageGroupService('node-priority-recovery')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-priority-recovery',
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        'node-priority-recovery': {
          nodeId: 'node-priority-recovery',
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
      membershipPublicationService: {
        getLatestPublicationForNode(_nodeId, options = null) {
          publicationReadOptions = options;
          return {
            publicationEpoch: 14,
            status: 'ACK_PENDING',
            createdAt: 1200,
            priorityPartitionSummary: {
              satisfied: false,
              missingPartitionIds: ['replica_operations-p1'],
            },
          };
        },
      },
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness(
      'node-priority-recovery',
    );

    t.equal(readiness.priorityControlPlaneRecovery.active, true);
    t.same(
      readiness.priorityControlPlaneRecovery.reasonCodes,
      [
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
      ],
      'priority recovery mode should remain active until the membership publication is closed and priority partitions satisfy spread',
    );
    t.equal(readiness.priorityControlPlaneRecovery.publicationEpoch, 14);
    t.equal(readiness.priorityControlPlaneRecovery.publicationStatus, 'ACK_PENDING');
    t.equal(
      publicationReadOptions?.preferAuthoritativeRead,
      true,
      'membership publication diagnostics should prefer authoritative publication reads',
    );
    t.equal(
      publicationReadOptions?.preferOwnerRpcRead,
      true,
      'membership publication diagnostics should prefer owner-RPC publication reads',
    );
    t.equal(
      publicationReadOptions?.requireOwnerRpcRead,
      true,
      'membership publication diagnostics should require owner-RPC reads',
    );
    t.equal(
      publicationReadOptions?.localReadConsistency,
      LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER,
      'membership publication diagnostics should read from local leaders only',
    );
    t.equal(
      publicationReadOptions?.replicaFallbackConsistency,
      LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER,
      'membership publication diagnostics should avoid any-replica fallback',
    );
    t.equal(
      publicationReadOptions?.queryTimeoutMs,
      NUM.THOUSAND,
      'membership publication diagnostics should bound owner reads to the readiness timeout budget',
    );
    t.end();
  });

test('ControlPlaneReadinessService clears priority control-plane recovery mode after publication and spread converge',
  async (t) => {
    const cache = createCache({
      nodes: [createActiveNode('node-priority-steady')],
      services: [createMessageGroupService('node-priority-steady')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-priority-steady',
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        'node-priority-steady': {
          nodeId: 'node-priority-steady',
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
      membershipPublicationService: {
        getLatestPublicationForNode() {
          return {
            publicationEpoch: 15,
            status: 'PUBLISHED',
            createdAt: 1200,
            publishedActiveNodeIds: ['node-priority-steady'],
            priorityPartitionSummary: {
              satisfied: true,
              missingPartitionIds: [],
            },
          };
        },
      },
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness(
      'node-priority-steady',
    );

    t.equal(readiness.priorityControlPlaneRecovery.active, false);
    t.same(readiness.priorityControlPlaneRecovery.reasonCodes, []);
    t.equal(readiness.priorityControlPlaneRecovery.publicationStatus, 'PUBLISHED');
    t.end();
  });

test('ControlPlaneReadinessService exposes a normalized membership publication planning snapshot',
  (t) => {
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-planning-snapshot',
      systemTableCache: createCache(),
      membershipPublicationService: {
        getLatestPublicationForNodeSync() {
          return {
            publicationEpoch: 21,
            status: 'PUBLISHED',
            createdAt: 1200,
            publishedActiveNodeIds: ['node-planning-snapshot'],
            priorityPartitionSummary: {
              satisfied: false,
              missingPartitionIds: ['replica_operations-p1'],
            },
          };
        },
      },
      now: () => 1500,
    });

    const snapshot = readinessService.getMembershipPublicationPlanningSnapshotSync(
      'node-planning-snapshot',
      1500,
    );

    t.equal(snapshot?.publicationEpoch, 21);
    t.equal(snapshot?.publicationStatus, 'PUBLISHED');
    t.equal(snapshot?.publicationPending, false);
    t.equal(snapshot?.publicationExcludesTargetNode, false);
    t.equal(snapshot?.publishedMembershipIncludesTargetNode, true);
    t.equal(snapshot?.publishedPlanningEpoch, 21);
    t.same(
      snapshot?.priorityRecoveryReasonCodes,
      [CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD],
      'planning snapshot should preserve shared publication-recovery reasons',
    );
    t.end();
  });

test('ControlPlaneReadinessService preserves source snapshot version in membership publication diagnostics',
  async (t) => {
    const nodeId = 'node-publication-source-version';
    const cache = createCache({
      nodes: [createActiveNode(nodeId)],
      services: [createMessageGroupService(nodeId)],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId,
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        [nodeId]: {
          nodeId,
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
      membershipPublicationService: {
        getLatestPublicationForNode(targetNodeId) {
          if (targetNodeId !== nodeId) {
            return null;
          }
          return {
            publicationEpoch: 12,
            status: 'PUBLISHED',
            publishedActiveNodeIds: [nodeId],
            requiredAckNodeIds: [nodeId],
            acknowledgedNodeIds: [nodeId],
            sourceTopologyEpoch: 8,
            sourceSnapshotVersion: 34,
          };
        },
      },
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness(nodeId);

    t.equal(readiness.membershipPublication.publicationEpoch, 12);
    t.equal(readiness.membershipPublication.sourceSnapshotVersion, 34);
    t.end();
  });

test('ControlPlaneReadinessService refreshes stale published priority summaries before reporting recovery mode',
  async (t) => {
    const cache = createCache({
      nodes: [createActiveNode('node-priority-refresh')],
      services: [createMessageGroupService('node-priority-refresh')],
    });
    let reconcileOptions = null;
    const stalePublication = {
      publicationEpoch: 17,
      status: 'PUBLISHED',
      createdAt: 1200,
      publishedActiveNodeIds: ['node-priority-refresh'],
      priorityPartitionSummary: {
        satisfied: false,
        missingPartitionIds: ['sql_write_operations-p1'],
      },
    };
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-priority-refresh',
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        'node-priority-refresh': {
          nodeId: 'node-priority-refresh',
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
      membershipPublicationService: {
        async getLatestPublicationForNode() {
          return stalePublication;
        },
        async reconcileClusterMembership(options = {}) {
          reconcileOptions = options;
          return {
            publicationRow: {
              ...stalePublication,
              priorityPartitionSummary: {
                satisfied: true,
                missingPartitionIds: [],
              },
            },
          };
        },
      },
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness(
      'node-priority-refresh',
    );

    t.equal(readiness.priorityControlPlaneRecovery.active, false);
    t.same(readiness.priorityControlPlaneRecovery.reasonCodes, []);
    t.equal(
      reconcileOptions?.preferAuthoritativeRead,
      true,
      'stale published priority summaries should reconcile authoritatively',
    );
    t.equal(
      reconcileOptions?.latestPublicationRow,
      stalePublication,
      'reconcile should reuse the currently published row as the baseline',
    );
    t.end();
  });

test('ControlPlaneReadinessService keeps priority control-plane recovery mode active when published membership excludes the target node',
  async (t) => {
    const cache = createCache({
      nodes: [createActiveNode('node-priority-missing')],
      services: [createMessageGroupService('node-priority-missing')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-priority-missing',
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        'node-priority-missing': {
          nodeId: 'node-priority-missing',
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
      membershipPublicationService: {
        getLatestPublicationForNode() {
          return {
            publicationEpoch: 16,
            status: 'PUBLISHED',
            createdAt: 1200,
            publishedActiveNodeIds: ['different-node'],
            priorityPartitionSummary: {
              satisfied: true,
              missingPartitionIds: [],
            },
          };
        },
      },
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness(
      'node-priority-missing',
    );

    t.equal(readiness.priorityControlPlaneRecovery.active, true);
    t.same(
      readiness.priorityControlPlaneRecovery.reasonCodes,
      [CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING],
      'published membership that does not include the target node must remain in recovery mode',
    );
    t.end();
  });

test('ControlPlaneReadinessService marks hard-pressure nodes ineligible',
  async (t) => {
    const overloadedNode = {
      ...createActiveNode('node-3'),
      [COLUMN.CPU_USAGE_PERCENT]: 100,
    };
    const cache = createCache({
      nodes: [overloadedNode],
      services: [createMessageGroupService('node-3')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-3',
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        'node-3': {
          nodeId: 'node-3',
          budgetBytes: 1000,
          pressureState: 'hard',
        },
      }),
      cdcGroupPropagationService: createPublicationService({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: '2026-03-04T00:00:00.000Z',
        recentTransitions: [],
      }),
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness('node-3');
    const reasonCodes = readiness.reasons.map((reason) => reason.code);

    t.equal(readiness.dimensions.loadReady, false);
    t.equal(readiness.dimensions.placementEligible, false);
    t.ok(reasonCodes.includes(CONTROL_PLANE_READINESS_REASON.LOAD_NOT_READY));
    t.ok(
      reasonCodes.includes(
        CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_HARD,
      ),
    );
    t.end();
  });

test('ControlPlaneReadinessService fails closed without storage owner',
  async (t) => {
    const cache = createCache({
      nodes: [createActiveNode('node-4')],
      services: [createMessageGroupService('node-4')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-4',
      systemTableCache: cache,
      cdcGroupPropagationService: createPublicationService({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: '2026-03-04T00:00:00.000Z',
        recentTransitions: [],
      }),
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness('node-4');
    const reasonCodes = readiness.reasons.map((reason) => reason.code);

    t.equal(readiness.capacity, null);
    t.equal(readiness.dimensions.placementEligible, false);
    t.ok(
      reasonCodes.includes(
        CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE,
      ),
    );
    t.end();
  });

test('ControlPlaneReadinessService warns once when non-strict storage owner ' +
  'is unavailable',
async (t) => {
  const cache = createCache({
    nodes: [createActiveNode('node-4-warn')],
    services: [createMessageGroupService('node-4-warn')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-4-warn',
    systemTableCache: cache,
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });
  const warnCalls = [];
  const errorCalls = [];
  readinessService.logger = {
    warn(message, details) {
      warnCalls.push({message, details});
    },
    error(message, details) {
      errorCalls.push({message, details});
    },
  };

  await readinessService.getNodeReadiness('node-4-warn');
  await readinessService.getNodeReadiness('node-4-warn');

  t.equal(warnCalls.length, 1);
  t.equal(errorCalls.length, 0);
  t.match(warnCalls[0], {
    message: 'ControlPlaneReadinessService missing storage accounting owner',
    details: {
      nodeId: 'node-4-warn',
      owner: 'StorageCapacityAccountingService',
      strictOwnerDependencies: false,
    },
  });
  t.end();
});

test('ControlPlaneReadinessService fails closed without publication owner',
  async (t) => {
    let statsCalls = 0;
    const cache = createCache({
      nodes: [createActiveNode('node-5')],
      services: [createMessageGroupService('node-5')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-5',
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        'node-5': {
          nodeId: 'node-5',
          budgetBytes: 1000,
          pressureState: 'normal',
        },
      }),
      cdcGroupPropagationService: {
        getStats() {
          statsCalls += 1;
          return {
            lastFallbackReason: 'should_not_be_used',
          };
        },
      },
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness('node-5');
    const reasonCodes = readiness.reasons.map((reason) => reason.code);

    t.equal(
      readiness.publication.currentMode,
      CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY,
    );
    t.equal(readiness.dimensions.metadataPublicationHealthy, false);
    t.equal(readiness.dimensions.controlPlaneWritable, false);
    t.ok(
      reasonCodes.includes(
        CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_REPAIR_ONLY,
      ),
    );
    t.equal(statsCalls, 0, 'readiness should not synthesize publication via getStats fallback');
    t.end();
  });

test('ControlPlaneReadinessService warns once when non-strict publication ' +
  'owner is unavailable',
async (t) => {
  const cache = createCache({
    nodes: [createActiveNode('node-5-warn')],
    services: [createMessageGroupService('node-5-warn')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-5-warn',
    systemTableCache: cache,
    storageAccountingService: createAccountingService({
      'node-5-warn': {
        nodeId: 'node-5-warn',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    now: () => 1500,
  });
  const warnCalls = [];
  const errorCalls = [];
  readinessService.logger = {
    warn(message, details) {
      warnCalls.push({message, details});
    },
    error(message, details) {
      errorCalls.push({message, details});
    },
  };

  await readinessService.getNodeReadiness('node-5-warn');
  await readinessService.getNodeReadiness('node-5-warn');

  t.equal(warnCalls.length, 1);
  t.equal(errorCalls.length, 0);
  t.match(warnCalls[0], {
    message: 'ControlPlaneReadinessService missing CDC publication owner',
    details: {
      nodeId: 'node-5-warn',
      owner: 'CDCGroupPropagationService',
      strictOwnerDependencies: false,
    },
  });
  t.end();
});

test('ControlPlaneReadinessService strict mode throws without storage owner',
  async (t) => {
    const cache = createCache({
      nodes: [createActiveNode('node-strict-storage')],
      services: [createMessageGroupService('node-strict-storage')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-strict-storage',
      systemTableCache: cache,
      cdcGroupPropagationService: createPublicationService({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: '2026-03-04T00:00:00.000Z',
        recentTransitions: [],
      }),
      strictOwnerDependencies: true,
      now: () => 1500,
    });

    await t.rejects(
      readinessService.getNodeReadiness('node-strict-storage'),
      /storageAccountingService/,
      'strict readiness path must fail loudly when storage owner is absent',
    );
    t.end();
  });

test('ControlPlaneReadinessService strict mode throws without publication owner',
  async (t) => {
    const cache = createCache({
      nodes: [createActiveNode('node-strict-publication')],
      services: [createMessageGroupService('node-strict-publication')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-strict-publication',
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        'node-strict-publication': {
          nodeId: 'node-strict-publication',
          budgetBytes: 1000,
          pressureState: 'normal',
        },
      }),
      strictOwnerDependencies: true,
      now: () => 1500,
    });

    await t.rejects(
      readinessService.getNodeReadiness('node-strict-publication'),
      /cdcGroupPropagationService/,
      'strict readiness path must fail loudly when publication owner is absent',
    );
    t.end();
  });

// ── repairEligible / serveEligible stratification (task 6.1) ────────

test('readiness snapshot includes repairEligible and serveEligible ' +
  'dimensions from one shared snapshot ' +
  '(uses ControlPlaneReadinessService as canonical readiness owner)',
async (t) => {
  const cache = createCache({
    nodes: [createActiveNode('node-strat')],
    services: [createMessageGroupService('node-strat')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-strat',
    systemTableCache: cache,
    storageAccountingService: createAccountingService({
      'node-strat': {
        nodeId: 'node-strat',
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
    now: () => 1500,
  });

  const readiness = await readinessService.getNodeReadiness('node-strat');

  t.equal(readiness.dimensions.repairEligible, true,
    'fully ready node must be repair-eligible');
  t.equal(readiness.dimensions.serveEligible, true,
    'fully ready node must be serve-eligible');
  t.end();
});

test('repairEligible=true and serveEligible=false when loadReady=false ' +
  '(uses ControlPlaneReadinessService as canonical readiness owner)',
async (t) => {
  const overloadedNode = {
    ...createActiveNode('node-warm'),
    [COLUMN.CPU_USAGE_PERCENT]: 100,
  };
  const cache = createCache({
    nodes: [overloadedNode],
    services: [createMessageGroupService('node-warm')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-warm',
    systemTableCache: cache,
    storageAccountingService: createAccountingService({
      'node-warm': {
        nodeId: 'node-warm',
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
    now: () => 1500,
  });

  const readiness = await readinessService.getNodeReadiness('node-warm');

  t.equal(readiness.dimensions.loadReady, false,
    'node under load must not be load-ready');
  t.equal(readiness.dimensions.repairEligible, true,
    'node under load must still be repair-eligible');
  t.equal(readiness.dimensions.serveEligible, false,
    'node under load must not be serve-eligible');
  t.end();
});

test('serveEligible remains true while placementEligible is false when ' +
  'capacity is missing ' +
  '(uses ControlPlaneReadinessService as canonical readiness owner)',
async (t) => {
  const cache = createCache({
    nodes: [createActiveNode('node-nocap')],
    services: [createMessageGroupService('node-nocap')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-nocap',
    systemTableCache: cache,
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });

  const readiness = await readinessService.getNodeReadiness('node-nocap');

  t.equal(readiness.dimensions.repairEligible, true,
    'node without capacity data must still be repair-eligible');
  t.equal(readiness.dimensions.serveEligible, true,
    'node without capacity data must still be serve-eligible');
  t.equal(readiness.dimensions.placementEligible, false,
    'node without capacity data must not be placement-eligible');
  t.end();
});

test('both repairEligible and serveEligible false when cluster member ' +
  'unhealthy ' +
  '(uses ControlPlaneReadinessService as canonical readiness owner)',
async (t) => {
  const now = 200000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-unhealthy'),
      [COLUMN.CONNECTION_STATE]: STATE.DISCONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [createMessageGroupService('node-unhealthy')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.DISCONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-unhealthy': {
        nodeId: 'node-unhealthy',
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

  const readiness =
    await readinessService.getNodeReadiness('node-unhealthy');

  t.equal(readiness.dimensions.clusterMemberHealthy, false,
    'stale disconnected node must not be cluster-member-healthy');
  t.equal(readiness.dimensions.repairEligible, false,
    'unhealthy node must not be repair-eligible');
  t.equal(readiness.dimensions.serveEligible, false,
    'unhealthy node must not be serve-eligible');
  t.end();
});

test('sync snapshot includes repairEligible and serveEligible ' +
  '(uses ControlPlaneReadinessService as canonical readiness owner)',
async (t) => {
  const overloadedNode = {
    ...createActiveNode('node-sync'),
    [COLUMN.CPU_USAGE_PERCENT]: 100,
  };
  const cache = createCache({
    nodes: [overloadedNode],
    services: [createMessageGroupService('node-sync')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-sync',
    systemTableCache: cache,
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });

  const readiness = readinessService.getNodeReadinessSync('node-sync');

  t.equal(readiness.dimensions.repairEligible, true,
    'sync snapshot must include repair-eligible');
  t.equal(readiness.dimensions.serveEligible, false,
    'sync snapshot must reflect serve-ineligible when load not ready');
  t.end();
});

test('sync snapshot keeps serveEligible true when capacity is unavailable ' +
  'but load and transport are healthy ' +
  '(uses ControlPlaneReadinessService as canonical readiness owner)',
async (t) => {
  const cache = createCache({
    nodes: [createActiveNode('node-sync-nocap')],
    services: [createMessageGroupService('node-sync-nocap')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-sync-nocap',
    systemTableCache: cache,
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });

  const readiness = readinessService.getNodeReadinessSync('node-sync-nocap');

  t.equal(readiness.dimensions.repairEligible, true,
    'sync snapshot must include repair-eligible');
  t.equal(readiness.dimensions.serveEligible, true,
    'sync snapshot must keep serve-eligible without capacity data');
  t.equal(readiness.dimensions.placementEligible, false,
    'sync snapshot must still fail closed for placement eligibility');
  t.end();
});

test('sync snapshot uses synchronous publication and capacity accessors ' +
  'for recovery admission', async (t) => {
  const nodeId = 'node-sync-priority-recovery';
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: createCache({
      nodes: [createActiveNode(nodeId)],
      services: [createMessageGroupService(nodeId)],
    }),
    storageAccountingService: {
      async getCapacitySnapshotForNode() {
        return null;
      },
      getCapacitySnapshotForNodeSync(targetNodeId) {
        if (targetNodeId !== nodeId) {
          return null;
        }
        return {
          nodeId,
          budgetBytes: 1000,
          pressureState: 'normal',
        };
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    membershipPublicationService: {
      async getLatestPublicationForNode() {
        return null;
      },
      getLatestPublicationForNodeSync(targetNodeId) {
        if (targetNodeId !== nodeId) {
          return null;
        }
        return {
          publicationEpoch: 23,
          status: 'ACK_PENDING',
          publishedActiveNodeIds: [nodeId],
          requiredAckNodeIds: [nodeId],
          acknowledgedNodeIds: [],
        };
      },
    },
    now: () => 620000,
  });

  const readiness = readinessService.getNodeReadinessSync(nodeId);

  t.equal(readiness.membershipPublication.status, 'ACK_PENDING');
  t.equal(readiness.dimensions.controlPlanePublished, false);
  t.equal(readiness.dimensions.controlPlaneRecoveryEligible, true,
    'sync readiness should keep recovery open when publication is pending');
  t.equal(readiness.dimensions.placementEligible, true,
    'sync readiness should honor synchronous storage capacity snapshots');
  t.notOk(
    readiness.reasons.some((reason) => {
      return reason.code === CONTROL_PLANE_READINESS_REASON
        .STORAGE_BUDGET_UNAVAILABLE;
    }),
    'sync readiness should not fabricate storage budget failures when sync capacity exists',
  );
  t.end();
});

test('sync snapshot reuses a fresher stored readiness evaluation when the ' +
  'visible cache row regresses', async (t) => {
  let now = 100000;
  const nodeId = 'node-sync-fresher';
  const freshHeartbeat = now - 100;
  const freshLease = now + 15000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.LAST_HEARTBEAT]: freshHeartbeat,
      [COLUMN.READY_LEASE_EXPIRES_AT]: freshLease,
    }],
    services: [createMessageGroupService(nodeId)],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const fresh = await readinessService.getNodeReadiness(nodeId);
  t.equal(fresh.dimensions.serveEligible, true,
    'async owner evaluation should capture a serve-eligible snapshot');

  cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.LAST_HEARTBEAT]: now - 60000,
    [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
  });

  const reused = readinessService.getNodeReadinessSync(nodeId);
  t.equal(reused.dimensions.serveEligible, true,
    'sync callers should reuse the fresher stored snapshot');
  t.equal(
    reused.nodeEvidence?.lastHeartbeat,
    freshHeartbeat,
    'reused sync snapshot should preserve the fresher heartbeat evidence',
  );

  now = freshLease + 1;
  const expired = readinessService.getNodeReadinessSync(nodeId);
  t.equal(expired.dimensions.serveEligible, false,
    'stored sync snapshots must stop overriding cache rows after lease expiry');
  t.end();
});

test('sync readiness starts one deduped authoritative refresh for stale ' +
  'ineligible remote nodes', async (t) => {
  const now = 610000;
  const nodeId = 'node-sync-background-refresh';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [{
      ...createMessageGroupService(nodeId),
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
      [nodeId]: {
        nodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(
        tableName, _sql, _params, _options,
      ) {
        authoritativeReads.push(tableName);
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [{
              ...createActiveNode(nodeId),
              [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
              [COLUMN.LAST_HEARTBEAT]: now - 100,
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
  const options = {
    allowAuthoritativeRefresh: true,
    requireFreshOnIneligible: true,
    decisionDimension: CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
  };

  const initial = readinessService.getNodeReadinessSync(nodeId, options);
  const repeated = readinessService.getNodeReadinessSync(nodeId, options);

  t.equal(initial.dimensions.serveEligible, false,
    'stale local evidence should remain ineligible on the first sync read');
  t.equal(repeated.dimensions.serveEligible, false,
    'repeated sync reads should stay fail-closed until the owner refresh lands');
  t.same(authoritativeReads, [TABLES.NODES, TABLES.SERVICES],
    'sync reads should trigger one deduped authoritative node/service refresh');

  await new Promise((resolve) => setImmediate(resolve));

  const refreshed = readinessService.getNodeReadinessSync(nodeId, options);
  t.equal(refreshed.dimensions.serveEligible, true,
    'later sync reads should observe the repaired owner evidence');
  t.end();
});

test('missing node row sets both repairEligible and serveEligible false ' +
  '(uses ControlPlaneReadinessService as canonical readiness owner)',
async (t) => {
  const cache = createCache({nodes: [], services: []});
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });

  const readiness =
    await readinessService.getNodeReadiness('node-missing');

  t.equal(readiness.dimensions.repairEligible, false,
    'missing node must not be repair-eligible');
  t.equal(readiness.dimensions.serveEligible, false,
    'missing node must not be serve-eligible');
  t.end();
});

// ── serveEligible transport evidence (task 5.2) ─────────────────────
// Validates: Requirements 1.1, 1.2, 4.2, 4.3
// Design: 1.1, 1.2, 4.2
// serveEligible must fail closed when live transport evidence is
// explicitly negative, even when the node row lease is still valid.
// repairEligible may remain true because the lease is valid and the
// cluster member is healthy from the row perspective.

test('serveEligible fails closed when router reports disconnected ' +
  'despite valid lease ' +
  '(uses ControlPlaneReadinessService — transport evidence for ' +
  'serveEligible, Req 4.3)',
async (t) => {
  const now = 1500;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-valid-lease-disconnected'),
      [COLUMN.READY_LEASE_EXPIRES_AT]: now + 5000,
      [COLUMN.LAST_HEARTBEAT]: now - 500,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    }],
    services: [
      createMessageGroupService('node-valid-lease-disconnected'),
    ],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.DISCONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-valid-lease-disconnected': {
        nodeId: 'node-valid-lease-disconnected',
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

  const readiness = await readinessService
    .getNodeReadiness('node-valid-lease-disconnected');

  t.equal(readiness.dimensions.clusterMemberHealthy, true,
    'valid lease keeps cluster member healthy');
  t.equal(readiness.dimensions.repairEligible, true,
    'valid lease keeps repair-eligible (row evidence grace)');
  t.equal(readiness.dimensions.serveEligible, false,
    'explicit router disconnect must fail closed for serveEligible');
  t.end();
});

test('serveEligible remains true when router reports connected ' +
  'with valid lease ' +
  '(uses ControlPlaneReadinessService — transport evidence for ' +
  'serveEligible, Req 4.3)',
async (t) => {
  const now = 1500;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-connected-valid'),
      [COLUMN.READY_LEASE_EXPIRES_AT]: now + 5000,
      [COLUMN.LAST_HEARTBEAT]: now - 500,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    }],
    services: [
      createMessageGroupService('node-connected-valid'),
    ],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-connected-valid': {
        nodeId: 'node-connected-valid',
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

  const readiness = await readinessService
    .getNodeReadiness('node-connected-valid');

  t.equal(readiness.dimensions.serveEligible, true,
    'connected transport with valid lease must be serve-eligible');
  t.equal(readiness.dimensions.repairEligible, true,
    'connected transport with valid lease must be repair-eligible');
  t.end();
});

test('serveEligible preserves row-evidence grace when router has no ' +
  'transport evidence ' +
  '(uses ControlPlaneReadinessService — transport evidence for ' +
  'serveEligible, Req 4.3)',
async (t) => {
  const now = 1500;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-no-router-evidence'),
      [COLUMN.READY_LEASE_EXPIRES_AT]: now + 5000,
      [COLUMN.LAST_HEARTBEAT]: now - 500,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    }],
    services: [
      createMessageGroupService('node-no-router-evidence'),
    ],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return null;
      },
    },
    storageAccountingService: createAccountingService({
      'node-no-router-evidence': {
        nodeId: 'node-no-router-evidence',
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

  const readiness = await readinessService
    .getNodeReadiness('node-no-router-evidence');

  t.equal(readiness.dimensions.serveEligible, true,
    'no router evidence preserves row-evidence grace for serveEligible');
  t.equal(readiness.dimensions.repairEligible, true,
    'no router evidence preserves row-evidence grace for repairEligible');
  t.end();
});

// ── Transport-connected lease-grace for topology changes (§1.4.12) ──

test('isClusterMemberHealthy returns false for transport-connected node ' +
  'with expired lease and stale heartbeat during topology change ' +
  '(uses ControlPlaneReadinessService.isClusterMemberHealthy, ' +
  'verifies transport is no longer alternate membership truth)',
async (t) => {
  const now = 200000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-split-lag'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 35000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 10000,
    }],
    services: [createMessageGroupService('node-split-lag')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-split-lag': {
        nodeId: 'node-split-lag',
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

  const readiness = await readinessService
    .getNodeReadiness('node-split-lag');

  t.equal(readiness.dimensions.clusterMemberHealthy, false,
    'transport-connected active node must not remain cluster-member-healthy ' +
    'once lease evidence is stale');
  t.equal(readiness.dimensions.serveEligible, false,
    'transport-connected active node must not remain serve-eligible ' +
    'when membership evidence is stale');
  t.equal(readiness.dimensions.controlPlaneWritable, false,
    'transport-connected active node must not remain control-plane-writable ' +
    'when membership evidence is stale');
  t.equal(readiness.dimensions.controlPlaneRecoveryEligible, true,
    'transport-connected active node may still remain recovery-eligible');
  t.end();
});

test('transport-connected startup node remains recovery-eligible when a stale ' +
  'stopped message-group row is the only remaining pre-cutover service row ' +
  '(uses ControlPlaneReadinessService.hasWritableControlPlaneService, ' +
  'verifies bootstrap-to-runtime handoff does not self-block register-service)',
async (t) => {
  const now = 200000;
  const joiningNodeId = 'node-restarting';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(joiningNodeId),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 1000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 5000,
    }],
    services: [
      {
        ...createMessageGroupService(joiningNodeId),
        [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
      },
      createPartitionService(joiningNodeId, 'services-p1-r1'),
    ],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      [joiningNodeId]: {
        nodeId: joiningNodeId,
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

  const readiness = await readinessService
    .getNodeReadiness(joiningNodeId);

  t.equal(readiness.dimensions.clusterMemberHealthy, false,
    'transport-connected startup node should not bypass stale lease evidence');
  t.equal(readiness.dimensions.routingReady, true,
    'active partition service routing should stay available during startup recovery');
  t.equal(readiness.dimensions.controlPlaneWritable, false,
    'stale membership evidence must still block ordinary control-plane writes');
  t.equal(readiness.dimensions.repairEligible, false,
    'startup recovery must not reopen repair eligibility from transport alone');
  t.equal(readiness.dimensions.controlPlaneRecoveryEligible, true,
    'startup recovery must remain recovery-eligible so register-service can replace the stale row');
  t.end();
});

test('isClusterMemberHealthy returns false for transport-connected node ' +
  'with an explicit no-ready-lease watermark ' +
  '(uses ControlPlaneReadinessService.isClusterMemberHealthy, ' +
  'verifies durable rejoin quarantine beats transport grace)',
async (t) => {
  const now = 200000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-durable-rejoin'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 1000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: null,
    }],
    services: [createMessageGroupService('node-durable-rejoin')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-durable-rejoin': {
        nodeId: 'node-durable-rejoin',
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

  const readiness = await readinessService
    .getNodeReadiness('node-durable-rejoin');

  t.equal(readiness.dimensions.clusterMemberHealthy, false,
    'transport-connected node must stay cluster-member-unhealthy when the owner explicitly cleared its ready lease');
  t.equal(readiness.dimensions.serveEligible, false,
    'transport-connected node must not be serve-eligible while durable rejoin quarantine is active');
  t.equal(readiness.dimensions.controlPlaneWritable, false,
    'transport-connected node must not be control-plane-writable while durable rejoin quarantine is active');
  t.end();
});

test('isClusterMemberHealthy returns false for transport-disconnected ' +
  'node with expired lease even with recent heartbeat ' +
  '(uses ControlPlaneReadinessService.isClusterMemberHealthy, ' +
  'verifies §1.4.12 transport reconciliation)',
async (t) => {
  const now = 120000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-actually-down'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 5000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 2000,
    }],
    services: [createMessageGroupService('node-actually-down')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.DISCONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-actually-down': {
        nodeId: 'node-actually-down',
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

  const readiness = await readinessService
    .getNodeReadiness('node-actually-down');

  t.equal(readiness.dimensions.clusterMemberHealthy, false,
    'transport-disconnected node must be cluster-member-unhealthy ' +
    'even with recent heartbeat');
  t.equal(readiness.dimensions.serveEligible, false,
    'transport-disconnected node must not be serve-eligible');
  t.end();
});

test('load-lane readiness forces fresh evaluation on cache invalidation ' +
  'instead of serving stale snapshot ' +
  '(uses ControlPlaneReadinessService.getNodeReadiness, ' +
  'verifies load-lane does not use allowStaleOnCacheChange)',
async (t) => {
  const now = 120000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-cache-lag'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 1000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
    }],
    services: [createMessageGroupService('node-cache-lag')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-cache-lag': {
        nodeId: 'node-cache-lag',
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
    'node-cache-lag',
    {maxCachedAgeMs: 5000},
  );
  t.equal(first.dimensions.serveEligible, true,
    'initial snapshot must be serve-eligible');

  readinessService.handleCacheChange(TABLES.SERVICES, {
    [COLUMN.NODE_ID]: 'node-cache-lag',
    [COLUMN.SERVICE_ID]: 'svc-changed',
  });

  const second = await readinessService.getNodeReadiness(
    'node-cache-lag',
    {
      maxCachedAgeMs: 5000,
      allowStaleOnCacheChange: false,
      requireFreshOnIneligible: true,
      decisionDimension:
        CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
    },
  );

  t.not(first, second,
    'cache invalidation must force fresh evaluation when ' +
    'allowStaleOnCacheChange is false');
  t.end();
});

// ── Self-node admission denial regression (§1.4.12) ────────────────
// Reproduces: 7-node partition-split harness node 11601fe0 self-denial
// during CDC propagation delay. The local node's cache has an expired
// ready_lease_expires_at because the heartbeat CDC event has not
// propagated back yet. The node must NOT deny its own cluster membership
// when it is the one running the readiness check.

test('isClusterMemberHealthy returns true for self-node with expired ' +
  'lease and stale row connection_state ' +
  '(uses ControlPlaneReadinessService.isClusterMemberHealthy, ' +
  'verifies §1.4.12 self-node fast path)',
async (t) => {
  const now = 200000;
  const selfNodeId = 'node-self';
  // Simulate CDC propagation delay: the node row in cache has an
  // expired lease AND a stale/missing connection_state. The
  // messageRouter also returns null (no connection entry). This
  // reproduces the 7-node harness scenario where node 11601fe0
  // denied its own load-lane admission during a partition split.
  const cache = createCache({
    nodes: [{
      ...createActiveNode(selfNodeId),
      [COLUMN.LAST_HEARTBEAT]: now - 35000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 10000,
    }],
    services: [createMessageGroupService(selfNodeId)],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: selfNodeId,
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return null;
      },
    },
    storageAccountingService: createAccountingService({
      [selfNodeId]: {
        nodeId: selfNodeId,
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

  const readiness = await readinessService
    .getNodeReadiness(selfNodeId);

  t.equal(readiness.dimensions.clusterMemberHealthy, true,
    'self-node must remain cluster-member-healthy despite expired ' +
    'lease and no transport evidence — the node is alive and ' +
    'running the check (§1.4.12)');
  t.equal(readiness.dimensions.serveEligible, true,
    'self-node must remain serve-eligible when only the cache ' +
    'lease is stale');
  t.equal(readiness.dimensions.controlPlaneWritable, true,
    'self-node must remain control-plane-writable when only the ' +
    'cache lease is stale');
  t.end();
});

test('isClusterMemberHealthy self-node fast path does not apply to ' +
  'remote nodes ' +
  '(uses ControlPlaneReadinessService.isClusterMemberHealthy, ' +
  'verifies §1.4.12 self-node scope)',
async (t) => {
  const now = 200000;
  const selfNodeId = 'node-self';
  const remoteNodeId = 'node-remote';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(remoteNodeId),
      [COLUMN.LAST_HEARTBEAT]: now - 35000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 10000,
    }],
    services: [createMessageGroupService(remoteNodeId)],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: selfNodeId,
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return null;
      },
    },
    storageAccountingService: createAccountingService({
      [remoteNodeId]: {
        nodeId: remoteNodeId,
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

  const readiness = await readinessService
    .getNodeReadiness(remoteNodeId);

  t.equal(readiness.dimensions.clusterMemberHealthy, false,
    'remote node with expired lease and no transport must be ' +
    'cluster-member-unhealthy — self-node fast path must not ' +
    'apply to other nodes');
  t.end();
});

test('isClusterMemberHealthy self-node fast path requires active ' +
  'status ' +
  '(uses ControlPlaneReadinessService.isClusterMemberHealthy, ' +
  'verifies §1.4.12 self-node scope)',
async (t) => {
  const now = 200000;
  const selfNodeId = 'node-self-inactive';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(selfNodeId),
      [COLUMN.STATUS]: 'shutting_down',
      [COLUMN.LAST_HEARTBEAT]: now - 35000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 10000,
    }],
    services: [createMessageGroupService(selfNodeId)],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: selfNodeId,
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return null;
      },
    },
    storageAccountingService: createAccountingService({
      [selfNodeId]: {
        nodeId: selfNodeId,
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

  const readiness = await readinessService
    .getNodeReadiness(selfNodeId);

  t.equal(readiness.dimensions.clusterMemberHealthy, false,
    'self-node with non-active status must not use the self-node ' +
    'fast path — shutting_down nodes are not healthy cluster ' +
    'members');
  t.end();
});

test('ControlPlaneReadinessService retains recovery admission on live ' +
  'transport and service evidence', async (t) => {
  const now = 500000;
  const nodeId = 'node-recovery-grace';
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: createCache({
      nodes: [{
        ...createActiveNode(nodeId),
        [COLUMN.LAST_HEARTBEAT]: now - 60000,
        [COLUMN.READY_LEASE_EXPIRES_AT]: now - 5000,
      }],
      services: [createMessageGroupService(nodeId)],
    }),
    messageRouter: {
      getConnectionState(targetNodeId) {
        return targetNodeId === nodeId ? STATE.CONNECTED : STATE.DISCONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      [nodeId]: {
        nodeId,
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

  const readiness = await readinessService.getNodeReadiness(nodeId);

  t.equal(readiness.dimensions.clusterMemberHealthy, false,
    'transport-backed reconciliation should not keep cluster membership healthy');
  t.equal(readiness.dimensions.controlPlaneWritable, false,
    'active control-plane service evidence should not remain writable without membership evidence');
  t.equal(readiness.dimensions.controlPlaneRecoveryEligible, true,
    'recovery eligibility should stay open on live transport and service evidence');
  t.equal(readiness.dimensions.repairEligible, false,
    'transport-backed recovery grace must not keep repair admission open');
  t.end();
});

test('ControlPlaneReadinessService records recovery participation ' +
  'decisions in the diagnostics ledger', (t) => {
  const nodeId = 'node-recovery-ledger';
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: createCache({
      nodes: [createActiveNode(nodeId)],
      services: [createMessageGroupService(nodeId)],
    }),
    messageRouter: {
      getConnectionState(targetNodeId) {
        return targetNodeId === nodeId ? STATE.CONNECTED : STATE.DISCONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      [nodeId]: {
        nodeId,
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
    now: () => 1500,
  });
  readinessService.recordAuthoritativeReadinessRepair({
    nodeId,
    repairKey: 'repair:node-participation-ledger',
    stage: 'completed',
    outcome: 'repaired',
    repaired: true,
    serviceRowCount: 1,
  });

  const participation = readinessService.getControlPlaneParticipationSync(
    nodeId,
    {
      participationKind:
        CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY,
      decisionDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      tableName: TABLES.SERVICES,
      partitionId: 'services-p1',
    },
  );
  const ledgerEntries =
    readinessService.getParticipationDecisionLedgerEntries();
  const latestEntry = ledgerEntries[ledgerEntries.length - 1] || null;

  t.equal(participation.eligible, true, 'recovery participation should pass');
  t.match(latestEntry, {
    nodeId,
    tableName: TABLES.SERVICES,
    partitionId: 'services-p1',
    participationKind:
      CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY,
    decisionDimension:
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    eligible: true,
    cacheWatermark: {
      lastHeartbeat: 1000,
      readyLeaseExpiresAt: 2000,
    },
    transportState: {
      connected: true,
      rowState: null,
      routerState: 'connected',
    },
    authoritativeRepair: {
      stage: 'completed',
      outcome: 'repaired',
      repaired: true,
      serviceRowCount: 1,
    },
    lifecyclePhase: 'active',
  });
  t.end();
});

test('ControlPlaneReadinessService records authoritative repair attempts ' +
  'and recovery epochs', async (t) => {
  let now = 520000;
  const nodeId = 'node-recovery-epoch';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 5000,
    }],
    services: [{
      ...createMessageGroupService(nodeId),
      [COLUMN.STATUS]: 'syncing',
    }],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState(targetNodeId) {
        return targetNodeId === nodeId ? STATE.CONNECTED : STATE.DISCONNECTED;
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
      async executeAuthoritativeSystemTableRead(tableName) {
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [{
              ...createActiveNode(nodeId),
              [COLUMN.LAST_HEARTBEAT]: now - 25,
              [COLUMN.READY_LEASE_EXPIRES_AT]: now + 15000,
            }],
            source: 'sql_query_engine',
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [createMessageGroupService(nodeId)],
            source: 'sql_query_engine',
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

  await readinessService.getNodeReadiness(nodeId, {
    allowAuthoritativeRefresh: false,
  });
  now += 1000;
  const repairedReadiness = await readinessService.getNodeReadiness(
    nodeId,
    {allowAuthoritativeRefresh: true},
  );
  const repairStages =
    readinessService.getAuthoritativeReadinessRepairLedgerEntries()
      .map((entry) => entry.stage);
  const recoveryEpochs =
    readinessService.getRecoveryEpochHistoryByNodeId()[nodeId] || [];

  t.equal(repairedReadiness.dimensions.clusterMemberHealthy, true,
    'authoritative repair should restore healthy membership');
  t.ok(repairStages.includes('scheduled'),
    'repair ledger should retain the scheduled stage');
  t.ok(repairStages.includes('completed'),
    'repair ledger should retain the completed stage');
  t.equal(recoveryEpochs.length, 1,
    'closed recovery history should retain one completed epoch');
  t.equal(recoveryEpochs[0].open, false,
    'repaired readiness should close the recovery epoch');
  t.ok(recoveryEpochs[0].events.length >= 2,
    'recovery epoch should retain both degraded and recovered observations');
  t.end();
});

test('ControlPlaneReadinessService getNodeReadiness remains read-only for ' +
  'lifecycle and placement state when no authoritative refresh is requested',
async (t) => {
  const nodeId = 'node-read-only';
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: createCache({
      nodes: [createActiveNode(nodeId)],
      services: [createMessageGroupService(nodeId)],
    }),
    cacheMutationTarget: {
      applySystemTableChange() {
        t.fail('readiness projection must not mutate cached lifecycle or placement rows');
      },
    },
    controlPlaneSystemTableGateway: {
      reconcileAuthoritativeCacheRows() {
        t.fail('readiness projection must not reconcile authoritative rows without an explicit refresh path');
      },
      submitMutation() {
        t.fail('readiness projection must not submit lifecycle or placement mutations');
      },
      executeQuery() {
        t.fail('readiness projection must not execute write queries');
      },
    },
    storageAccountingService: createAccountingService({
      [nodeId]: {
        nodeId,
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
    now: () => 610000,
  });

  const readiness = await readinessService.getNodeReadiness(nodeId, {
    allowAuthoritativeRefresh: false,
  });

  t.equal(typeof readiness.dimensions.repairEligible, 'boolean',
    'readiness should still derive repair eligibility as projection state');
  t.equal(typeof readiness.dimensions.placementEligible, 'boolean',
    'readiness should still derive placement eligibility as projection state');
  t.end();
});

test('ControlPlaneReadinessService authoritative refresh reconciles ' +
  'projection cache evidence without submitting lifecycle or placement writes',
async (t) => {
  let now = 620000;
  const nodeId = 'node-projection-reconcile-only';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 5000,
    }],
    services: [{
      ...createMessageGroupService(nodeId),
      [COLUMN.STATUS]: 'syncing',
    }],
  });
  const gatewayCalls = [];
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cacheMutationTarget: {
      applySystemTableChange() {
        t.fail('authoritative refresh must delegate projection repair through the gateway');
      },
    },
    controlPlaneSystemTableGateway: {
      async reconcileAuthoritativeCacheRows(tableName, rows, options) {
        gatewayCalls.push({tableName, rows, options});
        return {
          success: true,
          mutationCount: Array.isArray(rows) ? rows.length : 0,
        };
      },
      submitMutation() {
        t.fail('authoritative readiness refresh must not submit lifecycle or placement mutations');
      },
      executeQuery() {
        t.fail('authoritative readiness refresh must not execute write queries');
      },
    },
    messageRouter: {
      getConnectionState(targetNodeId) {
        return targetNodeId === nodeId ? STATE.CONNECTED : STATE.DISCONNECTED;
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
      async executeAuthoritativeSystemTableRead(tableName) {
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [{
              ...createActiveNode(nodeId),
              [COLUMN.LAST_HEARTBEAT]: now - 25,
              [COLUMN.READY_LEASE_EXPIRES_AT]: now + 15000,
            }],
            source: 'sql_query_engine',
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [createMessageGroupService(nodeId)],
            source: 'sql_query_engine',
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

  await readinessService.getNodeReadiness(nodeId, {
    allowAuthoritativeRefresh: false,
  });
  now += 1000;
  const repairedReadiness = await readinessService.getNodeReadiness(nodeId, {
    allowAuthoritativeRefresh: true,
    decisionDimension: 'repairEligible',
  });

  t.equal(typeof repairedReadiness.dimensions.repairEligible, 'boolean',
    'authoritative refresh should still return one projected readiness snapshot');
  t.same(
    gatewayCalls.map((call) => call.tableName),
    [TABLES.NODES, TABLES.SERVICES],
    'authoritative refresh should only reconcile projected node and service rows',
  );
  t.ok(gatewayCalls.every((call) => call.options?.causeId),
    'authoritative refresh should preserve reconciliation cause ids');
  t.end();
});

test('ControlPlaneReadinessService exposes controlPlanePublished while keeping recovery eligibility open during publication convergence', async (t) => {
  const now = 610000;
  const nodeId = 'node-publication-pending';
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: createCache({
      nodes: [createActiveNode(nodeId)],
      services: [createMessageGroupService(nodeId)],
    }),
    messageRouter: {
      getConnectionState(targetNodeId) {
        return targetNodeId === nodeId ? STATE.CONNECTED : STATE.DISCONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      [nodeId]: {
        nodeId,
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
    membershipPublicationService: {
      getLatestPublicationForNode(targetNodeId) {
        if (targetNodeId !== nodeId) {
          return null;
        }
        return {
          publicationEpoch: 14,
          status: 'ACK_PENDING',
          publishedActiveNodeIds: [nodeId],
          requiredAckNodeIds: [nodeId],
          acknowledgedNodeIds: [],
        };
      },
    },
    now: () => now,
  });

  const readiness = await readinessService.getNodeReadiness(nodeId);

  t.equal(
    readiness.dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED
    ],
    false,
    'canonical readiness should expose a false controlPlanePublished dimension until the durable publication epoch is closed',
  );
  t.equal(
    readiness.dimensions.controlPlaneRecoveryEligible,
    true,
    'recovery eligibility should stay open while the publication epoch is still awaiting acknowledgement so recovery traffic can finish convergence',
  );
  t.end();
});

test('ControlPlaneReadinessService awaits async membership publication reads before computing recovery eligibility', async (t) => {
  const nodeId = 'node-publication-async';
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: createCache({
      nodes: [createActiveNode(nodeId)],
      services: [createMessageGroupService(nodeId)],
    }),
    storageAccountingService: createAccountingService({
      [nodeId]: {
        nodeId,
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
    membershipPublicationService: {
      async getLatestPublicationForNode(targetNodeId) {
        if (targetNodeId !== nodeId) {
          return null;
        }
        return {
          publicationEpoch: 22,
          status: 'ACK_PENDING',
          publishedActiveNodeIds: [nodeId],
          requiredAckNodeIds: [nodeId],
          acknowledgedNodeIds: [],
        };
      },
    },
    now: () => 610000,
  });

  const readiness = await readinessService.getNodeReadiness(nodeId, {
    maxCachedAgeMs: 0,
  });

  t.equal(readiness.membershipPublication.status, 'ACK_PENDING');
  t.equal(readiness.dimensions.controlPlanePublished, false);
  t.equal(readiness.dimensions.controlPlaneRecoveryEligible, true,
    'async readiness should await publication state and keep recovery open during convergence');
  t.end();
});
