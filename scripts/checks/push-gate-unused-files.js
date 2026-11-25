#!/usr/bin/env node
/**
 * Push-gate variant of `npm run test:unused`, and the script-reachability
 * probe (`--unreachable-scripts`).
 *
 * The pre-push hook must judge only the tree being pushed. Knip scans the
 * working tree, so an untracked file (e.g. a concurrent session's in-flight
 * quest work) would block an unrelated push even though untracked files are
 * never part of a push. This wrapper runs the same knip analysis and
 * downgrades unused-file findings for untracked paths to warnings; every
 * finding on a tracked path, and every non-file issue, still fails the gate.
 *
 * Knip treats every `scripts/**` file as an entry, so it can never say which
 * scripts nothing runs. `--unreachable-scripts` answers that: a script is
 * reachable when the closure of relative imports and literal `scripts/...`
 * mentions from the roots - package.json scripts, the workflows, the hooks,
 * the gate manifests they run, the container image, the shipped examples,
 * the solver (`scripts/solve*`) and the probe command of every open quest
 * and epic - reaches it. It prints the count of tracked scripts outside that closure
 * (the script-reachability-cull probe, target 0); `--list` prints them first.
 */
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {parse as parseJavaScript} from 'espree';
import {KEYS as VISITOR_KEYS} from 'eslint-visitor-keys';

import {resolvedCheckRange} from './changed-paths.js';
import {execGit} from './git-invocation.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayForEach = Function.call.bind(Array.prototype.forEach);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringMatchAll = Function.call.bind(String.prototype.matchAll);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);

