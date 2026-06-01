import fs from 'node:fs/promises';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {buildOwnerFileIndex} from '../../scripts/analyze-owner-files.js';
import {buildPriorityRecoveryResiduals} from '../../scripts/analyze-priority-recovery-residuals.js';
import {buildSubagentPrompt} from '../../scripts/work-subagent-prompt.js';
import {buildSubagentNextLines} from '../../scripts/work-subagent-next.js';
import {buildPackageContent, runCli} from '../../scripts/work-package-new.js';
import {
  parsePackageMetadata,
  replacePackageMetadata,
  validatePackageMetadataShape,
} from '../../scripts/work-tracker.js';
import {
  buildRouteAfterRerunLines,
} from '../../scripts/work-package-route-after-rerun.js';
import {buildLlmStartLines} from '../../scripts/work-llm-start.js';
import {buildScenarioRouteSummary} from '../../scripts/work-scenario-route.js';
import {buildScenarioTriageSummary} from '../../scripts/work-scenario-triage.js';
import {
  renderPackageCostSummary,
  summarizePackageCost,
} from '../../scripts/work-package-cost.js';
import {renderSchemaReference} from '../../scripts/work-package-schema.js';

const TEMP_ROOT = 'test-output/work-llm-usability-tools';
const TEMP_OWNER_ROOT = path.join(TEMP_ROOT, 'owner-index');
const TEMP_PACKAGE_ROOT = path.join(TEMP_ROOT, 'packages');
const TEMP_LEDGER_PATH = path.join(TEMP_ROOT, 'missing-ledger.jsonl');
const TEMP_CURRENT_BLOCKER_PATH = path.join(TEMP_ROOT, 'current-blocker.json');
const TEMP_PACKAGE_PATH = path.join(
  TEMP_PACKAGE_ROOT,
  'todo-20260512-llm-usability-test.md',
);
const TEMP_MISSING_ACTIVE_PACKAGE_PATH = path.join(
  TEMP_PACKAGE_ROOT,
  'active-20260512-missing-package.md',
);
const OWNER_NAME = 'operation_workflow_owner';
const BOUNDARY_NAME = 'workflow_progress';
const TEST_TITLE = 'LLM Usability Test Package';
const TEST_SLUG = 'llm-usability-test';
const FIXTURE_PATH =
  'test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-partial-residual.fixture.json';
const ACTIVE_GATE_SATURATION_ARTIFACT_PATH =
  'test-output/reports/rolling-restart-post-architecture-gap-stop-20260529T0740Z.report.json';
const ACTIVE_GATE_HANDOFF_FIXTURE_PATH =
  'test/scripts/__fixtures__/topology-convergence/publication-active-gate-reduced-handoff.fixture.json';
const SATURATED_PACKAGE_ROOT = path.join(TEMP_ROOT, 'saturated-packages');
const OWNER_STARTUP_ACTIVE_GATE = 'startup_active_gate_owner';
const BOUNDARY_SNAPSHOT_COVERAGE = 'snapshot_coverage';

function parseRawPackageMetadata(content) {
  const match = /<!-- work-package\n([\s\S]*?)\n-->/u.exec(content);
  if (!match) {
    throw new Error('package metadata block was not rendered');
  }
  return JSON.parse(match[1]);
}

async function writeTempPackage() {
  await fs.mkdir(TEMP_PACKAGE_ROOT, {recursive: true});
  const content = await buildPackageContent({
    'title': TEST_TITLE,
    'slug': TEST_SLUG,
    'lane': 'lightweight-maintenance',
    'owner': 'workflow_tooling_owner',
    'boundary': 'llm_usability_handoff',
    'dominant-reason': 'test_package',
    'next-action': 'Render LLM start output.',
    'proof': ['node --test test/scripts/work-llm-usability-tools.test.js'],
    'write-scope': ['scripts/work-package-new.js'],
    'ledger': TEMP_LEDGER_PATH,
  });
  await fs.writeFile(TEMP_PACKAGE_PATH, `${content}\n`, 'utf8');
  return content;
}

async function writeSaturatedActiveGateHistory() {
  await fs.rm(SATURATED_PACKAGE_ROOT, {recursive: true, force: true});
  await fs.mkdir(SATURATED_PACKAGE_ROOT, {recursive: true});
  const packages = [
    ['done-20260527-active-gate-contract-gap-a.md', '2026-05-27'],
    ['done-20260528-active-gate-contract-gap-b.md', '2026-05-28'],
    ['done-20260529-active-gate-contract-gap-c.md', '2026-05-29'],
  ];
  for (const [fileName, opened] of packages) {
    const metadata = {
      schema: 'work-package-v2',
      status: 'done',
      intent: {
        opened,
        lane: 'runtime-owner-boundary',
        scenario: 'rolling-restart',
        artifact: ACTIVE_GATE_SATURATION_ARTIFACT_PATH,
        owner: OWNER_STARTUP_ACTIVE_GATE,
        boundary: BOUNDARY_SNAPSHOT_COVERAGE,
        dominantReason: 'snapshot_coverage_incomplete',
        currentState: 'active-gate snapshot coverage stayed local',
        nextAction: 'classify the repeated frontier',
      },
      mechanismCard: {
        failureMechanism: 'contract_gap',
        expectedMovement: 'same frontier',
      },
      closureSummary: {
        resultClassification: 'architecture-gap',
        predictionAccuracy: 'partial',
        observedMovement: 'same frontier',
        successorReason: 'no non-repeated source contract was named',
        nextOwnerBoundary: 'architecture-gap / no-local-runtime-successor',
      },
    };
    const content = [
      '# Saturated Active Gate Fixture',
      '',
      '<!-- work-package',
      JSON.stringify(metadata, null, 2),
      '-->',
      '',
      '## Mechanism Card',
      '',
      '- Failure mechanism: contract_gap',
      '- Expected movement: same frontier',
    ].join('\n');
    await fs.writeFile(path.join(SATURATED_PACKAGE_ROOT, fileName), content);
  }
}

