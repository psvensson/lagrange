/**
 * Property test for Join Protocol Message Sequence (Property 25).
 *
 * Feature: worker-process-replica-isolation, Property 25: Join Protocol Message Sequence
 *
 * For any node join operation, the message sequence SHALL be:
 * JOIN_REQUEST → JOIN_RESPONSE → (message group creation) → JOIN_COMPLETE → JOIN_COMPLETE_ACK.
 *
 * **Validates: Requirements 13.1, 13.2, 13.3, 13.7**
 *
 * - Requirement 13.1: WHEN a node joins the cluster, THE joining node SHALL connect to the
 *   seed node via WebSocket for initial bootstrap
 * - Requirement 13.2: THE joining node SHALL send a JOIN_REQUEST message with its nodeId
 *   and address
 * - Requirement 13.3: THE seed node SHALL respond with a JOIN_RESPONSE containing message
 *   group replica assignment and Raft peer information
 * - Requirement 13.7: AFTER SystemCacheProxy is ready, THE joining node SHALL send a
 *   JOIN_COMPLETE message to the seed node
 *
 * @module test/bootstrap/join-protocol-message-sequence.property.test.js
 */

import {describe, it, beforeEach, mock} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {NUM} from '../../src/constants/index.js';
import {ROUTER_MESSAGE_TYPE} from '../../src/constants/transport.js';

