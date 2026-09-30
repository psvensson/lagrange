/**
 * Removal-8 (owner ruling 2026-09-30): the shared replica handler removal
 * owner never removes by address. Exact handler known and registered ->
 * exact removal; handler absent (e.g. shut down before registration) ->
 * typed already-absent no-op; transport without the identity API -> typed
 * refusal with no destructive effect. The presence fallback of the activation
 * check fails closed the same way.
 */
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {
  REPLICA_HANDLER_RETIREMENT_OUTCOME,
  isExactReplicaHandlerRegistered,
  retireReplicaTransportHandler,
} from '../../src/node/replica-transport-handler-identity.js';

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

test('Removal-8: an old generation shut down before registration never ' +
  'removes the new generation\'s handler', async (t) => {
  initializeEnvironment();
  const router = new MessageRouter({nodeId: NODE_ID});
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
  const router = new MessageRouter({nodeId: NODE_ID});
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
