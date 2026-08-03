// One Lagrange service, four pieces in one file: the HTTP handler
// (`handle-request`), the partition function (`run`), the reducer
// (`reduce`), and the declarations live in the two Bindings next to this
// file (see the runner). ComponentizeJS compiles this source against the
// combined `service-cell` world in wit/world.wit into ONE WASM component.
//
// `handleRequest` executes in the request Cell when the deployed HTTP
// endpoint is invoked. It parses the request, asks the host for the
// authorized distributed operation by Binding name (`callBinding`), and
// owns its endpoint's HTTP mapping - success and typed failures alike.
//
// `run` executes once per relevant data partition, on the node that holds
// that partition's replica. It scans the shard's local batch, keeps only
// the requested account's rows, and emits a few numeric partials. Only
// those numbers leave the node - the transaction rows never do.
//
// `reduce` executes once, on a lease-holding replica, over the complete
// partial set from every shard, and returns the final JSON result.
import {emit} from 'lagrange:cell/call-context';
import {callBinding} from 'lagrange:cell/context';

const INNER_CALL_BINDING = 'account-summary-inner';
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_TARGET_FAILED = 500;
const JSON_HEADERS = [['content-type', 'application/json']];
const FALLBACK_ERROR_CODE = 'target_failed';
// The component owns its endpoint responses: each typed
// binding-call-error code maps to an honest HTTP status.
const HTTP_STATUS_BY_CALL_ERROR_CODE = {
  deadline_exhausted: 504,
  invalid_arguments: 400,
  target_not_allowed: 403,
  target_unavailable: 503,
};

export function handleRequest(requestJson) {
  const request = JSON.parse(requestJson);
  const accountId = request.body?.accountId ?? null;
  // Demo refusal probe only: an optional body.target lets the runner ask
  // for an UNDECLARED Binding name. The host still validates the target
  // against the durable outbound-call policy before any dispatch, so
  // this cannot escape policy - it exists to prove the 403 path.
  const target = typeof request.body?.target === 'string' ?
    request.body.target :
    INNER_CALL_BINDING;
  try {
    const result = callBinding(target, JSON.stringify({accountId}));
    return JSON.stringify({
      body: result,
      headers: JSON_HEADERS,
      status: HTTP_STATUS_OK,
    });
  } catch (error) {
    const failure = error?.payload ?? {};
    return JSON.stringify({
      body: JSON.stringify({
        code: failure.code ?? FALLBACK_ERROR_CODE,
        retryable: failure.retryable === true,
      }),
      headers: JSON_HEADERS,
      status: HTTP_STATUS_BY_CALL_ERROR_CODE[failure.code] ??
        HTTP_STATUS_TARGET_FAILED,
    });
  }
}

function columnValue(row, name) {
  for (const column of row.columns) {
    if (column.name === name) return column.val;
  }
  return {tag: 'null-value'};
}

function integerColumn(row, name) {
  const value = columnValue(row, name);
  // s64 columns arrive as BigInt through the component ABI.
  return value.tag === 'integer' ? Number(value.val) : null;
}

export function run(batch, argumentsJson) {
  const {accountId} = JSON.parse(argumentsJson);
  let matched = 0;
  let totalCents = 0;
  let largestCents = 0;
  let flagged = 0;
  let shardKey = null;
  for (const row of batch) {
    if (integerColumn(row, 'account_id') !== accountId) continue;
    const id = integerColumn(row, 'id');
    const amountCents = integerColumn(row, 'amount_cents');
    if (id === null || amountCents === null) continue;
    // Partition ranges make row ids shard-disjoint, so the lowest matching
    // id is a valid shard-unique group-key suffix (the reduce gate refuses
    // overlapping group keys across shards).
    if (shardKey === null || id < shardKey) shardKey = id;
    matched += 1;
    totalCents += amountCents;
    if (amountCents > largestCents) largestCents = amountCents;
    if (integerColumn(row, 'flagged') === 1) flagged += 1;
  }
  if (matched > 0) {
    // Partials are numeric per-group aggregation values (the only shape
    // the reduce coordination gate accepts today).
    emit(`count:${shardKey}`, JSON.stringify(matched));
    emit(`total:${shardKey}`, JSON.stringify(totalCents));
    emit(`largest:${shardKey}`, JSON.stringify(largestCents));
    emit(`flagged:${shardKey}`, JSON.stringify(flagged));
  }
  // The return value is per-shard bookkeeping; it is not coordinated.
  return JSON.stringify({matched, scanned: batch.length});
}

export function reduce(partials, argumentsJson) {
  const {accountId} = JSON.parse(argumentsJson);
  let transactions = 0;
  let totalCents = 0;
  let largestCents = 0;
  let flagged = 0;
  const shards = new Set();
  for (const [key, partialJson] of partials) {
    // Keys arrive exactly as emitted: `<metric>:<shardKey>`.
    const [metric, shardKey] = key.split(':');
    const value = JSON.parse(partialJson);
    shards.add(shardKey);
    if (metric === 'count') transactions += value;
    else if (metric === 'total') totalCents += value;
    else if (metric === 'largest') largestCents = Math.max(largestCents, value);
    else if (metric === 'flagged') flagged += value;
  }
  return JSON.stringify({
    accountId,
    contributingShards: shards.size,
    flagged,
    largestCents,
    meanCents: transactions === 0 ? 0 : Math.round(totalCents / transactions),
    totalCents,
    transactions,
  });
}
