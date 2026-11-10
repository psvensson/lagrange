import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {resolvedCheckBaseCommit} from '../checks/changed-paths.js';
import {gitProcessEnvironment} from '../checks/git-process-environment.js';
import {defaultLoadThreshold} from '../checks/wait-for-load-headroom.js';
import {HEADROOM, THERMAL_REFUSAL_LINE,
  waitForThermalHeadroom} from '../checks/wait-for-thermal-headroom.js';
import {formatTestFilesSummary, relayedLine} from '../run-test-files.js';
import {killGroup} from './process.js';
import {loadState, saveState} from './state.js';
import {RELAY_KIND, REASON as ARTIFACT_CUSTODY_REASON,
  createPlacementArtifactCustody,
  followPlacementArtifactRelay} from './placement-artifact-custody.js';
import {PLACEMENT_SHELL, PLACEMENT_SHELL_COMMAND, remoteCommand,
  commandLine} from './shell-transport.js';
import {MS_PER_SECOND, MS_PER_MINUTE, labLockArgs, labTestPurpose,
  LAB_HOLD} from './machine-lock.js';
import {PLACEMENT_EXIT, DISCOVERY_FAILURE, PLACEMENT_TEXT,
  LAB_TEST_FAILED, LAB_TEST_TEXT} from './placement-contract.js';
import {PLACEMENT_LOG_PARENT, PLACEMENT_LINE, PLACEMENT_TAIL_POLL_MS,
  PLACEMENT_STREAM, TEXT_UTF8, PLACEMENT_CHILD_EVENT,
  PLACEMENT_STDIO_IGNORE, PLACEMENT_NEWLINE, exitOf, hasExited,
  tailLines} from './process-output.js';
import {discoverFleet, recordFleet, FLEET_CONTROLLER_NAME,
  FLEET_DEFAULT_REPO_PATH} from './fleet-discovery.js';
import {PLACEMENT_MIN_PLAN_MS, PLACEMENT_REMOTE_SETUP_MS,
  placeTestFiles, fits, placementMachines, recordPlacementMisses,
  TIER, CONTROLLER_FIT, CONTROLLER_MACHINE, minutes, bySpeed,
  placeLabLanes, planLabSplit, formatLabController,
  labShareEstimateMs} from './placement-planning.js';
import {logVerdicts, shardVerdicts, reportThermalUnfit,
  reportHostBusy, relayShardLines, reportPlacement,
  discoveryFailureText, formatLabSkipped, formatLabDecision} from './placement-reporting.js';
import {PLACEMENT_ENV, PLACEMENT_LOCAL, PLACEMENT_SHELL_LINE,
  PLACEMENT_FORWARDED_ENV, PLACEMENT_MACHINE_FACTOR_ENV,
  PLACEMENT_UPLOAD_SCRIPT, PLACEMENT_RESULTS_PREFIX,
  PLACEMENT_ARTIFACT_UNSUPPORTED, placementScript, shardWrapper} from './remote-shard-script.js';
import {PLACEMENT_PARENT, PLACEMENT_RUN_SHA_CHARACTERS,
  PLACEMENT_RUN_RADIX, discoveryFailure, safeName, bundleFor,
  fleetRequirement, commitAt, PLACEMENT_CANDIDATE_REF_PREFIX,
  PLACEMENT_COMMIT_ENV} from './proof-source.js';
import {runClassifiedChild} from './controller-test-child.js';
import {CAPABILITY_SCRIPT, MOVIELENS_FILE, MOVIELENS_SHA256,
  READINESS, REQUIREMENT_SOURCE} from './test-capability.js';
import {WORKER_CANARY_STEPS, WORKER_SETUP_FILE,
  WORKER_SYSTEM_PACKAGES, WORKER_TOOL_SOURCES} from './worker-provisioning.js';


export {LAB_HOLD};

export {CAPABILITY_SCRIPT, MOVIELENS_FILE, MOVIELENS_SHA256, READINESS, REQUIREMENT_SOURCE};

export {WORKER_CANARY_STEPS, WORKER_SETUP_FILE, WORKER_SYSTEM_PACKAGES, WORKER_TOOL_SOURCES};

