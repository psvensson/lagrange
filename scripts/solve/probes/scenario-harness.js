// Scenario-harness probe — reads distributed harness reports
// (`test-output/reports/*.report.json`) and answers the two independent questions for
// a named scenario:
//
//   done   = the scenario passed in the most recent `consecutive` distinct runs
//            (flake-proofing for stabilization goals)
//   metric = a lower-is-better progress gradient that is INDEPENDENT of done:
//            the number of outstanding priority items (default), or the report's
//            failed-scenario count. This lets the loop see progress (e.g. 3 -> 1
//            outstanding issues) before the scenario fully flips to passing.
//
// evidence = the report file the answer was read from.

import fs from 'node:fs';
import path from 'node:path';

import {NON_MEASURING_VERDICT_REASONS} from '../constants.js';

const DEFAULT_REPORT_DIR = 'test-output/reports';
const REPORT_EXT = '.report.json';
const METRIC_PRIORITY = 'priority';
const METRIC_FAILED = 'failed';
const METRIC_DISTANCE = 'distance';
const DEFAULT_CONSECUTIVE = 1;
const DISTANCE_PRIORITY_WEIGHT = 100;
const DISTANCE_SPREAD_WEIGHT = 5;

function safeRead(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function scenarioEntry(data, scenario) {
  const directScenarios = Array.isArray(data?.scenarios) ? data.scenarios : [];
  const standardScenarios = Array.isArray(data?.standardSummary?.scenarios) ?
    data.standardSummary.scenarios :
    [];
  return [...directScenarios, ...standardScenarios]
    .find((s) => s?.scenario === scenario) || null;
}

function reportCoversScenario(data, scenario) {
  return scenarioEntry(data, scenario) !== null;
}

function scenarioPassed(data, scenario) {
  const entry = scenarioEntry(data, scenario);
  if (typeof entry?.passed === 'boolean') return entry.passed;
  if (entry?.current && typeof entry.current.passed === 'boolean') {
    return entry.current.passed;
  }
  return data?.summary?.failed === 0;
}

function failureCandidate(data, scenario) {
  const entry = scenarioEntry(data, scenario);
  return entry?.details?.diagnostics?.failure ||
    entry?.details?.failure ||
    entry?.failureBundle?.summary ||
    entry?.failureClassification ||
    data?.failureBundle?.summary ||
    null;
}

function classification(data, scenario) {
  const entry = scenarioEntry(data, scenario);
  const failure = failureCandidate(data, scenario);
  return {
    verdict: entry?.current?.verdict || entry?.verdict || null,
    verdictReason: entry?.current?.verdictReason || entry?.verdictReason || null,
    rootCauseClass:
      failure?.rootCauseClass ||
      entry?.rootCauseClass ||
      entry?.failureClassification?.rootCauseClass ||
      null,
    dominantReason:
      failure?.dominantReason ||
      entry?.dominantReason ||
      entry?.failureClassification?.dominantReason ||
      null,
    owner: null,
    boundary: null,
  };
}

// Did the latest run record an unexpected node exit — a process that died mid-scenario?
// This is a DIFFERENT failure class than the topology/convergence rootCauseClass the run
// otherwise reports: a crash confounds the convergence signal, and the report's
// dominantReason (e.g. publication_missing_active_node) can MASK it. Surfaced separately
// so the Solver treats the crash as its own blocker to rule out, instead of crediting a
// convergence theory on a run where a node actually died.
export function unexpectedNodeExit(data, scenario) {
  const entry = scenarioEntry(data, scenario);
  if (!entry) return null;
  const exits = Array.isArray(entry.unexpectedNodeExits) ? entry.unexpectedNodeExits :
    Array.isArray(entry.details?.diagnostics?.unexpectedNodeExits) ?
      entry.details.diagnostics.unexpectedNodeExits : [];
  const present = entry.classification === 'unexpected_node_exit' || exits.length > 0;
  if (!present) return null;
  const nodes = exits
    .map((e) => e?.nodeId || e?.id || e?.node || null)
    .filter(Boolean);
  return {present: true, count: exits.length, nodes};
}

function safeMtimeMs(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch (_error) {
    return 0;
  }
}

// Most-recent-first, de-duplicated by run timestamp so re-read/identical reports do
// not inflate the "consecutive distinct runs" count.
//
// BOUNDED ON PURPOSE: gate reports embed run playback and can be 100s of MB each (the
// directory routinely holds GBs of them). The probe only ever consumes the newest
// `limit` runs (the latest drives the metric; `done`/streak read the top `consecutive`),
// so parsing every report at once just to sort by timestamp would OOM for no gain. We
// order candidate files by mtime — a free, reliable proxy for run recency — then parse
// lazily one at a time, stopping as soon as we have `limit` distinct-timestamp covering
// runs. The materialized set is then re-sorted by the authoritative in-report timestamp
// so `runs[0]` is exactly the latest even if mtime and logical timestamp disagree.
function listRuns(dir, scenario, limit = DEFAULT_CONSECUTIVE) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith(REPORT_EXT))
    .map((f) => path.join(dir, f))
    .map((file) => ({file, mtimeMs: safeMtimeMs(file)}))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  const runs = [];
  const seen = new Set();
  for (const {file} of files) {
    if (runs.length >= limit) break;
    const data = safeRead(file);
    if (!data || !reportCoversScenario(data, scenario)) continue;
    const key = data.timestamp || file;
    if (seen.has(key)) continue;
    seen.add(key);
    runs.push({file, data});
  }
  return runs.sort((a, b) => String(b.data.timestamp || '')
    .localeCompare(String(a.data.timestamp || '')));
}

