import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {CancellationToken} from '../../src/query/cancellation-token.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {
  METADATA_AUTHORITY_ERROR_CODE,
  METADATA_AUTHORITY_REFRESH_OUTCOME,
  METADATA_AUTHORITY_UNAVAILABLE_REASON,
} from '../../src/query/sql-query-engine-metadata-authority-refresh.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CACHE_CDC_OPERATIONS} from '../../src/cache/cache-constants.js';
import {TABLES} from '../../src/constants/index.js';
import {
  createCommittedServeEligibilityOwner,
} from '../control-plane/serve-eligibility-test-support.js';
import {
  createMockMessageRouter,
  createMockSystemCache,
  mockPartitionData,
} from './sql-query-engine-test-support.js';
import {
  createTransactionPersistenceGateway,
} from '../test-helpers/transaction-persistence-gateway.js';

const config = ConfigurationManager.getInstance();
config.initialize();

const TEST_NODE_ID = 'test-node';
const SESSION_TX_SELECT = 'tx-cold-select-session';
const SESSION_TX_JOIN = 'tx-cold-join-session';
const ACCOUNTS_TABLE = 'accounts';
const ACCOUNTS_PARTITION = 'accounts-p1';
const USERS_TABLE = 'users';
const USERS_PARTITION = 'users-p1';
const ORDERS_TABLE = 'orders';
const ORDERS_PARTITION_1 = 'orders-p1';
const ORDERS_PARTITION_2 = 'orders-p2';
const REFRESHED_PARTITION_VERSION = 3;
const SHORT_TIMEOUT_MS = 25;
const HANG_DELAY_MS = 300;
const CANCEL_DELAY_MS = 15;

function buildServiceRow(partitionId) {
  return {
    service_id: partitionId,
    service_type: 'partition',
    partition_id: partitionId,
    node_id: TEST_NODE_ID,
    raft_role: 'leader',
    address: `${TEST_NODE_ID}/partition/${partitionId}`,
    status: 'active',
  };
}

function buildAuthoritativeCatalogGateway(catalog, hooks = {}) {
  return {
    async readAuthoritativeRows(tableName, _sql, params = [], options = {}) {
      hooks.onRead?.({tableName, params, options});
      if (typeof hooks.overrideRead === 'function') {
        return hooks.overrideRead(tableName, params, options);
      }
      const targetTable = params[0] || null;
      if (tableName === TABLES.TABLES) {
        const rows = (catalog.tables || []).filter(
          (row) => row.table_name === targetTable,
        );
        return {success: true, rows};
      }
      if (tableName === TABLES.PARTITIONS) {
        const rows = (catalog.partitions || []).filter(
          (row) => row.table_name === targetTable,
        );
        return {success: true, rows};
      }
      if (tableName === TABLES.SERVICES) {
        return {success: true, rows: catalog.services || []};
      }
      return {success: true, rows: []};
    },
  };
}

function attachCatalogReadsToPersistenceGateway(
  persistenceGateway,
  catalog,
  hooks = {},
) {
  const originalRead =
    persistenceGateway.readAuthoritativeRows.bind(persistenceGateway);
  const catalogGateway = buildAuthoritativeCatalogGateway(catalog, hooks);
  const catalogTables = new Set([
    TABLES.TABLES,
    TABLES.PARTITIONS,
    TABLES.SERVICES,
  ]);
  persistenceGateway.readAuthoritativeRows = (
    tableName,
    sql,
    params,
    options,
  ) => {
    if (catalogTables.has(tableName)) {
      return catalogGateway.readAuthoritativeRows(
        tableName,
        sql,
        params,
        options,
      );
    }
    return originalRead(tableName, sql, params, options);
  };
  return persistenceGateway;
}

