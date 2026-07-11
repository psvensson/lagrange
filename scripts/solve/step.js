// Manual supervised step flow.
//
// `step --id <quest>` pins the before metric from live evidence and writes a
// pending attempt. `step --id <quest> --changeRef diff:<patch>` commits that pending
// attempt after the operator has changed code and refreshed evidence. Command-running
// attempts should use `solve attempt`, which measures before/after around the command
// in one process.

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {
  makeRunContext,
  ensureSealedGoal,
  finalizeAttempt,
  recordQuestSolvedIfDone,
} from './loop.js';
import {readLog, projectState, assertSafeQuestId} from './store.js';
import {evaluate} from './probe.js';
import {pickFrontier} from './scheduler.js';
import {stepTheoryGateProblems} from './theory.js';
import {detectUnrecordedEvidence} from './evidence-detection.js';
import {
  SOLVE_DATA_DIR,
  STATE_SUBDIR,
  STATUS_SOLVED,
} from './constants.js';
import {
  expectedChangeDir,
  inspectChangeArtifact,
} from './change-artifact.js';
import {
  cleanupWrittenChangeArtifact,
  writeContentAddressedChangeArtifact,
} from './content-addressed-change-artifact.js';
import {suggestVerificationTemplates} from './verification-template-suggest.js';
import {autoCommitQuest} from './handoff.js';
import {writeReport} from './report.js';
import {analyzeQuestHealth} from './health.js';
import {analyzeScopePressureCandidate} from './scope-pressure.js';
import {scopeTerminalStatus} from './convergence-guards.js';
import {
  resolveGateDecision,
  gateDecisionToStepResult,
  theoryGateContinuation,
  decisionContinues,
} from './gate.js';
import {unrecordedEvidenceContinuation} from './continuation.js';

const AUTO_DIFF_ARTIFACT_PREFIX = 'attempt-';
const AUTO_DIFF_ARTIFACT_EXTENSION = '.diff';
const AUTO_DIFF_ARTIFACT_PATTERN = /^attempt-(\d+)\.diff(?:\.json)?$/u;
const GIT_DIFF_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const UNKNOWN_GIT_ERROR = 'unknown error';
const AUTO_DIFF_EMPTY_ERROR =
  'auto-diff: git diff is empty — nothing changed since the step began; ' +
  'make the change first (or pass an explicit --changeRef diff:<path>)';
const SCOPE_PRESSURE_BLOCKED_PREFIX =
  'scope-pressure precommit blocked: split into bounded Quest declarations ';

// Solver-owned GENERATED bookkeeping the step/loop machinery itself writes
// between step begin and commit: the pending file (solve/state, stepBegin),
// event-log appends (solve/log — gate decisions fire at begin time), the
// regenerated report (solve/report), and the frontier board refresh
// (solve/FRONTIER.generated.md). Sweeping these into an --auto-diff artifact
// self-poisons a product quest: the change-artifact honesty gate classifies
// solve/ paths as workflow changes and rejects the attempt. Only these
// generated paths are excluded — the operator's INTENTIONAL edits under
// solve/ (quest JSON, epics, specs) are still captured.
const AUTO_DIFF_EXCLUDED_BOOKKEEPING_PATHSPECS = Object.freeze([
  'solve/FRONTIER.generated.md',
  'solve/state',
  'solve/log',
  'solve/report',
].map((bookkeepingPath) => `:(exclude)${bookkeepingPath}`));

// The HEAD sha at step-begin time, recorded into the pending file so --auto-diff can
// snapshot exactly what changed during the attempt (null outside a git work tree).
function resolveHeadPin(root) {
  const out = spawnSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'});
  if (out.status !== 0 || typeof out.stdout !== 'string') return null;
  const sha = out.stdout.trim();
  return /^[0-9a-f]{40}$/u.test(sha) ? sha : null;
}

function nextAutoDiffArtifactPath(root, questId) {
  const dir = expectedChangeDir(root, questId);
  fs.mkdirSync(dir, {recursive: true});
  let next = 1;
  for (const name of fs.readdirSync(dir)) {
    const match = AUTO_DIFF_ARTIFACT_PATTERN.exec(name);
    if (match) next = Math.max(next, Number(match[1]) + 1);
  }
  return path.join(
    dir, `${AUTO_DIFF_ARTIFACT_PREFIX}${next}${AUTO_DIFF_ARTIFACT_EXTENSION}`);
}

