import {test} from '../../src/test-helpers/tap.js';
import {
  COLUMN,
  STATE,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {createAccountingService, createActiveNode, createCache, createMessageGroupService, createPublicationService} from './control-plane-readiness-service-planning-snapshot-support.js';

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