function verdictReasonOf(data, scenario) {
  const entry = scenarioEntry(data, scenario);
  return entry?.current?.verdictReason || entry?.verdictReason || null;
}

// A run is "non-measuring" when its metric cannot be trusted because the run was
// incomplete/blocked before producing numbers. Keyed on the reason code (not the
// verdict) so a completed-but-failing run with a real outstanding-item count is still
// a valid sample.
function isNonMeasuringRun(data, scenario) {
  const reason = verdictReasonOf(data, scenario);
  return reason !== null && NON_MEASURING_VERDICT_REASONS.includes(reason);
}

function failedCount(data) {
  return Number.isInteger(data?.summary?.failed) ? data.summary.failed : null;
}

// Collapse all stabilityGates[*].evidence objects on a scenario entry into a single
// flat bag so the distance metric and ratchet can read missingPublishedCount /
// prioritySpreadPending regardless of which gate carried them.
function stabilityEvidence(entry) {
  const gates = entry?.stabilityGates || {};
  const out = {};
  for (const key of Object.keys(gates)) {
    const ev = gates[key]?.evidence;
    if (ev && typeof ev === 'object') Object.assign(out, ev);
  }
  return out;
}

// The set of sub-invariant labels a report shows as GREEN for a scenario. Drawn from
// per-invariant pass flags plus synthetic convergence flags. This is the monotonic
// ratchet source: once a label appears here it must keep appearing or it has regressed.
export function extractSatisfiedInvariants(data, scenario) {
  const entry = scenarioEntry(data, scenario);
  if (!entry) return [];
  const set = new Set();
  const invariants = entry?.priorityRecoveryInvariants?.invariants;
  if (Array.isArray(invariants)) {
    for (const inv of invariants) {
      const id = inv?.invariantId || inv?.id;
      if (id && inv?.passed === true) set.add(id);
    }
  }
  const ev = stabilityEvidence(entry);
  if (ev.missingPublishedCount === 0) set.add('publication_converged');
  if (ev.prioritySpreadPending === false) set.add('priority_spread_settled');
  if (entry?.invariantBreaches?.totalCount === 0) set.add('no_invariant_breaches');
  return [...set];
}

function distinctFailingInvariants(data, scenario) {
  const entry = scenarioEntry(data, scenario);
  const invariants = entry?.priorityRecoveryInvariants?.invariants;
  if (!Array.isArray(invariants)) return 0;
  return invariants.filter((inv) => inv?.passed === false).length;
}

// Composite lower-is-better distance: a weighted gradient that keeps moving even when
// the priority count flaps 0/1. Falls back to null (non-measuring) when the base
// priority count is unavailable, matching the priority metric's validity rule.
export function distanceMetricFromReport(data, scenario, opts = {}) {
  const priority = readMetric(data, METRIC_PRIORITY);
  if (priority === null) return null;
  const ev = stabilityEvidence(scenarioEntry(data, scenario) || {});
  const missing = Number.isInteger(ev.missingPublishedCount) ?
    ev.missingPublishedCount : 0;
  const spread = ev.prioritySpreadPending === true ? DISTANCE_SPREAD_WEIGHT : 0;
  const failing = distinctFailingInvariants(data, scenario);
  const streakTerm = Number.isInteger(opts.streakTerm) ?
    Math.max(0, opts.streakTerm) : 0;
  return priority * DISTANCE_PRIORITY_WEIGHT + missing + spread + failing + streakTerm;
}

