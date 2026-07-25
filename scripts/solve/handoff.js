// Scope-safe git handoff — compute the exact pathspec for committing ONE Quest.
//
// The repository convention is that a Quest's commit must contain only that
// Quest's work: its sealed quest file, append-only log, exact id-owned oracle,
// local state, recorded change artifacts, and the source/test files
// those artifacts actually touched. A mixed working tree (several Quests' edits,
// plus unrelated dirty files) must never be swept into one commit — `audit.js`
// already rejects mis-scoped change artifacts, but nothing computed the safe
// pathspec for the operator. This module does.
//
// Design constraints:
//   - Refuse to hand off a Quest whose audit does not pass. A scope-clean commit
//     of dishonest evidence is still dishonest.
//   - Derive the in-scope set purely from sealed artifacts (the Quest's solve/
//     paths plus the paths named inside its own diffs). Never infer scope from
//     the shape of the dirty tree.
//   - Default to a dry run. Print the exact git commands and explicitly list the
//     out-of-scope dirty files so they are visibly excluded, never silently.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  loadQuest,
  readLog,
  questFilePath,
  logFilePath,
  stateFilePath,
} from './store.js';
import {auditQuest, commitGate, checkpointGate} from './audit.js';
import {analyzeScopePressure} from './scope-pressure.js';
import {scopeTerminalStatus} from './convergence-guards.js';
import {
  expectedChangeDir,
  inspectChangeArtifact,
} from './change-artifact.js';
import {SOLVE_DATA_DIR} from './constants.js';
import {frontierFilePath, runFrontierCommand, writeFrontier} from './frontier.js';
import {resolveCoauthorTrailer} from './operator-config.js';
import {
  checkpointVerificationPreflight,
  checkpointVerificationPreflightLines,
} from './checkpoint-preflight.js';
import {verificationState} from './verification.js';
import {CONTINUATION_BLOCKED_SCOPE} from './continuation.js';
import {latestAttemptAdmissionWasOverridden} from './gate.js';

const CONTENT_DESCRIPTOR_EXTENSION = '.diff.json';
const ORACLE_ARTIFACT_DIRECTORY = 'oracle';
const GIT_COMMAND = 'git';
const CHECKPOINT_ID_REQUIRED_PROBLEM =
  'checkpoint: --id <questId> is required';
const DRY_RUN_ARGUMENT = 'dry-run';
const CHECKPOINT_REASONS = new Set([
  'handoff', 'risky-tree', 'long-running', 'milestone',
]);
const GIT_ARGUMENT = Object.freeze({
  ADD: 'add',
  ALL: '--all',
  HEAD: 'HEAD',
  PATHS: '--',
  QUIET: '--quiet',
  RESET: 'reset',
});
// git serializes every index write on .git/index.lock and fails IMMEDIATELY rather
// than waiting for it. Two Quests landing at once therefore collide on a lock neither
// of them contends for semantically — their pathspecs are disjoint. Measured on this
// repo, two concurrent commit sequences on disjoint paths: 15 of 60 invocations died
// with "Unable to create '.git/index.lock': File exists". With the retry below: 0 of
// 60. This is the difference between parallel unattended Quests being possible and
// not, and no amount of solve/ locking addresses it — the contended resource is git's.
const GIT_INDEX_LOCK_PATTERN = /index\.lock/u;
const GIT_LOCK_RETRY_ATTEMPTS = 6;
const GIT_LOCK_RETRY_BASE_MS = 20;
// stderr must be captured, not ignored, or lock contention is indistinguishable from
// any other git failure and would be retried (or surfaced) wrongly.
const GIT_STDIO = Object.freeze(['ignore', 'ignore', 'pipe']);
const SKIP_GIT_BUSY = 'git-busy';

function toRootRelative(root, absolute) {
  return path.relative(root, absolute).replaceAll(path.sep, '/');
}

function questOracleFilePath(root, questId) {
  return path.resolve(
    root,
    SOLVE_DATA_DIR,
    ORACLE_ARTIFACT_DIRECTORY,
    `${questId}.json`,
  );
}

