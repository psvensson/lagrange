import assert from 'node:assert/strict';

import {
  buildScenarioADurabilityCase,
  evaluateScenarioADurabilityObservation,
  OLTP_SCENARIO_A_DURABILITY_PROOF_IDS,
} from '../../test/distributed/harness/oltp-scenario-a-durability-case.js';
import {
  buildScenarioAPaymentCase,
} from '../../test/distributed/harness/oltp-scenario-a-payment-case.js';

const definition = buildScenarioADurabilityCase();
const repeated = buildScenarioADurabilityCase();
const payment = buildScenarioAPaymentCase();
const stableStateSha256 = 'a'.repeat(64);
const validFaultEvidence = Object.freeze({
  faultTarget: Object.freeze({
    nodeId: 'node-1',
    role: 'data-replica',
    isDataReplica: true,
    pgHostOnly: false,
  }),
  beforeIncarnation: 'inc-1',
  afterIncarnation: 'inc-2',
  storageContinuity: 'preserved',
  retainedObligations: Object.freeze([
    'committed_payment_rows',
    'full_oltp_state_sha256',
  ]),
});
const passingObservation = Object.freeze({
  commitAcknowledged: true,
  paymentObservation: {...payment.identity.expected},
  stateBeforeRestartSha256: stableStateSha256,
  stateAfterRestartSha256: stableStateSha256,
  faultEvidence: validFaultEvidence,
});

const PASS_MESSAGE = 'oltp-scenario-a-durability-case-guard: PASS';

