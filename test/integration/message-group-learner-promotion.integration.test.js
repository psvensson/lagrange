/** Catch-up and promotion of the joined learner to voter (FreshMG 6.C, C2).
 * Integration witness: the real three-founder raft-rs group with the
 * recorded learner joined, installed, opened and RUNNING through the real B1/B2
 * owners, the real repository on file-backed canonical operation SQL, two real
 * MessageRouters with a registered MessageGroupServiceHandler, the workflow
 * owner's explicit entries on the real lane and the existing runtime
 * consumers. Discovery does not own promotion debt (owner guidance: no new
 * periodic work). The caught-up observation, origin read and target status
 * routes, node rows, the services census and operation SQL are explicit
 * fixture physics (message-group-learner-promotion-fixture.js): no driver,
 * production route, SIGKILL or physical proof.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as progress from '../../src/raft/learner-promotion-progress.js';
import {RAFT_MEMBERSHIP_TRANSITION_REASON as REASON, RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME, RAFT_MEMBERSHIP_AUTHORIZATION_REASON as AUTHORIZATION} from
  '../../src/raft/raft-operation-port-constants.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {MEMBERSHIP_PHASE as PHASE, MEMBERSHIP_DEBT_RECOVERY_OUTCOME as DEBT,
  decodeMembershipIdentity} from
  '../../src/rebalancer/replica-operation-message-group-membership-permit.js';
import {recordedLearnerFactIsValid} from
  '../../src/rebalancer/replica-operation-message-group-membership-authorization.js';
import {DEBT_CENSUS, wakeMessageGroupMembershipDebtForRow} from
  '../../src/rebalancer/operation-workflow-message-group-membership-recovery.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {raftRsConfStateKey} from '../../src/raft/raft-rs-conf-state-key.js';
import {committedStampOfAnswer} from '../../src/raft/raft-committed-membership-stamp.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {fixture, FOUNDERS, NODE, O, SUCCESSOR, TARGET} from
  '../test-helpers/learner-operation-fixture.js';
import {BRANCH_CAS, PERMIT_COLUMN, TARGET_PEER, VOTER_RECEIPT, catchUpRoute, caughtUp,
  countDeliveries, countWrites, leaderOf, otherFounder, promotionEntrySequences, promotionWorld,
  transferLeadership, votersEverywhere} from
  '../test-helpers/message-group-learner-promotion-fixture.js';
import {workflowOwner} from '../test-helpers/learner-recipient-fixture.js';

const SUCCESSOR_PERMIT_WRITE = 'SET message_group_membership_permit = ? WHERE';
const RECEIPT_COLUMNS = Object.freeze(['message_group_membership_phase',
  PERMIT_COLUMN, 'message_group_voter_stamp']);
const withoutColumns = (row, columns) => Object.fromEntries(Object.entries(row)
  .filter(([key]) => !columns.includes(key)));
/** Commit one ordinary command on the founders' quorum. */
function commitCommand(f, messageId) {
  const leader = leaderOf(f);
  const before = f.cluster.node(leader).readStatus().commitIndex;
  assert.equal(f.cluster.propose(leader, {type: 'MESSAGE', messageId}).outcome,
    RAFT_OPERATION_OUTCOME.CORE_OK);
  assert.ok(f.cluster.settle(() => f.cluster.node(leader).readStatus().commitIndex > before),
    'the founders commit the command');
}
/** A raw native REMOVE of the learner (test physics), applied by every founder. */
async function removeLearnerNatively(f) {
  const removed = await f.cluster.node(leaderOf(f)).proposeConfChange({
    type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: TARGET});
  assert.equal(removed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK, JSON.stringify(removed));
  assert.ok(f.cluster.settle(() => FOUNDERS.every((id) => !f.cluster.node(id).readStatus()
    .confState.learners.map(String).includes(TARGET_PEER))), 'every founder applied the REMOVE');
}
async function recordedLearnerFact(f) {
  const operation = await f.repository.queryAuthoritativeOperationById(O);
  const identity = decodeMembershipIdentity(operation.messageGroupMembershipIdentity);
  return recordedLearnerFactIsValid(operation, identity, operation.messageGroupMembershipIdentity);
}

test('the predicate owner\'s exact entry never grants a synthetic 0/0; the raw predicate ' +
  'still reads an absent index as 0 for its partition consumer', () => {
  assert.equal(typeof progress.evaluateExactLearnerPromotionProof, 'function',
    'the promotion-progress owner offers the exact entry C2 consumes');
  const facts = {raftIsLeader: true, currentTerm: 3, leaderMembershipEpoch: 2,
    learnerMembershipEpoch: 2};
  const raw = progress.evaluateLearnerPromotionProof(facts);
  assert.equal(raw.decision, 'granted', 'O5: the raw predicate grants absent commit and match');
  for (const [name, indices] of Object.entries({absent: {},
    zero: {committedIndex: 0, learnerMatchIndex: 0}, strings: {committedIndex: '5',
      learnerMatchIndex: '5'}, matchAbsent: {committedIndex: 5}})) {
    const exact = progress.evaluateExactLearnerPromotionProof({...facts, ...indices});
    assert.equal(exact.decision, 'refused', `${name}: no synthetic grant`);
    assert.equal(exact.reason, 'progress_unobserved', name);
  }
  assert.equal(progress.evaluateExactLearnerPromotionProof({...facts, committedIndex: 5,
    learnerMatchIndex: 4}).reason, 'progress_behind');
  assert.equal(progress.evaluateExactLearnerPromotionProof({...facts, committedIndex: 5,
    learnerMatchIndex: 5}).decision, 'granted', 'positive control: exact and caught up');
});

