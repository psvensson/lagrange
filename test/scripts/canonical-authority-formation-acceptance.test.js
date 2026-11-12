import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  questState,
  readEpic,
  readLog,
  readQuest,
  verdictOf,
} from '../../scripts/solve/store.js';
import {VERDICT} from '../../scripts/solve/schema.js';
import {applySourceFingerprintConfig} from '../distributed/source-fingerprint-config.js';
import {
  auditCandidateInventory,
  auditCanonicalCallerAndExportClosure,
  auditClassificationClosure,
  auditReintroductionGuardAndCoverageLimits,
  auditZeroUnresolvedViolations,
  verifyAffectedOwnerProofs,
} from '../../scripts/checks/check-repository-legacy-fallback-closure.js';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CURRENT_DIR, '../..');
const UTF8 = 'utf8';
const DIGEST_ALGO = 'sha256';
const DIGEST_ENCODING = 'hex';

const STATUS_SOLVED = 'solved';
const STATUS_PASS = 'pass';
const VERIFIER_PREFIX = 'subagent:';

const EPIC_OPERATION_INTEGRITY = 'operation-integrity-and-reliable-formation';
const EPIC_DEVELOPER_JOURNEY = 'developer-journey-and-measured-comparisons';
const ACCEPTANCE_QUEST_ID = 'canonical-authority-formation-acceptance';
const FORMATION_QUEST_ID = 'fresh-formation-user-table-routability';
const MANIFEST_SCHEMA_FORMATION = 'fresh-formation-three-consecutive-runs/1';

const EXPECTED_EPIC_PREREQUISITE_QUEST_COUNT = 37;
const EXPECTED_MANIFEST_RUN_COUNT = 3;
const EXPECTED_NODE_COUNT = 3;
const EXPECTED_SERVE_VIEW_COUNT = EXPECTED_NODE_COUNT * EXPECTED_NODE_COUNT;
const EXPECTED_UNCLASSIFIED_COUNT = 0;

const FORMATION_REQUIRED_RECEIPT_IDS = Object.freeze([
  'reproducer-red-on-current-product',
  'first-divergence-repaired-at-cause',
  'scenario-green-three-consecutive',
  'independent-verification',
]);

const COMPARISON_HANDOFF_QUEST_IDS = Object.freeze([
  'benchmark-cohort-preserving-dataset-reset',
  'tidb-canonical-semantic-case-completion',
]);

const FORMATION_MANIFEST_PATH =
  'solve/quests/fresh-formation-user-table-routability/evidence/three-consecutive-runs-manifest.json';

async function computeCheckoutRef(rootDir = REPO_ROOT) {
  const fingerprinted = await applySourceFingerprintConfig({}, rootDir);
  return {
    srcFingerprint: fingerprinted?.docker?.srcFingerprint,
    srcFingerprintAlgo: fingerprinted?.docker?.srcFingerprintAlgo,
  };
}

function assertQuestSolvedAndVerified(questId) {
  const quest = readQuest(REPO_ROOT, questId);
  const log = readLog(REPO_ROOT, questId);
  const state = questState(log);

  assert.equal(state.status, STATUS_SOLVED, `Quest ${questId} must be solved`);
  assert.ok(state.terminal !== null, `Quest ${questId} must have a terminal log entry`);

  assert.ok(state.lastVerification !== null, `Quest ${questId} must have a verification entry`);
  assert.equal(
    verdictOf(state.lastVerification),
    VERDICT.APPROVE,
    `Quest ${questId} last verification verdict must be approve`,
  );
  assert.ok(
    String(state.lastVerification.verifier || '').startsWith(VERIFIER_PREFIX),
    `Quest ${questId} verifier must start with ${VERIFIER_PREFIX}`,
  );

  const receipt = readPassingQuestReceipt(questId);
  assertRequiredReceiptsPassed(quest, receipt, questId);
  assertWitnessDigestsCurrent(receipt);
}

