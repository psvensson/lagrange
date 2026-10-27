// Invocation/source-lifetime component witnesses. The existing controllable
// consensus fixture supplies role events to real PartitionService owners.
// There is no native election, admitted SQL debt or fabricated native receipt.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {CDC_OPERATION} from '../../src/constants/cdc.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {CDC_COMPLETION, buildProvisionalCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';
import {assertCdcDeliveryInvocation, beginCdcDeliveryInvocation, isCdcDeliveryInvocation} from
  '../../src/cdc/cdc-delivery-invocation.js';
import {PARTITION_CDC_OBLIGATION_DRIVE_STATE} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {PARTITION_ID, REPLICAS, TABLE, resetFixtureSingletons, clearFixtureSingletons,
  settleTicks, shutdownAll, startReplica} from '../test-helpers/participant-transaction-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

function delayedTimerClock() {
  // Both clocks use the existing scheduler. Only callback dispatch can lag
  // observed local time, as when the real event loop delays a due timer.
  const wall = new VirtualTimeSource({startMs: 100});
  const timers = new VirtualTimeSource({startMs: 100});
  const scheduled = [];
  const cleared = [];
  let fired = 0;
  return {
    now: () => wall.now(),
    setTimeout(callback, delay, ...args) {
      const run = () => {
        fired += 1;
        callback(...args);
      };
      const handle = timers.setTimeout(run, delay);
      scheduled.push({handle, delay, run});
      return handle;
    },
    clearTimeout(handle) {
      cleared.push(handle);
      timers.clearTimeout(handle);
    },
    setInterval: (callback, delay, ...args) => timers.setInterval(callback, delay, ...args),
    clearInterval: (handle) => timers.clearInterval(handle),
    elapse: (milliseconds) => wall.advance(milliseconds),
    dispatchDue: () => timers.advance(wall.now() - timers.now()),
    pendingTimerCount: () => timers.pendingTimerCount(),
    fired: () => fired,
    scheduled,
    cleared,
  };
}

function observe(promise) {
  const observed = {settled: false, value: undefined, error: undefined};
  observed.promise = Promise.resolve(promise).then((value) => {
    observed.value = value;
    observed.settled = true;
  }, (error) => {
    observed.error = error;
    observed.settled = true;
  });
  return observed;
}

function sourceEvent(key = 'invocation-component-write') {
  return {tableName: TABLE, operation: CDC_OPERATION.INSERT,
    data: {id: key, value: 'original', nested: {values: ['original']}},
    timestamp: new HLCTimestamp(1000, 0, 'source-component').toString(),
    sourcePartition: PARTITION_ID, sourceReplica: REPLICAS[0],
    eventKey: key, entryId: key, sourceLogIndex: 7, sourceOrdinal: 0};
}

function provisional(event) {
  // A canonical component return, not evidence that a real recipient applied.
  return buildProvisionalCdcOutcome([event], 1, 'component-recipient');
}

async function fixture(t) {
  const clock = delayedTimerClock();
  const leader = await startReplica(REPLICAS[0], {timeSource: clock, generationOrigin: false});
  const contexts = new Set();
  const gates = new Set();
  const pending = new Set();
  t.after(async () => {
    leader.timeSource = clock;
    for (const context of contexts) context.retire();
    for (const gate of gates) gate.resolve();
    await settleTicks();
    await Promise.all([...pending].map((item) => item.promise));
    await shutdownAll(leader);
  });
  leader.controllablePort.setRole(RAFT_ROLE.LEADER);
  assert.equal(leader.isLeader, true, 'controlled role event reached the real leadership owner');
  assert.ok(leader.leadershipTenure, 'the production owner minted the component tenure');
  const trackContext = (context) => {
    assert.equal(isCdcDeliveryInvocation(context), true);
    contexts.add(context);
    return context;
  };
  return {leader, delivery: leader.cdcDelivery, clock, contexts,
    gate() {
      const gate = Promise.withResolvers();
      gates.add(gate);
      return gate;
    },
    observe(promise) {
      const observed = observe(promise);
      pending.add(observed);
      return observed;
    },
    trackContext,
    begin(onClosed = () => {}) {
      const tenure = leader.leadershipTenure;
      return trackContext(beginCdcDeliveryInvocation(leader.cdcDelivery,
        () => leader.isLeader && leader.leadershipTenure === tenure, onClosed));
    },
  };
}

