// A joining node's CONNECTED publication meets a transport failure at the
// router port (defect class C, 2026-11-11 transport-classification unit).
//
// The transport's one delivery-failure decision names what each failure
// means for a re-send (transport-delivery-failure.js). The publication owner
// re-sends a NOT_SENT failure (backpressure, query transport not ready,
// connect timeout: no frame left) and the node's state is published once the
// transport answers. An AMBIGUOUS failure (an answer timeout after the
// receiver applied it) is re-sent under the publication's identity: the
// publisher's own row (nodeId) under its boot incarnation, assigned the same
// state; the receiver's CAS publication makes the re-send that same
// assignment. A REJECTED failure (the receiver's handler threw) is never
// re-sent. Each case pairs the refusal with the resumed work, from the
// production entry point (NodeJoiningService.sendControlPlaneNodeStateUpdate
// -> NodeStatePublicationOwner -> messageRouter.deliver), with the fault
// injected at the router port using the router's real codes and texts.

import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from
  '../../src/bootstrap/node-joining-service.js';
import {MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy} from
  '../../src/bootstrap/message-group-assignment.js';
import {initializeTestEnvironment} from
  './node-joining-service-test-support.js';
import {OWNER_CONTRACT_STATE} from
  '../../src/control-plane/owner-contract-outcome.js';
import {ROUTER_ERROR_MSG} from '../../src/constants/transport.js';
import {
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  ROUTER_HANDLER_FAILED_ERROR_CODE,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
  ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
  WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
} from '../../src/transport/transport-error-codes.js';
import {
  TRANSPORT_ACKNOWLEDGEMENT,
  buildDeliveryEnvelope,
} from '../../src/transport/transport-semantic-outcome.js';
import {
  TRANSPORT_DELIVERY_FAILURE,
  classifyTransportDeliveryFailure,
} from '../../src/transport/transport-delivery-failure.js';

const NODE_ID = 'joining-node-t';
const TARGET = `${NODE_ID}/message-group/mg-1-r2`;
const RECEIVER_ANSWER = Object.freeze({
  completionKind: 'durable_state_publication',
  completionCompleted: true,
});

// The router's failed deliveries, with the codes, texts and ACK facts its
// catch path records (message-router-delivery-behaviors.js deliver()).
const NOT_SENT_FAULTS = Object.freeze({
  'backpressure': () => buildDeliveryEnvelope({
    errorCode: OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
    error: ROUTER_ERROR_MSG.outboundQueueBackpressured('seed-node-1', 256),
    deferRetry: true, retryAfterMs: 1,
    acknowledgement: TRANSPORT_ACKNOWLEDGEMENT.NOT_SENT}),
  'query transport not ready': () => buildDeliveryEnvelope({
    errorCode: ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
    error: ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED,
    acknowledgement: TRANSPORT_ACKNOWLEDGEMENT.NOT_SENT}),
  'connect timeout': () => buildDeliveryEnvelope({
    errorCode: WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
    error: 'WebSocket connection timeout after 2000ms',
    acknowledgement: TRANSPORT_ACKNOWLEDGEMENT.NOT_SENT}),
});

function answerTimeout() {
  return buildDeliveryEnvelope({errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
    error: ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT, deferRetry: true,
    acknowledgement: TRANSPORT_ACKNOWLEDGEMENT.ACKNOWLEDGED});
}

function handlerFailed() {
  return buildDeliveryEnvelope({errorCode: ROUTER_HANDLER_FAILED_ERROR_CODE,
    error: 'publication handler threw',
    acknowledgement: TRANSPORT_ACKNOWLEDGEMENT.ACKNOWLEDGED});
}

