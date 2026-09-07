#!/usr/bin/env node
/**
 * The project-hardening gate's verdict, as a number a probe can read
 * (`node scripts/checks/project-hardening-gate.js --metric`).
 *
 * `npm run test:gate` runs the acceptance manifest and writes a report; its
 * verdict is a word in that report. A quest whose closure clause is "the gate
 * is green" therefore had a claim nothing could measure, the same shape as the
 * certification verdict before its projector existed.
 *
 * This reads the newest report the gate wrote and reports how many of its
 * commands did not pass. It runs nothing and decides nothing: the gate is the
 * owner of whether the tree is acceptable, and this only makes the answer
 * legible. A report that is absent is not a pass.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_DIRECTORY = 'test-output/acceptance';
const REPORT_SUFFIX = '.report.json';
const PASS = 'PASS';
const TEXT_ENCODING = 'utf8';
const LINE_SEPARATOR = '\n';
const METRIC_FLAG = '--metric';
const NO_REPORT = 1;
const JSON_INDENT = 2;
const EXIT_OK = 0;
const EXIT_UNMET = 1;
const ARGV_OFFSET = 2;

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arraySort = Function.call.bind(Array.prototype.sort);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);

/**
 * How many commands in the newest gate report did not pass. One when there is
 * no report: not having run the gate is not having passed it.
 * @param {string} [root]
 * @return {number}
 */
function gateShortfall(root = REPO_ROOT) {
  const directory = path.join(root, REPORT_DIRECTORY);
  if (!fs.existsSync(directory)) return NO_REPORT;
  const reports = arraySort(arrayFilter(fs.readdirSync(directory),
    (name) => stringEndsWith(name, REPORT_SUFFIX)));
  if (reports.length === 0) return NO_REPORT;
  const newest = path.join(directory, reports[reports.length - 1]);
  let report = null;
  try {
    report = JSON.parse(fs.readFileSync(newest, TEXT_ENCODING));
  } catch {
    return NO_REPORT;
  }
  const commands = report.commands || report.results || [];
  return arrayFilter(commands, (command) => command.status !== PASS).length;
}

function main(argv) {
  const shortfall = gateShortfall();
  if (arrayIncludes(argv, METRIC_FLAG)) {
    process.stdout.write(`${shortfall}${LINE_SEPARATOR}`);
  } else {
    process.stdout.write(`${JSON.stringify({shortfall}, null, JSON_INDENT)}` +
      LINE_SEPARATOR);
  }
  return shortfall === 0 ? EXIT_OK : EXIT_UNMET;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(ARGV_OFFSET));
}

export {gateShortfall};