test('C2 owner path: the RUNNING learner caught up is selected for promotion over positive ' +
  'evidence through the landed branch selection, the native PROMOTE commits on every founder, ' +
  'and the voter stamp is recorded once with only the receipt columns', {timeout: 30000},
async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  const learnerFact = {...f.row()};
  const learnerPermit = JSON.parse(learnerFact[PERMIT_COLUMN]);
  const leader = leaderOf(f);
  const leaderStatus = f.cluster.node(leader).readStatus();
  const branchWrites = countWrites(f, BRANCH_CAS);
  const selected = await fx.select();
  assert.equal(selected.outcome, 'recorded', JSON.stringify(selected));
  assert.equal(branchWrites.applied(), 1, 'one promotion branch CAS');
  const promotion = fx.permit();
  assert.equal(f.row().message_group_membership_phase, PHASE.PROMOTION_IN_FLIGHT);
  assert.deepEqual([promotion.permitSequence, promotion.permitStage, promotion.permitState,
    promotion.proposalIndex], [learnerPermit.permitSequence + 1, 'promote', 'in_flight', null],
  'the promotion is the next attempt of the same transition, in flight');
  assert.deepEqual([promotion.leaderTerm, promotion.leaderConfigurationStamp,
    promotion.replicaLifecycleIncarnation, promotion.runtimeGeneration,
    promotion.destinationNodeId], [leaderStatus.term, {configurationKey:
    leaderStatus.configurationKey, membershipGenerationIndex:
    leaderStatus.membershipGenerationIndex}, leaderStatus.lifecycleIncarnation,
  leaderStatus.runtimeGeneration, SUCCESSOR], 'the acknowledging leader\'s own fences');
  const selectionColumns = ['message_group_membership_phase', PERMIT_COLUMN];
  assert.deepEqual(withoutColumns(f.row(), selectionColumns),
    withoutColumns(learnerFact, selectionColumns),
    'selection changes only the phase and the permit; the learner stamp and debt stay');
  const proposals = f.proposalCount();
  const proposed = await fx.propose(leader);
  assert.equal(proposed.reason, REASON.PROPOSED, JSON.stringify(proposed));
  assert.equal(f.proposalCount(), proposals + 1, 'one native PROMOTE proposal');
  assert.ok(votersEverywhere(f), 'every founder\'s ConfState names the target a voter');
  assert.equal(await fx.world.until(() => fx.learner().raft.readStatus().confState.voters
    .map(String).includes(TARGET_PEER)), true, 'the target\'s own ConfState names it a voter');
  const receipts = countWrites(f, VOTER_RECEIPT); const issued = {...f.row()};
  const recorded = await fx.recordVoter(otherFounder(f));
  assert.equal(recorded.outcome, 'recorded',
    'the explicit entry recovers the promotion\'s exact outcome through the recorder');
  assert.deepEqual(withoutColumns(f.row(), RECEIPT_COLUMNS),
    withoutColumns(issued, RECEIPT_COLUMNS), 'recording changes only the three receipt columns');
  assert.equal(f.row().message_group_membership_phase, PHASE.VOTER_COMMITTED);
  assert.deepEqual(fx.permit(), {...promotion, permitState: 'committed',
    proposalIndex: proposed.proposalIndex}, 'the recorded permit is the promotion, committed');
  const voter = JSON.parse(f.row().message_group_voter_stamp);
  assert.ok(voter.voters.includes(TARGET_PEER) && voter.identities[TARGET_PEER] === TARGET,
    'the voter stamp names the target a voter under its own identity');
  const reads = countDeliveries(fx.source);
  assert.equal((await fx.recordVoter(otherFounder(f))).outcome, 'recorded',
    'the promotion outcome is settled: exact replay');
  assert.equal(reads(), 0, 'a settled voter fact needs no native read');
  assert.equal(receipts.applied(), 1, 'the voter stamp is recorded exactly once');
  for (const id of FOUNDERS) {
    assert.deepEqual(promotionEntrySequences(f, id), [{index: proposed.proposalIndex,
      permitSequence: promotion.permitSequence}], `${id}: one committed PROMOTE entry`);
  }
  assert.equal(f.row().message_group_membership_obligation_state, 'unknown',
    'the membership obligation and its lane stay for source removal and absence');
  assert.equal(f.row().message_group_learner_stamp, learnerFact.message_group_learner_stamp);
  assert.equal((await fx.select()).outcome, 'recorded', 'a repeated selection finds it recorded');
  assert.equal(branchWrites.submitted(), 1, 'and writes nothing');
  assert.equal(fx.physical(), 0); assert.deepEqual(fx.created.outcomes, [],
    'no CREATE_ACTIVE or other executor outcome');
  assert.equal(f.row().create_admission_state, 'MATERIALIZED');
  assert.equal(NODE, JSON.parse(f.row().message_group_membership_owner_claim).ownerNodeId);
});

