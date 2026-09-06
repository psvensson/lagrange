// Bounded certification streak for the five-node GCP formation-release
// handoff runner (`--runs N`). The sealed doneWhen of the closure quest is a
// scenario-harness probe over the most recent `consecutive` fixed-lane
// reports; the operator used to drive those N runs with an ad-hoc shell loop.
// This module runs exactly N fixed-arm runs where N MUST equal the sealed
// `consecutive` count, refuses (typed) before any run when `src/` is dirty or
// the candidate fingerprint drifted since run 1, stops at the first failed
// run (no retry, never run-until-pass), and writes an aggregate streak report
// that is a PROJECTION of the per-run reports only. The per-run analyzer
// verdicts stay the only verdicts; the probe still reads the per-run reports;
// the reverted-control lane is untouched (the streak refuses it).
//
// The live cloud execution is a dependency (`runOnce`) supplied by the runner
// so deterministic tests drive the mode with a fake run and never touch the
// cloud (TEST-0118/TEST-0160: a gate is certification, never the loop).

import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {computeSourceFingerprint} from
  '../../src/diagnostics/source-fingerprint.js';
import {readQuest} from '../solve/store.js';

const arrayIsArray = Array.isArray;
const dateToISOString = Function.call.bind(Date.prototype.toISOString);
const jsonStringify = JSON.stringify;
const numberIsSafeInteger = Number.isSafeInteger;
const objectHasOwn = Object.hasOwn;
const stringConstructor = String;
const stringReplaceAll = Function.call.bind(String.prototype.replaceAll);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// The sealed streak requirement lives in the closure quest's doneWhen; the
// runner never restates the number, it reads the seal. The quest is named by
// id: `scripts/solve/store.js` owns where a quest lives on disk, so this
// runner carries no quest-layout knowledge of its own.
const SEALED_QUEST_ID = 'formation-release-handoff-closure-v4';
const FIELD_DONE_WHEN = 'doneWhen';
const FIELD_ARGS = 'args';
const FIELD_SCENARIO = 'scenario';
const FIELD_CONSECUTIVE = 'consecutive';
const FIELD_ANALYSIS = 'analysis';
const FIELD_FAILURE_REASONS = 'failureReasons';
const FIELD_CLOSURE_PASSED = 'closurePassed';
const STREAK_MODE = 'bounded-streak';
const STREAK_REPORT_SCHEMA_VERSION = 1;
const STREAK_REPORT_DIR_PREFIX = 'streak-';
const STREAK_REPORT_FILENAME = 'streak.json';
const RUNS_FLAG = '--runs';
const RUNS_FLAG_WITH_EQUALS = '--runs=';
const FIXED_VARIANT = 'fixed';
const FIRST_RUN_INDEX = 1;
const GIT_COMMAND = 'git';
const GIT_STATUS_ARGS = Object.freeze(['status', '--porcelain', '--', 'src']);
const SOURCE_SUBDIR = 'src';
const NEWLINE_SEPARATOR = '\n';
const EMPTY_STRING = '';
const TIME_SEPARATOR = ':';
const TIME_SEPARATOR_SAFE = '-';
const JSON_INDENT = 2;
const EMPTY_LIST = Object.freeze([]);

// Terminal outcome of one bounded streak invocation (system-guidelines §4.5):
// completed means every requested run executed; every other outcome names
// the single reason the loop stopped early. None of these is a pass/fail
// verdict over the certification — the probe owns that.
const STREAK_OUTCOME = Object.freeze({
  COMPLETED: 'completed',
  ABORTED_DIRTY_SOURCE: 'aborted_dirty_source',
  ABORTED_FINGERPRINT_CHANGED: 'aborted_fingerprint_changed',
  ABORTED_RUN_FAILED: 'aborted_run_failed',
});
// Typed refusal reasons raised BEFORE the first run.
const STREAK_REFUSAL = Object.freeze({
  RUN_COUNT_NOT_SEALED: 'run_count_not_sealed_consecutive',
  VARIANT_NOT_FIXED: 'streak_requires_fixed_variant',
  SEAL_UNREADABLE: 'sealed_consecutive_unreadable',
  SEAL_SCENARIO_MISMATCH: 'sealed_scenario_mismatch',
});

