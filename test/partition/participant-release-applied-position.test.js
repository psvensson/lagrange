// The applied-position observer's registered release boundary, clocks and lifetime.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, test} from 'node:test';
import {ReplicaHandler} from '../../src/node/replica-handler-class.js';
import {askParticipantRelease} from '../../src/node/participant-release-client.js';
import {RAFT_EVENT} from '../../src/raft/raft-operation-port-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {participantReleaseAdmissionOf, readParticipantReleaseFacts} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE} from
  '../../src/raft/raft-committed-membership-constants.js';
import {
  PARTICIPANT_CUTOVER_BOUND as BOUND,
  PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ADMISSION as ADMISSION,
  PARTICIPANT_RELEASE_TYPE,
} from '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {TRANSPORT_DELIVERY_OUTCOME_REASON_CODE} from
  '../../src/transport/transport-semantic-outcome.js';
import {ReplicaOperationResponseStatus} from
  '../../src/rebalancer/replica-operation-constants.js';
import {REPLICA_HANDLER_ERROR_MSG} from '../../src/node/replica-handler-constants.js';
import {createInProcessMockTransport} from '../test-helpers/replica-handler-identity-fixture.js';
import {
  awaitProposal,
  cleanOwnedParticipantFixture,
  clearFixtureSingletons,
  deferFixtureParticipantMembership as deferObservationMembership,
  durableAppliedIndex,
  fixtureParticipantObservationListenerCount as releaseListenerCount,
  fixtureParticipantObservationRequest as currentObservationRequest,
  resetFixtureSingletons,
  scriptedFixtureTimeSource as scriptedTimeSource,
  sendRegisteredFixtureParticipantMessage as sendRegisteredMessage,
  sendRegisteredFixtureParticipantObservation as sendRegisteredObservation,
  settle,
  shutdownAll,
  startLeader,
  track,
} from '../test-helpers/participant-transaction-fixture.js';
import {replacePrototypeProperty} from '../helpers/hostile-intrinsics.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const FIXTURE_SQL = 'INSERT INTO test_table (id, value) VALUES (?, ?)';

function retainFailure(current, next, message) {
  return current === null ? next : new AggregateError([current, next], message);
}

async function promptRegisteredAnswer(gate, owner, operation) {
  const pending = track(gate.trackSettlement(owner, operation));
  await settle();
  assert.equal(pending.settled, true,
    `${owner} settles through the registered route while the owner read is held`);
  return pending.promise;
}

async function withRegisteredObservationOwner(measure, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tx1-release-position-'));
  const transport = createInProcessMockTransport();
  const clock = options.clock ?? new VirtualTimeSource({startMs: 1000});
  const settlements = [];
  let leader = null;
  let handler = null;
  let failure = null;
  const ownSettlement = (owner, settlement) => {
    const promise = Promise.resolve(settlement);
    settlements.push([owner, () => promise]);
    return promise;
  };
  try {
    const started = await startLeader({timeSource: clock, ...(options.leader ?? {})});
    leader = started.leader;
    handler = new ReplicaHandler({nodeId: leader.nodeId, ownerIncarnation: 1,
      systemTableCache: leader.systemTableCache, cdcIntegrationService: {},
      createPartitionService: () => leader, messageRouter: transport,
      dataDir: directory, timeSource: clock});
    handler.registerWithRouter(transport);
    handler.localServices.set(leader.replicaId, leader);
    await measure({handler, leader, proposed: started.proposed, transport, clock,
      ownSettlement});
  } catch (error) {
    failure = error;
  }
  failure = await cleanOwnedParticipantFixture({directory, failure,
    label: 'applied-position', operations: [
      ['handler', () => handler?.shutdown()],
      ['service', () => leader === null ? undefined : shutdownAll(leader)],
    ], settlements});
  if (failure !== null) throw failure;
}

async function assertGenericUnsafeEnvelopes(handler, transport, request, onRead) {
  const unsafe = [
    new Proxy({...request}, {get(target, field, receiver) {
      onRead();
      return Reflect.get(target, field, receiver);
    }}),
    Object.assign(Object.create({unsafe: true}), request),
    {...request, type: Object(PARTICIPANT_RELEASE_TYPE)},
    Object.assign([], request),
  ];
  const symbolPayload = {...request};
  symbolPayload[Symbol('unsafe')] = true;
  unsafe.push(symbolPayload);
  for (const field of ['type', 'action', 'replicaId']) {
    const accessor = {...request};
    Object.defineProperty(accessor, field, {enumerable: true, get() {
      onRead();
      throw new Error(`${field} accessor must not run`);
    }});
    unsafe.push(accessor);
  }
  for (const payload of unsafe) {
    assert.deepEqual(await sendRegisteredMessage(handler, transport, payload), {
      status: ReplicaOperationResponseStatus.ERROR,
      error: REPLICA_HANDLER_ERROR_MSG.UNKNOWN_MESSAGE_TYPE(undefined),
      correlationId: 'fixture-participant-release',
    });
  }
}

