/**
 * The developer module of the spike, following the epic's model
 * (solve/epics/code-first-service-compiler.md): authored purely with the
 * guest-safe stub — one distributed operation and two HTTP routes, one
 * handler imported from a sibling module. The generated entry imports
 * this file statically; nothing here is serialized or rewritten.
 */
import {defineService, distributed, http, sql} from './authoring.js';
import {accountHealthHandler} from './handlers.js';

const SERVICE_NAME = 'account-summary';
const SERVICE_VERSION = '0.1.0';
// Operation identity is this operations-object key (sealed decision 1:
// identity from explicit object keys, never Function.name).
const SUMMARIZE_OPERATION = 'summarizeAccountActivity';
const PARTIAL_KEY = Object.freeze({
  COUNT: 'count',
  TOTAL: 'total',
});

function summarizeRun(rows, {accountId}, {emit}) {
  let matched = 0;
  let totalCents = 0;
  for (const row of rows) {
    if (row.account_id !== accountId) continue;
    matched += 1;
    totalCents += row.amount_cents;
  }
  emit(PARTIAL_KEY.COUNT, matched);
  emit(PARTIAL_KEY.TOTAL, totalCents);
  return {matched, scanned: rows.length};
}

function summarizeReduce(_partials, {accountId}, {sum}) {
  return {
    accountId,
    totalCents: sum(PARTIAL_KEY.TOTAL),
    transactions: sum(PARTIAL_KEY.COUNT),
  };
}

export default defineService({
  handlers: {
    accountHealth: http.get('/accounts/health', {
      handle: accountHealthHandler,
    }),
    accountSummary: http.post('/accounts/summary', {
      calls: [SUMMARIZE_OPERATION],
      handle(request, {call, json}) {
        return json(call(SUMMARIZE_OPERATION, {
          accountId: request.body?.accountId ?? null,
        }));
      },
    }),
  },
  name: SERVICE_NAME,
  operations: {
    [SUMMARIZE_OPERATION]: distributed({
      reduce: summarizeReduce,
      run: summarizeRun,
      statement: sql`SELECT account_id, amount_cents FROM transactions`,
    }),
  },
  version: SERVICE_VERSION,
});
