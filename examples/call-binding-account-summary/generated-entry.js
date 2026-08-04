/**
 * GENERATED component entry (code-first service compiler).
 *
 * This file is the compiler's output, not a hand-authored surface: it
 * exists so the sealed service-cell world's fixed exports
 * (handle-request, run, reduce) can be adapted onto the developer's
 * unmodified `lagrange.service.js` descriptor tables. It statically
 * imports that module graph as ordinary ES modules - no Function
 * serialization, no bundling - so ComponentizeJS resolves the developer's
 * imports itself.
 *
 *   - handle-request: method+path dispatch over the http handlers, each
 *     with a per-handler context whose `call()` routes a declared
 *     operation descriptor to the canonical `lagrange:cell/context`
 *     call-binding host import under the deterministically generated
 *     Binding name `<service>--call--<kebab(operation id)>` - the exact
 *     name the deployment records own. A raw string target (the demo's
 *     refusal probe) is forwarded verbatim so the host's durable
 *     outbound-call policy is the sole gate.
 *   - run/reduce: the single distributed operation, WIT rows flattened to
 *     plain records and partials JSON-encoded through the
 *     `lagrange:cell/call-context` emit host import.
 *
 * The name derivation here mirrors
 * src/service/service-deployment-record-generator.js; the parity test
 * pins both to the same generated name.
 */
import {callBinding} from 'lagrange:cell/context';
import {emit} from 'lagrange:cell/call-context';

import {AUTHORING_DESCRIPTOR_KIND} from '../../src/authoring/define-service.js';

import service from './lagrange.service.js';

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
  return `${serviceName}${CALL_BINDING_INFIX}${kebabId}`;
}

function routeKey(method, path) {
  return `${method} ${path}`;
}

// Operation identity comes from the explicit operations-object key
// (sealed decision 1: never Function.name). The descriptor->id map lets a
// handler reference an operation by descriptor identity.
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
        // Demo refusal probe: a raw, possibly-undeclared target name flows
        // straight to the host. The generated access policy - not this
        // code - refuses anything outside the allowlist (fail-closed).
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
