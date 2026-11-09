/**
 * Pre-kill coverage flush for the fallback-branch census: a test that kills a
 * child on purpose calls `flushCoverageBeforeKill(pid, signal)` right before
 * the kill, and the kill follows exactly as before.
 *
 * Outside a census collection (collect's CENSUS_COVERAGE_DIR_ENV unset) it
 * returns false at once: nothing is sent, nothing waits. Under collection it
 * asks the census preload of that process to flush its coverage
 * (scripts/checks/fallback-branch-census-preload.js documents the protocol)
 * and waits, synchronously and at most `boundMs`, for its acknowledgement, so
 * no event of the calling test runs in between. A process with no start
 * marker (no preload) is never signalled; one killed while it is still
 * starting gets START_MARKER_WAIT_MS for its preload to write the marker. A
 * child that does not answer in
 * time - blocked, or not under the preload - is killed anyway and stays a
 * lost witness. For its own process (`pid === process.pid`) the flush runs
 * in-process, synchronously.
 *
 * The flush changes nothing the code under test can observe: the request
 * signal is one whose default action is to be ignored, and before a kill no
 * JavaScript of the child runs past the flush (it stays frozen until the kill
 * lands), so the child is lost at the flush instead of a few milliseconds
 * later.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  CENSUS_COVERAGE_DIR_ENV,
  FLUSH_PROCESS_EVENT,
  FLUSH_SIGNAL,
  PRE_KILL_ACK_BOUND_MS,
  WITNESS_MARKER,
} from '../../scripts/checks/fallback-branch-census-constants.js';

const MAIN_THREAD_ID = 0;
const POLL_MS = 5;
// A child killed right after its spawn may not have loaded the preload yet.
const START_MARKER_WAIT_MS = 1000;
const sleepCell = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
let requests = 0;

function markerOf(directory, pid, suffix) {
  return path.join(directory, `${WITNESS_MARKER.PREFIX}${pid}${WITNESS_MARKER.SEPARATOR}` +
    `${MAIN_THREAD_ID}${suffix}`);
}

function sleep(milliseconds) {
  Atomics.wait(sleepCell, 0, 0, milliseconds);
}

// Whether the child's preload wrote its start marker (it installs its flush
// listener first), waiting a little for a child still starting.
function startMarkerOf(directory, pid) {
  const start = markerOf(directory, pid, WITNESS_MARKER.START);
  const deadline = Date.now() + START_MARKER_WAIT_MS;
  while (!fs.existsSync(start)) {
    if (Date.now() >= deadline) return false;
    try {
      process.kill(pid, 0);
    } catch {
      return false;
    }
    sleep(POLL_MS);
  }
  return true;
}

function acknowledged(file, id) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).id === id;
  } catch {
    return false;
  }
}

/**
 * Flush a census-instrumented process's coverage before it is killed.
 * @param {number} pid the process about to be killed
 * @param {string} signal the signal that will kill it
 * @param {{env?: Object, boundMs?: number}} [options]
 * @return {boolean} true when the process acknowledged the flush
 */
export function flushCoverageBeforeKill(pid, signal,
  {env = process.env, boundMs = PRE_KILL_ACK_BOUND_MS} = {}) {
  const directory = env[CENSUS_COVERAGE_DIR_ENV];
  if (!directory || !Number.isInteger(pid) || pid <= 0) return false;
  if (pid === process.pid) return process.emit(FLUSH_PROCESS_EVENT, signal);
  if (!startMarkerOf(directory, pid)) return false;
  requests += 1;
  const id = `${process.pid}-${requests}-${Date.now()}`;
  const ack = markerOf(directory, pid, WITNESS_MARKER.FLUSHED);
  try {
    fs.writeFileSync(markerOf(directory, pid, WITNESS_MARKER.FLUSH_REQUEST),
      JSON.stringify({id, signal}));
    process.kill(pid, FLUSH_SIGNAL);
  } catch {
    // Gone already, or the request cannot be written: kill as before.
    return false;
  }
  const deadline = Date.now() + boundMs;
  while (Date.now() < deadline) {
    if (acknowledged(ack, id)) return true;
    sleep(POLL_MS);
  }
  return acknowledged(ack, id);
}
