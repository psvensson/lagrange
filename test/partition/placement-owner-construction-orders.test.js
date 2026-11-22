// P0 (placement-owner proof transfer, stage B precondition): the construction
// invariant through the production construction path, for every construction
// order the code allows.
//
// Requirement (owner, binding): single-owner scheduling. On a node exactly one
// scheduler exists, the ReplicaPlacementOwner attached to the
// replica_operations-p1 partition service, and no partition service holds a
// per-partition UnifiedRebalancer; the per-partition scheduler is not
// reactivated.
//
// REAL: ControlPlaneSetup.create (RebalanceCoordinator, bound placement-owner
// factory, readiness service with its ServeEligibilityOwner), PartitionService
// construction/initialize (a single-replica group campaigns and leads through
// its consensus port's role event), setRebalanceCoordinator and
// StartupRuntimeSurfaceOwner.bindControlPlaneServices (the seed/join binder),
// maybeInitializeRebalancer and its placement guard, RebalanceCoordinator
// constructed directly for the existing-coordinator order.
// SUBSTITUTED: consensus port (controllable), inert router/CDC/SQL engine,
// SystemTableCache seeded through applySystemTableChange. Evidence ceiling:
// the composition of one node's control plane and partition services, not a
// process started by the bootstrap.
//
// Anti-vacuity: every non-ledger service LEADS, is background-work ready and
// holds all six rebalancer dependencies (asserted), so deleting the placement
// guard (partition-service-rebalancer-methods.js:181-183) builds a
// UnifiedRebalancer and turns every order red; skipping the factory binding
// (control-plane-setup.js:415) leaves the flag false while the user and
// priority partitions are bound before the ledger partition (join order) and
// turns that order red.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {StartupRuntimeSurfaceOwner} from
  '../../src/bootstrap/shared/startup-runtime-surface-owner.js';
