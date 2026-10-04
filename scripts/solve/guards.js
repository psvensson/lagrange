// v2 landing guards. Every guard answers a list of problems; an empty list
// passes. The change proof itself (`npm test`) and the coupled-pair
// registry are not reimplemented here: the guards only call them.

import crypto from 'node:crypto';
import {sealBindsGraph} from '../checks/helper-import-closure.js';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {
  contractsForChangedPath, evaluateCoupledPairGuards,
  loadImpactContractRegistry,
} from '../checks/impact-contract-registry.js';
import {
  IMPORT_GRAPH_PATH, IMPORT_GRAPH_SEAL_PATH, PROOF_CONE_CONTRACTS_PATH,
} from '../checks/impact-proof-cone-constants.js';
import {waitForLoadHeadroomSync} from '../checks/wait-for-load-headroom.js';
import {
  importGraphResolverStateDigest, javascriptSourceDigest,
  listImportGraphInputFiles, listJavaScriptFiles,
} from '../global-owner-debt-inventory/helpers.js';
import {OUTCOME, PROOF, RESOLUTION, resolveProof} from '../proof-authority.js';
import {changedPathsBetween} from '../checks/quest-record-transitions.js';
import {
  ENTRY_TYPE, EPICS_DIR, LOG_FILE, QUESTS_DIR, QUEST_FILE, QUEST_STATUS, VERDICT,
} from './schema.js';
import {isQuestLogPath, questState, verdictOf} from './store.js';

const TEXT_ENCODING = 'utf8';
const LINE_SEPARATOR = '\n';
const NUL = '\0';
const GIT = 'git';
const SPAWN_MAX_BUFFER = 64 * 1024 * 1024;
const SOURCE_DIRECTORY = 'src';
const SOURCE_PREFIX = `${SOURCE_DIRECTORY}/`;
const SOLVE_PREFIX = 'solve/';
const LINTED_PATH_PATTERN = /^(?:src|test|scripts)\/.+\.(?:js|mjs|cjs)$/u;
const OUTPUT_LINE_LIMIT = 20;
const ESLINT_BIN = 'node_modules/eslint/bin/eslint.js';
const ESLINT_ARGUMENTS = Object.freeze(
  ['--no-warn-ignored', '--no-error-on-unmatched-pattern']);
const CHECKERS = Object.freeze([
  {label: 'eslint', script: ESLINT_BIN, args: ESLINT_ARGUMENTS},
  {label: 'literal-guideline audit', script: 'scripts/check-guideline-literals.js', args: []},
  {label: 'decision-boundaries audit',
    script: 'scripts/check-guideline-decision-boundaries.js', args: []},
  {label: 'ambient-intrinsics audit',
    script: 'scripts/check-guideline-ambient-intrinsics.js', args: []},
  {label: 'silent-catch audit', script: 'scripts/check-guideline-silent-catch.js', args: []},
]);
const TRIGGERED_PAIR_PREFIX = 'coupled pair ';
const PROBLEM_JOIN_SEPARATOR = '; ';
const INCOMPLETE_EDGE = ' has an incomplete contract edge: ';
const GLOB_STAR = '*';
const GLOB_DOUBLE_STAR = '**';
const GLOB_SEGMENT = '[^/]*';
const GLOB_ANY = '.*';
const GLOB_ESCAPE_PATTERN = /[.+?^${}()|[\]\\]/gu;
const GLOB_ESCAPE_REPLACEMENT = '\\$&';
const REGEXP_UNICODE = 'u';
const LIST_SEPARATOR = ', ';
const ARGUMENT_SEPARATOR = ' ';
const GIT_ARGUMENTS = Object.freeze({
  HEAD: Object.freeze(['rev-parse', '--verify', 'HEAD^{commit}']),
  DIFF_NAMES: Object.freeze(['diff', '--name-only', '-z', 'HEAD']),
  STAGED_NAMES: Object.freeze(['diff', '--cached', '--name-only', '-z', 'HEAD']),
  UNTRACKED: Object.freeze(['ls-files', '-z', '--others', '--exclude-standard']),
  INDEXED: Object.freeze(['ls-files', '-z', '--']),
});
const REGISTRY_UNAVAILABLE = 'coupled-pair registry could not be loaded';
const OUTSIDE_SCOPE_PREFIX = 'paths outside epic ';
const OUTSIDE_SCOPE_INFIX = ' authorizes: ';

// --- git ----------------------------------------------------------------------

function git(root, args, options = {}) {
  const result = spawnSync(GIT, args, {cwd: root, encoding: TEXT_ENCODING,
    maxBuffer: SPAWN_MAX_BUFFER, ...options});
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`git ${args.join(ARGUMENT_SEPARATOR)} failed: ${result.stderr || result.stdout}`);
  }
  return String(result.stdout || '');
}

function headSha(root) {
  return git(root, [...GIT_ARGUMENTS.HEAD]).trim();
}

function lines(output) {
  return output.split(LINE_SEPARATOR).map((line) => line.trim()).filter(Boolean);
}

// Paths as git names them with -z: verbatim, never quoted (core.quotepath).
function nulPaths(output) {
  return output.split(NUL).filter(Boolean);
}