test('Witness 1: transactional cold-metadata SELECT refreshes complete ' +
  'distributedPlan and enlists refreshed partitions', async (t) => {
  mockPartitionData.set(ACCOUNTS_PARTITION, [
    {id: 'acc-1', balance: 100},
  ]);
  t.teardown(() => {
    mockPartitionData.delete(ACCOUNTS_PARTITION);
  });

  const cache = createMockSystemCache([], []);
  const observedReadModes = [];
  const txPersistence = attachCatalogReadsToPersistenceGateway(
    createTransactionPersistenceGateway(),
    {
      tables: [{
        table_name: ACCOUNTS_TABLE,
        primary_key: 'id',
        partition_key: 'id',
        partition_key_type: 'TEXT',
        active_partition_version: 1,
      }],
      partitions: [{
        partition_id: ACCOUNTS_PARTITION,
        table_name: ACCOUNTS_TABLE,
        partition_key_start: null,
        partition_key_end: null,
        partition_key_type: 'TEXT',
        partition_version: 1,
        state: 'NORMAL',
        leader_node_id: TEST_NODE_ID,
      }],
      services: [buildServiceRow(ACCOUNTS_PARTITION)],
    },
    {
      onRead: ({options}) => {
        observedReadModes.push(options?.authoritativeReadMode || null);
      },
    },
  );

  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    controlPlaneSystemTableGateway: txPersistence,
  });

  let executorObservedPlan = null;
  const originalExecuteSelect =
    engine.queryExecutor.executeSelect.bind(engine.queryExecutor);
  engine.queryExecutor.executeSelect = async (
    ast,
    partitionIds,
    params,
    options,
  ) => {
    executorObservedPlan = options.distributedPlan;
    return originalExecuteSelect(ast, partitionIds, params, options);
  };

  const beginResult = await engine.executeQuery('BEGIN', [], {
    sessionId: SESSION_TX_SELECT,
  });
  t.equal(beginResult.success, true, 'BEGIN should succeed');

  const selectResult = await engine.executeQuery(
    'SELECT * FROM accounts WHERE id = ?',
    ['acc-1'],
    {sessionId: SESSION_TX_SELECT},
  );

  t.equal(selectResult.success, true, 'cold transactional SELECT should succeed');
  t.same(
    observedReadModes,
    [
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE
        .OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE
        .OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE
        .OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC,
    ],
    'catalog authority refresh must use owner-local with owner-RPC fallback/confirmation',
  );
  t.same(
    selectResult.partitions,
    [ACCOUNTS_PARTITION],
    'SELECT should dispatch to the refreshed partition',
  );
  const plannedRoot =
    selectResult.distributedPlan?.tablePlans?.get(ACCOUNTS_TABLE) || null;
  t.ok(plannedRoot, 'returned distributedPlan should contain root table plan');
  t.same(
    plannedRoot?.partitions,
    [ACCOUNTS_PARTITION],
    'returned distributedPlan rootPlan should carry refreshed partitions',
  );
  t.equal(
    executorObservedPlan,
    selectResult.distributedPlan,
    'queryExecutor should receive the same refreshed distributedPlan',
  );

  const activeTx = engine.transactionCoordinator.getTransaction(
    SESSION_TX_SELECT,
  );
  t.same(
    Array.from(activeTx?.participants || []),
    [ACCOUNTS_PARTITION],
    'transactionRead.enlist should enlist the refreshed partition set',
  );

  await engine.executeQuery('COMMIT', [], {sessionId: SESSION_TX_SELECT});
});

