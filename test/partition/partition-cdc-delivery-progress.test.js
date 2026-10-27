// Source-owner component witnesses, with the existing controllable consensus
// fixture and explicitly controlled recipient answers. These exercise real
// application/ledger/subscription/ACK owners; they do not prove native MG commit.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {CDC_PIPELINE_METRIC} from '../../src/constants/cdc-lifecycle-constants.js';
import {buildPartitionCdcPropagationSubscriber} from
  '../../src/bootstrap/shared/partition-cdc-propagation-subscriber.js';
import {buildCommittedCdcOutcome, buildProvisionalCdcOutcome, unknownCdcAcceptance} from
  '../../src/cdc/cdc-delivery-outcome.js';
import {PARTITION_CDC_COMMAND, PARTITION_CDC_OBLIGATION_BOUND,
  PARTITION_CDC_OBLIGATION_DRIVE_STATE, PARTITION_CDC_OBLIGATION_REASON,
  PARTITION_CDC_OBLIGATION_SQL} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {
  OBLIGATION_RETRY_DISPOSITION,
  scheduleDeliveryRetry,
} from '../../src/partition/partition-cdc-obligation-delivery.js';
import {PARTITION_SERVICE_DEFAULT} from '../../src/partition/partition-service-constants.js';
import {TablePolicyService} from '../../src/policy/table-policy-service.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {CDC_TABLE as TABLE, applyCommitted, awaitProposal, clearFixtureSingletons, committedQueryOf,
  resetFixtureSingletons, settleTicks, shutdownAll, startLeader, track} from
  '../test-helpers/participant-transaction-fixture.js';

const DRIVE = PARTITION_CDC_OBLIGATION_DRIVE_STATE;
const REASON = PARTITION_CDC_OBLIGATION_REASON;
const RETRY_AFTER_MS = 20;
const PAYLOAD_SENTINEL = 'source-body-must-not-reside-in-progress';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

function delayedClock() {
  const observed = new VirtualTimeSource({startMs: 100});
  const scheduled = new VirtualTimeSource({startMs: 100});
  const delayFromScheduler = (delay) => observed.now() - scheduled.now() + delay;
  return {
    now: () => observed.now(),
    setTimeout: (callback, delay, ...args) =>
      scheduled.setTimeout(callback, delayFromScheduler(delay), ...args),
    clearTimeout: (handle) => scheduled.clearTimeout(handle),
    setInterval: (callback, delay, ...args) => scheduled.setInterval(callback, delay, ...args),
    clearInterval: (handle) => scheduled.clearInterval(handle),
    elapseWithoutCallbacks: (milliseconds) => observed.advance(milliseconds),
  };
}

function recipientAnswer(event, groupId, committed) {
  // Controlled semantic input to the source, never native acceptance evidence.
  return committed ? buildCommittedCdcOutcome([event], groupId, {index: 17, term: 2}) :
    buildProvisionalCdcOutcome([event], RETRY_AFTER_MS, groupId);
}

function addSourceRow(leader, id) {
  const command = committedQueryOf(`progress-${id}`,
    `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`);
  command.params = [id, PAYLOAD_SENTINEL];
  command.timestamp = new HLCTimestamp(1000, 0, 'source-progress-component').toString();
  assert.equal(applyCommitted(leader, command), null,
    'the real application owner accepted the controlled committed QUERY');
}

function addSubscriber(f, index) {
  const service = {groupId: `component-recipient-${index}`,
    canAcceptCDCEvent: () => f.ready};
  const selection = () => ({ready: f.ready, service});
  const subscriber = buildPartitionCdcPropagationSubscriber({
    tableName: TABLE,
    resolveOperationalMessageGroupSelection: selection,
    resolveOperationalMessageGroupSelectionAsync: async () => selection(),
    buildMessageGroupOwnerNotReadyError: () => Object.assign(new Error('controlled readiness'),
      {retryAfterMs: RETRY_AFTER_MS}),
    propagatePartitionCDCEvent: async (_selected, event, context) => {
      assert.equal(f.leader.db.inTransaction, false,
        'no SQLite transaction spans the recipient await');
      f.calls.push({index, id: event.data.id, eventKey: event.eventKey,
        timestamp: event.timestamp, remainingMs: context.remainingMs()});
      return f.behavior(index, event, context, service.groupId);
    },
    afterPropagation: (event) => f.hooks.push({index, id: event.data.id}),
  });
  f.subscribers.push(subscriber);
  return f.leader.subscribeToCDCWithHandshake(subscriber,
    {subscriberId: `progress-subscriber-${index}`});
}

