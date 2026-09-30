/**
 * S-F2 (owner ruling 2026-09-30, N2 class): an executor-created replica's
 * durable ACTIVE for generation G is written only while the exact transport
 * handler of G stays registered through the activation effect boundary. The
 * ReplicaHandler binds the ACTIVE to the runtime it created; the
 * ReplicaStateMachine runs the exact-handler check in the replica's lifecycle
 * lane and opens the activation effect section in the same synchronous step;
 * handler retirement (the partition shutdown path) waits for an open section.
 * Scheduling is deterministic (gated durable calls, bounded microtask turns).
 */
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {TABLES} from '../../src/constants/index.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED} from
  '../../src/node/replica-state-machine-constants.js';
import {runSerializedReplicaMutation} from
  '../../src/node/replica-state-machine-serialization.js';
import {
  REPLICA_HANDLER_RETIREMENT_OUTCOME,
  retireReplicaTransportHandler,
} from '../../src/node/replica-transport-handler-identity.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {createLifecycleCdcService} from
  '../test-helpers/lifecycle-state-store.js';

const NODE_ID = 'node-a';
const PARTITION_ID = 'p1';
const REPLICA_ID = 'p1-r1';
const ADDRESS = `${NODE_ID}/partition/${REPLICA_ID}`;

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'silent'});
}

async function settleMicrotasks(turns = 20) {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve();
}

async function createWorld() {
  initializeEnvironment();
  const cdc = createLifecycleCdcService();
  const stateMachine = new ReplicaStateMachine({nodeId: NODE_ID,
    cdcIntegrationService: cdc});
  const router = new MessageRouter({nodeId: NODE_ID});
  const handler = new ReplicaHandler({nodeId: NODE_ID,
    systemTableCache: new SystemTableCache(), cdcIntegrationService: cdc,
    replicaStateMachine: stateMachine,
    createPartitionService: async () => null});
  // One executor-created runtime generation, as createPartitionService
  // builds it: the transport, its exact handler and the executor's owner.
  const runtime = (lane = () => stateMachine) => ({replicaId: REPLICA_ID,
    partitionId: PARTITION_ID, unifiedAddress: ADDRESS, transport: router,
    transportHandler: () => ({acknowledged: true}),
    resolveHandlerRetirementLane: lane});
  for (const status of [ReplicaStatus.PENDING, ReplicaStatus.CREATING,
    ReplicaStatus.SYNCING]) {
    await handler.updateReplicaStatus(REPLICA_ID, status,
      {partitionId: PARTITION_ID});
  }
  const activeCas = [];
  let casGate = null;
  cdc.store.setBeforeMutation(async (mutation) => {
    if (mutation.data?.status !== ReplicaStatus.ACTIVE) return;
    activeCas.push(router.getRegisteredHandler(ADDRESS));
    const gate = casGate;
    casGate = null;
    if (gate) {
      gate.reached();
      await gate.held;
    }
  });
  return {
    stateMachine, router, handler, runtime, activeCas,
    durableStatus: () =>
      cdc.store.durableRow(TABLES.SERVICES, REPLICA_ID)?.status,
    // The executor create path's ACTIVE write (replica-handler-create-methods
    // persistReplicaStatusWithRetry -> updateReplicaStatus).
    activate: (service) => handler.updateReplicaStatus(REPLICA_ID,
      ReplicaStatus.ACTIVE,
      {partitionId: PARTITION_ID, activationService: service}),
    // The production partition shutdown retirement (retirePartitionTransport-
    // Handler): exact identity, through the runtime's retirement lane.
    retire: (service) => retireReplicaTransportHandler({
      transport: service.transport, address: service.unifiedAddress,
      handler: service.transportHandler, replicaId: service.replicaId,
      lane: service.resolveHandlerRetirementLane()}),
    holdNextActiveCas() {
      let release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      let reached;
      const casReached = new Promise((resolve) => {
        reached = resolve;
      });
      casGate = {held, reached};
      return {release, casReached};
    },
  };
}

test('S-F2 (1): the exact generation handler is registered -> ACTIVE',
  async (t) => {
    const world = await createWorld();
    const g1 = world.runtime();
    world.router.register(ADDRESS, g1.transportHandler);
    await world.activate(g1);
    t.equal(world.durableStatus(), ReplicaStatus.ACTIVE);
    t.same(world.activeCas, [g1.transportHandler],
      'the exact handler was registered when the ACTIVE CAS was issued');
  });

test('S-F2 (2): the handler is absent -> refused, no ACTIVE CAS',
  async (t) => {
    const world = await createWorld();
    await t.rejects(world.activate(world.runtime()),
      {code: REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED});
    t.equal(world.activeCas.length, 0, 'no ACTIVE CAS was issued');
    t.equal(world.durableStatus(), ReplicaStatus.SYNCING);
    await t.rejects(world.activate(undefined),
      {code: REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED},
      'an ACTIVE not bound to a runtime is refused');
    t.equal(world.activeCas.length, 0);
  });

