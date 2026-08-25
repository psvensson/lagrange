// Strict ingestion boundary for independent verifier results. Review-owned
// facts (fingerprint, scope, paths) are intentionally absent from this schema.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {isDenseDataArray, isRecord} from '../../src/utils/canonical-json-data.js';
import {parseExactJson} from './exact-json.js';

const SCHEMA = 'solver-verifier-verdict/1';
const MAX_RECEIPT_BYTES = 256 * 1024;
const MAX_EVIDENCE_BYTES = 64 * 1024 * 1024;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_./-]*$/u;
const CATEGORY_PATTERN = /^(?:out-of-bar:)?[a-z0-9][a-z0-9-]*$/u;
const PARENT_PATH = '..';
const PARENT_PATH_PREFIX = '../';
const TEXT_ENCODING = 'utf8';
const VERDICT_APPROVE = 'approve';
const VERDICT_REJECT = 'reject';
const CATEGORY_FIELD = 'category';
const EVIDENCE_PATHS_FIELD = 'evidencePaths';
const CATEGORY_SEPARATOR = ', ';
const TEMPLATE_ARRAY_PROBLEM =
  'land: verdict completedTemplateItems must be a dense data array';
const TEMPLATE_ITEM_PROBLEM =
  'land: every completed template item requires category and evidencePaths';
const TEMPLATE_MISMATCH_PROBLEM = 'land: verdict template accounting mismatch';
const FINDINGS_ARRAY_PROBLEM = 'land: verdict findings must be a dense data array';
const REJECTION_FINDINGS_PROBLEM =
  'land: a rejection verdict file requires category-complete findings';
const INVALID_JSON_PROBLEM = 'land: verdict file must contain valid JSON';
const INVALID_SCHEMA_PROBLEM =
  'land: verdict file failed solver-verifier-verdict/1 validation';
const EMPTY_EVIDENCE_PROBLEM =
  'land: template evidence must be a non-empty bounded regular file';
const TEMPLATE_EVIDENCE_LABEL = 'template evidence';
const VERDICT_FILE_LABEL = 'verdict file';
const SHA256_ALGORITHM = 'sha256';
const SHA256_PREFIX = 'sha256:';
const HASH_ENCODING = 'hex';
const MINIMUM_FINDING_SUMMARY_LENGTH = 12;
const FINDING_SHAPE_PROBLEM =
  'land: verdict findings require category and a concrete summary';
const REQUIRED_VERDICT_FIELDS = Object.freeze([
  'schemaVersion', 'reviewId', 'verifierId', 'verdict',
  'completedTemplateItems', 'findings', 'externalReceiptRef',
]);
const REQUIRED_FINDING_FIELDS = Object.freeze(['category', 'summary']);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayPush = Function.call.bind(Array.prototype.push);
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const regExpTest = Function.call.bind(RegExp.prototype.test);
const stringReplaceAll = Function.call.bind(String.prototype.replaceAll);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);

function ownKeysExactly(value, required, optional = []) {
  if (!isRecord(value)) return false;
  const keys = objectKeys(value);
  for (let index = 0; index < required.length; index += 1) {
    if (!objectHasOwn(value, required[index])) return false;
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (!arrayIncludes(required, keys[index]) &&
      !arrayIncludes(optional, keys[index])) return false;
  }
  return true;
}

function workspaceFile(root, value, label, maxBytes) {
  if (typeof value !== 'string' || !value || stringTrim(value) !== value ||
    path.isAbsolute(value)) {
    throw new Error(`land: ${label} must be a normalized workspace path`);
  }
  const normalized = path.posix.normalize(stringReplaceAll(value, path.sep, '/'));
  if (normalized !== value || normalized === PARENT_PATH ||
    stringStartsWith(normalized, PARENT_PATH_PREFIX)) {
    throw new Error(`land: ${label} escapes the workspace`);
  }
  const absolute = path.resolve(root, value);
  const relative = path.relative(path.resolve(root), absolute);
  if (stringStartsWith(relative, PARENT_PATH) || path.isAbsolute(relative)) {
    throw new Error(`land: ${label} escapes the workspace`);
  }
  let stat;
  try {
    stat = fs.lstatSync(absolute);
  } catch {
    throw new Error(`land: ${label} is missing: ${value}`);
  }
  if (!stat.isFile() || stat.size > maxBytes) {
    throw new Error(`land: ${label} must be a bounded regular file: ${value}`);
  }
  return {absolute, path: value, size: stat.size};
}

function evidenceIdentity(root, evidencePath) {
  const file = workspaceFile(
    root, evidencePath, TEMPLATE_EVIDENCE_LABEL, MAX_EVIDENCE_BYTES,
  );
  if (file.size === 0) throw new Error(EMPTY_EVIDENCE_PROBLEM);
  const bytes = fs.readFileSync(file.absolute);
  return {
    path: file.path,
    sha256: `${SHA256_PREFIX}${crypto.createHash(SHA256_ALGORITHM)
      .update(bytes).digest(HASH_ENCODING)}`,
    size: bytes.length,
  };
}

