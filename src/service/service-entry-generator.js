/**
 * Owner of generated component-entry emission from a normalized service
 * IR (the compiler's `generate` output).
 *
 * The emitted module statically imports the developer's unmodified
 * lagrange.service.js (sealed decision 4: no Function serialization, no
 * source rewriting) and adapts the world's fixed exports onto its
 * descriptor tables. Under the pre-v2 `service-cell` world: method+path
 * dispatch for request handlers, and the single distributed operation
 * behind run/reduce (the pre-v2 bridge's fail-closed restriction,
 * sealed decision 6 — the IR normalizer has already rejected
 * multi-operation services for that target). Under the `service-cell-v2`
 * generic-dispatch world: id-keyed dispatch — `handle-request(handler,
 * request)` routes by explicit handler id, and `run`/`reduce(operation,
 * …)` route by explicit operation id, each refusing unknown ids with a
 * typed error.
 *
 * Emission is deterministic: the source text depends only on the IR and
 * the developer module's import specifier, so repeated `generate` runs
 * reproduce a byte-identical entry.
 */

import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const EMITTED_FILE_MODE = 'utf8';
const ENTRY_WORLD = Object.freeze({
  SERVICE_CELL: 'service-cell',
  SERVICE_CELL_V2: 'service-cell-v2',
});

