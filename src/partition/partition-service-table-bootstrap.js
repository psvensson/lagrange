// Partition state-table bootstrap: schema-driven CREATE TABLE, the
// nodes-table column upgrades, and index creation, extracted verbatim from
// partition-service-raft-init-base.js (S4 file-size relief; the
// reconcileRaftPeersFromCacheForService module precedent). The service owns
// the open database handle and schema; this module owns only the DDL.

import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  generateCreateIndexSQL,
} from '../bootstrap/system-table-schema-sql.js';
import {
  getSchemaByTableName,
} from '../bootstrap/system-table-schemas-constants.js';
import {ensureSqlTransactionParticipantsTableColumns} from
  './partition-coordinator-table-columns.js';

const {
  PARTITION_SERVICE_COLUMN,
  PARTITION_SERVICE_COLUMN_SQL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_SQL_FRAGMENT,
  SYSTEM_TABLE_NAME,
} = PARTITION_SERVICE_SHARED;

const PARTITION_TABLE_OBSERVATION = Object.freeze({
  COMPLETE: 'complete', UNAVAILABLE: 'unavailable', CONTRARY: 'contrary',
});
const IDEMPOTENT_SQL = ' IF NOT EXISTS';
const SCHEMA_OBJECTS_SQL =
  'SELECT type, name, sql FROM sqlite_schema WHERE tbl_name = ? ORDER BY type, name';

// Read the original physical creator's shape, even when the table has no
// rows. This does not call its open/migration functions. Exact owned CREATE
// bytes also exclude added CHECK/FK/STRICT constraints invisible in rows.
// SQLite's schema record omits IF NOT EXISTS from these producer statements.
function readPartitionServiceTableSchemaIn(db, schema) {
  const objects = db.prepare(SCHEMA_OBJECTS_SQL).all(schema.tableName);
  const table = objects.find(({type}) => type === 'table');
  // A reserved application name occupied by a view is readable contrary
  // schema, even if evaluating that view (including table_info) would fail.
  if (objects.some((object) => object.name === schema.tableName && object !== table)) {
    return {objects, state: PARTITION_TABLE_OBSERVATION.CONTRARY};
  } else {
    return readPartitionTableDefinitionIn(db, schema, objects, table);
  }
}

function readPartitionTableDefinitionIn(db, schema, objects, table) {
  const columns = db.prepare(`PRAGMA table_info(${quoteSqliteIdentifier(schema.tableName)})`).all();
  const missingColumns = schema.columns.filter(({name}) =>
    !columns.some((column) => column.name === name)).map(({name}) => name);
  const observation = {columns, objects, missingColumns};
  const expectedIndexes = generateCreateIndexSQL(schema).map((sql) =>
    sql.replace(IDEMPOTENT_SQL, ''));
  const indexes = objects.filter(({type, sql}) => type === 'index' && sql !== null);
  // Only the SQL transaction origin owner installs a trigger. Its exact
  // contents/position are assessed by that owner in the same caller snapshot.
  const triggers = objects.filter(({type}) => type === 'trigger');
  if (!table || missingColumns.length > 0) {
    return {...observation, state: PARTITION_TABLE_OBSERVATION.UNAVAILABLE};
  } else if (columns.length !== schema.columns.length ||
      table.sql !== partitionServiceTableSql(schema.tableName, schema)) {
    return {...observation, state: PARTITION_TABLE_OBSERVATION.CONTRARY};
  } else if (indexes.some(({sql}) => !expectedIndexes.includes(sql))) {
    return {...observation, state: PARTITION_TABLE_OBSERVATION.CONTRARY};
  } else if (indexes.length !== expectedIndexes.length) {
    return {...observation, state: PARTITION_TABLE_OBSERVATION.UNAVAILABLE};
  } else if (schema.tableName !== SYSTEM_TABLE_NAME.SQL_TRANSACTIONS && triggers.length > 0) {
    return {...observation, state: PARTITION_TABLE_OBSERVATION.CONTRARY};
  } else {
    return {...observation, state: PARTITION_TABLE_OBSERVATION.COMPLETE};
  }
}

function quoteSqliteIdentifier(identifier) {
  return PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE +
    String(identifier).replaceAll(
      PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE,
      PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE.repeat(2),
    ) +
    PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE;
}

