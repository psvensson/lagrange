#!/usr/bin/env node

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

import {
  buildOltpBaselineDataset,
  hashOltpBaselineDataset,
} from '../../test/distributed/harness/oltp-baseline-dataset.js';
import {
  OLTP_OPERATION_KIND,
} from '../../test/distributed/harness/oltp-baseline-workload.js';
import {
  OLTP_SQL_STATEMENT,
} from '../../test/distributed/harness/oltp-baseline-transaction-executor.js';
import {
  LAGRANGE_OLTP_SQL,
  createLagrangeOltpAdapter,
} from '../../test/distributed/reference-client/lagrange-oltp-adapter.js';

const objectFreeze = Object.freeze;
const objectKeys = Object.keys;
const objectValues = Object.values;
const objectEntries = Object.entries;
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arraySome = Function.call.bind(Array.prototype.some);
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySlice = Function.call.bind(Array.prototype.slice);

const ONE = 1;
const ADAPTER_PATH = 'test/distributed/reference-client/lagrange-oltp-adapter.js';
const PASS_LINE = 'lagrange-oltp-adapter-guard: PASS\n';
const ENCODING_UTF8 = 'utf8';

const MSG_SQL_CONTRACT = 'Lagrange adapter must implement every shared OLTP statement';
const MYSQL_PLACEHOLDER = '?';
const MYSQL_QUOTE = '`';
const PROTOCOL_POSTGRESQL = 'postgresql';
const EXECUTION_PATH_PUBLIC_SQL = 'public-sql';
const LOCKING_MODE_CONFLICT = 'snapshot-write-conflict';
const MSG_CLIENT_COUNT_INITIAL = 'setup plus exactly two worker clients expected';
const MSG_CLIENT_REUSE = 'evidence must reuse an existing worker client';
const MSG_CLIENT_CLEANUP = 'cleanup must use one public SQL client';
const ERROR_CLIENT_NOT_ALLOWED = 'client must not be created';

const CLIENT_COUNT_INITIAL = 3;
const CLIENT_COUNT_CLOSED = 4;
const WORKER_CLIENT_INDEX = 1;
const CLEANUP_CLIENT_INDEX = 3;
const PAYMENT_QUERY_COUNT = 6;
const EXPECTED_TABLE_COUNT = 9;

const ENDPOINT_HOST = '127.0.0.1';
const ENDPOINT_PORT = 5432;
const BENCHMARK_USER = 'benchmark';
const BENCHMARK_DATABASE = 'benchmark';

const PHASE_MEASUREMENT = 'measurement';
const PAYMENT_AMOUNT_CENTS = 1250;
const SQL_BEGIN = 'BEGIN';
const SQL_COMMIT = 'COMMIT';
const SQL_PREFIX_CREATE_TABLE = 'CREATE TABLE ';
const SQL_PREFIX_DROP_TABLE = 'DROP TABLE IF EXISTS ';
const SQL_PREFIX_INSERT_WAREHOUSE = 'INSERT INTO warehouse ';
const SQL_PREFIX_INSERT_STOCK = 'INSERT INTO stock ';

const WORKER_SESSION_IDS = objectFreeze(['pgwire-worker-1', 'pgwire-worker-2']);
const EXPECTED_STATE_COUNTS = objectFreeze({
  orders: 0,
  newOrders: 0,
  orderLines: 0,
  history: 0,
});

const EXPECTED_PAYMENT_QUERIES = objectFreeze([
  SQL_BEGIN,
  LAGRANGE_OLTP_SQL[OLTP_SQL_STATEMENT.WAREHOUSE_PAYMENT],
  LAGRANGE_OLTP_SQL[OLTP_SQL_STATEMENT.DISTRICT_PAYMENT],
  LAGRANGE_OLTP_SQL[OLTP_SQL_STATEMENT.CUSTOMER_PAYMENT],
  LAGRANGE_OLTP_SQL[OLTP_SQL_STATEMENT.HISTORY_INSERT],
  SQL_COMMIT,
]);

const WORKLOAD = objectFreeze({
  seed: 12345,
  workers: 2,
  warmupOperationsPerWorker: 0,
  measurementOperationsPerWorker: 1,
  warehouseCount: 1,
  districtsPerWarehouse: 1,
  customersPerDistrict: 1,
  itemCount: 15,
});

function fakeClientFactory() {
  const clients = [];
  const createClient = (options) => {
    const queries = [];
    const client = {
      options,
      queries,
      connected: false,
      ended: false,
      async connect() {
        assert.equal(this.connected, false);
        this.connected = true;
      },
      async query(text, values = []) {
        assert.equal(this.connected, true);
        assert.equal(this.ended, false);
        queries.push({text, values: [...values]});
        if (/^SELECT COUNT\(\*\) AS row_count FROM /u.test(text)) {
          return {rows: [{row_count: '0'}], rowCount: 1};
        }
        return {rows: [], rowCount: 1};
      },
      async end() {
        assert.equal(this.connected, true);
        assert.equal(this.ended, false);
        this.ended = true;
      },
    };
    clients.push(client);
    return client;
  };
  return {clients, createClient};
}

function assertSqlContract() {
  assert.deepEqual(
    objectKeys(LAGRANGE_OLTP_SQL).sort(),
    objectValues(OLTP_SQL_STATEMENT).sort(),
    MSG_SQL_CONTRACT,
  );
  for (const [statementId, sql] of objectEntries(LAGRANGE_OLTP_SQL)) {
    assert.equal(stringIncludes(sql, MYSQL_PLACEHOLDER), false, `${statementId} used MySQL placeholders`);
    assert.equal(stringIncludes(sql, MYSQL_QUOTE), false, `${statementId} used MySQL quoting`);
    assert.equal(
      /\bFOR\s+UPDATE\b/iu.test(sql),
      false,
      `${statementId} pretended Lagrange currently owns locking reads`,
    );
    assert.match(sql, /\$1/u, `${statementId} did not use PostgreSQL parameters`);
  }
}

