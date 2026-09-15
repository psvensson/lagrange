#!/usr/bin/env node
/**
 * formation-sim reproduction probe (`formation-sim` quest, epic
 * formation-seed-decoupling).
 *
 *   node scripts/checks/formation-sim-reproduces.js [--seed <n>] [--explain]
 *
 * Runs the deterministic five-node cold-formation simulator twice, in two
 * separate temporary directories, on one fixed seed, and prints the number
 * of reproduction conditions that do not hold (the quest probe; target 0):
 *
 *   1. the two reports are byte-identical (same seed, same bytes);
 *   2. seed event-loop gap fraction is at least 50 % of the formation window
 *      and every joiner is below 5 %;
 *   3. incomplete-lease observations name all five nodes and the backoff
 *      escalates;
 *   4. prioritySpreadGap is non-decreasing with zero operations in flight
 *      through the modelled failure window;
 *   5. admission ends in control_plane_pressure;
 *   6. one run completes in under 60 s of real time.
 *
 * With no simulator entry point in the tree every condition is unmet (6).
 * The probe reads the report the simulator writes; it never edits it, and it
 * starts no process other than the simulator itself, which is in-process and
 * deterministic by contract (no network, no child processes, no wall clock).
 */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SIMULATOR_ENTRY = 'test/simulation/formation-sim-runner.js';
const REPORT_FILE = 'formation-sim.report.json';
const DEFAULT_SEED = 1;
const NODE_COUNT = 5;
const RUNS = 2;
const REAL_TIME_BUDGET_MS = 60 * 1000;
const SEED_GAP_FRACTION_MIN = 0.5;
const JOINER_GAP_FRACTION_MAX = 0.05;
const ADMISSION_TERMINAL_STATE = 'control_plane_pressure';
const HASH_ALGORITHM = 'sha256';
const TEXT_ENCODING = 'utf8';
const TEMP_PREFIX = 'formation-sim-';
const ARG = Object.freeze({SEED: '--seed', EXPLAIN: '--explain', OUTPUT: '--output'});
const CONDITION = Object.freeze({
  IDENTICAL: 'two runs of one seed hash identical',
  SEED_STARVED: 'seed gap fraction >= 50 %, every joiner < 5 %',
  LEASES: 'incomplete-lease observations name all five nodes with escalating backoff',
  SPREAD: 'prioritySpreadGap non-decreasing with zero operations in flight',
  ADMISSION: `admission ends in ${ADMISSION_TERMINAL_STATE}`,
  REAL_TIME: `one run completes in under ${REAL_TIME_BUDGET_MS / 1000} s`,
});
const CONDITIONS = Object.freeze(Object.values(CONDITION));
const LABEL = Object.freeze({
  NO_REPORT: 'no report', UNMET: 'UNMET', MET: 'ok   ', LIST_SEPARATOR: ' ',
});

function parseArguments(argv) {
  const options = {seed: DEFAULT_SEED, explain: false};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === ARG.SEED) {
      options.seed = Number(argv[index + 1]);
      index += 1;
    } else if (argv[index] === ARG.EXPLAIN) {
      options.explain = true;
    }
  }
  return options;
}

function runSimulator(seed, outputDir) {
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [SIMULATOR_ENTRY, ARG.SEED, String(seed),
    ARG.OUTPUT, outputDir], {cwd: REPO_ROOT, encoding: TEXT_ENCODING,
    timeout: REAL_TIME_BUDGET_MS * RUNS});
  const elapsedMs = Date.now() - startedAt;
  const reportPath = path.join(outputDir, REPORT_FILE);
  const bytes = fs.existsSync(reportPath) ? fs.readFileSync(reportPath) : null;
  return {status: result.status, elapsedMs, bytes, stderr: result.stderr || ''};
}

function metricsOf(bytes) {
  try {
    return JSON.parse(bytes.toString(TEXT_ENCODING)).formationMetrics || null;
  } catch {
    return null;
  }
}

function gapFraction(node) {
  return Number(node?.eventLoopGapMs) / Number(node?.windowMs);
}

