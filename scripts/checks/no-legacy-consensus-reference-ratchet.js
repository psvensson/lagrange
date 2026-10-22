#!/usr/bin/env node
/**
 * One-way count ratchet for retired consensus references (the
 * consensus-cutover Quest). The ordinary static gate runs it so coherent
 * incremental commits stay pushable while references are removed.
 *
 * The count is every finding of the same fixed-scope scanner the strict audit
 * runs (no-legacy-consensus-reference-audit.js): the same surfaces, the same
 * single historical solve exclusion, no per-path exclusion and no branch
 * exception. A count above the committed baseline exits red; a lower count
 * passes and prints the repository-standard tightening hint. The baseline is
 * one-way: any increase across its git history or in the working tree exits
 * red, and a missing baseline is refused rather than read as unlimited. The
 * strict-zero audit remains the Quest's terminal proof.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {printRatchetTighteningHint} from '../metric-check-helpers.js';
import {gitProcessEnvironment} from './git-process-environment.js';
import {
  FIXED_SCAN_SCOPE,
  HISTORICAL_EXCLUSION,
  auditRetiredConsensusReferences,
} from './no-legacy-consensus-reference-audit.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const stringSplit = Function.call.bind(String.prototype.split);

const BASELINE_FILE =
  'scripts/checks/no-legacy-consensus-reference-baseline.json';
const RATCHET_TEXT = Object.freeze({
  NAME: 'no-legacy-consensus-reference-ratchet',
  LABEL: 'audit:no-legacy-consensus-references',
  STRICT_COMMAND: 'npm run audit:no-legacy-consensus-references:strict',
  WORKING_TREE: 'working tree',
  LINE_SEPARATOR: '\n',
  SCOPE_SEPARATOR: ' ',
  REVISION_SEPARATOR: ':',
  UTF8: 'utf8',
  NOT_A_COUNT: 'not a non-negative integer',
  MISSING_BASELINE: 'the ratchet refuses to run without a baseline',
  ONE_WAY: 'ratchet baselines are one-way',
});
const GIT_BINARY = 'git';
const GIT_HAS_HEAD = Object.freeze(['rev-parse', '--verify', '--quiet',
  'HEAD']);
const GIT_BASELINE_REVISIONS = Object.freeze([
  'log', '--reverse', '--format=%H', '--', BASELINE_FILE,
]);
const GIT_SHOW = 'show';
const EXIT_OK = 0;
const EXIT_RATCHET_FAILED = 1;
const EXIT_UNREADABLE = 2;

function runGit(root, args) {
  return spawnSync(GIT_BINARY, args, {
    cwd: root,
    env: gitProcessEnvironment(),
    encoding: RATCHET_TEXT.UTF8,
  });
}

function parseBaselineCount(text, origin) {
  let count;
  try {
    count = JSON.parse(text)?.baselineCount;
  } catch (error) {
    throw new Error(`${RATCHET_TEXT.NAME}: unreadable baseline at ` +
      `${origin}: ${error.message}`);
  }
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${RATCHET_TEXT.NAME}: baselineCount at ${origin} is ` +
      RATCHET_TEXT.NOT_A_COUNT);
  }
  return count;
}

function committedBaselineHistory(root) {
  if (runGit(root, GIT_HAS_HEAD).status !== EXIT_OK) {
    return [];
  }
  const log = runGit(root, GIT_BASELINE_REVISIONS);
  if (log.status !== EXIT_OK) {
    throw new Error(`${RATCHET_TEXT.NAME}: git log failed in ${root}: ` +
      `${log.stderr || log.error?.message}`);
  }
  const history = [];
  const revisions = arrayFilter(
    stringSplit(log.stdout, RATCHET_TEXT.LINE_SEPARATOR),
    (revision) => revision.length > 0);
  for (const revision of revisions) {
    const shown = runGit(root, [GIT_SHOW,
      `${revision}${RATCHET_TEXT.REVISION_SEPARATOR}${BASELINE_FILE}`]);
    // A revision that deleted the baseline records no count; a later
    // re-addition is still compared with the last recorded one.
    if (shown.status === EXIT_OK) {
      history.push({
        origin: revision,
        count: parseBaselineCount(shown.stdout, revision),
      });
    }
  }
  return history;
}

/**
 * Read every recorded baseline, oldest first, ending with the working tree.
 * @param {string} root - Repository root (a git work tree).
 * @return {Array<{origin: string, count: number}>} The baseline history.
 */