export {FLEET_CONTROLLER_NAME, FLEET_DEFAULT_REPO_PATH};
// ---------------------------------------------------------------------------
// Placement: run one classified plan across the machines discovery finds
// ready, choosing at test time. The owner's rule (2026-09-18): an ordinary
// push proves itself locally and in parallel, and no host is written into any
// setup, so every choice below comes from facts measured on this run - the
// fleet is probed again (about a second) and each file's last duration
// decides the split. A machine receives a FILE SET and runs its own serial
// lanes: overlapping the exclusive and ordinary lanes on one host reds five
// contention-sensitive SLOs (measured 2026-09-17), sharding across hosts adds
// no contention. A lab machine can only make a green faster: a file red there
// is decided again on the controller, and one that then passes is recorded
// against that machine and routed elsewhere next time.

// More remote reds than this is breakage, not a routing miss: they are
// reported red rather than run a second time on the controller.
const PLACEMENT_RERUN_CAP = 20;
// A shard gets three times its estimate, never under half an hour.
const PLACEMENT_DEADLINE_FACTOR = 3;
const PLACEMENT_DEADLINE_FLOOR_MS = 30 * MS_PER_MINUTE;
// A stopped shard's shell gets this long to clean up before its connection
// is cut.
const PLACEMENT_STOP_GRACE_MS = 10 * MS_PER_SECOND;
// A closed terminal (SIGHUP) stops a placed run like an interrupt: the
// controller child and the lab wrappers are detached, so nothing else would.
const PLACEMENT_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM', 'SIGHUP']);
// How long an aborted shard's lab shell is given to clean up before it is cut.
const PLACEMENT_ABORT_GRACE_MS = 5000;
const PLACEMENT_ABORT_POLL_MS = 100;
// Waits, in a shell, for every pid after $1 to end - a zombie has ended - for
// at most $1 polls: the caller is a signal handler with no event loop left to
// wait in.
const PLACEMENT_WAIT_SCRIPT =
  'n=$1; shift; i=0; while [ "$i" -lt "$n" ]; do alive=; for p in "$@"; do ' +
  's=$(ps -o stat= -p "$p" 2>/dev/null); case "$s" in ""|Z*) ;; *) alive=1;; esac; ' +
  'done; [ -z "$alive" ] && exit 0; sleep 0.1; i=$((i+1)); done';
const PLACEMENT_KILL_SCRIPT = 'kill -TERM "$1" 2>/dev/null';

function deadlineFor(shard) {
  return Math.max(PLACEMENT_DEADLINE_FLOOR_MS, PLACEMENT_DEADLINE_FACTOR * shard.loadMs);
}

// Start one lab shard, telling other agents what it is and how long it
// expects to hold the machine: its lanes and its own estimate, which is also
// the longest it waits for the machine lock.
function startShard(shard, {deps, sha, forward, costs}) {
  const lanes = costs.filter((cost) => shard.files.includes(cost.file)).map((cost) => cost.lane);
  return deps.runRemote(shard, {sha, deadlineMs: deadlineFor(shard), forward,
    holder: {purpose: labTestPurpose(lanes), expectedMs: shard.loadMs}});
}

// The next ready host for files whose host refused them: the fastest this
// run has not tried that takes every one, charged its setup and its speed.
function nextHostFor(files, {machines, tried, costs}) {
  const priced = costs.filter((cost) => files.includes(cost.file));
  const machine = machines.filter((one) => !tried.has(one.name)).sort(bySpeed)
    .find((one) => priced.every((cost) => fits(one, cost)));
  if (!machine) return null;
  return {machine, files, loadMs: PLACEMENT_REMOTE_SETUP_MS +
    priced.reduce((sum, cost) => sum + cost.ms / cost.jobs, 0) * machine.speed};
}

// Whether a lab host refused its shard, as a typed placement outcome: held
// by another agent for the whole wait (the lab shell's busy exit), or too
// hot to run (its runner's thermal refusal). Reported once; null if it ran.
function hostRefusal(shard, outcome, write) {
  const lines = String(outcome.log || '').split(PLACEMENT_LINE);
  if (outcome.status === PLACEMENT_EXIT.BUSY) {
    reportHostBusy(shard.machine.name, lines, write);
    return PLACEMENT_TEXT.REFUSED_BUSY;
  }
  if (!lines.some((line) => THERMAL_REFUSAL_LINE.test(line))) return null;
  reportThermalUnfit(shard.machine.name, lines, write);
  return PLACEMENT_TEXT.REFUSED_HOT;
}

