/** Selection guard witnesses of the promotion owner (FreshMG 6.C, C2; the class
 * repair the independent review of 6d4132222 required). Every refusal branch
 * and every precondition of the branch CAS in
 * src/rebalancer/replica-operation-message-group-promotion.js has a named
 * mutation in the design note's guard-vs-mutation table and dies at a named
 * assertion here, in the recording guard file or in
 * message-group-learner-promotion.integration.test.js. Same world and physics
 * as that witness (message-group-learner-promotion-fixture.js): the real
 * three-founder raft-rs group with the RUNNING learner, the real repository on
 * file-backed operation SQL. Crafted native answers and observations, forged
 * rows and a real isolated newer-term leader are explicit test physics; no
 * driver, production route or physical proof.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PARTITION_SERVICE_ERROR_MSG} from '../../src/partition/partition-service-constants.js';
import {RAFT_OPERATION_OUTCOME} from '../../src/raft/raft-operation-port-constants.js';
import {COMMITTED_LEARNER_ACTION_KIND as KIND, COMMITTED_LEARNER_ACTION_REASON as ACTION} from
  '../../src/raft/raft-committed-membership-constants.js';
import {MEMBERSHIP_PHASE as PHASE} from
  '../../src/rebalancer/replica-operation-message-group-membership-permit.js';
import {fixture, FOUNDERS, NODE, O, SUCCESSOR} from '../test-helpers/learner-operation-fixture.js';
import {BRANCH_CAS, OWNER_CLAIM, TARGET_PEER, catchUpRoute, caughtUp, configurationOf,
  countWrites, leaderOf, learnerMatch, learnerQuery, otherFounder, promotionWorld,
  refusedOnForgedRow, settled} from '../test-helpers/message-group-learner-promotion-fixture.js';

/** A real leadership transfer cut off before the new leader's own no-op can
 * commit: a leader of a strictly newer term that applied the learner entry
 * but no entry of its own term. The learner still acknowledges it. */
