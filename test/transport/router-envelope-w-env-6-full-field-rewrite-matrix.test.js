// W-ENV-6 (Q6 stage 3b, design D4, finding F-D): no answer field can change
// any transport fact, and the delivery identity is the router's own.
//
// Property. For every transport field name F and every value v of a matrix of
// router-vocabulary and foreign values, a handler answer that carries F = v
// leaves the caller's transport facts equal to the transport facts of the
// same delivery whose handler answered an empty object, and the transport's
// messageId/correlationId equal the identity the caller sent (an answer's
// messageId never spoofs it). The answer itself reaches the caller verbatim,
// beside the transport and never merged into it. Measured on the three paths
// an answer travels: LOCAL dispatch, an identified SERVICE_RESPONSE, and a
// two-hop forward whose first hop answers with the onward hop's answer.
import {test} from '../../src/test-helpers/tap.js';
import {TRANSPORT_DELIVERY_OUTCOME_STATE} from
  '../../src/transport/transport-semantic-outcome.js';
import {
  answerOf,
  createRouterEnvelopeFixture,
  forwardingHandler,
  serviceAddress,
  transportFactsOf,
  transportIdentityOf,
} from './router-envelope-witness-fixture.js';

const NODE = Object.freeze({sender: 'wenv6-sender', hop: 'wenv6-hop',
  target: 'wenv6-target'});
const PATH = Object.freeze({LOCAL: 'LOCAL', SERVICE_RESPONSE: 'SERVICE_RESPONSE',
  TWO_HOP: 'TWO_HOP'});
// Every field of the router's transport outcome an answer could name.
const TRANSPORT_FIELDS = Object.freeze(['acknowledged', 'deliveryState', 'reasonCode',
  'error', 'errorCode', 'deferRetry', 'retryAfterMs', 'noHandler', 'messageId',
  'correlationId']);
const VALUES = Object.freeze([false, true, null, 0, 250, 'failed', 'delivered',
  'deferred', 'ROUTER_CONNECTION_CLOSED', 'ROUTER_NO_CONNECTION',
  'ROUTER_HANDLER_FAILED', 'no_handler', 'superseded', 'spoofed']);
const fixture = createRouterEnvelopeFixture(import.meta.url, NODE.sender);
const state = {reply: {}, routers: null, sequence: 0};
const ADDRESS = Object.freeze({
  reply: serviceAddress(NODE.target, 'wenv6-reply'),
  forwarder: serviceAddress(NODE.hop, 'wenv6-forwarder'),
});

async function setup(t) {
  await fixture.setup();
  t.teardown(() => fixture.teardown());
  const sender = await fixture.start(NODE.sender);
  const hop = await fixture.start(NODE.hop);
  const target = await fixture.start(NODE.target);
  target.router.register(ADDRESS.reply, () => state.reply);
  hop.router.register(ADDRESS.forwarder, forwardingHandler(hop.router));
  await fixture.connect(hop, target);
  await fixture.connect(sender, hop);
  state.routers = {sender: sender.router, hop: hop.router, target: target.router};
}

function deliverOn(path, message) {
  const {sender, hop, target} = state.routers;
  if (path === PATH.LOCAL) return target.deliver(ADDRESS.reply, message);
  if (path === PATH.SERVICE_RESPONSE) return hop.deliver(ADDRESS.reply, message);
  return sender.deliver(ADDRESS.forwarder,
    {...message, forwardTo: ADDRESS.reply, inner: {type: 'WENV6_INNER'}});
}

async function observe(path, reply) {
  state.reply = reply;
  state.sequence += 1;
  const messageId = `wenv6-${path}-${state.sequence}`;
  const delivery = await deliverOn(path, {messageId, type: 'WENV6'});
  return {delivery, messageId};
}

test('W-ENV-6 no answer field rewrites any transport fact or the identity',
  async (t) => {
    await setup(t);
    let size = 0;
    const violations = [];
    for (const path of Object.values(PATH)) {
      const empty = transportFactsOf((await observe(path, {})).delivery);
      t.equal(empty.deliveryState, TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED,
        `${path}: an empty answer is delivered`);
      for (const field of TRANSPORT_FIELDS) {
        for (const value of VALUES) {
          size += 1;
          const reply = {success: true, [field]: value};
          const {delivery, messageId} = await observe(path, reply);
          const facts = transportFactsOf(delivery);
          const identity = transportIdentityOf(delivery);
          const label = `${path} answer.${field}=${JSON.stringify(value)}`;
          if (JSON.stringify(facts) !== JSON.stringify(empty)) {
            violations.push(`${label}: facts ${JSON.stringify(facts)}`);
          }
          if (identity.messageId !== messageId || identity.correlationId !== messageId ||
              identity.error !== null) {
            violations.push(`${label}: identity ${JSON.stringify(identity)}`);
          }
          if (JSON.stringify(answerOf(delivery)) !== JSON.stringify(reply)) {
            violations.push(`${label}: answer ${JSON.stringify(answerOf(delivery))}`);
          }
        }
      }
    }
    t.equal(size, 3 * TRANSPORT_FIELDS.length * VALUES.length,
      'the whole matrix was delivered');
    t.same(violations, [], 'no answer field rewrote the transport, the identity ' +
      'or itself');
  });

test('W-ENV-6 F-D: an answer messageId never replaces the router identity',
  async (t) => {
    await setup(t);
    for (const path of Object.values(PATH)) {
      const {delivery, messageId} = await observe(path,
        {messageId: 'spoofed-message', correlationId: 'spoofed-correlation'});
      t.same({messageId: transportIdentityOf(delivery).messageId,
        correlationId: transportIdentityOf(delivery).correlationId},
      {messageId, correlationId: messageId},
      `${path}: the transport identity is the one the caller sent`);
      t.same({messageId: answerOf(delivery)?.messageId,
        correlationId: answerOf(delivery)?.correlationId},
      {messageId: 'spoofed-message', correlationId: 'spoofed-correlation'},
      `${path}: the answer keeps its own fields, in its own namespace`);
    }
  });