test('a learner behind its leader is not caught up: nothing is selected; once caught up the ' +
  'promotion is selected; held behind again the native turn refuses the proposal until it ' +
  'catches up, then promotes (RUNNING is no grant)', {timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  const before = {...f.row()}; const writes = countWrites(f, BRANCH_CAS);
  fx.world.bridge.hold.inbound = true;
  commitCommand(f, 'c2-behind-before-selection');
  const behind = await fx.select();
  assert.deepEqual([behind.outcome, behind.acknowledgement, behind.proofReason],
    ['not_caught_up', 'behind', 'progress_behind'],
    'a RUNNING learner that fell behind is no promotion basis');
  assert.equal(writes.submitted(), 0, 'no branch CAS'); assert.deepEqual(f.row(), before);
  fx.world.bridge.hold.inbound = false;
  assert.equal(await caughtUp(fx), true, 'the learner catches up');
  assert.equal((await fx.select()).outcome, 'recorded', 'positive control: caught up, selected');
  const promotion = fx.permit();
  fx.world.bridge.hold.inbound = true;
  commitCommand(f, 'c2-behind-before-proposal');
  const proposals = f.proposalCount();
  const refused = await fx.propose();
  assert.equal(refused.reason, REASON.PROMOTION_PROGRESS_BEHIND,
    'the native turn re-proves progress itself: ' + JSON.stringify(refused));
  assert.equal(f.proposalCount(), proposals, 'nothing reaches the core');
  assert.deepEqual(fx.permit(), promotion, 'the permit stays in flight, unrefreshed');
  fx.world.bridge.hold.inbound = false;
  assert.equal(await caughtUp(fx), true);
  assert.equal((await fx.propose()).reason, REASON.PROPOSED, 'safe progression once caught up');
  assert.ok(votersEverywhere(f));
});

test('a learner removed natively before promotion is refused and its recorded fact stays; ' +
  'removed after the promotion was authorized, the native turn proposes nothing and the debt ' +
  'is retained: no voter stamp, no successor, no abandonment (J1)', {timeout: 30000},
async (t) => {
  await t.test('removed before selection', async (t) => {
    const fx = await promotionWorld(t); const {f} = fx;
    await removeLearnerNatively(f);
    const before = {...f.row()}; const writes = countWrites(f, BRANCH_CAS);
    const refused = await fx.select();
    assert.deepEqual([refused.outcome, refused.acknowledgement], ['not_caught_up', 'removed'],
      'the leader\'s committed configuration no longer holds the learner');
    assert.equal(writes.submitted(), 0); assert.deepEqual(f.row(), before);
    assert.equal(await recordedLearnerFact(f), true, 'the recorded learner fact stays recorded');
    assert.equal(f.row().message_group_membership_obligation_state, 'unknown',
      'the debt stays for its abandonment owner');
  });
  await t.test('removed after selection', async (t) => {
    const fx = await promotionWorld(t); const {f} = fx;
    assert.equal((await fx.select()).outcome, 'recorded');
    const promotion = fx.permit(); const leader = leaderOf(f);
    await removeLearnerNatively(f);
    const proposals = f.proposalCount();
    const refused = await fx.propose(leader);
    assert.notEqual(refused.reason, REASON.PROPOSED, JSON.stringify(refused));
    assert.equal(refused.reason, REASON.STALE_CONFIGURATION,
      'the removal moved the configuration the permit is fenced to');
    assert.equal(f.proposalCount(), proposals, 'nothing reaches the core');
    const successorWrites = countWrites(f, SUCCESSOR_PERMIT_WRITE);
    const receipts = countWrites(f, VOTER_RECEIPT);
    assert.equal((await fx.recordVoter(otherFounder(f))).outcome, 'unknown',
      'an absent target vouches for nothing: UNKNOWN keeps the debt');
    assert.equal((await fx.recordVoter(leader)).outcome, 'unknown');
    const fencing = otherFounder(f);
    transferLeadership(f, fencing);
    assert.ok(f.cluster.node(fencing).readStatus().term > promotion.leaderTerm,
      'a leader of a newer term that applied its own term would fence a vouched absence');
    assert.equal((await fx.recordVoter(fencing)).outcome, 'unknown',
      'the absent target vouches for nothing even at that leader');
    assert.equal((await fx.issueSuccessor(fencing)).outcome, 'unknown');
    assert.equal(successorWrites.submitted(), 0, 'no successor over an absent target');
    assert.equal(receipts.submitted(), 0, 'no voter stamp');
    assert.deepEqual(fx.permit(), promotion);
    assert.equal(f.row().message_group_membership_phase, PHASE.PROMOTION_IN_FLIGHT);
    const abort = await f.repository.selectMessageGroupMembershipBranch({operationId: O,
      identity: f.request.identity, priorPermit: f.row()[PERMIT_COLUMN],
      nextPermit: JSON.stringify({...promotion, permitSequence: promotion.permitSequence + 1,
        permitStage: 'remove'}), branch: 'abort_learner'});
    assert.notEqual(abort.outcome, 'recorded', 'J1: no abandonment after authorization');
    assert.equal(f.row().message_group_membership_phase, PHASE.PROMOTION_IN_FLIGHT);
  });
});

