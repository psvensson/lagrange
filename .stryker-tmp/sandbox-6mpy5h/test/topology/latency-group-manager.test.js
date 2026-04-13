// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {COLUMN, NODE_STATE, NUM, TABLES} from '../../src/constants/index.js';
import {
  LATENCY_ASSIGNMENT_STATE,
  LATENCY_GROUP_STATE,
} from '../../src/topology/latency-topology-constants.js';
import {
  LatencyGroupManager,
} from '../../src/topology/latency-group-manager.js';
import {
  LATENCY_GROUP_MANAGER_REASON,
} from '../../src/topology/latency-group-manager-constants.js';

function setupConfig(overrides = {}) {
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
      propagationMode: 'safe',
      ...overrides,
    },
  });
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function teardownConfig() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function createNodeRow(nodeId, groupId = null) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: NODE_STATE.ACTIVE,
    [COLUMN.LATENCY_GROUP_ID]: groupId,
    [COLUMN.CREATED_AT]: NUM.ONE,
  };
}

function createGroupRow(groupId, representativeNodeId) {
  return {
    [COLUMN.GROUP_ID]: groupId,
    [COLUMN.REPRESENTATIVE_NODE_ID]: representativeNodeId,
    [COLUMN.COORDINATOR_NODE_ID]: representativeNodeId,
    [COLUMN.STATE]: LATENCY_GROUP_STATE.ACTIVE,
    [COLUMN.CREATED_AT]: NUM.ONE,
    [COLUMN.UPDATED_AT]: NUM.ONE,
  };
}

function createMockCache({nodes = [], groups = []} = {}) {
  const nodeRows = new Map(
    nodes.map((row) => [row[COLUMN.NODE_ID], {...row}]),
  );
  const groupRows = new Map(
    groups.map((row) => [row[COLUMN.GROUP_ID], {...row}]),
  );

  const getTable = (tableName) => {
    if (tableName === TABLES.NODES) {
      return nodeRows;
    }
    if (tableName === TABLES.LATENCY_GROUPS) {
      return groupRows;
    }
    return new Map();
  };

  return {
    get: (tableName, key) => {
      const table = getTable(tableName);
      const row = table.get(key);
      return row ? {...row} : null;
    },
    getAll: (tableName) => {
      const table = getTable(tableName);
      return Array.from(table.values()).map((row) => ({...row}));
    },
    has: (tableName, key) => {
      const table = getTable(tableName);
      return table.has(key);
    },
  };
}

function createMockMeasurementService(latencyByNodeId = {}) {
  const calls = [];
  return {
    calls,
    measureNodeLatency: async (nodeId) => {
      calls.push(nodeId);
      if (!Object.prototype.hasOwnProperty.call(latencyByNodeId, nodeId)) {
        return null;
      }

      const rttMs = latencyByNodeId[nodeId];
      if (!Number.isFinite(rttMs)) {
        return null;
      }

      return {
        rttMs,
        attempt: NUM.ZERO,
      };
    },
  };
}

function createMockGroupSelectionService() {
  const calls = [];
  return {
    calls,
    applyGroupLeadership: async (options) => {
      calls.push(options);
      return {changed: false};
    },
  };
}

function createMockCdc() {
  const updates = [];
  const upserts = [];
  return {
    updates,
    upserts,
    updateSystemTableRow: async (tableName, whereClause, data) => {
      updates.push({tableName, whereClause, data});
      return {success: true};
    },
    upsertSystemTableRow: async (tableName, row) => {
      upserts.push({tableName, row});
      return {success: true};
    },
  };
}