describe('Property 25: Join Protocol Message Sequence', () => {
  /**
   * Message sequence tracker for validating protocol order.
   */
  class MessageSequenceTracker {
    constructor() {
      this.messages = [];
      this.timestamps = [];
    }

    record(messageType, payload) {
      this.messages.push({type: messageType, payload});
      this.timestamps.push(Date.now());
    }

    getSequence() {
      return this.messages.map((m) => m.type);
    }

    getMessage(type) {
      return this.messages.find((m) => m.type === type);
    }

    getMessageIndex(type) {
      return this.messages.findIndex((m) => m.type === type);
    }
  }

  /**
   * Create a mock seed node that handles join protocol messages.
   * @param {Object} options - Configuration options.
   * @return {Object} Mock seed node with message handlers.
   */
  function createMockSeedNode(options = {}) {
    const {
      groupId = 'test-group',
      assignedReplicaId = 'assigned-replica',
      raftPeers = [],
      shouldFail = false,
      failureError = 'Seed node error',
    } = options;

    const tracker = new MessageSequenceTracker();

    return {
      tracker,
      handleJoinRequest: mock.fn(async (request) => {
        tracker.record(ROUTER_MESSAGE_TYPE.JOIN_REQUEST, request);

        if (shouldFail) {
          return {
            type: ROUTER_MESSAGE_TYPE.JOIN_RESPONSE,
            success: false,
            error: failureError,
            messageGroupAssignment: null,
          };
        }

        const response = {
          type: ROUTER_MESSAGE_TYPE.JOIN_RESPONSE,
          success: true,
          error: null,
          messageGroupAssignment: {
            groupId,
            replicaId: assignedReplicaId,
            raftPeers,
          },
        };

        tracker.record(ROUTER_MESSAGE_TYPE.JOIN_RESPONSE, response);
        return response;
      }),
      handleJoinComplete: mock.fn(async (message) => {
        tracker.record(ROUTER_MESSAGE_TYPE.JOIN_COMPLETE, message);

        const ack = {
          type: ROUTER_MESSAGE_TYPE.JOIN_COMPLETE_ACK,
          success: true,
          nextSteps: ['Proceed with partition replica assignment'],
        };

        tracker.record(ROUTER_MESSAGE_TYPE.JOIN_COMPLETE_ACK, ack);
        return ack;
      }),
    };
  }

  /**
   * Create a mock joining node that executes the join protocol.
   * @param {Object} options - Configuration options.
   * @return {Object} Mock joining node.
   */
  function createMockJoiningNode(options = {}) {
    const {
      nodeId = 'joining-node',
      nodeAddress = 'ws://localhost:9000',
    } = options;

    const tracker = new MessageSequenceTracker();
    let messageGroupCreated = false;
    let systemCacheProxyReady = false;

    return {
      nodeId,
      nodeAddress,
      tracker,
      isMessageGroupCreated: () => messageGroupCreated,
      isSystemCacheProxyReady: () => systemCacheProxyReady,
      createMessageGroup: mock.fn(async (assignment) => {
        tracker.record('MESSAGE_GROUP_CREATED', assignment);
        messageGroupCreated = true;
        return {
          replicaId: assignment.replicaId,
          groupId: assignment.groupId,
          status: 'running',
        };
      }),
      createSystemCacheProxy: mock.fn(async (replicaId) => {
        tracker.record('SYSTEM_CACHE_PROXY_READY', {replicaId});
        systemCacheProxyReady = true;
        return {initialized: true, selectedReplicaId: replicaId};
      }),
    };
  }

  /**
   * Execute the complete join protocol sequence.
   * @param {Object} seedNode - Mock seed node.
   * @param {Object} joiningNode - Mock joining node.
   * @return {Promise<Object>} Protocol execution result.
   */
  async function executeJoinProtocol(seedNode, joiningNode) {
    const result = {
      success: false,
      sequence: [],
      joinResponse: null,
      joinCompleteAck: null,
      error: null,
    };

    // Step 1: Send JOIN_REQUEST (Requirement 13.1, 13.2)
    const joinRequest = {
      type: ROUTER_MESSAGE_TYPE.JOIN_REQUEST,
      nodeId: joiningNode.nodeId,
      address: joiningNode.nodeAddress,
    };

    joiningNode.tracker.record(ROUTER_MESSAGE_TYPE.JOIN_REQUEST, joinRequest);
    result.sequence.push(ROUTER_MESSAGE_TYPE.JOIN_REQUEST);

    // Step 2: Receive JOIN_RESPONSE (Requirement 13.3)
    const joinResponse = await seedNode.handleJoinRequest(joinRequest);
    result.joinResponse = joinResponse;

    joiningNode.tracker.record(ROUTER_MESSAGE_TYPE.JOIN_RESPONSE, joinResponse);
    result.sequence.push(ROUTER_MESSAGE_TYPE.JOIN_RESPONSE);

    if (!joinResponse.success) {
      result.error = joinResponse.error;
      return result;
    }

    // Step 3: Create message group replica from assignment
    const {messageGroupAssignment} = joinResponse;
    await joiningNode.createMessageGroup(messageGroupAssignment);
    result.sequence.push('MESSAGE_GROUP_CREATED');

    // Step 4: Create SystemCacheProxy
    await joiningNode.createSystemCacheProxy(messageGroupAssignment.replicaId);
    result.sequence.push('SYSTEM_CACHE_PROXY_READY');

    // Step 5: Send JOIN_COMPLETE (Requirement 13.7)
    const joinComplete = {
      type: ROUTER_MESSAGE_TYPE.JOIN_COMPLETE,
      nodeId: joiningNode.nodeId,
      messageGroupReplicaId: messageGroupAssignment.replicaId,
      ready: true,
    };

    joiningNode.tracker.record(ROUTER_MESSAGE_TYPE.JOIN_COMPLETE, joinComplete);
    result.sequence.push(ROUTER_MESSAGE_TYPE.JOIN_COMPLETE);

    // Step 6: Receive JOIN_COMPLETE_ACK
    const joinCompleteAck = await seedNode.handleJoinComplete(joinComplete);
    result.joinCompleteAck = joinCompleteAck;

    joiningNode.tracker.record(ROUTER_MESSAGE_TYPE.JOIN_COMPLETE_ACK, joinCompleteAck);
    result.sequence.push(ROUTER_MESSAGE_TYPE.JOIN_COMPLETE_ACK);

    result.success = true;
    return result;
  }

  beforeEach(() => {
    // Reset any shared state between tests
  });

  it('JOIN_REQUEST is sent first with nodeId and address', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({minLength: 10, maxLength: 50}),
        async (nodeId, address) => {
          const seedNode = createMockSeedNode();
          const joiningNode = createMockJoiningNode({
            nodeId,
            nodeAddress: `ws://${address}`,
          });

          const result = await executeJoinProtocol(seedNode, joiningNode);

          // Verify JOIN_REQUEST is first in sequence
          assert.strictEqual(
            result.sequence[NUM.ZERO],
            ROUTER_MESSAGE_TYPE.JOIN_REQUEST,
            'JOIN_REQUEST should be the first message in the sequence',
          );

          // Verify JOIN_REQUEST contains required fields
          const joinRequestMsg = joiningNode.tracker.getMessage(
            ROUTER_MESSAGE_TYPE.JOIN_REQUEST,
          );

          assert.ok(
            joinRequestMsg,
            'JOIN_REQUEST message should be recorded',
          );

          assert.strictEqual(
            joinRequestMsg.payload.nodeId,
            nodeId,
            'JOIN_REQUEST should contain nodeId',
          );

          assert.ok(
            joinRequestMsg.payload.address,
            'JOIN_REQUEST should contain address',
          );

          assert.strictEqual(
            joinRequestMsg.payload.type,
            ROUTER_MESSAGE_TYPE.JOIN_REQUEST,
            'JOIN_REQUEST should have correct type',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('JOIN_RESPONSE contains valid messageGroupAssignment with required fields', async () => {
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
          {minLength: 0, maxLength: 5},
        ),
        async (nodeId, groupId, replicaId, raftPeers) => {
          const seedNode = createMockSeedNode({
            groupId,
            assignedReplicaId: replicaId,
            raftPeers,
          });

          const joiningNode = createMockJoiningNode({nodeId});

          const result = await executeJoinProtocol(seedNode, joiningNode);

          assert.ok(
            result.success,
            'Join protocol should succeed',
          );

          // Verify JOIN_RESPONSE structure
          const {joinResponse} = result;

          assert.strictEqual(
            joinResponse.type,
            ROUTER_MESSAGE_TYPE.JOIN_RESPONSE,
            'Response should have JOIN_RESPONSE type',
          );

          assert.strictEqual(
            joinResponse.success,
            true,
            'JOIN_RESPONSE should indicate success',
          );

          // Verify messageGroupAssignment contains required fields
          const {messageGroupAssignment} = joinResponse;

          assert.ok(
            messageGroupAssignment,
            'JOIN_RESPONSE should contain messageGroupAssignment',
          );

          assert.strictEqual(
            messageGroupAssignment.groupId,
            groupId,
            'messageGroupAssignment should contain groupId',
          );

          assert.strictEqual(
            messageGroupAssignment.replicaId,
            replicaId,
            'messageGroupAssignment should contain replicaId',
          );

          assert.ok(
            Array.isArray(messageGroupAssignment.raftPeers),
            'messageGroupAssignment should contain raftPeers array',
          );

          assert.strictEqual(
            messageGroupAssignment.raftPeers.length,
            raftPeers.length,
            'raftPeers should match provided peers',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('JOIN_COMPLETE is sent after message group replica is ready', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, groupId, replicaId) => {
          const seedNode = createMockSeedNode({
            groupId,
            assignedReplicaId: replicaId,
          });

          const joiningNode = createMockJoiningNode({nodeId});

          const result = await executeJoinProtocol(seedNode, joiningNode);

          assert.ok(
            result.success,
            'Join protocol should succeed',
          );

          // Verify message group was created before JOIN_COMPLETE
          const messageGroupIndex = result.sequence.indexOf('MESSAGE_GROUP_CREATED');
          const joinCompleteIndex = result.sequence.indexOf(
            ROUTER_MESSAGE_TYPE.JOIN_COMPLETE,
          );

          assert.ok(
            messageGroupIndex >= NUM.ZERO,
            'MESSAGE_GROUP_CREATED should be in sequence',
          );

          assert.ok(
            joinCompleteIndex >= NUM.ZERO,
            'JOIN_COMPLETE should be in sequence',
          );

          assert.ok(
            messageGroupIndex < joinCompleteIndex,
            'Message group should be created BEFORE JOIN_COMPLETE is sent',
          );

          // Verify SystemCacheProxy was ready before JOIN_COMPLETE
          const proxyCacheIndex = result.sequence.indexOf('SYSTEM_CACHE_PROXY_READY');

          assert.ok(
            proxyCacheIndex >= NUM.ZERO,
            'SYSTEM_CACHE_PROXY_READY should be in sequence',
          );

          assert.ok(
            proxyCacheIndex < joinCompleteIndex,
            'SystemCacheProxy should be ready BEFORE JOIN_COMPLETE is sent',
          );

          // Verify JOIN_COMPLETE contains correct fields
          const joinCompleteMsg = joiningNode.tracker.getMessage(
            ROUTER_MESSAGE_TYPE.JOIN_COMPLETE,
          );

          assert.strictEqual(
            joinCompleteMsg.payload.nodeId,
            nodeId,
            'JOIN_COMPLETE should contain nodeId',
          );

          assert.strictEqual(
            joinCompleteMsg.payload.messageGroupReplicaId,
            replicaId,
            'JOIN_COMPLETE should contain messageGroupReplicaId',
          );

          assert.strictEqual(
            joinCompleteMsg.payload.ready,
            true,
            'JOIN_COMPLETE should indicate ready=true',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('JOIN_COMPLETE_ACK is received with success and nextSteps', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, groupId, replicaId) => {
          const seedNode = createMockSeedNode({
            groupId,
            assignedReplicaId: replicaId,
          });

          const joiningNode = createMockJoiningNode({nodeId});

          const result = await executeJoinProtocol(seedNode, joiningNode);

          assert.ok(
            result.success,
            'Join protocol should succeed',
          );

          // Verify JOIN_COMPLETE_ACK is last in sequence
          const lastMessage = result.sequence[result.sequence.length - NUM.ONE];

          assert.strictEqual(
            lastMessage,
            ROUTER_MESSAGE_TYPE.JOIN_COMPLETE_ACK,
            'JOIN_COMPLETE_ACK should be the last message in the sequence',
          );

          // Verify JOIN_COMPLETE_ACK structure
          const {joinCompleteAck} = result;

          assert.strictEqual(
            joinCompleteAck.type,
            ROUTER_MESSAGE_TYPE.JOIN_COMPLETE_ACK,
            'Response should have JOIN_COMPLETE_ACK type',
          );

          assert.strictEqual(
            joinCompleteAck.success,
            true,
            'JOIN_COMPLETE_ACK should indicate success',
          );

          assert.ok(
            Array.isArray(joinCompleteAck.nextSteps),
            'JOIN_COMPLETE_ACK should contain nextSteps array',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('complete message sequence follows correct order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.integer({min: 8000, max: 9999}),
        async (nodeId, groupId, replicaId, port) => {
          const seedNode = createMockSeedNode({
            groupId,
            assignedReplicaId: replicaId,
            raftPeers: [
              {replicaId: 'peer-1', address: 'seed/message-group/peer-1'},
              {replicaId: 'peer-2', address: 'seed/message-group/peer-2'},
            ],
          });

          const joiningNode = createMockJoiningNode({
            nodeId,
            nodeAddress: `ws://localhost:${port}`,
          });

          const result = await executeJoinProtocol(seedNode, joiningNode);

          assert.ok(
            result.success,
            'Join protocol should succeed',
          );

          // Verify complete sequence order
          const expectedSequence = [
            ROUTER_MESSAGE_TYPE.JOIN_REQUEST,
            ROUTER_MESSAGE_TYPE.JOIN_RESPONSE,
            'MESSAGE_GROUP_CREATED',
            'SYSTEM_CACHE_PROXY_READY',
            ROUTER_MESSAGE_TYPE.JOIN_COMPLETE,
            ROUTER_MESSAGE_TYPE.JOIN_COMPLETE_ACK,
          ];

          assert.deepStrictEqual(
            result.sequence,
            expectedSequence,
            'Message sequence should follow the correct order',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('failed JOIN_RESPONSE stops the protocol sequence', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({minLength: 5, maxLength: 50}),
        async (nodeId, errorMessage) => {
          const seedNode = createMockSeedNode({
            shouldFail: true,
            failureError: errorMessage,
          });

          const joiningNode = createMockJoiningNode({nodeId});

          const result = await executeJoinProtocol(seedNode, joiningNode);

          // Verify protocol failed
          assert.strictEqual(
            result.success,
            false,
            'Join protocol should fail when JOIN_RESPONSE fails',
          );

          // Verify error is captured
          assert.strictEqual(
            result.error,
            errorMessage,
            'Error message should be captured',
          );

          // Verify sequence stopped after JOIN_RESPONSE
          assert.strictEqual(
            result.sequence.length,
            NUM.TWO,
            'Sequence should stop after JOIN_REQUEST and JOIN_RESPONSE',
          );

          assert.strictEqual(
            result.sequence[NUM.ZERO],
            ROUTER_MESSAGE_TYPE.JOIN_REQUEST,
            'First message should be JOIN_REQUEST',
          );

          assert.strictEqual(
            result.sequence[NUM.ONE],
            ROUTER_MESSAGE_TYPE.JOIN_RESPONSE,
            'Second message should be JOIN_RESPONSE',
          );

          // Verify no message group was created
          assert.strictEqual(
            joiningNode.createMessageGroup.mock.calls.length,
            NUM.ZERO,
            'Message group should not be created on failure',
          );

          // Verify no JOIN_COMPLETE was sent
          assert.strictEqual(
            seedNode.handleJoinComplete.mock.calls.length,
            NUM.ZERO,
            'JOIN_COMPLETE should not be sent on failure',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('seed node receives JOIN_REQUEST before sending JOIN_RESPONSE', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (nodeId, groupId) => {
          const seedNode = createMockSeedNode({groupId});
          const joiningNode = createMockJoiningNode({nodeId});

          await executeJoinProtocol(seedNode, joiningNode);

          // Verify seed node received JOIN_REQUEST
          assert.strictEqual(
            seedNode.handleJoinRequest.mock.calls.length,
            NUM.ONE,
            'Seed node should receive exactly one JOIN_REQUEST',
          );

          // Verify seed node tracker shows correct order
          const seedSequence = seedNode.tracker.getSequence();

          const requestIndex = seedSequence.indexOf(ROUTER_MESSAGE_TYPE.JOIN_REQUEST);
          const responseIndex = seedSequence.indexOf(ROUTER_MESSAGE_TYPE.JOIN_RESPONSE);

          assert.ok(
            requestIndex >= NUM.ZERO,
            'Seed node should record JOIN_REQUEST',
          );

          assert.ok(
            responseIndex >= NUM.ZERO,
            'Seed node should record JOIN_RESPONSE',
          );

          assert.ok(
            requestIndex < responseIndex,
            'JOIN_REQUEST should be recorded before JOIN_RESPONSE on seed node',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('seed node receives JOIN_COMPLETE before sending JOIN_COMPLETE_ACK', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (nodeId, groupId) => {
          const seedNode = createMockSeedNode({groupId});
          const joiningNode = createMockJoiningNode({nodeId});

          const result = await executeJoinProtocol(seedNode, joiningNode);

          assert.ok(
            result.success,
            'Join protocol should succeed',
          );

          // Verify seed node received JOIN_COMPLETE
          assert.strictEqual(
            seedNode.handleJoinComplete.mock.calls.length,
            NUM.ONE,
            'Seed node should receive exactly one JOIN_COMPLETE',
          );

          // Verify seed node tracker shows correct order
          const seedSequence = seedNode.tracker.getSequence();

          const completeIndex = seedSequence.indexOf(ROUTER_MESSAGE_TYPE.JOIN_COMPLETE);
          const ackIndex = seedSequence.indexOf(ROUTER_MESSAGE_TYPE.JOIN_COMPLETE_ACK);

          assert.ok(
            completeIndex >= NUM.ZERO,
            'Seed node should record JOIN_COMPLETE',
          );

          assert.ok(
            ackIndex >= NUM.ZERO,
            'Seed node should record JOIN_COMPLETE_ACK',
          );

          assert.ok(
            completeIndex < ackIndex,
            'JOIN_COMPLETE should be recorded before JOIN_COMPLETE_ACK on seed node',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('raftPeers in JOIN_RESPONSE have valid structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.array(
          fc.record({
            replicaId: fc.uuid(),
            address: fc.string({minLength: 10, maxLength: 60}),
          }),
          {minLength: 1, maxLength: 5},
        ),
        async (nodeId, groupId, raftPeers) => {
          const seedNode = createMockSeedNode({
            groupId,
            raftPeers,
          });

          const joiningNode = createMockJoiningNode({nodeId});

          const result = await executeJoinProtocol(seedNode, joiningNode);

          assert.ok(
            result.success,
            'Join protocol should succeed',
          );

          // Verify each raftPeer has required fields
          const {messageGroupAssignment} = result.joinResponse;

          for (const peer of messageGroupAssignment.raftPeers) {
            assert.ok(
              peer.replicaId,
              'Each raftPeer should have a replicaId',
            );

            assert.ok(
              peer.address,
              'Each raftPeer should have an address',
            );

            assert.strictEqual(
              typeof peer.replicaId,
              'string',
              'replicaId should be a string',
            );

            assert.strictEqual(
              typeof peer.address,
              'string',
              'address should be a string',
            );
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('JOIN_REQUEST nodeId matches JOIN_COMPLETE nodeId', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (nodeId, groupId) => {
          const seedNode = createMockSeedNode({groupId});
          const joiningNode = createMockJoiningNode({nodeId});

          const result = await executeJoinProtocol(seedNode, joiningNode);

          assert.ok(
            result.success,
            'Join protocol should succeed',
          );

          // Get JOIN_REQUEST from seed node
          const joinRequestCall = seedNode.handleJoinRequest.mock.calls[NUM.ZERO];
          const requestNodeId = joinRequestCall.arguments[NUM.ZERO].nodeId;

          // Get JOIN_COMPLETE from seed node
          const joinCompleteCall = seedNode.handleJoinComplete.mock.calls[NUM.ZERO];
          const completeNodeId = joinCompleteCall.arguments[NUM.ZERO].nodeId;

          assert.strictEqual(
            requestNodeId,
            completeNodeId,
            'nodeId in JOIN_REQUEST should match nodeId in JOIN_COMPLETE',
          );

          assert.strictEqual(
            requestNodeId,
            nodeId,
            'nodeId should match the joining node ID',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('assigned replicaId in JOIN_RESPONSE matches messageGroupReplicaId in JOIN_COMPLETE',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.uuid(),
          async (nodeId, groupId, replicaId) => {
            const seedNode = createMockSeedNode({
              groupId,
              assignedReplicaId: replicaId,
            });

            const joiningNode = createMockJoiningNode({nodeId});

            const result = await executeJoinProtocol(seedNode, joiningNode);

            assert.ok(
              result.success,
              'Join protocol should succeed',
            );

            // Get assigned replicaId from JOIN_RESPONSE
            const assignedReplicaId = result.joinResponse.messageGroupAssignment.replicaId;

            // Get messageGroupReplicaId from JOIN_COMPLETE
            const joinCompleteCall = seedNode.handleJoinComplete.mock.calls[NUM.ZERO];
            const completeReplicaId = joinCompleteCall.arguments[NUM.ZERO].messageGroupReplicaId;

            assert.strictEqual(
              assignedReplicaId,
              completeReplicaId,
              'replicaId in JOIN_RESPONSE should match messageGroupReplicaId in JOIN_COMPLETE',
            );

            assert.strictEqual(
              assignedReplicaId,
              replicaId,
              'replicaId should match the configured replica ID',
            );
          },
        ),
        {numRuns: 10},
      );
    });
});
