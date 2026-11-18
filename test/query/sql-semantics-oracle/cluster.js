/**
 * The production composition the oracle measures (§4.1, R19): SQLQueryEngine
 * (SQLParser, PartitionResolver routing, DistributedQueryPlanner and the
 * fan-out plan kinds, QueryExecutor and its merge) over real PartitionService
 * replicas. Each replica creates its own table (and its secondary indexes)
 * from the catalog schema and answers through its registered transport
 * handler (handleTransportMessage -> handleRemoteQuery -> statement admission
 * -> executeAdmittedReadQuery). A request crosses the router's outbound
 * encoder (encodeDeliveryMessage) and the inbound JSON.parse; an answer
 * crosses the path answers actually take, sendRaw's JSON.stringify of the
 * SERVICE_RESPONSE frame and JSON.parse (typed-wire.js).
 *
 * Next to it sit three references, each one SQLite database holding the union
 * of the rows, read with safeIntegers(true). None reads layout from the system
 * under test: canonical positions come from the logical key order of the
 * layout this module defines (schema.js layoutRanges).
 *   indexed    the rendered DDL the partitions run plus the same secondary
 *              indexes: the reference for order-independent statements;
 *   canonical  the rendered DDL without secondary indexes, each row stored at
 *              rowid = its canonical position (partition key-range ordinal,
 *              partition key): the reference for order-dependent statements
 *              (overflow, compensated REAL sums, MIN/MAX representatives,
 *              GROUP_CONCAT order, bare columns);
 *   declared   the DDL exactly as the user declared it, laid out like
 *              canonical, independent of the catalog (family F11).
 *
 * Fixture rows are written straight into each replica's database, below Raft,
 * in key order: the subject is the read and merge path, and the references
 * receive the same rows. Nothing here retries.
 */

import Database from 'better-sqlite3';

import {ConfigurationManager} from '../../../src/config/configuration-manager.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {PartitionService} from '../../../src/partition/partition-service.js';
import {SQLQueryEngine} from '../../../src/query/sql-query-engine.js';
import {buildDeliveryEnvelope} from '../../../src/transport/transport-semantic-outcome.js';
import {withFoundingStamp} from '../../partition/partition-founding-stamp.js';
import {createMockSystemCache} from '../sql-query-engine-test-support.js';
import {createTransactionPersistenceGateway} from
  '../../test-helpers/transaction-persistence-gateway.js';
import {createCommittedServeEligibilityOwner} from
  '../../control-plane/serve-eligibility-test-support.js';
import {
  KEY_KIND,
  ORACLE_SCHEMA_DDL,
  TABLE_NAMES,
  declareOracleTables,
  layoutRanges,
} from './schema.js';
import {CURRENT_WIRE, deliverToPartition, sqliteCell} from './typed-wire.js';

const NODE_ID = 'oracle-node';
const PRODUCT_RETRY_PAUSE_MS = 1;
const SQLITE_CODE = /^SQLITE_[A-Z_]+$/u;
const ERROR_SOURCE = Object.freeze({SQLITE: 'sqlite', LAGRANGE: 'lagrange'});
const REFERENCE = Object.freeze({INDEXED: 'indexed', CANONICAL: 'canonical',
  DECLARED: 'declared'});

function prepareEnvironment() {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) config.initialize({node: {id: NODE_ID}});
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) logging.initialize({level: 'fatal'});
}

function tableRowOf(table) {
  return {
    table_id: table.tableName,
    table_name: table.tableName,
    primaryKey: table.primaryKey,
    partition_key: table.primaryKey,
    partition_key_type: table.keyKind,
    schema: table.schema,
  };
}

// Logical key order of the layout the test defines: integers by value, the
// 'k001'..'k100' text keys by their ASCII order.
function keyOrder(table) {
  const keyOf = (row) => (table.keyKind === KEY_KIND.TEXT ?
    String(row[table.primaryKey]) : BigInt(row[table.primaryKey]));
  return (left, right) => {
    const [a, b] = [keyOf(left), keyOf(right)];
    return a < b ? -1 : a > b ? 1 : 0;
  };
}

function keyInRange(table, row, range) {
  const key = table.keyKind === KEY_KIND.TEXT ?
    String(row[table.primaryKey]) : Number(row[table.primaryKey]);
  return (range.start === null || key >= range.start) &&
    (range.end === null || key < range.end);
}

async function openReplica(table, partitionId, tableRows) {
  const replicaId = `${partitionId}-r1`;
  const service = new PartitionService(withFoundingStamp({
    tableId: table.tableName, tableName: table.tableName, partitionId, replicaId,
    replicaIds: [replicaId], nodeId: NODE_ID, schema: table.schema,
    systemTableCache: {
      get: (type, key) => tableRows.find((row) => row.table_name === key) || null,
      getAll: () => tableRows,
    },
  }));
  await service.initialize();
  return {partitionId, replicaId, service,
    address: `${NODE_ID}/partition/${replicaId}`};
}

