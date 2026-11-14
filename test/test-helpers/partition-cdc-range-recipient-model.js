// The recipient model and the quiescence driver of the range-shipping
// witnesses (quest cdc-obligation-range-shipping, final coverage model), on the
// partition CDC lane fixture (partition-cdc-lane-fixture.js).
//
// The source side is real: the application owner, the durable ledger, the
// obligation lane, the subscription and acknowledgement owners. Each fixture
// subscriber is one recipient leaf, modelled as an append-only committed
// command log: a vector the leaf commits is appended as one command (CDC for
// one member, CDC_BATCH for several, as the message-group command owner types
// them) and answered with the CDC outcome owner's committed receipt. Faults are
// keyed by row identity (the durable event key), never by call number: each
// time a vector is presented to a leaf, the first member that still has a
// fault queued for that leaf decides the answer. This is a model of a
// recipient, so it is an evidence ceiling of the source lane, never of a
// native message-group commit.
//
// Expected values are built from the raw ledger rows (event_json read by SQL),
// never through the lane's own event builder or the CDC envelope capture, so a
// mistake shared by the lane and a helper cannot hide.
import assert from 'node:assert/strict';
import {CDC_COMPLETION, CDC_COVERAGE_STATE, buildCommittedCdcOutcome,
  buildProvisionalCdcOutcome, cdcCommitWaitIdentity, unknownCdcAcceptance} from
  '../../src/cdc/cdc-delivery-outcome.js';
import {MESSAGE_GROUP_COMMAND_TYPE} from '../../src/message-group/constants.js';
import {PARTITION_CDC_COMMAND, PARTITION_CDC_OBLIGATION_BOUND as BOUND,
  PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE,
  PARTITION_CDC_OBLIGATION_FLUSH_STATE as FLUSH} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {OBLIGATION_RETRY_DISPOSITION as RETRY} from
  '../../src/partition/partition-cdc-obligation-delivery.js';
import {cdcObligationEventKeyDigest, countCdcObligations} from
  '../../src/partition/partition-cdc-obligation-ledger.js';
import {applyCommitted, settleTicks} from './participant-transaction-fixture.js';
import {RETRY_AFTER_MS} from './partition-cdc-lane-fixture.js';

const RECEIPT_TERM = 2;
const RAW_LEDGER_SQL = 'SELECT event_key, log_index, ordinal, entry_id, event_json ' +
  'FROM _cdc_obligations WHERE log_index > ? ORDER BY log_index, ordinal';

// What a recipient leaf answers instead of committing and returning its
// receipt, for one presentation of a vector containing the faulted row.
const RECIPIENT_FAULT = Object.freeze({
  UNKNOWN: 'unknown', // attempted; not committed; no receipt
  COMMITTED_UNKNOWN: 'committed_unknown', // committed at the recipient; the receipt is lost
  THROW: 'throw', // the recipient call throws
  BACKPRESSURE: 'backpressure', // typed backpressure with a retry hint: nothing attempted
  PROVISIONAL: 'provisional', // provisional ingress: nothing committed
});

// What the lane's shipping window does after a wave, by how the wave ended.
const WINDOW_EFFECT = Object.freeze({HALVED: 'halved', UNCHANGED: 'unchanged',
  DOUBLED_WHEN_WINDOW_CUT: 'doubled_when_window_cut'});

// Every recipient fault, classified by the window effect the record requires
// (S-1): a failure that attempted the vector halves the window; typed
// backpressure attempted nothing and provisional coverage is not a failure.
const WINDOW_EFFECT_BY_FAULT = Object.freeze({
  [RECIPIENT_FAULT.UNKNOWN]: WINDOW_EFFECT.HALVED,
  [RECIPIENT_FAULT.COMMITTED_UNKNOWN]: WINDOW_EFFECT.HALVED,
  [RECIPIENT_FAULT.THROW]: WINDOW_EFFECT.HALVED,
  [RECIPIENT_FAULT.BACKPRESSURE]: WINDOW_EFFECT.UNCHANGED,
  [RECIPIENT_FAULT.PROVISIONAL]: WINDOW_EFFECT.UNCHANGED,
});