// The fixed solve/ artifacts a Quest owns by construction, whether or not they
// are currently dirty. The change directory is expressed as a prefix.
//
// The generated frontier board belongs here even though it is not id-owned:
// autoCommitQuest regenerates it immediately before computing this scope (see
// refreshFrontierBoardForCommit), so it is dirty exactly when this Quest's own
// landing staled it. Leaving it out forced a separate bookkeeping commit after each
// landing.
//
// The board's only correctness property is that it equals a regeneration of the tree
// it was committed with; the regeneration above is what establishes that, and no
// lock can improve on it. It is a pure projection with no wall-clock content, so with
// two Quests in flight a landing may sweep the other's board delta — the swept bytes
// are still a correct projection of the committed tree, which is why this widens the
// owned fixed set without weakening classifyDirtyPaths.
function questArtifactPaths(root, questId) {
  return {
    files: [
      questFilePath(root, questId),
      logFilePath(root, questId),
      stateFilePath(root, questId),
      questOracleFilePath(root, questId),
      frontierFilePath(root),
    ].map((absolute) => toRootRelative(root, absolute)),
    changeDirPrefix: `${toRootRelative(root, expectedChangeDir(root, questId))}/`,
  };
}

// Source/test files named inside this Quest's own change artifacts. These are the
// only non-solve/ paths a Quest legitimately touches.
function questChangeArtifactScope(root, quest) {
  const dir = expectedChangeDir(root, quest.id);
  if (!fs.existsSync(dir)) return {diffReferenced: [], contentObjects: []};
  const referenced = new Set();
  const contentObjects = new Set();
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.diff') &&
      !name.endsWith(CONTENT_DESCRIPTOR_EXTENSION)) continue;
    const artifactPath = toRootRelative(root, path.join(dir, name));
    const inspection = inspectChangeArtifact(root, quest, `diff:${artifactPath}`);
    if (!inspection.valid) continue;
    if (inspection.contentObjectPath) {
      contentObjects.add(inspection.contentObjectPath);
    }
    for (const filePath of inspection.changedPaths) {
      referenced.add(filePath);
    }
  }
  return {
    diffReferenced: [...referenced].sort(),
    contentObjects: [...contentObjects].sort(),
  };
}

// Pure scope decision: a dirty path is in-scope when it is one of the Quest's
// fixed solve/ artifacts, lives under its change directory, or is named by one of
// its diffs. Everything else dirty is explicitly out-of-scope.
export function classifyDirtyPaths(dirtyFiles, scope) {
  const fixed = new Set(scope.files);
  const referenced = new Set(scope.diffReferenced);
  const inScope = [];
  const outOfScope = [];
  for (const file of dirtyFiles) {
    const normalized = file.replaceAll(path.sep, '/');
    const owned = fixed.has(normalized) ||
      normalized.startsWith(scope.changeDirPrefix) ||
      referenced.has(normalized);
    (owned ? inScope : outOfScope).push(normalized);
  }
  return {inScope: inScope.sort(), outOfScope: outOfScope.sort()};
}

function gitDirtyFiles(root) {
  // -uall lists individual untracked files; without it git collapses a wholly
  // untracked directory (e.g. a brand-new quest's solve/ tree) into one entry,
  // which would never match the Quest's per-file scope.
  const output = execFileSync('git', ['status', '--porcelain', '-uall'], {
    cwd: root,
    encoding: 'utf8',
  });
  const files = new Set();
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    // Porcelain v1: XY <path> (or "<orig> -> <path>" for renames).
    const rest = line.slice(3);
    const arrow = rest.indexOf(' -> ');
    files.add(arrow === -1 ? rest : rest.slice(arrow + 4));
  }
  return [...files];
}

