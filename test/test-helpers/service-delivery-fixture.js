/** Actual router identification and service dispatch over in-process sockets.
 * The endpoint and frame transport are fixture physics; no connection records,
 * boot watermarks or delivery-context predicates are fabricated.
 */
import assert from 'node:assert/strict';
import {MessageRouter} from '../../src/transport/message-router.js';
import {createInProcWebSocketPair} from '../../src/transport/inproc-transport.js';
import {ROUTER_MESSAGE_TYPE, TRANSPORT_EVENT} from '../../src/constants/transport.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

async function createServiceDeliveryFixture(t, nodeId, bootIncarnation = 1) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: nodeId}, logging: {level: 'error'}});
  LoggingService.getInstance().initialize({level: 'error'});
  const router = new MessageRouter({nodeId, bootIncarnation});
  await router.initialize({startServer: false});
  t.after(async () => {
    await router.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  const address = `${nodeId}/message-group/delivery-witness`;
  const sockets = new Map();
  let sequence = 0;
  const capture = () => {
    const deferred = Promise.withResolvers();
    router.register(address, (envelope, delivery) => {
      deferred.resolve({envelope, delivery});
      return {accepted: true};
    });
    return deferred.promise;
  };
  return {
    router,
    async local() {
      const received = capture();
      await router.deliverLocal(address, `local-${sequence++}`, {probe: true}, null);
      return (await received).delivery;
    },
    async remote(senderNodeId, senderBootIncarnation = 1, claimedSource = senderNodeId) {
      const pair = createInProcWebSocketPair();
      sockets.set(senderNodeId, pair);
      t.after(() => pair.a.terminate());
      const identified = Promise.withResolvers();
      const onMessage = (data) => {
        if (JSON.parse(data.toString()).type === ROUTER_MESSAGE_TYPE.IDENTIFY) {
          pair.a.removeListener(TRANSPORT_EVENT.MESSAGE, onMessage);
          identified.resolve();
        }
      };
      pair.a.on(TRANSPORT_EVENT.MESSAGE, onMessage);
      router.handleIncomingConnection(pair.b, null);
      pair.a.send(JSON.stringify({type: ROUTER_MESSAGE_TYPE.IDENTIFY,
        nodeId: senderNodeId, nodeAddress: `ws://${senderNodeId}:9999`,
        bootIncarnation: senderBootIncarnation}));
      await identified.promise;
      assert.equal(router.nodeConnections.get(senderNodeId)?.ws, pair.b,
        'real identification must adopt the supplied physical socket');
      const received = capture();
      pair.a.send(JSON.stringify({type: ROUTER_MESSAGE_TYPE.SERVICE_MESSAGE,
        messageId: `remote-${sequence++}`, targetAddress: address,
        sourceNodeId: claimedSource, payload: {probe: true}}));
      return (await received).delivery;
    },
    async closeRemote(senderNodeId) {
      const socket = sockets.get(senderNodeId)?.a;
      assert.ok(socket, 'a real identified socket must exist before closing');
      const closed = Promise.withResolvers();
      socket.once(TRANSPORT_EVENT.CLOSE, closed.resolve);
      socket.terminate();
      await closed.promise;
      // Both sides emit their already-scheduled close events before returning.
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}
export {createServiceDeliveryFixture};
