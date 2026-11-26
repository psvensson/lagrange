// Component witness of the existing entry, actual authorization token owner
// and release client. MATERIALIZED admission and routed replies are explicit
// fixture seams; this does not prove placement, consensus or native release.
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {FRESH_CREATE_RELEASE_UNAVAILABLE, createParticipantReleaseRecovery} from
  '../../src/node/replica-handler-release-recovery.js';
import {createParticipantReleaseAuthorizationOwner} from
  '../../src/node/participant-release-authorization-owner.js';
import {PARTICIPANT_CUTOVER_BOUND as BOUND, PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ACTION as ACTION, PARTICIPANT_RELEASE_TRIGGER as TRIGGER,
  PARTICIPANT_RELEASE_RESULT_FIELD, PARTICIPANT_RELEASE_ROUTE_SUFFIX} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';

const NODE_ID = 'fresh-completion-node';
const PARTITION_ID = 'fresh-completion-partition';
const FAILURE_PREFIX = 'Fresh replica participant release failed: ';

function createClock({values = null, waitFailure = null} = {}) {
  let current = 100;
  const reads = [];
  const waits = [];
  let unrefs = 0;
  return {
    reads, waits,
    now() {
      const value = values ? values[Math.min(reads.length, values.length - 1)] : current;
      reads.push(value);
      return value;
    },
    setTimeout(callback, delay) {
      waits.push(delay);
      if (waitFailure) throw waitFailure;
      current += delay;
      queueMicrotask(callback);
      return {unref() {
        unrefs += 1;
      }};
    },
    clearTimeout() {
      throw new Error('no background task was scheduled');
    },
    unrefs: () => unrefs,
  };
}

function createHost({clock = createClock(), reply} = {}) {
  const delivered = [];
  // R09 (quest fresh-create-release-authority-from-committed-operation): the
  // release carries the create identity as a lookup key; the answering leader
  // decides authority from the committed operation, so the creating node
  // reads no admission and holds no token.
  const createAdmissionEvidence = Object.freeze({partitionId: PARTITION_ID,
    operationId: 'fresh-completion-op', replicaId: 'fresh-completion-replica',
    targetNodeId: NODE_ID, admissionToken: 'fresh-completion-admission',
    attemptToken: 'fresh-completion-attempt', attemptSeq: 1, replicaCreatedAt: 1000});
  const services = new Map();
  let releasedSubscriptions = 0;
  services.subscribeServiceChanges = () => () => {
    releasedSubscriptions += 1;
  };
  const handler = {nodeId: NODE_ID, timeSource: clock, localServices: services,
    consensusEvents: {subscribe: () => () => {
      releasedSubscriptions += 1;
    }},
    messageRouter: {async deliver(address, request, options) {
      const answer = reply(request, delivered.length);
      delivered.push({address, request, options, answer});
      return buildDeliveryEnvelope({acknowledged: true, messageId: `hop-${delivered.length}`}, {
        [PARTICIPANT_RELEASE_RESULT_FIELD]: answer,
      });
    }},
  };
  handler.participantReleaseAuthorizationOwner =
    createParticipantReleaseAuthorizationOwner(handler);
  const recovery = createParticipantReleaseRecovery(handler);
  const trace = {hops: {}};
  return {clock, delivered, trace,
    run: (deadlineAtMs = 105, identityExisted = false) =>
      recovery.releaseFreshCreate(PARTITION_ID,
        {deadlineAtMs, identityExisted, createAdmissionEvidence, trace}),
    async close() {
      await recovery.shutdown();
      assert.equal(releasedSubscriptions, 2, 'the actual recovery owner releases its subscriptions');
    },
    assertRequests(deadline = 105) {
      assert.ok(delivered.length > 0, 'the real release client delivered an attempt');
      assert.equal(trace.hops.release.count, delivered.length);
      assert.equal(trace.hops.release.last.messageId, `hop-${delivered.length}`);
      const first = delivered[0].request;
      assert.match(first.targetBuildDigest, /^[a-f0-9]{64}$/u);
      for (const {address, request, options} of delivered) {
        assert.equal(address, NODE_ID + PARTICIPANT_RELEASE_ROUTE_SUFFIX);
        assert.equal(options.targetNodeId, NODE_ID);
        assert.ok(options.timeoutMs > 0 && options.timeoutMs <= BOUND.REQUEST_TIMEOUT_MS);
        assert.equal(request.partitionId, PARTITION_ID);
        assert.equal(request.action, ACTION.RELEASE);
        assert.equal(request.trigger, TRIGGER.FRESH_CREATE);
        assert.equal(request.deadlineAtMs, deadline);
        assert.equal(request.targetBuildDigest, first.targetBuildDigest);
        assert.equal(request.createAdmissionIdentity, first.createAdmissionIdentity,
          'one create identity is carried by every attempt');
        assert.equal(request.createAdmissionIdentity.operationId, 'fresh-completion-op');
        assert.equal(request.authorization, undefined, 'no node-local token is carried');
      }
    },
  };
}

