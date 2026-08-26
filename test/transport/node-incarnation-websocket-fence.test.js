/**
 * Receiver-side boot-incarnation fencing (node-incarnation-fencing-v2,
 * frontier 2), transport half: an IDENTIFY frame whose bootIncarnation is
 * KNOWN and LOWER than the receiver's per-node high-water is a zombie and
 * must never rekey the peer connection slot — the incoming socket is
 * terminated and the existing connection is kept. A fresh-incarnation
 * IDENTIFY adopts normally. UNKNOWN incarnation (0 / pre-incarnation) never
 * fences (clusterId UNKNOWN compat policy).
 */

import t from '../../src/test-helpers/tap.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {
  ConnectionState,
  RouterMessageType,
} from '../../src/transport/message-router-shared-vocabulary.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const LOCAL_NODE_ID = 'z-local-node';
const REMOTE_NODE_ID = 'a-remote-node';
const REMOTE_NODE_ADDRESS = 'ws://remote-node:9999';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: LOCAL_NODE_ID},
    logging: {level: 'error'},
  });
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function createTerminableWsStub() {
  return {
    terminateCalled: false,
    terminate() {
      this.terminateCalled = true;
    },
  };
}

function registerIncomingConnection(router, connectionId, ws) {
  router.nodeConnections.set(connectionId, {
    connectionId,
    nodeId: null,
    nodeAddress: null,
    ws,
    state: ConnectionState.CONNECTED,
    reconnectAttempts: 0,
    isIncoming: true,
    isSelfConnection: false,
    createdAt: Date.now(),
  });
}

function registerExistingPeerConnection(router, connectionId, ws) {
  router.nodeConnections.set(REMOTE_NODE_ID, {
    connectionId,
    nodeId: REMOTE_NODE_ID,
    nodeAddress: REMOTE_NODE_ADDRESS,
    ws,
    state: ConnectionState.CONNECTED,
    reconnectAttempts: 0,
    isIncoming: true,
    isSelfConnection: false,
    createdAt: Date.now(),
  });
}

function buildIdentifyMessage(options = {}) {
  return {
    type: RouterMessageType.IDENTIFY,
    nodeId: options.nodeId || REMOTE_NODE_ID,
    nodeAddress: options.nodeAddress || REMOTE_NODE_ADDRESS,
    ...(options.bootIncarnation !== undefined ? {
      bootIncarnation: options.bootIncarnation,
    } : {}),
  };
}

t.test(
  'a stale-incarnation IDENTIFY does NOT steal the peer slot (existing ' +
    'socket kept, incoming terminated)',
  async (t) => {
    initializeTestEnvironment();
    t.teardown(cleanupTestEnvironment);

    const router = new MessageRouter({nodeId: LOCAL_NODE_ID});
    await router.initialize({startServer: false});
    t.teardown(async () => {
      await router.shutdown().catch(() => {});
    });

    const existingWs = createTerminableWsStub();
    registerExistingPeerConnection(
      router,
      'existing-preferred-incoming',
      existingWs,
    );

    const staleWs = createTerminableWsStub();
    registerIncomingConnection(router, 'incoming-stale', staleWs);

    // The receiver's high-water for this peer is fresher than the incoming
    // writer's incarnation (a zombie from an earlier boot).
    router.nodeBootIncarnationWatermarks.set(REMOTE_NODE_ID, 5);

    router.handleIdentification(
      'incoming-stale',
      staleWs,
      buildIdentifyMessage({bootIncarnation: 3}),
    );

    t.equal(
      router.nodeConnections.get(REMOTE_NODE_ID)?.connectionId,
      'existing-preferred-incoming',
      'the peer slot is never rekeyed by a stale-incarnation IDENTIFY',
    );
    t.equal(
      existingWs.terminateCalled,
      false,
      'the existing socket is kept',
    );
    t.equal(
      staleWs.terminateCalled,
      true,
      'the stale incoming socket is terminated',
    );
    t.notOk(
      router.nodeConnections.has('incoming-stale'),
      'the stale pre-identify connection record is removed',
    );
    t.equal(
      router.nodeBootIncarnationWatermarks.get(REMOTE_NODE_ID),
      5,
      'a refused identification does not move the high-water',
    );

    t.end();
  },
);

