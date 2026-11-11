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
  noteRebalancePassMoved,
} from '../../src/rebalancer/rebalancer-no-target-pass-diagnostic.js';
import {TABLES} from '../../src/constants/tables.js';
import {READINESS_SKIP_DETAIL} from
  '../../src/rebalancer/rebalancer-constants.js';
import {
  OPERATION_CREATION_ADMISSION_ERROR_CODE,
  OPERATION_CREATION_ADMISSION_REASON,
} from '../../src/rebalancer/rebalance-coordinator-operation-creation-admission.js';
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

function createDeferredTargetWorld(t, {deferredNodeIds = DEFERRED_NODE_IDS,
  partitionId = PARTITION_ID} = {}) {
  initializeSpreadTestEnvironment(LOCAL_NODE_ID);
  const nodeIds = [LOCAL_NODE_ID, ...DEFERRED_NODE_IDS];
  const readinessByNodeId = {[LOCAL_NODE_ID]: NOT_READY_SNAPSHOT};
  for (const nodeId of DEFERRED_NODE_IDS) {
    readinessByNodeId[nodeId] = deferredNodeIds.includes(nodeId) ?
      buildDeferredSnapshot(null, {tokenKey: `token-${nodeId}`}, nodeId) :
      {...NOT_READY_SNAPSHOT, nodeId};
  }
  const rebalancer = createTestRebalancer({
    entityId: partitionId,
    entityType: EntityType.PARTITION,
    nodeId: LOCAL_NODE_ID,
    cacheData: {
      nodes: nodeIds.map((nodeId) => ({node_id: nodeId, status: 'active'})),
    },
    readinessFixture: {readinessByNodeId},
  });
  const world = {rebalancer, infoLines: [], listeners: new Set(), enqueued: [],
    readinessByNodeId};
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


test('a publication that lands before the wait subscribes is not lost',
  async (t) => {
    const world = createDeferredTargetWorld(t);
    const {rebalancer} = world;
    // The pass read node-3 as deferred; its rebuild published (now answered,
    // not ready) before the pass reached the arm.
    for (const nodeId of DEFERRED_NODE_IDS) {
      world.readinessByNodeId[nodeId] = {...NOT_READY_SNAPSHOT, nodeId};
    }
    rebalancer.armPlanningTargetReadinessWake([...DEFERRED_NODE_IDS]);
    t.same(world.enqueued,
      [RECONCILE_REASON.READINESS_PLANNING_SNAPSHOT_PUBLISHED],
      'the re-read after subscribing enqueues the check at once');
    t.equal(world.listeners.size, 0, 'and releases the subscription');
  });

test('evaluateState reads the classified plan: a "no need" that rests on a ' +
  'deferred candidate arms the wake; a moved pass disarms it', async (t) => {
  const world = createDeferredTargetWorld(t);
  const {rebalancer} = world;
  t.equal(await rebalancer.evaluateState(), false,
    'no ready target: no rebalance this pass');
  t.equal(world.listeners.size, 1,
    'the answer depended on deferred candidates: the wake is armed');
  world.publish('node-2');
  t.same(world.enqueued,
    [RECONCILE_REASON.READINESS_PLANNING_SNAPSHOT_PUBLISHED],
    'their publication enqueues the check, not the backed-off cadence');

  await rebalancer.evaluateState();
  t.equal(world.listeners.size, 1, 're-armed on the next deferred answer');
  noteRebalancePassMoved(rebalancer, {moves: [
    {nodeId: 'node-2', success: true},
    {nodeId: 'node-3', success: true},
  ]});
  t.equal(world.listeners.size, 0,
    'a pass that moved onto every awaited node disarms it');
});

test('evaluateState disarms the wake when no candidate is deferred',
  async (t) => {
    const world = createDeferredTargetWorld(t);
    const {rebalancer} = world;
    await rebalancer.evaluateState();
    t.equal(world.listeners.size, 1, 'armed on the deferred answer');
    for (const nodeId of DEFERRED_NODE_IDS) {
      world.readinessByNodeId[nodeId] = {...NOT_READY_SNAPSHOT, nodeId};
    }
    await rebalancer.evaluateState();
    t.equal(world.listeners.size, 0, 'an answer with no deferral disarms it');
  });

test('a move whose creation re-enters on a transient admission deferral is ' +
  'woken by the clearing event', async (t) => {
  const world = createDeferredTargetWorld(t);
  const {rebalancer} = world;
  const cacheListeners = new Set();
  const versions = {[TABLES.NODES]: 0, [TABLES.PARTITIONS]: 0,
    [TABLES.SERVICES]: 0};
  rebalancer.rebalanceCoordinator = {
    controlPlaneReadinessService: {
      subscribeReadinessPlanningSnapshots: () => () => {},
    },
    systemTableCache: {
      getTableMutationVersion: (tableName) => versions[tableName] || 0,
      onCacheChange: (listener) => cacheListeners.add(listener),
      offCacheChange: (listener) => cacheListeners.delete(listener),
    },
  };
  const error = new Error('Operation creation admission changed');
  error.code = OPERATION_CREATION_ADMISSION_ERROR_CODE;
  error.reasonCodes = [OPERATION_CREATION_ADMISSION_REASON.ROUTE_UNAVAILABLE];
  error.routeObservation = {origin: 'pre_submission_delivery',
    sourceVersions: {...versions}};
  t.equal(rebalancer.armOperationCreationAdmissionWake(error,
    {nodeId: 'node-2'}), true, 'the wait is armed');
  t.equal(rebalancer.armOperationCreationAdmissionWake(error,
    {nodeId: 'node-2'}), true, 'one wait per entity');
  t.equal(cacheListeners.size, 1, 'listening on the route-source tables');
  versions[TABLES.SERVICES] += 1;
  for (const listener of [...cacheListeners]) listener(TABLES.SERVICES);
  await new Promise((resolve) => setImmediate(resolve));
  t.same(world.enqueued,
    [RECONCILE_REASON.OPERATION_CREATION_ADMISSION_CLEARED],
    'the route change enqueues one check');
  t.equal(cacheListeners.size, 0, 'the wait is released');
  t.equal(rebalancer.armOperationCreationAdmissionWake(new Error('refused'),
    {nodeId: 'node-2'}), false, 'a refusal arms nothing');
});

test('a move target whose readiness read is deferred is skipped as ' +
  'deferred, not refused, and its publication wakes the entity',
async (t) => {
  const world = createDeferredTargetWorld(t);
  const {rebalancer} = world;
  t.equal(await rebalancer.getNodeReadinessSkipReason('node-2'),
    READINESS_SKIP_DETAIL.READINESS_DEFERRED,
    'the skip names the deferral');
  t.equal(world.listeners.size, 1, 'the planning-target wait is armed');
  world.publish('node-2');
  t.same(world.enqueued,
    [RECONCILE_REASON.READINESS_PLANNING_SNAPSHOT_PUBLISHED],
    'the publication enqueues the check');
});

test('a pass that both moved and skipped a deferred target keeps the ' +
  'skipped target\'s wake', async (t) => {
  const world = createDeferredTargetWorld(t);
  const {rebalancer} = world;
  // node-3 was skipped as deferred during the pass; node-2 got a move.
  t.equal(await rebalancer.getNodeReadinessSkipReason('node-3'),
    READINESS_SKIP_DETAIL.READINESS_DEFERRED, 'node-3 skipped as deferred');
  rebalancer.armPlanningTargetReadinessWake(['node-2', 'node-3']);
  noteRebalancePassMoved(rebalancer, {moves: [
    {nodeId: 'node-2', success: true},
    {nodeId: 'node-3', skipped: true, reason: 'readiness_deferred'},
  ]});
  t.equal(world.listeners.size, 1, 'the wait stays armed');
  world.publish('node-2');
  t.same(world.enqueued, [], 'the satisfied node no longer wakes');
  world.publish('node-3');
  t.same(world.enqueued,
    [RECONCILE_REASON.READINESS_PLANNING_SNAPSHOT_PUBLISHED],
    'the skipped deferred target still wakes the entity');
});

test('a system partition\'s replica on a node whose readiness read is ' +
  'deferred is not counted unhealthy, and the read is re-asked', async (t) => {
  const world = createDeferredTargetWorld(t, {partitionId: 'logs-p1'});
  const {rebalancer} = world;
  t.equal(rebalancer.isSystemPartitionEntity(), true, 'a system partition');
  const replicas = DEFERRED_NODE_IDS.map((nodeId, index) => ({
    status: 'active', node_id: nodeId, address: `${nodeId}/logs-p1-r${index}`,
    raft_role: 'follower', replica_id: `logs-p1-r${index}`}));
  t.equal(rebalancer.getHealthyReplicas(replicas).length,
    DEFERRED_NODE_IDS.length,
    'unknown health is not unhealthy: no ADD can rest on it');
  t.equal(rebalancer.getReadyNodeOccupiedReplicas(replicas).length,
    DEFERRED_NODE_IDS.length, 'nor is the node\'s slot counted free');
  t.equal(world.listeners.size, 1, 'the planning-target wake is armed');
  world.publish('node-3');
  t.same(world.enqueued,
    [RECONCILE_REASON.READINESS_PLANNING_SNAPSHOT_PUBLISHED],
    'the publication re-asks');
});

test('a follow-up target read that is deferred arms the wake', async (t) => {
  const world = createDeferredTargetWorld(t);
  const {rebalancer} = world;
  rebalancer.isPriorityRecoveryFollowUpTargetRecoveryEligible('node-2');
  t.equal(world.listeners.size, 1, 'the deferred read is awaited');
  world.publish('node-2');
  t.same(world.enqueued,
    [RECONCILE_REASON.READINESS_PLANNING_SNAPSHOT_PUBLISHED],
    'and re-asked on its publication');
});
