// The seed. One node in a formation runs the real BootstrapService; the rest
// will later run the real join path, and the two stay visibly apart.
//
// This layer adds exactly one thing to a node environment: a production
// BootstrapService, and the seed phases it owns. It composes no cache, CDC
// service, rebalancer, control-plane readiness service, table policy service,
// partition service or message-group service; it refuses to be handed any of
// them.
//
// The transcript this host records answers "which production composition
// boundaries happened, and in what causal order". It is observation of
// boundaries production already has - an event the router emits, a delegate
// the phase calls, a field the bootstrap service sets - and nothing
// production does depends on whether anyone is watching.
import {TRANSPORT_EVENT} from '../../src/constants/transport.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {RECONCILER_EVENT} from '../../src/service/service-reconciler-contract.js';
import {
  runOnExecutionNode, runOnSimulationGenerationRoot,
} from '../../src/diagnostics/formation-turn-attribution.js';
import {
  deterministicProofEligibility, installDeterministicOwnerGuard,
  nondeterministicOwnerSeamLedger, resetNondeterministicOwnerSeamLedger,
} from './formation-sim-guard.js';
import {
  createProductionSimNodeEnvironment, createProductionSimScenario,
} from './formation-sim-production-node-environment.js';
import {
  advanceToNextInstant, closeCurrentInstant,
} from './formation-sim-quiescence.js';
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

const INFRASTRUCTURE_READY_REASON = 'bootstrap_infrastructure_ready';
const PHASE_INFRASTRUCTURE = 'infrastructure';
// Far enough past the link delay to let a phase's consequences land, and far
// short of the keepalive and reconcile cadences a composed node arms.
const SETTLE_HORIZON_MS = 50;

function refusePrecomposedInfrastructure(options) {
  for (const key of PRECOMPOSED_INFRASTRUCTURE_KEYS) {
    if (options[key] === undefined || options[key] === null) continue;
    throw new HarnessCompositionError(
      HARNESS_COMPOSITION_REFUSAL.PRECOMPOSED_INFRASTRUCTURE_ARGUMENT,
      `${key} was supplied to ${PRODUCTION_BOOTSTRAP_COMPOSER}: phase-one ` +
      'infrastructure is composed by BootstrapService, not handed to it');
  }
}

// Observe the two fields the startup lifecycle owner sets. They are ordinary
// assignments on the bootstrap service, so the observation is a property
// descriptor on the instance: the setter records and then stores, and nothing
// production does changes.
function observeLifecycleOwners(bootstrap, transcript, nodeId) {
  for (const [field, event] of [
    ['serviceLifecycleManager', 'LIFECYCLE_OWNER_CREATED'],
    ['serviceReconciler', 'SERVICE_RECONCILER_CREATED'],
  ]) {
    let held = bootstrap[field];
    Object.defineProperty(bootstrap, field, {
      configurable: true,
      get: () => held,
      set: (value) => {
        held = value;
        if (value === null || value === undefined) return;
        transcript.record(event, {nodeId, owner: 'StartupServiceLifecycleOwner'});
        if (field !== 'serviceReconciler') return;
        value.on(RECONCILER_EVENT.CYCLE_COMPLETE, (cycle) => {
          if (cycle?.reason !== INFRASTRUCTURE_READY_REASON) return;
          transcript.record('BOOTSTRAP_INFRASTRUCTURE_READY', {
            nodeId, owner: 'ServiceReconciler', phase: PHASE_INFRASTRUCTURE,
          });
        });
      },
    });
  }
}

// Protocol meaning is the router's. The transport environment reports that a
// frame moved; that a frame WAS an IDENTIFY is decided here, at the router's
// own control boundary, from the event it already emits.
function observeIdentification(router, transcript, nodeId) {
  router.on(TRANSPORT_EVENT.NODE_IDENTIFIED, (identified) => {
    transcript.record('IDENTIFY_RECEIVED', {
      nodeId, peerNodeId: identified.nodeId, owner: 'MessageRouter',
    });
    if (identified.nodeId !== nodeId) return;
    transcript.record('SELF_IDENTITY_BOUND', {
      nodeId, peerNodeId: identified.nodeId, owner: 'MessageRouter',
    });
  });
}

/**
 * Mount the real seed bootstrap on a node environment.
 *
 * @param {Object} environment - from createProductionSimNodeEnvironment.
 * @param {Object} [options] - {compositionRegistry}; precomposed
 *   infrastructure is refused.
 * @return {Object} the seed host.
 */
