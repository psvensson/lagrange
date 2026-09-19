// Witness for the critical-spread-transition-authority-carry quest: the
// PRODUCTION path, end to end, through the real UnifiedRebalancer and the
// real RebalanceCoordinator.
//
// SCOPE. Every other witness of this quest drives one owner. This one drives
// `rebalance(PERIODIC)` and follows one authorization from the planner's move
// to the coordinator's request to the persisted replica_operations row — and,
// for every state that authorizes nothing, asserts with `Object.hasOwn` that
// no move, no request and no row gained the key at all. That is the sealed
// clause "a field absent from the move stays absent on the request and on the
// row", which no owner-level witness can see.
//
// Raw node:test so the anchored receipt runner selects exactly one scenario.
import test from 'node:test';
import assert from 'node:assert/strict';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  EntityType,
  NodeStatus,
  ReplicaStatus,
  TriggerType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  SPREAD_CURE_TRANSITION_AUTHORIZATION_MOVE_FIELD,
  SPREAD_CURE_TRANSITION_INTENT,
  decodeSpreadCureTransitionAuthorizationFromOperationRow,
} from '../../src/rebalancer/spread-cure-transition-authorization.js';
import {
  createMockCache,
  createMockControlPlaneReadinessService,
  createTestCoordinator,
  createTestRebalancer,
} from './test-helpers.js';

if (!ConfigurationManager.getInstance().isInitialized()) {
  ConfigurationManager.getInstance().initialize({
    node: {id: 'node-a'}, logging: {level: 'error'},
  });
}
if (!LoggingService.getInstance().isInitialized()) {
  LoggingService.getInstance().initialize({level: 'error'});
}

const MOVE_FIELD = SPREAD_CURE_TRANSITION_AUTHORIZATION_MOVE_FIELD;
const CRITICAL_PARTITION_ID = 'sql_transactions-p1';
const ORDINARY_PARTITION_ID = 'tbl-users-p1';
const SEED_NODE_ID = 'node-a';
const CURE_TARGET_NODE_ID = 'node-c';
const PUBLISHED_EPOCH = 4;
const DECLARED_REPLICATION_FACTOR = 3;
const REBALANCE_BUDGET = 5;
const STEPS_HISTORY_PARAM_INDEX = 13;
const INSERT_STATEMENT_FRAGMENT = 'INSERT INTO replica_operations';
const SERVICES_QUERY_FRAGMENT = 'FROM services';
const NODE_IDS = Object.freeze(
  ['node-a', 'node-b', 'node-c', 'node-d', 'node-e']);
// Four voters on TWO nodes at RF 3: over target, below the distinct-node
// floor. This is the 2026-09-16 shape, and the only state this quest mints
// for.
const OVER_TARGET_VOTERS = Object.freeze([
  Object.freeze(['r1', 'node-a', 'leader']),
  Object.freeze(['r2', 'node-a', 'follower']),
  Object.freeze(['r3', 'node-b', 'follower']),
  Object.freeze(['r4', 'node-b', 'follower']),
]);
// Three voters on three nodes at RF 3: at target, spread satisfied.
const SETTLED_VOTERS = Object.freeze([
  Object.freeze(['r1', 'node-a', 'leader']),
  Object.freeze(['r2', 'node-b', 'follower']),
  Object.freeze(['r3', 'node-c', 'follower']),
]);

function serviceRow(partitionId, [replicaSuffix, nodeId, raftRole]) {
  const replicaId = `${partitionId}-${replicaSuffix}`;
  return {
    service_id: replicaId,
    service_type: 'partition',
    node_id: nodeId,
    partition_id: partitionId,
    replica_id: replicaId,
    address: `local/partition/${replicaId}`,
    raft_role: raftRole,
    status: ReplicaStatus.ACTIVE,
  };
}

/**
 * Drive one real rebalance cycle and record everything the carrier could
 * ride on: the planned moves, the coordinator requests, and the persisted
 * replica_operations INSERT payloads.
 * @param {Object} options scenario declaration
 * @return {Promise<Object>} {moves, requests, inserts}
 */
