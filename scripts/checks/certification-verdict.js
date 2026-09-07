#!/usr/bin/env node
/**
 * Expose a certification verdict a probe can measure
 * (`node scripts/checks/certification-verdict.js --scenario <name> --metric`).
 *
 * A statistical certification is decided by the gate that runs it: the stat
 * gate executes the window, the summary tool classifies it, and the sealed-bar
 * file holds the population the window has to be drawn from. All of that
 * exists. What did not exist is any way for the solver to see the answer: the
 * v1 `sealed-bar` metric is on v2's non-measuring list, and the scenario-harness
 * probe silently drops `minimumRuns`, `certification` and `sealedBarsFile`, so
 * a quest whose whole claim is a certification could not be measured at all.
 *
 * This is the missing middle and nothing more. The owner computes the verdict;
 * this projects it; a script probe measures what is projected. It recomputes no
 * pass rate, no interval and no classification, and it substitutes no easier
 * proxy for the sealed bar - every condition below is a comparison between two
 * things already recorded, one in the aggregate the gate wrote and one in the
 * sealed-bar file. If the two disagree, that is a finding about the window, not
 * a number for this script to adjust.
 *
 * It is generic over the scenario for the same reason: a second certification
 * must not mean a second checker. Any scenario with a sealed-bar entry is
 * projected by naming it.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SEALED_BARS = 'test/distributed/config/convergence-sealed-bars.json';
const REPORT_DIRECTORY = 'test-output/reports';
const AGGREGATE_PREFIX = 'stat-gate-';
const AGGREGATE_SUFFIX = '.json';
const RUN_REPORT_MARKER = '.report.json';
const TEXT_ENCODING = 'utf8';
const LINE_SEPARATOR = '\n';
const ABOVE_BAR = 'ABOVE_BAR';
const SCENARIO_FLAG = '--scenario';
const REPORTS_FLAG = '--reports';
const METRIC_FLAG = '--metric';
const JSON_INDENT = 2;
const EXIT_OK = 0;
const EXIT_UNMET = 1;
const ARGV_OFFSET = 2;
const NOT_PRESENT = -1;
// What a certification window has to carry, named so the projector's own
// vocabulary is a constant rather than a scatter of strings.
const CARRIES = Object.freeze({
  CERTIFICATION_MODE: 'certification mode',
  CLEAN_TREE: 'clean working tree',
  SOURCE_COMMIT: 'a source commit',
  FINGERPRINT: 'one source fingerprint',
  NO_STALE_SOURCE: 'no stale-source runs',
  RUN_COUNT: 'the sealed run count',
  NODE_COUNT: 'the sealed node count',
  HARDWARE_CLASS: 'the sealed hardware class',
  WORKLOAD: 'the sealed workload',
  FAILURE_SCHEDULE: 'the sealed failure schedule',
  CALIBRATION: 'a recorded machine calibration',
  REPORT_PER_RUN: 'one contributing report per run',
  CLASS_TALLY: 'a failure-class distribution',
  PERCENTILES: 'recorded convergence percentiles',
  SAFETY: 'every safety counter at zero',
  SEALED_BAR: 'the bar the file seals',
  CONFIDENCE: 'the sealed confidence',
  BOUND: 'a reported bound at or above the bar',
  VERDICT: 'the owner\'s verdict above the bar',
});
const NO_SEALED_BAR = ' has no sealed bar';
const NO_WINDOW = ' has no certification window';
const SHORTFALL_PREFIX = 'the window does not carry ';
const USAGE_PREFIX = 'usage: certification-verdict.js ';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySort = Function.call.bind(Array.prototype.sort);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

/**
 * The newest certification aggregate the gate wrote for a scenario, or null.
 * A per-run report is not an aggregate: only the window carries a verdict.
 * @param {string} root
 * @param {string} scenario
 * @param {string} reports
 * @return {?Object}
 */
function newestAggregate(root, scenario, reports = REPORT_DIRECTORY) {
  const directory = path.join(root, reports);
  if (!fs.existsSync(directory)) return null;
  const candidates = arraySort(arrayFilter(fs.readdirSync(directory), (name) =>
    stringStartsWith(name, AGGREGATE_PREFIX) &&
    stringEndsWith(name, AGGREGATE_SUFFIX) &&
    !stringIncludes(name, RUN_REPORT_MARKER)));
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const parsed = readAggregate(path.join(directory, candidates[index]));
    if (parsed && parsed.scenario === scenario) return parsed;
  }
  return null;
}

function readAggregate(file) {
  try {
    return JSON.parse(fs.readFileSync(file, TEXT_ENCODING));
  } catch {
    return null;
  }
}