// The signature predicate over one report's formationMetrics.
function unmetSignature(metrics) {
  const unmet = [];
  const nodes = Array.isArray(metrics?.nodes) ? metrics.nodes : [];
  const seed = arrayFind(nodes, (node) => node?.role === 'seed') || null;
  const joiners = arrayFilter(nodes, (node) => node?.role === 'joiner');
  if (!seed || !(gapFraction(seed) >= SEED_GAP_FRACTION_MIN) ||
    joiners.length !== NODE_COUNT - 1 ||
    !arrayEvery(joiners, (node) => gapFraction(node) < JOINER_GAP_FRACTION_MAX)) {
    unmet.push(CONDITION.SEED_STARVED);
  }
  const leases = Array.isArray(metrics?.readinessObservations) ? metrics.readinessObservations : [];
  const named = new Set();
  for (const observation of leases) {
    for (const id of observation?.unreadyNodeIds || []) named.add(id);
  }
  // Escalating backoff: never decreasing, and strictly larger at least once.
  const backoffs = arrayMap(leases, (observation) => Number(observation?.backoffMs));
  const escalates = backoffs.length > 1 &&
    arrayEvery(backoffs, (value, index) => index === 0 || value >= backoffs[index - 1]) &&
    arraySome(backoffs, (value, index) => index > 0 && value > backoffs[index - 1]);
  if (named.size !== NODE_COUNT || !escalates) unmet.push(CONDITION.LEASES);
  const spread = Array.isArray(metrics?.spreadObservations) ? metrics.spreadObservations : [];
  const nonDecreasing = spread.length > 0 && arrayEvery(spread, (observation, index) =>
    index === 0 || Number(observation?.prioritySpreadGap) >=
      Number(spread[index - 1]?.prioritySpreadGap));
  const idle = spread.length > 0 &&
    arrayEvery(spread, (observation) => Number(observation?.inFlightCount) === 0);
  // Stuck means open: the gap must end above zero, or nothing was stuck.
  const stuckOpen = spread.length > 0 &&
    Number(spread[spread.length - 1]?.prioritySpreadGap) > 0;
  if (!nonDecreasing || !idle || !stuckOpen) unmet.push(CONDITION.SPREAD);
  const transitions = Array.isArray(metrics?.admissionTransitions) ?
    metrics.admissionTransitions : [];
  const last = transitions.length > 0 ? transitions[transitions.length - 1] : null;
  if (last?.state !== ADMISSION_TERMINAL_STATE) unmet.push(CONDITION.ADMISSION);
  return unmet;
}

/**
 * Run the simulator twice and evaluate the six reproduction conditions.
 * @param {number} seed
 * @returns {{unmet: string[], detail: string[]}}
 */
function reproduce(seed) {
  if (!fs.existsSync(path.join(REPO_ROOT, SIMULATOR_ENTRY))) {
    return {unmet: [...CONDITIONS], detail: [`no simulator at ${SIMULATOR_ENTRY}`]};
  }
  const runs = [];
  for (let index = 0; index < RUNS; index += 1) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
    try {
      runs.push(runSimulator(seed, dir));
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }
  if (arraySome(runs, (run) => run.status !== 0 || run.bytes === null)) {
    return {unmet: [...CONDITIONS], detail: arrayMap(runs, (run) => {
      const lines = stringSplit(stringTrim(run.stderr), '\n');
      return `exit ${run.status}: ${lines[lines.length - 1] || LABEL.NO_REPORT}`;
    })};
  }
  const hashes = arrayMap(runs, (run) =>
    createHash(HASH_ALGORITHM).update(run.bytes).digest('hex'));
  const unmet = [];
  if (!arrayEvery(hashes, (hash) => hash === hashes[0])) unmet.push(CONDITION.IDENTICAL);
  unmet.push(...unmetSignature(metricsOf(runs[0].bytes)));
  if (!arrayEvery(runs, (run) => run.elapsedMs < REAL_TIME_BUDGET_MS)) {
    unmet.push(CONDITION.REAL_TIME);
  }
  return {unmet, detail: [`hashes ${hashes.join(LABEL.LIST_SEPARATOR)}`,
    `elapsed ${arrayMap(runs, (run) => run.elapsedMs).join(LABEL.LIST_SEPARATOR)} ms`]};
}

function main(argv) {
  const options = parseArguments(argv);
  const {unmet, detail} = reproduce(options.seed);
  if (options.explain) {
    for (const line of detail) console.error(line);
    for (const condition of CONDITIONS) {
      console.error(`${arrayIncludes(unmet, condition) ? LABEL.UNMET : LABEL.MET} ${condition}`);
    }
  }
  console.log(unmet.length);
  return unmet.length === 0 ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
