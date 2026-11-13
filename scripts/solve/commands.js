// The four v2 commands: start, note, probe, land (+ evidence add, board).
// Every command is a function of (root, options) returning a result object;
// the CLI prints it. Nothing here writes outside solve/quests/<id>/ except
// `land`, which commits.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {CHECK_BASE_ENV} from '../checks/change-selection-constants.js';
import {ENTRY_TYPE, NEXT_OWNER, QUEST_STATUS, VERDICT, text} from './schema.js';
import {appendEntry, listQuestIds, logFile, questDir, readQuest, verdictOf} from './store.js';
import {measure, requiredProofArtifacts} from './probes.js';
import {
  canonicalImportGraphProblem, coupledPairProblems, epicScopeProblems, git,
  gitCommonDir, headSha, requiresVerification, stageablePaths, staticQualityProblems,
} from './guards.js';
import {
  addingCommits, bundleBasename, parsePathsList, recordRelocation, relocationManifest,
  relocationRecordsDir, relocationRefusals, relocationShard, removeRelocated,
  sourceBlobs, sourceRefusals, verifyRelocationBundle, writeRelocationBundle,
} from './evidence-store.js';
import {
  MESSAGE, SolveError, board, changeSetRecord, computeCandidateDigest, evidenceAdd,
  evidenceDelete, loadEpic, note, openState, pathsOutsideQuest, probe, refuse, start,
} from './quest-record-commands.js';

const TEXT_ENCODING = 'utf8';
const LINE_SEPARATOR = '\n';
const ALTITUDE_BUDGET = 3;
const LANDING_MARKER_ENV = 'LAGRANGE_SOLVER_LANDING';
const LANDING_MARKER_VALUE = '1';
const NPM = 'npm';
const NPM_TEST_ARGUMENTS = Object.freeze(['test']);
const TEST_METADATA_REFRESH_ARGUMENTS =
  Object.freeze(['run', '-s', 'test:metadata:refresh']);
// The change proof's base. Landing proves the tree that will be committed,
// and that tree differs from HEAD by exactly the staged quest scope, so HEAD
// is the base that names the quest delta. The publication merge-base is the
// PUSH gate's range (a branch with several landed quests proves them all
// again at every land otherwise - 1927 tests for a one-file repair, measured
// 2026-09-17); the base is announced so the narrower proof is never silent.
const LAND_PROOF_BASE = 'HEAD';
const LAND_PROOF_BASE_ANNOUNCEMENT =
  'land: change proof base HEAD (the quest delta the index holds); ' +
  'the branch range is the push gate\'s proof; each file executes once\n';
const INVENTORY_PRODUCER = 'scripts/generate-global-owner-debt-inventory.js';
const INVENTORY_REFRESH_ARGUMENT = '--refresh';
const PRIORITY_INVENTORY_PRODUCER = 'scripts/generate-priority-recovery-owner-inventory.js';
// The src directory indexes read the sealed import graph the inventory
// refresh writes, so they regenerate after it; the pathspec stages every
// index, a removed directory's deletion included.
const SOURCE_OWNER_INDEX_PRODUCER = 'scripts/generate-source-owner-index.js';
const SOURCE_OWNER_INDEX_WRITE_ARGUMENT = '--write';
const SOURCE_OWNER_INDEX_ROOT = 'src/INDEX.md';
const SOURCE_OWNER_INDEX_PATHSPEC = ':(glob)src/**/INDEX.md';
const LAND_LOCK_FILENAME = 'lagrange-solve-land.lock';
const LAND_LOCK_STALE_MS = 2 * 60 * 60 * 1000;
const LAND_LOCK_POLL_MS = 200;
const LAND_LOCK_TIMEOUT_MS = 90 * 60 * 1000;
const LAND_LOCK_TIMEOUT_REFUSAL =
  'land: could not acquire landing lock in git common dir; another landing is in progress';
