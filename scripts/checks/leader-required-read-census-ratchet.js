#!/usr/bin/env node
/**
 * One-way count ratchet for leader-REQUIRED system-table reads that are not
 * yet owner facts (S0 of the fallback-read closure; transition record
 * section 16.7). Such a read is qualified only by the serving replica's
 * leader role: its receiver does not refuse a fresh leader that has not
 * applied its election log, so it can answer a row its leader's predecessor
 * committed as absent. readOwnerFact refuses that read point
 * (test/cdc/cdc-owner-fact-receiver-read-point.test.js); each remaining site
 * migrates to it in its own slice, classifying absence-dependence first.
 *
 * The census counts every `leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED`
 * token in src outside readOwnerFact's own module. A count above the
 * committed baseline exits red; a lower count passes and prints the
 * repository-standard tightening hint. The baseline is one-way, as in
 * no-legacy-consensus-reference-ratchet.js (whose increase rule this reuses):
 * any increase across its git history or in the working tree exits red, and a
 * missing baseline is refused rather than read as unlimited.
 */

import fs from 'node:fs';
import path from 'node:path';

import {printRatchetTighteningHint} from '../metric-check-helpers.js';
import {spawnGit} from './git-invocation.js';
import {gitProcessEnvironment} from './git-process-environment.js';
import {findBaselineIncrease} from './no-legacy-consensus-reference-ratchet.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const stringSplit = Function.call.bind(String.prototype.split);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);

const BASELINE_FILE = 'scripts/checks/leader-required-read-census-baseline.json';
const SCAN_ROOT = 'src';
// readOwnerFact's own module issues the owner-fact read; it is not a site.
const OWNER_FACT_MODULE = 'src/control-plane/control-plane-owner-fact-read.js';
const SITE_PATTERN = /leaderMode\s*:\s*CONTROL_PLANE_READ_LEADER_MODE\.REQUIRED/gu;
const JAVASCRIPT_EXTENSION = '.js';
const UTF8 = 'utf8';
const LINE_SEPARATOR = '\n';
const NAME = 'leader-required-read-census-ratchet';
const LABEL = 'audit:leader-required-read-census';
const WORKING_TREE = 'working tree';
const GIT_BASELINE_REVISIONS = Object.freeze([
  'log', '--reverse', '--format=%H', '--', BASELINE_FILE,
]);
const GIT_SHOW = 'show';
const EXIT_OK = 0;
const EXIT_RATCHET_FAILED = 1;
const EXIT_UNREADABLE = 2;

function listJavaScriptFiles(root, directory) {
  const files = [];
  for (const entry of fs.readdirSync(path.join(root, directory), {withFileTypes: true})
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listJavaScriptFiles(root, relative));
    if (entry.isFile() && stringEndsWith(entry.name, JAVASCRIPT_EXTENSION)) files.push(relative);
  }
  return files;
}

/**
 * Every leader-REQUIRED read token in src that is not readOwnerFact's own.
 * @param {string} root - Repository root.
 * @return {{findings: Array<{path: string, line: number}>, scannedFiles: number}}
 */
function censusLeaderRequiredReads(root) {
  const files = arrayFilter(listJavaScriptFiles(root, SCAN_ROOT),
    (file) => file !== OWNER_FACT_MODULE);
  const findings = [];
  for (const file of files) {
    const lines = stringSplit(fs.readFileSync(path.join(root, file), UTF8), LINE_SEPARATOR);
    lines.forEach((text, index) => {
      for (const _match of text.matchAll(SITE_PATTERN)) {
        findings.push({path: file, line: index + 1});
      }
    });
  }
  return {findings, scannedFiles: files.length};
}

function parseBaselineCount(text, origin) {
  const count = JSON.parse(text)?.baselineCount;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${NAME}: baselineCount at ${origin} is not a non-negative integer`);
  }
  return count;
}

/**
 * The working-tree baseline count.
 * @param {string} root - Repository root.
 * @return {number} The bound.
 */
function readBaselineCount(root) {
  const file = path.join(root, BASELINE_FILE);
  if (!fs.existsSync(file)) {
    throw new Error(`${NAME}: missing ${BASELINE_FILE}; the ratchet refuses to run without one`);
  }
  return parseBaselineCount(fs.readFileSync(file, UTF8), WORKING_TREE);
}

function readBaselineHistory(root) {
  const git = (args) => spawnGit(args, {cwd: root, env: gitProcessEnvironment(), encoding: UTF8});
  const log = git([...GIT_BASELINE_REVISIONS]);
  if (log.status !== EXIT_OK) {
    throw new Error(`${NAME}: git log failed in ${root}: ${log.stderr || log.error?.message}`);
  }
  const history = [];
  for (const revision of arrayFilter(stringSplit(log.stdout, LINE_SEPARATOR), Boolean)) {
    const shown = git([GIT_SHOW, `${revision}:${BASELINE_FILE}`]);
    if (shown.status === EXIT_OK) {
      history.push({origin: revision, count: parseBaselineCount(shown.stdout, revision)});
    }
  }
  return [...history, {origin: WORKING_TREE, count: readBaselineCount(root)}];
}

function main() {
  const root = process.cwd();
  let history;
  let census;
  try {
    history = readBaselineHistory(root);
    census = censusLeaderRequiredReads(root);
  } catch (error) {
    process.stderr.write(`${error.message}${LINE_SEPARATOR}`);
    return EXIT_UNREADABLE;
  }
  const increase = findBaselineIncrease(history);
  if (increase) {
    process.stderr.write(`${NAME}: baseline raised from ${increase.from.count} ` +
      `(${increase.from.origin}) to ${increase.to.count} (${increase.to.origin}); ` +
      `ratchet baselines are one-way${LINE_SEPARATOR}`);
    return EXIT_RATCHET_FAILED;
  }
  const baseline = history[history.length - 1].count;
  const count = census.findings.length;
  if (count > baseline) {
    for (const finding of census.findings) {
      process.stdout.write(`${finding.path}:${finding.line}${LINE_SEPARATOR}`);
    }
    process.stderr.write(`${NAME}: ${count} leader-REQUIRED reads that are not owner facts ` +
      `exceed the one-way baseline of ${baseline} (${BASELINE_FILE}); migrate a read to ` +
      `readOwnerFact instead of adding one${LINE_SEPARATOR}`);
    return EXIT_RATCHET_FAILED;
  }
  process.stdout.write(`${NAME}: ratchet OK: ${count}/${baseline} leader-REQUIRED reads ` +
    `not yet on readOwnerFact in ${census.scannedFiles} scanned files${LINE_SEPARATOR}`);
  printRatchetTighteningHint(LABEL, count, baseline, BASELINE_FILE);
  return EXIT_OK;
}

const isMainModule = process.argv[1] &&
  import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
if (isMainModule) {
  process.exitCode = main();
}

export {BASELINE_FILE, censusLeaderRequiredReads, readBaselineCount};
