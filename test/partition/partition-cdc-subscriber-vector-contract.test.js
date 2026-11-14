// The one CDC subscriber contract of a partition (quest
// cdc-obligation-range-shipping, record S-3): every producer hands a
// subscriber (events, deliveryContext), where events is a dense, ordered,
// frozen vector of one table and one partition. The obligation lane ships a
// range of its ledger (partition-cdc-obligation-range-shipping.test.js); here
// the contract itself, the subscriber wrapper's per-member effects, and the
// non-durable producer and the buffered replay, which hand a vector of one
// with their behaviour otherwise unchanged.
//
// Owner path: PartitionCDCDelivery.deliverCDCEventToSubscriber, its subscriber
// wrapper (subscribeToCDCWithHandshake), PartitionService.generateCDCEvent and
// flushBufferedCDCEvents, on a PartitionService without consensus (the
// producers under test need none).
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {CDC_COMPLETION} from '../../src/cdc/cdc-delivery-outcome.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {CDC_PIPELINE_METRIC} from '../../src/constants/cdc-lifecycle-constants.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {PARTITION_SERVICE_EVENT} from '../../src/partition/partition-service-constants.js';
import {withFoundingStamp} from './partition-founding-stamp.js';

const USER_TABLE = 'vector_contract_rows';
const OTHER_TABLE = 'vector_contract_other';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'vector-contract-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});
afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function partitionOf() {
  return new PartitionService(withFoundingStamp({
    partitionId: 'vector-contract-p1',
    tableId: USER_TABLE,
    replicaId: 'vector-contract-p1-r1',
    dbPath: ':memory:',
  }));
}

const ordinary = (id, extra = {}) =>
  ({tableName: USER_TABLE, operation: 'INSERT', data: {id}, ...extra});
const metricOf = (partition, metric) => partition.cdcPipelineMetrics.getSnapshot()[metric];

test('deliverCDCEventToSubscriber hands a subscriber function and a subscriber object the ' +
  'vector itself and returns the subscriber\'s answer', async () => {
  const partition = partitionOf();
  const events = Object.freeze([ordinary('a'), ordinary('b'), ordinary('c')]);
  const handed = [];
  const fromFunction = await partition.cdcDelivery.deliverCDCEventToSubscriber(
    (vector, context) => {
      handed.push({vector, context});
      return {answer: 'function'};
    }, events);
  const fromObject = await partition.cdcDelivery.deliverCDCEventToSubscriber({
    handleCDCEvent(vector, context) {
      handed.push({vector, context});
      return {answer: 'object'};
    },
  }, events);
  assert.deepEqual([fromFunction, fromObject], [{answer: 'function'}, {answer: 'object'}]);
  assert.equal(handed.length, 2);
  for (const {vector, context} of handed) {
    assert.equal(vector, events, 'the subscriber is handed the vector, not one event');
    assert.equal(context, null);
  }
});

test('deliverCDCEventToSubscriber refuses anything but a dense frozen vector of one table ' +
  'and one partition before the subscriber is invoked', async () => {
  const partition = partitionOf();
  let invoked = 0;
  const subscriber = () => {
    invoked += 1;
  };
  const sparse = [ordinary('a')];
  sparse.length = 2;
  const refused = {
    'one event, not a vector': ordinary('a'),
    'a vector that is not frozen': [ordinary('a')],
    'an empty vector': Object.freeze([]),
    'a sparse vector': Object.freeze(sparse),
    'a vector with an absent member': Object.freeze([null]),
    'a vector with an absent later member': Object.freeze([ordinary('a'), undefined]),
    'a vector of two tables': Object.freeze([ordinary('a'),
      {...ordinary('b'), tableName: OTHER_TABLE}]),
    'a vector of two partitions': Object.freeze([ordinary('a', {sourcePartition: 'p1'}),
      ordinary('b', {sourcePartition: 'p2'})]),
    'nothing': undefined,
  };
  for (const [name, events] of Object.entries(refused)) {
    await assert.rejects(partition.cdcDelivery.deliverCDCEventToSubscriber(subscriber, events),
      {code: CDC_COMPLETION.INVALID}, name);
  }
  assert.equal(invoked, 0, 'a refused vector reaches no subscriber');
  assert.equal(await partition.cdcDelivery.deliverCDCEventToSubscriber(subscriber,
    Object.freeze([ordinary('a'), ordinary('b')])), undefined);
  assert.equal(invoked, 1, 'the well-formed vector of the same members is delivered');
});

