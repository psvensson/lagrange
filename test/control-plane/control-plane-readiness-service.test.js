import {test} from '../../src/test-helpers/tap.js';
import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';

function createCache({nodes = [], services = []} = {}) {
  const nodeRows = new Map(nodes.map((row) => [row[COLUMN.NODE_ID], row]));

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
        return services;
      }
      return [];
    },
    filter(tableName, predicate) {
      if (tableName !== TABLES.SERVICES) {
        return [];
      }
      return services.filter((row) => predicate(row));
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
