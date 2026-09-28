import {test} from '../../src/test-helpers/tap.js';
import {SERVICES_SCHEMA} from
  '../../src/bootstrap/system-table-core-schema-definitions.js';
import {PartitionServiceSchemaMigrationBase} from
  '../../src/partition/partition-service-schema-migration-base.js';

test('fresh services schema includes durable cleanup_token ownership', (t) => {
  const column = SERVICES_SCHEMA.columns.find(({name}) =>
    name === 'cleanup_token');
  t.same(column, {name: 'cleanup_token', type: 'TEXT'});
  t.end();
});

test('legacy services table upgrade adds cleanup_token exactly once', (t) => {
  const columns = [{name: 'service_id'}, {name: 'status'}];
  const statements = [];
  const logs = [];
  const owner = {
    tableName: 'services',
    partitionId: 'services-p1',
    db: {
      prepare() {
        return {all: () => columns.map((column) => ({...column}))};
      },
      exec(sql) {
        statements.push(sql);
        if (sql.includes('cleanup_token')) columns.push({name: 'cleanup_token'});
      },
    },
    logger: {info: (...args) => logs.push(args)},
  };

  PartitionServiceSchemaMigrationBase.prototype
    .ensureServicesTableColumns.call(owner);
  PartitionServiceSchemaMigrationBase.prototype
    .ensureServicesTableColumns.call(owner);

  t.same(statements, [
    'ALTER TABLE services ADD COLUMN cleanup_token TEXT',
  ], 'upgrade is idempotent');
  t.equal(logs.length, 1, 'upgrade records one schema change');
  t.end();
});
