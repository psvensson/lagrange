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
const PHASE_MESSAGE_GROUPS = 'message_groups';
const MESSAGE_GROUP_SERVICE_TYPE = 'message_group';
const SERVICE_DESCRIPTOR_SERVICE_ID = 'service_id';
// Far enough past the link delay to let a phase's consequences land, and far
// short of the keepalive and reconcile cadences a composed node arms.
const SETTLE_HORIZON_MS = 50;
// Past the replica stagger a phase may pace itself on, and far short of the
// keepalive and reconcile cadences a composed node arms.
const PHASE_HORIZON_MS = 1000;

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
        value.on(RECONCILER_EVENT.DECISION, (decision) => {
          transcript.record('RECONCILER_ACTION_EXECUTED', {
            nodeId, owner: 'ServiceReconciler',
            actionType: decision?.action?.type ?? null,
            replicaId: decision?.action?.serviceId ??
              decision?.action?.definition?.serviceId ?? null,
          });
        });
      },
    });
  }
}

// The message-group chain, observed at the boundaries production already has:
// the declaration the phase queues, the action the reconciler executes, and
// the create and start hooks the lifecycle owner drives. Each is an ordinary
// method on a phase instance, so the observation is a property descriptor
// that records around the real one and changes nothing.
function observeMessageGroupChain(bootstrap, transcript, nodeId) {
  const infrastructure = bootstrap.seedInfrastructurePhase;
  const groups = bootstrap.seedMessageGroupsPhase;

  const queueReplica = infrastructure.queueBootstrapServiceReplica
    .bind(infrastructure);
  Object.defineProperty(infrastructure, 'queueBootstrapServiceReplica', {
    configurable: true,
    value: (descriptor, options) => {
      const result = queueReplica(descriptor, options);
      if (options?.serviceType === MESSAGE_GROUP_SERVICE_TYPE) {
        transcript.record('MESSAGE_GROUP_REPLICA_DECLARED', {
          nodeId, owner: 'SeedMessageGroupsPhase',
          groupId: options.groupId, replicaId: options.replicaId,
        });
      }
      return result;
    },
  });

  for (const [method, event] of [
    ['createBootstrapMessageGroupReplica', 'MESSAGE_GROUP_REPLICA_CREATED'],
    ['startBootstrapMessageGroupReplica', 'MESSAGE_GROUP_REPLICA_STARTED'],
  ]) {
    const real = groups[method].bind(groups);
    Object.defineProperty(groups, method, {
      configurable: true,
      value: async (...args) => {
        const result = await real(...args);
        const replicaId = resolveObservedReplicaId(bootstrap, args);
        transcript.record(event, {
          nodeId, owner: 'SeedMessageGroupsPhase',
          groupId: observedGroupId(bootstrap, replicaId), replicaId,
        });
        return result;
      },
    });
  }
}

// The replica this hook acted on, read from the arguments the lifecycle owner
// passed rather than from any state the host keeps.
// Where a lifecycle hook's arguments name the replica they act on. The create
// hook is handed a context; the start hook is handed the replica handle first
// and the context second. Both name the same replica, and the transcript uses
// the declaration's name for both so the chain reads as one replica's story.
const OBSERVED_REPLICA_ID_PATHS = Object.freeze([
  (argument) => argument.replicaOptions?.replicaId,
  (argument) => argument.definition?.[SERVICE_DESCRIPTOR_SERVICE_ID],
  (argument) => argument.definition?.serviceId,
  (argument) => argument.serviceId,
]);

function resolveObservedReplicaId(bootstrap, args) {
  for (const argument of args) {
    if (!argument || typeof argument !== 'object') continue;
    for (const read of OBSERVED_REPLICA_ID_PATHS) {
      const replicaId = read(argument);
      if (replicaId) return replicaId;
    }
  }
  return null;
}

