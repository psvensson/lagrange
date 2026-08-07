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
import {selectProofCone} from '../checks/impact-proof-cone.js';

const CACHE_DIRECTORY = 'solve/state/landing-preflight';
const CACHE_SCHEMA_VERSION = 1;
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
const SPAWN_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
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
const arrayForEach = Function.call.bind(Array.prototype.forEach);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySort = Function.call.bind(Array.prototype.sort);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;

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

export function landingReviewPreflight(root, manifest) {
  const importClosure = importClosureGaps(root, manifest.candidate);
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
  const key = preflightKey(root, manifest, paths);
  const file = path.join(root, CACHE_DIRECTORY, `${key}.json`);
  const proofCone = landingProofCone(root, paths, sourceDigest);
  if (readPassingCache(file, key)) {
    return {schemaVersion: CACHE_SCHEMA_VERSION, sourceDigest, paths,
      status: PREFLIGHT_PASS, cached: true, proofCone};
  }
  const problems = staticQualityProblems(root, paths);
  arrayForEach(silentCatchProblems(root, paths), (problem) =>
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
  const {selection} = selectProofCone(root, paths);
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
