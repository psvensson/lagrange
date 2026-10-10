/** Owned discovery and reentry of message-group membership debt.
 *
 * The subject is the production algorithm behind three triggers - the restart
 * scan, the periodic sweep and the replicated-row wake - driving the existing
 * recorder by operation ID through the real lane, real routers, a registered
 * handler and real native ports. Operation SQL and the service census are
 * explicit fixtures; this is not a physical network or distributed-SQL proof.
 * RECORDED is a historical fact here: every schedule asserts zero physical
 * callbacks and no new membership proposal.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MEMBERSHIP_PHASE as PHASE} from
  '../../src/rebalancer/replica-operation-message-group-membership-permit.js';
import {MEMBERSHIP_DEBT_RECOVERY_OUTCOME as DEBT, recoverMessageGroupMembershipDebtOperation,
  wakeMessageGroupMembershipDebtForRow} from
  '../../src/rebalancer/operation-workflow-message-group-membership-recovery.js';
import {recoverMessageGroupLearnerInline} from
  '../../src/rebalancer/operation-workflow-message-group-native-read.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {TARGET, NODE, SUCCESSOR} from '../test-helpers/learner-operation-fixture.js';
import {receiverFixture, workflowOwner, assertExactReceipt, expireClaim, withoutReceipt} from
  '../test-helpers/learner-recipient-fixture.js';

const RECEIPT_SET = 'SET message_group_membership_phase = ?';
const RECEIPT_STAMP = 'message_group_learner_stamp = ?';
function countReceiptSubmissions(fx) {
  let count = 0; const execute = fx.f.gateway.executeQuery;
  fx.f.gateway.executeQuery = (sql, ...args) => {
    if (String(sql).includes(RECEIPT_SET) && String(sql).includes(RECEIPT_STAMP)) count += 1;
    return execute(sql, ...args);
  };
  return () => count;
}
function countDeliveries(router) {
  let count = 0; const deliver = router.deliver.bind(router);
  router.deliver = (...args) => {
    count += 1; return deliver(...args);
  };
  return () => count;
}
const sweep = (owner) => owner.reconcileMessageGroupMembershipDebt();
const operationOf = (fx) => fx.f.repository.rowToOperation(fx.f.row());
const witness = (fx) => ({nodeId: SUCCESSOR, replicaId: fx.replicaId});
async function settled(predicate, ticks = 500) {
  for (let tick = 0; tick < ticks && !predicate(); tick += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  return predicate();
}
function assertNoEffect(fx, before, proposals) {
  assert.deepEqual(fx.f.row(), before, 'a refused or retained turn must not touch the row');
  assert.equal(fx.f.proposalCount(), proposals); assert.equal(fx.physical(), 0);
}
function discoveryFixture(t, options = {}) {
  return receiverFixture(t, {realLane: true, ...options});
}

test('owned discovery recovers the exact learner outcome from membership debt by operation ID',
  {timeout: 30000}, async (t) => {
    await t.test('the sweep records once and later sweeps read back without a native request',
      async (t) => {
        const fx = await discoveryFixture(t); fx.f.hostWitness(SUCCESSOR, fx.replicaId);
        const before = {...fx.f.row()}; const proposals = fx.f.proposalCount();
        const submissions = countReceiptSubmissions(fx);
        assert.deepEqual(await sweep(fx.owner),
          {available: true, found: 1, recorded: 1, retained: 0, refused: 0},
          'the restart-scan census must find the debt row and record its exact outcome');
        assertExactReceipt(fx, before, proposals); assert.equal(submissions(), 1);
        const deliveries = countDeliveries(fx.source);
        assert.deepEqual(await sweep(fx.owner),
          {available: true, found: 1, recorded: 1, retained: 0, refused: 0});
        assert.equal(deliveries(), 0, 'an already-recorded outcome must not be read again');
        assert.equal(submissions(), 1, 'an already-recorded outcome must not be written again');
        assert.equal((await fx.owner.recoverMessageGroupLearnerOutcomeFromRecipient(
          fx.f.request.operationId, witness(fx))).outcome, 'recorded',
        'the retained-lane entry must still work on the real coalescing lane');
        assert.equal(deliveries(), 0); assert.equal(fx.physical(), 0);
      });
    await t.test('the uncreated target is never the witness; a hosted replica appearing lets ' +
      'recovery proceed', async (t) => {
      const fx = await discoveryFixture(t); const before = {...fx.f.row()};
      const proposals = fx.f.proposalCount(); const deliveries = countDeliveries(fx.source);
      const recover = () => recoverMessageGroupMembershipDebtOperation(fx.owner, operationOf(fx));
      assert.equal((await recover()).outcome, DEBT.NO_HOSTED_WITNESS,
        'an empty service census names no witness');
      fx.f.hostWitness(SUCCESSOR, fx.replicaId, 'stopped');
      assert.equal((await recover()).outcome, DEBT.NO_HOSTED_WITNESS,
        'a stopped replica is not a hosted witness');
      fx.f.serviceRows.length = 0; fx.f.hostWitness(SUCCESSOR, TARGET);
      const refused = await recover();
      assert.equal(refused.outcome, DEBT.NO_HOSTED_WITNESS,
        'a services row for the operation target must not be selected as the witness');
      assert.equal(deliveries(), 0, 'no witness means no native request anywhere');
      assertNoEffect(fx, before, proposals);
      assert.deepEqual(await sweep(fx.owner),
        {available: true, found: 1, recorded: 0, retained: 1, refused: 0});
      fx.f.hostWitness(SUCCESSOR, fx.replicaId);
      const recovered = await recoverMessageGroupMembershipDebtOperation(fx.owner, operationOf(fx));
      assert.equal(recovered.outcome, DEBT.RECORDED);
      assert.deepEqual(recovered.witness, witness(fx),
        'the hosted non-target replica is the witness');
      assertExactReceipt(fx, before, proposals);
    });
    await t.test('duplicate and stale wakeups coalesce on the lane: one native read, one receipt',
      async (t) => {
        const fx = await discoveryFixture(t); fx.f.hostWitness(SUCCESSOR, fx.replicaId);
        const before = {...fx.f.row()}; const proposals = fx.f.proposalCount();
        const deliveries = countDeliveries(fx.source);
        const submissions = countReceiptSubmissions(fx);
        const row = fx.f.row();
        const outcomes = await Promise.all([
          sweep(fx.owner), sweep(fx.owner),
          recoverMessageGroupMembershipDebtOperation(fx.owner, operationOf(fx)),
          wakeMessageGroupMembershipDebtForRow(fx.owner, 'replica_operations', 'update', row),
        ]);
        assertExactReceipt(fx, before, proposals);
        assert.equal(deliveries(), 1, 'concurrent wakeups must share one native read');
        assert.equal(submissions(), 1, 'concurrent wakeups must share one receipt submission');
        for (const outcome of outcomes.slice(2)) {
          assert.ok([DEBT.RECORDED, DEBT.LANE_BUSY].includes(outcome.outcome),
            JSON.stringify(outcome));
        }
        assert.equal(outcomes[0].recorded + outcomes[0].retained, 1);
        assert.equal((await wakeMessageGroupMembershipDebtForRow(fx.owner, 'replica_operations',
          'update', {...fx.f.row(), message_group_membership_obligation_state: 'intent_recorded'})),
        null, 'a row without debt wakes nothing');
      });
    await t.test('ordinary failure keeps the debt; the sweep records the exact outcome without ' +
      'reopening it', async (t) => {
      const fx = await discoveryFixture(t); fx.f.hostWitness(SUCCESSOR, fx.replicaId);
      fx.f.execute(`UPDATE replica_operations SET status = ?, workflow_step = ?, completed_at = ?
        WHERE operation_id = ?`, [ReplicaStatus.FAILED, WORKFLOW_STEP.FAILED, fx.f.clock.now(),
        fx.f.request.operationId]);
      const before = {...fx.f.row()}; const proposals = fx.f.proposalCount();
      assert.deepEqual(await sweep(fx.owner),
        {available: true, found: 1, recorded: 1, retained: 0, refused: 0},
        'a terminal row that still owes its obligation must be found by the debt census');
      assertExactReceipt(fx, before, proposals);
      const after = fx.f.row();
      assert.equal(after.status, ReplicaStatus.FAILED);
      assert.equal(after.workflow_step, WORKFLOW_STEP.FAILED);
      assert.equal(after.completed_at, before.completed_at);
      assert.equal(after.message_group_membership_obligation_state, 'unknown',
        'recording the learner outcome never releases the membership obligation');
    });
    await t.test('holder replacement: a successor adopts the expired claim and records; the old ' +
      'holder waits', async (t) => {
      const fx = await discoveryFixture(t); fx.f.hostWitness(SUCCESSOR, fx.replicaId);
      const before = {...fx.f.row()}; const proposals = fx.f.proposalCount();
      expireClaim(fx.f);
      const successor = workflowOwner({nodeId: SUCCESSOR, repository: fx.f.repositoryFor(SUCCESSOR),
        messageRouter: fx.recipient, realLane: true, timeSource: fx.f.clock});
      const sourceDeliveries = countDeliveries(fx.source);
      assert.deepEqual(await sweep(successor),
        {available: true, found: 1, recorded: 1, retained: 0, refused: 0});
      const after = fx.f.row();
      const claim = JSON.parse(after.message_group_membership_owner_claim);
      assert.equal(claim.ownerNodeId, SUCCESSOR); assert.equal(claim.generation, 2,
        'adoption is the existing claim CAS taking the next generation');
      const unchanged = (row) => {
        const rest = withoutReceipt(row);
        delete rest.message_group_membership_owner_claim;
        return rest;
      };
      assert.deepEqual(unchanged(after), unchanged(before),
        'holder replacement changes only the claim and the three receipt columns');
      assert.equal(after.message_group_membership_phase, PHASE.LEARNER_COMMITTED);
      assert.equal(fx.f.proposalCount(), proposals); assert.equal(fx.physical(), 0);
      const stale = await recoverMessageGroupMembershipDebtOperation(fx.owner, operationOf(fx));
      assert.equal(stale.outcome, DEBT.HELD_ELSEWHERE,
        'the former holder must not act on a live successor claim');
      assert.equal(stale.holder, SUCCESSOR); assert.equal(sourceDeliveries(), 0);
      assert.deepEqual(fx.f.row(), after);
    });
    await t.test('shutdown starts no recording work and keeps the debt', async (t) => {
      const fx = await discoveryFixture(t); fx.f.hostWitness(SUCCESSOR, fx.replicaId);
      const before = {...fx.f.row()}; const proposals = fx.f.proposalCount();
      const deliveries = countDeliveries(fx.source); fx.shutOwner();
      assert.deepEqual(await sweep(fx.owner),
        {available: false, found: 0, recorded: 0, retained: 0, refused: 0});
      assert.equal(deliveries(), 0); assertNoEffect(fx, before, proposals);
    });
    await t.test('a lost SQL answer stays UNKNOWN; the next sweep resolves it by readback alone',
      async (t) => {
        const fx = await discoveryFixture(t); fx.f.hostWitness(SUCCESSOR, fx.replicaId);
        const before = {...fx.f.row()}; const proposals = fx.f.proposalCount();
        const submissions = countReceiptSubmissions(fx);
        const execute = fx.f.gateway.executeQuery;
        fx.f.gateway.executeQuery = async (sql, ...args) => {
          const answer = await execute(sql, ...args);
          if (String(sql).includes(RECEIPT_SET) && String(sql).includes(RECEIPT_STAMP)) {
            fx.f.failReads('replica_operations'); throw new Error('fixture: SQL answer lost');
          }
          return answer;
        };
        const lost = await recoverMessageGroupMembershipDebtOperation(fx.owner, operationOf(fx));
        assert.equal(lost.outcome, DEBT.RETAINED); assert.equal(lost.recorder, 'unknown',
          'a lost answer with no readback is UNKNOWN, never success or noncommitment');
        assert.equal(submissions(), 1);
        assert.equal(fx.f.row().message_group_membership_phase, PHASE.LEARNER_COMMITTED,
          'the lost answer had in fact committed');
        fx.f.failReads(null); const deliveries = countDeliveries(fx.source);
        assert.deepEqual(await sweep(fx.owner),
          {available: true, found: 1, recorded: 1, retained: 0, refused: 0});
        assert.equal(deliveries(), 0, 'readback of the committed receipt needs no native request');
        assert.equal(submissions(), 1, 'readback must not write again');
        assertExactReceipt(fx, before, proposals);
      });
    await t.test('promotion and removal debt belong to later owners: this discovery refuses to ' +
      'touch them', async (t) => {
      const fx = await discoveryFixture(t); fx.f.hostWitness(SUCCESSOR, fx.replicaId);
      fx.f.execute(
        'UPDATE replica_operations SET message_group_membership_phase = ? WHERE operation_id = ?',
        [PHASE.PROMOTION_IN_FLIGHT, fx.f.request.operationId]);
      const before = {...fx.f.row()}; const proposals = fx.f.proposalCount();
      const deliveries = countDeliveries(fx.source);
      const result = await recoverMessageGroupMembershipDebtOperation(fx.owner, operationOf(fx));
      assert.equal(result.outcome, DEBT.PHASE_NOT_OWNED);
      assert.equal(deliveries(), 0); assertNoEffect(fx, before, proposals);
    });
    await t.test('a hosted witness appearing in the replicated services rows wakes the lane holder',
      async (t) => {
        const fx = await discoveryFixture(t); const before = {...fx.f.row()};
        const proposals = fx.f.proposalCount(); const submissions = countReceiptSubmissions(fx);
        assert.deepEqual(await sweep(fx.owner),
          {available: true, found: 1, recorded: 0, retained: 1, refused: 0});
        let laneReads = 0; const repository = fx.owner.repository;
        const readLane = repository.queryAuthoritativeOperationByMessageGroupMembershipLane
          .bind(repository);
        repository.queryAuthoritativeOperationByMessageGroupMembershipLane = (...args) => {
          laneReads += 1; return readLane(...args);
        };
        const stopped = fx.f.hostWitness(SUCCESSOR, fx.replicaId, 'stopped');
        fx.owner.handleObservedReplicaStateChange('services', 'insert', stopped);
        await settled(() => false, 20);
        assert.equal(laneReads, 0, 'a stopped replica is not a hosted witness and wakes nothing');
        assert.equal(submissions(), 0);
        fx.f.serviceRows.length = 0;
        const row = fx.f.hostWitness(SUCCESSOR, fx.replicaId);
        fx.owner.handleObservedReplicaStateChange('services', 'insert', row);
        assert.equal(await settled(() =>
          fx.f.row().message_group_membership_phase === PHASE.LEARNER_COMMITTED), true,
        'the services-row wake must drive the same algorithm to the recorded outcome');
        assertExactReceipt(fx, before, proposals); assert.equal(submissions(), 1);
        fx.owner.handleObservedReplicaStateChange('services', 'insert',
          {...row, group_id: 'another-group'});
        await settled(() => false, 20);
        assert.equal(submissions(), 1, 'a hosted row of another group wakes nothing here');
      });
    await t.test('the inline recorder refuses a caller that does not hold the lane', async (t) => {
      const fx = await discoveryFixture(t); fx.f.hostWitness(SUCCESSOR, fx.replicaId);
      const before = {...fx.f.row()}; const proposals = fx.f.proposalCount();
      const deliveries = countDeliveries(fx.source);
      assert.equal((await recoverMessageGroupLearnerInline(fx.owner, fx.f.request.operationId,
        witness(fx))).outcome, 'invalid', 'the inline entry never acquires or bypasses the lane');
      assert.equal(deliveries(), 0); assertNoEffect(fx, before, proposals);
      assert.equal(NODE, fx.owner.nodeId);
    });
  });
