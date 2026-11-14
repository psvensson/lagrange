// The shipping window of the partition CDC obligation lane (quest
// cdc-obligation-range-shipping, records S-1 and design decisions 2 to 4):
// one integer of the lane tenure in [1, ACK_BATCH_MAX_EVENTS]. It starts at
// one entry, doubles after a range reached committed coverage while the window
// was what cut it, halves after a range that was attempted and left uncovered,
// and is left alone by typed backpressure and by provisional coverage. A
// member that can never be applied, or a range that never fits a recipient,
// therefore cannot hold the rows ahead of it. While the progress cell holds
// leaf coverage the same range is presented again (pinning); the cell is
// discarded when its rows were acknowledged meanwhile or the window fell
// below it.
//
// Owner path: PartitionCDCDelivery's obligation lane on the lane fixture, real
// application, ledger, subscription and acknowledgement owners; the recipients
// are the recipient model (an evidence ceiling of the source lane, never of a
// native message-group commit).
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {CDC_COMPLETION, CDC_COVERAGE_STATE, buildProvisionalCdcOutcome,
  unknownCdcAcceptance} from '../../src/cdc/cdc-delivery-outcome.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {PARTITION_CDC_OBLIGATION_BOUND as BOUND,
  PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE,
  PARTITION_CDC_OBLIGATION_FLUSH_STATE as FLUSH} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {OBLIGATION_RETRY_DISPOSITION, handleDeliveryFailure, scheduleDeliveryRetry} from
  '../../src/partition/partition-cdc-obligation-delivery.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {clearFixtureSingletons, resetFixtureSingletons, settleTicks} from
  '../test-helpers/participant-transaction-fixture.js';
import {RETRY_AFTER_MS, TABLE, addSourceRow, currentLaneOf as laneOf, fixture,
  primeShipWindow, shipWindowOf} from '../test-helpers/partition-cdc-lane-fixture.js';
import {DRIVE_STATE_IN_A_LEADING_LANE, FLUSH_STATE_IN_A_LEADING_LANE, RECIPIENT_FAULT,
  WINDOW_EFFECT, WINDOW_EFFECT_BY_COMPLETION, WINDOW_EFFECT_BY_COVERAGE,
  WINDOW_EFFECT_BY_FAULT, WINDOW_EFFECT_BY_RETRY_DISPOSITION, assertRecipientLogs,
  diagnosticsOf, installRecipientModel, runLaneToQuiescence} from
  '../test-helpers/partition-cdc-range-recipient-model.js';

const WARM_WINDOW = 8;
const HALVED_WINDOW = WARM_WINDOW / 2;

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const idsOf = (count, prefix) => Array.from({length: count}, (_unused, index) =>
  `${prefix}-${String(index).padStart(4, '0')}`);
const idsOfWaves = (model) => model.waves.map((wave) => wave.ids);
const rowsOfWaves = (model) => model.waves.map((wave) => wave.rows);
const faultFor = (model, rowIndex, leaf, ...kinds) =>
  model.faults.set(model.raw[rowIndex].eventKey, new Map([[leaf, kinds]]));
const sorted = (values) => [...values].sort();

// --- start, doubling, cap ---

test('the window starts at one entry and doubles after each committed range the window ' +
  'cut; a range that took every READY row leaves it', async (t) => {
  const rows = idsOf(40, 'grow');
  const f = await fixture(t, {rows, subscribers: 1});
  const model = installRecipientModel(f);
  assert.equal(shipWindowOf(f), 1, 'a lane starts at one entry per wave');
  await runLaneToQuiescence(f);
  assert.deepEqual(rowsOfWaves(model), [1, 2, 4, 8, 16, 9]);
  assert.deepEqual(model.waves.map((wave) => wave.window), [1, 2, 4, 8, 16, 32]);
  assert.equal(shipWindowOf(f), 32,
    'the last range was not cut by the window, so the window stays');
  assertRecipientLogs(model);
});

test('the window never passes ACK_BATCH_MAX_EVENTS and no range of ordinary entries is ' +
  'larger', async (t) => {
  const rows = idsOf(600, 'cap');
  const f = await fixture(t, {rows, subscribers: 1});
  const model = installRecipientModel(f);
  primeShipWindow(f, BOUND.ACK_BATCH_MAX_EVENTS / 2);
  await runLaneToQuiescence(f);
  assert.deepEqual(rowsOfWaves(model), [128, 256, 216]);
  assert.equal(Math.max(...model.waves.map((wave) => wave.window)),
    BOUND.ACK_BATCH_MAX_EVENTS);
  assert.equal(shipWindowOf(f), BOUND.ACK_BATCH_MAX_EVENTS);
  assertRecipientLogs(model);
});

