#!/usr/bin/env node
/**
 * Acceptance of the lineage evidence relocation
 * (`node scripts/checks/evidence-relocation-acceptance.js [--metric|--json]
 * [--records <dir>]`).
 *
 * Bulk evidence the rs-raft lineage committed under solve/ is relocated to
 * the solve-evidence store by `solve evidence relocate`, which writes an
 * inventory (an index plus one shard per bundle) and a verification record
 * into the recording quest's relocation records directory, whose location
 * the evidence owner holds (`relocationRecordsDir`, RELOCATION.RECORDS_DIR).
 * `--records <dir>` reads another records directory (relative to the
 * repository root). This checker reads those records and the working tree
 * and counts the unmet conditions:
 *
 *   - the three solve/ budget rows (active bytes, files over 1 MB, quest
 *     directories off shape), as the budget owner measures them;
 *   - the inventory is present and well formed;
 *   - every inventoried bundle verified: its re-downloaded sha256 equals the
 *     inventory's, its shard is the one verified, and every member matched;
 *   - no inventoried path is still in the working tree;
 *   - every proof artifact a sealed doneWhen requires under solve/quests or
 *     solve/epics is present;
 *   - no inventoried path is a required artifact, a quest log or a quest
 *     record.
 *
 * It reads files only; it starts nothing and calls no network (R27). The
 * budget rows are the budget owner's measurement, consumed, not restated.
 * `--metric` prints one number, the count of unmet conditions; `--json`
 * prints the condition table.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {METRIC, measureSolveV2Budget} from './solve-v2-budget.js';
import {RELOCATION, relocationRecordsDir} from '../solve/evidence-store.js';
import {requiredProofArtifacts} from '../solve/probes.js';
import {EPICS_DIR, LOG_FILE, QUESTS_DIR, QUEST_FILE} from '../solve/schema.js';
import {listQuestIds, readQuest} from '../solve/store.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringPadEnd = Function.call.bind(String.prototype.padEnd);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const regExpTest = Function.call.bind(RegExp.prototype.test);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// The quest that recorded the lineage relocation; its records live in the
// evidence owner's relocation records directory for this quest.
const RELOCATION_QUEST_ID = 'lineage-evidence-relocation';
const TEXT_ENCODING = 'utf8';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const ARGV_OFFSET = 2;
const METRIC_FLAG = '--metric';
const JSON_FLAG = '--json';
const RECORDS_FLAG = '--records';
const FLAG_VALUE_OFFSET = 1;
const JSON_INDENT = 2;
const LINE_SEPARATOR = '\n';
const PATH_SEPARATOR = '/';
const PARENT_SEGMENT = '..';
const DETAIL_LIMIT = 5;
const DETAIL_SEPARATOR = '; ';
const CELL_WIDTH = 34;
const CELL_GAP = '  ';
const VERDICT_MET = 'met';
const VERDICT_UNMET = 'UNMET';
const EXIT_OK = 0;
const EXIT_UNMET = 1;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const TUPLE_LENGTH = 3;
const UNNAMED_BUNDLE = '(unnamed bundle)';
const TUPLE_PATH = 0;
const TUPLE_SHA = 1;
const TUPLE_BYTES = 2;

// The budget rows this acceptance consumes, by the budget owner's ids.
const BUDGET_ROWS = Object.freeze([
  METRIC.SOLVE_ACTIVE_BYTES,
  METRIC.SOLVE_FILES_OVER_1MB,
  METRIC.QUEST_DIRS_OFF_SHAPE,
]);
const BUDGET_CONDITION_PREFIX = 'budget:';

const CONDITION = Object.freeze({
  INVENTORY: 'inventory-well-formed',
  VERIFIED: 'bundles-verified',
  ABSENT: 'relocated-paths-absent',
  REQUIRED_PRESENT: 'required-artifacts-present',
  PROTECTED: 'no-protected-path-relocated',
});

const PROBLEM = Object.freeze({
  INVENTORY_MISSING: 'inventory index missing or not JSON',
  INVENTORY_SCHEMA: 'inventory index has the wrong schema or no bundles',
  BUNDLE_FIELDS: 'bundle entry is missing a field or has a malformed one',
  SHARD_MISSING: 'inventory shard missing or not JSON',
  SHARD_HEADER: 'shard header disagrees with its index entry',
  SHARD_FILES: 'shard file list is malformed or its count disagrees',
  DUPLICATE_PATH: 'path inventoried twice',
  VERIFICATION_MISSING: 'verification record missing or not JSON',
  NOT_VERIFIED: 'bundle has no passing verification',
  STILL_PRESENT: 'inventoried path is still in the working tree',
  REQUIRED_MISSING: 'required proof artifact is missing',
  PROTECTED_PATH: 'inventoried path is a required artifact, a log or a quest record',
  ROW_MISSING: 'budget row not reported by the budget owner',
});

function sha256OfBuffer(buffer) {
  return crypto.createHash(HASH_ALGORITHM).update(buffer).digest(HASH_ENCODING);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, TEXT_ENCODING));
  } catch {
    return null;
  }
}

function isText(value) {
  return typeof value === 'string' && value.length > 0;
}

function isSha256(value) {
  return typeof value === 'string' && regExpTest(SHA256_PATTERN, value);
}

function isRelativeInside(value) {
  return isText(value) && !path.isAbsolute(value) &&
    !arrayIncludes(stringSplit(value, PATH_SEPARATOR), PARENT_SEGMENT);
}

function bundleFieldsOk(entry) {
  return Boolean(entry) && isText(entry.bundle) && isSha256(entry.bundleSha256) &&
    isText(entry.url) && typeof entry.sourceCommit === 'string' &&
    regExpTest(COMMIT_PATTERN, entry.sourceCommit) &&
    typeof entry.root === 'string' && Number.isInteger(entry.files) &&
    isRelativeInside(entry.shard);
}

function tupleOk(tuple) {
  return Array.isArray(tuple) && tuple.length === TUPLE_LENGTH &&
    isRelativeInside(tuple[TUPLE_PATH]) && isSha256(tuple[TUPLE_SHA]) &&
    Number.isInteger(tuple[TUPLE_BYTES]) && tuple[TUPLE_BYTES] >= 0;
}

function shardHeaderOk(shard, entry) {
  return shard.schema === RELOCATION.SHARD_SCHEMA && shard.bundle === entry.bundle &&
    shard.bundleSha256 === entry.bundleSha256 && shard.url === entry.url &&
    shard.sourceCommit === entry.sourceCommit && shard.root === entry.root;
}

function shardFilesOk(shard, entry) {
  return Array.isArray(shard.files) && shard.files.length === entry.files &&
    arrayEvery(shard.files, tupleOk);
}

// One inventory bundle: its fields, its shard, and the old paths it maps.
function readBundle(evidence, entry) {
  if (!bundleFieldsOk(entry)) {
    return {problems: [`${entry?.bundle || UNNAMED_BUNDLE}: ${PROBLEM.BUNDLE_FIELDS}`],
      files: []};
  }
  const shard = readJson(path.join(evidence, entry.shard));
  if (!shard) return {problems: [`${entry.bundle}: ${PROBLEM.SHARD_MISSING}`], files: []};
  if (!shardHeaderOk(shard, entry)) {
    return {problems: [`${entry.bundle}: ${PROBLEM.SHARD_HEADER}`], files: []};
  }
  if (!shardFilesOk(shard, entry)) {
    return {problems: [`${entry.bundle}: ${PROBLEM.SHARD_FILES}`], files: []};
  }
  return {problems: [], files: arrayMap(shard.files, (tuple) => ({
    path: `${entry.root}${tuple[TUPLE_PATH]}`, sha256: tuple[TUPLE_SHA],
    bytes: tuple[TUPLE_BYTES], bundle: entry.bundle,
  }))};
}

function duplicateProblems(files) {
  const seen = new Set();
  const problems = [];
  for (const file of files) {
    if (seen.has(file.path)) problems.push(`${file.path}: ${PROBLEM.DUPLICATE_PATH}`);
    seen.add(file.path);
  }
  return problems;
}

/**
 * The relocation inventory as recorded: its bundles, every old path it maps,
 * and what is wrong with it.
 * @param {string} evidence the relocation records directory
 * @return {{problems: string[], bundles: Object[], files: Object[]}}
 */
