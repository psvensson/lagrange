#!/usr/bin/env node

// Per-phase projection of one five-node GCP formation-release run: for every
// captured generation and every cohort member it prints the timeline the
// operator otherwise reconstructs by hand from the probe reports —
//   W (window start: the generation's capture)
//   -> handoff observed (the joiner's barrier reports the generation)
//   -> barrier release (ledger_spread_satisfied on the joiner)
//   -> READY (the owner records the joiner in readyNodeIds)
// with deltas from W, plus the generation's classified outcome.
//
// Pure projection over the recorded evidence the closure analyzer already
// classifies (scripts/checks/formation-release-handoff-gcp-analysis.js): the
// outcome, closure verdict and failure reasons are copied from that analyzer
// and never re-derived here; no nodes-status, publication-count or coverage
// signal is consulted (no second ACTIVE/READY authority).
//
// Usage:
//   npm run analyze:formation-release-phases -- <report-dir> [--json]
// where <report-dir> is one per-run directory
// test-output/reports/formation-release-handoff-closure/<timestamp>/ holding
// report.json and full-logs/.

import fs from 'node:fs/promises';
import path from 'node:path';
import {runAnalyzerCliWhenDirect} from '../distributed-analysis-runtime.js';
import {readLogEvents} from './run-formation-release-handoff-gcp.js';
import {
  FORMATION_LOG_EVIDENCE,
  analyzeFormationReleaseEvents,
  normalizeGenerationTransition,
} from './formation-release-handoff-gcp-analysis.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const dateParse = Date.parse;
const numberIsFinite = Number.isFinite;
const objectHasOwn = Object.hasOwn;
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const REPORT_FILENAME = 'report.json';
const LOG_SUBDIR = 'full-logs';
const FIELD_SOURCE_FINGERPRINT = 'sourceFingerprint';
const FIELD_HANDOFF_GENERATION = 'formationReleaseHandoffGeneration';
const FLAG_JSON = '--json';
const FLAG_PREFIX = '--';
const ENCODING_UTF8 = 'utf8';
const NEWLINE = '\n';
const JSON_INDENT = 2;
const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_FRACTION_DIGITS = 3;
const SCHEMA_VERSION = 'formation-release-phases-v1';
const USAGE =
  'usage: npm run analyze:formation-release-phases -- <report-dir> [--json]';
const ERROR_REPORT_UNREADABLE = 'report.json unreadable in';
const NOT_OBSERVED = '-';
const LIST_SEPARATOR = ', ';
const DELTA_PREFIX = '+';
const NODE_ID_ABBREVIATION_LENGTH = 8;
const CLOSURE_PASS = 'PASS';
const CLOSURE_FAIL = 'FAIL';

// Furthest phase a cohort member reached inside its generation's window,
// derived only from which of the three recorded instants exist.
const NODE_PHASE = Object.freeze({
  WINDOW_OPEN: 'window_open',
  HANDOFF_OBSERVED: 'handoff_observed',
  BARRIER_RELEASED: 'barrier_released',
  READY: 'ready',
});

function eventTime(event) {
  const time = dateParse(event[FORMATION_LOG_EVIDENCE.FIELD_TIME]);
  return numberIsFinite(time) ? time : null;
}

function isoTime(ms) {
  return ms === null ? null : new Date(ms).toISOString();
}

function deltaMs(fromMs, toMs) {
  return fromMs === null || toMs === null ? null : toMs - fromMs;
}

// Owner transitions in event order, grouped per generation.
function collectGenerations(events) {
  const byGeneration = new Map();
  for (const event of events) {
    if (event[FORMATION_LOG_EVIDENCE.FIELD_MSG] !==
        FORMATION_LOG_EVIDENCE.TRANSITION_MESSAGE) continue;
    const transition = normalizeGenerationTransition(event);
    if (!transition) continue;
    const list = byGeneration.get(transition.generation) || [];
    list.push(transition);
    byGeneration.set(transition.generation, list);
  }
  return byGeneration;
}

