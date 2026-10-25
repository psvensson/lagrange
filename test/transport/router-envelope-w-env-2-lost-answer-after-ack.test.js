import {isRetryableManagedSplitExecutionFailure} from '../../src/partition/managed-split-retry-policy.js';
import {PartitionService} from '../../src/partition/partition-service.js';
// W-ENV-2 (Q6 stage 1, finding F-A): a lost answer after the ACK is not
// DELIVERED.
//
// Property. When the target router ACKs a service message and the connection
// closes before its SERVICE_RESPONSE arrives, the caller's transport outcome
// is the router's own connection-closed deferral (DEFERRED, reasonCode
// connection_closed, the router error code kept), never DELIVERED with no
// answer. The "answer may be lost" reader of a source START keeps its
// meaning: the closed-after-ACK delivery is refused and marked a loss
// candidate instead of being taken as a processed START.
import {test} from '../../src/test-helpers/tap.js';
import {createPartitionServiceMergeReplicationMethods} from
  '../../src/partition/partition-service-merge-replication-methods.js';
import {ConnectionState} from '../../src/transport/message-router.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  TRANSPORT_DELIVERY_OUTCOME_STATE,
} from '../../src/transport/transport-semantic-outcome.js';
import {ROUTER_CONNECTION_CLOSED_ERROR_CODE} from
  '../../src/transport/transport-error-codes.js';
import {
  deliverProcessedSourceReplicationStart,
  startSourceReplicationWithConfirmation,
  sourceReplicationStartAnswerMayBeLost,
} from '../../src/partition/managed-source-replication-start-delivery.js';
import {
  createRouterEnvelopeFixture,
  serviceAddress,
  settleUntil,
  transportFactsOf,
} from './router-envelope-witness-fixture.js';

const NODE = Object.freeze({sender: 'wenv2-sender', target: 'wenv2-target'});
const ADDRESS = serviceAddress(NODE.target, 'wenv2-held-answer');
const FALLBACK = 'wenv2 source start fallback';

async function heldAnswerPair(t) {
  const fixture = createRouterEnvelopeFixture(import.meta.url, NODE.sender);
  await fixture.setup();
  const held = [];
  t.teardown(async () => {
    for (const release of held.splice(0)) release({success: true});
    await fixture.teardown();
  });
  const sender = await fixture.start(NODE.sender);
  const target = await fixture.start(NODE.target);
  let invocations = 0;
  // The handler is engaged (its ACK already sent) and holds its answer.
  target.router.register(ADDRESS, () => new Promise((resolve) => {
    invocations += 1;
    held.push(resolve);
  }));
  await fixture.connect(sender, target);
  return {
    sender: sender.router,
    invocations: () => invocations,
    // Close the sender's connection once the ACK settled and only the
    // SERVICE_RESPONSE waiter remains.
    async closeAfterAck(expectedInvocations) {
      await settleUntil(t, () => invocations === expectedInvocations &&
        sender.router.pendingMessages.size === 0 &&
        sender.router.pendingResponses.size === 1, 'ACK received, answer pending');
      sender.router.nodeConnections.get(NODE.target).ws.terminate();
    },
  };
}

test('W-ENV-2 a connection closed after the ACK is the router deferral', async (t) => {
  const pair = await heldAnswerPair(t);
  const delivery = pair.sender.deliver(ADDRESS, {type: 'WENV2'});
  await pair.closeAfterAck(1);
  const facts = transportFactsOf(await delivery);
  t.not(facts.deliveryState, TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED,
    'a lost answer after the ACK is never DELIVERED');
  t.same({deliveryState: facts.deliveryState, reasonCode: facts.reasonCode,
    errorCode: facts.errorCode},
  {deliveryState: TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED,
    reasonCode: TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.CONNECTION_CLOSED,
    errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE},
  'the router connection-closed deferral survives the response waiter');
});

test('W-ENV-2 a source START whose answer was lost after the ACK is a loss candidate',
  async (t) => {
    const pair = await heldAnswerPair(t);
    const start = deliverProcessedSourceReplicationStart(pair.sender, ADDRESS,
      {type: 'WENV2_START'}, FALLBACK).then(
      (processed) => ({processed}), (error) => ({error}));
    await pair.closeAfterAck(1);
    const settled = await start;
    t.equal(settled.processed, undefined,
      'a START with no answer is not taken as processed');
    t.equal(sourceReplicationStartAnswerMayBeLost(settled.error), true,
      'the START reader marks the closed-after-ACK delivery a loss candidate');
  });

