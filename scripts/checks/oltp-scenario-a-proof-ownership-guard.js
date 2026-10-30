import assert from 'node:assert/strict';

import {
  OLTP_SCENARIO_A_SYSTEM,
} from '../../test/distributed/harness/oltp-scenario-a-comparison-systems.js';
import {
  LAGRANGE_SCENARIO_A_PROOF_ACCOUNTING,
  buildLagrangeScenarioAProofPlan,
} from '../../test/distributed/harness/oltp-scenario-a-lagrange-proof-plan.js';
import {
  OLTP_SCENARIO_A_PROOF_CASES,
} from '../../test/distributed/harness/oltp-scenario-a-proof-cases.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
  OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS,
  buildScenarioASemanticGateEvidence,
} from '../../test/distributed/harness/oltp-scenario-a-semantic-gate.js';

const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
const arrayMap = Function.call.bind(Array.prototype.map);

const ARTIFACT_SHA256 = 'e'.repeat(64);
const PASS_PREFIX = 'oltp-scenario-a-proof-ownership-guard: PASS ';
const NEWLINE = '\n';

const runProofOwnershipGuard = () => {
  const proofFor = (caseDefinition, system) => Object.freeze({
    evidenceId: `ownership-${caseDefinition.id}`,
    system,
    status: OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.PASSED,
    artifactSha256: ARTIFACT_SHA256,
    proofIds: caseDefinition.proofIds,
  });

  const allProofIds = arrayFlatMap(
    OLTP_SCENARIO_A_PROOF_CASES,
    ({proofIds}) => proofIds,
  ).sort();
  assert.equal(
    new Set(allProofIds).size,
    allProofIds.length,
    'Scenario A semantic case owners must not claim the same proof ID twice',
  );
  assert.deepEqual(
    allProofIds,
    OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
    'Scenario A case owners must cover every required semantic proof ID',
  );

  const lagrangePlan = buildLagrangeScenarioAProofPlan();
  assert.equal(lagrangePlan.liveEnabled, false);
  assert.deepEqual(
    arrayMap(lagrangePlan.cases, ({id}) => id),
    arrayMap(OLTP_SCENARIO_A_PROOF_CASES, ({id}) => id),
  );
  assert.deepEqual(
    arrayFlatMap(lagrangePlan.cases, ({proofIds}) => proofIds).sort(),
    OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
  );
  assert.equal(lagrangePlan.proofAccounting.length, 33);
  assert.deepEqual(
    arrayMap(lagrangePlan.proofAccounting, ({proofId}) => proofId),
    OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
  );
  assert.deepEqual(
    lagrangePlan.proofAccounting,
    LAGRANGE_SCENARIO_A_PROOF_ACCOUNTING,
  );

  for (const entry of lagrangePlan.proofAccounting) {
    assert.equal(entry.coreMilestone, '0.3.2');
    assert.equal(entry.coreGuaranteeRequired, true);
    assert.equal(entry.comparativeMilestone, '0.4');
    assert.equal(entry.comparativeOwner, 'RM-0.4-scenario-a-comparison');
    assert.equal(entry.profileId, 'scenario-a-semantic-v1');
    assert.ok(entry.scenarioModule && typeof entry.scenarioModule === 'string');
    assert.equal(
      entry.scenarioModule,
      `test/distributed/scenarios/scenario-a-${entry.caseId}-lagrange.js`,
    );
    assert.equal(entry.receiptStatus, 'pending_live_execution');
    assert.equal(entry.receiptArtifactSha256, null);
  }

  for (const proofCase of lagrangePlan.cases) {
    assert.equal(
      proofCase.scenarioModule,
      `test/distributed/scenarios/scenario-a-${proofCase.id}-lagrange.js`,
    );
  }

  const lagrangeProofs = arrayMap(
    OLTP_SCENARIO_A_PROOF_CASES,
    (proofCase) => proofFor(proofCase, OLTP_SCENARIO_A_SYSTEM.LAGRANGE),
  );
  const planWithPassedReceipts = buildLagrangeScenarioAProofPlan({
    proofs: lagrangeProofs,
  });
  assert.equal(planWithPassedReceipts.proofAccounting.length, 33);
  for (const entry of planWithPassedReceipts.proofAccounting) {
    assert.equal(entry.receiptStatus, 'passed');
    assert.equal(entry.receiptArtifactSha256, ARTIFACT_SHA256);
  }

  const gate = buildScenarioASemanticGateEvidence({
    proofs: arrayMap(
      OLTP_SCENARIO_A_PROOF_CASES,
      (proofCase) => proofFor(proofCase, OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV),
    ),
  });
  const tidb = gate.systems[OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV];
  const lagrange = gate.systems[OLTP_SCENARIO_A_SYSTEM.LAGRANGE];
  assert.equal(gate.status, 'incomplete');
  assert.equal(gate.semanticEquivalent, false);
  assert.deepEqual(tidb.failedProofIds, []);
  assert.deepEqual(tidb.missingProofIds, []);
  assert.deepEqual(
    tidb.passedProofIds,
    OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
  );
  assert.deepEqual(lagrange.passedProofIds, []);
  assert.deepEqual(lagrange.failedProofIds, []);
  assert.deepEqual(
    lagrange.missingProofIds,
    OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
  );

  return {
    tidbProofCount: tidb.passedProofIds.length,
    lagrangePlannedProofCount: lagrangePlan.proofCount,
    lagrangeLiveEnabled: lagrangePlan.liveEnabled,
  };
};

const result = runProofOwnershipGuard();

process.stdout.write(PASS_PREFIX + JSON.stringify(result) + NEWLINE);
