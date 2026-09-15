// The simulator's report: the live report's shape with an additive,
// versioned formationMetrics object and the formation verdict derived by the
// same pure function the live demo uses (over a synthesised seed log). Every
// collection is sorted before serialisation, the timestamp is virtual, no
// workspace path enters the bytes, and the file is written atomically.

import fs from 'node:fs';
import path from 'node:path';

import {deriveFormationVerdict} from '../../examples/service-data-affinity/formation-verdict.js';

const REPORT_FILE = 'formation-sim.report.json';
const TEMP_SUFFIX = '.tmp';
const SCHEMA_VERSION = 1;
const METRICS_SCHEMA_VERSION = 1;
const SCENARIO = 'formation-sim';
// The producer is a string, as the live report's is.
const PRODUCER = 'formation-sim';
const FIDELITY = 'simulation';
const GAP_LOG_MSG = 'Event loop gap detected';
const ATTRIBUTION_WINDOW_MSG = 'Formation attribution window';
const SITE_PREFIX = 'sim:';
const LOG_LEVEL_WARN = 40;
const LOG_LEVEL_INFO = 30;
const MACHINE_FACTOR_ENV = 'LAGRANGE_TEST_MACHINE_FACTOR';
const MACHINE_FACTOR_ONE = '1';
const TEXT_ENCODING = 'utf8';
const JSON_INDENT = 2;
const DECISION_GRADE = Object.freeze({
  GRADE: 'decision-grade',
  NOT_GRADE: 'not decision-grade',
});

/**
 * Classify a claimed advantage against the calibration's unattributed
 * residual. An advantage no larger than the share of the window no owner
 * claimed is not decision-grade, and the report says so in those words
 * rather than ranking on it (owner amendment 7, 2026-09-14).
 * @param {number} advantagePercent the claimed advantage, in percent
 * @param {number} residualPercent the calibration's unattributed percent
 * @returns {string}
 */
function decisionGrade(advantagePercent, residualPercent) {
  const advantage = Math.abs(Number(advantagePercent));
  const residual = Number(residualPercent);
  if (!Number.isFinite(advantage) || !Number.isFinite(residual)) {
    return DECISION_GRADE.NOT_GRADE;
  }
  return advantage > residual ? DECISION_GRADE.GRADE : DECISION_GRADE.NOT_GRADE;
}

function sortedValue(value) {
  if (Array.isArray(value)) return value.map(sortedValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortedValue(value[key]);
    return out;
  }
  return value;
}

function isoAt(ms) {
  return new Date(ms).toISOString();
}

// The seed log the verdict parses: one warn line per gap, one info line for
// the attribution window; timestamps are virtual.
function synthesiseSeedLog({seedId, gaps, attribution, windowEndedAtMs}) {
  const lines = gaps.map((gap) => JSON.stringify({
    level: LOG_LEVEL_WARN, time: isoAt(gap.atMs), nodeId: seedId, gapMs: gap.gapMs,
    unexplainedMs: gap.gapMs,
    siteDeltas: Object.keys(gap.owners).sort().map((owner) =>
      ({site: `${SITE_PREFIX}${owner}`, count: 1, totalMs: gap.owners[owner]})),
    msg: GAP_LOG_MSG,
  }));
  lines.push(JSON.stringify({
    level: LOG_LEVEL_INFO, time: isoAt(windowEndedAtMs), nodeId: seedId,
    reason: attribution.reason, attribution: attribution.snapshot,
    msg: ATTRIBUTION_WINDOW_MSG,
  }));
  return lines.join('\n');
}

/**
 * Build the report object from the simulation outcome.
 * @param {object} outcome see formation-sim-runner
 * @returns {object}
 */
function buildReport(outcome) {
  const seedLogText = synthesiseSeedLog({
    seedId: outcome.seedId, gaps: outcome.seedGaps, attribution: outcome.attribution,
    windowEndedAtMs: outcome.windowEndedAtMs,
  });
  const formationVerdict = deriveFormationVerdict({
    seedLogText,
    schemaAdmission: outcome.schemaAdmission,
    formation: {
      clusterStartedAtMs: outcome.formationStartedAtMs,
      clusterFormedAtMs: outcome.clusterFormedAtMs,
    },
    environment: {[MACHINE_FACTOR_ENV]: MACHINE_FACTOR_ONE},
  });
  return sortedValue({
    schemaVersion: SCHEMA_VERSION,
    scenario: SCENARIO,
    producer: PRODUCER,
    fidelity: FIDELITY,
    // Proof eligibility travels with the artifact. A run that recorded an
    // ambient production seam, or that ran in migration-discovery mode, can
    // never contribute deterministic proof, and every certification consumer
    // reads this rather than trusting the caller.
    proofEligibility: outcome.proofEligibility || null,
    timestamp: isoAt(outcome.windowEndedAtMs),
    formationMetrics: {
      schemaVersion: METRICS_SCHEMA_VERSION,
      identities: outcome.identities,
      formationStartedAtMs: outcome.formationStartedAtMs,
      quorumAtMs: outcome.quorumAtMs,
      fifthJoinAtMs: outcome.fifthJoinAtMs,
      allReadyLeaseCompleteAtMs: outcome.allReadyLeaseCompleteAtMs,
      clusterFormedAtMs: outcome.clusterFormedAtMs,
      nodes: outcome.nodes,
      groups: outcome.groups,
      readinessObservations: outcome.readinessObservations,
      spreadObservations: outcome.spreadObservations,
      admissionTransitions: outcome.admissionTransitions,
      // Causally runnable deterministic events left at the scenario boundary.
      // Anything but zero means the run ended mid-causality.
      strandedEvents: outcome.strandedEvents,
      calibrationResidual: {
        unattributedPercent: outcome.residualPercent,
        priced: false,
        rule: 'an advantage inside this band is not decision-grade',
      },
    },
    formationVerdict,
  });
}

/**
 * Write the report atomically into a directory.
 * @param {string} directory
 * @param {object} report
 * @returns {string} the report path
 */
function writeReport(directory, report) {
  fs.mkdirSync(directory, {recursive: true});
  const target = path.join(directory, REPORT_FILE);
  const temporary = `${target}${TEMP_SUFFIX}`;
  fs.writeFileSync(temporary, `${JSON.stringify(report, null, JSON_INDENT)}\n`, TEXT_ENCODING);
  fs.renameSync(temporary, target);
  return target;
}

export {DECISION_GRADE, REPORT_FILE, buildReport, decisionGrade, writeReport};
