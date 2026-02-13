import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {LoggingService} from '../../src/logging/logging-service.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {
  GroupSelectionService,
} from '../../src/topology/group-selection-service.js';

function setupLogging() {
  LoggingService.resetInstance();
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function teardownLogging() {
  LoggingService.resetInstance();
}

function createNode(nodeId, status = 'active', groupId = 'g-1') {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: status,
    [COLUMN.LATENCY_GROUP_ID]: groupId,
    [COLUMN.CREATED_AT]: 1,
  };
}

test('selectGroupLeadership picks deterministic representative/coordinator',
  async (t) => {
    setupLogging();
    const service = new GroupSelectionService();
    const groupRow = {
      [COLUMN.GROUP_ID]: 'g-1',
      [COLUMN.REPRESENTATIVE_NODE_ID]: null,
      [COLUMN.COORDINATOR_NODE_ID]: null,
    };
    const memberRows = [
      createNode('node-c'),
      createNode('node-a'),
      createNode('node-b'),
    ];

    const selection = service.selectGroupLeadership({groupRow, memberRows});
    assert.equal(selection.representativeNodeId, 'node-a');
    assert.equal(selection.coordinatorNodeId, 'node-b');
    assert.equal(selection.representativeChanged, true);
    assert.equal(selection.coordinatorChanged, true);
    teardownLogging();
    t.end();
  });

test('selection is order-independent for same metadata', async (t) => {
  setupLogging();
  const service = new GroupSelectionService();
  const groupRow = {
    [COLUMN.GROUP_ID]: 'g-1',
    [COLUMN.REPRESENTATIVE_NODE_ID]: null,
    [COLUMN.COORDINATOR_NODE_ID]: null,
  };
  const canonicalMembers = [
    createNode('node-a'),
    createNode('node-b'),
    createNode('node-c'),
    createNode('node-d'),
  ];

  await fc.assert(
    fc.asyncProperty(
      fc.shuffledSubarray(canonicalMembers, {
        minLength: canonicalMembers.length,
        maxLength: canonicalMembers.length,
      }),
      async (shuffled) => {
        const selection = service.selectGroupLeadership({
          groupRow,
          memberRows: shuffled,
        });
        assert.equal(selection.representativeNodeId, 'node-a');
        assert.equal(selection.coordinatorNodeId, 'node-b');
      },
    ),
    {numRuns: 10},
  );

  teardownLogging();
  t.end();
});

test('selectGroupLeadership keeps current leader if still eligible', async (t) => {
  setupLogging();
  const service = new GroupSelectionService();
  const groupRow = {
    [COLUMN.GROUP_ID]: 'g-1',
    [COLUMN.REPRESENTATIVE_NODE_ID]: 'node-c',
    [COLUMN.COORDINATOR_NODE_ID]: 'node-b',
  };
  const memberRows = [
    createNode('node-a'),
    createNode('node-b'),
    createNode('node-c'),
  ];

  const selection = service.selectGroupLeadership({groupRow, memberRows});
  assert.equal(selection.representativeNodeId, 'node-c');
  assert.equal(selection.coordinatorNodeId, 'node-b');
  assert.equal(selection.representativeChanged, false);
  assert.equal(selection.coordinatorChanged, false);
  teardownLogging();
  t.end();
});

test('selectGroupLeadership fails over deterministically when nodes degrade',
  async (t) => {
    setupLogging();
    const service = new GroupSelectionService();
    const groupRow = {
      [COLUMN.GROUP_ID]: 'g-1',
      [COLUMN.REPRESENTATIVE_NODE_ID]: 'node-b',
      [COLUMN.COORDINATOR_NODE_ID]: 'node-c',
    };
    const memberRows = [
      createNode('node-a', 'active'),
      createNode('node-b', 'draining'),
      createNode('node-c', 'active'),
    ];

    const selection = service.selectGroupLeadership({groupRow, memberRows});
    assert.equal(selection.representativeNodeId, 'node-a');
    assert.equal(selection.coordinatorNodeId, 'node-c');
    assert.equal(selection.representativeChanged, true);
    assert.equal(selection.coordinatorChanged, false);
    teardownLogging();
    t.end();
  });

test('applyGroupLeadership writes changed leadership through CDC', async (t) => {
  setupLogging();
  const calls = [];
  const cdc = {
    upsertSystemTableRow: async (tableName, row) => {
      calls.push({tableName, row});
      return {success: true};
    },
  };
  const service = new GroupSelectionService({
    cdcIntegrationService: cdc,
    nowFn: () => 5000,
  });
  const groupRow = {
    [COLUMN.GROUP_ID]: 'g-1',
    [COLUMN.REPRESENTATIVE_NODE_ID]: null,
    [COLUMN.COORDINATOR_NODE_ID]: null,
    [COLUMN.CREATED_AT]: 1000,
  };
  const memberRows = [createNode('node-a'), createNode('node-b')];

  const result = await service.applyGroupLeadership({groupRow, memberRows});
  assert.equal(result.changed, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tableName, TABLES.LATENCY_GROUPS);
  assert.equal(calls[0].row[COLUMN.REPRESENTATIVE_NODE_ID], 'node-a');
  assert.equal(calls[0].row[COLUMN.COORDINATOR_NODE_ID], 'node-b');
  assert.equal(calls[0].row[COLUMN.UPDATED_AT], 5000);
  teardownLogging();
  t.end();
});

test('applyGroupLeadership skips CDC write when leadership is unchanged',
  async (t) => {
    setupLogging();
    let callCount = 0;
    const cdc = {
      upsertSystemTableRow: async () => {
        callCount += 1;
        return {success: true};
      },
    };
    const service = new GroupSelectionService({cdcIntegrationService: cdc});
    const groupRow = {
      [COLUMN.GROUP_ID]: 'g-1',
      [COLUMN.REPRESENTATIVE_NODE_ID]: 'node-a',
      [COLUMN.COORDINATOR_NODE_ID]: 'node-b',
    };
    const memberRows = [createNode('node-a'), createNode('node-b')];

    const result = await service.applyGroupLeadership({groupRow, memberRows});
    assert.equal(result.changed, false);
    assert.equal(callCount, 0);
    teardownLogging();
    t.end();
  });