// The owners' enumerations, each member classified. A member an owner adds
// without a classification here fails the enumeration witnesses, so a new
// state cannot enter the lane unexamined.
//
// CDC completion codes, as a recipient answer for a whole vector.
const WINDOW_EFFECT_BY_COMPLETION = Object.freeze({
  [CDC_COMPLETION.UNKNOWN]: WINDOW_EFFECT.HALVED,
  [CDC_COMPLETION.INVALID]: WINDOW_EFFECT.HALVED,
  [CDC_COMPLETION.BACKPRESSURE]: WINDOW_EFFECT.UNCHANGED,
  [CDC_COMPLETION.PROVISIONAL]: WINDOW_EFFECT.UNCHANGED,
});
// Coverage states of a shipped range.
const WINDOW_EFFECT_BY_COVERAGE = Object.freeze({
  [CDC_COVERAGE_STATE.UNCOVERED]: WINDOW_EFFECT.HALVED,
  [CDC_COVERAGE_STATE.PROVISIONAL]: WINDOW_EFFECT.UNCHANGED,
  [CDC_COVERAGE_STATE.COMMITTED]: WINDOW_EFFECT.DOUBLED_WHEN_WINDOW_CUT,
});
// Retry dispositions: only an attempted (transient) failure moves the window.
const WINDOW_EFFECT_BY_RETRY_DISPOSITION = Object.freeze({
  [RETRY.TRANSIENT_FAILURE]: WINDOW_EFFECT.HALVED,
  [RETRY.BACKPRESSURE]: WINDOW_EFFECT.UNCHANGED,
  [RETRY.PAGE_YIELDED]: WINDOW_EFFECT.UNCHANGED,
  [RETRY.NO_PENDING_WORK]: WINDOW_EFFECT.UNCHANGED,
  [RETRY.STALE_LIFETIME]: WINDOW_EFFECT.UNCHANGED,
});
// Drive states, by what the quiescence driver may see from a leading,
// subscribed, running lane: WORKING states are ordinary progress or waiting;
// the others would mean the fixture lost its leader, its ledger or its
// subscribers, and fail the driver.
const DRIVE_STATE_IN_A_LEADING_LANE = Object.freeze({
  [DRIVE.DRAINED]: true,
  [DRIVE.PAGE_YIELDED]: true,
  [DRIVE.PROVISIONAL]: true,
  [DRIVE.HELD_BY_SUBSCRIBER]: true,
  [DRIVE.ACKNOWLEDGEMENT_BACKPRESSURE]: true,
  [DRIVE.JOINED_IN_FLIGHT]: true,
  [DRIVE.NOT_LEADER]: false,
  [DRIVE.SHUTDOWN]: false,
  [DRIVE.NO_SUBSCRIBERS]: false,
  [DRIVE.NO_LEDGER]: false,
});
// Flush states, by the same rule: the driver commits every proposed
// CDC_DELIVERED, so a refused, unknown or unproposable flush is a failure.
const FLUSH_STATE_IN_A_LEADING_LANE = Object.freeze({
  [FLUSH.EMPTY]: true,
  [FLUSH.IN_FLIGHT]: true,
  [FLUSH.BACKPRESSURE]: true,
  [FLUSH.COMMITTED]: true,
  [FLUSH.RECONCILED]: true,
  [FLUSH.REFUSED]: false,
  [FLUSH.OUTCOME_UNKNOWN]: false,
  [FLUSH.PROPOSER_UNAVAILABLE]: false,
  [FLUSH.NOT_LEADER]: false,
  [FLUSH.SHUTDOWN]: false,
});

const diagnosticsOf = (f) => f.leader.cdcDelivery.getCdcObligationDiagnostics();

