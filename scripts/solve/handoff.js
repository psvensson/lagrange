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
//     paths plus the paths named inside the change artifacts of its RECORDED
//     attempts — see landing-union-guard.js). Never infer scope from the
//     shape of the dirty tree, and never from a change artifact on disk that
//     no attempt event references.
//   - Default to a dry run. Print the exact git commands and explicitly list the
//     out-of-scope dirty files so they are visibly excluded, never silently.

import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  loadQuest,
  projectState,
  readLog,
  questFilePath,
  logFilePath,
  stateFilePath,
  scopeSignatureHasAuthorization,
} from './store.js';
import {STATUS_SOLVED} from './constants.js';
import {auditQuest, commitGate, checkpointGate} from './audit.js';
import {analyzeScopePressure} from './scope-pressure.js';
import {scopeTerminalStatus} from './convergence-guards.js';
import {expectedChangeDir} from './change-artifact.js';
import {
  landingUnionGuard,
  recordedAttemptScope,
} from './landing-union-guard.js';
import {SOLVE_DATA_DIR} from './constants.js';
import {frontierFilePath, runFrontierCommand, writeFrontier} from './frontier.js';
import {resolveCoauthorTrailer} from './operator-config.js';
import {
  checkpointVerificationPreflight,
  checkpointVerificationPreflightLines,
} from './checkpoint-preflight.js';
import {verificationState} from './verification.js';
import {CONTINUATION_BLOCKED_SCOPE} from './continuation.js';
import {
  refreshSpecLadderForCommit,
  specLadderPathFromRef,
} from './spec-ladder-flip.js';
import {
  clearCommitAuthorization,
  issueCommitAuthorization,
} from './commit-authorization.js';
import {
  OWNER_DEBT_JAVASCRIPT_EXTENSIONS,
  OWNER_DEBT_SOURCE_DIRECTORIES,
} from '../global-owner-debt-inventory/constants.js';

const ORACLE_ARTIFACT_DIRECTORY = 'oracle';
const DERIVED_INVENTORY_PATHS = Object.freeze([
  'solve/changes/global-owner-debt-inventory/inventory.json',
  'solve/changes/priority-recovery-owner-inventory/inventory.json',
]);
const INVENTORY_GENERATOR_PATHS = Object.freeze([
  'scripts/generate-global-owner-debt-inventory.js',
  'scripts/generate-priority-recovery-owner-inventory.js',
]);
const INVENTORY_CACHE_DIRECTORY = 'solve/state/inventory-refresh';
const INVENTORY_CACHE_SCHEMA_VERSION = 1;
const INVENTORY_LOCK_DIRECTORY = 'refresh.lock';
const INVENTORY_LOCK_OWNER_FILE = 'owner.json';
const INVENTORY_LOCK_OWNER_TEMP_PREFIX = 'refresh-owner-';
const INVENTORY_LOCK_OWNER_TEMP_SUFFIX = '.json';
const INVENTORY_LOCK_STEAL_GUARD_SUFFIX = '.steal-guard';
const INVENTORY_LOCK_POLL_MS = 100;
const INVENTORY_LOCK_WAIT_LIMIT = 3_600;
const INVENTORY_LOCK_OWNERLESS_GRACE_MS = 250;
const INVENTORY_LOCK_STEAL_GUARD_STALE_MS = 2_000;
const INVENTORY_LOCK_TOKEN_BYTES = 16;
const INVENTORY_SOURCE_STABILITY_ATTEMPTS = 3;
const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const HASH_FIELD_SEPARATOR = '\0';
const TEXT_ENCODING = 'utf8';
const DIRECTORY_EXISTS_ERROR = 'EEXIST';
const MISSING_PATH_ERROR = 'ENOENT';
const PERMISSION_ERROR = 'EPERM';
const INVENTORY_LOCK_TIMEOUT_PROBLEM =
  'inventory refresh lock remained busy past its bounded wait';
const INVENTORY_SOURCE_STABILITY_PROBLEM =
  'repository source changed during every bounded inventory refresh attempt';