export function buildHandoff(root, quest, options = {}) {
  // Terminal handoff requires the full audit. Checkpoint mode deliberately uses
  // the narrower exact-attempt gate and drops terminal/aggregate requirements.
  const checkpoint = options.checkpoint === true;
  const audit = auditQuest(root, quest);
  const baseGate = checkpoint ? checkpointGate(root, quest) : commitGate(root, quest);
  const log = readLog(root, quest.id);
  const scopeStatus = scopeTerminalStatus(
    analyzeScopePressure(
      root,
      quest,
      log,
      {ignoreBaselines: true},
    ),
  );
  const scopeProblemMessage =
    'scope-pressure precommit blocked: split into bounded Quest declarations ' +
    `(files=${scopeStatus.fileCount}, owners=${scopeStatus.ownerCount}, ` +
    `bytes=${scopeStatus.changeBytes})`;
  const scopeWasAuthorized = scopeStatus.terminal &&
    latestAttemptAdmissionWasOverridden(
      log,
      CONTINUATION_BLOCKED_SCOPE,
      scopeProblemMessage,
    );
  const scopeProblem = scopeStatus.terminal && !scopeWasAuthorized ? [{
    message: scopeProblemMessage,
  }] : [];
  const gate = {
    ...baseGate,
    ready: baseGate.ready && scopeProblem.length === 0,
    problems: [...baseGate.problems, ...scopeProblem],
  };
  const artifactScope = questChangeArtifactScope(root, quest);
  const questArtifacts = questArtifactPaths(root, quest.id);
  const scope = {
    ...questArtifacts,
    files: [...questArtifacts.files, ...artifactScope.contentObjects],
    diffReferenced: artifactScope.diffReferenced,
  };
  const dirtyFiles = options.dirtyFiles || gitDirtyFiles(root);
  const {inScope, outOfScope} = classifyDirtyPaths(dirtyFiles, scope);
  const ok = gate.ready;
  return {
    ok,
    checkpoint,
    checkpointReason: options.checkpointReason || null,
    questId: quest.id,
    audit,
    gate,
    inScope,
    outOfScope,
    summary: quest.statement || quest.id,
    coauthorTrailer: resolveCoauthorTrailer(root),
    verificationPreflight: checkpoint ? checkpointVerificationPreflight(
      root,
      quest,
      log,
    ) : null,
  };
}

function commitMessage(handoff) {
  // Checkpoints are squashable, mid-quest saves of one verified attempt; the
  // subject marks them so they are distinguishable from the durable terminal
  // commit. The quest statement lives in the body: subjects stay one short
  // line (readable `git log --oneline`) while the checkpoint parser's
  // `checkpoint(quest): <id>:` prefix match is preserved by the trailing
  // colon on the checkpoint form.
  const subject = handoff.checkpoint ?
    `checkpoint(quest): ${handoff.questId}:` :
    `${handoff.questId}: ${handoff.summary}`;
  const body = handoff.checkpoint ? [
    handoff.summary,
    ...(handoff.checkpointReason ?
      [`durability-boundary: ${handoff.checkpointReason}`] : []),
  ] : [];
  if (handoff.coauthorTrailer) body.push(handoff.coauthorTrailer);
  return body.length > 0 ? `${subject}\n\n${body.join('\n\n')}` : subject;
}

function gitCommands(handoff) {
  if (handoff.inScope.length === 0) return [];
  // Commit only — nothing else (no push).
  return [
    [GIT_COMMAND, GIT_ARGUMENT.RESET, GIT_ARGUMENT.QUIET, GIT_ARGUMENT.HEAD,
      GIT_ARGUMENT.PATHS, ...handoff.inScope],
    [GIT_COMMAND, GIT_ARGUMENT.ADD, GIT_ARGUMENT.ALL, GIT_ARGUMENT.PATHS,
      ...handoff.inScope],
    ['git', 'commit', '--only', '-m', commitMessage(handoff), '--',
      ...handoff.inScope],
  ];
}

function appendPathSection(lines, title, paths, emptyLine) {
  lines.push('', title);
  if (paths.length === 0) {
    lines.push(emptyLine);
    return;
  }
  for (const file of paths) lines.push(`- ${file}`);
}

