#!/usr/bin/env node

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

import {OLTP_OPERATION_KIND} from
  '../../test/distributed/harness/oltp-baseline-workload.js';
import {OLTP_PAIRED_RETRY_POLICY} from
  '../../test/distributed/harness/oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_SEMANTIC_PROFILE,
  OLTP_SCENARIO_A_SEMANTIC_PROFILES,
  hashScenarioASemanticProfile,
} from '../../test/distributed/harness/oltp-scenario-a-semantic-profile.js';

const PASS_LINE = 'oltp-scenario-a-semantic-profile-guard: PASS\n';
const PROFILE_ID = 'scenario-a-semantic-v2';
const RETRYABLE_CONFLICT_SQL_STATE = '40001';
const TERMINAL_FAILURE = 'terminal_failure';
const DEADLINE_MODE_NONE = 'none-v1';
// The superseded profile as campaign attempt r8 recorded it (digest kept).
const PROFILE_ID_V1 = 'scenario-a-semantic-v1';
const RETRY_POLICY_ID_V1 = 'scenario-a-retry-v1';
const PROFILE_V1_DIGEST = '81b94b29c875bdb47bd972050be1cf511efdef50c7846806077f59eb978814ec';
const RETRYABLE_CONFLICT_SQL_STATES_V2 = Object.freeze(['40001', '40P01']);
const STATEMENT_COMPLETION_UNKNOWN_SQL_STATE = '40003';
const HASH_ALGORITHM = 'sha256';
const HASH_DIGEST_ENCODING = 'hex';

function assertCoreContract() {
  const profile = OLTP_SCENARIO_A_SEMANTIC_PROFILE;
  assert.equal(profile.id, PROFILE_ID);
  assert.equal(profile.retryPolicyId, OLTP_PAIRED_RETRY_POLICY.id);
  assert.equal(profile.isolation.serializableIsolationRequired, false);
  assert.equal(profile.isolation.dirtyReadsForbidden, true);
  assert.equal(profile.isolation.readYourOwnWritesRequired, true);
  assert.equal(profile.isolation.atomicCommitRequired, true);
  assert.equal(profile.isolation.successfulCommitDurable, true);
  assert.equal(profile.isolation.successfulEffectsExactlyOnce, true);
  assert.equal(profile.isolation.lostSuccessfulWriteForbidden, true);
  assert.equal(profile.isolation.productSpecificLockingMechanismRequired, false);
  assert.equal(profile.outcomes.retryableConflictSqlState, RETRYABLE_CONFLICT_SQL_STATE);
  assert.equal(profile.outcomes.ambiguousCommit, TERMINAL_FAILURE);
  assert.equal(
    profile.outcomes.disconnectBeforeUnambiguousCommit,
    TERMINAL_FAILURE,
  );
  assert.deepEqual(profile.timeout, {
    benchmarkDeadlineMode: DEADLINE_MODE_NONE,
    timeoutMs: null,
    transportTimeoutOutcome: TERMINAL_FAILURE,
    sloViolationIsFailure: false,
  });
  assert.equal(profile.failureAtomicity.required, true);
}

function assertTransactionFamilies() {
  const families = OLTP_SCENARIO_A_SEMANTIC_PROFILE.transactionFamilies;
  assert.deepEqual(
    Object.keys(families).sort(),
    Object.values(OLTP_OPERATION_KIND).sort(),
  );
  assert.equal(families[OLTP_OPERATION_KIND.NEW_ORDER].readOnly, false);
  assert.equal(families[OLTP_OPERATION_KIND.PAYMENT].readOnly, false);
  assert.equal(families[OLTP_OPERATION_KIND.ORDER_STATUS].readOnly, true);
  assert.equal(families[OLTP_OPERATION_KIND.DELIVERY].readOnly, false);
  assert.equal(families[OLTP_OPERATION_KIND.STOCK_LEVEL].readOnly, true);
  for (const family of Object.values(families)) {
    assert.ok(family.successInvariants.length > 0);
  }
}

function assertMechanismNeutrality() {
  const source = JSON.stringify(OLTP_SCENARIO_A_SEMANTIC_PROFILE);
  assert.doesNotMatch(source, /tidb/iu);
  assert.doesNotMatch(source, /lagrange/iu);
  assert.doesNotMatch(source, /for update/iu);
  assert.doesNotMatch(source, /snapshot isolation/iu);
}

function assertDigest() {
  const digest = hashScenarioASemanticProfile();
  assert.match(digest, /^[0-9a-f]{64}$/u);
  const independentlyHashed = createHash(HASH_ALGORITHM)
    .update(JSON.stringify(OLTP_SCENARIO_A_SEMANTIC_PROFILE))
    .digest(HASH_DIGEST_ENCODING);
  assert.equal(digest, independentlyHashed);
  assert.equal(hashScenarioASemanticProfile(), digest);
  // v1 stays as it was executed (coordinator decision R09, 2026-11-02): its
  // own identity, its retry policy v1, its digest unchanged.
  const v1 = OLTP_SCENARIO_A_SEMANTIC_PROFILES[0];
  assert.equal(v1.id, PROFILE_ID_V1);
  assert.equal(v1.retryPolicyId, RETRY_POLICY_ID_V1);
  assert.equal(hashScenarioASemanticProfile(v1), PROFILE_V1_DIGEST);
  assert.deepEqual(OLTP_SCENARIO_A_SEMANTIC_PROFILE.outcomes.retryableConflictSqlStates,
    RETRYABLE_CONFLICT_SQL_STATES_V2);
  assert.equal(OLTP_SCENARIO_A_SEMANTIC_PROFILE.outcomes.statementCompletionUnknownSqlState,
    STATEMENT_COMPLETION_UNKNOWN_SQL_STATE);
}

function assertFrozen() {
  assert.equal(Object.isFrozen(OLTP_SCENARIO_A_SEMANTIC_PROFILE), true);
  assert.equal(
    Object.isFrozen(OLTP_SCENARIO_A_SEMANTIC_PROFILE.transactionFamilies),
    true,
  );
  assert.equal(
    Object.isFrozen(
      OLTP_SCENARIO_A_SEMANTIC_PROFILE.transactionFamilies[
        OLTP_OPERATION_KIND.NEW_ORDER
      ].successInvariants,
    ),
    true,
  );
}

function main() {
  assertCoreContract();
  assertTransactionFamilies();
  assertMechanismNeutrality();
  assertDigest();
  assertFrozen();
  process.stdout.write(PASS_LINE);
}

main();
