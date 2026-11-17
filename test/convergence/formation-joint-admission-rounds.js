// The evaluation-round driver of the joint-admission release-liveness
// reproducer: it mounts the REAL join ready-signal path (NodeJoiningService:
// node-local gates and the durable READY heartbeat) on each joiner of a
// formation world, and advances the world only
// by asking owners to evaluate. Nothing here decides anything.
//
// Time model. No timer fires and no deadline is reached. Production orders a
// write against an earlier build by clock value (a stored readiness snapshot
// is invalid when it was invalidated AFTER it was built), so two events must
// not share an instant: every driven evaluation happens one millisecond
// after the previous one, and the whole run is asserted to be shorter than
// the shortest delay any owner armed. The planning read memo's 250 ms
// staleness floor (membership-planning-version-key.js) is lapsed at each
// evaluation, as it is between any two evaluations of a running node (the
// planner and the membership driver evaluate every 5 s); it is a read bound,
// not a liveness timer.

import {
  JOINING_LOG_MSG,
} from '../../src/bootstrap/node-joining-constants.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {TABLES} from '../../src/constants/index.js';
import {
  readMembershipPlanningDerivationVersionKey,
} from '../../src/control-plane/membership-planning-version-key.js';
import {NodeService} from '../../src/node/node-service.js';
import {isNodeRecordReady} from '../../src/node/node-readiness-policy.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {SEED_NODE_ID, nodeAddressOf} from './formation-joint-admission-world.js';

const EVALUATION_STEP_MS = 1;
const FAR_FUTURE_MS = Number.MAX_SAFE_INTEGER;
const HANDOFF_TRANSITION_MESSAGE =
  'Formation release handoff authority transition';
const PLANNING_GATE_MESSAGE =
  'Priority-recovery planning-gate decision diagnostic';
const PLANNER_REFUSAL_MESSAGES = new Set([
  'Rebalancing move skipped',
  'Skipping move blocked by safety policy',
]);
// The one line every owner writes when a bound it waited under is spent
// (src/logging/wait-bound-spent.js).
const WAIT_BOUND_SPENT_MESSAGE = 'Wait bound spent';
// The ready-signal gate of the join formation barrier, on a tree that has it.
const BARRIER_GATE = 'operation_ledger_formation';
const READY_SIGNAL_STATE = Object.freeze({
  NOT_STARTED: 'not_started',
  RUNNING: 'running',
  PUBLISHED: 'ready_published',
  FAILED: 'failed',
});
const HEARTBEAT_STATS = Object.freeze({
  cpu: Object.freeze({count: 4, usagePercent: 10}),
  memory: Object.freeze({totalBytes: 1024 * 1024 * 1024, usagePercent: 20}),
  diskGb: 10,
  diskUsagePercent: 30,
});

// One evaluation instant: the next millisecond, with the planning read
// memo's staleness floor lapsed.
function nextEvaluationInstant(world) {
  world.clock.advance(EVALUATION_STEP_MS);
  readMembershipPlanningDerivationVersionKey(world.cache, FAR_FUTURE_MS);
}

async function settleWorld(world) {
  await world.settle();
}

// A planner's cadence, lapsed: production spaces a partition planner's
// checks (one second between checks, a stabilization window after a state
// change, a start delay after leadership). The driver evaluates every
// planner once per round instead, so the three cadence stamps are aged past
// their windows. No bound of the planner is touched: its retry delays and
// backoffs stay armed and never fire.
function lapsePlannerCadence(rebalancer) {
  rebalancer.lastCheckAtMs = null;
  rebalancer.lastStateChangeTime = null;
  rebalancer.rebalanceStartAtMs = 0;
}

