// Cheap, content-keyed preflight immediately before an immutable landing review.
// Attempt sealing already runs these changed-path checks; repeating them here closes
// the gap between the last attempt and review minting. Passing results are reusable
// only while both the exact aggregate digest and the checker inputs are unchanged.

import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {importClosureGaps} from './import-closure.js';
import {staticQualityProblems} from './static-gate.js';
import {
  assertRunnableProofSelection,
  selectProofCone,
} from '../checks/impact-proof-cone.js';
import {
  IMPORT_GRAPH_PATH,
  IMPORT_GRAPH_SEAL_PATH,
} from '../checks/impact-proof-cone-constants.js';
import {
  importGraphResolverStateDigest,
  javascriptSourceDigest,
  listImportGraphInputFiles,
  listJavaScriptFiles,
} from '../global-owner-debt-inventory/helpers.js';

const CACHE_DIRECTORY = 'solve/state/landing-preflight';
const CACHE_SCHEMA_VERSION = 2;
const TEXT_ENCODING = 'utf8';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const PREFLIGHT_PASS = 'pass';
const LINE_SEPARATOR = '\n';
const SILENT_CATCH_CHECKER = 'scripts/check-guideline-silent-catch.js';
const SILENT_CATCH_LABEL = 'silent-catch audit';
const IMPORT_CLOSURE_SEPARATOR = '; ';
const IMPORT_CLOSURE_PROBLEM_PREFIX =
  'land: review preflight found import-closure gaps: ';
const IMPORT_GRAPH_PROBLEM_PREFIX =
  'land: canonical import-graph verification failed: ';
const IMPORT_GRAPH_PROBLEM_MATCH_PREFIX = 'import graph';
const SPAWN_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const IMPORT_GRAPH_PRODUCER_PATH =
  'scripts/generate-global-owner-debt-inventory.js';
const IMPORT_GRAPH_VERIFY_ARGUMENT = '--verify-import-graph';
const IMPORT_GRAPH_REFRESH_ARGUMENT = '--refresh-import-graph-only';
const IMPORT_GRAPH_VERIFY_TIMEOUT_MS = 30_000;
const IMPORT_GRAPH_VERIFY_KILL_SIGNAL = 'SIGKILL';
const IMPORT_GRAPH_REFRESH_TIMEOUT_MS = 30_000;
const CANONICAL_DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const IMPORT_GRAPH_REQUIRED_INPUTS = Object.freeze([
  IMPORT_GRAPH_PRODUCER_PATH,
  IMPORT_GRAPH_PATH,
  IMPORT_GRAPH_SEAL_PATH,
]);
const CHECKER_INPUTS = Object.freeze([
  'scripts/solve/static-gate.js',
  'scripts/check-guideline-literals.js',
  'scripts/check-guideline-literals-baseline.json',
  'scripts/check-guideline-ambient-intrinsics.js',
  'scripts/check-guideline-ambient-intrinsics-baseline.json',
  'scripts/check-guideline-silent-catch.js',
  'scripts/check-guideline-silent-catch-baseline.json',
  'scripts/guideline-check-shared.js',
  'scripts/guideline-check-constants.js',
  'node_modules/eslint/bin/eslint.js',
  'node_modules/.package-lock.json',
  'eslint.config.js',
  'package-lock.json',
]);
// This is an optimization registry, never a proof authority. Only this pure,
// deterministic changed-path proof is reusable. Live/distributed, timing,
// load, mutation/red-on-revert, random, network, and host-state proofs are
// intentionally inexpressible here.
const DETERMINISTIC_PROOF_CACHE_REGISTRY = Object.freeze([
  Object.freeze({
    id: 'changed-path-static-quality',
    runner: process.execPath,
    argv: Object.freeze(['eslint', 'literal-guideline',
      'ambient-intrinsics', 'silent-catch']),
    declaredInputs: CHECKER_INPUTS,
    environmentAllowlist: Object.freeze([]),
    excludedKinds: Object.freeze(['live-ab', 'distributed', 'timing', 'load',
      'flaky', 'mutation', 'red-on-revert', 'network', 'random', 'host-state']),
  }),
]);
const arrayForEach = Function.call.bind(Array.prototype.forEach);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySort = Function.call.bind(Array.prototype.sort);
const arraySome = Function.call.bind(Array.prototype.some);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