const LAND_PROOF_FILENAME = 'lagrange-land-proof.json';
const PROOF_SCOPE_FILENAME = 'proof-scope.json';
const TEST_OUTPUT_DIR = 'test-output';
const INVENTORY_REFRESH_PREFIXES = Object.freeze(['src/', 'test/', 'scripts/', 'package']);
const INT32_BYTES = 4;
const LOCK_OPEN_MODE = 'wx';
const LOCK_ERROR_EXIST = 'EEXIST';
const LOCK_ERROR_PERM = 'EPERM';
const PROC_DIR = '/proc';
const PROC_STAT_FILENAME = 'stat';
const PROC_CMDLINE_FILENAME = 'cmdline';
const PROC_NS_PID_PATH = 'ns/pid';
const STAT_COMM_CLOSE = ')';
const STAT_STARTTIME_OFFSET = 19;
const STAT_FIELD_DELIMITER = /\s+/u;
const RUNNER_INPUT_TYPE_FLAG = '--input-type=module';
const RUNNER_EVAL_FLAG = '-e';
const UNKNOWN_ERROR = 'unknown error';
const PARALLEL_INVENTORY_RUNNER = `
import {spawn} from 'node:child_process';

function runChild(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status, signal) => { resolve({status, signal, stdout, stderr}); });
  });
}

async function runGlobal() {
  const fast = await runChild(process.execPath, [process.argv[1]]);
  if (fast.status === 0) return {ok: true};
  const refresh = await runChild(process.execPath, [process.argv[1], process.argv[2]]);
  if (refresh.status === 0) return {ok: true};
  return {ok: false, error: refresh.stderr || refresh.stdout};
}

async function runPriority() {
  const priority = await runChild(process.execPath, [process.argv[3]]);
  if (priority.status === 0) return {ok: true};
  return {ok: false, error: priority.stderr || priority.stdout};
}

const [globalResult, priorityResult] = await Promise.all([runGlobal(), runPriority()]);
process.stdout.write(JSON.stringify({globalResult, priorityResult}));
`;
const GENERATED_INVENTORY_PATHS = Object.freeze([
  'solve/changes/global-owner-debt-inventory/inventory.json',
  'solve/changes/priority-recovery-owner-inventory/inventory.json',
  'test/shards/primary-classes.json',
  'test/shards/resource-classes.json',
  'test/shards/subsystem-classes.json',
  'test/shards/impact-graph-seal.json',
]);
const SPAWN_MAX_BUFFER = 64 * 1024 * 1024;
const TEST_TIMEOUT_MS = 90 * 60 * 1000;
// The commit-time checks, run before the proof: `.githooks/pre-commit` over
// the staged index (file-size ratchets, guideline audits, lint).
const PRE_COMMIT_HOOK = '.githooks/pre-commit';
const SHELL = 'bash';
const PRE_COMMIT_TIMEOUT_MS = 10 * 60 * 1000;
const COMMIT_SUBJECT_LIMIT = 72;
const NO_VERIFY_FLAG = '--no-verify';
const GIT_ADD = Object.freeze(['add', '--all', '--']);
const GIT_ADD_ONE = Object.freeze(['add', '--']);
const GIT_COMMIT = Object.freeze(['commit', '--quiet', '-m']);
const GIT_UNSTAGE = Object.freeze(['reset', '--quiet', '--']);
// Whether the newest verification stands as a verdict on the current tree.
const VERDICT_STATE = Object.freeze({
  NONE: 'none', STALE: 'stale', APPROVED: 'approved', REJECTED: 'rejected',
});
const VERIFICATION_PROBLEMS = Object.freeze({
  [VERDICT_STATE.NONE]: MESSAGE.VERIFICATION_MISSING,
  [VERDICT_STATE.STALE]: MESSAGE.VERIFICATION_STALE,
  [VERDICT_STATE.REJECTED]: MESSAGE.VERIFICATION_NOT_APPROVED,
  [VERDICT_STATE.APPROVED]: null,
});
// --- land ----------------------------------------------------------------------

function verdictState(state) {
  const last = state.lastVerification;
  if (!last) return VERDICT_STATE.NONE;
  if (!state.verificationIsCurrent) return VERDICT_STATE.STALE;
  return verdictOf(last) === VERDICT.APPROVE ? VERDICT_STATE.APPROVED : VERDICT_STATE.REJECTED;
}

function verificationProblems(state, paths, currentCandidateDigest) {
  const last = state.lastVerification;
  const verdict = verdictState(state);
  const problems = [];
  if (verdict === VERDICT_STATE.REJECTED) problems.push(MESSAGE.REJECTION_STANDS);
  const required = requiresVerification(paths) ? VERIFICATION_PROBLEMS[verdict] : null;
  if (required) problems.push(required);
  if (last?.candidateDigest && currentCandidateDigest &&
      last.candidateDigest !== currentCandidateDigest) {
    problems.push(
      `${MESSAGE.VERIFICATION_CONTENT_MISMATCH}: expected ${last.candidateDigest}, got ${currentCandidateDigest}`,
    );
  }
  return problems;
}

