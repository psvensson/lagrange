/**
 * H3 — Fetch ingress fidelity and request-scoped client composition proof
 * (`fetch-http-semantics` and `request-call-lifecycle` evidence families for
 * `standard-http-service-api`).
 *
 * Proves:
 *   1. Honest Fetch HTTP envelope fidelity through `RequestCellHttpAdapter`,
 *      `RuntimeServiceRequestCellHandler`, and a real compiled Hono WASM
 *      component:
 *      - Raw binary (`Uint8Array`), plain text, and malformed JSON bodies pass
 *        through ingress without automatic JSON-object coercion.
 *      - Byte-distinct JSON bodies with identical parsed meaning produce
 *        distinct `requestDigest` and `intentDigest` values.
 *      - Early input byte budget (`maxInputBytes`) rejects oversized bodies
 *        with `request_cell_budget_exhausted` (HTTP 413).
 *      - Admitted URL preserves query order, repeated keys, and encoding, and
 *        rejects encoded path-traversal smuggling.
 *      - Forged Lagrange authority headers are rejected (case-insensitively),
 *        hop-by-hop headers (including `Connection`-listed tokens) and
 *        consumed ingress credentials (`authorization`, `x-lagrange-token`)
 *        are stripped, and ordinary application headers are forwarded.
 *      - Multiple `Set-Cookie` headers, `HEAD` empty-body semantics, and
 *        body-forbidden status codes (`204`, `304`) are honored end to end.
 *   2. Request-scoped client and invocation lifetime in the compiled Hono
 *      WASM component, `WasiComponentCellRuntime`, `cell-host-call-protocol`,
 *      and `createRequestCellCallBridge`:
 *      - Readonly `principal`, `tenantId`, `roles`, `deadlineMs`, and
 *        `AbortSignal` on `c.env`.
 *      - Sequential multi-call fan-out allocates incrementing child identities
 *        (`<invocationId>#call-1`, `<invocationId>#call-2`, `<invocationId>#call-3`).
 *      - Concurrent calls (`Promise.all`) in the compiled WASM guest are
 *        refused with `unsupported_concurrency` (`retryable: false`) without
 *        silently serializing across the blocking host bridge.
 *      - Retained client references across requests and lazy `ReadableStream`
 *        callbacks after `service.fetch` returns reject with
 *        `request_client_closed`.
 *      - Returning from `service.fetch` with an unawaited child call in flight
 *        fails with `unfinished_child_work` and fences the worker instance.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {after, before, describe, it} from 'node:test';

import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  UNIFIED_SERVICE_TYPE,
} from '../../src/constants/unified-service-lifecycle.js';
import {
  bindDeploymentArtifact,
  buildBindingRow,
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
  DEFAULT_REQUEST_HOST_CALL_BUDGET,
  HOST_CALL_ERROR_CODE,
} from '../../src/runtime/cell-host-call-protocol.js';
import {
  HEALTH_STATUS,
} from '../../src/runtime/runtime-driver.js';
import {
  WasiComponentCellRuntime,
} from '../../src/runtime/wasi-component-cell-runtime.js';
import {
  RequestBindingRouteResolver,
} from '../../src/service/request-binding-route-resolver.js';
import {
  createRequestCellCallBridge,
} from '../../src/service/request-cell-call-bridge.js';
import {
  RequestCellHttpAdapter,
} from '../../src/service/request-cell-http-adapter.js';
import {
  REQUEST_CELL_ROUTE_ERROR_CODE,
  normalizeComponentResponse,
} from '../../src/service/request-cell-routing-contract.js';
import {
  buildServiceComponent,
} from '../../src/service/service-component-build.js';
import {
  emitServiceEntry,
} from '../../src/service/service-entry-generator.js';

const SERVICE_WORLD_V2 = 'service-cell-v2';
const HANDLE_REQUEST_EXPORT = 'handle-request';
const TENANT_ID = 'tenant-h3';
const PRINCIPAL_ID = 'principal-alice';
const NODE_ID = 'node-h3-1';
const SERVICE_ID = 'orders-hono-h3-service';
const SECURITY_CONTEXT = Object.freeze({
  principal: PRINCIPAL_ID,
  roles: Object.freeze(['application', 'reader']),
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

const H3_SERVICE_SOURCE = `
import {Hono} from 'hono';
import {defineService, distributed, sql} from 'lagrange-server/authoring';

export const summarizeAmounts = distributed({
  statement: sql\`SELECT account_id, amount_cents FROM account_activity\`,
  run(rows, args, {emit}) {
    let sum = 0;
    for (const row of rows) {
      if (row.account_id === args.accountId) sum += row.amount_cents;
    }
    emit(String(args.accountId), sum);
    return {scanned: rows.length};
  },
  reduce(partials, args) {
    let totalCents = 0;
    for (const [, value] of partials) totalCents += value;
    return {accountId: args.accountId, totalCents};
  },
});

export const auditTrail = distributed({
  statement: sql\`SELECT account_id, amount_cents FROM account_activity\`,
  run(rows, args, {emit}) {
    emit(String(args.accountId), rows.length);
    return {audited: rows.length};
  },
  reduce(partials, args) {
    let events = 0;
    for (const [, count] of partials) events += count;
    return {accountId: args.accountId, events};
  },
});

let retainedLagrangeClient = null;

const app = new Hono();

app.all('/api/inspect', async (c) => {
  const url = new URL(c.req.url);
  const rawBytes = new Uint8Array(await c.req.arrayBuffer());
  const headersObj = {};
  c.req.raw.headers.forEach((value, key) => {
    headersObj[key.toLowerCase()] = value;
  });
  let envFrozen = false;
  let clientFrozen = false;
  try {
    envFrozen = Object.isFrozen(c.env);
    clientFrozen = Object.isFrozen(c.env.lagrange);
  } catch {
    envFrozen = false;
  }
  c.header('set-cookie', 'session=s1; Path=/; HttpOnly', {append: true});
  c.header('set-cookie', 'theme=dark; Path=/', {append: true});
  c.header('x-echo-method', c.req.method);
  c.header('connection', 'keep-alive');
  return c.json({
    bodyByteLength: rawBytes.byteLength,
    bodyText: new TextDecoder().decode(rawBytes),
    clientFrozen,
    deadlineFinite: Number.isFinite(c.env.deadlineMs),
    envFrozen,
    hasAbortSignal: Boolean(c.env.signal && typeof c.env.signal.aborted === 'boolean'),
    headers: headersObj,
    method: c.req.method,
    pathname: url.pathname,
    principal: c.env.principal,
    rawSearch: url.search,
    roles: c.env.roles,
    tags: c.req.queries('tag') || [],
    tenantId: c.env.tenantId,
  });
});

app.post('/api/binary', async (c) => {
  const input = new Uint8Array(await c.req.arrayBuffer());
  const inverted = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    inverted[i] = input[i] ^ 0xff;
  }
  return new Response(inverted, {
    headers: {
      'content-type': 'application/octet-stream',
      'x-binary-length': String(inverted.byteLength),
    },
    status: 200,
  });
});

app.post('/api/strict-json', async (c) => {
  const raw = await c.req.text();
  try {
    const parsed = JSON.parse(raw);
    return c.json({ok: true, parsed}, 200);
  } catch {
    return c.json({code: 'application_invalid_json', raw}, 422);
  }
});

app.get('/api/no-content', () => {
  return new Response(null, {
    headers: {'x-empty-reason': 'no-content'},
    status: 204,
  });
});

app.post('/api/composite/:accountId', async (c) => {
  const accountId = Number(c.req.param('accountId'));
  const summary = await c.env.lagrange.call(summarizeAmounts, {accountId});
  const audit = await c.env.lagrange.call(auditTrail, {accountId});
  const fx = await c.env.lagrange.call('fx-service--call--convert-usd', {
    cents: summary.totalCents,
  });
  return c.json({
    accountId,
    audit,
    fx,
    principal: c.env.principal,
    summary,
    tenantId: c.env.tenantId,
  });
});

app.post('/api/concurrent', async (c) => {
  try {
    await Promise.all([
      c.env.lagrange.call(summarizeAmounts, {accountId: 101}),
      c.env.lagrange.call(auditTrail, {accountId: 101}),
    ]);
    return c.json({unexpected: true}, 200);
  } catch (error) {
    return c.json({
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    }, 409);
  }
});

app.post('/api/retain-client', async (c) => {
  const mode = c.req.query('mode');
  if (mode === 'capture') {
    retainedLagrangeClient = c.env.lagrange;
    return c.json({captured: true}, 200);
  }
  try {
    await retainedLagrangeClient.call(summarizeAmounts, {accountId: 101});
    return c.json({unexpected: true}, 200);
  } catch (error) {
    return c.json({
      code: error.code,
      retryable: error.retryable,
    }, 409);
  }
});

app.get('/api/lazy-stream', (c) => {
  const client = c.env.lagrange;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        await client.call(summarizeAmounts, {accountId: 101});
        controller.enqueue(new TextEncoder().encode('{"unexpected":true}'));
      } catch (error) {
        controller.enqueue(
          new TextEncoder().encode(JSON.stringify({
            code: error.code,
            retryable: error.retryable,
          })),
        );
      }
      controller.close();
    },
  }, {highWaterMark: 0});
  return new Response(stream, {
    headers: {'content-type': 'application/json'},
    status: 200,
  });
});

app.post('/api/unawaited', (c) => {
  void c.env.lagrange.call(summarizeAmounts, {accountId: 101}).catch(() => {});
  return c.json({startedUnawaited: true}, 200);
});

export default defineService({
  name: 'orders-hono-h3',
  version: '0.5.0',
  mount: '/api',
  dependencies: ['fx-service--call--convert-usd'],
  operations: {
    auditTrail,
    summarizeAmounts,
  },
  fetch: (request, env) => app.fetch(request, env),
});
`;

function createMockReply() {
  let statusCode = 200;
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

describe('H3 — Fetch ingress fidelity and request-scoped client composition', () => {
  let tmpDir;
  let componentBytes;
  let runtime;
  let cache;
  let routeResolver;
  let observedEnvelopes = [];
  let observedInvokerCalls = [];
  let callBridge;
  let adapter;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lagrange-h3-test-'));
    const serviceModulePath = path.join(tmpDir, 'lagrange.service.js');
    const entryPath = path.join(tmpDir, 'generated-entry.js');
    const componentPath = path.join(tmpDir, 'service.component.wasm');
    await fs.writeFile(serviceModulePath, H3_SERVICE_SOURCE, 'utf8');

    await emitServiceEntry({
      moduleSpecifier: './lagrange.service.js',
      outputPath: entryPath,
      world: SERVICE_WORLD_V2,
    });

    const built = await buildServiceComponent({
      entryPath,
      outputPath: componentPath,
      worldName: SERVICE_WORLD_V2,
    });
    componentBytes = built.component;

    runtime = new WasiComponentCellRuntime();
    await runtime.start({
      budgets: RUNTIME_BUDGETS,
      bytes: componentBytes,
      capabilities: ['clock.read'],
      exportName: HANDLE_REQUEST_EXPORT,
      serviceId: SERVICE_ID,
      world: 'request-cell',
    });

    cache = createInMemoryTableCache();
    const artifact = {
      artifactDigest: `sha256:${'a'.repeat(64)}`,
      manifest: {
        artifact: {
          digest: `sha256:${'a'.repeat(64)}`,
          media_type: 'application/wasm',
          ref: 'registry.example.test/acme/orders-hono-h3:0.5.0',
          type: 'oci',
        },
        capabilities: ['clock.read'],
        exports: [
          {
            interface: 'request_v2',
            name: HANDLE_REQUEST_EXPORT,
          },
        ],
        name: 'orders-hono-h3',
        runtime: {kind: 'wasm_component'},
        schema_version: 3,
        version: '0.5.0',
      },
      manifestDigest: `sha256:${'b'.repeat(64)}`,
      packageId: `service-package-${'c'.repeat(64)}`,
    };

    const declaration = {
      budgets: RUNTIME_BUDGETS,
      name: 'orders-hono-h3--request--fetch',
      schema_version: 3,
      source: {
        host: '*',
        kind: 'request',
        path_prefix: '/api',
      },
      target: {
        handler_id: 'fetch',
        interface: 'request_v2',
        manifest_digest: artifact.manifestDigest,
        package_id: artifact.packageId,
      },
    };
    const normalizedBinding = normalizeDeploymentBinding(declaration);
    const bound = bindDeploymentArtifact(normalizedBinding, artifact);
    const bindingRow = buildBindingRow(bound, SECURITY_CONTEXT, 1001, 1);
    const projected = projectBinding(bindingRow);
    const definitionRow = buildActivatedRequestBindingServiceDefinition(
      buildRequestBindingServiceDefinition(bindingRow, artifact),
      projected,
    );
    const derivedServiceId = definitionRow.service_id;
    const replicaId = `${derivedServiceId}-r1`;
    const actualRow = {
      created_at: 1001,
      definition_id: derivedServiceId,
      node_id: NODE_ID,
      service_id: replicaId,
      service_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      status: ReplicaStatus.ACTIVE,
      updated_at: 1001,
    };

    cache.set(
      SYSTEM_TABLE_NAME.SERVICE_BINDINGS,
      bindingRow.binding_version_id,
      bindingRow,
    );
    cache.set(
      SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
      definitionRow.service_id,
      definitionRow,
    );
    cache.set(SYSTEM_TABLE_NAME.SERVICES, actualRow.service_id, actualRow);

    routeResolver = new RequestBindingRouteResolver({
      systemTableCache: cache,
    });

    callBridge = createRequestCellCallBridge({
      callCellInvoker: {
        async invoke(callRequest) {
          observedInvokerCalls.push(callRequest);
          const args = JSON.parse(callRequest.argumentsJson);
          if (callRequest.name === 'orders-hono-h3--call--summarize-amounts') {
            return JSON.stringify({
              accountId: args.accountId,
              childInvocationId: callRequest.invocationId,
              totalCents: args.accountId === 101 ? 1500 : 400,
            });
          }
          if (callRequest.name === 'orders-hono-h3--call--audit-trail') {
            return JSON.stringify({
              accountId: args.accountId,
              childInvocationId: callRequest.invocationId,
              events: 3,
            });
          }
          if (callRequest.name === 'fx-service--call--convert-usd') {
            return JSON.stringify({
              childInvocationId: callRequest.invocationId,
              usd: (args.cents / 100).toFixed(2),
            });
          }
          throw new Error(`Unexpected call target: ${callRequest.name}`);
        },
      },
      runtimeAccessPolicyOwner: {
        async getOutboundCallPolicy() {
          return Object.freeze({
            calls: Object.freeze([
              'orders-hono-h3--call--summarize-amounts',
              'orders-hono-h3--call--audit-trail',
              'fx-service--call--convert-usd',
            ]),
            status: 'resolved',
          });
        },
      },
    });

    const localReplicas = new Map([
      [
        replicaId,
        {
          entityId: derivedServiceId,
          replicaHandle: {replicaId, serviceId: derivedServiceId},
          replicaId,
          status: ReplicaStatus.ACTIVE,
        },
      ],
    ]);

    const runtimeHandler = {
      localReplicas,
      nodeId: NODE_ID,
      requestBindingRouteResolver: routeResolver,
      serviceRuntimeLifecycle: {
        async health() {
          return {status: HEALTH_STATUS.HEALTHY};
        },
        async invoke(_handle, invocation) {
          try {
            return await runtime.invoke(
              SERVICE_ID,
              invocation.args,
              async () => [],
              async () => {},
              () => {},
              {
                bindingCallDelegate: ({argumentsJson, name}) =>
                  callBridge.invoke({
                    argumentsJson,
                    invocation,
                    name,
                  }),
                deadlineMs: invocation.deadlineMs,
              },
            );
          } finally {
            callBridge.completeInvocation(invocation.invocationId);
          }
        },
      },
    };

    adapter = new RequestCellHttpAdapter({
      authenticateRequest: async () => ({
        principal: PRINCIPAL_ID,
        roles: ['application', 'reader'],
        tenantId: TENANT_ID,
      }),
      maxInputBytes: 4096,
      routeResolver,
      serviceDispatcher: {
        async dispatch(envelope) {
          observedEnvelopes.push(envelope);
          const answer = await handleRequestCellInvocation(
            runtimeHandler,
            envelope,
          );
          return {answer};
        },
      },
    });
  });

  after(async () => {
    if (runtime) {
      await runtime.shutdown();
    }
    if (tmpDir) {
      await fs.rm(tmpDir, {force: true, recursive: true});
    }
  });

  describe('fetch-http-semantics: URL, headers, body bytes, and status rules', () => {
    it('preserves query parameter order, repeated keys, application headers, and strips hop-by-hop and ingress credentials', async () => {
      const reply = createMockReply();
      const rawBodyText = await adapter.handle({
        body: 'raw-unparsed-text-payload',
        headers: {
          'accept': 'application/json',
          'authorization': 'Bearer secret-platform-jwt',
          'connection': 'keep-alive, x-custom-hop',
          'content-type': 'text/plain; charset=utf-8',
          'keep-alive': 'timeout=5',
          'x-custom-hop': 'must-be-stripped',
          'x-custom-signature': 'hmac-sha256=deadbeef',
          'x-lagrange-token': 'internal-platform-token',
        },
        method: 'POST',
        url: 'https://api.example.test/api/inspect?z=last&tag=beta&tag=alpha&tag=beta&a=first',
      }, reply);

      assert.equal(reply.getStatusCode(), 200);
      const parsed = JSON.parse(rawBodyText);
      assert.equal(parsed.method, 'POST');
      assert.equal(parsed.pathname, '/api/inspect');
      assert.equal(parsed.rawSearch, '?z=last&tag=beta&tag=alpha&tag=beta&a=first');
      assert.deepEqual(parsed.tags, ['beta', 'alpha', 'beta']);
      assert.equal(parsed.bodyText, 'raw-unparsed-text-payload');
      assert.equal(parsed.bodyByteLength, 25);

      // Readonly server-derived identity and signal in Hono c.env
      assert.equal(parsed.principal, PRINCIPAL_ID);
      assert.equal(parsed.tenantId, TENANT_ID);
      assert.deepEqual(parsed.roles, ['application', 'reader']);
      assert.equal(parsed.deadlineFinite, true);
      assert.equal(parsed.hasAbortSignal, true);
      assert.equal(parsed.envFrozen, true);
      assert.equal(parsed.clientFrozen, true);

      // Application headers forwarded; hop-by-hop and platform credentials stripped
      assert.equal(parsed.headers['x-custom-signature'], 'hmac-sha256=deadbeef');
      assert.equal(parsed.headers['accept'], 'application/json');
      assert.equal(parsed.headers['authorization'], undefined);
      assert.equal(parsed.headers['x-lagrange-token'], undefined);
      assert.equal(parsed.headers['connection'], undefined);
      assert.equal(parsed.headers['keep-alive'], undefined);
      assert.equal(parsed.headers['x-custom-hop'], undefined);

      // Multiple Set-Cookie values preserved; forbidden component response header stripped
      const responseHeaders = reply.getHeaders();
      assert.deepEqual(responseHeaders['set-cookie'], [
        'session=s1; Path=/; HttpOnly',
        'theme=dark; Path=/',
      ]);
      assert.equal(responseHeaders['connection'], undefined);
    });

    it('carries raw binary bytes through ingress and egress without UTF-8 corruption', async () => {
      const reply = createMockReply();
      const inputBytes = Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x42, 0x13]);
      const result = await adapter.handle({
        body: inputBytes,
        headers: {'content-type': 'application/octet-stream'},
        method: 'POST',
        url: 'http://localhost/api/binary',
      }, reply);

      assert.equal(reply.getStatusCode(), 200);
      assert.equal(reply.getHeaders()['x-binary-length'], '6');
      assert.ok(Buffer.isBuffer(result));
      assert.deepEqual(
        [...result],
        [0xff, 0x00, 0x01, 0x7f, 0xbd, 0xec],
      );
    });

    it('passes malformed JSON through ingress so Hono application code handles validation', async () => {
      const reply = createMockReply();
      const bodyText = await adapter.handle({
        body: '{malformed: true',
        headers: {'content-type': 'application/json'},
        method: 'POST',
        url: 'http://localhost/api/strict-json',
      }, reply);

      assert.equal(reply.getStatusCode(), 422);
      assert.deepEqual(JSON.parse(bodyText), {
        code: 'application_invalid_json',
        raw: '{malformed: true',
      });
    });

    it('produces distinct intentDigest values for byte-distinct JSON bodies with identical parsed meaning', async () => {
      observedEnvelopes = [];
      const reply1 = createMockReply();
      await adapter.handle({
        body: '{"a":1,"b":2}',
        headers: {'content-type': 'application/json'},
        method: 'POST',
        url: 'http://localhost/api/strict-json',
      }, reply1);

      const reply2 = createMockReply();
      await adapter.handle({
        body: '{"b":2, "a":1}',
        headers: {'content-type': 'application/json'},
        method: 'POST',
        url: 'http://localhost/api/strict-json',
      }, reply2);

      assert.equal(observedEnvelopes.length, 2);
      const intent1 = observedEnvelopes[0].payload.invocation.intentDigest;
      const intent2 = observedEnvelopes[1].payload.invocation.intentDigest;
      assert.notEqual(
        intent1,
        intent2,
        'byte-distinct JSON bodies must have distinct intent digests',
      );
    });

    it('enforces early input byte budget and honors HEAD and 204 empty-body rules', async () => {
      // 1. Oversized input body (> 4096 bytes) rejected before dispatch
      const countBefore = observedEnvelopes.length;
      const oversizedReply = createMockReply();
      const oversizedResult = await adapter.handle({
        body: 'x'.repeat(5000),
        headers: {'content-type': 'text/plain'},
        method: 'POST',
        url: 'http://localhost/api/inspect',
      }, oversizedReply);
      assert.equal(oversizedReply.getStatusCode(), 413);
      assert.equal(
        oversizedResult.code,
        REQUEST_CELL_ROUTE_ERROR_CODE.BUDGET_EXHAUSTED,
      );
      assert.equal(observedEnvelopes.length, countBefore);

      // 2. Forged authority header rejected (even with mixed case)
      const forgedReply = createMockReply();
      const forgedResult = await adapter.handle({
        body: '',
        headers: {'X-Tenant-Id': 'forged-tenant'},
        method: 'GET',
        url: 'http://localhost/api/inspect',
      }, forgedReply);
      assert.equal(forgedReply.getStatusCode(), 400);
      assert.equal(
        forgedResult.code,
        REQUEST_CELL_ROUTE_ERROR_CODE.AUTHORITY_FIELD_REJECTED,
      );

      // 3. HEAD request strips response body while preserving status and headers
      const headReply = createMockReply();
      const headBody = await adapter.handle({
        headers: {'accept': 'application/json'},
        method: 'HEAD',
        url: 'http://localhost/api/inspect?head=1',
      }, headReply);
      assert.equal(headReply.getStatusCode(), 200);
      assert.equal(headReply.getHeaders()['x-echo-method'], 'HEAD');
      assert.equal(headBody, '');

      // 4. 204 No Content response has empty body
      const noContentReply = createMockReply();
      const noContentBody = await adapter.handle({
        headers: {},
        method: 'GET',
        url: 'http://localhost/api/no-content',
      }, noContentReply);
      assert.equal(noContentReply.getStatusCode(), 204);
      assert.equal(noContentReply.getHeaders()['x-empty-reason'], 'no-content');
      assert.equal(noContentBody, '');

      // 5. normalizeComponentResponse enforces maxOutputBytes
      assert.throws(
        () => normalizeComponentResponse({
          body: 'y'.repeat(2048),
          headers: [],
          status: 200,
        }, {maxOutputBytes: 1024}),
        (err) => err.code === REQUEST_CELL_ROUTE_ERROR_CODE.BUDGET_EXHAUSTED &&
          err.httpStatus === 502,
      );
    });
  });

  describe('request-call-lifecycle: sequential fan-out, concurrency refusal, and client closure', () => {
    it('executes 3 sequential c.env.lagrange.call operations in one request with incrementing child identities', async () => {
      assert.equal(DEFAULT_REQUEST_HOST_CALL_BUDGET, 16);
      observedInvokerCalls = [];

      const reply = createMockReply();
      const bodyText = await adapter.handle({
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'composite-req-1',
        },
        method: 'POST',
        url: 'http://localhost/api/composite/101',
      }, reply);

      assert.equal(reply.getStatusCode(), 200);
      const parsed = JSON.parse(bodyText);
      assert.equal(parsed.accountId, 101);
      assert.equal(parsed.principal, PRINCIPAL_ID);
      assert.equal(parsed.tenantId, TENANT_ID);
      assert.equal(parsed.summary.totalCents, 1500);
      assert.equal(parsed.audit.events, 3);
      assert.equal(parsed.fx.usd, '15.00');

      assert.equal(observedInvokerCalls.length, 3);
      const [call1, call2, call3] = observedInvokerCalls;
      assert.match(call1.invocationId, /#call-1$/u);
      assert.match(call2.invocationId, /#call-2$/u);
      assert.match(call3.invocationId, /#call-3$/u);
      assert.equal(
        call1.invocationId.replace(/#call-1$/u, ''),
        call2.invocationId.replace(/#call-2$/u, ''),
      );
      assert.equal(call1.securityContext.principal, PRINCIPAL_ID);
      assert.equal(call1.securityContext.tenantId, TENANT_ID);
    });

    it('refuses overlapping Promise.all client calls in the compiled guest with unsupported_concurrency', async () => {
      observedInvokerCalls = [];
      const reply = createMockReply();
      const bodyText = await adapter.handle({
        headers: {'content-type': 'application/json'},
        method: 'POST',
        url: 'http://localhost/api/concurrent',
      }, reply);

      assert.equal(reply.getStatusCode(), 409);
      const parsed = JSON.parse(bodyText);
      assert.equal(parsed.code, HOST_CALL_ERROR_CODE.UNSUPPORTED_CONCURRENCY);
      assert.equal(parsed.retryable, false);
      assert.equal(
        observedInvokerCalls.length,
        0,
        'overlapping Promise.all calls must not silently serialize into host calls',
      );
    });

    it('refuses concurrent calls at createRequestCellCallBridge with unsupported_concurrency', async () => {
      let releaseFirst;
      const firstGate = new Promise((resolve) => {
        releaseFirst = resolve;
      });
      const bridge = createRequestCellCallBridge({
        callCellInvoker: {
          async invoke() {
            await firstGate;
            return '{"ok":true}';
          },
        },
        runtimeAccessPolicyOwner: {
          async getOutboundCallPolicy() {
            return Object.freeze({
              calls: Object.freeze(['orders-hono-h3--call--summarize-amounts']),
              status: 'resolved',
            });
          },
        },
      });
      const invocation = {
        deadlineMs: Date.now() + 5000,
        invocationId: 'req-bridge-concurrent-1',
        invocationServiceId: SERVICE_ID,
        securityContext: Object.freeze({
          principal: PRINCIPAL_ID,
          roles: Object.freeze(['application']),
          tenantId: TENANT_ID,
        }),
      };
      const firstPromise = bridge.invoke({
        argumentsJson: '{"accountId":101}',
        invocation,
        name: 'orders-hono-h3--call--summarize-amounts',
      });
      const secondPromise = bridge.invoke({
        argumentsJson: '{"accountId":101}',
        invocation,
        name: 'orders-hono-h3--call--summarize-amounts',
      });

      await assert.rejects(
        secondPromise,
        (err) => err.code === HOST_CALL_ERROR_CODE.UNSUPPORTED_CONCURRENCY &&
          err.retryable === false,
      );
      releaseFirst();
      await assert.rejects(
        firstPromise,
        (err) => err.code === HOST_CALL_ERROR_CODE.UNSUPPORTED_CONCURRENCY,
      );
    });

    it('closes the request-scoped client on handler return so retained references and lazy stream callbacks reject with request_client_closed', async () => {
      // 1. Capture client on request 1, invoke retained reference on request 2
      const captureReply = createMockReply();
      await adapter.handle({
        headers: {},
        method: 'POST',
        url: 'http://localhost/api/retain-client?mode=capture',
      }, captureReply);
      assert.equal(captureReply.getStatusCode(), 200);

      const reuseReply = createMockReply();
      const reuseBody = await adapter.handle({
        headers: {},
        method: 'POST',
        url: 'http://localhost/api/retain-client?mode=reuse',
      }, reuseReply);
      assert.equal(reuseReply.getStatusCode(), 409);
      assert.deepEqual(JSON.parse(reuseBody), {
        code: HOST_CALL_ERROR_CODE.REQUEST_CLIENT_CLOSED,
        retryable: false,
      });

      // 2. Lazy ReadableStream attempting a Lagrange call during response collection
      const streamReply = createMockReply();
      const streamBody = await adapter.handle({
        headers: {},
        method: 'GET',
        url: 'http://localhost/api/lazy-stream',
      }, streamReply);
      assert.equal(streamReply.getStatusCode(), 200);
      assert.deepEqual(JSON.parse(streamBody), {
        code: HOST_CALL_ERROR_CODE.REQUEST_CLIENT_CLOSED,
        retryable: false,
      });
    });

    it('fails with unfinished_child_work and fences the component instance when a handler returns with an unawaited call', async () => {
      const beforeWitness = runtime.witness(SERVICE_ID);
      assert.ok(beforeWitness);

      const unawaitedReply = createMockReply();
      const unawaitedResult = await adapter.handle({
        headers: {},
        method: 'POST',
        url: 'http://localhost/api/unawaited',
      }, unawaitedReply);

      assert.equal(unawaitedReply.getStatusCode(), 502);
      assert.equal(
        unawaitedResult.code,
        HOST_CALL_ERROR_CODE.UNFINISHED_CHILD_WORK,
      );
      assert.equal(
        runtime.witness(SERVICE_ID),
        null,
        'worker instance must be stopped and fenced after unfinished child work',
      );

      // Restart the runtime instance so subsequent cleanup is idempotent
      await runtime.start({
        budgets: RUNTIME_BUDGETS,
        bytes: componentBytes,
        capabilities: ['clock.read'],
        exportName: HANDLE_REQUEST_EXPORT,
        serviceId: SERVICE_ID,
        world: 'request-cell',
      });
      const afterWitness = runtime.witness(SERVICE_ID);
      assert.ok(afterWitness);
      assert.notEqual(afterWitness.generation, beforeWitness.generation);
    });
  });
});