// The ledger rows above `afterLogIndex`, as stored: read by SQL, in log order.
function readRawLedger(f, afterLogIndex = 0) {
  return f.leader.db.prepare(RAW_LEDGER_SQL).all(afterLogIndex).map((row) => Object.freeze({
    eventKey: row.event_key, logIndex: Number(row.log_index), ordinal: Number(row.ordinal),
    entryId: row.entry_id, eventJson: row.event_json}));
}

// The member a recipient must have been handed for one ledger row: its stored
// payload, as stored, with the row's own identity and position.
function expectedMemberOf(raw) {
  return {...JSON.parse(raw.eventJson), eventKey: raw.eventKey, entryId: raw.entryId,
    sourceLogIndex: raw.logIndex, sourceOrdinal: raw.ordinal};
}

function takeFault(model, index, events) {
  for (const event of events) {
    const queue = model.faults.get(event.eventKey)?.get(index);
    if (queue && queue.length > 0) return queue.shift();
  }
  return null;
}

function watchAcknowledgements(f, model) {
  const push = f.proposed.push.bind(f.proposed);
  f.proposed.push = (...commands) => {
    for (const command of commands) {
      if (command.type !== PARTITION_CDC_COMMAND.DELIVERED) continue;
      for (const group of command.acknowledged) {
        for (const acknowledged of group.events) {
          const raw = model.raw.find((row) => row.logIndex === group.logIndex &&
            row.ordinal === acknowledged.ordinal);
          assert.ok(raw, 'an acknowledgement names a ledger row the witness knows');
          assert.equal(cdcObligationEventKeyDigest(raw.eventKey), acknowledged.eventKeyDigest);
          model.acknowledged.push(raw.eventKey);
          const missing = model.receipted.map((keys, leaf) => keys.has(raw.eventKey) ? null : leaf)
            .filter((leaf) => leaf !== null);
          if (missing.length > 0 && raw.logIndex > model.hydratedThroughLogIndex) {
            model.earlyAcknowledgements.push({eventKey: raw.eventKey, missing});
          }
        }
      }
    }
    return push(...commands);
  };
}

/**
 * Put the recipient model behind every subscriber of a lane fixture.
 * @param {Object} f - A partition-cdc-lane-fixture fixture.
 * @param {Object} [options] - Options.
 * @param {Map<string, Map<number, Array<string>>>} [options.faults] - event
 *   key -> leaf index -> RECIPIENT_FAULT queue.
 * @param {Function} [options.onWave] - (wave, events) => void, run when a
 *   vector is presented, before the leaf answers.
 * @return {Object} The model: logs (per leaf, the committed commands), waves
 *   (every presentation, in order), raw (the ledger rows the witness knows),
 *   acknowledged, earlyAcknowledgements, noteLedger(), hydratedThrough().
 */
