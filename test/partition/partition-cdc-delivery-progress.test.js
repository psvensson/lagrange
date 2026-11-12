// Source-owner component witnesses, with the existing controllable consensus
// fixture and explicitly controlled recipient answers. These exercise real
// application/ledger/subscription/ACK owners; they do not prove native MG commit.
// Under range shipping the unit of delivery is one vector of owed rows; a row
// above the shipping byte bound ships alone, which these witnesses use to
// place a later row in a later vector. Under recipient isolation each
// subscriber is a recipient with its own cursor, invocation and retry: these
// witnesses pin what holds per recipient (order, weak coverage, the 256-row
// quantum, the captured tail) and that the lane acknowledges only at the
// lowest cursor.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {CDC_PIPELINE_METRIC} from '../../src/constants/cdc-lifecycle-constants.js';
import {CDC_COMPLETION, unknownCdcAcceptance} from
  '../../src/cdc/cdc-delivery-outcome.js';
import {PARTITION_CDC_COMMAND, PARTITION_CDC_OBLIGATION_BOUND,
  PARTITION_CDC_OBLIGATION_DRIVE_STATE, PARTITION_CDC_OBLIGATION_REASON} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {
  OBLIGATION_RETRY_DISPOSITION,
  handleDeliveryFailure,
  scheduleDeliveryRetry,
} from '../../src/partition/partition-cdc-obligation-delivery.js';
import {PARTITION_SERVICE_DEFAULT} from '../../src/partition/partition-service-constants.js';
import {TablePolicyService} from '../../src/policy/table-policy-service.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {applyCommitted, awaitProposal, clearFixtureSingletons,
  resetFixtureSingletons, settleTicks, track} from
  '../test-helpers/participant-transaction-fixture.js';
import {PAYLOAD_SENTINEL, addSourceRow, fixture, observeOwedReads, recipientAnswer} from
  '../test-helpers/cdc-delivery-progress-fixture.js';

const DRIVE = PARTITION_CDC_OBLIGATION_DRIVE_STATE;
const REASON = PARTITION_CDC_OBLIGATION_REASON;
const BOUND = PARTITION_CDC_OBLIGATION_BOUND;
// A row whose event body alone exceeds the shipping byte bound: it ships as a
// vector of its own, so the row after it belongs to a later vector.
const ALONE = PAYLOAD_SENTINEL.repeat(Math.ceil(BOUND.SHIP_MAX_BYTES / PAYLOAD_SENTINEL.length));

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

function assertOwedWithoutAck(f, owed) {
  assert.deepEqual(countCdcObligations(f.leader.db), {owed, delivered: 0});
  assert.equal(f.acks().length, 0);
  assert.equal(f.leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements, 0);
}

const callsOf = (f, index) => f.calls.filter((call) => call.index === index)
  .map((call) => call.ids);

// Pins, per recipient: a recipient is shipped the later vector (B) only after
// it accepted the earlier one (A ships alone), weakly or natively; a
// recipient that has not accepted A holds only itself; weak (provisional)
// coverage acknowledges nothing; recipient state holds no event body.
test('each recipient is shipped the later vector only after it accepted the earlier one, ' +
  'and weak coverage acknowledges nothing', async (t) => {
  const f = await fixture(t, {rows: [{id: 'A', value: ALONE}, 'B']});
  let releaseLast = false;
  f.behavior = (index, events, _context, groupId) =>
    index === 2 && !releaseLast && events[0].data.id === 'A' ?
      unknownCdcAcceptance() : recipientAnswer(events, groupId, false);

  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.deepEqual(callsOf(f, 0), [['A'], ['B']],
    'a recipient that accepted A weakly is shipped B in the same scan');
  assert.deepEqual(callsOf(f, 1), [['A'], ['B']]);
  assert.deepEqual(callsOf(f, 2), [['A']],
    'the recipient that has not accepted A is not shipped the later row');
  assertOwedWithoutAck(f, 2);
  const diagnostics = f.leader.cdcDelivery.getCdcObligationDiagnostics();
  assert.equal(diagnostics.frontier, null, 'no recipient holds a committed receipt');
  assert.equal(JSON.stringify(diagnostics).includes(PAYLOAD_SENTINEL), false,
    'recipient state retains bounded metadata, never an event body');

  releaseLast = true;
  assert.equal((await f.drive()).state, DRIVE.PROVISIONAL);
  assert.deepEqual(callsOf(f, 2), [['A'], ['A'], ['B']],
    'once it accepts A, the held recipient is shipped B');
  assert.equal(f.calls.every((call) => call.ids.length === 1), true,
    'A (above the byte bound) and B never share a vector');
  assert.equal(f.hooks.length, 0, 'provisional recipients never invoke committed hooks');
  assertOwedWithoutAck(f, 2);
});