// Count of the most-recent consecutive runs that both measure and pass (a clean
// streak), most-recent-first. Feeds the R5 streak term so distance shrinks as the
// quest builds toward the consecutive-pass goal instead of re-hitting a single zero.
function cleanStreak(runs, scenario, metricKind) {
  let streak = 0;
  for (const run of runs) {
    if (!isInvalidMetricSample(run.data, scenario, metricKind) &&
      scenarioPassed(run.data, scenario)) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

function readMetric(data, kind) {
  if (kind === METRIC_FAILED) return failedCount(data);
  const items = data?.optimizationSummary?.totalPriorityItems;
  return Number.isInteger(items) ? items : failedCount(data);
}

function isInvalidMetricSample(data, scenario, kind) {
  return isNonMeasuringRun(data, scenario) || readMetric(data, kind) === null;
}

// Classify a single already-written report file as a non-measuring (invalid) sample for
// a scenario. Shared with the reopen gate so the "was this run trustworthy?" question
// has exactly one definition. A missing/unreadable report, or one that does not cover
// the scenario, is NOT treated as invalid evidence (we cannot make a claim about it).
export function reportSampleIsNonMeasuring(file, args = {}) {
  const data = safeRead(file);
  if (!data) return false;
  const scenario = args.scenario;
  if (!reportCoversScenario(data, scenario)) return false;
  const metricKind = args.metric === METRIC_FAILED ? METRIC_FAILED : METRIC_PRIORITY;
  return isInvalidMetricSample(data, scenario, metricKind);
}

export const scenarioHarnessProbe = {
  name: 'scenario-harness',
  measure(args) {
    const dir = args.reportDir || DEFAULT_REPORT_DIR;
    const scenario = args.scenario;
    const consecutive = Number(args.consecutive) || DEFAULT_CONSECUTIVE;
    const metricKind = args.metric === METRIC_FAILED ? METRIC_FAILED :
      args.metric === METRIC_DISTANCE ? METRIC_DISTANCE : METRIC_PRIORITY;
    const runs = listRuns(dir, scenario, consecutive);
    if (runs.length === 0) {
      return {
        metric: null,
        done: false,
        evidence: null,
        invalidSample: true,
        satisfiedInvariants: [],
      };
    }
    const latest = runs[0];
    const recent = runs.slice(0, consecutive);
    // done requires each counted run to BOTH measure and pass: a blocked/incomplete
    // run inside the window breaks the consecutive streak instead of masquerading as
    // a pass-adjacent zero.
    const done = recent.length >= consecutive &&
      recent.every((r) =>
        !isInvalidMetricSample(r.data, scenario, metricKind) &&
          scenarioPassed(r.data, scenario));
    let rawMetric;
    if (metricKind === METRIC_DISTANCE) {
      const streak = cleanStreak(runs, scenario, METRIC_PRIORITY);
      rawMetric = distanceMetricFromReport(latest.data, scenario, {
        streakTerm: consecutive - streak,
      });
    } else {
      rawMetric = readMetric(latest.data, metricKind);
    }
    // An incomplete run reports null metric: the honesty layer treats this as an
    // honest "no measurement" (not dishonest data) and the ladder treats it as a
    // stall, so it climbs rather than registering a false improvement.
    const invalidSample = isInvalidMetricSample(latest.data, scenario, metricKind);
    return {
      metric: invalidSample ? null : rawMetric,
      done,
      evidence: latest.file,
      invalidSample,
      satisfiedInvariants: extractSatisfiedInvariants(latest.data, scenario),
      classification: classification(latest.data, scenario),
      nodeExit: unexpectedNodeExit(latest.data, scenario),
      detail: {
        runs: runs.length,
        verdict: scenarioEntry(latest.data, scenario)?.current?.verdict || null,
        verdictReason: verdictReasonOf(latest.data, scenario),
        invalidSample,
      },
    };
  },
};
