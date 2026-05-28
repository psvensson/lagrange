import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  buildCurrentBlockerPayload,
  buildPackageDoctorLines,
  findActivePackageLinkInSprint,
  isGeneratedCurrentBlockerPath,
  metadataHasClassificationOnlyOutcome,
  metadataRequiresFreshnessReview,
  metadataRequiresSubagentSequencing,
  metadataUsesClassificationOnlyFastPath,
  metadataUsesPureClassificationFastPath,
  renderCurrentBlockerMarkdown,
  renderCurrentEdgeCardSection,
  resolveSprintPackageReference,
  upsertSprintCurrentEdgeCard,
  validateActiveWorkReferences,
  validateCausalDecisionContract,
  validateCausalGovernanceContract,
  validateClassificationEfficiencyContract,
  validateCommitAndPushLedger,
  validateCoreLogicBrief,
  validateCurrentBlockerPayloadFreshness,
  validateCurrentBlockerSnapshot,
  validateDecisionExperimentGate,
  validateExecutionEvidenceLedger,
  validateExperimentOutcomeContract,
  validateFrontierOscillationContract,
  validateModelFitContract,
  validateObservablePredictionContract,
  validatePackageMetadataShape,
  validatePackageScaffoldReadiness,
  validateProbePackageContract,
  validateRequiredPreImplProbeContract,
  validateContractProofRequirement,
  validateRepresentativeResidualContract,
  validateRerunDecisionContract,
  validateScenarioCausalClosureContract,
  validateScenarioFrontierOwnerBoundaryContract,
  validateSameFrontierStopContract,
  validateSprintCurrentEdgeCard,
  validateSubagentAttemptLedger,
  validateSubagentProgressLedger,
  validateSubagentSequencingLedger,
  validateSprintStrategyBrief,
  validateTwoLevelTheoryContract,
} from '../../scripts/work-tracker.js';

export const WORK_TRACKER_LEDGER_TEST_FILE = 'work/packages/active-test-package.md';
export const WORK_TRACKER_LEDGER_LOCAL_PATH_TEST_FILE =
  'work/packages/active-20260511-active-gate-local-blocker-frontier.md';
export const WORK_TRACKER_DONE_TEST_FILE = 'work/packages/done-test-package.md';
export const WORK_TRACKER_FUTURE_DONE_TEST_FILE =
  'work/packages/done-20260519-strict-runtime.md';
export const WORK_TRACKER_CURRENT_BLOCKER_MARKDOWN =
  'work/sprints/current-blocker.md';
export const WORK_TRACKER_ACTIVE_DOCTOR_FILE =
  'work/packages/active-20260507-doctor-test.md';
export const REVIEW_AGENT_ID = '019e02b6-1920-7130-b040-da2e6f4efbc4';
export const FIX_AGENT_ID = '019e02b7-ece3-73a2-a664-389d40dfd575';
export const IMPLEMENTATION_AGENT_ID = '019e02b9-7651-7851-bc85-a0cef8a90176';
export const FRESHNESS_AGENT_ID = '019e02b8-1111-7333-a444-389d40dfd575';
export const TEST_COMMIT_SHA = 'abcdef1234567890abcdef1234567890abcdef12';
export const TEST_PUSH_TARGET = 'origin/main';
export const TEST_THEORY_LEDGER_REF = 'theory-20260522-ledger-test';
export const WORK_TRACKER_ACTIVE_STATUS = 'active';
export const WORK_TRACKER_DONE_STATUS = 'done';
export const LANE_READ_REVIEW_DOC_ONLY = 'read-review-doc-only';
export const LANE_MECHANICAL_MAINTENANCE = 'mechanical-maintenance';
export const LANE_LIGHTWEIGHT_MAINTENANCE = 'lightweight-maintenance';
export const LANE_TEST_ONLY_PROOF = 'test-only-proof';
export const LANE_DIAGNOSTIC_CLASSIFICATION = 'diagnostic-classification';
export const LANE_EXPERIMENT = 'experiment';
export const LANE_BOUNDED_EXPERIMENT = 'bounded-experiment';
export const LANE_SINGLE_FILE_RUNTIME = 'single-file-runtime';
export const LANE_RUNTIME_OWNER_BOUNDARY = 'runtime-owner-boundary';
export const LANE_CAUSAL_ESCALATION = 'causal-escalation';

function withoutUndefinedFields(fields) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
}

export function buildWorkPackageV2Metadata(metadata = {}) {
  const proofCommands = metadata.proof ||
    metadata.execution?.proof?.commands ||
    [];
  return {
    ...metadata,
    schema: 'work-package-v2',
    intent: {
      ...withoutUndefinedFields({
        opened: metadata.opened,
        closed: metadata.closed,
        lane: metadata.lane,
        scenario: metadata.scenario,
        artifact: metadata.artifact,
        playback: metadata.playback,
        owner: metadata.owner,
        boundary: metadata.boundary,
        dominantReason: metadata.dominantReason,
        currentState: metadata.currentState,
        nextAction: metadata.nextAction,
        predecessor: metadata.predecessor,
        successor: metadata.successor,
      }),
      ...(metadata.intent || {}),
    },
    scope: {
      writeScope: metadata.writeScope || metadata.scope?.writeScope || [],
      handoffFiles: metadata.handoffFiles || metadata.scope?.handoffFiles || [],
      generatedFiles: metadata.generatedFiles || metadata.scope?.generatedFiles || [],
      candidateRuntimeFiles:
        metadata.candidateRuntimeFiles ||
        metadata.scope?.candidateRuntimeFiles ||
        [],
      commitScope: metadata.commitScope || metadata.scope?.commitScope || [],
    },
    gates: {
      whyHighestLeverageNow:
        metadata.whyHighestLeverageNow ||
        metadata.gates?.whyHighestLeverageNow ||
        'This package advances the active sprint goal with focused proof.',
      stabilityCredit:
        metadata.stabilityCredit ||
        metadata.gates?.stabilityCredit ||
        'local-proof-only',
      ...withoutUndefinedFields({
        representativeRerunCadence: metadata.representativeRerunCadence,
        codeQualityAdmission: metadata.codeQualityAdmission,
      }),
      ...(metadata.gates || {}),
    },
    execution: {
      theoryLedgerRefs:
        metadata.theoryLedgerRefs ||
        metadata.execution?.theoryLedgerRefs ||
        [],
      proof: {
        commands: proofCommands,
      },
      ...(metadata.execution || {}),
    },
  };
}