// Pins: a native receipt is a fact of its recipient (its cursor moves and it
// is not shipped the vector again); weak coverage moves no cursor; the row
// is acknowledged only when the lowest cursor passes it.
test('mixed native and weak recipient coverage keeps debt until every recipient committed',
  async (t) => {
    const f = await fixture(t, {rows: ['A']});
    f.behavior = (index, events, _context, groupId) =>
      recipientAnswer(events, groupId, index === 0);
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
    assertOwedWithoutAck(f, 1);

    f.behavior = (_index, events, _context, groupId) => recipientAnswer(events, groupId, true);
    assert.equal((await f.drive()).state, DRIVE.DRAINED);
    assert.deepEqual(f.calls.map((call) => call.index).sort(), [0, 1, 1, 2, 2],
      'the recipient that committed keeps its receipt; only the weak ones are shipped again');
    assert.deepEqual(f.hooks.map((hook) => hook.index).sort(), [0, 1, 2]);
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

// Pins: each await is preceded by one bounded ledger page (at most
// SHIP_MAX_EVENTS rows, never the whole backlog); one recipient pass ships at
// most the 256-row quantum and never ships part of a vector to stay within
// it; a recipient's scan ends at the tail captured when it began.
test('source reads one bounded page per await while keeping its 256-visit quantum and captured tail',
  async (t) => {
    const quantum = BOUND.DRIVE_PAGE_ROWS;
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
    const shippedRows = () => f.calls.reduce((sum, call) => sum + call.ids.length, 0);
    const boundedReads = () => observed.reads.every((read) =>
      read.limit === BOUND.SHIP_MAX_EVENTS && read.count <= read.limit);

    assert.equal((await f.drive()).state, DRIVE.PAGE_YIELDED);
    const firstPassRows = shippedRows();
    assert.ok(firstPassRows > 0 && firstPassRows <= quantum,
      'one pass visits at most the 256-row quantum');
    assert.equal(observed.reads.filter((read) => read.count > 0).length, f.calls.length + 1,
      'one page per shipped vector, plus the page whose vector opens the next pass');
    assert.equal(boundedReads(), true);
    assert.equal((await f.drive()).state, DRIVE.PROVISIONAL);
    assert.equal(shippedRows(), quantum + 1);
    assert.deepEqual(f.calls.flatMap((call) => call.ids), rows, 'log order, each row once');
    assert.equal(f.calls.some((call) => call.ids.includes('after-captured-tail')), false,
      'an arriving committed row cannot extend an already captured finite pass');
    assertOwedWithoutAck(f, quantum + 2);
    assert.equal((await f.drive()).state, DRIVE.PAGE_YIELDED);
    assert.equal((await f.drive()).state, DRIVE.PROVISIONAL);
    assert.equal(f.calls.filter((call) => call.ids.includes('after-captured-tail')).length, 1,
      'the ordinary next pass reaches newly owed work');
    assert.equal(boundedReads(), true);
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

  // 5. Drive 435 obligations with committed receipts across bounded passes while
  // committing a TablePolicyService update between them.
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
      // The policy write's base is the committed row (census site 6).
      readAuthoritativeRows: async (_tableName, _sql, params) => ({
        success: true,
        rows: cachedTables.has(params[0]) ?
          [{...cachedTables.get(params[0])}] : [],
      }),
      submitMutation: async (_mutation, options) => {
        // The policy write answers at its commit: no projection-field wait.
        assert.equal(options.expectedCacheFields, undefined);
        assert.equal(options.minimumCacheFields, undefined);
        return {
          success: true,
          outcome: 'applied',
          partitionResult: {affectedRows: 1},
        };
      },
    },
  });

  f.behavior = (_index, events, _context, groupId) => recipientAnswer(events, groupId, true);

  const firstDrive = await f.drive();
  assert.equal(firstDrive.state, DRIVE.PAGE_YIELDED,
    'the recipient pass yields at its 256-row quantum');
  assert.equal(f.calls.length, 1, 'the next vector would exceed the quantum: it opens the next pass');
  const firstVectorRows = f.calls[0].ids.length;
  assert.ok(firstVectorRows <= BOUND.SHIP_MAX_EVENTS);
  assert.equal(firstDrive.delivered, firstVectorRows, 'delivered counts rows, not vectors');
  assert.equal(lane.lastRetryDisposition, OBLIGATION_RETRY_DISPOSITION.PAGE_YIELDED);
  assert.equal(lane.retryDelayMs, initialDelay,
    'page yield after progress keeps initial continuation delay without backoff');

  // Commit policy update while the 435-obligation lane is yielded between passes;
  // verify immediate read-your-writes visibility without starvation.
  await policyService.updateTablePolicy('user_events', {
    mergeStorageThreshold: 1,
    mergeTrafficThreshold: 0,
  });
  const visiblePolicy = await policyService.getTablePolicy('user_events');
  assert.equal(visiblePolicy.mergeStorageThreshold, 1);
  assert.equal(visiblePolicy.mergeTrafficThreshold, 0);

  // Continue draining the remaining obligations across passes of at most 256 rows.
  let delivered = firstDrive.delivered;
  let outcome = firstDrive;
  while (outcome.state === DRIVE.PAGE_YIELDED) {
    const before = f.calls.length;
    outcome = await f.drive();
    const passRows = f.calls.slice(before).reduce((sum, call) => sum + call.ids.length, 0);
    assert.ok(passRows <= BOUND.DRIVE_PAGE_ROWS, 'one pass ships at most the 256-row quantum');
    assert.equal(outcome.delivered, passRows);
    assert.equal(outcome.unacknowledged, 0);
    assert.equal(lane.retryDelayMs, initialDelay);
    delivered += outcome.delivered;
  }
  assert.equal(outcome.state, DRIVE.DRAINED);
  assert.equal(delivered, 435);
  assert.equal(lane.lastRetryDisposition, OBLIGATION_RETRY_DISPOSITION.NO_PENDING_WORK);
  assert.deepEqual(f.calls.flatMap((call) => call.ids), rows, 'every row once, in log order');
  assert.ok(f.calls.length < 435 / 100, 'vectors, not one call per row');
});

