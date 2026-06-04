import {
  ConnectWebSocketPhase,
} from '../../src/bootstrap/phases/connect-websocket-phase.js';

function createBootstrapResponseWithPeerEndpoints(...nodeIds) {
  return {
    seedNodeId: 'seed-node',
    seedNodeWsAddress: 'ws://seed-node:8082',
    systemTableSnapshots: {
      node_endpoints: nodeIds.map((nodeId) => ({
        endpoint_id: `${nodeId}-ws`,
        node_id: nodeId,
        transport_type: 'ws',
        address: `ws://${nodeId}:8082`,
        priority: 0,
        status: 'active',
      })),
    },
  };
}

export function registerConnectWebSocketPhaseMeshTests({
  assert,
  test,
}) {
  test(
    'ConnectWebSocketPhase skips peers with in-flight mesh connections',
    async () => {
      const connectCalls = [];
      let lastSignature = null;
      const router = {
        nodeConnections: new Map([
          ['peer-connected', {state: 'connected'}],
          ['peer-connecting', {state: 'connecting'}],
          ['peer-reconnecting', {state: 'reconnecting'}],
        ]),
        async connectToNode(nodeId, address) {
          connectCalls.push({nodeId, address});
          this.nodeConnections.set(nodeId, {state: 'connected', address});
        },
        getConnectionState(nodeId) {
          return this.nodeConnections.get(nodeId)?.state || null;
        },
        getConnectedNodes() {
          return Array.from(this.nodeConnections.keys());
        },
      };

      const phase = new ConnectWebSocketPhase({
        nodeId: 'joining-node-1',
        delegates: {
          getLogger: () => ({
            info() {},
            warn() {},
            error(errorMessage) {
              throw new Error(`unexpected error log: ${errorMessage}`);
            },
            debug() {},
          }),
          getMessageRouter: () => router,
          getBootstrapResponse: () =>
            createBootstrapResponseWithPeerEndpoints(
              'joining-node-1',
              'peer-connected',
              'peer-connecting',
              'peer-reconnecting',
              'peer-disconnected',
            ),
          resolveMeshConnectivityNodeRows: () => ({
            source: 'bootstrap_snapshot',
            rows: [
              {
                node_id: 'joining-node-1',
                node_address: 'joining-node-1:8080',
                status: 'active',
              },
              {
                node_id: 'peer-connected',
                node_address: 'peer-connected:8080',
                status: 'active',
              },
              {
                node_id: 'peer-connecting',
                node_address: 'peer-connecting:8080',
                status: 'active',
              },
              {
                node_id: 'peer-reconnecting',
                node_address: 'peer-reconnecting:8080',
                status: 'active',
              },
              {
                node_id: 'peer-disconnected',
                node_address: 'peer-disconnected:8080',
                status: 'active',
              },
            ],
          }),
          buildClusterMeshSignature: () => 'mesh-signature',
          setLastClusterMeshSignature: (signature) => {
            lastSignature = signature;
          },
        },
      });

      await phase.connectToClusterNodes();

      assert.deepEqual(
        connectCalls,
        [
          {
            nodeId: 'peer-disconnected',
            address: 'ws://peer-disconnected:8082',
          },
        ],
        'mesh reconciliation should only dial peers without an existing or in-flight connection',
      );
      assert.equal(
        lastSignature,
        'mesh-signature',
        'phase should still refresh the cluster-mesh signature',
      );
    },
  );

  test(
    'ConnectWebSocketPhase can require ready mesh connections and redial reconnecting peers',
    async () => {
      const connectCalls = [];
      const router = {
        nodeConnections: new Map([
          ['peer-connected', {state: 'connected'}],
          ['peer-connecting', {state: 'connecting'}],
          ['peer-reconnecting', {state: 'reconnecting'}],
        ]),
        async connectToNode(nodeId, address) {
          connectCalls.push({nodeId, address});
          this.nodeConnections.set(nodeId, {state: 'connected', address});
        },
        getConnectionState(nodeId) {
          return this.nodeConnections.get(nodeId)?.state || null;
        },
        getConnectedNodes() {
          return Array.from(this.nodeConnections.keys());
        },
      };

      const phase = new ConnectWebSocketPhase({
        nodeId: 'joining-node-1',
        delegates: {
          getLogger: () => ({
            info() {},
            warn() {},
            error(errorMessage) {
              throw new Error(`unexpected error log: ${errorMessage}`);
            },
            debug() {},
          }),
          getMessageRouter: () => router,
          getBootstrapResponse: () =>
            createBootstrapResponseWithPeerEndpoints(
              'joining-node-1',
              'peer-connected',
              'peer-connecting',
              'peer-reconnecting',
              'peer-disconnected',
            ),
          resolveMeshConnectivityNodeRows: () => ({
            source: 'bootstrap_snapshot',
            rows: [
              {
                node_id: 'joining-node-1',
                node_address: 'joining-node-1:8080',
                status: 'active',
              },
              {
                node_id: 'peer-connected',
                node_address: 'peer-connected:8080',
                status: 'active',
              },
              {
                node_id: 'peer-connecting',
                node_address: 'peer-connecting:8080',
                status: 'active',
              },
              {
                node_id: 'peer-reconnecting',
                node_address: 'peer-reconnecting:8080',
                status: 'active',
              },
              {
                node_id: 'peer-disconnected',
                node_address: 'peer-disconnected:8080',
                status: 'active',
              },
            ],
          }),
          buildClusterMeshSignature: () => 'mesh-signature',
          setLastClusterMeshSignature() {},
        },
      });

      await phase.connectToClusterNodes({
        requireReadyConnections: true,
      });

      assert.deepEqual(
        connectCalls,
        [
          {
            nodeId: 'peer-reconnecting',
            address: 'ws://peer-reconnecting:8082',
          },
          {
            nodeId: 'peer-disconnected',
            address: 'ws://peer-disconnected:8082',
          },
        ],
        'strict join-time mesh repair should redial reconnecting peers instead of treating them as already usable',
      );
    },
  );

  test(
    'ConnectWebSocketPhase repairs mesh endpoint authority before giving up on cache-missing peers',
    async () => {
      const connectCalls = [];
      const repairCalls = [];
      let lastSignature = null;
      const cacheState = {
        nodeEndpoints: [],
      };
      const systemTableCache = {
        filter(tableName, predicate) {
          if (tableName !== 'node_endpoints') {
            return [];
          }
          return cacheState.nodeEndpoints.filter(predicate);
        },
        getAll(tableName) {
          if (tableName !== 'node_endpoints') {
            return [];
          }
          return [...cacheState.nodeEndpoints];
        },
      };
      const router = {
        nodeConnections: new Map(),
        async connectToNode(nodeId, address) {
          connectCalls.push({nodeId, address});
          this.nodeConnections.set(nodeId, {state: 'connected', address});
        },
        getConnectionState(nodeId) {
          return this.nodeConnections.get(nodeId)?.state || null;
        },
        getConnectedNodes() {
          return Array.from(this.nodeConnections.keys());
        },
      };

      const phase = new ConnectWebSocketPhase({
        nodeId: 'joining-node-1',
        delegates: {
          getLogger: () => ({
            info() {},
            warn() {},
            error(errorMessage) {
              throw new Error(`unexpected error log: ${errorMessage}`);
            },
            debug() {},
          }),
          getMessageRouter: () => router,
          getBootstrapResponse: () => ({
            seedNodeId: 'seed-node',
            seedNodeWsAddress: 'ws://seed-node:8082',
            systemTableSnapshots: {
              node_endpoints: [],
            },
          }),
          getSystemTableCache: () => systemTableCache,
          resolveMeshConnectivityNodeRows: () => ({
            source: 'system_table_cache',
            rows: [
              {
                node_id: 'joining-node-1',
                node_address: 'joining-node-1:8080',
                status: 'active',
              },
              {
                node_id: 'peer-cache-miss',
                node_address: 'peer-cache-miss:8080',
                status: 'active',
              },
            ],
          }),
          repairMeshConnectivityAuthorityIfNeeded: async (missingNodeIds) => {
            repairCalls.push([...missingNodeIds]);
            cacheState.nodeEndpoints = [
              {
                endpoint_id: 'peer-cache-miss-ws',
                node_id: 'peer-cache-miss',
                transport_type: 'ws',
                address: 'ws://peer-cache-miss:8082',
                priority: 0,
                status: 'active',
              },
            ];
            return true;
          },
          buildClusterMeshSignature: () => 'mesh-signature',
          setLastClusterMeshSignature: (signature) => {
            lastSignature = signature;
          },
        },
      });

      await phase.connectToClusterNodes();

      assert.deepEqual(
        repairCalls,
        [['peer-cache-miss']],
        'mesh reconciliation should trigger one authoritative repair for peers whose canonical endpoints are missing from cache',
      );
      assert.deepEqual(
        connectCalls,
        [
          {
            nodeId: 'peer-cache-miss',
            address: 'ws://peer-cache-miss:8082',
          },
        ],
        'mesh reconciliation should retry the peer after authoritative endpoint repair repopulates cache authority',
      );
      assert.equal(
        lastSignature,
        'mesh-signature',
        'phase should continue refreshing the cluster-mesh signature around repair retries',
      );
    },
  );

  test(
    'ConnectWebSocketPhase ignores bootstrap endpoint hints once mesh membership comes from cache authority',
    async () => {
      const connectCalls = [];
      const repairCalls = [];
      const cacheState = {
        nodeEndpoints: [],
      };
      const systemTableCache = {
        filter(tableName, predicate) {
          if (tableName !== 'node_endpoints') {
            return [];
          }
          return cacheState.nodeEndpoints.filter(predicate);
        },
        getAll(tableName) {
          if (tableName !== 'node_endpoints') {
            return [];
          }
          return [...cacheState.nodeEndpoints];
        },
      };
      const router = {
        nodeConnections: new Map(),
        async connectToNode(nodeId, address) {
          connectCalls.push({nodeId, address});
          this.nodeConnections.set(nodeId, {state: 'connected', address});
        },
        getConnectionState(nodeId) {
          return this.nodeConnections.get(nodeId)?.state || null;
        },
        getConnectedNodes() {
          return Array.from(this.nodeConnections.keys());
        },
      };

      const phase = new ConnectWebSocketPhase({
        nodeId: 'joining-node-1',
        delegates: {
          getLogger: () => ({
            info() {},
            warn() {},
            error(errorMessage) {
              throw new Error(`unexpected error log: ${errorMessage}`);
            },
            debug() {},
          }),
          getMessageRouter: () => router,
          getBootstrapResponse: () => ({
            seedNodeId: 'seed-node',
            seedNodeWsAddress: 'ws://seed-node:8082',
            systemTableSnapshots: {
              node_endpoints: [{
                endpoint_id: 'peer-cache-miss-bootstrap-ws',
                node_id: 'peer-cache-miss',
                transport_type: 'ws',
                address: 'ws://stale-bootstrap-peer-cache-miss:8082',
                priority: 0,
                status: 'active',
              }],
            },
          }),
          getSystemTableCache: () => systemTableCache,
          resolveMeshConnectivityNodeRows: () => ({
            source: 'system_table_cache',
            rows: [
              {
                node_id: 'joining-node-1',
                node_address: 'joining-node-1:8080',
                status: 'active',
              },
              {
                node_id: 'peer-cache-miss',
                node_address: 'peer-cache-miss:8080',
                status: 'active',
              },
            ],
          }),
          repairMeshConnectivityAuthorityIfNeeded: async (missingNodeIds) => {
            repairCalls.push([...missingNodeIds]);
            cacheState.nodeEndpoints = [
              {
                endpoint_id: 'peer-cache-miss-ws',
                node_id: 'peer-cache-miss',
                transport_type: 'ws',
                address: 'ws://peer-cache-miss:8082',
                priority: 0,
                status: 'active',
              },
            ];
            return true;
          },
          buildClusterMeshSignature: () => 'mesh-signature',
          setLastClusterMeshSignature() {},
        },
      });

      await phase.connectToClusterNodes();

      assert.deepEqual(
        repairCalls,
        [['peer-cache-miss']],
        'cache-owned mesh reconciliation should force authoritative endpoint repair instead of using stale bootstrap endpoint hints',
      );
      assert.deepEqual(
        connectCalls,
        [{
          nodeId: 'peer-cache-miss',
          address: 'ws://peer-cache-miss:8082',
        }],
        'mesh reconciliation should redial using repaired cache authority rather than the bootstrap snapshot address',
      );
    },
  );

  test(
    'ConnectWebSocketPhase uses explicitly scoped bootstrap admission peer endpoints under cache membership',
    async () => {
      const connectCalls = [];
      const repairCalls = [];
      const systemTableCache = {
        filter() {
          return [];
        },
        getAll() {
          return [];
        },
      };
      const router = {
        nodeConnections: new Map(),
        async connectToNode(nodeId, address) {
          connectCalls.push({nodeId, address});
          this.nodeConnections.set(nodeId, {state: 'connected', address});
        },
        getConnectionState(nodeId) {
          return this.nodeConnections.get(nodeId)?.state || null;
        },
        getConnectedNodes() {
          return Array.from(this.nodeConnections.keys());
        },
      };

      const phase = new ConnectWebSocketPhase({
        nodeId: 'joining-node-1',
        delegates: {
          getLogger: () => ({
            info() {},
            warn() {},
            error(errorMessage) {
              throw new Error(`unexpected error log: ${errorMessage}`);
            },
            debug() {},
          }),
          getMessageRouter: () => router,
          getBootstrapResponse: () => ({
            seedNodeId: 'seed-node',
            seedNodeWsAddress: 'ws://seed-node:8082',
            topologySnapshotMeta: {
              bootstrapAdmissionPeerHintNodeIds: ['peer-admission-hint'],
            },
            systemTableSnapshots: {
              node_endpoints: [{
                endpoint_id: 'peer-admission-hint-bootstrap-ws',
                node_id: 'peer-admission-hint',
                transport_type: 'ws',
                address: 'ws://peer-admission-hint:8082',
                priority: 0,
                status: 'active',
              }],
            },
          }),
          getSystemTableCache: () => systemTableCache,
          resolveMeshConnectivityNodeRows: () => ({
            source: 'system_table_cache',
            rows: [
              {
                node_id: 'joining-node-1',
                node_address: 'joining-node-1:8080',
                status: 'active',
              },
              {
                node_id: 'peer-admission-hint',
                node_address: 'peer-admission-hint:8080',
                status: 'active',
              },
            ],
          }),
          repairMeshConnectivityAuthorityIfNeeded: async (missingNodeIds) => {
            repairCalls.push([...missingNodeIds]);
            return false;
          },
          buildClusterMeshSignature: () => 'mesh-signature',
          setLastClusterMeshSignature() {},
        },
      });

      await phase.connectToClusterNodes();

      assert.deepEqual(
        repairCalls,
        [],
        'explicit bootstrap admission peer endpoint hints should not need cache repair before the first mesh dial',
      );
      assert.deepEqual(
        connectCalls,
        [{
          nodeId: 'peer-admission-hint',
          address: 'ws://peer-admission-hint:8082',
        }],
        'mesh reconciliation should dial the bootstrap admission peer from its scoped endpoint hint',
      );
    },
  );
}
