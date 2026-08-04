#!/usr/bin/env node

import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {RUNTIME_KIND} from '../../src/constants/index.js';
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
  buildDeploymentRecords,
  componentizeService,
  normalizeServiceSource,
} from '../../src/service/index.js';
import {
  createInvocationIdentity,
} from '../../src/service/request-cell-routing-contract.js';
import {
  ServiceLocalOciLayoutBuilder,
} from '../../src/service/service-local-oci-layout-builder.js';
import {
  bootExampleNode,
  EXAMPLE_NODE,
} from '../request-binding-deployment/request-binding-example-node.js';
import {
  executeSql,
  waitForReadyCell,
} from '../request-binding-deployment/run-request-binding-deployment.js';

// The whole deployment surface is now COMPILED from lagrange.service.js:
// the generated entry statically imports that developer module, the
// shared componentize owner builds it, and buildDeploymentRecords derives
// the manifest, both request Bindings, the one call Binding, and the
// outbound-call policy. No hand-authored deployment builder and no raw
// Binding-name literal survive - the compiler owns the durable names.
const EXAMPLE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_ENTRY_PATH = path.join(EXAMPLE_DIRECTORY, 'generated-entry.js');
const SERVICE_MODULE_URL =
  pathToFileURL(path.join(EXAMPLE_DIRECTORY, 'lagrange.service.js')).href;

const SERVICE = Object.freeze({
  COMPONENT_FILE: 'component.wasm',
  HTTP_METHOD: 'POST',
  HTTP_PATH: '/accounts/summary',
  HEALTH_METHOD: 'GET',
  HEALTH_PATH: '/accounts/health',
  IDEMPOTENCY_KEY: 'install-call-binding-account-summary-v2',
  PLATFORM: 'linux/amd64',
  REF: 'registry.example.test/examples/account-summary:1.0.0',
  SOURCE_DATE_EPOCH: 1_700_000_000,
  TABLE: 'account_activity',
});

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
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_FORBIDDEN = 403;
const CONTENT_TYPE_HEADER = 'content-type';
const JSON_CONTENT_TYPE = 'application/json';
const REQUEST_CELL_DEADLINE_MS = 30_000;
const UNDECLARED_TARGET = 'not-declared';
const TARGET_NOT_ALLOWED_CODE = 'target_not_allowed';
const REPLAY_IDEMPOTENCY_KEY = 'account-summary-replay-1';
const CHILD_CALL_SUFFIX = '#call-1';
const REPLAY_OBSERVABILITY_SESSION = 'account-summary-replay-observation';
const REDUCE_RESULTS_SELECT =
  'SELECT result_id FROM call_cell_reduce_results';
const TABLE_DDL =
  'CREATE TABLE account_activity (id INTEGER PRIMARY KEY, ' +
  'account_id INTEGER, amount_cents INTEGER, flagged INTEGER)';
const ROW_INSERT =
  'INSERT INTO account_activity (id, account_id, amount_cents, flagged) ' +
  'VALUES ($1, $2, $3, $4)';
const SOURCE_KIND_CALL = 'call';
const SOURCE_KIND_REQUEST = 'request';

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

// Compile lagrange.service.js into one immutable component through the
// shared componentize owner, then publish it as a verified OCI layout.
async function buildServiceComponent(paths) {
  const {component} = await componentizeService({
    sourcePath: GENERATED_ENTRY_PATH,
  });
  await writeFile(paths.componentPath, component);
  return new ServiceLocalOciLayoutBuilder().build({
    outputRoot: paths.ociOutputRoot,
    platform: SERVICE.PLATFORM,
    runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
    sourceDateEpoch: SERVICE.SOURCE_DATE_EPOCH,
    wasm: {payloadPath: paths.componentPath},
  });
}

// Derive the deployment records from the developer module and the build
// receipt's artifact descriptor. These records - not any hand-built
// payload - are what gets installed and bound.
async function buildRecords(receipt) {
  const normalized = await normalizeServiceSource(SERVICE_MODULE_URL);
  assert.equal(normalized.status, 'accepted',
    JSON.stringify(normalized.errors));
  const result = buildDeploymentRecords({
    artifact: {
      digest: receipt.topManifestDescriptor.digest,
      ref: SERVICE.REF,
      sizeBytes: receipt.topManifestDescriptor.sizeBytes,
    },
    ir: normalized.ir,
  });
  assert.equal(result.status, 'accepted', JSON.stringify(result.errors));
  return result.records;
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
  const partitions = engine.getTablePartitions(SERVICE.TABLE) || [];
  assert.equal(partitions.length, 1, JSON.stringify(partitions));
  const partitionId = partitions[0].partition_id || partitions[0].partitionId;
  assert.equal(typeof partitionId, LOCAL_STR_STRING, 'partition id');
  return {partitionId};
}

