// Partition state-table bootstrap: schema-driven CREATE TABLE and index
// creation, extracted verbatim from partition-service-raft-init-base.js (S4
// file-size relief). The service owns the open database handle and schema;
// this module owns only the DDL.

import {isDeepStrictEqual} from 'node:util';
import {BOOTSTRAP_MEMBERSHIP_SOURCE} from '../raft/raft-committed-membership-constants.js';
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  generateCreateIndexSQL,
} from '../bootstrap/system-table-schema-sql.js';
import {
  getSchemaByTableName,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  renderTableDefinitionSql,
} from '../query/sql-table-definition.js';

const {
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
      table.sql !== renderTableDefinitionSql(schema.tableName, schema)) {
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

export const NODES_SCHEMA_UNSUPPORTED = 'NODES_SCHEMA_UNSUPPORTED';

function refuseNodesSchema(source) {
  throw Object.assign(new Error(`${NODES_SCHEMA_UNSUPPORTED}: unsupported NODES schema in ${source}`), {
    code: NODES_SCHEMA_UNSUPPORTED, source,
  });
}

function openNodesTable(service) {
  const current = getSchemaByTableName(SYSTEM_TABLE_NAME.NODES);
  const declared = service.schema;
  if (!isDeepStrictEqual(declared, current)) refuseNodesSchema('catalog');

  service.db.transaction(() => {
    const existing = service.db.prepare('SELECT 1 FROM sqlite_schema WHERE name = ? COLLATE NOCASE')
      .get(current.tableName);
    if (!existing) {
      if (service.bootstrapMembership?.kind === BOOTSTRAP_MEMBERSHIP_SOURCE.DURABLE_RECORD) {
        refuseNodesSchema('sqlite');
      }
      createTableAndIndexes(service);
    }
    const observation = readPartitionServiceTableSchemaIn(service.db, current);
    if (observation.state !== PARTITION_TABLE_OBSERVATION.COMPLETE) refuseNodesSchema('sqlite');
  }).immediate();
}

function createPartitionServiceTable(service) {
  if (service.tableName === SYSTEM_TABLE_NAME.NODES) openNodesTable(service);
  else createTableAndIndexes(service);
}

function createTableAndIndexes(service) {
  if (!service.schema || !service.schema.columns) {
    return;
  }
  const sql = renderTableDefinitionSql(service.tableName, service.schema)
    .replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ');
  service.db.exec(sql);
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

export {createPartitionServiceTable, readPartitionServiceTableSchemaIn,
  PARTITION_TABLE_OBSERVATION};
