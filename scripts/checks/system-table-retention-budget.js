/**
 * Acceptance budget for the `system-table-retention` epic.
 *
 *   node scripts/checks/system-table-retention-budget.js [--metric] [--json]
 *
 * Reads `TABLES` from src/constants/tables.js and the committed lifetime
 * declaration solve/epics/system-table-retention/table-lifetimes.json, and
 * prints the tables per lifetime class. The last stdout line is the number
 * of tables classed `unbounded`, which is the epic's `doneWhen` metric; the
 * exit code is 0 only when that number is 0. `--metric` prints only the
 * number; `--json` prints the measurement.
 *
 * A declaration that does not cover the tree is a contract refusal: one
 * stderr line per problem, no count on stdout, exit 1. That is the case when
 * a table in `TABLES` has no entry, an entry names a table that does not
 * exist, a class is not one of the four, an entry has no reason, a
 * `retained` entry names no `file:symbol` owner found in the tree, or an
 * `unbounded` entry names no quest record. So a table cannot be added
 * without declaring its lifetime (R13). Any unknown argument is a usage
 * refusal of the same shape.
 *
 * It only reads files (R27). Governed by the ambient-intrinsic audit:
 * prototype methods are captured at module load and declaration records are
 * read by own fields only.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {TABLES} from '../../src/constants/tables.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIsArray = Array.isArray;
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySort = Function.call.bind(Array.prototype.sort);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const objectFreeze = Object.freeze;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const regexpTest = Function.call.bind(RegExp.prototype.test);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringPadEnd = Function.call.bind(String.prototype.padEnd);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringSplit = Function.call.bind(String.prototype.split);

const LIFETIME_CLASS = objectFreeze({
  BOUNDED_BY_NATURE: 'bounded_by_nature',
  RETAINED: 'retained',
  UNBOUNDED: 'unbounded',
  INERT: 'inert',
});
const LIFETIME_CLASSES = objectFreeze([
  LIFETIME_CLASS.BOUNDED_BY_NATURE, LIFETIME_CLASS.RETAINED,
  LIFETIME_CLASS.UNBOUNDED, LIFETIME_CLASS.INERT,
]);
const SECTION = objectFreeze({
  SYSTEM: 'systemTables',
  PARTITION_INTERNAL: 'partitionInternalTables',
});
const FIELD = objectFreeze({
  CLASS: 'class', OWNER: 'owner', QUEST: 'quest', REASON: 'reason',
});

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DECLARATION_FILE = 'solve/epics/system-table-retention/table-lifetimes.json';
const QUESTS_DIRECTORY = 'solve/quests';
const QUEST_FILE = 'quest.json';
const TEXT_ENCODING = 'utf8';
const QUEST_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;
const OWNER_SEPARATOR = ':';
const SYMBOL_SEPARATOR = '.';
const NOT_FOUND = -1;

const METRIC_FLAG = '--metric';
const JSON_FLAG = '--json';
const ARGV_OFFSET = 2;
const JSON_INDENT = 2;
const LINE_SEPARATOR = '\n';
const LIST_SEPARATOR = ', ';
const CLASS_COLUMN_WIDTH = 20;
const EXIT_OK = 0;
const EXIT_OVER_BUDGET = 1;
const EXIT_REFUSED = 1;

const USAGE_PREFIX =
  'usage: system-table-retention-budget.js [--metric] [--json]; unrecognised argument: ';
const REFUSAL_PREFIX = 'system-table-retention: ';
const PROBLEM = objectFreeze({
  DECLARATION_UNREADABLE: `${DECLARATION_FILE} is missing or is not a JSON object`,
  SECTION_MISSING: 'declaration section is missing or is not an object: ',
  UNDECLARED: 'table has no declared lifetime: ',
  UNKNOWN_TABLE: 'declaration names a table that is not in TABLES: ',
  ENTRY_SHAPE: 'declaration entry is not an object: ',
  CLASS: `class must be one of ${arrayJoin(LIFETIME_CLASSES, LIST_SEPARATOR)}: `,
  REASON: 'entry has no reason: ',
  OWNER_MISSING: 'retained entry names no owner (file:symbol): ',
  OWNER_NOT_FOUND: 'retained entry names an owner that is not in the tree: ',
  QUEST_MISSING: 'unbounded entry names no quest: ',
  QUEST_NOT_FOUND: 'unbounded entry names a quest with no record: ',
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !arrayIsArray(value);
}

function ownField(record, name) {
  return objectHasOwn(record, name) ? record[name] : undefined;
}

function ownText(record, name) {
  const value = ownField(record, name);
  return typeof value === 'string' ? value : '';
}

/**
 * @param {string} owner - `file:symbol`; the symbol may be dotted.
 * @param {function(string): (string|null)} readText - Repository file reader.
 * @return {boolean} Whether the file exists and names every symbol part.
 */
