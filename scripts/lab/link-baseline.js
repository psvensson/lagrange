/**
 * Link baseline of a multi-host lab run: pairwise TCP round-trip time and a
 * short, bounded throughput estimate between the run's hosts, measured
 * before and after the formation and recorded beside the run's config.
 *
 * It is part of run preparation, not a probe and not a gate: a pair that
 * cannot be measured is recorded as unavailable with its reason, and the
 * formation runs either way. Nothing here changes a scenario outcome.
 *
 * Household network constraint (owner, 2026-11-09: lab hosts share
 * household Wi-Fi airtime; at most two lab hosts transfer at once, and bulk
 * copies are capped): pairs are measured strictly one after another, so
 * exactly two hosts transfer at any moment, and each pair moves at most
 * 2 x CAP_BYTES in at most 2 x CAP_MS of transfer.
 *
 * Host access is the adapter's existing channel: one non-interactive ssh
 * command per host, with the probe's source on standard input. The probe
 * (test/distributed/harness/run-health/link-baseline-probe.js) needs only
 * Node, which the lab's worker setup installs through nvm.
 */

import {readFile, writeFile, copyFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {capture} from './process.js';
import {
  RUN_HEALTH_ARTIFACT,
} from '../../test/distributed/harness/run-health/run-health-constants.js';
import {
  linkBaselineConsumers,
  writeScenarioRunHealth,
} from '../../test/distributed/harness/run-health/run-health-artifacts.js';

const LINK_BASELINE_SCHEMA_VERSION = 1;
const BYTES_PER_MIB = 1024 * 1024;

const LINK_BASELINE_LIMIT = Object.freeze({
  // The top of the port block the lab hosts keep open for formations
  // (8080-8179, docs/development/home-lab.md); no formation node listens
  // there, and none is running when the baseline is measured.
  PORT: 8179,
  // Five round trips give a median and a maximum.
  PINGS: 5,
  // Two mebibytes each way: a tenth of a second at 20 Mbit/s of the
  // household rsync cap's order, well under one playback bundle.
  CAP_BYTES: 2 * BYTES_PER_MIB,
  CAP_MS: 1500,
  // The server stops on the client's quit, or by itself after this long.
  SERVER_LIFETIME_MS: 12000,
  // One host command's deadline: connect budget, both transfers and slack.
  COMMAND_TIMEOUT_MS: 15000,
});

const LINK_BASELINE_PHASE = Object.freeze({PRE_RUN: 'preRun', POST_RUN: 'postRun'});
const PAIR_OUTCOME = Object.freeze({MEASURED: 'measured', UNAVAILABLE: 'unavailable'});
const PAIR_UNAVAILABLE_REASON = Object.freeze({
  HOST_COMMAND_FAILED: 'host_command_failed',
  PROBE_OUTPUT_UNREADABLE: 'probe_output_unreadable',
  NOT_MEASURED_YET: 'not_measured_yet',
  MEASUREMENT_FAILED: 'measurement_failed',
});

const SSH = 'ssh';
const SSH_ARGS = Object.freeze(['-o', 'BatchMode=yes']);
const TEXT_ENCODING = 'utf8';
const JSON_INDENT = 2;
const LINE_BREAK = '\n';
const PROBE_PATH = fileURLToPath(new URL(
  '../../test/distributed/harness/run-health/link-baseline-probe.js', import.meta.url));
// Over non-interactive ssh a bare `node` is often missing: activate nvm as
// lab discovery does (probe.js CAPABILITY_SCRIPT), then run the probe from
// standard input as an ES module.
const NODE_FROM_STDIN = 'NVM_DIR="${NVM_DIR:-$HOME/.nvm}"; ' +
  '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1; ' +
  'exec node --input-type=module -';
const SAFE_ARGUMENT = /^[A-Za-z0-9.:_-]+$/u;
const ARGUMENT_SEPARATOR = ' ';
const PROBE_MODE = Object.freeze({SERVER: 'server', CLIENT: 'client'});

/**
 * The shell command that runs the probe on a host.
 * @param {Array<string|number>} probeArguments
 * @return {string}
 */
function linkProbeCommand(probeArguments) {
  const words = probeArguments.map(String);
  const unsafe = words.find((word) => !SAFE_ARGUMENT.test(word));
  if (unsafe !== undefined) throw new Error(`link baseline: unsafe probe argument ${unsafe}`);
  return [NODE_FROM_STDIN, ...words].join(ARGUMENT_SEPARATOR);
}

function sshHostCommand(node, command, {stdin, timeoutMs}) {
  return capture(SSH, [...SSH_ARGS, node.ssh, command], {stdin, timeoutMs});
}

/**
 * Every unordered pair of hosts, each measured once from its first host.
 * @param {Array<Object>} nodes
 * @return {Array<Array<Object>>}
 */
function hostPairs(nodes) {
  const pairs = [];
  for (let from = 0; from < nodes.length; from += 1) {
    for (let to = from + 1; to < nodes.length; to += 1) {
      pairs.push([nodes[from], nodes[to]]);
    }
  }
  return pairs;
}

function unavailablePair(from, to, reason, detail) {
  return {from: from.name, to: to.name, outcome: PAIR_OUTCOME.UNAVAILABLE, reason, detail};
}

function parseProbeOutput(text) {
  const lines = String(text).trim().split(LINE_BREAK);
  return JSON.parse(lines[lines.length - 1]);
}

async function measurePair(from, to, {runHostCommand, probeScript}) {
  const limit = LINK_BASELINE_LIMIT;
  const options = {stdin: probeScript, timeoutMs: limit.COMMAND_TIMEOUT_MS};
  // The server outcome is observed, never thrown: the client's result is
  // the measurement, and the server ends on the client's quit.
  const server = runHostCommand(to, linkProbeCommand(
    [PROBE_MODE.SERVER, to.ip, limit.PORT, limit.SERVER_LIFETIME_MS]), options)
    .then((text) => ({text}), (error) => ({error: String(error.message)}));
  let clientText = null;
  try {
    clientText = await runHostCommand(from, linkProbeCommand(
      [PROBE_MODE.CLIENT, to.ip, limit.PORT, limit.PINGS, limit.CAP_BYTES, limit.CAP_MS]), options);
  } catch (error) {
    const serverOutcome = await server;
    return unavailablePair(from, to, PAIR_UNAVAILABLE_REASON.HOST_COMMAND_FAILED,
      {client: String(error.message), server: serverOutcome});
  }
  const serverOutcome = await server;
  let result = null;
  try {
    result = parseProbeOutput(clientText);
  } catch (error) {
    return unavailablePair(from, to, PAIR_UNAVAILABLE_REASON.PROBE_OUTPUT_UNREADABLE,
      {client: String(error.message), server: serverOutcome});
  }
  return result.outcome === PAIR_OUTCOME.MEASURED ?
    {from: from.name, to: to.name, ...result} :
    unavailablePair(from, to, result.reason, {client: result.detail, server: serverOutcome});
}

/**
 * Measure every host pair, one pair at a time.
 * @param {Object} options
 * @param {Array<Object>} options.nodes - Lab nodes ({name, ssh, ip}).
 * @param {Function} [options.runHostCommand] (node, command, {stdin,
 *   timeoutMs}) => Promise<stdout>; ssh by default.
 * @param {string} [options.probeScript] - The probe's source text.
 * @param {Function} [options.now]
 * @return {Promise<Object>} {measuredAt, pairs}.
 */
async function measureLinkBaseline({nodes, runHostCommand = sshHostCommand,
  probeScript = null, now = Date.now}) {
  const script = probeScript === null ? await readFile(PROBE_PATH, TEXT_ENCODING) : probeScript;
  const measuredAt = now();
  const pairs = [];
  for (const [from, to] of hostPairs(nodes)) {
    pairs.push(await measurePair(from, to, {runHostCommand, probeScript: script}));
  }
  return {measuredAt, elapsedMs: now() - measuredAt, pairs};
}

function emptyLinkBaseline(nodes) {
  const notMeasured = {state: PAIR_OUTCOME.UNAVAILABLE,
    reason: PAIR_UNAVAILABLE_REASON.NOT_MEASURED_YET, pairs: []};
  return {
    schemaVersion: LINK_BASELINE_SCHEMA_VERSION,
    hosts: nodes.map((node) => ({name: node.name, ip: node.ip})),
    limits: LINK_BASELINE_LIMIT,
    [LINK_BASELINE_PHASE.PRE_RUN]: notMeasured,
    [LINK_BASELINE_PHASE.POST_RUN]: notMeasured,
  };
}

/**
 * Measure one phase and record it in the run's link baseline file. A
 * measurement that fails as a whole is recorded as unavailable; it never
 * fails the run it belongs to.
 * @param {Object} options - {path, phase, nodes, measure}.
 * @return {Promise<Object>} The file's content after the phase.
 */
async function recordLinkBaselinePhase({path, phase, nodes, measure = measureLinkBaseline}) {
  const baseline = existsSync(path) ?
    JSON.parse(await readFile(path, TEXT_ENCODING)) : emptyLinkBaseline(nodes);
  try {
    baseline[phase] = await measure({nodes});
  } catch (error) {
    baseline[phase] = {state: PAIR_OUTCOME.UNAVAILABLE,
      reason: PAIR_UNAVAILABLE_REASON.MEASUREMENT_FAILED, detail: String(error.message),
      pairs: []};
  }
  await writeFile(path, `${JSON.stringify(baseline, null, JSON_INDENT)}${LINE_BREAK}`);
  return baseline;
}

/**
 * After the post-run phase: give every scenario directory that classified
 * against this baseline the complete file, and classify it again.
 * @param {string} path - The run's link baseline file.
 * @return {Promise<Array<string>>} The scenario directories updated.
 */
async function publishLinkBaseline(path) {
  const updated = [];
  for (const scenarioDir of await linkBaselineConsumers(path)) {
    if (!existsSync(scenarioDir)) continue;
    await copyFile(path, join(scenarioDir, RUN_HEALTH_ARTIFACT.LINK_BASELINE));
    await writeScenarioRunHealth({scenarioDir});
    updated.push(scenarioDir);
  }
  return updated;
}

/**
 * One line per measured pair, for the adapter's console.
 * @param {Object} phase - One recorded phase.
 * @return {string}
 */
function formatLinkBaselinePhase(phase) {
  return (phase.pairs ?? []).map((pair) => (pair.outcome === PAIR_OUTCOME.MEASURED ?
    `  ${pair.from} <-> ${pair.to}: rtt p50 ${pair.roundTripMs.p50} ms max ` +
      `${pair.roundTripMs.max} ms, up ${pair.upload.bytesPerSecond} B/s, down ` +
      `${pair.download.bytesPerSecond} B/s` :
    `  ${pair.from} <-> ${pair.to}: unavailable (${pair.reason})`)).join(LINE_BREAK);
}

export {
  LINK_BASELINE_LIMIT,
  LINK_BASELINE_PHASE,
  PAIR_OUTCOME,
  PAIR_UNAVAILABLE_REASON,
  formatLinkBaselinePhase,
  hostPairs,
  linkProbeCommand,
  measureLinkBaseline,
  publishLinkBaseline,
  recordLinkBaselinePhase,
};
