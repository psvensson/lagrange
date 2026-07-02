/**
 * Claim-verification test (quest rolling-restart-w1-priority-establishment-write-unwedge,
 * mesh-reconcile terminal-revive premise).
 *
 * CLAIM: the existing cluster-mesh reconciliation already re-dials a
 * terminal/quiescent connection to a peer's NEW address. Specifically,
 * ConnectWebSocketPhase.connectToClusterNodesFromSnapshot skips only
 * connections in {CONNECTED, CONNECTING, RECONNECTING}; for any other state
 * (no record, or CLOSED / terminal), it re-resolves the address fresh via
 * resolveNodeWebSocketAddress({targetNodeId, systemTableCache}) and calls
 * messageRouter.connectToNode(targetNodeId, freshAddress), which retires the
 * stale record and dials the new address.
 *
 * This test exercises the REAL reconcile entry point
 * (connectToClusterNodesFromSnapshot) end-to-end against a real in-process
 * MessageRouter, so the assertion is about the production reconcile path, not
 * a hand-rolled reimplementation.
 */

import {describe, it, afterEach} from 'node:test';
import assert from 'node:assert';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ConnectWebSocketPhase} from
  '../../src/bootstrap/phases/connect-websocket-phase.js';

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

// A minimal logger with the surface connectToClusterNodesFromSnapshot uses.
function makeLogger() {
  const noop = () => {};
  return {info: noop, warn: noop, error: noop, debug: noop};
}

// systemTableCache mock shaped like the ones in
// test/transport/node-address-resolution.test.js: filter(tableName, predicate)
// returns node_endpoints rows. Returns whatever address is currently set, so
// the test can flip node-b's canonical endpoint to the NEW port mid-run.
function makeSystemTableCache(getAddressForNodeId) {
  return {
    filter(tableName, predicate) {
      if (tableName !== 'node_endpoints') {
        return [];
      }
      const rows = [];
      const addrB = getAddressForNodeId('node-b');
      if (addrB) {
        rows.push({
          endpoint_id: 'ep-node-b-ws',
          node_id: 'node-b',
          transport_type: 'ws',
          address: addrB,
          priority: 0,
          status: 'active',
        });
      }
      return rows.filter(predicate);
    },
  };
}

describe('cluster-mesh reconcile revives a terminal connection on new address',
  () => {
    let routerA;
    let routerBOld;
    let routerBNew;

    afterEach(async () => {
      for (const router of [routerA, routerBOld, routerBNew]) {
        if (router && router.initialized) {
          await router.shutdown();
        }
      }
      routerA = null;
      routerBOld = null;
      routerBNew = null;
    });

    it('no prior record: connectToClusterNodesFromSnapshot dials fresh address',
      async () => {
        const newAddr = 'ws://127.0.0.1:19902';
        routerA = new MessageRouter({
          nodeId: 'node-a',
          inProcess: true,
          wsPort: 19900,
        });
        routerBNew = new MessageRouter({
          nodeId: 'node-b',
          inProcess: true,
          wsPort: 19902,
        });
        await routerA.initialize({startServer: true});
        await routerBNew.initialize({startServer: true});

        // Precondition: A has NO connection record for node-b (terminal/absent).
        assert.strictEqual(
          routerA.nodeConnections.has('node-b'),
          false,
          'precondition: node-a has no prior connection to node-b',
        );

        const systemTableCache = makeSystemTableCache(
          (id) => (id === 'node-b' ? newAddr : null),
        );

        const phase = new ConnectWebSocketPhase({nodeId: 'node-a'});
        await phase.connectToClusterNodesFromSnapshot({
          otherNodes: [{node_id: 'node-b', node_address: '127.0.0.1:8080'}],
          messageRouter: routerA,
          systemTableCache,
          logger: makeLogger(),
          bootstrapResponse: null,
        });

        const connected = await waitFor(() => {
          const conn = routerA.nodeConnections.get('node-b');
          return conn?.state === 'connected' && conn?.address === newAddr;
        });
        const conn = routerA.nodeConnections.get('node-b');
        assert.ok(
          connected,
          'reconcile must connect node-a to node-b at the resolved address ' +
            `(got address=${conn?.address}, state=${conn?.state})`,
        );
      });

    it('stale terminal record at OLD dead port: reconcile re-dials NEW address',
      async () => {
        const oldDeadAddr = 'ws://127.0.0.1:19911';
        const newAddr = 'ws://127.0.0.1:19912';
        let currentBAddr = oldDeadAddr;

        routerA = new MessageRouter({
          nodeId: 'node-a',
          inProcess: true,
          wsPort: 19910,
        });
        // Old node-b: bring it up so the first connect succeeds, then tear it
        // down so A's record goes terminal at the OLD (now dead) port.
        routerBOld = new MessageRouter({
          nodeId: 'node-b',
          inProcess: true,
          wsPort: 19911,
        });
        await routerA.initialize({startServer: true});
        await routerBOld.initialize({startServer: true});

        await routerA.connectToNode('node-b', oldDeadAddr);
        assert.ok(
          await waitFor(
            () => routerA.nodeConnections.get('node-b')?.state === 'connected',
          ),
          'setup: node-a should first connect to node-b at the OLD address',
        );

        // node-b "restarts" on a NEW port (same nodeId). Stand up the new
        // endpoint, flip the canonical cache address, and shut down the OLD
        // node-b so A's existing record is stale/terminal (not CONNECTED).
        routerBNew = new MessageRouter({
          nodeId: 'node-b',
          inProcess: true,
          wsPort: 19912,
        });
        await routerBNew.initialize({startServer: true});
        currentBAddr = newAddr;
        await routerBOld.shutdown();

        // Drive A's record to a non-reusable (terminal) state deterministically.
        const staleConn = routerA.nodeConnections.get('node-b');
        if (staleConn) {
          staleConn.state = 'closed';
        }
        assert.ok(
          !new Set(['connected', 'connecting', 'reconnecting']).has(
            routerA.getConnectionState('node-b'),
          ),
          'precondition: node-a\'s record for node-b is in a terminal state ' +
            `(got ${routerA.getConnectionState('node-b')})`,
        );

        const systemTableCache = makeSystemTableCache(
          (id) => (id === 'node-b' ? currentBAddr : null),
        );

        const phase = new ConnectWebSocketPhase({nodeId: 'node-a'});
        await phase.connectToClusterNodesFromSnapshot({
          otherNodes: [{node_id: 'node-b', node_address: '127.0.0.1:8080'}],
          messageRouter: routerA,
          systemTableCache,
          logger: makeLogger(),
          bootstrapResponse: null,
        });

        const recovered = await waitFor(() => {
          const conn = routerA.nodeConnections.get('node-b');
          return conn?.state === 'connected' && conn?.address === newAddr;
        });
        const conn = routerA.nodeConnections.get('node-b');
        assert.ok(
          recovered,
          'reconcile must retire the stale terminal record and re-dial node-b ' +
            `at its NEW address (got address=${conn?.address}, ` +
            `state=${conn?.state})`,
        );
      });
  });
