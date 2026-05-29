import fs from 'node:fs/promises';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  buildBootstrapLines,
  buildContextLines,
  buildCommitScope,
  buildCurrentBlockerFromPackage,
  buildDirtyScopeLines,
  buildFirstReadPaths,
  buildModelFitContext,
  buildOwnerCardPaths,
  buildTheoryImplementationFocus,
  buildSubagentSequencingStatus,
  buildUsefulCommands,
  buildWriteScope,
  groupGitStatusLines,
} from '../../scripts/work-context.js';

const TEST_PACKAGE_PATH = 'work/packages/active-20260507-test-package.md';
const TEST_SPRINT_PATH = 'work/sprints/active-2026-q2-test-sprint.md';
const TEST_PREDECESSOR_PATH = 'work/packages/done-20260507-test-predecessor.md';
const TEST_ARTIFACT_PATH = 'test-output/reports/example.report.json';
const TEST_PLAYBACK_PATH = 'test-output/reports/.playback/example/rolling-restart/';
const TEST_BOOTSTRAP_SOURCE_PATH = 'src/bootstrap/phases/contact-seed-phase.js';
const TEST_BOOTSTRAP_TEST_PATH = 'test/bootstrap/node-joining-service.test.js';
const TEST_PACKAGE_CONTENT = [
  '# Test Package',
  '',
  '## Model Fit',
  '',
  '- Package class: `bounded-implementation`',
  '- Intended minimum model: `gpt-5.3-codex-spark`',
  '- Scope shape: `leaf-slice`',
  '- Output profile: `medium`',
  '- Escalation triggers: package scope expands beyond bootstrap files.',
  '',
  '## Out Of Scope',
  '',
  '- Runtime behavior changes.',
  '',
].join('\n');
const TEST_LIGHTWEIGHT_PACKAGE_CONTENT = [
  '# Lightweight Package',
  '',
  '<!-- work-package',
  JSON.stringify({
    schema: 'work-package-v1',
    status: 'active',
    lane: 'lightweight-maintenance',
    scenario: 'none',
    owner: 'workflow_tooling_owner',
    boundary: 'steering_pack',
    currentState: 'Core steering pack needs a wording update.',
    nextAction: 'Edit the compact steering pack.',
  }, null, 2),
  '-->',
  '',
].join('\n');
const TEST_LIGHTWEIGHT_CODE_SCOPE_PACKAGE_CONTENT = [
  '# Lightweight Code Scope Package',
  '',
  '<!-- work-package',
  JSON.stringify({
    schema: 'work-package-v1',
    status: 'active',
    lane: 'lightweight-maintenance',
    scenario: 'none',
    owner: 'workflow_tooling_owner',
    boundary: 'steering_pack',
    currentState: 'Workflow tooling needs a focused code update.',
    nextAction: 'Edit the workflow tooling.',
    writeScope: ['scripts/work-context.js'],
    commitScope: ['scripts/work-context.js'],
  }, null, 2),
  '-->',
  '',
].join('\n');
const TEST_LIGHTWEIGHT_CODE_SCOPE_IMPLEMENTED_CONTENT = [
  TEST_LIGHTWEIGHT_CODE_SCOPE_PACKAGE_CONTENT,
  '## Execution Evidence',
  '',
  '- [x] implementation: status: validated; evidence: node --test test/scripts/work-context.test.js; parent revalidated focused proof: yes; next: verification.',
  '',
].join('\n');
const TEST_LIGHTWEIGHT_CODE_SCOPE_INVALID_IMPLEMENTATION_CONTENT = [
  TEST_LIGHTWEIGHT_CODE_SCOPE_PACKAGE_CONTENT,
  '## Execution Evidence',
  '',
  '- [x] implementation: status: validated; evidence: node --test test/scripts/work-context.test.js; next: verification.',
  '',
].join('\n');
const TEST_LIGHTWEIGHT_CODE_SCOPE_VERIFIED_CONTENT = [
  TEST_LIGHTWEIGHT_CODE_SCOPE_PACKAGE_CONTENT,
  '## Execution Evidence',
  '',
  '- [x] implementation: status: validated; evidence: node --test test/scripts/work-context.test.js; parent revalidated focused proof: yes; next: verification.',
  '- [x] verification-fix: status: validated; evidence: node --test test/scripts/work-context.test.js; changed files: none; parent revalidated focused proof: yes; next: closure.',
  '',
].join('\n');
const TEST_LIGHTWEIGHT_CODE_SCOPE_INVALID_VERIFICATION_CONTENT = [
  TEST_LIGHTWEIGHT_CODE_SCOPE_PACKAGE_CONTENT,
  '## Execution Evidence',
  '',
  '- [x] implementation: status: validated; evidence: node --test test/scripts/work-context.test.js; parent revalidated focused proof: yes; next: verification.',
  '- [x] verification-fix: status: validated; evidence: node --test test/scripts/work-context.test.js; parent revalidated focused proof: yes; next: closure.',
  '',
].join('\n');
const REVIEW_AGENT_ID = '019e02b6-1920-7130-b040-da2e6f4efbc4';
const FIX_AGENT_ID = '019e02b7-ece3-73a2-a664-389d40dfd575';
const FRESHNESS_AGENT_ID = '019e02b8-1111-7333-a444-389d40dfd575';
const IMPLEMENTATION_AGENT_ID = '019e02b9-7651-7851-bc85-a0cef8a90176';
const TEST_STRICT_PACKAGE_CONTENT = [
  '# Strict Package',
  '',
  '<!-- work-package',
  JSON.stringify({
    schema: 'work-package-v1',
    status: 'active',
    lane: 'runtime-owner-boundary',
    scenario: 'none',
    owner: 'workflow_tooling_owner',
    boundary: 'subagent_freshness',
    currentState: 'Strict package needs fresh context.',
    nextAction: 'Check freshness before implementation.',
  }, null, 2),
  '-->',
  '',
].join('\n');
const TEST_STRICT_PACKAGE_FRESH_CONTENT = [
  TEST_STRICT_PACKAGE_CONTENT,
  '## Execution Evidence',
  '',
  '- [x] action: freshness-review; owner: Agent Freshness (' +
    FRESHNESS_AGENT_ID +
    '); files-changed: none; validation: npm run work:context; decision: fresh; outcome: validated.',
  '',
].join('\n');
const TEST_PACKAGE_REVIEW_ONLY_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `clean`.',
  '',
].join('\n');
const TEST_PACKAGE_READY_CONTENT = [
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
  '      `work/packages/active-20260507-test-package.md`; parent revalidated focused proof: yes.',
  '',
].join('\n');
const TEST_PACKAGE_EXECUTION_EVIDENCE_READY_CONTENT = [
  '# Test Package',
  '',
  '## Execution Evidence',
  '',
  '- [x] implementation: status: validated; evidence: npm test -- test/example.test.js; parent revalidated focused proof: yes; next: closure.',
  '',
].join('\n');
const TEST_PACKAGE_FIRST_IN_SPRINT_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded: `not-needed` (`first-package-in-sprint`).',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-20260507-test-package.md`; parent revalidated focused proof: yes.',
  '',
].join('\n');
const TEST_PACKAGE_ROLE_ORDER_INVALID_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `fixes-required`.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-20260507-test-package.md`; parent revalidated focused proof: yes.',
  '- [x] Fix subagent recorded or explicitly not needed:',
  `      Agent Fix (${FIX_AGENT_ID}) fixed`,
  '      `work/packages/done-test-package.md`.',
  '',
].join('\n');
const TEST_PACKAGE_IMPLEMENTATION_MISMATCH_CONTENT = [
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
  '      `work/packages/active-20260507-other-package.md`; parent revalidated focused proof: yes.',
  '',
].join('\n');
const TEST_PACKAGE_BAD_FIX_CONSISTENCY_CONTENT = [
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
  '      `work/packages/active-20260507-test-package.md`; parent revalidated focused proof: yes.',
  '',
].join('\n');
const TEST_PACKAGE_REVIEW_FIXED_METADATA_CONTENT = [
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
  '      `work/packages/active-20260507-test-package.md`; parent revalidated focused proof: yes.',
  '',
].join('\n');
const TEST_PACKAGE_SAME_AGENT_REUSE_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `clean`.',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [x] Implementation subagent recorded:',
  `      Agent Review Again (${REVIEW_AGENT_ID}) implemented`,
  '      `work/packages/active-20260507-test-package.md`; parent revalidated focused proof: yes.',
  '',
].join('\n');
const TEST_PACKAGE_MANUAL_FIX_NOTE_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `clean`.',
  '- [x] Fix subagent recorded or explicitly not needed:',
  '      `not-needed`. Manual current session note carried forward.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-20260507-test-package.md`; parent revalidated focused proof: yes.',
  '',
].join('\n');
const TEST_PACKAGE_LOCAL_SESSION_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  '      `Codex local review session 2026-05-07` reviewed',
  '      `work/packages/done-test-package.md` on `owner`.',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [x] Implementation subagent recorded:',
  '      `Codex local implementation session 2026-05-07`.',
  '',
].join('\n');
const TEST_BLOCKER = Object.freeze({
  sprint: TEST_SPRINT_PATH,
  package: TEST_PACKAGE_PATH,
  status: 'active',
  lane: 'runtime-owner-boundary',
  scenario: 'rolling-restart',
  artifact: TEST_ARTIFACT_PATH,
  playback: TEST_PLAYBACK_PATH,
  owner: 'Bootstrap owner',
  boundary: 'Startup join',
  dominantReason: 'bootstrap_not_ready',
  currentState: 'Current state.',
  nextAction: 'Next action.',
  proof: ['Focused proof'],
  touchedFiles: [],
  writeScope: [
    TEST_BOOTSTRAP_SOURCE_PATH,
    TEST_BOOTSTRAP_TEST_PATH,
    TEST_PACKAGE_PATH,
  ],
  handoffFiles: [TEST_PREDECESSOR_PATH],
  generatedFiles: [],
  candidateRuntimeFiles: [],
  commitScope: [
    TEST_BOOTSTRAP_SOURCE_PATH,
    TEST_BOOTSTRAP_TEST_PATH,
    TEST_PACKAGE_PATH,
  ],
  modelFit: {
    packageClass: 'bounded-implementation',
    intendedMinimumModel: 'gpt-5.3-codex-spark',
    scopeShape: 'leaf-slice',
    outputProfile: 'medium',
    escalationTriggers: ['package scope expands beyond bootstrap files'],
  },
  representativeResidual: {
    status: 'red',
    scenario: 'rolling-restart',
    artifact: TEST_ARTIFACT_PATH,
    frontier: 'active_gate_snapshot_coverage',
    owner: 'startup_active_gate_owner',
    boundary: 'snapshot_coverage',
    dominantReason: 'snapshot_coverage_incomplete',
    nextAction: 'keep representative residual visible',
  },
  causalGovernance: {
    hypothesis: 'Causal edge should reduce.',
    stopConditionCheck:
      'npm --silent run analyze:causal-model -- ' + TEST_ARTIFACT_PATH,
    expectedCausalModelChange: 'edge disappears or migrates',
    representativeOutcome: 'pending-before-rerun',
    causalDebt: 'none for this synthetic package',
    crossBoundaryReview: 'not due',
  },
  scenarioCausalClosure: {
    referenceScenarioOrProbe: 'rolling-restart focused blocker probe',
    phaseChain: [
      'startup',
      'operation workflow dispatch',
      'active gate',
    ],
    currentFirstFrontier:
      'operation_workflow_owner / workflow_progress / retryable',
    knownDownstreamBlockers: [
      'startup_active_gate_owner / snapshot_coverage',
    ],
    missingCausalEdge: 'dispatch wake proof',
    missingCausalEdgeProbe:
      'npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js',
    boundedProgressProof: 'wake and retry proof must be bounded',
    boundedProgressProofArtifact:
      'test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js',
    expectedObservableTransition:
      'dispatch-pending workflow progress advances to retry-scheduled proof',
    maxProgressBound: 'one owner wake retry timeout dispatch cycle',
    sameFrontierFallback:
      'keep operation_workflow_owner / workflow_progress as first frontier',
    expectedNextFrontier: 'startup_active_gate_owner / snapshot_coverage',
    resultClassification: 'pending-before-probe',
    stopCondition: 'continue-local-fix',
  },
  predecessor: TEST_PREDECESSOR_PATH,
});
const COMPACT_PACK_README_PATH = '.kiro/steering/llm/README.md';
const COMPACT_PACK_CORE_PATH = '.kiro/steering/llm/core.md';
const COMPACT_ARCHITECTURE_PACK_PATH = '.kiro/steering/llm/architecture.md';
const COMPACT_TESTING_PACK_PATH = '.kiro/steering/llm/testing.md';
const COMPACT_STYLE_PACK_PATH = '.kiro/steering/llm/style.md';
const COMPACT_GOVERNANCE_PACK_PATH = '.kiro/steering/llm/governance.md';
const FULL_STEERING_SYSTEM_PATH = '.kiro/steering/system guidelines.md';
const BOOTSTRAP_OWNER_CARD_PATH = 'src/bootstrap/README.md';
const PLAYBACK_FAILURE_BUNDLE_PATH = TEST_PLAYBACK_PATH + 'failure-bundle.json';
const WORK_CONTEXT_COMMAND = 'npm run work:current-blocker';
const WORK_ADVANCE_COMMAND = 'npm run work:advance';
const WORK_LLM_START_COMMAND = 'npm run work:llm-start';
const WORK_VALIDATE_COMMAND = 'npm run work:validate';
const WORK_SUBAGENT_NEXT_COMMAND = 'npm run work:subagent-next';
const WORK_THEORY_LEDGER_LIST_COMMAND = 'npm run work:theory-ledger -- list';
const PACKAGE_DOCTOR_COMMAND =
  'npm run work:package:doctor -- ' + TEST_PACKAGE_PATH;