async function assertNestedCaptureIgnoresArrayIterator(handler, transport, request, nested) {
  const actualIterator = Array.prototype[Symbol.iterator];
  let nestedFieldIteratorReads = 0;
  let failure = null;
  const restore = replacePrototypeProperty(Array.prototype, Symbol.iterator,
    function iterator() {
      if (Object.isFrozen(this) && this.length === 4 &&
          this[0] === 'release' && this[1] === 'attempt' &&
          this[2] === 'target' && this[3] === 'origin') {
        nestedFieldIteratorReads += 1;
      }
      return Reflect.apply(actualIterator, this, []);
    });
  try {
    const answer = await sendRegisteredObservation(handler, transport,
      {...request, release: nested});
    assert.equal(answer.outcome, OUTCOME.INVALID, JSON.stringify(answer));
    assert.equal(answer.releaseId, null);
  } catch (error) {
    failure = error;
  }
  try {
    restore();
  } catch (error) {
    failure = retainFailure(failure, error, 'nested-field iterator restoration failed');
  }
  if (failure !== null) throw failure;
  assert.equal(nestedFieldIteratorReads, 0,
    'nested release fields are captured without ambient Array iteration');
}

test('applied-position client preserves overall and RPC deadlines without stranded debt',
  async () => {
    for (const control of [
      {label: 'rpc', budgetMs: 30000, expectedTimeoutMs: BOUND.REQUEST_TIMEOUT_MS,
        missingFact: 'replica_release_reply',
        reason: TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT},
      {label: 'overall', budgetMs: 1500, expectedTimeoutMs: 1500,
        missingFact: 'release_deadline', reason: undefined},
    ]) {
      await withRegisteredObservationOwner(async ({handler, leader, transport, clock}) => {
        const request = await currentObservationRequest(handler, leader,
          {deadlineAtMs: clock.now() + control.budgetMs});
        delete request.observationDeadlineAtMs;
        const gate = deferObservationMembership(leader);
        const originalDeliver = transport.deliver.bind(transport);
        let delivered = null;
        transport.deliver = (address, payload, options) => {
          delivered = {address, payload, options};
          return originalDeliver(address, payload, options);
        };
        const senderNowMs = clock.now();
        const senderClock = scriptedTimeSource([senderNowMs]);
        const sender = {messageRouter: transport, timeSource: senderClock};
        const timerBaseline = clock.pendingTimerCount();
        const pending = gate.trackSettlement(`${control.label} observation`,
          askParticipantRelease(sender, handler.nodeId, request));
        let failure = null;
        try {
          await gate.started;

          assert.equal(senderClock.reads(), 1,
            `${control.label} samples the sender clock once`);
          assert.equal(delivered.options.timeoutMs, control.expectedTimeoutMs,
            `${control.label} uses the one existing sender budget`);
          assert.equal(delivered.payload.observationDeadlineAtMs,
            senderNowMs + control.expectedTimeoutMs);
          assert.equal(delivered.payload.deadlineAtMs, request.deadlineAtMs);
          assert.deepEqual(delivered.payload.release, request.release);
          assert.equal(releaseListenerCount(leader), 1);
          assert.equal(clock.pendingTimerCount(), timerBaseline + 1);

          clock.advance(control.expectedTimeoutMs);
          const answer = await pending;
          assert.equal(answer.outcome, OUTCOME.UNAVAILABLE, JSON.stringify(answer));
          assert.equal(answer.missingFact, control.missingFact);
          assert.equal(answer.reason, control.reason);
          assert.equal(answer.partitionId, request.partitionId);
          assert.equal(answer.phase, request.action);
          assert.equal(answer.releaseId, request.release.releaseId);
          assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.CLOSED);
          assert.equal(releaseListenerCount(leader), 0);
          assert.equal(clock.pendingTimerCount(), timerBaseline);

          gate.release();
          gate.restore();
          const successorRequest = await currentObservationRequest(handler, leader,
            {deadlineAtMs: clock.now() + 30000});
          const successor = await sendRegisteredObservation(handler, transport,
            successorRequest);
          assert.equal(successor.outcome, OUTCOME.OBSERVED, JSON.stringify(successor));
          assert.equal(successor.partitionId, successorRequest.partitionId);
          assert.deepEqual(successor.generation, successorRequest.target);
          assert.equal(releaseListenerCount(leader), 0);
          assert.equal(clock.pendingTimerCount(), timerBaseline);
        } catch (error) {
          failure = error;
        } finally {
          failure = await gate.retire(failure,
            `${control.label} deadline assertion and membership custody failed`);
        }
        if (failure !== null) throw failure;
      });
    }

    await withRegisteredObservationOwner(async ({handler, leader, transport, clock}) => {
      const request = await currentObservationRequest(handler, leader,
        {deadlineAtMs: clock.now()});
      delete request.observationDeadlineAtMs;
      let deliveries = 0;
      const originalDeliver = transport.deliver.bind(transport);
      transport.deliver = (...args) => {
        deliveries += 1;
        return originalDeliver(...args);
      };
      const answer = await askParticipantRelease(handler, handler.nodeId, request);
      assert.equal(answer.outcome, OUTCOME.UNAVAILABLE);
      assert.equal(answer.missingFact, 'release_deadline');
      assert.equal(answer.partitionId, request.partitionId);
      assert.equal(answer.phase, request.action);
      assert.equal(answer.releaseId, request.release.releaseId);
      assert.equal(deliveries, 0, 'an already-spent overall deadline performs no delivery');
      assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.CLOSED);
      assert.equal(releaseListenerCount(leader), 0);
    });

    await withRegisteredObservationOwner(async ({handler, leader, transport}) => {
      const request = await currentObservationRequest(handler, leader,
        {deadlineAtMs: Number.MAX_SAFE_INTEGER});
      delete request.observationDeadlineAtMs;
      const gate = deferObservationMembership(leader);
      const startMs = Number.MAX_SAFE_INTEGER - 1;
      const senderClock = scriptedTimeSource([startMs]);
      const sender = {messageRouter: transport, timeSource: senderClock};
      let delivered = null;
      const originalDeliver = transport.deliver.bind(transport);
      transport.deliver = (address, payload, options) => {
        delivered = {payload, options};
        return originalDeliver(address, payload, options);
      };
      const pending = gate.trackSettlement('safe-edge observation',
        askParticipantRelease(sender, handler.nodeId, request));
      let failure = null;
      try {
        await gate.started;
        assert.equal(senderClock.reads(), 1,
          'the safe-edge sender clock is sampled exactly once');
        assert.equal(delivered.options.timeoutMs, 1);
        assert.equal(delivered.payload.observationDeadlineAtMs,
          Number.MAX_SAFE_INTEGER);
        gate.release();
        const answer = await pending;
        assert.equal(answer.outcome, OUTCOME.OBSERVED, JSON.stringify(answer));
        assert.equal(answer.partitionId, request.partitionId);
        assert.deepEqual(answer.generation, request.target);
      } catch (error) {
        failure = error;
      } finally {
        failure = await gate.retire(failure,
          'safe-edge assertion and membership custody failed');
      }
      if (failure !== null) throw failure;
    });

    await withRegisteredObservationOwner(async ({handler, leader, transport, clock}) => {
      const request = await currentObservationRequest(handler, leader,
        {deadlineAtMs: clock.now() + 30000});
      delete request.observationDeadlineAtMs;
      const originalDeliver = transport.deliver.bind(transport);
      const restoreSafeInteger = replacePrototypeProperty(Number, 'isSafeInteger', () => {
        throw new Error('the client budget guard must use its captured integer intrinsic');
      });
      const restoreObjectIs = replacePrototypeProperty(Object, 'is', () => {
        throw new Error('the client budget guard must use its captured identity intrinsic');
      });
      let deliveries = 0;
      let failure = null;
      transport.deliver = (address, payload, options) => {
        deliveries += 1;
        restoreObjectIs();
        restoreSafeInteger();
        return originalDeliver(address, payload, options);
      };
      try {
        const answer = await askParticipantRelease(handler, handler.nodeId, request);
        assert.equal(answer.outcome, OUTCOME.OBSERVED, JSON.stringify(answer));
        assert.equal(deliveries, 1);
        assert.deepEqual(answer.generation, request.target);
      } catch (error) {
        failure = error;
      } finally {
        try {
          restoreObjectIs();
          restoreSafeInteger();
        } catch (error) {
          failure = retainFailure(failure, error,
            'client intrinsic assertion and restoration failed');
        }
        transport.deliver = originalDeliver;
      }
      if (failure !== null) throw failure;
    });
  });