function altitudeProblems(state) {
  return state.attemptsSinceAltitudeCheck.length > ALTITUDE_BUDGET ? [
    `${state.attemptsSinceAltitudeCheck.length} attempts since the last ` +
    `altitude-check finding (budget ${ALTITUDE_BUDGET}); record one before landing`,
  ] : [];
}

function requiresInventoryRefresh(paths) {
  if (!paths || paths.length === 0) return true;
  return paths.some((filePath) =>
    INVENTORY_REFRESH_PREFIXES.some((prefix) => filePath.startsWith(prefix)));
}

function verifyRunnerOutcome(outcome) {
  if (!outcome.globalResult?.ok) {
    refuse(`inventory refresh failed: ${outcome.globalResult?.error || UNKNOWN_ERROR}`);
  }
  if (!outcome.priorityResult?.ok) {
    refuse(`priority inventory failed: ${outcome.priorityResult?.error || UNKNOWN_ERROR}`);
  }
}

function refreshInventories(root) {
  const runnerResult = spawnSync(process.execPath, [
    RUNNER_INPUT_TYPE_FLAG, RUNNER_EVAL_FLAG, PARALLEL_INVENTORY_RUNNER,
    path.join(root, INVENTORY_PRODUCER),
    INVENTORY_REFRESH_ARGUMENT,
    path.join(root, PRIORITY_INVENTORY_PRODUCER),
  ], {cwd: root, encoding: TEXT_ENCODING, maxBuffer: SPAWN_MAX_BUFFER});

  if (runnerResult.status !== 0) {
    refuse(`inventory refresh failed: ${runnerResult.stderr || runnerResult.stdout}`);
  }
  let outcome;
  try {
    outcome = JSON.parse(runnerResult.stdout);
  } catch (error) {
    refuse(`inventory runner output unreadable: ${error.message}`);
  }
  verifyRunnerOutcome(outcome);
  const testMetadata = spawnSync(NPM, TEST_METADATA_REFRESH_ARGUMENTS,
    {cwd: root, encoding: TEXT_ENCODING, maxBuffer: SPAWN_MAX_BUFFER});
  if (testMetadata.status !== 0) {
    refuse(`test metadata refresh failed: ${testMetadata.stderr}`);
  }
  const ownerIndexes = spawnSync(process.execPath,
    [path.join(root, SOURCE_OWNER_INDEX_PRODUCER), SOURCE_OWNER_INDEX_WRITE_ARGUMENT],
    {cwd: root, encoding: TEXT_ENCODING, maxBuffer: SPAWN_MAX_BUFFER});
  if (ownerIndexes.status !== 0) {
    refuse(`source owner index refresh failed: ${ownerIndexes.stderr}`);
  }
}

// The environment the landing proof runs under: the caller's, with the
// change-proof base pinned to the quest delta. The canonical runner owns
// single-pass execution for land, publication and CI alike.
function landChangeProofEnvironment(env = process.env) {
  return {
    ...env,
    [CHECK_BASE_ENV]: LAND_PROOF_BASE,
    [LANDING_MARKER_ENV]: LANDING_MARKER_VALUE,
  };
}

// `spawn` is the process seam: the witness observes the environment the
// proof is actually spawned with, not only the helper that builds it.
function runChangeProof(root, log, spawn = spawnSync) {
  log(LAND_PROOF_BASE_ANNOUNCEMENT);
  const env = landChangeProofEnvironment();
  const result = spawn(NPM, [...NPM_TEST_ARGUMENTS], {cwd: root,
    encoding: TEXT_ENCODING, maxBuffer: SPAWN_MAX_BUFFER, timeout: TEST_TIMEOUT_MS,
    env, stdio: ['ignore', 'pipe', 'pipe']});
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  log(output);
  if (result.status === 0) return;
  refuse(`npm test failed (exit ${result.status})`);
}

function commitSubject(quest) {
  const statement = text(quest.statement).replace(/\s+/gu, ' ');
  const limit = COMMIT_SUBJECT_LIMIT - quest.id.length - 2;
  return `${quest.id}: ${statement.length > limit ?
    `${statement.slice(0, limit - 1)}…` : statement}`;
}

// The index IS the change set being proven and committed: a checker that
// reads the repository through `git ls-files` (test taxonomy liveness, the
// classification shards) must see the post-landing tree, not the pre-landing
// one. Staging happens before the proof and again before the commit, because
// the terminal log entry is appended in between.
function stageLanding(root, quest, paths) {
  git(root, [...GIT_ADD, ...stageablePaths(root, paths), questDir(root, quest.id)]);
  stageGeneratedArtifacts(root);
}

