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

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {METRIC, measureSolveV2Budget} from './solve-v2-budget.js';
import {relocationRecordsDir} from '../solve/evidence-store.js';
import {readRelocationRecords, requiredArtifacts} from '../solve/relocation-records.js';
import {EPICS_DIR, QUESTS_DIR} from '../solve/schema.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringPadEnd = Function.call.bind(String.prototype.padEnd);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// The quest that recorded the lineage relocation; its records live in the
// evidence owner's relocation records directory for this quest.
const RELOCATION_QUEST_ID = 'lineage-evidence-relocation';
const ARGV_OFFSET = 2;
const METRIC_FLAG = '--metric';
const JSON_FLAG = '--json';
const RECORDS_FLAG = '--records';
const FLAG_VALUE_OFFSET = 1;
const JSON_INDENT = 2;
const LINE_SEPARATOR = '\n';
const PATH_SEPARATOR = '/';
const DETAIL_LIMIT = 5;
const DETAIL_SEPARATOR = '; ';
const CELL_WIDTH = 34;
const CELL_GAP = '  ';
const VERDICT_MET = 'met';
const VERDICT_UNMET = 'UNMET';
const EXIT_OK = 0;
const EXIT_UNMET = 1;

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
  STILL_PRESENT: 'inventoried path is still in the working tree',
  REQUIRED_MISSING: 'required proof artifact is missing',
  ROW_MISSING: 'budget row not reported by the budget owner',
});

// The relocation's reach is solve/quests and solve/epics; required paths
// elsewhere (legacy solve/evidence, test-output) are outside what it can
// remove and are not its acceptance.
function withinReach(file) {
  return stringStartsWith(file, `${QUESTS_DIR}${PATH_SEPARATOR}`) ||
    stringStartsWith(file, `${EPICS_DIR}${PATH_SEPARATOR}`);
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
  const required = requiredArtifacts(root);
  const inventory = readRelocationRecords(root, evidence, required);
  return [
    ...budgetConditions(rows),
    condition(CONDITION.INVENTORY, inventory.inventoryProblems),
    condition(CONDITION.VERIFIED, inventory.verificationProblems),
    condition(CONDITION.ABSENT, arrayMap(arrayFilter(inventory.files,
      (file) => fs.existsSync(path.join(root, file.path))),
    (file) => `${file.path}: ${PROBLEM.STILL_PRESENT}`)),
    condition(CONDITION.REQUIRED_PRESENT, arrayMap(arrayFilter([...required],
      (file) => withinReach(file) && !fs.existsSync(path.join(root, file))),
    (file) => `${file}: ${PROBLEM.REQUIRED_MISSING}`)),
    condition(CONDITION.PROTECTED, inventory.protectedProblems),
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