const TEXT_ENCODING = 'utf8';
const NUL = '\0';
const LINE_SEPARATOR = '\n';
const SCRIPTS_DIR = 'scripts/';
const SRC_DIR = 'src/';
const TEST_DIR = 'test/';
const TEST_HELPERS_DIR = 'src/test-helpers/';
const SOLVER_PREFIX = 'scripts/solve';
const JS_SUFFIX = '.js';
const MJS_SUFFIX = '.mjs';
const CJS_SUFFIX = '.cjs';
const INDEX_JS_SUFFIX = '/index.js';
const PACKAGE_JSON = 'package.json';
const KNIP_JSON = 'knip.json';
const PRODUCTION_ENTRY_SUFFIX = '!';
const LEADING_DOT_SLASH = /^\.\//u;
const RELATIVE_SPECIFIER_PREFIX = './';
const PARENT_SPECIFIER_PREFIX = '../';
const SPECIFIER_QUERY_OR_HASH = /[?#].*$/u;
const HASHBANG_LINE = /^#!.*(?:\r?\n|$)/u;
const DOCKER_LINE_CONTINUATION = /\\\r?\n/gu;
const DOCKER_LINE_SPLIT = /\r?\n/u;
const DOCKER_ENTRYPOINT_OR_CMD = /^\s*(?:ENTRYPOINT|CMD)\b/iu;
const PRODUCTION_SRC_ROOTS = Object.freeze(['src/index.js', 'src/main.js']);
const WORKFLOWS_DIR = '.github/workflows';
const HOOKS_DIR = '.githooks';
const QUESTS_DIR = 'solve/quests';
const QUEST_FILE = 'quest.json';
const QUEST_LOG = 'log.ndjson';
const TERMINAL_ENTRY_TYPE = 'terminal';
const EPICS_DIR = 'solve/epics';
const MANIFESTS_DIR = 'test/manifests';
const DOCKERFILE = 'Dockerfile';
const EXAMPLES_DIR = 'examples';
const CLOSED_EPIC_STATUS = /^status:\s*(?:closed|done|superseded)\b/mu;
const ARG_UNREACHABLE = '--unreachable-scripts';
const ARG_UNREACHABLE_SRC = '--unreachable-src';
const ARG_ADDED = '--added';
const ARG_BASE = '--base';
const ARG_LIST = '--list';
const SOURCE_TYPE_MODULE = 'module';
const SOURCE_TYPE_SCRIPT = 'script';
const ECMA_VERSION_LATEST = 'latest';
const SPACE = ' ';
const REPORT_HEADER = Object.freeze({
  KNIP_ISSUES: 'Knip issues',
  NEWLY_UNREACHABLE_SRC: 'Newly unreachable src modules',
  UNUSED_TRACKED_FILES: 'Unused tracked files',
});
const GIT_DIFF_ADDED_ARGS = Object.freeze([
  'diff',
  '--name-only',
  '--diff-filter=A',
  '-z',
]);
const GIT_DIFF_CACHED_ADDED_ARGS = Object.freeze([
  'diff',
  '--cached',
  '--name-only',
  '--diff-filter=A',
  '-z',
]);
const GIT_REV_PARSE_HEAD_ARGS = Object.freeze([
  'rev-parse',
  '--verify',
  '--quiet',
  'HEAD',
]);
const GIT_LS_TREE_BASE_ARGS = Object.freeze([
  'ls-tree',
  '-r',
  '--name-only',
  '-z',
]);
const GIT_DIFF_NAME_ONLY_ARGS = Object.freeze([
  'diff',
  '--name-only',
  '-z',
]);
const GIT_SHOW_CMD = 'show';
const AST_TYPE = Object.freeze({
  CALL_EXPRESSION: 'CallExpression',
  EXPORT_ALL: 'ExportAllDeclaration',
  EXPORT_NAMED: 'ExportNamedDeclaration',
  IDENTIFIER: 'Identifier',
  IMPORT_DECLARATION: 'ImportDeclaration',
  IMPORT_EXPRESSION: 'ImportExpression',
  LITERAL: 'Literal',
  MEMBER_EXPRESSION: 'MemberExpression',
  META_PROPERTY: 'MetaProperty',
  NEW_EXPRESSION: 'NewExpression',
  TEMPLATE_LITERAL: 'TemplateLiteral',
  VARIABLE_DECLARATION: 'VariableDeclaration',
});
const CONST_KIND = 'const';
const IMPORT_META_NAME = 'import';
const META_PROPERTY_NAME = 'meta';
const URL_PROPERTY_NAME = 'url';
const CALL_SPECIFIER_CALLEES = Object.freeze(['require', 'fork']);
const WORKER_CONSTRUCTOR = 'Worker';
const URL_CONSTRUCTOR = 'URL';
const MODULE_EXTENSION_CANDIDATES = Object.freeze([
  '',
  JS_SUFFIX,
  MJS_SUFFIX,
  CJS_SUFFIX,
  INDEX_JS_SUFFIX,
]);
// A literal mention of a script anywhere in a reachable text: a package
// script body, a workflow step, a hook, a spawn argument, a probe command.
const SCRIPT_MENTION = /scripts\/[\w./-]+?\.(?:js|sh|mjs)\b/gu;
// A literal mention of a runtime module under src/ in package.json scripts or
// Dockerfile ENTRYPOINT/CMD directives.
const SRC_MENTION = /src\/[\w./-]+?\.(?:js|mjs|cjs)\b/gu;
// A quoted relative path in a script - an import specifier, a `new URL`
// argument, a spawn argument - resolved against the mentioning file.
const RELATIVE_PATH_LITERAL = /['"](\.{1,2}\/[^'"\s]+)['"]/gu;

function trackedPaths() {
  const out = execGit(['ls-files', '-z'], {encoding: TEXT_ENCODING});
  return new Set(arrayFilter(stringSplit(out, NUL), Boolean));
}

function readText(relativePath) {
  try {
    return fs.readFileSync(relativePath, TEXT_ENCODING);
  } catch {
    return '';
  }
}

function listFiles(directory) {
  try {
    return arrayMap(fs.readdirSync(directory), (name) => path.join(directory, name));
  } catch {
    return [];
  }
}

// The probe command of every quest without a terminal entry: the solver
// runs it, so its script is reachable through the solver.
function openQuestProbeTexts() {
  const texts = [];
  arrayForEach(listFiles(QUESTS_DIR), (questDir) => {
    const log = readText(path.join(questDir, QUEST_LOG));
    const closed = arraySome(stringSplit(log, LINE_SEPARATOR), (line) =>
      stringIncludes(line, `"type":"${TERMINAL_ENTRY_TYPE}"`));
    if (!closed) texts.push(readText(path.join(questDir, QUEST_FILE)));
  });
  return texts;
}

// Every epic that is not closed: its doneWhen probe is run by the solver.
function openEpicTexts() {
  return arrayFilter(arrayMap(listFiles(EPICS_DIR), readText), (text) =>
    !CLOSED_EPIC_STATUS.test(text));
}

// Every tracked file under a directory, at any depth.
function trackedUnder(tracked, directory) {
  return arrayFilter([...tracked], (file) => stringStartsWith(file, `${directory}/`));
}

function rootTexts(tracked) {
  return [
    readText(PACKAGE_JSON),
    readText(DOCKERFILE),
    ...arrayMap(trackedUnder(tracked, EXAMPLES_DIR), readText),
    ...arrayMap(listFiles(WORKFLOWS_DIR), readText),
    ...arrayMap(listFiles(HOOKS_DIR), readText),
    ...arrayMap(listFiles(MANIFESTS_DIR), readText),
    ...openQuestProbeTexts(),
    ...openEpicTexts(),
  ];
}

function mentionedScripts(text, tracked) {
  const found = [];
  for (const match of stringMatchAll(text, SCRIPT_MENTION)) {
    if (tracked.has(match[0])) found.push(match[0]);
  }
  return found;
}

function importedScripts(text, from, tracked) {
  const found = [];
  for (const match of stringMatchAll(text, RELATIVE_PATH_LITERAL)) {
    const resolved = path.normalize(path.join(path.dirname(from), match[1]));
    if (tracked.has(resolved)) found.push(resolved);
  }
  return found;
}

/**
 * Tracked files under scripts/ that no root reaches through imports or
 * literal mentions.
 * @param {Set<string>} tracked tracked paths of the tree
 * @returns {string[]} unreachable script paths, sorted
 */
function unreachableScripts(tracked) {
  const scripts = arrayFilter([...tracked], (file) => stringStartsWith(file, SCRIPTS_DIR));
  const reachable = new Set(arrayFilter(scripts, (file) => stringStartsWith(file, SOLVER_PREFIX)));
  const queue = [...reachable];
  const admit = (file) => {
    if (reachable.has(file)) return;
    reachable.add(file);
    queue.push(file);
  };
  arrayForEach(rootTexts(tracked), (text) => arrayForEach(mentionedScripts(text, tracked), admit));
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const file = queue[cursor];
    const text = readText(file);
    arrayForEach(mentionedScripts(text, tracked), admit);
    if (stringEndsWith(file, JS_SUFFIX)) {
      arrayForEach(importedScripts(text, file, tracked), admit);
    }
  }
  return arrayFilter(scripts, (file) => !reachable.has(file)).sort();
}

