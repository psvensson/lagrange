// The redelivery owner's load and latency on a write whose outcome stays
// unknown (a partition that answers OUTCOME_UNKNOWN for as long as the trap
// holds): re-deliveries back off exponentially within the budget, and the
// budget is the caller's deadline when it passed one.
//
// Production classes: the real SQLQueryEngine, QueryExecutor and
// PartitionService on the real rs-raft WASM core; the unknown outcome is the
// runtime owner's setCoreFaultInjector trap.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import * as writeKernel from '../../src/partition/partition-write-kernel.js';
import {UNKNOWN_OUTCOME_REDELIVERY_MAX_DELAY_MS} from
  '../../src/query/query-executor-unknown-outcome.js';
import {
  SURFACE_INSERT,
  USER_TABLE,
  trapCore,
  withMutedConsoleError,
  withSurface,
} from './unknown-outcome-surface-fixture.js';

const OUTCOME_UNKNOWN =
  writeKernel.PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN;
const TEST_TIMEOUT_MS = 60000;
// The executor's production retry delay (QUERY_DEFAULTS.LEADER_RETRY_DELAY_MS).
const PRODUCTION_RETRY_DELAY_MS = 50;
const EXECUTOR_BUDGET_MS = 6000;
const LONG_EXECUTOR_BUDGET_MS = 30000;
const CALLER_DEADLINE_MS = 400;
// Room for the last delivery's own answer and the event loop on a slow host.
const DEADLINE_SLACK_MS = 1500;

// One INSERT against a partition that answers unknown until the trap is
// released (after the call): its elapsed time, deliveries and answer.
async function unknownForever({engine, deliveries, of}, options) {
  const surface = of(USER_TABLE);
  await engine.executeQuery(SURFACE_INSERT, ['row-0', 's']);
  deliveries.length = 0;
  const logger = engine.queryExecutor.logger;
  engine.queryExecutor.logger = {...logger, debug: () => undefined,
    info: () => undefined, warn: () => undefined, error: () => undefined};
  const trap = trapCore(surface.partitionId, {once: false});
  const startedAt = Date.now();
  let result;
  try {
    result = await withMutedConsoleError(() =>
      engine.executeQuery(SURFACE_INSERT, ['row-u', 'v'], options));
  } finally {
    trap.release();
    engine.queryExecutor.logger = logger;
  }
  return {result, elapsedMs: Date.now() - startedAt,
    deliveries: deliveries.length, trap};
}

// The deliveries an unresolved write gets in `budgetMs` at the production
// retry delay with the backoff: the delays double from the retry delay up
// to the cap; one delivery after each, plus the first.
function backedOffDeliveries(budgetMs) {
  let spent = 0;
  let delay = PRODUCTION_RETRY_DELAY_MS;
  let count = 1;
  while (spent + delay <= budgetMs) {
    spent += delay;
    count += 1;
    delay = Math.min(UNKNOWN_OUTCOME_REDELIVERY_MAX_DELAY_MS, delay * 2);
  }
  return count;
}

test('an unknown that outlasts the budget is re-delivered with backoff - a ' +
  'handful of deliveries, not one per retry delay - and ends typed',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withSurface([USER_TABLE], async (surface) => {
    surface.engine.queryExecutor.leaderRetryDelayMs = PRODUCTION_RETRY_DELAY_MS;
    surface.engine.queryExecutor.queryTimeoutMs = EXECUTOR_BUDGET_MS;
    const {result, elapsedMs, deliveries, trap} =
      await unknownForever(surface, {});
    assert.ok(trap.count >= 1, 'setup: the core trapped the write');
    const failure = result.participantFailures?.[0];
    assert.equal(failure?.failureCode, OUTCOME_UNKNOWN,
      `typed unknown (${JSON.stringify(failure)})`);
    const unbacked = Math.floor(EXECUTOR_BUDGET_MS / PRODUCTION_RETRY_DELAY_MS);
    assert.ok(deliveries <= backedOffDeliveries(EXECUTOR_BUDGET_MS) + 1,
      `backed off: ${deliveries} deliveries in ${elapsedMs} ms ` +
      `(${backedOffDeliveries(EXECUTOR_BUDGET_MS)} expected; ${unbacked} at ` +
      'a fixed delay)');
    assert.ok(deliveries >= 3, `still re-delivered (${deliveries})`);
    assert.ok(elapsedMs <= EXECUTOR_BUDGET_MS + DEADLINE_SLACK_MS,
      `within the budget (${elapsedMs} ms)`);
    assert.equal(failure.spentWait.deliveries, deliveries,
      'the spent wait counts them');
  });
});

for (const [label, deadline] of [
  ['timeoutBudget (the PG wire statement budget)', () => ({timeoutBudget:
    {deadlineMs: Date.now() + CALLER_DEADLINE_MS}})],
  ['timeoutMs', () => ({timeoutMs: CALLER_DEADLINE_MS})],
]) {
  test(`a caller deadline (${label}) bounds the redelivery of an unknown ` +
    'outcome: answered typed unknown at the deadline, never held for the ' +
    'executor budget', {timeout: TEST_TIMEOUT_MS}, async () => {
    await withSurface([USER_TABLE], async (surface) => {
      surface.engine.queryExecutor.leaderRetryDelayMs =
        PRODUCTION_RETRY_DELAY_MS;
      surface.engine.queryExecutor.queryTimeoutMs = LONG_EXECUTOR_BUDGET_MS;
      const {result, elapsedMs, trap} =
        await unknownForever(surface, deadline());
      assert.ok(trap.count >= 1, 'setup: the core trapped the write');
      assert.ok(elapsedMs <= CALLER_DEADLINE_MS + DEADLINE_SLACK_MS,
        `answered by the caller's deadline (${elapsedMs} ms of ` +
        `${CALLER_DEADLINE_MS}; executor budget ${LONG_EXECUTOR_BUDGET_MS})`);
      assert.equal(result.participantFailures?.[0]?.failureCode,
        OUTCOME_UNKNOWN, 'as the typed unknown outcome');
    });
  });
}
