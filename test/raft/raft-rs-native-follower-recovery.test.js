// Real multi-peer native runtime with the production MG lifecycle adapter.
// The status binding alone is corrupted; MG activation/publication sinks are passive.
import {test} from '../../src/test-helpers/tap.js';
import {instantiateRaftRsCore, verifyRaftRsBinding} from '../../src/raft/raft-rs-binding-owner.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {RAFT_EVENT} from '../../src/raft/raft-operation-port-constants.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';

const bindingUrl = new URL('../../src/raft/raft-rs-binding-owner.js', import.meta.url);
const driverUrl = new URL('../../test/raft/raft-rs-backend/transfer-leadership-driver.js', import.meta.url);
test('a valid follower recovers its same known leader after role observation refusal', async (t) => {
  let corruptPeer = null;
  const binding = {verifyRaftRsBinding, instantiateRaftRsCore: () => {
    const native = instantiateRaftRsCore();
    return Object.freeze({...native, status: (...args) => {
      const value = native.status(...args);
      if (String(value.id) !== corruptPeer) return value;
      const invalid = {...value};
      delete invalid.raftState;
      return invalid;
    }});
  }};
  const {TransferLeadershipDriver} = await t.mockImport(driverUrl.href,
    {[bindingUrl.href]: binding});
  const ids = ['review-follower-a', 'review-follower-b', 'review-follower-c'];
  const driver = new TransferLeadershipDriver({partitionId: 'review-follower', replicaIds: ids});
  t.teardown(() => driver.dispose());
  const port = driver.port(ids[1]);
  const service = Object.create(MessageGroupService.prototype);
  Object.assign(service, {raft: port, replicaId: ids[1], groupId: 'review-follower',
    nodeId: 'review-node-b', role: 'follower', isLeader: false,
    leaderId: null, leadershipTenure: null, operationLedger: {currentTerm: 0},
    forwardingOwner: {normalizeLeaderReplicaId: (id) => id},
    logger: {debug() {}, error() {}}, scheduleLeaderOwnedActivation() {},
    cancelLeaderOwnedActivation() {}, updateRebalancerLeadership() {},
    queueRoleUpdate() {}, queueLeaderNodeUpdate() {}});
  service.wireRaftEvents();
  driver.form();
  const before = port.readStatus();
  t.equal(before.role, 'follower', 'setup: native subject is a follower');
  t.equal(before.leaderId, ids[0], 'setup: native subject knows the real elected leader');
  t.equal(service.getLeaderId(), ids[0], 'setup: actual lifecycle consumed leader announcement');
  const events = [];
  port.subscribe(RAFT_EVENT.LEADER_CHANGE, (id) => events.push({leader: id}));
  port.subscribe(RAFT_EVENT.FOLLOWER, () => events.push({role: 'follower'}));
  corruptPeer = before.peerId;
  const invalid = await turnChainValue(port.tick());
  t.equal(invalid.reason, 'invalid-native-role');
  t.equal(service.getLeaderId(), null, 'invalid observation withdraws retained leader');
  corruptPeer = null;
  t.equal((await turnChainValue(port.tick())).outcome, 'CORE_OK', 'normal valid announcement succeeds');
  const after = port.readStatus();
  t.equal(after.role, 'follower');
  t.equal(after.term, before.term, 'same native term');
  t.equal(after.leaderId, ids[0], 'same native leader remains current');
  t.comment(JSON.stringify({nativeLeader: after.leaderId,
    serviceLeader: service.getLeaderId(), events}));
  t.equal(service.getLeaderId(), ids[0], 'normal recovery must restore the canonical known leader');
  await turnChainValue(port.tick());
  t.equal(service.getLeaderId(), ids[0], 'later valid turn must not leave a permanent missing leader');
});

const serviceFixtureUrl = new URL('./native-service-role-fixture.js', import.meta.url);
for (const kind of ['partition', 'message-group', 'wasm-service']) {
  test(`real ${kind} follower restores all withdrawn facts at unchanged term and leader`, async (t) => {
    let corruptPeer = null;
    const binding = {verifyRaftRsBinding, instantiateRaftRsCore: () => {
      const native = instantiateRaftRsCore();
      return Object.freeze({...native, status: (...args) => {
        const status = native.status(...args);
        if (String(status.id) !== corruptPeer) return status;
        const invalid = {...status};
        delete invalid.raftState;
        return invalid;
      }});
    }};
    const {nativeServiceGroup} = await t.mockImport(serviceFixtureUrl.href,
      {[bindingUrl.href]: binding});
    const {services} = await nativeServiceGroup(t, kind);
    const [leader, follower] = services;
    const before = follower.raft.readStatus();
    t.equal(before.role, 'follower');
    t.equal(before.leaderId, leader.replicaId);
    t.equal(follower.leaderId, leader.replicaId, 'production lifecycle consumed the original leader');
    const events = [];
    for (const event of [RAFT_EVENT.FOLLOWER, RAFT_EVENT.TERM_CHANGE, RAFT_EVENT.LEADER_CHANGE]) {
      follower.raft.subscribe(event, () => events.push(event));
    }
    const reentrant = [];
    follower.raft.subscribe(RAFT_EVENT.FOLLOWER,
      () => reentrant.push(follower.raft.readRoleAndTerm()));
    corruptPeer = before.peerId;
    t.equal((await turnChainValue(follower.raft.tick())).reason, 'invalid-native-role');
    t.equal(follower.leaderId, null);
    corruptPeer = null;
    t.equal(follower.raft.readRoleAndTerm().role, 'follower');
    t.equal(follower.leaderId, null, 'valid read has no lifecycle permission');
    await turnChainValue(follower.raft.tick());
    t.equal(follower.raft.readStatus().term, before.term);
    t.equal(follower.leaderId, leader.replicaId, 'ordinary lifecycle restores the unchanged leader');
    t.same(events, [RAFT_EVENT.FOLLOWER, RAFT_EVENT.TERM_CHANGE, RAFT_EVENT.LEADER_CHANGE],
      'recovery publishes role then term then leader exactly once');
    await turnChainValue(follower.raft.tick());
    t.equal(events.length, 3, 'another valid tick does not republish recovery');
    t.equal(reentrant.length, 1, 'diagnostic read does not recurse into recovery publication');
    t.same(reentrant[0], {outcome: 'CORE_OK', role: 'follower', term: before.term,
      membership: 'voter', gateOpen: true}, 'reentry observes the same valid native facts');
    t.equal(follower.leadershipTenure, null, 'a recovered follower never acquires leader tenure');
  });
}