const PACKAGE_DOCTOR_SUGGEST_COMMAND =
  'npm run work:package:doctor -- --suggest ' + TEST_PACKAGE_PATH;
const EVIDENCE_SUMMARY_ARTIFACT_COMMAND =
  'npm run work:evidence-summary -- ' + TEST_ARTIFACT_PATH;
const SCENARIO_TRIAGE_COMMAND =
  'npm run work:scenario-triage -- ' + TEST_ARTIFACT_PATH;
const PRIORITY_RECOVERY_RESIDUALS_COMMAND =
  'npm run analyze:priority-recovery-residuals -- ' + TEST_ARTIFACT_PATH;
const EVIDENCE_SUMMARY_PLAYBACK_COMMAND =
  'npm run work:evidence-summary -- ' + PLAYBACK_FAILURE_BUNDLE_PATH;
const DISTRIBUTED_FAILURE_COMMAND =
  'npm run analyze:distributed-failure -- --report ' + TEST_ARTIFACT_PATH;
const TOPOLOGY_ARTIFACT_COMMAND =
  'npm run analyze:topology-convergence -- ' + TEST_ARTIFACT_PATH;
const CAUSAL_ARTIFACT_COMMAND =
  'npm --silent run analyze:causal-model -- ' + TEST_ARTIFACT_PATH;