function runKnip() {
  const result = spawnSync('npx', [
    'knip', '--exclude', 'exports,duplicates', '--reporter', 'json',
  ], {encoding: TEXT_ENCODING, maxBuffer: 64 * 1024 * 1024});
  if (result.error) {
    throw result.error;
  }
  // Knip's own stderr (configuration hints, warnings) passes through so the
  // gate never shows less than `npm run test:unused` did.
  if (result.stderr) process.stderr.write(result.stderr);
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    process.stderr.write(result.stdout);
    throw new Error('knip did not produce parseable JSON output');
  }
  return report;
}

function resolveExplicitBase(argv) {
  const index = arrayIndexOf(argv, ARG_BASE);
  if (index < 0 || index + 1 >= argv.length) return null;
  return argv[index + 1] || null;
}

function addedTrackedPaths(tracked, explicitBase) {
  const root = process.cwd();
  const range = resolvedCheckRange(explicitBase, process.env, root);
  const added = new Set();
  const recordDiff = (args) => {
    const out = execGit(args, {cwd: root, encoding: TEXT_ENCODING});
    arrayForEach(
      arrayFilter(stringSplit(out, NUL), Boolean),
      (file) => {
        if (tracked.has(file)) added.add(file);
      },
    );
  };
  if (range.base) {
    recordDiff([...GIT_DIFF_ADDED_ARGS, `${range.base}..HEAD`]);
  }
  recordDiff([...GIT_DIFF_CACHED_ADDED_ARGS]);
  return added;
}

