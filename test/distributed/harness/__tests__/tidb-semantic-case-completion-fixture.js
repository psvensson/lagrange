import {
  admitClaim,
} from '../benchmark-claim-admission.js';
import {
  buildFixtureHeader,
  buildFixtureRun,
  sealFixtureRun,
} from '../comparative-benchmark-fixtures.js';
import {
  buildCoverageManifest,
  listManifestClaims,
} from '../comparative-coverage-manifest.js';
import {validateRunRecord} from '../raw-observation-record.js';
import {
  arrayFilter,
  arrayFind,
  arrayFindIndex,
  arrayMap,
  jsonParse,
  jsonStringify,
  stringReplace,
  stringSplit,
  stringStartsWith,
  stringTrim,
} from '../real-product-captured-intrinsics.js';
import {STORAGE_KIND} from '../real-product-deployment-contract.js';

const stringToUpperCase = Function.call.bind(String.prototype.toUpperCase);

const IMAGE = `sha256:${'b'.repeat(64)}`;
const SNAPSHOT_PATTERN = /^SELECT ([a-z_, ]+) FROM ([a-z_]+) ORDER BY ([a-z_, ]+)$/u;
const COUNT_PATTERN = /^SELECT COUNT\(\*\) AS row_count FROM ([a-z_]+)$/u;
const INSERT_BATCH_PATTERN = /^INSERT INTO ([a-z_]+) \(([a-z_,]+)\) VALUES /u;

function normalizeSql(sql) {
  let text = stringReplace(String(sql), /\$\d+/gu, '?');
  text = stringReplace(text, /\s+FOR UPDATE\s*$/u, '');
  return stringTrim(stringReplace(text, /\s+/gu, ' '));
}

function cloneTableMap(tables) {
  const copy = new Map();
  for (const [name, rows] of tables.entries()) {
    copy.set(name, arrayMap(rows, (row) => ({...row})));
  }
  return copy;
}

function tableRowsOf(tables, name) {
  if (!tables.has(name)) tables.set(name, []);
  return tables.get(name);
}

function sortedSnapshotRows(tables, sql) {
  const [, columnText, table, orderText] = SNAPSHOT_PATTERN.exec(sql);
  const columns = stringSplit(columnText, ', ');
  const order = stringSplit(orderText, ', ');
  const rows = [...tableRowsOf(tables, table)].sort((left, right) => {
    for (const col of order) {
      if (left[col] < right[col]) return -1;
      if (left[col] > right[col]) return 1;
    }
    return 0;
  });
  return arrayMap(rows, (row) =>
    Object.fromEntries(arrayMap(columns, (col) => [col, row[col]])));
}

function insertBatchRows(db, sql, params) {
  const [, table, columnText] = INSERT_BATCH_PATTERN.exec(sql);
  const columns = stringSplit(columnText, ',');
  const rows = tableRowsOf(db.tables, table);
  for (let offset = 0; offset < params.length; offset += columns.length) {
    const row = Object.fromEntries(arrayMap(columns,
      (col, idx) => [col, params[offset + idx]]));
    rows.push(row);
  }
  db.baseline = cloneTableMap(db.tables);
  return {rows: [], rowCount: params.length / columns.length};
}

function handleAdminSql(store, session, normalized) {
  const dropMatch = /^DROP DATABASE IF EXISTS `?([A-Za-z0-9_]+)`?$/iu.exec(normalized);
  if (dropMatch) {
    store.databases.delete(dropMatch[1]);
    return {rows: [], rowCount: 0};
  }
  const createDbMatch = /^CREATE DATABASE `?([A-Za-z0-9_]+)`?$/iu.exec(normalized);
  if (createDbMatch) {
    store.databases.set(createDbMatch[1],
      {tables: new Map(), baseline: new Map(), activeStaged: null});
    return {rows: [], rowCount: 0};
  }
  const useMatch = /^USE `?([A-Za-z0-9_]+)`?$/iu.exec(normalized);
  if (useMatch) {
    session.dbName = useMatch[1];
    return {rows: [], rowCount: 0};
  }
  if (/^SET SESSION tidb_txn_mode/iu.test(normalized)) {
    return {rows: [], rowCount: 0};
  }
  const db = store.ensureDb(session.dbName);
  const createTbl = /^CREATE TABLE ([a-z_]+)/iu.exec(normalized);
  if (createTbl) {
    tableRowsOf(db.tables, createTbl[1]);
    return {rows: [], rowCount: 0};
  }
  if (/^(CREATE INDEX|DROP TABLE)/iu.test(normalized)) return {rows: [], rowCount: 0};
  if (/^SELECT CONNECTION_ID\(\)/iu.test(normalized)) {
    return {rows: [{connection_id: session.id}]};
  }
  if (stringStartsWith(normalized, 'SELECT (SELECT COUNT(*) FROM orders)')) {
    return {rows: [{orders_count: tableRowsOf(db.tables, 'orders').length,
      new_order_count: tableRowsOf(db.tables, 'new_order').length,
      order_line_count: tableRowsOf(db.tables, 'order_line').length,
      history_count: tableRowsOf(db.tables, 'history').length}]};
  }
  const countMatch = COUNT_PATTERN.exec(normalized);
  if (countMatch) {
    return {rows: [{row_count: tableRowsOf(db.tables, countMatch[1]).length}]};
  }
  return null;
}

