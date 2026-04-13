import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import {
  ConnectWebSocketPhase,
} from '../../src/bootstrap/phases/connect-websocket-phase.js';
import {
  MessageRouterSetup,
} from '../../src/bootstrap/shared/message-router-setup.js';

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

test(
  'ConnectWebSocketPhase creates the router with external admission closed',
  async () => {
    const originalCreate = MessageRouterSetup.create;
    const createCalls = [];
    const router = {
      nodeConnections: new Map(),
      async connectToNode(nodeId) {
        this.nodeConnections.set(nodeId, {state: 'connected'});
      },
      getConnectionState(nodeId) {
        return this.nodeConnections.get(nodeId)?.state || null;
      },
      getConnectedNodes() {
        return Array.from(this.nodeConnections.keys());
      },
      hasSelfConnection() {
        return true;
      },
      setQueryMessageGroupServiceResolver() {},
    };

    MessageRouterSetup.create = async (options) => {
      createCalls.push(options);
      return router;
    };

    try {
      const phase = new ConnectWebSocketPhase({
        nodeId: 'joining-node-1',
        delegates: {
          getWsPort: () => 9090,
          getIdentifyPayload: () => ({role: 'joining'}),
          getNodeAddress: () => 'joining-node-1:8080',
          getLogger: () => ({
            info() {},
            warn() {},
            error(message) {
              throw new Error(`unexpected error log: ${message}`);
            },
            debug() {},
          }),
          getMessageRouter: () => router,
          setMessageRouter() {},
          setTransport() {},
          initializeJoiningLifecycleOwners: async () => {},
          triggerJoinReconciler: async () => {},
          getSeedNodeWsAddress: () => 'ws://seed-node:8082',
          getSeedNodeId: () => 'seed-node',
          getBootstrapResponse: () =>
            createBootstrapResponseWithPeerEndpoints('joining-node-1'),
          getNodeCapabilities: () => ({pgwire: true}),
          sendControlPlaneNodeStateUpdate: async () => {},
          resolveMeshConnectivityNodeRows: () => ({
            source: 'cache',
            rows: [
              {
                node_id: 'joining-node-1',
                node_address: 'joining-node-1:8080',
              },
              {
                node_id: 'seed-node',
                node_address: 'seed-node:8080',
              },
            ],
          }),
          buildClusterMeshSignature: () => 'seed-node|joining-node-1',
          setLastClusterMeshSignature() {},
        },
      });

      await phase.phaseConnectWebSocket();

      assert.equal(createCalls.length, 1);
      assert.equal(
        createCalls[0]?.externalAdmissionEnabled,
        false,
        'join websocket phase should keep external admission closed until join infrastructure is ready',
      );
    } finally {
      MessageRouterSetup.create = originalCreate;
    }
  },
);

