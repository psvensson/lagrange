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
import {TRANSPORT_EVENT} from '../../src/constants/transport.js';

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

function registerExistingPeerConnection(
  router,
  connectionId,
  ws,
  bootIncarnation = 0,
) {
  router.nodeConnections.set(REMOTE_NODE_ID, {
    connectionId,
    nodeId: REMOTE_NODE_ID,
    nodeAddress: REMOTE_NODE_ADDRESS,
    ws,
    state: ConnectionState.CONNECTED,
    reconnectAttempts: 0,
    isIncoming: true,
    isSelfConnection: false,
    bootIncarnation,
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
    t.same(
      router.getCurrentPrimaryConnectionBootIncarnation(REMOTE_NODE_ID),
      {
        nodeId: REMOTE_NODE_ID,
        bootIncarnation: 7,
        connectionId: 'incoming-fresh',
      },
      'the adopted primary socket owns the current incarnation snapshot',
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
  'a rejected duplicate IDENTIFY neither advances nor replaces current ' +
    'connection-incarnation evidence',
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
      'existing-primary',
      existingWs,
      5,
    );
    router.nodeBootIncarnationWatermarks.set(REMOTE_NODE_ID, 5);
    const duplicateWs = createTerminableWsStub();
    registerIncomingConnection(router, 'incoming-duplicate', duplicateWs);

    // A strictly LOWER duplicate: were the refused IDENTIFY recorded anyway
    // (overwrite instead of high-water), the watermark would read 4.
    router.handleIdentification(
      'incoming-duplicate',
      duplicateWs,
      buildIdentifyMessage({bootIncarnation: 4}),
    );

    t.equal(duplicateWs.terminateCalled, true);
    t.same(
      router.getCurrentPrimaryConnectionBootIncarnation(REMOTE_NODE_ID),
      {
        nodeId: REMOTE_NODE_ID,
        bootIncarnation: 5,
        connectionId: 'existing-primary',
      },
      'only the socket that remains in the primary slot supplies identity',
    );
    t.equal(
      router.nodeBootIncarnationWatermarks.get(REMOTE_NODE_ID),
      5,
      'a refused lower duplicate neither advances nor overwrites the high-water',
    );
    t.end();
  },
);

t.test(
  'a newer boot supersedes a directionally preferred older primary and close ' +
    'clears its current identity',
  async (t) => {
    initializeTestEnvironment();
    t.teardown(cleanupTestEnvironment);

    const router = new MessageRouter({nodeId: LOCAL_NODE_ID});
    await router.initialize({startServer: false});
    t.teardown(async () => {
      await router.shutdown().catch(() => {});
    });

    const oldWs = createTerminableWsStub();
    registerExistingPeerConnection(router, 'old-primary', oldWs, 4);
    router.nodeBootIncarnationWatermarks.set(REMOTE_NODE_ID, 4);
    const newWs = createTerminableWsStub();
    registerIncomingConnection(router, 'new-boot', newWs);

    router.handleIdentification(
      'new-boot',
      newWs,
      buildIdentifyMessage({bootIncarnation: 6}),
    );

    t.equal(oldWs.terminateCalled, true,
      'newer process identity wins even when connection direction was stable');
    t.same(
      router.getCurrentPrimaryConnectionBootIncarnation(REMOTE_NODE_ID),
      {
        nodeId: REMOTE_NODE_ID,
        bootIncarnation: 6,
        connectionId: 'new-boot',
      },
    );

    router.handleConnectionClose(REMOTE_NODE_ID, 'new-boot');
    t.equal(
      router.getCurrentPrimaryConnectionBootIncarnation(REMOTE_NODE_ID),
      null,
      'disconnect/reconnect ownership cannot retain a former socket identity',
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
    t.same(
      router.getLocalBootIncarnationIdentity(),
      {
        nodeId: LOCAL_NODE_ID,
        bootIncarnation: 11,
        connectionId: `local:${router.routerId}:11`,
      },
      'the local process exposes the same minted identity to interaction owners',
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
    t.equal(
      legacyRouter.getLocalBootIncarnationIdentity(),
      null,
      'UNKNOWN local identity cannot authorize a formation generation',
    );

    t.end();
  },
);

t.test(
  'current-primary incarnation authority is stable under post-import ' +
    'mutable intrinsic replacement',
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
    const ws = createTerminableWsStub();
    registerExistingPeerConnection(router, 'primary-5', ws, 5);
    router.nodeBootIncarnationWatermarks.set(REMOTE_NODE_ID, 5);
    const originals = {
      mapGet: Map.prototype.get,
      mapSet: Map.prototype.set,
      mathMax: Math.max,
      numberIsSafeInteger: Number.isSafeInteger,
      objectFreeze: Object.freeze,
      localeCompare: String.prototype.localeCompare,
      bootIncarnation: Object.getOwnPropertyDescriptor(
        Object.prototype,
        'bootIncarnation',
      ),
      valueOf: Object.getOwnPropertyDescriptor(Object.prototype, 'valueOf'),
      toString: Object.getOwnPropertyDescriptor(Object.prototype, 'toString'),
    };
    let current;
    let decision;
    let inheritedIdentity;
    let accessorIdentity;
    let objectIdentity;
    let ownPrimitiveIdentity;
    let getterCalls = 0;
    const accessorMessage = {};
    Object.defineProperty(accessorMessage, 'bootIncarnation', {
      get() {
        getterCalls += 1;
        return 7;
      },
    });
    try {
      // eslint-disable-next-line no-extend-native -- adversarial fixture
      Map.prototype.get = () => null;
      // eslint-disable-next-line no-extend-native -- adversarial fixture
      Map.prototype.set = () => new Map();
      Math.max = () => -1;
      Number.isSafeInteger = () => false;
      Object.freeze = () => ({forged: true});
      // eslint-disable-next-line no-extend-native -- adversarial fixture
      String.prototype.localeCompare = () => -1;
      // eslint-disable-next-line no-extend-native -- adversarial fixture
      Object.defineProperty(Object.prototype, 'bootIncarnation', {
        configurable: true,
        value: 7,
      });
      // eslint-disable-next-line no-extend-native -- adversarial fixture
      Object.defineProperty(Object.prototype, 'valueOf', {
        configurable: true,
        value: () => 7,
        writable: true,
      });
      // eslint-disable-next-line no-extend-native -- adversarial fixture
      Object.defineProperty(Object.prototype, 'toString', {
        configurable: true,
        value: () => '7',
        writable: true,
      });
      current = router.getCurrentPrimaryConnectionBootIncarnation(
        REMOTE_NODE_ID,
      );
      decision = router.connectionAuthorityOwner
        .resolveIncomingConnectionAdoption(REMOTE_NODE_ID, 6);
      inheritedIdentity = router.connectionAuthorityOwner
        .readIncomingBootIncarnation({});
      accessorIdentity = router.connectionAuthorityOwner
        .readIncomingBootIncarnation(accessorMessage);
      objectIdentity = router.connectionAuthorityOwner
        .readIncomingBootIncarnation({bootIncarnation: {}});
      ownPrimitiveIdentity = router.connectionAuthorityOwner
        .readIncomingBootIncarnation({bootIncarnation: 7});
    } finally {
      // eslint-disable-next-line no-extend-native -- adversarial fixture
      Map.prototype.get = originals.mapGet;
      // eslint-disable-next-line no-extend-native -- adversarial fixture
      Map.prototype.set = originals.mapSet;
      Math.max = originals.mathMax;
      Number.isSafeInteger = originals.numberIsSafeInteger;
      Object.freeze = originals.objectFreeze;
      // eslint-disable-next-line no-extend-native -- adversarial fixture
      String.prototype.localeCompare = originals.localeCompare;
      if (originals.bootIncarnation) {
        // eslint-disable-next-line no-extend-native -- adversarial fixture
        Object.defineProperty(
          Object.prototype,
          'bootIncarnation',
          originals.bootIncarnation,
        );
      } else {
        delete Object.prototype.bootIncarnation;
      }
      // eslint-disable-next-line no-extend-native -- adversarial fixture
      Object.defineProperty(Object.prototype, 'valueOf', originals.valueOf);
      // eslint-disable-next-line no-extend-native -- adversarial fixture
      Object.defineProperty(Object.prototype, 'toString', originals.toString);
    }
    t.same(current, {
      nodeId: REMOTE_NODE_ID,
      bootIncarnation: 5,
      connectionId: 'primary-5',
    });
    t.equal(
      decision.state,
      'adopt_incoming',
      'the newer current process wins independently of poisoned direction logic',
    );
    t.equal(inheritedIdentity, 0,
      'inherited incarnation is absent authority');
    t.equal(accessorIdentity, 0,
      'accessor incarnation is absent authority');
    t.equal(objectIdentity, 0,
      'object coercion cannot mint incarnation authority');
    t.equal(ownPrimitiveIdentity, 7,
      'an own primitive number remains the only positive authority input');
    t.equal(getterCalls, 0, 'the authority boundary never invokes accessors');
    t.end();
  },
);

// ---------------------------------------------------------------------------
// Bidirectional identity: the dialer is the only side that sends IDENTIFY on
// open, so the acceptor answers an adopted primary with its own IDENTIFY. The
// witnesses below drive real MessageRouter instances (in-process sockets or
// recording socket stubs through the real handleIdentification owner).
// ---------------------------------------------------------------------------

const WS_OPEN_READY_STATE = 1;
const PEER_A_NODE_ID = 'node-a';
const PEER_B_NODE_ID = 'node-b';
const SEED_NODE_ID = 'seed';
const JOINER_NODE_ID = 'joiner';
const SEED_BOOT_INCARNATION = 11;
const JOINER_BOOT_INCARNATION = 22;
const PEER_A_BOOT_INCARNATION = 3;
const PEER_B_BOOT_INCARNATION = 4;
const IN_PROCESS_RECONNECT_INTERVAL_MS = 100;
const IN_PROCESS_RECONNECT_MAX_ATTEMPTS = 5;
const CONVERGENCE_TIMEOUT_MS = 2000;
const CONVERGENCE_STEP_MS = 10;

function initializeInProcessTestEnvironment(localNodeId) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: localNodeId},
    logging: {level: 'error'},
    transport: {
      reconnectIntervalMs: IN_PROCESS_RECONNECT_INTERVAL_MS,
      reconnectMaxAttempts: IN_PROCESS_RECONNECT_MAX_ATTEMPTS,
    },
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate) {
  const deadline = Date.now() + CONVERGENCE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (predicate()) {
      return true;
    }
    await wait(CONVERGENCE_STEP_MS);
  }
  return predicate();
}

