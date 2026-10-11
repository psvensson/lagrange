/**
 * A control-plane gateway double that persists the distributed transaction
 * coordinator's state (TX1 quest replicated-transaction-decision-and-apply,
 * seam items B/S, C, E) in a real SQLite database holding the production
 * schemas of the coordinator's tables (sql_transactions,
 * sql_transaction_participants, sql_write_operations), written with the
 * production CDC mutation SQL builder: an INSERT refuses a duplicate primary
 * key (SQLITE_CONSTRAINT_PRIMARYKEY), an UPDATE guarded on a null where-value
 * (`decision IS NULL`) changes no row once the column is set, and a read is a
 * plain SELECT of the stored rows.
 *
 * Fidelity limit: the production gateway reaches these tables through the
 * CDC integration service and their replicated system partitions; this
 * double runs the same SQL on one local database. It witnesses the
 * coordinator's write discipline (insert once, update after, decide once,
 * read back), not the system partitions' replication.
 */
import Database from 'better-sqlite3';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {buildSystemTableMutationSqlParts} from
  '../../src/cdc/cdc-system-table-mutation-sql-helpers.js';
import {
  generateCreateTableSQL,
  getSchemaByTableName,
} from '../../src/bootstrap/system-table-schemas-constants.js';

const COORDINATOR_TABLES = Object.freeze([
  TABLES.SQL_TRANSACTIONS,
  TABLES.SQL_TRANSACTION_PARTICIPANTS,
  TABLES.SQL_WRITE_OPERATIONS,
]);
const MUTATION = Object.freeze({
  INSERT: 'insert',
  UPSERT: 'upsert',
  UPDATE: 'update',
  DELETE: 'delete',
});

function schemaColumnsOf(tableName) {
  return new Set(getSchemaByTableName(tableName).columns.map((column) =>
    column.name));
}

function filteredRow(tableName, values) {
  const columns = schemaColumnsOf(tableName);
  return Object.fromEntries(Object.entries(values || {}).filter(([key, value]) =>
    columns.has(key) && value !== undefined));
}

function executeMutation(db, mutation) {
  const {operation, tableName} = mutation;
  if (operation === MUTATION.INSERT || operation === MUTATION.UPSERT) {
    const parts = buildSystemTableMutationSqlParts(CDC_OPERATION.INSERT,
      filteredRow(tableName, mutation.row));
    const verb = operation === MUTATION.UPSERT ? 'INSERT OR REPLACE' : 'INSERT';
    return db.prepare(`${verb} INTO ${tableName} (${parts.columns}) ` +
      `VALUES (${parts.placeholders})`).run(...parts.values).changes;
  }
  const where = buildSystemTableMutationSqlParts(CDC_OPERATION.DELETE,
    mutation.whereClause);
  if (operation === MUTATION.DELETE) {
    return db.prepare(`DELETE FROM ${tableName} WHERE ${where.whereStr}`)
      .run(...where.values).changes;
  }
  const set = buildSystemTableMutationSqlParts(CDC_OPERATION.UPDATE,
    filteredRow(tableName, mutation.data));
  return db.prepare(`UPDATE ${tableName} SET ${set.setClause} ` +
    `WHERE ${where.whereStr}`).run(...set.values, ...where.values).changes;
}

/**
 * Create the gateway double.
 * @param {Object} [options]
 * @param {Function} [options.beforeMutation] - Awaited before each mutation
 *   is applied ((mutation, options) => Promise); a fault hook may hold it
 *   forever to stand for a coordinator process that stops there.
 * @param {Database} [options.db] - An existing store to reopen (a restarted
 *   coordinator reads the same durable rows).
 * @return {Object} The gateway double.
 */
function createTransactionPersistenceGateway(options = {}) {
  const db = options.db ?? new Database(':memory:');
  for (const tableName of COORDINATOR_TABLES) {
    db.exec(generateCreateTableSQL(getSchemaByTableName(tableName)));
  }
  const mutations = [];
  return {
    db,
    mutations,
    supportsMutationSubmission: () => true,
    async submitMutation(mutation, mutationOptions = {}) {
      mutations.push({
        operation: mutation.operation,
        tableName: mutation.tableName,
        row: mutation.row ?? null,
        whereClause: mutation.whereClause ?? null,
        data: mutation.data ?? null,
        coalescingKey: mutationOptions.coalescingKey ?? null,
      });
      if (typeof options.beforeMutation === 'function') {
        await options.beforeMutation(mutation, mutationOptions);
      }
      try {
        const changes = executeMutation(db, mutation);
        return {success: true, affectedRows: changes, changes};
      } catch (error) {
        return {success: false, error: error.message, errorCode: error.code};
      }
    },
    async readAuthoritativeRows(_tableName, sql, params = []) {
      return {success: true, rows: db.prepare(sql).all(...params)};
    },
    rows(tableName) {
      return db.prepare(`SELECT * FROM ${tableName}`).all();
    },
    // Seed a durable row the way an earlier coordinator left it (a recovery
    // fixture's sql_transactions and participant rows).
    seed(tableName, row) {
      executeMutation(db, {operation: MUTATION.UPSERT, tableName, row});
    },
  };
}

export {createTransactionPersistenceGateway};