// Splits the table's single initial partition on its id median so the
// ledger genuinely spans two partitions.
async function splitLedgerPartition(node, sourcePartitionId) {
  const engine = node.sqlAdapter.sqlCore;
  await engine.executeManagedSplit(sourcePartitionId);
  return waitFor(
    () => {
      const partitions = engine.getTablePartitions(SERVICE.TABLE) || [];
      return partitions.length >= EXPECTED_PARTITION_COUNT ?
        partitions :
        null;
    },
    SPLIT_TIMEOUT_MS,
    READY_POLL_MS,
    'ledger partition split did not become routable',
  );
}

// Substitute the real INSTALL-returned package id into a generated
// binding's placeholder target, keeping the rest of the normalized record
// verbatim (re-normalization by the SQL grammar is idempotent).
function withPackageId(binding, packageId) {
  return {
    budgets: {...binding.budgets},
    name: binding.name,
    schema_version: binding.schema_version,
    source: {...binding.source},
    target: {...binding.target, package_id: packageId},
  };
}

// One INSTALL of the generated manifest, one CREATE BINDING per generated
// binding (both request routes and the call), and one CONFIGURE SERVICE
// ACCESS per generated access policy. The example does not re-implement
// any deployment contract - it replays the compiler's records.
async function deploy(node, receipt, records) {
  const installed = await executeSql(
    node,
    'INSTALL SERVICE $1',
    [JSON.stringify({
      artifact_source: {kind: 'local_oci_layout', location: receipt.layoutPath},
      config: {},
      idempotency_key: SERVICE.IDEMPOTENCY_KEY,
      manifest: records.manifest,
    })],
  );
  const packageId = installed.rows?.[0]?.package_id;
  assert.equal(typeof packageId, LOCAL_STR_STRING);
  const bindingsByKind = {call: [], request: []};
  for (const binding of records.bindings) {
    const payload = withPackageId(binding, packageId);
    const created = await executeSql(
      node, 'CREATE BINDING $1', [JSON.stringify(payload)]);
    bindingsByKind[binding.source.kind].push({payload, receipt: created.rows[0]});
  }
  for (const policy of records.accessPolicies) {
    await executeSql(
      node, 'CONFIGURE SERVICE ACCESS $1', [JSON.stringify(policy)]);
  }
  // Every request Binding needs a runtime access policy for its request
  // Cell to be admitted (fail-closed: policy_not_found is a denial). The
  // compiler emits one only where there are outbound calls to authorize,
  // so deployment completes the coverage with an empty (no-calls,
  // no-tables) policy for any request Binding the records left uncovered -
  // through the same CONFIGURE SERVICE ACCESS grammar, no owner bypass.
  const policiedBindings = new Set(
    records.accessPolicies.map((policy) => policy.binding_name));
  for (const {payload} of bindingsByKind[SOURCE_KIND_REQUEST]) {
    if (policiedBindings.has(payload.name)) continue;
    await executeSql(node, 'CONFIGURE SERVICE ACCESS $1', [JSON.stringify({
      binding_name: payload.name,
      calls: [],
      schema_version: 2,
      tables: [],
    })]);
  }
  const callBinding = bindingsByKind[SOURCE_KIND_CALL][0].payload;
  return {
    callBindingName: callBinding.name,
    installReceipt: installed.rows[0],
    manifestDigest: callBinding.target.manifest_digest,
    packageId,
    requestBindings: bindingsByKind[SOURCE_KIND_REQUEST].map((b) => b.payload),
  };
}

function basicAuthorization() {
  return `Basic ${Buffer.from(
    `${EXAMPLE_NODE.USER}:${EXAMPLE_NODE.PASSWORD}`,
  ).toString('base64')}`;
}

// Authenticated HTTP invocation of the deployed endpoint through the
// node's REST listener, preserving the raw response text so the replay
// check can assert byte-identical responses.
async function postAccountsSummary(node, body, options = {}) {
  const headers = {
    'accept': '*/*',
    'authorization': basicAuthorization(),
    'content-type': JSON_CONTENT_TYPE,
  };
  if (typeof options.idempotencyKey === LOCAL_STR_STRING) {
    headers['idempotency-key'] = options.idempotencyKey;
  }
  const response = await fetch(
    `${node.baseUrl}${SERVICE.HTTP_PATH}`,
    {body: JSON.stringify(body), headers, method: SERVICE.HTTP_METHOD},
  );
  return {
    contentType: response.headers.get(CONTENT_TYPE_HEADER) || '',
    status: response.status,
    text: await response.text(),
  };
}

