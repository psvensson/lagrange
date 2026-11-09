/**
 * Coverage flush, pre-kill freeze, and expected-participant launch roster
 * hooks for the fallback-branch census (scripts/checks/fallback-branch-census.js
 * composes it into the lane's NODE_OPTIONS as `--import`, which Node applies to
 * the main thread and to every file-backed worker thread; it is never imported
 * by repository code).
 *
 * NODE_V8_COVERAGE writes a thread's coverage only when the thread ends in an
 * orderly way. A process a signal ends, a process that aborts, a worker that
 * dies with its process - each takes its coverage with it, and a lost process
 * can only hide an executed side, which would condemn a live branch. So every
 * thread under coverage:
 *
 * - writes a START marker `witness-<pid>-<threadId>.json` (pid, threadId,
 *   ppid, entry script argv[1], cwd, startedAt, isMainThread, flushSignal)
 *   into the coverage directory the moment it loads;
 * - flushes its coverage so far with `v8.takeCoverage()` every
 *   FLUSH_INTERVAL_MS (an unref'd timer: it never keeps a thread alive);
 * - flushes once more on `beforeExit`, and on SIGTERM or SIGINT in a process
 *   that listens for that signal itself (main thread);
 * - serves a PRE-KILL FLUSH (`SIGURG` / `BroadcastChannel` / `Atomics.wait`
 *   freeze, `scripts/checks/census-pre-kill-flush.js`);
 * - writes an END marker `witness-<pid>-<threadId>-exit.json` (with `at`) on
 *   `exit`, ordered before Node's final at-exit coverage write so accounting
 *   completes a thread by exit only when a coverage file of that thread was
 *   written at or after `at` (fallback-branch-census-witnesses.js).
 *
 * Markers are serialized with primordials captured at preload load before any
 * process code runs, immune to Object.prototype.toJSON, Array.prototype.toJSON,
 * JSON.stringify, Date.now, or Date.prototype.toISOString pollution.
 *
 * Launch owners also record every expected child Node process and Worker
 * thread in `roster-<pid>-<threadId>.json` inside the coverage directory:
 * this preload wraps `child_process` (`spawn`, `spawnSync`, `exec`,
 * `execSync`, `execFile`, `execFileSync`) and `worker_threads.Worker` and
 * synchronizes builtin ESM exports. A `new Worker(code, {eval: true})` thread
 * or a child process whose `--import` preload or `NODE_V8_COVERAGE` was
 * stripped therefore still appears in the expected participant roster and
 * fails closed as a lost witness (`cause: 'uninstrumented'`).
 */

import fs from 'node:fs';
import {createRequire, syncBuiltinESMExports} from 'node:module';
import path from 'node:path';
import util from 'node:util';
import v8 from 'node:v8';
import {BroadcastChannel, isMainThread, threadId} from 'node:worker_threads';

import {
  CENSUS_COVERAGE_DIR_ENV,
  FLUSH_CHANNEL,
  FLUSH_INTERVAL_MS,
  FLUSH_PROCESS_EVENT,
  FLUSH_SIGNAL,
  FREEZE_BOUND_MS,
  ROSTER_MARKER,
  WITNESS_MARKER,
  WORKER_ACK_BOUND_MS,
} from './fallback-branch-census-constants.js';
import {
  isClauseInstrumented,
  isNodeLaunchCommand,
  nowIsoString,
  serializeFlatJson,
} from './fallback-branch-census-shell.js';
import {
  recordExpectedForkProcess,
  recordExpectedNodeProcess,
  recordExpectedWorker,
} from './fallback-branch-census-witnesses.js';

const {process} = globalThis;

// A test shortens the interval through this variable; a lane never sets it.
const FLUSH_INTERVAL_ENV = 'LAGRANGE_CENSUS_FLUSH_INTERVAL_MS';
const FLUSHED_SIGNALS = Object.freeze(['SIGTERM', 'SIGINT']);
const UNCATCHABLE_KILL = 'SIGKILL';
const TERMINATING_SIGNALS = Object.freeze(['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGQUIT']);
const CHILD_PROCESS_MODULE = 'node:child_process';
const WORKER_THREADS_MODULE = 'node:worker_threads';
const DIRECT_NODE_LAUNCH_METHODS = Object.freeze(['spawn', 'spawnSync', 'execFile']);
const COMMAND_FAILED_PREFIX = 'Command failed: ';
const OPTION_SEPARATOR = ' ';
const NEWLINE = '\n';
const EMPTY = '';
const EMPTY_ARGS = Object.freeze([]);
const OBJECT_TYPE = 'object';
const FUNCTION_TYPE = 'function';
const CUSTOM_PROMISIFY_SYMBOL = util.promisify.custom;

