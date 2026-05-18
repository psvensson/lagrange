import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCurrentBlockerPayload,
  buildPackageDoctorLines,
  isGeneratedCurrentBlockerPath,
  metadataRequiresSubagentSequencing,
  renderCurrentBlockerMarkdown,
  validateActiveWorkReferences,
  validateCausalGovernanceContract,
  validateCommitAndPushLedger,
  validateCurrentBlockerPayloadFreshness,
  validateCurrentBlockerSnapshot,
  validateFrontierOscillationContract,
  validateModelFitContract,
  validateRepresentativeResidualContract,
  validateScenarioCausalClosureContract,
  validateScenarioFrontierOwnerBoundaryContract,
  validateSubagentSequencingLedger,
} from '../../scripts/work-tracker.js';

const WORK_TRACKER_LEDGER_TEST_FILE = 'work/packages/active-test-package.md';
const WORK_TRACKER_LEDGER_LOCAL_PATH_TEST_FILE =
  'work/packages/active-20260511-active-gate-local-blocker-frontier.md';
const WORK_TRACKER_DONE_TEST_FILE = 'work/packages/done-test-package.md';
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
const LANE_LIGHTWEIGHT_MAINTENANCE = 'lightweight-maintenance';
const LANE_DIAGNOSTIC_CLASSIFICATION = 'diagnostic-classification';
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
  '      `work/packages/active-test-package.md`.',
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
  '      `work/packages/active-test-package.md`.',
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
  '      `work/packages/active-test-package.md`.',
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
  '      `work/packages/active-test-package.md`.',
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
  '      `work/packages/active-test-package.md`.',
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
  '      `work/packages/active-20260511-active-gate-local-blocker-frontier.md`.',
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
  '      `work/packages/active-test-package.md`.',
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
  `      \`${WORK_TRACKER_ACTIVE_DOCTOR_FILE}\`.`,
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
      metadataRequiresSubagentSequencing({lane: LANE_LIGHTWEIGHT_MAINTENANCE}),
      false,
    );
    assert.equal(
      metadataRequiresSubagentSequencing({lane: LANE_DIAGNOSTIC_CLASSIFICATION}),
      false,
    );
    assert.equal(
      metadataRequiresSubagentSequencing({lane: LANE_RUNTIME_OWNER_BOUNDARY}),
      true,
    );
    assert.equal(metadataRequiresSubagentSequencing({}), true);
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

  it('allows done historical packages without the new ledger', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: false},
    );

    assert.deepEqual(errors, []);
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

  it('accepts a fixes-required review with a separate real fix agent', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_FIXES_REQUIRED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.deepEqual(errors, []);
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

  it('reports non-real identity words anywhere in checked strict entries', () => {
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

  it('does not require subagent ledger proof at entry phase', () => {
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

    assert.deepEqual(entryReport.errors, []);
    assert.match(preImplReport.errors.join('\n'), /has open items/u);
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
      assert.match(errors.join('\n'), /closed packages must classify/u);
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
        payload.representativeResidual.frontier,
        'active_gate_snapshot_coverage',
      );
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
    assert.match(errors, /npm run work:current-blocker -- --write/u);
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
    assert.match(errors, /npm run work:current-blocker -- --write/u);
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
