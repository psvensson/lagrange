import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {MessageGroupServiceRowOwner} from '../../src/message-group/message-group-service-row-owner.js';
import {WasmServiceReplica} from '../../src/wasm-service/wasm-service-replica.js';
import {observeReplicaRoleAndTerm} from '../../src/raft/raft-rs-status-observation.js';
import {readReplicaServiceRole} from '../../src/raft/replica-leadership-state.js';
import {ControllableConsensusPort} from '../test-helpers/controllable-consensus-port.js';

// Production consumers on a real native learner/promotion port. These views
// exercise the common adapter; they do not claim a WASM learner opening path.
async function assertOtherConsumers(t, source, rows, expected) {
  const persist = async (_table, row) => {
    rows.prepare('INSERT INTO observed_rows VALUES (?)').run(JSON.stringify(row));
    return {success: true, affectedRows: 1};
  };
  const mg = Object.assign(Object.create(MessageGroupService.prototype), {
    raft: source.raft, replicaId: source.replicaId, nodeId: source.nodeId,
    groupId: source.partitionId, role: 'leader', isLeader: true,
  });
  t.equal(mg.getRole(), expected, 'MG accessor consumes membership, ignoring stale fields');
  const mgOwner = new MessageGroupServiceRowOwner({
    systemTableWriter: {insertSystemTableRow: persist}});
  await mgOwner.registerReplica({service: mg, groupId: mg.groupId,
    replicaId: mg.replicaId, nodeId: mg.nodeId, status: 'stopped'});
  const readRow = () => JSON.parse(rows.prepare('SELECT payload FROM observed_rows ORDER BY rowid DESC LIMIT 1').get().payload);
  t.equal(readRow().raft_role, expected, 'MG production row keeps native membership');
  const wasm = Object.assign(Object.create(WasmServiceReplica.prototype), {
    raft: source.raft, replicaId: source.replicaId, nodeId: source.nodeId,
    serviceDefinitionId: source.partitionId, role: 'leader', isLeader: true,
    roleUpdateWriter: (row) => persist('services', row),
  });
  await wasm.writeRoleUpdate('leader');
  t.equal(readRow().role, expected, 'WASM production publisher keeps native membership');
}

// Adapted sealed reviewer witness; the original remains preserved with its source.
// Real partition initializer, native core and committed bootstrap stamp;
// row writer is a controlled sink backed by a separate SQLite connection.
import {test} from '../../src/test-helpers/tap.js';
import path from 'node:path';
import Database from 'better-sqlite3';
import {createFixture} from '../../test/raft/raft-rs-backend/startup-cleanup-native-fixture.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {PartitionServiceRowOwner} from '../../src/partition/partition-service-row-owner.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {genesisStamp} from '../../src/raft/raft-committed-membership-stamp.js';
import {serviceRoleObservation} from '../test-helpers/service-role-observation.js';
import {committedStampOfAnswer} from '../../src/raft/raft-committed-membership-stamp.js';
import {admitPartitionRaftPeer, reservePartitionRaftPeerIdentity} from '../../src/partition/partition-service-raft-membership-administration.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';

