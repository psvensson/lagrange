/**
 * Removal-8 (owner ruling 2026-09-30): the shared replica handler removal
 * owner never removes by address. Exact handler known and registered ->
 * exact removal; handler absent (e.g. shut down before registration) ->
 * typed already-absent no-op; transport without the identity API -> typed
 * refusal with no destructive effect. The presence fallback of the activation
 * check fails closed the same way.
 */
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {
  REPLICA_HANDLER_RETIREMENT_LOG_MSG,
  REPLICA_HANDLER_RETIREMENT_OUTCOME,
  isExactReplicaHandlerRegistered,
  retireReplicaTransportHandler,
} from '../../src/node/replica-transport-handler-identity.js';
import {retireMessageGroupTransportHandler} from
  '../../src/bootstrap/shared/message-group-transport-handler.js';
import {WasmServiceReplica} from
  '../../src/wasm-service/wasm-service-replica.js';
import {WASM_SERVICE_REPLICA_STATE} from
  '../../src/wasm-service/wasm-service-constants.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const NODE_ID = 'node-a';
const REPLICA_ID = 'p1-r1';
const ADDRESS = `${NODE_ID}/partition/${REPLICA_ID}`;

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'silent'});
}

// A transport that can only answer presence and remove by address.
function createPresenceOnlyTransport() {
  const handlers = new Map();
  const unregistered = [];
  return {
    handlers,
    unregistered,
    register(address, handler) {
      handlers.set(address, handler);
    },
    unregister(address) {
      unregistered.push(address);
      handlers.delete(address);
    },
    isRegistered(address) {
      return handlers.has(address);
    },
  };
}

// Only installed after the refusal assertions: the same registration Map
// then supplies genuine identity so the original owner can settle cleanup.
function enableExactRetirement(transport) {
  transport.getRegisteredHandler = (address) =>
    transport.handlers.get(address) ?? null;
  transport.unregisterExact = (address, handler) => {
    if (transport.handlers.get(address) !== handler) return false;
    transport.handlers.delete(address);
    return true;
  };
}

async function withFixtureCleanup(run, cleanup) {
  let primary;
  let primaryFailed = false;
  try {
    await run();
  } catch (error) {
    primary = error;
    primaryFailed = true;
  }
  try {
    await cleanup();
  } catch (error) {
    if (primaryFailed) {
      throw new AggregateError([primary, error],
        'Exact-handler witness and fixture cleanup both failed');
    }
    throw error;
  }
  if (primaryFailed) throw primary;
}

test('Removal-8: an old generation shut down before registration never ' +
  'removes the new generation\'s handler', async (t) => {
  initializeEnvironment();
  const router = new MessageRouter({nodeId: NODE_ID,
    bootIncarnation: TEST_BOOT_INCARNATION});
  const stateMachine = new ReplicaStateMachine({nodeId: NODE_ID,
    controlPlaneSystemTableGateway: {}});
  // G1 never reached raft-init registration (transportHandler unset).
  const g1 = new PartitionService({partitionId: 'p1', tableId: 't1',
    replicaId: REPLICA_ID, nodeId: NODE_ID, transport: router,
    replicaStateMachine: stateMachine});
  t.equal(g1.transportHandler ?? null, null, 'G1 registered no handler');
  // G2 later owns the address.
  const g2Handler = () => ({acknowledged: true});
  router.register(ADDRESS, g2Handler);
  // The delayed G1 shutdown runs its retirement.
  await g1.shutdown();
  t.equal(router.getRegisteredHandler(ADDRESS), g2Handler,
    'the G2 handler is untouched by the delayed G1 retirement');
  t.equal(await retireReplicaTransportHandler({transport: router,
    address: ADDRESS, handler: undefined, replicaId: REPLICA_ID,
    lane: stateMachine}),
  REPLICA_HANDLER_RETIREMENT_OUTCOME.ALREADY_ABSENT,
  'an absent handler is a typed already-absent no-op');
  t.equal(router.getRegisteredHandler(ADDRESS), g2Handler);
});

