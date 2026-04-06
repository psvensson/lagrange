import {test} from '../../src/test-helpers/tap.js';
import {TableCreationService} from '../../src/query/table-creation-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

function createCreateTableAst() {
  return {
    tableName: 'users',
    columns: [
      {
        name: 'id',
        dataType: {name: 'TEXT'},
        primaryKey: true,
      },
      {
        name: 'name',
        dataType: {name: 'TEXT'},
        primaryKey: false,
      },
    ],
    primaryKey: ['id'],
    ifNotExists: false,
  };
}

function createObservableSystemCache(tableRows = [], partitionRows = []) {
  const listeners = new Set();
  return {
    getAll(tableName) {
      if (tableName === 'tables') {
        return tableRows;
      }
      if (tableName === 'partitions') {
        return partitionRows;
      }
      return [];
    },
    onCacheChange(listener) {
      listeners.add(listener);
    },
    offCacheChange(listener) {
      return listeners.delete(listener);
    },
    emit(tableName, operation, record) {
      for (const listener of listeners) {
        listener(tableName, operation, record);
      }
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

test('TableCreationService - triggers split/merge evaluation after CREATE TABLE',
  async (t) => {
    let evaluationCalls = 0;
    const service = new TableCreationService({
      systemCache: {
        find() {
          return null;
        },
      },
      cdcIntegrationService: {
        async insertSystemTableRow() {
          return {success: true};
        },
      },
      partitionSplitMergeManager: {
        async evaluateAllPartitions() {
          evaluationCalls += 1;
        },
      },
    });

    const result = await service.createTable(createCreateTableAst());

    t.equal(result.success, true);
    t.equal(evaluationCalls, 1);
  });

test('TableCreationService - continues when split/merge evaluation fails',
  async (t) => {
    const service = new TableCreationService({
      systemCache: {
        find() {
          return null;
        },
      },
      cdcIntegrationService: {
        async insertSystemTableRow() {
          return {success: true};
        },
      },
      partitionSplitMergeManager: {
        async evaluateAllPartitions() {
          throw new Error('manager unavailable');
        },
      },
    });

    const result = await service.createTable(createCreateTableAst());
    t.equal(result.success, true);
    t.equal(result.operation, 'CREATE_TABLE');
  });

test('TableCreationService - starts periodic split/merge evaluation when manager supports it',
  async (t) => {
    let startCalls = 0;
    const service = new TableCreationService({
      partitionSplitMergeManager: {
        startPeriodicEvaluation() {
          startCalls += 1;
        },
      },
    });

    t.equal(startCalls, 1);

    await service.shutdown();
  });

test('TableCreationService - stops previous periodic split/merge manager on replacement',
  async (t) => {
    let firstStopCalls = 0;
    let secondStartCalls = 0;
    const firstManager = {
      startPeriodicEvaluation() {},
      stopPeriodicEvaluation() {
        firstStopCalls += 1;
      },
    };
    const secondManager = {
      startPeriodicEvaluation() {
        secondStartCalls += 1;
      },
      stopPeriodicEvaluation() {},
    };

    const service = new TableCreationService({
      partitionSplitMergeManager: firstManager,
    });
    service.setPartitionSplitMergeManager(secondManager);

    t.equal(firstStopCalls, 1);
    t.equal(secondStartCalls, 1);

    await service.shutdown();
  });

test('TableCreationService - stops periodic split/merge evaluation on shutdown',
  async (t) => {
    let stopCalls = 0;
    const service = new TableCreationService({
      partitionSplitMergeManager: {
        startPeriodicEvaluation() {},
        stopPeriodicEvaluation() {
          stopCalls += 1;
        },
      },
    });

    await service.shutdown();
    t.equal(stopCalls, 1);
  });

test('TableCreationService - triggers split/merge evaluation on table policy cache updates',
  async (t) => {
    let evaluationCalls = 0;
    const cache = createObservableSystemCache([
      {
        table_id: 'tbl-users',
        table_policies: '{"splitStorageThreshold":16384}',
      },
    ]);
    const service = new TableCreationService({
      systemCache: cache,
      partitionSplitMergeManager: {
        async evaluateAllPartitions() {
          evaluationCalls += 1;
        },
      },
    });

    cache.emit('tables', 'UPDATE', {
      table_id: 'tbl-users',
      table_policies: '{"splitStorageThreshold":16384}',
    });
    await Promise.resolve();
    t.equal(
      evaluationCalls,
      0,
      'unchanged policy values should not trigger evaluation',
    );

    cache.emit('tables', 'UPDATE', {
      table_id: 'tbl-users',
      table_policies: '{"splitStorageThreshold":1024}',
    });
    await Promise.resolve();
    t.equal(
      evaluationCalls,
      1,
      'policy updates should trigger split/merge evaluation',
    );

    await service.shutdown();
  });

test('TableCreationService - triggers coalesced split/merge evaluation on ' +
  'partition size cache updates', async (t) => {
  const evaluationRequests = [];
  const cache = createObservableSystemCache([], [
    {
      partition_id: 'users-p1',
      size_bytes: 1024,
    },
  ]);
  const service = new TableCreationService({
    systemCache: cache,
    partitionSplitMergeManager: {
      requestEvaluation(context) {
        evaluationRequests.push(context);
      },
    },
  });

  cache.emit('partitions', 'UPDATE', {
    partition_id: 'users-p1',
    size_bytes: 1024,
  });
  await Promise.resolve();
  t.equal(
    evaluationRequests.length,
    0,
    'unchanged partition sizes should not trigger evaluation',
  );

  cache.emit('partitions', 'UPDATE', {
    partition_id: 'users-p1',
    size_bytes: 32768,
  });
  await Promise.resolve();
  t.equal(
    evaluationRequests.length,
    1,
    'partition size growth should trigger split/merge evaluation',
  );
  t.same(
    evaluationRequests[0],
    {
      reasonCode: 'partition_size_changed',
      partitionId: 'users-p1',
    },
    'partition size triggers should preserve the canonical request context',
  );

  await service.shutdown();
});

test('TableCreationService - detaches table policy cache listener on shutdown',
  async (t) => {
    const cache = createObservableSystemCache([
      {
        table_id: 'tbl-users',
        table_policies: '{}',
      },
    ]);
    const service = new TableCreationService({
      systemCache: cache,
      partitionSplitMergeManager: {
        async evaluateAllPartitions() {},
      },
    });

    t.equal(cache.listenerCount(), 1);
    await service.shutdown();
    t.equal(cache.listenerCount(), 0);
  });

test('TableCreationService - writes partition metadata with logical table_name',
  async (t) => {
    const writes = [];
    const service = new TableCreationService({
      systemCache: {
        find() {
          return null;
        },
      },
      cdcIntegrationService: {
        async insertSystemTableRow(tableName, row) {
          writes.push({tableName, row});
          return {success: true};
        },
      },
    });

    const result = await service.createTable(createCreateTableAst());
    t.equal(result.success, true);

    const partitionWrite = writes.find((entry) => entry.tableName === 'partitions');
    t.ok(partitionWrite, 'expected partitions write');
  t.equal(
      partitionWrite?.row?.table_name,
      'users',
      'partition metadata should include logical table_name',
    );
    t.equal(
      partitionWrite?.row?.partition_version,
      1,
      'partition metadata should start in version 1',
    );
    const tableWrite = writes.find((entry) => entry.tableName === 'tables');
    t.ok(tableWrite, 'expected tables write');
    t.equal(
      tableWrite?.row?.active_partition_version,
      1,
      'table metadata should start with active partition version 1',
    );
  });

test('TableCreationService - re-provisions initial partition on ' +
  'CREATE TABLE IF NOT EXISTS retries', async (t) => {
  const provisionCalls = [];
  const service = new TableCreationService({
    systemCache: {
      find(tableName, predicate) {
        if (tableName === 'tables') {
          return [{
            table_id: 'tbl-users',
            table_name: 'users',
          }].find(predicate) || null;
        }
        if (tableName === 'partitions') {
          return [{
            partition_id: 'tbl-users-p1',
            table_id: 'tbl-users',
            table_name: 'users',
            replica_count: 3,
          }].find(predicate) || null;
        }
        return null;
      },
    },
    partitionProvisioner: async (context) => {
      provisionCalls.push(context);
    },
  });

  const result = await service.createTable({
    ...createCreateTableAst(),
    ifNotExists: true,
  });

  t.equal(result.success, true);
  t.equal(result.skipped, true);
  t.equal(provisionCalls.length, 1,
    'existing table retries should reconcile initial partition provisioning');
  t.equal(provisionCalls[0]?.tableId, 'tbl-users');
  t.equal(provisionCalls[0]?.partitionId, 'tbl-users-p1');
  t.equal(provisionCalls[0]?.replicaCount, 3);
});

test('TableCreationService - uses authoritative metadata reads to avoid ' +
  'duplicate CREATE TABLE IF NOT EXISTS under cache lag', async (t) => {
  const provisionCalls = [];
  let readCount = 0;
  const service = new TableCreationService({
    systemCache: {
      find() {
        return null;
      },
    },
    controlPlaneSystemTableGateway: {
      async readRows(tableName) {
        readCount += 1;
        if (tableName === 'tables') {
          return {
            success: true,
            rows: [{
              table_id: 'tbl-users',
              table_name: 'users',
            }],
          };
        }
        if (tableName === 'partitions') {
          return {
            success: true,
            rows: [{
              partition_id: 'tbl-users-p1',
              table_id: 'tbl-users',
              table_name: 'users',
              replica_count: 3,
            }],
          };
        }
        return {success: true, rows: []};
      },
      async submitMutation() {
        throw new Error('submitMutation should not be called when table exists');
      },
    },
    partitionProvisioner: async (context) => {
      provisionCalls.push(context);
    },
  });

  const result = await service.createTable({
    ...createCreateTableAst(),
    ifNotExists: true,
  });

  t.equal(result.success, true);
  t.equal(result.skipped, true);
  t.equal(readCount, 2,
    'authoritative table and partition reads should repair cache lag');
  t.equal(provisionCalls.length, 1,
    'authoritative retries should still reconcile initial partition provisioning');
  t.equal(provisionCalls[0]?.tableId, 'tbl-users');
  t.equal(provisionCalls[0]?.partitionId, 'tbl-users-p1');
});

test('TableCreationService - rejects duplicate CREATE TABLE when ' +
  'authoritative metadata already exists', async (t) => {
  const service = new TableCreationService({
    systemCache: {
      find() {
        return null;
      },
    },
    controlPlaneSystemTableGateway: {
      async readRows(tableName) {
        if (tableName === 'tables') {
          return {
            success: true,
            rows: [{
              table_id: 'tbl-users',
              table_name: 'users',
            }],
          };
        }
        return {success: true, rows: []};
      },
      async submitMutation() {
        throw new Error('submitMutation should not be called when table exists');
      },
    },
  });

  await t.rejects(
    service.createTable(createCreateTableAst()),
    /already exists/i,
    'authoritative duplicate detection should preserve CREATE TABLE semantics',
  );
});

test('TableCreationService - provisions initial partition when callback is configured',
  async (t) => {
    let provisionContext = null;
    const service = new TableCreationService({
      systemCache: {
        find() {
          return null;
        },
      },
      cdcIntegrationService: {
        async insertSystemTableRow() {
          return {success: true};
        },
      },
      partitionProvisioner: async (context) => {
        provisionContext = context;
      },
    });

    const result = await service.createTable(createCreateTableAst());
    t.equal(result.success, true);
    t.ok(provisionContext, 'partition provisioner should receive context');
  t.equal(provisionContext?.tableName, 'users', 'provisioner gets table name');
  t.equal(provisionContext?.replicaCount, 3, 'provisioner gets replica count');
  t.ok(
    String(provisionContext?.partitionId || '').startsWith('tbl-'),
    'provisioner gets generated partition ID',
  );
  t.equal(
    provisionContext?.tableMetadata?.table_name,
    'users',
    'provisioner gets the canonical table metadata snapshot',
  );
  t.equal(
    provisionContext?.partitionMetadata?.partition_id,
    provisionContext?.partitionId,
    'provisioner gets the canonical partition metadata snapshot',
  );
  });

test('TableCreationService - provisions CREATE TABLE partitions with a ' +
  'quorum-sized minimum routable cohort', async (t) => {
  let provisionContext = null;
  const service = new TableCreationService({
    systemCache: {
      find() {
        return null;
      },
    },
    cdcIntegrationService: {
      async insertSystemTableRow() {
        return {success: true};
      },
    },
    calculateQuorumReplicaCount(replicaCount) {
      return Math.floor(replicaCount / 2) + 1;
    },
    partitionProvisioner: async (context) => {
      provisionContext = context;
    },
  });

  const result = await service.createTable(createCreateTableAst());

  t.equal(result.success, true);
  t.equal(
    provisionContext?.minimumRoutableReplicaCount,
    2,
    'CREATE TABLE should require only a quorum-sized routable cohort before returning',
  );
});

test('TableCreationService - surfaces initial partition provisioning failures',
  async (t) => {
    const service = new TableCreationService({
      systemCache: {
        find() {
          return null;
        },
      },
      cdcIntegrationService: {
        async insertSystemTableRow() {
          return {success: true};
        },
      },
      partitionProvisioner: async () => {
        throw new Error('provision failed');
      },
    });

    await t.rejects(
      service.createTable(createCreateTableAst()),
      /provision failed/,
      'create table should fail when partition provisioning fails',
    );
  });
