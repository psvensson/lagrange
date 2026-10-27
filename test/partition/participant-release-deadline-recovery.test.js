// Real registered release/recovery owners and native retained SQLite, with
// bounded delivery/notification faults and an injected release-owner clock.
// This is a local one-member owner witness, not full seed or cross-host proof.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {requestParticipantRelease} from '../../src/node/participant-release-client.js';
import {durableRecordBootstrap} from '../../src/raft/raft-committed-membership-stamp.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {PARTITION_SERVICE_EVENT} from '../../src/partition/partition-service-constants.js';
import {participantReleaseAdmissionOf} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {readPartitionWriteOrigin} from
  '../../src/partition/partition-participant-transaction-store.js';
import {
  PARTICIPANT_CUTOVER_BOUND as BOUND,
  PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ACTION as ACTION,
  PARTICIPANT_RELEASE_ADMISSION as ADMISSION,
  PARTICIPANT_RELEASE_LOG,
  PARTICIPANT_RELEASE_MISSING_FACT as MISSING,
  PARTICIPANT_RELEASE_RESULT_FIELD,
  PARTICIPANT_RELEASE_TYPE,
} from '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {clearFixtureSingletons, resetFixtureSingletons} from
  '../test-helpers/participant-transaction-fixture.js';
import {CONTROL_PARTITION, CONTROL_REPLICA, PARTITION, REPLICA, SQL,
  withParticipantReleaseProtocol as fixture} from
  '../test-helpers/participant-release-protocol-fixture.js';
import {waitForCondition} from './partition-service-test-support.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const SEED_SHARED_BUDGET_MS = 3000;
const INITIAL_CLOCK_MS = 100;

async function withRestoredObservers(measure) {
  const restorations = [];
  let failure = null;
  try {
    await measure((restore) => restorations.push(restore));
  } catch (error) {
    failure = error;
  }
  for (const restore of restorations.reverse()) {
    try {
      restore();
    } catch (error) {
      failure = failure === null ? error :
        new AggregateError([failure, error], 'witness and observer restoration failed');
    }
  }
  if (failure !== null) throw failure;
}

function interceptDependentReply(transport, action, transform) {
  const original = transport.deliver;
  const state = {calls: [], selected: null, reply: null, callbackError: null};
  transport.deliver = function(...args) {
    const payload = args[1];
    if (payload?.type !== PARTICIPANT_RELEASE_TYPE) {
      return Reflect.apply(original, this, args);
    }
    state.calls.push({partitionId: payload.partitionId, action: payload.action});
    const operation = Reflect.apply(original, this, args);
    if (payload.partitionId !== PARTITION || payload.action !== action ||
        state.selected !== null) return operation;
    state.selected = payload;
    return Promise.resolve(operation).then((response) => {
      state.reply = response.answer?.[PARTICIPANT_RELEASE_RESULT_FIELD];
      try {
        return transform(response, payload);
      } catch (error) {
        state.callbackError = error;
        throw error;
      }
    });
  };
  return {state, restore() {
    transport.deliver = original;
  }};
}

function captureRecoveryReports(handler) {
  const original = handler.logger.info;
  const reports = [];
  handler.logger.info = function(message, fields) {
    if (message === PARTICIPANT_RELEASE_LOG) reports.push(fields);
    return Reflect.apply(original, this, [message, fields]);
  };
  return {reports, restore() {
    handler.logger.info = original;
  }};
}

function suppressConsensusNotifications(service) {
  const descriptor = Object.getOwnPropertyDescriptor(service, 'emit');
  const original = service.emit;
  const dropped = [];
  service.emit = function(eventName, ...args) {
    if (eventName === PARTITION_SERVICE_EVENT.CONSENSUS_OBSERVED) {
      dropped.push(args[0]);
      return false;
    }
    return Reflect.apply(original, this, [eventName, ...args]);
  };
  return {dropped, restore() {
    if (descriptor === undefined) {
      if (!delete service.emit) throw new Error('service emit restoration refused');
    } else {
      Object.defineProperty(service, 'emit', descriptor);
    }
  }};
}

async function expectRecoveryReport(reports, partitionId, outcome, missingFact) {
  const matches = (report) => report.partitionId === partitionId &&
    report.outcome === outcome && report.missingFact === missingFact;
  assert.equal(await waitForCondition(() => reports.some(matches),
    BOUND.REQUEST_TIMEOUT_MS, BOUND.POLL_INTERVAL_MS), true,
  `actual recovery report required: ${partitionId} / ${outcome} / ${missingFact}`);
  return reports.findLast(matches);
}

async function settleInitialRecovery(clock, reports) {
  clock.advance(0);
  await expectRecoveryReport(reports, PARTITION, OUTCOME.OPERATOR_REQUIRED,
    'explicit_pre_origin_release_request');
  await expectRecoveryReport(reports, CONTROL_PARTITION, OUTCOME.OPERATOR_REQUIRED,
    'explicit_pre_origin_release_request');
}

