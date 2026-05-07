import {test} from '../../src/test-helpers/tap.js';
import {
  buildContextLines,
  buildFirstReadPaths,
  buildOwnerCardPaths,
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
const PACKAGE_STATUS_LINE = ' M ' + TEST_BOOTSTRAP_SOURCE_PATH;
const TRACKER_STATUS_LINE = ' M work/sprints/current-blocker.json';
const UNRELATED_STATUS_LINE = ' M README.md';

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
    t.ok(
      rendered.indexOf(SECTION_USEFUL_COMMANDS) <
        rendered.indexOf(SECTION_FIRST_FILES),
      'triage commands section should precede first raw artifact reads',
    );
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
