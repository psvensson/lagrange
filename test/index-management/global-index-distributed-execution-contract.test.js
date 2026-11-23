/**
 * Contract & regression tests proving Finding B consolidation:
 * - global-index-distributed-execution.js requires ONE mandatory partition execution
 *   interface (partitionExecutor.executeOnPartition).
 * - Multi-path execution bypasses (queryRouter, sqlQueryEngine.queryExecutor,
 *   partitionService.handleRemoteQuery, raw partitionDatabases) are eliminated and refused.
 * - Authoritative reads and writes express leader requirements uniformly
 *   (preferLeader=true, preferSameLatencyGroup=false, deliveryOptions.requireLeader=true).
 * - Test fixtures traverse the exact same mandatory interface via adapters.
 */

import tap from 'tap';
import Database from 'better-sqlite3';

import {IndexService} from '../../src/index-management/index-service.js';
import {GLOBAL_INDEX_ERROR_CODE} from '../../src/index-management/index-constants.js';
import {
  executePartitionReadSql,
  executePartitionWriteSql,
  hasDistributedPartitionRoute,
  provisionIndexPartitionsWithRuntime,
  reconcileDistributedIndexDatasetSchema,
} from '../../src/index-management/global-index-distributed-execution.js';
import {
  buildProductionCoordinatorOptions,
} from '../../src/index-management/global-index-production-wiring.js';
import {
  LEADER_READ_REQUEST_FIELD,
  LEADER_REQUIRED_READ,
} from '../../src/control-plane/control-plane-owner-fact-read-contract.js';
import {
  createPartitionServiceExecutorAdapter,
  createSqlitePartitionExecutorAdapter,
} from './global-index-partition-executor-test-helper.js';

const {test} = tap;

function createSpySystemCache() {
  return {
    getAll: () => [],
    get: () => null,
    filter: () => [],
  };
}

function createDisallowedBypassSpies(sqliteDb) {
  const counts = {
    queryRouterRead: 0,
    queryRouterWrite: 0,
    engineExecutor: 0,
    partitionServiceRemote: 0,
  };

  const queryRouter = {
    executeReadOnPartition: async () => {
      counts.queryRouterRead += 1;
      return [{via: 'queryRouter'}];
    },
    executeWriteOnPartition: async () => {
      counts.queryRouterWrite += 1;
      return {success: true};
    },
  };

  const sqlQueryEngine = {
    queryExecutor: {
      executeOnPartition: async () => {
        counts.engineExecutor += 1;
        return {success: true, rows: [{via: 'engineExecutor'}]};
      },
    },
    getTableInfo: () => ({name: '__gidx_users_idx_email', partitionVersion: 7}),
    resolveWriteFencePartitionVersion: (info) => info?.partitionVersion ?? null,
  };

  const partitionService = {
    partitionId: 'users_p0',
    role: 'leader',
    db: sqliteDb,
    handleRemoteQuery: async () => {
      counts.partitionServiceRemote += 1;
      return {success: true, rows: [{via: 'partitionService'}]};
    },
  };

  return {
    counts,
    queryRouter,
    sqlQueryEngine,
    partitionService,
    partitionDatabases: new Map([['users_p0', sqliteDb]]),
  };
}

test('hasDistributedPartitionRoute requires partitionExecutor and refuses bypasses', async (t) => {
  const db = new Database(':memory:');
  t.teardown(() => db.close());

  const spies = createDisallowedBypassSpies(db);
  const serviceWithoutExecutor = new IndexService({
    systemTableCache: createSpySystemCache(),
    queryRouter: spies.queryRouter,
    sqlQueryEngine: spies.sqlQueryEngine,
    partitionService: spies.partitionService,
    partitionDatabases: spies.partitionDatabases,
  });

  t.equal(
    hasDistributedPartitionRoute(serviceWithoutExecutor, 'users_p0'),
    false,
    'hasDistributedPartitionRoute returns false when partitionExecutor is absent',
  );

  const executor = createSqlitePartitionExecutorAdapter(new Map([['users_p0', db]]));
  const serviceWithExecutor = new IndexService({
    systemTableCache: createSpySystemCache(),
    partitionExecutor: executor,
  });

  t.equal(
    hasDistributedPartitionRoute(serviceWithExecutor, 'users_p0'),
    true,
    'hasDistributedPartitionRoute returns true when partitionExecutor is wired',
  );

  const bareService = new IndexService({systemTableCache: createSpySystemCache()});
  bareService.setPartitionExecutor(executor);
  t.equal(
    hasDistributedPartitionRoute(bareService, 'users_p0'),
    true,
    'setPartitionExecutor attaches the canonical executor',
  );
});