test('a stale promotion permit after a leader change is refused at both leaders ' +
  '(STALE_LEADERSHIP at the demoted one) and never refreshed; the fenced attempt gets the ' +
  'ordered successor through C1\'s issuance, which is proposed, committed and recorded once',
{timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  assert.equal((await fx.select()).outcome, 'recorded');
  const stale = fx.permit(); const oldLeader = leaderOf(f);
  const newLeader = FOUNDERS.find((id) => id !== oldLeader);
  transferLeadership(f, newLeader);
  assert.equal(await caughtUp(fx, newLeader), true, 'the learner follows the new leader');
  const proposals = f.proposalCount();
  assert.equal((await fx.propose(oldLeader)).reason, REASON.STALE_LEADERSHIP,
    'the old permit at its own, demoted leader');
  assert.equal((await fx.propose(newLeader)).reason, REASON.STALE_LIFECYCLE,
    'the old permit is not refreshed into the new leader\'s fences (it names the old ' +
    'leader replica\'s lifecycle, refused before the term)');
  assert.equal(f.proposalCount(), proposals, 'the stale permit is proposed nowhere');
  assert.equal((await fx.select()).outcome, 'recorded', 'a repeated selection rewrites nothing');
  assert.deepEqual(fx.permit(), stale, 'the stale permit stays byte-identical');
  const status = f.cluster.node(newLeader).readStatus();
  const refreshed = JSON.stringify({...stale, leaderTerm: status.term,
    replicaLifecycleIncarnation: status.lifecycleIncarnation,
    runtimeGeneration: status.runtimeGeneration});
  assert.notEqual((await f.repository.selectMessageGroupMembershipBranch({operationId: O,
    identity: f.request.identity, priorPermit: f.row()[PERMIT_COLUMN], nextPermit: refreshed,
    branch: 'promote'})).outcome, 'recorded', 'no refreshed permit at the same sequence');
  const before = {...f.row()};
  assert.equal((await fx.recordVoter(newLeader)).outcome, 'noncommitted',
    'the recorder proves the stale attempt noncommitted at the fencing new leader');
  assert.deepEqual(f.row(), before, 'noncommitment records nothing');
  assert.equal((await fx.issueSuccessor(newLeader)).outcome, 'recorded',
    'C1\'s issuance issues the ordered successor');
  const successor = fx.permit();
  assert.deepEqual([successor.permitSequence, successor.permitStage, successor.leaderTerm],
    [stale.permitSequence + 1, 'promote', status.term], 'the next sequence, the fencing term');
  assert.deepEqual(withoutColumns(f.row(), [PERMIT_COLUMN]),
    withoutColumns(before, [PERMIT_COLUMN]), 'issuance changes only the permit column');
  const delayed = await fx.propose(newLeader, {request: {operationId: O,
    identity: f.request.identity, permit: JSON.stringify(stale),
    executionClaim: f.row().message_group_membership_owner_claim}});
  assert.equal(delayed.reason, AUTHORIZATION.MISMATCH,
    'a delayed delivery of the fenced attempt finds the successor on the row');
  assert.equal(f.proposalCount(), proposals, 'and reaches no core');
  assert.equal(await caughtUp(fx, newLeader), true);
  const proposed = await fx.propose(newLeader);
  assert.equal(proposed.reason, REASON.PROPOSED, JSON.stringify(proposed));
  assert.ok(votersEverywhere(f));
  assert.equal((await fx.recordVoter(newLeader)).outcome, 'recorded');
  assert.deepEqual(fx.permit(), {...successor, permitState: 'committed',
    proposalIndex: proposed.proposalIndex}, 'the successor\'s exact outcome is recorded');
  for (const id of FOUNDERS) {
    assert.deepEqual(promotionEntrySequences(f, id).map((entry) => entry.permitSequence),
      [successor.permitSequence], `${id}: one PROMOTE entry, the successor's`);
  }
});