// The quest's receipt (evidence/ first), which must exist and have passed.
function readPassingQuestReceipt(questId) {
  const receiptPath = path.resolve(
    REPO_ROOT,
    `solve/quests/${questId}/evidence/receipt.json`,
  );
  const altReceiptPath = path.resolve(
    REPO_ROOT,
    `solve/quests/${questId}/receipt.json`,
  );
  const chosenReceiptPath = fs.existsSync(receiptPath) ?
    receiptPath :
    altReceiptPath;
  assert.ok(
    fs.existsSync(chosenReceiptPath),
    `Receipt for ${questId} must exist at ${chosenReceiptPath}`,
  );
  const receipt = JSON.parse(fs.readFileSync(chosenReceiptPath, UTF8));
  assert.ok(
    receipt.status === STATUS_PASS || receipt.status === 'complete',
    `Receipt status for ${questId} must be pass or complete`,
  );
  return receipt;
}

function assertRequiredReceiptsPassed(quest, receipt, questId) {
  const requiredReceipts = quest?.doneWhen?.args?.requiredReceipts ?? [];
  for (const reqId of requiredReceipts) {
    const found = receipt.receipts?.find((r) => r.id === reqId);
    assert.ok(found, `Receipt for ${questId} must contain required receipt ${reqId}`);
    assert.equal(found.passed, true, `Receipt ${reqId} for ${questId} must have passed === true`);
  }
}

// Every witness file a receipt digests still has those bytes.
function assertWitnessDigestsCurrent(receipt) {
  const digests = receipt.testFileDigests ?? {};
  for (const [file, expectedDigest] of Object.entries(digests)) {
    if (expectedDigest === null) continue;
    const fullPath = path.resolve(REPO_ROOT, file);
    assert.ok(fs.existsSync(fullPath), `Witness test file must exist: ${file}`);
    const actualDigest = createHash(DIGEST_ALGO)
      .update(fs.readFileSync(fullPath))
      .digest(DIGEST_ENCODING);
    assert.equal(
      actualDigest,
      expectedDigest,
      `Witness test file digest mismatch for ${file}`,
    );
  }
}

test('contract-first authoring and producer fidelity is solved and verified', () => {
  assertQuestSolvedAndVerified('contract-first-authoring-and-producer-fidelity');
});

test('content-bound review and interaction proof is solved and verified', () => {
  assertQuestSolvedAndVerified('content-bound-review-and-interaction-proof');
});

test('canonical report outcome classification is solved and verified', () => {
  assertQuestSolvedAndVerified('canonical-report-outcome-classification');
});

test('management action authority is solved and verified', () => {
  assertQuestSolvedAndVerified('management-action-authority');
});

test('canonical replica completion observation is solved and verified', () => {
  assertQuestSolvedAndVerified('canonical-replica-completion-observation');
});

test('table policy outstanding read currency is solved and verified', () => {
  assertQuestSolvedAndVerified('table-policy-outstanding-read-currency');
});

test('routing overlay complete state retirement is solved and verified', () => {
  assertQuestSolvedAndVerified('routing-overlay-complete-state-retirement');
});

test('formation spread progress at cause is solved and verified', () => {
  assertQuestSolvedAndVerified('formation-spread-progress-at-cause');
});

test('node startup natural shutdown is solved and verified', () => {
  assertQuestSolvedAndVerified('node-startup-natural-shutdown');
});

test('lab census benchmark evidence custody is solved and verified', () => {
  assertQuestSolvedAndVerified('lab-census-benchmark-evidence-custody');
});

test('repository legacy fallback closure is solved and verified', () => {
  assertQuestSolvedAndVerified('repository-legacy-fallback-closure');
});

