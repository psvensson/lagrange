import {test} from '../../src/test-helpers/tap.js';
import {
  buildCodexArgs,
  buildOversizedRefactorPlanFromEntries,
  buildRefactorPrompt,
  findNewFilenameViolations,
  findNewPaths,
  formatPassMessage,
  parseCli,
  renderPlan,
} from '../../scripts/work-oversized-refactor.js';

const DEFAULT_MODEL = 'gpt-5.3-codex';
const DEFAULT_MAX_PASSES = 8;
const SOURCE_SCOPE = 'source';
const TEST_SCOPE = 'test';
const ALL_SCOPE = 'all';
const SOURCE_FILE_PATH =
  'src/rebalancer/operation-workflow-owner-segment-5.js';
const TEST_FILE_PATH =
  'test/control-plane/membership-publication-coordinator-main-stage-2.js';
const SOURCE_LINES = 1400;
const TEST_LINES = 1600;
const SOURCE_THRESHOLD = 800;
const TEST_THRESHOLD = 1200;
const TOP_LIMIT = 1;
const TOTAL_ENTRY_COUNT = 2;
const LAST_ARG_OFFSET = 1;

function sourceEntry() {
  return {
    scope: SOURCE_SCOPE,
    path: SOURCE_FILE_PATH,
    lines: SOURCE_LINES,
    threshold: SOURCE_THRESHOLD,
  };
}

function testEntry() {
  return {
    scope: TEST_SCOPE,
    path: TEST_FILE_PATH,
    lines: TEST_LINES,
    threshold: TEST_THRESHOLD,
  };
}

test('oversized refactor plan lists selected files without package commands', (t) => {
  const plan = buildOversizedRefactorPlanFromEntries(
    [sourceEntry()],
    [testEntry()],
    {
      model: DEFAULT_MODEL,
      scope: ALL_SCOPE,
      top: TOP_LIMIT,
    },
  );
  const renderedPlan = renderPlan(plan);

  t.equal(plan.model, DEFAULT_MODEL);
  t.equal(plan.oversizedCount, TOTAL_ENTRY_COUNT);
  t.equal(plan.selectedCount, TOP_LIMIT);
  t.equal(plan.entries[0].path, TEST_FILE_PATH);
  t.match(renderedPlan, /gpt-5\.3-codex/u);
  t.match(renderedPlan, /No Codex runs launched/u);
  t.notMatch(renderedPlan, /work:package:new/u);
  t.end();
});

test('oversized refactor prompt bypasses packages and bans numbered new filenames', (t) => {
  const prompt = buildRefactorPrompt(sourceEntry(), {
    model: DEFAULT_MODEL,
  });

  t.match(prompt, /Bypass the regular work-package process/u);
  t.match(prompt, /bring the target file under its configured line threshold/u);
  t.match(prompt, /Do not create or edit work packages/u);
  t.match(prompt, /Do not use any digit character in a new filename/u);
  t.match(prompt, /Do not carry segment, stage, part, batch/u);
  t.match(prompt, /semantically named helper files/u);
  t.match(prompt, /Every helper file you add/u);
  t.match(prompt, /Do not move the oversized body intact/u);
  t.match(prompt, /Do not stop after a single extraction/u);
  t.match(prompt, /audit:file-size:strict/u);
  t.match(prompt, new RegExp(`Run npm run audit:file-size -- ${SOURCE_FILE_PATH}`, 'u'));
  t.end();
});

test('oversized refactor codex args use gpt codex exec in workspace', (t) => {
  const args = buildCodexArgs({model: DEFAULT_MODEL});

  t.equal(args[0], '--model');
  t.equal(args[1], DEFAULT_MODEL);
  t.ok(args.includes('--cd'));
  t.ok(args.includes('--sandbox'));
  t.ok(args.includes('workspace-write'));
  t.ok(args.includes('--ask-for-approval'));
  t.ok(args.includes('never'));
  t.ok(args.indexOf('exec') > args.indexOf('never'));
  t.equal(args[args.length - LAST_ARG_OFFSET], '-');
  t.end();
});

test('oversized refactor cli defaults to listing all files before run', (t) => {
  const options = parseCli([]);

  t.equal(options.model, DEFAULT_MODEL);
  t.equal(options.scope, ALL_SCOPE);
  t.equal(options.run, false);
  t.equal(options.top, null);
  t.equal(options.maxPasses, DEFAULT_MAX_PASSES);
  t.end();
});

test('oversized refactor detects numbered new filenames after codex runs', (t) => {
  const beforePaths = new Set([
    'src/rebalancer/existing-decision-helper.js',
  ]);
  const afterPaths = new Set([
    'src/rebalancer/existing-decision-helper.js',
    'src/rebalancer/priority-recovery-routing.js',
    'src/rebalancer/priority-recovery-routing-2.js',
  ]);

  t.same(findNewFilenameViolations(beforePaths, afterPaths), [
    'src/rebalancer/priority-recovery-routing-2.js',
  ]);
  t.end();
});

test('oversized refactor identifies new file inventory entries', (t) => {
  const beforePaths = new Set([
    'src/rebalancer/existing-decision-helper.js',
  ]);
  const afterPaths = new Set([
    'src/rebalancer/existing-decision-helper.js',
    'src/rebalancer/priority-recovery-routing.js',
    'test/rebalancer/priority-recovery-routing-test-cases.js',
  ]);

  t.same(findNewPaths(beforePaths, afterPaths), [
    'src/rebalancer/priority-recovery-routing.js',
    'test/rebalancer/priority-recovery-routing-test-cases.js',
  ]);
  t.end();
});

test('oversized refactor pass messages include shrinking target context', (t) => {
  t.equal(
    formatPassMessage(sourceEntry(), 2, DEFAULT_MAX_PASSES),
    '\nLaunching Codex pass 2/8 for ' +
      'src/rebalancer/operation-workflow-owner-segment-5.js ' +
      '(1400/800)\n',
  );
  t.end();
});
