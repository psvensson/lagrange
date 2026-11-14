// The differential property of range shipping (quest
// cdc-obligation-range-shipping, final coverage model): for a generated ledger
// and a fault schedule keyed by row identity, the windowed lane and the same
// lane with its shipping window held at one entry give the same result at
// entry granularity.
//
// For each recipient leaf, read from its committed command log and compared
// with the raw ledger rows (event_json read by SQL, never through the lane's
// event builder or the CDC envelope capture):
//   (i)   every owed occurrence at least once, each unchanged; with faults that
//         hold the lane, first occurrences in (log_index, ordinal) order;
//   (ii)  every row eventually delivered, none named by a CDC_DELIVERED before
//         every leaf holds a committed receipt for a range containing it;
//   (iii) nothing dropped, split inside an entry, merged or reordered;
//   (iv)  held at one, every range is exactly one ledger entry.
// Provisional answers let the lane pass a row (the lane's rule before ranges
// too), so schedules that contain them claim (i) without the order.
//
// The generator is seeded and uses no wall-clock time; every test names its
// seed. The recipients are the recipient model: an evidence ceiling of the
// source lane, never of a native message-group commit.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {CDC_OPERATION} from '../../src/constants/index.js';
import {PARTITION_CDC_OBLIGATION_BOUND as BOUND} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {clearFixtureSingletons, resetFixtureSingletons} from
  '../test-helpers/participant-transaction-fixture.js';
import {TABLE, addSourceEntry, commitSourceStatement, fixture, holdShipWindow} from
  '../test-helpers/partition-cdc-lane-fixture.js';
import {RECIPIENT_FAULT, assertRecipientLogs, firstOccurrences, flattenLog,
  installRecipientModel, runLaneToQuiescence} from
  '../test-helpers/partition-cdc-range-recipient-model.js';

const HOLDING_FAULTS = Object.freeze([RECIPIENT_FAULT.UNKNOWN,
  RECIPIENT_FAULT.COMMITTED_UNKNOWN, RECIPIENT_FAULT.THROW, RECIPIENT_FAULT.BACKPRESSURE]);
const PASSING_FAULTS = Object.freeze([...HOLDING_FAULTS, RECIPIENT_FAULT.PROVISIONAL]);
const FAMILY = Object.freeze({
  HOLDING: {name: 'faults that hold the lane', faults: HOLDING_FAULTS, ordered: true,
    hydration: false, seeds: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]},
  PASSING: {name: 'faults including provisional coverage', faults: PASSING_FAULTS,
    ordered: false, hydration: false, seeds: [31, 32, 33, 34, 35, 36]},
  HYDRATION: {name: 'faults that hold the lane and a hydration image in flight',
    faults: HOLDING_FAULTS, ordered: true, hydration: true, seeds: [51, 52, 53, 54, 55, 56]},
});
const FAULTED_ROW_SHARE = 0.18;
const MAX_FAULTS_PER_ROW = 3;
const LARGE_ROW_SHARE = 0.08;
const OVERSIZED_ROW_SHARE = 0.03;
const LATE_SHARE = 0.25;

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

