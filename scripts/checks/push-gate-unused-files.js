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
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayForEach = Function.call.bind(Array.prototype.forEach);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringMatchAll = Function.call.bind(String.prototype.matchAll);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);

const TEXT_ENCODING = 'utf8';
const NUL = '\0';
const LINE_SEPARATOR = '\n';
const SCRIPTS_DIR = 'scripts/';
const SOLVER_PREFIX = 'scripts/solve';
const JS_SUFFIX = '.js';
const PACKAGE_JSON = 'package.json';
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
const ARG_LIST = '--list';
// A literal mention of a script anywhere in a reachable text: a package
// script body, a workflow step, a hook, a spawn argument, a probe command.
const SCRIPT_MENTION = /scripts\/[\w./-]+?\.(?:js|sh|mjs)\b/gu;
// A quoted relative path in a script - an import specifier, a `new URL`
// argument, a spawn argument - resolved against the mentioning file.
const RELATIVE_PATH_LITERAL = /['"](\.{1,2}\/[^'"\s]+)['"]/gu;

function trackedPaths() {
  const out = execFileSync('git', ['ls-files', '-z'], {encoding: TEXT_ENCODING});
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

function unusedFilesGate() {
  const tracked = trackedPaths();
  const report = runKnip();
  const files = Array.isArray(report.files) ? report.files : [];
  const issues = Array.isArray(report.issues) ? report.issues : [];
  const trackedUnusedFiles = arrayFilter(files, (file) => tracked.has(file));
  const untrackedUnusedFiles = arrayFilter(files, (file) => !tracked.has(file));
  for (const file of untrackedUnusedFiles) {
    console.warn(`push-gate: ignoring untracked unused file ${file}`);
  }
  if (trackedUnusedFiles.length === 0 && issues.length === 0) {
    return 0;
  }
  if (trackedUnusedFiles.length > 0) {
    console.error(`Unused tracked files (${trackedUnusedFiles.length})`);
    for (const file of trackedUnusedFiles) {
      console.error(`  ${file}`);
    }
  }
  if (issues.length > 0) {
    console.error(`Knip issues (${issues.length})`);
    for (const issue of issues) {
      console.error(`  ${JSON.stringify(issue)}`);
    }
  }
  return 1;
}

function main(argv) {
  if (!arrayIncludes(argv, ARG_UNREACHABLE)) return unusedFilesGate();
  const unreachable = unreachableScripts(trackedPaths());
  if (arrayIncludes(argv, ARG_LIST)) {
    arrayForEach(unreachable, (file) => console.log(file));
  }
  console.log(unreachable.length);
  return unreachable.length === 0 ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
