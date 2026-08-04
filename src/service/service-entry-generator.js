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

const HANDLER_TABLE = (() => {
  const table = new Map();
  for (const [handlerId, handler] of Object.entries(service.handlers)) {
    if (handler.kind !== AUTHORING_DESCRIPTOR_KIND.REQUEST_HANDLER) continue;
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

function createHandlerContext(handler) {
  const declared = new Set(handler.calls);
  return {
    call(operationRef, callArguments) {
      let bindingName;
      if (typeof operationRef === 'string') {
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

export function handleRequest(handlerId, requestJson) {
  const handler = HANDLER_TABLE.get(handlerId);
  if (!handler) return typedRefusal(UNKNOWN_HANDLER_CODE, handlerId);
  const request = JSON.parse(requestJson);
  return JSON.stringify(
    handler.handle(request, createHandlerContext(handler)),
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
