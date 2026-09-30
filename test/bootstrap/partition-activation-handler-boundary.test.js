/**
 * N2 (owner decision 2026-09-29f §2): handler existence for replica generation
 * G and the durable ACTIVE transition of G are serialized against handler
 * unregister. Activation's exact-handler check and its ACTIVE CAS run in the
 * replica's lifecycle lane (ReplicaStateMachine runSerializedReplicaMutation)
 * and the check opens the activation effect section in the same synchronous
 * run; handler retirement (retireReplicaHandler) waits for an open section
 * and removes the handler in one synchronous step. Scheduling is
 * deterministic (gated durable calls, bounded microtask turns), never timed.
 */
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {REPLICA_REGISTERED_ACTIVATION_ERROR_CODE} from
  '../../src/node/replica-state-machine-registered-activation.js';
import {activatePartitionServiceRows} from
  '../../src/bootstrap/shared/partition-service-activation.js';
import {runSerializedReplicaMutation} from
  '../../src/node/replica-state-machine-serialization.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const NODE_ID = 'node-a';
const REPLICA_ID = 'p1-r1';
const ADDRESS = `${NODE_ID}/partition/${REPLICA_ID}`;

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function registeredRow(generation = 1, overrides = {}) {
  return {
    service_id: REPLICA_ID,
    service_type: 'partition',
    partition_id: 'p1',
    node_id: NODE_ID,
    replica_id: REPLICA_ID,
    group_id: null,
    status: 'stopped',
    address: ADDRESS,
    created_at: 10 * generation,
    state_entered_at: 100 * generation,
    updated_at: 100 * generation,
    ...overrides,
  };
}

// The durable SERVICES row behind an exact-predicate CAS. `gate` holds the
// next authoritative read until released; `atCas` observes the world at the
// moment the ACTIVE CAS is issued.
function createDurable(initialRow, options = {}) {
  let row = {...initialRow};
  const casCalls = [];
  let gate = null;
  let casGate = null;
  return {
    casCalls,
    get row() {
      return {...row};
    },
    holdNextRead() {
      let release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      let reached;
      const readReached = new Promise((resolve) => {
        reached = resolve;
      });
      gate = {held, reached};
      return {release, readReached};
    },
    async readAuthoritativeRows() {
      const current = gate;
      gate = null;
      if (current) {
        current.reached();
        await current.held;
      }
      return {success: true, rows: [{...row}]};
    },
    holdNextCas() {
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
    async updateSystemTableRow(tableName, whereClause, data) {
      if (tableName !== 'services') {
        return {success: true, partitionResult: {affectedRows: 1}};
      }
      casCalls.push({whereClause, data, world: options.atCas?.()});
      const currentCas = casGate;
      casGate = null;
      if (currentCas) {
        currentCas.reached();
        await currentCas.held;
      }
      const applied = Object.entries(whereClause)
        .every(([column, value]) => (row[column] ?? null) === value);
      if (applied) row = {...row, ...data};
      return {success: true,
        partitionResult: {affectedRows: applied ? 1 : 0}};
    },
  };
}

function createWorld(initialRow = registeredRow()) {
  initializeEnvironment();
  const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION, nodeId: NODE_ID});
  const stateMachine = new ReplicaStateMachine({nodeId: NODE_ID,
    controlPlaneSystemTableGateway: {}, now: () => 150});
  const service = {partitionId: 'p1', replicaId: REPLICA_ID,
    unifiedAddress: ADDRESS, initialized: true,
    transportHandler: () => ({acknowledged: true})};
  const durable = createDurable(initialRow, {
    atCas: () => router.getRegisteredHandler(ADDRESS) ===
      service.transportHandler,
  });
  const activate = () => activatePartitionServiceRows({
    nodeId: NODE_ID,
    systemTableWriter: durable,
    replicaStateMachine: stateMachine,
    messageRouter: router,
    partitionServices: new Map([[REPLICA_ID, service]]),
  });
  // The production retirement path: exact-identity removal in the lane.
  const retire = (handler = service.transportHandler) =>
    stateMachine.retireReplicaHandler(REPLICA_ID,
      () => router.unregisterExact(ADDRESS, handler));
  return {router, stateMachine, service, durable, activate, retire};
}

test('N2 (1): the exact generation handler is registered -> ACTIVE',
  async (t) => {
    const world = createWorld();
    world.router.register(ADDRESS, world.service.transportHandler);
    t.equal(await world.activate(), 1);
    t.equal(world.durable.row.status, 'active');
    t.same(world.durable.casCalls.map((call) => call.world), [true],
      'the handler was registered when the CAS was issued');
  });

test('N2 (2): the handler is missing before activation -> refused, no CAS',
  async (t) => {
    const world = createWorld();
    await t.rejects(world.activate(), /replica handler registration/u);
    t.equal(world.durable.casCalls.length, 0);
    t.equal(world.durable.row.status, 'stopped');
  });

