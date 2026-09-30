// Witness for the exact handler identity API on the REAL transports (owner
// decision N2): a retiring generation removes only the handler it registered,
// and a successor's handler at the same address survives. Every other test of
// this rule runs against a fixture router; this one runs against
// WebSocketTransport and MessageRouter themselves, so the fixture and the
// implementations cannot drift apart unnoticed.
import {test} from '../../src/test-helpers/tap.js';
import {WebSocketTransport} from '../../src/transport/websocket-transport.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  REPLICA_HANDLER_RETIREMENT_OUTCOME,
  isExactReplicaHandlerRegistered,
  retireReplicaTransportHandler,
} from '../../src/node/replica-transport-handler-identity.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

ConfigurationManager.resetInstance();
LoggingService.resetInstance();
ConfigurationManager.getInstance().initialize({node: {id: 'identity-node'}});
LoggingService.getInstance().initialize({level: 'error'});

const ADDRESS = 'identity-node/partition/p-1';

function makeWebSocketTransport() {
  return new WebSocketTransport({
    localNodeId: 'identity-node',
    localAddress: 'ws://localhost:19999',
  });
}

function makeMessageRouter() {
  return new MessageRouter({
    nodeId: 'identity-node',
    bootIncarnation: TEST_BOOT_INCARNATION,
  });
}

// Both implementations of the API, exercised by the same witness: the rule is
// a property of the API, not of one class.
const IMPLEMENTATIONS = Object.freeze([
  {name: 'WebSocketTransport', create: makeWebSocketTransport},
  {name: 'MessageRouter', create: makeMessageRouter},
]);

for (const {name, create} of IMPLEMENTATIONS) {
  test(`${name}.getRegisteredHandler answers with identity, not presence`,
    async (t) => {
      const transport = create();
      const g1Handler = () => 'g1';

      t.equal(transport.getRegisteredHandler(ADDRESS), null,
        'an unregistered address answers null, not undefined (R07)');

      transport.register(ADDRESS, g1Handler);
      t.equal(transport.getRegisteredHandler(ADDRESS), g1Handler,
        'the exact registered function is returned');
      t.ok(isExactReplicaHandlerRegistered(transport, ADDRESS, g1Handler),
        'the consumer predicate is satisfied by the real transport');
      t.notOk(isExactReplicaHandlerRegistered(transport, ADDRESS, () => 'g2'),
        'a different function at the same address is not the registration');

      await transport.shutdown();
      t.end();
    });

  test(`${name}.unregisterExact never removes a successor's handler`,
    async (t) => {
      const transport = create();
      const g1Handler = () => 'g1';
      const g2Handler = () => 'g2';

      transport.register(ADDRESS, g1Handler);
      // G2 takes the address over: one address, one live registration.
      transport.register(ADDRESS, g2Handler);

      t.equal(transport.unregisterExact(ADDRESS, g1Handler), false,
        'the superseded generation is refused');
      t.equal(transport.getRegisteredHandler(ADDRESS), g2Handler,
        'the successor handler is still registered');

      t.equal(transport.unregisterExact(ADDRESS, g2Handler), true,
        'the owning generation removes its own handler');
      t.equal(transport.getRegisteredHandler(ADDRESS), null,
        'the address is now empty');

      t.equal(transport.unregisterExact(ADDRESS, g2Handler), false,
        'a second retirement of the same handler is refused, not repeated');
      t.equal(transport.unregisterExact('identity-node/partition/absent',
        g2Handler), false, 'an address that never had a handler is refused');

      await transport.shutdown();
      t.end();
    });

  test(`${name} satisfies the retirement API: never REFUSED_NO_IDENTITY`,
    async (t) => {
      const transport = create();
      const g1Handler = () => 'g1';
      transport.register(ADDRESS, g1Handler);

      const retired = await retireReplicaTransportHandler({
        transport, address: ADDRESS, handler: g1Handler,
      });
      t.equal(retired, REPLICA_HANDLER_RETIREMENT_OUTCOME.RETIRED,
        'the exact handler is retired through the real transport');

      const again = await retireReplicaTransportHandler({
        transport, address: ADDRESS, handler: g1Handler,
      });
      t.equal(again, REPLICA_HANDLER_RETIREMENT_OUTCOME.ALREADY_ABSENT,
        'retiring an absent handler is a named no-op');

      const g2Handler = () => 'g2';
      transport.register(ADDRESS, g2Handler);
      const superseded = await retireReplicaTransportHandler({
        transport, address: ADDRESS, handler: g1Handler,
      });
      t.equal(superseded,
        REPLICA_HANDLER_RETIREMENT_OUTCOME.ALREADY_ABSENT,
        'a superseded generation retiring late is absent, not destructive');
      t.equal(transport.getRegisteredHandler(ADDRESS), g2Handler,
        'the successor survives the predecessor\'s late retirement');

      await transport.shutdown();
      t.end();
    });
}

test('a transport without the identity API is refused, so the witness ' +
  'above is not vacuous', async (t) => {
  const addressOnly = {
    register() {},
    unregister() {},
  };
  const outcome = await retireReplicaTransportHandler({
    transport: addressOnly, address: ADDRESS, handler: () => 'g1',
  });
  t.equal(outcome, REPLICA_HANDLER_RETIREMENT_OUTCOME.REFUSED_NO_IDENTITY,
    'address-only removal is refused');
  t.end();
});