test(
  'ConnectWebSocketPhase retries transient seed websocket connect failures',
  async () => {
    const originalCreate = MessageRouterSetup.create;
    let nowMs = 0;
    const sleepCalls = [];
    const warningEvents = [];
    const infoEvents = [];
    const connectCalls = [];
    let sentNodeStateUpdate = null;
    let currentRouter = null;

    const router = {
      nodeConnections: new Map(),
      async connectToNode(nodeId, address) {
        connectCalls.push({nodeId, address});
        if (connectCalls.length === 1) {
          const error = new Error('WebSocket connection timeout after 5000ms');
          error.code = 'WS_CONNECT_TIMEOUT';
          throw error;
        }
        this.nodeConnections.set(nodeId, {state: 'connected'});
      },
      getConnectionState(nodeId) {
        return this.nodeConnections.get(nodeId)?.state || null;
      },
      getConnectedNodes() {
        return Array.from(this.nodeConnections.keys());
      },
      hasSelfConnection() {
        return true;
      },
      setQueryMessageGroupServiceResolver() {}
    };

    MessageRouterSetup.create = async () => router;

    try {
      const phase = new ConnectWebSocketPhase({
        nodeId: 'joining-node-1',
        delegates: {
          getWsPort: () => 9090,
          getIdentifyPayload: () => ({role: 'joining'}),
          getNodeAddress: () => 'joining-node-1:8080',
          getLogger: () => ({
            info(message, details) {
              infoEvents.push({message, details});
            },
            warn(message, details) {
              warningEvents.push({message, details});
            },
            error(errorMessage) {
              throw new Error(`unexpected error log: ${errorMessage}`);
            },
            debug() {},
          }),
          getNow: () => () => nowMs,
          getSleep: () => async (delayMs) => {
            sleepCalls.push(delayMs);
            nowMs += delayMs;
          },
          getConfig: () => ({
            httpTimeoutMs: 30000,
            leadershipWaitTimeoutMs: 100,
            leadershipWaitInitialDelayMs: 25,
            leadershipWaitMaxDelayMs: 50,
            leadershipWaitBackoffMultiplier: 2,
          }),
          resolveJoinRetryPolicy: () => ({
            retryTimeoutMs: 100,
            initialDelayMs: 25,
            maxDelayMs: 50,
            backoffMultiplier: 2,
          }),
          computeSeedContactRetryDelayMs: ({baseDelayMs, maxDelayMs}) =>
            Math.min(baseDelayMs, maxDelayMs),
          getMessageRouter: () => currentRouter,
          setMessageRouter(routerInstance) {
            currentRouter = routerInstance;
          },
          setTransport() {},
          initializeJoiningLifecycleOwners: async () => {},
          triggerJoinReconciler: async () => {},
          getSeedNodeWsAddress: () => 'ws://seed-node:8082',
          getSeedNodeId: () => 'seed-node',
          getBootstrapResponse: () =>
            createBootstrapResponseWithPeerEndpoints('joining-node-1'),
          resolveMeshConnectivityNodeRows: () => ({
            source: 'cache',
            rows: [
              {
                node_id: 'joining-node-1',
                node_address: 'joining-node-1:8080',
              },
            ],
          }),
          buildClusterMeshSignature: () => 'mesh-signature',
          setLastClusterMeshSignature: () => {},
          sendControlPlaneNodeStateUpdate: async (payload) => {
            sentNodeStateUpdate = payload;
          },
          getNodeCapabilities: () => ['sql'],
          getLeaderMessageGroupService: () => null,
        },
      });

      await phase.phaseConnectWebSocket();

      assert.equal(
        connectCalls.length,
        2,
        'seed websocket connect should retry once before succeeding',
      );
      assert.deepEqual(
        connectCalls,
        [
          {nodeId: 'seed-node', address: 'ws://seed-node:8082'},
          {nodeId: 'seed-node', address: 'ws://seed-node:8082'},
        ],
        'retry should target the same seed websocket address',
      );
      assert.deepEqual(
        sleepCalls,
        [25],
        'phase should sleep using the bounded retry delay before retrying',
      );
      assert.equal(warningEvents.length, 1, 'phase should log one retry warning');
      assert.equal(
        sentNodeStateUpdate?.state,
        'connected',
        'phase should continue to publish connected node state after retry success',
      );
      assert.ok(
        infoEvents.some((event) => event.message.includes('Connected to seed node')),
        'phase should eventually log a successful seed websocket connection',
      );
    } finally {
      MessageRouterSetup.create = originalCreate;
    }
  },
);

