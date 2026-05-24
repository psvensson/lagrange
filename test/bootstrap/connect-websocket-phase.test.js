import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import {
  ConnectWebSocketPhase,
} from '../../src/bootstrap/phases/connect-websocket-phase.js';
import {
  MessageRouterSetup,
} from '../../src/bootstrap/shared/message-router-setup.js';
import {registerConnectWebSocketPhaseMeshTests} from './connect-websocket-phase-mesh-test-cases.js';

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
  'ConnectWebSocketPhase marks exhausted seed websocket timeout retryable',
  async () => {
    const originalCreate = MessageRouterSetup.create;
    let nowMs = 0;
    const sleepCalls = [];
    const warningEvents = [];
    const errorEvents = [];
    const connectCalls = [];
    let currentRouter = null;

    const router = {
      nodeConnections: new Map(),
      async connectToNode(nodeId, address) {
        connectCalls.push({nodeId, address});
        const error = new Error('WebSocket connection timeout after 5000ms');
        error.code = 'WS_CONNECT_TIMEOUT';
        throw error;
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
            error(message, details) {
              errorEvents.push({message, details});
            },
            debug() {},
          }),
          getNow: () => () => nowMs,
          getSleep: () => async (delayMs) => {
            sleepCalls.push(delayMs);
            nowMs += delayMs;
          },
          getConfig: () => ({
            leadershipWaitTimeoutMs: 50,
            leadershipWaitInitialDelayMs: 25,
            leadershipWaitMaxDelayMs: 25,
            leadershipWaitBackoffMultiplier: 2,
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
          sendControlPlaneNodeStateUpdate: async () => {},
          getNodeCapabilities: () => ['sql'],
          getLeaderMessageGroupService: () => null,
        },
      });

      await assert.rejects(
        () => phase.phaseConnectWebSocket(),
        (error) => {
          assert.equal(error.code, 'WS_CONNECT_TIMEOUT');
          assert.equal(error.deferRetry, true);
          assert.equal(error.retryAfterMs, 25);
          return true;
        },
      );

      assert.equal(
        connectCalls.length,
        3,
        'seed websocket connect should spend the bounded retry window',
      );
      assert.deepEqual(
        sleepCalls,
        [25, 25],
        'seed websocket retry should spend bounded backoff before surfacing',
      );
      assert.ok(
        warningEvents.length > 0,
        'seed websocket retry exhaustion should preserve retry warnings',
      );
      assert.ok(
        errorEvents.length > 0,
        'seed websocket retry exhaustion should log the terminal phase error',
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
      assert.deepEqual(
        queryTransportResolver(),
        {
          state: 'deferred',
          ready: false,
          deferRetry: true,
          reason: 'Query/data-plane message-group transport is not configured',
          reasonCode: 'query_transport_not_ready',
          errorCode: 'ROUTER_QUERY_TRANSPORT_NOT_READY',
          retryAfterMs: null,
          service: null,
        },
        'uninitialized message-group service should return deferred query transport context',
      );

      leaderService.initialized = true;
      const resolvedLeaderSelection = queryTransportResolver();
      assert.equal(
        resolvedLeaderSelection.service,
        leaderService,
        'initialized message-group service should become the query transport',
      );
      assert.equal(
        resolvedLeaderSelection.ready,
        true,
        'initialized message-group service should be marked ready',
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
          state: 'deferred',
          ready: false,
          deferRetry: true,
          service: null,
          reason: 'operational message-group ingress not ready',
          reasonCode: 'query_transport_not_ready',
          errorCode: 'ROUTER_QUERY_TRANSPORT_NOT_READY',
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
        resolvedSelection.ready,
        true,
        'resolver should mark an initialized relay as ready',
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

registerConnectWebSocketPhaseMeshTests({
  assert,
  test,
});
