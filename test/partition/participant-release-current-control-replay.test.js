// Native registered release owners with in-process delivery, not fleet acceptance.
// The only timing seam holds an unmodified PAUSE reply from the actual recipient.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {deliveryAnswerOf} from '../../src/transport/transport-semantic-outcome.js';
import {participantReleaseAdmissionOf} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {readPartitionWriteOrigin} from
  '../../src/partition/partition-participant-transaction-store.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ACTION as ACTION, PARTICIPANT_RELEASE_ADMISSION as ADMISSION,
  PARTICIPANT_RELEASE_MISSING_FACT as MISSING, PARTICIPANT_RELEASE_RESULT_FIELD as RESULT} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {clearFixtureSingletons, resetFixtureSingletons} from
  '../test-helpers/participant-transaction-fixture.js';
import {CONTROL_PARTITION, withParticipantReleaseProtocol as fixture} from
  '../test-helpers/participant-release-protocol-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const OBSERVATION_BOUND_MS = 5000;

async function bounded(promise, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`fixture observation bound: ${label}`)),
        OBSERVATION_BOUND_MS);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

function observeReplay(context) {
  const {service, transport} = context;
  const originalDeliver = transport.deliver;
  const entered = Promise.withResolvers();
  const continuation = Promise.withResolvers();
  const dependentActions = [];
  const controlAnswers = [];
  let pauseReplies = 0;
  transport.deliver = async function(address, payload, options) {
    if (payload.partitionId === service.partitionId) dependentActions.push(payload.action);
    const response = await Reflect.apply(originalDeliver, this, [address, payload, options]);
    const answer = deliveryAnswerOf(response)?.[RESULT];
    if (payload.partitionId === CONTROL_PARTITION && payload.action === ACTION.RELEASE) {
      controlAnswers.push(answer);
    }
    if (payload.partitionId === service.partitionId && payload.action === ACTION.PAUSE) {
      pauseReplies += 1;
      assert.equal(pauseReplies, 1, 'the explicit replay has one actual dependent PAUSE');
      entered.resolve(answer);
      await continuation.promise;
    }
    return response;
  };
  return {entered, continuation, dependentActions, controlAnswers,
    restore: () => {
      transport.deliver = originalDeliver;
    }};
}

async function observeHeldPause(observer, settled) {
  const early = settled.then((result) => {
    if (result.error) throw result.error;
    throw new Error(`release settled before its real PAUSE reply: ${JSON.stringify(result.answer)}`);
  });
  const paused = await bounded(Promise.race([observer.entered.promise, early]), 'actual PAUSE reply');
  assert.equal(paused.outcome, OUTCOME.OBSERVED, JSON.stringify(paused));
}

async function measureReplay(context, atPause) {
  const {handler, service, controlService, release} = context;
  // Stop the fixture observer, not the explicit operator path or native owners.
  // Automatic recovery/restart is outside this initial one-attempt witness.
  await handler.participantReleaseRecovery.shutdown();
  const first = await release();
  assert.equal(first.outcome, OUTCOME.CUT_OVER, JSON.stringify(first));
  const origin = readPartitionWriteOrigin(service.db);
  const controlOrigin = readPartitionWriteOrigin(controlService.db);
  assert.notEqual(origin, null, 'first release committed the real dependent origin');
  assert.notEqual(controlOrigin, null, 'first release committed the real control origin');
  assert.equal(participantReleaseAdmissionOf(service).state, ADMISSION.OPEN);
  const observer = observeReplay(context);
  const settled = release().then((answer) => ({answer}), (error) => ({error}));
  let measured = null;
  let failure = null;
  try {
    await observeHeldPause(observer, settled);
    assert.equal(observer.controlAnswers.length, 1,
      'the actual initial control release completed before dependent PAUSE');
    assert.equal(observer.controlAnswers[0].outcome, OUTCOME.CUT_OVER);
    assert.equal(participantReleaseAdmissionOf(service).state, ADMISSION.CLOSED,
      'the actual PAUSE recipient closed admission before its reply was held');
    assert.deepEqual(readPartitionWriteOrigin(service.db), origin);
    await atPause(context);
    observer.continuation.resolve();
    const result = await bounded(settled, 'replay settlement');
    if (result.error) throw result.error;
    measured = {answer: result.answer, origin,
      finalOrigin: readPartitionWriteOrigin(service.db),
      admission: participantReleaseAdmissionOf(service).state,
      dependentActions: observer.dependentActions, controlAnswers: observer.controlAnswers};
  } catch (error) {
    failure = error;
  } finally {
    observer.continuation.resolve();
    try {
      const result = await bounded(settled, 'same replay cleanup');
      if (result.error) {
        failure = failure ? new AggregateError([failure, result.error],
          'replay and cleanup failed') : result.error;
      }
    } catch (error) {
      failure = failure ? new AggregateError([failure, error], 'replay and cleanup failed') : error;
    } finally {
      observer.restore();
    }
  }
  if (failure) throw failure;
  return measured;
}

function reportReplay(t, measured) {
  const {answer, admission, dependentActions, controlAnswers} = measured;
  t.diagnostic(JSON.stringify({answer, admission, dependentActions,
    controlOutcomes: controlAnswers.map((control) => control.outcome)}));
  assert.deepEqual(measured.finalOrigin, measured.origin,
    'post-origin replay retains the exact durable origin');
  assert.equal(dependentActions.filter((action) =>
    action === ACTION.ENABLE || action === ACTION.OBSERVE_APPLIED_POSITION).length, 0,
  'a current dependent replay does not repeat origin ENABLE or observation');
}

test('current dependent replay with live control resumes through the actual recipient', async (t) => {
  await fixture(async (context) => {
    const measured = await measureReplay(context, async ({controlService}) => {
      assert.equal(controlService.isShutdown, false, 'positive control remains live at the held reply');
    });
    reportReplay(t, measured);
    assert.equal(measured.answer.outcome, OUTCOME.CUT_OVER, JSON.stringify(measured.answer));
    assert.equal(measured.dependentActions.filter((action) => action === ACTION.RESUME).length, 1);
    assert.equal(measured.admission, ADMISSION.OPEN);
  });
});

test('current dependent replay refuses control loss after real PAUSE before RESUME', async (t) => {
  await fixture(async (context) => {
    const measured = await measureReplay(context, async ({controlService}) => {
      await controlService.shutdown();
      assert.equal(controlService.isShutdown, true,
        'the real control owner stopped after the successful initial control proof');
    });
    reportReplay(t, measured);
    assert.equal(measured.answer.outcome, OUTCOME.UNAVAILABLE, JSON.stringify(measured.answer));
    assert.equal(measured.answer.missingFact, MISSING.CURRENT_CONTROL_OWNER);
    assert.equal(measured.dependentActions.filter((action) => action === ACTION.RESUME).length, 0,
      'unavailable current control authority cannot authorize dependent RESUME');
    assert.equal(measured.admission, ADMISSION.CLOSED);
  });
});
