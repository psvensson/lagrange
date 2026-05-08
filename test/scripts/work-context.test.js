import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  buildContextLines,
  buildCurrentBlockerFromPackage,
  buildDirtyScopeLines,
  buildFirstReadPaths,
  buildOwnerCardPaths,
  buildSubagentSequencingStatus,
  buildUsefulCommands,
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
  '## Out Of Scope',
  '',
  '- Runtime behavior changes.',
  '',
].join('\n');
const REVIEW_AGENT_ID = '019e02b6-1920-7130-b040-da2e6f4efbc4';
const FIX_AGENT_ID = '019e02b7-ece3-73a2-a664-389d40dfd575';
const IMPLEMENTATION_AGENT_ID = '019e02b9-7651-7851-bc85-a0cef8a90176';
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
  '      `work/packages/active-20260507-test-package.md`.',
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
  '      `work/packages/active-20260507-test-package.md`.',
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
  '      `work/packages/active-20260507-test-package.md`.',
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
  '      `work/packages/active-20260507-other-package.md`.',
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
  '      `work/packages/active-20260507-test-package.md`.',
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
  '      `work/packages/active-20260507-test-package.md`.',
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
  '      `work/packages/active-20260507-test-package.md`.',
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
  scenario: 'rolling-restart',
  artifact: TEST_ARTIFACT_PATH,
  playback: TEST_PLAYBACK_PATH,
  owner: 'Bootstrap owner',
  boundary: 'Startup join',
  dominantReason: 'bootstrap_not_ready',
  currentState: 'Current state.',
  nextAction: 'Next action.',
  proof: ['Focused proof'],
  touchedFiles: [
    TEST_BOOTSTRAP_SOURCE_PATH,
    TEST_BOOTSTRAP_TEST_PATH,
    TEST_PACKAGE_PATH,
  ],
  predecessor: TEST_PREDECESSOR_PATH,
});
const COMPACT_PACK_README_PATH = '.kiro/steering/llm/README.md';
const COMPACT_PACK_CORE_PATH = '.kiro/steering/llm/core.md';
const COMPACT_ARCHITECTURE_PACK_PATH = '.kiro/steering/llm/architecture.md';
const COMPACT_TESTING_PACK_PATH = '.kiro/steering/llm/testing.md';
const FULL_STEERING_SYSTEM_PATH = '.kiro/steering/system guidelines.md';
const BOOTSTRAP_OWNER_CARD_PATH = 'src/bootstrap/README.md';
const PLAYBACK_FAILURE_BUNDLE_PATH = TEST_PLAYBACK_PATH + 'failure-bundle.json';
const WORK_CONTEXT_COMMAND = 'npm run work:current-blocker';
const DISTRIBUTED_FAILURE_COMMAND =
  'npm run analyze:distributed-failure -- --report ' + TEST_ARTIFACT_PATH;
const TOPOLOGY_ARTIFACT_COMMAND =
  'npm run analyze:topology-convergence -- ' + TEST_ARTIFACT_PATH;
const TOPOLOGY_PLAYBACK_COMMAND =
  'npm run analyze:topology-convergence -- ' + PLAYBACK_FAILURE_BUNDLE_PATH;
const RUNTIME_GRAMMAR_FILE_COMMAND =
  'npm run audit:runtime-grammar:file -- ' + TEST_BOOTSTRAP_SOURCE_PATH;
const RUNTIME_GRAMMAR_BROAD_FILE_COMMAND =
  'npm run audit:runtime-grammar -- ' + TEST_BOOTSTRAP_SOURCE_PATH;
const SECTION_USEFUL_COMMANDS = '## Useful Commands';
const SECTION_FIRST_FILES = '## First Files To Read';
const SECTION_SUBAGENT_SEQUENCING = '## Subagent Sequencing';
const DIRTY_SCOPE_TITLE = '# Worktree Package Scope';
const PACKAGE_STATUS_LINE = ' M ' + TEST_BOOTSTRAP_SOURCE_PATH;
const TRACKER_STATUS_LINE = ' M work/sprints/current-blocker.json';
const UNRELATED_STATUS_LINE = ' M README.md';
const QUOTED_PACKAGE_PATH = '.kiro/steering/system guidelines.md';
const QUOTED_PACKAGE_STATUS_LINE = ` M "${QUOTED_PACKAGE_PATH}"`;
const UNTRACKED_FIXTURE_DIRECTORY_STATUS_LINE =
  '?? test/scripts/__fixtures__/';