// The second route on the SAME component: a GET served by method+path
// dispatch with no outbound call and no access policy.
async function getAccountsHealth(node) {
  const response = await fetch(
    `${node.baseUrl}${SERVICE.HEALTH_PATH}`,
    {
      headers: {'accept': '*/*', 'authorization': basicAuthorization()},
      method: SERVICE.HEALTH_METHOD,
    },
  );
  return {
    contentType: response.headers.get(CONTENT_TYPE_HEADER) || '',
    status: response.status,
    text: await response.text(),
  };
}

// Replay observability: the coordination system table holds exactly one
// atomically published result row per completed inner invocation, keyed
// by the system-owned child identity `<outer invocation id>#call-1`.
async function countChildResultRows(node, childInvocationId) {
  const result = await node.sqlAdapter.sqlCore.executeQuery(
    REDUCE_RESULTS_SELECT,
    [],
    {sessionId: REPLAY_OBSERVABILITY_SESSION},
  );
  assert.equal(result?.success, true, JSON.stringify(result));
  return (result.rows || []).filter(
    (row) => row.result_id === childInvocationId,
  ).length;
}

function exampleSecurityContext() {
  return Object.freeze({
    principal: EXAMPLE_NODE.USER,
    roles: Object.freeze(['application']),
    tenantId: EXAMPLE_NODE.DATABASE,
  });
}

