/**
 * Connection record helpers for WebSocketTransport.
 */

import {
  CONNECTION_STATE,
  TRANSPORT_NUM,
} from '../constants/transport.js';

const ConnectionState = CONNECTION_STATE;

function createIncomingConnectionRecord(connectionId, ws) {
  return {
    connectionId,
    ws,
    state: ConnectionState.CONNECTED,
    nodeId: null,
    isIncoming: true,
    createdAt: Date.now(),
  };
}

function createOutgoingConnectionRecord({connectionId, nodeId, address}) {
  return {
    connectionId,
    nodeId,
    address,
    ws: null,
    state: ConnectionState.CONNECTING,
    reconnectAttempts: TRANSPORT_NUM.ZERO,
    isIncoming: false,
    createdAt: Date.now(),
  };
}

function findConnectedConnection(connections) {
  for (const [, connection] of connections) {
    if (connection.state === ConnectionState.CONNECTED) {
      return connection;
    }
  }
  return null;
}

function buildConnectionStats(connections) {
  const connectionStats = {};
  for (const [nodeId, connection] of connections) {
    connectionStats[nodeId] = {
      state: connection.state,
      isIncoming: connection.isIncoming,
      reconnectAttempts: connection.reconnectAttempts,
    };
  }
  return connectionStats;
}

function buildTransportStats({
  transportId,
  localNodeId,
  localAddress,
  initialized,
  messageCount,
  pendingMessageCount,
  connections,
  connectedNodeCount,
}) {
  return {
    transportId,
    localNodeId,
    localAddress,
    initialized,
    messageCount,
    pendingMessages: pendingMessageCount,
    connections: buildConnectionStats(connections),
    connectedNodes: connectedNodeCount,
  };
}

export {
  buildTransportStats,
  createIncomingConnectionRecord,
  createOutgoingConnectionRecord,
  findConnectedConnection,
};