test('a leader of a newer term is promotion authority once it applied an entry of its own term: ' +
  'the selection binds its fences, its native turn proposes and the voter stamp is recorded',
{timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  const learnerPermit = JSON.parse(f.row()[PERMIT_COLUMN]);
  const newLeader = FOUNDERS.find((id) => id !== leaderOf(f));
  transferLeadership(f, newLeader);
  assert.equal(await caughtUp(fx, newLeader), true, 'the learner follows the new leader');
  const status = f.cluster.node(newLeader).readStatus();
  assert.ok(status.term > learnerPermit.leaderTerm && status.currentTermApplied === true,
    'the recorded learner action is no entry of this term; the leader applied its own');
  assert.equal((await fx.select()).outcome, 'recorded', 'the new leader is promotion authority');
  const promotion = fx.permit();
  assert.deepEqual([promotion.leaderTerm, promotion.replicaLifecycleIncarnation,
    promotion.runtimeGeneration], [status.term, status.lifecycleIncarnation,
    status.runtimeGeneration], 'bound to the new leader\'s own fences');
  const proposed = await fx.propose(newLeader);
  assert.equal(proposed.reason, REASON.PROPOSED, JSON.stringify(proposed));
  assert.ok(votersEverywhere(f));
  assert.equal((await fx.recordVoter(newLeader)).outcome, 'recorded');
  assert.deepEqual(fx.permit(), {...promotion, permitState: 'committed',
    proposalIndex: proposed.proposalIndex});
});

test('duplicate promotion requests: concurrent selections apply one branch CAS and concurrent ' +
  'deliveries reach the core once', {timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  const writes = countWrites(f, BRANCH_CAS);
  const selections = await Promise.all([fx.select(), fx.select()]);
  assert.ok(selections.some((answer) => answer.outcome === 'recorded'), JSON.stringify(selections));
  assert.equal(writes.applied(), 1, 'exactly one branch CAS applied');
  const proposals = f.proposalCount();
  const delivered = await Promise.all([fx.propose(), fx.propose()]);
  assert.equal(delivered.filter((answer) => answer.reason === REASON.PROPOSED).length, 1,
    JSON.stringify(delivered));
  assert.equal(f.proposalCount(), proposals + 1, 'one native proposal');
  assert.ok(votersEverywhere(f));
  const receipts = countWrites(f, VOTER_RECEIPT);
  const witness = otherFounder(f);
  const recordings = await Promise.all([fx.recordVoter(witness), fx.recordVoter(witness)]);
  assert.deepEqual(recordings.map((answer) => answer.outcome), ['recorded', 'recorded']);
  assert.equal(receipts.applied(), 1, 'one receipt');
  for (const id of FOUNDERS) assert.equal(promotionEntrySequences(f, id).length, 1);
});

test('lost answers: a lost proposal answer and a lost voter-stamp answer are both resolved by ' +
  'the recorder\'s exact read and readback', {timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  assert.equal((await fx.select()).outcome, 'recorded');
  const promotion = fx.permit();
  await fx.propose(); // The answer is lost: nothing of it is used below.
  assert.ok(votersEverywhere(f));
  const [entry] = promotionEntrySequences(f, FOUNDERS[0]);
  const execute = f.gateway.executeQuery; let lost = 0;
  f.gateway.executeQuery = async (sql, ...args) => {
    const answer = await execute(sql, ...args);
    if (String(sql).includes(VOTER_RECEIPT)) {
      lost += 1; throw new Error('fixture: the voter-stamp answer is lost after it applied');
    }
    return answer;
  };
  assert.equal((await fx.recordVoter(otherFounder(f))).outcome, 'recorded',
    'exact readback proves the lost write committed');
  assert.equal(lost, 1, 'one submission, its answer lost');
  assert.deepEqual(fx.permit(), {...promotion, permitState: 'committed',
    proposalIndex: entry.index}, 'the exact outcome is the committed PROMOTE entry');
  assert.equal((await fx.recordVoter(otherFounder(f))).outcome, 'recorded');
  assert.equal(lost, 1, 'a settled fact is never written again');
});

test('process loss between selection and proposal: the restarted holder re-selects nothing, ' +
  'the promotion is proposed once and a redelivery reaches no core', {timeout: 30000},
async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  const writes = countWrites(f, BRANCH_CAS);
  assert.equal((await fx.select()).outcome, 'recorded');
  const reopened = f.reopenOperations();
  const owner = workflowOwner({nodeId: NODE, repository: reopened, messageRouter: fx.source,
    realLane: true, timeSource: f.clock});
  assert.equal((await fx.select({}, {repository: reopened})).outcome, 'recorded',
    'the restarted holder finds the durable authorization');
  assert.equal(writes.submitted(), 1, 'and submits no second CAS');
  const proposals = f.proposalCount();
  assert.equal((await fx.propose()).reason, REASON.PROPOSED);
  const redelivered = await fx.propose();
  assert.notEqual(redelivered.reason, REASON.PROPOSED, JSON.stringify(redelivered));
  assert.equal(f.proposalCount(), proposals + 1, 'the redelivery reaches no core');
  assert.ok(votersEverywhere(f));
  assert.equal((await fx.recordVoter(otherFounder(f), owner)).outcome, 'recorded',
    'the restarted owner records the exact outcome');
  for (const id of FOUNDERS) assert.equal(promotionEntrySequences(f, id).length, 1);
});