async function withHost(host, body) {
  let primary;
  let failed = false;
  try {
    await body();
  } catch (error) {
    primary = error;
    failed = true;
  }
  try {
    await host.close();
  } catch (cleanup) {
    if (failed) throw new AggregateError([primary, cleanup], 'body and fixture cleanup failed');
    throw cleanup;
  }
  if (failed) throw primary;
}

async function failureOf(host) {
  let failure;
  await assert.rejects(host.run(), (error) => {
    failure = error;
    return error.message.startsWith(FAILURE_PREFIX);
  });
  return JSON.parse(failure.message.slice(FAILURE_PREFIX.length));
}

test('fresh CREATE completion re-drives with original authority and exact answer, without diagnostic reads',
  async () => {
    for (const outcome of [OUTCOME.DRAIN_PENDING, OUTCOME.NOT_LEADER]) {
      const terminal = Object.freeze({outcome: OUTCOME.CUT_OVER});
      const pending = {outcome, retryAfterMs: 0};
      for (const name of ['blockedDrain', 'joinedAttempt']) {
        Object.defineProperty(pending, name, {get() {
          throw new Error(`fresh CREATE must not read seed diagnostic ${name}`);
        }});
      }
      const host = createHost({reply: (_request, index) => index === 0 ? pending : terminal});
      const deadline = 100 + BOUND.PAUSE_RETRY_AFTER_MS + 5;
      await withHost(host, async () => {
        assert.equal(await host.run(deadline), terminal, 'successful answer object is unchanged');
        host.assertRequests(deadline);
        assert.equal(host.delivered.length, 2);
        assert.deepEqual(host.clock.waits,
          [outcome === OUTCOME.NOT_LEADER ? BOUND.PAUSE_RETRY_AFTER_MS : 0]);
        assert.equal(host.clock.unrefs(), 1, 'fresh CREATE preserves its unref timer substrate');
        assert.equal(host.clock.reads.length, 6,
          'prerequisite, first client, guard, preparation, continuation, second client');
      });
    }
  });

test('fresh CREATE completion keeps invalid delays terminal before any guard-clock read', async () => {
  for (const retryAfterMs of [undefined, null, -1, 1.5, NaN, Infinity, '1']) {
    const host = createHost({reply: () => ({outcome: OUTCOME.DRAIN_PENDING, retryAfterMs})});
    await withHost(host, async () => {
      const failure = await failureOf(host);
      host.assertRequests();
      assert.equal(failure.answer.outcome, OUTCOME.DRAIN_PENDING);
      assert.deepEqual(host.clock.waits, []);
      assert.deepEqual(host.clock.reads, [100, 100], 'only prerequisite and client read time');
    });
  }
});

test('fresh CREATE stops when wait preparation reaches D, but calls the client after a wait ending at D',
  async () => {
    const preparedAtDeadline = createHost({
      clock: createClock({values: [100, 100, 100, 105]}),
      reply: () => ({outcome: OUTCOME.DRAIN_PENDING, retryAfterMs: 1}),
    });
    await withHost(preparedAtDeadline, async () => {
      const failure = await failureOf(preparedAtDeadline);
      preparedAtDeadline.assertRequests();
      assert.deepEqual(preparedAtDeadline.clock.waits, [], 'fresh CREATE never prepares a zero wait at D');
      assert.deepEqual(preparedAtDeadline.clock.reads, [100, 100, 100, 105]);
      assert.deepEqual(failure.answer, preparedAtDeadline.delivered[0].answer,
        'no extra client call replaces the original answer');
    });
    const waitedToDeadline = createHost({
      reply: () => ({outcome: OUTCOME.DRAIN_PENDING, retryAfterMs: 5}),
    });
    await withHost(waitedToDeadline, async () => {
      const failure = await failureOf(waitedToDeadline);
      waitedToDeadline.assertRequests();
      assert.deepEqual(waitedToDeadline.clock.waits, [5]);
      assert.deepEqual(waitedToDeadline.clock.reads, [100, 100, 100, 100, 105, 105]);
      assert.equal(waitedToDeadline.delivered.length, 1);
      assert.equal(failure.answer.outcome, OUTCOME.UNAVAILABLE);
      assert.equal(failure.answer.missingFact, 'release_deadline',
        'the final actual client call is refused before dispatch at D');
    });
  });