test('a real unpromoted native learner remains a learner at row and voter-ready consumers', async (t) => {
  const f = await createFixture({after: (cleanup) => t.teardown(cleanup)});
  const founderId = 'role-promotion-founder';
  const nodeId = 'opening-refusal-node';
  const founder = new PartitionService({nodeId, replicaId: founderId, replicaIds: [founderId],
    partitionId: 'role-promotion', tableId: 'role-promotion-table', tableName: 'role_promotion_rows',
    dbPath: path.join(f.directory, 'founder.db'), transport: f.router, timeSource: f.clock,
    deferElection: true, systemTableCache: new SystemTableCache(),
    bootstrapMembership: genesisStamp([founderId], {[founderId]: nodeId})});
  f.services.push(founder);
  await founder.initialize();
  await turnChainValue(founder.raft.campaign());
  const stamp = committedStampOfAnswer(await founder.raft.readCommittedMembership());
  const learner = new PartitionService({
    nodeId: founder.nodeId, replicaId: 'review-role-learner',
    replicaIds: [founder.replicaId, 'review-role-learner'],
    partitionId: founder.partitionId, tableId: founder.tableId, tableName: founder.tableName,
    dbPath: path.join(f.directory, 'review-learner.db'), transport: f.router,
    timeSource: f.clock, deferElection: true, isJoiningExistingGroup: true,
    systemTableCache: new SystemTableCache(), bootstrapMembership: stamp,
  });
  f.services.push(learner);
  await learner.initialize();
  const native = learner.raft.readStatus();
  t.equal(native.outcome, 'CORE_OK', 'setup: real native status is readable');
  t.ok(native.confState.learners.includes(native.peerId), 'setup: native config contains self as learner');
  t.notOk(native.confState.voters.includes(native.peerId), 'setup: no native voter admission');
  t.equal(learner.role, 'learner', 'setup: production initialization retains learner stage');
  const controlledLearner = new ControllableConsensusPort(learner.raft.readRoleAndTerm());
  const learnerPort = controlledLearner.createOperationPort({});
  t.same(learnerPort.readRoleAndTerm(), learner.raft.readRoleAndTerm(),
    'controlled port preserves the actual native learner observation');
  t.equal(learnerPort.readCommittedMembership().kind, 'refused',
    'shape conformance does not invent a committed configuration');

  const rowDb = new Database(path.join(f.directory, 'learner-rows.sqlite'));
  t.teardown(() => rowDb.close());
  rowDb.exec('CREATE TABLE IF NOT EXISTS observed_rows (payload TEXT NOT NULL)');
  const owner = new PartitionServiceRowOwner({systemTableWriter: {
    insertSystemTableRow: async (_table, row) => {
      rowDb.prepare('INSERT INTO observed_rows VALUES (?)').run(JSON.stringify(row));
      return {success: true, affectedRows: 1};
    },
  }});
  const registered = await owner.registerReplica({service: learner,
    partitionId: learner.partitionId, replicaId: learner.replicaId,
    nodeId: learner.nodeId, status: 'stopped'});
  const durable = JSON.parse(rowDb.prepare('SELECT payload FROM observed_rows ORDER BY rowid DESC LIMIT 1').get().payload);
  const handler = Object.create(ReplicaHandler.prototype);
  handler.getTrackedService = () => learner;
  handler.systemTableCache = learner.systemTableCache;
  learner.systemTableCache.applySystemTableChange('services', 'INSERT', registered);
  const ready = handler.isReplicaVoterReady(learner.replicaId);
  t.comment(JSON.stringify({nativeRole: native.role, confState: native.confState,
    peerId: native.peerId, participation: native.participation,
    serviceRole: learner.role, getRole: learner.getRole(),
    durableRole: durable.raft_role, voterReady: ready}));
  t.same(learner.raft.readRoleAndTerm(), serviceRoleObservation('learner', native.term),
    'consumer fixture shape agrees with actual native learner observation');
  t.equal(learner.getRole(), 'learner', 'current service role must preserve non-voting membership');
  t.equal(durable.raft_role, 'learner', 'registration must not publish a native learner as voter');
  t.notOk(ready, 'handler must not release voter-ready activation before native promotion');
  learner.roleMutationHelper.pendingValue = 'learner';
  const flushed = await learner.roleMutationHelper.flush();
  t.comment(JSON.stringify({flush: flushed, pendingRole: learner.roleMutationHelper.pendingValue}));
  t.equal(learner.roleMutationHelper.pendingValue, 'learner', 'live learner publication is not stale voter work');
  await assertOtherConsumers(t, learner, rowDb, 'learner');
  const reserved = reservePartitionRaftPeerIdentity(founder, learner.replicaId);
  t.equal(reserved.outcome, 'RESERVED', 'production identity reservation precedes admission');
  const admission = admitPartitionRaftPeer(founder, {
    replicaIdentity: learner.replicaId, nodeId: learner.nodeId});
  const admitted = admission.settled ? await admission.settled : admission;
  t.comment(JSON.stringify({admitted}));
  t.equal(admitted.outcome, 'PROPOSED', 'the real admission owner proposes AddNode');
  // Drive actual delivered native envelopes, with no membership/event injection.
  for (let round = 0; round < 12; round++) {
    await turnChainValue(founder.raft.tick());
    learner.raft.readStatus();
    founder.raft.readStatus();
  }
  const promoted = learner.raft.readStatus();
  t.comment(JSON.stringify({stamp, founder: founder.raft.readStatus(), promoted}));
  t.ok(promoted.confState.voters.includes(promoted.peerId), 'actual applied promotion names self a voter');
  t.equal(promoted.gateOpen, true, 'committed AddNode releases the incarnation gate');
  t.same(learner.raft.readRoleAndTerm(), serviceRoleObservation('follower', promoted.term),
    'consumer fixture shape agrees with actual committed promotion');
  const controlledVoter = new ControllableConsensusPort(learner.raft.readRoleAndTerm());
  t.same(controlledVoter.createOperationPort({}).readRoleAndTerm(),
    learner.raft.readRoleAndTerm(), 'controlled port preserves the promoted producer shape');
  t.equal(learner.getRole(), 'follower', 'membership-sensitive accessor follows committed promotion');
  const promotedRow = await owner.registerReplica({service: learner,
    partitionId: learner.partitionId, replicaId: learner.replicaId,
    nodeId: learner.nodeId, status: 'stopped'});
  learner.systemTableCache.applySystemTableChange('services', 'UPDATE', promotedRow);
  t.equal(JSON.parse(rowDb.prepare('SELECT payload FROM observed_rows ORDER BY rowid DESC LIMIT 1').get().payload).raft_role,
    'follower', 'production row writer publishes the committed voter');
  t.ok(handler.isReplicaVoterReady(learner.replicaId), 'actual handler releases the voter after promotion');
  await assertOtherConsumers(t, learner, rowDb, 'follower');
});

// Pure observation seam controls for configurations a native producer owns.
test('joint outgoing voters, absent members and closed gates remain distinct', (t) => {
  const group = {peerId: '2'};
  const observation = {status: {raftState: 0, term: '8'},
    confState: {voters: ['1'], votersOutgoing: ['1', '2'], learners: [], learnersNext: ['2']},
    participation: {gateOpen: true}};
  const observe = () => observeReplicaRoleAndTerm(group, observation);
  const service = {raft: {readRoleAndTerm: observe}};
  t.equal(observe().membership, 'voter', 'an outgoing voter scheduled for demotion still votes');
  t.equal(readReplicaServiceRole(service), 'follower');
  observation.confState.votersOutgoing = [];
  observation.confState.learnersNext = [];
  observation.confState.learners = ['2'];
  observation.participation.gateOpen = false;
  t.equal(readReplicaServiceRole(service), 'learner', 'closed participation never hides an actual learner');
  observation.confState.learners = [];
  t.equal(observe().membership, 'absent');
  t.throws(() => readReplicaServiceRole(service), {raftResult: {reason: 'replica-membership-unavailable'}});
  observation.confState.voters = ['1', '2'];
  t.throws(() => readReplicaServiceRole(service), {raftResult: {reason: 'replica-participation-unavailable'}});
  observation.status.raftState = undefined;
  t.throws(() => readReplicaServiceRole(service), {raftResult: {reason: 'invalid-native-role'}},
    'invalid election status still outranks membership projection');
  t.end();
});
