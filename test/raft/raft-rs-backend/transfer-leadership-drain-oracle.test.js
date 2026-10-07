// The differential property of the F1 claim, against the amended coverage
// model (coverage-model.md as amended by coverage-model-amendment-1.md):
//
//   A decision made when relevant raft messages are already pending must
//   produce the same externally relevant result as that decision made after
//   those messages have first been processed.
//
// "Pending" means envelopes delivered to the requester's group inbound and
// not yet stepped. The processed-first reference is the same construction
// with those envelopes stepped first, at the same virtual time and with zero
// ticks between. Every cell (transfer-leadership-drain-oracle-cells.js) runs
// both ways from scratch (transfer-leadership-drain-oracle-harness.js), and
// the two runs are compared on everything externally relevant:
//
//   - the answer record;
//   - the requester's outbound (type, to) trace from the hand-over to the end
//     of the request's turn (a retarget and an ignored request answer the
//     same, and differ here);
//   - every connected replica's role, term, leaderId and ConfState at the
//     smallest election tick - 1 rounds, exactly;
//   - for declared timeout-driven cells, at twice the largest election tick,
//     by class (how many lead), since the core's randomized election timeout
//     (raft.rs 2810, the only random input; FxHasher makes iteration
//     deterministic) may fire there;
//   - every replica's role, term and leader event stream;
//   - the durable record: hard state, applied ConfState and log;
//
// and each run is also held to two direct anchors: the subscriber projection
// built from the event stream equals the core after the turn and at the end
// (D7; CA5), and the requester, crashed and rebuilt from its durable record,
// reports the term and ConfState it reported running.
//
// Anti-vacuity reads the actual-core-entry log and the shape of the reads:
// the reference drain steps every delivered envelope and answers a status
// (CA1: a refused inbound step must not answer the queued read); the
// pending run's request turn begins with a delivered step and steps them
// all; processing moved a decision input or sent something, or the cell's
// build asserted the receiver predicate under which the core refuses the
// step; an observation that is not a status record fails.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RAFT_ROLE} from '../../../src/raft/constants.js';
import {RAFT_RS_MESSAGE_TYPE} from
  '../../../src/raft/raft-rs-ingress-constants.js';
import {RAFT_LEADERSHIP_TRANSFER_REASON} from
  '../../../src/raft/raft-operation-port-constants.js';
import {
  MODE,
  STEP,
  assertStatusRecord,
  bindingEnumerations,
  runCell,
  stepCount,
} from './transfer-leadership-drain-oracle-harness.js';
import {
  CATALOGUE,
  HIDDEN_INPUTS,
  INPUT,
  KNOWN_PAIRS,
  NO_CELL,
  NO_MOVE,
  PAIR_BUILDS,
  allCells,
  generatedPairs,
} from './transfer-leadership-drain-oracle-cells.js';

const ENUMERATIONS = bindingEnumerations();
const CELLS = allCells(ENUMERATIONS);
const TRANSFER_ACCEPTED = new Set([
  RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_REQUESTED,
  RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_FORWARDED,
]);

test('census: the event axis is the binding\'s own message-type universe, ' +
  'and every type a peer can deliver has a cell or a recorded reason', () => {
  const {types, local, response, max, rangeMax} = ENUMERATIONS;
  assert.equal(max, rangeMax,
    'the parsed maximum is the ingress range the port admits');
  assert.equal(types.size, max + 1, 'the types are contiguous from 0');
  for (const name of [...local, ...response]) {
    assert.equal(types.has(name), true, `${name} is a binding type`);
  }
  const covered = new Set(CELLS.flatMap((cell) => cell.types));
  const missing = [...types.keys()].filter((name) =>
    !covered.has(name) && !Object.hasOwn(NO_CELL, name));
  assert.deepEqual(missing, [], 'a type has neither a cell nor a reason');
  for (const name of Object.keys({...CATALOGUE, ...NO_CELL})) {
    assert.equal(types.has(name), true, `${name} is a binding type`);
  }
  for (const predicate of Object.keys(NO_MOVE)) {
    const [name] = predicate.split(' ');
    assert.equal(types.has(name), true,
      `a recorded no-move predicate names a binding type (${predicate})`);
  }
  for (const name of response) {
    if (!local.has(name)) {
      assert.ok(CELLS.some((cell) => cell.types.includes(name) &&
        cell.predicate === 'sender without progress'),
      `${name} from a sender without progress has a cell`);
    }
  }
});

