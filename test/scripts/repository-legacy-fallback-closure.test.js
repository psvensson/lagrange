import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  auditCandidateInventory,
  auditClassificationClosure,
  auditZeroUnresolvedViolations,
  auditCanonicalCallerAndExportClosure,
  verifyAffectedOwnerProofs,
  auditReintroductionGuardAndCoverageLimits,
} from '../../scripts/checks/check-repository-legacy-fallback-closure.js';

test('repository-wide candidate inventory is complete and reconciled with census', () => {
  const inventory = auditCandidateInventory();
  assert.equal(inventory.isInventoryComplete, true,
    'candidate inventory must account for 2,685 census sites across all classes');
  assert.equal(inventory.totalCensusSites, 2685, 'census must contain 2,685 candidate sites');
  assert.equal(inventory.activeDetectedSites, 2682, 'detected fallback sites in src must be 2,682');
  assert.equal(inventory.retiredSites, 9, 'retired sites from census must be 9');
});

test('zero unclassified candidates remain across the repository-wide inventory', () => {
  const audit = auditClassificationClosure();
  assert.equal(audit.isClassificationComplete, true,
    'all candidate sites must be classified in code-navigability-fallback-classification.json');
  assert.equal(audit.unclassifiedCount, 0, 'zero unclassified candidates must remain');
  assert.equal(audit.budgetUnclassifiedRowValue, 0,
    'fallback_sites_unclassified budget row must evaluate to 0');
});

test('zero unresolved legacy or fallback violations survive in maintained code', () => {
  const audit = auditZeroUnresolvedViolations();
  assert.equal(audit.zeroUnresolvedViolations, true,
    'all classified entries must possess authorized semantic dispositions and reasons');
  assert.equal(audit.unauthorizedCount, 0, 'zero unauthorized dispositions');
  assert.equal(audit.omittedExplanationCount, 0, 'zero omitted semantic explanations');
});

test('canonical caller and export closure verifies absent shims and canonical paths', () => {
  const closure = auditCanonicalCallerAndExportClosure();
  assert.equal(closure.isClosureComplete, true,
    'prohibited legacy terms and retired shims must be absent from maintained runtime directories');
  assert.equal(closure.violationsCount, 0, 'zero prohibited legacy terms in callers');
});

test('affected owner test proofs pass across classified subsystems', () => {
  const proofs = verifyAffectedOwnerProofs();
  assert.equal(proofs.allWitnessesPresent, true,
    'core affected owner witnesses across partition, bootstrap, rebalancer must be present');
});

test('reintroduction guard fails closed on unclassified sites and records coverage limits', () => {
  const audit = auditReintroductionGuardAndCoverageLimits();
  assert.equal(audit.guardPasses, true,
    'reintroduction guard must pass when all detected sites are classified');
  assert.equal(audit.coverageLimitsRecorded, true,
    'coverage limits must be explicitly recorded without equating unobserved execution to dead code');
});
