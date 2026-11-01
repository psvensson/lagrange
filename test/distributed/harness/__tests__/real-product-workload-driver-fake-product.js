// A controlled in-memory OLTP product behind fake `pg` clients and `mysql2`
// connections. It answers exactly the canonical statement set (looked up
// through the Lagrange adapter's statement table), the dataset load, the
// state snapshot and the TiDB administrative statements, with per-connection
// transactions and an undo log. Faults are armed after the driver's second
// state snapshot (dataset verification, then the pre-measurement snapshot),
// so warmup runs clean and the measured window exhibits the fault.
// Evidence ceiling: proves the driver's classification and accounting of
// each response class; it is not a product.
import {
  LAGRANGE_OLTP_SQL,
} from '../../reference-client/lagrange-oltp-adapter.js';
import {
  OLTP_SQL_STATEMENT as S,
} from '../oltp-baseline-transaction-executor.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySort = Function.call.bind(Array.prototype.sort);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringToUpperCase = Function.call.bind(String.prototype.toUpperCase);
const stringTrim = Function.call.bind(String.prototype.trim);

const FAULT = Object.freeze({
  NONE: 'ok',
  NEVER_OPEN: 'never-open',
  SILENT: 'silent',
  ERROR_ENVELOPE: 'error-envelope',
  ZERO_AFFECTED: 'zero-affected',
  WRONG_VALUE: 'wrong-value',
  COMMIT_ACK_LOST: 'commit-ack-lost',
  // The dataset load is refused with 55P03, as Lagrange answers on the lab.
  LOAD_LOCK_NOT_AVAILABLE: 'load-lock-not-available',
});
const ARM_AFTER_HISTORY_SNAPSHOTS = 2;
const WRONG_INTEGER = 'garbage';
const WRONG_AFFECTED_ROWS = 2;

function normalizeSql(sql) {
  let text = stringReplace(String(sql), /\$\d+/gu, '?');
  text = stringReplace(text, /\s+FOR UPDATE\s*$/u, '');
  return stringTrim(stringReplace(text, /\s+/gu, ' '));
}

const STATEMENT_BY_SQL = new Map(arrayMap(Object.entries(LAGRANGE_OLTP_SQL),
  ([id, sql]) => [normalizeSql(sql), id]));
const WRITE_STATEMENTS = new Set([
  S.DISTRICT_SET_NEXT_ORDER, S.ORDER_INSERT, S.NEW_ORDER_INSERT, S.STOCK_UPDATE,
  S.ORDER_LINE_INSERT, S.WAREHOUSE_PAYMENT, S.DISTRICT_PAYMENT, S.CUSTOMER_PAYMENT,
  S.HISTORY_INSERT, S.DELIVERY_DELETE_NEW_ORDER, S.DELIVERY_SET_CARRIER,
  S.DELIVERY_MARK_LINES, S.DELIVERY_CUSTOMER_UPDATE,
]);

function systemError(code, syscall) {
  const error = new Error(`${syscall} ${code}`);
  error.code = code;
  error.syscall = syscall;
  return error;
}

function productError(dialect) {
  const error = new Error('relation "district" does not exist');
  if (dialect === 'mysql') {
    error.sqlState = '42S02';
    error.code = 'ER_NO_SUCH_TABLE';
    error.errno = 1146;
  } else {
    error.code = '42P01';
    error.severity = 'ERROR';
  }
  return error;
}

function createState() {
  return {tables: new Map(), historySnapshots: 0, armed: false, statements: [],
    connections: 0, destroyed: 0, lockHolder: null, lockReleased: null, releaseLock: null};
}

function rowsOf(state, table) {
  if (!state.tables.has(table)) state.tables.set(table, []);
  return state.tables.get(table);
}

function insert(state, tx, table, row) {
  const rows = rowsOf(state, table);
  rows.push(row);
  tx?.undo.push(() => rows.splice(arrayIndexOf(rows, row), 1));
  return {rows: [], rowCount: 1};
}

function update(tx, matched, apply) {
  for (const row of matched) {
    const before = {...row};
    apply(row);
    tx?.undo.push(() => Object.assign(row, before));
  }
  return {rows: [], rowCount: matched.length};
}

function where(state, table, predicate) {
  return arrayFilter(rowsOf(state, table), predicate);
}

