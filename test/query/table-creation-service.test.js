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
  });
