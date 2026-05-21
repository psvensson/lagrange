import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  buildCurrentBlockerPayload,
  buildPackageDoctorLines,
  findActivePackageLinkInSprint,
  isGeneratedCurrentBlockerPath,
  metadataHasClassificationOnlyOutcome,
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
  validateProbePackageContract,
  validateRequiredPreImplProbeContract,
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
} from '../../scripts/work-tracker.js';

const WORK_TRACKER_LEDGER_TEST_FILE = 'work/packages/active-test-package.md';
const WORK_TRACKER_LEDGER_LOCAL_PATH_TEST_FILE =
  'work/packages/active-20260511-active-gate-local-blocker-frontier.md';
const WORK_TRACKER_DONE_TEST_FILE = 'work/packages/done-test-package.md';
const WORK_TRACKER_FUTURE_DONE_TEST_FILE =
  'work/packages/done-20260519-strict-runtime.md';
const WORK_TRACKER_CURRENT_BLOCKER_MARKDOWN =
  'work/sprints/current-blocker.md';
const WORK_TRACKER_ACTIVE_DOCTOR_FILE =
  'work/packages/active-20260507-doctor-test.md';
const REVIEW_AGENT_ID = '019e02b6-1920-7130-b040-da2e6f4efbc4';
const FIX_AGENT_ID = '019e02b7-ece3-73a2-a664-389d40dfd575';
const IMPLEMENTATION_AGENT_ID = '019e02b9-7651-7851-bc85-a0cef8a90176';
const TEST_COMMIT_SHA = 'abcdef1234567890abcdef1234567890abcdef12';
const TEST_PUSH_TARGET = 'origin/main';
const WORK_TRACKER_ACTIVE_STATUS = 'active';
const WORK_TRACKER_DONE_STATUS = 'done';
const LANE_READ_REVIEW_DOC_ONLY = 'read-review-doc-only';
const LANE_MECHANICAL_MAINTENANCE = 'mechanical-maintenance';
const LANE_LIGHTWEIGHT_MAINTENANCE = 'lightweight-maintenance';
const LANE_TEST_ONLY_PROOF = 'test-only-proof';
const LANE_DIAGNOSTIC_CLASSIFICATION = 'diagnostic-classification';
const LANE_EXPERIMENT = 'experiment';
const LANE_BOUNDED_EXPERIMENT = 'bounded-experiment';
const LANE_SINGLE_FILE_RUNTIME = 'single-file-runtime';
const LANE_RUNTIME_OWNER_BOUNDARY = 'runtime-owner-boundary';
const LANE_CAUSAL_ESCALATION = 'causal-escalation';
const CAUSAL_GOVERNANCE_VALID_METADATA = Object.freeze({
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
const SCENARIO_CAUSAL_CLOSURE_VALID_METADATA = Object.freeze({
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
const RERUN_DECISION_VALID_METADATA = Object.freeze({
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
      'npm run work:validate -- --pre-impl',
    ]),
  }),
});
const CLASSIFICATION_EFFICIENCY_VALID_METADATA = Object.freeze({
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
const CLASSIFICATION_ONLY_FAST_PATH_METADATA = Object.freeze({
  schema: 'work-package-v1',
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
});
const CLASSIFICATION_ONLY_WITH_IMPLEMENTATION_SCOPE_METADATA = Object.freeze({
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
const SCENARIO_CAUSAL_CLOSURE_MISSING_METADATA = Object.freeze({
  status: WORK_TRACKER_ACTIVE_STATUS,
  scenario: 'rolling-restart',
});
const REPRESENTATIVE_RESIDUAL_VALID_METADATA = Object.freeze({
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
const REPRESENTATIVE_RESIDUAL_MISSING_METADATA = Object.freeze({
  ...REPRESENTATIVE_RESIDUAL_VALID_METADATA,
  representativeResidual: undefined,
});
const REPRESENTATIVE_RESIDUAL_INVALID_METADATA = Object.freeze({
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
const SCENARIO_CAUSAL_CLOSURE_INVALID_METADATA = Object.freeze({
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
const CAUSAL_GOVERNANCE_MISSING_METADATA = Object.freeze({
  status: WORK_TRACKER_ACTIVE_STATUS,
  scenario: 'rolling-restart',
});
const CAUSAL_GOVERNANCE_INVALID_METADATA = Object.freeze({
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
const MODEL_FIT_VALID_SPARK_SAFE_CONTENT = [
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
const MODEL_FIT_MISSING_CONTENT = '# Test Package\n';
const CORE_LOGIC_BRIEF_VALID_CONTENT = [
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
const CORE_LOGIC_BRIEF_NOT_NEEDED_CONTENT = [
  '# Test Package',
  '',
  '## Core Logic Brief',
  '',
  '- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.',
  '',
].join('\n');
const CORE_LOGIC_BRIEF_INCOMPLETE_CONTENT = [
  '# Test Package',
  '',
  '## Core Logic Brief',
  '',
  '- Canonical outcome: <outcome>',
  '- Inputs/signals: todo',
  '- State model or invariant: unknown',
  '',
].join('\n');
const CORE_LOGIC_BRIEF_GENERIC_CONTENT = [
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
const CAUSAL_DECISION_CONTRACT_VALID_CONTENT = [
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
const CAUSAL_DECISION_CONTRACT_INVALID_CONTENT = [
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
const DECISION_EXPERIMENT_GATE_VALID_CONTENT = [
  '# Test Package',
  '',
  '## Decision Experiment Gate',
  '',
  '- Decision question: Does operation_workflow_owner / workflow_progress still own dispatch_pending, and what exact retry fact must move before implementation is justified?',
  '- Architecture review: Confirm this is still a local owner-boundary route, owner-boundary migration, architecture contract gap, or human route.',
  '- Competing hypotheses: dispatch_pending is real owner debt; startup active-gate lag is downstream; instrumentation is stale; another boundary owns the next move.',
  '- Pre-edit focused probe: `node --test test/rebalancer/workflow-progress.test.js`',
  '- Success metrics: retry count reduces, frontier migrates, or representative rolling-restart turns green.',
  '- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rerun.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason dispatch_pending`',
  '- Kill rule: If fresh representative evidence returns same-frontier unchanged with no concrete reduction, stop for architecture or human escalation.',
  '',
].join('\n');
const DECISION_EXPERIMENT_GATE_INVALID_CONTENT = [
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
const CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA = Object.freeze({
  status: WORK_TRACKER_ACTIVE_STATUS,
  lane: LANE_CAUSAL_ESCALATION,
  scenario: 'rolling-restart',
  architectureDecisionGate: Object.freeze({
    trigger: 'frontier-oscillation',
  }),
});
const SPRINT_STRATEGY_BRIEF_VALID_CONTENT = [
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
const SPRINT_STRATEGY_BRIEF_INCOMPLETE_CONTENT = [
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
const MODEL_FIT_INCOMPLETE_SPARK_SAFE_CONTENT = [
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
const WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT = '# Test Package\n';
const WORK_TRACKER_LEDGER_OPEN_CONTENT = [
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
const WORK_TRACKER_LEDGER_CLEAN_CONTENT = [
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
const WORK_TRACKER_EXECUTION_EVIDENCE_CLEAN_CONTENT = [
  '# Test Package',
  '',
  '## Execution Evidence',
  '',
  '- [x] implementation: status: validated; evidence: npm test -- test/example.test.js; parent revalidated focused proof: yes; next: closure.',
  '',
].join('\n');
const WORK_TRACKER_EXECUTION_EVIDENCE_VERIFIED_CONTENT = [
  '# Test Package',
  '',
  '## Execution Evidence',
  '',
  '- [x] implementation: status: validated; evidence: npm test -- test/example.test.js; parent revalidated focused proof: yes; next: verification.',
  '- [x] verification-fix: status: validated; evidence: npm test -- test/example.test.js; changed files: none; parent revalidated focused proof: yes; next: closure.',
  '',
].join('\n');
const WORK_TRACKER_EXECUTION_EVIDENCE_VERIFIED_NO_CHANGES_CONTENT = [
  '# Test Package',
  '',
  '## Execution Evidence',
  '',
  '- [x] implementation: status: validated; evidence: npm test -- test/example.test.js; parent revalidated focused proof: yes; next: verification.',
  '- [x] verification-fix: status: validated; evidence: npm test -- test/example.test.js; parent revalidated focused proof: yes; next: closure.',
  '',
].join('\n');
const WORK_TRACKER_EXECUTION_EVIDENCE_WITH_AGENT_CONTENT = [
  '# Test Package',
  '',
  '## Execution Evidence',
  '',
  '- [x] implementation: status: validated; agent: Agent Implement (' +
    IMPLEMENTATION_AGENT_ID +
    '); evidence: npm test -- test/example.test.js; parent revalidated focused proof: yes; next: closure.',
  '',
].join('\n');
const WORK_TRACKER_EXECUTION_EVIDENCE_UNVALIDATED_CONTENT = [
  '# Test Package',
  '',
  '## Execution Evidence',
  '',
  '- [x] implementation: status: validated; evidence: npm test -- test/example.test.js; next: closure.',
  '',
].join('\n');
const WORK_TRACKER_EXECUTION_EVIDENCE_OPEN_CONTENT = [
  '# Test Package',
  '',
  '## Execution Evidence',
  '',
  '- [ ] implementation: status: validated; evidence: npm test -- test/example.test.js; parent revalidated focused proof: yes; next: closure.',
  '',
].join('\n');
const WORK_TRACKER_LEDGER_UNVALIDATED_IMPLEMENTATION_CONTENT = [
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
const WORK_TRACKER_PROGRESS_LEDGER_CLEAN_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Progress Ledger',
  '',
  '- [x] Agent Review (' + REVIEW_AGENT_ID + ') review context loaded: scope confirmed; evidence: package and sprint files read; next: predecessor consistency check.',
  '- [x] Agent Implement (' + IMPLEMENTATION_AGENT_ID + ') implementation validation complete: focused proof passed; evidence: node --test test/example.test.js; next: final handoff.',
  '',
].join('\n');
const WORK_TRACKER_PROGRESS_LEDGER_OPEN_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Progress Ledger',
  '',
  '- [ ] Agent Review (<agent-id>) review context loaded: scope confirmed; evidence: package and sprint files read; next: predecessor consistency check.',
  '',
].join('\n');
const WORK_TRACKER_PROGRESS_LEDGER_BAD_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Progress Ledger',
  '',
  '- [x] Agent local session (' + REVIEW_AGENT_ID + ') review context loaded: scope confirmed.',
  '',
].join('\n');
const WORK_TRACKER_PROGRESS_LEDGER_NOT_NEEDED_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Progress Ledger',
  '',
  '- [x] not-needed implementation update: skipped; evidence: none; next: closure.',
  '',
].join('\n');
const WORK_TRACKER_ATTEMPT_LEDGER_CLEAN_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Attempt Ledger',
  '',
  '- [x] Agent Review (' + REVIEW_AGENT_ID + ') review attempt: status: validated; last checkpoint: review complete; parent action: accepted; evidence: package proof read; next: fix role.',
  '- [x] Agent Implement (' + IMPLEMENTATION_AGENT_ID + ') implementation attempt: status: validated; last checkpoint: focused proof passed; parent action: revalidated; evidence: npm test -- test/example.test.js; next: closure.',
  '',
].join('\n');
const WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Progress And Attempt Ledger',
  '',
  '- [x] Agent Review (' + REVIEW_AGENT_ID + ') review checkpoint: status: validated; last checkpoint: review complete; parent action: accepted; evidence: package proof read; next: fix role.',
  '- [x] Agent Implement (' + IMPLEMENTATION_AGENT_ID + ') implementation checkpoint: status: validated; last checkpoint: focused proof passed; parent action: revalidated; evidence: npm test -- test/example.test.js; next: closure.',
  '',
].join('\n');
const WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_LOCAL_RUNTIME_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Progress And Attempt Ledger',
  '',
  '- [x] Agent Implement (' + IMPLEMENTATION_AGENT_ID + ') implementation checkpoint: status: validated; last checkpoint: local runtime owner proof passed; parent action: revalidated; evidence: `npm run work:scenario-route -- test-output/reports/local-runtime.report.json` kept `continue_local_fix`; next: parent reruns local validation and chooses closure.',
  '',
].join('\n');
const WORK_TRACKER_ATTEMPT_LEDGER_PARTIAL_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Attempt Ledger',
  '',
  '- [x] Agent Implement (' + IMPLEMENTATION_AGENT_ID + ') implementation attempt: status: partial-unvalidated; last checkpoint: patch edited without proof; parent action: pending; evidence: files changed; blocker: validation did not run.',
  '',
].join('\n');
const WORK_TRACKER_ATTEMPT_LEDGER_SUPERSEDED_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Attempt Ledger',
  '',
  '- [x] Agent Implement (' + IMPLEMENTATION_AGENT_ID + ') implementation attempt: status: partial-unvalidated; last checkpoint: patch edited without proof; parent action: pending; evidence: files changed; blocker: validation did not run.',
  '- [x] Agent Recovery (' + FIX_AGENT_ID + ') implementation recovery: status: superseded; last checkpoint: discarded unvalidated patch; parent action: superseded; evidence: parent reran focused proof; next: continue from clean checkpoint.',
  '',
].join('\n');
const WORK_TRACKER_ATTEMPT_LEDGER_GENERIC_IDENTITY_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Attempt Ledger',
  '',
  '- [x] Agent Codex Implementation (' + IMPLEMENTATION_AGENT_ID + ') implementation attempt: status: validated; last checkpoint: proof complete; parent action: revalidated; evidence: npm test -- test/example.test.js; next: closure.',
  '',
].join('\n');
const WORK_TRACKER_ATTEMPT_LEDGER_CODEX_NAMED_AGENT_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Attempt Ledger',
  '',
  '- [x] Agent CodexImplementationSubagent (' + IMPLEMENTATION_AGENT_ID + ') implementation attempt: status: validated; last checkpoint: proof complete; parent action: revalidated; evidence: npm test -- test/example.test.js; next: closure.',
  '',
].join('\n');
const WORK_TRACKER_ATTEMPT_LEDGER_BAD_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Attempt Ledger',
  '',
  '- [x] Agent Implement (' + IMPLEMENTATION_AGENT_ID + ') implementation attempt: done.',
  '',
].join('\n');
const WORK_TRACKER_ATTEMPT_LEDGER_OPEN_PARTIAL_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Attempt Ledger',
  '',
  '- [ ] Agent Implement (' + IMPLEMENTATION_AGENT_ID + ') implementation attempt: status: partial-unvalidated; last checkpoint: patch edited without proof; parent action: pending; evidence: files changed; blocker: validation did not run.',
  '- [x] Agent Recovery (' + FIX_AGENT_ID + ') implementation recovery: status: superseded; last checkpoint: discarded unvalidated patch; parent action: superseded; evidence: parent reran focused proof; next: continue from clean checkpoint.',
  '',
].join('\n');
const WORK_TRACKER_ATTEMPT_LEDGER_NOT_NEEDED_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Attempt Ledger',
  '',
  '- [x] not-needed implementation attempt: status: validated; last checkpoint: skipped; parent action: accepted; evidence: none; next: closure.',
  '',
].join('\n');
const WORK_TRACKER_LEDGER_FIXES_REQUIRED_CONTENT = [
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
const WORK_TRACKER_LEDGER_REVIEW_FIXED_METADATA_CONTENT = [
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
const WORK_TRACKER_LEDGER_REVIEW_FIXED_RUNTIME_CONTENT = [
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
const WORK_TRACKER_LEDGER_REVIEW_FIXED_WRONG_AGENT_CONTENT = [
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
const WORK_TRACKER_LEDGER_PRE_IMPL_CONTENT = [
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
const WORK_TRACKER_LEDGER_NUMBERED_PRE_IMPL_CONTENT = [
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
const WORK_TRACKER_LEDGER_UNAVAILABLE_CONTENT = [
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
const WORK_TRACKER_LEDGER_FIRST_PACKAGE_CONTENT = [
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
const WORK_TRACKER_LEDGER_AMBIGUOUS_REVIEW_NOT_NEEDED_CONTENT = [
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
const WORK_TRACKER_LEDGER_NO_AGENT_ID_CONTENT = [
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
const WORK_TRACKER_LEDGER_LOCAL_IMPLEMENTATION_CONTENT = [
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
const WORK_TRACKER_LEDGER_MANUAL_FIX_NOTE_CONTENT = [
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
const WORK_TRACKER_LEDGER_LOCAL_PATH_CONTENT = [
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
const WORK_TRACKER_LEDGER_BAD_NOT_NEEDED_CONTENT = [
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
const WORK_TRACKER_LEDGER_LEGACY_DONE_CONTENT = [
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
const WORK_TRACKER_LEDGER_CHECKED_PENDING_CONTENT = [
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
const WORK_TRACKER_LEDGER_CHECKED_TEMPLATE_CONTENT = [
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
const WORK_TRACKER_COMMIT_LEDGER_VALID_CONTENT = [
  '# Test Package',
  '',
  '## Commit And Push Ledger',
  '',
  `- Focused package commit: ${TEST_COMMIT_SHA}`,
  `- Pushed to: ${TEST_PUSH_TARGET}`,
  '- Commit contains only package-owned files/package-status/allowed sprint handoff: yes',
  '',
].join('\n');
const WORK_TRACKER_COMMIT_LEDGER_LEGACY_VALID_CONTENT = [
  '# Test Package',
  '',
  '## Closure Commit Proof',
  '',
  `- Focused package commit: ${TEST_COMMIT_SHA}`,
  `- Pushed to: ${TEST_PUSH_TARGET}`,
  '- Commit contains only package-owned files/package-status/allowed sprint handoff: yes',
  '',
].join('\n');
const WORK_TRACKER_DOCTOR_CONTENT = [
  '# Test Package',
  '',
  '<!-- work-package',
  JSON.stringify({
    schema: 'work-package-v1',
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
    },
  }, null, 2),
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
const WORK_TRACKER_FUTURE_DONE_STRICT_CONTENT = [
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
const WORK_TRACKER_COMMIT_LEDGER_TEMPLATE_CONTENT = [
  '# Test Package',
  '',
  '## Commit And Push Ledger',
  '',
  '- Focused package commit: <sha>',
  '- Pushed to: <remote>/<branch>',
  '- Commit contains only package-owned files/package-status/allowed sprint handoff: <yes>',
  '',
].join('\n');
const WORK_TRACKER_COMMIT_LEDGER_PENDING_CONTENT = [
  '# Test Package',
  '',
  '## Commit And Push Ledger',
  '',
  '- Focused package commit: pending.',
  '- Pushed to: pending.',
  '- Commit contains only package-owned files/package-status/allowed sprint handoff: pending.',
  '',
].join('\n');

describe('work tracker subagent sequencing ledger validation', () => {
  it('requires subagent sequencing only for strict workflow lanes', () => {
    assert.equal(
      metadataRequiresSubagentSequencing({lane: LANE_READ_REVIEW_DOC_ONLY}),
      false,
    );
    assert.equal(
      metadataRequiresSubagentSequencing({lane: LANE_MECHANICAL_MAINTENANCE}),
      false,
    );
    assert.equal(
      metadataRequiresSubagentSequencing({lane: LANE_LIGHTWEIGHT_MAINTENANCE}),
      false,
    );
    assert.equal(
      metadataRequiresSubagentSequencing({lane: LANE_TEST_ONLY_PROOF}),
      false,
    );
    assert.equal(
      metadataRequiresSubagentSequencing({lane: LANE_DIAGNOSTIC_CLASSIFICATION}),
      false,
    );
    assert.equal(
      metadataRequiresSubagentSequencing({lane: LANE_BOUNDED_EXPERIMENT}),
      false,
    );
    assert.equal(
      metadataRequiresSubagentSequencing({lane: LANE_SINGLE_FILE_RUNTIME}),
      false,
    );
    assert.equal(
      metadataRequiresSubagentSequencing({lane: LANE_RUNTIME_OWNER_BOUNDARY}),
      true,
    );
    assert.equal(metadataRequiresSubagentSequencing({}), true);
  });

  it('uses classification-only fast path only without implementation writes', () => {
    assert.equal(
      metadataHasClassificationOnlyOutcome(CLASSIFICATION_ONLY_FAST_PATH_METADATA),
      true,
    );
    assert.equal(
      metadataUsesClassificationOnlyFastPath(
        CLASSIFICATION_ONLY_FAST_PATH_METADATA,
      ),
      true,
    );
    assert.equal(
      metadataUsesPureClassificationFastPath(
        CLASSIFICATION_ONLY_FAST_PATH_METADATA,
      ),
      true,
    );
    assert.equal(
      metadataRequiresSubagentSequencing(
        CLASSIFICATION_ONLY_FAST_PATH_METADATA,
      ),
      false,
    );
    assert.equal(
      metadataUsesClassificationOnlyFastPath(
        CLASSIFICATION_ONLY_WITH_IMPLEMENTATION_SCOPE_METADATA,
      ),
      false,
    );
    assert.equal(
      metadataUsesPureClassificationFastPath(
        CLASSIFICATION_ONLY_WITH_IMPLEMENTATION_SCOPE_METADATA,
      ),
      false,
    );
    assert.equal(
      metadataRequiresSubagentSequencing(
        CLASSIFICATION_ONLY_WITH_IMPLEMENTATION_SCOPE_METADATA,
      ),
      true,
    );
  });

  it('reports active metadata-bearing packages without the new ledger', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.equal(errors.length, 1);
    assert.match(errors[0], /Subagent Sequencing Ledger is required/u);
  });

  it('accepts execution evidence without agent identity as closure proof', () => {
    const errors = validateExecutionEvidenceLedger(
      WORK_TRACKER_EXECUTION_EVIDENCE_CLEAN_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.deepEqual(errors, []);
  });

  it('requires verifier-fixer evidence when closure verification is required', () => {
    const missingVerifierErrors = validateExecutionEvidenceLedger(
      WORK_TRACKER_EXECUTION_EVIDENCE_CLEAN_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresVerificationFix: true},
    );
    const completeVerifierErrors = validateExecutionEvidenceLedger(
      WORK_TRACKER_EXECUTION_EVIDENCE_VERIFIED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresVerificationFix: true},
    );
    const missingChangedFilesErrors = validateExecutionEvidenceLedger(
      WORK_TRACKER_EXECUTION_EVIDENCE_VERIFIED_NO_CHANGES_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresVerificationFix: true},
    );

    assert.match(
      missingVerifierErrors.join('\n'),
      /verification-fix item/u,
    );
    assert.deepEqual(completeVerifierErrors, []);
    assert.match(
      missingChangedFilesErrors.join('\n'),
      /changed files:/u,
    );
  });

  it('accepts execution evidence with real agent provenance', () => {
    const errors = validateExecutionEvidenceLedger(
      WORK_TRACKER_EXECUTION_EVIDENCE_WITH_AGENT_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.deepEqual(errors, []);
  });

  it('requires parent revalidation before execution evidence closure', () => {
    const errors = validateExecutionEvidenceLedger(
      WORK_TRACKER_EXECUTION_EVIDENCE_UNVALIDATED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.match(
      errors.join('\n'),
      /parent revalidated focused proof: yes/u,
    );
  });

  it('allows open execution evidence before closure', () => {
    const errors = validateExecutionEvidenceLedger(
      WORK_TRACKER_EXECUTION_EVIDENCE_OPEN_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: false, allowOpenImplementation: true},
    );

    assert.deepEqual(errors, []);
  });

  it('allows done historical packages without the new ledger', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: false},
    );

    assert.deepEqual(errors, []);
  });

  it('requires a progress ledger when subagent sequencing is required', () => {
    const errors = validateSubagentProgressLedger(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.equal(errors.length, 1);
    assert.match(
      errors[0],
      /Subagent Progress Ledger or Subagent Progress And Attempt Ledger is required/u,
    );
  });

  it('accepts checked subagent progress updates with evidence and next step', () => {
    const errors = validateSubagentProgressLedger(
      WORK_TRACKER_PROGRESS_LEDGER_CLEAN_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.deepEqual(errors, []);
  });

  it('accepts one combined progress and attempt checkpoint ledger', () => {
    const progressErrors = validateSubagentProgressLedger(
      WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );
    const attemptErrors = validateSubagentAttemptLedger(
      WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.deepEqual(progressErrors, []);
    assert.deepEqual(attemptErrors, []);
  });

  it('accepts local runtime wording in real-agent checkpoint evidence', () => {
    const progressErrors = validateSubagentProgressLedger(
      WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_LOCAL_RUNTIME_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );
    const attemptErrors = validateSubagentAttemptLedger(
      WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_LOCAL_RUNTIME_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.deepEqual(progressErrors, []);
    assert.deepEqual(attemptErrors, []);
  });

  it('requires completed progress updates before pre-implementation proof', () => {
    const errors = validateSubagentProgressLedger(
      WORK_TRACKER_PROGRESS_LEDGER_OPEN_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.match(errors.join('\n'), /at least one completed subtask/u);
  });

  it('reports checked progress updates without durable evidence or next step', () => {
    const errors = validateSubagentProgressLedger(
      WORK_TRACKER_PROGRESS_LEDGER_BAD_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.match(errors.join('\n'), /non-real agent identity/u);
    assert.match(errors.join('\n'), /`evidence:`/u);
    assert.match(errors.join('\n'), /`next:` or `blocker:`/u);
  });

  it('rejects not-needed progress entries as strict subagent identity proof', () => {
    const errors = validateSubagentProgressLedger(
      WORK_TRACKER_PROGRESS_LEDGER_NOT_NEEDED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.match(errors.join('\n'), /Agent <name> \(<agent-id>\)/u);
  });

  it('requires an attempt ledger when subagent sequencing is required', () => {
    const errors = validateSubagentAttemptLedger(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.equal(errors.length, 1);
    assert.match(
      errors[0],
      /Subagent Attempt Ledger or Subagent Progress And Attempt Ledger is required/u,
    );
  });

  it('accepts checked subagent attempt checkpoints with parent action', () => {
    const errors = validateSubagentAttemptLedger(
      WORK_TRACKER_ATTEMPT_LEDGER_CLEAN_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.deepEqual(errors, []);
  });

  it('requires partial-unvalidated attempts to be superseded', () => {
    const errors = validateSubagentAttemptLedger(
      WORK_TRACKER_ATTEMPT_LEDGER_PARTIAL_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.match(errors.join('\n'), /partial-unvalidated attempt must be followed/u);
  });

  it('accepts superseded recovery after a partial-unvalidated attempt', () => {
    const errors = validateSubagentAttemptLedger(
      WORK_TRACKER_ATTEMPT_LEDGER_SUPERSEDED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.deepEqual(errors, []);
  });

  it('reports generic Codex role labels in attempt ledger identities', () => {
    const errors = validateSubagentAttemptLedger(
      WORK_TRACKER_ATTEMPT_LEDGER_GENERIC_IDENTITY_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.match(errors.join('\n'), /non-real agent identity/u);
  });

  it('accepts real Codex-named agents when the identity has a concrete UUID',
    () => {
      const errors = validateSubagentAttemptLedger(
        WORK_TRACKER_ATTEMPT_LEDGER_CODEX_NAMED_AGENT_CONTENT,
        WORK_TRACKER_LEDGER_TEST_FILE,
        {requiresLedger: true, requiresStrictEntries: true},
      );

      assert.deepEqual(errors, []);
    });

  it('reports checked attempt entries without checkpoint proof fields', () => {
    const errors = validateSubagentAttemptLedger(
      WORK_TRACKER_ATTEMPT_LEDGER_BAD_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.match(errors.join('\n'), /status/u);
    assert.match(errors.join('\n'), /last checkpoint/u);
    assert.match(errors.join('\n'), /parent action/u);
    assert.match(errors.join('\n'), /`evidence:`/u);
    assert.match(errors.join('\n'), /`next:` or `blocker:`/u);
  });

  it('rejects open attempt items at closure validation', () => {
    const errors = validateSubagentAttemptLedger(
      WORK_TRACKER_ATTEMPT_LEDGER_OPEN_PARTIAL_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.match(errors.join('\n'), /Subagent Attempt Ledger has open items/u);
  });

  it('rejects not-needed attempt entries as strict subagent identity proof', () => {
    const errors = validateSubagentAttemptLedger(
      WORK_TRACKER_ATTEMPT_LEDGER_NOT_NEEDED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.match(errors.join('\n'), /Agent <name> \(<agent-id>\)/u);
  });

  it('reports open and unchecked required ledger items', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_OPEN_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.equal(errors.length, 4);
    assert.match(errors[0], /has open items/u);
    assert.match(errors[1], /Review subagent recorded/u);
    assert.match(errors[2], /Fix subagent recorded or explicitly not needed/u);
    assert.match(errors[3], /Implementation subagent recorded/u);
  });

  it('allows pending subagent ledgers on queued packages', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_OPEN_CONTENT,
      'work/packages/todo-test-package.md',
      {
        allowPendingSubagentLedger: true,
        requiresLedger: false,
      },
    );

    assert.deepEqual(errors, []);
  });

  it('accepts a clean review with an explicit not-needed fix entry', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_CLEAN_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.deepEqual(errors, []);
  });

  it('rejects implementation completion before parent revalidation proof', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_UNVALIDATED_IMPLEMENTATION_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.match(
      errors.join('\n'),
      /parent revalidated focused proof: yes/u,
    );
  });

  it('accepts a fixes-required review with a separate real fix agent', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_FIXES_REQUIRED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.deepEqual(errors, []);
  });

  it('accepts metadata-only fixes performed by the review agent', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_REVIEW_FIXED_METADATA_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.deepEqual(errors, []);
  });

  it('rejects review-fixed entries for non-metadata changes', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_REVIEW_FIXED_RUNTIME_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /metadata-only/u);
  });

  it('requires review-fixed metadata fixes to use the review agent', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_REVIEW_FIXED_WRONG_AGENT_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /must be recorded by the review agent/u);
  });

  it('allows pending implementation at pre-implementation validation', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_PRE_IMPL_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        requiresLedger: true,
        requiresStrictEntries: true,
        allowOpenImplementation: true,
      },
    );

    assert.deepEqual(errors, []);
  });

  it('accepts numbered checklist ledger entries at pre-implementation validation',
    () => {
      const errors = validateSubagentSequencingLedger(
        WORK_TRACKER_LEDGER_NUMBERED_PRE_IMPL_CONTENT,
        WORK_TRACKER_LEDGER_TEST_FILE,
        {
          requiresLedger: true,
          requiresStrictEntries: true,
          allowOpenImplementation: true,
        },
      );

      assert.deepEqual(errors, []);
    });

  it('allows unavailable subagent states before closure but not as closure proof', () => {
    const preImplErrors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_UNAVAILABLE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        requiresLedger: true,
        requiresStrictEntries: true,
        allowOpenImplementation: true,
        allowUnavailableSubagents: true,
      },
    );
    const closureErrors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_UNAVAILABLE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        requiresLedger: true,
        requiresStrictEntries: true,
      },
    );

    assert.deepEqual(preImplErrors, []);
    assert.match(closureErrors.join('\n'), /Subagent Sequencing Ledger/u);
  });

  it('accepts not-needed review for the first package in a sprint', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_FIRST_PACKAGE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.deepEqual(errors, []);
  });

  it('reports ambiguous not-needed review without first-package reason', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_AMBIGUOUS_REVIEW_NOT_NEEDED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /first-package-in-sprint/u);
  });

  it('reports checked ledger items without real agent id proof', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_NO_AGENT_ID_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /review entry must match/u);
    assert.match(errors.join('\n'), /implementation entry must/u);
  });

  it('reports implementation entries using local session identities', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_LOCAL_IMPLEMENTATION_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /non-real agent identity/u);
  });

  it('reports explicit non-real parent Codex notes in checked strict entries', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_MANUAL_FIX_NOTE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /non-real agent identity/u);
  });

  it('accepts real agent entries whose package path contains local', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_LOCAL_PATH_CONTENT,
      WORK_TRACKER_LEDGER_LOCAL_PATH_TEST_FILE,
    );

    assert.deepEqual(errors, []);
  });

  it('reports not-needed fixes when review found fixes required', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_BAD_NOT_NEEDED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /cannot be not-needed/u);
  });

  it('grandfathers historical done-package session labels when strict entries are not required', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_LEGACY_DONE_CONTENT,
      WORK_TRACKER_DONE_TEST_FILE,
      {requiresLedger: false, requiresStrictEntries: false},
    );

    assert.deepEqual(errors, []);
  });

  it('reports historical session labels when strict entries are required', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_LEGACY_DONE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.match(errors.join('\n'), /review entry must match/u);
    assert.match(errors.join('\n'), /implementation entry must/u);
  });

  it('reports checked ledger items that still contain pending markers', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_CHECKED_PENDING_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /pending-before-implementation-resumes/u);
  });

  it('reports checked ledger items that still contain template placeholders', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_CHECKED_TEMPLATE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /template placeholder/u);
  });
});

