/**
 * Same-nodeId new-IP restart recovery (quest restart-new-ip-peer-reconnect-unwedge).
 *
 * When a peer restarts with the SAME nodeId but a NEW address, the Docker
 * rolling-restart harness cannot exercise it (it restarts the same container in
 * place -> same IP), so this in-process transport test is the binding observable.
 *
 * Defect 2: a peer that goes dark WITHOUT a clean socket close (half-open socket)
 * is never severed, so its stored address is never re-resolved and reconnect
 * never fires. startPingInterval must sever a connection whose peer stops
 * answering keepalive pings, which drives handleConnectionClose -> scheduleReconnect
 * -> re-resolution of the peer's current (possibly new) address.
 */

import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, {timeoutMs = 2000, stepMs = 10} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return true;
    }
    await wait(stepMs);
  }
  return predicate();
}

describe('MessageRouter same-nodeId new-address recovery', () => {
  let routerA;
  let routerB;
  let routerB2;

  beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    const config = ConfigurationManager.getInstance();
    config.initialize({
      node: {id: 'node-a'},
      logging: {level: 'error'},
      transport: {
        // Shrink the keepalive cadence so the liveness sweep is observable
        // within a fast unit test instead of the 30s production interval.
        // (100ms is the schema minimum for these intervals.)
        pingIntervalMs: 100,
        pingTimeoutMs: 100,
        pingMaxMissed: 2,
        reconnectIntervalMs: 100,
      },
    });
    LoggingService.getInstance().initialize({level: 'error'});
  });

  afterEach(async () => {
    for (const router of [routerA, routerB, routerB2]) {
      if (router && router.initialized) {
        await router.shutdown();
      }
    }
    routerA = null;
    routerB = null;
    routerB2 = null;
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  it('severs a stale-but-open connection whose peer stopped answering pings',
    async () => {
      const peerAddr = 'ws://127.0.0.1:19811';
      routerA = new MessageRouter({
        nodeId: 'node-a',
        inProcess: true,
        wsPort: 19810,
        resolveNodeAddress: (id) => (id === 'node-b' ? peerAddr : null),
      });
      routerB = new MessageRouter({
        nodeId: 'node-b',
        inProcess: true,
        wsPort: 19811,
      });
      await routerA.initialize({startServer: true});
      await routerB.initialize({startServer: true});

      await routerA.connectToNode('node-b', peerAddr);
      assert.ok(
        await waitFor(
          () => routerA.nodeConnections.get('node-b')?.state === 'connected',
        ),
        'node-a should establish the initial connection to node-b',
      );

      let closedCount = 0;
      routerA.on('connectionClosed', (event) => {
        if (event.nodeId === 'node-b') {
          closedCount += 1;
        }
      });

      // node-b goes dark WITHOUT closing the socket: drop all inbound frames so
      // it never answers keepalive pings. The socket stays half-open.
      routerB.handleMessage = () => {};

      const severed = await waitFor(() => closedCount >= 1);
      assert.ok(
        severed,
        'node-a must sever the stale-but-open connection after unanswered pings',
      );
    });

  it('recovers connectivity to a peer that restarted on a new address',
    async () => {
      let peerAddr = 'ws://127.0.0.1:19821';
      routerA = new MessageRouter({
        nodeId: 'node-a',
        inProcess: true,
        wsPort: 19820,
        resolveNodeAddress: (id) => (id === 'node-b' ? peerAddr : null),
      });
      routerB = new MessageRouter({
        nodeId: 'node-b',
        inProcess: true,
        wsPort: 19821,
      });
      await routerA.initialize({startServer: true});
      await routerB.initialize({startServer: true});

      await routerA.connectToNode('node-b', peerAddr);
      assert.ok(
        await waitFor(
          () => routerA.nodeConnections.get('node-b')?.state === 'connected',
        ),
        'node-a should establish the initial connection to node-b',
      );

      // node-b "restarts" on a NEW address (same nodeId): stand up the new
      // endpoint first, publish the new address to the resolver, then make the
      // old node-b go dark on a half-open socket (no clean close).
      routerB2 = new MessageRouter({
        nodeId: 'node-b',
        inProcess: true,
        wsPort: 19822,
      });
      await routerB2.initialize({startServer: true});
      peerAddr = 'ws://127.0.0.1:19822';
      routerB.handleMessage = () => {};

      const recovered = await waitFor(() => {
        const conn = routerA.nodeConnections.get('node-b');
        return conn?.state === 'connected' &&
          conn?.address === 'ws://127.0.0.1:19822';
      });
      const conn = routerA.nodeConnections.get('node-b');
      assert.ok(
        recovered,
        'node-a must re-establish connectivity to node-b at its NEW address ' +
          `(got address=${conn?.address}, state=${conn?.state})`,
      );
    });
});
