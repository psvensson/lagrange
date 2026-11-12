// The checkpoint cadence's standing refusal as a decision table
// (partition-snapshot-cadence-refusal.js): an attempt is unheld with no
// refusal, held while nothing changed, lifted by the named event once its
// doubling spacing has passed, and always lifted at the declared bound.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  NO_STANDING_REFUSAL,
  PARTITION_SNAPSHOT_CADENCE_ATTEMPT as ATTEMPT,
  cadenceAttemptDecision,
  standingRefusal,
} from '../../src/partition/partition-snapshot-cadence-refusal.js';
import {
  PARTITION_SNAPSHOT_CADENCE_RETRY as RETRY,
  PARTITION_SNAPSHOT_CADENCE_RETRY_TRIGGER as TRIGGER,
} from '../../src/partition/partition-snapshot-progress-constants.js';

const REFUSED = Object.freeze({outcome: 'creation_refused',
  reason: 'prepared_transactions_pending'});
const FIRST = Object.freeze({nowMs: 1000, appliedIndex: 50, identityKey: 'c\u00001'});

function refusedTimes(count) {
  let refusal = NO_STANDING_REFUSAL;
  for (let attempt = 0; attempt < count; attempt += 1) {
    refusal = standingRefusal(refusal, FIRST, REFUSED);
  }
  return refusal;
}

test('no standing refusal leaves the attempt unheld', () => {
  assert.equal(cadenceAttemptDecision(NO_STANDING_REFUSAL, FIRST), ATTEMPT.UNHELD);
});

test('a refusal records what it was measured at and counts its attempts', () => {
  const first = standingRefusal(NO_STANDING_REFUSAL, FIRST, REFUSED);
  assert.deepEqual({...first}, {...REFUSED, attempts: 1, firstAtMs: 1000,
    lastAtMs: 1000, appliedIndex: 50, identityKey: FIRST.identityKey});
  const second = standingRefusal(first, {...FIRST, nowMs: 9000, appliedIndex: 60}, REFUSED);
  assert.deepEqual({attempts: second.attempts, firstAtMs: second.firstAtMs,
    lastAtMs: second.lastAtMs, appliedIndex: second.appliedIndex},
  {attempts: 2, firstAtMs: 1000, lastAtMs: 9000, appliedIndex: 60});
  assert.ok(Object.isFrozen(second));
});

test('an unchanged refusal is held until the bound, whatever time passed', () => {
  const refusal = refusedTimes(1);
  for (const elapsedMs of [0, RETRY.BASE_MS, RETRY.BOUND_MS - 1]) {
    assert.equal(cadenceAttemptDecision(refusal,
      {...FIRST, nowMs: FIRST.nowMs + elapsedMs}), ATTEMPT.HELD, `${elapsedMs} ms`);
  }
  assert.equal(cadenceAttemptDecision(refusal,
    {...FIRST, nowMs: FIRST.nowMs + RETRY.BOUND_MS}), TRIGGER.BOUND_ELAPSED);
});

test('the log advancing or the identity changing lifts it once the spacing passed', () => {
  const refusal = refusedTimes(1);
  const advanced = {...FIRST, appliedIndex: 51};
  const moved = {...FIRST, identityKey: 'c\u00002'};
  assert.equal(cadenceAttemptDecision(refusal,
    {...advanced, nowMs: FIRST.nowMs + RETRY.BASE_MS - 1}), ATTEMPT.HELD);
  assert.equal(cadenceAttemptDecision(refusal,
    {...advanced, nowMs: FIRST.nowMs + RETRY.BASE_MS}), TRIGGER.APPLIED_INDEX_ADVANCED);
  assert.equal(cadenceAttemptDecision(refusal,
    {...moved, nowMs: FIRST.nowMs + RETRY.BASE_MS}), TRIGGER.IDENTITY_CHANGED);
});

test('the spacing doubles per consecutive refusal and never exceeds the bound', () => {
  const advancedAt = (elapsedMs) => ({...FIRST, appliedIndex: 51,
    nowMs: FIRST.nowMs + elapsedMs});
  for (const [attempts, spacingMs] of [[1, 1000], [2, 2000], [3, 4000], [6, 32000]]) {
    const refusal = refusedTimes(attempts);
    assert.equal(cadenceAttemptDecision(refusal, advancedAt(spacingMs - 1)),
      ATTEMPT.HELD, `${attempts} refusals, before ${spacingMs} ms`);
    assert.equal(cadenceAttemptDecision(refusal, advancedAt(spacingMs)),
      TRIGGER.APPLIED_INDEX_ADVANCED, `${attempts} refusals, at ${spacingMs} ms`);
  }
  assert.equal(cadenceAttemptDecision(refusedTimes(12), advancedAt(RETRY.BOUND_MS)),
    TRIGGER.BOUND_ELAPSED, 'the bound is the ceiling of the spacing');
});
