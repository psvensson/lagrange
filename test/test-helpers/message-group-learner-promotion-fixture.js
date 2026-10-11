/** The promotion world of FreshMG 6.C slice C2: a real joined learner (the B1
 * create fixture and the B2 learner-join world: three real raft-rs founders
 * holding the operation-authorized, recorded ADD_LEARNER, and a real
 * MessageGroupService installed and opened as the learner, RUNNING), plus the
 * C1 recipient world (two real MessageRouters, a registered
 * MessageGroupServiceHandler answering for every founder, an
 * OperationWorkflowOwner on the real lane whose explicit entries record the
 * voter stamp and issue the ordered successor through the recipient read).
 * Supplied test physics, all explicit:
 *  - the caught-up observation route: the current leader port's own
 *    BOOTSTRAP-purpose committed answer and readStatus(), and the learner's own
 *    committed witness answer (no production route exists, as in B2);
 *  - the selection's origin read at the routed leader: that founder port's own
 *    queued learner-action read;
 *  - the target status route the promotion runtime consumer asks: the
 *    learner's own port readStatus();
 *  - the founders hosted on SUCCESSOR behind the registered handler, the
 *    services census rows, node rows and operation SQL (the C1 fixture's).
 * None of it is a driver, a production route or physical proof.
 */
import assert from 'node:assert/strict';
import * as admission from '../../src/raft/raft-rs-group-membership-admission.js';
import {MessageGroupServiceHandler} from '../../src/node/message-group-service-handler.js';
import {ReplicaOperationResponseStatus as STATUS} from
  '../../src/rebalancer/replica-operation-constants.js';
import {readMessageGroupCommittedMembership} from
  '../../src/message-group/message-group-consensus-port.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE as PURPOSE} from
  '../../src/raft/raft-committed-membership-constants.js';
import {committedMembershipContext} from '../../src/raft/raft-rs-committed-membership-context.js';
import {DEBT_CENSUS} from
  '../../src/rebalancer/operation-workflow-message-group-membership-recovery.js';
import {durableLog} from '../raft/raft-rs-backend/committed-membership-oracles.js';
import {loadRaftRsCore} from '../raft/raft-rs-backend/raw-raft-rs-test-core.js';
import {RAFT_OPERATION_OUTCOME} from '../../src/raft/raft-operation-port-constants.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {raftRsConfStateKey} from '../../src/raft/raft-rs-conf-state-key.js';
import {FOUNDERS, GROUP, NODE, O, SUCCESSOR, TARGET} from './learner-operation-fixture.js';
import {createFixture, createHandler, createPayload} from './message-group-create-fixture.js';
import {learnerJoinWorld} from './message-group-learner-join-fixture.js';
import {connectRouters, workflowOwner} from './learner-recipient-fixture.js';

const PROMOTE = 'promote';
const RUNNING = 'message_group_learner_running';
const PERMIT_COLUMN = 'message_group_membership_permit';
const VOTER_RECEIPT = 'message_group_voter_stamp = ?';
// The branch selection's SET (its WHERE and the receipt CAS spell these apart).
const BRANCH_CAS = 'message_group_membership_permit = ?, message_group_membership_obligation_state = ?';
const TARGET_PEER = deriveRaftRsPeerId(TARGET);

// --- Shared observations of the promotion world (the two C2 witness files) --
const leaderOf = (f) => f.cluster.leaderReplicaId();
const otherFounder = (f, ...not) => FOUNDERS.find((id) => !not.includes(id) &&
  id !== leaderOf(f));
const learnerMatch = (f, leader = leaderOf(f)) =>
  f.cluster.node(leader).readStatus().followerProgress[f.cluster.addressOf(TARGET)];
/** The learner acknowledged everything its leader committed (the pump runs). */
const caughtUp = (fx, leader = leaderOf(fx.f)) => fx.world.until(() =>
  learnerMatch(fx.f, leader) >= fx.f.cluster.node(leader).readStatus().commitIndex &&
  fx.learner().raft.readStatus().term === fx.f.cluster.node(leader).readStatus().term);
const votersEverywhere = (f, ids = FOUNDERS) => f.cluster.settle(() => ids.every((id) =>
  f.cluster.node(id).readStatus().confState.voters.map(String).includes(TARGET_PEER)),
{rounds: 400});
/** Real leadership transfer on the founders' own ports; the successor then
 * applies an entry of its own term. */
