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
import {MEMBERSHIP_PHASE as PHASE, MEMBERSHIP_DEBT_RECOVERY_OUTCOME as DEBT} from
  '../../src/rebalancer/replica-operation-message-group-membership-permit.js';
import {DEBT_CENSUS, wakeMessageGroupMembershipDebtForRow} from
  '../../src/rebalancer/operation-workflow-message-group-membership-recovery.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import * as recordedRow from
  '../../src/rebalancer/replica-operation-message-group-membership-authorization.js';
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
// The periodic sweep reads the replicated cache as its hint; the restart scan
// reads the authoritative census. Both are production entries.
const sweep = (owner, census = DEBT_CENSUS.AUTHORITATIVE) =>
  owner.reconcileMessageGroupMembershipDebt(census);
// The replicated-row wake is the per-operation production entry.
const wakeRow = (owner, row) => wakeMessageGroupMembershipDebtForRow(
  owner, SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, 'update', row);
const summaryOf = (fields) => ({available: true, found: 1, recorded: 0, settled: 0,
  retained: 0, refused: 0, ...fields});
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
// Typed debt diagnoses by level: the event each log call carries.
function captureLog(owner) {
  const logged = {debug: [], info: [], warn: []};
  owner.logger = {error() {}, debug: (_m, event) => logged.debug.push(event),
    info: (_m, event) => logged.info.push(event), warn: (_m, event) => logged.warn.push(event)};
  return logged;
}
function countCalls(target, method) {
  let count = 0; const original = target[method].bind(target);
  target[method] = (...args) => {
    count += 1; return original(...args);
  };
  return () => count;
}
const updateRow = (fx, column, value) => fx.f.execute(
  `UPDATE replica_operations SET ${column} = ? WHERE operation_id = ?`,
  [value, fx.f.request.operationId]);