test('a subscriber is asked for readiness once per vector, with its first event', async () => {
  const partition = partitionOf();
  const asked = [];
  const subscriber = () => undefined;
  subscriber.canAcceptCDCEvent = (event) => {
    asked.push(event);
    return true;
  };
  const events = Object.freeze([ordinary('a'), ordinary('b')]);
  await partition.cdcDelivery.deliverCDCEventToSubscriber(subscriber, events);
  assert.deepEqual(asked, [events[0]]);
});

test('the subscriber wrapper gives every member of a vector the subscription identity and ' +
  'its own sequence number, in order, and records the last one as delivered', async () => {
  const partition = partitionOf();
  const vectors = [];
  const handshake = await partition.subscribeToCDCWithHandshake((vector) => {
    vectors.push(vector);
  }, {subscriberId: 'vector-contract-subscriber'});
  const [wrapper] = [...partition.cdcSubscribers];
  const base = partition.cdcEventSequenceNumber;
  const events = Object.freeze([ordinary('a'), ordinary('b', {sequenceNumber: 9000}),
    ordinary('c')]);
  await wrapper(events);
  assert.equal(vectors.length, 1, 'one subscriber invocation for the vector');
  const [decorated] = vectors;
  assert.equal(Object.isFrozen(decorated), true);
  assert.equal(decorated.every((event) => Object.isFrozen(event)), true);
  assert.deepEqual(decorated.map((event) => [event.data.id, event.sequenceNumber,
    event.subscriberId, event.subscriptionEpoch]), [
    ['a', base + 1, 'vector-contract-subscriber', handshake.subscriptionEpoch],
    ['b', 9000, 'vector-contract-subscriber', handshake.subscriptionEpoch],
    ['c', base + 2, 'vector-contract-subscriber', handshake.subscriptionEpoch],
  ], 'a member without a sequence number takes the next one; one that has it keeps it');
  assert.equal(partition.cdcEventSequenceNumber, base + 2);
  const [state] = partition.getCDCSubscriptionDiagnostics().subscriptions;
  assert.equal(state.lastDeliveredSequenceNumber, base + 2,
    'the last member\'s sequence number is the subscription\'s last delivered');
  await assert.rejects(wrapper(ordinary('not-a-vector')), {code: CDC_COMPLETION.INVALID});
});

