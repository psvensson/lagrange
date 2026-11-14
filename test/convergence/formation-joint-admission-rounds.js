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
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
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

/**
 * Mount the real join ready-signal owner on a registered joiner.
 * @param {object} world the formation world
 * @param {string} nodeId the joiner
 * @return {object} the mounted joiner
 */
function mountJoinReadySignal(world, nodeId) {
  const hosts = world.hostsById.get(nodeId);
  const sleeps = [];
  const barrierLog = [];
  const service = new NodeJoiningService({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId,
    nodeAddress: nodeAddressOf(nodeId),
    seedNodeAddress: nodeAddressOf(SEED_NODE_ID),
    now: () => world.clock.now(),
    // A sleep is a timer. It is never completed: a joiner that sleeps is
    // waiting on a timer, and the report names it.
    sleep: (delayMs) => new Promise((resolve) => {
      sleeps.push({delayMs, resolve});
    }),
  });
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
    // Sleeps the driver never completes: timers that would have to expire.
    armedSleeps: () => sleeps.map((sleep) => ({
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
 * @return {object} the driver
 */
function createRoundDriver(world) {
  NodeService.getInstance().setSystemCacheProxy(world.cache);
  NodeService.getInstance().getNodeStats = async () => HEARTBEAT_STATS;
  const joiners = new Map();
  const seed = world.seed;
  const seedReadiness = seed.controlPlaneReadinessService;
  const handoffTransitions = [];
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

  // Each planner's own statements: its planning-gate decision and the last
  // thing it said about why it is not acting.
  const plannerStatements = new Map();
  const roundCounter = {number: 0};
  for (const [partitionId, rebalancer] of world.seedRebalancers) {
    const statement = {gate: null, refusals: new Map()};
    plannerStatements.set(partitionId, statement);
    const record = (message, details) => {
      if (message === PLANNING_GATE_MESSAGE) {
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
    rebalancer.logger = {debug: record, info: record, warn: record, error: record};
  }

  const driver = {
    world,
    joiners,
    handoffTransitions,
    plannerStatements,
    roundCounter,
    close() {
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
      await driver.planPriorityPartitions();
      await driver.readSeedAuthority();
    },
    async joinerArrives(nodeId) {
      nextEvaluationInstant(world);
      world.registerJoiner(nodeId);
      joiners.set(nodeId, mountJoinReadySignal(world, nodeId));
      await settleWorld(world);
      // The seed's readiness owner evaluates the new member.
      nextEvaluationInstant(world);
      await seedReadiness.getNodeReadiness(nodeId);
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
      await seedReadiness.getNodeReadiness(nodeId);
      await settleWorld(world);
      nextEvaluationInstant(world);
    },
    // The seed's fan-out is conservative while a joiner's message group is
    // joining; the seed's readiness owner evaluates the seed under it.
    async seedFanOutDegrades() {
      world.setJoinerGroupPending(SEED_NODE_ID, true);
      await settleWorld(world);
      await seedReadiness.getNodeReadiness(SEED_NODE_ID);
      await settleWorld(world);
    },
    async seedFanOutRecovers() {
      world.setJoinerGroupPending(SEED_NODE_ID, false);
      await settleWorld(world);
      await seedReadiness.getNodeReadiness(SEED_NODE_ID);
      await settleWorld(world);
    },
    // One read of the seed's own startup authority.
    async readSeedAuthority() {
      nextEvaluationInstant(world);
      const authority = seedReadiness.getStartupAuthoritySnapshotSync(
        SEED_NODE_ID, world.clock.now());
      await settleWorld(world);
      return authority;
    },
    seedAuthority() {
      nextEvaluationInstant(world);
      return seedReadiness.getStartupAuthoritySnapshotSync(
        SEED_NODE_ID, world.clock.now());
    },
    // One membership derivation on the seed: the heartbeat's scheduled
    // reconcile tick and the owner-membership driver's tick, each once.
    async membershipDerivation() {
      nextEvaluationInstant(world);
      await seed.heartbeatService.runScheduledMembershipPublicationReconcileTick();
      await settleWorld(world);
      await seed.membershipPublicationService.driveOwnerMembershipReconcile();
      await settleWorld(world);
    },
    // One planning check of every priority partition's planner on the seed.
    async planPriorityPartitions() {
      nextEvaluationInstant(world);
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
    // membership debt), which re-reads the operations it owns.
    async evaluateCoordinators() {
      nextEvaluationInstant(world);
      for (const hosts of world.hostsById.values()) {
        const coordinator = hosts.rebalanceCoordinator;
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
    startReadySignal(nodeId) {
      joiners.get(nodeId).start();
    },
    // One evaluation round of every owner.
    async round() {
      roundCounter.number += 1;
      await driver.membershipDerivation();
      await driver.readSeedAuthority();
      await driver.planPriorityPartitions();
      await driver.evaluateCoordinators();
      await driver.stepReplicaRuntime();
      await driver.readSeedAuthority();
    },
  };
  return driver;
}


export {
  READY_SIGNAL_STATE,
  createRoundDriver,
  nextEvaluationInstant,
  settleWorld,
};