function sealedBarFor(root, scenario) {
  const file = path.join(root, SEALED_BARS);
  if (!fs.existsSync(file)) return null;
  const sealed = JSON.parse(fs.readFileSync(file, TEXT_ENCODING));
  const entry = sealed.scenarios && sealed.scenarios[scenario];
  return entry ? {...entry, confidence: sealed.confidence} : null;
}

// Whether the window this aggregate describes is one the sealed population
// admits. Every check is a comparison of two recorded values.
function windowConditions(aggregate, sealed) {
  const verdict = aggregate.gateVerdict || {};
  const wilson = verdict.wilson || {};
  return [
    [CARRIES.CERTIFICATION_MODE, aggregate.certificationMode === true],
    [CARRIES.CLEAN_TREE, aggregate.workingTreeClean === true],
    [CARRIES.SOURCE_COMMIT, Boolean(aggregate.sourceCommit)],
    [CARRIES.FINGERPRINT, Boolean(aggregate.srcFingerprint)],
    [CARRIES.NO_STALE_SOURCE, aggregate.staleSourceRuns === 0],
    [CARRIES.RUN_COUNT, aggregate.runs >= sealed.promotionWindowMinRuns],
    [CARRIES.NODE_COUNT, aggregate.nodeCount === sealed.nodes],
    [CARRIES.HARDWARE_CLASS, aggregate.hardwareClass === sealed.hardwareClass],
    [CARRIES.WORKLOAD, aggregate.workloadIdentity === sealed.workloadIdentity],
    [CARRIES.FAILURE_SCHEDULE,
      aggregate.failureScheduleIdentity === sealed.failureScheduleIdentity],
    [CARRIES.CALIBRATION, Boolean(aggregate.calibration)],
    [CARRIES.REPORT_PER_RUN,
      Array.isArray(aggregate.contributingReports) &&
      aggregate.contributingReports.length === aggregate.runs],
    [CARRIES.CLASS_TALLY, Boolean(aggregate.classTally)],
    [CARRIES.PERCENTILES, Boolean(aggregate.wallSeconds)],
    [CARRIES.SAFETY, verdict.safetyClean === true],
    [CARRIES.SEALED_BAR, verdict.sealedBar === sealed.wilsonLowerBoundBar],
    [CARRIES.CONFIDENCE, wilson.confidence === sealed.confidence],
    [CARRIES.BOUND,
      typeof wilson.lowerBound === 'number' &&
      wilson.lowerBound >= sealed.wilsonLowerBoundBar],
    [CARRIES.VERDICT, verdict.verdict === ABOVE_BAR],
  ];
}

/**
 * Everything a scenario's newest certification window does not satisfy. An
 * empty list means the owner certified it and the window was admissible.
 * @param {{root?: string, scenario: string, reports?: string}} options
 * @return {string[]}
 */
function certificationShortfalls(options) {
  const root = options.root || REPO_ROOT;
  const sealed = sealedBarFor(root, options.scenario);
  if (!sealed) return [`${options.scenario}${NO_SEALED_BAR}`];
  const aggregate = newestAggregate(root, options.scenario, options.reports);
  if (!aggregate) return [`${options.scenario}${NO_WINDOW}`];
  return arrayMap(
    arrayFilter(windowConditions(aggregate, sealed), (row) => !row[1]),
    (row) => `${SHORTFALL_PREFIX}${row[0]}`);
}

function argumentAfter(argv, flag) {
  const index = arrayIndexOf(argv, flag);
  return index === NOT_PRESENT ? null : argv[index + 1];
}

function main(argv) {
  const scenario = argumentAfter(argv, SCENARIO_FLAG);
  if (!scenario) {
    process.stderr.write(`${USAGE_PREFIX}${SCENARIO_FLAG} ` +
      `<scenario> [${REPORTS_FLAG} <dir>] [${METRIC_FLAG}]${LINE_SEPARATOR}`);
    return EXIT_UNMET;
  }
  const reports = argumentAfter(argv, REPORTS_FLAG) || REPORT_DIRECTORY;
  const shortfalls = certificationShortfalls({scenario, reports});
  if (arrayIncludes(argv, METRIC_FLAG)) {
    process.stdout.write(`${shortfalls.length}${LINE_SEPARATOR}`);
  } else {
    process.stdout.write(`${JSON.stringify({scenario, shortfalls},
      null, JSON_INDENT)}${LINE_SEPARATOR}`);
  }
  return shortfalls.length === 0 ? EXIT_OK : EXIT_UNMET;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(ARGV_OFFSET));
}

export {certificationShortfalls, newestAggregate};