function createIdentifyRecordingWsStub() {
  return {
    readyState: WS_OPEN_READY_STATE,
    sent: [],
    terminateCalled: false,
    send(frame) {
      this.sent.push(JSON.parse(frame));
    },
    terminate() {
      this.terminateCalled = true;
    },
  };
}

function registerOutboundPeerConnection(
  router,
  peerNodeId,
  connectionId,
  ws,
) {
  const address = `ws://${peerNodeId}:9999`;
  router.nodeConnections.set(peerNodeId, {
    connectionId,
    nodeId: peerNodeId,
    nodeAddress: address,
    address,
    configuredAddress: address,
    ws,
    state: ConnectionState.CONNECTED,
    reconnectAttempts: 0,
    isIncoming: false,
    isSelfConnection: false,
    bootIncarnation: 0,
    createdAt: Date.now(),
  });
}

async function createInProcessRouter(t, {nodeId, wsPort, bootIncarnation}) {
  const router = new MessageRouter({
    nodeId,
    wsPort,
    inProcess: true,
    bootIncarnation,
  });
  await router.initialize({startServer: true});
  t.teardown(async () => {
    await router.shutdown().catch(() => {});
  });
  return router;
}

function describePrimary(router, peerNodeId) {
  const primary = router.nodeConnections.get(peerNodeId) || null;
  return {
    connectionId: primary?.connectionId || null,
    connected: primary?.state === ConnectionState.CONNECTED &&
      Boolean(primary?.ws),
    isIncoming: primary?.isIncoming === true,
    evidence: router.getCurrentPrimaryConnectionBootIncarnation(peerNodeId),
  };
}

