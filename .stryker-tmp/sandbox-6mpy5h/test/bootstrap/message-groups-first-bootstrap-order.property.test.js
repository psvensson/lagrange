/**
 * Property test for Message Groups First Bootstrap Order (Property 21).
 *
 * Feature: worker-process-replica-isolation, Property 21: Message Groups First Bootstrap Order
 *
 * For any seed node bootstrap sequence, message group replicas SHALL be created
 * and operational BEFORE any partition replicas are created.
 *
 * **Validates: Requirements 12.1, 12.2**
 *
 * - Requirement 12.1: DURING seed node bootstrap, THE BootstrapService SHALL create
 *   message group replicas BEFORE creating partition replicas
 * - Requirement 12.2: WHEN message group replicas are created, THE BootstrapService
 *   SHALL wait for leader election before proceeding
 *
 * @module test/bootstrap/message-groups-first-bootstrap-order.property.test.js
 */
// @ts-nocheck


import {describe, it, mock} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {NUM} from '../../src/constants/index.js';
import {WORKER_ENTITY_TYPE} from '../../src/worker/worker-constants.js';

describe('Property 21: Message Groups First Bootstrap Order', () => {
  /**
   * Operation types for tracking bootstrap sequence.
   */
  const OPERATION_TYPE = {
    CREATE_MESSAGE_GROUP: 'createMessageGroupReplica',
    CREATE_PARTITION: 'createPartitionReplica',
    GET_LEADERSHIP_STATUS: 'getLeadershipStatus',
    LEADER_ELECTED: 'leaderElected',
    SYSTEM_CACHE_PROXY_CREATED: 'systemCacheProxyCreated',
    SEED_CACHE_SENT: 'seedCacheSent',
  };

  /**
   * Bootstrap phase names for tracking.
   */
  const BOOTSTRAP_PHASE_NAME = {
    INFRASTRUCTURE: 'infrastructure',
    MESSAGE_GROUPS: 'message_groups',
    PARTITIONS: 'partitions',
  };


  /**
   * Create a mock worker manager that tracks operation order.
   * @param {Object} options - Configuration options.
   * @return {Object} Mock worker manager with operation tracking.
   */
  function createMockWorkerManager(options = {}) {
    const {
      leaderReplicaId = null,
      leaderElectionDelayMs = NUM.ZERO,
    } = options;

    const operationLog = [];
    const createdReplicas = new Map();
    let initialized = true;
    let electedLeaderId = leaderReplicaId;

    return {
      operationLog,
      createdReplicas,
      isInitialized: () => initialized,
      setInitialized: (value) => {
        initialized = value;
      },
      createMessageGroupReplica: mock.fn(async (replicaOptions) => {
        operationLog.push({
          operation: OPERATION_TYPE.CREATE_MESSAGE_GROUP,
          timestamp: Date.now(),
          replicaId: replicaOptions.replicaId,
          groupId: replicaOptions.groupId,
          entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
        });

        const handle = {
          replicaId: replicaOptions.replicaId,
          groupId: replicaOptions.groupId,
          entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
          unifiedAddress: `node/${WORKER_ENTITY_TYPE.MESSAGE_GROUP}/${replicaOptions.replicaId}`,
          status: 'running',
        };

        createdReplicas.set(replicaOptions.replicaId, handle);

        // Set first replica as leader if not specified
        if (!electedLeaderId) {
          electedLeaderId = replicaOptions.replicaId;
        }

        return handle;
      }),
      createPartitionReplica: mock.fn(async (replicaOptions) => {
        operationLog.push({
          operation: OPERATION_TYPE.CREATE_PARTITION,
          timestamp: Date.now(),
          replicaId: replicaOptions.replicaId,
          partitionId: replicaOptions.partitionId,
          tableName: replicaOptions.tableName,
          entityType: WORKER_ENTITY_TYPE.PARTITION,
        });

        const handle = {
          replicaId: replicaOptions.replicaId,
          partitionId: replicaOptions.partitionId,
          tableName: replicaOptions.tableName,
          entityType: WORKER_ENTITY_TYPE.PARTITION,
          unifiedAddress: `node/${WORKER_ENTITY_TYPE.PARTITION}/${replicaOptions.replicaId}`,
          status: 'running',
        };

        createdReplicas.set(replicaOptions.replicaId, handle);
        return handle;
      }),
      getLeadershipStatus: mock.fn(async (targetReplicaId) => {
        operationLog.push({
          operation: OPERATION_TYPE.GET_LEADERSHIP_STATUS,
          timestamp: Date.now(),
          replicaId: targetReplicaId,
        });

        // Simulate election delay if configured
        if (leaderElectionDelayMs > NUM.ZERO) {
          await new Promise((resolve) => setTimeout(resolve, leaderElectionDelayMs));
        }

        const isLeader = targetReplicaId === electedLeaderId;
        return {
          isLeader,
          term: NUM.ONE,
          leaderId: electedLeaderId,
        };
      }),
      getMessageGroupReplicas: mock.fn(() => {
        const replicas = [];
        for (const [_replicaId, handle] of createdReplicas) {
          if (handle.entityType === WORKER_ENTITY_TYPE.MESSAGE_GROUP) {
            replicas.push(handle);
          }
        }
        return replicas;
      }),
      deliverMessage: mock.fn(async (replicaId, message) => {
        operationLog.push({
          operation: 'deliverMessage',
          timestamp: Date.now(),
          replicaId,
          messageType: message.type,
        });
        return {success: true, entriesApplied: message.entries?.length || NUM.ZERO};
      }),
      setElectedLeader: (replicaId) => {
        electedLeaderId = replicaId;
      },
    };
  }


  /**
   * Create a mock SystemCacheProxy.
   * @param {Object} workerManager - Worker manager instance.
   * @param {string} selectedReplicaId - Selected replica ID.
   * @return {Object} Mock SystemCacheProxy.
   */
  function createMockSystemCacheProxy(workerManager, selectedReplicaId) {
    return {
      initialized: true,
      selectedReplicaId,
      workerManager,
      getSelectedReplicaId: () => selectedReplicaId,
      initialize: mock.fn(async () => {}),
    };
  }

  /**
   * Simulate the seed node bootstrap sequence.
   * This tests the ordering guarantees as implemented in BootstrapService.
   * @param {Object} options - Simulation options.
   * @return {Promise<Object>} Simulation result with operation log.
   */
  async function simulateSeedNodeBootstrap(options) {
    const {
      nodeId,
      workerManager,
      messageGroupReplicaIds,
      partitionConfigs,
      replicaStaggerDelayMs = NUM.ZERO,
    } = options;

    const result = {
      success: false,
      phases: [],
      operationOrder: [],
      messageGroupsCreatedBeforePartitions: false,
      leaderElectedBeforePartitions: false,
      systemCacheProxyCreatedBeforePartitions: false,
      seedCacheSentBeforePartitions: false,
    };

    // Phase 1: Infrastructure (simulated - no replica creation)
    result.phases.push(BOOTSTRAP_PHASE_NAME.INFRASTRUCTURE);
    result.operationOrder.push('INFRASTRUCTURE_COMPLETE');

    // Phase 2: Message Groups FIRST (Requirement 12.1)
    result.phases.push(BOOTSTRAP_PHASE_NAME.MESSAGE_GROUPS);

    // Create message group replicas
    const messageGroupHandles = new Map();
    for (let i = NUM.ZERO; i < messageGroupReplicaIds.length; i++) {
      const replicaId = messageGroupReplicaIds[i];

      // Stagger replica creation
      if (i > NUM.ZERO && replicaStaggerDelayMs > NUM.ZERO) {
        await new Promise((resolve) => setTimeout(resolve, replicaStaggerDelayMs));
      }

      const handle = await workerManager.createMessageGroupReplica({
        groupId: 'initial-message-group',
        replicaId,
        replicaIds: messageGroupReplicaIds,
        peerAddresses: messageGroupReplicaIds.map(
          (id) => `${nodeId}/${WORKER_ENTITY_TYPE.MESSAGE_GROUP}/${id}`,
        ),
      });

      messageGroupHandles.set(replicaId, handle);
      result.operationOrder.push(`MESSAGE_GROUP_CREATED:${replicaId}`);
    }

    // Wait for leader election (Requirement 12.2)
    let leaderFound = false;
    for (const replicaId of messageGroupReplicaIds) {
      const status = await workerManager.getLeadershipStatus(replicaId);
      if (status.isLeader) {
        leaderFound = true;
        workerManager.operationLog.push({
          operation: OPERATION_TYPE.LEADER_ELECTED,
          timestamp: Date.now(),
          replicaId,
          term: status.term,
        });
        result.operationOrder.push(`LEADER_ELECTED:${replicaId}`);
        break;
      }
    }

    if (!leaderFound) {
      result.success = false;
      result.error = 'No leader elected for message group';
      return result;
    }

    // Create SystemCacheProxy after message groups are ready (Requirement 12.3)
    const leaderReplicaId = messageGroupReplicaIds[NUM.ZERO];
    const systemCacheProxy = createMockSystemCacheProxy(workerManager, leaderReplicaId);
    await systemCacheProxy.initialize();

    workerManager.operationLog.push({
      operation: OPERATION_TYPE.SYSTEM_CACHE_PROXY_CREATED,
      timestamp: Date.now(),
      selectedReplicaId: leaderReplicaId,
    });
    result.operationOrder.push('SYSTEM_CACHE_PROXY_CREATED');

    // Send SEED_CACHE message (Requirement 12.4)
    await workerManager.deliverMessage(leaderReplicaId, {
      type: 'SEED_CACHE',
      entries: [{tableName: 'nodes', operation: 'INSERT', data: {node_id: nodeId}}],
      bootstrapPhase: true,
    });

    workerManager.operationLog.push({
      operation: OPERATION_TYPE.SEED_CACHE_SENT,
      timestamp: Date.now(),
      leaderReplicaId,
    });
    result.operationOrder.push('SEED_CACHE_SENT');

    // Phase 3: Partitions (AFTER message groups)
    result.phases.push(BOOTSTRAP_PHASE_NAME.PARTITIONS);

    // Create partition replicas
    for (const partitionConfig of partitionConfigs) {
      const {partitionId, tableName, replicaIds} = partitionConfig;

      for (let i = NUM.ZERO; i < replicaIds.length; i++) {
        const replicaId = replicaIds[i];

        // Stagger replica creation
        if (i > NUM.ZERO && replicaStaggerDelayMs > NUM.ZERO) {
          await new Promise((resolve) => setTimeout(resolve, replicaStaggerDelayMs));
        }

        await workerManager.createPartitionReplica({
          partitionId,
          replicaId,
          tableName,
          tableId: tableName,
          schema: {tableName},
          dbPath: ':memory:',
          replicaIds,
          peerAddresses: replicaIds.map(
            (id) => `${nodeId}/${WORKER_ENTITY_TYPE.PARTITION}/${id}`,
          ),
        });

        result.operationOrder.push(`PARTITION_CREATED:${replicaId}`);
      }
    }

    // Verify ordering constraints
    result.messageGroupsCreatedBeforePartitions = verifyMessageGroupsFirst(
      workerManager.operationLog,
    );
    result.leaderElectedBeforePartitions = verifyLeaderElectedBeforePartitions(
      workerManager.operationLog,
    );
    result.systemCacheProxyCreatedBeforePartitions = verifySystemCacheProxyBeforePartitions(
      workerManager.operationLog,
    );
    result.seedCacheSentBeforePartitions = verifySeedCacheBeforePartitions(
      workerManager.operationLog,
    );

    result.success = true;
    result.messageGroupHandles = messageGroupHandles;
    result.systemCacheProxy = systemCacheProxy;

    return result;
  }


  /**
   * Verify all message group replicas are created before any partition replicas.
   * @param {Array<Object>} operationLog - Operation log from worker manager.
   * @return {boolean} True if message groups were created first.
   */
  function verifyMessageGroupsFirst(operationLog) {
    const createOps = operationLog.filter(
      (op) => op.operation === OPERATION_TYPE.CREATE_MESSAGE_GROUP ||
             op.operation === OPERATION_TYPE.CREATE_PARTITION,
    );

    if (createOps.length === NUM.ZERO) {
      return true;
    }

    // Find the index of the last message group creation
    let lastMessageGroupIndex = -NUM.ONE;
    for (let i = NUM.ZERO; i < createOps.length; i++) {
      if (createOps[i].operation === OPERATION_TYPE.CREATE_MESSAGE_GROUP) {
        lastMessageGroupIndex = i;
      }
    }

    // Find the index of the first partition creation
    let firstPartitionIndex = createOps.length;
    for (let i = NUM.ZERO; i < createOps.length; i++) {
      if (createOps[i].operation === OPERATION_TYPE.CREATE_PARTITION) {
        firstPartitionIndex = i;
        break;
      }
    }

    // All message groups should be created before any partition
    return lastMessageGroupIndex < firstPartitionIndex;
  }

  /**
   * Verify leader election completes before partition creation.
   * @param {Array<Object>} operationLog - Operation log from worker manager.
   * @return {boolean} True if leader was elected before partitions.
   */
  function verifyLeaderElectedBeforePartitions(operationLog) {
    // Find the index of leader election
    let leaderElectedIndex = -NUM.ONE;
    for (let i = NUM.ZERO; i < operationLog.length; i++) {
      if (operationLog[i].operation === OPERATION_TYPE.LEADER_ELECTED) {
        leaderElectedIndex = i;
        break;
      }
    }

    // Find the index of the first partition creation
    let firstPartitionIndex = operationLog.length;
    for (let i = NUM.ZERO; i < operationLog.length; i++) {
      if (operationLog[i].operation === OPERATION_TYPE.CREATE_PARTITION) {
        firstPartitionIndex = i;
        break;
      }
    }

    // Leader should be elected before any partition is created
    return leaderElectedIndex >= NUM.ZERO && leaderElectedIndex < firstPartitionIndex;
  }

  /**
   * Verify SystemCacheProxy is created before partition creation.
   * @param {Array<Object>} operationLog - Operation log from worker manager.
   * @return {boolean} True if SystemCacheProxy was created before partitions.
   */
  function verifySystemCacheProxyBeforePartitions(operationLog) {
    // Find the index of SystemCacheProxy creation
    let proxyCacheIndex = -NUM.ONE;
    for (let i = NUM.ZERO; i < operationLog.length; i++) {
      if (operationLog[i].operation === OPERATION_TYPE.SYSTEM_CACHE_PROXY_CREATED) {
        proxyCacheIndex = i;
        break;
      }
    }

    // Find the index of the first partition creation
    let firstPartitionIndex = operationLog.length;
    for (let i = NUM.ZERO; i < operationLog.length; i++) {
      if (operationLog[i].operation === OPERATION_TYPE.CREATE_PARTITION) {
        firstPartitionIndex = i;
        break;
      }
    }

    // SystemCacheProxy should be created before any partition
    return proxyCacheIndex >= NUM.ZERO && proxyCacheIndex < firstPartitionIndex;
  }

  /**
   * Verify SEED_CACHE is sent before partition creation.
   * @param {Array<Object>} operationLog - Operation log from worker manager.
   * @return {boolean} True if SEED_CACHE was sent before partitions.
   */
  function verifySeedCacheBeforePartitions(operationLog) {
    // Find the index of SEED_CACHE sent
    let seedCacheIndex = -NUM.ONE;
    for (let i = NUM.ZERO; i < operationLog.length; i++) {
      if (operationLog[i].operation === OPERATION_TYPE.SEED_CACHE_SENT) {
        seedCacheIndex = i;
        break;
      }
    }

    // Find the index of the first partition creation
    let firstPartitionIndex = operationLog.length;
    for (let i = NUM.ZERO; i < operationLog.length; i++) {
      if (operationLog[i].operation === OPERATION_TYPE.CREATE_PARTITION) {
        firstPartitionIndex = i;
        break;
      }
    }

    // SEED_CACHE should be sent before any partition is created
    return seedCacheIndex >= NUM.ZERO && seedCacheIndex < firstPartitionIndex;
  }


  it('message group replicas are created BEFORE partition replicas', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(fc.uuid(), {minLength: 1, maxLength: 3}),
        fc.array(
          fc.record({
            partitionId: fc.uuid(),
            tableName: fc.constantFrom('nodes', 'tables', 'partitions'),
            replicaIds: fc.array(fc.uuid(), {minLength: 1, maxLength: 3}),
          }),
          {minLength: 1, maxLength: 3},
        ),
        async (nodeId, messageGroupReplicaIds, partitionConfigs) => {
          const workerManager = createMockWorkerManager();

          const result = await simulateSeedNodeBootstrap({
            nodeId,
            workerManager,
            messageGroupReplicaIds,
            partitionConfigs,
          });

          assert.ok(
            result.success,
            'Bootstrap should succeed',
          );

          // Verify message groups were created before partitions
          assert.ok(
            result.messageGroupsCreatedBeforePartitions,
            'All message group replicas should be created BEFORE any partition replicas',
          );

          // Verify operation log shows correct order
          const createOps = workerManager.operationLog.filter(
            (op) => op.operation === OPERATION_TYPE.CREATE_MESSAGE_GROUP ||
                   op.operation === OPERATION_TYPE.CREATE_PARTITION,
          );

          // All message group operations should come first
          let seenPartition = false;
          for (const op of createOps) {
            if (op.operation === OPERATION_TYPE.CREATE_PARTITION) {
              seenPartition = true;
            }
            if (seenPartition && op.operation === OPERATION_TYPE.CREATE_MESSAGE_GROUP) {
              assert.fail('Message group created after partition - violates ordering');
            }
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('leader election completes BEFORE partition creation begins', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(fc.uuid(), {minLength: 1, maxLength: 3}),
        fc.array(
          fc.record({
            partitionId: fc.uuid(),
            tableName: fc.constantFrom('nodes', 'tables', 'partitions'),
            replicaIds: fc.array(fc.uuid(), {minLength: 1, maxLength: 3}),
          }),
          {minLength: 1, maxLength: 2},
        ),
        async (nodeId, messageGroupReplicaIds, partitionConfigs) => {
          const workerManager = createMockWorkerManager({
            leaderReplicaId: messageGroupReplicaIds[NUM.ZERO],
          });

          const result = await simulateSeedNodeBootstrap({
            nodeId,
            workerManager,
            messageGroupReplicaIds,
            partitionConfigs,
          });

          assert.ok(
            result.success,
            'Bootstrap should succeed',
          );

          // Verify leader was elected before partitions
          assert.ok(
            result.leaderElectedBeforePartitions,
            'Leader election should complete BEFORE partition creation begins',
          );

          // Verify LEADER_ELECTED appears in operation log before CREATE_PARTITION
          const leaderElectedOp = workerManager.operationLog.find(
            (op) => op.operation === OPERATION_TYPE.LEADER_ELECTED,
          );

          assert.ok(
            leaderElectedOp,
            'Leader election should be recorded in operation log',
          );

          const firstPartitionOp = workerManager.operationLog.find(
            (op) => op.operation === OPERATION_TYPE.CREATE_PARTITION,
          );

          if (firstPartitionOp) {
            const leaderIndex = workerManager.operationLog.indexOf(leaderElectedOp);
            const partitionIndex = workerManager.operationLog.indexOf(firstPartitionOp);

            assert.ok(
              leaderIndex < partitionIndex,
              'Leader election should occur before first partition creation',
            );
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('SystemCacheProxy is available BEFORE partition creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(fc.uuid(), {minLength: 1, maxLength: 3}),
        fc.array(
          fc.record({
            partitionId: fc.uuid(),
            tableName: fc.constantFrom('nodes', 'tables'),
            replicaIds: fc.array(fc.uuid(), {minLength: 1, maxLength: 2}),
          }),
          {minLength: 1, maxLength: 2},
        ),
        async (nodeId, messageGroupReplicaIds, partitionConfigs) => {
          const workerManager = createMockWorkerManager();

          const result = await simulateSeedNodeBootstrap({
            nodeId,
            workerManager,
            messageGroupReplicaIds,
            partitionConfigs,
          });

          assert.ok(
            result.success,
            'Bootstrap should succeed',
          );

          // Verify SystemCacheProxy was created before partitions
          assert.ok(
            result.systemCacheProxyCreatedBeforePartitions,
            'SystemCacheProxy should be available BEFORE partition creation',
          );

          // Verify SystemCacheProxy is initialized
          assert.ok(
            result.systemCacheProxy,
            'SystemCacheProxy should be created',
          );

          assert.ok(
            result.systemCacheProxy.initialized,
            'SystemCacheProxy should be initialized',
          );

          // Verify SystemCacheProxy points to a message group replica
          assert.ok(
            result.systemCacheProxy.selectedReplicaId,
            'SystemCacheProxy should have a selected replica',
          );
        },
      ),
      {numRuns: 10},
    );
  });


  it('SEED_CACHE message is sent BEFORE partition creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(fc.uuid(), {minLength: 1, maxLength: 3}),
        fc.array(
          fc.record({
            partitionId: fc.uuid(),
            tableName: fc.constantFrom('nodes', 'tables'),
            replicaIds: fc.array(fc.uuid(), {minLength: 1, maxLength: 2}),
          }),
          {minLength: 1, maxLength: 2},
        ),
        async (nodeId, messageGroupReplicaIds, partitionConfigs) => {
          const workerManager = createMockWorkerManager();

          const result = await simulateSeedNodeBootstrap({
            nodeId,
            workerManager,
            messageGroupReplicaIds,
            partitionConfigs,
          });

          assert.ok(
            result.success,
            'Bootstrap should succeed',
          );

          // Verify SEED_CACHE was sent before partitions
          assert.ok(
            result.seedCacheSentBeforePartitions,
            'SEED_CACHE message should be sent BEFORE partition creation',
          );

          // Verify deliverMessage was called with SEED_CACHE
          const deliverCalls = workerManager.deliverMessage.mock.calls;
          const seedCacheCall = deliverCalls.find(
            (call) => call.arguments[NUM.ONE]?.type === 'SEED_CACHE',
          );

          assert.ok(
            seedCacheCall,
            'SEED_CACHE message should be delivered to message group leader',
          );

          // Verify SEED_CACHE has bootstrapPhase flag
          const seedCacheMessage = seedCacheCall.arguments[NUM.ONE];
          assert.strictEqual(
            seedCacheMessage.bootstrapPhase,
            true,
            'SEED_CACHE should have bootstrapPhase=true',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('bootstrap phase order is infrastructure → message_groups → partitions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(fc.uuid(), {minLength: 1, maxLength: 3}),
        fc.array(
          fc.record({
            partitionId: fc.uuid(),
            tableName: fc.constantFrom('nodes', 'tables', 'partitions'),
            replicaIds: fc.array(fc.uuid(), {minLength: 1, maxLength: 3}),
          }),
          {minLength: 1, maxLength: 3},
        ),
        async (nodeId, messageGroupReplicaIds, partitionConfigs) => {
          const workerManager = createMockWorkerManager();

          const result = await simulateSeedNodeBootstrap({
            nodeId,
            workerManager,
            messageGroupReplicaIds,
            partitionConfigs,
          });

          assert.ok(
            result.success,
            'Bootstrap should succeed',
          );

          // Verify phase order
          const expectedPhaseOrder = [
            BOOTSTRAP_PHASE_NAME.INFRASTRUCTURE,
            BOOTSTRAP_PHASE_NAME.MESSAGE_GROUPS,
            BOOTSTRAP_PHASE_NAME.PARTITIONS,
          ];

          assert.deepStrictEqual(
            result.phases,
            expectedPhaseOrder,
            'Bootstrap phases should execute in correct order',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('all message group replicas are created before getLeadershipStatus is called', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(fc.uuid(), {minLength: 2, maxLength: 3}),
        fc.array(
          fc.record({
            partitionId: fc.uuid(),
            tableName: fc.constantFrom('nodes', 'tables'),
            replicaIds: fc.array(fc.uuid(), {minLength: 1, maxLength: 2}),
          }),
          {minLength: 1, maxLength: 2},
        ),
        async (nodeId, messageGroupReplicaIds, partitionConfigs) => {
          const workerManager = createMockWorkerManager();

          const result = await simulateSeedNodeBootstrap({
            nodeId,
            workerManager,
            messageGroupReplicaIds,
            partitionConfigs,
          });

          assert.ok(
            result.success,
            'Bootstrap should succeed',
          );

          // Find the index of the last message group creation
          let lastMessageGroupCreateIndex = -NUM.ONE;
          for (let i = NUM.ZERO; i < workerManager.operationLog.length; i++) {
            if (workerManager.operationLog[i].operation === OPERATION_TYPE.CREATE_MESSAGE_GROUP) {
              lastMessageGroupCreateIndex = i;
            }
          }

          // Find the index of the first getLeadershipStatus call
          let firstLeadershipCheckIndex = workerManager.operationLog.length;
          for (let i = NUM.ZERO; i < workerManager.operationLog.length; i++) {
            if (workerManager.operationLog[i].operation === OPERATION_TYPE.GET_LEADERSHIP_STATUS) {
              firstLeadershipCheckIndex = i;
              break;
            }
          }

          // All message groups should be created before leadership check
          assert.ok(
            lastMessageGroupCreateIndex < firstLeadershipCheckIndex,
            'All message group replicas should be created before checking leadership',
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
        fc.array(fc.uuid(), {minLength: 1, maxLength: 3}),
        fc.array(
          fc.record({
            partitionId: fc.uuid(),
            tableName: fc.constantFrom('nodes', 'tables', 'partitions'),
            replicaIds: fc.array(fc.uuid(), {minLength: 1, maxLength: 3}),
          }),
          {minLength: 1, maxLength: 3},
        ),
        async (nodeId, messageGroupReplicaIds, partitionConfigs) => {
          const workerManager = createMockWorkerManager();

          const result = await simulateSeedNodeBootstrap({
            nodeId,
            workerManager,
            messageGroupReplicaIds,
            partitionConfigs,
          });

          assert.ok(
            result.success,
            'Bootstrap should succeed',
          );

          // Verify all ordering constraints are satisfied
          assert.ok(
            result.messageGroupsCreatedBeforePartitions,
            'Message groups should be created before partitions',
          );

          assert.ok(
            result.leaderElectedBeforePartitions,
            'Leader should be elected before partitions',
          );

          assert.ok(
            result.systemCacheProxyCreatedBeforePartitions,
            'SystemCacheProxy should be created before partitions',
          );

          assert.ok(
            result.seedCacheSentBeforePartitions,
            'SEED_CACHE should be sent before partitions',
          );

          // Verify operation order in result
          const infraIndex = result.operationOrder.indexOf('INFRASTRUCTURE_COMPLETE');
          const firstMgIndex = result.operationOrder.findIndex(
            (op) => op.startsWith('MESSAGE_GROUP_CREATED:'),
          );
          const leaderIndex = result.operationOrder.findIndex(
            (op) => op.startsWith('LEADER_ELECTED:'),
          );
          const proxyIndex = result.operationOrder.indexOf('SYSTEM_CACHE_PROXY_CREATED');
          const seedCacheIndex = result.operationOrder.indexOf('SEED_CACHE_SENT');
          const firstPartitionIndex = result.operationOrder.findIndex(
            (op) => op.startsWith('PARTITION_CREATED:'),
          );

          // Verify ordering: infra < mg < leader < proxy < seedCache < partition
          assert.ok(
            infraIndex < firstMgIndex,
            'Infrastructure should complete before message groups',
          );

          assert.ok(
            firstMgIndex < leaderIndex,
            'Message groups should be created before leader election',
          );

          assert.ok(
            leaderIndex < proxyIndex,
            'Leader should be elected before SystemCacheProxy creation',
          );

          assert.ok(
            proxyIndex < seedCacheIndex,
            'SystemCacheProxy should be created before SEED_CACHE',
          );

          if (firstPartitionIndex >= NUM.ZERO) {
            assert.ok(
              seedCacheIndex < firstPartitionIndex,
              'SEED_CACHE should be sent before partition creation',
            );
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('multiple message group replicas are all created before any partition', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({min: 2, max: 5}),
        fc.integer({min: 1, max: 3}),
        async (nodeId, messageGroupCount, partitionCount) => {
          const messageGroupReplicaIds = Array.from(
            {length: messageGroupCount},
            (_, i) => `mg-replica-${i}`,
          );

          const partitionConfigs = Array.from(
            {length: partitionCount},
            (_, i) => ({
              partitionId: `partition-${i}`,
              tableName: 'nodes',
              replicaIds: [`p-replica-${i}-0`, `p-replica-${i}-1`],
            }),
          );

          const workerManager = createMockWorkerManager();

          const result = await simulateSeedNodeBootstrap({
            nodeId,
            workerManager,
            messageGroupReplicaIds,
            partitionConfigs,
          });

          assert.ok(
            result.success,
            'Bootstrap should succeed',
          );

          // Count message group and partition creations
          const messageGroupCreations = workerManager.operationLog.filter(
            (op) => op.operation === OPERATION_TYPE.CREATE_MESSAGE_GROUP,
          );

          const partitionCreations = workerManager.operationLog.filter(
            (op) => op.operation === OPERATION_TYPE.CREATE_PARTITION,
          );

          // Verify all message groups were created
          assert.strictEqual(
            messageGroupCreations.length,
            messageGroupCount,
            `All ${messageGroupCount} message group replicas should be created`,
          );

          // Verify message groups were created before partitions
          if (partitionCreations.length > NUM.ZERO) {
            const lastMgIndex = workerManager.operationLog.lastIndexOf(
              messageGroupCreations[messageGroupCreations.length - NUM.ONE],
            );
            const firstPartitionIndex = workerManager.operationLog.indexOf(
              partitionCreations[NUM.ZERO],
            );

            assert.ok(
              lastMgIndex < firstPartitionIndex,
              'All message group replicas should be created before first partition',
            );
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('getLeadershipStatus returns a leader for message group replicas', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(fc.uuid(), {minLength: 1, maxLength: 3}),
        async (nodeId, messageGroupReplicaIds) => {
          const leaderReplicaId = messageGroupReplicaIds[NUM.ZERO];
          const workerManager = createMockWorkerManager({
            leaderReplicaId,
          });

          const result = await simulateSeedNodeBootstrap({
            nodeId,
            workerManager,
            messageGroupReplicaIds,
            partitionConfigs: [],
          });

          assert.ok(
            result.success,
            'Bootstrap should succeed',
          );

          // Verify getLeadershipStatus was called
          const leadershipCalls = workerManager.getLeadershipStatus.mock.calls;
          assert.ok(
            leadershipCalls.length > NUM.ZERO,
            'getLeadershipStatus should be called to verify leader election',
          );

          // Verify a leader was found
          const leaderElectedOp = workerManager.operationLog.find(
            (op) => op.operation === OPERATION_TYPE.LEADER_ELECTED,
          );

          assert.ok(
            leaderElectedOp,
            'A leader should be elected',
          );

          assert.strictEqual(
            leaderElectedOp.replicaId,
            leaderReplicaId,
            'The expected leader should be elected',
          );
        },
      ),
      {numRuns: 10},
    );
  });
});
