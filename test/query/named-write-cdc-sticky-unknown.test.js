// A named write whose one CDC call re-sends after an unknown attempt
// (line-regression-causes stage 3; verify-named-write-stage3 finding 1). The
// CDC routed-mutation loop re-sends a retryable failure under the write's one
// key. Once an attempt may have been proposed (the typed unknown: its entry is
// durable and may still commit), a later re-send refused before proposal
// (NOT_LEADER) proves nothing of that entry: the named write stays unresolved
// and its caller gets the named UNKNOWN, never NOT_PROPOSED; once the entry
// commits, the next delivery of the name is its settled replay, APPLIED
// exactly once. The mirror: a call whose every attempt was refused before
// proposal IS definite NOT_PROPOSED. And (finding 2) a shutdown that overtakes
// such a call answers the writer's terminal SHUT_DOWN, thrown and not retried
// here, with the outcome unknown beside it: never "pending, retry", never
// "not applied".
//
// Real producers (unknown-outcome-surface-fixture): a lone rs-raft leader
// PartitionService, the real SQLQueryEngine and executor, the real CDC
// integration service, control-plane gateway and named-write judge. The CDC's
// engine attempt 1 is held by a core trap past the executor's budget (the
// fixture's spent-attempt shape: unknown, the entry commits once the trap is
// gone); its later attempts meet the write kernel's own NOT_LEADER refusal, as
// a replica that lost leadership answers.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TABLES} from '../../src/constants/index.js';
import {
  PARTITION_WRITE_LEADERSHIP_REFUSAL,
  buildPartitionWriteLeadershipRefusal,
} from '../../src/partition/partition-write-kernel.js';
import {CDC_ERROR_CODE} from '../../src/cdc/cdc-constants.js';
import {isRetryableControlPlaneError} from
  '../../src/control-plane/control-plane-error-classification.js';
import {
  isControlPlaneWriteDefinitivelyUnappliedError,
  isControlPlaneWriteOutcomeUnknown,
} from '../../src/control-plane/control-plane-write-identity.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  SETTLE_BUDGET_MS,
  appliedRow,
  limitSurfaceWriteAttempt,
  rowsOf,
  trapCore,
  withMutedConsoleError,
  withSurface,
} from './unknown-outcome-surface-fixture.js';

const TABLE = TABLES.STORAGE_RESERVATIONS;
const KEY_COLUMN = 'reservation_id';
const TIMEOUT_MS = 180000;
const TRAP = 'trap';
const REFUSE = 'refuse';
const {OUTCOME_UNKNOWN} = PARTITION_WRITE_LEADERSHIP_REFUSAL;
const WRITE_HEAD = /^\s*(INSERT|UPDATE|DELETE)\b/iu;

function reservation(id) {
  const now = Date.now();
  return {reservation_id: id, operation_id: `op-${id}`, entity_type: 'partition',
    entity_id: 'p-1', partition_id: 'p-1', target_node_id: 'n-1', estimated_bytes: 1,
    amplification_factor: 1, status: 'active', created_at: now, updated_at: now,
    expires_at: now + 60000};
}

async function settle(promise) {
  try {
    return {answer: await promise, thrown: null};
  } catch (thrown) {
    return {answer: null, thrown};
  }
}

function describe(answer) {
  return JSON.stringify({success: answer?.success, error: answer?.error ?? answer?.message,
    failureCode: answer?.failureCode, code: answer?.code, outcome: answer?.outcome,
    pendingInstance: answer?.pendingInstance ?? null});
}

// The CDC's keyed engine attempts of the write, each answered by the
// partition as `schedule` says: TRAP - the real leader takes the entry and its
// core traps before commit, past the executor's budget (unknown); REFUSE - the
// write kernel's NOT_LEADER refusal, before any proposal.
function scheduleEngineAttempts({engine, surface, schedule, afterFirst = null}) {
  const executeQuery = engine.executeQuery;
  const handleRemoteQuery = surface.partition.handleRemoteQuery;
  const state = {attempts: 0, refusals: 0, trap: null};
  const refuse = async () => {
    state.refusals += 1;
    return buildPartitionWriteLeadershipRefusal({role: RAFT_ROLE.FOLLOWER},
      surface.partitionId);
  };
  engine.executeQuery = async (sql, params, options = {}) => {
    if (!WRITE_HEAD.test(sql) || typeof options.idempotencyKey !== 'string') {
      return executeQuery.call(engine, sql, params, options);
    }
    state.attempts += 1;
    const step = schedule[state.attempts - 1];
    surface.partition.handleRemoteQuery = step === REFUSE ? refuse : handleRemoteQuery;
    if (step === TRAP && state.trap === null) {
      state.trap = trapCore(surface.partitionId, {once: false});
    }
    const answer = await executeQuery.call(engine, sql, params, options);
    if (state.attempts === 1) afterFirst?.();
    return answer;
  };
  return {state, restore() {
    engine.executeQuery = executeQuery;
    surface.partition.handleRemoteQuery = handleRemoteQuery;
    state.trap?.release();
  }};
}

