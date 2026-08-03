#!/usr/bin/env node

import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {
  PostgresWireAdapter,
} from '../../src/query/pg/postgres-wire-adapter.js';
import {
  PGWIRE_AUTH_ACTION,
  PGWIRE_AUTH_HANDLER_MODE,
} from '../../src/runtime/pgwire-auth-constants.js';
import {PgWireAuthHandler} from
  '../../src/runtime/pgwire-auth-handler.js';
import {
  buildPgwireCredentialVerifier,
} from '../../src/runtime/pgwire-credential-verifier.js';
import {CallBindingRouteResolver} from
  '../../src/service/call-binding-route-resolver.js';
import {
  bootExampleNode,
  EXAMPLE_NODE,
} from '../request-binding-deployment/request-binding-example-node.js';
import {
  executeSql,
} from '../request-binding-deployment/run-request-binding-deployment.js';
import {
  CALL_EXAMPLE,
  buildCallBindingPayload,
  buildCallComponent,
  buildCallInstallPayload,
  buildCallManifest,
} from './call-binding-example-contract.js';

const EXAMPLE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const TEMPORARY_PREFIX = 'lagrange-call-binding-account-summary-';
const NODE_DATA_DIRECTORY = 'node-data';
const EXAMPLE_WS_PORT = 18_782;
const CALL_SESSION = 'account-summary-call-session';
const DENIED_SESSION = 'account-summary-denied-session';
const LOCAL_STR_STRING = 'string';
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 200;
const SPLIT_TIMEOUT_MS = 60_000;
const SHUTDOWN_BOUND_MS = 20_000;
const EXPECTED_PARTITION_COUNT = 2;
const ACCOUNT_IDS = Object.freeze([101, 202, 303]);
const ROW_COUNT = 150;
const AMOUNT_MODULUS = 19_000;
const AMOUNT_FLOOR_CENTS = 250;
const FLAGGED_THRESHOLD_CENTS = 17_000;
const SUMMARY_ACCOUNT_ID = 202;
const SECOND_ACCOUNT_ID = 303;
const TABLE_DDL =
  'CREATE TABLE account_activity (id INTEGER PRIMARY KEY, ' +
  'account_id INTEGER, amount_cents INTEGER, flagged INTEGER)';
const ROW_INSERT =
  'INSERT INTO account_activity (id, account_id, amount_cents, flagged) ' +
  'VALUES ($1, $2, $3, $4)';

// Deterministic synthetic ledger: ids interleave the three accounts so
// every partition ends up holding rows for every account, and the split
// boundary (the id median) never aligns with an account boundary.
function generateLedgerRows() {
  const rows = [];
  for (let id = 1; id <= ROW_COUNT; id += 1) {
    const amountCents = ((id * 7919) % AMOUNT_MODULUS) + AMOUNT_FLOOR_CENTS;
    rows.push({
      accountId: ACCOUNT_IDS[id % ACCOUNT_IDS.length],
      amountCents,
      flagged: amountCents > FLAGGED_THRESHOLD_CENTS ? 1 : 0,
      id,
    });
  }
  return rows;
}

// The runner-side oracle: the same summary the service computes, derived
// directly from the generated rows without touching the call path.
function expectedSummary(rows, accountId, contributingShards) {
  const matching = rows.filter((row) => row.accountId === accountId);
  const totalCents = matching.reduce((sum, row) => sum + row.amountCents, 0);
  return {
    accountId,
    contributingShards,
    flagged: matching.filter((row) => row.flagged === 1).length,
    largestCents: Math.max(...matching.map((row) => row.amountCents)),
    meanCents: Math.round(totalCents / matching.length),
    totalCents,
    transactions: matching.length,
  };
}

const RUN_STARTED_AT = Date.now();

function logPhase(message) {
  const elapsedSeconds = ((Date.now() - RUN_STARTED_AT) / 1000).toFixed(1);
  process.stderr.write(`[${elapsedSeconds}s] ${message}\n`);
}

async function waitFor(conditionFn, timeoutMs, pollMs, failureMessage) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await conditionFn();
    if (value) return value;
    if (Date.now() >= deadline) throw new Error(failureMessage);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