async function assertPublicSqlBoundary() {
  const source = await readFile(ADAPTER_PATH, ENCODING_UTF8);
  assert.match(source, /import pg from 'pg';/u);
  assert.doesNotMatch(source, /from ['"][^'"]*src\//u);
  assert.doesNotMatch(source, /ctx\.call/u);
  assert.doesNotMatch(source, /DB\.call/u);
  assert.doesNotMatch(source, /wasm-service/u);
  assert.doesNotMatch(source, /WasmCallAdapter/u);
}

async function assertAdapterLifecycle() {
  const fake = fakeClientFactory();
  const adapter = await createLagrangeOltpAdapter({
    endpoint: {host: ENDPOINT_HOST, port: ENDPOINT_PORT},
    connection: {user: BENCHMARK_USER, database: BENCHMARK_DATABASE},
    workload: WORKLOAD,
    createClient: fake.createClient,
  });

  assert.equal(adapter.protocol, PROTOCOL_POSTGRESQL);
  assert.equal(adapter.executionPath, EXECUTION_PATH_PUBLIC_SQL);
  assert.equal(adapter.lockingReadMode, LOCKING_MODE_CONFLICT);
  assert.equal(fake.clients.length, CLIENT_COUNT_INITIAL, MSG_CLIENT_COUNT_INITIAL);
  assert.deepEqual(adapter.workerSessionIds, WORKER_SESSION_IDS);
  assert.equal(
    adapter.datasetSha256,
    hashOltpBaselineDataset(buildOltpBaselineDataset(WORKLOAD)),
  );

  const setupClient = fake.clients[0];
  assert.equal(setupClient.ended, true);
  assert.equal(
    arrayFilter(setupClient.queries, ({text}) =>
      stringStartsWith(text, SQL_PREFIX_CREATE_TABLE)).length,
    EXPECTED_TABLE_COUNT,
  );
  assert.equal(
    arrayFilter(setupClient.queries, ({text}) =>
      stringStartsWith(text, SQL_PREFIX_DROP_TABLE)).length,
    EXPECTED_TABLE_COUNT,
  );
  assert.equal(
    arraySome(setupClient.queries, ({text}) =>
      stringStartsWith(text, SQL_PREFIX_INSERT_WAREHOUSE)),
    true,
  );
  assert.equal(
    arraySome(setupClient.queries, ({text}) =>
      stringStartsWith(text, SQL_PREFIX_INSERT_STOCK)),
    true,
  );

  await adapter.executeTransaction({
    kind: OLTP_OPERATION_KIND.PAYMENT,
    phase: PHASE_MEASUREMENT,
    workerId: 1,
    sequence: 1,
    warehouseId: 1,
    districtId: 1,
    customerWarehouseId: 1,
    customerDistrictId: 1,
    customerId: 1,
    amountCents: PAYMENT_AMOUNT_CENTS,
  });

  const worker = fake.clients[WORKER_CLIENT_INDEX];
  assert.deepEqual(
    arrayMap(arraySlice(worker.queries, 0, PAYMENT_QUERY_COUNT), ({text}) => text),
    EXPECTED_PAYMENT_QUERIES,
  );

  const evidence = await adapter.getEvidence();
  assert.equal(evidence.protocol, PROTOCOL_POSTGRESQL);
  assert.equal(evidence.executionPath, EXECUTION_PATH_PUBLIC_SQL);
  assert.equal(evidence.lockingReadMode, LOCKING_MODE_CONFLICT);
  assert.equal(evidence.datasetSha256, adapter.datasetSha256);
  assert.deepEqual(evidence.stateCounts, EXPECTED_STATE_COUNTS);
  assert.equal(fake.clients.length, CLIENT_COUNT_INITIAL, MSG_CLIENT_REUSE);

  await adapter.close();
  assert.equal(fake.clients.length, CLIENT_COUNT_CLOSED, MSG_CLIENT_CLEANUP);
  assert.equal(arrayEvery(fake.clients, ({ended}) => ended), true);
  assert.equal(
    arrayFilter(fake.clients[CLEANUP_CLIENT_INDEX].queries, ({text}) =>
      stringStartsWith(text, SQL_PREFIX_DROP_TABLE)).length,
    EXPECTED_TABLE_COUNT,
  );
}

async function assertFailClosedConfiguration() {
  await assert.rejects(
    createLagrangeOltpAdapter({
      endpoint: {host: ENDPOINT_HOST, port: ENDPOINT_PORT},
      connection: {database: BENCHMARK_DATABASE},
      workload: WORKLOAD,
      createClient() {
        throw new Error(ERROR_CLIENT_NOT_ALLOWED);
      },
    }),
    /requires connection\.user/u,
  );
  await assert.rejects(
    createLagrangeOltpAdapter({
      endpoint: {host: ENDPOINT_HOST, port: ENDPOINT_PORT},
      connection: {user: BENCHMARK_USER},
      workload: WORKLOAD,
      createClient() {
        throw new Error(ERROR_CLIENT_NOT_ALLOWED);
      },
    }),
    /requires connection\.database/u,
  );
}

async function main() {
  assertSqlContract();
  await assertPublicSqlBoundary();
  await assertAdapterLifecycle();
  await assertFailClosedConfiguration();
  process.stdout.write(PASS_LINE);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = ONE;
});