const HANDLERS = Object.freeze({
  [S.DISTRICT_NEXT_ORDER_FOR_UPDATE]: (state, _tx, [w, d]) => ({
    rows: arrayMap(where(state, 'district', (r) => r.warehouse_id === w && r.district_id === d),
      (r) => ({next_order_id: r.next_order_id})),
  }),
  [S.DISTRICT_SET_NEXT_ORDER]: (state, tx, [next, w, d]) => update(tx,
    where(state, 'district', (r) => r.warehouse_id === w && r.district_id === d),
    (r) => {
      r.next_order_id = next;
    }),
  [S.ORDER_INSERT]: (state, tx, [w, d, o, c, lineCount, allLocal]) => insert(state, tx,
    'orders', {warehouse_id: w, district_id: d, order_id: o, customer_id: c,
      carrier_id: null, line_count: lineCount, all_local: allLocal}),
  [S.NEW_ORDER_INSERT]: (state, tx, [w, d, o]) => insert(state, tx, 'new_order',
    {warehouse_id: w, district_id: d, order_id: o}),
  [S.ITEM_PRICE]: (state, _tx, [item]) => ({
    rows: arrayMap(where(state, 'item', (r) => r.item_id === item),
      (r) => ({price_cents: r.price_cents})),
  }),
  [S.STOCK_QUANTITY_FOR_UPDATE]: (state, _tx, [w, item]) => ({
    rows: arrayMap(where(state, 'stock', (r) => r.warehouse_id === w && r.item_id === item),
      (r) => ({quantity: r.quantity})),
  }),
  [S.STOCK_UPDATE]: (state, tx, [quantity, ytd, remote, w, item]) => update(tx,
    where(state, 'stock', (r) => r.warehouse_id === w && r.item_id === item), (r) => {
      r.quantity = quantity;
      r.ytd_quantity += ytd;
      r.order_count += 1;
      r.remote_count += remote;
    }),
  [S.ORDER_LINE_INSERT]: (state, tx, [w, d, o, n, item, supply, quantity, amount]) =>
    insert(state, tx, 'order_line', {warehouse_id: w, district_id: d, order_id: o,
      line_number: n, item_id: item, supply_warehouse_id: supply, quantity,
      amount_cents: amount, delivered: 0}),
  [S.WAREHOUSE_PAYMENT]: (state, tx, [amount, w]) => update(tx,
    where(state, 'warehouse', (r) => r.id === w), (r) => {
      r.ytd_cents += amount;
    }),
  [S.DISTRICT_PAYMENT]: (state, tx, [amount, w, d]) => update(tx,
    where(state, 'district', (r) => r.warehouse_id === w && r.district_id === d),
    (r) => {
      r.ytd_cents += amount;
    }),
  [S.CUSTOMER_PAYMENT]: (state, tx, [amount, ytd, w, d, c]) => update(tx,
    where(state, 'customer', (r) => r.warehouse_id === w && r.district_id === d &&
      r.customer_id === c), (r) => {
      r.balance_cents -= amount;
      r.ytd_payment_cents += ytd;
      r.payment_count += 1;
    }),
  [S.HISTORY_INSERT]: (state, tx, values) => insert(state, tx, 'history', Object.fromEntries(
    arrayMap(['phase', 'worker_id', 'sequence_id', 'customer_warehouse_id',
      'customer_district_id', 'customer_id', 'home_warehouse_id', 'home_district_id',
      'amount_cents'], (column, index) => [column, values[index]]))),
  [S.ORDER_STATUS_LATEST]: (state, _tx, [w, d, c]) => ({
    rows: arraySort(where(state, 'orders', (r) => r.warehouse_id === w &&
      r.district_id === d && r.customer_id === c), (a, b) => b.order_id - a.order_id)
      .slice(0, 1),
  }),
  [S.ORDER_STATUS_LINES]: (state, _tx, [w, d, o]) => ({
    rows: where(state, 'order_line', (r) => r.warehouse_id === w && r.district_id === d &&
      r.order_id === o),
  }),
  [S.DELIVERY_OLDEST_NEW_ORDER_FOR_UPDATE]: (state, _tx, [w, d]) => ({
    rows: arraySort(where(state, 'new_order', (r) => r.warehouse_id === w &&
      r.district_id === d), (a, b) => a.order_id - b.order_id).slice(0, 1),
  }),
  [S.DELIVERY_DELETE_NEW_ORDER]: (state, tx, [w, d, o]) => {
    const rows = rowsOf(state, 'new_order');
    const row = arrayFind(rows, (r) => r.warehouse_id === w && r.district_id === d &&
      r.order_id === o);
    if (!row) return {rows: [], rowCount: 0};
    rows.splice(arrayIndexOf(rows, row), 1);
    tx?.undo.push(() => rows.push(row));
    return {rows: [], rowCount: 1};
  },
  [S.DELIVERY_ORDER_FOR_UPDATE]: (state, _tx, [w, d, o]) => ({
    rows: arrayMap(where(state, 'orders', (r) => r.warehouse_id === w &&
      r.district_id === d && r.order_id === o), (r) => ({customer_id: r.customer_id})),
  }),
  [S.DELIVERY_SET_CARRIER]: (state, tx, [carrier, w, d, o]) => update(tx,
    where(state, 'orders', (r) => r.warehouse_id === w && r.district_id === d &&
      r.order_id === o), (r) => {
      r.carrier_id = carrier;
    }),
  [S.DELIVERY_LINES_FOR_UPDATE]: (state, _tx, [w, d, o]) => ({
    rows: arrayMap(where(state, 'order_line', (r) => r.warehouse_id === w &&
      r.district_id === d && r.order_id === o), (r) => ({amount_cents: r.amount_cents})),
  }),
  [S.DELIVERY_MARK_LINES]: (state, tx, [w, d, o]) => update(tx,
    where(state, 'order_line', (r) => r.warehouse_id === w && r.district_id === d &&
      r.order_id === o), (r) => {
      r.delivered = 1;
    }),
  [S.DELIVERY_CUSTOMER_UPDATE]: (state, tx, [amount, w, d, c]) => update(tx,
    where(state, 'customer', (r) => r.warehouse_id === w && r.district_id === d &&
      r.customer_id === c), (r) => {
      r.balance_cents += amount;
      r.delivery_count += 1;
    }),
  [S.STOCK_LEVEL_DISTRICT]: (state, _tx, [w, d]) => ({
    rows: arrayMap(where(state, 'district', (r) => r.warehouse_id === w && r.district_id === d),
      (r) => ({next_order_id: r.next_order_id})),
  }),
  [S.STOCK_LEVEL_COUNT]: (state, _tx, [w, w2, d, first, next, threshold]) => {
    const items = new Set(arrayMap(where(state, 'order_line', (r) => r.warehouse_id === w2 &&
      r.district_id === d && r.order_id >= first && r.order_id < next), (r) => r.item_id));
    const low = arrayFilter([...items], (item) => arrayFind(rowsOf(state, 'stock'),
      (s) => s.warehouse_id === w && s.item_id === item && s.quantity < threshold));
    return {rows: [{low_stock: low.length}]};
  },
});