async function fixture(t, {rows = ['A', 'B'], subscribers = 3} = {}) {
  const clock = delayedClock();
  // The source partition holds a CDC-carrying table (decision D2: only a
  // propagated table records an obligation).
  const {leader, proposed} = await startLeader({tableName: TABLE, timeSource: clock});
  t.after(() => shutdownAll(leader));
  leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
  const f = {clock, leader, proposed, ready: false, calls: [], hooks: [], subscribers: [],
    behavior: (_index, event, _context, groupId) => recipientAnswer(event, groupId, false),
    acks: () => proposed.filter((command) => command.type === PARTITION_CDC_COMMAND.DELIVERED),
    drive: () => leader.cdcDelivery.driveCdcObligations(REASON.DELIVERY_RETRY),
  };
  for (let index = 0; index < subscribers; index += 1) await addSubscriber(f, index);
  for (const id of rows) addSourceRow(leader, id);
  leader.controllablePort.setRole(RAFT_ROLE.LEADER);
  await settleTicks();
  assert.deepEqual(countCdcObligations(leader.db), {owed: rows.length, delivered: 0});
  assert.equal(f.calls.length, 0, 'readiness held all recipient callbacks during setup');
  f.ready = true;
  return f;
}

function assertOwedWithoutAck(f, owed) {
  assert.deepEqual(countCdcObligations(f.leader.db), {owed, delivered: 0});
  assert.equal(f.acks().length, 0);
  assert.equal(f.leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements, 0);
}

function assertNoB(f) {
  assert.equal(f.calls.some((call) => call.id === 'B'), false,
    'incomplete A coverage must not release the later metadata row');
  assertOwedWithoutAck(f, 2);
}

test('source progress is fair across expired invocations and releases only complete weak coverage',
  async (t) => {
    const f = await fixture(t);
    const visits = [0, 0, 0];
    let releaseLast = false;
    f.behavior = (index, event, context, groupId) => {
      if (event.data.id === 'B') return recipientAnswer(event, groupId, false);
      visits[index] += 1;
      if (index === 1 && visits[index] === 1) {
        f.clock.elapseWithoutCallbacks(context.remainingMs());
      }
      if (index === 2 && !releaseLast) return unknownCdcAcceptance();
      return recipientAnswer(event, groupId, false);
    };

    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.deepEqual(visits, [1, 1, 0]);
    assertNoB(f);
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.deepEqual(visits, [1, 1, 1], 'the later subscriber gets the next live invocation');
    assertNoB(f);
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.deepEqual(visits, [1, 2, 2], 'late prior coverage must be obtained again while live');
    assertNoB(f);
    const cell = f.leader.cdcDelivery.obligationLane.currentObligation;
    assert.ok(cell, 'the current obligation retains bounded continuation metadata');
    assert.equal(JSON.stringify(cell).includes(PAYLOAD_SENTINEL), false);

    releaseLast = true;
    assert.equal((await f.drive()).state, DRIVE.PROVISIONAL);
    assert.deepEqual(visits, [1, 2, 3]);
    assert.deepEqual(f.calls.filter((call) => call.id === 'B').map((call) => call.index), [0, 1, 2]);
    assert.equal(f.leader.cdcDelivery.obligationLane.currentObligation, null,
      'weak scan release drops the complete optimization cell');
    assert.equal(f.hooks.length, 0, 'provisional branches never invoke committed hooks');
    assertOwedWithoutAck(f, 2);
  });