function ownerExists(owner, readText) {
  const separator = stringIndexOf(owner, OWNER_SEPARATOR);
  if (separator <= 0) return false;
  const symbol = stringSlice(owner, separator + 1);
  const source = readText(stringSlice(owner, 0, separator));
  if (source === null || symbol === '') return false;
  for (const part of stringSplit(symbol, SYMBOL_SEPARATOR)) {
    if (part === '' || stringIndexOf(source, part) === NOT_FOUND) return false;
  }
  return true;
}

function questExists(quest, readText) {
  return regexpTest(QUEST_ID_PATTERN, quest) &&
    readText(`${QUESTS_DIRECTORY}/${quest}/${QUEST_FILE}`) !== null;
}

function entryProblems(name, entry, readText) {
  if (!isRecord(entry)) return [`${PROBLEM.ENTRY_SHAPE}${name}`];
  const problems = [];
  const lifetimeClass = ownText(entry, FIELD.CLASS);
  if (!arrayIncludes(LIFETIME_CLASSES, lifetimeClass)) {
    arrayPush(problems, `${PROBLEM.CLASS}${name}`);
  }
  if (ownText(entry, FIELD.REASON) === '') arrayPush(problems, `${PROBLEM.REASON}${name}`);
  if (lifetimeClass === LIFETIME_CLASS.RETAINED) {
    const owner = ownText(entry, FIELD.OWNER);
    if (owner === '') arrayPush(problems, `${PROBLEM.OWNER_MISSING}${name}`);
    else if (!ownerExists(owner, readText)) {
      arrayPush(problems, `${PROBLEM.OWNER_NOT_FOUND}${name} -> ${owner}`);
    }
  }
  if (lifetimeClass === LIFETIME_CLASS.UNBOUNDED) {
    const quest = ownText(entry, FIELD.QUEST);
    if (quest === '') arrayPush(problems, `${PROBLEM.QUEST_MISSING}${name}`);
    else if (!questExists(quest, readText)) {
      arrayPush(problems, `${PROBLEM.QUEST_NOT_FOUND}${name} -> ${quest}`);
    }
  }
  return problems;
}

// Every table the vocabulary names is declared, and the declaration names
// no table the vocabulary lacks.
function tableVocabularyProblems(tables, system) {
  const problems = [];
  const existing = {};
  for (const constant of objectKeys(tables)) {
    const name = tables[constant];
    existing[name] = true;
    if (!objectHasOwn(system, name)) arrayPush(problems, `${PROBLEM.UNDECLARED}${name}`);
  }
  for (const name of objectKeys(system)) {
    if (!objectHasOwn(existing, name)) {
      arrayPush(problems, `${PROBLEM.UNKNOWN_TABLE}${name}`);
    }
  }
  return problems;
}

/**
 * Measures a lifetime declaration against a table vocabulary.
 * @param {Object} input
 * @param {Object<string, string>} input.tables - `TABLES` (constant -> name).
 * @param {*} input.declaration - The parsed declaration, or null if unreadable.
 * @param {function(string): (string|null)} input.readText - Reads a
 *   repository-relative file; null when it does not exist.
 * @return {{problems: string[], classes: Object<string, string[]>,
 *   unbounded: number}} Contract problems (the measurement is void unless
 *   empty), the table names per class, and the metric.
 */
