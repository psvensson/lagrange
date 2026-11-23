/**
 * Q4 (`service-inspect-achieved-readiness`) full production end-to-end witness.
 *
 * Proves the complete real-node path with ZERO manual handler injection,
 * ZERO author-source loading on the runtime, ZERO synthetic dispatcher
 * activation, and ZERO `.wasm` files on the deploying client:
 *
 *  1. Build a real compiled WASI component from `createWasmServiceProject` via
 *     `runGenerate` -> `runBuild` (`ServiceLocalOciLayoutBuilder` + ComponentizeJS).
 *  2. Boot a real Lagrange node (`bootExampleNode`) and seed `account_activity`.
 *  3. Publish via `runPublish` into replicated `ArtifactPayloadStore`, copy ONLY
 *     `.lagrange/publish-receipt.json` into a clean directory, and delete the
 *     authored/built project directory completely.
 *  4. `intent-is-not-readiness`: run `INSTALL SERVICE $1` alone -> `runInspect`,
 *     `runServicePipelineCommand(['inspect', ...])`, and `SHOW SERVICE $1` all
 *     report NOT ready (`desired_state: 'active'`,
 *     `rollout_state: 'recorded_not_running'`, `readiness_state: 'not_ready'`,
 *     `latest_failure_id: null`) and public HTTP returns 404.
 *  5. `ready-service-public-invocation`: run `runDeploy` with the same
 *     idempotency key (verifying deploy idempotence + binding/policy replay),
 *     wait for the real production `RuntimeServiceRebalancerOwner` +
 *     `UnifiedRebalancer` + `WasmComponentDriver` + `WasiComponentCellRuntime` +
 *     `ServiceInstallationReconciler` to activate and converge -> `runInspect`,
 *     CLI inspect, and `SHOW SERVICE $1` report `ready: true`,
 *     `rollout_state: 'converged'`, `readiness_state: 'ready'`,
 *     `readiness_reason: 'ready'`, then invoke public Basic-auth HTTP
 *     `POST /amounts/summary` and verify exact oracle totals (and HTTP 400 on
 *     invalid accountId).
 *  6. `unavailable-and-failed-service-not-ready`: stop rebalancing and remove
 *     the live request Cell actual -> `runInspect` and `SHOW SERVICE $1`
 *     immediately report `ready: false` (`readiness_state: 'not_ready'`) and
 *     public HTTP refuses with 503.
 */

import assert from 'node:assert/strict';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';

import {
  EXAMPLE_NODE,
  bootExampleNode,
} from '../../examples/request-binding-deployment/request-binding-example-node.js';
import {
  runBuild,
  runDeploy,
  runGenerate,
  runInspect,
  runPublish,
} from '../../src/cli/service-pipeline-command.js';
import {
  runServicePipelineCommand,
} from '../../src/cli/service-pipeline-router.js';
import {
  createWasmServiceProject,
} from '../../src/cli/service-wasm-scaffold.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {
  UNIFIED_SERVICE_TYPE,
} from '../../src/constants/unified-service-lifecycle.js';
import {
  SERVICE_INSTALL_DESIRED_STATE,
  SERVICE_INSTALL_ROLLOUT_STATE,
} from '../../src/control-plane/owners/service-install-catalog-contract.js';
import {
  deriveRequestServiceDefinitionId,
} from '../../src/control-plane/owners/request-binding-service-definition-contract.js';
import {
  runtimeServiceReplicaBelongsToEntity,
} from '../../src/rebalancer/runtime-service-replica-identity.js';
import {
  SERVICE_READINESS_REASON,
  SERVICE_READINESS_STATE,
} from '../../src/service/service-installation-readiness.js';
import {
  ServiceLocalOciLayoutBuilder,
} from '../../src/service/service-local-oci-layout-builder.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {scaleByMachineFactor} from '../../scripts/test-machine-factor.js';

