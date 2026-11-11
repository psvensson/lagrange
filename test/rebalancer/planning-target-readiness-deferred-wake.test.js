/**
 * A rebalance pass that needs a move and finds no target because a candidate
 * node's planning readiness read was DEFERRED is a named wait, and it is
 * stated.
 *
 * Failure this pins (local three-node formation, ~25 runs): 13.7-16 % of the
 * passes that needed a move ended NO_AVAILABLE_NODES or with zero moves,
 * logged at debug only. Each candidate's planning read had been deferred
 * (the planning owner's completed record was not current; it queued a
 * rebuild and answered with an all-false deferred snapshot the planner read
 * as "not ready"), and nothing woke the planner when the rebuild published:
 * the next pass was the cadence tick.
 */
import {test} from '../../src/test-helpers/tap.js';
import {EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {
  buildDeferredSnapshot,
} from '../../src/control-plane/readiness-planning-publication-contract.js';
import {
  AVAILABLE_NODE_EXCLUSION_REASON,
  AVAILABLE_NODE_PLANNING_STATE,
  REBALANCE_PASS_NO_MOVE_EXIT,
  REBALANCE_PASS_NO_MOVE_LOG_MSG,
} from '../../src/rebalancer/rebalancer-no-target-pass-diagnostic.js';
import {
  RECONCILE_REASON,
} from '../../src/workflow/reconcile-queue-constants.js';
import {
  createTestRebalancer,
  initializeSpreadTestEnvironment,
} from './test-helpers.js';

const LOCAL_NODE_ID = 'node-1';
const DEFERRED_NODE_IDS = Object.freeze(['node-2', 'node-3']);
const UNRELATED_NODE_ID = 'node-9';
const PARTITION_ID = 'tbl-deferred-targets-p1';
const DEFERRED_FOR_MS = 840;
const NOT_READY_SNAPSHOT = Object.freeze({
  nodeId: LOCAL_NODE_ID,
  dimensions: Object.freeze({}),
  reasons: Object.freeze([]),
});

function createDeferredTargetWorld(t, {deferredNodeIds = DEFERRED_NODE_IDS} = {}) {
  initializeSpreadTestEnvironment(LOCAL_NODE_ID);
  const nodeIds = [LOCAL_NODE_ID, ...DEFERRED_NODE_IDS];
  const readinessByNodeId = {[LOCAL_NODE_ID]: NOT_READY_SNAPSHOT};
  for (const nodeId of DEFERRED_NODE_IDS) {
    readinessByNodeId[nodeId] = deferredNodeIds.includes(nodeId) ?
      buildDeferredSnapshot(null, {tokenKey: `token-${nodeId}`}, nodeId) :
      {...NOT_READY_SNAPSHOT, nodeId};
  }
  const rebalancer = createTestRebalancer({
    entityId: PARTITION_ID,
    entityType: EntityType.PARTITION,
    nodeId: LOCAL_NODE_ID,
    cacheData: {
      nodes: nodeIds.map((nodeId) => ({node_id: nodeId, status: 'active'})),
    },
    readinessFixture: {readinessByNodeId},
  });
  const world = {rebalancer, infoLines: [], listeners: new Set(), enqueued: []};
  const readiness = rebalancer.controlPlaneReadinessService;
  readiness.subscribeReadinessPlanningSnapshots = (listener) => {
    world.listeners.add(listener);
    return () => world.listeners.delete(listener);
  };
  readiness.describeReadinessPlanningAdmission = () => ({
    admissionState: 'deferred',
    failedTerms: ['freshness_not_current'],
    deferredForMs: DEFERRED_FOR_MS,
  });
  world.publish = (ownerKey) => {
    for (const listener of [...world.listeners]) {
      listener({ownerKey, snapshot: null, capturedToken: null});
    }
  };
  rebalancer.isLeader = true;
  rebalancer.enqueueRebalanceCheck = (reason) => {
    world.enqueued.push(reason);
    return true;
  };
  const baseLogger = rebalancer.logger;
  rebalancer.logger = {
    ...baseLogger,
    debug: () => {},
    info: (message, payload) => {
      if (message === REBALANCE_PASS_NO_MOVE_LOG_MSG) {
        world.infoLines.push(payload);
      }
    },
  };
  t.teardown(() => rebalancer.shutdown());
  return world;
}

test('deferred candidate reads end a pass as a stated, named wait that the ' +
  'publication of one of those nodes ends', async (t) => {
  const world = createDeferredTargetWorld(t);
  const {rebalancer} = world;

  const plan = rebalancer.getAvailableNodePlan();
  t.same(
    plan.candidates.map((candidate) => [candidate.nodeId, candidate.state]),
    [
      [LOCAL_NODE_ID, AVAILABLE_NODE_PLANNING_STATE.NOT_READY],
      ['node-2', AVAILABLE_NODE_PLANNING_STATE.DEFERRED],
      ['node-3', AVAILABLE_NODE_PLANNING_STATE.DEFERRED],
    ],
    'a deferred read is its own state, never folded into not-ready',
  );

  const first = await rebalancer.rebalance();
  t.equal(first.reason, 'no_available_nodes', 'the pass finds no target');
  t.equal(world.infoLines.length, 1, 'the pass is stated at info');
  t.match(world.infoLines[0], {
    entityId: PARTITION_ID,
    exit: REBALANCE_PASS_NO_MOVE_EXIT.NO_AVAILABLE_NODES,
    deferredNodeIds: [...DEFERRED_NODE_IDS],
    waitArmed: true,
    candidates: [
      {nodeId: LOCAL_NODE_ID, state: 'not_ready',
        reason: AVAILABLE_NODE_EXCLUSION_REASON.READINESS_DIMENSION_UNSATISFIED},
      {nodeId: 'node-2', state: 'deferred',
        reason: AVAILABLE_NODE_EXCLUSION_REASON.READINESS_DEFERRED,
        failedTerms: ['freshness_not_current'],
        deferredForMs: DEFERRED_FOR_MS},
      {nodeId: 'node-3', state: 'deferred'},
    ],
  }, 'with the exit, each candidate\'s reason, and the admission terms');

  await rebalancer.rebalance();
  t.equal(world.infoLines.length, 1,
    'an unchanged reason is stated once, not per pass');

  world.publish(UNRELATED_NODE_ID);
  t.same(world.enqueued, [], 'a publication for another node does not wake');
  world.publish('node-3');
  t.same(
    world.enqueued,
    [RECONCILE_REASON.READINESS_PLANNING_SNAPSHOT_PUBLISHED],
    'the publication that answers a deferred read enqueues one check',
  );
  world.publish('node-2');
  t.equal(world.enqueued.length, 1, 'the wait fired once and disarmed');
  t.equal(rebalancer.consumePlanningTargetReadinessWakeDue(), true,
    'the woken check may run ahead of the cadence floor');
  t.equal(rebalancer.consumePlanningTargetReadinessWakeDue(), false,
    'once');
});

test('a pass with no target and no deferred read arms no wait', async (t) => {
  const world = createDeferredTargetWorld(t, {deferredNodeIds: []});
  const result = await world.rebalancer.rebalance();
  t.equal(result.reason, 'no_available_nodes');
  t.match(world.infoLines[0], {deferredNodeIds: [], waitArmed: false},
    'not-ready candidates are stated but are not a planning-read wait');
  world.publish('node-2');
  t.same(world.enqueued, [], 'no publication wakes it');
});
