import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {saveQuest, appendEvent, appendFinding} from '../../scripts/solve/store.js';
import {runStep} from '../../scripts/solve/step.js';
import {writeReport} from '../../scripts/solve/report.js';
import {
  buildHandoff,
  classifyDirtyPaths,
  renderHandoff,
  autoCommitQuest,
} from '../../scripts/solve/handoff.js';
import {execFileSync} from 'node:child_process';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-'));
}

function makeQuest(root, id = 'demo', oracle = path.join(root, 'oracle.json')) {
  fs.mkdirSync(path.dirname(oracle), {recursive: true});
  fs.writeFileSync(oracle, JSON.stringify({metric: 2, target: 0}));
  const quest = {
    id,
    statement: 'Drive the oracle metric to zero.',
    priority: 1,
    class: 'process',
    doneWhen: {probe: 'oracle', args: {file: oracle}},
    frontiers: [
      {id: `${id}-main`, priority: 1,
        metric: {probe: 'oracle', args: {file: oracle}}},
    ],
  };
  saveQuest(root, quest);
  return {quest, oracle};
}

function makeOwnedOracleQuest(root, id = 'demo') {
  return makeQuest(root, id,
    path.join(root, 'solve', 'oracle', `${id}.json`));
}

function makeDiff(root, questId, name, changedPath = 'src/demo.js') {
  const file = path.join(root, 'solve', 'changes', questId, `${name}.diff`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, [
    `diff --git a/${changedPath} b/${changedPath}`,
    `--- a/${changedPath}`,
    `+++ b/${changedPath}`,
    '@@ -1 +1 @@',
    '-before',
    '+after',
    '',
  ].join('\n'));
  return `diff:${path.relative(root, file)}`;
}

