/** Ordered successor of the message-group learner action (runbook 6.C, C1).
 *
 * An integration witness (test/guidelines/harness.md): it needs the real group,
 * the real lane and two real routers, like its message-group learner siblings.
 *
 * Real three-founder raft-rs group (PartitionNodeCluster), the real
 * ReplicaOperationRepository on file-backed canonical operation SQL, two real
 * MessageRouters with a registered MessageGroupServiceHandler, the production
 * discovery turn (OperationWorkflowOwner) on the real lane, and the existing
 * runtime learner consumer. Operation SQL, node rows and the service census
 * are explicit fixtures: this is not a physical network, distributed SQL or
 * SIGKILL proof. Every founder is reachable through the SUCCESSOR handler; the
 * services census (a route hint) names the witness each turn asks.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as admission from '../../src/raft/raft-rs-group-membership-admission.js';
import {RAFT_MEMBERSHIP_TRANSITION_REASON as REASON,
  RAFT_MEMBERSHIP_AUTHORIZATION_REASON as AUTHORIZATION, RAFT_OPERATION_OUTCOME,
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR} from '../../src/raft/raft-operation-port-constants.js';
import {RUNTIME_REASON} from '../../src/raft/raft-rs-runtime-owner-constants.js';
import {RAFT_RS_LEARNER_ADMISSION_COLUMN} from '../../src/raft/raft-rs-peer-identity-constants.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE as PURPOSE,
  COMMITTED_LEARNER_ACTION_KIND as KIND, COMMITTED_LEARNER_ACTION_REASON as ACTION_REASON} from
  '../../src/raft/raft-committed-membership-constants.js';
import {MEMBERSHIP_PHASE as PHASE, MEMBERSHIP_DEBT_RECOVERY_OUTCOME as DEBT} from
  '../../src/rebalancer/replica-operation-message-group-membership-permit.js';
import {DEBT_CENSUS} from
  '../../src/rebalancer/operation-workflow-message-group-membership-recovery.js';
import {MessageGroupServiceHandler} from '../../src/node/message-group-service-handler.js';
import {committedMembershipContext} from '../../src/raft/raft-rs-committed-membership-context.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {durableLog} from '../raft/raft-rs-backend/committed-membership-oracles.js';
import {loadRaftRsCore} from '../raft/raft-rs-backend/raw-raft-rs-test-core.js';
import {fixture, GROUP, FOUNDERS, TARGET, NODE, SUCCESSOR, O, NOW} from
  '../test-helpers/learner-operation-fixture.js';
import {connectRouters, workflowOwner, withoutReceipt, expireClaim} from
  '../test-helpers/learner-recipient-fixture.js';

const SUCCESSOR_PERMIT_WRITE = 'SET message_group_membership_permit = ? WHERE';
const RECEIPT_WRITE = 'message_group_learner_stamp = ?';
const PERMIT_COLUMN = 'message_group_membership_permit';
const noRefusals = {available: true, found: 1, recorded: 0, settled: 0, retained: 0, refused: 0};
const summaryOf = (fields) => ({...noRefusals, ...fields});
const permitOf = (f) => JSON.parse(f.row()[PERMIT_COLUMN]);
const sweep = (owner) => owner.reconcileMessageGroupMembershipDebt(DEBT_CENSUS.AUTHORITATIVE);

async function successorFixture(t) {
  const f = await fixture(t);
  const {source, recipient} = await connectRouters(t);
  const services = new Map(FOUNDERS.map((id) => [id,
    {nodeId: SUCCESSOR, replicaId: id, groupId: GROUP, raft: f.cluster.node(id)}]));
  let physical = 0;
  const unexpectedPhysical = async () => {
    physical += 1; throw new Error('no CREATE allowed');
  };
  const handler = new MessageGroupServiceHandler({nodeId: SUCCESSOR,
    systemTableCache: {get: () => null}, cdcIntegrationService: {},
    controlPlaneSystemTableGateway: f.gateway, createMessageGroupReplica: unexpectedPhysical,
    startMessageGroupReplica: unexpectedPhysical, stopMessageGroupReplica: unexpectedPhysical,
    resolveLocalMessageGroupReplica: (id) => services.get(id) ?? null});
  handler.initialize(); handler.registerWithRouter(recipient);
  t.after(() => handler.shutdown());
  let shuttingDown = false;
  const owner = workflowOwner({nodeId: NODE, repository: f.repository, messageRouter: source,
    realLane: true, isShuttingDown: () => shuttingDown, timeSource: f.clock});
  return {f, source, recipient, owner, physical: () => physical,
    shutOwner: () => {
      shuttingDown = true;
    }};
}
// Successor CAS submissions and how many rows each changed, by the gateway's answer.
function countSuccessorWrites(f) {
  const writes = []; const execute = f.gateway.executeQuery;
  f.gateway.executeQuery = async (sql, ...args) => {
    const answer = await execute(sql, ...args);
    if (String(sql).includes(SUCCESSOR_PERMIT_WRITE)) writes.push(answer?.affectedRows ?? 0);
    return answer;
  };
  return {submitted: () => writes.length, applied: () => writes.filter((n) => n === 1).length};
}
function countReceiptWrites(f) {
  let count = 0; const execute = f.gateway.executeQuery;
  f.gateway.executeQuery = (sql, ...args) => {
    if (String(sql).includes(RECEIPT_WRITE)) count += 1;
    return execute(sql, ...args);
  };
  return () => count;
}
const leaderAmong = (f, ids) => ids.find((id) =>
  f.cluster.node(id).readStatus().role === RAFT_ROLE.LEADER) ?? null;
// The old leader is cut off; the two survivors elect a leader of a newer term.
// The settle stops at the start of the round after the election: the new
// leader has not yet stepped its follower's acknowledgement, so no entry of
// its own term is committed (its applied index is still the old prefix).
function electSurvivor(f, oldLeader) {
  const survivors = FOUNDERS.filter((id) => id !== oldLeader);
  f.cluster.tickers = survivors;
  assert.ok(f.cluster.settle(() => leaderAmong(f, survivors) !== null),
    'a surviving voter must win the newer term');
  return leaderAmong(f, survivors);
}
// Deliver until the new leader has applied past the old prefix: an entry of
// its own term is committed and applied there.
function commitOwnTerm(f, leader, oldApplied) {
  assert.ok(f.cluster.settle(() =>
    f.cluster.node(leader).readStatus().appliedIndex > oldApplied),
  'the new leader must commit and apply an entry of its own term');
}
const learnerEverywhere = (f, ids, peer) => f.cluster.settle(() => ids.every((id) =>
  f.cluster.node(id).readStatus().confState.learners.includes(peer)));
function learnerQuery(f, permitSequence) {
  const identity = JSON.parse(f.request.identity);
  return {purpose: PURPOSE.LEARNER_ACTION, groupId: GROUP, action: {operationId: O,
    transitionIdentity: identity.transitionIdentity, permitSequence, stage: 'add-learner',
    replicaIdentity: identity.targetReplicaId, peerId: identity.targetPeerId}};
}
const readAction = (f, replicaId, permitSequence) =>
  f.cluster.node(replicaId).readCommittedMembership(learnerQuery(f, permitSequence));
// Committed ADD_LEARNER entries for the target in a replica's durable log,
// by the permit sequence their replicated context carries.
function learnerEntrySequences(f, replicaId) {
  const core = loadRaftRsCore();
  const commit = f.cluster.node(replicaId).readStatus().commitIndex;
  return durableLog(f.cluster.replica(replicaId).dbFile, GROUP)
    .filter(({index}) => index <= commit)
    .map((entry) => {
      try {
        return committedMembershipContext(
          core.decode_conf_change_entry(entry.entryType, entry.data));
      } catch {
        return null;
      }
    })
    .filter((context) => context?.replicaIdentity === TARGET)
    .map((context) => context.permitSequence);
}
// A delivery the recipient router hands its registered address for a message
// the source router actually sent: the host binding the runtime consumer admits.
async function recipientDelivery(fx) {
  const address = `${SUCCESSOR}/message-group/successor-delivery-witness`;
  const received = Promise.withResolvers();
  fx.recipient.register(address, (_envelope, delivery) => {
    received.resolve(delivery); return {accepted: true};
  });
  await fx.source.deliver(address, {probe: true},
    {targetNodeId: SUCCESSOR, deliveryPriority: 'critical', timeoutMs: 5000});
  return received.promise;
}
// The existing runtime consumer proposes the row's issued attempt at the
// destination the permit names, through the leader replica's real port.
async function proposeIssued(fx, leader) {
  const {f} = fx; const row = f.row();
  const request = {operationId: O, identity: f.request.identity, permit: row[PERMIT_COLUMN],
    executionClaim: row.message_group_membership_owner_claim};
  const receiver = {groupId: GROUP, nodeId: SUCCESSOR, bootIncarnation: 1,
    localReplicaIdentity: leader, senderNodeId: NODE, senderBootIncarnation: 1};
  const recipient = f.repositoryFor(SUCCESSOR);
  return admission.proposeAuthorizedGroupLearner(f.cluster.node(leader), receiver, request,
    recipient.observeMessageGroupLearnerAuthorization.bind(recipient), await recipientDelivery(fx));
}

test('C1 owner path: the discovery turn issues exactly one ordered successor through the ' +
  'repository once the recorder proves the predecessor noncommitted at a fencing leader; the ' +
  'delayed predecessor never commits and the successor is proposed, committed and recorded once',
{timeout: 30000}, async (t) => {
  const fx = await successorFixture(t); const {f} = fx;
  const predecessor = permitOf(f); const oldLeader = f.leader;
  const oldApplied = f.cluster.node(oldLeader).readStatus().appliedIndex;
  const peer = JSON.parse(f.request.identity).targetPeerId;
  const writes = countSuccessorWrites(f);
  f.cluster.isolate(oldLeader);
  const delayed = await f.run();
  assert.equal(delayed.reason, REASON.PROPOSED,
    'the predecessor reached the native turn of the old leader, now cut off');
  const newLeader = electSurvivor(f, oldLeader);
  assert.equal(f.cluster.node(newLeader).readStatus().appliedIndex, oldApplied,
    'window: the new leader has applied no entry of its own term');
  f.hostWitness(SUCCESSOR, newLeader);
  const before = {...f.row()};
  assert.deepEqual(await sweep(fx.owner), summaryOf({retained: 1}),
    'a newer term whose own entry is not yet applied does not fence the predecessor');
  assert.equal(writes.submitted(), 0, 'no successor while the predecessor may still commit');
  assert.deepEqual(f.row(), before);
  commitOwnTerm(f, newLeader, oldApplied);
  const status = f.cluster.node(newLeader).readStatus();
  assert.deepEqual(await sweep(fx.owner), summaryOf({retained: 1}),
    'the issued successor keeps the debt until its exact outcome is recorded');
  const successor = permitOf(f);
  assert.equal(successor.permitSequence, predecessor.permitSequence + 1,
    'the successor carries the next permit sequence of the same transition');
  assert.equal(writes.applied(), 1, 'exactly one successor permit is written');
  assert.deepEqual({...successor, permitSequence: 0, leaderTerm: 0,
    leaderConfigurationStamp: null, replicaLifecycleIncarnation: null, runtimeGeneration: 0,
    destinationNodeId: null}, {...predecessor, permitSequence: 0, leaderTerm: 0,
    leaderConfigurationStamp: null, replicaLifecycleIncarnation: null, runtimeGeneration: 0,
    destinationNodeId: null}, 'only the native fences, sequence and destination move');
  assert.ok(successor.leaderTerm > predecessor.leaderTerm, 'a strictly newer leader term');
  assert.deepEqual([successor.leaderTerm, successor.leaderConfigurationStamp,
    successor.replicaLifecycleIncarnation, successor.runtimeGeneration,
    successor.destinationNodeId], [status.term, {configurationKey: status.configurationKey,
    membershipGenerationIndex: status.membershipGenerationIndex}, status.lifecycleIncarnation,
  status.runtimeGeneration, SUCCESSOR], 'the fences of the fencing leader observation');
  assert.deepEqual(withoutPermit(f.row()), withoutPermit(before),
    'issuance changes only the permit column');
  assert.equal(f.row().message_group_membership_phase, PHASE.LEARNER_IN_FLIGHT);
  assert.equal(status.currentTermApplied, true, 'the fence: the leader applied its own term');
  const proposals = f.proposalCount();
  const proposed = await proposeIssued(fx, newLeader);
  assert.equal(proposed.reason, REASON.PROPOSED, 'the runtime consumer proposes the successor');
  assert.equal(f.proposalCount(), proposals + 1);
  const survivors = FOUNDERS.filter((id) => id !== oldLeader);
  assert.ok(learnerEverywhere(f, survivors, peer), 'the successor commits on the quorum');
  f.cluster.heal(oldLeader); f.cluster.tickers = [newLeader];
  assert.ok(learnerEverywhere(f, FOUNDERS, peer), 'the healed old leader applies the successor');
  const late = f.proposalCount();
  assert.equal((await f.run()).reason, AUTHORIZATION.MISMATCH,
    'a delayed predecessor request finds the successor on the row and is refused');
  assert.equal((await f.cluster.node(oldLeader).proposeMembershipTransition(
    transitionOf(f, predecessor))).reason, REASON.STALE_LEADERSHIP,
  'a delayed predecessor native turn is refused at its old leader');
  assert.equal(f.proposalCount(), late, 'the delayed predecessor is proposed nowhere');
  for (const id of FOUNDERS) {
    assert.deepEqual(learnerEntrySequences(f, id), [successor.permitSequence],
      `${id}: one committed learner entry, the successor's; the delayed predecessor never commits`);
    assert.equal((await readAction(f, id, successor.permitSequence)).kind, 'committed-action');
    assert.notEqual((await readAction(f, id, predecessor.permitSequence)).kind,
      'committed-action', `${id}: the predecessor has no committed origin`);
  }
  const receipts = countReceiptWrites(f); const issued = {...f.row()};
  assert.deepEqual(await sweep(fx.owner), summaryOf({recorded: 1}),
    'the next turn records the successor\'s exact committed outcome');
  assert.deepEqual(withoutReceipt(f.row()), withoutReceipt(issued),
    'recording changes only the three receipt columns');
  assert.equal(f.row().message_group_membership_phase, PHASE.LEARNER_COMMITTED);
  assert.deepEqual(permitOf(f), {...successor, permitState: 'committed',
    proposalIndex: proposed.proposalIndex}, 'the recorded permit is the successor, committed');
  assert.deepEqual(await sweep(fx.owner), summaryOf({settled: 1}));
  assert.equal(receipts(), 1, 'recorded exactly once');
  assert.equal(writes.applied(), 1); assert.equal(fx.physical(), 0);
  assert.equal(f.row().message_group_membership_obligation_state, 'unknown',
    'recording the learner fact does not settle the membership obligation');
});
function withoutPermit(row) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => key !== PERMIT_COLUMN));
}
// The old leader's own term is superseded and the survivor's leader has
// applied an entry of its term: the state in which the predecessor, absent
// there, can never commit.
async function fencedPredecessor(t, {propose = false} = {}) {
  const fx = await successorFixture(t); const {f} = fx;
  const oldLeader = f.leader;
  const oldApplied = f.cluster.node(oldLeader).readStatus().appliedIndex;
  f.cluster.isolate(oldLeader);
  if (propose) assert.equal((await f.run()).reason, REASON.PROPOSED);
  const newLeader = electSurvivor(f, oldLeader);
  commitOwnTerm(f, newLeader, oldApplied);
  f.hostWitness(SUCCESSOR, newLeader);
  return {fx, f, oldLeader, newLeader, predecessor: permitOf(f)};
}
function deliverTo(f, replicaId) {
  const replica = f.cluster.replica(replicaId);
  for (const envelope of replica.inbox.splice(0)) replica.node.step(envelope);
  replica.node.tick();
}
// The native transition a permit carries, as the runtime consumer builds it.
function transitionOf(f, permit) {
  return {operationId: O, transitionIdentity: permit.transitionIdentity,
    permitSequence: permit.permitSequence, stage: permit.permitStage,
    replicaIdentity: permit.replicaIdentity,
    peerAddress: JSON.parse(f.request.identity).targetAddress,
    replicaLifecycleIncarnation: permit.replicaLifecycleIncarnation,
    runtimeGeneration: permit.runtimeGeneration, leaderTerm: permit.leaderTerm,
    leaderConfigurationStamp: permit.leaderConfigurationStamp};
}
// What a successor of the predecessor would carry if it were bound to this
// observation: the same transition and target, the next sequence, these fences.
function successorShapedTransition(f, predecessor, status) {
  return transitionOf(f, {...predecessor, permitSequence: predecessor.permitSequence + 1,
    replicaLifecycleIncarnation: status.lifecycleIncarnation,
    runtimeGeneration: status.runtimeGeneration, leaderTerm: status.term,
    leaderConfigurationStamp: {configurationKey: status.configurationKey,
      membershipGenerationIndex: status.membershipGenerationIndex}});
}
function captureLog(owner) {
  const logged = {debug: [], info: [], warn: []};
  owner.logger = {error() {}, debug: (_m, event) => logged.debug.push(event),
    info: (_m, event) => logged.info.push(event), warn: (_m, event) => logged.warn.push(event)};
  return logged;
}
function holdSuccessorWrite(f, t) {
  const entered = Promise.withResolvers(); const release = Promise.withResolvers();
  const execute = f.gateway.executeQuery; let held = false;
  f.gateway.executeQuery = async (sql, ...args) => {
    if (!held && String(sql).includes(SUCCESSOR_PERMIT_WRITE)) {
      held = true; entered.resolve(); await release.promise;
    }
    return execute(sql, ...args);
  };
  t.after(release.resolve);
  return {entered: entered.promise, release: release.resolve};
}
// Whether the held successor CAS was submitted before the turn finished.
const submitted = (held, turn) =>
  Promise.race([held.entered.then(() => true), turn.then(() => false)]);
async function settleFailed(f) {
  const row = await f.repository.queryAuthoritativeOperationById(O);
  await f.repository.persistOperationUpdate({...row, status: ReplicaStatus.FAILED,
    workflowStep: WORKFLOW_STEP.FAILED, completedAt: NOW + 1, updatedAt: NOW + 1},
  {confirmPersistence: false, disableSystemWriteSession: true, returnDisposition: true,
    expectedWorkflowStep: WORKFLOW_STEP.PENDING, terminalTransition: true});
}

test('the recorder\'s exact read decides first: a committed predecessor is recorded with its ' +
  'exact fact and gets no successor, even when a fencing leader answers', {timeout: 30000},
async (t) => {
  const fx = await successorFixture(t); const {f} = fx;
  const predecessor = permitOf(f); const oldLeader = f.leader;
  const peer = JSON.parse(f.request.identity).targetPeerId;
  const writes = countSuccessorWrites(f);
  const proposed = await f.run();
  assert.equal(proposed.reason, REASON.PROPOSED);
  assert.ok(learnerEverywhere(f, FOUNDERS, peer), 'the predecessor commits normally');
  const applied = f.cluster.node(oldLeader).readStatus().appliedIndex;
  f.cluster.isolate(oldLeader);
  const newLeader = electSurvivor(f, oldLeader); commitOwnTerm(f, newLeader, applied);
  const status = f.cluster.node(newLeader).readStatus();
  assert.ok(status.term > predecessor.leaderTerm && status.currentTermApplied === true,
    'the witness would fence an attempt it had not applied');
  f.hostWitness(SUCCESSOR, newLeader);
  assert.deepEqual(await sweep(fx.owner), summaryOf({recorded: 1}),
    'the committed outcome is recovered through the existing recorder');
  assert.deepEqual(permitOf(f), {...predecessor, permitState: 'committed',
    proposalIndex: proposed.proposalIndex}, 'the predecessor\'s exact fact is recorded');
  assert.equal(writes.submitted(), 0, 'no successor for a committed predecessor');
  assert.deepEqual(await sweep(fx.owner), summaryOf({settled: 1}));
  for (const id of FOUNDERS.filter((replica) => replica !== oldLeader)) {
    assert.deepEqual(learnerEntrySequences(f, id), [predecessor.permitSequence]);
  }
  assert.equal(fx.physical(), 0);
});

test('absence is noncommitment only when its own observation fences the predecessor: the ' +
  'same-term leader and a newer-term follower keep the debt; the fencing leader then issues',
{timeout: 30000}, async (t) => {
  const fx = await successorFixture(t); const {f} = fx;
  const predecessor = permitOf(f); const oldLeader = f.leader;
  const oldApplied = f.cluster.node(oldLeader).readStatus().appliedIndex;
  const writes = countSuccessorWrites(f); const before = {...f.row()};
  f.hostWitness(SUCCESSOR, oldLeader);
  const own = f.cluster.node(oldLeader).readStatus();
  assert.equal(own.term, predecessor.leaderTerm);
  assert.equal(own.currentTermApplied, true, 'the predecessor\'s own leader applied its term');
  const absent = await readAction(f, oldLeader, predecessor.permitSequence);
  assert.equal(absent.kind, KIND.UNRESOLVED);
  assert.equal(absent.reason, ACTION_REASON.NOT_RECORDED);
  assert.equal(absent.observation.term, predecessor.leaderTerm);
  assert.deepEqual(await sweep(fx.owner), summaryOf({retained: 1}),
    'the predecessor\'s own term still leads: the attempt may yet be proposed and commit');
  assert.equal(writes.submitted(), 0); assert.deepEqual(f.row(), before);
  f.cluster.isolate(oldLeader);
  const newLeader = electSurvivor(f, oldLeader); commitOwnTerm(f, newLeader, oldApplied);
  const follower = FOUNDERS.find((id) => id !== oldLeader && id !== newLeader);
  const followerStatus = f.cluster.node(follower).readStatus();
  assert.ok(followerStatus.term > predecessor.leaderTerm);
  assert.equal(followerStatus.currentTermApplied, false, 'a follower never fences');
  f.serviceRows.length = 0; f.hostWitness(SUCCESSOR, follower);
  assert.deepEqual(await sweep(fx.owner), summaryOf({retained: 1}),
    'a follower of the newer term is not the fencing leader');
  assert.equal(writes.submitted(), 0); assert.deepEqual(f.row(), before);
  f.serviceRows.length = 0; f.hostWitness(SUCCESSOR, newLeader);
  assert.deepEqual(await sweep(fx.owner), summaryOf({retained: 1}));
  assert.equal(writes.applied(), 1, 'positive control: the fencing leader issues the successor');
  assert.equal(permitOf(f).permitSequence, predecessor.permitSequence + 1);
});

test('UNKNOWN keeps the debt: with the predecessor in the new leader\'s log and its own term ' +
  'not applied, no successor is issued; the native single-pending and configuration rules ' +
  'refuse a successor-shaped proposal; the delayed predecessor commits and is recorded',
{timeout: 30000}, async (t) => {
  const fx = await successorFixture(t); const {f} = fx;
  const predecessor = permitOf(f); const oldLeader = f.leader;
  const peer = JSON.parse(f.request.identity).targetPeerId;
  const [kept, missed] = FOUNDERS.filter((id) => id !== oldLeader);
  const writes = countSuccessorWrites(f);
  assert.equal((await f.run()).reason, REASON.PROPOSED);
  f.cluster.replica(missed).inbox.length = 0;
  deliverTo(f, kept);
  f.cluster.isolate(oldLeader);
  // Both survivors tick; only the one holding the predecessor can win (the other's
  // log is behind it), and the settle stops before it commits an entry of its term.
  f.cluster.tickers = [kept, missed];
  assert.ok(f.cluster.settle(() =>
    f.cluster.node(kept).readStatus().role === RAFT_ROLE.LEADER), 'the survivor holding ' +
    'the predecessor wins the newer term');
  const window = f.cluster.node(kept).readStatus();
  assert.ok(window.term > predecessor.leaderTerm);
  assert.equal(window.currentTermApplied, false,
    'no entry of its term is applied: the predecessor may still commit');
  f.hostWitness(SUCCESSOR, kept); const before = {...f.row()};
  assert.deepEqual(await sweep(fx.owner), summaryOf({retained: 1}));
  assert.equal(writes.submitted(), 0, 'no successor while the outcome is unresolved');
  assert.deepEqual(f.row(), before, 'the debt and the predecessor permit are retained');
  admission.reserveGroupPeerIdentity({groupId: GROUP, localReplicaIdentity: kept}, TARGET);
  const shaped = successorShapedTransition(f, predecessor, window);
  const proposals = f.proposalCount();
  const deferred = await f.cluster.node(kept).proposeMembershipTransition(shaped);
  assert.equal(deferred.reason, RUNTIME_REASON.CONF_CHANGE_PENDING,
    'the leader\'s one pending configuration change defers any successor');
  assert.equal(f.proposalCount(), proposals, 'nothing reaches the core');
  assert.ok(learnerEverywhere(f, [kept, missed], peer),
    'the delayed predecessor commits with the new leader\'s own entry');
  const refused = await f.cluster.node(kept).proposeMembershipTransition(shaped);
  assert.equal(refused.reason, REASON.STALE_CONFIGURATION,
    'once the predecessor applied, a successor bound to the absence is refused');
  assert.equal(f.proposalCount(), proposals);
  assert.deepEqual(await sweep(fx.owner), summaryOf({recorded: 1}),
    'the recorder records the predecessor\'s exact fact');
  assert.equal(permitOf(f).permitSequence, predecessor.permitSequence);
  assert.equal(permitOf(f).permitState, 'committed');
  assert.equal(writes.submitted(), 0);
  for (const id of [kept, missed]) {
    assert.deepEqual(learnerEntrySequences(f, id), [predecessor.permitSequence],
      `${id}: exactly one learner entry, the predecessor's`);
  }
});

test('STALE_LEADERSHIP is never escaped by refreshing the old permit: the runtime consumer ' +
  'refuses it at its own replica and at the new leader, the initial authorizer refuses a ' +
  'refreshed sequence-1 permit, and only the fenced successor with the next sequence is issued, ' +
  'at a leader whose registry never reserved the target',
{timeout: 30000}, async (t) => {
  const {fx, f, oldLeader, newLeader, predecessor} = await fencedPredecessor(t);
  const writes = countSuccessorWrites(f);
  f.cluster.heal(oldLeader); f.cluster.tickers = [newLeader];
  assert.ok(f.cluster.settle(() =>
    f.cluster.node(oldLeader).readStatus().term === f.cluster.node(newLeader).readStatus().term),
  'the old leader learns the newer term');
  const proposals = f.proposalCount();
  assert.equal((await f.run()).reason, REASON.STALE_LEADERSHIP,
    'the old permit at its own replica: its leader term is no longer led');
  const atNewLeader = await admission.proposeAuthorizedGroupLearner(f.cluster.node(newLeader),
    {...f.receiver, localReplicaIdentity: newLeader}, f.request, f.observe, f.delivery);
  assert.notEqual(atNewLeader.reason, REASON.PROPOSED,
    'the old permit is not refreshed into the new leader\'s fences');
  assert.equal(f.proposalCount(), proposals, 'the old permit is proposed nowhere');
  const status = f.cluster.node(newLeader).readStatus();
  const refreshed = JSON.stringify({...predecessor, leaderTerm: status.term,
    leaderConfigurationStamp: {configurationKey: status.configurationKey,
      membershipGenerationIndex: status.membershipGenerationIndex},
    replicaLifecycleIncarnation: status.lifecycleIncarnation,
    runtimeGeneration: status.runtimeGeneration});
  assert.equal((await f.repository.authorizeMessageGroupLearner({operationId: O,
    identity: f.request.identity, permit: refreshed})).outcome, 'conflict',
  'an issued permit is never rewritten with a refreshed term at its own sequence');
  assert.equal(f.row()[PERMIT_COLUMN], f.request.permit, 'the old permit stays byte-identical');
  // The refused attempt reserved the target at the new leader (the runtime
  // consumer reserves before its native turn): that registry no longer vouches.
  assert.deepEqual(await sweep(fx.owner), summaryOf({retained: 1}),
    'fail closed: a leader holding an unvouched reservation never fences');
  assert.equal(writes.submitted(), 0);
  const third = FOUNDERS.find((id) => id !== oldLeader && id !== newLeader);
  const applied = f.cluster.node(third).readStatus().appliedIndex;
  assert.equal(f.cluster.node(newLeader).transferLeadership({
    successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED, replicaIdentity: third}).outcome,
  RAFT_OPERATION_OUTCOME.CORE_OK);
  f.cluster.tickers = [third];
  assert.ok(f.cluster.settle(() => f.cluster.node(third).readStatus().role === RAFT_ROLE.LEADER &&
    f.cluster.node(third).readStatus().appliedIndex > applied),
  'the founder that never reserved the target leads and applies its own term');
  f.serviceRows.length = 0; f.hostWitness(SUCCESSOR, third);
  assert.deepEqual(await sweep(fx.owner), summaryOf({retained: 1}));
  const successor = permitOf(f);
  assert.equal(successor.permitSequence, predecessor.permitSequence + 1,
    'the only way past the stale leadership is the ordered successor');
  assert.equal(successor.leaderTerm, f.cluster.node(third).readStatus().term);
  assert.ok(successor.leaderTerm > predecessor.leaderTerm);
  assert.equal(writes.applied(), 1); assert.equal(f.proposalCount(), proposals);
});

test('duplicate and lost-answer successor requests leave exactly one permit: two issuers ' +
  'racing over the same predecessor apply one CAS, a lost CAS answer is resolved by exact ' +
  'readback, and the issued successor is not fenced at its own term', {timeout: 30000},
async (t) => {
  await t.test('two issuers race over the same predecessor', async (t) => {
    const {fx, f, predecessor} = await fencedPredecessor(t);
    const writes = countSuccessorWrites(f);
    const held = holdSuccessorWrite(f, t);
    const first = sweep(fx.owner);
    assert.equal(await submitted(held, first), true,
      'the first issuer reaches its successor CAS, which is held there');
    const second = workflowOwner({nodeId: NODE, repository: f.repositoryFor(NODE),
      messageRouter: fx.source, realLane: true, timeSource: f.clock});
    assert.deepEqual(await sweep(second), summaryOf({retained: 1}),
      'the second issuer proves the same fence and writes its successor');
    const issued = f.row()[PERMIT_COLUMN];
    held.release();
    assert.deepEqual(await first, summaryOf({retained: 1}),
      'the first issuer\'s held CAS loses and reads the one successor back');
    assert.equal(writes.submitted(), 2, 'both issuers really submitted over the predecessor');
    assert.equal(writes.applied(), 1, 'exactly one CAS applied');
    assert.equal(f.row()[PERMIT_COLUMN], issued);
    assert.equal(JSON.parse(issued).permitSequence, predecessor.permitSequence + 1);
  });
  await t.test('a lost CAS answer, then repeated turns', async (t) => {
    const {fx, f, predecessor} = await fencedPredecessor(t, {propose: true});
    const writes = countSuccessorWrites(f);
    const execute = f.gateway.executeQuery; let lost = false;
    f.gateway.executeQuery = async (sql, ...args) => {
      const answer = await execute(sql, ...args);
      if (!lost && String(sql).includes(SUCCESSOR_PERMIT_WRITE)) {
        lost = true; f.failReads('replica_operations');
        return {success: false, error: 'fixture: CAS answer lost after commit'};
      }
      return answer;
    };
    const lostTurn = await sweep(fx.owner);
    f.failReads(null);
    assert.deepEqual(lostTurn, summaryOf({retained: 1}),
      'an unreadable answer is UNKNOWN, never success or a reason to write again');
    assert.equal(writes.applied(), 1, 'the lost answer had in fact committed');
    const issued = f.row()[PERMIT_COLUMN];
    assert.equal(JSON.parse(issued).permitSequence, predecessor.permitSequence + 1);
    for (let turn = 0; turn < 2; turn += 1) {
      assert.deepEqual(await sweep(fx.owner), summaryOf({retained: 1}),
        'the issued successor is not fenced at its own leader term');
    }
    assert.equal(writes.submitted(), 1, 'no second permit');
    assert.equal(f.row()[PERMIT_COLUMN], issued, 'the one issued successor stands');
  });
});

test('process loss between fencing and issuance: an owner stopped before its CAS submits ' +
  'nothing and the restarted owner issues once; a held old submission cannot overwrite the ' +
  'successor a new holder issued after takeover', {timeout: 30000}, async (t) => {
  await t.test('stopped before the CAS', async (t) => {
    const {fx, f, predecessor} = await fencedPredecessor(t);
    const writes = countSuccessorWrites(f);
    f.pauseNodes(async () => {
      f.pauseNodes(null); fx.shutOwner();
    });
    assert.deepEqual(await sweep(fx.owner), summaryOf({retained: 1}),
      'the stopped owner\'s turn ends unresolved');
    assert.equal(writes.submitted(), 0, 'no submission after the owner stopped');
    assert.equal(f.row()[PERMIT_COLUMN], f.request.permit);
    const restarted = workflowOwner({nodeId: NODE, repository: f.reopenOperations(),
      messageRouter: fx.source, realLane: true, timeSource: f.clock});
    assert.deepEqual(await sweep(restarted), summaryOf({retained: 1}));
    assert.equal(writes.applied(), 1, 'the restarted owner re-proves the fence and issues once');
    assert.equal(permitOf(f).permitSequence, predecessor.permitSequence + 1);
    assert.deepEqual(await sweep(restarted), summaryOf({retained: 1}));
    assert.equal(writes.submitted(), 1, 'no second permit after restart');
  });
  await t.test('held old submission after takeover', async (t) => {
    const {fx, f, predecessor} = await fencedPredecessor(t);
    const writes = countSuccessorWrites(f);
    const held = holdSuccessorWrite(f, t);
    const oldTurn = sweep(fx.owner);
    assert.equal(await submitted(held, oldTurn), true,
      'the old holder submitted its successor CAS before its process stopped');
    fx.shutOwner(); expireClaim(f);
    const takeover = workflowOwner({nodeId: SUCCESSOR, repository: f.repositoryFor(SUCCESSOR),
      messageRouter: fx.recipient, realLane: true, timeSource: f.clock});
    assert.deepEqual(await sweep(takeover), summaryOf({retained: 1}),
      'the new holder proves the fence itself; takeover alone grants nothing');
    const issued = permitOf(f);
    assert.equal(issued.permitSequence, predecessor.permitSequence + 1);
    assert.equal(issued.workflowOwnerNodeId, SUCCESSOR);
    held.release(); await oldTurn;
    assert.equal(writes.applied(), 1, 'the late old submission matches nothing');
    assert.deepEqual(permitOf(f), issued, 'the new holder\'s successor stands');
  });
});

test('a replicated cache row is never the successor\'s basis or evidence: with the cache ' +
  'lagging behind the issued predecessor, the turn and the issuance read the authoritative row',
{timeout: 30000}, async (t) => {
  const {fx, f, predecessor} = await fencedPredecessor(t);
  const writes = countSuccessorWrites(f);
  f.operationRows.length = 0;
  f.operationRows.push({...f.row(), message_group_membership_phase: PHASE.LEARNER_REQUESTED,
    message_group_membership_permit: null,
    message_group_membership_obligation_state: 'intent_recorded'});
  assert.deepEqual(await fx.owner.reconcileMessageGroupMembershipDebt(DEBT_CENSUS.CACHE_HINT),
    {...noRefusals, found: 0}, 'the lagging hint names no owing turn: it can delay, not decide');
  assert.equal(writes.submitted(), 0);
  assert.deepEqual(await sweep(fx.owner), summaryOf({retained: 1}));
  assert.equal(writes.applied(), 1, 'the authoritative in-flight attempt is the basis');
  assert.equal(permitOf(f).permitSequence, predecessor.permitSequence + 1);
});

test('an ordinarily failed operation keeps its membership debt and gets no successor: ' +
  'noncommitment never reopens ordinary execution', {timeout: 30000}, async (t) => {
  const fx = await successorFixture(t); const {f} = fx;
  await settleFailed(f);
  const oldLeader = f.leader;
  const oldApplied = f.cluster.node(oldLeader).readStatus().appliedIndex;
  f.cluster.isolate(oldLeader);
  const newLeader = electSurvivor(f, oldLeader); commitOwnTerm(f, newLeader, oldApplied);
  f.hostWitness(SUCCESSOR, newLeader);
  const writes = countSuccessorWrites(f); const before = {...f.row()};
  const logged = captureLog(fx.owner);
  assert.deepEqual(await sweep(fx.owner), summaryOf({retained: 1}));
  assert.equal(writes.submitted(), 0, 'no successor after ordinary settlement');
  assert.deepEqual(f.row(), before, 'ordinary failure, debt and the permit are retained');
  assert.equal(f.row().status, ReplicaStatus.FAILED);
  assert.equal(f.row().message_group_membership_obligation_state, 'unknown');
  assert.deepEqual(logged.debug.map(({outcome, recorder, successor}) =>
    ({outcome, recorder, successor})), [{outcome: DEBT.RETAINED, recorder: 'noncommitted',
    successor: 'conflict'}], 'a typed retained diagnosis names the settlement owner');
  assert.equal(logged.warn.length, 0, 'the expected refusal is not surfaced as a corrupt row');
});

test('the recorder classifies NOT_RECORDED by its own observation only: an absent observation, ' +
  'an absent or false registry vouch and other non-fencing observations are UNKNOWN, a ' +
  'malformed one is CONFLICT, and nothing is written',
{timeout: 30000}, async (t) => {
  const f = await fixture(t);
  const before = {...f.row()}; const predecessor = permitOf(f);
  const real = await readAction(f, f.leader, predecessor.permitSequence);
  assert.equal(typeof real.observation, 'object',
    'the native owner attaches its same-turn observation to an absent origin');
  assert.deepEqual(Object.keys(real.observation).sort(), ['appliedIndex', 'configurationKey',
    'currentTermApplied', 'lifecycleIncarnation', 'membershipGenerationIndex',
    'originRegistryComplete', 'replicaIdentity', 'role', 'runtimeGeneration', 'term'],
  'the native owner attaches one observation shape');
  assert.equal(real.observation.originRegistryComplete, true,
    'a registry that never reserved the target vouches for its absence');
  const fencing = {...real.observation, term: predecessor.leaderTerm + 1,
    role: RAFT_ROLE.LEADER, currentTermApplied: true, originRegistryComplete: true};
  const answer = (observation) => ({kind: KIND.UNRESOLVED, reason: ACTION_REASON.NOT_RECORDED,
    ...(observation === undefined ? {} : {observation})});
  const cases = [
    [answer(), 'unknown'], [real, 'unknown'], [answer(fencing), 'noncommitted'],
    [answer({...fencing, currentTermApplied: false}), 'unknown'],
    [answer({...fencing, role: RAFT_ROLE.FOLLOWER}), 'unknown'],
    [answer({...fencing, term: predecessor.leaderTerm}), 'unknown'],
    [answer({...fencing, originRegistryComplete: false}), 'unknown'],
    [answer(Object.fromEntries(Object.entries(fencing)
      .filter(([key]) => key !== 'originRegistryComplete'))), 'unknown'],
    [answer({...fencing, originRegistryComplete: 'true'}), 'conflict'],
    [answer({...fencing, term: String(fencing.term)}), 'conflict'],
    [answer({...fencing, extra: true}), 'conflict'],
    [answer(Object.fromEntries(Object.entries(fencing).filter(([key]) => key !== 'role'))),
      'conflict'],
  ];
  for (const [native, expected] of cases) {
    assert.equal((await f.repository.recordMessageGroupLearnerOutcome(f.request,
      async () => native)).outcome, expected, JSON.stringify(native.observation ?? null));
    assert.deepEqual(f.row(), before, 'classification never writes the row');
  }
  const issue = (request, read = async () => answer(fencing)) =>
    f.repository.issueMessageGroupLearnerSuccessor(request, read, () => true);
  const routed = {operationId: O, destinationNodeId: NODE,
    destinationReplicaId: real.observation.replicaIdentity};
  assert.equal((await issue({...routed, destinationNodeId: ''})).outcome, 'invalid');
  assert.equal((await f.repository.issueMessageGroupLearnerSuccessor(routed, null, () => true))
    .outcome, 'invalid', 'the read is a capability the caller supplies, never evidence');
  assert.equal((await issue({...routed, destinationReplicaId: 'another-replica'})).outcome,
    'conflict', 'the fencing observation must be the routed destination\'s own replica');
  assert.equal((await issue(routed, async () => answer({...fencing, currentTermApplied: false})))
    .outcome, 'unknown', 'the issuance re-proves the fence with its own read');
  assert.deepEqual(f.row(), before);
});

// The target's reservation stays while its origin is NULL: the shape a registry
// migrated from the pre-origin schema leaves (an older application), and the
// shape a stamp or image bootstrap that folded the action, or a local proposal
// reservation, leaves. The registry owner reports it UNVOUCHED.
const PEER_IDENTITY_TABLE = 'raft_rs_peer_identity';
function stripTargetOrigin(f, replicaId) {
  const changed = f.cluster.replica(replicaId).db.prepare(`UPDATE ${PEER_IDENTITY_TABLE}
    SET ${RAFT_RS_LEARNER_ADMISSION_COLUMN} = NULL WHERE replica_identity = ?`).run(TARGET);
  assert.equal(changed.changes, 1, 'the target keeps its reservation, now without an origin');
}

test('an absence the fencing replica\'s registry cannot vouch for is never noncommitment: ' +
  'the registry owner reports a reservation without an origin UNVOUCHED, the debt is retained ' +
  'with no successor, and the committed predecessor is recorded at another founder',
{timeout: 30000}, async (t) => {
  await t.test('committed predecessor, leader reservation without an origin (migrated shape)',
    async (t) => {
      const fx = await successorFixture(t); const {f} = fx;
      const predecessor = permitOf(f); const oldLeader = f.leader;
      const peer = JSON.parse(f.request.identity).targetPeerId;
      const writes = countSuccessorWrites(f);
      const proposed = await f.run();
      assert.equal(proposed.reason, REASON.PROPOSED);
      assert.ok(learnerEverywhere(f, FOUNDERS, peer), 'the predecessor commits on every founder');
      const applied = f.cluster.node(oldLeader).readStatus().appliedIndex;
      f.cluster.isolate(oldLeader);
      const newLeader = electSurvivor(f, oldLeader); commitOwnTerm(f, newLeader, applied);
      stripTargetOrigin(f, newLeader);
      const absent = await readAction(f, newLeader, predecessor.permitSequence);
      assert.equal(absent.reason, ACTION_REASON.NOT_RECORDED);
      assert.equal(typeof absent.observation?.originRegistryComplete, 'boolean',
        'the native owner states whether the registry vouches for the absence');
      assert.ok(absent.observation.currentTermApplied === true &&
        absent.observation.term > predecessor.leaderTerm, 'the leader would otherwise fence');
      assert.equal(absent.observation.originRegistryComplete, false,
        'the registry owner does not vouch for a reservation without an origin');
      f.hostWitness(SUCCESSOR, newLeader);
      assert.deepEqual(await sweep(fx.owner), summaryOf({retained: 1}),
        'an unvouched absence keeps the debt');
      assert.equal(writes.submitted(), 0, 'no successor over an attempt that may have committed');
      assert.deepEqual(permitOf(f), predecessor);
      const other = FOUNDERS.find((id) => id !== oldLeader && id !== newLeader);
      f.serviceRows.length = 0; f.hostWitness(SUCCESSOR, other);
      assert.deepEqual(await sweep(fx.owner), summaryOf({recorded: 1}),
        'the committed fact stays recordable through the recorder');
      assert.deepEqual(permitOf(f), {...predecessor, permitState: 'committed',
        proposalIndex: proposed.proposalIndex}, 'the predecessor\'s exact fact is recorded');
      assert.equal(writes.submitted(), 0);
    });
  await t.test('noncommitted predecessor, the new leader reserved the target locally', async (t) => {
    const {fx, f, newLeader, predecessor} = await fencedPredecessor(t, {propose: true});
    const writes = countSuccessorWrites(f);
    admission.reserveGroupPeerIdentity({groupId: GROUP, localReplicaIdentity: newLeader}, TARGET);
    const absent = await readAction(f, newLeader, predecessor.permitSequence);
    assert.equal(absent.observation?.originRegistryComplete, false,
      'a proposal or hint reservation vouches for nothing either');
    assert.deepEqual(await sweep(fx.owner), summaryOf({retained: 1}),
      'fail closed: the debt waits for a leader whose registry vouches for the absence');
    assert.equal(writes.submitted(), 0);
    assert.deepEqual(permitOf(f), predecessor);
  });
});

test('the successor CAS basis includes the holder claim: a competing claim adopted after the ' +
  'old holder submitted (no new permit yet) defeats its held successor CAS', {timeout: 30000},
async (t) => {
  const {fx, f, predecessor} = await fencedPredecessor(t);
  const writes = countSuccessorWrites(f);
  const held = holdSuccessorWrite(f, t);
  const oldTurn = sweep(fx.owner);
  assert.equal(await submitted(held, oldTurn), true,
    'the old holder submitted its successor CAS before its process stopped');
  fx.shutOwner(); expireClaim(f);
  const oldClaim = f.row().message_group_membership_owner_claim;
  const adopted = await f.repositoryFor(SUCCESSOR).claimMessageGroupMembershipOwner({
    operationId: O, identity: f.request.identity, expectedClaim: oldClaim});
  assert.equal(adopted.outcome, 'recorded', 'a new holder adopts the expired claim');
  assert.equal(f.row()[PERMIT_COLUMN], f.request.permit, 'no new permit yet');
  held.release(); await oldTurn;
  assert.equal(writes.applied(), 0, 'the old successor CAS matches nothing after the claim moved');
  assert.deepEqual(permitOf(f), predecessor, 'the predecessor permit stands for the new holder');
  assert.equal(f.row().message_group_membership_owner_claim, adopted.claim);
});

test('the final row is re-checked before the CAS: an operation settled FAILED inside the ' +
  'issuance window gets no successor, and the turn names the settlement owner', {timeout: 30000},
async (t) => {
  const {fx, f, predecessor} = await fencedPredecessor(t);
  const writes = countSuccessorWrites(f);
  let settledInWindow = false;
  // The issuance's first nodes read is its destination boot read, after its own
  // fencing read and before its final row read.
  f.pauseNodes(async () => {
    f.pauseNodes(null); await settleFailed(f); settledInWindow = true;
  });
  const logged = captureLog(fx.owner);
  assert.deepEqual(await sweep(fx.owner), summaryOf({retained: 1}));
  assert.equal(settledInWindow, true, 'the settlement landed inside the issuance window');
  assert.equal(f.row().status, ReplicaStatus.FAILED);
  assert.equal(writes.submitted(), 0, 'no successor on an operation settled inside the window');
  assert.deepEqual(permitOf(f), predecessor);
  assert.deepEqual(logged.debug.map(({outcome, recorder, successor}) =>
    ({outcome, recorder, successor})), [{outcome: DEBT.RETAINED, recorder: 'noncommitted',
    successor: 'conflict'}], 'the issuance\'s final row names the settlement owner');
  assert.equal(logged.warn.length, 0);
});

test('the successor binds the destination\'s canonical boot read through the authoritative ' +
  'nodes row: an unreadable destination row is UNAVAILABLE with no write, and a restarted ' +
  'destination\'s boot is the one bound', {timeout: 30000}, async (t) => {
  const {fx, f, predecessor} = await fencedPredecessor(t);
  const writes = countSuccessorWrites(f);
  f.execute('DELETE FROM nodes WHERE node_id = ?', [SUCCESSOR]);
  assert.deepEqual(await sweep(fx.owner), summaryOf({retained: 1}),
    'an unreadable destination boot keeps the debt');
  assert.equal(writes.submitted(), 0, 'nothing is submitted without the destination boot');
  assert.deepEqual(permitOf(f), predecessor);
  f.execute(`INSERT INTO nodes
    (node_id,node_address,cpu_cores,memory_mb,disk_gb,last_heartbeat,boot_incarnation,created_at)
    VALUES (?,?,?,?,?,?,?,?)`, [SUCCESSOR, SUCCESSOR, 2, 512, 10, NOW, 7, NOW]);
  assert.deepEqual(await sweep(fx.owner), summaryOf({retained: 1}));
  const successor = permitOf(f);
  assert.equal(successor.permitSequence, predecessor.permitSequence + 1,
    'once the destination boot is readable the successor is issued');
  assert.equal(successor.destinationNodeId, SUCCESSOR);
  assert.equal(successor.destinationBootIncarnation, 7,
    'the destination\'s canonical boot, never the predecessor\'s');
  assert.notEqual(predecessor.destinationBootIncarnation, 7);
  assert.equal(writes.applied(), 1);
});
