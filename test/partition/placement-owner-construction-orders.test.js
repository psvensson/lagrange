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
// holds all six rebalancer dependencies (asserted), the conditions under which
// the retired per-partition construction built a UnifiedRebalancer, so any
// construction from them turns the order red (the count); skipping the
// factory binding (ControlPlaneSetup.create) leaves the ledger replica
// registered and waiting with no owner and turns every order red (count and
// progress).
//
// Stage 3 (counts and progress in every order): per order, the COUNT of
// schedulers is asserted (zero per-partition schedulers; exactly one placement
// owner on the node while it hosts a live ledger replica, zero otherwise) and
// placement still proceeds: the one owner reaches the admission boundary
// under its tenure (`observation.totals.proposals` grows) for the node's
// deficits (user and priority partitions with one of three replicas). The
// committed NODES / control_plane_publications read of the node's OWN
// ServeEligibilityOwner is answered by the fixture on the readiness service
// (readServeEligibilityCommittedRows, isLoadReady), so that owner is still
// created lazily, when production creates it: the ordering hazard stays.
// Orders added by the stage-3 census: late binding with no rebind, ledger
// leadership lost and regained, ledger replica shut down and restarted, join
// while formation is in progress (readiness transition fan-out).
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {SeedCleanupHandler} from '../../src/bootstrap/phases/seed-cleanup-handler.js';
import {StartupRuntimeSurfaceOwner} from
  '../../src/bootstrap/shared/startup-runtime-surface-owner.js';
