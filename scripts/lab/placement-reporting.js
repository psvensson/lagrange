// Placement diagnostics and runner-verdict interpretation; no orchestration or artifact acceptance.
import {THERMAL_REFUSAL_LINE} from '../checks/wait-for-thermal-headroom.js';
import {TEST_FILE_LINE, relayedLine} from '../run-test-files.js';
import {LAB_LOCK_STATE, LAB_HOLDER_UNKNOWN, busyHolder, labLockText} from './machine-lock.js';
import {DISCOVERY_FAILURE, REQUIREMENT_FAILURES, PLACEMENT_TEXT,
  LAB_TEST_TEXT} from './placement-contract.js';
import {PLACEMENT_LINE} from './process-output.js';
import {FLEET_CONTROLLER_NAME, FLEET_FACTOR_DIGITS, FLEET_UNKNOWN,
  fleetVerdict} from './fleet-discovery.js';
import {CONTROLLER_FIT, minutes} from './placement-planning.js';

// The runner's per-file verdict line (TEST_FILE_LINE.VERDICT, its owner's):
// `ok|not ok FILE (N assertions, Tms)`.
const PLACEMENT_VERDICT_GREEN = 'ok';
const PLACEMENT_VERDICT_PART = Object.freeze({VERDICT: 1, FILE: 2, ASSERTIONS: 3});

// The files a finished shard reports red, among the files it was given.
// What a lab machine proved, file by file, from its runner's own verdict
// lines on stdout - never from its exit status. A file with an `ok` line (or
// a retried-once pass, the controller's own policy) and no unretried `not ok`
// line is proved there; one with a `not ok` line is decided again on the
// controller; one with neither never reported, and the controller runs it. A
// runner killed mid-batch, a truncated script or a lost connection can leave
// any number of files unreported whatever the exit status (verifier round 1).
function logVerdicts(files, log) {
  const given = new Set(files);
  const green = new Set();
  const red = new Set();
  const assertions = new Map();
  const lines = String(log || '').split(PLACEMENT_LINE);
  for (const line of lines) {
    const verdict = TEST_FILE_LINE.VERDICT.exec(line);
    const file = verdict?.[PLACEMENT_VERDICT_PART.FILE];
    if (verdict && given.has(file)) {
      (verdict[PLACEMENT_VERDICT_PART.VERDICT] === PLACEMENT_VERDICT_GREEN ? green : red)
        .add(file);
      assertions.set(file, Number(verdict[PLACEMENT_VERDICT_PART.ASSERTIONS]));
    }
    const retried = TEST_FILE_LINE.RETRIED_PASS.exec(line);
    if (retried && given.has(retried[1])) green.add(retried[1]);
  }
  for (const line of lines) {
    const retried = TEST_FILE_LINE.RETRIED_PASS.exec(line);
    if (retried) red.delete(retried[1]);
  }
  return {
    green, red, assertions,
    unreported: files.filter((file) => !green.has(file) && !red.has(file)),
  };
}

function shardVerdicts(shard, outcome) {
  const {red, unreported} = logVerdicts(shard.files, outcome.log);
  return {red: [...red], fallback: unreported};
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

// A lab machine's own lines, shown under its name.
function relayShardLines(shard, outcome, write) {
  for (const stream of [outcome.log, outcome.errors]) {
    for (const line of String(stream || '').split(PLACEMENT_LINE)) {
      if (line) write(relayedLine(shard.machine.name, line));
    }
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
const LAB_TEST_KIB_PER_GIB = 1024 * 1024;
const LAB_TEST_MEMORY_DIGITS = 1;

/**
 * Why each machine of the fleet a placement left out was left out, one line
 * each, so a bad split is visible before anything runs.
 * @param {Array<Object>} fleet discoverFleet's result
 * @param {Array<{machine: Object}>} assignments
 * @param {{fit: boolean, reason: string|null}} headroom the controller's
 * @return {string[]}
 */
function formatLabSkipped(fleet, assignments, headroom = CONTROLLER_FIT) {
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
function formatLabDecision(assignments) {
  return assignments.map(({machine, lanes, loadMs}) => {
    const files = lanes.reduce((sum, lane) => sum + lane.files.length, 0);
    return `${LAB_TEST_TEXT.PREFIX}${machine.name}: ` +
      `${lanes.map((lane) => lane.resourceClass).join(LAB_TEST_TEXT.LANES)} (${files} files) ` +
      `cores=${machine.cores ?? FLEET_UNKNOWN} mem=${gibibytes(machine.memKiB)}GiB ` +
      `speed x${machine.speed.toFixed(FLEET_FACTOR_DIGITS)}` +
      (loadMs === undefined ? '' : ` ~${minutes(loadMs)} min`);
  });
}

export {logVerdicts, shardVerdicts, reportThermalUnfit, reportHostBusy, relayShardLines,
  reportPlacement, discoveryFailureText, formatLabSkipped, formatLabDecision};
