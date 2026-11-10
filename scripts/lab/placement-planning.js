// Deterministic placement calculations delegated by probe; no runtime starts or settlement.
import {MS_PER_SECOND, MS_PER_MINUTE, LAB_LOCK_WAIT_MAX_MS,
  LAB_LOCK_STATE} from './machine-lock.js';
import {PLACEMENT_TEXT, LAB_TEST_TEXT} from './placement-contract.js';
import {FLEET_CONTROLLER_NAME, FLEET_TEXT, fleetVerdict} from './fleet-discovery.js';

// Below this the whole plan costs less on the controller than waiting for a
// lab machine's setup is worth: the common small cone never probes at all.
const PLACEMENT_MIN_PLAN_MS = 5 * MS_PER_MINUTE;
// Bundle, fetch, worktree and nvm on a lab machine, charged before its files.
const PLACEMENT_REMOTE_SETUP_MS = 30 * MS_PER_SECOND;
// A file goes to a lab machine only if its duration there - measured here,
// scaled by the machine's speed - is at most half the runner's default
// per-file timeout. The first placed run gave an 8-thread machine at speed
// x2.13 a 4-minute simulation file, which timed out at 600 s there and then
// ran again here (measured 2026-09-18).
const PLACEMENT_FILE_FIT_MS = 5 * MS_PER_MINUTE;
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
 *   cores?: number, tier?: number, avoid?: string[]}>} machines
 * @param {{setupMs?: number}} [options]
 * @return {Array<{machine: Object, files: string[], loadMs: number}>}
 */
