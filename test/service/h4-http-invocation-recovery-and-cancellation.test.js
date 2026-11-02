/**
 * H4 — HTTP invocation recovery, replay, retention, and multi-waiter
 * cancellation proof (`request-call-lifecycle` evidence family for
 * `standard-http-service-api`).
 *
 * Proves:
 *   1. Completed-response replay on same-intent retry through the durable
 *      invocation owner (`RequestCellInvocationOwner` + `RequestCellHttpAdapter`)
 *      without re-executing the compiled Hono WASM component.
 *   2. Conflicting reuse (`INVOCATION_CONFLICT`, HTTP 409) when body bytes
 *      (including byte-distinct JSON with identical parsed meaning), query/URL,
 *      method, application headers, or explicit `bindingVersionId` change under
 *      the same key, while stripped hop-by-hop/credential headers do not alter
 *      semantic intent.
 *   3. Cross-principal isolation and pre-replay authorization enforcement:
 *      different principals choosing the same `Idempotency-Key` cannot retrieve
 *      each other's retained responses, and revoked credentials fail before
 *      replay.
 *   4. Mount revision pinning across retry and in-flight updates (`bv-1` ->
 *      `bv-2`): a key admitted on `bv-1` replays `bv-1` after the mount updates
 *      to `bv-2` (including after `bv-1` replica retirement and across a fresh
 *      adapter instance), while new keys route to `bv-2`.
 *   5. Retention window expiry (`INVOCATION_EXPIRED`, HTTP 410) when a retained
 *      record is retried past `retentionWindowMs`.
 *   6. Uncertain handler execution (`INVOCATION_AMBIGUOUS`, HTTP 503) without
 *      automatic handler rerun after completion-journal failure or post-start
 *      cancellation.
 *   7. Multi-waiter cancellation ownership (`CANCELLED`, HTTP 499): one waiter
 *      disconnecting detaches without cancelling work still owned by remaining
 *      waiters; when all waiters disconnect (or explicit `cancelInvocation` is
 *      called), the invocation aborts and subsequent retries return
 *      `INVOCATION_AMBIGUOUS` without rerunning the handler.
 */

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {after, before, describe, it} from 'node:test';

import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  RUNTIME_KIND,
  UNIFIED_SERVICE_TYPE,
} from '../../src/constants/index.js';
import {
  bindDeploymentArtifact,
  buildBindingRow,
  canonicalJson,
  normalizeDeploymentBinding,
  projectBinding,
} from '../../src/control-plane/owners/deployment-binding-contract.js';
import {
  buildActivatedRequestBindingServiceDefinition,
  buildRequestBindingServiceDefinition,
} from '../../src/control-plane/owners/request-binding-service-definition-contract.js';
import {
  handleRequestCellInvocation,
} from '../../src/node/runtime-service-request-cell-handler.js';
import {
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  RuntimeDriverRegistry,
} from '../../src/runtime/runtime-driver-registry.js';
import {
  ServiceRuntimeLifecycle,
} from '../../src/runtime/service-runtime-lifecycle.js';
import {
  WasiComponentCellRuntime,
} from '../../src/runtime/wasi-component-cell-runtime.js';
import {
  WasmComponentDriver,
} from '../../src/runtime/wasm-component-driver.js';
import {
  RequestBindingRouteResolver,
} from '../../src/service/request-binding-route-resolver.js';
import {
  RequestCellHttpAdapter,
} from '../../src/service/request-cell-http-adapter.js';
import {
  REQUEST_CELL_ROUTE_CLASSIFICATION,
  REQUEST_CELL_ROUTE_ERROR_CODE,
  RequestCellRoutingError,
} from '../../src/service/request-cell-routing-contract.js';
import {
  buildServiceComponent,
} from '../../src/service/service-component-build.js';
import {
  emitServiceEntry,
} from '../../src/service/service-entry-generator.js';
import {
  MemoryInvocationJournal,
} from './minimal-deployment-request-cell-routing-fixture.js';

const SERVICE_WORLD_V2 = 'service-cell-v2';
const HANDLE_REQUEST_EXPORT = 'handle-request';
const REQUEST_V2_INTERFACE = 'request_v2';
const FETCH_HANDLER_ID = 'fetch';
const REQUEST_SOURCE_KIND = 'request';
const WILDCARD_HOST = '*';
const MOUNT_PATH_PREFIX = '/api';
const UTF8_ENCODING = 'utf8';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const SHA256_PREFIX = 'sha256:';
const OCI_ARTIFACT_TYPE = 'oci';
const WASM_MEDIA_TYPE = 'application/wasm';
const TMP_PREFIX = 'lagrange-h4-test-';
const SERVICE_MODULE_FILENAME = 'lagrange.service.js';
const SERVICE_ENTRY_FILENAME = 'generated-entry.js';
const SERVICE_COMPONENT_FILENAME = 'service.component.wasm';
const RELATIVE_SERVICE_MODULE = './lagrange.service.js';

