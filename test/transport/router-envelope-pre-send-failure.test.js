import {QueryExecutor} from '../../src/query/query-executor.js';
import {createMockSystemCache} from '../query/query-executor-test-support.js';
import {test} from '../../src/test-helpers/tap.js';
import {ConnectionState} from '../../src/transport/message-router.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {withTestDbPath} from '../test-helpers/message-group-db-path.js';
import {createUnknownOutcomeRedelivery} from '../../src/query/query-executor-unknown-outcome.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../../src/partition/partition-write-kernel.js';
import {deliveryTransportOf, TRANSPORT_DELIVERY_OUTCOME_REASON_CODE} from
  '../../src/transport/transport-semantic-outcome.js';
import {createRouterEnvelopeFixture, serviceAddress, settleUntil} from './router-envelope-witness-fixture.js';

test('a socket already closed before send retains the router pre-send fact through recovery',
  async (t) => {
    const fixture = createRouterEnvelopeFixture(import.meta.url, 'presend-owner');
    await fixture.setup();
    t.teardown(() => fixture.teardown());
    const {router} = await fixture.start('presend-owner', false);
    const target = 'presend-target';
    // A source-owned connection whose socket closed before sendWithAck enters
    // ws.send. The real send and recovery owners classify it; no deliver mock.
    router.nodeConnections.set(target, {
      nodeId: target, connectionId: 'presend-closed', state: ConnectionState.CONNECTED,
      isIncoming: true, ws: {readyState: 3},
    });
    t.teardown(() => router.nodeConnections.delete(target));
    const delivery = await router.deliver(serviceAddress(target, 'handler'), {type: 'PRESEND'});
    const outcome = deliveryTransportOf(delivery);
    t.equal(outcome.reasonCode, TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.CONNECTION_CLOSED);
    t.equal(outcome.recoverableBeforeSend, true,
      'the genuine pre-send closure is not converted into lost-answer debt');
    t.equal(router.pendingMessages.size, 0, 'no ACK obligation was opened');
    t.equal(router.pendingResponses.size, 0, 'the unused answer waiter is retired');
  });

for (const afterAdmission of [false, true]) {
  test(`independent Q6 query MG lane retains same-request pre-send proof (afterAdmission=${afterAdmission})`,
    async (t) => {
      const fixture = createRouterEnvelopeFixture(import.meta.url, 'review-query-source');
      await fixture.setup();
      let release = () => {};
      t.teardown(async () => {
        release({success: true}); await fixture.teardown();
      });
      const sender = await fixture.start('review-query-source');
      const target = await fixture.start('review-query-target');
      const address = `${target.router.nodeId}/partition/p1`;
      const group = new MessageGroupService(withTestDbPath({groupId: 'review-query',
        replicaId: 'review-query-r1', nodeId: sender.router.nodeId, transport: sender.router}));
      // The production direct-only QUERY owner does not initialize or use Raft.
      // Fail loudly if that contract changes rather than silently supplying it.
      group.initialized = true;
      group.persistToRaftLog = () => {
        throw new Error('QUERY must not persist in MG Raft');
      };
      sender.router.setQueryMessageGroupServiceResolver(() => group);
      let effects = 0;
      target.router.register(address, () => new Promise((resolve) => {
        effects += 1;
        release = resolve;
      }));
      if (afterAdmission) await fixture.connect(sender, target);
      else {
        sender.router.nodeConnections.set(target.router.nodeId, {
          nodeId: target.router.nodeId, connectionId: 'review-query-closed',
          state: ConnectionState.CONNECTED, isIncoming: true, ws: {readyState: 3},
        });
        t.teardown(() => sender.router.nodeConnections.delete(target.router.nodeId));
      }
      const pending = sender.router.deliver(address,
        {type: 'QUERY', sql: 'UPDATE users SET n = n + 1', params: [], entryId: 'same-entry'});
      if (afterAdmission) {
        await settleUntil(t, () => effects === 1 && sender.router.pendingMessages.size === 0 &&
          sender.router.pendingResponses.size === 1, 'query ACK with answer held');
        sender.router.nodeConnections.get(target.router.nodeId).ws.terminate();
      }
      const outcome = deliveryTransportOf(await pending);
      t.equal(effects, afterAdmission ? 1 : 0, 'actual handler engagement distinguishes cases');
      t.equal(outcome.recoverableBeforeSend, !afterAdmission,
        'only a same-request pre-send refusal proves the query was not sent');
      const debt = createUnknownOutcomeRedelivery({entryId: 'same-entry', forRead: false, now: () => 1});
      debt.recordDelivery();
      debt.observeTransport(outcome);
      t.equal(debt.finish({success: false}).failureCode ===
        PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
      afterAdmission, 'loss debt follows actual same-request submission');
      debt.observeLostAnswer(new Error('an earlier attempt was admitted'));
      debt.observeTransport(outcome);
      t.equal(debt.finish({success: false}).failureCode,
        PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
        'a later pre-send refusal never clears already admitted write debt');
      t.equal(group.pendingMessages.size, 0, 'direct-only MG custody retired');
      t.equal(sender.router.pendingResponses.size, 0, 'router response custody retired');
    });
}


test('QUERY/MG finite reply loss recovers under the original write entry', async (t) => {
  const fixture = createRouterEnvelopeFixture(import.meta.url, 'query-recovery-source');
  await fixture.setup();
  let release = () => {};
  t.teardown(async () => {
    release({success: true}); await fixture.teardown();
  });
  const sender = await fixture.start('query-recovery-source');
  const target = await fixture.start('test-node');
  const group = new MessageGroupService(withTestDbPath({groupId: 'query-recovery',
    replicaId: 'query-recovery-r1', nodeId: sender.router.nodeId, transport: sender.router}));
  group.initialized = true;
  group.persistToRaftLog = () => {
    throw new Error('direct-only QUERY must not persist');
  };
  sender.router.setQueryMessageGroupServiceResolver(() => group);
  const entries = [];
  target.router.register('test-node/partition/p1', (envelope) => {
    entries.push(envelope.payload.payload.entryId);
    if (entries.length === 1) {
      return new Promise((resolve) => {
        release = resolve;
      });
    }
    return {success: true, changes: 1, settledReplay: true};
  });
  await fixture.connect(sender, target);
  const executor = new QueryExecutor({nodeId: sender.router.nodeId,
    systemCache: createMockSystemCache(['p1']), messageRouter: sender.router});
  executor.delay = async () => {
    await fixture.connect(sender, target);
  };
  const pending = executor.executeOnPartition('p1', 'UPDATE users SET n = n + 1',
    [], false, true, false, {entryId: 'original-write-entry', timeoutMs: 5000});
  await settleUntil(t, () => entries.length === 1 && sender.router.pendingMessages.size === 0 &&
    sender.router.pendingResponses.size === 1, 'first write engaged with its answer held');
  sender.router.nodeConnections.get(target.router.nodeId).ws.terminate();
  const result = await pending;
  t.equal(result.success, true, 'finite loss reaches the settled replay answer');
  t.equal(result.settledReplay, true, 'the settled answer reaches the query caller');
  t.same(entries, ['original-write-entry', 'original-write-entry'],
    'recovery neither mints another entry nor submits another logical write');
  t.equal(group.pendingMessages.size, 0, 'MG custody is closed');
  t.equal(sender.router.pendingResponses.size, 0, 'router answer custody is closed');
});