function sha256(value) {
  return crypto.createHash(HASH_ALGORITHM).update(value).digest(HASH_ENCODING);
}

function fileIdentity(root, filePath) {
  const absolute = path.join(root, filePath);
  if (!fs.existsSync(absolute)) return null;
  return sha256(fs.readFileSync(absolute));
}

function preflightKey(root, manifest, paths) {
  return sha256(jsonStringify({
    schemaVersion: CACHE_SCHEMA_VERSION,
    sourceDigest: manifest.aggregate.fingerprint,
    paths,
    checkers: arrayMap(CHECKER_INPUTS, (filePath) => [
      filePath,
      fileIdentity(root, filePath),
    ]),
    proofRegistry: arrayMap(DETERMINISTIC_PROOF_CACHE_REGISTRY, (proof) => ({
      id: proof.id,
      runner: proof.runner,
      argv: proof.argv,
      declaredInputs: arrayMap(proof.declaredInputs, (filePath) => [
        filePath, fileIdentity(root, filePath),
      ]),
      environmentAllowlist: proof.environmentAllowlist,
      excludedKinds: proof.excludedKinds,
    })),
    runtime: {node: process.version, platform: process.platform, arch: process.arch},
  }));
}

function readPassingCache(file, key) {
  try {
    const value = jsonParse(fs.readFileSync(file, TEXT_ENCODING));
    return value?.schemaVersion === CACHE_SCHEMA_VERSION &&
      value.key === key && value.status === PREFLIGHT_PASS;
  } catch {
    return false;
  }
}

function silentCatchProblems(root, paths) {
  const checker = path.join(root, SILENT_CATCH_CHECKER);
  if (!fs.existsSync(checker)) return [];
  const args = [checker];
  // A candidate may legitimately DELETE a file (dead-code removal); the
  // checker stats every path it is handed, so a deleted path would crash the
  // preflight on ENOENT instead of being skipped. Filter absent paths exactly
  // as staticQualityProblems does.
  arrayForEach(paths, (filePath) => {
    if (fs.existsSync(path.join(root, filePath))) arrayPush(args, filePath);
  });
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: TEXT_ENCODING,
    maxBuffer: SPAWN_MAX_BUFFER_BYTES,
  });
  if (result.error) {
    return [`static-quality ${SILENT_CATCH_LABEL} could not run: ` +
      result.error.message];
  }
  if (result.status !== 0) {
    return [`static-quality ${SILENT_CATCH_LABEL} failed over the changed ` +
      `paths:${LINE_SEPARATOR}${result.stdout || ''}${result.stderr || ''}`];
  }
  return [];
}

function requiredImportGraphProblem(root) {
  for (const relativePath of IMPORT_GRAPH_REQUIRED_INPUTS) {
    const requiredPath = path.join(root, relativePath);
    try {
      if (!fs.lstatSync(requiredPath).isFile()) {
        return `${IMPORT_GRAPH_PROBLEM_PREFIX}${relativePath} is not a regular file`;
      }
    } catch {
      return `${IMPORT_GRAPH_PROBLEM_PREFIX}${relativePath} is missing`;
    }
  }
  return null;
}

function canonicalReceiptProblem(root, stdout) {
  try {
    const receipt = jsonParse(stdout);
    const graphBytes = fs.readFileSync(path.join(root, IMPORT_GRAPH_PATH));
    const sealBytes = fs.readFileSync(path.join(root, IMPORT_GRAPH_SEAL_PATH));
    const graph = jsonParse(graphBytes);
    const seal = jsonParse(sealBytes);
    const digestFields = [
      receipt.snapshotDigest,
      receipt.graphByteDigest,
      receipt.sealByteDigest,
    ];
    const invalidBytes = arraySome(digestFields, (digest) =>
      typeof digest !== 'string' || !CANONICAL_DIGEST_PATTERN.test(digest)) ||
      receipt.graphByteDigest !== sha256(graphBytes) ||
      receipt.sealByteDigest !== sha256(sealBytes) ||
      graph.snapshotDigest !== receipt.snapshotDigest ||
      seal.snapshotDigest !== receipt.snapshotDigest;
    if (invalidBytes) {
      return `${IMPORT_GRAPH_PROBLEM_PREFIX}verified bytes changed before use`;
    }
    const files = listJavaScriptFiles(root);
    const staleInputs = graph.sourceDigest !== javascriptSourceDigest(root, files) ||
      graph.producerInputDigest !== javascriptSourceDigest(
        root, listImportGraphInputFiles(root)) ||
      graph.resolverStateDigest !== importGraphResolverStateDigest(
        root, graph.resolverInputs);
    return staleInputs ?
      `${IMPORT_GRAPH_PROBLEM_PREFIX}live producer inputs changed before use` : null;
  } catch (error) {
    return `${IMPORT_GRAPH_PROBLEM_PREFIX}verified inputs became unreadable: ` +
      error.message;
  }
}

