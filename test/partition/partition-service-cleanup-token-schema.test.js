import {test} from '../../src/test-helpers/tap.js';
import {SERVICES_SCHEMA} from
  '../../src/bootstrap/system-table-core-schema-definitions.js';
import {PartitionServiceSchemaMigrationBase} from
  '../../src/partition/partition-service-schema-migration-base.js';

test('fresh services schema includes durable cleanup and attempt identity', (t) => {
  const columns = SERVICES_SCHEMA.columns.filter(({name}) =>
    ['cleanup_token', 'create_attempt_token'].includes(name));
  t.same(columns, [
    {name: 'cleanup_token', type: 'TEXT'},
    {name: 'create_attempt_token', type: 'TEXT'},
  ]);
  t.end();
});

test('legacy services table upgrade adds nullable owner columns once', (t) => {
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
        if (sql.includes('create_attempt_token')) {
          columns.push({name: 'create_attempt_token'});
        }
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
    'ALTER TABLE services ADD COLUMN create_attempt_token TEXT',
  ], 'upgrade is idempotent');
  t.equal(logs.length, 2, 'upgrade records both schema changes');
  t.end();
});
