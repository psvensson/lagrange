// Independent native boundary witness; no candidate source substitution.
// Only the native binding's returned role is invalidated, then restored.
import {test} from '../../src/test-helpers/tap.js';
import {instantiateRaftRsCore, verifyRaftRsBinding} from '../../src/raft/raft-rs-binding-owner.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {READ_CONSISTENCY_MODE, WASM_SERVICE_COMMAND_TYPE} from
  '../../src/wasm-service/wasm-service-constants.js';

const bindingUrl = new URL('../../src/raft/raft-rs-binding-owner.js', import.meta.url);
const fixtureUrl = new URL('../../test/raft/raft-rs-backend/startup-cleanup-native-fixture.js', import.meta.url);
test('fresh valid observation with withdrawn tenure has an explicit WASM routing outcome', async (t) => {
  let corrupt = false;
  const binding = {verifyRaftRsBinding, instantiateRaftRsCore: () => {
    const native = instantiateRaftRsCore();
    return Object.freeze({...native, status: (...args) => {
      const value = native.status(...args);
      if (!corrupt) return value;
      const result = {...value};
      delete result.raftState;
      return result;
    }});
  }};
  const loaded = await t.mockImport(fixtureUrl.href, {[bindingUrl.href]: binding});
  const f = await loaded.createFixture({after: (cleanup) => t.teardown(cleanup)});
  const service = loaded.buildService(f, 'wasm-service');
  await service.initialize();
  await turnChainValue(service.raft.campaign());
  t.equal(service.isLeader, true, 'setup: actual native leadership established');
  const priorTenure = service.leadershipTenure;
  corrupt = true;
  const refused = await turnChainValue(service.raft.tick());
  t.equal(refused.reason, 'invalid-native-role');
  t.equal(service.leadershipTenure, null);
  corrupt = false;
  const read = service.raft.readRoleAndTerm();
  t.equal(read.outcome, 'CORE_OK', 'native role becomes valid before another announcement');
  t.equal(read.role, 'leader');
  t.equal(service.isLeader, false, 'read alone did not restore service authority');
  t.equal(service.leadershipTenure, null);
  service.readConsistency = READ_CONSISTENCY_MODE.LEADER_ONLY;
  const unavailable = {raftResult: {outcome: 'CORE_REFUSED',
    reason: 'replica-routing-unavailable', phase: 'replica-service-authority',
    retryable: true, recoveryRequired: false}};
  await t.rejects(service.handleMessage({operation: 'write',
    sessionId: 'review-session', key: 'review-key', value: 'review-value'}), unavailable);
  await t.rejects(service.handleMessage({operation: 'read',
    sessionId: 'review-session', key: 'review-key'}), unavailable);
  t.throws(() => service.writerCompletion.submit({type: 'WASM_WRITER_V1',
    profile: 'wasm-writer-v1/1', action: 'INIT', serviceId: service.serviceDefinitionId,
    incarnation: '11'.repeat(32), nonce: '00'.repeat(32)}), unavailable,
  'direct writer interest cannot forward to null either');
  t.equal(service.writerCompletion.pending.size, 0, 'refusal admits no writer interest');
  await t.rejects(service.proposeEntry({type: WASM_SERVICE_COMMAND_TYPE.KV_SET,
    sessionId: 'review-session',
    key: 'review-key', value: 'review-value'}), {raftResult: {outcome: 'CORE_REFUSED',
    reason: 'replica-leadership-unavailable'}}, 'direct proposal cannot regain tenure from an observation');
  const publications = [];
  service.roleUpdateWriter = async (value) => publications.push(value);
  await service.writeRoleUpdate('leader');
  t.equal(service.leadershipTenure, null, 'reads and writer admission never mint tenure');
  await turnChainValue(service.raft.tick());
  t.equal(service.isLeader, true, 'normal announcement restores actual service authority');
  t.ok(service.leadershipTenure !== null && service.leadershipTenure !== priorTenure,
    'normal announcement mints a new tenure');
  t.equal((await service.handleMessage({operation: 'read',
    sessionId: 'review-session', key: 'review-key'})).forwarded, false,
  'the same supported read routes locally after announcement');
});

test('policy-authorized follower reads need no leader destination', async (t) => {
  const {createFixture, buildService} = await import(fixtureUrl.href);
  const f = await createFixture({after: (cleanup) => t.teardown(cleanup)});
  const service = buildService(f, 'wasm-service');
  await service.initialize();
  t.same(service.raft.readRoleAndTerm(), {outcome: 'CORE_OK', role: 'follower',
    term: 0, membership: 'voter', gateOpen: true}, 'actual admitted voter before campaign');
  t.equal(service.leaderId, null);
  service.kvStore.applySet('local-session', 'key', Buffer.from('local-value'));
  const request = {operation: 'read', sessionId: 'local-session', key: 'key'};
  service.readConsistency = READ_CONSISTENCY_MODE.EVENTUAL;
  t.same(await service.handleMessage(request), {forwarded: false, value: Buffer.from('local-value')});
  service.readConsistency = READ_CONSISTENCY_MODE.STRONG;
  service.safetyInterval.updateLeaderState(0, Date.now());
  t.same(await service.handleMessage(request), {forwarded: false, value: Buffer.from('local-value')},
    'actual safety interval authorizes a local follower read');
  service.readConsistency = READ_CONSISTENCY_MODE.LEADER_ONLY;
  await t.rejects(service.handleMessage(request), {raftResult: {
    outcome: 'CORE_REFUSED', reason: 'replica-routing-unavailable'}},
  'a policy requiring forwarding still needs an owned destination');
  t.equal(service.leadershipTenure == null, true, 'no tenure was ever granted');
});

test('a second read route decision consumes newly granted native local authority', async (t) => {
  const {createFixture, buildService} = await import(fixtureUrl.href);
  const f = await createFixture({after: (cleanup) => t.teardown(cleanup)});
  const service = buildService(f, 'wasm-service');
  await service.initialize();
  service.readConsistency = READ_CONSISTENCY_MODE.STRONG;
  t.equal(service.raft.readRoleAndTerm().role, 'follower');
  let campaign;
  // Controlled scheduling at the policy callback boundary. The campaign and
  // lifecycle grant are native; this does not claim a natural inbound schedule.
  service.safetyInterval.canServeRead = () => {
    campaign = service.raft.campaign();
    return false;
  };
  const result = await service.handleMessage({operation: 'read', sessionId: 'session', key: 'key'});
  t.equal(campaign.settled, true, 'actual sole-voter native campaign settles synchronously');
  t.equal(service.isLeader, true, 'production lifecycle granted native leadership');
  t.ok(service.leadershipTenure);
  t.equal(result.forwarded, false, 'new local route is consumed instead of forwarding to self');
});
