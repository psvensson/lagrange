/**
 * Developer-authored source for the public composed-service example.
 *
 * Read this file as one request split into three execution locations:
 *   1. `handleAccountSummary` receives the HTTP request.
 *   2. `summarizeRun` executes beside each selected partition's leader.
 *   3. `summarizeReduce` combines only the emitted partial values.
 *
 * The compiler derives package IDs, Binding names, manifests, and outbound-call
 * policy from this declaration. None of that deployment wiring belongs in the
 * service source.
 *
 * Important: the SQL selector is fixed at deployment. `accountId` is an
 * operation argument used inside `summarizeRun`; it does not rewrite the SQL
 * statement or narrow partition planning by itself.
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

// `rows` is already a bounded batch read from this partition host. Filter the
// request-specific account here, before any result crosses the network.
//
// Partial keys must be disjoint across shards. Partition ranges make row IDs
// disjoint, so the lowest matching ID is a convenient shard-specific suffix.
// The rows themselves never leave this node.
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
  // The return value is local bookkeeping only. Coordinated output is exactly
  // what was sent through emit().
  return {matched, scanned: rows.length};
}

// The reducer never sees source rows. It receives the complete validated set
// of emitted numeric pairs after every expected shard has succeeded.
// `<metric>:<shardKey>` also lets the example count contributing shards.
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

// The literal SELECT is part of the deployed operation contract. Per-request
// arguments vary the partition function, not this selector. Descriptor identity
// lets the compiler derive the call Binding and the handler's allowlist.
const summarizeAccountActivity = distributed({
  reduce: summarizeReduce,
  run: summarizeRun,
  statement: sql`SELECT id, account_id, amount_cents, flagged FROM account_activity`,
});

// The handler looks like ordinary application code: parse request data, invoke
// a declared operation, then map typed failures to HTTP. `body.target` exists
// only so the proof harness can attempt an undeclared call and show that the
// host policy rejects it before dispatch.
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

// Object keys are durable source identities. The compiler uses them to derive
// request/call Bindings and least-authority outbound-call policy.
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