test(
  'ConnectWebSocketPhase only exposes initialized local message-group transport',
  async () => {
    const originalCreate = MessageRouterSetup.create;
    let currentRouter = null;
    let queryTransportResolver = null;
    const leaderService = {
      initialized: false,
      sendMessage: async () => ({acknowledged: true}),
    };

    const router = {
      nodeConnections: new Map(),
      async connectToNode(nodeId, address) {
        this.nodeConnections.set(nodeId, {state: 'connected', address});
      },
      getConnectionState(nodeId) {
        return this.nodeConnections.get(nodeId)?.state || null;
      },
      getConnectedNodes() {
        return Array.from(this.nodeConnections.keys());
      },
      hasSelfConnection() {
        return true;
      },
      setQueryMessageGroupServiceResolver(resolver) {
        queryTransportResolver = resolver;
      },
    };

    MessageRouterSetup.create = async () => router;

    try {
      const phase = new ConnectWebSocketPhase({
        nodeId: 'joining-node-1',
        delegates: {
          getWsPort: () => 9090,
          getIdentifyPayload: () => ({role: 'joining'}),
          getNodeAddress: () => 'joining-node-1:8080',
          getLogger: () => ({
            info() {},
            warn() {},
            error(errorMessage) {
              throw new Error(`unexpected error log: ${errorMessage}`);
            },
            debug() {},
          }),
          getNow: () => () => 0,
          getSleep: () => async () => {},
          getConfig: () => ({
            httpTimeoutMs: 30000,
            leadershipWaitTimeoutMs: 100,
            leadershipWaitInitialDelayMs: 25,
            leadershipWaitMaxDelayMs: 50,
            leadershipWaitBackoffMultiplier: 2,
          }),
          resolveJoinRetryPolicy: () => ({
            retryTimeoutMs: 100,
            initialDelayMs: 25,
            maxDelayMs: 50,
            backoffMultiplier: 2,
          }),
          computeSeedContactRetryDelayMs: ({baseDelayMs, maxDelayMs}) =>
            Math.min(baseDelayMs, maxDelayMs),
          getMessageRouter: () => currentRouter,
          setMessageRouter(routerInstance) {
            currentRouter = routerInstance;
          },
          setTransport() {},
          initializeJoiningLifecycleOwners: async () => {},
          triggerJoinReconciler: async () => {},
          getSeedNodeWsAddress: () => 'ws://seed-node:8082',
          getSeedNodeId: () => 'seed-node',
          resolveMeshConnectivityNodeRows: () => ({
            source: 'cache',
            rows: [
              {
                node_id: 'joining-node-1',
                node_address: 'joining-node-1:8080',
              },
            ],
          }),
          buildClusterMeshSignature: () => 'mesh-signature',
          setLastClusterMeshSignature: () => {},
          sendControlPlaneNodeStateUpdate: async () => {},
          getNodeCapabilities: () => ['sql'],
          getLeaderMessageGroupService: () => leaderService,
        },
      });

      await phase.phaseConnectWebSocket();

      assert.equal(
        typeof queryTransportResolver,
        'function',
        'phase should install a query transport resolver on the router',
      );
      assert.equal(
        queryTransportResolver(),
        null,
        'uninitialized message-group service should not be exposed as query transport',
      );

      leaderService.initialized = true;
      assert.equal(
        queryTransportResolver(),
        leaderService,
        'initialized message-group service should become the query transport',
      );
    } finally {
      MessageRouterSetup.create = originalCreate;
    }
  },
);

