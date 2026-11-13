/**
 * Lab hosts for a comparative-benchmark campaign, through the existing lab
 * owners only (docs/development/home-lab.md): hosts come from the registered
 * inventory (scripts/lab/state.js selectNodesByRole, `harness` role) and its
 * recorded or freshly discovered facts (reachable, Docker reachable, machine
 * lock free, distinct boot identity); each is held with the machine-wide
 * flock + holder record (scripts/lab/probe.js holdLabMachine) under purpose
 * `bench:<campaignId>` in name order, and released failure-safe; the thermal
 * gate (scripts/checks/wait-for-thermal-headroom.js) runs on every held host
 * before deployment. Never hand-typed hosts, never a raw lock.
 */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {HEADROOM, checkedThermalObservation, parseThermalEndpoint, thermalPermits}
  from '../../../scripts/checks/wait-for-thermal-headroom.js';

import {LAB_HOLD, holdLabMachine, labHolderText} from '../../../scripts/lab/probe.js';
import {selectNodesByRole} from '../../../scripts/lab/state.js';
import {SCENARIO_REFUSAL} from './scenario-host-topology.js';
import {
  arrayFilter,
  arrayFind,
  arrayIncludes,
  arrayMap,
  stringReplace,
  stringSplit,
  stringTrim,
} from './real-product-captured-intrinsics.js';
import {
  DEPLOYMENT_FAILURE,
  deploymentFailure,
  requireCampaignId,
} from './real-product-deployment-contract.js';
import {errorText, shellQuote} from './real-product-remote-shell.js';

const HARNESS_ROLE = 'harness';
const LINUX = 'linux';
const BENCH_PURPOSE_PREFIX = 'bench:';
const USABLE_LOCK_STATES = Object.freeze(['free', 'stale-record']);
const LAB_LOCK_PATH = '${LAB_LOCK_DIR:-$HOME/.lab}/machine.lock';
const LAB_HOLDER_PATH = '${LAB_LOCK_DIR:-$HOME/.lab}/machine.holder.json';
const THERMAL_GATE = 'scripts/checks/wait-for-thermal-headroom.js';
// Free bytes a data host's docker data root needs: the product images it must
// hold plus a margin. Measured 2026-11-01 on tv-dator (containerd store):
// psvensson/lagrange 0.4.0 788,149,562 B and pingcap/tikv v8.5.8
// 2,055,725,487 B; pd, tidb and postgres:17-alpine were on no lab host, so
// 1.5 GiB is reserved for them unmeasured; 2 GiB margin for container
// layers and logs of a smoke run (data in the container layer). 6.5 GiB.
const DATA_HOST_MIN_DOCKER_FREE_BYTES = Math.ceil(6.5 * 2 ** 30);

// Free bytes the load generator's checkout filesystem needs: the detached
// worktree at the harness commit it runs the workload from
// (prepareLoadGeneratorCheckout), MEASURED at preparation time from the tree
// that will be checked out, plus the run's evidence under the worktree's
// test-output (reserved, unmeasured). The load generator holds no image.
const LOAD_GENERATOR_RUN_EVIDENCE_BYTES = 64 * 2 ** 20;
// A selection asked for without the measured requirement is refused (the
// campaign is blocked), never run with an assumed one.
const LOAD_GENERATOR_REQUIREMENT_UNMEASURED = 'refused_load_generator_requirement_unmeasured';
const CHECKOUT_EXCLUDED_DIRS = Object.freeze([
  'node_modules',
  'data',
  'test-output',
  '.git',
  '.claude',
  '.tap',
  '.tmp',
  'dist',
  'work',
  'tools',
]);
const DU_ARGS = Object.freeze(['-s', '-B1',
  ...arrayMap(CHECKOUT_EXCLUDED_DIRS, (dir) => `--exclude=./${dir}`), '.']);

