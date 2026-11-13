// Cost placement, measured admission and the outcomes of each original assignment.
import os from 'node:os';
import {resolvedCheckBaseCommit} from '../checks/changed-paths.js';
import {defaultLoadThreshold} from '../checks/wait-for-load-headroom.js';
import {HEADROOM, THERMAL_REFUSAL_LINE, waitForThermalHeadroom}
  from '../checks/wait-for-thermal-headroom.js';
import {TEST_FILE_LINE, relayedLine} from '../run-test-files.js';
import {DISCOVERY_FAILURE, FLEET_CONTROLLER_NAME, REQUIREMENT_FAILURES, discoverFleet,
  discoveryFailure, fleetRequirement, recordFleet} from './fleet-discovery.js';
import {LAB_HOLDER_UNKNOWN, LAB_LOCK_STATE, LAB_LOCK_WAIT_MAX_MS, MS_PER_MINUTE}
  from './machine-lock-constants.js';
import {busyHolder, labTestPurpose} from './machine-hold.js';
import {LAB_TEST_TEXT, PLACEMENT_ENV, PLACEMENT_EXIT, PLACEMENT_LOCAL,
  PLACEMENT_MACHINE_FACTOR_ENV, PLACEMENT_REJECTED, PLACEMENT_REMOTE_SETUP_MS, PLACEMENT_TEXT}
  from './placement-constants.js';
import {abortTogether, forwardedPolicy, placementExitStatus, runClassifiedChild,
  startRemoteShard} from './placement-execution.js';
import {commitAt} from './placement-source.js';
import {PLACEMENT_LINE} from './process.js';
import {loadState, saveState} from './state.js';

const EMPTY = '';

// Placement: run one classified plan across the machines discovery finds
// ready, choosing at test time. The owner's rule (2026-09-18): an ordinary
// push proves itself locally and in parallel, and no host is written into any
// setup, so every choice below comes from facts measured on this run - the
// fleet is probed again (about a second) and each file's last duration
// decides the split. A machine receives a FILE SET and runs its own serial
// lanes: overlapping the exclusive and ordinary lanes on one host reds five
// contention-sensitive SLOs (measured 2026-09-17), sharding across hosts adds
// no contention. Every initial assignment retains its own outcome; a failed
// or unavailable shard is never decided again on another host.

// Below this the whole plan costs less on the controller than waiting for a
// lab machine's setup is worth: the common small cone never probes at all.
const PLACEMENT_MIN_PLAN_MS = 5 * MS_PER_MINUTE;
// A file goes to a lab machine only if its duration there - measured here,
// scaled by the machine's speed - is at most half the runner's default
// per-file timeout. The first placed run gave an 8-thread machine at speed
// x2.13 a 4-minute simulation file, which timed out at 600 s there and then
// ran again here (measured 2026-09-18).
const PLACEMENT_FILE_FIT_MS = 5 * MS_PER_MINUTE;
// A shard gets three times its estimate, never under half an hour.
const PLACEMENT_DEADLINE_FACTOR = 3;
const PLACEMENT_DEADLINE_FLOOR_MS = 30 * MS_PER_MINUTE;
// The runner's per-file verdict line (TEST_FILE_LINE.VERDICT, its owner's):
// `ok|not ok FILE (N assertions, Tms)`.
const PLACEMENT_VERDICT_GREEN = 'ok';
const PLACEMENT_VERDICT_PART = Object.freeze({VERDICT: 1, FILE: 2, ASSERTIONS: 3});
// A closed terminal (SIGHUP) stops a placed run like an interrupt: the
// controller child and the lab wrappers are detached, so nothing else would.
const PLACEMENT_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM', 'SIGHUP']);
const PLACEMENT_FACTOR_STEPS = 10;
const PLACEMENT_MINUTE_DIGITS = 1;
const PLACEMENT_VERSION_SEPARATOR = '.';

/**
 * Split files over machines by measured cost. Longest first, each file goes to
 * the machine that would finish it soonest: its duration over the lanes'
 * workers that machine runs (its own cores less one, as its runner caps them),
 * scaled by the machine's measured speed, after the machine's setup. A
 * machine's `tier` orders who may take a file at all: a file goes to the
 * lowest tier with a machine that fits it - 0 a free machine, then a lab host
 * held by another run (its shard waits for the lock), then a controller with
 * no headroom - so a held tier takes only what no free machine can. A lab
 * machine left with less work than its setup is dropped and the split redone
 * while another free machine remains, so a machine is used only when it
 * shortens the run.
 * @param {Array<{file: string, ms: number, jobs: number}>} costs
 * @param {Array<{name: string, controller: boolean, speed: number,
 *   cores?: number, tier?: number}>} machines
 * @param {{setupMs?: number}} [options]
 * @return {Array<{machine: Object, files: string[], loadMs: number}>}
 */