test(
  'ConnectWebSocketPhase preserves deferred query transport selection until an initialized relay is available',
  async () => {
    const originalCreate = MessageRouterSetup.create;
    let currentRouter = null;
    let queryTransportResolver = null;
    const relayService = {
      initialized: true,
      sendMessage: async () => ({acknowledged: true}),
    };
    let currentSelection = {
      service: null,
      ready: false,
      reason: 'operational message-group ingress not ready',
      retryAfterMs: 25,
      route: null,
    };

    const router = {
      nodeConnections: new Map(),
      async connectToNode(nodeId, address) {
        this.nodeConnections.set(nodeId, {state: 'connected', address});
      },
      getConnectionState(nodeId) {
        return this.nodeConnections.get(nodeId)?.state || null;
      },
      getConnectedNodes() {
        return Array.from(this.nodeConnections.keys());
      },
      hasSelfConnection() {
        return true;
      },
      setQueryMessageGroupServiceResolver(resolver) {
        queryTransportResolver = resolver;
      },
    };

    MessageRouterSetup.create = async () => router;

    try {
      const phase = new ConnectWebSocketPhase({
        nodeId: 'joining-node-query-transport-selection',
        delegates: {
          getWsPort: () => 9090,
          getIdentifyPayload: () => ({role: 'joining'}),
          getNodeAddress: () => 'joining-node-query-transport-selection:8080',
          getLogger: () => ({
            info() {},
            warn() {},
            error(errorMessage) {
              throw new Error(`unexpected error log: ${errorMessage}`);
            },
            debug() {},
          }),
          getNow: () => () => 0,
          getSleep: () => async () => {},
          getConfig: () => ({
            httpTimeoutMs: 30000,
            leadershipWaitTimeoutMs: 100,
            leadershipWaitInitialDelayMs: 25,
            leadershipWaitMaxDelayMs: 50,
            leadershipWaitBackoffMultiplier: 2,
          }),
          resolveJoinRetryPolicy: () => ({
            retryTimeoutMs: 100,
            initialDelayMs: 25,
            maxDelayMs: 50,
            backoffMultiplier: 2,
          }),
          computeSeedContactRetryDelayMs: ({baseDelayMs, maxDelayMs}) =>
            Math.min(baseDelayMs, maxDelayMs),
          getMessageRouter: () => currentRouter,
          setMessageRouter(routerInstance) {
            currentRouter = routerInstance;
          },
          setTransport() {},
          initializeJoiningLifecycleOwners: async () => {},
          triggerJoinReconciler: async () => {},
          getSeedNodeWsAddress: () => 'ws://seed-node:8082',
          getSeedNodeId: () => 'seed-node',
          resolveMeshConnectivityNodeRows: () => ({
            source: 'cache',
            rows: [
              {
                node_id: 'joining-node-query-transport-selection',
                node_address: 'joining-node-query-transport-selection:8080',
              },
            ],
          }),
          buildClusterMeshSignature: () => 'mesh-signature',
          setLastClusterMeshSignature: () => {},
          sendControlPlaneNodeStateUpdate: async () => {},
          getNodeCapabilities: () => ['sql'],
          getLeaderMessageGroupService: () => {
            throw new Error('query transport should use the dedicated selection delegate');
          },
          resolveQueryTransportMessageGroupSelection: () => currentSelection,
        },
      });

      await phase.phaseConnectWebSocket();

      assert.equal(
        typeof queryTransportResolver,
        'function',
        'phase should install a query transport resolver on the router',
      );
      assert.deepEqual(
        queryTransportResolver(),
        {
          service: null,
          reason: 'operational message-group ingress not ready',
          retryAfterMs: 25,
        },
        'deferred query transport selection should preserve structured retry context',
      );

      currentSelection = {
        service: relayService,
        ready: true,
        reason: null,
        retryAfterMs: 0,
        route: 'relay',
      };

      const resolvedSelection = queryTransportResolver();
      assert.equal(
        resolvedSelection.service,
        relayService,
        'initialized relay should become the bound query transport service',
      );
      assert.equal(
        resolvedSelection.route,
        'relay',
        'resolver should preserve the dedicated relay route classification',
      );
    } finally {
      MessageRouterSetup.create = originalCreate;
    }
  },
);

