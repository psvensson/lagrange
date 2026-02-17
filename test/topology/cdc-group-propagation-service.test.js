import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  COLUMN,
  SERVICE_TYPE,
  SERVICE_STATUS,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  LATENCY_PROPAGATION_MODE,
  LATENCY_TOPOLOGY_MESSAGE_TYPE,
} from '../../src/topology/latency-topology-constants.js';
import {
  CDC_GROUP_PROPAGATION_REASON,
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

function createGroupRow(groupId, coordinatorNodeId) {
  return {
    [COLUMN.GROUP_ID]: groupId,
    [COLUMN.COORDINATOR_NODE_ID]: coordinatorNodeId,
    [COLUMN.STATE]: 'active',
  };
}

function createMessageGroupServiceRow(serviceId, nodeId, address, raftRole) {
  return {
    [COLUMN.SERVICE_ID]: serviceId,
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
    debugLogs.some((entry) => entry.message === 'Falling back to safe CDC propagation mode'),
    'config safe mode fallback should emit debug diagnostic',
  );

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
        createGroupRow('g-2', 'node-b'),
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
    assert.equal(
      result.fallbackReason,
      CDC_GROUP_PROPAGATION_REASON.MISSING_COORDINATOR_ADDRESS,
    );
    assert.equal(source.calls.length, 1);
    assert.equal(router.calls.length, 0);
    assert.equal(fallbackEvents.length, 1);
    assert.equal(fallbackEvents[0].reason, result.fallbackReason);
    assert.ok(
      warnLogs.some((entry) => entry.message === 'Falling back to safe CDC propagation mode'),
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
    {acknowledged: false, error: 'timeout'},
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
    nowFn: () => 4000,
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
  assert.equal(result.success, false);
  assert.equal(result.deliveryFailures.length, 1);
  assert.equal(result.deliveryFailures[0].targetGroupId, 'g-2');
  assert.equal(service.getStats().groupedDeliveryFailureCount, 1);

  service.stop();
  teardownConfig();
  t.end();
});
