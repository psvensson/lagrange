// Fake Lagrange SQL engine and container arm shared by the cohort dataset-reset witnesses.

import {
  arrayFilter,
  arrayFind,
  arrayMap,
  stringReplace,
  stringSplit,
  stringStartsWith,
  stringTrim,
} from '../real-product-captured-intrinsics.js';
import {STORAGE_KIND} from '../real-product-deployment-contract.js';
import {
  CANONICAL_TABLE_COLUMNS,
} from '../../reference-client/lagrange-oltp-adapter.js';

const IMAGE = `sha256:${'a'.repeat(64)}`;

function createArm(ledger, generation = 0, {persistent = true} = {}) {
  const mountArg = persistent ? ` -v /srv/bench/camp/lagrange-${generation}:/data` : '';
  const id = stringTrim(ledger.run(
    `docker run -d --name bench-c-lagrange-node-${generation}${mountArg} ` +
    '--network host psvensson/lagrange:0.4.0', '10.0.0.1'));
  const entry = ledger.containers.get(id);
  entry.startedAt = `2026-11-01T10:0${generation}:00.000Z`;
  return {
    roles: [{role: 'lagrange-node', host: '10.0.0.1', containerId: id}],
    endpoint: {protocol: 'pg-wire', host: '10.0.0.1', port: 5433 + generation, containerId: id},
    storage: [{
      role: 'lagrange-node',
      host: '10.0.0.1',
      containerId: id,
      mount: '/data',
      kind: persistent ? STORAGE_KIND.HOST_VOLUME : STORAGE_KIND.CONTAINER_LAYER,
      source: persistent ? `/srv/bench/camp/lagrange-${generation}` : null,
    }],
    access: {connection: {user: 'bench', database: 'bench'}},
    identity: {
      products: [{
        role: 'lagrange-node',
        host: '10.0.0.1',
        containerId: id,
        imageId: IMAGE,
        startedAt: entry.startedAt,
        mounts: persistent ? [{
          type: 'bind',
          source: `/srv/bench/camp/lagrange-${generation}`,
          destination: '/data',
        }] : [],
        reportedVersion: '0.4.0',
      }],
    },
    operations: {awaitReady: async () => ({ready: true})},
  };
}

function restartRuleForLedger(ledger) {
  let seq = 1;
  return [/docker restart -t 1 (\S+)/u, (command) => {
    const rawId = stringReplace((/docker restart -t 1 (\S+)/u.exec(command) || [])[1], /'/gu, '');
    const entry = ledger.containers.get(rawId);
    if (entry) {
      entry.startedAt = `2026-11-01T10:1${seq}:00.000Z`;
      seq += 1;
    }
    return `${rawId}\n`;
  }];
}

function verifyResetSchemaSelect(store, tableSchemas, colList, table, returnSchemaProbeRow) {
  if (!store.has(table)) {
    throw new Error(`Table not found: ${table}`);
  }
  const knownCols = tableSchemas.get(table) || new Set();
  const requestedCols = arrayMap(stringSplit(colList, ','), (c) => stringTrim(c));
  for (const col of requestedCols) {
    if (!knownCols.has(col)) {
      throw new Error(`Column "${col}" does not exist on table "${table}"`);
    }
  }
  const rows = returnSchemaProbeRow ? (store.get(table) || []).slice(0, 1) : [];
  return {rows, rowCount: 0};
}

function executeSchemaDdlQuery(state, normalized) {
  const createMatch = /^CREATE\s+TABLE\s+([a-z_]+)/iu.exec(normalized);
  if (createMatch) {
    const table = createMatch[1];
    state.store.set(table, []);
    state.tableSchemas.set(table, new Set(CANONICAL_TABLE_COLUMNS[table] || []));
    return {rows: [], rowCount: 0};
  }
  const createIndexMatch =
    /^CREATE\s+INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-z0-9_]+)\s+ON\s+([a-z0-9_]+)\s*\(([^)]+)\)$/iu
      .exec(normalized);
  if (createIndexMatch) {
    if (state.onCreateIndex) state.onCreateIndex();
    const indexName = createIndexMatch[1];
    const tableName = createIndexMatch[2];
    const cols = arrayMap(stringSplit(createIndexMatch[3], ','), (c) => stringTrim(c));
    state.createdIndexes.set(indexName, {
      index_name: indexName,
      table_name: tableName,
      column_names: JSON.stringify(cols),
      state: 'READY',
    });
    return {rows: [], rowCount: 0};
  }
  const indexCatalogMatch =
    /^SELECT\s+index_name,\s*table_name,\s*column_names,\s*state\s+FROM\s+indices\s+WHERE\s+table_name\s*=\s*'([a-z0-9_]+)'$/iu
      .exec(normalized);
  if (indexCatalogMatch) {
    const targetTable = indexCatalogMatch[1];
    const matching = arrayFilter(
      [...state.createdIndexes.values()],
      (entry) => entry.table_name === targetTable,
    );
    return {rows: matching, rowCount: matching.length};
  }
  return null;
}

function executeSchemaProbeOrTruncate(state, normalized) {
  const schemaSelectMatch = /^SELECT\s+(.+?)\s+FROM\s+([a-z_]+)\s+LIMIT\s+1$/iu.exec(normalized);
  if (schemaSelectMatch) {
    return verifyResetSchemaSelect(
      state.store,
      state.tableSchemas,
      schemaSelectMatch[1],
      schemaSelectMatch[2],
      state.returnSchemaProbeRow,
    );
  }
  if (stringStartsWith(normalized, 'TRUNCATE TABLE')) {
    const table = stringReplace(normalized, /^TRUNCATE TABLE\s+/u, '');
    if (state.requireTableOnTruncate && !state.store.has(table)) {
      throw new Error(`Table not found: ${table}`);
    }
    state.store.set(table, []);
    return {rows: [], rowCount: 0};
  }
  return null;
}