// A started shard's settled outcomes: the one re-placement policy. The files
// a host that refused never ran go on to the next ready host this run has
// not tried - a host that refused is never tried again in it - and, with none
// left, to the controller. What it did run is settled as it ran.
async function followShard(shard, run, context) {
  const outcome = await run.done;
  const refusal = hostRefusal(shard, outcome, context.write);
  if (!refusal) return [{shard, outcome}];
  const {unreported} = logVerdicts(shard.files, outcome.log);
  const ran = {shard: {...shard, files: shard.files.filter((file) => !unreported.includes(file))},
    outcome};
  if (unreported.length === 0) return [ran];
  const next = nextHostFor(unreported, context);
  if (!next) {
    context.write(`${PLACEMENT_TEXT.PREFIX}${shard.machine.name}: ${unreported.length}` +
      `${PLACEMENT_TEXT.UNREPORTED}${refusal}${PLACEMENT_TEXT.NO_NEXT_HOST}`);
    context.leftover.push(...unreported);
    return [ran];
  }
  context.tried.add(next.machine.name);
  context.write(`${PLACEMENT_TEXT.PREFIX}${next.machine.name}: ${next.files.length} files, ` +
    `~${minutes(next.loadMs)} min${PLACEMENT_TEXT.MOVED_FROM}${shard.machine.name}` +
    `${PLACEMENT_TEXT.MOVED_CLOSE}`);
  const moved = await startShard(next, context);
  context.runs.push(moved);
  return [ran, ...await followShard(next, moved, context)];
}

