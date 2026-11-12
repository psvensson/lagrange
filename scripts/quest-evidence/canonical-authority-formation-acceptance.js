#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';
import {
  CHECK_VERIFICATION_FLAG,
  exitWithQuestVerificationCheck,
} from './quest-verification-check.js';

const QUEST_ID = 'canonical-authority-formation-acceptance';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;

const WITNESS_TEST =
  'test/scripts/canonical-authority-formation-acceptance.test.js';

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) {
  exitWithQuestVerificationCheck(QUEST_ID);
}

const receipts = Object.freeze([
  Object.freeze({
    id: 'contract-first-authoring-verified',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^contract-first authoring and producer fidelity is solved and verified$',
    detail: 'Contract-first authoring and producer fidelity quest is solved ' +
      'with current subagent verification and passing receipt.',
  }),
  Object.freeze({
    id: 'content-bound-review-and-interaction-proof-verified',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^content-bound review and interaction proof is solved and verified$',
    detail: 'Content-bound review and interaction proof quest is solved with ' +
      'current subagent verification and passing receipt.',
  }),
  Object.freeze({
    id: 'report-classification-verified',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^canonical report outcome classification is solved and verified$',
    detail: 'Canonical report outcome classification quest is solved with ' +
      'current subagent verification and passing receipt.',
  }),
  Object.freeze({
    id: 'management-authority-verified',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^management action authority is solved and verified$',
    detail: 'Management action authority quest is solved with current ' +
      'subagent verification and passing receipt.',
  }),
  Object.freeze({
    id: 'canonical-completion-observation-verified',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^canonical replica completion observation is solved and verified$',
    detail: 'Canonical replica completion observation quest is solved with ' +
      'current subagent verification and passing receipt.',
  }),
  Object.freeze({
    id: 'policy-currency-verified',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^table policy outstanding read currency is solved and verified$',
    detail: 'Table policy outstanding read currency quest is solved with ' +
      'current subagent verification and passing receipt.',
  }),
  Object.freeze({
    id: 'routing-freshness-verified',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^routing overlay complete state retirement is solved and verified$',
    detail: 'Routing overlay complete state retirement quest is solved with ' +
      'current subagent verification and passing receipt.',
  }),
  Object.freeze({
    id: 'formation-progress-verified',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^formation spread progress at cause is solved and verified$',
    detail: 'Formation spread progress at cause quest is solved with ' +
      'current subagent verification and passing receipt.',
  }),
  Object.freeze({
    id: 'natural-shutdown-verified',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^node startup natural shutdown is solved and verified$',
    detail: 'Node startup natural shutdown quest is solved with current ' +
      'subagent verification and passing receipt.',
  }),
  Object.freeze({
    id: 'lab-and-evidence-custody-verified',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^lab census benchmark evidence custody is solved and verified$',
    detail: 'Lab census benchmark evidence custody quest is solved with ' +
      'current subagent verification and passing receipt.',
  }),
  Object.freeze({
    id: 'repository-legacy-fallback-closure-verified',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^repository legacy fallback closure is solved and verified$',
    detail: 'Repository legacy fallback closure quest is solved with current ' +
      'subagent verification and passing receipt.',
  }),
  Object.freeze({
    id: 'original-formation-receipt-admitted',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^original formation receipt is admitted on the frozen candidate$',
    detail: 'Original fresh formation routability quest is verified solved ' +
      'with all 4 passing receipt IDs and three consecutive physical runs.',
  }),
  Object.freeze({
    id: 'frozen-composition-required-gates',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^frozen composition required gates pass on current tree$',
    detail: 'All legacy fallback closure inventory, classification, violation, ' +
      'closure, witness, and reintroduction guard gates pass.',
  }),
  Object.freeze({
    id: 'all-material-findings-discharged',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^all material findings and quests in operation integrity epic are discharged$',
    detail: 'Every prerequisite quest in operation-integrity-and-reliable-formation ' +
      'epic has reached terminal solved status.',
  }),
  Object.freeze({
    id: 'comparison-handoff-bound',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^comparison handoff quests are bound and verified in developer journey epic$',
    detail: 'Comparison handoff quests are solved, verified, and bound to ' +
      'developer-journey-and-measured-comparisons epic.',
  }),
  Object.freeze({
    id: 'catalog-authority-and-visible-reconciliation-verified',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^catalog authority and visible reconciliation is solved and verified$',
    detail: 'Catalog authority and visible reconciliation quest is solved with ' +
      'current subagent verification and passing receipt.',
  }),
  Object.freeze({
    id: 'cdc-recipient-domain-and-retained-debt-verified',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^cdc recipient domain and retained debt is solved and verified$',
    detail: 'CDC recipient domain and retained debt quest is solved with ' +
      'current subagent verification and passing receipt.',
  }),
  Object.freeze({
    id: 'cache-replica-incarnation-coherence-verified',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^cache replica incarnation coherence is solved and verified$',
    detail: 'Cache replica incarnation coherence quest is solved with current ' +
      'subagent verification and passing receipt.',
  }),
  Object.freeze({
    id: 'load-admission-ingress-identity-verified',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^load admission ingress identity is solved and verified$',
    detail: 'Load admission ingress identity quest is solved with current ' +
      'subagent verification and passing receipt.',
  }),
  Object.freeze({
    id: 'independent-verification',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG}`,
    detail: 'An approving subagent verification newer than the last attempt, ' +
      'read through the solve store owner.',
  }),
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE,
  receipts,
});