test('mixed native and weak subscriber coverage keeps debt and reruns every branch after release',
  async (t) => {
    const f = await fixture(t, {rows: ['A']});
    f.behavior = (index, event, _context, groupId) => recipientAnswer(event, groupId, index === 0);
    const beforeDelivered = f.leader.cdcPipelineMetrics.getSnapshot()[
      CDC_PIPELINE_METRIC.EVENTS_DELIVERED];
    assert.equal((await f.drive()).state, DRIVE.PROVISIONAL);
    assert.deepEqual(f.hooks, [{index: 0, id: 'A'}],
      'only the fully committed subscriber branch runs its completion hook');
    const states = f.subscribers.map((subscriber) => f.leader.cdcSubscriberStates.get(subscriber));
    assert.ok(states[0].lastDeliveredSequenceNumber !== null);
    assert.equal(states[1].lastDeliveredSequenceNumber, null);
    assert.equal(states[2].lastDeliveredSequenceNumber, null);
    assert.equal(f.leader.cdcPipelineMetrics.getSnapshot()[
      CDC_PIPELINE_METRIC.EVENTS_DELIVERED], beforeDelivered);
    assert.equal(f.leader.cdcDelivery.obligationLane.currentObligation, null);
    assertOwedWithoutAck(f, 1);

    f.behavior = (_index, event, _context, groupId) => recipientAnswer(event, groupId, true);
    assert.equal((await f.drive()).state, DRIVE.DRAINED);
    assert.deepEqual(f.calls.map((call) => call.index), [0, 1, 2, 0, 1, 2],
      'the fresh pass cannot reuse the native fact discarded with weak coverage');
    assert.deepEqual(f.hooks.map((hook) => hook.index), [0, 0, 1, 2]);
    assert.deepEqual(countCdcObligations(f.leader.db), {owed: 1, delivered: 0});
    assert.equal(f.leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements, 1);
    assert.equal(f.acks().length, 0);

    const flush = track(f.leader.cdcDelivery.flushCdcAcknowledgements(REASON.FLUSH_DEADLINE));
    const ack = await awaitProposal(f.proposed,
      (command) => command.type === PARTITION_CDC_COMMAND.DELIVERED);
    assert.deepEqual(countCdcObligations(f.leader.db), {owed: 1, delivered: 0},
      'source proposal alone cannot mark the row delivered');
    assert.equal(applyCommitted(f.leader, ack), null);
    await flush.promise;
    assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: 1});
  });

function observeOwedReads(leader) {
  const {db} = leader;
  const prepare = db.prepare;
  const reads = [];
  db.prepare = function(sql) {
    const statement = prepare.call(this, sql);
    if (sql !== PARTITION_CDC_OBLIGATION_SQL.SELECT_OWED_AFTER) return statement;
    const all = statement.all;
    statement.all = function(options) {
      const result = all.call(this, options);
      reads.push({limit: options.limit, count: result.length});
      return result;
    };
    return statement;
  };
  return {reads, restore: () => {
    db.prepare = prepare;
  }};
}

test('source reads one payload per await while keeping its 256-visit quantum and captured tail',
  async (t) => {
    const quantum = PARTITION_CDC_OBLIGATION_BOUND.DRIVE_PAGE_ROWS;
    assert.equal(quantum, 256);
    const rows = Array.from({length: quantum + 1}, (_unused, index) => `row-${index}`);
    const f = await fixture(t, {rows, subscribers: 1});
    const observed = observeOwedReads(f.leader);
    t.after(observed.restore);
    let laterAdded = false;
    f.behavior = (_index, event, _context, groupId) => {
      if (!laterAdded) {
        laterAdded = true;
        addSourceRow(f.leader, 'after-captured-tail');
      }
      return recipientAnswer(event, groupId, false);
    };
    assert.equal((await f.drive()).state, DRIVE.PAGE_YIELDED);
    assert.equal(f.calls.length, quantum);
    assert.equal(observed.reads.length, quantum);
    assert.equal(observed.reads.every((read) => read.limit === 1 && read.count === 1), true);
    assert.equal((await f.drive()).state, DRIVE.PROVISIONAL);
    assert.equal(f.calls.length, quantum + 1);
    assert.equal(f.calls.some((call) => call.id === 'after-captured-tail'), false,
      'an arriving committed row cannot extend an already captured finite pass');
    assertOwedWithoutAck(f, quantum + 2);
    assert.equal((await f.drive()).state, DRIVE.PAGE_YIELDED);
    assert.equal((await f.drive()).state, DRIVE.PROVISIONAL);
    assert.equal(f.calls.filter((call) => call.id === 'after-captured-tail').length, 1,
      'the ordinary next pass reaches newly owed work');
    assert.equal(observed.reads.every((read) => read.limit === 1 && read.count <= 1), true);
    assertOwedWithoutAck(f, quantum + 2);
  });