function errorClassOfDistributed(result) {
  const codes = [];
  const visit = (value, depth) => {
    if (depth > 6 || value === null || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'string' && /code$/iu.test(key) && SQLITE_CODE.test(entry)) {
        codes.push(entry);
      } else {
        visit(entry, depth + 1);
      }
    }
  };
  visit(result, 0);
  return codes.length > 0 ?
    {source: ERROR_SOURCE.SQLITE, code: codes[0]} :
    {source: ERROR_SOURCE.LAGRANGE, code: String(result?.errorCode ?? 'UNTYPED')};
}

function errorDetail(result) {
  return JSON.stringify({error: result?.error, errorCode: result?.errorCode,
    partitionErrors: result?.partitionErrors}).slice(0, 600);
}

/**
 * Run a statement on one reference database.
 * @param {Database} database
 * @param {string} sql
 * @param {Array} params
 * @return {Object} {kind:'rows', columns, rows} or {kind:'error', ...}
 */
function runOracle(database, sql, params) {
  try {
    const statement = database.prepare(sql);
    if (!statement.reader) {
      return {kind: 'error', error: {source: ERROR_SOURCE.SQLITE, code: 'NOT_A_READ'},
        detail: 'statement returns no rows'};
    }
    statement.raw(true).safeIntegers(true);
    const columns = statement.columns().map((column) => column.name);
    const rows = statement.all(...params).map((row) => row.map(sqliteCell));
    return {kind: 'rows', columns, rows};
  } catch (error) {
    return {kind: 'error', error: {source: ERROR_SOURCE.SQLITE, code: String(error.code)},
      detail: error.message};
  }
}

// The distributed result as the client receives it: its own column names (in
// the order of the first row's keys) and its cells. A result with no rows
// carries no column metadata, so its names are null (unobservable).
function observeDistributed(result) {
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : null;
  return {
    kind: 'rows',
    columns,
    rows: rows.map((row) => (columns || []).map((name) => CURRENT_WIRE.observeCell(row[name]))),
  };
}

function insertStatement(table, columns, withRowid) {
  const names = withRowid ? ['rowid', ...columns] : columns;
  return `INSERT INTO ${table.tableName} (${names.join(', ')}) ` +
    `VALUES (${names.map(() => '?').join(', ')})`;
}

class OracleCluster {
  constructor({partitionCount, remote, tables, replicasByTable, references}) {
    this.partitionCount = partitionCount;
    this.remote = remote;
    this.tables = tables;
    this.replicasByTable = replicasByTable;
    this.references = references;
    this.delivered = [];
    this.answerTransform = null;
    this.replicaByAddress = new Map();
    for (const replicas of Object.values(replicasByTable)) {
      for (const replica of replicas) this.replicaByAddress.set(replica.address, replica);
    }
    this.engine = this.buildEngine();
  }

  /** @return {Database} The indexed reference (order-independent statements). */
  get oracle() {
    return this.references[REFERENCE.INDEXED];
  }