describe('work tracker package doctor', () => {
  it('recognizes generated current-blocker handoff files as tracker output', () => {
    assert.equal(
      isGeneratedCurrentBlockerPath(WORK_TRACKER_CURRENT_BLOCKER_MARKDOWN),
      true,
    );
  });

  it('prints a compact validation summary for a package', () => {
    const report = buildPackageDoctorLines(
      WORK_TRACKER_ACTIVE_DOCTOR_FILE,
      WORK_TRACKER_DOCTOR_CONTENT,
    );
    const rendered = report.lines.join('\n');

    assert.deepEqual(report.errors, []);
    assert.match(rendered, /# Work Package Doctor/u);
    assert.match(rendered, /Owner: workflow_tooling_owner/u);
    assert.match(rendered, /Output profile: medium/u);
    assert.match(rendered, /Write scope: 1/u);
    assert.match(rendered, /Legacy touched files: 0/u);
    assert.match(rendered, /Validation: ok/u);
  });

  it('requires executor and verifier-fixer proof for future closed runtime packages',
    () => {
      const report = buildPackageDoctorLines(
        WORK_TRACKER_FUTURE_DONE_TEST_FILE,
        WORK_TRACKER_FUTURE_DONE_STRICT_CONTENT,
        {phase: 'closure'},
      );
      const rendered = report.lines.join('\n');

      assert.match(rendered, /Execution Evidence is required/u);
      assert.match(rendered, /implementation and verification-fix/u);
    });

  it('prints acceleration guidance for admin-heavy packages', () => {
    const content = [
      '# Admin Package',
      '',
      '<!-- work-package',
      JSON.stringify({
        schema: 'work-package-v1',
        status: WORK_TRACKER_ACTIVE_STATUS,
        opened: '2026-05-18',
        lane: LANE_READ_REVIEW_DOC_ONLY,
        scenario: 'none',
        artifact: 'none',
        playback: 'none',
        owner: 'release_gate_owner',
        boundary: 'representative_evidence',
        dominantReason: 'fresh_evidence_required',
        currentState: 'Metadata-only package needs a hard next action.',
        nextAction: 'Run representative evidence before more package edits.',
        proof: [
          'npm run work:evidence-summary -- test-output/reports/a.report.json',
          'npm run work:scenario-triage -- test-output/reports/a.report.json --markdown',
          'npm run analyze:topology-convergence -- test-output/reports/a.report.json',
          'npm run analyze:causal-model -- test-output/reports/a.report.json',
          'npm run analyze:priority-recovery-residuals -- test-output/reports/a.report.json --markdown',
          'npm run summarize:harness -- --report-dir test-output/reports',
        ],
        writeScope: ['work/packages/active-admin-package.md'],
        handoffFiles: [],
        generatedFiles: [],
        candidateRuntimeFiles: [],
        commitScope: ['work/packages/active-admin-package.md'],
        modelFit: {
          packageClass: 'bounded-implementation',
          intendedMinimumModel: 'gpt-5.3-codex-spark',
          scopeShape: 'leaf-slice',
          outputProfile: 'small',
          escalationTriggers: ['runtime ownership changes'],
        },
      }, null, 2),
      '-->',
      '',
      '## Model Fit',
      '',
      '- Package class: `bounded-implementation`',
      '- Intended minimum model: `gpt-5.3-codex-spark`',
      '- Scope shape: `leaf-slice`',
      '- Output profile: `small`',
      '- Owned files: `work/packages/active-admin-package.md`',
      '- Forbidden files: `src/`',
      '- Frozen decisions: metadata-only package stops after one pass.',
      '- Escalation triggers: runtime ownership changes.',
      '- Focused proof: `npm run work:advance -- --check`',
      '',
    ].join('\n');
    const report = buildPackageDoctorLines(
      'work/packages/active-admin-package.md',
      content,
    );
    const rendered = report.lines.join('\n');

    assert.deepEqual(report.errors, []);
    assert.match(rendered, /## Process Guidance/u);
    assert.match(rendered, /Proof ladder is heavy/u);
    assert.match(rendered, /Admin stop applies/u);
  });

  it('allows classification-only fast path without subagent ledger', () => {
    const content = [
      '# Classification Only Package',
      '',
      '<!-- work-package',
      JSON.stringify(CLASSIFICATION_ONLY_FAST_PATH_METADATA, null, 2),
      '-->',
      '',
      CORE_LOGIC_BRIEF_VALID_CONTENT.split('\n').slice(2).join('\n'),
      CAUSAL_DECISION_CONTRACT_VALID_CONTENT.split('\n').slice(2).join('\n'),
      MODEL_FIT_VALID_SPARK_SAFE_CONTENT.split('\n').slice(2).join('\n'),
    ].join('\n');
    const report = buildPackageDoctorLines(
      WORK_TRACKER_LEDGER_TEST_FILE,
      content,
    );
    const rendered = report.lines.join('\n');

    assert.deepEqual(report.errors, []);
    assert.match(rendered, /Classification-only fast path: yes/u);
    assert.match(rendered, /Classification-only proof ladder is compact/u);
    assert.match(rendered, /subagent sequencing and static guardrails are not required/u);
  });

  it('keeps classification-only implementation scope on the normal lane', () => {
    const content = [
      '# Classification Only Package',
      '',
      '<!-- work-package',
      JSON.stringify(
        CLASSIFICATION_ONLY_WITH_IMPLEMENTATION_SCOPE_METADATA,
        null,
        2,
      ),
      '-->',
      '',
      CORE_LOGIC_BRIEF_VALID_CONTENT.split('\n').slice(2).join('\n'),
      MODEL_FIT_VALID_SPARK_SAFE_CONTENT.split('\n').slice(2).join('\n'),
    ].join('\n');
    const report = buildPackageDoctorLines(
      WORK_TRACKER_LEDGER_TEST_FILE,
      content,
    );
    const rendered = report.lines.join('\n');

    assert.doesNotMatch(
      report.errors.join('\n'),
      /Subagent Sequencing Ledger is required/u,
    );
    assert.match(rendered, /Classification-only fast path: no/u);
    assert.match(rendered, /Classification-only result has implementation write scope/u);
  });

  it('requires verifier-fixer proof for optional code-scope lanes at closure', () => {
    const openLedgerContent = WORK_TRACKER_DOCTOR_CONTENT.replace(
      /## Subagent Sequencing Ledger[\s\S]*$/u,
      WORK_TRACKER_LEDGER_OPEN_CONTENT.split('\n').slice(2).join('\n'),
    );
    const entryReport = buildPackageDoctorLines(
      WORK_TRACKER_ACTIVE_DOCTOR_FILE,
      openLedgerContent,
      {phase: 'entry'},
    );
    const preImplReport = buildPackageDoctorLines(
      WORK_TRACKER_ACTIVE_DOCTOR_FILE,
      openLedgerContent,
      {phase: 'pre-impl'},
    );
    const closureReport = buildPackageDoctorLines(
      WORK_TRACKER_ACTIVE_DOCTOR_FILE,
      openLedgerContent,
      {phase: 'closure'},
    );

    assert.deepEqual(entryReport.errors, []);
    assert.deepEqual(preImplReport.errors, []);
    assert.match(
      closureReport.errors.join('\n'),
      /Execution Evidence is required with checked implementation and verification-fix/u,
    );
  });

  it('surfaces scenario causal closure metadata in package doctor output', () => {
    const scenarioDoctorContent = WORK_TRACKER_DOCTOR_CONTENT.replace(
      '"scenario": "none"',
      '"scenario": "rolling-restart"',
    ).replace(
      '"owner": "workflow_tooling_owner"',
      '"owner": "operation_workflow_owner"',
    ).replace(
      '"boundary": "package_doctor"',
      '"boundary": "workflow_progress"',
    ).replace(
      '"modelFit": {',
      '"causalGovernance": ' +
        JSON.stringify(CAUSAL_GOVERNANCE_VALID_METADATA.causalGovernance) +
        ',\n    "scenarioCausalClosure": ' +
        JSON.stringify(
          SCENARIO_CAUSAL_CLOSURE_VALID_METADATA.scenarioCausalClosure,
        ) +
        ',\n    "modelFit": {',
    );
    const report = buildPackageDoctorLines(
      WORK_TRACKER_ACTIVE_DOCTOR_FILE,
      scenarioDoctorContent,
    );
    const rendered = report.lines.join('\n');

    assert.deepEqual(report.errors, []);
    assert.match(rendered, /Scenario causal closure: recorded/u);
  });

  it('prints concrete fix dry-run suggestions for schema failures', () => {
    const invalidDoctorContent = WORK_TRACKER_DOCTOR_CONTENT.replace(
      '"scenario": "none"',
      '"scenario": "rolling-restart"',
    ).replace(
      '"modelFit": {',
      '"causalGovernance": ' +
        JSON.stringify(CAUSAL_GOVERNANCE_INVALID_METADATA.causalGovernance) +
        ',\n    "scenarioCausalClosure": ' +
        JSON.stringify(
          SCENARIO_CAUSAL_CLOSURE_INVALID_METADATA.scenarioCausalClosure,
        ) +
        ',\n    "modelFit": {',
    );
    const report = buildPackageDoctorLines(
      WORK_TRACKER_ACTIVE_DOCTOR_FILE,
      invalidDoctorContent,
      {fixDryRun: true},
    );
    const rendered = report.lines.join('\n');

    assert.notDeepEqual(report.errors, []);
    assert.match(rendered, /## Fix Dry Run/u);
    assert.match(rendered, /work:package:schema/u);
    assert.match(rendered, /analyze:topology-convergence/u);
  });
});

describe('work tracker commit and push ledger validation', () => {
  it('grandfathers historical done packages without commit and push proof', () => {
    const errors = validateCommitAndPushLedger(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      WORK_TRACKER_DONE_TEST_FILE,
      {
        requiresLedger: true,
        allowMissingHistoricalCommitLedger: true,
      },
    );

    assert.deepEqual(errors, []);
  });

  it('reports done metadata-bearing packages without commit and push proof', () => {
    const errors = validateCommitAndPushLedger(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      WORK_TRACKER_DONE_TEST_FILE,
      {requiresLedger: true},
    );

    assert.equal(errors.length, 1);
    assert.match(errors[0], /Commit And Push Ledger is required/u);
  });

  it('accepts complete commit and push proof', () => {
    const errors = validateCommitAndPushLedger(
      WORK_TRACKER_COMMIT_LEDGER_VALID_CONTENT,
      WORK_TRACKER_DONE_TEST_FILE,
      {requiresLedger: true},
    );

    assert.deepEqual(errors, []);
  });

  it('ignores inline mentions of ledger headings before the real heading', () => {
    const errors = validateCommitAndPushLedger(
      [
        '# Test Package',
        '',
        'This prose mentions `## Commit And Push Ledger` before closure.',
        '',
        WORK_TRACKER_COMMIT_LEDGER_VALID_CONTENT,
      ].join('\n'),
      WORK_TRACKER_DONE_TEST_FILE,
      {requiresLedger: true},
    );

    assert.deepEqual(errors, []);
  });

  it('accepts the legacy closure commit proof heading as an alias', () => {
    const errors = validateCommitAndPushLedger(
      WORK_TRACKER_COMMIT_LEDGER_LEGACY_VALID_CONTENT,
      WORK_TRACKER_DONE_TEST_FILE,
      {requiresLedger: true},
    );

    assert.deepEqual(errors, []);
  });

  it('allows pending commit proof only when the package is still open', () => {
    const openErrors = validateCommitAndPushLedger(
      WORK_TRACKER_COMMIT_LEDGER_PENDING_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {allowPendingCommitLedger: true},
    );
    const closedErrors = validateCommitAndPushLedger(
      WORK_TRACKER_COMMIT_LEDGER_PENDING_CONTENT,
      WORK_TRACKER_DONE_TEST_FILE,
      {requiresLedger: true},
    );

    assert.deepEqual(openErrors, []);
    assert.match(closedErrors.join('\n'), /must be a git commit SHA/u);
  });

  it('reports placeholders in commit and push proof fields', () => {
    const errors = validateCommitAndPushLedger(
      WORK_TRACKER_COMMIT_LEDGER_TEMPLATE_CONTENT,
      WORK_TRACKER_DONE_TEST_FILE,
      {requiresLedger: true},
    );

    assert.match(errors.join('\n'), /placeholder/u);
    assert.match(errors.join('\n'), /must be a git commit SHA/u);
    assert.match(errors.join('\n'), /must be <remote>\/<branch>/u);
    assert.match(errors.join('\n'), /must be yes/u);
  });
});

describe('work tracker core logic brief validation', () => {
  it('requires Core Logic Brief when strict lanes ask for it', () => {
    const errors = validateCoreLogicBrief(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.equal(errors.length, 1);
    assert.match(errors[0], /Core Logic Brief section is required/u);
  });

  it('accepts not-needed only when the lane does not require core logic', () => {
    const optionalErrors = validateCoreLogicBrief(
      CORE_LOGIC_BRIEF_NOT_NEEDED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: false},
    );
    const requiredErrors = validateCoreLogicBrief(
      CORE_LOGIC_BRIEF_NOT_NEEDED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.deepEqual(optionalErrors, []);
    assert.match(requiredErrors.join('\n'), /cannot be not-needed/u);
  });

  it('accepts a complete Core Logic Brief', () => {
    const errors = validateCoreLogicBrief(
      CORE_LOGIC_BRIEF_VALID_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.deepEqual(errors, []);
  });

  it('rejects generic Core Logic Brief scaffolding before implementation', () => {
    const errors = validateCoreLogicBrief(
      CORE_LOGIC_BRIEF_GENERIC_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, rejectGeneric: true},
    );

    assert.match(errors.join('\n'), /must name the concrete decision model/u);
  });

  it('reports missing placeholders and vague Core Logic Brief fields', () => {
    const errors = validateCoreLogicBrief(
      CORE_LOGIC_BRIEF_INCOMPLETE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.match(errors.join('\n'), /Canonical outcome/u);
    assert.match(errors.join('\n'), /Inputs\/signals/u);
    assert.match(errors.join('\n'), /State model or invariant/u);
    assert.match(errors.join('\n'), /Proof mapping/u);
  });
});

describe('work tracker causal decision contract validation', () => {
  it('requires Causal Decision Contract when strict active packages ask for it', () => {
    const errors = validateCausalDecisionContract(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.equal(errors.length, 1);
    assert.match(errors[0], /Causal Decision Contract section is required/u);
  });

  it('accepts a concrete Causal Decision Contract with oscillation guard', () => {
    const errors = validateCausalDecisionContract(
      CAUSAL_DECISION_CONTRACT_VALID_CONTENT,
      CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.deepEqual(errors, []);
  });

  it('reports placeholders, missing decision rows, and non-command probes', () => {
    const errors = validateCausalDecisionContract(
      CAUSAL_DECISION_CONTRACT_INVALID_CONTENT,
      CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.match(errors.join('\n'), /at least one concrete decision row/u);
    assert.match(errors.join('\n'), /Anti-symptom rationale/u);
    assert.match(errors.join('\n'), /must name a focused command/u);
    assert.match(errors.join('\n'), /Competing explanations/u);
    assert.match(errors.join('\n'), /Systemic interaction scan/u);
    assert.match(errors.join('\n'), /Ping-pong stop rule/u);
    assert.match(errors.join('\n'), /Oscillation guard/u);
  });

  it('accepts missing Causal Decision Contract section when causalGovernance is present in metadata', () => {
    const errors = validateCausalDecisionContract(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      {
        ...CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA,
        causalGovernance: {
          hypothesis: 'H1',
        },
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.deepEqual(errors, []);
  });
});

describe('work tracker decision experiment gate validation', () => {
  it('requires Decision Experiment Gate when strict active packages ask for it', () => {
    const errors = validateDecisionExperimentGate(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.equal(errors.length, 1);
    assert.match(errors[0], /Decision Experiment Gate section is required/u);
  });

  it('accepts a concrete Decision Experiment Gate', () => {
    const errors = validateDecisionExperimentGate(
      DECISION_EXPERIMENT_GATE_VALID_CONTENT,
      CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.deepEqual(errors, []);
  });

  it('reports placeholders, non-command probes, vague metrics, and missing stop rules', () => {
    const errors = validateDecisionExperimentGate(
      DECISION_EXPERIMENT_GATE_INVALID_CONTENT,
      CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.match(errors.join('\n'), /Decision question/u);
    assert.match(errors.join('\n'), /Architecture review/u);
    assert.match(errors.join('\n'), /Pre-edit focused probe must name a focused command/u);
    assert.match(errors.join('\n'), /Success metrics/u);
    assert.match(errors.join('\n'), /Representative rerun must name a focused command/u);
    assert.match(errors.join('\n'), /Kill rule/u);
  });

  it('accepts missing Decision Experiment Gate section when architectureDecisionGate is present in metadata with choices', () => {
    const errors = validateDecisionExperimentGate(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      {
        ...CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA,
        architectureDecisionGate: {
          choices: [{ id: 'choice-1' }],
        },
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.deepEqual(errors, []);
  });

  it('requires a hypothesis discriminator for watching frontier oscillation', () => {
    const metadata = {
      ...CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA,
      architectureDecisionGate: {
        status: 'watching',
        trigger: 'frontier-oscillation',
        triggerEvidence: ['frontier returned to the same owner'],
      },
    };

    const vagueErrors = validateDecisionExperimentGate(
      DECISION_EXPERIMENT_GATE_VALID_CONTENT,
      metadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );
    const discriminatingErrors = validateDecisionExperimentGate(
      DECISION_EXPERIMENT_GATE_VALID_CONTENT.replace(
        /Competing hypotheses: .+/u,
        'Competing hypotheses: H1 owner wake missing predicts pending=1; ' +
          'H2 active-gate lag predicts pending=0 but snapshot stale; ' +
          'H3 fixture drift predicts pending=1 only in replay; ' +
          'different observable chooses the route.',
      ),
      metadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.match(vagueErrors.join('\n'), /hypothesis discriminator/u);
    assert.deepEqual(discriminatingErrors, []);
  });
});

describe('work tracker sprint strategy brief validation', () => {
  it('requires Sprint Strategy Brief when active sprints ask for it', () => {
    const errors = validateSprintStrategyBrief(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      'work/sprints/active-test-sprint.md',
      {requiresLedger: true},
    );

    assert.equal(errors.length, 1);
    assert.match(errors[0], /Sprint Strategy Brief section is required/u);
  });

  it('accepts a complete Sprint Strategy Brief', () => {
    const errors = validateSprintStrategyBrief(
      SPRINT_STRATEGY_BRIEF_VALID_CONTENT,
      'work/sprints/active-test-sprint.md',
      {requiresLedger: true},
    );

    assert.deepEqual(errors, []);
  });

  it('reports missing placeholders and vague Sprint Strategy Brief fields', () => {
    const errors = validateSprintStrategyBrief(
      SPRINT_STRATEGY_BRIEF_INCOMPLETE_CONTENT,
      'work/sprints/active-test-sprint.md',
      {requiresLedger: true},
    );
    const message = errors.join('\n');

    assert.match(message, /Goal state/u);
    assert.match(message, /Current causal thesis/u);
    assert.match(message, /Confidence and evidence/u);
    assert.match(message, /Expected green path/u);
  });
});

describe('work tracker rerun decision validation', () => {
  it('requires rerun decision on active diagnostic successor packages', () => {
    const errors = validateRerunDecisionContract(
      {
        ...RERUN_DECISION_VALID_METADATA,
        rerunDecision: undefined,
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.match(errors.join('\n'), /metadata rerunDecision is required/u);
  });

  it('accepts a concrete rerun decision with refresh commands', () => {
    const errors = validateRerunDecisionContract(
      RERUN_DECISION_VALID_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.deepEqual(errors, []);
  });

  it('requires classification efficiency on pure classification packages', () => {
    const errors = validateClassificationEfficiencyContract(
      {
        ...RERUN_DECISION_VALID_METADATA,
        classificationEfficiency: undefined,
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.match(errors.join('\n'), /metadata classificationEfficiency is required/u);
  });

  it('accepts pure classification packages with capped successor routing', () => {
    const errors = validateClassificationEfficiencyContract(
      {
        ...RERUN_DECISION_VALID_METADATA,
        rerunDecision: {
          ...RERUN_DECISION_VALID_METADATA.rerunDecision,
          nextLane: LANE_RUNTIME_OWNER_BOUNDARY,
        },
        ...CLASSIFICATION_EFFICIENCY_VALID_METADATA,
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.deepEqual(errors, []);
  });

  it('routes stable owner-boundary classification to runtime successors', () => {
    const errors = validateClassificationEfficiencyContract(
      {
        ...RERUN_DECISION_VALID_METADATA,
        ...CLASSIFICATION_EFFICIENCY_VALID_METADATA,
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.match(errors.join('\n'), /rerunDecision\.nextLane must be runtime-owner-boundary/u);
  });

  it('rejects rerun decisions that omit required refresh steps', () => {
    const errors = validateRerunDecisionContract(
      {
        ...RERUN_DECISION_VALID_METADATA,
        rerunDecision: {
          ...RERUN_DECISION_VALID_METADATA.rerunDecision,
          requiredRefreshCommands: [
            'npm run work:package:route-after-rerun -- --artifact test-output/reports/rerun.report.json',
          ],
        },
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.match(errors.join('\n'), /requiredRefreshCommands/u);
    assert.match(errors.join('\n'), /Current Edge Card/u);
  });

  it('stops same-frontier no-reduction packages without a selected gate', () => {
    const sameFrontierMetadata = {
      ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
      scenarioCausalClosure: {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA.scenarioCausalClosure,
        resultClassification: 'same-frontier',
        stopCondition: 'continue-local-fix',
      },
    };

    const errors = validateSameFrontierStopContract(
      sameFrontierMetadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.match(errors.join('\n'), /same-frontier rerun without concrete reduction/u);
  });

  it('allows same-frontier no-reduction packages with human escalation', () => {
    const sameFrontierMetadata = {
      ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
      scenarioCausalClosure: {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA.scenarioCausalClosure,
        resultClassification: 'same-frontier',
        stopCondition: 'human-escalation',
      },
    };

    const errors = validateSameFrontierStopContract(
      sameFrontierMetadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.deepEqual(errors, []);
  });

  it('rejects a third same-frontier runtime package at entry', () => {
    const metadata = {
      ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
      lane: LANE_RUNTIME_OWNER_BOUNDARY,
      owner: 'operation_workflow_owner',
      boundary: 'workflow_progress',
      scenarioCausalClosure: {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA.scenarioCausalClosure,
        resultClassification: 'pending-before-probe',
      },
    };
    const history = [
      {
        filePath: 'work/packages/done-20260518-workflow-a.md',
        metadata: {
          scenario: 'rolling-restart',
          owner: 'operation_workflow_owner',
          boundary: 'workflow_progress',
          scenarioCausalClosure: {resultClassification: 'same-frontier'},
        },
      },
      {
        filePath: 'work/packages/done-20260519-workflow-b.md',
        metadata: {
          scenario: 'rolling-restart',
          owner: 'operation_workflow_owner',
          boundary: 'workflow_progress',
          scenarioCausalClosure: {resultClassification: 'same-frontier'},
        },
      },
    ];

    const errors = validateSameFrontierStopContract(
      metadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        phase: 'entry',
        packageHistoryEntries: history,
      },
    );

    assert.match(errors.join('\n'), /two-shot same-frontier rule/u);
    assert.match(errors.join('\n'), /owner-boundary migration package/u);
  });

  it('does not count prior same-frontier entries with concrete movement', () => {
    const metadata = {
      ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
      lane: LANE_RUNTIME_OWNER_BOUNDARY,
      owner: 'operation_workflow_owner',
      boundary: 'workflow_progress',
    };
    const history = [
      {
        filePath: 'work/packages/done-20260518-workflow-a.md',
        metadata: {
          scenario: 'rolling-restart',
          owner: 'operation_workflow_owner',
          boundary: 'workflow_progress',
          scenarioCausalClosure: {
            resultClassification: 'same-frontier',
            expectedObservableTransition:
              'pendingReconcileCount 2 -> 1 reduced shape',
          },
          observablePrediction: {
            accuracy: 'partial',
            observed: 'pendingReconcileCount 2 -> 1',
          },
        },
      },
      {
        filePath: 'work/packages/done-20260519-workflow-b.md',
        metadata: {
          scenario: 'rolling-restart',
          owner: 'sibling_owner',
          boundary: 'sibling_boundary',
          scenarioCausalClosure: {resultClassification: 'migrated'},
        },
      },
    ];

    const errors = validateSameFrontierStopContract(
      metadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        phase: 'entry',
        packageHistoryEntries: history,
      },
    );

    assert.deepEqual(errors, []);
  });

  it('does not block a sibling-owner migration package', () => {
    const metadata = {
      ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
      lane: LANE_RUNTIME_OWNER_BOUNDARY,
      owner: 'sibling_owner',
      boundary: 'sibling_boundary',
    };
    const history = [
      {
        filePath: 'work/packages/done-20260518-workflow-a.md',
        metadata: {
          scenario: 'rolling-restart',
          owner: 'operation_workflow_owner',
          boundary: 'workflow_progress',
          scenarioCausalClosure: {resultClassification: 'same-frontier'},
        },
      },
      {
        filePath: 'work/packages/done-20260519-workflow-b.md',
        metadata: {
          scenario: 'rolling-restart',
          owner: 'operation_workflow_owner',
          boundary: 'workflow_progress',
          scenarioCausalClosure: {resultClassification: 'same-frontier'},
        },
      },
    ];

    const errors = validateSameFrontierStopContract(
      metadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        phase: 'entry',
        packageHistoryEntries: history,
      },
    );

    assert.deepEqual(errors, []);
  });
});

describe('work tracker observable prediction validation', () => {
  it('requires pre-registered prediction metadata on experiment packages', () => {
    const errors = validateObservablePredictionContract(
      {status: WORK_TRACKER_ACTIVE_STATUS, lane: LANE_EXPERIMENT},
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS, phase: 'pre-impl'},
    );

    assert.match(errors.join('\n'), /observablePrediction is required/u);
  });

  it('requires prediction metadata when runtime packages predict movement', () => {
    const errors = validateObservablePredictionContract(
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_RUNTIME_OWNER_BOUNDARY,
        scenarioCausalClosure: {
          expectedObservableTransition: 'frontier reduces from 3 to 1 blockers',
        },
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS, phase: 'pre-impl'},
    );

    assert.match(errors.join('\n'), /observablePrediction is required/u);
  });

  it('compares predicted and observed transitions at closure', () => {
    const mismatchErrors = validateObservablePredictionContract(
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_EXPERIMENT,
        observablePrediction: {
          metric: 'frontier',
          predicted: 'frontier=operation_workflow_owner/workflow_progress',
          observed: 'frontier=startup_active_gate_owner/snapshot_coverage',
          accuracy: 'matched',
          evidence: 'npm test -- test/rebalancer/probe.test.js',
        },
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS, phase: 'closure'},
    );
    const matchedErrors = validateObservablePredictionContract(
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_EXPERIMENT,
        observablePrediction: {
          metric: 'frontier',
          predicted: 'frontier=operation_workflow_owner/workflow_progress',
          observed: 'frontier=operation_workflow_owner/workflow_progress',
          accuracy: 'matched',
          evidence: 'npm test -- test/rebalancer/probe.test.js',
        },
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS, phase: 'closure'},
    );

    assert.match(mismatchErrors.join('\n'), /predicted and observed transitions differ/u);
    assert.deepEqual(matchedErrors, []);
  });
});

describe('work tracker experiment outcome validation', () => {
  it('requires information learned at experiment closure', () => {
    const missingErrors = validateExperimentOutcomeContract(
      {status: WORK_TRACKER_ACTIVE_STATUS, lane: LANE_EXPERIMENT},
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS, phase: 'closure'},
    );
    const validErrors = validateExperimentOutcomeContract(
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_EXPERIMENT,
        experimentOutcome: {
          distinguishedHypothesis: 'H2',
          decision: 'open-runtime-owner-boundary',
          nextOwner: 'operation_workflow_owner',
          nextBoundary: 'workflow_progress',
          evidence: 'npm test -- test/rebalancer/probe.test.js',
        },
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS, phase: 'closure'},
    );
    const incompleteErrors = validateExperimentOutcomeContract(
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_EXPERIMENT,
        experimentOutcome: {
          distinguishedHypothesis: 'evidence-incomplete',
          decision: 'evidence-incomplete',
          evidence: 'test-output/reports/probe.report.json',
        },
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS, phase: 'closure'},
    );

    assert.match(missingErrors.join('\n'), /experimentOutcome is required/u);
    assert.deepEqual(validErrors, []);
    assert.deepEqual(incompleteErrors, []);
  });
});

describe('work tracker probe package validation', () => {
  it('requires experiment metadata and blocks runtime source writes', () => {
    const errors = validateProbePackageContract(
      '# Probe\n',
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_RUNTIME_OWNER_BOUNDARY,
        proof: [],
        writeScope: ['src/rebalancer/runtime.js'],
      },
    ).join('\n');
    const validErrors = validateProbePackageContract(
      '# Probe\n',
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_EXPERIMENT,
        proof: ['npm test -- test/rebalancer/probe.test.js'],
        writeScope: ['test/rebalancer/probe.test.js'],
        boundedExperiment: {
          hypothesis: 'H1 vs H2 vs H3',
          hypothesisDiscriminator:
            'H1 predicts A; H2 predicts B; H3 predicts C',
          expectedMetric: 'A vs B vs C',
          inheritsFrom: 'work/packages/active-predecessor.md',
          timebox: '24h',
          mergeRequirement: 'probe distinguishes H1/H2/H3',
          killRule: 'stop on non-discriminating evidence',
        },
        validationTier: 'single-owner',
        observablePrediction: {
          metric: 'frontier',
          predicted: 'H2 observable',
          metricDelta: 1,
        },
      },
    );
    const longExperimentErrors = validateProbePackageContract(
      Array.from({length: 40}, (_value, index) => `line ${index}`).join('\n'),
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_EXPERIMENT,
        proof: ['npm test -- test/rebalancer/probe.test.js'],
        writeScope: ['test/rebalancer/probe.test.js'],
        modelFit: {packageClass: 'experiment'},
        boundedExperiment: {
          hypothesis: 'H1 vs H2 vs H3',
          hypothesisDiscriminator:
            'H1 predicts A; H2 predicts B; H3 predicts C',
          expectedMetric: 'A vs B vs C',
          inheritsFrom: 'work/packages/active-predecessor.md',
          timebox: '24h',
          mergeRequirement: 'probe distinguishes H1/H2/H3',
          killRule: 'stop on non-discriminating evidence',
        },
        validationTier: 'single-owner',
        observablePrediction: {
          metric: 'frontier',
          predicted: 'H2 observable',
        },
      },
    );
    const compactLongErrors = validateProbePackageContract(
      Array.from({length: 40}, (_value, index) => `line ${index}`).join('\n'),
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_EXPERIMENT,
        proof: ['npm test -- test/rebalancer/probe.test.js'],
        writeScope: ['test/rebalancer/probe.test.js'],
        modelFit: {packageClass: 'compact-probe'},
        boundedExperiment: {
          hypothesis: 'H1 vs H2 vs H3',
          hypothesisDiscriminator:
            'H1 predicts A; H2 predicts B; H3 predicts C',
          expectedMetric: 'A vs B vs C',
          inheritsFrom: 'work/packages/active-predecessor.md',
          timebox: '24h',
          mergeRequirement: 'probe distinguishes H1/H2/H3',
          killRule: 'stop on non-discriminating evidence',
        },
        validationTier: 'single-owner',
        observablePrediction: {
          metric: 'frontier',
          predicted: 'H2 observable',
        },
      },
    ).join('\n');

    assert.match(errors, /must use lane experiment/u);
    assert.match(errors, /metadata.proof must name/u);
    assert.match(errors, /must not include src\/ runtime files/u);
    assert.deepEqual(validErrors, []);
    assert.deepEqual(longExperimentErrors, []);
    assert.match(compactLongErrors, /keep probe packages at or below/u);
  });
});

describe('work tracker required pre-implementation probe validation', () => {
  it('requires metadata-declared fixture proof before runtime source edits', () => {
    const missingErrors = validateRequiredPreImplProbeContract(
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_RUNTIME_OWNER_BOUNDARY,
        proof: ['npm test -- test/rebalancer/runtime.test.js'],
        writeScope: ['src/rebalancer/runtime.js'],
        requiredPreImplProbe: {
          command:
            'npm run analyze:topology-convergence -- test/scripts/fixtures/current.json --handoff-probe',
          artifact: 'test/scripts/fixtures/current.json',
        },
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
    ).join('\n');
    const validErrors = validateRequiredPreImplProbeContract(
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_RUNTIME_OWNER_BOUNDARY,
        proof: [
          'npm run analyze:topology-convergence -- test/scripts/fixtures/current.json --handoff-probe',
          'npm test -- test/rebalancer/runtime.test.js',
        ],
        writeScope: ['src/rebalancer/runtime.js'],
        requiredPreImplProbe: {
          command:
            'npm run analyze:topology-convergence -- test/scripts/fixtures/current.json --handoff-probe',
          artifact: 'test/scripts/fixtures/current.json',
        },
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(missingErrors, /required fixture\/probe artifact/u);
    assert.match(missingErrors, /required fixture\/probe command/u);
    assert.deepEqual(validErrors, []);
  });
});

describe('work tracker model fit validation', () => {
  it('requires model fit on active metadata-bearing packages', () => {
    const errors = validateModelFitContract(
      MODEL_FIT_MISSING_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.equal(errors.length, 1);
    assert.match(errors[0], /Model Fit section is required/u);
  });

  it('accepts a complete Spark-safe leaf-slice contract', () => {
    const errors = validateModelFitContract(
      MODEL_FIT_VALID_SPARK_SAFE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.deepEqual(errors, []);
  });

  it('rejects Spark-safe packages without Spark model, leaf scope, or bounded language',
    () => {
      const errors = validateModelFitContract(
        MODEL_FIT_INCOMPLETE_SPARK_SAFE_CONTENT,
        WORK_TRACKER_LEDGER_TEST_FILE,
        {requiresLedger: true},
      );

      assert.match(errors.join('\n'), /gpt-5\.3-codex-spark/u);
      assert.match(errors.join('\n'), /leaf-slice/u);
      assert.match(errors.join('\n'), /open-ended frontier language/u);
    });
});

describe('work tracker causal governance validation', () => {
  it('requires causal governance on active scenario-driven packages', () => {
    const errors = validateCausalGovernanceContract(
      CAUSAL_GOVERNANCE_MISSING_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.equal(errors.length, 1);
    assert.match(errors[0], /metadata causalGovernance is required/u);
  });

  it('accepts complete causal governance with a pending active-package rerun', () => {
    const errors = validateCausalGovernanceContract(
      CAUSAL_GOVERNANCE_VALID_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.deepEqual(errors, []);
  });

  it('rejects placeholders, missing causal-model checks, and pending closure outcomes',
    () => {
      const errors = validateCausalGovernanceContract(
        CAUSAL_GOVERNANCE_INVALID_METADATA,
        WORK_TRACKER_DONE_TEST_FILE,
        {requiresLedger: true, status: WORK_TRACKER_DONE_STATUS},
      );

      assert.match(errors.join('\n'), /hypothesis/u);
      assert.match(errors.join('\n'), /expectedCausalModelChange/u);
      assert.match(errors.join('\n'), /causalDebt/u);
      assert.match(errors.join('\n'), /cannot close scenario-driven package/u);
      assert.match(errors.join('\n'), /analyze:causal-model/u);
    });
});

describe('work tracker representative residual validation', () => {
  it('requires representative residual metadata when active diagnostics keeps the sprint residual live',
    () => {
      const errors = validateRepresentativeResidualContract(
        REPRESENTATIVE_RESIDUAL_MISSING_METADATA,
        WORK_TRACKER_LEDGER_TEST_FILE,
        {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
      );

      assert.equal(errors.length, 1);
      assert.match(errors[0], /representativeResidual is required/u);
      assert.match(errors[0], /sprint representative residual live/u);
    });

  it('accepts concrete representative residual metadata', () => {
    const errors = validateRepresentativeResidualContract(
      REPRESENTATIVE_RESIDUAL_VALID_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.deepEqual(errors, []);
  });

  it('rejects placeholder representative residual fields', () => {
    const errors = validateRepresentativeResidualContract(
      REPRESENTATIVE_RESIDUAL_INVALID_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );
    const rendered = errors.join('\n');

    assert.match(rendered, /representativeResidual.status/u);
    assert.match(rendered, /representativeResidual.artifact/u);
    assert.match(rendered, /representativeResidual.frontier/u);
    assert.match(rendered, /representativeResidual.owner/u);
    assert.match(rendered, /representativeResidual.boundary/u);
    assert.match(rendered, /representativeResidual.dominantReason/u);
    assert.match(rendered, /representativeResidual.nextAction/u);
    assert.match(rendered, /scenario must match/u);
  });

  it('surfaces missing representative residual metadata in package doctor output',
    () => {
      const metadata = {
        schema: 'work-package-v1',
        status: 'active',
        lane: 'causal-escalation',
        scenario: 'rolling-restart',
        owner: 'diagnostics_owner',
        boundary: 'residual_inventory',
        dominantReason: 'residual_inventory_incomplete',
        currentState:
          'The sprint representative rolling-restart residual remains red.',
        nextAction: 'Record the residual before runtime fixes continue.',
        proof: ['node --test test/scripts/work-tracker-subagent-ledger.test.js'],
        writeScope: ['work/packages/active-test-package.md'],
        commitScope: ['work/packages/active-test-package.md'],
        modelFit: {
          packageClass: 'representative-frontier-closure',
          intendedMinimumModel: 'gpt-5.3-codex',
          scopeShape: 'owner-boundary-contraction/current-frontier',
          outputProfile: 'medium',
          escalationTriggers: ['representative scenario evidence changes'],
        },
        causalGovernance: CAUSAL_GOVERNANCE_VALID_METADATA.causalGovernance,
        scenarioCausalClosure: {
          ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA.scenarioCausalClosure,
          currentFirstFrontier:
            'diagnostics_owner / residual_inventory package-local proof; ' +
            'the sprint representative residual remains red.',
        },
      };
      const content = [
        '# Test Package',
        '',
        '<!-- work-package',
        JSON.stringify(metadata, null, 2),
        '-->',
        '',
        '## Model Fit',
        '',
        '- Package class: `representative-frontier-closure`',
        '- Intended minimum model: `gpt-5.3-codex`',
        '- Scope shape: `owner-boundary-contraction/current-frontier`',
        '- Output profile: `medium`',
        '- Owned files: `work/packages/active-test-package.md`',
        '- Forbidden files: `src/`, `test/distributed/harness/`',
        '- Frozen decisions: diagnostics package keeps scope fixed.',
        '- Escalation triggers: representative scenario evidence changes.',
        '- Focused proof: `node --test test/scripts/work-tracker-subagent-ledger.test.js`',
        '',
        WORK_TRACKER_LEDGER_CLEAN_CONTENT.split('\n').slice(2).join('\n'),
      ].join('\n');
      const report = buildPackageDoctorLines(
        WORK_TRACKER_LEDGER_TEST_FILE,
        content,
      );

      assert.match(
        report.errors.join('\n'),
        /metadata representativeResidual is required/u,
      );
    });
});

describe('work tracker scenario causal closure validation', () => {
  it('requires scenario causal closure on active scenario-driven packages', () => {
    const errors = validateScenarioCausalClosureContract(
      SCENARIO_CAUSAL_CLOSURE_MISSING_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.equal(errors.length, 1);
    assert.match(errors[0], /metadata scenarioCausalClosure is required/u);
  });

  it('accepts concrete scenario causal closure metadata', () => {
    const errors = validateScenarioCausalClosureContract(
      SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.deepEqual(errors, []);
  });

  it('requires active scenario package owner-boundary to match the first frontier',
    () => {
      const matchingMetadata = {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        owner: 'operation_workflow_owner',
        boundary: 'workflow_progress',
      };
      const driftedMetadata = {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        owner: 'startup_active_gate_owner',
        boundary: 'snapshot_coverage',
      };

      assert.deepEqual(
        validateScenarioFrontierOwnerBoundaryContract(
          matchingMetadata,
          WORK_TRACKER_LEDGER_TEST_FILE,
          {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
        ),
        [],
      );
      assert.match(
        validateScenarioFrontierOwnerBoundaryContract(
          driftedMetadata,
          WORK_TRACKER_LEDGER_TEST_FILE,
          {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
        ).join('\n'),
        /owner\/boundary must appear/u,
      );
    });

  it('allows first-frontier owner drift only with explicit migration proof',
    () => {
      const metadata = {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        owner: 'startup_active_gate_owner',
        boundary: 'snapshot_coverage',
        ownerBoundaryMigrationProof: {
          fromOwner: 'operation_workflow_owner',
          fromBoundary: 'workflow_progress',
          toOwner: 'startup_active_gate_owner',
          toBoundary: 'snapshot_coverage',
          reason: 'focused evidence migrated the first frontier',
          evidence:
            'npm run analyze:topology-convergence -- report.json --explain edge',
        },
      };

      assert.deepEqual(
        validateScenarioFrontierOwnerBoundaryContract(
          metadata,
          WORK_TRACKER_LEDGER_TEST_FILE,
          {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
        ),
        [],
      );
    });

  it('requires causal escalation when a frontier returns to a recent boundary',
    () => {
      const metadata = {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        lane: LANE_RUNTIME_OWNER_BOUNDARY,
        owner: 'startup_active_gate_owner',
        boundary: 'snapshot_coverage',
      };
      const history = [
        {
          filePath: 'work/packages/done-20260514-active-gate.md',
          metadata: {
            scenario: 'rolling-restart',
            owner: 'startup_active_gate_owner',
            boundary: 'snapshot_coverage',
            scenarioCausalClosure: {
              resultClassification: 'migrated',
            },
          },
        },
      ];

      const errors = validateFrontierOscillationContract(
        metadata,
        WORK_TRACKER_LEDGER_TEST_FILE,
        {
          packageHistoryEntries: history,
          status: WORK_TRACKER_ACTIVE_STATUS,
        },
      );

      assert.match(errors.join('\n'), /frontier oscillation detected/u);
      assert.match(errors.join('\n'), /causal-escalation/u);
    });

  it('allows selected runtime successors after an oscillation gate', () => {
    const metadata = {
      ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
      lane: LANE_RUNTIME_OWNER_BOUNDARY,
      owner: 'startup_active_gate_owner',
      boundary: 'snapshot_coverage',
      writeScope: ['src/startup/active-gate-owner.js'],
      commitScope: ['src/startup/active-gate-owner.js'],
      architectureDecisionGate: {
        status: 'selected',
        trigger: 'frontier-oscillation',
        triggerEvidence: ['frontier returned after causal classifier'],
        choices: [
          {
            id: 'bounded-runtime-successor',
            summary: 'Run the selected bounded runtime successor.',
            route: 'continue-local-proof',
            proof: ['npm run work:scenario-route -- report.json'],
          },
        ],
        selectedChoice: 'bounded-runtime-successor',
        nextAction: 'Run the runtime successor.',
      },
    };
    const history = [
      {
        filePath: 'work/packages/done-20260514-active-gate.md',
        metadata: {
          scenario: 'rolling-restart',
          owner: 'startup_active_gate_owner',
          boundary: 'snapshot_coverage',
          scenarioCausalClosure: {
            resultClassification: 'migrated',
          },
        },
      },
    ];

    const errors = validateFrontierOscillationContract(
      metadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        packageHistoryEntries: history,
        status: WORK_TRACKER_ACTIVE_STATUS,
      },
    );

    assert.deepEqual(errors, []);
  });

  it('accepts causal escalation when oscillation handoff fields are recorded',
    () => {
      const metadata = {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        lane: LANE_CAUSAL_ESCALATION,
        owner: 'startup_active_gate_owner',
        boundary: 'snapshot_coverage',
        scenarioCausalClosure: {
          ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA.scenarioCausalClosure,
          recentFrontierHistory: [
            'startup_active_gate_owner / snapshot_coverage migrated',
            'topology_publication_owner / publication_convergence migrated',
          ],
          oscillationCheck:
            'frontier returned to startup_active_gate_owner / snapshot_coverage',
          handoffInvariant:
            'publication owner outcome must be fresh before active-gate snapshot selection',
        },
      };
      const history = [
        {
          filePath: 'work/packages/done-20260514-active-gate.md',
          metadata: {
            scenario: 'rolling-restart',
            owner: 'startup_active_gate_owner',
            boundary: 'snapshot_coverage',
            scenarioCausalClosure: {
              resultClassification: 'migrated',
            },
          },
        },
      ];

      const errors = validateFrontierOscillationContract(
        metadata,
        WORK_TRACKER_LEDGER_TEST_FILE,
        {
          packageHistoryEntries: history,
          status: WORK_TRACKER_ACTIVE_STATUS,
        },
      );

      assert.deepEqual(errors, []);
    });

  it('requires handoff fields on causal escalation oscillation packages',
    () => {
      const metadata = {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        lane: LANE_CAUSAL_ESCALATION,
        owner: 'startup_active_gate_owner',
        boundary: 'snapshot_coverage',
      };
      const history = [
        {
          filePath: 'work/packages/done-20260514-active-gate.md',
          metadata: {
            scenario: 'rolling-restart',
            owner: 'startup_active_gate_owner',
            boundary: 'snapshot_coverage',
            scenarioCausalClosure: {
              resultClassification: 'migrated',
            },
          },
        },
      ];

      const errors = validateFrontierOscillationContract(
        metadata,
        WORK_TRACKER_LEDGER_TEST_FILE,
        {
          packageHistoryEntries: history,
          status: WORK_TRACKER_ACTIVE_STATUS,
        },
      );
      const rendered = errors.join('\n');

      assert.match(rendered, /recentFrontierHistory/u);
      assert.match(rendered, /oscillationCheck/u);
      assert.match(rendered, /handoffInvariant/u);
    });

  it('rejects placeholders, empty arrays, invalid classifications, and missing progress proof',
    () => {
      const errors = validateScenarioCausalClosureContract(
        SCENARIO_CAUSAL_CLOSURE_INVALID_METADATA,
        WORK_TRACKER_LEDGER_TEST_FILE,
        {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
      );
      const rendered = errors.join('\n');

      assert.match(rendered, /referenceScenarioOrProbe/u);
      assert.match(rendered, /phaseChain must be a non-empty array/u);
      assert.match(rendered, /knownDownstreamBlockers\[0\]/u);
      assert.match(rendered, /currentFirstFrontier/u);
      assert.match(rendered, /missingCausalEdge/u);
      assert.match(rendered, /missingCausalEdgeProbe must name a focused command/u);
      assert.match(rendered, /expectedNextFrontier/u);
      assert.match(rendered, /boundedProgressProofArtifact/u);
      assert.match(rendered, /expectedObservableTransition/u);
      assert.match(rendered, /maxProgressBound/u);
      assert.match(rendered, /sameFrontierFallback/u);
      assert.match(rendered, /resultClassification must be one of/u);
      assert.match(rendered, /stopCondition must be one of/u);
      assert.match(rendered, /boundedProgressProof must mention/u);
    });

  it('includes scenario causal closure in current-blocker payload and markdown',
    () => {
      const metadata = {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        schema: 'work-package-v1',
        lane: LANE_RUNTIME_OWNER_BOUNDARY,
        owner: 'workflow_tooling_owner',
        boundary: 'scenario_causal_closure',
        nextAction: 'Keep causal closure visible in handoff.',
        writeScope: ['scripts/work-tracker.js'],
        handoffFiles: ['work/packages/done-test-package.md'],
        generatedFiles: ['work/sprints/current-blocker.md'],
        candidateRuntimeFiles: ['src/example.js'],
        commitScope: ['scripts/work-tracker.js', 'work/sprints/current-blocker.md'],
        modelFit: {
          packageClass: 'representative-frontier-closure',
          intendedMinimumModel: 'gpt-5.3-codex',
          scopeShape: 'owner-boundary-contraction/current-frontier',
          outputProfile: 'medium',
          escalationTriggers: ['scope expands'],
        },
        representativeResidual: {
          status: 'red',
          scenario: 'rolling-restart',
          artifact: 'test-output/reports/current-red.report.json',
          frontier: 'active_gate_snapshot_coverage',
          owner: 'startup_active_gate_owner',
          boundary: 'snapshot_coverage',
          dominantReason: 'snapshot_coverage_incomplete',
          nextAction: 'keep representative residual visible',
        },
        classificationEfficiency: {
          defaultMode: 'inline-gate-default',
          separatePackageReason: 'tracker-truth-change',
          artifactBudget: 'one-artifact',
          proofCommandBudget: 'two-or-three-canonical-commands',
          commands: ['npm run work:scenario-route -- test-output/reports/current-red.report.json'],
          decisionRecord: 'current package edge card',
          successorAction: 'update-current-package',
          runtimePromotionRule: 'runtime-owner-boundary only after stable route',
        },
      };
      const payload = buildCurrentBlockerPayload(
        'work/sprints/active-test.md',
        WORK_TRACKER_LEDGER_TEST_FILE,
        metadata,
      );
      const rendered = renderCurrentBlockerMarkdown(payload);

      assert.equal(
        payload.scenarioCausalClosure.resultClassification,
        'classification-only',
      );
      assert.equal(payload.lane, LANE_RUNTIME_OWNER_BOUNDARY);
      assert.equal(payload.modelFit.outputProfile, 'medium');
      assert.deepEqual(payload.writeScope, ['scripts/work-tracker.js']);
      assert.deepEqual(payload.handoffFiles, ['work/packages/done-test-package.md']);
      assert.deepEqual(payload.generatedFiles, ['work/sprints/current-blocker.md']);
      assert.deepEqual(payload.candidateRuntimeFiles, ['src/example.js']);
      assert.deepEqual(payload.commitScope, [
        'scripts/work-tracker.js',
        'work/sprints/current-blocker.md',
      ]);
      assert.equal(payload.representativeResidual.status, 'red');
      assert.equal(
        payload.classificationEfficiency.defaultMode,
        'inline-gate-default',
      );
      assert.equal(
        payload.representativeResidual.frontier,
        'active_gate_snapshot_coverage',
      );
      assert.match(rendered, /## Theory And Implementation Focus/u);
      assert.match(rendered, /Theory under test/u);
      assert.match(rendered, /Implementation slice/u);
      assert.match(rendered, /Implementation files/u);
      assert.match(rendered, /src\/example\.js/u);
      assert.match(rendered, /Falsifying probe/u);
      assert.match(rendered, /Workflow lane/u);
      assert.match(rendered, /Output profile/u);
      assert.match(rendered, /## Scope/u);
      assert.match(rendered, /Write scope/u);
      assert.match(rendered, /Commit scope/u);
      assert.match(rendered, /## Representative Residual/u);
      assert.match(rendered, /active_gate_snapshot_coverage/u);
      assert.match(rendered, /## Scenario Causal Closure/u);
      assert.match(rendered, /Reference scenario\/probe/u);
      assert.match(rendered, /startup_active_gate_owner snapshot coverage/u);
      assert.match(rendered, /Missing causal edge probe/u);
      assert.match(rendered, /Bounded progress proof artifact/u);
      assert.match(rendered, /Expected observable transition/u);
      assert.match(rendered, /Max progress bound/u);
      assert.match(rendered, /Same-frontier fallback/u);
      assert.match(rendered, /classification-only-stop/u);
      assert.match(rendered, /## Classification Efficiency/u);
      assert.match(rendered, /update-current-package/u);
    });

  it('renders and refreshes the active sprint current edge card', () => {
    const payload = buildCurrentBlockerPayload(
      'work/sprints/active-test.md',
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        schema: 'work-package-v1',
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_CAUSAL_ESCALATION,
        artifact: 'test-output/reports/current.report.json',
        playback: 'none',
        owner: 'topology_publication_owner',
        boundary: 'publication_convergence',
        dominantReason: 'publication_pending',
        currentState: 'Current package state.',
        nextAction: 'Build focused proof.',
        proof: [
          'npm run work:evidence-summary -- test-output/reports/current.report.json',
        ],
        writeScope: ['work/packages/active-test-package.md'],
        handoffFiles: [],
        generatedFiles: ['work/sprints/current-blocker.json'],
        candidateRuntimeFiles: ['src/example.js'],
        commitScope: ['work/packages/active-test-package.md'],
        modelFit: {
          packageClass: 'representative-frontier-closure',
          intendedMinimumModel: 'gpt-5.3-codex',
          scopeShape: 'scenario-causal-escalation',
          outputProfile: 'medium',
          escalationTriggers: ['scope expands'],
        },
        representativeResidual: {
          status: 'same-frontier',
          scenario: 'rolling-restart',
          artifact: 'test-output/reports/current.report.json',
          frontier: 'publication_ack_convergence',
          owner: 'topology_publication_owner',
          boundary: 'publication_convergence',
          dominantReason: 'publication_pending',
          nextAction: 'keep edge visible',
        },
      },
    );
    const staleSprint = [
      '# Sprint',
      '',
      '## Current Edge Card',
      '',
      '```text',
      'Representative artifact: test-output/reports/old.report.json',
      'Selected cause: missing_published_nodes_present',
      '```',
      '',
      '## Package Queue',
      '',
      '1. Keep this section.',
      '',
    ].join('\n');
    const refreshedSprint = upsertSprintCurrentEdgeCard(staleSprint, payload);

    assert.match(
      refreshedSprint,
      /Representative artifact: test-output\/reports\/current\.report\.json/u,
    );
    assert.match(refreshedSprint, /Selected cause: publication_pending/u);
    assert.match(
      refreshedSprint,
      /Active package: work\/packages\/active-test-package\.md/u,
    );
    assert.match(refreshedSprint, /## Package Queue/u);
    assert.doesNotMatch(refreshedSprint, /old\.report\.json/u);
    assert.doesNotMatch(refreshedSprint, /missing_published_nodes_present/u);
  });

  it('reports a stale active sprint current edge card', () => {
    const payload = buildCurrentBlockerPayload(
      'work/sprints/active-test.md',
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        schema: 'work-package-v1',
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_CAUSAL_ESCALATION,
        artifact: 'test-output/reports/current.report.json',
        playback: 'none',
        owner: 'topology_publication_owner',
        boundary: 'publication_convergence',
        dominantReason: 'publication_pending',
        currentState: 'Current package state.',
        nextAction: 'Build focused proof.',
        proof: [
          'npm run work:evidence-summary -- test-output/reports/current.report.json',
        ],
        writeScope: ['work/packages/active-test-package.md'],
        handoffFiles: [],
        generatedFiles: ['work/sprints/current-blocker.json'],
        candidateRuntimeFiles: [],
        commitScope: ['work/packages/active-test-package.md'],
        modelFit: {
          packageClass: 'representative-frontier-closure',
          intendedMinimumModel: 'gpt-5.3-codex',
          scopeShape: 'scenario-causal-escalation',
          outputProfile: 'medium',
          escalationTriggers: ['scope expands'],
        },
      },
    );
    const validCard = renderCurrentEdgeCardSection(payload);
    const staleCard = validCard
      .replace('test-output/reports/current.report.json', 'old.report.json')
      .replace('publication_pending', 'missing_published_nodes_present');
    const staleErrors = validateSprintCurrentEdgeCard(
      staleCard,
      'work/sprints/active-test.md',
      payload,
    ).join('\n');

    assert.deepEqual(
      validateSprintCurrentEdgeCard(
        validCard,
        'work/sprints/active-test.md',
        payload,
      ),
      [],
    );
    assert.match(staleErrors, /Current Edge Card is stale/u);
    assert.match(staleErrors, /artifact/u);
    assert.match(staleErrors, /dominant reason/u);
    assert.match(staleErrors, /npm run work:repair/u);
  });

  it('discovers the active package from the generated Current Edge Card', () => {
    const sprintContent = [
      '# Sprint',
      '',
      'The current active package is',
      '  [Old Gate](../packages/active-old-gate.md).',
      '',
      '## Current Edge Card',
      '',
      '```text',
      'Active package: work/packages/active-current-gate.md',
      'Active package owner: topology_publication_owner',
      '```',
      '',
    ].join('\n');

    assert.equal(
      findActivePackageLinkInSprint(sprintContent),
      'work/packages/active-current-gate.md',
    );
  });

  it('resolves sprint active package references from card and markdown paths',
    () => {
      assert.equal(
        path.relative(process.cwd(), resolveSprintPackageReference(
          'work/sprints/active-sprint.md',
          'work/packages/active-current-gate.md',
        )),
        'work/packages/active-current-gate.md',
      );
      assert.equal(
        path.relative(process.cwd(), resolveSprintPackageReference(
          'work/sprints/active-sprint.md',
          '../packages/active-current-gate.md',
        )),
        'work/packages/active-current-gate.md',
      );
    });
});

describe('work tracker current blocker snapshot validation', () => {
  it('accepts a current-blocker snapshot that matches the active package', () => {
    const errors = validateCurrentBlockerSnapshot(
      {
        schema: 'current-blocker-v1',
        sprint: 'work/sprints/active-test.md',
        package: WORK_TRACKER_LEDGER_TEST_FILE,
        status: WORK_TRACKER_ACTIVE_STATUS,
      },
      {
        activeSprintFile: 'work/sprints/active-test.md',
        activePackageFile: WORK_TRACKER_LEDGER_TEST_FILE,
        packageExists: true,
      },
    );

    assert.deepEqual(errors, []);
  });

  it('accepts a current-blocker snapshot sourced from a track next package', () => {
    const errors = validateCurrentBlockerSnapshot(
      {
        schema: 'current-blocker-v1',
        sprint: 'none',
        package: WORK_TRACKER_LEDGER_TEST_FILE,
        status: WORK_TRACKER_ACTIVE_STATUS,
      },
      {
        activeSprintFile: null,
        activePackageFile: WORK_TRACKER_LEDGER_TEST_FILE,
        packageExists: true,
      },
    );

    assert.deepEqual(errors, []);
  });

  it('reports stale current-blocker field values with the repair command', () => {
    const expectedPayload = buildCurrentBlockerPayload(
      'work/sprints/active-test.md',
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        schema: 'work-package-v1',
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_CAUSAL_ESCALATION,
        artifact: 'test-output/reports/current.report.json',
        playback: 'none',
        owner: 'topology_publication_owner',
        boundary: 'publication_convergence',
        dominantReason: 'publication_pending',
        currentState: 'Current package state.',
        nextAction: 'Build focused proof.',
        proof: ['npm run work:evidence-summary -- test-output/reports/current.report.json'],
        writeScope: ['work/packages/active-test-package.md'],
        handoffFiles: [],
        generatedFiles: ['work/sprints/current-blocker.json'],
        candidateRuntimeFiles: [],
        commitScope: ['work/packages/active-test-package.md'],
        modelFit: {
          packageClass: 'representative-frontier-closure',
          intendedMinimumModel: 'gpt-5.3-codex',
          scopeShape: 'scenario-causal-escalation',
          outputProfile: 'medium',
          escalationTriggers: ['scope expands'],
        },
      },
    );
    const stalePayload = {
      ...expectedPayload,
      artifact: 'test-output/reports/stale.report.json',
      modelFit: {
        ...expectedPayload.modelFit,
        packageClass: 'unknown',
      },
    };
    const errors = validateCurrentBlockerPayloadFreshness(
      stalePayload,
      expectedPayload,
    ).join('\n');

    assert.match(errors, /current-blocker snapshot is stale/u);
    assert.match(errors, /artifact/u);
    assert.match(errors, /modelFit\.packageClass/u);
    assert.match(errors, /npm run work:repair/u);
  });

  it('reports stale current-blocker package paths with the repair command', () => {
    const errors = validateCurrentBlockerSnapshot(
      {
        schema: 'current-blocker-v1',
        sprint: 'work/sprints/active-test.md',
        package: WORK_TRACKER_DONE_TEST_FILE,
        status: WORK_TRACKER_DONE_STATUS,
      },
      {
        activeSprintFile: 'work/sprints/active-test.md',
        activePackageFile: WORK_TRACKER_LEDGER_TEST_FILE,
        packageExists: false,
      },
    ).join('\n');

    assert.match(errors, /does not exist/u);
    assert.match(errors, /must be an active-\*/u);
    assert.match(errors, /does not match discovered active package/u);
    assert.match(errors, /npm run work:repair/u);
  });

  it('reports stale active package and sprint references in track handoffs',
    () => {
      const trackContent = [
        '# Track',
        '',
        '- Active sprint: `work/sprints/active-missing-sprint.md`',
        '- Active package: `work/packages/active-missing-package.md`',
        '- Existing package: `work/packages/active-existing-package.md`',
      ].join('\n');
      const errors = validateActiveWorkReferences(
        trackContent,
        'work/tracks/topology-convergence.md',
        {
          existingPaths: [
            'work/packages/active-existing-package.md',
          ],
        },
      ).join('\n');

      assert.match(errors, /active-missing-sprint\.md/u);
      assert.match(errors, /active-missing-package\.md/u);
      assert.doesNotMatch(errors, /active-existing-package\.md/u);
      assert.match(errors, /update track handoffs/u);
    });

  it('resolves relative active package links from generated handoff markdown',
    () => {
      const handoffContent = [
        '# Current Blocker',
        '',
        'Current active package:',
        '[Package](../packages/active-current-package.md)',
      ].join('\n');
      const errors = validateActiveWorkReferences(
        handoffContent,
        WORK_TRACKER_CURRENT_BLOCKER_MARKDOWN,
        {
          existingPaths: [
            'work/packages/active-current-package.md',
          ],
        },
      );

      assert.deepEqual(errors, []);
    });

  it('allows a failed current-blocker handoff when no active sprint is open',
    () => {
      const errors = validateCurrentBlockerSnapshot(
        {
          schema: 'current-blocker-v1',
          sprint: 'work/sprints/archived/done-test-failed.md',
          package: 'work/packages/todo-test-package.md',
          status: 'failed',
        },
        {
          allowClosed: true,
          packageExists: true,
        },
      );

      assert.deepEqual(errors, []);
    });
});

describe('work tracker active scenario metadata shape', () => {
  it('reports missing handoff metadata before current-blocker renders unknowns',
    () => {
      const content = [
        '# Active Scenario Package',
        '',
        '<!-- work-package',
        JSON.stringify({
          schema: 'work-package-v1',
          status: WORK_TRACKER_ACTIVE_STATUS,
          opened: '2026-05-15',
          lane: LANE_CAUSAL_ESCALATION,
          scenario: 'rolling-restart',
          owner: 'topology_publication_owner',
          boundary: 'publication_convergence',
          currentState: 'Package has enough prose to render.',
          nextAction: 'Repair metadata before generating handoff.',
          proof: [],
          writeScope: [],
          handoffFiles: [],
          generatedFiles: [],
          candidateRuntimeFiles: [],
          commitScope: [],
        }, null, 2),
        '-->',
        '',
      ].join('\n');
      const result = buildPackageDoctorLines(
        WORK_TRACKER_ACTIVE_DOCTOR_FILE,
        content,
      );
      const errors = result.errors.join('\n');

      assert.match(errors, /metadata artifact must be concrete/u);
      assert.match(errors, /metadata playback must be concrete/u);
      assert.match(errors, /metadata dominantReason must be concrete/u);
      assert.match(errors, /metadata proof must not be empty/u);
      assert.match(errors, /metadata modelFit must be an object/u);
    });
});