function installRecipientModel(f, {faults = new Map(), onWave = () => {}} = {}) {
  const model = {
    faults,
    logs: f.subscribers.map(() => []),
    receipted: f.subscribers.map(() => new Set()),
    waves: [],
    raw: [],
    acknowledged: [],
    earlyAcknowledgements: [],
    hydratedThroughLogIndex: 0,
  };
  // The witness learns ledger rows by raw read whenever source work was added.
  model.noteLedger = () => {
    const known = model.raw.length === 0 ? 0 : model.raw.at(-1).logIndex;
    model.raw.push(...readRawLedger(f, known));
    return model.raw;
  };
  // A hydration image through `logIndex`: rows at or below it may be
  // acknowledged without any receipt.
  model.hydratedThrough = (logIndex) => {
    model.hydratedThroughLogIndex = Math.max(model.hydratedThroughLogIndex, logIndex);
    return f.leader.cdcDelivery.acknowledgeHydratedObligationsThrough(logIndex);
  };
  f.propagate = (index, events, _context, groupId) => {
    const wave = {index, keys: events.map((event) => event.eventKey),
      ids: events.map((event) => event.data?.id ?? null), rows: events.length,
      digest: cdcCommitWaitIdentity(events), frozen: Object.isFrozen(events),
      window: diagnosticsOf(f).shipWindow, fault: takeFault(model, index, events)};
    model.waves.push(wave);
    onWave(wave, events);
    if (wave.fault === RECIPIENT_FAULT.THROW) throw new Error('recipient model: apply failed');
    if (wave.fault === RECIPIENT_FAULT.BACKPRESSURE) {
      return {...unknownCdcAcceptance(CDC_COMPLETION.BACKPRESSURE), retryAfterMs: RETRY_AFTER_MS};
    }
    if (wave.fault === RECIPIENT_FAULT.PROVISIONAL) {
      return buildProvisionalCdcOutcome(events, RETRY_AFTER_MS, groupId);
    }
    if (wave.fault === RECIPIENT_FAULT.UNKNOWN) return unknownCdcAcceptance();
    model.logs[index].push({
      type: events.length === 1 ? MESSAGE_GROUP_COMMAND_TYPE.CDC :
        MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH,
      members: events.map((event) => structuredClone(event))});
    if (wave.fault === RECIPIENT_FAULT.COMMITTED_UNKNOWN) return unknownCdcAcceptance();
    for (const key of wave.keys) model.receipted[index].add(key);
    return buildCommittedCdcOutcome(events, groupId,
      {index: model.logs[index].length, term: RECEIPT_TERM});
  };
  watchAcknowledgements(f, model);
  model.noteLedger();
  return model;
}

function applyOpenAcknowledgements(f, applied) {
  for (const command of f.proposed) {
    if (command.type !== PARTITION_CDC_COMMAND.DELIVERED || applied.has(command.entryId)) continue;
    applied.add(command.entryId);
    assert.equal(applyCommitted(f.leader, command), null, 'the CDC_DELIVERED applied');
  }
}

function assertLeadingLane(f, label) {
  const {lastDrive, lastFlush} = diagnosticsOf(f);
  if (lastDrive) {
    assert.equal(DRIVE_STATE_IN_A_LEADING_LANE[lastDrive.state], true,
      `${label}: drive state ${lastDrive.state}`);
  }
  if (lastFlush) {
    assert.equal(FLUSH_STATE_IN_A_LEADING_LANE[lastFlush.state], true,
      `${label}: flush state ${lastFlush.state}`);
  }
}

/**
 * Run the lane to quiescence: each round requests a drive, commits every
 * CDC_DELIVERED the lane proposed through the real application owner and
 * advances the virtual clock (retry timers, flush deadline), until nothing is
 * owed, pending or in flight.
 * @param {Object} f - The lane fixture.
 * @param {Object} [options] - {maxRounds, label, until: () => boolean}.
 * @return {Promise<number>} The rounds it took.
 */
async function runLaneToQuiescence(f, {maxRounds = 400, label = 'lane',
  until = () => countCdcObligations(f.leader.db).owed === 0} = {}) {
  f.appliedAcknowledgements ??= new Set();
  for (let round = 0; round < maxRounds; round += 1) {
    applyOpenAcknowledgements(f, f.appliedAcknowledgements);
    await settleTicks();
    assertLeadingLane(f, label);
    const diagnostics = diagnosticsOf(f);
    if (until() && diagnostics.pendingAcknowledgements === 0 && !diagnostics.inFlight &&
        diagnostics.batchEvents === 0) {
      return round;
    }
    await f.drive();
    f.clock.advance(BOUND.ACK_FLUSH_DEADLINE_MS);
    await settleTicks();
  }
  assert.fail(`${label}: not quiescent after ${maxRounds} rounds: ` +
    JSON.stringify({...countCdcObligations(f.leader.db), ...diagnosticsOf(f)}));
  return maxRounds;
}