async function driveOneRebalance(options) {
  const partitionId = options.partitionId;
  const services = options.voters.map(
    (voter) => serviceRow(partitionId, voter));
  const cache = createMockCache({
    nodes: NODE_IDS.map((nodeId) => ({nodeId, node_id: nodeId,
      status: NodeStatus.ACTIVE})),
    services,
    partitions: options.partitionRow === null ? [] : [{
      partition_id: partitionId,
      table_id: partitionId.replace(/-p\d+$/u, ''),
      replica_count: DECLARED_REPLICATION_FACTOR,
    }],
    replicaOperations: [],
  });
  const readinessBase = createMockControlPlaneReadinessService({
    systemTableCache: cache, defaultRepairEligible: true,
  });
  const readiness = {
    ...readinessBase,
    getCurrentPublishedMembershipEpochSync: () => options.publishedEpoch,
  };
  const admit = async () => ({
    decision: 'allow', allowed: true, decisionType: 'admitted',
  });
  const storageAdmissionService = {
    checkAdd: admit, checkReplace: admit, checkSplit: admit,
  };
  const coordinator = createTestCoordinator({
    nodeId: SEED_NODE_ID,
    systemTableCache: cache,
    controlPlaneReadinessService: readiness,
    storageAdmissionService,
    enableTimeouts: false,
    sqlQueryResults: {
      [SERVICES_QUERY_FRAGMENT]: {success: true, rows: services},
    },
  });
  const rebalancer = createTestRebalancer({
    entityId: partitionId,
    entityType: EntityType.PARTITION,
    nodeId: SEED_NODE_ID,
    systemTableCache: cache,
    rebalanceCoordinator: coordinator,
    controlPlaneReadinessService: readiness,
    storageAdmissionService,
    storageAccountingService: {estimateReplicaBytes: () => 1},
  });
  rebalancer.setLeader(true);
  rebalancer.clusterReadinessConfirmed = true;
  rebalancer.isStabilized = () => true;
  rebalancer.getConfiguredRebalanceBudget = async () => REBALANCE_BUDGET;
  rebalancer.getGlobalInFlightOperationCount = async () => 0;

  // One cycle calls the planner more than once (the priority-recovery
  // follow-up augmentation re-plans over the same state), so the plans are
  // kept apart: the LAST one is what the cycle executes.
  const plans = [];
  const requests = [];
  const inserts = [];
  const planner = rebalancer.movePlanner;
  const calculateMoves = planner.calculateMoves.bind(planner);
  planner.calculateMoves = (...args) => {
    const planned = calculateMoves(...args);
    plans.push(planned);
    return planned;
  };
  const createOperation = coordinator.createOperation.bind(coordinator);
  coordinator.createOperation = async (request) => {
    requests.push(request);
    return createOperation(request);
  };
  const engine = coordinator.sqlQueryEngine;
  const executeQuery = engine.executeQuery.bind(engine);
  engine.executeQuery = async (sql, params) => {
    if (String(sql).includes(INSERT_STATEMENT_FRAGMENT)) {
      inserts.push(params);
    }
    return executeQuery(sql, params);
  };
  try {
    await rebalancer.rebalance(TriggerType.PERIODIC);
  } finally {
    rebalancer.shutdown();
    await coordinator.shutdown();
  }
  return {
    plans,
    moves: plans.length > 0 ? plans[plans.length - 1] : [],
    allPlannedMoves: plans.flat(),
    requests,
    inserts,
  };
}

// The production MovePlanner of a real rebalancer, without a rebalance cycle
// around it: the two cure attachment sites are reached by DIFFERENT planner
// states, and only a direct plan can hold one of them still.
async function createIsolatedPlanner() {
  const partitionId = CRITICAL_PARTITION_ID;
  const currentReplicas = OVER_TARGET_VOTERS.map(
    (voter) => serviceRow(partitionId, voter));
  const cache = createMockCache({
    nodes: NODE_IDS.map((nodeId) => ({nodeId, node_id: nodeId,
      status: NodeStatus.ACTIVE})),
    services: currentReplicas,
    partitions: [{
      partition_id: partitionId,
      table_id: partitionId.replace(/-p\d+$/u, ''),
      replica_count: DECLARED_REPLICATION_FACTOR,
    }],
    replicaOperations: [],
  });
  const readiness = createMockControlPlaneReadinessService({
    systemTableCache: cache, defaultRepairEligible: true,
  });
  const rebalancer = createTestRebalancer({
    entityId: partitionId,
    entityType: EntityType.PARTITION,
    nodeId: SEED_NODE_ID,
    systemTableCache: cache,
    controlPlaneReadinessService: readiness,
    storageAccountingService: {estimateReplicaBytes: () => 1},
  });
  rebalancer.setLeader(true);
  return {planner: rebalancer.movePlanner, currentReplicas, rebalancer};
}