function queryObserverWarehouseDistrictCustomerSql(tables, normalized, params) {
  if (normalized === 'SELECT ytd_cents FROM warehouse WHERE id = ?') {
    const rows = arrayFilter(tableRowsOf(tables, 'warehouse'), (r) => r.id === params[0]);
    return {rows: arrayMap(rows, (r) => ({ytd_cents: r.ytd_cents}))};
  }
  if (normalized === 'SELECT ytd_cents FROM district WHERE warehouse_id = ? AND district_id = ?') {
    const rows = arrayFilter(tableRowsOf(tables, 'district'),
      (r) => r.warehouse_id === params[0] && r.district_id === params[1]);
    return {rows: arrayMap(rows, (r) => ({ytd_cents: r.ytd_cents}))};
  }
  if (normalized === 'SELECT balance_cents, ytd_payment_cents, payment_count FROM customer ' +
      'WHERE warehouse_id = ? AND district_id = ? AND customer_id = ?') {
    const rows = arrayFilter(tableRowsOf(tables, 'customer'),
      (r) => r.warehouse_id === params[0] && r.district_id === params[1] &&
        r.customer_id === params[2]);
    return {rows: arrayMap(rows, (r) => ({balance_cents: r.balance_cents,
      ytd_payment_cents: r.ytd_payment_cents, payment_count: r.payment_count}))};
  }
  if (normalized === 'SELECT amount_cents FROM history ' +
      'WHERE phase = ? AND worker_id = ? AND sequence_id = ?') {
    const rows = arrayFilter(tableRowsOf(tables, 'history'),
      (r) => r.phase === params[0] && r.worker_id === params[1] &&
        r.sequence_id === params[2]);
    return {rows: arrayMap(rows, (r) => ({amount_cents: r.amount_cents}))};
  }
  if (normalized === 'SELECT next_order_id FROM district WHERE warehouse_id = ? AND district_id = ?') {
    const rows = arrayFilter(tableRowsOf(tables, 'district'),
      (r) => r.warehouse_id === params[0] && r.district_id === params[1]);
    return {rows: arrayMap(rows, (r) => ({next_order_id: r.next_order_id}))};
  }
  if (normalized === 'SELECT balance_cents, delivery_count FROM customer ' +
      'WHERE warehouse_id = ? AND district_id = ? AND customer_id = ?') {
    const rows = arrayFilter(tableRowsOf(tables, 'customer'),
      (r) => r.warehouse_id === params[0] &&
        r.district_id === params[1] &&
        r.customer_id === params[2]);
    return {rows: arrayMap(rows, (r) => ({
      balance_cents: r.balance_cents,
      delivery_count: r.delivery_count ?? 0,
    }))};
  }
  return null;
}

