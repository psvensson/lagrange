/** Contract oracle for the operation-row branch boundary only.
 * Real repository, canonical schema and file-backed SQLite. Prior committed
 * learner state is a supplied durable fixture, NOT proof of runtime admission.
 * No test here claims a physical CREATE or distributed SQL/Raft execution.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
import {REPLICA_OPERATIONS_SCHEMA, NODES_SCHEMA} from '../../src/bootstrap/system-table-schemas-constants.js';
import {generateCreateTableSQL, generateCreateIndexSQL} from '../../src/bootstrap/system-table-schema-sql.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {raftRsConfStateKey} from '../../src/raft/raft-rs-conf-state-key.js';
import {committedStampOfAnswer} from '../../src/raft/raft-committed-membership-stamp.js';
import {COMMITTED_MEMBERSHIP_STAMP_KIND} from '../../src/raft/raft-committed-membership-constants.js';

const NOW = 1000000;
const O = 'branch-operation';
const GROUP = 'mg-branch-proof';
const S = 'mg-source-permanent';
const T = 'mg-target-permanent';
const OWNER = 'seed-node';
const TARGET_NODE = 'target-node';
const LEASE = NOW + 30000;
const OWNER_CLAIM = JSON.stringify({version: 1, operationId: O,
  transitionIdentity: 'branch-transition', ownerNodeId: OWNER,
  ownerBootIncarnation: 1, generation: 1, expiresAt: LEASE});
const ENCODED_IDENTITY = JSON.stringify({operationId: O, groupId: GROUP,
  sourceReplicaId: S, sourceNodeId: OWNER, sourceCreatedAt: 30,
  sourceCreateAttemptToken: 'source-attempt', targetReplicaId: T,
  targetPeerId: deriveRaftRsPeerId(T), targetNodeId: TARGET_NODE,
  targetAddress: 'raft-rs://target', transitionIdentity: 'branch-transition',
  membershipLaneKey: `message-group:${GROUP}`});
const CLAIM = JSON.stringify({replicaId: S, createdAt: 30,
  stateEnteredAt: 40, createAttemptToken: 'source-attempt'});
const peerOf = deriveRaftRsPeerId;
const conf = (learners) => ({voters: [peerOf(S)], votersOutgoing: [],
  learners, learnersNext: [], autoLeave: false});
const learnerStamp = Object.freeze({kind: COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED,
  voters: [peerOf(S)], votersOutgoing: [], learners: [peerOf(T)], learnersNext: [],
  appliedIndex: 6, commitIndex: 6, membershipGenerationIndex: 5, term: 3,
  configurationKey: raftRsConfStateKey(conf([peerOf(T)])), leaderId: S,
  gateOpen: true, identities: {[peerOf(S)]: S, [peerOf(T)]: T}});
const prior = Object.freeze({version: 2, transitionIdentity: 'branch-transition',
  permitSequence: 1, permitStage: 'add-learner', permitState: 'committed',
  workflowOwnerNodeId: OWNER, workflowOwnerFence: `${OWNER}:1:1`,
  membershipLeaseExpiresAt: LEASE, proposerNodeId: OWNER, proposerBootIncarnation: 1,
  destinationNodeId: OWNER, destinationBootIncarnation: 1,
  replicaLifecycleIncarnation: 'runtime-incarnation', runtimeGeneration: 1,
  leaderTerm: 3, leaderConfigurationStamp: {configurationKey: raftRsConfStateKey(conf([])),
    membershipGenerationIndex: 1}, proposalIndex: 5, replicaIdentity: T, peerId: peerOf(T)});
function request(branch = 'promote', changes = {}) {
  const next = {...prior, permitSequence: 2,
    permitStage: branch === 'promote' ? 'promote' : 'remove',
    permitState: 'in_flight', proposalIndex: null,
    leaderConfigurationStamp: {configurationKey: learnerStamp.configurationKey,
      membershipGenerationIndex: learnerStamp.membershipGenerationIndex}, ...changes};
  return {operationId: O, identity: ENCODED_IDENTITY,
    priorPermit: JSON.stringify(prior), nextPermit: JSON.stringify(next), branch};
}
async function setup(t, {initial = false} = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-branch-proof-'));
  const file = path.join(directory, 'operations.sqlite');
  let db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.exec(generateCreateTableSQL(REPLICA_OPERATIONS_SCHEMA));
  db.exec(generateCreateTableSQL(NODES_SCHEMA));
  for (const sql of generateCreateIndexSQL(REPLICA_OPERATIONS_SCHEMA)) db.exec(sql);
  t.after(() => {
    db.close(); fs.rmSync(directory, {recursive: true, force: true});
  });
  const clock = new VirtualTimeSource({startMs: NOW});
  let writes = 0;
  let claimWrites = 0;
  let resolutionWrites = 0;
  let resolutionChanges = 0;
  let fault = null;
  let failReads = false;
  const pending = [];
  const run = (sql, params = []) => {
    try {
      const statement = db.prepare(sql);
      if (statement.reader) return {success: true, rows: statement.all(...params)};
      const answer = statement.run(...params);
      return {success: true, affectedRows: answer.changes, changes: answer.changes};
    } catch (error) {
      return {success: false, error: error.message, errorCode: error.code};
    }
  };
  const gateway = {
    async executeQuery(sql, params = []) {
      if (sql.includes('SET message_group_membership_phase') ||
        sql.includes('SET message_group_membership_owner_claim') ||
        sql.includes('SET message_group_membership_lane_key')) {
        if (sql.includes('SET message_group_membership_phase')) writes++;
        else if (sql.includes('SET message_group_membership_owner_claim')) claimWrites++;
        else resolutionWrites++;
        const action = fault; fault = null;
        if (typeof action === 'function') await action();
        if (action === 'delayed') {
          pending.push(() => run(sql, params));
          return {success: false, error: 'delayed authorization answer unknown'};
        }
        if (action === 'refused') return {success: false, error: 'authorization write refused'};
        const answer = run(sql, params);
        if (sql.includes('SET message_group_membership_lane_key')) {
          resolutionChanges += answer.changes ?? 0;
        }
        if (action === 'lost-and-unreadable') failReads = true;
        if (action === 'lost' || action === 'lost-and-unreadable') {
          return {success: false, error: 'authorization result lost'};
        }
        return answer;
      }
      return run(sql, params);
    },
    async readAuthoritativeRows(_table, sql, params) {
      if (failReads) throw new Error('injected owner read unavailable');
      return run(sql, params);
    },
    async readRows(_table, sql, params) {
      if (failReads) throw new Error('injected owner read unavailable');
      return run(sql, params);
    },
  };
  const repo = (nodeId = OWNER, boot = 1) => new ReplicaOperationRepository({
    nodeId, timeSource: clock,
    membershipOwnerBootIncarnation: boot, controlPlaneSystemTableGateway: gateway,
    systemTableCache: {get: () => null, getAll: () => [], filter: () => []},
    cdcIntegrationService: {waitForCacheUpdate: async () => {}},
    authoritativeVisibilityTimeoutMs: 0, authoritativeVisibilityRetryDelayMs: 0,
    logger: {debug() {}, error() {}, info() {}, warn() {}}});
  for (const nodeId of [OWNER, TARGET_NODE, 'third-node']) {
    const inserted = run(`INSERT INTO nodes
      (node_id,node_address,cpu_cores,memory_mb,disk_gb,last_heartbeat,boot_incarnation,created_at)
      VALUES (?,?,?,?,?,?,?,?)`, [nodeId, `${nodeId}:8000`, 2, 512, 10, NOW, 1, NOW]);
    assert.equal(inserted.affectedRows, 1);
  }
  let repository = repo();
  assert.equal(typeof repository.selectMessageGroupMembershipBranch, 'function',
    'existing repository must own the durable promotion/abort CAS');
  assert.ok(committedStampOfAnswer(learnerStamp), 'typed committed learner fixture validates');
  const operation = {operationId: O, type: OperationType.REPLACE, partitionId: GROUP,
    entityType: SERVICE_TYPE.MESSAGE_GROUP, entityId: GROUP, replicaId: T, sourceReplicaId: S,
    sourceNodeId: OWNER, targetNodeId: TARGET_NODE, status: ReplicaStatus.PENDING,
    workflowStep: WORKFLOW_STEP.PENDING, createdAt: NOW, updatedAt: NOW, completedAt: null,
    errorMessage: null, stepsHistory: [], membershipPublicationEpoch: 1,
    messageGroupMembershipLaneKey: `message-group:${GROUP}`,
    messageGroupMembershipPhase: 'learner_requested',
    messageGroupMembershipObligationState: 'intent_recorded',
    messageGroupMembershipIdentity: ENCODED_IDENTITY, messageGroupLearnerStamp: null,
    messageGroupVoterStamp: null, messageGroupRemovalStamp: null,
    messageGroupSourceLifecycleClaim: CLAIM};
  await repository.persistNewOperation(operation);
  // Supply the preceding committed learner basis. This unit does not claim to produce it.
  if (!initial) {
    const seeded = run(`UPDATE replica_operations SET message_group_membership_phase = ?,
    message_group_membership_obligation_state = ?, message_group_membership_permit = ?,
    message_group_learner_stamp = ?, lease_expires_at = ?,
    message_group_membership_owner_claim = ? WHERE operation_id = ?`,
    ['learner_committed', 'unknown', JSON.stringify(prior), JSON.stringify(learnerStamp), LEASE, OWNER_CLAIM, O]);
    assert.equal(seeded.affectedRows, 1, JSON.stringify(seeded));
  }
  return {get repository() {
    return repository;
  }, repo, clock, run,
  row: () => db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?').get(O),
  get writes() {
    return writes;
  }, get resolutionWrites() {
    return resolutionWrites;
  }, get resolutionChanges() {
    return resolutionChanges;
  }, get claimWrites() {
    return claimWrites;
  },
  claimRequest: () => ({operationId: O, identity: ENCODED_IDENTITY,
    expectedClaim: db.prepare('SELECT message_group_membership_owner_claim FROM replica_operations WHERE operation_id = ?').pluck().get(O)}),
  fault: (value) => {
    fault = value;
  },
  reads: (available) => {
    failReads = !available;
  },
  flush: () => pending.splice(0).map((apply) => apply()),
  reopen: () => {
    db.close(); db = new Database(file); repository = repo();
  }};
}
async function terminal(f) {
  const operation = await f.repository.queryAuthoritativeOperationById(O);
  return f.repository.persistOperationUpdate({...operation, status: ReplicaStatus.FAILED,
    workflowStep: WORKFLOW_STEP.FAILED, completedAt: NOW + 1, updatedAt: NOW + 1},
  {confirmPersistence: false, disableSystemWriteSession: true, returnDisposition: true,
    expectedWorkflowStep: WORKFLOW_STEP.PENDING, terminalTransition: true});
}

test('promotion authorization commits exact target intent; replay/reopen never writes it twice', async (t) => {
  const f = await setup(t);
  const r = request();
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(r)).outcome, 'recorded');
  assert.equal(f.row().message_group_membership_phase, 'promotion_proposal_in_flight');
  assert.equal(f.row().message_group_membership_permit, r.nextPermit);
  assert.equal(f.writes, 1);
  f.reopen();
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(r)).outcome, 'recorded');
  assert.equal(f.writes, 1);
});
test('promotion and learner-abandonment race on one old row: exactly one branch is recorded', async (t) => {
  const f = await setup(t);
  const results = await Promise.all([f.repository.selectMessageGroupMembershipBranch(request()),
    f.repo().selectMessageGroupMembershipBranch(request('abort_learner'))]);
  assert.equal(results.filter((r) => r.outcome === 'recorded').length, 1);
  assert.equal(f.row().message_group_membership_lane_key, `message-group:${GROUP}`);
});
test('pre-promotion abandonment wins first and permanently excludes promotion under that basis', async (t) => {
  const f = await setup(t);
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner'))).outcome, 'recorded');
  f.reopen();
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request())).outcome, 'conflict');
  assert.equal(f.row().message_group_membership_phase, 'target_removal_proposal_in_flight');
});
test('terminal settlement first refuses promotion without altering exact debt', async (t) => {
  const f = await setup(t);
  await terminal(f);
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request())).outcome, 'conflict');
  assert.equal(f.row().message_group_membership_permit, JSON.stringify(prior));
  assert.equal(f.writes, 0);
});
test('terminal settlement between owner read and CAS cannot be overwritten by authorization', async (t) => {
  const f = await setup(t);
  f.fault(() => terminal(f));
  assert.notEqual((await f.repository.selectMessageGroupMembershipBranch(request())).outcome, 'recorded');
  assert.equal(f.row().workflow_step, WORKFLOW_STEP.FAILED);
  assert.equal(f.row().message_group_membership_permit, JSON.stringify(prior));
});
test('terminal settlement after promotion retains direction and ordinary fields never rewrite the permit', async (t) => {
  const f = await setup(t);
  await f.repository.selectMessageGroupMembershipBranch(request());
  await terminal(f); f.reopen();
  assert.equal(f.row().workflow_step, WORKFLOW_STEP.FAILED);
  assert.equal(f.row().message_group_membership_permit, request().nextPermit);
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner'))).outcome, 'conflict');
});
test('lost write answer recovers only the exact committed row; unreadable answer never grants', async (t) => {
  const f = await setup(t);
  f.fault('lost-and-unreadable');
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request())).outcome, 'unknown');
  f.reads(true); f.reopen();
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request())).outcome, 'recorded');
  assert.equal(f.writes, 1);
});
test('an old-state read does not cancel delayed authorization: only the competing CAS excludes it', async (t) => {
  const f = await setup(t);
  f.fault('delayed');
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request())).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_phase, 'learner_committed');
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner'))).outcome, 'recorded');
  assert.deepEqual(f.flush().map((r) => r.changes), [0]);
  assert.equal(f.row().message_group_membership_phase, 'target_removal_proposal_in_flight');
});
test('refused SQL preserves old basis and authorizes neither branch', async (t) => {
  const f = await setup(t); f.fault('refused');
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request())).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_phase, 'learner_committed');
});
test('expired or remote owner cannot select a branch', async (t) => {
  const f = await setup(t);
  assert.equal((await f.repo(TARGET_NODE).selectMessageGroupMembershipBranch(request())).outcome, 'stale_owner');
  f.clock.advance(30000);
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request())).outcome, 'stale_owner');
  assert.equal(f.writes, 0);
});
test('source substitution, altered lease fence, unknown branch, stale config and malformed permit refuse', async (t) => {
  const f = await setup(t);
  for (const r of [request('promote', {replicaIdentity: S, peerId: peerOf(S)}),
    request('promote', {membershipLeaseExpiresAt: LEASE + 1}), request('__proto__'),
    request('promote', {leaderConfigurationStamp: prior.leaderConfigurationStamp}),
    {...request(), nextPermit: '{'}, {...request(), identity: '{}'}]) {
    assert.notEqual((await f.repository.selectMessageGroupMembershipBranch(r)).outcome, 'recorded');
  }
  assert.equal(f.writes, 0);
});
test('changed owner claim at the actual UPDATE defeats stale branch selection', async (t) => {
  const f = await setup(t);
  f.fault(() => f.run('UPDATE replica_operations SET message_group_membership_owner_claim = ? WHERE operation_id = ?',
    [JSON.stringify({...JSON.parse(OWNER_CLAIM), generation: 2}), O]));
  assert.notEqual((await f.repository.selectMessageGroupMembershipBranch(request())).outcome, 'recorded');
  assert.equal(f.row().message_group_membership_permit, JSON.stringify(prior));
});

test('initial claimant is the live structural owner; no caller-selected node or clock', async (t) => {
  const f = await setup(t, {initial: true});
  const input = f.claimRequest();
  assert.equal((await f.repo(TARGET_NODE).claimMessageGroupMembershipOwner(input)).outcome, 'conflict');
  const result = await f.repository.claimMessageGroupMembershipOwner(input);
  assert.equal(result.outcome, 'recorded');
  assert.equal(result.claim, OWNER_CLAIM);
  assert.equal(f.row().message_group_membership_permit, null);
});
test('two successor nodes with equal expiry compete on one exact expired claim', async (t) => {
  const f = await setup(t); f.clock.advance(30000);
  const input = f.claimRequest();
  const results = await Promise.all([
    f.repo(TARGET_NODE).claimMessageGroupMembershipOwner(input),
    f.repo('third-node').claimMessageGroupMembershipOwner(input)]);
  assert.equal(results.filter((r) => r.outcome === 'recorded').length, 1);
  const winner = JSON.parse(f.row().message_group_membership_owner_claim);
  assert.equal(winner.generation, 2);
  assert.equal(winner.expiresAt, LEASE + 30000);
  assert.equal(f.row().message_group_membership_permit, JSON.stringify(prior));
});
test('same-node new boot cannot reuse a live old claim; expired claim can be fenced and adopted', async (t) => {
  const f = await setup(t);
  f.run('UPDATE nodes SET boot_incarnation = 2 WHERE node_id = ?', [OWNER]);
  assert.equal((await f.repo(OWNER, 2).claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'conflict');
  f.clock.advance(30000);
  assert.equal((await f.repo(OWNER, 2).claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'recorded');
  assert.equal(JSON.parse(f.row().message_group_membership_owner_claim).ownerBootIncarnation, 2);
});
test('expired claimed successor can authorize promotion; stale structural owner cannot', async (t) => {
  const f = await setup(t); f.clock.advance(30000);
  const successor = f.repo(TARGET_NODE);
  const claimed = await successor.claimMessageGroupMembershipOwner(f.claimRequest());
  assert.equal(claimed.outcome, 'recorded');
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request())).outcome, 'stale_owner');
  const holder = JSON.parse(claimed.claim);
  const promoted = request('promote', {workflowOwnerNodeId: TARGET_NODE,
    workflowOwnerFence: `${TARGET_NODE}:1:${holder.generation}`,
    membershipLeaseExpiresAt: holder.expiresAt, proposerNodeId: TARGET_NODE});
  assert.equal((await successor.selectMessageGroupMembershipBranch(promoted)).outcome, 'recorded');
});
test('takeover after terminal promotion keeps both action permit and forward direction', async (t) => {
  const f = await setup(t);
  const selected = request();
  await f.repository.selectMessageGroupMembershipBranch(selected);
  await terminal(f); f.clock.advance(30000);
  assert.equal((await f.repo(TARGET_NODE).claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'recorded');
  f.reopen();
  assert.equal(f.row().message_group_membership_permit, selected.nextPermit);
  assert.equal(f.row().workflow_step, WORKFLOW_STEP.FAILED);
  assert.equal(f.row().message_group_membership_lane_key, `message-group:${GROUP}`);
  assert.equal((await f.repo(TARGET_NODE).selectMessageGroupMembershipBranch(request('abort_learner'))).outcome, 'conflict');
});
test('uncertain claimant write is not a grant; reread preserves the exact committed successor', async (t) => {
  const f = await setup(t); f.clock.advance(30000);
  f.fault('lost-and-unreadable');
  assert.equal((await f.repo(TARGET_NODE).claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'unknown');
  f.reads(true); f.reopen();
  const holder = JSON.parse(f.row().message_group_membership_owner_claim);
  assert.equal(holder.ownerNodeId, TARGET_NODE);
  assert.equal(holder.generation, 2);
  assert.equal(f.claimWrites, 1);
  assert.equal((await f.repository.claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'conflict');
});
test('delayed losing takeover cannot overwrite the exact winner', async (t) => {
  const f = await setup(t); f.clock.advance(30000);
  const input = f.claimRequest(); f.fault('delayed');
  assert.equal((await f.repo(TARGET_NODE).claimMessageGroupMembershipOwner(input)).outcome, 'unknown');
  assert.equal((await f.repo('third-node').claimMessageGroupMembershipOwner(input)).outcome, 'recorded');
  assert.deepEqual(f.flush().map((r) => r.changes), [0]);
  assert.equal(JSON.parse(f.row().message_group_membership_owner_claim).ownerNodeId, 'third-node');
});
test('unavailable boot, changed boot after commit, overflow and released lane never grant', async (t) => {
  const f = await setup(t); f.clock.advance(30000);
  assert.equal((await f.repo('missing-node').claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'unavailable');
  f.fault(() => f.run('UPDATE nodes SET boot_incarnation = 2 WHERE node_id = ?', [TARGET_NODE]));
  assert.equal((await f.repo(TARGET_NODE).claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'unknown');
  const current = JSON.parse(f.row().message_group_membership_owner_claim);
  f.run('UPDATE replica_operations SET message_group_membership_owner_claim = ? WHERE operation_id = ?',
    [JSON.stringify({...current, generation: Number.MAX_SAFE_INTEGER, expiresAt: 1}), O]);
  assert.equal((await f.repo('third-node').claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'conflict');
  f.run('UPDATE replica_operations SET message_group_membership_lane_key = NULL WHERE operation_id = ?', [O]);
  assert.equal((await f.repo('third-node').claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'conflict');
});
test('membership renewal ignores ordinary lease touches but cannot revive an older holder', async (t) => {
  const f = await setup(t); f.clock.advance(1);
  f.run('UPDATE replica_operations SET lease_expires_at = ? WHERE operation_id = ?', [LEASE + 200000, O]);
  const initial = f.claimRequest();
  assert.equal((await f.repository.claimMessageGroupMembershipOwner(initial)).outcome, 'recorded');
  assert.equal((await f.repository.claimMessageGroupMembershipOwner(initial)).outcome, 'conflict');
  assert.equal(JSON.parse(f.row().message_group_membership_owner_claim).generation, 2);
});
test('phase changes defeat claimant CAS without erasing the action that won', async (t) => {
  const f = await setup(t); f.clock.advance(30000);
  f.fault(() => f.run('UPDATE replica_operations SET message_group_membership_phase = ? WHERE operation_id = ?',
    ['promotion_proposal_in_flight', O]));
  assert.equal((await f.repo(TARGET_NODE).claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_owner_claim, OWNER_CLAIM);
});

test('owner loss before initial claim allows one expired-lease successor, not an unfenced late owner', async (t) => {
  const f = await setup(t, {initial: true}); f.clock.advance(30000);
  const input = f.claimRequest();
  const result = await f.repo(TARGET_NODE).claimMessageGroupMembershipOwner(input);
  assert.equal(result.outcome, 'recorded');
  assert.equal(JSON.parse(result.claim).ownerNodeId, TARGET_NODE);
  assert.equal((await f.repository.claimMessageGroupMembershipOwner(input)).outcome, 'conflict');
  assert.equal(f.row().message_group_membership_permit, null);
});
test('renewed ordinary lease defeats an orphan initial-claim read before it can win', async (t) => {
  const f = await setup(t, {initial: true}); f.clock.advance(30000);
  f.fault(() => f.run('UPDATE replica_operations SET lease_expires_at = ? WHERE operation_id = ?',
    [LEASE + 30000, O]));
  assert.equal((await f.repo(TARGET_NODE).claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_owner_claim, null);
});


test('NULL ordinary lease permits an exact initial successor claim', async (t) => {
  const f = await setup(t, {initial: true});
  assert.equal(f.run('UPDATE replica_operations SET lease_expires_at = NULL ' +
    'WHERE operation_id = ?', [O]).changes, 1);
  const before = f.row();
  assert.equal(before.lease_expires_at, null);
  const observed = await f.repository.queryAuthoritativeOperationById(O);
  assert.equal(observed.ownerLeaseExpiresAt, undefined,
    'the canonical row decoder omits a NULL ordinary lease');
  const acquired = await f.repo(TARGET_NODE)
    .claimMessageGroupMembershipOwner(f.claimRequest());
  assert.equal(acquired.outcome, 'recorded');
  const claim = JSON.parse(f.row().message_group_membership_owner_claim);
  assert.equal(claim.ownerNodeId, TARGET_NODE);
  assert.equal(claim.generation, 1);
  const after = {...f.row()};
  delete before.message_group_membership_owner_claim;
  delete after.message_group_membership_owner_claim;
  assert.deepEqual(after, before, 'claim does not change the operation or action');
});

test('NULL ordinary lease initial competition records exactly one successor', async (t) => {
  const f = await setup(t, {initial: true});
  assert.equal(f.run('UPDATE replica_operations SET lease_expires_at = NULL ' +
    'WHERE operation_id = ?', [O]).changes, 1);
  const input = f.claimRequest();
  const answers = await Promise.all([
    f.repo(TARGET_NODE).claimMessageGroupMembershipOwner(input),
    f.repo('third-node').claimMessageGroupMembershipOwner(input),
  ]);
  assert.equal(answers.filter((r) => r.outcome === 'recorded').length, 1);
  assert.equal(JSON.parse(f.row().message_group_membership_owner_claim).generation, 1);
});

test('NULL ordinary lease read cannot overwrite a concurrent lease renewal', async (t) => {
  const f = await setup(t, {initial: true});
  assert.equal(f.run('UPDATE replica_operations SET lease_expires_at = NULL ' +
    'WHERE operation_id = ?', [O]).changes, 1);
  f.fault(() => {
    assert.equal(f.run('UPDATE replica_operations SET lease_expires_at = ? ' +
      'WHERE operation_id = ?', [LEASE, O]).changes, 1);
  });
  const answer = await f.repo(TARGET_NODE)
    .claimMessageGroupMembershipOwner(f.claimRequest());
  assert.notEqual(answer.outcome, 'recorded');
  assert.equal(f.row().message_group_membership_owner_claim, null);
  assert.equal(f.row().lease_expires_at, LEASE);
});

test('a non-NULL invalid lease must not match the NULL-lease CAS', async (t) => {
  for (const lease of [0, -1]) {
    await t.test(String(lease), async (t) => {
      const f = await setup(t, {initial: true});
      assert.equal(f.run('UPDATE replica_operations SET lease_expires_at = ? ' +
        'WHERE operation_id = ?', [lease, O]).changes, 1);
      const answer = await f.repo(TARGET_NODE)
        .claimMessageGroupMembershipOwner(f.claimRequest());
      assert.notEqual(answer.outcome, 'recorded');
      assert.equal(f.row().message_group_membership_owner_claim, null);
    });
  }
});


async function settleInitial(f, repository = f.repository, identity = ENCODED_IDENTITY) {
  assert.equal(typeof repository.settleMessageGroupMembershipNonAdmission, 'function',
    'the existing repository must own terminal-first membership resolution');
  return repository.settleMessageGroupMembershipNonAdmission({operationId: O, identity});
}
function withoutResolution(row) {
  const copy = {...row};
  delete copy.message_group_membership_lane_key;
  delete copy.message_group_membership_obligation_state;
  return copy;
}

test('terminal-first NULL holder settles non-admission without creating an execution claim', async (t) => {
  const f = await setup(t, {initial: true});
  await terminal(f);
  const before = f.row();
  assert.equal((await settleInitial(f, f.repo(TARGET_NODE))).outcome, 'recorded');
  assert.equal(f.row().message_group_membership_lane_key, null);
  assert.equal(f.row().message_group_membership_obligation_state, 'definitive_non_admission');
  assert.deepEqual(withoutResolution(f.row()), withoutResolution(before));
  assert.equal(f.row().message_group_membership_owner_claim, null);
  assert.equal(f.resolutionChanges, 1);
  f.reopen();
  assert.equal((await settleInitial(f, f.repo('third-node'))).outcome, 'recorded');
  assert.equal(f.resolutionWrites, 1, 'exact replay recognizes the settled row');
  assert.equal((await f.repository.claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'conflict');
});

test('terminal-first concurrent settlers may observe one resolution but mutate once', async (t) => {
  const f = await setup(t, {initial: true}); await terminal(f);
  const results = await Promise.all([settleInitial(f), settleInitial(f, f.repo(TARGET_NODE))]);
  assert.ok(results.every((r) => r.outcome === 'recorded'));
  assert.equal(f.resolutionChanges, 1);
  assert.equal(f.row().message_group_membership_owner_claim, null);
});

test('terminal-first resolver cannot settle a live operation or authorize a learner', async (t) => {
  const f = await setup(t, {initial: true}); const before = f.row();
  assert.equal((await settleInitial(f)).outcome, 'conflict');
  assert.deepEqual(f.row(), before); assert.equal(f.resolutionWrites, 0);
});

test('terminal-first existing holder must be current; expiry permits exact takeover then resolution', async (t) => {
  const f = await setup(t, {initial: true});
  assert.equal((await f.repository.claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'recorded');
  await terminal(f);
  assert.equal((await settleInitial(f, f.repo(TARGET_NODE))).outcome, 'stale_owner');
  f.clock.advance(30000);
  const next = f.repo(TARGET_NODE);
  assert.equal((await next.claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'recorded');
  assert.equal((await settleInitial(f, next)).outcome, 'recorded');
  assert.equal(f.row().workflow_step, WORKFLOW_STEP.FAILED);
});

test('terminal-first held-claim renewal defeats stale resolution without erasing the winner', async (t) => {
  const f = await setup(t, {initial: true});
  await f.repository.claimMessageGroupMembershipOwner(f.claimRequest()); await terminal(f);
  const before = f.row().message_group_membership_owner_claim;
  f.fault(async () => {
    f.clock.advance(1);
    assert.equal((await f.repository.claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'recorded');
  });
  assert.equal((await settleInitial(f)).outcome, 'unknown');
  assert.notEqual(f.row().message_group_membership_owner_claim, before);
  assert.equal(f.row().message_group_membership_lane_key, `message-group:${GROUP}`);
  assert.equal((await settleInitial(f)).outcome, 'recorded');
});

test('terminal-first cannot erase an issued permit, a stamp, or a changed source', async (t) => {
  for (const [column, value] of [
    ['message_group_membership_permit', JSON.stringify(prior)],
    ['message_group_learner_stamp', JSON.stringify(learnerStamp)],
    ['message_group_voter_stamp', '{}'],
    ['message_group_removal_stamp', '{}'],
    ['source_replica_id', 'wrong-source'],
  ]) {
    await t.test(column, async (t) => {
      const f = await setup(t, {initial: true}); await terminal(f);
      assert.equal(f.run(`UPDATE replica_operations SET ${column} = ? WHERE operation_id = ?`, [value, O]).changes, 1);
      const before = f.row();
      assert.equal((await settleInitial(f)).outcome, 'conflict');
      assert.deepEqual(f.row(), before); assert.equal(f.resolutionWrites, 0);
    });
  }
});

test('terminal-first requires exact positive terminal time rather than a terminal-looking status', async (t) => {
  for (const completion of [null, 0, -1]) {
    await t.test(String(completion), async (t) => {
      const f = await setup(t, {initial: true}); await terminal(f);
      f.run('UPDATE replica_operations SET completed_at = ? WHERE operation_id = ?', [completion, O]);
      assert.equal((await settleInitial(f)).outcome, 'conflict');
      assert.equal(f.row().message_group_membership_lane_key, `message-group:${GROUP}`);
    });
  }
});

test('terminal-first lost reply and unavailable read remain exact replay, not a new grant', async (t) => {
  const f = await setup(t, {initial: true}); await terminal(f);
  f.fault('lost-and-unreadable');
  assert.equal((await settleInitial(f)).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_lane_key, null);
  f.reads(true); f.reopen();
  assert.equal((await settleInitial(f)).outcome, 'recorded');
  assert.equal(f.resolutionChanges, 1); assert.equal(f.resolutionWrites, 1);
});

test('terminal-first delayed losing SQL cannot rewrite a resolved lane', async (t) => {
  const f = await setup(t, {initial: true}); await terminal(f);
  f.fault('delayed');
  assert.equal((await settleInitial(f)).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_lane_key, `message-group:${GROUP}`);
  assert.equal((await settleInitial(f, f.repo(TARGET_NODE))).outcome, 'recorded');
  assert.deepEqual(f.flush().map((r) => r.changes), [0]);
});

test('terminal-first cannot act on unavailable or changed current boot', async (t) => {
  const f = await setup(t, {initial: true}); await terminal(f);
  assert.equal((await settleInitial(f, f.repo('missing-node'))).outcome, 'unavailable');
  f.fault(() => f.run('UPDATE nodes SET boot_incarnation = 2 WHERE node_id = ?', [OWNER]));
  assert.equal((await settleInitial(f)).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_obligation_state, 'definitive_non_admission');
});

test('terminal-first resolution permits a distinct later operation through the existing lane index', async (t) => {
  const f = await setup(t, {initial: true}); await terminal(f);
  const old = await f.repository.queryAuthoritativeOperationById(O);
  const nextIdentity = {...JSON.parse(ENCODED_IDENTITY), operationId: 'next-operation',
    targetReplicaId: 'fresh-next-target', targetPeerId: peerOf('fresh-next-target'),
    transitionIdentity: 'next-transition'};
  const next = {...old, operationId: nextIdentity.operationId,
    replicaId: nextIdentity.targetReplicaId, createdAt: NOW + 1, updatedAt: NOW + 1,
    status: ReplicaStatus.PENDING, workflowStep: WORKFLOW_STEP.PENDING,
    completedAt: null, stepsHistory: [], messageGroupMembershipOwnerClaim: null,
    messageGroupMembershipIdentity: JSON.stringify(nextIdentity)};
  const conflict = await f.repository.persistNewOperation(next, {returnDisposition: true});
  assert.equal(conflict.disposition, 'membership_lane_conflict');
  assert.equal((await settleInitial(f)).outcome, 'recorded');
  await f.repository.persistNewOperation(next, {returnDisposition: true});
  const admitted = await f.repository.queryAuthoritativeOperationById(next.operationId);
  assert.equal(admitted?.replicaId, next.replicaId);
  assert.equal(f.row().workflow_step, WORKFLOW_STEP.FAILED);
});