function makeCanonicalDiff(root, questId, name, changedPath) {
  const file = path.join(root, 'solve', 'changes', questId, `${name}.diff`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const content = execFileSync('git', [
    'diff',
    '--binary',
    '--full-index',
    '--no-ext-diff',
    'HEAD',
    '--',
    changedPath,
  ], {cwd: root, encoding: 'utf8'});
  fs.writeFileSync(file, content);
  return `diff:${path.relative(root, file)}`;
}

tap.test('scope-safe handoff (Concern 4)', async (t) => {
  t.test('classifies dirty files into in-scope and out-of-scope', (t) => {
    const scope = {
      files: ['solve/quests/demo.json', 'solve/log/demo.ndjson',
        'solve/report/demo.md', 'solve/state/demo.json'],
      changeDirPrefix: 'solve/changes/demo/',
      diffReferenced: ['src/demo.js', 'test/demo.test.js'],
    };
    const dirty = [
      'solve/quests/demo.json',
      'solve/changes/demo/fix.diff',
      'src/demo.js',
      'test/demo.test.js',
      'src/unrelated.js',
      'solve/quests/other.json',
      'README.md',
    ];
    const {inScope, outOfScope} = classifyDirtyPaths(dirty, scope);
    t.same(inScope, [
      'solve/changes/demo/fix.diff',
      'solve/quests/demo.json',
      'src/demo.js',
      'test/demo.test.js',
    ], 'owns its solve artifacts, change dir and diff-referenced files');
    t.same(outOfScope, [
      'README.md',
      'solve/quests/other.json',
      'src/unrelated.js',
    ], 'excludes other quests and unrelated dirty files');
    t.end();
  });

  t.test('builds a handoff that excludes unrelated dirty files', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'fix', 'docs/demo.md'),
      summary: 'scoped fix',
    });
    // A source-file change requires a recorded subagent verification finding.
    appendFinding(root, quest.id, {
      frontier: `${quest.id}-main`,
      claim: 'subagent verified the source change against quest intent',
      evidence: 'subagent:verify-1',
    });
    writeReport(root, quest.id);

    const dirtyFiles = [
      'solve/quests/demo.json',
      'solve/log/demo.ndjson',
      'solve/report/demo.md',
      'solve/changes/demo/fix.diff',
      'docs/demo.md',
      'src/unrelated-other-quest.js',
      'solve/quests/other-quest.json',
    ];
    const handoff = buildHandoff(root, quest, {dirtyFiles});
    t.ok(handoff.ok, 'audit passed so handoff is allowed');
    t.ok(handoff.inScope.includes('docs/demo.md'), 'includes diff-referenced file');
    t.ok(handoff.inScope.includes('solve/changes/demo/fix.diff'), 'includes change artifact');
    t.ok(handoff.inScope.includes('solve/quests/demo.json'), 'includes quest file');
    t.notOk(handoff.inScope.includes('src/unrelated-other-quest.js'),
      'excludes unrelated source');
    t.notOk(handoff.inScope.includes('solve/quests/other-quest.json'),
      'excludes another quest file');
    t.same(handoff.outOfScope,
      [
        'solve/quests/other-quest.json',
        'solve/report/demo.md',
        'src/unrelated-other-quest.js',
      ].sort(),
      'reports the excluded files explicitly');
    t.notOk(handoff.inScope.includes('solve/report/demo.md'),
      'generated reports are not durable handoff scope');

    const md = renderHandoff(handoff);
    t.match(md, /In scope/, 'renders an in-scope section');
    t.match(md, /Out of scope/, 'renders an out-of-scope section');
    t.match(md, /git add/, 'prints the git add command');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('dry-run and checkpoint own only the current Quest oracle', (t) => {
    const root = tmp();
    const {quest, oracle} = makeOwnedOracleQuest(root);
    const siblingOracle = path.join(root, 'solve/oracle/sibling.json');
    fs.writeFileSync(siblingOracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'fix', 'docs/demo.md'),
      summary: 'scoped fix',
    });
    writeReport(root, quest.id);
    const dirtyFiles = [
      'solve/oracle/demo.json',
      'solve/oracle/sibling.json',
      'solve/quests/demo.json',
    ];

    for (const checkpoint of [false, true]) {
      const handoff = buildHandoff(root, quest, {checkpoint, dirtyFiles});
      t.ok(handoff.inScope.includes('solve/oracle/demo.json'),
        `${checkpoint ? 'checkpoint' : 'terminal'} includes current oracle`);
      t.ok(handoff.outOfScope.includes('solve/oracle/sibling.json'),
        `${checkpoint ? 'checkpoint' : 'terminal'} excludes sibling oracle`);
    }
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('refuses to commit until the quest has finished (commit gate)', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    // An in-progress quest (no SOLVED terminal) must not commit, regardless of any
    // informational audit findings.
    appendEvent(root, quest.id, {
      type: 'attempt',
      frontier: 'demo-main',
      rung: 'local-fix',
      rungIndex: 0,
      metricBefore: 2,
      metricAfter: 1,
      metricDirection: 'lower-is-better',
      evidence: oracle,
      changeRef: 'diff:src/demo.js',
    });
    const handoff = buildHandoff(root, quest, {dirtyFiles: ['solve/quests/demo.json']});
    t.notOk(handoff.ok, 'commit refused because the quest has not finished');
    t.notOk(handoff.gate.ready, 'the commit gate is not ready');
    const md = renderHandoff(handoff);
    t.match(md, /REFUSED/, 'render makes the refusal explicit');
    t.match(md, /full audit/, 'render names the terminal precondition');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a clean in-scope set still commits nothing when nothing is dirty', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'fix', 'docs/demo.md'),
      summary: 'doc fix',
    });
    const handoff = buildHandoff(root, quest, {dirtyFiles: []});
    t.ok(handoff.ok, 'audit passes');
    t.same(handoff.inScope, [], 'nothing dirty means nothing to commit');
    const md = renderHandoff(handoff);
    t.match(md, /nothing to commit/, 'render notes there is nothing to do');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});

function initGit(root) {
  const run = (...args) => execFileSync('git', args, {cwd: root, stdio: 'ignore'});
  run('init');
  run('config', 'user.email', 'solver@example.com');
  run('config', 'user.name', 'Solver');
  run('config', 'commit.gpgsign', 'false');
  // Seed an initial commit so subsequent commits have a parent.
  fs.writeFileSync(path.join(root, '.gitkeep'), '');
  run('add', '-A');
  run('commit', '-m', 'init');
}