function readInventory(evidence) {
  const index = readJson(path.join(evidence, RELOCATION.INVENTORY_FILE));
  if (!index) return {problems: [PROBLEM.INVENTORY_MISSING], bundles: [], files: []};
  if (index.schema !== RELOCATION.INVENTORY_SCHEMA || !Array.isArray(index.bundles) ||
    index.bundles.length === 0) {
    return {problems: [PROBLEM.INVENTORY_SCHEMA], bundles: [], files: []};
  }
  const read = arrayMap(index.bundles, (entry) => readBundle(evidence, entry));
  const files = arrayFlatMap(read, (bundle) => bundle.files);
  return {
    problems: [...arrayFlatMap(read, (bundle) => bundle.problems),
      ...duplicateProblems(files)],
    bundles: index.bundles,
    files,
  };
}

function shardSha256(evidence, entry) {
  const file = path.join(evidence, entry.shard);
  return fs.existsSync(file) ? sha256OfBuffer(fs.readFileSync(file)) : null;
}

function isEmptyList(value) {
  return Array.isArray(value) && value.length === 0;
}

function allMembersMatched(record, count) {
  return record.members === count && typeof record.results === 'string' &&
    record.results.length === count &&
    arrayEvery([...record.results], (mark) => mark === RELOCATION.RESULT_MATCH);
}

