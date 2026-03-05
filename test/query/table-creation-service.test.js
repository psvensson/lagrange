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
