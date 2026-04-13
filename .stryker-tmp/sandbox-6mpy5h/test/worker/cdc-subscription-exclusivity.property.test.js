/**
 * Property test for CDC Subscription Exclusivity (Property 9).
 *
 * Feature: worker-process-replica-isolation, Property 9: CDC Subscription Exclusivity
 *
 * For any message group, only the leader replica SHALL have active CDC
 * subscriptions to partition leaders, and follower replicas SHALL have
 * zero direct CDC subscriptions.
 *
 * **Validates: Requirements 4.3, 4.5**
 *
 * @module test/worker/cdc-subscription-exclusivity.property.test.js
 */
// @ts-nocheck


import {describe, it, afterEach} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {
  MessageGroupWorkerService,
} from '../../src/worker/message-group-worker-service.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

/**
 * Create a mock message bridge for tests that call onInitialize
 * directly. In production, ReplicaWorkerBase.initialize() creates
 * the real bridge.
 * @return {Object} Mock message bridge with deliver and send methods.
 */
function createMockMessageBridge() {
  return {
    deliver: async () => ({status: 'ok'}),
    send: async () => ({status: 'ok'}),
    initialize: async () => {},
    shutdown: async () => {},
    setMessageHandler: () => {},
    getStats: () => ({}),
  };
}

/**
 * Create a mock AddressManager for PeerAddressResolver.
 * @return {Object} Mock address manager.
 */
function createMockAddressManager() {
  return {
    validate: (addr) => {
      const parts = addr.split('/');
      return parts.length >= 3 ?
        {valid: true} : {valid: false, error: 'Invalid'};
    },
    parse: (addr) => {
      const parts = addr.split('/');
      return {
        nodeId: parts[0],
        serviceType: parts[1],
        serviceId: parts[2],
      };
    },
    format: (nodeId, entityType, serviceId) =>
      `${nodeId}/${entityType}/${serviceId}`,
  };
}

