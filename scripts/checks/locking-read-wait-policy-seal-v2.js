#!/usr/bin/env node
import fs from 'node:fs';

const POLICY_PATH =
  'solve/specs/release-0-3-queryable-core/locking-read-wait-policy.json';
const ARCHITECTURE_PATH = 'architecture/postgres-locking-reads.md';
const TEXT_ENCODING = 'utf8';
const EXPECTED_POLICY_VERSION = 1;
const EXPECTED_CONFLICT_MODE = 'fail_fast_refusal';
const EXPECTED_DEADLOCK_POLICY = 'impossible_no_wait_graph';
const EXPECTED_DTC_OWNER = 'DistributedTransactionCoordinator';
const EXPECTED_PARTICIPANT_OWNER = 'partition_transaction_participant';
const EXPECTED_RELEASE_AUTHORITY = 'transaction_resolution';
const EXPECTED_WAKE_OWNER = 'none_no_waiters';
const SCRIPT_NEWLINE = '\n';
const REQUIRED_TRANSITIONS = Object.freeze({
  acquire: EXPECTED_PARTICIPANT_OWNER,
  same_transaction_reacquire: EXPECTED_PARTICIPANT_OWNER,
  conflict: EXPECTED_PARTICIPANT_OWNER,
  conflict_abort: EXPECTED_DTC_OWNER,
  timeout: EXPECTED_DTC_OWNER,
  cancellation: EXPECTED_DTC_OWNER,
  commit: EXPECTED_DTC_OWNER,
  rollback: EXPECTED_DTC_OWNER,
  crash: EXPECTED_PARTICIPANT_OWNER,
  recovery: EXPECTED_DTC_OWNER,
});
const REQUIRED_ARCHITECTURE_FRAGMENTS = Object.freeze([
  '## Sealed Phase 0.3 wait/conflict policy',
  POLICY_PATH,
  'fail-fast',
  'no waiter queue',
  'deadlock',
  'local TTL',
  'PG wire',
  'locking_read_reservation_conflict',
  'transaction_aborted',
  'conflict-abort',
  'confirm release',
  'superseding policy',
]);

function readJson(path) {
  try {
    return JSON.parse(fs.readFileSync(path, TEXT_ENCODING));
  } catch {
    return null;
  }
}
function readText(path) {
  try {
    return fs.readFileSync(path, TEXT_ENCODING);
  } catch {
    return '';
  }
}
function validTransition(row, owner) {
  return row &&
    row.owner === owner &&
    typeof row.action === 'string' && row.action.length > 0 &&
    typeof row.outcome === 'string' && row.outcome.length > 0;
}

const policy=readJson(POLICY_PATH);
const architecture=readText(ARCHITECTURE_PATH);
let metric=0;
if (!policy || typeof policy !== 'object') {
  metric += Object.keys(REQUIRED_TRANSITIONS).length;
} else {
  metric += policy.version === EXPECTED_POLICY_VERSION ? 0 : 1;
  metric += policy.conflictMode === EXPECTED_CONFLICT_MODE ? 0 : 1;
  metric += policy.waitQueue === false ? 0 : 1;
  metric += policy.deadlockPolicy === EXPECTED_DEADLOCK_POLICY ? 0 : 1;
  metric += policy.transactionOwner === EXPECTED_DTC_OWNER ? 0 : 1;
  metric += policy.participantOwner === EXPECTED_PARTICIPANT_OWNER ? 0 : 1;
  metric += policy.releaseAuthority === EXPECTED_RELEASE_AUTHORITY ? 0 : 1;
  metric += policy.wakeOwner === EXPECTED_WAKE_OWNER ? 0 : 1;
  metric += policy.typedOutcomes?.abort === 'transaction_aborted' ? 0 : 1;
  metric += policy.typedOutcomes?.contention ===
    'locking_read_reservation_conflict' ? 0 : 1;
  for (const [name, owner] of Object.entries(REQUIRED_TRANSITIONS)) {
    metric += validTransition(policy.transitions?.[name], owner) ? 0 : 1;
  }
}
for (const fragment of REQUIRED_ARCHITECTURE_FRAGMENTS) {
  metric += architecture.includes(fragment) ? 0 : 1;
}
if (policy) {
  for (const [name, owner] of Object.entries(REQUIRED_TRANSITIONS)) {
    const row=policy.transitions?.[name];
    if (!row) continue;
    metric += architecture.includes(name.replaceAll('_','-')) ? 0 : 1;
    metric += architecture.includes(owner) ? 0 : 1;
    metric += architecture.includes(row.outcome) ? 0 : 1;
  }
}
process.stdout.write(String(metric)+SCRIPT_NEWLINE);
process.exitCode=metric===0?0:1;