export const CAUSAL_GOVERNANCE_VALID_METADATA = Object.freeze({
  status: WORK_TRACKER_ACTIVE_STATUS,
  scenario: 'rolling-restart',
  causalGovernance: Object.freeze({
    hypothesis:
      'If owner boundary repair is correct, causal edge x reduces or migrates.',
    stopConditionCheck:
      'npm --silent run analyze:causal-model -- test-output/reports/example.report.json',
    expectedCausalModelChange:
      'causal edge x disappears, reduces, migrates, or contradicts the package',
    representativeOutcome: 'pending-before-rerun',
    causalDebt: 'residual causal debt tracked in successor package',
    crossBoundaryReview: 'not-due until the next two package closures',
  }),
});
export const SCENARIO_CAUSAL_CLOSURE_VALID_METADATA = Object.freeze({
  status: WORK_TRACKER_ACTIVE_STATUS,
  scenario: 'rolling-restart',
  scenarioCausalClosure: Object.freeze({
    referenceScenarioOrProbe: 'rolling-restart priority recovery blocker probe',
    phaseChain: Object.freeze([
      'publication convergence',
      'operation workflow dispatch',
      'startup active-gate presentation',
    ]),
    currentFirstFrontier:
      'operation_workflow_owner / workflow_progress retryable frontier',
    knownDownstreamBlockers: Object.freeze([
      'startup_active_gate_owner snapshot coverage remains downstream',
    ]),
    missingCausalEdge:
      'dispatch-pending retry wake must be proven before downstream closure',
    missingCausalEdgeProbe:
      'npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js',
    boundedProgressProof:
      'Focused probe proves dispatch wake retry timeout advances through a bounded timer.',
    boundedProgressProofArtifact:
      'test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js',
    expectedObservableTransition:
      'dispatch-pending workflow progress advances to retry-scheduled proof',
    maxProgressBound: 'one owner wake retry timeout dispatch cycle',
    sameFrontierFallback:
      'keep operation_workflow_owner / workflow_progress as the active frontier',
    expectedNextFrontier:
      'priority_recovery_partition_progress reduces or migrates to a named owner',
    resultClassification: 'classification-only',
    stopCondition: 'classification-only-stop',
  }),
});
export const RERUN_DECISION_VALID_METADATA = Object.freeze({
  status: WORK_TRACKER_ACTIVE_STATUS,
  lane: LANE_DIAGNOSTIC_CLASSIFICATION,
  scenario: 'rolling-restart',
  artifact: 'test-output/reports/rerun.report.json',
  owner: 'operation_workflow_owner',
  boundary: 'workflow_progress',
  dominantReason: 'owner_reconcile_pending',
  writeScope: Object.freeze(['work/packages/active-test-package.md']),
  commitScope: Object.freeze(['work/packages/active-test-package.md']),
  rerunDecision: Object.freeze({
    sourceArtifact: 'test-output/reports/rerun.report.json',
    routeOwner: 'operation_workflow_owner',
    routeBoundary: 'workflow_progress',
    routeDominantReason: 'owner_reconcile_pending',
    routeCausalOutcome: 'continue_local_fix',
    stopMode: 'classified_local_blocker',
    nextLane: LANE_DIAGNOSTIC_CLASSIFICATION,
    expectedDelta:
      'Classify the selected frontier before runtime promotion.',
    requiredRefreshCommands: Object.freeze([
      'npm run work:package:route-after-rerun -- --artifact test-output/reports/rerun.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason owner_reconcile_pending',
      'Update Sprint Strategy Brief from the route result.',
      'Update Current Edge Card from the route result.',
      'npm run work:repair',
      'npm run work:validate -- --entry',
      'npm run work:validate -- --pre-impl',
    ]),
  }),
});
export const CLASSIFICATION_EFFICIENCY_VALID_METADATA = Object.freeze({
  classificationEfficiency: Object.freeze({
    defaultMode: 'separate-package-approved',
    separatePackageReason: 'successor-selection',
    artifactBudget: 'one-artifact',
    proofCommandBudget: 'two-or-three-canonical-commands',
    commands: Object.freeze([
      'npm run work:evidence-summary -- test-output/reports/rerun.report.json',
      'npm run work:scenario-route -- test-output/reports/rerun.report.json',
      'npm run work:validate -- --pre-impl',
    ]),
    decisionRecord:
      'Record this one classifier result and use the successor for future work.',
    successorAction: 'open-runtime-owner-boundary',
    runtimePromotionRule:
      'Stable owner/boundary local-fix routes open a runtime-owner-boundary successor.',
  }),
});
export const CLASSIFICATION_ONLY_FAST_PATH_METADATA = Object.freeze(
  buildWorkPackageV2Metadata({
  status: WORK_TRACKER_ACTIVE_STATUS,
  opened: '2026-05-18',
  lane: LANE_CAUSAL_ESCALATION,
  scenario: 'rolling-restart',
  artifact: 'test-output/reports/classification-only.report.json',
  playback: 'none',
  owner: 'operation_workflow_owner',
  boundary: 'workflow_progress',
  dominantReason: 'owner_reconcile_pending',
  currentState: 'Focused proof classifies the edge without runtime edits.',
  nextAction: 'Close classification-only and rerun representative evidence.',
  proof: Object.freeze([
    'npm run work:evidence-summary -- test-output/reports/classification-only.report.json',
    'npm run analyze:topology-convergence -- test-output/reports/classification-only.report.json --handoff-probe',
    'npm --silent run analyze:causal-model -- test-output/reports/classification-only.report.json',
  ]),
  writeScope: Object.freeze(['work/packages/active-test-package.md']),
  handoffFiles: Object.freeze([
    'test-output/reports/classification-only.report.json',
  ]),
  generatedFiles: Object.freeze([]),
  candidateRuntimeFiles: Object.freeze([
    'src/rebalancer/operation-workflow-owner.js',
  ]),
  commitScope: Object.freeze(['work/packages/active-test-package.md']),
  modelFit: Object.freeze({
    packageClass: 'representative-frontier-closure',
    intendedMinimumModel: 'gpt-5.3-codex',
    scopeShape: 'owner-boundary-contraction/current-frontier',
    outputProfile: 'medium',
    escalationTriggers: Object.freeze(['runtime ownership changes']),
    ambiguityScore: 1,
  }),
  representativeResidual: Object.freeze({
    status: 'classification-only',
    scenario: 'rolling-restart',
    artifact: 'test-output/reports/classification-only.report.json',
    frontier: 'active_gate_snapshot_coverage',
    owner: 'operation_workflow_owner',
    boundary: 'workflow_progress',
    dominantReason: 'owner_reconcile_pending',
    nextAction: 'Close classification-only and rerun representative evidence.',
  }),
  causalGovernance: CAUSAL_GOVERNANCE_VALID_METADATA.causalGovernance,
  scenarioCausalClosure:
    SCENARIO_CAUSAL_CLOSURE_VALID_METADATA.scenarioCausalClosure,
  classificationEfficiency:
    CLASSIFICATION_EFFICIENCY_VALID_METADATA.classificationEfficiency,
}));
export const CLASSIFICATION_ONLY_WITH_IMPLEMENTATION_SCOPE_METADATA = Object.freeze({
  ...CLASSIFICATION_ONLY_FAST_PATH_METADATA,
  writeScope: Object.freeze([
    'work/packages/active-test-package.md',
    'src/rebalancer/operation-workflow-owner.js',
  ]),
  commitScope: Object.freeze([
    'work/packages/active-test-package.md',
    'src/rebalancer/operation-workflow-owner.js',
  ]),
});
export const SCENARIO_CAUSAL_CLOSURE_MISSING_METADATA = Object.freeze({
  status: WORK_TRACKER_ACTIVE_STATUS,
  scenario: 'rolling-restart',
});
export const REPRESENTATIVE_RESIDUAL_VALID_METADATA = Object.freeze({
  status: WORK_TRACKER_ACTIVE_STATUS,
  lane: 'causal-escalation',
  scenario: 'rolling-restart',
  owner: 'diagnostics_owner',
  boundary: 'residual_inventory',
  dominantReason: 'residual_inventory_incomplete',
  causalGovernance: Object.freeze({
    causalDebt:
      'The sprint representative rolling-restart residual stays open at ' +
      'startup_active_gate_owner / snapshot_coverage.',
  }),
  representativeResidual: Object.freeze({
    status: 'red',
    scenario: 'rolling-restart',
    artifact:
      'test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json',
    frontier: 'active_gate_snapshot_coverage',
    owner: 'startup_active_gate_owner',
    boundary: 'snapshot_coverage',
    dominantReason: 'snapshot_coverage_incomplete',
    nextAction:
      'activate active-gate budget or coverage unless fresh evidence migrates',
  }),
});
export const REPRESENTATIVE_RESIDUAL_MISSING_METADATA = Object.freeze({
  ...REPRESENTATIVE_RESIDUAL_VALID_METADATA,
  representativeResidual: undefined,
});
export const REPRESENTATIVE_RESIDUAL_INVALID_METADATA = Object.freeze({
  ...REPRESENTATIVE_RESIDUAL_VALID_METADATA,
  representativeResidual: Object.freeze({
    status: 'unknown',
    scenario: 'other-scenario',
    artifact: 'not a report artifact',
    frontier: '<frontier>',
    owner: 'unknown',
    boundary: 'todo',
    dominantReason: 'pending-before-implementation-resumes',
    nextAction: '',
  }),
});
export const SCENARIO_CAUSAL_CLOSURE_INVALID_METADATA = Object.freeze({
  status: WORK_TRACKER_ACTIVE_STATUS,
  scenario: 'rolling-restart',
  scenarioCausalClosure: Object.freeze({
    referenceScenarioOrProbe: '<scenario>',
    phaseChain: Object.freeze([]),
    currentFirstFrontier: 'todo',
    knownDownstreamBlockers: Object.freeze(['unknown']),
    missingCausalEdge: 'pending-before-implementation-resumes',
    missingCausalEdgeProbe: 'dispatch pending probe',
    boundedProgressProof: 'Focused proof exists.',
    boundedProgressProofArtifact: 'proof exists',
    expectedObservableTransition: 'todo',
    maxProgressBound: 'unknown',
    sameFrontierFallback: '<fallback>',
    expectedNextFrontier: 'n/a',
    resultClassification: 'surprise',
    stopCondition: 'later',
  }),
});
export const CAUSAL_GOVERNANCE_MISSING_METADATA = Object.freeze({
  status: WORK_TRACKER_ACTIVE_STATUS,
  scenario: 'rolling-restart',
});
export const CAUSAL_GOVERNANCE_INVALID_METADATA = Object.freeze({
  status: WORK_TRACKER_DONE_STATUS,
  scenario: 'rolling-restart',
  causalGovernance: Object.freeze({
    hypothesis: '<hypothesis>',
    stopConditionCheck:
      'npm run analyze:topology-convergence -- test-output/reports/example.report.json',
    expectedCausalModelChange: 'todo',
    representativeOutcome: 'pending-before-rerun',
    causalDebt: 'unknown',
    crossBoundaryReview: 'manual parent session says ok',
  }),
});
export const MODEL_FIT_VALID_SPARK_SAFE_CONTENT = [
  '# Test Package',
  '',
  '## Model Fit',
  '',
  '- Package class: `bounded-implementation`',
  '- Intended minimum model: `gpt-5.3-codex-spark`',
  '- Scope shape: `leaf-slice`',
  '- Output profile: `medium`',
  '- Owned files: `scripts/work-tracker.js`, `test/scripts/work-tracker-subagent-ledger.test.js`',
  '- Forbidden files: `src/`, `test/distributed/harness/`',
  '- Frozen decisions: active package metadata requires the section.',
  '- Escalation triggers: owned files expand beyond tracker scripts.',
  '- Focused proof: `node --test test/scripts/work-tracker-subagent-ledger.test.js`',
  '',
].join('\n');
export const MODEL_FIT_MISSING_CONTENT = '# Test Package\n';
export const CORE_LOGIC_BRIEF_VALID_CONTENT = [
  '# Test Package',
  '',
  '## Core Logic Brief',
  '',
  '- Canonical outcome: operation_workflow_owner / workflow_progress emits retry-scheduled.',
  '- Inputs/signals: operation ledger, rebalancer handoff witness, and focused owner fixture.',
  '- State model or invariant: one normalized workflow snapshot maps to one state-table outcome.',
  '- Non-goals and forbidden interpretations: no startup active-gate or publication reinterpretation.',
  '- Proof mapping: `node --test test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js` proves the invariant.',
  '- Wrong-slice trigger: stop if owner, boundary, or required action changes.',
  '',
].join('\n');
export const CORE_LOGIC_BRIEF_NOT_NEEDED_CONTENT = [
  '# Test Package',
  '',
  '## Core Logic Brief',
  '',
  '- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.',
  '',
].join('\n');
export const CORE_LOGIC_BRIEF_INCOMPLETE_CONTENT = [
  '# Test Package',
  '',
  '## Core Logic Brief',
  '',
  '- Canonical outcome: <outcome>',
  '- Inputs/signals: todo',
  '- State model or invariant: unknown',
  '',
].join('\n');
export const CORE_LOGIC_BRIEF_GENERIC_CONTENT = [
  '# Test Package',
  '',
  '## Core Logic Brief',
  '',
  '- Canonical outcome: operation_workflow_owner / workflow_progress emits retry-scheduled.',
  '- Inputs/signals: operation ledger and focused owner fixture.',
  '- State model or invariant: Collect evidence, normalize one operation_workflow_owner / workflow_progress snapshot, then use one explicit state model, decision table, or invariant to emit one canonical outcome and reasons.',
  '- Non-goals and forbidden interpretations: no startup active-gate reinterpretation.',
  '- Proof mapping: `node --test test/rebalancer/workflow-progress.test.js` proves the invariant.',
  '- Wrong-slice trigger: stop if owner, boundary, or required action changes.',
  '',
].join('\n');
export const CAUSAL_DECISION_CONTRACT_VALID_CONTENT = [
  '# Test Package',
  '',
  '## Causal Decision Contract',
  '',
  '| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |',
  '| --- | --- | --- | --- | --- | --- |',
  '| route owner | operation_workflow_owner / workflow_progress / dispatch_pending | operation workflow owner decides before startup consumers reinterpret it | retry-scheduled | dispatch debt reduces | node --test test/rebalancer/workflow-progress.test.js |',
  '',
  '- Anti-symptom rationale: This proves the operation workflow owner decision directly instead of patching downstream startup symptoms.',
  '- Falsifying focused probe: `node --test test/rebalancer/workflow-progress.test.js`',
  '- Competing explanations: compare dispatch_pending with startup lag, stale instrumentation, and wrong-owner routing.',
  '- Systemic interaction scan: check producer, consumer, admission gate, retry lifecycle, and report generation before assigning the next slice.',
  '- Ping-pong stop rule: require fresh representative evidence or concrete reduction before bouncing between adjacent owners.',
  '- Oscillation guard: same-frontier runtime work must show concrete frontier reduction before another local patch.',
  '',
].join('\n');
export const CAUSAL_DECISION_CONTRACT_INVALID_CONTENT = [
  '# Test Package',
  '',
  '## Causal Decision Contract',
  '',
  '| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |',
  '| --- | --- | --- | --- | --- | --- |',
  '',
  '- Anti-symptom rationale: <reason>',
  '- Falsifying focused probe: read the file manually',
  '',
].join('\n');
export const DECISION_EXPERIMENT_GATE_VALID_CONTENT = [
  '# Test Package',
  '',
  '## Decision Experiment Gate',
  '',
  '- Decision question: Does operation_workflow_owner / workflow_progress still own dispatch_pending, and what exact retry fact must move before implementation is justified?',
  '- Architecture review: Confirm this is still a local owner-boundary route, owner-boundary migration, autonomous architecture experiment, or human-only route for blocked evidence.',
  '- Competing hypotheses: dispatch_pending is real owner debt; startup active-gate lag is downstream; instrumentation is stale; another boundary owns the next move.',
  '- Pre-edit focused probe: `node --test test/rebalancer/workflow-progress.test.js`',
  '- Success metrics: retry count reduces, frontier migrates, or representative rolling-restart turns green.',
  '- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rerun.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason dispatch_pending`',
  '- Kill rule: If fresh representative evidence returns same-frontier unchanged with no concrete reduction, open an autonomous architecture experiment; use human escalation only for blocked or contradictory evidence.',
  '',
].join('\n');
export const DECISION_EXPERIMENT_GATE_INVALID_CONTENT = [
  '# Test Package',
  '',
  '## Decision Experiment Gate',
  '',
  '- Decision question: <question>',
  '- Architecture review: decide later',
  '- Competing hypotheses: todo',
  '- Pre-edit focused probe: read report manually',
  '- Success metrics: better',
  '- Representative rerun: inspect artifact',
  '- Kill rule: continue locally',
  '',
].join('\n');
export const CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA = Object.freeze({
  status: WORK_TRACKER_ACTIVE_STATUS,
  lane: LANE_CAUSAL_ESCALATION,
  scenario: 'rolling-restart',
  architectureDecisionGate: Object.freeze({
    trigger: 'frontier-oscillation',
  }),
});
export const SPRINT_STRATEGY_BRIEF_VALID_CONTENT = [
  '# Test Sprint',
  '',
  '## Sprint Strategy Brief',
  '',
  '- Goal state: representative gate is green without timeout or admission relaxation.',
  '- Current causal thesis: owner reconcile backpressure is the selected frontier.',
  '- Competing hypotheses: H1 owner reconcile remains first; H2 diagnostics lag the proof.',
  '- Confidence and evidence: medium-high from focused handoff probe and current blocker.',
  '- Expected green path: close classification package, rerun representative, then activate the selected owner.',
  '- Wrong direction signals: the frontier reselects a frozen owner or metrics do not reduce.',
  '- Next best package: open active-gate owner reconcile only after canonical extractors select it.',
  '- Stop or escalate rule: open causal escalation if two related owners alternate again.',
  '',
].join('\n');
export const SPRINT_STRATEGY_BRIEF_INCOMPLETE_CONTENT = [
  '# Test Sprint',
  '',
  '## Sprint Strategy Brief',
  '',
  '- Goal state: <goal>',
  '- Current causal thesis: todo',
  '- Competing hypotheses: H1 something remains possible.',
  '- Confidence and evidence: unknown',
  '',
].join('\n');
export const MODEL_FIT_INCOMPLETE_SPARK_SAFE_CONTENT = [
  '# Test Package',
  '',
  '## Model Fit',
  '',
  '- Package class: `spark-safe`',
  '- Intended minimum model: `gpt-5`',
  '- Scope shape: `broad-frontier`',
  '- Output profile: `verbose`',
  '- Owned files: `scripts/work-tracker.js`',
  '- Forbidden files: `src/`',
  '- Frozen decisions: tracker metadata only.',
  '- Escalation triggers: find the next frontier.',
  '- Focused proof: `node --test test/scripts/work-tracker-subagent-ledger.test.js`',
  '',
].join('\n');
export const WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT = '# Test Package\n';
export const WORK_TRACKER_LEDGER_OPEN_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [ ] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `clean`.',
  '- [ ] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [ ] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-test-package.md`.',
  '',
].join('\n');
export const WORK_TRACKER_LEDGER_CLEAN_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `clean`.',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-test-package.md`; parent revalidated focused proof: yes.',
  '',
].join('\n');
export const WORK_TRACKER_EXECUTION_EVIDENCE_CLEAN_CONTENT = [
  '# Test Package',
  '',
  '## Execution Evidence',
  '',
  '- [x] implementation: status: validated; evidence: npm test -- test/example.test.js; parent revalidated focused proof: yes; next: closure.',
  '',
].join('\n');
export const WORK_TRACKER_EXECUTION_EVIDENCE_FRESH_CONTENT = [
  '# Test Package',
  '',
  '## Execution Evidence',
  '',
  '- [x] action: freshness-review; owner: Agent Freshness (' +
    FRESHNESS_AGENT_ID +
    '); files-changed: none; validation: npm run work:context; decision: fresh; outcome: validated.',
  '',
].join('\n');
export const WORK_TRACKER_EXECUTION_EVIDENCE_FRESH_INVALID_LOCAL_CONTENT = [
  '# Test Package',
  '',
  '## Execution Evidence',
  '',
  '- [x] action: freshness-review; owner: local; files-changed: none; validation: npm run work:context; decision: fresh; outcome: validated.',
  '',
].join('\n');
export const WORK_TRACKER_EXECUTION_EVIDENCE_VERIFIED_CONTENT = [
  '# Test Package',
  '',
  '## Execution Evidence',
  '',
  '- [x] implementation: status: validated; evidence: npm test -- test/example.test.js; parent revalidated focused proof: yes; next: verification.',
  '- [x] verification-fix: status: validated; evidence: npm test -- test/example.test.js; changed files: none; parent revalidated focused proof: yes; next: closure.',
  '',
].join('\n');
export const WORK_TRACKER_EXECUTION_EVIDENCE_VERIFIED_NO_CHANGES_CONTENT = [
  '# Test Package',
  '',
  '## Execution Evidence',
  '',
  '- [x] implementation: status: validated; evidence: npm test -- test/example.test.js; parent revalidated focused proof: yes; next: verification.',
  '- [x] verification-fix: status: validated; evidence: npm test -- test/example.test.js; parent revalidated focused proof: yes; next: closure.',
  '',
].join('\n');
export const WORK_TRACKER_EXECUTION_EVIDENCE_FIVE_FIELD_CONTENT = [
  '# Test Package',
  '',
  '## Execution Evidence',
  '',
  '- [x] action: implementation; owner: workflow_tooling_owner; files-changed: scripts/work-tracker.js; validation: npm test -- test/example.test.js; parent revalidated focused proof: yes; outcome: validated.',
  '- [x] action: verification-fix; owner: workflow_tooling_owner; files-changed: none; validation: npm test -- test/example.test.js; parent revalidated focused proof: yes; outcome: validated.',
  '',
].join('\n');
export const WORK_TRACKER_EXECUTION_EVIDENCE_WITH_AGENT_CONTENT = [
  '# Test Package',
  '',
  '## Execution Evidence',
  '',
  '- [x] implementation: status: validated; agent: Agent Implement (' +
    IMPLEMENTATION_AGENT_ID +
    '); evidence: npm test -- test/example.test.js; parent revalidated focused proof: yes; next: closure.',
  '',
].join('\n');
export const WORK_TRACKER_EXECUTION_EVIDENCE_UNVALIDATED_CONTENT = [
  '# Test Package',
  '',
  '## Execution Evidence',
  '',
  '- [x] implementation: status: validated; evidence: npm test -- test/example.test.js; next: closure.',
  '',
].join('\n');
export const WORK_TRACKER_EXECUTION_EVIDENCE_OPEN_CONTENT = [
  '# Test Package',
  '',
  '## Execution Evidence',
  '',
  '- [ ] implementation: status: validated; evidence: npm test -- test/example.test.js; parent revalidated focused proof: yes; next: closure.',
  '',
].join('\n');
export const WORK_TRACKER_LEDGER_UNVALIDATED_IMPLEMENTATION_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `clean`.',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-test-package.md`.',
  '',
].join('\n');
export const WORK_TRACKER_PROGRESS_LEDGER_CLEAN_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Progress Ledger',
  '',
  '- [x] Agent Review (' + REVIEW_AGENT_ID + ') review context loaded: scope confirmed; evidence: package and sprint files read; next: predecessor consistency check.',
  '- [x] Agent Implement (' + IMPLEMENTATION_AGENT_ID + ') implementation validation complete: focused proof passed; evidence: node --test test/example.test.js; next: final handoff.',
  '',
].join('\n');
export const WORK_TRACKER_PROGRESS_LEDGER_OPEN_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Progress Ledger',
  '',
  '- [ ] Agent Review (<agent-id>) review context loaded: scope confirmed; evidence: package and sprint files read; next: predecessor consistency check.',
  '',
].join('\n');
export const WORK_TRACKER_PROGRESS_LEDGER_BAD_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Progress Ledger',
  '',
  '- [x] Agent local session (' + REVIEW_AGENT_ID + ') review context loaded: scope confirmed.',
  '',
].join('\n');
export const WORK_TRACKER_PROGRESS_LEDGER_NOT_NEEDED_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Progress Ledger',
  '',
  '- [x] not-needed implementation update: skipped; evidence: none; next: closure.',
  '',
].join('\n');
export const WORK_TRACKER_ATTEMPT_LEDGER_CLEAN_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Attempt Ledger',
  '',
  '- [x] Agent Review (' + REVIEW_AGENT_ID + ') review attempt: status: validated; last checkpoint: review complete; parent action: accepted; evidence: package proof read; next: fix role.',
  '- [x] Agent Implement (' + IMPLEMENTATION_AGENT_ID + ') implementation attempt: status: validated; last checkpoint: focused proof passed; parent action: revalidated; evidence: npm test -- test/example.test.js; next: closure.',
  '',
].join('\n');
export const WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Progress And Attempt Ledger',
  '',
  '- [x] Agent Review (' + REVIEW_AGENT_ID + ') review checkpoint: status: validated; last checkpoint: review complete; parent action: accepted; evidence: package proof read; next: fix role.',
  '- [x] Agent Implement (' + IMPLEMENTATION_AGENT_ID + ') implementation checkpoint: status: validated; last checkpoint: focused proof passed; parent action: revalidated; evidence: npm test -- test/example.test.js; next: closure.',
  '',
].join('\n');
export const WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_LOCAL_RUNTIME_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Progress And Attempt Ledger',
  '',
  '- [x] Agent Implement (' + IMPLEMENTATION_AGENT_ID + ') implementation checkpoint: status: validated; last checkpoint: local runtime owner proof passed; parent action: revalidated; evidence: `npm run work:scenario-route -- test-output/reports/local-runtime.report.json` kept `continue_local_fix`; next: parent reruns local validation and chooses closure.',
  '',
].join('\n');
export const WORK_TRACKER_ATTEMPT_LEDGER_PARTIAL_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Attempt Ledger',
  '',
  '- [x] Agent Implement (' + IMPLEMENTATION_AGENT_ID + ') implementation attempt: status: partial-unvalidated; last checkpoint: patch edited without proof; parent action: pending; evidence: files changed; blocker: validation did not run.',
  '',
].join('\n');
export const WORK_TRACKER_ATTEMPT_LEDGER_SUPERSEDED_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Attempt Ledger',
  '',
  '- [x] Agent Implement (' + IMPLEMENTATION_AGENT_ID + ') implementation attempt: status: partial-unvalidated; last checkpoint: patch edited without proof; parent action: pending; evidence: files changed; blocker: validation did not run.',
  '- [x] Agent Recovery (' + FIX_AGENT_ID + ') implementation recovery: status: superseded; last checkpoint: discarded unvalidated patch; parent action: superseded; evidence: parent reran focused proof; next: continue from clean checkpoint.',
  '',
].join('\n');
export const WORK_TRACKER_ATTEMPT_LEDGER_GENERIC_IDENTITY_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Attempt Ledger',
  '',
  '- [x] Agent Codex Implementation (' + IMPLEMENTATION_AGENT_ID + ') implementation attempt: status: validated; last checkpoint: proof complete; parent action: revalidated; evidence: npm test -- test/example.test.js; next: closure.',
  '',
].join('\n');
export const WORK_TRACKER_ATTEMPT_LEDGER_CODEX_NAMED_AGENT_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Attempt Ledger',
  '',
  '- [x] Agent CodexImplementationSubagent (' + IMPLEMENTATION_AGENT_ID + ') implementation attempt: status: validated; last checkpoint: proof complete; parent action: revalidated; evidence: npm test -- test/example.test.js; next: closure.',
  '',
].join('\n');
export const WORK_TRACKER_ATTEMPT_LEDGER_BAD_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Attempt Ledger',
  '',
  '- [x] Agent Implement (' + IMPLEMENTATION_AGENT_ID + ') implementation attempt: done.',
  '',
].join('\n');
export const WORK_TRACKER_ATTEMPT_LEDGER_OPEN_PARTIAL_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Attempt Ledger',
  '',
  '- [ ] Agent Implement (' + IMPLEMENTATION_AGENT_ID + ') implementation attempt: status: partial-unvalidated; last checkpoint: patch edited without proof; parent action: pending; evidence: files changed; blocker: validation did not run.',
  '- [x] Agent Recovery (' + FIX_AGENT_ID + ') implementation recovery: status: superseded; last checkpoint: discarded unvalidated patch; parent action: superseded; evidence: parent reran focused proof; next: continue from clean checkpoint.',
  '',
].join('\n');
export const WORK_TRACKER_ATTEMPT_LEDGER_NOT_NEEDED_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Attempt Ledger',
  '',
  '- [x] not-needed implementation attempt: status: validated; last checkpoint: skipped; parent action: accepted; evidence: none; next: closure.',
  '',
].join('\n');
export const WORK_TRACKER_LEDGER_FIXES_REQUIRED_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `fixes-required`.',
  '- [x] Fix subagent recorded or explicitly not needed:',
  `      Agent Fix (${FIX_AGENT_ID}) fixed`,
  '      `work/packages/done-test-package.md`.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-test-package.md`; parent revalidated focused proof: yes.',
  '',
].join('\n');
export const WORK_TRACKER_LEDGER_REVIEW_FIXED_METADATA_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `fixes-required`.',
  '- [x] Fix subagent recorded or explicitly not needed:',
  `      review-fixed-metadata-only by Agent Review (${REVIEW_AGENT_ID})`,
  '      for `work/packages/done-test-package.md`; scope: metadata-only package/sprint/tracker/handoff edits.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-test-package.md`; parent revalidated focused proof: yes.',
  '',
].join('\n');
export const WORK_TRACKER_LEDGER_REVIEW_FIXED_RUNTIME_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `fixes-required`.',
  '- [x] Fix subagent recorded or explicitly not needed:',
  `      review-fixed-metadata-only by Agent Review (${REVIEW_AGENT_ID})`,
  '      for `work/packages/done-test-package.md`; scope: runtime implementation edits.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-test-package.md`; parent revalidated focused proof: yes.',
  '',
].join('\n');
export const WORK_TRACKER_LEDGER_REVIEW_FIXED_WRONG_AGENT_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `fixes-required`.',
  '- [x] Fix subagent recorded or explicitly not needed:',
  `      review-fixed-metadata-only by Agent Fix (${FIX_AGENT_ID})`,
  '      for `work/packages/done-test-package.md`; scope: metadata-only package/sprint/tracker/handoff edits.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-test-package.md`; parent revalidated focused proof: yes.',
  '',
].join('\n');
export const WORK_TRACKER_LEDGER_PRE_IMPL_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `fixes-required`.',
  '- [x] Fix subagent recorded or explicitly not needed:',
  `      Agent Fix (${FIX_AGENT_ID}) fixed`,
  '      `work/packages/done-test-package.md`.',
  '- [ ] Implementation subagent recorded:',
  '      pending-before-implementation-starts',
  '',
].join('\n');
export const WORK_TRACKER_LEDGER_NUMBERED_PRE_IMPL_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '1. [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `fixes-required`.',
  '2. [x] Fix subagent recorded or explicitly not needed:',
  `      Agent Fix (${FIX_AGENT_ID}) fixed`,
  '      `work/packages/done-test-package.md`.',
  '3. [ ] Implementation subagent recorded:',
  '      pending-before-implementation-starts',
  '',
].join('\n');
export const WORK_TRACKER_LEDGER_UNAVAILABLE_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  '      tool-unavailable (reason: host does not expose delegation).',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [ ] Implementation subagent recorded:',
  '      pending-before-implementation-starts',
  '',
].join('\n');
export const WORK_TRACKER_LEDGER_FIRST_PACKAGE_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded: `not-needed` (`first-package-in-sprint`).',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-test-package.md`; parent revalidated focused proof: yes.',
  '',
].join('\n');
export const WORK_TRACKER_LEDGER_AMBIGUOUS_REVIEW_NOT_NEEDED_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded: `not-needed`.',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-test-package.md`; parent revalidated focused proof: yes.',
  '',
].join('\n');
export const WORK_TRACKER_LEDGER_NO_AGENT_ID_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  '      Agent Review reviewed `work/packages/done-test-package.md`;',
  '      result `clean`.',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [x] Implementation subagent recorded:',
  '      Agent Implement implemented `work/packages/active-test-package.md`.',
  '',
].join('\n');
export const WORK_TRACKER_LEDGER_LOCAL_IMPLEMENTATION_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `clean`.',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [x] Implementation subagent recorded:',
  `      Agent local session (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-test-package.md`.',
  '',
].join('\n');
export const WORK_TRACKER_LEDGER_MANUAL_FIX_NOTE_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `clean`.',
  '      Manual parent Codex note carried forward.',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-test-package.md`; parent revalidated focused proof: yes.',
  '',
].join('\n');
export const WORK_TRACKER_LEDGER_LOCAL_PATH_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `clean`.',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-20260511-active-gate-local-blocker-frontier.md`; parent revalidated focused proof: yes.',
  '',
].join('\n');
export const WORK_TRACKER_LEDGER_BAD_NOT_NEEDED_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `fixes-required`.',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-test-package.md`; parent revalidated focused proof: yes.',
  '',
].join('\n');
export const WORK_TRACKER_LEDGER_LEGACY_DONE_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  '      `Codex local review session 2026-05-07` reviewed',
  '      `work/packages/done-test-package.md`; result `clean`.',
  '- [x] Fix subagent recorded or explicitly not needed:',
  '      `Codex local fix session 2026-05-07` was `not-needed`.',
  '- [x] Implementation subagent recorded:',
  '      `Codex local implementation session 2026-05-07` implemented',
  '      `work/packages/active-test-package.md`.',
  '',
].join('\n');
export const WORK_TRACKER_LEDGER_CHECKED_PENDING_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded: `pending-before-implementation-resumes`',
  '      reviewed `done-package` on `owner`; result `pending`.',
  '- [x] Fix subagent recorded or explicitly not needed:',
  '      `pending-before-implementation-resumes`; fixes `pending`.',
  '- [x] Implementation subagent recorded:',
  '      `pending-before-implementation-resumes`.',
  '',
].join('\n');
export const WORK_TRACKER_LEDGER_CHECKED_TEMPLATE_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded: `<fresh review agent>` reviewed',
  '      `<most recently executed package>`; result `<clean|fixes-required>`.',
  '- [x] Fix subagent recorded or explicitly not needed:',
  '      `<fresh fix agent|not-needed>`.',
  '- [x] Implementation subagent recorded: `<fresh implementation agent>`.',
  '',
].join('\n');
export const WORK_TRACKER_COMMIT_LEDGER_VALID_CONTENT = [
  '# Test Package',
  '',
  '## Commit And Push Ledger',
  '',
  `- Focused package commit: ${TEST_COMMIT_SHA}`,
  `- Pushed to: ${TEST_PUSH_TARGET}`,
  '- Commit contains only package-owned files/package-status/allowed sprint handoff: yes',
  '',
].join('\n');
export const WORK_TRACKER_COMMIT_LEDGER_LEGACY_VALID_CONTENT = [
  '# Test Package',
  '',
  '## Closure Commit Proof',
  '',
  `- Focused package commit: ${TEST_COMMIT_SHA}`,
  `- Pushed to: ${TEST_PUSH_TARGET}`,
  '- Commit contains only package-owned files/package-status/allowed sprint handoff: yes',
  '',
].join('\n');
export const WORK_TRACKER_DOCTOR_CONTENT = [
  '# Test Package',
  '',
  '<!-- work-package',
  JSON.stringify(buildWorkPackageV2Metadata({
    status: 'active',
    opened: '2026-05-15',
    lane: LANE_LIGHTWEIGHT_MAINTENANCE,
    scenario: 'none',
    artifact: 'test-output/reports/package-doctor.report.json',
    playback: 'none',
    owner: 'workflow_tooling_owner',
    boundary: 'package_doctor',
    dominantReason: 'doctor_needed',
    currentState: 'Doctor command needs a compact package summary.',
    nextAction: 'Run package doctor.',
    proof: ['node --test test/scripts/work-tracker-subagent-ledger.test.js'],
    writeScope: ['scripts/work-tracker.js'],
    handoffFiles: [],
    generatedFiles: [],
    candidateRuntimeFiles: [],
    commitScope: ['scripts/work-tracker.js'],
    modelFit: {
      packageClass: 'bounded-implementation',
      intendedMinimumModel: 'gpt-5.3-codex-spark',
      scopeShape: 'leaf-slice',
      outputProfile: 'medium',
      escalationTriggers: ['package doctor expands beyond work tracker'],
      ambiguityScore: 1,
    },
  }), null, 2),
  '-->',
  '',
  '## Model Fit',
  '',
  '- Package class: `bounded-implementation`',
  '- Intended minimum model: `gpt-5.3-codex-spark`',
  '- Scope shape: `leaf-slice`',
  '- Output profile: `medium`',
  '- Owned files: `scripts/work-tracker.js`',
  '- Forbidden files: `src/`',
  '- Frozen decisions: package doctor is a validation summary only.',
  '- Escalation triggers: package doctor expands beyond work tracker.',
  '- Focused proof: `node --test test/scripts/work-tracker-subagent-ledger.test.js`',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded: `not-needed` (`first-package-in-sprint`).',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  `      \`${WORK_TRACKER_ACTIVE_DOCTOR_FILE}\`; parent revalidated focused proof: yes.`,
  '',
].join('\n');
export const WORK_TRACKER_FUTURE_DONE_STRICT_CONTENT = [
  '# Strict Runtime Package',
  '',
  '<!-- work-package',
  JSON.stringify({
    schema: 'work-package-v1',
    status: WORK_TRACKER_DONE_STATUS,
    opened: '2026-05-19',
    lane: LANE_RUNTIME_OWNER_BOUNDARY,
    scenario: 'rolling-restart',
    artifact: 'test-output/reports/future-runtime.report.json',
    playback: 'none',
    owner: 'operation_workflow_owner',
    boundary: 'workflow_progress',
    dominantReason: 'dispatch_pending',
    currentState: 'Runtime owner package closed after the current subagent policy.',
    nextAction: 'Validate strict closure proof.',
    proof: ['npm test -- test/rebalancer/workflow-progress.test.js'],
    writeScope: ['src/rebalancer/operation-workflow-owner.js'],
    handoffFiles: [],
    generatedFiles: [],
    candidateRuntimeFiles: [],
    commitScope: ['src/rebalancer/operation-workflow-owner.js'],
    modelFit: {
      packageClass: 'runtime-owner-boundary',
      intendedMinimumModel: 'gpt-5.3-codex',
      scopeShape: 'owner-boundary-contraction',
      outputProfile: 'medium',
      escalationTriggers: ['runtime ownership changes'],
    },
  }, null, 2),
  '-->',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `clean`.',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  `      \`${WORK_TRACKER_FUTURE_DONE_TEST_FILE}\`.`,
  '',
].join('\n');
export const WORK_TRACKER_COMMIT_LEDGER_TEMPLATE_CONTENT = [
  '# Test Package',
  '',
  '## Commit And Push Ledger',
  '',
  '- Focused package commit: <sha>',
  '- Pushed to: <remote>/<branch>',
  '- Commit contains only package-owned files/package-status/allowed sprint handoff: <yes>',
  '',
].join('\n');
export const WORK_TRACKER_COMMIT_LEDGER_PENDING_CONTENT = [
  '# Test Package',
  '',
  '## Commit And Push Ledger',
  '',
  '- Focused package commit: pending.',
  '- Pushed to: pending.',
  '- Commit contains only package-owned files/package-status/allowed sprint handoff: pending.',
  '',
].join('\n');

