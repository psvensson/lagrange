/**
 * Hand-written stand-in for the future generator output (epic rung 1).
 * It statically imports the developer's unmodified module graph as ES
 * modules — no Function serialization, no bundling — and adapts the
 * sealed service-cell world's fixed export surface onto the definition's
 * descriptor tables:
 *   - handle-request: method+path dispatch over the http handlers, with a
 *     per-handler context whose call() routes declared operations to the
 *     canonical `lagrange:cell/context` call-binding host import under a
 *     deterministically generated Binding name;
 *   - run/reduce: the single distributed operation (pre-v2 bridge),
 *     with WIT rows flattened to plain records and partials JSON-encoded
 *     through the `lagrange:cell/call-context` emit host import.
 */
import {callBinding} from 'lagrange:cell/context';
import {emit} from 'lagrange:cell/call-context';
import {DESCRIPTOR_KIND} from './authoring.js';
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
const SINGLE_DISTRIBUTED_OPERATION_MESSAGE =
  'the pre-v2 bridge requires exactly one distributed operation';
const CELL_VALUE_TAG = Object.freeze({
  INTEGER: 'integer',
  NULL: 'null-value',
});

// Deterministic generated Binding name (sealed decision 2):
// <service-name>--call--<kebab-case(operation key)>.
function generatedCallBindingName(serviceName, operationKey) {
  const kebabKey = operationKey
    .replace(CAMEL_TO_KEBAB_BOUNDARY, '$1-$2')
    .toLowerCase();
  return `${serviceName}${CALL_BINDING_INFIX}${kebabKey}`;
}

function routeKey(method, path) {
  return `${method} ${path}`;
}

const DISPATCH_TABLE = (() => {
  const table = new Map();
  for (const handler of Object.values(service.handlers)) {
    if (handler.kind !== DESCRIPTOR_KIND.HTTP) continue;
    table.set(routeKey(handler.method, handler.path), handler);
  }
  return table;
})();

const DISTRIBUTED_OPERATION = (() => {
  const candidates = Object.values(service.operations)
    .filter((operation) => operation.kind === DESCRIPTOR_KIND.DISTRIBUTED);
  if (candidates.length !== 1) {
    throw new Error(SINGLE_DISTRIBUTED_OPERATION_MESSAGE);
  }
  return candidates[0];
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
  return {
    call(operationKey, callArguments) {
      if (!handler.calls.includes(operationKey)) {
        throw new Error(`${UNDECLARED_OPERATION_CODE}: ${operationKey}`);
      }
      const bindingName =
        generatedCallBindingName(service.name, operationKey);
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
  const partialsHelper = {
    sum(key) {
      let total = 0;
      for (const [partialKey, value] of decoded) {
        if (partialKey === key) total += value;
      }
      return total;
    },
  };
  return JSON.stringify(DISTRIBUTED_OPERATION.reduce(
    decoded, JSON.parse(argumentsJson), partialsHelper,
  ));
}