test('a lone owed row, and a run the byte bound cut, do not widen the window', async (t) => {
  const big = 'x'.repeat(BOUND.SHIP_MAX_BYTES / 2);
  const insert = (id) => ({entryId: `bytes-${id}`,
    sql: `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`, params: [id, big]});
  const f = await fixture(t, {rows: [], subscribers: 1,
    statements: [insert('b0'), insert('b1'), insert('b2')]});
  const model = installRecipientModel(f);
  primeShipWindow(f, WARM_WINDOW);
  await runLaneToQuiescence(f);
  assert.deepEqual(idsOfWaves(model), [['b0'], ['b1'], ['b2']],
    'two of these rows pass the byte bound, so each ships alone');
  assert.equal(shipWindowOf(f), WARM_WINDOW, 'the byte bound cut every run, never the window');
  addSourceRow(f.leader, 'lone');
  await settleTicks();
  model.noteLedger();
  await runLaneToQuiescence(f);
  assert.deepEqual(idsOfWaves(model).at(-1), ['lone']);
  assert.equal(shipWindowOf(f), WARM_WINDOW);
});

// --- halving only after an attempted failure; unchanged otherwise ---

for (const fault of Object.values(RECIPIENT_FAULT)) {
  const effect = WINDOW_EFFECT_BY_FAULT[fault];
  test(`a recipient answering ${fault} for a three-row range leaves the window ${effect}, ` +
    'and every row is delivered once the fault clears', async (t) => {
    assert.ok(effect, `recipient fault ${fault} is classified`);
    const rows = idsOf(3, fault);
    const f = await fixture(t, {rows, subscribers: 1});
    const model = installRecipientModel(f);
    faultFor(model, 1, 0, fault);
    primeShipWindow(f, WARM_WINDOW);
    const outcome = await f.drive();
    assert.deepEqual(idsOfWaves(model), [rows], 'the whole range was presented once');
    assert.equal(shipWindowOf(f), effect === WINDOW_EFFECT.HALVED ? HALVED_WINDOW : WARM_WINDOW);
    assert.equal(outcome.state, fault === RECIPIENT_FAULT.PROVISIONAL ?
      DRIVE.PROVISIONAL : DRIVE.HELD_BY_SUBSCRIBER);
    assert.deepEqual(countCdcObligations(f.leader.db), {owed: 3, delivered: 0});
    assert.equal(diagnosticsOf(f).pendingAcknowledgements, 0,
      'nothing of an uncovered or provisional range is acknowledged');
    await runLaneToQuiescence(f);
    assertRecipientLogs(model);
    assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: 3});
  });
}

// How each CDC completion code reaches the lane as a recipient's answer for a
// whole range.
const ANSWER_BY_COMPLETION = Object.freeze({
  [CDC_COMPLETION.UNKNOWN]: () => unknownCdcAcceptance(),
  [CDC_COMPLETION.BACKPRESSURE]: () => unknownCdcAcceptance(CDC_COMPLETION.BACKPRESSURE),
  [CDC_COMPLETION.PROVISIONAL]: (events, groupId) =>
    buildProvisionalCdcOutcome(events, RETRY_AFTER_MS, groupId),
  [CDC_COMPLETION.INVALID]: () => {
    throw Object.assign(new Error(CDC_COMPLETION.INVALID), {code: CDC_COMPLETION.INVALID});
  },
});