const TOPOLOGY_PLAYBACK_COMMAND =
  'npm run analyze:topology-convergence -- ' + PLAYBACK_FAILURE_BUNDLE_PATH;
const CAUSAL_PLAYBACK_COMMAND =
  'npm --silent run analyze:causal-model -- ' + PLAYBACK_FAILURE_BUNDLE_PATH;
const RUNTIME_GRAMMAR_FILE_COMMAND =
  'npm run audit:runtime-grammar:file -- ' + TEST_BOOTSTRAP_SOURCE_PATH;
const RUNTIME_GRAMMAR_BROAD_FILE_COMMAND =
  'npm run audit:runtime-grammar -- ' + TEST_BOOTSTRAP_SOURCE_PATH;
const SECTION_USEFUL_COMMANDS = '## Useful Commands';
const SECTION_FIRST_FILES = '## First Files To Read';
const SECTION_SECONDARY_STEERING = '## Secondary Steering Packs';
const SECTION_THEORY_IMPLEMENTATION = '## Theory And Implementation Focus';
const SECTION_THEORY_LEDGER_REFS = '## Theory Ledger References';
const SECTION_ACTIVE_CONSTRAINTS = '## Active Constraints';
const SECTION_SUBAGENT_SEQUENCING = '## Subagent Sequencing';
const SECTION_SUBAGENT_PROGRESS = '## Subagent Progress';
const SECTION_MODEL_FIT = '## Model Fit';
const SECTION_REPRESENTATIVE_RESIDUAL = '## Representative Residual';
const SECTION_CAUSAL_GOVERNANCE = '## Causal Governance';
const SECTION_SCENARIO_CAUSAL_CLOSURE = '## Scenario Causal Closure';
const SECTION_ARCHITECTURE_DECISION_GATE = '## Architecture Decision Gate';
const DIRTY_SCOPE_TITLE = '# Worktree Package Scope';
const PACKAGE_STATUS_LINE = ' M ' + TEST_BOOTSTRAP_SOURCE_PATH;
const TRACKER_STATUS_LINE = ' M work/sprints/current-blocker.json';
const UNRELATED_STATUS_LINE = ' M README.md';
const CONTROL_PLANE_PUBLICATION_PATTERN = 'src/control-plane/*publication*.js';
const CONTROL_PLANE_PUBLICATION_STATUS_LINE =
  ' M src/control-plane/control-plane-publication.js';
const QUOTED_PACKAGE_PATH = '.kiro/steering/system guidelines.md';
const QUOTED_PACKAGE_STATUS_LINE = ` M "${QUOTED_PACKAGE_PATH}"`;
const UNTRACKED_FIXTURE_DIRECTORY_STATUS_LINE =
  '?? test/scripts/__fixtures__/';
const GIT_STATUS_AVAILABLE = 'git-status-available';
const TEMP_PACKAGE_ROOT = 'test-output/work-context-packages';
const TEMP_PACKAGE_PREFIX = 'work-context-package-';
const TEMP_PACKAGE_FILE_NAME = 'active-20260507-temp-package.md';
const TEMP_OWNER = 'Workflow owner';
const TEMP_BOUNDARY = 'LLM dirty scope';
const TEMP_DOMINANT_REASON = 'dirty_scope_report_needed';

