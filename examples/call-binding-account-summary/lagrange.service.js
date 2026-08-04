/**
 * The code-first account-summary service: ONE file authored purely with
 * the guest-safe authoring library (src/authoring/*), from which the
 * compiler derives everything the platform needs.
 *
 * The developer declares data, not deployment wiring: one distributed
 * operation and two HTTP routes. There is NO Binding-name literal
 * anywhere here — the durable `<service>--call--<kebab(op id)>` and
 * `<service>--request--<kebab(handler id)>` names are the compiler's to
 * mint from these explicit object keys (the generated entry mirrors the
 * exact same derivation, and the deployment records own the authoritative
 * copy). The hand-authored deployment builder this file replaced is gone.
 *
 *   - `summarizeAccountActivity` runs per data partition against the
 *     declared statement, keeps only the requested account's rows, and
 *     emits numeric partials; `reduce` folds every shard's partials into
 *     the final JSON summary. Only numbers leave a node - never rows.
 *   - `accountSummary` (POST /accounts/summary) invokes that operation by
 *     descriptor through the authorized call bridge and owns the endpoint's
 *     HTTP mapping - success and each typed call-failure code alike.
 *   - `accountHealth` (GET /accounts/health) is a second route served by
 *     the SAME component via method+path dispatch; it declares no calls,
 *     so the compiler emits no outbound-call policy for it.
 */
import {defineService} from '../../src/authoring/define-service.js';
import {distributed} from '../../src/authoring/distributed-operation.js';
import {http} from '../../src/authoring/request-handler.js';
import {sql} from '../../src/authoring/sql-template.js';

const SERVICE_NAME = 'account-summary';
const SERVICE_VERSION = '1.0.0';

const JSON_HEADERS = Object.freeze([
  Object.freeze(['content-type', 'application/json']),
]);
const HTTP_STATUS_TARGET_FAILED = 500;
const FALLBACK_ERROR_CODE = 'target_failed';
// The component owns its endpoint responses: each typed
// binding-call-error code maps to an honest HTTP status.
const HTTP_STATUS_BY_CALL_ERROR_CODE = Object.freeze({
  deadline_exhausted: 504,
  invalid_arguments: 400,
  target_not_allowed: 403,
  target_unavailable: 503,
});
const HEALTH_BODY = Object.freeze({service: SERVICE_NAME, status: 'ok'});

const PARTIAL_METRIC = Object.freeze({
  COUNT: 'count',
  FLAGGED: 'flagged',
  LARGEST: 'largest',
  TOTAL: 'total',
});
const PARTIAL_KEY_SEPARATOR = ':';

// Partition-local work: keep only the requested account's rows and emit a
// few numeric partials keyed by a shard-unique suffix. Partition ranges
// make row ids shard-disjoint, so the lowest matching id is a valid
// shard-unique group-key suffix (the reduce gate refuses overlapping group
// keys across shards). The rows themselves never leave the node.
function summarizeRun(rows, {accountId}, {emit}) {
  let matched = 0;
  let totalCents = 0;
  let largestCents = 0;
  let flagged = 0;
  let shardKey = null;
  for (const row of rows) {
    if (row.account_id !== accountId) continue;
    const id = row.id;
    const amountCents = row.amount_cents;
    if (id === null || amountCents === null) continue;
    if (shardKey === null || id < shardKey) shardKey = id;
    matched += 1;
    totalCents += amountCents;
    if (amountCents > largestCents) largestCents = amountCents;
    if (row.flagged === 1) flagged += 1;
  }
  if (matched > 0) {
    emit(`${PARTIAL_METRIC.COUNT}${PARTIAL_KEY_SEPARATOR}${shardKey}`, matched);
    emit(`${PARTIAL_METRIC.TOTAL}${PARTIAL_KEY_SEPARATOR}${shardKey}`, totalCents);
    emit(
      `${PARTIAL_METRIC.LARGEST}${PARTIAL_KEY_SEPARATOR}${shardKey}`,
      largestCents,
    );
    emit(`${PARTIAL_METRIC.FLAGGED}${PARTIAL_KEY_SEPARATOR}${shardKey}`, flagged);
  }
  // Per-shard bookkeeping; it is not coordinated.
  return {matched, scanned: rows.length};
}

// Reduction over every shard's partials. Keys arrive exactly as emitted -
// `<metric>:<shardKey>` - so the distinct shard suffixes count the
// contributing shards.
function summarizeReduce(partials, {accountId}) {
  let transactions = 0;
  let totalCents = 0;
  let largestCents = 0;
  let flagged = 0;
  const shards = new Set();
  for (const [key, value] of partials) {
    const [metric, shardKey] = key.split(PARTIAL_KEY_SEPARATOR);
    shards.add(shardKey);
    if (metric === PARTIAL_METRIC.COUNT) transactions += value;
    else if (metric === PARTIAL_METRIC.TOTAL) totalCents += value;
    else if (metric === PARTIAL_METRIC.LARGEST) {
      largestCents = Math.max(largestCents, value);
    } else if (metric === PARTIAL_METRIC.FLAGGED) flagged += value;
  }
  return {
    accountId,
    contributingShards: shards.size,
    flagged,
    largestCents,
    meanCents: transactions === 0 ? 0 : Math.round(totalCents / transactions),
    totalCents,
    transactions,
  };
}

// The single distributed operation, referenced by descriptor identity -
// never by a Binding-name string - from both `operations` and the
// handler's `calls` allowlist.
const summarizeAccountActivity = distributed({
  reduce: summarizeReduce,
  run: summarizeRun,
  statement: sql`SELECT id, account_id, amount_cents, flagged FROM account_activity`,
});

// The composed HTTP endpoint. `call(descriptor, args)` reaches the deployed
// call Binding through the authorized bridge; the optional demo affordance
// `body.target` lets the runner ask for an UNDECLARED target so the host's
// durable outbound-call policy (not this code) proves the fail-closed 403.
function handleAccountSummary(request, {call, json}) {
  const accountId = request.body?.accountId ?? null;
  const target = typeof request.body?.target === 'string' ?
    request.body.target :
    summarizeAccountActivity;
  try {
    return json(call(target, {accountId}));
  } catch (error) {
    const failure = error?.payload ?? {};
    return {
      body: JSON.stringify({
        code: failure.code ?? FALLBACK_ERROR_CODE,
        retryable: failure.retryable === true,
      }),
      headers: JSON_HEADERS,
      status: HTTP_STATUS_BY_CALL_ERROR_CODE[failure.code] ??
        HTTP_STATUS_TARGET_FAILED,
    };
  }
}

function handleAccountHealth(_request, {json}) {
  return json(HEALTH_BODY);
}

export default defineService({
  handlers: {
    accountHealth: http.get('/accounts/health', {
      handle: handleAccountHealth,
    }),
    accountSummary: http.post('/accounts/summary', {
      calls: [summarizeAccountActivity],
      handle: handleAccountSummary,
    }),
  },
  name: SERVICE_NAME,
  operations: {
    summarizeAccountActivity,
  },
  version: SERVICE_VERSION,
});
