// Sealed, product-owned requirements that sit between SOLVED and review/land.
// They do not participate in doneWhen: product success remains owned by the
// Quest probe, while exact evidence readiness is owned by the landing envelope.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 1;
const MAX_EVIDENCE_BYTES = 64 * 1024 * 1024;
const PARENT_PATH = '..';
const PARENT_PATH_PREFIX = '../';
const ARTIFACT_KIND = 'artifact';
const ID_FIELD = 'id';
const KIND_FIELD = 'kind';
const PATH_FIELD = 'path';
const SHA256_ALGORITHM = 'sha256';
const SHA256_PREFIX = 'sha256:';
const EMPTY_REVIEW_READY = Object.freeze([]);
const REQUIRED_ENTRY_KEY_COUNT = 3;
const arrayIsArray = Array.isArray;
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayPush = Function.call.bind(Array.prototype.push);
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const setAdd = Function.call.bind(Set.prototype.add);
const setHas = Function.call.bind(Set.prototype.has);
const stringReplaceAll = Function.call.bind(String.prototype.replaceAll);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);
const PATH_NORMALIZATION_PROBLEM =
  'landing requirement evidence path must be a normalized string';
const ENTRY_PROBLEM =
  'landingRequirements.reviewReady entries require exactly id, kind "artifact", and path';
const SHAPE_PROBLEM =
  'landingRequirements must use schemaVersion 1 with reviewReady[] and ' +
  'landReady.independentVerification=true';

function mapReviewReady(value, visitor) {
  return arrayMap(value, visitor);
}

function normalizedWorkspacePath(root, value) {
  if (typeof value !== 'string' || stringTrim(value) !== value || !value) {
    throw new Error(PATH_NORMALIZATION_PROBLEM);
  }
  const normalized = path.posix.normalize(stringReplaceAll(value, path.sep, '/'));
  if (normalized !== value || normalized === PARENT_PATH ||
    stringStartsWith(normalized, PARENT_PATH_PREFIX) ||
    path.isAbsolute(value)) {
    throw new Error(`landing requirement evidence escapes the workspace: ${value}`);
  }
  const absolute = path.resolve(root, value);
  const relative = path.relative(path.resolve(root), absolute);
  if (stringStartsWith(relative, PARENT_PATH) || path.isAbsolute(relative)) {
    throw new Error(`landing requirement evidence escapes the workspace: ${value}`);
  }
  return {path: value, absolute};
}

function evidenceReceipt(root, requirement) {
  if (!requirement || typeof requirement !== 'object' ||
    typeof requirement.id !== 'string' || !stringTrim(requirement.id) ||
    requirement.kind !== ARTIFACT_KIND ||
    objectKeys(requirement).length !== REQUIRED_ENTRY_KEY_COUNT ||
    !objectHasOwn(requirement, ID_FIELD) ||
    !objectHasOwn(requirement, KIND_FIELD) ||
    !objectHasOwn(requirement, PATH_FIELD)) {
    throw new Error(ENTRY_PROBLEM);
  }
  const resolved = normalizedWorkspacePath(root, requirement.path);
  let stat;
  try {
    stat = fs.lstatSync(resolved.absolute);
  } catch {
    throw new Error(`land: required evidence is missing: ${resolved.path}`);
  }
  if (!stat.isFile() || stat.size === 0 || stat.size > MAX_EVIDENCE_BYTES) {
    throw new Error(
      `land: required evidence must be a non-empty bounded regular file: ${resolved.path}`,
    );
  }
  const digest = crypto.createHash(SHA256_ALGORITHM)
    .update(fs.readFileSync(resolved.absolute)).digest('hex');
  return {id: requirement.id, kind: ARTIFACT_KIND, path: resolved.path,
    sha256: `${SHA256_PREFIX}${digest}`, size: stat.size};
}

export function landingRequirementsReceipt(root, quest) {
  const declared = quest.landingRequirements;
  if (declared === undefined || declared === null) {
    return {schemaVersion: SCHEMA_VERSION, reviewReady: EMPTY_REVIEW_READY,
      landReady: {independentVerification: true}};
  }
  if (!declared || typeof declared !== 'object' || arrayIsArray(declared) ||
    declared.schemaVersion !== SCHEMA_VERSION ||
    !arrayIsArray(declared.reviewReady) ||
    declared.landReady?.independentVerification !== true) {
    throw new Error(SHAPE_PROBLEM);
  }
  const ids = new Set();
  const reviewReady = mapReviewReady(declared.reviewReady, (requirement) => {
    const receipt = evidenceReceipt(root, requirement);
    if (setHas(ids, receipt.id)) {
      throw new Error(`landing requirement id is duplicated: ${receipt.id}`);
    }
    setAdd(ids, receipt.id);
    return receipt;
  });
  return {schemaVersion: SCHEMA_VERSION, reviewReady,
    landReady: {independentVerification: true}};
}

export function landingRequirementsLintProblems(value) {
  if (value === undefined || value === null) return [];
  if (!value || typeof value !== 'object' || arrayIsArray(value) ||
    value.schemaVersion !== SCHEMA_VERSION || !arrayIsArray(value.reviewReady) ||
    value.landReady?.independentVerification !== true) {
    return [SHAPE_PROBLEM];
  }
  const problems = [];
  const ids = new Set();
  mapReviewReady(value.reviewReady, (item) => {
    if (!item || typeof item !== 'object' || arrayIsArray(item) ||
      typeof item.id !== 'string' || !stringTrim(item.id) ||
      item.kind !== ARTIFACT_KIND ||
      typeof item.path !== 'string' || !item.path ||
      objectKeys(item).length !== REQUIRED_ENTRY_KEY_COUNT ||
      !objectHasOwn(item, ID_FIELD) || !objectHasOwn(item, KIND_FIELD) ||
      !objectHasOwn(item, PATH_FIELD)) {
      arrayPush(problems, ENTRY_PROBLEM);
      return;
    }
    if (setHas(ids, item.id)) {
      arrayPush(problems, `landing requirement id is duplicated: ${item.id}`);
    }
    setAdd(ids, item.id);
  });
  return problems;
}
