/** Contract oracle for the operation-row branch boundary only.
 * Real repository, canonical schema and file-backed SQLite. Prior committed
 * learner state is a supplied durable fixture, NOT proof of runtime admission.
 * No test here claims a physical CREATE or distributed SQL/Raft execution.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {after, before, test} from 'node:test';
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
// Schema/index/node creation is immutable setup, not the transaction under test.
// Build it once, close it completely, and clone its bytes for each case. Every
// owner mutation below still uses its own WAL/FULL database and reopen path.
let schemaFixtureDirectory = null;
let schemaFixtureFile = null;
const operationFixtureFiles = new Map();
before(() => {
  schemaFixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-schema-fixture-'));
  schemaFixtureFile = path.join(schemaFixtureDirectory, 'schema.sqlite');
  const template = new Database(schemaFixtureFile);
  try {
    template.pragma('synchronous = FULL');
    template.transaction(() => {
      template.exec(generateCreateTableSQL(REPLICA_OPERATIONS_SCHEMA));
      template.exec(generateCreateTableSQL(NODES_SCHEMA));
      for (const sql of generateCreateIndexSQL(REPLICA_OPERATIONS_SCHEMA)) template.exec(sql);
      const insert = template.prepare(`INSERT INTO nodes
        (node_id,node_address,cpu_cores,memory_mb,disk_gb,last_heartbeat,boot_incarnation,created_at)
        VALUES (?,?,?,?,?,?,?,?)`);
      for (const nodeId of [OWNER, TARGET_NODE, 'third-node']) {
        assert.equal(insert.run(nodeId, `${nodeId}:8000`, 2, 512, 10, NOW, 1, NOW).changes, 1);
      }
    })();
    assert.equal(template.inTransaction, false);
  } finally {
    template.close();
  }
});
after(() => {
  if (schemaFixtureDirectory) fs.rmSync(schemaFixtureDirectory, {recursive: true, force: true});
});

async function setup(t, {initial = false} = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-branch-proof-'));
  const file = path.join(directory, 'operations.sqlite');
  // Only a closed, never-exercised initial row is reusable. Each owner action
  // still receives a distinct WAL/FULL file and independent repository state.
  const cachedFixture = operationFixtureFiles.get(initial);
  fs.copyFileSync(cachedFixture ?? schemaFixtureFile, file);
  let db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
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
  let returnOperationReadFailure = false;
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
  function faultedMembershipWriteAnswer(action, answer) {
    if (action === 'lost-and-unreadable') failReads = true;
    if (action === 'lost' || action === 'lost-and-unreadable') {
      return {success: false, error: 'authorization result lost'};
    }
    return answer;
  }
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
        return faultedMembershipWriteAnswer(action, answer);
      }
      return run(sql, params);
    },
    async readAuthoritativeRows(_table, sql, params) {
      if (returnOperationReadFailure && _table === 'replica_operations') {
        return {success: false, error: 'injected returned operation-read failure'};
      }
      if (failReads) throw new Error('injected owner read unavailable');
      return run(sql, params);
    },
    async readRows(_table, sql, params) {
      if (returnOperationReadFailure && _table === 'replica_operations') {
        return {success: false, error: 'injected returned operation-read failure'};
      }
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
  let repository = repo();
  assert.equal(typeof repository.selectMessageGroupMembershipBranch, 'function',
    'existing repository must own the durable promotion/abort CAS');
  assert.ok(committedStampOfAnswer(learnerStamp), 'typed committed learner fixture validates');
  if (!cachedFixture) {
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
    // Last-connection close checkpoints committed setup before copying. No
    // tested transition or failed-write state is ever copied to another test.
    db.close();
    const fixture = path.join(schemaFixtureDirectory, initial ? 'initial.sqlite' : 'learner.sqlite');
    fs.copyFileSync(file, fixture);
    operationFixtureFiles.set(initial, fixture);
    db = new Database(file);
    db.pragma('synchronous = FULL');
  }
  assert.equal(db.pragma('journal_mode', {simple: true}), 'wal');
  assert.equal(db.pragma('synchronous', {simple: true}), 2);
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
  operationReads: (available) => {
    returnOperationReadFailure = !available;
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


test('returned operation-read failure is unavailable for claim, selection and settlement', async (t) => {
  for (const mode of ['claim', 'select', 'settle']) {
    await t.test(mode, async (t) => {
      const f = await setup(t, {initial: mode !== 'select'});
      if (mode === 'settle') await terminal(f);
      const before = f.row();
      f.operationReads(false); // nodes/boot still read from actual fixture SQL
      let answer;
      if (mode === 'claim') answer = await f.repository.claimMessageGroupMembershipOwner(f.claimRequest());
      else if (mode === 'select') answer = await f.repository.selectMessageGroupMembershipBranch(request());
      else answer = await settleInitial(f);
      assert.equal(answer.outcome, 'unavailable', 'no row observed is not a row conflict');
      assert.deepEqual(f.row(), before);
      assert.equal(f.claimWrites + f.writes + f.resolutionWrites, 0);
    });
  }
});

test('confirmed empty operation remains a conflict rather than unavailable', async (t) => {
  const f = await setup(t, {initial: true});
  const input = f.claimRequest();
  assert.equal(f.run('DELETE FROM replica_operations WHERE operation_id = ?', [O]).changes, 1);
  assert.equal((await f.repository.claimMessageGroupMembershipOwner(input)).outcome, 'conflict');
  assert.equal((await settleInitial(f)).outcome, 'conflict');
  assert.equal(f.claimWrites + f.resolutionWrites, 0);
});

test('returned read failure after terminal resolution stays unknown until exact replay', async (t) => {
  const f = await setup(t, {initial: true}); await terminal(f);
  f.fault(() => f.operationReads(false));
  assert.equal((await settleInitial(f)).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_obligation_state, 'definitive_non_admission');
  assert.equal(f.row().message_group_membership_lane_key, null);
  f.operationReads(true); f.reopen();
  assert.equal((await settleInitial(f)).outcome, 'recorded');
  assert.equal(f.resolutionChanges, 1);
});

// T1: an ordinary terminal result does not erase its admitted learner debt.
// These are repository-row tests, not runtime REMOVE or physical cleanup proof.
function withoutBranchIntent(row) {
  const copy = {...row};
  delete copy.message_group_membership_phase;
  delete copy.message_group_membership_permit;
  return copy;
}

test('T1 terminal learner selects exact target abandonment without reviving ordinary state', async (t) => {
  const f = await setup(t);
  await terminal(f);
  const before = f.row();
  const input = request('abort_learner');
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(input)).outcome, 'recorded');
  assert.equal(f.row().message_group_membership_phase, 'target_removal_proposal_in_flight');
  assert.equal(f.row().message_group_membership_permit, input.nextPermit);
  assert.equal(JSON.parse(input.nextPermit).replicaIdentity, T);
  assert.deepEqual(withoutBranchIntent(f.row()), withoutBranchIntent(before));
  assert.equal(f.writes, 1);
  f.reopen();
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(input)).outcome, 'recorded');
  assert.equal(f.writes, 1, 'exact replay only observes already selected intent');
  assert.equal((await settleInitial(f)).outcome, 'conflict', 'admitted debt is not non-admission');
  assert.equal(f.row().message_group_membership_lane_key, `message-group:${GROUP}`);
});

test('T1 terminal state rejects promotion and malformed completion timestamps', async (t) => {
  for (const completedAt of [NOW + 1, null, 0, -1, 0.5]) {
    await t.test(String(completedAt), async (t) => {
      const f = await setup(t);
      await terminal(f);
      assert.equal(f.run('UPDATE replica_operations SET completed_at = ? WHERE operation_id = ?',
        [completedAt, O]).changes, 1);
      const before = f.row();
      assert.equal((await f.repository.selectMessageGroupMembershipBranch(request())).outcome,
        'conflict', 'ordinary terminality never admits a new promotion');
      if (completedAt !== NOW + 1) {
        assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
          .outcome, 'conflict');
      }
      assert.deepEqual(f.row(), before);
      assert.equal(f.writes, 0);
    });
  }
});

test('T1 exact terminal timestamp defeats a stale abandonment CAS', async (t) => {
  const f = await setup(t);
  await terminal(f);
  f.fault(() => {
    assert.equal(f.run('UPDATE replica_operations SET completed_at = ? WHERE operation_id = ?',
      [NOW + 2, O]).changes, 1);
  });
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
    .outcome, 'unknown');
  assert.equal(f.row().completed_at, NOW + 2);
  assert.equal(f.row().message_group_membership_phase, 'learner_committed');
  assert.equal(f.row().message_group_membership_permit, JSON.stringify(prior));
});

test('T1 a terminal settlement crossing the nonterminal abort read requires a fresh basis', async (t) => {
  const f = await setup(t);
  f.fault(() => terminal(f));
  const input = request('abort_learner');
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(input)).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_phase, 'learner_committed');
  const settled = f.row();
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(input)).outcome, 'recorded');
  assert.deepEqual(withoutBranchIntent(f.row()), withoutBranchIntent(settled));
});

test('T1 delayed preterminal promotion loses to terminal abandonment and cannot revive', async (t) => {
  const f = await setup(t);
  f.fault('delayed');
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request())).outcome, 'unknown');
  await terminal(f);
  const input = request('abort_learner');
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(input)).outcome, 'recorded');
  assert.deepEqual(f.flush().map((r) => r.changes), [0]);
  f.reopen();
  assert.equal(f.row().message_group_membership_permit, input.nextPermit);
  assert.equal(f.row().workflow_step, WORKFLOW_STEP.FAILED);
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request())).outcome, 'conflict');
});

test('T1 promotion committed first stays forward-only after terminal settlement', async (t) => {
  const f = await setup(t);
  const input = request();
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(input)).outcome, 'recorded');
  await terminal(f);
  const before = f.row();
  f.reopen();
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
    .outcome, 'conflict');
  assert.deepEqual(f.row(), before, 'J1 cannot be switched by terminal reconciliation');
});

test('T1 expired holder takeover permits only the current exact terminal-abort owner', async (t) => {
  const f = await setup(t);
  await terminal(f);
  f.clock.advance(30000);
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
    .outcome, 'stale_owner');
  const successor = f.repo(TARGET_NODE);
  const claimed = await successor.claimMessageGroupMembershipOwner(f.claimRequest());
  assert.equal(claimed.outcome, 'recorded');
  const claim = JSON.parse(claimed.claim);
  const input = request('abort_learner', {workflowOwnerNodeId: TARGET_NODE,
    workflowOwnerFence: `${TARGET_NODE}:1:${claim.generation}`,
    membershipLeaseExpiresAt: claim.expiresAt, proposerNodeId: TARGET_NODE});
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(input)).outcome, 'stale_owner');
  const before = f.row();
  assert.equal((await successor.selectMessageGroupMembershipBranch(input)).outcome, 'recorded');
  assert.deepEqual(withoutBranchIntent(f.row()), withoutBranchIntent(before));
});

test('T1 holder renewal between terminal read and mutation preserves the old learner phase', async (t) => {
  const f = await setup(t);
  await terminal(f);
  f.fault(async () => {
    f.clock.advance(1);
    assert.equal((await f.repository.claimMessageGroupMembershipOwner(f.claimRequest())).outcome,
      'recorded');
  });
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
    .outcome, 'unknown');
  assert.equal(JSON.parse(f.row().message_group_membership_owner_claim).generation, 2);
  assert.equal(f.row().message_group_membership_phase, 'learner_committed');
  assert.equal(f.row().message_group_membership_permit, JSON.stringify(prior));
});

test('T1 lost abandonment answer retains debt and exact replay survives reopen', async (t) => {
  const f = await setup(t);
  await terminal(f);
  const before = f.row();
  const input = request('abort_learner');
  f.fault('lost-and-unreadable');
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(input)).outcome, 'unknown');
  f.reads(true); f.reopen();
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(input)).outcome, 'recorded');
  assert.equal(f.writes, 1);
  assert.deepEqual(withoutBranchIntent(f.row()), withoutBranchIntent(before));
});

test('T1 source substitution and unavailable operation authority cannot issue removal intent', async (t) => {
  const f = await setup(t);
  await terminal(f);
  const before = f.row();
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(
    request('abort_learner', {replicaIdentity: S, peerId: peerOf(S)}))).outcome, 'invalid');
  f.operationReads(false);
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
    .outcome, 'unavailable');
  assert.deepEqual(f.row(), before);
  assert.equal(f.writes, 0);
});


// Review 4219025228: successful source retirement is not failed learner debt.
// Supply a contradictory retained learner hint deliberately. Never authorize
// another target REMOVE from successful or mixed ordinary terminal facts.
async function writeSettlementFixture(f, status, workflowStep) {
  assert.equal(f.run('UPDATE replica_operations SET status = ?, workflow_step = ?, ' +
    'completed_at = ? WHERE operation_id = ?', [status, workflowStep, NOW + 1, O]).changes, 1);
}

test('T1 successful REMOVED replacement refuses target abandonment across reopen', async (t) => {
  const f = await setup(t);
  await writeSettlementFixture(f, ReplicaStatus.REMOVED, WORKFLOW_STEP.REMOVED);
  const before = f.row();
  for (const reopen of [false, true]) {
    if (reopen) f.reopen();
    assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
      .outcome, 'conflict', 'successful replacement must never authorize target abandonment');
    assert.equal((await f.repository.selectMessageGroupMembershipBranch(request()))
      .outcome, 'conflict');
    assert.deepEqual(f.row(), before, 'successful row and retained debt stay unchanged');
    assert.equal(f.writes, 0, 'refusal precedes every membership mutation');
  }
});

test('T1 only exact FAILED status and step may select terminal abandonment', async (t) => {
  for (const [status, step] of [
    [ReplicaStatus.REMOVED, WORKFLOW_STEP.FAILED],
    [ReplicaStatus.FAILED, WORKFLOW_STEP.REMOVED],
    [ReplicaStatus.PENDING, WORKFLOW_STEP.FAILED],
    [ReplicaStatus.FAILED, WORKFLOW_STEP.PENDING],
  ]) {
    await t.test(`${status}/${step}`, async (t) => {
      const f = await setup(t);
      await writeSettlementFixture(f, status, step);
      const before = f.row();
      assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
        .outcome, 'conflict', 'inconsistent terminal facts are not failed-learner authority');
      assert.deepEqual(f.row(), before);
      assert.equal(f.writes, 0);
    });
  }
});

test('T1 success racing the failed-row CAS cannot receive target removal intent', async (t) => {
  const f = await setup(t);
  await terminal(f);
  f.fault(() => writeSettlementFixture(f, ReplicaStatus.REMOVED, WORKFLOW_STEP.REMOVED));
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
    .outcome, 'unknown', 'changed ordinary state defeats the stale abandonment CAS');
  assert.equal(f.row().status, ReplicaStatus.REMOVED);
  assert.equal(f.row().workflow_step, WORKFLOW_STEP.REMOVED);
  assert.equal(f.row().message_group_membership_phase, 'learner_committed');
  assert.equal(f.row().message_group_membership_permit, JSON.stringify(prior));
});

test('T1 a delayed failed-row abandonment cannot apply after success is observed', async (t) => {
  const f = await setup(t);
  await terminal(f);
  f.fault('delayed');
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
    .outcome, 'unknown');
  await writeSettlementFixture(f, ReplicaStatus.REMOVED, WORKFLOW_STEP.REMOVED);
  const successful = f.row();
  assert.deepEqual(f.flush().map((answer) => answer.changes), [0]);
  f.reopen();
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
    .outcome, 'conflict');
  assert.deepEqual(f.row(), successful);
});

// Initial operation-row authorization: actual claim, action and T0 CAS share
// one canonical SQLite row. Runtime dispatch/physical CREATE remain absent.
async function ownedInitial(t) {
  const f = await setup(t, {initial: true});
  assert.equal((await f.repository.claimMessageGroupMembershipOwner(f.claimRequest())).outcome,
    'recorded', 'initial holder must actually be acquired');
  return f;
}
function learnerRequest(changes = {}) {
  return {operationId: O, identity: ENCODED_IDENTITY,
    permit: JSON.stringify({...prior, permitState: 'in_flight', proposalIndex: null, ...changes})};
}
async function authorizeInitial(f, input = learnerRequest(), repository = f.repository) {
  assert.equal(typeof repository.authorizeMessageGroupLearner, 'function',
    'existing repository must record the initial exact learner intent');
  return repository.authorizeMessageGroupLearner(input);
}
function withoutLearnerIntent(row) {
  const copy = {...row};
  delete copy.message_group_membership_phase;
  delete copy.message_group_membership_permit;
  delete copy.message_group_membership_obligation_state;
  return copy;
}

test('initial learner intent commits once and exact replay survives reopen', async (t) => {
  const f = await ownedInitial(t);
  const before = f.row();
  const input = learnerRequest();
  assert.equal((await authorizeInitial(f, input)).outcome, 'recorded');
  assert.equal(f.row().message_group_membership_phase, 'learner_proposal_in_flight');
  assert.equal(f.row().message_group_membership_permit, input.permit);
  assert.equal(f.row().message_group_membership_obligation_state, 'unknown');
  assert.deepEqual(withoutLearnerIntent(f.row()), withoutLearnerIntent(before));
  f.reopen();
  assert.equal((await authorizeInitial(f, input)).outcome, 'recorded');
  assert.equal(f.writes, 1);
});

test('initial learner authorization requires the actual live holder, not a copied payload', async (t) => {
  const f = await setup(t, {initial: true});
  assert.equal((await authorizeInitial(f)).outcome, 'stale_owner');
  await f.repository.claimMessageGroupMembershipOwner(f.claimRequest());
  assert.equal((await authorizeInitial(f, learnerRequest(), f.repo(TARGET_NODE))).outcome, 'stale_owner');
  for (const override of [{workflowOwnerFence: 'copied-fence'},
    {membershipLeaseExpiresAt: LEASE + 1}, {proposerBootIncarnation: 2}]) {
    assert.equal((await authorizeInitial(f, learnerRequest(override))).outcome, 'stale_owner');
  }
  assert.equal(f.writes, 0);
});

test('initial learner permit cannot substitute the source or select a later stage', async (t) => {
  const f = await ownedInitial(t);
  assert.equal((await authorizeInitial(f, learnerRequest({replicaIdentity: S, peerId: peerOf(S)})))
    .outcome, 'invalid', 'the source is not the initial learner target');
  for (const override of [{permitStage: 'promote'}, {permitSequence: 2},
    {permitState: 'committed', proposalIndex: 5}, {transitionIdentity: 'other-operation'}]) {
    assert.equal((await authorizeInitial(f, learnerRequest(override))).outcome, 'invalid');
  }
  assert.equal((await authorizeInitial(f, {...learnerRequest(), identity: '{}'})).outcome, 'invalid');
  assert.equal(f.writes, 0);
});

test('terminal non-admission first permanently defeats delayed learner authorization', async (t) => {
  const f = await ownedInitial(t);
  f.fault('delayed');
  assert.equal((await authorizeInitial(f)).outcome, 'unknown');
  await terminal(f);
  assert.equal((await settleInitial(f)).outcome, 'recorded');
  assert.deepEqual(f.flush().map((r) => r.changes), [0]);
  assert.equal((await authorizeInitial(f)).outcome, 'conflict');
  assert.equal(f.row().message_group_membership_lane_key, null);
  assert.equal(f.row().message_group_membership_permit, null);
  assert.equal(f.row().message_group_membership_obligation_state, 'definitive_non_admission');
});

test('ordinary terminal settlement racing initial authorization defeats its exact CAS', async (t) => {
  const f = await ownedInitial(t);
  f.fault(() => terminal(f));
  assert.equal((await authorizeInitial(f)).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_permit, null,
    'terminal settlement defeats stale initial learner intent');
  assert.equal(f.row().workflow_step, WORKFLOW_STEP.FAILED);
  assert.equal((await settleInitial(f)).outcome, 'recorded');
});

test('issued learner intent outlives terminal settlement and cannot be erased by T0', async (t) => {
  const f = await ownedInitial(t);
  assert.equal((await authorizeInitial(f)).outcome, 'recorded');
  await terminal(f); f.reopen();
  assert.equal((await settleInitial(f)).outcome, 'conflict');
  assert.equal((await authorizeInitial(f)).outcome, 'recorded',
    'exact issued intent remains observable, never a new dispatch grant');
  assert.equal(f.row().message_group_membership_lane_key, `message-group:${GROUP}`);
  assert.equal(f.row().message_group_membership_obligation_state, 'unknown');
  assert.equal(f.row().status, ReplicaStatus.FAILED);
  assert.equal(f.writes, 1);
});

test('holder renewal during initial authorization defeats the old holder predicate', async (t) => {
  const f = await ownedInitial(t);
  f.fault(async () => {
    f.clock.advance(1);
    assert.equal((await f.repository.claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'recorded');
  });
  assert.equal((await authorizeInitial(f)).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_permit, null,
    'renewed holder defeats initial learner intent CAS');
  assert.equal(JSON.parse(f.row().message_group_membership_owner_claim).generation, 2);
});

test('lost learner write answer is resolved by exact durable readback after reopen', async (t) => {
  const f = await ownedInitial(t);
  f.fault('lost-and-unreadable');
  assert.equal((await authorizeInitial(f)).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_permit, learnerRequest().permit);
  f.reads(true); f.reopen();
  assert.equal((await authorizeInitial(f)).outcome, 'recorded');
  assert.equal(f.writes, 1);
});

test('refused learner mutation or unavailable read never becomes recorded permission', async (t) => {
  const f = await ownedInitial(t);
  f.operationReads(false);
  assert.equal((await authorizeInitial(f)).outcome, 'unavailable');
  assert.equal(f.writes, 0);
  f.operationReads(true); f.fault('refused');
  assert.equal((await authorizeInitial(f)).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_permit, null);
  assert.equal((await authorizeInitial(f)).outcome, 'recorded');
});

test('changed canonical boot after learner intent commit remains unknown to the stale owner', async (t) => {
  const f = await ownedInitial(t);
  f.fault(() => f.run('UPDATE nodes SET boot_incarnation = 2 WHERE node_id = ?', [OWNER]));
  assert.equal((await authorizeInitial(f)).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_permit, learnerRequest().permit);
  assert.equal((await authorizeInitial(f)).outcome, 'unavailable');
});

test('successor observes original issued learner intent without rewriting its context', async (t) => {
  const f = await ownedInitial(t);
  assert.equal((await authorizeInitial(f)).outcome, 'recorded');
  const originalPermit = f.row().message_group_membership_permit;
  f.clock.advance(30000);
  const successor = f.repo(TARGET_NODE);
  assert.equal((await successor.claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'recorded');
  assert.equal((await authorizeInitial(f, learnerRequest(), successor)).outcome, 'recorded');
  assert.equal(f.row().message_group_membership_permit, originalPermit);
  assert.equal((await authorizeInitial(f)).outcome, 'stale_owner');
  assert.equal(f.writes, 1);
});

test('initial intent competitors record only one exact permit; all other phases retain debt', async (t) => {
  const f = await ownedInitial(t);
  const first = learnerRequest();
  const other = learnerRequest({leaderTerm: prior.leaderTerm + 1});
  const attempts = await Promise.all([authorizeInitial(f, first),
    authorizeInitial(f, other, f.repo())]);
  assert.equal(attempts.filter((r) => r.outcome === 'recorded').length, 1);
  assert.ok([first.permit, other.permit].includes(f.row().message_group_membership_permit));
  assert.equal(f.row().message_group_membership_lane_key, `message-group:${GROUP}`);
});
