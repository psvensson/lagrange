/**
 * Name-first peer advertising — publication + dial-by-name legs
 * (quest restart-new-ip-name-first-advertising).
 *
 * node-address-resolution.test.js proves resolveAdvertisedWebSocketAddress
 * preserves an explicitly configured hostname; this file guards the two legs
 * that sit around it in the sealed statement:
 *
 *   1. PUBLICATION: the heartbeat node_endpoints upsert row carries the
 *      advertised NAME verbatim (heartbeat-service-publication-methods
 *      buildEndpointRow uses advertisedNodeWsAddress over nodeAddress), and
 *      the config -> entrypoint plumbing (node.advertisedWsAddress ->
 *      resolveRuntimeAddresses) delivers that name even under a wildcard
 *      transport bind.
 *   2. DIAL-BY-NAME: a peer whose stored address is a hostname (not an IP)
 *      is dialed through the real MessageRouter transport; the OS resolves
 *      the name at connect time.
 *
 * The remaining leg of the statement — a CHANGED backing IP behind a stable
 * name picked up on reconnect — is the OS resolver's per-connect lookup
 * composed with the reconnect re-resolution already guarded by
 * message-router-endpoint-address-change-redial.test.js (reconnect re-reads
 * the stored address and dials it fresh; a name behaves identically, with
 * the lookup happening inside the OS).
 */

import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert';
import {HeartbeatService} from '../../src/control-plane/heartbeat-service.js';
import {resolveRuntimeAddresses} from '../../src/entrypoint-runtime-options.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const ADVERTISED_NAME = 'stable-node-name.internal:9090';

async function waitFor(predicate, {timeoutMs = 2000, stepMs = 10} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  return predicate();
}

describe('name-first advertising: publication + dial-by-name', () => {
  beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({
      node: {id: 'name-first-test-node'},
      logging: {level: 'error'},
    });
    LoggingService.getInstance().initialize({level: 'error'});
  });

  afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  it('publishes the advertised NAME verbatim into the node_endpoints row', () => {
    const service = new HeartbeatService({
      nodeId: 'name-first-test-node',
      nodeAddress: '10.0.0.7:8080',
      advertisedNodeWsAddress: ADVERTISED_NAME,
    });
    const row = service.buildEndpointRow(null, Date.now());
    assert.strictEqual(
      row.address,
      ADVERTISED_NAME,
      'node_endpoints upsert must carry the advertised name, not the raw address',
    );
  });

  it('falls back to nodeAddress only when no name is advertised', () => {
    const service = new HeartbeatService({
      nodeId: 'name-first-test-node',
      nodeAddress: '10.0.0.7:8080',
    });
    const row = service.buildEndpointRow(null, Date.now());
    assert.strictEqual(row.address, '10.0.0.7:8080');
  });

  it('plumbs node.advertisedWsAddress through the entrypoint under a wildcard bind',
    () => {
      ConfigurationManager.resetInstance();
      const config = ConfigurationManager.getInstance();
      config.initialize({
        node: {
          id: 'name-first-test-node',
          advertisedWsAddress: ADVERTISED_NAME,
        },
        transport: {wsHost: '0.0.0.0'},
      });
      const addresses = resolveRuntimeAddresses(config);
      assert.strictEqual(
        addresses.advertisedNodeWsAddress,
        `ws://${ADVERTISED_NAME}`,
        'wildcard-bind IP substitution must not clobber the configured name',
      );
    });

  it('dials a peer by NAME through the real transport (OS resolves at connect)',
    async () => {
      // node-b's stored address is a hostname, not an IP: the dial path must
      // hand the name to the OS resolver at connect time.
      const peerByName = 'ws://localhost:19833';
      const routerA = new MessageRouter({
        nodeId: 'node-a',
        inProcess: true,
        wsPort: 19832,
        resolveNodeAddress: (id) => (id === 'node-b' ? peerByName : null),
      });
      const routerB = new MessageRouter({
        nodeId: 'node-b',
        inProcess: true,
        wsPort: 19833,
      });
      try {
        await routerA.initialize({startServer: true});
        await routerB.initialize({startServer: true});
        await routerA.connectToNode('node-b', peerByName);
        assert.ok(
          await waitFor(
            () => routerA.nodeConnections.get('node-b')?.state === 'connected',
          ),
          'peer must be dialable by hostname, resolved by the OS per connect',
        );
      } finally {
        for (const router of [routerA, routerB]) {
          if (router && router.initialized) {
            await router.shutdown();
          }
        }
      }
    });
});
