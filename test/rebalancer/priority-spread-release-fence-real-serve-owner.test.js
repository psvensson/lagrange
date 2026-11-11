/**
 * The release fence's serve leg against the REAL serve-eligibility owner
 * (committed node rows + publication, lease-expiry STALE) and the REAL
 * priority-recovery cohort resolver, not stubbed answers.
 *
 *  (b) A member lease that passes before its refresh lands answers STALE
 *      (UNAVAILABLE) for a moment. That unknown holds the fence but does not
 *      restart the dwell: a 70 s window restarted on every lease-refresh race
 *      lets ordinary load keep the fence closed (R12).
 *  (d) The planning cohort leaves out a published member it excludes on
 *      readiness (a joiner not yet serve-eligible). The serve leg asked only
 *      the remaining members and so was vacuous for exactly the node it must
 *      wait for; the durable published membership now joins the cohort.
 */
import {test} from '../../src/test-helpers/tap.js';
import {COLUMN, SERVICE_STATUS, TABLES} from '../../src/constants/index.js';
import {
  SERVE_ELIGIBILITY_UNAVAILABLE_REASON,
  ServeEligibilityOwner,
} from '../../src/control-plane/serve-eligibility-owner.js';
import {
  BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE,
} from '../../src/rebalancer/background-priority-spread-release-tracker.js';
import {
  armFenceThenClearSpread,
  blockerOf,
  createFenceWorld,
  logContextOf,
} from './priority-spread-release-fence-world.js';

const PARKED_ENTITY_ID = 'service_bindings-p1';
const MEMBERS = Object.freeze(['node-1', 'node-2', 'node-3']);
const READ_TIMEOUT_MS = 2_500;

function nodeRow(nodeId, leaseExpiresAtMs) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.BOOT_INCARNATION]: 1,
    [COLUMN.READY_LEASE_EXPIRES_AT]: leaseExpiresAtMs,
  };
}

function publicationRow(nodeIds) {
  return {
    publication_id: 'cluster_membership-5',
    publication_kind: 'cluster_membership',
    publication_epoch: 5,
    publisher_node_id: 'node-1',
    published_active_node_ids: JSON.stringify(nodeIds),
    required_ack_node_ids: JSON.stringify(nodeIds),
    acknowledged_node_ids: JSON.stringify(nodeIds),
    priority_partition_summary: JSON.stringify({satisfied: true,
      blockedPartitions: []}),
    status: 'PUBLISHED',
  };
}

// The real owner on the world's clock; its timers are collected, never run
// unless a test fires them.
function attachRealServeOwner(world, nodes) {
  const committed = {nodes, publications: [publicationRow(MEMBERS)]};
  const owner = new ServeEligibilityOwner({
    now: () => world.nowMs,
    readTimeoutMs: READ_TIMEOUT_MS,
    isNodeLoadReady: () => true,
    setTimeout: () => ({}),
    clearTimeout: () => {},
    readCommittedRows: async (tableName) => ({
      success: true,
      rows: tableName === TABLES.NODES ? committed.nodes :
        committed.publications,
    }),
  });
  world.readinessOwner.answerServeCohort = (nodeIds) =>
    owner.answerCohort(nodeIds);
  return {owner, committed};
}

function stateRealPlanningCohort(world, rebalancer, readinessExcludedNodeIds) {
  world.readiness.planningAnswer = {
    publishedActiveNodeIds: [...MEMBERS],
    locallyEligibleNodeIds: [...MEMBERS],
    projectionDiagnostics: {readinessExcludedNodeIds},
  };
  rebalancer.getLatestPublishedMembershipRow = () => publicationRow(MEMBERS);
}

test('(b) a lease that passes before its refresh lands holds the fence ' +
  'without restarting the dwell', async (t) => {
  const world = createFenceWorld();
  const parked = world.createRebalancer(PARKED_ENTITY_ID);
  try {
    const stableWindowMs = parked.getBackgroundPrioritySpreadStableWindowMs();
    const leaseEndMs = world.nowMs + stableWindowMs / 2;
    const {owner, committed} = attachRealServeOwner(world,
      MEMBERS.map((nodeId) => nodeRow(nodeId, leaseEndMs)));
    t.teardown(() => owner.shutdown());
    stateRealPlanningCohort(world, parked, []);
    await owner.readServeEligibility();
    armFenceThenClearSpread(world, parked);
    const firstHeldAtMs = world.nowMs;
    t.equal(blockerOf(parked.resolvePrioritySpreadPlanningGateDecision())
      .state, BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.STABILIZING,
    'the dwell runs on the real owner\'s eligible answers');

    // The leases pass; the refresh has not landed.
    world.nowMs = leaseEndMs;
    const stale = parked.resolvePrioritySpreadPlanningGateDecision();
    t.equal(blockerOf(stale).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_UNAVAILABLE,
      'the STALE answer holds the fence');
    t.equal(logContextOf(stale).requiredNodeServeUnavailableReason,
      SERVE_ELIGIBILITY_UNAVAILABLE_REASON.STALE,
      'named by the owner\'s reason');
    t.equal(blockerOf(stale).stableElapsedMs, leaseEndMs - firstHeldAtMs,
      'and does not restart the dwell');

    // The refresh lands with renewed leases.
    committed.nodes = MEMBERS.map((nodeId) =>
      nodeRow(nodeId, leaseEndMs + 10 * stableWindowMs));
    await owner.readServeEligibility();
    world.nowMs = firstHeldAtMs + stableWindowMs;
    t.equal(parked.resolvePrioritySpreadPlanningGateDecision(), null,
      'the fence releases one window after it first held');
  } finally {
    world.shutdown();
  }
});

test('(d) a published member the planning cohort excludes on readiness is ' +
  'still waited for', async (t) => {
  const world = createFenceWorld();
  const parked = world.createRebalancer(PARKED_ENTITY_ID);
  try {
    const stableWindowMs = parked.getBackgroundPrioritySpreadStableWindowMs();
    const farLeaseMs = world.nowMs + 100 * stableWindowMs;
    // node-3 joined and is published; its serve lease is not granted yet.
    const {owner} = attachRealServeOwner(world, [
      nodeRow('node-1', farLeaseMs),
      nodeRow('node-2', farLeaseMs),
      nodeRow('node-3', 0),
    ]);
    t.teardown(() => owner.shutdown());
    stateRealPlanningCohort(world, parked, ['node-3']);
    await owner.readServeEligibility();
    armFenceThenClearSpread(world, parked);
    const held = parked.resolvePrioritySpreadPlanningGateDecision();
    t.same(logContextOf(held).requiredNodeIds, [...MEMBERS],
      'the joiner is in the required cohort');
    t.equal(blockerOf(held).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_NOT_HELD,
      'its missing serve eligibility holds the fence');
    world.nowMs += stableWindowMs + 1;
    t.ok(parked.resolvePrioritySpreadPlanningGateDecision(),
      'no window releases while it is not serve-eligible');
  } finally {
    world.shutdown();
  }
});
