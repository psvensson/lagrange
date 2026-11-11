// Stage 2 of the CDC delivery repair (recipient isolation; design note
// solve/epics/operation-integrity-and-reliable-formation/
// cdc-delivery-design-note-2026-11-11.md, section 5): every recipient of a
// partition's obligation lane has its own volatile cursor and its own
// single-flight drive, and the lane acknowledges only at or below the lowest
// cursor. Deterministic source-lane witnesses on the real application,
// ledger, subscription and acknowledgement owners with controlled recipient
// answers, on virtual time (no wall-clock wait). Each recipient here is a
// subscriber of the partition, except in the witness marked (topology), where
// the recipients are the source group and a target group of one propagation
// through the real CDCGroupPropagationService. Isolation across tables is
// witnessed on real lanes in partition-cdc-topology-progress-currentness.test.js
// and at the topology owner in test/topology/cdc-group-propagation-service.test.js.
// Not proven here: a recipient's start position (Stage 3) and the
// not-yet-targetable window (targets still come from the sender's cache).
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import fc from 'fast-check';
import {CDC_COMPLETION, unknownCdcAcceptance} from '../../src/cdc/cdc-delivery-outcome.js';
import {PARTITION_CDC_OBLIGATION_BOUND as BOUND,
  PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE,
  PARTITION_CDC_RECIPIENT_STATE as RECIPIENT_STATE} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations, readCdcObligationProgress, readOwedCdcHead, readOwedCdcTail} from
  '../../src/partition/partition-cdc-obligation-ledger.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../../src/partition/partition-write-kernel.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {CDC_TABLE, clearFixtureSingletons, resetFixtureSingletons, settleTicks, track} from
  '../test-helpers/participant-transaction-fixture.js';
import {addSourceRow, commitAcknowledgements, fixture, recipientAnswer} from
  '../test-helpers/cdc-delivery-progress-fixture.js';
import {RESPONSE, SOURCE_GROUP, TARGET_GROUP, addTopologySourceRow, assertDebtWithoutAck,
  topologyProgressFixture} from '../test-helpers/cdc-topology-progress-fixture.js';
import {LATENCY_PROPAGATION_MODE} from '../../src/topology/latency-topology-constants.js';
import {setupConfig, teardownConfig} from '../topology/cdc-group-propagation-service-harness.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const X = 0;
const Y = 1;
const rowsOf = (count, tag = 'row') =>
  Array.from({length: count}, (_unused, index) => `${tag}-${index}`);
const idsFor = (f, index) => f.calls.filter((call) => call.index === index)
  .flatMap((call) => call.ids);
const recipientsOf = (f) => f.leader.cdcDelivery.getCdcObligationDiagnostics().recipients;
const recipientOf = (f, index) => recipientsOf(f)
  .find((recipient) => recipient.recipient === `progress-subscriber-${index}`);
// An answer that does not arrive while the witness runs: the delivery ends
// only with its invocation. (Released after the assertions, so that the
// partition's shutdown, which waits for raw work, can finish.)
const unanswered = [];
const never = () => {
  const gate = Promise.withResolvers();
  unanswered.push(gate);
  return gate.promise;
};
const releaseUnanswered = () => {
  while (unanswered.length > 0) unanswered.shift().resolve(unknownCdcAcceptance());
};
const INVOCATION_BUDGET_MS = 5000;

test('R2-1 isolation within a table: a recipient that never answers delays only itself', async (t) => {
  t.after(releaseUnanswered);
  const rows = rowsOf(50);
  const f = await fixture(t, {rows, subscribers: 2});
  f.behavior = (index, events, _context, groupId) =>
    index === X ? never() : recipientAnswer(events, groupId, true);

  track(f.drive());
  await settleTicks();
  assert.deepEqual(idsFor(f, Y), rows,
    'Y received every row in log order, with no virtual time elapsed');
  assert.equal(recipientOf(f, Y).cursor.logIndex, readOwedCdcHead(f.leader.db).logIndex +
    rows.length - 1, 'Y holds a committed receipt through the tail');
  assert.equal(recipientOf(f, Y).state, RECIPIENT_STATE.CONFIRMED);
  assert.deepEqual({cursor: recipientOf(f, X).cursor, state: recipientOf(f, X).state,
    position: recipientOf(f, X).position, inFlight: recipientOf(f, X).inFlight},
  {cursor: null, state: RECIPIENT_STATE.SUBSCRIBER_UNCONFIRMED,
    position: readOwedCdcHead(f.leader.db), inFlight: true},
  'X is the named unconfirmed recipient at the first row; its cursor has not moved');
  assert.equal(f.acks().length, 0, 'no CDC_DELIVERED names a row X has not confirmed');
  assert.equal(f.leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements, 0);
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: rows.length, delivered: 0});

  // X's invocation budget ends: X alone is retried; nothing else changes.
  f.clock.advance(INVOCATION_BUDGET_MS);
  await settleTicks();
  assert.equal(recipientOf(f, X).cursor, null);
  assert.equal(recipientOf(f, X).state, RECIPIENT_STATE.SUBSCRIBER_UNCONFIRMED,
    'the unconfirmed state is not terminal: X is retried, never dropped');
  assert.deepEqual(idsFor(f, Y), rows, 'Y is not sent anything again');
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: rows.length, delivered: 0});
  releaseUnanswered();
});

