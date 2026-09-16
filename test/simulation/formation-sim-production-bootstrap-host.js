// The positive simulated node whose phase-one infrastructure is composed by
// production, not by the harness.
//
// The legacy simulated host builds a node's infrastructure itself: it hands a
// scenario a cache, a CDC service, a rebalancer and a control-plane readiness
// service that the harness assembled. That is why the simulator never hosted
// production's replica population - the harness was the composer, so the
// composition was the harness's opinion rather than production's behavior.
//
// This host composes nothing semantic. It supplies ENVIRONMENT - a node
// identity, a runtime, a thread manager, a virtual network, that node's
// clock, a physical connection environment and the factory that builds a
// router inside it - and then lets a real BootstrapService run the real
// SeedInfrastructurePhase. Everything the phase produces is production's.
//
// The one rule this file enforces is a harness rule, not a production one:
// EXACTLY ONE INFRASTRUCTURE COMPOSER PER POSITIVE SIMULATED NODE.
// BootstrapService cannot detect that a simulator also built a competing cache
// for the same node, and should not try; a production service has no business
// knowing what a test harness assembled. So the refusal lives here, at
// composition admission, where the harness knows both sides.
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {NodeService} from '../../src/node/node-service.js';
import {
  runOnExecutionNode, runOnSimulationGenerationRoot,
} from '../../src/diagnostics/formation-turn-attribution.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {
  createVirtualConnectionEnvironment,
} from '../distributed/harness/virtual-connection-environment.js';
import {
  HARNESS_COMPOSITION_REFUSAL,
  HarnessCompositionError,
  PRODUCTION_BOOTSTRAP_COMPOSER,
  createInfrastructureCompositionRegistry,
} from './formation-sim-infrastructure-composition.js';

// Arguments that would mean the harness had already composed semantic
// infrastructure for this node. Accepting any of them would silently pick one
// of two infrastructure sets and hide the other.
const PRECOMPOSED_INFRASTRUCTURE_KEYS = Object.freeze([
  'legacyHost',
  'messageRouter',
  'systemTableCache',
  'cdcIntegrationService',
  'rebalanceCoordinator',
  'controlPlaneReadinessService',
  'tablePolicyService',
  'partitionService',
  'messageGroupService',
]);

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

function refusePrecomposedInfrastructure(options) {
  for (const key of PRECOMPOSED_INFRASTRUCTURE_KEYS) {
    if (options[key] === undefined || options[key] === null) continue;
    throw new HarnessCompositionError(
      HARNESS_COMPOSITION_REFUSAL.PRECOMPOSED_INFRASTRUCTURE_ARGUMENT,
      `${key} was supplied to ${PRODUCTION_BOOTSTRAP_COMPOSER}: phase-one ` +
      'infrastructure is composed by BootstrapService, not handed to it');
  }
}

/**
 * Compose a positive simulated node whose phase-one infrastructure is built by
 * a real BootstrapService.
 *
 * @param {Object} options - Environment only. See PRECOMPOSED_INFRASTRUCTURE_KEYS
 *   for what is refused.
 * @return {Object} the host.
 */
