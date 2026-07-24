import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {describe, test} from 'node:test';

import {
  RUNTIME_KIND,
  UNIFIED_SERVICE_TYPE,
} from '../../src/constants/index.js';
import {
  canonicalJson,
} from '../../src/control-plane/owners/deployment-binding-contract.js';
import {RuntimeServiceHandler} from
  '../../src/node/runtime-service-handler.js';
import {
  EXECUTOR_OUTCOME_TYPE,
} from '../../src/rebalancer/executor-outcome-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  HEALTH_STATUS,
  PREPARE_STATUS,
  START_STATUS,
} from '../../src/runtime/runtime-driver.js';
import {isSqlRequest} from '../../src/query/sql-request.js';
import {
  bindRequestCellArtifact,
  projectRequestCellRuntime,
} from '../../src/runtime/request-cell-runtime-contract.js';
import {RuntimeDriverRegistry} from
  '../../src/runtime/runtime-driver-registry.js';
import {ServiceRuntimeLifecycle} from
  '../../src/runtime/service-runtime-lifecycle.js';
import {WasiComponentCellRuntime} from
  '../../src/runtime/wasi-component-cell-runtime.js';
import {WasmComponentDriver} from
  '../../src/runtime/wasm-component-driver.js';
import {
  SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
  ServiceLifecycleCommandOwner,
} from '../../src/service/service-lifecycle-command-owner.js';
import {
  normalizeExternalServiceManifest,
} from '../../src/service/external-service-manifest.js';
import {RuntimeServiceAdapter} from
  '../../src/service/adapters/runtime-service-adapter.js';
import {ServiceLifecycleManager} from
  '../../src/service/service-lifecycle-manager.js';
import {SQLiteStore} from '../../src/storage/sqlite-store.js';
import {
  REQUEST_CELL_RUNTIME_READINESS_SCENARIO,
} from './minimal-deployment-request-cell-runtime-readiness-scenario.js';

const ARTIFACT_DIGEST = `sha256:${'a'.repeat(64)}`;
const COMPONENT_BYTES_BASE64 =
  'AGFzbQ0AAQAHGwFCAgFAAAB3BAAOZ2V0LXJhbmRvbS11NjQBAAodAQAYd2FzaTpyYW5k' +
  'b20vcmFuZG9tQDAuMi4wBQAHXwFCBgFAAgV0YWJsZXkDa2V5eQB6BAAEcmVhZAEAAUAD' +
  'BXRhYmxleQNrZXl5BXZhbHVlegEABAAFd3JpdGUBAQFAAQpjYXBhYmlsaXR5eQB6BAAK' +
  'Y2FwYWJpbGl0eQECChoBABVsYWdyYW5nZTpjZWxsL2NvbnRleHQFAQYJAQEAAQRyZWFk' +
  'CAUBAQAAAAYKAQEAAQV3cml0ZQgFAQEAAQAGDwEBAAEKY2FwYWJpbGl0eQgFAQEAAgAC' +
  'HwEBAwRyZWFkAAAFd3JpdGUAAQpjYXBhYmlsaXR5AAIB1gEAYXNtAQAAAAESA2ACf38B' +
  'f2ADf39/AGABfwF/AikDA2N0eARyZWFkAAADY3R4BXdyaXRlAAEDY3R4CmNhcGFiaWxp' +
  'dHkAAgMCAQIHBwEDcnVuAAMKTQFLACAARQR/QQBBBxAAQQBBB0EqEAFBABACagUgAEEB' +
  'RgR/QeMAQQcQAAUgAEECRgR/QeMAEAIFIABBA0YEfwNADAALAAUgAAsLCwsLADEEbmFt' +
  'ZQACAW0BGgMABHJlYWQBBXdyaXRlAgpjYXBhYmlsaXR5AwoBAwEEBWFnYWluAgoBAAAB' +
  'A2N0eBIABw4BQAEHcmVxdWVzdHoAegYJAQAAAQEDcnVuCAYBAAADAAILCQEAA3J1bgED' +
  'AABdDmNvbXBvbmVudC1uYW1lARwAAAMABHJlYWQBBXdyaXRlAgpjYXBhYmlsaXR5AQYA' +
  'EQEAAW0BDAASAgAEY3R4aQEBaQEHAQEDA3J1bgEPBQIABnJhbmRvbQEDY3R4';