const SKIP_CHECKPOINT_GATE = 'checkpoint-gate';
const SKIP_COMMIT_GATE = 'commit-gate';
const SKIP_NOTHING_IN_SCOPE = 'nothing-in-scope';
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySort = Function.call.bind(Array.prototype.sort);
const arrayMap = Function.call.bind(Array.prototype.map);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const numberIsInteger = Number.isInteger;
const setHas = Function.call.bind(Set.prototype.has);
const GIT_COMMAND = 'git';
const COMMIT_MODE = Object.freeze({CHECKPOINT: 'checkpoint', LAND: 'land'});
const CHILD_STDIO_IGNORE = 'ignore';
const CHILD_STDIO_INHERIT = 'inherit';
const INVENTORY_REFRESH_ARGUMENT = '--refresh';
const INVENTORY_REFRESH_NOTICE =
  'Solver is refreshing the source-derived owner inventories (~2 min)\n';
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
      ...DERIVED_INVENTORY_PATHS.map((filePath) => path.resolve(root, filePath)),
    ].map((absolute) => toRootRelative(root, absolute)),
    changeDirPrefix: `${toRootRelative(root, expectedChangeDir(root, questId))}/`,
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

export function gitDirtyFiles(root, execute = execFileSync) {
  // -uall lists individual untracked files; without it git collapses a wholly
  // untracked directory (e.g. a brand-new quest's solve/ tree) into one entry,
  // which would never match the Quest's per-file scope.
  const output = execute('git', ['status', '--porcelain', '-uall'], {
    cwd: root,
    encoding: 'utf8',
    // A report-heavy worktree can legitimately exceed Node's 1 MiB child
    // process default. Dirty-path discovery is part of the same bounded Git
    // interaction as reset/add/commit below, so it must use the owner's shared
    // limit instead of failing before scope classification can exclude those
    // unrelated files.
    maxBuffer: GIT_MAX_BUFFER_BYTES,
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
  const scopePressure = analyzeScopePressure(
    root, quest, log, {ignoreBaselines: true});
  const scopeStatus = scopeTerminalStatus(scopePressure);
  const scopeProblemMessage =
    'scope-pressure precommit blocked: split into bounded Quest declarations ' +
    `(files=${scopeStatus.fileCount}, owners=${scopeStatus.ownerCount}, ` +
    `bytes=${scopeStatus.changeBytes})`;
  const latestAttempt = [...log].reverse().find((event) =>
    event.type === 'attempt');
  const exactAggregateWasApproved = Boolean(
    verificationState(root, quest, log).aggregateApproval);
  const scopeWasAuthorized = scopeStatus.terminal &&
    (exactAggregateWasApproved ||
      scopeSignatureHasAuthorization(
        log,
        latestAttempt?.frontier || null,
        CONTINUATION_BLOCKED_SCOPE,
        scopePressure.admission?.changedPaths || scopePressure.changedPaths,
      ));
  const scopeProblem = scopeStatus.terminal && !scopeWasAuthorized ? [{
    message: scopeProblemMessage,
  }] : [];
  const gate = {
    ...baseGate,
    ready: baseGate.ready && scopeProblem.length === 0,
    problems: [...baseGate.problems, ...scopeProblem],
  };
  // Source/test files named by this Quest's RECORDED attempts: the only
  // non-solve/ paths a landing may commit (the landing union guard refuses
  // any dirty source path outside this union before the commit is reached).
  const artifactScope = recordedAttemptScope(root, quest, log);
  const questArtifacts = questArtifactPaths(root, quest.id);
  // Registered generated outputs the union guard found byte-identical to a
  // fresh regeneration from the exact candidate (the seal this landing's
  // own refresh rewrote) ride the terminal landing commit, exactly like the
  // refreshed inventories; a checkpoint applies no union guard and takes
  // none.
  const coveredGeneratedPaths = checkpoint ?
    [] : landingUnionGuard(root, quest, log).coveredGeneratedPaths;
  // A spec-ladder row flipped by this landing (autoCommitQuest, before this
  // call) is owned scope the same way the regenerated frontier board is: dirty
  // exactly when this quest's own landing staled it. Scope inclusion mirrors
  // the flip's own precondition (terminal landing of a projected-SOLVED
  // quest) — unlike the always-regenerated board, a dirty tasks.md on a
  // checkpoint can only be a foreign hand-edit and must not ride the commit.
  const specLadderPath = !checkpoint &&
    projectState(quest, log).questStatus === STATUS_SOLVED ?
    specLadderPathFromRef(quest?.links?.specRef) : null;
  const scope = {
    ...questArtifacts,
    files: [
      ...questArtifacts.files,
      ...artifactScope.contentObjects,
      ...coveredGeneratedPaths,
      ...(specLadderPath ? [specLadderPath] : []),
    ],
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
    title: quest.title || null,
    coauthorTrailer: resolveCoauthorTrailer(root),
    verificationPreflight: checkpoint ? checkpointVerificationPreflight(
      root,
      quest,
      log,
      {probeReproducibility: Boolean(options.probeReproducibility)},
    ) : null,
  };
}

// A terminal subject without a sealed title falls back to the statement's
// first clause, hard-capped — never the multi-KB statement itself, which made
// `git log --oneline` unreadable across the whole 2026-07-26 epic window.
const TERMINAL_SUBJECT_LIMIT = 72;
const MIN_SUBJECT_SUMMARY_LENGTH = 24;
const SUBJECT_CLAUSE_BOUNDARY = /[.;] |\s+—\s+/u;
const SUBJECT_ELLIPSIS = '…';

function terminalSubjectSummary(handoff) {
  if (handoff.title) return handoff.title;
  const statement = String(handoff.summary || handoff.questId);
  const clause = statement.split(SUBJECT_CLAUSE_BOUNDARY)[0].trim();
  // The fallback budgets for the `<questId>: ` prefix so the whole subject
  // line stays readable; a sealed title is trusted at its lint-checked length.
  const budget = Math.max(
    MIN_SUBJECT_SUMMARY_LENGTH,
    TERMINAL_SUBJECT_LIMIT - String(handoff.questId).length - 2);
  if (clause.length <= budget) return clause;
  return `${clause.slice(0, budget - 1).trimEnd()}${SUBJECT_ELLIPSIS}`;
}

function commitMessage(handoff) {
  // Checkpoints are squashable, mid-quest saves of one verified attempt; the
  // subject marks them so they are distinguishable from the durable terminal
  // commit. The quest statement lives in the body on BOTH forms: subjects stay
  // one short line (readable `git log --oneline`) while the checkpoint
  // parser's `checkpoint(quest): <id>:` prefix match is preserved by the
  // trailing colon on the checkpoint form. The terminal body carries the full
  // sealed statement so it stays greppable in history.
  const subject = handoff.checkpoint ?
    `checkpoint(quest): ${handoff.questId}:` :
    `${handoff.questId}: ${terminalSubjectSummary(handoff)}`;
  const body = handoff.checkpoint ? [
    handoff.summary,
    ...(handoff.checkpointReason ?
      [`durability-boundary: ${handoff.checkpointReason}`] : []),
  ] : [handoff.summary];
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
  const commands = gitCommands(handoff);
  for (const command of commands.slice(0, 2)) {
    execFileSync(command[0], command.slice(1), {
      cwd: root,
      stdio: CHILD_STDIO_INHERIT,
    });
  }
  if (commands.length === 0) return;
  issueCommitAuthorization(root, {
    questId: handoff.questId,
    mode: handoff.checkpoint ? COMMIT_MODE.CHECKPOINT : COMMIT_MODE.LAND,
    paths: handoff.inScope,
  });
  try {
    const command = commands.at(-1);
    execFileSync(command[0], command.slice(1), {
      cwd: root,
      stdio: CHILD_STDIO_INHERIT,
    });
  } finally {
    clearCommitAuthorization(root);
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
      return execFileSync(GIT_COMMAND, args, {
        cwd: root,
        stdio: GIT_STDIO,
        maxBuffer: GIT_MAX_BUFFER_BYTES,
      });
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

function contentIdentity(file) {
  if (!fs.existsSync(file)) return null;
  return crypto.createHash(HASH_ALGORITHM)
    .update(fs.readFileSync(file)).digest(HASH_ENCODING);
}

function repositoryJavaScriptFiles(root) {
  const files = [];
  const visit = (directory) => {
    const entries = fs.readdirSync(directory, {withFileTypes: true});
    arraySort(entries, (left, right) => left.name < right.name ? -1 :
      left.name > right.name ? 1 : 0);
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      if (entry.isFile() &&
        setHas(OWNER_DEBT_JAVASCRIPT_EXTENSIONS, path.extname(entry.name))) {
        arrayPush(files, path.relative(root, absolute));
      }
    }
  };
  for (let index = 0; index < OWNER_DEBT_SOURCE_DIRECTORIES.length; index += 1) {
    const directory = path.join(root, OWNER_DEBT_SOURCE_DIRECTORIES[index]);
    if (fs.existsSync(directory)) visit(directory);
  }
  return files;
}

function repositoryJavaScriptSourceDigest(root) {
  const hash = crypto.createHash(HASH_ALGORITHM);
  const files = repositoryJavaScriptFiles(root);
  for (let index = 0; index < files.length; index += 1) {
    const filePath = files[index];
    hash.update(filePath).update(HASH_FIELD_SEPARATOR)
      .update(fs.readFileSync(path.join(root, filePath)));
  }
  return hash.digest(HASH_ENCODING);
}

function inventoryRefreshIdentity(root, sourceDigest) {
  return {
    schemaVersion: INVENTORY_CACHE_SCHEMA_VERSION,
    sourceDigest,
    repositorySourceDigest: repositoryJavaScriptSourceDigest(root),
    generators: arrayMap(INVENTORY_GENERATOR_PATHS, (filePath) => ({
      filePath,
      sha256: contentIdentity(path.join(root, filePath)),
    })),
  };
}

function inventoryOutputIdentities(root) {
  return arrayMap(DERIVED_INVENTORY_PATHS, (filePath) => ({
    filePath,
    sha256: contentIdentity(path.join(root, filePath)),
  }));
}

function inventoryRefreshCacheFile(root, identity) {
  const digest = crypto.createHash(HASH_ALGORITHM)
    .update(jsonStringify(identity)).digest(HASH_ENCODING);
  return path.join(root, INVENTORY_CACHE_DIRECTORY, `${digest}.json`);
}

function cachedInventoryRefresh(file, identity, outputs) {
  try {
    const cached = jsonParse(fs.readFileSync(file, TEXT_ENCODING));
    return jsonStringify(cached.identity) === jsonStringify(identity) &&
      jsonStringify(cached.outputs) === jsonStringify(outputs) &&
      arrayEvery(outputs, (output) => output.sha256 !== null);
  } catch {
    return false;
  }
}

function inventoryLockOwnerFile(lockDirectory) {
  try {
    return fs.lstatSync(lockDirectory).isDirectory() ?
      path.join(lockDirectory, INVENTORY_LOCK_OWNER_FILE) : lockDirectory;
  } catch {
    return lockDirectory;
  }
}

function readInventoryLockOwner(lockDirectory) {
  try {
    return jsonParse(fs.readFileSync(
      inventoryLockOwnerFile(lockDirectory), TEXT_ENCODING));
  } catch {
    return null;
  }
}

function inventoryLockPidAlive(pid) {
  if (!numberIsInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === PERMISSION_ERROR;
  }
}

function inventoryLockIsStale(lockDirectory) {
  const owner = readInventoryLockOwner(lockDirectory);
  if (owner) return !inventoryLockPidAlive(owner.pid);
  try {
    return Date.now() - fs.statSync(lockDirectory).mtimeMs >=
      INVENTORY_LOCK_OWNERLESS_GRACE_MS;
  } catch {
    return false;
  }
}

function removeInventoryStealGuardIfStale(guardDirectory) {
  try {
    if (Date.now() - fs.statSync(guardDirectory).mtimeMs >=
      INVENTORY_LOCK_STEAL_GUARD_STALE_MS) {
      fs.rmSync(guardDirectory, {recursive: true, force: true});
    }
  } catch (error) {
    if (error?.code !== MISSING_PATH_ERROR) throw error;
  }
}

function tryStealInventoryRefreshLock(lockDirectory) {
  const guardDirectory =
    `${lockDirectory}${INVENTORY_LOCK_STEAL_GUARD_SUFFIX}`;
  try {
    fs.mkdirSync(guardDirectory);
  } catch (error) {
    if (error?.code !== DIRECTORY_EXISTS_ERROR) throw error;
    removeInventoryStealGuardIfStale(guardDirectory);
    return;
  }
  try {
    if (fs.existsSync(lockDirectory) && inventoryLockIsStale(lockDirectory)) {
      fs.rmSync(lockDirectory, {recursive: true, force: true});
    }
  } finally {
    fs.rmSync(guardDirectory, {recursive: true, force: true});
  }
}

function tryAcquireInventoryRefreshLock(lockDirectory) {
  const owner = {
    pid: process.pid,
    token: crypto.randomBytes(INVENTORY_LOCK_TOKEN_BYTES).toString(HASH_ENCODING),
    acquiredAt: new Date().toISOString(),
  };
  const ownerTempFile = path.join(
    path.dirname(lockDirectory),
    `${INVENTORY_LOCK_OWNER_TEMP_PREFIX}${owner.token}` +
      INVENTORY_LOCK_OWNER_TEMP_SUFFIX,
  );
  try {
    // The complete owner record exists before the fixed lock name does. A hard
    // link publishes those exact bytes atomically, so there is no mkdir-to-owner
    // formation window in which a live owner can look abandoned.
    fs.writeFileSync(ownerTempFile, `${jsonStringify(owner)}\n`);
    fs.linkSync(ownerTempFile, lockDirectory);
  } catch (error) {
    if (error?.code === DIRECTORY_EXISTS_ERROR) {
      if (inventoryLockIsStale(lockDirectory)) {
        tryStealInventoryRefreshLock(lockDirectory);
      }
      return null;
    }
    throw error;
  } finally {
    fs.rmSync(ownerTempFile, {force: true});
  }
  return owner;
}

function releaseInventoryRefreshLock(lockDirectory, owner) {
  const current = readInventoryLockOwner(lockDirectory);
  if (current?.token !== owner.token) return;
  fs.rmSync(lockDirectory, {recursive: true, force: true});
}

function withInventoryRefreshLock(root, action) {
  const cacheDirectory = path.join(root, INVENTORY_CACHE_DIRECTORY);
  const lockDirectory = path.join(cacheDirectory, INVENTORY_LOCK_DIRECTORY);
  fs.mkdirSync(cacheDirectory, {recursive: true});
  for (let attempt = 0; attempt < INVENTORY_LOCK_WAIT_LIMIT; attempt += 1) {
    const owner = tryAcquireInventoryRefreshLock(lockDirectory);
    if (!owner) {
      sleepSync(INVENTORY_LOCK_POLL_MS);
      continue;
    }
    try {
      return action();
    } finally {
      releaseInventoryRefreshLock(lockDirectory, owner);
    }
  }
  throw new Error(INVENTORY_LOCK_TIMEOUT_PROBLEM);
}

function runInventoryGenerators(root, globalGenerator, priorityGenerator) {
  try {
    execFileSync(process.execPath, [globalGenerator], {
      cwd: root,
      stdio: CHILD_STDIO_IGNORE,
    });
  } catch {
    process.stderr.write(INVENTORY_REFRESH_NOTICE);
    execFileSync(process.execPath, [globalGenerator, INVENTORY_REFRESH_ARGUMENT], {
      cwd: root,
      stdio: CHILD_STDIO_INHERIT,
    });
  }
  execFileSync(process.execPath, [priorityGenerator], {
    cwd: root,
    stdio: CHILD_STDIO_INHERIT,
  });
}

function sameInventoryIdentity(left, right) {
  return jsonStringify(left) === jsonStringify(right);
}

function writeInventoryRefreshCache(cacheFile, identity, outputs) {
  fs.writeFileSync(cacheFile, `${jsonStringify({
    schemaVersion: INVENTORY_CACHE_SCHEMA_VERSION,
    identity,
    outputs,
  }, null, 2)}\n`);
}

function refreshDerivedInventoriesLocked(root, sourceDigest) {
  const [globalPath, priorityPath] = INVENTORY_GENERATOR_PATHS;
  const globalGenerator = path.join(root, globalPath);
  const priorityGenerator = path.join(root, priorityPath);
  if (!fs.existsSync(globalGenerator) || !fs.existsSync(priorityGenerator)) return;
  for (let attempt = 0;
    attempt < INVENTORY_SOURCE_STABILITY_ATTEMPTS;
    attempt += 1) {
    const identity = inventoryRefreshIdentity(root, sourceDigest);
    const cacheFile = inventoryRefreshCacheFile(root, identity);
    const outputsBeforeRefresh = inventoryOutputIdentities(root);
    if (cachedInventoryRefresh(cacheFile, identity, outputsBeforeRefresh)) {
      const currentIdentity = inventoryRefreshIdentity(root, sourceDigest);
      if (sameInventoryIdentity(identity, currentIdentity)) {
        return {refreshed: false, cached: true, sourceDigest};
      }
      continue;
    }
    runInventoryGenerators(root, globalGenerator, priorityGenerator);
    const currentIdentity = inventoryRefreshIdentity(root, sourceDigest);
    if (!sameInventoryIdentity(identity, currentIdentity)) continue;
    const outputs = inventoryOutputIdentities(root);
    writeInventoryRefreshCache(cacheFile, identity, outputs);
    return {refreshed: true, cached: false, sourceDigest};
  }
  throw new Error(INVENTORY_SOURCE_STABILITY_PROBLEM);
}

export function refreshDerivedInventoriesForCommit(root, sourceDigest) {
  return withInventoryRefreshLock(root, () =>
    refreshDerivedInventoriesLocked(root, sourceDigest));
}

function landingSourceDigest(root, quest, log) {
  const state = verificationState(root, quest, log);
  if (state.attempts.length === 0) return null;
  if (state.aggregate?.fingerprint) return state.aggregate.fingerprint;
  return `sha256:${crypto.createHash(HASH_ALGORITHM).update(jsonStringify(
    arrayMap(state.attempts, (attempt) => attempt.fingerprint || null),
  )).digest(HASH_ENCODING)}`;
}

function commitFinalHandoff(
  root,
  questId,
  quest,
  log,
  checkpoint,
  checkpointReason,
  sourceDigest,
) {
  const inventoryRefresh = sourceDigest ?
    refreshDerivedInventoriesLocked(root, sourceDigest) : null;
  refreshFrontierBoardForCommit(root);
  if (!checkpoint &&
    projectState(quest, log).questStatus === STATUS_SOLVED) {
    refreshSpecLadderForCommit(root, quest);
  }
  const handoff = buildHandoff(root, quest, {checkpoint, checkpointReason});
  if (!handoff.ok) {
    return {
      committed: false,
      skipped: checkpoint ? SKIP_CHECKPOINT_GATE : SKIP_COMMIT_GATE,
      gate: handoff.gate,
    };
  }
  if (handoff.inScope.length === 0) {
    return {committed: false, skipped: SKIP_NOTHING_IN_SCOPE};
  }
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
    issueCommitAuthorization(root, {
      questId,
      mode: checkpoint ? COMMIT_MODE.CHECKPOINT : COMMIT_MODE.LAND,
      paths: handoff.inScope,
    });
    try {
      runGitCommand(root, ['commit', '--only', '-m', commitMessage(handoff),
        GIT_ARGUMENT.PATHS,
        ...handoff.inScope]);
    } finally {
      clearCommitAuthorization(root);
    }
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
    inventoryRefresh,
  };
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
  const log = readLog(root, questId);
  const preliminary = buildHandoff(root, quest, {
    checkpoint,
    checkpointReason: options.checkpointReason,
  });
  if (!preliminary.ok) {
    return {
      committed: false,
      skipped: checkpoint ? SKIP_CHECKPOINT_GATE : SKIP_COMMIT_GATE,
      gate: preliminary.gate,
    };
  }
  if (preliminary.inScope.length === 0) {
    return {committed: false, skipped: SKIP_NOTHING_IN_SCOPE};
  }
  const sourceDigest = checkpoint ? null : landingSourceDigest(root, quest, log);
  const finalize = () => commitFinalHandoff(
    root, questId, quest, log, checkpoint, options.checkpointReason, sourceDigest);
  return sourceDigest ? withInventoryRefreshLock(root, finalize) : finalize();
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
    // Expensive, so explicit: `--probe-reproducibility` measures, for each
    // dead-base attempt, whether the recorded artifact bytes reproduce from
    // reachable commits, reporting the candidate count and never a base.
    probeReproducibility: Boolean(args['probe-reproducibility']),
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