function createProductionBootstrapPhaseOneHost(options = {}) {
  refusePrecomposedInfrastructure(options);
  const {
    nodeId, nodeAddress, wsPort, network,
    compositionRegistry = createInfrastructureCompositionRegistry(),
    connectionEnvironment =
    createVirtualConnectionEnvironment({network}),
  } = options;
  compositionRegistry.claim(nodeId, PRODUCTION_BOOTSTRAP_COMPOSER);

  const threadManager = createVirtualThreadManager();
  // The node's own clock, through NodeService's existing clock authority
  // rather than a second one invented for the simulator.
  const timeSource = network.networkTimeSource(nodeId);
  // Uninitialised on purpose: the production phase initialises it, and which
  // identity it ends up holding is one of the things under test.
  const nodeService = new NodeService({threadManager, timeSource});
  // The PHYSICAL environment the router is built in, and nothing above it.
  // inProcess selects the in-process transport; the environment decides which
  // registry that transport consults and how its frames move.
  const routerFactory = (routerOptions) => new MessageRouter({
    ...routerOptions,
    inProcess: true,
    inProcessConnectionEnvironment: connectionEnvironment.environment,
    // The router's ONE clock is this node's clock. Production supplies none
    // and gets the host's, which is what a RealTimeSource read means and why
    // strict mode refuses it here.
    timeSource,
  });
  const bootstrap = new BootstrapService({
    nodeId, nodeAddress, wsPort, nodeService, routerFactory,
  });
  const routerOptionsSeen = [];
  const observedRouterFactory = (routerOptions) => {
    routerOptionsSeen.push(routerOptions);
    return routerFactory(routerOptions);
  };
  bootstrap.routerFactory = observedRouterFactory;
  bootstrap.seedInfrastructurePhase.routerFactory = observedRouterFactory;

  return {
    nodeId,
    bootstrap,
    nodeService,
    timeSource,
    threadManager,
    connectionEnvironment,
    compositionRegistry,
    routerOptionsSeen,
    phaseInfrastructure: () =>
      bootstrap.seedInfrastructurePhase.phaseInfrastructure(),
    // Observation only: what this packet says is where each object came from,
    // never what it is allowed to do.
    provenance: () => ({
      nodeId,
      nodeService: {owner: 'supplied runtime'},
      router: {
        owner: 'SeedInfrastructurePhase -> MessageRouterSetup',
        physicalEnvironment: 'VirtualConnectionEnvironment',
      },
      serviceLifecycleManager: {owner: 'StartupServiceLifecycleOwner'},
      serviceReconciler: {owner: 'StartupServiceLifecycleOwner'},
    }),
    // Owner order: the lifecycle owners the phase started, then the router
    // the setup owner created, then the runtime that owns both.
    async stop() {
      bootstrap.seedInfrastructurePhase.stopUnifiedLifecycleOwners();
      if (bootstrap.messageRouter) await bootstrap.messageRouter.shutdown();
      await nodeService.shutdown();
      compositionRegistry.release(nodeId);
    },
  };
}

/**
 * Compose node-0, run the real phase, drain to a horizon and tear down,
 * returning the transcript the network recorded.
 *
 * The transcript is the whole observable of the run: every delivery and
 * firing, in the order the scheduler chose, at the virtual instant it
 * happened. It is what a determinism gate compares, and the only thing that
 * may NOT depend on how fast the host ran.
 *
 * @param {Object} options - {nodeId, nodeAddress, wsPort, hostLoad}.
 * @return {Promise<{transcript: string[], digest: string, nowMs: number}>}
 */
async function runProductionPhaseOneTranscript({
  nodeId = 'node-0',
  nodeAddress = 'ws://127.0.0.1:19951',
  wsPort = 19951,
  hostLoad = () => undefined,
  deliveryHorizonMs = 10,
  teardownHorizonMs = 50,
} = {}) {
  const network = createVirtualNetwork({startMs: 0});
  const connectionEnvironment = createVirtualConnectionEnvironment({
    network, linkDelayMs: 1,
  });
  network.registerNode(nodeId, (message, api) =>
    connectionEnvironment.handleMessage(nodeId, message, api));
  const host = createProductionBootstrapPhaseOneHost({
    nodeId, nodeAddress, wsPort, network, connectionEnvironment,
  });
  const settle = async () => {
    for (let turn = 0; turn < 16; turn += 1) {
      hostLoad();
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
  const drain = async (untilMs) => {
    await settle();
    for (let step = 0; step < 400; step += 1) {
      const result = network.runStep({untilMs});
      await settle();
      if (!result.delivered) return;
    }
    throw new Error('the composed node did not settle within the horizon');
  };
  await runOnSimulationGenerationRoot(`${nodeId}-phase-one`, () =>
    runOnExecutionNode(nodeId, () => host.phaseInfrastructure()));
  await drain(deliveryHorizonMs);
  // Teardown has consequences on the link of its own, past the delivery
  // horizon: a socket close is a frame like any other.
  const stopping = host.stop();
  await drain(teardownHorizonMs);
  await stopping;
  await drain(teardownHorizonMs);
  const transcript = network.getRecords().map((entry) =>
    `${entry.kind}:${entry.type}:${entry.from}->${entry.to}`);
  return {
    transcript,
    digest: transcript.join('|'),
    nowMs: network.now(),
    pendingEventCount: network.pendingEventCount(),
  };
}

export {createProductionBootstrapPhaseOneHost, runProductionPhaseOneTranscript};
