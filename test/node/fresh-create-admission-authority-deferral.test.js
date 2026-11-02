// Quest fresh-create-failure-after-committed-admission, link L2 (run b26d2c090,
// 10:29:57.228): the create-admission authority read of a fresh CREATE answered
// {success:false} once - a readiness-projection routing refusal - after the
// replica's admission and promotion had committed. That unavailability is a
// typed DEFERRED outcome; it must be consumed by the existing completion
// operation under the create's existing deadline (re-read on the next attempt),
// never thrown as a terminal create failure. The typed answer carries the
// authority read's own outcome and error text.
//
// Production entries: replica-create-admission-owner readOperation, the
// participant-release authorization owner, releaseFreshCreate and the local
// receive (runParticipantCutover). The router seam delivers to the real local
// receive; no partition is hosted, so a confirmed attempt proceeds to the
// cutover owner and answers hosted_partition.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {createParticipantReleaseRecovery} from
  '../../src/node/replica-handler-release-recovery.js';
import {createParticipantReleaseAuthorizationOwner} from
  '../../src/node/participant-release-authorization-owner.js';
import {runParticipantCutover} from '../../src/node/replica-handler-participant-cutover.js';
import {
  CREATE_ADMISSION_ERROR_CODE,
  CREATE_ADMISSION_STATE,
  ReplicaCreateAdmissionOwner,
} from '../../src/node/replica-create-admission-owner.js';
import {PARTICIPANT_CUTOVER_BOUND as BOUND, PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_RESULT_FIELD} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';

const NODE_ID = 'fresh-authority-node';
const PARTITION_ID = 'sql_transactions-p1';
const OPERATION_ID = 'c44b07a7-c09a-4925-9181-7729739b677a';
const FAILURE_PREFIX = 'Fresh replica participant release failed: ';
const CREATE_ADMISSION_AUTHORITY = 'create_admission_authority';
const ROUTING_REFUSAL = Object.freeze({success: false, outcome: 'owner_not_ready',
  error: 'all_services_filtered_by_readiness'});

function createClock() {
  let current = 1_000;
  return {
    now: () => current,
    setTimeout(callback, delay) {
      current += delay;
      queueMicrotask(callback);
      return {unref() {}};
    },
    clearTimeout() {},
  };
}

function deferredRead() {
  return Object.assign(new Error(`CREATE admission read deferred for ${OPERATION_ID}`), {
    code: CREATE_ADMISSION_ERROR_CODE.DEFERRED,
    errorCode: CREATE_ADMISSION_ERROR_CODE.DEFERRED,
    deferRetry: true,
    authorityOutcome: ROUTING_REFUSAL.outcome,
    authorityError: ROUTING_REFUSAL.error,
  });
}

function createHost(admissionAnswers) {
  const clock = createClock();
  const delivered = [];
  const admissionCalls = [];
  const createAdmissionEvidence = Object.freeze({partitionId: PARTITION_ID,
    operationId: OPERATION_ID});
  const services = new Map();
  services.subscribeServiceChanges = () => () => {};
  const handler = {nodeId: NODE_ID, timeSource: clock, localServices: services,
    consensusEvents: {subscribe: () => () => {}},
    getReplicaCreateAdmissionOwner: () => ({async authorizeParticipantRelease(evidence) {
      assert.equal(evidence, createAdmissionEvidence);
      const answer = admissionAnswers[Math.min(admissionCalls.length,
        admissionAnswers.length - 1)];
      admissionCalls.push(evidence);
      if (answer instanceof Error) throw answer;
      return answer;
    }}),
    messageRouter: {async deliver(address, request) {
      // The real local receive of the release route.
      const answer = await runParticipantCutover(handler, request);
      delivered.push({address, request, answer});
      return buildDeliveryEnvelope({acknowledged: true},
        {[PARTICIPANT_RELEASE_RESULT_FIELD]: answer});
    }},
  };
  handler.participantReleaseAuthorizationOwner =
    createParticipantReleaseAuthorizationOwner(handler);
  const recovery = createParticipantReleaseRecovery(handler);
  return {handler, clock, delivered, admissionCalls, recovery,
    run: (deadlineAtMs) => recovery.releaseFreshCreate(PARTITION_ID,
      {deadlineAtMs, identityExisted: false, createAdmissionEvidence})};
}