import {
  REPLICA_OPERATIONS_SCHEMA, SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {createControlPlaneRuntimeBundle} from
  '../../src/control-plane/control-plane-runtime-bundle.js';
import {ControlPlaneReadinessService} from
  '../../src/control-plane/control-plane-readiness-service.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {StorageCapacityAccountingService} from
  '../../src/rebalancer/storage-capacity-accounting-service.js';
import {UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';
import {
  LEDGER, TEST_TABLE_SCHEMA, THREE_NODES, inertSqlEngine, ownerOf, waitUntil, withPlacementWorld,
} from '../rebalancer/placement-owner-authority-fixture.js';
import {createControllablePartitionService} from './partition-service-test-support.js';
import {
  clearFixtureSingletons, resetFixtureSingletons, settleTicks,
} from '../test-helpers/participant-transaction-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

// Bounds a read of the eligibility owner that setup may have started before
// the fixture answered it (its own read timeout), then the owner's pass.
const PLACEMENT_WAIT_MS = 15_000;
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
    // A partition service no longer declares the field (stage 3b): absent or
    // null is "no per-partition scheduler"; anything else is counted.
    rebalancer: service.rebalancer instanceof UnifiedRebalancer ? 'UnifiedRebalancer' :
      service.rebalancer === null || service.rebalancer === undefined ? null :
        typeof service.rebalancer,
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

// The counts on the node: zero per-partition schedulers; exactly one
// placement owner, on the ledger service and its leadership sink, while the
// node hosts a live ledger replica (`ledger` not shut down), zero otherwise.
function assertSchedulerCounts(order, services, ledger) {
  const observed = schedulersOf(services);
  const unified = observed.filter((entry) => entry.rebalancer !== null);
  assert.deepEqual(unified, [], `${order}: no partition service holds a per-partition ` +
    `rebalancer; observed ${JSON.stringify(observed)}`);
  const owners = observed.filter((entry) => entry.placementOwner);
  const hostsLedger = Boolean(ledger) && ledger.isShutdown !== true;
  assert.deepEqual(owners.map((entry) => entry.partitionId), hostsLedger ? [LEDGER] : [],
    `${order}: ${hostsLedger ? 'exactly one placement owner, on the ledger partition' :
      'no placement owner without a live ledger replica'}; ${JSON.stringify(observed)}`);
  if (hostsLedger) {
    assert.equal(owners[0].sinkIsOwner, true, `${order}: the owner is the ledger's leadership sink`);
  }
}

// Placement still proceeds: the one owner reaches the admission boundary under
// its current tenure for the node's deficits (more proposals than `before`).
async function assertPlacementProceeds(order, ledger, before = 0) {
  const owner = ownerOf({ledger});
  try {
    await waitUntil(() => owner.observation.totals.proposals > before,
      `${order}: placement proceeds`, PLACEMENT_WAIT_MS);
  } catch {
    assert.fail(`${order}: the placement owner never proposed past ${before}; totals ` +
      `${JSON.stringify(owner.observation.totals)}; last pass ` +
      `${JSON.stringify(owner.lastPassSnapshot)}`);
  }
}

// The construction invariant: exactly one scheduler, the placement owner on
// the ledger service, leading with the ledger; no UnifiedRebalancer anywhere;
// and that owner places.
async function assertSingleScheduler(order, services, ledger) {
  assertSchedulerCounts(order, services, ledger);
  assert.equal(ownerOf({ledger})?.isLeader, true,
    `${order}: the placement owner leads with its ledger replica`);
  await assertPlacementProceeds(order, ledger);
}

// The fixture answers the committed read of the node's own (lazily created)
// ServeEligibilityOwner; see the header.
function answerCommittedReadsAt(world, readiness) {
  readiness.readServeEligibilityCommittedRows = async (tableName) =>
    world.committedRows(tableName);
  readiness.isLoadReady = () => true;
}

async function addControlPlaneAnsweringReads(world, node, existing = null) {
  await world.addControlPlane(node, existing);
  answerCommittedReadsAt(world, node.coordinator.controlPlaneReadinessService);
}

// The coordinator and its collaborators built with the production
// constructors and the arguments ControlPlaneSetup.create gives them
// (control-plane-setup.js:283-371), without the factory binding at :415.
function constructCoordinatorAsSetupDoes(world, node) {
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
  answerCommittedReadsAt(world, controlPlaneReadinessService);
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
  answerCommittedReadsAt(world, node.coordinator.controlPlaneReadinessService);
  assert.equal(node.coordinator.placementAdmissionEnabled, true,
    'ControlPlaneSetup.create binds the placement-owner factory before returning');
  assert.ok(node.coordinator.controlPlaneReadinessService.serveEligibilityOwner,
    'ControlPlaneSetup.create leaves the owner\'s node authority instantiated (attach precondition)');
  const user = createPartition(world, node, USER, node.coordinator);
  const priority = createPartition(world, node, PRIORITY, node.coordinator);
  const ledger = createPartition(world, node, LEDGER, node.coordinator);
  await initializeAll([user, priority, ledger]);
  assertPreconditionsForAPartitionScheduler([user, priority]);
  await assertSingleScheduler('seed', [user, priority, ledger], ledger);
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
  await addControlPlaneAnsweringReads(world, node);
  // The binder walks partition services in registration order: the user and
  // priority partitions are handed the coordinator before the ledger is.
  bindLikeStartup(node, new Map([[USER, user], [PRIORITY, priority], [LEDGER, ledger]]));
  await settleTicks();
  assertPreconditionsForAPartitionScheduler([user, priority]);
  await assertSingleScheduler('join', [user, priority, ledger], ledger);
}));

// StartupRuntimeSurfaceOwner.bindControlPlaneServices over `services`, with
// the coordinator the node holds when the sweep runs.
function bindLikeStartup(node, services, coordinator = node.coordinator) {
  new StartupRuntimeSurfaceOwner({delegates: {
    getTablePolicyService: () => node.tablePolicy,
    getRebalanceCoordinator: () => coordinator,
    getMessageGroupServices: () => new Map(),
    getPartitionServices: () => services,
  }}).bindControlPlaneServices();
}

