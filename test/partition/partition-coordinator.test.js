/**
 * Unit tests for PartitionCoordinator.
 * Validates lifecycle orchestration, query delegation, CDC triggering,
 * and delegated accessors.
 * Requirements: 5.6, 5.7, 5.8, 5.9
 */

import {test} from '../../src/test-helpers/tap.js';
import {PartitionCoordinator} from
  '../../src/partition/partition-coordinator.js';
import {
  COORDINATOR_ERROR_MSG,
  COORDINATOR_STATE,
} from '../../src/partition/partition-coordinator-constants.js';

/**
 * Create a silent logger for tests.
 * @return {Object} Logger with no-op methods.
 */
function createSilentLogger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

/**
 * Create a mock SQLiteStore that tracks calls.
 * @param {Array} callOrder - Shared array to track call order.
 * @return {Object} Mock SQLiteStore.
 */
function createMockSqliteStore(callOrder) {
  return {
    initialize: () => {
      callOrder.push('sqliteStore.initialize');
    },
    executeQuery: (sql, _params) => {
      const trimmed = sql.trim().toUpperCase();
      if (trimmed.startsWith('SELECT')) {
        return {rows: [{id: 1}], rowCount: 1};
      }
      return {changes: 1, lastInsertRowid: 1};
    },
    close: () => {
      callOrder.push('sqliteStore.close');
    },
  };
}

/**
 * Create a mock RaftGroup that tracks calls.
 * @param {Array} callOrder - Shared array to track call order.
 * @return {Object} Mock RaftGroup.
 */
function createMockRaftGroup(callOrder) {
  return {
    initialize: () => {
      callOrder.push('raftGroup.initialize');
    },
    shutdown: async () => {
      callOrder.push('raftGroup.shutdown');
    },
    getRole: () => 'leader',
    isLeaderReplica: () => true,
    startElection: () => {},
  };
}

/**
 * Create a mock CDCEmitter that tracks calls.
 * @param {Array} callOrder - Shared array to track call order.
 * @return {Object} Mock CDCEmitter.
 */
function createMockCdcEmitter(callOrder) {
  const emitCalls = [];
  return {
    shutdown: () => {
      callOrder.push('cdcEmitter.shutdown');
    },
    emitFromSQL: async (sql, params, info) => {
      emitCalls.push({sql, params, info});
    },
    getEmitCalls: () => emitCalls,
  };
}

/**
 * Default options for constructing a PartitionCoordinator in tests.
 * @param {Object} [overrides] - Option overrides.
 * @return {Object} Options with mocks and a shared callOrder array.
 */
function createTestSetup(overrides = {}) {
  const callOrder = [];
  const sqliteStore = createMockSqliteStore(callOrder);
  const raftGroup = createMockRaftGroup(callOrder);
  const cdcEmitter = createMockCdcEmitter(callOrder);

  const options = {
    partitionId: 'partition-1',
    tableId: 'table-1',
    raftGroup,
    sqliteStore,
    cdcEmitter,
    logger: createSilentLogger(),
    ...overrides,
  };

  return {options, callOrder, sqliteStore, raftGroup, cdcEmitter};
}

// ============================================================
// Constructor Validation Tests
// ============================================================

test('constructor throws when partitionId is missing', async (t) => {
  const {options} = createTestSetup();
  delete options.partitionId;

  t.throws(
    () => new PartitionCoordinator(options),
    {message: COORDINATOR_ERROR_MSG.MISSING_PARTITION_ID},
    'should throw MISSING_PARTITION_ID',
  );
});

test('constructor throws when tableId is missing', async (t) => {
  const {options} = createTestSetup();
  delete options.tableId;

  t.throws(
    () => new PartitionCoordinator(options),
    {message: COORDINATOR_ERROR_MSG.MISSING_TABLE_ID},
    'should throw MISSING_TABLE_ID',
  );
});

test('constructor throws when raftGroup is missing', async (t) => {
  const {options} = createTestSetup();
  delete options.raftGroup;

  t.throws(
    () => new PartitionCoordinator(options),
    {message: COORDINATOR_ERROR_MSG.MISSING_RAFT_GROUP},
    'should throw MISSING_RAFT_GROUP',
  );
});

