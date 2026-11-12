// The real public port, runtime queue, SQLite store and native core. Only the
// binding owner's status result is corrupted at its existing module boundary.
// This proves the JS consumer refuses a malformed producer result; it does
// not claim the unmodified Rust producer can emit these values.
import assert from 'node:assert/strict';
import {MessageGroupService, RaftRole} from
  '../../src/message-group/message-group-service.js';
import {MessageGroupServiceRowOwner} from
  '../../src/message-group/message-group-service-row-owner.js';
import {test} from '../../src/test-helpers/tap.js';
import {instantiateRaftRsCore, verifyRaftRsBinding} from
  '../../src/raft/raft-rs-binding-owner.js';
import {RAFT_EVENT, RAFT_LEADERSHIP_TRANSFER_SUCCESSOR as SUCCESSOR,
  RAFT_OPERATION_OUTCOME as OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {RUNTIME_PHASE, RUNTIME_REASON} from
  '../../src/raft/raft-rs-runtime-owner-constants.js';
import {RAFT_RS_MESSAGE_TYPE} from '../../src/raft/raft-rs-ingress-constants.js';
import {genesisStamp} from '../../src/raft/raft-committed-membership-stamp.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {countingDatabase} from './raft-rs-status-shape-fixture.js';
import {HISTORY_ID, historyDb} from './raft-rs-backend/opening-history-native-fixture.js';

const BINDING = new URL('../../src/raft/raft-rs-binding-owner.js', import.meta.url);
const HISTORY = new URL('./raft-rs-backend/opening-history-native-fixture.js', import.meta.url);
const MALFORMED = Object.freeze([
  ['missing', undefined], ['null', null], ['string', '2'], ['out of range', 4],
  ['negative', -1], ['fraction', 1.5], ['NaN', NaN], ['infinity', Infinity],
  ['boolean', false], ['bigint', 2n], ['array', [2]], ['object', {}],
  ['prototype key', '__proto__'], ['inherited key', 'constructor'],
]);
const VALID = Object.freeze([
  [0, 'follower'], [1, 'candidate'], [2, 'leader'], [3, 'pre-candidate'],
]);
const REFUSAL = Object.freeze({outcome: OUTCOME.CORE_REFUSED,
  reason: RUNTIME_REASON.INVALID_NATIVE_ROLE,
  phase: RUNTIME_PHASE.STATUS_OBSERVATION,
  retryable: false, recoveryRequired: false});

async function roleFixture(t, overrides = {}) {
  const state = {corrupt: false, role: undefined, instances: 0, statuses: 0, steps: 0, ticks: 0};
  const binding = {
    verifyRaftRsBinding,
    instantiateRaftRsCore: () => {
      state.instances += 1;
      const native = instantiateRaftRsCore();
      return Object.freeze({...native, tick: (...args) => {
        state.ticks += 1;
        return native.tick(...args);
      }, step: (...args) => {
        state.steps += 1;
        return native.step(...args);
      }, status: (...args) => {
        state.statuses += 1;
        const status = native.status(...args);
        if (!state.corrupt) return status;
        const shaped = {...status};
        if (state.role === undefined) delete shaped.raftState;
        else shaped.raftState = state.role;
        return shaped;
      }});
    },
  };
  const loaded = await t.mockImport(HISTORY.href, {[BINDING.href]: binding});
  const db = historyDb(':memory:');
  const {proxy, executions} = countingDatabase(db);
  const events = [];
  const port = loaded.openHistory(proxy, overrides);
  const subscriptions = [RAFT_EVENT.LEADER, RAFT_EVENT.FOLLOWER, RAFT_EVENT.CANDIDATE]
    .map((role) => port.subscribe(role,
      () => events.push(role)));
  t.teardown(() => {
    for (const unsubscribe of subscriptions) unsubscribe();
    port.close();
    db.close();
  });
  return {state, port, executions, events, db};
}

function assertRefusal(result, label) {
  assert.deepEqual(result, REFUSAL, label);
  assert.ok(Object.isFrozen(result), `${label}: frozen`);
  assert.equal(Object.hasOwn(result, 'role'), false, `${label}: no invented role`);
}

test('fresh public reads refuse malformed roles and preserve all four valid roles', async (t) => {
  const {state, port, executions} = await roleFixture(t);
  state.corrupt = true;
  for (const [label, role] of MALFORMED) {
    state.role = role;
    executions.count = 0;
    assertRefusal(port.readRoleAndTerm(), `${label}: role and term`);
    assertRefusal(port.readStatus(), `${label}: full status`);
    assert.equal(executions.count, 0, `${label}: no peer identity resolution`);
  }
  for (const [nativeRole, role] of VALID) {
    state.role = nativeRole;
    executions.count = 0;
    const compact = port.readRoleAndTerm();
    assert.equal(compact.outcome, OUTCOME.CORE_OK);
    assert.equal(compact.role, role);
    assert.equal(executions.count, 0, `${role}: compact read resolves no identity`);
    const full = port.readStatus();
    assert.equal(full.outcome, OUTCOME.CORE_OK);
    assert.equal(full.role, role);
    assert.equal(full.term, compact.term);
  }
  assert.equal(state.instances, 1, 'invalid roles never reconstruct the runtime');
  t.pass('fresh public boundary assertions completed');
  t.end();
});

test('a busy public read refuses its recorded malformed role without a stale answer', async (t) => {
  const founders = [HISTORY_ID.peerId, 'role-peer-b', 'role-peer-c'];
  let release;
  let delivery = new Promise((resolve) => {
    release = resolve;
  });
  const {state, port, executions, events} = await roleFixture(t, {
    bootstrapPeerIds: founders, bootstrapMembership: genesisStamp(founders, {}),
    sendToPeer: () => delivery,
  });
  // Always release the real native delivery before the port's teardown.
  t.teardown(() => release(undefined));
  const valid = port.readRoleAndTerm();
  assert.equal(valid.outcome, OUTCOME.CORE_OK);
  state.role = '__proto__';
  const first = port.campaign();
  assert.equal(first.settled, false, 'the first real vote delivery is pending');
  state.corrupt = true;
  release(undefined);
  assertRefusal(await turnChainValue(first), 'the announcement refuses the malformed role');
  delivery = new Promise((resolve) => {
    release = resolve;
  });
  state.corrupt = false;
  const pending = port.campaign();
  assert.equal(pending.settled, false, 'a real vote delivery holds the runtime queue');
  state.corrupt = true;
  const statuses = state.statuses;
  executions.count = 0;
  assertRefusal(port.readRoleAndTerm(), 'busy compact read');
  assertRefusal(port.readStatus(), 'busy full read');
  assert.equal(state.statuses, statuses, 'both busy reads use the recorded observation');
  assert.equal(executions.count, 0, 'the refused recorded status resolves no peers');
  release(undefined);
  assertRefusal(await turnChainValue(pending), 'the next announcement still refuses');
  assert.deepEqual(events, [], 'no follower or other role event is invented');
  assert.equal(state.instances, 1, 'the refused announcement does not reconstruct');
  state.corrupt = false;
  assert.equal(port.readStatus().outcome, OUTCOME.CORE_OK, 'a valid later read is usable');
  t.pass('recorded public boundary assertions completed');
  t.end();
});

test('an inbound-draining role read refuses malformed roles and resolves no peers', async (t) => {
  const {state, port, executions, events, db} = await roleFixture(t);
  assert.equal((await turnChainValue(port.campaign())).outcome, OUTCOME.CORE_OK);
  const before = port.readStatus();
  events.length = 0;
  const enqueue = () => {
    const admitted = port.step({groupId: HISTORY_ID.groupId, to: before.peerId,
      message: {msgType: RAFT_RS_MESSAGE_TYPE.HEARTBEAT_RESPONSE,
        from: before.peerId, to: before.peerId, term: String(before.term)}});
    assert.equal(admitted.result.outcome, OUTCOME.CORE_OK, 'the real port admits inbound');
  };
  for (const [label, role] of MALFORMED) {
    state.corrupt = true;
    state.role = role;
    enqueue();
    executions.count = 0;
    assertRefusal(port.readRoleAndTerm(), `${label}: inbound-draining read`);
    assert.equal(executions.count, 0, `${label}: no peer identity resolution`);
  }
  assert.deepEqual(events, [], 'invalid announcements emit no invented role');
  state.corrupt = false;
  enqueue();
  executions.count = 0;
  const after = port.readRoleAndTerm();
  assert.equal(after.outcome, OUTCOME.CORE_OK);
  assert.equal(after.role, 'leader');
  assert.equal(executions.count, 0, 'a valid inbound compact read also resolves no peers');
  db.exec('BEGIN');
  try {
    enqueue();
    const steps = state.steps;
    executions.count = 0;
    assert.equal(port.readRoleAndTerm().role, 'leader',
      'a caller transaction admits the same observation-only role read');
    state.corrupt = true;
    state.role = 'constructor';
    assertRefusal(port.readRoleAndTerm(), 'a caller transaction never masks an invalid role');
    assert.equal(state.steps, steps, 'the caller transaction keeps inbound unstepped');
    assert.equal(executions.count, 0, 'transaction-held reads also resolve no peers');
    assert.equal(db.inTransaction, true, 'the caller still owns its transaction');
  } finally {
    db.exec('ROLLBACK');
  }
  assert.equal(state.instances, 1, 'no malformed observation reconstructs the runtime');
  t.pass('inbound public boundary assertions completed');
  t.end();
});


test('native transfer refuses malformed status before any step or already-leader success', async (t) => {
  const {state, port} = await roleFixture(t);
  assert.equal((await turnChainValue(port.campaign())).outcome, OUTCOME.CORE_OK);
  const command = {successor: SUCCESSOR.NAMED, replicaIdentity: HISTORY_ID.peerId};
  assert.equal((await turnChainValue(port.transferLeadership(command))).outcome, OUTCOME.CORE_OK,
    'the same valid native leader is already the requested leader');
  state.corrupt = true;
  for (const [label, role] of MALFORMED) {
    state.role = role;
    const steps = state.steps;
    assertRefusal(await turnChainValue(port.transferLeadership(command)), label);
    assertRefusal(await turnChainValue(port.transferLeadership({
      successor: SUCCESSOR.MOST_CAUGHT_UP})), label);
    assert.equal(state.steps, steps, `${label}: no native transfer step`);
  }
  state.corrupt = false;
  assert.equal((await turnChainValue(port.transferLeadership(command))).outcome, OUTCOME.CORE_OK);
  t.pass('native transfer validates before both success and mutation');
  t.end();
});


test('native peer probe preserves malformed-role refusal without peer reads or native steps', async (t) => {
  const founders = [HISTORY_ID.peerId, 'role-peer-b'];
  const {state, port, executions} = await roleFixture(t, {
    bootstrapPeerIds: founders, bootstrapMembership: genesisStamp(founders, {}),
  });
  state.corrupt = true;
  for (const [label, role] of MALFORMED) {
    state.role = role;
    const steps = state.steps;
    executions.count = 0;
    assertRefusal(await turnChainValue(port.probePeerProgress('role-peer-b')), label);
    assert.equal(state.steps, steps);
    assert.equal(executions.count, 0);
  }
  state.corrupt = false;
  const valid = await turnChainValue(port.probePeerProgress('role-peer-b'));
  assert.equal(valid.reason, RUNTIME_REASON.NOT_LEADER, 'readable follower keeps ordinary refusal');
  t.pass('peer probe consumes canonical role authority');
  t.end();
});

// Real composed service methods consume events emitted by the real runtime.
// Activation/publication sinks are passive; they do not manufacture events.
function composedMessageGroup(port) {
  const service = Object.create(MessageGroupService.prototype);
  const effects = {activated: [], cancelled: 0, reconciled: 0, refusals: []};
  Object.assign(service, {
    raft: port, replicaId: HISTORY_ID.peerId, groupId: HISTORY_ID.groupId,
    nodeId: 'role-native-node', role: RaftRole.FOLLOWER, isLeader: false,
    leaderId: null, leadershipTenure: null,
    operationLedger: {currentTerm: 0},
    forwardingOwner: {normalizeLeaderReplicaId: (id) => id},
    logger: {debug() {}, error: (_message, fields) => effects.refusals.push(fields.consensus)},
    scheduleLeaderOwnedActivation: (term) => effects.activated.push(term),
    cancelLeaderOwnedActivation: () => effects.cancelled++,
    updateRebalancerLeadership: () => effects.reconciled++,
    queueRoleUpdate() {}, queueLeaderNodeUpdate() {},
  });
  service.wireRaftEvents();
  return {service, effects};
}

test('native invalid announcement withdraws MG and rows, refuses inbound, then renews tenure',
  async (t) => {
    const {state, port} = await roleFixture(t);
    const {service, effects} = composedMessageGroup(port);
    await turnChainValue(port.campaign());
    t.equal(service.isLeaderReplica(), true, 'real campaign publishes leadership');
    const tenure = service.leadershipTenure;
    const before = port.readStatus();
    const row = () => MessageGroupServiceRowOwner.buildServiceRow({
      service, groupId: service.groupId, replicaId: service.replicaId, nodeId: service.nodeId});
    t.equal(row().raft_role, 'leader', 'valid authority publishes its role');
    state.corrupt = true;
    t.same(await turnChainValue(port.tick()), REFUSAL, 'real tick returns typed refusal');
    t.equal(service.isLeaderReplica(), false, 'actual producer withdraws leader flag');
    t.equal(service.leadershipTenure, null, 'actual producer ends the tenure');
    t.ok(effects.cancelled > 0 && effects.reconciled > 0, 'withdrawal reaches owned effects');
    t.same(effects.refusals.at(-1), REFUSAL, 'service reports exact native refusal');
    t.throws(row, {raftResult: REFUSAL}, 'row builder cannot resurrect retained role');
    const steps = state.steps;
    port.step({groupId: HISTORY_ID.groupId, to: before.peerId,
      message: {msgType: RAFT_RS_MESSAGE_TYPE.HEARTBEAT_RESPONSE,
        from: before.peerId, to: before.peerId, term: String(before.term)}});
    t.same(await turnChainValue(port.tick()), REFUSAL, 'inbound turn preserves refusal');
    t.equal(state.steps, steps, 'latest invalid observation forbids native step');
    state.corrupt = false;
    t.equal((await turnChainValue(port.tick())).outcome, OUTCOME.CORE_OK,
      'next valid turn recovers without changing native role or term');
    t.equal(service.isLeaderReplica(), true, 'real valid announcement restores leadership');
    t.ok(service.leadershipTenure !== null && service.leadershipTenure !== tenure,
      'recovery creates a new tenure, never resurrects the old token');
    const recovered = port.readStatus();
    t.same(recovered.inboundStepRefusals.map(({reason, phase}) => ({reason, phase})),
      [{reason: REFUSAL.reason, phase: REFUSAL.phase}], 'refused sender remains recorded');
    t.equal(row().raft_role, 'leader', 'new valid authority permits row publication');
    port.step({groupId: HISTORY_ID.groupId, to: before.peerId,
      message: {msgType: RAFT_RS_MESSAGE_TYPE.HEARTBEAT_RESPONSE,
        from: before.peerId, to: before.peerId, term: String(before.term)}});
    t.equal((await turnChainValue(port.tick())).outcome, OUTCOME.CORE_OK);
    t.equal(state.steps, steps + 1, 'valid observation reopens inward admission');
    t.equal(state.instances, 1, 'observation refusal did not rebuild native runtime');
    t.end();
  });


test('scheduled ingress observes refusal without stepping and recovers on the next valid wake',
  async (t) => {
    const clock = new VirtualTimeSource({startMs: 1000});
    const {state, port} = await roleFixture(t, {substrate: {timeSource: clock}});
    const {service, effects} = composedMessageGroup(port);
    await turnChainValue(port.campaign());
    const status = port.readStatus();
    const oldTenure = service.leadershipTenure;
    const deliver = () => port.step({groupId: HISTORY_ID.groupId, to: status.peerId,
      message: {msgType: RAFT_RS_MESSAGE_TYPE.HEARTBEAT_RESPONSE,
        from: status.peerId, to: status.peerId, term: String(status.term)}});
    const steps = state.steps;
    state.corrupt = true;
    deliver();
    clock.advance(1);
    t.equal(state.steps, steps, 'scheduled admission performs only observation, no step');
    t.equal(service.isLeaderReplica(), false, 'scheduled refusal withdraws old leadership');
    t.equal(service.leadershipTenure, null);
    t.equal(effects.cancelled, 1, 'active tenure withdrawn once');
    deliver();
    clock.advance(1);
    t.equal(state.steps, steps, 'repeated invalid delivery remains refused');
    t.equal(effects.cancelled, 1, 'refusal does not repeat withdrawal effects');
    state.corrupt = false;
    deliver();
    clock.advance(1);
    t.equal(state.steps, steps + 1, 'one fresh valid observation admits the delivered envelope');
    t.equal(service.isLeaderReplica(), true, 'normal drain announcement restores leadership');
    t.not(service.leadershipTenure, oldTenure, 'new tenure follows the new valid observation');
    t.equal(effects.activated.length, 2, 'only original and renewed activation');
    t.equal(state.instances, 1);
    t.end();
  });


test('refusal from a transfer observation withdraws authority before a later announcement',
  async (t) => {
    const {state, port} = await roleFixture(t);
    const {service, effects} = composedMessageGroup(port);
    await turnChainValue(port.campaign());
    const oldTenure = service.leadershipTenure;
    state.corrupt = true;
    const steps = state.steps;
    t.same(await turnChainValue(port.transferLeadership({
      successor: SUCCESSOR.NAMED, replicaIdentity: HISTORY_ID.peerId})), REFUSAL);
    t.equal(service.isLeaderReplica(), false, 'command observation withdraws immediately');
    t.equal(service.leadershipTenure, null, 'no valid older tenure survives a command refusal');
    t.equal(effects.cancelled, 1);
    t.equal(state.steps, steps, 'no transfer step');
    state.corrupt = false;
    await turnChainValue(port.tick());
    t.equal(service.isLeaderReplica(), true);
    t.not(service.leadershipTenure, oldTenure);
    t.end();
  });

test('synchronous refusal listeners re-enter retained refusal without recursion or tenure churn',
  async (t) => {
    const {state, port} = await roleFixture(t);
    const {service, effects} = composedMessageGroup(port);
    const normal = [];
    for (const event of [RAFT_EVENT.LEADER, RAFT_EVENT.TERM_CHANGE, RAFT_EVENT.LEADER_CHANGE]) {
      port.subscribe(event, () => normal.push(event));
    }
    await turnChainValue(port.campaign());
    t.same(normal, [RAFT_EVENT.LEADER, RAFT_EVENT.TERM_CHANGE, RAFT_EVENT.LEADER_CHANGE],
      'normal role, term and leader ordering is unchanged');
    const firstTenure = service.leadershipTenure;
    const row = () => MessageGroupServiceRowOwner.buildServiceRow({
      service, groupId: service.groupId, replicaId: service.replicaId, nodeId: service.nodeId});
    let notifications = 0;
    port.subscribe(RAFT_EVENT.ROLE_OBSERVATION_REFUSED, (refusal) => {
      notifications++;
      assert.ok(notifications <= 2, 'duplicate invalid reads must not recursively emit');
      assertRefusal(refusal, 'event payload');
      assertRefusal(port.readRoleAndTerm(), 'listener compact read');
      assertRefusal(port.readStatus(), 'listener full read');
      assert.throws(row, {raftResult: REFUSAL}, 'diagnostic row read preserves refusal');
      assert.equal(service.leadershipTenure, null, 'withdrawal preceded diagnostic listener');
    });
    state.corrupt = true;
    const steps = state.steps;
    const ticks = state.ticks;
    t.same(port.readRoleAndTerm(), REFUSAL, 'idle observation publishes the refusal');
    t.equal(notifications, 1, 'reentrant reads produce only one refusal notification');
    t.equal(effects.cancelled, 1, 'previous active tenure withdrawn exactly once');
    t.equal(state.steps, steps, 'observational read does not step');
    t.equal(state.ticks, ticks, 'observational read does not tick');
    t.same(await turnChainValue(port.tick()), REFUSAL, 'later invalid turn remains explicit');
    t.equal(notifications, 1, 'invalid announce does not republish the retained refusal');
    state.corrupt = false;
    t.equal(port.readRoleAndTerm().role, RaftRole.LEADER, 'fresh valid observation is readable');
    t.equal(service.leadershipTenure, null, 'read alone does not reactivate withdrawn tenure');
    t.equal((await turnChainValue(port.tick())).outcome, OUTCOME.CORE_OK);
    const secondTenure = service.leadershipTenure;
    t.ok(secondTenure != null && secondTenure !== firstTenure, 'normal announcement creates a new tenure');
    t.equal(row().raft_role, RaftRole.LEADER, 'valid generation can publish an authoritative row');
    state.corrupt = true;
    t.same(await turnChainValue(port.tick()), REFUSAL, 'next generation also refuses explicitly');
    t.equal(notifications, 2, 'one refusal for each withdrawn valid generation');
    t.equal(effects.cancelled, 2, 'each tenure withdrawn once');
    state.corrupt = false;
    await turnChainValue(port.tick());
    t.ok(service.leadershipTenure != null && service.leadershipTenure !== secondTenure);
    t.equal(effects.activated.length, 3, 'only original and two valid generation activations');
    t.equal(state.instances, 1, 'observation refusal never reconstructs the native core');
    t.end();
  });

test('a diagnostic listener rethrowing the retained refusal cannot prevent lifecycle withdrawal',
  async (t) => {
    const {state, port} = await roleFixture(t);
    let service = null;
    let diagnostics = 0;
    // This consumer subscribes first and lets the row's typed error propagate.
    port.subscribe(RAFT_EVENT.ROLE_OBSERVATION_REFUSED, () => {
      diagnostics++;
      MessageGroupServiceRowOwner.buildServiceRow({service, groupId: service.groupId,
        replicaId: service.replicaId, nodeId: service.nodeId});
    });
    const composed = composedMessageGroup(port);
    service = composed.service;
    await turnChainValue(port.campaign());
    const tenure = service.leadershipTenure;
    state.corrupt = true;
    t.same(await turnChainValue(port.tick()), REFUSAL, 'same observed refusal remains the inward answer');
    t.equal(service.leadershipTenure, null, 'later lifecycle listener still withdraws authority');
    t.equal(composed.effects.cancelled, 1, 'owned effects withdrawn once');
    t.same(port.readRoleAndTerm(), REFUSAL);
    t.equal(diagnostics, 1, 'reentrant diagnostic does not recursively republish');
    state.corrupt = false;
    t.equal((await turnChainValue(port.tick())).outcome, OUTCOME.CORE_OK);
    t.ok(service.leadershipTenure != null && service.leadershipTenure !== tenure);
    t.equal(state.instances, 1, 'an observation error never becomes a native trap');
    t.end();
  });