test('transport queue delay consumes the carried applied-position RPC window', () =>
  withRegisteredObservationOwner(async ({handler, leader, transport, clock}) => {
    const request = await currentObservationRequest(handler, leader,
      {deadlineAtMs: clock.now() + 30000});
    delete request.observationDeadlineAtMs;
    const gate = deferObservationMembership(leader);
    const originalDeliver = transport.deliver.bind(transport);
    let delivered = null;
    transport.deliver = (address, payload, options) => {
      delivered = {payload, options};
      clock.advance(4000);
      return originalDeliver(address, payload, options);
    };
    const timerBaseline = clock.pendingTimerCount();
    const pending = gate.trackSettlement('queue-delayed observation',
      askParticipantRelease(handler, handler.nodeId, request));
    let failure = null;
    try {
      await gate.started;
      assert.equal(delivered.options.timeoutMs, BOUND.REQUEST_TIMEOUT_MS);
      assert.equal(delivered.payload.observationDeadlineAtMs, 6000,
        'the sender carries its one start sample instead of an arrival-relative deadline');
      assert.equal(clock.now(), 5000);
      assert.equal(clock.pendingTimerCount(), timerBaseline + 1);
      clock.advance(999);
      assert.equal(releaseListenerCount(leader), 1);
      clock.advance(1);
      const answer = await pending;
      assert.equal(answer.outcome, OUTCOME.UNAVAILABLE);
      assert.equal(answer.missingFact, 'replica_release_reply');
      assert.equal(answer.reason, TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT);
      assert.equal(answer.partitionId, request.partitionId);
      assert.equal(answer.phase, request.action);
      assert.equal(answer.releaseId, request.release.releaseId);
      assert.equal(clock.now(), delivered.payload.observationDeadlineAtMs);
      assert.equal(releaseListenerCount(leader), 0);
      assert.equal(clock.pendingTimerCount(), timerBaseline);
    } catch (error) {
      failure = error;
    } finally {
      failure = await gate.retire(failure,
        'queue-delay assertion and membership custody failed');
    }
    if (failure !== null) throw failure;

    transport.deliver = originalDeliver;
    const ownerNow = clock.now();
    const delayedDeadline = ownerNow + 2;
    const delayed = {...request, deadlineAtMs: delayedDeadline,
      observationDeadlineAtMs: ownerNow + 1,
      attempt: {...request.attempt, deadlineAtMs: delayedDeadline}};
    const delayedGate = deferObservationMembership(leader);
    const originalTimeSource = handler.timeSource;
    handler.timeSource = scriptedTimeSource([ownerNow, delayedDeadline + 1]);
    let delayedFailure = null;
    try {
      const delayedObservation = delayedGate.trackSettlement('delayed timer observation',
        sendRegisteredObservation(handler, transport, delayed));
      await delayedGate.started;
      const delayedAnswer = await delayedObservation;
      assert.equal(delayedAnswer.outcome, OUTCOME.UNAVAILABLE);
      assert.equal(delayedAnswer.missingFact, 'release_deadline',
        'a late callback samples the current overall deadline before stored RPC equality');
    } catch (error) {
      delayedFailure = error;
    } finally {
      handler.timeSource = originalTimeSource;
      delayedFailure = await delayedGate.retire(delayedFailure,
        'late timer assertion and membership custody failed');
    }
    if (delayedFailure !== null) throw delayedFailure;
  }));