// The refresh's outputs are not in the quest's recorded paths: they are
// written after the change set is measured, so they are staged by name.
function stageGeneratedArtifacts(root) {
  for (const generated of GENERATED_INVENTORY_PATHS) {
    if (fs.existsSync(path.join(root, generated))) git(root, [...GIT_ADD_ONE, generated]);
  }
  if (fs.existsSync(path.join(root, SOURCE_OWNER_INDEX_ROOT))) {
    git(root, [...GIT_ADD, SOURCE_OWNER_INDEX_PATHSPEC]);
  }
}

// Give the index back to the caller exactly as a refusal found it.
function unstageLanding(root, quest, paths) {
  git(root, [...GIT_UNSTAGE, ...paths, questDir(root, quest.id)], {allowFailure: true});
}

function runStagedPreCommitCheck(root, quest, paths, options) {
  if (options.skipProof || !fs.existsSync(path.join(root, PRE_COMMIT_HOOK))) return false;
  const hookProblem = preCommitProblem(root);
  if (hookProblem) {
    unstageLanding(root, quest, paths);
    refuse(hookProblem);
  }
  return true;
}

// Refresh the generated inventories, verify the canonical import graph, stage
// the change set, and prove it. Staging precedes the proof because the index
// IS the change set: a checker reading the repository through `git ls-files`
// must see the tree that will be committed. A refused proof gives the index
// back. `options.runProof` replaces the environment-bound default, which is
// how the staged-tree guarantee is observed under test.
function proveLanding(root, quest, paths, options) {
  const injected = options.runProof || null;
  const shouldRefresh = requiresInventoryRefresh(paths);
  if (!injected && !options.skipProof && shouldRefresh) {
    refreshInventories(root);
    const graphProblem = canonicalImportGraphProblem(root);
    if (graphProblem) refuse(graphProblem);
  }
  stageLanding(root, quest, paths);
  const hookRan = runStagedPreCommitCheck(root, quest, paths, options);
  const proof = injected || (options.skipProof ? null : runChangeProof);
  if (!proof) return {hookRan};
  try {
    proof(root, options.log || (() => {}));
  } catch (error) {
    unstageLanding(root, quest, paths);
    throw error;
  }
  return {hookRan};
}

// The pre-commit hook against the staged index, with the landing marker the
// commit itself will carry; absent hook (a fixture repository) means nothing
// to check. Returns the refusal text or null.
function preCommitProblem(root) {
  const hook = path.join(root, PRE_COMMIT_HOOK);
  if (!fs.existsSync(hook)) return null;
  const result = spawnSync(SHELL, [hook], {cwd: root, encoding: TEXT_ENCODING,
    maxBuffer: SPAWN_MAX_BUFFER, timeout: PRE_COMMIT_TIMEOUT_MS,
    env: {...process.env, [LANDING_MARKER_ENV]: LANDING_MARKER_VALUE}});
  if (result.status === 0) return null;
  return `${MESSAGE.PRE_COMMIT_REFUSED}${LINE_SEPARATOR}` +
    `${result.stdout || ''}${result.stderr || ''}`;
}

function isPidAlive(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === LOCK_ERROR_PERM;
  }
}

function readPidStartTime(pid) {
  if (!pid || typeof pid !== 'number' || pid <= 0) return null;
  try {
    const statPath = path.join(PROC_DIR, String(pid), PROC_STAT_FILENAME);
    const content = fs.readFileSync(statPath, TEXT_ENCODING);
    const lastParen = content.lastIndexOf(STAT_COMM_CLOSE);
    if (lastParen < 0) return null;
    const remainder = content.slice(lastParen + 1).trim();
    const fields = remainder.split(STAT_FIELD_DELIMITER);
    const value = fields[STAT_STARTTIME_OFFSET];
    return (typeof value === 'string' && value.length > 0) ? value : null;
  } catch (_error) {
    return null;
  }
}

function readPidNamespace(pid) {
  if (!pid || typeof pid !== 'number' || pid <= 0) return null;
  try {
    const nsPath = path.join(PROC_DIR, String(pid), PROC_NS_PID_PATH);
    return fs.readlinkSync(nsPath);
  } catch (_error) {
    return null;
  }
}

