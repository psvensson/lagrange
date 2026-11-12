// A message group's direct delivery meets a transport failure at the router
// port (defect class C, 2026-11-11 transport-classification unit).
//
// The direct-delivery loop re-sends one message under one messageId, and no
// receiver dedupes a message by that id: its re-send is not identity-keyed.
// So, from the transport's one delivery-failure decision: a NOT_SENT failure
// (connect timeout, no frame left) is re-sent and the message is delivered
// once the transport answers; an AMBIGUOUS one (an ACK timeout after the frame
// left) and a REJECTED one (the target handler threw, a negative ACK) end the
// loop with that typed outcome - the persisted path owns any later delivery.
// Driven from the replica's direct-delivery owner (attemptDirectDelivery,
// the loop sendMessage runs), the fault injected at the transport port with
// the router's real codes, texts and acknowledgement facts.
import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {MessageGroupService} from
  '../../src/message-group/message-group-service.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {TRANSPORT_ERROR_MSG} from '../../src/constants/transport.js';
import {withTestDbPath} from '../test-helpers/message-group-db-path.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {
  ROUTER_HANDLER_FAILED_ERROR_CODE,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
  WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
} from '../../src/transport/transport-error-codes.js';
import {
  TRANSPORT_ACKNOWLEDGEMENT,
  buildDeliveryEnvelope,
  deliveryTransportOf,
  isDeliveredTransportDeliveryOutcome,
} from '../../src/transport/transport-semantic-outcome.js';
import {
  TRANSPORT_DELIVERY_FAILURE,
  classifyTransportDeliveryFailure,
} from '../../src/transport/transport-delivery-failure.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'mg-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

const FAULTS = Object.freeze({
  connectTimeout: () => buildDeliveryEnvelope({
    errorCode: WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
    error: 'WebSocket connection timeout after 2000ms',
    acknowledgement: TRANSPORT_ACKNOWLEDGEMENT.NOT_SENT}),
  ackTimeoutAfterSend: () => buildDeliveryEnvelope({
    errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
    error: TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT,
    acknowledgement: TRANSPORT_ACKNOWLEDGEMENT.UNACKNOWLEDGED}),
  handlerFailed: () => buildDeliveryEnvelope({
    errorCode: ROUTER_HANDLER_FAILED_ERROR_CODE, error: 'handler threw',
    acknowledgement: TRANSPORT_ACKNOWLEDGEMENT.ACKNOWLEDGED}),
  negativeAck: () => buildDeliveryEnvelope({
    acknowledgement: TRANSPORT_ACKNOWLEDGEMENT.REJECTED,
    error: 'refused'}),
});

function replicaWithFaultedPort(fault, faultCount) {
  const port = {deliveries: []};
  // The real router, its deliver port faulted (never initialized: no
  // socket is opened).
  const transport = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: 'mg-node', wsPort: 0});
  transport.deliver = async (targetService, message) => {
    port.deliveries.push(message.messageId);
    return port.deliveries.length <= faultCount ? fault() :
      buildDeliveryEnvelope({acknowledged: true}, {success: true});
  };
  const service = new MessageGroupService(withTestDbPath({groupId: 'mg-d',
    replicaId: 'mg-d-r1', nodeId: 'mg-node', transport}));
  service.retryMaxAttempts = 4;
  service.sleep = async () => {};
  return {service, port};
}

const envelope = () => ({id: 'm-1', targetService: 'n2/svc/a',
  payload: {type: 'APP_EVENT', data: 'x'}, attempts: 0, createdAt: 0});

test('not sent: a connect timeout is re-sent and the message delivered',
  async (t) => {
    const {service, port} = replicaWithFaultedPort(FAULTS.connectTimeout, 1);
    const delivery = await service.attemptDirectDelivery(envelope());
    t.equal(port.deliveries.length, 2, 'the refusal was re-sent once');
    t.ok(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(delivery)),
      'the resumed work: delivered');
  });

for (const [name, expected] of [
  ['ackTimeoutAfterSend', TRANSPORT_DELIVERY_FAILURE.AMBIGUOUS],
  ['handlerFailed', TRANSPORT_DELIVERY_FAILURE.REJECTED],
  ['negativeAck', TRANSPORT_DELIVERY_FAILURE.REJECTED],
]) {
  test(`${expected} (${name}): never re-sent without an identity the ` +
    'target dedupes on; the typed outcome is returned', async (t) => {
    const {service, port} = replicaWithFaultedPort(FAULTS[name], 9);
    const delivery = await service.attemptDirectDelivery(envelope());
    t.equal(port.deliveries.length, 1, 'one delivery, no re-send');
    t.equal(classifyTransportDeliveryFailure(delivery), expected,
      'the caller receives the transport\'s named outcome');
  });
}