test('constructor throws when sqliteStore is missing', async (t) => {
  const {options} = createTestSetup();
  delete options.sqliteStore;

  t.throws(
    () => new PartitionCoordinator(options),
    {message: COORDINATOR_ERROR_MSG.MISSING_SQLITE_STORE},
    'should throw MISSING_SQLITE_STORE',
  );
});

test('constructor throws when cdcEmitter is missing', async (t) => {
  const {options} = createTestSetup();
  delete options.cdcEmitter;

  t.throws(
    () => new PartitionCoordinator(options),
    {message: COORDINATOR_ERROR_MSG.MISSING_CDC_EMITTER},
    'should throw MISSING_CDC_EMITTER',
  );
});

test('constructor sets initial state to CREATED', async (t) => {
  const {options} = createTestSetup();
  const coordinator = new PartitionCoordinator(options);

  t.equal(
    coordinator.state,
    COORDINATOR_STATE.CREATED,
    'state should be CREATED after construction',
  );
});

// ============================================================
// Initialize Tests (Requirement 5.7)
// ============================================================

test('initialize calls components in correct order', async (t) => {
  const {options, callOrder} = createTestSetup();
  const coordinator = new PartitionCoordinator(options);

  await coordinator.initialize();

  t.equal(
    callOrder[0],
    'sqliteStore.initialize',
    'SQLiteStore should be initialized first',
  );
  t.equal(
    callOrder[1],
    'raftGroup.initialize',
    'RaftGroup should be initialized second',
  );
  t.equal(
    callOrder.length,
    2,
    'only SQLiteStore and RaftGroup initialize should be called',
  );
  t.equal(
    coordinator.state,
    COORDINATOR_STATE.INITIALIZED,
    'state should be INITIALIZED after initialize',
  );
});

test('initialize throws when already initialized', async (t) => {
  const {options} = createTestSetup();
  const coordinator = new PartitionCoordinator(options);

  await coordinator.initialize();

  await t.rejects(
    () => coordinator.initialize(),
    {message: COORDINATOR_ERROR_MSG.ALREADY_INITIALIZED},
    'should throw ALREADY_INITIALIZED on second call',
  );
});

test('initialize throws when already shut down', async (t) => {
  const {options} = createTestSetup();
  const coordinator = new PartitionCoordinator(options);

  await coordinator.initialize();
  await coordinator.shutdown();

  await t.rejects(
    () => coordinator.initialize(),
    {message: COORDINATOR_ERROR_MSG.ALREADY_SHUT_DOWN},
    'should throw ALREADY_SHUT_DOWN after shutdown',
  );
});

// ============================================================
// Shutdown Tests (Requirement 5.8)
// ============================================================

test('shutdown calls components in reverse order', async (t) => {
  const {options, callOrder} = createTestSetup();
  const coordinator = new PartitionCoordinator(options);

  await coordinator.initialize();

  // Clear the init call order to isolate shutdown calls
  callOrder.length = 0;

  await coordinator.shutdown();

  t.equal(
    callOrder[0],
    'cdcEmitter.shutdown',
    'CDCEmitter should be shut down first',
  );
  t.equal(
    callOrder[1],
    'raftGroup.shutdown',
    'RaftGroup should be shut down second',
  );
  t.equal(
    callOrder[2],
    'sqliteStore.close',
    'SQLiteStore should be shut down third',
  );
  t.equal(
    coordinator.state,
    COORDINATOR_STATE.SHUT_DOWN,
    'state should be SHUT_DOWN after shutdown',
  );
});

test('shutdown is idempotent - double shutdown is safe', async (t) => {
  const {options, callOrder} = createTestSetup();
  const coordinator = new PartitionCoordinator(options);

  await coordinator.initialize();
  callOrder.length = 0;

  await coordinator.shutdown();
  const firstShutdownCalls = callOrder.length;

  await coordinator.shutdown();

  t.equal(
    callOrder.length,
    firstShutdownCalls,
    'second shutdown should not call any components',
  );
});