export function renderHandoff(handoff) {
  const lines = ['# Quest handoff', '', `- quest: ${handoff.questId}`,
    `- audit: ${handoff.audit.status}`];
  if (handoff.checkpoint && handoff.verificationPreflight) {
    lines.push(
      '',
      '## Verification preflight',
      ...checkpointVerificationPreflightLines(handoff.verificationPreflight),
    );
  }
  if (!handoff.ok) {
    const requirement = handoff.checkpoint ?
      'the latest source attempt must be unchanged and exactly approved' :
      'the terminal Quest must pass its full audit and aggregate verification';
    lines.push('',
      `REFUSED: commit preconditions not met — ${requirement}:`);
    for (const item of (handoff.gate?.problems || [])) {
      lines.push(`- ${item.message}${item.frontier ? ` [${item.frontier}]` : ''}`);
    }
    lines.push('');
    return lines.join('\n');
  }
  appendPathSection(
    lines,
    '## In scope (will be committed)',
    handoff.inScope,
    '_(no dirty in-scope files — nothing to commit)_',
  );
  appendPathSection(
    lines,
    '## Out of scope (excluded, NOT committed)',
    handoff.outOfScope,
    '_(none)_',
  );
  lines.push('', '## Commands');
  const commands = gitCommands(handoff);
  if (commands.length === 0) {
    lines.push('_(nothing to do)_');
  } else {
    for (const command of commands) {
      lines.push(`  ${command.map((part) => (/\s/u.test(part) ? `"${part}"` : part)).join(' ')}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function executeCommit(root, handoff) {
  for (const command of gitCommands(handoff)) {
    execFileSync(command[0], command.slice(1), {cwd: root, stdio: 'inherit'});
  }
}

// Is `root` inside a real git work tree? Auto-commit must be a no-op in throwaway
// tmpdirs (e.g. the unit-test fixtures) and anywhere git is unavailable, so we never
// surface a hard failure for an environment that simply isn't a repository.
function insideWorkTree(root) {
  try {
    const out = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim() === 'true';
  } catch {
    return false;
  }
}

// Atomics.wait needs a real Int32 slot to block on; one is enough. Blocking is the
// point — autoCommitQuest is synchronous, so a timer-based wait would never run.
const SLEEP_SLOT_BYTES = 4;

function sleepSync(ms) {
  Atomics.wait(
    new Int32Array(new SharedArrayBuffer(SLEEP_SLOT_BYTES)), 0, 0, ms);
}

function isIndexLockContention(error) {
  return GIT_INDEX_LOCK_PATTERN.test(
    `${error?.stderr || ''}${error?.message || ''}`);
}

// Run one git invocation, retrying ONLY on index-lock contention.
//
// Retrying a single invocation is safe precisely because a command that failed to
// acquire the lock did nothing at all — there is no partial index write to undo. That
// is why the retry wraps each invocation rather than the whole reset/add/commit
// sequence: re-running a sequence whose `commit` had already succeeded would be a
// different and much worse bug.
//
// Bounded (6 attempts, exponential from 20ms ≈ 620ms total) because an unbounded wait
// would convert a stale lock file — a real, operator-visible fault — into a hang.
function runGitCommand(root, args) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return execFileSync(GIT_COMMAND, args, {cwd: root, stdio: GIT_STDIO});
    } catch (error) {
      if (!isIndexLockContention(error) ||
        attempt >= GIT_LOCK_RETRY_ATTEMPTS - 1) {
        throw error;
      }
      sleepSync(GIT_LOCK_RETRY_BASE_MS * (2 ** attempt));
    }
  }
}

// Regenerate the frontier board so the bytes this commit captures are the board for
// the tree being committed.
//
// This must run BEFORE buildHandoff, not merely before the git calls. autoCommitQuest
// is invoked from inside the workflow (loop.js, operator-workflow.js) while the CLI's
// own refreshFrontierBoard runs afterwards, so at this point the on-disk board still
// predates this Quest's terminal event. And buildHandoff computes inScope from the
// dirty tree: a board regenerated after it is neither dirty-listed nor in the
// pathspec, so `git commit --only` would not pick it up at all. Regenerating here
// makes the board dirty exactly when this Quest's own landing staled it — which is
// what questArtifactPaths already claims.
//
// Never fails the commit: a board is a projection, and losing it must not strand a
// verified Quest with an uncommitted tree (same contract as solve.js
// refreshFrontierBoard).
function refreshFrontierBoardForCommit(root) {
  try {
    writeFrontier(root, runFrontierCommand(root));
  } catch (err) {
    process.stderr.write(
      `frontier board refresh before commit skipped: ${err.message}\n`);
  }
}

// Auto commit a Quest's in-scope work once it finishes, so the Solver persists its
// own scope-clean changes instead of accumulating an unrecoverable dirty tree. The
// commit gate is minimal — the quest must have FINISHED without errors (a SOLVED
// terminal) and any source change must be VERIFIED — and nothing else. It:
//   - never runs outside a git work tree (returns {skipped:'not-a-git-work-tree'});
//   - refuses until the commit gate is met (returns {skipped:'commit-gate'});
//   - commits only the Quest's in-scope pathspec, never the dirty-tree shape;
//   - skips cleanly when there is nothing in scope to commit;
//   - commits, nothing else — it never pushes.
export function autoCommitQuest(root, questId, options = {}) {
  if (!insideWorkTree(root)) {
    return {committed: false, skipped: 'not-a-git-work-tree'};
  }
  const checkpoint = options.checkpoint === true;
  const quest = loadQuest(root, questId);
  refreshFrontierBoardForCommit(root);
  const handoff = buildHandoff(root, quest, {
    checkpoint,
    checkpointReason: options.checkpointReason,
  });
  if (!handoff.ok) {
    return {
      committed: false,
      skipped: checkpoint ? 'checkpoint-gate' : 'commit-gate',
      gate: handoff.gate,
    };
  }
  if (handoff.inScope.length === 0) {
    return {committed: false, skipped: 'nothing-in-scope'};
  }
  // A landing that loses the index-lock race must report a typed, retryable skip
  // rather than throw. The throw would escape the workflow AFTER the terminal event
  // is already appended, leaving the Quest recorded as solved with its work
  // uncommitted and a dirty tree — the worst possible state to hand an unattended
  // supervisor. `git-busy` is recoverable: re-running land (or `solve handoff`)
  // commits the same scope.
  try {
    runGitCommand(root, [
      GIT_ARGUMENT.RESET,
      GIT_ARGUMENT.QUIET,
      GIT_ARGUMENT.HEAD,
      GIT_ARGUMENT.PATHS,
      ...handoff.inScope,
    ]);
    runGitCommand(root, [
      GIT_ARGUMENT.ADD,
      GIT_ARGUMENT.ALL,
      GIT_ARGUMENT.PATHS,
      ...handoff.inScope,
    ]);
    runGitCommand(root, ['commit', '--only', '-m', commitMessage(handoff),
      GIT_ARGUMENT.PATHS,
      ...handoff.inScope]);
  } catch (error) {
    if (isIndexLockContention(error)) {
      return {committed: false, skipped: SKIP_GIT_BUSY, questId};
    }
    throw error;
  }
  return {
    committed: true,
    checkpoint,
    paths: handoff.inScope,
    pushed: false,
    questId,
  };
}

export function runHandoffCommand(root, args) {
  const id = args.id || args._[0];
  if (!id) throw new Error('handoff: --id <questId> is required');
  const quest = loadQuest(root, id);
  // readLog is cheap and keeps a clear failure if the quest log is missing.
  readLog(root, id);
  const handoff = buildHandoff(root, quest);
  const rendered = renderHandoff(handoff);
  if (args.commit && handoff.ok && handoff.inScope.length > 0) {
    executeCommit(root, handoff);
    return `${rendered}\n(committed ${handoff.inScope.length} path(s))\n`;
  }
  if (args.commit && !handoff.ok) {
    return `${rendered}\n(not committed: commit gate not met)\n`;
  }
  return `${rendered}\n(dry run — pass --commit to execute)\n`;
}

// Explicit mid-Quest persistence. Findings never trigger commits; after a
// verifier records the exact attempt approval, the operator chooses this action.
export function runCheckpointCommand(root, args) {
  const id = args.id || args._[0];
  if (!id) throw new Error(CHECKPOINT_ID_REQUIRED_PROBLEM);
  const quest = loadQuest(root, id);
  const state = verificationState(root, quest, readLog(root, id));
  const candidateCheckpoint = Boolean(state.candidate?.fingerprint);
  const reason = typeof args.reason === 'string' ? args.reason : null;
  if (candidateCheckpoint && !CHECKPOINT_REASONS.has(reason)) {
    throw new Error('checkpoint: version 2 requires --reason ' +
      '<handoff|risky-tree|long-running|milestone>');
  }
  const handoff = buildHandoff(root, quest, {
    checkpoint: true,
    checkpointReason: reason,
  });
  const rendered = renderHandoff(handoff);
  if (args[DRY_RUN_ARGUMENT]) {
    return `${rendered}\n(dry run — omit --dry-run to execute checkpoint)\n`;
  }
  if (!handoff.ok) {
    return `${rendered}\n(not checkpointed: checkpoint preconditions not met)\n`;
  }
  if (handoff.inScope.length === 0) {
    return `${rendered}\n(not checkpointed: nothing in scope)\n`;
  }
  executeCommit(root, handoff);
  return `${rendered}\n(checkpointed ${handoff.inScope.length} path(s))\n`;
}