// Pre-run admission of one streak run: a single typed state (system
// guidelines §4.1.1) mapped to the streak outcome it halts with.
const RUN_ADMISSION = Object.freeze({
  ADMITTED: 'admitted',
  DIRTY_SOURCE: 'dirty_source',
  FINGERPRINT_CHANGED: 'fingerprint_changed',
});
// Why the run loop halted; NONE means every requested run executed.
const STREAK_HALT = Object.freeze({
  NONE: 'none',
  DIRTY_SOURCE: RUN_ADMISSION.DIRTY_SOURCE,
  FINGERPRINT_CHANGED: RUN_ADMISSION.FINGERPRINT_CHANGED,
  RUN_FAILED: 'run_failed',
});
const HALT_OUTCOME = Object.freeze({
  [STREAK_HALT.NONE]: STREAK_OUTCOME.COMPLETED,
  [STREAK_HALT.DIRTY_SOURCE]: STREAK_OUTCOME.ABORTED_DIRTY_SOURCE,
  [STREAK_HALT.FINGERPRINT_CHANGED]:
    STREAK_OUTCOME.ABORTED_FINGERPRINT_CHANGED,
  [STREAK_HALT.RUN_FAILED]: STREAK_OUTCOME.ABORTED_RUN_FAILED,
});
const STREAK_REFUSAL_ERROR_NAME = 'StreakRefusalError';
const REFUSAL_MESSAGE_PREFIX = 'bounded streak refused';
const VARIANT_REFUSAL_DETAIL =
  'is not the fixed lane; the reverted control runs one at a time';

class StreakRefusalError extends Error {
  constructor(reason, detail) {
    super(`${REFUSAL_MESSAGE_PREFIX}: ${reason}: ${detail}`);
    this.name = STREAK_REFUSAL_ERROR_NAME;
    this.reason = reason;
  }
}

// `--runs N` / `--runs=N` -> requested run count, or null when the flag is
// absent (single-run mode). A malformed value is returned as-is (NaN) so the
// sealed-count refusal names it instead of silently falling back.
function resolveStreakRunCount(argv = process.argv.slice(2)) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === RUNS_FLAG) {
      return Number(argv[index + 1]);
    }
    if (stringStartsWith(arg, RUNS_FLAG_WITH_EQUALS)) {
      return Number(arg.slice(RUNS_FLAG_WITH_EQUALS.length));
    }
  }
  return null;
}

function readOwn(target, field) {
  return target && typeof target === 'object' && objectHasOwn(target, field) ?
    target[field] :
    undefined;
}

// Read the sealed `consecutive` count for the certification scenario from the
// closure quest's doneWhen. Refuses when the seal is unreadable or names a
// different scenario than the runner's certification lane.
async function readSealedConsecutive({
  root = ROOT, questId = SEALED_QUEST_ID, scenario,
}) {
  let quest;
  try {
    quest = readQuest(root, questId);
  } catch (error) {
    throw new StreakRefusalError(
      STREAK_REFUSAL.SEAL_UNREADABLE,
      `${questId}: ${stringConstructor(error.message || error)}`,
    );
  }
  const args = readOwn(readOwn(quest, FIELD_DONE_WHEN), FIELD_ARGS);
  const sealedScenario = readOwn(args, FIELD_SCENARIO);
  const consecutive = readOwn(args, FIELD_CONSECUTIVE);
  if (sealedScenario !== scenario) {
    throw new StreakRefusalError(
      STREAK_REFUSAL.SEAL_SCENARIO_MISMATCH,
      `${questId} seals ${stringConstructor(sealedScenario)}, ` +
        `runner certifies ${scenario}`,
    );
  }
  if (!numberIsSafeInteger(consecutive) || consecutive <= 0) {
    throw new StreakRefusalError(
      STREAK_REFUSAL.SEAL_UNREADABLE,
      `${questId} doneWhen.args.consecutive is not a positive integer`,
    );
  }
  return consecutive;
}

