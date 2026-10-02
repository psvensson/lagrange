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
const EXPECTED_MULTI_PARTICIPANT_CONFLICT = 'rollback_whole_transaction';
const EXPECTED_RELEASE_AUTHORITY = 'transaction_resolution';
const EXPECTED_WAKE_OWNER = 'none_no_waiters';
const MISSING_POLICY_SCALAR_PROBLEMS = 8;
const SCRIPT_NEWLINE = '\n';
const REQUIRED_TRANSITIONS = Object.freeze([
  'acquire',
  'same_transaction_reacquire',
  'conflict',
  'timeout',
  'cancellation',
  'commit',
  'rollback',
  'crash',
  'recovery',
]);
const ARCHITECTURE_MARKER = '## Sealed Phase 0.3 wait/conflict policy';

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, TEXT_ENCODING));
  } catch {
    return null;
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, TEXT_ENCODING);
  } catch {
    return '';
  }
}

function countPolicyProblems(policy) {
  if (!policy || typeof policy !== 'object') {
    return REQUIRED_TRANSITIONS.length + MISSING_POLICY_SCALAR_PROBLEMS;
  }
  let problems = 0;
  problems += policy.version === EXPECTED_POLICY_VERSION ? 0 : 1;
  problems += policy.conflictMode === EXPECTED_CONFLICT_MODE ? 0 : 1;
  problems += policy.waitQueue === false ? 0 : 1;
  problems += policy.deadlockPolicy === EXPECTED_DEADLOCK_POLICY ? 0 : 1;
  problems += policy.transactionOwner === EXPECTED_DTC_OWNER ? 0 : 1;
  problems += policy.participantOwner === EXPECTED_PARTICIPANT_OWNER ? 0 : 1;
  problems +=
    policy.multiParticipantConflict === EXPECTED_MULTI_PARTICIPANT_CONFLICT ?
      0 : 1;
  problems += policy.releaseAuthority === EXPECTED_RELEASE_AUTHORITY ? 0 : 1;
  problems += policy.wakeOwner === EXPECTED_WAKE_OWNER ? 0 : 1;
  const transitions =
    policy.transitions && typeof policy.transitions === 'object' ?
      policy.transitions :
      {};
  for (const transition of REQUIRED_TRANSITIONS) {
    const row = transitions[transition];
    if (!row ||
        typeof row.owner !== 'string' ||
        row.owner.length === 0 ||
        typeof row.action !== 'string' ||
        row.action.length === 0 ||
        typeof row.outcome !== 'string' ||
        row.outcome.length === 0) {
      problems += 1;
    }
  }
  return problems;
}

const policy = readJson(POLICY_PATH);
const architecture = readText(ARCHITECTURE_PATH);
let metric = countPolicyProblems(policy);
if (!architecture.includes(ARCHITECTURE_MARKER) ||
    !architecture.includes(POLICY_PATH)) {
  metric += 1;
}
process.stdout.write(String(metric) + SCRIPT_NEWLINE);
process.exitCode = metric === 0 ? 0 : 1;