test('P0 late ledger replica: a joiner whose ledger replica is created after the ' +
  'coordinator was bound to its other partitions', () => withPlacementWorld(SPEC, async (world) => {
  const node = await world.addNode('n1');
  answerCommittedReadsAt(world, node.coordinator.controlPlaneReadinessService);
  const user = createPartition(world, node, USER, null);
  const priority = createPartition(world, node, PRIORITY, null);
  await initializeAll([user, priority]);
  user.setRebalanceCoordinator(node.coordinator);
  priority.setRebalanceCoordinator(node.coordinator);
  await settleTicks();
  assertPreconditionsForAPartitionScheduler([user, priority]);
  assertSchedulerCounts('late-ledger, before a ledger replica exists on the node',
    [user, priority], null);
  const ledger = createPartition(world, node, LEDGER, node.coordinator);
  await initializeAll([ledger]);
  await assertSingleScheduler('late-ledger', [user, priority, ledger], ledger);
}));

// The production class, constructed before the setup binds a factory: the
// order the PartitionService constructor/setter and ControlPlaneSetup.create
// ({rebalanceCoordinator}) accept. The two production callers pass a
// coordinator that is null on their first call (stage-3 census: the only
// production construction of a RebalanceCoordinator is inside
// ControlPlaneSetup.create, which binds before it returns).
async function existingCoordinatorWorld(world, initializationOrder) {
  const node = await world.addNode('n1', {controlPlane: false});
  const existing = constructCoordinatorAsSetupDoes(world, node);
  assert.equal(existing.placementAdmissionEnabled, false,
    'a coordinator outside ControlPlaneSetup.create starts with placement admission off');
  const services = new Map(initializationOrder.map((partitionId) =>
    [partitionId, createPartition(world, node, partitionId, existing)]));
  await initializeAll([...services.values()]);
  const beforeBinding = schedulersOf([...services.values()]);
  await world.addControlPlane(node, existing);
  assert.equal(node.coordinator, existing, 'ControlPlaneSetup.create adopts the existing coordinator');
  assert.equal(existing.placementAdmissionEnabled, true, 'the factory is bound afterwards');
  return {node, services, beforeBinding};
}

