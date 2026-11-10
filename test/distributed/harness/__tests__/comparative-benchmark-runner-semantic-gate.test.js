// The semantic gate stage: B1's proof journey runs bound to the actual
// deployment container(s) on which each proof ran; every case after the first
// gets a fresh Lagrange formation (PostgreSQL and TiDB reset through their
// adapters); the durability restart targets an eligible data-bearing replica,
// waits for readiness, re-inspects identity and storage continuity, and fails
// closed on endpoint-only faults, unchanged incarnations, or missing storage
// continuity; Lagrange re-forms before measurement without overwriting prior
// proof bindings; TiDB claims only invariants actually proved through the
// canonical Scenario A case contracts, leaving unexecuted cases and skipped
// durability unproven.
import {Buffer} from 'node:buffer';
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  ADMISSION_REASON,
  CLAIM_CELL_STATUS,
  admitClaim,
} from '../benchmark-claim-admission.js';
import {
  buildFixtureHeader,
  buildFixtureRun,
  sealFixtureRun,
} from '../comparative-benchmark-fixtures.js';
import {
  buildObservedFaultEvidence,
  createSemanticGateStage,
  executeRemoteGateAction,
  runTiDbSemanticGate,
} from '../comparative-benchmark-semantic-gate.js';
import {
  buildCoverageManifest,
  listManifestClaims,
} from '../comparative-coverage-manifest.js';
import {
  OLTP_SQL_STATEMENT as S,
} from '../oltp-baseline-transaction-executor.js';
import {
  OLTP_SCENARIO_A_DURABILITY_PROOF_IDS,
  evaluateScenarioADurabilityObservation,
} from '../oltp-scenario-a-durability-case.js';
import {
  OLTP_SCENARIO_A_FAILURE_ATOMICITY_PROOF_IDS,
} from '../oltp-scenario-a-failure-atomicity-case.js';
import {
  OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
} from '../oltp-scenario-a-payment-case.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
  buildScenarioASemanticGateEvidence,
} from '../oltp-scenario-a-semantic-gate.js';
import {
  OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS,
} from '../oltp-scenario-a-visibility-case.js';
import {validateRunRecord} from '../raw-observation-record.js';
import {
  arrayFilter,
  arrayFind,
  arrayIncludes,
  arrayMap,
  arraySome,
  stringIncludes,
  stringReplace,
  stringSplit,
  stringStartsWith,
  stringTrim,
} from '../real-product-captured-intrinsics.js';
import {STORAGE_KIND} from '../real-product-deployment-contract.js';
import {LAGRANGE_OLTP_SQL} from '../../reference-client/lagrange-oltp-adapter.js';
import {
  createContainerLedger,
  dockerRules,
} from './real-product-deployer-product-answers-fixture.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';

const stringToUpperCase = Function.call.bind(String.prototype.toUpperCase);
const TIDB_PROBE_PARTIAL_CASE_IDS = Object.freeze([
  'visibility',
  'payment',
  'failure-atomicity',
  'durability',
]);
const IMAGE = `sha256:${'a'.repeat(64)}`;
const STATEMENT_VERB = /^\s*([A-Za-z]+)/u;
const SNAPSHOT_PATTERN = /^SELECT ([a-z_, ]+) FROM ([a-z_]+) ORDER BY ([a-z_, ]+)$/u;
const COUNT_PATTERN = /^SELECT COUNT\(\*\) AS row_count FROM ([a-z_]+)$/u;
const INSERT_BATCH_PATTERN = /^INSERT INTO ([a-z_]+) \(([a-z_,]+)\) VALUES /u;
const REMOTE_PAYLOAD_PATTERN = /--input-type=module -e '[^']+' ([A-Za-z0-9+/=]+)$/u;

function normalizeSql(sql) {
  let text = stringReplace(String(sql), /\$\d+/gu, '?');
  text = stringReplace(text, /\s+FOR UPDATE\s*$/u, '');
  return stringTrim(stringReplace(text, /\s+/gu, ' '));
}

const STATEMENT_BY_SQL = new Map(arrayMap(Object.entries(LAGRANGE_OLTP_SQL),
  ([id, sql]) => [normalizeSql(sql), id]));

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