const BEFORE_EXIT = 'beforeExit';
const EXIT = 'exit';
const ERROR_EVENT = 'error';
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
const WORKER_START_POLL_MS = 5;
const WORKER_START_BOUND_MS = 2000;
const FREEZE_STEP_MS = 50;

// Primordials captured before any code of the process can patch them.
const arrayIsArray = Array.isArray;
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayPush = Function.call.bind(Array.prototype.push);
const atomicsWait = Atomics.wait;
const toBoolean = Boolean;
const bufferIsBuffer = Buffer.isBuffer;
const bufferToString = Function.call.bind(Buffer.prototype.toString);
const ErrorConstructor = Error;
const toNumber = Number;
const numberIsInteger = Number.isInteger;
const PromiseConstructor = Promise;
const promiseResolve = Promise.resolve.bind(Promise);
const promiseThen = Function.call.bind(Promise.prototype.then);
const reflectApply = Reflect.apply;
const SetConstructor = Set;
const setAdd = Function.call.bind(Set.prototype.add);
const setDelete = Function.call.bind(Set.prototype.delete);
const setForEach = Function.call.bind(Set.prototype.forEach);
const setHas = Function.call.bind(Set.prototype.has);
const setSize = Function.call.bind(Object.getOwnPropertyDescriptor(Set.prototype, 'size').get);
const toStringValue = String;
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const WeakMapConstructor = WeakMap;
const weakMapGet = Function.call.bind(WeakMap.prototype.get);
const weakMapSet = Function.call.bind(WeakMap.prototype.set);
const jsonParse = JSON.parse;
const objectAssign = Object.assign;
const objectDefineProperty = Object.defineProperty;
const dateNow = Date.now;
const existsSync = fs.existsSync;
const readdirSync = fs.readdirSync;
const writeFileSync = fs.writeFileSync;
const unlinkSync = fs.unlinkSync;
const readFileSync = fs.readFileSync;
const pathJoin = path.join;
const processCwd = process.cwd.bind(process);
const processListenerCount = process.listenerCount.bind(process);
const processListeners = process.listeners.bind(process);
const processOn = process.on.bind(process);
const processOnce = process.once.bind(process);
const processRemoveListener = process.removeListener.bind(process);
const stderrWrite = process.stderr.write.bind(process.stderr);
const takeCoverage = v8.takeCoverage;
const rawSetInterval = setInterval;
const rawClearInterval = clearInterval;
const requireBuiltin = createRequire(import.meta.url);

const directory = process.env[COVERAGE_ENV];
const rosterDirectory = directory || process.env[CENSUS_COVERAGE_DIR_ENV];
const processRosterPrefix = `${ROSTER_MARKER.PREFIX}${process.pid}${ROSTER_MARKER.SEPARATOR}`;
const sleepCell = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
const liveWorkers = new SetConstructor();
const guardedWorkerThreads = new WeakMapConstructor();
const workerStartupStates = new WeakMapConstructor();
const servedRequests = new SetConstructor();
let signalFlushed = false;
let selfRequests = 0;
let channel = null;

function isOptionsObject(value) {
  return typeof value === OBJECT_TYPE && value !== null && !arrayIsArray(value);
}

function setValues(set) {
  const values = [];
  setForEach(set, (item) => {
    arrayPush(values, item);
  });
  return values;
}

function markerPath(suffix, thread = threadId) {
  return pathJoin(directory, `${WITNESS_MARKER.PREFIX}${process.pid}` +
    `${WITNESS_MARKER.SEPARATOR}${thread}${suffix}`);
}

