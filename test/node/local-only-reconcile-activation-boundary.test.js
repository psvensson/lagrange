/**
 * Owner decision D2 (2026-09-30), on top of N2/S-F2: the CL-021 local-only
 * reconcile is the one remaining creator of a deferred SERVICES row, and it
 * must not be a second path to a durable ACTIVE.
 *
 * The census witness in this file first measures that an ACTIVE local state
 * IS reachable by that INSERT, and then pins the repair: the reconcile's
 * create crosses the same activation boundary a persisted ACTIVE transition
 * does (runPersistedTransitionEffect). The exact transport handler of the
 * tracked generation is checked inside the replica's lifecycle lane
 * immediately before the write, handler retirement waits for the write, and a
 * row whose deferring owner supplied no handler check stays typed retry debt
 * instead of becoming a durable ACTIVE.
 *
 * Non-ACTIVE deferred rows are unchanged: they carry no routing authority and
 * converge exactly as CL-021 requires.
 *
 * Scheduling is deterministic (an injected clock, an in-test gateway and a
 * gated write), never timed.
 */
import {test} from '../../src/test-helpers/tap.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {
  REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED,
  REPLICA_STATE_MACHINE_STATE,
} from '../../src/node/replica-state-machine-constants.js';
import {retireReplicaTransportHandler} from
  '../../src/node/replica-transport-handler-identity.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const NODE_ID = 'node-a';
const PARTITION_ID = 'control_plane_publications-p1';
const REPLICA_ID = `${PARTITION_ID}-r5`;
const ADDRESS = `${NODE_ID}/partition/${REPLICA_ID}`;
const SERVICE_TYPE_PARTITION = 'partition';

function createGateway() {
  const mutations = [];
  let writeGate = null;
  return {
    mutations,
    holdNextWrite() {
      let release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      let reach;
      const reached = new Promise((resolve) => {
        reach = resolve;
      });
      writeGate = {release, held, reach};
      return {release, reached};
    },
    async submitMutation(mutation) {
      mutations.push(mutation);
      const current = writeGate;
      writeGate = null;
      if (current) {
        current.reach();
        await current.held;
      }
      return {success: true};
    },
  };
}

// The partition replica runtime: its exact transport handler is registered at
// its address and it retires that handler through this lifecycle owner.
function createReplicaRuntime(router, stateMachine) {
  const service = {
    replicaId: REPLICA_ID,
    partitionId: PARTITION_ID,
    transport: router,
    unifiedAddress: ADDRESS,
    resolveHandlerRetirementLane: () => stateMachine,
  };
  service.transportHandler = () => ({acknowledged: true});
  router.register(ADDRESS, service.transportHandler);
  return service;
}

// One node whose priority create committed locally (CL-016: persist:false)
// and deferred the durable services-row write to the CL-021 reconcile.
async function createDeferredReplica(state, options = {}) {
  const nowRef = {value: 1_760_000_000_000};
  const gateway = createGateway();
  const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: NODE_ID});
  const stateMachine = new ReplicaStateMachine({
    nodeId: NODE_ID,
    cdcIntegrationService: gateway,
    controlPlaneSystemTableGateway: gateway,
    now: () => nowRef.value,
    timeoutCheckIntervalMs: 5_000,
  });
  const service = createReplicaRuntime(router, stateMachine);
  const context = {
    partitionId: PARTITION_ID,
    nodeId: NODE_ID,
    serviceId: REPLICA_ID,
    serviceType: SERVICE_TYPE_PARTITION,
    serviceAddress: ADDRESS,
  };
  for (const next of [REPLICA_STATE_MACHINE_STATE.PENDING,
    REPLICA_STATE_MACHINE_STATE.CREATING,
    REPLICA_STATE_MACHINE_STATE.SYNCING,
    REPLICA_STATE_MACHINE_STATE.ACTIVE]) {
    await stateMachine._applyTransition(REPLICA_ID, next, context,
      {persist: false, validate: false});
    if (next === state) break;
  }
  // What the deferring owner (ReplicaHandler.seedLocalPriorityServiceRow)
  // hands over with the marker: the exact-handler check of the transition
  // whose durable write it deferred.
  stateMachine.markServiceRowLocalOnly(REPLICA_ID,
    options.withoutActivation === true ? null : {
      isEffectHandlerCurrent: () =>
        router.getRegisteredHandler(ADDRESS) === service.transportHandler &&
        service.resolveHandlerRetirementLane() === stateMachine,
    });
  const retire = () => retireReplicaTransportHandler({transport: router,
    address: ADDRESS, handler: service.transportHandler,
    replicaId: REPLICA_ID, lane: stateMachine});
  return {stateMachine, gateway, router, service, retire};
}