for (const family of ['split', 'merge']) {
  for (const afterAdmission of [false, true]) {
    test(`independent Q6: forwarded ${family} START keeps its confirmation obligation (afterAdmission=${afterAdmission})`,
      async (t) => {
        const fixture = createRouterEnvelopeFixture(import.meta.url, 'review-start-source');
        await fixture.setup();
        let release = () => {};
        t.teardown(async () => {
          release({success: true}); await fixture.teardown();
        });
        const source = await fixture.start('review-start-source');
        const forwarder = await fixture.start('review-start-forwarder');
        const leader = await fixture.start('review-start-leader');
        const address = serviceAddress(leader.router.nodeId, 'source-start');
        const forwardingAddress = serviceAddress(forwarder.router.nodeId, 'source-start');
        let effects = 0;
        leader.router.register(address, () => new Promise((resolve) => {
          effects += 1;
          release = resolve;
        }));
        const owner = {transport: forwarder.router, partitionId: 'source-p',
          tableId: 'table', tableName: 'table', role: 'follower', logger: {info() {}},
          normalizeSplitTransitionMetadata: () => ({targetPartitionIds: ['left', 'right']}),
          resolveLeaderAddress: () => address};
        const methods = createPartitionServiceMergeReplicationMethods();
        forwarder.router.register(forwardingAddress, (envelope) =>
          family === 'merge' ?
            methods.forwardStartMergeReplicationToLeader.call(owner, envelope.payload, {}) :
            PartitionService.prototype.handleStartSplitReplication.call(owner, envelope.payload));
        await fixture.connect(source, forwarder);
        if (afterAdmission) await fixture.connect(forwarder, leader);
        else {
          forwarder.router.nodeConnections.set(leader.router.nodeId, {
            nodeId: leader.router.nodeId, connectionId: 'review-closed',
            state: ConnectionState.CONNECTED, isIncoming: true, ws: {readyState: 3},
          });
          t.teardown(() => forwarder.router.nodeConnections.delete(leader.router.nodeId));
        }
        let observedError;
        let confirmations = 0;
        const pending = startSourceReplicationWithConfirmation({
          start: async () => {
            try {
              await deliverProcessedSourceReplicationStart(source.router, forwardingAddress,
                {type: `START_${family.toUpperCase()}_REPLICATION`}, 'review fallback');
            } catch (error) {
              observedError = error;
              throw error;
            }
          },
          isRetryable: isRetryableManagedSplitExecutionFailure,
          confirm: async () => {
            confirmations += 1; return true;
          },
        }).then(() => ({continued: true}), (error) => ({error}));
        if (afterAdmission) {
          await settleUntil(t, () => effects === 1 &&
          forwarder.router.pendingMessages.size === 0 &&
          forwarder.router.pendingResponses.size === 1, 'onward ACK with answer held');
          forwarder.router.nodeConnections.get(leader.router.nodeId).ws.terminate();
        }
        const settled = await pending;
        t.equal(effects, afterAdmission ? 1 : 0, 'actual onward handler engagement distinguishes cases');
        t.equal(Boolean(settled.continued), afterAdmission, 'only confirmed unknown START continues');
        t.equal(confirmations, afterAdmission ? 1 : 0, 'canonical continuation confirms exactly the lost answer');
        t.equal(observedError.deliveryOutcome.deliveryState,
          TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED, 'outer hop delivered the forwarding answer');
        t.equal(observedError.deliveryOutcome.recoverableBeforeSend, false,
          'onward pre-send evidence never becomes outer-hop evidence');
        t.equal(sourceReplicationStartAnswerMayBeLost(observedError), afterAdmission,
          'only the admitted START keeps the confirmation/recovery obligation');
        t.equal(source.router.pendingResponses.size, 0, 'outer waiter retired');
        t.equal(forwarder.router.pendingResponses.size, 0, 'onward waiter retired');
      });
  }
}
