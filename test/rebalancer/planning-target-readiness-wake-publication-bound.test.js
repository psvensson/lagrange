/**
 * Paired witness for the planning-target readiness wake (D4, 2026-11-11).
 *
 * Failure this pins: test/integration/membership-consistency failed 3 of 8
 * local runs at "published epoch settles with the seed eligible". A seed
 * stalled ~9 s on microtasks: the six system partitions' rebalancers ran
 * about 1000 passes, all but ~30 of them ahead of the 1 s cadence floor.
 * Each pass read a follow-up target's readiness through one build variant
 * (DEFERRED: its rebuild queued on the planning owner's macrotask queue)
 * and armed the planning-target wake; the arm re-read the placement plan
 * through ANOTHER variant (answered), took the disagreement for a landed
 * publication and resolved the wake at once with a floor skip. The pass
 * thereby woke itself, for ever, and the rebuild that would have answered
 * the read never got a turn.
 *
 * Drive: a real UnifiedRebalancer on a system partition with the REAL
 * ControlPlaneReadinessService and its REAL planning owner (builds held on
 * the owner's deterministic drain port), setLeader(true), passes through
 * the real reconcile queue, checkRebalance, cadence floor and wake. Two
 * seams are stated: the committed-nodes port answers the cache's node rows,
 * and the planning gates are opened (they are not the subject); the D4
 * reader (the priority-recovery follow-up target read) runs inside each
 * pass's evaluation.
 */
import {test} from '../../src/test-helpers/tap.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {
  COLUMN,
  SERVICE_STATUS,
  TABLES,
} from '../../src/constants/index.js';
import {SERVE_ELIGIBILITY_STATE} from
  '../../src/control-plane/serve-eligibility-owner.js';
import {isDeferredReadinessPlanningSnapshot} from
  '../../src/control-plane/readiness-planning-version-contract.js';
import {AVAILABLE_NODE_PLANNING_STATE} from
  '../../src/rebalancer/rebalancer-no-target-pass-diagnostic.js';
import {createReadinessServiceForTest} from
  '../helpers/readiness-service-fixture.js';
import {
  createTestRebalancer,
  initializeSpreadTestEnvironment,
} from './test-helpers.js';

const SEED_NODE_ID = 'seed-node';
const NODE_IDS = Object.freeze([SEED_NODE_ID, 'node-2', 'node-3']);
const SYSTEM_PARTITION_ID = 'sql_write_operations-p1';
const READY_LEASE_WINDOW_MS = 600_000;
const SEED_CHANGED_STATUS = 'suspect';
// Long enough for a self-waking pass chain to run hundreds of passes, well
// inside the 1 s priority cadence floor.
const OBSERVATION_WINDOW_MS = 300;
const TIMER_LATENESS_BOUND_MS = 100;

const logging = LoggingService.getInstance();
if (!logging.isInitialized()) {
  logging.initialize({level: 'error'});
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nodeRow(nodeId, heartbeatMs) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.LAST_HEARTBEAT]: heartbeatMs,
    [COLUMN.READY_LEASE_EXPIRES_AT]: heartbeatMs + READY_LEASE_WINDOW_MS,
  };
}

function createWorld(t) {
  initializeSpreadTestEnvironment(SEED_NODE_ID);
  const cache = new SystemTableCache();
  const startMs = Date.now();
  for (const nodeId of NODE_IDS) {
    cache.applySystemTableChange(TABLES.NODES, 'INSERT',
      nodeRow(nodeId, startMs));
  }
  const heldBuilds = [];
  const readiness = createReadinessServiceForTest({
    nodeId: SEED_NODE_ID,
    systemTableCache: cache,
    readinessPlanningScheduleDrainFn: (drain) => heldBuilds.push(drain),
  });
  readiness.answerCommittedNodes = () => ({
    state: SERVE_ELIGIBILITY_STATE.READY,
    epoch: {publicationEpoch: 1, publicationId: 'cluster_membership-1',
      readAtMs: startMs},
    nodeRows: cache.getAll(TABLES.NODES),
  });
  const world = {cache, readiness, heldBuilds, publications: [],
    passes: 0, floorSkips: 0, followUpReads: []};
  readiness.subscribeReadinessPlanningSnapshots((event) => {
    world.publications.push(event.ownerKey);
  });
  const rebalancer = createTestRebalancer({
    entityId: SYSTEM_PARTITION_ID,
    entityType: EntityType.PARTITION,
    nodeId: SEED_NODE_ID,
    systemTableCache: cache,
    controlPlaneReadinessService: readiness,
  });
  world.rebalancer = rebalancer;
  world.planOptions = rebalancer.buildPlanningReadinessReadOptions();
  rebalancer.getCheckRebalanceBlocker = async () => null;
  const consume = rebalancer.consumePlanningTargetReadinessWakeDue
    .bind(rebalancer);
  rebalancer.consumePlanningTargetReadinessWakeDue = () => {
    const due = consume();
    if (due) world.floorSkips += 1;
    return due;
  };
  rebalancer.evaluateStateForPlan = async () => {
    world.passes += 1;
    if (world.followUpTargetNodeId) {
      rebalancer.isPriorityRecoveryFollowUpTargetRecoveryEligible(
        world.followUpTargetNodeId);
      world.followUpReads.push(world.followUpTargetNodeId);
    }
    return false;
  };
  world.runHeldBuilds = async () => {
    while (heldBuilds.length > 0) {
      heldBuilds.shift()();
      await nextTurn();
    }
  };
  world.planState = (nodeId) => rebalancer.getAvailableNodePlan().candidates
    .find((candidate) => candidate.nodeId === nodeId)?.state;
  t.teardown(() => {
    rebalancer.shutdown();
    readiness.shutdown?.();
  });
  return world;
}