/**
 * The load generator's disk requirement, measured: the allocated size of the
 * checkout tree at `root` (du, without the dependency, data, output and git
 * directories a worktree links or does not hold) plus the evidence margin.
 * @param {string} root the harness checkout
 * @return {{checkoutBytes: number, evidenceMarginBytes: number,
 *   requiredBytes: number, method: string, measuredAt: string}}
 */
function measureLoadGeneratorRequirement(root, {exec = execFileSync} = {}) {
  const answer = String(exec('du', [...DU_ARGS], {cwd: root, encoding: 'utf8'}));
  const checkoutBytes = Number(stringSplit(stringTrim(answer), /\s+/u)[0]);
  if (!Number.isSafeInteger(checkoutBytes) || checkoutBytes <= 0) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.LAB_HOST_UNAVAILABLE,
      `the harness checkout could not be measured: du answered ${JSON.stringify(answer)}`,
      {root});
  }
  return {checkoutBytes, evidenceMarginBytes: LOAD_GENERATOR_RUN_EVIDENCE_BYTES,
    requiredBytes: checkoutBytes + LOAD_GENERATOR_RUN_EVIDENCE_BYTES,
    method: `du ${DU_ARGS.join(' ')}`, measuredAt: new Date().toISOString()};
}

function dockerDiskLow(facts) {
  const free = Number(facts.capability.dockerRootFreeBytes);
  return !Number.isFinite(free) || free < DATA_HOST_MIN_DOCKER_FREE_BYTES;
}
// Preserve the ten-minute gate allowance and one minute of transport slack.
const THERMAL_GATE_TIMEOUT_MS = 11 * 60 * 1000;
const THERMAL_GATE_WAIT_MS = 10 * 60 * 1000;
const THERMAL_GATE_SOURCE_SHA = createHash('sha256').update(fs.readFileSync(
  new URL('../../../scripts/checks/wait-for-thermal-headroom.js', import.meta.url))).digest('hex');
const REMOTE_THERMAL_GATE = [
  "import fs from 'node:fs'; import {createHash} from 'node:crypto';",
  "import {pathToFileURL} from 'node:url';",
  'const [file, expected, descriptor, budget] = process.argv.slice(1);',
  // The imported owner has a CLI guard; this invocation is a library caller.
  'process.argv = [process.argv[0]];',
  "if (createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== expected) " +
    "throw new Error('thermal client source differs');",
  'const owner = await import(pathToFileURL(file).href);',
  'const env = {...process.env, [owner.THERMAL_ENDPOINT_ENV]: descriptor,',
  '  [owner.THERMAL_DEADLINE_ENV]: String(Date.now() + Number(budget))};',
  'const result = await owner.waitForThermalHeadroom({env});',
  'console.log(JSON.stringify(result));',
  'process.exitCode = owner.thermalPermits(result) ? 0 : owner.THERMAL_REFUSAL_EXIT;',
].join('\n');
const HOST_ROLE = Object.freeze({DATA: 'data', CLIENT: 'client'});

function benchPurpose(campaignId) {
  return `${BENCH_PURPOSE_PREFIX}${requireCampaignId(campaignId)}`;
}

function factsOf(node, fleet) {
  const discovered = fleet && arrayFind(fleet, (entry) => entry.name === node.name);
  if (discovered) return {capability: discovered.capability, error: discovered.error ?? null};
  if (fleet !== null) return {capability: null, error: 'not present in fresh discovery'};
  return {capability: node.testCapability ?? null,
    error: node.lastProbeFailure?.error ?? null};
}

function exclusionOf(node, facts, seenBootIds) {
  if (node.os !== LINUX) return `os ${node.os}`;
  if (!node.ssh || !node.ip) return 'no ssh target or ip in the inventory';
  if (facts.error || !facts.capability) return `unreachable: ${facts.error || 'never probed'}`;
  if (facts.capability.dockerReachable !== true) return 'docker not reachable';
  const thermal = thermalOf(facts.capability);
  if (!thermal || (!thermalPermits(thermal.decision) &&
      thermal.decision.outcome !== HEADROOM.HOLD)) {
    return 'host-ineligible: native thermal decision unavailable';
  }
  if (facts.capability.bootId && seenBootIds.has(facts.capability.bootId)) {
    return 'same machine as another inventory node';
  }
  return null;
}