function committedFiles(root) {
  return execFileSync('git', ['show', '--name-only', '--format=', 'HEAD'],
    {cwd: root, encoding: 'utf8'}).split('\n').filter(Boolean);
}

tap.test('auto commit (never pushes) (R1)', async (t) => {
  t.test('skips cleanly outside a git work tree', (t) => {
    const root = tmp();
    makeQuest(root);
    const result = autoCommitQuest(root, 'demo');
    t.same(result, {committed: false, skipped: 'not-a-git-work-tree'});
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a passing-audit step commits only in-scope paths and skips pushing',
    (t) => {
      const root = tmp();
      initGit(root);
      const {quest, oracle} = makeQuest(root);
      runStep(root, quest);
      fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
      // An unrelated dirty file must never be swept into the quest commit.
      fs.mkdirSync(path.join(root, 'src'), {recursive: true});
      fs.writeFileSync(path.join(root, 'src', 'unrelated.js'), 'noise');
      execFileSync('git', ['add', 'src/unrelated.js'], {cwd: root, stdio: 'ignore'});
      const r = runStep(root, quest, {
        changeRef: makeDiff(root, quest.id, 'fix', 'docs/demo.md'),
        summary: 'scoped doc fix',
        push: false,
      });
      t.notOk(r.commit.committed, 'attempt recording does not commit');
      t.equal(r.commit.skipped, 'explicit-checkpoint-required');
      const committed = autoCommitQuest(root, quest.id);
      t.ok(committed.committed, 'explicit terminal handoff commits');
      t.equal(committed.pushed, false, 'terminal handoff never pushes');
      const files = committedFiles(root);
      t.ok(files.includes('solve/quests/demo.json'), 'commits the quest file');
      t.ok(files.some((f) => f.startsWith('solve/changes/demo/')),
        'commits the change artifact');
      t.notOk(files.includes('src/unrelated.js'), 'excludes the unrelated file');
      const status = execFileSync('git', ['status', '--porcelain', '-uall'],
        {cwd: root, encoding: 'utf8'});
      t.match(status, /src\/unrelated\.js/, 'unrelated file is left uncommitted');
      // Attribution is explicit; an unconfigured workstation invents no agent identity.
      const msg = execFileSync('git', ['log', '-1', '--format=%B'],
        {cwd: root, encoding: 'utf8'});
      t.notMatch(msg, /Co-Authored-By:/u, 'omits an unconfigured co-author trailer');
      fs.rmSync(root, {recursive: true, force: true});
      t.end();
    });

  t.test('auto-commit commits, nothing else — it never pushes', (t) => {
    const root = tmp();
    initGit(root);
    const {quest, oracle} = makeQuest(root);
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    // Default options, no remote configured: the commit happens and NO push is
    // attempted (so there is no push error to surface).
    const r = runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'fix', 'docs/demo.md'),
      summary: 'scoped doc fix',
    });
    t.notOk(r.commit.committed, 'attempt recording does not commit');
    const committed = autoCommitQuest(root, quest.id);
    t.ok(committed.committed, 'explicit terminal handoff commits');
    t.equal(committed.pushed, false, 'never pushes');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('terminal commit includes its oracle and leaves a sibling dirty', (t) => {
    const root = tmp();
    initGit(root);
    const {quest, oracle} = makeOwnedOracleQuest(root);
    const siblingOracle = path.join(root, 'solve/oracle/sibling.json');
    fs.writeFileSync(siblingOracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'fix', 'docs/demo.md'),
      summary: 'scoped doc fix',
    });

    const committed = autoCommitQuest(root, quest.id);
    t.ok(committed.committed, 'terminal handoff commits');
    t.ok(committedFiles(root).includes('solve/oracle/demo.json'),
      'commit contains the exact current Quest oracle');
    t.notOk(committedFiles(root).includes('solve/oracle/sibling.json'),
      'commit excludes the sibling oracle');
    const status = execFileSync('git', ['status', '--porcelain', '-uall'], {
      cwd: root,
      encoding: 'utf8',
    });
    t.match(status, /solve\/oracle\/sibling\.json/u,
      'sibling oracle remains visibly dirty');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('already-staged tracked deletion commits without unrelated staged work',
    (t) => {
      const root = tmp();
      initGit(root);
      fs.mkdirSync(path.join(root, 'docs'), {recursive: true});
      fs.mkdirSync(path.join(root, 'src'), {recursive: true});
      fs.writeFileSync(path.join(root, 'docs', 'deleted.md'), 'remove me\n');
      fs.writeFileSync(path.join(root, 'src', 'unrelated.js'), 'keep staged\n');
      execFileSync('git', ['add', 'docs/deleted.md'], {cwd: root});
      execFileSync('git', ['commit', '-m', 'track deletion target'], {cwd: root});
      const {quest, oracle} = makeQuest(root);
      runStep(root, quest);
      fs.rmSync(path.join(root, 'docs', 'deleted.md'));
      execFileSync('git', ['add', '--all', '--', 'docs/deleted.md'], {cwd: root});
      execFileSync('git', ['add', 'src/unrelated.js'], {cwd: root});
      fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));

      const result = runStep(root, quest, {
        changeRef: makeDiff(root, quest.id, 'delete', 'docs/deleted.md'),
        summary: 'delete tracked proof',
      });
      t.equal(result.commit.committed, false);
      t.equal(autoCommitQuest(root, quest.id).committed, true);
      t.equal(fs.existsSync(path.join(root, 'docs', 'deleted.md')), false);
      t.notOk(committedFiles(root).includes('src/unrelated.js'));
      const status = execFileSync('git', ['status', '--porcelain', '-uall'], {
        cwd: root,
        encoding: 'utf8',
      });
      t.match(status, /src\/unrelated\.js/u);
      fs.rmSync(root, {recursive: true, force: true});
      t.end();
    });

  t.test('an unverified source change suppresses the commit', (t) => {
    const root = tmp();
    initGit(root);
    const {quest} = makeQuest(root);
    // The quest finishes (metric 0) but the source change has no subagent
    // verification finding, so the commit gate is not met.
    runStep(root, quest);
    fs.mkdirSync(path.join(root, 'src'), {recursive: true});
    fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'export const demo = true;\n');
    execFileSync('git', ['add', '-N', 'src/demo.js'], {cwd: root});
    fs.writeFileSync(path.join(root, 'oracle.json'),
      JSON.stringify({metric: 0, target: 0}));
    const r = runStep(root, quest, {
      changeRef: makeCanonicalDiff(root, quest.id, 'fix', 'src/demo.js'),
      summary: 'unverified source change',
    });
    t.notOk(r.commit.committed, 'no commit when the source change is unverified');
    t.equal(r.commit.skipped, 'explicit-checkpoint-required',
      'points at the explicit checkpoint workflow');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('an unbound legacy-style finding cannot approve a contracted source attempt', (t) => {
    const root = tmp();
    initGit(root);
    const {quest, oracle} = makeQuest(root);
    runStep(root, quest);
    fs.mkdirSync(path.join(root, 'src'), {recursive: true});
    fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'export const demo = true;\n');
    execFileSync('git', ['add', '-N', 'src/demo.js'], {cwd: root});
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    const r = runStep(root, quest, {
      changeRef: makeCanonicalDiff(root, quest.id, 'fix', 'src/demo.js'),
      summary: 'verified source change',
    });
    // Without a verification finding the commit is gated...
    t.notOk(r.commit.committed, 'gated before verification');
    // ...recording one and re-committing via the handoff path now passes the gate.
    appendFinding(root, quest.id, {
      frontier: `${quest.id}-main`,
      claim: 'subagent verified the source change against quest intent',
      evidence: 'subagent:verify-1',
    });
    const after = autoCommitQuest(root, quest.id);
    t.notOk(after.committed, 'content-free prose cannot unlock terminal handoff');
    t.equal(after.skipped, 'commit-gate');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
