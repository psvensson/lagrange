import {THERMAL_ENDPOINT_ENV} from '../checks/wait-for-thermal-headroom.js';
// The hand-lab test command's exact planning checkout, assignments and observed results.
import fs from 'node:fs';
import path from 'node:path';
import {gitProcessEnvironment} from '../checks/git-process-environment.js';
import {IMPORT_GRAPH_PATH, IMPORT_GRAPH_SEAL_PATH} from '../checks/impact-proof-cone-constants.js';
import {PROOF_CHECKOUT_GENERATORS} from '../checks/proof-checkout-preparation.js';
import {formatTestFilesSummary, relayedLine} from '../run-test-files.js';
import {removeWorktree} from '../session-worktree.js';
import {FLEET_FACTOR_DIGITS, FLEET_UNKNOWN, fleetVerdict} from './fleet-discovery.js';
import {LAB_LOCK_STATE, LAB_LOCK_WAIT_MAX_MS} from './machine-lock-constants.js';
import {labLockText, labTestPurpose} from './machine-hold.js';
import {LAB_TEST_TEXT, PLACEMENT_EXIT, PLACEMENT_NEWLINE, PLACEMENT_REJECTED,
  PLACEMENT_REMOTE_SETUP_MS, PLACEMENT_RESULTS_PREFIX, PLACEMENT_RUN_SHA_CHARACTERS,
  PLACEMENT_STREAM, PLACEMENT_TEXT} from './placement-constants.js';
import {abortTogether, forwardedPolicy, placementExitStatus, runClassifiedChild,
  startRemoteShard} from './placement-execution.js';
import {commitAt, gitAt, safeName} from './placement-source.js';
import {CONTROLLER_FIT, CONTROLLER_MACHINE, TIER, abortOnSignals, controllerHeadroom,
  deadlineFor, discoverPlacement, filePlacementCost, logVerdicts, minutes, placeTestFiles,
  reportHostBusy, reportThermalUnfit} from './test-placement.js';

const EMPTY = '';

// ---------------------------------------------------------------------------
// The hand verb: `lab test <profile> --lane <lane> [--on NAME] [--sha COMMIT]
// [--split]`. No new placement layer: the exact commit goes out through the
// same bundle and shard path a placed run uses, and each lane runs under its
// own job policy because the machine's classified runner plans it again.
// What is new is who chooses - the operator names a lane, and a machine or
// none - and that each file's verdict is shown as it lands, not at settle.
// The machine still comes from this run's discovery, never from a name in
// any setup; `--on` is a choice made at run time.

const LAB_TEST_PARENT = 'test-output/lab-test-worktrees';
// What planning a commit's lanes reads: its test tree and its npm scripts.
const LAB_TEST_PLANNED_PATHS = Object.freeze(['test', 'package.json']);
// Where a runner leaves its per-file results ledger, and where a machine's
// copy comes back to, named for the machine.
const LAB_TEST_RESULTS_FILE = 'test-output/reports/test-results.ndjson';
const LAB_TEST_RESULTS_DIR = 'test-output/reports';
const LAB_TEST_RESULTS_STEM = 'test-results-';
const LAB_TEST_RESULTS_EXTENSION = '.ndjson';
const LAB_TEST_KIB_PER_GIB = 1024 * 1024;
const LAB_TEST_MEMORY_DIGITS = 1;
const LAB_TEST_FAILED = 1;
const LAB_TEST_GIT = Object.freeze({
  RESOLVE: Object.freeze(['rev-parse', '--verify', '--quiet', '--end-of-options']),
  COMMIT_SUFFIX: '^{commit}',
  ADD: Object.freeze(['worktree', 'add', '--detach', '--no-checkout', '--quiet']),
  CHECKOUT: Object.freeze(['checkout', '--quiet']),
  PATHS: '--',
});
function gitMust(root, args) {
  const result = gitAt(root, args);
  if (result.status !== 0) {
    throw new Error(`${LAB_TEST_TEXT.PLANNING_FAILED}${String(result.stderr || EMPTY).trim()}`);
  }
  return result;
}

/**
 * The commit a hand lab run sends, and a checkout to plan it from. With no
 * `sha` the tree must be exactly a commit - a working tree is never sent - and
 * with one, any tree will do: the commit is named. Planning reads that
 * commit's own test tree, checked out alone into a throwaway worktree whose
 * HEAD is the commit, which is also what its bundle is made from. `release`
 * removes it once through the canonical worktree owner. A repeated release
 * reports the same first failure without another destructive attempt.
 * @param {{root: string, sha?: string|null}} input
 * @return {{sha: string, gitRoot: string, release: Function}}
 */