// Default `src/` dirtiness reader: porcelain git status scoped to src/.
function readSourceDirtyPaths() {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(GIT_COMMAND, GIT_STATUS_ARGS, {cwd: ROOT}, (error, stdout) => {
      if (error) {
        rejectPromise(error);
        return;
      }
      const lines = stringSplit(stringTrim(stringConstructor(stdout)),
        NEWLINE_SEPARATOR);
      resolvePromise(lines[0] === EMPTY_STRING ? [] : lines);
    });
  });
}

function computeCandidateFingerprint() {
  return computeSourceFingerprint(path.join(ROOT, SOURCE_SUBDIR));
}

// One projected entry per executed run, copied from the per-run report the
// runner already wrote (never recomputed here).
function projectRunEntry(runIndex, executed) {
  const report = executed.report;
  const analysis = readOwn(report, FIELD_ANALYSIS);
  const failureReasons = readOwn(analysis, FIELD_FAILURE_REASONS);
  return {
    run: runIndex,
    report: executed.reportPath,
    probeReport: executed.probeReportPath,
    passed: report.passed === true,
    clusterStartPassed: report.clusterStartPassed === true,
    closurePassed: readOwn(analysis, FIELD_CLOSURE_PASSED) === true,
    failureReasons: arrayIsArray(failureReasons) ? failureReasons : EMPTY_LIST,
    sourceFingerprint: report.sourceFingerprint,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
  };
}

// Pre-run admission for run `runIndex`: collect the src/ dirtiness and the
// candidate fingerprint, then emit ONE typed admission state. Run 1 pins the
// candidate fingerprint; every later run must observe the same one.
async function evaluateRunAdmission(runIndex, state, dependencies) {
  const dirtyPaths = await dependencies.readDirtyPaths();
  const fingerprint = await dependencies.computeFingerprint();
  if (runIndex === FIRST_RUN_INDEX) state.candidateFingerprint = fingerprint;
  const drifted = fingerprint !== state.candidateFingerprint;
  const admission = dirtyPaths.length > 0 ?
    RUN_ADMISSION.DIRTY_SOURCE :
    (drifted ? RUN_ADMISSION.FINGERPRINT_CHANGED : RUN_ADMISSION.ADMITTED);
  return {admission, dirtyPaths, fingerprint};
}

function admissionAbortDetail(runIndex, state, evaluated) {
  return evaluated.admission === RUN_ADMISSION.DIRTY_SOURCE ?
    {run: runIndex, dirtyPaths: evaluated.dirtyPaths} :
    {
      run: runIndex,
      candidateFingerprint: state.candidateFingerprint,
      observedFingerprint: evaluated.fingerprint,
    };
}

// The bounded loop: at most `runs` runs, halting on the first refused
// admission or failed per-run verdict (no retry, never run-until-pass).
async function executeStreak(runs, state, dependencies) {
  let halt = STREAK_HALT.NONE;
  let abortDetail = null;
  for (let runIndex = FIRST_RUN_INDEX; runIndex <= runs; runIndex += 1) {
    const evaluated = await evaluateRunAdmission(runIndex, state, dependencies);
    if (evaluated.admission !== RUN_ADMISSION.ADMITTED) {
      halt = evaluated.admission;
      abortDetail = admissionAbortDetail(runIndex, state, evaluated);
      break;
    }
    const executed = await dependencies.runOnce(runIndex);
    const entry = projectRunEntry(runIndex, executed);
    state.entries[state.entries.length] = entry;
    if (!entry.passed) {
      halt = STREAK_HALT.RUN_FAILED;
      abortDetail = {run: runIndex, failureReasons: entry.failureReasons};
      break;
    }
  }
  return {outcome: HALT_OUTCOME[halt], abortDetail};
}