const reencode = (encoded) => JSON.stringify(JSON.parse(encoded), null, 1);
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
          summaryOf({recorded: 1}),
          'the restart-scan census must find the debt row and record its exact outcome');
        assertExactReceipt(fx, before, proposals); assert.equal(submissions(), 1);
        const deliveries = countDeliveries(fx.source);
        assert.deepEqual(await sweep(fx.owner), summaryOf({settled: 1}),
          'a row whose exact outcome is durable owes this owner nothing more');
        assert.equal(deliveries(), 0, 'an already-recorded outcome must not be read again');
        assert.equal(submissions(), 1, 'an already-recorded outcome must not be written again');
        assert.deepEqual(await sweep(fx.owner, DEBT_CENSUS.CACHE_HINT),
          {available: true, found: 0, recorded: 0, settled: 0, retained: 0, refused: 0},
          'the periodic sweep reads the replicated cache as its hint; an empty cache costs nothing');
        assert.equal((await fx.owner.recoverMessageGroupLearnerOutcomeFromRecipient(
          fx.f.request.operationId, witness(fx))).outcome, 'recorded',
        'the retained-lane entry must still work on the real coalescing lane');
        assert.equal(deliveries(), 0); assert.equal(fx.physical(), 0);
      });
    await t.test('the uncreated target is never the witness; a hosted replica appearing lets ' +
      'recovery proceed', async (t) => {
      const fx = await discoveryFixture(t); const before = {...fx.f.row()};
      const proposals = fx.f.proposalCount(); const deliveries = countDeliveries(fx.source);
      const recover = () => wakeRow(fx.owner, fx.f.row());
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
        summaryOf({retained: 1}));
      fx.f.hostWitness(SUCCESSOR, fx.replicaId);
      const recovered = await wakeRow(fx.owner, fx.f.row());
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
          wakeRow(fx.owner, fx.f.row()),
          wakeRow(fx.owner, row),
        ]);
        assertExactReceipt(fx, before, proposals);
        assert.equal(deliveries(), 1, 'concurrent wakeups must share one native read');
        assert.equal(submissions(), 1, 'concurrent wakeups must share one receipt submission');
        for (const outcome of outcomes.slice(2)) {
          assert.ok([DEBT.RECORDED, DEBT.LANE_BUSY].includes(outcome.outcome),
            JSON.stringify(outcome));
        }
        assert.equal(outcomes[0].recorded + outcomes[0].retained, 1);
        assert.equal((await wakeRow(fx.owner, {...fx.f.row(), message_group_membership_obligation_state: 'intent_recorded'})),
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
        summaryOf({recorded: 1}),
        'a terminal row that still owes its obligation must be found by the debt census');
      assertExactReceipt(fx, before, proposals);
      const after = fx.f.row();
      assert.equal(after.status, ReplicaStatus.FAILED);
      assert.equal(after.workflow_step, WORKFLOW_STEP.FAILED);
      assert.equal(after.completed_at, before.completed_at);
      assert.equal(after.message_group_membership_obligation_state, 'unknown',
        'recording the learner outcome never releases the membership obligation');
    });
    await t.test('holder replacement: a live successor claim holds the old owner off; an ' +
      'expired one is adopted and recorded', async (t) => {
      const fx = await discoveryFixture(t); fx.f.hostWitness(SUCCESSOR, fx.replicaId);
      const before = {...fx.f.row()}; const proposals = fx.f.proposalCount();
      const sourceDeliveries = countDeliveries(fx.source);
      // A successor takes the expired claim through the existing claim CAS.
      expireClaim(fx.f);
      const successorRepository = fx.f.repositoryFor(SUCCESSOR);
      const claimed = await successorRepository.claimMessageGroupMembershipOwner({
        operationId: fx.f.request.operationId, identity: fx.f.request.identity,
        expectedClaim: fx.f.request.executionClaim});
      assert.equal(claimed.outcome, 'recorded');
      const held = await wakeRow(fx.owner, fx.f.row());
      assert.equal(held.outcome, DEBT.HELD_ELSEWHERE,
        'the former holder must not act on a live successor claim');
      assert.equal(held.holder, SUCCESSOR); assert.equal(sourceDeliveries(), 0);
      assert.equal(fx.f.row().message_group_membership_phase, PHASE.LEARNER_IN_FLIGHT);
      // The successor's own claim lapses too; its sweep adopts the next generation.
      fx.f.clock.advance(JSON.parse(claimed.claim).expiresAt - fx.f.clock.now() + 1);
      const successor = workflowOwner({nodeId: SUCCESSOR, repository: successorRepository,
        messageRouter: fx.recipient, realLane: true, timeSource: fx.f.clock});
      assert.deepEqual(await sweep(successor), summaryOf({recorded: 1}));
      const after = fx.f.row();
      const claim = JSON.parse(after.message_group_membership_owner_claim);
      assert.equal(claim.ownerNodeId, SUCCESSOR); assert.equal(claim.generation, 3,
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
      assert.equal(await wakeRow(fx.owner, fx.f.row()), null,
        'a settled row\'s own replicated change owes no turn and wakes nothing');
      assert.deepEqual(await sweep(fx.owner), summaryOf({settled: 1}),
        'the former holder reads the successor\'s receipt as settled, touching nothing');
      assert.equal(sourceDeliveries(), 0); assert.deepEqual(fx.f.row(), after);
    });
    await t.test('shutdown starts no recording work and keeps the debt', async (t) => {
      const fx = await discoveryFixture(t); fx.f.hostWitness(SUCCESSOR, fx.replicaId);
      const before = {...fx.f.row()}; const proposals = fx.f.proposalCount();
      const deliveries = countDeliveries(fx.source); fx.shutOwner();
      assert.deepEqual(await sweep(fx.owner),
        {available: false, found: 0, recorded: 0, settled: 0, retained: 0, refused: 0});
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
        const lost = await wakeRow(fx.owner, fx.f.row());
        assert.equal(lost.outcome, DEBT.RETAINED); assert.equal(lost.recorder, 'unknown',
          'a lost answer with no readback is UNKNOWN, never success or noncommitment');
        assert.equal(submissions(), 1);
        assert.equal(fx.f.row().message_group_membership_phase, PHASE.LEARNER_COMMITTED,
          'the lost answer had in fact committed');
        fx.f.failReads(null); const deliveries = countDeliveries(fx.source);
        assert.deepEqual(await sweep(fx.owner), summaryOf({settled: 1}),
          'the committed receipt is read back as settled debt');
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
      const deliveries = countDeliveries(fx.source); const logged = captureLog(fx.owner);
      assert.equal(await wakeRow(fx.owner, fx.f.row()), null,
        'later-phase debt owes this owner no turn, so its replicated change wakes nothing');
      assert.deepEqual(await sweep(fx.owner), summaryOf({retained: 1}));
      assert.deepEqual(logged.debug.map((event) => event.outcome), [DEBT.PHASE_NOT_OWNED]);
      assert.equal(deliveries(), 0); assertNoEffect(fx, before, proposals);
    });
    await t.test('a hosted witness appearing in the replicated services rows wakes the lane holder',
      async (t) => {
        const fx = await discoveryFixture(t); const before = {...fx.f.row()};
        const proposals = fx.f.proposalCount(); const submissions = countReceiptSubmissions(fx);
        assert.deepEqual(await sweep(fx.owner),
          summaryOf({retained: 1}));
        let laneReads = 0; const repository = fx.owner.repository;
        const readLane = repository.queryAuthoritativeOperationByMessageGroupMembershipLane
          .bind(repository);
        repository.queryAuthoritativeOperationByMessageGroupMembershipLane = (...args) => {
          laneReads += 1; return readLane(...args);
        };
        // The owing row is listed first, so only the ACTIVE check keeps the
        // stopped replica from waking the lane.
        fx.f.cacheOperationRow();
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
        // The cache still lists this group's lane holder as owing; a hosted row
        // of another group must not read any lane on that hint.
        await settled(() => false, 20); const lanesRead = laneReads;
        fx.owner.handleObservedReplicaStateChange('services', 'insert',
          {...row, group_id: 'another-group'});
        await settled(() => false, 20);
        assert.equal(laneReads, lanesRead,
          'an owing operation on another group\'s lane wakes no lane read for this group');
        assert.equal(submissions(), 1, 'a hosted row of another group wakes nothing here');
      });
    await t.test('a settled row is never re-adopted: no claim write, no witness, no log churn',
      async (t) => {
        const fx = await discoveryFixture(t); fx.f.hostWitness(SUCCESSOR, fx.replicaId);
        assert.deepEqual(await sweep(fx.owner), summaryOf({recorded: 1}));
        const recorded = {...fx.f.row()}; expireClaim(fx.f);
        let claimWrites = 0; const execute = fx.f.gateway.executeQuery;
        fx.f.gateway.executeQuery = (sql, ...args) => {
          if (String(sql).includes('message_group_membership_owner_claim = ?')) claimWrites += 1;
          return execute(sql, ...args);
        };
        const deliveries = countDeliveries(fx.source); const summaries = [];
        for (let cycle = 0; cycle < 3; cycle += 1) summaries.push(await sweep(fx.owner));
        assert.equal(claimWrites, 0, 'an expired claim on a settled row is not re-adopted');
        assert.deepEqual(summaries, summaries.map(() => summaryOf({settled: 1})));
        assert.equal(deliveries(), 0); assert.deepEqual(fx.f.row(), recorded);
        assert.equal(JSON.parse(fx.f.row().message_group_membership_owner_claim).generation, 1);
      });
    await t.test('an unreachable hosted source does not starve recovery: the witness rotates',
      async (t) => {
        const fx = await discoveryFixture(t); const before = {...fx.f.row()};
        const proposals = fx.f.proposalCount();
        // The source replica is hosted on a node whose handler never registered.
        fx.f.hostWitness(NODE, fx.f.leader); fx.f.hostWitness(SUCCESSOR, fx.replicaId);
        const first = await wakeRow(fx.owner, fx.f.row());
        assert.equal(first.outcome, DEBT.RETAINED, 'the source is preferred but unreachable');
        assert.deepEqual(first.witness, {nodeId: NODE, replicaId: fx.f.leader});
        assert.equal(first.recorder, 'unavailable');
        const second = await wakeRow(fx.owner, fx.f.row());
        assert.equal(second.outcome, DEBT.RECORDED, 'the next turn asks another hosted replica');
        assert.deepEqual(second.witness, witness(fx));
        assertExactReceipt(fx, before, proposals);
      });
    await t.test('the restart scan recovers debt from the authoritative census alone', async (t) => {
      const fx = await discoveryFixture(t); fx.f.hostWitness(SUCCESSOR, fx.replicaId);
      const before = {...fx.f.row()}; const proposals = fx.f.proposalCount();
      // The reservation owner is not part of this fixture; the restart scan's
      // last step is stubbed so the scan can run to its summary.
      fx.owner.reconcileReservations = async () => ({expired: 0, orphansReleased: 0});
      const emitted = []; fx.owner.emitter = {emit: (...args) => emitted.push(args[0])};
      const result = await fx.owner.handleRecovery();
      assert.deepEqual(result.membershipDebt, summaryOf({recorded: 1}),
        'handleRecovery must census and recover membership debt with the authoritative read');
      assert.ok(emitted.length > 0, 'the scan still reaches its completion event');
      assertExactReceipt(fx, before, proposals);
    });
    await t.test('the periodic sweep reads the replicated cache as its hint and re-reads only ' +
      'what the cache lists', async (t) => {
      const fx = await discoveryFixture(t); fx.f.hostWitness(SUCCESSOR, fx.replicaId);
      const before = {...fx.f.row()}; const proposals = fx.f.proposalCount();
      const operationReads = () => fx.f.reads.filter((read) =>
        read.table === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS).length;
      const readsBefore = operationReads();
      assert.deepEqual(await fx.owner.reconcileMessageGroupMembershipDebt(),
        {available: true, found: 0, recorded: 0, settled: 0, retained: 0, refused: 0},
        'the default census is the cache hint');
      assert.equal(operationReads(), readsBefore,
        'a cache listing no debt costs no authoritative operation read');
      fx.f.cacheOperationRow();
      assert.deepEqual(await fx.owner.reconcileMessageGroupMembershipDebt(),
        summaryOf({recorded: 1}), 'a listed debt row is re-read and recovered');
      assert.ok(operationReads() > readsBefore, 'the listed candidate is read authoritatively');
      assertExactReceipt(fx, before, proposals);
      fx.f.cacheOperationRow(); const readsAfter = operationReads();
      assert.deepEqual(await fx.owner.reconcileMessageGroupMembershipDebt(),
        {available: true, found: 0, recorded: 0, settled: 0, retained: 0, refused: 0},
        'a listed row whose initial action is recorded is not a candidate');
      assert.equal(operationReads(), readsAfter, 'a settled row costs no read per sweep');
    });
    await t.test('a committed phase with an incoherent record is surfaced, never settled',
      async (t) => {
        const fx = await discoveryFixture(t); fx.f.hostWitness(SUCCESSOR, fx.replicaId);
        assert.deepEqual(await sweep(fx.owner), summaryOf({recorded: 1}));
        fx.f.execute('UPDATE replica_operations SET message_group_learner_stamp = ? ' +
          'WHERE operation_id = ?', [JSON.stringify({forged: true}), fx.f.request.operationId]);
        const forged = {...fx.f.row()}; const logged = captureLog(fx.owner);
        assert.deepEqual(await sweep(fx.owner), summaryOf({refused: 1}),
          'an incoherent recorded stamp is not settled');
        assert.equal(logged.warn.length, 1, 'owned repair is surfaced');
        assert.equal(logged.warn[0].outcome, DEBT.INVALID_ROW);
        assert.equal(logged.warn[0].field, 'messageGroupLearnerStamp');
        assert.deepEqual(fx.f.row(), forged); assert.equal(fx.physical(), 0);
      });
    await t.test('a census that throws is reported by the restart scan, which still completes',
      async (t) => {
        const fx = await discoveryFixture(t);
        fx.owner.reconcileReservations = async () => ({expired: 0, orphansReleased: 0});
        const emitted = []; fx.owner.emitter = {emit: (...args) => emitted.push(args[0])};
        fx.owner.repository.queryAuthoritativeMessageGroupMembershipDebtOperations = async () => {
          throw new Error('fixture: census unavailable');
        };
        const result = await fx.owner.handleRecovery();
        assert.deepEqual(result.membershipDebt,
          {available: false, error: 'fixture: census unavailable'});
        assert.ok(emitted.length > 0, 'the scan reaches its completion event');
      });
    await t.test('the inline recorder refuses a caller that does not hold the lane', async (t) => {
      const fx = await discoveryFixture(t); fx.f.hostWitness(SUCCESSOR, fx.replicaId);
      const before = {...fx.f.row()}; const proposals = fx.f.proposalCount();
      const deliveries = countDeliveries(fx.source);
      const ownerKey = fx.owner.getOperationOwnerSingleFlightKey(fx.f.request.operationId);
      assert.equal((await recoverMessageGroupLearnerInline(fx.owner, fx.f.request.operationId,
        witness(fx), {ownerKey})).outcome, 'invalid',
      'the inline entry never acquires or bypasses the lane');
      // Someone else holds this operation's lane; a turn for another key must
      // not be able to borrow it.
      const borrowed = await fx.owner.operationWorkflowRunExclusive(ownerKey, async () => {
        // The lane registers its holder after the factory returns; yield so the
        // nested turn below really runs while this operation's lane is held.
        await settled(() => false, 1);
        assert.equal(fx.owner.isOperationOwnerLaneHeld(fx.f.request.operationId), true);
        return fx.owner.operationWorkflowRunExclusive('other-key', (turn) =>
          recoverMessageGroupLearnerInline(fx.owner, fx.f.request.operationId, witness(fx), turn));
      });
      assert.equal(borrowed.outcome, 'invalid',
        'a turn for another key cannot borrow this operation\'s lane');
      assert.equal(deliveries(), 0); assertNoEffect(fx, before, proposals);
      assert.equal(NODE, fx.owner.nodeId);
    });
    await t.test('D1: one recorded-row validity predicate serves discovery and the recorder; a ' +
      'settled fact survives lease expiry and a foreign boot', async (t) => {
      const fx = await discoveryFixture(t); fx.f.hostWitness(SUCCESSOR, fx.replicaId);
      assert.deepEqual(await sweep(fx.owner), summaryOf({recorded: 1}));
      const recorded = {...fx.f.row()}; const identity = JSON.parse(fx.f.request.identity);
      const valid = () => recordedRow.recordedLearnerFactIsValid(
        fx.f.repository.rowToOperation(fx.f.row()), identity, fx.f.request.identity);
      const defects = [
        ['message_group_voter_stamp', recorded.message_group_learner_stamp],
        ['message_group_removal_stamp', recorded.message_group_learner_stamp],
        ['message_group_learner_stamp', reencode(recorded.message_group_learner_stamp)],
        ['message_group_membership_permit', reencode(recorded.message_group_membership_permit)],
        ['message_group_source_lifecycle_claim', JSON.stringify({
          ...JSON.parse(recorded.message_group_source_lifecycle_claim), createAttemptToken: 'x'})],
      ];
      const deliveries = countDeliveries(fx.source);
      for (const [column, value] of defects) {
        updateRow(fx, column, value); const defective = {...fx.f.row()};
        const logged = captureLog(fx.owner);
        assert.deepEqual(await sweep(fx.owner), summaryOf({refused: 1}),
          `discovery must not settle a recorded row with a defective ${column}`);
        assert.equal(logged.warn[0]?.outcome, DEBT.INVALID_ROW, column);
        assert.equal(logged.warn[0].field, 'messageGroupLearnerStamp', column);
        assert.equal((await fx.owner.recoverMessageGroupLearnerOutcomeFromRecipient(
          fx.f.request.operationId, witness(fx))).outcome, 'conflict',
        `the recorder's readback must refuse the same defective ${column}`);
        assert.equal(valid(), false, `the shared predicate refuses the defective ${column}`);
        assert.deepEqual(fx.f.row(), defective, 'a defective record is never rewritten');
        updateRow(fx, column, recorded[column]);
      }
      assert.deepEqual(fx.f.row(), recorded); assert.equal(valid(), true);
      // The historical fact carries no live claim/lease/boot gate.
      expireClaim(fx.f); const foreign = fx.f.repositoryFor(NODE);
      foreign.membershipOwnerBootIncarnation = 2;
      const restarted = workflowOwner({nodeId: NODE, repository: foreign,
        messageRouter: fx.source, realLane: true, timeSource: fx.f.clock});
      const claims = countCalls(foreign, 'claimMessageGroupMembershipOwner');
      assert.equal(valid(), true, 'an expired lease does not unsettle a recorded fact');
      assert.deepEqual(await sweep(restarted), summaryOf({settled: 1}),
        'a settled fact is recognized after lease expiry under another boot incarnation');
      assert.equal(claims(), 0); assert.equal(deliveries(), 0);
      assert.deepEqual(fx.f.row(), recorded); assert.equal(fx.physical(), 0);
    });
    await t.test('D2: an invalid phase/permit pair is diagnosed before claim work, stays out of ' +
      'the hint and keeps its debt', async (t) => {
      const fx = await discoveryFixture(t); fx.f.hostWitness(SUCCESSOR, fx.replicaId);
      const inFlight = fx.f.row().message_group_membership_permit;
      const committed = JSON.stringify({...JSON.parse(inFlight),
        permitState: 'committed', proposalIndex: 2});
      const pairs = [[PHASE.LEARNER_COMMITTED, inFlight], [PHASE.LEARNER_IN_FLIGHT, committed]];
      expireClaim(fx.f); const deliveries = countDeliveries(fx.source);
      const claims = countCalls(fx.owner.repository, 'claimMessageGroupMembershipOwner');
      const proposals = fx.f.proposalCount();
      for (const [phase, permit] of pairs) {
        updateRow(fx, 'message_group_membership_phase', phase);
        updateRow(fx, 'message_group_membership_permit', permit);
        const before = {...fx.f.row()}; const logged = captureLog(fx.owner);
        assert.deepEqual(await sweep(fx.owner), summaryOf({refused: 1}), phase);
        assert.equal(claims(), 0, `an invalid ${phase} pair must not touch the claim`);
        assert.deepEqual(logged.warn.map((event) => [event.outcome, event.field]),
          [[DEBT.INVALID_ROW, 'messageGroupMembershipPermit']], 'a typed diagnosis');
        fx.f.cacheOperationRow();
        assert.deepEqual(await sweep(fx.owner, DEBT_CENSUS.CACHE_HINT),
          {available: true, found: 0, recorded: 0, settled: 0, retained: 0, refused: 0},
          'an invalid pair is not a periodic hint candidate');
        assert.equal(await wakeRow(fx.owner, fx.f.row()), null,
          'an invalid pair\'s own replicated change wakes nothing');
        assertNoEffect(fx, before, proposals);
        assert.equal(fx.f.row().message_group_membership_obligation_state, 'unknown',
          'the durable debt is retained for the restart scan and its repair owner');
      }
      assert.equal(deliveries(), 0);
    });
    await t.test('D3: the services-row wake shares the sweep\'s hint filter: an owing operation ' +
      'wakes, a settled one costs no read', async (t) => {
      const fx = await discoveryFixture(t); const before = {...fx.f.row()};
      const proposals = fx.f.proposalCount();
      const laneReads = countCalls(fx.owner.repository,
        'queryAuthoritativeOperationByMessageGroupMembershipLane');
      const operationReads = () => fx.f.reads.filter((read) =>
        read.table === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS).length;
      fx.f.cacheOperationRow();
      const row = fx.f.hostWitness(SUCCESSOR, fx.replicaId);
      fx.owner.handleObservedReplicaStateChange('services', 'insert', row);
      assert.equal(await settled(() =>
        fx.f.row().message_group_membership_phase === PHASE.LEARNER_COMMITTED), true,
      'a hosted witness wakes the lane holder the replicated cache lists as owing');
      assertExactReceipt(fx, before, proposals); assert.equal(laneReads(), 1);
      fx.f.cacheOperationRow(); await settled(() => false, 20);
      const reads = operationReads();
      fx.owner.handleObservedReplicaStateChange('services', 'update', row);
      await settled(() => false, 20);
      assert.equal(laneReads(), 1, 'a lane whose operation owes no initial turn is not read');
      assert.equal(await wakeRow(fx.owner, fx.f.row()), null,
        'a settled operation row\'s own change wakes nothing');
      assert.equal(operationReads(), reads, 'neither wake costs an authoritative read');
    });
    await t.test('without a replicated-operation cache boundary the services-row wake reads the ' +
      'lane authoritatively', async (t) => {
      const fx = await discoveryFixture(t); const before = {...fx.f.row()};
      const proposals = fx.f.proposalCount(); const repository = fx.owner.repository;
      repository.hasReplicaOperationCacheObservationBoundary = () => false;
      const laneReads = countCalls(repository,
        'queryAuthoritativeOperationByMessageGroupMembershipLane');
      fx.owner.handleObservedReplicaStateChange('services', 'insert',
        fx.f.hostWitness(SUCCESSOR, fx.replicaId));
      assert.equal(await settled(() =>
        fx.f.row().message_group_membership_phase === PHASE.LEARNER_COMMITTED), true,
      'with no cache hint available the authoritative lane read decides and the debt is recorded');
      assert.equal(laneReads(), 1, 'the no-boundary services wake reads the lane authoritatively');
      assertExactReceipt(fx, before, proposals);
    });
  });