export function placeTestFiles(costs, machines, {setupMs = PLACEMENT_REMOTE_SETUP_MS} = {}) {
  let candidates = machines;
  for (;;) {
    const shards = assignByCost(costs, candidates, setupMs);
    const free = candidates.filter((machine) => !machine.tier).length;
    const idle = shards
      .filter((shard) => !shard.machine.controller &&
        shard.loadMs - (shard.machine.waitMs ?? 0) < 2 * setupMs &&
        (shard.machine.tier || free > 1))
      .sort((left, right) => left.loadMs - right.loadMs)[0];
    if (!idle) return shards.filter((shard) => shard.files.length > 0);
    candidates = candidates.filter((machine) => machine !== idle.machine);
  }
}

function assignByCost(costs, machines, setupMs) {
  const shards = machines.map((machine) => ({
    machine, files: [], loadMs: machine.controller ? 0 : setupMs + (machine.waitMs ?? 0),
  }));
  const ordered = [...costs].sort((left, right) =>
    (right.ms / right.jobs) - (left.ms / left.jobs) ||
    (left.file < right.file ? -1 : 1));
  for (const cost of ordered) {
    let best = null;
    let bestFinish = Infinity;
    for (const shard of shards) {
      if (!fits(shard.machine, cost)) continue;
      const finish = shard.loadMs + (cost.ms / jobsOn(shard.machine, cost)) * shard.machine.speed;
      const tier = shard.machine.tier || 0;
      const bestTier = best?.machine.tier || 0;
      if (!best || tier < bestTier || (tier === bestTier && finish < bestFinish)) {
        best = shard;
        bestFinish = finish;
      }
    }
    best.files.push(cost.file);
    best.loadMs = bestFinish;
  }
  return shards;
}

// The workers a file's lane gets on a machine: the lane's own on the
// controller, and on a lab machine at most its cores less one.
function jobsOn(machine, cost) {
  return machine.controller || !(machine.cores > 1) ? cost.jobs :
    Math.min(cost.jobs, machine.cores - 1);
}

// Whether a file may go to a machine: the controller takes anything; a lab
// machine only work it could finish well inside the per-file timeout.
function fits(machine, cost) {
  if (machine.controller) return true;
  return cost.ms * machine.speed <= PLACEMENT_FILE_FIT_MS;
}

/**
 * The lab machines a placed run may use, from one discovery pass: ready, not
 * the controller reached a second time, answering, with the checkout path,
 * the commit it holds and a speed sample recorded. Speed is relative to the
 * controller; the machine factor the tests scale their wall-clock budgets by
 * is that speed times the controller's own factor, never below 1. With
 * `held`, the same machines another run holds under the lab convention instead.
 * @param {Array<Object>} fleet discoverFleet's result
 * @param {Object} state the lab inventory
 * A held machine also carries `waitMs`, how long its holder expects to keep it.
 * @param {{controllerFactor?: number, held?: boolean, now?: number}} [options]
 * @return {Array<Object>}
 */
export function placementMachines(fleet, state, {controllerFactor = 1, held = false,
  now = Date.now()} = {}) {
  const reference = fleet.find((entry) => entry.controller)?.capability?.cpuSampleMs;
  const machines = [];
  for (const entry of fleet) {
    const cap = entry.capability;
    const node = state.nodes?.[entry.name];
    if (!(reference > 0) || !isPlaceable(entry, node, held)) continue;
    const speed = cap.cpuSampleMs / reference;
    machines.push({
      name: entry.name,
      controller: false,
      speed,
      // The measured capacity a hand run's decision is printed with.
      cores: cap.cores,
      memKiB: cap.memKiB,
      factor: Math.max(1, Math.ceil(speed * controllerFactor * PLACEMENT_FACTOR_STEPS) /
        PLACEMENT_FACTOR_STEPS),
      sshTarget: node.ssh,
      repoPath: cap.repoPath,
      repoHead: cap.repo.head,
      nodeMajor: String(cap.nodeVersion || EMPTY).replace(/^v/u, EMPTY)
        .split(PLACEMENT_VERSION_SEPARATOR)[0],
      ...(held ? {waitMs: holdWaitMs(cap.machineLock?.holder, now)} : {}),
    });
  }
  return machines;
}

