// Source-owner component witnesses, with the existing controllable consensus
// fixture and explicitly controlled recipient answers. These exercise real
// application/ledger/subscription/ACK owners; they do not prove native MG commit.
// The lane ships one ordered range per wave (quest cdc-obligation-range-shipping):
// a subscriber call is handed a vector, the shipping window starts at one entry
// and doubles after each committed range it cut, and provisional coverage
// leaves it, so the weak-coverage witnesses below still see one row per wave.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {CDC_PIPELINE_METRIC} from '../../src/constants/cdc-lifecycle-constants.js';
import {CDC_COMPLETION, unknownCdcAcceptance} from '../../src/cdc/cdc-delivery-outcome.js';
import {PARTITION_CDC_COMMAND, PARTITION_CDC_OBLIGATION_BOUND,
  PARTITION_CDC_OBLIGATION_DRIVE_STATE, PARTITION_CDC_OBLIGATION_REASON,
  PARTITION_CDC_OBLIGATION_SQL} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {
  OBLIGATION_RETRY_DISPOSITION,
  createCdcObligationLane,
  handleDeliveryFailure,
  scheduleDeliveryRetry,
} from '../../src/partition/partition-cdc-obligation-delivery.js';
import {PARTITION_SERVICE_DEFAULT} from '../../src/partition/partition-service-constants.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {applyCommitted, awaitProposal, clearFixtureSingletons, resetFixtureSingletons,
  settleTicks, track} from '../test-helpers/participant-transaction-fixture.js';
import {PAYLOAD_SENTINEL, addSourceRow, assertOwedWithoutAck, fixture, recipientAnswer} from
  '../test-helpers/partition-cdc-lane-fixture.js';

const DRIVE = PARTITION_CDC_OBLIGATION_DRIVE_STATE;
const REASON = PARTITION_CDC_OBLIGATION_REASON;

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

function assertNoB(f) {
  assert.equal(f.calls.some((call) => call.ids.includes('B')), false,
    'incomplete A coverage must not release the later metadata row');
  assertOwedWithoutAck(f, 2);
}