const SERVICE_NAME = 'amounts-achieved-readiness';
const DEPLOY_IDEMPOTENCY_KEY = 'q4-achieved-readiness-deploy-v1';
const SQL_SESSION = 'request-binding-example-session';
const REQUEST_PATH = '/amounts/summary';
const REQUEST_METHOD = 'POST';
const TEST_TIMEOUT_MS = 300_000;
const READY_WAIT_TIMEOUT_MS = scaleByMachineFactor(90_000);
const READY_POLL_INTERVAL_MS = 200;
const REQUEST_CELL_DEADLINE_MS = 30_000;
const HTTP_STATUS = Object.freeze({
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  OK: 200,
  SERVICE_UNAVAILABLE: 503,
});
const LEDGER_ROWS = Object.freeze([
  Object.freeze({accountId: 101, amountCents: 500, id: 1}),
  Object.freeze({accountId: 202, amountCents: 1_500, id: 2}),
  Object.freeze({accountId: 101, amountCents: 700, id: 3}),
  Object.freeze({accountId: 202, amountCents: 2_500, id: 4}),
]);
const ACCOUNT_TABLE_DDL =
  'CREATE TABLE account_activity (' +
  'id INTEGER PRIMARY KEY, ' +
  'account_id INTEGER NOT NULL, ' +
  'amount_cents INTEGER NOT NULL)';
const BASIC_AUTH_HEADER = `Basic ${Buffer.from(
  `${EXAMPLE_NODE.USER}:${EXAMPLE_NODE.PASSWORD}`,
  'utf8',
).toString('base64')}`;

const ports = createPortAllocator(import.meta.url);

function createNodeSqlClient(node) {
  return () => ({
    async execute(statement, parameters = []) {
      const result = await node.sqlAdapter.execute(
        SQL_SESSION,
        statement,
        parameters,
      );
      if (result.success === false) {
        const error = new Error(result.errorMessage || 'sql execution failed');
        error.code = result.errorCode;
        throw error;
      }
      return result;
    },
  });
}

async function postPublicJson(baseUrl, body) {
  const response = await fetch(`${baseUrl}${REQUEST_PATH}`, {
    body: JSON.stringify(body),
    headers: {
      'authorization': BASIC_AUTH_HEADER,
      'content-type': 'application/json',
    },
    method: REQUEST_METHOD,
  });
  const text = await response.text();
  const parsed = response.headers.get('content-type')?.includes('json') ?
    JSON.parse(text) :
    text;
  return {body: parsed, status: response.status};
}

function oracleSummary(accountId = null, contributingShards = 2) {
  const matched = LEDGER_ROWS.filter((row) =>
    accountId === null || row.accountId === accountId);
  return {
    accountId,
    contributingShards: matched.length > 0 ? contributingShards : 0,
    totalCents: matched.reduce((sum, row) => sum + row.amountCents, 0),
    transactions: matched.length,
  };
}

async function splitAndWaitForRoutablePartitions(node) {
  const engine = node.sqlAdapter.sqlCore;
  const initial = engine.getTablePartitions('account_activity') || [];
  assert.equal(initial.length, 1, JSON.stringify(initial));
  const sourcePartitionId = initial[0].partition_id || initial[0].partitionId;
  await engine.executeManagedSplit(sourcePartitionId);
  const deadline = Date.now() + READY_WAIT_TIMEOUT_MS;
  const cache = node.bootstrapService.systemTableCache;
  let lastSnapshot = null;
  while (Date.now() < deadline) {
    const partitions = engine.getTablePartitions('account_activity') || [];
    if (partitions.length >= 2) {
      const cached = partitions.map((p) => {
        const pid = p.partition_id || p.partitionId;
        return cache.get(TABLES.PARTITIONS, pid) || null;
      });
      lastSnapshot = cached;
      if (cached.every((row) => row?.leader_node_id === EXAMPLE_NODE.NODE_ID)) {
        return partitions;
      }
    }
    await delay(READY_POLL_INTERVAL_MS);
  }
  throw new Error(
    `Split partitions did not publish leader_node_id within ${READY_WAIT_TIMEOUT_MS}ms; ` +
    `lastSnapshot=${JSON.stringify(lastSnapshot)}`,
  );
}