// Ensure nodes table includes connection_state column for readiness
// tracking (verbatim from the init base).
function ensureNodesTableColumns(service) {
  if (service.tableName !== SYSTEM_TABLE_NAME.NODES) {
    return;
  }
  const columns = service.db
    .prepare(`PRAGMA table_info(${service.tableName})`)
    .all();
  const hasConnectionState = columns.some(
    (col) => col.name === PARTITION_SERVICE_COLUMN.CONNECTION_STATE,
  );
  const hasLegacyWsConnectionState = columns.some(
    (col) => col.name === PARTITION_SERVICE_COLUMN.LEGACY_WS_CONNECTION_STATE,
  );
  const hasCapabilities = columns.some(
    (col) => col.name === PARTITION_SERVICE_COLUMN.CAPABILITIES,
  );
  const hasReadyLease = columns.some(
    (col) => col.name === PARTITION_SERVICE_COLUMN.READY_LEASE_EXPIRES_AT,
  );
  const hasBootIncarnation = columns.some(
    (col) => col.name === PARTITION_SERVICE_COLUMN.BOOT_INCARNATION,
  );
  if (!hasBootIncarnation) {
    service.db.exec(
      `ALTER TABLE ${service.tableName} ` +
        PARTITION_SERVICE_COLUMN_SQL.ADD_BOOT_INCARNATION,
    );
    service.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_BOOT_INCARNATION, {
      tableName: service.tableName,
      partitionId: service.partitionId,
    });
  }
  let connectionStateAdded = false;
  if (!hasConnectionState) {
    service.db.exec(
      `ALTER TABLE ${service.tableName} ` +
        PARTITION_SERVICE_COLUMN_SQL.ADD_CONNECTION_STATE,
    );
    connectionStateAdded = true;
    service.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_CONNECTION_STATE, {
      tableName: service.tableName,
      partitionId: service.partitionId,
    });
  }
  if (connectionStateAdded && hasLegacyWsConnectionState) {
    service.db.exec(
      `UPDATE ${service.tableName} ` +
        PARTITION_SERVICE_COLUMN_SQL.BACKFILL_CONNECTION_STATE_FROM_LEGACY_WS,
    );
    service.logger.info(
      PARTITION_SERVICE_LOG_MSG.MIGRATED_CONNECTION_STATE_FROM_LEGACY_WS,
      {tableName: service.tableName, partitionId: service.partitionId},
    );
  }
  if (!hasCapabilities) {
    service.db.exec(
      `ALTER TABLE ${service.tableName} ` +
        PARTITION_SERVICE_COLUMN_SQL.ADD_CAPABILITIES,
    );
    service.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_CAPABILITIES, {
      tableName: service.tableName,
      partitionId: service.partitionId,
    });
  }
  if (!hasReadyLease) {
    service.db.exec(
      `ALTER TABLE ${service.tableName} ` +
        PARTITION_SERVICE_COLUMN_SQL.ADD_READY_LEASE_EXPIRES_AT,
    );
    service.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_READY_LEASE, {
      tableName: service.tableName,
      partitionId: service.partitionId,
    });
  }
}

// Endpoint rows carry the exact owning node boot incarnation. Existing
// tables gain the column at 0 (legacy): the endpoint validity rule treats 0
// as never current, and the owning node's next endpoint publication stamps
// its real incarnation.
const LOG_ADDED_ENDPOINT_BOOT_INCARNATION =
  'Added endpoint boot_incarnation column';
const ENDPOINT_INCARNATION_TABLES = new Set([
  SYSTEM_TABLE_NAME.NODE_ENDPOINTS,
  SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS,
]);

function ensureEndpointTableColumns(service) {
  if (!ENDPOINT_INCARNATION_TABLES.has(service.tableName)) {
    return;
  }
  const hasBootIncarnation = service.db
    .prepare(`PRAGMA table_info(${service.tableName})`)
    .all()
    .some((col) => col.name === PARTITION_SERVICE_COLUMN.BOOT_INCARNATION);
  if (hasBootIncarnation) {
    return;
  }
  service.db.exec(
    `ALTER TABLE ${service.tableName} ` +
      PARTITION_SERVICE_COLUMN_SQL.ADD_BOOT_INCARNATION,
  );
  service.logger.info(LOG_ADDED_ENDPOINT_BOOT_INCARNATION,
    {tableName: service.tableName, partitionId: service.partitionId});
}

const SINGLE_QUOTED_SQL_LITERAL_PATTERN = /^'(?:[^']|'')*'$/u;
const NUMERIC_SQL_LITERAL_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)$/u;
const NULL_SQL_LITERAL_PATTERN = /^NULL$/iu;
const UNSUPPORTED_DEFAULT_CODE = 'UNSUPPORTED_SQL_FEATURE';
const UNSUPPORTED_DEFAULT_MSG =
  'Non-literal or nondeterministic column DEFAULT is not supported in partition schema';

function isLiteralPartitionDefault(defaultValue) {
  if (typeof defaultValue === 'number') {
    return Number.isFinite(defaultValue);
  }
  if (typeof defaultValue === 'boolean' || typeof defaultValue === 'bigint') {
    return true;
  }
  return typeof defaultValue === 'string' && (
    SINGLE_QUOTED_SQL_LITERAL_PATTERN.test(defaultValue) ||
    NUMERIC_SQL_LITERAL_PATTERN.test(defaultValue) ||
    NULL_SQL_LITERAL_PATTERN.test(defaultValue)
  );
}