test('UNKNOWN keeps the promotion debt: a follower witness or the permit\'s own leader term ' +
  'fences nothing, even once that leader applied a later entry of its term; no successor, no ' +
  'voter stamp', {timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  assert.equal((await fx.select()).outcome, 'recorded');
  const leader = leaderOf(f);
  commitCommand(f, 'c2-unknown-own-term-entry');
  assert.ok(f.cluster.settle(() => f.cluster.node(leader).readStatus().currentTermApplied === true),
    'the permit\'s own-term leader applied a later entry of that term');
  assert.equal(f.cluster.node(leader).readStatus().term, fx.permit().leaderTerm);
  const before = {...f.row()};
  for (const witness of [otherFounder(f), leader]) {
    assert.equal((await fx.recordVoter(witness)).outcome, 'unknown', witness);
    assert.equal((await fx.issueSuccessor(witness)).outcome, 'unknown', witness);
  }
  assert.deepEqual(f.row(), before, 'no successor, no stamp, nothing written');
  assert.equal(f.cluster.node(leader).readStatus().role, RAFT_ROLE.LEADER);
});

test('promotion debt adds no periodic work: the replicated-row wake and the periodic sweep pass ' +
  'over it, the restart scan retains it visible, and no native read is sent', {timeout: 30000},
async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  assert.equal((await fx.select()).outcome, 'recorded');
  f.hostWitness(SUCCESSOR, otherFounder(f));
  const before = {...f.row()}; const deliveries = countDeliveries(fx.source);
  assert.equal(await wakeMessageGroupMembershipDebtForRow(fx.owner,
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, 'update', f.row()), null,
  'the promotion row\'s replicated change wakes nothing');
  f.cacheOperationRow();
  assert.deepEqual(await fx.sweep(fx.owner, DEBT_CENSUS.CACHE_HINT), {available: true,
    found: 0, recorded: 0, settled: 0, retained: 0, refused: 0},
  'the 1 s periodic sweep\'s cache hint finds no promotion candidate');
  const logged = []; fx.owner.logger = {error() {}, info() {}, warn() {},
    debug: (_message, event) => logged.push(event)};
  assert.deepEqual(await fx.sweep(fx.owner, DEBT_CENSUS.AUTHORITATIVE), {available: true,
    found: 1, recorded: 0, settled: 0, retained: 1, refused: 0},
  'the restart scan finds the debt and retains it');
  assert.deepEqual(logged.map((event) => event.outcome), [DEBT.PHASE_NOT_OWNED],
    'visible as not owned by discovery');
  assert.equal(deliveries(), 0, 'no native read'); assert.deepEqual(f.row(), before);
});