function isKernelThreadPid(pid) {
  if (!pid || typeof pid !== 'number' || pid <= 0) return false;
  try {
    const cmdlinePath = path.join(PROC_DIR, String(pid), PROC_CMDLINE_FILENAME);
    const content = fs.readFileSync(cmdlinePath);
    return content.length === 0;
  } catch (_error) {
    return false;
  }
}

function inspectPidIdentity(pid) {
  return {
    alive: isPidAlive(pid),
    pidStartTime: readPidStartTime(pid),
    pidNamespace: readPidNamespace(pid),
    isKernelThread: isKernelThreadPid(pid),
  };
}

function readLockRecord(lockPath) {
  try {
    const content = fs.readFileSync(lockPath, TEXT_ENCODING);
    return JSON.parse(content);
  } catch (_error) {
    return null;
  }
}

function isPidIdentityStale(record, live) {
  if (!live || !live.alive) return true;
  if (live.isKernelThread === true) return true;
  if (record.pidStartTime && live.pidStartTime && record.pidStartTime !== live.pidStartTime) {
    return true;
  }
  if (record.pidNamespace && live.pidNamespace && record.pidNamespace !== live.pidNamespace) {
    return true;
  }
  return false;
}

function hasOptionalIdentityField(value) {
  return value !== undefined && value !== null;
}

function isPidIdentityVerified(record, live) {
  if (!record || !live) return false;
  if (typeof record.pidStartTime !== 'string' || record.pidStartTime.length === 0) return false;
  if (record.pidStartTime !== live.pidStartTime) return false;
  if (hasOptionalIdentityField(record.pidNamespace) ||
      hasOptionalIdentityField(live.pidNamespace)) {
    if (typeof record.pidNamespace !== 'string' || record.pidNamespace.length === 0) return false;
    if (record.pidNamespace !== live.pidNamespace) return false;
  }
  return true;
}

function isLockStale(record, now = Date.now(), inspectFn = inspectPidIdentity) {
  if (!record || typeof record.pid !== 'number') return true;
  const live = inspectFn(record.pid);
  if (isPidIdentityStale(record, live)) return true;
  if (isPidIdentityVerified(record, live)) return false;
  if (record.createdAt && (now - record.createdAt > LAND_LOCK_STALE_MS)) return true;
  return false;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(INT32_BYTES)), 0, 0, ms);
}

function tryCreateLandingLock(lockPath, questId, nowFn, inspectFn = inspectPidIdentity) {
  try {
    const fd = fs.openSync(lockPath, LOCK_OPEN_MODE);
    const identity = inspectFn(process.pid) || {};
    const payload = JSON.stringify({
      pid: process.pid,
      pidStartTime: identity.pidStartTime ?? null,
      pidNamespace: identity.pidNamespace ?? null,
      createdAt: nowFn(),
      questId: questId || null,
    }) + LINE_SEPARATOR;
    fs.writeFileSync(fd, payload, {encoding: TEXT_ENCODING});
    fs.closeSync(fd);
    return true;
  } catch (error) {
    if (error.code !== LOCK_ERROR_EXIST) {
      throw error;
    }
    return false;
  }
}

function isOwnedLockRecord(current, selfPid, inspectFn) {
  if (current.pid !== selfPid) return false;
  const selfIdentity = inspectFn(selfPid) || {};
  if (!hasOptionalIdentityField(current.pidStartTime) &&
      !hasOptionalIdentityField(selfIdentity.pidStartTime) &&
      !hasOptionalIdentityField(current.pidNamespace) &&
      !hasOptionalIdentityField(selfIdentity.pidNamespace)) {
    return true;
  }
  return isPidIdentityVerified(current, selfIdentity);
}

function removeOwnedLock(lockPath, inspectFn = inspectPidIdentity) {
  try {
    if (fs.existsSync(lockPath)) {
      const current = readLockRecord(lockPath);
      if (!current || isOwnedLockRecord(current, process.pid, inspectFn)) {
        fs.unlinkSync(lockPath);
      }
    }
  } catch (_error) {
    return false;
  }
  return true;
}

function clearStaleLock(lockPath, now, inspectFn = inspectPidIdentity) {
  const record = readLockRecord(lockPath);
  if (isLockStale(record, now, inspectFn)) {
    try {
      fs.unlinkSync(lockPath);
      return true;
    } catch (_err) {
      return false;
    }
  }
  return false;
}