function resolveBaseCommit(explicitBase, root) {
  const range = resolvedCheckRange(explicitBase, process.env, root);
  if (range.base) return range.base;
  try {
    const head = stringTrim(
      execGit([...GIT_REV_PARSE_HEAD_ARGS], {cwd: root, encoding: TEXT_ENCODING}),
    );
    return head || null;
  } catch {
    return null;
  }
}

function trackedPathsAtCommit(base, root) {
  const out = execGit([...GIT_LS_TREE_BASE_ARGS, base], {cwd: root, encoding: TEXT_ENCODING});
  return new Set(arrayFilter(stringSplit(out, NUL), Boolean));
}

function changedPathsSinceBase(base, root) {
  const out = execGit([...GIT_DIFF_NAME_ONLY_ARGS, base], {cwd: root, encoding: TEXT_ENCODING});
  return new Set(arrayFilter(stringSplit(out, NUL), Boolean));
}

function readTextAtCommit(base, relativePath, root) {
  try {
    return execGit([GIT_SHOW_CMD, `${base}:${relativePath}`], {
      cwd: root,
      encoding: TEXT_ENCODING,
    });
  } catch {
    return '';
  }
}

function newlyUnreachableSrcModules(tracked, explicitBase = null) {
  const diskSpecifiers = new Map();
  const currentUnreachable = unreachableSrcModules(tracked, {
    getSpecifiers: (text, file) => {
      const specifiers = executableModuleSpecifiers(text, file);
      diskSpecifiers.set(file, specifiers);
      return specifiers;
    },
  });
  if (currentUnreachable.length === 0) return [];
  const root = process.cwd();
  const base = resolveBaseCommit(explicitBase, root);
  if (!base) return currentUnreachable;
  const baseTracked = trackedPathsAtCommit(base, root);
  const changed = changedPathsSinceBase(base, root);
  const baseUnreachable = new Set(unreachableSrcModules(baseTracked, {
    readFile: (file) => (
      changed.has(file) ? readTextAtCommit(base, file, root) : readText(file)
    ),
    getSpecifiers: (text, file) => {
      if (!changed.has(file) && diskSpecifiers.has(file)) {
        return diskSpecifiers.get(file);
      }
      return executableModuleSpecifiers(text, file);
    },
  }));
  const added = addedTrackedPaths(tracked, explicitBase);
  return arrayFilter(
    currentUnreachable,
    (file) => added.has(file) || !baseUnreachable.has(file),
  );
}

function reportList(header, items, formatItem = (item) => item) {
  if (items.length === 0) return;
  console.error(`${header} (${items.length})`);
  for (const item of items) {
    console.error(`  ${formatItem(item)}`);
  }
}

function unusedFilesGate(argv = []) {
  const tracked = trackedPaths();
  const report = runKnip();
  const files = Array.isArray(report.files) ? report.files : [];
  const issues = Array.isArray(report.issues) ? report.issues : [];
  const trackedUnusedFiles = arrayFilter(files, (file) => tracked.has(file));
  const untrackedUnusedFiles = arrayFilter(files, (file) => !tracked.has(file));
  const newlyUnreachableSrc = newlyUnreachableSrcModules(tracked, resolveExplicitBase(argv));
  for (const file of untrackedUnusedFiles) {
    console.warn(`push-gate: ignoring untracked unused file ${file}`);
  }
  const hasFailures = trackedUnusedFiles.length > 0 ||
    issues.length > 0 ||
    newlyUnreachableSrc.length > 0;
  if (!hasFailures) return 0;
  reportList(REPORT_HEADER.UNUSED_TRACKED_FILES, trackedUnusedFiles);
  reportList(REPORT_HEADER.NEWLY_UNREACHABLE_SRC, newlyUnreachableSrc);
  reportList(REPORT_HEADER.KNIP_ISSUES, issues, (issue) => JSON.stringify(issue));
  return 1;
}