function assertUnknown(answer) {
  assert.equal(answer.settled, true, 'the caller received a finite retaining refusal');
  assert.equal(answer.error?.code, CDC_COMPLETION.UNKNOWN);
  assert.equal(answer.error?.deferRetry, true);
  assert.equal(answer.value, undefined);
}

async function assertBackpressure(f) {
  let entered = 0;
  const response = f.observe(f.delivery.deliverCDCEventToSubscriber((event) => {
    entered += 1;
    return provisional(event);
  }, sourceEvent('must-not-dispatch')));
  await response.promise;
  assert.equal(response.error?.code, CDC_COMPLETION.BACKPRESSURE);
  assert.equal(entered, 0, 'occupied cleanup custody prevents new callback/payload work');
}

async function assertFreshAdmission(f) {
  let entered = 0;
  const result = await f.delivery.deliverCDCEventToSubscriber((event, context) => {
    f.trackContext(context);
    entered += 1;
    return provisional(event);
  }, sourceEvent('fresh-admission'));
  assert.equal(result.error, CDC_COMPLETION.PROVISIONAL);
  assert.equal(entered, 1, 'actual settlement makes capacity available again');
}

test('PartitionCDCDelivery captures immutable events and carries its context', async (t) => {
  const f = await fixture(t);
  const input = sourceEvent();
  const expected = structuredClone(input);
  let seen;
  let context;
  const response = f.observe(f.delivery.deliverCDCEventToSubscriber((event, invocation) => {
    context = f.trackContext(invocation);
    seen = event;
    assertCdcDeliveryInvocation(invocation);
    return provisional(event);
  }, input));
  input.data.value = 'caller-mutated';
  input.data.nested.values.push('caller-mutated');
  input.timestamp = 'later-caller-value';
  await response.promise;
  assert.equal(response.error, undefined);
  assert.equal(response.value.error, CDC_COMPLETION.PROVISIONAL);
  assert.deepEqual(seen, expected);
  assert.equal(Object.isFrozen(seen), true);
  assert.equal(Object.isFrozen(seen.data.nested.values), true);
  assert.equal(Object.hasOwn(seen, 'deliveryContext'), false);
  await context.cleanup;
  assert.throws(() => assertCdcDeliveryInvocation(context), {code: CDC_COMPLETION.UNKNOWN});
});

test('invocation refuses a late fulfillment at the deadline before its timer callback runs',
  async (t) => {
    const f = await fixture(t);
    const context = f.begin();
    const held = f.gate();
    const response = f.observe(context.run(() => held.promise));
    await settleTicks();
    const remaining = context.remainingMs();
    assert.ok(remaining > 0);
    const firedBefore = f.clock.fired();
    f.clock.elapse(remaining);
    assert.equal(f.clock.fired(), firedBefore, 'the due timer callback has deliberately not run');
    held.resolve({ordinaryHandlerValue: 'too-late'});
    await settleTicks();
    assertUnknown(response);
    assert.equal(context.signal.aborted, true);
    await context.cleanup;
    await assertFreshAdmission(f);
  });

test('invocation checks the spent budget before queued local work begins', async (t) => {
  const f = await fixture(t);
  const context = f.begin();
  let entered = 0;
  const response = f.observe(context.run(() => {
    entered += 1;
    return 'not-accepted';
  }));
  f.clock.elapse(context.remainingMs());
  await settleTicks();
  assertUnknown(response);
  assert.equal(entered, 0);
  await context.cleanup;
});

test('spent delivery retains capacity until every actual local child settles', async (t) => {
  const f = await fixture(t);
  const handler = f.gate();
  const child = f.gate();
  let context;
  let captured;
  const response = f.observe(f.delivery.deliverCDCEventToSubscriber((event, invocation) => {
    captured = event;
    context = f.trackContext(invocation);
    invocation.ownChild(child.promise);
    return handler.promise;
  }, sourceEvent()));
  await settleTicks();
  const cleanup = f.observe(context.cleanup);
  f.clock.elapse(context.remainingMs());
  f.clock.dispatchDue();
  await settleTicks();
  assertUnknown(response);
  assert.equal(cleanup.settled, false);
  await assertBackpressure(f);
  handler.resolve(provisional(captured));
  await settleTicks();
  assert.equal(cleanup.settled, false,
    'settled public handler is not settlement of its held child');
  await assertBackpressure(f);
  child.resolve('actual-child-closed');
  await settleTicks();
  assert.equal(cleanup.settled, true);
  await assertFreshAdmission(f);
});