test(
  'ConnectWebSocketPhase hydrates bootstrap snapshots before later join phases depend on cache state',
  async () => {
    const originalCreate = MessageRouterSetup.create;
    let currentRouter = null;
    let hydrationCalls = 0;
    const steps = [];

    const router = {
      nodeConnections: new Map(),
      async connectToNode(nodeId, address) {
        this.nodeConnections.set(nodeId, {state: 'connected', address});
      },
      getConnectionState(nodeId) {
        return this.nodeConnections.get(nodeId)?.state || null;
      },
      getConnectedNodes() {
        return Array.from(this.nodeConnections.keys());
      },
      hasSelfConnection() {
        return true;
      },
      setQueryMessageGroupServiceResolver() {},
    };

    MessageRouterSetup.create = async () => router;

    try {
      const phase = new ConnectWebSocketPhase({
        nodeId: 'joining-node-1',
        delegates: {
          getWsPort: () => 9090,
          getIdentifyPayload: () => ({role: 'joining'}),
          getNodeAddress: () => 'joining-node-1:8080',
          getLogger: () => ({
            info() {},
            warn() {},
            error(errorMessage) {
              throw new Error(`unexpected error log: ${errorMessage}`);
            },
            debug() {},
          }),
          getNow: () => () => 0,
          getSleep: () => async () => {},
          getConfig: () => ({
            httpTimeoutMs: 30000,
            leadershipWaitTimeoutMs: 100,
            leadershipWaitInitialDelayMs: 25,
            leadershipWaitMaxDelayMs: 50,
            leadershipWaitBackoffMultiplier: 2,
          }),
          resolveJoinRetryPolicy: () => ({
            retryTimeoutMs: 100,
            initialDelayMs: 25,
            maxDelayMs: 50,
            backoffMultiplier: 2,
          }),
          computeSeedContactRetryDelayMs: ({baseDelayMs, maxDelayMs}) =>
            Math.min(baseDelayMs, maxDelayMs),
          getMessageRouter: () => currentRouter,
          setMessageRouter(routerInstance) {
            currentRouter = routerInstance;
          },
          setTransport() {},
          initializeJoiningLifecycleOwners: async () => {
            steps.push('owners');
          },
          triggerJoinReconciler: async () => {
            steps.push('reconcile');
          },
          ensureBootstrapSnapshotHydrated: async () => {
            hydrationCalls += 1;
            steps.push('hydrate');
          },
          getSeedNodeWsAddress: () => 'ws://seed-node:8082',
          getSeedNodeId: () => 'seed-node',
          getBootstrapResponse: () =>
            createBootstrapResponseWithPeerEndpoints('joining-node-1'),
          resolveMeshConnectivityNodeRows: () => ({
            source: 'cache',
            rows: [
              {
                node_id: 'joining-node-1',
                node_address: 'joining-node-1:8080',
              },
            ],
          }),
          buildClusterMeshSignature: () => 'mesh-signature',
          setLastClusterMeshSignature: () => {},
          sendControlPlaneNodeStateUpdate: async () => {
            steps.push('node-state');
          },
          getNodeCapabilities: () => ['sql'],
          getLeaderMessageGroupService: () => null,
        },
      });

      await phase.phaseConnectWebSocket();

      assert.equal(
        hydrationCalls,
        1,
        'phase should hydrate bootstrap snapshots exactly once before later phases depend on cache state',
      );
      assert.deepEqual(
        steps,
        ['owners', 'reconcile', 'hydrate', 'node-state'],
        'bootstrap snapshot hydration should happen before connected state publication',
      );
    } finally {
      MessageRouterSetup.create = originalCreate;
    }
  },
);