test('handleDeliveryFailure logs at debug level on backpressure and warn on other errors', () => {
  const debugCalls = [];
  const warnCalls = [];
  const tenure = {term: 1, generation: 1};
  const mockLane = {
    tenure,
    retryTimer: {state: 'idle', handle: null},
    retryDelayMs: 50,
    consecutiveBackpressure: 0,
  };
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
  const obligation = {
    eventKey: 'event-1',
    logIndex: 10,
    ordinal: 1,
  };

  const backpressureError = {message: 'busy', reason: CDC_COMPLETION.BACKPRESSURE};
  handleDeliveryFailure(mockDelivery, mockLane, obligation, 'error', false, backpressureError);
  assert.equal(debugCalls.length, 1, 'logged at debug level for backpressure');
  assert.equal(warnCalls.length, 0, 'did not log at warn level for backpressure');

  const transientError = {message: 'connection reset', reason: 'connection_reset'};
  handleDeliveryFailure(mockDelivery, mockLane, obligation, 'error', false, transientError);
  assert.equal(warnCalls.length, 1, 'logged at warn level for transient error');

  const causedBackpressureError = {message: 'busy', cause: {reason: CDC_COMPLETION.BACKPRESSURE}, retryAfterMs: 50};
  handleDeliveryFailure(mockDelivery, mockLane, obligation, 'error', false, causedBackpressureError);
  assert.equal(debugCalls.length, 2, 'logged at debug level for caused backpressure');
  assert.equal(warnCalls.length, 1, 'did not log at warn level for caused backpressure');
});

// Pins (unchanged invariant): an open acknowledgement batch waits for its
// flush deadline; a later drive neither flushes it prematurely nor strands
// it, the rows it acknowledges join the same batch, and the deadline proposes
// one CDC_DELIVERED. (Before recipient isolation the second drive was the
// continuation of a contended page yield; the shared slot that caused that
// yield no longer exists.)
test('an open ACK batch is preserved until its flush deadline across drives', async (t) => {
  const first = Array.from({length: 5}, (_unused, index) => `ack-batch-${index}`);
  const f = await fixture(t, {rows: first, subscribers: 1});
  const delivery = f.leader.cdcDelivery;
  f.behavior = (_index, events, _context, groupId) => recipientAnswer(events, groupId, true);

  const firstDrive = await f.drive();
  const lane = delivery.obligationLane;
  assert.equal(firstDrive.state, DRIVE.DRAINED);
  assert.equal(firstDrive.delivered, 5);
  assert.equal(lane.batch.events, 5, '5 acknowledged events accumulate in the open batch');
  assert.notEqual(lane.flushTimer, null, 'flush deadline timer is armed for the open batch');
  assert.equal(
    f.proposed.some((command) => command.type === PARTITION_CDC_COMMAND.DELIVERED),
    false,
    'no premature 5-event CDC_DELIVERED is proposed before bound or deadline',
  );

  // Seven more rows commit; their drive joins the same batch without
  // flushing the first 5 events as a separate Raft commit.
  for (let index = 5; index < 12; index += 1) addSourceRow(f.leader, `ack-batch-${index}`);
  await settleTicks();
  assert.equal(lane.batch.events, 12, 'the 7 later events join the open batch');
  assert.equal(
    f.proposed.filter((command) => command.type === PARTITION_CDC_COMMAND.DELIVERED).length,
    0,
    'a later drive does not flush an open batch whose flushTimer is still active',
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