// The emitted source is one fixed template; every behavior varies only
// with the developer module's descriptor tables at runtime, so the
// generator emits no conditional text of its own.
function entrySource(moduleSpecifier) {
  return `/**
 * GENERATED component entry (lagrange service generate).
 *
 * This file is the compiler's output, not a hand-authored surface: it
 * exists so the sealed service-cell world's fixed exports
 * (handle-request, run, reduce) can be adapted onto the developer's
 * unmodified lagrange.service.js descriptor tables. It statically
 * imports that module graph as ordinary ES modules — no Function
 * serialization, no bundling — so ComponentizeJS resolves the
 * developer's imports itself. Regenerate with \`lagrange service
 * generate\`; do not edit.
 *
 *   - handle-request: method+path dispatch over the http handlers, each
 *     with a per-handler context whose \`call()\` routes a declared
 *     operation descriptor to the canonical \`lagrange:cell/context\`
 *     call-binding host import under the deterministically generated
 *     Binding name \`<service>--call--<kebab(operation id)>\` — the exact
 *     name the deployment records own. A raw string target is forwarded
 *     verbatim so the host's durable outbound-call policy is the sole
 *     gate.
 *   - run/reduce: the single distributed operation (the pre-v2 bridge's
 *     fail-closed restriction), WIT rows flattened to plain records and
 *     partials JSON-encoded through the
 *     \`lagrange:cell/call-context\` emit host import.
 *
 * The name derivation here mirrors
 * src/service/service-deployment-record-generator.js.
 */
import {callBinding} from 'lagrange:cell/context';
import {emit} from 'lagrange:cell/call-context';

import service from ${JSON.stringify(moduleSpecifier)};

// The authoring kind discriminators (src/authoring/define-service.js)
// inlined as literals: the generated entry must be self-contained for
// ComponentizeJS (no virtual module specifier exists to alias through),
// and these strings are sealed ABI surface — the CLI test pins them to
// the authoring source.
const AUTHORING_DESCRIPTOR_KIND = Object.freeze({
  DISTRIBUTED_OPERATION: 'distributed_operation',
  REQUEST_HANDLER: 'request_handler',
});

const HTTP_STATUS = Object.freeze({
  NOT_FOUND: 404,
  OK: 200,
});
const JSON_HEADERS = Object.freeze([
  Object.freeze(['content-type', 'application/json']),
]);
const ROUTE_NOT_FOUND_CODE = 'route_not_found';
const UNDECLARED_OPERATION_CODE = 'undeclared_operation';
const CALL_BINDING_INFIX = '--call--';
const CAMEL_TO_KEBAB_BOUNDARY = /([a-z0-9])([A-Z])/gu;
const KEBAB_BOUNDARY_REPLACEMENT = '$1-$2';
const SINGLE_DISTRIBUTED_OPERATION_MESSAGE =
  'the pre-v2 bridge requires exactly one distributed operation';
const CELL_VALUE_TAG = Object.freeze({
  INTEGER: 'integer',
  NULL: 'null-value',
});

// Deterministic generated Binding name: <service>--call--<kebab(op id)>.
// Identical derivation to the deployment-record generator.
function generatedCallBindingName(serviceName, operationId) {
  const kebabId = operationId
    .replace(CAMEL_TO_KEBAB_BOUNDARY, KEBAB_BOUNDARY_REPLACEMENT)
    .toLowerCase();
  return \`\${serviceName}\${CALL_BINDING_INFIX}\${kebabId}\`;
}

function routeKey(method, path) {
  return \`\${method} \${path}\`;
}

// Operation identity comes from the explicit operations-object key
// (sealed decision 1: never Function.name). The descriptor->id map lets
// a handler reference an operation by descriptor identity.
const OPERATION_ID_BY_DESCRIPTOR = (() => {
  const byDescriptor = new Map();
  for (const [operationId, descriptor] of Object.entries(service.operations)) {
    if (descriptor.kind !== AUTHORING_DESCRIPTOR_KIND.DISTRIBUTED_OPERATION) {
      continue;
    }
    byDescriptor.set(descriptor, operationId);
  }
  return byDescriptor;
})();

const DISPATCH_TABLE = (() => {
  const table = new Map();
  for (const handler of Object.values(service.handlers)) {
    if (handler.kind !== AUTHORING_DESCRIPTOR_KIND.REQUEST_HANDLER) continue;
    table.set(routeKey(handler.method, handler.path), handler);
  }
  return table;
})();

const DISTRIBUTED_OPERATION = (() => {
  const descriptors = [...OPERATION_ID_BY_DESCRIPTOR.keys()];
  if (descriptors.length !== 1) {
    throw new Error(SINGLE_DISTRIBUTED_OPERATION_MESSAGE);
  }
  return descriptors[0];
})();

// Canonical component response shape: {status, headers, body} with
// headers as string pairs (src/service/request-cell-routing-contract.js
// normalizeComponentResponse).
function jsonResponse(value, status = HTTP_STATUS.OK) {
  return {
    body: JSON.stringify(value),
    headers: JSON_HEADERS,
    status,
  };
}

function createHandlerContext(handler) {
  const declared = new Set(handler.calls);
  return {
    call(operationRef, callArguments) {
      let bindingName;
      if (typeof operationRef === 'string') {
        // A raw, possibly-undeclared target name flows straight to the
        // host. The generated access policy - not this code - refuses
        // anything outside the allowlist (fail-closed).
        bindingName = operationRef;
      } else {
        if (!declared.has(operationRef)) {
          throw new Error(UNDECLARED_OPERATION_CODE);
        }
        bindingName = generatedCallBindingName(
          service.name, OPERATION_ID_BY_DESCRIPTOR.get(operationRef));
      }
      return JSON.parse(
        callBinding(bindingName, JSON.stringify(callArguments)),
      );
    },
    json: jsonResponse,
  };
}

export function handleRequest(requestJson) {
  const request = JSON.parse(requestJson);
  const handler = DISPATCH_TABLE.get(routeKey(request.method, request.path));
  if (!handler) {
    return JSON.stringify(jsonResponse({
      code: ROUTE_NOT_FOUND_CODE,
      method: request.method,
      path: request.path,
    }, HTTP_STATUS.NOT_FOUND));
  }
  return JSON.stringify(
    handler.handle(request, createHandlerContext(handler)),
  );
}

function plainColumnValue(value) {
  if (value.tag === CELL_VALUE_TAG.NULL) return null;
  // s64 columns cross the component ABI as BigInt; developer code sees
  // plain numbers.
  if (value.tag === CELL_VALUE_TAG.INTEGER) return Number(value.val);
  return value.val;
}

function plainRow(row) {
  const record = {};
  for (const column of row.columns) {
    record[column.name] = plainColumnValue(column.val);
  }
  return record;
}

export function run(batch, argumentsJson) {
  const rows = batch.map(plainRow);
  const encodingEmit = (key, partial) => emit(key, JSON.stringify(partial));
  return JSON.stringify(DISTRIBUTED_OPERATION.run(
    rows, JSON.parse(argumentsJson), {emit: encodingEmit},
  ));
}

export function reduce(partials, argumentsJson) {
  const decoded = partials.map(
    ([key, partialJson]) => [key, JSON.parse(partialJson)],
  );
  return JSON.stringify(DISTRIBUTED_OPERATION.reduce(
    decoded, JSON.parse(argumentsJson),
  ));
}
`;
}

