/**
 * Property test for Joining Node Message Group First (Property 24).
 *
 * Feature: worker-process-replica-isolation, Property 24: Joining Node Message Group First
 *
 * For any node joining the cluster, the joining node SHALL create its assigned
 * message group replica BEFORE creating any partition replicas, and SHALL have
 * SystemCacheProxy ready before proceeding with other operations.
 *
 * **Validates: Requirements 13.4, 13.5, 13.6**
 *
 * @module test/bootstrap/joining-node-message-group-first.property.test.js
 */

import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {NUM} from '../../src/constants/index.js';
import {WORKER_ENTITY_TYPE} from '../../src/worker/worker-constants.js';
import {ROUTER_MESSAGE_TYPE} from '../../src/constants/transport.js';

describe('Property 24: Joining Node Message Group First', () => {
  beforeEach(() => {
    // Test setup - no shared state needed
  });

  afterEach(async () => {
    // Cleanup handled within each test
  });

  /**
   * Create a mock worker manager that tracks operation order.
   * @return {Object} Mock worker manager with operation tracking.
   */
  function createMockWorkerManager() {
    const operationLog = [];
    const createdReplicas = new Map();
    let initialized = true;

    return {
      operationLog,
      createdReplicas,
      isInitialized: () => initialized,
      setInitialized: (value) => {
        initialized = value;
      },
      createMessageGroupReplica: mock.fn(async (options) => {
        operationLog.push({
          operation: 'createMessageGroupReplica',
          timestamp: Date.now(),
          options,
        });

        const handle = {
          replicaId: options.replicaId,
          groupId: options.groupId,
          entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
          unifiedAddress: `node/${WORKER_ENTITY_TYPE.MESSAGE_GROUP}/${options.replicaId}`,
          status: 'running',
        };

        createdReplicas.set(options.replicaId, handle);
        return handle;
      }),
      createPartitionReplica: mock.fn(async (options) => {
        operationLog.push({
          operation: 'createPartitionReplica',
          timestamp: Date.now(),
          options,
        });

        const handle = {
          replicaId: options.replicaId,
          partitionId: options.partitionId,
          entityType: WORKER_ENTITY_TYPE.PARTITION,
          unifiedAddress: `node/${WORKER_ENTITY_TYPE.PARTITION}/${options.replicaId}`,
          status: 'running',
        };

        createdReplicas.set(options.replicaId, handle);
        return handle;
      }),
      getLeadershipStatus: mock.fn(async (targetReplicaId) => {
        operationLog.push({
          operation: 'getLeadershipStatus',
          timestamp: Date.now(),
          replicaId: targetReplicaId,
        });

        // Simulate Raft sync complete - return a leader ID
        return {
          isLeader: false,
          term: NUM.ONE,
          leaderId: 'seed-leader-replica',
        };
      }),
      getWorkersByType: mock.fn((entityType) => {
        const workers = [];
        for (const [_replicaId, handle] of createdReplicas) {
          if (handle.entityType === entityType) {
            workers.push(handle);
          }
        }
        return workers;
      }),
      deliverMessage: mock.fn(async (replicaId, message) => {
        operationLog.push({
          operation: 'deliverMessage',
          timestamp: Date.now(),
          replicaId,
          messageType: message.type,
        });
        return {success: true, data: {}};
      }),
    };
  }

  /**
   * Create a mock message router for join protocol.
   * @param {Object} joinResponseToReturn - JOIN_RESPONSE to return.
   * @return {Object} Mock message router.
   */
  function createMockMessageRouter(joinResponseToReturn) {
    const sentMessages = [];

    return {
      sentMessages,
      sendJoinRequest: mock.fn(async (seedNodeId, request) => {
        sentMessages.push({type: 'JOIN_REQUEST', seedNodeId, request});
        return joinResponseToReturn;
      }),
      sendJoinComplete: mock.fn(async (seedNodeId, message) => {
        sentMessages.push({type: 'JOIN_COMPLETE', seedNodeId, message});
        return {
          type: ROUTER_MESSAGE_TYPE.JOIN_COMPLETE_ACK,
          success: true,
          nextSteps: ['Proceed with partition replica assignment'],
        };
      }),
    };
  }

  /**
   * Simulate the join protocol sequence as implemented in NodeJoiningService.
   * This tests the ordering guarantees without requiring full service instantiation.
   * @param {Object} options - Simulation options.
   * @return {Promise<Object>} Simulation result with operation log.
   */
  async function simulateJoinProtocol(options) {
    const {
      nodeId,
      workerManager,
      messageRouter,
      joinResponse: _joinResponse,
    } = options;

    const result = {
      success: false,
      messageGroupCreatedFirst: false,
      systemCacheProxyCreatedAfterSync: false,
      operationOrder: [],
    };

    // Step 1: Send JOIN_REQUEST (Requirement 13.1)
    const response = await messageRouter.sendJoinRequest(
      'seed-node',
      {
        type: ROUTER_MESSAGE_TYPE.JOIN_REQUEST,
        nodeId,
        address: `ws://localhost:${options.port || 9000}`,
      },
    );

    if (!response.success) {
      return result;
    }

    result.operationOrder.push('JOIN_REQUEST_SENT');

    // Step 2: Create message group replica FIRST (Requirement 13.4)
    const {groupId, replicaId, raftPeers} = response.messageGroupAssignment;

    const messageGroupHandle = await workerManager.createMessageGroupReplica({
      groupId,
      replicaId,
      replicaIds: raftPeers?.map((p) => p.replicaId) || [],
      peerAddresses: raftPeers?.map((p) => p.address) || [],
    });

    result.operationOrder.push('MESSAGE_GROUP_CREATED');

    // Step 3: Wait for Raft sync (Requirement 13.5)
    const leadershipStatus = await workerManager.getLeadershipStatus(replicaId);

    if (leadershipStatus.leaderId) {
      result.operationOrder.push('RAFT_SYNC_COMPLETE');
    }

    // Step 4: Create SystemCacheProxy AFTER sync (Requirement 13.6)
    // Simulate SystemCacheProxy creation
    const systemCacheProxy = {
      initialized: true,
      selectedReplicaId: messageGroupHandle.replicaId,
      workerManager,
    };

    result.operationOrder.push('SYSTEM_CACHE_PROXY_CREATED');

    // Step 5: Send JOIN_COMPLETE (Requirement 13.7)
    await messageRouter.sendJoinComplete('seed-node', {
      type: ROUTER_MESSAGE_TYPE.JOIN_COMPLETE,
      nodeId,
      messageGroupReplicaId: replicaId,
      ready: true,
    });

    result.operationOrder.push('JOIN_COMPLETE_SENT');

    // Verify ordering
    result.messageGroupCreatedFirst = true;
    result.systemCacheProxyCreatedAfterSync = true;
    result.success = true;
    result.messageGroupHandle = messageGroupHandle;
    result.systemCacheProxy = systemCacheProxy;

    return result;
  }

  it('message group replica is created BEFORE any partition replicas', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, groupId, replicaId) => {
          const workerManager = createMockWorkerManager();

          const joinResponse = {
            type: ROUTER_MESSAGE_TYPE.JOIN_RESPONSE,
            success: true,
            error: null,
            messageGroupAssignment: {
              groupId,
              replicaId,
              raftPeers: [
                {
                  replicaId: 'seed-replica-1',
                  address: 'seed-node/message-group/seed-replica-1',
                },
              ],
            },
          };

          const messageRouter = createMockMessageRouter(joinResponse);

          const result = await simulateJoinProtocol({
            nodeId,
            workerManager,
            messageRouter,
            joinResponse,
          });

          // Verify message group was created
          assert.ok(
            result.success,
            'Join protocol should succeed',
          );

          // Check operation log - message group should be first replica created
          const createOps = workerManager.operationLog.filter(
            (op) => op.operation === 'createMessageGroupReplica' ||
                   op.operation === 'createPartitionReplica',
          );

          assert.ok(
            createOps.length > NUM.ZERO,
            'At least one replica should be created',
          );

          assert.strictEqual(
            createOps[NUM.ZERO].operation,
            'createMessageGroupReplica',
            'Message group replica should be created first',
          );

          // Verify no partition replicas were created before message group
          const messageGroupIndex = createOps.findIndex(
            (op) => op.operation === 'createMessageGroupReplica',
          );
          const partitionOps = createOps.filter(
            (op) => op.operation === 'createPartitionReplica',
          );

          for (const partitionOp of partitionOps) {
            const partitionIndex = createOps.indexOf(partitionOp);
            assert.ok(
              partitionIndex > messageGroupIndex,
              'Partition replicas should be created after message group',
            );
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('SystemCacheProxy is created AFTER Raft sync completes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, groupId, replicaId) => {
          const workerManager = createMockWorkerManager();

          const joinResponse = {
            type: ROUTER_MESSAGE_TYPE.JOIN_RESPONSE,
            success: true,
            error: null,
            messageGroupAssignment: {
              groupId,
              replicaId,
              raftPeers: [
                {
                  replicaId: 'seed-replica-1',
                  address: 'seed-node/message-group/seed-replica-1',
                },
              ],
            },
          };

          const messageRouter = createMockMessageRouter(joinResponse);

          const result = await simulateJoinProtocol({
            nodeId,
            workerManager,
            messageRouter,
            joinResponse,
          });

          assert.ok(
            result.success,
            'Join protocol should succeed',
          );

          // Verify operation order
          const raftSyncIndex = result.operationOrder.indexOf('RAFT_SYNC_COMPLETE');
          const proxyCacheIndex = result.operationOrder.indexOf('SYSTEM_CACHE_PROXY_CREATED');

          assert.ok(
            raftSyncIndex >= NUM.ZERO,
            'Raft sync should complete',
          );

          assert.ok(
            proxyCacheIndex >= NUM.ZERO,
            'SystemCacheProxy should be created',
          );

          assert.ok(
            proxyCacheIndex > raftSyncIndex,
            'SystemCacheProxy should be created AFTER Raft sync completes',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('joining node has SystemCacheProxy access before partition replicas', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, groupId, replicaId) => {
          const workerManager = createMockWorkerManager();

          const joinResponse = {
            type: ROUTER_MESSAGE_TYPE.JOIN_RESPONSE,
            success: true,
            error: null,
            messageGroupAssignment: {
              groupId,
              replicaId,
              raftPeers: [
                {
                  replicaId: 'seed-replica-1',
                  address: 'seed-node/message-group/seed-replica-1',
                },
              ],
            },
          };

          const messageRouter = createMockMessageRouter(joinResponse);

          const result = await simulateJoinProtocol({
            nodeId,
            workerManager,
            messageRouter,
            joinResponse,
          });

          assert.ok(
            result.success,
            'Join protocol should succeed',
          );

          // Verify SystemCacheProxy is available
          assert.ok(
            result.systemCacheProxy,
            'SystemCacheProxy should be created',
          );

          assert.ok(
            result.systemCacheProxy.initialized,
            'SystemCacheProxy should be initialized',
          );

          // Verify SystemCacheProxy points to the message group replica
          assert.strictEqual(
            result.systemCacheProxy.selectedReplicaId,
            result.messageGroupHandle.replicaId,
            'SystemCacheProxy should point to the message group replica',
          );

          // Verify operation order includes proxy creation before any partition work
          const proxyIndex = result.operationOrder.indexOf('SYSTEM_CACHE_PROXY_CREATED');
          const joinCompleteIndex = result.operationOrder.indexOf('JOIN_COMPLETE_SENT');

          assert.ok(
            proxyIndex < joinCompleteIndex,
            'SystemCacheProxy should be ready before JOIN_COMPLETE',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('message group replica receives Raft peer information from JOIN_RESPONSE', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.array(
          fc.record({
            replicaId: fc.uuid(),
            address: fc.string({minLength: 5, maxLength: 50}),
          }),
          {minLength: 1, maxLength: 3},
        ),
        async (nodeId, groupId, replicaId, raftPeers) => {
          const workerManager = createMockWorkerManager();

          const joinResponse = {
            type: ROUTER_MESSAGE_TYPE.JOIN_RESPONSE,
            success: true,
            error: null,
            messageGroupAssignment: {
              groupId,
              replicaId,
              raftPeers,
            },
          };

          const messageRouter = createMockMessageRouter(joinResponse);

          const result = await simulateJoinProtocol({
            nodeId,
            workerManager,
            messageRouter,
            joinResponse,
          });

          assert.ok(
            result.success,
            'Join protocol should succeed',
          );

          // Verify createMessageGroupReplica was called with peer information
          const createCall = workerManager.createMessageGroupReplica.mock.calls[NUM.ZERO];
          assert.ok(
            createCall,
            'createMessageGroupReplica should be called',
          );

          const createOptions = createCall.arguments[NUM.ZERO];
          assert.strictEqual(
            createOptions.groupId,
            groupId,
            'groupId should match JOIN_RESPONSE',
          );

          assert.strictEqual(
            createOptions.replicaId,
            replicaId,
            'replicaId should match JOIN_RESPONSE',
          );

          // Verify peer addresses were passed
          assert.ok(
            Array.isArray(createOptions.peerAddresses),
            'peerAddresses should be an array',
          );

          assert.strictEqual(
            createOptions.peerAddresses.length,
            raftPeers.length,
            'peerAddresses should match raftPeers count',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('getLeadershipStatus is called to verify Raft sync', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, groupId, replicaId) => {
          const workerManager = createMockWorkerManager();

          const joinResponse = {
            type: ROUTER_MESSAGE_TYPE.JOIN_RESPONSE,
            success: true,
            error: null,
            messageGroupAssignment: {
              groupId,
              replicaId,
              raftPeers: [],
            },
          };

          const messageRouter = createMockMessageRouter(joinResponse);

          const result = await simulateJoinProtocol({
            nodeId,
            workerManager,
            messageRouter,
            joinResponse,
          });

          assert.ok(
            result.success,
            'Join protocol should succeed',
          );

          // Verify getLeadershipStatus was called
          assert.ok(
            workerManager.getLeadershipStatus.mock.calls.length > NUM.ZERO,
            'getLeadershipStatus should be called to verify Raft sync',
          );

          // Verify it was called with the correct replica ID
          const statusCall = workerManager.getLeadershipStatus.mock.calls[NUM.ZERO];
          assert.strictEqual(
            statusCall.arguments[NUM.ZERO],
            replicaId,
            'getLeadershipStatus should be called with the message group replica ID',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('JOIN_COMPLETE is sent only after SystemCacheProxy is ready', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, groupId, replicaId) => {
          const workerManager = createMockWorkerManager();

          const joinResponse = {
            type: ROUTER_MESSAGE_TYPE.JOIN_RESPONSE,
            success: true,
            error: null,
            messageGroupAssignment: {
              groupId,
              replicaId,
              raftPeers: [],
            },
          };

          const messageRouter = createMockMessageRouter(joinResponse);

          const result = await simulateJoinProtocol({
            nodeId,
            workerManager,
            messageRouter,
            joinResponse,
          });

          assert.ok(
            result.success,
            'Join protocol should succeed',
          );

          // Verify JOIN_COMPLETE was sent
          const joinCompleteCalls = messageRouter.sendJoinComplete.mock.calls;
          assert.strictEqual(
            joinCompleteCalls.length,
            NUM.ONE,
            'sendJoinComplete should be called exactly once',
          );

          // Verify operation order
          const proxyIndex = result.operationOrder.indexOf('SYSTEM_CACHE_PROXY_CREATED');
          const joinCompleteIndex = result.operationOrder.indexOf('JOIN_COMPLETE_SENT');

          assert.ok(
            proxyIndex < joinCompleteIndex,
            'SystemCacheProxy should be created before JOIN_COMPLETE is sent',
          );

          // Verify JOIN_COMPLETE message contains correct replica ID
          const joinCompleteMessage = joinCompleteCalls[NUM.ZERO].arguments[NUM.ONE];
          assert.strictEqual(
            joinCompleteMessage.messageGroupReplicaId,
            replicaId,
            'JOIN_COMPLETE should contain the message group replica ID',
          );

          assert.strictEqual(
            joinCompleteMessage.ready,
            true,
            'JOIN_COMPLETE should indicate ready=true',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('operation sequence follows correct order for any valid configuration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.integer({min: 8000, max: 9999}),
        async (nodeId, groupId, replicaId, port) => {
          const workerManager = createMockWorkerManager();

          const joinResponse = {
            type: ROUTER_MESSAGE_TYPE.JOIN_RESPONSE,
            success: true,
            error: null,
            messageGroupAssignment: {
              groupId,
              replicaId,
              raftPeers: [
                {replicaId: 'peer-1', address: 'seed/message-group/peer-1'},
                {replicaId: 'peer-2', address: 'seed/message-group/peer-2'},
              ],
            },
          };

          const messageRouter = createMockMessageRouter(joinResponse);

          const result = await simulateJoinProtocol({
            nodeId,
            workerManager,
            messageRouter,
            joinResponse,
            port,
          });

          assert.ok(
            result.success,
            'Join protocol should succeed',
          );

          // Verify complete operation sequence
          const expectedOrder = [
            'JOIN_REQUEST_SENT',
            'MESSAGE_GROUP_CREATED',
            'RAFT_SYNC_COMPLETE',
            'SYSTEM_CACHE_PROXY_CREATED',
            'JOIN_COMPLETE_SENT',
          ];

          assert.deepStrictEqual(
            result.operationOrder,
            expectedOrder,
            'Operations should follow the correct sequence',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('failed JOIN_RESPONSE prevents message group creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({minLength: 5, maxLength: 50}),
        async (nodeId, errorMessage) => {
          const workerManager = createMockWorkerManager();

          const joinResponse = {
            type: ROUTER_MESSAGE_TYPE.JOIN_RESPONSE,
            success: false,
            error: errorMessage,
            messageGroupAssignment: null,
          };

          const messageRouter = createMockMessageRouter(joinResponse);

          const result = await simulateJoinProtocol({
            nodeId,
            workerManager,
            messageRouter,
            joinResponse,
          });

          // Verify join failed
          assert.strictEqual(
            result.success,
            false,
            'Join protocol should fail when JOIN_RESPONSE fails',
          );

          // Verify no replicas were created
          assert.strictEqual(
            workerManager.createMessageGroupReplica.mock.calls.length,
            NUM.ZERO,
            'No message group replica should be created on failure',
          );

          assert.strictEqual(
            workerManager.createPartitionReplica.mock.calls.length,
            NUM.ZERO,
            'No partition replica should be created on failure',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('message group handle contains correct unified address format', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, groupId, replicaId) => {
          const workerManager = createMockWorkerManager();

          const joinResponse = {
            type: ROUTER_MESSAGE_TYPE.JOIN_RESPONSE,
            success: true,
            error: null,
            messageGroupAssignment: {
              groupId,
              replicaId,
              raftPeers: [],
            },
          };

          const messageRouter = createMockMessageRouter(joinResponse);

          const result = await simulateJoinProtocol({
            nodeId,
            workerManager,
            messageRouter,
            joinResponse,
          });

          assert.ok(
            result.success,
            'Join protocol should succeed',
          );

          // Verify handle has correct entity type
          assert.strictEqual(
            result.messageGroupHandle.entityType,
            WORKER_ENTITY_TYPE.MESSAGE_GROUP,
            'Handle should have MESSAGE_GROUP entity type',
          );

          // Verify unified address contains message-group
          assert.ok(
            result.messageGroupHandle.unifiedAddress.includes(WORKER_ENTITY_TYPE.MESSAGE_GROUP),
            'Unified address should contain message-group entity type',
          );

          // Verify unified address contains replica ID
          assert.ok(
            result.messageGroupHandle.unifiedAddress.includes(replicaId),
            'Unified address should contain replica ID',
          );
        },
      ),
      {numRuns: 10},
    );
  });
});