function assertClosedWithoutOrigin(service) {
  assert.equal(participantReleaseAdmissionOf(service).state, ADMISSION.CLOSED);
  assert.equal(readPartitionWriteOrigin(service.db), null);
}

function dependentActionCount(calls, action) {
  return calls.filter((call) => call.partitionId === PARTITION &&
    call.action === action).length;
}

async function expectOpenFromExistingRecovery(service) {
  assert.equal(await waitForCondition(() =>
    participantReleaseAdmissionOf(service).state === ADMISSION.OPEN,
  BOUND.REQUEST_TIMEOUT_MS, BOUND.POLL_INTERVAL_MS), true,
  'retained recovery retry must reopen the current service after authority returns');
}

test('registered release refuses pre-ENABLE expiry and requires a new authorized ' +
  'continuation without erasing the committed control origin', async () => {
  const clock = new VirtualTimeSource({startMs: INITIAL_CLOCK_MS});
  await fixture(async ({handler, service, controlService, transport, release, build}) =>
    withRestoredObservers(async (restore) => {
      const {reports, restore: restoreReports} = captureRecoveryReports(handler);
      restore(restoreReports);
      await settleInitialRecovery(clock, reports);
      let controlOriginAtPause = null;
      const fault = interceptDependentReply(transport, ACTION.PAUSE, (response, request) => {
        controlOriginAtPause = readPartitionWriteOrigin(controlService.db);
        clock.advance(request.deadlineAtMs - clock.now());
        return response;
      });
      restore(fault.restore);
      const deadlineAtMs = clock.now() + SEED_SHARED_BUDGET_MS;
      const expired = await handler.participantReleaseRecovery.releaseOperator({
        partitionId: PARTITION, targetBuildDigest: build.digest, deadlineAtMs});
      assert.equal(fault.state.callbackError, null, 'deadline observation must not fail');
      assert.notEqual(fault.state.selected, null, 'actual dependent PAUSE must engage');
      assert.equal(fault.state.reply.outcome, OUTCOME.OBSERVED);
      assert.equal(fault.state.selected.deadlineAtMs, deadlineAtMs);
      assert.equal(clock.now(), deadlineAtMs, 'the original request budget is fully spent');
      assert.equal(expired.outcome, OUTCOME.UNAVAILABLE, JSON.stringify(expired));
      assert.equal(expired.missingFact, MISSING.RELEASE_DEADLINE);
      assert.equal(expired.phase, ACTION.ENABLE,
        'the expiry must be the pre-dispatch ENABLE guard, not earlier setup');
      assert.equal(dependentActionCount(fault.state.calls, ACTION.ENABLE), 0);
      assert.notEqual(controlOriginAtPause, null, 'real control origin committed first');
      assert.deepEqual(readPartitionWriteOrigin(controlService.db), controlOriginAtPause);
      assertClosedWithoutOrigin(service);

      const unprivileged = await requestParticipantRelease(handler, {
        partitionId: PARTITION, targetBuildDigest: build.digest,
        deadlineAtMs: clock.now() + BOUND.DRAIN_DEADLINE_MS});
      assert.equal(unprivileged.outcome, OUTCOME.OPERATOR_REQUIRED,
        JSON.stringify(unprivileged));
      assert.equal(unprivileged.missingFact, MISSING.FRESH_STORAGE_OR_OPERATOR_AUTHORITY);
      assertClosedWithoutOrigin(service);
      assert.equal(dependentActionCount(fault.state.calls, ACTION.ENABLE), 0);

      const authorized = await release();
      assert.equal(authorized.outcome, OUTCOME.CUT_OVER, JSON.stringify(authorized));
      assert.equal(dependentActionCount(fault.state.calls, ACTION.ENABLE), 1);
      assert.equal(participantReleaseAdmissionOf(service).state, ADMISSION.OPEN);
      assert.notEqual(readPartitionWriteOrigin(service.db), null);
      assert.deepEqual(readPartitionWriteOrigin(controlService.db), controlOriginAtPause);
      assert.equal((await service.executeQuery(SQL, ['after-expiry', 'written'])).success,
        true, 'the new authorized operation must make actual write progress');
    }), undefined, {timeSource: clock});
});

async function restartDependentWithLostNotifications(context, restore) {
  const {handler, service, create, replace} = context;
  await service.shutdown();
  const replacement = create({bootstrapMembership: durableRecordBootstrap()});
  replace(replacement);
  const suppression = suppressConsensusNotifications(replacement);
  restore(suppression.restore);
  let forwarded = 0;
  restore(handler.consensusEvents.subscribe(({replicaId}) => {
    if (replicaId === REPLICA) forwarded += 1;
  }));
  await replacement.initialize();
  await replacement.raft.campaign();
  assert.equal(replacement.raft.readStatus().role, RAFT_ROLE.LEADER,
    'native current leader must exist before the missing-control recovery attempt');
  assert.ok(suppression.dropped.length > 0,
    'the fault must suppress actual native consensus notifications');
  assert.equal(suppression.dropped.every((event) =>
    event.partitionId === PARTITION && event.replicaId === REPLICA), true);
  assert.equal(forwarded, 0, 'the actual registry relay must not receive suppressed events');
  return {replacement, forwardedCount: () => forwarded};
}