function executeRowCountOrInsertQuery(store, normalized, params) {
  if (stringStartsWith(normalized, 'SELECT COUNT(*) AS row_count FROM')) {
    const table = stringReplace(normalized, /^SELECT COUNT\(\*\) AS row_count FROM\s+/u, '');
    if (!store.has(table)) {
      throw new Error(`Table not found: ${table}`);
    }
    return {rows: [{row_count: store.get(table).length}]};
  }
  if (stringStartsWith(normalized, 'INSERT INTO')) {
    const batchMatch = /^INSERT INTO\s+([a-z_]+)\s*\(([a-z_, ]+)\)\s*VALUES\s*/iu.exec(normalized);
    if (batchMatch) {
      const table = batchMatch[1];
      const cols = arrayMap(stringSplit(batchMatch[2], ','), (c) => stringTrim(c));
      if (!store.has(table)) store.set(table, []);
      const rows = store.get(table);
      for (let offset = 0; offset < params.length; offset += cols.length) {
        rows.push(Object.fromEntries(arrayMap(cols, (col, idx) => [col, params[offset + idx]])));
      }
      return {rows: [], rowCount: Math.max(1, params.length / cols.length)};
    }
    const table = (/^INSERT INTO\s+([a-z_]+)/u.exec(normalized) || [])[1];
    if (!store.has(table)) store.set(table, []);
    store.get(table).push(params);
    return {rows: [], rowCount: 1};
  }
  return null;
}

function applyWarehouseOrDistrictPayment(store, table, pred, amount) {
  for (const r of arrayFilter(store.get(table) || [], pred)) {
    r.ytd_cents += amount;
  }
  return {rows: [], rowCount: 1};
}

function applyCustomerPayment(store, params) {
  const match = (r) =>
    r.warehouse_id === params[2] && r.district_id === params[3] && r.customer_id === params[4];
  for (const r of arrayFilter(store.get('customer') || [], match)) {
    r.balance_cents -= params[0];
    r.ytd_payment_cents += params[1];
    r.payment_count += 1;
  }
  return {rows: [], rowCount: 1};
}

function executePaymentMutationQuery(store, normalized, params) {
  if (/^UPDATE\s+warehouse\s+SET\s+ytd_cents\b/iu.test(normalized)) {
    return applyWarehouseOrDistrictPayment(store, 'warehouse', (r) => r.id === params[1], params[0]);
  }
  if (/^UPDATE\s+district\s+SET\s+ytd_cents\b/iu.test(normalized)) {
    const pred = (r) => r.warehouse_id === params[1] && r.district_id === params[2];
    return applyWarehouseOrDistrictPayment(store, 'district', pred, params[0]);
  }
  if (/^UPDATE\s+customer\s+SET\s+balance_cents\s*=/iu.test(normalized)) {
    return applyCustomerPayment(store, params);
  }
  return null;
}

const PAYMENT_OBSERVATION_RULES = Object.freeze([
  [/^SELECT\s+ytd_cents\s+FROM\s+warehouse\b/iu, 'warehouse', (r, p) => r.id === p[0]],
  [/^SELECT\s+ytd_cents\s+FROM\s+district\b/iu, 'district',
    (r, p) => r.warehouse_id === p[0] && r.district_id === p[1]],
  [/^SELECT\s+balance_cents,\s*ytd_payment_cents,\s*payment_count\s+FROM\s+customer\b/iu,
    'customer',
    (r, p) => r.warehouse_id === p[0] && r.district_id === p[1] && r.customer_id === p[2]],
  [/^SELECT\s+amount_cents\s+FROM\s+history\b/iu, 'history',
    (r, p) => r.phase === p[0] && r.worker_id === p[1] && r.sequence_id === p[2]],
]);

function executePaymentObservationQuery(store, normalized, params) {
  const rule = arrayFind(PAYMENT_OBSERVATION_RULES, ([re]) => re.test(normalized));
  if (!rule) return null;
  const [, table, predicate] = rule;
  return {rows: arrayFilter(store.get(table) || [], (r) => predicate(r, params))};
}

function executeSnapshotQuery(store, normalized) {
  const snapMatch = /^SELECT\s+([a-z_, ]+)\s+FROM\s+([a-z_]+)\s+ORDER\s+BY\s+([a-z_, ]+)$/iu.exec(normalized);
  if (!snapMatch) return null;
  const cols = arrayMap(stringSplit(snapMatch[1], ','), (c) => stringTrim(c));
  const rows = store.get(snapMatch[2]) || [];
  return {
    rows: arrayMap(rows, (row) => Object.fromEntries(arrayMap(cols, (col) => [col, row[col]]))),
  };
}

async function runCohortResetTestQuery(state, sql, params = []) {
  state.onSql?.(sql);
  const normalized = stringTrim(stringReplace(String(sql), /\s+/gu, ' '));
  return executeSchemaDdlQuery(state, normalized) ||
    executeRowCountOrInsertQuery(state.store, normalized, params) ||
    executeSchemaProbeOrTruncate(state, normalized) ||
    executePaymentMutationQuery(state.store, normalized, params) ||
    executePaymentObservationQuery(state.store, normalized, params) ||
    executeSnapshotQuery(state.store, normalized) ||
    {rows: [], rowCount: 0};
}

export {
  IMAGE,
  createArm,
  restartRuleForLedger,
  runCohortResetTestQuery,
};