/**
 * Run test files placed across the fleet when that can shorten the run, and
 * on the controller alone otherwise. Every choice is reported on one line.
 * @param {string[]} files
 * @param {Object} deps
 * @param {Function} deps.planCosts files -> [{file, ms, jobs}]
 * @param {Function} deps.runLocal (files, {failFast}) -> exit status
 * @param {Function} deps.lastGreen file -> whether its controller result is green
 * @param {Function} deps.commitAt () -> the sha the tree exactly is, or null
 * @param {Function} deps.discover async (sha) -> {machines, record(name, key, files)},
 *   measured against that commit's requirement
 * @param {Function} deps.runRemote (shard, {sha, deadlineMs, forward}) ->
 *   {done, stop, interrupt, abort}
 * @param {Function} [deps.runLocalChild] files -> {done, abort}: the controller's
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
  const {env = process.env, failFast = false,
    write = (line) => process.stdout.write(`${line}\n`)} = deps;
  const local = (reason) => {
    if (reason) write(`${PLACEMENT_TEXT.LOCAL}${reason}`);
    return deps.runLocal(files, {failFast});
  };
  if (env[PLACEMENT_ENV] === PLACEMENT_LOCAL) return local(null);
  if (failFast) return local(PLACEMENT_TEXT.FAIL_FAST);
  const costs = deps.planCosts(files);
  const aloneMs = costs.reduce((sum, cost) => sum + cost.ms / cost.jobs, 0);
  if (aloneMs < PLACEMENT_MIN_PLAN_MS) return local(null);
  const sha = deps.commitAt();
  if (!sha) return local(PLACEMENT_TEXT.NOT_A_COMMIT);
  let fleet;
  try {
    fleet = await deps.discover(sha);
  } catch (error) {
    // Placement can only shorten a run: discovery that fails is no fleet,
    // and the line names which part failed.
    return local(`${discoveryFailureText(error)}${error.message}`);
  }
  if (fleet.machines.length === 0) return local(PLACEMENT_TEXT.NO_MACHINE);
  // A controller without headroom takes only what no lab machine can.
  const headroom = deps.controllerHeadroom ? deps.controllerHeadroom() : CONTROLLER_FIT;
  const shards = placeTestFiles(costs, [{...CONTROLLER_MACHINE, tier: headroom.fit ? 0 : TIER.HOT},
    ...fleet.machines]);
  const remote = shards.filter((shard) => !shard.machine.controller);
  if (remote.length === 0) return local(PLACEMENT_TEXT.NO_GAIN);
  let checkBase;
  try {
    checkBase = deps.checkBase();
  } catch (error) {
    return local(`${PLACEMENT_TEXT.NO_CHECK_BASE}${error.message}`);
  }
  reportPlacement({files, shards, headroom, aloneMs, write});
  // Every lab shard is on its way before the controller's own files start.
  const context = {deps, sha, forward: forwardedPolicy(env, checkBase), costs, write,
    machines: fleet.machines, tried: new Set(remote.map((shard) => shard.machine.name)),
    runs: [], leftover: []};
  const started = await Promise.all(remote.map((shard) => startShard(shard, context)));
  context.runs.push(...started);
  const followed = Promise.all(remote.map((shard, index) =>
    followShard(shard, started[index], context)));
  // While lab shards run, the controller's own files run in a child process
  // of their own group, never in this process's blocking lanes: a signal
  // handler here could not run until those lanes finished, so a Ctrl-C or a
  // SIGTERM would be held for the whole shard (verifier round 2). Interrupted,
  // the local child is cut first and every lab shard is aborted together,
  // synchronously.
  let here = null;
  const runHere = (planned) => {
    here = deps.runLocalChild ? deps.runLocalChild(planned) :
      {done: Promise.resolve(deps.runLocal(planned, {}))};
    return here.done;
  };
  const release = abortOnSignals(deps, () => {
    here?.abort?.();
    abortTogether(context.runs);
  });
  try {
    const controllerShard = shards.find((shard) => shard.machine.controller);
    const statuses = controllerShard ? [await runHere(controllerShard.files)] : [];
    return await settleRemoteShards((await followed).flat(),
      {deps, fleet, statuses, write, runHere, leftover: context.leftover});
  } finally {
    release();
  }
}

// The controller's own retry and timeout policy, and its resolved check base
// (a commit, or none), handed to a lab machine.
function forwardedPolicy(env, checkBase) {
  return {
    retry: env[PLACEMENT_FORWARDED_ENV.RETRY] || '',
    tapTimeout: env[PLACEMENT_FORWARDED_ENV.TAP_TIMEOUT] || '',
    checkBase: checkBase || '',
  };
}

// The forwarded policy as the lab shell's positional arguments, none omitted.
function forwardedArgs({retry, tapTimeout, checkBase}) {
  return [retry || '', tapTimeout || '', checkBase || ''];
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

async function settleRemoteShards(settled, {deps, fleet, statuses, write, runHere, leftover}) {
  const reruns = [];
  // Files no ready lab host was left to take after theirs was held.
  const fallback = [...leftover];
  settled.forEach(({shard, outcome}) => {
    relayShardLines(shard, outcome, write);
    // Its files not proved there are placed once more, on the controller:
    // never retried on the machine within this run.
    const {red, fallback: back} = shardVerdicts(shard, outcome);
    if (back.length > 0) {
      write(`${PLACEMENT_TEXT.PREFIX}${shard.machine.name}: ${back.length}` +
        `${PLACEMENT_TEXT.UNREPORTED}${outcome.reason || `exit ${outcome.status}`}`);
      fallback.push(...back);
    }
    if (red.length > 0) {
      write(`${PLACEMENT_TEXT.PREFIX}${shard.machine.name}: ${red.length}${PLACEMENT_TEXT.RED_THERE}`);
      reruns.push({shard, red});
    }
  });
  const redCount = reruns.reduce((sum, rerun) => sum + rerun.red.length, 0);
  if (redCount > PLACEMENT_RERUN_CAP) {
    write(`${PLACEMENT_TEXT.PREFIX}${PLACEMENT_TEXT.OVER_CAP}`);
    statuses.push(1);
  } else if (redCount > 0) {
    statuses.push(await runHere(reruns.flatMap((rerun) => rerun.red)));
    for (const {shard, red} of reruns) {
      const misses = red.filter((file) => deps.lastGreen(file));
      if (misses.length === 0) continue;
      write(`${PLACEMENT_TEXT.PREFIX}${misses.length}${PLACEMENT_TEXT.MISS}${shard.machine.name}`);
      await fleet.record(shard.machine.name, shard.machine.gapsKey, misses);
    }
  }
  if (fallback.length > 0) statuses.push(await runHere(fallback));
  return statuses.find((status) => status !== 0) ?? 0;
}

// Stop a started shard: signal its shell on the machine, whose trap stops
// the runner's process group and whose exit removes the worktree, ref and
// bundle; cut the local side only if it has not ended by the grace.
function signalLabShell(machine, logFile) {
  const shell = PLACEMENT_SHELL_LINE.exec(fs.readFileSync(logFile, TEXT_UTF8))?.[1];
  if (shell) {
    const [command, args] = remoteCommand(machine, PLACEMENT_KILL_SCRIPT, [shell]);
    spawnSync(command, args, {stdio: PLACEMENT_STDIO_IGNORE, timeout: PLACEMENT_STOP_GRACE_MS});
  }
  return shell;
}

function stopShard(machine, child, logFile) {
  const shell = signalLabShell(machine, logFile);
  const cut = setTimeout(() => killGroup(child), shell ? PLACEMENT_STOP_GRACE_MS : 0);
  child.once(PLACEMENT_CHILD_EVENT.EXIT, () => clearTimeout(cut));
}

/**
 * Start one shard on its machine. Returns at once: the upload and the run
 * go on in a process group of their own, reading from and writing to files,
 * so the controller's own blocking lanes cannot stall them. `done` settles
 * with the exit status, the stdout log (the runner's verdict lines) and the
 * stderr log, or a reason when the shard never ran or its deadline stopped
 * it; `stop` stops it now.
 * @param {{machine: Object, files: string[]}} shard
 * `onLine(line, stream)`, when given, receives each line of the relay as it
 * arrives - stdout as `out`, stderr as `err` - not only at settle; `results`
 * names a ledger the runner leaves in the worktree, relayed back as prefixed
 * lines; `gitRoot` is the checkout whose HEAD is the commit (default root).
 * `holder` is what the shard tells other agents under the lab convention: its
 * purpose, and the time it expects to hold the machine, which is also the
 * longest it waits for the machine lock (capped by the lab).
 * @param {{sha: string, deadlineMs: number, root: string,
 *   holder: {purpose: string, expectedMs: number},
 *   runId?: string, env?: Object,
 *   forward?: {retry?: string, tapTimeout?: string, checkBase?: string},
 *   onLine?: Function, results?: string, gitRoot?: string,
 *   artifacts?: Array<{path: string, required: boolean, maxBytes: number}>}} options
 * @return {{done: Promise<Object>, stop: Function}}
 */