// How long a held host is expected to stay held: its holder's own estimate
// less what has passed. A record that cannot say - none, no start or
// estimate, or already overdue - is the longest any lock wait may be.
function holdWaitMs(holder, now) {
  const left = Date.parse(holder?.startedAt) +
    Number(holder?.expectedMinutes) * MS_PER_MINUTE - now;
  return Number.isFinite(left) && left > 0 ? left : LAB_LOCK_WAIT_MAX_MS;
}

// A lab machine a shard can go to: discovered ready this run, answering, not
// the controller reached a second time, not held by another agent under the
// lab convention, with an ssh target, the checkout path, the commit that
// checkout is at and a speed sample. A stale holder record is no lock.
function isPlaceable(entry, node, held) {
  const cap = entry.capability;
  const distinct = !entry.controller && !entry.error && !entry.sameMachineAs;
  const reachable = Boolean(node?.ssh) && entry.readiness?.ready === true &&
    (cap?.machineLock?.state === LAB_LOCK_STATE.BUSY) === held;
  return distinct && reachable && Boolean(cap?.repoPath) && Boolean(cap.repo?.head) &&
    cap.cpuSampleMs > 0;
}

// Who may take a file, in order: a free machine, a lab host another run
// holds, a controller without headroom.
const TIER = Object.freeze({HELD: 1, HOT: 2});
const CONTROLLER_FIT = Object.freeze({fit: true, reason: null});

const CONTROLLER_MACHINE = Object.freeze({
  name: FLEET_CONTROLLER_NAME, controller: true, speed: 1,
});

function minutes(ms) {
  return (ms / MS_PER_MINUTE).toFixed(PLACEMENT_MINUTE_DIGITS);
}

function deadlineFor(shard) {
  return Math.max(PLACEMENT_DEADLINE_FLOOR_MS, PLACEMENT_DEADLINE_FACTOR * shard.loadMs);
}

// Each assigned file's worst observed verdict. A clean line cannot erase an
// earlier failure or zero-assertion result. An absent verdict is unavailable;
// the caller also requires a successful terminal process outcome.
function logVerdicts(files, log) {
  const given = new Set(files);
  const green = new Set();
  const red = new Set();
  const assertions = new Map();
  const lines = String(log || EMPTY).split(PLACEMENT_LINE);
  for (const line of lines) {
    const verdict = TEST_FILE_LINE.VERDICT.exec(line);
    const file = verdict?.[PLACEMENT_VERDICT_PART.FILE];
    if (verdict && given.has(file)) {
      const count = Number(verdict[PLACEMENT_VERDICT_PART.ASSERTIONS]);
      (verdict[PLACEMENT_VERDICT_PART.VERDICT] === PLACEMENT_VERDICT_GREEN && count > 0 ?
        green : red).add(file);
      assertions.set(file, Math.min(assertions.get(file) ?? count, count));
    }
  }
  return {
    green, red, assertions,
    unreported: files.filter((file) => !green.has(file) && !red.has(file)),
  };
}

// A host whose runner refused as too hot is a typed placement outcome: its
// runner's own refusal line, relayed in its stream.
function reportThermalUnfit(name, lines, write) {
  if (!lines.some((line) => THERMAL_REFUSAL_LINE.test(line))) return;
  write(`${PLACEMENT_TEXT.PREFIX}${PLACEMENT_TEXT.THERMAL_UNFIT}${name}`);
}

// A host another agent held for the whole of the shard's wait is a typed
// placement outcome, naming the holder its lab shell relayed.
function reportHostBusy(name, lines, write) {
  const holder = busyHolder(lines);
  write(`${PLACEMENT_TEXT.PREFIX}${PLACEMENT_TEXT.HOST_BUSY}${name}` + (holder ?
    `${PLACEMENT_TEXT.HELD_BY}${holder.agent ?? LAB_HOLDER_UNKNOWN}${PLACEMENT_TEXT.SINCE}` +
      `${holder.startedAt ?? LAB_HOLDER_UNKNOWN}` : PLACEMENT_TEXT.NO_HOLDER));
}

// Start one lab shard, telling other agents what it is and how long it
// expects to hold the machine: its lanes and its own estimate, which is also
// the longest it waits for the machine lock.
function startShard(shard, {deps, sha, forward, costs}) {
  const lanes = costs.filter((cost) => shard.files.includes(cost.file)).map((cost) => cost.lane);
  return deps.runRemote(shard, {sha, deadlineMs: deadlineFor(shard), forward,
    holder: {purpose: labTestPurpose(lanes), expectedMs: shard.loadMs}});
}