const COMPONENT_BYTES = Buffer.from(COMPONENT_BYTES_BASE64, 'base64');
const MEMORY_COMPONENT_BYTES = Buffer.from(
  'AGFzbQ0AAQABPwBhc20BAAAAAQYBYAF/AX8DAgEABQQBAQIEBxACBm1lbW9yeQIAA3J1' +
  'bgAACgYBBAAgAAsACQRuYW1lAAIBbQIEAQAAAAcOAUABB3JlcXVlc3R5AHkGCQEAAAEA' +
  'A3J1bggGAQAAAAAACwkBAANydW4BAAAAKA5jb21wb25lbnQtbmFtZQEGABEBAAFtAQYA' +
  'EgEAAWkBBwEBAANydW4=',
  'base64',
);
const PAYLOAD_DIGEST = `sha256:${createHash('sha256')
  .update(COMPONENT_BYTES)
  .digest('hex')}`;
const SERVICE_ID = 'binding-service-request-cell';
const PACKAGE_ID = `service-package-${'c'.repeat(64)}`;
const ACCESS_TABLES = Object.freeze([
  Object.freeze({
    context: 'table:global.audit',
    operations: Object.freeze(['read', 'write']),
    read: true,
    slot: 0,
    write: true,
  }),
]);

function manifest() {
  const result = normalizeExternalServiceManifest({
    artifact: {
      digest: ARTIFACT_DIGEST,
      media_type: 'application/wasm',
      ref: 'registry.example.test/acme/request-cell:1.0.0',
      type: 'oci',
    },
    capabilities: ['clock.read'],
    exports: [{
      interface: 'request_v1',
      name: 'run',
    }],
    name: 'request-cell',
    runtime: {kind: RUNTIME_KIND.WASM_COMPONENT},
    schema_version: 3,
    version: '1.0.0',
  });
  assert.equal(result.status, 'accepted');
  return result.manifest;
}

function manifestDigest(value) {
  return `sha256:${createHash('sha256')
    .update(canonicalJson(value))
    .digest('hex')}`;
}

function definition(overrides = {}) {
  const componentManifest = manifest();
  const digest = manifestDigest(componentManifest);
  const declaration = {
    budgets: {
      context_bytes: 4096,
      cpu_time_ms: 50,
      input_bytes: 64,
      memory_bytes: 64 * 1024 * 1024,
      output_bytes: 1024,
      wall_time_ms: 100,
    },
    capabilities: ['clock.read'],
    name: 'request-cell-binding',
    schema_version: 2,
    source: {kind: 'request', method: 'POST', path: '/cell'},
    target: {
      export_name: 'run',
      manifest_digest: digest,
      package_id: PACKAGE_ID,
    },
  };
  return {
    binding_digest: `sha256:${'b'.repeat(64)}`,
    binding_projection: JSON.stringify({
      binding_digest: `sha256:${'b'.repeat(64)}`,
      binding_version_id: 'binding-version-request-cell',
      declaration,
      tenant_id: 'tenant-a',
    }),
    binding_version_id: 'binding-version-request-cell',
    resource_budget: JSON.stringify(declaration.budgets),
    runtime_config: JSON.stringify({export_name: 'run'}),
    runtime_kind: RUNTIME_KIND.WASM_COMPONENT,
    runtime_ref:
      `registry.example.test/acme/request-cell:1.0.0@${ARTIFACT_DIGEST}`,
    service_id: SERVICE_ID,
    tenantId: 'tenant-a',
    ...overrides,
  };
}

