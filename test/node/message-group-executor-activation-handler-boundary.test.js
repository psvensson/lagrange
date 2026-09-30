/**
 * Owner decision N2 for the executor-created message-group replica (D1,
 * 2026-09-30): MessageGroupServiceHandler.createReplicaAsync registers the
 * SERVICES row STOPPED (a birth is never ACTIVE) and then activates it
 * through MessageGroupServiceRowOwner.activateReplica in the replica's
 * lifecycle lane: the ReplicaStateMachine its transport handler retires
 * through. The exact handler of this generation is checked inside the lane
 * and the ACTIVE CAS runs in the activation effect section, so handler
 * retirement waits for the CAS. Presence of some handler at the address is
 * never activation authority. Scheduling is deterministic (gated durable
 * calls, bounded microtask turns), never timed.
 */
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {MessageGroupServiceHandler} from
  '../../src/node/message-group-service-handler.js';
import {MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR} from
  '../../src/message-group/message-group-service-row-owner.js';
import {retireMessageGroupTransportHandler} from
  '../../src/bootstrap/shared/message-group-transport-handler.js';
import {EXECUTOR_OUTCOME_TYPE} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {
  createGatedServicesRow,
  createMessageGroupReplicaRuntime,
  turns,
} from '../test-helpers/message-group-activation-boundary-fixture.js';

const NODE_ID = 'node-a';
const GROUP_ID = 'mg-1';
const REPLICA_ID = 'mg-1-r4';
const ADDRESS = `${NODE_ID}/message-group/${REPLICA_ID}`;
const HANDLER_NOT_REGISTERED =
  MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.HANDLER_NOT_REGISTERED;
const CREATE_ACTIVE = EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_CREATE_ACTIVE;
const CREATE_FAILED = EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_CREATE_FAILED;

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

// One node: its router, its ReplicaStateMachine (the lifecycle owner), the
// durable SERVICES row, and the executor. The create hook builds the replica
// runtime through the production exact-identity registration.
function createWorld(options = {}) {
  initializeEnvironment();
  const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: NODE_ID});
  const stateMachine = new ReplicaStateMachine({nodeId: NODE_ID,
    controlPlaneSystemTableGateway: {}});
  const services = new Map();
  const runtime = (register = true) => createMessageGroupReplicaRuntime({
    router, stateMachine, address: ADDRESS, groupId: GROUP_ID,
    replicaId: REPLICA_ID, register});
  const durable = createGatedServicesRow(options.initialRow || null, {
    atCas: () => router.getRegisteredHandler(ADDRESS) ===
      services.get(REPLICA_ID)?.transportHandler,
  });
  const outcomes = [];
  const executor = new MessageGroupServiceHandler({
    nodeId: NODE_ID,
    systemTableCache: {get: () => null, filter: () => []},
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: durable,
    createMessageGroupReplica: async () => {
      const service = runtime(options.register !== false);
      if (options.register === false) {
        service.transportHandler = () => ({acknowledged: true});
        service.resolveHandlerRetirementLane = () => stateMachine;
      }
      services.set(REPLICA_ID, service);
    },
    startMessageGroupReplica: async () => {},
    stopMessageGroupReplica: async () => {},
    resolveLocalMessageGroupReplica: (replicaId) =>
      services.get(replicaId) || null,
    executorOutcomeEmitter: {
      emitOutcome(outcomeType, operationId, workflowStep, fields) {
        outcomes.push({outcomeType, ...fields});
      },
    },
  });
  executor.initialize();
  // As in production (MessageGroupServiceHandlerSetup): the executor holds
  // the node's router, so address presence is visible to it.
  executor.registerWithRouter(router);
  const create = () => executor.createReplicaAsync({operationId: 'op-1',
    groupId: GROUP_ID, replicaId: REPLICA_ID,
    replicaOptions: {groupId: GROUP_ID, replicaId: REPLICA_ID}});
  // The production retirement path: exact identity, against the owner's
  // activation effect section.
  const retire = (messageGroup) => retireMessageGroupTransportHandler({
    messageGroup, messageRouter: router, address: ADDRESS,
    replicaId: REPLICA_ID});
  return {router, stateMachine, services, runtime, durable, outcomes,
    executor, create, retire};
}

function assertRefused(t, world) {
  t.same(world.outcomes.map((outcome) => outcome.outcomeType),
    [CREATE_FAILED], 'the create fails');
  t.equal(world.outcomes[0].errorCode, HANDLER_NOT_REGISTERED,
    'refused with the named handler outcome');
  t.equal(world.durable.casCalls.length, 0, 'no ACTIVE CAS was issued');
  t.equal(world.durable.row.status, 'stopped', 'the row stays STOPPED');
}

