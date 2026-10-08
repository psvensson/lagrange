/**
 * ReplicaOperationRepository -> production gateway/SQL/Raft -> SystemTableCache.
 * Boots a real seed with existing integration helpers. The repository's bound
 * boot comes from that boot owner, not a fabricated node row. No cache, CDC,
 * SQL or Raft result is substituted. This is a single-node integration, not
 * the physical off-seed FreshMG acceptance scenario.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {NodeService} from '../../src/node/node-service.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {TEST_CONFIG, createVirginSeedBootstrapService, initializeTestEnvironment,
  cleanupTestEnvironment, getUniquePort, gracefulShutdown,
  waitForPartitionLeaderElection} from './helpers/cluster-test-helpers.js';

const NODE = 'membership-claim-cache-seed';
const TABLE = 'replica_operations';
const READ = Object.freeze({authoritativeReadMode:
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED});

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
      const sources = await gateway.readAuthoritativeRows('services',
        'SELECT * FROM services WHERE node_id = ? AND service_type = ?',
        [NODE, SERVICE_TYPE.MESSAGE_GROUP], READ);
      assert.equal(sources.success, true, JSON.stringify(sources));
      const source = sources.rows.find((row) => typeof row.replica_id === 'string' &&
        typeof row.group_id === 'string' && row.group_id.length > 0);
      assert.ok(source, 'an actual booted group replica supplies source identity');
      assert.ok(Number.isSafeInteger(source.created_at) && source.created_at > 0);
      assert.equal(typeof source.create_attempt_token, 'string');
      assert.ok(source.create_attempt_token.length > 0);
      const now = Date.now();
      const id = `cache-claim-${now}`;
      const group = source.group_id;
      const target = `${group}-cache-proof-${now}`;
      const identity = JSON.stringify({operationId: id, groupId: group,
        sourceReplicaId: source.replica_id, sourceNodeId: NODE,
        sourceCreatedAt: source.created_at,
        sourceCreateAttemptToken: source.create_attempt_token,
        targetReplicaId: target, targetPeerId: deriveRaftRsPeerId(target),
        targetNodeId: NODE, targetAddress: `ws://127.0.0.1:${port}`,
        transitionIdentity: `${id}-transition`, membershipLaneKey: `message-group:${group}`});
      const sourceClaim = JSON.stringify({replicaId: source.replica_id,
        createdAt: source.created_at, stateEnteredAt: source.state_entered_at,
        createAttemptToken: source.create_attempt_token});
      repository = new ReplicaOperationRepository({nodeId: NODE,
        membershipOwnerBootIncarnation: bootstrap.bootIncarnation,
        systemTableCache: cache, cdcIntegrationService: cdc,
        controlPlaneSystemTableGateway: gateway,
        logger: bootstrap.rebalanceCoordinator.logger});
      // The production composition does not yet activate the membership driver.
      // Construct only its existing repository facade with the actual boot and
      // owner dependencies. Do not overwrite the live coordinator's bindings.
      await repository.persistNewOperation({operationId: id,
        type: OperationType.REPLACE, partitionId: group, entityId: group,
        entityType: SERVICE_TYPE.MESSAGE_GROUP, replicaId: target,
        sourceReplicaId: source.replica_id, sourceNodeId: NODE, targetNodeId: NODE,
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
      assert.ok(before, 'the initial canonical operation is actually visible');
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
      assert.equal(cache.getAll(TABLE).filter((row) => row.operation_id === id).length, 1,
        'a claim update must not duplicate or replace operation identity');
    } finally {
      repository?.markShuttingDown();
      await gracefulShutdown(bootstrap, booted, null);
      await cleanupTestEnvironment();
    }
  });