test('435 owed obligations make bounded progress across explicit retry dispositions ' +
  'without starving a concurrent TablePolicyService update', async (t) => {
  const rows = Array.from({length: 435}, (_unused, index) => `ob-${index}`);
  const f = await fixture(t, {rows, subscribers: 1});
  const delivery = f.leader.cdcDelivery;
  const initialDelay = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;

  // Verify explicit retry dispositions:
  // 1. Genuine transient failure -> bounded exponential backoff
  const d1 = scheduleDeliveryRetry(
    delivery, new Error('transient'), OBLIGATION_RETRY_DISPOSITION.TRANSIENT_FAILURE);
  const lane = delivery.obligationLane;
  assert.equal(d1, initialDelay);
  assert.equal(lane.lastRetryDisposition, OBLIGATION_RETRY_DISPOSITION.TRANSIENT_FAILURE);
  assert.equal(lane.retryDelayMs, initialDelay * 2,
    'transient failure doubles retryDelayMs');
  // 2. No pending work -> disarm retry and reset delay
  assert.equal(
    scheduleDeliveryRetry(delivery, null, OBLIGATION_RETRY_DISPOSITION.NO_PENDING_WORK),
    0,
  );
  assert.equal(lane.lastRetryDisposition, OBLIGATION_RETRY_DISPOSITION.NO_PENDING_WORK);
  assert.equal(lane.retryTimer.state, 'idle');
  assert.equal(lane.retryDelayMs, initialDelay);
  // 3. Subscriber/acknowledgement backpressure -> respect retry hint without doubling
  const backpressureDelay = scheduleDeliveryRetry(
    delivery,
    {reason: 'backpressure', retryAfterMs: 12},
    OBLIGATION_RETRY_DISPOSITION.BACKPRESSURE,
  );
  assert.equal(backpressureDelay, 12);
  assert.equal(lane.lastRetryDisposition, OBLIGATION_RETRY_DISPOSITION.BACKPRESSURE);
  assert.equal(lane.retryDelayMs, initialDelay,
    'backpressure respects hint without doubling retryDelayMs');
  scheduleDeliveryRetry(delivery, null, OBLIGATION_RETRY_DISPOSITION.NO_PENDING_WORK);
  // 4. Stale propagation lifetime -> refuse and disarm; never resume retired work
  assert.equal(
    scheduleDeliveryRetry(
      delivery,
      {stalePropagationLifetime: true},
      OBLIGATION_RETRY_DISPOSITION.STALE_LIFETIME,
    ),
    0,
  );
  assert.equal(lane.lastRetryDisposition, OBLIGATION_RETRY_DISPOSITION.STALE_LIFETIME);
  assert.equal(lane.retryTimer.state, 'idle');

  // 5. Drive 435 obligations with committed receipts and contend on the 10th obligation
  // while committing a TablePolicyService update.
  const cachedTables = new Map([
    ['user_events', {table_id: 'user_events', table_policies: '{}', updated_at: 100}],
  ]);
  const policyService = new TablePolicyService({
    systemTableCache: {
      filter: (_tableName, predicate) => [...cachedTables.values()].filter(predicate),
    },
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: {
      executeRead: async ({readFromCache}) => ({rows: readFromCache()}),
      submitMutation: async (mutation, options) => {
        assert.deepEqual(options.expectedCacheFields, {
          table_policies: mutation.data.table_policies,
        });
        assert.deepEqual(options.minimumCacheFields, {
          updated_at: mutation.data.updated_at,
        });
        return {
          success: true,
          outcome: 'applied',
          partitionResult: {affectedRows: 1},
        };
      },
    },
  });

  f.behavior = (_index, event, context, groupId) => {
    if (event.data.id === 'ob-9') {
      context.markContended();
    }
    return recipientAnswer(event, groupId, true);
  };

  const firstDrive = await f.drive();
  assert.equal(firstDrive.state, DRIVE.PAGE_YIELDED,
    'contended obligation drive yields fairly after progress');
  assert.equal(firstDrive.delivered, 10);
  assert.equal(lane.lastRetryDisposition, OBLIGATION_RETRY_DISPOSITION.PAGE_YIELDED);
  assert.equal(lane.retryDelayMs, initialDelay,
    'page yield after progress keeps initial continuation delay without backoff');

  // Commit policy update while the 435-obligation lane is yielded between slices;
  // verify immediate read-your-writes visibility without starvation.
  await policyService.updateTablePolicy('user_events', {
    mergeStorageThreshold: 1,
    mergeTrafficThreshold: 0,
  });
  const visiblePolicy = await policyService.getTablePolicy('user_events');
  assert.equal(visiblePolicy.mergeStorageThreshold, 1);
  assert.equal(visiblePolicy.mergeTrafficThreshold, 0);

  // Continue draining the remaining 425 obligations across bounded 256-row pages.
  const secondDrive = await f.drive();
  assert.equal(secondDrive.state, DRIVE.PAGE_YIELDED);
  assert.equal(secondDrive.delivered, 256);
  assert.equal(lane.retryDelayMs, initialDelay);

  const thirdDrive = await f.drive();
  assert.equal(thirdDrive.state, DRIVE.DRAINED);
  assert.equal(thirdDrive.delivered, 435 - 10 - 256);
  assert.equal(lane.lastRetryDisposition, OBLIGATION_RETRY_DISPOSITION.NO_PENDING_WORK);
  assert.equal(f.calls.length, 435);
});