test('one applied-position observation owns duplicate, conflict and successor lifetimes', () =>
  withRegisteredObservationOwner(async ({handler, leader, transport, clock}) => {
    const request = await currentObservationRequest(handler, leader,
      {deadlineAtMs: clock.now() + 30000,
        observationDeadlineAtMs: clock.now() + BOUND.REQUEST_TIMEOUT_MS});
    const gate = deferObservationMembership(leader);
    const timerBaseline = clock.pendingTimerCount();
    const starter = gate.trackSettlement('starter observation',
      sendRegisteredObservation(handler, transport, request));
    let failure = null;
    try {
      await gate.started;
      clock.advance(2000);
      const rawJoin = {...request, release: {...request.release},
        attempt: {...request.attempt}, target: {...request.target}, origin: {...request.origin}};
      const joiner = gate.trackSettlement('joined observation',
        sendRegisteredObservation(handler, transport, rawJoin));
      rawJoin.deadlineAtMs += 1;
      rawJoin.attempt.term += 1;
      rawJoin.target.runtimeGeneration += 1;
      rawJoin.origin.originIndex += 1;
      rawJoin.release.releaseId = 'mutated-after-dispatch';
      assert.equal(gate.reads(), 1, 'matching recipients share one canonical facts read');
      assert.equal(releaseListenerCount(leader), 1);
      assert.equal(clock.pendingTimerCount(), timerBaseline + 1);

      let topAccessorReads = 0;
      const unsafeJoin = {...request};
      Object.defineProperty(unsafeJoin, 'action', {enumerable: true, get() {
        topAccessorReads += 1;
        throw new Error('held join action accessor must not run');
      }});
      const unsafeAnswer = track(sendRegisteredMessage(handler, transport, unsafeJoin));
      await settle();
      assert.equal(unsafeAnswer.settled, true);
      assert.deepEqual(await unsafeAnswer.promise, {
        status: ReplicaOperationResponseStatus.ERROR,
        error: REPLICA_HANDLER_ERROR_MSG.UNKNOWN_MESSAGE_TYPE(undefined),
        correlationId: 'fixture-participant-release',
      });
      assert.equal(topAccessorReads, 0);

      let coercionReads = 0;
      const boxedDigest = {toJSON() {
        coercionReads += 1;
      }, toString() {
        coercionReads += 1;
        return request.release.targetBuildDigest;
      }, [Symbol.toPrimitive]() {
        coercionReads += 1;
        return request.release.targetBuildDigest;
      }};
      const conflicts = [
        {expected: OUTCOME.INVALID, request: {...request,
          release: {...request.release, targetBuildDigest: boxedDigest}}},
        {expected: OUTCOME.INVALID, request: {...request,
          deadlineAtMs: request.deadlineAtMs + 1}},
        {expected: OUTCOME.STALE, request: {...request,
          deadlineAtMs: request.deadlineAtMs + 1,
          attempt: {...request.attempt, deadlineAtMs: request.deadlineAtMs + 1}}},
        {expected: OUTCOME.STALE, request: {...request,
          origin: {...request.origin, originIndex: request.origin.originIndex + 1}}},
        {expected: OUTCOME.STALE, request: {...request,
          attempt: {...request.attempt, term: request.attempt.term + 1}}},
        {expected: OUTCOME.STALE, request: {...request, target: {...request.target,
          runtimeGeneration: request.target.runtimeGeneration + 1}}},
      ];
      for (const field of ['release', 'attempt', 'target', 'origin']) {
        const missing = {...request};
        delete missing[field];
        conflicts.push({expected: OUTCOME.INVALID, request: missing,
          expectedReleaseId: field === 'release' ? null : request.release.releaseId});
        conflicts.push({expected: OUTCOME.INVALID,
          request: {...request, [field]: undefined},
          expectedReleaseId: field === 'release' ? null : request.release.releaseId});
      }
      for (const conflict of conflicts) {
        const answer = await promptRegisteredAnswer(gate, 'conflicting observation',
          sendRegisteredObservation(handler, transport, conflict.request));
        assert.equal(answer.outcome, conflict.expected, JSON.stringify(answer));
        assert.equal(answer.partitionId, conflict.request.partitionId);
        assert.equal(answer.phase, conflict.request.action);
        assert.equal(answer.releaseId,
          Object.hasOwn(conflict, 'expectedReleaseId') ? conflict.expectedReleaseId :
            conflict.request.release.releaseId);
        assert.equal(releaseListenerCount(leader), 1,
          'a conflict cannot detach the current starter');
        assert.equal(clock.pendingTimerCount(), timerBaseline + 1);
      }
      assert.equal(coercionReads, 0,
        'nested identity scalars are pinned before hashing or serialization');

      clock.advance(BOUND.REQUEST_TIMEOUT_MS - 2000);
      const [starterAnswer, joinerAnswer] = await Promise.all([starter, joiner]);
      assert.deepEqual(joinerAnswer, starterAnswer,
        'a matching joiner settles with the starter without renewing its deadline');
      assert.equal(starterAnswer.missingFact, 'replica_release_reply');
      assert.equal(starterAnswer.reason,
        TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT);
      assert.equal(starterAnswer.partitionId, request.partitionId);
      assert.equal(starterAnswer.phase, request.action);
      assert.equal(starterAnswer.releaseId, request.release.releaseId);
      assert.equal(gate.reads(), 1);
      assert.equal(releaseListenerCount(leader), 0);
      assert.equal(clock.pendingTimerCount(), timerBaseline);
      gate.restore();

      const successorRequest = await currentObservationRequest(handler, leader,
        {deadlineAtMs: clock.now() + 30000});
      const successorGate = deferObservationMembership(leader);
      let successorFailure = null;
      try {
        const successor = successorGate.trackSettlement('successor observation',
          sendRegisteredObservation(handler, transport, successorRequest));
        await successorGate.started;
        assert.equal(successorGate.reads(), 1,
          'the prior starter cleanup cannot remove a fresh successor record');
        assert.equal(releaseListenerCount(leader), 1);
        assert.equal(clock.pendingTimerCount(), timerBaseline + 1);

        gate.release();
        await gate.finished;
        // `finished` owns only the deferred membership method. Exact-source
        // review owns the later facts/observation promise continuations; this
        // assertion does not guess their completion with microtask turns.
        const successorConflict = {...successorRequest,
          origin: {...successorRequest.origin,
            originIndex: successorRequest.origin.originIndex + 1}};
        const conflictAnswer = await sendRegisteredObservation(
          handler, transport, successorConflict);
        assert.equal(conflictAnswer.outcome, OUTCOME.STALE,
          JSON.stringify(conflictAnswer));
        assert.equal(conflictAnswer.partitionId, successorRequest.partitionId);
        assert.equal(conflictAnswer.phase, successorRequest.action);
        assert.equal(conflictAnswer.releaseId, successorRequest.release.releaseId);
        assert.equal(releaseListenerCount(leader), 1,
          'the returned old membership read cannot detach the held successor');
        assert.equal(clock.pendingTimerCount(), timerBaseline + 1,
          'the returned old membership read cannot cancel the successor deadline');

        successorGate.release();
        const successorAnswer = await successor;
        assert.equal(successorAnswer.outcome, OUTCOME.OBSERVED,
          JSON.stringify(successorAnswer));
        assert.equal(successorAnswer.partitionId, successorRequest.partitionId);
        assert.deepEqual(successorAnswer.generation, successorRequest.target);
        assert.equal(releaseListenerCount(leader), 0);
        assert.equal(clock.pendingTimerCount(), timerBaseline);
      } catch (error) {
        successorFailure = error;
      } finally {
        successorFailure = await successorGate.retire(successorFailure,
          'successor assertion and membership custody failed');
      }
      if (successorFailure !== null) throw successorFailure;
    } catch (error) {
      failure = error;
    } finally {
      failure = await gate.retire(failure,
        'starter assertion and membership custody failed');
    }
    if (failure !== null) throw failure;
  }));