test('census: the pairs are generated as movers x readers per predicate, ' +
  'include the challengers\' pairs, and each has a construction', () => {
  const pairs = generatedPairs();
  for (const [name, key] of Object.entries(KNOWN_PAIRS)) {
    assert.equal(pairs.includes(key), true, `${name} is generated`);
  }
  assert.deepEqual(pairs.filter((key) => !Object.hasOwn(PAIR_BUILDS, key)),
    [], 'every generated pair has a construction');
});

test('census: every cell\'s event moves an input its decision reads, or ' +
  'the core refuses the envelope\'s step, or it is a declared control', () => {
  for (const cell of CELLS) {
    const read = cell.moves.filter((input) =>
      cell.decisionInputs.includes(input));
    assert.ok(read.length > 0 || cell.refusedFrom !== null ||
      cell.control !== null, `${cell.id} reads nothing its event moves`);
  }
});

test('census: the decision axis covers D1-D6 in every harness mode', () => {
  for (const decision of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6']) {
    assert.ok(CELLS.some((cell) => cell.family === 'decision' &&
      cell.decision === decision), `${decision} is exercised`);
  }
  for (const mode of ['sync', 'async', 'per-index', 'no-reentry']) {
    assert.ok(CELLS.some((cell) => cell.id.endsWith(`-${mode}`)),
      `${mode} mode is exercised`);
  }
});

// How each decision input is read off the core's status; the hidden ones
// (a transfer in progress, the transferee's catch-up) move only through what
// the requester sends.
const OBSERVED = Object.freeze({
  [INPUT.ROLE]: ({role, term, leaderId}) => ({role, term, leaderId}),
  [INPUT.CONF]: ({voters, learners}) => ({voters, learners}),
  [INPUT.PROGRESS]: ({progress}) => progress,
  [INPUT.SELF]: ({self}) => self,
});

function refusalsFrom(inputs, raftId) {
  return (inputs.inboundStepRefusals || []).filter((refusal) =>
    String(refusal.from) === raftId)
    .reduce((total, refusal) => total + refusal.refusalCount, 0);
}

// Anti-vacuity per decision: processing moved an input THIS decision reads,
// or the core refused the envelope's own step and recorded it against the
// sender the cell names, or the cell is a declared control that was
// answered.
function assertMoved(cell, processed) {
  const before = processed.inputsBefore;
  const after = processed.processed.inputsAfter;
  if (cell.refusedFrom !== null) {
    assert.ok(refusalsFrom(after, processed.refusedFromId) >
      refusalsFrom(before, processed.refusedFromId),
    `precondition: a refused step is recorded against ${cell.refusedFrom} ` +
    `(${JSON.stringify(after.inboundStepRefusals)})`);
    return;
  }
  const sent = processed.processed.outbound.length > 0;
  if (cell.ignored) {
    assert.deepEqual(processed.processed.outbound.filter(([type]) =>
      Number(type) === RAFT_RS_MESSAGE_TYPE.REQUEST_PRE_VOTE_RESPONSE), [],
    `the ignored request was not answered (${cell.ignored})`);
    assert.deepEqual(OBSERVED[INPUT.ROLE](after), OBSERVED[INPUT.ROLE](before),
      `the ignored request moved no term or role (${cell.ignored})`);
    return;
  }
  if (cell.control !== null) {
    assert.ok(sent, `precondition: the control was answered (${cell.control})`);
    return;
  }
  const read = cell.moves.filter((input) =>
    cell.decisionInputs.includes(input));
  assert.ok(read.length > 0,
    `the event moves an input ${cell.decision} reads (model D x I)`);
  const moved = read.filter((input) => (HIDDEN_INPUTS.includes(input) ? sent :
    JSON.stringify(OBSERVED[input](after)) !==
      JSON.stringify(OBSERVED[input](before))));
  assert.ok(moved.length > 0,
    `precondition: processing moved an input ${cell.decision} reads ` +
    `(${read.join(', ')})`);
}

