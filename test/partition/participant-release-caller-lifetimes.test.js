// Local native owner composition, not physical formation or cross-host timing.
// Only actual reply delivery is held/delayed; release facts and effects stay real.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {setImmediate as turn} from 'node:timers/promises';
import {MessageRouter} from '../../src/transport/message-router.js';
import {requestParticipantRelease} from '../../src/node/participant-release-client.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {participantReleaseAdmissionOf} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {readPartitionWriteOrigin} from
  '../../src/partition/partition-participant-transaction-store.js';
import {PARTICIPANT_CUTOVER_BOUND as BOUND, PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ACTION as ACTION, PARTICIPANT_RELEASE_ADMISSION as ADMISSION,
  PARTICIPANT_RELEASE_MISSING_FACT as MISSING, PARTICIPANT_RELEASE_TRIGGER as TRIGGER,
  PARTICIPANT_RELEASE_RESULT_FIELD as RESULT, PARTICIPANT_RELEASE_ROUTE_SUFFIX as ROUTE,
  PARTICIPANT_RELEASE_TYPE as TYPE} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {replacePrototypeProperty} from '../helpers/hostile-intrinsics.js';
import {resetFixtureSingletons, clearFixtureSingletons} from
  '../test-helpers/participant-transaction-fixture.js';
import {NODE, PARTITION, withParticipantReleaseProtocol as fixture} from
  '../test-helpers/participant-release-protocol-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const ORIGINAL_BUDGET_MS = 30000;
const LEAF_DELAY_MS = 3000;
const JOIN_BUDGET_MS = 100;
const OBSERVATION_BOUND_MS = 5000;
const REPEATED_JOIN_COUNT = 16;

// Passive occupancy observation only; never creates or changes the RUNS record.
function observeCurrentWaiters(handler) {
  const original = WeakMap.prototype.get;
  let waiters = null;
  const restore = replacePrototypeProperty(WeakMap.prototype, 'get', function(key) {
    const value = Reflect.apply(original, this, [key]);
    if (key === handler && value instanceof Map) {
      const current = value.get(PARTITION);
      if (current?.waiters instanceof Set) waiters = current.waiters;
    }
    return value;
  });
  return {current: () => waiters, restore};
}

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

function requestOf(handler, build, clock) {
  return {type: TYPE, action: ACTION.RELEASE, nodeId: NODE, partitionId: PARTITION,
    targetBuildDigest: build.digest, trigger: TRIGGER.OPERATOR,
    deadlineAtMs: clock.now() + ORIGINAL_BUDGET_MS,
    authorization: handler.participantReleaseAuthorizationOwner.authorizeOperator({
      partitionId: PARTITION, targetBuildDigest: build.digest})};
}

async function withRealDelivery(context, clock, intercept, measure) {
  const {handler, transport} = context;
  // Isolate this explicit caller schedule from the fixture's background origin recovery.
  // No replacement recovery policy is installed; recovery behavior is a separate proof.
  await handler.participantReleaseRecovery.shutdown();
  const router = new MessageRouter({nodeId: NODE, bootIncarnation: TEST_BOOT_INCARNATION,
    timeSource: clock});
  const originalDeliver = transport.deliver;
  const registered = transport.getRegisteredHandler(`${NODE}${ROUTE}`);
  assert.equal(typeof registered, 'function');
  const observations = [];
  const operations = [];
  const deliveries = [];
  let failure = null;
  try {
    await router.initialize({startServer: false});
    router.register(`${NODE}${ROUTE}`, (envelope) => {
      const request = envelope.payload;
      const observation = {action: request.action, partitionId: request.partitionId,
        deadlineAtMs: request.deadlineAtMs, enteredAtMs: clock.now(), answer: null};
      observations.push(observation);
      const operation = (async () => {
        const response = await registered(envelope);
        observation.answer = response[RESULT];
        await intercept(request, response, observation);
        observation.returnedAtMs = clock.now();
        return response;
      })();
      operations.push(operation.then((value) => ({value}), (error) => ({error})));
      return operation;
    });
    transport.deliver = (address, payload, options) => {
      deliveries.push({action: payload.action, partitionId: payload.partitionId,
        deadlineAtMs: payload.deadlineAtMs, timeoutMs: options.timeoutMs});
      return router.deliver(address, payload, options);
    };
    await measure({registered, router, observations, deliveries, operations});
  } catch (error) {
    failure = error;
  }
  try {
    // The measure owns gate release in finally; all actual registered calls retire here.
    const results = await bounded(Promise.all(operations), 'registered operation cleanup');
    const rejected = results.filter((result) => result.error).map((result) => result.error);
    if (rejected.length) throw new AggregateError(rejected, 'registered operation failed');
    assert.equal(router.pendingMessages.size, 0, 'router retains no pending message after settlement');
  } catch (error) {
    failure = failure ? new AggregateError([failure, error], 'measurement and cleanup') : error;
  } finally {
    transport.deliver = originalDeliver;
    await router.shutdown();
  }
  if (failure) throw failure;
}