function acquireLandingLock(root, options = {}) {
  const common = gitCommonDir(root);
  if (!fs.existsSync(common)) {
    fs.mkdirSync(common, {recursive: true});
  }
  const lockPath = path.join(common, LAND_LOCK_FILENAME);
  const timeoutMs = options.lockTimeoutMs ?? LAND_LOCK_TIMEOUT_MS;
  const pollMs = options.lockPollMs ?? LAND_LOCK_POLL_MS;
  const nowFn = options.now ?? Date.now;
  const sleepFn = options.sleep ?? sleepSync;
  const inspectFn = options.inspectPid ?? inspectPidIdentity;
  const start = nowFn();

  while (true) {
    if (tryCreateLandingLock(lockPath, options.id, nowFn, inspectFn)) {
      return {
        lockPath,
        release: () => removeOwnedLock(lockPath, inspectFn),
      };
    }
    if (clearStaleLock(lockPath, nowFn(), inspectFn)) {
      continue;
    }
    if (nowFn() - start >= timeoutMs) {
      refuse(LAND_LOCK_TIMEOUT_REFUSAL);
    }
    sleepFn(pollMs);
  }
}

function commitLanding(root, quest, paths, options) {
  const env = {...process.env, [LANDING_MARKER_ENV]: LANDING_MARKER_VALUE};
  stageLanding(root, quest, paths);
  const message = [commitSubject(quest), '', `Quest: ${quest.id}`,
    quest.epic ? `Epic: ${quest.epic}` : null, `Sealed-At: ${quest.sealedAt}`,
    ...(options.trailers || [])].filter((line) => line !== null).join(LINE_SEPARATOR);
  const args = [...GIT_COMMIT, message];
  if (options.noVerify) args.push(NO_VERIFY_FLAG);
  git(root, args, {env});
  return headSha(root);
}

function readProofScopeTests(root) {
  try {
    const scopePath = path.join(root, TEST_OUTPUT_DIR, PROOF_SCOPE_FILENAME);
    if (!fs.existsSync(scopePath)) return [];
    const scope = JSON.parse(fs.readFileSync(scopePath, TEXT_ENCODING));
    if (Array.isArray(scope?.testPaths)) return scope.testPaths;
    if (Array.isArray(scope?.tests)) return scope.tests;
    return [];
  } catch (_error) {
    return [];
  }
}

function recordLandProofReceipt(root, commit, baseBeforeLand, questId, options) {
  if (options.skipProof || options.runProof) return;
  try {
    const tests = readProofScopeTests(root);
    const receiptPath = path.join(gitCommonDir(root), LAND_PROOF_FILENAME);
    const payload = JSON.stringify({
      commit,
      base: baseBeforeLand,
      questId,
      tests,
      provedAt: Date.now(),
    }) + LINE_SEPARATOR;
    fs.writeFileSync(receiptPath, payload, {encoding: TEXT_ENCODING});
  } catch (_error) {
    // bookkeeping never fails a landing
  }
}

/**
 * Land: every guard, the change proof, the commit, then the terminal entry.
 * Never pushes. `options.log` receives the proof output; `options.runProof`
 * replaces the default `npm test` (tests observe the staged tree through it).
 * @param {string} root
 * @param {{id: string, log?: Function, skipProof?: boolean,
 *   runProof?: Function}} options
 * @return {Object}
 */