function isJsLikeModule(file) {
  return stringEndsWith(file, JS_SUFFIX) ||
    stringEndsWith(file, MJS_SUFFIX) ||
    stringEndsWith(file, CJS_SUFFIX);
}

function isProductionTarget(file) {
  return !stringStartsWith(file, TEST_DIR) && !stringStartsWith(file, TEST_HELPERS_DIR);
}

function normalizeEntryCandidate(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.length === 0) return '';
  const stripped = stringEndsWith(rawPath, PRODUCTION_ENTRY_SUFFIX) ?
    rawPath.slice(0, -1) : rawPath;
  return path.posix.normalize(stringReplace(stripped, LEADING_DOT_SLASH, ''));
}

function collectNestedStrings(value, out) {
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const child of Object.values(value)) {
    collectNestedStrings(child, out);
  }
}

function readJsonOrNull(relativePath, readFile = readText) {
  const text = readFile(relativePath);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function mentionedSrcModules(text, tracked) {
  const found = [];
  for (const match of stringMatchAll(text, SRC_MENTION)) {
    const candidate = match[0];
    if (tracked.has(candidate) && isProductionTarget(candidate) && isJsLikeModule(candidate)) {
      found.push(candidate);
    }
  }
  return found;
}

function dockerfileRuntimeEntrypoints(tracked, readFile = readText) {
  const text = readFile(DOCKERFILE);
  if (!text) return [];
  const unfolded = stringReplace(text, DOCKER_LINE_CONTINUATION, SPACE);
  const found = [];
  for (const line of stringSplit(unfolded, DOCKER_LINE_SPLIT)) {
    if (DOCKER_ENTRYPOINT_OR_CMD.test(line)) {
      arrayForEach(mentionedSrcModules(line, tracked), (file) => found.push(file));
    }
  }
  return found;
}

function packageScriptEntrypoints(pkg, tracked) {
  if (!pkg || !pkg.scripts || typeof pkg.scripts !== 'object') return [];
  const found = [];
  for (const command of Object.values(pkg.scripts)) {
    if (typeof command === 'string') {
      arrayForEach(mentionedSrcModules(command, tracked), (file) => found.push(file));
    }
  }
  return found;
}

function productionEntrypoints(tracked, readFile = readText) {
  const roots = [];
  const addCandidate = (rawPath) => {
    const normalized = normalizeEntryCandidate(rawPath);
    if (normalized && tracked.has(normalized) &&
        isProductionTarget(normalized) && isJsLikeModule(normalized)) {
      roots.push(normalized);
    }
  };
  const pkg = readJsonOrNull(PACKAGE_JSON, readFile);
  if (pkg) {
    addCandidate(pkg.main);
    const extra = [];
    collectNestedStrings(pkg.exports, extra);
    collectNestedStrings(pkg.bin, extra);
    arrayForEach(extra, addCandidate);
    arrayForEach(packageScriptEntrypoints(pkg, tracked), addCandidate);
  }
  arrayForEach(dockerfileRuntimeEntrypoints(tracked, readFile), addCandidate);
  const knip = readJsonOrNull(KNIP_JSON, readFile);
  if (knip && Array.isArray(knip.entry)) {
    for (const entry of knip.entry) {
      if (typeof entry === 'string' && stringEndsWith(entry, PRODUCTION_ENTRY_SUFFIX)) {
        addCandidate(entry);
      }
    }
  }
  arrayForEach(PRODUCTION_SRC_ROOTS, addCandidate);
  for (const file of tracked) {
    if (stringStartsWith(file, SCRIPTS_DIR) && isJsLikeModule(file)) {
      roots.push(file);
    }
  }
  return roots;
}

function parseModuleAst(text, file) {
  const source = stringReplace(text, HASHBANG_LINE, LINE_SEPARATOR);
  const sourceTypes = stringEndsWith(file, CJS_SUFFIX) ?
    [SOURCE_TYPE_SCRIPT, SOURCE_TYPE_MODULE] :
    [SOURCE_TYPE_MODULE, SOURCE_TYPE_SCRIPT];
  for (const sourceType of sourceTypes) {
    try {
      return parseJavaScript(source, {ecmaVersion: ECMA_VERSION_LATEST, sourceType});
    } catch {
      continue;
    }
  }
  return null;
}

function visitAst(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  const keys = VISITOR_KEYS[node.type];
  if (!keys) return;
  for (const key of keys) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) visitAst(item, visitor);
    } else if (child && typeof child === 'object') {
      visitAst(child, visitor);
    }
  }
}

