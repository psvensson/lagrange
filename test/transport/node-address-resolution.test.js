import {test} from '../../src/test-helpers/tap.js';
import os from 'os';
import {
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

test('resolveAdvertisedWebSocketAddress prefers routable local interface for wildcard-bound hostname nodes',
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

    t.equal(
      resolvedAddress,
      'ws://172.20.0.11:8082',
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

    t.equal(
      resolvedAddress,
      null,
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

    t.equal(
      resolvedAddress,
      'ws://172.20.0.12:8082',
      'cache-backed node_endpoints rows should resolve peer websocket addresses',
    );
  });
