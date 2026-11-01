// Append-only invalidation ledger for comparative benchmark evidence
// (data/tidb-comparison/invalidations.ndjson). Invalidated records stay where
// they are; an entry names their scope, typed reasons and defect ids. Entries are
// only ever appended: the writer refuses duplicate ids and never rewrites bytes.
import fs from 'node:fs';
import path from 'node:path';

import {ADMISSION_REASON} from './benchmark-claim-admission.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringSplit = Function.call.bind(String.prototype.split);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);
const objectValues = Object.values;
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;

const DEFAULT_INVALIDATIONS_PATH = 'data/tidb-comparison/invalidations.ndjson';
const ALL_RECORDS = 'all';
const ENTRY_ID_PATTERN = /^inv-\d{4}$/u;
const DEFECT_ID_PATTERN = /^D\d{2}$/u;
const UTF8 = 'utf8';
const NEWLINE = '\n';

function fail(message) {
  throw new Error(`invalidation ledger: ${message}`);
}

function requireText(value, at) {
  if (typeof value !== 'string' || stringTrim(value) === '') fail(`${at} must be non-empty text`);
  return value;
}

function validateScope(scope, at) {
  if (!scope || typeof scope !== 'object') fail(`${at}.scope must be an object`);
  requireText(scope.file, `${at}.scope.file`);
  if (scope.campaignGitCommit !== null) {
    requireText(scope.campaignGitCommit, `${at}.scope.campaignGitCommit`);
  }
  if (scope.receiptIds === ALL_RECORDS) return;
  if (!Array.isArray(scope.receiptIds) || scope.receiptIds.length === 0) {
    fail(`${at}.scope.receiptIds must be 'all' or a non-empty list`);
  }
  scope.receiptIds.forEach((id, idx) => requireText(id, `${at}.scope.receiptIds[${idx}]`));
}

// The typed codes an invalidation names: admission reason codes (at least
// one) and defect ledger ids (D01..).
function validateInvalidationCodes(entry, at) {
  if (!Array.isArray(entry.reasons) || entry.reasons.length === 0) {
    fail(`${at}.reasons must be a non-empty list`);
  }
  for (const reason of entry.reasons) {
    if (!arrayIncludes(objectValues(ADMISSION_REASON), reason)) {
      fail(`${at}.reasons has unknown code ${reason}`);
    }
  }
  if (!Array.isArray(entry.defectIds)) fail(`${at}.defectIds must be a list`);
  for (const id of entry.defectIds) {
    if (!DEFECT_ID_PATTERN.test(String(id))) fail(`${at}.defectIds has invalid id ${id}`);
  }
}

function validateInvalidationEntry(entry, at = 'entry') {
  if (!entry || typeof entry !== 'object') fail(`${at} must be an object`);
  if (!ENTRY_ID_PATTERN.test(String(entry.id))) fail(`${at}.id must match inv-NNNN`);
  if (!Number.isFinite(Date.parse(requireText(entry.recordedAt, `${at}.recordedAt`)))) {
    fail(`${at}.recordedAt must be an ISO timestamp`);
  }
  validateScope(entry.scope, at);
  validateInvalidationCodes(entry, at);
  requireText(entry.note, `${at}.note`);
  requireText(entry.recordedBy, `${at}.recordedBy`);
  return entry;
}

function parseInvalidationLedger(text) {
  const entries = [];
  const ids = new Set();
  const lines = arrayMap(stringSplit(text, NEWLINE), (l) => stringTrim(l));
  lines.forEach((line, idx) => {
    if (line === '') return;
    const entry = validateInvalidationEntry(jsonParse(line), `line ${idx + 1}`);
    if (ids.has(entry.id)) fail(`duplicate entry id ${entry.id}`);
    ids.add(entry.id);
    entries.push(entry);
  });
  return entries;
}

function readInvalidationLedger(rootDir) {
  const filePath = path.resolve(rootDir, DEFAULT_INVALIDATIONS_PATH);
  if (!fs.existsSync(filePath)) return [];
  return parseInvalidationLedger(fs.readFileSync(filePath, UTF8));
}

// Appends entries; refuses duplicate ids and never rewrites existing bytes.
function appendInvalidationEntries(filePath, entries) {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, UTF8) : '';
  if (existing !== '' && !stringEndsWith(existing, NEWLINE)) {
    fail(`${filePath} lacks a final newline`);
  }
  const known = new Set(arrayMap(parseInvalidationLedger(existing), (e) => e.id));
  let appended = '';
  for (const entry of entries) {
    validateInvalidationEntry(entry);
    if (known.has(entry.id)) fail(`refusing to rewrite existing entry ${entry.id}`);
    known.add(entry.id);
    appended += `${jsonStringify(entry)}${NEWLINE}`;
  }
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.appendFileSync(filePath, appended, UTF8);
  const after = fs.readFileSync(filePath, UTF8);
  if (!stringStartsWith(after, existing)) fail(`${filePath} changed outside an append`);
  return {appended: entries.length};
}

export {
  ALL_RECORDS,
  DEFAULT_INVALIDATIONS_PATH,
  appendInvalidationEntries,
  parseInvalidationLedger,
  readInvalidationLedger,
  validateInvalidationEntry,
};