test('shutdown on uninitialized coordinator is safe', async (t) => {
  const {options, callOrder} = createTestSetup();
  const coordinator = new PartitionCoordinator(options);

  await coordinator.shutdown();

  t.equal(
    callOrder.length > 0,
    true,
    'shutdown should still attempt component cleanup',
  );
  t.equal(
    coordinator.state,
    COORDINATOR_STATE.SHUT_DOWN,
    'state should be SHUT_DOWN',
  );
});

test('shutdown continues cleanup when component fails', async (t) => {
  const {options, callOrder} = createTestSetup();

  // Replace raftGroup with one that fails on shutdown
  options.raftGroup = {
    initialize: () => callOrder.push('raftGroup.initialize'),
    shutdown: async () => {
      callOrder.push('raftGroup.shutdown');
      throw new Error('raft shutdown failed');
    },
    getRole: () => 'leader',
    isLeaderReplica: () => true,
    startElection: () => {},
  };

  const coordinator = new PartitionCoordinator(options);

  await coordinator.initialize();
  callOrder.length = 0;

  await coordinator.shutdown();

  t.ok(
    callOrder.includes('raftGroup.shutdown'),
    'should attempt RaftGroup shutdown',
  );
  t.ok(
    callOrder.includes('sqliteStore.close'),
    'should still close SQLiteStore after RaftGroup failure',
  );
  t.equal(
    coordinator.state,
    COORDINATOR_STATE.SHUT_DOWN,
    'state should be SHUT_DOWN despite component failure',
  );
});

// ============================================================
// executeQuery Tests (Requirement 5.9)
// ============================================================

test('executeQuery delegates SELECT to SQLiteStore', async (t) => {
  const {options} = createTestSetup();
  const coordinator = new PartitionCoordinator(options);

  await coordinator.initialize();

  const result = await coordinator.executeQuery(
    'SELECT * FROM test_table',
  );

  t.ok(result.rows, 'should return rows from SQLiteStore');
  t.equal(result.rowCount, 1, 'should return correct row count');

  await coordinator.shutdown();
});

test('SELECT query does not trigger CDCEmitter', async (t) => {
  const {options, cdcEmitter} = createTestSetup();
  const coordinator = new PartitionCoordinator(options);

  await coordinator.initialize();

  await coordinator.executeQuery('SELECT * FROM test_table');

  t.equal(
    cdcEmitter.getEmitCalls().length,
    0,
    'CDCEmitter should not be called for SELECT',
  );

  await coordinator.shutdown();
});

test('INSERT query triggers CDCEmitter', async (t) => {
  const {options, cdcEmitter} = createTestSetup();
  const coordinator = new PartitionCoordinator(options);

  await coordinator.initialize();

  await coordinator.executeQuery(
    'INSERT INTO test_table (id) VALUES (?)',
    [1],
  );

  const emitCalls = cdcEmitter.getEmitCalls();
  t.equal(
    emitCalls.length,
    1,
    'CDCEmitter should be called once for INSERT',
  );
  t.match(
    emitCalls[0].sql,
    /INSERT/,
    'emitFromSQL should receive the INSERT SQL',
  );

  await coordinator.shutdown();
});

test('UPDATE query triggers CDCEmitter', async (t) => {
  const {options, cdcEmitter} = createTestSetup();
  const coordinator = new PartitionCoordinator(options);

  await coordinator.initialize();

  await coordinator.executeQuery(
    'UPDATE test_table SET name = ? WHERE id = ?',
    ['new-name', 1],
  );

  const emitCalls = cdcEmitter.getEmitCalls();
  t.equal(
    emitCalls.length,
    1,
    'CDCEmitter should be called once for UPDATE',
  );
  t.match(
    emitCalls[0].sql,
    /UPDATE/,
    'emitFromSQL should receive the UPDATE SQL',
  );

  await coordinator.shutdown();
});

test('DELETE query triggers CDCEmitter', async (t) => {
  const {options, cdcEmitter} = createTestSetup();
  const coordinator = new PartitionCoordinator(options);

  await coordinator.initialize();

  await coordinator.executeQuery(
    'DELETE FROM test_table WHERE id = ?',
    [1],
  );

  const emitCalls = cdcEmitter.getEmitCalls();
  t.equal(
    emitCalls.length,
    1,
    'CDCEmitter should be called once for DELETE',
  );
  t.match(
    emitCalls[0].sql,
    /DELETE/,
    'emitFromSQL should receive the DELETE SQL',
  );

  await coordinator.shutdown();
});