function createTimerHarness() {
  const scheduled = [];
  return {
    scheduled,
    setTimeoutFn: (fn, delayMs) => {
      const handle = {
        fn,
        delayMs,
        cleared: false,
        unrefCalled: false,
        unref() {
          this.unrefCalled = true;
        },
      };
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn: (handle) => {
      handle.cleared = true;
    },
  };
}

test('runAssignmentCycle joins nearest eligible group for unassigned node',
  async (t) => {
    setupConfig();
    const cache = createMockCache({
      nodes: [
        createNodeRow('node-a'),
        createNodeRow('rep-g-1', 'g-1'),
        createNodeRow('rep-g-2', 'g-2'),
      ],
      groups: [
        createGroupRow('g-1', 'rep-g-1'),
        createGroupRow('g-2', 'rep-g-2'),
      ],
    });
    const cdc = createMockCdc();
    const measurement = createMockMeasurementService({
      'rep-g-1': 70,
      'rep-g-2': 30,
    });
    const selection = createMockGroupSelectionService();
    const manager = new LatencyGroupManager({
      nodeId: 'node-a',
      systemTableCache: cache,
      cdcIntegrationService: cdc,
      latencyMeasurementService: measurement,
      groupSelectionService: selection,
      nowFn: () => 5000,
    });
    manager.initialize();

    const result = await manager.runAssignmentCycle();

    assert.equal(result.success, true);
    assert.equal(result.changed, true);
    assert.equal(result.reason, LATENCY_GROUP_MANAGER_REASON.JOIN_NEAREST_GROUP);
    assert.equal(result.previousGroupId, null);
    assert.equal(result.targetGroupId, 'g-2');
    assert.equal(cdc.updates.length, 1);
    assert.equal(cdc.upserts.length, 0);
    assert.equal(cdc.updates[0].tableName, TABLES.NODES);
    assert.equal(
      cdc.updates[0].data[COLUMN.LATENCY_ASSIGNMENT_STATE],
      LATENCY_ASSIGNMENT_STATE.ASSIGNED,
    );
    assert.equal(cdc.updates[0].data[COLUMN.LATENCY_GROUP_ID], 'g-2');
    assert.equal(selection.calls.length, 1);
    assert.equal(
      selection.calls[0].groupRow[COLUMN.GROUP_ID],
      'g-2',
    );

    teardownConfig();
    t.end();
  });

test('runAssignmentCycle creates a group when no eligible group exists', async (t) => {
  setupConfig();
  const cache = createMockCache({
    nodes: [createNodeRow('node-a')],
    groups: [],
  });
  const cdc = createMockCdc();
  const measurement = createMockMeasurementService();
  const selection = createMockGroupSelectionService();
  const manager = new LatencyGroupManager({
    nodeId: 'node-a',
    systemTableCache: cache,
    cdcIntegrationService: cdc,
    latencyMeasurementService: measurement,
    groupSelectionService: selection,
    nowFn: () => 5000,
  });
  manager.initialize();

  const result = await manager.runAssignmentCycle();

  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  assert.equal(result.createdGroup, true);
  assert.equal(result.reason, LATENCY_GROUP_MANAGER_REASON.CREATE_NEW_GROUP);
  assert.equal(result.targetGroupId, 'lg-node-a-5000');
  assert.equal(cdc.upserts.length, 1);
  assert.equal(cdc.upserts[0].tableName, TABLES.LATENCY_GROUPS);
  assert.equal(cdc.upserts[0].row[COLUMN.GROUP_ID], 'lg-node-a-5000');
  assert.equal(cdc.upserts[0].row[COLUMN.REPRESENTATIVE_NODE_ID], 'node-a');
  assert.equal(cdc.upserts[0].row[COLUMN.COORDINATOR_NODE_ID], 'node-a');
  assert.equal(cdc.updates.length, 1);
  assert.equal(cdc.updates[0].data[COLUMN.LATENCY_GROUP_ID], 'lg-node-a-5000');
  assert.equal(selection.calls.length, 1);

  teardownConfig();
  t.end();
});

test('runAssignmentCycle tolerates async cache.has during group-id generation',
  async (t) => {
    setupConfig();
    const cache = createMockCache({
      nodes: [createNodeRow('node-a')],
      groups: [],
    });
    const originalHas = cache.has;
    cache.has = async (tableName, key) => originalHas(tableName, key);

    const cdc = createMockCdc();
    const measurement = createMockMeasurementService();
    const selection = createMockGroupSelectionService();
    const manager = new LatencyGroupManager({
      nodeId: 'node-a',
      systemTableCache: cache,
      cdcIntegrationService: cdc,
      latencyMeasurementService: measurement,
      groupSelectionService: selection,
      nowFn: () => 6000,
    });
    manager.initialize();

    const result = await manager.runAssignmentCycle();

    assert.equal(result.success, true);
    assert.equal(result.changed, true);
    assert.equal(result.createdGroup, true);
    assert.equal(result.reason, LATENCY_GROUP_MANAGER_REASON.CREATE_NEW_GROUP);
    assert.equal(result.targetGroupId, 'lg-node-a-6000');
    assert.equal(cdc.upserts.length, 1);
    assert.equal(cdc.updates.length, 1);

    teardownConfig();
    t.end();
  });

test('runAssignmentCycle reassigns node when better eligible group exists',
  async (t) => {
    setupConfig();
    const cache = createMockCache({
      nodes: [createNodeRow('node-a', 'g-1')],
      groups: [
        createGroupRow('g-1', 'rep-g-1'),
        createGroupRow('g-2', 'rep-g-2'),
      ],
    });
    const cdc = createMockCdc();
    const measurement = createMockMeasurementService({
      'rep-g-1': 90,
      'rep-g-2': 20,
    });
    const selection = createMockGroupSelectionService();
    const manager = new LatencyGroupManager({
      nodeId: 'node-a',
      systemTableCache: cache,
      cdcIntegrationService: cdc,
      latencyMeasurementService: measurement,
      groupSelectionService: selection,
      nowFn: () => 7000,
    });
    manager.initialize();

    const result = await manager.runAssignmentCycle();

    assert.equal(result.success, true);
    assert.equal(result.changed, true);
    assert.equal(
      result.reason,
      LATENCY_GROUP_MANAGER_REASON.REASSIGN_TO_BETTER_GROUP,
    );
    assert.equal(result.previousGroupId, 'g-1');
    assert.equal(result.targetGroupId, 'g-2');
    assert.equal(cdc.updates.length, 2);
    assert.equal(
      cdc.updates[0].data[COLUMN.LATENCY_ASSIGNMENT_STATE],
      LATENCY_ASSIGNMENT_STATE.REASSIGNING,
    );
    assert.equal(cdc.updates[0].data[COLUMN.LATENCY_GROUP_ID], 'g-1');
    assert.equal(
      cdc.updates[1].data[COLUMN.LATENCY_ASSIGNMENT_STATE],
      LATENCY_ASSIGNMENT_STATE.ASSIGNED,
    );
    assert.equal(cdc.updates[1].data[COLUMN.LATENCY_GROUP_ID], 'g-2');
    assert.equal(cdc.upserts.length, 1);
    assert.equal(cdc.upserts[0].row[COLUMN.GROUP_ID], 'g-1');
    assert.equal(cdc.upserts[0].row[COLUMN.STATE], LATENCY_GROUP_STATE.DRAINING);
    assert.equal(selection.calls.length, 2);

    teardownConfig();
    t.end();
  });

test('runAssignmentCycle keeps current group when nearest is not better', async (t) => {
  setupConfig();
  const cache = createMockCache({
    nodes: [createNodeRow('node-a', 'g-1')],
    groups: [
      createGroupRow('g-1', 'rep-g-1'),
      createGroupRow('g-2', 'rep-g-2'),
    ],
  });
  const cdc = createMockCdc();
  const measurement = createMockMeasurementService({
    'rep-g-1': 10,
    'rep-g-2': 40,
  });
  const selection = createMockGroupSelectionService();
  const manager = new LatencyGroupManager({
    nodeId: 'node-a',
    systemTableCache: cache,
    cdcIntegrationService: cdc,
    latencyMeasurementService: measurement,
    groupSelectionService: selection,
    nowFn: () => 9000,
  });
  manager.initialize();

  const result = await manager.runAssignmentCycle();

  assert.equal(result.success, true);
  assert.equal(result.changed, false);
  assert.equal(result.reason, LATENCY_GROUP_MANAGER_REASON.KEEP_CURRENT_GROUP);
  assert.equal(result.targetGroupId, 'g-1');
  assert.equal(cdc.updates.length, 1);
  assert.equal(cdc.updates[0].data[COLUMN.LATENCY_GROUP_ID], 'g-1');
  assert.equal(cdc.upserts.length, 0);
  assert.equal(selection.calls.length, 1);

  teardownConfig();
  t.end();
});

test('start schedules periodic cycle with jitter and stop clears timer', async (t) => {
  setupConfig({recalcIntervalMs: 1000, recalcJitterRatio: 0.1});
  const cache = createMockCache({
    nodes: [createNodeRow('node-a', 'g-1')],
    groups: [createGroupRow('g-1', 'rep-g-1')],
  });
  const cdc = createMockCdc();
  const measurement = createMockMeasurementService({'rep-g-1': 25});
  const selection = createMockGroupSelectionService();
  const timerHarness = createTimerHarness();
  const manager = new LatencyGroupManager({
    nodeId: 'node-a',
    systemTableCache: cache,
    cdcIntegrationService: cdc,
    latencyMeasurementService: measurement,
    groupSelectionService: selection,
    nowFn: () => 12000,
    randomFn: () => NUM.ONE,
    setTimeoutFn: timerHarness.setTimeoutFn,
    clearTimeoutFn: timerHarness.clearTimeoutFn,
  });
  manager.initialize();

  manager.start({runImmediately: false});

  assert.equal(timerHarness.scheduled.length, 1);
  assert.equal(timerHarness.scheduled[0].delayMs, 1100);
  assert.equal(timerHarness.scheduled[0].unrefCalled, true);

  manager.stop();
  assert.equal(timerHarness.scheduled[0].cleared, true);

  teardownConfig();
  t.end();
});

test('stop waits for an in-flight assignment cycle to finish', async (t) => {
  setupConfig();
  const cache = createMockCache({
    nodes: [createNodeRow('node-a', 'g-1')],
    groups: [createGroupRow('g-1', 'rep-g-1')],
  });
  const updates = [];
  let resolveUpdate = null;
  const cdc = {
    updates,
    upserts: [],
    updateSystemTableRow: async (tableName, whereClause, data) => {
      await new Promise((resolve) => {
        resolveUpdate = () => {
          updates.push({tableName, whereClause, data});
          resolve();
        };
      });
      return {success: true};
    },
    upsertSystemTableRow: async () => ({success: true}),
  };
  const measurement = createMockMeasurementService({'rep-g-1': 25});
  const selection = createMockGroupSelectionService();
  const manager = new LatencyGroupManager({
    nodeId: 'node-a',
    systemTableCache: cache,
    cdcIntegrationService: cdc,
    latencyMeasurementService: measurement,
    groupSelectionService: selection,
    nowFn: () => 13000,
  });
  manager.initialize();

  manager.start({runImmediately: true});

  for (let attempts = 0; attempts < 10 && !resolveUpdate; attempts += 1) {
    await Promise.resolve();
  }
  assert.equal(typeof resolveUpdate, 'function');

  let stopResolved = false;
  const stopPromise = manager.stop().then(() => {
    stopResolved = true;
  });

  await Promise.resolve();
  assert.equal(stopResolved, false);

  resolveUpdate();
  await stopPromise;

  assert.equal(stopResolved, true);
  assert.equal(updates.length, 1);

  teardownConfig();
  t.end();
});