async function seedLedger(node, rows) {
  // Single-node demo scaffolding: one replica per partition so the managed
  // split's admission quorum is satisfiable on one node. A real cluster
  // keeps the replicated default and splits by table policy instead.
  node.sqlAdapter.sqlCore.tableCreationService.defaultReplicaCount = 1;
  await executeSql(node, TABLE_DDL);
  for (const row of rows) {
    await executeSql(node, ROW_INSERT, [
      row.id, row.accountId, row.amountCents, row.flagged,
    ]);
  }
  const engine = node.sqlAdapter.sqlCore;
  const partitions = engine.getTablePartitions(CALL_EXAMPLE.TABLE) || [];
  assert.equal(partitions.length, 1, JSON.stringify(partitions));
  const partitionId = partitions[0].partition_id || partitions[0].partitionId;
  assert.equal(typeof partitionId, LOCAL_STR_STRING, 'partition id');
  return {partitionId};
}

// Splits the table's single initial partition on its id median so the
// ledger genuinely spans two partitions. Production splits by table
// policy (split_storage_threshold) as data grows; the example forces one
// split so a laptop-sized dataset exercises the same fan-out.
async function splitLedgerPartition(node, sourcePartitionId) {
  const engine = node.sqlAdapter.sqlCore;
  await engine.executeManagedSplit(sourcePartitionId);
  return waitFor(
    () => {
      const partitions = engine.getTablePartitions(CALL_EXAMPLE.TABLE) || [];
      return partitions.length >= EXPECTED_PARTITION_COUNT ?
        partitions :
        null;
    },
    SPLIT_TIMEOUT_MS,
    READY_POLL_MS,
    'ledger partition split did not become routable',
  );
}

async function deploy(node, receipt) {
  const manifest = buildCallManifest(receipt);
  const installed = await executeSql(
    node,
    'INSTALL SERVICE $1',
    [JSON.stringify(buildCallInstallPayload(manifest, receipt))],
  );
  const packageId = installed.rows?.[0]?.package_id;
  assert.equal(typeof packageId, LOCAL_STR_STRING);
  const binding = buildCallBindingPayload(packageId, manifest);
  const created = await executeSql(
    node,
    'CREATE BINDING $1',
    [JSON.stringify(binding)],
  );
  return {
    binding,
    bindingReceipt: created.rows[0],
    installReceipt: installed.rows[0],
    manifest,
  };
}

function exampleSecurityContext() {
  return Object.freeze({
    principal: EXAMPLE_NODE.USER,
    roles: Object.freeze(['application']),
    tenantId: EXAMPLE_NODE.DATABASE,
  });
}

async function waitForReadyCallCell(node) {
  const routeResolver = new CallBindingRouteResolver({
    systemTableCacheProvider: () => node.bootstrapService.systemTableCache,
  });
  const securityContext = exampleSecurityContext();
  return waitFor(
    () => {
      try {
        return routeResolver.resolve({
          invocationId: 'account-summary-readiness',
          name: CALL_EXAMPLE.BINDING_NAME,
          securityContext,
        });
      } catch {
        return null;
      }
    },
    READY_TIMEOUT_MS,
    READY_POLL_MS,
    'call Cell did not become ready',
  );
}

// A second authenticated pgwire session scoped to the one action the
// caller needs: pgwire.binding.call. Password mode is required - CALL
// BINDING is not in the trust-mode action set.
async function createCallerAdapter(node, sessionId, allowedActions) {
  const authHandler = new PgWireAuthHandler({
    authenticator: buildPgwireCredentialVerifier({
      PGWIRE_AUTH_DATABASE: EXAMPLE_NODE.DATABASE,
      PGWIRE_AUTH_PASSWORD: EXAMPLE_NODE.PASSWORD,
      PGWIRE_AUTH_USER: EXAMPLE_NODE.USER,
    }),
    logger: Object.freeze({debug() {}, error() {}, info() {}, warn() {}}),
    mode: PGWIRE_AUTH_HANDLER_MODE.PASSWORD,
    policy: {allowedActions: new Set(allowedActions)},
  });
  const adapter = new PostgresWireAdapter({
    authHandler,
    logger: Object.freeze({debug() {}, error() {}, info() {}, warn() {}}),
    sqlCore: node.sqlAdapter.sqlCore,
  });
  await adapter.authenticate(sessionId, {
    password: EXAMPLE_NODE.PASSWORD,
    tenantId: EXAMPLE_NODE.DATABASE,
    user: EXAMPLE_NODE.USER,
  });
  return adapter;
}