// The recipients of one propagation: the source group and one target group,
// through the real CDCGroupPropagationService, beside a second subscriber.
test('R2-1 (topology) a target group that never answers delays neither the source group nor ' +
  'the other subscriber, and bounds the deliveries in flight', async (t) => {
  setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
  t.after(teardownConfig);
  const f = await topologyProgressFixture(t);
  f.targetMode = RESPONSE.NATIVE;
  f.targetHold = Promise.withResolvers();
  t.after(() => f.targetHold.resolve());

  track(f.drive());
  await settleTicks();
  for (const id of ['B', 'C', 'D', 'E']) {
    addTopologySourceRow(f, id);
    await settleTicks();
  }
  assert.equal(f.sourceCalls.flat().length, 5, 'the source group applied every row');
  assert.deepEqual(f.sourceCalls.flat(), [...new Set(f.sourceCalls.flat())], 'each once');
  assert.equal(f.targetCalls.length, 1, 'the target has one vector in flight, unanswered');
  const recipients = f.leader.cdcDelivery.getCdcObligationDiagnostics().recipients;
  assert.deepEqual(recipients.map((recipient) => [recipient.groupId, recipient.state]), [
    [SOURCE_GROUP, RECIPIENT_STATE.CONFIRMED],
    [TARGET_GROUP, RECIPIENT_STATE.SUBSCRIBER_UNCONFIRMED],
    [null, RECIPIENT_STATE.CONFIRMED],
  ]);
  assertDebtWithoutAck(f, 5);
  const stats = f.topology.getStats();
  assert.equal(stats.activeDurableDeliveries, 1, 'only the held target delivery is in flight');
  assert.ok(stats.peakActiveDurableDeliveries <= 2,
    `at most one delivery per recipient of the propagation: ${stats.peakActiveDurableDeliveries}`);

  f.targetHold.resolve();
  await settleTicks();
  assert.equal(f.leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements, 5,
    'once the target confirmed, the frontier passes all five rows');
  assert.deepEqual(f.targetCalls.flatMap((call) => call.eventKeys), f.sourceCalls.flat(),
    'the target received every row once, in log order');
});

test('R2-1 (topology) two recipients that both refuse are each re-driven by their own retry ' +
  'only: one recipient\'s delivery never restarts another held recipient', async (t) => {
  setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
  t.after(teardownConfig);
  const f = await topologyProgressFixture(t);
  f.sourceMode = RESPONSE.UNKNOWN;
  f.targetMode = RESPONSE.UNKNOWN;

  const drive = await f.drive();
  assert.equal(drive.state, DRIVE.HELD_BY_SUBSCRIBER);
  await settleTicks();
  const attempts = {source: f.sourceCalls.length, target: f.targetCalls.length};
  assert.ok(attempts.source >= 1, 'the source group was asked');
  await settleTicks();
  await settleTicks();
  assert.deepEqual({source: f.sourceCalls.length, target: f.targetCalls.length}, attempts,
    'no delivery repeats without the recipient\'s own retry');
  const refused = f.leader.cdcDelivery.getCdcObligationDiagnostics().recipients
    .filter((recipient) => recipient.groupId !== null);
  assert.ok(refused.length >= 1);
  for (const recipient of refused) {
    assert.equal(recipient.running, false, `${recipient.recipient} is idle until its retry`);
    assert.equal(recipient.state, RECIPIENT_STATE.SUBSCRIBER_UNCONFIRMED);
  }
});