test('every CDC completion code is classified by its effect on the window, and the lane ' +
  'follows the classification', async (t) => {
  assert.deepEqual(sorted(Object.keys(WINDOW_EFFECT_BY_COMPLETION)),
    sorted(Object.values(CDC_COMPLETION)), 'a new completion code needs a window decision');
  assert.deepEqual(sorted(Object.keys(ANSWER_BY_COMPLETION)),
    sorted(Object.values(CDC_COMPLETION)));
  for (const code of Object.values(CDC_COMPLETION)) {
    const rows = idsOf(3, `code-${code.length}`);
    const f = await fixture(t, {rows, subscribers: 1});
    let presented = 0;
    f.propagate = (_index, events, _context, groupId) => {
      presented += 1;
      return ANSWER_BY_COMPLETION[code](events, groupId);
    };
    primeShipWindow(f, WARM_WINDOW);
    await f.drive();
    assert.equal(presented, 1, code);
    assert.equal(shipWindowOf(f),
      WINDOW_EFFECT_BY_COMPLETION[code] === WINDOW_EFFECT.HALVED ? HALVED_WINDOW : WARM_WINDOW,
      `window after a range answered ${code}`);
  }
});

test('every coverage state is classified by its effect on the window', async (t) => {
  assert.deepEqual(sorted(Object.keys(WINDOW_EFFECT_BY_COVERAGE)),
    sorted(Object.values(CDC_COVERAGE_STATE)), 'a new coverage state needs a window decision');
  assert.equal(WINDOW_EFFECT_BY_COVERAGE[CDC_COVERAGE_STATE.UNCOVERED], WINDOW_EFFECT.HALVED);
  assert.equal(WINDOW_EFFECT_BY_COVERAGE[CDC_COVERAGE_STATE.PROVISIONAL], WINDOW_EFFECT.UNCHANGED);
  // COMMITTED: doubled when the window cut the range, unchanged when it did not.
  assert.equal(WINDOW_EFFECT_BY_COVERAGE[CDC_COVERAGE_STATE.COMMITTED],
    WINDOW_EFFECT.DOUBLED_WHEN_WINDOW_CUT);
  const rows = idsOf(5, 'coverage');
  const f = await fixture(t, {rows, subscribers: 1});
  const model = installRecipientModel(f);
  primeShipWindow(f, 2);
  await f.drive();
  assert.deepEqual(rowsOfWaves(model), [2, 3]);
  assert.deepEqual(model.waves.map((wave) => wave.window), [2, 4],
    'the two-row range was cut by the window and doubled it');
  assert.equal(shipWindowOf(f), 4, 'the three-row range took every READY row and left it');
});

test('every retry disposition is classified, and only an attempted failure halves the ' +
  'window', async (t) => {
  assert.deepEqual(sorted(Object.keys(WINDOW_EFFECT_BY_RETRY_DISPOSITION)),
    sorted(Object.values(OBLIGATION_RETRY_DISPOSITION)),
    'a new retry disposition needs a window decision');
  const f = await fixture(t, {rows: ['A'], subscribers: 1});
  const delivery = f.leader.cdcDelivery;
  const lane = laneOf(f);
  const held = [{eventKey: 'held-witness', logIndex: 1, ordinal: 0}];
  const errorFor = {
    [OBLIGATION_RETRY_DISPOSITION.TRANSIENT_FAILURE]: new Error('recipient refused'),
    [OBLIGATION_RETRY_DISPOSITION.BACKPRESSURE]:
      Object.assign(new Error('busy'), {reason: CDC_COMPLETION.BACKPRESSURE}),
    [OBLIGATION_RETRY_DISPOSITION.STALE_LIFETIME]:
      Object.assign(new Error('stale'), {stalePropagationLifetime: true}),
  };
  for (const disposition of Object.values(OBLIGATION_RETRY_DISPOSITION)) {
    lane.shipWindow = WARM_WINDOW;
    if (errorFor[disposition]) {
      handleDeliveryFailure(delivery, lane, held, 'window-witness', 0, errorFor[disposition]);
    } else {
      // Dispositions the lane only ever schedules itself, never from a failure.
      scheduleDeliveryRetry(delivery, null, disposition);
    }
    assert.equal(lane.lastRetryDisposition, disposition);
    assert.equal(lane.shipWindow,
      WINDOW_EFFECT_BY_RETRY_DISPOSITION[disposition] === WINDOW_EFFECT.HALVED ?
        HALVED_WINDOW : WARM_WINDOW, `window after ${disposition}`);
  }
});

test('the drive and flush states are all classified for a leading lane', () => {
  assert.deepEqual(sorted(Object.keys(DRIVE_STATE_IN_A_LEADING_LANE)),
    sorted(Object.values(DRIVE)), 'a new drive state needs a classification');
  assert.deepEqual(sorted(Object.keys(FLUSH_STATE_IN_A_LEADING_LANE)),
    sorted(Object.values(FLUSH)), 'a new flush state needs a classification');
});