export function startRemoteShard(shard, {sha, deadlineMs, root, holder,
  env = gitProcessEnvironment(), forward = {}, onLine = null, results = '', gitRoot = root,
  artifacts = null,
  runId = `${sha.slice(0, PLACEMENT_RUN_SHA_CHARACTERS)}-` +
    `${Date.now().toString(PLACEMENT_RUN_RADIX)}-${process.pid}`}) {
  const {machine} = shard;
  const logDir = path.join(root, PLACEMENT_LOG_PARENT);
  fs.mkdirSync(logDir, {recursive: true});
  const local = path.join(logDir, `${runId}-${safeName(machine.name)}`);
  const logFile = `${local}.log`;
  const errorFile = `${local}.err`;
  const scriptFile = `${local}.sh`;
  const custody = artifacts === null ? null : createPlacementArtifactCustody({root, artifacts,
    binding: {candidate: sha, base: forward.checkBase, run: runId, host: machine.name}});
  let bundleFile;
  try {
    bundleFile = bundleFor(machine, {root: gitRoot, sha, local});
  } catch (error) {
    return {done: Promise.resolve({status: PLACEMENT_EXIT.SETUP, log: '',
      reason: error.message, ...finishedShardArtifacts(custody, ARTIFACT_CUSTODY_REASON.SETUP)}),
    stop: () => {}, interrupt: () => null, abort: () => {}};
  }
  const remoteBundle = bundleFile ?
    `${machine.repoPath}/${PLACEMENT_PARENT}/${runId}.bundle` : '';
  fs.writeFileSync(scriptFile, placementScript(shard.files, custody));
  const wrapper = remoteShardWrapper(machine,
    {bundleFile, remoteBundle, sha, runId, forward, results, holder, env, scriptFile});
  const output = fs.openSync(logFile, 'w');
  const errors = fs.openSync(errorFile, 'w');
  const child = spawn(PLACEMENT_SHELL, [PLACEMENT_SHELL_COMMAND, wrapper],
    {env, stdio: [PLACEMENT_STDIO_IGNORE, output, errors], detached: true});
  fs.closeSync(output);
  fs.closeSync(errors);
  const tails = followShardLogs(custody, onLine, logFile, errorFile);
  let stopped = null;
  const stop = (reason) => {
    if (stopped || hasExited(child)) return;
    stopped = reason;
    stopShard(machine, child, logFile);
  };
  // A deadline that expired while this process was blocked is looked at
  // again after its pending events: a shard that finished meanwhile is not
  // stopped, and its gone shell's pid is never signalled (verifier round 1).
  const deadline = setTimeout(() => setImmediate(() => stop(PLACEMENT_TEXT.DEADLINE)),
    deadlineMs);
  const done = exitOf(child).then((status) => {
    clearTimeout(deadline);
    for (const finish of tails) finish();
    // A wrapper stopped mid-upload never reached its own removals.
    fs.rmSync(scriptFile, {force: true});
    if (bundleFile) fs.rmSync(bundleFile, {force: true});
    const outcome = {
      status: stopped ? null : status,
      log: readShardLog(custody, logFile),
      errors: readShardLog(custody, errorFile),
      ...finishedShardArtifacts(custody),
    };
    return stopped ? {...outcome, reason: stopped} : outcome;
  });
  // Interrupted: ask the lab shell to stop, and hand back what to wait for
  // and how to cut the local side - abortTogether does both for every shard.
  const interrupt = () => {
    if (hasExited(child)) return null;
    stopped = PLACEMENT_TEXT.INTERRUPTED;
    return {pid: signalLabShell(machine, logFile) ? child.pid : null,
      cut: () => killGroup(child)};
  };
  return {done, stop: () => stop(PLACEMENT_TEXT.INTERRUPTED), interrupt,
    abort: () => abortTogether([{interrupt}])};
}