test('Witness 2: joined-table cold-metadata SELECT refreshes cold joined ' +
  'table, replans full distributedPlan, and enlists root + joined partitions',
async (t) => {
  mockPartitionData.set(USERS_PARTITION, [
    {id: 'u-1', name: 'Ada'},
  ]);
  mockPartitionData.set(ORDERS_PARTITION_1, [
    {id: 'o-1', user_id: 'u-1', total: 42},
  ]);
  mockPartitionData.set(ORDERS_PARTITION_2, [
    {id: 'o-2', user_id: 'u-1', total: 58},
  ]);
  t.teardown(() => {
    mockPartitionData.delete(USERS_PARTITION);
    mockPartitionData.delete(ORDERS_PARTITION_1);
    mockPartitionData.delete(ORDERS_PARTITION_2);
  });

  // Root table 'users' is warm in cache; joined table 'orders' is cold.
  const cache = createMockSystemCache(
    [{
      table_name: USERS_TABLE,
      primary_key: 'id',
      partition_key: 'id',
      partition_key_type: 'TEXT',
      active_partition_version: 1,
    }],
    [{
      partition_id: USERS_PARTITION,
      table_name: USERS_TABLE,
      partition_key_start: null,
      partition_key_end: null,
      partition_key_type: 'TEXT',
      partition_version: 1,
      state: 'NORMAL',
      leader_node_id: TEST_NODE_ID,
    }],
    [buildServiceRow(USERS_PARTITION)],
  );

  const refreshedTables = [];
  const txPersistence = attachCatalogReadsToPersistenceGateway(
    createTransactionPersistenceGateway(),
    {
      tables: [{
        table_name: ORDERS_TABLE,
        primary_key: 'id',
        partition_key: 'id',
        partition_key_type: 'TEXT',
        active_partition_version: 1,
      }],
      partitions: [
        {
          partition_id: ORDERS_PARTITION_1,
          table_name: ORDERS_TABLE,
          partition_key_start: 'a',
          partition_key_end: 'm',
          partition_key_type: 'TEXT',
          partition_version: 1,
          state: 'NORMAL',
          leader_node_id: TEST_NODE_ID,
        },
        {
          partition_id: ORDERS_PARTITION_2,
          table_name: ORDERS_TABLE,
          partition_key_start: 'm',
          partition_key_end: 'z',
          partition_key_type: 'TEXT',
          partition_version: 1,
          state: 'NORMAL',
          leader_node_id: TEST_NODE_ID,
        },
      ],
      services: [
        buildServiceRow(USERS_PARTITION),
        buildServiceRow(ORDERS_PARTITION_1),
        buildServiceRow(ORDERS_PARTITION_2),
      ],
    },
    {
      onRead: ({tableName, params}) => {
        if (tableName === TABLES.TABLES && params[0]) {
          refreshedTables.push(params[0]);
        }
      },
    },
  );

  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    controlPlaneSystemTableGateway: txPersistence,
  });

  await engine.executeQuery('BEGIN', [], {sessionId: SESSION_TX_JOIN});

  const joinResult = await engine.executeQuery(
    'SELECT u.name, o.total FROM users u ' +
      'JOIN orders o ON u.id = o.user_id WHERE u.id = ?',
    ['u-1'],
    {sessionId: SESSION_TX_JOIN},
  );

  t.equal(joinResult.success, true, 'cold joined SELECT should succeed');
  t.same(
    refreshedTables,
    [ORDERS_TABLE],
    'only the cold joined table should trigger authority refresh',
  );
  const rootPlan = joinResult.distributedPlan?.tablePlans?.get('u') || null;
  const joinPlan = joinResult.distributedPlan?.tablePlans?.get('o') || null;
  t.same(
    rootPlan?.partitions,
    [USERS_PARTITION],
    'root table plan should keep users partition',
  );
  t.same(
    joinPlan?.partitions,
    [ORDERS_PARTITION_1, ORDERS_PARTITION_2],
    'joined table plan should contain refreshed orders partitions',
  );

  const activeTx = engine.transactionCoordinator.getTransaction(SESSION_TX_JOIN);
  t.same(
    Array.from(activeTx?.participants || []).sort(),
    [ORDERS_PARTITION_1, ORDERS_PARTITION_2, USERS_PARTITION].sort(),
    'transaction should enlist all root and refreshed joined partitions',
  );

  await engine.executeQuery('COMMIT', [], {sessionId: SESSION_TX_JOIN});
});