function stepsHistoryOf(insertParams) {
  return JSON.parse(insertParams[STEPS_HISTORY_PARAM_INDEX]);
}

// Nothing in this cycle carries the key - checked with Object.hasOwn, so an
// `undefined` key an unconditional copy would leave behind is a failure, not
// a pass.
function assertNothingCarriesTheKey(cycle, name) {
  for (const move of cycle.allPlannedMoves) {
    assert.equal(Object.hasOwn(move, MOVE_FIELD), false,
      `${name}: no planned move carries the key`);
  }
  for (const request of cycle.requests) {
    assert.equal(Object.hasOwn(request, MOVE_FIELD), false,
      `${name}: no coordinator request carries the key`);
  }
  for (const insert of cycle.inserts) {
    const first = stepsHistoryOf(insert)[0];
    assert.equal(Object.hasOwn(first, 'cureTransitionAuthorization'), false,
      `${name}: no persisted row carries the key`);
  }
}

test('one authorization travels the real planner, coordinator and row',
  async () => {
    // 1. The 09-16 state on a mint-eligible critical partition.
    const cure = await driveOneRebalance({
      partitionId: CRITICAL_PARTITION_ID,
      voters: OVER_TARGET_VOTERS,
      publishedEpoch: PUBLISHED_EPOCH,
    });

    const authorizedMoves = cure.moves.filter(
      (move) => Object.hasOwn(move, MOVE_FIELD));
    assert.equal(authorizedMoves.length, 1,
      'exactly one planned move carries an authorization');
    const minted = authorizedMoves[0][MOVE_FIELD];
    assert.deepEqual({...minted}, {
      intent: SPREAD_CURE_TRANSITION_INTENT,
      desiredReplicationFactor: DECLARED_REPLICATION_FACTOR,
      observedMembershipEpoch: PUBLISHED_EPOCH,
      observedVoterCount: 4,
      authorizedResultingVoterCount: 5,
      destinationNodeId: CURE_TARGET_NODE_ID,
    }, 'the planner\'s move carries exactly the policy owner\'s six fields');
    assert.equal(authorizedMoves[0].nodeId, CURE_TARGET_NODE_ID,
      'and it authorizes the node the move actually targets');

    const authorizedRequests = cure.requests.filter(
      (request) => Object.hasOwn(request, MOVE_FIELD));
    assert.ok(authorizedRequests.length >= 1,
      'the coordinator request carries it too');
    for (const request of authorizedRequests) {
      assert.deepEqual({...request[MOVE_FIELD]}, {...minted},
        'copied verbatim onto the request, never amended');
      assert.equal(request.nodeId, CURE_TARGET_NODE_ID);
    }
    assert.equal(authorizedRequests.length, cure.requests.length,
      'and every request of this cycle is that one authorized ADD');

    assert.equal(cure.inserts.length, 1, 'one operation row was written');
    const firstRecord = stepsHistoryOf(cure.inserts[0])[0];
    const stamped = firstRecord.cureTransitionAuthorization;
    assert.ok(stamped, 'the persisted row carries the record');
    assert.deepEqual({...stamped}, {
      ...minted,
      destinationReplicaId: cure.inserts[0][3],
      operationId: cure.inserts[0][0],
    }, 'completed with the row\'s own replica id and operation id, no more');
    const binding = decodeSpreadCureTransitionAuthorizationFromOperationRow(
      {steps_history: cure.inserts[0][STEPS_HISTORY_PARAM_INDEX]});
    assert.equal(binding.state, 'present',
      'and the binding owner decodes the persisted bytes as one record');

    // 1b. The two attachment sites, isolated. A full cycle runs BOTH (the
    // over-creation cap retains, then the expand row re-types the first
    // retained move), so a mutant that disables either one alone is hidden
    // by the other. These two drive the SAME production planner one level
    // down, each in a state that reaches exactly one of the sites.
    const isolated = await createIsolatedPlanner();
    // The planner keeps timers, so an assertion that throws in here
    // must not leave the process alive: a failing witness has to FAIL,
    // not hang.
    try {
      // (i) The cap's retention alone: no remove candidate exists, so the
      // expand block is never entered.
      const retentionOnly = isolated.planner.calculateMoves(
        isolated.currentReplicas, {
          targetReplicaCount: 3,
          targetNodes: ['node-a', 'node-a', 'node-b', 'node-b',
            CURE_TARGET_NODE_ID],
          degraded: false,
        }, {membershipPublicationEpoch: PUBLISHED_EPOCH});
      assert.equal(retentionOnly.length, 1, 'the cap retained one cure ADD');
      assert.equal(Object.hasOwn(retentionOnly[0], MOVE_FIELD), true,
        'the over-creation cap attaches the authorization on its own');
      assert.equal(retentionOnly[0][MOVE_FIELD].destinationNodeId,
        CURE_TARGET_NODE_ID);
      // (ii) The expand row alone: a remove candidate exists, so the expand
      // block runs and re-types - and re-states - the retained move.
      const withExpand = isolated.planner.calculateMoves(
        isolated.currentReplicas, {
          targetReplicaCount: 3,
          targetNodes: ['node-a', 'node-b', CURE_TARGET_NODE_ID],
          degraded: false,
        }, {membershipPublicationEpoch: PUBLISHED_EPOCH});
      const expandAuthorized = withExpand.filter(
        (move) => Object.hasOwn(move, MOVE_FIELD));
      assert.equal(expandAuthorized.length, 1,
        'the expand row states the authorization for the move it re-types');
      assert.equal(expandAuthorized[0][MOVE_FIELD].destinationNodeId,
        CURE_TARGET_NODE_ID);
    } finally {
      isolated.rebalancer.shutdown();
    }

    // 2. Every state that authorizes nothing leaves no trace at all.
    const unauthorized = [
      ['an ordinary user-table partition', {
        partitionId: ORDINARY_PARTITION_ID,
        voters: OVER_TARGET_VOTERS,
        publishedEpoch: PUBLISHED_EPOCH,
      }],
      ['a critical partition at target and spread', {
        partitionId: CRITICAL_PARTITION_ID,
        voters: SETTLED_VOTERS,
        publishedEpoch: PUBLISHED_EPOCH,
      }],
      ['the same cure with an unreadable planning epoch', {
        partitionId: CRITICAL_PARTITION_ID,
        voters: OVER_TARGET_VOTERS,
        publishedEpoch: null,
      }],
      ['the same cure with no partitions row to read a target from', {
        partitionId: CRITICAL_PARTITION_ID,
        voters: OVER_TARGET_VOTERS,
        publishedEpoch: PUBLISHED_EPOCH,
        partitionRow: null,
      }],
    ];
    for (const [name, options] of unauthorized) {
      assertNothingCarriesTheKey(await driveOneRebalance(options), name);
    }
  });