test('fresh CREATE preserves prerequisite refusal and original wait rejection', async () => {
  const waitFailure = new Error('fresh wait owner refused');
  const host = createHost({clock: createClock({waitFailure}),
    reply: () => ({outcome: OUTCOME.DRAIN_PENDING, retryAfterMs: 1})});
  await withHost(host, async () => {
    await assert.rejects(host.run(), (error) => error === waitFailure);
    host.assertRequests();
    assert.equal(host.delivered.length, 1);
    assert.deepEqual(host.clock.waits, [1]);
  });
  for (const [deadline, identityExisted, message] of [
    [100, false, 'Fresh replica release deadline unavailable'],
    [105, true, 'Fresh replica release authority unavailable'],
  ]) {
    const refused = createHost({reply: () => {
      throw new Error('must not dispatch');
    }});
    await withHost(refused, async () => {
      await assert.rejects(refused.run(deadline, identityExisted), {message});
      assert.equal(refused.delivered.length, 0);
      assert.deepEqual(refused.clock.waits, []);
    });
  }
});


test('fresh CREATE refuses a safe delay that exceeds the original remaining budget', async () => {
  const host = createHost({reply: () => ({outcome: OUTCOME.DRAIN_PENDING, retryAfterMs: 6})});
  await withHost(host, async () => {
    const failure = await failureOf(host);
    host.assertRequests();
    assert.equal(failure.answer.outcome, OUTCOME.DRAIN_PENDING);
    assert.equal(host.delivered.length, 1);
    assert.deepEqual(host.clock.waits, []);
    assert.deepEqual(host.clock.reads, [100, 100, 100], 'guard refuses before preparation');
  });
});

test('completion fixture preserves primary and cleanup error identities', async () => {
  const primary = new Error('primary');
  const cleanup = new Error('cleanup');
  const failing = async () => {
    throw primary;
  };
  await assert.rejects(withHost({close: async () => {}}, failing), (error) => error === primary);
  await assert.rejects(withHost({close: async () => {
    throw cleanup;
  }}, failing), (error) =>
    error instanceof AggregateError && error.errors[0] === primary && error.errors[1] === cleanup);
});

test('fresh CREATE observes the routed outcome once per redirect and completion policy', async () => {
  for (const outcome of [OUTCOME.CUT_OVER, OUTCOME.OPERATOR_REQUIRED, OUTCOME.UNAVAILABLE]) {
    let reads = 0;
    const answer = {};
    // A repeated policy observation would reverse the observed disposition.
    // The non-enumerable getter separates policy reads from failure diagnostics.
    Object.defineProperty(answer, 'outcome', {get() {
      reads += 1;
      return reads <= 2 ? outcome : OUTCOME.NOT_LEADER;
    }});
    const host = createHost({reply: () => answer});
    await withHost(host, async () => {
      if (outcome === OUTCOME.CUT_OVER) {
        assert.equal(await host.run(), answer);
      } else {
        await assert.rejects(host.run(), (error) => {
          assert.ok(error.message.startsWith(FAILURE_PREFIX));
          assert.equal(error.participantReleaseAnswer, answer);
          const expectedCode = outcome === OUTCOME.UNAVAILABLE ?
            FRESH_CREATE_RELEASE_UNAVAILABLE : undefined;
          assert.equal(error.code, expectedCode);
          return true;
        });
      }
      host.assertRequests();
      assert.equal(host.delivered.length, 1);
      assert.equal(reads, 2, 'one redirect check and one completion policy observation');
      assert.deepEqual(host.clock.waits, []);
    });
  }
});