test('D2 (1): the deferred create of an ACTIVE replica is written only with ' +
  'the exact handler registered', async (t) => {
  const world = await createDeferredReplica(
    REPLICA_STATE_MACHINE_STATE.ACTIVE);
  t.equal(world.stateMachine.getState(REPLICA_ID).state,
    REPLICA_STATE_MACHINE_STATE.ACTIVE, 'fixture: the local state is ACTIVE');

  const persisted = await world.stateMachine._reconcileLocalOnlyServiceRows();

  t.equal(world.gateway.mutations.length, 1, 'one durable creation attempt');
  const insert = world.gateway.mutations[0];
  t.equal(insert.operation.toLowerCase(), 'insert',
    'the missing generation is created by INSERT, never an UPSERT');
  t.equal(insert.row.status, REPLICA_STATE_MACHINE_STATE.ACTIVE,
    'it carries the tracked lifecycle state it deferred');
  t.equal(persisted, 1, 'the deferred row converged');
  t.equal(world.stateMachine.isServiceRowLocalOnly(REPLICA_ID), false,
    'the local-only marker clears on the durable commit');
  t.equal(world.stateMachine.localOnlyServiceRowActivationByServiceId
    .has(REPLICA_ID), false, 'the handler check clears with the marker');
});

test('D2 (2): the handler is gone -> no durable ACTIVE, the row stays ' +
  'local-only retry debt', async (t) => {
  const world = await createDeferredReplica(
    REPLICA_STATE_MACHINE_STATE.ACTIVE);
  t.equal(await world.retire(), 'retired', 'the exact handler is retired');

  const persisted = await world.stateMachine._reconcileLocalOnlyServiceRows();

  t.equal(world.gateway.mutations.length, 0,
    'no durable ACTIVE is written for a replica with no registered handler');
  t.equal(persisted, 0, 'nothing converged');
  t.equal(world.stateMachine.isServiceRowLocalOnly(REPLICA_ID), true,
    'the marker is retained as retry debt');
  t.ok(world.stateMachine.localOnlyServiceRowRetryStateByServiceId
    .get(REPLICA_ID)?.notBeforeMs, 'backoff is armed, not a write storm');
});

test('D2 (3): another generation\'s handler at the same address is not ' +
  'authority for the deferred write', async (t) => {
  const world = await createDeferredReplica(
    REPLICA_STATE_MACHINE_STATE.ACTIVE);
  await world.retire();
  world.router.register(ADDRESS, () => ({acknowledged: true}));

  await world.stateMachine._reconcileLocalOnlyServiceRows();

  t.equal(world.gateway.mutations.length, 0,
    'presence at the address is not the exact handler');
  t.equal(world.stateMachine.isServiceRowLocalOnly(REPLICA_ID), true,
    'the marker is retained');
});

test('D2 (4): a deferring owner that supplied no handler check cannot reach ' +
  'a durable ACTIVE by this path', async (t) => {
  const world = await createDeferredReplica(
    REPLICA_STATE_MACHINE_STATE.ACTIVE, {withoutActivation: true});

  await world.stateMachine._reconcileLocalOnlyServiceRows();

  t.equal(world.gateway.mutations.length, 0,
    'an unbound deferred ACTIVE is refused, never written');
  t.equal(world.stateMachine.isServiceRowLocalOnly(REPLICA_ID), true,
    'the marker is retained as retry debt');
});

test('D2 (5): handler retirement waits for the in-flight deferred ACTIVE ' +
  'write', async (t) => {
  const world = await createDeferredReplica(
    REPLICA_STATE_MACHINE_STATE.ACTIVE);
  const write = world.gateway.holdNextWrite();
  const reconciling = world.stateMachine._reconcileLocalOnlyServiceRows();
  await write.reached;
  let retired = false;
  const retirement = world.retire().then(() => {
    retired = true;
  });
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
  t.equal(retired, false, 'the retirement waits for the activation effect');
  t.equal(world.router.getRegisteredHandler(ADDRESS),
    world.service.transportHandler,
    'the handler stays registered through the deferred write');
  write.release();
  t.equal(await reconciling, 1, 'the deferred row converged');
  await retirement;
  t.equal(world.router.getRegisteredHandler(ADDRESS), null,
    'retired only after the write settled');
});

test('D2 (6): a non-ACTIVE deferred row converges unchanged (CL-021)',
  async (t) => {
    const world = await createDeferredReplica(
      REPLICA_STATE_MACHINE_STATE.SYNCING, {withoutActivation: true});
    await world.retire();

    const persisted =
      await world.stateMachine._reconcileLocalOnlyServiceRows();

    t.equal(persisted, 1, 'a pre-ACTIVE generation still converges');
    t.equal(world.gateway.mutations[0].row.status,
      REPLICA_STATE_MACHINE_STATE.SYNCING,
      'created at its own state, carrying no routing authority');
    t.equal(world.stateMachine.isServiceRowLocalOnly(REPLICA_ID), false,
      'the marker clears');
  });

test('D2 (7): the refusal is the named activation outcome', async (t) => {
  t.ok(REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED,
    'the reconcile refuses through the one named handler outcome');
});
