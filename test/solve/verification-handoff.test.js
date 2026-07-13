import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

import {checkpointGate, auditQuest} from '../../scripts/solve/audit.js';
import {
  buildHandoff,
  runCheckpointCommand,
} from '../../scripts/solve/handoff.js';
import {runStep} from '../../scripts/solve/step.js';
import {writeReport} from '../../scripts/solve/report.js';
import {
  appendFinding,
  readLog,
  saveQuest,
} from '../../scripts/solve/store.js';
import {
  aggregateSourceFingerprint,
  buildVerificationFinding,
  sourceChangingAttempts,
  verificationState,
} from '../../scripts/solve/verification.js';

function git(root, args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  });
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verification-handoff-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'src', 'a.js'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, 'src', 'b.js'), 'export const b = 1;\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);

  const oracle = path.join(root, 'oracle.json');
  fs.writeFileSync(oracle, JSON.stringify({metric: 2, target: 0}));
  const quest = {
    id: 'runtime-verify',
    statement: 'The runtime verification fixture reaches zero.',
    priority: 1,
    class: 'product',
    links: {specRef: 'solve/specs/runtime-verify.md'},
    doneWhen: {probe: 'oracle', args: {file: oracle}},
    frontiers: [{
      id: 'runtime-verify-main',
      priority: 1,
      metric: {probe: 'oracle', args: {file: oracle}},
    }],
    constraints: [],
  };
  saveQuest(root, quest);
  return {root, quest, oracle};
}

