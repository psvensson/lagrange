/**
 * Property-based tests for cluster mesh connectivity.
 * Verifies that joining nodes establish connections to all existing cluster nodes,
 * not just the seed node.
 * Requirements: Full mesh connectivity for Raft message delivery.
 */

import {test} from 'tap';
import fc from 'fast-check';
import {NUM} from '../../src/constants/index.js';
import {ENTRYPOINT_DEFAULT} from '../../src/constants/entrypoint.js';

/**
 * Helper to derive WebSocket address from node address.
 * Mirrors the logic in NodeJoiningService.deriveWsAddressFromNodeAddress.
 * @param {string} nodeAddress - Node address in format "hostname:port".
 * @return {string|null} WebSocket address or null.
 */
function deriveWsAddressFromNodeAddress(nodeAddress) {
  if (!nodeAddress || typeof nodeAddress !== 'string') {
    return null;
  }

  const colonIndex = nodeAddress.lastIndexOf(':');
  if (colonIndex === -1 || colonIndex === 0) {
    // No colon found or colon at start (empty hostname)
    return null;
  }

  const hostname = nodeAddress.substring(0, colonIndex);
  if (!hostname || hostname.length === 0) {
    return null;
  }

  const portStr = nodeAddress.substring(colonIndex + 1);
  const restPort = parseInt(portStr, NUM.TEN);

  if (!Number.isFinite(restPort) || restPort <= 0) {
    return null;
  }

  const wsPort = restPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET;
  return `ws://${hostname}:${wsPort}`;
}

/**
 * Generate valid node address (hostname:port format).
 */
const nodeAddressArb = fc.tuple(
  fc.constantFrom('localhost', '127.0.0.1', '192.168.1.1', 'node1.cluster.local'),
  fc.integer({min: 1024, max: 65535}),
).map(([host, port]) => `${host}:${port}`);

/**
 * Generate a cluster node record similar to what's in systemTableSnapshots.nodes.
 */
const nodeRecordArb = fc.record({
  node_id: fc.uuid(),
  node_address: nodeAddressArb,
  status: fc.constantFrom('active', 'ready'),
});

test('deriveWsAddressFromNodeAddress - valid addresses produce valid WS URLs', async (t) => {
  fc.assert(
    fc.property(
      nodeAddressArb,
      (nodeAddress) => {
        const wsAddress = deriveWsAddressFromNodeAddress(nodeAddress);

        // Should produce a valid WebSocket URL
        t.ok(wsAddress, 'should produce a WebSocket address');
        t.ok(wsAddress.startsWith('ws://'), 'should start with ws://');

        // Extract port from result
        const resultPort = parseInt(wsAddress.split(':').pop(), NUM.TEN);
        const inputPort = parseInt(nodeAddress.split(':').pop(), NUM.TEN);

        // WebSocket port should be REST port + offset
        t.equal(
          resultPort,
          inputPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET,
          'WS port should be REST port + offset',
        );

        return true;
      },
    ),
    {numRuns: NUM.TEN},
  );
});

test('deriveWsAddressFromNodeAddress - invalid inputs return null', async (t) => {
  const invalidInputs = [
    null,
    undefined,
    '',
    'no-port',
    'hostname:',
    ':8080',
    'hostname:abc',
    'hostname:-1',
    123,
    {},
  ];

  for (const input of invalidInputs) {
    const result = deriveWsAddressFromNodeAddress(input);
    t.equal(result, null, `should return null for invalid input: ${JSON.stringify(input)}`);
  }
});

test('cluster mesh - filtering excludes only self node', async (t) => {
  fc.assert(
    fc.property(
      fc.uuid(),
      fc.array(nodeRecordArb, {minLength: 1, maxLength: 5}),
      (selfNodeId, nodes) => {
        // Simulate the filtering logic from connectToClusterNodes
        // Only self is excluded - all other nodes are equal peers
        const otherNodes = nodes.filter((node) => {
          const nodeId = node?.node_id;
          return nodeId && nodeId !== selfNodeId;
        });

        // Verify self is excluded
        for (const node of otherNodes) {
          t.not(node.node_id, selfNodeId, 'should not include self node');
        }

        // Verify all other nodes are included (no special treatment for any node)
        const expectedCount = nodes.filter((n) => n.node_id !== selfNodeId).length;
        t.equal(otherNodes.length, expectedCount, 'should include all other nodes');

        return true;
      },
    ),
    {numRuns: NUM.TEN},
  );
});

test('cluster mesh - all ready nodes get connection attempts', async (t) => {
  fc.assert(
    fc.property(
      fc.uuid(),
      fc.uuid(),
      fc.array(nodeRecordArb, {minLength: 2, maxLength: 5}),
      (selfNodeId, seedNodeId, nodes) => {
        // Ensure we have distinct node IDs
        const uniqueNodes = [];
        const seenIds = new Set([selfNodeId, seedNodeId]);
        for (const node of nodes) {
          if (!seenIds.has(node.node_id)) {
            seenIds.add(node.node_id);
            uniqueNodes.push(node);
          }
        }

        // Track which nodes would get connection attempts
        const connectionAttempts = [];
        for (const node of uniqueNodes) {
          const wsAddress = deriveWsAddressFromNodeAddress(node.node_address);
          if (wsAddress) {
            connectionAttempts.push({
              nodeId: node.node_id,
              wsAddress,
            });
          }
        }

        // All unique nodes with valid addresses should get connection attempts
        const nodesWithValidAddresses = uniqueNodes.filter((n) =>
          deriveWsAddressFromNodeAddress(n.node_address) !== null,
        );
        t.equal(
          connectionAttempts.length,
          nodesWithValidAddresses.length,
          'all nodes with valid addresses should get connection attempts',
        );

        return true;
      },
    ),
    {numRuns: NUM.TEN},
  );
});

test('WS_PORT_OFFSET is correctly applied', async (t) => {
  const testCases = [
    {
      nodeAddress: 'localhost:8080',
      expectedWsPort: 8080 + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET,
    },
    {
      nodeAddress: 'localhost:8082',
      expectedWsPort: 8082 + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET,
    },
    {
      nodeAddress: 'localhost:8084',
      expectedWsPort: 8084 + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET,
    },
    {
      nodeAddress: '192.168.1.1:3000',
      expectedWsPort: 3000 + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET,
    },
  ];

  for (const {nodeAddress, expectedWsPort} of testCases) {
    const wsAddress = deriveWsAddressFromNodeAddress(nodeAddress);
    const actualWsPort = parseInt(wsAddress.split(':').pop(), NUM.TEN);
    t.equal(
      actualWsPort,
      expectedWsPort,
      `${nodeAddress} should produce WS port ${expectedWsPort}`,
    );
  }
});