test('Absent partitionExecutor fails closed with DEPENDENCY_UNAVAILABLE and zero bypasses', async (t) => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE __gidx_users_idx_email (email TEXT)');
  db.exec('INSERT INTO __gidx_users_idx_email (email) VALUES (\'a@x.dev\')');
  t.teardown(() => db.close());

  const spies = createDisallowedBypassSpies(db);
  const service = new IndexService({
    systemTableCache: createSpySystemCache(),
    queryRouter: spies.queryRouter,
    sqlQueryEngine: spies.sqlQueryEngine,
    partitionService: spies.partitionService,
    partitionDatabases: spies.partitionDatabases,
  });

  await t.rejects(
    executePartitionReadSql(service, 'users_p0', 'SELECT email FROM __gidx_users_idx_email', [], {
      tableName: '__gidx_users_idx_email',
    }),
    {code: GLOBAL_INDEX_ERROR_CODE.DEPENDENCY_UNAVAILABLE},
    'executePartitionReadSql fails closed without partitionExecutor',
  );

  await t.rejects(
    executePartitionWriteSql(
      service,
      'users_p0',
      'INSERT INTO __gidx_users_idx_email (email) VALUES (?)',
      ['b@x.dev'],
      '__gidx_users_idx_email',
    ),
    {code: GLOBAL_INDEX_ERROR_CODE.DEPENDENCY_UNAVAILABLE},
    'executePartitionWriteSql fails closed without partitionExecutor',
  );

  await t.rejects(
    reconcileDistributedIndexDatasetSchema(
      service,
      {partitionId: 'users_p0', tableName: 'users', indexName: 'idx_email'},
      () => ({}),
      '__gidx_users_idx_email',
      {columns: ['email']},
      () => {},
    ),
    {code: GLOBAL_INDEX_ERROR_CODE.DEPENDENCY_UNAVAILABLE},
    'reconcileDistributedIndexDatasetSchema fails closed instead of silent reconcile skip',
  );

  await t.rejects(
    provisionIndexPartitionsWithRuntime(
      service,
      () => ({}),
      {partitions: new Map()},
      {
        record: {index_name: 'idx_email', table_name: 'users', column_name: 'email'},
        def: {name: 'idx_email', tableName: 'users', columns: ['email'], isGlobal: true},
        basePartitions: [{partitionId: 'users_p0'}],
        schemaInfo: {columnDefinitions: ['email TEXT']},
        datasetName: '__gidx_users_idx_email',
        datasetSchema: {columns: ['email TEXT']},
        partitionManager: null,
        partitionDirectory: null,
      },
    ),
    {code: GLOBAL_INDEX_ERROR_CODE.DEPENDENCY_UNAVAILABLE},
    'provisionIndexPartitionsWithRuntime fails closed without partitionExecutor',
  );

  const wiredOptions = buildProductionCoordinatorOptions(service);
  t.equal(
    wiredOptions.resolvePartitionDatabase,
    undefined,
    'production wiring does not expose resolvePartitionDatabase raw SQLite bypass',
  );

  await t.rejects(
    wiredOptions.onDropIndexDataset({
      tableName: 'users',
      indexName: 'idx_email',
      partitionId: 'users_p0',
    }),
    {code: GLOBAL_INDEX_ERROR_CODE.DEPENDENCY_UNAVAILABLE},
    'onDropIndexDataset fails closed instead of silent skip when executor missing',
  );

  t.same(
    spies.counts,
    {
      queryRouterRead: 0,
      queryRouterWrite: 0,
      engineExecutor: 0,
      partitionServiceRemote: 0,
    },
    'zero disallowed execution paths are invoked when partitionExecutor is absent',
  );
});

