#!/usr/bin/env node
/**
 * Steering stays a routing layer (`npm run audit:steering-diet`).
 *
 * Steering exists to state cross-cutting invariants and route to the owner of
 * everything else. Left unmeasured it grows back into a second copy of the
 * architecture, so four properties are enforced mechanically:
 *
 *   - `docs/steering/rules.md` holds exactly the agreed number of structurally
 *     recognised rules, each naming one owner, so a rule cannot quietly become
 *     the detailed authority;
 *   - the always-load path is measured transitively. A document declares what
 *     it requires in front matter, and every required document's lines count
 *     toward the budget, so pulling a manual into the entry point is visible;
 *   - the authored corpus and the materialised corpus are budgeted separately,
 *     so a generator cannot rebuild what the diet removed;
 *   - registered-operation closure: current steering may refer to a solver
 *     operation only if that operation exists in the canonical command
 *     registry. There is no second, historical vocabulary to maintain, so
 *     nothing can drift out of date.
 *
 * Historical records (immutable quest logs, migration evidence) are not
 * steering and are not examined.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {countLines} from './steering-baseline-inventory.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEXT_ENCODING = 'utf8';
const LINE_SEPARATOR = '\n';
const STEERING_DIR = 'docs/steering';
const GENERATED_DIR = 'docs/steering/generated';
const RULES_MD = 'docs/steering/rules.md';
const SOLVER_ENTRY = 'scripts/solve.js';
const ENTRY_DOCUMENTS = Object.freeze(['AGENTS.md']);
// Closure is a property of everything an agent reads as current instruction,
// not only of the routing layer. Relocating a document to its owner moves it
// out of docs/steering, so measuring docs/steering alone would let a retired
// operation survive simply by being moved. These are the trees the router
// reaches; historical records under solve/ are not instruction and are exempt.
const INSTRUCTION_DIRS = Object.freeze([
  'docs', 'architecture', 'test/guidelines', 'test/distributed',
]);
// A model or a decision table instructs as much as prose does, so the scan
// covers the data specs under those trees rather than markdown alone.
const INSTRUCTION_SUFFIXES = Object.freeze(['.md', '.json']);
const TEXT_SUFFIXES = Object.freeze(['.md', '.json', '.txt']);
const RULE_HEADING = /^## (R\d{2})\.\s+(.+)$/u;
const RULE_FIELD = /^\*\*(Invariant|Owner|On conflict)\.\*\*\s+(.+)$/u;
const REQUIRES_BLOCK = /^requires:\s*$/u;
const REQUIRES_ITEM = /^\s*-\s+(\S+)\s*$/u;
const FRONT_FENCE = '---';
const COMMANDS_OPEN = 'const COMMANDS = {';
const COMMANDS_CLOSE = '};';
const EMPTY_TEXT = '';
const COMMAND_ENTRY = /['"]([\w-]+)['"]\s*:\s*cmd\w+/gu;
// How steering can name a solver operation.
const VERB_MENTION = /(?:scripts\/solve\.js|npm run solve:|solve:)\s*([a-z][a-z-]*)/gu;
const RULE_FIELDS = Object.freeze(['Invariant', 'Owner', 'On conflict']);
const EXIT_OK = 0;
const EXIT_VIOLATION = 1;
const ARGV_OFFSET = 2;
const METRIC_FLAG = '--metric';
const NOT_PRESENT = -1;

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringTrim = Function.call.bind(String.prototype.trim);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

function readLines(root, relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return null;
  return stringSplit(fs.readFileSync(absolute, TEXT_ENCODING), LINE_SEPARATOR);
}

function walk(root, relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return [];
  return arrayFlatMap(fs.readdirSync(absolute, {withFileTypes: true}), (entry) => {
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) return walk(root, child);
    return arrayIncludes(TEXT_SUFFIXES, path.extname(entry.name)) ? [child] : [];
  });
}

// One convention for every steering measurement, owned by the baseline
// inventory, so no two counters can report different sizes for one corpus.
function lineCount(root, relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return 0;
  return countLines(fs.readFileSync(absolute, TEXT_ENCODING));
}

function linesOf(root, files) {
  return files.reduce((total, file) => total + lineCount(root, file), 0);
}

/**
 * Lines of steering material an agent must read before acting, following the
 * `requires:` declarations transitively from the entry documents.
 * @param {string} [root]
 * @return {{files: string[], lines: number}}
 */
function alwaysLoadClosure(root = REPO_ROOT) {
  const seen = new Set();
  const queue = [...ENTRY_DOCUMENTS];
  while (queue.length > 0) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const required of declaredRequirements(root, file)) {
      if (!seen.has(required)) queue.push(required);
    }
  }
  const files = [...seen].sort();
  return {files, lines: linesOf(root, files)};
}