export function labTestCommit({root, sha = null}) {
  const resolved = sha ? resolveCommit(root, sha) : commitAt(root);
  if (!resolved) throw new Error(`${PLACEMENT_TEXT.NOT_A_COMMIT}${LAB_TEST_TEXT.NAME_ONE}`);
  const parent = path.join(root, LAB_TEST_PARENT);
  fs.mkdirSync(parent, {recursive: true});
  const reserved = fs.mkdtempSync(path.join(parent,
    `${resolved.slice(0, PLACEMENT_RUN_SHA_CHARACTERS)}-`));
  const gitRoot = path.join(reserved, 'tree');
  let acquired = false;
  const releaseOutcome = {attempted: false, failed: false};
  const release = () => {
    if (releaseOutcome.attempted) {
      if (releaseOutcome.failed) throw releaseOutcome.error;
      return;
    }
    releaseOutcome.attempted = true;
    try {
      removeWorktree(root, gitRoot);
      fs.rmdirSync(reserved);
    } catch (error) {
      Object.assign(releaseOutcome, {failed: true, error});
      throw error;
    }
  };
  try {
    gitMust(root, [...LAB_TEST_GIT.ADD, gitRoot, resolved]);
    acquired = true;
    gitMust(gitRoot, [...LAB_TEST_GIT.CHECKOUT, resolved, LAB_TEST_GIT.PATHS,
      ...LAB_TEST_PLANNED_PATHS]);
  } catch (error) {
    if (acquired) {
      try {
        release();
      } catch (cleanupError) {
        process.stderr.write(`${LAB_TEST_TEXT.PREFIX}planning cleanup unavailable at ` +
          `${gitRoot}: ${cleanupError.message}\n`);
      }
    } else {
      process.stderr.write(`${LAB_TEST_TEXT.PREFIX}planning acquisition unavailable at ` +
        `${gitRoot}: ${error.message}\n`);
    }
    throw error;
  }
  return {sha: resolved, gitRoot, release};
}

function resolveCommit(root, name) {
  const result = gitAt(root, [...LAB_TEST_GIT.RESOLVE, `${name}${LAB_TEST_GIT.COMMIT_SUFFIX}`]);
  if (result.status !== 0) throw new Error(`${name}${LAB_TEST_TEXT.NOT_A_COMMIT}`);
  return result.stdout.trim();
}

// The change cone of a hand run is the selector's own plan of the commit,
// measured from the base the operator named with --base-sha. With none named
// the selector applies its own default - the merge base with the publication
// remote, origin/main - so the lab never restates that decision. The named
// base reaches the one owner of the changed set, which is also what decides a
// release-surface refusal: a path changed only before the base is not part
// of the change.
const LAB_TEST_SELECTOR = Object.freeze({SCRIPT: 'scripts/select-change-tests.js',
  LIST: '--list', HEAD: '--head', BASE: '--base'});

/**
 * The selector invocation that lists the change cone of `sha` against
 * `baseSha`, or against the selector's default base when none is named.
 * @param {{sha: string, baseSha?: string|null}} input
 * @return {string[]}
 */
export function labTestSelectorArgs({sha, baseSha = null}) {
  const base = baseSha ? [LAB_TEST_SELECTOR.BASE, baseSha] : [];
  return [LAB_TEST_SELECTOR.SCRIPT, LAB_TEST_SELECTOR.LIST, LAB_TEST_SELECTOR.HEAD, sha, ...base];
}

/**
 * The generated import graph the selector reads from the checkout it runs in,
 * made by its own producer when that checkout never generated one (a fresh
 * worktree): without it a changed test helper refuses the whole run as
 * UNKNOWN_SCOPE. A graph already there is the operator's and is left as it
 * is, and so is the tracked seal: one the producer rewrote is put back, so a
 * tree with uncommitted import changes stays as it was and the selector
 * refuses on it in its own words.
 * @param {string} root the checkout the selector runs in
 * @param {{produce: Function, write: Function}} io `produce(args, cwd)`
 *   runs node with args there; `write(line)` reports the step
 * @return {Promise<boolean>} whether the graph was generated
 */
