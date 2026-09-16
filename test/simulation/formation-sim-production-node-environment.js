// The environment one production node runtime is hosted in, and nothing else.
//
// This layer composes NO SEMANTIC INFRASTRUCTURE. It owns the things a node
// needs in order to exist at all - an identity, a runtime, a thread manager,
// a place on the virtual network, that node's clock, its endpoint on the
// scenario's physical transport, and the factory that builds a router inside
// it - and then stops. What a node BECOMES is decided by a production owner
// mounted on top: the seed bootstrap for node-0, and later the real join path
// for the nodes that join it.
//
// Keeping those apart is the point. A single host that took a
// mode: 'seed' | 'join' and branched through shared lifecycle code would
// merge two production owners that are genuinely distinct, and the simulator
// would stop being able to tell which one it was measuring.
import {MessageRouter} from '../../src/transport/message-router.js';
import {NodeService} from '../../src/node/node-service.js';
import {
  createVirtualConnectionEnvironment,
} from '../distributed/harness/virtual-connection-environment.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {
  TRANSCRIPT_FRAME_KIND,
} from './formation-sim-host-transcript-events.js';
import {createHostTranscript} from './formation-sim-host-transcript.js';

// The node's thread pool is host physics, like its sockets: a real Piscina
// pool would spawn OS worker threads whose scheduling the simulator does not
// own and whose teardown outlives the seal. This satisfies the contract
// NodeService actually consumes - initialization state and pool statistics -
// and composes nothing.
function createVirtualThreadManager() {
  return {
    pool: null,
    services: new Map(),
    isInitialized: () => true,
    initialize() {},
    getPoolStats() {
      return {completed: 0, threads: 0};
    },
    async shutdown() {},
  };
}

// The physical transport observer, translated from link vocabulary into the
// transcript's. Capture only: it returns nothing anyone waits on.
function physicalTranscriptObserver(transcript) {
  const FRAME_KIND = {
    data: TRANSCRIPT_FRAME_KIND.DATA, close: TRANSCRIPT_FRAME_KIND.CLOSE,
  };
  return (report) => {
    if (report.kind === 'virtual_endpoint_registered') {
      transcript.record('VIRTUAL_ENDPOINT_REGISTERED', {nodeId: report.nodeId});
      return;
    }
    if (report.kind === 'virtual_endpoint_released') {
      transcript.record('VIRTUAL_ENDPOINT_RELEASED', {nodeId: report.nodeId});
      return;
    }
    if (report.kind === 'dial_started') {
      transcript.record('SELF_DIAL_STARTED', {
        nodeId: report.fromNodeId, peerNodeId: report.toNodeId,
      });
      return;
    }
    if (report.kind === 'physical_socket_open') {
      transcript.record('PHYSICAL_SOCKET_OPEN', {
        nodeId: report.fromNodeId, peerNodeId: report.toNodeId,
      });
      return;
    }
    if (report.kind === 'frame_enqueued') {
      transcript.record('FRAME_ENQUEUED', {
        nodeId: report.fromNodeId, peerNodeId: report.toNodeId,
        frameKind: FRAME_KIND[report.frameKind],
      });
      return;
    }
    if (report.kind === 'frame_delivered') {
      transcript.record('FRAME_DELIVERED', {
        nodeId: report.toNodeId, peerNodeId: report.fromNodeId,
        frameKind: FRAME_KIND[report.frameKind],
      });
    }
  };
}

/**
 * Create the scenario-level surroundings several node environments share: one
 * deterministic scheduler, one physical transport with a scenario-local
 * endpoint registry, and one transcript.
 * @param {Object} [options] - {startMs, linkDelayMs}.
 * @return {Object} the scenario surroundings.
 */
function createProductionSimScenario({startMs = 0, linkDelayMs = 1} = {}) {
  const network = createVirtualNetwork({startMs});
  const transcript = createHostTranscript({network});
  const connectionEnvironment = createVirtualConnectionEnvironment({
    network, linkDelayMs, observe: physicalTranscriptObserver(transcript),
  });
  return {network, transcript, connectionEnvironment};
}

/**
 * Host one production node runtime's environment on a scenario.
 *
 * @param {Object} options - {nodeId, nodeAddress, wsPort, scenario}.
 * @return {Object} the node environment.
 */
function createProductionSimNodeEnvironment({
  nodeId, nodeAddress, wsPort,
  scenario = createProductionSimScenario(),
} = {}) {
  const {network, transcript, connectionEnvironment} = scenario;
  // This node's own place on the network, and its own handler chain entry.
  network.registerNode(nodeId, (message, api) =>
    connectionEnvironment.handleMessage(nodeId, message, api));
  const threadManager = createVirtualThreadManager();
  // The node's own clock, threaded through NodeService's existing clock
  // authority rather than a second one invented for the simulator.
  const timeSource = network.networkTimeSource(nodeId);
  // Uninitialised on purpose: a production owner initialises it, and which
  // identity it ends up holding is one of the things under test.
  const nodeService = new NodeService({threadManager, timeSource});
  // initialize() is the boundary, so the entry is recorded where it happens
  // rather than inferred afterwards from the phase's return. NodeService
  // emits nothing here, so the observation is a property descriptor on the
  // instance: it records after the real method returns and changes nothing.
  const initializeRuntime = nodeService.initialize.bind(nodeService);
  Object.defineProperty(nodeService, 'initialize', {
    configurable: true,
    value: (initializeOptions) => {
      const alreadyInitialized = nodeService.isInitialized();
      const result = initializeRuntime(initializeOptions);
      if (!alreadyInitialized && nodeService.isInitialized()) {
        transcript.record('NODE_RUNTIME_INITIALIZED', {
          nodeId: nodeService.getNodeId(),
        });
      }
      return result;
    },
  });
  const routerOptionsSeen = [];
  // The PHYSICAL environment a router is built in, and nothing above it.
  // inProcess selects the in-process transport; the connection environment
  // decides which registry that transport consults and how its frames move.
  const routerFactory = (routerOptions) => {
    routerOptionsSeen.push(routerOptions);
    transcript.record('ROUTER_FACTORY_CALLED', {nodeId});
    const router = new MessageRouter({
      ...routerOptions,
      inProcess: true,
      inProcessConnectionEnvironment: connectionEnvironment.environment,
      timeSource,
    });
    transcript.record('ROUTER_CREATED', {nodeId});
    return router;
  };
  return {
    nodeId, nodeAddress, wsPort,
    scenario, network, transcript, connectionEnvironment,
    nodeService, threadManager, timeSource, routerFactory, routerOptionsSeen,
    // Observation only: where each object came from, never what it may do.
    provenance: () => ({
      nodeId,
      nodeService: {owner: 'supplied runtime'},
      threadManager: {owner: 'supplied runtime'},
      physicalEnvironment: {owner: 'VirtualConnectionEnvironment'},
    }),
    async stop() {
      await nodeService.shutdown();
      transcript.record('NODE_RUNTIME_STOPPED', {nodeId});
    },
  };
}

export {
  createProductionSimNodeEnvironment,
  createProductionSimScenario,
};