test('shared package schema lists validator enums for LLM scaffolding', (t) => {
  const rendered = renderSchemaReference();

  t.match(rendered, /scenario-release-gate/u);
  t.match(rendered, /mechanical-maintenance/u);
  t.match(rendered, /test-only-proof/u);
  t.match(rendered, /diagnostic-classification/u);
  t.match(rendered, /experiment/u);
  t.match(rendered, /bounded-experiment/u);
  t.match(rendered, /single-file-runtime/u);
  t.match(rendered, /Model-Fit Package Splitter/u);
  t.match(rendered, /modelFitSplit/u);
  t.match(rendered, /targetExecutionModel` explicitly/u);
  t.match(rendered, /gpt-5\.4/u);
  t.match(rendered, /Output Profiles/u);
  t.match(rendered, /extra-high/u);
  t.match(rendered, /writeScope/u);
  t.match(rendered, /theoryLedgerRefs/u);
  t.match(rendered, /Theory Ledger References/u);
  t.match(rendered, /Core Logic Brief/u);
  t.match(rendered, /Causal Decision Contract/u);
  t.match(rendered, /Decision Experiment Gate/u);
  t.match(rendered, /Two-Level Theory/u);
  t.match(rendered, /systemTheory/u);
  t.match(rendered, /sliceTheory/u);
  t.match(rendered, /theoryFitScore/u);
  t.match(rendered, /Canonical outcome/u);
  t.match(rendered, /State model or invariant/u);
  t.match(rendered, /Falsifying focused probe/u);
  t.match(rendered, /Competing explanations/u);
  t.match(rendered, /Systemic interaction scan/u);
  t.match(rendered, /Ping-pong stop rule/u);
  t.match(rendered, /pre-impl/u);
  t.match(rendered, /tool-unavailable/u);
  t.match(rendered, /Execution Evidence/u);
  t.match(rendered, /Agent identity is optional provenance/u);
  t.match(rendered, /files-changed:/u);
  t.match(rendered, /validation:/u);
  t.match(rendered, /outcome:/u);
  t.match(rendered, /historical provenance only/u);
  t.match(rendered, /partial-unvalidated/u);
  t.match(rendered, /pending-before-rerun/u);
  t.match(rendered, /classification-only-stop/u);
  t.match(rendered, /ownerBoundaryMigrationProof/u);
  t.match(rendered, /fromOwner/u);
  t.match(rendered, /Architecture Decision Gate/u);
  t.match(rendered, /architectureDecisionGate/u);
  t.match(rendered, /Rerun Decision/u);
  t.match(rendered, /rerunDecision/u);
  t.match(rendered, /Classification Efficiency/u);
  t.match(rendered, /classificationEfficiency/u);
  t.match(rendered, /Observable Prediction/u);
  t.match(rendered, /observablePrediction/u);
  t.match(rendered, /accuracy/u);
  t.match(rendered, /Closure Summary/u);
  t.match(rendered, /closureSummary/u);
  t.match(rendered, /resultClassification/u);
  t.match(rendered, /Experiment Outcome/u);
  t.match(rendered, /experimentOutcome/u);
  t.match(rendered, /distinguishedHypothesis/u);
  t.match(rendered, /inline-gate-default/u);
  t.match(rendered, /open-runtime-owner-boundary/u);
  t.match(rendered, /open-architecture-experiment/u);
  t.match(rendered, /Bounded Experiment Lane/u);
  t.match(rendered, /boundedExperiment/u);
  t.match(rendered, /hypothesis/u);
  t.match(rendered, /expectedMetric/u);
  t.match(rendered, /validationTier/u);
  t.match(rendered, /single-owner/u);
  t.match(rendered, /Classification-Only Fast Path/u);
  t.match(rendered, /candidateRuntimeFiles/u);
  t.match(rendered, /Parallel Diagnostics/u);
  t.match(rendered, /parallelDiagnostics/u);
  t.match(rendered, /evidence-scout/u);
  t.match(rendered, /model-contract-scout/u);
  t.match(rendered, /source-map-scout/u);
  t.end();
});

test('package metadata validates closure summary shape when present', (t) => {
  const baseMetadata = {
    schema: 'work-package-v2',
    status: 'done',
    opened: '2026-05-28',
    scenario: 'none',
    owner: 'workflow_tooling_owner',
    boundary: 'work_tracking_signal_density',
    nextAction: 'Track closure outcomes.',
    stabilityCredit: 'local-proof-only',
    whyHighestLeverageNow:
      'The active sprint representative gate needs denser package closure outcomes.',
  };
  const invalidObjectErrors = validatePackageMetadataShape(
    'done-20260528-tracking-test.md',
    'done',
    {...baseMetadata, closureSummary: 'not-an-object'},
  ).join('\n');
  const missingFieldErrors = validatePackageMetadataShape(
    'done-20260528-tracking-test.md',
    'done',
    {
      ...baseMetadata,
      closureSummary: {
        resultClassification: 'classification-only',
        predictionAccuracy: 'matched',
        observedMovement: 'Tooling consumed the summary.',
        successorReason: '',
        nextOwnerBoundary: 'startup_active_gate_owner / snapshot_coverage',
        evidenceArtifact: 'work/packages/done-20260528-tracking-test.md',
      },
    },
  ).join('\n');
  const invalidEnumErrors = validatePackageMetadataShape(
    'done-20260528-tracking-test.md',
    'done',
    {
      ...baseMetadata,
      closureSummary: {
        resultClassification: 'not-a-result',
        predictionAccuracy: 'not-an-accuracy',
        observedMovement: 'Tooling consumed the summary.',
        successorReason: 'No successor required.',
        nextOwnerBoundary: 'startup_active_gate_owner / snapshot_coverage',
        evidenceArtifact: 'work/packages/done-20260528-tracking-test.md',
      },
    },
  ).join('\n');
  const validErrors = validatePackageMetadataShape(
    'done-20260528-tracking-test.md',
    'done',
    {
      ...baseMetadata,
      closureSummary: {
        resultClassification: 'classification-only',
        predictionAccuracy: 'matched',
        observedMovement: 'Tooling consumed the summary.',
        successorReason: 'No successor required.',
        nextOwnerBoundary: 'startup_active_gate_owner / snapshot_coverage',
        evidenceArtifact: 'work/packages/done-20260528-tracking-test.md',
      },
    },
  ).join('\n');

  t.match(invalidObjectErrors, /metadata closureSummary must be an object/u);
  t.match(
    missingFieldErrors,
    /metadata closureSummary\.successorReason must be a non-empty string/u,
  );
  t.match(
    invalidEnumErrors,
    /metadata closureSummary\.resultClassification must be one of/u,
  );
  t.match(
    invalidEnumErrors,
    /metadata closureSummary\.predictionAccuracy must be one of/u,
  );
  t.notMatch(validErrors, /closureSummary/u);
  t.end();
});

test('package metadata serialization preserves code quality gate scalar', (t) => {
  const admission = {
    reason: 'improves-evidence-fidelity',
    evidence: 'Package summaries make closure tooling more direct.',
  };
  const content = [
    '# Serializer Test',
    '',
    '<!-- work-package',
    JSON.stringify({
      schema: 'work-package-v2',
      status: 'active',
      intent: {
        opened: '2026-05-28',
        lane: 'lightweight-maintenance',
        scenario: 'none',
        artifact: 'none',
        playback: 'none',
        owner: 'workflow_tooling_owner',
        boundary: 'work_tracking_signal_density',
        dominantReason: 'closure_summary_missing',
        currentState: 'Closure summaries are being adopted.',
        nextAction: 'Serialize package metadata.',
      },
      scope: {
        writeScope: ['scripts/work-tracker.js'],
        handoffFiles: [],
        generatedFiles: [],
        candidateRuntimeFiles: [],
        commitScope: ['scripts/work-tracker.js'],
      },
      gates: {
        stabilityCredit: 'local-proof-only',
        whyHighestLeverageNow:
          'The active sprint needs closure tooling to preserve denser package summaries.',
        codeQualityAdmission: 'improves-evidence-fidelity',
      },
      codeQualityAdmission: admission,
      modelFit: {
        packageClass: 'bounded-implementation',
        intendedMinimumModel: 'gpt-5.3-codex-spark',
        scopeShape: 'workflow-tooling-and-package-records',
        outputProfile: 'medium',
        ambiguityScore: 1,
        escalationTriggers: ['serializer changes become schema changes'],
      },
      execution: {
        theoryLedgerRefs: [],
        proof: {commands: ['npm test -- test/scripts/work-llm-usability-tools.test.js']},
      },
    }, null, 2),
    '-->',
    '',
  ].join('\n');

  const metadata = parsePackageMetadata(
    content,
    'work/packages/active-20260528-serializer-test.md',
  );
  const serialized = replacePackageMetadata(content, metadata);
  const rawMetadata = parseRawPackageMetadata(serialized);

  t.equal(
    rawMetadata.gates.codeQualityAdmission,
    'improves-evidence-fidelity',
  );
  t.same(rawMetadata.codeQualityAdmission, admission);
  t.end();
});

test('package scaffolder pre-fills Model Fit from schema defaults', async (t) => {
  const content = await buildPackageContent({
    'title': TEST_TITLE,
    'slug': TEST_SLUG,
    'lane': 'lightweight-maintenance',
    'owner': 'workflow_tooling_owner',
    'boundary': 'llm_usability_handoff',
    'dominant-reason': 'test_package',
    'next-action': 'Create a package.',
    'proof': ['git diff --check'],
    'write-scope': ['scripts/work-package-new.js'],
    'ledger': TEMP_LEDGER_PATH,
  });

  t.match(content, /"schema": "work-package-v2"/u);
  t.match(content, /"lane": "lightweight-maintenance"/u);
  t.match(content, /"writeScope": \[/u);
  t.notMatch(content, /"status": "todo"/u);
  t.notMatch(content, /"opened": /u);
  t.notMatch(content, /"commitScope": \[/u);
  t.match(content, /"modelFitSplit": \{/u);
  t.match(content, /"outputProfile": "medium"/u);
  t.match(content, /Intended minimum model: `gpt-5\.3-codex-spark`/u);
  t.match(content, /Output profile: `medium`/u);
  t.match(content, /## Model-Fit Split/u);
  t.match(content, /Target executor: `gpt-5\.3-codex-spark`/u);
  t.match(content, /Candidate lower-model child packages/u);
  t.match(content, /Model ledger advisory: `hold`/u);
  t.match(content, /## Core Logic Brief/u);
  t.match(content, /Status: `not-needed`/u);
  t.notMatch(content, /## LLM Tool-First Contract/u);
  t.notMatch(content, /## Workflow Acceleration Contract/u);
  t.notMatch(content, /## Expected Representative Delta/u);
  t.notMatch(content, /## Rerun Decision Gate/u);
  t.notMatch(content, /## Classification Efficiency/u);
  t.match(content, /## Execution Evidence/u);
  t.match(content, /action: implementation/u);
  t.match(content, /files-changed:/u);
  t.match(content, /outcome:/u);
  t.match(content, /parent revalidated focused proof: yes/u);
  t.match(content, /Agent identity is optional provenance/u);
});

test('package scaffolder emits nested work-package-v2 metadata', async (t) => {
  const content = await buildPackageContent({
    'title': TEST_TITLE,
    'slug': TEST_SLUG,
    'lane': 'lightweight-maintenance',
    'owner': 'workflow_tooling_owner',
    'boundary': 'llm_usability_handoff',
    'dominant-reason': 'test_package',
    'next-action': 'Create a package.',
    'proof': ['git diff --check'],
    'write-scope': ['scripts/work-package-new.js'],
    'ledger': TEMP_LEDGER_PATH,
  });
  const rawMetadata = parseRawPackageMetadata(content);
  const normalizedMetadata = parsePackageMetadata(
    content,
    'work/packages/todo-20260512-llm-usability-test.md',
  );

  t.equal(rawMetadata.schema, 'work-package-v2');
  t.notOk(Object.hasOwn(rawMetadata, 'lane'));
  t.notOk(Object.hasOwn(rawMetadata, 'writeScope'));
  t.equal(rawMetadata.intent.lane, 'lightweight-maintenance');
  t.same(rawMetadata.scope.writeScope, ['scripts/work-package-new.js']);
  t.equal(rawMetadata.modelFit.ambiguityScore, 1);
  t.ok(rawMetadata.modelFitSplit);
  t.equal(normalizedMetadata.lane, 'lightweight-maintenance');
  t.same(normalizedMetadata.writeScope, ['scripts/work-package-new.js']);
});

test('package scaffolder adds Core Logic Brief for runtime lanes', async (t) => {
  const content = await buildPackageContent({
    'title': TEST_TITLE,
    'slug': TEST_SLUG,
    'lane': 'runtime-owner-boundary',
    'owner': 'operation_workflow_owner',
    'boundary': 'workflow_progress',
    'dominant-reason': 'dispatch_pending',
    'next-action': 'Prove the workflow progress decision table.',
    'artifact': 'test-output/reports/runtime-owner.report.json',
    'proof': ['node --test test/rebalancer/workflow-progress.test.js'],
    'write-scope': ['src/rebalancer/operation-workflow-owner.js'],
    'forbidden-file': ['startup_active_gate_owner/runtime'],
    'ledger': TEMP_LEDGER_PATH,
  });

test('review subagent prompt allows metadata-only fixes inline',
  async (t) => {
    const content = await writeTempPackage();
    const prompt = buildSubagentPrompt(
      'review',
      TEMP_PACKAGE_PATH,
      content,
    );

    t.match(prompt, /review-fixed-metadata-only/u);
    t.match(prompt, /metadata-only findings/u);
    t.match(prompt, /instead of spawning a fix subagent/u);
  });

  t.match(content, /## Core Logic Brief/u);
  t.match(
    content,
    /Canonical outcome: operation_workflow_owner \/ workflow_progress/u,
  );
  t.match(content, /Inputs\/signals: test-output\/reports\/runtime-owner\.report\.json/u);
  t.match(content, /State model or invariant: The operation_workflow_owner \/ workflow_progress decision table/u);
  t.match(content, /## Causal Decision Contract/u);
  t.match(content, /Signal \| Normalized value \| Owner interpretation/u);
  t.match(content, /Anti-symptom rationale/u);
  t.match(content, /Falsifying focused probe: `node --test test\/rebalancer\/workflow-progress\.test\.js`/u);
  t.match(content, /Competing explanations/u);
  t.match(content, /Systemic interaction scan/u);
  t.match(content, /Ping-pong stop rule/u);
  t.match(content, /Oscillation guard/u);
  t.match(content, /## Decision Experiment Gate/u);
  t.match(content, /Decision question: Does operation_workflow_owner \/ workflow_progress/u);
  t.match(content, /autonomous architecture experiment/u);
  t.match(content, /Pre-edit focused probe: `node --test test\/rebalancer\/workflow-progress\.test\.js`/u);
  t.match(content, /Representative rerun: `npm run work:package:route-after-rerun/u);
  t.match(content, /Redirect rule/u);
  t.match(content, /Proof mapping: Implementation and tests must prove/u);
  t.match(content, /Wrong-slice trigger: Stop or split/u);
  t.notMatch(content, /Status: `not-needed`/u);
});

