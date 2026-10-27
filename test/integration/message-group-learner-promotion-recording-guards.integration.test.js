/** Recording guard witnesses of the promotion owner (FreshMG 6.C, C2; the class
 * repair the independent review of 6d4132222 required). Every refusal branch
 * and every precondition of the voter-stamp receipt in
 * src/rebalancer/replica-operation-message-group-promotion.js, the pure
 * recorded-voter-fact predicate included, has a named mutation in the design
 * note's guard-vs-mutation table and dies at a named assertion here, in the
 * selection guard file or in message-group-learner-promotion.integration.test.js.
 * Same world and physics as that witness
 * (message-group-learner-promotion-fixture.js): the real three-founder raft-rs
 * group with the RUNNING learner promoted natively, the real repository on
 * file-backed operation SQL, two real MessageRouters and the workflow owner's
 * explicit entries. Crafted native answers, forged rows and holder
 * interleavings are explicit test physics; no driver, production route or
 * physical proof.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RAFT_MEMBERSHIP_TRANSITION_REASON as REASON, RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME} from '../../src/raft/raft-operation-port-constants.js';
import {COMMITTED_LEARNER_ACTION_KIND as KIND, COMMITTED_MEMBERSHIP_REFUSAL} from
  '../../src/raft/raft-committed-membership-constants.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {committedStampOfAnswer} from '../../src/raft/raft-committed-membership-stamp.js';
import {MEMBERSHIP_PHASE as PHASE, decodeMembershipIdentity} from
  '../../src/rebalancer/replica-operation-message-group-membership-permit.js';
import {recordedVoterFactIsValid} from
  '../../src/rebalancer/replica-operation-message-group-promotion.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {FOUNDERS, NOW, O} from '../test-helpers/learner-operation-fixture.js';
import {OWNER_CLAIM, PERMIT_COLUMN, VOTER_RECEIPT, caughtUp, configurationOf, countWrites,
  leaderOf, learnerQuery, otherFounder, promotionWorld, recordingRequest, refusedOnForgedRow,
  setColumns, settled, transferLeadership, votersEverywhere} from
  '../test-helpers/message-group-learner-promotion-fixture.js';

test('recording input guards: the learner action, a missing read capability, a lifetime that is ' +
  'no function and an empty operation id are INVALID before any read; an unreadable row is ' +
  'UNAVAILABLE and an absent row CONFLICT, never a thrown recovery', {timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  const learnerPermit = f.row()[PERMIT_COLUMN];
  assert.equal((await fx.select()).outcome, 'recorded');
  const request = recordingRequest(f);
  let asked = 0;
  const ask = async () => {
    asked += 1; return null;
  };
  const record = (input, read = ask, current) =>
    settled(f.repository.recordMessageGroupVoterOutcome(input, read, current));
  const recover = (operationId, read = ask, current) =>
    settled(f.repository.recoverMessageGroupVoterOutcome(operationId, read, current));
  const before = f.row(); const receipts = countWrites(f, VOTER_RECEIPT);
  const reads = f.reads.length;
  assert.equal((await record({...request, permit: learnerPermit})).outcome, 'invalid',
    'the learner action is no promotion recording input');
  assert.equal((await record(request, null)).outcome, 'invalid',
    'a read capability that is no function');
  assert.equal((await record(request, ask, true)).outcome, 'invalid',
    'an invocation lifetime that is no function');
  assert.equal((await recover('')).outcome, 'invalid', 'recovery needs an operation id');
  assert.equal(f.reads.length, reads, 'INVALID reads no row');
  f.failReads('replica_operations');
  assert.equal((await recover(O)).outcome, 'unavailable',
    'an unreadable row is UNAVAILABLE, never a missing promotion');
  f.failReads(null);
  assert.equal((await recover('no-such-operation')).outcome, 'conflict',
    'an absent row is CONFLICT, never a thrown recovery');
  assert.equal(asked, 0, 'no refusal asked for evidence');
  assert.equal(receipts.submitted(), 0); assert.deepEqual(f.row(), before);
});

test('voter row guards: the recorder writes only over the exact in-flight promotion of this ' +
  'holder on an open or exactly failed operation with the learner stamp kept and no voter or ' +
  'removal stamp; a committed permit is readback-only; another attempt\'s permit records nothing',
{timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  assert.equal((await fx.select()).outcome, 'recorded');
  assert.equal((await fx.propose()).reason, REASON.PROPOSED);
  assert.ok(votersEverywhere(f));
  const promotion = fx.permit(); const row = f.row();
  const request = recordingRequest(f);
  const committed = await f.cluster.node(FOUNDERS[0]).readCommittedMembership(
    learnerQuery(f, promotion));
  assert.equal(committed.kind, KIND.COMMITTED, JSON.stringify(committed));
  let asked = 0;
  const record = (input = request) => settled(f.repository.recordMessageGroupVoterOutcome(input,
    async () => {
      asked += 1; return committed;
    }));
  const receipts = countWrites(f, VOTER_RECEIPT);
  const refused = (name, columns, input, asks) => refusedOnForgedRow(f, name, columns,
    async () => {
      const before = asked; const answer = await record(input);
      if (asks !== undefined) assert.equal(asked - before, asks, `${name}: native reads asked`);
      return answer;
    }, 'conflict');
  const claim = JSON.parse(row[OWNER_CLAIM]);
  const otherSequence = JSON.stringify({...promotion,
    permitSequence: promotion.permitSequence + 1});
  const committedForm = JSON.stringify({...promotion, permitState: 'committed',
    proposalIndex: committed.membership.membershipGenerationIndex});
  await refused('identity columns disagreeing with the encoded identity',
    {source_replica_id: 'someone-else'});
  await refused('a request carrying another holder claim than the row\'s', {},
    {...request, executionClaim: JSON.stringify({...claim, generation: claim.generation + 1})});
  await refused('an obligation other than UNKNOWN',
    {message_group_membership_obligation_state: 'intent_recorded'});
  await refused('no learner stamp on the row', {message_group_learner_stamp: null}, request, 0);
  await refused('a removal stamp on the row',
    {message_group_removal_stamp: row.message_group_learner_stamp});
  await refused('an ordinarily completed operation (REMOVED, not an exact failure)',
    {status: ReplicaStatus.REMOVED, workflow_step: WORKFLOW_STEP.REMOVED, completed_at: NOW + 60});
  await refused('a committed permit on a row still in flight is readback-only',
    {[PERMIT_COLUMN]: committedForm}, {...request, permit: committedForm});
  await refused('a promotion permit that is not the row\'s attempt', {},
    {...request, permit: otherSequence});
  await refused('a voter stamp already on the in-flight row',
    {message_group_voter_stamp: row.message_group_learner_stamp});
  await refused('a phase other than promotion in flight',
    {message_group_membership_phase: PHASE.LEARNER_COMMITTED});
  assert.equal(receipts.submitted(), 0, 'no forgery reached the receipt');
  assert.equal((await record()).outcome, 'recorded', 'positive control');
  assert.equal(receipts.applied(), 1);
  assert.equal((await record({...request, permit: otherSequence})).outcome, 'conflict',
    'a recorded fact answers only the attempt it records: another sequence is CONFLICT');
  await refusedOnForgedRow(f, 'a recorded row whose voter stamp was tampered is no exact replay',
    {message_group_voter_stamp: ` ${f.row().message_group_voter_stamp}`}, () => record(),
    'conflict');
  assert.equal((await record()).outcome, 'recorded', 'exact replay');
  assert.equal(receipts.submitted(), 1, 'a settled fact is never written again');
});

test('voter evidence guards: a committed promotion answer is evidence only with the transition\'s ' +
  'own learner origin earlier in the transition, a readable witness and a canonical stamp at the ' +
  'read\'s applied index that follows the recorded learner configuration; a held or joint ' +
  'witness is UNAVAILABLE; a receipt or stamp the codecs refuse is CONFLICT, never unavailability',
{timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  assert.equal((await fx.select()).outcome, 'recorded');
  assert.equal((await fx.propose()).reason, REASON.PROPOSED);
  assert.ok(votersEverywhere(f));
  const promotion = fx.permit();
  const request = recordingRequest(f);
  const committed = await f.cluster.node(FOUNDERS[0]).readCommittedMembership(
    learnerQuery(f, promotion));
  assert.equal(committed.kind, KIND.COMMITTED, JSON.stringify(committed));
  const record = (answer) =>
    settled(f.repository.recordMessageGroupVoterOutcome(request, async () => answer));
  const origin = (context) => ({...committed, receipt: {...committed.receipt,
    context: {...committed.receipt.context, ...context}}});
  const membership = (changes) =>
    ({...committed, membership: {...committed.membership, ...changes}});
  const generation = promotion.leaderConfigurationStamp.membershipGenerationIndex;
  const cases = {
    'a receipt the origin codec refuses': [{...committed, receipt: {groupId: 7}}, 'conflict'],
    'an origin of another group': [{...committed, receipt: {...committed.receipt,
      groupId: 'another-group'}}, 'conflict'],
    'another operation\'s origin': [origin({operationId: 'another-operation'}), 'conflict'],
    'another transition\'s origin': [origin({transitionIdentity: 'another-transition'}), 'conflict'],
    'another replica\'s origin': [origin({replicaIdentity: 'another-replica',
      peerId: deriveRaftRsPeerId('another-replica')}), 'conflict'],
    'an origin whose peer id does not derive from its replica identity (the codec refuses it)':
      [origin({peerId: deriveRaftRsPeerId('another-replica')}), 'conflict'],
    'an origin not earlier in the transition than the promotion':
      [origin({permitSequence: promotion.permitSequence}), 'conflict'],
    'a held witness': [{...committed, membership: {kind: 'refused',
      reason: COMMITTED_MEMBERSHIP_REFUSAL.HELD}}, 'unavailable'],
    'a joint witness': [membership({votersOutgoing: [committed.membership.voters[0]]}),
      'unavailable'],
    'a membership that is no committed stamp': [membership({voters: 'no-peers'}), 'conflict'],
    'a moved applied index': [{...committed,
      observedAppliedIndex: committed.observedAppliedIndex + 1}, 'conflict'],
    'a stamp at the permit\'s own configuration generation':
      [membership({membershipGenerationIndex: generation}), 'conflict'],
    'a stamp of a term before the permit\'s': [membership({term: promotion.leaderTerm - 1}),
      'conflict'],
  };
  const receipts = countWrites(f, VOTER_RECEIPT); const before = f.row();
  for (const [name, [answer, expected]] of Object.entries(cases)) {
    const got = await record(answer);
    assert.equal(got.outcome, expected, `${name}: ${JSON.stringify(got)}`);
  }
  await refusedOnForgedRow(f, 'a learner stamp on the row that does not decode',
    {message_group_learner_stamp: 'not-a-stamp'}, () => record(committed), 'conflict');
  // The learner configuration the stamp is judged against must be this
  // transition's: a forged learner stamp must not make a configuration that
  // dropped the source, or that never held the target, look like exactly the
  // target promoted. Each forgery is paired with the matching configuration.
  const learner = JSON.parse(f.row().message_group_learner_stamp);
  const identity = JSON.parse(f.request.identity);
  const sourcePeer = deriveRaftRsPeerId(identity.sourceReplicaId);
  const without = (stamp, dropped, learners) => {
    const voters = stamp.voters.filter((peer) => peer !== dropped);
    const identities = Object.fromEntries(Object.entries(stamp.identities)
      .filter(([peer]) => peer !== dropped));
    const canonical = committedStampOfAnswer({...stamp, voters, learners, identities,
      leaderId: stamp.identities[voters[0]], configurationKey: configurationOf(voters, learners)});
    assert.ok(canonical, 'a valid committed stamp without the dropped member');
    return canonical;
  };
  const learnerWithoutSource = without(learner, sourcePeer, learner.learners);
  const votersWithoutSource = without(committed.membership, sourcePeer, []);
  await refusedOnForgedRow(f, 'a learner stamp that dropped the source, against a configuration ' +
    'that dropped it too', {message_group_learner_stamp: JSON.stringify(learnerWithoutSource)},
  () => record({...committed, membership: {...votersWithoutSource}}), 'conflict');
  const foundersOnly = committedStampOfAnswer({...learner, learners: [],
    identities: Object.fromEntries(Object.entries(learner.identities)
      .filter(([peer]) => peer !== identity.targetPeerId)),
    configurationKey: configurationOf(learner.voters, [])});
  assert.ok(foundersOnly, 'a valid stamp that never held the target');
  await refusedOnForgedRow(f, 'a learner stamp that never held the target as its learner',
    {message_group_learner_stamp: JSON.stringify(foundersOnly)}, () => record(committed),
    'conflict');
  await refusedOnForgedRow(f, 'a learner stamp on the row that already names the target a voter',
    {message_group_learner_stamp: JSON.stringify(committedStampOfAnswer(committed.membership))},
    () => record(committed), 'conflict');
  assert.equal(receipts.submitted(), 0, 'no refused evidence reached the receipt');
  assert.deepEqual(f.row(), before);
  assert.equal((await record(committed)).outcome, 'recorded', 'positive control');
  assert.equal(receipts.applied(), 1);
});

test('the recorded voter fact is one pure predicate: every clause refuses its forgery',
  {timeout: 30000}, async (t) => {
    const fx = await promotionWorld(t); const {f} = fx;
    assert.equal((await fx.select()).outcome, 'recorded');
    assert.equal((await fx.propose()).reason, REASON.PROPOSED);
    assert.ok(votersEverywhere(f));
    assert.equal((await fx.recordVoter(otherFounder(f))).outcome, 'recorded');
    const operation = await f.repository.queryAuthoritativeOperationById(O);
    const encodedIdentity = operation.messageGroupMembershipIdentity;
    const identity = decodeMembershipIdentity(encodedIdentity);
    const valid = (changes) => {
      try {
        return recordedVoterFactIsValid({...operation, ...changes}, identity, encodedIdentity);
      } catch (error) {
        // A pure predicate that throws on a forged row is the defect the assertion names.
        return `thrown: ${error.message}`;
      }
    };
    assert.equal(valid({}), true, 'positive control: the recorded row is a valid voter fact');
    const permit = JSON.parse(operation.messageGroupMembershipPermit);
    const voter = JSON.parse(operation.messageGroupVoterStamp);
    const canonical = (stamp) => {
      const validated = committedStampOfAnswer(stamp);
      assert.ok(validated,
        'the forgery is a valid committed stamp: only the fact predicate refuses it');
      return JSON.stringify(validated);
    };
    const extra = 'forged-extra-member'; const extraPeer = deriveRaftRsPeerId(extra);
    const widened = (role) => {
      const voters = role === 'voter' ? [...voter.voters, extraPeer] : voter.voters;
      const learners = role === 'learner' ? [...voter.learners, extraPeer] : voter.learners;
      return canonical({...voter, voters, learners, identities: {...voter.identities,
        [extraPeer]: extra}, configurationKey: configurationOf(voters, learners)});
    };
    const leaderGeneration = permit.leaderConfigurationStamp.membershipGenerationIndex;
    const forgeries = {
      'a permit that does not decode': {messageGroupMembershipPermit: 'not-a-permit'},
      'identity columns disagreeing with the encoded identity': {sourceReplicaId: 'someone-else'},
      'a phase other than voter committed':
        {messageGroupMembershipPhase: PHASE.PROMOTION_IN_FLIGHT},
      'an in-flight permit state': {messageGroupMembershipPermit:
        JSON.stringify({...permit, permitState: 'in_flight', proposalIndex: null})},
      'a committed permit of another action of the transition':
        {messageGroupMembershipPermit: JSON.stringify({...permit, permitStage: 'add-learner'})},
      'a removal stamp present': {messageGroupRemovalStamp: operation.messageGroupVoterStamp},
      'a non-canonical permit encoding':
        {messageGroupMembershipPermit: ` ${operation.messageGroupMembershipPermit}`},
      'a learner stamp that does not decode': {messageGroupLearnerStamp: 'not-a-stamp'},
      'a voter stamp that does not decode': {messageGroupVoterStamp: 'not-a-stamp'},
      'a non-canonical voter stamp encoding':
        {messageGroupVoterStamp: ` ${operation.messageGroupVoterStamp}`},
      'a committed permit at another proposal index': {messageGroupMembershipPermit:
        JSON.stringify({...permit, proposalIndex: permit.proposalIndex + 1})},
      'a voter stamp with an extra voter': {messageGroupVoterStamp: widened('voter')},
      'a voter stamp with a voter exchanged for another peer': {messageGroupVoterStamp: (() => {
        const exchanged = voter.voters.find((peer) => peer !== identity.targetPeerId &&
          voter.identities[peer] !== identity.sourceReplicaId);
        const voters = voter.voters.map((peer) => (peer === exchanged ? extraPeer : peer));
        const identities = Object.fromEntries(Object.entries(voter.identities)
          .filter(([peer]) => peer !== exchanged).concat([[extraPeer, extra]]));
        return canonical({...voter, voters, identities,
          configurationKey: configurationOf(voters, voter.learners)});
      })()},
      'a voter stamp with an extra learner': {messageGroupVoterStamp: widened('learner')},
      'a voter stamp at the permit\'s own configuration generation': {
        messageGroupVoterStamp: canonical({...voter, membershipGenerationIndex: leaderGeneration}),
        messageGroupMembershipPermit: JSON.stringify({...permit, proposalIndex: leaderGeneration})},
      'a voter stamp of a term before the permit\'s':
        {messageGroupVoterStamp: canonical({...voter, term: permit.leaderTerm - 1})},
      'a voter stamp still naming the target a learner':
        {messageGroupVoterStamp: operation.messageGroupLearnerStamp},
      'a learner stamp that already names the target a voter':
        {messageGroupLearnerStamp: operation.messageGroupVoterStamp},
      'a learner stamp that dropped the source, with a voter stamp that dropped it too': (() => {
        const learner = JSON.parse(operation.messageGroupLearnerStamp);
        const sourcePeer = deriveRaftRsPeerId(identity.sourceReplicaId);
        const without = (stamp, learners) => {
          const voters = stamp.voters.filter((peer) => peer !== sourcePeer);
          const identities = Object.fromEntries(Object.entries(stamp.identities)
            .filter(([peer]) => peer !== sourcePeer));
          return canonical({...stamp, voters, learners, identities,
            leaderId: stamp.identities[voters[0]],
            configurationKey: configurationOf(voters, learners)});
        };
        return {messageGroupLearnerStamp: without(learner, learner.learners),
          messageGroupVoterStamp: without(voter, [])};
      })(),
      'a learner stamp that never held the target as its learner': {messageGroupLearnerStamp: (() => {
        const learner = JSON.parse(operation.messageGroupLearnerStamp);
        return canonical({...learner, learners: [],
          identities: Object.fromEntries(Object.entries(learner.identities)
            .filter(([peer]) => peer !== identity.targetPeerId)),
          configurationKey: configurationOf(learner.voters, [])});
      })()},
    };
    for (const [name, changes] of Object.entries(forgeries)) {
      assert.equal(valid(changes), false, name);
    }
  });

test('an expired holder records nothing and asks for no evidence: STALE_OWNER', {timeout: 30000},
  async (t) => {
    const fx = await promotionWorld(t); const {f} = fx;
    assert.equal((await fx.select()).outcome, 'recorded');
    const request = recordingRequest(f);
    const claim = JSON.parse(request.executionClaim);
    f.clock.advance(claim.expiresAt - f.clock.now() + 1);
    let asked = 0;
    const before = f.row(); const receipts = countWrites(f, VOTER_RECEIPT);
    const answer = await settled(f.repository.recordMessageGroupVoterOutcome(request, async () => {
      asked += 1; return null;
    }));
    assert.equal(answer.outcome, 'stale_owner', 'an expired holder is no live local holder');
    assert.equal(asked, 0, 'a stale holder asks for no native read');
    assert.equal(receipts.submitted(), 0); assert.deepEqual(f.row(), before);
  });

test('holder replacement around the receipt: a CAS defeated between its basis read and its ' +
  'write records nothing and is UNKNOWN; a receipt that committed before the holder was ' +
  'replaced is UNKNOWN to the obsolete caller though it is on the row', {timeout: 30000},
async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  assert.equal((await fx.select()).outcome, 'recorded');
  assert.equal((await fx.propose()).reason, REASON.PROPOSED);
  assert.ok(votersEverywhere(f));
  const request = recordingRequest(f);
  const claim = JSON.parse(request.executionClaim);
  const replaced = JSON.stringify({...claim, generation: claim.generation + 1});
  const swapHolder = () => setColumns(f, {[OWNER_CLAIM]: replaced});
  const restoreHolder = () => setColumns(f, {[OWNER_CLAIM]: request.executionClaim});
  const read = (replicaId) => (query) => f.cluster.node(replicaId).readCommittedMembership(query);
  const record = () => f.repository.recordMessageGroupVoterOutcome(request, read(otherFounder(f)));
  const receipts = countWrites(f, VOTER_RECEIPT);
  // (1) The holder is replaced after the basis row was read and the boot
  // re-sampled for the submission, before the CAS: the CAS matches nothing.
  let nodesReads = 0;
  f.pauseNodes(async () => {
    nodesReads += 1; if (nodesReads === 2) swapHolder();
  });
  const defeated = await record();
  f.pauseNodes(null);
  assert.equal(defeated.outcome, 'unknown', 'a defeated receipt CAS is UNKNOWN, never RECORDED');
  assert.deepEqual([receipts.submitted(), receipts.applied()], [1, 0],
    'the CAS was submitted once and applied nothing');
  assert.equal(f.row().message_group_membership_phase, PHASE.PROMOTION_IN_FLIGHT);
  assert.equal(f.row().message_group_voter_stamp, null, 'no voter stamp');
  restoreHolder();
  // (2) The receipt commits, then the holder is replaced before the readback:
  // the obsolete caller reports UNKNOWN even though its receipt is on the row.
  let written = false; let swapped = false;
  const execute = f.gateway.executeQuery;
  f.gateway.executeQuery = async (sql, ...args) => {
    const answer = await execute(sql, ...args);
    if (String(sql).includes(VOTER_RECEIPT)) written = true;
    return answer;
  };
  f.pauseOperation(async () => {
    if (written && !swapped) {
      swapped = true; swapHolder();
    }
  });
  const obsolete = await record();
  f.pauseOperation(null);
  assert.equal(obsolete.outcome, 'unknown',
    'an obsolete caller reports UNKNOWN even when its receipt committed');
  assert.equal(swapped, true, 'the holder was replaced before the readback');
  assert.equal(f.row().message_group_membership_phase, PHASE.VOTER_COMMITTED,
    'the receipt is on the row');
  assert.equal(receipts.applied(), 1);
  restoreHolder();
  assert.equal((await record()).outcome, 'recorded', 'the live holder reads it back: exact replay');
  assert.equal(receipts.submitted(), 2, 'the replay writes nothing');
});

test('concurrent recordings with disagreeing evidence: one receipt applies; the loser reports ' +
  'UNKNOWN, never RECORDED for evidence that is not on the row', {timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  assert.equal((await fx.select()).outcome, 'recorded');
  assert.equal((await fx.propose()).reason, REASON.PROPOSED);
  assert.ok(votersEverywhere(f));
  const request = recordingRequest(f);
  const committed = await f.cluster.node(FOUNDERS[0]).readCommittedMembership(
    learnerQuery(f, fx.permit()));
  assert.equal(committed.kind, KIND.COMMITTED);
  const disagreeing = {...committed, membership: {...committed.membership,
    gateOpen: !committed.membership.gateOpen}};
  assert.ok(committedStampOfAnswer(disagreeing.membership), 'a valid stamp that differs');
  // Lockstep: the first receipt waits until the second recording read its own
  // basis row (its fourth operation-row read overall), so both CAS over the
  // in-flight row and exactly one applies.
  let operationReads = 0; const secondBasisRead = Promise.withResolvers();
  f.pauseOperation(async () => {
    operationReads += 1; if (operationReads === 4) secondBasisRead.resolve();
  });
  const execute = f.gateway.executeQuery;
  f.gateway.executeQuery = async (sql, ...args) => {
    if (String(sql).includes(VOTER_RECEIPT)) await secondBasisRead.promise;
    return execute(sql, ...args);
  };
  const receipts = countWrites(f, VOTER_RECEIPT);
  const [first, second] = await Promise.all([
    f.repository.recordMessageGroupVoterOutcome(request, async () => committed),
    f.repository.recordMessageGroupVoterOutcome(request, async () => disagreeing)]);
  f.pauseOperation(null);
  assert.deepEqual([first.outcome, second.outcome], ['recorded', 'unknown'],
    'the receipt on the row is the first recorder\'s; the second proves nothing of its own');
  assert.deepEqual([receipts.submitted(), receipts.applied()], [2, 1], 'one receipt applied');
  assert.equal(f.row().message_group_voter_stamp,
    JSON.stringify(committedStampOfAnswer(committed.membership)), 'the first evidence is recorded');
});

test('V2 (crafted): a committed answer whose stamp carries one extra voter or one extra learner ' +
  'is not the learner configuration with exactly the target promoted', {timeout: 30000},
async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  assert.equal((await fx.select()).outcome, 'recorded');
  assert.equal((await fx.propose()).reason, REASON.PROPOSED);
  assert.ok(votersEverywhere(f));
  const request = recordingRequest(f);
  const committed = await f.cluster.node(FOUNDERS[0]).readCommittedMembership(
    learnerQuery(f, fx.permit()));
  assert.equal(committed.kind, KIND.COMMITTED);
  const extra = 'extra-member'; const extraPeer = deriveRaftRsPeerId(extra);
  const widened = (role) => {
    const membership = committed.membership;
    const voters = role === 'voter' ? [...membership.voters, extraPeer] : [...membership.voters];
    const learners = role === 'learner' ? [...membership.learners, extraPeer] :
      [...membership.learners];
    const widenedMembership = {...membership, voters, learners,
      identities: {...membership.identities, [extraPeer]: extra},
      configurationKey: configurationOf(voters, learners)};
    assert.ok(committedStampOfAnswer(widenedMembership), `${role}: a valid committed stamp`);
    return {...committed, membership: widenedMembership};
  };
  const receipts = countWrites(f, VOTER_RECEIPT); const before = f.row();
  for (const role of ['voter', 'learner']) {
    assert.equal((await f.repository.recordMessageGroupVoterOutcome(request,
      async () => widened(role))).outcome, 'conflict',
    `one extra ${role} is not exactly the target promoted`);
  }
  assert.equal(receipts.submitted(), 0); assert.deepEqual(f.row(), before);
  assert.equal((await f.repository.recordMessageGroupVoterOutcome(request, async () => committed))
    .outcome, 'recorded', 'positive control');
});

test('V2 (real schedule, F1): an unrelated learner joins before the ordered successor commits: ' +
  'the promotion commits natively but its voter stamp can never be recorded; fail closed, the ' +
  'debt stays for an operator (J1)', {timeout: 60000}, async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  assert.equal((await fx.select()).outcome, 'recorded');
  const promotion = fx.permit(); const leader = leaderOf(f);
  const other = 'unrelated-learner';
  for (const id of FOUNDERS) {
    f.cluster.replica(id).db.prepare('INSERT INTO raft_rs_peer_identity ' +
      '(replica_identity, raft_peer_id) VALUES (?, ?)').run(other, deriveRaftRsPeerId(other));
  }
  const added = await f.cluster.node(leader).proposeConfChange({
    type: RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER, replicaIdentity: other});
  assert.equal(added.outcome, RAFT_OPERATION_OUTCOME.CORE_OK, JSON.stringify(added));
  assert.ok(f.cluster.settle(() => FOUNDERS.every((id) => f.cluster.node(id).readStatus()
    .confState.learners.map(String).includes(deriveRaftRsPeerId(other)))),
  'every founder applied the unrelated learner');
  const proposals = f.proposalCount();
  assert.equal((await fx.propose(leader)).reason, REASON.STALE_CONFIGURATION,
    'the issued attempt is fenced to the configuration before the unrelated change');
  assert.equal(f.proposalCount(), proposals, 'nothing reaches the core');
  assert.equal((await fx.recordVoter(leader)).outcome, 'unknown',
    'the same-term leader fences nothing');
  const fencing = otherFounder(f);
  transferLeadership(f, fencing);
  assert.equal((await fx.recordVoter(fencing)).outcome, 'noncommitted',
    'the fencing leader holds the target as a learner: the attempt never committed');
  assert.equal((await fx.issueSuccessor(fencing)).outcome, 'recorded', 'the ordered successor');
  assert.equal(fx.permit().permitSequence, promotion.permitSequence + 1);
  assert.equal(await caughtUp(fx, fencing), true);
  assert.equal((await fx.propose(fencing)).reason, REASON.PROPOSED, 'the successor commits natively');
  assert.ok(votersEverywhere(f));
  const receipts = countWrites(f, VOTER_RECEIPT); const before = f.row();
  for (const witness of FOUNDERS) {
    assert.equal((await fx.recordVoter(witness)).outcome, 'conflict',
      `${witness}: a voter stamp carrying the unrelated learner is not exactly the target promoted`);
  }
  assert.equal(receipts.submitted(), 0, 'nothing written'); assert.deepEqual(f.row(), before);
  assert.deepEqual([f.row().message_group_membership_phase,
    f.row().message_group_membership_obligation_state], [PHASE.PROMOTION_IN_FLIGHT, 'unknown'],
  'F1: the promotion debt is retained and visible; an operator must resolve it');
});
