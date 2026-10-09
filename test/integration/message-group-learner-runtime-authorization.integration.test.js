/** Real repository -> group-admission owner -> three real raft-rs operation ports.
 * Operation SQL uses a canonical file-backed fixture, NOT distributed SQL.
 * Runtime transports are the existing in-process inbox harness. Sender/recipient
 * bindings are host fixture inputs, NOT proof of MessageRouter authentication.
 * The install case adds real CREATE-CAS and target-file/native reopen proof.
 * Full driver, physical network, promotion and cleanup remain outside its scope.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fixture, GROUP, FOUNDERS, TARGET, NODE, SUCCESSOR, O, NOW} from
  '../test-helpers/learner-operation-fixture.js';
import Database from 'better-sqlite3';
import * as admission from '../../src/raft/raft-rs-group-membership-admission.js';
import * as portContract from '../../src/raft/raft-operation-port-constants.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {ReplicaStatus, OperationType} from '../../src/rebalancer/replica-status.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {deriveRaftRsPeerId, RaftRsPeerIdentityRegistry} from '../../src/raft/raft-rs-peer-identity.js';
import {committedMembershipContext} from '../../src/raft/raft-rs-committed-membership-context.js';
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
import {RAFT_RS_PEER_IDENTITY_ERROR_MSG} from '../../src/raft/raft-rs-peer-identity-constants.js';
import {validateCheckpointDescriptor} from '../../src/raft/snapshot-checkpoint-format.js';
import {requestSnapshotInstall} from '../../src/raft/snapshot-install.js';
import {RAFT_SNAPSHOT_INSTALL_OUTCOME, RAFT_SNAPSHOT_INSTALL_REJECTION} from
  '../../src/raft/snapshot-install-constants.js';
import {ReplicaCreateAdmissionOwner} from '../../src/node/replica-create-admission-owner.js';
import {buildReplicaCreateAdmissionToken, buildReplicaCreateAttemptToken} from
  '../../src/rebalancer/replica-create-admission-token.js';
import {RAFT_OPERATION_PORT_REQUEST} from '../../src/raft/raft-operation-port-request.js';


const {RAFT_OPERATION_OUTCOME, RAFT_MEMBERSHIP_TRANSITION_REASON} = portContract;
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
      entity: {kind: SERVICE_TYPE.MESSAGE_GROUP, id: GROUP},
      membershipEpoch: status.membershipGenerationIndex},
  });
  assert.equal(created.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED);
  assert.equal(readCheckpoint({checkpointDir: created.checkpointDir}).outcome,
    RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID);
  return created;
}
async function installationAdmission(t, f) {
  const owner = new ReplicaCreateAdmissionOwner({gateway: f.gateway,
    nodeId: SUCCESSOR, ownerIncarnation: 1, now: () => NOW + 10});
  const before = await f.repository.queryAuthoritativeOperationById(O);
  // Fixture actuation through the real repository, NOT a production driver.
  // This witness composes current native descriptor, CREATE CAS and install.
  await f.repository.persistOperationUpdate({...before, workflowStep: WORKFLOW_STEP.SENDING,
    updatedAt: NOW + 2}, {confirmPersistence: false, disableSystemWriteSession: true,
    returnDisposition: true, expectedWorkflowStep: WORKFLOW_STEP.PENDING});
  assert.equal(f.row().workflow_step, WORKFLOW_STEP.SENDING);
  const admissionToken = buildReplicaCreateAdmissionToken({operationId: O,
    replicaId: TARGET, targetNodeId: SUCCESSOR, workflowUpdatedAt: NOW + 2});
  const request = {operationId: O, operationType: OperationType.REPLACE,
    entityType: SERVICE_TYPE.MESSAGE_GROUP, entityId: GROUP, partitionId: GROUP,
    replicaId: TARGET, workflowUpdatedAt: NOW + 2, admissionToken,
    attemptToken: buildReplicaCreateAttemptToken(admissionToken, 1), attemptSeq: 1};
  const evidence = await owner.claim(request);
  const worker = await owner.claimPhysicalWorker(evidence);
  assert.ok(worker, 'the existing CREATE owner must grant the actual sole worker');
  t.after(() => owner.releasePhysicalWorker(worker));
  return {owner, evidence, worker};
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

// The host supplies a bound real native read, never a caller's claimed receipt.
function recordOutcome(f, {repository = f.repository, request = f.request,
  read = (query) => f.cluster.node(f.leader).readCommittedMembership(query)} = {}) {
  assert.equal(typeof repository.recordMessageGroupLearnerOutcome, 'function',
    'existing repository must record exact recovered learner evidence');
  return repository.recordMessageGroupLearnerOutcome(request, read);
}
async function issuedAndCommitted(t) {
  const f = await fixture(t);
  assertCommittedLearner(f, await f.run());
  return f;
}
function ordinaryAndDebt(row) {
  const retained = {...row};
  for (const field of ['message_group_membership_phase',
    'message_group_membership_permit', 'message_group_learner_stamp']) delete retained[field];
  return retained;
}
async function renewMembershipHolder(f) {
  f.clock.advance(1);
  const result = await f.repository.claimMessageGroupMembershipOwner({operationId: O,
    identity: f.request.identity, expectedClaim: f.request.executionClaim});
  assert.equal(result.outcome, 'recorded', 'real holder renewal must engage');
  return result.claim;
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
        const oldDatabase = f.cluster.replica(f.leader).db;
        f.cluster.restart(f.leader);
        assert.equal(oldDatabase.open, false, 'the prior database must actually close');
        assert.equal(f.cluster.node(f.leader) === old, false, 'the port must be reconstructed');
        assert.equal(f.cluster.replica(f.leader).db === oldDatabase, false,
          'reconstruction must acquire a different database connection');
        assert.equal(f.cluster.node(f.leader).readStatus().lifecycleIncarnation, oldLifecycle,
          'same durable replica reopening preserves its physical lifecycle identity');
        const before = f.proposalCount();
        assertExactLearnerOrigin(f, await readLearnerAction(f), proposed.proposalIndex);
        assert.equal(f.proposalCount(), before,
          'recovered outcome must not repropose the old action');
        assert.equal((await old[portContract.RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP](
          learnerActionQuery(f))).kind, 'refused-action', 'closed ports cannot issue receipts');
        const previousRuntime = f.cluster.node(f.leader).readStatus().runtimeGeneration;
        const trapped = trapSharedCore(f.cluster, f.leader);
        assert.equal(trapped.outcome, RAFT_OPERATION_OUTCOME.CORE_FATAL,
          'the real runtime reconstruction control must engage');
        for (const id of FOUNDERS) f.cluster.node(id).readStatus();
        assert.notEqual(f.cluster.node(f.leader).readStatus().runtimeGeneration, previousRuntime,
          'the actual fatal boundary must reconstruct the shared native runtime');
        assertExactLearnerOrigin(f, await readLearnerAction(f), proposed.proposalIndex);
        assert.equal(f.row().message_group_membership_permit, f.request.permit);
      });
    await t.test('historical origin survives leader change without refreshing execution fences',
      async (t) => {
        const f = await fixture(t);
        const proposed = await f.run();
        assertCommittedLearner(f, proposed);
        let successor = null;
        const oldTerm = f.port.readStatus().term;
        f.cluster.isolate(f.leader);
        // Both surviving voters must advance their election/leader leases.
        f.cluster.tickers = FOUNDERS.filter((id) => id !== f.leader);
        assert.ok(f.cluster.settle(() =>
          f.cluster.tickers.some((id) => f.cluster.node(id).readStatus().role === 'leader')),
        'an actual surviving voter must become leader');
        successor = f.cluster.tickers.find((id) =>
          f.cluster.node(id).readStatus().role === 'leader');
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
    await t.test('historical read snapshots exact own-data actions without invoking accessors',
      async (t) => {
        const f = await fixture(t);
        const proposed = await f.run(); assertCommittedLearner(f, proposed);
        const query = learnerActionQuery(f);
        let reads = 0;
        Object.defineProperty(query.action, 'stage', {enumerable: true,
          get() {
            reads += 1;
            return reads === 4 ? 'promote' : 'add-learner';
          }});
        const invalid = await f.port.readCommittedMembership(query);
        assert.equal(invalid.reason, membershipRead.COMMITTED_LEARNER_ACTION_REASON.INVALID,
          'accessor action must be rejected before validation or encoding');
        assert.equal(reads, 0, 'rejecting an accessor must not evaluate it');
        let traps = 0;
        const proxy = new Proxy(learnerActionQuery(f).action, {
          get(target, property) {
            traps += 1; return Reflect.get(target, property);
          },
          ownKeys(target) {
            traps += 1; return Reflect.ownKeys(target);
          },
          getPrototypeOf(target) {
            traps += 1; return Reflect.getPrototypeOf(target);
          },
        });
        const proxyQuery = {...learnerActionQuery(f), action: proxy};
        assert.equal((await f.port.readCommittedMembership(proxyQuery)).reason,
          membershipRead.COMMITTED_LEARNER_ACTION_REASON.INVALID);
        assert.equal(traps, 0, 'proxy rejection must not invoke its traps');
        const nonenumerable = learnerActionQuery(f).action;
        Object.defineProperty(nonenumerable, 'stage', {enumerable: false});
        const inherited = Object.create(learnerActionQuery(f).action);
        for (const action of [nonenumerable, inherited,
          {...learnerActionQuery(f).action, [Symbol('extra')]: true}]) {
          assert.equal((await f.port.readCommittedMembership({...learnerActionQuery(f), action}))
            .reason, membershipRead.COMMITTED_LEARNER_ACTION_REASON.INVALID);
        }
        const plainNull = Object.assign(Object.create(null), learnerActionQuery(f).action);
        assertExactLearnerOrigin(f, await f.port.readCommittedMembership(
          {...learnerActionQuery(f), action: plainNull}), proposed.proposalIndex);
        assertExactLearnerOrigin(f, await readLearnerAction(f), proposed.proposalIndex);
      });
    await t.test('queued origin read refuses malformed bytes and impossible future terms',
      async (t) => {
        const f = await fixture(t);
        const proposed = await f.run(); assertCommittedLearner(f, proposed);
        const db = f.cluster.replica(f.leader).db;
        const before = await readLearnerAction(f);
        const original = JSON.stringify(before.receipt);
        const update = db.prepare('UPDATE raft_rs_peer_identity SET learner_admission = ? ' +
          'WHERE replica_identity = ?');
        // Deliberate corruption at the durable boundary, never a normal writer.
        update.run('{malformed-origin', TARGET);
        const malformed = await readLearnerAction(f);
        assert.equal(malformed.kind, membershipRead.COMMITTED_LEARNER_ACTION_KIND.REFUSED);
        assert.equal(malformed.reason, membershipRead.COMMITTED_LEARNER_ACTION_REASON.CORRUPT,
          'malformed live origin must be typed corrupt rather than success or throw');
        const impossible = {...before.receipt, term: String(BigInt(f.port.readStatus().term) + 1n)};
        update.run(JSON.stringify(impossible), TARGET);
        const future = await readLearnerAction(f);
        assert.equal(future.kind, membershipRead.COMMITTED_LEARNER_ACTION_KIND.REFUSED,
          'future-term origin cannot be committed historical evidence');
        assert.equal(future.reason, membershipRead.COMMITTED_LEARNER_ACTION_REASON.BEYOND_APPLIED);
        update.run(original, TARGET);
        assertExactLearnerOrigin(f, await readLearnerAction(f), proposed.proposalIndex);
      });
    await t.test('registry replay is a no-op and conflicting origin rolls back without replacement',
      async (t) => {
        const f = await fixture(t);
        const proposed = await f.run(); assertCommittedLearner(f, proposed);
        const db = f.cluster.replica(f.leader).db;
        const registry = new RaftRsPeerIdentityRegistry(db);
        const encoded = registry.committedLearnerAdmission(TARGET);
        assert.notEqual(encoded, null, 'the real native apply must record origin first');
        const changes = () => db.prepare('SELECT total_changes() AS n').get().n;
        const originalChanges = changes();
        db.transaction(() => registry.recordCommittedLearnerAdmission(TARGET, encoded))();
        assert.equal(changes(), originalChanges, 'identical origin replay performs no SQL update');
        const origin = JSON.parse(encoded);
        const conflicting = JSON.stringify({...origin,
          context: {...origin.context, operationId: 'conflicting-operation'}});
        db.exec('CREATE TABLE origin_rollback_probe (value INTEGER)');
        db.exec('INSERT INTO origin_rollback_probe VALUES (0)');
        assert.throws(() => db.transaction(() => {
          db.exec('UPDATE origin_rollback_probe SET value = 1');
          registry.recordCommittedLearnerAdmission(TARGET, conflicting);
        })(), {message: RAFT_RS_PEER_IDENTITY_ERROR_MSG.LEARNER_ADMISSION_CONFLICT},
        'conflicting origin must reject the enclosing application transaction');
        assert.equal(db.prepare('SELECT value FROM origin_rollback_probe').get().value, 0);
        assert.equal(registry.committedLearnerAdmission(TARGET), encoded,
          'conflicting origin must not replace previously retained bytes');
        assert.throws(() => registry.recordCommittedLearnerAdmission(TARGET, encoded),
          {message: RAFT_RS_PEER_IDENTITY_ERROR_MSG.LEARNER_ADMISSION_TRANSACTION});
        assertExactLearnerOrigin(f, await readLearnerAction(f), proposed.proposalIndex);
      });
    await t.test('origin and ConfState roll back together when the actual apply transaction fails',
      async (t) => {
        const nativeTimeSource = new VirtualTimeSource({startMs: NOW});
        const f = await fixture(t, {nativeTimeSource});
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
        const committedState = db.prepare('SELECT learners FROM _raft_rs_applied_state ' +
          'WHERE group_id = ?').get(GROUP);
        assert.equal(JSON.parse(committedState.learners).includes(deriveRaftRsPeerId(TARGET)),
          false, 'rolled-back ConfState cannot expose the failed learner origin');
        db.exec('DROP TRIGGER fail_origin_apply');
        const resumed = await f.port.tick();
        if (resumed.recoveryRequired === true) {
          assert.ok(Number.isSafeInteger(resumed.retryAfterMs) && resumed.retryAfterMs > 0,
            'the recovery owner must name the remaining retry delay');
          nativeTimeSource.advance(resumed.retryAfterMs);
          assert.equal((await f.port.tick()).outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
            'replay must recover after the unchanged owner deadline');
        } else {
          assert.equal(resumed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
        }
        assert.ok(f.cluster.settle(() => FOUNDERS.every((id) =>
          f.cluster.node(id).readStatus().confState?.learners
            .includes(deriveRaftRsPeerId(TARGET)))));
        assert.equal((await readLearnerAction(f)).kind, 'committed-action');
        assert.equal(f.row().message_group_membership_permit, f.request.permit,
          'recovery cannot rewrite the original issued action');
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
    await t.test('actual origin-bearing image installs and reopens on the exact fresh learner',
      async (t) => {
        const f = await fixture(t);
        const proposed = await f.run(); assertCommittedLearner(f, proposed);
        const original = await readLearnerAction(f);
        const stamp = await f.port.readCommittedMembership({
          purpose: membershipRead.COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP});
        assert.equal(stamp.kind, membershipRead.COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED);
        assert.ok(stamp.learners.includes(deriveRaftRsPeerId(TARGET)),
          'a current native join descriptor, not just historical origin, is required');
        const created = await learnerCheckpoint(f);
        const targetDbPath = f.cluster.dbFileOf(TARGET);
        const receiverRoot = path.join(f.cluster.directory, 'target-checkpoints');
        const generation = created.descriptor.lastIncludedIndex;
        fs.cpSync(created.checkpointDir, path.join(receiverRoot, String(generation)),
          {recursive: true});
        const options = {replicaDbPath: targetDbPath, checkpointsRoot: receiverRoot,
          generationIndex: generation, expectedIdentity: {clusterId: 'origin-cluster',
            raftGroupId: GROUP, entity: {kind: SERVICE_TYPE.MESSAGE_GROUP, id: GROUP},
            membershipEpoch: created.descriptor.membershipEpoch},
          expectedReplicaIdentity: TARGET, expectedPeerId: deriveRaftRsPeerId(TARGET)};
        const direct = await requestSnapshotInstall(options);
        assert.equal(direct.reason, RAFT_SNAPSHOT_INSTALL_REJECTION.CREATE_ADMISSION_REQUIRED);
        assert.equal(fs.existsSync(targetDbPath), false,
          'a historical receipt and checkpoint cannot bypass physical CREATE authority');
        const admission = await installationAdmission(t, f);
        assert.equal(await admission.owner.claimPhysicalWorker(admission.evidence), false,
          'a second physical worker must not be admitted for the same generation');
        assert.equal(created.descriptor.entity.kind, admission.evidence.entityType,
          'checkpoint identity must use the real operation entity-type owner');
        const installed = await requestSnapshotInstall({...options,
          createAdmissionOwner: admission.owner, createAdmissionEvidence: admission.evidence,
          createPhysicalWorkerClaim: admission.worker});
        assert.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
          `the actual origin-bearing snapshot must install: ${JSON.stringify(installed)}`);
        const disk = new Database(targetDbPath, {readonly: true});
        try {
          assert.equal(disk.prepare('SELECT COUNT(*) AS n FROM _raft_rs_log').get().n, 0,
            'target recovery must not borrow the sender log');
          const encoded = disk.prepare('SELECT learner_admission FROM raft_rs_peer_identity ' +
            'WHERE replica_identity = ?').get(TARGET).learner_admission;
          assert.deepEqual(JSON.parse(encoded), original.receipt);
        } finally {
          disk.close();
        }
        const joined = f.cluster.addReplica(TARGET, FOUNDERS, {
          [RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]: stamp,
          [RAFT_OPERATION_PORT_REQUEST.JOINING_EXISTING_GROUP]: true});
        assert.equal(joined.node.readStatus().outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
        assertExactLearnerOrigin(f, await readLearnerAction(f, TARGET), proposed.proposalIndex);
        assert.equal((await readLearnerAction(f, TARGET, {operationId: 'wrong-operation'})).kind,
          membershipRead.COMMITTED_LEARNER_ACTION_KIND.REFUSED);
        const oldPort = joined.node;
        const oldDb = joined.db;
        const reopened = f.cluster.restart(TARGET);
        assert.equal(oldDb.open, false, 'the previous target database must actually close');
        assert.equal(reopened.db === oldDb, false, 'reopen must acquire another real connection');
        assert.equal(reopened.node === oldPort, false, 'reopen must acquire another native port');
        assertExactLearnerOrigin(f, await readLearnerAction(f, TARGET), proposed.proposalIndex);
        assert.equal((await oldPort.readCommittedMembership(learnerActionQuery(f))).kind,
          membershipRead.COMMITTED_LEARNER_ACTION_KIND.REFUSED);
        assert.ok(reopened.node.readStatus().confState.learners.includes(
          deriveRaftRsPeerId(TARGET)));
        assert.equal(f.row().message_group_membership_permit, f.request.permit,
          'checkpoint recovery cannot refresh the original issued action');
      });
    await t.test('checkpoint validates origin against both payload and applied boundary',
      async (t) => {
        const f = await fixture(t);
        const proposed = await f.run(); assertCommittedLearner(f, proposed);
        const created = await learnerCheckpoint(f);
        const invalidShape = {...created.descriptor,
          raftRs: {...created.descriptor.raftRs, peerReservations: [null]}};
        assert.equal(validateCheckpointDescriptor(invalidShape).outcome,
          RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_DESCRIPTOR,
          'direct malformed reservation shape must be a typed refusal');
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


test('recovered learner outcome advances only the exact operation membership fields',
  {timeout: 30000}, async (t) => {
    await t.test('issued or proposed is not a recorded learner outcome', async (t) => {
      const f = await fixture(t);
      const before = f.row();
      assert.equal((await recordOutcome(f)).outcome, 'unknown');
      const proposed = await f.run();
      assert.equal(proposed.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
      assert.equal((await recordOutcome(f)).outcome, 'unknown');
      assert.deepEqual(f.row(), before, 'no evidence must retain exact in-flight debt');
    });
    await t.test('committed receipt and same-turn stamp record once without CREATE', async (t) => {
      const f = await issuedAndCommitted(t);
      const before = f.row(); const proposals = f.proposalCount();
      const observed = await readLearnerAction(f);
      assert.equal(observed.membership.appliedIndex, observed.observedAppliedIndex,
        'membership and historical evidence must share the native observation');
      const recorded = await recordOutcome(f);
      assert.equal(recorded.outcome, 'recorded', 'exact native evidence must record');
      const after = f.row();
      assert.equal(after.message_group_membership_phase, 'learner_committed');
      assert.deepEqual(JSON.parse(after.message_group_membership_permit),
        {...JSON.parse(f.request.permit), permitState: 'committed',
          proposalIndex: Number(observed.receipt.index)}, 'only outcome fields change in old permit');
      assert.deepEqual(JSON.parse(after.message_group_learner_stamp), observed.membership);
      assert.deepEqual(ordinaryAndDebt(after), ordinaryAndDebt(before),
        'recording preserves ordinary progress, original identity, holder and membership lane/debt');
      const changes = f.db.prepare('SELECT total_changes() AS n').get().n;
      assert.equal((await recordOutcome(f, {read: () => {
        throw new Error('must not reread');
      }}))
        .outcome, 'recorded');
      assert.equal(f.db.prepare('SELECT total_changes() AS n').get().n, changes,
        'identical replay must perform no database mutation');
      assert.deepEqual(f.row(), after);
      assertNoProposal(f, proposals);
      assert.notEqual((await f.observe(f.request, f.receiver)).outcome, 'observed',
        'recorded learner must not revive the former initial execution permission');
    });
    await t.test('commit before operation recording survives both database and native reopen', async (t) => {
      const f = await issuedAndCommitted(t);
      const before = f.row(); const proposals = f.proposalCount();
      const oldNative = f.cluster.replica(f.leader).db;
      f.cluster.restart(f.leader);
      assert.equal(oldNative.open, false, 'native database must close before recovered read');
      const recovered = f.reopenOperations();
      assert.deepEqual(f.row(), before, 'no operation result was recorded before reconstruction');
      assert.equal((await recordOutcome(f, {repository: recovered})).outcome, 'recorded',
        'new repository and native owners must record the original result');
      assertNoProposal(f, proposals);
    });
    await t.test('leader change recovers the old action without refreshing its permit', async (t) => {
      const f = await issuedAndCommitted(t);
      const initial = JSON.parse(f.request.permit); const proposals = f.proposalCount();
      f.cluster.isolate(f.leader);
      f.cluster.tickers = FOUNDERS.filter((id) => id !== f.leader);
      assert.ok(f.cluster.settle(() => f.cluster.tickers.some((id) =>
        f.cluster.node(id).readStatus().role === 'leader')));
      const next = f.cluster.tickers.find((id) => f.cluster.node(id).readStatus().role === 'leader');
      assert.ok(f.cluster.node(next).readStatus().term > initial.leaderTerm);
      const read = (query) => f.cluster.node(next).readCommittedMembership(query);
      assert.equal((await recordOutcome(f, {read})).outcome, 'recorded');
      assert.equal(JSON.parse(f.row().message_group_membership_permit).leaderTerm,
        initial.leaderTerm);
      assertNoProposal(f, proposals);
    });
    await t.test('wrong action or inconsistent observation cannot advance the operation', async (t) => {
      const f = await issuedAndCommitted(t); const before = f.row();
      const actual = await readLearnerAction(f);
      for (const damaged of [
        {...actual, receipt: {...actual.receipt,
          context: {...actual.receipt.context, operationId: 'another-operation'}}},
        {...actual, observedAppliedIndex: actual.observedAppliedIndex + 1},
        {...actual, receipt: {...actual.receipt, term: String(Number(actual.receipt.term) + 1)}},
        {...actual, membership: null},
      ]) {
        assert.equal((await recordOutcome(f, {read: async () => damaged})).outcome, 'conflict',
          'wrong action or incoherent native evidence must refuse recording');
        assert.deepEqual(f.row(), before);
      }
    });
    await t.test('native refusal classifications retain conflict versus unavailability', async (t) => {
      const f = await issuedAndCommitted(t);
      const before = f.row();
      const actual = await readLearnerAction(f);
      const kinds = membershipRead.COMMITTED_LEARNER_ACTION_KIND;
      const reasons = membershipRead.COMMITTED_LEARNER_ACTION_REASON;
      const refusal = (reason) => ({kind: kinds.REFUSED, reason});
      const witness = (reason) => ({...actual, membership: {
        kind: membershipRead.COMMITTED_MEMBERSHIP_ANSWER_KIND.REFUSED, reason}});
      const cases = [
        [refusal(reasons.UNAVAILABLE), 'unavailable'],
        [refusal(reasons.MISMATCH), 'conflict'],
        [refusal(reasons.CORRUPT), 'conflict'],
        [refusal(reasons.BEYOND_APPLIED), 'conflict'],
        [refusal(reasons.INVALID), 'conflict'],
        [{kind: kinds.UNRESOLVED, reason: reasons.NOT_RECORDED}, 'unknown'],
        [{kind: kinds.UNRESOLVED, reason: reasons.CORRUPT}, 'conflict'],
        [null, 'conflict'],
        [{kind: kinds.COMMITTED, reason: reasons.UNAVAILABLE}, 'conflict'],
        [witness(membershipRead.COMMITTED_MEMBERSHIP_REFUSAL.HELD), 'unavailable'],
        [witness(membershipRead.COMMITTED_MEMBERSHIP_REFUSAL
          .CONFIGURATION_GENERATION_UNAVAILABLE), 'unavailable'],
        [witness(membershipRead.COMMITTED_MEMBERSHIP_REFUSAL.STAMP_INVALID), 'conflict'],
      ];
      for (const [answer, expected] of cases) {
        assert.equal((await recordOutcome(f, {read: async () => answer})).outcome, expected,
          'typed permanent native refusal must not become retryable unavailability');
        assert.deepEqual(f.row(), before, 'refusal must retain the row and membership debt');
      }
      const unavailable = async () => {
        throw new Error('read transport unavailable');
      };
      assert.equal((await recordOutcome(f, {read: unavailable})).outcome, 'unavailable');
      assert.equal((await recordOutcome(f)).outcome, 'recorded',
        'a later genuine committed native answer remains recoverable');
    });
    await t.test('terminal competition at learner CAS preserves exact terminal history', async (t) => {
      for (const successful of [false, true]) {
        const f = await issuedAndCommitted(t);
        const execute = f.repository.executeOperationMutationWithRetry.bind(f.repository);
        let terminal = null;
        f.repository.executeOperationMutationWithRetry = async (sql, params, ...rest) => {
          if (terminal === null && sql.includes('message_group_learner_stamp = ?')) {
            f.repository.executeOperationMutationWithRetry = execute;
            await settleOperation(f, successful);
            terminal = f.row();
          }
          return execute(sql, params, ...rest);
        };
        assert.equal((await recordOutcome(f)).outcome, 'unknown',
          'terminal-first competition must defeat the earlier learner CAS');
        assert.ok(terminal, 'actual recording CAS must meet a terminal competitor');
        assert.deepEqual(f.row(), terminal, 'losing CAS must preserve the exact winning row');
        assert.equal((await recordOutcome(f)).outcome, successful ? 'conflict' : 'recorded');
        assert.deepEqual(ordinaryAndDebt(f.row()), ordinaryAndDebt(terminal),
          'a failed ordinary operation keeps terminal history and unresolved membership debt');
      }
    });
    await t.test('holder renewal during native read prevents old-holder recording', async (t) => {
      const f = await issuedAndCommitted(t);
      const read = async (query) => {
        const evidence = await f.port.readCommittedMembership(query);
        await renewMembershipHolder(f); return evidence;
      };
      assert.equal((await recordOutcome(f, {read})).outcome, 'conflict');
      assert.equal(f.row().message_group_learner_stamp, null);
      const current = f.row().message_group_membership_owner_claim;
      assert.equal((await recordOutcome(f, {request: {...f.request, executionClaim: current}}))
        .outcome, 'recorded', 'current holder can recover without replacing the old permit');
    });
    await t.test('terminal failure during observation retains debt and permits historical recording', async (t) => {
      const f = await issuedAndCommitted(t); const proposals = f.proposalCount();
      let terminal;
      const read = async (query) => {
        const evidence = await f.port.readCommittedMembership(query);
        await settleOperation(f); terminal = f.row(); return evidence;
      };
      assert.equal((await recordOutcome(f, {read})).outcome, 'recorded');
      assert.deepEqual(ordinaryAndDebt(f.row()), ordinaryAndDebt(terminal),
        'terminal history and outstanding membership lane must survive outcome recording');
      assertNoProposal(f, proposals);
    });
    await t.test('ordinary success during observation does not revive membership progress', async (t) => {
      const f = await issuedAndCommitted(t);
      const read = async (query) => {
        const evidence = await f.port.readCommittedMembership(query);
        await settleOperation(f, true); return evidence;
      };
      assert.equal((await recordOutcome(f, {read})).outcome, 'conflict');
      assert.equal(f.row().message_group_learner_stamp, null);
    });
    await t.test('holder changes at the actual CAS cannot be overwritten', async (t) => {
      const f = await issuedAndCommitted(t);
      const execute = f.repository.executeOperationMutationWithRetry.bind(f.repository);
      let engaged = false;
      f.repository.executeOperationMutationWithRetry = async (sql, params, ...rest) => {
        if (!engaged && sql.includes('SET message_group_membership_phase')) {
          engaged = true; await renewMembershipHolder(f);
        }
        return execute(sql, params, ...rest);
      };
      assert.equal((await recordOutcome(f)).outcome, 'unknown',
        'losing exact holder CAS must not report recording');
      assert.equal(engaged, true, 'real learner-state CAS must engage');
      assert.equal(f.row().message_group_learner_stamp, null,
        'old holder must not overwrite the successor row');
    });
    await t.test('lost mutation answer is resolved from the exact durable row', async (t) => {
      const f = await issuedAndCommitted(t); const proposals = f.proposalCount();
      const execute = f.repository.executeOperationMutationWithRetry.bind(f.repository);
      let committed = false;
      f.repository.executeOperationMutationWithRetry = async (sql, params, ...rest) => {
        const result = await execute(sql, params, ...rest);
        if (sql.includes('SET message_group_membership_phase')) {
          committed = true; throw new Error('simulated lost committed answer');
        }
        return result;
      };
      assert.equal((await recordOutcome(f)).outcome, 'recorded');
      assert.equal(committed, true);
      assertNoProposal(f, proposals);
    });
    await t.test('unknown readback keeps debt and exact replay recovers without native redispatch', async (t) => {
      const f = await issuedAndCommitted(t); const proposals = f.proposalCount();
      const execute = f.repository.executeOperationMutationWithRetry.bind(f.repository);
      f.repository.executeOperationMutationWithRetry = async (sql, params, ...rest) => {
        const result = await execute(sql, params, ...rest);
        if (sql.includes('SET message_group_membership_phase')) f.failReads('replica_operations');
        return result;
      };
      assert.equal((await recordOutcome(f)).outcome, 'unknown',
        'unavailable authoritative readback must not report recording');
      assert.equal(f.row().message_group_membership_lane_key, `message-group:${GROUP}`);
      f.failReads(null); f.repository.executeOperationMutationWithRetry = execute;
      assert.equal((await recordOutcome(f, {read: () => {
        throw new Error('no new native action');
      }}))
        .outcome, 'recorded');
      assertNoProposal(f, proposals);
    });
    await t.test('failed write before commit is retriable but never inferred recorded', async (t) => {
      const f = await issuedAndCommitted(t); const before = f.row();
      const execute = f.repository.executeOperationMutationWithRetry.bind(f.repository);
      f.repository.executeOperationMutationWithRetry = async () => {
        throw new Error('write refused');
      };
      assert.equal((await recordOutcome(f)).outcome, 'unknown');
      assert.deepEqual(f.row(), before);
      f.repository.executeOperationMutationWithRetry = execute;
      assert.equal((await recordOutcome(f)).outcome, 'recorded');
    });
    await t.test('historical ADD after real removal cannot supply a learner stamp', async (t) => {
      const f = await issuedAndCommitted(t); const before = f.row();
      const transition = {...interveningLearnerTransition(f, TARGET),
        stage: portContract.RAFT_MEMBERSHIP_TRANSITION_STAGE.REMOVE, permitSequence: 2};
      const removed = await f.port.proposeMembershipTransition(transition);
      assert.equal(removed.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
      assert.ok(f.cluster.settle(() => FOUNDERS.every((id) =>
        !f.cluster.node(id).readStatus().confState.learners.includes(deriveRaftRsPeerId(TARGET)))));
      assert.equal((await readLearnerAction(f)).kind, 'committed-action', 'historical ADD remains real');
      assert.equal((await recordOutcome(f)).outcome, 'conflict',
        'historical ADD is not a present learner stamp or CREATE grant');
      assert.deepEqual(f.row(), before);
    });
  });