test('R2-2 frontier: acknowledgement stops at the slowest recipient; nothing at or above its ' +
  'first unconfirmed row is delivered or reclaimed', async (t) => {
  const CONFIRMED_BY_X = 20;
  const f = await fixture(t, {rows: rowsOf(CONFIRMED_BY_X), subscribers: 2});
  let xAnswers = true;
  f.behavior = (index, events, _context, groupId) => index === X && !xAnswers ?
    unknownCdcAcceptance() : recipientAnswer(events, groupId, true);
  assert.equal((await f.drive()).state, DRIVE.DRAINED);
  const frontier = f.leader.cdcDelivery.getCdcObligationDiagnostics().frontier;

  // X confirms nothing after row 20; Y confirms everything.
  xAnswers = false;
  f.ready = false;
  for (let index = CONFIRMED_BY_X; index < 60; index += 1) addSourceRow(f.leader, `row-${index}`);
  await settleTicks();
  f.ready = true;
  const held = await f.drive();
  assert.equal(held.state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.equal(held.unconfirmed.length, 1);
  assert.equal(held.unconfirmed[0].subscriber, 'progress-subscriber-0');
  assert.deepEqual(idsFor(f, Y), rowsOf(60), 'Y holds all 60 rows');
  assert.deepEqual(f.leader.cdcDelivery.getCdcObligationDiagnostics().frontier, frontier,
    'the frontier is X\'s cursor: it has not moved');
  assert.equal(recipientOf(f, X).position.logIndex, frontier.logIndex + 1);
  assert.equal(f.leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements,
    CONFIRMED_BY_X, 'only the rows both recipients confirmed are acknowledged');

  await commitAcknowledgements(f);
  assert.equal(Number(readCdcObligationProgress(f.leader.db).reclaimed), CONFIRMED_BY_X,
    'CDC_DELIVERED covers exactly rows 1 to 20');
  assert.equal(countCdcObligations(f.leader.db).owed, 40);
  assert.deepEqual(readOwedCdcHead(f.leader.db), recipientOf(f, X).position,
    'the owed head is the first row X has not confirmed');
});

test('R2-5 retention with an unanswering recipient is the existing owed-work backpressure: ' +
  'writes are refused at OWED_MAX_EVENTS and admitted again once it catches up', async (t) => {
  const f = await fixture(t, {rows: ['seed-row'], subscribers: 2});
  let xAnswers = false;
  f.behavior = (index, events, _context, groupId) => index === X && !xAnswers ?
    unknownCdcAcceptance() : recipientAnswer(events, groupId, true);
  f.ready = false;
  for (let index = 1; index < BOUND.OWED_MAX_EVENTS; index += 1) {
    addSourceRow(f.leader, `owed-${index}`);
  }
  await settleTicks();
  f.ready = true;
  let held;
  for (let drive = 0; drive < 20; drive += 1) held = await f.drive();
  assert.equal(held.state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.equal(idsFor(f, Y).filter((id, index, ids) => ids.indexOf(id) === index).length,
    BOUND.OWED_MAX_EVENTS, 'Y holds every owed row');
  assert.equal(countCdcObligations(f.leader.db).owed, BOUND.OWED_MAX_EVENTS,
    'backpressure, never a dropped obligation');
  const refused = track(f.leader.executeQuery(
    `INSERT INTO ${CDC_TABLE} (id, value) VALUES (?, ?)`, ['over-capacity', 'v'],
    {entryId: 'over-capacity'}));
  await settleTicks();
  assert.equal(refused.value?.failureCode, PARTITION_WRITE_LEADERSHIP_REFUSAL.CDC_CAPACITY);

  xAnswers = true;
  for (let round = 0; round < 40 && countCdcObligations(f.leader.db).owed > 0; round += 1) {
    await f.drive();
    await commitAcknowledgements(f);
  }
  assert.equal(countCdcObligations(f.leader.db).owed, 0, 'X caught up: the frontier reached the tail');
  assert.ok(idsFor(f, X).length >= BOUND.OWED_MAX_EVENTS);
  const admitted = track(f.leader.executeQuery(
    `INSERT INTO ${CDC_TABLE} (id, value) VALUES (?, ?)`, ['after-recovery', 'v'],
    {entryId: 'after-recovery'}));
  await settleTicks();
  assert.notEqual(admitted.value?.failureCode, PARTITION_WRITE_LEADERSHIP_REFUSAL.CDC_CAPACITY,
    'owed-work admission recovers with the frontier');
});

test('R2-4 leader change rebuilds every cursor from the ledger and ships again, idempotently',
  async (t) => {
    const f = await fixture(t, {rows: rowsOf(10), subscribers: 2});
    let xAnswers = true;
    f.behavior = (index, events, _context, groupId) => index === X && !xAnswers ?
      unknownCdcAcceptance() : recipientAnswer(events, groupId, true);
    assert.equal((await f.drive()).state, DRIVE.DRAINED);
    await commitAcknowledgements(f);
    assert.equal(Number(readCdcObligationProgress(f.leader.db).reclaimed), 10);

    // Y runs ahead to row 30; X stays at row 10.
    xAnswers = false;
    f.ready = false;
    for (let index = 10; index < 30; index += 1) addSourceRow(f.leader, `row-${index}`);
    await settleTicks();
    f.ready = true;
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.deepEqual(recipientOf(f, Y).cursor, readOwedCdcTail(f.leader.db), 'Y is at row 30');
    assert.deepEqual(recipientOf(f, X).position, readOwedCdcHead(f.leader.db),
      'X is unconfirmed at row 11');
    const callsBefore = f.calls.length;

    // A new tenure: no cursor survives; the ledger is the only memory.
    xAnswers = true;
    f.leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
    f.leader.controllablePort.setTerm(2);
    const tenure = f.leader.leadershipTenure;
    f.leader.controllablePort.setRole(RAFT_ROLE.LEADER);
    assert.notEqual(f.leader.leadershipTenure, tenure);
    assert.deepEqual(recipientsOf(f), [], 'the new tenure knows no recipient cursor');
    assert.equal((await f.drive()).state, DRIVE.DRAINED);
    const reshipped = f.calls.slice(callsBefore);
    const floor = rowsOf(30).slice(10);
    assert.deepEqual(reshipped.filter((call) => call.index === X).flatMap((call) => call.ids),
      floor, 'X is shipped from the ledger floor (row 11), in order');
    assert.deepEqual(reshipped.filter((call) => call.index === Y).flatMap((call) => call.ids),
      floor, 'Y too: its receipts above the floor were volatile; re-delivery is idempotent');
    await commitAcknowledgements(f);
    assert.equal(countCdcObligations(f.leader.db).owed, 0);
    assert.equal(Number(readCdcObligationProgress(f.leader.db).reclaimed), 30,
      'every row is delivered exactly once in the ledger');
  });

test('R2-6 retry isolation: a recipient that answers backpressure carries its own retry; ' +
  'the other ships its next vector without waiting for it', async (t) => {
  const f = await fixture(t, {rows: rowsOf(3), subscribers: 2});
  f.behavior = (index, events, _context, groupId) => index === X ?
    {...unknownCdcAcceptance(CDC_COMPLETION.BACKPRESSURE), retryAfterMs: 40} :
    recipientAnswer(events, groupId, true);
  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.equal(recipientOf(f, X).retryDueAtMs, f.clock.now() + 40, 'X honours its own hint');
  assert.equal(recipientOf(f, Y).retryDueAtMs, null, 'Y carries no retry');
  const xCalls = f.calls.filter((call) => call.index === X).length;
  addSourceRow(f.leader, 'later');
  await settleTicks();
  assert.deepEqual(idsFor(f, Y), [...rowsOf(3), 'later'],
    'Y received the next row with no virtual time elapsed');
  assert.ok(f.calls.filter((call) => call.index === X).length >= xCalls);
  assert.equal(recipientOf(f, X).cursor, null);
});

test('R2-7 a recovered recipient receives its backlog as bounded vectors in order and the ' +
  'frontier converges', async (t) => {
  const rows = rowsOf(600);
  const f = await fixture(t, {rows, subscribers: 2});
  let xAnswers = false;
  f.behavior = (index, events, _context, groupId) => index === X && !xAnswers ?
    unknownCdcAcceptance() : recipientAnswer(events, groupId, true);
  for (let drive = 0; drive < 6; drive += 1) await f.drive();
  assert.deepEqual(idsFor(f, Y), rows, 'Y converged while X was unconfirmed');
  assert.equal(f.acks().length, 0);

  xAnswers = true;
  const before = f.calls.length;
  for (let round = 0; round < 12 && countCdcObligations(f.leader.db).owed > 0; round += 1) {
    await f.drive();
    await commitAcknowledgements(f);
  }
  const recovery = f.calls.slice(before).filter((call) => call.index === X);
  assert.deepEqual(recovery.flatMap((call) => call.ids), rows, 'the whole backlog, in log order');
  assert.ok(recovery.every((call) => call.ids.length <= BOUND.SHIP_MAX_EVENTS));
  assert.ok(recovery.length <= 4, `bounded vectors, not rows: ${recovery.length} deliveries`);
  assert.equal(f.calls.slice(before).filter((call) => call.index === Y).length, 0,
    'Y is not sent the backlog again');
  assert.equal(countCdcObligations(f.leader.db).owed, 0);
});

test('R2-8 concurrency bound: a lane has at most one delivery in flight per recipient',
  async (t) => {
    const RECIPIENTS = 3;
    const f = await fixture(t, {rows: rowsOf(40), subscribers: RECIPIENTS});
    const inFlight = new Array(RECIPIENTS).fill(0);
    const peak = new Array(RECIPIENTS).fill(0);
    let peakTotal = 0;
    const gates = [];
    f.behavior = (index, events, _context, groupId) => {
      inFlight[index] += 1;
      peak[index] = Math.max(peak[index], inFlight[index]);
      peakTotal = Math.max(peakTotal, inFlight.reduce((sum, count) => sum + count, 0));
      const gate = Promise.withResolvers();
      gates.push(() => {
        inFlight[index] -= 1;
        gate.resolve(recipientAnswer(events, groupId, true));
      });
      return gate.promise;
    };
    const drive = track(f.drive());
    // Rows keep arriving and drives keep being requested while answers are held.
    for (let round = 0; round < 30; round += 1) {
      addSourceRow(f.leader, `arriving-${round}`);
      track(f.drive());
      await settleTicks();
      const release = gates.shift();
      if (release) release();
    }
    while (gates.length > 0) {
      gates.shift()();
      await settleTicks();
    }
    await drive.promise;
    assert.deepEqual(peak, new Array(RECIPIENTS).fill(1),
      'never two deliveries in flight for one recipient');
    assert.ok(peakTotal <= RECIPIENTS, `at most one per recipient in total: ${peakTotal}`);
    assert.equal(peakTotal, RECIPIENTS, 'and the recipients do run concurrently');
  });

test('R2-9 order per recipient is log order under any interleaving of completions', async () => {
  await fc.assert(fc.asyncProperty(
    fc.array(fc.nat(), {minLength: 12, maxLength: 60}),
    fc.array(fc.boolean(), {minLength: 12, maxLength: 60}),
    async (picks, refusals) => {
      resetFixtureSingletons();
      const rows = rowsOf(24);
      const cleanup = [];
      const f = await fixture({after: (fn) => cleanup.push(fn)}, {rows, subscribers: 3});
      const waiting = [];
      let step = 0;
      f.behavior = (index, events, _context, groupId) => {
        const gate = Promise.withResolvers();
        waiting.push(() => {
          const refuse = refusals[step % refusals.length];
          step += 1;
          gate.resolve(refuse ? unknownCdcAcceptance() : recipientAnswer(events, groupId, true));
        });
        return gate.promise;
      };
      try {
        track(f.drive());
        await settleTicks();
        // Complete the open deliveries in the order the run picked, adding
        // rows and wakes between them.
        for (const pick of picks) {
          if (waiting.length === 0) {
            track(f.drive());
            await settleTicks();
            if (waiting.length === 0) break;
          }
          waiting.splice(pick % waiting.length, 1)[0]();
          await settleTicks();
        }
        for (let index = 0; index < 3; index += 1) {
          const confirmed = [];
          let expected = 0;
          for (const call of f.calls.filter((entry) => entry.index === index)) {
            // Every vector starts at the recipient's cursor: the row after
            // the last one it confirmed, or (a refused vector) the same row.
            const first = rows.indexOf(call.ids[0]);
            assert.ok(first <= expected, `recipient ${index} skipped a row at ${call.ids[0]}`);
            assert.deepEqual(call.ids, rows.slice(first, first + call.ids.length),
              'a vector is a contiguous run of the log');
            confirmed.push(call.ids);
            expected = Math.max(expected, first + call.ids.length);
          }
        }
      } finally {
        while (waiting.length > 0) waiting.shift()();
        for (const fn of cleanup) await fn();
        clearFixtureSingletons();
      }
    }), {numRuns: 12});
});