import {
  REPLICA_OPERATIONS_SCHEMA, SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {createControlPlaneRuntimeBundle} from
  '../../src/control-plane/control-plane-runtime-bundle.js';
import {ControlPlaneReadinessService} from
  '../../src/control-plane/control-plane-readiness-service.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {StorageCapacityAccountingService} from
  '../../src/rebalancer/storage-capacity-accounting-service.js';
import {UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';
import {
  LEDGER, TEST_TABLE_SCHEMA, THREE_NODES, inertSqlEngine, ownerOf, withPlacementWorld,
} from '../rebalancer/placement-owner-authority-fixture.js';
import {createControllablePartitionService} from './partition-service-test-support.js';
import {
  clearFixtureSingletons, resetFixtureSingletons, settleTicks,
} from '../test-helpers/participant-transaction-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const USER = 'orders-p1';
const PRIORITY = 'sql_transactions-p1';
const SPEC = Object.freeze({nodes: THREE_NODES, partitions: [
  {partitionId: LEDGER, replicaNodeIds: ['n1', 'n2', 'n3']},
  {partitionId: PRIORITY, leaderNodeId: 'n1', replicaNodeIds: ['n1']},
  {partitionId: USER, leaderNodeId: 'n1', replicaNodeIds: ['n1']},
]});

// One single-replica partition service on the node with all six rebalancer
// dependencies; `coordinator` is handed at construction (seed) or later.
function createPartition(world, node, partitionId, coordinator) {
  const ledger = partitionId === LEDGER;
  const replicaId = `${partitionId}-${node.nodeId}`;
  const service = createControllablePartitionService({partitionId,
    tableId: ledger ? SYSTEM_TABLE_NAME.REPLICA_OPERATIONS : 'test_table',
    tableName: ledger ? SYSTEM_TABLE_NAME.REPLICA_OPERATIONS : 'test_table',
    replicaId, replicaIds: [replicaId], nodeId: node.nodeId,
    peerAddresses: [`${node.nodeId}/partition/${replicaId}`], systemTableCache: node.cache,
    schema: ledger ? REPLICA_OPERATIONS_SCHEMA : TEST_TABLE_SCHEMA, dbPath: ':memory:',
    cdcIntegrationService: node.cdc, sqlQueryEngine: inertSqlEngine(),
    tablePolicyService: node.tablePolicy, messageRouter: node.router,
    rebalanceCoordinator: coordinator});
  world.targets.push(service);
  return service;
}

// The node's schedulers after an order settles: per service, whether it holds
// a per-partition UnifiedRebalancer and whether a placement owner is attached.
function schedulersOf(services) {
  return services.map((service) => ({partitionId: service.partitionId,
    leads: service.isLeader === true,
    rebalancer: service.rebalancer instanceof UnifiedRebalancer ? 'UnifiedRebalancer' :
      service.rebalancer === null ? null : typeof service.rebalancer,
    placementOwner: Boolean(service.replicaPlacementOwnerAttachment?.owner),
    sinkIsOwner: Boolean(service.replicaPlacementOwnerAttachment?.owner) &&
      service.rebalancerLeadershipSink === service.replicaPlacementOwnerAttachment.owner}));
}

function assertPreconditionsForAPartitionScheduler(services) {
  for (const service of services) {
    assert.equal(service.isLeader, true, `${service.partitionId} leads`);
    assert.equal(service.isBackgroundWorkReady(), true,
      `${service.partitionId} is background-work ready`);
    assert.ok(service.buildRebalancerDependencyBundle(),
      `${service.partitionId} holds all six rebalancer dependencies: only the placement ` +
      'guard stands between it and a per-partition UnifiedRebalancer');
  }
}

// The construction invariant: exactly one scheduler, the placement owner on
// the ledger service, leading with the ledger; no UnifiedRebalancer anywhere.
function assertSingleScheduler(order, services, ledger) {
  const observed = schedulersOf(services);
  const unified = observed.filter((entry) => entry.rebalancer !== null);
  assert.deepEqual(unified, [], `${order}: no partition service holds a per-partition ` +
    `rebalancer; observed ${JSON.stringify(observed)}`);
  const owners = observed.filter((entry) => entry.placementOwner);
  assert.deepEqual(owners.map((entry) => entry.partitionId), [LEDGER],
    `${order}: exactly one placement owner, on the ledger partition; ${JSON.stringify(observed)}`);
  assert.equal(owners[0].sinkIsOwner, true, `${order}: the owner is the ledger's leadership sink`);
  assert.equal(ownerOf({ledger})?.isLeader, true,
    `${order}: the placement owner leads with its ledger replica`);
}

// The coordinator and its collaborators built with the production
// constructors and the arguments ControlPlaneSetup.create gives them
// (control-plane-setup.js:283-371), without the factory binding at :415.
function constructCoordinatorAsSetupDoes(node) {
  const bundle = createControlPlaneRuntimeBundle({nodeId: node.nodeId,
    cdcIntegrationService: node.cdc, systemTableCache: node.cache,
    messageRouter: node.router});
  const gateway = bundle.controlPlaneSystemTableGateway;
  const storageAccountingService = new StorageCapacityAccountingService({
    systemTableCache: node.cache, sqlQueryEngine: bundle.sqlQueryEngine,
    controlPlaneSystemTableGateway: gateway});
  const controlPlaneReadinessService = new ControlPlaneReadinessService({nodeId: node.nodeId,
    systemTableCache: node.cache, cacheMutationTarget: node.cache, messageRouter: node.router,
    storageAccountingService, cdcIntegrationService: node.cdc,
    cdcGroupPropagationService: null, controlPlaneSystemTableGateway: gateway,
    getLocalClusterIncarnationFence: () => null, strictOwnerDependencies: true});
  const coordinator = new RebalanceCoordinator({nodeId: node.nodeId, bootIncarnation: 1,
    systemTableCache: node.cache, cdcIntegrationService: node.cdc,
    messageRouter: node.router, tablePolicyService: node.tablePolicy,
    sqlQueryEngine: bundle.sqlQueryEngine, storageAccountingService,
    controlPlaneReadinessService, controlPlaneSystemTableGateway: gateway});
  coordinator.initialize();
  return coordinator;
}

async function initializeAll(services) {
  for (const service of services) await service.initialize();
  await settleTicks();
}

test('P0 seed order: coordinator from ControlPlaneSetup.create handed to every partition ' +
  'service at construction', () => withPlacementWorld(SPEC, async (world) => {
  const node = await world.addNode('n1');
  assert.equal(node.coordinator.placementAdmissionEnabled, true,
    'ControlPlaneSetup.create binds the placement-owner factory before returning');
  assert.ok(node.coordinator.controlPlaneReadinessService.serveEligibilityOwner,
    'ControlPlaneSetup.create leaves the owner\'s node authority instantiated (attach precondition)');
  const user = createPartition(world, node, USER, node.coordinator);
  const priority = createPartition(world, node, PRIORITY, node.coordinator);
  const ledger = createPartition(world, node, LEDGER, node.coordinator);
  await initializeAll([user, priority, ledger]);
  assertPreconditionsForAPartitionScheduler([user, priority]);
  assertSingleScheduler('seed', [user, priority, ledger], ledger);
}));

test('P0 join order: partition services initialised and leading before the coordinator ' +
  'exists, then bound by StartupRuntimeSurfaceOwner.bindControlPlaneServices',
() => withPlacementWorld(SPEC, async (world) => {
  const node = await world.addNode('n1', {controlPlane: false});
  const user = createPartition(world, node, USER, null);
  const priority = createPartition(world, node, PRIORITY, null);
  const ledger = createPartition(world, node, LEDGER, null);
  await initializeAll([user, priority, ledger]);
  assert.deepEqual(schedulersOf([user, priority, ledger]).map((entry) => entry.rebalancer),
    [null, null, null], 'no scheduler before a coordinator exists');
  await world.addControlPlane(node);
  // The binder walks partition services in registration order: the user and
  // priority partitions are handed the coordinator before the ledger is.
  const binder = new StartupRuntimeSurfaceOwner({delegates: {
    getTablePolicyService: () => node.tablePolicy,
    getRebalanceCoordinator: () => node.coordinator,
    getMessageGroupServices: () => new Map(),
    getPartitionServices: () => new Map([[USER, user], [PRIORITY, priority], [LEDGER, ledger]]),
  }});
  binder.bindControlPlaneServices();
  await settleTicks();
  assertPreconditionsForAPartitionScheduler([user, priority]);
  assertSingleScheduler('join', [user, priority, ledger], ledger);
}));

test('P0 late ledger replica: a joiner whose ledger replica is created after the ' +
  'coordinator was bound to its other partitions', () => withPlacementWorld(SPEC, async (world) => {
  const node = await world.addNode('n1');
  const user = createPartition(world, node, USER, null);
  const priority = createPartition(world, node, PRIORITY, null);
  await initializeAll([user, priority]);
  user.setRebalanceCoordinator(node.coordinator);
  priority.setRebalanceCoordinator(node.coordinator);
  await settleTicks();
  assertPreconditionsForAPartitionScheduler([user, priority]);
  assert.deepEqual(schedulersOf([user, priority]).filter((entry) =>
    entry.rebalancer !== null || entry.placementOwner), [],
  'before a ledger replica exists on the node: no scheduler at all');
  const ledger = createPartition(world, node, LEDGER, node.coordinator);
  await initializeAll([ledger]);
  assertSingleScheduler('late-ledger', [user, priority, ledger], ledger);
}));

async function existingCoordinatorOrder(world, initializationOrder) {
  const node = await world.addNode('n1', {controlPlane: false});
  // The production class, constructed before the setup binds a factory: the
  // order the PartitionService constructor/setter and ControlPlaneSetup.create
  // ({rebalanceCoordinator}) accept. The two production callers pass a
  // coordinator that is null on their first call; a second call was not traced.
  const existing = constructCoordinatorAsSetupDoes(node);
  assert.equal(existing.placementAdmissionEnabled, false,
    'a coordinator outside ControlPlaneSetup.create starts with placement admission off');
  const services = new Map(initializationOrder.map((partitionId) =>
    [partitionId, createPartition(world, node, partitionId, existing)]));
  await initializeAll([...services.values()]);
  const beforeBinding = schedulersOf([...services.values()]);
  await world.addControlPlane(node, existing);
  assert.equal(node.coordinator, existing, 'ControlPlaneSetup.create adopts the existing coordinator');
  assert.equal(existing.placementAdmissionEnabled, true, 'the factory is bound afterwards');
  const binder = new StartupRuntimeSurfaceOwner({delegates: {
    getTablePolicyService: () => node.tablePolicy,
    getRebalanceCoordinator: () => node.coordinator,
    getMessageGroupServices: () => new Map(),
    getPartitionServices: () => services,
  }});
  binder.bindControlPlaneServices();
  await settleTicks();
  const user = services.get(USER);
  const priority = services.get(PRIORITY);
  assertPreconditionsForAPartitionScheduler([user, priority]);
  assertSingleScheduler(`existing-coordinator ${initializationOrder.join(' > ')} ` +
    `(before binding: ${JSON.stringify(beforeBinding)})`,
  [user, priority, services.get(LEDGER)], services.get(LEDGER));
}

test('P0 existing coordinator, user and priority partitions initialised before the ledger: ' +
  'a coordinator handed to leading partition services before ControlPlaneSetup.create binds ' +
  'its factory (the existing-rebalancer branch precedes the placement guard)',
() => withPlacementWorld(SPEC,
  (world) => existingCoordinatorOrder(world, [USER, PRIORITY, LEDGER])));

test('P0 existing coordinator, ledger initialised first: the ledger replica is handed the ' +
  'coordinator before any partition service of the node reached the placement guard',
() => withPlacementWorld(SPEC,
  (world) => existingCoordinatorOrder(world, [LEDGER, USER, PRIORITY])));