test(
  'ConnectWebSocketPhase can proceed when seed websocket stays unavailable but a peer mesh already exists',
  async () => {
    const originalCreate = MessageRouterSetup.create;
    let nowMs = 0;
    const warningEvents = [];
    let sentNodeStateUpdate = null;
    let currentRouter = null;

    const router = {
      nodeConnections: new Map([
        ['peer-node', {state: 'connected'}],
      ]),
      async connectToNode(nodeId, address) {
        if (nodeId === 'seed-node') {
          const error = new Error('WebSocket connection timeout after 5000ms');
          error.code = 'WS_CONNECT_TIMEOUT';
          throw error;
        }
        this.nodeConnections.set(nodeId, {state: 'connected', address});
      },
      getConnectionState(nodeId) {
        return this.nodeConnections.get(nodeId)?.state || null;
      },
      getConnectedNodes() {
        return Array.from(this.nodeConnections.keys());
      },
      hasSelfConnection() {
        return true;
      },
      setQueryMessageGroupServiceResolver() {},
    };

    MessageRouterSetup.create = async () => router;

    try {
      const phase = new ConnectWebSocketPhase({
        nodeId: 'joining-node-1',
        delegates: {
          getWsPort: () => 9090,
          getIdentifyPayload: () => ({role: 'joining'}),
          getNodeAddress: () => 'joining-node-1:8080',
          getLogger: () => ({
            info() {},
            warn(message, details) {
              warningEvents.push({message, details});
            },
            error(errorMessage) {
              throw new Error(`unexpected error log: ${errorMessage}`);
            },
            debug() {},
          }),
          getNow: () => () => nowMs,
          getSleep: () => async (delayMs) => {
            nowMs += delayMs;
          },
          getConfig: () => ({
            httpTimeoutMs: 30000,
            leadershipWaitTimeoutMs: 100,
            leadershipWaitInitialDelayMs: 25,
            leadershipWaitMaxDelayMs: 50,
            leadershipWaitBackoffMultiplier: 2,
          }),
          resolveJoinRetryPolicy: () => ({
            retryTimeoutMs: 100,
            initialDelayMs: 25,
            maxDelayMs: 50,
            backoffMultiplier: 2,
          }),
          computeSeedContactRetryDelayMs: ({baseDelayMs, maxDelayMs}) =>
            Math.min(baseDelayMs, maxDelayMs),
          getMessageRouter: () => currentRouter,
          setMessageRouter(routerInstance) {
            currentRouter = routerInstance;
          },
          setTransport() {},
          initializeJoiningLifecycleOwners: async () => {},
          triggerJoinReconciler: async () => {},
          getSeedNodeWsAddress: () => 'ws://seed-node:8082',
          getSeedNodeId: () => 'seed-node',
          getBootstrapResponse: () =>
            createBootstrapResponseWithPeerEndpoints(
              'joining-node-1',
              'peer-node',
            ),
          resolveMeshConnectivityNodeRows: () => ({
            source: 'cache',
            rows: [
              {
                node_id: 'joining-node-1',
                node_address: 'joining-node-1:8080',
              },
              {
                node_id: 'peer-node',
                node_address: 'peer-node:8080',
              },
            ],
          }),
          buildClusterMeshSignature: () => 'mesh-signature',
          setLastClusterMeshSignature: () => {},
          sendControlPlaneNodeStateUpdate: async (payload) => {
            sentNodeStateUpdate = payload;
          },
          getNodeCapabilities: () => ['sql'],
          getLeaderMessageGroupService: () => null,
        },
      });

      await phase.phaseConnectWebSocket();

      assert.equal(
        sentNodeStateUpdate?.state,
        'connected',
        'phase should still publish connected state when peer mesh exists',
      );
      assert.ok(
        warningEvents.some((event) =>
          event.message.includes('Proceeding with peer mesh')),
        'phase should log peer-mesh fallback diagnostics',
      );
    } finally {
      MessageRouterSetup.create = originalCreate;
    }
  },
);