const TENANT_ID = 'tenant-h4';
const PRINCIPAL_ALICE = 'principal-alice';
const PRINCIPAL_BOB = 'principal-bob';
const REVOKED_TOKEN = 'Bearer revoked-token';
const BOB_TOKEN = 'Bearer bob-token';
const ALICE_TOKEN = 'Bearer alice-token';
const NODE_ID = 'node-h4-1';
const BINDING_NAME = 'orders-hono-h4--request--fetch';
const SERVICE_NAME = 'orders-hono-h4';
const SERVICE_VERSION_V1 = '0.5.0';
const SERVICE_VERSION_V2 = '0.5.1';
const ARTIFACT_REF_V1 = 'registry.example.test/acme/orders-hono-h4:0.5.0';
const ARTIFACT_REF_V2 = 'registry.example.test/acme/orders-hono-h4:0.5.1';
const PACKAGE_ID_V1 = `service-package-${'1'.repeat(64)}`;
const PACKAGE_ID_V2 = `service-package-${'2'.repeat(64)}`;
const GENERATION_V1 = 1;
const GENERATION_V2 = 2;
const CREATED_AT_V1 = 1001;
const CREATED_AT_V2 = 2002;
const RETENTION_WINDOW_MS = 60_000;
const EXPIRED_ADVANCE_MS = 65_000;
const MAX_INPUT_BYTES = 16_384;
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_CONFLICT = 409;
const HTTP_STATUS_GONE = 410;
const HTTP_STATUS_CANCELLED = 499;
const HTTP_STATUS_SERVICE_UNAVAILABLE = 503;

const ROLES_APPLICATION = Object.freeze(['application', 'reader']);
const ADMIN_SECURITY_CONTEXT = Object.freeze({
  principal: PRINCIPAL_ALICE,
  roles: ROLES_APPLICATION,
  tenantId: TENANT_ID,
});

const RUNTIME_BUDGETS = Object.freeze({
  context_bytes: 65536,
  cpu_time_ms: 5000,
  input_bytes: 262144,
  memory_bytes: 128 * 1024 * 1024,
  output_bytes: 262144,
  wall_time_ms: 30000,
});

function buildH4ServiceSource(revisionLabel, serviceVersion) {
  return `
import {Hono} from 'hono';
import {defineService} from 'lagrange-server/authoring';

let instanceSequence = 0;
const app = new Hono();

app.all('/api/orders', async (c) => {
  instanceSequence += 1;
  const rawBody = await c.req.text();
  return c.json({
    bodyText: rawBody,
    customVariant: c.req.header('x-idempotent-variant') || null,
    instanceSequence,
    method: c.req.method,
    principal: c.env.principal,
    queryTag: c.req.query('tag') || null,
    revision: '${revisionLabel}',
    tenantId: c.env.tenantId,
  }, 200, {
    'x-service-revision': '${revisionLabel}',
  });
});

export default defineService({
  name: '${SERVICE_NAME}',
  version: '${serviceVersion}',
  mount: '${MOUNT_PATH_PREFIX}',
  operations: {},
  fetch: (request, env) => app.fetch(request, env),
});
`;
}

function sha256Digest(value) {
  return `${SHA256_PREFIX}${createHash(HASH_ALGORITHM)
    .update(value)
    .digest(HASH_ENCODING)}`;
}

function createMockReply() {
  let statusCode = HTTP_STATUS_OK;
  const headers = {};
  return {
    code(c) {
      statusCode = c;
      return this;
    },
    getHeaders() {
      return headers;
    },
    getStatusCode() {
      return statusCode;
    },
    header(k, v) {
      headers[k.toLowerCase()] = v;
      return this;
    },
  };
}

function createInMemoryTableCache() {
  const tables = new Map();
  return {
    delete(tableName, key) {
      tables.get(tableName)?.delete(key);
    },
    get(tableName, key) {
      return tables.get(tableName)?.get(key) ?? null;
    },
    getAll(tableName) {
      const table = tables.get(tableName);
      return table ? [...table.values()] : [];
    },
    set(tableName, key, row) {
      if (!tables.has(tableName)) {
        tables.set(tableName, new Map());
      }
      tables.get(tableName).set(key, row);
    },
  };
}

async function compileHonoComponent(baseDir, subdirName, sourceText) {
  const workDir = path.join(baseDir, subdirName);
  await fs.mkdir(workDir, {recursive: true});
  const modulePath = path.join(workDir, SERVICE_MODULE_FILENAME);
  const entryPath = path.join(workDir, SERVICE_ENTRY_FILENAME);
  const componentPath = path.join(workDir, SERVICE_COMPONENT_FILENAME);
  await fs.writeFile(modulePath, sourceText, UTF8_ENCODING);
  await emitServiceEntry({
    moduleSpecifier: RELATIVE_SERVICE_MODULE,
    outputPath: entryPath,
    world: SERVICE_WORLD_V2,
  });
  const built = await buildServiceComponent({
    entryPath,
    outputPath: componentPath,
    worldName: SERVICE_WORLD_V2,
  });
  return built.component;
}