const IMPORT_GRAPH_TIMEOUT_ERROR_CODE = 'ETIMEDOUT';
const IMPORT_GRAPH_TIMEOUT_RETRY_NOTE =
  'import-graph verification timed out twice (first and retry) at ';
const IMPORT_GRAPH_TIMEOUT_UNIT_SUFFIX = ' ms; the producer is not making ' +
  'progress on this machine — rerun when load drops or raise the timeout';

function importGraphVerifyTimedOut(result) {
  return result?.error?.code === IMPORT_GRAPH_TIMEOUT_ERROR_CODE;
}

// `spawn` is injectable for tests only; production callers use spawnSync.
export function canonicalImportGraphProblem(
  root, timeout = IMPORT_GRAPH_VERIFY_TIMEOUT_MS, spawn = spawnSync) {
  const requiredProblem = requiredImportGraphProblem(root);
  if (requiredProblem) return requiredProblem;
  const producer = path.join(root, IMPORT_GRAPH_PRODUCER_PATH);
  const spawnArguments = [producer, IMPORT_GRAPH_VERIFY_ARGUMENT];
  const spawnOptions = {
    cwd: root,
    encoding: TEXT_ENCODING,
    maxBuffer: SPAWN_MAX_BUFFER_BYTES,
    timeout,
    killSignal: IMPORT_GRAPH_VERIFY_KILL_SIGNAL,
  };
  let result = spawn(process.execPath, spawnArguments, spawnOptions);
  // A single ETIMEDOUT on a loaded machine is transient (C7): retry exactly
  // once, and if the retry also times out report both plainly instead of a
  // bare kill-signal message. Any non-timeout failure reports immediately.
  if (importGraphVerifyTimedOut(result)) {
    result = spawn(process.execPath, spawnArguments, spawnOptions);
    if (importGraphVerifyTimedOut(result)) {
      return `${IMPORT_GRAPH_PROBLEM_PREFIX}` +
        `${IMPORT_GRAPH_TIMEOUT_RETRY_NOTE}${timeout}` +
        IMPORT_GRAPH_TIMEOUT_UNIT_SUFFIX;
    }
  }
  if (result.status !== 0) {
    return `${IMPORT_GRAPH_PROBLEM_PREFIX}` +
      `${result.stderr || result.error?.message}`;
  }
  return canonicalReceiptProblem(root, result.stdout);
}

function copyAmbientProofInput(ambientRoot, candidateRoot, relativePath) {
  if (!ambientRoot || ambientRoot === candidateRoot) return;
  const source = path.join(ambientRoot, relativePath);
  if (!fs.existsSync(source) || !fs.lstatSync(source).isFile()) return;
  const destination = path.join(candidateRoot, relativePath);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.copyFileSync(source, destination);
}

export function prepareCandidateProofInputs(candidateRoot, ambientRoot = null) {
  // Compatibility producers in focused fixtures verify already-canonical
  // inputs; the real producer overwrites both copies from exact snapshot
  // sources. A contaminated ambient graph therefore cannot survive the
  // subsequent canonical source-digest check.
  copyAmbientProofInput(ambientRoot, candidateRoot, IMPORT_GRAPH_PATH);
  copyAmbientProofInput(ambientRoot, candidateRoot, IMPORT_GRAPH_SEAL_PATH);
  const producer = path.join(candidateRoot, IMPORT_GRAPH_PRODUCER_PATH);
  const result = spawnSync(process.execPath, [
    producer, IMPORT_GRAPH_REFRESH_ARGUMENT,
  ], {
    cwd: candidateRoot,
    encoding: TEXT_ENCODING,
    maxBuffer: SPAWN_MAX_BUFFER_BYTES,
    timeout: IMPORT_GRAPH_REFRESH_TIMEOUT_MS,
    killSignal: IMPORT_GRAPH_VERIFY_KILL_SIGNAL,
  });
  if (result.status !== 0) {
    throw new Error(`${IMPORT_GRAPH_PROBLEM_PREFIX}` +
      `${result.stderr || result.error?.message || result.stdout}`);
  }
}