function staticStringLiteral(node) {
  if (!node) return null;
  if (node.type === AST_TYPE.LITERAL && typeof node.value === 'string') {
    return node.value;
  }
  if (node.type === AST_TYPE.TEMPLATE_LITERAL && node.expressions.length === 0) {
    return node.quasis[0]?.value?.cooked ?? null;
  }
  return null;
}

function collectConstStringBindings(ast) {
  const bindings = new Map();
  const seen = new Set();
  visitAst(ast, (node) => {
    if (node.type !== AST_TYPE.VARIABLE_DECLARATION || node.kind !== CONST_KIND) return;
    for (const declarator of node.declarations) {
      if (declarator.id?.type !== AST_TYPE.IDENTIFIER) continue;
      const value = staticStringLiteral(declarator.init);
      if (value === null) continue;
      const name = declarator.id.name;
      if (seen.has(name)) {
        bindings.delete(name);
      } else {
        seen.add(name);
        bindings.set(name, value);
      }
    }
  });
  return bindings;
}

function resolveSpecifierArg(node, constBindings) {
  const literal = staticStringLiteral(node);
  if (literal !== null) return literal;
  if (node?.type === AST_TYPE.IDENTIFIER && constBindings.has(node.name)) {
    return constBindings.get(node.name);
  }
  return null;
}

function calleeIdentifierName(callee) {
  if (!callee) return null;
  if (callee.type === AST_TYPE.IDENTIFIER) return callee.name;
  if (callee.type === AST_TYPE.MEMBER_EXPRESSION && !callee.computed &&
      callee.property?.type === AST_TYPE.IDENTIFIER) {
    return callee.property.name;
  }
  return null;
}

function isImportMetaUrl(node) {
  return node?.type === AST_TYPE.MEMBER_EXPRESSION &&
    !node.computed &&
    node.object?.type === AST_TYPE.META_PROPERTY &&
    node.object.meta?.name === IMPORT_META_NAME &&
    node.object.property?.name === META_PROPERTY_NAME &&
    node.property?.type === AST_TYPE.IDENTIFIER &&
    node.property.name === URL_PROPERTY_NAME;
}

function isStaticModuleDeclaration(node) {
  return node.type === AST_TYPE.IMPORT_DECLARATION ||
    node.type === AST_TYPE.EXPORT_NAMED ||
    node.type === AST_TYPE.EXPORT_ALL;
}

function callOrNewSpecifier(node, constBindings) {
  const name = calleeIdentifierName(node.callee);
  if (!name) return null;
  if (node.type === AST_TYPE.CALL_EXPRESSION) {
    return arrayIncludes(CALL_SPECIFIER_CALLEES, name) ?
      resolveSpecifierArg(node.arguments?.[0], constBindings) : null;
  }
  if (node.type === AST_TYPE.NEW_EXPRESSION) {
    const isWorkerOrMetaUrl = name === WORKER_CONSTRUCTOR ||
      (name === URL_CONSTRUCTOR && isImportMetaUrl(node.arguments?.[1]));
    return isWorkerOrMetaUrl ? resolveSpecifierArg(node.arguments?.[0], constBindings) : null;
  }
  return null;
}

function executableSpecifierForNode(node, constBindings) {
  if (isStaticModuleDeclaration(node) && node.source) {
    return staticStringLiteral(node.source);
  }
  if (node.type === AST_TYPE.IMPORT_EXPRESSION) {
    return resolveSpecifierArg(node.source, constBindings);
  }
  return callOrNewSpecifier(node, constBindings);
}