function thermalOf(capability) {
  try {
    const endpoint = parseThermalEndpoint(JSON.stringify(capability.thermalEndpoint));
    return {endpoint, decision: checkedThermalObservation(capability.thermalObservation,
      endpoint, capability.thermalStatus)};
  } catch {
    return null;
  }
}

function lockOf(facts) {
  const lock = facts.capability.machineLock;
  return {state: lock?.state || 'unknown',
    holder: lock?.holder ? labHolderText(lock.holder) : null};
}

function versionAtLeast(version, minimum) {
  const parts = (value) => arrayMap(stringSplit(stringReplace(String(value || ''), /^v/u, ''), '.'),
    (part) => Number.parseInt(part, 10) || 0);
  const [have, need] = [parts(version), parts(minimum)];
  for (let index = 0; index < need.length; index += 1) {
    if ((have[index] || 0) !== need[index]) return (have[index] || 0) > need[index];
  }
  return true;
}

// Why a host cannot be the load generator (it runs the canonical adapters
// from its own checkout): no checkout, or a Node older than the engines floor.
function loadGeneratorGap(facts, nodeMinimum, requirement) {
  const capability = facts.capability;
  if (!capability.repoPath || !capability.nodePath) return 'no checkout to run the workload from';
  if (nodeMinimum && !versionAtLeast(capability.nodeVersion, nodeMinimum)) {
    return `node ${capability.nodeVersion || 'unknown'} is below the engines floor ${nodeMinimum}`;
  }
  const free = Number(capability.repoFreeBytes);
  if (!Number.isFinite(free) || free < requirement.requiredBytes) {
    return `host-ineligible: disk_low (${capability.repoFreeBytes ?? 'unknown'} bytes free on ` +
      `the checkout filesystem, the harness worktree needs ${requirement.requiredBytes})`;
  }
  return null;
}

/**
 * Choose one load-generator host (a checkout and a Node at the engines floor)
 * and `dataHostCount` data hosts from the inventory: free hosts first, then
 * hosts another run holds (the hold waits for them, bounded, and refuses
 * naming the holder), each group in name order. Too few eligible hosts is a
 * typed topology refusal (blocked, never failed) naming every excluded host
 * and why.
 * @param {{state: Object, fleet?: Array<Object>|null, dataHostCount: number,
 *   nodeMinimum?: string|null}} input
 * @return {Array<Object>}
 */
function selectLabBenchmarkHosts({state, fleet = null, dataHostCount, nodeMinimum = null,
  loadGeneratorRequirement = null}) {
  if (!Number.isSafeInteger(loadGeneratorRequirement?.requiredBytes)) {
    throw deploymentFailure(LOAD_GENERATOR_REQUIREMENT_UNMEASURED,
      `${LOAD_GENERATOR_REQUIREMENT_UNMEASURED}: lab host selection needs the measured ` +
      'load-generator requirement (measureLoadGeneratorRequirement)', {loadGeneratorRequirement});
  }
  const required = dataHostCount + 1;
  const {eligible, excluded} = partitionEligibleHosts(state, fleet);
  const free = (entry) => arrayIncludes(USABLE_LOCK_STATES, entry.lock.state);
  const preferred = [...arrayFilter(eligible, free),
    ...arrayFilter(eligible, (entry) => !free(entry))];
  const data = chooseDataHosts(preferred, dataHostCount, excluded);
  const client = chooseLoadGenerator(preferred, data, free, {nodeMinimum,
    requirement: loadGeneratorRequirement}, excluded);
  const ordered = client && data.length === dataHostCount ? [...data, client] : [];
  if (ordered.length < required) {
    throw deploymentFailure(SCENARIO_REFUSAL.INSUFFICIENT_HOST_TOPOLOGY,
      `${SCENARIO_REFUSAL.INSUFFICIENT_HOST_TOPOLOGY}: the campaign needs ${required} ` +
      `harness hosts (${dataHostCount} data + 1 load generator); the inventory offers ` +
      `${ordered.length}; excluded: ${arrayMap(excluded,
        (entry) => `${entry.name} (${entry.reason})`).join('; ') || 'none'}`,
      {required, available: ordered.length, excluded});
  }
  return arrayMap(ordered.slice(0, required), ({node, facts, lock}, index) => ({
    name: node.name, ip: node.ip, sshTarget: node.ssh, bootId: facts.capability.bootId ?? null,
    repoPath: facts.capability.repoPath ?? null, nodePath: facts.capability.nodePath ?? null,
    thermalEndpoint: thermalOf(facts.capability).endpoint,
    executionPolicy: thermalOf(facts.capability).decision.execution_policy,
    lock, role: index < dataHostCount ? HOST_ROLE.DATA : HOST_ROLE.CLIENT}));
}