/**
 * Every path that differs from HEAD (staged, unstaged, untracked and not
 * ignored), sorted and unique.
 * @param {string} root
 * @return {string[]}
 */
function changedPaths(root) {
  const tracked = nulPaths(git(root, [...GIT_ARGUMENTS.DIFF_NAMES]));
  const staged = nulPaths(git(root, [...GIT_ARGUMENTS.STAGED_NAMES]));
  const untracked = nulPaths(git(root, [...GIT_ARGUMENTS.UNTRACKED]));
  return [...new Set([...tracked, ...staged, ...untracked])].sort();
}

/**
 * The subset of a change set that `git add` can still stage. A path that is
 * gone from both the working tree and the index is already recorded as a
 * deletion, and `git add` refuses such a pathspec outright ("did not match
 * any files"), which would fail the whole staging call.
 * @param {string} root
 * @param {string[]} paths
 * @return {string[]}
 */
function stageablePaths(root, paths) {
  if (paths.length === 0) return [];
  const indexed = new Set(nulPaths(git(root, [...GIT_ARGUMENTS.INDEXED, ...paths])));
  return paths.filter((filePath) => indexed.has(filePath) ||
    fs.existsSync(path.join(root, filePath)));
}

// The source tree itself counts: replacing `src` with a symlink changes
// every path under it.
function isSourcePath(filePath) {
  return filePath === SOURCE_DIRECTORY || filePath.startsWith(SOURCE_PREFIX);
}

function requiresVerification(paths) {
  return paths.some(isSourcePath);
}

// --- verification -----------------------------------------------------------
// One predicate for "the recorded verdicts admit a src/ change":
// approvalProblems(entries, paths). land asks it of the live log and the
// staged change set, the main admission of the log a landing commit carries
// and that commit's change set - log entries and paths only, never the
// working tree. A stricter verdict rule goes into approvalProblems and
// tightens both at once.

const VERIFICATION_MESSAGE = Object.freeze({
  REJECTION_STANDS: 'the newest verification is a rejection and no attempt is newer than it',
  MISSING: 'src/ changes need a verification entry (verifier subagent:<id>)',
  STALE: 'src/ changes need a verification entry newer than the last attempt',
  NOT_APPROVED: 'src/ changes need an approving verification',
});
const VERDICT_STATE = Object.freeze({
  NONE: 'none', STALE: 'stale', APPROVED: 'approved', REJECTED: 'rejected',
});
const VERIFICATION_PROBLEMS = Object.freeze({
  [VERDICT_STATE.NONE]: VERIFICATION_MESSAGE.MISSING,
  [VERDICT_STATE.STALE]: VERIFICATION_MESSAGE.STALE,
  [VERDICT_STATE.REJECTED]: VERIFICATION_MESSAGE.NOT_APPROVED,
  [VERDICT_STATE.APPROVED]: null,
});

function verdictState(state) {
  const last = state.lastVerification;
  if (!last) return VERDICT_STATE.NONE;
  if (!state.verificationIsCurrent) return VERDICT_STATE.STALE;
  return verdictOf(last) === VERDICT.APPROVE ? VERDICT_STATE.APPROVED : VERDICT_STATE.REJECTED;
}

/**
 * What the recorded verdicts lack before a change set may land: a standing
 * rejection always blocks, and a src/ change needs a current approval.
 * @param {Object} state questState of the log
 * @param {string[]} paths
 * @return {string[]}
 */
function verificationProblems(state, paths) {
  const verdict = verdictState(state);
  const problems = [];
  if (verdict === VERDICT_STATE.REJECTED) problems.push(VERIFICATION_MESSAGE.REJECTION_STANDS);
  const required = requiresVerification(paths) ? VERIFICATION_PROBLEMS[verdict] : null;
  if (required) problems.push(required);
  return problems;
}

/**
 * The extension point: what a quest's recorded log lacks before the change
 * set may land on main. Both `land` and the main admission call it.
 * @param {Array<Object>} entries the quest's log entries
 * @param {string[]} paths the change set
 * @return {string[]}
 */
function approvalProblems(entries, paths) {
  return verificationProblems(questState(entries), paths);
}

// --- static quality ------------------------------------------------------------

function boundedOutput(result) {
  const all = `${result.stdout || ''}${LINE_SEPARATOR}${result.stderr || ''}`
    .split(LINE_SEPARATOR).map((line) => line.trimEnd()).filter(Boolean);
  const shown = all.slice(0, OUTPUT_LINE_LIMIT);
  if (all.length > shown.length) shown.push(`... (${all.length - shown.length} more lines)`);
  return shown.join(LINE_SEPARATOR);
}

function runChecker(root, checker, jsPaths) {
  const script = path.join(root, checker.script);
  if (!fs.existsSync(script)) return [];
  const result = spawnSync(process.execPath, [script, ...checker.args, ...jsPaths],
    {cwd: root, encoding: TEXT_ENCODING, maxBuffer: SPAWN_MAX_BUFFER});
  if (result.error) {
    return [`static-quality ${checker.label} could not run: ${result.error.message}`];
  }
  if (result.status !== 0) {
    return [`static-quality ${checker.label} failed over the changed paths:` +
      `${LINE_SEPARATOR}${boundedOutput(result)}`];
  }
  return [];
}

