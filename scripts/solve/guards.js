// v2 landing guards. Every guard answers a list of problems; an empty list
// passes. The change proof itself (`npm test`) and the coupled-pair
// registry are not reimplemented here: the guards only call them.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

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
import {EPICS_DIR, QUESTS_DIR} from './schema.js';

const TEXT_ENCODING = 'utf8';
const LINE_SEPARATOR = '\n';
const GIT = 'git';
const SPAWN_MAX_BUFFER = 64 * 1024 * 1024;
const SOURCE_PREFIX = 'src/';
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
  DIFF_NAMES: Object.freeze(['diff', '--name-only', 'HEAD']),
  STAGED_NAMES: Object.freeze(['diff', '--cached', '--name-only', 'HEAD']),
  UNTRACKED: Object.freeze(['ls-files', '--others', '--exclude-standard']),
  INDEXED: Object.freeze(['ls-files', '--']),
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

/**
 * Every path that differs from HEAD (staged, unstaged, untracked and not
 * ignored), sorted and unique.
 * @param {string} root
 * @return {string[]}
 */
function changedPaths(root) {
  const tracked = lines(git(root, [...GIT_ARGUMENTS.DIFF_NAMES]));
  const staged = lines(git(root, [...GIT_ARGUMENTS.STAGED_NAMES]));
  const untracked = lines(git(root, [...GIT_ARGUMENTS.UNTRACKED]));
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
  const indexed = new Set(lines(git(root, [...GIT_ARGUMENTS.INDEXED, ...paths])));
  return paths.filter((filePath) => indexed.has(filePath) ||
    fs.existsSync(path.join(root, filePath)));
}

function isSourcePath(filePath) {
  return filePath.startsWith(SOURCE_PREFIX);
}

function requiresVerification(paths) {
  return paths.some(isSourcePath);
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
      seal.snapshotDigest !== receipt.snapshotDigest;
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

export {
  SOLVE_PREFIX, canonicalImportGraphProblem, changedPaths, coupledPairProblems,
  epicScopeProblems, git, headSha, isSourcePath, requiresVerification,
  stageablePaths, staticQualityProblems,
};
