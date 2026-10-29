#!/usr/bin/env node
import fs from 'node:fs';
import {NUM} from '../../src/constants/index.js';

const POLICY_PATH =
  'solve/specs/release-0-3-queryable-core/locking-read-wait-policy.json';
const ARCHITECTURE_PATH = 'architecture/postgres-locking-reads.md';
const TEXT_ENCODING = 'utf8';
const EMPTY_STRING = '';
const MARKDOWN_CODE = '`';
const MARKDOWN_CELL = '|';
const NAME_SEPARATOR = '_';
const PROSE_SEPARATOR = '-';
const NEWLINE = '\n';
const SPACE = ' ';
const MISSING_ROW_PENALTY = NUM.THREE;
const OUTCOME_CELL_INDEX = NUM.THREE;
const MINIMUM_TRANSITION_CELL_COUNT = NUM.FOUR;

const stringReplaceAll = Function.call.bind(String.prototype.replaceAll);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);
const arrayFind = Function.call.bind(Array.prototype.find);
const arraySlice = Function.call.bind(Array.prototype.slice);
const arrayMap = Function.call.bind(Array.prototype.map);
const objectEntries = Object.entries;

const policy = JSON.parse(fs.readFileSync(POLICY_PATH, TEXT_ENCODING));
const architecture = fs.readFileSync(ARCHITECTURE_PATH, TEXT_ENCODING);
const expectedState = Object.freeze({
  localExpiry: 'forbidden',
  reservationPersistence: 'durable_replicated_until_transaction_resolution',
  multiParticipantConflict:
    'participant_refusal_then_dtc_rollback_whole_transaction_and_confirm_release',
});
const expectedTyped = Object.freeze({
  contention: 'typed_locking_read_reservation_conflict',
  timeout: 'transaction_timeout',
  cancellation: 'transaction_cancelled',
  abort: 'transaction_aborted',
});
const transitionNames = Object.freeze([
  'acquire',
  'same_transaction_reacquire',
  'conflict',
  'conflict_abort',
  'timeout',
  'cancellation',
  'commit',
  'rollback',
  'crash',
  'recovery',
]);

function architectureRow(name) {
  const proseName = stringReplaceAll(name, NAME_SEPARATOR, PROSE_SEPARATOR);
  const prefix = `| ${proseName} |`;
  const lines = stringSplit(architecture, NEWLINE);
  const line = arrayFind(lines, (candidate) =>
    stringStartsWith(candidate, prefix),
  );
  if (!line) return null;
  const rawCells = stringSplit(line, MARKDOWN_CELL);
  const slicedCells = arraySlice(rawCells, 1, -1);
  const cells = arrayMap(slicedCells, (cell) => stringTrim(cell));
  if (cells.length !== MINIMUM_TRANSITION_CELL_COUNT) return null;
  return {
    owner: stringReplaceAll(cells[1], MARKDOWN_CODE, EMPTY_STRING),
    action: cells[2],
    outcome: stringReplaceAll(cells[OUTCOME_CELL_INDEX], MARKDOWN_CODE, EMPTY_STRING),
  };
}

function proseAction(action) {
  return stringReplaceAll(action, NAME_SEPARATOR, SPACE);
}

let metric = 0;
for (const [field, expected] of objectEntries(expectedState)) {
  metric += policy[field] === expected ? 0 : 1;
}
for (const [field, expected] of objectEntries(expectedTyped)) {
  metric += policy.typedOutcomes?.[field] === expected ? 0 : 1;
}
metric += policy.transitions?.conflict?.outcome ===
  policy.typedOutcomes?.contention ? 0 : 1;
metric += policy.transitions?.conflict_abort?.outcome ===
  policy.typedOutcomes?.abort ? 0 : 1;

for (const name of transitionNames) {
  const policyRow = policy.transitions?.[name];
  const proseRow = architectureRow(name);
  if (!policyRow || !proseRow) {
    metric += MISSING_ROW_PENALTY;
    continue;
  }
  metric += proseRow.owner === policyRow.owner ? 0 : 1;
  metric += proseRow.outcome === policyRow.outcome ? 0 : 1;
  // The architecture action is intentionally readable prose. Require it to
  // carry every semantic token from the machine action rather than merely
  // finding an unrelated action elsewhere in the document.
  const lowerProse = stringToLowerCase(proseRow.action);
  const prose = stringReplaceAll(lowerProse, PROSE_SEPARATOR, SPACE);
  const machineAction = stringToLowerCase(proseAction(policyRow.action));
  metric += prose === machineAction ? 0 : 1;
}

process.stdout.write(`${metric}\n`);
process.exitCode = metric === 0 ? 0 : 1;
