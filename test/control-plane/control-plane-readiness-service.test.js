import {test} from '../../src/test-helpers/tap.js';
import {
  COLUMN,
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
} from '../../src/control-plane/control-plane-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
} from '../../src/cdc/cdc-integration-service.js';
import {
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
  t.equal(
    readiness.runtimeAuthority.state,
    TEST_RUNTIME_AUTHORITY_STATE.CONFIRMED,
  );
  t.equal(readiness.runtimeAuthority.authorityAvailable, true);
  t.equal(
    readiness.runtimeAuthority.publication.state,
    TEST_RUNTIME_AUTHORITY_PUBLICATION_STATE.HEALTHY,
  );
  t.equal(
    readiness.runtimeAuthority.visibility.state,
    TEST_RUNTIME_AUTHORITY_VISIBILITY_STATE.CONFIRMED,
  );
  t.equal(
    readiness.runtimeAuthority.repair.state,
    TEST_RUNTIME_AUTHORITY_REPAIR_STATE.NOT_ATTEMPTED,
  );
  t.equal(
    readiness.runtimeAuthority.provisioning.state,
    TEST_PROVISIONING_STATE.STEADY,
  );
  t.equal(readiness.runtimeAuthority.failure.state, TEST_DESCRIPTOR_STATE.NONE);
  t.same(readiness.reasons, []);
  t.end();
});

test('ControlPlaneReadinessService builds establishing runtime authority ' +
  'during publication convergence', async (t) => {
  const nodeId = 'node-runtime-authority-establishing';
  const service = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: createCache(),
    now: () => 1500,
  });
  const nodeRow = createActiveNode(nodeId);
  const snapshot = service.buildRuntimeAuthoritySnapshot({
    nodeId,
    lifecycleState: 'running',
    membershipPublication: {
      status: 'ACK_PENDING',
      publicationObservationState: 'establishing',
      createdAt: '2026-04-14T17:30:00.000Z',
    },
    membershipPublicationPlanningSnapshot: {
      publicationStatus: 'ACK_PENDING',
      publicationObservationState: 'establishing',
      priorityPartitionSummary: {
        satisfied: true,
      },
      priorityRecoveryReasonCodes: [
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
      ],
    },
    nodeEvidence: service.buildNodeEvidence(nodeId, nodeRow),
    nodeRow,
    observedAt: '2026-04-14T17:30:00.000Z',
    publication: {
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-04-14T17:29:00.000Z',
    },
    serviceRows: [createMessageGroupService(nodeId)],
  });

  t.equal(snapshot.state, TEST_RUNTIME_AUTHORITY_STATE.ESTABLISHING);
  t.equal(snapshot.authorityAvailable, true);
  t.equal(snapshot.ready, false);
  t.equal(
    snapshot.visibility.state,
    TEST_RUNTIME_AUTHORITY_VISIBILITY_STATE.PENDING_PUBLICATION,
  );
  t.equal(
    snapshot.provisioning.state,
    TEST_PROVISIONING_STATE.CONVERGENCE_GRACE,
  );
  t.equal(snapshot.recoveryEligible, true);
  t.equal(snapshot.failure.state, TEST_DESCRIPTOR_STATE.NONE);
  t.same(
    snapshot.reasonCodes,
    [
      CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_PUBLICATION_PENDING,
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
    ],
  );
  t.end();
});