const runDurabilityGuard = () => {
  assert.equal(definition.identity.caseId, 'scenario-a-durable-commit-v1');
  assert.equal(definition.identity.sourcePaymentCaseId, payment.identity.caseId);
  assert.equal(definition.identity.sourcePaymentCaseSha256, payment.caseSha256);
  assert.equal(definition.caseSha256, repeated.caseSha256);
  assert.match(definition.caseSha256, /^[0-9a-f]{64}$/u);
  assert.match(definition.identity.datasetSha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(OLTP_SCENARIO_A_DURABILITY_PROOF_IDS, [
    'isolation:atomicCommitRequired',
    'isolation:successfulCommitDurable',
  ]);

  const passing = evaluateScenarioADurabilityObservation(passingObservation);
  assert.equal(passing.passed, true);
  assert.deepEqual(passing.failures, []);
  assert.equal(passing.paymentEvaluation.passed, true);
  assert.deepEqual(passing.proofIds, OLTP_SCENARIO_A_DURABILITY_PROOF_IDS);
  assert.deepEqual(passing.actual.faultEvidence, validFaultEvidence);

  const notAcknowledged = evaluateScenarioADurabilityObservation({
    ...passingObservation,
    commitAcknowledged: false,
  });
  assert.equal(notAcknowledged.passed, false);
  assert.deepEqual(notAcknowledged.failures, ['commit_not_acknowledged']);
  assert.deepEqual(notAcknowledged.proofIds, []);

  const partialTransaction = evaluateScenarioADurabilityObservation({
    ...passingObservation,
    paymentObservation: {
      ...passingObservation.paymentObservation,
      warehouseYtdCents: payment.identity.expected.warehouseYtdCents + 1,
    },
  });
  assert.equal(partialTransaction.passed, false);
  assert.deepEqual(partialTransaction.failures, ['transaction_state']);
  assert.deepEqual(partialTransaction.proofIds, []);

  const lostAfterRestart = evaluateScenarioADurabilityObservation({
    ...passingObservation,
    stateAfterRestartSha256: 'b'.repeat(64),
  });
  assert.equal(lostAfterRestart.passed, false);
  assert.deepEqual(lostAfterRestart.failures, ['durability_state']);
  assert.deepEqual(lostAfterRestart.proofIds, []);

  const missingFaultEvidence = evaluateScenarioADurabilityObservation({
    ...passingObservation,
    faultEvidence: null,
  });
  assert.equal(missingFaultEvidence.passed, false);
  assert.deepEqual(missingFaultEvidence.failures, ['fault_evidence_missing']);
  assert.deepEqual(missingFaultEvidence.proofIds, []);

  const omittedFaultEvidence = evaluateScenarioADurabilityObservation({
    commitAcknowledged: true,
    paymentObservation: {...payment.identity.expected},
    stateBeforeRestartSha256: stableStateSha256,
    stateAfterRestartSha256: stableStateSha256,
  });
  assert.equal(omittedFaultEvidence.passed, false);
  assert.deepEqual(omittedFaultEvidence.failures, ['fault_evidence_missing']);
  assert.deepEqual(omittedFaultEvidence.proofIds, []);

  const unchangedIncarnation = evaluateScenarioADurabilityObservation({
    ...passingObservation,
    faultEvidence: {
      ...validFaultEvidence,
      beforeIncarnation: 'inc-1',
      afterIncarnation: 'inc-1',
    },
  });
  assert.equal(unchangedIncarnation.passed, false);
  assert.deepEqual(unchangedIncarnation.failures, ['fault_incarnation_unchanged']);
  assert.deepEqual(unchangedIncarnation.proofIds, []);

  const pgHostOnlyFault = evaluateScenarioADurabilityObservation({
    ...passingObservation,
    faultEvidence: {
      ...validFaultEvidence,
      faultTarget: {
        ...validFaultEvidence.faultTarget,
        pgHostOnly: true,
      },
    },
  });
  assert.equal(pgHostOnlyFault.passed, false);
  assert.deepEqual(pgHostOnlyFault.failures, ['pg_host_only_fault_insufficient']);
  assert.deepEqual(pgHostOnlyFault.proofIds, []);

  const nonReplicaFault = evaluateScenarioADurabilityObservation({
    ...passingObservation,
    faultEvidence: {
      ...validFaultEvidence,
      faultTarget: {
        ...validFaultEvidence.faultTarget,
        isDataReplica: false,
      },
    },
  });
  assert.equal(nonReplicaFault.passed, false);
  assert.deepEqual(nonReplicaFault.failures, ['pg_host_only_fault_insufficient']);
  assert.deepEqual(nonReplicaFault.proofIds, []);

  const missingNodeIdFault = evaluateScenarioADurabilityObservation({
    ...passingObservation,
    faultEvidence: {
      ...validFaultEvidence,
      faultTarget: {
        ...validFaultEvidence.faultTarget,
        nodeId: '',
      },
    },
  });
  assert.equal(missingNodeIdFault.passed, false);
  assert.deepEqual(missingNodeIdFault.failures, ['pg_host_only_fault_insufficient']);
  assert.deepEqual(missingNodeIdFault.proofIds, []);

  const invalidStorageContinuity = evaluateScenarioADurabilityObservation({
    ...passingObservation,
    faultEvidence: {
      ...validFaultEvidence,
      storageContinuity: 'lost',
    },
  });
  assert.equal(invalidStorageContinuity.passed, false);
  assert.deepEqual(invalidStorageContinuity.failures, ['storage_continuity_invalid']);
  assert.deepEqual(invalidStorageContinuity.proofIds, []);

  const emptyRetainedObligations = evaluateScenarioADurabilityObservation({
    ...passingObservation,
    faultEvidence: {
      ...validFaultEvidence,
      retainedObligations: [],
    },
  });
  assert.equal(emptyRetainedObligations.passed, false);
  assert.deepEqual(emptyRetainedObligations.failures, ['storage_continuity_invalid']);
  assert.deepEqual(emptyRetainedObligations.proofIds, []);

  assert.throws(
    () => evaluateScenarioADurabilityObservation({
      ...passingObservation,
      stateAfterRestartSha256: 'not-a-digest',
    }),
    /durability stateAfterRestartSha256 must be a SHA-256 digest/u,
  );
};

runDurabilityGuard();

console.log(PASS_MESSAGE);
