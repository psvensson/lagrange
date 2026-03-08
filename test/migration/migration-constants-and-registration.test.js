import {test} from '../../src/test-helpers/tap.js';
import {
  MIGRATION_CANCELLABLE_STAGES,
  MIGRATION_STAGE_ORDER,
  MIGRATION_STATUS,
} from '../../src/migration/migration-constants.js';
import {
  CDC_NON_PROPAGATED_TABLES,
  CDC_PROPAGATED_TABLES,
} from '../../src/cache/cdc-table-policy.js';
import {TABLES} from '../../src/constants/tables.js';
import {
  COLUMN_TYPE,
  SCHEMA_MIGRATIONS_SCHEMA,
  SCHEMA_MIGRATION_PARTITIONS_SCHEMA,
  SYSTEM_TABLE_SCHEMAS,
} from '../../src/bootstrap/system-table-schemas-constants.js';

const EXPECTED_STAGE_ORDER = [
  MIGRATION_STATUS.PENDING,
  MIGRATION_STATUS.DUAL_WRITE,
  MIGRATION_STATUS.DUAL_WRITE_COMPLETE,
  MIGRATION_STATUS.BACKFILL,
  MIGRATION_STATUS.BACKFILL_COMPLETE,
  MIGRATION_STATUS.CUTOVER_PENDING,
  MIGRATION_STATUS.COMPLETED,
];

test('migration stage order contains all forward stages in order', async (t) => {
  t.same(MIGRATION_STAGE_ORDER, EXPECTED_STAGE_ORDER);
});

test('cancellable stages exclude cutover_pending and completed', async (t) => {
  t.equal(MIGRATION_CANCELLABLE_STAGES.has(MIGRATION_STATUS.CUTOVER_PENDING), false);
  t.equal(MIGRATION_CANCELLABLE_STAGES.has(MIGRATION_STATUS.COMPLETED), false);
  t.equal(MIGRATION_CANCELLABLE_STAGES.has(MIGRATION_STATUS.BACKFILL), true);
});

test('migration table CDC classification is registered', async (t) => {
  t.equal(CDC_PROPAGATED_TABLES.includes(TABLES.SCHEMA_MIGRATIONS), true);
  t.equal(
    CDC_NON_PROPAGATED_TABLES.includes(TABLES.SCHEMA_MIGRATION_PARTITIONS),
    true,
  );
});

test('schema_migrations system-table schema matches required columns', async (t) => {
  t.equal(SCHEMA_MIGRATIONS_SCHEMA.tableName, TABLES.SCHEMA_MIGRATIONS);
  const byName = Object.fromEntries(
    SCHEMA_MIGRATIONS_SCHEMA.columns.map((column) => [column.name, column]),
  );

  t.equal(byName.migration_id.primaryKey, true);
  t.equal(byName.migration_id.type, COLUMN_TYPE.TEXT);
  t.equal(byName.table_id.notNull, true);
  t.equal(byName.table_name.notNull, true);
  t.equal(byName.migration_type.notNull, true);
  t.equal(byName.source_schema.notNull, true);
  t.equal(byName.target_schema.notNull, true);
  t.equal(byName.status.notNull, true);
  t.equal(byName.current_stage.notNull, true);
  t.equal(byName.error_message.type, COLUMN_TYPE.TEXT);
  t.equal(byName.created_at.notNull, true);
  t.equal(byName.updated_at.notNull, true);
  t.equal(byName.completed_at.type, COLUMN_TYPE.INTEGER);

  const indexNames = SCHEMA_MIGRATIONS_SCHEMA.indices.map((index) => index.name);
  t.equal(indexNames.includes('idx_schema_migrations_table'), true);
  t.equal(indexNames.includes('idx_schema_migrations_status'), true);
});

test('schema_migration_partitions schema matches required columns', async (t) => {
  t.equal(
    SCHEMA_MIGRATION_PARTITIONS_SCHEMA.tableName,
    TABLES.SCHEMA_MIGRATION_PARTITIONS,
  );
  t.same(
    SCHEMA_MIGRATION_PARTITIONS_SCHEMA.primaryKey,
    ['migration_id', 'partition_id'],
  );

  const byName = Object.fromEntries(
    SCHEMA_MIGRATION_PARTITIONS_SCHEMA.columns.map((column) => [column.name, column]),
  );
  t.equal(byName.migration_id.notNull, true);
  t.equal(byName.partition_id.notNull, true);
  t.equal(byName.status.notNull, true);
  t.equal(byName.retry_count.notNull, true);
  t.equal(byName.retry_count.defaultValue, 0);
  t.equal(byName.updated_at.notNull, true);

  const index = SCHEMA_MIGRATION_PARTITIONS_SCHEMA.indices.find(
    (entry) => entry.name === 'idx_schema_migration_partitions_status',
  );
  t.ok(index);
  t.same(index.columns, ['migration_id', 'status']);
});

test('migration schemas are included in SYSTEM_TABLE_SCHEMAS', async (t) => {
  const schemaNames = SYSTEM_TABLE_SCHEMAS.map((schema) => schema.tableName);
  t.equal(schemaNames.includes(TABLES.SCHEMA_MIGRATIONS), true);
  t.equal(schemaNames.includes(TABLES.SCHEMA_MIGRATION_PARTITIONS), true);
});