test('tenure changes retain cleanup custody and fence old answers', async (t) => {
  const f = await fixture(t);
  const handler = f.gate();
  const child = f.gate();
  let context;
  let captured;
  let entered = 0;
  const response = f.observe(f.delivery.deliverCDCEventToSubscriber((event, invocation) => {
    entered += 1;
    captured = event;
    context = f.trackContext(invocation);
    invocation.ownChild(child.promise);
    return handler.promise;
  }, sourceEvent()));
  await settleTicks();
  const cleanup = f.observe(context.cleanup);
  for (let turn = 0; turn < 3; turn += 1) {
    const previous = f.leader.leadershipTenure;
    f.leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
    f.leader.controllablePort.setTerm(turn + 2);
    f.leader.controllablePort.setRole(RAFT_ROLE.LEADER);
    assert.notEqual(f.leader.leadershipTenure, previous);
    const drive = await f.delivery.driveCdcObligations('component-tenure-change');
    assert.equal(drive.state, PARTITION_CDC_OBLIGATION_DRIVE_STATE.JOINED_IN_FLIGHT);
    await settleTicks();
    assertUnknown(response);
    assert.equal(cleanup.settled, false);
    await assertBackpressure(f);
    assert.equal(entered, 1, 'resetting the source lane cannot create detached callback tails');
  }
  handler.resolve(provisional(captured));
  await settleTicks();
  assertUnknown(response);
  assert.equal(cleanup.settled, false);
  child.resolve();
  await settleTicks();
  assert.equal(cleanup.settled, true);
  await assertFreshAdmission(f);
});

test('real source shutdown fences the response and retains SQLite custody until child cleanup',
  async (t) => {
    const f = await fixture(t);
    const handler = f.gate();
    const child = f.gate();
    const db = f.leader.db;
    let captured;
    const response = f.observe(f.delivery.deliverCDCEventToSubscriber((event, invocation) => {
      f.trackContext(invocation);
      captured = event;
      invocation.ownChild(child.promise);
      return handler.promise;
    }, sourceEvent()));
    await settleTicks();
    const shutdown = f.observe(f.leader.shutdown());
    await settleTicks();
    assertUnknown(response);
    assert.equal(shutdown.settled, false, 'SHUTDOWN_STARTED fences before waiting for raw work');
    assert.equal(db.open, true,
      'the real persistence owner retains the connection while work is held');
    await assertBackpressure(f);
    handler.resolve(provisional(captured));
    await settleTicks();
    assert.equal(shutdown.settled, false);
    child.resolve();
    await settleTicks();
    assert.equal(shutdown.settled, true);
    assert.equal(shutdown.error, undefined);
    assert.equal(db.open, false);
    let entered = 0;
    const after = f.observe(f.delivery.deliverCDCEventToSubscriber(() => {
      entered += 1;
    }, sourceEvent('after-shutdown')));
    await after.promise;
    assertUnknown(after);
    assert.equal(entered, 0);
  });

test('cleanup uses the creating clock and stale callbacks cannot release a successor',
  async (t) => {
    const f = await fixture(t);
    let closed = 0;
    const before = f.clock.scheduled.length;
    const context = f.begin(() => {
      closed += 1;
    });
    const [timer] = f.clock.scheduled.slice(before);
    assert.ok(timer);
    const replacementClock = delayedTimerClock();
    f.leader.timeSource = replacementClock;
    context.finish();
    await context.cleanup;
    assert.equal(f.clock.cleared.includes(timer.handle), true);
    assert.deepEqual(replacementClock.cleared, []);
    assert.equal(closed, 1);
    f.leader.timeSource = f.clock;
    const successor = f.begin();
    timer.run(); // The original due callback was already queued before cancellation.
    context.finish();
    context.retire();
    assert.equal(closed, 1);
    assert.doesNotThrow(() => assertCdcDeliveryInvocation(successor));
    await assertBackpressure(f);
    successor.finish();
    await successor.cleanup;
  });

