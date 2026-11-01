// Drives the real comparative-benchmark workload driver entry
// (executeBenchmarkWorkload) against the controlled in-memory product of
// real-product-workload-driver-fake-product.js. Only the native client
// libraries (pg Client, mysql2 connection) and the watchdog timer are
// substituted; dispatch, adapters, executor, open-loop and retry owners,
// outcome classification and reconciliation are the production path.
// Evidence ceiling: classification/accounting of each response class, not
// native product behaviour.
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {
  executeBenchmarkWorkload,
} from '../real-product-workload-drivers.js';
import {
  FAKE_PRODUCT_FAULT,
  createFakeOltpProduct,
} from './real-product-workload-driver-fake-product.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);

const FIXTURE_WATCHDOG_MS = 300;
const FIXTURE_RATE_PER_SEC = 2000;
const TABLE_PATTERN = /\b(?:FROM|INTO|UPDATE|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)/giu;
const SYSTEM_BY_TARGET = Object.freeze({
  'lagrange': 'lagrange',
  'tidb-tikv': 'tidb-tikv',
  'pg-app': 'postgresql',
});
const ENDPOINT = Object.freeze({host: '10.0.0.7', port: 5432});
const CREDENTIALS = Object.freeze({user: 'bench', password: 'bench', database: 'bench'});

function tablesOfStatements(statements) {
  const tables = new Set();
  for (const sql of statements) {
    for (const match of String(sql).matchAll(TABLE_PATTERN)) tables.add(match[1]);
  }
  return [...tables].sort();
}

function fixtureTimer(callback) {
  const handle = setTimeout(callback, FIXTURE_WATCHDOG_MS);
  return () => clearTimeout(handle);
}

function connectionFor(system) {
  if (system === 'tidb-tikv') return {endpoint: ENDPOINT, databaseName: 'bench_fixture'};
  return {endpoint: ENDPOINT, credentials: CREDENTIALS};
}

function collectKeys(value, keys = new Set()) {
  if (!value || typeof value !== 'object') return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    collectKeys(child, keys);
  }
  return keys;
}

// The retained response evidence of every request, read while its directory
// exists: path -> the recorded attempts' statements.
function readRetainedEvidence(requests) {
  const retained = {};
  for (const {responseEvidence} of requests) {
    if (responseEvidence?.encoding === 'retained-file') {
      retained[responseEvidence.path] = JSON.parse(readFileSync(responseEvidence.path, 'utf8'));
    }
  }
  return retained;
}

function observe(output, product) {
  const observations = output.observations;
  const requests = observations?.requests || [];
  const classes = new Set(arrayMap(arrayFilter(requests, (r) => r.failureClass),
    (r) => r.failureClass));
  if (observations?.setup?.failureClass) classes.add(observations.setup.failureClass);
  return {
    output,
    product,
    dispatchStatus: output.dispatch.status,
    accounting: observations?.accounting ?? null,
    // A blocked dispatch or a run without a window has no latency summary at all.
    latencyCount: observations?.latency ? observations.latency.count : null,
    failureClasses: [...classes],
    outputKeys: [...collectKeys(output)],
    statements: [...product.state.statements],
    tables: tablesOfStatements(product.state.statements),
    healthRequests: 0,
    kinds: arrayMap(requests, (request) => request.operationKind),
    retainedEvidence: readRetainedEvidence(requests),
  };
}

async function runDriverCase({targetId, scenario, subkind, mode = FAKE_PRODUCT_FAULT.NONE}) {
  const product = createFakeOltpProduct(mode);
  const system = SYSTEM_BY_TARGET[targetId];
  const evidenceDir = mkdtempSync(path.join(tmpdir(), 'bench-driver-evidence-'));
  try {
    return observe(await executeBenchmarkWorkload({
      targetId,
      system,
      scenario,
      subkind,
      connection: connectionFor(system),
      plan: {offeredRatePerSec: FIXTURE_RATE_PER_SEC, repetition: 1, orderIndex: 0},
      drivers: {
        createPgClient: product.createPgClient,
        createMysqlConnection: product.createMysqlConnection,
      },
      runtime: {setWatchdogTimer: fixtureTimer},
      evidenceDir,
    }), product);
  } finally {
    rmSync(evidenceDir, {recursive: true, force: true});
  }
}

function workloadStatements(observed) {
  return observed.statements;
}

export {
  FAKE_PRODUCT_FAULT as DRIVER_FIXTURE_MODE,
  runDriverCase,
  tablesOfStatements,
  workloadStatements,
};
