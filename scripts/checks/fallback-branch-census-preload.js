/**
 * Coverage flush and witness accounting for the fallback-branch census
 * (scripts/checks/fallback-branch-census.js composes it into the lane's
 * NODE_OPTIONS as `--import`, which Node applies to the main thread and to
 * every file-backed worker thread; it is never imported by repository code).
 *
 * NODE_V8_COVERAGE writes a thread's coverage only when the thread ends in an
 * orderly way. A process a signal ends, a process that aborts, a worker that
 * dies with its process - each takes its coverage with it, and a lost process
 * can only hide an executed side, which would condemn a live branch. So every
 * thread under coverage:
 *
 * - writes a START marker `witness-<pid>-<threadId>.json` (pid, threadId,
 *   ppid, entry script argv[1], cwd, startedAt, isMainThread) into the
 *   coverage directory the moment it loads;
 * - flushes its coverage so far with `v8.takeCoverage()` every
 *   FLUSH_INTERVAL_MS (an unref'd timer: it never keeps a thread alive), so a
 *   thread killed without warning loses only its last interval;
 * - flushes once more on `beforeExit`, and on SIGTERM or SIGINT in a process
 *   that listens for that signal itself (main thread);
 * - serves a PRE-KILL FLUSH (below);
 * - writes an END marker `witness-<pid>-<threadId>-exit.json` (with `at`,
 *   its Date.now) on `exit`. Node writes the thread's final coverage only
 *   after every `exit` listener has run, so the end marker PRECEDES that
 *   write: the accounting counts a thread complete by its end marker only
 *   when a coverage file of that thread was written at or after it
 *   (fallback-branch-census-witnesses.js). A start marker without that pair
 *   (or a final flush acknowledgement) is a LOST witness: the merge names it,
 *   and the join voids the acquittals its import closure could hold.
 *
 * Markers are written with primordials captured when this preload loads,
 * before any code of the process runs, and their JSON text is built from the
 * body's own primitive fields: a process that later patches
 * Object.prototype.toJSON, Date.prototype.toISOString, JSON.stringify,
 * fs.writeFileSync or v8.takeCoverage (a test pollution case, a mock) still
 * writes complete markers, and a fake clock (a mocked Date.now) can neither
 * stall a flush's millisecond wait nor misdate a marker. (Before round 4,
 * four unit processes of collection 5 wrote `{}` end markers.)
 *
 * Pre-kill flush. A harness about to kill a child on purpose (a process-loss
 * test, a driver's stop deadline) asks it to flush first
 * (test/test-helpers/census-pre-kill-flush.js, only while collect's
 * CENSUS_COVERAGE_DIR_ENV is set): it writes `witness-<pid>-0-flush-request.json`
 * {id, signal} and sends FLUSH_SIGNAL (SIGURG: ignored by default, so a child
 * without this preload is untouched; nothing in the repository, Node or
 * libuv listens for it). The main thread then flushes its coverage, posts the
 * request on the FLUSH_CHANNEL BroadcastChannel every preloaded thread of the
 * process holds (unref'd), waits up to WORKER_ACK_BOUND_MS for the live
 * workers it created to acknowledge (`witness-<pid>-<threadId>-flushed.json`
 * {id}), and writes its own acknowledgement naming the threads that did and
 * did not answer. The flush is FINAL when the signal that follows will end
 * the process without running any of its JavaScript - SIGKILL, or a
 * terminating signal the process has no listener of its own for: then every
 * acknowledging thread stays frozen (Atomics.wait, no JavaScript runs) until
 * the kill lands, so its coverage is complete at the kill, and the code under
 * test sees what it saw before - a process that stops between two
 * instructions, only at the flush instead of a few milliseconds later. A
 * thread still alive FREEZE_BOUND_MS later withdraws its acknowledgement
 * (deletes it) and runs on. A flush followed by a signal the process handles
 * itself is not final: nothing freezes, its handler runs as before, and its
 * completeness rests on its end marker as usual. A process that kills itself
 * emits FLUSH_PROCESS_EVENT synchronously right before (its workers freeze;
 * the caller's own kill follows in the same stack).
 *
 * Node names a coverage file by process id, wall-clock millisecond and thread
 * id, and every write after a `takeCoverage()` holds only what ran since it
 * (the counters reset). A later write in the same millisecond - the next
 * flush, the exit write - would replace the full file with a near-empty one.
 * Each flush therefore waits until the clock has moved past its millisecond
 * (at most about two milliseconds) before anything else runs.
 *
 * Exit semantics are unchanged. Any listener for a terminating signal
 * replaces its default action, and Node drops a signal still pending when the
 * event loop empties - a process that SIGTERMs itself and returns exits 0
 * instead of dying - so this preload never listens for SIGTERM or SIGINT
 * unless the process does itself: it attaches its flush-only listener when
 * the process adds its own first listener for one, and detaches it when the
 * process removes its last one. Its FLUSH_SIGNAL listener replaces only an
 * ignore. A `new Worker(code, {eval: true})` thread does not run `--import`
 * preloads: it writes no marker, never acknowledges (the main thread's
 * acknowledgement lists it unanswered), and its loss is not seen.
 *
 * Outside the accounting, likewise: a process whose environment drops this
 * preload from NODE_OPTIONS while it keeps NODE_V8_COVERAGE. It writes
 * coverage (on an orderly exit, and nothing else), but no marker, so its
 * loss is invisible to the merge. Known sources (round 4 census of
 * `NODE_OPTIONS` in test/, scripts/, src/, examples/):
 * test/bootstrap/run-anchored-scenario-helper.js and
 * test/packaging/sea-bundle-smoke.test.js delete NODE_OPTIONS;
 * test/release/runtime-entry-link.test.js and
 * test/scripts/change-proof-subsystem-participant-safety.test.js blank it.
 * None of these kills such a process on a passing path, and every
 * marker-less writer in collection 5 wrote an orderly-exit file; a new site
 * of this kind must keep the preload or be added here.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import v8 from 'node:v8';
import {BroadcastChannel, isMainThread, threadId} from 'node:worker_threads';

import {
  FLUSH_CHANNEL,
  FLUSH_INTERVAL_MS,
  FLUSH_PROCESS_EVENT,
  FLUSH_SIGNAL,
  FREEZE_BOUND_MS,
  WITNESS_MARKER,
  WORKER_ACK_BOUND_MS,
} from './fallback-branch-census-constants.js';

// A test shortens the interval through this variable; a lane never sets it.
const FLUSH_INTERVAL_ENV = 'LAGRANGE_CENSUS_FLUSH_INTERVAL_MS';
const FLUSHED_SIGNALS = Object.freeze(['SIGTERM', 'SIGINT']);
// Signals whose default action ends the process; SIGKILL cannot be handled.
const UNCATCHABLE_KILL = 'SIGKILL';
const TERMINATING_SIGNALS = Object.freeze(['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGQUIT']);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayPush = Function.call.bind(Array.prototype.push);
const jsonParse = JSON.parse;
const BEFORE_EXIT = 'beforeExit';
const EXIT = 'exit';
const WORKER_EVENT = 'worker';
const MESSAGE_EVENT = 'message';
const COVERAGE_ENV = 'NODE_V8_COVERAGE';
const END_BY_EXIT = 'exit';
const FLUSH_KIND = 'flush';
const SELF_REQUEST_PREFIX = 'self-';
const NEW_LISTENER = 'newListener';
const REMOVE_LISTENER = 'removeListener';
const ENTRY_ARGUMENT = 1;
const TEXT_ENCODING = 'utf8';
// Past this many milliseconds after a flush, no later write can share its
// file name.
const FILE_NAME_MILLISECONDS = 1;
const ACK_POLL_MS = 2;
const FREEZE_STEP_MS = 50;

// Primordials: captured before any code of the process can patch them.
const jsonStringify = JSON.stringify;
const objectKeys = Object.keys;
const arrayIsArray = Array.isArray;
const dateNow = Date.now;
const DateConstructor = Date;
const dateToISOString = Function.call.bind(Date.prototype.toISOString);
const writeFileSync = fs.writeFileSync;
const unlinkSync = fs.unlinkSync;
const readFileSync = fs.readFileSync;
const pathJoin = path.join;
const takeCoverage = v8.takeCoverage;

const directory = process.env[COVERAGE_ENV];
const sleepCell = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
const liveWorkers = new Set();
const servedRequests = new Set();
let signalFlushed = false;
let selfRequests = 0;
let channel = null;

function markerPath(suffix, thread = threadId) {
  return pathJoin(directory, `${WITNESS_MARKER.PREFIX}${process.pid}` +
    `${WITNESS_MARKER.SEPARATOR}${thread}${suffix}`);
}

// The JSON punctuation markerText writes between the fields it serializes.
const JSON_TEXT = Object.freeze({
  NULL: 'null', ARRAY_OPEN: '[', ARRAY_CLOSE: ']', OBJECT_OPEN: '{', OBJECT_CLOSE: '}',
  ITEM_SEPARATOR: ',', KEY_SEPARATOR: ':', EMPTY: '',
});

// JSON text of one marker field: a primitive, or an array of primitives.
// JSON.stringify of a primitive consults no toJSON hook; an array would.
function fieldText(value) {
  if (value === undefined) return JSON_TEXT.NULL;
  if (!arrayIsArray(value)) return jsonStringify(value);
  let text = JSON_TEXT.ARRAY_OPEN;
  for (let index = 0; index < value.length; index += 1) {
    text += `${index === 0 ? JSON_TEXT.EMPTY : JSON_TEXT.ITEM_SEPARATOR}${fieldText(value[index])}`;
  }
  return `${text}${JSON_TEXT.ARRAY_CLOSE}`;
}

// The marker's JSON text, built from the body's own fields in their order.
function markerText(body) {
  const keys = objectKeys(body);
  let text = JSON_TEXT.OBJECT_OPEN;
  for (let index = 0; index < keys.length; index += 1) {
    text += `${index === 0 ? JSON_TEXT.EMPTY : JSON_TEXT.ITEM_SEPARATOR}` +
      `${jsonStringify(keys[index])}${JSON_TEXT.KEY_SEPARATOR}${fieldText(body[keys[index]])}`;
  }
  return `${text}${JSON_TEXT.OBJECT_CLOSE}`;
}

function nowIso() {
  return dateToISOString(new DateConstructor(dateNow()));
}

function writeMarker(suffix, body) {
  try {
    writeFileSync(markerPath(suffix), markerText(body));
  } catch (_error) {
    // An unwritable coverage directory loses the marker; the merge then sees
    // coverage without a witness, never a witness claimed complete.
  }
}

function readMarker(file) {
  try {
    return jsonParse(readFileSync(file, TEXT_ENCODING));
  } catch (_error) {
    return null;
  }
}

function sleepMs(milliseconds) {
  Atomics.wait(sleepCell, 0, 0, milliseconds);
}

function flushCoverage() {
  try {
    takeCoverage();
  } catch (_error) {
    // Coverage is not enabled in this thread: there is nothing to flush.
    return;
  }
  const flushedAt = dateNow();
  while (dateNow() <= flushedAt + FILE_NAME_MILLISECONDS) {
    // Wait out the flushed file's millisecond (see the header).
  }
}

// Hold this thread still until the kill lands; withdraw the acknowledgement
// when it does not land within the bound.
function freezeUntilKilled() {
  const until = dateNow() + FREEZE_BOUND_MS;
  while (dateNow() < until) sleepMs(FREEZE_STEP_MS);
  try {
    unlinkSync(markerPath(WITNESS_MARKER.FLUSHED));
  } catch (_error) {
    // Already gone: nothing claims completeness.
  }
}

function onChannelMessage(event) {
  const request = event?.data;
  if (request?.kind !== FLUSH_KIND || typeof request.id !== 'string') return;
  flushCoverage();
  writeMarker(WITNESS_MARKER.FLUSHED, {id: request.id, final: request.final === true,
    at: nowIso()});
  if (request.final === true) freezeUntilKilled();
}

function openChannel() {
  try {
    channel = new BroadcastChannel(FLUSH_CHANNEL);
    channel.unref();
    if (!isMainThread) channel.addEventListener(MESSAGE_EVENT, onChannelMessage);
  } catch (_error) {
    channel = null;
  }
}

function onSignal() {
  if (signalFlushed) return;
  signalFlushed = true;
  flushCoverage();
}

function ownListenerCount(signal) {
  return arrayFilter(process.listeners(signal), (listener) => listener !== onSignal).length;
}

// Final: what follows ends the process before any of its JavaScript runs.
function isFinal(signal, selfKill) {
  if (selfKill || signal === UNCATCHABLE_KILL) return true;
  return arrayIncludes(TERMINATING_SIGNALS, signal) && ownListenerCount(signal) === 0;
}

function awaitWorkerAcks(id, waited) {
  const pending = new Set(waited);
  const acked = [];
  const deadline = dateNow() + WORKER_ACK_BOUND_MS;
  while (pending.size > 0 && dateNow() < deadline) {
    for (const thread of [...pending]) {
      if (readMarker(markerPath(WITNESS_MARKER.FLUSHED, thread))?.id === id) {
        pending.delete(thread);
        arrayPush(acked, thread);
      }
    }
    if (pending.size > 0) sleepMs(ACK_POLL_MS);
  }
  return {acked, unacked: [...pending]};
}

function serveFlush({id, signal, selfKill}) {
  const final = isFinal(signal, selfKill);
  flushCoverage();
  const waited = [...liveWorkers];
  if (channel) channel.postMessage({kind: FLUSH_KIND, id, final});
  const {acked, unacked} = awaitWorkerAcks(id, waited);
  writeMarker(WITNESS_MARKER.FLUSHED, {id, signal: signal ?? null, final, selfKill,
    ackedThreads: acked, unackedThreads: unacked, at: nowIso()});
  if (final && !selfKill) freezeUntilKilled();
}

function onFlushSignal() {
  const request = readMarker(markerPath(WITNESS_MARKER.FLUSH_REQUEST));
  if (typeof request?.id !== 'string' || servedRequests.has(request.id)) return;
  servedRequests.add(request.id);
  serveFlush({id: request.id, signal: request.signal, selfKill: false});
}

function onSelfFlush(signal) {
  selfRequests += 1;
  serveFlush({id: `${SELF_REQUEST_PREFIX}${selfRequests}`, signal, selfKill: true});
}

function trackWorkers() {
  process.on(WORKER_EVENT, (worker) => {
    // A Worker's threadId reads -1 once it has exited: keep it from now.
    const thread = worker.threadId;
    liveWorkers.add(thread);
    worker.once(EXIT, () => liveWorkers.delete(thread));
  });
}

// Follow the process's own signal listeners: flush beside them, never alone.
function followSignalListeners() {
  const attached = new Set();
  process.on(NEW_LISTENER, (event, listener) => {
    const followed = arrayIncludes(FLUSHED_SIGNALS, event);
    if (listener === onSignal || attached.has(event) || !followed) return;
    attached.add(event);
    process.on(event, onSignal);
  });
  process.on(REMOVE_LISTENER, (event, listener) => {
    if (listener === onSignal || !attached.has(event)) return;
    if (process.listenerCount(event) === 1) {
      attached.delete(event);
      process.removeListener(event, onSignal);
    }
  });
}

if (directory) {
  openChannel();
  if (isMainThread) {
    trackWorkers();
    followSignalListeners();
    process.on(FLUSH_SIGNAL, onFlushSignal);
    process.on(FLUSH_PROCESS_EVENT, onSelfFlush);
  }
  writeMarker(WITNESS_MARKER.START, {
    pid: process.pid, threadId, ppid: process.ppid,
    entry: process.argv[ENTRY_ARGUMENT] ?? null, cwd: process.cwd(),
    startedAt: nowIso(), isMainThread,
    flushSignal: isMainThread ? FLUSH_SIGNAL : null,
  });
  const interval = Number(process.env[FLUSH_INTERVAL_ENV]) || FLUSH_INTERVAL_MS;
  setInterval(flushCoverage, interval).unref();
  process.once(BEFORE_EXIT, flushCoverage);
  process.once(EXIT, (code) => {
    writeMarker(WITNESS_MARKER.END, {complete: true, by: END_BY_EXIT, exitCode: code,
      at: nowIso()});
  });
}