function createFetchDeploymentRows({
  artifactRef,
  componentBytes,
  createdAt,
  generation,
  packageId,
  serviceVersion,
}) {
  const payloadDigest = sha256Digest(componentBytes);
  const manifest = {
    artifact: {
      digest: payloadDigest,
      media_type: WASM_MEDIA_TYPE,
      ref: artifactRef,
      type: OCI_ARTIFACT_TYPE,
    },
    capabilities: [],
    exports: [
      {
        interface: REQUEST_V2_INTERFACE,
        name: HANDLE_REQUEST_EXPORT,
      },
    ],
    name: SERVICE_NAME,
    runtime: {kind: RUNTIME_KIND.WASM_COMPONENT},
    schema_version: 3,
    version: serviceVersion,
  };
  const manifestDigest = sha256Digest(canonicalJson(manifest));
  const artifact = {
    artifactDigest: payloadDigest,
    bytes: componentBytes,
    manifest,
    manifestDigest,
    packageId,
    payloadDigest,
  };
  const declaration = {
    budgets: RUNTIME_BUDGETS,
    name: BINDING_NAME,
    schema_version: 3,
    source: {
      host: WILDCARD_HOST,
      kind: REQUEST_SOURCE_KIND,
      path_prefix: MOUNT_PATH_PREFIX,
    },
    target: {
      handler_id: FETCH_HANDLER_ID,
      interface: REQUEST_V2_INTERFACE,
      manifest_digest: manifestDigest,
      package_id: packageId,
    },
  };
  const bound = bindDeploymentArtifact(
    normalizeDeploymentBinding(declaration),
    artifact,
  );
  const bindingRow = buildBindingRow(
    bound,
    ADMIN_SECURITY_CONTEXT,
    createdAt,
    generation,
  );
  const binding = projectBinding(bindingRow);
  const definition = buildActivatedRequestBindingServiceDefinition(
    buildRequestBindingServiceDefinition(bindingRow, artifact),
    binding,
  );
  const replicaId = `${definition.service_id}-r1`;
  const actualRow = {
    created_at: createdAt,
    definition_id: definition.service_id,
    node_id: NODE_ID,
    service_id: replicaId,
    service_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    status: ReplicaStatus.ACTIVE,
    updated_at: createdAt,
  };
  return {actualRow, artifact, binding, bindingRow, definition, replicaId};
}

function registerDeploymentRowsInCache(cache, rows) {
  cache.set(
    SYSTEM_TABLE_NAME.SERVICE_BINDINGS,
    rows.bindingRow.binding_version_id,
    rows.bindingRow,
  );
  cache.set(
    SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
    rows.definition.service_id,
    rows.definition,
  );
  cache.set(
    SYSTEM_TABLE_NAME.SERVICES,
    rows.actualRow.service_id,
    rows.actualRow,
  );
}

async function createAndStartFetchRuntime(rows, journal, gateController = null) {
  const cellRuntime = new WasiComponentCellRuntime();
  const driver = new WasmComponentDriver({
    artifactLoader: async () => rows.artifact,
    componentRuntime: cellRuntime,
  });
  let componentInvocationCount = 0;
  const driverInvoke = driver.invoke.bind(driver);
  driver.invoke = async (...args) => {
    componentInvocationCount += 1;
    if (gateController?.onEnter) {
      await gateController.onEnter();
    }
    return driverInvoke(...args);
  };
  const registry = new RuntimeDriverRegistry();
  registry.register(driver);
  registry.freeze();
  const lifecycle = new ServiceRuntimeLifecycle(registry);
  lifecycle.setQueryExecutorFactory(() => journal.createExecutor());
  lifecycle.setStateProjectionWriter(async () => {});
  const replicaHandle = {
    ...rows.definition,
    entityId: rows.definition.service_id,
    nodeId: NODE_ID,
    replicaId: rows.replicaId,
    serviceId: rows.replicaId,
    serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
  };
  await lifecycle.prepare(replicaHandle, {});
  await lifecycle.start(replicaHandle);
  return {
    cellRuntime,
    driver,
    get componentInvocationCount() {
      return componentInvocationCount;
    },
    lifecycle,
    replicaHandle,
  };
}

function authenticateTestRequest(request) {
  const authHeader = request.headers?.authorization;
  if (authHeader === REVOKED_TOKEN) {
    throw new RequestCellRoutingError(
      REQUEST_CELL_ROUTE_ERROR_CODE.UNAUTHENTICATED,
      'Credentials have been revoked',
      {
        classification: REQUEST_CELL_ROUTE_CLASSIFICATION.TERMINAL,
        httpStatus: HTTP_STATUS_UNAUTHORIZED,
      },
    );
  }
  const principal = authHeader === BOB_TOKEN ? PRINCIPAL_BOB : PRINCIPAL_ALICE;
  return {
    principal,
    roles: ROLES_APPLICATION,
    tenantId: TENANT_ID,
  };
}