/**
 * A settled link: both primaries CONNECTED, on complementary directions
 * (one socket serves both sides), and both sides holding identity evidence.
 */
function linkIsSettled(routerA, routerB) {
  const a = describePrimary(routerA, routerB.nodeId);
  const b = describePrimary(routerB, routerA.nodeId);
  return a.connected && b.connected &&
    a.isIncoming !== b.isIncoming &&
    a.evidence !== null && b.evidence !== null;
}

t.test(
  'an adopted primary is answered with this side\'s IDENTIFY exactly once ' +
    'while a refused duplicate socket is never answered',
  async (t) => {
    initializeTestEnvironment();
    t.teardown(cleanupTestEnvironment);

    const router = new MessageRouter({
      nodeId: LOCAL_NODE_ID,
      bootIncarnation: SEED_BOOT_INCARNATION,
    });
    await router.initialize({startServer: false});
    t.teardown(async () => {
      await router.shutdown().catch(() => {});
    });

    const adoptedWs = createIdentifyRecordingWsStub();
    registerIncomingConnection(router, 'incoming-adopted', adoptedWs);
    router.handleIdentification(
      'incoming-adopted',
      adoptedWs,
      buildIdentifyMessage({bootIncarnation: 7}),
    );

    t.equal(adoptedWs.sent.length, 1, 'exactly one reply on the adopted socket');
    t.equal(adoptedWs.sent[0].type, RouterMessageType.IDENTIFY);
    t.equal(adoptedWs.sent[0].nodeId, LOCAL_NODE_ID,
      'the reply identifies this node');
    t.equal(adoptedWs.sent[0].nodeAddress, router.advertisedAddress,
      'the reply carries nodeAddress so the dialer never reads it as ' +
        'missing fields');
    t.equal(adoptedWs.sent[0].bootIncarnation, SEED_BOOT_INCARNATION,
      'the reply stamps the local boot incarnation like the dialer\'s IDENTIFY');

    const duplicateWs = createIdentifyRecordingWsStub();
    registerIncomingConnection(router, 'incoming-duplicate', duplicateWs);
    router.handleIdentification(
      'incoming-duplicate',
      duplicateWs,
      buildIdentifyMessage({bootIncarnation: 7}),
    );
    t.equal(duplicateWs.terminateCalled, true);
    t.equal(duplicateWs.sent.length, 0, 'a refused socket is never answered');
    t.equal(adoptedWs.sent.length, 1, 'the kept primary is not answered again');
    t.end();
  },
);