test(
  'ConnectWebSocketPhase stops seed websocket retries once peer mesh becomes reachable',
  async () => {
    const originalCreate = MessageRouterSetup.create;
    let nowMs = 0;
    const sleepCalls = [];
    const warningEvents = [];
    const connectCalls = [];
    let sentNodeStateUpdate = null;
    let currentRouter = null;

    const router = {
      nodeConnections: new Map(),
      async connectToNode(nodeId, address) {
        connectCalls.push({nodeId, address});
        if (nodeId === 'seed-node') {
          const error = new Error('WebSocket connection timeout after 5000ms');
          error.code = 'WS_CONNECT_TIMEOUT';
          throw error;
        }
        this.nodeConnections.set(nodeId, {state: 'connected', address});
      },
      getConnectionState(nodeId) {
        return this.nodeConnections.get(nodeId)?.state || null;
      },
      getConnectedNodes() {
        return Array.from(this.nodeConnections.keys());
      },
      hasSelfConnection() {
        return true;
      },
      setQueryMessageGroupServiceResolver() {},
    };

    MessageRouterSetup.create = async () => router;

    try {
      const phase = new ConnectWebSocketPhase({
        nodeId: 'joining-node-1',
        delegates: {
          getWsPort: () => 9090,
          getIdentifyPayload: () => ({role: 'joining'}),
          getNodeAddress: () => 'joining-node-1:8080',
          getLogger: () => ({
            info() {},
            warn(message, details) {
              warningEvents.push({message, details});
            },
            error(errorMessage) {
              throw new Error(`unexpected error log: ${errorMessage}`);
            },
            debug() {},
          }),
          getNow: () => () => nowMs,
          getSleep: () => async (delayMs) => {
            sleepCalls.push(delayMs);
            nowMs += delayMs;
          },
          getConfig: () => ({
            httpTimeoutMs: 30000,
            leadershipWaitTimeoutMs: 100,
            leadershipWaitInitialDelayMs: 25,
            leadershipWaitMaxDelayMs: 50,
            leadershipWaitBackoffMultiplier: 2,
          }),
          resolveJoinRetryPolicy: () => ({
            retryTimeoutMs: 100,
            initialDelayMs: 25,
            maxDelayMs: 50,
            backoffMultiplier: 2,
          }),
          computeSeedContactRetryDelayMs: ({baseDelayMs, maxDelayMs}) =>
            Math.min(baseDelayMs, maxDelayMs),
          getMessageRouter: () => currentRouter,
          setMessageRouter(routerInstance) {
            currentRouter = routerInstance;
          },
          setTransport() {},
          initializeJoiningLifecycleOwners: async () => {},
          triggerJoinReconciler: async () => {},
          getSeedNodeWsAddress: () => 'ws://seed-node:8082',
          getSeedNodeId: () => 'seed-node',
          getBootstrapResponse: () =>
            createBootstrapResponseWithPeerEndpoints(
              'joining-node-1',
              'peer-node-1',
              'peer-node-2',
            ),
          resolveMeshConnectivityNodeRows: () => ({
            source: 'bootstrap_snapshot',
            rows: [
              {
                node_id: 'joining-node-1',
                node_address: 'joining-node-1:8080',
              },
              {
                node_id: 'peer-node-1',
                node_address: 'peer-node-1:8080',
              },
              {
                node_id: 'peer-node-2',
                node_address: 'peer-node-2:8080',
              },
            ],
          }),
          buildClusterMeshSignature: () => 'mesh-signature',
          setLastClusterMeshSignature: () => {},
          sendControlPlaneNodeStateUpdate: async (payload) => {
            sentNodeStateUpdate = payload;
          },
          getNodeCapabilities: () => ['sql'],
          getLeaderMessageGroupService: () => null,
        },
      });

      await phase.phaseConnectWebSocket();

      assert.equal(
        sleepCalls.length,
        0,
        'phase should not spend retry backoff once peer mesh is reachable',
      );
      assert.deepEqual(
        connectCalls.map((call) => call.nodeId),
        ['seed-node', 'peer-node-1', 'peer-node-2'],
        'phase should attempt seed once, then build the peer mesh instead of retrying seed',
      );
      assert.equal(
        sentNodeStateUpdate?.state,
        'connected',
        'phase should continue to publish connected state after peer-mesh fallback',
      );
      assert.ok(
        warningEvents.some((event) =>
          event.message.includes('Proceeding with peer mesh')),
        'phase should log peer-mesh fallback diagnostics after seed connect failure',
      );
    } finally {
      MessageRouterSetup.create = originalCreate;
    }
  },
);