function placeTestFiles(costs, machines, {setupMs = PLACEMENT_REMOTE_SETUP_MS} = {}) {
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
// machine not a file it is known to fail, nor one it could not finish well
// inside the per-file timeout.
function fits(machine, cost) {
  if (machine.controller) return true;
  return !machine.avoid?.includes(cost.file) &&
    cost.ms * machine.speed <= PLACEMENT_FILE_FIT_MS;
}

// What a routing miss is remembered against: the machine's gaps and node.
// Install a tool or change node and its misses are forgotten, since they may
// have been exactly that.
function placementGapsKey(entry) {
  return [...(entry.readiness?.gaps || []), entry.capability?.nodeVersion || '']
    .join(FLEET_TEXT.LIST);
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
function placementMachines(fleet, state, {controllerFactor = 1, held = false,
  now = Date.now()} = {}) {
  const reference = fleet.find((entry) => entry.controller)?.capability?.cpuSampleMs;
  const machines = [];
  for (const entry of fleet) {
    const cap = entry.capability;
    const node = state.nodes?.[entry.name];
    if (!(reference > 0) || !isPlaceable(entry, node, held)) continue;
    machines.push(placementMachine(entry, node, cap, reference, controllerFactor, held, now));
  }
  return machines;
}

function placementMachine(entry, node, cap, reference, controllerFactor, held, now) {
  const speed = cap.cpuSampleMs / reference;
  const gapsKey = placementGapsKey(entry);
  return {
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
    nodeMajor: String(cap.nodeVersion || '').replace(/^v/u, '')
      .split(PLACEMENT_VERSION_SEPARATOR)[0],
    gapsKey,
    avoid: node.placement?.gapsKey === gapsKey ? [...node.placement.avoid] : [],
    ...(held ? {waitMs: holdWaitMs(cap.machineLock?.holder, now)} : {}),
  };
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
  const reachable = isReachable(entry, node, cap, held);
  return distinct && reachable && Boolean(cap?.repoPath) && Boolean(cap.repo?.head) &&
    cap.cpuSampleMs > 0;
}

function isReachable(entry, node, cap, held) {
  return Boolean(node?.ssh) && entry.readiness?.ready === true &&
    (cap?.machineLock?.state === LAB_LOCK_STATE.BUSY) === held;
}

/**
 * Remember files that were red on a machine and green on the controller, so
 * the next placed run sends them elsewhere.
 * @param {Object} state
 * @param {string} name
 * @param {string} gapsKey
 * @param {string[]} files
 * @return {Object} the same state
 */
function recordPlacementMisses(state, name, gapsKey, files) {
  const node = state.nodes?.[name];
  if (!node || files.length === 0) return state;
  const kept = node.placement?.gapsKey === gapsKey ? node.placement.avoid : [];
  node.placement = {gapsKey, avoid: [...new Set([...kept, ...files])].sort()};
  return state;
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

function bySpeed(left, right) {
  return left.speed - right.speed;
}

/**
 * Which machine runs which lanes of a hand run. Without --split every lane
 * goes to one lab machine: the one named, or the fastest measured this run.
 * With --split the files are spread by measured cost (placeTestFiles) as
 * planLabSplit decides. Each machine's own runner takes its lanes one after
 * another, so the exclusive lane still shares its machine with nothing.
 * @param {Array<{resourceClass: string, files: string[], jobs: number}>} plan
 * @param {Array<Object>} machines placementMachines' result
 * @param {{on?: string|null, split?: boolean, controller?: Object,
 *   fleet?: Array<Object>, costs?: Array<Object>, held?: Array<Object>,
 *   controllerHeadroom?: {fit: boolean}}} [options]
 * @return {Array<{machine: Object, lanes: Array<Object>}>}
 */
function placeLabLanes(plan, machines, {on = null, split = false,
  controller = CONTROLLER_MACHINE, fleet = [], costs = [], held = [],
  controllerHeadroom = CONTROLLER_FIT} = {}) {
  if (split) {
    return planLabSplit(plan, machines, {controller, costs, held, controllerHeadroom}).assignments;
  }
  return singleLabPlacement(plan, machines, on, fleet);
}

function singleLabPlacement(plan, machines, on, fleet) {
  if (machines.length === 0) throw new Error(PLACEMENT_TEXT.NO_MACHINE);
  const first = on === null ? [...machines].sort(bySpeed)[0] :
    machines.find((machine) => machine.name === on);
  if (!first) {
    const entry = fleet.find((one) => one.name === on);
    throw new Error(`${on}${LAB_TEST_TEXT.NOT_READY}` +
      `${entry ? fleetVerdict(entry) : LAB_TEST_TEXT.NOT_LISTED}`);
  }
  return [{machine: first, lanes: plan}];
}

// The controller is a reserve while the lab can carry the run (owner,
// 2026-10-05: test work is parallelized on the lab machines as much as
// possible; the controller is the machine every agent works on, and it runs
// hot). From this many free lab hosts - or this many held ones whose locks
// free within the shares' own waits - it takes only what no lab host fits.
const CONTROLLER_RESERVE_MIN_HOSTS = 2;
const CONTROLLER_ROLE_TEXT = Object.freeze({
  LINE: 'controller: ',
  RESERVE: 'reserve - ',
  FREE: ' free lab hosts',
  QUEUED: ' held lab hosts, queued on their locks (longest expected wait ~',
  QUEUED_CLOSE: ' min)',
  PEER: 'peer - ',
  FEW: ' free lab host(s), fewer than ',
  LATE: ' held lab host(s) expected busy past their shares\' lock wait',
  TAKES: '; takes ',
  FILES: ' file(s)',
  UNFIT: ', only what no lab host fits',
});

/**
 * A --split plan and the controller's part in it, with why. The rule:
 * - a controller without headroom takes only what no lab host fits;
 * - with CONTROLLER_RESERVE_MIN_HOSTS free lab hosts it is a reserve: it
 *   takes only what no lab host fits, and held hosts only what no free one does;
 * - else with that many held hosts it is a reserve too: the held hosts are
 *   peers whose shares queue on their locks, charged their holders' expected
 *   wait - unless a share's host is expected to stay held past that share's
 *   own bounded lock wait, when the controller is the way to finish and
 *   takes part as a peer;
 * - else it takes part as a peer, and held hosts take only what no free
 *   machine does.
 * @param {Array<Object>} plan the lanes
 * @param {Array<Object>} machines the free ready lab machines
 * @param {{controller?: Object, costs?: Array<Object>, held?: Array<Object>,
 *   controllerHeadroom?: {fit: boolean, reason: string|null}}} [options]
 * @return {{assignments: Array<Object>, controller: {reason: string,
 *   reserve: boolean}}}
 */
function planLabSplit(plan, machines, {controller = CONTROLLER_MACHINE, costs = [],
  held = [], controllerHeadroom = CONTROLLER_FIT} = {}) {
  if (machines.length + held.length === 0) throw new Error(PLACEMENT_TEXT.NO_MACHINE);
  const split = (tier, heldMachines) =>
    splitLanes(plan, [{...controller, tier}, ...machines, ...heldMachines], costs);
  const heldTier = held.map((machine) => ({...machine, tier: TIER.HELD}));
  const role = (assignments, reason, reserve) => ({assignments, controller: {reason, reserve}});
  if (!controllerHeadroom.fit) {
    return role(split(TIER.HOT, heldTier), controllerHeadroom.reason, true);
  }
  if (machines.length >= CONTROLLER_RESERVE_MIN_HOSTS) {
    return role(split(TIER.HOT, heldTier), `${CONTROLLER_ROLE_TEXT.RESERVE}${machines.length}` +
      `${CONTROLLER_ROLE_TEXT.FREE}`, true);
  }
  if (held.length >= CONTROLLER_RESERVE_MIN_HOSTS) {
    const queued = split(TIER.HOT, held.map((machine) =>
      ({...machine, waitMs: machine.waitMs ?? LAB_LOCK_WAIT_MAX_MS})));
    const late = lateQueuedShares(queued, costs);
    if (late.length === 0) return role(queued, queuedReason(machines, held, queued), true);
    return role(split(0, heldTier), `${CONTROLLER_ROLE_TEXT.PEER}${late.length}` +
      `${CONTROLLER_ROLE_TEXT.LATE}`, false);
  }
  return role(split(0, heldTier), `${CONTROLLER_ROLE_TEXT.PEER}${machines.length}` +
    `${CONTROLLER_ROLE_TEXT.FEW}${CONTROLLER_RESERVE_MIN_HOSTS}`, false);
}

// The queued shares whose host is expected to stay held past the share's own
// lock wait - its estimate, capped as every lab lock wait is - so the share
// would refuse busy rather than run.
function lateQueuedShares(assignments, costs) {
  const costOf = new Map(costs.map((cost) => [cost.file, cost.ms / cost.jobs]));
  return assignments.filter(({machine, lanes}) => machine.waitMs !== undefined &&
    machine.waitMs > Math.min(LAB_LOCK_WAIT_MAX_MS,
      labShareEstimateMs(machine, lanes.flatMap((lane) => lane.files), costOf)));
}

function queuedReason(machines, held, assignments) {
  const waits = assignments.map(({machine}) => machine.waitMs ?? 0);
  return `${CONTROLLER_ROLE_TEXT.RESERVE}${machines.length}${CONTROLLER_ROLE_TEXT.FREE}, ` +
    `${held.length}${CONTROLLER_ROLE_TEXT.QUEUED}${minutes(Math.max(0, ...waits))}` +
    `${CONTROLLER_ROLE_TEXT.QUEUED_CLOSE}`;
}

/**
 * The plan line that says what the controller took in a split, and why.
 * @param {{assignments: Array<Object>, controller: {reason: string,
 *   reserve: boolean}}} split planLabSplit's result
 * @return {string}
 */
function formatLabController({assignments, controller}) {
  const files = assignments.filter(({machine}) => machine.controller)
    .reduce((sum, {lanes}) => sum + lanes.reduce((count, lane) => count + lane.files.length, 0), 0);
  return `${LAB_TEST_TEXT.PREFIX}${CONTROLLER_ROLE_TEXT.LINE}${controller.reason}` +
    `${CONTROLLER_ROLE_TEXT.TAKES}${files}${CONTROLLER_ROLE_TEXT.FILES}` +
    `${controller.reserve ? CONTROLLER_ROLE_TEXT.UNFIT : ''}`;
}

// A lab machine's estimate for a share, as its shard announces it and waits
// for the lock: its setup, then its files' cost scaled by its speed.
function labShareEstimateMs(machine, files, costOf) {
  return PLACEMENT_REMOTE_SETUP_MS +
    files.reduce((sum, file) => sum + (costOf.get(file) || 0), 0) * machine.speed;
}

// The plan's files spread by cost, each machine's share as its own lanes.
function splitLanes(plan, candidates, costs) {
  const costOf = new Map(costs.map((cost) => [cost.file, cost]));
  const priced = plan.flatMap((lane) => lane.files.map((file) =>
    costOf.get(file) ?? {file, ms: 0, jobs: lane.jobs}));
  return placeTestFiles(priced, candidates).map((shard) => {
    const files = new Set(shard.files);
    return {machine: shard.machine, loadMs: shard.loadMs,
      lanes: plan.map((lane) => ({...lane, files: lane.files.filter((file) => files.has(file))}))
        .filter((lane) => lane.files.length > 0)};
  });
}

export {PLACEMENT_MIN_PLAN_MS, PLACEMENT_REMOTE_SETUP_MS, placeTestFiles, fits, placementMachines,
  recordPlacementMisses, TIER, CONTROLLER_FIT, CONTROLLER_MACHINE, minutes, bySpeed,
  placeLabLanes, planLabSplit, formatLabController, labShareEstimateMs};