// Barrier events per joiner in event order (time-parsed).
function collectBarrierEvents(events) {
  const byNode = new Map();
  for (const event of events) {
    if (event[FORMATION_LOG_EVIDENCE.FIELD_MSG] !==
        FORMATION_LOG_EVIDENCE.BARRIER_MESSAGE) continue;
    const nodeId = event[FORMATION_LOG_EVIDENCE.FIELD_NODE_ID];
    const time = eventTime(event);
    if (typeof nodeId !== 'string' || time === null) continue;
    const list = byNode.get(nodeId) || [];
    list.push({
      time,
      state: event[FORMATION_LOG_EVIDENCE.FIELD_STATE],
      handoffGeneration: event[FIELD_HANDOFF_GENERATION],
    });
    byNode.set(nodeId, list);
  }
  return byNode;
}

// Earliest recorded instant (ms) among `entries` matching `predicate`; the
// projection renders an unrecorded instant as null / NOT_OBSERVED (the
// evidence carries no such event, it is not a runtime state).
function firstRecordedInstant(entries, predicate) {
  const entry = arrayFind(entries, predicate);
  return entry === undefined ? null : entry.time;
}

function nodePhase(timeline) {
  if (timeline.readyAt !== null) return NODE_PHASE.READY;
  if (timeline.barrierReleasedAt !== null) return NODE_PHASE.BARRIER_RELEASED;
  if (timeline.handoffObservedAt !== null) return NODE_PHASE.HANDOFF_OBSERVED;
  return NODE_PHASE.WINDOW_OPEN;
}

function projectNode(nodeId, generation, transitions, barrierByNode) {
  const barrierEvents = barrierByNode.get(nodeId) || [];
  const windowStartMs = transitions[0].time;
  const handoffObservedMs = firstRecordedInstant(
    barrierEvents,
    (entry) => entry.handoffGeneration === generation,
  );
  const barrierReleasedMs = firstRecordedInstant(
    barrierEvents,
    (entry) => entry.state === FORMATION_LOG_EVIDENCE.BARRIER_RELEASED_STATE,
  );
  // READY is the owner's own record: the first transition of this generation
  // listing the member in readyNodeIds.
  const readyMs = firstRecordedInstant(
    transitions,
    (transition) => arrayIncludes(transition.readyNodeIds, nodeId),
  );
  const timeline = {
    nodeId,
    windowStartAt: isoTime(windowStartMs),
    handoffObservedAt: isoTime(handoffObservedMs),
    barrierReleasedAt: isoTime(barrierReleasedMs),
    readyAt: isoTime(readyMs),
    deltasMs: {
      handoffObserved: deltaMs(windowStartMs, handoffObservedMs),
      barrierReleased: deltaMs(windowStartMs, barrierReleasedMs),
      ready: deltaMs(windowStartMs, readyMs),
    },
  };
  return {...timeline, phase: nodePhase(timeline)};
}

function projectGeneration(generation, transitions, analysis, barrierByNode) {
  const terminal = transitions[transitions.length - 1];
  const classifications = analysis.generationClassifications;
  return {
    generation,
    authorityNodeId: terminal.authorityNodeId,
    capturedAt: isoTime(transitions[0].time),
    terminalState: terminal.state,
    terminalAt: isoTime(terminal.time),
    classification: objectHasOwn(classifications, generation) ?
      classifications[generation] :
      null,
    nodes: arrayMap(terminal.cohortNodeIds, (nodeId) =>
      projectNode(nodeId, generation, transitions, barrierByNode)),
  };
}

/**
 * Project the per-node formation-release phases of one recorded run.
 * @param {Array<Object>} events merged per-node log events (runner order)
 * @param {string} expectedFingerprint the run's deployed source fingerprint
 * @return {Object} phases projection; verdict fields are copied from the
 *   closure analyzer verbatim
 */