function writeMarker(suffix, body, thread = threadId) {
  try {
    writeFileSync(markerPath(suffix, thread), serializeFlatJson(body));
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

function customPromisifyExec(wrapped) {
  return function promisifiedExec(...callArgs) {
    let child = null;
    const promise = new PromiseConstructor((resolve, reject) => {
      arrayPush(callArgs, (error, stdout, stderr) => {
        if (error !== null) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
        } else {
          resolve({stdout, stderr});
        }
      });
      child = reflectApply(wrapped, undefined, callArgs);
    });
    promise.child = child;
    return promise;
  };
}

function attachCustomPromisify(original, wrapped) {
  if (typeof original[CUSTOM_PROMISIFY_SYMBOL] === FUNCTION_TYPE) {
    objectDefineProperty(wrapped, CUSTOM_PROMISIFY_SYMBOL, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: customPromisifyExec(wrapped),
    });
  }
}

function wrapNodeProcessLaunch(fn, receiver) {
  const wrapped = function wrappedNodeProcessLaunch(...callArgs) {
    const result = reflectApply(fn, receiver, callArgs);
    recordExpectedNodeProcess(callArgs[0], callArgs[1], callArgs[2], result?.pid);
    return result;
  };
  attachCustomPromisify(fn, wrapped);
  return wrapped;
}

function wrapExecLaunch(fn, receiver) {
  const wrapped = function wrappedExecLaunch(...callArgs) {
    const result = reflectApply(fn, receiver, callArgs);
    const options = callArgs[1];
    const launchOptions = isOptionsObject(options) ? options : {};
    const shellOptions = {...launchOptions, shell: launchOptions.shell || true};
    recordExpectedNodeProcess(callArgs[0], null, shellOptions, result?.pid);
    return result;
  };
  attachCustomPromisify(fn, wrapped);
  return wrapped;
}

function wrapForkProcessLaunch(fn, receiver) {
  return function wrappedForkProcessLaunch(...callArgs) {
    const result = reflectApply(fn, receiver, callArgs);
    recordExpectedForkProcess(callArgs[0], callArgs[1], callArgs[2], result?.pid);
    return result;
  };
}

function formatStderrSuffix(stderr) {
  if (!stderr || stderr.length === 0) return EMPTY;
  const text = bufferIsBuffer(stderr) ?
    bufferToString(stderr, TEXT_ENCODING) :
    toStringValue(stderr);
  return `${NEWLINE}${text}`;
}