test('selection refusals are typed and write nothing: no positive origin evidence at the routed ' +
  'leader, absent progress (no 0/0), the leader\'s term unapplied, a route to another replica, ' +
  'a mixed leader observation, the learner\'s own view unobserved, a forged learner stamp, an ' +
  'abandonment selected first', {timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  assert.equal(await caughtUp(fx), true);
  const before = {...f.row()}; const writes = countWrites(f, BRANCH_CAS);
  const leaderRead = (query) => f.cluster.node(leaderOf(f)).readCommittedMembership(query);
  const identity = JSON.parse(f.request.identity);
  const committed = await leaderRead({purpose: 'learner-action', groupId: identity.groupId,
    action: {operationId: O, transitionIdentity: identity.transitionIdentity,
      permitSequence: JSON.parse(before[PERMIT_COLUMN]).permitSequence, stage: 'add-learner',
      replicaIdentity: TARGET, peerId: TARGET_PEER}});
  assert.equal(committed.kind, 'committed-action', 'positive control: the leader evidences it');
  const origins = {
    'no origin at the leader': async () => ({kind: 'unresolved-action',
      reason: 'learner-action-not-recorded'}),
    'another operation\'s origin': async () => ({...committed, receipt: {...committed.receipt,
      context: {...committed.receipt.context, operationId: 'another-operation'}}}),
  };
  for (const [name, readAction] of Object.entries(origins)) {
    assert.equal((await fx.select({}, {readAction})).outcome, 'origin_unrecorded', name);
  }
  assert.equal((await fx.select({}, {readAction: async () => {
    throw new Error('fixture: read unavailable');
  }})).outcome, 'unavailable', 'an unavailable read is no evidence');
  const alter = (change) => ({observeCatchUp: catchUpRoute(f, fx.world, {alter: change})});
  const unobserved = await fx.select({}, alter((observation) => ({...observation,
    status: {...observation.status, commitIndex: undefined, followerProgress: {}}})));
  assert.deepEqual([unobserved.outcome, unobserved.acknowledgement, unobserved.proofReason],
    ['not_caught_up', 'behind', 'progress_unobserved'], 'absent commit and match never grant');
  const unapplied = await fx.select({}, alter((observation) => ({...observation,
    status: {...observation.status, currentTermApplied: false,
      appliedIndex: JSON.parse(before[PERMIT_COLUMN]).proposalIndex - 1}})));
  assert.equal(unapplied.acknowledgement, 'leader_term_unapplied',
    'no promotion authority before the leader applied an entry of its own term');
  const other = otherFounder(f);
  assert.equal((await fx.select({destinationReplicaId: other})).outcome, 'conflict',
    'the proof must be the routed leader\'s');
  const mixed = await fx.select({}, alter((observation) => ({...observation,
    status: f.cluster.node(other).readStatus()})));
  assert.equal(mixed.acknowledgement, 'leader_unavailable');
  const blind = await fx.select({}, alter((observation) => ({...observation, own: null})));
  assert.equal(blind.acknowledgement, 'learner_unobserved');
  assert.equal(writes.submitted(), 0); assert.deepEqual(f.row(), before);
  f.execute('UPDATE replica_operations SET message_group_learner_stamp = ? WHERE operation_id = ?',
    [` ${before.message_group_learner_stamp}`, O]);
  assert.equal((await fx.select()).outcome, 'conflict', 'a forged learner stamp is no basis');
  f.execute('UPDATE replica_operations SET message_group_learner_stamp = ? WHERE operation_id = ?',
    [before.message_group_learner_stamp, O]);
  const learner = JSON.parse(before.message_group_learner_stamp);
  const prior = JSON.parse(before[PERMIT_COLUMN]);
  assert.equal((await f.repository.selectMessageGroupMembershipBranch({operationId: O,
    identity: f.request.identity, priorPermit: before[PERMIT_COLUMN],
    nextPermit: JSON.stringify({...prior, permitSequence: prior.permitSequence + 1,
      permitStage: 'remove', permitState: 'in_flight', proposalIndex: null,
      leaderConfigurationStamp: {configurationKey: learner.configurationKey,
        membershipGenerationIndex: learner.membershipGenerationIndex}}),
    branch: 'abort_learner'})).outcome, 'recorded', 'the abandonment wins first');
  assert.equal((await fx.select()).outcome, 'conflict', 'and excludes the promotion');
  assert.equal(writes.applied(), 1, 'only the abandonment CAS applied');
});

test('an unresolved learner attempt holds the group\'s lane: while its holder owes the UNKNOWN ' +
  'outcome no promotion is selected and no evidence is asked, an expired lease is no shortcut, ' +
  'and another target cannot take the lane', {timeout: 30000}, async (t) => {
  const f = await fixture(t);
  let asked = 0;
  const ask = async () => {
    asked += 1; return null;
  };
  const select = () => f.repository.selectMessageGroupPromotion({operationId: O,
    destinationNodeId: SUCCESSOR, destinationReplicaId: leaderOf(f)}, ask, ask, () => true);
  assert.equal(typeof f.repository.selectMessageGroupPromotion, 'function',
    'the repository owns the promotion selection over the exact caught-up proof');
  assert.equal(f.row().message_group_membership_obligation_state, 'unknown');
  assert.equal((await select()).outcome, 'conflict', 'an issued, unresolved learner attempt');
  assert.equal((await f.run()).reason, REASON.PROPOSED);
  assert.ok(f.cluster.settle(() => FOUNDERS.every((id) => f.cluster.node(id).readStatus()
    .confState.learners.map(String).includes(TARGET_PEER))), 'committed natively, not recorded');
  assert.equal((await select()).outcome, 'conflict',
    'committed natively but its outcome unrecorded on the row: still refused');
  const claim = JSON.parse(f.row().message_group_membership_owner_claim);
  f.clock.advance(claim.expiresAt - f.clock.now() + 1);
  assert.equal((await select()).outcome, 'conflict',
    'the holder\'s lease expired: the unresolved attempt still holds the lane');
  assert.equal(f.row().message_group_membership_obligation_state, 'unknown');
  assert.equal(asked, 0, 'no origin read and no observation is asked for');
  const held = await f.repository.queryAuthoritativeOperationById(O);
  const otherIdentity = {...JSON.parse(f.request.identity), operationId: 'other-target-operation',
    targetReplicaId: 'other-fresh-target', targetPeerId: deriveRaftRsPeerId('other-fresh-target'),
    transitionIdentity: 'other-target-transition'};
  const otherTarget = {...held, operationId: otherIdentity.operationId,
    replicaId: otherIdentity.targetReplicaId, completedAt: null, stepsHistory: [],
    messageGroupMembershipOwnerClaim: null, messageGroupMembershipPermit: null,
    messageGroupMembershipPhase: 'learner_requested',
    messageGroupMembershipObligationState: 'intent_recorded',
    messageGroupMembershipIdentity: JSON.stringify(otherIdentity)};
  assert.equal((await f.repository.persistNewOperation(otherTarget,
    {returnDisposition: true})).disposition, 'membership_lane_conflict',
  'choosing another target is no way around the held lane');
});