function isolatedNewerTermLeader(f, successor, others) {
  const from = leaderOf(f);
  assert.equal(f.cluster.node(from).transferLeadership({successor: 'named',
    replicaIdentity: successor}).outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
  f.cluster.tickers = [successor];
  let isolated = false;
  for (let round = 0; round < 400 && !isolated; round += 1) {
    for (const id of f.cluster.tickers) f.cluster.node(id).tick();
    for (const id of FOUNDERS) {
      const replica = f.cluster.replica(id);
      const pending = replica.inbox.splice(0, replica.inbox.length);
      for (const envelope of pending) replica.node.step(envelope);
      if (pending.length > 0) replica.node.tick();
      if (f.cluster.node(successor).readStatus().role === 'leader') {
        for (const other of others) f.cluster.isolate(other);
        f.cluster.replica(successor).inbox.length = 0;
        isolated = true;
        break;
      }
    }
  }
  assert.equal(isolated, true, 'the successor became leader');
  f.cluster.tickers = []; // no ticks: no check-quorum step-down, no election
  return from;
}

test('selection input guards: an incomplete request, a missing capability or a missing lifetime ' +
  'is INVALID before any read; a lapsed invocation asks for nothing; an unreadable row is ' +
  'UNAVAILABLE', {timeout: 30000}, async (t) => {
  const f = await fixture(t);
  let asked = 0;
  const ask = async () => {
    asked += 1; return null;
  };
  const select = (request, read = ask, observe = ask, current = () => true) =>
    settled(f.repository.selectMessageGroupPromotion(request, read, observe, current));
  const route = {operationId: O, destinationNodeId: SUCCESSOR, destinationReplicaId: f.leader};
  const invalid = {
    'a request that is no data record': [null],
    'no operation': [{destinationNodeId: SUCCESSOR, destinationReplicaId: f.leader}],
    'no destination node': [{operationId: O, destinationReplicaId: f.leader}],
    'no destination replica': [{operationId: O, destinationNodeId: SUCCESSOR}],
    'a read capability that is no function': [route, null],
    'an observation capability that is no function': [route, ask, null],
  };
  const before = f.row(); const writes = countWrites(f, BRANCH_CAS);
  for (const [name, args] of Object.entries(invalid)) {
    const reads = f.reads.length;
    assert.equal((await select(...args)).outcome, 'invalid', name);
    assert.equal(f.reads.length, reads, `${name}: INVALID reads no row`);
  }
  const reads0 = f.reads.length;
  assert.equal((await settled(f.repository.selectMessageGroupPromotion(route, ask, ask))).outcome,
    'invalid', 'no invocation lifetime: a selection without a lifetime predicate is INVALID');
  assert.equal(f.reads.length, reads0, 'no invocation lifetime: INVALID reads no row');
  assert.equal(asked, 0, 'INVALID asks for no evidence');
  const reads = f.reads.length;
  assert.equal((await select(route, ask, ask, () => false)).outcome, 'unavailable',
    'a lapsed invocation is UNAVAILABLE before the first read');
  assert.equal(f.reads.length, reads, 'a lapsed invocation reads no row');
  assert.equal(asked, 0, 'and asks for no evidence');
  f.failReads('replica_operations');
  assert.equal((await select(route)).outcome, 'unavailable',
    'an unreadable authoritative row is UNAVAILABLE, never a missing fact');
  f.failReads(null);
  assert.equal(asked, 0); assert.equal(writes.submitted(), 0); assert.deepEqual(f.row(), before);
});

test('origin evidence guards: only a COMMITTED/APPLIED answer carrying exactly the recorded ' +
  'origin bytes is evidence; a refused-unavailable answer is UNAVAILABLE; a receipt the codec ' +
  'refuses is ORIGIN_UNRECORDED, never a thrown selection', {timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  assert.equal(await caughtUp(fx), true);
  const committed = await f.cluster.node(leaderOf(f)).readCommittedMembership(
    learnerQuery(f, fx.permit()));
  assert.equal(committed.kind, KIND.COMMITTED, 'positive control: the routed leader evidences it');
  const cases = {
    'a refused-unavailable native answer': [{kind: KIND.REFUSED, reason: ACTION.UNAVAILABLE},
      'unavailable'],
    'an unresolved kind under an applied reason with the genuine receipt': [
      {...committed, kind: KIND.UNRESOLVED}, 'origin_unrecorded'],
    'a committed kind beyond the applied boundary': [
      {...committed, reason: ACTION.BEYOND_APPLIED}, 'origin_unrecorded'],
    'a receipt the origin codec refuses': [{...committed, receipt: {groupId: 7}},
      'origin_unrecorded'],
    'a receipt claiming the promotion stage as an origin': [{...committed, receipt:
      {...committed.receipt, context: {...committed.receipt.context, stage: 'promote'}}},
    'origin_unrecorded'],
  };
  const before = f.row(); const writes = countWrites(f, BRANCH_CAS);
  for (const [name, [answer, expected]] of Object.entries(cases)) {
    const got = await settled(fx.select({}, {readAction: async () => answer}));
    assert.equal(got.outcome, expected, `${name}: ${JSON.stringify(got)}`);
  }
  assert.equal(writes.submitted(), 0, 'no evidence, no CAS'); assert.deepEqual(f.row(), before);
  assert.equal((await fx.select()).outcome, 'recorded', 'positive control: the real answer selects');
});

test('observation guards: a thrown observation route is leader_unavailable, an own view that ' +
  'does not name the exact learner is learner_unobserved, an applied index that is no safe ' +
  'integer is no own-term witness; nothing is written', {timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  assert.equal(await caughtUp(fx), true);
  const before = f.row(); const writes = countWrites(f, BRANCH_CAS);
  const alter = (change) => ({observeCatchUp: catchUpRoute(f, fx.world, {alter: change})});
  const thrown = await settled(fx.select({}, {observeCatchUp: async () => {
    throw new Error('fixture: the observation route is down');
  }}));
  assert.deepEqual([thrown.outcome, thrown.acknowledgement], ['not_caught_up',
    'leader_unavailable'], 'a thrown observation is no leader observed, never a thrown selection');
  const voterAlready = await fx.select({}, alter((observation) => {
    const {own} = observation;
    const voters = [...own.voters, TARGET_PEER];
    const learners = own.learners.filter((peer) => peer !== TARGET_PEER);
    return {...observation, own: {...own, voters, learners,
      configurationKey: configurationOf(voters, learners)}};
  }));
  assert.equal(voterAlready.acknowledgement, 'learner_unobserved',
    'an own view naming the target a voter is no view of the exact learner');
  const stringApplied = await fx.select({}, alter((observation) => ({...observation,
    status: {...observation.status, currentTermApplied: false,
      appliedIndex: String(observation.status.appliedIndex)}})));
  assert.equal(stringApplied.acknowledgement, 'leader_term_unapplied',
    'an applied index that is no safe integer is no own-term witness');
  assert.equal(writes.submitted(), 0); assert.deepEqual(f.row(), before);
});

test('V1: a real leader of a newer term that applied the learner entry but no entry of its own ' +
  'term is no promotion authority; once its no-op commits it is', {timeout: 60000}, async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  assert.equal(await caughtUp(fx), true);
  const prior = fx.permit();
  const successor = otherFounder(f);
  const others = FOUNDERS.filter((id) => id !== successor);
  isolatedNewerTermLeader(f, successor, others);
  const status0 = f.cluster.node(successor).readStatus();
  assert.equal(status0.role, 'leader');
  assert.ok(status0.term > prior.leaderTerm, 'a strictly newer term than the learner entry');
  assert.equal(status0.currentTermApplied, false, 'its own term is not applied');
  assert.equal(await fx.world.until(() => learnerMatch(f, successor) >=
    f.cluster.node(successor).readStatus().commitIndex), true, 'the learner acknowledges it');
  const status = f.cluster.node(successor).readStatus();
  assert.equal(status.currentTermApplied, false, 'still no entry of its own term applied');
  assert.ok(status.appliedIndex >= prior.proposalIndex, 'it applied the learner entry');
  const before = f.row(); const writes = countWrites(f, BRANCH_CAS);
  const refused = await fx.select({destinationReplicaId: successor},
    {observeCatchUp: catchUpRoute(f, fx.world, {leaderId: () => successor})});
  assert.deepEqual([refused.outcome, refused.acknowledgement], ['not_caught_up',
    'leader_term_unapplied'], 'no promotion authority before its own term is applied: ' +
    'the learner entry is an entry of an older term');
  assert.equal(writes.submitted(), 0); assert.deepEqual(f.row(), before);
  for (const other of others) f.cluster.heal(other);
  f.cluster.tickers = [successor];
  assert.ok(f.cluster.settle(() => f.cluster.node(successor).readStatus().currentTermApplied ===
    true && leaderOf(f) === successor, {rounds: 400}), 'healed: its no-op commits');
  assert.equal(await caughtUp(fx, successor), true);
  assert.equal((await fx.select({destinationReplicaId: successor})).outcome, 'recorded',
    'positive control: authority once its own term is applied');
});