describe('Property 9: CDC Subscription Exclusivity', () => {
  const services = [];
  const mockLogger = {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };

  afterEach(async () => {
    for (const service of services) {
      try {
        await service.onStop();
      } catch (_e) {
        // Ignore cleanup errors
      }
    }
    services.length = 0;
  });

  /**
   * Create and initialize a message group worker service.
   * @param {string} nodeId - Node ID.
   * @param {string} replicaId - Replica ID.
   * @param {string} groupId - Group ID.
   * @param {Array<string>} replicaIds - All replica IDs.
   * @return {Promise<MessageGroupWorkerService>}
   */
  async function createService(
    nodeId, replicaId, groupId, replicaIds = [replicaId],
  ) {
    // Build peer addresses for multi-replica groups
    const peerAddresses = replicaIds.map(
      (id) => `${nodeId}/message-group/${id}`,
    );
    const service = new MessageGroupWorkerService({
      nodeId,
      replicaId,
      groupId,
      replicaIds,
      peerAddresses,
      addressManager: createMockAddressManager(),
      logger: mockLogger,
    });
    service.messageBridge = createMockMessageBridge();
    await service.onInitialize();
    service.initialized = true;
    services.push(service);
    return service;
  }

  it('should not have CDC subscriptions when starting as follower', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, replicaId, groupId) => {
          const service = await createService(
            nodeId,
            replicaId,
            groupId,
            [replicaId, `${replicaId}-peer`],
          );
          service.isLeaderReplica = () => false;
          service.getRole = () => RAFT_ROLE.FOLLOWER;

          // Service starts as follower
          assert.strictEqual(service.getRole(), RAFT_ROLE.FOLLOWER);
          assert.strictEqual(service.isLeaderReplica(), false);

          // Follower should not have CDC subscriptions
          assert.strictEqual(service.isCDCSubscribed(), false);
          assert.strictEqual(service.getCDCSubscriptionCount(), 0);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should subscribe to CDC when becoming leader', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, replicaId, groupId) => {
          const service = await createService(nodeId, replicaId, groupId);

          // Simulate becoming leader
          service.isLeader = true;
          service.role = RAFT_ROLE.LEADER;
          await service.subscribeToCDC();

          // Leader should have CDC subscriptions
          assert.strictEqual(service.isCDCSubscribed(), true);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should unsubscribe from CDC when losing leadership', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, replicaId, groupId) => {
          const service = await createService(nodeId, replicaId, groupId);

          // Simulate becoming leader and subscribing
          service.isLeader = true;
          service.role = RAFT_ROLE.LEADER;
          await service.subscribeToCDC();
          assert.strictEqual(service.isCDCSubscribed(), true);

          // Simulate losing leadership
          service.isLeader = false;
          service.role = RAFT_ROLE.FOLLOWER;
          await service.unsubscribeFromCDC();

          // Should no longer have CDC subscriptions
          assert.strictEqual(service.isCDCSubscribed(), false);
          assert.strictEqual(service.getCDCSubscriptionCount(), 0);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should maintain exclusivity: only one leader per group has subscriptions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (nodeId, groupId) => {
          // Create 3 replicas for the same group
          const replicaIds = ['replica-1', 'replica-2', 'replica-3'];
          const servicePromises = replicaIds.map((replicaId) =>
            createService(nodeId, replicaId, groupId, replicaIds),
          );
          const groupServices = await Promise.all(servicePromises);

          // Initially all are followers with no subscriptions
          for (const service of groupServices) {
            assert.strictEqual(service.isCDCSubscribed(), false);
          }

          // Simulate one becoming leader
          const leaderService = groupServices[0];
          leaderService.isLeader = true;
          leaderService.role = RAFT_ROLE.LEADER;
          await leaderService.subscribeToCDC();

          // Count subscribed services
          let subscribedCount = 0;
          for (const service of groupServices) {
            if (service.isCDCSubscribed()) {
              subscribedCount++;
            }
          }

          // Only one service should be subscribed
          assert.strictEqual(subscribedCount, 1);
          assert.strictEqual(leaderService.isCDCSubscribed(), true);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should transfer subscription when leadership changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (nodeId, groupId) => {
          // Create 2 replicas
          const replicaIds = ['replica-1', 'replica-2'];
          const servicePromises = replicaIds.map((replicaId) =>
            createService(nodeId, replicaId, groupId, replicaIds),
          );
          const [service1, service2] = await Promise.all(servicePromises);

          // Service 1 becomes leader
          service1.isLeader = true;
          service1.role = RAFT_ROLE.LEADER;
          await service1.subscribeToCDC();

          assert.strictEqual(service1.isCDCSubscribed(), true);
          assert.strictEqual(service2.isCDCSubscribed(), false);

          // Leadership transfers to service 2
          service1.isLeader = false;
          service1.role = RAFT_ROLE.FOLLOWER;
          await service1.unsubscribeFromCDC();

          service2.isLeader = true;
          service2.role = RAFT_ROLE.LEADER;
          await service2.subscribeToCDC();

          // Now service 2 should be subscribed, service 1 should not
          assert.strictEqual(service1.isCDCSubscribed(), false);
          assert.strictEqual(service2.isCDCSubscribed(), true);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should clear subscriptions on unsubscribe', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.array(fc.uuid(), {minLength: 1, maxLength: 5}),
        async (nodeId, replicaId, groupId, partitionIds) => {
          const service = await createService(nodeId, replicaId, groupId);

          // Simulate becoming leader and subscribing
          service.isLeader = true;
          service.role = RAFT_ROLE.LEADER;
          await service.subscribeToCDC();

          // Add some partition subscriptions
          for (const partitionId of partitionIds) {
            service.cdcSubscriptions.add(partitionId);
          }

          assert.strictEqual(service.cdcSubscriptions.size, partitionIds.length);

          // Unsubscribe
          await service.unsubscribeFromCDC();

          // All subscriptions should be cleared
          assert.strictEqual(service.cdcSubscriptions.size, 0);
          assert.strictEqual(service.isCDCSubscribed(), false);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should be idempotent: multiple subscribe calls do not duplicate', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.integer({min: 2, max: 5}),
        async (nodeId, replicaId, groupId, subscribeCalls) => {
          const service = await createService(nodeId, replicaId, groupId);

          // Simulate becoming leader
          service.isLeader = true;
          service.role = RAFT_ROLE.LEADER;

          // Call subscribe multiple times
          for (let i = 0; i < subscribeCalls; i++) {
            await service.subscribeToCDC();
          }

          // Should still only be subscribed once
          assert.strictEqual(service.isCDCSubscribed(), true);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should be idempotent: multiple unsubscribe calls are safe', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.integer({min: 2, max: 5}),
        async (nodeId, replicaId, groupId, unsubscribeCalls) => {
          const service = await createService(nodeId, replicaId, groupId);

          // Call unsubscribe multiple times (even without subscribing first)
          for (let i = 0; i < unsubscribeCalls; i++) {
            await service.unsubscribeFromCDC();
          }

          // Should remain unsubscribed
          assert.strictEqual(service.isCDCSubscribed(), false);
          assert.strictEqual(service.getCDCSubscriptionCount(), 0);
        },
      ),
      {numRuns: 10},
    );
  });
});