t.test(
  'the IDENTIFY reply binds the acceptor incarnation to the dialer\'s ' +
    'OUTBOUND primary and evidence survives a socket flap',
  async (t) => {
    initializeInProcessTestEnvironment(SEED_NODE_ID);
    t.teardown(cleanupTestEnvironment);
    const seed = await createInProcessRouter(t, {
      nodeId: SEED_NODE_ID,
      wsPort: 19910,
      bootIncarnation: SEED_BOOT_INCARNATION,
    });
    const joiner = await createInProcessRouter(t, {
      nodeId: JOINER_NODE_ID,
      wsPort: 19911,
      bootIncarnation: JOINER_BOOT_INCARNATION,
    });

    await joiner.connectToNode(SEED_NODE_ID, 'ws://localhost:19910');
    t.equal(
      await waitFor(() => linkIsSettled(seed, joiner)),
      true,
      'the dialed link settles with evidence on both sides',
    );
    const joinerPrimary = describePrimary(joiner, SEED_NODE_ID);
    t.equal(joinerPrimary.isIncoming, false,
      'the dialer holds the seed as an OUTBOUND primary');
    t.same(
      joinerPrimary.evidence,
      {
        nodeId: SEED_NODE_ID,
        bootIncarnation: SEED_BOOT_INCARNATION,
        connectionId: joinerPrimary.connectionId,
      },
      'the outbound primary reports the acceptor\'s boot incarnation',
    );
    t.equal(
      describePrimary(seed, JOINER_NODE_ID).evidence?.bootIncarnation,
      JOINER_BOOT_INCARNATION,
    );

    // Flap: the live socket dies (both ends observe the close, then re-dial
    // as outbound). Wait for both close events before judging settlement so
    // the pre-flap snapshot cannot satisfy the predicate.
    const closes = Promise.all([seed, joiner].map((router) =>
      new Promise((resolve) =>
        router.once(TRANSPORT_EVENT.CONNECTION_CLOSED, resolve))));
    seed.nodeConnections.get(JOINER_NODE_ID).ws.terminate();
    await closes;
    t.equal(
      await waitFor(() => linkIsSettled(seed, joiner)),
      true,
      'the link re-settles after the flap',
    );
    const seedPrimary = describePrimary(seed, JOINER_NODE_ID);
    t.equal(seedPrimary.evidence?.bootIncarnation, JOINER_BOOT_INCARNATION,
      'the authority still reports the joiner incarnation after the flap');
    t.equal(
      describePrimary(joiner, SEED_NODE_ID).evidence?.bootIncarnation,
      SEED_BOOT_INCARNATION,
    );
    const outboundSide = seedPrimary.isIncoming ? joiner : seed;
    const outboundPrimary = describePrimary(
      outboundSide,
      outboundSide === seed ? JOINER_NODE_ID : SEED_NODE_ID,
    );
    t.equal(outboundPrimary.isIncoming, false);
    t.not(outboundPrimary.evidence, null,
      'the side whose primary ended up OUTBOUND holds non-null evidence');
    t.end();
  },
);