test('shared ingress refuses unsafe envelopes and facts refuse malformed owner generations', () =>
  withRegisteredObservationOwner(async ({handler, leader, transport, clock}) => {
    const request = await currentObservationRequest(handler, leader);
    const timerBaseline = clock.pendingTimerCount();
    let hostileReads = 0;
    let failure = null;
    const gate = deferObservationMembership(leader);
    try {
      await assertGenericUnsafeEnvelopes(handler, transport, request,
        () => hostileReads += 1);
      assert.equal(hostileReads, 0);
      assert.equal(gate.reads(), 0);

      const nested = {...request.release};
      Object.defineProperty(nested, 'targetBuildDigest', {enumerable: true, get() {
        hostileReads += 1;
        throw new Error('nested digest accessor must not run');
      }});
      const invalid = [
        {payload: {...request, deadlineAtMs: request.deadlineAtMs + 1},
          releaseId: request.release.releaseId},
        {payload: {...request, action: Object(request.action)},
          releaseId: request.release.releaseId},
        {payload: {...request, release: nested}, releaseId: null},
      ];
      for (const field of ['release', 'attempt', 'target', 'origin']) {
        const missing = {...request};
        delete missing[field];
        invalid.push({payload: missing,
          releaseId: field === 'release' ? null : request.release.releaseId});
        invalid.push({payload: {...request, [field]: undefined},
          releaseId: field === 'release' ? null : request.release.releaseId});
      }
      for (const {payload, releaseId} of invalid) {
        const answer = await sendRegisteredObservation(handler, transport, payload);
        assert.equal(answer.outcome, OUTCOME.INVALID, JSON.stringify(answer));
        assert.equal(answer.releaseId, releaseId);
      }
      await assertNestedCaptureIgnoresArrayIterator(handler, transport, request, nested);
      assert.equal(hostileReads, 0);
      assert.equal(gate.reads(), 0);
      assert.equal(releaseListenerCount(leader), 0);
      assert.equal(clock.pendingTimerCount(), timerBaseline);
      const valid = gate.trackSettlement('valid observation after ingress refusals',
        sendRegisteredObservation(handler, transport, request));
      await gate.started;
      gate.release();
      assert.equal((await valid).outcome, OUTCOME.OBSERVED);
    } catch (error) {
      failure = error;
    } finally {
      failure = await gate.retire(failure,
        'strict ingress assertion and membership custody failed');
    }
    if (failure !== null) throw failure;

    const ownerDescriptor = Object.getOwnPropertyDescriptor(handler, 'ownerIncarnation');
    const currentIncarnation = handler.ownerIncarnation;
    let generationFailure = null;
    try {
      for (const malformed of [undefined, Object(currentIncarnation), 0]) {
        handler.ownerIncarnation = malformed;
        const refused = await readParticipantReleaseFacts(handler, leader);
        assert.equal(refused.outcome, OUTCOME.UNAVAILABLE);
        assert.equal(refused.missingFact, 'current_replica_generation');
      }
    } catch (error) {
      generationFailure = error;
    } finally {
      try {
        Object.defineProperty(handler, 'ownerIncarnation', ownerDescriptor);
      } catch (error) {
        generationFailure = retainFailure(generationFailure, error,
          'generation assertion and owner restoration failed');
      }
    }
    if (generationFailure !== null) throw generationFailure;
    const observed = await readParticipantReleaseFacts(handler, leader);
    assert.equal(observed.outcome, OUTCOME.OBSERVED, JSON.stringify(observed));
    assert.equal(observed.generation.ownerIncarnation, currentIncarnation);
  }));