function remoteShardWrapper(machine,
  {bundleFile, remoteBundle, sha, runId, forward, results, holder, env, scriptFile}) {
  return shardWrapper({
    upload: bundleFile ?
      commandLine(remoteCommand(machine, PLACEMENT_UPLOAD_SCRIPT, [remoteBundle])) : null,
    bundleFile,
    run: commandLine(remoteCommand(machine, null, [machine.repoPath, sha,
      machine.nodeMajor || '', String(machine.factor || 1), runId, remoteBundle,
      ...forwardedArgs(forward), results,
      ...labLockArgs({waitMs: holder.expectedMs, purpose: holder.purpose,
        expectedMs: holder.expectedMs, sha, env})], {fromStdin: true})),
    scriptFile,
  });
}

function followShardLogs(custody, onLine, logFile, errorFile) {
  const tails = custody ? [followPlacementArtifactRelay(logFile,
    (line) => onLine?.(line, PLACEMENT_STREAM.OUT), custody, PLACEMENT_TAIL_POLL_MS)] :
    (onLine ? [tailLines(logFile, PLACEMENT_STREAM.OUT, onLine)] : []);
  if (onLine) {
    tails.push(custody ? followPlacementArtifactRelay(errorFile,
      (line) => onLine(line, PLACEMENT_STREAM.ERR), custody, PLACEMENT_TAIL_POLL_MS,
      RELAY_KIND.DIAGNOSTICS) : tailLines(errorFile, PLACEMENT_STREAM.ERR, onLine));
  }
  return tails;
}

function readShardLog(custody, file) {
  return custody ? custody.readLog(file) : fs.readFileSync(file, TEXT_UTF8);
}

function finishedShardArtifacts(custody, ...args) {
  return custody ? {artifacts: custody.finish(...args)} : {};
}