async function existingCoordinatorOrder(world, initializationOrder) {
  const {node, services, beforeBinding} = await existingCoordinatorWorld(world,
    initializationOrder);
  bindLikeStartup(node, services);
  await settleTicks();
  const user = services.get(USER);
  const priority = services.get(PRIORITY);
  assertPreconditionsForAPartitionScheduler([user, priority]);
  await assertSingleScheduler(`existing-coordinator ${initializationOrder.join(' > ')} ` +
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

test('P0 late factory binding with no rebind: the ledger met the coordinator before its ' +
  'factory was bound and nothing hands it the coordinator again; the binding alone must ' +
  'give the node its one scheduler', () => withPlacementWorld(SPEC, async (world) => {
  const {services, beforeBinding} = await existingCoordinatorWorld(world,
    [LEDGER, USER, PRIORITY]);
  await settleTicks();
  const ledger = services.get(LEDGER);
  assertPreconditionsForAPartitionScheduler([services.get(USER), services.get(PRIORITY)]);
  await assertSingleScheduler('late binding, no rebind (before binding: ' +
    `${JSON.stringify(beforeBinding)})`, [...services.values()], ledger);
}));

test('P0 ledger leadership lost and regained: every leadership edge of every partition ' +
  'reaches maybeInitializeRebalancer; the node keeps its one owner (the same object) and ' +
  'builds no per-partition scheduler', () => withPlacementWorld(SPEC, async (world) => {
  const node = await world.addNode('n1');
  answerCommittedReadsAt(world, node.coordinator.controlPlaneReadinessService);
  const user = createPartition(world, node, USER, node.coordinator);
  const priority = createPartition(world, node, PRIORITY, node.coordinator);
  const ledger = createPartition(world, node, LEDGER, node.coordinator);
  const services = [user, priority, ledger];
  await initializeAll(services);
  await assertSingleScheduler('leadership: first tenure', services, ledger);
  const owner = ownerOf({ledger});
  const proposedBefore = owner.observation.totals.proposals;
  for (const service of services) service.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
  await settleTicks();
  assertSchedulerCounts('leadership: every partition deposed', services, ledger);
  assert.equal(owner.isLeader, false, 'the deposed ledger replica\'s owner does not lead');
  for (const service of services) {
    service.controllablePort.term += 1;
    service.controllablePort.setRole(RAFT_ROLE.LEADER);
  }
  await settleTicks();
  assertPreconditionsForAPartitionScheduler([user, priority]);
  assertSchedulerCounts('leadership: every partition re-elected', services, ledger);
  assert.equal(ownerOf({ledger}), owner, 'the same owner: no second owner was constructed');
  assert.equal(owner.isLeader, true, 'the owner leads again under the new tenure');
  await assertPlacementProceeds('leadership: re-elected', ledger, proposedBefore);
}));

test('P0 ledger replica shut down and restarted on the node: zero owners while the node ' +
  'hosts no ledger replica, then exactly one, the new replica\'s',
() => withPlacementWorld(SPEC, async (world) => {
  const node = await world.addNode('n1');
  answerCommittedReadsAt(world, node.coordinator.controlPlaneReadinessService);
  const user = createPartition(world, node, USER, node.coordinator);
  const priority = createPartition(world, node, PRIORITY, node.coordinator);
  const first = createPartition(world, node, LEDGER, node.coordinator);
  await initializeAll([user, priority, first]);
  await assertSingleScheduler('restart: first ledger replica', [user, priority, first], first);
  const firstOwner = ownerOf({ledger: first});
  await first.shutdown();
  world.targets.splice(world.targets.indexOf(first), 1);
  await settleTicks();
  assertSchedulerCounts('restart: ledger replica shut down', [user, priority, first], first);
  assert.equal(firstOwner.isLeader, false, 'the shut-down replica\'s owner does not lead');
  const second = createPartition(world, node, LEDGER, node.coordinator);
  await initializeAll([second]);
  assertSchedulerCounts('restart: the old replica stays without an owner', [first], first);
  assert.notEqual(ownerOf({ledger: second}), firstOwner, 'the new replica has its own owner');
  assert.equal(firstOwner.isLeader, false, 'the old owner stays ended');
  await assertSingleScheduler('restart: new ledger replica', [user, priority, second], second);
}));

// The node's cleanup (SeedCleanupHandler.quiesceRebalancers, the step both
// cleanup paths run) quiesces every partition's rebalancing and shuts the
// coordinator down; the partition services themselves are shut down only
// later in the cleanup. Every attach entry that still reaches the ledger
// replica in between must attach nothing and start no custody.
test('P0 teardown: after the cleanup quiesced the node\'s rebalancing, a later leadership ' +
  'edge or readiness transition on the still-running ledger replica attaches no placement ' +
  'owner and starts no custody', () => withPlacementWorld(SPEC, async (world) => {
  const node = await world.addNode('n1');
  answerCommittedReadsAt(world, node.coordinator.controlPlaneReadinessService);
  const user = createPartition(world, node, USER, node.coordinator);
  const priority = createPartition(world, node, PRIORITY, node.coordinator);
  const ledger = createPartition(world, node, LEDGER, node.coordinator);
  const services = [user, priority, ledger];
  await initializeAll(services);
  await assertSingleScheduler('teardown: before the cleanup', services, ledger);
  const owner = ownerOf({ledger});
  let coordinator = node.coordinator;
  const quiet = {debug() {}, info() {}, warn() {}, error() {}};
  await new SeedCleanupHandler({delegates: {
    getLogger: () => quiet,
    getPartitionServices: () => new Map(services.map((service) => [service.replicaId, service])),
    getMessageGroupServices: () => new Map(),
    getRebalanceCoordinator: () => coordinator,
    clearRebalanceCoordinator: () => {
      coordinator = null;
    },
  }}).quiesceRebalancers();
  assert.equal(ledger.isShutdown, false, 'premise: the cleanup has not shut the ledger down yet');
  assert.equal(ledger.replicaPlacementOwnerAttachment, null, 'premise: the quiesce detached');
  assert.equal(owner.isLeader, false, 'premise: the quiesced owner does not lead');
  // Observation only: every attachment the coordinator hands out from here on.
  const attachedAfterQuiesce = [];
  const attach = node.coordinator.attachLedgerReplicaPlacementOwner;
  node.coordinator.attachLedgerReplicaPlacementOwner = function observedAttach(service) {
    const attachment = attach.call(this, service);
    if (attachment) attachedAfterQuiesce.push(attachment);
    return attachment;
  };
  ledger.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
  await settleTicks();
  ledger.controllablePort.term += 1;
  ledger.controllablePort.setRole(RAFT_ROLE.LEADER);
  await settleTicks();
  ledger.handleMetadataPublicationReadinessTransition();
  await settleTicks();
  assert.equal(ledger.isLeader, true, 'premise: the ledger replica leads again');
  assert.deepEqual(attachedAfterQuiesce.map((attachment) => ({
    leads: attachment.owner.isLeader, passes: attachment.owner.observation.totals.passes,
  })), [], 'no placement owner is attached after the quiesce');
  assert.equal(ledger.replicaPlacementOwnerAttachment, null, 'the ledger holds no attachment');
  assert.equal(ledger.rebalancerLeadershipSink, null, 'the ledger has no leadership sink');
  assert.equal(owner.isLeader, false, 'the quiesced owner stays ended');
  assert.equal(node.coordinator.ledgerPartitionServices.has(ledger), false,
    'the quiesced ledger replica is not registered again');
  // F4: the binder sweep is the one re-attach path left after a quiesce (it has
  // no shutting-down check and runs after ControlPlaneSetup.create at both call
  // sites). It reads the node's coordinator, which the cleanup cleared: sweeping
  // the quiesced node's services attaches nothing.
  bindLikeStartup(node, new Map(services.map((service) => [service.partitionId, service])),
    coordinator);
  await settleTicks();
  assert.deepEqual(attachedAfterQuiesce.length, 0,
    'the binder sweep after the quiesce attaches no placement owner');
  assert.equal(ledger.replicaPlacementOwnerAttachment, null,
    'after the binder sweep the ledger holds no attachment');
  assert.equal(owner.isLeader, false, 'after the binder sweep the quiesced owner stays ended');
}));

test('P0 join while formation is in progress: the partition services are bound while not ' +
  'background-work ready; the readiness transition fan-out later reaches ' +
  'maybeInitializeRebalancer on every partition', () => withPlacementWorld(SPEC, async (world) => {
  const node = await world.addNode('n1', {controlPlane: false});
  const user = createPartition(world, node, USER, null);
  const priority = createPartition(world, node, PRIORITY, null);
  const ledger = createPartition(world, node, LEDGER, null);
  const services = [user, priority, ledger];
  // Substituted: the node-wide background-work readiness (formation not yet
  // complete), read through each service's own isBackgroundWorkReady.
  const formation = {ready: false};
  for (const service of services) service.isBackgroundWorkReady = () => formation.ready;
  await initializeAll(services);
  await addControlPlaneAnsweringReads(world, node);
  bindLikeStartup(node, new Map([[USER, user], [PRIORITY, priority], [LEDGER, ledger]]));
  await settleTicks();
  assertSchedulerCounts('formation in progress', services, ledger);
  formation.ready = true;
  for (const service of services) service.handleMetadataPublicationReadinessTransition();
  await settleTicks();
  assertPreconditionsForAPartitionScheduler([user, priority]);
  await assertSingleScheduler('formation complete', services, ledger);
}));

test('P0 re-entry during the attach (F1): a leadership event delivered synchronously by the ' +
  'first pass\'s status read, while the coordinator\'s factory is still on the stack, is a ' +
  'no-op: one factory call, no throw, one owner', () => withPlacementWorld(SPEC, async (world) => {
  const node = await world.addNode('n1', {controlPlane: false});
  const user = createPartition(world, node, USER, null);
  const priority = createPartition(world, node, PRIORITY, null);
  const ledger = createPartition(world, node, LEDGER, null);
  const services = [user, priority, ledger];
  await initializeAll(services);
  await addControlPlaneAnsweringReads(world, node);
  // Observation only: the coordinator's bound factory, counted and its depth
  // tracked, still the production factory underneath.
  const factory = node.coordinator.replicaPlacementOwnerFactory;
  const calls = {factory: 0, depth: 0, reentries: 0, reentryWhileAttaching: 0, thrown: []};
  node.coordinator.replicaPlacementOwnerFactory = (service) => {
    calls.factory += 1;
    calls.depth += 1;
    try {
      return factory(service);
    } finally {
      calls.depth -= 1;
    }
  };
  // The substituted port delivers one leadership event to the partition from
  // inside its status read (a read that may run a consensus turn and notify).
  // The opened port is frozen: the ledger's port is replaced by one that
  // delegates every member to it and observes its status read.
  const port = ledger.raft;
  const readStatus = () => port.readStatus();
  const observedReadStatus = () => {
    if (calls.reentries === 0) {
      calls.reentries += 1;
      if (calls.depth > 0) calls.reentryWhileAttaching += 1;
      try {
        ledger.updateRebalancerLeadership();
      } catch (error) {
        calls.thrown.push(error?.code ?? error?.message ?? String(error));
      }
    }
    return readStatus();
  };
  ledger.raft = Object.create(port, {readStatus: {value: observedReadStatus}});
  bindLikeStartup(node, new Map([[USER, user], [PRIORITY, priority], [LEDGER, ledger]]));
  await settleTicks();
  assert.equal(calls.reentryWhileAttaching, 1,
    'anti-vacuity: the leadership event re-entered while the factory was on the stack');
  assert.deepEqual(calls.thrown, [], 'the re-entrant leadership event does not throw');
  assert.equal(calls.factory, 1, 'the factory runs once: the re-entry attaches nothing');
  await assertSingleScheduler('re-entry during the attach', services, ledger);
}));

test('F4 (finding, schedule not traced in production): a binder sweep that still holds the ' +
  'node\'s coordinator after the cleanup quiesced the node (a startup that re-binds the ' +
  'coordinator after its await of ControlPlaneSetup.create) attaches no placement owner',
() => withPlacementWorld(SPEC, async (world) => {
  const node = await world.addNode('n1');
  answerCommittedReadsAt(world, node.coordinator.controlPlaneReadinessService);
  const user = createPartition(world, node, USER, node.coordinator);
  const priority = createPartition(world, node, PRIORITY, node.coordinator);
  const ledger = createPartition(world, node, LEDGER, node.coordinator);
  const services = [user, priority, ledger];
  await initializeAll(services);
  await assertSingleScheduler('F4: before the cleanup', services, ledger);
  const owner = ownerOf({ledger});
  const quiet = {debug() {}, info() {}, warn() {}, error() {}};
  await new SeedCleanupHandler({delegates: {
    getLogger: () => quiet,
    getPartitionServices: () => new Map(services.map((service) => [service.replicaId, service])),
    getMessageGroupServices: () => new Map(),
    getRebalanceCoordinator: () => node.coordinator,
    clearRebalanceCoordinator: () => {},
  }}).quiesceRebalancers();
  assert.equal(ledger.replicaPlacementOwnerAttachment, null, 'premise: the quiesce detached');
  bindLikeStartup(node, new Map(services.map((service) => [service.partitionId, service])));
  await settleTicks();
  assert.equal(ledger.replicaPlacementOwnerAttachment, null,
    'a sweep after the quiesce attaches no placement owner');
  assert.equal(owner.isLeader, false, 'the quiesced owner stays ended');
}));