function bundleIdentityVerified(record, entry, evidence) {
  return record.verified === true && record.extracted === true &&
    record.manifestMatches === true &&
    record.downloadedSha256 === entry.bundleSha256 &&
    record.bundleSha256 === entry.bundleSha256 &&
    record.shardSha256 === shardSha256(evidence, entry);
}

function verificationPasses(record, entry, evidence) {
  return Boolean(record) && bundleIdentityVerified(record, entry, evidence) &&
    isEmptyList(record.unexpectedMembers) && isEmptyList(record.mismatches) &&
    allMembersMatched(record, entry.files);
}

/**
 * Bundles of the inventory without a passing verification.
 * @param {string} evidence
 * @param {Object[]} bundles
 * @return {string[]}
 */
function verificationProblems(evidence, bundles) {
  const record = readJson(path.join(evidence, RELOCATION.VERIFICATION_FILE));
  if (!record || record.schema !== RELOCATION.VERIFICATION_SCHEMA ||
    !Array.isArray(record.bundles)) return [PROBLEM.VERIFICATION_MISSING];
  if (bundles.length === 0) return [PROBLEM.INVENTORY_SCHEMA];
  return arrayMap(arrayFilter(bundles, (entry) => !verificationPasses(
    arrayFind(record.bundles, (candidate) => candidate?.bundle === entry.bundle),
    entry, evidence)), (entry) => `${entry.bundle}: ${PROBLEM.NOT_VERIFIED}`);
}

/**
 * Every repository path a sealed doneWhen of any quest requires.
 * @param {string} root
 * @return {Set<string>}
 */
function requiredArtifacts(root) {
  return new Set(arrayFlatMap(listQuestIds(root),
    (id) => requiredProofArtifacts(readQuest(root, id).doneWhen)));
}

// The relocation's reach is solve/quests and solve/epics; required paths
// elsewhere (legacy solve/evidence, test-output) are outside what it can
// remove and are not its acceptance.
function withinReach(file) {
  return stringStartsWith(file, `${QUESTS_DIR}${PATH_SEPARATOR}`) ||
    stringStartsWith(file, `${EPICS_DIR}${PATH_SEPARATOR}`);
}

