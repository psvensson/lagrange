/**
 * Unit tests for JoinHandler - handles JOIN_REQUEST messages from joining nodes.
 * Tests task 18.2: Implement JOIN_REQUEST handler in seed node.
 *
 * Requirements: 13.2, 13.3
 * - 13.2: THE joining node SHALL send a JOIN_REQUEST message with its nodeId and address
 * - 13.3: THE seed node SHALL respond with a JOIN_RESPONSE containing message group
 *         replica assignment and Raft peer information
 */

import {test} from '../../src/test-helpers/tap.js';
import {JoinHandler} from '../../src/bootstrap/join-handler.js';
import {ROUTER_MESSAGE_TYPE} from '../../src/constants/transport.js';
import {INITIAL_MESSAGE_GROUP_ID} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Initialize configuration and logging for tests
const config = ConfigurationManager.getInstance();
config.initialize({});
const loggingService = LoggingService.getInstance();
if (!loggingService.isInitialized()) {
  loggingService.initialize({level: 'error'});
}

test('JoinHandler - handleJoinRequest returns valid JOIN_RESPONSE', async (t) => {
  const handler = new JoinHandler({
    nodeId: 'seed-node-1',
    nodeAddress: 'ws://localhost:8080',
    messageGroupServices: new Map(),
  });

  const request = {
    type: ROUTER_MESSAGE_TYPE.JOIN_REQUEST,
    nodeId: 'joining-node-1',
    address: 'ws://localhost:9000',
    capabilities: {},
  };

  const response = handler.handleJoinRequest(request);

  t.equal(response.type, ROUTER_MESSAGE_TYPE.JOIN_RESPONSE, 'should return JOIN_RESPONSE type');
  t.equal(response.success, true, 'should indicate success');
  t.equal(response.error, null, 'should have no error');
  t.ok(response.messageGroupAssignment, 'should have messageGroupAssignment');
  t.equal(
    response.messageGroupAssignment.groupId,
    INITIAL_MESSAGE_GROUP_ID,
    'should assign to initial message group',
  );
  t.ok(response.messageGroupAssignment.replicaId, 'should have replicaId');
  t.ok(Array.isArray(response.messageGroupAssignment.raftPeers), 'should have raftPeers array');

  t.end();
});

test('JoinHandler - handleJoinRequest rejects missing nodeId', async (t) => {
  const handler = new JoinHandler({
    nodeId: 'seed-node-1',
    nodeAddress: 'ws://localhost:8080',
  });

  const request = {
    type: ROUTER_MESSAGE_TYPE.JOIN_REQUEST,
    address: 'ws://localhost:9000',
  };

  const response = handler.handleJoinRequest(request);

  t.equal(response.type, ROUTER_MESSAGE_TYPE.JOIN_RESPONSE, 'should return JOIN_RESPONSE type');
  t.equal(response.success, false, 'should indicate failure');
  t.ok(response.error, 'should have error message');
  t.match(response.error, /nodeId/i, 'error should mention nodeId');
  t.equal(response.messageGroupAssignment, null, 'should have no assignment');

  t.end();
});

test('JoinHandler - handleJoinRequest rejects missing address', async (t) => {
  const handler = new JoinHandler({
    nodeId: 'seed-node-1',
    nodeAddress: 'ws://localhost:8080',
  });

  const request = {
    type: ROUTER_MESSAGE_TYPE.JOIN_REQUEST,
    nodeId: 'joining-node-1',
  };

  const response = handler.handleJoinRequest(request);

  t.equal(response.type, ROUTER_MESSAGE_TYPE.JOIN_RESPONSE, 'should return JOIN_RESPONSE type');
  t.equal(response.success, false, 'should indicate failure');
  t.ok(response.error, 'should have error message');
  t.match(response.error, /address/i, 'error should mention address');
  t.equal(response.messageGroupAssignment, null, 'should have no assignment');

  t.end();
});

test('JoinHandler - generates unique replica IDs for each request', async (t) => {
  const handler = new JoinHandler({
    nodeId: 'seed-node-1',
    nodeAddress: 'ws://localhost:8080',
  });

  const request1 = {
    type: ROUTER_MESSAGE_TYPE.JOIN_REQUEST,
    nodeId: 'joining-node-1',
    address: 'ws://localhost:9000',
  };

  const request2 = {
    type: ROUTER_MESSAGE_TYPE.JOIN_REQUEST,
    nodeId: 'joining-node-2',
    address: 'ws://localhost:9001',
  };

  const response1 = handler.handleJoinRequest(request1);
  const response2 = handler.handleJoinRequest(request2);

  t.ok(response1.success, 'first request should succeed');
  t.ok(response2.success, 'second request should succeed');
  t.not(
    response1.messageGroupAssignment.replicaId,
    response2.messageGroupAssignment.replicaId,
    'should generate different replica IDs',
  );

  t.end();
});