function definitionWithBudgets(budgetOverrides) {
  const row = definition();
  const projection = JSON.parse(row.binding_projection);
  const budgets = {
    ...projection.declaration.budgets,
    ...budgetOverrides,
  };
  projection.declaration.budgets = budgets;
  return {
    ...row,
    binding_projection: JSON.stringify(projection),
    resource_budget: JSON.stringify(budgets),
  };
}

function boundRequestCell(overrides = {}) {
  const runtime = projectRequestCellRuntime(
    definitionWithBudgets(overrides),
  );
  const componentManifest = manifest();
  return bindRequestCellArtifact(runtime, {
    artifactDigest: ARTIFACT_DIGEST,
    bytes: COMPONENT_BYTES,
    manifest: componentManifest,
    manifestDigest: manifestDigest(componentManifest),
    packageId: PACKAGE_ID,
    payloadDigest: PAYLOAD_DIGEST,
  });
}

function createFixture(options = {}) {
  const cellRuntime = new WasiComponentCellRuntime();
  const componentManifest = manifest();
  const componentBytes = options.bytes || COMPONENT_BYTES;
  const artifact = {
    artifactDigest: ARTIFACT_DIGEST,
    manifest: componentManifest,
    manifestDigest: manifestDigest(componentManifest),
    packageId: PACKAGE_ID,
  };
  const commandOwner = new ServiceLifecycleCommandOwner({
    artifactResolver: {
      async loadComponentPayload() {
        return {
          bytes: componentBytes,
          payloadDigest: `sha256:${createHash('sha256')
            .update(componentBytes)
            .digest('hex')}`,
        };
      },
    },
    catalogOwner: {
      async getBindableArtifact() {
        return artifact;
      },
    },
    signaturePolicy: SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
  });
  const driver = new WasmComponentDriver({
    artifactLoader: options.artifactLoader ||
      ((target) => commandOwner.loadComponentArtifact(target)),
    componentRuntime: cellRuntime,
  });
  const registry = new RuntimeDriverRegistry();
  registry.register(driver);
  registry.freeze();
  const lifecycle = new ServiceRuntimeLifecycle(registry);
  const projections = [];
  const sqlRequests = [];
  lifecycle.setQueryExecutorFactory(() => ({
    getRuntimeAccessPolicy: async () =>
      options.accessPolicyResult || {
        status: 'resolved',
        policy: {tables: ACCESS_TABLES},
      },
    executeRequest: async (request) => {
      assert.equal(isSqlRequest(request), true);
      sqlRequests.push(request);
      if (options.sqlRequestExecutor) {
        return options.sqlRequestExecutor(request);
      }
      if (request.statement.startsWith('SELECT')) {
        if (options.tableReadDelayMs) {
          await new Promise((resolve) =>
            setTimeout(resolve, options.tableReadDelayMs));
        }
        return {
          rows: options.tableRows || [{key: 7, value: 9}],
          success: true,
        };
      }
      return {rows: [], success: true};
    },
  }));
  lifecycle.setStateProjectionWriter(async (_serviceId, row) => {
    if (options.failActiveProjection && row.status === 'active') {
      throw new Error('active projection unavailable');
    }
    projections.push(row);
  });
  return {
    cellRuntime,
    driver,
    lifecycle,
    projections,
    replica: {
      definition: options.definition || definition(),
      nodeId: 'node-a',
    },
    sqlRequests,
  };
}

