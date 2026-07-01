import {test} from '../../src/test-helpers/tap.js';
import os from 'os';
import {
  NODE_WEBSOCKET_ADDRESS_RESOLUTION_AUTHORITY,
  NODE_WEBSOCKET_ADDRESS_RESOLUTION_EVIDENCE_SOURCE,
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
  'resolveAdvertisedWebSocketAddress keeps an explicit hostname under ' +
    'wildcard bind (name-first addressing)',
  async (t) => {
    // Name-first: an operator advertises a STABLE hostname so that a restart
    // which changes the node's IP is transparent to peers (the OS re-resolves
    // the name on each connect). The routable-local-IP substitution that fires
    // for wildcard (0.0.0.0) binds must NOT clobber an explicitly configured
    // name -- otherwise the cluster silently advertises a raw IP.
    const advertisedAddress = resolveAdvertisedWebSocketAddress({
      advertisedAddress: 'node-b.svc.cluster.local:8082',
      nodeAddress: 'node-b-internal:8080',
      wsPort: 8082,
      wsHost: '0.0.0.0',
    });

    t.equal(
      advertisedAddress,
      'ws://node-b.svc.cluster.local:8082',
      'explicit hostname must be preserved even when bound to the wildcard host',
    );
  });

test(
  'resolveAdvertisedWebSocketAddress preserves an explicit ws:// hostname URL ' +
    'under wildcard bind',
  async (t) => {
    const advertisedAddress = resolveAdvertisedWebSocketAddress({
      advertisedAddress: 'ws://node-b.svc.cluster.local:8082',
      wsHost: '0.0.0.0',
    });

    t.equal(
      advertisedAddress,
      'ws://node-b.svc.cluster.local:8082',
      'explicit ws:// hostname URL must be preserved under wildcard bind',
    );
  });

test(
  'resolveNodeWebSocketAddress resolves a peer by hostname from node_endpoints',
  async (t) => {
    // Peers dial the advertised value verbatim; when it is a hostname the dial
    // (new WebSocket(name)) re-resolves it per connect, so a changed backing IP
    // behind the same name is picked up transparently.
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
              address: 'ws://node-2.svc.cluster.local:8082',
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
        address: 'ws://node-2.svc.cluster.local:8082',
        authority:
          NODE_WEBSOCKET_ADDRESS_RESOLUTION_AUTHORITY
            .CANONICAL_NODE_ENDPOINT,
        evidenceSource:
          NODE_WEBSOCKET_ADDRESS_RESOLUTION_EVIDENCE_SOURCE.SYSTEM_TABLE_CACHE,
      },
      'a hostname advertised into node_endpoints resolves verbatim (no IP substitution)',
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
        authority:
          NODE_WEBSOCKET_ADDRESS_RESOLUTION_AUTHORITY
            .CANONICAL_NODE_ENDPOINT,
        evidenceSource:
          NODE_WEBSOCKET_ADDRESS_RESOLUTION_EVIDENCE_SOURCE
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
        authority:
          NODE_WEBSOCKET_ADDRESS_RESOLUTION_AUTHORITY
            .CANONICAL_NODE_ENDPOINT,
        evidenceSource:
          NODE_WEBSOCKET_ADDRESS_RESOLUTION_EVIDENCE_SOURCE.SYSTEM_TABLE_CACHE,
      },
      'cache-backed node_endpoints rows should resolve peer websocket addresses',
    );
  });

test(
  'canonical cache row beats a stale bootstrap seed pin for the seed node',
  async (t) => {
    // A seed node that restarts with a NEW address republishes its endpoint via
    // heartbeat -> node_endpoints (the canonical cache), but a peer holding an
    // OLD bootstrapResponse still carries the seed's stale advertised address in
    // seedNodeWsAddress. The seed pin and the cache row are the same
    // self-advertised value differing only in freshness, so the fresher cache
    // row must win; otherwise the peer keeps dialing the dead old seed address.
    const resolvedAddress = resolveNodeWebSocketAddress({
      targetNodeId: 'seed-node',
      bootstrapResponse: {
        seedNodeId: 'seed-node',
        seedNodeWsAddress: 'ws://172.20.0.5:8082',
      },
      systemTableCache: {
        filter(tableName, predicate) {
          if (tableName !== 'node_endpoints') {
            return [];
          }
          return [
            {
              endpoint_id: 'ep-seed-node-ws',
              node_id: 'seed-node',
              transport_type: 'ws',
              address: 'ws://172.20.0.99:8082',
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
        address: 'ws://172.20.0.99:8082',
        authority:
          NODE_WEBSOCKET_ADDRESS_RESOLUTION_AUTHORITY
            .CANONICAL_NODE_ENDPOINT,
        evidenceSource:
          NODE_WEBSOCKET_ADDRESS_RESOLUTION_EVIDENCE_SOURCE.SYSTEM_TABLE_CACHE,
      },
      'fresher canonical node_endpoints row should beat the stale seed pin',
    );
  });

test(
  'bootstrap seed pin still resolves the seed when no canonical cache row exists',
  async (t) => {
    // Cold-start fallthrough: during initial join, before CDC populates the
    // cache, the seed pin remains the resolution authority.
    const resolvedAddress = resolveNodeWebSocketAddress({
      targetNodeId: 'seed-node',
      bootstrapResponse: {
        seedNodeId: 'seed-node',
        seedNodeWsAddress: 'ws://172.20.0.5:8082',
      },
      systemTableCache: {
        filter() {
          return [];
        },
      },
    });

    t.same(
      resolvedAddress,
      {
        state: NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED,
        address: 'ws://172.20.0.5:8082',
        authority:
          NODE_WEBSOCKET_ADDRESS_RESOLUTION_AUTHORITY
            .NORMALIZED_BOOTSTRAP_SEED,
        evidenceSource:
          NODE_WEBSOCKET_ADDRESS_RESOLUTION_EVIDENCE_SOURCE
            .BOOTSTRAP_SEED_INGRESS,
      },
      'seed pin should remain authoritative when the cache has no seed row',
    );
  });
