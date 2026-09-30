/**
 * Seven Solver gates that each cost a verifier round, an override or a
 * parked declaration on 2026-09-05. Each test is one gate's red-on-revert
 * witness.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  deletedPathsFromDiffContent,
  diffSectionsByPath,
  inspectChangeArtifact,
  isCommentOnlyDiffSection,
  requiresModelEvidenceForSection,
} from '../../scripts/solve/change-artifact.js';
import {hasStandingRejection} from '../../scripts/solve/rejection-findings.js';
import {stepTheoryGateProblems} from '../../scripts/solve/theory.js';
import {analyzeScopePressureCandidate} from '../../scripts/solve/scope-pressure.js';
import {lintQuest} from '../../scripts/solve/quest-lint.js';
import {staticQualityProblems} from '../../scripts/solve/static-gate.js';
import {epicPlanningBoundProblem} from '../../scripts/solve/ledger-consistency.js';
import {steeringPackProblemMessages} from '../../scripts/solve/preflight.js';
import {questHarnessPath} from '../../scripts/solve/harness-scaffold.js';
import {appendEvent, saveQuest, readLog} from '../../scripts/solve/store.js';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const SOLVE_CLI = fileURLToPath(new URL('../../scripts/solve.js', import.meta.url));
const FRONTIER = 'friction-main';

function solve(root, args) {
  return execFileSync(process.execPath, [SOLVE_CLI, ...args, '--root', root],
    {encoding: 'utf8'});
}

function solveFails(root, args) {
  return spawnSync(process.execPath, [SOLVE_CLI, ...args, '--root', root],
    {encoding: 'utf8'});
}
const QUEST_ID = 'friction';
const FINGERPRINT = `sha256:${'a'.repeat(64)}`;

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function section(filePath, bodyLines, {deleted = false} = {}) {
  return [
    `diff --git a/${filePath} b/${filePath}`,
    ...(deleted ? ['deleted file mode 100644'] : []),
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    '@@ -1,3 +1,3 @@',
    ...bodyLines,
  ].join('\n');
}

function writeDiff(root, questId, name, content) {
  const file = path.join(root, 'solve', 'changes', questId, `${name}.diff`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
  return `diff:${file}`;
}

function receiptQuest(id, overrides = {}) {
  const metric = {
    probe: 'test-receipt',
    args: {file: `solve/evidence/${id}.receipt.json`, requiredReceipts: ['r1']},
  };
  return {
    id,
    authoringContractVersion: 1,
    statement: 'A sealed, non-default statement for the witness.',
    priority: 1,
    class: 'process',
    links: {roadmapRow: null, specRef: null, closesCL: [], parentQuest: null,
      planDoc: null},
    doneWhen: metric,
    frontiers: [{id: `${id}-main`, priority: 1, metric}],
    constraints: [],
    ...overrides,
  };
}

test('F1: solve new declares test-receipt for a process quest and honours ' +
  '--probe and --required-receipt', () => {
  const root = tmp('friction-new-');
  solve(root, ['new', '--id', 'proc-q', '--statement', 'A process quest.',
    '--class', 'process', '--quiet']);
  const proc = JSON.parse(fs.readFileSync(
    path.join(root, 'solve', 'quests', 'proc-q.json'), 'utf8'));
  assert.equal(proc.doneWhen.probe, 'test-receipt');
  assert.deepEqual(proc.doneWhen.args, {
    file: 'solve/evidence/proc-q.receipt.json',
    requiredReceipts: ['proc-q-main'],
  });
  assert.deepEqual(proc.frontiers[0].metric, proc.doneWhen,
    'the frontier metric reads the same receipt');
  solve(root, ['new', '--id', 'prod-q', '--statement', 'A product quest.',
    '--quiet']);
  const prod = JSON.parse(fs.readFileSync(
    path.join(root, 'solve', 'quests', 'prod-q.json'), 'utf8'));
  assert.equal(prod.doneWhen.probe, 'scenario-harness',
    'a product quest still closes on a live scenario');
  assert.deepEqual(prod.doneWhen.args, {scenario: 'prod-q', consecutive: 3,
    metric: 'priority'});
  solve(root, ['new', '--id', 'mixed-q', '--statement', 'Overrides.',
    '--probe', 'test-receipt', '--required-receipt', 'W1',
    '--required-receipt', 'W2', '--quiet']);
  const mixed = JSON.parse(fs.readFileSync(
    path.join(root, 'solve', 'quests', 'mixed-q.json'), 'utf8'));
  assert.deepEqual(mixed.doneWhen.args.requiredReceipts, ['W1', 'W2']);
  const bad = solveFails(root, ['new', '--id', 'bad-q', '--statement', 'x',
    '--probe', 'oracle', '--quiet']);
  assert.notEqual(bad.status, 0);
  assert.match(`${bad.stderr}${bad.stdout}`,
    /--probe must be one of scenario-harness, test-receipt/u);
  // Lint warns when an evidence harness exists under a non-receipt probe.
  const lintRoot = tmp('friction-lint-probe-');
  const quest = receiptQuest('harnessed', {
    doneWhen: {probe: 'scenario-harness',
      args: {scenario: 'harnessed', consecutive: 3, metric: 'priority'}},
    frontiers: [{id: 'harnessed-main', priority: 1, metric: {
      probe: 'scenario-harness', args: {scenario: 'harnessed', metric: 'priority'},
    }}],
  });
  const harness = path.join(lintRoot, questHarnessPath('harnessed'));
  fs.mkdirSync(path.dirname(harness), {recursive: true});
  fs.writeFileSync(harness, '// harness');
  const result = lintQuest(quest, {root: lintRoot});
  assert.ok(result.warnings.some((line) =>
    /evidence harness exists at .* but doneWhen\.probe is not test-receipt/u
      .test(line)), 'the mismatch is named before the declaration seals it');
});

test('F2: preflight names a stale steering pack from a scratch regeneration ' +
  'and never touches the tree', () => {
  const root = tmp('friction-steering-');
  const packFile = path.join(root, 'docs', 'steering', 'llm', 'tools-index.md');
  fs.mkdirSync(path.dirname(packFile), {recursive: true});
  fs.writeFileSync(packFile, 'four facts\n');
  const tracked = () => ['docs/steering/llm/tools-index.md'];
  const configured = () => true;
  assert.deepEqual(steeringPackProblemMessages(root, {tracked}), [],
    'a tree without a steering pack script has nothing to be stale');
  const fresh = steeringPackProblemMessages(root, {
    tracked, configured, regenerate: () => ({status: 0}),
  });
  assert.deepEqual(fresh, [], 'an unchanged regeneration is fresh');
  const stale = steeringPackProblemMessages(root, {
    tracked, configured,
    regenerate: (scratch) => {
      fs.writeFileSync(
        path.join(scratch, 'docs', 'steering', 'llm', 'tools-index.md'),
        'five checks\n');
      fs.writeFileSync(
        path.join(scratch, 'docs', 'steering', 'llm', 'extra.md'), 'new\n');
      return {status: 0};
    },
  });
  assert.equal(stale.length, 1);
  assert.match(stale[0], /steering pack stale \(run npm run steering:llm:pack\): /u);
  assert.match(stale[0], /docs\/steering\/llm\/extra\.md, docs\/steering\/llm\/tools-index\.md/u);
  assert.equal(fs.readFileSync(packFile, 'utf8'), 'four facts\n',
    'the tree is untouched');
  const failed = steeringPackProblemMessages(root, {
    tracked, configured, regenerate: () => ({status: 1, stderr: 'boom\n'}),
  });
  assert.match(failed[0], /steering pack freshness could not run: boom/u);
});

test('F3: an over-bound epic is refused by lint through links.planDoc and ' +
  'named by the attempt static gate', () => {
  const root = tmp('friction-epic-');
  const epic = 'solve/epics/big.md';
  fs.mkdirSync(path.join(root, 'solve', 'epics'), {recursive: true});
  const body = ['---', 'epicContractVersion: 2', 'id: big', '---', '# Big',
    '## Decision log', ...Array.from({length: 150}, (_, i) => `- line ${i}`)];
  fs.writeFileSync(path.join(root, epic), body.join('\n') + '\n');
  assert.match(epicPlanningBoundProblem(root, epic),
    /epic big\.md: version 2 exceeds the 150-line planning bound \(lines=156\)/u);
  fs.writeFileSync(path.join(root, 'solve/epics/small.md'),
    '---\nepicContractVersion: 2\nid: small\n---\n# Small\n## Decision log\n');
  assert.equal(epicPlanningBoundProblem(root, 'solve/epics/small.md'), null);
  fs.writeFileSync(path.join(root, 'solve/epics/legacy.md'),
    body.join('\n').replace('epicContractVersion: 2', 'status: active'));
  assert.equal(epicPlanningBoundProblem(root, 'solve/epics/legacy.md'), null,
    'legacy epics are not bound');
  const quest = receiptQuest('bound', {
    links: {roadmapRow: null, specRef: null, closesCL: [], parentQuest: null,
      planDoc: epic},
  });
  const lint = lintQuest(quest, {root});
  assert.ok(lint.errors.some((line) => /150-line planning bound/u.test(line)),
    'lint refuses the plan memo');
  const gate = staticQualityProblems(root, [epic, 'solve/epics/small.md']);
  assert.equal(gate.length, 1);
  assert.match(gate[0], /epic big\.md: version 2 exceeds/u);
  assert.deepEqual(staticQualityProblems(root, ['solve/epics/small.md']), []);
});

test('F4: package.json owes model evidence only when a model-checking ' +
  'command changes', () => {
  const scripts = section('package.json', [
    '-    "release:gate:receipt": "node scripts/checks/record-release-gate-receipt.js",',
    '+    "release:preflight": "node scripts/release-preflight.js",',
    '+    "check:formation": "node scripts/checks/run-formation-seed-budget.js",',
  ]);
  assert.equal(requiresModelEvidenceForSection('package.json', scripts), false);
  const version = section('package.json', ['-  "version": "0.1.1",',
    '+  "version": "0.2.0",']);
  assert.equal(requiresModelEvidenceForSection('package.json', version), false);
  const model = section('package.json', [
    '-    "model:contracts": "node scripts/check-system-contracts.js",',
    '+    "model:contracts": "node scripts/check-system-contracts.js --strict",',
  ]);
  assert.equal(requiresModelEvidenceForSection('package.json', model), true);
  assert.equal(requiresModelEvidenceForSection('architecture/contracts/x.md', ''),
    true, 'other model paths keep the prefix rule');
  assert.equal(requiresModelEvidenceForSection('src/x.js', ''), false);
  const sections = diffSectionsByPath(`${scripts}\n${section('src/a.js', ['+x'])}`);
  assert.deepEqual([...sections.keys()], ['package.json', 'src/a.js']);
});

test('F5: a standing candidate rejection waives the widen-scope theory ' +
  'demand at commit only', () => {
  const rejection = {
    type: 'finding', frontier: FRONTIER, kind: 'verifier-rejection',
    verification: {scope: 'candidate', fingerprint: FINGERPRINT},
  };
  const approval = {
    type: 'finding', frontier: FRONTIER, kind: 'verifier-approval',
    verification: {scope: 'candidate', fingerprint: FINGERPRINT},
  };
  assert.equal(hasStandingRejection([rejection], FRONTIER), true);
  assert.equal(hasStandingRejection([rejection, approval], FRONTIER), false);
  assert.equal(hasStandingRejection([rejection], 'other'), false);
  const state = {theories: {byId: {}, selectedByFrontier: {}}};
  const demanded = stepTheoryGateProblems({
    log: [], state, frontierId: FRONTIER, rungIndex: 2, phase: 'commit',
  });
  assert.ok(demanded.some((line) => /frontier theory required at rung 2/u.test(line)),
    'without a rejection the rung still demands a theory');
  const waived = stepTheoryGateProblems({
    log: [rejection], state, frontierId: FRONTIER, rungIndex: 2,
    phase: 'commit',
  });
  assert.equal(
    waived.some((line) => /frontier theory required/u.test(line)), false,
    'the verifier-directed replacement needs no fresh theory');
  const begin = stepTheoryGateProblems({
    log: [rejection], state, frontierId: FRONTIER, rungIndex: 2,
    phase: 'begin',
  });
  assert.ok(begin.some((line) => /frontier theory required/u.test(line)),
    'only the commit of the replacement is waived');
});

test('F6: scope pressure counts authored scope only', () => {
  const root = tmp('friction-scope-');
  const quest = receiptQuest(QUEST_ID);
  saveQuest(root, quest);
  const authored = ['src/admin/a.js', 'src/admin/b.js'];
  const deleted = ['scripts/checks/old-1.js', 'scripts/checks/old-2.js',
    'scripts/checks/old-3.js'];
  const content = [
    ...authored.map((p) => section(p, ['-before', '+after'])),
    ...deleted.map((p) => section(p, ['-gone'], {deleted: true})),
    section('test/shards/primary-classes.json', ['-x', '+y']),
  ].join('\n');
  assert.deepEqual(deletedPathsFromDiffContent(content), deleted);
  const changeRef = writeDiff(root, QUEST_ID, 'mixed', content);
  appendEvent(root, QUEST_ID, {type: 'attempt', frontier: `${QUEST_ID}-main`,
    changeRef, metricBefore: 1, metricAfter: 1});
  const inspection = inspectChangeArtifact(root, quest, changeRef);
  const pressure = analyzeScopePressureCandidate(
    root, quest, readLog(root, QUEST_ID), inspection, {});
  assert.deepEqual(pressure.admission.changedPaths, authored,
    'deletions and the registered shard manifest are not admission scope');
  assert.deepEqual(pressure.admission.ownerAreas, ['src/admin']);
  assert.ok(pressure.admission.changedBytes < pressure.changedBytes,
    'deleted sections do not count toward the admission bytes');
  assert.equal(pressure.changedPaths.length, 6,
    'the retrospective view still lists every path');
});

test('F7: a comment-only runtime edit does not stamp runtime scope on a ' +
  'workflow quest', () => {
  const commentOnly = section('test/distributed/run.js', [
    '-// the release-0-2 memory-soak oracle',
    '+// the formation health trend',
    '+',
  ]);
  assert.equal(isCommentOnlyDiffSection(commentOnly), true);
  assert.equal(isCommentOnlyDiffSection(section('test/distributed/run.js', [
    '-// old', '+const x = 1;'])), false);
  // Block comments are tracked across the changed lines; anything that is
  // not provably comment text is code (round-1 verifier inputs).
  assert.equal(isCommentOnlyDiffSection(section('a.js', [
    '+/**', '+ * A doc block that opens and closes.', '+ */'])), true);
  assert.equal(isCommentOnlyDiffSection(section('a.js', [
    '+  /* istanbul ignore next */ throw new Error(\'x\');'])), false,
  'code after an inline block comment is code');
  assert.equal(isCommentOnlyDiffSection(section('a.js', [
    '-  *items() {', '+  *items(filter) {'])), false,
  'a generator signature is not a doc star');
  assert.equal(isCommentOnlyDiffSection(section('a.js', [
    '+*/ process.exit(1);'])), false, 'a close with no open block is code');
  assert.equal(isCommentOnlyDiffSection(section('a.js', [
    '+const s = \'// not a comment\';'])), false,
  'a marker inside a string is code');
  assert.equal(isCommentOnlyDiffSection(section('a.js', [
    '+return 1; // trailing'])), false);
  assert.equal(isCommentOnlyDiffSection(section('a.js', [
    '+ * a star line outside any block'])), false);
  // Round-2 inputs: block state must include the unchanged context lines,
  // hunk lines starting with +++ are changed lines, and a block left open
  // past the hunk comments out what follows.
  assert.equal(isCommentOnlyDiffSection(section('a.js', [
    '-// header', '+/*', ' export {i};', '+*/'])), false,
  'commenting out a context line is a code change');
  assert.equal(isCommentOnlyDiffSection(section('a.js', [
    '-/*', ' foo();', '-*/'])), false, 'uncommenting a context line too');
  assert.equal(isCommentOnlyDiffSection(section('a.js', [
    '-/* old', '+process.exit(1);', '+// x */'])), false);
  assert.equal(isCommentOnlyDiffSection(section('a.js', ['+++i;'])), false,
    'a column-zero ++i is a changed line, not a file header');
  assert.equal(isCommentOnlyDiffSection(section('a.js', ['+/* open'])), false,
    'a block left open past the hunk is a code change');
  assert.equal(isCommentOnlyDiffSection(section('a.js', [
    ' /* opened in context', '- old comment text', '+ new comment text',
    ' */'])), true, 'editing comment text inside a context block is neutral');
  assert.equal(isCommentOnlyDiffSection(section('a.js', [
    '-// a', ' export {i};', '+// b'])), true);
  assert.equal(isCommentOnlyDiffSection(section('a.js', [])), false,
    'a section without changed lines is not comment-only');
  assert.equal(isCommentOnlyDiffSection('diff --git a/x b/x\nGIT binary patch\n'),
    false);
  const root = tmp('friction-runtime-');
  const quest = receiptQuest(QUEST_ID, {
    links: {roadmapRow: null, specRef: 'scripts/solve/x.js', closesCL: [],
      parentQuest: null, planDoc: 'solve/epics/x.md'},
  });
  saveQuest(root, quest);
  const workflowOnly = writeDiff(root, QUEST_ID, 'wf',
    section('scripts/solve/x.js', ['-a', '+b']));
  const base = inspectChangeArtifact(root, quest, workflowOnly);
  assert.equal(base.questScope, 'workflow', 'the fixture quest is a workflow quest');
  const withComment = writeDiff(root, QUEST_ID, 'wf-comment',
    `${section('scripts/solve/x.js', ['-a', '+b'])}\n${commentOnly}`);
  const ok = inspectChangeArtifact(root, quest, withComment);
  assert.deepEqual(ok.problems.filter((p) => /runtime changes/u.test(p)), [],
    'the comment-only runtime section is admitted');
  const withCode = writeDiff(root, QUEST_ID, 'wf-code',
    `${section('scripts/solve/x.js', ['-a', '+b'])}\n` +
    section('test/distributed/run.js', ['-// old', '+const y = 2;']));
  const refused = inspectChangeArtifact(root, quest, withCode);
  assert.ok(refused.problems.some((p) =>
    /runtime changes must be recorded in a runtime Quest.*test\/distributed\/run\.js/u
      .test(p)), 'a code change on the runtime path is still refused');
});