test('work context first-read paths prefer compact pack and owner cards', (t) => {
  const firstReadPaths = buildFirstReadPaths(TEST_BLOCKER);
  const ownerCardPaths = buildOwnerCardPaths(TEST_BLOCKER);

  t.same(buildWriteScope(TEST_BLOCKER), [
    TEST_BOOTSTRAP_SOURCE_PATH,
    TEST_BOOTSTRAP_TEST_PATH,
    TEST_PACKAGE_PATH,
  ]);
  t.same(buildCommitScope(TEST_BLOCKER), [
    TEST_BOOTSTRAP_SOURCE_PATH,
    TEST_BOOTSTRAP_TEST_PATH,
    TEST_PACKAGE_PATH,
  ]);
  t.same(ownerCardPaths, [BOOTSTRAP_OWNER_CARD_PATH]);
  t.equal(firstReadPaths[1], COMPACT_PACK_README_PATH);
  t.equal(firstReadPaths[2], COMPACT_PACK_CORE_PATH);
  t.equal(firstReadPaths[3], COMPACT_ARCHITECTURE_PACK_PATH);
  t.notOk(firstReadPaths.includes(COMPACT_TESTING_PACK_PATH));
  t.notOk(firstReadPaths.includes(COMPACT_GOVERNANCE_PACK_PATH));
  t.ok(firstReadPaths.includes(BOOTSTRAP_OWNER_CARD_PATH));
  t.ok(firstReadPaths.includes(TEST_ARTIFACT_PATH));
  t.ok(firstReadPaths.includes(TEST_PLAYBACK_PATH));
  t.ok(firstReadPaths.includes(PLAYBACK_FAILURE_BUNDLE_PATH));
  t.ok(firstReadPaths.includes(TEST_PREDECESSOR_PATH));
  t.notOk(firstReadPaths.includes(FULL_STEERING_SYSTEM_PATH));
  t.end();
});

test('work context chooses testing as primary pack for test-only scope', (t) => {
  const firstReadPaths = buildFirstReadPaths({
    ...TEST_BLOCKER,
    scenario: 'none',
    artifact: 'none',
    playback: 'none',
    writeScope: [
      TEST_BOOTSTRAP_TEST_PATH,
      TEST_PACKAGE_PATH,
    ],
    handoffFiles: [],
    generatedFiles: [],
    candidateRuntimeFiles: [],
    commitScope: [
      TEST_BOOTSTRAP_TEST_PATH,
      TEST_PACKAGE_PATH,
    ],
  });

  t.equal(firstReadPaths[1], COMPACT_PACK_README_PATH);
  t.equal(firstReadPaths[2], COMPACT_PACK_CORE_PATH);
  t.equal(firstReadPaths[3], COMPACT_TESTING_PACK_PATH);
  t.notOk(firstReadPaths.includes(COMPACT_ARCHITECTURE_PACK_PATH));
  t.end();
});

test('work context chooses style as primary pack for script tooling scope', (t) => {
  const firstReadPaths = buildFirstReadPaths({
    ...TEST_BLOCKER,
    scenario: 'none',
    artifact: 'none',
    playback: 'none',
    writeScope: [
      'scripts/work-context.js',
      'test/scripts/work-context.test.js',
      TEST_PACKAGE_PATH,
    ],
    handoffFiles: [],
    generatedFiles: [],
    candidateRuntimeFiles: [],
    commitScope: [
      'scripts/work-context.js',
      'test/scripts/work-context.test.js',
      TEST_PACKAGE_PATH,
    ],
  });

  t.equal(firstReadPaths[1], COMPACT_PACK_README_PATH);
  t.equal(firstReadPaths[2], COMPACT_PACK_CORE_PATH);
  t.equal(firstReadPaths[3], COMPACT_STYLE_PACK_PATH);
  t.notOk(firstReadPaths.includes(COMPACT_ARCHITECTURE_PACK_PATH));
  t.end();
});