test('applied-position receiver refuses malformed observation clocks without effects', () =>
  withRegisteredObservationOwner(async ({handler, leader, transport, clock}) => {
    const request = await currentObservationRequest(handler, leader);
    const timerBaseline = clock.pendingTimerCount();
    const missingDeadline = {...request};
    delete missingDeadline.observationDeadlineAtMs;
    assert.equal((await sendRegisteredObservation(handler, transport, missingDeadline)).outcome,
      OUTCOME.INVALID, 'the receiver requires the sender-carried RPC ceiling');
    const invalidDeadlines = [undefined, null, Number.NaN, Number.POSITIVE_INFINITY,
      1.5, -0, Number.MAX_SAFE_INTEGER + 1, '6000', Object(6000)];
    for (const observationDeadlineAtMs of invalidDeadlines) {
      const answer = await sendRegisteredObservation(handler, transport,
        {...request, observationDeadlineAtMs});
      assert.equal(answer.outcome, OUTCOME.INVALID, JSON.stringify(answer));
      assert.equal(answer.partitionId, request.partitionId);
      assert.equal(answer.releaseId, request.release.releaseId);
      assert.equal(answer.phase, request.action);
      assert.equal(releaseListenerCount(leader), 0);
      assert.equal(clock.pendingTimerCount(), timerBaseline);
      assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.CLOSED);
    }

    const gate = deferObservationMembership(leader);
    const nowDescriptor = Object.getOwnPropertyDescriptor(clock, 'now');
    const registrationNow = clock.now();
    const samples = [registrationNow, registrationNow - 1];
    let timerFailure = null;
    try {
      clock.now = () => -1;
      const refusal = await sendRegisteredObservation(handler, transport, request);
      assert.equal(refusal.outcome, OUTCOME.UNAVAILABLE);
      assert.equal(refusal.missingFact, 'replica_release_reply');
      assert.equal(clock.pendingTimerCount(), timerBaseline);
      clock.now = () => samples.shift() ?? registrationNow - 1;
      const pending = track(gate.trackSettlement('backward timer observation',
        sendRegisteredObservation(handler, transport, request)));
      await gate.started;
      clock.advance(BOUND.REQUEST_TIMEOUT_MS);
      await settle();
      assert.equal(pending.settled, true,
        'an installed timer terminalizes even when its later clock sample steps backward');
      const answer = await pending.promise;
      assert.equal(answer.outcome, OUTCOME.UNAVAILABLE, JSON.stringify(answer));
      assert.equal(answer.missingFact, 'replica_release_reply');
      assert.equal(answer.reason,
        TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT);
      assert.equal(releaseListenerCount(leader), 0);
      assert.equal(clock.pendingTimerCount(), timerBaseline);
    } catch (error) {
      timerFailure = error;
    } finally {
      try {
        if (nowDescriptor === undefined) delete clock.now;
        else Object.defineProperty(clock, 'now', nowDescriptor);
      } catch (error) {
        timerFailure = retainFailure(timerFailure, error,
          'backward timer assertion and clock restoration failed');
      }
      timerFailure = await gate.retire(timerFailure,
        'backward timer assertion and membership custody failed');
    }
    if (timerFailure !== null) throw timerFailure;

    const originalTimeSource = handler.timeSource;
    const invalidClockSamples = [Number.NaN, Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY, -1, 1.5, -0, Number.MAX_SAFE_INTEGER + 1,
      '6000', new Error('release clock unavailable')];
    for (const sample of invalidClockSamples) {
      let deliveries = 0;
      const originalDeliver = transport.deliver.bind(transport);
      transport.deliver = (...args) => {
        deliveries += 1;
        return originalDeliver(...args);
      };
      handler.timeSource = {now() {
        if (sample instanceof Error) throw sample;
        return sample;
      }};
      try {
        const answer = await askParticipantRelease(handler, handler.nodeId, request);
        assert.equal(answer.outcome, OUTCOME.UNAVAILABLE, JSON.stringify(answer));
        assert.equal(answer.partitionId, request.partitionId);
        assert.equal(answer.phase, request.action);
        assert.equal(answer.releaseId, request.release.releaseId);
        assert.equal(deliveries, 0,
          'an unusable sender clock cannot create an unbounded observation');
        assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.CLOSED);
      } finally {
        handler.timeSource = originalTimeSource;
        transport.deliver = originalDeliver;
      }
    }
  }));

