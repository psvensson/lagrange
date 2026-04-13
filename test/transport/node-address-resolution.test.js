import {test} from '../../src/test-helpers/tap.js';
import os from 'os';
import {
  NODE_WEBSOCKET_ADDRESS_RESOLUTION_SOURCE,
  NODE_WEBSOCKET_ADDRESS_RESOLUTION_REASON,
  NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE,
  parseAddressPartsResult,
  resolveAdvertisedWebSocketAddress,
  resolveNodeWebSocketAddress,
} from '../../src/transport/node-address-resolution.js';

test('resolveAdvertisedWebSocketAddress preserves explicit websocket address',
  async (t) => {
    const advertisedAddress = resolveAdvertisedWebSocketAddress({
      advertisedAddress: 'ws://172.20.0.9:8082',
      nodeAddress: 'peer-name:8080',
      wsPort: 8082,
    });

    t.equal(
      advertisedAddress,
      'ws://172.20.0.9:8082',
      'explicit advertised websocket address should win',
    );
  });

test(
  'resolveAdvertisedWebSocketAddress prefers routable local interface for ' +
    'wildcard-bound hostname nodes',
  async (t) => {
    const originalNetworkInterfaces = os.networkInterfaces;
    os.networkInterfaces = () => ({
      lo: [
        {address: '127.0.0.1', family: 'IPv4', internal: true},
      ],
      eth0: [
        {address: '172.20.0.9', family: 'IPv4', internal: false},
      ],
    });

    try {
      const advertisedAddress = resolveAdvertisedWebSocketAddress({
        nodeAddress: 'ddb-test-reuse-5-1:8080',
        wsPort: 8082,
        wsHost: '0.0.0.0',
      });

      t.equal(
        advertisedAddress,
        'ws://172.20.0.9:8082',
        'wildcard-bound transport should advertise the routable interface address',
      );
    } finally {
      os.networkInterfaces = originalNetworkInterfaces;
    }
  },
);

test('parseAddressPartsResult keeps websocket protocol, host, and port for URLs',
  async (t) => {
    t.same(
      parseAddressPartsResult('ws://[2001:db8::1]:8082'),
      {
        state: 'parsed',
        host: {
          state: 'present',
          value: '2001:db8::1',
        },
        port: {
          state: 'present',
          value: 8082,
        },
        protocol: {
          state: 'present',
          value: 'ws:',
        },
      },
      'parsed websocket URLs should preserve protocol, host, and port',
    );
  });

test('resolveNodeWebSocketAddress uses authoritative node_endpoints rows',
  async (t) => {
    const resolvedAddress = resolveNodeWebSocketAddress({
      targetNodeId: 'node-2',
      bootstrapResponse: {
        systemTableSnapshots: {
          node_endpoints: [
            {
              endpoint_id: 'ep-node-2-ws',
              node_id: 'node-2',
              transport_type: 'ws',
              address: 'ws://172.20.0.11:8082',
              priority: 0,
              status: 'active',
            },
          ],
        },
      },
    });

    t.same(
      resolvedAddress,
      {
        state: NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED,
        address: 'ws://172.20.0.11:8082',
        source:
          NODE_WEBSOCKET_ADDRESS_RESOLUTION_SOURCE
            .BOOTSTRAP_SNAPSHOT_NODE_ENDPOINTS,
      },
      'node_endpoints snapshot should be the canonical peer websocket authority',
    );
  });

test('resolveNodeWebSocketAddress returns null without canonical websocket metadata',
  async (t) => {
    const resolvedAddress = resolveNodeWebSocketAddress({
      targetNodeId: 'node-2',
      systemTableCache: {
        get() {
          return {
            node_id: 'node-2',
            node_address: 'node-2-hostname:8080',
          };
        },
      },
    });

    t.same(
      resolvedAddress,
      {
        state: NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.UNAVAILABLE,
        reason:
          NODE_WEBSOCKET_ADDRESS_RESOLUTION_REASON
            .CANONICAL_METADATA_MISSING,
      },
      'node_address alone should not be treated as peer websocket authority',
    );
  });

test('resolveNodeWebSocketAddress reads canonical websocket metadata from cache',
  async (t) => {
    const resolvedAddress = resolveNodeWebSocketAddress({
      targetNodeId: 'node-2',
      systemTableCache: {
        filter(tableName, predicate) {
          if (tableName !== 'node_endpoints') {
            return [];
          }
          return [
            {
              endpoint_id: 'ep-node-2-ws',
              node_id: 'node-2',
              transport_type: 'ws',
              address: 'ws://172.20.0.12:8082',
              priority: 0,
              status: 'active',
            },
          ].filter(predicate);
        },
      },
    });

    t.same(
      resolvedAddress,
      {
        state: NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED,
        address: 'ws://172.20.0.12:8082',
        source: NODE_WEBSOCKET_ADDRESS_RESOLUTION_SOURCE.CACHE_NODE_ENDPOINTS,
      },
      'cache-backed node_endpoints rows should resolve peer websocket addresses',
    );
  });