// Every node's plan-variant record built and published: the arm-time state
// the D4 re-read saw as current.
async function publishPlanVariants(world) {
  for (const nodeId of NODE_IDS) {
    world.readiness.getNodeReadinessSync(nodeId, world.planOptions);
  }
  await world.runHeldBuilds();
  for (const nodeId of NODE_IDS) {
    if (world.planState(nodeId) === AVAILABLE_NODE_PLANNING_STATE.DEFERRED) {
      throw new Error(`plan variant of ${nodeId} did not publish`);
    }
  }
}

test('a deferred read whose arm-time state is current does not wake its ' +
  'own pass: floor skips never outnumber publications, timers keep time',
async (t) => {
  const world = createWorld(t);
  const {rebalancer} = world;
  await publishPlanVariants(world);
  world.publications.length = 0;
  // The D4 reader: a follow-up target read the planning owner cannot answer
  // yet (its build is queued and held here).
  world.followUpTargetNodeId = 'node-2';

  const scheduledAtMs = Date.now();
  let timerLatenessMs = null;
  const timer = setTimeout(() => {
    timerLatenessMs = Date.now() - scheduledAtMs - OBSERVATION_WINDOW_MS / 2;
  }, OBSERVATION_WINDOW_MS / 2);
  rebalancer.setLeader(true);
  await delay(OBSERVATION_WINDOW_MS);
  clearTimeout(timer);

  t.ok(world.passes >= 1, `the leadership pass ran (${world.passes})`);
  t.equal(world.publications.length, 0,
    'no planning publication happened in the window');
  t.equal(world.floorSkips, 0,
    `floor-skipping passes (${world.floorSkips}) never outnumber ` +
      'publications (0)');
  t.ok(world.passes <= 2,
    'between the deferral and a publication the entity runs at its ' +
      `cadence (${world.passes} passes in ${OBSERVATION_WINDOW_MS} ms, ` +
      'floor 1000 ms)');
  t.ok(timerLatenessMs !== null && timerLatenessMs <= TIMER_LATENESS_BOUND_MS,
    'a timer scheduled before the first pass fired on time ' +
      `(late by ${timerLatenessMs} ms)`);
  const followUpRead = world.readiness.getNodeReadinessSync('node-2',
    rebalancer.buildPlanningReadinessReadOptions());
  t.equal(isDeferredReadinessPlanningSnapshot(followUpRead), false,
    'the follow-up target reads the placement plan\'s own variant');
});

test('after the owner publishes the seed\'s snapshot exactly one wake pass ' +
  'runs, and it reads the seed admitted', async (t) => {
  const world = createWorld(t);
  const {rebalancer, cache} = world;
  await publishPlanVariants(world);
  rebalancer.setLeader(true);
  await delay(20);
  const settledPasses = world.passes;
  t.ok(settledPasses >= 1, 'the leadership pass ran');

  // A semantic source change of the seed's row (its status): its
  // plan-variant read is DEFERRED and its rebuild is queued (held) on the
  // planning owner.
  cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
    ...nodeRow(SEED_NODE_ID, Date.now()),
    [COLUMN.STATUS]: SEED_CHANGED_STATUS,
  });
  await nextTurn();
  t.equal(world.planState(SEED_NODE_ID), AVAILABLE_NODE_PLANNING_STATE.DEFERRED,
    'the seed\'s placement read is deferred');
  world.publications.length = 0;
  rebalancer.enqueueRebalanceCheck('test_cadence_check');
  // The cadence floor holds this check; force the pass the deferral is
  // observed in by clearing the floor's last-check stamp.
  rebalancer.lastCheckAtMs = 0;
  await delay(50);
  const deferredPasses = world.passes;
  t.ok(deferredPasses > settledPasses, 'a pass observed the deferral');
  t.ok(rebalancer.readPlanningTargetReadinessAwaitedNodeIds()
    .includes(SEED_NODE_ID), 'the planning-target wait is armed for the seed');
  await delay(100);
  t.equal(world.passes, deferredPasses,
    'no pass runs between the deferral and the publication');
  t.equal(world.floorSkips, 0, 'and none skips the floor');

  // The owner's builds run one per turn; release them until the seed's
  // snapshot is published.
  while (!world.publications.includes(SEED_NODE_ID) &&
    world.heldBuilds.length > 0) {
    world.heldBuilds.shift()();
    await nextTurn();
  }
  await delay(50);
  t.same(world.publications, [SEED_NODE_ID],
    'the owner published the seed\'s snapshot (and nothing else yet)');
  t.equal(world.floorSkips, 1,
    'the publication granted exactly one floor-skipping pass');
  t.equal(world.passes, deferredPasses + 1, 'exactly one wake pass ran');
  t.not(world.planState(SEED_NODE_ID), AVAILABLE_NODE_PLANNING_STATE.DEFERRED,
    'the wake pass reads the seed answered');
  t.match(world.readiness.describeReadinessPlanningAdmission(SEED_NODE_ID,
    world.planOptions), {admissionState: 'admitted'},
  'the seed\'s placement verdict is admitted');

  // The rest of the owner's publications: each may grant one pass, never
  // more.
  await world.runHeldBuilds();
  await delay(50);
  t.ok(world.floorSkips <= world.publications.length,
    `floor-skipping passes (${world.floorSkips}) never outnumber ` +
      `publications (${world.publications.length})`);
  t.same(rebalancer.readPlanningTargetReadinessAwaitedNodeIds(), [],
    'and no wait remains armed');
});