function queryObserverOrdersNewOrderSql(tables, normalized, params) {
  if (normalized === 'SELECT order_id FROM orders WHERE warehouse_id = ? AND district_id = ? ORDER BY order_id') {
    const rows = arrayFilter(tableRowsOf(tables, 'orders'),
      (r) => r.warehouse_id === params[0] && r.district_id === params[1])
      .sort((a, b) => a.order_id - b.order_id);
    return {rows: arrayMap(rows, (r) => ({order_id: r.order_id}))};
  }
  if (normalized === 'SELECT order_id FROM new_order WHERE warehouse_id = ? AND district_id = ? ORDER BY order_id') {
    const rows = arrayFilter(tableRowsOf(tables, 'new_order'),
      (r) => r.warehouse_id === params[0] && r.district_id === params[1])
      .sort((a, b) => a.order_id - b.order_id);
    return {rows: arrayMap(rows, (r) => ({order_id: r.order_id}))};
  }
  if (normalized === 'SELECT customer_id, carrier_id FROM orders ' +
      'WHERE warehouse_id = ? AND district_id = ? AND order_id = ?') {
    const rows = arrayFilter(tableRowsOf(tables, 'orders'),
      (r) => r.warehouse_id === params[0] &&
        r.district_id === params[1] &&
        r.order_id === params[2]);
    return {rows: arrayMap(rows, (r) => ({
      customer_id: r.customer_id,
      carrier_id: r.carrier_id,
    }))};
  }
  if (normalized === 'SELECT COUNT(*) AS row_count FROM new_order ' +
      'WHERE warehouse_id = ? AND district_id = ? AND order_id = ?') {
    const rows = arrayFilter(tableRowsOf(tables, 'new_order'),
      (r) => r.warehouse_id === params[0] &&
        r.district_id === params[1] &&
        r.order_id === params[2]);
    return {rows: [{row_count: rows.length}]};
  }
  if (normalized === 'SELECT order_id, carrier_id FROM orders ' +
      'WHERE warehouse_id = ? AND district_id = ? AND customer_id = ? ORDER BY order_id DESC LIMIT 1') {
    const rows = arrayFilter(tableRowsOf(tables, 'orders'),
      (r) => r.warehouse_id === params[0] &&
        r.district_id === params[1] &&
        r.customer_id === params[2])
      .sort((a, b) => b.order_id - a.order_id);
    return {rows: rows.length > 0 ?
      [{order_id: rows[0].order_id, carrier_id: rows[0].carrier_id}] : []};
  }
  if (normalized === 'SELECT order_id FROM new_order ' +
      'WHERE warehouse_id = ? AND district_id = ? ORDER BY order_id ASC LIMIT 1') {
    const rows = arrayFilter(tableRowsOf(tables, 'new_order'),
      (r) => r.warehouse_id === params[0] && r.district_id === params[1])
      .sort((a, b) => a.order_id - b.order_id);
    return {rows: rows.length > 0 ? [{order_id: rows[0].order_id}] : []};
  }
  if (normalized === 'SELECT customer_id FROM orders ' +
      'WHERE warehouse_id = ? AND district_id = ? AND order_id = ?') {
    const rows = arrayFilter(tableRowsOf(tables, 'orders'),
      (r) => r.warehouse_id === params[0] &&
        r.district_id === params[1] &&
        r.order_id === params[2]);
    return {rows: arrayMap(rows, (r) => ({customer_id: r.customer_id}))};
  }
  return null;
}