t.test(
  'a fresh-incarnation IDENTIFY adopts the slot and lifts the high-water',
  async (t) => {
    initializeTestEnvironment();
    t.teardown(cleanupTestEnvironment);

    const router = new MessageRouter({nodeId: LOCAL_NODE_ID});
    await router.initialize({startServer: false});
    t.teardown(async () => {
      await router.shutdown().catch(() => {});
    });

    // z-local-node > a-remote-node so the local router prefers incoming
    // connections: with no existing connection, adoption always succeeds.
    const freshWs = createTerminableWsStub();
    registerIncomingConnection(router, 'incoming-fresh', freshWs);

    router.handleIdentification(
      'incoming-fresh',
      freshWs,
      buildIdentifyMessage({bootIncarnation: 7}),
    );

    t.equal(
      router.nodeConnections.get(REMOTE_NODE_ID)?.connectionId,
      'incoming-fresh',
      'a fresh-incarnation IDENTIFY is rekeyed into the peer slot',
    );
    t.equal(
      freshWs.terminateCalled,
      false,
      'the fresh incoming socket is kept',
    );
    t.equal(
      router.nodeBootIncarnationWatermarks.get(REMOTE_NODE_ID),
      7,
      'the accepted identification records the freshest incarnation',
    );

    // ...and a subsequent stale IDENTIFY from the same node is fenced by the
    // high-water the fresh identification just recorded.
    const staleWs = createTerminableWsStub();
    registerIncomingConnection(router, 'incoming-stale-after-fresh', staleWs);
    router.handleIdentification(
      'incoming-stale-after-fresh',
      staleWs,
      buildIdentifyMessage({bootIncarnation: 4}),
    );
    t.equal(
      router.nodeConnections.get(REMOTE_NODE_ID)?.connectionId,
      'incoming-fresh',
      'the slot recorded from the fresh IDENTIFY survives the stale one',
    );
    t.equal(
      staleWs.terminateCalled,
      true,
      'the trailing stale IDENTIFY socket is terminated',
    );

    t.end();
  },
);

t.test(
  'an UNKNOWN incarnation IDENTIFY never fences (pre-incarnation compat)',
  async (t) => {
    initializeTestEnvironment();
    t.teardown(cleanupTestEnvironment);

    const router = new MessageRouter({nodeId: LOCAL_NODE_ID});
    await router.initialize({startServer: false});
    t.teardown(async () => {
      await router.shutdown().catch(() => {});
    });

    // Even with a known high-water recorded, a pre-incarnation IDENTIFY (no
    // field) is UNKNOWN and adopts normally.
    router.nodeBootIncarnationWatermarks.set(REMOTE_NODE_ID, 9);
    const legacyWs = createTerminableWsStub();
    registerIncomingConnection(router, 'incoming-legacy', legacyWs);

    router.handleIdentification(
      'incoming-legacy',
      legacyWs,
      buildIdentifyMessage({}),
    );

    t.equal(
      router.nodeConnections.get(REMOTE_NODE_ID)?.connectionId,
      'incoming-legacy',
      'a pre-incarnation IDENTIFY is not fenced by the high-water',
    );
    t.equal(
      router.nodeBootIncarnationWatermarks.get(REMOTE_NODE_ID),
      9,
      'an UNKNOWN identification does not move the high-water',
    );

    t.end();
  },
);

t.test(
  'sendIdentification stamps the local boot incarnation on the IDENTIFY ' +
    'frame',
  async (t) => {
    initializeTestEnvironment();
    t.teardown(cleanupTestEnvironment);

    const router = new MessageRouter({
      nodeId: LOCAL_NODE_ID,
      bootIncarnation: 11,
    });
    await router.initialize({startServer: false});
    t.teardown(async () => {
      await router.shutdown().catch(() => {});
    });

    const sent = [];
    router.sendRaw = (ws, message) => {
      sent.push(message);
      return true;
    };
    router.sendIdentification({ws: {}, isSelfConnection: false});

    t.equal(sent.length, 1, 'one IDENTIFY frame is sent');
    t.equal(
      sent[0].type,
      RouterMessageType.IDENTIFY,
      'the frame is an IDENTIFY',
    );
    t.equal(
      sent[0].bootIncarnation,
      11,
      'the IDENTIFY carries the local boot incarnation parallel to nodeId',
    );

    // A pre-incarnation router (0) leaves the field OFF the frame.
    const legacyRouter = new MessageRouter({nodeId: LOCAL_NODE_ID});
    await legacyRouter.initialize({startServer: false});
    t.teardown(async () => {
      await legacyRouter.shutdown().catch(() => {});
    });
    const legacySent = [];
    legacyRouter.sendRaw = (ws, message) => {
      legacySent.push(message);
      return true;
    };
    legacyRouter.sendIdentification({ws: {}, isSelfConnection: false});
    t.equal(
      Object.prototype.hasOwnProperty.call(legacySent[0], 'bootIncarnation'),
      false,
      'incarnation 0 (pre-incarnation) is never stamped',
    );

    t.end();
  },
);
