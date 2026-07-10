import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {saveQuest} from '../../scripts/solve/store.js';
import {runStep, stepPending} from '../../scripts/solve/step.js';

const CLI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../../scripts/solve.js');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'step-auto-diff-'));
}

function git(root, args) {
  return execFileSync('git', args, {cwd: root, encoding: 'utf8'});
}

// A tmp root that IS a git work tree, so --auto-diff has a pin to diff against.
function gitRoot() {
  const root = tmp();
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@example.invalid']);
  git(root, ['config', 'user.name', 'Test']);
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'before\n');
  git(root, ['add', '.']);
  git(root, ['commit', '--quiet', '-m', 'seed']);
  return root;
}

function makeQuest(root, id = 'demo') {
  const oracle = path.join(root, 'oracle.json');
  fs.writeFileSync(oracle, JSON.stringify({metric: 3, target: 0}));
  const quest = {
    id,
    statement: 'Drive the oracle metric to zero.',
    priority: 1,
    doneWhen: {probe: 'oracle', args: {file: oracle}},
    frontiers: [
      {id: `${id}-main`, priority: 1,
        metric: {probe: 'oracle', args: {file: oracle}}},
    ],
  };
  saveQuest(root, quest);
  return {quest, oracle};
}

tap.test('step --commit --auto-diff', async (t) => {
  t.test('snapshots the working-tree diff as the changeRef artifact', (t) => {
    const root = gitRoot();
    const {quest, oracle} = makeQuest(root);

    const begin = runStep(root, quest);
    t.equal(begin.terminal, null);
    t.match(stepPending(root, quest.id).headCommit, /^[0-9a-f]{40}$/u,
      'pending step records the git pin at step begin');

    fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'after\n');
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));

    const r = runStep(root, quest, {autoDiff: true, summary: 'auto snapshot'});
    t.equal(r.before, 3);
    t.equal(r.after, 1);
    t.same(r.violations, []);
    t.equal(r.changeRef, 'diff:solve/changes/demo/attempt-1.diff');
    const artifact = path.join(root, 'solve', 'changes', 'demo', 'attempt-1.diff');
    t.ok(fs.existsSync(artifact), 'artifact written under solve/changes/<quest>/');
    const content = fs.readFileSync(artifact, 'utf8');
    t.match(content, /^diff --git a\/src\/demo\.js b\/src\/demo\.js$/mu);
    t.match(content, /^@@ /mu, 'contains a unified diff hunk');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('errors out when the diff is empty (nothing changed)', (t) => {
    const root = gitRoot();
    const {quest} = makeQuest(root);
    runStep(root, quest);

    t.throws(
      () => runStep(root, quest, {autoDiff: true, summary: 'no change'}),
      /auto-diff: git diff is empty — nothing changed/u,
    );
    t.ok(stepPending(root, quest.id), 'pending step survives the refusal');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('allocates the next free attempt-<n>.diff', (t) => {
    const root = gitRoot();
    const {quest, oracle} = makeQuest(root);
    const changeDir = path.join(root, 'solve', 'changes', 'demo');
    fs.mkdirSync(changeDir, {recursive: true});
    fs.writeFileSync(path.join(changeDir, 'attempt-3.diff'), 'placeholder\n');

    runStep(root, quest);
    fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'changed again\n');
    fs.writeFileSync(oracle, JSON.stringify({metric: 2, target: 0}));
    const r = runStep(root, quest, {autoDiff: true, summary: 'second'});

    t.equal(r.changeRef, 'diff:solve/changes/demo/attempt-4.diff');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('excludes solver-owned generated bookkeeping from the snapshot', (t) => {
    // FAULT-1 regression: between begin and commit the solver's own
    // bookkeeping dirties solve/FRONTIER.generated.md (and log/report/state);
    // sweeping it into the artifact made the honesty gate reject every
    // product-quest auto-diff with "workflow changes must be recorded in a
    // workflow/Quest tooling Quest".
    const root = gitRoot();
    const {quest, oracle} = makeQuest(root);
    fs.mkdirSync(path.join(root, 'solve', 'log'), {recursive: true});
    fs.mkdirSync(path.join(root, 'solve', 'report'), {recursive: true});
    fs.writeFileSync(path.join(root, 'solve', 'FRONTIER.generated.md'), 'board v1\n');
    fs.writeFileSync(path.join(root, 'solve', 'log', 'demo.ndjson'), '{}\n');
    fs.writeFileSync(path.join(root, 'solve', 'report', 'demo.md'), 'report v1\n');
    git(root, ['add', 'solve']);
    git(root, ['commit', '--quiet', '-m', 'track solver bookkeeping']);

    runStep(root, quest);
    fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'after\n');
    // Simulate the solver's own bookkeeping churn during the attempt.
    fs.writeFileSync(path.join(root, 'solve', 'FRONTIER.generated.md'), 'board v2\n');
    fs.writeFileSync(path.join(root, 'solve', 'log', 'demo.ndjson'), '{}\n{}\n');
    fs.writeFileSync(path.join(root, 'solve', 'report', 'demo.md'), 'report v2\n');
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));

    const r = runStep(root, quest, {autoDiff: true, summary: 'product change'});
    t.same(r.violations, [], 'the product-quest commit is accepted');
    const content = fs.readFileSync(
      path.join(root, 'solve', 'changes', 'demo', 'attempt-1.diff'), 'utf8');
    t.match(content, /a\/src\/demo\.js/u, 'the product edit is captured');
    t.notMatch(content, /FRONTIER\.generated\.md/u, 'board refresh excluded');
    t.notMatch(content, /solve\/log\//u, 'event-log appends excluded');
    t.notMatch(content, /solve\/report\//u, 'report regeneration excluded');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('still captures intentional operator edits under solve/', (t) => {
    // The bookkeeping exclusion must be surgical: a workflow quest editing its
    // own quest JSON is an intentional solve/ change and belongs in the diff.
    const root = gitRoot();
    const oracle = path.join(root, 'oracle.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 3, target: 0}));
    const quest = {
      id: 'workflow-demo',
      statement: 'Improve the workflow tooling oracle.',
      priority: 1,
      doneWhen: {probe: 'oracle', args: {file: oracle}},
      frontiers: [
        {id: 'workflow-demo-main', priority: 1,
          metric: {probe: 'oracle', args: {file: oracle}}},
      ],
    };
    saveQuest(root, quest);
    fs.writeFileSync(path.join(root, 'solve', 'FRONTIER.generated.md'), 'board v1\n');
    git(root, ['add', 'solve']);
    git(root, ['commit', '--quiet', '-m', 'track quest + board']);

    runStep(root, quest);
    quest.statement = 'Improve the workflow tooling oracle, sealed tighter.';
    saveQuest(root, quest);
    fs.writeFileSync(path.join(root, 'solve', 'FRONTIER.generated.md'), 'board v2\n');
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));

    const r = runStep(root, quest, {autoDiff: true, summary: 'quest edit'});
    t.same(r.violations, []);
    const content = fs.readFileSync(path.join(
      root, 'solve', 'changes', 'workflow-demo', 'attempt-1.diff'), 'utf8');
    t.match(content, /a\/solve\/quests\/workflow-demo\.json/u,
      'the intentional quest-JSON edit is captured');
    t.notMatch(content, /FRONTIER\.generated\.md/u,
      'generated board still excluded');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a rejected commit removes the auto-diff artifact (no orphans)', (t) => {
    // FAULT-2 regression: an inspector-rejected commit used to leave an
    // orphan attempt-<n>.diff behind, so numbering skipped (attempt-1 orphan,
    // next success became attempt-2).
    const root = gitRoot();
    const {quest, oracle} = makeQuest(root);
    fs.mkdirSync(path.join(root, 'scripts'), {recursive: true});
    fs.writeFileSync(path.join(root, 'scripts', 'quest-context.js'), 'v1\n');
    git(root, ['add', 'scripts']);
    git(root, ['commit', '--quiet', '-m', 'track a workflow-classified file']);

    runStep(root, quest);
    // A workflow-classified change on a product quest is rejected by the
    // change-artifact inspector.
    fs.writeFileSync(path.join(root, 'scripts', 'quest-context.js'), 'v2\n');
    t.throws(
      () => runStep(root, quest, {autoDiff: true, summary: 'wrong scope'}),
      /invalid changeRef: .*workflow changes must be recorded/u,
    );
    const changeDir = path.join(root, 'solve', 'changes', 'demo');
    t.same(
      fs.existsSync(changeDir) ? fs.readdirSync(changeDir) : [],
      [],
      'no orphan artifact survives the rejection',
    );

    // After fixing the working tree, the next commit gets the DENSE number.
    git(root, ['checkout', '--', 'scripts/quest-context.js']);
    fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'after\n');
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    const r = runStep(root, quest, {autoDiff: true, summary: 'right scope'});
    t.equal(r.changeRef, 'diff:solve/changes/demo/attempt-1.diff',
      'numbering stays dense after a rejected commit');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('CLI warns that --auto-diff is ignored beside --changeRef', (t) => {
    // FAULT-3 regression: both flags used to silently prefer --changeRef.
    const root = gitRoot();
    const {oracle} = makeQuest(root);
    const file = path.join(root, 'solve', 'changes', 'demo', 'manual.diff');
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, [
      'diff --git a/docs/demo.md b/docs/demo.md',
      '--- a/docs/demo.md',
      '+++ b/docs/demo.md',
      '@@ -1 +1 @@',
      '-before',
      '+after',
    ].join('\n'));

    execFileSync('node', [CLI, 'step', '--id', 'demo', '--root', root],
      {encoding: 'utf8'});
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    const out = spawnSync('node', [CLI, 'step', '--id', 'demo', '--commit',
      '--changeRef', `diff:${file}`, '--auto-diff',
      '--summary', 'both flags', '--root', root], {encoding: 'utf8'});
    t.equal(out.status, 0);
    t.match(out.stderr,
      /--auto-diff ignored — an explicit --changeRef takes precedence/u);
    t.match(out.stdout, /recorded attempt on demo-main/u);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('an explicit --changeRef wins over --auto-diff', (t) => {
    const root = gitRoot();
    const {quest, oracle} = makeQuest(root);
    const file = path.join(root, 'solve', 'changes', 'demo', 'manual.diff');
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, [
      'diff --git a/docs/demo.md b/docs/demo.md',
      '--- a/docs/demo.md',
      '+++ b/docs/demo.md',
      '@@ -1 +1 @@',
      '-before',
      '+after',
    ].join('\n'));

    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 2, target: 0}));
    const r = runStep(root, quest, {
      changeRef: `diff:${file}`,
      autoDiff: true,
      summary: 'manual ref',
    });
    t.equal(r.changeRef, `diff:${file}`);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