function corrupt(statementId, result) {
  if (WRITE_STATEMENTS.has(statementId)) return {...result, rowCount: WRONG_AFFECTED_ROWS};
  return {...result, rows: arrayMap(result.rows, (row) => Object.fromEntries(
    arrayMap(Object.entries(row), ([key]) => [key, WRONG_INTEGER])))};
}

function applyFault(state, fault, statementId, result, dialect) {
  if (!state.armed) return result;
  switch (fault) {
  case FAULT.SILENT:
    return new Promise(() => {});
  case FAULT.ERROR_ENVELOPE:
    throw productError(dialect);
  case FAULT.ZERO_AFFECTED:
    return WRITE_STATEMENTS.has(statementId) ? {...result, rowCount: 0} : result;
  case FAULT.WRONG_VALUE:
    return corrupt(statementId, result);
  default:
    return result;
  }
}

const SNAPSHOT_PATTERN = /^SELECT ([a-z_, ]+) FROM ([a-z_]+) ORDER BY ([a-z_, ]+)$/u;
const COUNT_PATTERN = /^SELECT COUNT\(\*\) AS row_count FROM ([a-z_]+)$/u;
const INSERT_BATCH_PATTERN = /^INSERT INTO ([a-z_]+) \(([a-z_,]+)\) VALUES /u;

function snapshotRows(state, sql) {
  const [, columnText, table, orderText] = SNAPSHOT_PATTERN.exec(sql);
  const columns = stringSplit(columnText, ', ');
  const order = stringSplit(orderText, ', ');
  const rows = arraySort([...rowsOf(state, table)], (a, b) => {
    for (const column of order) {
      if (a[column] < b[column]) return -1;
      if (a[column] > b[column]) return 1;
    }
    return 0;
  });
  if (table === 'history') {
    state.historySnapshots += 1;
    if (state.historySnapshots === ARM_AFTER_HISTORY_SNAPSHOTS) state.armed = true;
  }
  return arrayMap(rows, (row) => Object.fromEntries(arrayMap(columns,
    (column) => [column, row[column]])));
}

function loadBatch(state, sql, parameters) {
  const [, table, columnText] = INSERT_BATCH_PATTERN.exec(sql);
  const columns = stringSplit(columnText, ',');
  for (let offset = 0; offset < parameters.length; offset += columns.length) {
    rowsOf(state, table).push(Object.fromEntries(arrayMap(columns,
      (column, index) => [column, parameters[offset + index]])));
  }
  return {rows: [], rowCount: parameters.length / columns.length};
}