// Whether a lab host refused its shard, as a typed placement outcome: held
// by another agent for the whole wait (the lab shell's busy exit), or too
// hot to run (its runner's thermal refusal). Reported once; null if it ran.
function hostRefusal(shard, outcome, write) {
  const lines = String(outcome.log || EMPTY).split(PLACEMENT_LINE);
  if (outcome.status === PLACEMENT_EXIT.BUSY) {
    reportHostBusy(shard.machine.name, lines, write);
    return PLACEMENT_TEXT.REFUSED_BUSY;
  }
  if (!lines.some((line) => THERMAL_REFUSAL_LINE.test(line))) return null;
  reportThermalUnfit(shard.machine.name, lines, write);
  return PLACEMENT_TEXT.REFUSED_HOT;
}

// A lab machine's own lines, shown under its name.
function relayShardLines(shard, outcome, write) {
  for (const stream of [outcome.log, outcome.errors]) {
    for (const line of String(stream || EMPTY).split(PLACEMENT_LINE)) {
      if (line) write(relayedLine(shard.machine.name, line));
    }
  }
}

/**
 * Run test files placed across the fleet when that can shorten the run, and
 * on the controller alone otherwise. Every choice is reported on one line.
 * @param {string[]} files
 * @param {Object} deps
 * @param {Function} deps.planCosts files -> [{file, ms, jobs}]
 * @param {Function} deps.runLocal (files, {failFast}) -> exit status
 * @param {Function} deps.commitAt () -> the sha the tree exactly is, or null
 * @param {Function} deps.discover async (sha) -> {machines},
 *   measured against that commit's requirement
 * @param {Function} deps.runRemote (shard, {sha, deadlineMs, forward}) ->
 *   {done, stop, interrupt, abort}
 * @param {Function} deps.runLocalChild files -> {done, abort}: the controller's
 *   files while lab shards run, without blocking this process
 * @param {Object} [deps.signals] where SIGINT, SIGTERM and SIGHUP arrive (process)
 * @param {Function} [deps.exit] process.exit
 * @param {boolean} [deps.failFast] the explicit opt-in to stop at the first
 *   red batch; such a run is never placed
 * @param {Object} [deps.env]
 * @param {Function} [deps.write]
 * @return {Promise<number>} exit status
 */