test('Witness 3: cold-metadata INSERT, UPDATE, and DELETE refresh tableInfo ' +
  'and distributedPlan for write fence version and preserve unchanged cache ' +
  'revision', async (t) => {
  const systemCache = new SystemTableCache();
  const initialServiceRow = buildServiceRow(ORDERS_PARTITION_1);
  systemCache.applySystemTableChange(
    TABLES.SERVICES,
    CACHE_CDC_OPERATIONS.UPSERT,
    initialServiceRow,
  );
  const servicesRevisionBefore = systemCache.getTableMutationVersion(
    TABLES.SERVICES,
  );

  const catalogGateway = buildAuthoritativeCatalogGateway({
    tables: [{
      table_name: ORDERS_TABLE,
      table_id: ORDERS_TABLE,
      primary_key: 'id',
      partition_key: 'id',
      partition_key_type: 'TEXT',
      active_partition_version: REFRESHED_PARTITION_VERSION,
    }],
    partitions: [{
      partition_id: ORDERS_PARTITION_1,
      table_name: ORDERS_TABLE,
      partition_key_start: null,
      partition_key_end: null,
      partition_key_type: 'TEXT',
      partition_version: REFRESHED_PARTITION_VERSION,
      state: 'NORMAL',
      leader_node_id: TEST_NODE_ID,
    }],
    services: [initialServiceRow],
  });

  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache,
    messageRouter: createMockMessageRouter(),
    controlPlaneSystemTableGateway: catalogGateway,
  });

  const observedFenceVersions = [];
  const originalExecutePlan =
    engine.distributedWriteCoordinator.executePlan.bind(
      engine.distributedWriteCoordinator,
    );
  engine.distributedWriteCoordinator.executePlan = async (
    writePlan,
    params,
    options,
  ) => {
    observedFenceVersions.push(options.expectedPartitionVersion);
    return originalExecutePlan(writePlan, params, options);
  };

  const insertResult = await engine.executeQuery(
    'INSERT INTO orders (id, total) VALUES (?, ?)',
    ['o-10', 99],
  );
  t.equal(insertResult.success, true, 'cold INSERT should succeed');
  t.same(
    insertResult.distributedPlan?.tablePlans?.get(ORDERS_TABLE)?.partitions,
    [ORDERS_PARTITION_1],
    'INSERT distributedPlan should carry refreshed partition',
  );
  t.equal(
    systemCache.getTableMutationVersion(TABLES.SERVICES),
    servicesRevisionBefore,
    'unchanged services row should not increment tableMutationRevision',
  );

  // Evict orders from cache to force cold refresh on UPDATE and DELETE as well
  systemCache.tables.get(TABLES.TABLES).clear();
  systemCache.tables.get(TABLES.PARTITIONS).clear();

  const updateResult = await engine.executeQuery(
    'UPDATE orders SET total = ? WHERE id = ?',
    [120, 'o-10'],
  );
  t.equal(updateResult.success, true, 'cold UPDATE should succeed');
  t.same(
    updateResult.distributedPlan?.tablePlans?.get(ORDERS_TABLE)?.partitions,
    [ORDERS_PARTITION_1],
    'UPDATE distributedPlan should carry refreshed partition',
  );

  systemCache.tables.get(TABLES.TABLES).clear();
  systemCache.tables.get(TABLES.PARTITIONS).clear();

  const deleteResult = await engine.executeQuery(
    'DELETE FROM orders WHERE id = ?',
    ['o-10'],
  );
  t.equal(deleteResult.success, true, 'cold DELETE should succeed');
  t.same(
    deleteResult.distributedPlan?.tablePlans?.get(ORDERS_TABLE)?.partitions,
    [ORDERS_PARTITION_1],
    'DELETE distributedPlan should carry refreshed partition',
  );

  t.same(
    observedFenceVersions,
    [
      REFRESHED_PARTITION_VERSION,
      REFRESHED_PARTITION_VERSION,
      REFRESHED_PARTITION_VERSION,
    ],
    'INSERT, UPDATE, and DELETE should all pass refreshed partition_version ' +
      'to resolveWriteFencePartitionVersion',
  );
});