// --auto-diff: snapshot the working tree (vs the pin recorded at step begin, else HEAD)
// into solve/changes/<questId>/attempt-<n>.diff and use it as the changeRef. The
// resulting artifact goes through the same inspectChangeArtifact honesty gate as an
// operator-provided diff. An empty diff is an operator error, not a silent no-op.
function createAutoDiffChangeRef(root, quest, pending) {
  const pin = pending.headCommit || 'HEAD';
  const out = spawnSync('git', [
    'diff', '--binary', pin, '--', '.',
    ...AUTO_DIFF_EXCLUDED_BOOKKEEPING_PATHSPECS,
  ], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: GIT_DIFF_MAX_BUFFER_BYTES,
  });
  if (out.status !== 0 || typeof out.stdout !== 'string') {
    throw new Error(
      `auto-diff: git diff ${pin} failed: ${(out.stderr || UNKNOWN_GIT_ERROR).trim()}`,
    );
  }
  if (out.stdout.trim() === '') {
    throw new Error(AUTO_DIFF_EMPTY_ERROR);
  }
  const file = nextAutoDiffArtifactPath(root, quest.id);
  const relativeFile = path.relative(root, file);
  return writeContentAddressedChangeArtifact(
    root,
    relativeFile,
    out.stdout,
  );
}

export function pendingFilePath(root, questId) {
  return path.join(
    root,
    SOLVE_DATA_DIR,
    STATE_SUBDIR,
    `${assertSafeQuestId(questId)}.pending.json`,
  );
}

function configureContext(root, quest, options = {}) {
  const ctx = makeRunContext(options);
  ctx.probeCtx = {...ctx.probeCtx, root};
  ctx.honestyCtx.changeRefResolves =
    ctx.honestyCtx.changeRefResolves ||
    ((ref) => inspectChangeArtifact(root, quest, ref).valid);
  ctx.honestyCtx.inspectChangeRef =
    ctx.honestyCtx.inspectChangeRef ||
    ((ref) => inspectChangeArtifact(root, quest, ref));
  return ctx;
}