function measureSystemTableRetention({tables, declaration, readText}) {
  const classes = {};
  for (const lifetimeClass of LIFETIME_CLASSES) classes[lifetimeClass] = [];
  const result = {problems: [], classes, unbounded: 0};
  if (!isRecord(declaration)) {
    arrayPush(result.problems, PROBLEM.DECLARATION_UNREADABLE);
    return result;
  }
  const system = ownField(declaration, SECTION.SYSTEM);
  const internal = ownField(declaration, SECTION.PARTITION_INTERNAL);
  for (const [section, value] of [
    [SECTION.SYSTEM, system], [SECTION.PARTITION_INTERNAL, internal],
  ]) {
    if (!isRecord(value)) arrayPush(result.problems, `${PROBLEM.SECTION_MISSING}${section}`);
  }
  if (result.problems.length > 0) return result;

  for (const problem of tableVocabularyProblems(tables, system)) {
    arrayPush(result.problems, problem);
  }
  for (const section of [system, internal]) {
    for (const name of arraySort(objectKeys(section))) {
      const problems = entryProblems(name, section[name], readText);
      for (const problem of problems) arrayPush(result.problems, problem);
      if (problems.length === 0) arrayPush(classes[ownText(section[name], FIELD.CLASS)], name);
    }
  }
  result.unbounded = classes[LIFETIME_CLASS.UNBOUNDED].length;
  return result;
}

function readRepositoryText(relativePath) {
  const absolute = path.resolve(REPO_ROOT, relativePath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return null;
  return fs.readFileSync(absolute, TEXT_ENCODING);
}

function readDeclaration(readText) {
  const text = readText(DECLARATION_FILE);
  if (text === null) return null;
  try {
    return jsonParse(text);
  } catch {
    return null;
  }
}

function renderTable(classes) {
  let text = '';
  for (const lifetimeClass of LIFETIME_CLASSES) {
    const names = classes[lifetimeClass];
    text += `${stringPadEnd(lifetimeClass, CLASS_COLUMN_WIDTH)}${names.length}` +
      `${LINE_SEPARATOR}`;
  }
  const unbounded = classes[LIFETIME_CLASS.UNBOUNDED];
  if (unbounded.length > 0) {
    text += `${LIFETIME_CLASS.UNBOUNDED}: ${arrayJoin(unbounded, LIST_SEPARATOR)}${LINE_SEPARATOR}`;
  }
  return text;
}

function unrecognisedArgument(argv) {
  for (const argument of argv) {
    if (argument !== JSON_FLAG && argument !== METRIC_FLAG) return argument;
  }
  return undefined;
}

function main(argv) {
  const unrecognised = unrecognisedArgument(argv);
  if (unrecognised !== undefined) {
    process.stderr.write(`${USAGE_PREFIX}${unrecognised}${LINE_SEPARATOR}`);
    return EXIT_REFUSED;
  }
  const measured = measureSystemTableRetention({
    tables: TABLES,
    declaration: readDeclaration(readRepositoryText),
    readText: readRepositoryText,
  });
  if (measured.problems.length > 0) {
    for (const problem of measured.problems) {
      process.stderr.write(`${REFUSAL_PREFIX}${problem}${LINE_SEPARATOR}`);
    }
    return EXIT_REFUSED;
  }
  if (arrayIncludes(argv, JSON_FLAG)) {
    const report = {classes: measured.classes, unbounded: measured.unbounded};
    process.stdout.write(`${jsonStringify(report, null, JSON_INDENT)}${LINE_SEPARATOR}`);
  } else if (!arrayIncludes(argv, METRIC_FLAG)) {
    process.stdout.write(renderTable(measured.classes));
  }
  process.stdout.write(`${measured.unbounded}${LINE_SEPARATOR}`);
  return measured.unbounded === 0 ? EXIT_OK : EXIT_OVER_BUDGET;
}

const isMainModule = process.argv[1] &&
  import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;

if (isMainModule) {
  process.exitCode = main(process.argv.slice(ARGV_OFFSET));
}

export {
  DECLARATION_FILE, LIFETIME_CLASS, PROBLEM, measureSystemTableRetention, unrecognisedArgument,
};