export async function runPlacedTestFiles(files, deps) {
  const {env = process.env, failFast = false, runLocalChild,
    write = (line) => process.stdout.write(`${line}\n`)} = deps;
  const local = (reason) => {
    if (reason) write(`${PLACEMENT_TEXT.LOCAL}${reason}`);
    return Promise.resolve(deps.runLocal(files, {failFast})).then(placementExitStatus);
  };
  const unavailable = (reason) => {
    write(`${PLACEMENT_TEXT.UNAVAILABLE}${reason}`);
    return PLACEMENT_EXIT.SETUP;
  };
  if (env[PLACEMENT_ENV] === PLACEMENT_LOCAL) return local(null);
  if (failFast) return local(PLACEMENT_TEXT.FAIL_FAST);
  const costs = deps.planCosts(files);
  const aloneMs = costs.reduce((sum, cost) => sum + cost.ms / cost.jobs, 0);
  if (aloneMs < PLACEMENT_MIN_PLAN_MS) return local(null);
  const sha = deps.commitAt();
  if (!sha) return unavailable(PLACEMENT_TEXT.NOT_A_COMMIT);
  let fleet;
  try {
    fleet = await deps.discover(sha);
  } catch (error) {
    return unavailable(`${discoveryFailureText(error)}${error.message}`);
  }
  if (fleet.machines.length === 0) return unavailable(PLACEMENT_TEXT.NO_MACHINE);
  // A controller without headroom takes only what no lab machine can.
  const headroom = deps.controllerHeadroom ? deps.controllerHeadroom() : CONTROLLER_FIT;
  const shards = placeTestFiles(costs, [{...CONTROLLER_MACHINE, tier: headroom.fit ? 0 : TIER.HOT},
    ...fleet.machines]);
  const remote = shards.filter((shard) => !shard.machine.controller);
  if (remote.length === 0) return local(PLACEMENT_TEXT.NO_GAIN);
  const controllerShard = shards.find((shard) => shard.machine.controller);
  if (controllerShard && typeof runLocalChild !== 'function') {
    return unavailable(PLACEMENT_TEXT.NO_CONTROLLER_CHILD);
  }
  let checkBase;
  try {
    checkBase = deps.checkBase();
  } catch (error) {
    return unavailable(`${PLACEMENT_TEXT.NO_CHECK_BASE}${error.message}`);
  }
  if (!checkBase) return unavailable(PLACEMENT_TEXT.NO_CHECK_BASE);
  reportPlacement({files, shards, headroom, aloneMs, write});
  // Every lab shard is on its way before the controller's own files start.
  const context = {deps, sha, forward: forwardedPolicy(env, checkBase), costs};
  const started = [];
  // While lab shards run, the controller's own files run in a child process
  // of their own group, never in this process's blocking lanes: a signal
  // handler here could not run until those lanes finished, so a Ctrl-C or a
  // SIGTERM would be held for the whole shard (verifier round 2). Interrupted,
  // the local child is cut first and every lab shard is aborted together,
  // synchronously.
  let here = null;
  const stop = () => {
    for (const close of [() => here?.abort?.(),
      () => abortTogether(started.map((entry) => entry.run))]) {
      try {
        close();
      } catch (error) {
        write(`${PLACEMENT_TEXT.UNAVAILABLE}cleanup: ${error.message}`);
      }
    }
  };
  const release = abortOnSignals(deps, stop);
  try {
    const acquired = await Promise.allSettled(remote.map(async (shard) => {
      const run = await startShard(shard, context);
      // Observe rejection immediately, including while another host starts.
      // Its original rejection is rethrown below; it is never a verdict.
      const settled = Promise.allSettled([run.done]).then(([outcome]) => outcome);
      const entry = {shard, run, settled};
      started.push(entry);
      return entry;
    }));
    const failedStart = acquired.find((entry) => entry.status === PLACEMENT_REJECTED);
    if (failedStart) throw failedStart.reason;
    if (controllerShard) {
      here = runLocalChild(controllerShard.files);
    }
    const settled = Promise.all(acquired.map(async ({value: entry}) => {
      const outcome = await entry.settled;
      if (outcome.status === PLACEMENT_REJECTED) throw outcome.reason;
      return {shard: entry.shard, outcome: outcome.value};
    }));
    const [controllerStatus, outcomes] = await Promise.all([here?.done, settled]);
    const statuses = controllerShard ? [placementExitStatus(controllerStatus)] : [];
    return settleRemoteShards(outcomes, {statuses, write});
  } catch (error) {
    stop();
    await Promise.allSettled([...started.map((entry) => entry.settled), here?.done]);
    throw error;
  } finally {
    release();
  }
}

// The placement decision, as the lines a placed run starts with.
function reportPlacement({files, shards, headroom, aloneMs, write}) {
  if (!headroom.fit) write(`${PLACEMENT_TEXT.PREFIX}${FLEET_CONTROLLER_NAME}: ${headroom.reason}`);
  write(`${PLACEMENT_TEXT.PREFIX}${files.length} files over ${shards.length} machines, ` +
    `~${minutes(Math.max(...shards.map((shard) => shard.loadMs)))} min ` +
    `(controller alone ~${minutes(aloneMs)} min)`);
  for (const shard of shards) {
    write(`${PLACEMENT_TEXT.PREFIX}${shard.machine.name}: ${shard.files.length} files, ` +
      `~${minutes(shard.loadMs)} min`);
  }
}

function discoveryFailureText(error) {
  if (REQUIREMENT_FAILURES.has(error?.code)) return PLACEMENT_TEXT.NO_REQUIREMENT;
  if (error?.code === DISCOVERY_FAILURE.INVENTORY_UNREADABLE) return PLACEMENT_TEXT.NO_INVENTORY;
  return PLACEMENT_TEXT.NO_DISCOVERY;
}
// Interrupted, hung up or terminated: cut everything a run started and exit.
// The handler stays installed and runs once: a hang-up arrives twice (the
// shell resends it, then the kernel), and a second Ctrl-C can come during
// the lab shells' grace. A listener removed on first use handed either back
// to the default action, which killed this process mid-abort and left the
// detached shards running (verifier, placement-fixture-followups round 1).
// Returns the removal of the handler.
function abortOnSignals(deps, cutAll) {
  let aborting = false;
  const interrupted = () => {
    if (aborting) return;
    aborting = true;
    cutAll();
    (deps.exit || process.exit)(PLACEMENT_EXIT.INTERRUPTED);
  };
  const signals = deps.signals || process;
  for (const signal of PLACEMENT_SIGNALS) signals.on(signal, interrupted);
  return () => {
    for (const signal of PLACEMENT_SIGNALS) signals.removeListener(signal, interrupted);
  };
}