test('N2 (3): the handler is retired after the preflight but immediately ' +
  'before the final effect -> refused', async (t) => {
  const world = createWorld();
  world.router.register(ADDRESS, world.service.transportHandler);
  // A lane occupant (another lifecycle mutation of this replica) holds the
  // lane; when released it retires the handler inside the lane, right
  // before the queued activation's lane action runs.
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const occupant = runSerializedReplicaMutation(world.stateMachine,
    REPLICA_ID, () => held.then(() =>
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
  release();
  t.equal(await occupant, true);
  await t.rejects(activation,
    {code: REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.HANDLER_NOT_REGISTERED},
    'the in-lane check refuses: the handler left before the ACTIVE CAS');
  t.equal(world.durable.casCalls.length, 0, 'no ACTIVE CAS was issued');
  t.equal(world.durable.row.status, 'stopped');
});

test('N2 (4): unregister racing activation under the shared owner: exactly ' +
  'one ordering wins and ACTIVE never lands without its handler', async (t) => {
  // Activation has passed its in-lane check and is inside its ACTIVE CAS
  // when the retirement arrives: the retirement waits for the CAS.
  const first = createWorld();
  first.router.register(ADDRESS, first.service.transportHandler);
  const cas = first.durable.holdNextCas();
  const activation = first.activate();
  await cas.casReached;
  let retired = false;
  const retirement = first.retire().then((value) => {
    retired = value;
    return value;
  });
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
  t.equal(retired, false, 'the retirement waits for the in-flight ACTIVE CAS');
  t.equal(first.router.getRegisteredHandler(ADDRESS),
    first.service.transportHandler,
    'the handler stays registered through the activation effect');
  cas.release();
  t.equal(await activation, 1);
  t.equal(await retirement, true);
  t.equal(first.router.getRegisteredHandler(ADDRESS), null,
    'retired after the activation effect');
  t.same(first.durable.casCalls.map((call) => call.world), [true],
    'the ACTIVE CAS was issued with the handler registered');

  // Retirement lands while the activation is still resolving its source
  // (before its in-lane check): the activation is refused.
  const second = createWorld();
  second.router.register(ADDRESS, second.service.transportHandler);
  const read = second.durable.holdNextRead();
  const refused = second.activate();
  await read.readReached;
  t.equal(await second.retire(), true,
    'no section is open yet: the retirement completes at once');
  read.release();
  await t.rejects(refused,
    {code: REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.HANDLER_NOT_REGISTERED});
  t.equal(second.durable.casCalls.length, 0, 'no ACTIVE CAS');
  t.equal(second.durable.row.status, 'stopped',
    'no orphan ACTIVE row without a handler');
});

test('N2 (4b): retirement does not wait for unrelated lifecycle work in the ' +
  'lane (no shutdown deadlock)', async (t) => {
  const world = createWorld();
  world.router.register(ADDRESS, world.service.transportHandler);
  const never = new Promise(() => {});
  void runSerializedReplicaMutation(world.stateMachine, REPLICA_ID,
    () => never);
  t.equal(await world.retire(), true,
    'a stuck unrelated lane action does not block handler retirement');
  t.equal(world.router.getRegisteredHandler(ADDRESS), null);
});

test('N2 (5): a different generation handler under the same replica id ' +
  'does not satisfy activation', async (t) => {
  const world = createWorld();
  world.router.register(ADDRESS, () => ({acknowledged: true}));
  await t.rejects(world.activate(), /replica handler registration/u,
    'presence at the address is not this generation\'s handler');
  t.equal(world.durable.casCalls.length, 0);
  t.equal(world.durable.row.status, 'stopped');
});

test('N2 (6): a delayed G1 activation after G2 registered cannot activate ' +
  'G1 or mutate G2', async (t) => {
  const world = createWorld(registeredRow(2));
  const g2Handler = () => ({acknowledged: true});
  world.router.register(ADDRESS, g2Handler);
  // The G1 service object is still around with its own (retired) handler.
  await t.rejects(world.activate(), /replica handler registration/u,
    'G1\'s activation is refused: the registered handler is G2\'s');
  t.same(world.durable.row, registeredRow(2), 'the G2 row is untouched');
  t.equal(await world.retire(), true,
    'a delayed G1 retirement runs in the lane');
  t.equal(world.router.getRegisteredHandler(ADDRESS), g2Handler,
    'and cannot remove the G2 handler (exact-identity removal)');
});

test('N2 census: the only partition transport-handler removal in src is the ' +
  'lane-routed exact-identity retirement, run before the store closes',
async (t) => {
  const {readFileSync, readdirSync, statSync} = await import('node:fs');
  const {join, relative} = await import('node:path');
  const {fileURLToPath} = await import('node:url');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const sites = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.js') && /unregister(Exact)?\([^)]*unifiedAddress/u
        .test(readFileSync(path, 'utf8'))) {
        sites.push(relative(root, path));
      }
    }
  };
  walk(join(root, 'src'));
  // Replica transport-handler removal goes through the shared exact-identity
  // retirement (partition and message-group alike); no by-unifiedAddress
  // removal remains.
  t.same(sites.sort(), []);
  const source = readFileSync(join(root,
    'src/partition/partition-service-lifecycle-methods.js'), 'utf8');
  const retirement = source.slice(
    source.indexOf('async function retirePartitionTransportHandler'),
    source.indexOf('function closePartitionPersistenceResources'));
  t.match(retirement, /await retireReplicaTransportHandler\(\{/u,
    'removal goes through the shared replica handler retirement');
  t.match(retirement, /handler: service\.transportHandler,/u,
    'removal is bound to this replica\'s exact handler');
  t.match(retirement, /lane: service\.resolveHandlerRetirementLane\?\.\(\) \|\|/u,
    'removal runs against the replica lifecycle owner');
  const helper = readFileSync(join(root,
    'src/node/replica-transport-handler-identity.js'), 'utf8');
  t.match(helper, /lane\.retireReplicaHandler\(replicaId, retire\)/u,
    'the shared retirement waits on the owner\'s activation effect section');
  t.match(helper, /transport\.unregisterExact\(address, handler\)/u,
    'the shared retirement is exact-identity');
  const shutdown = source.slice(source.indexOf('  async shutdown() {'));
  t.ok(shutdown.indexOf('await retirePartitionTransportHandler(this);') <
    shutdown.indexOf('closePartitionPersistenceResources(this);'),
  'shutdown retires the handler in the lane before closing the store');
});