  buildEngine() {
    const tableRows = TABLE_NAMES.map((name) => tableRowOf(this.tables[name]));
    const partitions = [];
    const services = [];
    for (const name of TABLE_NAMES) {
      for (const replica of this.replicasByTable[name]) {
        partitions.push({
          partition_id: replica.partitionId, table_id: name, table_name: name,
          partition_key_start: replica.range.start, partition_key_end: replica.range.end,
          partition_key_type: this.tables[name].keyKind, leader_node_id: NODE_ID,
        });
        services.push({
          service_id: replica.replicaId, service_type: 'partition',
          partition_id: replica.partitionId, node_id: NODE_ID, raft_role: 'leader',
          address: replica.address, status: 'active',
        });
      }
    }
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      controlPlaneSystemTableGateway: createTransactionPersistenceGateway(),
      systemCache: createMockSystemCache(tableRows, partitions, services),
      messageRouter: {deliver: (address, message) => this.deliver(address, message)},
    });
    // The executor re-sends a read whose partition answered with an error
    // (READ_RETRY_ATTEMPTS, leaderRetryDelayMs apart). The oracle compares the
    // final answer, not the retry cadence, so the pause between attempts is
    // shortened the way settled-replay-sql-surface.test.js does; the attempt
    // count and every answer are the product's.
    engine.queryExecutor.leaderRetryDelayMs = PRODUCT_RETRY_PAUSE_MS;
    return engine;
  }

  async deliver(address, message) {
    const replica = this.replicaByAddress.get(address);
    if (!replica) throw new Error(`oracle cluster: no replica at ${address}`);
    this.delivered.push({replicaId: replica.replicaId, type: message?.type,
      sql: message?.sql, params: message?.params});
    const answer = await deliverToPartition({service: replica.service,
      sourceNodeId: NODE_ID, targetAddress: address, payload: message,
      remote: this.remote});
    const transformed = this.answerTransform && answer?.success === true &&
      Array.isArray(answer.rows) && answer.rows.length > 0 ?
      this.answerTransform(answer) : answer;
    return buildDeliveryEnvelope({acknowledged: true}, transformed);
  }

  /**
   * Replace every row of every table, in the replicas and in the references,
   * in canonical layout: key order within the layout's key ranges. The
   * canonical and declared references store each row at rowid = its
   * canonical position (for an INTEGER PRIMARY KEY the key is the rowid).
   * @param {Object} rowsByTable - tableName -> [{column: value}]
   */
  load(rowsByTable) {
    for (const name of TABLE_NAMES) {
      const table = this.tables[name];
      const rows = [...(rowsByTable[name] || [])].sort(keyOrder(table));
      const replicas = this.replicasByTable[name];
      const databases = [...Object.values(this.references), ...replicas.map((r) => r.service.db)];
      for (const db of databases) db.prepare(`DELETE FROM ${name}`).run();
      const explicitRowid = table.keyKind !== KEY_KIND.INTEGER;
      rows.forEach((row, position) => {
        const columns = table.columns.filter((column) => Object.hasOwn(row, column));
        const values = columns.map((column) => row[column]);
        const owner = replicas.find((replica) => keyInRange(table, row, replica.range));
        owner.service.db.prepare(insertStatement(table, columns, false)).run(...values);
        this.references[REFERENCE.INDEXED].prepare(insertStatement(table, columns, false))
          .run(...values);
        for (const reference of [REFERENCE.CANONICAL, REFERENCE.DECLARED]) {
          this.references[reference].prepare(insertStatement(table, columns, explicitRowid))
            .run(...(explicitRowid ? [BigInt(position + 1), ...values] : values));
        }
      });
    }
  }

  /**
   * Run one statement through the engine and on a reference.
   * @param {string} sql
   * @param {Array} params
   * @param {Object} [options]
   * @param {string} [options.reference] - A REFERENCE value (default indexed).
   * @return {Promise<Object>} {expected, actual, delivered}
   */
  async run(sql, params = [], {reference = REFERENCE.INDEXED} = {}) {
    this.delivered = [];
    const expected = runOracle(this.references[reference], sql, params);
    let actual;
    try {
      const result = await this.engine.executeQuery(sql, params);
      actual = result?.success === true ? observeDistributed(result) :
        {kind: 'error', error: errorClassOfDistributed(result), detail: errorDetail(result)};
    } catch (error) {
      actual = {kind: 'error', error: {source: ERROR_SOURCE.LAGRANGE,
        code: String(error?.code ?? 'THROWN')}, detail: String(error?.message)};
    }
    return {expected, actual, delivered: this.delivered};
  }

  async close() {
    for (const replicas of Object.values(this.replicasByTable)) {
      for (const replica of replicas) await replica.service.shutdown();
    }
    for (const reference of Object.values(this.references)) reference.close();
  }
}

function openReferences(tables) {
  const references = {};
  for (const reference of Object.values(REFERENCE)) {
    references[reference] = new Database(':memory:');
  }
  for (const name of TABLE_NAMES) {
    references[REFERENCE.INDEXED].exec(tables[name].renderedDdl);
    for (const indexSql of tables[name].indexDdl) references[REFERENCE.INDEXED].exec(indexSql);
    references[REFERENCE.CANONICAL].exec(tables[name].renderedDdl);
    references[REFERENCE.DECLARED].exec(ORACLE_SCHEMA_DDL[name]);
  }
  return references;
}

/**
 * Open one layout: `partitionCount` replicas for each table.
 * @param {Object} options
 * @param {number} options.partitionCount
 * @param {boolean} [options.remote=true] - Cross frames (true) or deliver by
 *   reference (false).
 * @return {Promise<OracleCluster>}
 */
async function openOracleCluster({partitionCount, remote = true}) {
  prepareEnvironment();
  const tables = declareOracleTables();
  const tableRows = TABLE_NAMES.map((name) => tableRowOf(tables[name]));
  const replicasByTable = {};
  for (const name of TABLE_NAMES) {
    replicasByTable[name] = [];
    const ranges = layoutRanges(partitionCount, tables[name].keyKind);
    for (let index = 0; index < ranges.length; index += 1) {
      const replica = await openReplica(tables[name], `${name}-p${index}`, tableRows);
      replicasByTable[name].push({...replica, range: ranges[index]});
    }
  }
  return new OracleCluster({partitionCount, remote, tables, replicasByTable,
    references: openReferences(tables)});
}

export {ERROR_SOURCE, NODE_ID, REFERENCE, openOracleCluster, runOracle};