function observedGroupId(bootstrap, replicaId) {
  const service = bootstrap.messageGroupServices.get(replicaId);
  return service?.groupId ?? null;
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
  observeMessageGroupChain(bootstrap, transcript, nodeId);
  transcript.record('HOST_CREATED', {nodeId, owner: 'BootstrapService'});

  // The scenario's causal-closure authority, not a second one. The host never
  // decides when the world is at rest; it asks the owner that already does.
  // One real host turn, offered to the closure authority as an owner-idle
  // contract. Without it a composed node's production continuations never get
  // a macrotask between rounds, because closeCurrentInstant awaits only the
  // owners it is given. It decides nothing about closure: the authority still
  // does, and a turn that enqueues nothing ends the fixpoint.
  const hostTurn = () => new Promise((resolve) => setImmediate(resolve));
  const closeInstant = (owners = []) =>
    closeCurrentInstant({network, owners: [hostTurn, ...owners]});
  // The horizon is how much FURTHER the scenario may run, not an instant to
  // stop at: a phase that has already consumed virtual time still gets the
  // same room for its consequences as one that has not.
  async function settleCausalConsequences(
    horizonMs = SETTLE_HORIZON_MS, owners = [],
  ) {
    await closeInstant(owners);
    const until = network.now() + horizonMs;
    for (let guard = 0; guard < 10000; guard += 1) {
      const at = await advanceToNextInstant({
        network, owners: [hostTurn, ...owners], horizonMs: until,
      });
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
    // A production phase may itself BLOCK on virtual time - phase two paces
    // replica creation on the node's own clock - so the scheduler has to run
    // while the phase is in flight. Advancing only until the phase settles
    // keeps "the phase returned" and "its consequences settled" apart, which
    // is the distinction phase one established.
    async driveUntilSettled(promise, horizonMs = PHASE_HORIZON_MS) {
      let settled = false;
      const watched = promise.then(
        (value) => {
          settled = true;
          return value;
        },
        (error) => {
          settled = true;
          throw error;
        },
      );
      watched.catch(() => undefined);
      await closeInstant();
      const until = network.now() + horizonMs;
      while (!settled) {
        const at = await advanceToNextInstant({
          network, owners: [hostTurn], horizonMs: until,
        });
        if (at === null) break;
      }
      return watched;
    },
    startPhaseMessageGroups: async () => {
      transcript.record('PHASE_MESSAGE_GROUPS_STARTED', {
        nodeId, phase: PHASE_MESSAGE_GROUPS,
      });
      await bootstrap.seedMessageGroupsPhase.phaseMessageGroups();
      for (const [replicaId, service] of bootstrap.messageGroupServices) {
        if (service?.deferElection !== true) continue;
        transcript.record('MESSAGE_GROUP_ELECTION_DEFERRED', {
          nodeId, owner: 'MessageGroupService',
          groupId: service.groupId ?? null, replicaId,
        });
      }
      transcript.record('PHASE_MESSAGE_GROUPS_COMPLETED', {
        nodeId, phase: PHASE_MESSAGE_GROUPS,
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
async function runSeedScenario({
  nodeId = 'node-0',
  nodeAddress = 'ws://127.0.0.1:19960',
  wsPort = 19960,
  hostLoad = null,
  observer = null,
  throughMessageGroups = false,
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
  if (throughMessageGroups) {
    // Phase two paces itself on the node's clock, so the scheduler runs while
    // the phase is in flight; the host advances only until the phase settles.
    const running = runOnSimulationGenerationRoot(generation, () =>
      runOnExecutionNode(nodeId, () => host.startPhaseMessageGroups()));
    await host.driveUntilSettled(running);
    await host.settleCausalConsequences(SETTLE_HORIZON_MS, owners);
  }
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

// Phase one only: the composition proof and its determinism gates.
const runSeedPhaseOneScenario = (options = {}) =>
  runSeedScenario({...options, throughMessageGroups: false});

// Phase one and then the real message-group phase: B's chain.
const runSeedMessageGroupsScenario = (options = {}) =>
  runSeedScenario({...options, throughMessageGroups: true});

export {
  createProductionSeedSimHost,
  runSeedMessageGroupsScenario,
  runSeedPhaseOneScenario,
};