test('the non-durable producer hands each subscriber a frozen vector of exactly one event ' +
  'per write, in write order, and counts and emits each event once', async () => {
  const partition = partitionOf();
  const first = [];
  const second = [];
  await partition.subscribeToCDCWithHandshake((vector) => {
    first.push(vector);
  }, {subscriberId: 'first'});
  await partition.subscribeToCDCWithHandshake({handleCDCEvent(vector) {
    second.push(vector);
  }}, {subscriberId: 'second'});
  const emitted = [];
  partition.on(PARTITION_SERVICE_EVENT.CDC_EVENT, (event) => emitted.push(event));
  const deliveredBefore = metricOf(partition, CDC_PIPELINE_METRIC.EVENTS_DELIVERED);
  for (const id of ['w1', 'w2', 'w3']) {
    await partition.generateCDCEvent({type: 'INSERT', tableName: USER_TABLE,
      data: {id, value: `value-${id}`}, timestamp: '1000'});
  }
  for (const vectors of [first, second]) {
    assert.equal(vectors.length, 3, 'one invocation per write');
    assert.equal(vectors.every((vector) => Array.isArray(vector) && vector.length === 1 &&
      Object.isFrozen(vector)), true, 'each invocation is handed a frozen vector of one');
    assert.deepEqual(vectors.map((vector) => [vector[0].data.id, vector[0].tableName,
      vector[0].operation]), ['w1', 'w2', 'w3'].map((id) => [id, USER_TABLE, 'INSERT']));
  }
  assert.deepEqual(first.map((vector) => vector[0].subscriberId), ['first', 'first', 'first']);
  assert.deepEqual(second.map((vector) => vector[0].subscriberId),
    ['second', 'second', 'second']);
  assert.deepEqual(first.map((vector) => vector[0].sequenceNumber),
    second.map((vector) => vector[0].sequenceNumber), 'one sequence number per write');
  assert.deepEqual(emitted.map((event) => event.data.id), ['w1', 'w2', 'w3'],
    'CDC_EVENT carries the event, once per write');
  assert.equal(metricOf(partition, CDC_PIPELINE_METRIC.EVENTS_DELIVERED) - deliveredBefore, 3);
});

test('a subscriber that throws fails the non-durable delivery exactly as before: counted, ' +
  'not emitted, and not buffered for a table that owes no obligation', async () => {
  const partition = partitionOf();
  partition.logger = {debug() {}, info() {}, warn() {}, error() {}};
  let calls = 0;
  await partition.subscribeToCDCWithHandshake(() => {
    calls += 1;
    throw new Error('subscriber failure');
  }, {subscriberId: 'failing'});
  const emitted = [];
  partition.on(PARTITION_SERVICE_EVENT.CDC_EVENT, (event) => emitted.push(event));
  const failuresBefore = metricOf(partition, CDC_PIPELINE_METRIC.DELIVERY_FAILURES);
  await partition.generateCDCEvent({type: 'INSERT', tableName: USER_TABLE,
    data: {id: 'f1'}, timestamp: '1000'});
  assert.equal(calls, 1);
  assert.equal(emitted.length, 0);
  assert.equal(metricOf(partition, CDC_PIPELINE_METRIC.DELIVERY_FAILURES) - failuresBefore, 1);
  assert.equal(partition.cdcEventBuffer.size(), 0);
});

test('the buffered replay hands each buffered event as a frozen vector of one, marked ' +
  'replay-only, in buffer order', async () => {
  const partition = partitionOf();
  partition.logger = {debug() {}, info() {}, warn() {}, error() {}};
  const buffered = ['n1', 'n2', 'n3'].map((id, index) => ({tableName: SYSTEM_TABLE_NAME.NODES,
    operation: 'INSERT', data: {node_id: id}, timestamp: `${1000 + index}`}));
  for (const event of buffered) assert.equal(partition.cdcEventBuffer.buffer(event), true);
  const vectors = [];
  await partition.subscribeToCDCWithHandshake((vector) => {
    vectors.push(vector);
  }, {subscriberId: 'replay'});
  assert.equal(vectors.length, 0, 'the handshake replays nothing');
  const emitted = [];
  partition.on(PARTITION_SERVICE_EVENT.CDC_EVENT, (event) => emitted.push(event));
  await partition.flushBufferedCDCEvents('vector-contract-replay');
  assert.equal(vectors.length, 3);
  assert.equal(vectors.every((vector) => vector.length === 1 && Object.isFrozen(vector)), true);
  assert.deepEqual(vectors.map((vector) => [vector[0].data.node_id, vector[0].replayOnly]),
    [['n1', true], ['n2', true], ['n3', true]]);
  assert.deepEqual(emitted.map((event) => event.data.node_id), ['n1', 'n2', 'n3']);
  assert.equal(partition.cdcEventBuffer.size(), 0);
});
