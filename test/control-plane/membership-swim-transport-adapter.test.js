// Validates the SWIM messageRouter transport adapter (increment 3c, narrowest first
// step) against REAL in-process MessageRouters — the one piece whose correctness
// depends on the real `deliver` envelope shape (which the injected-interface unit
// tests cannot cover). Pins: direct ping -> bool; indirect relay ack -> bool; a
// helper with no relay handler / an unreachable target -> the right null/false.
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {
  buildSwimMessageRouterTransport,
  buildSwimRelayHandler,
  buildSwimRelayAddress,
} from '../../src/control-plane/membership-swim-prober.js';

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'swim-adapter-test'},
    logging: {level: 'error'},
    transport: {wsHost: '127.0.0.1'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

async function waitFor(condition, timeoutMs = 2000, intervalMs = 10) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

function makeRouter(nodeId, port) {
  const router = new MessageRouter({
    nodeId,
    nodeAddress: `ws://127.0.0.1:${port}`,
    wsPort: port,
    inProcess: true,
  });
  router.setServiceNodeResolver((address) => {
    const match = address.match(/^([^/]+)\//);
    return match ? match[1] : null;
  });
  return router;
}

test('SWIM transport adapter maps real ping/relay round-trips to direct/indirect verdicts', async (t) => {
  initEnv();
  const [A, B, C, D] = ['swim-A', 'swim-B', 'swim-C', 'swim-D'];
  const [pa, pb, pc, pd] = [21801, 21802, 21803, 21804];
  const ra = makeRouter(A, pa);
  const rb = makeRouter(B, pb);
  const rc = makeRouter(C, pc);
  const rd = makeRouter(D, pd);
  let bShutdown = false;
  try {
    await ra.initialize({startServer: true});
    await rb.initialize({startServer: true});
    await rc.initialize({startServer: true});
    await rd.initialize({startServer: true});

    // C and B run the relay; D intentionally has NO relay handler (null case).
    rc.register(buildSwimRelayAddress(C), buildSwimRelayHandler({messageRouter: rc}));
    rb.register(buildSwimRelayAddress(B), buildSwimRelayHandler({messageRouter: rb}));

    // Mesh: A->B, A->C, A->D, and C->B so C can ping B on A's behalf.
    await ra.connectToNode(B, `ws://127.0.0.1:${pb}`);
    await ra.connectToNode(C, `ws://127.0.0.1:${pc}`);
    await ra.connectToNode(D, `ws://127.0.0.1:${pd}`);
    await rc.connectToNode(B, `ws://127.0.0.1:${pb}`);

    const connected = await waitFor(
      () =>
        ra.getConnectionState(B) === 'connected' &&
        ra.getConnectionState(C) === 'connected' &&
        ra.getConnectionState(D) === 'connected' &&
        rc.getConnectionState(B) === 'connected',
    );
    t.ok(connected, 'full probe mesh connected');

    const transport = buildSwimMessageRouterTransport({
      messageRouter: ra,
      pingTimeoutMs: 200,
    });

    t.equal(await transport.directProbe(B, 200), true, 'directProbe(B) true while B up');
    t.equal(
      await transport.indirectProbe(C, B, 200),
      true,
      'indirectProbe via C true while B up',
    );
    t.equal(
      await transport.indirectProbe(D, B, 200),
      null,
      'indirectProbe via a helper with no relay handler => null (no verdict)',
    );

    // Partition B.
    await rb.shutdown();
    bShutdown = true;
    const bGone = await waitFor(
      () =>
        ra.getConnectionState(B) !== 'connected' &&
        rc.getConnectionState(B) !== 'connected',
    );
    t.ok(bGone, 'B disconnected after shutdown');

    t.equal(
      await transport.directProbe(B, 200),
      false,
      'directProbe(B) false after partition',
    );
    t.equal(
      await transport.indirectProbe(C, B, 200),
      false,
      'indirectProbe via C false after partition (C cannot reach B)',
    );
  } finally {
    await ra.shutdown();
    await rc.shutdown();
    await rd.shutdown();
    if (!bShutdown) {
      await rb.shutdown();
    }
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