function executableModuleSpecifiers(text, file) {
  const ast = parseModuleAst(text, file);
  if (!ast) return [];
  const constBindings = collectConstStringBindings(ast);
  const specifiers = [];
  visitAst(ast, (node) => {
    const specifier = executableSpecifierForNode(node, constBindings);
    if (specifier) specifiers.push(specifier);
  });
  return specifiers;
}

function resolveProductionModulePath(basePath, tracked) {
  for (const suffix of MODULE_EXTENSION_CANDIDATES) {
    const candidate = `${basePath}${suffix}`;
    if (tracked.has(candidate) && isProductionTarget(candidate) && isJsLikeModule(candidate)) {
      return candidate;
    }
  }
  return null;
}

function importedProductionModules(
  text,
  from,
  tracked,
  getSpecifiers = executableModuleSpecifiers,
) {
  const found = [];
  for (const rawSpecifier of getSpecifiers(text, from)) {
    const specifier = stringReplace(rawSpecifier, SPECIFIER_QUERY_OR_HASH, '');
    let basePath = null;
    if (stringStartsWith(specifier, RELATIVE_SPECIFIER_PREFIX) ||
        stringStartsWith(specifier, PARENT_SPECIFIER_PREFIX)) {
      basePath = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
    } else {
      const normalized = path.posix.normalize(stringReplace(specifier, LEADING_DOT_SLASH, ''));
      if (stringStartsWith(normalized, SRC_DIR)) basePath = normalized;
    }
    if (!basePath) continue;
    const resolved = resolveProductionModulePath(basePath, tracked);
    if (resolved) found.push(resolved);
  }
  return found;
}

/**
 * Tracked runtime modules under src/** (excluding src/test-helpers/**) that
 * no production entrypoint (package.json main/bin/exports/scripts, knip
 * production entries, src/index.js, src/main.js, Dockerfile ENTRYPOINT/CMD,
 * or executable scripts/**) reaches via executable module/worker edges.
 * @param {Set<string>} tracked tracked paths of the tree
 * @param {Object} [options] optional file reader and specifier extractor
 * @returns {string[]} unreachable src module paths, sorted
 */
function unreachableSrcModules(tracked, {
  readFile = readText,
  getSpecifiers = executableModuleSpecifiers,
} = {}) {
  const srcModules = arrayFilter(
    [...tracked],
    (file) => stringStartsWith(file, SRC_DIR) &&
      isJsLikeModule(file) &&
      !stringStartsWith(file, TEST_HELPERS_DIR),
  );
  const reachable = new Set();
  const queue = [];
  const admit = (file) => {
    if (reachable.has(file) || !isProductionTarget(file) || !isJsLikeModule(file)) return;
    reachable.add(file);
    queue.push(file);
  };
  arrayForEach(productionEntrypoints(tracked, readFile), admit);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const file = queue[cursor];
    const text = readFile(file);
    arrayForEach(importedProductionModules(text, file, tracked, getSpecifiers), admit);
  }
  return arrayFilter(srcModules, (file) => !reachable.has(file)).sort();
}

function runReachabilityProbe(unreachable, argv) {
  if (arrayIncludes(argv, ARG_LIST)) {
    arrayForEach(unreachable, (file) => console.log(file));
  }
  console.log(unreachable.length);
  return unreachable.length === 0 ? 0 : 1;
}

function main(argv) {
  if (arrayIncludes(argv, ARG_UNREACHABLE)) {
    return runReachabilityProbe(unreachableScripts(trackedPaths()), argv);
  }
  if (arrayIncludes(argv, ARG_UNREACHABLE_SRC)) {
    const tracked = trackedPaths();
    const unreachable = arrayIncludes(argv, ARG_ADDED) ?
      newlyUnreachableSrcModules(tracked, resolveExplicitBase(argv)) :
      unreachableSrcModules(tracked);
    return runReachabilityProbe(unreachable, argv);
  }
  return unusedFilesGate(argv);
}

process.exit(main(process.argv.slice(2)));
