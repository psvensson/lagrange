import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';

import {
  continueQuestWorkflow,
  landQuestWorkflow,
  startQuestWorkflow,
} from '../../scripts/solve/operator-workflow.js';
import {buildNextProjection} from '../../scripts/solve/next.js';
import {runStep} from '../../scripts/solve/step.js';
import {
  appendEvent,
  readLog,
  saveQuest,
} from '../../scripts/solve/store.js';
import {
  EVENT_GATE_DECISION,
  OUTCOME_BLOCKED,
} from '../../scripts/solve/constants.js';
import {makeOracleQuest} from './solve-test-quest-fixture.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'operator-workflow-'));
}

function simpleDiff(root, questId, name = 'change') {
  const file = path.join(root, 'solve', 'changes', questId, `${name}.diff`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, [
    'diff --git a/docs/demo.md b/docs/demo.md',
    '--- a/docs/demo.md',
    '+++ b/docs/demo.md',
    '@@ -1 +1 @@',
    '-before',
    '+after',
    '',
  ].join('\n'));
  return `diff:${path.relative(root, file)}`;
}

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function landingFixture(changedPath = 'scripts/demo.js') {
  const root = tmp();
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  const id = changedPath === 'package.json' ? 'solver-facade-land' : 'facade-land';
  const oracle = path.join(root, 'solve', 'oracle', `${id}.json`);
  fs.mkdirSync(path.dirname(oracle), {recursive: true});
  const changedFile = path.join(root, changedPath);
  fs.mkdirSync(path.dirname(changedFile), {recursive: true});
  fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
  fs.writeFileSync(changedFile, changedPath === 'package.json' ?
    '{"version":1}\n' : 'export const value = 1;\n');
  const metric = {probe: 'oracle', args: {file: oracle}};
  const quest = {
    id,
    authoringContractVersion: 1,
    verificationContractVersion: 2,
    statement: 'The façade landing fixture reaches zero.',
    priority: 1,
    class: 'process',
    links: {specRef: 'solve/epics/facade.md'},
    doneWhen: metric,
    frontiers: [{id: `${id}-main`, priority: 1, metric}],
    constraints: [],
  };
  saveQuest(root, quest);
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);
  runStep(root, quest);
  fs.writeFileSync(changedFile, changedPath === 'package.json' ?
    '{"version":2}\n' : 'export const value = 2;\n');
  fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
  const content = git(root, [
    'diff', '--binary', '--full-index', '--no-ext-diff', 'HEAD', '--',
    changedPath,
  ]);
  const artifact = path.join(root, 'solve', 'changes', id, 'candidate.diff');
  fs.mkdirSync(path.dirname(artifact), {recursive: true});
  fs.writeFileSync(artifact, `${content}\n`);
  runStep(root, quest, {
    changeRef: `diff:${path.relative(root, artifact)}`,
    summary: 'change the landing fixture',
  });
  return {root, id};
}

function nonSourceLandingFixture() {
  const root = tmp();
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  const id = 'facade-doc-land';
  const oracle = path.join(root, 'solve', 'oracle', `${id}.json`);
  const doc = path.join(root, 'docs', 'demo.md');
  fs.mkdirSync(path.dirname(oracle), {recursive: true});
  fs.mkdirSync(path.dirname(doc), {recursive: true});
  fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
  fs.writeFileSync(doc, 'before\n');
  const metric = {probe: 'oracle', args: {file: oracle}};
  const quest = {
    id,
    authoringContractVersion: 1,
    verificationContractVersion: 2,
    statement: 'The façade documentation fixture reaches zero.',
    priority: 1,
    class: 'process',
    links: {specRef: 'solve/epics/facade.md'},
    doneWhen: metric,
    frontiers: [{id: `${id}-main`, priority: 1, metric}],
    constraints: [],
  };
  saveQuest(root, quest);
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);
  runStep(root, quest);
  fs.writeFileSync(doc, 'after\n');
  fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
  const artifact = path.join(root, 'solve', 'changes', id, 'candidate.diff');
  fs.mkdirSync(path.dirname(artifact), {recursive: true});
  fs.writeFileSync(artifact, `${git(root, [
    'diff', '--binary', '--full-index', '--no-ext-diff', 'HEAD', '--', 'docs/demo.md',
  ])}\n`);
  runStep(root, quest, {
    changeRef: `diff:${path.relative(root, artifact)}`,
    summary: 'change the documentation fixture',
  });
  return {root, id};
}

