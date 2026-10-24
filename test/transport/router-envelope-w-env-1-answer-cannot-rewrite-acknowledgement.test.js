// W-ENV-1 (Q6 stage 1, decision D2): an answer cannot change the transport
// outcome through the router's acknowledgement.
//
// Property. For a handler answer A that carries an `acknowledged` value, the
// transport facts the delivery caller receives (owner classification of the
// router result) equal the transport facts of the same delivery whose handler
// answered an empty object. Measured on the three paths an answer travels:
// LOCAL dispatch, an identified SERVICE_RESPONSE, and a two-hop forward whose
// first hop returns the second hop's result inside the message-group CDC
// wrapper. The F-B instance is the real message-group application ingress,
// whose ordinary answer is "received, application acknowledgement pending":
// it must reach the caller DELIVERED with that answer intact.
//
// Scope note: this stage makes `acknowledged` router-owned. The other owner
// metadata fields an answer can still supply in the flat shape (deferRetry,
// errorCode, noHandler, deliveryState, reasonCode, retryAfterMs) are pinned as
// preserved by the approved C2 witnesses until the envelope cutover restates
// them (design section 4.2); they join this property at that stage.
import {test} from '../../src/test-helpers/tap.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {MESSAGE_GROUP_APPLICATION_STATUS} from '../../src/message-group/constants.js';
import {buildLatencyCdcPropagationResult} from
  '../../src/message-group/message-group-service-runtime-support.js';
import {registerMessageGroupTransportHandler} from
  '../../src/bootstrap/shared/message-group-transport-handler.js';
import {CONTROL_PLANE_MESSAGE_COMPLETION_KIND, ControlPlaneMessageType} from
  '../../src/control-plane/control-plane-constants.js';
import {TRANSPORT_DELIVERY_OUTCOME_STATE} from
  '../../src/transport/transport-semantic-outcome.js';
import {withTestDbPath} from '../test-helpers/message-group-db-path.js';
import {
  createRouterEnvelopeFixture,
  serviceAddress,
  transportFactsOf,
} from './router-envelope-witness-fixture.js';

const NODE = Object.freeze({sender: 'wenv1-sender', hop: 'wenv1-hop',
  target: 'wenv1-target'});
const PATH = Object.freeze({LOCAL: 'LOCAL', SERVICE_RESPONSE: 'SERVICE_RESPONSE',
  TWO_HOP: 'TWO_HOP'});
const ACKNOWLEDGED_VALUES = Object.freeze([false, true, 0, 1, null, '', 'yes', 'false']);
const BASES = Object.freeze({EMPTY: {}, SUCCESS: {success: true},
  REFUSAL: {success: false, error: 'domain refusal'}});
const APPLICATION_TYPE = 'WENV1_ORDINARY_APPLICATION_MESSAGE';
const fixture = createRouterEnvelopeFixture(import.meta.url, NODE.sender);
const state = {reply: {}, routers: null, mg: null};
const ADDRESS = Object.freeze({
  reply: serviceAddress(NODE.target, 'wenv1-reply'),
  mg: serviceAddress(NODE.target, 'wenv1-mg-replica'),
  forwarder: serviceAddress(NODE.hop, 'wenv1-forwarder'),
});

async function setup(t) {
  await fixture.setup();
  t.teardown(async () => {
    await state.mg?.shutdown();
    await fixture.teardown();
  });
  const sender = await fixture.start(NODE.sender);
  const hop = await fixture.start(NODE.hop);
  const target = await fixture.start(NODE.target);
  target.router.register(ADDRESS.reply, () => state.reply);
  // The first hop forwards to the second through the message-group CDC
  // wrapper, the wrapper the MG forwarder's answer travels in.
  hop.router.register(ADDRESS.forwarder, async (envelope) =>
    buildLatencyCdcPropagationResult(await hop.router.deliver(
      envelope.payload.forwardTo, envelope.payload.inner)));
  await fixture.connect(hop, target);
  await fixture.connect(sender, hop);
  const mg = new MessageGroupService(withTestDbPath({groupId: 'wenv1-mg',
    replicaId: 'wenv1-mg-r1', nodeId: NODE.target, transport: target.router}));
  await mg.initialize();
  state.mg = mg;
  registerMessageGroupTransportHandler(mg, {messageRouter: target.router,
    address: ADDRESS.mg});
  mg.registerApplicationMessageCompletionHandler(
    [ControlPlaneMessageType.NODE_STATE_UPDATE],
    async () => ({completionKind:
      CONTROL_PLANE_MESSAGE_COMPLETION_KIND.DURABLE_STATE_PUBLICATION,
    completionCompleted: true}));
  state.routers = {sender: sender.router, hop: hop.router, target: target.router};
}

function deliverOn(path, address, message) {
  const {sender, hop, target} = state.routers;
  if (path === PATH.LOCAL) return target.deliver(address, message);
  if (path === PATH.SERVICE_RESPONSE) return hop.deliver(address, message);
  return sender.deliver(ADDRESS.forwarder, {forwardTo: address, inner: message});
}

async function factsOf(path, reply) {
  state.reply = reply;
  return transportFactsOf(await deliverOn(path, ADDRESS.reply, {type: 'WENV1'}));
}

test('W-ENV-1 an answer acknowledged value never changes the transport facts',
  async (t) => {
    await setup(t);
    let size = 0;
    const violations = [];
    for (const path of Object.values(PATH)) {
      const empty = await factsOf(path, {});
      t.equal(empty.deliveryState, TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED,
        `${path}: an empty answer is delivered`);
      for (const [base, value] of Object.entries(BASES)) {
        for (const acknowledged of ACKNOWLEDGED_VALUES) {
          size += 1;
          const facts = await factsOf(path, {...value, acknowledged});
          if (JSON.stringify(facts) !== JSON.stringify(empty)) {
            violations.push(`${path} ${base} acknowledged=${JSON.stringify(acknowledged)}: ` +
              `${JSON.stringify(facts)} != ${JSON.stringify(empty)}`);
          }
        }
      }
    }
    t.equal(size, 3 * 3 * ACKNOWLEDGED_VALUES.length, 'the whole matrix was delivered');
    t.same(violations, [], 'no answer acknowledged value rewrote the transport');
  });

test('W-ENV-1 F-B: the message-group application answer is delivered intact',
  async (t) => {
    await setup(t);
    for (const path of Object.values(PATH)) {
      const ordinary = await deliverOn(path, ADDRESS.mg, {type: APPLICATION_TYPE});
      t.equal(transportFactsOf(ordinary).deliveryState,
        TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED,
        `${path}: an ordinary MG application message is transport-delivered`);
      t.equal(ordinary.status, MESSAGE_GROUP_APPLICATION_STATUS.RECEIVED,
        `${path}: the MG answer status reaches the caller`);
      t.equal(ordinary.applicationAcknowledged, false,
        `${path}: the MG application acknowledgement stays MG's own pending fact`);
      const completed = await deliverOn(path, ADDRESS.mg,
        {type: ControlPlaneMessageType.NODE_STATE_UPDATE});
      t.equal(transportFactsOf(completed).deliveryState,
        TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED,
        `${path}: a completed control-plane message is transport-delivered`);
      t.same({kind: completed.completionKind, completed: completed.completionCompleted},
        {kind: CONTROL_PLANE_MESSAGE_COMPLETION_KIND.DURABLE_STATE_PUBLICATION,
          completed: true},
        `${path}: the application completion reaches the caller intact`);
    }
  });