test('source progress is fair across expired invocations and releases only complete weak coverage',
  async (t) => {
    const f = await fixture(t);
    const visits = [0, 0, 0];
    let releaseLast = false;
    f.behavior = (index, events, context, groupId) => {
      assert.equal(events.length, 1, 'weak coverage never widens the shipping window');
      if (events[0].data.group_id === 'B') return recipientAnswer(events, groupId, false);
      visits[index] += 1;
      if (index === 1 && visits[index] === 1) {
        f.clock.elapseWithoutCallbacks(context.remainingMs());
      }
      if (index === 2 && !releaseLast) return unknownCdcAcceptance();
      return recipientAnswer(events, groupId, false);
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
    assert.deepEqual(f.calls.filter((call) => call.ids.includes('B')).map((call) => call.index),
      [0, 1, 2]);
    assert.equal(f.leader.cdcDelivery.obligationLane.currentObligation, null,
      'weak scan release drops the complete optimization cell');
    assert.equal(f.hooks.length, 0, 'provisional branches never invoke committed hooks');
    assertOwedWithoutAck(f, 2);
  });

test('mixed native and weak subscriber coverage keeps debt and reruns every branch after release',
  async (t) => {
    const f = await fixture(t, {rows: ['A']});
    f.behavior = (index, events, _context, groupId) =>
      recipientAnswer(events, groupId, index === 0);
    const beforeDelivered = f.leader.cdcPipelineMetrics.getSnapshot()[
      CDC_PIPELINE_METRIC.EVENTS_DELIVERED];
    assert.equal((await f.drive()).state, DRIVE.PROVISIONAL);
    assert.deepEqual(f.hooks, [{index: 0, ids: ['A']}],
      'only the fully committed subscriber branch runs its completion hook');
    const states = f.subscribers.map((subscriber) => f.leader.cdcSubscriberStates.get(subscriber));
    assert.ok(states[0].lastDeliveredSequenceNumber !== null);
    assert.equal(states[1].lastDeliveredSequenceNumber, null);
    assert.equal(states[2].lastDeliveredSequenceNumber, null);
    assert.equal(f.leader.cdcPipelineMetrics.getSnapshot()[
      CDC_PIPELINE_METRIC.EVENTS_DELIVERED], beforeDelivered);
    assert.equal(f.leader.cdcDelivery.obligationLane.currentObligation, null);
    assertOwedWithoutAck(f, 1);

    f.behavior = (_index, events, _context, groupId) => recipientAnswer(events, groupId, true);
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

// Weak coverage keeps the shipping window at one entry, so every wave of this
// witness ships one row: the lane reads the payloads of the range it ships and
// nothing more (the positions-only pre-pass uses its own query).
test('source reads only the payload it ships per await while keeping its 256-visit quantum ' +
  'and captured tail', async (t) => {
  const quantum = PARTITION_CDC_OBLIGATION_BOUND.DRIVE_PAGE_ROWS;
  assert.equal(quantum, 256);
  const rows = Array.from({length: quantum + 1}, (_unused, index) => `row-${index}`);
  const f = await fixture(t, {rows, subscribers: 1});
  const observed = observeOwedReads(f.leader);
  t.after(observed.restore);
  let laterAdded = false;
  f.behavior = (_index, events, _context, groupId) => {
    if (!laterAdded) {
      laterAdded = true;
      addSourceRow(f.leader, 'after-captured-tail');
    }
    return recipientAnswer(events, groupId, false);
  };
  assert.equal((await f.drive()).state, DRIVE.PAGE_YIELDED);
  assert.equal(f.calls.length, quantum);
  assert.equal(f.calls.every((call) => call.ids.length === 1), true);
  assert.equal(observed.reads.length, quantum);
  assert.equal(observed.reads.every((read) => read.limit === 1 && read.count === 1), true);
  assert.equal((await f.drive()).state, DRIVE.PROVISIONAL);
  assert.equal(f.calls.length, quantum + 1);
  assert.equal(f.calls.some((call) => call.ids.includes('after-captured-tail')), false,
    'an arriving committed row cannot extend an already captured finite pass');
  assertOwedWithoutAck(f, quantum + 2);
  assert.equal((await f.drive()).state, DRIVE.PAGE_YIELDED);
  assert.equal((await f.drive()).state, DRIVE.PROVISIONAL);
  assert.equal(f.calls.filter((call) => call.ids.includes('after-captured-tail')).length, 1,
    'the ordinary next pass reaches newly owed work');
  assert.equal(observed.reads.every((read) => read.limit === 1 && read.count <= 1), true);
  assertOwedWithoutAck(f, quantum + 2);
});

test('435 owed obligations make bounded progress across explicit retry dispositions ' +
  'and drain in log order within the drive quantum', async (t) => {
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
  // 3. Subscriber/acknowledgement backpressure -> respect retry hint on initial attempt, then back off capped at 250ms
  const backpressureDelay = scheduleDeliveryRetry(
    delivery,
    {reason: 'backpressure', retryAfterMs: 12},
    OBLIGATION_RETRY_DISPOSITION.BACKPRESSURE,
  );
  assert.equal(backpressureDelay, 12);
  assert.equal(lane.lastRetryDisposition, OBLIGATION_RETRY_DISPOSITION.BACKPRESSURE);
  assert.equal(lane.retryDelayMs, initialDelay * 2,
    'backpressure respects hint on initial attempt and advances backoff for repeated backpressure');
  // Simulate timer firing before next retry attempt
  clearTimeout(lane.retryTimer.handle);
  lane.retryTimer = {state: 'idle', handle: null};
  // Repeated backpressure WITH hint backs off capped at 250ms
  const repeatedHintedBackpressureDelay = scheduleDeliveryRetry(
    delivery,
    {reason: 'backpressure', retryAfterMs: 12},
    OBLIGATION_RETRY_DISPOSITION.BACKPRESSURE,
  );
  assert.equal(repeatedHintedBackpressureDelay, 100, 'repeated hinted backpressure backs off');
  assert.equal(lane.retryDelayMs, 200);

  // Advance to verify capping at 250ms
  clearTimeout(lane.retryTimer.handle);
  lane.retryTimer = {state: 'idle', handle: null};
  const delay3 = scheduleDeliveryRetry(delivery, {reason: 'backpressure', retryAfterMs: 12}, OBLIGATION_RETRY_DISPOSITION.BACKPRESSURE);
  assert.equal(delay3, 200);
  clearTimeout(lane.retryTimer.handle);
  lane.retryTimer = {state: 'idle', handle: null};
  const cappedDelay = scheduleDeliveryRetry(delivery, {reason: 'backpressure', retryAfterMs: 12}, OBLIGATION_RETRY_DISPOSITION.BACKPRESSURE);
  assert.equal(cappedDelay, 250, 'hinted backpressure caps at 250ms to prevent exceeding projection bound');

  // Reset lane backpressure delay for unhinted test
  lane.consecutiveBackpressure = 0;
  lane.retryDelayMs = initialDelay;
  clearTimeout(lane.retryTimer.handle);
  lane.retryTimer = {state: 'idle', handle: null};

  // Repeated backpressure WITHOUT hint advances exponential backoff to avoid unbacked-off storm
  const unhintedBackpressureDelay = scheduleDeliveryRetry(
    delivery,
    {reason: 'backpressure'},
    OBLIGATION_RETRY_DISPOSITION.BACKPRESSURE,
  );
  assert.equal(unhintedBackpressureDelay, initialDelay);
  assert.equal(lane.retryDelayMs, initialDelay * 2,
    'unhinted backpressure doubles retryDelayMs to avoid storm');
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

  // 5. Drive 435 obligations with committed receipts. From a cold window the
  // lane ships 1, 2, 4 ... 128 rows (255 visited, under the 256-row quantum);
  // the last range takes the 180 rows that are left and reaches the tail.
  f.behavior = (_index, events, _context, groupId) => recipientAnswer(events, groupId, true);
  const drive = await f.drive();
  assert.equal(drive.state, DRIVE.DRAINED);
  assert.equal(drive.delivered, 435);
  assert.deepEqual(f.calls.map((call) => call.ids.length), [1, 2, 4, 8, 16, 32, 64, 128, 180]);
  assert.equal(lane.retryDelayMs, initialDelay);
  assert.equal(lane.lastRetryDisposition, OBLIGATION_RETRY_DISPOSITION.NO_PENDING_WORK);
  assert.deepEqual(f.calls.flatMap((call) => call.ids), rows,
    'every obligation was handed exactly once, in log order');
});

test('handleDeliveryFailure logs at debug level on backpressure and warn on other errors', () => {
  const debugCalls = [];
  const warnCalls = [];
  const tenure = {term: 1, generation: 1};
  // The lane owner's own shape (a hand copy would miss its fields).
  const mockLane = {...createCdcObligationLane(tenure), shipWindow: 8};
  const mockDelivery = {
    term: 1,
    generation: 1,
    obligationLane: mockLane,
    owner: {
      partitionId: 'p1',
      isLeader: true,
      isShutdown: false,
      leadershipTenure: tenure,
      timeSource: {
        now: () => 0,
        setTimeout: () => 1,
        clearTimeout: () => {},
      },
      logger: {
        debug: (...args) => debugCalls.push(args),
        warn: (...args) => warnCalls.push(args),
      },
      cdcPipelineMetrics: {
        increment: () => {},
      },
    },
  };
  // The range the lane is held at: its head names the outcome and the log.
  const range = [
    {eventKey: 'event-1', logIndex: 10, ordinal: 1},
    {eventKey: 'event-2', logIndex: 11, ordinal: 0},
  ];

  const backpressureError = {message: 'busy', reason: CDC_COMPLETION.BACKPRESSURE};
  const held = handleDeliveryFailure(mockDelivery, mockLane, range, 'error', 0, backpressureError);
  assert.equal(debugCalls.length, 1, 'logged at debug level for backpressure');
  assert.equal(warnCalls.length, 0, 'did not log at warn level for backpressure');
  assert.equal(held.state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.equal(held.eventKey, 'event-1', 'the held outcome names the head of the range');
  assert.equal(held.rows, 2);
  assert.equal(debugCalls[0][1].eventKey, 'event-1');
  assert.equal(debugCalls[0][1].rows, 2);
  assert.equal(mockLane.shipWindow, 8, 'typed backpressure attempted nothing: window unchanged');

  const transientError = {message: 'connection reset', reason: 'connection_reset'};
  handleDeliveryFailure(mockDelivery, mockLane, range, 'error', 0, transientError);
  assert.equal(warnCalls.length, 1, 'logged at warn level for transient error');
  assert.equal(mockLane.shipWindow, 4, 'an attempted failure halves the shipping window');

  const causedBackpressureError = {message: 'busy', cause: {reason: CDC_COMPLETION.BACKPRESSURE}, retryAfterMs: 50};
  handleDeliveryFailure(mockDelivery, mockLane, range, 'error', 0, causedBackpressureError);
  assert.equal(debugCalls.length, 2, 'logged at debug level for caused backpressure');
  assert.equal(warnCalls.length, 1, 'did not log at warn level for caused backpressure');
  assert.equal(mockLane.shipWindow, 4);
});

test('a lane held by typed backpressure preserves its open ACK batch until the flush ' +
  'deadline, and its retry continuation joins the same batch', async (t) => {
  const rows = Array.from({length: 12}, (_unused, index) => `ack-batch-${index}`);
  const f = await fixture(t, {rows, subscribers: 1});
  const delivery = f.leader.cdcDelivery;
  const hintMs = 20;
  let refused = false;
  f.behavior = (_index, events, _context, groupId) => {
    if (!refused && events.some((event) => event.data.group_id === 'ack-batch-4')) {
      refused = true;
      return {...unknownCdcAcceptance(CDC_COMPLETION.BACKPRESSURE), retryAfterMs: hintMs};
    }
    return recipientAnswer(events, groupId, true);
  };

  // From a cold window the lane ships 1, 2, 4 rows; the third range carries
  // ack-batch-4 and is refused by typed backpressure, so the drive is held with
  // 3 rows acknowledged.
  const firstDrive = await f.drive();
  const lane = delivery.obligationLane;
  assert.equal(firstDrive.state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.equal(firstDrive.retryDelayMs, hintMs, 'the backpressure hint paces the retry');
  assert.deepEqual(f.calls.map((call) => call.ids.length), [1, 2, 4]);
  assert.equal(firstDrive.delivered, 3);
  assert.equal(lane.shipWindow, 4, 'backpressure leaves the shipping window');
  assert.equal(lane.batch.events, 3, '3 acknowledged events accumulate in the open batch');
  assert.notEqual(lane.flushTimer, null, 'flush deadline timer is armed for the open batch');
  assert.equal(
    f.proposed.some((command) => command.type === PARTITION_CDC_COMMAND.DELIVERED),
    false,
    'no premature CDC_DELIVERED is proposed before bound or deadline',
  );

  // The retry timer drives the remaining 9 rows into the same batch without
  // flushing the first 3 events as a separate Raft commit.
  f.clock.advance(hintMs);
  await settleTicks();
  assert.equal(lane.batch.events, 12, 'remaining 9 events join the open batch on retryTimer');
  assert.equal(
    f.proposed.filter((command) => command.type === PARTITION_CDC_COMMAND.DELIVERED).length,
    0,
    'retryTimer does not flush an open batch whose flushTimer is still active',
  );

  // Advancing to ACK_FLUSH_DEADLINE_MS proposes all 12 events in one batch.
  f.clock.advance(PARTITION_CDC_OBLIGATION_BOUND.ACK_FLUSH_DEADLINE_MS);
  await settleTicks();
  const ackCommands = f.proposed.filter(
    (command) => command.type === PARTITION_CDC_COMMAND.DELIVERED,
  );
  assert.equal(ackCommands.length, 1, 'all 12 events flush together as a single CDC_DELIVERED');
  assert.equal(
    ackCommands[0].acknowledged.reduce((sum, group) => sum + group.events.length, 0),
    12,
  );
});