test('work context advertises triage commands before raw artifact reads',
  async (t) => {
    const commands = buildUsefulCommands(TEST_BLOCKER);
    const lines = await buildContextLines(TEST_BLOCKER, TEST_PACKAGE_CONTENT);
    const rendered = lines.join('\n');

    t.equal(commands[0], WORK_CONTEXT_COMMAND);
    t.equal(commands[1], WORK_ADVANCE_COMMAND);
    t.equal(commands[2], WORK_LLM_START_COMMAND);
    t.equal(commands[3], WORK_VALIDATE_COMMAND);
    t.equal(commands[4], WORK_SUBAGENT_NEXT_COMMAND);
    t.equal(commands[5], PACKAGE_DOCTOR_COMMAND);
    t.equal(commands[6], PACKAGE_DOCTOR_SUGGEST_COMMAND);
    t.equal(commands[7], EVIDENCE_SUMMARY_ARTIFACT_COMMAND);
    t.equal(commands[8], SCENARIO_TRIAGE_COMMAND);
    t.ok(commands.includes(DISTRIBUTED_FAILURE_COMMAND));
    t.ok(commands.includes(TOPOLOGY_ARTIFACT_COMMAND));
    t.ok(commands.includes(CAUSAL_ARTIFACT_COMMAND));
    t.ok(commands.includes(PRIORITY_RECOVERY_RESIDUALS_COMMAND));
    t.ok(commands.includes(EVIDENCE_SUMMARY_PLAYBACK_COMMAND));
    t.ok(commands.includes(TOPOLOGY_PLAYBACK_COMMAND));
    t.ok(commands.includes(CAUSAL_PLAYBACK_COMMAND));
    t.ok(commands.includes(RUNTIME_GRAMMAR_FILE_COMMAND));
    t.notOk(commands.includes(RUNTIME_GRAMMAR_BROAD_FILE_COMMAND));
    t.ok(rendered.includes('Playback: ' + TEST_PLAYBACK_PATH + ' (missing)'));
    t.ok(rendered.includes(SECTION_THEORY_IMPLEMENTATION));
    t.ok(rendered.includes('Theory under test: Causal edge should reduce.'));
    t.ok(rendered.includes('Recommended lane: runtime -> runtime-owner-boundary'));
    t.ok(rendered.includes('Causal question: dispatch wake proof'));
    t.ok(rendered.includes('Implementation slice: Next action.'));
    t.ok(rendered.includes(
      'Implementation files: ' + TEST_BOOTSTRAP_SOURCE_PATH,
    ));
    t.ok(rendered.includes(
      'Expected implementation delta: edge disappears or migrates',
    ));
    t.ok(rendered.includes(
      'Falsifying probe: npm test -- test/rebalancer/' +
        'operation-workflow-progress-event-driven-reentry.test.js',
    ));
    t.ok(rendered.includes(SECTION_ACTIVE_CONSTRAINTS));
    t.ok(rendered.includes(
      'Owner boundary: Bootstrap owner / Startup join',
    ));
    t.ok(rendered.includes(
      'Primary steering pack: .kiro/steering/llm/architecture.md (architecture)',
    ));
    t.ok(rendered.includes(
      'Proof ladder: Focused proof',
    ));
    t.ok(rendered.includes(
      'Redirect rule: keep operation_workflow_owner / workflow_progress as first frontier',
    ));
    t.ok(rendered.includes(
      'Steering rule: CORE-02 Work one bounded concern',
    ));
    t.ok(rendered.includes(
      'Steering rule: ARCH-0042 Every runtime state transition',
    ));
    t.ok(rendered.includes(
      'Steering rule: TEST-0085 Distributed artifact triage starts',
    ));
    t.ok(rendered.includes(SECTION_SUBAGENT_SEQUENCING));
    t.ok(rendered.includes(SECTION_SUBAGENT_PROGRESS));
    t.ok(rendered.includes(SECTION_MODEL_FIT));
    t.ok(rendered.includes(SECTION_REPRESENTATIVE_RESIDUAL));
    t.ok(rendered.includes(SECTION_CAUSAL_GOVERNANCE));
    t.ok(rendered.includes(SECTION_SCENARIO_CAUSAL_CLOSURE));
    t.ok(rendered.includes(SECTION_ARCHITECTURE_DECISION_GATE));
    t.ok(rendered.includes('Package class: bounded-implementation'));
    t.ok(rendered.includes('Frontier: active_gate_snapshot_coverage'));
    t.ok(rendered.includes('Next action: keep representative residual visible'));
    t.ok(rendered.includes('## Scope'));
    t.ok(rendered.includes('Write scope: ' + TEST_BOOTSTRAP_SOURCE_PATH));
    t.ok(rendered.includes('Commit scope: ' + TEST_BOOTSTRAP_SOURCE_PATH));
    t.ok(rendered.includes('Intended minimum model: gpt-5.3-codex-spark'));
    t.ok(rendered.includes('Scope shape: leaf-slice'));
    t.ok(rendered.includes('Output profile: medium'));
    t.ok(rendered.includes('Escalation triggers: package scope expands'));
    t.ok(rendered.includes('Causal hypothesis: Causal edge should reduce.'));
    t.ok(rendered.includes('Representative outcome: pending-before-rerun'));
    t.ok(rendered.includes(
      'Reference scenario/probe: rolling-restart focused blocker probe',
    ));
    t.ok(rendered.includes(
      'Known downstream blockers: startup_active_gate_owner / snapshot_coverage',
    ));
    t.ok(rendered.includes(
      'Missing causal edge probe: npm test -- test/rebalancer/' +
        'operation-workflow-progress-event-driven-reentry.test.js',
    ));
    t.ok(rendered.includes(
      'Bounded progress proof artifact: test/rebalancer/' +
        'operation-workflow-progress-event-driven-reentry.test.js',
    ));
    t.ok(rendered.includes(
      'Expected observable transition: dispatch-pending workflow progress ' +
        'advances to retry-scheduled proof',
    ));
    t.ok(rendered.includes(
      'Max progress bound: one owner wake retry timeout dispatch cycle',
    ));
    t.ok(rendered.includes(
      'Same-frontier fallback: keep operation_workflow_owner / ' +
        'workflow_progress as first frontier',
    ));
    t.ok(rendered.includes('Stop condition: continue-local-fix'));
    t.ok(rendered.includes('Next required subagent role: none'));
    t.ok(
      rendered.indexOf(SECTION_THEORY_IMPLEMENTATION) <
        rendered.indexOf('## Current Blocker'),
      'theory and implementation focus should precede process metadata',
    );
    t.ok(
      rendered.indexOf(SECTION_USEFUL_COMMANDS) <
        rendered.indexOf(SECTION_FIRST_FILES),
      'triage commands section should precede first raw artifact reads',
    );
    t.ok(rendered.includes(SECTION_SECONDARY_STEERING));
    t.ok(rendered.includes(
      COMPACT_TESTING_PACK_PATH +
        ' (present) - read only if needed: tests, scenario, artifact, or playback evidence are in scope',
    ));
    t.ok(rendered.includes(
      COMPACT_GOVERNANCE_PACK_PATH +
        ' (present) - read only if needed: work package, sprint, or tracker files are in scope',
    ));
  });

test('work context bootstrap view collapses first commands and closure path',
  (t) => {
    const lines = buildBootstrapLines(
      TEST_BLOCKER,
      TEST_LIGHTWEIGHT_CODE_SCOPE_PACKAGE_CONTENT,
    );
    const rendered = lines.join('\n');

    t.equal(lines[0], '# Work Bootstrap');
    t.match(rendered, 'npm run work:advance -- --check');
    t.match(rendered, `npm run work:validate -- --entry ${TEST_PACKAGE_PATH}`);
    t.match(rendered, `npm run work:validate -- --pre-impl ${TEST_PACKAGE_PATH}`);
    t.match(rendered, `npm run work:close ${TEST_PACKAGE_PATH}`);
    t.match(rendered, 'npm run work:sprint:advance -- --dry-run');
    t.match(rendered, '.kiro/steering/llm/boot.md');
    t.match(rendered, 'Owner / boundary: Bootstrap owner / Startup join');
    t.match(rendered, 'Write scope: ' + TEST_BOOTSTRAP_SOURCE_PATH);
    t.end();
  });

test('work context qualifies broad do-not-edit scope when writeScope overlaps',
  async (t) => {
    const packageContent = [
      '# Runtime Package',
      '',
      '## Model Fit',
      '',
      '- Do-not-edit scope: `src/`',
      '',
    ].join('\n');
    const lines = await buildContextLines(TEST_BLOCKER, packageContent);
    const rendered = lines.join('\n');
    const alreadyQualifiedLines = await buildContextLines(TEST_BLOCKER, [
      '# Runtime Package',
      '',
      '## Model Fit',
      '',
      '- Do-not-edit scope: `src/` outside declared writeScope',
      '',
    ].join('\n'));
    const alreadyQualifiedRendered = alreadyQualifiedLines.join('\n');

    t.match(rendered, 'Do-not-edit scope: src/ outside declared writeScope');
    t.match(
      alreadyQualifiedRendered,
      'Do-not-edit scope: src/ outside declared writeScope',
    );
    t.notMatch(alreadyQualifiedRendered, /outside declared writeScope outside/u);
    t.end();
  });

