/**
 * N2 class repair for message-group activation (owner decisions 2026-09-29f
 * §2 and 2026-09-29g §2): handler existence for message-group replica
 * generation G and the durable ACTIVE transition of G are serialized against
 * handler unregister. MessageGroupServiceRowOwner.activateReplica runs in the
 * replica's lifecycle lane (ReplicaStateMachine.runHandlerBoundActivation):
 * the exact-handler check opens the activation effect section in the same
 * synchronous run and the section closes when the ACTIVE CAS and its lost-ack
 * readback settle. Every message-group handler removal goes through
 * retireMessageGroupTransportHandler (exact identity; waits only on an open
 * section). Scheduling is deterministic (gated durable calls, bounded
 * microtask turns), never timed.
 */
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR} from
  '../../src/message-group/message-group-service-row-owner.js';
import {activateMessageGroupServiceRows} from
  '../../src/bootstrap/shared/message-group-service-activation.js';
import {
  registerMessageGroupTransportHandler,
  retireMessageGroupTransportHandler,
} from '../../src/bootstrap/shared/message-group-transport-handler.js';
import {runSerializedReplicaMutation} from
  '../../src/node/replica-state-machine-serialization.js';

const NODE_ID = 'node-a';
const GROUP_ID = 'mg-1';
const REPLICA_ID = 'mg-1-r1';
const ADDRESS = `${NODE_ID}/message-group/${REPLICA_ID}`;
const HANDLER_NOT_REGISTERED =
  MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.HANDLER_NOT_REGISTERED;

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function registeredRow(generation = 1, overrides = {}) {
  return {
    service_id: REPLICA_ID,
    service_type: 'message_group',
    partition_id: null,
    node_id: NODE_ID,
    replica_id: REPLICA_ID,
    group_id: GROUP_ID,
    raft_role: 'follower',
    status: 'stopped',
    address: ADDRESS,
    created_at: 10 * generation,
    state_entered_at: 100 * generation,
    updated_at: 100 * generation,
    ...overrides,
  };
}

function gate() {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let reach;
  const reached = new Promise((resolve) => {
    reach = resolve;
  });
  return {release, held, reached, reach};
}

// The durable SERVICES row behind the exact-predicate activation CAS.
// `holdNextRead` holds the next authoritative read; `holdNextCas` holds the
// ACTIVE CAS once issued; `atCas` observes the world when the CAS is issued.
function createDurable(initialRow, options = {}) {
  let row = {...initialRow};
  const casCalls = [];
  let readGate = null;
  let casGate = null;
  return {
    casCalls,
    get row() {
      return {...row};
    },
    holdNextRead() {
      readGate = gate();
      return readGate;
    },
    holdNextCas() {
      casGate = gate();
      return casGate;
    },
    async readAuthoritativeRows() {
      const current = readGate;
      readGate = null;
      if (current) {
        current.reach();
        await current.held;
      }
      return {success: true, rows: [{...row}]};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      casCalls.push({whereClause, data, world: options.atCas?.()});
      const current = casGate;
      casGate = null;
      if (current) {
        current.reach();
        await current.held;
      }
      const applied = Object.entries(whereClause)
        .every(([column, value]) => (row[column] ?? null) === value);
      if (applied) row = {...row, ...data};
      return {success: true,
        partitionResult: {affectedRows: applied ? 1 : 0}};
    },
  };
}

function createService(router, stateMachine, register = true) {
  const service = {groupId: GROUP_ID, replicaId: REPLICA_ID,
    unifiedAddress: ADDRESS, isLeaderReplica: () => false,
    receiveMessage: () => ({acknowledged: true})};
  if (register) {
    // The production registration: records the exact handler identity and
    // the replica's lifecycle owner on the service.
    registerMessageGroupTransportHandler(service, {messageRouter: router,
      address: ADDRESS, resolveLane: () => stateMachine});
  }
  return service;
}

function createWorld(initialRow = registeredRow(), options = {}) {
  initializeEnvironment();
  const router = new MessageRouter({nodeId: NODE_ID});
  const stateMachine = new ReplicaStateMachine({nodeId: NODE_ID,
    controlPlaneSystemTableGateway: {}, now: () => 150});
  const service = createService(router, stateMachine,
    options.register !== false);
  if (options.register === false) {
    service.transportHandler = () => ({acknowledged: true});
  }
  const durable = createDurable(initialRow, {
    atCas: () => router.getRegisteredHandler(ADDRESS) ===
      service.transportHandler,
  });
  const activate = () => activateMessageGroupServiceRows({
    nodeId: NODE_ID,
    systemTableWriter: durable,
    replicaStateMachine: stateMachine,
    messageRouter: router,
    messageGroupServiceHandler: {},
    endpointsPublished: true,
    messageGroupServices: new Map([[REPLICA_ID, service]]),
    now: () => 150,
  });
  // The production retirement path: exact identity, against the owner's
  // activation effect section.
  const retire = (messageGroup = service) => retireMessageGroupTransportHandler(
    {messageGroup, messageRouter: router, address: ADDRESS,
      replicaId: REPLICA_ID});
  return {router, stateMachine, service, durable, activate, retire};
}

