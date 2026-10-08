/** Real repository -> group-admission owner -> three real raft-rs operation ports.
 * Operation SQL uses a canonical file-backed fixture, NOT distributed SQL.
 * Runtime transports are the existing in-process inbox harness. Sender/recipient
 * bindings are host fixture inputs, NOT proof of MessageRouter authentication.
 * No target files, CREATE, transfer, promotion, cleanup or full driver is exercised.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import * as admission from '../../src/raft/raft-rs-group-membership-admission.js';
import * as portContract from '../../src/raft/raft-operation-port-constants.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
import {NODES_SCHEMA, REPLICA_OPERATIONS_SCHEMA} from '../../src/bootstrap/system-table-schemas-constants.js';
import {generateCreateTableSQL, generateCreateIndexSQL} from '../../src/bootstrap/system-table-schema-sql.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {ReplicaStatus, OperationType} from '../../src/rebalancer/replica-status.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {deriveRaftRsPeerId, RaftRsPeerIdentityRegistry} from '../../src/raft/raft-rs-peer-identity.js';
import {committedMembershipContext} from '../../src/raft/raft-rs-committed-membership-context.js';
import {PartitionNodeCluster} from '../raft/raft-rs-backend/partition-node-cluster.js';
import {durableLog} from '../raft/raft-rs-backend/committed-membership-oracles.js';
import {loadRaftRsCore} from '../raft/raft-rs-backend/raw-raft-rs-test-core.js';

const GROUP = 'learner-consumer';
const FOUNDERS = ['consumer-a', 'consumer-b', 'consumer-c'];
const TARGET = 'consumer-fresh';
const NODE = 'consumer-node';
const SUCCESSOR = 'consumer-successor';
const O = 'consumer-operation';
const NOW = 1000000;
const {RAFT_OPERATION_OUTCOME, RAFT_MEMBERSHIP_TRANSITION_REASON} = portContract;
const noLog = {debug() {}, info() {}, warn() {}, error() {}};

async function fixture(t, {issue = true, permitChanges = {}} = {}) {
  const cluster = new PartitionNodeCluster({partitionId: GROUP, replicaIds: FOUNDERS});
  t.after(() => cluster.dispose());
  cluster.tickers = [FOUNDERS[0]];
  assert.ok(cluster.settle(() => cluster.leaderReplicaId() !== null));
  const leader = cluster.leaderReplicaId();
  const port = cluster.node(leader);
  const status = port.readStatus();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'learner-authorization-'));
  const db = new Database(path.join(dir, 'operations.sqlite'));
  t.after(() => {
    db.close(); fs.rmSync(dir, {recursive: true, force: true});
  });
  db.pragma('journal_mode = WAL'); db.pragma('synchronous = FULL');
  db.exec(generateCreateTableSQL(REPLICA_OPERATIONS_SCHEMA));
  db.exec(generateCreateTableSQL(NODES_SCHEMA));
  for (const sql of generateCreateIndexSQL(REPLICA_OPERATIONS_SCHEMA)) db.exec(sql);
  const execute = (sql, params = []) => {
    const statement = db.prepare(sql);
    return statement.reader ? {success: true, rows: statement.all(...params)} :
      {success: true, affectedRows: statement.run(...params).changes};
  };
  for (const node of [NODE, SUCCESSOR]) {
    execute(`INSERT INTO nodes
      (node_id,node_address,cpu_cores,memory_mb,disk_gb,last_heartbeat,boot_incarnation,created_at)
      VALUES (?,?,?,?,?,?,?,?)`, [node, node, 2, 512, 10, NOW, 1, NOW]);
  }
  const reads = [];
  let failedTable = null;
  let beforeNodes = null;
  const gateway = {
    executeQuery: async (sql, params) => execute(sql, params),
    readAuthoritativeRows: async (table, sql, params, options) => {
      reads.push({table, sql, options});
      if (failedTable === table) return {success: false, error: 'fixture read unavailable'};
      if (table === 'nodes' && beforeNodes) await beforeNodes();
      return execute(sql, params);
    },
  };
  gateway.readRows = gateway.readAuthoritativeRows;
  const clock = new VirtualTimeSource({startMs: NOW});
  const repositoryFor = (nodeId) => new ReplicaOperationRepository({nodeId,
    membershipOwnerBootIncarnation: 1, timeSource: clock,
    controlPlaneSystemTableGateway: gateway, logger: noLog,
    systemTableCache: {get: () => null, getAll: () => [], filter: () => []},
    cdcIntegrationService: {waitForCacheUpdate: async () => {}},
    authoritativeVisibilityTimeoutMs: 0, authoritativeVisibilityRetryDelayMs: 0});
  const repository = repositoryFor(NODE);
  const identity = JSON.stringify({operationId: O, groupId: GROUP,
    sourceReplicaId: leader, sourceNodeId: NODE, sourceCreatedAt: 30,
    sourceCreateAttemptToken: 'supplied-source-generation', targetReplicaId: TARGET,
    targetPeerId: deriveRaftRsPeerId(TARGET), targetNodeId: SUCCESSOR,
    targetAddress: cluster.addressOf(TARGET), transitionIdentity: 'consumer-transition',
    membershipLaneKey: `message-group:${GROUP}`});
  await repository.persistNewOperation({operationId: O, type: OperationType.REPLACE,
    partitionId: GROUP, entityId: GROUP, entityType: SERVICE_TYPE.MESSAGE_GROUP,
    replicaId: TARGET, sourceReplicaId: leader, sourceNodeId: NODE, targetNodeId: SUCCESSOR,
    status: ReplicaStatus.PENDING, workflowStep: WORKFLOW_STEP.PENDING,
    createdAt: NOW, updatedAt: NOW, completedAt: null, stepsHistory: [],
    membershipPublicationEpoch: 1, messageGroupMembershipLaneKey: `message-group:${GROUP}`,
    messageGroupMembershipIdentity: identity, messageGroupMembershipPhase: 'learner_requested',
    messageGroupMembershipObligationState: 'intent_recorded',
    messageGroupMembershipOwnerClaim: null, messageGroupMembershipPermit: null,
    messageGroupLearnerStamp: null, messageGroupVoterStamp: null, messageGroupRemovalStamp: null,
    messageGroupSourceLifecycleClaim: JSON.stringify({replicaId: leader,
      createdAt: 30, stateEnteredAt: 40, createAttemptToken: 'supplied-source-generation'})});
  const claimed = await repository.claimMessageGroupMembershipOwner({
    operationId: O, identity, expectedClaim: null});
  assert.equal(claimed.outcome, 'recorded');
  const holder = JSON.parse(claimed.claim);
  const permit = JSON.stringify({version: 2, transitionIdentity: 'consumer-transition',
    permitSequence: 1, permitStage: 'add-learner', permitState: 'in_flight',
    workflowOwnerNodeId: NODE, workflowOwnerFence: `${NODE}:1:${holder.generation}`,
    membershipLeaseExpiresAt: holder.expiresAt, proposerNodeId: NODE, proposerBootIncarnation: 1,
    destinationNodeId: NODE, destinationBootIncarnation: 1,
    replicaLifecycleIncarnation: status.lifecycleIncarnation,
    runtimeGeneration: status.runtimeGeneration, leaderTerm: status.term,
    leaderConfigurationStamp: {configurationKey: status.configurationKey,
      membershipGenerationIndex: status.membershipGenerationIndex},
    proposalIndex: null, replicaIdentity: TARGET, peerId: deriveRaftRsPeerId(TARGET),
    ...permitChanges});
  if (issue) {
    assert.equal((await repository.authorizeMessageGroupLearner({operationId: O, identity, permit}))
      .outcome, 'recorded', 'fixture must use the real initial authorization CAS');
  }
  const request = {operationId: O, identity, permit, executionClaim: claimed.claim};
  const receiver = {groupId: GROUP, nodeId: NODE, bootIncarnation: 1,
    localReplicaIdentity: leader, senderNodeId: NODE, senderBootIncarnation: 1};
  const observe = repository.observeMessageGroupLearnerAuthorization.bind(repository);
  return {cluster, port, leader, repository, repositoryFor, clock, execute, reads,
    request, receiver, observe, db,
    row: () => db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?').get(O),
    failReads: (table) => {
      failedTable = table;
    },
    pauseNodes: (callback) => {
      beforeNodes = callback;
    },
    run: () => admission.proposeAuthorizedGroupLearner(port, receiver, request, observe),
    proposalCount: () => cluster.coreEntries.filter((entry) =>
      entry.operation === 'propose_conf_change_v2').length};
}
async function settleOperation(f, successful = false) {
  const row = await f.repository.queryAuthoritativeOperationById(O);
  await f.repository.persistOperationUpdate({...row,
    status: successful ? ReplicaStatus.REMOVED : ReplicaStatus.FAILED,
    workflowStep: successful ? WORKFLOW_STEP.REMOVED : WORKFLOW_STEP.FAILED,
    completedAt: NOW + 1, updatedAt: NOW + 1}, {confirmPersistence: false,
    disableSystemWriteSession: true, returnDisposition: true,
    expectedWorkflowStep: WORKFLOW_STEP.PENDING, terminalTransition: true});
}
function assertNoProposal(f, before) {
  assert.equal(f.proposalCount(), before, 'refused authorization must never call native proposal');
  assert.equal(f.cluster.replicas.has(TARGET), false, 'no target worker or files are opened');
}
function assertCommittedLearner(f, proposal) {
  assert.equal(proposal.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
  const peer = deriveRaftRsPeerId(TARGET);
  assert.ok(f.cluster.settle(() => FOUNDERS.every((id) =>
    f.cluster.node(id).readStatus().confState.learners.includes(peer))));
  for (const id of FOUNDERS) {
    const mapped = new RaftRsPeerIdentityRegistry(f.cluster.replica(id).db).raftPeerIdOf(TARGET);
    assert.equal(mapped, peer);
  }
  const entry = durableLog(f.cluster.replica(f.leader).dbFile, GROUP)
    .find(({index}) => index === proposal.proposalIndex);
  assert.ok(entry, 'real proposed entry must be durable');
  const decoded = loadRaftRsCore().decode_conf_change_entry(entry.entryType, entry.data);
  assert.deepEqual(committedMembershipContext(decoded), {operationId: O,
    transitionIdentity: 'consumer-transition', permitSequence: 1,
    stage: 'add-learner', replicaIdentity: TARGET, peerId: peer});
  assert.equal(f.cluster.replicas.has(TARGET), false);
  assert.equal(f.row().message_group_membership_phase, 'learner_proposal_in_flight',
    'proposal/ConfState alone does not settle the separate operation obligation');
}

test('durable learner intent is consumed only through the bound repository and real runtime',
  {timeout: 30000}, async (t) => {
    assert.equal(typeof admission.proposeAuthorizedGroupLearner, 'function',
      'existing group admission owner must consume authoritative learner intent');
    const method = ReplicaOperationRepository.prototype.observeMessageGroupLearnerAuthorization;
    assert.equal(typeof method,
      'function', 'existing repository must observe exact learner intent for its recipient');
    await t.test('valid recorded intent enters native Ready/apply on every surviving voter', async (t) => {
      const f = await fixture(t);
      const before = f.proposalCount();
      const result = await f.run();
      assert.equal(f.proposalCount(), before + 1);
      assertCommittedLearner(f, result);
      assert.ok(f.reads.some(({table}) => table === 'replica_operations'));
      assert.ok(f.reads.some(({table}) => table === 'nodes'));
    });
    await t.test('a copied request without its durable intent cannot propose', async (t) => {
      const f = await fixture(t, {issue: false});
      const count = f.proposalCount();
      assert.equal((await admission.proposeAuthorizedGroupLearner(f.port, f.receiver,
        f.request, {outcome: 'observed'})).reason,
      portContract.RAFT_MEMBERSHIP_AUTHORIZATION_REASON.REQUIRED);
      assertNoProposal(f, count);
      assert.equal((await admission.proposeAuthorizedGroupLearner(null, f.receiver,
        f.request, f.observe)).reason,
      portContract.RAFT_MEMBERSHIP_AUTHORIZATION_REASON.UNAVAILABLE);
      assertNoProposal(f, count);
      assert.equal((await f.run()).reason,
        portContract.RAFT_MEMBERSHIP_AUTHORIZATION_REASON.MISMATCH);
      assertNoProposal(f, count);
    });
    await t.test('terminal-first non-admission defeats a previously prepared payload', async (t) => {
      const f = await fixture(t, {issue: false});
      await settleOperation(f);
      assert.equal((await f.repository.settleMessageGroupMembershipNonAdmission({
        operationId: O, identity: f.request.identity})).outcome, 'recorded');
      const count = f.proposalCount();
      assert.equal((await f.run()).outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
      assertNoProposal(f, count);
    });
    await t.test('failure after issue retains the exact admitted action rather than cancelling it', async (t) => {
      const f = await fixture(t); await settleOperation(f);
      assertCommittedLearner(f, await f.run());
      assert.equal(f.row().status, ReplicaStatus.FAILED);
      assert.equal(f.row().message_group_membership_obligation_state, 'unknown');
    });
    await t.test('successful replacement and mixed terminal hints cannot add a target', async (t) => {
      const f = await fixture(t); await settleOperation(f, true);
      const count = f.proposalCount();
      assert.equal((await f.run()).outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
      assertNoProposal(f, count);
    });
    await t.test('unavailable operation and boot reads are not absence or permission', async (t) => {
      const f = await fixture(t); const count = f.proposalCount();
      for (const table of ['replica_operations', 'nodes']) {
        f.failReads(table);
        const answer = await f.run();
        assert.equal(answer.reason, portContract.RAFT_MEMBERSHIP_AUTHORIZATION_REASON.UNAVAILABLE);
        assert.equal(answer.retryable, true);
        assertNoProposal(f, count);
      }
    });
    await t.test('wrong group, recipient boot, sender and changed payload cannot confer authority', async (t) => {
      const f = await fixture(t); const count = f.proposalCount();
      for (const change of [{groupId: 'other-group'}, {bootIncarnation: 2},
        {senderNodeId: SUCCESSOR}, {senderBootIncarnation: 2}, {localReplicaIdentity: 'not-hosted'}]) {
        const answer = await admission.proposeAuthorizedGroupLearner(f.port,
          {...f.receiver, ...change}, f.request, f.observe);
        assert.equal(answer.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
        assertNoProposal(f, count);
      }
      const changed = {...f.request, permit: JSON.stringify({
        ...JSON.parse(f.request.permit), workflowOwnerFence: 'not-the-issued-fence'})};
      assert.equal((await admission.proposeAuthorizedGroupLearner(f.port, f.receiver,
        changed, f.observe)).outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
      assertNoProposal(f, count);
    });
    await t.test('current canonical boot and exact renewed holder defeat stale delivery', async (t) => {
      const f = await fixture(t); const count = f.proposalCount();
      f.clock.advance(1);
      const renewed = await f.repository.claimMessageGroupMembershipOwner({
        operationId: O, identity: f.request.identity, expectedClaim: f.request.executionClaim});
      assert.equal(renewed.outcome, 'recorded');
      assert.equal((await f.run()).outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
      assertNoProposal(f, count);
      f.request.executionClaim = renewed.claim;
      f.execute('UPDATE nodes SET boot_incarnation = 2 WHERE node_id = ?', [NODE]);
      assert.equal((await f.run()).reason,
        portContract.RAFT_MEMBERSHIP_AUTHORIZATION_REASON.STALE_OWNER);
      assertNoProposal(f, count);
    });
    await t.test('takeover preserves original permit but binds delivery to the actual new holder', async (t) => {
      const f = await fixture(t); f.clock.advance(30000);
      const successor = f.repositoryFor(SUCCESSOR);
      const adopted = await successor.claimMessageGroupMembershipOwner({
        operationId: O, identity: f.request.identity, expectedClaim: f.request.executionClaim});
      assert.equal(adopted.outcome, 'recorded');
      const count = f.proposalCount();
      assert.equal((await f.run()).outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
      assertNoProposal(f, count);
      f.request.executionClaim = adopted.claim;
      f.receiver.senderNodeId = SUCCESSOR;
      assertCommittedLearner(f, await f.run());
      assert.equal(f.row().message_group_membership_permit, f.request.permit);
    });
    await t.test('durable but stale native term, configuration, lifecycle and generation refuse', async (t) => {
      for (const field of ['leaderTerm', 'replicaLifecycleIncarnation', 'runtimeGeneration',
        'leaderConfigurationStamp']) {
        await t.test(field, async (t) => {
          const changes = field === 'leaderConfigurationStamp' ?
            {[field]: {configurationKey: 'stale', membershipGenerationIndex: 0}} :
            {[field]: field === 'replicaLifecycleIncarnation' ? 'stale' : 999999};
          const f = await fixture(t, {permitChanges: changes});
          const count = f.proposalCount();
          assert.equal((await f.run()).outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED,
            'native same-turn fencing must remain in force after durable authorization');
          assertNoProposal(f, count);
        });
      }
    });
    await t.test('request and host binding mutations during the read cannot retarget the proposal', async (t) => {
      const f = await fixture(t);
      let entered;
      const waiting = new Promise((resolve) => {
        entered = resolve;
      });
      let release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      f.pauseNodes(async () => {
        entered(); await held;
      });
      const promised = f.run(); await waiting;
      f.request.permit = '{}'; f.receiver.localReplicaIdentity = 'not-hosted';
      release();
      assertCommittedLearner(f, await promised);
    });
  });