/**
 * The existing checkers over the changed, still-present JavaScript paths.
 * @param {string} root
 * @param {string[]} paths
 * @return {string[]}
 */
function staticQualityProblems(root, paths) {
  const jsPaths = [...new Set(paths)]
    .filter((filePath) => LINTED_PATH_PATTERN.test(filePath) &&
      fs.existsSync(path.join(root, filePath)))
    .sort();
  if (jsPaths.length === 0) return [];
  return CHECKERS.flatMap((checker) => runChecker(root, checker, jsPaths));
}

// --- coupled pairs (ported from the v1 terminal audit) -----------------------

/**
 * Problems from the coupledPairs registry for a change set: a triggered pair
 * whose contract edge is incomplete, and a pair whose contract two changed
 * paths own while the pair itself is not triggered.
 * @param {string} root
 * @param {string[]} paths
 * @return {string[]}
 */
function untriggeredPairProblems(loaded, paths, triggeredPrefixes) {
  const problems = [];
  for (const pair of loaded.registry.coupledPairs) {
    if (pair.problems.length === 0 || triggeredPrefixes.some((prefix) =>
      prefix.startsWith(`${TRIGGERED_PAIR_PREFIX}${pair.id} `))) continue;
    const contracted = paths.filter((changedPath) =>
      contractsForChangedPath(loaded.registry, changedPath).includes(pair.contract));
    if (contracted.length < 2) continue;
    problems.push(`${TRIGGERED_PAIR_PREFIX}${pair.id}${INCOMPLETE_EDGE}` +
      pair.problems.join(PROBLEM_JOIN_SEPARATOR));
  }
  return problems;
}

function coupledPairProblems(root, paths) {
  const registryChanged = paths.includes(PROOF_CONE_CONTRACTS_PATH);
  if (paths.length < 2 && !registryChanged) return [];
  if (!fs.existsSync(path.join(root, PROOF_CONE_CONTRACTS_PATH))) return [];
  const loaded = loadImpactContractRegistry(root);
  if (!loaded.registry) {
    return [(loaded.problems?.length > 0 ? loaded.problems :
      [REGISTRY_UNAVAILABLE]).join(PROBLEM_JOIN_SEPARATOR)];
  }
  if (registryChanged && loaded.problems.length > 0) {
    return [loaded.problems.join(PROBLEM_JOIN_SEPARATOR)];
  }
  const evaluated = evaluateCoupledPairGuards(loaded.registry, paths);
  const triggeredPrefixes = evaluated.triggeredPairs.map((pair) =>
    `${TRIGGERED_PAIR_PREFIX}${pair.id} is triggered `);
  const problems = evaluated.problems.filter((message) =>
    triggeredPrefixes.some((prefix) => message.startsWith(prefix)));
  return [...new Set([...problems, ...untriggeredPairProblems(loaded, paths, triggeredPrefixes)])];
}

// --- epic scope -------------------------------------------------------------------

function globToPattern(glob) {
  const escaped = glob.split(GLOB_DOUBLE_STAR).map((part) =>
    part.split(GLOB_STAR).map((piece) =>
      piece.replace(GLOB_ESCAPE_PATTERN, GLOB_ESCAPE_REPLACEMENT)).join(GLOB_SEGMENT))
    .join(GLOB_ANY);
  return new RegExp(`^${escaped}(?:/.*)?$`, REGEXP_UNICODE);
}

/**
 * Paths the quest may not touch: outside the epic's `authorizes` globs and
 * outside the quest's own directory and the epic's files. A fix (no epic)
 * is scoped by its statement alone, and a `legacy: true` epic carries no
 * measured scope; both pass here.
 * @param {{id: string, epic?: string}} quest
 * @param {Object|null} epic
 * @param {string[]} paths
 * @return {string[]}
 */
function epicScopeProblems(quest, epic, paths) {
  if (!epic || epic.front.legacy === true) return [];
  const allowed = [
    `${QUESTS_DIR}/${quest.id}/**`,
    `${EPICS_DIR}/${epic.id}.md`,
    `${EPICS_DIR}/${epic.id}/**`,
    ...(Array.isArray(epic.front.authorizes) ? epic.front.authorizes : []),
  ].map(globToPattern);
  const outside = paths.filter((filePath) =>
    !allowed.some((pattern) => pattern.test(filePath)));
  return outside.length === 0 ? [] :
    [`${OUTSIDE_SCOPE_PREFIX}${epic.id}${OUTSIDE_SCOPE_INFIX}${outside.join(LIST_SEPARATOR)}`];
}

// --- canonical import graph (ported from the v1 landing preflight) ------------

