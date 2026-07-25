// Guard: an attempt whose recorded workspaceBaseCommit no longer resolves is
// handled by coverage resolution, never by waiver and never by silence.
//
// The condition is real: a Solver attempt records `git rev-parse HEAD`, and a
// local commit that is never pushed dies with its working copy. The exact
// receipt then cannot be recomputed. The honest dispositions bound here:
//   - one typed code names the condition; raw Git stderr reaches no surface;
//   - a dead-base receipt leaves live recompute scope without pinning, while
//     the attempt stays visibly reported and never counts as verification;
//   - a rejection anchored at a dead base is resolved ONLY by a later
//     reachable-base attempt or candidate covering every rejected path with
//     its own later exact independent approval — there is no waiver;
//   - the landing candidate and terminal aggregate anchor at a reachable base
//     while covering every recorded path, and report a typed actionable
//     problem when no reachable base exists — never silence, never an
//     obligation that cannot be satisfied;
//   - the reproducibility probe reports candidate counts and scan bounds, and
//     never names a substitute base.

import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

import {appendEvent, appendFinding, readLog, saveQuest} from '../../scripts/solve/store.js';
import {
  BASE_UNREACHABLE_CODE,
  canonicalSourceDelta,
  checkpointVerificationProblems,
  probeBaseReproducibility,
  verificationState,
} from '../../scripts/solve/verification.js';
import {resolveStepBaseCommit} from '../../scripts/solve/step.js';
import {
  checkpointVerificationPreflight,
  checkpointVerificationPreflightLines,
} from '../../scripts/solve/checkpoint-preflight.js';
import {buildNextProjection} from '../../scripts/solve/next.js';

const DEAD_BASE = 'd1e0d1e0d1e0d1e0d1e0d1e0d1e0d1e0d1e0d1e0';
const FRONTIER = 'runtime-verify-main';
const FILE_A = 'src/a.js';
const FILE_B = 'src/b.js';

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'unreachable-base-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, FILE_A), 'export const retry = 1;\n');
  fs.writeFileSync(path.join(root, FILE_B), 'export const b = 1;\n');
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
      id: FRONTIER,
      priority: 1,
      metric: {probe: 'oracle', args: {file: oracle}},
    }],
    constraints: [],
  };
  saveQuest(root, quest);
  return {root, quest, oracle};
}