test('a subscriber that is not ready, and acknowledgement backpressure, attempt nothing ' +
  'and leave the window', async (t) => {
  const rows = idsOf(BOUND.ACK_MAX_OUTSTANDING_BATCHES * BOUND.ACK_BATCH_MAX_EVENTS + 4,
    'unchanged');
  const f = await fixture(t, {rows, subscribers: 1});
  const model = installRecipientModel(f);
  primeShipWindow(f, BOUND.ACK_BATCH_MAX_EVENTS);
  f.ready = false;
  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.equal(model.waves.length, 0, 'a subscriber that is not ready is handed nothing');
  assert.equal(shipWindowOf(f), BOUND.ACK_BATCH_MAX_EVENTS);
  f.ready = true;
  let state = null;
  for (let drive = 0; drive < 4 && state !== DRIVE.ACKNOWLEDGEMENT_BACKPRESSURE; drive += 1) {
    state = (await f.drive()).state;
  }
  assert.equal(state, DRIVE.ACKNOWLEDGEMENT_BACKPRESSURE);
  assert.equal(shipWindowOf(f), BOUND.ACK_BATCH_MAX_EVENTS);
  assert.equal(model.waves.length, BOUND.ACK_MAX_OUTSTANDING_BATCHES);
});

test('a new leadership tenure starts the window at one entry again', async (t) => {
  const rows = idsOf(20, 'tenure');
  const f = await fixture(t, {rows, subscribers: 1});
  const model = installRecipientModel(f);
  await f.drive();
  assert.equal(shipWindowOf(f), 16);
  assert.deepEqual(rowsOfWaves(model), [1, 2, 4, 8, 5]);
  f.ready = false;
  f.leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
  f.leader.controllablePort.setRole(RAFT_ROLE.LEADER);
  await settleTicks();
  assert.equal(shipWindowOf(f), 1, 'the window is tenure state: a new lane, a cold window');
  f.ready = true;
  await f.drive();
  assert.deepEqual(rowsOfWaves(model).slice(5), [1, 2, 4, 8, 5],
    'the unacknowledged rows are shipped again from a cold window');
});

// --- a member that can never be applied ---

const POISON = Object.freeze({
  // The recipient can never apply this member: any range carrying it fails.
  RECIPIENT: 'recipient cannot apply the member',
  // The stored payload cannot be built into an event: the range cannot be built.
  LEDGER: 'the stored payload cannot be built',
});
const POISON_ROWS = 12;

function poisonRow(f, model, kind, raw) {
  if (kind === POISON.RECIPIENT) {
    const answer = f.propagate;
    f.poisoned = true;
    f.propagate = (index, events, context, groupId) => {
      if (f.poisoned && events.some((event) => event.eventKey === raw.eventKey)) {
        model.waves.push({index, ids: events.map((event) => event.data.id),
          keys: events.map((event) => event.eventKey), rows: events.length, poisoned: true});
        throw new Error('recipient model: this member can never be applied');
      }
      return answer(index, events, context, groupId);
    };
    return () => {
      f.poisoned = false;
    };
  }
  const update = f.leader.db.prepare('UPDATE _cdc_obligations SET event_json = ? ' +
    'WHERE event_key = ?');
  update.run('{"not json', raw.eventKey);
  return () => update.run(raw.eventJson, raw.eventKey);
}