// Statements outside the canonical set: schema, load, snapshot, admin.
function administrative(state, sql, parameters) {
  if (SNAPSHOT_PATTERN.test(sql)) return {rows: snapshotRows(state, sql)};
  const count = COUNT_PATTERN.exec(sql);
  if (count) {
    if (!state.tables.has(count[1])) throw new Error(`Table not found: ${count[1]}`);
    return {rows: [{row_count: rowsOf(state, count[1]).length}]};
  }
  if (INSERT_BATCH_PATTERN.test(sql)) {
    if (state.fault === FAULT.LOAD_LOCK_NOT_AVAILABLE) {
      throw Object.assign(new Error('Schema provisioning remains active'),
        {code: '55P03', severity: 'ERROR'});
    }
    return loadBatch(state, sql, parameters);
  }
  const createTable = /^CREATE TABLE ([a-z_]+)/u.exec(sql);
  if (createTable) {
    rowsOf(state, createTable[1]);
    return {rows: [], rowCount: 0};
  }
  if (/^SELECT CONNECTION_ID\(\)/u.test(sql)) return {rows: [{connection_id: state.connections}]};
  if (/^(CREATE INDEX|DROP |CREATE DATABASE|USE )/u.test(sql)) return {rows: [], rowCount: 0};
  throw new Error(`fake product does not know statement: ${sql}`);
}

// Transactions are serialized by one product-wide lock held from BEGIN to
// COMMIT/ROLLBACK or connection loss, so the fake has no anomalies of its own.
async function acquireTransactionLock(state, session) {
  while (state.lockHolder) await state.lockReleased;
  state.lockHolder = session;
  state.lockReleased = new Promise((resolve) => {
    state.releaseLock = resolve;
  });
}

function releaseTransactionLock(state, session) {
  if (state.lockHolder !== session) return;
  state.lockHolder = null;
  state.releaseLock();
}

function breakSession(state, session) {
  session.broken = true;
  if (session.tx) {
    for (const undo of [...session.tx.undo].reverse()) undo();
    session.tx = null;
  }
  releaseTransactionLock(state, session);
}

function createSession(state, fault, dialect) {
  state.connections += 1;
  const session = {tx: null, broken: false, serverConnectionId: state.connections};
  return {
    session,
    breakSession: () => breakSession(state, session),
    async run(sql, parameters = []) {
      if (session.broken) throw systemError('ECONNRESET', 'read');
      const word = stringToUpperCase(stringTrim(sql));
      if (word === 'BEGIN') {
        await acquireTransactionLock(state, session);
        session.tx = {undo: []};
        return {rows: [], rowCount: 0};
      }
      if (word === 'ROLLBACK') {
        for (const undo of [...(session.tx?.undo || [])].reverse()) undo();
        session.tx = null;
        releaseTransactionLock(state, session);
        return {rows: [], rowCount: 0};
      }
      if (word === 'COMMIT') {
        session.tx = null;
        releaseTransactionLock(state, session);
        if (state.armed && fault === FAULT.COMMIT_ACK_LOST) {
          session.broken = true;
          throw systemError('ECONNRESET', 'read');
        }
        return {rows: [], rowCount: 0};
      }
      const normalized = normalizeSql(sql);
      const statementId = STATEMENT_BY_SQL.get(normalized);
      if (!statementId) return administrative(state, normalized, parameters);
      state.statements.push(sql);
      const result = HANDLERS[statementId](state, session.tx, parameters);
      return applyFault(state, fault, statementId, {rows: [], ...result}, dialect);
    },
  };
}

function createFakeOltpProduct(fault = FAULT.NONE) {
  const state = createState();
  state.fault = fault;
  const connect = () => {
    if (fault === FAULT.NEVER_OPEN) throw systemError('ECONNREFUSED', 'connect');
  };
  return {
    state,
    createPgClient() {
      let handle = null;
      return {
        processID: null,
        connection: {stream: {destroy() {
          state.destroyed += 1;
          if (handle) handle.breakSession();
        }}},
        async connect() {
          connect();
          handle = createSession(state, fault, 'pg');
          this.processID = handle.session.serverConnectionId;
        },
        async query(sql, parameters) {
          return handle.run(sql, parameters);
        },
        async end() {},
      };
    },
    async createMysqlConnection() {
      connect();
      const handle = createSession(state, fault, 'mysql');
      const answer = async (sql, parameters) => {
        const result = await handle.run(sql, parameters);
        return stringStartsWith(stringToUpperCase(stringTrim(sql)), 'SELECT') ?
          [result.rows, []] : [{affectedRows: result.rowCount}, []];
      };
      return {
        threadId: handle.session.serverConnectionId,
        beginTransaction: () => handle.run('BEGIN'),
        commit: () => handle.run('COMMIT'),
        rollback: () => handle.run('ROLLBACK'),
        execute: answer,
        query: answer,
        async end() {},
        destroy() {
          state.destroyed += 1;
          handle.breakSession();
        },
      };
    },
  };
}

export {
  FAULT as FAKE_PRODUCT_FAULT,
  createFakeOltpProduct,
};