test('work context surfaces advisory theory ledger refs', async (t) => {
  const theoryRef = 'theory-20260522-ledger-test';
  const blocker = {
    ...TEST_BLOCKER,
    theoryLedgerRefs: [theoryRef],
  };
  const commands = buildUsefulCommands(blocker);
  const lines = await buildContextLines(blocker, TEST_PACKAGE_CONTENT);
  const rendered = lines.join('\n');

  t.ok(commands.includes(WORK_THEORY_LEDGER_LIST_COMMAND));
  t.ok(rendered.includes(SECTION_THEORY_LEDGER_REFS));
  t.ok(rendered.includes(theoryRef));
});

test('work context surfaces related theory candidates when refs are absent',
  async (t) => {
    const blocker = {
      ...TEST_BLOCKER,
      scenario: 'node-failure-rebalance',
      owner: 'startup_active_gate_owner',
      boundary: 'snapshot_coverage',
      theoryLedgerRefs: [],
    };
    const lines = await buildContextLines(blocker, TEST_PACKAGE_CONTENT, {
      theoryLedgerContext: {
        entries: [{
          id: 'theory-20260522-snapshot-watch-fixture',
          line: 10,
          fields: {
            Status: 'superseded',
            'Scenario/gate':
              'node-failure-rebalance / active_gate_snapshot_coverage',
            'Owner/boundary':
              'startup_active_gate_owner / snapshot_coverage',
            'Next implication':
              'do not repeat the fixture-only route.',
          },
        }],
        errors: [],
      },
    });
    const rendered = lines.join('\n');

    t.ok(rendered.includes('Related advisory candidates'));
    t.ok(rendered.includes('theory-20260522-snapshot-watch-fixture'));
    t.ok(rendered.includes('superseded'));
  });

test('work context builds a theory and implementation focus card', (t) => {
  const focus = buildTheoryImplementationFocus(TEST_BLOCKER);

  t.equal(focus.theoryUnderTest, 'Causal edge should reduce.');
  t.equal(focus.causalQuestion, 'dispatch wake proof');
  t.equal(focus.expectedImplementationDelta, 'edge disappears or migrates');
  t.same(focus.implementationFiles, [
    TEST_BOOTSTRAP_SOURCE_PATH,
    TEST_BOOTSTRAP_TEST_PATH,
  ]);
  t.end();
});

test('work context extracts model fit from package metadata and section text',
  (t) => {
    const modelFit = buildModelFitContext(TEST_BLOCKER, TEST_PACKAGE_CONTENT);

    t.equal(modelFit.packageClass, 'bounded-implementation');
    t.equal(modelFit.intendedMinimumModel, 'gpt-5.3-codex-spark');
    t.equal(modelFit.scopeShape, 'leaf-slice');
    t.equal(modelFit.outputProfile, 'medium');
    t.same(modelFit.escalationTriggers, [
      'package scope expands beyond bootstrap files.',
    ]);
    t.end();
  });

test('work context reports the next required subagent role', (t) => {
  const missingLedger = buildSubagentSequencingStatus(TEST_PACKAGE_CONTENT);
  const reviewOnly = buildSubagentSequencingStatus(
    TEST_PACKAGE_REVIEW_ONLY_CONTENT,
  );
  const ready = buildSubagentSequencingStatus(TEST_PACKAGE_READY_CONTENT);
  const firstInSprint = buildSubagentSequencingStatus(
    TEST_PACKAGE_FIRST_IN_SPRINT_CONTENT,
  );
  const localSession = buildSubagentSequencingStatus(
    TEST_PACKAGE_LOCAL_SESSION_CONTENT,
  );
  const reviewFixedMetadata = buildSubagentSequencingStatus(
    TEST_PACKAGE_REVIEW_FIXED_METADATA_CONTENT,
    TEST_PACKAGE_PATH,
  );

  t.equal(missingLedger.role, 'none');
  t.match(missingLedger.status, /implementation may proceed/u);
  t.equal(reviewOnly.role, 'fix');
  t.match(reviewOnly.status, /not-needed/u);
  t.equal(ready.role, 'none');
  t.match(ready.status, /Implementation proof recorded/u);
  t.equal(firstInSprint.role, 'none');
  t.match(firstInSprint.status, /Implementation proof recorded/u);
  t.equal(localSession.role, 'review');
  t.match(localSession.status, /Review proof missing/u);
  t.equal(reviewFixedMetadata.role, 'none');
  t.match(reviewFixedMetadata.status, /Implementation proof recorded/u);
  t.end();
});

test('work context treats execution evidence as implementation proof', (t) => {
  const status = buildSubagentSequencingStatus(
    TEST_PACKAGE_EXECUTION_EVIDENCE_READY_CONTENT,
    TEST_PACKAGE_PATH,
  );

  t.equal(status.role, 'none');
  t.match(status.status, /Implementation proof recorded/u);
  t.end();
});

test('work context treats placeholder-only legacy ledgers as no process blocker',
  (t) => {
    const status = buildSubagentSequencingStatus([
      '# Test Package',
      '',
      '## Subagent Sequencing Ledger',
      '',
      '- [ ] Review subagent recorded: Agent <name> (<agent-id>) reviewed <package>.',
      '',
    ].join('\n'));

    t.equal(status.role, 'none');
    t.match(status.status, /implementation may proceed/u);
    t.end();
  });

test('work context hides template placeholder checklist residue', async (t) => {
  const lines = await buildContextLines(TEST_BLOCKER, [
    '# Test Package',
    '',
    '## Execution Evidence',
    '',
    '- [ ] implementation: status: <validated>; evidence: <commands>; next: <closure>.',
    '',
  ].join('\n'));
  const rendered = lines.join('\n');

  t.ok(rendered.includes('No open checklist items found in package.'));
  t.notOk(rendered.includes('evidence: <commands>'));
  t.end();
});

test('work context treats lightweight lanes as subagent optional', (t) => {
  const lightweight = buildSubagentSequencingStatus(
    TEST_LIGHTWEIGHT_PACKAGE_CONTENT,
    TEST_PACKAGE_PATH,
  );

  t.equal(lightweight.role, 'none');
  t.match(lightweight.status, /not required/u);
  t.end();
});

