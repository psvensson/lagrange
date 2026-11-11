/**
 * A transient admission deferral never shrinks a founding cohort.
 *
 * Failure this pins (local three-node formation, 6 of 11 tree runs): a
 * three-replica table was founded with two members. Provisioning resolved
 * three targets; the admission precheck for the third re-read the readiness
 * planning identity after its gate awaits, found it moved, and DEFERRED with
 * readiness_planning_identity_changed. Provisioning consumed that deferral
 * as a final, unlogged per-target rejection and, since two still met quorum,
 * founded a two-member cohort.
 */
import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {TABLES} from '../../src/constants/index.js';
import {
  OPERATION_CREATION_ADMISSION_ERROR_CODE,
  OPERATION_CREATION_ADMISSION_REASON,
} from '../../src/rebalancer/rebalance-coordinator-operation-creation-admission.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  createMockMessageRouter,
  createProvisioningReadyService,
} from './sql-query-engine-test-support.js';

ConfigurationManager.getInstance().initialize();

const LOCAL_NODE_ID = 'node-a';
const NODE_IDS = Object.freeze(['node-a', 'node-b', 'node-c']);
const DEFERRED_NODE_ID = 'node-c';
const REQUESTED_REPLICA_COUNT = 3;
const PROVISIONING_BUDGET_MS = 400;
// What table creation passes: the quorum floor, marked as defaulted.
const QUORUM_DEFAULTED_MINIMUM = Object.freeze({
  minimumRoutableReplicaCount: 2,
  minimumRoutableReplicaCountWasDefaulted: true,
});
const FOUNDING_BELOW_REQUESTED_MSG =
  'Founding table partition below its requested replica count';

function identityChangedDeferral(move) {
  const reasonCodes = [OPERATION_CREATION_ADMISSION_REASON.IDENTITY_CHANGED];
  return {
    allowed: false,
    decisionType: 'deferred',
    reasonCodes,
    planningIdentity: {nodeId: move.nodeId},
    admissionResult: {
      allowed: false,
      decisionType: 'deferred',
      blockingReasons: reasonCodes,
      reasonCodes,
    },
  };
}

function gateRefusal() {
  return {
    allowed: false,
    decisionType: 'deferred',
    reasonCodes: ['storage_capacity_exhausted'],
    admissionResult: {
      allowed: false,
      decisionType: 'blocked',
      blockingReasons: ['storage_capacity_exhausted'],
    },
  };
}