function settleRemoteShards(settled, {statuses, write}) {
  settled.forEach(({shard, outcome}) => {
    relayShardLines(shard, outcome, write);
    const refusal = hostRefusal(shard, outcome, write);
    const {red, unreported} = logVerdicts(shard.files, outcome.log);
    if (unreported.length > 0) {
      write(`${PLACEMENT_TEXT.PREFIX}${shard.machine.name}: ${unreported.length}` +
        `${PLACEMENT_TEXT.UNREPORTED}${outcome.reason || `exit ${outcome.status}`}`);
    }
    if (red.size > 0) {
      write(`${PLACEMENT_TEXT.PREFIX}${shard.machine.name}: ${red.size}${PLACEMENT_TEXT.RED_THERE}`);
    }
    if (outcome.status !== 0) statuses.push(placementExitStatus(outcome.status));
    if (refusal || outcome.reason || unreported.length > 0) statuses.push(PLACEMENT_EXIT.SETUP);
    if (red.size > 0) statuses.push(1);
  });
  for (const status of statuses) if (status !== 0) return placementExitStatus(status);
  return 0;
}
// Discovery for a run that places `sha`: every machine is measured against
// that commit's requirement, whatever the controller's working tree holds.
async function discoverPlacement(root, env, sha) {
  const requirement = fleetRequirement(root, sha);
  let state;
  try {
    state = await loadState();
  } catch (error) {
    throw discoveryFailure(DISCOVERY_FAILURE.INVENTORY_UNREADABLE, error.message, error);
  }
  const fleet = await discoverFleet({
    nodes: Object.values(state.nodes || {}),
    controllerRepoPath: root,
    ...requirement,
  });
  await saveState(recordFleet(state, fleet));
  const factor = Number(env[PLACEMENT_MACHINE_FACTOR_ENV]);
  const controllerFactor = factor >= 1 ? factor : 1;
  return {
    fleet,
    machines: placementMachines(fleet, state, {controllerFactor}),
    held: placementMachines(fleet, state, {controllerFactor, held: true}),
  };
}
/**
 * The real collaborators of runPlacedTestFiles, given the classified runner's
 * own planning and execution.
 * @param {{root: string, failFast?: boolean, env?: Object, planCosts: Function,
 *   runLocal: Function}} input
 * @return {Object}
 */
export function placementDeps({root, failFast = false, env = process.env,
  planCosts, runLocal}) {
  return {
    failFast, env, planCosts, runLocal,
    runLocalChild: (files) => runClassifiedChild(root, files, env),
    commitAt: () => commitAt(root, env),
    checkBase: () => resolvedCheckBaseCommit(null, env, root),
    discover: (sha) => discoverPlacement(root, env, sha),
    runRemote: (shard, options) => startRemoteShard(shard, {...options, root}),
    controllerHeadroom: () => controllerHeadroom({env}),
  };
}
/**
 * Whether the controller may take files this run: one reading of the thermal
 * owner (no wait; its skip variable honoured) under its hold thresholds, and
 * the one-minute load under the load owner's threshold for its cores.
 * @param {{env?: Object, thermal?: Function, load?: number, cores?: number}} [input]
 * @return {{fit: boolean, reason: string|null}}
 */
export function controllerHeadroom({env = process.env,
  thermal = () => waitForThermalHeadroom({attempts: 0, env}),
  load = os.loadavg()[0], cores = os.cpus().length} = {}) {
  const reading = thermal();
  const threshold = defaultLoadThreshold(cores);
  const reason = reading.outcome === HEADROOM.EXHAUSTED ?
    `${LAB_TEST_TEXT.HOT}${reading.reading.reason}` :
    load >= threshold ? `${LAB_TEST_TEXT.LOADED}${load.toFixed(1)} >= ` +
      `${threshold.toFixed(1)} (${cores} cores)` : null;
  return reason === null ? CONTROLLER_FIT : {fit: false, reason};
}

export {
  CONTROLLER_FIT, CONTROLLER_MACHINE, PLACEMENT_MIN_PLAN_MS, TIER,
  abortOnSignals, deadlineFor, discoverPlacement, logVerdicts, minutes,
  reportHostBusy, reportThermalUnfit,
};