function land(root, options) {
  const {quest, state} = openState(root, options.id);
  if (!state.seal) refuse(`quest ${quest.id} is not sealed; run start first`);
  if (state.status === QUEST_STATUS.BLOCKED) {
    refuse(`quest ${quest.id} is blocked (next owner ${state.blocked.nextOwner}): ` +
      `${state.blocked.text}; record the attempt or typed finding that clears it`);
  }
  if (JSON.stringify(quest.doneWhen) !== JSON.stringify(state.seal.seal.doneWhen)) {
    refuse(`quest ${quest.id}: doneWhen differs from the sealed probe; ${MESSAGE.PROBE_IMMUTABLE}`);
  }
  const epic = loadEpic(root, quest);
  const measured = measure(root, quest.doneWhen);
  const problems = [];
  if (!measured.done) {
    problems.push(`doneWhen is not green: metric ${measured.metric} target ` +
      `${measured.target} (${measured.reason})`);
  }
  const paths = pathsOutsideQuest(root, quest.id);
  const currentCandidateDigest = computeCandidateDigest(root, quest);
  problems.push(...verificationProblems(state, paths, currentCandidateDigest));
  problems.push(...altitudeProblems(state));
  problems.push(...epicScopeProblems(quest, epic, paths));
  problems.push(...coupledPairProblems(root, paths));
  problems.push(...staticQualityProblems(root, paths));
  if (problems.length > 0) {
    refuse(`${MESSAGE.LAND_REFUSED}${LINE_SEPARATOR}${MESSAGE.PROBLEM_BULLET}` +
      problems.join(`${LINE_SEPARATOR}${MESSAGE.PROBLEM_BULLET}`));
  }
  const landingLock = acquireLandingLock(root, options);
  let proven;
  try {
    const baseBeforeLand = headSha(root);
    proven = proveLanding(root, quest, paths, options);
    // The terminal entry rides in the landing commit; a refused commit takes
    // the entry back out so the quest stays open and land can be retried.
    const logPath = logFile(root, quest.id);
    const logBefore = fs.readFileSync(logPath);
    const terminal = appendEntry(root, quest.id, {
      type: ENTRY_TYPE.TERMINAL,
      status: QUEST_STATUS.SOLVED,
      text: `landed: probe ${quest.doneWhen.probe} metric=${measured.metric} ` +
        `target=${measured.target}; ${paths.length} paths`,
      probe: measured,
      ...changeSetRecord(paths),
    });
    let commit;
    try {
      const commitOptions = {...options,
        noVerify: options.noVerify || Boolean(proven?.hookRan)};
      commit = commitLanding(root, quest, paths, commitOptions);
    } catch (error) {
      fs.writeFileSync(logPath, logBefore);
      unstageLanding(root, quest, paths);
      refuse(`land: the commit was refused, the quest stays open: ${error.message}`);
    }
    recordLandProofReceipt(root, commit, baseBeforeLand, quest.id, options);
    return {id: quest.id, commit, paths, probe: measured, terminal};
  } finally {
    landingLock.release();
  }
}

// --- evidence relocate -----------------------------------------------------------

const RELOCATE_MESSAGE = Object.freeze({
  PATHS_FILE_REQUIRED: 'evidence relocate: --paths-file <list> is required',
  SOURCE_COMMIT_REQUIRED: 'evidence relocate: --source-commit <sha> is required',
  EMPTY: 'evidence relocate: the paths file names no path',
  REFUSED: 'evidence relocate: refusing',
  UNVERIFIED: 'evidence relocate: the re-downloaded bundle did not verify; ' +
    'nothing was removed and no inventory entry was written:',
});
const RELOCATE_SCRATCH_PREFIX = 'solve-relocate-';
const RELOCATE_REFUSAL_SAMPLE = 20;
const LABEL_SUFFIX = '-evidence';
const ISO_DATE_LENGTH = 10;
const COMMIT_SUFFIX = '^{commit}';

function requiredArtifactSet(root) {
  return new Set(listQuestIds(root).flatMap((id) =>
    requiredProofArtifacts(readQuest(root, id).doneWhen)));
}

function refuseListed(refusals) {
  if (refusals.length === 0) return;
  const sample = refusals.slice(0, RELOCATE_REFUSAL_SAMPLE)
    .map((entry) => `${MESSAGE.PROBLEM_BULLET}${entry.path}: ${entry.reason}`);
  refuse([`${RELOCATE_MESSAGE.REFUSED} ${refusals.length} path(s):`, ...sample]
    .join(LINE_SEPARATOR));
}

function relocationInputs(root, options) {
  if (!text(options.pathsFile)) refuse(RELOCATE_MESSAGE.PATHS_FILE_REQUIRED);
  if (!text(options.sourceCommit)) refuse(RELOCATE_MESSAGE.SOURCE_COMMIT_REQUIRED);
  const sourceCommit = git(root, ['rev-parse', '--verify',
    `${options.sourceCommit}${COMMIT_SUFFIX}`]).trim();
  const paths = parsePathsList(fs.readFileSync(path.resolve(root, options.pathsFile),
    TEXT_ENCODING));
  if (paths.length === 0) refuse(RELOCATE_MESSAGE.EMPTY);
  return {sourceCommit, paths};
}