async function waitForReadyCallCell(node, callBindingName) {
  const routeResolver = new CallBindingRouteResolver({
    systemTableCacheProvider: () => node.bootstrapService.systemTableCache,
  });
  const securityContext = exampleSecurityContext();
  return waitFor(
    () => {
      try {
        return routeResolver.resolve({
          invocationId: 'account-summary-readiness',
          name: callBindingName,
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

async function summarizeAccount(callerAdapter, callBindingName, accountId) {
  const result = await callerAdapter.execute(
    CALL_SESSION,
    'CALL BINDING $1',
    [JSON.stringify({
      arguments: {accountId},
      name: callBindingName,
      schema_version: 2,
    })],
  );
  assert.equal(result.success, true, JSON.stringify(result));
  assert.equal(result.rows.length, 1);
  return JSON.parse(result.rows[0].result);
}

// The composed HTTP surface: POST -> handle-request -> callBinding ->
// distributed run/reduce -> one HTTP JSON response, plus the refusal
// probe and the idempotent-replay proof.
async function exerciseHttpSurface(node, rows, partitions) {
  const oracle = expectedSummary(rows, SUMMARY_ACCOUNT_ID, partitions.length);

  logPhase('HTTP POST /accounts/summary through the composed path');
  const composed = await postAccountsSummary(node, {
    accountId: SUMMARY_ACCOUNT_ID,
  });
  assert.equal(composed.status, HTTP_STATUS_OK, JSON.stringify(composed));
  assert.ok(composed.contentType.includes(JSON_CONTENT_TYPE));
  assert.deepEqual(JSON.parse(composed.text), oracle);

  logPhase('GET /accounts/health through the second route on the same component');
  const health = await getAccountsHealth(node);
  assert.equal(health.status, HTTP_STATUS_OK, JSON.stringify(health));
  assert.deepEqual(JSON.parse(health.text), {
    service: 'account-summary',
    status: 'ok',
  });

  // Refusal probe: an undeclared target name is refused by the host's
  // durable outbound-call policy BEFORE dispatch; the component maps the
  // typed target_not_allowed failure to an honest 403.
  logPhase('refusal probe: undeclared target -> 403 before dispatch');
  const refused = await postAccountsSummary(node, {
    accountId: SUMMARY_ACCOUNT_ID,
    target: UNDECLARED_TARGET,
  });
  assert.equal(refused.status, HTTP_STATUS_FORBIDDEN,
    JSON.stringify(refused));
  const refusedBody = JSON.parse(refused.text);
  assert.equal(refusedBody.code, TARGET_NOT_ALLOWED_CODE);
  assert.equal(refusedBody.retryable, false);

  // Replay proof: the same Idempotency-Key returns the journaled outer
  // response byte for byte, and the inner distributed call has exactly
  // one published result row under its system-owned child identity.
  logPhase('replay proof: idempotent POST twice, inner call runs once');
  const childInvocationId = createInvocationIdentity(
    EXAMPLE_NODE.DATABASE,
    REPLAY_IDEMPOTENCY_KEY,
  ) + CHILD_CALL_SUFFIX;
  const first = await postAccountsSummary(
    node,
    {accountId: SUMMARY_ACCOUNT_ID},
    {idempotencyKey: REPLAY_IDEMPOTENCY_KEY},
  );
  assert.equal(first.status, HTTP_STATUS_OK, JSON.stringify(first));
  assert.deepEqual(JSON.parse(first.text), oracle);
  const rowsAfterFirst = await countChildResultRows(node, childInvocationId);
  assert.equal(rowsAfterFirst, 1,
    'exactly one inner result row after the first idempotent POST');
  const replayed = await postAccountsSummary(
    node,
    {accountId: SUMMARY_ACCOUNT_ID},
    {idempotencyKey: REPLAY_IDEMPOTENCY_KEY},
  );
  assert.equal(replayed.status, first.status);
  assert.equal(replayed.text, first.text,
    'the replayed response is byte-identical to the journaled response');
  const rowsAfterReplay = await countChildResultRows(node, childInvocationId);
  assert.equal(rowsAfterReplay, 1,
    'the replayed POST did not execute the inner call again');

  return {
    composed: {body: JSON.parse(composed.text), status: composed.status},
    health: {body: JSON.parse(health.text), status: health.status},
    refused: {body: refusedBody, status: refused.status},
    replay: {
      byteIdentical: replayed.text === first.text,
      childInvocationId,
      innerResultRows: rowsAfterReplay,
    },
  };
}

async function exerciseDeployment(node, rows, partitions, deployment) {
  await waitForReadyCallCell(node, deployment.callBindingName);
  await waitForReadyCell(node, {
    METHOD: SERVICE.HTTP_METHOD,
    PATH: SERVICE.HTTP_PATH,
  });
  await waitForReadyCell(node, {
    METHOD: SERVICE.HEALTH_METHOD,
    PATH: SERVICE.HEALTH_PATH,
  });
  const http = await exerciseHttpSurface(node, rows, partitions);

  logPhase('direct CALL BINDING against the generated call Binding');
  const callerAdapter = await createCallerAdapter(
    node,
    CALL_SESSION,
    [PGWIRE_AUTH_ACTION.BINDING_CALL],
  );

  const summary = await summarizeAccount(
    callerAdapter, deployment.callBindingName, SUMMARY_ACCOUNT_ID);
  assert.deepEqual(
    summary,
    expectedSummary(rows, SUMMARY_ACCOUNT_ID, partitions.length),
  );
  const secondSummary = await summarizeAccount(
    callerAdapter, deployment.callBindingName, SECOND_ACCOUNT_ID);
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
      name: deployment.callBindingName,
      schema_version: 2,
    })],
  ).then(() => null, (error) => error);
  assert.ok(denied, 'expected the unauthorized CALL to reject');
  assert.match(String(denied.message), /authorized/iu);

  return {
    denied: {message: String(denied.message), rejected: true},
    http,
    secondSummary,
    summary,
  };
}

async function runCallBindingAccountSummaryExample(options = {}) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), TEMPORARY_PREFIX));
  let node = null;
  try {
    const paths = {
      componentPath: path.join(temporaryRoot, SERVICE.COMPONENT_FILE),
      ociOutputRoot: path.join(temporaryRoot, 'oci-layouts'),
    };
    logPhase('componentizing the generated entry against the service-cell world');
    const receipt = await buildServiceComponent(paths);
    logPhase('generating deployment records from lagrange.service.js');
    const records = await buildRecords(receipt);
    logPhase('booting the disposable local node');
    node = await bootExampleNode(
      path.join(temporaryRoot, NODE_DATA_DIRECTORY),
      {
        requestCellDeadlineMs: REQUEST_CELL_DEADLINE_MS,
        wsPort: options.wsPort ?? EXAMPLE_WS_PORT,
      },
    );
    const rows = generateLedgerRows();
    logPhase(`seeding ${rows.length} ledger rows`);
    const created = await seedLedger(node, rows);
    logPhase('splitting the ledger partition on its id median');
    const partitions = await splitLedgerPartition(node, created.partitionId);
    logPhase('INSTALL SERVICE + generated CREATE BINDINGs + SERVICE ACCESS');
    const deployment = await deploy(node, receipt, records);
    logPhase('waiting for both request Cells and the call Cell');
    const observations =
      await exerciseDeployment(node, rows, partitions, deployment);
    logPhase('all checks passed; shutting down');
    const report = {
      artifact: {
        buildInputFingerprint: receipt.buildInputFingerprint,
        manifestDigest: deployment.manifestDigest,
        ociManifestDigest: receipt.topManifestDescriptor.digest,
        packageId: deployment.packageId,
      },
      bindings: {
        call: deployment.callBindingName,
        request: deployment.requestBindings.map((binding) => ({
          method: binding.source.method,
          name: binding.name,
          path: binding.source.path,
        })),
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