// The serve lane opened with every observer-by-node view, and the
// observations were whole.
function assertRoutabilityPredicatesMet(predicates) {
  const predMap = new Map(predicates.map((p) => [p.id, p]));
  const pServe = predMap.get('a-serve-lane-open');
  assert.equal(pServe?.met, true, 'a-serve-lane-open must be met');
  assert.equal(
    pServe?.detail?.views?.length,
    EXPECTED_SERVE_VIEW_COUNT,
    'a-serve-lane-open must record 9 observer-by-node readiness views',
  );
  const pIntegrity = predMap.get('observation-integrity');
  assert.equal(pIntegrity?.met, true, 'observation-integrity must be met');
  assert.equal(
    pIntegrity?.detail?.failureCount,
    undefined,
    'met observation-integrity has empty detail object',
  );
}

// One manifest run: its report has the recorded bytes (distinct from the
// other runs), was measured on this checkout on the lab, and its formation
// scenario met every routability predicate.
function assertFormationRunReport(runEntry, index, currentCheckout,
  seenReportSha256) {
  const reportRelPath = runEntry.reportPath;
  assert.ok(reportRelPath, `run ${index + 1} reportPath required`);
  const reportAbsPath = path.resolve(REPO_ROOT, reportRelPath);
  assert.ok(
    fs.existsSync(reportAbsPath),
    `report file must exist: ${reportAbsPath}`,
  );

  const reportBytes = fs.readFileSync(reportAbsPath);
  const reportSha = createHash(DIGEST_ALGO)
    .update(reportBytes)
    .digest(DIGEST_ENCODING);
  assert.equal(
    reportSha,
    runEntry.reportSha256,
    `run ${index + 1} report sha256 mismatch`,
  );
  assert.ok(
    !seenReportSha256.has(reportSha),
    `duplicate report sha256 across runs: ${reportSha}`,
  );
  seenReportSha256.add(reportSha);

  const report = JSON.parse(reportBytes.toString(UTF8));
  assert.equal(
    report.metadata?.srcFingerprint,
    currentCheckout.srcFingerprint,
    'report metadata.srcFingerprint mismatch',
  );
  assert.equal(
    report.metadata?.executionTarget,
    'lab',
    'executionTarget must be lab',
  );

  const scenario = report.scenarios?.find(
    (s) => s.scenario === FORMATION_QUEST_ID,
  );
  assert.ok(scenario, `scenario ${FORMATION_QUEST_ID} must exist in report`);
  const routability =
    scenario.details?.diagnostics?.freshFormationRoutability;
  assert.ok(
    routability,
    'diagnostics.freshFormationRoutability must be present',
  );
  assert.equal(
    routability.formationSatisfied,
    true,
    'formationSatisfied must be true',
  );
  assert.equal(routability.readFailureCount, 0, 'readFailureCount must be 0');
  assert.ok(
    Array.isArray(routability.predicates),
    'routability.predicates must be an array',
  );
  assertRoutabilityPredicatesMet(routability.predicates);
}

test('original formation receipt is admitted on the frozen candidate', async () => {
  assertQuestSolvedAndVerified(FORMATION_QUEST_ID);

  const currentCheckout = await computeCheckoutRef(REPO_ROOT);
  assert.ok(
    currentCheckout.srcFingerprint,
    'current checkout srcFingerprint must be defined',
  );

  const receiptPath = path.resolve(
    REPO_ROOT,
    `solve/quests/${FORMATION_QUEST_ID}/evidence/receipt.json`,
  );
  const receipt = JSON.parse(fs.readFileSync(receiptPath, UTF8));
  for (const reqId of FORMATION_REQUIRED_RECEIPT_IDS) {
    const found = receipt.receipts?.find((r) => r.id === reqId);
    assert.ok(found, `Formation receipt must contain ${reqId}`);
    assert.equal(
      found.passed,
      true,
      `Formation receipt ${reqId} must have passed`,
    );
  }

  const manifestPath = path.resolve(REPO_ROOT, FORMATION_MANIFEST_PATH);
  assert.ok(
    fs.existsSync(manifestPath),
    'three-consecutive-runs-manifest.json must exist',
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, UTF8));
  assert.equal(
    manifest.schema,
    MANIFEST_SCHEMA_FORMATION,
    'manifest schema mismatch',
  );
  assert.ok(
    Array.isArray(manifest.runs) &&
      manifest.runs.length === EXPECTED_MANIFEST_RUN_COUNT,
    'manifest must have 3 runs',
  );

  assert.equal(
    manifest.srcFingerprint,
    currentCheckout.srcFingerprint,
    'manifest srcFingerprint mismatch',
  );

  const seenReportSha256 = new Set();
  for (let index = 0; index < EXPECTED_MANIFEST_RUN_COUNT; index += 1) {
    assertFormationRunReport(manifest.runs[index], index, currentCheckout,
      seenReportSha256);
  }
});

