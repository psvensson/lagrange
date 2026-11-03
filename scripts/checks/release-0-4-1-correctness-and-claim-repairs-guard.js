import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {
  CALL_CELL_REDUCE_INCOMPLETE_REASON,
  createCallCellReduceCoordinator,
} from '../../src/runtime/call-cell-reduce-coordinator.js';
import {
  handleCallCellInvocation,
} from '../../src/node/runtime-service-call-cell-handler.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  CALL_CELL_ROUTE_ERROR_CODE,
  CALL_CELL_ROUTE_MESSAGE_TYPE,
  CALL_CELL_ROUTE_OPERATION,
} from '../../src/service/call-cell-routing-contract.js';
import {
  ManagementV1Owner,
} from '../../src/bootstrap/owners/management-v1-owner.js';
import {
  installBootstrapApiServerMethods,
} from '../../src/bootstrap/bootstrap-api-server-methods.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayPush = Function.call.bind(Array.prototype.push);
const stringIncludes = Function.call.bind(String.prototype.includes);

const UTF8_ENCODING = 'utf8';
const PARENT_DIR = '..';
const NEWLINE = '\n';
const FLAG_METRIC = '--metric';
const PASS_MESSAGE = 'release-0-4-1-correctness-and-claim-repairs-guard: PASS\n';
const SHARD_COUNT_OVERFLOW = 17;
const CONTRIBUTIONS_PER_SHARD = 64;
const PARTIAL_COUNT_LIMIT = 1024;
const SMALL_PARTIAL_BYTE_LIMIT = 32;
const CUSTOM_BATCH_BYTE_BOUND = 2048;
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const ARGV_SCRIPT_INDEX = 1;

const TEST_INVOCATION_ID = 'inv-041-guard';
const TEST_SERVICE_ID = 'svc-041';
const TEST_BINDING_ID = 'summarize';
const TEST_REPLICA_ID = 'svc-041-r1';
const TEST_NODE_ID = 'node-1';
const TEST_CLUSTER_ID = 'cluster-1';
const TEST_TENANT_ID = 'tenant-1';
const TEST_PRINCIPAL = 'principal-1';
const TEST_ROLE = 'service-caller';
const TEST_PARTITION_ID = 'tbl-items-p1';
const TEST_TABLE_NAME = 'items';
const TEST_SELECT_TYPE = 'SELECT';
const TEST_SELECTOR_SQL = 'SELECT id, amount FROM items';
const TEST_DEADLINE_OFFSET_MS = 30000;
const TEST_BATCH_ROW_BOUND = 4096;
const TEST_ROW_ID = 1;
const TEST_LEASE_MS = 10000;
const TEST_NOW_MS = 50000;
const HEALTH_STATUS_HEALTHY = 'healthy';
const PARTITION_STATUS_ACTIVE = 'active';
const COORDINATION_TABLE = 'call_cell_reduce_slots';
const RESULT_TABLE = 'call_cell_reduce_results';

const BOOTSTRAP_API_SERVER_PATH = 'src/bootstrap/bootstrap-api-server-methods.js';
const BENCHMARK_README_PATH = 'docs/benchmarks/README.md';
const BENCHMARK_SCENARIOS_PATH = 'docs/benchmarks/tidb-reference-scenarios.md';
const CHANGELOG_PATH = 'CHANGELOG.md';
const PUBLIC_PG_GUARD_PATH = 'scripts/checks/oltp-scenario-a-lagrange-public-pg-context-guard.js';
const HISTORY_STORE_GUARD_PATH = 'scripts/checks/oltp-comparison-history-store-guard.js';

const CAPABILITY_UNSUPPORTED = 'unsupported';
const AUTH_HELPER_CALL = 'handleManagementFactsRoute(this, request, reply)';
const FORBIDDEN_BENCHMARK_INTRO = 'qualifies results across two rigorous evidence tiers';
const FORBIDDEN_CHANGELOG_METRIC = '584.2 dec/s';
const FORBIDDEN_SCENARIO_METRIC = '2860.0 dec/s';
const KEY_ALPHA = 'alpha-key';
const KEY_BETA = 'beta-key';
const EMPTY_JSON_OBJECT = '{}';
const MSG_OVERFLOW_REJECT =
  '17 shards x 64 contributions (1,088 > 1,024) must reject';
const MSG_BYTE_REJECT = 'partials exceeding maxPartialBytes must reject';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  PARENT_DIR,
  PARENT_DIR,
);

function buildOverflowSlotRows() {
  const rows = [];
  const slotIds = [];
  for (let s = 1; s <= SHARD_COUNT_OVERFLOW; s += 1) {
    const entries = [];
    for (let i = 0; i < CONTRIBUTIONS_PER_SHARD; i += 1) {
      arrayPush(entries, {groupKey: `shard-${s}-key-${i}`, aggValue: 1});
    }
    arrayPush(slotIds, s);
    arrayPush(rows, {
      invocation_id: TEST_INVOCATION_ID,
      slot_id: s,
      replica_id: `rep-${s}`,
      lease_expires_at: TEST_NOW_MS + TEST_LEASE_MS,
      partial_json: JSON.stringify(entries),
      computed_at: TEST_NOW_MS,
    });
  }
  return {rows, slotIds};
}