// Every lab shell is asked to stop first, then all of them share one bounded
// grace for their traps - which stop the runner and remove the worktree, ref
// and bundle; a wrapper cut at once killed a local-mode shell before its trap
// ran (verifier, test-placement round 3) - then whatever is left is cut. Any
// number of shards costs one grace, not one each.
function abortTogether(runs) {
  const pending = runs.map((run) => (run.interrupt ? run.interrupt() : run.abort?.()))
    .filter((one) => one?.cut);
  const waiting = pending.map((one) => one.pid).filter(Boolean).map(String);
  if (waiting.length > 0) {
    spawnSync(PLACEMENT_SHELL, [PLACEMENT_SHELL_COMMAND, PLACEMENT_WAIT_SCRIPT,
      PLACEMENT_SHELL, String(PLACEMENT_ABORT_GRACE_MS / PLACEMENT_ABORT_POLL_MS), ...waiting],
    {stdio: PLACEMENT_STDIO_IGNORE, timeout: 2 * PLACEMENT_ABORT_GRACE_MS});
  }
  for (const one of pending) one.cut();
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
    record: async (name, gapsKey, files) => {
      await saveState(recordPlacementMisses(await loadState(), name, gapsKey, files));
    },
  };
}

/**
 * The real collaborators of runPlacedTestFiles, given the classified runner's
 * own planning and execution.
 * @param {{root: string, failFast?: boolean, env?: Object, planCosts: Function,
 *   runLocal: Function, lastGreen: Function}} input
 * @return {Object}
 */
export function placementDeps({root, failFast = false, env = process.env,
  planCosts, runLocal, lastGreen}) {
  return {
    failFast, env, planCosts, runLocal, lastGreen,
    runLocalChild: (files) => runClassifiedChild(root, files, env),
    commitAt: () => commitAt(root, env),
    checkBase: () => resolvedCheckBaseCommit(null, env, root),
    discover: (sha) => discoverPlacement(root, env, sha),
    runRemote: (shard, options) => startRemoteShard(shard, {...options, root}),
    controllerHeadroom: () => controllerHeadroom({env}),
  };
}
// Where a runner leaves its per-file results ledger, and where a machine's
// copy comes back to, named for the machine.
const LAB_TEST_RESULTS_FILE = 'test-output/reports/test-results.ndjson';
const LAB_TEST_RESULTS_DIR = 'test-output/reports';
const LAB_TEST_RESULTS_STEM = 'test-results-';
const LAB_TEST_RESULTS_EXTENSION = '.ndjson';

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

// A split's controller headroom: its tree must be exactly the commit it
// runs, and it must have thermal and load headroom.
function splitHeadroom(deps, sha) {
  if (deps.commitAt() !== sha) return {fit: false, reason: `${LAB_TEST_TEXT.CONTROLLER_TREE}${sha}`};
  return deps.controllerHeadroom ? deps.controllerHeadroom() : CONTROLLER_FIT;
}

function controllerMachine(fleet) {
  const capability = fleet.find((entry) => entry.controller)?.capability;
  return {...CONTROLLER_MACHINE, cores: capability?.cores ?? null,
    memKiB: capability?.memKiB ?? null};
}

// One machine's share, started: its lanes' files, the lines it streamed, and
// the run to wait for. The controller's share runs as the placed run's own
// child does; a lab machine's through the shard path, with the commit bundled
// from the planning checkout.
function startLabShare({machine, lanes},
  {commit, deps, forward, results, costOf, write, artifacts}) {
  const files = lanes.flatMap((lane) => lane.files);
  const lines = [];
  const onLine = (line, stream) => {
    if (stream === PLACEMENT_STREAM.OUT) lines.push(line);
    if (!line.startsWith(PLACEMENT_RESULTS_PREFIX)) write(relayedLine(machine.name, line));
  };
  if (machine.controller) {
    return {machine, files, lines,
      run: deps.runLocalChild(files, {onLine, checkBase: forward.checkBase})};
  }
  const loadMs = labShareEstimateMs(machine, files, costOf);
  const run = deps.runRemote({machine, files}, {sha: commit.sha, gitRoot: commit.gitRoot,
    deadlineMs: deadlineFor({loadMs}), forward, results, onLine,
    ...requestedArtifacts(artifacts),
    holder: {purpose: labTestPurpose(lanes.map((lane) => lane.resourceClass)),
      expectedMs: loadMs}});
  return {machine, files, lines, run};
}

function requestedArtifacts(artifacts) {
  return artifacts === null ? {} : {artifacts};
}

function shareExit(outcome) {
  return typeof outcome === 'object' ? outcome.status : outcome;
}