async function runCrossConnectSide(t, {localId, localInc, peerId, peerInc}) {
  const router = new MessageRouter({nodeId: localId, bootIncarnation: localInc});
  await router.initialize({startServer: false});
  t.teardown(async () => {
    await router.shutdown().catch(() => {});
  });
  const outboundWs = createIdentifyRecordingWsStub();
  registerOutboundPeerConnection(
    router,
    peerId,
    `${localId}-outbound-to-${peerId}`,
    outboundWs,
  );
  const incomingWs = createIdentifyRecordingWsStub();
  const incomingId = `incoming-from-${peerId}`;
  registerIncomingConnection(router, incomingId, incomingWs);
  router.handleIdentification(
    incomingId,
    incomingWs,
    buildIdentifyMessage({
      nodeId: peerId,
      nodeAddress: `ws://${peerId}:9999`,
      bootIncarnation: peerInc,
    }),
  );
  return {router, outboundWs, incomingWs, peerId};
}

t.test(
  'a simultaneous cross-connect with known incarnations on both sides ' +
    'leaves exactly one side yielding its outbound',
  async (t) => {
    initializeTestEnvironment();
    t.teardown(cleanupTestEnvironment);

    const sideA = await runCrossConnectSide(t, {
      localId: PEER_A_NODE_ID,
      localInc: PEER_A_BOOT_INCARNATION,
      peerId: PEER_B_NODE_ID,
      peerInc: PEER_B_BOOT_INCARNATION,
    });
    const sideB = await runCrossConnectSide(t, {
      localId: PEER_B_NODE_ID,
      localInc: PEER_B_BOOT_INCARNATION,
      peerId: PEER_A_NODE_ID,
      peerInc: PEER_A_BOOT_INCARNATION,
    });

    const outboundTerminations = [sideA, sideB]
      .filter((side) => side.outboundWs.terminateCalled).length;
    t.equal(outboundTerminations, 1,
      'exactly one side terminates its outbound (UNKNOWN never yields)');
    for (const side of [sideA, sideB]) {
      const primary = describePrimary(side.router, side.peerId);
      t.equal(primary.connected, true,
        `${side.router.nodeId} keeps one CONNECTED primary for its peer`);
      t.equal(
        side.outboundWs.terminateCalled !== side.incomingWs.terminateCalled,
        true,
        `${side.router.nodeId} terminates exactly one of its two sockets`,
      );
    }
    const yielding = sideA.outboundWs.terminateCalled ? sideA : sideB;
    t.equal(yielding.incomingWs.sent.length, 1,
      'the yielding side answers the adopted socket once');
    t.equal(yielding.outboundWs.sent.length, 0);
    t.end();
  },
);

