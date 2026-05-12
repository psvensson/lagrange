import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCurrentBlockerPayload,
  buildPackageDoctorLines,
  isGeneratedCurrentBlockerPath,
  metadataRequiresSubagentSequencing,
  renderCurrentBlockerMarkdown,
  validateCausalGovernanceContract,
  validateCommitAndPushLedger,
  validateModelFitContract,
  validateScenarioCausalClosureContract,
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
const LANE_RUNTIME_OWNER_BOUNDARY = 'runtime-owner-boundary';
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
const WORK_TRACKER_DOCTOR_CONTENT = [
  '# Test Package',
  '',
  '<!-- work-package',
  JSON.stringify({
    schema: 'work-package-v1',
    status: 'active',
    scenario: 'none',
    owner: 'workflow_tooling_owner',
    boundary: 'package_doctor',
    dominantReason: 'doctor_needed',
    currentState: 'Doctor command needs a compact package summary.',
    nextAction: 'Run package doctor.',
    proof: ['node --test test/scripts/work-tracker-subagent-ledger.test.js'],
    writeScope: ['scripts/work-tracker.js'],
    commitScope: ['scripts/work-tracker.js'],
    modelFit: {
      packageClass: 'bounded-implementation',
      intendedMinimumModel: 'gpt-5.3-codex-spark',
      scopeShape: 'leaf-slice',
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
    assert.match(rendered, /Write scope: 1/u);
    assert.match(rendered, /Legacy touched files: 0/u);
    assert.match(rendered, /Validation: ok/u);
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
      {requiresLedger: false},
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
      assert.deepEqual(payload.writeScope, ['scripts/work-tracker.js']);
      assert.deepEqual(payload.handoffFiles, ['work/packages/done-test-package.md']);
      assert.deepEqual(payload.generatedFiles, ['work/sprints/current-blocker.md']);
      assert.deepEqual(payload.candidateRuntimeFiles, ['src/example.js']);
      assert.deepEqual(payload.commitScope, [
        'scripts/work-tracker.js',
        'work/sprints/current-blocker.md',
      ]);
      assert.match(rendered, /Workflow lane/u);
      assert.match(rendered, /## Scope/u);
      assert.match(rendered, /Write scope/u);
      assert.match(rendered, /Commit scope/u);
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