async function verifyGenericReductionNoTruncationAndByteBounds() {
  const {rows, slotIds} = buildOverflowSlotRows();
  const coordinator = createCallCellReduceCoordinator({
    coordinationTable: COORDINATION_TABLE,
    resultTable: RESULT_TABLE,
    leaseMs: TEST_LEASE_MS,
    slotCount: SHARD_COUNT_OVERFLOW,
    nowProvider: () => TEST_NOW_MS,
    executeInternal: async () => ({success: true, results: rows}),
  });
  let countError = null;
  try {
    await coordinator.resolveCompletePartialSet(
      TEST_INVOCATION_ID,
      slotIds,
      PARTIAL_COUNT_LIMIT,
    );
  } catch (error) {
    countError = error;
  }
  assert.ok(countError, MSG_OVERFLOW_REJECT);
  assert.equal(countError.code, CALL_CELL_ROUTE_ERROR_CODE.REDUCE_INCOMPLETE);
  assert.equal(
    stringIncludes(
      String(countError.message),
      CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_UNBOUNDED,
    ),
    true,
  );

  const byteBoundedCoordinator = createCallCellReduceCoordinator({
    coordinationTable: COORDINATION_TABLE,
    resultTable: RESULT_TABLE,
    leaseMs: TEST_LEASE_MS,
    slotCount: 1,
    maxPartialBytes: SMALL_PARTIAL_BYTE_LIMIT,
    nowProvider: () => TEST_NOW_MS,
    executeInternal: async () => ({
      success: true,
      results: [{
        invocation_id: TEST_INVOCATION_ID,
        slot_id: 1,
        replica_id: TEST_REPLICA_ID,
        lease_expires_at: TEST_NOW_MS + TEST_LEASE_MS,
        partial_json: JSON.stringify([
          {groupKey: KEY_ALPHA, aggValue: 10},
          {groupKey: KEY_BETA, aggValue: 20},
        ]),
        computed_at: TEST_NOW_MS,
      }],
    }),
  });
  let byteError = null;
  try {
    await byteBoundedCoordinator.resolveCompletePartialSet(
      TEST_INVOCATION_ID,
      [1],
      PARTIAL_COUNT_LIMIT,
    );
  } catch (error) {
    byteError = error;
  }
  assert.ok(byteError, MSG_BYTE_REJECT);
  assert.equal(byteError.code, CALL_CELL_ROUTE_ERROR_CODE.REDUCE_INCOMPLETE);
  assert.equal(
    stringIncludes(
      String(byteError.message),
      CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_UNBOUNDED,
    ),
    true,
  );
}

async function verifyLocalShardReadByteBudget() {
  let capturedOptions = null;
  const handler = {
    nodeId: TEST_NODE_ID,
    callBindingRouteResolver: {
      assertSelectedRoute: (_call, route) => route,
    },
    localReplicas: new Map([[
      TEST_REPLICA_ID,
      {
        entityId: TEST_SERVICE_ID,
        replicaHandle: {serviceId: TEST_REPLICA_ID},
        status: ReplicaStatus.ACTIVE,
      },
    ]]),
    serviceRuntimeLifecycle: {
      health: async () => ({status: HEALTH_STATUS_HEALTHY}),
      invoke: async () => ({partials: [], result: EMPTY_JSON_OBJECT}),
    },
    partitionServicesProvider: () => new Map([[
      TEST_PARTITION_ID,
      {
        isStopped: false,
        status: PARTITION_STATUS_ACTIVE,
        executeQuery: async (_sql, _params, options) => {
          capturedOptions = options;
          return {rows: [{id: TEST_ROW_ID}], success: true};
        },
      },
    ]]),
    cdcIntegrationService: {
      sqlQueryEngine: {
        parse: () => ({type: TEST_SELECT_TYPE, from: {name: TEST_TABLE_NAME}, where: null}),
        queryExecutor: {
          buildSelectSQL: () => TEST_SELECTOR_SQL,
        },
      },
    },
  };

  const envelope = {
    metadata: {roles: [TEST_ROLE]},
    operation: CALL_CELL_ROUTE_OPERATION,
    principal: TEST_PRINCIPAL,
    tenantId: TEST_TENANT_ID,
    payload: {
      call: {arguments: EMPTY_JSON_OBJECT, name: TEST_BINDING_ID},
      invocation: {
        callCell: {
          batchRowBound: TEST_BATCH_ROW_BOUND,
          batchByteBound: CUSTOM_BATCH_BYTE_BOUND,
        },
        deadlineMs: Date.now() + TEST_DEADLINE_OFFSET_MS,
        id: TEST_INVOCATION_ID,
        intentDigest: TEST_INVOCATION_ID,
      },
      operation: CALL_CELL_ROUTE_OPERATION,
      partitionId: TEST_PARTITION_ID,
      route: {
        bindingVersionId: TEST_BINDING_ID,
        name: TEST_BINDING_ID,
        nodeId: TEST_NODE_ID,
        replicaId: TEST_REPLICA_ID,
        serviceId: TEST_SERVICE_ID,
        statement: TEST_SELECTOR_SQL,
        tenantId: TEST_TENANT_ID,
      },
      type: CALL_CELL_ROUTE_MESSAGE_TYPE,
    },
  };

  const response = await handleCallCellInvocation(handler, envelope);
  assert.equal(response.processed, true);
  assert.ok(capturedOptions);
  assert.equal(capturedOptions.resultMaxBytes, CUSTOM_BATCH_BYTE_BOUND);
}

