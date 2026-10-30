#!/usr/bin/env node

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

import {OLTP_OPERATION_KIND} from
  '../../test/distributed/harness/oltp-baseline-workload.js';
import {OLTP_PAIRED_RETRY_POLICY} from
  '../../test/distributed/harness/oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_SEMANTIC_PROFILE,
  hashScenarioASemanticProfile,
} from '../../test/distributed/harness/oltp-scenario-a-semantic-profile.js';

const PASS_LINE = 'oltp-scenario-a-semantic-profile-guard: PASS\n';

function assertCoreContract() {
  const profile = OLTP_SCENARIO_A_SEMANTIC_PROFILE;
  assert.equal(profile.id, 'scenario-a-semantic-v1');
  assert.equal(profile.retryPolicyId, OLTP_PAIRED_RETRY_POLICY.id);
  assert.equal(profile.isolation.serializableIsolationRequired, false);
  assert.equal(profile.isolation.dirtyReadsForbidden, true);
  assert.equal(profile.isolation.readYourOwnWritesRequired, true);
  assert.equal(profile.isolation.atomicCommitRequired, true);
  assert.equal(profile.isolation.successfulCommitDurable, true);
  assert.equal(profile.isolation.successfulEffectsExactlyOnce, true);
  assert.equal(profile.isolation.lostSuccessfulWriteForbidden, true);
  assert.equal(profile.isolation.productSpecificLockingMechanismRequired, false);
  assert.equal(profile.outcomes.retryableConflictSqlState, '40001');
  assert.equal(profile.outcomes.ambiguousCommit, 'terminal_failure');
  assert.equal(
    profile.outcomes.disconnectBeforeUnambiguousCommit,
    'terminal_failure',
  );
  assert.deepEqual(profile.timeout, {
    benchmarkDeadlineMode: 'none-v1',
    timeoutMs: null,
    transportTimeoutOutcome: 'terminal_failure',
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
  const independentlyHashed = createHash('sha256')
    .update(JSON.stringify(OLTP_SCENARIO_A_SEMANTIC_PROFILE))
    .digest('hex');
  assert.equal(digest, independentlyHashed);
  assert.equal(hashScenarioASemanticProfile(), digest);
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

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
}