export async function prepareSelectorImportGraph(root, {produce, write}) {
  if (fs.existsSync(path.join(root, IMPORT_GRAPH_PATH))) return false;
  const sealPath = path.join(root, IMPORT_GRAPH_SEAL_PATH);
  const seal = fs.existsSync(sealPath) ? fs.readFileSync(sealPath) : null;
  write(`${LAB_TEST_TEXT.PREFIX}${LAB_TEST_TEXT.GRAPH}${root}`);
  const [generator] = PROOF_CHECKOUT_GENERATORS;
  await produce([generator.producer, ...generator.args], root);
  if (seal !== null && !seal.equals(fs.readFileSync(sealPath))) fs.writeFileSync(sealPath, seal);
  return true;
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
export function placeLabLanes(plan, machines, {on = null, split = false,
  controller = CONTROLLER_MACHINE, fleet = [], costs = [], held = [],
  controllerHeadroom = CONTROLLER_FIT} = {}) {
  if (split) {
    return planLabSplit(plan, machines, {controller, costs, held, controllerHeadroom}).assignments;
  }
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
export function planLabSplit(plan, machines, {controller = CONTROLLER_MACHINE, costs = [],
  held = [], controllerHeadroom = CONTROLLER_FIT} = {}) {
  if (machines.length + held.length === 0) throw new Error(PLACEMENT_TEXT.NO_MACHINE);
  const split = (tier, heldMachines) =>
    splitLanes(plan, [...(controller.executionPolicy === null ? [] :
      [{...controller, tier}]), ...machines, ...heldMachines], costs);
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
  const costOf = new Map(costs.map((cost) => [cost.file, cost]));
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
export function formatLabController({assignments, controller}) {
  const files = assignments.filter(({machine}) => machine.controller)
    .reduce((sum, {lanes}) => sum + lanes.reduce((count, lane) => count + lane.files.length, 0), 0);
  return `${LAB_TEST_TEXT.PREFIX}${CONTROLLER_ROLE_TEXT.LINE}${controller.reason}` +
    `${CONTROLLER_ROLE_TEXT.TAKES}${files}${CONTROLLER_ROLE_TEXT.FILES}` +
    `${controller.reserve ? CONTROLLER_ROLE_TEXT.UNFIT : EMPTY}`;
}

// A lab machine's estimate for a share, as its shard announces it and waits
// for the lock: its setup, then its files' cost scaled by its speed.
function labShareEstimateMs(machine, files, costOf) {
  return PLACEMENT_REMOTE_SETUP_MS +
    files.reduce((sum, file) => {
      const cost = costOf.get(file);
      if (!cost) throw new Error(`missing placement cost: ${file}`);
      return sum + filePlacementCost(machine, cost);
    }, 0) + Math.max(0, files.length - 1) * machine.executionPolicy.cadence_ms;
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

/**
 * Why each machine of the fleet a placement left out was left out, one line
 * each, so a bad split is visible before anything runs.
 * @param {Array<Object>} fleet discoverFleet's result
 * @param {Array<{machine: Object}>} assignments
 * @param {{fit: boolean, reason: string|null}} headroom the controller's
 * @return {string[]}
 */
export function formatLabSkipped(fleet, assignments, headroom = CONTROLLER_FIT) {
  const used = new Set(assignments.map(({machine}) => machine.name));
  return fleet.filter((entry) => !used.has(entry.name)).map((entry) =>
    `${LAB_TEST_TEXT.PREFIX}${LAB_TEST_TEXT.SKIPPED}${entry.name}: ${skipReason(entry, headroom)}`);
}

function skipReason(entry, headroom) {
  if (entry.controller) return headroom.reason ?? LAB_TEST_TEXT.NOT_NEEDED;
  if (entry.error || entry.sameMachineAs || !entry.readiness?.ready) return fleetVerdict(entry);
  const lock = entry.capability?.machineLock;
  return lock?.state === LAB_LOCK_STATE.BUSY ? labLockText(lock) : LAB_TEST_TEXT.NOT_NEEDED;
}

function gibibytes(memKiB) {
  return memKiB > 0 ? (memKiB / LAB_TEST_KIB_PER_GIB).toFixed(LAB_TEST_MEMORY_DIGITS) :
    FLEET_UNKNOWN;
}

/**
 * The decision, one line per machine, with the capacities it was made from.
 * @param {Array<{machine: Object, lanes: Array<Object>}>} assignments
 * @return {string[]}
 */
export function formatLabDecision(assignments) {
  return assignments.map(({machine, lanes, loadMs}) => {
    const files = lanes.reduce((sum, lane) => sum + lane.files.length, 0);
    return `${LAB_TEST_TEXT.PREFIX}${machine.name}: ` +
      `${lanes.map((lane) => lane.resourceClass).join(LAB_TEST_TEXT.LANES)} (${files} files) ` +
      `cores=${machine.cores ?? FLEET_UNKNOWN} mem=${gibibytes(machine.memKiB)}GiB ` +
      `speed x${machine.speed.toFixed(FLEET_FACTOR_DIGITS)}` +
      (loadMs === undefined ? EMPTY : ` ~${minutes(loadMs)} min`);
  });
}

// A split's controller headroom: its tree must be exactly the commit it
// runs, and it must have thermal and load headroom.
function splitHeadroom(deps, sha, controller) {
  if (deps.commitAt() !== sha) return {fit: false, reason: `${LAB_TEST_TEXT.CONTROLLER_TREE}${sha}`};
  return deps.controllerHeadroom(controller.thermalEndpoint);
}

function controllerMachine(fleet) {
  const capability = fleet.find((entry) => entry.controller)?.capability;
  return {...CONTROLLER_MACHINE, cores: capability?.cores ?? null,
    thermalEndpoint: capability?.thermalEndpoint,
    executionPolicy: capability?.thermalDecision?.execution_policy ?? null,
    memKiB: capability?.memKiB ?? null};
}

// One machine's share, started: its lanes' files, the lines it streamed, and
// the run to wait for. The controller's share runs as the placed run's own
// child does; a lab machine's through the shard path, with the commit bundled
// from the planning checkout.
function startLabShare({machine, lanes}, {commit, deps, forward, results, costOf, write}) {
  const files = lanes.flatMap((lane) => lane.files);
  const lines = [];
  const onLine = (line, stream) => {
    if (stream === PLACEMENT_STREAM.OUT) lines.push(line);
    if (!line.startsWith(PLACEMENT_RESULTS_PREFIX)) write(relayedLine(machine.name, line));
  };
  if (machine.controller) {
    return {machine, files, lines,
      run: deps.runLocalChild(files, {onLine, checkBase: forward.checkBase,
        thermalEndpoint: machine.thermalEndpoint,
        deadlineMs: deadlineFor({loadMs: labShareEstimateMs(machine, files, costOf)})})};
  }
  const loadMs = labShareEstimateMs(machine, files, costOf);
  const run = deps.runRemote({machine, files}, {sha: commit.sha, gitRoot: commit.gitRoot,
    deadlineMs: deadlineFor({loadMs}), forward, results, onLine,
    holder: {purpose: labTestPurpose(lanes.map((lane) => lane.resourceClass)),
      expectedMs: loadMs}});
  return {machine, files, lines, run};
}

// A machine's results ledger, back under its name beside the controller's.
function copyLabResults(share, root, write) {
  const records = share.lines.filter((line) => line.startsWith(PLACEMENT_RESULTS_PREFIX))
    .map((line) => line.slice(PLACEMENT_RESULTS_PREFIX.length));
  if (records.length === 0) return;
  const file = path.join(LAB_TEST_RESULTS_DIR,
    `${LAB_TEST_RESULTS_STEM}${safeName(share.machine.name)}${LAB_TEST_RESULTS_EXTENSION}`);
  fs.mkdirSync(path.join(root, LAB_TEST_RESULTS_DIR), {recursive: true});
  fs.writeFileSync(path.join(root, file), `${records.join(PLACEMENT_NEWLINE)}${PLACEMENT_NEWLINE}`);
  write(`${LAB_TEST_TEXT.PREFIX}${share.machine.name}: ${LAB_TEST_TEXT.COPIED}${file}`);
}

// Every share's verdicts, from its own lines: what it proved, what was red,
// and what never reported - which is a failure, never a pass.
async function settleLabShares(shares, {root, write}) {
  const totals = {total: 0, passed: 0, failed: 0, assertions: 0};
  let status = 0;
  for (const share of shares) {
    const outcome = await share.run.done;
    const exit = placementExitStatus(typeof outcome === 'number' ? outcome : outcome?.status);
    const {green, red, assertions, unreported} = logVerdicts(share.files,
      share.lines.join(PLACEMENT_NEWLINE));
    const summary = {
      total: share.files.length,
      passed: [...green].filter((file) => !red.has(file)).length,
      failed: red.size + unreported.length,
      assertions: [...assertions.values()].reduce((sum, count) => sum + count, 0),
    };
    reportThermalUnfit(share.machine.name, share.lines, write);
    if (exit === PLACEMENT_EXIT.BUSY) reportHostBusy(share.machine.name, share.lines, write);
    write(`${LAB_TEST_TEXT.PREFIX}${share.machine.name}: ${formatTestFilesSummary(summary)}`);
    if (unreported.length > 0) {
      write(`${LAB_TEST_TEXT.PREFIX}${share.machine.name}: ${unreported.length}` +
        `${LAB_TEST_TEXT.UNREPORTED}${outcome?.reason || `exit ${exit}`}`);
    }
    copyLabResults(share, root, write);
    for (const key of Object.keys(totals)) totals[key] += summary[key];
    if (exit !== 0 || outcome?.reason || summary.failed > 0) status = LAB_TEST_FAILED;
  }
  write(formatTestFilesSummary(totals));
  return status;
}

/**
 * Run a hand lab test: place the planned lanes, start every share, stream
 * each machine's lines as they land, and end with the runner's own summary,
 * merged over the machines. The planning checkout is released once every
 * share has its commit. Interrupted, every share is cut.
 * `checkBase` is the commit every share's history walks measure from (the
 * operator's --base-sha or the controller's own base, resolved), or null.
 * @param {{plan: Array<Object>, costs?: Array<Object>, commit: Object,
 *   checkBase?: string|null, on?: string|null, split?: boolean, root: string,
 *   results?: string, env?: Object, write?: Function}} request
 * @param {Object} deps labTestDeps' collaborators (discover, runRemote,
 *   runLocalChild, commitAt; signals and exit optional)
 * @return {Promise<number>} exit status
 */
export async function runLabTest({plan, costs = [], commit, checkBase, on = null,
  split = false, root, results = LAB_TEST_RESULTS_FILE, env = process.env,
  write = (line) => process.stdout.write(`${line}${PLACEMENT_NEWLINE}`)}, deps) {
  const shares = [];
  let commitReleased = false;
  const releaseCommit = () => {
    if (commitReleased) return;
    commitReleased = true;
    commit.release();
  };
  const stop = () => {
    for (const close of [() => abortTogether(shares.map((share) => share.run)), releaseCommit]) {
      try {
        close();
      } catch (error) {
        write(`${PLACEMENT_TEXT.UNAVAILABLE}cleanup: ${error.message}`);
      }
    }
  };
  const releaseSignals = abortOnSignals(deps, stop);
  try {
    const {fleet = [], machines, held = []} = await deps.discover(commit.sha);
    const placed = split ? planLabSplit(plan, machines, {held, costs,
      controller: controllerMachine(fleet),
      controllerHeadroom: await splitHeadroom(deps, commit.sha, controllerMachine(fleet))}) :
      {assignments: placeLabLanes(plan, machines, {on, fleet})};
    const {assignments} = placed;
    for (const line of [...formatLabDecision(assignments), ...(split ? [formatLabController(placed),
      ...formatLabSkipped(fleet, assignments, placed.controller)] : [])]) write(line);
    if (assignments.some(({machine}) => machine.controller) && deps.commitAt() !== commit.sha) {
      throw new Error(`${LAB_TEST_TEXT.CONTROLLER_TREE}${commit.sha}`);
    }
    const costOf = new Map(costs.map((cost) => [cost.file, cost]));
    const context = {commit, deps, forward: forwardedPolicy(env, checkBase), results, costOf,
      write};
    for (const assignment of assignments) {
      const share = startLabShare(assignment, context);
      // Observe failure before the next acquisition; the child is owned from
      // this point even if a later start or planning-checkout cleanup throws.
      share.settled = Promise.allSettled([share.run.done]).then(([outcome]) => outcome);
      shares.push(share);
    }
    releaseCommit();
    await Promise.all(shares.map(async (share) => {
      const outcome = await share.settled;
      if (outcome.status === PLACEMENT_REJECTED) throw outcome.reason;
    }));
    return await settleLabShares(shares, {root, write});
  } catch (error) {
    stop();
    await Promise.allSettled(shares.map((share) => share.settled));
    throw error;
  } finally {
    releaseSignals();
  }
}

/**
 * The real collaborators of runLabTest for a checkout.
 * @param {{root: string, env?: Object}} input
 * @return {Object}
 */
export function labTestDeps({root, env = gitProcessEnvironment()}) {
  return {
    discover: (sha) => discoverPlacement(root, env, sha),
    runRemote: (shard, options) => startRemoteShard(shard, {...options, root, env}),
    runLocalChild: (files, options) => runClassifiedChild(root, files, env, options),
    commitAt: () => commitAt(root, env),
    controllerHeadroom: (endpoint) => controllerHeadroom({env: {...env,
      [THERMAL_ENDPOINT_ENV]: JSON.stringify(endpoint)}}),
  };
}

export {LAB_TEST_RESULTS_FILE};