test('Witness 4: authority unavailability, timeout, and cancellation surface ' +
  'typed UNAVAILABLE errors (never TABLE_NOT_FOUND), while empty authority ' +
  'establishes ABSENT (TABLE_NOT_FOUND)', async (t) => {
  // 4a: Authority read returns {success: false}
  const failingEngine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache: createMockSystemCache([], []),
    messageRouter: createMockMessageRouter(),
    controlPlaneSystemTableGateway: buildAuthoritativeCatalogGateway(
      {},
      {
        overrideRead: async () => ({
          success: false,
          error: 'control_plane_leader_unreachable',
        }),
      },
    ),
  });

  const failedSelect = await failingEngine.executeQuery(
    'SELECT * FROM missing_or_unavailable',
  );
  t.equal(failedSelect.success, false);
  t.equal(
    failedSelect.outcome,
    METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE,
  );
  t.equal(
    failedSelect.reason,
    METADATA_AUTHORITY_UNAVAILABLE_REASON.AUTHORITY_READ_FAILED,
  );
  t.equal(
    failedSelect.errorCode,
    METADATA_AUTHORITY_ERROR_CODE.ROUTING_METADATA_UNAVAILABLE,
  );
  t.not(
    failedSelect.errorCode,
    QUERY_ERROR_CODE.TABLE_NOT_FOUND,
    'failed authority read must not misreport TABLE_NOT_FOUND on SELECT',
  );

  const failedInsert = await failingEngine.executeQuery(
    'INSERT INTO missing_or_unavailable (id) VALUES (?)',
    ['1'],
  );
  t.equal(failedInsert.success, false);
  t.equal(
    failedInsert.outcome,
    METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE,
  );
  t.equal(
    failedInsert.errorCode,
    METADATA_AUTHORITY_ERROR_CODE.ROUTING_METADATA_UNAVAILABLE,
  );
  t.not(
    failedInsert.errorCode,
    QUERY_ERROR_CODE.TABLE_NOT_FOUND,
    'failed authority read must not misreport TABLE_NOT_FOUND on INSERT',
  );

  // 4b: Authority read times out against caller timeoutMs budget
  let pendingReadTimer = null;
  t.teardown(() => {
    if (pendingReadTimer !== null) {
      clearTimeout(pendingReadTimer);
    }
  });
  const timeoutEngine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache: createMockSystemCache([], []),
    messageRouter: createMockMessageRouter(),
    controlPlaneSystemTableGateway: buildAuthoritativeCatalogGateway(
      {},
      {
        overrideRead: () =>
          new Promise((resolve) => {
            pendingReadTimer = setTimeout(
              () => resolve({success: true, rows: []}),
              HANG_DELAY_MS,
            );
          }),
      },
    ),
  });

  const timedOutSelect = await timeoutEngine.executeQuery(
    'SELECT * FROM slow_metadata_table',
    [],
    {timeoutMs: SHORT_TIMEOUT_MS},
  );
  t.equal(timedOutSelect.success, false);
  t.equal(
    timedOutSelect.outcome,
    METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE,
  );
  t.equal(
    timedOutSelect.reason,
    METADATA_AUTHORITY_UNAVAILABLE_REASON.TIMEOUT,
  );
  t.equal(
    timedOutSelect.errorCode,
    METADATA_AUTHORITY_ERROR_CODE.TIMEOUT,
  );
  t.not(
    timedOutSelect.errorCode,
    QUERY_ERROR_CODE.TABLE_NOT_FOUND,
    'timed-out authority read must not misreport TABLE_NOT_FOUND',
  );

  // 4c: Caller cancellationToken cancels in-flight authority read
  const cancellationToken = new CancellationToken();
  const cancelTimer = setTimeout(() => {
    cancellationToken.cancel('user_cancelled_metadata_lookup');
  }, CANCEL_DELAY_MS);
  t.teardown(() => clearTimeout(cancelTimer));

  const cancelledUpdate = await timeoutEngine.executeQuery(
    'UPDATE slow_metadata_table SET name = ? WHERE id = ?',
    ['x', '1'],
    {cancellationToken, timeoutMs: HANG_DELAY_MS},
  );
  t.equal(cancelledUpdate.success, false);
  t.equal(
    cancelledUpdate.outcome,
    METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE,
  );
  t.equal(
    cancelledUpdate.reason,
    METADATA_AUTHORITY_UNAVAILABLE_REASON.CANCELLED,
  );
  t.equal(
    cancelledUpdate.errorCode,
    METADATA_AUTHORITY_ERROR_CODE.CANCELLED,
  );
  t.not(
    cancelledUpdate.errorCode,
    QUERY_ERROR_CODE.TABLE_NOT_FOUND,
    'cancelled authority read must not misreport TABLE_NOT_FOUND',
  );

  // 4d: Authority read succeeds with empty rows -> lawfully establishes ABSENT
  const absentEngine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache: createMockSystemCache([], []),
    messageRouter: createMockMessageRouter(),
    controlPlaneSystemTableGateway: buildAuthoritativeCatalogGateway({
      tables: [],
      partitions: [],
      services: [],
    }),
  });

  const absentSelect = await absentEngine.executeQuery(
    'SELECT * FROM genuinely_missing_table',
  );
  t.equal(absentSelect.success, false);
  t.equal(
    absentSelect.errorCode,
    QUERY_ERROR_CODE.TABLE_NOT_FOUND,
    'confirmed empty authority read should return TABLE_NOT_FOUND',
  );

  // 4e: Self-bound gateway with 0 catalog partitions in systemCache returns
  // UNAVAILABLE (ROUTING_METADATA_UNAVAILABLE), never TABLE_NOT_FOUND
  const unroutableCatalogEngine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache: createMockSystemCache([], []),
    messageRouter: createMockMessageRouter(),
  });
  const unroutableCatalogSelect = await unroutableCatalogEngine.executeQuery(
    'SELECT * FROM cold_table_with_unroutable_catalog',
  );
  t.equal(unroutableCatalogSelect.success, false);
  t.equal(
    unroutableCatalogSelect.outcome,
    METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE,
  );
  t.equal(
    unroutableCatalogSelect.errorCode,
    METADATA_AUTHORITY_ERROR_CODE.ROUTING_METADATA_UNAVAILABLE,
    'unroutable self-bound catalog authority must return UNAVAILABLE',
  );

  // 4f: Table exists in TABLES.TABLES but has 0 partitions in TABLES.PARTITIONS
  // -> returns UNAVAILABLE (ROUTING_METADATA_UNAVAILABLE), never TABLE_NOT_FOUND
  const partitionlessTableEngine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache: createMockSystemCache([], []),
    messageRouter: createMockMessageRouter(),
    controlPlaneSystemTableGateway: buildAuthoritativeCatalogGateway({
      tables: [{
        table_name: ACCOUNTS_TABLE,
        primary_key: 'id',
        partition_key: 'id',
        partition_key_type: 'TEXT',
        active_partition_version: 1,
      }],
      partitions: [],
      services: [],
    }),
  });
  const partitionlessSelect = await partitionlessTableEngine.executeQuery(
    'SELECT * FROM accounts',
  );
  t.equal(partitionlessSelect.success, false);
  t.equal(
    partitionlessSelect.outcome,
    METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE,
  );
  t.equal(
    partitionlessSelect.errorCode,
    METADATA_AUTHORITY_ERROR_CODE.ROUTING_METADATA_UNAVAILABLE,
    'table with metadata row but 0 partitions must return UNAVAILABLE',
  );

  // 4g: Stale partition rows in cache without table row in TABLES.TABLES
  // -> triggers refresh and returns ABSENT (TABLE_NOT_FOUND)
  const stalePartitionsEngine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache: createMockSystemCache(
      [],
      [{
        partition_id: ACCOUNTS_PARTITION,
        table_name: ACCOUNTS_TABLE,
        partition_key_start: null,
        partition_key_end: null,
        partition_key_type: 'TEXT',
        partition_version: 1,
        state: 'NORMAL',
        leader_node_id: TEST_NODE_ID,
      }],
      [buildServiceRow(ACCOUNTS_PARTITION)],
    ),
    messageRouter: createMockMessageRouter(),
    controlPlaneSystemTableGateway: buildAuthoritativeCatalogGateway({
      tables: [],
      partitions: [],
      services: [],
    }),
  });
  const staleWriteResult = await stalePartitionsEngine.executeQuery(
    'DELETE FROM accounts WHERE id = ?',
    ['acc-1'],
  );
  t.equal(staleWriteResult.success, false);
  t.equal(
    staleWriteResult.errorCode,
    QUERY_ERROR_CODE.TABLE_NOT_FOUND,
    'stale partition rows without authoritative table metadata must return TABLE_NOT_FOUND',
  );
});