async function summarizeAccount(callerAdapter, accountId) {
  const result = await callerAdapter.execute(
    CALL_SESSION,
    'CALL BINDING $1',
    [JSON.stringify({
      arguments: {accountId},
      name: CALL_EXAMPLE.BINDING_NAME,
      schema_version: 2,
    })],
  );
  assert.equal(result.success, true, JSON.stringify(result));
  assert.equal(result.rows.length, 1);
  return JSON.parse(result.rows[0].result);
}

async function exerciseDeployment(node, rows, partitions) {
  await waitForReadyCallCell(node);
  const callerAdapter = await createCallerAdapter(
    node,
    CALL_SESSION,
    [PGWIRE_AUTH_ACTION.BINDING_CALL],
  );

  const summary = await summarizeAccount(callerAdapter, SUMMARY_ACCOUNT_ID);
  assert.deepEqual(
    summary,
    expectedSummary(rows, SUMMARY_ACCOUNT_ID, partitions.length),
  );
  const secondSummary = await summarizeAccount(
    callerAdapter,
    SECOND_ACCOUNT_ID,
  );
  assert.deepEqual(
    secondSummary,
    expectedSummary(rows, SECOND_ACCOUNT_ID, partitions.length),
  );

  // Fail-closed authentication: a session without pgwire.binding.call is
  // refused at the auth boundary, before any dispatch.
  const deniedAdapter = await createCallerAdapter(
    node,
    DENIED_SESSION,
    [PGWIRE_AUTH_ACTION.EXECUTE_QUERY],
  );
  const denied = await deniedAdapter.execute(
    DENIED_SESSION,
    'CALL BINDING $1',
    [JSON.stringify({
      name: CALL_EXAMPLE.BINDING_NAME,
      schema_version: 2,
    })],
  ).then(() => null, (error) => error);
  assert.ok(denied, 'expected the unauthorized CALL to reject');
  assert.match(String(denied.message), /authorized/iu);

  return {
    denied: {message: String(denied.message), rejected: true},
    secondSummary,
    summary,
  };
}

async function runCallBindingAccountSummaryExample(options = {}) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), TEMPORARY_PREFIX));
  let node = null;
  try {
    const paths = {
      componentPath: path.join(temporaryRoot, CALL_EXAMPLE.COMPONENT_FILE),
      componentSourcePath: path.join(
        EXAMPLE_DIRECTORY,
        CALL_EXAMPLE.COMPONENT_SOURCE_FILE,
      ),
      ociOutputRoot: path.join(temporaryRoot, 'oci-layouts'),
    };
    logPhase('componentizing service.js against the call-cell world');
    const receipt = await buildCallComponent(paths);
    logPhase('booting the disposable local node');
    node = await bootExampleNode(
      path.join(temporaryRoot, NODE_DATA_DIRECTORY),
      {wsPort: options.wsPort ?? EXAMPLE_WS_PORT},
    );
    const rows = generateLedgerRows();
    logPhase(`seeding ${rows.length} ledger rows`);
    const created = await seedLedger(node, rows);
    logPhase('splitting the ledger partition on its id median');
    const partitions = await splitLedgerPartition(node, created.partitionId);
    logPhase('INSTALL SERVICE + CREATE BINDING');
    const deployment = await deploy(node, receipt);
    logPhase('waiting for the call Cell, then invoking CALL BINDING');
    const observations = await exerciseDeployment(node, rows, partitions);
    logPhase('all checks passed; shutting down');
    const report = {
      artifact: {
        buildInputFingerprint: receipt.buildInputFingerprint,
        componentSource: path.relative(process.cwd(), paths.componentSourcePath),
        manifestDigest: deployment.binding.target.manifest_digest,
        ociManifestDigest: receipt.topManifestDescriptor.digest,
        packageId: deployment.binding.target.package_id,
      },
      binding: {
        exportName: deployment.binding.target.export_name,
        name: deployment.binding.name,
        statement: deployment.binding.source.statement,
      },
      ledger: {
        partitions: partitions.map((partition) =>
          partition.partition_id || partition.partitionId),
        rows: rows.length,
      },
      observations,
      passed: true,
    };
    if (options.print !== false) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    }
    return report;
  } finally {
    // The forced partition split leaves background retry/cleanup timers
    // on the demo node, so graceful shutdown is raced against a bound and
    // the direct-run entrypoint exits explicitly below.
    await Promise.race([
      Promise.resolve(node?.shutdown?.()).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, SHUTDOWN_BOUND_MS)),
    ]);
    await rm(temporaryRoot, {force: true, recursive: true});
  }
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    await runCallBindingAccountSummaryExample();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

export {
  runCallBindingAccountSummaryExample,
};
