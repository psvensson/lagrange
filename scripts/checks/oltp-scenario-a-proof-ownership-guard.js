import assert from 'node:assert/strict';

import {
  OLTP_SCENARIO_A_SYSTEM,
} from '../../test/distributed/harness/oltp-scenario-a-comparison-systems.js';
import {
  OLTP_SCENARIO_A_DELIVERY_PROOF_IDS,
} from '../../test/distributed/harness/oltp-scenario-a-delivery-case.js';
import {
  OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS,
} from '../../test/distributed/harness/oltp-scenario-a-new-order-contention-case.js';
import {
  OLTP_SCENARIO_A_ORDER_STATUS_PROOF_IDS,
} from '../../test/distributed/harness/oltp-scenario-a-order-status-case.js';
import {
  OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
} from '../../test/distributed/harness/oltp-scenario-a-payment-case.js';
import {
  OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS,
  buildScenarioASemanticGateEvidence,
} from '../../test/distributed/harness/oltp-scenario-a-semantic-gate.js';
import {
  OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS,
} from '../../test/distributed/harness/oltp-scenario-a-stock-level-case.js';
import {
  OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS,
} from '../../test/distributed/harness/oltp-scenario-a-visibility-case.js';

const ARTIFACT_SHA256 = 'e'.repeat(64);
const CASES = Object.freeze([
  Object.freeze({
    evidenceId: 'ownership-new-order',
    proofIds: OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS,
  }),
  Object.freeze({
    evidenceId: 'ownership-visibility',
    proofIds: OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS,
  }),
  Object.freeze({
    evidenceId: 'ownership-payment',
    proofIds: OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
  }),
  Object.freeze({
    evidenceId: 'ownership-order-status',
    proofIds: OLTP_SCENARIO_A_ORDER_STATUS_PROOF_IDS,
  }),
  Object.freeze({
    evidenceId: 'ownership-delivery',
    proofIds: OLTP_SCENARIO_A_DELIVERY_PROOF_IDS,
  }),
  Object.freeze({
    evidenceId: 'ownership-stock-level',
    proofIds: OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS,
  }),
]);

function proofFor(caseDefinition) {
  return Object.freeze({
    evidenceId: caseDefinition.evidenceId,
    system: OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
    status: OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.PASSED,
    artifactSha256: ARTIFACT_SHA256,
    proofIds: caseDefinition.proofIds,
  });
}

const allProofIds = CASES.flatMap(({proofIds}) => proofIds);
assert.equal(
  new Set(allProofIds).size,
  allProofIds.length,
  'Scenario A semantic case owners must not claim the same proof ID twice',
);

const gate = buildScenarioASemanticGateEvidence({
  proofs: CASES.map(proofFor),
});
assert.equal(gate.status, 'incomplete');
assert.equal(gate.semanticEquivalent, false);
assert.equal(
  gate.systems[OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV].failedProofIds.length,
  0,
);
for (const caseDefinition of CASES) {
  for (const proofId of caseDefinition.proofIds) {
    assert.equal(
      gate.systems[OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV]
        .passedProofIds.includes(proofId),
      true,
    );
  }
}

console.log('oltp-scenario-a-proof-ownership-guard: PASS');
