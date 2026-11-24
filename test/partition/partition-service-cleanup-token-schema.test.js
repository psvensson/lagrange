import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {SERVICES_SCHEMA} from
  '../../src/bootstrap/system-table-core-schema-definitions.js';
import {createPartitionServiceTable} from
  '../../src/partition/partition-service-table-bootstrap.js';

test('fresh services schema includes durable cleanup and attempt identity', (t) => {
  const columns = SERVICES_SCHEMA.columns.filter(({name}) =>
    ['cleanup_token', 'create_attempt_token'].includes(name));
  t.same(columns, [
    {name: 'cleanup_token', type: 'TEXT'},
    {name: 'create_attempt_token', type: 'TEXT'},
  ]);
  t.end();
});

test('createPartitionServiceTable creates services columns from canonical schema without ALTER TABLE', (t) => {
  const db = new Database(':memory:');
  t.teardown(() => db.close());
  const statements = [];
  const originalExec = db.exec.bind(db);
  db.exec = (sql) => {
    statements.push(sql);
    return originalExec(sql);
  };
  createPartitionServiceTable({
    db,
    tableName: SERVICES_SCHEMA.tableName,
    schema: SERVICES_SCHEMA,
    partitionId: 'services-p1',
    logger: {debug() {}},
  });
  const columnNames = db.prepare('PRAGMA table_info(services)').all()
    .map((column) => column.name);
  t.ok(columnNames.includes('cleanup_token'));
  t.ok(columnNames.includes('create_attempt_token'));
  t.equal(
    statements.some((sql) => sql.toUpperCase().includes('ALTER TABLE')),
    false,
    'bootstrap creates canonical schema directly without internal ALTER TABLE migrations',
  );
  t.end();
});
