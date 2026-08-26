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
    closeCalled: false,
    terminateCalled: false,
    close() {
      this.closeCalled = true;
    },
    removeAllListeners() {},
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
    identificationReplySent: false,
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

function registerOutgoingPeerConnection(
  router,
  nodeId,
  connectionId,
  ws,
) {
  router.nodeConnections.set(nodeId, {
    connectionId,
    nodeId,
    nodeAddress: null,
    ws,
    state: ConnectionState.CONNECTED,
    reconnectAttempts: 0,
    isIncoming: false,
    isSelfConnection: false,
    bootIncarnation: 0,
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
  'canonical in-process incoming records establish bilateral boot identity ' +
    'with joiner admission closed under prototype pollution',
  async (t) => {
    initializeTestEnvironment();
    t.teardown(cleanupTestEnvironment);
    const seed = new MessageRouter({
      nodeId: LOCAL_NODE_ID,
      wsPort: 19381,
      inProcess: true,
      bootIncarnation: 11,
    });
    const joiner = new MessageRouter({
      nodeId: REMOTE_NODE_ID,
      wsPort: 19382,
      inProcess: true,
      bootIncarnation: 7,
      externalAdmissionEnabled: false,
    });
    t.teardown(async () => {
      await joiner.shutdown().catch(() => {});
      await seed.shutdown().catch(() => {});
    });
    await seed.startServer();
    await joiner.startServer();
    let getterCalls = 0;
    const inherited = Object.getOwnPropertyDescriptor(
      Object.prototype,
      'identificationReplySent',
    );
    const originalJsonParse = JSON.parse;
    const originalJsonStringify = JSON.stringify;
    const originalStringToString = Object.getOwnPropertyDescriptor(
      String.prototype,
      'toString',
    );
    const originalBufferToString = Object.getOwnPropertyDescriptor(
      Buffer.prototype,
      'toString',
    );
    let jsonParseCalls = 0;
    let jsonStringifyCalls = 0;
    let stringToStringCalls = 0;
    let bufferToStringCalls = 0;
    try {
      // eslint-disable-next-line no-extend-native -- hostile prototype fixture
      Object.defineProperty(Object.prototype, 'identificationReplySent', {
        configurable: true,
        get() {
          getterCalls += 1;
          return true;
        },
      });
      JSON.parse = () => {
        jsonParseCalls += 1;
        throw new Error('live JSON.parse invoked');
      };
      JSON.stringify = () => {
        jsonStringifyCalls += 1;
        throw new Error('live JSON.stringify invoked');
      };
      // eslint-disable-next-line no-extend-native -- hostile wire fixture
      String.prototype.toString = () => {
        stringToStringCalls += 1;
        throw new Error('live String.prototype.toString invoked');
      };
      Buffer.prototype.toString = () => {
        bufferToStringCalls += 1;
        throw new Error('live Buffer.prototype.toString invoked');
      };
      await joiner.connectToNode(
        LOCAL_NODE_ID,
        'ws://127.0.0.1:19381',
        {autoReconnect: false},
      );
      await Promise.resolve();
      await Promise.resolve();
      joiner.nodeConnections.get(LOCAL_NODE_ID).ws.send(
        Buffer.from('{"type":"unsupported-test-frame"}'),
      );
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      JSON.parse = originalJsonParse;
      JSON.stringify = originalJsonStringify;
      // eslint-disable-next-line no-extend-native -- restore hostile fixture
      Object.defineProperty(
        String.prototype,
        'toString',
        originalStringToString,
      );
      Object.defineProperty(
        Buffer.prototype,
        'toString',
        originalBufferToString,
      );
      if (inherited) {
        // eslint-disable-next-line no-extend-native -- restore hostile fixture
        Object.defineProperty(
          Object.prototype,
          'identificationReplySent',
          inherited,
        );
      } else {
        delete Object.prototype.identificationReplySent;
      }
    }

    t.same(seed.getCurrentPrimaryConnectionBootIncarnation(REMOTE_NODE_ID), {
      nodeId: REMOTE_NODE_ID,
      bootIncarnation: 7,
      connectionId:
        seed.nodeConnections.get(REMOTE_NODE_ID)?.connectionId,
    }, 'the admitted seed binds the dialing joiner boot');
    t.same(joiner.getCurrentPrimaryConnectionBootIncarnation(LOCAL_NODE_ID), {
      nodeId: LOCAL_NODE_ID,
      bootIncarnation: 11,
      connectionId:
        joiner.nodeConnections.get(LOCAL_NODE_ID)?.connectionId,
    }, 'the admission-closed joiner binds the reciprocal seed boot');
    t.equal(getterCalls, 0,
      'the canonical latch owner never reads a prototype accessor');
    t.equal(jsonParseCalls, 0,
      'wire parsing uses the transport owner captured intrinsic');
    t.equal(jsonStringifyCalls, 0,
      'wire serialization uses the transport owner captured intrinsic');
    t.equal(stringToStringCalls, 0,
      'primitive string frames never invoke the live prototype');
    t.equal(bufferToStringCalls, 0,
      'Buffer frames use the transport owner captured decoder');
    t.end();
  },
);

t.test(
  'canonical wire IDENTIFY rejects inherited peer identity without invoking ' +
    'prototype accessors',
  async (t) => {
    initializeTestEnvironment();
    t.teardown(cleanupTestEnvironment);
    const seed = new MessageRouter({
      nodeId: LOCAL_NODE_ID,
      wsPort: 19383,
      inProcess: true,
      bootIncarnation: 11,
    });
    const attacker = new MessageRouter({
      nodeId: 'attacker-node',
      wsPort: 19384,
      inProcess: true,
      bootIncarnation: 7,
    });
    t.teardown(async () => {
      await attacker.shutdown().catch(() => {});
      await seed.shutdown().catch(() => {});
    });
    await seed.startServer();
    await attacker.startServer();
    attacker.sendIdentification = (connection) => attacker.sendRaw(
      connection.ws,
      {type: RouterMessageType.IDENTIFY, bootIncarnation: 7},
    );
    const nodeIdDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      'nodeId',
    );
    const nodeAddressDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      'nodeAddress',
    );
    let getterCalls = 0;
    try {
      // eslint-disable-next-line no-extend-native -- hostile identity fixture
      Object.defineProperty(Object.prototype, 'nodeId', {
        configurable: true,
        get() {
          getterCalls += 1;
          return 'forged-peer';
        },
      });
      // eslint-disable-next-line no-extend-native -- hostile identity fixture
      Object.defineProperty(Object.prototype, 'nodeAddress', {
        configurable: true,
        get() {
          getterCalls += 1;
          return 'ws://forged-peer:1';
        },
      });
      await attacker.connectToNode(
        LOCAL_NODE_ID,
        'ws://127.0.0.1:19383',
        {autoReconnect: false},
      );
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      if (nodeIdDescriptor) {
        // eslint-disable-next-line no-extend-native -- restore hostile fixture
        Object.defineProperty(Object.prototype, 'nodeId', nodeIdDescriptor);
      } else {
        delete Object.prototype.nodeId;
      }
      if (nodeAddressDescriptor) {
        // eslint-disable-next-line no-extend-native -- restore hostile fixture
        Object.defineProperty(
          Object.prototype,
          'nodeAddress',
          nodeAddressDescriptor,
        );
      } else {
        delete Object.prototype.nodeAddress;
      }
    }
    t.equal(seed.nodeConnections.has('forged-peer'), false,
      'inherited node identity cannot own a primary connection slot');
    t.equal(
      seed.getCurrentPrimaryConnectionBootIncarnation('forged-peer'),
      null,
      'inherited fields cannot mint current-primary boot authority',
    );
    t.equal(getterCalls, 0,
      'the IDENTIFY envelope owner never invokes prototype accessors');
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
  'an admitted adopted incoming primary replies once so the dialer binds ' +
    'the same bilateral boot identity without an IDENTIFY loop',
  async (t) => {
    initializeTestEnvironment();
    t.teardown(cleanupTestEnvironment);

    const acceptingRouter = new MessageRouter({
      nodeId: LOCAL_NODE_ID,
      advertisedAddress: 'ws://local-node:9998',
      bootIncarnation: 11,
    });
    await acceptingRouter.initialize({startServer: false});
    t.teardown(async () => {
      await acceptingRouter.shutdown().catch(() => {});
    });
    const acceptedWs = createTerminableWsStub();
    registerIncomingConnection(
      acceptingRouter,
      'incoming-bilateral',
      acceptedWs,
    );
    const replies = [];
    acceptingRouter.sendRaw = (_ws, message) => {
      replies.push(message);
      return true;
    };

    acceptingRouter.handleIdentification(
      'incoming-bilateral',
      acceptedWs,
      buildIdentifyMessage({bootIncarnation: 7}),
    );

    acceptingRouter.handleIdentification(
      'incoming-bilateral',
      acceptedWs,
      buildIdentifyMessage({bootIncarnation: 7}),
    );

    t.equal(replies.length, 1,
      'primary adoption emits exactly one reciprocal IDENTIFY across repeats');
    t.equal(replies[0].nodeId, LOCAL_NODE_ID);
    t.equal(replies[0].bootIncarnation, 11,
      'the reply carries the admitted primary owner boot');

    const dialingRouter = new MessageRouter({
      nodeId: REMOTE_NODE_ID,
      advertisedAddress: REMOTE_NODE_ADDRESS,
      bootIncarnation: 7,
    });
    await dialingRouter.initialize({startServer: false});
    t.teardown(async () => {
      await dialingRouter.shutdown().catch(() => {});
    });
    const outgoingWs = createTerminableWsStub();
    registerOutgoingPeerConnection(
      dialingRouter,
      LOCAL_NODE_ID,
      'outgoing-bilateral',
      outgoingWs,
    );
    let dialerReplyCount = 0;
    dialingRouter.sendRaw = () => {
      dialerReplyCount += 1;
      return true;
    };

    dialingRouter.handleIdentification(
      LOCAL_NODE_ID,
      outgoingWs,
      replies[0],
    );

    t.same(
      dialingRouter.getCurrentPrimaryConnectionBootIncarnation(LOCAL_NODE_ID),
      {
        nodeId: LOCAL_NODE_ID,
        bootIncarnation: 11,
        connectionId: 'outgoing-bilateral',
      },
      'the dialer binds the seed boot to its adopted outgoing primary slot',
    );
    t.equal(dialerReplyCount, 0,
      'the outgoing receive branch does not reply and cannot ping-pong');
    t.end();
  },
);

t.test(
  'rejected external, stale, and bulk IDENTIFY frames never receive a ' +
    'primary identity reply',
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
    let replyCount = 0;
    router.sendRaw = () => {
      replyCount += 1;
      return true;
    };

    router.setExternalAdmissionEnabled(false);
    const blockedWs = createTerminableWsStub();
    registerIncomingConnection(router, 'incoming-blocked', blockedWs);
    router.handleIdentification(
      'incoming-blocked',
      blockedWs,
      buildIdentifyMessage({bootIncarnation: 7}),
    );
    t.equal(blockedWs.closeCalled, true);

    router.setExternalAdmissionEnabled(true);
    router.nodeBootIncarnationWatermarks.set(REMOTE_NODE_ID, 9);
    const staleWs = createTerminableWsStub();
    registerIncomingConnection(router, 'incoming-stale-reply', staleWs);
    router.handleIdentification(
      'incoming-stale-reply',
      staleWs,
      buildIdentifyMessage({bootIncarnation: 7}),
    );
    t.equal(staleWs.terminateCalled, true);

    const bulkWs = createTerminableWsStub();
    registerIncomingConnection(router, 'incoming-bulk', bulkWs);
    router.handleIdentification(
      'incoming-bulk',
      bulkWs,
      {...buildIdentifyMessage({bootIncarnation: 10}), channel: 'bulk'},
    );
    t.equal(bulkWs.closeCalled, true);
    t.equal(replyCount, 0,
      'only an adopted primary can receive bilateral identity');
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

    router.handleIdentification(
      'incoming-duplicate',
      duplicateWs,
      buildIdentifyMessage({bootIncarnation: 5}),
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
    t.equal(router.nodeBootIncarnationWatermarks.get(REMOTE_NODE_ID), 5);
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
    let accessorEnvelope;
    let coerciveEnvelope;
    let primitiveEnvelope;
    let getterCalls = 0;
    const accessorMessage = {};
    Object.defineProperty(accessorMessage, 'bootIncarnation', {
      get() {
        getterCalls += 1;
        return 7;
      },
    });
    const accessorEnvelopeMessage = {
      nodeAddress: REMOTE_NODE_ADDRESS,
      bootIncarnation: 7,
    };
    Object.defineProperty(accessorEnvelopeMessage, 'nodeId', {
      get() {
        getterCalls += 1;
        return REMOTE_NODE_ID;
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
      accessorEnvelope = router.connectionAuthorityOwner
        .readIncomingIdentificationEnvelope(accessorEnvelopeMessage);
      coerciveEnvelope = router.connectionAuthorityOwner
        .readIncomingIdentificationEnvelope({
          nodeId: {},
          nodeAddress: {toString: () => REMOTE_NODE_ADDRESS},
          bootIncarnation: 7,
        });
      primitiveEnvelope = router.connectionAuthorityOwner
        .readIncomingIdentificationEnvelope(buildIdentifyMessage({
          bootIncarnation: 7,
        }));
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
    t.equal(accessorEnvelope, null,
      'accessor identity fields cannot mint a peer envelope');
    t.equal(coerciveEnvelope, null,
      'object coercion cannot mint peer node or address identity');
    t.same(primitiveEnvelope, {
      nodeId: REMOTE_NODE_ID,
      nodeAddress: REMOTE_NODE_ADDRESS,
      channel: null,
      bootIncarnation: 7,
    }, 'only the complete own primitive envelope becomes identity authority');
    t.equal(getterCalls, 0, 'the authority boundary never invokes accessors');
    t.end();
  },
);