export function landingReviewPreflight(root, manifest, options = {}) {
  const candidateRoot = options.candidateRoot || root;
  const importClosure = importClosureGaps(candidateRoot, manifest.candidate);
  if (importClosure.importGaps.length > 0) {
    throw new Error(IMPORT_CLOSURE_PROBLEM_PREFIX +
      arrayJoin(arrayMap(importClosure.importGaps, (gap) =>
        `${gap.importer} imports omitted ${gap.imported}`),
      IMPORT_CLOSURE_SEPARATOR));
  }
  const paths = [];
  arrayForEach(manifest.aggregate.sourcePaths || [], (filePath) => {
    if (!arrayIncludes(paths, filePath)) arrayPush(paths, filePath);
  });
  arraySort(paths);
  const sourceDigest = manifest.aggregate.fingerprint;
  const key = preflightKey(candidateRoot, manifest, paths);
  const file = path.join(root, CACHE_DIRECTORY, `${key}.json`);
  const importGraphProblem = canonicalImportGraphProblem(candidateRoot);
  if (importGraphProblem) throw new Error(importGraphProblem);
  const proofCone = landingProofCone(candidateRoot, paths, sourceDigest);
  if (readPassingCache(file, key)) {
    return {schemaVersion: CACHE_SCHEMA_VERSION, sourceDigest, paths,
      status: PREFLIGHT_PASS, cached: true, proofCone};
  }
  const problems = staticQualityProblems(candidateRoot, paths);
  arrayForEach(silentCatchProblems(candidateRoot, paths), (problem) =>
    arrayPush(problems, problem));
  if (problems.length > 0) {
    throw new Error(
      `land: changed-path preflight failed: ${arrayJoin(
        problems, LINE_SEPARATOR)}`);
  }
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${jsonStringify({
    schemaVersion: CACHE_SCHEMA_VERSION,
    key,
    sourceDigest,
    paths,
    status: PREFLIGHT_PASS,
    proofIds: arrayMap(DETERMINISTIC_PROOF_CACHE_REGISTRY, (proof) => proof.id),
  }, null, 2)}\n`);
  return {schemaVersion: CACHE_SCHEMA_VERSION, sourceDigest, paths,
    status: PREFLIGHT_PASS, cached: false, proofCone};
}

// The proof cone for the exact aggregate changed paths, derived at review
// minting and re-derived at verdict recording (assertReviewCurrent re-runs
// this preflight): the receipt records WHY each selected proof was relevant
// (escalation tier, per-edge-kind counts, selector version, input digests).
// Full-suite tiers keep the whole census; the receipt is what makes "we ran
// the cone" auditable. The selector fails closed, so a selection problem
// widens to the full census instead of ever narrowing silently. The cone is
// a pure function of the hashed manifest sourcePaths plus digest-pinned
// selector inputs, so it is attached to the preflight result rather than
// hashed into the manifest itself.
function landingProofCone(root, paths, sourceDigest) {
  const {selection, problems} = selectProofCone(root, paths);
  const graphProblem = arrayFind(problems, (problem) =>
    stringStartsWith(problem, IMPORT_GRAPH_PROBLEM_MATCH_PREFIX));
  if (graphProblem) {
    throw new Error(`${IMPORT_GRAPH_PROBLEM_PREFIX}${graphProblem}`);
  }
  return landingProofConeFromSelection(selection, sourceDigest);
}

export function landingProofConeFromSelection(selection, sourceDigest) {
  assertRunnableProofSelection(selection);
  return {
    selectorVersion: selection.selectorVersion,
    sourceDigest,
    escalation: selection.escalation,
    fullSuite: selection.fullSuite,
    changedContracts: selection.changedContracts || [],
    counts: selection.counts,
    inputs: selection.inputs,
    selectedTests: selection.selectedTests,
    problems: selection.problems,
  };
}
