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

const {
  PARTITION_SERVICE_COLUMN,
  PARTITION_SERVICE_COLUMN_SQL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_SQL_FRAGMENT,
  SYSTEM_TABLE_NAME,
} = PARTITION_SERVICE_SHARED;

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

/**
 * Create the partition's state table from its schema, apply the system-table
 * column upgrades, and create the schema's indexes (verbatim behavior of the
 * former PartitionServiceRaftInitBase.createTable body).
 * @param {Object} service the partition service (open db, schema, logger)
 */
function createPartitionServiceTable(service) {
  if (!service.schema || !service.schema.columns) {
    return;
  }
  const columns = service.schema.columns
    .map((col) => {
      let def = `${col.name} ${col.type}`;
      if (col.primaryKey) {
        def += PARTITION_SERVICE_SQL_FRAGMENT.PRIMARY_KEY;
      }
      if (col.notNull) {
        def += PARTITION_SERVICE_SQL_FRAGMENT.NOT_NULL;
      }
      if (col.defaultValue !== void 0) {
        def += ` DEFAULT ${col.defaultValue}`;
      }
      return def;
    })
    .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
  const sql =
    'CREATE TABLE IF NOT EXISTS ' +
    `${quoteSqliteIdentifier(service.tableName)} (${columns})`;
  service.db.exec(sql);
  ensureNodesTableColumns(service);
  service.ensureTablesTableColumns();
  service.ensureMessageGroupsTableColumns();
  service.ensurePartitionsTableColumns();
  service.ensureSqlTransactionsTableColumns();
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

export {createPartitionServiceTable};
