// Deterministic canonical CLIENT deadline boundary. The transport returns a
// genuinely classified delivered release result, after crossing one owner
// TimeSource clock while the caller awaits. This is not a synthetic cutover
// checker or a timer-driven fake consensus/group.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {askParticipantRelease, requestParticipantRelease} from
  '../../src/node/participant-release-client.js';
import {PARTICIPANT_RELEASE_ACTION as ACTION,
  PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_MISSING_FACT as MISSING_FACT,
  PARTICIPANT_RELEASE_RESULT_FIELD as RESULT_FIELD} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';

function heldDeliveredReply({lateByMs, deadlineAtMs = 1100, outcome = OUTCOME.CUT_OVER}) {
  const clock = new VirtualTimeSource({startMs: 1000});
  const sent = [];
  const owner = {
    nodeId: 'deadline-caller',
    timeSource: clock,
    messageRouter: {
      async deliver(address, payload, options) {
        sent.push({address, payload, options});
        clock.advance(lateByMs);
        return Object.freeze({acknowledged: true, deliveryState: 'delivered',
          [RESULT_FIELD]: Object.freeze({outcome, partitionId: payload.partitionId,
            releaseId: 'actual-delivered-caller-envelope'})});
      },
    },
  };
  return {clock, owner, sent, request: Object.freeze({
    partitionId: 'deadline-partition-p1',
    replicaId: 'deadline-replica-r1',
    action: ACTION.RELEASE,
    deadlineAtMs,
  })};
}

test('delivered CUT_OVER after original caller deadline cannot authorize success',
  async () => {
    const {owner, sent, request, clock} = heldDeliveredReply({lateByMs: 101});
    const answer = await askParticipantRelease(owner, owner.nodeId, request);
    assert.equal(sent.length, 1,
      'real original delivery entered with one positive pre-send budget');
    assert.equal(sent[0].options.timeoutMs, 100,
      'transport saw exactly the original remaining deadline, no renewal');
    assert.equal(clock.now(), 1101,
      'the SAME original source clock crossed the boundary during delivery');
    assert.equal(answer.outcome, OUTCOME.UNAVAILABLE,
      'a late delivered CUT_OVER is not fresh caller authorization');
    assert.equal(answer.missingFact, MISSING_FACT.RELEASE_DEADLINE,
      'the clock owner identifies the exhausted absolute deadline');
  });

test('exact deadline equality must refuse, while predeadline outcome stays positive',
  async () => {
    const at = heldDeliveredReply({lateByMs: 100});
    const refused = await askParticipantRelease(at.owner, at.owner.nodeId, at.request);
    assert.equal(at.sent.length, 1);
    assert.equal(at.clock.now(), at.request.deadlineAtMs);
    assert.equal(refused.outcome, OUTCOME.UNAVAILABLE,
      'deadline equality is spent, not an extra writable instant');
    assert.equal(refused.missingFact, MISSING_FACT.RELEASE_DEADLINE);

    const earlier = heldDeliveredReply({lateByMs: 99});
    const onTime = await askParticipantRelease(earlier.owner,
      earlier.owner.nodeId, earlier.request);
    assert.equal(onTime.outcome, OUTCOME.CUT_OVER,
      'a truly timely durable outcome remains acknowledged unchanged');
    assert.equal(earlier.sent.length, 1);
    assert.equal(earlier.clock.now(), 1099);
  });

test('late NOT_LEADER cannot induce an authority redirect after caller expiry',
  async () => {
    const {owner, request, clock, sent} = heldDeliveredReply({
      lateByMs: 101, outcome: OUTCOME.NOT_LEADER,
    });
    const answer = await requestParticipantRelease(owner, request);
    assert.equal(clock.now(), 1101);
    assert.equal(sent.length, 1,
      'no second route is dispatched with an expired original deadline');
    assert.equal(answer.outcome, OUTCOME.UNAVAILABLE);
    assert.equal(answer.missingFact, MISSING_FACT.RELEASE_DEADLINE);
  });

test('a pre-send exhausted deadline admits zero actual transport deliveries',
  async () => {
    const {owner, request, sent} = heldDeliveredReply({
      lateByMs: 0, deadlineAtMs: 1000,
    });
    const answer = await askParticipantRelease(owner, owner.nodeId, request);
    assert.equal(sent.length, 0);
    assert.equal(answer.outcome, OUTCOME.UNAVAILABLE);
    assert.equal(answer.missingFact, MISSING_FACT.RELEASE_DEADLINE);
  });
