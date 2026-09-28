/**
 * MessageGroupService application ingress through the node transport.
 *
 * `sendMessage` hands the transport one message-group application envelope
 * `{messageId, payload, sourceGroup, sourceReplica}`; the node MessageRouter
 * wraps whatever it is given in its own routing envelope. The receiving
 * replica's ingress must therefore hand its application layer the same
 * shape for a forwarded control message as for a raw router delivery, so the
 * typed completion owner answers both. Raft packets keep their own path.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  createTestTransport,
  registerMessageGroupServiceLifecycleHooks,
  setTestPortBase,
} from './message-group-service-test-support.js';
import {
  MessageGroupService,
} from '../../src/message-group/message-group-service.js';
import {
  CONTROL_PLANE_MESSAGE_COMPLETION_KIND,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {RAFT_PACKET_TYPE} from '../../src/raft/constants.js';
import {ADDRESS, ENTITY_TYPE} from '../../src/constants/index.js';

setTestPortBase(25600);
registerMessageGroupServiceLifecycleHooks();

const GROUP_ID = 'mg-ingress-witness';
const SENDER_REPLICA_ID = 'mg-ingress-witness-r2';
const RECEIVER_REPLICA_ID = 'mg-ingress-witness-r1';
const JOINER_NODE_ID = 'node-ingress-witness-joiner';

function buildNodeStateUpdate(marker) {
  return {
    type: ControlPlaneMessageType.NODE_STATE_UPDATE,
    nodeId: JOINER_NODE_ID,
    marker,
  };
}

async function createWitnessPair(t) {
  const {router, nodeId, cleanup} = await createTestTransport();
  const sender = new MessageGroupService({
    groupId: GROUP_ID,
    replicaId: SENDER_REPLICA_ID,
    nodeId,
    transport: router,
  });
  const receiver = new MessageGroupService({
    groupId: GROUP_ID,
    replicaId: RECEIVER_REPLICA_ID,
    nodeId,
    transport: router,
  });
  t.teardown(async () => {
    await sender.shutdown();
    await receiver.shutdown();
    await cleanup();
  });
  await sender.initialize();
  await receiver.initialize();
  const receiverAddress = `${nodeId}${ADDRESS.SEPARATOR}` +
    `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${RECEIVER_REPLICA_ID}`;
  router.register(receiverAddress, (envelope) => {
    return receiver.receiveMessage(envelope);
  });
  const completedEvents = [];
  receiver.registerApplicationMessageCompletionHandler(
    [ControlPlaneMessageType.NODE_STATE_UPDATE],
    async (applicationEvent) => {
      completedEvents.push(applicationEvent);
      return {
        completionKind:
          CONTROL_PLANE_MESSAGE_COMPLETION_KIND.DURABLE_STATE_PUBLICATION,
        completionCompleted: true,
      };
    },
  );
  const unownedEvents = [];
  receiver.on('messageReceived', (event) => {
    unownedEvents.push(event);
  });
  return {
    router,
    sender,
    receiver,
    receiverAddress,
    completedEvents,
    unownedEvents,
  };
}

test('forwarded control message reaches the same completion owner as a ' +
  'raw router delivery', async (t) => {
  const {
    router,
    sender,
    receiverAddress,
    completedEvents,
    unownedEvents,
  } = await createWitnessPair(t);

  const forwardedPayload = buildNodeStateUpdate('forwarded');
  const forwarded = await sender.sendMessage(
    receiverAddress,
    forwardedPayload,
  );
  t.equal(
    forwarded.completionKind,
    CONTROL_PLANE_MESSAGE_COMPLETION_KIND.DURABLE_STATE_PUBLICATION,
    'the sender sees the completion kind the receiving owner produced',
  );
  t.equal(
    forwarded.completionCompleted,
    true,
    'the sender sees the receiving owner completed the publication',
  );
  t.equal(completedEvents.length, 1, 'the completion owner ran once');
  t.same(
    completedEvents[0],
    {
      messageId: forwarded.messageId,
      payload: forwardedPayload,
      sourceGroup: GROUP_ID,
      sourceReplica: SENDER_REPLICA_ID,
    },
    'the application layer sees exactly the message-group envelope',
  );
  t.equal(unownedEvents.length, 0, 'nothing leaked to the unowned lane');

  const rawPayload = buildNodeStateUpdate('raw');
  const raw = await router.deliver(receiverAddress, rawPayload);
  t.equal(
    raw.completionKind,
    CONTROL_PLANE_MESSAGE_COMPLETION_KIND.DURABLE_STATE_PUBLICATION,
    'a raw router delivery still reaches the completion owner',
  );
  t.equal(completedEvents.length, 2, 'the raw delivery completed once');
  t.same(
    completedEvents[1].payload,
    rawPayload,
    'the raw delivery keeps its payload unchanged',
  );

  const replay = await router.deliver(receiverAddress, {
    messageId: forwarded.messageId,
    payload: forwardedPayload,
    sourceGroup: GROUP_ID,
    sourceReplica: SENDER_REPLICA_ID,
  });
  t.equal(completedEvents.length, 3, 'the redelivery completed once');
  t.equal(
    completedEvents[2].messageId,
    forwarded.messageId,
    'the message-group messageId is the application identity',
  );
  t.equal(replay.completionCompleted, true, 'redelivery completes again');
});

test('ingress unwraps exactly one structural message-group envelope',
  async (t) => {
    const {
      router,
      receiverAddress,
      completedEvents,
      unownedEvents,
    } = await createWitnessPair(t);

    await router.deliver(receiverAddress, {
      type: 'UNRELATED_CONTROL',
      payload: buildNodeStateUpdate('typed-outer'),
    });
    await router.deliver(receiverAddress, {
      messageId: 'mg-near-envelope',
      payload: buildNodeStateUpdate('extra-field'),
      sourceGroup: GROUP_ID,
      sourceReplica: SENDER_REPLICA_ID,
      extra: true,
    });
    await router.deliver(receiverAddress, {
      messageId: 'mg-outer-envelope',
      payload: {
        messageId: 'mg-inner-envelope',
        payload: buildNodeStateUpdate('two-levels'),
        sourceGroup: GROUP_ID,
        sourceReplica: SENDER_REPLICA_ID,
      },
      sourceGroup: GROUP_ID,
      sourceReplica: SENDER_REPLICA_ID,
    });
    t.equal(
      completedEvents.length,
      0,
      'only an exact single envelope selects the inner completion owner',
    );
    t.equal(unownedEvents.length, 3, 'each non-envelope stays unowned');
  });

test('a Raft packet through the router keeps the Raft path', async (t) => {
  const {
    router,
    receiver,
    receiverAddress,
    completedEvents,
    unownedEvents,
  } = await createWitnessPair(t);
  const raftPackets = [];
  const liveRaftRuntime = receiver.raftRuntime;
  receiver.raftRuntime = {
    handleRaftPacket(message) {
      raftPackets.push(message);
      return {acknowledged: true};
    },
  };
  const packet = {
    type: RAFT_PACKET_TYPE.APPEND,
    term: 1,
    address: `node-other${ADDRESS.SEPARATOR}${ENTITY_TYPE.MESSAGE_GROUP}` +
      `${ADDRESS.SEPARATOR}mg-ingress-witness-r3`,
  };
  try {
    await router.deliver(receiverAddress, packet);
  } finally {
    receiver.raftRuntime = liveRaftRuntime;
  }
  t.equal(raftPackets.length, 1, 'the Raft runtime received the packet');
  t.same(raftPackets[0].payload, packet, 'the packet is unchanged');
  t.equal(completedEvents.length, 0, 'no application completion ran');
  t.equal(unownedEvents.length, 0, 'no application event was emitted');
});