function projectFormationReleasePhases(events, expectedFingerprint) {
  const analysis = analyzeFormationReleaseEvents(events, expectedFingerprint);
  const byGeneration = collectGenerations(events);
  const barrierByNode = collectBarrierEvents(events);
  const generations = [];
  const capturedNodeIds = new Set();
  for (const [generation, transitions] of byGeneration) {
    const projected = projectGeneration(
      generation, transitions, analysis, barrierByNode,
    );
    for (const node of projected.nodes) capturedNodeIds.add(node.nodeId);
    generations.push(projected);
  }
  const uncapturedNodeIds = arrayFilter(
    [...barrierByNode.keys()],
    (nodeId) => !capturedNodeIds.has(nodeId),
  );
  return {
    schemaVersion: SCHEMA_VERSION,
    expectedFingerprint,
    closurePassed: analysis.closurePassed,
    failureReasons: analysis.failureReasons,
    completionMs: analysis.completionMs,
    generations,
    uncapturedNodeIds,
  };
}

function formatDelta(ms) {
  if (ms === null) return NOT_OBSERVED;
  return `${DELTA_PREFIX}${(ms / MILLISECONDS_PER_SECOND)
    .toFixed(SECONDS_FRACTION_DIGITS)}s`;
}

function abbreviate(nodeId) {
  return nodeId.slice(0, NODE_ID_ABBREVIATION_LENGTH);
}

function renderNode(node) {
  return `  node ${abbreviate(node.nodeId)}  W ${node.windowStartAt}  ` +
    `handoff ${formatDelta(node.deltasMs.handoffObserved)}  ` +
    `release ${formatDelta(node.deltasMs.barrierReleased)}  ` +
    `READY ${formatDelta(node.deltasMs.ready)}  [${node.phase}]`;
}

function renderText(projection, reportDir) {
  const verdict = projection.closurePassed ? CLOSURE_PASS : CLOSURE_FAIL;
  const lines = [
    `formation-release phases: ${reportDir} ` +
      `(fingerprint ${projection.expectedFingerprint}) closure=${verdict} ` +
      `[${arrayJoin(projection.failureReasons, LIST_SEPARATOR)}] ` +
      `completionMs=${projection.completionMs}`,
  ];
  for (const generation of projection.generations) {
    lines.push(
      `generation ${generation.generation} authority ` +
        `${abbreviate(generation.authorityNodeId)} captured ` +
        `${generation.capturedAt} -> ${generation.classification} ` +
        `(last ${generation.terminalState} ${generation.terminalAt})`,
    );
    for (const node of generation.nodes) lines.push(renderNode(node));
  }
  if (projection.uncapturedNodeIds.length > 0) {
    lines.push(`uncaptured barrier nodes: ${arrayJoin(
      arrayMap(projection.uncapturedNodeIds, abbreviate),
      LIST_SEPARATOR,
    )}`);
  }
  return lines.join(NEWLINE);
}

async function readRunReport(reportDir) {
  const reportPath = path.join(reportDir, REPORT_FILENAME);
  try {
    return jsonParse(await fs.readFile(reportPath, ENCODING_UTF8));
  } catch (error) {
    throw new Error(
      `${ERROR_REPORT_UNREADABLE} ${reportDir}: ${error.message}`,
    );
  }
}

async function runCli(argv) {
  const reportDir = arrayFind(argv, (arg) => !stringStartsWith(arg, FLAG_PREFIX));
  if (!reportDir) return {ok: false, output: USAGE};
  const resolvedDir = path.resolve(reportDir);
  const report = await readRunReport(resolvedDir);
  const events = await readLogEvents(path.join(resolvedDir, LOG_SUBDIR));
  const projection = projectFormationReleasePhases(
    events,
    report[FIELD_SOURCE_FINGERPRINT],
  );
  const output = arrayIncludes(argv, FLAG_JSON) ?
    jsonStringify(projection, null, JSON_INDENT) :
    renderText(projection, reportDir);
  return {ok: true, output};
}

runAnalyzerCliWhenDirect(import.meta.url, runCli);

export {NODE_PHASE, projectFormationReleasePhases, renderText, runCli};