function verifyManagementV1TruthfulSupportAndAuth(rootDir) {
  const defaultOwner = new ManagementV1Owner({
    getClusterId: () => TEST_CLUSTER_ID,
    getNodeId: () => TEST_NODE_ID,
    getReady: () => true,
  });
  const {facts} = defaultOwner.getClusterFacts();
  assert.equal(facts.capabilities.rollingUpgrade, CAPABILITY_UNSUPPORTED);
  assert.equal(facts.capabilities.backupRestore, CAPABILITY_UNSUPPORTED);
  assert.equal(facts.capabilities.decommissionNode, CAPABILITY_UNSUPPORTED);

  class StubBootstrapApi {}
  installBootstrapApiServerMethods(StubBootstrapApi);
  const serverStub = new StubBootstrapApi();
  serverStub.seedNodeId = TEST_NODE_ID;
  // The real BootstrapAPI reads the identity from the cluster record; an
  // unestablished record is null and must never become the seed node id.
  serverStub.getClusterId = () => null;
  const bootstrapOwner = serverStub.getManagementV1Owner();
  const {facts: bootstrapFacts} = bootstrapOwner.getClusterFacts();
  assert.equal(bootstrapFacts.cluster.identity, null);
  assert.equal(bootstrapFacts.capabilities.rollingUpgrade, CAPABILITY_UNSUPPORTED);
  assert.equal(bootstrapFacts.capabilities.backupRestore, CAPABILITY_UNSUPPORTED);
  assert.equal(bootstrapFacts.capabilities.decommissionNode, CAPABILITY_UNSUPPORTED);

  const serverSource = fs.readFileSync(
    path.resolve(rootDir, BOOTSTRAP_API_SERVER_PATH),
    UTF8_ENCODING,
  );
  assert.equal(stringIncludes(serverSource, AUTH_HELPER_CALL), true);
}

function verifyCiGuardsAndPublicationClaims(rootDir) {
  const benchmarkReadme = fs.readFileSync(
    path.resolve(rootDir, BENCHMARK_README_PATH),
    UTF8_ENCODING,
  );
  assert.equal(stringIncludes(benchmarkReadme, FORBIDDEN_BENCHMARK_INTRO), false);

  const benchmarkScenarios = fs.readFileSync(
    path.resolve(rootDir, BENCHMARK_SCENARIOS_PATH),
    UTF8_ENCODING,
  );
  assert.equal(stringIncludes(benchmarkScenarios, FORBIDDEN_SCENARIO_METRIC), false);

  const changelog = fs.readFileSync(
    path.resolve(rootDir, CHANGELOG_PATH),
    UTF8_ENCODING,
  );
  assert.equal(stringIncludes(changelog, FORBIDDEN_CHANGELOG_METRIC), false);

  for (const relGuardPath of [PUBLIC_PG_GUARD_PATH, HISTORY_STORE_GUARD_PATH]) {
    const res = spawnSync(
      process.execPath,
      [path.resolve(rootDir, relGuardPath)],
      {cwd: rootDir, encoding: UTF8_ENCODING},
    );
    assert.equal(res.status, EXIT_SUCCESS, `${relGuardPath} failed: ${res.stderr || res.stdout}`);
  }
}

async function runRelease041Guard(rootDir = REPO_ROOT) {
  const checks = [
    () => verifyGenericReductionNoTruncationAndByteBounds(),
    () => verifyLocalShardReadByteBudget(),
    () => verifyManagementV1TruthfulSupportAndAuth(rootDir),
    () => verifyCiGuardsAndPublicationClaims(rootDir),
  ];
  let failures = 0;
  const errors = [];
  for (const check of checks) {
    try {
      await check();
    } catch (error) {
      failures += 1;
      arrayPush(errors, error);
    }
  }
  return {ok: failures === EXIT_SUCCESS, failures, errors};
}

const isDirectCli = process.argv[ARGV_SCRIPT_INDEX] &&
  path.resolve(process.argv[ARGV_SCRIPT_INDEX]) === fileURLToPath(import.meta.url);
if (isDirectCli) {
  const isMetric = arrayIncludes(process.argv, FLAG_METRIC);
  const outcome = await runRelease041Guard();
  if (isMetric) {
    process.stdout.write(`${outcome.failures}${NEWLINE}`);
    process.exitCode = outcome.ok ? EXIT_SUCCESS : EXIT_FAILURE;
  } else if (!outcome.ok) {
    throw outcome.errors[0];
  } else {
    process.stdout.write(PASS_MESSAGE);
  }
}