async function turns(count) {
  for (let turn = 0; turn < count; turn += 1) await Promise.resolve();
}

test('MG N2 (1): the exact generation handler is registered -> ACTIVE',
  async (t) => {
    const world = createWorld();
    t.equal(await world.activate(), 1);
    t.equal(world.durable.row.status, 'active');
    t.same(world.durable.casCalls.map((call) => call.world), [true],
      'the handler was registered when the CAS was issued');
  });

test('MG N2 (2): the handler is missing before activation -> refused, no CAS',
  async (t) => {
    const world = createWorld(registeredRow(), {register: false});
    await t.rejects(world.activate(), /replica handler registration/u);
    t.equal(world.durable.casCalls.length, 0);
    t.equal(world.durable.row.status, 'stopped');
  });

test('MG N2 (3): the handler is retired after the preflight but immediately ' +
  'before the final effect -> refused', async (t) => {
  const world = createWorld();
  // A lane occupant (another lifecycle mutation of this replica) holds the
  // lane; when released it removes the handler inside the lane, right before
  // the queued activation's lane action runs.
  const occupantGate = gate();
  const occupant = runSerializedReplicaMutation(world.stateMachine,
    REPLICA_ID, () => occupantGate.held.then(() =>
      world.router.unregisterExact(ADDRESS, world.service.transportHandler)));
  const tails = world.stateMachine.serviceRowPersistInFlightByServiceId;
  const occupantTail = tails.get(REPLICA_ID);
  const activation = world.activate();
  // Deterministic: advance microtasks (no timers) until the activation has
  // passed its preflight and queued its lane action behind the occupant.
  for (let turn = 0; turn < 100 && tails.get(REPLICA_ID) === occupantTail;
    turn += 1) {
    await Promise.resolve();
  }
  t.not(tails.get(REPLICA_ID), occupantTail,
    'the activation passed the preflight and is queued in the lane');
  occupantGate.release();
  t.equal(await occupant, true);
  await t.rejects(activation, {code: HANDLER_NOT_REGISTERED},
    'the in-lane check refuses: the handler left before the ACTIVE CAS');
  t.equal(world.durable.casCalls.length, 0, 'no ACTIVE CAS was issued');
  t.equal(world.durable.row.status, 'stopped');
});

test('MG N2 (4): unregister racing activation under the shared owner: ' +
  'exactly one ordering wins and ACTIVE never lands without its handler',
async (t) => {
  // Activation has passed its in-lane check and is inside its ACTIVE CAS
  // when the retirement arrives: the retirement waits for the CAS.
  const first = createWorld();
  const cas = first.durable.holdNextCas();
  const activation = first.activate();
  await cas.reached;
  let retired = false;
  const retirement = first.retire().then(() => {
    retired = true;
  });
  await turns(20);
  t.equal(retired, false, 'the retirement waits for the in-flight ACTIVE CAS');
  t.equal(first.router.getRegisteredHandler(ADDRESS),
    first.service.transportHandler,
    'the handler stays registered through the activation effect');
  cas.release();
  t.equal(await activation, 1);
  await retirement;
  t.equal(first.router.getRegisteredHandler(ADDRESS), null,
    'retired after the activation effect');
  t.same(first.durable.casCalls.map((call) => call.world), [true],
    'the ACTIVE CAS was issued with the handler registered');

  // Retirement lands while the activation is still resolving its source
  // (before its in-lane check): the activation is refused.
  const second = createWorld();
  const read = second.durable.holdNextRead();
  const refused = second.activate();
  await read.reached;
  await second.retire();
  t.equal(second.router.getRegisteredHandler(ADDRESS), null,
    'no section is open yet: the retirement completes at once');
  read.release();
  await t.rejects(refused, {code: HANDLER_NOT_REGISTERED});
  t.equal(second.durable.casCalls.length, 0, 'no ACTIVE CAS');
  t.equal(second.durable.row.status, 'stopped',
    'no orphan ACTIVE row without a handler');
});

test('MG N2 (4b): retirement does not wait for unrelated lifecycle work in ' +
  'the lane (no shutdown deadlock)', async (t) => {
  const world = createWorld();
  const never = new Promise(() => {});
  void runSerializedReplicaMutation(world.stateMachine, REPLICA_ID,
    () => never);
  await world.retire();
  t.equal(world.router.getRegisteredHandler(ADDRESS), null,
    'a stuck unrelated lane action does not block handler retirement');
});

test('MG N2 (5): a different generation handler under the same replica id ' +
  'does not satisfy activation', async (t) => {
  const world = createWorld(registeredRow(), {register: false});
  world.router.register(ADDRESS, () => ({acknowledged: true}));
  await t.rejects(world.activate(), /replica handler registration/u,
    'presence at the address is not this generation\'s handler');
  t.equal(world.durable.casCalls.length, 0);
  t.equal(world.durable.row.status, 'stopped');
});

