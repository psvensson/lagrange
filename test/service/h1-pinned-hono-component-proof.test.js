/**
 * H1 pinned-toolchain Hono component qualification proof
 * (solve/specs/standard-http-service-api/requirements.md sections 4.1, 4.5, 7.2).
 *
 * Compiles and executes real Hono (4.13.14) WASM components through
 * buildServiceComponent (@bytecodealliance/componentize-js@0.21.0,
 * esbuild@0.27.2) and WasiComponentCellRuntime (@bytecodealliance/jco-transpile@0.4.2),
 * verifying routing, async JSON/binary body reads, multiple Set-Cookie headers,
 * call-binding host import and refusal propagation, pure call-cell facility
 * isolation, an HTTP-only zero-operation Hono component, guest import boundary
 * guards, and the pinned-toolchain-hono-component receipt contract.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import t, {test} from '../../src/test-helpers/tap.js';
import {
  PINNED_HONO_COMPONENT_RECEIPT_SCHEMA,
  PINNED_HONO_TOOLCHAIN_VERSIONS,
  PINNED_TOOLCHAIN_HONO_COMPONENT_RECEIPT_ID,
  QUALIFIED_HONO_GUEST_FACILITIES,
  RECEIPT_ERROR_CODE,
  RECEIPT_VALIDATION_STATUS,
  UNSUPPORTED_HONO_GUEST_FACILITIES,
  buildPinnedHonoComponentReceipt,
  computeSha256Digest,
  validatePinnedHonoComponentReceipt,
} from '../../src/service/hono-component-qualification.js';
import {
  SERVICE_COMPONENT_BUILD_ERROR_CODE,
  ServiceComponentBuildError,
  buildServiceComponent,
  bundleGuestEntry,
} from '../../src/service/service-component-build.js';
import {
  WasiComponentCellRuntime,
} from '../../src/runtime/wasi-component-cell-runtime.js';
import {
  AUTHORING_DESCRIPTOR_KIND,
  AuthoringError,
  HTTP_METHOD,
  deepFreeze,
  defineService,
  distributed,
  http,
  sql,
} from '../../src/authoring/index.js';

const TOOLCHAIN_TIMEOUT_MS = 180_000;
t.setTimeout(TOOLCHAIN_TIMEOUT_MS);

const TEMP_DIR_PREFIX = 'lagrange-h1-hono-proof-';
const UTF8_ENCODING = 'utf8';
const BASE64_ENCODING = 'base64';
const WORLD_SERVICE_CELL_V2 = 'service-cell-v2';
const CELL_WORLD_REQUEST = 'request-cell';
const CELL_WORLD_CALL = 'call-cell';
const EXPORT_HANDLE_REQUEST = 'handle-request';
const EXPORT_RUN = 'run';
const HANDLER_ID_FETCH = 'fetch';
const OPERATION_ID_SUMMARIZE = 'summarize';
const DISTRIBUTED_SERVICE_ID = 'h1-distributed-hono-cell';
const CALL_MODE_SERVICE_ID = 'h1-call-mode-hono-cell';
const ZERO_OP_SERVICE_ID = 'h1-zero-op-hono-cell';
const EXPECTED_CALL_BINDING_NAME = 'account-summary--call--summarize';
const TARGET_NOT_ALLOWED_CODE = 'target_not_allowed';
const NOT_AVAILABLE_IN_CALL_MODE_CODE = 'not_available_in_call_mode';

const CELL_BUDGETS = Object.freeze({
  context_bytes: 1024 * 1024,
  cpu_time_ms: 5000,
  input_bytes: 1024 * 1024,
  memory_bytes: 64 * 1024 * 1024,
  output_bytes: 1024 * 1024,
  wall_time_ms: 10000,
});

const DISTRIBUTED_GUEST_ENTRY_SOURCE = `
import {Hono} from 'hono';
import {AUTHORING_DESCRIPTOR_KIND, distributed, sql} from 'lagrange-server/authoring';
import {callBinding, capability} from 'lagrange:cell/context';
import {emit} from 'lagrange:cell/call-context';

const summarizeOp = distributed({
  statement: sql\`SELECT account_id, amount_cents FROM transactions\`,
  run(batch) {
    return {scanned: batch.length};
  },
  reduce(partials) {
    return {count: partials.length};
  },
});

const app = new Hono();

app.get('/health', (c) => c.json({
  ok: true,
  hasOperationKind: summarizeOp.kind === AUTHORING_DESCRIPTOR_KIND.DISTRIBUTED_OPERATION,
  facilities: {
    Request: typeof Request === 'function',
    Response: typeof Response === 'function',
    Headers: typeof Headers === 'function',
    getSetCookie: typeof Headers.prototype?.getSetCookie === 'function',
    URL: typeof URL === 'function',
    URLSearchParams: typeof URLSearchParams === 'function',
    TextEncoder: typeof TextEncoder === 'function',
    TextDecoder: typeof TextDecoder === 'function',
    ReadableStream: typeof ReadableStream === 'function',
    atob: typeof atob === 'function',
    btoa: typeof btoa === 'function',
  },
}));

app.post('/accounts/:accountId/summary', async (c) => {
  const accountId = c.req.param('accountId');
  const tags = c.req.queries('tag') || [];
  const body = await c.req.json();
  try {
    const result = await c.env.lagrange.call(
      body.targetOp || 'summarize',
      {accountId, tags, limit: body.limit ?? 10},
    );
    c.header('Set-Cookie', 'session=s1; Path=/; HttpOnly', {append: true});
    c.header('Set-Cookie', 'theme=dark; Path=/', {append: true});
    return c.json(result, 200, {'x-hono-route': 'account-summary'});
  } catch (err) {
    return c.json(
      {code: err.code || 'call_failed', retryable: Boolean(err.retryable)},
      err.code === 'target_not_allowed' ? 403 : 502,
    );
  }
});

app.post('/binary', async (c) => {
  const input = new Uint8Array(await c.req.arrayBuffer());
  const inverted = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    inverted[i] = input[i] ^ 0xff;
  }
  return new Response(inverted, {
    status: 201,
    headers: {'content-type': 'application/octet-stream'},
  });
});

function decodeBase64Bytes(base64Str) {
  const binary = atob(base64Str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeBase64Bytes(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function handleRequest(_handlerId, requestJson) {
  const reqEnvelope = JSON.parse(requestJson);
  const init = {
    method: reqEnvelope.method || 'GET',
    headers: reqEnvelope.headers || [],
  };
  if (reqEnvelope.bodyBase64 && init.method !== 'GET' && init.method !== 'HEAD') {
    init.body = decodeBase64Bytes(reqEnvelope.bodyBase64);
  }
  const request = new Request(reqEnvelope.url, init);
  const env = {
    lagrange: {
      async call(opName, args) {
        try {
          const raw = callBinding(
            'account-summary--call--' + opName,
            JSON.stringify(args ?? {}),
          );
          return JSON.parse(raw);
        } catch (err) {
          const payload = err?.payload;
          const wrapped = new Error(payload?.message || String(err));
          wrapped.code = payload?.code || 'call_failed';
          wrapped.retryable = Boolean(payload?.retryable);
          throw wrapped;
        }
      },
    },
  };
  const response = await app.fetch(request, env);
  const bodyBytes = new Uint8Array(await response.arrayBuffer());
  const headers = [];
  const setCookies = typeof response.headers.getSetCookie === 'function' ?
    response.headers.getSetCookie() :
    [];
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return;
    headers.push([key, value]);
  });
  for (const cookie of setCookies) {
    headers.push(['set-cookie', cookie]);
  }
  return JSON.stringify({
    status: response.status,
    headers,
    bodyBase64: encodeBase64Bytes(bodyBytes),
  });
}

export function run(_operationId, batch, argumentsJson) {
  const args = JSON.parse(argumentsJson || '{}');
  if (args.probeHostTrap === 'capability') {
    capability(0);
  }
  const isolation = {};
  try {
    callBinding('account-summary--call--summarize', '{}');
    isolation.callBinding = 'allowed';
  } catch (err) {
    isolation.callBinding = err?.payload?.code || String(err);
  }
  emit('shard:0', String(batch.length));
  return JSON.stringify({isolation, batchRows: batch.length});
}

export function reduce(_operationId, partials, _argumentsJson) {
  return JSON.stringify({partialsCount: partials.length});
}
`;

const ZERO_OP_GUEST_ENTRY_SOURCE = `
import {Hono} from 'hono';

const serviceMeta = {
  name: 'http-only-health',
  version: '1.0.0',
  operations: {},
};

const app = new Hono();
app.get('/zero-op/health', (c) => c.json({
  ok: true,
  service: serviceMeta.name,
  operationCount: Object.keys(serviceMeta.operations).length,
}));

export async function handleRequest(_handlerId, requestJson) {
  const reqEnvelope = JSON.parse(requestJson);
  const request = new Request(reqEnvelope.url, {method: reqEnvelope.method || 'GET'});
  const response = await app.fetch(request, {});
  const text = await response.text();
  return JSON.stringify({status: response.status, body: text});
}

export function run() {
  throw new Error('HTTP-only service defines no operations');
}

export function reduce() {
  throw new Error('HTTP-only service defines no operations');
}
`;

function decodeResponseBodyJson(envelopeJson) {
  const envelope = JSON.parse(envelopeJson);
  const bodyText = Buffer.from(envelope.bodyBase64, BASE64_ENCODING).toString(
    UTF8_ENCODING,
  );
  return {
    body: JSON.parse(bodyText),
    envelope,
  };
}

async function verifyDistributedRequestRoutes(runtime, componentBytes) {
  await runtime.start({
    budgets: CELL_BUDGETS,
    bytes: componentBytes,
    capabilities: [],
    exportName: EXPORT_HANDLE_REQUEST,
    serviceId: DISTRIBUTED_SERVICE_ID,
    world: CELL_WORLD_REQUEST,
  });

  const healthRaw = await runtime.invoke(
    DISTRIBUTED_SERVICE_ID,
    [
      HANDLER_ID_FETCH,
      JSON.stringify({method: 'GET', url: 'https://api.example.test/health'}),
    ],
    () => [],
    () => {},
  );
  const healthDecoded = decodeResponseBodyJson(healthRaw);
  const healthRouteOk =
    healthDecoded.envelope.status === 200 &&
    healthDecoded.body.ok === true &&
    healthDecoded.body.hasOperationKind === true &&
    Object.values(healthDecoded.body.facilities).every(Boolean);
  assert.equal(healthRouteOk, true);

  const summaryRaw = await runtime.invoke(
    DISTRIBUTED_SERVICE_ID,
    [
      HANDLER_ID_FETCH,
      JSON.stringify({
        bodyBase64: Buffer.from(
          JSON.stringify({limit: 5}),
          UTF8_ENCODING,
        ).toString(BASE64_ENCODING),
        headers: [['content-type', 'application/json']],
        method: 'POST',
        url: 'https://api.example.test/accounts/acc-42/summary?tag=alpha&tag=beta',
      }),
    ],
    () => [],
    () => {},
    () => {},
    {
      bindingCallDelegate: async ({name, argumentsJson}) =>
        JSON.stringify({bindingName: name, received: JSON.parse(argumentsJson)}),
    },
  );
  const summaryDecoded = decodeResponseBodyJson(summaryRaw);
  const setCookieHeaders = summaryDecoded.envelope.headers.filter(
    ([key]) => key.toLowerCase() === 'set-cookie',
  );
  const asyncJsonAndHostCallOk =
    summaryDecoded.envelope.status === 200 &&
    summaryDecoded.body.bindingName === EXPECTED_CALL_BINDING_NAME &&
    summaryDecoded.body.received.accountId === 'acc-42' &&
    summaryDecoded.body.received.tags.length === 2 &&
    summaryDecoded.body.received.limit === 5;
  const multiSetCookiePreserved = setCookieHeaders.length === 2;
  assert.equal(asyncJsonAndHostCallOk, true);
  assert.equal(multiSetCookiePreserved, true);

  const refusedRaw = await runtime.invoke(
    DISTRIBUTED_SERVICE_ID,
    [
      HANDLER_ID_FETCH,
      JSON.stringify({
        bodyBase64: Buffer.from(
          JSON.stringify({targetOp: 'undeclared'}),
          UTF8_ENCODING,
        ).toString(BASE64_ENCODING),
        headers: [['content-type', 'application/json']],
        method: 'POST',
        url: 'https://api.example.test/accounts/acc-42/summary',
      }),
    ],
    () => [],
    () => {},
    () => {},
    {
      bindingCallDelegate: async () => {
        const refusal = new Error('Target not allowed');
        refusal.code = TARGET_NOT_ALLOWED_CODE;
        refusal.retryable = false;
        throw refusal;
      },
    },
  );
  const refusedDecoded = decodeResponseBodyJson(refusedRaw);
  const hostCallRefusalPropagated =
    refusedDecoded.envelope.status === 403 &&
    refusedDecoded.body.code === TARGET_NOT_ALLOWED_CODE &&
    refusedDecoded.body.retryable === false;
  assert.equal(hostCallRefusalPropagated, true);

  const binaryRaw = await runtime.invoke(
    DISTRIBUTED_SERVICE_ID,
    [
      HANDLER_ID_FETCH,
      JSON.stringify({
        bodyBase64: Buffer.from([0x00, 0x0f, 0xf0, 0xff]).toString(
          BASE64_ENCODING,
        ),
        headers: [['content-type', 'application/octet-stream']],
        method: 'POST',
        url: 'https://api.example.test/binary',
      }),
    ],
    () => [],
    () => {},
  );
  const binaryEnvelope = JSON.parse(binaryRaw);
  const binaryBytes = [
    ...Buffer.from(binaryEnvelope.bodyBase64, BASE64_ENCODING),
  ];
  const binaryBodyRoundTripOk =
    binaryEnvelope.status === 201 &&
    binaryBytes.join(',') === '255,240,15,0';
  assert.equal(binaryBodyRoundTripOk, true);

  return {
    asyncJsonAndHostCallOk,
    binaryBodyRoundTripOk,
    healthRouteOk,
    hostCallRefusalPropagated,
    multiSetCookiePreserved,
  };
}

async function verifyCallModeIsolation(runtime, componentBytes) {
  await runtime.start({
    budgets: CELL_BUDGETS,
    bytes: componentBytes,
    capabilities: [],
    exportName: EXPORT_RUN,
    serviceId: CALL_MODE_SERVICE_ID,
    world: CELL_WORLD_CALL,
  });

  const callModeOutcome = await runtime.invoke(
    CALL_MODE_SERVICE_ID,
    [OPERATION_ID_SUMMARIZE, [], '{}'],
    () => [],
    () => {},
    () => {},
    {
      bindingCallDelegate: async () => '{"unexpected":true}',
      callContext: {emitBudget: 8, nestedCallBudget: 0, onCallBounded: false},
    },
  );
  const callModeValue = JSON.parse(callModeOutcome.value);
  let capabilityTrapDenied = false;
  try {
    await runtime.invoke(
      CALL_MODE_SERVICE_ID,
      [
        OPERATION_ID_SUMMARIZE,
        [],
        JSON.stringify({probeHostTrap: 'capability'}),
      ],
      () => [],
      () => {},
      () => {},
      {
        callContext: {emitBudget: 8, nestedCallBudget: 0, onCallBounded: false},
      },
    );
  } catch (trapError) {
    capabilityTrapDenied = trapError?.code === 'request_cell_capability_denied';
  }
  const callModeIsolatesRequestImports =
    callModeValue.isolation.callBinding === NOT_AVAILABLE_IN_CALL_MODE_CODE &&
    capabilityTrapDenied === true &&
    Array.isArray(callModeOutcome.partials) &&
    callModeOutcome.partials.length === 1;
  assert.equal(callModeIsolatesRequestImports, true);
  return callModeIsolatesRequestImports;
}

async function verifyZeroOperationService(runtime, componentBytes) {
  await runtime.start({
    budgets: CELL_BUDGETS,
    bytes: componentBytes,
    capabilities: [],
    exportName: EXPORT_HANDLE_REQUEST,
    serviceId: ZERO_OP_SERVICE_ID,
    world: CELL_WORLD_REQUEST,
  });

  const zeroOpRaw = await runtime.invoke(
    ZERO_OP_SERVICE_ID,
    [
      HANDLER_ID_FETCH,
      JSON.stringify({
        method: 'GET',
        url: 'https://api.example.test/zero-op/health',
      }),
    ],
    () => [],
    () => {},
  );
  const zeroOpEnvelope = JSON.parse(zeroOpRaw);
  const zeroOpBody = JSON.parse(zeroOpEnvelope.body);
  const zeroOperationRouteOk =
    zeroOpEnvelope.status === 200 &&
    zeroOpBody.ok === true &&
    zeroOpBody.operationCount === 0;
  assert.equal(zeroOperationRouteOk, true);
  return zeroOperationRouteOk;
}

test(
  'H1 qualifies pinned Hono 4.13.14 component compilation, async Fetch/host-call execution, zero-op service, and call-mode isolation',
  {timeout: TOOLCHAIN_TIMEOUT_MS},
  async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_DIR_PREFIX));
    const distributedEntryPath = path.join(tempDir, 'distributed-entry.mjs');
    const zeroOpEntryPath = path.join(tempDir, 'zero-op-entry.mjs');
    fs.writeFileSync(distributedEntryPath, DISTRIBUTED_GUEST_ENTRY_SOURCE);
    fs.writeFileSync(zeroOpEntryPath, ZERO_OP_GUEST_ENTRY_SOURCE);

    const runtime = new WasiComponentCellRuntime();
    try {
      const distributedBuild = await buildServiceComponent({
        entryPath: distributedEntryPath,
        worldName: WORLD_SERVICE_CELL_V2,
      });
      assert.deepEqual(
        distributedBuild.toolchain,
        PINNED_HONO_TOOLCHAIN_VERSIONS,
      );
      assert.equal(
        distributedBuild.digests.entryDigest,
        computeSha256Digest(DISTRIBUTED_GUEST_ENTRY_SOURCE),
      );

      const zeroOpBuild = await buildServiceComponent({
        entryPath: zeroOpEntryPath,
        worldName: WORLD_SERVICE_CELL_V2,
      });

      const requestObs = await verifyDistributedRequestRoutes(
        runtime,
        distributedBuild.component,
      );
      const callModeIsolatesRequestImports = await verifyCallModeIsolation(
        runtime,
        distributedBuild.component,
      );
      const zeroOperationRouteOk = await verifyZeroOperationService(
        runtime,
        zeroOpBuild.component,
      );

      const receipt = buildPinnedHonoComponentReceipt({
        distributedArtifact: {
          ...distributedBuild.digests,
          componentByteLength: distributedBuild.component.byteLength,
        },
        observations: {
          ...requestObs,
          callModeIsolatesRequestImports,
          zeroOperationRouteOk,
        },
        toolchain: distributedBuild.toolchain,
        zeroOperationArtifact: {
          ...zeroOpBuild.digests,
          componentByteLength: zeroOpBuild.component.byteLength,
          operationCount: 0,
        },
      });
      assert.equal(
        receipt.receiptId,
        PINNED_TOOLCHAIN_HONO_COMPONENT_RECEIPT_ID,
      );
      assert.equal(receipt.schema, PINNED_HONO_COMPONENT_RECEIPT_SCHEMA);
      assert.deepEqual(
        receipt.observations.qualifiedFacilities,
        QUALIFIED_HONO_GUEST_FACILITIES,
      );
      assert.deepEqual(
        receipt.observations.unsupportedFacilities,
        UNSUPPORTED_HONO_GUEST_FACILITIES,
      );
      const validation = validatePinnedHonoComponentReceipt(receipt);
      assert.equal(validation.status, RECEIPT_VALIDATION_STATUS.VALID);
      assert.equal(validation.errors.length, 0);
    } finally {
      await runtime.stop(DISTRIBUTED_SERVICE_ID);
      await runtime.stop(CALL_MODE_SERVICE_ID);
      await runtime.stop(ZERO_OP_SERVICE_ID);
      fs.rmSync(tempDir, {force: true, recursive: true});
    }
  },
);

test('bundleGuestEntry refuses server root and Node builtin imports and validatePinnedHonoComponentReceipt rejects tampered receipts', async () => {
  assert.equal(typeof defineService, 'function');
  assert.equal(typeof distributed, 'function');
  assert.equal(typeof sql, 'function');
  assert.equal(typeof deepFreeze, 'function');
  assert.equal(typeof http.get, 'function');
  assert.equal(HTTP_METHOD.GET, 'GET');
  assert.equal(typeof AuthoringError, 'function');
  assert.equal(
    AUTHORING_DESCRIPTOR_KIND.DISTRIBUTED_OPERATION,
    'distributed_operation',
  );
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_DIR_PREFIX));
  try {
    const forbiddenRootPath = path.join(tempDir, 'forbidden-root.mjs');
    fs.writeFileSync(
      forbiddenRootPath,
      'import {defineService} from "lagrange-server";\nexport {defineService};\n',
    );
    await assert.rejects(
      () => bundleGuestEntry(forbiddenRootPath),
      (error) =>
        error instanceof ServiceComponentBuildError &&
        error.code === SERVICE_COMPONENT_BUILD_ERROR_CODE.FORBIDDEN_GUEST_IMPORT,
    );

    const forbiddenNodePath = path.join(tempDir, 'forbidden-node.mjs');
    fs.writeFileSync(
      forbiddenNodePath,
      'import {AsyncLocalStorage} from "node:async_hooks";\nexport {AsyncLocalStorage};\n',
    );
    await assert.rejects(
      () => bundleGuestEntry(forbiddenNodePath),
      (error) =>
        error instanceof ServiceComponentBuildError &&
        error.code === SERVICE_COMPONENT_BUILD_ERROR_CODE.FORBIDDEN_GUEST_IMPORT,
    );

    const invalidValidation = validatePinnedHonoComponentReceipt({
      artifacts: {},
      observations: {healthRouteOk: false},
      receiptId: 'wrong-id',
      schema: 'wrong-schema',
      toolchain: {hono: '0.0.0'},
    });
    assert.equal(invalidValidation.status, RECEIPT_VALIDATION_STATUS.INVALID);
    const codes = new Set(invalidValidation.errors.map((entry) => entry.code));
    assert.equal(codes.has(RECEIPT_ERROR_CODE.RECEIPT_ID_MISMATCH), true);
    assert.equal(codes.has(RECEIPT_ERROR_CODE.SCHEMA_MISMATCH), true);
    assert.equal(codes.has(RECEIPT_ERROR_CODE.TOOLCHAIN_MISMATCH), true);
    assert.equal(codes.has(RECEIPT_ERROR_CODE.ARTIFACT_INVALID), true);
    assert.equal(codes.has(RECEIPT_ERROR_CODE.OBSERVATION_FAILED), true);
  } finally {
    fs.rmSync(tempDir, {force: true, recursive: true});
  }
});
