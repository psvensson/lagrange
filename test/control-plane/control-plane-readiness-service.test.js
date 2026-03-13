import {test} from '../../src/test-helpers/tap.js';
import {
  COLUMN,
  STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';

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

test('ControlPlaneReadinessService tolerates short stale-lease windows when ' +
  'transport is connected', async (t) => {
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

  t.equal(readiness.dimensions.clusterMemberHealthy, true);
  t.equal(readiness.dimensions.controlPlaneWritable, true);
  t.equal(readiness.dimensions.placementEligible, true);
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

test('ControlPlaneReadinessService preserves row-evidence grace when router ' +
  'has no current transport evidence', async (t) => {
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

  t.equal(readiness.dimensions.clusterMemberHealthy, true);
  t.equal(readiness.dimensions.repairEligible, true);
  t.equal(readiness.dimensions.serveEligible, true);
  t.equal(readiness.dimensions.controlPlaneWritable, true);
  t.equal(readiness.dimensions.placementEligible, true);
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

  t.equal(first.dimensions.clusterMemberHealthy, true,
    'transport-connected node stays healthy despite stale cache (§1.4.12)');
  t.equal(second.dimensions.clusterMemberHealthy, true,
    'cached snapshot preserves transport-connected healthy status');
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
      undefined,
      'readiness repair must not accept stale local replica fallback rows',
    );
    t.equal(
      read.options?.queryOptions?.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      'readiness repair fallback must stay on repairEligible routing',
    );
    t.match(
      String(read.options?.queryOptions?.sessionId || ''),
      /^authoritative-control-plane-read:/,
      'readiness repair fallback should isolate the SQL session',
    );
  }
  t.end();
});

test('ControlPlaneReadinessService keeps self-node repairs on the authoritative ' +
  'owner path with repair-eligible routed fallback available',
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
  t.equal(authoritativeReads.length, 2,
    'self readiness should still perform bounded node and service reads');
  for (const read of authoritativeReads) {
    t.match(read.options, {
      localReadConsistency: 'local_leader',
      allowSqlFallback: true,
    });
    t.equal(
      read.options?.queryOptions?.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      'self readiness fallback must stay on repairEligible routing',
    );
    t.match(
      String(read.options?.queryOptions?.sessionId || ''),
      /^authoritative-control-plane-read:/,
      'self readiness fallback should isolate the SQL session',
    );
  }
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
              CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE ||
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
      CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      'repair fallback must stay on repairEligible routing',
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

test('isClusterMemberHealthy returns true for transport-connected node ' +
  'with expired lease and stale heartbeat during topology change ' +
  '(uses ControlPlaneReadinessService.isClusterMemberHealthy, ' +
  'verifies §1.4.12 transport reconciliation)',
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

  t.equal(readiness.dimensions.clusterMemberHealthy, true,
    'transport-connected active node must remain cluster-member-healthy ' +
    'despite expired lease and stale heartbeat in cache');
  t.equal(readiness.dimensions.serveEligible, true,
    'transport-connected active node must remain serve-eligible ' +
    'despite stale cache evidence');
  t.equal(readiness.dimensions.controlPlaneWritable, true,
    'transport-connected active node must remain control-plane-writable ' +
    'despite stale cache evidence');
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