test('post-facts adjudication fences a real term change and preserves same-context facts',
  async () => {
    for (const changeTerm of [false, true]) {
      await withRegisteredObservationOwner(async ({handler, leader, transport, clock}) => {
        const request = await currentObservationRequest(handler, leader);
        const gate = deferObservationMembership(leader);
        const nowDescriptor = Object.getOwnPropertyDescriptor(clock, 'now');
        const actualNow = clock.now.bind(clock);
        const priorTerm = leader.controllablePort.term;
        let armed = false;
        let consumingSamples = 0;
        clock.now = () => {
          const value = actualNow();
          if (armed) {
            consumingSamples += 1;
            if (changeTerm && consumingSamples === 1) {
              leader.controllablePort.setTerm(priorTerm + 1);
            }
          }
          return value;
        };
        let failure = null;
        try {
          const observation = gate.trackSettlement('post-facts term observation',
            sendRegisteredObservation(handler, transport, request));
          await gate.started;
          armed = true;
          gate.release();
          const answer = await observation;
          assert.equal(answer.outcome, changeTerm ? OUTCOME.STALE : OUTCOME.OBSERVED,
            JSON.stringify(answer));
          assert.equal(answer.partitionId, request.partitionId);
          assert.equal(answer.releaseId, request.release.releaseId);
          assert.equal(consumingSamples, 1,
            'the consuming owner takes one post-facts clock observation');
          assert.equal(leader.controllablePort.term,
            changeTerm ? priorTerm + 1 : priorTerm);
          assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.CLOSED);
        } catch (error) {
          failure = error;
        } finally {
          try {
            if (nowDescriptor === undefined) delete clock.now;
            else Object.defineProperty(clock, 'now', nowDescriptor);
          } catch (error) {
            failure = retainFailure(failure, error,
              'post-facts term clock restoration failed');
          }
          failure = await gate.retire(failure,
            'post-facts term assertion and membership custody failed');
        }
        if (failure !== null) throw failure;
      });
    }
  });