test('Removal-8: exact removal removes only the exact handler', async (t) => {
  const router = new MessageRouter({nodeId: NODE_ID,
    bootIncarnation: TEST_BOOT_INCARNATION});
  const g1Handler = () => ({acknowledged: true});
  const g2Handler = () => ({acknowledged: true});
  router.register(ADDRESS, g1Handler);
  t.equal(await retireReplicaTransportHandler({transport: router,
    address: ADDRESS, handler: g1Handler, replicaId: REPLICA_ID}),
  REPLICA_HANDLER_RETIREMENT_OUTCOME.RETIRED, 'the exact handler is retired');
  t.equal(router.getRegisteredHandler(ADDRESS), null);
  router.register(ADDRESS, g2Handler);
  t.equal(await retireReplicaTransportHandler({transport: router,
    address: ADDRESS, handler: g1Handler, replicaId: REPLICA_ID}),
  REPLICA_HANDLER_RETIREMENT_OUTCOME.ALREADY_ABSENT,
  'a delayed retirement of G1 finds its handler gone');
  t.equal(router.getRegisteredHandler(ADDRESS), g2Handler,
    'and leaves the G2 handler registered');
});

test('Removal-8: a transport without the identity API is refused and ' +
  'nothing is removed', async (t) => {
  const transport = createPresenceOnlyTransport();
  const handler = () => ({acknowledged: true});
  transport.register(ADDRESS, handler);
  t.equal(isExactReplicaHandlerRegistered(transport, ADDRESS, handler), false,
    'the activation check cannot pass on presence');
  t.equal(await retireReplicaTransportHandler({transport, address: ADDRESS,
    handler, replicaId: REPLICA_ID}),
  REPLICA_HANDLER_RETIREMENT_OUTCOME.REFUSED_NO_IDENTITY,
  'typed refusal');
  t.same(transport.unregistered, [], 'no removal by address');
  t.equal(transport.handlers.get(ADDRESS), handler, 'the handler is untouched');
});

// A logger that records what its owner reports.
function createRecordingLogger() {
  const errors = [];
  const ignore = () => {};
  return {
    errors,
    error: (message, fields) => errors.push({message, fields}),
    warn: ignore,
    info: ignore,
    debug: ignore,
    forSubsystem() {
      return this;
    },
  };
}

function assertLeftRegisteredReported(t, logger, address, replicaId) {
  t.same(logger.errors, [{
    message: REPLICA_HANDLER_RETIREMENT_LOG_MSG.LEFT_REGISTERED,
    fields: {address, replicaId,
      outcome: REPLICA_HANDLER_RETIREMENT_OUTCOME.REFUSED_NO_IDENTITY},
  }], 'the refused retirement is reported with its address and replica');
}

