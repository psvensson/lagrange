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
import {LAB_HOLD, holdLabMachine, labHolderText} from '../../../scripts/lab/probe.js';
import {selectNodesByRole} from '../../../scripts/lab/state.js';
import {SCENARIO_REFUSAL} from './scenario-host-topology.js';
import {
  arrayFilter,
  arrayFind,
  arrayIncludes,
  arrayMap,
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
// The gate's own bound is twenty polls of 30 s; one minute of slack for ssh.
const THERMAL_GATE_TIMEOUT_MS = 11 * 60 * 1000;
const HOST_ROLE = Object.freeze({DATA: 'data', CLIENT: 'client'});

function benchPurpose(campaignId) {
  return `${BENCH_PURPOSE_PREFIX}${requireCampaignId(campaignId)}`;
}

function factsOf(node, fleet) {
  const discovered = fleet && arrayFind(fleet, (entry) => entry.name === node.name);
  if (discovered) return {capability: discovered.capability, error: discovered.error ?? null};
  return {capability: node.testCapability ?? null,
    error: node.lastProbeFailure?.error ?? null};
}

function exclusionOf(node, facts, seenBootIds) {
  if (node.os !== LINUX) return `os ${node.os}`;
  if (!node.ssh || !node.ip) return 'no ssh target or ip in the inventory';
  if (facts.error || !facts.capability) return `unreachable: ${facts.error || 'never probed'}`;
  if (facts.capability.dockerReachable !== true) return 'docker not reachable';
  if (facts.capability.bootId && seenBootIds.has(facts.capability.bootId)) {
    return 'same machine as another inventory node';
  }
  return null;
}

function lockOf(facts) {
  const lock = facts.capability.machineLock;
  return {state: lock?.state || 'unknown',
    holder: lock?.holder ? labHolderText(lock.holder) : null};
}

/**
 * Choose `dataHostCount` data hosts plus one load-generator host from the
 * inventory: free hosts first, then hosts another run holds (the hold waits
 * for them, bounded, and refuses naming the holder), each group in name
 * order. Too few eligible hosts is a typed topology refusal (blocked, never
 * failed) naming every excluded host and why.
 * @param {{state: Object, fleet?: Array<Object>|null, dataHostCount: number}} input
 * @return {Array<Object>}
 */
function selectLabBenchmarkHosts({state, fleet = null, dataHostCount}) {
  const required = dataHostCount + 1;
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
  const free = (entry) => arrayIncludes(USABLE_LOCK_STATES, entry.lock.state);
  const ordered = [...arrayFilter(eligible, free),
    ...arrayFilter(eligible, (entry) => !free(entry))];
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
    lock, role: index < dataHostCount ? HOST_ROLE.DATA : HOST_ROLE.CLIENT}));
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
    try {
      results[host.name] = {outcome: 'ok', line: String(await sshRun(host.ip, opts,
        `cd ${shellQuote(host.repoPath)} && ${shellQuote(host.nodePath)} ${THERMAL_GATE}`,
        THERMAL_GATE_TIMEOUT_MS))};
    } catch (error) {
      throw deploymentFailure(DEPLOYMENT_FAILURE.THERMAL_EXHAUSTED,
        `lab host ${host.name} thermal gate refused: ${errorText(error)}`, {host: host.name});
    }
  }
  return results;
}

function dataHostsOf(hosts) {
  return arrayFilter(hosts, (host) => host.role === HOST_ROLE.DATA);
}

export {
  HOST_ROLE as LAB_BENCHMARK_HOST_ROLE,
  THERMAL_GATE,
  benchPurpose,
  checkLabThermalHeadroom,
  dataHostsOf,
  holdLabBenchmarkHosts,
  plannedLabLocks,
  readLabHolderRecords,
  releaseLabBenchmarkHosts,
  selectLabBenchmarkHosts,
};