test('MG executor N2 (1): the exact handler is registered -> STOPPED birth, ' +
  'then ACTIVE through the lifecycle owner', async (t) => {
  const world = createWorld();
  await world.create();
  t.same(world.outcomes.map((outcome) => outcome.outcomeType),
    [CREATE_ACTIVE]);
  t.equal(world.durable.insertCalls.length, 1);
  t.equal(world.durable.insertCalls[0].data.status, 'stopped',
    'the registration INSERT is a STOPPED birth, never ACTIVE');
  t.match(world.durable.casCalls[0].whereClause, {status: 'stopped',
    created_at: world.durable.insertCalls[0].data.created_at},
  'the ACTIVE CAS is fenced by the registered generation');
  t.same(world.durable.casCalls.map((call) => call.world), [true],
    'the handler was registered when the ACTIVE CAS was issued');
  t.equal(world.durable.row.status, 'active');
});

test('MG executor N2 (2): the handler is absent -> refused, the row stays ' +
  'STOPPED', async (t) => {
  const world = createWorld({register: false});
  await world.create();
  assertRefused(t, world);
});

test('MG executor N2 (3): the handler is removed during the activation -> ' +
  'no orphan ACTIVE in either ordering', async (t) => {
  // Retirement lands before the in-lane check (while the STOPPED birth is in
  // flight): no effect section is open, so it completes at once and the
  // activation is refused.
  const early = createWorld();
  const insert = early.durable.holdNextInsert();
  const creating = early.create();
  await insert.reached;
  t.equal(await early.retire(early.services.get(REPLICA_ID)), 'retired');
  t.equal(early.router.getRegisteredHandler(ADDRESS), null);
  insert.release();
  await creating;
  assertRefused(t, early);

  // Retirement arrives while the ACTIVE CAS is in flight: it waits for the
  // effect section, so ACTIVE lands with its handler registered and the
  // handler is retired only afterwards.
  const late = createWorld();
  const cas = late.durable.holdNextCas();
  const activating = late.create();
  await cas.reached;
  let retired = false;
  const retirement = late.retire(late.services.get(REPLICA_ID)).then(() => {
    retired = true;
  });
  await turns(20);
  t.equal(retired, false, 'the retirement waits for the in-flight ACTIVE CAS');
  t.equal(late.router.getRegisteredHandler(ADDRESS),
    late.services.get(REPLICA_ID).transportHandler,
    'the handler stays registered through the activation effect');
  cas.release();
  await activating;
  await retirement;
  t.same(late.outcomes.map((outcome) => outcome.outcomeType),
    [CREATE_ACTIVE]);
  t.same(late.durable.casCalls.map((call) => call.world), [true],
    'the ACTIVE CAS was issued with the handler registered');
  t.equal(late.router.getRegisteredHandler(ADDRESS), null,
    'retired after the activation effect');
});

test('MG executor N2 (4): another generation\'s handler at the same address ' +
  'is not activation authority', async (t) => {
  const world = createWorld({register: false});
  world.router.register(ADDRESS, () => ({acknowledged: true}));
  await world.create();
  assertRefused(t, world);
});

test('MG executor N2 (5): a delayed G1 activation after G2 registered is ' +
  'refused and G2 is untouched', async (t) => {
  // G1's STOPPED birth is in flight when G1 is retired and G2 registers its
  // own handler at the same address.
  const world = createWorld();
  const insert = world.durable.holdNextInsert();
  const creating = world.create();
  await insert.reached;
  const g1 = world.services.get(REPLICA_ID);
  await world.retire(g1);
  const g2 = world.runtime();
  world.services.set(REPLICA_ID, g2);
  insert.release();
  await creating;
  assertRefused(t, world);
  t.equal(world.router.getRegisteredHandler(ADDRESS), g2.transportHandler,
    'the G2 handler is untouched');
  const g1Row = world.durable.row;

  // G2 is registered durably at a newer generation; the delayed G1
  // activation carrying G1's evidence is refused and G2 is untouched.
  const g2World = createWorld({initialRow: {...g1Row,
    created_at: g1Row.created_at + 1, state_entered_at: g1Row.created_at + 1,
    updated_at: g1Row.created_at + 1}});
  const staleG1 = g2World.runtime();
  await g2World.retire(staleG1);
  const liveG2 = g2World.runtime();
  const g2Row = g2World.durable.row;
  await t.rejects(g2World.executor.activateCreatedReplica({groupId: GROUP_ID,
    replicaId: REPLICA_ID, service: staleG1, registrationEvidence: g1Row}),
  {code: HANDLER_NOT_REGISTERED});
  t.equal(g2World.durable.casCalls.length, 0, 'no CAS');
  t.same(g2World.durable.row, g2Row, 'the G2 row is untouched');
  await g2World.retire(staleG1);
  t.equal(g2World.router.getRegisteredHandler(ADDRESS),
    liveG2.transportHandler,
    'a delayed G1 retirement cannot remove the G2 handler');
});

test('MG executor N2 (6): no lifecycle owner -> refused before any ACTIVE',
  async (t) => {
    const world = createWorld();
    world.services.set = (replicaId, service) => {
      service.resolveHandlerRetirementLane = () => null;
      Map.prototype.set.call(world.services, replicaId, service);
    };
    await world.create();
    t.same(world.outcomes.map((outcome) => outcome.outcomeType),
      [CREATE_FAILED]);
    t.equal(world.durable.casCalls.length, 0, 'no ACTIVE CAS');
    t.equal(world.durable.row.status, 'stopped', 'the row stays STOPPED');
  });