function transferLeadership(f, successor) {
  const from = leaderOf(f);
  assert.equal(f.cluster.node(from).transferLeadership({successor: 'named',
    replicaIdentity: successor}).outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
  f.cluster.tickers = [successor];
  assert.ok(f.cluster.settle(() => leaderOf(f) === successor &&
    f.cluster.node(successor).readStatus().currentTermApplied === true, {rounds: 400}),
  `${successor} leads and applied its own term`);
  return from;
}
/** Count the deliveries a router sends (a native read is one delivery). */
function countDeliveries(router) {
  let count = 0; const deliver = router.deliver.bind(router);
  router.deliver = (...args) => {
    count += 1; return deliver(...args);
  };
  return () => count;
}
/** The recorder's own query for an action of the transition (the exact tuple
 * the queued learner-action read answers), from a recorded permit. */
function learnerQuery(f, permit) {
  const identity = JSON.parse(f.request.identity);
  return {purpose: 'learner-action', groupId: identity.groupId,
    action: {operationId: O, transitionIdentity: identity.transitionIdentity,
      permitSequence: permit.permitSequence, stage: permit.permitStage,
      replicaIdentity: TARGET, peerId: TARGET_PEER}};
}

// --- Guard-witness physics shared by the two promotion guard files ---------
const OWNER_CLAIM = 'message_group_membership_owner_claim';
const configurationOf = (voters, learners) => raftRsConfStateKey({voters, votersOutgoing: [],
  learners, learnersNext: [], autoLeave: false});
/** The typed answer of a selection or recording, or 'thrown': an owner that
 * throws where it owes a typed refusal is the defect the assertion names. */
const settled = (promise) => promise.then((answer) => answer,
  (error) => ({outcome: 'thrown', error: error?.message}));
/** A request the recorder takes: the row's identity, permit and holder. */
const recordingRequest = (f, changes = {}) => ({operationId: O, identity: f.request.identity,
  permit: f.row()[PERMIT_COLUMN], executionClaim: f.row()[OWNER_CLAIM], ...changes});
const setColumns = (f, columns) => {
  for (const [column, value] of Object.entries(columns)) {
    f.execute(`UPDATE replica_operations SET ${column} = ? WHERE operation_id = ?`, [value, O]);
  }
};
/** Forge the named columns, run, assert the typed outcome, then restore the
 * row byte for byte: a guard that let the forgery through wrote something. */
async function refusedOnForgedRow(f, name, columns, run, expected) {
  const before = f.row();
  setColumns(f, columns);
  const answer = await run();
  assert.equal(answer.outcome, expected, `${name}: ${JSON.stringify(answer)}`);
  setColumns(f, Object.fromEntries(Object.keys(columns).map((column) => [column, before[column]])));
  assert.deepEqual(f.row(), before, `${name}: nothing written, the row restored`);
  return answer;
}

/** The learner's own port status, the shape the promotion turn compares. */
const targetStatusOf = (world) => () => world.learners[0].raft.readStatus();

/** The caught-up observation route (test physics): the current leader port's
 * own committed BOOTSTRAP answer and status, and the learner's own witness. */
function catchUpRoute(f, world, {leaderId = () => f.cluster.leaderReplicaId(),
  alter = (observation) => observation} = {}) {
  return async () => {
    const id = leaderId();
    if (id === null) return null;
    const node = f.cluster.node(id);
    return alter({membership: readMessageGroupCommittedMembership({raft: node},
      PURPOSE.BOOTSTRAP), status: node.readStatus(),
    own: readMessageGroupCommittedMembership(world.learners[0])});
  };
}

/** A delivery the recipient router hands its registered address for a message
 * the source router actually sent: the host binding the runtime consumer admits. */
async function recipientDelivery(fx) {
  const address = `${SUCCESSOR}/message-group/promotion-delivery-witness-${fx.deliveries++}`;
  const received = Promise.withResolvers();
  fx.recipient.register(address, (_envelope, delivery) => {
    received.resolve(delivery); return {accepted: true};
  });
  await fx.source.deliver(address, {probe: true},
    {targetNodeId: SUCCESSOR, deliveryPriority: 'critical', timeoutMs: 5000});
  return received.promise;
}

/** Writes through the operation gateway whose SQL names a marker, with the
 * rows each changed. */
function countWrites(f, marker) {
  const writes = []; const execute = f.gateway.executeQuery;
  f.gateway.executeQuery = async (sql, ...args) => {
    const answer = await execute(sql, ...args);
    if (String(sql).includes(marker)) writes.push(answer?.affectedRows ?? 0);
    return answer;
  };
  return {submitted: () => writes.length, applied: () => writes.filter((n) => n === 1).length};
}

/** Committed PROMOTE entries for the target in a founder's durable log, by the
 * permit sequence their replicated context carries. */
function promotionEntrySequences(f, replicaId) {
  const core = loadRaftRsCore();
  const commit = f.cluster.node(replicaId).readStatus().commitIndex;
  return durableLog(f.cluster.replica(replicaId).dbFile, GROUP)
    .filter(({index}) => index <= commit)
    .map((entry) => {
      try {
        return {index: entry.index, context: committedMembershipContext(
          core.decode_conf_change_entry(entry.entryType, entry.data))};
      } catch {
        return null;
      }
    })
    .filter((entry) => entry?.context?.replicaIdentity === TARGET &&
      entry.context.stage === PROMOTE)
    .map(({index, context}) => ({index, permitSequence: context.permitSequence}));
}

/**
 * The promotion world: a RUNNING learner and the C1 recipient world.
 * @param {Object} t - The test context.
 * @return {Promise<Object>} The world.
 */
async function promotionWorld(t) {
  const f = await createFixture(t);
  assert.equal(typeof f.repository.selectMessageGroupPromotion, 'function',
    'the repository owns the promotion selection over the exact caught-up proof');
  assert.equal(typeof admission.proposeAuthorizedGroupPromotion, 'function',
    'the group-admission owner owns the promotion runtime consumer');
  const world = learnerJoinWorld(t, f);
  const created = createHandler(t, f, {learnerJoin: world.join});
  assert.equal((await created.send(createPayload(f))).status, STATUS.INITIATED,
    'the recorded learner CREATE is admitted');
  assert.equal(await world.answered(), true, 'the learner join answers');
  const [{answer, error}] = world.answers;
  assert.equal(error, undefined, `the learner join must not refuse: ${error?.message}`);
  assert.equal(answer.outcome, RUNNING, JSON.stringify(answer));
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
  const owner = workflowOwner({nodeId: NODE, repository: f.repository, messageRouter: source,
    realLane: true, timeSource: f.clock});
  const fx = {f, world, created, source, recipient, owner, deliveries: 0,
    physical: () => physical,
    bindFounder: (replicaId) => services.set(replicaId,
      {nodeId: SUCCESSOR, replicaId, groupId: GROUP, raft: f.cluster.node(replicaId)}),
    learner: () => world.learners[0],
    observeCatchUp: catchUpRoute(f, world),
    permit: () => JSON.parse(f.row()[PERMIT_COLUMN]),
    sweep: (workflow = owner, census = DEBT_CENSUS.AUTHORITATIVE) =>
      workflow.reconcileMessageGroupMembershipDebt(census),
    // The explicit entries: the recorder and the successor issuance at a
    // selected founder, through the recipient read in the retained lane.
    recordVoter: (replicaId, workflow = owner) =>
      workflow.recoverMessageGroupVoterOutcomeFromRecipient(O, {nodeId: SUCCESSOR, replicaId}),
    issueSuccessor: (replicaId, workflow = owner) =>
      workflow.issueMessageGroupSuccessorFromRecipient(O, {nodeId: SUCCESSOR, replicaId})};
  fx.select = (changes = {}, {observeCatchUp = fx.observeCatchUp, repository = f.repository,
    readAction} = {}) => {
    const destinationReplicaId = changes.destinationReplicaId ?? f.cluster.leaderReplicaId();
    return repository.selectMessageGroupPromotion({operationId: O,
      destinationNodeId: SUCCESSOR, destinationReplicaId, ...changes},
    readAction ?? ((query) => f.cluster.node(destinationReplicaId).readCommittedMembership(query)),
    observeCatchUp, () => true);
  };
  fx.propose = async (leader = f.cluster.leaderReplicaId(), {observeTarget, request} = {}) => {
    const row = f.row();
    const recipientRepository = f.repositoryFor(SUCCESSOR);
    return admission.proposeAuthorizedGroupPromotion(f.cluster.node(leader),
      {groupId: GROUP, nodeId: SUCCESSOR, bootIncarnation: 1, localReplicaIdentity: leader,
        senderNodeId: NODE, senderBootIncarnation: 1},
      request ?? {operationId: O, identity: f.request.identity, permit: row[PERMIT_COLUMN],
        executionClaim: row.message_group_membership_owner_claim},
      recipientRepository.observeMessageGroupPromotionAuthorization?.bind(recipientRepository),
      await recipientDelivery(fx), observeTarget ?? targetStatusOf(world));
  };
  return fx;
}

export {BRANCH_CAS, OWNER_CLAIM, PERMIT_COLUMN, TARGET_PEER, VOTER_RECEIPT, catchUpRoute,
  caughtUp, configurationOf, countDeliveries, countWrites, leaderOf, learnerMatch, learnerQuery,
  otherFounder, promotionEntrySequences, promotionWorld, recordingRequest, refusedOnForgedRow,
  setColumns, settled, transferLeadership, votersEverywhere};
