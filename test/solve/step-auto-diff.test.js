import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';

import {saveQuest} from '../../scripts/solve/store.js';
import {runStep, stepPending} from '../../scripts/solve/step.js';

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