// The inventory's harness nodes in name order, split into eligible hosts (with
// their facts and recorded lock) and excluded ones with the reason; one host
// per physical machine (boot id).
function partitionEligibleHosts(state, fleet) {
  const candidates = [...selectNodesByRole(state, HARNESS_ROLE)]
    .sort((left, right) => (left.name < right.name ? -1 : 1));
  const eligible = [];
  const excluded = [];
  const seenBootIds = new Set();
  for (const node of candidates) {
    const facts = factsOf(node, fleet);
    const reason = exclusionOf(node, facts, seenBootIds);
    if (reason) {
      excluded.push({name: node.name, reason});
      continue;
    }
    if (facts.capability.bootId) seenBootIds.add(facts.capability.bootId);
    eligible.push({node, facts, lock: lockOf(facts)});
  }
  return {eligible, excluded};
}

// Data hosts first, in preference order, from hosts with room for the product
// images on the docker data root; a host without it is excluded with the gap.
function chooseDataHosts(preferred, dataHostCount, excluded) {
  const data = [];
  for (const entry of preferred) {
    if (dockerDiskLow(entry.facts)) {
      excluded.push({name: entry.node.name, reason: 'host-ineligible: docker_disk_low ' +
        `(${entry.facts.capability.dockerRootFreeBytes ?? 'unknown'} bytes free on the ` +
        `docker data root, a data host needs ${DATA_HOST_MIN_DOCKER_FREE_BYTES})`});
    } else if (data.length < dataHostCount) {
      data.push(entry);
    }
  }
  return data;
}

// The load generator from the hosts that are not data hosts (it needs only
// the checkout and a Node at the floor): the LAST capable free one, else the
// last capable one. Every host that cannot be one is recorded in `excluded`.
function chooseLoadGenerator(preferred, data, free, {nodeMinimum, requirement}, excluded) {
  const capable = arrayFilter(preferred, (entry) => !arrayIncludes(data, entry) &&
    !loadGeneratorGap(entry.facts, nodeMinimum, requirement));
  for (const entry of preferred) {
    const gap = loadGeneratorGap(entry.facts, nodeMinimum, requirement);
    if (gap) excluded.push({name: entry.node.name, reason: `not a load generator: ${gap}`});
  }
  const capableFree = arrayFilter(capable, free);
  if (capableFree.length > 0) return capableFree[capableFree.length - 1];
  return capable.length > 0 ? capable[capable.length - 1] : null;
}

/** What a dry run would lock, per host, under the lab convention. */
function plannedLabLocks(hosts, campaignId) {
  return arrayMap(hosts, (host) => ({name: host.name, ip: host.ip,
    purpose: benchPurpose(campaignId), lockPath: LAB_LOCK_PATH, holderPath: LAB_HOLDER_PATH,
    recordedLock: host.lock ?? null}));
}