test('Authoritative reads and writes express uniform leader requirements on partitionExecutor', async (t) => {
  const db = new Database(':memory:');
  t.teardown(() => db.close());
  const spies = createDisallowedBypassSpies(db);

  const recorded = [];
  const partitionExecutor = {
    executeOnPartition: async (...args) => {
      recorded.push(args);
      const forRead = args[3];
      return forRead ? {success: true, rows: [{id: 42}]} : {success: true, changes: 1};
    },
  };

  const service = new IndexService({
    systemTableCache: createSpySystemCache(),
    queryRouter: spies.queryRouter,
    sqlQueryEngine: spies.sqlQueryEngine,
    partitionService: spies.partitionService,
    partitionDatabases: spies.partitionDatabases,
    partitionExecutor,
  });

  const rows = await executePartitionReadSql(
    service,
    'users_p0',
    'SELECT id FROM __gidx_users_idx_email WHERE email = ?',
    ['nora@x.dev'],
    {tableName: '__gidx_users_idx_email'},
  );
  t.same(rows, [{id: 42}], 'read returns rows from canonical partitionExecutor');

  const writeRes = await executePartitionWriteSql(
    service,
    'users_p0',
    'INSERT INTO __gidx_users_idx_email (email) VALUES (?)',
    ['nora@x.dev'],
    '__gidx_users_idx_email',
  );
  t.equal(writeRes.success, true, 'write returns canonical execution result');

  t.equal(recorded.length, 2, 'exactly one read and one write dispatched via partitionExecutor');
  t.same(
    recorded[0],
    [
      'users_p0',
      'SELECT id FROM __gidx_users_idx_email WHERE email = ?',
      ['nora@x.dev'],
      true,
      true,
      false,
      {requireLeader: true, tableName: '__gidx_users_idx_email'},
    ],
    'authoritative read enforces preferLeader=true, preferSameLatencyGroup=false, requireLeader=true',
  );
  t.same(
    recorded[1],
    [
      'users_p0',
      'INSERT INTO __gidx_users_idx_email (email) VALUES (?)',
      ['nora@x.dev'],
      false,
      true,
      false,
      {
        requireLeader: true,
        tableName: '__gidx_users_idx_email',
        expectedPartitionVersion: 7,
      },
    ],
    'authoritative write enforces identical preferLeader=true, preferSameLatencyGroup=false, ' +
      'requireLeader=true, plus expectedPartitionVersion',
  );
  t.same(
    spies.counts,
    {queryRouterRead: 0, queryRouterWrite: 0, engineExecutor: 0, partitionServiceRemote: 0},
    'none of the bypassed paths are called when partitionExecutor is active',
  );

  // Refusal propagation preserves typed failure details
  const failingService = new IndexService({
    systemTableCache: createSpySystemCache(),
    partitionExecutor: {
      executeOnPartition: async () => ({
        success: false,
        failureCode: 'NOT_LEADER',
        refusalLayer: 'RAFT_EXECUTION',
        error: 'node is follower',
      }),
    },
  });
  await t.rejects(
    executePartitionReadSql(failingService, 'users_p0', 'SELECT 1', []),
    {code: GLOBAL_INDEX_ERROR_CODE.PARTICIPANT_UNAVAILABLE, failureCode: 'NOT_LEADER'},
    'read failure propagates canonical participant failure metadata',
  );
  await t.rejects(
    executePartitionWriteSql(failingService, 'users_p0', 'DELETE FROM t', [], 't'),
    {code: GLOBAL_INDEX_ERROR_CODE.PARTICIPANT_UNAVAILABLE, failureCode: 'NOT_LEADER'},
    'write failure propagates canonical participant failure metadata',
  );
});