// Everything decided before anything leaves the machine: the upload quest
// and the record quest are open, every path is relocatable, every path is a
// blob at the source commit whose bytes the working tree still holds.
function relocationPlan(root, options) {
  const {quest} = openState(root, options.id);
  const recordTo = text(options.recordTo) || quest.id;
  openState(root, recordTo);
  const {sourceCommit, paths} = relocationInputs(root, options);
  refuseListed(relocationRefusals(paths, requiredArtifactSet(root)));
  const blobs = sourceBlobs(root, sourceCommit, paths);
  refuseListed(sourceRefusals(root, paths, blobs));
  const manifest = relocationManifest({paths, sourceCommit, blobs,
    adds: addingCommits(root, sourceCommit, paths)});
  const basename = bundleBasename({label: text(options.label) ||
    `${quest.id}${LABEL_SUFFIX}`, sourceCommit,
  date: options.date || new Date().toISOString().slice(0, ISO_DATE_LENGTH)});
  const bytes = manifest.files.reduce((total, entry) => total + entry.bytes, 0);
  const records = path.relative(root, relocationRecordsDir(root, recordTo));
  return {id: quest.id, recordTo, sourceCommit, blobs, manifest, basename,
    summary: {id: quest.id, recordTo, records, sourceCommit, bundle: basename,
      files: manifest.files.length, bytes}};
}

function bundleVerified(verification, uploaded) {
  return verification.downloadedSha256 === uploaded.sha256 &&
    verification.extracted && verification.manifestMatches &&
    verification.unexpectedMembers.length === 0 && verification.mismatches.length === 0;
}

function uploadRelocation(root, plan, options, scratch) {
  const bundle = writeRelocationBundle({root, manifest: plan.manifest, scratch,
    basename: plan.basename});
  return evidenceAdd(root, {id: plan.id, file: bundle, run: options.run,
    tmpdir: options.tmpdir,
    text: `relocated ${plan.summary.files} files (${plan.summary.bytes} B) at ` +
      `${plan.sourceCommit} into ${plan.basename}; inventory and verification ` +
      `under ${plan.summary.records}`});
}

/**
 * Relocate committed bulk evidence to the store: bundle with a manifest,
 * upload through `evidence add`, re-download and verify every member against
 * the manifest and the source-commit blob, record the inventory and the
 * verification in the record quest's relocation records directory (never its
 * evidence/), and only then `git rm` the paths.
 * `--dry-run` stops after the plan.
 * @param {string} root
 * @param {{id: string, pathsFile: string, sourceCommit: string,
 *   recordTo?: string, label?: string, date?: string, dryRun?: boolean,
 *   run?: Function, tmpdir?: string}} options
 * @return {Object}
 */
function evidenceRelocate(root, options) {
  const plan = relocationPlan(root, options);
  if (options.dryRun) return {...plan.summary, dryRun: true};
  const tmpdir = options.tmpdir || os.tmpdir();
  const scratch = fs.mkdtempSync(path.join(tmpdir, RELOCATE_SCRATCH_PREFIX));
  try {
    const added = uploadRelocation(root, plan, {...options, tmpdir}, scratch);
    const verification = verifyRelocationBundle({asset: added.uploaded.asset,
      manifest: plan.manifest, blobs: plan.blobs, run: options.run, tmpdir});
    const verified = bundleVerified(verification, added.uploaded);
    const shard = relocationShard({manifest: plan.manifest, uploaded: added.uploaded});
    if (!verified) {
      refuse(`${RELOCATE_MESSAGE.UNVERIFIED} ${JSON.stringify({...verification,
        results: undefined})}`);
    }
    const recorded = recordRelocation({
      recordsRoot: relocationRecordsDir(root, plan.recordTo), shard,
      verification: {...verification, verified}, verifiedAt: new Date().toISOString()});
    const removed = removeRelocated(root, plan.manifest.files.map((entry) => entry.path));
    return {...plan.summary, uploaded: added.uploaded, entry: added.entry,
      recorded, removed};
  } finally {
    fs.rmSync(scratch, {recursive: true, force: true});
  }
}

export {
  ALTITUDE_BUDGET, LAND_LOCK_FILENAME, LAND_LOCK_STALE_MS, LAND_LOCK_TIMEOUT_REFUSAL,
  LANDING_MARKER_ENV, LANDING_MARKER_VALUE, NEXT_OWNER,
  SolveError, acquireLandingLock, board, computeCandidateDigest, evidenceAdd,
  evidenceDelete, evidenceRelocate, inspectPidIdentity, isKernelThreadPid, isLockStale,
  isPidAlive, land, landChangeProofEnvironment, note, probe, readPidNamespace,
  readPidStartTime, requiresInventoryRefresh, runChangeProof, stageGeneratedArtifacts,
  start, tryCreateLandingLock, verificationProblems,
};