function createProvisioningWorld(t, decideAdmission) {
  const nodes = NODE_IDS.map((nodeId) => ({node_id: nodeId, status: 'active'}));
  const services = [];
  const world = {checked: [], created: [], executed: [], warnings: []};
  const cache = world.cache = {
    onCacheChange() {},
    offCacheChange() {},
    filter(type, predicate) {
      if (type === TABLES.NODES) return nodes.filter(predicate);
      if (type === TABLES.SERVICES) return services.filter(predicate);
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) return nodes;
      if (type === TABLES.SERVICES) return services;
      return [];
    },
  };
  world.rebalanceCoordinator = {
    async checkProvisioningAdmission(move) {
      world.checked.push(move.nodeId);
      return decideAdmission(move, world);
    },
    async createOperation(move) {
      world.created.push(move.nodeId);
      return {operationId: `op-${move.nodeId}`, createdAt: Date.now(), ...move};
    },
    async failOperation() {},
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      world.executed.push(targetNodeId);
      services.push({
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: 'leader',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };
  world.engine = new SQLQueryEngine({
    nodeId: LOCAL_NODE_ID,
    systemCache: cache,
    controlPlaneReadinessService: createProvisioningReadyService(nodes),
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator: world.rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: PROVISIONING_BUDGET_MS,
  });
  world.engine.waitForRoutablePartitionServiceCount = async () => {};
  world.engine.waitForPartitionLeaderService = async () => {};
  const logger = world.engine.logger;
  world.engine.logger = {
    ...logger,
    debug: () => {},
    info: () => {},
    warn: (message, payload) => world.warnings.push({message, payload}),
    error: () => {},
  };
  t.teardown(() => world.engine.shutdown?.());
  return world;
}

test('an identity-changed deferral is re-entered and the full requested ' +
  'cohort is founded', async (t) => {
  let deferralsLeft = 2;
  const world = createProvisioningWorld(t, (move) => {
    if (move.nodeId === DEFERRED_NODE_ID && deferralsLeft > 0) {
      deferralsLeft -= 1;
      return identityChangedDeferral(move);
    }
    return {allowed: true, decisionType: 'admitted',
      operationCreationAdmission: {nodeId: move.nodeId}};
  });

  await world.engine.provisionInitialTablePartition({
    partitionId: 'tbl-transient-deferral-p1',
    replicaCount: REQUESTED_REPLICA_COUNT,
    ...QUORUM_DEFAULTED_MINIMUM,
  });

  t.same(
    world.checked.filter((nodeId) => nodeId === DEFERRED_NODE_ID).length,
    3,
    'the deferred target was re-entered until admission settled',
  );
  t.same(
    [...world.created].sort(),
    [...NODE_IDS],
    'all three requested founders are created',
  );
  t.same([...world.executed].sort(), [...NODE_IDS],
    'and dispatched as one cohort');
  t.equal(
    world.warnings.filter((w) => w.message === FOUNDING_BELOW_REQUESTED_MSG)
      .length,
    0,
    'no below-request founding was decided',
  );
});

function identityUnavailableDeferral(move) {
  const reasonCodes = [OPERATION_CREATION_ADMISSION_REASON.IDENTITY_UNAVAILABLE];
  return {
    allowed: false,
    decisionType: 'deferred',
    reasonCodes,
    moveIdentity: {nodeId: move.nodeId},
    planningIdentity: null,
    admissionResult: {allowed: false, decisionType: 'deferred',
      blockingReasons: reasonCodes, reasonCodes},
  };
}

// The admission owner ports the clearance wait reads: the target's planning
// identity never becomes current and nothing is ever published.
function stateUnclearedIdentityPorts(world) {
  const coordinator = world.rebalanceCoordinator;
  coordinator.captureOperationCreationPlanningIdentity = () => null;
  coordinator.controlPlaneReadinessService = {
    subscribeReadinessPlanningSnapshots: () => () => {},
  };
  coordinator.systemTableCache = world.cache;
}

test('a deferral still unsettled when the budget is spent fails the ' +
  'statement retryably and founds nothing, without spinning', async (t) => {
  const world = createProvisioningWorld(t, (move) =>
    (move.nodeId === DEFERRED_NODE_ID ?
      identityUnavailableDeferral(move) :
      {allowed: true, decisionType: 'admitted',
        operationCreationAdmission: {nodeId: move.nodeId}}));
  stateUnclearedIdentityPorts(world);
  let immediateRan = false;
  setImmediate(() => {
    immediateRan = true;
  });

  await t.rejects(
    world.engine.provisionInitialTablePartition({
      partitionId: 'tbl-unsettled-deferral-p1',
      replicaCount: REQUESTED_REPLICA_COUNT,
      ...QUORUM_DEFAULTED_MINIMUM,
    }),
    {code: QUERY_ERROR_CODE.TABLE_PARTITION_PROVISIONING_RETRYABLE},
    'the statement fails retryably',
  );
  t.ok(immediateRan, 'the event loop ran while the target was unsettled');
  t.ok(world.checked.filter((nodeId) => nodeId === DEFERRED_NODE_ID).length <= 2,
    'the deferred target was asked a bounded number of times, not in a loop');
  t.same(world.created, [], 'no two-member cohort is founded');
  const unsettled = world.warnings.find((w) =>
    w.payload?.targetNodeId === DEFERRED_NODE_ID);
  t.match(
    unsettled?.payload,
    {
      admissionState: 'unsettled',
      blockingReasons: [OPERATION_CREATION_ADMISSION_REASON.IDENTITY_UNAVAILABLE],
    },
    'the unsettled target is logged with its typed reason',
  );
});

function routeLossError() {
  const error = new Error('Operation creation admission changed');
  error.code = OPERATION_CREATION_ADMISSION_ERROR_CODE;
  error.reasonCodes = [OPERATION_CREATION_ADMISSION_REASON.ROUTE_UNAVAILABLE];
  error.admissionResult = {allowed: false, decisionType: 'deferred'};
  error.moveIdentity = {nodeId: DEFERRED_NODE_ID};
  error.routeObservation = {origin: 'pre_submission_delivery',
    sourceVersions: {nodes: 0, partitions: 0, services: 0}};
  return error;
}

// The third founder's ledger write keeps finding no route after the first
// two were persisted.
function stateThirdCreateUnsettled(world, createdOperation) {
  world.cache.getTableMutationVersion = () => 0;
  world.rebalanceCoordinator.systemTableCache = world.cache;
  world.rebalanceCoordinator.controlPlaneReadinessService = {
    subscribeReadinessPlanningSnapshots: () => () => {},
  };
  world.failed = [];
  world.rebalanceCoordinator.failOperation = async (operation) => {
    world.failed.push(operation.operationId);
  };
  // No prior attempt: the established-cohort read finds nothing durable.
  world.rebalanceCoordinator.getOperationsByEntity = async () => [];
  world.rebalanceCoordinator.createOperation = async (move) => {
    if (move.nodeId === DEFERRED_NODE_ID) throw routeLossError();
    world.created.push(move.nodeId);
    return createdOperation(move);
  };
}

test('a founding left partial by an unsettled target is failed before the ' +
  'error propagates when no schema job will retry it', async (t) => {
  const world = createProvisioningWorld(t, (move) => ({allowed: true,
    decisionType: 'admitted', operationCreationAdmission: {nodeId: move.nodeId}}));
  stateThirdCreateUnsettled(world, (move) => ({
    operationId: `op-${move.nodeId}`, createdAt: Date.now(), ...move}));
  await t.rejects(world.engine.provisionInitialTablePartition({
    partitionId: 'tbl-partial-p1',
    replicaCount: REQUESTED_REPLICA_COUNT,
    ...QUORUM_DEFAULTED_MINIMUM,
  }), {code: QUERY_ERROR_CODE.TABLE_PARTITION_PROVISIONING_RETRYABLE,
    retryable: true}, 'the statement fails retryably');
  t.same([...world.created].sort(), ['node-a', 'node-b'],
    'two founders were persisted before the third stayed unsettled');
  t.same([...world.failed].sort(), ['op-node-a', 'op-node-b'],
    'both are failed: no half-founded table outlives the statement');
});

test('a founding left partial under a schema job is retained for the ' +
  'job\'s retry to complete through the deterministic intent', async (t) => {
  const world = createProvisioningWorld(t, (move) => ({allowed: true,
    decisionType: 'admitted', operationCreationAdmission: {nodeId: move.nodeId}}));
  stateThirdCreateUnsettled(world, (move) => ({
    operationId: move.operationIntentId,
    replicaId: move.replicaIntentId,
    targetNodeId: move.nodeId,
    createdAt: Date.now(),
    stepsHistory: [{bootstrapTopologyDispatchDeferred: true}],
  }));
  await t.rejects(world.engine.provisionInitialTablePartition({
    partitionId: 'tbl-partial-job-p1',
    schemaJobId: 'schema-job-7',
    replicaCount: REQUESTED_REPLICA_COUNT,
    ...QUORUM_DEFAULTED_MINIMUM,
  }), {code: QUERY_ERROR_CODE.TABLE_PARTITION_PROVISIONING_RETRYABLE},
  'the statement fails retryably');
  t.same(world.failed, [],
    'the job\'s own held founding operations are kept for its retry');
});

test('a non-transient refusal founds below the request only as an explicit, ' +
  'logged decision', async (t) => {
  const world = createProvisioningWorld(t, (move) =>
    (move.nodeId === DEFERRED_NODE_ID ?
      gateRefusal() :
      {allowed: true, decisionType: 'admitted',
        operationCreationAdmission: {nodeId: move.nodeId}}));

  await world.engine.provisionInitialTablePartition({
    partitionId: 'tbl-refused-target-p1',
    replicaCount: REQUESTED_REPLICA_COUNT,
    ...QUORUM_DEFAULTED_MINIMUM,
  });
  t.same(world.checked.filter((nodeId) => nodeId === DEFERRED_NODE_ID).length,
    1, 'a refusal is not re-entered');
  t.same([...world.created].sort(), ['node-a', 'node-b'],
    'the quorum cohort is founded');
  t.match(
    world.warnings.find((w) => w.payload?.targetNodeId === DEFERRED_NODE_ID)
      ?.payload,
    {admissionState: 'refused',
      blockingReasons: ['storage_capacity_exhausted']},
    'the refusal is logged with its typed reason',
  );
  t.match(
    world.warnings.find((w) => w.message === FOUNDING_BELOW_REQUESTED_MSG)
      ?.payload,
    {
      requestedReplicaCount: REQUESTED_REPLICA_COUNT,
      foundingReplicaCount: 2,
      reason: 'founding_targets_refused',
    },
    'founding below the request is logged with its reason',
  );
});

test('the creation boundary re-enters on a repeated transient re-entry and ' +
  'never turns it into a rejection', async (t) => {
  let reentryErrorsLeft = 2;
  const engine = Object.create(SQLQueryEngine.prototype);
  const settles = [];
  engine.rebalanceCoordinator = {
    async checkProvisioningAdmission(move) {
      settles.push(move.nodeId);
      return {allowed: true, operationCreationAdmission: {generation: 2}};
    },
    async createOperation(move) {
      if (reentryErrorsLeft > 0) {
        reentryErrorsLeft -= 1;
        const error = new Error('Operation creation admission changed');
        error.code = OPERATION_CREATION_ADMISSION_ERROR_CODE;
        error.reasonCodes = [OPERATION_CREATION_ADMISSION_REASON.IDENTITY_CHANGED];
        error.admissionResult = {allowed: false, decisionType: 'deferred'};
        throw error;
      }
      return {operationId: move.operationIntentId};
    },
  };
  engine.logger = {debug() {}, warn() {}};
  engine.nowFn = () => 0;
  const operation = await engine.createProvisioningOperationWithAdmissionReentry({
    partitionId: 'tbl-create-reentry-p1',
    targetNodeId: 'node-c',
    childIntent: {operationIntentId: 'op-c', replicaIntentId: 'rep-c'},
    supportsAdmissionPrecheck: true,
    operationCreationAdmission: {generation: 1},
    timeoutBudget: {deadlineMs: 1},
  });
  t.equal(operation.operationId, 'op-c', 'the operation is created');
  t.equal(settles.length, 2, 'admission was settled again after each re-entry');
});

test('composed: a partial founding whose statement budget ended is ' +
  'completed by the same schema job\'s retry, with the same cohort, ' +
  'nothing orphaned and no smaller child', async (t) => {
  const world = createProvisioningWorld(t, (move) => ({allowed: true,
    decisionType: 'admitted', operationCreationAdmission: {nodeId: move.nodeId}}));
  const durable = new Map();
  let routeToThirdFounder = false;
  stateThirdCreateUnsettled(world, () => null);
  world.rebalanceCoordinator.getOperationsByEntity = async () =>
    [...durable.values()];
  world.rebalanceCoordinator.createOperation = async (move) => {
    if (move.nodeId === DEFERRED_NODE_ID && !routeToThirdFounder) {
      throw routeLossError();
    }
    // The deterministic (job, target) intent: a retry lands on its own row.
    const existing = durable.get(move.operationIntentId);
    if (existing) return existing;
    world.created.push(move.nodeId);
    const operation = {
      operationId: move.operationIntentId,
      replicaId: move.replicaIntentId,
      type: 'ADD',
      partitionId: move.partitionId,
      targetNodeId: move.nodeId,
      nodeId: move.nodeId,
      createdAt: Date.now(),
      stepsHistory: [{bootstrapTopologyDispatchDeferred: true}],
    };
    durable.set(operation.operationId, operation);
    return operation;
  };
  const statement = {
    partitionId: 'tbl-partial-retry-p1',
    schemaJobId: 'schema-job-9',
    replicaCount: REQUESTED_REPLICA_COUNT,
    ...QUORUM_DEFAULTED_MINIMUM,
  };
  await t.rejects(world.engine.provisionInitialTablePartition(statement),
    {code: QUERY_ERROR_CODE.TABLE_PARTITION_PROVISIONING_RETRYABLE},
    'the first attempt ends with its budget, retryably');
  t.same([...durable.keys()].length, 2, 'two founders are held');
  t.same(world.failed, [], 'and kept for the job\'s retry');

  routeToThirdFounder = true;
  // The replica rows' arrival is not under test.
  world.engine.waitForPartitionServiceMetadata = async () => {};
  await world.engine.provisionInitialTablePartition(statement);
  t.same([...world.created].sort(), [...NODE_IDS],
    'each founder was created exactly once across both attempts');
  t.same([...world.executed].sort(), [...NODE_IDS],
    'the full requested cohort is founded');
  t.same(world.failed, [], 'nothing is orphaned or failed');
  t.equal(world.warnings.filter((w) =>
    w.message === FOUNDING_BELOW_REQUESTED_MSG).length, 0,
  'no smaller child is founded');
});