test('RELEASE aggregate crosses leaf bound while every actual leaf stays within its own bound', async (t) => {
  const clock = new VirtualTimeSource({startMs: 1000});
  await fixture(async (context) => {
    const request = requestOf(context.handler, context.build, clock);
    const delayed = [];
    await withRealDelivery(context, clock, async (leaf, response, observation) => {
      if (leaf.partitionId !== PARTITION || delayed.length === 2 ||
          ![ACTION.INSPECT, ACTION.PAUSE].includes(leaf.action)) return;
      assert.equal(response[RESULT].outcome, OUTCOME.OBSERVED, 'delay follows actual native leaf facts');
      delayed.push(observation);
      clock.advance(LEAF_DELAY_MS);
    }, async ({observations, deliveries, operations}) => {
      const caller = await bounded(requestParticipantRelease(context.handler, request), 'outer RELEASE');
      await bounded(Promise.all(operations), 'late server settlement');
      const server = observations.find((item) => item.action === ACTION.RELEASE &&
        item.partitionId === PARTITION);
      assert.equal(delayed.length, 2, 'both real sequential leaf responses engaged');
      assert.ok(2 * LEAF_DELAY_MS > BOUND.REQUEST_TIMEOUT_MS);
      assert.ok(delayed.every((item) =>
        item.returnedAtMs - item.enteredAtMs < BOUND.REQUEST_TIMEOUT_MS));
      assert.equal(server.answer.outcome, OUTCOME.CUT_OVER, JSON.stringify(server));
      assert.ok(clock.now() < request.deadlineAtMs, 'the original aggregate budget remains live');
      assert.notEqual(readPartitionWriteOrigin(context.service.db), null,
        'late native origin remains committed');
      assert.equal(participantReleaseAdmissionOf(context.service).state, ADMISSION.OPEN);
      const leaves = deliveries.filter((item) => item.action !== ACTION.RELEASE);
      assert.ok(leaves.length > 1);
      assert.ok(leaves.every((item) =>
        item.timeoutMs > 0 && item.timeoutMs <= BOUND.REQUEST_TIMEOUT_MS));
      assert.ok(deliveries.every((item) => item.deadlineAtMs === request.deadlineAtMs),
        'no budget renewal');
      t.diagnostic(JSON.stringify({caller, server, delayed, deliveries}));
      assert.equal(caller.outcome, OUTCOME.CUT_OVER,
        'a live aggregate caller must observe its completed cutover across individually bounded leaves');
    });
  }, undefined, {timeSource: clock});
});

