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
import {buildNextLines} from '../../scripts/solve/next.js';
import {
  appendFinding,
  projectState,
  readLog,
  saveQuest,
} from '../../scripts/solve/store.js';
import {
  aggregateSourceFingerprint,
  buildVerificationFinding,
  findApprovedRejectionReplacement,
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

function reject(root, quest, fingerprint) {
  return appendFinding(root, quest.id, {
    frontier: 'runtime-verify-main',
    kind: 'verifier-rejection',
    claim: 'independent verification rejected this exact source attempt',
    evidence: 'subagent:rejection-verifier',
    verification: {
      schemaVersion: 1,
      scope: 'attempt',
      fingerprint,
      verdict: 'rejected',
    },
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

function writeSizedSource(root, changedPath, value, bytes) {
  const declaration = `export const a = ${value};\n/*`;
  fs.writeFileSync(
    path.join(root, changedPath),
    `${declaration}${'x'.repeat(bytes - declaration.length - 3)}*/\n`,
  );
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

  t.test('rejecting a terminal attempt reopens it for a real replacement step', (t) => {
    const fx = fixture();
    recordAttempt(fx, 'src/a.js', 0, 'terminal-rejected-a');
    const rejectedAttempt = latestAttempt(fx.root, fx.quest);
    const rejectedFingerprint =
      `sha256:${rejectedAttempt.changeRefIdentity.sha256}`;
    const appendCandidateRejection = (frontier, fingerprint, evidence) =>
      appendFinding(fx.root, fx.quest.id, {
        frontier,
        kind: 'verifier-rejection',
        claim: 'candidate terminal rejection',
        evidence,
        verification: {
          schemaVersion: 1,
          scope: 'attempt',
          fingerprint,
          verdict: 'rejected',
        },
      });
    appendCandidateRejection(
      'other-frontier',
      rejectedFingerprint,
      'subagent:wrong-frontier',
    );
    appendCandidateRejection(
      'runtime-verify-main',
      `sha256:${'9'.repeat(64)}`,
      'subagent:unbound-fingerprint',
    );
    appendCandidateRejection(
      'runtime-verify-main',
      rejectedFingerprint,
      'subagent:v:bad',
    );
    t.equal(
      projectState(
        fx.quest,
        readLog(fx.root, fx.quest.id),
      ).questStatus,
      'solved',
      'wrong-frontier, unbound, and malformed rejections stay terminal',
    );
    reject(
      fx.root,
      fx.quest,
      rejectedFingerprint,
    );

    t.equal(
      buildNextLines(fx.root, fx.quest.id)[0],
      'Next [executable-command]: node scripts/solve.js step --id runtime-verify',
      'terminal aggregate approval never outranks exact rejection replacement',
    );
    const replacement = runStep(fx.root, fx.quest);
    t.equal(replacement.terminal, null,
      'the rendered replacement step is executable, not refused as solved');
    t.equal(replacement.before.metric, 0);
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

  t.test('a canonical approved superset replaces an older approved checkpoint receipt', (t) => {
    const fx = fixture();
    recordAttempt(fx, 'src/a.js', 1, 'approved-incremental-state');
    const first = latestAttempt(fx.root, fx.quest);
    approve(
      fx.root,
      fx.quest,
      'attempt',
      `sha256:${first.changeRefIdentity.sha256}`,
    );

    recordAttempt(fx, 'src/a.js', 0, 'approved-canonical-replacement');
    const replacement = latestAttempt(fx.root, fx.quest);
    approve(
      fx.root,
      fx.quest,
      'attempt',
      `sha256:${replacement.changeRefIdentity.sha256}`,
    );

    t.equal(
      checkpointGate(fx.root, fx.quest).status,
      'pass',
      'the latest exact-approved same-base superset owns checkpoint identity',
    );
    t.match(
      runCheckpointCommand(fx.root, {id: fx.quest.id, _: []}),
      /checkpointed/u,
    );
    fs.rmSync(fx.root, {recursive: true, force: true});
    t.end();
  });

  t.test('a rejected attempt requires an exact-approved same-base replacement', (t) => {
    const fx = fixture();
    recordAttempt(fx, 'src/a.js', 1, 'rejected-a');
    const rejectedAttempt = latestAttempt(fx.root, fx.quest);
    const rejectedFingerprint =
      `sha256:${rejectedAttempt.changeRefIdentity.sha256}`;
    reject(fx.root, fx.quest, rejectedFingerprint);

    let state = verificationState(
      fx.root,
      fx.quest,
      readLog(fx.root, fx.quest.id),
    );
    t.match(
      state.attemptProblems.map((item) => item.message).join('\n'),
      /was explicitly rejected.*same-frontier, same-base/u,
    );
    t.same(state.pendingAttempts, [],
      'the Solver never asks for approval of the rejected fingerprint');
    t.equal(
      buildNextLines(fx.root, fx.quest.id)[0],
      'Next [executable-command]: node scripts/solve.js step --id runtime-verify',
      'next advances to a replacement step instead of approving rejected bytes',
    );
    t.equal(checkpointGate(fx.root, fx.quest).status, 'fail');

    recordAttempt(fx, 'src/a.js', 0, 'replacement-a');
    const replacementAttempt = latestAttempt(fx.root, fx.quest);
    const replacementFingerprint =
      `sha256:${replacementAttempt.changeRefIdentity.sha256}`;
    state = verificationState(fx.root, fx.quest, readLog(fx.root, fx.quest.id));
    t.same(
      state.pendingAttempts.map((attempt) => attempt.fingerprint),
      [replacementFingerprint],
      'next verification work is the replacement, never the rejected attempt',
    );
    t.match(buildNextLines(fx.root, fx.quest.id)[0],
      new RegExp(replacementFingerprint, 'u'));
    t.match(
      state.attemptProblems.map((item) => item.message).join('\n'),
      /explicitly rejected|requires a later exact approval/u,
    );

    approve(fx.root, fx.quest, 'attempt', replacementFingerprint);
    state = verificationState(fx.root, fx.quest, readLog(fx.root, fx.quest.id));
    t.same(state.attemptProblems, []);
    t.equal(state.resolvedRejectedAttempts.length, 1);
    t.same(state.unresolvedRejectedAttempts, []);
    t.equal(
      state.resolvedRejectedAttempts[0].replacement.fingerprint,
      replacementFingerprint,
    );
    t.equal(checkpointGate(fx.root, fx.quest).status, 'pass',
      'checkpoint exactness rechecks the approved replacement, not rejected bytes');
    t.notMatch(
      auditQuest(fx.root, fx.quest).problems.map((item) => item.message).join('\n'),
      /explicitly rejected/u,
      'audit advances past the superseded rejection',
    );
    fs.rmSync(fx.root, {recursive: true, force: true});
    t.end();
  });

  t.test('a large same-base canonical replacement can checkpoint', (t) => {
    const fx = fixture();
    const changedPath = 'src/a.js';
    const sourceBytes = 140_000;
    const baseCommit = git(fx.root, ['rev-parse', 'HEAD']).trim();

    runStep(fx.root, fx.quest);
    writeSizedSource(fx.root, changedPath, 2, sourceBytes);
    fs.writeFileSync(fx.oracle, JSON.stringify({metric: 1, target: 0}));
    runStep(fx.root, fx.quest, {
      changeRef: canonicalDiff(
        fx.root, fx.quest, baseCommit, changedPath, 'large-rejected'),
      summary: 'large rejected source snapshot',
    });
    const rejectedAttempt = latestAttempt(fx.root, fx.quest);
    reject(
      fx.root,
      fx.quest,
      `sha256:${rejectedAttempt.changeRefIdentity.sha256}`,
    );

    runStep(fx.root, fx.quest);
    writeSizedSource(fx.root, changedPath, 3, sourceBytes);
    fs.writeFileSync(fx.oracle, JSON.stringify({metric: 0, target: 0}));
    runStep(fx.root, fx.quest, {
      changeRef: canonicalDiff(
        fx.root, fx.quest, baseCommit, changedPath, 'large-replacement'),
      summary: 'large canonical replacement snapshot',
    });
    const replacement = latestAttempt(fx.root, fx.quest);
    approve(
      fx.root,
      fx.quest,
      'attempt',
      `sha256:${replacement.changeRefIdentity.sha256}`,
    );
    t.equal(checkpointGate(fx.root, fx.quest).status, 'pass');
    t.match(
      runCheckpointCommand(fx.root, {id: fx.quest.id, _: []}),
      /checkpointed/u,
    );
    fs.rmSync(fx.root, {recursive: true, force: true});
    t.end();
  });

  t.test('step rejects an incremental source artifact before recording', (t) => {
    const fx = fixture();
    runStep(fx.root, fx.quest);
    fs.writeFileSync(path.join(fx.root, 'src', 'a.js'), 'export const a = 2;\n');
    fs.writeFileSync(fx.oracle, JSON.stringify({metric: 1, target: 0}));
    const artifact = path.join(
      fx.root,
      'solve/changes/runtime-verify/incremental.diff',
    );
    fs.mkdirSync(path.dirname(artifact), {recursive: true});
    fs.writeFileSync(artifact, [
      'diff --git a/src/a.js b/src/a.js',
      '--- a/src/a.js',
      '+++ b/src/a.js',
      '@@ -1 +1 @@',
      '-export const a = 1;',
      '+export const a = 2;',
      '',
    ].join('\n'));
    t.throws(
      () => runStep(fx.root, fx.quest, {
        changeRef: `diff:${path.relative(fx.root, artifact)}`,
        summary: 'incremental source artifact',
      }),
      /complete canonical Git delta/iu,
    );
    t.equal(
      readLog(fx.root, fx.quest.id)
        .filter((event) => event.type === 'attempt').length,
      0,
      'non-canonical source bytes never receive an attempt receipt',
    );
    fs.rmSync(fx.root, {recursive: true, force: true});
    t.end();
  });

  t.test('rejection findings fail closed on scope and fingerprint shape', (t) => {
    const fingerprint = `sha256:${'1'.repeat(64)}`;
    t.throws(() => buildVerificationFinding({
      kind: 'verifier-rejection',
      evidence: 'subagent:rejector',
      verificationScope: 'aggregate',
      verificationFingerprint: fingerprint,
    }), /verification-scope attempt/u);
    t.throws(() => buildVerificationFinding({
      kind: 'verifier-rejection',
      evidence: 'subagent:',
      verificationScope: 'attempt',
      verificationFingerprint: fingerprint,
    }), /non-empty-stable-id/u);
    t.same(buildVerificationFinding({
      kind: 'verifier-rejection',
      evidence: 'subagent:rejector',
      verificationScope: 'attempt',
      verificationFingerprint: fingerprint,
    }), {
      schemaVersion: 1,
      scope: 'attempt',
      fingerprint,
      verdict: 'rejected',
    });
    t.end();
  });

  t.test('rejected replacement matching rejects partial, wrong-base, and cross-frontier attempts', (t) => {
    const fingerprint = `sha256:${'2'.repeat(64)}`;
    const rejected = {
      index: 0,
      event: {frontier: 'main', workspaceBaseCommit: 'base-a'},
      sourcePaths: ['src/a.js', 'src/b.js'],
    };
    const approval = {
      type: 'finding',
      frontier: 'main',
      kind: 'verifier-approval',
      evidence: 'subagent:replacement-verifier',
      verification: {schemaVersion: 1, scope: 'attempt', fingerprint},
    };
    const candidate = (overrides = {}) => ({
      index: 2,
      contracted: true,
      fingerprint,
      event: {frontier: 'main', workspaceBaseCommit: 'base-a'},
      sourcePaths: ['src/a.js', 'src/b.js'],
      ...overrides,
    });
    const log = [{type: 'attempt'}, {type: 'finding'}, {type: 'attempt'}, approval];

    t.equal(findApprovedRejectionReplacement(
      log,
      [candidate({sourcePaths: ['src/a.js']})],
      rejected,
      1,
    ), null, 'partial path coverage is not a replacement');
    t.equal(findApprovedRejectionReplacement(
      log,
      [candidate({event: {frontier: 'main', workspaceBaseCommit: 'base-b'}})],
      rejected,
      1,
    ), null, 'a different Git base is not a replacement');
    t.equal(findApprovedRejectionReplacement(
      log,
      [candidate({event: {frontier: 'other', workspaceBaseCommit: 'base-a'}})],
      rejected,
      1,
    ), null, 'a different frontier is not a replacement');
    t.equal(findApprovedRejectionReplacement(
      log,
      [candidate()],
      {...rejected, fingerprint},
      1,
    ), null, 'identical rejected bytes cannot be laundered by a duplicate attempt');
    t.equal(
      findApprovedRejectionReplacement(log, [candidate()], rejected, 1)
        ?.attempt.fingerprint,
      fingerprint,
      'same-base, same-frontier, full-path exact approval resolves rejection',
    );
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