// The cadences this driver steps, by name. A cadence re-evaluates a level
// condition or retries a step whose preconditions may now hold; production
// formation legitimately advances on it. Each is stepped once per round, as
// if its spacing had elapsed, and the report counts every step. Nothing else
// that is armed ever runs: a bound or a timeout that would have to expire is
// no progress here.
//   TIMER cadences are retry timers an owner armed at the named site.
//   STAMP cadences are spacing stamps the driver ages before an owner's own
//   periodic body runs (the body is called directly, its interval never
//   fires).
const TIMER_CADENCES = Object.freeze([
  // ReplicaDispatchService: the retry of a deferred operation dispatch,
  // which also carries the verification of a remote owner wake
  // (operationDispatchRetryAfterMs).
  {name: 'dispatch-retry',
    site: 'src/control-plane/replica-dispatch-retry-scheduling.js'},
  // Operation workflow owner: the retry of an observed-progress reconcile,
  // of retained executor evidence, of a deferred transition, of a dispatch,
  // of an ACTIVE REPLACE whose source removal was deferred, and of a remote
  // owner handoff.
  {name: 'observed-progress-retry',
    site: 'src/rebalancer/operation-workflow-observed-progress-retention.js'},
  {name: 'executor-outcome-retry',
    site: 'src/rebalancer/operation-workflow-executor-outcome-reconcile-methods.js'},
  // The authoritative replica_operations read retry.
  {name: 'operation-read-retry',
    site: 'src/rebalancer/replica-operation-repository-visibility-methods.js'},
]);
const STAMP_CADENCES = Object.freeze({
  PLANNER_CHECK: 'planner-check-spacing',
  MEMBERSHIP_TICK: 'membership-tick',
  COORDINATOR_TICK: 'coordinator-tick',
  ORPHAN_RECONCILE: 'orphan-reconcile-backoff',
  // The join formation barrier's poll, on a tree that has the barrier.
  BARRIER_POLL: 'join-barrier-poll',
});

/**
 * Mount the real join ready-signal owner on a registered joiner.
 * @param {object} world the formation world
 * @param {string} nodeId the joiner
 * @return {object} the mounted joiner
 */
function mountJoinReadySignal(world, nodeId) {
  const hosts = world.hostsById.get(nodeId);
  const bootIncarnation = world.bootIncarnationOf(nodeId);
  const sleeps = [];
  const barrierLog = [];
  const service = new NodeJoiningService({
    bootIncarnation,
    nodeId,
    nodeAddress: nodeAddressOf(nodeId),
    seedNodeAddress: nodeAddressOf(SEED_NODE_ID),
    now: () => world.clock.now(),
    // A sleep is a timer. It is never left to expire: a joiner that sleeps
    // is waiting on a timer, and the report names it. The one exception is
    // a poll of the join formation barrier (the tree this harness measures
    // main with has one; a tree without it never sleeps there): the driver
    // steps that poll as a named cadence.
    sleep: (delayMs) => new Promise((resolve) => {
      sleeps.push({delayMs, resolve, done: false});
    }),
  });
  // Transport: a pre-READY joiner's CONNECTED liveness publication (the
  // barrier's, on a tree that has it) is routed to the seed's durable node
  // lifecycle owner, which decides what it writes.
  service.sendControlPlaneNodeStateUpdate = async (publication) =>
    world.lifecyclePublicationOf(SEED_NODE_ID).publish({
      nodeId,
      bootIncarnation,
      state: publication.state,
      heartbeatOnly: publication.heartbeatOnly,
      heartbeatAt: publication.heartbeatAt,
      capabilities: publication.capabilities,
      publicationMode: publication.nodeStatePublicationMode,
    });
  const atBarrier = () =>
    service.infrastructureJoinProgress?.readySignalGate === BARRIER_GATE;
  service.seedNodeId = SEED_NODE_ID;
  // Node-local gates, as the measured joiners had passed them.
  service.cdcSubscriptionsActive = true;
  service.runBackgroundCdcCatchupAfterSubscription = () => {};
  service.messageRouter = hosts.messageRouter;
  service.heartbeatService = hosts.heartbeatService;
  service.rebalanceCoordinator = hosts.rebalanceCoordinator;
  const baseLogger = service.logger;
  service.logger = {
    debug: () => {},
    warn: () => {},
    error: () => {},
    info(message, details) {
      if (message === JOINING_LOG_MSG.PRIORITY_PLACEMENT_FORMATION_BARRIER ||
          message ===
            JOINING_LOG_MSG.PRIORITY_PLACEMENT_FORMATION_BARRIER_STILL_WAITING) {
        barrierLog.push(details);
      }
    },
    child: () => baseLogger,
  };
  const joiner = {
    nodeId,
    hosts,
    service,
    sleeps,
    barrierLog,
    state: READY_SIGNAL_STATE.NOT_STARTED,
    failure: null,
    start() {
      if (joiner.state !== READY_SIGNAL_STATE.NOT_STARTED) return;
      joiner.state = READY_SIGNAL_STATE.RUNNING;
      service.signalReadyForReplicas().then(() => {
        joiner.state = READY_SIGNAL_STATE.PUBLISHED;
      }, (error) => {
        joiner.state = READY_SIGNAL_STATE.FAILED;
        joiner.failure = error;
      });
    },
    // One step of the barrier's poll cadence: its pending poll completes.
    stepBarrierPoll() {
      let stepped = 0;
      for (const sleep of sleeps) {
        if (!sleep.done && atBarrier()) {
          sleep.done = true;
          sleep.resolve();
          stepped += 1;
        }
      }
      return stepped;
    },
    // Sleeps the driver never completes: timers that would have to expire.
    armedSleeps: () => sleeps.filter((sleep) => !sleep.done && !atBarrier())
      .map((sleep) => ({
        delayMs: sleep.delayMs,
        gate: service.infrastructureJoinProgress?.readySignalGate || null,
      })),
    barrier: () => barrierLog[barrierLog.length - 1] || null,
    isReady: () => isNodeRecordReady(
      world.cache.get(TABLES.NODES, nodeId), {now: world.clock.now()}),
  };
  return joiner;
}