export {assert, buildCurrentBlockerPayload, buildPackageDoctorLines, describe, findActivePackageLinkInSprint, isGeneratedCurrentBlockerPath, it, metadataHasClassificationOnlyOutcome, metadataRequiresFreshnessReview, metadataRequiresSubagentSequencing, metadataUsesClassificationOnlyFastPath, metadataUsesPureClassificationFastPath, path, renderCurrentBlockerMarkdown, renderCurrentEdgeCardSection, resolveSprintPackageReference, upsertSprintCurrentEdgeCard, validateActiveWorkReferences, validateCausalDecisionContract, validateCausalGovernanceContract, validateClassificationEfficiencyContract, validateCommitAndPushLedger, validateContractProofRequirement, validateCoreLogicBrief, validateCurrentBlockerPayloadFreshness, validateCurrentBlockerSnapshot, validateDecisionExperimentGate, validateExecutionEvidenceLedger, validateExperimentOutcomeContract, validateFrontierOscillationContract, validateModelFitContract, validateObservablePredictionContract, validatePackageMetadataShape, validatePackageScaffoldReadiness, validateProbePackageContract, validateRepresentativeResidualContract, validateRequiredPreImplProbeContract, validateRerunDecisionContract, validateSameFrontierStopContract, validateScenarioCausalClosureContract, validateScenarioFrontierOwnerBoundaryContract, validateSprintCurrentEdgeCard, validateSprintStrategyBrief, validateSubagentAttemptLedger, validateSubagentProgressLedger, validateSubagentSequencingLedger, validateTwoLevelTheoryContract};