function requireLiteralPartitionDefault(defaultValue) {
  if (isLiteralPartitionDefault(defaultValue)) {
    return defaultValue;
  }
  const error = new Error(UNSUPPORTED_DEFAULT_MSG);
  error.code = UNSUPPORTED_DEFAULT_CODE;
  throw error;
}

const SQL_FRAGMENT_UNIQUE = ' UNIQUE';
const SQL_CONSTRAINT_CHECK = 'CHECK';
const SQL_CONSTRAINT_UNIQUE = 'UNIQUE';
const SQL_CONSTRAINT_PRIMARY_KEY = 'PRIMARY_KEY';

function formatPartitionColumnSql(col, isCompositePk, hasSqlConstraints) {
  let def = `${col.name} ${col.type}`;
  if (col.primaryKey && !isCompositePk) {
    def += PARTITION_SERVICE_SQL_FRAGMENT.PRIMARY_KEY;
  }
  if (col.notNull) {
    def += PARTITION_SERVICE_SQL_FRAGMENT.NOT_NULL;
  }
  if (hasSqlConstraints && col.unique === true) {
    def += SQL_FRAGMENT_UNIQUE;
  }
  if (col.checkSql) {
    def += ` CHECK (${col.checkSql})`;
  }
  if (col.defaultValue !== void 0 && col.defaultValue !== null) {
    def += ` DEFAULT ${requireLiteralPartitionDefault(col.defaultValue)}`;
  }
  return def;
}

function formatPartitionTableConstraintSql(constraint, isCompositePk) {
  if (!constraint || typeof constraint.type !== 'string') return null;
  const cType = constraint.type.toUpperCase();
  if (cType === SQL_CONSTRAINT_CHECK) {
    return constraint.checkSql ? `CHECK (${constraint.checkSql})` : null;
  }
  const cols = constraint.columns;
  if (!Array.isArray(cols) || cols.length === 0) return null;
  const joined = cols.join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
  if (cType === SQL_CONSTRAINT_UNIQUE) return `UNIQUE (${joined})`;
  if (cType === SQL_CONSTRAINT_PRIMARY_KEY && cols.length > 1 && !isCompositePk) {
    return `PRIMARY KEY (${joined})`;
  }
  return null;
}

/**
 * Create the partition's state table from its schema, apply the system-table
 * column upgrades, and create the schema's indexes (verbatim behavior of the
 * former PartitionServiceRaftInitBase.createTable body).
 * @param {Object} service the partition service (open db, schema, logger)
 */
function partitionServiceTableSql(tableName, schema) {
  const hasSqlConstraints = Array.isArray(schema.tableConstraints);
  const isCompositePk =
    hasSqlConstraints &&
    Array.isArray(schema.primaryKey) &&
    schema.primaryKey.length > 1;
  const items = schema.columns.map((col) =>
    formatPartitionColumnSql(col, isCompositePk, hasSqlConstraints),
  );
  if (isCompositePk) {
    items.push(
      `PRIMARY KEY (${schema.primaryKey.join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE)})`,
    );
  }
  for (const constraint of schema.tableConstraints || []) {
    const clause = formatPartitionTableConstraintSql(constraint, isCompositePk);
    if (clause) {
      items.push(clause);
    }
  }
  const columnsDef = items.join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
  return `CREATE TABLE ${quoteSqliteIdentifier(tableName)} (${columnsDef})`;
}

function createPartitionServiceTable(service) {
  if (!service.schema || !service.schema.columns) {
    return;
  }
  const sql = partitionServiceTableSql(service.tableName, service.schema)
    .replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ');
  service.db.exec(sql);
  ensureNodesTableColumns(service);
  ensureEndpointTableColumns(service);
  service.ensureServicesTableColumns();
  service.ensureTablesTableColumns();
  service.ensureMessageGroupsTableColumns();
  service.ensurePartitionsTableColumns();
  service.ensureSqlTransactionsTableColumns();
  // The coordinator's retained PREPARE evidence (TX1 seam E).
  ensureSqlTransactionParticipantsTableColumns(service);
  service.ensureReplicaOperationsTableColumns();
  const indexSchema =
    service.tableName === SYSTEM_TABLE_NAME.WASM_OPERATIONS ?
      getSchemaByTableName(service.tableName) || service.schema :
      service.schema;
  for (const indexSql of generateCreateIndexSQL(indexSchema)) {
    service.db.exec(indexSql);
  }
  service.logger.debug(PARTITION_SERVICE_LOG_MSG.CREATED_TABLE, {
    tableName: service.tableName,
    partitionId: service.partitionId,
  });
}

export {createPartitionServiceTable, partitionServiceTableSql, readPartitionServiceTableSchemaIn,
  PARTITION_TABLE_OBSERVATION};