describe('H4 — HTTP invocation recovery, replay, retention, and cancellation', () => {
  let tmpDir;
  let componentBytesV1;
  let componentBytesV2;
  let rowsV1;
  let rowsV2;
  let journal;
  let cache;
  let routeResolver;
  let runtimeV1;
  let runtimeV2;
  let localReplicas;
  let runtimeByServiceId;
  let clockOffsetMs;
  let gateHook;
  let adapter;

  function buildRuntimeHandlerForService(serviceId) {
    const activeRuntime = runtimeByServiceId.get(serviceId) || runtimeV1;
    return {
      localReplicas,
      nodeId: NODE_ID,
      requestBindingRouteResolver: routeResolver,
      serviceRuntimeLifecycle: activeRuntime.lifecycle,
    };
  }

  function createAdapterInstance(retentionWindowMs = RETENTION_WINDOW_MS) {
    return new RequestCellHttpAdapter({
      authenticateRequest: async (req) => authenticateTestRequest(req),
      cancelRuntimeInvocation: (tenantId, invocationId) => {
        for (const rt of runtimeByServiceId.values()) {
          rt.lifecycle.cancelInvocation(tenantId, invocationId);
        }
      },
      maxInputBytes: MAX_INPUT_BYTES,
      now: () => Date.now() + clockOffsetMs,
      retentionWindowMs,
      routeResolver,
      serviceDispatcher: {
        async dispatch(envelope) {
          const handler = buildRuntimeHandlerForService(envelope.serviceId);
          const answer = await handleRequestCellInvocation(handler, envelope);
          return {answer};
        },
      },
    });
  }

  before(async () => {
    clockOffsetMs = 0;
    gateHook = null;
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX));
    componentBytesV1 = await compileHonoComponent(
      tmpDir,
      'v1',
      buildH4ServiceSource('v1', SERVICE_VERSION_V1),
    );
    componentBytesV2 = await compileHonoComponent(
      tmpDir,
      'v2',
      buildH4ServiceSource('v2', SERVICE_VERSION_V2),
    );

    rowsV1 = createFetchDeploymentRows({
      artifactRef: ARTIFACT_REF_V1,
      componentBytes: componentBytesV1,
      createdAt: CREATED_AT_V1,
      generation: GENERATION_V1,
      packageId: PACKAGE_ID_V1,
      serviceVersion: SERVICE_VERSION_V1,
    });
    rowsV2 = createFetchDeploymentRows({
      artifactRef: ARTIFACT_REF_V2,
      componentBytes: componentBytesV2,
      createdAt: CREATED_AT_V2,
      generation: GENERATION_V2,
      packageId: PACKAGE_ID_V2,
      serviceVersion: SERVICE_VERSION_V2,
    });

    journal = new MemoryInvocationJournal();
    cache = createInMemoryTableCache();
    registerDeploymentRowsInCache(cache, rowsV1);
    routeResolver = new RequestBindingRouteResolver({
      systemTableCache: cache,
    });

    const gateController = {
      async onEnter() {
        if (typeof gateHook === 'function') {
          await gateHook();
        }
      },
    };
    runtimeV1 = await createAndStartFetchRuntime(rowsV1, journal, gateController);
    runtimeV2 = await createAndStartFetchRuntime(rowsV2, journal, gateController);

    runtimeByServiceId = new Map([
      [rowsV1.definition.service_id, runtimeV1],
      [rowsV2.definition.service_id, runtimeV2],
    ]);
    localReplicas = new Map([
      [
        rowsV1.replicaId,
        {
          entityId: rowsV1.definition.service_id,
          replicaHandle: runtimeV1.replicaHandle,
          replicaId: rowsV1.replicaId,
          status: ReplicaStatus.ACTIVE,
        },
      ],
    ]);

    adapter = createAdapterInstance();
  });

  after(async () => {
    if (runtimeV1) {
      await runtimeV1.cellRuntime.shutdown();
    }
    if (runtimeV2) {
      await runtimeV2.cellRuntime.shutdown();
    }
    if (tmpDir) {
      await fs.rm(tmpDir, {force: true, recursive: true});
    }
  });

  describe('request-call-lifecycle: keyed HTTP replay, conflict, and principal isolation', () => {
    it('replays a completed response on same-intent retry without re-executing the Hono component', async () => {
      const beforeCount = runtimeV1.componentInvocationCount;
      const requestPayload = {
        body: '{"orderId":101,"items":[1,2]}',
        headers: {
          'authorization': ALICE_TOKEN,
          'content-type': 'application/json',
          'idempotency-key': 'replay-key-1',
          'keep-alive': 'timeout=5',
          'x-idempotent-variant': 'standard',
        },
        method: 'POST',
        url: 'http://localhost/api/orders?tag=first',
      };

      const reply1 = createMockReply();
      const body1 = await adapter.handle(requestPayload, reply1);
      assert.equal(reply1.getStatusCode(), HTTP_STATUS_OK);
      const parsed1 = JSON.parse(body1);
      assert.equal(parsed1.revision, 'v1');
      assert.equal(parsed1.principal, PRINCIPAL_ALICE);
      assert.equal(parsed1.queryTag, 'first');
      assert.equal(parsed1.customVariant, 'standard');
      assert.equal(runtimeV1.componentInvocationCount, beforeCount + 1);

      // Retry with different hop-by-hop/credential headers but identical semantic intent
      const reply2 = createMockReply();
      const body2 = await adapter.handle({
        ...requestPayload,
        headers: {
          'authorization': 'Bearer alice-refreshed-jwt',
          'content-type': 'application/json',
          'idempotency-key': 'replay-key-1',
          'keep-alive': 'timeout=30',
          'x-idempotent-variant': 'standard',
        },
      }, reply2);
      assert.equal(reply2.getStatusCode(), HTTP_STATUS_OK);
      const parsed2 = JSON.parse(body2);
      assert.deepEqual(parsed2, parsed1);
      assert.equal(
        runtimeV1.componentInvocationCount,
        beforeCount + 1,
        'completed response must replay from durable journal without invoking component again',
      );
    });

    it('rejects changed body bytes, query, method, or application headers under the same key with INVOCATION_CONFLICT', async () => {
      const baseHeaders = {
        'authorization': ALICE_TOKEN,
        'content-type': 'application/json',
        'idempotency-key': 'conflict-key-1',
        'x-idempotent-variant': 'v-a',
      };
      const firstReply = createMockReply();
      await adapter.handle({
        body: '{"a":1,"b":2}',
        headers: baseHeaders,
        method: 'POST',
        url: 'http://localhost/api/orders?tag=alpha',
      }, firstReply);
      assert.equal(firstReply.getStatusCode(), HTTP_STATUS_OK);

      // 1. Byte-distinct JSON body with identical parsed meaning conflicts
      const jsonOrderReply = createMockReply();
      const jsonOrderOutcome = await adapter.handle({
        body: '{"b":2, "a":1}',
        headers: baseHeaders,
        method: 'POST',
        url: 'http://localhost/api/orders?tag=alpha',
      }, jsonOrderReply);
      assert.equal(jsonOrderReply.getStatusCode(), HTTP_STATUS_CONFLICT);
      assert.equal(
        jsonOrderOutcome.code,
        REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_CONFLICT,
      );

      // 2. Changed query string conflicts
      const queryConflictReply = createMockReply();
      const queryConflictOutcome = await adapter.handle({
        body: '{"a":1,"b":2}',
        headers: baseHeaders,
        method: 'POST',
        url: 'http://localhost/api/orders?tag=beta',
      }, queryConflictReply);
      assert.equal(queryConflictReply.getStatusCode(), HTTP_STATUS_CONFLICT);
      assert.equal(
        queryConflictOutcome.code,
        REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_CONFLICT,
      );

      // 3. Changed HTTP method conflicts
      const methodConflictReply = createMockReply();
      const methodConflictOutcome = await adapter.handle({
        body: '{"a":1,"b":2}',
        headers: baseHeaders,
        method: 'PUT',
        url: 'http://localhost/api/orders?tag=alpha',
      }, methodConflictReply);
      assert.equal(methodConflictReply.getStatusCode(), HTTP_STATUS_CONFLICT);
      assert.equal(
        methodConflictOutcome.code,
        REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_CONFLICT,
      );

      // 4. Changed application-visible header conflicts
      const headerConflictReply = createMockReply();
      const headerConflictOutcome = await adapter.handle({
        body: '{"a":1,"b":2}',
        headers: {
          ...baseHeaders,
          'x-idempotent-variant': 'v-b',
        },
        method: 'POST',
        url: 'http://localhost/api/orders?tag=alpha',
      }, headerConflictReply);
      assert.equal(headerConflictReply.getStatusCode(), HTTP_STATUS_CONFLICT);
      assert.equal(
        headerConflictOutcome.code,
        REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_CONFLICT,
      );
    });

    it('isolates retained responses across principals and enforces authentication before replay', async () => {
      const sharedKey = 'cross-principal-shared-key';
      const aliceReply = createMockReply();
      const aliceBody = await adapter.handle({
        body: '{"secret":"alice-only"}',
        headers: {
          'authorization': ALICE_TOKEN,
          'content-type': 'application/json',
          'idempotency-key': sharedKey,
        },
        method: 'POST',
        url: 'http://localhost/api/orders',
      }, aliceReply);
      assert.equal(aliceReply.getStatusCode(), HTTP_STATUS_OK);
      const aliceParsed = JSON.parse(aliceBody);
      assert.equal(aliceParsed.principal, PRINCIPAL_ALICE);
      assert.equal(aliceParsed.bodyText, '{"secret":"alice-only"}');

      // Principal Bob sending the same Idempotency-Key runs an isolated invocation
      const beforeBobCount = runtimeV1.componentInvocationCount;
      const bobReply = createMockReply();
      const bobBody = await adapter.handle({
        body: '{"secret":"bob-payload"}',
        headers: {
          'authorization': BOB_TOKEN,
          'content-type': 'application/json',
          'idempotency-key': sharedKey,
        },
        method: 'POST',
        url: 'http://localhost/api/orders',
      }, bobReply);
      assert.equal(bobReply.getStatusCode(), HTTP_STATUS_OK);
      const bobParsed = JSON.parse(bobBody);
      assert.equal(bobParsed.principal, PRINCIPAL_BOB);
      assert.equal(bobParsed.bodyText, '{"secret":"bob-payload"}');
      assert.equal(runtimeV1.componentInvocationCount, beforeBobCount + 1);

      // Revoked credentials cannot bypass auth via retained response
      const revokedReply = createMockReply();
      const revokedOutcome = await adapter.handle({
        body: '{"secret":"alice-only"}',
        headers: {
          'authorization': REVOKED_TOKEN,
          'content-type': 'application/json',
          'idempotency-key': sharedKey,
        },
        method: 'POST',
        url: 'http://localhost/api/orders',
      }, revokedReply);
      assert.equal(revokedReply.getStatusCode(), HTTP_STATUS_UNAUTHORIZED);
      assert.equal(
        revokedOutcome.code,
        REQUEST_CELL_ROUTE_ERROR_CODE.UNAUTHENTICATED,
      );
    });
  });

  describe('request-call-lifecycle: mount revision pinning across retry and in-flight updates', () => {
    it('preserves pinned revision on retry and in-flight execution when the mount updates from v1 to v2', async () => {
      // 1. Admit key 'mount-pin-completed' on v1 before v2 is registered
      const completedOnV1Reply = createMockReply();
      const completedOnV1Body = await adapter.handle({
        body: '{"step":"admitted-on-v1"}',
        headers: {
          'authorization': ALICE_TOKEN,
          'content-type': 'application/json',
          'idempotency-key': 'mount-pin-completed',
        },
        method: 'POST',
        url: 'http://localhost/api/orders',
      }, completedOnV1Reply);
      assert.equal(completedOnV1Reply.getStatusCode(), HTTP_STATUS_OK);
      assert.equal(JSON.parse(completedOnV1Body).revision, 'v1');

      // 2. Start an in-flight request on v1, then activate v2 on the same mount while v1 is in flight
      let releaseInFlightV1;
      let markInFlightV1Entered;
      const inFlightV1Entered = new Promise((resolve) => {
        markInFlightV1Entered = resolve;
      });
      const inFlightV1Gate = new Promise((resolve) => {
        releaseInFlightV1 = resolve;
      });
      gateHook = async () => {
        gateHook = null;
        markInFlightV1Entered();
        await inFlightV1Gate;
      };

      const inFlightReply1 = createMockReply();
      const inFlightPromise1 = adapter.handle({
        body: '{"step":"inflight-on-v1"}',
        headers: {
          'authorization': ALICE_TOKEN,
          'content-type': 'application/json',
          'idempotency-key': 'mount-pin-inflight',
        },
        method: 'POST',
        url: 'http://localhost/api/orders',
      }, inFlightReply1);

      await inFlightV1Entered;

      // Activate generation 2 (v2) on the same /api mount while inFlightPromise1 is executing on v1
      registerDeploymentRowsInCache(cache, rowsV2);
      localReplicas.set(rowsV2.replicaId, {
        entityId: rowsV2.definition.service_id,
        replicaHandle: runtimeV2.replicaHandle,
        replicaId: rowsV2.replicaId,
        status: ReplicaStatus.ACTIVE,
      });

      // Second waiter joining 'mount-pin-inflight' must join the pinned v1 execution
      const inFlightReply2 = createMockReply();
      const inFlightPromise2 = adapter.handle({
        body: '{"step":"inflight-on-v1"}',
        headers: {
          'authorization': ALICE_TOKEN,
          'content-type': 'application/json',
          'idempotency-key': 'mount-pin-inflight',
        },
        method: 'POST',
        url: 'http://localhost/api/orders',
      }, inFlightReply2);

      // Concurrent new key 'mount-new-on-v2' must route to the newly active v2 revision
      const newKeyV2Reply = createMockReply();
      const newKeyV2Body = await adapter.handle({
        body: '{"step":"new-key-on-v2"}',
        headers: {
          'authorization': ALICE_TOKEN,
          'content-type': 'application/json',
          'idempotency-key': 'mount-new-on-v2',
        },
        method: 'POST',
        url: 'http://localhost/api/orders',
      }, newKeyV2Reply);
      assert.equal(newKeyV2Reply.getStatusCode(), HTTP_STATUS_OK);
      assert.equal(JSON.parse(newKeyV2Body).revision, 'v2');

      // Release in-flight v1 request and verify both waiters receive v1
      releaseInFlightV1();
      const [bodyWaiter1, bodyWaiter2] = await Promise.all([
        inFlightPromise1,
        inFlightPromise2,
      ]);
      assert.equal(inFlightReply1.getStatusCode(), HTTP_STATUS_OK);
      assert.equal(inFlightReply2.getStatusCode(), HTTP_STATUS_OK);
      assert.equal(JSON.parse(bodyWaiter1).revision, 'v1');
      assert.equal(JSON.parse(bodyWaiter2).revision, 'v1');

      // 3. Retire v1's active actual row so only v2 is ready on the mount, and verify
      //    a fresh adapter still replays 'mount-pin-completed' (v1) from the durable journal
      cache.delete(SYSTEM_TABLE_NAME.SERVICES, rowsV1.actualRow.service_id);
      const freshAdapter = createAdapterInstance();
      const replayAfterUpdateReply = createMockReply();
      const replayAfterUpdateBody = await freshAdapter.handle({
        body: '{"step":"admitted-on-v1"}',
        headers: {
          'authorization': ALICE_TOKEN,
          'content-type': 'application/json',
          'idempotency-key': 'mount-pin-completed',
        },
        method: 'POST',
        url: 'http://localhost/api/orders',
      }, replayAfterUpdateReply);
      assert.equal(replayAfterUpdateReply.getStatusCode(), HTTP_STATUS_OK);
      assert.equal(JSON.parse(replayAfterUpdateBody).revision, 'v1');

      // 4. Explicitly requesting bindingVersionId of v2 on a key pinned to v1 conflicts
      const explicitVersionConflictReply = createMockReply();
      const explicitVersionConflictOutcome = await freshAdapter.handle({
        bindingVersionId: rowsV2.bindingRow.binding_version_id,
        body: '{"step":"admitted-on-v1"}',
        headers: {
          'authorization': ALICE_TOKEN,
          'content-type': 'application/json',
          'idempotency-key': 'mount-pin-completed',
        },
        method: 'POST',
        url: 'http://localhost/api/orders',
      }, explicitVersionConflictReply);
      assert.equal(explicitVersionConflictReply.getStatusCode(), HTTP_STATUS_CONFLICT);
      assert.equal(
        explicitVersionConflictOutcome.code,
        REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_CONFLICT,
      );
    });
  });

  describe('request-call-lifecycle: retention expiry, uncertain execution, and multi-waiter cancellation', () => {
    it('returns INVOCATION_EXPIRED (HTTP 410) when a retained key is retried past the retention window', async () => {
      const expirableKey = 'retention-expiry-key-1';
      const initialReply = createMockReply();
      await adapter.handle({
        body: '{"check":"retention"}',
        headers: {
          'authorization': ALICE_TOKEN,
          'content-type': 'application/json',
          'idempotency-key': expirableKey,
        },
        method: 'POST',
        url: 'http://localhost/api/orders',
      }, initialReply);
      assert.equal(initialReply.getStatusCode(), HTTP_STATUS_OK);

      // Advance clock past RETENTION_WINDOW_MS
      clockOffsetMs += EXPIRED_ADVANCE_MS;
      try {
        const expiredReply = createMockReply();
        const expiredOutcome = await adapter.handle({
          body: '{"check":"retention"}',
          headers: {
            'authorization': ALICE_TOKEN,
            'content-type': 'application/json',
            'idempotency-key': expirableKey,
          },
          method: 'POST',
          url: 'http://localhost/api/orders',
        }, expiredReply);
        assert.equal(expiredReply.getStatusCode(), HTTP_STATUS_GONE);
        assert.equal(
          expiredOutcome.code,
          REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_EXPIRED,
        );
      } finally {
        clockOffsetMs = 0;
      }
    });

    it('returns INVOCATION_AMBIGUOUS (HTTP 503) and refuses to rerun the handler after uncertain completion journaling', async () => {
      const beforeV2Count = runtimeV2.componentInvocationCount;
      journal.failNextCompletion();

      const firstReply = createMockReply();
      const firstOutcome = await adapter.handle({
        body: '{"effect":"charge-card"}',
        headers: {
          'authorization': ALICE_TOKEN,
          'content-type': 'application/json',
          'idempotency-key': 'uncertain-journal-key-1',
        },
        method: 'POST',
        url: 'http://localhost/api/orders',
      }, firstReply);
      assert.equal(firstReply.getStatusCode(), HTTP_STATUS_SERVICE_UNAVAILABLE);
      assert.equal(
        firstOutcome.code,
        REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_AMBIGUOUS,
      );
      assert.equal(firstOutcome.invoked, true);
      assert.equal(runtimeV2.componentInvocationCount, beforeV2Count + 1);

      // Retrying the same key must NOT re-execute the handler and must return INVOCATION_AMBIGUOUS
      const retryReply = createMockReply();
      const retryOutcome = await adapter.handle({
        body: '{"effect":"charge-card"}',
        headers: {
          'authorization': ALICE_TOKEN,
          'content-type': 'application/json',
          'idempotency-key': 'uncertain-journal-key-1',
        },
        method: 'POST',
        url: 'http://localhost/api/orders',
      }, retryReply);
      assert.equal(retryReply.getStatusCode(), HTTP_STATUS_SERVICE_UNAVAILABLE);
      assert.equal(
        retryOutcome.code,
        REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_AMBIGUOUS,
      );
      assert.equal(
        runtimeV2.componentInvocationCount,
        beforeV2Count + 1,
        'uncertain handler execution must never automatically rerun on retry',
      );
    });

    it('detaches a single disconnected waiter without cancelling work still owned by a second waiter, and aborts when all waiters disconnect', async () => {
      // Case 1: Waiter 1 disconnects while Waiter 2 stays connected -> Waiter 2 succeeds
      let releaseCase1;
      let markCase1Entered;
      const case1Entered = new Promise((resolve) => {
        markCase1Entered = resolve;
      });
      const case1Gate = new Promise((resolve) => {
        releaseCase1 = resolve;
      });
      gateHook = async () => {
        gateHook = null;
        markCase1Entered();
        await case1Gate;
      };

      const waiter1Controller = new AbortController();
      const waiter2Controller = new AbortController();
      const case1Key = 'two-waiters-one-detaches';

      const waiter1Reply = createMockReply();
      const waiter1Promise = adapter.handle({
        body: '{"waiters":2}',
        headers: {
          'authorization': ALICE_TOKEN,
          'content-type': 'application/json',
          'idempotency-key': case1Key,
        },
        method: 'POST',
        signal: waiter1Controller.signal,
        url: 'http://localhost/api/orders',
      }, waiter1Reply);

      await case1Entered;

      const waiter2Reply = createMockReply();
      const waiter2Promise = adapter.handle({
        body: '{"waiters":2}',
        headers: {
          'authorization': ALICE_TOKEN,
          'content-type': 'application/json',
          'idempotency-key': case1Key,
        },
        method: 'POST',
        signal: waiter2Controller.signal,
        url: 'http://localhost/api/orders',
      }, waiter2Reply);

      // Allow Waiter 2 to complete async authentication and attach to the in-flight key
      await new Promise((resolve) => setImmediate(resolve));

      // Disconnect Waiter 1 only
      waiter1Controller.abort();
      const waiter1Outcome = await waiter1Promise;
      assert.equal(waiter1Reply.getStatusCode(), HTTP_STATUS_CANCELLED);
      assert.equal(
        waiter1Outcome.code,
        REQUEST_CELL_ROUTE_ERROR_CODE.CANCELLED,
      );

      // Release execution -> Waiter 2 completes normally with HTTP 200
      releaseCase1();
      const waiter2Body = await waiter2Promise;
      assert.equal(waiter2Reply.getStatusCode(), HTTP_STATUS_OK);
      assert.equal(JSON.parse(waiter2Body).bodyText, '{"waiters":2}');

      // Case 2: Both Waiter 1 and Waiter 2 disconnect -> invocation aborts and retry is INVOCATION_AMBIGUOUS
      let releaseCase2;
      let markCase2Entered;
      const case2Entered = new Promise((resolve) => {
        markCase2Entered = resolve;
      });
      const case2Gate = new Promise((resolve) => {
        releaseCase2 = resolve;
      });
      gateHook = async () => {
        gateHook = null;
        markCase2Entered();
        await case2Gate;
      };

      const beforeCase2Count = runtimeV2.componentInvocationCount;
      const both1Controller = new AbortController();
      const both2Controller = new AbortController();
      const case2Key = 'two-waiters-both-disconnect';

      const both1Reply = createMockReply();
      const both1Promise = adapter.handle({
        body: '{"waiters":"both-abort"}',
        headers: {
          'authorization': ALICE_TOKEN,
          'content-type': 'application/json',
          'idempotency-key': case2Key,
        },
        method: 'POST',
        signal: both1Controller.signal,
        url: 'http://localhost/api/orders',
      }, both1Reply);

      await case2Entered;

      const both2Reply = createMockReply();
      const both2Promise = adapter.handle({
        body: '{"waiters":"both-abort"}',
        headers: {
          'authorization': ALICE_TOKEN,
          'content-type': 'application/json',
          'idempotency-key': case2Key,
        },
        method: 'POST',
        signal: both2Controller.signal,
        url: 'http://localhost/api/orders',
      }, both2Reply);

      // Allow Waiter 2 to complete async authentication and attach to the in-flight key
      await new Promise((resolve) => setImmediate(resolve));

      // Disconnect both waiters
      both1Controller.abort();
      both2Controller.abort();

      const [both1Outcome, both2Outcome] = await Promise.all([
        both1Promise,
        both2Promise,
      ]);
      assert.equal(both1Reply.getStatusCode(), HTTP_STATUS_CANCELLED);
      assert.equal(both2Reply.getStatusCode(), HTTP_STATUS_CANCELLED);
      assert.equal(both1Outcome.code, REQUEST_CELL_ROUTE_ERROR_CODE.CANCELLED);
      assert.equal(both2Outcome.code, REQUEST_CELL_ROUTE_ERROR_CODE.CANCELLED);

      // Release the underlying gate so the driver promise settles cleanly
      releaseCase2();

      // Retry after post-start cancellation must return INVOCATION_AMBIGUOUS without rerunning the handler
      const retryCancelledReply = createMockReply();
      const retryCancelledOutcome = await adapter.handle({
        body: '{"waiters":"both-abort"}',
        headers: {
          'authorization': ALICE_TOKEN,
          'content-type': 'application/json',
          'idempotency-key': case2Key,
        },
        method: 'POST',
        url: 'http://localhost/api/orders',
      }, retryCancelledReply);
      assert.equal(
        retryCancelledReply.getStatusCode(),
        HTTP_STATUS_SERVICE_UNAVAILABLE,
      );
      assert.equal(
        retryCancelledOutcome.code,
        REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_AMBIGUOUS,
      );
      assert.equal(
        runtimeV2.componentInvocationCount,
        beforeCase2Count + 1,
        'post-start cancelled invocation must not rerun handler on retry',
      );
    });
  });
});