// The service-cell-v2 generic-dispatch entry: every fixed export takes
// the bound id as its first argument (the ABI sealed by
// wit/world.wit's service-cell-v2 world) and routes through tables keyed
// by the explicit descriptor keys (sealed decision 1: identity never
// comes from Function.name, path, SQL text, or array position). Unknown
// ids are refused with a typed error, never silently routed. The
// request handler's call() context routes by the same generated Binding
// name derivation as the pre-v2 entry.
function entrySourceV2(moduleSpecifier) {
  return `/**
 * GENERATED component entry (lagrange service generate, service-cell-v2
 * generic-dispatch world).
 *
 * This file is the compiler's output, not a hand-authored surface: it
 * exists so the sealed service-cell-v2 world's fixed exports
 * (handle-request(handler, request), run(operation, batch, arguments),
 * reduce(operation, partials, arguments)) can be adapted onto the
 * developer's unmodified lagrange.service.js descriptor tables by
 * explicit id. It statically imports that module graph as ordinary ES
 * modules — no Function serialization, no bundling — so ComponentizeJS
 * resolves the developer's imports itself. Regenerate with \`lagrange
 * service generate\`; do not edit.
 *
 *   - handle-request: id-keyed handler dispatch; the request handler's
 *     \`call()\` routes a declared operation descriptor to the canonical
 *     \`lagrange:cell/context\` call-binding host import under the
 *     deterministically generated Binding name
 *     \`<service>--call--<kebab(operation id)>\`. An unknown handler id
 *     is refused with a typed error, never silently routed.
 *   - run/reduce: id-keyed operation dispatch, WIT rows flattened to
 *     plain records and partials JSON-encoded through the
 *     \`lagrange:cell/call-context\` emit host import. An unknown
 *     operation id is refused with a typed error.
 *
 * The name derivation here mirrors
 * src/service/service-deployment-record-generator.js.
 */
import {callBinding} from 'lagrange:cell/context';
import {emit} from 'lagrange:cell/call-context';

import service from ${JSON.stringify(moduleSpecifier)};

const AUTHORING_DESCRIPTOR_KIND = Object.freeze({
  DISTRIBUTED_OPERATION: 'distributed_operation',
  REQUEST_HANDLER: 'request_handler',
});
const FETCH_HANDLER_ID = 'fetch';
const DEFAULT_REQUEST_ORIGIN = 'http://localhost';
const DEFAULT_REQUEST_PATH = '/';
const DEFAULT_REQUEST_METHOD = 'GET';
const HEAD_REQUEST_METHOD = 'HEAD';
const SET_COOKIE_HEADER = 'set-cookie';
const REQUEST_CLIENT_CLOSED_CODE = 'request_client_closed';
const UNSUPPORTED_CONCURRENCY_CODE = 'unsupported_concurrency';
const UNFINISHED_CHILD_WORK_CODE = 'unfinished_child_work';
const CALL_SETTLE_MICROTASK_TURNS = 8;
const BODY_FORBIDDEN_STATUSES = new Set([101, 204, 205, 304]);
const HTTP_STATUS = Object.freeze({
  NOT_FOUND: 404,
  OK: 200,
});
const JSON_HEADERS = Object.freeze([
  Object.freeze(['content-type', 'application/json']),
]);
const UNKNOWN_HANDLER_CODE = 'unknown_handler_id';
const UNKNOWN_OPERATION_CODE = 'unknown_operation_id';
const ROUTE_NOT_FOUND_CODE = 'route_not_found';
const UNDECLARED_OPERATION_CODE = 'undeclared_operation';
const CALL_BINDING_INFIX = '--call--';
const CAMEL_TO_KEBAB_BOUNDARY = /([a-z0-9])([A-Z])/gu;
const KEBAB_BOUNDARY_REPLACEMENT = '$1-$2';
const CELL_VALUE_TAG = Object.freeze({
  INTEGER: 'integer',
  NULL: 'null-value',
});

function generatedCallBindingName(serviceName, operationId) {
  const kebabId = operationId
    .replace(CAMEL_TO_KEBAB_BOUNDARY, KEBAB_BOUNDARY_REPLACEMENT)
    .toLowerCase();
  return \`\${serviceName}\${CALL_BINDING_INFIX}\${kebabId}\`;
}

function decodeBase64Bytes(b64) {
  const binary = atob(b64);
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

const OPERATION_ID_BY_DESCRIPTOR = (() => {
  const byDescriptor = new Map();
  for (const [operationId, descriptor] of Object.entries(service.operations || {})) {
    if (descriptor?.kind !== AUTHORING_DESCRIPTOR_KIND.DISTRIBUTED_OPERATION) {
      continue;
    }
    byDescriptor.set(descriptor, operationId);
  }
  return byDescriptor;
})();

const HANDLER_TABLE = (() => {
  const table = new Map();
  for (const [handlerId, handler] of Object.entries(service.handlers || {})) {
    if (handler?.kind !== AUTHORING_DESCRIPTOR_KIND.REQUEST_HANDLER) continue;
    table.set(handlerId, handler);
  }
  return table;
})();

const OPERATION_TABLE = new Map(OPERATION_ID_BY_DESCRIPTOR
  .entries()
  .map(([descriptor, operationId]) => [operationId, descriptor]));

function typedRefusal(code, id) {
  return JSON.stringify({code, id});
}

function jsonResponse(value, status = HTTP_STATUS.OK) {
  return {
    body: JSON.stringify(value),
    headers: JSON_HEADERS,
    status,
  };
}

function resolveBindingNameForOperationRef(operationRef, declaredSet) {
  if (typeof operationRef === 'string') {
    if (OPERATION_TABLE.has(operationRef)) {
      return generatedCallBindingName(service.name, operationRef);
    }
    return operationRef;
  }
  const operationId = OPERATION_ID_BY_DESCRIPTOR.get(operationRef);
  if (!operationId || (declaredSet && !declaredSet.has(operationRef))) {
    throw new Error(UNDECLARED_OPERATION_CODE);
  }
  return generatedCallBindingName(service.name, operationId);
}

function createHandlerContext(handler) {
  const declared = new Set(handler.calls);
  return {
    call(operationRef, callArguments) {
      const bindingName = resolveBindingNameForOperationRef(
        operationRef,
        declared,
      );
      return JSON.parse(
        callBinding(bindingName, JSON.stringify(callArguments)),
      );
    },
    json: jsonResponse,
  };
}

function createClientError(code, message, retryable = false, payload = null) {
  const wrapped = new Error(message);
  wrapped.code = code;
  wrapped.retryable = Boolean(retryable);
  wrapped.payload = payload ?? {
    code,
    message,
    retryable: Boolean(retryable),
  };
  return wrapped;
}

function createFetchEnv(envelope, abortSignal) {
  let closed = false;
  let concurrencyViolated = false;
  let inFlightCalls = 0;
  const callOperation = async (operationRef, callArguments = {}) => {
    if (closed) {
      throw createClientError(
        REQUEST_CLIENT_CLOSED_CODE,
        'Request-scoped client is closed after handler completion',
      );
    }
    if (inFlightCalls > 0 || concurrencyViolated) {
      concurrencyViolated = true;
      throw createClientError(
        UNSUPPORTED_CONCURRENCY_CODE,
        'Concurrent Lagrange client calls are not supported',
      );
    }
    const bindingName = resolveBindingNameForOperationRef(operationRef, null);
    inFlightCalls += 1;
    try {
      for (let turn = 0; turn < CALL_SETTLE_MICROTASK_TURNS; turn += 1) {
        await Promise.resolve();
      }
      if (concurrencyViolated) {
        throw createClientError(
          UNSUPPORTED_CONCURRENCY_CODE,
          'Concurrent Lagrange client calls are not supported',
        );
      }
      if (closed) {
        throw createClientError(
          REQUEST_CLIENT_CLOSED_CODE,
          'Request-scoped client is closed after handler completion',
        );
      }
      return JSON.parse(
        callBinding(bindingName, JSON.stringify(callArguments)),
      );
    } catch (caught) {
      if (caught?.code === REQUEST_CLIENT_CLOSED_CODE ||
          caught?.code === UNSUPPORTED_CONCURRENCY_CODE ||
          caught?.code === UNDECLARED_OPERATION_CODE) {
        throw caught;
      }
      const payload = caught?.payload;
      throw createClientError(
        payload?.code ?? caught?.code ?? null,
        payload?.message ?? String(caught?.message ?? caught),
        payload?.retryable ?? caught?.retryable,
        payload ?? null,
      );
    } finally {
      inFlightCalls -= 1;
    }
  };
  const closeClient = (suppressUnfinishedError = false) => {
    const pending = inFlightCalls;
    closed = true;
    if (!suppressUnfinishedError && !concurrencyViolated && pending > 0) {
      throw createClientError(
        UNFINISHED_CHILD_WORK_CODE,
        'Request handler returned with unfinished child work',
      );
    }
  };
  const env = Object.freeze({
    call: callOperation,
    deadlineMs: envelope.deadlineMs ?? null,
    lagrange: Object.freeze({
      call: callOperation,
    }),
    principal: envelope.principal ?? null,
    roles: Object.freeze([...(envelope.roles || [])]),
    signal: abortSignal ?? null,
    tenantId: envelope.tenantId ?? null,
  });
  return {closeClient, env};
}

function toWebRequest(envelope, abortSignal) {
  const method = envelope.method || DEFAULT_REQUEST_METHOD;
  const url = envelope.url ||
    \`\${DEFAULT_REQUEST_ORIGIN}\${envelope.path || DEFAULT_REQUEST_PATH}\`;
  const headers = new Headers();
  for (const [name, value] of envelope.headers || []) {
    headers.append(name, value);
  }
  let body;
  if (method !== DEFAULT_REQUEST_METHOD && method !== HEAD_REQUEST_METHOD) {
    if (typeof envelope.bodyBase64 === 'string') {
      body = decodeBase64Bytes(envelope.bodyBase64);
    } else if (typeof envelope.body === 'string') {
      body = new TextEncoder().encode(envelope.body);
    }
  }
  const init = {body, headers, method};
  if (abortSignal) init.signal = abortSignal;
  return new Request(url, init);
}

async function fromWebResponse(response, requestMethod) {
  const rawBytes = new Uint8Array(await response.arrayBuffer());
  const isBodyForbidden =
    requestMethod === HEAD_REQUEST_METHOD ||
    BODY_FORBIDDEN_STATUSES.has(response.status);
  const responseBytes = isBodyForbidden ? new Uint8Array(0) : rawBytes;
  const headers = [];
  const setCookies = typeof response.headers.getSetCookie === 'function' ?
    response.headers.getSetCookie() :
    [];
  for (const cookie of setCookies) {
    headers.push([SET_COOKIE_HEADER, cookie]);
  }
  for (const [name, value] of response.headers.entries()) {
    if (name.toLowerCase() === SET_COOKIE_HEADER && setCookies.length > 0) {
      continue;
    }
    headers.push([name, value]);
  }
  return {
    body: new TextDecoder().decode(responseBytes),
    bodyBase64: encodeBase64Bytes(responseBytes),
    headers,
    status: response.status,
  };
}

export async function handleRequest(handlerId, requestJson) {
  if (handlerId === FETCH_HANDLER_ID && typeof service.fetch === 'function') {
    const envelope = JSON.parse(requestJson);
    const abortController = typeof AbortController === 'function' ?
      new AbortController() :
      null;
    const abortSignal = abortController ? abortController.signal : null;
    const webRequest = toWebRequest(envelope, abortSignal);
    const {closeClient, env} = createFetchEnv(envelope, abortSignal);
    let response;
    try {
      response = await service.fetch(webRequest, env);
    } catch (error) {
      closeClient(true);
      throw error;
    }
    try {
      closeClient(false);
    } catch (unfinishedError) {
      return JSON.stringify({
        code: unfinishedError.code,
        message: unfinishedError.message,
      });
    }
    return JSON.stringify(await fromWebResponse(response, webRequest.method));
  }
  const handler = HANDLER_TABLE.get(handlerId);
  if (!handler) return typedRefusal(UNKNOWN_HANDLER_CODE, handlerId);
  const request = JSON.parse(requestJson);
  return JSON.stringify(
    await handler.handle(request, createHandlerContext(handler)),
  );
}

function plainColumnValue(value) {
  if (value.tag === CELL_VALUE_TAG.NULL) return null;
  if (value.tag === CELL_VALUE_TAG.INTEGER) return Number(value.val);
  return value.val;
}

function plainRow(row) {
  const record = {};
  for (const column of row.columns) {
    record[column.name] = plainColumnValue(column.val);
  }
  return record;
}

export function run(operationId, batch, argumentsJson) {
  const operation = OPERATION_TABLE.get(operationId);
  if (!operation) return typedRefusal(UNKNOWN_OPERATION_CODE, operationId);
  const rows = batch.map(plainRow);
  const encodingEmit = (key, partial) => emit(key, JSON.stringify(partial));
  return JSON.stringify(operation.run(
    rows, JSON.parse(argumentsJson), {emit: encodingEmit},
  ));
}

export function reduce(operationId, partials, argumentsJson) {
  const operation = OPERATION_TABLE.get(operationId);
  if (!operation) return typedRefusal(UNKNOWN_OPERATION_CODE, operationId);
  const decoded = partials.map(
    ([key, partialJson]) => [key, JSON.parse(partialJson)],
  );
  return JSON.stringify(operation.reduce(
    decoded, JSON.parse(argumentsJson),
  ));
}
`;
}

/**
 * Emit the generated component entry for a service module.
 * @param {object} params
 * @param {string} params.moduleSpecifier - import specifier the entry
 *   uses for the developer's lagrange.service.js (typically './lagrange.service.js').
 * @param {string} params.outputPath - on-disk entry path to write.
 * @param {string} [params.world] - target world ('service-cell' default,
 *   or 'service-cell-v2' for the id-keyed generic-dispatch entry).
 * @return {Promise<{outputPath: string, bytes: number}>}
 */
async function emitServiceEntry({moduleSpecifier, outputPath, world}) {
  const source = world === ENTRY_WORLD.SERVICE_CELL_V2 ?
    entrySourceV2(moduleSpecifier) :
    entrySource(moduleSpecifier);
  await mkdir(path.dirname(outputPath), {recursive: true});
  await writeFile(outputPath, source, EMITTED_FILE_MODE);
  return Object.freeze({
    bytes: Buffer.byteLength(source, EMITTED_FILE_MODE),
    outputPath,
  });
}

export {emitServiceEntry};
