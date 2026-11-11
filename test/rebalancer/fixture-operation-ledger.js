// The fixture world's operation ledger and the authoritative read path that
// answers from it.
//
// A planner fixture node hosts the leader replica of replica_operations. Every
// authoritative read of that table goes through the production
// ControlPlaneSystemTableGateway and CDCIntegrationService to the local
// partition replica, which runs the caller's production SQL against the
// fixture's modelled ledger materialized in SQLite with the production schema
// at the instant of the read. Only the storage is the fixture's: the query,
// the read strategy and the caller's row counting are production's. A row the
// production schema cannot hold is refused by SQLite, never patched here.
//
// The node hosts no other system table and has no transport, so a read of any
// other table is answered by the production read path as unavailable.
import Database from 'better-sqlite3';
import {
  SYSTEM_TABLE_NAME,
  SYSTEM_TABLE_SCHEMAS,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {createControlPlaneRuntimeBundle} from
  '../../src/control-plane/control-plane-runtime-bundle.js';
import {createLocalSystemTablePartitionServices} from
  '../cdc/cdc-integration-service-test-support.js';

const LEDGER_SCHEMA = SYSTEM_TABLE_SCHEMAS.find((schema) =>
  schema.tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS);
const LEDGER_COLUMNS = Object.freeze(
  LEDGER_SCHEMA.columns.map((column) => column.name));

/**
 * One modelled ledger: durable replica_operations rows keyed by operation id,
 * in production column names.
 * @return {{commit: Function, rows: Function}}
 */
function createFixtureOperationLedger() {
  const rowsById = new Map();
  return Object.freeze({
    commit(row) {
      rowsById.set(row.operation_id, row);
      return row;
    },
    rows() {
      return [...rowsById.values()];
    },
  });
}

function materializeLedger(rows) {
  const db = new Database(':memory:');
  db.exec(generateCreateTableSQL(LEDGER_SCHEMA));
  for (const row of rows) {
    const columns = LEDGER_COLUMNS.filter((name) => row[name] !== undefined);
    db.prepare(`INSERT INTO ${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}
      (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
      .run(...columns.map((name) => row[name]));
  }
  return db;
}

function queryLedger(ledger, sql, params) {
  const db = materializeLedger(ledger.rows());
  try {
    return {success: true, rows: db.prepare(sql).all(...params)};
  } finally {
    db.close();
  }
}

/**
 * The production control-plane gateway of a fixture node whose local leader
 * replica of replica_operations is the given ledger.
 * @param {Object} options
 * @param {string} options.nodeId
 * @param {Object} options.ledger createFixtureOperationLedger() or a
 *   coordinator fixture's testReplicaOperationLedger
 * @param {Object} options.systemTableCache
 * @param {Object} options.messageRouter
 * @return {Object} ControlPlaneSystemTableGateway
 */
function createFixtureLedgerGateway({nodeId, ledger, systemTableCache, messageRouter}) {
  const cdcIntegrationService = new CDCIntegrationService({
    nodeId,
    sqlQueryEngine: null,
    partitionServicesProvider: () => createLocalSystemTablePartitionServices(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      {
        isLeader: true,
        executeQuery: async (sql, params = []) => queryLedger(ledger, sql, params),
      },
    ),
  });
  cdcIntegrationService.initialize();
  return createControlPlaneRuntimeBundle({
    nodeId,
    cdcIntegrationService,
    systemTableCache,
    messageRouter,
  }).controlPlaneSystemTableGateway;
}

export {createFixtureLedgerGateway, createFixtureOperationLedger};