const flattenLog = (log) => log.flatMap((command) => command.members);

// The first occurrence of every event key in one leaf's committed log, in
// log order.
function firstOccurrences(log) {
  const seen = new Set();
  const first = [];
  for (const member of flattenLog(log)) {
    if (seen.has(member.eventKey)) continue;
    seen.add(member.eventKey);
    first.push(member.eventKey);
  }
  return first;
}

/**
 * The final coverage model's recipient claims, for every leaf, against the
 * raw ledger: every owed occurrence at least once and unchanged, no occurrence
 * the ledger does not hold, members of one command in strictly increasing
 * position, one-member commands typed CDC and others CDC_BATCH; with
 * `ordered`, first occurrences in (log_index, ordinal) order; with
 * `wholeEntries`, no command splits a ledger entry.
 * @param {Object} model - The recipient model.
 * @param {Object} [options] - {label, ordered, wholeEntries}.
 */
function assertRecipientLogs(model, {label = 'recipient', ordered = true,
  wholeEntries = true} = {}) {
  const expected = new Map(model.raw.map((row) => [row.eventKey, row]));
  const required = model.raw.filter((row) => row.logIndex > model.hydratedThroughLogIndex)
    .map((row) => row.eventKey);
  model.logs.forEach((log, leaf) => {
    const where = `${label}: leaf ${leaf}`;
    for (const command of log) {
      assert.equal(command.type, command.members.length === 1 ?
        MESSAGE_GROUP_COMMAND_TYPE.CDC : MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH, where);
      command.members.forEach((member, position) => {
        const raw = expected.get(member.eventKey);
        assert.ok(raw, `${where}: committed an occurrence the ledger holds: ${member.eventKey}`);
        for (const [field, value] of Object.entries(expectedMemberOf(raw))) {
          assert.deepEqual(member[field], value,
            `${where}: ${member.eventKey} field ${field} is the ledger's, unchanged`);
        }
        if (position === 0) return;
        const before = expected.get(command.members[position - 1].eventKey);
        assert.ok(before.logIndex < raw.logIndex ||
          (before.logIndex === raw.logIndex && before.ordinal < raw.ordinal),
        `${where}: members of one command are in (log_index, ordinal) order`);
      });
      if (!wholeEntries) continue;
      const carried = new Set(command.members.map((member) => member.eventKey));
      for (const member of command.members) {
        const siblings = model.raw.filter((row) =>
          row.logIndex === expected.get(member.eventKey).logIndex);
        assert.equal(siblings.every((row) => carried.has(row.eventKey)), true,
          `${where}: entry ${siblings[0].logIndex} travels whole`);
      }
    }
    const first = firstOccurrences(log);
    const missing = required.filter((key) => !first.includes(key));
    assert.deepEqual(missing, [], `${where}: every owed occurrence was committed at least once`);
    if (ordered) {
      const position = new Map(model.raw.map((row, index) => [row.eventKey, index]));
      const order = first.map((key) => position.get(key));
      assert.deepEqual(order, [...order].sort((left, right) => left - right),
        `${where}: first occurrences are in (log_index, ordinal) order`);
    }
  });
  assert.deepEqual(model.earlyAcknowledgements, [],
    `${label}: no CDC_DELIVERED names a row before every leaf holds a committed receipt for it`);
}

export {
  DRIVE_STATE_IN_A_LEADING_LANE, FLUSH_STATE_IN_A_LEADING_LANE, RECIPIENT_FAULT, WINDOW_EFFECT,
  WINDOW_EFFECT_BY_COMPLETION, WINDOW_EFFECT_BY_COVERAGE, WINDOW_EFFECT_BY_FAULT,
  WINDOW_EFFECT_BY_RETRY_DISPOSITION, assertRecipientLogs, diagnosticsOf, firstOccurrences,
  flattenLog, installRecipientModel, runLaneToQuiescence,
};