async function restoreCurrentControl(context) {
  const {handler, createControl, replaceControl} = context;
  const replacement = createControl({bootstrapMembership: durableRecordBootstrap()});
  replaceControl(replacement);
  await replacement.initialize();
  await replacement.raft.campaign();
  assert.equal(replacement.raft.readStatus().role, RAFT_ROLE.LEADER);
  assert.strictEqual(handler.localServices.get(CONTROL_REPLICA), replacement);
  return replacement;
}

async function proveRetainedRetry(context, clock, reports, fault, origin, restore) {
  const {handler, controlService} = context;
  const controlOrigin = readPartitionWriteOrigin(controlService.db);
  assert.notEqual(controlOrigin, null);
  await controlService.shutdown();
  const {replacement, forwardedCount} =
    await restartDependentWithLostNotifications(context, restore);
  assert.deepEqual(readPartitionWriteOrigin(replacement.db), origin,
    'the committed origin survives intact SQLite recreation');
  assert.equal(participantReleaseAdmissionOf(replacement).state, ADMISSION.CLOSED);
  clock.advance(0);
  await expectRecoveryReport(reports, PARTITION, OUTCOME.UNAVAILABLE,
    MISSING.CURRENT_CONTROL_OWNER);
  assert.equal(participantReleaseAdmissionOf(replacement).state, ADMISSION.CLOSED,
    'missing current control authority must keep the recreated service closed');
  assert.deepEqual(readPartitionWriteOrigin(replacement.db), origin);

  const beforeRetry = dependentActionCount(fault.state.calls, ACTION.INSPECT);
  const controlReplacement = await restoreCurrentControl(context);
  clock.advance(0);
  await expectOpenFromExistingRecovery(controlReplacement);
  assert.deepEqual(readPartitionWriteOrigin(controlReplacement.db), controlOrigin);
  clock.advance(BOUND.RECOVERY_RETRY_MS - 1);
  assert.equal(participantReleaseAdmissionOf(replacement).state, ADMISSION.CLOSED,
    'control restoration does not grant dependent OPEN before its retry');
  assert.equal(dependentActionCount(fault.state.calls, ACTION.INSPECT), beforeRetry,
    'no manufactured dependent event or direct release supplies the retry');
  clock.advance(1);
  await expectOpenFromExistingRecovery(replacement);
  await expectRecoveryReport(reports, PARTITION, OUTCOME.CUT_OVER, null);
  assert.ok(dependentActionCount(fault.state.calls, ACTION.INSPECT) > beforeRetry,
    'the due retry must re-enter the actual dependent release route');
  assert.equal(forwardedCount(), 0, 'lost consensus notifications remain suppressed');
  assert.strictEqual(handler.localServices.get(REPLICA), replacement);
  assert.deepEqual(readPartitionWriteOrigin(replacement.db), origin,
    'retry must retain the original committed origin, not recreate it');
  assert.equal((await replacement.executeQuery(SQL, ['after-restart', 'written'])).success,
    true, 'recovery must restore actual native SQL progress');
}

test('lost native ENABLE answer survives restart and missing control; the existing ' +
  'retry progresses despite dropped consensus notifications', async () => {
  const clock = new VirtualTimeSource({startMs: INITIAL_CLOCK_MS});
  await fixture(async (context) => withRestoredObservers(async (restore) => {
    const {handler, service, transport, release} = context;
    const {reports, restore: restoreReports} = captureRecoveryReports(handler);
    restore(restoreReports);
    await settleInitialRecovery(clock, reports);
    const lostAnswer = new Error('deliberate loss after native ENABLE committed');
    let originAtAnswer = null;
    const fault = interceptDependentReply(transport, ACTION.ENABLE, () => {
      originAtAnswer = readPartitionWriteOrigin(service.db);
      throw lostAnswer;
    });
    restore(fault.restore);
    const lost = await release();
    assert.strictEqual(fault.state.callbackError, lostAnswer,
      'only the intended transport loss may interrupt the actual ENABLE answer');
    assert.notEqual(fault.state.selected, null, 'actual dependent ENABLE must engage');
    assert.equal(fault.state.reply.outcome, OUTCOME.OBSERVED);
    assert.notEqual(originAtAnswer, null, 'origin must commit before its answer is lost');
    assert.deepEqual(fault.state.reply.origin, originAtAnswer);
    assert.equal(lost.outcome, OUTCOME.UNAVAILABLE, JSON.stringify(lost));
    assert.equal(lost.missingFact, MISSING.REPLICA_RELEASE_REPLY);
    assert.equal(lost.phase, ACTION.ENABLE);
    assert.equal(participantReleaseAdmissionOf(service).state, ADMISSION.CLOSED);
    assert.deepEqual(readPartitionWriteOrigin(service.db), originAtAnswer);
    await proveRetainedRetry(context, clock, reports, fault, originAtAnswer, restore);
  }), undefined, {timeSource: clock});
});