function readBaselineHistory(root) {
  const workingPath = path.join(root, BASELINE_FILE);
  if (!fs.existsSync(workingPath)) {
    throw new Error(`${RATCHET_TEXT.NAME}: missing ${BASELINE_FILE}; ` +
      RATCHET_TEXT.MISSING_BASELINE);
  }
  return [
    ...committedBaselineHistory(root),
    {
      origin: RATCHET_TEXT.WORKING_TREE,
      count: parseBaselineCount(
        fs.readFileSync(workingPath, RATCHET_TEXT.UTF8),
        RATCHET_TEXT.WORKING_TREE),
    },
  ];
}

/**
 * The first increase in a baseline history: ratchet baselines are one-way.
 * @param {Array<{origin: string, count: number}>} history - Oldest first.
 * @return {{from: Object, to: Object}|null} The first raise, or null.
 */
function findBaselineIncrease(history) {
  let previous = null;
  for (const entry of history) {
    if (previous && entry.count > previous.count) {
      return {from: previous, to: entry};
    }
    previous = entry;
  }
  return null;
}

function reportRatchetFailure(report, count, baseline) {
  for (const finding of report.findings) {
    process.stdout.write(`${finding.path}:${finding.line} ${finding.kind}` +
      RATCHET_TEXT.LINE_SEPARATOR);
  }
  process.stderr.write(`${RATCHET_TEXT.NAME}: ${count} retired consensus ` +
    `references exceed the one-way baseline of ${baseline} ` +
    `(${BASELINE_FILE}); remove references instead of raising it` +
    RATCHET_TEXT.LINE_SEPARATOR);
}

function main() {
  const root = process.cwd();
  let history;
  let report;
  try {
    history = readBaselineHistory(root);
    report = auditRetiredConsensusReferences(root);
  } catch (error) {
    process.stderr.write(`${error.message}${RATCHET_TEXT.LINE_SEPARATOR}`);
    return EXIT_UNREADABLE;
  }
  const increase = findBaselineIncrease(history);
  if (increase) {
    process.stderr.write(`${RATCHET_TEXT.NAME}: baseline raised from ` +
      `${increase.from.count} (${increase.from.origin}) to ` +
      `${increase.to.count} (${increase.to.origin}); ` +
      RATCHET_TEXT.ONE_WAY + RATCHET_TEXT.LINE_SEPARATOR);
    return EXIT_RATCHET_FAILED;
  }
  const baseline = history[history.length - 1].count;
  const count = report.findings.length;
  if (count > baseline) {
    reportRatchetFailure(report, count, baseline);
    return EXIT_RATCHET_FAILED;
  }
  process.stdout.write(`${RATCHET_TEXT.NAME}: ratchet OK: ${count}/` +
    `${baseline} retired consensus references in ` +
    `${report.referencingFiles} of ${report.scannedFiles} scanned files ` +
    `(strict target 0: ${RATCHET_TEXT.STRICT_COMMAND}; scope ` +
    `${FIXED_SCAN_SCOPE.join(RATCHET_TEXT.SCOPE_SEPARATOR)}; excluded ` +
    `${HISTORICAL_EXCLUSION})` + RATCHET_TEXT.LINE_SEPARATOR);
  printRatchetTighteningHint(RATCHET_TEXT.LABEL, count, baseline,
    BASELINE_FILE);
  return EXIT_OK;
}

const isMainModule = process.argv[1] &&
  import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
if (isMainModule) {
  process.exitCode = main();
}

export {BASELINE_FILE, findBaselineIncrease, readBaselineHistory};