function validateTemplateItems(root, value, requiredTemplates) {
  if (!isDenseDataArray(value)) {
    throw new Error(TEMPLATE_ARRAY_PROBLEM);
  }
  const byCategory = Object.create(null);
  for (let itemIndex = 0; itemIndex < value.length; itemIndex += 1) {
    const item = value[itemIndex];
    if (!ownKeysExactly(item, [CATEGORY_FIELD, EVIDENCE_PATHS_FIELD]) ||
      !regExpTest(CATEGORY_PATTERN, String(item.category || '')) ||
      !isDenseDataArray(item.evidencePaths) || item.evidencePaths.length === 0) {
      throw new Error(TEMPLATE_ITEM_PROBLEM);
    }
    if (objectHasOwn(byCategory, item.category)) {
      throw new Error(`land: duplicate completed template category: ${item.category}`);
    }
    const evidence = [];
    for (let index = 0; index < item.evidencePaths.length; index += 1) {
      arrayPush(evidence, evidenceIdentity(root, item.evidencePaths[index]));
    }
    byCategory[item.category] = {category: item.category, evidence};
  }
  const missing = [];
  const completed = [];
  for (let index = 0; index < requiredTemplates.length; index += 1) {
    const category = requiredTemplates[index].category;
    if (!objectHasOwn(byCategory, category)) arrayPush(missing, category);
    else arrayPush(completed, byCategory[category]);
  }
  const extra = [];
  const suppliedCategories = objectKeys(byCategory);
  for (let index = 0; index < suppliedCategories.length; index += 1) {
    let required = false;
    for (let requiredIndex = 0;
      requiredIndex < requiredTemplates.length; requiredIndex += 1) {
      if (requiredTemplates[requiredIndex].category === suppliedCategories[index]) {
        required = true;
        break;
      }
    }
    if (!required) arrayPush(extra, suppliedCategories[index]);
  }
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(TEMPLATE_MISMATCH_PROBLEM +
      `${missing.length ? `; missing ${missing.join(CATEGORY_SEPARATOR)}` : ''}` +
      `${extra.length ? `; unexpected ${extra.join(CATEGORY_SEPARATOR)}` : ''}`);
  }
  return completed;
}

function validateFindings(value, verdict) {
  if (!isDenseDataArray(value)) throw new Error(FINDINGS_ARRAY_PROBLEM);
  const findings = [];
  for (let index = 0; index < value.length; index += 1) {
    const finding = value[index];
    if (!ownKeysExactly(finding, REQUIRED_FINDING_FIELDS) ||
      !regExpTest(CATEGORY_PATTERN, String(finding.category || '')) ||
      typeof finding.summary !== 'string' ||
      stringTrim(finding.summary).length < MINIMUM_FINDING_SUMMARY_LENGTH) {
      throw new Error(FINDING_SHAPE_PROBLEM);
    }
    arrayPush(findings, {category: finding.category,
      summary: stringTrim(finding.summary)});
  }
  if (verdict === VERDICT_REJECT && findings.length === 0) {
    throw new Error(REJECTION_FINDINGS_PROBLEM);
  }
  return findings;
}

export function loadVerifierVerdict(root, verdictPath, review) {
  const file = workspaceFile(
    root, verdictPath, VERDICT_FILE_LABEL, MAX_RECEIPT_BYTES,
  );
  let value;
  try {
    value = parseExactJson(fs.readFileSync(file.absolute, TEXT_ENCODING));
  } catch {
    throw new Error(INVALID_JSON_PROBLEM);
  }
  if (!ownKeysExactly(value, REQUIRED_VERDICT_FIELDS) ||
    value.schemaVersion !== SCHEMA ||
    value.reviewId !== review.id ||
    !regExpTest(ID_PATTERN, String(value.verifierId || '')) ||
    !arrayIncludes([VERDICT_APPROVE, VERDICT_REJECT], value.verdict) ||
    typeof value.externalReceiptRef !== 'string' ||
    !stringTrim(value.externalReceiptRef)) {
    throw new Error(INVALID_SCHEMA_PROBLEM);
  }
  return {
    schemaVersion: SCHEMA,
    reviewId: value.reviewId,
    verifierId: value.verifierId,
    verdict: value.verdict,
    completedTemplateItems: validateTemplateItems(
      root, value.completedTemplateItems,
      review.manifest.requiredReviewTemplates || []),
    findings: validateFindings(value.findings, value.verdict),
    externalReceiptRef: stringTrim(value.externalReceiptRef),
    file: file.path,
  };
}