const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const IMPORT_GRAPH_PRODUCER_PATH = 'scripts/generate-global-owner-debt-inventory.js';
const IMPORT_GRAPH_VERIFY_ARGUMENT = '--verify-import-graph';
const IMPORT_GRAPH_PROBLEM_PREFIX = 'land: canonical import-graph verification failed: ';
const IMPORT_GRAPH_VERIFY_TIMEOUT_ENV = 'LAGRANGE_IMPORT_GRAPH_VERIFY_TIMEOUT_MS';
const IMPORT_GRAPH_VERIFY_DEFAULT_TIMEOUT_MS = 30_000;
const IMPORT_GRAPH_VERIFY_KILL_SIGNAL = 'SIGKILL';
const IMPORT_GRAPH_TIMEOUT_ERROR_CODE = 'ETIMEDOUT';
const IMPORT_GRAPH_TIMEOUT_NOTE = 'import-graph verification timed out twice ' +
  '(first and retry) at ';
const IMPORT_GRAPH_TIMEOUT_SUFFIX = ' ms; the producer is not making progress ' +
  `on this machine - rerun when load drops or raise ${IMPORT_GRAPH_VERIFY_TIMEOUT_ENV}`;
const CANONICAL_DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const IMPORT_GRAPH_REQUIRED_INPUTS = Object.freeze([
  IMPORT_GRAPH_PRODUCER_PATH, IMPORT_GRAPH_PATH, IMPORT_GRAPH_SEAL_PATH,
]);

function importGraphVerifyTimeout(env = process.env) {
  const configured = Number.parseInt(env[IMPORT_GRAPH_VERIFY_TIMEOUT_ENV], 10);
  return Number.isInteger(configured) && configured > 0 ?
    configured : IMPORT_GRAPH_VERIFY_DEFAULT_TIMEOUT_MS;
}

function sha256(value) {
  return crypto.createHash(HASH_ALGORITHM).update(value).digest(HASH_ENCODING);
}

function requiredImportGraphProblem(root) {
  for (const relativePath of IMPORT_GRAPH_REQUIRED_INPUTS) {
    const requiredPath = path.join(root, relativePath);
    try {
      if (!fs.lstatSync(requiredPath).isFile()) {
        return `${IMPORT_GRAPH_PROBLEM_PREFIX}${relativePath} is not a regular file`;
      }
    } catch (_error) {
      return `${IMPORT_GRAPH_PROBLEM_PREFIX}${relativePath} is missing`;
    }
  }
  return null;
}

function canonicalReceiptProblem(root, stdout) {
  try {
    const receipt = JSON.parse(stdout);
    const graphBytes = fs.readFileSync(path.join(root, IMPORT_GRAPH_PATH));
    const sealBytes = fs.readFileSync(path.join(root, IMPORT_GRAPH_SEAL_PATH));
    const graph = JSON.parse(graphBytes);
    const seal = JSON.parse(sealBytes);
    const digests = [receipt.snapshotDigest, receipt.graphByteDigest, receipt.sealByteDigest];
    const invalidBytes = digests.some((digest) =>
      typeof digest !== 'string' || !CANONICAL_DIGEST_PATTERN.test(digest)) ||
      receipt.graphByteDigest !== sha256(graphBytes) ||
      receipt.sealByteDigest !== sha256(sealBytes) ||
      graph.snapshotDigest !== receipt.snapshotDigest ||
      seal.snapshotDigest !== receipt.snapshotDigest ||
      // Whether the seal binds the graph is not this module's opinion.
      !sealBindsGraph(seal, graph);
    if (invalidBytes) {
      return `${IMPORT_GRAPH_PROBLEM_PREFIX}verified bytes changed before use`;
    }
    const stale = graph.sourceDigest !== javascriptSourceDigest(root, listJavaScriptFiles(root)) ||
      graph.producerInputDigest !== javascriptSourceDigest(root, listImportGraphInputFiles(root)) ||
      graph.resolverStateDigest !== importGraphResolverStateDigest(root, graph.resolverInputs);
    return stale ?
      `${IMPORT_GRAPH_PROBLEM_PREFIX}live producer inputs changed before use` : null;
  } catch (error) {
    return `${IMPORT_GRAPH_PROBLEM_PREFIX}verified inputs became unreadable: ${error.message}`;
  }
}

function timedOut(result) {
  return result?.error?.code === IMPORT_GRAPH_TIMEOUT_ERROR_CODE;
}

/**
 * The tracked import graph and seal must be canonical for the exact tree
 * before the change proof runs. `spawn` and `loadGate` are injectable for
 * tests; a single timeout under load is retried once.
 * @param {string} root
 * @param {number} [timeout]
 * @param {Function} [spawn]
 * @param {Function} [loadGate]
 * @return {string|null}
 */
function canonicalImportGraphProblem(root, timeout = importGraphVerifyTimeout(),
  spawn = spawnSync, loadGate = waitForLoadHeadroomSync) {
  const required = requiredImportGraphProblem(root);
  if (required) return required;
  loadGate();
  const producer = path.join(root, IMPORT_GRAPH_PRODUCER_PATH);
  const spawnArguments = [producer, IMPORT_GRAPH_VERIFY_ARGUMENT];
  const spawnOptions = {cwd: root, encoding: TEXT_ENCODING,
    maxBuffer: SPAWN_MAX_BUFFER, timeout, killSignal: IMPORT_GRAPH_VERIFY_KILL_SIGNAL};
  let result = spawn(process.execPath, spawnArguments, spawnOptions);
  if (timedOut(result)) {
    result = spawn(process.execPath, spawnArguments, spawnOptions);
    if (timedOut(result)) {
      return `${IMPORT_GRAPH_PROBLEM_PREFIX}${IMPORT_GRAPH_TIMEOUT_NOTE}${timeout}` +
        IMPORT_GRAPH_TIMEOUT_SUFFIX;
    }
  }
  if (result.status !== 0) {
    return `${IMPORT_GRAPH_PROBLEM_PREFIX}${result.stderr || result.error?.message}`;
  }
  return canonicalReceiptProblem(root, result.stdout);
}

