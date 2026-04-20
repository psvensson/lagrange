import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  COLUMN,
  SERVICE_TYPE,
  SERVICE_STATUS,
  TABLES,
} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  LATENCY_PROPAGATION_MODE,
  LATENCY_TOPOLOGY_MESSAGE_TYPE,
} from '../../src/topology/latency-topology-constants.js';
import {
  CDC_GROUP_PUBLICATION_MODE,
  CDC_GROUP_PROPAGATION_REASON,
  CDC_GROUP_PROPAGATION_STRATEGY,
  CDC_GROUP_PROPAGATION_STATUS,
} from '../../src/topology/cdc-group-propagation-constants.js';
import {
  CDCGroupPropagationService,
} from '../../src/topology/cdc-group-propagation-service.js';

function setupConfig(propagationMode) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'node-a'},
    logging: {level: 'error'},
    latency: {
      groupThresholdMs: 100,
      recalcIntervalMs: 1000,
      recalcJitterRatio: 0.1,
      pingTimeoutMs: 50,
      pingRetryCount: 2,
      smoothingAlpha: 0.5,
      propagationMode,
    },
  });
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function teardownConfig() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function createTopologyCache({nodes = [], groups = [], services = []} = {}) {
  const nodeRows = new Map(
    nodes.map((row) => [row[COLUMN.NODE_ID], {...row}]),
  );
  const groupRows = groups.map((row) => ({...row}));
  const serviceRows = services.map((row) => ({...row}));

  return {
    get(tableName, key) {
      if (tableName === TABLES.NODES) {
        return nodeRows.get(key) || null;
      }
      return null;
    },
    getAll(tableName) {
      if (tableName === TABLES.LATENCY_GROUPS) {
        return groupRows.map((row) => ({...row}));
      }
      return [];
    },
    filter(tableName, predicate) {
      if (tableName !== TABLES.SERVICES) {
        return [];
      }
      return serviceRows.filter((row) => predicate(row));
    },
  };
}

function createSourceMessageGroupService() {
  const calls = [];
  return {
    calls,
    async applyCDCEvent(tableName, operation, data) {
      calls.push({tableName, operation, data});
    },
  };
}

function createMessageRouter(results = []) {
  const calls = [];
  return {
    calls,
    async deliver(address, payload, options) {
      calls.push({address, payload, options});
      const index = calls.length - 1;
      return results[Math.min(index, results.length - 1)];
    },
  };
}

