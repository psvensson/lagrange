#!/usr/bin/env node
import fs from 'node:fs';

const POLICY_PATH =
  'solve/specs/release-0-3-queryable-core/locking-read-wait-policy.json';
const ARCHITECTURE_PATH = 'architecture/postgres-locking-reads.md';
const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
const architecture = fs.readFileSync(ARCHITECTURE_PATH, 'utf8');
const expectedState = Object.freeze({
  localExpiry: 'forbidden',
  reservationPersistence: 'durable_replicated_until_transaction_resolution',
  multiParticipantConflict:
    'participant_refusal_then_dtc_rollback_whole_transaction_and_confirm_release',
});
const expectedTyped = Object.freeze({
  contention: 'locking_read_reservation_conflict',
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
  const proseName = name.replaceAll('_', '-');
  const prefix = `| ${proseName} |`;
  const line = architecture.split('\n').find((candidate) =>
    candidate.startsWith(prefix),
  );
  if (!line) return null;
  const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
  if (cells.length !== 4) return null;
  return {
    owner: cells[1].replaceAll('`', ''),
    action: cells[2],
    outcome: cells[3].replaceAll('`', ''),
  };
}

function proseAction(action) {
  return action.replaceAll('_', ' ');
}

let metric = 0;
for (const [field, expected] of Object.entries(expectedState)) {
  metric += policy[field] === expected ? 0 : 1;
}
for (const [field, expected] of Object.entries(expectedTyped)) {
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
    metric += 3;
    continue;
  }
  metric += proseRow.owner === policyRow.owner ? 0 : 1;
  metric += proseRow.outcome === policyRow.outcome ? 0 : 1;
  // The architecture action is intentionally readable prose. Require it to
  // carry every semantic token from the machine action rather than merely
  // finding an unrelated action elsewhere in the document.
  const prose = proseRow.action.toLowerCase().replaceAll('-', ' ');
  const tokens = proseAction(policyRow.action).toLowerCase().split(' ')
    .filter((token) => token.length > 3);
  metric += tokens.every((token) => prose.includes(token)) ? 0 : 1;
}

process.stdout.write(`${metric}\n`);
process.exitCode = metric === 0 ? 0 : 1;