test('the voter stamp is only the exact committed outcome: a stamp still naming a learner, a ' +
  'configuration changed beyond the promotion, another transition\'s origin, a moved applied ' +
  'index or a malformed observation is refused; absence is UNKNOWN unless fenced; nothing is ' +
  'written until the real committed answer', {timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  assert.equal(typeof f.repository.recordMessageGroupVoterOutcome, 'function',
    'the recorder owns the voter stamp');
  assert.equal((await fx.select()).outcome, 'recorded');
  const promotion = fx.permit(); const row = f.row();
  const request = {operationId: O, identity: f.request.identity, permit: row[PERMIT_COLUMN],
    executionClaim: row.message_group_membership_owner_claim};
  let query = null;
  const record = (answer) => f.repository.recordMessageGroupVoterOutcome(request, (asked) => {
    query = asked; return typeof answer === 'function' ? answer(asked) : answer;
  });
  assert.equal((await record({kind: 'refused-action', reason: 'learner-action-unavailable'}))
    .outcome, 'unavailable');
  assert.deepEqual([query.purpose, query.action.stage, query.action.permitSequence],
    ['learner-action', 'promote', promotion.permitSequence], 'the exact promotion action');
  assert.equal((await fx.propose()).reason, REASON.PROPOSED);
  assert.ok(votersEverywhere(f));
  const committed = await f.cluster.node(FOUNDERS[0]).readCommittedMembership(query);
  assert.equal(committed.kind, 'committed-action', JSON.stringify(committed));
  const learnerStamp = JSON.parse(row.message_group_learner_stamp);
  const extra = committed.membership.voters.find((peer) => peer !== TARGET_PEER &&
    committed.membership.identities[peer] !== JSON.parse(f.request.identity).sourceReplicaId);
  const narrowed = {...committed.membership,
    voters: committed.membership.voters.filter((peer) => peer !== extra),
    identities: Object.fromEntries(Object.entries(committed.membership.identities)
      .filter(([peer]) => peer !== extra))};
  narrowed.configurationKey = raftRsConfStateKey({voters: narrowed.voters, votersOutgoing: [],
    learners: narrowed.learners, learnersNext: [], autoLeave: false});
  narrowed.leaderId = committed.membership.identities[narrowed.voters.find((peer) =>
    peer !== TARGET_PEER)];
  assert.ok(committedStampOfAnswer(learnerStamp) && committedStampOfAnswer(narrowed),
    'both altered answers are valid committed stamps: only the voter-fact rule refuses them');
  const observation = {replicaIdentity: FOUNDERS[0], role: 'leader', term: promotion.leaderTerm + 1,
    currentTermApplied: true, originRegistryComplete: false, appliedIndex: 9,
    configurationKey: 'k', membershipGenerationIndex: 9, lifecycleIncarnation: 'l',
    runtimeGeneration: 1};
  const notRecorded = (fields) => ({kind: 'unresolved-action', reason: 'learner-action-not-recorded',
    observation: {...observation, ...fields}});
  const cases = [
    ['a stamp still naming the target a learner', {...committed, membership: learnerStamp,
      observedAppliedIndex: learnerStamp.appliedIndex}, 'conflict'],
    ['a configuration changed beyond the promotion', {...committed, membership: narrowed},
      'conflict'],
    ['another transition\'s learner origin', {...committed, receipt: {...committed.receipt,
      context: {...committed.receipt.context, operationId: 'another-operation'}}}, 'conflict'],
    ['a moved applied index', {...committed, observedAppliedIndex:
      committed.observedAppliedIndex + 1}, 'conflict'],
    ['absence at a fencing leader that does not vouch', notRecorded({}), 'unknown'],
    ['absence at a follower', notRecorded({role: 'follower', originRegistryComplete: true}),
      'unknown'],
    ['a malformed observation', notRecorded({extra: true}), 'conflict'],
  ];
  const receipts = countWrites(f, VOTER_RECEIPT); const before = {...f.row()};
  for (const [name, answer, outcome] of cases) {
    assert.equal((await record(answer)).outcome, outcome, name);
  }
  assert.equal((await record(notRecorded({originRegistryComplete: true}))).outcome,
    'noncommitted', 'a fenced, vouched absence is noncommitment (records nothing)');
  assert.equal(receipts.submitted(), 0, 'nothing is written'); assert.deepEqual(f.row(), before);
  assert.equal((await record(committed)).outcome, 'recorded', 'positive control');
  assert.equal(receipts.applied(), 1);
  assert.equal((await record(committed)).outcome, 'recorded', 'exact replay writes nothing');
  assert.equal(receipts.submitted(), 1);
});