const GIT_STATUS_AVAILABLE = 'git-status-available';
const TEMP_PACKAGE_PREFIX = 'work-context-package-';
const TEMP_PACKAGE_FILE_NAME = 'active-20260507-temp-package.md';
const TEMP_OWNER = 'Workflow owner';
const TEMP_BOUNDARY = 'LLM dirty scope';
const TEMP_DOMINANT_REASON = 'dirty_scope_report_needed';

test('work context first-read paths prefer compact pack and owner cards', (t) => {
  const firstReadPaths = buildFirstReadPaths(TEST_BLOCKER);
  const ownerCardPaths = buildOwnerCardPaths(TEST_BLOCKER);

  t.same(ownerCardPaths, [BOOTSTRAP_OWNER_CARD_PATH]);
  t.equal(firstReadPaths[1], COMPACT_PACK_README_PATH);
  t.equal(firstReadPaths[2], COMPACT_PACK_CORE_PATH);
  t.equal(firstReadPaths[3], COMPACT_ARCHITECTURE_PACK_PATH);
  t.equal(firstReadPaths[4], COMPACT_TESTING_PACK_PATH);
  t.ok(firstReadPaths.includes(BOOTSTRAP_OWNER_CARD_PATH));
  t.ok(firstReadPaths.includes(TEST_ARTIFACT_PATH));
  t.ok(firstReadPaths.includes(TEST_PLAYBACK_PATH));
  t.ok(firstReadPaths.includes(PLAYBACK_FAILURE_BUNDLE_PATH));
  t.notOk(firstReadPaths.includes(FULL_STEERING_SYSTEM_PATH));
  t.end();
});

test('work context advertises triage commands before raw artifact reads',
  async (t) => {
    const commands = buildUsefulCommands(TEST_BLOCKER);
    const lines = await buildContextLines(TEST_BLOCKER, TEST_PACKAGE_CONTENT);
    const rendered = lines.join('\n');

    t.equal(commands[0], WORK_CONTEXT_COMMAND);
    t.ok(commands.includes(DISTRIBUTED_FAILURE_COMMAND));
    t.ok(commands.includes(TOPOLOGY_ARTIFACT_COMMAND));
    t.ok(commands.includes(TOPOLOGY_PLAYBACK_COMMAND));
    t.ok(commands.includes(RUNTIME_GRAMMAR_FILE_COMMAND));
    t.notOk(commands.includes(RUNTIME_GRAMMAR_BROAD_FILE_COMMAND));
    t.ok(rendered.includes('Playback: ' + TEST_PLAYBACK_PATH + ' (missing)'));
    t.ok(rendered.includes(SECTION_SUBAGENT_SEQUENCING));
    t.ok(rendered.includes('Next required subagent role: review'));
    t.ok(
      rendered.indexOf(SECTION_USEFUL_COMMANDS) <
        rendered.indexOf(SECTION_FIRST_FILES),
      'triage commands section should precede first raw artifact reads',
    );
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

  t.equal(missingLedger.role, 'review');
  t.match(missingLedger.status, /Ledger missing/u);
  t.equal(reviewOnly.role, 'fix');
  t.match(reviewOnly.status, /not-needed/u);
  t.equal(ready.role, 'none');
  t.match(ready.status, /implementation proof recorded/u);
  t.equal(firstInSprint.role, 'none');
  t.match(firstInSprint.status, /implementation proof recorded/u);
  t.equal(localSession.role, 'review');
  t.match(localSession.status, /Review proof missing/u);
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
      touchedFiles: [
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
    const tempDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), TEMP_PACKAGE_PREFIX),
    );
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
  });