test('Removal-8: every retiring owner surfaces a refused retirement (the ' +
  'handler is left registered) instead of discarding it', async (t) => {
  initializeEnvironment();
  const handler = () => ({acknowledged: true});

  t.test('partition replica shutdown', async (t) => {
    const transport = createPresenceOnlyTransport();
    const service = new PartitionService({partitionId: 'p1', tableId: 't1',
      replicaId: REPLICA_ID, nodeId: NODE_ID, transport});
    const logger = createRecordingLogger();
    service.logger = logger;
    service.transportHandler = handler;
    transport.register(ADDRESS, handler);
    await withFixtureCleanup(async () => {
      await t.rejects(service.shutdown(),
        {code: REPLICA_HANDLER_RETIREMENT_OUTCOME.REFUSED_NO_IDENTITY},
        'shutdown refuses to settle while its exact handler remains registered');
      t.equal(transport.handlers.get(ADDRESS), handler,
        'nothing is removed by address');
      assertLeftRegisteredReported(t, logger, ADDRESS, REPLICA_ID);
    }, async () => {
      enableExactRetirement(transport);
      await service.shutdown();
      t.equal(transport.getRegisteredHandler(ADDRESS), null,
        'the same partition owner retires its retained handler on retry');
      t.same(transport.unregistered, [], 'retry never removes by address');
    });
  });

  t.test('message-group replica retirement', async (t) => {
    const transport = createPresenceOnlyTransport();
    const address = `${NODE_ID}/message-group/mg-r1`;
    const logger = createRecordingLogger();
    transport.register(address, handler);
    const retirement = {messageGroup: {transportHandler: handler, logger},
      messageRouter: transport, address, replicaId: 'mg-r1'};
    await withFixtureCleanup(async () => {
      await t.rejects(retireMessageGroupTransportHandler(retirement),
        {code: REPLICA_HANDLER_RETIREMENT_OUTCOME.REFUSED_NO_IDENTITY},
        'message-group retirement refuses to release an unprovable handler');
      t.equal(transport.handlers.get(address), handler,
        'message-group refusal retains the exact handler');
      assertLeftRegisteredReported(t, logger, address, 'mg-r1');
    }, async () => {
      enableExactRetirement(transport);
      t.equal(await retireMessageGroupTransportHandler(retirement),
        REPLICA_HANDLER_RETIREMENT_OUTCOME.RETIRED,
        'the same message-group retirement settles after identity is available');
      t.equal(transport.getRegisteredHandler(address), null,
        'the retained message-group handler is removed');
      t.same(transport.unregistered, [], 'retry never removes by address');
    });
  });

  t.test('WASM service replica shutdown', async (t) => {
    const transport = createPresenceOnlyTransport();
    const directory = mkdtempSync(join(tmpdir(), 'wasm-refused-retirement-'));
    const replica = new WasmServiceReplica({replicaId: 'wsr-1',
      nodeId: NODE_ID, replicaIds: ['wsr-1'], transport,
      serviceDefinitionId: 'svc', dbPath: join(directory, 'wsr-1.db')});
    const logger = createRecordingLogger();
    replica.logger = logger;
    let originalDb = null;
    await withFixtureCleanup(async () => {
      await replica.initialize();
      originalDb = replica.db;
      const registered = replica.transportHandler;
      t.equal(originalDb.open, true, 'the actual original database is open');
      await t.rejects(replica.shutdown(),
        {code: REPLICA_HANDLER_RETIREMENT_OUTCOME.REFUSED_NO_IDENTITY},
        'WASM shutdown retains custody on refused exact-handler retirement');
      t.equal(transport.handlers.get(replica.unifiedAddress), registered,
        'nothing is removed by address');
      t.equal(replica.db, originalDb, 'refusal retains the exact database object');
      t.equal(originalDb.open, true, 'refusal retains the original open database');
      t.equal(replica.lifecycleState, WASM_SERVICE_REPLICA_STATE.CLEANUP_REQUIRED,
        'refused retirement remains an owned cleanup obligation');
      assertLeftRegisteredReported(t, logger, replica.unifiedAddress,
        'wsr-1');
    }, async () => {
      enableExactRetirement(transport);
      await replica.shutdown();
      t.equal(transport.getRegisteredHandler(replica.unifiedAddress), null,
        'the same WASM owner retires its retained handler on retry');
      t.same(transport.unregistered, [], 'retry never removes by address');
      t.equal(replica.lifecycleState, WASM_SERVICE_REPLICA_STATE.STOPPED,
        'the same replica completes shutdown');
      t.equal(replica.db, null, 'successful owner cleanup discharges its database');
      if (originalDb) {
        t.equal(originalDb.open, false, 'the original database is physically closed');
      }
      if (replica.db !== null || originalDb?.open) {
        throw new Error(`WASM cleanup remains pending; retained directory ${directory}`);
      }
      rmSync(directory, {recursive: true, force: true});
    });
  });
});