function isProtected(file, required) {
  return required.has(file) ||
    stringEndsWith(file, `${PATH_SEPARATOR}${LOG_FILE}`) ||
    stringEndsWith(file, `${PATH_SEPARATOR}${QUEST_FILE}`);
}

function condition(id, problems) {
  return {id, met: problems.length === 0, problems: problems.length,
    detail: problems.slice(0, DETAIL_LIMIT)};
}

function budgetConditions(rows) {
  return arrayMap(BUDGET_ROWS, (id) => {
    const row = arrayFind(rows, (candidate) => candidate.id === id);
    if (!row) return condition(`${BUDGET_CONDITION_PREFIX}${id}`, [PROBLEM.ROW_MISSING]);
    return condition(`${BUDGET_CONDITION_PREFIX}${id}`, row.ok ? [] :
      [`${row.value} against ${row.budget}`]);
  });
}

/**
 * Every acceptance condition with whether it is met.
 * @param {{root?: string, questId?: string, records?: string,
 *   budgetRows?: Function}} [options] `records` (relative to `root`)
 *   overrides the owner's records directory for `questId`
 * @return {{id: string, met: boolean, problems: number, detail: string[]}[]}
 */
function relocationAcceptance(options = {}) {
  const root = options.root || REPO_ROOT;
  const evidence = options.records ? path.resolve(root, options.records) :
    relocationRecordsDir(root, options.questId || RELOCATION_QUEST_ID);
  const rows = (options.budgetRows || measureSolveV2Budget)();
  const inventory = readInventory(evidence);
  const required = requiredArtifacts(root);
  return [
    ...budgetConditions(rows),
    condition(CONDITION.INVENTORY, inventory.problems),
    condition(CONDITION.VERIFIED, verificationProblems(evidence, inventory.bundles)),
    condition(CONDITION.ABSENT, arrayMap(arrayFilter(inventory.files,
      (file) => fs.existsSync(path.join(root, file.path))),
    (file) => `${file.path}: ${PROBLEM.STILL_PRESENT}`)),
    condition(CONDITION.REQUIRED_PRESENT, arrayMap(arrayFilter([...required],
      (file) => withinReach(file) && !fs.existsSync(path.join(root, file))),
    (file) => `${file}: ${PROBLEM.REQUIRED_MISSING}`)),
    condition(CONDITION.PROTECTED, arrayMap(arrayFilter(inventory.files,
      (file) => isProtected(file.path, required)),
    (file) => `${file.path}: ${PROBLEM.PROTECTED_PATH}`)),
  ];
}

function unmetCount(conditions) {
  return arrayFilter(conditions, (entry) => !entry.met).length;
}

function renderTable(conditions) {
  return arrayMap(conditions, (entry) => stringPadEnd(entry.id, CELL_WIDTH) +
    (entry.met ? VERDICT_MET : VERDICT_UNMET) +
    (entry.detail.length > 0 ? CELL_GAP + entry.detail.join(DETAIL_SEPARATOR) : ''))
    .join(LINE_SEPARATOR);
}

function flagValue(argv, flag) {
  const index = arrayIndexOf(argv, flag);
  return index < 0 ? undefined : argv[index + FLAG_VALUE_OFFSET];
}

function main(argv) {
  const conditions = relocationAcceptance({records: flagValue(argv, RECORDS_FLAG)});
  const unmet = unmetCount(conditions);
  if (arraySome(argv, (arg) => arg === METRIC_FLAG)) {
    process.stdout.write(`${unmet}${LINE_SEPARATOR}`);
  } else if (arraySome(argv, (arg) => arg === JSON_FLAG)) {
    process.stdout.write(`${JSON.stringify({unmet, conditions}, null, JSON_INDENT)}` +
      LINE_SEPARATOR);
  } else {
    process.stdout.write(`${renderTable(conditions)}${LINE_SEPARATOR}`);
  }
  return unmet === 0 ? EXIT_OK : EXIT_UNMET;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(ARGV_OFFSET));
}

export {CONDITION, RELOCATION_QUEST_ID, relocationAcceptance};