test('same-slot shorter joiner settles at its own deadline without retiring the original cutover', async (t) => {
  const clock = new VirtualTimeSource({startMs: 1000});
  await fixture(async (context) => {
    const request = requestOf(context.handler, context.build, clock);
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    let held = false;
    await withRealDelivery(context, clock, async (leaf, response) => {
      if (held || leaf.partitionId !== PARTITION || leaf.action !== ACTION.INSPECT) return;
      held = true;
      assert.equal(response[RESULT].outcome, OUTCOME.OBSERVED);
      entered.resolve();
      await release.promise;
    }, async ({registered, observations}) => {
      const timersBeforeStarter = clock.pendingTimerCount();
      let starter;
      let joined;
      let continuingJoiner;
      let joinedAtDeadline;
      let originalAtDeadline;
      let joinedAnswer;
      let originalAnswer;
      let observer = null;
      try {
        starter = requestParticipantRelease(context.handler, request).then((answer) => {
          originalAnswer = answer;
          return answer;
        });
        starter.catch(() => {}); // finally still observes the original rejection.
        await bounded(Promise.race([entered.promise, starter.then(() => {
          throw new Error('starter settled before the held dependent INSPECT');
        })]), 'held real dependent INSPECT');
        const leafCount = observations.length;
        const mixed = await bounded(registered({payload: {...request,
          targetBuildDigest: '0'.repeat(64)}}), 'wrong-build refusal');
        assert.equal(mixed[RESULT].outcome, OUTCOME.INVALID);
        assert.equal(observations.length, leafCount, 'wrong build starts no additional leaf');
        const timersBeforeJoin = clock.pendingTimerCount();
        const unsupported = await bounded(registered({payload: {...request,
          deadlineAtMs: Number.MAX_SAFE_INTEGER}}), 'unsupported join timer span');
        assert.equal(unsupported[RESULT].outcome, OUTCOME.UNAVAILABLE);
        assert.equal(unsupported[RESULT].missingFact, MISSING.RELEASE_DEADLINE);
        assert.equal(clock.pendingTimerCount(), timersBeforeJoin, 'oversized timer is never armed');
        const shorter = {...request, deadlineAtMs: clock.now() + JOIN_BUDGET_MS};
        observer = observeCurrentWaiters(context.handler);
        joined = registered({payload: shorter}).then((response) => {
          joinedAnswer = response[RESULT];
          return joinedAnswer;
        });
        joined.catch(() => {}); // finally still observes the original rejection.
        await turn();
        observer.restore();
        const waiters = observer.current();
        assert.ok(waiters instanceof Set, 'observed actual current RUNS waiter collection');
        assert.equal(waiters.size, 1);
        assert.equal(observations.length, leafCount, 'same build coalesces instead of restarting cutover');
        assert.equal(clock.pendingTimerCount(), timersBeforeJoin + 1,
          'joining caller owns exactly one additional deadline timer');
        clock.advance(JOIN_BUDGET_MS);
        await turn();
        joinedAtDeadline = joinedAnswer;
        originalAtDeadline = originalAnswer;
        assert.equal(clock.pendingTimerCount(), timersBeforeJoin,
          'expired joiner retires its timer while shared delivery timers remain');
        assert.equal(waiters.size, 0, 'expired waiter detaches from the still-held shared run');
        for (let index = 0; index < REPEATED_JOIN_COUNT; index += 1) {
          const short = registered({payload: {...request,
            deadlineAtMs: clock.now() + JOIN_BUDGET_MS}});
          short.catch(() => {}); // bounded below observes the original rejection.
          await turn();
          assert.equal(waiters.size, 1, 'only the current short caller is retained');
          clock.advance(JOIN_BUDGET_MS);
          const result = await bounded(short, 'repeated short join retirement');
          assert.equal(result[RESULT].outcome, OUTCOME.UNAVAILABLE);
          assert.equal(result[RESULT].missingFact, MISSING.RELEASE_DEADLINE);
          assert.equal(waiters.size, 0, 'repeated timeouts cannot accumulate subscriptions');
          assert.equal(clock.pendingTimerCount(), timersBeforeJoin);
        }
        continuingJoiner = registered({payload: request});
        continuingJoiner.catch(() => {}); // finally observes this original promise.
        await turn();
        assert.equal(clock.pendingTimerCount(), timersBeforeJoin + 1,
          'a later valid join still observes the original owned cutover');
      } finally {
        if (observer) observer.restore();
        release.resolve();
        await bounded(Promise.all([starter, joined, continuingJoiner]),
          'retained shared effect after gate release');
      }
      assert.equal(clock.pendingTimerCount(), timersBeforeStarter,
        'successful join and original delivery retire all their own timers');
      assert.equal(observer.current().size, 0, 'shared settlement clears the successful waiter');
      assert.equal(originalAtDeadline, undefined, 'short waiter cannot retire original held work');
      assert.equal(originalAnswer.outcome, OUTCOME.CUT_OVER);
      assert.notEqual(readPartitionWriteOrigin(context.service.db), null);
      assert.equal(participantReleaseAdmissionOf(context.service).state, ADMISSION.OPEN);
      t.diagnostic(JSON.stringify({joinedAtDeadline: joinedAtDeadline ?? null,
        originalAtDeadline: originalAtDeadline ?? null,
        joinedAnswer, originalAnswer, observations}));
      assert.equal(joinedAtDeadline?.outcome, OUTCOME.UNAVAILABLE,
        'registered joining caller must settle independently at its own earlier deadline');
      assert.equal(joinedAtDeadline.missingFact, MISSING.RELEASE_DEADLINE);
    });
  }, undefined, {timeSource: clock});
});

test('ordinary registered client release completes with unchanged origin and no delayed replies', async () => {
  const clock = new VirtualTimeSource({startMs: 1000});
  await fixture(async (context) => {
    const request = requestOf(context.handler, context.build, clock);
    await withRealDelivery(context, clock, async () => {}, async () => {
      const answer = await bounded(requestParticipantRelease(context.handler, request), 'ordinary release');
      assert.equal(answer.outcome, OUTCOME.CUT_OVER);
      const origin = readPartitionWriteOrigin(context.service.db);
      assert.notEqual(origin, null);
      assert.equal(participantReleaseAdmissionOf(context.service).state, ADMISSION.OPEN);
      const replay = await bounded(requestParticipantRelease(context.handler, request), 'ordinary replay');
      assert.equal(replay.outcome, OUTCOME.CUT_OVER);
      assert.deepEqual(readPartitionWriteOrigin(context.service.db), origin);
    });
  }, undefined, {timeSource: clock});
});

test('expired aggregate request refuses before delivery and cannot create a native origin', async () => {
  const clock = new VirtualTimeSource({startMs: 1000});
  await fixture(async (context) => {
    await withRealDelivery(context, clock, async () => {}, async ({deliveries}) => {
      for (const deadlineAtMs of [clock.now(), Number.MAX_SAFE_INTEGER, undefined, NaN]) {
        const request = {...requestOf(context.handler, context.build, clock), deadlineAtMs};
        const answer = await bounded(requestParticipantRelease(context.handler, request),
          'expired or unsupported release budget');
        assert.equal(answer.outcome, OUTCOME.UNAVAILABLE);
        assert.equal(answer.missingFact, MISSING.RELEASE_DEADLINE);
      }
      assert.equal(deliveries.length, 0, 'expired request must not invoke transport');
      assert.equal(readPartitionWriteOrigin(context.service.db), null);
    });
  }, undefined, {timeSource: clock});
});