function queryObserverOrderLineSql(tables, normalized, params) {
  if (normalized === 'SELECT order_id, COUNT(*) AS line_count FROM order_line ' +
      'WHERE warehouse_id = ? AND district_id = ? GROUP BY order_id ORDER BY order_id') {
    const matched = arrayFilter(tableRowsOf(tables, 'order_line'),
      (r) => r.warehouse_id === params[0] && r.district_id === params[1]);
    const counts = new Map();
    for (const r of matched) {
      counts.set(r.order_id, (counts.get(r.order_id) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => a[0] - b[0]);
    return {rows: arrayMap(sorted, ([orderId, lineCount]) => ({
      order_id: orderId,
      line_count: lineCount,
    }))};
  }
  if (normalized === 'SELECT line_number, amount_cents, delivered FROM order_line ' +
      'WHERE warehouse_id = ? AND district_id = ? AND order_id = ? ORDER BY line_number') {
    const rows = arrayFilter(tableRowsOf(tables, 'order_line'),
      (r) => r.warehouse_id === params[0] &&
        r.district_id === params[1] &&
        r.order_id === params[2])
      .sort((a, b) => a.line_number - b.line_number);
    return {rows: arrayMap(rows, (r) => ({
      line_number: r.line_number,
      amount_cents: r.amount_cents,
      delivered: r.delivered,
    }))};
  }
  if (normalized === 'SELECT line_number, item_id, supply_warehouse_id, quantity, amount_cents, delivered FROM order_line ' +
      'WHERE warehouse_id = ? AND district_id = ? AND order_id = ? ORDER BY line_number') {
    const rows = arrayFilter(tableRowsOf(tables, 'order_line'),
      (r) => r.warehouse_id === params[0] &&
        r.district_id === params[1] &&
        r.order_id === params[2])
      .sort((a, b) => a.line_number - b.line_number);
    return {rows: arrayMap(rows, (r) => ({
      line_number: r.line_number,
      item_id: r.item_id,
      supply_warehouse_id: r.supply_warehouse_id,
      quantity: r.quantity,
      amount_cents: r.amount_cents,
      delivered: r.delivered,
    }))};
  }
  if (normalized === 'SELECT amount_cents FROM order_line ' +
      'WHERE warehouse_id = ? AND district_id = ? AND order_id = ? ORDER BY line_number') {
    const rows = arrayFilter(tableRowsOf(tables, 'order_line'),
      (r) => r.warehouse_id === params[0] &&
        r.district_id === params[1] &&
        r.order_id === params[2])
      .sort((a, b) => a.line_number - b.line_number);
    return {rows: arrayMap(rows, (r) => ({amount_cents: r.amount_cents}))};
  }
  return null;
}

function queryObserverStockSql(tables, normalized, params) {
  if (stringStartsWith(normalized,
    'SELECT warehouse_id, item_id, quantity, ytd_quantity, order_count, remote_count FROM stock ' +
    'WHERE warehouse_id = ? AND item_id IN (')) {
    const warehouseId = params[0];
    const itemIds = new Set(params.slice(1));
    const matched = arrayFilter(tableRowsOf(tables, 'stock'),
      (r) => r.warehouse_id === warehouseId && itemIds.has(r.item_id))
      .sort((a, b) => a.item_id - b.item_id);
    return {rows: arrayMap(matched, (r) => ({
      warehouse_id: r.warehouse_id,
      item_id: r.item_id,
      quantity: r.quantity,
      ytd_quantity: r.ytd_quantity,
      order_count: r.order_count,
      remote_count: r.remote_count,
    }))};
  }
  if (stringStartsWith(normalized,
    'SELECT COUNT(DISTINCT ol.item_id) AS low_stock FROM order_line AS ol JOIN stock AS s')) {
    const stockWarehouseId = params[0];
    const olWarehouseId = params[1];
    const districtId = params[2];
    const minOrderId = params[3];
    const maxOrderId = params[4];
    const thresholdQty = params[5];
    const stockMap = new Map();
    for (const s of tableRowsOf(tables, 'stock')) {
      if (s.warehouse_id === stockWarehouseId) stockMap.set(s.item_id, s.quantity);
    }
    const lowStockItems = new Set();
    for (const ol of tableRowsOf(tables, 'order_line')) {
      if (ol.warehouse_id === olWarehouseId &&
          ol.district_id === districtId &&
          ol.order_id >= minOrderId &&
          ol.order_id < maxOrderId) {
        const qty = stockMap.get(ol.item_id);
        if (qty !== undefined && qty < thresholdQty) {
          lowStockItems.add(ol.item_id);
        }
      }
    }
    return {rows: [{low_stock: lowStockItems.size}]};
  }
  return null;
}

function queryObserverSql(tables, normalized, params, _fault) {
  return queryObserverWarehouseDistrictCustomerSql(tables, normalized, params) ||
    queryObserverOrdersNewOrderSql(tables, normalized, params) ||
    queryObserverOrderLineSql(tables, normalized, params) ||
    queryObserverStockSql(tables, normalized, params);
}

function handleDmlWarehouseSql(tables, normalized, params, fault) {
  if (normalized === 'UPDATE warehouse SET ytd_cents = ytd_cents + ? WHERE id = ?') {
    for (const r of tableRowsOf(tables, 'warehouse')) {
      if (r.id === params[1]) r.ytd_cents += fault.corruptWarehouseYtd ? 0 : params[0];
    }
    return {rows: [], rowCount: 1};
  }
  return null;
}

function handleDmlDistrictSql(tables, normalized, params, fault) {
  if (normalized === 'UPDATE district SET next_order_id = ? WHERE warehouse_id = ? AND district_id = ?') {
    for (const r of tableRowsOf(tables, 'district')) {
      if (r.warehouse_id === params[1] && r.district_id === params[2]) {
        r.next_order_id = params[0];
      }
    }
    return {rows: [], rowCount: 1};
  }
  if (normalized === 'UPDATE district SET ytd_cents = ytd_cents + ? WHERE warehouse_id = ? AND district_id = ?') {
    for (const r of tableRowsOf(tables, 'district')) {
      if (r.warehouse_id === params[1] && r.district_id === params[2]) {
        r.ytd_cents += fault.corruptDistrictYtd ? 0 : params[0];
      }
    }
    return {rows: [], rowCount: 1};
  }
  return null;
}

function handleDmlCustomerPaymentSql(tables, normalized, params, fault) {
  if (normalized === 'UPDATE customer SET balance_cents = balance_cents - ?, ' +
      'ytd_payment_cents = ytd_payment_cents + ?, payment_count = payment_count + 1 ' +
      'WHERE warehouse_id = ? AND district_id = ? AND customer_id = ?') {
    for (const r of tableRowsOf(tables, 'customer')) {
      if (r.warehouse_id === params[2] &&
          r.district_id === params[3] &&
          r.customer_id === params[4]) {
        if (!fault.corruptCustomerBalance) r.balance_cents -= params[0];
        r.ytd_payment_cents += params[1];
        r.payment_count += fault.corruptCustomerCounters ? 2 : 1;
      }
    }
    return {rows: [], rowCount: 1};
  }
  return null;
}

function handleDmlCustomerDeliverySql(tables, normalized, params) {
  if (normalized === 'UPDATE customer SET balance_cents = balance_cents + ?, delivery_count = delivery_count + 1 ' +
      'WHERE warehouse_id = ? AND district_id = ? AND customer_id = ?') {
    for (const r of tableRowsOf(tables, 'customer')) {
      if (r.warehouse_id === params[1] &&
          r.district_id === params[2] &&
          r.customer_id === params[3]) {
        r.balance_cents += params[0];
        r.delivery_count = (r.delivery_count ?? 0) + 1;
      }
    }
    return {rows: [], rowCount: 1};
  }
  return null;
}

function handleDmlCustomerSql(tables, normalized, params, fault) {
  return handleDmlCustomerPaymentSql(tables, normalized, params, fault) ||
    handleDmlCustomerDeliverySql(tables, normalized, params);
}

function handleDmlHistorySql(tables, normalized, params, fault) {
  if (normalized === 'INSERT INTO history (phase, worker_id, sequence_id, customer_warehouse_id, ' +
      'customer_district_id, customer_id, home_warehouse_id, home_district_id, amount_cents) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)') {
    tableRowsOf(tables, 'history').push({
      phase: params[0], worker_id: params[1], sequence_id: params[2],
      customer_warehouse_id: params[3], customer_district_id: params[4],
      customer_id: params[5], home_warehouse_id: params[6], home_district_id: params[7],
      amount_cents: fault.corruptHistoryAmount ? params[8] + 1 : params[8],
    });
    return {rows: [], rowCount: 1};
  }
  return null;
}

function handleDmlOrdersNewOrderSql(tables, normalized, params) {
  if (normalized === 'INSERT INTO orders (warehouse_id, district_id, order_id, customer_id, ' +
      'carrier_id, line_count, all_local) VALUES (?, ?, ?, ?, NULL, ?, ?)') {
    tableRowsOf(tables, 'orders').push({
      warehouse_id: params[0], district_id: params[1], order_id: params[2],
      customer_id: params[3], carrier_id: null, line_count: params[4], all_local: params[5],
    });
    return {rows: [], rowCount: 1};
  }
  if (normalized === 'INSERT INTO new_order (warehouse_id, district_id, order_id) VALUES (?, ?, ?)') {
    tableRowsOf(tables, 'new_order').push({
      warehouse_id: params[0], district_id: params[1], order_id: params[2],
    });
    return {rows: [], rowCount: 1};
  }
  if (normalized === 'DELETE FROM new_order WHERE warehouse_id = ? AND district_id = ? AND order_id = ?') {
    const rows = tableRowsOf(tables, 'new_order');
    const idx = arrayFindIndex(rows, (r) => r.warehouse_id === params[0] &&
      r.district_id === params[1] &&
      r.order_id === params[2]);
    if (idx >= 0) rows.splice(idx, 1);
    return {rows: [], rowCount: idx >= 0 ? 1 : 0};
  }
  if (normalized === 'UPDATE orders SET carrier_id = ? WHERE warehouse_id = ? AND district_id = ? AND order_id = ?') {
    for (const r of tableRowsOf(tables, 'orders')) {
      if (r.warehouse_id === params[1] && r.district_id === params[2] && r.order_id === params[3]) {
        r.carrier_id = params[0];
      }
    }
    return {rows: [], rowCount: 1};
  }
  return null;
}

function handleDmlItemStockSql(tables, normalized, params) {
  if (normalized === 'SELECT price_cents FROM item WHERE item_id = ?') {
    const rows = arrayFilter(tableRowsOf(tables, 'item'), (r) => r.item_id === params[0]);
    return {rows: arrayMap(rows, (r) => ({price_cents: r.price_cents}))};
  }
  if (normalized === 'SELECT quantity FROM stock WHERE warehouse_id = ? AND item_id = ?') {
    const rows = arrayFilter(tableRowsOf(tables, 'stock'),
      (r) => r.warehouse_id === params[0] && r.item_id === params[1]);
    return {rows: arrayMap(rows, (r) => ({quantity: r.quantity}))};
  }
  if (normalized === 'UPDATE stock SET quantity = ?, ytd_quantity = ytd_quantity + ?, ' +
      'order_count = order_count + 1, remote_count = remote_count + ? ' +
      'WHERE warehouse_id = ? AND item_id = ?') {
    for (const r of tableRowsOf(tables, 'stock')) {
      if (r.warehouse_id === params[3] && r.item_id === params[4]) {
        r.quantity = params[0];
        r.ytd_quantity += params[1];
        r.order_count += 1;
        r.remote_count += params[2];
      }
    }
    return {rows: [], rowCount: 1};
  }
  return null;
}

function handleDmlOrderLineSql(tables, normalized, params) {
  if (normalized === 'INSERT INTO order_line (warehouse_id, district_id, order_id, line_number, ' +
      'item_id, supply_warehouse_id, quantity, amount_cents, delivered) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)') {
    tableRowsOf(tables, 'order_line').push({
      warehouse_id: params[0], district_id: params[1], order_id: params[2],
      line_number: params[3], item_id: params[4], supply_warehouse_id: params[5],
      quantity: params[6], amount_cents: params[7], delivered: 0,
    });
    return {rows: [], rowCount: 1};
  }
  if (normalized === 'UPDATE order_line SET delivered = 1 WHERE warehouse_id = ? AND district_id = ? AND order_id = ?') {
    let count = 0;
    for (const r of tableRowsOf(tables, 'order_line')) {
      if (r.warehouse_id === params[0] && r.district_id === params[1] && r.order_id === params[2]) {
        r.delivered = 1;
        count += 1;
      }
    }
    return {rows: [], rowCount: count};
  }
  return null;
}

function handleDmlSql(tables, normalized, params, fault) {
  return handleDmlWarehouseSql(tables, normalized, params, fault) ||
    handleDmlDistrictSql(tables, normalized, params, fault) ||
    handleDmlCustomerSql(tables, normalized, params, fault) ||
    handleDmlHistorySql(tables, normalized, params, fault) ||
    handleDmlOrdersNewOrderSql(tables, normalized, params) ||
    handleDmlItemStockSql(tables, normalized, params) ||
    handleDmlOrderLineSql(tables, normalized, params);
}

function selectReadView(db, session, fault) {
  if (session.staged) {
    return fault.breakReadYourOwnWrites ? db.tables : session.staged;
  }
  if (fault.dirtyRead && db.activeStaged) return db.activeStaged;
  return db.tables;
}

function createTiDbMockStore(fault = {}) {
  const store = {
    fault,
    databases: new Map(),
    nextId: 0,
    ensureDb(name) {
      const key = name || 'default_db';
      if (!store.databases.has(key)) {
        store.databases.set(key, {
          tables: new Map(),
          baseline: new Map(),
          activeStaged: null,
          version: 0,
        });
      }
      return store.databases.get(key);
    },
    loseCommittedDurabilityState() {
      for (const db of store.databases.values()) {
        const reverted = cloneTableMap(db.baseline);
        const historyRows = tableRowsOf(db.tables, 'history');
        if (historyRows.length > 0) {
          reverted.set('history', arrayMap(historyRows, (r) => ({...r, amount_cents: 0})));
        }
        db.tables = reverted;
      }
    },
  };
  const openSession = (initialDb) => {
    store.nextId += 1;
    const session = {id: store.nextId, dbName: initialDb || 'default_db', staged: null, dbVersion: 0};
    const begin = () => {
      const db = store.ensureDb(session.dbName);
      session.staged = cloneTableMap(db.tables);
      session.dbVersion = db.version || 0;
      db.activeStaged = session.staged;
      return {rows: [], rowCount: 0};
    };
    const commit = () => {
      const db = store.ensureDb(session.dbName);
      if (session.staged) {
        db.tables = session.staged;
        db.version = (db.version || 0) + 1;
      }
      session.staged = null;
      db.activeStaged = null;
      return {rows: [], rowCount: 0};
    };
    const rollback = () => {
      const db = store.ensureDb(session.dbName);
      if (fault.partialCommitOnRollback &&
          session.dbName === 'bench_gate_failure_atomicity' &&
          session.staged) {
        db.tables = session.staged;
      }
      session.staged = null;
      db.activeStaged = null;
      return {rows: [], rowCount: 0};
    };
    const checkUpdateDeadlock = (upper, db) => {
      if (stringStartsWith(upper, 'UPDATE ') && session.staged && session.dbVersion < (db.version || 0)) {
        const conflict = new Error('Deadlock found when trying to get lock; try restarting transaction');
        conflict.code = 'ER_LOCK_DEADLOCK';
        conflict.errno = 1213;
        conflict.sqlState = '40001';
        conflict.sqlMessage = conflict.message;
        throw conflict;
      }
    };
    const handleTransactionControl = (upper) => {
      if (upper === 'BEGIN') return begin();
      if (upper === 'COMMIT') return commit();
      if (upper === 'ROLLBACK') return rollback();
      return null;
    };
    const executeSql = async (sql, params = []) => {
      const normalized = normalizeSql(sql);
      const upper = stringToUpperCase(normalized);
      const txRes = handleTransactionControl(upper);
      if (txRes) return txRes;
      const admin = handleAdminSql(store, session, normalized);
      if (admin) return admin;
      const db = store.ensureDb(session.dbName);
      if (INSERT_BATCH_PATTERN.test(normalized)) {
        return insertBatchRows(db, normalized, params);
      }
      const readView = selectReadView(db, session, fault);
      if (SNAPSHOT_PATTERN.test(normalized)) {
        return {rows: sortedSnapshotRows(readView, normalized)};
      }
      const observed = queryObserverSql(readView, normalized, params, fault);
      if (observed) return observed;
      checkUpdateDeadlock(upper, db);
      const target = session.staged || db.tables;
      const dml = handleDmlSql(target, normalized, params, fault);
      if (dml) return dml;
      throw new Error(`unhandled SQL in TiDB mock store: ${normalized}`);
    };
    return {session, begin, commit, rollback, executeSql};
  };
  return {
    store,
    createMysqlConnection: async (opts = {}) => {
      const handle = openSession(opts.database || null);
      const query = async (sql, params = []) => {
        const res = await handle.executeSql(sql, params);
        return stringStartsWith(stringToUpperCase(stringTrim(sql)), 'SELECT') ?
          [res.rows, []] : [{affectedRows: res.rowCount ?? 0}, []];
      };
      return {
        threadId: handle.session.id,
        beginTransaction: async () => {
          handle.begin();
        },
        commit: async () => {
          handle.commit();
        },
        rollback: async () => {
          handle.rollback();
        },
        execute: query,
        query,
        end: async () => {},
      };
    },
  };
}

function tidbClusterArmOf(ledger, {persistent = true, readinessResult = {ready: true}} = {}) {
  const vol = (label) => (persistent ? ` -v /srv/bench/camp/${label}:/data` : '');
  const pdId = stringTrim(ledger.run(
    `docker run -d --name bench-c-pd-1${vol('pd')} pingcap/pd:v8.5.8`, '10.0.0.1'));
  const tikvIds = arrayMap([1, 2, 3], (idx) => stringTrim(ledger.run(
    `docker run -d --name bench-c-tikv-${idx}${vol(`tikv-${idx}`)} pingcap/tikv:v8.5.8`,
    `10.0.0.${idx}`)));
  const tidbId = stringTrim(ledger.run(
    'docker run -d --name bench-c-tidb-1 pingcap/tidb:v8.5.8', '10.0.0.1'));
  const initialStartedAt = '2026-11-01T10:00:00.000Z';
  for (const id of [pdId, ...tikvIds, tidbId]) {
    ledger.containers.get(id).startedAt = initialStartedAt;
  }
  const makeProduct = (role, host, id, label) => ({
    role,
    host,
    containerId: id,
    imageId: IMAGE,
    startedAt: initialStartedAt,
    mounts: persistent && label ? [{
      type: 'bind',
      source: `/srv/bench/camp/${label}`,
      destination: '/data',
    }] : [],
    reportedVersion: '8.5.8',
  });
  const products = [
    makeProduct('pd', '10.0.0.1', pdId, 'pd'),
    ...arrayMap(tikvIds, (id, idx) =>
      makeProduct('tikv', `10.0.0.${idx + 1}`, id, `tikv-${idx + 1}`)),
    makeProduct('tidb', '10.0.0.1', tidbId, null),
  ];
  const storage = arrayMap(
    arrayFilter(products, (p) => p.role !== 'tidb'),
    (p, idx) => ({
      role: p.role,
      host: p.host,
      containerId: p.containerId,
      mount: '/data',
      kind: persistent ? STORAGE_KIND.HOST_VOLUME : STORAGE_KIND.CONTAINER_LAYER,
      source: persistent ?
        `/srv/bench/camp/${idx === 0 ? 'pd' : `tikv-${idx}`}` : null,
    }),
  );
  return {
    roles: arrayMap(products, (p) => ({role: p.role, host: p.host, containerId: p.containerId})),
    endpoint: {protocol: 'mysql', host: '10.0.0.1', port: 4000, containerId: tidbId},
    storage,
    access: {connection: {user: 'root', database: 'lagrange_tidb_oltp'}},
    identity: {products},
    operations: {awaitReady: async () => readinessResult},
  };
}

function restartRuleForLedger(ledger, {advanceClock = true, dropMountsOnRestart = false,
  onRestart = null} = {}) {
  let seq = 1;
  return [/docker restart -t 1 (\S+)/u, (command) => {
    const rawId = stringReplace((/docker restart -t 1 (\S+)/u.exec(command) || [])[1], /'/gu, '');
    const entry = ledger.containers.get(rawId);
    if (entry) {
      if (advanceClock) {
        entry.startedAt = `2026-11-01T10:1${seq}:00.000Z`;
        seq += 1;
      }
      if (dropMountsOnRestart) entry.mounts = [];
    }
    if (onRestart) onRestart(rawId);
    return `${rawId}\n`;
  }];
}

function claimFor(targetId, subkind) {
  return arrayFind(listManifestClaims(buildCoverageManifest()),
    (c) => c.targetId === targetId && c.scenario === 'scenarioA' && c.subkind === subkind);
}

function admitTiDbRunPairWithGate({targetId = 'tidb-tikv', subkind = 'smoke', gate, endpointContainerId = null}) {
  const campaignId = 'camp-tidb-admit';
  const header = buildFixtureHeader({campaignId, targetIds: [targetId]});
  const runs = arrayMap([1, 2], (repetition) => {
    const run = buildFixtureRun({campaignId, targetId, subkind, repetition});
    if (endpointContainerId) {
      run.deployment.endpoint.containerId = endpointContainerId;
      run.deployment.roles[0].containerId = endpointContainerId;
      run.deployment.storage[0].containerId = endpointContainerId;
      run.identity.products[0].containerId = endpointContainerId;
      run.identity.productsAfterWindow[0].containerId = endpointContainerId;
    }
    const gateCopy = jsonParse(jsonStringify(gate));
    const targetBinding = {
      campaignId,
      containerId: run.deployment.endpoint.containerId,
      imageId: run.identity.products[0].imageId,
      endpoint: `${run.deployment.endpoint.host}:${run.deployment.endpoint.port}`,
    };
    if (gateCopy.binding) {
      gateCopy.binding = {...targetBinding};
    }
    if (Array.isArray(gateCopy.bindings)) {
      gateCopy.bindings = arrayMap(gateCopy.bindings, () => ({...targetBinding}));
    }
    if (Array.isArray(gateCopy.cases)) {
      for (const c of gateCopy.cases) {
        if (c.binding) {
          c.binding = {...targetBinding};
        }
      }
    }
    run.correctness.semanticGate = gateCopy;
    sealFixtureRun(run, {keepFinalState: true});
    validateRunRecord(run);
    return {file: 'raw-observations.ndjson', run};
  });
  return admitClaim({
    claim: claimFor(targetId, subkind),
    runs,
    campaignHeaders: new Map([[campaignId, header]]),
    retainedReferences: [],
    invalidations: [],
  });
}

export {
  admitTiDbRunPairWithGate,
  createTiDbMockStore,
  restartRuleForLedger,
  tidbClusterArmOf,
};