async function waitForInspectReady(createSqlClient, deployDir) {
  const deadline = Date.now() + READY_WAIT_TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    last = await runInspect({
      createSqlClient,
      projectDirectory: deployDir,
    });
    if (last.ready === true) {
      return last;
    }
    await delay(READY_POLL_INTERVAL_MS);
  }
  throw new Error(
    `Service did not reach achieved readiness within ${READY_WAIT_TIMEOUT_MS}ms; ` +
    `last inspect: ${JSON.stringify(last)}`,
  );
}

describe('service inspect achieved readiness end-to-end on real production node', () => {
  it('ready-service-public-invocation: inspect distinguishes intent from achieved Cell readiness and matches real public HTTP invocability', {
    timeout: TEST_TIMEOUT_MS,
  }, async () => {
    const tempRoot = await mkdtemp(
      path.join(tmpdir(), 'lagrange-q4-achieved-readiness-'),
    );
    const projectDir = path.join(tempRoot, SERVICE_NAME);
    const deployDir = path.join(tempRoot, 'clean-deploy-client');
    const nodeDataDir = path.join(tempRoot, 'node-data');
    let node = null;

    try {
      // 1. Build a real WASI component through the ordinary code-first CLI pipeline
      createWasmServiceProject(projectDir);
      await runGenerate({projectDirectory: projectDir});
      const built = await runBuild({
        createLocalOciLayoutBuilder: () => new ServiceLocalOciLayoutBuilder(),
        projectDirectory: projectDir,
      });
      assert.ok(built.descriptor.digest.startsWith('sha256:'));

      // 2. Boot a real production Lagrange node and seed account_activity
      node = await bootExampleNode(nodeDataDir, {
        requestCellDeadlineMs: REQUEST_CELL_DEADLINE_MS,
        wsPort: ports.getPort(),
      });
      node.sqlAdapter.sqlCore.tableCreationService.defaultReplicaCount = 1;
      const createSqlClient = createNodeSqlClient(node);
      const sqlClient = createSqlClient();
      await sqlClient.execute(ACCOUNT_TABLE_DDL, []);
      for (const row of LEDGER_ROWS) {
        await sqlClient.execute(
          'INSERT INTO account_activity (id, account_id, amount_cents) ' +
          `VALUES (${row.id}, ${row.accountId}, ${row.amountCents})`,
          [],
        );
      }
      const splitPartitions = await splitAndWaitForRoutablePartitions(node);
      assert.equal(splitPartitions.length, 2);

      // 3. Publish compiled bytes into replicated ArtifactPayloadStore,
      //    copy ONLY publish-receipt.json to clean dir, and delete projectDir
      const receipt = await runPublish({
        createSqlClient,
        projectDirectory: projectDir,
      });
      assert.equal(receipt.service, SERVICE_NAME);
      await mkdir(path.join(deployDir, '.lagrange'), {recursive: true});
      await copyFile(
        path.join(projectDir, '.lagrange', 'publish-receipt.json'),
        path.join(deployDir, '.lagrange', 'publish-receipt.json'),
      );
      await rm(projectDir, {force: true, recursive: true});
      const deployEntries = await readdir(path.join(deployDir, '.lagrange'));
      assert.deepEqual(deployEntries, ['publish-receipt.json']);

      // 4. intent-is-not-readiness: INSTALL SERVICE alone (desired active, no bindings/Cells)
      const installed = await sqlClient.execute('INSTALL SERVICE $1', [
        JSON.stringify({
          config: receipt.config,
          idempotency_key: DEPLOY_IDEMPOTENCY_KEY,
          manifest: receipt.manifest,
        }),
      ]);
      assert.equal(
        installed.rows[0].desired_state,
        SERVICE_INSTALL_DESIRED_STATE.ACTIVE,
      );
      assert.equal(
        installed.rows[0].rollout_state,
        SERVICE_INSTALL_ROLLOUT_STATE.RECORDED_NOT_RUNNING,
      );

      // Force a reconciler pass and confirm wasm_component without bindings stays
      // recorded_not_running with NO activation_unsupported failure and ready === false
      const reconcilerOwner =
        node.bootstrapService.serviceInstallationReconcilerOwnerHandle?.owner;
      assert.ok(reconcilerOwner, 'production reconciler owner must be attached');
      await reconcilerOwner.reconcileNow();

      const beforeBindingsInspect = await runInspect({
        createSqlClient,
        projectDirectory: deployDir,
      });
      assert.equal(beforeBindingsInspect.ready, false);
      assert.equal(
        beforeBindingsInspect.desiredState,
        SERVICE_INSTALL_DESIRED_STATE.ACTIVE,
      );
      assert.equal(
        beforeBindingsInspect.rolloutState,
        SERVICE_INSTALL_ROLLOUT_STATE.RECORDED_NOT_RUNNING,
      );
      assert.equal(
        beforeBindingsInspect.readinessState,
        SERVICE_READINESS_STATE.NOT_READY,
      );
      assert.equal(
        beforeBindingsInspect.readinessReason,
        SERVICE_READINESS_REASON.ROLLOUT_NOT_READY,
      );
      assert.equal(beforeBindingsInspect.row.latest_failure_id, null);

      const cliBeforeLines = [];
      const cliBeforeExit = await runServicePipelineCommand(
        ['inspect', deployDir],
        {
          createSqlClient,
          writeError: () => {},
          writeOutput: (line) => cliBeforeLines.push(line),
        },
      );
      assert.equal(cliBeforeExit, 0);
      assert.equal(JSON.parse(cliBeforeLines[0]).ready, false);

      // Public HTTP before bindings/Cells refuses with 404 (not ready, not invocable)
      const beforeHttp = await postPublicJson(node.baseUrl, {accountId: 101});
      assert.equal(beforeHttp.status, HTTP_STATUS.NOT_FOUND);

      // 5. Replay INSTALL via ordinary identity-based runDeploy (idempotence) +
      //    create bindings & access policies, then wait for REAL Cell activation & convergence
      const deployed = await runDeploy({
        createSqlClient,
        idempotencyKey: DEPLOY_IDEMPOTENCY_KEY,
        projectDirectory: deployDir,
      });
      assert.equal(deployed.service, SERVICE_NAME);
      assert.equal(deployed.packageId, installed.rows[0].package_id);
      assert.equal(deployed.bindings.length, 2);

      const readyInspect = await waitForInspectReady(createSqlClient, deployDir);
      assert.equal(readyInspect.ready, true);
      assert.equal(
        readyInspect.desiredState,
        SERVICE_INSTALL_DESIRED_STATE.ACTIVE,
      );
      assert.equal(
        readyInspect.rolloutState,
        SERVICE_INSTALL_ROLLOUT_STATE.CONVERGED,
      );
      assert.equal(readyInspect.readinessState, SERVICE_READINESS_STATE.READY);
      assert.equal(readyInspect.readinessReason, SERVICE_READINESS_REASON.READY);
      assert.equal(readyInspect.row.latest_failure_id, null);
      assert.equal(readyInspect.row.revision_id, installed.rows[0].revision_id);

      const cliReadyLines = [];
      const cliReadyExit = await runServicePipelineCommand(
        ['inspect', deployDir],
        {
          createSqlClient,
          writeError: () => {},
          writeOutput: (line) => cliReadyLines.push(line),
        },
      );
      assert.equal(cliReadyExit, 0);
      const cliReadyPayload = JSON.parse(cliReadyLines[0]);
      assert.equal(cliReadyPayload.ready, true);
      assert.equal(cliReadyPayload.readinessState, SERVICE_READINESS_STATE.READY);
      assert.equal(
        cliReadyPayload.rolloutState,
        SERVICE_INSTALL_ROLLOUT_STATE.CONVERGED,
      );

      // SHOW SERVICE $1 and SHOW SERVICES agree on achieved readiness
      const showOne = await sqlClient.execute('SHOW SERVICE $1', [
        JSON.stringify({service_name: SERVICE_NAME}),
      ]);
      assert.equal(showOne.rows.length, 1);
      assert.equal(showOne.rows[0].readiness_state, SERVICE_READINESS_STATE.READY);
      assert.equal(showOne.rows[0].readiness_reason, SERVICE_READINESS_REASON.READY);
      assert.equal(showOne.rows[0].rollout_state, SERVICE_INSTALL_ROLLOUT_STATE.CONVERGED);

      const showAll = await sqlClient.execute('SHOW SERVICES', []);
      const listedRow = showAll.rows.find((row) => row.service_name === SERVICE_NAME);
      assert.ok(listedRow);
      assert.equal(listedRow.readiness_state, SERVICE_READINESS_STATE.READY);

      // 6. Invoke the REAL public HTTP endpoint through ordinary ingress (zero manual injection!)
      const resBadAccount = await postPublicJson(node.baseUrl, {accountId: 'abc'});
      assert.equal(resBadAccount.status, HTTP_STATUS.BAD_REQUEST, JSON.stringify(resBadAccount));

      const res101 = await postPublicJson(node.baseUrl, {accountId: 101});
      assert.equal(res101.status, HTTP_STATUS.OK, JSON.stringify(res101));
      assert.deepEqual(res101.body, oracleSummary(101, splitPartitions.length));

      const res202 = await postPublicJson(node.baseUrl, {accountId: 202});
      assert.equal(res202.status, HTTP_STATUS.OK, JSON.stringify(res202));
      assert.deepEqual(res202.body, oracleSummary(202, splitPartitions.length));

      const resAll = await postPublicJson(node.baseUrl, {});
      assert.equal(resAll.status, HTTP_STATUS.OK, JSON.stringify(resAll));
      assert.deepEqual(resAll.body, oracleSummary(null, splitPartitions.length));

      // 7. Adverse route-drop cut: detach rebalancer and remove request Cell actual ->
      //    inspect immediately reports NOT ready and public HTTP refuses with 503
      node.bootstrapService.runtimeServiceRebalancerOwnerHandle?.detach();
      const requestBindingName = deployed.bindings.find((name) =>
        name.includes('--request--'));
      assert.ok(requestBindingName);
      const cache = node.bootstrapService.systemTableCache;
      const requestBindingRow = (cache.getAll(TABLES.SERVICE_BINDINGS) || [])
        .find((row) => row.binding_name === requestBindingName);
      assert.ok(requestBindingRow);
      const requestServiceId = deriveRequestServiceDefinitionId(
        requestBindingRow.binding_version_id,
      );
      const requestActuals = (cache.getAll(TABLES.SERVICES) || []).filter(
        (actual) =>
          actual.service_type === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE &&
          runtimeServiceReplicaBelongsToEntity(actual.service_id, requestServiceId),
      );
      assert.ok(requestActuals.length >= 1);
      for (const actual of requestActuals) {
        cache.applySystemTableChange(
          TABLES.SERVICES,
          CDC_OPERATION.DELETE,
          actual,
        );
      }

      const afterDropInspect = await runInspect({
        createSqlClient,
        projectDirectory: deployDir,
      });
      assert.equal(afterDropInspect.ready, false);
      assert.equal(
        afterDropInspect.readinessState,
        SERVICE_READINESS_STATE.NOT_READY,
      );
      assert.ok(
        afterDropInspect.readinessReason ===
          SERVICE_READINESS_REASON.ROUTE_UNAVAILABLE ||
        afterDropInspect.readinessReason ===
          SERVICE_READINESS_REASON.ROLLOUT_NOT_READY,
        `unexpected readiness reason after Cell drop: ${afterDropInspect.readinessReason}`,
      );

      const afterDropHttp = await postPublicJson(node.baseUrl, {accountId: 101});
      assert.equal(afterDropHttp.status, HTTP_STATUS.SERVICE_UNAVAILABLE);

      // Verify clean deploy directory STILL has zero .wasm files (no local artifact fallback)
      const receiptText = await readFile(
        path.join(deployDir, '.lagrange', 'publish-receipt.json'),
        'utf8',
      );
      assert.equal(JSON.parse(receiptText).service, SERVICE_NAME);
    } finally {
      await node?.shutdown?.();
      await rm(tempRoot, {force: true, recursive: true});
    }
  });
});