async function waitForCondition(predicate, timeoutMs = 1000, intervalMs = 10) {
  const startedAtMs = Date.now();
  while (Date.now() - startedAtMs < timeoutMs) {
    if (predicate()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return predicate();
}

function createGroupRow(groupId, coordinatorNodeId) {
  return {
    [COLUMN.GROUP_ID]: groupId,
    [COLUMN.COORDINATOR_NODE_ID]: coordinatorNodeId,
    [COLUMN.STATE]: 'active',
  };
}

function createMessageGroupServiceRow(
  serviceId,
  nodeId,
  address,
  raftRole,
  groupId = null,
) {
  return {
    [COLUMN.SERVICE_ID]: serviceId,
    [COLUMN.GROUP_ID]: groupId,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: address,
    [COLUMN.RAFT_ROLE]: raftRole,
  };
}
test('CDCGroupPropagationService uses safe mode when configured', async (t) => {
  setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
  const cache = createTopologyCache({
    nodes: [{
      [COLUMN.NODE_ID]: 'node-a',
      [COLUMN.LATENCY_GROUP_ID]: 'g-1',
    }],
    groups: [
      createGroupRow('g-1', 'node-a'),
      createGroupRow('g-2', 'node-b'),
    ],
    services: [
      createMessageGroupServiceRow(
        'mg-node-b',
        'node-b',
        'node-b/message-group/mg-node-b',
        RAFT_ROLE.LEADER,
      ),
    ],
  });
  const source = createSourceMessageGroupService();
  const router = createMessageRouter([{acknowledged: true}]);
  const tree = {
    getRoutingOrder: () => ['g-1', 'g-2'],
  };
  const service = new CDCGroupPropagationService({
    nodeId: 'node-a',
    systemTableCache: cache,
    messageRouter: router,
    latencyTreeService: tree,
    nowFn: () => 1000,
  });
  const warnLogs = [];
  const debugLogs = [];
  service.logger = {
    info() {},
    warn(message, context) {
      warnLogs.push({message, context});
    },
    debug(message, context) {
      debugLogs.push({message, context});
    },
  };
  service.initialize();
  service.start();

  const result = await service.propagateCDCEvent({
    tableName: TABLES.NODES,
    operation: 'UPDATE',
    data: {[COLUMN.NODE_ID]: 'node-z'},
    sourceMessageGroupService: source,
  });
  assert.equal(result.mode, CDC_GROUP_PROPAGATION_STATUS.SAFE);
  assert.equal(result.strategy, CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT);
  assert.equal(
    result.fallbackReason,
    CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE,
  );
  assert.equal(source.calls.length, 1);
  assert.equal(router.calls.length, 0);
  assert.equal(service.getStats().safeCount, 1);
  assert.equal(service.getStats().fallbackCount, 1);
  assert.equal(warnLogs.length, 0, 'config safe mode fallback should not warn');
  assert.ok(
    debugLogs.some((entry) =>
      entry.message === 'Falling back to direct-fanout CDC propagation strategy'),
    'config safe mode fallback should emit debug diagnostic',
  );

  service.stop();
  teardownConfig();
  t.end();
});
test('CDCGroupPropagationService keeps repair_only publication mode in safe mode ' +
  'when grouped prerequisites are missing', async (t) => {
  setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
  const cache = createTopologyCache({
    nodes: [{
      [COLUMN.NODE_ID]: 'node-a',
    }],
    groups: [
      createGroupRow('g-2', 'node-b'),
    ],
    services: [
      createMessageGroupServiceRow(
        'mg-node-b',
        'node-b',
        'node-b/message-group/mg-node-b',
        RAFT_ROLE.LEADER,
      ),
    ],
  });
  const source = createSourceMessageGroupService();
  const service = new CDCGroupPropagationService({
    nodeId: 'node-a',
    systemTableCache: cache,
    messageRouter: createMessageRouter([{acknowledged: true}]),
    latencyTreeService: {
      getRoutingOrder: () => ['g-2'],
    },
    nowFn: () => 2000,
  });

  service.initialize();
  service.start();
  const result = await service.propagateCDCEvent({
    tableName: TABLES.NODES,
    operation: 'UPDATE',
    data: {[COLUMN.NODE_ID]: 'node-z'},
    sourceMessageGroupService: source,
  });
  assert.equal(result.mode, CDC_GROUP_PROPAGATION_STATUS.SAFE);
  assert.equal(result.fallbackReason, CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE);
  const diagnostics = service.getPublicationModeDiagnostics();
  assert.equal(
    diagnostics.currentMode,
    CDC_GROUP_PUBLICATION_MODE.REPAIR_ONLY,
  );
  assert.equal(
    diagnostics.reasonCode,
    CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE,
  );

  service.stop();
  teardownConfig();
  t.end();
});
test('CDCGroupPropagationService reports repair_only publication mode when ' +
  'safe mode is configured', async (t) => {
  setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
  const cache = createTopologyCache({
    nodes: [{
      [COLUMN.NODE_ID]: 'node-a',
      [COLUMN.LATENCY_GROUP_ID]: 'g-1',
    }],
    groups: [
      createGroupRow('g-1', 'node-a'),
      createGroupRow('g-2', 'node-b'),
    ],
    services: [
      createMessageGroupServiceRow(
        'mg-node-b',
        'node-b',
        'node-b/message-group/mg-node-b',
        RAFT_ROLE.LEADER,
        'g-2',
      ),
    ],
  });
  const service = new CDCGroupPropagationService({
    nodeId: 'node-a',
    systemTableCache: cache,
    messageRouter: createMessageRouter([{acknowledged: true}]),
    latencyTreeService: {
      getRoutingOrder: () => ['g-1', 'g-2'],
    },
    nowFn: () => 1500,
  });
  service.initialize();
  service.start();

  const diagnostics = service.getPublicationModeDiagnostics();
  assert.equal(
    diagnostics.currentMode,
    CDC_GROUP_PUBLICATION_MODE.REPAIR_ONLY,
  );
  assert.equal(
    diagnostics.reasonCode,
    CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE,
  );
  assert.ok(diagnostics.enteredAt, 'repair_only mode should expose enteredAt');

  service.stop();
  teardownConfig();
  t.end();
});
test('CDCGroupPropagationService fans out by group coordinators in grouped mode',
  async (t) => {
    setupConfig(LATENCY_PROPAGATION_MODE.GROUPED);
    const cache = createTopologyCache({
      nodes: [{
        [COLUMN.NODE_ID]: 'node-a',
        [COLUMN.LATENCY_GROUP_ID]: 'g-1',
      }],
      groups: [
        createGroupRow('g-1', 'node-a'),
        createGroupRow('g-2', 'node-b'),
        createGroupRow('g-3', 'node-c'),
      ],
      services: [
        createMessageGroupServiceRow(
          'mg-node-b',
          'node-b',
          'node-b/message-group/mg-node-b',
          RAFT_ROLE.LEADER,
        ),
        createMessageGroupServiceRow(
          'mg-node-c',
          'node-c',
          'node-c/message-group/mg-node-c',
          RAFT_ROLE.LEADER,
        ),
      ],
    });
    const source = createSourceMessageGroupService();
    const router = createMessageRouter([
      {acknowledged: true},
      {acknowledged: true},
    ]);
    const tree = {
      getRoutingOrder: () => ['g-1', 'g-3', 'g-2'],
    };
    const service = new CDCGroupPropagationService({
      nodeId: 'node-a',
      systemTableCache: cache,
      messageRouter: router,
      latencyTreeService: tree,
      nowFn: () => 2000,
    });
    service.initialize();
    service.start();

    const result = await service.propagateCDCEvent({
      tableName: TABLES.NODES,
      operation: 'UPDATE',
      data: {[COLUMN.NODE_ID]: 'node-z'},
      sourceMessageGroupService: source,
    });
    assert.equal(result.mode, CDC_GROUP_PROPAGATION_STATUS.GROUPED);
    assert.equal(
      result.strategy,
      CDC_GROUP_PROPAGATION_STRATEGY.GROUP_COORDINATOR,
    );
    assert.equal(result.success, true);
    assert.equal(result.targetGroupCount, 2);
    assert.equal(source.calls.length, 1);
    assert.equal(router.calls.length, 2);
    assert.equal(
      router.calls[0].payload.type,
      LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION,
    );
    assert.equal(router.calls[0].payload.targetGroupId, 'g-3');
    assert.equal(router.calls[1].payload.targetGroupId, 'g-2');
    assert.equal(router.calls[0].options.targetNodeId, 'node-c');
    assert.equal(router.calls[1].options.targetNodeId, 'node-b');
    assert.equal(service.getStats().groupedCount, 1);

    service.stop();
    teardownConfig();
    t.end();
  });
test('CDCGroupPropagationService falls back when coordinator address is missing',
  async (t) => {
    setupConfig(LATENCY_PROPAGATION_MODE.GROUPED);
    const cache = createTopologyCache({
      nodes: [{
        [COLUMN.NODE_ID]: 'node-a',
        [COLUMN.LATENCY_GROUP_ID]: 'g-1',
      }],
      groups: [
        createGroupRow('g-1', 'node-a'),
        createGroupRow('g-2', 'node-missing'),
      ],
      services: [],
    });
    const source = createSourceMessageGroupService();
    const router = createMessageRouter([{acknowledged: true}]);
    const tree = {
      getRoutingOrder: () => ['g-1', 'g-2'],
    };
    const service = new CDCGroupPropagationService({
      nodeId: 'node-a',
      systemTableCache: cache,
      messageRouter: router,
      latencyTreeService: tree,
      nowFn: () => 3000,
    });
    const warnLogs = [];
    service.logger = {
      info() {},
      warn(message, context) {
        warnLogs.push({message, context});
      },
      debug() {},
    };
    const fallbackEvents = [];
    service.on('cdcGroupSafeFallback', (payload) => fallbackEvents.push(payload));
    service.initialize();
    service.start();

    const result = await service.propagateCDCEvent({
      tableName: TABLES.NODES,
      operation: 'INSERT',
      data: {[COLUMN.NODE_ID]: 'node-y'},
      sourceMessageGroupService: source,
    });
    assert.equal(result.mode, CDC_GROUP_PROPAGATION_STATUS.SAFE);
    assert.equal(result.strategy, CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT);
    assert.equal(
      result.fallbackReason,
      CDC_GROUP_PROPAGATION_REASON.MISSING_COORDINATOR_ADDRESS,
    );
    assert.equal(source.calls.length, 1);
    assert.equal(router.calls.length, 0);
    assert.equal(fallbackEvents.length, 1);
    assert.equal(fallbackEvents[0].reason, result.fallbackReason);
    assert.ok(
      warnLogs.some((entry) =>
        entry.message === 'Falling back to direct-fanout CDC propagation strategy'),
      'non-config fallback reasons should remain warnings',
    );

    service.stop();
    teardownConfig();
    t.end();
  });
test('CDCGroupPropagationService reports grouped delivery failures', async (t) => {
  setupConfig(LATENCY_PROPAGATION_MODE.GROUPED);
  const cache = createTopologyCache({
    nodes: [{
      [COLUMN.NODE_ID]: 'node-a',
      [COLUMN.LATENCY_GROUP_ID]: 'g-1',
    }],
    groups: [
      createGroupRow('g-1', 'node-a'),
      createGroupRow('g-2', 'node-b'),
      createGroupRow('g-3', 'node-c'),
    ],
    services: [
      createMessageGroupServiceRow(
        'mg-node-b',
        'node-b',
        'node-b/message-group/mg-node-b',
        RAFT_ROLE.LEADER,
        'g-2',
      ),
      createMessageGroupServiceRow(
        'mg-node-c',
        'node-c',
        'node-c/message-group/mg-node-c',
        RAFT_ROLE.LEADER,
        'g-3',
      ),
    ],
  });
  const source = createSourceMessageGroupService();
  const router = createMessageRouter([
    {acknowledged: false, error: 'timeout'},
    {acknowledged: true},
    {acknowledged: false, error: 'timeout'},
  ]);
  const tree = {
    getRoutingOrder: () => ['g-1', 'g-2', 'g-3'],
  };
  const service = new CDCGroupPropagationService({
    nodeId: 'node-a',
    systemTableCache: cache,
    messageRouter: router,
    latencyTreeService: tree,
    nowFn: () => 4000,
    deliveryRetryMaxAttempts: 1,
  });
  service.initialize();
  service.start();

  const result = await service.propagateCDCEvent({
    tableName: TABLES.NODES,
    operation: 'UPDATE',
    data: {[COLUMN.NODE_ID]: 'node-k'},
    sourceMessageGroupService: source,
  });
  assert.equal(result.mode, CDC_GROUP_PROPAGATION_STATUS.GROUPED);
  assert.equal(
    result.strategy,
    CDC_GROUP_PROPAGATION_STRATEGY.GROUP_COORDINATOR,
  );
  assert.equal(result.success, false);
  assert.equal(result.deliveryFailures.length, 1);
  assert.equal(result.deliveryFailures[0].targetGroupId, 'g-2');
  assert.equal(
    result.fallbackReason,
    CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_FAILURE,
  );
  assert.equal(router.calls.length, 3, 'safe fallback should retry the failed group directly');
  assert.equal(service.getStats().groupedDeliveryFailureCount, 1);
  assert.equal(service.getStats().fallbackCount, 1);

  service.stop();
  teardownConfig();
  t.end();
});
test('CDCGroupPropagationService tracks publication mode transitions ' +
  'between grouped and conservative fanout', async (t) => {
  setupConfig(LATENCY_PROPAGATION_MODE.GROUPED);
  const cache = createTopologyCache({
    nodes: [{
      [COLUMN.NODE_ID]: 'node-a',
      [COLUMN.LATENCY_GROUP_ID]: 'g-1',
    }],
    groups: [
      createGroupRow('g-1', 'node-a'),
      createGroupRow('g-2', 'node-b'),
      createGroupRow('g-3', 'node-c'),
    ],
    services: [
      createMessageGroupServiceRow(
        'mg-node-b',
        'node-b',
        'node-b/message-group/mg-node-b',
        RAFT_ROLE.LEADER,
        'g-2',
      ),
      createMessageGroupServiceRow(
        'mg-node-c',
        'node-c',
        'node-c/message-group/mg-node-c',
        RAFT_ROLE.LEADER,
        'g-3',
      ),
    ],
  });
  const source = createSourceMessageGroupService();
  let nowMs = 2000;
  const service = new CDCGroupPropagationService({
    nodeId: 'node-a',
    systemTableCache: cache,
    messageRouter: createMessageRouter([
      {acknowledged: false, error: 'timeout'},
      {acknowledged: true},
      {acknowledged: true},
      {acknowledged: true},
      {acknowledged: true},
    ]),
    latencyTreeService: {
      getRoutingOrder: () => ['g-1', 'g-2', 'g-3'],
    },
    nowFn: () => nowMs,
    deliveryRetryMaxAttempts: 1,
  });
  service.initialize();
  service.start();

  assert.equal(
    service.getPublicationModeDiagnostics().currentMode,
    CDC_GROUP_PUBLICATION_MODE.GROUPED,
  );

  await service.propagateCDCEvent({
    tableName: TABLES.NODES,
    operation: 'UPDATE',
    data: {[COLUMN.NODE_ID]: 'node-degraded'},
    sourceMessageGroupService: source,
  });
  const degradedDiagnostics = service.getPublicationModeDiagnostics();
  const degradedTransition = degradedDiagnostics.recentTransitions[
    degradedDiagnostics.recentTransitions.length - 1
  ];
  assert.equal(
    degradedDiagnostics.currentMode,
    CDC_GROUP_PUBLICATION_MODE.CONSERVATIVE_FANOUT,
  );
  assert.equal(
    degradedDiagnostics.reasonCode,
    CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_FAILURE,
  );
  assert.equal(
    degradedTransition.from,
    CDC_GROUP_PUBLICATION_MODE.GROUPED,
  );
  assert.equal(
    degradedTransition.to,
    CDC_GROUP_PUBLICATION_MODE.CONSERVATIVE_FANOUT,
  );
  assert.equal(
    degradedTransition.reasonCode,
    CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_FAILURE,
  );

  nowMs = 3000;
  await service.propagateCDCEvent({
    tableName: TABLES.NODES,
    operation: 'UPDATE',
    data: {[COLUMN.NODE_ID]: 'node-recovered'},
    sourceMessageGroupService: source,
  });
  const recoveredDiagnostics = service.getPublicationModeDiagnostics();
  const lastTransition = recoveredDiagnostics.recentTransitions[
    recoveredDiagnostics.recentTransitions.length - 1
  ];
  assert.equal(
    recoveredDiagnostics.currentMode,
    CDC_GROUP_PUBLICATION_MODE.GROUPED,
  );
  assert.equal(
    lastTransition.from,
    CDC_GROUP_PUBLICATION_MODE.CONSERVATIVE_FANOUT,
  );
  assert.equal(lastTransition.to, CDC_GROUP_PUBLICATION_MODE.GROUPED);
  assert.equal(
    lastTransition.reasonCode,
    CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_RECOVERED,
  );
  assert.equal(recoveredDiagnostics.enteredAt, '1970-01-01T00:00:03.000Z');

  service.stop();
  teardownConfig();
  t.end();
});

test('CDCGroupPropagationService recovers grouped delivery failures via safe fallback',
  async (t) => {
    setupConfig(LATENCY_PROPAGATION_MODE.GROUPED);
    const cache = createTopologyCache({
      nodes: [{
        [COLUMN.NODE_ID]: 'node-a',
        [COLUMN.LATENCY_GROUP_ID]: 'g-1',
      }],
      groups: [
        createGroupRow('g-1', 'node-a'),
        createGroupRow('g-2', 'node-b'),
        createGroupRow('g-3', 'node-c'),
      ],
      services: [
        createMessageGroupServiceRow(
          'mg-node-b',
          'node-b',
          'node-b/message-group/mg-node-b',
          RAFT_ROLE.LEADER,
          'g-2',
        ),
        createMessageGroupServiceRow(
          'mg-node-c',
          'node-c',
          'node-c/message-group/mg-node-c',
          RAFT_ROLE.LEADER,
          'g-3',
        ),
      ],
    });
    const source = createSourceMessageGroupService();
    source.groupId = 'g-1';
    const router = createMessageRouter([
      {acknowledged: false, error: 'timeout'},
      {acknowledged: true},
      {acknowledged: true},
    ]);
    const tree = {
      getRoutingOrder: () => ['g-1', 'g-2', 'g-3'],
    };
    const service = new CDCGroupPropagationService({
      nodeId: 'node-a',
      systemTableCache: cache,
      messageRouter: router,
      latencyTreeService: tree,
      nowFn: () => 4050,
      deliveryRetryMaxAttempts: 1,
    });
    service.initialize();
    service.start();

    const result = await service.propagateCDCEvent({
      tableName: TABLES.PARTITIONS,
      operation: 'UPDATE',
      data: {[COLUMN.PARTITION_ID]: 'p-1'},
      sourceMessageGroupService: source,
    });

    assert.equal(result.mode, CDC_GROUP_PROPAGATION_STATUS.GROUPED);
    assert.equal(result.success, true);
    assert.equal(result.deliveryFailures.length, 0);
    assert.equal(
      result.fallbackReason,
      CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_FAILURE,
    );
    assert.equal(
      result.fallbackStrategy,
      CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT,
    );
    assert.equal(router.calls.length, 3, 'safe fallback should repair the failed group');
    assert.equal(service.getStats().groupedDeliveryFailureCount, 1);
    assert.equal(service.getStats().fallbackCount, 1);

    service.stop();
    teardownConfig();
    t.end();
  });

test('CDCGroupPropagationService safe fallback still fans out to active group leaders',
  async (t) => {
    setupConfig(LATENCY_PROPAGATION_MODE.GROUPED);
    const cache = createTopologyCache({
      nodes: [{
        [COLUMN.NODE_ID]: 'node-a',
        [COLUMN.LATENCY_GROUP_ID]: 'g-1',
      }],
      groups: [
        createGroupRow('g-1', 'node-a'),
        createGroupRow('g-2', 'node-missing'),
      ],
      services: [
        createMessageGroupServiceRow(
          'mg-node-b',
          'node-b',
          'node-b/message-group/mg-node-b',
          RAFT_ROLE.LEADER,
          'g-2',
        ),
      ],
    });
    const source = createSourceMessageGroupService();
    source.groupId = 'g-1';
    const router = createMessageRouter([{acknowledged: true}]);
    const tree = {
      getRoutingOrder: () => ['g-1', 'g-2'],
    };
    const service = new CDCGroupPropagationService({
      nodeId: 'node-a',
      systemTableCache: cache,
      messageRouter: router,
      latencyTreeService: tree,
      nowFn: () => 5000,
    });
    service.initialize();
    service.start();

    const result = await service.propagateCDCEvent({
      tableName: TABLES.NODES,
      operation: 'UPDATE',
      data: {[COLUMN.NODE_ID]: 'node-fallback'},
      sourceMessageGroupService: source,
    });

    assert.equal(result.mode, CDC_GROUP_PROPAGATION_STATUS.SAFE);
    assert.equal(result.strategy, CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT);
    assert.equal(
      result.fallbackReason,
      CDC_GROUP_PROPAGATION_REASON.MISSING_COORDINATOR_ADDRESS,
    );
    assert.equal(source.calls.length, 1);
    assert.equal(router.calls.length, 1);
    assert.equal(router.calls[0].payload.targetGroupId, 'g-2');

    service.stop();
    teardownConfig();
    t.end();
  });

test('CDCGroupPropagationService treats thrown delivery errors as failures without throwing',
  async (t) => {
    setupConfig(LATENCY_PROPAGATION_MODE.GROUPED);
    const cache = createTopologyCache({
      nodes: [{
        [COLUMN.NODE_ID]: 'node-a',
        [COLUMN.LATENCY_GROUP_ID]: 'g-1',
      }],
      groups: [
        createGroupRow('g-1', 'node-a'),
        createGroupRow('g-2', 'node-missing'),
      ],
      services: [
        createMessageGroupServiceRow(
          'mg-node-b-r0',
          'node-b',
          'node-b/message-group/mg-node-b',
          RAFT_ROLE.LEADER,
          'g-2',
        ),
      ],
    });
    const source = createSourceMessageGroupService();
    source.groupId = 'g-1';
    const router = {
      calls: [],
      async deliver(address, payload, options) {
        router.calls.push({address, payload, options});
        throw new Error('delivery failed');
      },
    };
    const tree = {
      getRoutingOrder: () => ['g-1', 'g-2'],
    };
    const service = new CDCGroupPropagationService({
      nodeId: 'node-a',
      systemTableCache: cache,
      messageRouter: router,
      latencyTreeService: tree,
      nowFn: () => 6000,
      deliveryRetryMaxAttempts: 1,
    });
    service.initialize();
    service.start();

    let result = null;
    await assert.doesNotReject(async () => {
      result = await service.propagateCDCEvent({
        tableName: TABLES.NODES,
        operation: 'UPDATE',
        data: {[COLUMN.NODE_ID]: 'node-safe'},
        sourceMessageGroupService: source,
      });
    });

    assert.ok(result);
    assert.equal(result.mode, CDC_GROUP_PROPAGATION_STATUS.SAFE);
    assert.equal(result.strategy, CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT);
    assert.equal(result.success, false);
    assert.equal(result.deliveryFailures.length, 1);
    assert.equal(result.deliveryFailures[0].targetGroupId, 'g-2');
    assert.equal(result.deliveryFailures[0].error, 'delivery failed');
    assert.equal(source.calls.length, 1);
    assert.equal(router.calls.length, 1);

    service.stop();
    teardownConfig();
    t.end();
  });

test('CDCGroupPropagationService retries transient safe-mode delivery failure',
  async (t) => {
    setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
    const cache = createTopologyCache({
      nodes: [{
        [COLUMN.NODE_ID]: 'node-a',
        [COLUMN.LATENCY_GROUP_ID]: 'g-1',
      }],
      groups: [
        createGroupRow('g-1', 'node-a'),
        createGroupRow('g-2', 'node-b'),
      ],
      services: [
        createMessageGroupServiceRow(
          'mg-node-b-r1',
          'node-b',
          'node-b/message-group/mg-node-b-r1',
          RAFT_ROLE.LEADER,
          'g-2',
        ),
      ],
    });
    const source = createSourceMessageGroupService();
    source.groupId = 'g-1';
    const router = createMessageRouter([
      {acknowledged: false, error: 'transient'},
      {acknowledged: true},
    ]);
    const tree = {
      getRoutingOrder: () => ['g-1', 'g-2'],
    };
    const service = new CDCGroupPropagationService({
      nodeId: 'node-a',
      systemTableCache: cache,
      messageRouter: router,
      latencyTreeService: tree,
      nowFn: () => 7000,
      deliveryRetryMaxAttempts: 2,
      deliveryRetryDelayMs: 1,
    });
    service.initialize();
    service.start();

    const result = await service.propagateCDCEvent({
      tableName: TABLES.NODES,
      operation: 'UPSERT',
      data: {[COLUMN.NODE_ID]: 'node-retry'},
      sourceMessageGroupService: source,
    });

    assert.equal(result.mode, CDC_GROUP_PROPAGATION_STATUS.SAFE);
    assert.equal(result.strategy, CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT);
    assert.equal(result.success, true);
    assert.equal(result.deliveryFailures.length, 0);
    assert.equal(router.calls.length, 2);

    service.stop();
    teardownConfig();
    t.end();
  });

test('CDCGroupPropagationService batches immediate same-row control-plane updates',
  async (t) => {
    setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
    const cache = createTopologyCache({
      nodes: [{
        [COLUMN.NODE_ID]: 'node-a',
        [COLUMN.LATENCY_GROUP_ID]: 'g-1',
      }],
      groups: [
        createGroupRow('g-1', 'node-a'),
        createGroupRow('g-2', 'node-b'),
      ],
      services: [
        createMessageGroupServiceRow(
          'mg-node-b-r1',
          'node-b',
          'node-b/message-group/mg-node-b-r1',
          RAFT_ROLE.LEADER,
          'g-2',
        ),
      ],
    });
    const source = createSourceMessageGroupService();
    source.groupId = 'g-1';
    const router = createMessageRouter([{acknowledged: true}]);
    const service = new CDCGroupPropagationService({
      nodeId: 'node-a',
      systemTableCache: cache,
      messageRouter: router,
      latencyTreeService: {
        getRoutingOrder: () => ['g-1', 'g-2'],
      },
      nowFn: () => 7050,
      immediateBatchDelayMs: 5,
    });
    service.initialize();
    service.start();

    const [firstResult, secondResult] = await Promise.all([
      service.propagateCDCEvent({
        tableName: TABLES.NODES,
        operation: 'UPDATE',
        data: {
          [COLUMN.NODE_ID]: 'node-batched',
          status: 'warming',
        },
        sourceMessageGroupService: source,
      }),
      service.propagateCDCEvent({
        tableName: TABLES.NODES,
        operation: 'UPDATE',
        data: {
          [COLUMN.NODE_ID]: 'node-batched',
          status: 'active',
        },
        sourceMessageGroupService: source,
      }),
    ]);

    assert.equal(firstResult.success, true);
    assert.equal(secondResult.success, true);
    assert.equal(source.calls.length, 2, 'source group should still apply both local updates');
    assert.equal(router.calls.length, 1, 'remote publication should collapse into one batch');
    const latestPayloadStatus =
      router.calls[0].payload.type === LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION_BATCH ?
        router.calls[0].payload.events[0].data.status :
        router.calls[0].payload.data.status;
    assert.equal(
      latestPayloadStatus,
      'active',
      'batch should carry only the latest same-row state',
    );

    service.stop();
    teardownConfig();
    t.end();
  });

test('CDCGroupPropagationService continues retries in background after retry budget',
  async (t) => {
    setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
    const cache = createTopologyCache({
      nodes: [{
        [COLUMN.NODE_ID]: 'node-a',
        [COLUMN.LATENCY_GROUP_ID]: 'g-1',
      }],
      groups: [
        createGroupRow('g-1', 'node-a'),
        createGroupRow('g-2', 'node-b'),
      ],
      services: [
        createMessageGroupServiceRow(
          'mg-node-b-r1',
          'node-b',
          'node-b/message-group/mg-node-b-r1',
          RAFT_ROLE.LEADER,
          'g-2',
        ),
      ],
    });
    const source = createSourceMessageGroupService();
    source.groupId = 'g-1';
    const router = createMessageRouter([
      {acknowledged: false, error: 'transient-1'},
      {acknowledged: false, error: 'transient-2'},
      {acknowledged: true},
    ]);
    const tree = {
      getRoutingOrder: () => ['g-1', 'g-2'],
    };
    const service = new CDCGroupPropagationService({
      nodeId: 'node-a',
      systemTableCache: cache,
      messageRouter: router,
      latencyTreeService: tree,
      nowFn: () => 7100,
      deliveryRetryMaxAttempts: 1,
      deliveryRetryDelayMs: 5,
      deliveryRetryMaxDelayMs: 5,
      deliveryRetryBackoffMultiplier: 1,
    });
    service.initialize();
    service.start();

    const result = await service.propagateCDCEvent({
      tableName: TABLES.NODES,
      operation: 'UPSERT',
      data: {[COLUMN.NODE_ID]: 'node-background-retry'},
      sourceMessageGroupService: source,
    });

    assert.equal(result.mode, CDC_GROUP_PROPAGATION_STATUS.SAFE);
    assert.equal(result.strategy, CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT);
    assert.equal(result.success, false);
    assert.equal(
      result.deliveryFailures.length,
      1,
      'bounded synchronous retry should still report immediate failure',
    );
    assert.equal(router.calls.length, 1, 'initial bounded phase should make one attempt');

    const eventuallyDelivered = await waitForCondition(
      () => router.calls.length >= 3,
      1000,
      10,
    );
    assert.equal(
      eventuallyDelivered,
      true,
      'background retry loop should continue until delivery succeeds',
    );

  service.stop();
  teardownConfig();
  t.end();
  });

test('CDCGroupPropagationService defers immediate propagation while the local router is backpressured',
  async (t) => {
    setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
    const cache = createTopologyCache({
      nodes: [{
        [COLUMN.NODE_ID]: 'node-a',
        [COLUMN.LATENCY_GROUP_ID]: 'g-1',
      }],
      groups: [
        createGroupRow('g-1', 'node-a'),
        createGroupRow('g-2', 'node-b'),
      ],
      services: [
        createMessageGroupServiceRow(
          'mg-node-b-r1',
          'node-b',
          'node-b/message-group/mg-node-b-r1',
          RAFT_ROLE.LEADER,
          'g-2',
        ),
      ],
    });
    const source = createSourceMessageGroupService();
    source.groupId = 'g-1';
    const routerPressure = {
      backpressured: true,
      saturatedNodeCount: 1,
      totalPending: 48,
      maxPendingUtilization: 0.75,
    };
    const router = createMessageRouter([{acknowledged: true}]);
    router.getOutboundPressureSummary = () => ({...routerPressure});
    const service = new CDCGroupPropagationService({
      nodeId: 'node-a',
      systemTableCache: cache,
      messageRouter: router,
      latencyTreeService: {
        getRoutingOrder: () => ['g-1', 'g-2'],
      },
      nowFn: () => 7150,
      deliveryRetryDelayMs: 5,
      deliveryRetryMaxDelayMs: 5,
      deliveryRetryBackoffMultiplier: 1,
    });
    service.initialize();
    service.start();

    const result = await service.propagateCDCEvent({
      tableName: TABLES.NODES,
      operation: 'UPSERT',
      data: {[COLUMN.NODE_ID]: 'node-pressure-deferred'},
      sourceMessageGroupService: source,
    });

    assert.equal(result.success, false);
    assert.equal(result.deliveryFailures.length, 1);
    assert.equal(result.deliveryFailures[0].error, 'background_retry_pending');
    assert.equal(router.calls.length, 0, 'router delivery should defer under local pressure');

    routerPressure.backpressured = false;
    routerPressure.saturatedNodeCount = 0;
    routerPressure.totalPending = 0;
    routerPressure.maxPendingUtilization = 0;

    const deliveredAfterPressureClears = await waitForCondition(
      () => router.calls.length === 1,
      1000,
      10,
    );
    assert.equal(
      deliveredAfterPressureClears,
      true,
      'deferred propagation should resume once local router pressure clears',
    );

    service.stop();
    teardownConfig();
    t.end();
  });

test('CDCGroupPropagationService coalesces same-row deferred retries to the latest payload',
  async (t) => {
    setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
    const cache = createTopologyCache({
      nodes: [{
        [COLUMN.NODE_ID]: 'node-a',
        [COLUMN.LATENCY_GROUP_ID]: 'g-1',
      }],
      groups: [
        createGroupRow('g-1', 'node-a'),
        createGroupRow('g-2', 'node-b'),
      ],
      services: [
        createMessageGroupServiceRow(
          'mg-node-b-r1',
          'node-b',
          'node-b/message-group/mg-node-b-r1',
          RAFT_ROLE.LEADER,
          'g-2',
        ),
      ],
    });
    const source = createSourceMessageGroupService();
    source.groupId = 'g-1';
    const router = createMessageRouter([
      {acknowledged: false, error: 'transient'},
      {acknowledged: true},
    ]);
    const service = new CDCGroupPropagationService({
      nodeId: 'node-a',
      systemTableCache: cache,
      messageRouter: router,
      latencyTreeService: {
        getRoutingOrder: () => ['g-1', 'g-2'],
      },
      nowFn: () => 7175,
      deliveryRetryMaxAttempts: 1,
      deliveryRetryDelayMs: 5,
      deliveryRetryMaxDelayMs: 5,
      deliveryRetryBackoffMultiplier: 1,
    });
    service.initialize();
    service.start();

    const firstResult = await service.propagateCDCEvent({
      tableName: TABLES.NODES,
      operation: 'UPDATE',
      data: {
        [COLUMN.NODE_ID]: 'node-latest-only',
        status: 'warming',
      },
      sourceMessageGroupService: source,
    });
    assert.equal(firstResult.success, false);
    assert.equal(router.calls.length, 1, 'first failed propagation should make one immediate attempt');

    const secondResult = await service.propagateCDCEvent({
      tableName: TABLES.NODES,
      operation: 'UPDATE',
      data: {
        [COLUMN.NODE_ID]: 'node-latest-only',
        status: 'active',
      },
      sourceMessageGroupService: source,
    });
    assert.equal(secondResult.success, false);
    assert.equal(
      router.calls.length,
      1,
      'same-row propagation should merge into the existing retry wave instead of sending immediately',
    );

    const latestDelivered = await waitForCondition(
      () => router.calls.length === 2,
      1000,
      10,
    );
    assert.equal(
      latestDelivered,
      true,
      'background retry should eventually redrive the queued latest payload',
    );
    assert.equal(
      router.calls[1].payload.data.status,
      'active',
      'retry wave should deliver the latest state for the row, not the stale version',
    );

    service.stop();
    teardownConfig();
    t.end();
  });

test('CDCGroupPropagationService coalesces duplicate background retries for the same target set',
  async (t) => {
    setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
    const cache = createTopologyCache();
    const router = createMessageRouter();
    const tree = {
      getRoutingOrder: () => ['g-1', 'g-2', 'g-3'],
    };
    const service = new CDCGroupPropagationService({
      nodeId: 'node-a',
      systemTableCache: cache,
      messageRouter: router,
      latencyTreeService: tree,
      nowFn: () => 7200,
      deliveryRetryDelayMs: 1000,
      deliveryRetryMaxDelayMs: 1000,
      deliveryRetryBackoffMultiplier: 1,
    });
    service.initialize();
    service.start();

    service.scheduleBackgroundRetry({
      tableName: TABLES.NODES,
      operation: 'UPSERT',
      data: {[COLUMN.NODE_ID]: 'node-coalesced'},
      sourceGroupId: 'g-1',
      targets: [
        {groupId: 'g-2', address: 'node-b/message-group/mg-node-b-r1'},
        {groupId: 'g-3', address: 'node-c/message-group/mg-node-c-r1'},
      ],
      attempt: 2,
    });
    service.scheduleBackgroundRetry({
      tableName: TABLES.NODES,
      operation: 'UPSERT',
      data: {[COLUMN.NODE_ID]: 'node-coalesced'},
      sourceGroupId: 'g-1',
      targets: [
        {groupId: 'g-3', address: 'node-c/message-group/mg-node-c-r1'},
        {groupId: 'g-2', address: 'node-b/message-group/mg-node-b-r1'},
      ],
      attempt: 2,
    });

    assert.equal(
      service.backgroundRetryTimers.size,
      1,
      'duplicate background retries for the same target group set should collapse to one timer',
    );

    service.stop();
    teardownConfig();
    t.end();
  });

test('CDCGroupPropagationService batches background retry waves by target set',
  async (t) => {
    setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
    const cache = createTopologyCache();
    const router = createMessageRouter([{acknowledged: true}]);
    const service = new CDCGroupPropagationService({
      nodeId: 'node-a',
      systemTableCache: cache,
      messageRouter: router,
      latencyTreeService: {
        getRoutingOrder: () => ['g-1', 'g-2'],
      },
      nowFn: () => 7250,
      deliveryRetryDelayMs: 5,
      deliveryRetryMaxDelayMs: 5,
      deliveryRetryBackoffMultiplier: 1,
    });
    service.initialize();
    service.start();

    service.scheduleBackgroundRetry({
      tableName: TABLES.NODES,
      operation: 'UPDATE',
      data: {[COLUMN.NODE_ID]: 'node-bg-1', status: 'warming'},
      sourceGroupId: 'g-1',
      targets: [
        {groupId: 'g-2', address: 'node-b/message-group/mg-node-b-r1'},
      ],
      attempt: 2,
    });
    service.scheduleBackgroundRetry({
      tableName: TABLES.NODES,
      operation: 'UPDATE',
      data: {[COLUMN.NODE_ID]: 'node-bg-2', status: 'active'},
      sourceGroupId: 'g-1',
      targets: [
        {groupId: 'g-2', address: 'node-b/message-group/mg-node-b-r1'},
      ],
      attempt: 2,
    });

    const delivered = await waitForCondition(
      () => router.calls.length === 1,
      1000,
      10,
    );
    assert.equal(delivered, true);
    assert.equal(
      router.calls[0].payload.type,
      LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION_BATCH,
    );
    assert.equal(router.calls[0].payload.events.length, 2);

    service.stop();
    teardownConfig();
    t.end();
  });

test('CDCGroupPropagationService defers background retries while local router pressure is active',
  async (t) => {
    setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
    const cache = createTopologyCache();
    const routerPressure = {
      backpressured: true,
      saturatedNodeCount: 1,
      totalPending: 48,
      maxPendingUtilization: 0.75,
    };
    const router = createMessageRouter([
      {acknowledged: true},
    ]);
    router.getOutboundPressureSummary = () => ({...routerPressure});
    const tree = {
      getRoutingOrder: () => ['g-1', 'g-2'],
    };
    const service = new CDCGroupPropagationService({
      nodeId: 'node-a',
      systemTableCache: cache,
      messageRouter: router,
      latencyTreeService: tree,
      nowFn: () => 7300,
      deliveryRetryDelayMs: 5,
      deliveryRetryMaxDelayMs: 5,
      deliveryRetryBackoffMultiplier: 1,
    });
    service.initialize();
    service.start();

    service.scheduleBackgroundRetry({
      tableName: TABLES.NODES,
      operation: 'UPSERT',
      data: {[COLUMN.NODE_ID]: 'node-deferred'},
      sourceGroupId: 'g-1',
      targets: [
        {groupId: 'g-2', address: 'node-b/message-group/mg-node-b-r1'},
      ],
      attempt: 2,
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(
      router.calls.length,
      0,
      'background retry should not redrive delivery while the local router is backpressured',
    );

    routerPressure.backpressured = false;
    routerPressure.saturatedNodeCount = 0;
    routerPressure.totalPending = 0;
    routerPressure.maxPendingUtilization = 0;

    const deliveredAfterPressureClears = await waitForCondition(
      () => router.calls.length === 1,
      1000,
      10,
    );
    assert.equal(
      deliveredAfterPressureClears,
      true,
      'background retry should resume once local router pressure clears',
    );

    service.stop();
    teardownConfig();
    t.end();
  });


test('CDCGroupPropagationService keeps partition visibility propagation on the critical lane under local router pressure',
  async (t) => {
    setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
    const cache = createTopologyCache({
      nodes: [{
        [COLUMN.NODE_ID]: 'node-a',
        [COLUMN.LATENCY_GROUP_ID]: 'g-1',
      }],
      groups: [
        createGroupRow('g-1', 'node-a'),
        createGroupRow('g-2', 'node-b'),
      ],
      services: [
        createMessageGroupServiceRow(
          'mg-node-b-r1',
          'node-b',
          'node-b/message-group/mg-node-b-r1',
          RAFT_ROLE.LEADER,
          'g-2',
        ),
      ],
    });
    const source = createSourceMessageGroupService();
    source.groupId = 'g-1';
    const routerPressure = {
      backpressured: true,
      saturatedNodeCount: 1,
      totalPending: 48,
      maxPendingUtilization: 0.75,
    };
    const router = createMessageRouter([{acknowledged: true}]);
    router.getOutboundPressureSummary = () => ({...routerPressure});
    const service = new CDCGroupPropagationService({
      nodeId: 'node-a',
      systemTableCache: cache,
      messageRouter: router,
      latencyTreeService: {
        getRoutingOrder: () => ['g-1', 'g-2'],
      },
      nowFn: () => 7160,
      deliveryRetryDelayMs: 5,
      deliveryRetryMaxDelayMs: 5,
      deliveryRetryBackoffMultiplier: 1,
    });
    service.initialize();
    service.start();

    const result = await service.propagateCDCEvent({
      tableName: TABLES.PARTITIONS,
      operation: 'INSERT',
      data: {
        partition_id: 'tbl-critical-p1',
        table_id: 'tbl-critical',
      },
      sourceMessageGroupService: source,
    });

    assert.equal(result.success, true);
    assert.equal(router.calls.length, 1,
      'critical partition visibility propagation should bypass local background defer');
    assert.equal(
      router.calls[0].options?.deliveryPriority,
      'critical',
      'partition visibility propagation should claim the critical router lane',
    );

    service.stop();
    teardownConfig();
    t.end();
  });