test('work context requires freshness-review before strict implementation',
  (t) => {
    const missingFreshness = buildSubagentSequencingStatus(
      TEST_STRICT_PACKAGE_CONTENT,
      TEST_PACKAGE_PATH,
    );
    const fresh = buildSubagentSequencingStatus(
      TEST_STRICT_PACKAGE_FRESH_CONTENT,
      TEST_PACKAGE_PATH,
    );

    t.equal(missingFreshness.role, 'freshness-review');
    t.match(missingFreshness.status, /Freshness review missing/u);
    t.equal(fresh.role, 'implementation');
    t.match(fresh.status, /Execution evidence not recorded/u);
    t.end();
  });

test('work context routes optional code-scope packages through verifier-fixer',
  (t) => {
    const missingEvidence = buildSubagentSequencingStatus(
      TEST_LIGHTWEIGHT_CODE_SCOPE_PACKAGE_CONTENT,
      TEST_PACKAGE_PATH,
    );
    const invalidImplementation = buildSubagentSequencingStatus(
      TEST_LIGHTWEIGHT_CODE_SCOPE_INVALID_IMPLEMENTATION_CONTENT,
      TEST_PACKAGE_PATH,
    );
    const implemented = buildSubagentSequencingStatus(
      TEST_LIGHTWEIGHT_CODE_SCOPE_IMPLEMENTED_CONTENT,
      TEST_PACKAGE_PATH,
    );
    const invalidVerification = buildSubagentSequencingStatus(
      TEST_LIGHTWEIGHT_CODE_SCOPE_INVALID_VERIFICATION_CONTENT,
      TEST_PACKAGE_PATH,
    );
    const verified = buildSubagentSequencingStatus(
      TEST_LIGHTWEIGHT_CODE_SCOPE_VERIFIED_CONTENT,
      TEST_PACKAGE_PATH,
    );

    t.equal(missingEvidence.role, 'implementation');
    t.match(missingEvidence.status, /Execution evidence not recorded/u);
    t.equal(invalidImplementation.role, 'implementation');
    t.match(invalidImplementation.status, /parent revalidated focused proof/u);
    t.equal(implemented.role, 'verification-fix');
    t.match(implemented.status, /verifier-fixer/u);
    t.equal(invalidVerification.role, 'verification-fix');
    t.match(invalidVerification.status, /changed files:/u);
    t.equal(verified.role, 'none');
    t.match(verified.status, /verifier-fixer proof recorded/u);
    t.end();
  });