// ---------------------------------------------------------------------------
// The carrier's cost, per entity class. The cure policy owner needs the
// partition's own policy row, and reading it eagerly made every plan of every
// entity pay for it - including message groups and runtime services, for
// which main reads no partition row at all. The row is now resolved lazily,
// once, and only after a cure condition has already held.
//
// The totals below were measured by running main's own planner at f2fed102a
// over these same fixtures (scratch plan-reads.mjs). Three of the four are
// main's exactly; the fourth - the state that reaches the cure - is main's
// plus ONE partition-row read.
//
// The boundary is the CURE CONDITION, not the mint. The policy owner calls
// the resolver once its own condition has held, and it may then still refuse
// to mint (an undeclared replication factor, an unreadable planning epoch).
// Measured over the verifier's 3000-state end-to-end corpus: 78 states carry
// an authorization and 237 show a partition-row read delta, so 159 states
// reach the cure, pay one row read, and mint nothing. That is the intended
// contract - "read it only when a cure asks for it" - and it is why this
// witness says "reaches no cure" rather than "mints nothing".
// ---------------------------------------------------------------------------

const MAIN_PLAN_READS = Object.freeze({
  'message-group': Object.freeze({'filter:replica_operations': 9}),
  'runtime-service': Object.freeze({'filter:replica_operations': 9}),
  'partition-no-cure': Object.freeze({
    'get:partitions': 24,
    'filter:nodes': 1,
    'get:nodes': 5,
    'filter:replica_operations': 11,
  }),
  'partition-over-target-cure': Object.freeze({
    'get:partitions': 113,
    'filter:nodes': 5,
    'get:nodes': 25,
    'filter:replica_operations': 14,
  }),
});
const PARTITION_ROW_READ = 'get:partitions';
const FILLER_PARTITION_ROW_COUNT = 50;