function queryObserverSql(tables, normalized, params) {
  if (normalized === 'SELECT ytd_cents FROM warehouse WHERE id = ?') {
    const rows = arrayFilter(tableRowsOf(tables, 'warehouse'), (r) => r.id === params[0]);
    return {rows: arrayMap(rows, (r) => ({ytd_cents: r.ytd_cents}))};
  }
  if (normalized ===
      'SELECT ytd_cents FROM district WHERE warehouse_id = ? AND district_id = ?') {
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
  return null;
}

function readDistrictNextOrder(_tables, match, params) {
  return {rows: arrayMap(match('district',
    (r) => r.warehouse_id === params[0] && r.district_id === params[1]),
  (r) => ({next_order_id: r.next_order_id}))};
}

const STATEMENT_HANDLERS = Object.freeze({
  [S.DISTRICT_NEXT_ORDER_FOR_UPDATE]: readDistrictNextOrder,
  [S.STOCK_LEVEL_DISTRICT]: readDistrictNextOrder,
  [S.DISTRICT_SET_NEXT_ORDER]: (_tables, match, params) => {
    for (const r of match('district',
      (row) => row.warehouse_id === params[1] && row.district_id === params[2])) {
      r.next_order_id = params[0];
    }
    return {rows: [], rowCount: 1};
  },
  [S.ORDER_INSERT]: (tables, _match, params) => {
    tableRowsOf(tables, 'orders').push({warehouse_id: params[0], district_id: params[1],
      order_id: params[2], customer_id: params[3], carrier_id: null, line_count: params[4],
      all_local: params[5]});
    return {rows: [], rowCount: 1};
  },
  [S.NEW_ORDER_INSERT]: (tables, _match, params) => {
    tableRowsOf(tables, 'new_order').push({warehouse_id: params[0], district_id: params[1],
      order_id: params[2]});
    return {rows: [], rowCount: 1};
  },
  [S.ITEM_PRICE]: (_tables, match, params) => ({
    rows: arrayMap(match('item', (r) => r.item_id === params[0]),
      (r) => ({price_cents: r.price_cents})),
  }),
  [S.STOCK_QUANTITY_FOR_UPDATE]: (_tables, match, params) => ({
    rows: arrayMap(match('stock',
      (r) => r.warehouse_id === params[0] && r.item_id === params[1]),
    (r) => ({quantity: r.quantity})),
  }),
  [S.STOCK_UPDATE]: (_tables, match, params) => {
    for (const r of match('stock',
      (row) => row.warehouse_id === params[3] && row.item_id === params[4])) {
      r.quantity = params[0];
      r.ytd_quantity += params[1];
      r.order_count += 1;
      r.remote_count += params[2];
    }
    return {rows: [], rowCount: 1};
  },
  [S.ORDER_LINE_INSERT]: (tables, _match, params) => {
    tableRowsOf(tables, 'order_line').push({warehouse_id: params[0], district_id: params[1],
      order_id: params[2], line_number: params[3], item_id: params[4],
      supply_warehouse_id: params[5], quantity: params[6], amount_cents: params[7],
      delivered: 0});
    return {rows: [], rowCount: 1};
  },
  [S.WAREHOUSE_PAYMENT]: (_tables, match, params, fault) => {
    for (const r of match('warehouse', (row) => row.id === params[1])) {
      r.ytd_cents += fault.corruptWarehouseYtd ? 0 : params[0];
    }
    return {rows: [], rowCount: 1};
  },
  [S.DISTRICT_PAYMENT]: (_tables, match, params, fault) => {
    for (const r of match('district',
      (row) => row.warehouse_id === params[1] && row.district_id === params[2])) {
      r.ytd_cents += fault.corruptDistrictYtd ? 0 : params[0];
    }
    return {rows: [], rowCount: 1};
  },
  [S.CUSTOMER_PAYMENT]: (_tables, match, params, fault) => {
    for (const r of match('customer', (row) => row.warehouse_id === params[2] &&
        row.district_id === params[3] && row.customer_id === params[4])) {
      if (!fault.corruptCustomerBalance) r.balance_cents -= params[0];
      r.ytd_payment_cents += params[1];
      r.payment_count += fault.corruptCustomerCounters ? 2 : 1;
    }
    return {rows: [], rowCount: 1};
  },
  [S.HISTORY_INSERT]: (tables, _match, params, fault) => {
    tableRowsOf(tables, 'history').push({phase: params[0], worker_id: params[1],
      sequence_id: params[2], customer_warehouse_id: params[3],
      customer_district_id: params[4], customer_id: params[5],
      home_warehouse_id: params[6], home_district_id: params[7],
      amount_cents: fault.corruptHistoryAmount ? params[8] + 1 : params[8]});
    return {rows: [], rowCount: 1};
  },
});

function applyCanonicalStatement(tables, statementId, params, fault) {
  const handler = STATEMENT_HANDLERS[statementId];
  if (!handler) throw new Error(`unsupported canonical statement in gate test fixture: ${statementId}`);
  const match = (table, pred) => arrayFilter(tableRowsOf(tables, table), pred);
  return handler(tables, match, params, fault);
}

function selectReadView(db, session, fault) {
  if (session.staged) {
    return fault.breakReadYourOwnWrites ? db.tables : session.staged;
  }
  if (fault.dirtyRead && db.activeStaged) return db.activeStaged;
  return db.tables;
}

function handleAdminSql(store, session, normalized, params) {
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
  if (INSERT_BATCH_PATTERN.test(normalized)) return insertBatchRows(db, normalized, params);
  if (SNAPSHOT_PATTERN.test(normalized)) {
    return {rows: sortedSnapshotRows(selectReadView(db, session, store.fault), normalized)};
  }
  return null;
}

function createTransactionalOltpStore(fault = {}) {
  const store = {
    fault,
    databases: new Map(),
    nextId: 0,
    ensureDb(name) {
      const key = name || 'default_db';
      if (!store.databases.has(key)) {
        store.databases.set(key, {tables: new Map(), baseline: new Map(), activeStaged: null});
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
    const session = {id: store.nextId, dbName: initialDb || 'default_db', staged: null};
    const begin = () => {
      const db = store.ensureDb(session.dbName);
      session.staged = cloneTableMap(db.tables);
      db.activeStaged = session.staged;
      return {rows: [], rowCount: 0};
    };
    const commit = () => {
      const db = store.ensureDb(session.dbName);
      if (session.staged) db.tables = session.staged;
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
    const executeSql = async (sql, params = []) => {
      const normalized = normalizeSql(sql);
      const upper = stringToUpperCase(normalized);
      if (upper === 'BEGIN') return begin();
      if (upper === 'COMMIT') return commit();
      if (upper === 'ROLLBACK') return rollback();
      const admin = handleAdminSql(store, session, normalized, params);
      if (admin) return admin;
      const db = store.ensureDb(session.dbName);
      const readView = selectReadView(db, session, fault);
      const observed = queryObserverSql(readView, normalized, params);
      if (observed) return observed;
      const statementId = STATEMENT_BY_SQL.get(normalized);
      if (!statementId) throw new Error(`unhandled SQL in gate fixture: ${normalized}`);
      const writeTarget = session.staged || db.tables;
      return applyCanonicalStatement(writeTarget, statementId, params, fault);
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
    createPgClient: (opts = {}) => {
      const handle = openSession(opts.database || 'pg_db');
      return {
        processID: handle.session.id,
        connect: async () => {},
        query: async (sql, params = []) => {
          const res = await handle.executeSql(sql, params);
          return {
            rows: res.rows,
            rowCount: res.rowCount ?? res.rows.length,
            command: stringToUpperCase(STATEMENT_VERB.exec(sql)[1]),
          };
        },
        end: async () => {},
      };
    },
  };
}

function armOf(ledger, generation, {persistent = false} = {}) {
  const mountArg = persistent ? ` -v /srv/bench/camp/lagrange-${generation}:/data` : '';
  const id = stringTrim(ledger.run(
    `docker run -d --name bench-c-lagrange-node-${generation}${mountArg} ` +
    '--network host psvensson/lagrange:0.4.0', '10.0.0.1'));
  const entry = ledger.containers.get(id);
  entry.startedAt = `2026-11-01T10:0${generation}:00.000Z`;
  return {
    roles: [{role: 'lagrange-node', host: '10.0.0.1', containerId: id}],
    endpoint: {host: '10.0.0.1', port: 5433 + generation, containerId: id},
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
    imageId: `sha256:${'b'.repeat(64)}`,
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

function journey(log) {
  return async ({binding, beforeCase, restartProduct}) => {
    log.push(['binding', binding.endpoint, binding.campaignId]);
    const bindings = [binding];
    for (const caseId of ['payment', 'delivery', 'durability']) {
      const fresh = await beforeCase({caseId});
      if (fresh) {
        log.push(['fresh', caseId, fresh.binding.endpoint]);
        if (!arraySome(
          bindings,
          (b) => b.containerId === fresh.binding.containerId &&
            b.endpoint === fresh.binding.endpoint,
        )) {
          bindings.push(fresh.binding);
        }
      }
      if (caseId === 'durability') log.push(['restart', (await restartProduct({})).containerId]);
    }
    return {
      status: 'passed',
      passed: [...OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS],
      failed: [],
      missing: [],
      binding: bindings.length === 1 ? bindings[0] : null,
      bindings,
    };
  };
}

function claimFor(targetId, subkind) {
  return arrayFind(listManifestClaims(buildCoverageManifest()),
    (c) => c.targetId === targetId && c.scenario === 'scenarioA' && c.subkind === subkind);
}

function admitRunPairWithGate({targetId, subkind, gate, endpointContainerId = null}) {
  const campaignId = 'camp-bind';
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
    run.correctness.semanticGate = JSON.parse(JSON.stringify(gate));
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

test('Lagrange: cohort preserved per case and before measurement, restart of the endpoint container only, ' +
  'single binding preserved across the journey', async () => {
  const ledger = createContainerLedger();
  const {sshRun, calls} = createScriptedSsh([
    ...dockerRules(ledger),
    restartRuleForLedger(ledger),
  ]);
  let generation = 0;
  const first = armOf(ledger, generation, {persistent: true});
  const log = [];
  const stage = createSemanticGateStage({
    journey: journey(log),
    sshRun,
    opts: {},
    evidenceDirOf: (run) => `/tmp/ev/${run.runId}`,
    now: () => 0,
    redeploy: async () => armOf(ledger, generation += 1, {persistent: true}),
  });
  const result = await stage({
    run: {runId: 'r1', system: 'lagrange'},
    manifest: {campaignId: 'camp'},
    deployment: first,
  });
  assert.deepEqual(log.slice(0, 3), [
    ['binding', '10.0.0.1:5433', 'camp'],
    ['fresh', 'delivery', '10.0.0.1:5433'],
    ['fresh', 'durability', '10.0.0.1:5433'],
  ]);
  const restarts = arrayFilter(calls, (call) => /docker restart/u.test(call.command));
  assert.equal(restarts.length, 1);
  assert.match(restarts[0].command, new RegExp(`docker restart -t 1 ${log[3][1]}$`, 'u'));
  assert.deepEqual(arrayMap(result.events, (event) => event.kind), [
    'dataset-reset',
    'dataset-reset',
    'product-restart',
    'dataset-reset',
  ]);
  assert.equal(result.events[3].caseId, 'before-measurement');
  assert.equal(result.deployment.endpoint.port, 5433);
  assert.equal(result.gate.status, 'passed');
  assert.notEqual(result.gate.binding, null,
    'cohort-preserving proofs must produce a valid single deployment binding');
  assert.equal(result.gate.binding.endpoint, '10.0.0.1:5433');
  assert.deepEqual(arrayMap(result.gate.bindings, (b) => b.endpoint), [
    '10.0.0.1:5433',
  ]);
});

test('PostgreSQL resets through its adapter; unknown systems record semantic-gate-not-run',
  async () => {
    const ledger = createContainerLedger();
    const {sshRun} = createScriptedSsh([...dockerRules(ledger)]);
    let redeploys = 0;
    const stage = createSemanticGateStage({
      journey: async ({beforeCase, binding}) => {
        await beforeCase({caseId: 'a'});
        await beforeCase({caseId: 'b'});
        return {status: 'incomplete', passed: [], failed: [], missing: ['visibility'], binding};
      },
      sshRun,
      opts: {},
      evidenceDirOf: () => '/tmp/ev',
      now: () => 0,
      redeploy: async () => {
        redeploys += 1;
      },
    });
    const pg = await stage({
      run: {runId: 'r', system: 'postgresql'},
      manifest: {campaignId: 'c'},
      deployment: armOf(ledger, 0),
    });
    assert.equal(redeploys, 0);
    assert.deepEqual(arrayMap(pg.events, (event) => event.kind), ['dataset-reset']);
    const unknown = await stage({
      run: {runId: 'r', system: 'cockroachdb'},
      manifest: {campaignId: 'c'},
      deployment: armOf(ledger, 0),
    });
    assert.equal(unknown.gate, null);
    assert.equal(unknown.events[0].kind, 'semantic-gate-not-run');
  });

test('Item 5: proofs from deployment A cannot authorize measurements on deployment B; ' +
  'valid single-deployment proofs remain accepted', async () => {
  const ledger = createContainerLedger();
  const {sshRun} = createScriptedSsh([...dockerRules(ledger)]);
  const deploymentA = armOf(ledger, 0, {persistent: true});
  const deploymentB = armOf(ledger, 1, {persistent: true});
  const allPassedEvidence = buildScenarioASemanticGateEvidence({
    systems: ['lagrange'],
    proofs: [{
      evidenceId: 'lagrange-all',
      system: 'lagrange',
      status: 'passed',
      artifactSha256: 'e'.repeat(64),
      proofIds: [...OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS],
    }],
  });
  const singleCaseJourney = async ({binding}) => ({
    status: 'passed',
    passed: allPassedEvidence.systems.lagrange.passedProofIds,
    failed: [],
    missing: [],
    binding,
    bindings: [binding],
  });
  const reformedStage = createSemanticGateStage({
    journey: singleCaseJourney,
    sshRun,
    opts: {},
    evidenceDirOf: () => null,
    now: () => 0,
    redeploy: async () => deploymentB,
  });
  const reformed = await reformedStage({
    run: {runId: 'r-lagrange', system: 'lagrange'},
    manifest: {campaignId: 'camp-bind'},
    deployment: deploymentA,
  });
  assert.equal(reformed.gate.binding.containerId, deploymentA.endpoint.containerId,
    'gate retains deployment A containerId where the proof actually ran');
  assert.equal(reformed.deployment.endpoint.containerId, deploymentA.endpoint.containerId,
    'measurement receives cohort-preserved deployment A');

  // Feed deployment B measurement + deployment A gate into the real admission contract:
  const probeRun = buildFixtureRun({campaignId: 'camp-bind', targetId: 'lagrange',
    subkind: 'main'});
  const gateFromA = {
    ...reformed.gate,
    binding: {
      campaignId: 'camp-bind',
      containerId: deploymentA.endpoint.containerId,
      imageId: probeRun.identity.products[0].imageId,
      endpoint: `${probeRun.deployment.endpoint.host}:${probeRun.deployment.endpoint.port}`,
    },
  };
  const crossDeploymentCell = admitRunPairWithGate({
    targetId: 'lagrange',
    subkind: 'main',
    gate: gateFromA,
    endpointContainerId: deploymentB.endpoint.containerId,
  });
  assert.equal(crossDeploymentCell.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT);
  assert.equal(arrayIncludes(crossDeploymentCell.reasons, ADMISSION_REASON.SEMANTIC_GATE_UNBOUND),
    true, 'proofs on deployment A must not authorize measurements on deployment B');

  // Multi-binding gate (binding: null) also cannot authorize deployment B without an explicit
  // cross-deployment contract:
  const multiDeploymentCell = admitRunPairWithGate({
    targetId: 'lagrange',
    subkind: 'main',
    gate: {...gateFromA, binding: null},
    endpointContainerId: deploymentB.endpoint.containerId,
  });
  assert.equal(multiDeploymentCell.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT);
  assert.equal(arrayIncludes(multiDeploymentCell.reasons, ADMISSION_REASON.SEMANTIC_GATE_UNBOUND),
    true);

  // Valid single-deployment case (proofs AND measurement on deployment A) remains accepted:
  const pgStage = createSemanticGateStage({
    journey: singleCaseJourney,
    sshRun,
    opts: {},
    evidenceDirOf: () => null,
    now: () => 0,
    redeploy: async () => {
      throw new Error('PostgreSQL single-deployment arm does not redeploy');
    },
  });
  const pgSample = buildFixtureRun({
    campaignId: 'camp-bind',
    targetId: 'pg-single-primary',
    subkind: 'main',
  });
  const pgArm = {
    roles: pgSample.deployment.roles,
    endpoint: pgSample.deployment.endpoint,
    storage: pgSample.deployment.storage,
    access: {connection: {user: 'bench', database: 'bench'}},
    identity: {products: pgSample.identity.products},
    operations: {awaitReady: async () => ({ready: true})},
  };
  const singleDeployment = await pgStage({
    run: {runId: 'r-pg', system: 'postgresql'},
    manifest: {campaignId: 'camp-bind'},
    deployment: pgArm,
  });
  assert.equal(singleDeployment.gate.binding.containerId, pgArm.endpoint.containerId);
  const singleDeploymentCell = admitRunPairWithGate({
    targetId: 'pg-single-primary',
    subkind: 'main',
    gate: singleDeployment.gate,
    endpointContainerId: pgArm.endpoint.containerId,
  });
  assert.equal(singleDeploymentCell.status, CLAIM_CELL_STATUS.VALID_OBSERVED,
    singleDeploymentCell.reasons.join(', '));
});

test('Item 4: TiDB gate probe claims only canonical case invariants, stays incomplete, and ' +
  'leaves skipped durability unproven', async () => {
  const ledger = createContainerLedger();
  const {sshRun, calls} = createScriptedSsh([
    ...dockerRules(ledger),
    restartRuleForLedger(ledger),
  ]);
  const smokeDeployment = tidbClusterArmOf(ledger, {persistent: false});
  const engine = createTransactionalOltpStore();
  const smokeStage = createSemanticGateStage({
    journey: async () => {
      throw new Error('PG journey must not run for TiDB');
    },
    sshRun,
    opts: {},
    createMysqlConnection: engine.createMysqlConnection,
    evidenceDirOf: () => null,
    now: () => 0,
    redeploy: async () => smokeDeployment,
  });
  const smokeResult = await smokeStage({
    run: {runId: 'r-tidb-smoke', system: 'tidb-tikv', executedCaseIds: TIDB_PROBE_PARTIAL_CASE_IDS},
    manifest: {campaignId: 'camp-tidb'},
    deployment: smokeDeployment,
  });

  const expectedSmokePassed = [
    ...OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS,
    ...OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
    ...OLTP_SCENARIO_A_FAILURE_ATOMICITY_PROOF_IDS,
  ].sort();
  assert.equal(smokeResult.gate.status, 'incomplete',
    'small TiDB probe does not execute all 9 Scenario A cases and must stay incomplete');
  assert.deepEqual(smokeResult.gate.passed, expectedSmokePassed);
  assert.deepEqual(smokeResult.gate.failed, []);
  for (const durabilityProofId of OLTP_SCENARIO_A_DURABILITY_PROOF_IDS) {
    assert.equal(arrayIncludes(smokeResult.gate.passed, durabilityProofId), false,
      `skipped durability must never award ${durabilityProofId}`);
    assert.equal(arrayIncludes(smokeResult.gate.missing, durabilityProofId), true,
      `skipped durability must leave ${durabilityProofId} in missing`);
  }
  assert.equal(
    smokeResult.gate.passed.length + smokeResult.gate.missing.length,
    OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS.length,
  );
  assert.equal(arraySome(calls, (c) => /docker restart/u.test(c.command)), false,
    'non-persistent storage must skip container restart');
  const durabilityCase = arrayFind(smokeResult.gate.cases, (c) => c.caseId === 'durability');
  assert.equal(durabilityCase.failureKind, 'probe_inapplicable');
  assert.deepEqual(durabilityCase.failureReasons, ['durability_requires_persistent_storage']);

  // Caller supplying no restart capability on persistent storage also leaves durability missing:
  const noRestartGate = await runTiDbSemanticGate({
    connection: {endpoint: {host: '10.0.0.1', port: 4000}, credentials: {user: 'root'}},
    binding: smokeResult.gate.binding,
    persistentStorage: true,
    restartProduct: null,
    executedCaseIds: TIDB_PROBE_PARTIAL_CASE_IDS,
    createMysqlConnection: createTransactionalOltpStore().createMysqlConnection,
  });
  assert.equal(noRestartGate.status, 'incomplete');
  const noRestartDurability = arrayFind(noRestartGate.cases, (c) => c.caseId === 'durability');
  assert.equal(noRestartDurability.status, 'not-executed');
  for (const durabilityProofId of OLTP_SCENARIO_A_DURABILITY_PROOF_IDS) {
    assert.equal(arrayIncludes(noRestartGate.missing, durabilityProofId), true);
  }
});

test('Item 4 & Item 7: TiDB positive canonical cases + persistent TiKV replica durability ' +
  '(local and remote loadGeneratorHost) claim exact 12 proof IDs and stay incomplete',
async () => {
  const ledger = createContainerLedger();
  const {sshRun, calls} = createScriptedSsh([
    ...dockerRules(ledger),
    restartRuleForLedger(ledger),
  ]);
  const persistentDeployment = tidbClusterArmOf(ledger, {persistent: true});
  const tikvIds = arrayMap(
    arrayFilter(persistentDeployment.identity.products, (p) => p.role === 'tikv'),
    (p) => p.containerId,
  );
  const tidbEndpointId = persistentDeployment.endpoint.containerId;
  const engine = createTransactionalOltpStore();
  const stage = createSemanticGateStage({
    journey: async () => ({status: 'incomplete'}),
    sshRun,
    opts: {},
    createMysqlConnection: engine.createMysqlConnection,
    evidenceDirOf: () => null,
    now: () => 0,
    redeploy: async () => persistentDeployment,
  });
  const localResult = await stage({
    run: {runId: 'r-tidb-pub', system: 'tidb-tikv', executedCaseIds: TIDB_PROBE_PARTIAL_CASE_IDS},
    manifest: {campaignId: 'camp-tidb'},
    deployment: persistentDeployment,
  });

  const expectedPassed = [
    ...OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS,
    ...OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
    ...OLTP_SCENARIO_A_FAILURE_ATOMICITY_PROOF_IDS,
    ...OLTP_SCENARIO_A_DURABILITY_PROOF_IDS,
  ].sort();
  assert.equal(localResult.gate.status, 'incomplete',
    'even with durability proved, the 5 unexecuted canonical cases keep the gate incomplete');
  assert.deepEqual(localResult.gate.passed, expectedPassed);
  assert.deepEqual(localResult.gate.failed, []);
  assert.equal(localResult.gate.missing.length,
    OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS.length - expectedPassed.length);

  // Verify restartProduct restarted a TiKV data-store replica, NOT the stateless TiDB SQL server:
  const restartEvents = arrayFilter(localResult.events, (e) => e.kind === 'product-restart');
  assert.equal(restartEvents.length, 1);
  assert.equal(restartEvents[0].role, 'tikv');
  assert.equal(arrayIncludes(tikvIds, restartEvents[0].containerId), true);
  assert.notEqual(restartEvents[0].containerId, tidbEndpointId);
  assert.equal(arraySome(calls,
    (c) => stringIncludes(c.command, `docker restart -t 1 ${tidbEndpointId}`)), false);

  // Remote loadGeneratorHost path executes the exact same canonical contracts over SSH:
  const remoteLedger = createContainerLedger();
  const remoteDeployment = tidbClusterArmOf(remoteLedger, {persistent: true});
  const remoteEngine = createTransactionalOltpStore();
  const remoteSsh = createScriptedSsh([
    [(command, host) => host === '10.0.0.9' && stringIncludes(command, '--input-type=module'),
      async (command) => {
        const encoded = REMOTE_PAYLOAD_PATTERN.exec(command)[1];
        const req = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
        const out = await executeRemoteGateAction(req, {
          createMysqlConnection: remoteEngine.createMysqlConnection,
        });
        return JSON.stringify(out);
      }],
    ...dockerRules(remoteLedger),
    restartRuleForLedger(remoteLedger),
  ]);
  const remoteStage = createSemanticGateStage({
    journey: async () => ({status: 'incomplete'}),
    sshRun: remoteSsh.sshRun,
    opts: {},
    loadGeneratorHost: {ip: '10.0.0.9', repoPath: '/srv/repo', nodePath: '/usr/bin/node'},
    evidenceDirOf: () => null,
    now: () => 0,
    redeploy: async () => remoteDeployment,
  });
  const remoteResult = await remoteStage({
    run: {runId: 'r-tidb-remote', system: 'tidb-tikv', executedCaseIds: TIDB_PROBE_PARTIAL_CASE_IDS},
    manifest: {campaignId: 'camp-tidb'},
    deployment: remoteDeployment,
  });
  assert.equal(remoteResult.gate.status, 'incomplete');
  assert.deepEqual(remoteResult.gate.passed, expectedPassed);
  assert.equal(arrayFilter(remoteSsh.calls, (c) => c.host === '10.0.0.9').length, 5);
});

test('Item 4: negative controls fail closed for every claimed TiDB canonical invariant',
  async () => {
    const binding = {
      campaignId: 'camp-neg',
      containerId: 'c'.repeat(64),
      imageId: IMAGE,
      endpoint: '10.0.0.1:4000',
    };
    const connection = {endpoint: {host: '10.0.0.1', port: 4000}, credentials: {user: 'root'}};

    const negativeControls = [
      {
        label: 'visibility dirty read',
        fault: {dirtyRead: true},
        expectedFailedIds: OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS,
        caseId: 'visibility',
        reason: 'dirty_read',
      },
      {
        label: 'visibility broken read-your-own-writes',
        fault: {breakReadYourOwnWrites: true},
        expectedFailedIds: OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS,
        caseId: 'visibility',
        reason: 'read_your_own_write',
      },
      {
        label: 'payment corrupted warehouse ytd',
        fault: {corruptWarehouseYtd: true},
        expectedFailedIds: OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
        caseId: 'payment',
        reason: 'warehouse_ytd',
      },
      {
        label: 'payment corrupted district ytd',
        fault: {corruptDistrictYtd: true},
        expectedFailedIds: OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
        caseId: 'payment',
        reason: 'district_ytd',
      },
      {
        label: 'payment corrupted customer balance',
        fault: {corruptCustomerBalance: true},
        expectedFailedIds: OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
        caseId: 'payment',
        reason: 'customer_balance',
      },
      {
        label: 'payment corrupted customer payment counters',
        fault: {corruptCustomerCounters: true},
        expectedFailedIds: OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
        caseId: 'payment',
        reason: 'customer_payment_counters',
      },
      {
        label: 'payment corrupted history row',
        fault: {corruptHistoryAmount: true},
        expectedFailedIds: OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
        caseId: 'payment',
        reason: 'history_row',
      },
      {
        label: 'failure-atomicity partial commit on rollback',
        fault: {partialCommitOnRollback: true},
        expectedFailedIds: OLTP_SCENARIO_A_FAILURE_ATOMICITY_PROOF_IDS,
        caseId: 'failure-atomicity',
        reason: 'partial_commit',
      },
    ];

    for (const control of negativeControls) {
      const engine = createTransactionalOltpStore(control.fault);
      const gate = await runTiDbSemanticGate({
        connection,
        binding,
        persistentStorage: false,
        restartProduct: null,
        executedCaseIds: TIDB_PROBE_PARTIAL_CASE_IDS,
        createMysqlConnection: engine.createMysqlConnection,
      });
      assert.equal(gate.status, 'failed', `${control.label}: gate must fail`);
      for (const proofId of control.expectedFailedIds) {
        assert.equal(arrayIncludes(gate.failed, proofId), true,
          `${control.label}: ${proofId} must be in failed`);
        assert.equal(arrayIncludes(gate.passed, proofId), false,
          `${control.label}: ${proofId} must not be in passed`);
      }
      const failureEntry = arrayFind(gate.failureKinds, (f) => f.caseId === control.caseId);
      assert.equal(failureEntry.kind, 'product_anomaly', control.label);
      assert.equal(arrayIncludes(failureEntry.reasons, control.reason), true, control.label);
    }

    // Negative control for durability: eligible TiKV fault where committed payment state is lost:
    const ledger = createContainerLedger();
    const durabilityEngine = createTransactionalOltpStore();
    const {sshRun} = createScriptedSsh([
      ...dockerRules(ledger),
      restartRuleForLedger(ledger, {
        onRestart: () => durabilityEngine.store.loseCommittedDurabilityState(),
      }),
    ]);
    const deployment = tidbClusterArmOf(ledger, {persistent: true});
    const stage = createSemanticGateStage({
      journey: async () => ({status: 'incomplete'}),
      sshRun,
      opts: {},
      createMysqlConnection: durabilityEngine.createMysqlConnection,
      evidenceDirOf: () => null,
      now: () => 0,
      redeploy: async () => deployment,
    });
    const lostCommit = await stage({
      run: {runId: 'r-tidb-loss', system: 'tidb-tikv', executedCaseIds: TIDB_PROBE_PARTIAL_CASE_IDS},
      manifest: {campaignId: 'camp-neg'},
      deployment,
    });
    assert.equal(lostCommit.gate.status, 'failed');
    for (const proofId of OLTP_SCENARIO_A_DURABILITY_PROOF_IDS) {
      assert.equal(arrayIncludes(lostCommit.gate.failed, proofId), true);
      assert.equal(arrayIncludes(lostCommit.gate.passed, proofId), false);
    }
    const durabilityFailure = arrayFind(lostCommit.gate.failureKinds,
      (f) => f.caseId === 'durability');
    assert.equal(durabilityFailure.kind, 'product_anomaly');
    assert.equal(arrayIncludes(durabilityFailure.reasons, 'durability_state'), true);
  });

test('Item 7: remote PG durability supplies canonical proof IDs and passes on genuine fault; ' +
  'endpoint-only faults, unchanged incarnations, and missing storage continuity fail closed',
async () => {
  // 1. Genuine eligible PostgreSQL primary restart over loadGeneratorHost passes canonical
  //    durability evaluator and supplies OLTP_SCENARIO_A_DURABILITY_PROOF_IDS:
  const pgLedger = createContainerLedger();
  const pgEngine = createTransactionalOltpStore();
  const pgId = stringTrim(pgLedger.run(
    'docker run -d --name bench-c-postgres-primary-1 ' +
    '-v /srv/bench/camp/pg:/var/lib/postgresql/data postgres:17.6-alpine', '10.0.0.1'));
  pgLedger.containers.get(pgId).startedAt = '2026-11-01T10:00:00.000Z';
  const pgDeployment = {
    roles: [{role: 'postgres-primary', host: '10.0.0.1', containerId: pgId}],
    endpoint: {host: '10.0.0.1', port: 5432, containerId: pgId},
    storage: [{
      role: 'postgres-primary',
      host: '10.0.0.1',
      containerId: pgId,
      mount: '/var/lib/postgresql/data',
      kind: STORAGE_KIND.HOST_VOLUME,
      source: '/srv/bench/camp/pg',
    }],
    access: {connection: {user: 'bench', database: 'bench'}},
    identity: {
      products: [{
        role: 'postgres-primary',
        host: '10.0.0.1',
        containerId: pgId,
        imageId: `sha256:${'c'.repeat(64)}`,
        startedAt: '2026-11-01T10:00:00.000Z',
        mounts: [{
          type: 'bind',
          source: '/srv/bench/camp/pg',
          destination: '/var/lib/postgresql/data',
        }],
        reportedVersion: 'PostgreSQL 17.6',
      }],
    },
    operations: {awaitReady: async () => ({ready: true})},
  };
  const pgRemoteSsh = createScriptedSsh([
    [(command, host) => host === '10.0.0.9' && stringIncludes(command, '--input-type=module'),
      async (command) => {
        const encoded = REMOTE_PAYLOAD_PATTERN.exec(command)[1];
        const req = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
        if (req.action === 'pg-case') {
          throw new Error('skip non-durability PG cases in focused durability test');
        }
        const out = await executeRemoteGateAction(req, {createPgClient: pgEngine.createPgClient});
        return JSON.stringify(out);
      }],
    ...dockerRules(pgLedger),
    restartRuleForLedger(pgLedger),
  ]);
  const pgStage = createSemanticGateStage({
    journey: async () => ({status: 'incomplete'}),
    sshRun: pgRemoteSsh.sshRun,
    opts: {},
    loadGeneratorHost: {ip: '10.0.0.9', repoPath: '/srv/repo', nodePath: '/usr/bin/node'},
    evidenceDirOf: () => null,
    now: () => 0,
    redeploy: async () => pgDeployment,
  });
  const pgGateResult = await pgStage({
    run: {runId: 'r-pg-dur', system: 'postgresql'},
    manifest: {campaignId: 'camp-pg'},
    deployment: pgDeployment,
  });
  const pgDurabilityCase = arrayFind(pgGateResult.gate.cases, (c) => c.caseId === 'durability');
  assert.equal(pgDurabilityCase.status, 'passed');
  assert.deepEqual(pgDurabilityCase.proofRecord.proofIds, OLTP_SCENARIO_A_DURABILITY_PROOF_IDS);
  assert.deepEqual(pgGateResult.gate.passed, OLTP_SCENARIO_A_DURABILITY_PROOF_IDS);

  // 2. Endpoint-only fault: restarting stateless `tidb` SQL server alone fails closed:
  const epLedger = createContainerLedger();
  const epDeployment = tidbClusterArmOf(epLedger, {persistent: true});
  // Remove TiKV entries from products to simulate an endpoint-only TiDB fault target:
  epDeployment.identity.products = arrayFilter(epDeployment.identity.products,
    (p) => p.role === 'tidb');
  const epEngine = createTransactionalOltpStore();
  const epSsh = createScriptedSsh([...dockerRules(epLedger), restartRuleForLedger(epLedger)]);
  const epResult = await createSemanticGateStage({
    journey: async () => ({status: 'incomplete'}),
    sshRun: epSsh.sshRun,
    opts: {},
    createMysqlConnection: epEngine.createMysqlConnection,
    evidenceDirOf: () => null,
    now: () => 0,
    redeploy: async () => epDeployment,
  })({
    run: {runId: 'r-tidb-ep-only', system: 'tidb-tikv'},
    manifest: {campaignId: 'camp-ep'},
    deployment: epDeployment,
  });
  const epDurability = arrayFind(epResult.gate.cases, (c) => c.caseId === 'durability');
  assert.equal(epDurability.status, 'failed');
  assert.equal(epDurability.failureKind, 'evidence_insufficient');
  assert.equal(arrayIncludes(epDurability.failureReasons, 'pg_host_only_fault_insufficient'),
    true);
  for (const id of OLTP_SCENARIO_A_DURABILITY_PROOF_IDS) {
    assert.equal(arrayIncludes(epResult.gate.passed, id), false);
    assert.equal(arrayIncludes(epResult.gate.missing, id), true);
  }

  // 3. Unchanged incarnation (`StartedAt` did not advance across restart) fails closed:
  const sameIncLedger = createContainerLedger();
  const sameIncDeployment = tidbClusterArmOf(sameIncLedger, {persistent: true});
  const sameIncSsh = createScriptedSsh([
    ...dockerRules(sameIncLedger),
    restartRuleForLedger(sameIncLedger, {advanceClock: false}),
  ]);
  const sameIncResult = await createSemanticGateStage({
    journey: async () => ({status: 'incomplete'}),
    sshRun: sameIncSsh.sshRun,
    opts: {},
    createMysqlConnection: createTransactionalOltpStore().createMysqlConnection,
    evidenceDirOf: () => null,
    now: () => 0,
    redeploy: async () => sameIncDeployment,
  })({
    run: {runId: 'r-tidb-same-inc', system: 'tidb-tikv'},
    manifest: {campaignId: 'camp-inc'},
    deployment: sameIncDeployment,
  });
  const sameIncDurability = arrayFind(sameIncResult.gate.cases, (c) => c.caseId === 'durability');
  assert.equal(sameIncDurability.status, 'failed');
  assert.equal(sameIncDurability.failureKind, 'evidence_insufficient');
  assert.deepEqual(sameIncDurability.failureReasons, ['fault_incarnation_unchanged']);
  for (const id of OLTP_SCENARIO_A_DURABILITY_PROOF_IDS) {
    assert.equal(arrayIncludes(sameIncResult.gate.missing, id), true);
  }

  // 4. Missing storage continuity (bind mount absent after container restart) fails closed:
  const lostMountLedger = createContainerLedger();
  const lostMountDeployment = tidbClusterArmOf(lostMountLedger, {persistent: true});
  const lostMountSsh = createScriptedSsh([
    ...dockerRules(lostMountLedger),
    restartRuleForLedger(lostMountLedger, {dropMountsOnRestart: true}),
  ]);
  const lostMountResult = await createSemanticGateStage({
    journey: async () => ({status: 'incomplete'}),
    sshRun: lostMountSsh.sshRun,
    opts: {},
    createMysqlConnection: createTransactionalOltpStore().createMysqlConnection,
    evidenceDirOf: () => null,
    now: () => 0,
    redeploy: async () => lostMountDeployment,
  })({
    run: {runId: 'r-tidb-lost-mount', system: 'tidb-tikv'},
    manifest: {campaignId: 'camp-mount'},
    deployment: lostMountDeployment,
  });
  const lostMountDurability = arrayFind(lostMountResult.gate.cases,
    (c) => c.caseId === 'durability');
  assert.equal(lostMountDurability.status, 'failed');
  assert.equal(lostMountDurability.failureKind, 'evidence_insufficient');
  assert.deepEqual(lostMountDurability.failureReasons, ['storage_continuity_invalid']);
  for (const id of OLTP_SCENARIO_A_DURABILITY_PROOF_IDS) {
    assert.equal(arrayIncludes(lostMountResult.gate.missing, id), true);
  }

  // 5. Unsatisfied post-restart readiness withholds retainedObligations and fails closed:
  const unreadyEvidence = buildObservedFaultEvidence({
    deployment: pgDeployment,
    target: {host: '10.0.0.1', containerId: pgId},
    beforeProduct: {...pgDeployment.identity.products[0],
      startedAt: '2026-11-01T10:00:00.000Z'},
    afterProduct: {...pgDeployment.identity.products[0],
      startedAt: '2026-11-01T10:05:00.000Z'},
    readiness: {ready: false},
  });
  assert.deepEqual(unreadyEvidence.retainedObligations, []);
  const unreadyLedger = createContainerLedger();
  const unreadyDeployment = {
    ...tidbClusterArmOf(unreadyLedger, {persistent: true}),
    operations: {awaitReady: async () => ({ready: false})},
  };
  const unreadySsh = createScriptedSsh([
    ...dockerRules(unreadyLedger),
    restartRuleForLedger(unreadyLedger),
  ]);
  const unreadyResult = await createSemanticGateStage({
    journey: async () => ({status: 'incomplete'}),
    sshRun: unreadySsh.sshRun,
    opts: {},
    createMysqlConnection: createTransactionalOltpStore().createMysqlConnection,
    evidenceDirOf: () => null,
    now: () => 0,
    redeploy: async () => unreadyDeployment,
  })({
    run: {runId: 'r-tidb-unready', system: 'tidb-tikv'},
    manifest: {campaignId: 'camp-unready'},
    deployment: unreadyDeployment,
  });
  const unreadyDurability = arrayFind(unreadyResult.gate.cases, (c) => c.caseId === 'durability');
  assert.equal(unreadyDurability.status, 'failed');
  assert.equal(unreadyDurability.failureKind, 'evidence_insufficient');
  assert.deepEqual(unreadyDurability.failureReasons, ['storage_continuity_invalid']);
  assert.equal(typeof evaluateScenarioADurabilityObservation, 'function');
});

// Coordinator decision 4 (2026-11-02): the journey learns whether the arm's
// data lives on persistent storage (every data directory a host volume);
// durability on container-layer storage is probe_inapplicable.
test('the journey is told whether the arm\'s storage is persistent', async () => {
  const ledger = createContainerLedger();
  const {sshRun} = createScriptedSsh([...dockerRules(ledger)]);
  const seen = [];
  const stage = createSemanticGateStage({
    journey: async ({persistentStorage}) => {
      seen.push(persistentStorage);
      return {status: 'incomplete'};
    },
    sshRun,
    opts: {},
    evidenceDirOf: () => '/tmp/ev',
    now: () => 0,
    redeploy: async () => {},
  });
  for (const kinds of [['container-layer'], ['host-volume', 'container-layer'],
    ['host-volume', 'host-volume'], []]) {
    const deployment = {...armOf(ledger, 0), storage: arrayMap(kinds, (kind) => ({kind}))};
    await stage({
      run: {runId: 'r', system: 'postgresql'},
      manifest: {campaignId: 'c'},
      deployment,
    });
  }
  assert.deepEqual(seen, [false, false, true, false]);
});

test('HOLD-4 adversarial readiness, unparseable startedAt, and Object.prototype pollution ' +
  'fail closed while real composite deployers stay accepted', async () => {
  const ledger = createContainerLedger();
  const baseDeployment = armOf(ledger, 0, {persistent: true});
  const baseProduct = baseDeployment.identity.products[0];
  const beforeProduct = {...baseProduct, startedAt: '2026-11-01T10:00:00.000Z'};
  const afterProduct = {...baseProduct, startedAt: '2026-11-01T10:05:00.000Z'};
  const target = {host: '10.0.0.1', containerId: baseProduct.containerId};

  // [HOLD-4A] Real composite awaitReady() shapes succeed:
  const acceptedReadinessShapes = [
    {state: 'ready'},
    {ready: true},
    {
      cluster: {state: 'ready', component: 'lagrange-system-tables', attempts: 1},
      probe: {state: 'ready', component: 'lagrange-probe-write-readback', attempts: 1},
    },
    {
      pd: {state: 'ready', component: 'tidb-pd', attempts: 1},
      sql: {attempts: 1, sql: 'SELECT 1;', clientContainerId: 'c'.repeat(64)},
    },
    {
      servers: [{state: 'ready', component: 'postgres-primary@10.0.0.1', attempts: 1}],
      streaming: {state: 'ready', component: 'postgres-streaming-standbys', attempts: 1},
    },
  ];
  for (const readiness of acceptedReadinessShapes) {
    const evidence = buildObservedFaultEvidence({
      deployment: baseDeployment, target, beforeProduct, afterProduct, readiness,
    });
    assert.deepEqual(evidence.retainedObligations,
      ['committed_payment_rows', 'full_oltp_state_sha256']);
  }

  // [HOLD-4A] Empty, inherited, or nested-exhausted readiness shapes withhold retainedObligations:
  const rejectedReadinessShapes = [
    {},
    [],
    Object.create({state: 'ready', ready: true}),
    {pd: {state: 'exhausted'}},
    {pd: {state: 'ready'}, sql: {state: 'exhausted'}},
    {servers: [{state: 'exhausted'}]},
    {servers: []},
  ];
  for (const readiness of rejectedReadinessShapes) {
    const evidence = buildObservedFaultEvidence({
      deployment: baseDeployment, target, beforeProduct, afterProduct, readiness,
    });
    assert.deepEqual(evidence.retainedObligations, []);
    const badLedger = createContainerLedger();
    const badDeployment = tidbClusterArmOf(badLedger, {
      persistent: true,
      readinessResult: readiness,
    });
    const badSsh = createScriptedSsh([
      ...dockerRules(badLedger),
      restartRuleForLedger(badLedger),
    ]);
    const badResult = await createSemanticGateStage({
      journey: async () => ({status: 'incomplete'}),
      sshRun: badSsh.sshRun,
      opts: {},
      createMysqlConnection: createTransactionalOltpStore().createMysqlConnection,
      evidenceDirOf: () => null,
      now: () => 0,
      redeploy: async () => badDeployment,
    })({
      run: {runId: 'r-tidb-bad-ready', system: 'tidb-tikv'},
      manifest: {campaignId: 'camp-bad-ready'},
      deployment: badDeployment,
    });
    const durCase = arrayFind(badResult.gate.cases, (c) => c.caseId === 'durability');
    assert.equal(durCase.status, 'failed');
    assert.equal(durCase.failureKind, 'evidence_insufficient');
    assert.deepEqual(durCase.failureReasons, ['storage_continuity_invalid']);
  }

  // [HOLD-4B] Unparseable startedAt fails closed on incarnation advancement:
  for (const [badBefore, badAfter] of [
    ['not-a-timestamp', '2026-11-01T10:05:00.000Z'],
    ['2026-11-01T10:00:00.000Z', 'not-a-timestamp'],
    ['not-a-timestamp', 'also-not-a-timestamp'],
  ]) {
    const badTsEvidence = buildObservedFaultEvidence({
      deployment: baseDeployment,
      target,
      beforeProduct: {...baseProduct, startedAt: badBefore},
      afterProduct: {...baseProduct, startedAt: badAfter},
      readiness: {ready: true},
    });
    assert.equal(badTsEvidence.afterIncarnation, null);
  }
  const nanLedger = createContainerLedger();
  const nanDeployment = tidbClusterArmOf(nanLedger, {persistent: true});
  const nanSsh = createScriptedSsh([
    ...dockerRules(nanLedger),
    restartRuleForLedger(nanLedger, {
      advanceClock: false,
      onRestart: (rawId) => {
        nanLedger.containers.get(rawId).startedAt = 'not-a-timestamp';
      },
    }),
  ]);
  const nanResult = await createSemanticGateStage({
    journey: async () => ({status: 'incomplete'}),
    sshRun: nanSsh.sshRun,
    opts: {},
    createMysqlConnection: createTransactionalOltpStore().createMysqlConnection,
    evidenceDirOf: () => null,
    now: () => 0,
    redeploy: async () => nanDeployment,
  })({
    run: {runId: 'r-tidb-nan-ts', system: 'tidb-tikv'},
    manifest: {campaignId: 'camp-nan-ts'},
    deployment: nanDeployment,
  });
  const nanDurability = arrayFind(nanResult.gate.cases, (c) => c.caseId === 'durability');
  assert.equal(nanDurability.status, 'failed');
  assert.equal(nanDurability.failureKind, 'evidence_insufficient');
  assert.deepEqual(nanDurability.failureReasons, ['fault_incarnation_unchanged']);

  // [HOLD-4C] Object.prototype.targetRole = 'tidb' cannot hijack restartProduct({}):
  const protoLedger = createContainerLedger();
  const protoDeployment = tidbClusterArmOf(protoLedger, {persistent: true});
  const protoSsh = createScriptedSsh([
    ...dockerRules(protoLedger),
    restartRuleForLedger(protoLedger),
  ]);
  const inherited = Object.getPrototypeOf({});
  Object.defineProperty(inherited, 'targetRole', {
    value: 'tidb',
    configurable: true,
    writable: true,
    enumerable: true,
  });
  try {
    const protoResult = await createSemanticGateStage({
      journey: async () => ({status: 'incomplete'}),
      sshRun: protoSsh.sshRun,
      opts: {},
      createMysqlConnection: createTransactionalOltpStore().createMysqlConnection,
      evidenceDirOf: () => null,
      now: () => 0,
      redeploy: async () => protoDeployment,
    })({
      run: {runId: 'r-tidb-proto', system: 'tidb-tikv'},
      manifest: {campaignId: 'camp-proto'},
      deployment: protoDeployment,
    });
    const restartEvents = arrayFilter(protoResult.events, (e) => e.kind === 'product-restart');
    assert.equal(restartEvents.length, 1);
    assert.equal(restartEvents[0].role, 'tikv');
    const protoDurability = arrayFind(protoResult.gate.cases, (c) => c.caseId === 'durability');
    assert.equal(protoDurability.status, 'passed');
  } finally {
    delete inherited.targetRole;
  }
});