test('copied or counterfeit invocation contexts are refused before subscriber work', async (t) => {
  const f = await fixture(t);
  const context = f.begin();
  let invoked = 0;
  let asserted = 0;
  const counterfeit = {
    assertCurrent() {
      asserted += 1;
    },
    run: (operation) => operation(), ownChild: (value) => value,
    remainingMs: () => Number.MAX_SAFE_INTEGER, finish() {}, retire() {},
  };
  for (const candidate of [{}, counterfeit, {...context}, Object.create(context)]) {
    assert.equal(isCdcDeliveryInvocation(candidate), false);
    assert.throws(() => assertCdcDeliveryInvocation(candidate), {code: CDC_COMPLETION.INVALID});
    const response = f.observe(f.delivery.deliverCDCEventToSubscriber(() => {
      invoked += 1;
    }, sourceEvent(), candidate));
    await response.promise;
    assert.equal(response.error?.code, CDC_COMPLETION.INVALID);
  }
  assert.equal(invoked, 0);
  assert.equal(asserted, 0, 'the boundary checks its brand before calling a supplied method');
  context.finish();
  await context.cleanup;
});

test('a rejected owned child settles cleanup without a detached rejecting tail', async (t) => {
  const f = await fixture(t);
  let closed = 0;
  const context = f.begin(() => {
    closed += 1;
  });
  const child = f.gate();
  context.ownChild(child.promise);
  const cleanup = f.observe(context.cleanup);
  context.finish();
  assert.equal(cleanup.settled, false);
  // Deliberately no test-installed catch on this raw child. Its production
  // custody owner must consume rejection; node:test also detects detached tails.
  child.reject(new Error('actual-child-rejection'));
  await settleTicks();
  assert.equal(cleanup.settled, true);
  assert.equal(cleanup.error, undefined);
  assert.equal(closed, 1);
  await assertFreshAdmission(f);
});

test('invocation preserves an ordinary early rejection and spends one local budget across runs',
  async (t) => {
    const f = await fixture(t);
    const context = f.begin();
    const original = context.remainingMs();
    f.clock.elapse(1);
    const first = await context.run(() => context.remainingMs());
    assert.equal(first, original - 1);
    f.clock.elapse(1);
    const failure = new Error('early-handler-failure');
    const response = f.observe(context.run(() => {
      throw failure;
    }));
    await response.promise;
    assert.equal(response.error, failure);
    assert.equal(context.remainingMs(), original - 2);
    context.finish();
    await context.cleanup;
  });

for (const asynchronous of [false, true]) {
  for (const reportingFails of [false, true]) {
    test(`cleanup notification failure remains owned: async=${asynchronous}, ` +
      `reportingFails=${reportingFails}`, async (t) => {
      const f = await fixture(t);
      const notificationError = new Error('cleanup-observer-failure');
      const reportingError = new Error('cleanup-diagnostic-failure');
      const originalError = new Error('original-delivery-failure');
      const logger = f.leader.logger;
      const reports = [];
      let notifications = 0;
      f.leader.logger = Object.assign(Object.create(logger), {
        error(message, detail) {
          reports.push({message, detail});
          if (reportingFails) throw reportingError;
        },
      });
      try {
        const context = f.begin(() => {
          notifications += 1;
          if (asynchronous) return Promise.reject(notificationError);
          throw notificationError;
        });
        const child = f.gate();
        context.ownChild(child.promise);
        const response = f.observe(context.run(() => {
          throw originalError;
        }));
        await response.promise;
        const cleanup = f.observe(context.cleanup);
        context.finish();
        assert.equal(notifications, 0, 'notification cannot precede actual child closure');
        assert.equal(cleanup.settled, false);
        await assertBackpressure(f);
        child.resolve();
        await cleanup.promise;
        assert.equal(cleanup.error, undefined, 'notification failure cannot detach cleanup');
        assert.equal(cleanup.value.closed, true);
        assert.equal(cleanup.value.notificationFailure.error, notificationError);
        assert.equal(cleanup.value.notificationFailure.reportingError,
          reportingFails ? reportingError : undefined);
        assert.equal(Object.isFrozen(cleanup.value), true);
        assert.equal(Object.isFrozen(cleanup.value.notificationFailure), true);
        assert.equal(response.error, originalError, 'cleanup cannot replace the caller result');
        assert.equal(reports.length, 1);
        assert.equal(reports[0].detail.error, notificationError.message);
        context.finish();
        assert.equal(notifications, 1, 'one closed invocation notifies exactly once');
        await assertFreshAdmission(f);
      } finally {
        f.leader.logger = logger;
      }
    });
  }
}