tap.test('next exposes stable action codes and continue dispatches only those codes',
  (t) => {
    const root = tmp();
    const {quest} = makeOracleQuest(root);
    const started = startQuestWorkflow(root, {
      id: quest.id,
      doctor: {ok: true, recommendedMode: 'supervised'},
    });
    t.equal(started.lint.status, 'pass');
    t.equal(started.next.action.code, 'begin-step');
    t.equal(readLog(root, quest.id).length, 0,
      'start validates without sealing or beginning');

    t.throws(() => continueQuestWorkflow(root, {
      id: quest.id,
      ['auto-diff']: true,
      summary: 'premature capture',
    }), /begin-step does not accept/iu);
    const begun = continueQuestWorkflow(root, {id: quest.id});
    t.equal(begun.executed, true);
    t.equal(begun.operation, 'begin-step');
    t.equal(begun.next.action.code, 'commit-step');
    t.throws(() => continueQuestWorkflow(root, {id: quest.id}),
      /requires explicit --changeRef/iu);
    const committed = continueQuestWorkflow(root, {
      id: quest.id,
      changeRef: simpleDiff(root, quest.id),
      summary: 'record the explicit fixture change',
    });
    t.equal(committed.operation, 'commit-step');
    t.equal(readLog(root, quest.id).filter((event) => event.type === 'attempt').length, 1);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

tap.test('start optionally creates and lints a draft without declaring it', (t) => {
  const root = tmp();
  const cli = path.resolve('scripts/solve.js');
  const result = spawnSync(process.execPath, [
    cli,
    'start',
    '--root', root,
    '--id', 'created-by-start',
    '--statement', 'The start façade creates a lintable draft.',
    '--class', 'process',
    '--spec-ref', 'solve/epics/facade.md',
    '--json',
  ], {encoding: 'utf8'});
  t.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  t.equal(output.lint.status, 'pass');
  t.equal(output.next.action.code, 'begin-step');
  t.equal(readLog(root, 'created-by-start').length, 0,
    'start does not declare or begin the new draft');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('continue never executes rendered command strings or gate actions', (t) => {
  const root = tmp();
  const {quest} = makeOracleQuest(root);
  const sentinel = path.join(root, 'rendered-command-ran');
  appendEvent(root, quest.id, {
    type: EVENT_GATE_DECISION,
    frontier: `${quest.id}-main`,
    disposition: 'reroute',
    code: 'blocked-scope',
    outcome: OUTCOME_BLOCKED,
    problems: ['operator judgment required'],
    nextCommand: `node -e "require('fs').writeFileSync('${sentinel}', 'bad')"`,
  });
  const projection = buildNextProjection(root, quest.id);
  t.equal(projection.action.code, 'operator-action');
  const result = continueQuestWorkflow(root, {id: quest.id});
  t.equal(result.executed, false);
  t.equal(fs.existsSync(sentinel), false);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('land rejects drift and records rejection without committing', (t) => {
  const {root, id} = landingFixture();
  const beforeHead = git(root, ['rev-parse', 'HEAD']);
  const projection = buildNextProjection(root, id);
  t.equal(projection.action.code, 'request-verification');
  const fingerprint = projection.verification.candidateFingerprint;
  t.throws(() => landQuestWorkflow(root, {
    id,
    verifier: 'facade-reviewer',
    verdict: 'reject',
    fingerprint: `sha256:${'0'.repeat(64)}`,
  }), /does not match current candidate bytes/iu);
  const rejected = landQuestWorkflow(root, {
    id,
    verifier: 'facade-reviewer',
    verdict: 'reject',
    fingerprint,
    receipt: 'review:facade-rejection',
  });
  t.equal(rejected.committed, false);
  t.equal(git(root, ['rev-parse', 'HEAD']), beforeHead);
  t.ok(readLog(root, id).some((event) =>
    event.kind === 'verifier-rejection' &&
    event.verification?.fingerprint === fingerprint));
  t.equal(rejected.next.action.code, 'replace-rejected-attempt');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('land validates aggregate approval and scope-safely commits without push', (t) => {
  const {root, id} = landingFixture();
  const beforeHead = git(root, ['rev-parse', 'HEAD']);
  const fingerprint = buildNextProjection(root, id).verification.aggregateFingerprint;
  t.throws(() => landQuestWorkflow(root, {
    id,
    verifier: 'facade-reviewer',
    verdict: 'approve',
    fingerprint,
  }), /--receipt/iu);
  const landed = landQuestWorkflow(root, {
    id,
    verifier: 'facade-reviewer',
    verdict: 'approve',
    fingerprint,
    receipt: 'review:facade-approval',
  });
  t.equal(landed.committed, true);
  t.not(git(root, ['rev-parse', 'HEAD']), beforeHead);
  t.equal(landed.commit.pushed, false);
  t.equal(landed.next.action.code, 'land');
  t.equal(git(root, ['status', '--porcelain', '-uall']), '');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('land refuses residual audit failures before recording approval', (t) => {
  const {root, id} = landingFixture('package.json');
  const fingerprint = buildNextProjection(root, id).verification.aggregateFingerprint;
  t.throws(() => landQuestWorkflow(root, {
    id,
    verifier: 'facade-reviewer',
    verdict: 'approve',
    fingerprint,
    receipt: 'review:must-not-record',
  }), /terminal audit has non-verification problems.*model/iu);
  t.notOk(readLog(root, id).some((event) => event.kind === 'verifier-approval'),
    'an unusable approval receipt is never appended');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('land commits a non-source terminal without invented verification', (t) => {
  const {root, id} = nonSourceLandingFixture();
  const beforeHead = git(root, ['rev-parse', 'HEAD']);
  t.equal(buildNextProjection(root, id).action.code, 'land');
  const landed = landQuestWorkflow(root, {id});
  t.equal(landed.verdict, 'not-required');
  t.equal(landed.committed, true);
  t.not(git(root, ['rev-parse', 'HEAD']), beforeHead);
  t.notOk(readLog(root, id).some((event) =>
    event.kind === 'verifier-approval' || event.kind === 'verifier-rejection'));
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});
