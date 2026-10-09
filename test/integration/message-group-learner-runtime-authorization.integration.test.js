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
import {createServiceDeliveryFixture} from '../test-helpers/service-delivery-fixture.js';
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
import * as membershipRead from '../../src/raft/raft-committed-membership-constants.js';
import {createSqliteStateMachineCheckpoint, readCheckpoint} from
  '../../src/raft/snapshot-checkpoint-store.js';
import {RAFT_CHECKPOINT_CREATION_OUTCOME, RAFT_CHECKPOINT_VALIDATION_OUTCOME,
  RAFT_CHECKPOINT_DESCRIPTOR_FILE, RAFT_CHECKPOINT_PAYLOAD_FILE} from
  '../../src/raft/snapshot-checkpoint-constants.js';
import {writeAtomicDurable, sha256Digest} from '../../src/runtime/oci-host-agent-durable-files.js';
import {trapSharedCore} from '../raft/raft-rs-backend/evidence-o1-model.js';


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
  let beforeOperation = null;
  const gateway = {
    executeQuery: async (sql, params) => execute(sql, params),
    readAuthoritativeRows: async (table, sql, params, options) => {
      reads.push({table, sql, options});
      if (failedTable === table) return {success: false, error: 'fixture read unavailable'};
      if (table === 'nodes' && beforeNodes) await beforeNodes();
      if (table === 'replica_operations' && beforeOperation) await beforeOperation();
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
  const transport = await createServiceDeliveryFixture(t, NODE);
  let delivery = await transport.local();
  return {cluster, port, leader, repository, repositoryFor, clock, execute, reads,
    request, receiver, observe, db, transport,
    get delivery() {
      return delivery;
    },
    set delivery(value) {
      delivery = value;
    },
    row: () => db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?').get(O),
    failReads: (table) => {
      failedTable = table;
    },
    pauseOperation: (callback) => {
      beforeOperation = callback;
    },
    pauseNodes: (callback) => {
      beforeNodes = callback;
    },
    run: () => admission.proposeAuthorizedGroupLearner(port, receiver, request, observe, delivery),
    proposalCount: () => cluster.coreEntries.filter((entry) =>
      entry.operation === 'propose_conf_change_v2').length};
}
// Query identity comes from the issued tuple, never from a later native status.
function learnerActionQuery(f, changes = {}) {
  const identity = JSON.parse(f.request.identity);
  const permit = JSON.parse(f.request.permit);
  return {purpose: membershipRead.COMMITTED_MEMBERSHIP_READ_PURPOSE.LEARNER_ACTION,
    groupId: GROUP, action: {operationId: O, transitionIdentity: identity.transitionIdentity,
      permitSequence: permit.permitSequence, stage: permit.permitStage,
      replicaIdentity: identity.targetReplicaId, peerId: identity.targetPeerId, ...changes}};
}
function readLearnerAction(f, replicaId = f.leader, changes = {}) {
  return f.cluster.node(replicaId)[portContract.RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP](
    learnerActionQuery(f, changes));
}
function assertExactLearnerOrigin(f, result, proposalIndex) {
  assert.equal(result.kind, 'committed-action', 'only exact applied action evidence is success');
  assert.deepEqual(result.receipt.context, learnerActionQuery(f).action);
  assert.equal(result.receipt.groupId, GROUP);
  assert.equal(result.receipt.index, String(proposalIndex));
  assert.equal(result.receipt.term, String(JSON.parse(f.request.permit).leaderTerm));
  assert.ok(BigInt(result.receipt.index) <= BigInt(result.observedAppliedIndex));
  assert.equal(Object.isFrozen(result.receipt.context), true);
  assert.equal(Object.isFrozen(result.receipt), true);
  assert.equal(Object.isFrozen(result), true);
}
async function learnerCheckpoint(f) {
  const status = f.cluster.node(f.leader).readStatus();
  const created = await createSqliteStateMachineCheckpoint({
    db: f.cluster.replica(f.leader).db, raftRsGroupId: GROUP,
    checkpointsRoot: path.join(f.cluster.directory, 'origin-checkpoints'),
    identity: {clusterId: 'origin-cluster', raftGroupId: GROUP,
      entity: {kind: 'message-group', id: GROUP},
      membershipEpoch: status.membershipGenerationIndex},
  });
  assert.equal(created.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED);
  assert.equal(readCheckpoint({checkpointDir: created.checkpointDir}).outcome,
    RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID);
  return created;
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
async function holdFinalOperationRead(t, f) {
  let enter;
  let release;
  const entered = new Promise((resolve) => {
    enter = resolve;
  });
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let readCount = 0;
  f.pauseOperation(async () => {
    readCount += 1;
    if (readCount === 2) {
      enter(); await held;
    }
  });
  t.after(() => release());
  const pending = f.run();
  await entered;
  assert.equal(readCount, 2, 'the real final operation read must be held');
  return {pending, release};
}
function interveningLearnerTransition(f, replicaIdentity) {
  const status = f.port.readStatus();
  return {operationId: 'intervening-operation', transitionIdentity: 'intervening-transition',
    permitSequence: 1, stage: portContract.RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER,
    replicaIdentity, peerAddress: f.cluster.addressOf(replicaIdentity),
    replicaLifecycleIncarnation: status.lifecycleIncarnation,
    runtimeGeneration: status.runtimeGeneration, leaderTerm: status.term,
    leaderConfigurationStamp: {configurationKey: status.configurationKey,
      membershipGenerationIndex: status.membershipGenerationIndex}};
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

// Execute a real repository change while the authoritative boot read is
// awaiting its fixture callback. The callback clears itself before repository
// writes so their own authoritative boot reads cannot recurse into the pause.
async function duringBootRead(f, change) {
  let crossed = false;
  f.pauseNodes(async () => {
    assert.equal(crossed, false, 'the intended boot-read window engages once');
    crossed = true;
    f.pauseNodes(null);
    await change();
  });
  const result = await f.run();
  assert.equal(crossed, true, 'the authorization must reach the paused boot read');
  return result;
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
        f.request, {outcome: 'observed'}, f.delivery)).reason,
      portContract.RAFT_MEMBERSHIP_AUTHORIZATION_REASON.REQUIRED);
      assertNoProposal(f, count);
      assert.equal((await admission.proposeAuthorizedGroupLearner(null, f.receiver,
        f.request, f.observe, f.delivery)).reason,
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
          {...f.receiver, ...change}, f.request, f.observe, f.delivery);
        assert.equal(answer.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
        assertNoProposal(f, count);
      }
      const changed = {...f.request, permit: JSON.stringify({
        ...JSON.parse(f.request.permit), workflowOwnerFence: 'not-the-issued-fence'})};
      assert.equal((await admission.proposeAuthorizedGroupLearner(f.port, f.receiver,
        changed, f.observe, f.delivery)).outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
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
      f.delivery = await f.transport.remote(SUCCESSOR);
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
    await t.test('renewal during the boot read defeats the previously observed holder', async (t) => {
      const f = await fixture(t);
      const count = f.proposalCount();
      const result = await duringBootRead(f, async () => {
        f.clock.advance(1);
        const renewed = await f.repository.claimMessageGroupMembershipOwner({
          operationId: O, identity: f.request.identity, expectedClaim: f.request.executionClaim});
        assert.equal(renewed.outcome, 'recorded', 'the competing real holder CAS must win');
        assert.notEqual(renewed.claim, f.request.executionClaim);
      });
      assert.equal(result.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED,
        'a holder replaced during boot observation cannot reach native proposal');
      assertNoProposal(f, count);
    });
    await t.test('successful settlement during the boot read defeats stale nonterminal state', async (t) => {
      const f = await fixture(t);
      const count = f.proposalCount();
      const result = await duringBootRead(f, () => settleOperation(f, true));
      assert.equal(f.row().status, ReplicaStatus.REMOVED);
      assert.equal(result.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED,
        'successful settlement during boot observation cannot authorize a learner');
      assertNoProposal(f, count);
    });
    await t.test('failure during the boot read retains the already-issued exact learner action', async (t) => {
      const f = await fixture(t);
      const result = await duringBootRead(f, () => settleOperation(f));
      assert.equal(f.row().status, ReplicaStatus.FAILED);
      assert.equal(f.row().message_group_membership_permit, f.request.permit);
      assert.equal(f.row().message_group_membership_obligation_state, 'unknown');
      assertCommittedLearner(f, result);
    });
    await t.test('unavailable final operation observation is not stale permission', async (t) => {
      const f = await fixture(t);
      const count = f.proposalCount();
      const result = await duringBootRead(f, async () => {
        f.failReads('replica_operations');
      });
      assert.equal(result.reason, portContract.RAFT_MEMBERSHIP_AUTHORIZATION_REASON.UNAVAILABLE,
        'unavailable final operation observation must retain a retryable refusal');
      assert.equal(result.retryable, true);
      assertNoProposal(f, count);
    });
    await t.test('actual recipient close during the final read refuses the delayed native action',
      async (t) => {
        const f = await fixture(t);
        const before = f.proposalCount();
        const held = await holdFinalOperationRead(t, f);
        await f.port.close();
        held.release();
        const result = await held.pending;
        assert.equal(result.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED,
          'a closed recipient must not accept the old native action');
        assertNoProposal(f, before);
        assert.equal(f.row().message_group_membership_permit, f.request.permit,
          'recipient loss does not silently cancel the durable issued action');
      });
    await t.test('actual committed configuration drift refuses the delayed original native action',
      async (t) => {
        const f = await fixture(t);
        const held = await holdFinalOperationRead(t, f);
        const other = 'intervening-learner';
        const transition = interveningLearnerTransition(f, other);
        const reserved = admission.reserveGroupPeerIdentity(f.receiver, other);
        assert.equal(reserved.outcome, portContract.RAFT_MEMBERSHIP_RESERVATION_OUTCOME.RESERVED);
        // This fixture acts through the native owner, not through a fabricated
        // status response. It does not stand for another admitted workflow.
        const proposal = await f.port[portContract.RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION](
          transition);
        assert.equal(proposal.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
        const peer = deriveRaftRsPeerId(other);
        assert.ok(f.cluster.settle(() => FOUNDERS.every((id) =>
          f.cluster.node(id).readStatus().confState.learners.includes(peer))),
        'the intervening learner is actually applied on all surviving voters');
        assert.ok(f.port.readStatus().membershipGenerationIndex >
          transition.leaderConfigurationStamp.membershipGenerationIndex,
        'the actual native configuration generation must advance');
        const afterIntervening = f.proposalCount();
        held.release();
        const result = await held.pending;
        assert.equal(result.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.STALE_CONFIGURATION,
          'an intervening committed configuration must fence the old native action');
        assertNoProposal(f, afterIntervening);
        assert.equal(f.row().message_group_membership_permit, f.request.permit,
          'native configuration refusal retains the exact unresolved operation');
      });
    await t.test('wire copies cannot supply a callable delivery capability', async (t) => {
      const f = await fixture(t);
      const before = f.proposalCount();
      const copied = JSON.parse(JSON.stringify(f.delivery));
      const result = await admission.proposeAuthorizedGroupLearner(f.port, f.receiver,
        {...f.request, delivery: f.delivery}, f.observe, copied);
      assert.equal(result.reason,
        portContract.RAFT_MEMBERSHIP_AUTHORIZATION_REASON.DELIVERY_REQUIRED,
        'a wire copy cannot authorize execution from a payload field');
      assertNoProposal(f, before);
    });
    await t.test('local delivery refuses after shutdown during the final read', async (t) => {
      const f = await fixture(t);
      const before = f.proposalCount();
      const held = await holdFinalOperationRead(t, f);
      await f.transport.router.shutdown();
      await f.transport.router.initialize({startServer: false});
      held.release();
      const result = await held.pending;
      assert.equal(result.reason, portContract.RAFT_MEMBERSHIP_AUTHORIZATION_REASON.STALE_DELIVERY,
        'old local delivery must not reach native proposal after shutdown and reopen');
      assertNoProposal(f, before);
      assert.equal(f.row().message_group_membership_permit, f.request.permit);
      f.delivery = await f.transport.local();
      assertCommittedLearner(f, await f.run());
    });
    await t.test('same-boot socket replacement refuses old delivery but preserves exact redelivery',
      async (t) => {
        const f = await fixture(t);
        f.clock.advance(30000);
        const adopted = await f.repositoryFor(SUCCESSOR).claimMessageGroupMembershipOwner({
          operationId: O, identity: f.request.identity, expectedClaim: f.request.executionClaim});
        assert.equal(adopted.outcome, 'recorded');
        f.request.executionClaim = adopted.claim;
        f.receiver.senderNodeId = SUCCESSOR;
        f.delivery = await f.transport.remote(SUCCESSOR);
        const before = f.proposalCount();
        const old = f.delivery;
        const held = await holdFinalOperationRead(t, f);
        await f.transport.closeRemote(SUCCESSOR);
        f.delivery = await f.transport.remote(SUCCESSOR);
        assert.equal(old.isCurrent(), false);
        assert.equal(f.delivery.isCurrent(), true);
        held.release();
        const result = await held.pending;
        assert.equal(result.reason,
          portContract.RAFT_MEMBERSHIP_AUTHORIZATION_REASON.STALE_DELIVERY,
          'a replaced socket must not carry its old action into the native proposal');
        assertNoProposal(f, before);
        assertCommittedLearner(f, await f.run());
        assert.equal(f.row().message_group_membership_obligation_state, 'unknown');
      });
    await t.test('delivery fence is consumed after an actual queued native turn', async (t) => {
      const release = Promise.withResolvers();
      t.after(() => release.resolve());
      const f = await fixture(t);
      let heldSend = false;
      f.cluster.sendFor = (from, address, packet) => {
        if (from !== f.leader || heldSend) return undefined;
        heldSend = true;
        return release.promise.then(() => f.cluster.queue(from, address, packet));
      };
      let occupied = f.port.propose({queueBarrier: true});
      // As in the existing status-observation witness, a proposal may not
      // emit until the leader's next heartbeat. Drive only that native clock.
      for (let tick = 0; tick < 12 && !heldSend; tick += 1) occupied = f.port.tick();
      assert.equal(heldSend, true, 'setup: a real Ready send must be suspended');
      assert.equal(typeof occupied?.then, 'function', 'setup: native queue must be occupied');
      const observed = Promise.withResolvers();
      const pending = admission.proposeAuthorizedGroupLearner(f.port, f.receiver, f.request,
        async (...args) => {
          const result = await f.observe(...args);
          observed.resolve();
          return result;
        }, f.delivery);
      await observed.promise;
      await new Promise((resolve) => setImmediate(resolve));
      const before = f.proposalCount();
      await f.transport.router.shutdown();
      release.resolve();
      await occupied;
      const result = await pending;
      assert.equal(heldSend, true, 'actual Ready send must hold the native work queue');
      assert.equal(result.reason, portContract.RAFT_MEMBERSHIP_AUTHORIZATION_REASON.STALE_DELIVERY,
        'a queued native action must revalidate its live delivery at execution');
      assertNoProposal(f, before);
      assert.equal(f.row().message_group_membership_permit, f.request.permit);
    });
    await t.test('uncommitted learner intent is unresolved, not a historical receipt',
      async (t) => {
        const f = await fixture(t);
        const before = f.proposalCount();
        assert.equal((await readLearnerAction(f)).kind, 'unresolved-action',
          'a reservation or issued intent must not become committed evidence');
        assertNoProposal(f, before);
        f.cluster.isolate(f.leader);
        const proposed = await f.run();
        assert.equal(proposed.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
        assert.equal((await readLearnerAction(f)).kind, 'unresolved-action',
          'a locally appended uncommitted configuration is not an origin receipt');
        f.cluster.heal(f.leader);
        assertCommittedLearner(f, proposed);
        for (const id of FOUNDERS) {
          assertExactLearnerOrigin(f, await readLearnerAction(f, id),
            proposed.proposalIndex);
        }
      });
    await t.test('lost proposal response is recovered after port and native reconstruction',
      async (t) => {
        const f = await fixture(t);
        // Discarded by the simulated caller; retained only by the test oracle.
        const proposed = await f.run();
        assertCommittedLearner(f, proposed);
        const old = f.port;
        const oldLifecycle = old.readStatus().lifecycleIncarnation;
        f.cluster.restart(f.leader);
        assert.notEqual(f.cluster.node(f.leader).readStatus().lifecycleIncarnation, oldLifecycle);
        const before = f.proposalCount();
        assertExactLearnerOrigin(f, await readLearnerAction(f), proposed.proposalIndex);
        assert.equal(f.proposalCount(), before,
          'recovered outcome must not repropose the old action');
        assert.equal((await old[portContract.RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP](
          learnerActionQuery(f))).kind, 'refused-action', 'closed ports cannot issue receipts');
        const trapped = trapSharedCore(f.cluster, f.leader);
        assert.equal(trapped.outcome, RAFT_OPERATION_OUTCOME.CORE_FATAL,
          'the real runtime reconstruction control must engage');
        for (const id of FOUNDERS) f.cluster.node(id).readStatus();
        assertExactLearnerOrigin(f, await readLearnerAction(f), proposed.proposalIndex);
        assert.equal(f.row().message_group_membership_permit, f.request.permit);
      });
    await t.test('historical origin survives leader change without refreshing execution fences',
      async (t) => {
        const f = await fixture(t);
        const proposed = await f.run();
        assertCommittedLearner(f, proposed);
        const successor = FOUNDERS.find((id) => id !== f.leader);
        const oldTerm = f.port.readStatus().term;
        f.cluster.isolate(f.leader); f.cluster.tickers = [successor];
        assert.ok(f.cluster.settle(() => f.cluster.node(successor).readStatus().role === 'leader'),
          'an actual surviving voter must become leader');
        assert.ok(f.cluster.node(successor).readStatus().term > oldTerm);
        const before = f.proposalCount();
        assertExactLearnerOrigin(f, await readLearnerAction(f, successor), proposed.proposalIndex);
        assert.equal(f.proposalCount(), before);
        const observed = await f.observe(f.request, f.receiver);
        const stale = await f.cluster.node(successor)
          .proposeMembershipTransition(observed.transition);
        assert.notEqual(stale.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED,
          'the old execution fences are not permission in the new native context');
        assert.equal(f.proposalCount(), before);
      });
    await t.test('different action tuples cannot borrow a target historical receipt', async (t) => {
      const f = await fixture(t);
      const proposed = await f.run(); assertCommittedLearner(f, proposed);
      for (const changes of [{operationId: 'other-operation'},
        {transitionIdentity: 'other-transition'}, {permitSequence: 2}, {stage: 'promote'},
        {replicaIdentity: 'different-target'}, {peerId: '7'}]) {
        assert.notEqual((await readLearnerAction(f, f.leader, changes)).kind, 'committed-action');
      }
      const query = learnerActionQuery(f); query.groupId = 'other-group';
      assert.equal((await f.port.readCommittedMembership(query)).kind, 'refused-action');
      assertExactLearnerOrigin(f, await readLearnerAction(f), proposed.proposalIndex);
    });
    await t.test('origin and ConfState roll back together when the actual apply transaction fails',
      async (t) => {
        const f = await fixture(t);
        const db = f.cluster.replica(f.leader).db;
        const before = f.port.readStatus().appliedIndex;
        db.exec(`CREATE TRIGGER fail_origin_apply BEFORE UPDATE ON _raft_rs_applied_state
          WHEN EXISTS (SELECT 1 FROM raft_rs_peer_identity WHERE learner_admission IS NOT NULL)
          BEGIN SELECT RAISE(ABORT, 'origin apply rollback witness'); END`);
        await f.run();
        assert.ok(f.cluster.settle(() =>
          f.port.readStatus().outcome === RAFT_OPERATION_OUTCOME.HOST_FAILURE),
        'the actual native application failure must engage');
        const origin = db.prepare('SELECT learner_admission FROM raft_rs_peer_identity ' +
          'WHERE replica_identity = ?').get(TARGET);
        assert.equal(origin?.learner_admission ?? null, null,
          'failed applied-state transaction must not leave a positive origin');
        assert.equal(Number(db.prepare('SELECT applied_index FROM _raft_rs_applied_state ' +
          'WHERE group_id = ?').get(GROUP).applied_index), before);
        db.exec('DROP TRIGGER fail_origin_apply');
        assert.ok(f.cluster.settle(() => FOUNDERS.every((id) =>
          f.cluster.node(id).readStatus().confState?.learners
            .includes(deriveRaftRsPeerId(TARGET)))));
        assert.equal((await readLearnerAction(f)).kind, 'committed-action');
      });
    await t.test('checkpoint scrubs native history but preserves exact learner origin',
      async (t) => {
        const f = await fixture(t);
        const proposed = await f.run(); assertCommittedLearner(f, proposed);
        const created = await learnerCheckpoint(f);
        assert.equal(created.descriptor.payloadVersion, 2,
          'origin-bearing images must not silently reuse the old payload contract');
        const payload = new Database(path.join(created.checkpointDir, RAFT_CHECKPOINT_PAYLOAD_FILE),
          {readonly: true});
        try {
          assert.equal(payload.prepare('SELECT 1 FROM sqlite_master WHERE name = ?')
            .get('_raft_rs_log'), undefined, 'the old native log must really be absent');
          const encoded = payload.prepare('SELECT learner_admission FROM raft_rs_peer_identity ' +
          'WHERE replica_identity = ?').get(TARGET).learner_admission;
          assert.deepEqual(JSON.parse(encoded), (await readLearnerAction(f)).receipt,
            'the exact outcome must outlive native log retention');
          assert.equal(created.descriptor.raftRs.peerReservations.find(
            ({replicaIdentity}) => replicaIdentity === TARGET).learnerAdmission, encoded);
        } finally {
          payload.close();
        }
        const old = {...created.descriptor, payloadVersion: 1};
        writeAtomicDurable(path.join(created.checkpointDir, RAFT_CHECKPOINT_DESCRIPTOR_FILE), old);
        assert.equal(readCheckpoint({checkpointDir: created.checkpointDir}).outcome,
          RAFT_CHECKPOINT_VALIDATION_OUTCOME.UNSUPPORTED_PAYLOAD_KIND);
      });
    await t.test('checkpoint validates origin against both payload and applied boundary',
      async (t) => {
        const f = await fixture(t);
        const proposed = await f.run(); assertCommittedLearner(f, proposed);
        const created = await learnerCheckpoint(f);
        const descriptorPath = path.join(created.checkpointDir, RAFT_CHECKPOINT_DESCRIPTOR_FILE);
        const altered = structuredClone(created.descriptor);
        const reservation = altered.raftRs.peerReservations.find(
          ({replicaIdentity}) => replicaIdentity === TARGET);
        const origin = JSON.parse(reservation.learnerAdmission);
        origin.index = String(BigInt(altered.raftRs.appliedIndex) + 1n);
        reservation.learnerAdmission = JSON.stringify(origin);
        writeAtomicDurable(descriptorPath, altered);
        assert.equal(readCheckpoint({checkpointDir: created.checkpointDir}).outcome,
          RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_DESCRIPTOR,
          'a descriptor origin beyond its own applied boundary is not admissible');
        const payloadPath = path.join(created.checkpointDir, RAFT_CHECKPOINT_PAYLOAD_FILE);
        const payload = new Database(payloadPath);
        payload.prepare('UPDATE raft_rs_peer_identity SET learner_admission = NULL ' +
        'WHERE replica_identity = ?').run(TARGET); payload.close();
        const bytes = fs.readFileSync(payloadPath);
        writeAtomicDurable(descriptorPath, {...created.descriptor,
          payloadByteLength: bytes.length, payloadDigest: sha256Digest(bytes)});
        assert.equal(readCheckpoint({checkpointDir: created.checkpointDir}).outcome,
          RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_PAYLOAD,
          'even a digest-matched payload cannot erase its described origin');
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