// The joining node with one local control-plane ingress, its router port
// faulted for the first `faultCount` deliveries. `applied` records each
// publication the receiver applied (an ambiguous fault applies first).
function joiningNode({fault, faultCount = 1, appliesBeforeFault = false}) {
  initializeTestEnvironment();
  const service = new NodeJoiningService({bootIncarnation: 7, nodeId: NODE_ID,
    nodeAddress: 'ws://localhost:9093',
    seedNodeAddress: 'http://localhost:8080', sleep: async () => {}});
  service.seedNodeId = 'seed-node-1';
  service.bootstrapResponse = {seedNodeId: 'seed-node-1',
    messageGroupAssignment: {strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
      groupId: 'mg-1', replicaToMove: 'mg-1-r1',
      peerAddresses: ['seed-node-1/message-group/mg-1-r1']}};
  const port = {deliveries: [], applied: [], faults: []};
  service.messageRouter = {
    getConnectionState: () => 'connected',
    async deliver(targetAddress, message) {
      port.deliveries.push({targetAddress, ...message});
      if (port.deliveries.length <= faultCount) {
        if (appliesBeforeFault) port.applied.push(message);
        const failed = fault();
        port.faults.push(classifyTransportDeliveryFailure(failed));
        return failed;
      }
      port.applied.push(message);
      return buildDeliveryEnvelope({acknowledged: true}, RECEIVER_ANSWER);
    },
  };
  service.messageGroupServices.set('mg-1-r2', {groupId: 'mg-1',
    unifiedAddress: TARGET, isLeaderReplica: () => true,
    getLeaderId: () => 'mg-1-r2', isMetadataIngressReady: () => true});
  return {service, port};
}

const publishConnected = (service) => service.sendControlPlaneNodeStateUpdate(
  {state: 'connected', capabilities: {pgwire: true}});

for (const [name, fault] of Object.entries(NOT_SENT_FAULTS)) {
  test(`not sent (${name}): the CONNECTED publication is re-sent and the ` +
    'node state is published once the transport answers', async (t) => {
    const {service, port} = joiningNode({fault});
    const outcome = await publishConnected(service);
    t.same(port.faults, [TRANSPORT_DELIVERY_FAILURE.NOT_SENT],
      'the refusal: the first delivery left no frame');
    t.equal(port.deliveries.length, 2, 'the publication was re-sent');
    t.equal(outcome.contractState, OWNER_CONTRACT_STATE.READY,
      'the resumed work: the publication is answered');
    t.same(port.applied.map((message) => message.state), ['connected'],
      'the receiver applied the CONNECTED state once');
  });
}

test('ambiguous: an answer timeout after the receiver applied the ' +
  'publication is re-sent under its identity and answered', async (t) => {
  const {service, port} = joiningNode({fault: answerTimeout,
    appliesBeforeFault: true});
  const outcome = await publishConnected(service);
  t.same(port.faults, [TRANSPORT_DELIVERY_FAILURE.AMBIGUOUS],
    'the refusal: the answer was lost after the receiver accepted it');
  t.equal(port.deliveries.length, 2, 'the publication was re-sent');
  const identity = (message) => [message.nodeId, message.bootIncarnation,
    message.state];
  t.same(identity(port.deliveries[1]), identity(port.deliveries[0]),
    'the re-send is the same assignment: one node, one boot, one state');
  t.equal(outcome.contractState, OWNER_CONTRACT_STATE.READY,
    'the resumed work: the publication is answered');
});

test('rejected: a receiver whose handler threw is never re-sent, and the ' +
  'join phase is told it is not a retryable publication', async (t) => {
  const {service, port} = joiningNode({fault: handlerFailed, faultCount: 9});
  let thrown = null;
  await publishConnected(service).catch((error) => {
    thrown = error;
  });
  t.ok(thrown, 'the refusal surfaces');
  t.equal(port.deliveries.length, 1, 'no re-send of a rejected publication');
  t.equal(service.shouldRetryControlPlaneNodeStateUpdate(
    thrown.cause || thrown), false, 'the connect phase does not defer it');
});

test('the connect phase defers a CONNECTED publication that ran out of ' +
  'targets on a not-sent failure (it is published later)', async (t) => {
  const {service, port} = joiningNode({fault: NOT_SENT_FAULTS.backpressure,
    faultCount: 9});
  let thrown = null;
  await publishConnected(service).catch((error) => {
    thrown = error;
  });
  t.ok(thrown, 'the spent publication surfaces');
  t.ok(port.deliveries.length >= 2, 'it was re-sent within its budget');
  t.equal(service.shouldRetryControlPlaneNodeStateUpdate(
    thrown.cause || thrown), true,
  'the join phase reads it as a retryable publication, not a join failure');
});