function canonicalDiff(root, quest, baseCommit, changedPath, name) {
  const changedPaths = Array.isArray(changedPath) ? changedPath : [changedPath];
  const content = git(root, [
    'diff', '--binary', '--full-index', '--no-ext-diff', baseCommit,
    '--', ...changedPaths,
  ]);
  const file = path.join(root, 'solve', 'changes', quest.id, `${name}.diff`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
  return `diff:${path.relative(root, file)}`;
}

function latestAttempt(root, quest) {
  return [...readLog(root, quest.id)].reverse()
    .find((event) => event.type === 'attempt');
}

function approve(root, quest, scope, fingerprint) {
  return appendFinding(root, quest.id, {
    frontier: 'runtime-verify-main',
    kind: 'verifier-approval',
    claim: `independent ${scope} verification passed`,
    evidence: `subagent:${scope}-verifier`,
    verification: {schemaVersion: 1, scope, fingerprint},
  });
}

function recordAttempt({root, quest, oracle}, changedPath, metric, name) {
  const pending = runStep(root, quest);
  fs.writeFileSync(path.join(root, changedPath),
    `export const ${path.basename(changedPath, '.js')} = ${2 - metric + 2};\n`);
  fs.writeFileSync(oracle, JSON.stringify({metric, target: 0}));
  const changeRef = canonicalDiff(
    root, quest, pending.before.evidenceIdentity ?
      JSON.parse(fs.readFileSync(
        path.join(root, 'solve', 'state', `${quest.id}.pending.json`), 'utf8'))
        .headCommit : git(root, ['rev-parse', 'HEAD']).trim(),
    changedPath,
    name,
  );
  return runStep(root, quest, {
    changeRef,
    summary: `${name} source change`,
  });
}

tap.test('content-bound verification and explicit handoff', async (t) => {
  t.test('checkpoint requires exact approval and rejects a post-approval edit', (t) => {
    const fx = fixture();
    recordAttempt(fx, 'src/a.js', 1, 'a');
    const attempt = latestAttempt(fx.root, fx.quest);
    const fingerprint = `sha256:${attempt.changeRefIdentity.sha256}`;

    approve(fx.root, fx.quest, 'attempt', `sha256:${'0'.repeat(64)}`);
    t.equal(checkpointGate(fx.root, fx.quest).status, 'fail',
      'wrong fingerprint cannot approve the attempt');
    approve(fx.root, fx.quest, 'attempt', fingerprint);
    t.equal(checkpointGate(fx.root, fx.quest).status, 'pass');

    fs.appendFileSync(path.join(fx.root, 'src', 'a.js'), '// after approval\n');
    t.match(
      checkpointGate(fx.root, fx.quest).problems.map((item) => item.message).join('\n'),
      /changed after approval/u,
    );
    fs.rmSync(fx.root, {recursive: true, force: true});
    t.end();
  });

  t.test('checkpoint rechecks every approved uncheckpointed attempt', (t) => {
    const fx = fixture();
    recordAttempt(fx, 'src/a.js', 1, 'a');
    const first = latestAttempt(fx.root, fx.quest);
    approve(fx.root, fx.quest, 'attempt', `sha256:${first.changeRefIdentity.sha256}`);
    recordAttempt(fx, 'src/b.js', 0, 'b');
    const second = latestAttempt(fx.root, fx.quest);
    approve(fx.root, fx.quest, 'attempt', `sha256:${second.changeRefIdentity.sha256}`);
    t.equal(checkpointGate(fx.root, fx.quest).status, 'pass');

    fs.appendFileSync(path.join(fx.root, 'src', 'a.js'), '// tampered after approval\n');
    t.match(
      checkpointGate(fx.root, fx.quest).problems.map((item) => item.message).join('\n'),
      /a\.diff.*changed after approval/u,
    );
    fs.rmSync(fx.root, {recursive: true, force: true});
    t.end();
  });

  t.test('a later exact checkpoint may intentionally revise the same file', (t) => {
    const fx = fixture();
    recordAttempt(fx, 'src/a.js', 1, 'a-first');
    let attempt = latestAttempt(fx.root, fx.quest);
    approve(fx.root, fx.quest, 'attempt', `sha256:${attempt.changeRefIdentity.sha256}`);
    runCheckpointCommand(fx.root, {id: fx.quest.id, _: []});

    recordAttempt(fx, 'src/a.js', 0, 'a-second');
    attempt = latestAttempt(fx.root, fx.quest);
    approve(fx.root, fx.quest, 'attempt', `sha256:${attempt.changeRefIdentity.sha256}`);
    t.equal(checkpointGate(fx.root, fx.quest).status, 'pass');
    t.match(runCheckpointCommand(fx.root, {id: fx.quest.id, _: []}), /checkpointed/u);
    fs.rmSync(fx.root, {recursive: true, force: true});
    t.end();
  });

  t.test('post-checkpoint source dirt needs a new exact attempt receipt', (t) => {
    const fx = fixture();
    recordAttempt(fx, 'src/a.js', 1, 'a');
    const attempt = latestAttempt(fx.root, fx.quest);
    approve(fx.root, fx.quest, 'attempt', `sha256:${attempt.changeRefIdentity.sha256}`);
    runCheckpointCommand(fx.root, {id: fx.quest.id, _: []});
    const before = Number(git(fx.root, ['rev-list', '--count', 'HEAD']).trim());

    fs.appendFileSync(path.join(fx.root, 'src', 'a.js'), '// no receipt\n');
    t.match(
      checkpointGate(fx.root, fx.quest).problems.map((item) => item.message).join('\n'),
      /no uncheckpointed exact attempt receipt/u,
    );
    t.match(runCheckpointCommand(fx.root, {id: fx.quest.id, _: []}), /not checkpointed/u);
    t.equal(Number(git(fx.root, ['rev-list', '--count', 'HEAD']).trim()), before);
    fs.rmSync(fx.root, {recursive: true, force: true});
    t.end();
  });

  t.test('checkpoint exactness includes non-source paths in a mixed attempt', (t) => {
    const fx = fixture();
    fs.mkdirSync(path.join(fx.root, 'docs'), {recursive: true});
    fs.writeFileSync(path.join(fx.root, 'docs', 'guide.md'), 'before\n');
    git(fx.root, ['add', 'docs/guide.md']);
    git(fx.root, ['commit', '-m', 'add guide']);

    const baseCommit = git(fx.root, ['rev-parse', 'HEAD']).trim();
    runStep(fx.root, fx.quest);
    fs.writeFileSync(path.join(fx.root, 'src', 'a.js'), 'export const a = 2;\n');
    fs.writeFileSync(path.join(fx.root, 'docs', 'guide.md'), 'after\n');
    fs.writeFileSync(fx.oracle, JSON.stringify({metric: 1, target: 0}));
    const changeRef = canonicalDiff(
      fx.root,
      fx.quest,
      baseCommit,
      ['docs/guide.md', 'src/a.js'],
      'mixed',
    );
    runStep(fx.root, fx.quest, {changeRef, summary: 'mixed source and docs change'});
    const attempt = latestAttempt(fx.root, fx.quest);
    approve(fx.root, fx.quest, 'attempt', `sha256:${attempt.changeRefIdentity.sha256}`);
    t.equal(checkpointGate(fx.root, fx.quest).status, 'pass');
    fs.rmSync(fx.root, {recursive: true, force: true});
    t.end();
  });

  t.test('structured approval requires a non-empty stable verifier id', (t) => {
    for (const evidence of ['subagent:', 'subagent:two words']) {
      t.throws(() => buildVerificationFinding({
        kind: 'verifier-approval',
        evidence,
        verificationScope: 'attempt',
        verificationFingerprint: `sha256:${'0'.repeat(64)}`,
      }), /non-empty-stable-id/u);
    }
    t.end();
  });

  t.test('explicit checkpoint commits once while finding alone never commits', (t) => {
    const fx = fixture();
    recordAttempt(fx, 'src/a.js', 1, 'a');
    const attempt = latestAttempt(fx.root, fx.quest);
    const beforeApproval = Number(git(fx.root, ['rev-list', '--count', 'HEAD']).trim());
    approve(fx.root, fx.quest, 'attempt',
      `sha256:${attempt.changeRefIdentity.sha256}`);
    t.equal(Number(git(fx.root, ['rev-list', '--count', 'HEAD']).trim()),
      beforeApproval, 'recording a finding has no commit side effect');

    const output = runCheckpointCommand(fx.root, {id: fx.quest.id, _: []});
    t.match(output, /checkpointed/u);
    t.equal(Number(git(fx.root, ['rev-list', '--count', 'HEAD']).trim()),
      beforeApproval + 1, 'the explicit checkpoint makes one commit');
    fs.rmSync(fx.root, {recursive: true, force: true});
    t.end();
  });

  t.test('terminal handoff requires aggregate approval and the full audit', (t) => {
    const fx = fixture();
    recordAttempt(fx, 'src/a.js', 0, 'a');
    const attempt = latestAttempt(fx.root, fx.quest);
    const attemptFingerprint = `sha256:${attempt.changeRefIdentity.sha256}`;
    const attempts = sourceChangingAttempts(
      fx.root, fx.quest, readLog(fx.root, fx.quest.id));
    const aggregate = aggregateSourceFingerprint(fx.root, attempts);
    t.equal(aggregate.fingerprint, attemptFingerprint,
      'one canonical source attempt deduplicates attempt and aggregate approval');

    approve(fx.root, fx.quest, 'both', attemptFingerprint);
    let handoff = buildHandoff(fx.root, fx.quest);
    t.notOk(handoff.ok, 'a stale report keeps the full audit closed');
    t.match(handoff.gate.problems.map((item) => item.message).join('\n'),
      /report is older/u);

    writeReport(fx.root, fx.quest.id);
    handoff = buildHandoff(fx.root, fx.quest);
    t.equal(auditQuest(fx.root, fx.quest).status, 'pass');
    t.ok(handoff.ok, 'full audit plus exact aggregate approval unlocks handoff');
    fs.rmSync(fx.root, {recursive: true, force: true});
    t.end();
  });

  t.test('every source attempt is approved and a multi-attempt aggregate covers all paths', (t) => {
    const fx = fixture();
    recordAttempt(fx, 'src/a.js', 1, 'a');
    const first = latestAttempt(fx.root, fx.quest);
    approve(fx.root, fx.quest, 'attempt',
      `sha256:${first.changeRefIdentity.sha256}`);
    runCheckpointCommand(fx.root, {id: fx.quest.id, _: []});

    recordAttempt(fx, 'src/b.js', 0, 'b');
    const second = latestAttempt(fx.root, fx.quest);
    approve(fx.root, fx.quest, 'attempt',
      `sha256:${second.changeRefIdentity.sha256}`);
    const log = readLog(fx.root, fx.quest.id);
    const attempts = sourceChangingAttempts(fx.root, fx.quest, log);
    t.equal(attempts.length, 2);
    t.same(attempts.flatMap((attempt) => attempt.sourcePaths).sort(),
      ['src/a.js', 'src/b.js']);
    t.same(verificationState(fx.root, fx.quest, log).attemptProblems, [],
      'both attempts have exact approvals');

    const aggregate = aggregateSourceFingerprint(fx.root, attempts);
    t.not(aggregate.fingerprint, `sha256:${second.changeRefIdentity.sha256}`,
      'multi-attempt aggregate is distinct from the latest attempt receipt');
    approve(fx.root, fx.quest, 'aggregate', aggregate.fingerprint);
    writeReport(fx.root, fx.quest.id);
    t.equal(auditQuest(fx.root, fx.quest).status, 'pass');
    t.ok(buildHandoff(fx.root, fx.quest).ok,
      'aggregate approval covers the complete final source scope');
    fs.rmSync(fx.root, {recursive: true, force: true});
    t.end();
  });
});