test('executeQuery throws when not initialized', async (t) => {
  const {options} = createTestSetup();
  const coordinator = new PartitionCoordinator(options);

  await t.rejects(
    () => coordinator.executeQuery('SELECT 1'),
    {message: COORDINATOR_ERROR_MSG.NOT_INITIALIZED},
    'should throw NOT_INITIALIZED',
  );
});

test('executeQuery passes params to SQLiteStore', async (t) => {
  const receivedArgs = [];
  const callOrder = [];
  const customStore = {
    initialize: () => callOrder.push('sqliteStore.initialize'),
    executeQuery: (sql, params) => {
      receivedArgs.push({sql, params});
      return {rows: [], rowCount: 0};
    },
    close: () => callOrder.push('sqliteStore.close'),
  };

  const {options} = createTestSetup({sqliteStore: customStore});
  const coordinator = new PartitionCoordinator(options);

  await coordinator.initialize();

  const params = ['value1', 42];
  await coordinator.executeQuery(
    'SELECT * FROM t WHERE a = ? AND b = ?',
    params,
  );

  t.same(
    receivedArgs[0].params,
    params,
    'params should be passed through to SQLiteStore',
  );

  await coordinator.shutdown();
});

// ============================================================
// Delegated Accessor Tests
// ============================================================

test('getRole delegates to RaftGroup', async (t) => {
  const {options} = createTestSetup();
  const coordinator = new PartitionCoordinator(options);

  const role = coordinator.getRole();

  t.equal(role, 'leader', 'should return role from RaftGroup');
});

test('isLeaderReplica delegates to RaftGroup', async (t) => {
  const {options} = createTestSetup();
  const coordinator = new PartitionCoordinator(options);

  const isLeader = coordinator.isLeaderReplica();

  t.equal(isLeader, true, 'should return isLeader from RaftGroup');
});

test('startElection delegates to RaftGroup', async (t) => {
  let electionStarted = false;
  const callOrder = [];
  const customRaftGroup = {
    initialize: () => callOrder.push('raftGroup.initialize'),
    shutdown: async () => callOrder.push('raftGroup.shutdown'),
    getRole: () => 'follower',
    isLeaderReplica: () => false,
    startElection: () => {
      electionStarted = true;
    },
  };

  const {options} = createTestSetup({raftGroup: customRaftGroup});
  const coordinator = new PartitionCoordinator(options);

  coordinator.startElection();

  t.equal(
    electionStarted,
    true,
    'startElection should delegate to RaftGroup',
  );
});

// ============================================================
// Case-insensitive SQL detection Tests
// ============================================================

test('lowercase select does not trigger CDCEmitter', async (t) => {
  const {options, cdcEmitter} = createTestSetup();
  const coordinator = new PartitionCoordinator(options);

  await coordinator.initialize();

  await coordinator.executeQuery('select * from test_table');

  t.equal(
    cdcEmitter.getEmitCalls().length,
    0,
    'CDCEmitter should not be called for lowercase select',
  );

  await coordinator.shutdown();
});

test('mixed case SELECT does not trigger CDCEmitter', async (t) => {
  const {options, cdcEmitter} = createTestSetup();
  const coordinator = new PartitionCoordinator(options);

  await coordinator.initialize();

  await coordinator.executeQuery('Select * From test_table');

  t.equal(
    cdcEmitter.getEmitCalls().length,
    0,
    'CDCEmitter should not be called for mixed case Select',
  );

  await coordinator.shutdown();
});

test('whitespace-prefixed SELECT does not trigger CDCEmitter',
  async (t) => {
    const {options, cdcEmitter} = createTestSetup();
    const coordinator = new PartitionCoordinator(options);

    await coordinator.initialize();

    await coordinator.executeQuery('  SELECT * FROM test_table');

    t.equal(
      cdcEmitter.getEmitCalls().length,
      0,
      'CDCEmitter should not be called for whitespace-prefixed SELECT',
    );

    await coordinator.shutdown();
  });