async function writeStreakReport(streak, reportRoot) {
  const dirName = STREAK_REPORT_DIR_PREFIX + stringReplaceAll(
    streak.startedAt,
    TIME_SEPARATOR,
    TIME_SEPARATOR_SAFE,
  );
  const streakPath = path.join(reportRoot, dirName, STREAK_REPORT_FILENAME);
  await fs.mkdir(path.dirname(streakPath), {recursive: true});
  await fs.writeFile(
    streakPath,
    `${jsonStringify(streak, null, JSON_INDENT)}${NEWLINE_SEPARATOR}`,
  );
  return streakPath;
}

/**
 * Run the bounded certification streak.
 * @param {Object} options
 * @param {number} options.runs requested run count (must equal the seal)
 * @param {string} options.variant runner variant (only `fixed` is admitted)
 * @param {string} options.scenario sealed certification scenario name
 * @param {string} options.reportRoot directory receiving the streak report
 * @param {string} [options.questRoot] repository root holding the sealed quest
 * @param {Object} dependencies
 * @param {Function} dependencies.runOnce (runIndex) => Promise<{report,
 *   reportPath, probeReportPath}> — the live single-run execution
 * @param {Function} [dependencies.readDirtyPaths] () => Promise<string[]>
 * @param {Function} [dependencies.computeFingerprint] () => Promise<string>
 * @return {Promise<{streak: Object, streakPath: string}>}
 */
async function runBoundedStreak(options, dependencies) {
  const scenario = options.scenario;
  const questRoot = options.questRoot || ROOT;
  if (options.variant !== FIXED_VARIANT) {
    throw new StreakRefusalError(
      STREAK_REFUSAL.VARIANT_NOT_FIXED,
      `variant ${stringConstructor(options.variant)} ${VARIANT_REFUSAL_DETAIL}`,
    );
  }
  const sealedConsecutive = await readSealedConsecutive({
    root: questRoot, scenario,
  });
  if (options.runs !== sealedConsecutive) {
    throw new StreakRefusalError(
      STREAK_REFUSAL.RUN_COUNT_NOT_SEALED,
      `--runs ${stringConstructor(options.runs)} must equal the sealed ` +
        `consecutive count ${sealedConsecutive} (${SEALED_QUEST_ID})`,
    );
  }
  const resolved = {
    runOnce: dependencies.runOnce,
    readDirtyPaths: dependencies.readDirtyPaths || readSourceDirtyPaths,
    computeFingerprint:
      dependencies.computeFingerprint || computeCandidateFingerprint,
  };
  const startedAt = dateToISOString(new Date());
  const state = {candidateFingerprint: null, entries: []};
  const result = await executeStreak(options.runs, state, resolved);
  let passedRunCount = 0;
  for (let index = 0; index < state.entries.length; index += 1) {
    if (state.entries[index].passed) passedRunCount += 1;
  }
  const streak = {
    schemaVersion: STREAK_REPORT_SCHEMA_VERSION,
    mode: STREAK_MODE,
    scenario,
    sealedQuest: SEALED_QUEST_ID,
    sealedConsecutive,
    requestedRuns: options.runs,
    candidateFingerprint: state.candidateFingerprint,
    startedAt,
    finishedAt: dateToISOString(new Date()),
    outcome: result.outcome,
    abortDetail: result.abortDetail,
    executedRunCount: state.entries.length,
    passedRunCount,
    runs: state.entries,
  };
  const streakPath = await writeStreakReport(streak, options.reportRoot);
  return {streak, streakPath};
}

export {
  STREAK_OUTCOME,
  STREAK_REFUSAL,
  StreakRefusalError,
  readSealedConsecutive,
  resolveStreakRunCount,
  runBoundedStreak,
};