function createProductionSeedSimHost(environment, options = {}) {
  refusePrecomposedInfrastructure(options);
  const {
    nodeId, nodeAddress, wsPort, network, transcript, connectionEnvironment,
    routerFactory,
  } = environment;
  const compositionRegistry = options.compositionRegistry ||
    createInfrastructureCompositionRegistry();
  compositionRegistry.claim(nodeId, PRODUCTION_BOOTSTRAP_COMPOSER);

  const bootstrap = new BootstrapService({
    nodeId, nodeAddress, wsPort,
    nodeService: environment.nodeService, routerFactory,
  });
  observeLifecycleOwners(bootstrap, transcript, nodeId);
  transcript.record('HOST_CREATED', {nodeId, owner: 'BootstrapService'});

  // The scenario's causal-closure authority, not a second one. The host never
  // decides when the world is at rest; it asks the owner that already does.
  const closeInstant = (owners = []) => closeCurrentInstant({network, owners});
  async function settleCausalConsequences(
    horizonMs = SETTLE_HORIZON_MS, owners = [],
  ) {
    await closeInstant(owners);
    for (let guard = 0; guard < 10000; guard += 1) {
      const at = await advanceToNextInstant({network, owners, horizonMs});
      if (at === null) return;
    }
    throw new Error('the composed node did not reach causal closure');
  }

  return {
    nodeId, environment, bootstrap, compositionRegistry,
    transcript: () => transcript,
    // "The phase returned" and "the phase's consequences settled" are
    // different facts, and phase one is the place that proves it: the self
    // socket is open and its IDENTIFY is still in flight when the phase
    // returns. Production is right to return there, and the host is what
    // knows how to wait.
    closeCurrentInstant: closeInstant,
    settleCausalConsequences,
    // Sealing records nothing. It states that the scenario is over, so any
    // later semantic entry is a failure rather than a late arrival.
    seal: () => transcript.seal(),
    async phaseInfrastructure() {
      transcript.record('PHASE_INFRASTRUCTURE_STARTED', {
        nodeId, phase: PHASE_INFRASTRUCTURE,
      });
      await bootstrap.seedInfrastructurePhase.phaseInfrastructure();
      if (bootstrap.messageRouter) {
        observeIdentification(bootstrap.messageRouter, transcript, nodeId);
      }
      transcript.record('PHASE_INFRASTRUCTURE_COMPLETED', {
        nodeId, phase: PHASE_INFRASTRUCTURE,
      });
    },
    provenance: () => ({
      ...environment.provenance(),
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
      transcript.record('TEARDOWN_STARTED', {nodeId});
      bootstrap.seedInfrastructurePhase.stopUnifiedLifecycleOwners();
      if (bootstrap.messageRouter) await bootstrap.messageRouter.shutdown();
      await environment.stop();
      compositionRegistry.release(nodeId);
      transcript.record('TEARDOWN_COMPLETED', {nodeId});
    },
    // Read-only physical facts the witnesses assert on.
    endpoints: connectionEnvironment.environment,
  };
}

/**
 * Run the focused seed phase-one scenario and return everything a
 * determinism gate compares.
 *
 * Four artifacts, each answering a different question and each required to be
 * exact: the host transcript (which production boundaries happened, in what
 * causal order), the VirtualNetwork transcript (what the scheduler did), the
 * strict report (whether any ambient seam was reached), and the provenance
 * snapshot (who owned what at the end).
 *
 * `hostLoad` is ordinary host burden, run as an owner-idle contract inside
 * the existing closure authority - not a hook this module invented, and not
 * anything that schedules.
 *
 * @param {Object} [options] - {nodeId, nodeAddress, wsPort, hostLoad, observe}.
 * @return {Promise<Object>} the comparable artifacts.
 */
async function runSeedPhaseOneScenario({
  nodeId = 'node-0',
  nodeAddress = 'ws://127.0.0.1:19960',
  wsPort = 19960,
  hostLoad = null,
  observer = null,
} = {}) {
  installDeterministicOwnerGuard();
  resetNondeterministicOwnerSeamLedger();
  const generation = `${nodeId}-seed-phase-one`;
  if (observer) observer.begin(generation);
  const scenario = createProductionSimScenario();
  const environment = createProductionSimNodeEnvironment({
    nodeId, nodeAddress, wsPort, scenario,
  });
  const host = createProductionSeedSimHost(environment);
  const owners = typeof hostLoad === 'function' ? [() => {
    hostLoad();
  }] : [];
  await runOnSimulationGenerationRoot(generation, () =>
    runOnExecutionNode(nodeId, () => host.phaseInfrastructure()));
  const afterPhaseReturned = host.transcript().serialize();
  await host.settleCausalConsequences(SETTLE_HORIZON_MS, owners);
  const afterCausalClosure = host.transcript().serialize();
  await host.stop();
  await host.settleCausalConsequences(SETTLE_HORIZON_MS, owners);
  host.seal();
  if (observer) observer.seal();
  const eligibility = deterministicProofEligibility();
  const ledger = nondeterministicOwnerSeamLedger();
  return {
    afterPhaseReturned,
    afterCausalClosure,
    hostTranscript: host.transcript().serialize(),
    hostTranscriptLength: host.transcript().length(),
    networkTranscript: scenario.network.getRecords()
      .map((entry) =>
        `${entry.timeMs} ${entry.kind}:${entry.type}:${entry.from}->${entry.to}`)
      .join('\n'),
    strictReport: [
      `mode=${eligibility.ambientSeamMode}`,
      `violations=${eligibility.ambientSeamViolationCount}`,
      `substitutions=${eligibility.ambientSeamSubstitutionCount}`,
      `eligible=${eligibility.deterministicProofEligible}`,
      `ledger=${ledger.count}`,
    ].join(' '),
    provenanceSnapshot: JSON.stringify(host.provenance()),
    nowMs: scenario.network.now(),
    enqueueEpoch: scenario.network.enqueueEpoch(),
    pendingEventCount: scenario.network.pendingEventCount(),
    // Held so a caller can prove the seal holds without re-running anything.
    scenario, host,
  };
}

export {createProductionSeedSimHost, runSeedPhaseOneScenario};