function releaseLabBenchmarkHosts(sessions) {
  return Promise.all(arrayMap(sessions, (session) => session.release()));
}

/**
 * Hold every host before any deployment, one at a time in name order within
 * one budget; a host another run holds releases the holds already taken and
 * refuses the campaign, naming the holder.
 */
async function holdLabBenchmarkHosts({hosts, campaignId, waitMs, expectedMs,
  hold = holdLabMachine, now = Date.now}) {
  const purpose = benchPurpose(campaignId);
  const sessions = [];
  const deadline = now() + waitMs;
  const ordered = [...hosts].sort((left, right) => (left.name < right.name ? -1 : 1));
  for (const host of ordered) {
    const session = hold({name: host.name, sshTarget: host.sshTarget},
      {waitMs: Math.max(0, deadline - now()), purpose, expectedMs});
    sessions.push(session);
    const outcome = await session.outcome;
    if (outcome.state !== LAB_HOLD.HELD) {
      await releaseLabBenchmarkHosts(sessions);
      throw deploymentFailure(DEPLOYMENT_FAILURE.LAB_HOST_UNAVAILABLE,
        `lab host ${host.name} not held: ` + (outcome.state === LAB_HOLD.BUSY ?
          labHolderText(outcome.holder) : outcome.reason), {host: host.name, outcome});
    }
  }
  return sessions;
}

/** The holder record each held host carries now, as its holder wrote it. */
async function readLabHolderRecords({hosts, sshRun, opts}) {
  const records = {};
  for (const host of hosts) {
    try {
      records[host.name] = JSON.parse(await sshRun(host.ip, opts,
        `cat "${LAB_HOLDER_PATH}"`));
    } catch (error) {
      records[host.name] = {unreadable: errorText(error)};
    }
  }
  return records;
}

/**
 * Run the thermal gate on every held host from its own checkout. Exhausted
 * headroom (the gate's non-zero exit) refuses the campaign before deployment.
 */
async function checkLabThermalHeadroom({hosts, sshRun, opts}) {
  const results = {};
  for (const host of hosts) {
    if (!host.repoPath || !host.nodePath) {
      throw deploymentFailure(DEPLOYMENT_FAILURE.THERMAL_EXHAUSTED,
        `lab host ${host.name} has no recorded checkout to run the thermal gate from`,
        {host: host.name});
    }
    let result;
    try {
      const endpoint = parseThermalEndpoint(JSON.stringify(host.thermalEndpoint));
      const args = arrayMap([THERMAL_GATE, THERMAL_GATE_SOURCE_SHA, JSON.stringify(endpoint),
        String(THERMAL_GATE_WAIT_MS)], shellQuote).join(' ');
      result = JSON.parse(await sshRun(host.ip, opts,
        `cd ${shellQuote(host.repoPath)} && ${shellQuote(host.nodePath)} --input-type=module ` +
        `-e ${shellQuote(REMOTE_THERMAL_GATE)} ${args}`, THERMAL_GATE_TIMEOUT_MS));
      if (!thermalPermits(result) || result.source_sha256 !== endpoint.sourceSha256 ||
          result.config_sha256 !== endpoint.configSha256 || result.boot_id !== endpoint.bootId ||
          !isDeepStrictEqual(result.execution_policy, host.executionPolicy)) {
        throw new Error('native thermal decision or identity refused');
      }
    } catch (error) {
      throw deploymentFailure(DEPLOYMENT_FAILURE.THERMAL_EXHAUSTED,
        `lab host ${host.name} thermal gate refused: ${errorText(error)}`, {host: host.name});
    }
    results[host.name] = result;
  }
  return results;
}

export {
  THERMAL_GATE,
  checkLabThermalHeadroom,
  holdLabBenchmarkHosts,
  measureLoadGeneratorRequirement,
  plannedLabLocks,
  readLabHolderRecords,
  releaseLabBenchmarkHosts,
  selectLabBenchmarkHosts,
};