function loadPending(root, questId) {
  const file = pendingFilePath(root, questId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function savePending(root, questId, pending) {
  const file = pendingFilePath(root, questId);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(pending, null, 2)}\n`);
  return file;
}

function clearPending(root, questId) {
  const file = pendingFilePath(root, questId);
  if (fs.existsSync(file)) fs.rmSync(file);
}

function theoryGateResult(root, quest, log, problems, pick) {
  const continuation = theoryGateContinuation(problems);
  const decision = resolveGateDecision(root, quest, continuation, {
    log,
    frontier: pick.def.id,
    rungIndex: pick.state.rungIndex,
  });
  return decisionContinues(decision) ? null : gateDecisionToStepResult(decision);
}

export function stepPending(root, questId) {
  return loadPending(root, questId);
}

export function stepAbort(root, questId) {
  const hadPending = Boolean(loadPending(root, questId));
  clearPending(root, questId);
  return hadPending;
}

function stepBegin(root, quest, options = {}) {
  const ctx = configureContext(root, quest, options);
  ensureSealedGoal(root, quest);
  if (loadPending(root, quest.id)) {
    if (options.force) {
      clearPending(root, quest.id);
    } else {
      throw new Error(
        'a step is already pending; commit it, abort it, or pass --force',
      );
    }
  }

  const log = readLog(root, quest.id);
  const state = projectState(quest, log);
  if (state.questStatus === STATUS_SOLVED) {
    return {terminal: 'solved', evidence: state.questEvidence};
  }

  const unrecorded = detectUnrecordedEvidence(root, quest.id, {
    requiresMeasuredHistory: true,
    kind: 'frontier',
  });
  if (unrecorded) {
    const decision = resolveGateDecision(
      root,
      quest,
      unrecordedEvidenceContinuation(unrecorded),
      {log, frontier: unrecorded.frontier},
    );
    if (decision) return gateDecisionToStepResult(decision);
  }

  const pick = pickFrontier(quest, state, ctx.scoreFn);
  if (!pick) return {terminal: 'exhausted'};

  const health = analyzeQuestHealth(root, quest, {state});
  const gateDecision = resolveGateDecision(root, quest, health.continuation, {
    log,
    frontier: pick.def.id,
    rungIndex: pick.state.rungIndex,
  });
  if (gateDecision && !decisionContinues(gateDecision)) {
    return gateDecisionToStepResult(gateDecision);
  }

  const before = evaluate(pick.def.metric, ctx.probeCtx);
  const pending = {
    frontier: pick.def.id,
    rungIndex: pick.state.rungIndex,
    headCommit: resolveHeadPin(root),
    before: {
      metric: before.metric,
      done: before.done,
      evidence: before.evidence,
      evidenceIdentity: before.evidenceIdentity || null,
      evidenceFingerprint: before.evidenceFingerprint || null,
    },
  };
  return {
    terminal: null,
    frontier: pick.def.id,
    rungIndex: pick.state.rungIndex,
    before,
    pendingFile: savePending(root, quest.id, pending),
  };
}

function stepCommit(root, quest, options = {}) {
  const pending = loadPending(root, quest.id);
  if (!pending) {
    throw new Error(
      'no pending step; use `solve attempt -- ...` for atomic command execution ' +
      'or run `solve step --id <quest>` before manual work',
    );
  }
  const autoDiffWrite = options.changeRef ?
    null :
    createAutoDiffChangeRef(root, quest, pending);
  const autoDiffRef = autoDiffWrite?.changeRef || null;
  const changeRef = options.changeRef || autoDiffRef;
  // A rejected commit (invalid changeRef, missing frontier, or a theory-gate
  // stop) records no attempt, so a generated auto-diff artifact must not
  // survive it: an orphan attempt-<n>.diff would accumulate and skip numbers.
  let attemptRecorded = false;
  try {
    const result = commitPendingAttempt(root, quest, pending, changeRef, options);
    attemptRecorded = !result.terminal;
    return result;
  } finally {
    if (autoDiffRef && !attemptRecorded) {
      cleanupWrittenChangeArtifact(autoDiffWrite);
    }
  }
}

function commitPendingAttempt(root, quest, pending, changeRef, options = {}) {
  const ctx = configureContext(root, quest, options);
  ensureSealedGoal(root, quest);
  const changeInspection = ctx.honestyCtx.inspectChangeRef(changeRef);
  if (!changeInspection.valid) {
    throw new Error(
      `invalid changeRef: ${changeInspection.problems.join('; ')}`,
    );
  }

  const log = readLog(root, quest.id);
  const scopeAdmission = scopeTerminalStatus(
    analyzeScopePressureCandidate(root, quest, log, changeInspection),
  );
  if (scopeAdmission.terminal) {
    throw new Error(
      SCOPE_PRESSURE_BLOCKED_PREFIX +
      `(files=${scopeAdmission.fileCount}, owners=${scopeAdmission.ownerCount}, ` +
      `bytes=${scopeAdmission.changeBytes})`,
    );
  }
  const state = projectState(quest, log);
  const def = quest.frontiers.find((frontier) => frontier.id === pending.frontier);
  const frontierState = state.frontiers.find((frontier) =>
    frontier.id === pending.frontier);
  if (!def || !frontierState) {
    throw new Error(`pending frontier ${pending.frontier} not found`);
  }
  frontierState.rungIndex = pending.rungIndex;
  const pick = {def, state: frontierState};
  const readinessProblems = stepTheoryGateProblems({
    log,
    state,
    frontierId: def.id,
    rungIndex: pending.rungIndex,
    theoryRef: options.theoryRef,
    modelRef: options.modelRef,
    modelNotApplicable: options.modelNotApplicable,
    phase: 'commit',
  });
  const gateResult = theoryGateResult(root, quest, log, readinessProblems, pick);
  if (gateResult) return gateResult;

  const outcome = finalizeAttempt(root, quest, ctx, pick, pending.before, {
    changeRef,
    summary: options.summary || null,
    theoryRef: options.theoryRef || null,
    expectedMovement: options.expectedMovement || null,
    negativeResultMeans: options.negativeResultMeans || null,
    modelRef: options.modelRef || null,
    modelNotApplicable: options.modelNotApplicable || null,
    discrimination: options.discrimination || null,
  });
  const questOutcome = recordQuestSolvedIfDone(root, quest, ctx, {
    accepted: outcome.accepted === true,
  });
  clearPending(root, quest.id);
  writeReport(root, quest.id);
  // Persist the Quest's own scope-clean work. Once the Quest finishes (R1) this is the
  // durable terminal commit; while it is still running it is a squashable CHECKPOINT
  // commit, gated on source-change verification rather than a terminal status, so a
  // supervised attempt is never left to accumulate in the dirty tree. Auto-commit is a
  // no-op outside a git work tree and refuses until its gate is met, so it is safe to
  // call unconditionally. It commits only — it never pushes.
  const commit = outcome.violations.length > 0 || outcome.accepted !== true ?
    {committed: false, skipped: outcome.nonMeasuring ?
      'non-measuring-sample' : 'attempt-violations'} :
    autoCommitQuest(root, quest.id, {checkpoint: !questOutcome.done});
  return {
    frontier: def.id,
    before: pending.before.metric,
    after: outcome.after.metric,
    done: questOutcome.done,
    progressed: outcome.progressed,
    violations: outcome.violations,
    changeRef,
    verificationTemplates: suggestChangeVerificationTemplates(
      root, changeInspection),
    commit,
  };
}

// Surface the matching adversarial-verification template(s) alongside the
// subagent-verification requirement this commit path enforces (see the
// source-change-subagent-verification constraint + audit's commit gate).
// Advisory only — a suggestion failure must never fail the recorded attempt.
function suggestChangeVerificationTemplates(root, changeInspection) {
  try {
    return suggestVerificationTemplates(root, changeInspection.content || '');
  } catch {
    return [];
  }
}

export function runStep(root, quest, options = {}) {
  if (!options.changeRef && !options.autoDiff) {
    return stepBegin(root, quest, options);
  }
  return stepCommit(root, quest, options);
}