function tracedCache(base, trace) {
  const cache = {...base};
  for (const method of ['get', 'filter', 'getAll', 'find']) {
    if (typeof base[method] !== 'function') continue;
    cache[method] = (tableName, ...rest) => {
      trace.push(`${method}:${tableName}`);
      return base[method](tableName, ...rest);
    };
  }
  return cache;
}

function entityReplicaRow(entityId, serviceType, [suffix, nodeId, raftRole]) {
  const replicaId = `${entityId}-${suffix}`;
  return {
    service_id: replicaId,
    replica_id: replicaId,
    service_type: serviceType,
    node_id: nodeId,
    raft_role: raftRole,
    status: ReplicaStatus.ACTIVE,
    address: `local/${serviceType}/${replicaId}`,
    ...(serviceType === 'partition' ?
      {partition_id: entityId} :
      {group_id: entityId}),
  };
}

function countOnePlansReads(scenario) {
  const trace = [];
  const services = scenario.replicas.map(
    (replica) => entityReplicaRow(
      scenario.entityId, scenario.serviceType, replica));
  const base = createMockCache({
    nodes: NODE_IDS.map((nodeId) => ({nodeId, node_id: nodeId,
      status: NodeStatus.ACTIVE})),
    services,
    partitions: scenario.partitions,
    replicaOperations: [],
    messageGroups: [],
  });
  const cache = tracedCache(base, trace);
  const rebalancer = createTestRebalancer({
    entityId: scenario.entityId,
    entityType: scenario.entityType,
    nodeId: SEED_NODE_ID,
    systemTableCache: cache,
    controlPlaneReadinessService: createMockControlPlaneReadinessService({
      systemTableCache: cache, defaultRepairEligible: true,
    }),
    storageAccountingService: {estimateReplicaBytes: () => 1},
  });
  rebalancer.setLeader(true);
  const before = trace.length;
  rebalancer.movePlanner.calculateMoves(services, scenario.targetState,
    {membershipPublicationEpoch: PUBLISHED_EPOCH});
  const planReads = trace.slice(before);
  rebalancer.shutdown();
  const counts = {};
  for (const read of planReads) {
    counts[read] = (counts[read] || 0) + 1;
  }
  return counts;
}

const SETTLED_TARGET_STATE = Object.freeze({
  targetReplicaCount: 3,
  targetNodes: Object.freeze(['node-a', 'node-b', CURE_TARGET_NODE_ID]),
  degraded: false,
});
const SETTLED_TRIPLE = Object.freeze([
  Object.freeze(['r1', 'node-a', 'leader']),
  Object.freeze(['r2', 'node-b', 'follower']),
  Object.freeze(['r3', CURE_TARGET_NODE_ID, 'follower']),
]);
const FILLER_PARTITION_ROWS = Object.freeze(
  Array.from({length: FILLER_PARTITION_ROW_COUNT}, (unused, index) =>
    Object.freeze({
      partition_id: `filler-p${index}`, table_id: 'filler', replica_count: 3,
    })));
const OWN_PARTITION_ROWS = Object.freeze([Object.freeze({
  partition_id: CRITICAL_PARTITION_ID,
  table_id: 'sql_transactions',
  replica_count: DECLARED_REPLICATION_FACTOR,
})]);