test('package scaffolder creates bounded experiment packages with inherited context',
  async (t) => {
    const content = await buildPackageContent({
      'title': 'Remaining Node Wake Experiment',
      'slug': 'remaining-node-wake-experiment',
      'lane': 'bounded-experiment',
      'owner': 'topology_publication_owner',
      'boundary': 'publication_convergence',
      'dominant-reason': 'publication_pending',
      'next-action': 'Test one owner wake mechanism.',
      'hypothesis':
        'Explicit owner wake clears the last pending publication reconcile.',
      'hypothesis-discriminator':
        'H1 predicts pendingReconcileCount=0; H2 predicts pendingReconcileCount remains 1; H3 predicts fixture divergence.',
      'expected-metric': 'pendingReconcileCount=1 -> 0',
      'inherits': 'work/packages/active-predecessor.md',
      'validation-tier': 'single-owner',
      'proof': [
        'npm run work:evidence-summary -- test-output/reports/example.report.json',
        'npm test -- test/control-plane/publication-owner-stream.test.js',
      ],
      'write-scope': ['src/control-plane/publication-owner-decision.js'],
      'forbidden-file': ['src/rebalancer/operation-workflow-owner.js'],
      'ledger': TEMP_LEDGER_PATH,
    });

    t.match(content, /"lane": "bounded-experiment"/u);
    t.match(content, /"boundedExperiment": \{/u);
    t.match(content, /"hypothesis": "Explicit owner wake/u);
    t.match(content, /"hypothesisDiscriminator": "H1 predicts/u);
    t.match(content, /"expectedMetric": "pendingReconcileCount=1 -> 0"/u);
    t.match(content, /"observablePrediction": \{/u);
    t.match(content, /"predicted": "pendingReconcileCount=1 -> 0"/u);
    t.match(content, /"accuracy": "pending-before-observation"/u);
    t.match(content, /"inheritsFrom": "work\/packages\/active-predecessor\.md"/u);
    t.match(content, /"validationTier": "single-owner"/u);
    t.match(content, /"inheritsContext": \{/u);
    t.match(content, /"forbiddenScope": true/u);
    t.match(content, /## Bounded Experiment/u);
    t.match(content, /## Observable Prediction/u);
    t.match(content, /Merge requirement: focused test plus canonical route or evidence command/u);
    t.notMatch(content, /## Causal Decision Contract/u);
    t.notMatch(content, /## Decision Experiment Gate/u);
    t.match(content, /Subagent sequencing is optional/u);
  });

test('package scaffolder creates information-first experiment packages',
  async (t) => {
    const content = await buildPackageContent({
      'title': 'Publication Handoff Probe',
      'slug': 'publication-handoff-probe',
      'lane': 'experiment',
      'owner': 'topology_publication_owner',
      'boundary': 'publication_active_gate_handoff',
      'dominant-reason': 'frontier_oscillation',
      'next-action': 'Distinguish owner handoff hypotheses.',
      'hypothesis': 'The missing edge is publication freshness, not active-gate selection.',
      'hypothesis-discriminator':
        'H1 predicts publicationRevision advances before active gate; H2 predicts active gate sees stale revision; H3 predicts fixture replay divergence.',
      'expected-metric':
        'publicationRevision=fresh vs activeGateRevision=stale',
      'proof': [
        'npm test -- test/control-plane/publication-active-gate-handoff.test.js',
      ],
      'write-scope': [
        'test/control-plane/publication-active-gate-handoff.test.js',
      ],
      'ledger': TEMP_LEDGER_PATH,
    });

    t.match(content, /"lane": "experiment"/u);
    t.match(content, /"packageClass": "experiment"/u);
    t.match(content, /"hypothesisDiscriminator": "H1 predicts/u);
    t.match(content, /## Observable Prediction/u);
    t.match(content, /success criterion is information/u);
  });

test('package scaffolder creates lower-model execution package shapes',
  async (t) => {
    const mechanical = await buildPackageContent({
      'title': 'Schema Text Maintenance',
      'slug': 'schema-text-maintenance',
      'lane': 'mechanical-maintenance',
      'owner': 'workflow_tooling_owner',
      'boundary': 'package_schema',
      'dominant-reason': 'lower_model_split',
      'next-action': 'Update package schema prose.',
      'proof': ['npm run work:package:schema'],
      'write-scope': ['work/README.md'],
      'ledger': TEMP_LEDGER_PATH,
    });
    const testOnly = await buildPackageContent({
      'title': 'Publication Owner Fixture Proof',
      'slug': 'publication-owner-fixture-proof',
      'lane': 'test-only-proof',
      'owner': 'topology_publication_owner',
      'boundary': 'publication_convergence',
      'dominant-reason': 'missing_test_probe',
      'next-action': 'Add the focused publication owner fixture.',
      'proof': ['npm test -- test/control-plane/publication-owner-stream.test.js'],
      'write-scope': ['test/control-plane/publication-owner-stream.test.js'],
      'ledger': TEMP_LEDGER_PATH,
    });
    const singleRuntime = await runCli([
      '--title',
      'Single Runtime File Slice',
      '--slug',
      'single-runtime-file-slice',
      '--opened',
      '2026-05-12',
      '--lane',
      'single-file-runtime',
      '--owner',
      'topology_publication_owner',
      '--boundary',
      'publication_convergence',
      '--dominant-reason',
      'publication_pending',
      '--next-action',
      'Implement one preselected runtime file.',
      '--proof',
      'npm test -- test/control-plane/publication-owner-stream.test.js',
      '--write-scope',
      'src/control-plane/publication-owner-decision.js',
      '--write-scope',
      'test/control-plane/publication-owner-stream.test.js',
      '--ledger',
      TEMP_LEDGER_PATH,
    ]);

    t.match(mechanical, /"lane": "mechanical-maintenance"/u);
    t.match(mechanical, /Package class: `mechanical-maintenance`/u);
    t.match(mechanical, /Target executor: `gpt-5\.3-codex-spark`/u);
    t.match(mechanical, /mechanical edits only/u);
    t.match(testOnly, /"lane": "test-only-proof"/u);
    t.match(testOnly, /Package class: `test-only-proof`/u);
    t.match(testOnly, /test assertion or fixture proof only/u);
    t.match(singleRuntime, /"lane": "single-file-runtime"/u);
    t.match(singleRuntime, /Package class: `single-file-runtime`/u);
    t.match(singleRuntime, /Intended minimum model: `gpt-5\.4`/u);
    t.match(singleRuntime, /## Core Logic Brief/u);
    t.match(singleRuntime, /one preselected runtime file/u);
  });

test('package cost summary reports movement and prediction accuracy', (t) => {
  const summary = summarizePackageCost([
    {
      metadata: {
        lane: 'runtime-owner-boundary',
        owner: 'operation_workflow_owner',
        boundary: 'workflow_progress',
        closureSummary: {
          resultClassification: 'reduced',
          predictionAccuracy: 'matched',
        },
        observablePrediction: {accuracy: 'contradicted', metricDelta: 0.5},
      },
    },
    {
      metadata: {
        lane: 'runtime-owner-boundary',
        owner: 'operation_workflow_owner',
        boundary: 'workflow_progress',
        scenarioCausalClosure: {resultClassification: 'same-frontier'},
        observablePrediction: {accuracy: 'missed'},
      },
    },
  ]);
  const rendered = renderPackageCostSummary(summary);

  t.equal(summary.totalDonePackages, 2);
  t.equal(summary.movementPackages, 1);
  t.equal(summary.totalNumericMovementPoints, 0.5);
  t.match(rendered, /Packages per movement-classified package: 2\.00/u);
  t.match(rendered, /Packages per numeric representative point moved: 4\.00/u);
  t.match(rendered, /Observable predictions matched: 1/u);
  t.match(rendered, /`same-frontier`: 1/u);
  t.match(rendered, /## Owner Boundary Cost/u);
  t.match(rendered, /`operation_workflow_owner \/ workflow_progress`: total=2/u);
  t.match(rendered, /numericPoints=0\.5/u);
  t.match(rendered, /## High-Cost Frontiers/u);
  t.end();
});

test('review subagent prompt caps review commands before runtime proof',
  async (t) => {
    const content = await buildPackageContent({
      'title': TEST_TITLE,
      'slug': TEST_SLUG,
      'lane': 'runtime-owner-boundary',
      'owner': 'operation_workflow_owner',
      'boundary': 'workflow_progress',
      'dominant-reason': 'dispatch_pending',
      'next-action': 'Review route before implementation.',
      'artifact': 'test-output/reports/runtime-owner.report.json',
      'proof': [
        'npm run work:scenario-route -- test-output/reports/runtime-owner.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason dispatch_pending',
        'node --test test/rebalancer/workflow-progress.test.js',
        'npm run test:static',
      ],
      'write-scope': ['src/rebalancer/operation-workflow-owner.js'],
      'predecessor': 'work/packages/done-20260518-predecessor.md',
      'ledger': TEMP_LEDGER_PATH,
    });
    const prompt = buildSubagentPrompt('review', TEMP_PACKAGE_PATH, content);
    const reviewBudget = prompt.slice(
      prompt.indexOf('## Review Command Budget'),
      prompt.indexOf('## Escalation Triggers'),
    );

    t.match(prompt, /## Package Proof Ladder \(Implementation\/Parent-Owned\)/u);
    t.match(prompt, /Review verifies this ladder is coherent/u);
    t.match(reviewBudget, /Default budget: five commands/u);
    t.match(reviewBudget, /work:package:doctor -- --suggest/u);
    t.match(reviewBudget, /done-20260518-predecessor\.md/u);
    t.match(reviewBudget, /work:scenario-route/u);
    t.match(reviewBudget, /work:validate -- --entry/u);
    t.match(reviewBudget, /work:validate -- --pre-impl/u);
    t.match(reviewBudget, /Do not run focused runtime tests/u);
    t.match(reviewBudget, /Runtime proof and `npm run test:static` belong/u);
    t.notMatch(reviewBudget, /- `node --test/u);
    t.notMatch(reviewBudget, /- `npm run test:static`/u);
  });

test('package scaffolder keeps Model Fit focused proof concrete', async (t) => {
  const content = await buildPackageContent({
    'title': TEST_TITLE,
    'slug': TEST_SLUG,
    'lane': 'lightweight-maintenance',
    'owner': 'workflow_tooling_owner',
    'boundary': 'llm_usability_handoff',
    'dominant-reason': 'test_package',
    'next-action': 'Create a package.',
    'proof': ['npm run work:evidence-summary -- <fresh-artifact>'],
    'write-scope': ['work/packages/active-test.md'],
    'ledger': TEMP_LEDGER_PATH,
  });

  t.match(content, /Focused proof: `npm run work:advance -- --check`/u);
  t.match(content, /npm run work:evidence-summary -- <fresh-artifact>/u);
});

test('package scaffolder can mark classification-only fast path', async (t) => {
  const content = await buildPackageContent({
    'title': TEST_TITLE,
    'slug': TEST_SLUG,
    'lane': 'causal-escalation',
    'scenario': 'rolling-restart',
    'artifact': FIXTURE_PATH,
    'owner': OWNER_NAME,
    'boundary': BOUNDARY_NAME,
    'dominant-reason': 'classification_only',
    'next-action': 'Close classification-only and rerun evidence.',
    'proof': [
      `npm run work:evidence-summary -- ${FIXTURE_PATH}`,
      `npm run analyze:topology-convergence -- ${FIXTURE_PATH} --handoff-probe`,
    ],
    'write-scope': ['work/packages/active-test.md'],
    'candidate-runtime-file': ['src/rebalancer/operation-workflow-owner.js'],
    'classification-only': true,
    'ledger': TEMP_LEDGER_PATH,
  });

  t.match(content, /"status": "classification-only"/u);
  t.match(content, /## Classification-Only Fast Path/u);
  t.match(content, /candidateRuntimeFiles/u);
  t.match(content, /Subagent sequencing is optional/u);
  t.match(content, /"classificationEfficiency": \{/u);
  t.match(content, /"artifactBudget": "one-artifact"/u);
});

test('package scaffolder routes same-frontier successors to architecture experiments',
  async (t) => {
    const content = await buildPackageContent({
      'title': 'Same Frontier Architecture Experiment',
      'slug': 'same-frontier-architecture-experiment',
      'owner': OWNER_NAME,
      'boundary': BOUNDARY_NAME,
      'dominant-reason': 'same_frontier_no_reduction',
      'next-action': 'Open the autonomous architecture experiment.',
      'proof': [`npm run work:evidence-summary -- ${FIXTURE_PATH}`],
      'route-causal-outcome': 'same-frontier',
      'route-stop-mode': 'architecture-gap-stop',
      'ledger': TEMP_LEDGER_PATH,
    });

    t.match(content, /"nextLane": "experiment"/u);
    t.match(content, /"successorAction": "open-architecture-experiment"/u);
    t.match(content, /autonomous architecture experiment/u);
  });

test('package scaffolder uses package filename date convention', async (t) => {
  const rendered = await runCli([
    '--title',
    TEST_TITLE,
    '--slug',
    TEST_SLUG,
    '--opened',
    '2026-05-12',
    '--lane',
    'lightweight-maintenance',
    '--owner',
    'workflow_tooling_owner',
    '--boundary',
    'llm_usability_handoff',
    '--dominant-reason',
    'test_package',
    '--next-action',
    'Create a package.',
    '--ledger',
    TEMP_LEDGER_PATH,
  ]);

  t.match(rendered, /Path: work\/packages\/todo-20260512-llm-usability-test\.md/u);
});

test('package scaffolder can infer package defaults from an artifact',
  async (t) => {
    const rendered = await runCli([
      '--from-artifact',
      FIXTURE_PATH,
      '--ledger',
      TEMP_LEDGER_PATH,
    ]);

    t.match(rendered, /Path: work\/packages\/todo-/u);
    t.match(rendered, /"lane": "causal-escalation"/u);
    t.match(rendered, /"artifact": "test\/scripts\/__fixtures__/u);
    t.match(rendered, /"owner": "operation_workflow_owner"/u);
    t.match(rendered, /"rerunDecision": \{/u);
    t.match(rendered, /"routeCausalOutcome":/u);
    t.match(rendered, /"classificationEfficiency": \{/u);
    t.match(rendered, /work:scenario-triage/u);
    t.match(rendered, /analyze:priority-recovery-residuals/u);
  });

test('package scaffolder emits two-level theory after inherited repeated frontier metadata',
  async (t) => {
    await fs.mkdir(TEMP_PACKAGE_ROOT, {recursive: true});
    const predecessorPath = path.join(
      TEMP_PACKAGE_ROOT,
      'done-20260512-repeated-frontier-predecessor.md',
    );
    await fs.writeFile(
      predecessorPath,
      [
        '# Repeated Frontier Predecessor',
        '',
        '<!-- work-package',
        JSON.stringify({
          status: 'done',
          lane: 'runtime-owner-boundary',
          scenario: 'rolling-restart',
          scenarioCausalClosure: {
            recentFrontierHistory: [
              'startup_active_gate_owner / snapshot_coverage repeated',
            ],
            oscillationCheck: 'same-frontier repeated after local runtime proof',
            resultClassification: 'same-frontier',
            stopCondition: 'architecture-gap-stop',
          },
        }, null, 2),
        '-->',
      ].join('\n'),
      'utf8',
    );

    const content = await buildPackageContent({
      'title': TEST_TITLE,
      'slug': 'repeated-frontier-child',
      'opened': '2026-05-12',
      'status': 'active',
      'lane': 'runtime-owner-boundary',
      'scenario': 'rolling-restart',
      'artifact': 'test-output/reports/repeated-frontier.report.json',
      'owner': 'startup_active_gate_owner',
      'boundary': 'snapshot_coverage',
      'dominant-reason': 'active_gate_timed_out',
      'next-action': 'Select the snapshot coverage contract before runtime work.',
      'proof': [
        'npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12',
      ],
      'write-scope': ['work/packages/active-repeated-frontier-child.md'],
      'predecessor': predecessorPath,
      'ledger': TEMP_LEDGER_PATH,
    });
    const metadata = parseRawPackageMetadata(content);
    const prompt = buildSubagentPrompt(
      'implementation',
      TEMP_PACKAGE_PATH,
      content,
    );

    t.ok(metadata.systemTheory);
    t.ok(metadata.sliceTheory);
    t.match(content, /## System Theory/u);
    t.match(content, /## Slice Theory/u);
    t.match(content, /Theory-fit score/u);
    t.match(prompt, /## System Theory/u);
    t.match(prompt, /## Slice Theory/u);
    t.match(prompt, /Theory-fit score/u);
    t.notMatch(prompt, /files-changed: <paths or none>/u);
    t.notMatch(prompt, /validation: <command\/result\/files>/u);
    t.notMatch(
      prompt,
      /wrong-slice evidence would be <owner\/boundary\/result change>/u,
    );
  });

test('package scaffolder emits two-level theory after inherited architecture gate metadata',
  async (t) => {
    await fs.mkdir(TEMP_PACKAGE_ROOT, {recursive: true});
    const predecessorPath = path.join(
      TEMP_PACKAGE_ROOT,
      'done-20260512-architecture-gate-predecessor.md',
    );
    await fs.writeFile(
      predecessorPath,
      [
        '# Architecture Gate Predecessor',
        '',
        '<!-- work-package',
        JSON.stringify({
          status: 'done',
          lane: 'runtime-owner-boundary',
          scenario: 'rolling-restart',
          architectureDecisionGate: {
            status: 'selected',
            trigger: 'frontier-oscillation',
            selectedChoice: 'autonomous-architecture-experiment',
            route: 'architecture-package',
          },
        }, null, 2),
        '-->',
      ].join('\n'),
      'utf8',
    );

    const content = await buildPackageContent({
      'title': TEST_TITLE,
      'slug': 'architecture-gate-child',
      'opened': '2026-05-12',
      'status': 'active',
      'lane': 'runtime-owner-boundary',
      'scenario': 'rolling-restart',
      'artifact': 'test-output/reports/architecture-gate.report.json',
      'owner': 'startup_active_gate_owner',
      'boundary': 'snapshot_coverage',
      'dominant-reason': 'active_gate_timed_out',
      'next-action': 'Select the architecture route before runtime work.',
      'proof': [
        'npm run work:scenario-route -- test-output/reports/architecture-gate.report.json --owner startup_active_gate_owner --boundary snapshot_coverage',
      ],
      'write-scope': ['work/packages/active-architecture-gate-child.md'],
      'predecessor': predecessorPath,
      'ledger': TEMP_LEDGER_PATH,
    });
    const metadata = parseRawPackageMetadata(content);

    t.equal(metadata.architectureDecisionGate.route, 'architecture-package');
    t.ok(metadata.systemTheory);
    t.ok(metadata.sliceTheory);
    t.match(content, /## System Theory/u);
    t.match(content, /## Slice Theory/u);
  });

test('package scaffolder emits two-level theory after inherited owner migration metadata',
  async (t) => {
    await fs.mkdir(TEMP_PACKAGE_ROOT, {recursive: true});
    const predecessorPath = path.join(
      TEMP_PACKAGE_ROOT,
      'done-20260512-owner-migration-predecessor.md',
    );
    await fs.writeFile(
      predecessorPath,
      [
        '# Owner Migration Predecessor',
        '',
        '<!-- work-package',
        JSON.stringify({
          status: 'done',
          lane: 'runtime-owner-boundary',
          scenario: 'rolling-restart',
          ownerBoundaryMigrationProof: {
            fromOwner: 'startup_active_gate_owner',
            fromBoundary: 'snapshot_coverage',
            toOwner: 'snapshot_publication_owner',
            toBoundary: 'publication_progress',
            reason: 'focused proof selected publication ownership',
            evidence: 'npm run analyze:causal-model -- test-output/reports/migration.report.json',
          },
        }, null, 2),
        '-->',
      ].join('\n'),
      'utf8',
    );

    const content = await buildPackageContent({
      'title': TEST_TITLE,
      'slug': 'owner-migration-child',
      'opened': '2026-05-12',
      'status': 'active',
      'lane': 'runtime-owner-boundary',
      'scenario': 'rolling-restart',
      'artifact': 'test-output/reports/migration.report.json',
      'owner': 'startup_active_gate_owner',
      'boundary': 'snapshot_coverage',
      'dominant-reason': 'active_gate_timed_out',
      'next-action': 'Confirm migration before runtime work.',
      'proof': [
        'npm run analyze:causal-model -- test-output/reports/migration.report.json',
      ],
      'write-scope': ['work/packages/active-owner-migration-child.md'],
      'predecessor': predecessorPath,
      'ledger': TEMP_LEDGER_PATH,
    });
    const metadata = parseRawPackageMetadata(content);

    t.equal(
      metadata.ownerBoundaryMigrationProof.toOwner,
      'snapshot_publication_owner',
    );
    t.ok(metadata.systemTheory);
    t.ok(metadata.sliceTheory);
    t.match(content, /## System Theory/u);
    t.match(content, /## Slice Theory/u);
  });

test('package scaffolder avoids placeholder prose for artifact-derived packages',
  async (t) => {
    const content = await buildPackageContent({
      'from-artifact': FIXTURE_PATH,
      'ledger': TEMP_LEDGER_PATH,
    });

    t.notMatch(content, /State the focused concern/u);
    t.notMatch(content, /Approved maintenance scope/u);
    t.notMatch(content, /Scaffolded from representative evidence/u);
    t.notMatch(content, /emits the package outcome/u);
    t.notMatch(content, /work\/packages\/<this-package>\.md/u);
    t.notMatch(content, /<owner>|<package>|<artifact>|<paths or none>|<role>/u);
    t.match(content, /npm run work:package:doctor -- --suggest work\/packages\/todo-/u);
    t.match(content, /owner: operation_workflow_owner/u);
  });

test('owner file index ranks files that mention owner and boundary', async (t) => {
  await fs.rm(TEMP_OWNER_ROOT, {recursive: true, force: true});
  await fs.mkdir(path.join(TEMP_OWNER_ROOT, 'src', 'rebalancer'), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(TEMP_OWNER_ROOT, 'src', 'rebalancer', 'owner.js'),
    [
      `const owner = '${OWNER_NAME}';`,
      `const boundary = '${BOUNDARY_NAME}';`,
    ].join('\n'),
  );

  const index = await buildOwnerFileIndex({
    root: TEMP_OWNER_ROOT,
    owner: OWNER_NAME,
    boundary: BOUNDARY_NAME,
  });

  t.equal(index.files[0].path, 'src/rebalancer/owner.js');
  t.equal(index.files[0].ownerMatches, 1);
  t.equal(index.files[0].boundaryMatches, 1);
});

test('priority recovery residual extractor groups by owner boundary', async (t) => {
  const artifact = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf8'));
  const summary = buildPriorityRecoveryResiduals(FIXTURE_PATH, artifact);

  t.equal(summary.schemaVersion, 'priority-recovery-residuals-v1');
  t.equal(summary.splitRequired, true);
  t.ok(
    summary.ownerBoundaryGroups.some((group) =>
      group.owner === 'operation_workflow_owner' &&
      group.boundary === 'workflow_progress'),
  );
  t.ok(summary.suggestedSuccessors[0].command.includes('work:package:new'));
});

test('scenario triage combines representative and priority residual evidence',
  async (t) => {
    const artifact = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf8'));
    const summary = buildScenarioTriageSummary(FIXTURE_PATH, artifact);

    t.equal(summary.schemaVersion, 'scenario-triage-v1');
    t.equal(summary.representativeEvidence.topology.firstFrontierEdgeId,
      'priority_recovery_partition_progress');
    t.equal(summary.priorityRecoveryResiduals.schemaVersion,
      'priority-recovery-residuals-v1');
    t.match(summary.suggestedPackageCommand, /--from-artifact/u);
    t.ok(summary.extractorCommands.some((command) =>
      command.includes('work:scenario-triage')));
  });

test('scenario route combines routing, owner files, and capped proof',
  async (t) => {
    const summary = await buildScenarioRouteSummary({
      artifactPath: FIXTURE_PATH,
      owner: OWNER_NAME,
      boundary: BOUNDARY_NAME,
      dominantReason: 'priority_recovery_event_driven_wait',
      explain: 'active_gate_snapshot_coverage',
      tests: ['test/diagnostics/topology-convergence-graph.test.js'],
    });

    t.equal(summary.schemaVersion, 'scenario-route-v1');
    t.equal(summary.route.owner, OWNER_NAME);
    t.equal(summary.route.boundary, BOUNDARY_NAME);
    t.equal(summary.route.dominantReason, 'priority_recovery_event_driven_wait');
    t.equal(summary.route.explainEdge, 'active_gate_snapshot_coverage');
    t.ok(summary.ownerFiles.matchCount >= 0);
    t.same(summary.suggestedProof, [
      'npm run work:scenario-route -- ' +
        `${FIXTURE_PATH} --owner ${OWNER_NAME} --boundary ` +
        `${BOUNDARY_NAME} --dominant-reason ` +
        'priority_recovery_event_driven_wait --explain ' +
        'active_gate_snapshot_coverage',
      'node --test test/diagnostics/topology-convergence-graph.test.js',
      'npm run work:advance -- --check',
    ]);
    t.match(summary.suggestedPackageCommand, /diagnostic-classification/u);
  });

test('scenario route blocks runtime promotion for saturated active-gate history',
  async (t) => {
    await writeSaturatedActiveGateHistory();
    const summary = await buildScenarioRouteSummary({
      artifactPath: ACTIVE_GATE_SATURATION_ARTIFACT_PATH,
      owner: OWNER_STARTUP_ACTIVE_GATE,
      boundary: BOUNDARY_SNAPSHOT_COVERAGE,
      dominantReason: 'snapshot_coverage_incomplete',
      explain: 'active_gate_snapshot_coverage',
      packageDir: SATURATED_PACKAGE_ROOT,
    });

    t.equal(summary.runtimePromotionGuard.state, 'blocked');
    t.equal(
      summary.runtimePromotionGuard.reason,
      'saturated_history_requires_non_repeated_source_contract',
    );
    t.equal(summary.runtimePromotionGuard.owner, 'diagnostics_owner');
    t.equal(
      summary.runtimePromotionGuard.boundary,
      'causal_analysis_framework',
    );
    t.ok(
      summary.runtimePromotionGuard.signals.includes('same-mechanism-repeat'),
    );
    t.match(summary.suggestedPackageCommand, /--lane experiment/u);
    t.match(
      summary.suggestedPackageCommand,
      /--successor-action open-architecture-experiment/u,
    );
    t.ok(summary.suggestedProof.some((command) =>
      command.includes('work:frontier-history')));
  });

test('scenario route blocks runtime promotion when handoff denies promotion',
  async (t) => {
    await writeSaturatedActiveGateHistory();
    const summary = await buildScenarioRouteSummary({
      artifactPath: ACTIVE_GATE_HANDOFF_FIXTURE_PATH,
      owner: OWNER_STARTUP_ACTIVE_GATE,
      boundary: BOUNDARY_SNAPSHOT_COVERAGE,
      dominantReason: 'owner_reconcile_pending',
      explain: 'active_gate_snapshot_coverage',
      packageDir: SATURATED_PACKAGE_ROOT,
    });

    t.equal(summary.runtimePromotionGuard.state, 'blocked');
    t.equal(
      summary.runtimePromotionGuard.reason,
      'saturated_history_requires_non_repeated_source_contract',
    );
    t.equal(summary.runtimePromotionGuard.owner, 'diagnostics_owner');
    t.equal(
      summary.runtimePromotionGuard.boundary,
      'causal_analysis_framework',
    );
    t.equal(summary.runtimePromotionGuard.historyCount, 3);
    t.ok(
      summary.runtimePromotionGuard.signals.includes('same-mechanism-repeat'),
    );
    t.match(summary.suggestedPackageCommand, /--lane experiment/u);
    t.notMatch(
      summary.suggestedPackageCommand,
      /--lane runtime-owner-boundary/u,
    );
    t.match(
      summary.suggestedPackageCommand,
      /--successor-action open-architecture-experiment/u,
    );
    t.ok(summary.suggestedProof.some((command) =>
      command.includes('work:frontier-history')));
  });

test('route-after-rerun prints the migration transaction without writing',
  async (t) => {
    const lines = await buildRouteAfterRerunLines({
      artifactPath: FIXTURE_PATH,
      packagePath: 'work/packages/active-evidence.md',
      successorPath: 'work/packages/active-successor.md',
      owner: OWNER_NAME,
      boundary: BOUNDARY_NAME,
      dominantReason: 'priority_recovery_event_driven_wait',
      explain: 'active_gate_snapshot_coverage',
      tests: [],
      write: false,
    });
    const rendered = lines.join('\n');

    t.match(rendered, /# Route After Rerun/u);
    t.match(rendered, /# Scenario Route/u);
    t.match(rendered, /## Required Refresh/u);
    t.match(rendered, /work:repair/u);
    t.match(rendered, /work:validate -- --entry/u);
    t.match(rendered, /work:validate -- --pre-impl/u);
    t.match(rendered, /work:package:migrate -- --write --transaction/u);
    t.match(rendered, /Successor package command/u);
    t.match(rendered, /work\/packages\/active-successor\.md/u);
  });

test('subagent prompt generator emits bounded task and ledger guidance',
  async (t) => {
    const content = await writeTempPackage();
    const prompt = buildSubagentPrompt(
      'implementation',
      TEMP_PACKAGE_PATH,
      content,
    );

    t.match(prompt, /implementation Subagent Prompt/u);
    t.match(prompt, /workflow_tooling_owner/u);
    t.match(prompt, /Predecessor: `none`/u);
    t.match(prompt, /## Model Sizing/u);
    t.match(prompt, /Spawn\/execution model: `gpt-5\.3-codex-spark`/u);
    t.match(prompt, /set the model explicitly/u);
    t.match(prompt, /instead of inheriting a stronger parent model/u);
    t.match(prompt, /Lower-model safe when/u);
    t.match(prompt, /Do not widen beyond the write scope/u);
    t.match(prompt, /## Core Logic Brief/u);
    t.match(prompt, /Status: `not-needed`/u);
    t.match(prompt, /## Causal Decision Contract/u);
    t.match(prompt, /## Decision Experiment Gate/u);
    t.match(prompt, /## Systemic Thinking Check/u);
    t.match(prompt, /Decision Experiment Gate/u);
    t.match(prompt, /pre-edit focused probe must run/u);
    t.match(prompt, /competing explanations/u);
    t.match(prompt, /ping-pong stop rule/u);
    t.match(prompt, /## Output Budget/u);
    t.match(prompt, /Profile: `medium`/u);
    t.match(prompt, /More output is not evidence/u);
    t.match(prompt, /## Tool-First Workflow/u);
    t.match(prompt, /## Write Scope/u);
    t.match(prompt, /## Commit Scope/u);
    t.match(prompt, /work:evidence-summary/u);
    t.match(prompt, /ad hoc `jq`/u);
    t.match(prompt, /## Execution Evidence/u);
    t.match(prompt, /after completed implementation or validation work/u);
    t.match(prompt, /falsification/u);
    t.match(prompt, /blocker:/u);
    t.match(prompt, /## Exact Validation Commands/u);
    t.match(prompt, /Do not add ad hoc Jest or TAP flags/u);
    t.match(prompt, /partial-unvalidated/u);
    t.match(prompt, /parent revalidated focused proof: yes/u);
    t.match(prompt, /edited after the last evidence line/u);
    t.match(prompt, /Agent identity is optional provenance/u);
  });

test('subagent prompt generator emits freshness-review gate guidance',
  async (t) => {
    const content = await writeTempPackage();
    const prompt = buildSubagentPrompt(
      'freshness-review',
      TEMP_PACKAGE_PATH,
      content,
    );

    t.match(prompt, /freshness-review Subagent Prompt/u);
    t.match(prompt, /Start a new subagent instance/u);
    t.match(prompt, /decision: fresh/u);
    t.match(prompt, /Agent <name> \(<agent-id>\)/u);
    t.match(prompt, /local or parent-session evidence does not satisfy/u);
  });

test('subagent-next emits the next required role and prompt', async (t) => {
  await writeTempPackage();
  const lines = await buildSubagentNextLines([
    '--package',
    TEMP_PACKAGE_PATH,
  ]);
  const rendered = lines.join('\n');

  t.match(rendered, /# Next Subagent/u);
  t.match(rendered, /Role: `none`|Role: `review`|Role: `implementation`/u);
});

test('llm-start combines context, doctor, dirty scope, model ledger, and evidence',
  async (t) => {
    await writeTempPackage();
    const lines = await buildLlmStartLines([
      '--package',
      TEMP_PACKAGE_PATH,
      '--ledger',
      TEMP_LEDGER_PATH,
    ]);
    const rendered = lines.join('\n');

    t.match(rendered, /# LLM Start/u);
    t.match(rendered, /## Work Context/u);
    t.match(rendered, /## Package Doctor/u);
    t.match(rendered, /## Dirty Scope/u);
    t.match(rendered, /## Model Ledger/u);
    t.match(rendered, /## Representative Evidence/u);
  });

test('llm-start renders a no-active-package handoff without failing',
  async (t) => {
    await fs.mkdir(TEMP_ROOT, {recursive: true});
    await fs.writeFile(
      TEMP_CURRENT_BLOCKER_PATH,
      `${JSON.stringify({
        schema: 'current-blocker-v1',
        sprint: 'work/sprints/active-test.md',
        package: 'none',
        status: 'none',
        generatedFiles: ['work/sprints/current-blocker.json'],
        currentState: 'No active work package.',
        nextAction: 'Activate a queued package or create one focused package.',
      })}\n`,
      'utf8',
    );

    const lines = await buildLlmStartLines([
      '--current-blocker',
      TEMP_CURRENT_BLOCKER_PATH,
      '--ledger',
      TEMP_LEDGER_PATH,
    ]);
    const rendered = lines.join('\n');

    t.match(rendered, /# LLM Start/u);
    t.match(rendered, /## Work Context/u);
    t.match(rendered, /## Sprint Remaining/u);
    t.match(rendered, /No active package recorded\. Package doctor skipped/u);
    t.match(rendered, /## Dirty Scope/u);
  });

test('llm-start gives a repair command for stale current-blocker packages',
  async (t) => {
    await fs.mkdir(TEMP_ROOT, {recursive: true});
    await fs.writeFile(
      TEMP_CURRENT_BLOCKER_PATH,
      `${JSON.stringify({
        schema: 'current-blocker-v1',
        sprint: 'work/sprints/active-test.md',
        package: TEMP_MISSING_ACTIVE_PACKAGE_PATH,
        status: 'active',
      })}\n`,
      'utf8',
    );

    try {
      await buildLlmStartLines([
        '--current-blocker',
        TEMP_CURRENT_BLOCKER_PATH,
        '--ledger',
        TEMP_LEDGER_PATH,
      ]);
      t.fail('expected stale current-blocker package to fail');
    } catch (error) {
      t.match(error.message, /Current blocker package .* is missing/u);
      t.match(error.message, /npm run work:repair/u);
    }
  });