// --- main admission ------------------------------------------------------------
// Owner decision 2026-10-04: a change under src/ reaches main only as a solver
// landing. Every commit a push brings to main (reachable from the pushed main
// head and not from the remote main head - the ancestry cut-off: nothing
// already on main is judged) whose own change touches src/ must be one: a
// single-parent commit whose tree appends to one quest's log the terminal
// solved entry `land` writes, that entry binding the commit's exact src/
// change (every raw diff line: both modes, both blob ids, status, path), and
// the log it lands in recording a seal and a current approving verification.
// A trailer is typed text and binds nothing, so no trailer makes a landing.
// The binding is content, not ancestry, so it survives the publisher's
// rebase over inert data commits and refuses the same commit replayed onto
// different src/ bytes.
// A merge brings a branch's commits with it. It is admitted, with every
// commit only it brings, when an exact-SHA corpus-full-v1 or release-full-v1
// receipt names the merge commit itself (the tree that enters main) and the
// merge names (`Quest:` trailer) a sealed quest whose log at the merge
// records a current approving verification. A merge's own src/ change is
// every src/ path where it differs from its first parent, except a path it
// took from a second parent that changed it since their merge base: so a
// merge that reverts or drops landed code by taking a stale side is its own
// change, and a clean merge of landings brings nothing unlanded and needs no
// receipt. A quest lands once: the solved entry must close a log that was
// open at the parent.

const RAW_DIFF_PREFIX = ':';
const FIELD_SEPARATOR = ' ';
const PATH_SEGMENT = '/';
const SOURCE_CHANGE_FIELD = 'source';
const PATHSPEC_SEPARATOR = '--';
const GIT_DIFF_TREE = 'diff-tree';
const GIT_REV_LIST = 'rev-list';
const RAW_SOURCE_DIFF = Object.freeze(['--raw', '-z', '--no-renames', '--no-abbrev', '-r']);
const STAGED_SOURCE_DIFF = Object.freeze(['diff-index', '--cached', ...RAW_SOURCE_DIFF,
  'HEAD', PATHSPEC_SEPARATOR, SOURCE_DIRECTORY]);
const RANGE_COMMITS = Object.freeze([GIT_REV_LIST, '--reverse', '--parents']);
const ONE_COMMIT_LOG = Object.freeze(['log', '-1']);
const QUEST_TRAILER_FORMAT = '--format=%(trailers:key=Quest,valueonly,separator=%x2C)';
const SUBJECT_FORMAT = '--format=%s';
const EMPTY_TREE = Object.freeze(['hash-object', '-t', 'tree', '/dev/null']);
const MERGE_BASE = Object.freeze(['merge-base']);
const IS_ANCESTOR = Object.freeze(['merge-base', '--is-ancestor']);
const VERIFY_COMMIT = Object.freeze(['rev-parse', '--verify', '--quiet']);
const COMMIT_PEEL = '^{commit}';
const ADMITTING_PROOFS = Object.freeze([PROOF.CORPUS_FULL, PROOF.RELEASE_FULL]);
const REFUSED_PATH_SAMPLE = 10;
const ADMISSION = Object.freeze({
  LANDING: 'solver landing',
  NO_SOURCE: 'no src/ change',
  COVERED: 'brought by an admitted merge',
  MERGE_ADMITTED: 'merge admitted by its exact-SHA receipt and governing quest',
});
const ADMISSION_PROBLEM = Object.freeze({
  NOT_A_LANDING: 'changes src/ and appends no terminal solved entry to a quest log ' +
    '(a direct commit; a trailer is not a landing)',
  UNBOUND: 'its new terminal solved entry binds no src/ change (not written by land)',
  MISMATCH: 'its new terminal solved entry binds a different src/ change than this commit makes',
  UNSEALED: 'the quest it lands was never sealed',
  CLOSED: 'the quest it lands was already closed at the parent commit (a quest lands once)',
  NO_RECEIPT: 'merges src/ changes without an exact-SHA corpus-full-v1 or ' +
    'release-full-v1 receipt for this merge commit',
  NO_QUEST: 'merges src/ changes without naming its governing quest (Quest: trailer)',
  UNKNOWN_QUEST: 'names a governing quest this merge does not carry a sealed record for',
  BRINGS_PREFIX: 'brings ',
  BRINGS_SUFFIX: ' unlanded src/ commit(s); ',
  STORE_UNAVAILABLE: 'the proof store could not answer: ',
  UNKNOWN_REVISION: ' is not a commit in this repository (fetch it; nothing is judged)',
  NOT_ANCESTOR: ' is not an ancestor of ',
});
const PROBLEM_SEPARATOR = '; ';

