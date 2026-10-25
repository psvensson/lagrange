// Real proposal queue and command owners, with the controllable consensus port.
// Parked ordinary writes must not occupy the capacity needed to release them.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {PARTICIPANT_TRANSACTION_DECISION as DECISION} from
  '../../src/partition/partition-participant-transaction-constants.js';
import {PARTITION_SERVICE_OPERATION} from '../../src/partition/partition-service-constants.js';
import {buildCdcAcknowledgementCommand, cdcObligationEventKeyDigest, readOwedCdcObligations} from
  '../../src/partition/partition-cdc-obligation-ledger.js';
import {proposeCdcAcknowledgement} from '../../src/partition/partition-cdc-obligation.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../../src/partition/partition-write-kernel.js';
import {
  CDC_INSERT_SQL, applyCommitted, awaitProposal, bindingOf, clearFixtureSingletons, commitMessage,
  generationOf, identityOf, operationOf, prepareCommandOf, resetFixtureSingletons,
  send, settleTicks, shutdownAll, startLeader, track, txMessage,
} from '../test-helpers/participant-transaction-fixture.js';
import {CDC, fillDebt, write} from '../test-helpers/cdc-owed-admission-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

function acknowledgementOf(leader, owed) {
  return buildCdcAcknowledgementCommand(leader.partitionId, [{logIndex: owed.logIndex,
    events: [{ordinal: owed.ordinal, eventKeyDigest: cdcObligationEventKeyDigest(owed.eventKey)}],
  }], {timestamp: leader.hlcClock.now().toString(), proposedBy: leader.replicaId, proposedAt: 0});
}

for (const decisionFirst of [false, true]) {
  test(`drain reservation protects both classes, decision-first=${decisionFirst}`, async () => {
    const {leader, proposed} = await startLeader({...CDC, timeSource: new VirtualTimeSource()});
    try {
      fillDebt(leader, 3);
      const tx = identityOf('drain-reserved');
      const prepare = prepareCommandOf(tx, [operationOf({id: 'prepared', value: 'v'},
        {sql: CDC_INSERT_SQL})], generationOf(leader));
      assert.equal(applyCommitted(leader, prepare), null);
      const parked = Array.from({length: leader.proposalQueue.maxCapacity},
        (_unused, index) => write(leader, `parked-${index}`));
      await settleTicks();
      assert.ok(parked.some((pending) =>
        pending.value?.failureCode === PARTITION_WRITE_LEADERSHIP_REFUSAL.BACKPRESSURE),
      'ordinary work cannot fill every queue slot');
      const unrelated = identityOf('unprepared-tombstone');
      const tombstone = await send(leader, txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK,
        unrelated, bindingOf(unrelated, DECISION.ROLLBACK, null)));
      assert.equal(tombstone.failureCode, PARTITION_WRITE_LEADERSHIP_REFUSAL.BACKPRESSURE,
        'an unprepared rollback cannot claim the prepared decision slot');
      const acknowledgements = readOwedCdcObligations(leader.db)
        .map((owed) => acknowledgementOf(leader, owed));
      const proposeDecision = () => track(send(leader, commitMessage(tx, prepare.preparedDigest)));
      const pendingDecision = decisionFirst ? proposeDecision() : null;
      const pendingAcks = acknowledgements.slice(0, 2)
        .map((acknowledgement) => track(proposeCdcAcknowledgement(leader, acknowledgement)));
      const decision = pendingDecision ?? proposeDecision();
      const repeatedDecision = proposeDecision();
      const repeatedAck = track(proposeCdcAcknowledgement(leader, acknowledgements[0]));
      const extraAck = await proposeCdcAcknowledgement(leader, acknowledgements[2]);
      assert.equal(extraAck.failureCode, PARTITION_WRITE_LEADERSHIP_REFUSAL.BACKPRESSURE);
      const decisionCommand = await awaitProposal(proposed,
        (command) => command.transactionId === tx.transactionId);
      assert.ok(decisionCommand);
      const decisionProposals = () => proposed.filter((command) =>
        command.entryId === decisionCommand.entryId).length;
      assert.equal(decisionProposals(), 1);
      for (const ack of acknowledgements.slice(0, 2)) {
        assert.equal(proposed.filter((command) => command.entryId === ack.entryId).length, 1,
          'duplicate acknowledgement shares its existing slot');
      }
      assert.equal(leader.proposalQueue.size, leader.proposalQueue.maxCapacity);
      for (const ack of acknowledgements.slice(0, 2)) {
        assert.equal(applyCommitted(leader, ack), null);
      }
      assert.equal(applyCommitted(leader, decisionCommand), null);
      await settleTicks();
      assert.ok(pendingAcks.every((pending) => pending.value?.success === true));
      assert.equal(repeatedAck.value?.success, true);
      assert.equal(decision.value?.success, true);
      assert.equal(repeatedDecision.value?.success, true);
      const count = decisionProposals();
      const late = await send(leader, commitMessage(tx, prepare.preparedDigest));
      assert.equal(late.success, true);
      assert.equal(decisionProposals(), count, 'late settled decision uses its outcome, no new slot');
    } finally {
      await shutdownAll(leader);
    }
  });
}
