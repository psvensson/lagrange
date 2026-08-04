/**
 * Generated-entry shape proof for the service-cell-v2 generic-dispatch
 * world: this guest plays the role of the compiler-generated component
 * entry for a service with TWO request handlers and TWO distributed
 * operations. Dispatch tables keyed by explicit descriptor-key ids route
 * the fixed exports (handle-request(handler, request),
 * run(operation, batch, arguments), reduce(operation, partials,
 * arguments)) to the bound implementation; an unknown handler or
 * operation id is refused with a typed error, never silently routed.
 *
 * The handler and operation implementations below stand in for the
 * developer's unmodified lagrange.service.js descriptor tables, which
 * the real generated entry statically imports (sealed decision 4). The
 * dispatch-table shape — id-keyed maps built once at module load, typed
 * refusal for unknown ids — is the property under test, not these
 * particular implementations.
 */

const UNKNOWN_HANDLER_ERROR = Object.freeze({
  code: 'unknown_handler_id',
});
const UNKNOWN_OPERATION_ERROR = Object.freeze({
  code: 'unknown_operation_id',
});
const HTTP_STATUS = Object.freeze({
  NOT_FOUND: 404,
  OK: 200,
});
const JSON_HEADERS = Object.freeze([
  Object.freeze(['content-type', 'application/json']),
]);
const CELL_VALUE_TAG = Object.freeze({
  INTEGER: 'integer',
  NULL: 'null-value',
});

function jsonResponse(value, status = HTTP_STATUS.OK) {
  return {
    body: JSON.stringify(value),
    headers: JSON_HEADERS,
    status,
  };
}

// --- Developer-side implementations (stand-ins for lagrange.service.js
// descriptor tables). Identities below mirror the explicit object keys a
// real service module would carry: handlers {accountSummary, accountHealth},
// operations {summarizeActivity, countRows}.

const accountSummaryHandler = {
  handle(request, context) {
    const body = JSON.parse(request.body || '{}');
    const summary = context.call('summarizeActivity', {
      accountId: body.accountId ?? null,
    });
    return context.json({accountId: body.accountId ?? null, summary});
  },
};

const accountHealthHandler = {
  handle(_request, context) {
    return context.json({status: 'ok'});
  },
};

const summarizeActivityOperation = {
  run(rows, runArguments, {emit}) {
    let total = 0;
    for (const row of rows) {
      total += Number(row.amount ?? 0);
    }
    emit('total', total + Number(runArguments.bias ?? 0));
    return {scanned: rows.length};
  },
  reduce(partials, reduceArguments) {
    let total = 0;
    for (const [_key, partial] of partials) {
      total += Number(partial);
    }
    return {total: total - Number(reduceArguments.bias ?? 0)};
  },
};

const countRowsOperation = {
  run(rows, _runArguments, {emit}) {
    emit('count', rows.length);
    return {scanned: rows.length};
  },
  reduce(partials, _reduceArguments) {
    let count = 0;
    for (const [_key, partial] of partials) {
      count += Number(partial);
    }
    return {count};
  },
};

// --- Generated dispatch tables (built once at module load from explicit
// descriptor keys — sealed decision 1: identity never comes from
// Function.name, path, SQL text, or array position).

const HANDLER_TABLE = Object.freeze(new Map(Object.entries({
  accountHealth: accountHealthHandler,
  accountSummary: accountSummaryHandler,
})));

const OPERATION_TABLE = Object.freeze(new Map(Object.entries({
  countRows: countRowsOperation,
  summarizeActivity: summarizeActivityOperation,
})));

function typedRefusal(error, id) {
  return JSON.stringify({code: error.code, id});
}

function createHandlerContext(_handlerId) {
  return {
    call(operationId, callArguments) {
      // The real generated entry routes through the lagrange:cell/context
      // call-binding host import under the generated Binding name; this
      // shape proof dispatches in-component so the two-operation dispatch
      // table is what the ABI test exercises.
      const operation = OPERATION_TABLE.get(operationId);
      if (!operation) throw new Error(UNKNOWN_OPERATION_ERROR.code);
      return operation.reduce(
        [['total', Number(callArguments?.accountId ?? 0)]], {});
    },
    json: jsonResponse,
  };
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

export function handleRequest(handlerId, requestJson) {
  const handler = HANDLER_TABLE.get(handlerId);
  if (!handler) return typedRefusal(UNKNOWN_HANDLER_ERROR, handlerId);
  const request = JSON.parse(requestJson);
  return JSON.stringify(handler.handle(request, createHandlerContext(handlerId)));
}

export function run(operationId, batch, argumentsJson) {
  const operation = OPERATION_TABLE.get(operationId);
  if (!operation) return typedRefusal(UNKNOWN_OPERATION_ERROR, operationId);
  const rows = batch.map(plainRow);
  const encodingEmit = (key, partial) => ({key, partialJson: JSON.stringify(partial)});
  const emitted = [];
  const collectEmit = (key, partial) => emitted.push(encodingEmit(key, partial));
  const result = operation.run(rows, JSON.parse(argumentsJson), {emit: collectEmit});
  return JSON.stringify({emitted, result});
}

export function reduce(operationId, partials, argumentsJson) {
  const operation = OPERATION_TABLE.get(operationId);
  if (!operation) return typedRefusal(UNKNOWN_OPERATION_ERROR, operationId);
  const decoded = partials.map(
    ([key, partialJson]) => [key, JSON.parse(partialJson)],
  );
  return JSON.stringify(operation.reduce(decoded, JSON.parse(argumentsJson)));
}