function gitBlob(root, rev, file) {
  const result = spawnSync(GIT, ['cat-file', 'blob', `${rev}:${file}`],
    {cwd: root, maxBuffer: SPAWN_MAX_BUFFER});
  return result.status === 0 ? result.stdout : null;
}

// Raw -z records: ":<mode> <mode> <sha> <sha> <status>" NUL "<path>" NUL.
function rawDiffEntries(output) {
  const fields = output.split(NUL);
  const entries = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    if (!fields[index].startsWith(RAW_DIFF_PREFIX)) break;
    const filePath = fields[index + 1];
    entries.push({path: filePath,
      line: `${fields[index].slice(RAW_DIFF_PREFIX.length)}${FIELD_SEPARATOR}${filePath}`});
  }
  return entries.sort((left, right) => (left.line < right.line ? -1 : 1));
}

/**
 * The binding of a src/ change: how many raw diff entries and the digest of
 * them all. `land` records it from the index it commits; the admission
 * recomputes it from the commit.
 * @param {Array<{line: string}>} entries
 * @return {{pathCount: number, digest: string}}
 */
function sourceChangeRecord(entries) {
  return {pathCount: entries.length,
    digest: sha256(entries.map((entry) => entry.line).join(LINE_SEPARATOR))};
}

function stagedSourceChange(root) {
  return sourceChangeRecord(rawDiffEntries(git(root, [...STAGED_SOURCE_DIFF])));
}

function commitSourceEntries(root, parent, commit) {
  return rawDiffEntries(git(root, [GIT_DIFF_TREE, ...RAW_SOURCE_DIFF, parent, commit,
    PATHSPEC_SEPARATOR, SOURCE_DIRECTORY]));
}

function sourceChanges(root, from, to) {
  return new Set(changedPathsBetween(root, from, to).map((change) => change.path)
    .filter(isSourcePath));
}

// The merge's own src/ change (see above). More than two parents: every src/
// difference from the first parent is its own.
function mergeSourcePaths(root, [first, second, ...more], merge) {
  const changed = [...sourceChanges(root, first, merge)];
  if (more.length > 0 || changed.length === 0) return changed;
  const base = git(root, [...MERGE_BASE, first, second], {allowFailure: true}).trim() ||
    git(root, [...EMPTY_TREE]).trim();
  const unlikeSecond = sourceChanges(root, second, merge);
  const secondChanged = sourceChanges(root, base, second);
  return changed.filter((file) => unlikeSecond.has(file) || !secondChanged.has(file));
}

function parseLogLines(content) {
  try {
    return lines(content).map((line) => JSON.parse(line));
  } catch {
    return null;
  }
}

// The entries a commit appended to a log, or null when it did not append.
function appendedEntries(before, after) {
  if (!after) return null;
  const prefix = before || Buffer.alloc(0);
  if (after.length < prefix.length || !after.subarray(0, prefix.length).equals(prefix)) return null;
  return parseLogLines(after.subarray(prefix.length).toString(TEXT_ENCODING));
}

function isSolvedTerminal(entry) {
  return entry?.type === ENTRY_TYPE.TERMINAL && entry.status === QUEST_STATUS.SOLVED;
}

function recordedLogProblem(log, paths) {
  if (!questState(log).seal) return ADMISSION_PROBLEM.UNSEALED;
  const problems = approvalProblems(log, paths);
  return problems.length > 0 ? problems.join(PROBLEM_SEPARATOR) : null;
}

function terminalBindingProblem(terminal, entries, log) {
  const recorded = terminal[SOURCE_CHANGE_FIELD];
  if (!recorded) return ADMISSION_PROBLEM.UNBOUND;
  const actual = sourceChangeRecord(entries);
  if (recorded.digest !== actual.digest || recorded.pathCount !== actual.pathCount) {
    return ADMISSION_PROBLEM.MISMATCH;
  }
  return recordedLogProblem(log, entries.map((entry) => entry.path));
}

// Null when the commit is a solver landing of exactly its src/ change.
function landingProblem(root, parent, commit, entries) {
  const logs = changedPathsBetween(root, parent, commit).map((change) => change.path)
    .filter(isQuestLogPath);
  let problem = ADMISSION_PROBLEM.NOT_A_LANDING;
  for (const file of logs) {
    const before = gitBlob(root, parent, file);
    const after = gitBlob(root, commit, file);
    const terminal = appendedEntries(before, after)?.find(isSolvedTerminal);
    if (!terminal) continue;
    const prior = parseLogLines(String(before || ''));
    problem = terminalBindingProblem(terminal, entries,
      parseLogLines(after.toString(TEXT_ENCODING))) ||
      (!prior || questState(prior).terminal ? ADMISSION_PROBLEM.CLOSED : null);
    if (!problem) return null;
  }
  return problem;
}

function commitVerdict(row, paths, problem, admission) {
  return {...row, paths, problem, admission: problem ? null : admission};
}