for (const kind of Object.values(POISON)) {
  for (const [place, at] of [['head', 0], ['middle', 5], ['tail', POISON_ROWS - 1]]) {
    test(`a member that can never be applied (${kind}) at the ${place} of the owed run: ` +
      'the rows ahead of it are delivered and acknowledged, the lane holds at it with a ' +
      'window of one, and nothing after it is acknowledged', async (t) => {
      const rows = idsOf(POISON_ROWS, 'poison');
      const f = await fixture(t, {rows, subscribers: 2});
      const model = installRecipientModel(f);
      const poison = model.raw[at];
      const heal = poisonRow(f, model, kind, poison);
      primeShipWindow(f, WARM_WINDOW);
      const heldAtPoison = () => {
        const {lastDrive, shipWindow} = diagnosticsOf(f);
        return countCdcObligations(f.leader.db).delivered === at && shipWindow === 1 &&
          lastDrive?.state === DRIVE.HELD_BY_SUBSCRIBER && lastDrive.rows === 1 &&
          lastDrive.eventKey === poison.eventKey;
      };
      await runLaneToQuiescence(f, {until: heldAtPoison, label: `${kind} at ${place}`});
      assert.deepEqual(countCdcObligations(f.leader.db),
        {owed: POISON_ROWS - at, delivered: at});
      assert.deepEqual(model.acknowledged, model.raw.slice(0, at).map((row) => row.eventKey),
        'exactly the rows ahead of the poisoned one were acknowledged, in order');
      for (const log of model.logs) {
        const committed = log.flatMap((command) => command.members.map((member) =>
          member.eventKey));
        assert.equal(committed.includes(poison.eventKey), false,
          'no recipient committed a range carrying the poisoned member');
      }
      heal();
      await runLaneToQuiescence(f);
      assertRecipientLogs(model);
      assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: POISON_ROWS});
    });
  }
}

// --- a range that never fits ---

for (const fits of [1, 3]) {
  test(`a recipient that can never commit more than ${fits} row(s) in one range does not ` +
    'stop the lane: the window halves until a range fits and every row is delivered',
  async (t) => {
    const rows = idsOf(24, 'fits');
    const f = await fixture(t, {rows, subscribers: 1});
    const model = installRecipientModel(f);
    const answer = f.propagate;
    const refused = [];
    f.propagate = (index, events, context, groupId) => {
      if (events.length <= fits) return answer(index, events, context, groupId);
      refused.push(events.length);
      return unknownCdcAcceptance();
    };
    primeShipWindow(f, BOUND.ACK_BATCH_MAX_EVENTS);
    await runLaneToQuiescence(f);
    assert.equal(refused[0], rows.length, 'the first range was the whole owed run');
    assert.ok(refused.every((size, index) => index === 0 || size <= refused[index - 1] ||
      size <= 2 * fits), `refused range sizes: ${refused}`);
    assert.ok(Math.max(...rowsOfWaves(model)) <= fits, 'only ranges that fit were committed');
    assert.equal(model.waves.length > 0, true);
    assert.ok(shipWindowOf(f) <= 2 * fits, `the window settles near what fits: ${shipWindowOf(f)}`);
    assertRecipientLogs(model);
    assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: rows.length});
  });
}

// --- pinning ---

// Commit more source rows while the subscribers hold (no wave is presented),
// and tell the witness about them.
async function addRowsWhileHeld(f, model, ids) {
  f.ready = false;
  for (const id of ids) addSourceRow(f.leader, id);
  await settleTicks();
  model.noteLedger();
  f.ready = true;
}

// A held lane keeps the tail its scan captured. A handshake at a position
// that is already delivered (the first row of these witnesses) acknowledges
// nothing and restarts the idle scan, so the next pass captures the new tail.
function restartIdleScan(f, model) {
  model.hydratedThrough(model.raw[0].logIndex);
  assert.equal(laneOf(f).scan, null, 'the idle scan restarted');
}

test('a partially covered range is presented again unchanged although more rows were ' +
  'committed and the scan restarted: the covered leaf is not sent it again', async (t) => {
  const f = await fixture(t, {rows: ['done'], subscribers: 2});
  const model = installRecipientModel(f);
  await runLaneToQuiescence(f);
  await addRowsWhileHeld(f, model, ['A', 'B', 'C']);
  restartIdleScan(f, model);
  primeShipWindow(f, WARM_WINDOW);
  // Typed backpressure from the second leaf for the range starting at A: the
  // first leaf holds a committed receipt, and the window is left alone.
  faultFor(model, 1, 1, RECIPIENT_FAULT.BACKPRESSURE);
  const before = model.waves.length;
  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  const first = model.waves.slice(before);
  assert.deepEqual(first.map((wave) => [wave.index, wave.ids]),
    [[0, ['A', 'B', 'C']], [1, ['A', 'B', 'C']]]);
  assert.equal(shipWindowOf(f), WARM_WINDOW);
  // More rows are committed and a handshake below the range restarts the idle
  // scan: an unpinned composition would now take five rows.
  await addRowsWhileHeld(f, model, ['D', 'E']);
  restartIdleScan(f, model);
  const mark = model.waves.length;
  await f.drive();
  const again = model.waves.slice(mark);
  assert.deepEqual(again.map((wave) => [wave.index, wave.ids]),
    [[1, ['A', 'B', 'C']], [0, ['D', 'E']], [1, ['D', 'E']]],
    'only the uncovered leaf is presented the pinned range; the new rows follow');
  assert.equal(again[0].digest, first[0].digest, 'the identical vector, by digest');
  await runLaneToQuiescence(f);
  assertRecipientLogs(model);
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: 6});
});