// Front matter may declare `requires:` followed by a list of documents that
// must be read alongside this one. Anything else is routing, consulted when
// relevant rather than always.
function declaredRequirements(root, file) {
  const lines = readLines(root, file);
  if (lines === null || lines[0] !== FRONT_FENCE) return [];
  const end = arrayIndexOf(lines, FRONT_FENCE, 1);
  if (end === NOT_PRESENT) return [];
  const required = [];
  let collecting = false;
  for (const line of lines.slice(1, end)) {
    if (REQUIRES_BLOCK.test(line)) {
      collecting = true;
      continue;
    }
    const item = REQUIRES_ITEM.exec(line);
    if (collecting && item) {
      required.push(item[1]);
      continue;
    }
    if (stringTrim(line) !== EMPTY_TEXT && !item) collecting = false;
  }
  return required;
}

/**
 * The rules `rules.md` declares, structurally. A rule is one heading plus one
 * invariant, one owner and one conflict resolution.
 * @param {string} [root]
 * @return {Array<{id: string, title: string, fields: Object, problems: string[]}>}
 */
function declaredRules(root = REPO_ROOT) {
  const lines = readLines(root, RULES_MD);
  if (lines === null) return [];
  const rules = [];
  let current = null;
  for (const line of lines) {
    const heading = RULE_HEADING.exec(line);
    if (heading) {
      current = {id: heading[1], title: heading[2], fields: {}, problems: []};
      rules.push(current);
      continue;
    }
    const field = RULE_FIELD.exec(line);
    if (field && current) {
      if (current.fields[field[1]]) current.problems.push(`repeats ${field[1]}`);
      current.fields[field[1]] = field[2];
    }
  }
  for (const rule of rules) {
    for (const name of RULE_FIELDS) {
      if (!rule.fields[name]) rule.problems.push(`has no ${name}`);
    }
  }
  return rules;
}

/**
 * The canonical command registry: the solver operations that exist. Steering
 * may refer to these and no others.
 * @param {string} [root]
 * @return {Set<string>}
 */
function registeredVerbs(root = REPO_ROOT) {
  const source = fs.readFileSync(path.join(root, SOLVER_ENTRY), TEXT_ENCODING);
  const open = stringIndexOf(source, COMMANDS_OPEN);
  if (open === NOT_PRESENT) return new Set();
  const block = stringSlice(source, open,
    stringIndexOf(source, COMMANDS_CLOSE, open));
  return new Set(arrayMap([...block.matchAll(COMMAND_ENTRY)], (match) => match[1]));
}

function instructionDocuments(root) {
  return arrayFilter(
    arrayFlatMap(INSTRUCTION_DIRS, (dir) => walk(root, dir)),
    (file) => !stringStartsWith(file, `${GENERATED_DIR}/`) &&
      arraySome(INSTRUCTION_SUFFIXES, (suffix) => stringEndsWith(file, suffix)));
}

/**
 * Every place current steering refers to a solver operation that the
 * canonical command registry does not contain.
 * @param {string} [root]
 * @return {Array<{file: string, line: number, verb: string}>}
 */
function unregisteredOperationReferences(root = REPO_ROOT) {
  const registered = registeredVerbs(root);
  const found = [];
  for (const file of [...ENTRY_DOCUMENTS, ...instructionDocuments(root)]) {
    const lines = readLines(root, file) || [];
    lines.forEach((text, index) => {
      for (const match of text.matchAll(VERB_MENTION)) {
        if (!registered.has(match[1])) {
          found.push({file, line: index + 1, verb: match[1]});
        }
      }
    });
  }
  return found;
}

function steeringSourceLines(root = REPO_ROOT) {
  return linesOf(root, arrayFilter(walk(root, STEERING_DIR),
    (file) => !stringStartsWith(file, `${GENERATED_DIR}/`)));
}

function steeringCorpusLines(root = REPO_ROOT) {
  return linesOf(root, walk(root, STEERING_DIR));
}

function main(argv) {
  const rules = declaredRules();
  const closure = alwaysLoadClosure();
  const unregistered = unregisteredOperationReferences();
  const problems = arrayFlatMap(rules, (rule) =>
    arrayMap(rule.problems, (problem) => `${rule.id} ${problem}`));
  const report = {
    rules: rules.length,
    ruleProblems: problems,
    alwaysLoadFiles: closure.files,
    alwaysLoadLines: closure.lines,
    steeringSourceLines: steeringSourceLines(),
    steeringCorpusLines: steeringCorpusLines(),
    unregisteredOperations: unregistered,
  };
  if (arrayIncludes(argv, METRIC_FLAG)) {
    process.stdout.write(`${problems.length + unregistered.length}${LINE_SEPARATOR}`);
    return problems.length + unregistered.length === 0 ? EXIT_OK : EXIT_VIOLATION;
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}${LINE_SEPARATOR}`);
  return problems.length + unregistered.length === 0 ? EXIT_OK : EXIT_VIOLATION;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(ARGV_OFFSET));
}

export {
  alwaysLoadClosure, declaredRules, registeredVerbs, steeringCorpusLines,
  steeringSourceLines, unregisteredOperationReferences,
};