test('frozen composition required gates pass on current tree', () => {
  const inventory = auditCandidateInventory(REPO_ROOT);
  assert.equal(inventory.isInventoryComplete, true, 'isInventoryComplete must be true');

  const classification = auditClassificationClosure(REPO_ROOT);
  assert.equal(classification.isClassificationComplete, true, 'isClassificationComplete must be true');
  assert.equal(classification.unclassifiedCount, EXPECTED_UNCLASSIFIED_COUNT, 'unclassifiedCount must be 0');

  const violations = auditZeroUnresolvedViolations(REPO_ROOT);
  assert.equal(violations.zeroUnresolvedViolations, true, 'zeroUnresolvedViolations must be true');

  const closure = auditCanonicalCallerAndExportClosure(REPO_ROOT);
  assert.equal(closure.isClosureComplete, true, 'isClosureComplete must be true');

  const proofs = verifyAffectedOwnerProofs(REPO_ROOT);
  assert.equal(proofs.allWitnessesPresent, true, 'allWitnessesPresent must be true');

  const guard = auditReintroductionGuardAndCoverageLimits(REPO_ROOT);
  assert.equal(guard.guardPasses, true, 'guardPasses must be true');
});

test('all material findings and quests in operation integrity epic are discharged', () => {
  const epic = readEpic(REPO_ROOT, EPIC_OPERATION_INTEGRITY);
  const otherQuests = (epic?.front?.quests ?? []).filter(
    (id) => id !== ACCEPTANCE_QUEST_ID,
  );
  assert.equal(
    otherQuests.length,
    EXPECTED_EPIC_PREREQUISITE_QUEST_COUNT,
    `epic must list exactly ${EXPECTED_EPIC_PREREQUISITE_QUEST_COUNT} prerequisite quests`,
  );

  const unsolved = [];
  for (const qId of otherQuests) {
    const log = readLog(REPO_ROOT, qId);
    const state = questState(log);
    if (state.status !== STATUS_SOLVED) {
      unsolved.push({qId, status: state.status});
    }
  }
  assert.equal(
    unsolved.length,
    0,
    `all 37 prerequisite quests must be solved, but found unsolved: ${JSON.stringify(unsolved)}`,
  );
});

test('comparison handoff quests are bound and verified in developer journey epic', () => {
  for (const handoffId of COMPARISON_HANDOFF_QUEST_IDS) {
    assertQuestSolvedAndVerified(handoffId);
    const quest = readQuest(REPO_ROOT, handoffId);
    assert.equal(
      quest.epic,
      EPIC_DEVELOPER_JOURNEY,
      `Quest ${handoffId} must belong to epic ${EPIC_DEVELOPER_JOURNEY}`,
    );
  }
});

test('catalog authority and visible reconciliation is solved and verified', () => {
  assertQuestSolvedAndVerified('catalog-authority-and-visible-reconciliation');
});

test('cdc recipient domain and retained debt is solved and verified', () => {
  assertQuestSolvedAndVerified('cdc-recipient-domain-and-retained-debt');
});

test('cache replica incarnation coherence is solved and verified', () => {
  assertQuestSolvedAndVerified('cache-replica-incarnation-coherence');
});

test('load admission ingress identity is solved and verified', () => {
  assertQuestSolvedAndVerified('load-admission-ingress-identity');
});