async function runScheduled(context, schedule, row, name, {afterFirst = null} = {}) {
  const surface = context.of(TABLE);
  context.cdcIntegrationService.retryMaxAttempts = schedule.length;
  const restoreLimit = limitSurfaceWriteAttempt(context.engine);
  const driven = scheduleEngineAttempts({engine: context.engine, surface, schedule,
    afterFirst});
  try {
    const caller = await withMutedConsoleError(() => settle(
      context.gateway.insertSystemTableRow(TABLE, row, {writeIdentity: name})));
    return {caller, seen: caller.answer ?? caller.thrown, state: driven.state};
  } finally {
    driven.restore();
    restoreLimit();
  }
}

test('an unknown attempt, then refusals, in one CDC call: the named write stays UNKNOWN, ' +
  'and its entry, once committed, settles APPLIED exactly once', {timeout: TIMEOUT_MS},
async () => {
  await withSurface([TABLE], async (context) => {
    const surface = context.of(TABLE);
    const id = 'sticky-unknown';
    const row = reservation(id);
    const name = `${TABLE}:${id}:birth`;
    const {caller, seen, state} = await runScheduled(context, [TRAP, REFUSE, REFUSE],
      row, name);
    assert.deepEqual({attempts: state.attempts, refused: state.refusals > 0},
      {attempts: 3, refused: true}, 'setup: attempt 1 held unknown, attempts 2-3 refused');
    assert.deepEqual({thrown: caller.thrown !== null, outcome: seen?.outcome,
      failureCode: seen?.failureCode,
      definitelyUnapplied: isControlPlaneWriteDefinitivelyUnappliedError(seen)},
    {thrown: false, outcome: 'unknown', failureCode: OUTCOME_UNKNOWN,
      definitelyUnapplied: false},
    `the caller gets the named UNKNOWN, never NOT_PROPOSED: ${describe(seen)}`);
    assert.ok(await appliedRow(surface, id),
      'the first attempt\'s entry commits once the trap is gone');
    context.engine.queryExecutor.queryTimeoutMs = SETTLE_BUDGET_MS;
    const again = await settle(context.gateway.insertSystemTableRow(TABLE, row,
      {writeIdentity: name}));
    assert.equal(again.answer?.success, true,
      `the next delivery of the name is its settled replay: ${describe(again.answer ??
        again.thrown)}`);
    assert.deepEqual(rowsOf(surface.dbPath, TABLE, KEY_COLUMN), [id], 'applied exactly once');
    const writes = context.deliveries.filter((delivery) =>
      WRITE_HEAD.test(String(delivery.sql ?? '')));
    assert.equal(new Set(writes.map((delivery) => delivery.entryId)).size, 1,
      'every delivery is the first attempt\'s entry');
  }, {cdc: true});
});

// verify-named-write-stage3 finding 2: a shut-down owner's answer is terminal
// for that owner (thrown, its typed code, not retried here), never converted
// into "pending, retry"; the write's outcome travels beside it truthfully: an
// attempt may have been proposed, so unknown (its own pending instance), never
// "not applied".
test('a shutdown after an attempt that may have been proposed answers terminal with ' +
  'the outcome unknown, never not applied', {timeout: TIMEOUT_MS}, async () => {
  await withSurface([TABLE], async (context) => {
    const id = 'sticky-shutdown';
    const {caller, seen, state} = await runScheduled(context, [TRAP, REFUSE],
      reservation(id), `${TABLE}:${id}:birth`,
      {afterFirst: () => context.cdcIntegrationService.markShuttingDown()});
    assert.equal(state.attempts, 1, 'setup: the shutdown overtook the re-send');
    assert.deepEqual({thrown: caller.thrown !== null, code: seen?.code,
      retryable: isRetryableControlPlaneError(seen),
      unknown: isControlPlaneWriteOutcomeUnknown(seen),
      definitelyUnapplied: isControlPlaneWriteDefinitivelyUnappliedError(seen),
      pendingInstance: seen?.pendingInstance?.outcome ?? null},
    {thrown: true, code: CDC_ERROR_CODE.SHUT_DOWN, retryable: false, unknown: true,
      definitelyUnapplied: false, pendingInstance: 'unknown'},
    `terminal, outcome unknown: ${describe(seen)}`);
  }, {cdc: true});
});

test('mirror: every attempt of the CDC call refused before proposal is definite ' +
  'NOT_PROPOSED', {timeout: TIMEOUT_MS}, async () => {
  await withSurface([TABLE], async (context) => {
    const surface = context.of(TABLE);
    const id = 'sticky-refused';
    const {seen, state} = await runScheduled(context, [REFUSE, REFUSE],
      reservation(id), `${TABLE}:${id}:birth`);
    assert.deepEqual({attempts: state.attempts, refusals: state.refusals > 0},
      {attempts: 2, refusals: true}, 'setup: two attempts, refused before proposal');
    assert.equal(isControlPlaneWriteDefinitivelyUnappliedError(seen), true,
      `refusals alone are definite: ${describe(seen)}`);
    assert.deepEqual(rowsOf(surface.dbPath, TABLE, KEY_COLUMN), [], 'nothing applied');
  }, {cdc: true});
});