test('JoinHandler - buildRaftPeers returns seed node replicas when no services', async (t) => {
  const handler = new JoinHandler({
    nodeId: 'seed-node-1',
    nodeAddress: 'ws://localhost:8080',
    messageGroupServices: new Map(),
  });

  const request = {
    type: ROUTER_MESSAGE_TYPE.JOIN_REQUEST,
    nodeId: 'joining-node-1',
    address: 'ws://localhost:9000',
  };

  const response = handler.handleJoinRequest(request);

  t.ok(response.success, 'request should succeed');
  t.ok(response.messageGroupAssignment.raftPeers.length > 0, 'should have raft peers');

  // Verify peer addresses use unified format
  for (const peer of response.messageGroupAssignment.raftPeers) {
    t.ok(peer.replicaId, 'peer should have replicaId');
    t.ok(peer.address, 'peer should have address');
    t.match(peer.address, /\/message-group\//, 'address should use unified format');
  }

  t.end();
});

test('JoinHandler - buildRaftPeers uses message group services when available', async (t) => {
  const mockService1 = {
    nodeId: 'seed-node-1',
    groupId: INITIAL_MESSAGE_GROUP_ID,
  };
  const mockService2 = {
    nodeId: 'seed-node-1',
    groupId: INITIAL_MESSAGE_GROUP_ID,
  };

  const messageGroupServices = new Map([
    ['mg-1-r1', mockService1],
    ['mg-1-r2', mockService2],
  ]);

  const handler = new JoinHandler({
    nodeId: 'seed-node-1',
    nodeAddress: 'ws://localhost:8080',
    messageGroupServices,
  });

  const request = {
    type: ROUTER_MESSAGE_TYPE.JOIN_REQUEST,
    nodeId: 'joining-node-1',
    address: 'ws://localhost:9000',
  };

  const response = handler.handleJoinRequest(request);

  t.ok(response.success, 'request should succeed');
  t.equal(response.messageGroupAssignment.raftPeers.length, 2, 'should have 2 raft peers');

  t.end();
});

// Tests for handleJoinComplete - Requirement 13.7

test('JoinHandler - handleJoinComplete returns valid JOIN_COMPLETE_ACK', async (t) => {
  const handler = new JoinHandler({
    nodeId: 'seed-node-1',
    nodeAddress: 'ws://localhost:8080',
    messageGroupServices: new Map(),
  });

  const message = {
    type: ROUTER_MESSAGE_TYPE.JOIN_COMPLETE,
    nodeId: 'joining-node-1',
    messageGroupReplicaId: 'mg-1-r-abc12345',
    ready: true,
  };

  const response = handler.handleJoinComplete(message);

  t.equal(
    response.type,
    ROUTER_MESSAGE_TYPE.JOIN_COMPLETE_ACK,
    'should return JOIN_COMPLETE_ACK type',
  );
  t.equal(response.success, true, 'should indicate success');
  t.ok(Array.isArray(response.nextSteps), 'should have nextSteps array');
  t.ok(response.nextSteps.length > 0, 'should have at least one next step');

  t.end();
});

test('JoinHandler - handleJoinComplete rejects missing nodeId', async (t) => {
  const handler = new JoinHandler({
    nodeId: 'seed-node-1',
    nodeAddress: 'ws://localhost:8080',
  });

  const message = {
    type: ROUTER_MESSAGE_TYPE.JOIN_COMPLETE,
    messageGroupReplicaId: 'mg-1-r-abc12345',
    ready: true,
  };

  const response = handler.handleJoinComplete(message);

  t.equal(
    response.type,
    ROUTER_MESSAGE_TYPE.JOIN_COMPLETE_ACK,
    'should return JOIN_COMPLETE_ACK type',
  );
  t.equal(response.success, false, 'should indicate failure');
  t.ok(response.error, 'should have error message');
  t.match(response.error, /nodeId/i, 'error should mention nodeId');
  t.ok(Array.isArray(response.nextSteps), 'should have empty nextSteps array');
  t.equal(response.nextSteps.length, 0, 'nextSteps should be empty on error');

  t.end();
});

test('JoinHandler - handleJoinComplete rejects missing messageGroupReplicaId', async (t) => {
  const handler = new JoinHandler({
    nodeId: 'seed-node-1',
    nodeAddress: 'ws://localhost:8080',
  });

  const message = {
    type: ROUTER_MESSAGE_TYPE.JOIN_COMPLETE,
    nodeId: 'joining-node-1',
    ready: true,
  };

  const response = handler.handleJoinComplete(message);

  t.equal(
    response.type,
    ROUTER_MESSAGE_TYPE.JOIN_COMPLETE_ACK,
    'should return JOIN_COMPLETE_ACK type',
  );
  t.equal(response.success, false, 'should indicate failure');
  t.ok(response.error, 'should have error message');
  t.match(response.error, /messageGroupReplicaId/i, 'error should mention messageGroupReplicaId');

  t.end();
});

test('JoinHandler - handleJoinComplete rejects when ready is false', async (t) => {
  const handler = new JoinHandler({
    nodeId: 'seed-node-1',
    nodeAddress: 'ws://localhost:8080',
  });

  const message = {
    type: ROUTER_MESSAGE_TYPE.JOIN_COMPLETE,
    nodeId: 'joining-node-1',
    messageGroupReplicaId: 'mg-1-r-abc12345',
    ready: false,
  };

  const response = handler.handleJoinComplete(message);

  t.equal(
    response.type,
    ROUTER_MESSAGE_TYPE.JOIN_COMPLETE_ACK,
    'should return JOIN_COMPLETE_ACK type',
  );
  t.equal(response.success, false, 'should indicate failure');
  t.ok(response.error, 'should have error message');
  t.match(response.error, /not ready/i, 'error should mention not ready');

  t.end();
});

test('JoinHandler - handleJoinComplete nextSteps includes joining node info', async (t) => {
  const handler = new JoinHandler({
    nodeId: 'seed-node-1',
    nodeAddress: 'ws://localhost:8080',
  });

  const message = {
    type: ROUTER_MESSAGE_TYPE.JOIN_COMPLETE,
    nodeId: 'joining-node-1',
    messageGroupReplicaId: 'mg-1-r-abc12345',
    ready: true,
  };

  const response = handler.handleJoinComplete(message);

  t.ok(response.success, 'should succeed');

  // Verify nextSteps contains relevant information
  const nextStepsText = response.nextSteps.join(' ');
  t.match(nextStepsText, /joining-node-1/, 'nextSteps should mention the joining node');
  t.match(nextStepsText, /message group/i, 'nextSteps should mention message groups');

  t.end();
});