function finalizeExecSyncResult(commandLabel, launchOptions, result) {
  if (!launchOptions?.stdio && result.stderr && result.stderr.length > 0) {
    stderrWrite(result.stderr);
  }
  const resultFields = {
    status: result.status,
    signal: result.signal,
    output: result.output,
    pid: result.pid,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  if (result.error) {
    throw objectAssign(result.error, {error: result.error, ...resultFields});
  }
  if (result.status !== 0 || result.signal !== null) {
    const stderrSuffix = formatStderrSuffix(result.stderr);
    throw objectAssign(
      new ErrorConstructor(`${COMMAND_FAILED_PREFIX}${commandLabel}${stderrSuffix}`),
      resultFields,
    );
  }
  return result.stdout;
}

function formatExecCommandLabel(head, argList) {
  const parts = [head];
  for (let index = 0; index < argList.length; index += 1) {
    arrayPush(parts, argList[index]);
  }
  return arrayJoin(parts, OPTION_SEPARATOR);
}

function wrapExecFileSyncLaunch(origExecFileSync, origSpawnSync, receiver) {
  return function wrappedExecFileSync(...callArgs) {
    const command = callArgs[0];
    const args = callArgs[1];
    const options = callArgs[2];
    if (!isNodeLaunchCommand(command, args, options)) {
      return reflectApply(origExecFileSync, receiver, callArgs);
    }
    const hasArgArray = arrayIsArray(args);
    const argList = hasArgArray ? args : [];
    const rawOptions = hasArgArray ? options : args;
    const launchOptions = isOptionsObject(rawOptions) ? rawOptions : {};
    const result = origSpawnSync(command, argList, launchOptions);
    recordExpectedNodeProcess(command, argList, launchOptions, result?.pid);
    const commandLabel = formatExecCommandLabel(launchOptions.argv0 || command, argList);
    return finalizeExecSyncResult(commandLabel, launchOptions, result);
  };
}

function wrapExecSyncLaunch(origExecSync, origSpawnSync, receiver) {
  return function wrappedExecSync(...callArgs) {
    const command = callArgs[0];
    const options = callArgs[1];
    const launchOptions = isOptionsObject(options) ? options : {};
    const shellOptions = {...launchOptions, shell: launchOptions.shell || true};
    if (!isNodeLaunchCommand(command, null, shellOptions)) {
      return reflectApply(origExecSync, receiver, callArgs);
    }
    const result = origSpawnSync(command, shellOptions);
    recordExpectedNodeProcess(command, null, shellOptions, result?.pid);
    return finalizeExecSyncResult(command, launchOptions, result);
  };
}

function isWorkerEnvInstrumented(options, shareEnv) {
  const workerEnv = options?.env === undefined || options?.env === shareEnv ?
    process.env : options.env;
  return isClauseInstrumented(workerEnv);
}

function shouldGuardWorkerStartup(options, isInstrumentedEnv) {
  return toBoolean(directory) &&
    !toBoolean(options?.eval) &&
    isInstrumentedEnv;
}

function guardWorkerStartup(worker, rawUnref) {
  const startFile = markerPath(WITNESS_MARKER.START, worker.threadId);
  if (existsSync(startFile)) return;
  const deadline = dateNow() + WORKER_START_BOUND_MS;
  const state = {done: false, wantUnref: false, settled: null};
  state.settled = new PromiseConstructor((resolve) => {
    let timer = null;
    const finish = () => {
      if (state.done) return;
      state.done = true;
      if (timer !== null) rawClearInterval(timer);
      if (state.wantUnref) reflectApply(rawUnref, worker, EMPTY_ARGS);
      resolve();
    };
    timer = rawSetInterval(() => {
      if (existsSync(startFile) || dateNow() >= deadline) finish();
    }, WORKER_START_POLL_MS);
    worker.once(EXIT, finish);
    worker.once(ERROR_EVENT, finish);
  });
  weakMapSet(workerStartupStates, worker, state);
}

function isPendingProcessWorkerRosterFile(name) {
  if (!stringStartsWith(name, processRosterPrefix) ||
      !stringEndsWith(name, ROSTER_MARKER.SUFFIX)) {
    return false;
  }
  const tidText = stringSlice(
    name,
    processRosterPrefix.length,
    name.length - ROSTER_MARKER.SUFFIX.length,
  );
  const tid = toNumber(tidText);
  if (!numberIsInteger(tid) || tid <= 0) return false;
  if (existsSync(markerPath(WITNESS_MARKER.START, tid))) return false;
  const marker = readMarker(pathJoin(directory, name));
  if (marker === null) return true;
  return marker.eval !== true && marker.hasStrippedClause !== true;
}

function hasPendingProcessRosteredWorker() {
  if (!directory) return false;
  let names;
  try {
    names = readdirSync(directory);
  } catch (_error) {
    return false;
  }
  for (let index = 0; index < names.length; index += 1) {
    if (isPendingProcessWorkerRosterFile(names[index])) return true;
  }
  return false;
}

function waitForProcessRosteredWorkers() {
  if (!hasPendingProcessRosteredWorker()) return promiseResolve();
  const deadline = dateNow() + WORKER_START_BOUND_MS;
  return new PromiseConstructor((resolve) => {
    let done = false;
    let timer = null;
    const finish = () => {
      if (done) return;
      done = true;
      if (timer !== null) rawClearInterval(timer);
      resolve();
    };
    timer = rawSetInterval(() => {
      if (!hasPendingProcessRosteredWorker() || dateNow() >= deadline) finish();
    }, WORKER_START_POLL_MS);
  });
}

function writeTerminatedWorkerEnd(childThreadId, exitCode, terminatedAt) {
  if (!existsSync(markerPath(WITNESS_MARKER.START, childThreadId))) return;
  if (existsSync(markerPath(WITNESS_MARKER.END, childThreadId))) return;
  writeMarker(WITNESS_MARKER.END, {
    complete: true,
    by: END_BY_EXIT,
    exitCode,
    at: terminatedAt,
  }, childThreadId);
}

function invokeGuardedTerminate(rawTerminate, worker) {
  const childThreadId = weakMapGet(guardedWorkerThreads, worker);
  const trackEnd = childThreadId !== undefined && setHas(liveWorkers, childThreadId);
  const terminatedAt = trackEnd ? nowIsoString() : null;
  const exitPromise = reflectApply(rawTerminate, worker, EMPTY_ARGS);
  if (!trackEnd) return exitPromise;
  return promiseThen(exitPromise, (exitCode) => {
    writeTerminatedWorkerEnd(childThreadId, exitCode, terminatedAt);
    return exitCode;
  });
}

function createRosteredWorkerClass(OriginalWorker, shareEnv) {
  const rawTerminate = OriginalWorker.prototype.terminate;
  const rawUnref = OriginalWorker.prototype.unref;
  const rawRef = OriginalWorker.prototype.ref;
  return class RosteredWorker extends OriginalWorker {
    constructor(filename, options) {
      super(filename, options);
      const instrumentedEnv = isWorkerEnvInstrumented(options, shareEnv);
      recordExpectedWorker(
        process.env[COVERAGE_ENV] || rosterDirectory,
        this.threadId,
        filename,
        options,
        instrumentedEnv,
      );
      if (shouldGuardWorkerStartup(options, instrumentedEnv)) {
        const childThreadId = this.threadId;
        weakMapSet(guardedWorkerThreads, this, childThreadId);
        setAdd(liveWorkers, childThreadId);
        this.once(EXIT, () => setDelete(liveWorkers, childThreadId));
        guardWorkerStartup(this, rawUnref);
      }
    }

    unref() {
      const state = weakMapGet(workerStartupStates, this);
      if (state && !state.done) {
        state.wantUnref = true;
        return this;
      }
      return reflectApply(rawUnref, this, EMPTY_ARGS);
    }

    ref() {
      const state = weakMapGet(workerStartupStates, this);
      if (state) state.wantUnref = false;
      return reflectApply(rawRef, this, EMPTY_ARGS);
    }

    terminate() {
      const worker = this;
      const state = weakMapGet(workerStartupStates, worker);
      const ownStartup = state && !state.done ? state.settled : null;
      if (ownStartup === null && !hasPendingProcessRosteredWorker()) {
        return invokeGuardedTerminate(rawTerminate, worker);
      }
      const afterOwn = ownStartup !== null ?
        promiseThen(ownStartup, waitForProcessRosteredWorkers) :
        waitForProcessRosteredWorkers();
      return promiseThen(afterOwn, () => invokeGuardedTerminate(rawTerminate, worker));
    }
  };
}

function installLaunchRosterHooks() {
  const childProcess = requireBuiltin(CHILD_PROCESS_MODULE);
  const origSpawnSync = childProcess.spawnSync;
  for (let index = 0; index < DIRECT_NODE_LAUNCH_METHODS.length; index += 1) {
    const method = DIRECT_NODE_LAUNCH_METHODS[index];
    childProcess[method] = wrapNodeProcessLaunch(childProcess[method], childProcess);
  }
  childProcess.exec = wrapExecLaunch(childProcess.exec, childProcess);
  childProcess.execFileSync = wrapExecFileSyncLaunch(
    childProcess.execFileSync,
    origSpawnSync,
    childProcess,
  );
  childProcess.execSync = wrapExecSyncLaunch(
    childProcess.execSync,
    origSpawnSync,
    childProcess,
  );
  childProcess.fork = wrapForkProcessLaunch(childProcess.fork, childProcess);
  const workerThreads = requireBuiltin(WORKER_THREADS_MODULE);
  workerThreads.Worker = createRosteredWorkerClass(
    workerThreads.Worker,
    workerThreads.SHARE_ENV,
  );
  syncBuiltinESMExports();
}

function sleepMs(milliseconds) {
  atomicsWait(sleepCell, 0, 0, milliseconds);
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

function freezeUntilKilled() {
  const until = dateNow() + FREEZE_BOUND_MS;
  while (dateNow() < until) sleepMs(FREEZE_STEP_MS);
  try {
    unlinkSync(markerPath(WITNESS_MARKER.FLUSHED));
  } catch (_error) {
    // Already gone: nothing claims completeness.
  }
}

function awaitWorkerAcks(id, waited) {
  const pending = new SetConstructor();
  for (let index = 0; index < waited.length; index += 1) {
    setAdd(pending, waited[index]);
  }
  const acked = [];
  const deadline = dateNow() + WORKER_ACK_BOUND_MS;
  while (setSize(pending) > 0 && dateNow() < deadline) {
    const snapshot = setValues(pending);
    for (let index = 0; index < snapshot.length; index += 1) {
      const thread = snapshot[index];
      if (readMarker(markerPath(WITNESS_MARKER.FLUSHED, thread))?.id === id) {
        setDelete(pending, thread);
        arrayPush(acked, thread);
      }
    }
    if (setSize(pending) > 0) sleepMs(ACK_POLL_MS);
  }
  return {acked, unacked: setValues(pending)};
}

function onChannelMessage(event) {
  const request = event?.data;
  if (request?.kind !== FLUSH_KIND || typeof request.id !== 'string') return;
  if (setHas(servedRequests, request.id)) return;
  setAdd(servedRequests, request.id);
  flushCoverage();
  const waited = setValues(liveWorkers);
  const {acked, unacked} = awaitWorkerAcks(request.id, waited);
  writeMarker(WITNESS_MARKER.FLUSHED, {
    id: request.id,
    final: request.final === true,
    ackedThreads: acked,
    unackedThreads: unacked,
    at: nowIsoString(),
  });
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
  return arrayFilter(processListeners(signal), (listener) => listener !== onSignal).length;
}

function isFinal(signal, selfKill) {
  if (selfKill || signal === UNCATCHABLE_KILL) return true;
  return arrayIncludes(TERMINATING_SIGNALS, signal) && ownListenerCount(signal) === 0;
}

function serveFlush({id, signal, selfKill}) {
  const final = isFinal(signal, selfKill);
  flushCoverage();
  const waited = setValues(liveWorkers);
  if (channel) channel.postMessage({kind: FLUSH_KIND, id, final});
  const {acked, unacked} = awaitWorkerAcks(id, waited);
  writeMarker(WITNESS_MARKER.FLUSHED, {
    id,
    signal: signal ?? null,
    final,
    selfKill,
    ackedThreads: acked,
    unackedThreads: unacked,
    at: nowIsoString(),
  });
  if (final && !selfKill) freezeUntilKilled();
}

function onFlushSignal() {
  const request = readMarker(markerPath(WITNESS_MARKER.FLUSH_REQUEST));
  if (typeof request?.id !== 'string' || setHas(servedRequests, request.id)) return;
  setAdd(servedRequests, request.id);
  serveFlush({id: request.id, signal: request.signal, selfKill: false});
}

function onSelfFlush(signal) {
  selfRequests += 1;
  serveFlush({id: `${SELF_REQUEST_PREFIX}${selfRequests}`, signal, selfKill: true});
}

// Follow the process's own signal listeners: flush beside them, never alone.
function followSignalListeners() {
  const attached = new SetConstructor();
  processOn(NEW_LISTENER, (event, listener) => {
    const followed = arrayIncludes(FLUSHED_SIGNALS, event);
    if (listener === onSignal || setHas(attached, event) || !followed) return;
    setAdd(attached, event);
    processOn(event, onSignal);
  });
  processOn(REMOVE_LISTENER, (event, listener) => {
    if (listener === onSignal || !setHas(attached, event)) return;
    if (processListenerCount(event) === 1) {
      setDelete(attached, event);
      processRemoveListener(event, onSignal);
    }
  });
}

if (rosterDirectory) {
  installLaunchRosterHooks();
}

if (directory) {
  openChannel();
  if (isMainThread) {
    followSignalListeners();
    processOn(FLUSH_SIGNAL, onFlushSignal);
    processOn(FLUSH_PROCESS_EVENT, onSelfFlush);
  } else {
    flushCoverage();
  }
  writeMarker(WITNESS_MARKER.START, {
    pid: process.pid,
    threadId,
    ppid: process.ppid,
    entry: process.argv[ENTRY_ARGUMENT] ?? null,
    cwd: processCwd(),
    startedAt: nowIsoString(),
    isMainThread,
    flushSignal: isMainThread ? FLUSH_SIGNAL : null,
  });
  const interval = toNumber(process.env[FLUSH_INTERVAL_ENV]) || FLUSH_INTERVAL_MS;
  rawSetInterval(flushCoverage, interval).unref();
  processOnce(BEFORE_EXIT, flushCoverage);
  processOnce(EXIT, (code) => {
    writeMarker(WITNESS_MARKER.END, {
      complete: true,
      by: END_BY_EXIT,
      exitCode: code,
      at: nowIsoString(),
    });
  });
}