function assertNotVacuous(cell, pending, processed) {
  assert.ok(pending.delivered > 0, 'precondition: envelopes are pending');
  assert.deepEqual(pending.types, processed.types,
    'both runs hold the same envelopes');
  for (const name of cell.types) {
    assert.ok(pending.types.includes(ENUMERATIONS.types.get(name)),
      `precondition: a ${name} is pending (${pending.types.join(',')})`);
  }
  assertStatusRecord(processed.processed.reference,
    'the reference drain\'s answer');
  assert.equal(processed.processed.steps, processed.delivered,
    'the reference stepped every delivered envelope');
  if (cell.admissionClosed) {
    assert.deepEqual([pending.requestEntries, processed.requestEntries],
      [[], []], 'nothing enters the core while admission is closed');
    return;
  }
  assert.notEqual(processed.requestEntries[0], STEP,
    'the reference request met nothing pending');
  assert.equal(pending.requestEntries[0], STEP,
    'the pending request\'s turn begins with a delivered step');
  assert.ok(stepCount(pending.requestEntries) >= pending.delivered,
    'the pending request\'s turn stepped every delivered envelope');
  assertMoved(cell, processed);
}

function assertAnchors(run, label) {
  assert.deepEqual(run.afterTurn, [],
    `${label}: the event projection equals the core after the turn`);
  assert.deepEqual(run.atExact, [],
    `${label}: the event projection equals the core at the observation`);
  assert.deepEqual(run.recovered.after, run.recovered.before,
    `${label}: the recovered requester reports its term and ConfState`);
}

function classOf(observation) {
  return {leaders: observation.filter((replica) =>
    replica.role === RAFT_ROLE.LEADER).length};
}

function assertSettled(cell, pending, processed) {
  if (!cell.settle) {
    return;
  }
  if (TRANSFER_ACCEPTED.has(processed.answer.reason)) {
    assert.deepEqual(pending.settled, processed.settled,
      'a named transferee\'s outcome is message-driven: exact');
    return;
  }
  assert.deepEqual(classOf(pending.settled), classOf(processed.settled),
    'the declared timeout-driven outcome, by class');
}

for (const cell of CELLS) {
  test(`${cell.family}: ${cell.decision} with pending ` +
    `${cell.types.join(' then ')} (${cell.predicate}) [${cell.id}]`,
  async () => {
    const processed = await runCell(cell, MODE.PROCESSED);
    const pending = await runCell(cell, MODE.PENDING);
    assertNotVacuous(cell, pending, processed);
    assert.deepEqual(pending.answer, processed.answer,
      'the answer equals the answer after the drain');
    if (cell.admissionClosed) {
      assert.deepEqual(pending.turnOutbound, processed.turnOutbound,
        'the refused turn sends nothing in either run');
    } else {
      assert.deepEqual(pending.outbound, processed.outbound,
        'the requester\'s outbound trace equals it after the drain');
    }
    assert.deepEqual(pending.exact, processed.exact,
      'leader, term and ConfState before any timeout equal those after ' +
      'the drain');
    assert.deepEqual(pending.streams, processed.streams,
      'the event streams equal those after the drain');
    assert.deepEqual(pending.durable, processed.durable,
      'the durable records equal those after the drain');
    assertSettled(cell, pending, processed);
    assertAnchors(processed, 'processed');
    assertAnchors(pending, 'pending');
  });
}