function createProductionPlacementFixture() {
  const runtime = createFixture();
  const manager = new ServiceLifecycleManager();
  manager.registerAdapter(new RuntimeServiceAdapter({
    serviceRuntimeLifecycle: runtime.lifecycle,
  }));
  const definitionRow = {
    ...runtime.replica.definition,
    service_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
  };
  const outcomes = [];
  const handler = new RuntimeServiceHandler({
    cdcIntegrationService: {},
    executorOutcomeEmitter: {
      emitOutcome(...args) {
        outcomes.push(args);
      },
    },
    nodeId: 'node-a',
    serviceLifecycleManager: manager,
    systemTableCache: {
      get(_tableName, serviceId) {
        return serviceId === SERVICE_ID ? definitionRow : null;
      },
    },
  });
  handler.initialize();
  return {
    ...runtime,
    definitionRow,
    handler,
    manager,
    outcomes,
    replicaId: `${SERVICE_ID}-r1`,
  };
}

async function assertNotReady(fixture) {
  const health = await fixture.lifecycle.health(fixture.replica);
  assert.equal(health.status, HEALTH_STATUS.UNHEALTHY);
  assert.equal(fixture.cellRuntime.instanceCount, 0);
  assert.equal(fixture.projections.at(-1).status, 'failed');
}