t.test(
  'a simultaneous in-process cross-connect converges to one CONNECTED ' +
    'primary per peer with evidence on both sides',
  async (t) => {
    initializeInProcessTestEnvironment(PEER_A_NODE_ID);
    t.teardown(cleanupTestEnvironment);
    const routerA = await createInProcessRouter(t, {
      nodeId: PEER_A_NODE_ID,
      wsPort: 19920,
      bootIncarnation: PEER_A_BOOT_INCARNATION,
    });
    const routerB = await createInProcessRouter(t, {
      nodeId: PEER_B_NODE_ID,
      wsPort: 19921,
      bootIncarnation: PEER_B_BOOT_INCARNATION,
    });

    await Promise.all([
      routerA.connectToNode(PEER_B_NODE_ID, 'ws://localhost:19921'),
      routerB.connectToNode(PEER_A_NODE_ID, 'ws://localhost:19920'),
    ]);
    t.equal(
      await waitFor(() => linkIsSettled(routerA, routerB)),
      true,
      'the cross-connect settles on one socket with evidence on both sides',
    );
    t.equal(
      describePrimary(routerA, PEER_B_NODE_ID).evidence?.bootIncarnation,
      PEER_B_BOOT_INCARNATION,
    );
    t.equal(
      describePrimary(routerB, PEER_A_NODE_ID).evidence?.bootIncarnation,
      PEER_A_BOOT_INCARNATION,
    );
    t.end();
  },
);

t.test(
  'a stale IDENTIFY reply on the outbound primary is refused and a live ' +
    'reply binds without being answered or re-announced',
  async (t) => {
    initializeTestEnvironment();
    t.teardown(cleanupTestEnvironment);

    const router = new MessageRouter({
      nodeId: LOCAL_NODE_ID,
      bootIncarnation: SEED_BOOT_INCARNATION,
    });
    await router.initialize({startServer: false});
    t.teardown(async () => {
      await router.shutdown().catch(() => {});
    });
    let announcements = 0;
    router.on(TRANSPORT_EVENT.NODE_CONNECTED, () => {
      announcements += 1;
    });
    router.on(TRANSPORT_EVENT.NODE_IDENTIFIED, () => {
      announcements += 1;
    });

    const staleWs = createIdentifyRecordingWsStub();
    registerOutboundPeerConnection(
      router,
      REMOTE_NODE_ID,
      'outbound-stale',
      staleWs,
    );
    router.nodeBootIncarnationWatermarks.set(REMOTE_NODE_ID, 5);
    router.handleIdentification(
      REMOTE_NODE_ID,
      staleWs,
      buildIdentifyMessage({bootIncarnation: 4}),
    );
    t.equal(staleWs.terminateCalled, true,
      'a stale reply terminates the outbound socket');
    t.equal(router.getCurrentPrimaryConnectionBootIncarnation(REMOTE_NODE_ID),
      null, 'a stale reply never binds identity');
    t.equal(router.nodeBootIncarnationWatermarks.get(REMOTE_NODE_ID), 5);

    const liveWs = createIdentifyRecordingWsStub();
    registerOutboundPeerConnection(
      router,
      REMOTE_NODE_ID,
      'outbound-live',
      liveWs,
    );
    router.handleIdentification(
      REMOTE_NODE_ID,
      liveWs,
      buildIdentifyMessage({bootIncarnation: 6}),
    );
    t.equal(liveWs.terminateCalled, false);
    t.same(
      router.getCurrentPrimaryConnectionBootIncarnation(REMOTE_NODE_ID),
      {
        nodeId: REMOTE_NODE_ID,
        bootIncarnation: 6,
        connectionId: 'outbound-live',
      },
      'a live reply binds the peer incarnation to the outbound primary',
    );
    t.equal(router.nodeBootIncarnationWatermarks.get(REMOTE_NODE_ID), 6);
    t.equal(staleWs.sent.length + liveWs.sent.length, 0,
      'a reply is never answered (no IDENTIFY ping-pong)');
    t.equal(announcements, 0,
      'a reply never re-emits nodeConnected/nodeIdentified on the dialer');
    t.end();
  },
);