function artifactReportLines(share, outcome) {
  if (outcome?.artifacts) {
    return [`${LAB_TEST_TEXT.PREFIX}${share.machine.name}: artifacts ${outcome.artifacts.state} ` +
      `${outcome.artifacts.directory ?? ''}`];
  }
  return [];
}

function assertArtifactPlacement(artifacts, assignments) {
  if (artifacts !== null && assignments.some(({machine}) => machine.controller)) {
    throw new Error(PLACEMENT_ARTIFACT_UNSUPPORTED);
  }
}

function decisionLines(assignments, split, placed, fleet) {
  return [...formatLabDecision(assignments), ...(split ? [formatLabController(placed),
    ...formatLabSkipped(fleet, assignments, placed.controller)] : [])];
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
    const exit = shareExit(outcome);
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
    for (const line of artifactReportLines(share, outcome)) write(line);
    for (const key of Object.keys(totals)) totals[key] += summary[key];
    if (exit !== 0 || summary.failed > 0) status = LAB_TEST_FAILED;
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
 *   results?: string, env?: Object, write?: Function,
 *   artifacts?: Array<{path: string, required: boolean, maxBytes: number}>}} request
 * @param {Object} deps labTestDeps' collaborators (discover, runRemote,
 *   runLocalChild, commitAt; signals and exit optional)
 * @return {Promise<number>} exit status
 */
export async function runLabTest({plan, costs = [], commit, checkBase, on = null,
  split = false, root, results = LAB_TEST_RESULTS_FILE, env = process.env, artifacts = null,
  write = (line) => process.stdout.write(`${line}${PLACEMENT_NEWLINE}`)}, deps) {
  let shares = [];
  try {
    const {fleet = [], machines, held = []} = await deps.discover(commit.sha);
    const placed = split ? planLabSplit(plan, machines, {held, costs,
      controller: controllerMachine(fleet), controllerHeadroom: splitHeadroom(deps, commit.sha)}) :
      {assignments: placeLabLanes(plan, machines, {on, fleet})};
    const {assignments} = placed;
    assertArtifactPlacement(artifacts, assignments);
    for (const line of decisionLines(assignments, split, placed, fleet)) write(line);
    if (assignments.some(({machine}) => machine.controller) && deps.commitAt() !== commit.sha) {
      throw new Error(`${LAB_TEST_TEXT.CONTROLLER_TREE}${commit.sha}`);
    }
    const costOf = new Map(costs.map((cost) => [cost.file, cost.ms / cost.jobs]));
    const context = {commit, deps, forward: forwardedPolicy(env, checkBase), results, costOf,
      artifacts, write};
    shares = assignments.map((assignment) => startLabShare(assignment, context));
  } finally {
    commit.release();
  }
  const release = abortOnSignals(deps, () => abortTogether(shares.map((share) => share.run)));
  try {
    await Promise.all(shares.map((share) => share.run.done));
  } finally {
    release();
  }
  return settleLabShares(shares, {root, write});
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
    controllerHeadroom: () => controllerHeadroom({env}),
  };
}

export {DISCOVERY_FAILURE, LAB_TEST_RESULTS_FILE, PLACEMENT_CANDIDATE_REF_PREFIX,
  PLACEMENT_COMMIT_ENV, PLACEMENT_ENV, PLACEMENT_EXIT, PLACEMENT_LOCAL,
  PLACEMENT_MIN_PLAN_MS, bundleFor, commitAt};

export {labHolderText, holdLabMachine} from './machine-lock.js';

export {probeRemoteNode, parseCapability, probeTestCapability,
  corpusReadiness} from './test-capability.js';

export {workerCloneUrl, workerSetupScript, copyWorkerSetup} from './worker-provisioning.js';

export {discoverFleet, recordFleet, formatFleet,
  formatFleetRequirement} from './fleet-discovery.js';

export {placeTestFiles, placementMachines, recordPlacementMisses,
  placeLabLanes, planLabSplit, formatLabController} from './placement-planning.js';

export {formatLabSkipped, formatLabDecision} from './placement-reporting.js';

export {fleetRequirement, labTestCommit, labTestSelectorArgs,
  prepareSelectorImportGraph} from './proof-source.js';