test('a pinned range is rebuilt when a hydration image acknowledged one of its rows',
  async (t) => {
    const f = await fixture(t, {rows: ['A', 'B', 'C'], subscribers: 2});
    const model = installRecipientModel(f);
    primeShipWindow(f, WARM_WINDOW);
    faultFor(model, 0, 1, RECIPIENT_FAULT.BACKPRESSURE);
    await f.drive();
    assert.deepEqual(model.waves.map((wave) => [wave.index, wave.ids]),
      [[0, ['A', 'B', 'C']], [1, ['A', 'B', 'C']]]);
    const pinned = laneOf(f).currentObligation;
    assert.ok(pinned);
    // The image covers A only: the range in the cell no longer reads back.
    model.hydratedThrough(model.raw[0].logIndex);
    const mark = model.waves.length;
    await f.drive();
    assert.deepEqual(model.waves.slice(mark).map((wave) => [wave.index, wave.ids]),
      [[0, ['B', 'C']], [1, ['B', 'C']]],
      'a new range without the acknowledged row goes to every leaf');
    assert.notEqual(model.waves[mark].digest, model.waves[0].digest);
    await runLaneToQuiescence(f);
    assertRecipientLogs(model, {wholeEntries: false});
    assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: 3});
  });

test('a pinned range is rebuilt when the window fell below its row count', async (t) => {
  const rows = idsOf(4, 'narrow');
  const f = await fixture(t, {rows, subscribers: 2});
  const model = installRecipientModel(f);
  primeShipWindow(f, 4);
  // The second leaf refuses the four-row range: an attempted failure.
  faultFor(model, 0, 1, RECIPIENT_FAULT.UNKNOWN);
  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.equal(shipWindowOf(f), 2);
  assert.equal(laneOf(f).currentObligation.rows, 4);
  const mark = model.waves.length;
  await f.drive();
  assert.deepEqual(model.waves.slice(mark, mark + 2).map((wave) => [wave.index, wave.rows]),
    [[0, 2], [1, 2]], 'the narrower range is a new range for every leaf');
  await runLaneToQuiescence(f);
  assertRecipientLogs(model);
});

// --- a hydration image against the range in flight ---

for (const [where, imageAt, retired] of [
  ['below the range', 0, false],
  ['inside the range', 2, false],
  ['at the end of the range', 3, true],
]) {
  test(`a hydration image ${where} in flight ${retired ? 'retires' : 'does not retire'} ` +
    'its invocation, and every row above the image is delivered', async (t) => {
    const f = await fixture(t, {rows: ['done'], subscribers: 1});
    const gate = Promise.withResolvers();
    let invocation = null;
    const model = installRecipientModel(f);
    const answer = f.propagate;
    f.propagate = async (index, events, context, groupId) => {
      if (events.length === 3 && invocation === null) {
        invocation = f.leader.cdcDelivery.activeCdcInvocation;
        await gate.promise;
      }
      return answer(index, events, context, groupId);
    };
    await runLaneToQuiescence(f);
    await addRowsWhileHeld(f, model, ['A', 'B', 'C', 'D']);
    restartIdleScan(f, model);
    primeShipWindow(f, 3);
    const drive = f.drive();
    await settleTicks();
    assert.ok(invocation, 'the three-row range A, B, C is in flight');
    const cell = laneOf(f).currentObligation;
    assert.deepEqual([cell.first.logIndex, cell.last.logIndex, cell.rows],
      [model.raw[1].logIndex, model.raw[3].logIndex, 3]);
    model.hydratedThrough(model.raw[imageAt].logIndex);
    assert.equal(invocation.context.signal.aborted, retired);
    gate.resolve();
    await drive;
    await runLaneToQuiescence(f);
    assert.deepEqual(model.waves.at(-1).ids, ['D'], 'the row above the range follows it');
    assertRecipientLogs(model, {wholeEntries: false});
    assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: 5});
  });
}
