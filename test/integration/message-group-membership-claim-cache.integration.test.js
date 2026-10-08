/**
 * ReplicaOperationRepository -> production gateway/SQL/Raft -> SystemTableCache.
 * Real issued seed boot, gateway, SQL, Raft and CDC; no result is substituted.
 * An explicitly synthetic, non-executing operation row is inserted through the
 * real repository to isolate cache propagation. Its source tuple is a fixture,
 * NOT a physical CREATE grant or proof that the planner admits a founder.
 * The earlier founder-token failure remains a separate admission finding.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {NodeService} from '../../src/node/node-service.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {TEST_CONFIG, createVirginSeedBootstrapService, initializeTestEnvironment,
  cleanupTestEnvironment, getUniquePort, gracefulShutdown,
  waitForPartitionLeaderElection} from './helpers/cluster-test-helpers.js';

const NODE = 'membership-claim-cache-seed';
const TABLE = 'replica_operations';

test('repository NULL-lease claim becomes visible through real SystemTableCache',
  {timeout: 120000}, async () => {
    initializeTestEnvironment({nodeId: NODE});
    let bootstrap;
    let booted;
    let repository;
    try {
      const port = getUniquePort();
      bootstrap = await createVirginSeedBootstrapService({nodeId: NODE,
        nodeAddress: `ws://127.0.0.1:${port}`, wsPort: port,
        config: TEST_CONFIG.bootstrap});
      booted = await bootstrap.bootstrap();
      assert.equal(booted?.success, true, JSON.stringify(booted?.error));
      assert.ok(await waitForPartitionLeaderElection(booted, bootstrap,
        'replica_operations-p1', 5000), 'real operation-table leader must exist');
      const cache = NodeService.getInstance().getSystemTableCache();
      const gateway = bootstrap.rebalanceCoordinator?.controlPlaneSystemTableGateway;
      const cdc = bootstrap.cdcIntegrationService;
      assert.ok(gateway && cdc && cache, 'use existing production owners');
      assert.ok(Number.isSafeInteger(bootstrap.bootIncarnation) && bootstrap.bootIncarnation > 0);
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
        controlPlaneSystemTableGateway: gateway,
        logger: bootstrap.rebalanceCoordinator.logger});
      // The current composition does not activate this membership driver.
      // Use a row-only fixture in an otherwise nonexistent group. Never change
      // a real founder generation or pass fixture tokens to a physical handler.
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
      const nulled = await cdc.updateSystemTableRow(TABLE, {operation_id: id},
        {lease_expires_at: null});
      assert.equal(nulled.success, true, JSON.stringify(nulled));
      await cdc.waitForCacheUpdate(TABLE, id, true,
        {expectedFields: {operation_id: id, lease_expires_at: null,
          message_group_membership_identity: identity,
          message_group_membership_owner_claim: null}});
      const before = cache.get(TABLE, id);
      assert.ok(before, 'the inserted operation must actually become visible');
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
      assert.equal(claimed.outcome, 'recorded', JSON.stringify(claimed));
      assert.equal(typeof claimed.claim, 'string', 'an exact committed claim was returned');
      assert.ok(writes.some(({sql}) => sql.includes('lease_expires_at IS NULL')),
        'the real NULL-lease mutation, not a renewed-lease alternative, must engage');
      await cdc.waitForCacheUpdate(TABLE, id, true,
        {expectedFields: {message_group_membership_owner_claim: claimed.claim}});
      const visible = cache.get(TABLE, id);
      assert.equal(visible.message_group_membership_owner_claim, claimed.claim);
      for (const field of ['operation_id', 'replica_id', 'source_replica_id',
        'source_node_id', 'target_node_id', 'created_at',
        'message_group_membership_identity', 'message_group_source_lifecycle_claim',
        'message_group_membership_lane_key', 'message_group_membership_permit']) {
        assert.equal(visible[field], before[field], `claim must preserve ${field}`);
      }
      assert.equal(cache.getAll(TABLE).filter((row) => row.operation_id === id).length, 1);
      assert.equal(cache.getAll('services').some((row) => row.group_id === group), false,
        'this fixture never instantiates a physical source or target');
    } finally {
      repository?.markShuttingDown();
      await gracefulShutdown(bootstrap, booted, null);
      await cleanupTestEnvironment();
    }
  });