test('a plan that reaches no cure costs exactly main\'s cache reads',
  async () => {
    const scenarios = [
      ['message-group', {
        entityId: 'group-1',
        entityType: EntityType.MESSAGE_GROUP,
        serviceType: 'message_group',
        replicas: SETTLED_TRIPLE,
        partitions: FILLER_PARTITION_ROWS,
        targetState: SETTLED_TARGET_STATE,
      }],
      ['runtime-service', {
        entityId: 'svc-1',
        entityType: EntityType.RUNTIME_SERVICE,
        serviceType: 'runtime_service',
        replicas: SETTLED_TRIPLE,
        partitions: FILLER_PARTITION_ROWS,
        targetState: SETTLED_TARGET_STATE,
      }],
      ['partition-no-cure', {
        entityId: CRITICAL_PARTITION_ID,
        entityType: EntityType.PARTITION,
        serviceType: 'partition',
        replicas: SETTLED_TRIPLE,
        partitions: OWN_PARTITION_ROWS,
        targetState: SETTLED_TARGET_STATE,
      }],
    ];
    for (const [name, scenario] of scenarios) {
      assert.deepEqual(countOnePlansReads(scenario), {...MAIN_PLAN_READS[name]},
        `${name}: every cache read is main's, exactly`);
    }
    // The two entity classes for which main reads no partition row at all
    // must still read none: a message group planning against a cluster with
    // thousands of partition rows must not scan them.
    for (const [name] of scenarios.slice(0, 2)) {
      assert.equal(MAIN_PLAN_READS[name][PARTITION_ROW_READ], undefined,
        `${name}: main reads no partition row`);
      assert.equal(
        countOnePlansReads(scenarios.find(
          ([entry]) => entry === name)[1])[PARTITION_ROW_READ], undefined,
        `${name}: and neither does the carrier`);
    }

    // The ONE state that mints reads the partition's own policy row, once.
    const cureReads = countOnePlansReads({
      entityId: CRITICAL_PARTITION_ID,
      entityType: EntityType.PARTITION,
      serviceType: 'partition',
      replicas: OVER_TARGET_VOTERS,
      partitions: OWN_PARTITION_ROWS,
      targetState: SETTLED_TARGET_STATE,
    });
    const mainCureReads = MAIN_PLAN_READS['partition-over-target-cure'];
    assert.equal(cureReads[PARTITION_ROW_READ],
      mainCureReads[PARTITION_ROW_READ] + 1,
      'the minting plan reads the policy row exactly once more than main');
    for (const key of Object.keys(mainCureReads)) {
      if (key === PARTITION_ROW_READ) continue;
      assert.equal(cureReads[key], mainCureReads[key],
        `partition-over-target-cure: ${key} is main's`);
    }
    assert.deepEqual(Object.keys(cureReads).sort(),
      Object.keys(mainCureReads).sort(),
      'and it reads no table main does not');

    // The planning context is optional in the way main's two-argument call
    // is optional. A default parameter covers only `undefined`, so an
    // explicit null - a caller stating "this plan has no cycle facts" - must
    // plan exactly as the two-argument call does, not throw.
    const isolated = await createIsolatedPlanner();
    try {
      const twoArgument = isolated.planner.calculateMoves(
        isolated.currentReplicas, SETTLED_TARGET_STATE);
      const explicitNull = isolated.planner.calculateMoves(
        isolated.currentReplicas, SETTLED_TARGET_STATE, null);
      const emptyContext = isolated.planner.calculateMoves(
        isolated.currentReplicas, SETTLED_TARGET_STATE, {});
      assert.deepEqual(explicitNull, twoArgument,
        'an explicit null planning context plans as main\'s two-argument call');
      assert.deepEqual(emptyContext, twoArgument,
        'and so does an empty one');
      for (const plan of [twoArgument, explicitNull, emptyContext]) {
        for (const move of plan) {
          assert.equal(Object.hasOwn(move, MOVE_FIELD), false,
            'a plan with no stated epoch authorizes nothing');
        }
      }
    } finally {
      isolated.rebalancer.shutdown();
    }
  });
