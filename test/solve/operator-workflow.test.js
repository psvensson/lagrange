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
import {assertReviewCurrent} from '../../scripts/solve/review-request.js';
import {landingReviewPreflight} from '../../scripts/solve/landing-preflight.js';
import {inspectChangeArtifact} from '../../scripts/solve/change-artifact.js';
import {runStep} from '../../scripts/solve/step.js';
import {
  appendEvent,
  loadQuest,
  readLog,
  saveQuest,
} from '../../scripts/solve/store.js';
import {verificationState} from '../../scripts/solve/verification.js';
import {
  EVENT_GATE_DECISION,
  EVENT_THEORY_OPTION_DECLARED,
  EVENT_THEORY_SELECTED,
  OUTCOME_BLOCKED,
  THEORY_RESULT_FALSIFIED,
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

function landingFixture(changedPath = 'scripts/demo.js', finalMetric = 0) {
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
  fs.writeFileSync(oracle, JSON.stringify({metric: finalMetric, target: 0}));
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
      /requires --summary/iu);
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

tap.test('continue treats a commit summary as implicit auto-diff capture', (t) => {
  const root = tmp();
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  const {quest, oracle} = makeOracleQuest(root);
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'before\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);

  continueQuestWorkflow(root, {id: quest.id});
  fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'after\n');
  fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
  const committed = continueQuestWorkflow(root, {
    id: quest.id,
    summary: 'capture the changed source automatically',
  });

  t.equal(committed.operation, 'commit-step');
  t.match(committed.result.changeRef,
    /^diff:solve\/changes\/demo\/attempt-1\.diff(?:\.json)?$/u);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('continue excludes inventories left dirty by a failed final commit', (t) => {
  const root = tmp();
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  const {quest, oracle} = makeOracleQuest(root);
  const source = path.join(root, 'src', 'demo.js');
  const inventory = path.join(root,
    'solve/changes/global-owner-debt-inventory/inventory.json');
  const priorAttemptObject = path.join(root,
    'solve/artifacts/sha256/aa/prior.diff.gz');
  fs.mkdirSync(path.dirname(source), {recursive: true});
  fs.mkdirSync(path.dirname(inventory), {recursive: true});
  fs.writeFileSync(source, 'before\n');
  fs.writeFileSync(inventory, '{"epoch":"before"}\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);

  continueQuestWorkflow(root, {id: quest.id});
  fs.writeFileSync(source, 'after\n');
  fs.writeFileSync(inventory, '{"epoch":"refreshed"}\n');
  fs.mkdirSync(path.dirname(priorAttemptObject), {recursive: true});
  fs.writeFileSync(priorAttemptObject, 'prior immutable object\n');
  git(root, ['add', priorAttemptObject]);
  fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
  const committed = continueQuestWorkflow(root, {
    id: quest.id,
    summary: 'capture only authored source after a failed landing',
  });
  const inspection = inspectChangeArtifact(
    root, quest, committed.result.changeRef);

  t.ok(inspection.changedPaths.includes('src/demo.js'),
    'the authored replacement remains in the attempt');
  t.notOk(inspection.changedPaths.includes(
    'solve/changes/global-owner-debt-inventory/inventory.json'),
  'final-commit projections never inflate a replacement attempt');
  t.notOk(inspection.changedPaths.includes(
    'solve/artifacts/sha256/aa/prior.diff.gz'),
  'prior attempt objects never inflate their replacement attempt');
  t.match(fs.readFileSync(inventory, 'utf8'), /refreshed/u,
    'the generated output remains dirty for the next final commit');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('continue executes a ready source checkpoint through the facade', (t) => {
  const {root, id} = landingFixture('scripts/demo.js', 1);
  const dossier = buildNextProjection(root, id)
    .verification.checkpointPreflight.candidate.dossier;
  appendEvent(root, id, {
    type: 'finding',
    frontier: `${id}-main`,
    kind: 'verifier-approval',
    claim: 'independent checkpoint verification passed',
    evidence: 'subagent:facade-checkpoint',
    verification: {
      schemaVersion: 2,
      scope: 'candidate',
      fingerprint: dossier.fingerprint,
      baseCommit: dossier.baseCommit,
      paths: dossier.paths,
      sourcePaths: dossier.sourcePaths,
      firstAttemptIndex: dossier.firstAttemptIndex,
      lastAttemptIndex: dossier.lastAttemptIndex,
    },
  });
  t.equal(buildNextProjection(root, id).action.code, 'checkpoint');
  const beforeHead = git(root, ['rev-parse', 'HEAD']);

  const result = continueQuestWorkflow(root, {id});

  t.equal(result.executed, true);
  t.equal(result.operation, 'checkpoint');
  t.match(result.result, /checkpointed/u);
  t.not(git(root, ['rev-parse', 'HEAD']), beforeHead);
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
  t.throws(() => landQuestWorkflow(root, {
    id,
    verifier: 'facade-reviewer',
    verdict: 'reject',
    fingerprint,
    receipt: 'review:facade-rejection',
  }), /a rejection requires/u,
  'a rejection without a categorized finding list is refused');
  const rejected = landQuestWorkflow(root, {
    id,
    verifier: 'facade-reviewer',
    verdict: 'reject',
    fingerprint,
    receipt: 'review:facade-rejection',
    finding: 'correctness: the rejected candidate omitted paired comparison',
  });
  t.equal(rejected.committed, false);
  t.equal(git(root, ['rev-parse', 'HEAD']), beforeHead);
  t.ok(readLog(root, id).some((event) =>
    event.kind === 'verifier-rejection' &&
    event.verification?.fingerprint === fingerprint));
  t.equal(rejected.next.quest.status, 'open',
    'the categorized rejection itself reopens the Quest');
  t.equal(rejected.next.action.code, 'replace-rejected-attempt');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('one continue summary begins and captures a rejected replacement', (t) => {
  const {root, id} = landingFixture();
  const before = buildNextProjection(root, id);
  const rejectedFingerprint = before.verification.candidateFingerprint;
  landQuestWorkflow(root, {
    id,
    verifier: 'facade-reviewer',
    verdict: 'reject',
    fingerprint: rejectedFingerprint,
    receipt: 'review:facade-rejection',
    finding: 'correctness: the candidate omitted the replacement behavior',
  });

  fs.writeFileSync(path.join(root, 'scripts', 'demo.js'),
    'export const value = 3;\n');
  const replaced = continueQuestWorkflow(root, {
    id,
    summary: 'capture the verifier-required replacement',
  });

  t.equal(replaced.operation, 'replace-rejected-attempt');
  t.equal(replaced.begin.terminal, null,
    'the same call begins against the automatically reopened projection');
  t.match(replaced.result.changeRef,
    /^diff:solve\/changes\/facade-land\/attempt-1\.diff(?:\.json)?$/u);
  t.equal(readLog(root, id).filter((event) => event.type === 'attempt').length, 2);
  t.not(buildNextProjection(root, id).verification.candidateFingerprint,
    rejectedFingerprint, 'the one-call replacement has new exact bytes');
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

tap.test('land issues an immutable review id and accepts a verdict by id', (t) => {
  const {root, id} = landingFixture();
  const requested = landQuestWorkflow(root, {id});
  t.equal(requested.verdict, 'needs-review');
  t.equal(requested.review.preflight.cached, false,
    'the review is minted only after a fresh changed-path preflight');
  t.match(requested.review.id, /^review-[0-9a-f]{24}$/u);
  t.equal(requested.committed, false);
  t.equal(fs.existsSync(path.join(
    root,
    'solve/state/reviews',
    `${requested.review.id}.json`,
  )), true);

  const repeated = landQuestWorkflow(root, {id});
  t.equal(repeated.review.id, requested.review.id,
    'unchanged bytes retain the immutable review identity');
  t.equal(repeated.review.preflight.cached, true,
    'the source-digest result is reused instead of rerunning checkers');

  const landed = landQuestWorkflow(root, {
    id,
    review: requested.review.id,
    verifier: 'review-id-verifier',
    verdict: 'approve',
    receipt: 'review:immutable-id',
  });
  t.equal(landed.committed, true);
  t.equal(landed.fingerprint, requested.review.manifest.aggregate.fingerprint);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('land refuses static preflight before minting a review id', (t) => {
  const {root, id} = landingFixture();
  const eslint = path.join(root, 'node_modules', 'eslint', 'bin', 'eslint.js');
  fs.mkdirSync(path.dirname(eslint), {recursive: true});
  fs.writeFileSync(eslint, 'process.stderr.write("fixture lint failure\\n");\n' +
    'process.exitCode = 1;\n');

  t.throws(() => landQuestWorkflow(root, {id}),
    /changed-path preflight failed.*eslint/isu);
  t.equal(fs.existsSync(path.join(root, 'solve', 'state', 'reviews')), false,
    'a failing cheap preflight creates no immutable review artifact');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('land refuses silent catches before minting a review id', (t) => {
  const {root, id} = landingFixture();
  const checker = path.join(root, 'scripts',
    'check-guideline-silent-catch.js');
  fs.writeFileSync(checker,
    'process.stderr.write("fixture silent catch\\n");\nprocess.exitCode = 1;\n');

  t.throws(() => landQuestWorkflow(root, {id}),
    /changed-path preflight failed.*silent-catch/isu);
  t.equal(fs.existsSync(path.join(root, 'solve', 'state', 'reviews')), false,
    'silent-catch failure creates no immutable review artifact');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('land preflight skips deleted paths in the silent-catch stage', (t) => {
  const {root} = landingFixture();
  // A dead-code-removal candidate legitimately deletes a source file; the
  // silent-catch checker stats every path it is handed, so the preflight
  // must filter absent paths instead of crashing on ENOENT. Simulate by
  // handing the preflight a manifest whose aggregate names a path that no
  // longer exists in the worktree, with a checker that fails closed when it
  // is handed a path it cannot stat (mirroring collectJavaScriptFiles).
  const checker = path.join(root, 'scripts',
    'check-guideline-silent-catch.js');
  fs.writeFileSync(checker, [
    'const fs = require(\'node:fs\');',
    'for (const arg of process.argv.slice(2)) {',
    '  if (!arg.endsWith(\'.js\')) continue;',
    '  try { fs.statSync(arg); }',
    '  catch { process.stderr.write(`ENOENT ${arg}\\n`); ' +
      'process.exitCode = 1; }',
    '}',
    '',
  ].join('\n'));
  const deletedRelative = 'scripts/deleted-by-candidate.js';
  const manifest = {
    candidate: {files: []},
    aggregate: {
      fingerprint: `sha256:${'c'.repeat(64)}`,
      sourcePaths: ['scripts/demo.js', deletedRelative],
    },
  };
  let result;
  t.doesNotThrow(() => {
    result = landingReviewPreflight(root, manifest);
  }, 'a deleted candidate path must not crash the silent-catch stage');
  t.equal(result.status, 'pass');
  t.ok(result.paths.includes(deletedRelative),
    'the deleted path stays in the manifest path list');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('land refuses import gaps before minting a review id', (t) => {
  const {root, id} = landingFixture();
  const importer = path.join(root, 'scripts', 'demo.js');
  const imported = path.join(root, 'scripts', 'helper.js');
  fs.writeFileSync(importer,
    'import \'./helper.js\';\nexport const value = 2;\n');
  fs.writeFileSync(imported, 'export const helper = true;\n');
  git(root, ['add', '-N', '--', 'scripts/helper.js']);

  t.throws(() => landQuestWorkflow(root, {id}),
    /review preflight found import-closure gaps.*helper\.js/isu);
  t.equal(fs.existsSync(path.join(root, 'solve', 'state', 'reviews')), false,
    'an incomplete import boundary creates no immutable review artifact');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('landing preflight cache follows baseline and intrinsic inputs', (t) => {
  const {root, id} = landingFixture();
  const baseline = path.join(root,
    'scripts', 'check-guideline-literals-baseline.json');
  const checker = path.join(root, 'scripts', 'check-guideline-literals.js');
  fs.writeFileSync(baseline, '["allow"]\n');
  fs.writeFileSync(checker, [
    'const fs = require(\'node:fs\');',
    `const baseline = fs.readFileSync(${JSON.stringify(baseline)}, 'utf8');`,
    'if (baseline.trim() === \'[]\') process.exitCode = 1;',
    '',
  ].join('\n'));
  const requested = landQuestWorkflow(root, {id});
  t.equal(requested.review.preflight.cached, false);
  fs.writeFileSync(baseline, '[]\n');
  t.throws(() => landQuestWorkflow(root, {id}),
    /changed-path preflight failed.*literal-guideline/isu,
    'a real checker baseline change invalidates a cached pass');

  fs.writeFileSync(baseline, '["allow"]\n');
  const target = path.join(root, 'scripts', 'hostile.js');
  const eslint = path.join(root, 'node_modules', 'eslint', 'bin', 'eslint.js');
  fs.mkdirSync(path.dirname(eslint), {recursive: true});
  fs.writeFileSync(target, 'good\n');
  fs.writeFileSync(eslint, [
    'const fs = require(\'node:fs\');',
    `if (fs.readFileSync(${JSON.stringify(target)}, 'utf8').includes('bad')) ` +
      'process.exitCode = 1;',
    '',
  ].join('\n'));
  const manifest = (fingerprint) => ({
    aggregate: {fingerprint, sourcePaths: ['scripts/hostile.js']},
  });
  const pristineStringify = JSON.stringify;
  try {
    JSON.stringify = (...args) => args.length === 1 ?
      'hostile-cache-collision' : pristineStringify(...args);
    landingReviewPreflight(root, manifest(`sha256:${'a'.repeat(64)}`));
    fs.writeFileSync(target, 'bad\n');
    t.throws(() => landingReviewPreflight(
      root, manifest(`sha256:${'b'.repeat(64)}`)),
    /changed-path preflight failed.*eslint/isu,
    'ambient JSON replacement cannot collide distinct source digests');
  } finally {
    JSON.stringify = pristineStringify;
  }
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('inventory output lock is held through the final Git commit', (t) => {
  const {root, id} = landingFixture();
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.mkdirSync(path.join(root, 'test'), {recursive: true});
  const outputs = [
    path.join(root,
      'solve/changes/global-owner-debt-inventory/inventory.json'),
    path.join(root,
      'solve/changes/priority-recovery-owner-inventory/inventory.json'),
  ];
  for (const [index, name] of [
    'generate-global-owner-debt-inventory.js',
    'generate-priority-recovery-owner-inventory.js',
  ].entries()) {
    fs.writeFileSync(path.join(root, 'scripts', name), [
      'const fs = require(\'node:fs\');',
      'const path = require(\'node:path\');',
      `fs.mkdirSync(path.dirname(${JSON.stringify(outputs[index])}), ` +
        '{recursive: true});',
      `fs.writeFileSync(${JSON.stringify(outputs[index])}, 'fresh\\n');`,
      '',
    ].join('\n'));
  }
  const hook = path.join(root, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\n' +
    'test -e solve/state/inventory-refresh/refresh.lock\n');
  fs.chmodSync(hook, 0o755);
  const fingerprint = buildNextProjection(root, id)
    .verification.aggregateFingerprint;
  const landed = landQuestWorkflow(root, {
    id,
    verifier: 'lock-scope-reviewer',
    verdict: 'approve',
    fingerprint,
    receipt: 'review:lock-through-consumption',
  });
  t.equal(landed.committed, true,
    'the pre-commit consumer still observes the shared-output lock');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('land refuses a review id after source bytes drift', (t) => {
  const {root, id} = landingFixture();
  const requested = landQuestWorkflow(root, {id});
  fs.appendFileSync(path.join(root, 'scripts/demo.js'), '// drift\n');
  t.throws(() => landQuestWorkflow(root, {
    id,
    review: requested.review.id,
    verifier: 'review-id-verifier',
    verdict: 'approve',
    receipt: 'review:stale-id',
  }), /review .* no longer matches current candidate bytes/iu);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('review drift checks use the pristine JSON serializer', (t) => {
  const {root, id} = landingFixture();
  const requested = landQuestWorkflow(root, {id});
  const nativeStringify = JSON.stringify;
  const frozenManifest = nativeStringify(requested.review.manifest);
  fs.appendFileSync(path.join(root, 'scripts/demo.js'), '// drift\n');
  const quest = loadQuest(root, id);
  const state = verificationState(root, quest, readLog(root, id));
  let caught = null;
  try {
    Reflect.defineProperty(JSON, 'stringify', {
      value: () => frozenManifest,
      configurable: true,
      writable: true,
    });
    try {
      assertReviewCurrent(root, quest, state, requested.review.id);
    } catch (error) {
      caught = error;
    }
  } finally {
    Reflect.defineProperty(JSON, 'stringify', {
      value: nativeStringify,
      configurable: true,
      writable: true,
    });
  }
  t.match(caught?.message, /no longer matches current candidate bytes/iu);
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

tap.test('land does not confuse an audit-message substring with the expected receipt',
  (t) => {
    const {root, id} = landingFixture();
    const fingerprint = buildNextProjection(root, id).verification.aggregateFingerprint;
    const collision = `collision-requires a later aggregate approval for ${fingerprint}`;
    appendEvent(root, id, {
      type: EVENT_THEORY_OPTION_DECLARED,
      frontier: `${id}-main`,
      theory: collision,
      scope: 'frontier',
      status: THEORY_RESULT_FALSIFIED,
    });
    appendEvent(root, id, {
      type: EVENT_THEORY_SELECTED,
      frontier: `${id}-main`,
      theory: collision,
    });
    t.throws(() => landQuestWorkflow(root, {
      id,
      verifier: 'facade-reviewer',
      verdict: 'approve',
      fingerprint,
      receipt: 'review:must-not-record-substring-collision',
    }), /terminal audit has non-verification problems.*selected theory/iu);
    t.notOk(readLog(root, id).some((event) => event.kind === 'verifier-approval'),
      'a substring collision cannot append an unusable approval');
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