test('MG N2 (6): a delayed G1 activation after G2 registered cannot ' +
  'activate G1 or mutate G2', async (t) => {
  const world = createWorld(registeredRow(2));
  // The G1 service object is still around; G2 has registered its own
  // handler under the same address since.
  const g1 = world.service;
  const g2 = createService(world.router, world.stateMachine);
  t.equal(world.router.getRegisteredHandler(ADDRESS), g2.transportHandler);
  await t.rejects(world.activate(), /replica handler registration/u,
    'G1\'s activation is refused: the registered handler is G2\'s');
  t.same(world.durable.row, registeredRow(2), 'the G2 row is untouched');
  await world.retire(g1);
  t.equal(world.router.getRegisteredHandler(ADDRESS), g2.transportHandler,
    'a delayed G1 retirement cannot remove the G2 handler (exact identity)');
});

test('MG N2 (7): lifecycle-owner admission closed -> refused, no CAS',
  async (t) => {
    const world = createWorld();
    await world.stateMachine.clear();
    await t.rejects(world.activate(),
      {code: MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.LIFECYCLE_OWNER_CLOSED});
    t.equal(world.durable.casCalls.length, 0);
  });

test('MG N2 census: every message-group transport-handler registration and ' +
  'removal in src goes through the exact-identity owner helpers',
async (t) => {
  const {readFileSync, readdirSync, statSync} = await import('node:fs');
  const {join, relative} = await import('node:path');
  const {fileURLToPath} = await import('node:url');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const read = (path) => readFileSync(join(root, path), 'utf8');
  const removalSites = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.js') &&
        /\bunregister(Exact)?(\?\.)?\(/u.test(readFileSync(path, 'utf8'))) {
        removalSites.push(relative(root, path));
      }
    }
  };
  for (const directory of ['src/bootstrap', 'src/message-group', 'src/node',
    'src/partition']) {
    walk(join(root, directory));
  }
  // Remaining raw removals are not replica handlers: node-level service
  // handlers (fixed addresses) and the shared exact-identity retirement
  // itself. Seed cleanup is not a handler-removal authority (Removal-7): the
  // exact retirement in partition.shutdown() is the one path.
  t.same(removalSites.sort(), [
    'src/node/message-group-service-handler.js',
    'src/node/replica-handler-runtime-methods.js',
    'src/node/replica-transport-handler-identity.js',
    'src/node/runtime-service-handler.js',
  ]);
  t.notMatch(read('src/bootstrap/phases/seed-cleanup-handler.js'),
    /ENTITY_TYPE\.MESSAGE_GROUP/u,
    'seed cleanup formats no message-group address for a raw removal');
  t.match(read('src/node/message-group-service-handler.js'),
    /MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS\.HANDLER_ID\}`;\s+if \(isFunction\(messageRouter\.unregister\)\) \{\s+messageRouter\.unregister\(handlerAddress\);/u,
    'the node-level service handler removes only its own fixed address');
  const retirements = {
    'src/bootstrap/phases/create-message-group-replica-lifecycle.js':
      /await retireMessageGroupTransportHandler\(\{/gu,
    'src/bootstrap/phases/seed-message-groups-phase.js':
      /await retireMessageGroupTransportHandler\(\{/gu,
    'src/bootstrap/owners/move-replica-handoff-owner.js':
      /await retireMessageGroupTransportHandler\(\{/gu,
    'src/bootstrap/join-cleanup-handler.js':
      /await retireMessageGroupTransportHandlers\(\{/gu,
    'src/bootstrap/phases/seed-cleanup-handler.js':
      /await retireMessageGroupTransportHandlers\(\{/gu,
  };
  const expectedCounts = {
    'src/bootstrap/phases/seed-cleanup-handler.js': 2,
  };
  for (const [path, pattern] of Object.entries(retirements)) {
    t.equal((read(path).match(pattern) || []).length,
      expectedCounts[path] || 1, `${path} retires through the owner helper`);
  }
  for (const path of [
    'src/bootstrap/phases/create-message-group-replica-lifecycle.js',
    'src/bootstrap/phases/seed-message-groups-phase.js',
  ]) {
    const source = read(path);
    t.notMatch(source, /\.register\(/u,
      `${path} registers no raw message-group handler`);
    t.match(source, /registerMessageGroupTransportHandler\(messageGroup, \{/u,
      `${path} registers through the exact-identity helper`);
  }
  const helper = read('src/node/replica-transport-handler-identity.js');
  t.match(helper, /lane\.retireReplicaHandler\(replicaId, retire\)/u,
    'retirement waits on the owner\'s activation effect section');
  t.match(helper, /transport\.unregisterExact\(address, handler\)/u,
    'retirement is exact-identity');
});
