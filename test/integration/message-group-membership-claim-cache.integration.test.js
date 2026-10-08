/**
 * Actual SQL/Raft/CDC/SystemTableCache integration for claim and terminal abandonment.
 * Boots the seed, then joins the ordinary coordinator's shutdown before adding
 * a synthetic row. SQL, Raft, routing and CDC remain live until final teardown.
 * A real repository facade uses the issued boot and actual gateway/cache.
 * This intentionally isolates the write/visibility boundary: NOT full startup,
 * live reconciliation, founder admission, or physical membership acceptance.
 * All earlier founder-token and lease-interleaving failures remain evidence.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {performance} from 'node:perf_hooks';
import {NodeService} from '../../src/node/node-service.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {RAFT_MEMBERSHIP_TRANSITION_STAGE} from '../../src/raft/raft-operation-port-constants.js';
import {COMMITTED_MEMBERSHIP_STAMP_KIND} from '../../src/raft/raft-committed-membership-constants.js';
import {committedStampOfAnswer} from '../../src/raft/raft-committed-membership-stamp.js';
import {raftRsConfStateKey} from '../../src/raft/raft-rs-conf-state-key.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {TEST_CONFIG, createVirginSeedBootstrapService, initializeTestEnvironment,
  cleanupTestEnvironment, getUniquePort, gracefulShutdown,
  waitForPartitionLeaderElection} from './helpers/cluster-test-helpers.js';

const NODE = 'membership-claim-cache-seed';
const TABLE = 'replica_operations';

for (const settlement of [
  {status: ReplicaStatus.FAILED, step: WORKFLOW_STEP.FAILED},
  {status: ReplicaStatus.REMOVED, step: WORKFLOW_STEP.REMOVED},
]) {
  test(`repository claim and ${settlement.status} T1 boundary reach real SystemTableCache`,
    {timeout: 30000}, async () => {
      const started = performance.now();
      const timings = [];
      const mark = (phase) => timings.push({phase,
        elapsedMs: Math.round(performance.now() - started)});
      initializeTestEnvironment({nodeId: NODE});
      let bootstrap;
      let booted;
      let repository;
      try {
        const port = getUniquePort();
        bootstrap = await createVirginSeedBootstrapService({nodeId: NODE,
          nodeAddress: `ws://127.0.0.1:${port}`, wsPort: port,
          // Eliminate fixture per-replica pacing, not runtime election safety.
          config: {...TEST_CONFIG.bootstrap, replicaStaggerDelayMs: 0}});
        booted = await bootstrap.bootstrap();
        mark('bootstrap');
        assert.equal(booted?.success, true, JSON.stringify(booted?.error));
        assert.ok(await waitForPartitionLeaderElection(booted, bootstrap,
          'replica_operations-p1', 5000), 'real operation-table leader must exist');
        const cache = NodeService.getInstance().getSystemTableCache();
        const coordinator = bootstrap.rebalanceCoordinator;
        const gateway = coordinator?.controlPlaneSystemTableGateway;
        const cdc = bootstrap.cdcIntegrationService;
        assert.ok(gateway && cdc && cache, 'use existing production owners');
        assert.ok(Number.isSafeInteger(bootstrap.bootIncarnation) && bootstrap.bootIncarnation > 0);
        // The key lane alone does not own every ordinary lease touch. Join the
        // existing reconciliation lifecycle, rather than patching its decisions.
        // All SQL/Raft/CDC/cache observations below still use the live data path.
        await coordinator.shutdown();
        mark('coordinator-quiesced');
        assert.equal(coordinator.isShuttingDown, true);
        assert.equal(coordinator.initialized, false);
        const now = Date.now();
        const id = `cache-claim-${now}`;
        const group = `cache-visibility-fixture-${now}`;
        const source = `${group}-source`;
        const target = `${group}-target`;
        const sourceAttempt = `${id}-nonexecuting-source-fixture`;
        const identity = JSON.stringify({operationId: id, groupId: group,
          sourceReplicaId: source, sourceNodeId: NODE,
          sourceCreatedAt: now, sourceCreateAttemptToken: sourceAttempt,
          targetReplicaId: target, targetPeerId: deriveRaftRsPeerId(target),
          targetNodeId: NODE, targetAddress: `ws://127.0.0.1:${port}`,
          transitionIdentity: `${id}-transition`, membershipLaneKey: `message-group:${group}`});
        const sourceClaim = JSON.stringify({replicaId: source,
          createdAt: now, stateEnteredAt: now, createAttemptToken: sourceAttempt});
        repository = new ReplicaOperationRepository({nodeId: NODE,
          membershipOwnerBootIncarnation: bootstrap.bootIncarnation,
          systemTableCache: cache, cdcIntegrationService: cdc,
          controlPlaneSystemTableGateway: gateway, logger: coordinator.logger});
        // This tuple is a non-executing test row, never a physical CREATE grant.
        // No real founder generation or live coordinator binding is overwritten.
        await repository.persistNewOperation({operationId: id,
          type: OperationType.REPLACE, partitionId: group, entityId: group,
          entityType: SERVICE_TYPE.MESSAGE_GROUP, replicaId: target,
          sourceReplicaId: source, sourceNodeId: NODE, targetNodeId: NODE,
          status: ReplicaStatus.PENDING, workflowStep: WORKFLOW_STEP.PENDING,
          createdAt: now, updatedAt: now, completedAt: null, stepsHistory: [],
          membershipPublicationEpoch: 1,
          messageGroupMembershipLaneKey: `message-group:${group}`,
          messageGroupMembershipPhase: 'learner_requested',
          messageGroupMembershipObligationState: 'intent_recorded',
          messageGroupMembershipIdentity: identity,
          messageGroupSourceLifecycleClaim: sourceClaim,
          messageGroupMembershipOwnerClaim: null, messageGroupMembershipPermit: null,
          messageGroupLearnerStamp: null, messageGroupVoterStamp: null,
          messageGroupRemovalStamp: null});
        mark('operation-inserted');
        const nulled = await cdc.updateSystemTableRow(TABLE, {operation_id: id},
          {lease_expires_at: null});
        assert.equal(nulled.success, true, JSON.stringify(nulled));
        await cdc.waitForCacheUpdate(TABLE, id, true,
          {expectedFields: {operation_id: id, lease_expires_at: null,
            message_group_membership_identity: identity,
            message_group_membership_owner_claim: null}});
        mark('null-lease-visible');
        const before = cache.get(TABLE, id);
        assert.ok(before, 'the inserted operation must actually become visible');
        assert.equal(before.workflow_step, WORKFLOW_STEP.PENDING);
        assert.equal(before.status, ReplicaStatus.PENDING);
        assert.equal(before.lease_expires_at, null);
        assert.equal(before.message_group_membership_identity, identity);
        assert.equal(before.message_group_membership_owner_claim, null);
        const writes = [];
        const original = repository.executeOperationMutationWithRetry.bind(repository);
        repository.executeOperationMutationWithRetry = async (sql, params, ...rest) => {
          writes.push({sql, params});
          return original(sql, params, ...rest);
        };
        const claimed = await repository.claimMessageGroupMembershipOwner({operationId: id,
          identity, expectedClaim: null});
        mark('claim-returned');
        assert.equal(claimed.outcome, 'recorded', JSON.stringify(claimed));
        assert.equal(typeof claimed.claim, 'string');
        assert.ok(writes.some(({sql}) => sql.includes('lease_expires_at IS NULL')),
          'the actual NULL-lease mutation must engage');
        await cdc.waitForCacheUpdate(TABLE, id, true,
          {expectedFields: {message_group_membership_owner_claim: claimed.claim}});
        mark('claim-cache-visible');
        const visible = cache.get(TABLE, id);
        assert.equal(visible.message_group_membership_owner_claim, claimed.claim);
        for (const field of ['operation_id', 'replica_id', 'source_replica_id',
          'source_node_id', 'target_node_id', 'created_at', 'status', 'workflow_step',
          'lease_expires_at', 'message_group_membership_identity',
          'message_group_source_lifecycle_claim', 'message_group_membership_lane_key',
          'message_group_membership_permit']) {
          assert.equal(visible[field], before[field], `claim must preserve ${field}`);
        }
        // Supply the committed-learner basis as a synthetic row fixture only.
        // The real repository mutation below must travel SQL/Raft -> CDC -> cache;
        // this does not claim that a physical learner exists or may be removed.
        const holder = JSON.parse(claimed.claim);
        const peerOf = deriveRaftRsPeerId;
        const sourceOnly = {voters: [peerOf(source)], votersOutgoing: [],
          learners: [], learnersNext: [], autoLeave: false};
        const withLearner = {...sourceOnly, learners: [peerOf(target)]};
        const learnerStamp = {kind: COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED,
          voters: withLearner.voters, votersOutgoing: [], learners: withLearner.learners,
          learnersNext: [], appliedIndex: 6, commitIndex: 6,
          membershipGenerationIndex: 5, term: 3,
          configurationKey: raftRsConfStateKey(withLearner), leaderId: source,
          gateOpen: true, identities: {[peerOf(source)]: source, [peerOf(target)]: target}};
        assert.ok(committedStampOfAnswer(learnerStamp), 'typed supplied learner basis must validate');
        const prior = {version: 2, transitionIdentity: `${id}-transition`,
          permitSequence: 1, permitStage: RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER,
          permitState: 'committed', workflowOwnerNodeId: NODE,
          workflowOwnerFence: `${NODE}:${holder.ownerBootIncarnation}:${holder.generation}`,
          membershipLeaseExpiresAt: holder.expiresAt, proposerNodeId: NODE,
          proposerBootIncarnation: bootstrap.bootIncarnation, destinationNodeId: NODE,
          destinationBootIncarnation: bootstrap.bootIncarnation,
          replicaLifecycleIncarnation: `${id}-nonexecuting-runtime-fixture`, runtimeGeneration: 1,
          leaderTerm: 3, leaderConfigurationStamp: {
            configurationKey: raftRsConfStateKey(sourceOnly),
            membershipGenerationIndex: 1}, proposalIndex: 5,
          replicaIdentity: target, peerId: peerOf(target)};
        const learnerFields = {message_group_membership_phase: 'learner_committed',
          message_group_membership_obligation_state: 'unknown',
          message_group_membership_permit: JSON.stringify(prior),
          message_group_learner_stamp: JSON.stringify(learnerStamp)};
        assert.equal((await cdc.updateSystemTableRow(TABLE, {operation_id: id}, learnerFields))
          .success, true);
        await cdc.waitForCacheUpdate(TABLE, id, true, {expectedFields: learnerFields});
        const admitted = await repository.queryAuthoritativeOperationById(id);
        const completedAt = Date.now();
        const settled = await repository.persistOperationUpdate({...admitted,
          status: settlement.status, workflowStep: settlement.step,
          completedAt, updatedAt: completedAt}, {confirmPersistence: false,
          disableSystemWriteSession: true, returnDisposition: true,
          expectedWorkflowStep: WORKFLOW_STEP.PENDING, terminalTransition: true});
        assert.notEqual(settled?.persisted, false, JSON.stringify(settled));
        await cdc.waitForCacheUpdate(TABLE, id, true, {expectedFields: {
          status: settlement.status, workflow_step: settlement.step,
          completed_at: completedAt, ...learnerFields}});
        const terminalBefore = {...cache.get(TABLE, id)};
        const nextPermit = JSON.stringify({...prior, permitSequence: 2,
          permitStage: RAFT_MEMBERSHIP_TRANSITION_STAGE.REMOVE, permitState: 'in_flight',
          proposalIndex: null, leaderConfigurationStamp: {
            configurationKey: learnerStamp.configurationKey, membershipGenerationIndex: 5}});
        const input = {operationId: id, identity, priorPermit: JSON.stringify(prior),
          nextPermit, branch: 'abort_learner'};
        const writesBefore = writes.length;
        const selected = await repository.selectMessageGroupMembershipBranch(input);
        if (settlement.status === ReplicaStatus.REMOVED) {
          assert.equal(selected.outcome, 'conflict',
            'live successful replacement must never authorize target abandonment');
          assert.equal(writes.length, writesBefore, 'success refusal performs no membership write');
          const current = await repository.queryAuthoritativeOperationById(id);
          assert.equal(current.status, ReplicaStatus.REMOVED);
          assert.equal(current.workflowStep, WORKFLOW_STEP.REMOVED);
          assert.equal(current.messageGroupMembershipPermit, JSON.stringify(prior));
          assert.equal(current.messageGroupMembershipPhase, 'learner_committed');
          assert.equal(current.messageGroupMembershipLaneKey, `message-group:${group}`);
          assert.deepEqual(cache.get(TABLE, id), terminalBefore);
          assert.equal(cache.getAll('services').some((row) => row.group_id === group), false);
          mark('successful-replacement-protected');
          return;
        }
        assert.equal(selected.outcome, 'recorded', 'T1 must record exact terminal abandonment');
        assert.equal(writes.length, writesBefore + 1, 'one membership intent mutation');
        const mutation = writes[writesBefore];
        assert.ok(mutation.sql.includes('completed_at = ?'), 'exact terminal SQL arm must engage');
        assert.ok(mutation.sql.includes('message_group_membership_owner_claim = ?'));
        assert.ok(mutation.params.includes(completedAt));
        await cdc.waitForCacheUpdate(TABLE, id, true, {expectedFields: {
          message_group_membership_phase: 'target_removal_proposal_in_flight',
          message_group_membership_permit: nextPermit,
          message_group_membership_lane_key: `message-group:${group}`,
          status: ReplicaStatus.FAILED, completed_at: completedAt}});
        const terminalAfter = {...cache.get(TABLE, id)};
        assert.equal(terminalAfter.message_group_membership_permit, nextPermit);
        assert.equal(terminalAfter.message_group_membership_phase, 'target_removal_proposal_in_flight');
        const beforeHlc = HLCTimestamp.fromString(terminalBefore.updated_at_hlc);
        const afterHlc = HLCTimestamp.fromString(terminalAfter.updated_at_hlc);
        assert.equal(beforeHlc.toString(), terminalBefore.updated_at_hlc);
        assert.equal(afterHlc.toString(), terminalAfter.updated_at_hlc);
        assert.ok(afterHlc.compare(beforeHlc) > 0,
          'CDC must carry a newer origin HLC for the committed membership intent');
        for (const row of [terminalBefore, terminalAfter]) {
          delete row.updated_at_hlc;
          delete row.message_group_membership_phase;
          delete row.message_group_membership_permit;
        }
        assert.deepEqual(terminalAfter, terminalBefore,
          'the same cached terminal row retains ordinary state, holder, identity and debt');
        assert.equal((await repository.selectMessageGroupMembershipBranch(input)).outcome, 'recorded');
        assert.equal(writes.length, writesBefore + 1, 'replay grants no new write');
        mark('terminal-abandonment-cache-visible');
        assert.equal(cache.getAll(TABLE).filter((row) => row.operation_id === id).length, 1);
        assert.equal(cache.getAll('services').some((row) => row.group_id === group), false,
          'this visibility witness must not instantiate a physical source or target');
      } finally {
        repository?.markShuttingDown();
        mark('teardown-start');
        await gracefulShutdown(bootstrap, booted, null);
        mark('bootstrap-stopped');
        await cleanupTestEnvironment();
        mark('cleanup-complete');
        console.log(JSON.stringify({schema: 'membership-cache-timing/1',
          budgetMs: 30000, fixtureReplicaStaggerDelayMs: 0, timings}));
      }
    });
}