// Mulberry32: a small deterministic generator; the seed is the whole state.
function generatorOf(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a: a row identity's own stream, so its faults do not depend on when
// the row was committed or presented.
function hashOf(text) {
  let hash = 0x811C9DC5;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash;
}

const below = (random, bound) => Math.floor(random() * bound);
const pick = (random, values) => values[below(random, values.length)];

function valueOf(random, tag) {
  const share = random();
  if (share < OVERSIZED_ROW_SHARE) return `${tag}:`.padEnd(BOUND.SHIP_MAX_BYTES + 512, 'o');
  if (share < OVERSIZED_ROW_SHARE + LARGE_ROW_SHARE) {
    return `${tag}:`.padEnd(40_000 + below(random, 80_000), 'l');
  }
  return `${tag}:${below(random, 1_000_000)}`;
}

// The source work of one case, in commit order: single statements (inserts,
// updates and deletes of live keys, so one key gets several versions) and
// multi-statement transaction entries (several ordinals of one log index).
function planOf(seed) {
  const random = generatorOf(seed);
  const live = [];
  const steps = [];
  const count = 10 + below(random, 22);
  for (let index = 0; index < count; index += 1) {
    const tag = `s${seed}-${index}`;
    const share = random();
    if (share < 0.2 && live.length > 0) {
      steps.push({kind: 'update', entryId: tag, id: pick(random, live),
        value: valueOf(random, tag)});
    } else if (share < 0.3 && live.length > 1) {
      const id = live.splice(below(random, live.length), 1)[0];
      steps.push({kind: 'delete', entryId: tag, id});
    } else if (share < 0.5) {
      const ids = Array.from({length: 2 + below(random, 4)}, (_unused, at) => `${tag}-${at}`);
      steps.push({kind: 'entry', tag, rows: ids.map((id) => ({id, value: valueOf(random, id)}))});
      live.push(...ids);
    } else {
      steps.push({kind: 'insert', entryId: tag, id: tag, value: valueOf(random, tag)});
      live.push(tag);
    }
  }
  const late = Math.floor(count * LATE_SHARE);
  return {seed, leaves: 1 + below(random, 3), steps, initial: count - late,
    // Late work is committed when this initial row (by position) is first presented.
    lateAt: below(random, Math.max(1, count - late)),
    // A hydration image through this row (by position), taken when that other
    // row is first presented.
    imageThrough: below(random, count), imageAt: below(random, count)};
}

function commitStep(leader, step) {
  if (step.kind === 'entry') {
    addSourceEntry(leader, step.tag, step.rows.map(({id, value}) =>
      ({sql: `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`, params: [id, value]})));
    return step.rows.length;
  }
  const statement = {
    insert: {sql: `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`, params: [step.id, step.value]},
    update: {sql: `UPDATE ${TABLE} SET value = ? WHERE id = ?`, params: [step.value, step.id]},
    delete: {sql: `DELETE FROM ${TABLE} WHERE id = ?`, params: [step.id]},
  }[step.kind];
  commitSourceStatement(leader, {entryId: step.entryId, ...statement});
  return 1;
}

// The faults of one row: decided by the seed and the row's identity alone.
function faultsOf(plan, family, eventKey) {
  const random = generatorOf(hashOf(`${plan.seed}:${eventKey}`));
  if (random() >= FAULTED_ROW_SHARE) return null;
  const leaf = below(random, plan.leaves);
  const kinds = Array.from({length: 1 + below(random, MAX_FAULTS_PER_ROW)},
    () => pick(random, family.faults));
  return new Map([[leaf, kinds]]);
}

async function runLane(t, plan, family, {heldAtOne}) {
  const initial = plan.steps.slice(0, plan.initial);
  const late = plan.steps.slice(plan.initial);
  const f = await fixture(t, {rows: [], subscribers: plan.leaves,
    populate: (leader) => initial.reduce((owed, step) => owed + commitStep(leader, step), 0)});
  const pending = {late: late.length > 0, image: family.hydration};
  const model = installRecipientModel(f, {onWave: (wave) => {
    const presented = (position) => wave.keys.includes(model.raw[position]?.eventKey);
    if (pending.late && presented(plan.lateAt)) {
      pending.late = false;
      for (const step of late) commitStep(f.leader, step);
      learnLedger();
    }
    if (pending.image && presented(Math.min(plan.imageAt, model.raw.length - 1))) {
      pending.image = false;
      model.hydratedThrough(
        model.raw[Math.min(plan.imageThrough, model.raw.length - 1)].logIndex);
    }
  }});
  const known = new Set();
  function learnLedger() {
    for (const row of model.noteLedger()) {
      if (known.has(row.eventKey)) continue;
      known.add(row.eventKey);
      const faults = faultsOf(plan, family, row.eventKey);
      if (faults !== null) model.faults.set(row.eventKey, faults);
    }
  }
  learnLedger();
  if (heldAtOne) holdShipWindow(f, 1);
  const label = `seed ${plan.seed} (${heldAtOne ? 'window held at 1' : 'windowed'})`;
  await runLaneToQuiescence(f, {label, maxRounds: 1500});
  assert.equal(pending.late, false, `${label}: the late source work was committed`);
  assertRecipientLogs(model, {label, ordered: family.ordered,
    wholeEntries: !family.hydration});
  assert.deepEqual(countCdcObligations(f.leader.db),
    {owed: 0, delivered: model.raw.length}, label);
  assert.equal(new Set(model.acknowledged).size, model.acknowledged.length,
    `${label}: no row is acknowledged twice`);
  assert.deepEqual([...model.acknowledged].sort(),
    model.raw.map((row) => row.eventKey).sort(), `${label}: every row is acknowledged`);
  return {f, model, label};
}

// One leaf's committed log at entry granularity: the first occurrence of
// every required row, grouped by ledger entry.
function entriesOf(model, leaf, ordered) {
  const logIndexOf = new Map(model.raw.map((row) => [row.eventKey, row.logIndex]));
  const required = firstOccurrences(model.logs[leaf])
    .filter((key) => logIndexOf.get(key) > model.hydratedThroughLogIndex);
  const entries = [];
  for (const key of ordered ? required : [...required].sort()) {
    const logIndex = logIndexOf.get(key);
    if (entries.at(-1)?.logIndex === logIndex) entries.at(-1).keys.push(key);
    else entries.push({logIndex, keys: [key]});
  }
  return ordered ? entries : entries.sort((left, right) => left.logIndex - right.logIndex);
}

for (const family of Object.values(FAMILY)) {
  for (const seed of family.seeds) {
    test(`differential, ${family.name}, seed ${seed}: the windowed lane and the lane held ` +
      'at one entry agree at entry granularity', async (t) => {
      const plan = planOf(seed);
      const windowed = await runLane(t, plan, family, {heldAtOne: false});
      const reference = await runLane(t, plan, family, {heldAtOne: true});
      assert.deepEqual(windowed.model.raw, reference.model.raw,
        `seed ${seed}: both lanes ran over the same ledger`);
      // (iv) held at one, every range is exactly one ledger entry.
      const logIndexOf = new Map(reference.model.raw.map((row) => [row.eventKey, row.logIndex]));
      for (const wave of reference.model.waves) {
        assert.equal(new Set(wave.keys.map((key) => logIndexOf.get(key))).size, 1,
          `seed ${seed}: a range of the held lane is one ledger entry`);
      }
      // A hydration image is taken at the same row identity in both lanes, but
      // the rows already delivered by then differ, so the claim is made for
      // the rows above the image of both.
      const image = Math.max(windowed.model.hydratedThroughLogIndex,
        reference.model.hydratedThroughLogIndex);
      windowed.model.hydratedThroughLogIndex = image;
      reference.model.hydratedThroughLogIndex = image;
      for (let leaf = 0; leaf < plan.leaves; leaf += 1) {
        assert.deepEqual(entriesOf(windowed.model, leaf, family.ordered),
          entriesOf(reference.model, leaf, family.ordered),
          `seed ${seed}: leaf ${leaf} committed the same entries` +
          (family.ordered ? ' in the same order' : ''));
      }
    });
  }
}

// --- literal anchors ---
//
// Values written here, not derived from the ledger or from any helper the
// lane shares: what a recipient's committed command log must hold for a fixed
// ledger, through both wire shapes (a one-member CDC command and a CDC_BATCH).
const LITERAL_STATEMENTS = Object.freeze([
  {entryId: 'lit-insert-k', sql: `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`,
    params: ['K', 'first']},
  {entryId: 'lit-update-k', sql: `UPDATE ${TABLE} SET value = ? WHERE id = ?`,
    params: ['second', 'K']},
  {entryId: 'lit-insert-m', sql: `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`,
    params: ['M', 'only']},
  {entryId: 'lit-update-k-again', sql: `UPDATE ${TABLE} SET value = ? WHERE id = ?`,
    params: ['third', 'K']},
  {entryId: 'lit-delete-m', sql: `DELETE FROM ${TABLE} WHERE id = ?`, params: ['M']},
]);
const LITERAL_MEMBERS = Object.freeze([
  {eventKey: 'entry:lit-insert-k', operation: CDC_OPERATION.INSERT, id: 'K', value: 'first'},
  {eventKey: 'entry:lit-update-k', operation: CDC_OPERATION.UPDATE, id: 'K', value: 'second'},
  {eventKey: 'entry:lit-insert-m', operation: CDC_OPERATION.INSERT, id: 'M', value: 'only'},
  {eventKey: 'entry:lit-update-k-again', operation: CDC_OPERATION.UPDATE, id: 'K',
    value: 'third'},
  {eventKey: 'entry:lit-delete-m', operation: CDC_OPERATION.DELETE, id: 'M', value: undefined},
]);

function literalOf(member) {
  return {eventKey: member.eventKey, operation: member.operation,
    id: member.data?.id ?? member.oldData?.id ?? member.old_data?.id ?? null,
    value: member.operation === CDC_OPERATION.DELETE ? undefined : member.data?.value};
}

for (const [shape, heldAtOne, commands] of [
  ['one CDC command per entry (window held at one)', true, [1, 1, 1, 1, 1]],
  ['one CDC command and CDC_BATCH commands (cold window)', false, [1, 2, 2]],
]) {
  test(`literal anchor, ${shape}: the recipient's committed log holds exactly the literal ` +
    'occurrences, in order, with their literal values', async (t) => {
    const f = await fixture(t, {rows: [], subscribers: 2,
      statements: LITERAL_STATEMENTS.map((statement, index) =>
        ({...statement, wallMs: 1000 + index}))});
    const model = installRecipientModel(f);
    if (heldAtOne) holdShipWindow(f, 1);
    await runLaneToQuiescence(f);
    for (const log of model.logs) {
      assert.deepEqual(log.map((command) => command.members.length), commands);
      assert.deepEqual(flattenLog(log).map(literalOf), LITERAL_MEMBERS);
      assert.deepEqual(flattenLog(log).map((member) =>
        [member.sourceOrdinal, member.tableName]),
      LITERAL_MEMBERS.map(() => [0, TABLE]));
      const positions = flattenLog(log).map((member) => member.sourceLogIndex);
      assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
      assert.equal(new Set(positions).size, LITERAL_MEMBERS.length);
    }
    assertRecipientLogs(model);
    assert.deepEqual(countCdcObligations(f.leader.db),
      {owed: 0, delivered: LITERAL_MEMBERS.length});
  });
}