test('ControlPlaneReadinessService builds retained runtime authority for ' +
  'self runtime grace', async (t) => {
  const nodeId = 'node-runtime-authority-retained';
  const service = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: createCache(),
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
      getQueryDataPlaneTransportReadiness() {
        return {
          ready: true,
        };
      },
    },
    now: () => 1500,
  });
  const snapshot = service.buildRuntimeAuthoritySnapshot({
    nodeId,
    lifecycleState: 'running',
    membershipPublication: null,
    membershipPublicationPlanningSnapshot: null,
    missingNodeReadinessState:
      TEST_MISSING_NODE_READINESS_STATE.SELF_RUNTIME_GRACE,
    nodeEvidence: service.buildMissingSelfNodeEvidence(nodeId),
    nodeRow: null,
    observedAt: '2026-04-14T17:31:00.000Z',
    publication: {
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-04-14T17:30:00.000Z',
    },
    serviceRows: [createMessageGroupService(nodeId)],
  });

  t.equal(snapshot.state, TEST_RUNTIME_AUTHORITY_STATE.RETAINED);
  t.equal(snapshot.authorityAvailable, true);
  t.equal(snapshot.ready, false);
  t.equal(
    snapshot.visibility.state,
    TEST_RUNTIME_AUTHORITY_VISIBILITY_STATE.RETAINED_LOCAL_RUNTIME,
  );
  t.equal(snapshot.repairEligible, true);
  t.equal(
    snapshot.provisioning.state,
    TEST_PROVISIONING_STATE.STEADY,
  );
  t.equal(snapshot.failure.state, TEST_DESCRIPTOR_STATE.NONE);
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
          state: 'deferred',
          reason: 'query ingress owner not ready',
          reasonCode: 'query_transport_not_ready',
          errorCode: 'ROUTER_QUERY_TRANSPORT_NOT_READY',
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
    readiness.nodeEvidence?.localQueryTransportReasonCode,
    'query_transport_not_ready',
    'self readiness should preserve the typed local query transport reason code',
  );
  t.equal(
    readiness.nodeEvidence?.localQueryTransportErrorCode,
    'ROUTER_QUERY_TRANSPORT_NOT_READY',
    'self readiness should preserve the stable local query transport error code',
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
          state: 'deferred',
          reason: 'query ingress owner not ready',
          reasonCode: 'query_transport_not_ready',
          errorCode: 'ROUTER_QUERY_TRANSPORT_NOT_READY',
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
          state: 'deferred',
          reason: 'query ingress owner not ready',
          reasonCode: 'query_transport_not_ready',
          errorCode: 'ROUTER_QUERY_TRANSPORT_NOT_READY',
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

test('ControlPlaneReadinessService accepts single-row owner reads that return ' +
  'plain rows instead of envelopes', async (t) => {
  const nodeRow = createActiveNode('node-1');
  const serviceRow = createMessageGroupService('node-1');
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-1',
    systemTableCache: {
      get() {
        throw new Error('direct cache get should not be used');
      },
      getAll() {
        throw new Error('direct cache getAll should not be used');
      },
      filter() {
        throw new Error('direct cache filter should not be used');
      },
      onCacheChange() {},
    },
    nodesOwner: {
      async getNode(_nodeId) {
        return nodeRow;
      },
    },
    servicesOwner: {
      async listServices() {
        return {
          success: true,
          rows: [serviceRow],
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

  const readiness = await readinessService.getNodeReadiness('node-1', {
    allowAuthoritativeRefresh: true,
  });

  t.equal(readiness.dimensions.routingReady, true);
  t.equal(readiness.dimensions.controlPlaneWritable, true);
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
  t.equal(readiness.dimensions.provisioningEligible, false);
  t.equal(readiness.dimensions.placementEligible, false);
  t.equal(readiness.dimensions.controlPlaneRecoveryEligible, true);
  t.end();
});

test('ControlPlaneReadinessService opens provisioning grace during ' +
  'publication convergence when recovery stays available', async (t) => {
  const now = 120000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-convergence-grace'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 4000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 1000,
    }],
    services: [createMessageGroupService('node-convergence-grace')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState(nodeId) {
        return nodeId === 'node-convergence-grace' ?
          STATE.CONNECTED :
          STATE.DISCONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-convergence-grace': {
        nodeId: 'node-convergence-grace',
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
          publicationEpoch: 21,
          status: 'ACK_PENDING',
        };
      },
    },
    now: () => now,
  });

  const readiness = await readinessService.getNodeReadiness(
    'node-convergence-grace',
  );

  t.equal(readiness.dimensions.clusterMemberHealthy, false);
  t.equal(readiness.dimensions.repairEligible, false);
  t.equal(readiness.dimensions.controlPlaneRecoveryEligible, true);
  t.equal(readiness.dimensions.provisioningEligible, true,
    'publication convergence should reopen topology provisioning while repair stays closed');
  t.equal(readiness.dimensions.placementEligible, true,
    'placement should stay available when provisioning grace and capacity both hold');
  t.equal(readiness.dimensions.serveEligible, false,
    'serve admission must remain closed on stale membership evidence');
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