test('V12: the promotion permit binds the routed node\'s canonical boot: an absent node row is ' +
  'UNAVAILABLE with nothing written, and the bound boot is the authoritative one',
{timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  assert.equal(await caughtUp(fx), true);
  const node = f.execute('SELECT * FROM nodes WHERE node_id = ?', [SUCCESSOR]).rows[0];
  f.execute('DELETE FROM nodes WHERE node_id = ?', [SUCCESSOR]);
  const before = f.row(); const writes = countWrites(f, BRANCH_CAS);
  assert.equal((await fx.select()).outcome, 'unavailable',
    'an absent destination boot is unavailability, never a guessed binding');
  assert.equal(writes.submitted(), 0); assert.deepEqual(f.row(), before);
  const columns = Object.keys(node);
  f.execute(`INSERT INTO nodes (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
    Object.values(node));
  f.execute('UPDATE nodes SET boot_incarnation = ? WHERE node_id = ?', [7, SUCCESSOR]);
  assert.equal((await fx.select()).outcome, 'recorded');
  assert.deepEqual([fx.permit().destinationNodeId, fx.permit().destinationBootIncarnation],
    [SUCCESSOR, 7], 'the canonical boot is bound');
});

test('V11: an invocation that lapses during the evidence reads selects nothing', {timeout: 30000},
  async (t) => {
    const fx = await promotionWorld(t); const {f} = fx;
    assert.equal(await caughtUp(fx), true);
    let lapsed = false;
    const route = catchUpRoute(f, fx.world);
    const before = f.row(); const writes = countWrites(f, BRANCH_CAS);
    const leader = leaderOf(f);
    const answer = await f.repository.selectMessageGroupPromotion({operationId: O,
      destinationNodeId: SUCCESSOR, destinationReplicaId: leader},
    (query) => f.cluster.node(leader).readCommittedMembership(query), async (...args) => {
      const observation = await route(...args); lapsed = true; return observation;
    }, () => !lapsed);
    assert.equal(answer.outcome, 'unavailable',
      'a lifetime that lapsed during the observation never reaches the branch CAS');
    assert.equal(writes.submitted(), 0); assert.deepEqual(f.row(), before);
  });

test('a holder claim that does not decode is no live local holder: STALE_OWNER, never a thrown ' +
  'selection, nothing written', {timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  assert.equal(await caughtUp(fx), true);
  const writes = countWrites(f, BRANCH_CAS);
  await refusedOnForgedRow(f, 'an undecodable owner claim', {[OWNER_CLAIM]: 'not-a-claim'},
    () => settled(fx.select()), 'stale_owner');
  assert.equal(writes.submitted(), 0);
  assert.equal((await fx.select()).outcome, 'recorded', 'positive control');
});

test('corrupt rows at selection are CONFLICT, never RECORDED or thrown: a promotion phase over ' +
  'the learner permit, identity columns disagreeing with the encoded identity, a promotion ' +
  'permit under the learner phase, a permit or identity that does not decode', {timeout: 30000},
async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  assert.equal(await caughtUp(fx), true);
  const writes = countWrites(f, BRANCH_CAS);
  await refusedOnForgedRow(f, 'the promotion phase over the learner permit',
    {message_group_membership_phase: PHASE.PROMOTION_IN_FLIGHT}, () => settled(fx.select()),
    'conflict');
  assert.equal((await fx.select()).outcome, 'recorded', 'positive control: the real row selects');
  assert.equal(writes.applied(), 1);
  await refusedOnForgedRow(f, 'identity columns disagreeing with the encoded identity',
    {source_replica_id: 'someone-else'}, () => settled(fx.select()), 'conflict');
  await refusedOnForgedRow(f, 'the promotion permit under the learner phase',
    {message_group_membership_phase: PHASE.LEARNER_COMMITTED}, () => settled(fx.select()),
    'conflict');
  await refusedOnForgedRow(f, 'a permit that does not decode',
    {message_group_membership_permit: 'not-a-permit'}, () => settled(fx.select()), 'conflict');
  await refusedOnForgedRow(f, 'an identity that does not decode',
    {message_group_membership_identity: 'not-an-identity'}, () => settled(fx.select()),
    'conflict');
  assert.equal(writes.submitted(), 1, 'the forgeries wrote nothing');
  assert.equal((await fx.select()).outcome, 'recorded', 'the restored row is the recorded promotion');
});

// Late host admission changes use real repository reads/retries and SQL;
// the injected wait only chooses when authority expires, never its outcome.
for (const mode of ['lifetime-after-row-read', 'lifetime-after-boot-read', 'lease-after-boot-read',
  'lifetime-during-retry', 'lease-during-retry', 'boot-during-retry']) {
  test(`C2 promotion selection refuses a new CAS after ${mode}`, {timeout: 30000}, async (t) => {
    const fx = await promotionWorld(t);
    const {f} = fx;
    assert.equal(await caughtUp(fx), true);
    const before = f.row();
    let current = true;
    let branchSubmissions = 0;
    let branchApplied = 0;
    let waits = 0;
    const expireLease = () => {
      const claim = JSON.parse(f.row().message_group_membership_owner_claim);
      f.clock.advance(claim.expiresAt - f.clock.now() + 1);
    };
    if (mode.endsWith('-read')) {
      const read = f.gateway.readAuthoritativeRows;
      let nodeReads = 0;
      let operationReads = 0;
      f.gateway.readAuthoritativeRows = async (table, ...args) => {
        const answer = await read(table, ...args);
        if (table === 'nodes' && ++nodeReads === 2) {
          if (mode === 'lease-after-boot-read') expireLease();
          if (mode === 'lifetime-after-boot-read') current = false;
        }
        if (table === 'replica_operations' && ++operationReads === 2 &&
            mode === 'lifetime-after-row-read') current = false;
        return answer;
      };
    }
    const execute = f.gateway.executeQuery;
    f.gateway.executeQuery = async (sql, ...args) => {
      if (!sql.includes(BRANCH_CAS)) return execute(sql, ...args);
      branchSubmissions += 1;
      if (mode.endsWith('-retry') && branchSubmissions === 1) {
        return {success: false, error: PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE};
      }
      const result = await execute(sql, ...args);
      branchApplied += result.affectedRows;
      return result;
    };
    f.repository.waitForOperationPersistRetry = async () => {
      waits += 1;
      if (mode === 'lifetime-during-retry') current = false;
      if (mode === 'lease-during-retry') expireLease();
      if (mode === 'boot-during-retry') f.execute('UPDATE nodes SET boot_incarnation = 2 WHERE node_id = ?', [NODE]);
    };
    const leader = leaderOf(f);
    const answer = await f.repository.selectMessageGroupPromotion({operationId: O,
      destinationNodeId: SUCCESSOR, destinationReplicaId: leader},
    (query) => f.cluster.node(leader).readCommittedMembership(query), fx.observeCatchUp,
    () => current);
    assert.notEqual(answer.outcome, 'recorded', 'revoked invocation has no recorded grant');
    assert.equal(waits, mode.endsWith('-retry') ? 1 : 0);
    assert.equal(branchSubmissions, mode.endsWith('-retry') ? 1 : 0,
      'new CAS submissions after invalidation must be zero');
    assert.equal(branchApplied, 0, 'no durable promotion authorization after invalidation');
    assert.deepEqual(f.row(), before);
  });
}


test('V11: an admitted promotion write may finish after its invocation lapses; answer is UNKNOWN ' +
  'and a fresh invocation recovers the exact durable selection without another CAS',
{timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t); const {f} = fx;
  assert.equal(await caughtUp(fx), true);
  let current = true;
  const execute = f.gateway.executeQuery;
  let submissions = 0;
  f.gateway.executeQuery = async (sql, ...args) => {
    const answer = await execute(sql, ...args);
    if (sql.includes(BRANCH_CAS)) {
      submissions += 1; current = false;
    }
    return answer;
  };
  const leader = leaderOf(f);
  const answer = await f.repository.selectMessageGroupPromotion({operationId: O,
    destinationNodeId: SUCCESSOR, destinationReplicaId: leader},
  (query) => f.cluster.node(leader).readCommittedMembership(query), fx.observeCatchUp,
  () => current);
  assert.equal(answer.outcome, 'unknown', 'late answer cannot grant the retired invocation');
  const selected = f.row();
  assert.equal(selected.message_group_membership_phase, PHASE.PROMOTION_IN_FLIGHT,
    'already admitted write remains durable');
  assert.equal((await fx.select()).outcome, 'recorded', 'fresh invocation sees the exact fact');
  assert.deepEqual(f.row(), selected, 'recovery does not alter selection or retained debt');
  assert.equal(submissions, 1, 'recovery submits no duplicate CAS');
});

test('V11: an invocation expiring during idempotent selection read cannot return RECORDED',
  {timeout: 30000}, async (t) => {
    const fx = await promotionWorld(t); const {f} = fx;
    assert.equal(await caughtUp(fx), true);
    assert.equal((await fx.select()).outcome, 'recorded');
    const before = f.row(); const writes = countWrites(f, BRANCH_CAS);
    let current = true;
    const read = f.gateway.readAuthoritativeRows;
    f.gateway.readAuthoritativeRows = async (table, ...args) => {
      const answer = await read(table, ...args);
      if (table === 'replica_operations') current = false;
      return answer;
    };
    const leader = leaderOf(f);
    const answer = await f.repository.selectMessageGroupPromotion({operationId: O,
      destinationNodeId: SUCCESSOR, destinationReplicaId: leader},
    (query) => f.cluster.node(leader).readCommittedMembership(query), fx.observeCatchUp,
    () => current);
    assert.notEqual(answer.outcome, 'recorded', 'no RECORDED answer after invocation expiry');
    assert.equal(writes.submitted(), 0); assert.deepEqual(f.row(), before);
  });

// Independent review: invalidate inside submission admission and final readback,
// after earlier checks have already passed. Ordinals identify the exact awaited read.
function installLateInvalidation(f, mode, writes, direct) {
  let current = true;
  let nodeReads = 0;
  let invalidatedAt = null;
  const triggerRead = direct ? 1 : mode.startsWith('before-attempt') ? 3 : 4;
  const read = f.gateway.readAuthoritativeRows;
  f.gateway.readAuthoritativeRows = async (table, ...args) => {
    const answer = await read(table, ...args);
    if (table === 'nodes' && ++nodeReads === triggerRead) {
      invalidatedAt = writes.submitted();
      if (mode.endsWith('lifetime')) current = false;
      else {
        const claim = JSON.parse(f.row().message_group_membership_owner_claim);
        f.clock.advance(claim.expiresAt - f.clock.now() + 1);
      }
    }
    return answer;
  };
  return {current: () => current,
    observation: () => ({nodeReads, invalidatedAt})};
}
async function lateInvalidationWitness(mode, t) {
  const fx = await promotionWorld(t); const {f} = fx;
  assert.equal(await caughtUp(fx), true);
  const before = f.row();
  const direct = mode.startsWith('idempotent');
  if (direct) assert.equal((await fx.select()).outcome, 'recorded');
  const selected = direct ? f.row() : null;
  const writes = countWrites(f, BRANCH_CAS);
  const invalidation = installLateInvalidation(f, mode, writes, direct);
  const leader = leaderOf(f);
  const answer = direct ? await f.repository.selectMessageGroupMembershipBranch({
    operationId: O, identity: before.message_group_membership_identity,
    priorPermit: before.message_group_membership_permit,
    nextPermit: selected.message_group_membership_permit, branch: 'promote'},
  invalidation.current) : await f.repository.selectMessageGroupPromotion({operationId: O,
    destinationNodeId: SUCCESSOR, destinationReplicaId: leader},
  (query) => f.cluster.node(leader).readCommittedMembership(query), fx.observeCatchUp,
  invalidation.current);
  const {nodeReads, invalidatedAt} = invalidation.observation();
  assert.notEqual(invalidatedAt, null, 'the declared boot-await window must engage');
  assert.equal(invalidatedAt, mode.startsWith('final-readback') ? 1 : 0,
    'the invalidation occurs on its declared side of durable submission');
  assert.equal(answer.outcome, direct && mode.endsWith('lease') ? 'stale_owner' : 'unknown',
    'the late boot-await result must not return RECORDED');
  assert.equal(writes.submitted(), mode.startsWith('final-readback') ? 1 : 0,
    'no new submission after the late boot-await invalidation');
  assert.equal(writes.applied(), mode.startsWith('final-readback') ? 1 : 0);
  if (!mode.startsWith('final-readback')) assert.deepEqual(f.row(), selected ?? before);
  else assert.equal(f.row().message_group_membership_phase, 'promotion_proposal_in_flight');
  console.log(JSON.stringify({mode, outcome: answer.outcome, nodeReads, invalidatedAt,
    submitted: writes.submitted(), applied: writes.applied()}));
}
for (const mode of ['before-attempt-lifetime', 'before-attempt-lease',
  'final-readback-lifetime', 'final-readback-lease',
  'idempotent-branch-lifetime', 'idempotent-branch-lease']) {
  test(`round2 ${mode}: late invalidation at the exact boot await cannot grant`,
    {timeout: 30000}, (t) => lateInvalidationWitness(mode, t));
}