describe('minimal deployment request Cell runtime readiness', () => {
  test('uses canonical Binding budget boundaries at runtime admission',
    () => {
      const minimumBudgets = {
        context_bytes: 0,
        cpu_time_ms: 1,
        input_bytes: 0,
        memory_bytes: 1,
        output_bytes: 0,
        wall_time_ms: 1,
      };
      assert.deepEqual(
        projectRequestCellRuntime(
          definitionWithBudgets(minimumBudgets),
        ).budgets,
        minimumBudgets,
      );

      const maximumBudgets = {
        context_bytes: 67108864,
        cpu_time_ms: 60000,
        input_bytes: 16777216,
        memory_bytes: 1073741824,
        output_bytes: 16777216,
        wall_time_ms: 300000,
      };
      assert.deepEqual(
        projectRequestCellRuntime(
          definitionWithBudgets(maximumBudgets),
        ).budgets,
        maximumBudgets,
      );

      for (const invalidBudgets of [
        {context_bytes: -1},
        {context_bytes: 67108865},
        {cpu_time_ms: 0},
        {cpu_time_ms: 2, wall_time_ms: 1},
        {input_bytes: -1},
        {input_bytes: 16777217},
        {memory_bytes: 0},
        {memory_bytes: 1073741825},
        {output_bytes: -1},
        {output_bytes: 16777217},
        {wall_time_ms: 300001},
      ]) {
        assert.throws(
          () => projectRequestCellRuntime(
            definitionWithBudgets(invalidBudgets),
          ),
          (error) => error.code === 'request_cell_budget_invalid',
        );
      }
    },
  );

  test('loads and runs genuine pinned Component bytes before ACTIVE readiness',
    async () => {
      const fixture = createFixture();
      assert.equal(
        REQUEST_CELL_RUNTIME_READINESS_SCENARIO,
        'minimal-deployment-request-cell-runtime-readiness',
      );
      assert.equal(
        COMPONENT_BYTES.includes(
          Buffer.from('wasi:random/random@0.2.0'),
        ),
        true,
      );
      const prepared = await fixture.lifecycle.prepare(
        fixture.replica.definition,
        {},
      );
      assert.equal(prepared.status, PREPARE_STATUS.READY);
      assert.equal(
        (await fixture.lifecycle.health(fixture.replica)).status,
        HEALTH_STATUS.UNHEALTHY,
      );

      const started = await fixture.lifecycle.start(fixture.replica);
      assert.equal(started.status, START_STATUS.RUNNING);
      assert.equal(
        (await fixture.lifecycle.health(fixture.replica)).status,
        HEALTH_STATUS.HEALTHY,
      );
      assert.equal(fixture.cellRuntime.instanceCount, 1);
      assert.equal(fixture.projections.at(-1).status, 'active');

      const result = await fixture.lifecycle.invoke(
        fixture.replica,
        {args: [0]},
      );
      assert.equal(result, 10);
      assert.equal(fixture.sqlRequests.length, 2);
      assert.match(
        fixture.sqlRequests[0].statement,
        /FROM "global\.audit" LIMIT \d+$/u,
      );
      assert.equal(fixture.sqlRequests[0].parameters.length, 2);
      assert.equal(
        fixture.sqlRequests[0].budgets.RESULT_MAX_BYTES <= 4096,
        true,
      );
      assert.match(
        fixture.sqlRequests[1].statement,
        /INSERT INTO "global\.audit"/u,
      );
      assert.deepEqual(fixture.sqlRequests[1].parameters, [7, 42]);
      await fixture.lifecycle.stop(fixture.replica);
    },
  );

  test('applies direct access policy changes on the next invocation',
    async () => {
      const options = {
        accessPolicyResult: {
          reason: 'policy_not_found',
          status: 'denied',
        },
      };
      const fixture = createFixture(options);
      await fixture.lifecycle.prepare(fixture.replica.definition, {});
      await fixture.lifecycle.start(fixture.replica);
      await assert.rejects(
        () => fixture.lifecycle.invoke(fixture.replica, {args: [0]}),
        /RUNTIME_ACCESS_DENIED/u,
      );
      await assertNotReady(fixture);

      options.accessPolicyResult = {
        policy: {tables: ACCESS_TABLES},
        status: 'resolved',
      };
      await fixture.lifecycle.start(fixture.replica);
      assert.equal(
        await fixture.lifecycle.invoke(fixture.replica, {args: [0]}),
        10,
      );
      await fixture.lifecycle.stop(fixture.replica);
    },
  );

  test('denies component-originated undeclared table and capability access',
    async () => {
      const fixture = createFixture();
      await fixture.lifecycle.prepare(fixture.replica.definition, {});
      await fixture.lifecycle.start(fixture.replica);
      await assert.rejects(
        () => fixture.lifecycle.invoke(fixture.replica, {args: [1]}),
        /request_cell_table_read_denied/u,
      );
      await assertNotReady(fixture);

      await fixture.lifecycle.start(fixture.replica);
      await assert.rejects(
        () => fixture.lifecycle.invoke(fixture.replica, {args: [2]}),
        /request_cell_capability_denied/u,
      );
      await assertNotReady(fixture);
      assert.equal(
        fixture.sqlRequests.filter(
          (request) => request.statement.startsWith('INSERT'),
        ).length,
        0,
      );
    },
  );

  test('terminates the instance on input and execution budget exhaustion',
    async () => {
      const fixture = createFixture();
      await fixture.lifecycle.prepare(fixture.replica.definition, {});
      await fixture.lifecycle.start(fixture.replica);
      await assert.rejects(
        () => fixture.lifecycle.invoke(
          fixture.replica,
          {args: ['x'.repeat(100)]},
        ),
        /input_bytes budget exhausted/u,
      );
      await assertNotReady(fixture);

      await fixture.lifecycle.start(fixture.replica);
      await assert.rejects(
        () => fixture.lifecycle.invoke(fixture.replica, {args: [3]}),
        /cpu_time_ms budget exhausted/u,
      );
      await assertNotReady(fixture);
    },
  );

  test('enforces output, context, wall, and Component-memory budgets',
    async () => {
      const output = createFixture({
        definition: definitionWithBudgets({output_bytes: 1}),
      });
      await output.lifecycle.prepare(output.replica.definition, {});
      await output.lifecycle.start(output.replica);
      await assert.rejects(
        () => output.lifecycle.invoke(output.replica, {args: [10]}),
        /output_bytes budget exhausted/u,
      );
      await assertNotReady(output);

      const context = createFixture({
        definition: definitionWithBudgets({context_bytes: 1}),
      });
      await context.lifecycle.prepare(context.replica.definition, {});
      await context.lifecycle.start(context.replica);
      await assert.rejects(
        () => context.lifecycle.invoke(context.replica, {args: [0]}),
        /context_bytes budget exhausted/u,
      );
      await assertNotReady(context);
      assert.equal(
        context.sqlRequests.filter(
          (request) => request.statement.startsWith('INSERT'),
        ).length,
        0,
      );

      const tableReadWall = createFixture({
        definition: definitionWithBudgets({
          cpu_time_ms: 50,
          wall_time_ms: 50,
        }),
        tableReadDelayMs: 200,
      });
      await tableReadWall.lifecycle.prepare(
        tableReadWall.replica.definition,
        {},
      );
      await tableReadWall.lifecycle.start(tableReadWall.replica);
      await assert.rejects(
        () => tableReadWall.lifecycle.invoke(
          tableReadWall.replica,
          {args: [0]},
        ),
        /wall_time_ms budget exhausted/u,
      );
      await assertNotReady(tableReadWall);

      const memory = createFixture({
        bytes: MEMORY_COMPONENT_BYTES,
        definition: definitionWithBudgets({memory_bytes: 64 * 1024}),
      });
      await memory.lifecycle.prepare(memory.replica.definition, {});
      await assert.rejects(
        () => memory.lifecycle.start(memory.replica),
        /memory_bytes budget exhausted/u,
      );
      await assertNotReady(memory);
    },
  );

  test('keeps an oversized table value inside SQLite before rejecting context',
    async () => {
      const store = new SQLiteStore({
        logger: {
          debug() {},
          error() {},
          info() {},
          warn() {},
        },
      });
      store.initialize();
      store.executeQuery(
        'CREATE TABLE "global.audit" (key INTEGER, value TEXT)',
      );
      store.executeQuery(
        'INSERT INTO "global.audit" (key, value) VALUES (?, ?)',
        [7, 'x'.repeat(4_096)],
      );
      let selectedRows = null;
      const fixture = createFixture({
        definition: definitionWithBudgets({context_bytes: 256}),
        sqlRequestExecutor: async (request) => {
          try {
            const result = store.executeQuery(
              request.statement,
              request.parameters,
              {
                cancellationToken: request.cancellationToken,
                resultDeadlineMs: request.timeoutBudget?.deadlineMs,
                resultMaxBytes: request.budgets.RESULT_MAX_BYTES,
                resultMaxRows: request.budgets.RESULT_MAX_ROWS,
              },
            );
            if (request.statement.startsWith('SELECT')) {
              selectedRows = result.rows;
            }
            return {success: true, ...result};
          } catch (error) {
            return {
              error: error.message,
              errorCode: error.code,
              success: false,
            };
          }
        },
      });

      try {
        await fixture.lifecycle.prepare(fixture.replica.definition, {});
        await fixture.lifecycle.start(fixture.replica);
        await assert.rejects(
          () => fixture.lifecycle.invoke(fixture.replica, {args: [0]}),
          /context_bytes budget exhausted/u,
        );
        assert.equal(selectedRows.length, 1);
        assert.equal(selectedRows[0].value, null);
        assert.equal(selectedRows[0].__request_cell_row_bytes, 4097);
        const selectRequest = fixture.sqlRequests.find(
          (request) => request.statement.startsWith('SELECT'),
        );
        assert.match(selectRequest.statement, / LIMIT \d+$/u);
        assert.equal(selectRequest.parameters.length, 2);
        await assertNotReady(fixture);
      } finally {
        store.close();
      }
    },
  );

  test('reconciles an old journal success into one fresh live instance',
    async () => {
      const restarted = createFixture();
      restarted.lifecycle.setOperationWriter(async () => {});
      restarted.lifecycle.setIdempotencyReader(async () => [{
        operation_id: 'old-start-operation',
        state: 'completed',
      }]);
      const prepareReplay = await restarted.lifecycle.prepare(
        restarted.replica.definition,
        {},
        {idempotencyKey: 'redelivered-prepare'},
      );
      assert.equal(prepareReplay.idempotent, true);
      assert.equal(prepareReplay.status, PREPARE_STATUS.READY);

      const replay = await restarted.lifecycle.start(
        restarted.replica,
        {idempotencyKey: 'redelivered-start'},
      );
      assert.equal(replay.idempotent, true);
      assert.equal(replay.operationId, 'old-start-operation');
      assert.equal(replay.status, START_STATUS.RUNNING);
      assert.equal(restarted.cellRuntime.instanceCount, 1);
      assert.equal(
        (await restarted.lifecycle.health(restarted.replica)).status,
        HEALTH_STATUS.HEALTHY,
      );
      await restarted.lifecycle.start(
        restarted.replica,
        {idempotencyKey: 'redelivered-start'},
      );
      assert.equal(restarted.cellRuntime.instanceCount, 1);
      await restarted.lifecycle.stop(restarted.replica);
    },
  );

  test('restarts through handler, manager, adapter, and runtime placement',
    async () => {
      const placed = createProductionPlacementFixture();
      const request = {
        entityId: SERVICE_ID,
        operationId: 'place-request-cell',
        replicaId: placed.replicaId,
      };
      await placed.handler.createReplicaAsync(request);
      assert.equal(
        placed.handler.localReplicas.get(placed.replicaId).status,
        ReplicaStatus.ACTIVE,
      );
      assert.equal(placed.cellRuntime.instanceCount, 1);
      assert.equal(
        placed.outcomes.at(-1)[0],
        EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_ACTIVE,
      );
      await placed.cellRuntime.stop(placed.replicaId);

      const restarted = createProductionPlacementFixture();
      await restarted.handler.createReplicaAsync(request);
      assert.equal(restarted.cellRuntime.instanceCount, 1);
      assert.equal(
        restarted.manager.getReplicaState({
          serviceId: restarted.replicaId,
          serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
          replicaId: restarted.replicaId,
        }),
        'running',
      );
      const replay = await restarted.handler.handleCreateReplica(request);
      assert.equal(replay.status, 'already_exists');
      assert.equal(restarted.cellRuntime.instanceCount, 1);
      await restarted.cellRuntime.stop(restarted.replicaId);
    },
  );

  test('serializes concurrent starts into one live Component instance',
    async () => {
      const fixture = createFixture();
      await fixture.lifecycle.prepare(fixture.replica.definition, {});
      const starts = await Promise.all([
        fixture.lifecycle.start(fixture.replica),
        fixture.lifecycle.start(fixture.replica),
      ]);
      assert.deepEqual(
        starts.map((result) => result.status),
        [START_STATUS.RUNNING, START_STATUS.RUNNING],
      );
      assert.equal(fixture.cellRuntime.instanceCount, 1);
      assert.equal(
        (await fixture.lifecycle.health(fixture.replica)).status,
        HEALTH_STATUS.HEALTHY,
      );
      await fixture.lifecycle.stop(fixture.replica);
    },
  );

  test('linearizes an overlapping stop after an in-flight start',
    async () => {
      const fixture = createFixture();
      await fixture.lifecycle.prepare(fixture.replica.definition, {});
      const operations = await Promise.allSettled([
        fixture.lifecycle.start(fixture.replica),
        fixture.lifecycle.stop(fixture.replica),
      ]);
      assert.equal(operations[1].status, 'fulfilled');
      assert.equal(
        ['fulfilled', 'rejected'].includes(operations[0].status),
        true,
      );
      assert.equal(fixture.cellRuntime.instanceCount, 0);
      assert.equal(
        (await fixture.lifecycle.health(fixture.replica)).status,
        HEALTH_STATUS.UNHEALTHY,
      );
    },
  );

  test('linearizes both three-operation start and stop interleavings',
    async () => {
      const cell = boundRequestCell();
      const startFinal = new WasiComponentCellRuntime();
      const startFinalOperations = await Promise.all([
        startFinal.start(cell),
        startFinal.stop(cell.serviceId),
        startFinal.start(cell),
      ]);
      assert.deepEqual(startFinalOperations, [undefined, undefined, undefined]);
      assert.equal(startFinal.instanceCount, 1);
      assert.equal(await startFinal.health(cell.serviceId), true);
      await startFinal.stop(cell.serviceId);

      const stopFinal = new WasiComponentCellRuntime();
      await stopFinal.start(cell);
      const stopFinalOperations = await Promise.all([
        stopFinal.stop(cell.serviceId),
        stopFinal.start(cell),
        stopFinal.stop(cell.serviceId),
      ]);
      assert.deepEqual(stopFinalOperations, [undefined, undefined, undefined]);
      assert.equal(stopFinal.instanceCount, 0);
      assert.equal(await stopFinal.health(cell.serviceId), false);
    },
  );

  test('failed Artifact revalidation removes the previous live instance',
    async () => {
      let failRevalidation = false;
      const fixture = createFixture({
        artifactLoader: async () => {
          if (failRevalidation) {
            const error = new Error('payload revalidation failed');
            error.code = 'request_cell_artifact_unavailable';
            throw error;
          }
          return {
            artifactDigest: ARTIFACT_DIGEST,
            bytes: COMPONENT_BYTES,
            manifest: manifest(),
            manifestDigest: manifestDigest(manifest()),
            packageId: PACKAGE_ID,
            payloadDigest: PAYLOAD_DIGEST,
          };
        },
      });
      await fixture.lifecycle.prepare(fixture.replica.definition, {});
      await fixture.lifecycle.start(fixture.replica);
      failRevalidation = true;
      await assert.rejects(
        () => fixture.lifecycle.prepare(fixture.replica.definition, {}),
        /request_cell_artifact_unavailable/u,
      );
      assert.equal(fixture.cellRuntime.instanceCount, 0);
      assert.equal(
        (await fixture.lifecycle.health(fixture.replica)).status,
        HEALTH_STATUS.UNHEALTHY,
      );
    },
  );

  test('ACTIVE projection failure stops the Component and fails admission',
    async () => {
      const fixture = createFixture({failActiveProjection: true});
      await fixture.lifecycle.prepare(fixture.replica.definition, {});
      await assert.rejects(
        () => fixture.lifecycle.start(fixture.replica),
        /active projection unavailable/u,
      );
      assert.equal(fixture.cellRuntime.instanceCount, 0);
      assert.equal(
        (await fixture.lifecycle.health(fixture.replica)).status,
        HEALTH_STATUS.UNHEALTHY,
      );
      assert.equal(fixture.projections.at(-1).status, 'failed');
    },
  );

  test('keeps identity mismatch and corrupt Component startup non-ready',
    async () => {
      const mismatch = createFixture({
        artifactLoader: async () => ({
          artifactDigest: `sha256:${'c'.repeat(64)}`,
          bytes: COMPONENT_BYTES,
          manifest: manifest(),
          manifestDigest: manifestDigest(manifest()),
          packageId: PACKAGE_ID,
          payloadDigest: PAYLOAD_DIGEST,
        }),
      });
      await assert.rejects(
        () => mismatch.lifecycle.prepare(
          mismatch.replica.definition,
          {},
        ),
        /request_cell_artifact_mismatch/u,
      );
      await assertNotReady(mismatch);

      const corrupt = createFixture({bytes: Buffer.from('not-a-component')});
      await corrupt.lifecycle.prepare(corrupt.replica.definition, {});
      await assert.rejects(
        () => corrupt.lifecycle.start(corrupt.replica),
        /request_cell_/u,
      );
      await assertNotReady(corrupt);

      const unavailable = createFixture({
        artifactLoader: async () => {
          const error = new Error('payload unavailable');
          error.code = 'request_cell_artifact_unavailable';
          throw error;
        },
      });
      await assert.rejects(
        () => unavailable.lifecycle.prepare(
          unavailable.replica.definition,
          {},
        ),
        /request_cell_artifact_unavailable/u,
      );
      await assertNotReady(unavailable);
    },
  );
});