// Record an attempt whose artifact is a real canonical delta over `files` from
// the CURRENT tree state, under any recorded base — including one that does
// not exist, which is exactly the shape a lost local commit leaves behind.
function recordAttempt(fx, {
  base,
  files = [FILE_A],
  mutate = true,
  contractVersion = 1,
  name,
}) {
  const head = git(fx.root, ['rev-parse', 'HEAD']).trim();
  if (mutate) {
    for (const file of files) {
      fs.appendFileSync(path.join(fx.root, file), `// ${name}\n`);
    }
  }
  const content = git(fx.root, [
    'diff', '--binary', '--full-index', '--no-ext-diff', head, '--', ...files,
  ]);
  const relative = path.join('solve', 'changes', fx.quest.id, `${name}.diff`);
  const file = path.join(fx.root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
  const sha256 = crypto.createHash('sha256').update(content).digest('hex');
  const event = appendEvent(fx.root, fx.quest.id, {
    type: 'attempt',
    frontier: FRONTIER,
    rung: 'local-fix',
    rungIndex: 1,
    changeRef: `diff:${relative}`,
    changeRefIdentity: {
      path: relative,
      exists: true,
      size: Buffer.byteLength(content),
      sha256,
    },
    metricBefore: 2,
    metricAfter: 1,
    done: false,
    workspaceBaseCommit: base ?? head,
    verificationContractVersion: contractVersion,
  });
  return {fingerprint: `sha256:${sha256}`, head, relative, event};
}

function approveAttempt(fx, fingerprint) {
  return appendFinding(fx.root, fx.quest.id, {
    frontier: FRONTIER,
    kind: 'verifier-approval',
    claim: 'independent attempt verification passed',
    evidence: 'subagent:attempt-verifier',
    verification: {schemaVersion: 1, scope: 'attempt', fingerprint},
  });
}

function rejectAttempt(fx, fingerprint) {
  return appendFinding(fx.root, fx.quest.id, {
    frontier: FRONTIER,
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

function state(fx) {
  return verificationState(fx.root, fx.quest, readLog(fx.root, fx.quest.id));
}

function problemsOf(fx) {
  const projection = state(fx);
  return [...projection.attemptProblems, ...projection.aggregateProblems]
    .map((problem) => problem.message);
}

function cleanup(fx) {
  fs.rmSync(fx.root, {recursive: true, force: true});
}

tap.test('unreachable-base attempts resolve by coverage, never by waiver or silence', async (t) => {
  t.test('one typed code names the condition; no Git stderr leaks', (t) => {
    const fx = fixture();
    const delta = canonicalSourceDelta(fx.root, DEAD_BASE, [FILE_A]);
    t.equal(delta.ok, false, 'an unreachable base cannot produce a delta');
    t.equal(delta.code, BASE_UNREACHABLE_CODE,
      'the failure carries the typed code');
    t.match(delta.problem, new RegExp(`^${BASE_UNREACHABLE_CODE}: `, 'u'),
      'the problem message leads with the code');
    t.notMatch(delta.problem, /fatal: bad object/u,
      'raw Git stderr reaches no operator surface');
    t.match(delta.problem, new RegExp(DEAD_BASE, 'u'),
      'the unresolvable commit is named');

    const live = canonicalSourceDelta(
      fx.root, git(fx.root, ['rev-parse', 'HEAD']).trim(), [FILE_A]);
    t.equal(live.ok, true, 'a reachable base still fingerprints normally');

    cleanup(fx);
    t.end();
  });

  t.test('an approved dead-base receipt leaves recompute scope without pinning, visibly', (t) => {
    const fx = fixture();
    const {fingerprint} = recordAttempt(fx, {base: DEAD_BASE, name: 'dead-a'});
    approveAttempt(fx, fingerprint);

    const projection = state(fx);
    // No checkpoint commit exists, which at HEAD pinned dead-base receipts in
    // scope forever via the fail-closed ancestry probe.
    t.equal(projection.uncheckpointedApprovedAttempts.length, 0,
      'the dead-base receipt is not pinned by the fail-closed ancestry probe');
    t.equal(projection.baseUnreachableAttempts.length, 1,
      'it stays visibly reported rather than silently dropped');
    const entry = projection.baseUnreachableAttempts[0];
    t.equal(entry.code, BASE_UNREACHABLE_CODE);
    t.equal(entry.liveReceiptVerifiable, false,
      'nothing claims the live receipt can be recomputed');
    t.equal(entry.countsAsVerification, false,
      'the dead-base condition never counts as verification');

    const preflight = checkpointVerificationPreflight(
      fx.root, fx.quest, readLog(fx.root, fx.quest.id));
    t.equal(preflight.baseUnreachableAttempts.length, 1,
      'the checkpoint dossier carries the same visibility');
    const lines = checkpointVerificationPreflightLines(preflight).join('\n');
    t.match(lines, new RegExp(`${BASE_UNREACHABLE_CODE}: `, 'u'),
      'the rendered dossier names the condition');
    t.match(lines, /never counted as verification/u,
      'and states the non-verification disposition in prose');

    cleanup(fx);
    t.end();
  });

  t.test('a dead-base rejection resolves ONLY via reachable-base coverage plus approval', (t) => {
    const fx = fixture();
    const {fingerprint} = recordAttempt(
      fx, {base: DEAD_BASE, files: [FILE_A], name: 'dead-rejected'});
    rejectAttempt(fx, fingerprint);

    let projection = state(fx);
    t.equal(projection.unresolvedRejectedAttempts.length, 1,
      'the rejection stands');
    t.equal(projection.unresolvedRejectedAttempts[0].baseUnreachable, true,
      'and is annotated as dead-base');
    t.match(problemsOf(fx).join('\n'),
      /rejected .* recorded base is base_unreachable; requires a later same-frontier source attempt at a reachable base/u,
      'the instruction demands the satisfiable live-base coverage form');

    // The replacement step pin must resolve to a reachable commit, or the
    // replacement could never be recorded at all.
    const pin = resolveStepBaseCommit(
      fx.root, fx.quest, readLog(fx.root, fx.quest.id), FRONTIER);
    t.not(pin, DEAD_BASE, 'the step pin is not the dead base');
    t.doesNotThrow(
      () => git(fx.root, ['cat-file', '-e', `${pin}^{commit}`]),
      'the step pin is a reachable commit');

    // A live-base replacement missing a rejected path does NOT resolve.
    const partial = recordAttempt(
      fx, {files: [FILE_B], name: 'partial-replacement'});
    approveAttempt(fx, partial.fingerprint);
    projection = state(fx);
    t.equal(projection.unresolvedRejectedAttempts.length, 1,
      'a non-covering replacement leaves the rejection unresolved');

    // A live-base replacement covering every rejected path resolves — but only
    // together with its own later exact approval.
    const covering = recordAttempt(
      fx, {files: [FILE_A, FILE_B], name: 'covering-replacement'});
    projection = state(fx);
    t.equal(projection.unresolvedRejectedAttempts.length, 1,
      'coverage without independent approval resolves nothing');
    approveAttempt(fx, covering.fingerprint);
    projection = state(fx);
    t.equal(projection.unresolvedRejectedAttempts.length, 0,
      'coverage plus its own exact approval discharges the rejection');
    t.equal(projection.resolvedRejectedAttempts.length, 1,
      'and the resolution is recorded, not erased');

    cleanup(fx);
    t.end();
  });

  t.test('v2: dead-base candidate attempts are covered, never silently dropped', (t) => {
    const fx = fixture();
    recordAttempt(fx, {
      base: DEAD_BASE, files: [FILE_A], contractVersion: 2, name: 'v2-dead'});

    // With no reachable-base attempt, the candidate reports a typed actionable
    // problem — at HEAD this leaked Git stderr, and the withdrawn design
    // silently collapsed the candidate to nothing.
    let projection = state(fx);
    t.equal(projection.candidate.ok, false,
      'no candidate forms without a reachable base');
    t.equal(projection.candidate.code, BASE_UNREACHABLE_CODE,
      'the failure is the typed code, not a collapsed empty candidate');
    t.match(projection.attemptProblems.map((p) => p.message).join('\n'),
      /landing candidate has no reachable recorded base/u,
      'the problem names the required covering attempt');

    // A reachable-base attempt covering its own paths anchors the candidate;
    // the dead attempt's paths REMAIN in the reviewed union.
    recordAttempt(fx, {
      files: [FILE_A, FILE_B], contractVersion: 2, name: 'v2-live'});
    projection = state(fx);
    t.equal(projection.candidate.ok, true,
      'a reachable base anchors the candidate');
    t.ok(projection.candidate.paths.includes(FILE_A),
      'the dead-base attempt path stays under review');
    t.ok(projection.candidate.paths.includes(FILE_B));
    t.equal(projection.candidate.attempts.length, 2,
      'the dead-base attempt is kept in the candidate, not dropped');
    const gate = checkpointVerificationProblems(
      fx.root, fx.quest, readLog(fx.root, fx.quest.id))
      .map((problem) => problem.message).join('\n');
    t.match(gate, /landing candidate requires exact approval for sha256:/u,
      'the anchored candidate still demands its own independent approval');

    cleanup(fx);
    t.end();
  });

  t.test('v2: a candidate rejection anchored at a dead base stays binding', (t) => {
    const fx = fixture();
    const dead = recordAttempt(fx, {
      base: DEAD_BASE, files: [FILE_A], contractVersion: 2, name: 'v2-rejected'});
    // A historical candidate-scope rejection whose receipt anchors at the
    // now-dead base and whose reviewed surface is BROADER than any surviving
    // attempt — the shape a real pre-cutover log leaves behind.
    appendFinding(fx.root, fx.quest.id, {
      frontier: FRONTIER,
      kind: 'verifier-rejection',
      claim: 'independent verification rejected this candidate',
      evidence: 'subagent:candidate-verifier',
      verification: {
        schemaVersion: 2,
        scope: 'candidate',
        fingerprint: dead.fingerprint,
        verdict: 'rejected',
        baseCommit: DEAD_BASE,
        paths: [FILE_A, 'src/vanished.js'],
        firstAttemptIndex: 1,
        lastAttemptIndex: 1,
      },
    });

    // A later reachable-base candidate whose union does NOT cover the whole
    // rejected surface leaves the rejection unresolved — the laundering that
    // sank the withdrawn design is closed.
    recordAttempt(fx, {
      files: [FILE_B], contractVersion: 2, name: 'v2-noncovering'});
    let projection = state(fx);
    t.ok(projection.unresolvedCandidateRejection,
      'a non-covering candidate does not release the rejection');
    t.match(projection.attemptProblems.map((p) => p.message).join('\n'),
      /rejection anchored at a base_unreachable base requires a later changed-fingerprint path-superset candidate at a reachable base/u,
      'the problem states the satisfiable resolution');

    // A covering reachable-base candidate resolves the rejection — and the new
    // candidate still needs its own approval before anything lands, so every
    // rejected path is re-reviewed by an independent verifier.
    fs.writeFileSync(path.join(fx.root, 'src/vanished.js'), 'export const v = 1;\n');
    git(fx.root, ['add', '-N', 'src/vanished.js']);
    recordAttempt(fx, {
      files: [FILE_A, 'src/vanished.js', FILE_B], contractVersion: 2,
      name: 'v2-covering'});
    projection = state(fx);
    t.notOk(projection.unresolvedCandidateRejection,
      'a covering reachable-base candidate resolves the dead-base rejection');
    const gate = checkpointVerificationProblems(
      fx.root, fx.quest, readLog(fx.root, fx.quest.id))
      .map((problem) => problem.message).join('\n');
    t.match(gate, /landing candidate requires exact approval for sha256:/u,
      'nothing lands without the new candidate own approval');

    cleanup(fx);
    t.end();
  });

  t.test('aggregate anchors at the earliest reachable base and covers dead paths', (t) => {
    const fx = fixture();
    recordAttempt(fx, {base: DEAD_BASE, files: [FILE_A], name: 'agg-dead'});

    // Only dead bases: the aggregate is a typed actionable problem, never an
    // approval demand for a null fingerprint.
    const messages = problemsOf(fx).join('\n');
    t.match(messages, /terminal aggregate has no reachable recorded base/u,
      'no reachable base yields the typed actionable problem');
    t.notMatch(messages, /approval for null/u,
      'no obligation ever names a null fingerprint');

    // A reachable-base attempt anchors the aggregate; the dead attempt's
    // source paths remain inside the aggregated review surface.
    recordAttempt(fx, {files: [FILE_B], name: 'agg-live'});
    const projection = state(fx);
    t.equal(projection.aggregate.ok, true, 'the aggregate computes');
    t.ok(projection.aggregate.paths.includes(FILE_A),
      'the dead-base attempt source path stays in the aggregate surface');
    t.match(projection.aggregate.fingerprint, /^sha256:[0-9a-f]{64}$/u,
      'and yields a real fingerprint a verifier can approve');

    cleanup(fx);
    t.end();
  });

  t.test('next never prints an instruction that cannot succeed', (t) => {
    const fx = fixture();
    // Terminal quest whose only contracted attempt has a dead base: the
    // aggregate has no fingerprint, so a "spawn a verifier for
    // sha256:<unavailable>" action would be a dead end.
    const {fingerprint} = recordAttempt(fx, {base: DEAD_BASE, name: 'next-dead'});
    approveAttempt(fx, fingerprint);
    appendEvent(fx.root, fx.quest.id, {
      type: 'solved',
      frontier: FRONTIER,
      evidence: 'oracle.json',
    });
    appendEvent(fx.root, fx.quest.id, {
      type: 'quest',
      status: 'solved',
      evidence: 'oracle.json',
    });

    const projection = buildNextProjection(fx.root, fx.quest.id);
    t.notMatch(projection.action.value, /<unavailable>/u,
      'the terminal action never asks for verification of an unavailable fingerprint');
    t.match(projection.action.value,
      /terminal aggregate has no reachable recorded base/u,
      'it surfaces the typed actionable repair instead');
    t.match(projection.action.value, new RegExp(`step --id ${fx.quest.id}`, 'u'),
      'and names the executable first step');

    cleanup(fx);
    t.end();
  });

  t.test('a pending dead-base replacement instruction points at a reachable base', (t) => {
    const fx = fixture();
    // An unapproved dead-base v1 attempt is a pending approval; the fallback
    // replacement instruction must not say "at base <dead sha>".
    recordAttempt(fx, {base: DEAD_BASE, name: 'pending-dead'});

    const projection = buildNextProjection(fx.root, fx.quest.id);
    if (projection.action.code === 'replace-rejected-attempt') {
      t.notMatch(projection.action.value, new RegExp(`at base ${DEAD_BASE}`, 'u'),
        'the instruction never names the unresolvable base as the target');
      t.match(projection.action.value, /at a reachable base/u,
        'it directs the operator to a reachable base instead');
    } else {
      // The projection may route to a different action first; the binding
      // requirement is only that no action ever names the dead base as a
      // recordable target.
      t.notMatch(projection.action.value, new RegExp(`at base ${DEAD_BASE}`, 'u'),
        'no action names the unresolvable base as a recordable target');
    }

    cleanup(fx);
    t.end();
  });

  t.test('reproducibility reports counts and bounds, never a substitute base', (t) => {
    const fx = fixture();
    const {event} = recordAttempt(fx, {base: DEAD_BASE, name: 'probe-target'});

    // The recorded bytes ARE reproducible from the fixture's live HEAD, so
    // this asserts a real positive, not a vacuous empty search.
    const probe = probeBaseReproducibility(fx.root, event, [FILE_A]);
    t.equal(probe.reproducible, true, 'a real reproduction is detected');
    t.ok(probe.candidatesFound >= 1, 'with its candidate count');
    t.ok(probe.commitsScanned >= 1, 'and the scan bound');
    t.equal(probe.scanTruncated, false, 'a complete scan is not overstated');
    t.equal(JSON.stringify(probe).includes('substituteBase'), false,
      'no substitute base is ever named');

    // Unmeasured is null, never false.
    const unmeasured = probeBaseReproducibility(
      fx.root, {changeRefIdentity: {}}, [FILE_A]);
    t.equal(unmeasured.reproducible, null,
      'a missing fingerprint reports null, not false');
    t.ok(unmeasured.unprobedReason, 'and says why nothing was measured');

    // A bounded scan says so.
    git(fx.root, ['commit', '--allow-empty', '-m', 'second']);
    const bounded = probeBaseReproducibility(fx.root, event, [FILE_A], {limit: 1});
    t.equal(bounded.scanTruncated, true,
      'a truncated scan is reported as truncated');

    // The opt-in dossier surface carries the measurement.
    const preflight = checkpointVerificationPreflight(
      fx.root, fx.quest, readLog(fx.root, fx.quest.id),
      {probeReproducibility: true});
    const entry = preflight.baseUnreachableAttempts[0];
    t.equal(entry.reproducible, true,
      'the dossier carries the measured fact when asked');
    t.ok(entry.candidatesFound >= 1, 'with its count');
    const lines = checkpointVerificationPreflightLines(preflight).join('\n');
    t.match(lines, /no single base identifiable/u,
      'the rendered line states the count without naming a base');

    cleanup(fx);
    t.end();
  });
});