test('work context marks stale nextAction after verifier-fixer evidence',
  async (t) => {
    const lines = await buildContextLines(
      TEST_BLOCKER,
      TEST_LIGHTWEIGHT_CODE_SCOPE_VERIFIED_CONTENT,
    );
    const rendered = lines.join('\n');

    t.match(rendered, /Next action\. \(Implementation and verifier-fixer proof/u);
    t.match(rendered, /resolve validation blockers before further edits/u);
    t.end();
  });

test('work context does not mark strict-invalid subagent ledgers ready', (t) => {
  const ready = buildSubagentSequencingStatus(
    TEST_PACKAGE_READY_CONTENT,
    TEST_PACKAGE_PATH,
  );
  const roleOrder = buildSubagentSequencingStatus(
    TEST_PACKAGE_ROLE_ORDER_INVALID_CONTENT,
    TEST_PACKAGE_PATH,
  );
  const packageMismatch = buildSubagentSequencingStatus(
    TEST_PACKAGE_IMPLEMENTATION_MISMATCH_CONTENT,
    TEST_PACKAGE_PATH,
  );
  const fixConsistency = buildSubagentSequencingStatus(
    TEST_PACKAGE_BAD_FIX_CONSISTENCY_CONTENT,
    TEST_PACKAGE_PATH,
  );
  const sameAgentReuse = buildSubagentSequencingStatus(
    TEST_PACKAGE_SAME_AGENT_REUSE_CONTENT,
    TEST_PACKAGE_PATH,
  );
  const manualFixNote = buildSubagentSequencingStatus(
    TEST_PACKAGE_MANUAL_FIX_NOTE_CONTENT,
    TEST_PACKAGE_PATH,
  );

  t.equal(ready.role, 'none');
  t.equal(roleOrder.role, 'review');
  t.match(roleOrder.status, /strict validation failed/u);
  t.equal(packageMismatch.role, 'implementation');
  t.match(packageMismatch.status, /implementation package/u);
  t.equal(fixConsistency.role, 'fix');
  t.match(fixConsistency.status, /fixes-required/u);
  t.equal(sameAgentReuse.role, 'implementation');
  t.match(sameAgentReuse.status, /separate from the review agent/u);
  t.equal(manualFixNote.role, 'fix');
  t.match(manualFixNote.status, /non-real agent identity/u);
  t.end();
});

test('work context groups dirty status by ownership', (t) => {
  const grouped = groupGitStatusLines([
    PACKAGE_STATUS_LINE,
    TRACKER_STATUS_LINE,
    UNRELATED_STATUS_LINE,
  ], TEST_BLOCKER);

  t.same(grouped.packageOwned, [PACKAGE_STATUS_LINE]);
  t.same(grouped.trackerGenerated, [TRACKER_STATUS_LINE]);
  t.same(grouped.unrelated, [UNRELATED_STATUS_LINE]);
  t.end();
});

test('work context matches quoted paths and untracked directories to package scope',
  (t) => {
    const packageBlocker = {
      ...TEST_BLOCKER,
      writeScope: [
        QUOTED_PACKAGE_PATH,
        'test/scripts/__fixtures__/topology-convergence/priority.fixture.json',
      ],
      commitScope: [
        QUOTED_PACKAGE_PATH,
        'test/scripts/__fixtures__/topology-convergence/priority.fixture.json',
      ],
    };
    const grouped = groupGitStatusLines([
      QUOTED_PACKAGE_STATUS_LINE,
      UNTRACKED_FIXTURE_DIRECTORY_STATUS_LINE,
      UNRELATED_STATUS_LINE,
    ], packageBlocker);

    t.same(grouped.packageOwned, [
      QUOTED_PACKAGE_STATUS_LINE,
      UNTRACKED_FIXTURE_DIRECTORY_STATUS_LINE,
    ]);
    t.same(grouped.unrelated, [UNRELATED_STATUS_LINE]);
    t.end();
  });

test('work context marks scope-field globs as patterns, not missing files',
  async (t) => {
    const packageBlocker = {
      ...TEST_BLOCKER,
      writeScope: [CONTROL_PLANE_PUBLICATION_PATTERN],
      commitScope: [CONTROL_PLANE_PUBLICATION_PATTERN],
    };
    const lines = await buildContextLines(packageBlocker, TEST_PACKAGE_READY_CONTENT);
    const rendered = lines.join('\n');

    t.match(rendered, `${CONTROL_PLANE_PUBLICATION_PATTERN} (pattern)`);
    t.notMatch(rendered, `${CONTROL_PLANE_PUBLICATION_PATTERN} (missing)`);
  });

test('work context matches dirty paths against scope-field glob patterns', (t) => {
  const packageBlocker = {
    ...TEST_BLOCKER,
    writeScope: [CONTROL_PLANE_PUBLICATION_PATTERN],
    commitScope: [CONTROL_PLANE_PUBLICATION_PATTERN],
  };
  const grouped = groupGitStatusLines([
    CONTROL_PLANE_PUBLICATION_STATUS_LINE,
    PACKAGE_STATUS_LINE,
  ], packageBlocker);

  t.same(grouped.packageOwned, [CONTROL_PLANE_PUBLICATION_STATUS_LINE]);
  t.same(grouped.unrelated, [PACKAGE_STATUS_LINE]);
  t.end();
});

test('dirty-scope report makes package-owned and unrelated changes explicit',
  async (t) => {
    const lines = await buildDirtyScopeLines(TEST_BLOCKER, {
      status: GIT_STATUS_AVAILABLE,
      lines: [
        PACKAGE_STATUS_LINE,
        TRACKER_STATUS_LINE,
        UNRELATED_STATUS_LINE,
      ],
    });
    const rendered = lines.join('\n');

    t.match(rendered, DIRTY_SCOPE_TITLE);
    t.match(rendered, 'Package-owned dirty entries: 1');
    t.match(rendered, 'Tracker-generated dirty entries: 1');
    t.match(rendered, 'Unrelated dirty entries: 1');
    t.match(rendered, PACKAGE_STATUS_LINE);
    t.match(rendered, UNRELATED_STATUS_LINE);
  });

test('work context can scope dirty reports to an explicit package file',
  async (t) => {
    await fs.mkdir(TEMP_PACKAGE_ROOT, {recursive: true});
    const tempDirectory = await fs.mkdtemp(
      path.join(TEMP_PACKAGE_ROOT, TEMP_PACKAGE_PREFIX),
    );
    t.teardown(async () => {
      await fs.rm(tempDirectory, {recursive: true, force: true});
    });
    const packagePath = path.join(tempDirectory, TEMP_PACKAGE_FILE_NAME);
    await fs.writeFile(packagePath, [
      '# Temp Package',
      '',
      '<!-- work-package',
      JSON.stringify({
        schema: 'work-package-v1',
        status: 'active',
        scenario: 'none',
        owner: TEMP_OWNER,
        boundary: TEMP_BOUNDARY,
        dominantReason: TEMP_DOMINANT_REASON,
        currentState: 'Testing explicit package scope.',
        nextAction: 'Render dirty scope.',
        proof: ['focused test'],
        touchedFiles: [TEST_BOOTSTRAP_SOURCE_PATH],
      }, null, 2),
      '-->',
      '',
    ].join('\n'));

    const packageBlocker = await buildCurrentBlockerFromPackage(packagePath);

    t.equal(packageBlocker.currentBlocker.package, packagePath);
    t.equal(packageBlocker.currentBlocker.owner, TEMP_OWNER);
    t.equal(packageBlocker.currentBlocker.boundary, TEMP_BOUNDARY);
    t.same(packageBlocker.currentBlocker.touchedFiles, [TEST_BOOTSTRAP_SOURCE_PATH]);
    t.same(buildWriteScope(packageBlocker.currentBlocker), [
      TEST_BOOTSTRAP_SOURCE_PATH,
    ]);
  });

test('work context normalizes v2 package metadata for handoff fields',
  async (t) => {
    await fs.mkdir(TEMP_PACKAGE_ROOT, {recursive: true});
    const tempDirectory = await fs.mkdtemp(
      path.join(TEMP_PACKAGE_ROOT, TEMP_PACKAGE_PREFIX),
    );
    t.teardown(async () => {
      await fs.rm(tempDirectory, {recursive: true, force: true});
    });
    const packagePath = path.join(tempDirectory, TEMP_PACKAGE_FILE_NAME);
    await fs.writeFile(packagePath, [
      '# Temp Package',
      '',
      '<!-- work-package',
      JSON.stringify({
        schema: 'work-package-v2',
        status: 'active',
        intent: {
          lane: 'lightweight-maintenance',
          scenario: 'none',
          owner: TEMP_OWNER,
          boundary: TEMP_BOUNDARY,
          dominantReason: TEMP_DOMINANT_REASON,
          currentState: 'Testing v2 metadata normalization.',
          nextAction: 'Render normalized handoff.',
        },
        scope: {
          writeScope: [TEST_BOOTSTRAP_SOURCE_PATH],
          commitScope: [TEST_BOOTSTRAP_SOURCE_PATH],
        },
        execution: {
          proof: {
            commands: ['focused test'],
          },
          theoryLedgerRefs: ['theory-20260522-ledger-test'],
        },
        modelFit: {
          packageClass: 'bounded-implementation',
          intendedMinimumModel: 'gpt-5.3-codex-spark',
          scopeShape: 'leaf-slice',
          outputProfile: 'medium',
          escalationTriggers: ['owned files expand beyond this package'],
        },
      }, null, 2),
      '-->',
      '',
    ].join('\n'));

    const packageBlocker = await buildCurrentBlockerFromPackage(packagePath);

    t.equal(packageBlocker.currentBlocker.owner, TEMP_OWNER);
    t.equal(packageBlocker.currentBlocker.boundary, TEMP_BOUNDARY);
    t.same(packageBlocker.currentBlocker.proof, ['focused test']);
    t.same(packageBlocker.currentBlocker.theoryLedgerRefs, [
      'theory-20260522-ledger-test',
    ]);
    t.same(buildWriteScope(packageBlocker.currentBlocker), [
      TEST_BOOTSTRAP_SOURCE_PATH,
    ]);
  });