test('normal N-to-K application between facts and adjudication remains current', () =>
  withRegisteredObservationOwner(async ({handler, leader, proposed, transport,
    ownSettlement}) => {
    const write = track(ownSettlement('N-to-K ordinary write',
      leader.executeQuery(FIXTURE_SQL, ['n-to-k', 'applied'])));
    const proposal = await awaitProposal(proposed, (entry) => entry.sql === FIXTURE_SQL);
    assert.notEqual(proposal, null);
    const appliedN = durableAppliedIndex(leader);
    const request = await currentObservationRequest(handler, leader);
    const portDescriptor = Object.getOwnPropertyDescriptor(leader, 'raft');
    const actualPort = leader.raft;
    const statuses = [];
    let committed = false;
    let wakeCount = 0;
    const wrappedPort = Object.freeze({...actualPort, readStatus() {
      if (statuses.length === 1 && !committed) {
        committed = true;
        leader.controllablePort.commit(proposal);
        leader.controllablePort.emitEvent(RAFT_EVENT.APPLIED_PROGRESS);
      }
      const status = actualPort.readStatus();
      statuses.push(status);
      return status;
    }});
    let unsubscribe = () => {};
    let observation = null;
    let failure = null;
    const gate = deferObservationMembership(leader);
    try {
      unsubscribe = leader.raft.subscribe(RAFT_EVENT.APPLIED_PROGRESS,
        () => wakeCount += 1);
      Object.defineProperty(leader, 'raft', {...portDescriptor, value: wrappedPort});
      observation = track(ownSettlement('N-to-K observation',
        sendRegisteredObservation(handler, transport, request)));
      await gate.started;
      gate.release();
      const answer = await observation.promise;
      assert.equal(answer.outcome, OUTCOME.OBSERVED,
        `a false STALE means the N-to-K applied-position fence rejected current work: ${JSON.stringify(answer)}`);
      assert.equal(committed, true,
        'the real application publishes K at the post-facts status boundary');
      assert.equal(statuses[0].appliedIndex, appliedN);
      assert.ok(statuses[1].appliedIndex > statuses[0].appliedIndex);
      for (const field of ['term', 'leaderId', 'configurationKey',
        'membershipGenerationIndex', 'runtimeGeneration', 'lifecycleIncarnation']) {
        assert.equal(statuses[1][field], statuses[0][field],
          `ordinary application preserves ${field}`);
      }
      assert.equal(durableAppliedIndex(leader), statuses[1].appliedIndex);
      assert.ok(wakeCount > 0,
        'the controlled publication seam emits the existing applied-progress wake');
      const writeAnswer = await write.promise;
      assert.equal(writeAnswer.success, true, JSON.stringify(writeAnswer));
      const committedOutcome = readCommittedStatementOutcome(leader,
        leader.getCommittedEntryKey(proposal));
      assert.equal(committedOutcome.state, 'settled');
      assert.equal(committedOutcome.outcome, 'applied');
      assert.equal(committedOutcome.logIndex, durableAppliedIndex(leader));
      assert.equal(leader.proposalQueue.size, 0);
      assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.CLOSED);
    } catch (error) {
      failure = error;
    } finally {
      try {
        unsubscribe();
      } catch (error) {
        failure = retainFailure(failure, error, 'N-to-K wake cleanup failed');
      }
      try {
        Object.defineProperty(leader, 'raft', portDescriptor);
      } catch (error) {
        failure = retainFailure(failure, error, 'N-to-K operation-port restoration failed');
      }
      failure = await gate.retire(failure,
        'N-to-K assertion and membership custody failed');
    }
    if (failure !== null) throw failure;
  }));

test('an applied-progress wake reflected by the first facts read needs no forced reread', () =>
  withRegisteredObservationOwner(async ({handler, leader, proposed, transport, clock,
    ownSettlement}) => {
    const write = track(ownSettlement('fresh-first-read write',
      leader.executeQuery(FIXTURE_SQL, ['fresh-wake', 'applied'])));
    const proposal = await awaitProposal(proposed, (entry) => entry.sql === FIXTURE_SQL);
    assert.notEqual(proposal, null);
    const anchoredMembership = await leader.raft.readCommittedMembership(
      {purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS});
    const request = await currentObservationRequest(handler, leader);
    const gate = deferObservationMembership(leader);
    const timerBaseline = clock.pendingTimerCount();
    const observation = gate.trackSettlement('fresh-first-read observation',
      sendRegisteredObservation(handler, transport, request));
    let failure = null;
    try {
      await gate.started;
      leader.controllablePort.commit(proposal);
      assert.equal((await write.promise).success, true);
      leader.controllablePort.emitEvent(RAFT_EVENT.APPLIED_PROGRESS);
      gate.release();
      const answer = await observation;
      assert.equal(answer.outcome, OUTCOME.OBSERVED, JSON.stringify(answer));
      assert.equal(answer.partitionId, request.partitionId);
      assert.deepEqual(answer.generation, request.target);
      const afterApplication = await leader.raft.readCommittedMembership(
        {purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS});
      assert.ok(afterApplication.appliedIndex > anchoredMembership.appliedIndex,
        'the ordinary command advances the application owner position');
      assert.equal(afterApplication.configurationKey,
        anchoredMembership.configurationKey,
        'an ordinary command does not change the current configuration');
      assert.equal(afterApplication.membershipGenerationIndex,
        anchoredMembership.membershipGenerationIndex,
        'an ordinary command does not advance membership generation');
      assert.equal(gate.reads(), 1,
        'a first owner read made after the wake needs no unconditional reread');
      assert.equal(releaseListenerCount(leader), 0);
      assert.equal(clock.pendingTimerCount(), timerBaseline);
    } catch (error) {
      failure = error;
    } finally {
      failure = await gate.retire(failure,
        'fresh-first-read assertion and membership custody failed');
    }
    if (failure !== null) throw failure;
  }));