async function failureOf(host, deadlineAtMs) {
  let failure;
  await assert.rejects(host.run(deadlineAtMs), (error) => {
    failure = error;
    return true;
  });
  return failure;
}

test('L2: a deferred create-admission authority read is a typed, retried answer within the create deadline',
  async () => {
    // The create's authorization read and the first attempt's confirmation
    // are both refused; the second attempt's confirmation succeeds.
    const host = createHost([deferredRead(), deferredRead(),
      {admissionState: CREATE_ADMISSION_STATE.MATERIALIZED}]);
    const deadline = 1_000 + BOUND.PAUSE_RETRY_AFTER_MS * 2 + 5;
    try {
      const failure = await failureOf(host, deadline);
      assert.ok(failure.message.startsWith(FAILURE_PREFIX),
        `the deferral is not a terminal create failure (got: ${failure.message})`);
      assert.ok(host.delivered.length >= 2, 'the existing completion loop re-drove the attempt');
      const first = host.delivered[0].answer;
      assert.equal(first.outcome, OUTCOME.UNAVAILABLE);
      assert.equal(first.missingFact, CREATE_ADMISSION_AUTHORITY);
      assert.equal(first.retryAfterMs, BOUND.PAUSE_RETRY_AFTER_MS);
      assert.equal(first.authorityOutcome, ROUTING_REFUSAL.outcome,
        'the typed answer names the refusing read outcome');
      assert.equal(first.authorityError, ROUTING_REFUSAL.error,
        'the typed answer carries the read error text');
      const second = host.delivered[1].answer;
      assert.notEqual(second.missingFact, CREATE_ADMISSION_AUTHORITY,
        'the re-read authority confirmed the admission');
      assert.equal(second.missingFact, 'hosted_partition',
        'a confirmed attempt reaches the cutover owner');
      assert.equal(host.admissionCalls.length, 3,
        'the authority is re-read until it confirms, then never again');
      assert.equal(host.delivered[0].request.authorization,
        host.delivered[1].request.authorization, 'one authorization identity across attempts');
    } finally {
      await host.recovery.shutdown();
    }
  });

test('L2: an unconfirmed authorization grants nothing until the authority confirms it',
  async () => {
    const host = createHost([deferredRead(), deferredRead(), null]);
    try {
      const failure = await failureOf(host, 1_000 + BOUND.PAUSE_RETRY_AFTER_MS * 2 + 5);
      assert.ok(failure.message.startsWith(FAILURE_PREFIX), failure.message);
      const {authorization: token, targetBuildDigest} = host.delivered[0].request;
      assert.equal(host.handler.participantReleaseAuthorizationOwner.validates(token,
        {partitionId: PARTITION_ID, targetBuildDigest}),
      false, 'a pending or refused authorization never validates');
      const refused = host.delivered[1].answer;
      assert.equal(refused.outcome, OUTCOME.INVALID,
        'a row that no longer admits the create is a terminal typed refusal');
      assert.equal(refused.missingFact, CREATE_ADMISSION_AUTHORITY);
      assert.equal(refused.retryAfterMs, undefined, 'the refusal is not retried');
      assert.equal(host.delivered.length, 2);
    } finally {
      await host.recovery.shutdown();
    }
  });

test('L2: readOperation carries the authority read outcome and error on its typed deferral',
  async () => {
    const owner = new ReplicaCreateAdmissionOwner({nodeId: NODE_ID, gateway: {
      async readAuthoritativeRows() {
        return ROUTING_REFUSAL;
      },
    }});
    await assert.rejects(owner.readOperation(OPERATION_ID), (error) => {
      assert.equal(error.code, CREATE_ADMISSION_ERROR_CODE.DEFERRED);
      assert.equal(error.deferRetry, true);
      assert.equal(error.authorityOutcome, ROUTING_REFUSAL.outcome);
      assert.equal(error.authorityError, ROUTING_REFUSAL.error);
      return true;
    });
    const cause = new Error('owner rpc transport refused');
    const throwing = new ReplicaCreateAdmissionOwner({nodeId: NODE_ID, gateway: {
      async readAuthoritativeRows() {
        throw cause;
      },
    }});
    await assert.rejects(throwing.readOperation(OPERATION_ID), (error) => {
      assert.equal(error.cause, cause);
      assert.equal(error.authorityError, cause.message);
      return true;
    });
  });
