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

const ADAPTER_PATH = 'test/distributed/reference-client/lagrange-oltp-adapter.js';
const PASS_LINE = 'lagrange-oltp-adapter-guard: PASS\n';
const WORKLOAD = Object.freeze({
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
    Object.keys(LAGRANGE_OLTP_SQL).sort(),
    Object.values(OLTP_SQL_STATEMENT).sort(),
    'Lagrange adapter must implement every shared OLTP statement',
  );
  for (const [statementId, sql] of Object.entries(LAGRANGE_OLTP_SQL)) {
    assert.equal(sql.includes('?'), false, `${statementId} used MySQL placeholders`);
    assert.equal(sql.includes('`'), false, `${statementId} used MySQL quoting`);
    assert.match(sql, /\$1/u, `${statementId} did not use PostgreSQL parameters`);
  }
}

async function assertPublicSqlBoundary() {
  const source = await readFile(ADAPTER_PATH, 'utf8');
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
    endpoint: {host: '127.0.0.1', port: 5432},
    connection: {user: 'benchmark', database: 'benchmark'},
    workload: WORKLOAD,
    createClient: fake.createClient,
  });

  assert.equal(adapter.protocol, 'postgresql');
  assert.equal(adapter.executionPath, 'public-sql');
  assert.equal(fake.clients.length, 3, 'setup plus exactly two worker clients expected');
  assert.deepEqual(adapter.workerSessionIds, ['pgwire-worker-1', 'pgwire-worker-2']);
  assert.equal(
    adapter.datasetSha256,
    hashOltpBaselineDataset(buildOltpBaselineDataset(WORKLOAD)),
  );

  const setupClient = fake.clients[0];
  assert.equal(setupClient.ended, true);
  assert.equal(
    setupClient.queries.filter(({text}) => text.startsWith('CREATE TABLE ')).length,
    9,
  );
  assert.equal(
    setupClient.queries.filter(({text}) => text.startsWith('DROP TABLE IF EXISTS ')).length,
    9,
  );
  assert.equal(
    setupClient.queries.some(({text}) => text.startsWith('INSERT INTO warehouse ')),
    true,
  );
  assert.equal(
    setupClient.queries.some(({text}) => text.startsWith('INSERT INTO stock ')),
    true,
  );

  await adapter.executeTransaction({
    kind: OLTP_OPERATION_KIND.PAYMENT,
    phase: 'measurement',
    workerId: 1,
    sequence: 1,
    warehouseId: 1,
    districtId: 1,
    customerWarehouseId: 1,
    customerDistrictId: 1,
    customerId: 1,
    amountCents: 1250,
  });

  const worker = fake.clients[1];
  assert.deepEqual(
    worker.queries.slice(0, 6).map(({text}) => text),
    [
      'BEGIN',
      LAGRANGE_OLTP_SQL[OLTP_SQL_STATEMENT.WAREHOUSE_PAYMENT],
      LAGRANGE_OLTP_SQL[OLTP_SQL_STATEMENT.DISTRICT_PAYMENT],
      LAGRANGE_OLTP_SQL[OLTP_SQL_STATEMENT.CUSTOMER_PAYMENT],
      LAGRANGE_OLTP_SQL[OLTP_SQL_STATEMENT.HISTORY_INSERT],
      'COMMIT',
    ],
  );

  const evidence = await adapter.getEvidence();
  assert.equal(evidence.protocol, 'postgresql');
  assert.equal(evidence.executionPath, 'public-sql');
  assert.equal(evidence.datasetSha256, adapter.datasetSha256);
  assert.deepEqual(evidence.stateCounts, {
    orders: 0,
    newOrders: 0,
    orderLines: 0,
    history: 0,
  });
  assert.equal(fake.clients.length, 3, 'evidence must reuse an existing worker client');

  await adapter.close();
  assert.equal(fake.clients.length, 4, 'cleanup must use one public SQL client');
  assert.equal(fake.clients.every(({ended}) => ended), true);
  assert.equal(
    fake.clients[3].queries.filter(({text}) =>
      text.startsWith('DROP TABLE IF EXISTS ')).length,
    9,
  );
}

async function assertFailClosedConfiguration() {
  await assert.rejects(
    createLagrangeOltpAdapter({
      endpoint: {host: '127.0.0.1', port: 5432},
      connection: {database: 'benchmark'},
      workload: WORKLOAD,
      createClient() {
        throw new Error('client must not be created');
      },
    }),
    /requires connection\.user/u,
  );
  await assert.rejects(
    createLagrangeOltpAdapter({
      endpoint: {host: '127.0.0.1', port: 5432},
      connection: {user: 'benchmark'},
      workload: WORKLOAD,
      createClient() {
        throw new Error('client must not be created');
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
  process.exitCode = 1;
});