/**
 * The world's driver: owner evaluations only.
 * @param {object} world the formation world
 * @param {object} [options]
 * @param {boolean} [options.plannerPolling=true] whether a round asks every
 *   mounted placement decider for a planning check; without it a decider
 *   plans only when its own production triggers fire
 * @return {object} the driver
 */
function createRoundDriver(world, {plannerPolling = true} = {}) {
  NodeService.getInstance().setSystemCacheProxy(world.cache);
  NodeService.getInstance().getNodeStats = async () => HEARTBEAT_STATS;
  const joiners = new Map();
  const handoffTransitions = [];
  // Each planner's own statements: its planning-gate decision and the last
  // thing it said about why it is not acting.
  const plannerStatements = new Map();
  const roundCounter = {number: 0};
  // Every bound an operation owner of a node reported spent.
  const spentBounds = [];

  const boundWatch = (nodeId) => {
    const quiet = () => {};
    const watch = {
      debug: quiet,
      info: quiet,
      warn: quiet,
      error(message, details) {
        if (message === WAIT_BOUND_SPENT_MESSAGE) {
          spentBounds.push({nodeId, wait: details?.wait || null,
            subject: details?.subject || null});
        }
      },
      child: () => watch,
    };
    return watch;
  };
  const watchBounds = (hosts) => {
    const watch = boundWatch(hosts.nodeId);
    hosts.rebalanceCoordinator.logger = watch;
    hosts.rebalanceCoordinator.workflowOwner.logger = watch;
    hosts.rebalanceCoordinator.repository.logger = watch;
    world.dispatchServiceByNodeId.get(hosts.nodeId).logger = watch;
  };
  const attachSeedInstrumentation = () => {
    const seedReadiness = world.seed.controlPlaneReadinessService;
    const baseReadinessLogger = seedReadiness.logger;
    seedReadiness.logger = {
      debug: () => {},
      warn: () => {},
      error: () => {},
      info(message, details) {
        if (message === HANDOFF_TRANSITION_MESSAGE) {
          handoffTransitions.push({...details, atMs: world.clock.now()});
        }
      },
      child: () => baseReadinessLogger,
    };
    for (const [partitionId, rebalancer] of world.seedRebalancers) {
      const statement = plannerStatements.get(partitionId) ||
        {gate: null, refusals: new Map()};
      plannerStatements.set(partitionId, statement);
      const record = (message, details) => {
        if (message === WAIT_BOUND_SPENT_MESSAGE) {
          spentBounds.push({nodeId: SEED_NODE_ID, wait: details?.wait || null,
            subject: details?.subject || partitionId});
        } else if (message === PLANNING_GATE_MESSAGE) {
          statement.gate = {
            winningGate: details.winningGate,
            bypassState: details.bypassState,
            operationCreationRequired: details.operationCreationRequired,
          };
        } else if (PLANNER_REFUSAL_MESSAGES.has(message)) {
          // The planner's own refusal of its own move, keyed by the move.
          statement.refusals.set(
            `${details.moveType}:${details.moveTargetNodeId}`, {
              round: roundCounter.number,
              moveType: details.moveType,
              targetNodeId: details.moveTargetNodeId,
              replicaId: details.replicaId || null,
              reason: details.admissionReason || details.reason || null,
              error: details.error || null,
            });
        }
      };
      rebalancer.logger = {
        debug: record,
        info: record,
        warn: record,
        error: record,
      };
    }
    watchBounds(world.seed);
  };
  attachSeedInstrumentation();
  const stampSteps = new Map();
  const countStamp = (name, steps = 1) =>
    stampSteps.set(name, (stampSteps.get(name) || 0) + steps);
  const driver = {
    world,
    joiners,
    handoffTransitions,
    plannerStatements,
    roundCounter,
    spentBounds,
    // Every cadence stepped so far, by name, with the number of steps.
    steppedCadences: () => ({
      ...Object.fromEntries(stampSteps),
      ...world.time.steppedCadences(),
    }),
    // The armed timers no cadence of this driver owns: bounds, timeouts and
    // the intervals whose bodies the driver calls directly.
    armedBounds: () => world.time.armedTimers().filter((timer) =>
      !TIMER_CADENCES.some((cadence) => timer.armedBy.startsWith(cadence.site))),
    close() {
      world.time.restore();
      for (const rebalancer of world.seedRebalancers.values()) {
        rebalancer.shutdown();
      }
      for (const hosts of world.hostsById.values()) {
        hosts.heartbeatService.stop();
        hosts.membershipPublicationService.stopOwnerMembershipDriver();
        hosts.rebalanceCoordinator.isShuttingDown = true;
        hosts.stopIntervals();
      }
    },
    async settle() {
      nextEvaluationInstant(world);
      await settleWorld(world);
      nextEvaluationInstant(world);
    },
    // The seed formed alone: its first publication, with its priority
    // summary stated by the planners' reconcile wake.
    async formSeed() {
      nextEvaluationInstant(world);
      await settleWorld(world);
      for (const rebalancer of world.seedRebalancers.values()) {
        rebalancer.setLeader(true);
      }
      await driver.membershipDerivation();
      if (plannerPolling) await driver.planPriorityPartitions();
      await driver.readSeedAuthority();
    },
    async joinerArrives(nodeId) {
      nextEvaluationInstant(world);
      watchBounds(await world.registerJoiner(nodeId, {
        durableStateDetected: false,
      }));
      joiners.set(nodeId, mountJoinReadySignal(world, nodeId));
      await settleWorld(world);
      // The seed's readiness owner evaluates the new member.
      nextEvaluationInstant(world);
      await world.seed.controlPlaneReadinessService.getNodeReadiness(nodeId);
      await settleWorld(world);
      nextEvaluationInstant(world);
    },
    async killJoiner(nodeId) {
      nextEvaluationInstant(world);
      world.stopNode(nodeId, {expireLease: true, wipeDataDir: false});
      await settleWorld(world);
      nextEvaluationInstant(world);
      await world.seed.controlPlaneReadinessService.getNodeReadiness(nodeId);
      await settleWorld(world);
      nextEvaluationInstant(world);
    },
    async restartJoiner(
      nodeId,
      {
        wipeDataDir = false,
        externalServicesCleanup = false,
        registrationNowMs = null,
      } = {},
    ) {
      nextEvaluationInstant(world);
      world.stopNode(nodeId, {
        expireLease: true,
        wipeDataDir,
        externalServicesCleanup,
      });
      if (externalServicesCleanup) {
        world.cache.tombstoneStore.clear();
      }
      await settleWorld(world);
      nextEvaluationInstant(world);
      const hosts = await world.registerJoiner(nodeId, {
        durableStateDetected: !wipeDataDir,
        registrationNowMs,
      });
      watchBounds(hosts);
      joiners.set(nodeId, mountJoinReadySignal(world, nodeId));
      driver.startReadySignal(nodeId);
      await settleWorld(world);
      nextEvaluationInstant(world);
      await world.seed.controlPlaneReadinessService.getNodeReadiness(nodeId);
      await settleWorld(world);
      nextEvaluationInstant(world);
    },
    async restartSeed() {
      nextEvaluationInstant(world);
      world.restartSeed();
      attachSeedInstrumentation();
      await settleWorld(world);
      for (const rebalancer of world.seedRebalancers.values()) {
        rebalancer.setLeader(true);
      }
      for (const nodeId of world.upNodeIds) {
        nextEvaluationInstant(world);
        await world.seed.controlPlaneReadinessService.getNodeReadiness(nodeId);
      }
      await settleWorld(world);
      nextEvaluationInstant(world);
    },
    // The seed's connection to a joiner is re-identified: absent, then
    // bound again. The seed's readiness owner evaluates the joiner at each.
    async seedLinkTo(nodeId, up) {
      nextEvaluationInstant(world);
      world.setLink(SEED_NODE_ID, nodeId, up);
      await settleWorld(world);
      nextEvaluationInstant(world);
      await world.seed.controlPlaneReadinessService.getNodeReadiness(nodeId);
      await settleWorld(world);
      nextEvaluationInstant(world);
    },
    // The seed's fan-out is conservative while a joiner's message group is
    // joining; the seed's readiness owner evaluates the seed under it.
    async seedFanOutDegrades() {
      world.setJoinerGroupPending(SEED_NODE_ID, true);
      await settleWorld(world);
      await world.seed.controlPlaneReadinessService
        .getNodeReadiness(SEED_NODE_ID);
      await settleWorld(world);
    },
    async seedFanOutRecovers() {
      world.setJoinerGroupPending(SEED_NODE_ID, false);
      await settleWorld(world);
      await world.seed.controlPlaneReadinessService
        .getNodeReadiness(SEED_NODE_ID);
      await settleWorld(world);
    },
    // One read of the seed's own startup authority.
    async readSeedAuthority() {
      nextEvaluationInstant(world);
      const seedReadiness = world.seed.controlPlaneReadinessService;
      const authority = seedReadiness.getStartupAuthoritySnapshotSync(
        SEED_NODE_ID, world.clock.now());
      // On a tree with the formation-release handoff, the durable
      // publication of what the read captured.
      await seedReadiness.formationReleaseHandoffPublicationCoordinator
        ?.whenIdle();
      await settleWorld(world);
      return authority;
    },
    seedAuthority() {
      nextEvaluationInstant(world);
      return world.seed.controlPlaneReadinessService
        .getStartupAuthoritySnapshotSync(SEED_NODE_ID, world.clock.now());
    },
    // One membership derivation on the seed: the heartbeat's scheduled
    // reconcile tick and the owner-membership driver's tick, each once.
    async membershipDerivation() {
      nextEvaluationInstant(world);
      countStamp(STAMP_CADENCES.MEMBERSHIP_TICK);
      await world.seed.heartbeatService
        .runScheduledMembershipPublicationReconcileTick();
      await settleWorld(world);
      await world.seed.membershipPublicationService
        .driveOwnerMembershipReconcile();
      await settleWorld(world);
    },
    // One planning check of every priority partition's planner on the seed.
    async planPriorityPartitions() {
      nextEvaluationInstant(world);
      countStamp(STAMP_CADENCES.PLANNER_CHECK);
      for (const rebalancer of world.seedRebalancers.values()) {
        lapsePlannerCadence(rebalancer);
        rebalancer.enqueueRebalanceCheck(RECONCILE_REASON.PERIODIC_CHECK);
      }
      for (const rebalancer of world.seedRebalancers.values()) {
        await rebalancer.awaitCurrentWorkIdle();
      }
      await settleWorld(world);
    },
    // One periodic evaluation of every node's rebalance coordinator: the
    // body of its own interval tick (timeouts, orphaned operations,
    // membership debt), which re-reads the operations it owns. The orphan
    // reconciler spaces its own scans (five seconds); that spacing is aged.
    async evaluateCoordinators() {
      nextEvaluationInstant(world);
      countStamp(STAMP_CADENCES.COORDINATOR_TICK);
      countStamp(STAMP_CADENCES.ORPHAN_RECONCILE);
      for (const hosts of world.hostsById.values()) {
        if (!world.upNodeIds.has(hosts.nodeId)) continue;
        const coordinator = hosts.rebalanceCoordinator;
        coordinator.workflowOwner.lastOrphanedOperationReconcileAtMs = 0;
        await coordinator.checkTimeouts();
        await coordinator.reconcileOrphanedOperations();
        await coordinator.reconcileMessageGroupMembershipDebt();
        await settleWorld(world);
      }
    },
    // One step of the replica runtime: learners catch up, removals retire.
    async stepReplicaRuntime() {
      nextEvaluationInstant(world);
      world.replicaRuntime.step();
      await settleWorld(world);
    },
    // One step of every retry cadence an owner armed.
    async stepRetryCadences() {
      nextEvaluationInstant(world);
      countStamp(STAMP_CADENCES.BARRIER_POLL, 0);
      for (const joiner of joiners.values()) {
        if (!world.upNodeIds.has(joiner.nodeId)) continue;
        countStamp(STAMP_CADENCES.BARRIER_POLL, joiner.stepBarrierPoll());
        await settleWorld(world);
      }
      for (const cadence of TIMER_CADENCES) {
        world.time.stepCadence(cadence.name,
          (timer) => timer.armedBy.startsWith(cadence.site));
      }
      await settleWorld(world);
    },
    startReadySignal(nodeId) {
      joiners.get(nodeId).start();
    },
    // One evaluation round of every owner.
    async round() {
      roundCounter.number += 1;
      await driver.membershipDerivation();
      await driver.readSeedAuthority();
      if (plannerPolling) await driver.planPriorityPartitions();
      await driver.evaluateCoordinators();
      await driver.stepReplicaRuntime();
      await driver.stepRetryCadences();
      await driver.readSeedAuthority();
    },
  };
  return driver;
}


// Every cadence the driver steps, by name.
const STEPPED_CADENCE_NAMES = Object.freeze([
  ...Object.values(STAMP_CADENCES),
  ...TIMER_CADENCES.map((cadence) => cadence.name),
]);

export {
  STEPPED_CADENCE_NAMES,
  createRoundDriver,
};