test('S-F2 (3a): retirement racing an activation inside its effect: the ' +
  'retirement waits, ACTIVE lands with the handler registered', async (t) => {
  const world = await createWorld();
  const g1 = world.runtime();
  world.router.register(ADDRESS, g1.transportHandler);
  const cas = world.holdNextActiveCas();
  const activation = world.activate(g1);
  await cas.casReached;
  let retired = null;
  const retirement = world.retire(g1).then((outcome) => {
    retired = outcome;
    return outcome;
  });
  await settleMicrotasks();
  t.equal(retired, null, 'the retirement waits for the in-flight ACTIVE CAS');
  t.equal(world.router.getRegisteredHandler(ADDRESS), g1.transportHandler,
    'the handler stays registered through the activation effect');
  cas.release();
  await activation;
  t.equal(await retirement, REPLICA_HANDLER_RETIREMENT_OUTCOME.RETIRED);
  t.equal(world.durableStatus(), ReplicaStatus.ACTIVE);
  t.same(world.activeCas, [g1.transportHandler],
    'exactly one ordering: ACTIVE first, with its handler registered');
  t.equal(world.router.getRegisteredHandler(ADDRESS), null,
    'then retired');
});

test('S-F2 (3b): retirement before the in-lane check: the activation is ' +
  'refused, no orphan ACTIVE', async (t) => {
  const world = await createWorld();
  const g1 = world.runtime();
  world.router.register(ADDRESS, g1.transportHandler);
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const occupant = runSerializedReplicaMutation(world.stateMachine,
    REPLICA_ID, () => held.then(() => true));
  const activation = world.activate(g1);
  await settleMicrotasks();
  t.equal(await world.retire(g1),
    REPLICA_HANDLER_RETIREMENT_OUTCOME.RETIRED,
    'no effect section is open yet: the retirement completes at once');
  release();
  t.equal(await occupant, true);
  await t.rejects(activation,
    {code: REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED},
    'the in-lane check refuses: the handler left before the ACTIVE CAS');
  t.equal(world.activeCas.length, 0, 'no ACTIVE CAS');
  t.equal(world.durableStatus(), ReplicaStatus.SYNCING,
    'no orphan ACTIVE row without its handler');
});

test('S-F2 (4): a handler for the same replica id but another generation ' +
  'does not satisfy the check', async (t) => {
  const world = await createWorld();
  const g1 = world.runtime();
  const g2 = world.runtime();
  world.router.register(ADDRESS, g2.transportHandler);
  await t.rejects(world.activate(g1),
    {code: REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED},
    'presence at the address is not this generation\'s handler');
  t.equal(world.activeCas.length, 0);
  t.equal(world.durableStatus(), ReplicaStatus.SYNCING);
  t.equal(world.router.getRegisteredHandler(ADDRESS), g2.transportHandler);
});

test('S-F2 (5): a delayed activation of an old generation cannot affect ' +
  'the replacement', async (t) => {
  const world = await createWorld();
  const g1 = world.runtime();
  world.router.register(ADDRESS, g1.transportHandler);
  t.equal(await world.retire(g1),
    REPLICA_HANDLER_RETIREMENT_OUTCOME.RETIRED, 'G1 shut down');
  const g2 = world.runtime();
  world.router.register(ADDRESS, g2.transportHandler);
  await t.rejects(world.activate(g1),
    {code: REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED},
    'the delayed G1 ACTIVE is refused');
  t.equal(world.activeCas.length, 0, 'no ACTIVE CAS on behalf of G1');
  t.equal(world.durableStatus(), ReplicaStatus.SYNCING);
  t.equal(await world.retire(g1),
    REPLICA_HANDLER_RETIREMENT_OUTCOME.ALREADY_ABSENT,
    'a delayed G1 retirement is a typed no-op');
  t.equal(world.router.getRegisteredHandler(ADDRESS), g2.transportHandler,
    'the G2 handler is untouched');
  await world.activate(g2);
  t.equal(world.durableStatus(), ReplicaStatus.ACTIVE,
    'the replacement activates through its own handler');
});

test('S-F2 (6): a runtime retired through another lifecycle owner cannot ' +
  'bind the ACTIVE (the effect section would not hold its retirement)',
async (t) => {
  const world = await createWorld();
  const otherOwner = new ReplicaStateMachine({nodeId: NODE_ID,
    controlPlaneSystemTableGateway: {}});
  const g1 = world.runtime(() => otherOwner);
  world.router.register(ADDRESS, g1.transportHandler);
  await t.rejects(world.activate(g1),
    {code: REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED});
  t.equal(world.activeCas.length, 0);
  t.equal(world.durableStatus(), ReplicaStatus.SYNCING);
});