// A merge's own src/ change stands refused for want of a receipt until the
// merge is admitted.
function mergeVerdict(root, row) {
  const paths = mergeSourcePaths(root, row.parents, row.sha);
  return commitVerdict(row, paths, paths.length > 0 ? ADMISSION_PROBLEM.NO_RECEIPT : null,
    ADMISSION.NO_SOURCE);
}

function singleParentVerdict(root, row) {
  const parent = row.parents[0] || git(root, [...EMPTY_TREE]).trim();
  const entries = commitSourceEntries(root, parent, row.sha);
  const changesSource = entries.length > 0;
  return commitVerdict(row, entries.map((entry) => entry.path),
    changesSource ? landingProblem(root, parent, row.sha, entries) : null,
    changesSource ? ADMISSION.LANDING : ADMISSION.NO_SOURCE);
}

function judgeCommit(root, row) {
  return row.parents.length > 1 ? mergeVerdict(root, row) : singleParentVerdict(root, row);
}

function exactReceiptProblem(root, merge, resolve) {
  const answers = ADMITTING_PROOFS.map((proofId) => resolve({proofId, sha: merge, cwd: root}));
  if (answers.some((answer) => answer.outcome === OUTCOME.PROVEN &&
    answer.resolution === RESOLUTION.EXACT_SHA)) return null;
  const unavailable = answers.find((answer) => answer.outcome === OUTCOME.UNAVAILABLE);
  return unavailable ? `${ADMISSION_PROBLEM.STORE_UNAVAILABLE}${unavailable.because}` :
    ADMISSION_PROBLEM.NO_RECEIPT;
}

function governingQuestProblem(root, merge) {
  const id = git(root, [...ONE_COMMIT_LOG, QUEST_TRAILER_FORMAT, merge]).trim();
  if (!id) return ADMISSION_PROBLEM.NO_QUEST;
  const directory = `${QUESTS_DIR}${PATH_SEGMENT}${id}${PATH_SEGMENT}`;
  const log = parseLogLines(String(gitBlob(root, merge, `${directory}${LOG_FILE}`) || ''));
  if (!gitBlob(root, merge, `${directory}${QUEST_FILE}`) || !log) {
    return `${ADMISSION_PROBLEM.UNKNOWN_QUEST} (${id})`;
  }
  const problem = recordedLogProblem(log, [SOURCE_DIRECTORY]);
  return problem ? `${problem} (${id})` : null;
}

function mergeAdmissionProblem(root, merge, resolve) {
  return exactReceiptProblem(root, merge, resolve) || governingQuestProblem(root, merge);
}

// Commits only this merge brings: reachable from it, not from its first parent.
function broughtCommits(root, row, inRange) {
  return lines(git(root, [GIT_REV_LIST, row.sha, `^${row.parents[0]}`]))
    .filter((sha) => sha !== row.sha && inRange.has(sha));
}

function admitMerges(root, verdicts, resolve) {
  const inRange = new Set(verdicts.keys());
  for (const verdict of verdicts.values()) {
    if (verdict.parents.length < 2) continue;
    const unlanded = broughtCommits(root, verdict, inRange)
      .filter((sha) => verdicts.get(sha).problem);
    if (!verdict.problem && unlanded.length === 0) continue;
    const problem = mergeAdmissionProblem(root, verdict.sha, resolve);
    if (problem) {
      verdict.problem = unlanded.length === 0 ? problem : `${ADMISSION_PROBLEM.BRINGS_PREFIX}` +
        `${unlanded.length}${ADMISSION_PROBLEM.BRINGS_SUFFIX}${problem}`;
      continue;
    }
    Object.assign(verdict, {admission: ADMISSION.MERGE_ADMITTED, problem: null});
    for (const sha of unlanded) {
      Object.assign(verdicts.get(sha), {admission: ADMISSION.COVERED, problem: null,
        coveredBy: verdict.sha});
    }
  }
}

function refusal(root, verdict) {
  return {commit: verdict.sha,
    subject: git(root, [...ONE_COMMIT_LOG, SUBJECT_FORMAT, verdict.sha]).trim(),
    pathCount: verdict.paths.length,
    paths: [...verdict.paths].sort().slice(0, REFUSED_PATH_SAMPLE),
    reason: verdict.problem};
}

/**
 * Judge every commit `head` brings to main over `base` (the remote main sha):
 * each one that changes src/ must be a solver landing or be brought by an
 * admitted merge. Git plumbing only, except a receipt lookup for a merge
 * that needs one.
 * @param {string} root
 * @param {{base: string, head: string, resolve?: Function}} options
 * @return {{base: string, head: string, judged: number,
 *   admitted: Array<Object>, refused: Array<Object>}}
 */
function rangeProblem(root, base, head) {
  const unknown = [base, head].find((rev) => !git(root, [...VERIFY_COMMIT,
    `${rev}${COMMIT_PEEL}`], {allowFailure: true}).trim());
  if (unknown) return `${unknown}${ADMISSION_PROBLEM.UNKNOWN_REVISION}`;
  const ancestor = spawnSync(GIT, [...IS_ANCESTOR, base, head], {cwd: root});
  return ancestor.status === 0 ? null : `${base}${ADMISSION_PROBLEM.NOT_ANCESTOR}${head}`;
}

