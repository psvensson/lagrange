import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_GOVERNOR_REASON,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../../src/control-plane/pressure-governor.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {
  buildControlPlaneWorkloadProfile,
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../../src/control-plane/control-plane-workload-profile.js';

function initializeMessageRouterTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'node-a'},
    logging: {level: 'error'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function cleanupMessageRouterTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

test('PressureGovernor allows critical work during transport pressure',
  async (t) => {
    const governor = new PressureGovernor({
      nodeId: 'node-a',
      messageRouter: {
        getOutboundPressureSummary() {
          return {
            backpressured: true,
            saturatedNodeCount: 1,
            totalPending: 64,
            maxPendingUtilization: 1,
          };
        },
      },
    });

    const decision = governor.evaluate({
      workClass: PRESSURE_WORK_CLASS.CRITICAL,
      resourceKeys: ['control-plane:write'],
      allowDegrade: true,
      allowDefer: true,
    });

    t.equal(
      decision.action,
      PRESSURE_GOVERNOR_ACTION.ALLOW,
      'critical work should remain admissible',
    );
    t.equal(
      decision.reason,
      PRESSURE_GOVERNOR_REASON.CRITICAL_BYPASS,
      'critical work should report the bypass reason',
    );
    t.equal(
      decision.summary?.backpressured,
      true,
      'decision should preserve canonical pressure summary',
    );
  });

test('PressureGovernor degrades background work during transport pressure',
  async (t) => {
    const governor = new PressureGovernor({
      nodeId: 'node-a',
      messageRouter: {
        getOutboundPressureSummary() {
          return {
            backpressured: true,
            saturatedNodeCount: 2,
            totalPending: 96,
            maxPendingUtilization: 1,
          };
        },
      },
    });

    const decision = governor.evaluate({
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
      resourceKeys: ['join:repair'],
      allowDegrade: true,
      allowDefer: true,
    });

    t.equal(
      decision.action,
      PRESSURE_GOVERNOR_ACTION.DEGRADE,
      'background work should degrade first under pressure',
    );
    t.equal(
      decision.reason,
      PRESSURE_GOVERNOR_REASON.TRANSPORT_BACKPRESSURE,
      'degrade should be attributed to transport pressure',
    );
  });

test('PressureGovernor reuses one shared instance per node id',
  async (t) => {
    PressureGovernor.clearSharedForTests();

    const first = PressureGovernor.getShared({
      nodeId: 'node-shared',
      messageRouter: {
        getOutboundPressureSummary() {
          return {
            backpressured: false,
            saturatedNodeCount: 0,
            totalPending: 0,
            maxPendingUtilization: 0,
          };
        },
      },
    });
    const second = PressureGovernor.getShared({
      nodeId: 'node-shared',
      messageRouter: null,
    });

    t.equal(
      second,
      first,
      'shared lookup should return the existing governor for the node',
    );
    t.equal(
      first.getPressureSummary(['transport:outbound'])?.backpressured,
      false,
      'shared governor should retain configured dependencies',
    );

    PressureGovernor.clearSharedForTests();
  });

test('PressureGovernor isolates query-plane pressure from control-plane ' +
  'capacity partitions', async (t) => {
  const governor = new PressureGovernor({
    nodeId: 'node-a',
    messageRouter: {
      getStats() {
        return {
          outboundQueues: {
            'node-b': {
              pending: 48,
              pendingCritical: 0,
              pendingBackground: 48,
              criticalReserve: 16,
              backgroundPendingLimit: 48,
              maxPending: 64,
            },
          },
        };
      },
    },
  });

  const queryDecision = governor.evaluate({
    workClass: PRESSURE_WORK_CLASS.BACKGROUND,
    resourceKeys: ['query-plane:read'],
    allowDegrade: true,
    allowDefer: true,
  });
  const controlPlaneDecision = governor.evaluate({
    workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
    resourceKeys: ['control-plane:read'],
    allowDegrade: false,
    allowDefer: true,
  });

  t.equal(
    queryDecision.action,
    PRESSURE_GOVERNOR_ACTION.DEGRADE,
    'query-plane work should degrade when the background partition is saturated',
  );
  t.equal(
    queryDecision.summary?.capacityPartition,
    'query-plane',
    'query-plane decisions should report the query-plane capacity partition',
  );
  t.equal(
    controlPlaneDecision.action,
    PRESSURE_GOVERNOR_ACTION.ALLOW,
    'control-plane work should stay admissible while critical reserve remains available',
  );
  t.equal(
    controlPlaneDecision.summary?.capacityPartition,
    'control-plane',
    'control-plane decisions should report the control-plane capacity partition',
  );
});

test('PressureGovernor backpressures control-plane work when critical reserve ' +
  'is exhausted', async (t) => {
  const governor = new PressureGovernor({
    nodeId: 'node-a',
    messageRouter: {
      getStats() {
        return {
          outboundQueues: {
            'node-b': {
              pending: 44,
              pendingCritical: 16,
              pendingBackground: 28,
              criticalReserve: 16,
              backgroundPendingLimit: 48,
              maxPending: 64,
            },
          },
        };
      },
    },
  });

  const decision = governor.evaluate({
    workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
    resourceKeys: ['control-plane:write'],
    allowDegrade: false,
    allowDefer: true,
  });

  t.equal(
    decision.action,
    PRESSURE_GOVERNOR_ACTION.DEFER,
    'control-plane work should defer once its reserved capacity is exhausted',
  );
  t.equal(
    decision.summary?.capacityPartition,
    'control-plane',
    'control-plane defer should preserve the control-plane partition marker',
  );
  t.equal(
    decision.summary?.totalPendingCritical,
    16,
    'control-plane summary should expose critical pending pressure',
  );
});

test('PressureGovernor ignores non-reserve critical fallback backlog for ' +
  'control-plane reserve exhaustion', async (t) => {
  const governor = new PressureGovernor({
    nodeId: 'node-a',
    messageRouter: {
      getStats() {
        return {
          outboundQueues: {
            'node-b': {
              pending: 16,
              pendingCritical: 16,
              pendingCriticalReserveEligible: 0,
              pendingBackground: 0,
              criticalReserve: 16,
              backgroundPendingLimit: 48,
              maxPending: 64,
            },
          },
        };
      },
    },
  });

  const decision = governor.evaluate({
    workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
    resourceKeys: ['control-plane:write'],
    allowDegrade: false,
    allowDefer: true,
  });

  t.equal(
    decision.action,
    PRESSURE_GOVERNOR_ACTION.ALLOW,
    'target fallback critical backlog alone should not defer control-plane work',
  );
  t.equal(
    decision.summary?.criticalReserveExhausted,
    false,
    'summary should leave reserve exhaustion clear for non-reserve backlog',
  );
  t.equal(
    decision.summary?.totalPendingCritical,
    16,
    'summary should still expose total critical pending pressure',
  );
  t.equal(
    decision.summary?.totalPendingCriticalReserveEligible,
    0,
    'summary should expose the reserve-eligible critical pending subset',
  );
});

test('PressureGovernor consumes live router stats without treating target ' +
  'backlog as reserve exhaustion', async (t) => {
  initializeMessageRouterTestEnvironment();

  const remoteNodeId = 'node-b';
  const criticalReserve = 16;
  const router = new MessageRouter({
    nodeId: 'node-a',
    nodeAddress: 'ws://node-a:7000',
    outboundQueueMaxConcurrent: 1,
    outboundQueueMaxPending: 64,
    outboundQueueCriticalReserve: criticalReserve,
  });
  await router.initialize();

  let releaseFirstDelivery = null;
  const firstDelivery = router.enqueueOutbound(
    remoteNodeId,
    () => new Promise((resolve) => {
      releaseFirstDelivery = () => resolve({acknowledged: true});
    }),
    {deliveryPriority: 'critical'},
  );
  await Promise.resolve();

  const targetDeliveries = [];
  for (let index = 0; index < criticalReserve; index++) {
    targetDeliveries.push(
      router.enqueueOutbound(
        remoteNodeId,
        async () => ({acknowledged: true, index}),
        {
          deliveryPriority: 'critical',
          targetAddress:
            `node-b/partition/sql_transactions-p${index + 1}-r4`,
          message: {},
        },
      ),
    );
    await Promise.resolve();
  }

  const governor = new PressureGovernor({
    nodeId: 'node-a',
    messageRouter: router,
  });
  const decision = governor.evaluate({
    workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
    resourceKeys: ['control-plane:write'],
    allowDegrade: false,
    allowDefer: true,
  });

  t.equal(
    decision.action,
    PRESSURE_GOVERNOR_ACTION.ALLOW,
    'live target-address backlog should not defer control-plane writes',
  );
  t.equal(
    decision.summary?.totalPendingCritical,
    criticalReserve,
    'summary should still expose pending target-address critical pressure',
  );
  t.equal(
    decision.summary?.totalPendingCriticalReserveEligible,
    0,
    'summary should exclude target-address backlog from reserve accounting',
  );
  t.equal(
    decision.summary?.criticalReserveExhausted,
    false,
    'target-address backlog should not exhaust the aggregate critical reserve',
  );

  releaseFirstDelivery();
  await firstDelivery;
  await Promise.all(targetDeliveries);
  await router.shutdown();
  cleanupMessageRouterTestEnvironment();
});

test('PressureGovernor defers deferrable critical work when the control-plane ' +
  'critical reserve is exhausted', async (t) => {
  const governor = new PressureGovernor({
    nodeId: 'node-a',
    messageRouter: {
      getStats() {
        return {
          outboundQueues: {
            'node-b': {
              pending: 32,
              pendingCritical: 16,
              pendingBackground: 16,
              criticalReserve: 16,
              backgroundPendingLimit: 48,
              maxPending: 64,
            },
          },
        };
      },
    },
  });

  const decision = governor.evaluate({
    workClass: PRESSURE_WORK_CLASS.CRITICAL,
    resourceKeys: ['control-plane:write'],
    allowDegrade: false,
    allowDefer: true,
  });

  t.equal(
    decision.action,
    PRESSURE_GOVERNOR_ACTION.DEFER,
    'deferrable critical work should slow down once reserve is exhausted',
  );
  t.equal(
    decision.reason,
    PRESSURE_GOVERNOR_REASON.CRITICAL_RESERVE_EXHAUSTED,
    'reserve exhaustion should be a first-class pressure reason',
  );
  t.equal(
    decision.summary?.criticalReserveExhausted,
    true,
    'summary should carry the canonical reserve exhaustion flag',
  );
});

test('Publication mutation workload defers when the control-plane critical ' +
  'reserve is exhausted', async (t) => {
  const governor = new PressureGovernor({
    nodeId: 'node-a',
    messageRouter: {
      getStats() {
        return {
          outboundQueues: {
            'node-b': {
              pending: 32,
              pendingCritical: 16,
              pendingBackground: 16,
              criticalReserve: 16,
              backgroundPendingLimit: 48,
              maxPending: 64,
            },
          },
        };
      },
    },
  });
  const publicationProfile = buildControlPlaneWorkloadProfile(
    CONTROL_PLANE_WORKLOAD_CLASS.PUBLICATION_MUTATION,
  );

  const decision = governor.evaluate({
    workClass: publicationProfile.workClass,
    resourceKeys: publicationProfile.resourceKeys,
    allowDegrade: publicationProfile.allowPressureDegrade,
    allowDefer: publicationProfile.allowPressureDefer,
  });

  t.equal(
    publicationProfile.workClass,
    PRESSURE_WORK_CLASS.CRITICAL,
    'publication mutation should stay on the critical work lane',
  );
  t.same(
    publicationProfile.resourceKeys,
    ['control-plane:membership:publication'],
    'publication mutation should use the membership publication resource key',
  );
  t.equal(
    publicationProfile.allowPressureDefer,
    true,
    'publication mutation should use a deferrable pressure contract',
  );
  t.equal(
    decision.action,
    PRESSURE_GOVERNOR_ACTION.DEFER,
    'publication mutation should defer instead of reject when reserve is exhausted',
  );
  t.equal(
    decision.reason,
    PRESSURE_GOVERNOR_REASON.CRITICAL_RESERVE_EXHAUSTED,
    'publication mutation defer should retain the reserve exhaustion reason',
  );
  t.equal(
    decision.summary?.capacityPartition,
    'control-plane',
    'publication mutation should consume the control-plane capacity partition',
  );
});

test('Logs table background workload stays off the control-plane critical ' +
  'reserve', async (t) => {
  const governor = new PressureGovernor({
    nodeId: 'node-a',
    messageRouter: {
      getStats() {
        return {
          outboundQueues: {
            'node-b': {
              pending: 32,
              pendingCritical: 16,
              pendingBackground: 16,
              criticalReserve: 16,
              backgroundPendingLimit: 48,
              maxPending: 64,
            },
          },
        };
      },
    },
  });
  const logsTableProfile = buildControlPlaneWorkloadProfile(
    CONTROL_PLANE_WORKLOAD_CLASS.LOGS_TABLE_BACKGROUND_WRITE,
  );

  const decision = governor.evaluate({
    workClass: logsTableProfile.workClass,
    resourceKeys: logsTableProfile.resourceKeys,
    allowDegrade: logsTableProfile.allowPressureDegrade,
    allowDefer: logsTableProfile.allowPressureDefer,
  });

  t.equal(
    logsTableProfile.workClass,
    PRESSURE_WORK_CLASS.BACKGROUND,
    'logs-table persistence should stay on the background work lane',
  );
  t.same(
    logsTableProfile.resourceKeys,
    ['control-plane:logs-table:background-write'],
    'logs-table persistence should use the isolated background resource key',
  );
  t.equal(
    decision.action,
    PRESSURE_GOVERNOR_ACTION.ALLOW,
    'logs-table background work should not defer on critical reserve exhaustion',
  );
  t.equal(
    decision.summary?.capacityPartition,
    'background',
    'logs-table background work should consume the background partition',
  );
  t.equal(
    decision.summary?.criticalReserveExhausted,
    false,
    'background partition summaries should not report critical reserve exhaustion',
  );
});

test('PressureGovernor keeps bootstrap-critical work admissible when the ' +
  'control-plane critical reserve is exhausted', async (t) => {
  const governor = new PressureGovernor({
    nodeId: 'node-a',
    messageRouter: {
      getStats() {
        return {
          outboundQueues: {
            'node-b': {
              pending: 32,
              pendingCritical: 16,
              pendingBackground: 16,
              criticalReserve: 16,
              backgroundPendingLimit: 48,
              maxPending: 64,
            },
          },
        };
      },
    },
  });

  const decision = governor.evaluate({
    workClass: PRESSURE_WORK_CLASS.CRITICAL,
    resourceKeys: ['control-plane:bootstrap:read'],
    allowDegrade: false,
    allowDefer: true,
  });

  t.equal(
    decision.action,
    PRESSURE_GOVERNOR_ACTION.ALLOW,
    'bootstrap critical work should stay admissible for join/readiness',
  );
  t.equal(
    decision.reason,
    PRESSURE_GOVERNOR_REASON.CRITICAL_BYPASS,
    'bootstrap bypass should retain the critical bypass reason',
  );
});

test('Control-plane workload profiles keep critical replica-operation visibility on the reserved lane',
  async (t) => {
    const workloadProfile = buildControlPlaneWorkloadProfile(
      CONTROL_PLANE_WORKLOAD_CLASS.AUTHORITATIVE_OPERATION_VISIBILITY,
    );

    t.equal(
      workloadProfile.workClass,
      PRESSURE_WORK_CLASS.CRITICAL,
      'replica-operation visibility should remain on the critical work lane',
    );
    t.same(
      workloadProfile.resourceKeys,
      ['control-plane:replica-operations:visibility'],
      'replica-operation visibility should use one shared workload key',
    );
  });

test('PressureGovernor defers background control-plane snapshot repair before critical recovery stalls',
  async (t) => {
    const governor = new PressureGovernor({
      nodeId: 'node-a',
      messageRouter: {
        getStats() {
          return {
            outboundQueues: {
              'node-b': {
                pending: 48,
                pendingCritical: 0,
                pendingBackground: 48,
                criticalReserve: 16,
                backgroundPendingLimit: 48,
                maxPending: 64,
              },
            },
          };
        },
      },
    });
    const snapshotRepairProfile = buildControlPlaneWorkloadProfile(
      CONTROL_PLANE_WORKLOAD_CLASS.CONTROL_SNAPSHOT_REPAIR,
    );
    const criticalRecoveryProfile = buildControlPlaneWorkloadProfile(
      CONTROL_PLANE_WORKLOAD_CLASS.REPLICA_OPERATION_MUTATION,
    );

    const snapshotRepairDecision = governor.evaluate({
      workClass: snapshotRepairProfile.workClass,
      resourceKeys: snapshotRepairProfile.resourceKeys,
      allowDegrade: snapshotRepairProfile.allowPressureDegrade,
      allowDefer: snapshotRepairProfile.allowPressureDefer,
    });
    const criticalRecoveryDecision = governor.evaluate({
      workClass: criticalRecoveryProfile.workClass,
      resourceKeys: criticalRecoveryProfile.resourceKeys,
      allowDegrade: criticalRecoveryProfile.allowPressureDegrade,
      allowDefer: criticalRecoveryProfile.allowPressureDefer,
    });

    t.equal(
      snapshotRepairProfile.workClass,
      PRESSURE_WORK_CLASS.BACKGROUND,
      'broad snapshot repair should be owned by the background work lane',
    );
    t.equal(
      snapshotRepairDecision.action,
      PRESSURE_GOVERNOR_ACTION.DEFER,
      'background snapshot repair should defer while the background lane is saturated',
    );
    t.equal(
      snapshotRepairDecision.summary?.capacityPartition,
      'background',
      'background snapshot repair should not consume the control-plane critical reserve',
    );
    t.equal(
      criticalRecoveryDecision.action,
      PRESSURE_GOVERNOR_ACTION.ALLOW,
      'critical recovery mutation should remain admissible with reserve available',
    );
    t.equal(
      criticalRecoveryDecision.summary?.capacityPartition,
      'control-plane',
      'critical recovery mutation should stay on the control-plane reserve',
    );
  });

test('PressureGovernor rate-limits pressure metric logging',
  async (t) => {
    let currentTime = 1000;
    const logCalls = [];
    const governor = new PressureGovernor({
      nodeId: 'node-a',
      now: () => currentTime,
      logger: {
        info(tag, data) {
          logCalls.push({tag, data});
        },
      },
    });

    const request = {
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
      resourceKeys: ['join:repair'],
      allowDegrade: true,
      allowDefer: true,
    };

    governor.messageRouter = {
      getOutboundPressureSummary() {
        return {
          backpressured: true,
          saturatedNodeCount: 2,
          totalPending: 96,
          maxPendingUtilization: 1,
        };
      },
    };

    governor.evaluate(request);
    t.equal(logCalls.length, 1, 'first emission should log');

    governor.evaluate(request);
    t.equal(logCalls.length, 1, 'second emission at same time should be rate-limited');

    currentTime += 500;
    governor.evaluate(request);
    t.equal(logCalls.length, 1, 'emission after 500ms should still be rate-limited');

    currentTime += 500;
    governor.evaluate(request);
    t.equal(logCalls.length, 2, 'emission after 1000ms should log');
  });

test('PressureGovernor admits readiness reads during control-plane ' +
  'critical-reserve pressure', async (t) => {
  const governor = new PressureGovernor({
    nodeId: 'node-a',
    messageRouter: {
      getStats() {
        return {
          outboundQueues: {
            'node-b': {
              pending: 64,
              pendingCritical: 16,
              pendingBackground: 0,
              criticalReserve: 16,
              backgroundPendingLimit: 48,
              maxPending: 64,
            },
          },
        };
      },
    },
  });

  const readinessDecision = governor.evaluate({
    workClass: 'control-plane-readiness',
    resourceKeys: ['control-plane:read'],
    allowDegrade: true,
    allowDefer: false,
  });
  const interactiveDecision = governor.evaluate({
    workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
    resourceKeys: ['control-plane:read'],
    allowDegrade: true,
    allowDefer: false,
  });

  t.equal(
    readinessDecision.action,
    PRESSURE_GOVERNOR_ACTION.ALLOW,
    'readiness reads should bypass control-plane backpressure',
  );
  t.equal(
    readinessDecision.reason,
    PRESSURE_GOVERNOR_REASON.READINESS_BYPASS,
    'readiness admission should report the readiness bypass reason',
  );
  t.equal(
    interactiveDecision.action,
    PRESSURE_GOVERNOR_ACTION.DEGRADE,
    'plain interactive reads should still degrade under the same pressure',
  );
  PressureGovernor.clearSharedForTests();
});

test('PressureGovernor sheds readiness reads once the readiness reserve ' +
  'is exhausted', async (t) => {
  const governor = new PressureGovernor({
    nodeId: 'node-a',
    messageRouter: {
      getStats() {
        return {
          outboundQueues: {
            'node-b': {
              pending: 64,
              pendingCritical: 16,
              pendingReadiness: 8,
              pendingBackground: 0,
              criticalReserve: 16,
              readinessReserve: 8,
              backgroundPendingLimit: 48,
              maxPending: 64,
            },
          },
        };
      },
    },
  });

  const deferDecision = governor.evaluate({
    workClass: PRESSURE_WORK_CLASS.READINESS,
    resourceKeys: ['control-plane:read'],
    allowDegrade: true,
    allowDefer: true,
  });

  t.equal(
    deferDecision.action,
    PRESSURE_GOVERNOR_ACTION.DEFER,
    'readiness reads should defer when their own reserve is exhausted',
  );
  t.equal(
    deferDecision.reason,
    PRESSURE_GOVERNOR_REASON.READINESS_RESERVE_EXHAUSTED,
    'exhausted readiness admission should report the readiness reserve reason',
  );
  t.equal(
    deferDecision.summary?.readinessReserveExhausted,
    true,
    'summary should surface readiness reserve exhaustion',
  );
  PressureGovernor.clearSharedForTests();
});