test('SQLite and PartitionService adapters exercise identical mandatory contract and leader refusal', async (t) => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE __gidx_users_idx_city (city TEXT, __base_partition_id TEXT)');
  t.teardown(() => db.close());

  let isLeader = true;
  const sqliteAdapter = createSqlitePartitionExecutorAdapter(new Map([['users_p0', db]]), {
    isLeader: () => isLeader,
  });
  const sqliteService = new IndexService({
    systemTableCache: createSpySystemCache(),
    partitionExecutor: sqliteAdapter,
  });

  await executePartitionWriteSql(
    sqliteService,
    'users_p0',
    'INSERT INTO __gidx_users_idx_city (city, __base_partition_id) VALUES (?, ?)',
    ['Uppsala', 'users_p0'],
    '__gidx_users_idx_city',
  );
  const queried = await executePartitionReadSql(
    sqliteService,
    'users_p0',
    'SELECT city, __base_partition_id FROM __gidx_users_idx_city WHERE city = ?',
    ['Uppsala'],
    {tableName: '__gidx_users_idx_city'},
  );
  t.same(queried, [{city: 'Uppsala', __base_partition_id: 'users_p0'}]);
  t.equal(sqliteAdapter.calls.length, 2);
  t.equal(sqliteAdapter.calls[0].deliveryOptions.requireLeader, true);
  t.equal(sqliteAdapter.calls[1].deliveryOptions.requireLeader, true);

  isLeader = false;
  await t.rejects(
    executePartitionReadSql(sqliteService, 'users_p0', 'SELECT 1', []),
    {code: GLOBAL_INDEX_ERROR_CODE.PARTICIPANT_UNAVAILABLE, failureCode: 'NOT_LEADER'},
    'SQLite test adapter enforces leader check on authoritative reads',
  );
  await t.rejects(
    executePartitionWriteSql(sqliteService, 'users_p0', 'DELETE FROM __gidx_users_idx_city', []),
    {code: GLOBAL_INDEX_ERROR_CODE.PARTICIPANT_UNAVAILABLE, failureCode: 'NOT_LEADER'},
    'SQLite test adapter enforces leader check on authoritative writes',
  );

  // PartitionService adapter routes to leader and enforces LEADER_REQUIRED_READ on reads
  const receivedRequests = [];
  const followerService = {
    partitionId: 'users_p1',
    role: 'follower',
    handleRemoteQuery: async () => {
      throw new Error('Follower must never receive leader-required GSI query');
    },
  };
  const leaderService = {
    partitionId: 'users_p1',
    role: 'leader',
    handleRemoteQuery: async (req) => {
      receivedRequests.push(req);
      return req.readonly ?
        {success: true, rows: [{email: 'leader@x.dev'}]} :
        {success: true, changes: 1};
    },
  };
  const psAdapter = createPartitionServiceExecutorAdapter([followerService, leaderService]);
  const psService = new IndexService({
    systemTableCache: createSpySystemCache(),
    partitionExecutor: psAdapter,
  });

  const psRows = await executePartitionReadSql(
    psService,
    'users_p1',
    'SELECT email FROM idx_email',
    [],
    {tableName: 'idx_email'},
  );
  t.same(psRows, [{email: 'leader@x.dev'}]);
  await executePartitionWriteSql(
    psService,
    'users_p1',
    'INSERT INTO idx_email VALUES (?)',
    ['leader@x.dev'],
    'idx_email',
  );

  t.equal(receivedRequests.length, 2);
  t.equal(receivedRequests[0][LEADER_READ_REQUEST_FIELD], LEADER_REQUIRED_READ);
  t.equal(receivedRequests[0].readonly, true);
  t.equal(receivedRequests[1].readonly, false);

  // Demote leader -> must fail closed with NOT_LEADER
  leaderService.role = 'follower';
  await t.rejects(
    executePartitionReadSql(psService, 'users_p1', 'SELECT email FROM idx_email', []),
    {code: GLOBAL_INDEX_ERROR_CODE.PARTICIPANT_UNAVAILABLE, failureCode: 'NOT_LEADER'},
    'PartitionService adapter fails closed when no leader exists',
  );
});