function mainAdmission(root, {base, head, resolve = resolveProof}) {
  const rows = lines(git(root, [...RANGE_COMMITS, `${base}..${head}`])).map((line) => {
    const [sha, ...parents] = line.split(FIELD_SEPARATOR);
    return {sha, parents};
  });
  const verdicts = new Map(rows.map((row) => [row.sha, judgeCommit(root, row)]));
  admitMerges(root, verdicts, resolve);
  const all = [...verdicts.values()];
  return {base, head, judged: all.length,
    admitted: all.filter((verdict) => verdict.paths.length > 0 && !verdict.problem)
      .map((verdict) => ({commit: verdict.sha, admission: verdict.admission,
        coveredBy: verdict.coveredBy || null})),
    refused: all.filter((verdict) => verdict.problem).map((verdict) => refusal(root, verdict))};
}

// The push gate's entry: `node scripts/solve/guards.js admit --base <remote
// main sha> --head <pushed main sha> [--json]`, from the repository root. It
// is this owner's own, so the gate's closure holds the guard and not land.
const ADMIT_COMMAND = 'admit';
const ADMIT_FLAG = Object.freeze({BASE: '--base', HEAD: '--head', JSON: '--json'});
const ADMIT_EXIT = Object.freeze({ADMITTED: 0, REFUSED: 1, USAGE: 2});
const ADMIT_TEXT = Object.freeze({
  USAGE: 'usage: node scripts/solve/guards.js admit --base <remote main sha> ' +
    '--head <pushed main sha> [--json]',
  // The verdict line the push gate requires, naming exactly the judged range.
  VERDICT: 'solver-landing admission: ',
  ADMITTED: 'admitted',
  REFUSED: 'refused',
  PATHS: '    src/ paths (',
  PATHS_CLOSE: '): ',
  MORE_PREFIX: ' (+',
  MORE_SUFFIX: ' more)',
  BULLET: '- ',
  INDENT: '    ',
  REMEDY: 'A change under src/ reaches main only through `solve land` ' +
    '(docs/steering/workflow-guidelines/solver-quests.md).',
});
const ADMIT_ARGUMENT_OFFSET = 2;
const LIST_JOIN = ', ';
const JSON_INDENT = 2;
const RANGE_JOIN = '..';

function flagValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? null : argv[index + 1] || null;
}

function refusalLines(entry) {
  const withheld = entry.pathCount - entry.paths.length;
  return [`${ADMIT_TEXT.BULLET}${entry.commit} ${entry.subject}`,
    `${ADMIT_TEXT.INDENT}${entry.reason}`,
    `${ADMIT_TEXT.PATHS}${entry.pathCount}${ADMIT_TEXT.PATHS_CLOSE}` +
      `${entry.paths.join(LIST_JOIN)}` +
      (withheld > 0 ? `${ADMIT_TEXT.MORE_PREFIX}${withheld}${ADMIT_TEXT.MORE_SUFFIX}` : '')];
}

/**
 * The admission as a command: exit 0 admitted, 1 refused (each commit named
 * with its src/ paths and why, on stderr), 2 usage. Without --json the first
 * line is the verdict: `solver-landing admission: admitted|refused <base>..<head>`.
 * @param {string[]} argv
 * @param {string} [root]
 * @return {number}
 */
function runAdmissionCli(argv, root = process.cwd()) {
  const base = flagValue(argv, ADMIT_FLAG.BASE);
  const head = flagValue(argv, ADMIT_FLAG.HEAD);
  if (argv[0] !== ADMIT_COMMAND || !base || !head) {
    process.stderr.write(`${ADMIT_TEXT.USAGE}${LINE_SEPARATOR}`);
    return ADMIT_EXIT.USAGE;
  }
  const verdict = (word) => `${ADMIT_TEXT.VERDICT}${word} ${base}${RANGE_JOIN}${head}`;
  const problem = rangeProblem(root, base, head);
  const result = problem ? null : mainAdmission(root, {base, head});
  if (problem || result.refused.length > 0) {
    process.stderr.write([verdict(ADMIT_TEXT.REFUSED),
      ...(problem ? [`${ADMIT_TEXT.INDENT}${problem}`] : result.refused.flatMap(refusalLines)),
      ADMIT_TEXT.REMEDY, ''].join(LINE_SEPARATOR));
    return ADMIT_EXIT.REFUSED;
  }
  process.stdout.write(`${argv.includes(ADMIT_FLAG.JSON) ?
    JSON.stringify(result, null, JSON_INDENT) : verdict(ADMIT_TEXT.ADMITTED)}${LINE_SEPARATOR}`);
  return ADMIT_EXIT.ADMITTED;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runAdmissionCli(process.argv.slice(ADMIT_ARGUMENT_OFFSET));
}

export {
  SOLVE_PREFIX, approvalProblems, canonicalImportGraphProblem,
  changedPaths, coupledPairProblems, epicScopeProblems, git, headSha, isSourcePath,
  requiresVerification, stageablePaths, stagedSourceChange, staticQualityProblems,
};
