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
import {
  BOOTSTRAP_PHASE,
} from '../../src/bootstrap/bootstrap-constants.js';
import {
  StartupPipelineRunner,
} from '../../src/bootstrap/pipeline/startup-pipeline-runner.js';
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
const PHASE_INFRASTRUCTURE = BOOTSTRAP_PHASE.INFRASTRUCTURE;
const PHASE_MESSAGE_GROUPS = BOOTSTRAP_PHASE.MESSAGE_GROUPS;
const MESSAGE_GROUP_SERVICE_TYPE = 'message_group';
const PARTITION_SERVICE_TYPE = 'partition';
const PHASE_PARTITIONS = BOOTSTRAP_PHASE.PARTITIONS;
const PHASE_REGISTRATION = BOOTSTRAP_PHASE.REGISTRATION;
const PHASE_CACHE_HYDRATION = BOOTSTRAP_PHASE.CACHE_HYDRATION;
const BOOTSTRAP_WRITER = 'BootstrapSystemTableWriter';
const SERVICE_DESCRIPTOR_SERVICE_ID = 'service_id';
// Far enough past the link delay to let a phase's consequences land, and far
// short of the keepalive and reconcile cadences a composed node arms.
const SETTLE_HORIZON_MS = 50;
// Past the replica stagger a phase may pace itself on, and far short of the
// keepalive and reconcile cadences a composed node arms.
const PHASE_HORIZON_MS = 1000;
const PARTITION_PHASE_HORIZON_MS = 120000;

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
      if (options?.serviceType === PARTITION_SERVICE_TYPE) {
        transcript.record('PARTITION_REPLICA_DECLARED', {
          nodeId, owner: 'SeedPartitionsPhase',
          partitionId: options.partitionId, replicaId: options.replicaId,
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

// The partition create hook, observed at the same boundary as the message
// group's. One event per replica, and the partition it belongs to is read
// from the runtime the hook produced rather than from anything the host kept.
function observePartitionChain(bootstrap, transcript, nodeId) {
  const partitions = bootstrap.seedPartitionsPhase;
  const real = partitions.createBootstrapPartitionReplica.bind(partitions);
  Object.defineProperty(partitions, 'createBootstrapPartitionReplica', {
    configurable: true,
    value: async (...args) => {
      const result = await real(...args);
      const replicaId = resolveObservedReplicaId(bootstrap, args);
      transcript.record('PARTITION_REPLICA_CREATED', {
        nodeId, owner: 'SeedPartitionsPhase', replicaId,
        partitionId:
          bootstrap.partitionServices.get(replicaId)?.partitionId ?? null,
      });
      return result;
    },
  });
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

// Write authority changes hands exactly once, and the transcript records the
// two halves of the handover separately: the bootstrap writer is DISABLED and
// only then is the runtime writer ENABLED. Observed by wrapping the writer
// field production already assigns and the enable/disable each writer already
// has, so there is no interval in which the host has to infer who was
// writing.
function observeWriteAuthority(bootstrap, transcript, nodeId) {
  let held = bootstrap.systemTableWriter;
  const observeWriter = (writer) => {
    if (!writer || writer.__hostObserved) return writer;
    const name = writer.constructor.name;
    const isBootstrapWriter = name === BOOTSTRAP_WRITER;
    for (const [method, event] of [
      ['enable', isBootstrapWriter ? 'BOOTSTRAP_MODE_ENTERED' : null],
      ['disable', isBootstrapWriter ? 'BOOTSTRAP_MODE_EXITED' : null],
    ]) {
      if (!event || typeof writer[method] !== 'function') continue;
      const real = writer[method].bind(writer);
      Object.defineProperty(writer, method, {
        configurable: true,
        value: (...args) => {
          const result = real(...args);
          transcript.record(event, {nodeId, writer: name});
          return result;
        },
      });
    }
    writer.__hostObserved = true;
    return writer;
  };
  Object.defineProperty(bootstrap, 'systemTableWriter', {
    configurable: true,
    get: () => held,
    set: (value) => {
      held = observeWriter(value);
      // Production enables the runtime writer BEFORE installing it, so the
      // enable itself is preparation. Authority changes hands at the
      // INSTALL, because that is the field every consumer reads.
      if (value && value.constructor.name !== BOOTSTRAP_WRITER) {
        transcript.record('RUNTIME_WRITE_AUTHORITY_ENABLED', {
          nodeId, writer: value.constructor.name,
        });
      }
    },
  });
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
    routerFactory, randomSource,
  } = environment;
  const compositionRegistry = options.compositionRegistry ||
    createInfrastructureCompositionRegistry();
  compositionRegistry.claim(nodeId, PRODUCTION_BOOTSTRAP_COMPOSER);

  const bootstrap = new BootstrapService({
    nodeId, nodeAddress, wsPort,
    nodeService: environment.nodeService, routerFactory, randomSource,
  });
  // A seed phase is production's work, and production already owns the
  // boundary it is entered through: StartupPipelineRunner.run() is where
  // runBootstrapActivity wraps a phase. Calling the phase objects directly
  // executed the same work one level BELOW that boundary, so the bootstrap
  // owner was never entered. The host enters through the real runner instead
  // of declaring an owner itself - the phase set is unchanged, one phase per
  // call, exactly as the production seed workflow runs them.
  const startupPipelineRunner = new StartupPipelineRunner({
    logger: environment.nodeService?.logger ?? console,
  });
  const runSeedPhase = (name, run) =>
    startupPipelineRunner.run({phases: [{name, run}]});
  observeLifecycleOwners(bootstrap, transcript, nodeId);
  observeMessageGroupChain(bootstrap, transcript, nodeId);
  observePartitionChain(bootstrap, transcript, nodeId);
  observeWriteAuthority(bootstrap, transcript, nodeId);
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
      await runSeedPhase(PHASE_INFRASTRUCTURE,
        () => bootstrap.seedInfrastructurePhase.phaseInfrastructure());
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
      await runSeedPhase(PHASE_MESSAGE_GROUPS,
        () => bootstrap.seedMessageGroupsPhase.phaseMessageGroups());
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
    startPhasePartitions: async () => {
      transcript.record('PHASE_PARTITIONS_STARTED', {
        nodeId, phase: PHASE_PARTITIONS,
      });
      await runSeedPhase(PHASE_PARTITIONS,
        () => bootstrap.seedPartitionsPhase.phasePartitions());
      transcript.record('PHASE_PARTITIONS_COMPLETED', {
        nodeId, phase: PHASE_PARTITIONS,
      });
    },
    startPhaseRegistration: async () => {
      transcript.record('PHASE_REGISTRATION_STARTED', {
        nodeId, phase: PHASE_REGISTRATION,
      });
      await runSeedPhase(PHASE_REGISTRATION,
        () => bootstrap.seedRegistrationPhase.phaseRegistration());
      transcript.record('PHASE_REGISTRATION_COMPLETED', {
        nodeId, phase: PHASE_REGISTRATION,
      });
    },
    startPhaseCacheHydration: async () => {
      transcript.record('PHASE_CACHE_HYDRATION_STARTED', {
        nodeId, phase: PHASE_CACHE_HYDRATION,
      });
      await runSeedPhase(PHASE_CACHE_HYDRATION,
        () => bootstrap.seedCacheHydrationPhase.phaseCacheHydration());
      if (bootstrap.systemCacheHydrated) {
        transcript.record('SYSTEM_CACHE_HYDRATED', {
          nodeId, owner: 'SeedCacheHydrationPhase',
        });
      }
      transcript.record('PHASE_CACHE_HYDRATION_COMPLETED', {
        nodeId, phase: PHASE_CACHE_HYDRATION,
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
      // Production's own teardown first, because it is what stops the
      // RUNTIMES: with 135 partition replicas alive, stopping only the
      // lifecycle owners and the router leaves every replica's cadence armed
      // on the node's clock, and the scenario is not at rest afterwards.
      await bootstrap.shutdown();
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
// Ordinary host burden, offered to the closure authority as an owner-idle
// contract rather than through a hook invented for it.
function hostLoadOwners(hostLoad) {
  if (typeof hostLoad !== 'function') return [];
  return [() => {
    hostLoad();
  }];
}

// The strict verdict, flattened to one comparable line.
function serializeStrictReport() {
  const eligibility = deterministicProofEligibility();
  return [
    `mode=${eligibility.ambientSeamMode}`,
    `violations=${eligibility.ambientSeamViolationCount}`,
    `substitutions=${eligibility.ambientSeamSubstitutionCount}`,
    `eligible=${eligibility.deterministicProofEligible}`,
    `ledger=${nondeterministicOwnerSeamLedger().count}`,
  ].join(' ');
}

// The phases a scenario runs after phase one, with the horizon each needs.
// Phases after the first pace themselves on the node's clock, so the
// scheduler runs while each one is in flight and the host advances only until
// it settles.
// The seed phases in production order, with the horizon each needs. A
// scenario names how far it runs; everything before that point is implied,
// because a seed cannot hydrate a cache it never populated.
const SEED_PHASE_LADDER = Object.freeze([
  ['startPhaseMessageGroups', PHASE_HORIZON_MS],
  ['startPhasePartitions', PARTITION_PHASE_HORIZON_MS],
  ['startPhaseRegistration', PARTITION_PHASE_HORIZON_MS],
  ['startPhaseCacheHydration', PARTITION_PHASE_HORIZON_MS],
]);

function scenarioPhaseCount({throughMessageGroups, throughPartitions,
  throughHandoff}) {
  if (throughHandoff) return SEED_PHASE_LADDER.length;
  if (throughPartitions) return 2;
  return throughMessageGroups ? 1 : 0;
}

function scenarioPhases(host, reach) {
  return SEED_PHASE_LADDER
    .slice(0, scenarioPhaseCount(reach))
    .map(([method, horizonMs]) => [() => host[method](), horizonMs]);
}

// Everything a scenario needs before its first production phase: the guard
// armed and its ledger cleared, one generation named, the scenario's
// surroundings, one node environment, the seed host on it, and the host-load
// contract the closure authority will be given.
function beginSeedScenario({nodeId, nodeAddress, wsPort, hostLoad, observer}) {
  installDeterministicOwnerGuard();
  resetNondeterministicOwnerSeamLedger();
  const generation = `${nodeId}-seed-phase-one`;
  if (observer) observer.begin(generation);
  const scenario = createProductionSimScenario();
  const environment = createProductionSimNodeEnvironment({
    nodeId, nodeAddress, wsPort, scenario,
  });
  return {
    generation,
    scenario,
    environment,
    host: createProductionSeedSimHost(environment),
    owners: hostLoadOwners(hostLoad),
  };
}

// The simulator's counterpart of production's "Cluster formed." mark: the
// last phase has returned, its consequences have settled, write authority has
// already changed hands, and nothing has been torn down yet.
function markFormationComplete(scenario, host, onFormationComplete) {
  const atMs = scenario.network.now();
  const enqueueEpoch = scenario.network.enqueueEpoch();
  if (onFormationComplete) {
    onFormationComplete({
      atMs,
      enqueueEpoch,
      transcript: host.transcript().serialize(),
      provenance: JSON.stringify(host.provenance()),
    });
  }
  return {atMs, enqueueEpoch};
}

async function runSeedScenario({
  nodeId = 'node-0',
  nodeAddress = 'ws://127.0.0.1:19960',
  wsPort = 19960,
  hostLoad = null,
  observer = null,
  // Told once, when formation is complete and before teardown begins. It is
  // the simulator's counterpart of production's "Cluster formed." mark: the
  // last phase has returned and its consequences have settled, write
  // authority has already changed hands, and nothing has yet been torn down.
  // Nothing production does depends on whether anyone is listening.
  onFormationComplete,
  throughMessageGroups = false,
  throughPartitions = false,
  throughHandoff = false,
} = {}) {
  const {generation, scenario, host, owners} = beginSeedScenario({
    nodeId, nodeAddress, wsPort, hostLoad, observer,
  });
  await runOnSimulationGenerationRoot(generation, () =>
    runOnExecutionNode(nodeId, () => host.phaseInfrastructure()));
  const afterPhaseReturned = host.transcript().serialize();
  await host.settleCausalConsequences(SETTLE_HORIZON_MS, owners);
  const afterCausalClosure = host.transcript().serialize();
  for (const [startPhase, horizonMs] of scenarioPhases(host, {
    throughMessageGroups, throughPartitions, throughHandoff,
  })) {
    const running = runOnSimulationGenerationRoot(generation, () =>
      runOnExecutionNode(nodeId, startPhase));
    await host.driveUntilSettled(running, horizonMs);
    await host.settleCausalConsequences(SETTLE_HORIZON_MS, owners);
  }
  const mark = markFormationComplete(scenario, host, onFormationComplete);
  await host.stop();
  await host.settleCausalConsequences(SETTLE_HORIZON_MS, owners);
  host.seal();
  if (observer) observer.seal();
  const strictReport = serializeStrictReport();
  return {
    afterPhaseReturned,
    afterCausalClosure,
    hostTranscript: host.transcript().serialize(),
    hostTranscriptLength: host.transcript().length(),
    networkTranscript: scenario.network.getRecords()
      .map((entry) =>
        `${entry.timeMs} ${entry.kind}:${entry.type}:${entry.from}->${entry.to}`)
      .join('\n'),
    strictReport,
    provenanceSnapshot: JSON.stringify(host.provenance()),
    nowMs: scenario.network.now(),
    formationCompleteAtMs: mark.atMs,
    formationEnqueueEpoch: mark.enqueueEpoch,
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

// And on through the real partition phase: C's population.
const runSeedPartitionsScenario = (options = {}) =>
  runSeedScenario({...options, throughMessageGroups: true,
    throughPartitions: true});

// And on through registration, hydration and the write-authority handoff:
// D's chain.
const runSeedHandoffScenario = (options = {}) =>
  runSeedScenario({...options, throughMessageGroups: true,
    throughPartitions: true, throughHandoff: true});

export {
  createProductionSeedSimHost,
  runSeedHandoffScenario,
  runSeedMessageGroupsScenario,
  runSeedPartitionsScenario,
  runSeedPhaseOneScenario,
};