test(
  'ConnectWebSocketPhase defers connected publication on transport-class control-plane failures',
  async () => {
    const originalCreate = MessageRouterSetup.create;
    const warningEvents = [];
    let currentRouter = null;
    let connectedStateUpdateCalls = 0;

    const router = {
      nodeConnections: new Map([
        ['seed-node', {state: 'connected'}],
      ]),
      async connectToNode(nodeId, address) {
        this.nodeConnections.set(nodeId, {state: 'connected', address});
      },
      getConnectionState(nodeId) {
        return this.nodeConnections.get(nodeId)?.state || null;
      },
      getConnectedNodes() {
        return Array.from(this.nodeConnections.keys());
      },
      hasSelfConnection() {
        return true;
      },
      setQueryMessageGroupServiceResolver() {},
    };

    MessageRouterSetup.create = async () => router;

    try {
      const phase = new ConnectWebSocketPhase({
        nodeId: 'joining-node-1',
        delegates: {
          getWsPort: () => 9090,
          getIdentifyPayload: () => ({role: 'joining'}),
          getNodeAddress: () => 'joining-node-1:8080',
          getLogger: () => ({
            info() {},
            warn(message, details) {
              warningEvents.push({message, details});
            },
            error(errorMessage) {
              throw new Error(`unexpected error log: ${errorMessage}`);
            },
            debug() {},
          }),
          getNow: () => () => 0,
          getSleep: () => async () => {},
          getConfig: () => ({
            httpTimeoutMs: 30000,
            leadershipWaitTimeoutMs: 100,
            leadershipWaitInitialDelayMs: 25,
            leadershipWaitMaxDelayMs: 50,
            leadershipWaitBackoffMultiplier: 2,
          }),
          resolveJoinRetryPolicy: () => ({
            retryTimeoutMs: 100,
            initialDelayMs: 25,
            maxDelayMs: 50,
            backoffMultiplier: 2,
          }),
          computeSeedContactRetryDelayMs: ({baseDelayMs, maxDelayMs}) =>
            Math.min(baseDelayMs, maxDelayMs),
          getMessageRouter: () => currentRouter,
          setMessageRouter(routerInstance) {
            currentRouter = routerInstance;
          },
          setTransport() {},
          initializeJoiningLifecycleOwners: async () => {},
          triggerJoinReconciler: async () => {},
          getSeedNodeWsAddress: () => 'ws://seed-node:8082',
          getSeedNodeId: () => 'seed-node',
          getBootstrapResponse: () =>
            createBootstrapResponseWithPeerEndpoints(
              'joining-node-1',
              'seed-node',
            ),
          resolveMeshConnectivityNodeRows: () => ({
            source: 'cache',
            rows: [
              {
                node_id: 'joining-node-1',
                node_address: 'joining-node-1:8080',
              },
              {
                node_id: 'seed-node',
                node_address: 'seed-node:8080',
              },
            ],
          }),
          buildClusterMeshSignature: () => 'mesh-signature',
          setLastClusterMeshSignature: () => {},
          sendControlPlaneNodeStateUpdate: async () => {
            connectedStateUpdateCalls += 1;
            const cause = new Error('Message timeout');
            throw new Error(`Control plane message failed: ${cause.message}`, {
              cause,
            });
          },
          shouldRetryControlPlaneNodeStateUpdate: (error) =>
            error?.message === 'Message timeout',
          getNodeCapabilities: () => ['sql'],
          getLeaderMessageGroupService: () => null,
        },
      });

      await phase.phaseConnectWebSocket();

      assert.equal(
        connectedStateUpdateCalls,
        1,
        'phase should still attempt one connected publication',
      );
      assert.ok(
        warningEvents.some((event) =>
          event.message.includes('Deferring connected NODE_STATE_UPDATE')),
        'phase should downgrade transport-class connected publication failures',
      );
    } finally {
      MessageRouterSetup.create = originalCreate;
    }
  },
);

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
