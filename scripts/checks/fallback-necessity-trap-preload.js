/**
 * The necessity trap preload: composed into a lane's NODE_OPTIONS as
 * `--import=<abs>/scripts/checks/fallback-necessity-trap-preload.js` only in
 * trap runs, so it rides every process and file-backed worker thread the
 * lane starts. It is separate from the census preload on purpose: the census
 * preload's digest is part of every census run's validity, and a trap run
 * changes the code it loads, so a trap run collects no coverage.
 *
 * Without LAGRANGE_NECESSITY_TRAP_PLAN it does nothing. With it:
 * - LAGRANGE_NECESSITY_TRAP_MODE `observe` (no behaviour change) or `throw`;
 *   anything else refuses the process at startup;
 * - LAGRANGE_NECESSITY_TRAP_OUT the directory for
 *   `trap-<pid>-<thread>-<token>.json`, one file per process start, created
 *   exclusively (a restarted process never overwrites an earlier one);
 * - LAGRANGE_NECESSITY_TRAP_SELECT the arms that throw (throw mode only, an
 *   include token is required; grammar in fallback-necessity-trap-runtime.js);
 * - LAGRANGE_NECESSITY_TRAP_ROOT the checkout the plan's paths are relative
 *   to, when it is not the plan's own `root` (a container's /app).
 *
 * Every planned module is rewritten at load (module.registerHooks `load`,
 * in-thread, so ESM imports and dynamic imports both pass through it) from
 * the plan's precomputed insertions after its slice hashes are checked; a
 * drifted file refuses to load (NecessityTrapPlanDriftError) and is recorded.
 *
 * The thread's observation file is written at each arm's first hit, on
 * `beforeExit` and `exit`, every FLUSH_INTERVAL_MS (unref'd), on the census
 * pre-kill flush signal (SIGURG) and process event, and beside the process's
 * own SIGTERM/SIGINT listeners (as the census preload follows them; a
 * process without its own listener dies by the default action, and only the
 * first-hit writes survive it).
 *
 * The roster: run the census preload beside it in roster-only mode
 * (`--import=<census preload>` first, LAGRANGE_CENSUS_COVERAGE_DIR set to the
 * trap's out directory, NODE_V8_COVERAGE unset). The census preload then
 * records every Node child and worker the lane launches as
 * `roster-<pid>-<thread>.json` there - the census's own expected-participant
 * roster, reused, not a second one - and `merge` reports a rostered process
 * that left no observation as a gap. In that mode this preload also writes the
 * census start marker and answers the census pre-kill flush request, so a
 * harness kill does not wait for a census preload that is not collecting.
 * A marker error that reaches the process's uncaught-exception monitor is
 * recorded as surfaced.
 *
 * Its import closure is node builtins, the trap runtime and the census
 * constants - three files, no packages - so it can ride a production image
 * or container that carries only src/ (copy those three files and the plan in).
 */
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {registerHooks} from 'node:module';
import os from 'node:os';
import {TextDecoder} from 'node:util';
import {isMainThread, threadId} from 'node:worker_threads';

import path from 'node:path';

import {
  CENSUS_COVERAGE_DIR_ENV, FLUSH_INTERVAL_MS, FLUSH_PROCESS_EVENT, FLUSH_SIGNAL, WITNESS_MARKER,
} from './fallback-branch-census-constants.js';
import {
  PLAN_SCHEMA, TRAP_ENV, TRAP_GLOBAL, TRAP_PROBLEM, createTrapRecorder, observationFileName,
  parseSelection, plannedFileOfUrl, rewriteSource,
} from './fallback-necessity-trap-runtime.js';

const {process} = globalThis;
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const jsonParse = JSON.parse;
const objectDefineProperty = Object.defineProperty;
const textDecoder = new TextDecoder();

const TEXT_ENCODING = 'utf8';
const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';
const ENTRY_ARGUMENT = 1;
const PROCESS_KEY_SEPARATOR = ':';
const FOLLOWED_SIGNALS = Object.freeze(['SIGTERM', 'SIGINT']);
const NEW_LISTENER = 'newListener';
const BEFORE_EXIT = 'beforeExit';
const EXIT = 'exit';
const STRING_TYPE_NAME = 'string';
const SOURCE_UNAVAILABLE = 'module-source-unavailable';
const REFUSED_PREFIX = 'necessity trap: refused ';
const UNCAUGHT_MONITOR = 'uncaughtExceptionMonitor';
const MAIN_THREAD = 0;
const ROSTER_ROLE = 'necessity-trap';

function sourceText(source) {
  return typeof source === STRING_TYPE_NAME ? source : textDecoder.decode(source);
}

function readPlan(planPath) {
  const bytes = fs.readFileSync(planPath);
  const plan = jsonParse(bytes.toString(TEXT_ENCODING));
  if (plan?.schema !== PLAN_SCHEMA) throw new Error(`${TRAP_PROBLEM.PLAN_SCHEMA}${planPath}`);
  return {plan, digest: createHash(DIGEST_ALGORITHM).update(bytes).digest(DIGEST_ENCODING)};
}

function markerPath(directory, suffix) {
  return path.join(directory, `${WITNESS_MARKER.PREFIX}${process.pid}${WITNESS_MARKER.SEPARATOR}` +
    `${MAIN_THREAD}${suffix}`);
}

function readMarker(file) {
  try {
    return jsonParse(fs.readFileSync(file, TEXT_ENCODING));
  } catch (_error) {
    // No request (or a torn one): there is nothing to acknowledge.
    return null;
  }
}

// In roster mode: the census start marker, then flush on the census
// pre-kill request and acknowledge it, as the census preload would.
function servePreKillFlush(directory, flush) {
  fs.writeFileSync(markerPath(directory, WITNESS_MARKER.START), JSON.stringify({
    pid: process.pid, threadId: MAIN_THREAD, startedAt: new Date().toISOString(),
    role: ROSTER_ROLE}));
  return () => {
    flush();
    const request = readMarker(markerPath(directory, WITNESS_MARKER.FLUSH_REQUEST));
    if (typeof request?.id !== STRING_TYPE_NAME) return;
    fs.writeFileSync(markerPath(directory, WITNESS_MARKER.FLUSHED),
      JSON.stringify({id: request.id, final: false, role: ROSTER_ROLE}));
  };
}

function installFlushTriggers(flush, rosterDirectory) {
  setInterval(flush, FLUSH_INTERVAL_MS).unref();
  process.once(BEFORE_EXIT, flush);
  process.on(EXIT, flush);
  if (!isMainThread) return;
  process.on(FLUSH_SIGNAL, rosterDirectory ? servePreKillFlush(rosterDirectory, flush) : flush);
  process.on(FLUSH_PROCESS_EVENT, flush);
  // Flush beside the process's own signal listeners, never alone: adding a
  // listener of our own would replace the default termination.
  const followed = new Set();
  process.on(NEW_LISTENER, (event, listener) => {
    if (listener === flush || followed.has(event) || !arrayIncludes(FOLLOWED_SIGNALS, event)) {
      return;
    }
    followed.add(event);
    process.on(event, flush);
  });
}

function install(planPath) {
  const env = process.env;
  const {plan, digest} = readPlan(planPath);
  const outDir = env[TRAP_ENV.OUT];
  if (!outDir || !fs.statSync(outDir, {throwIfNoEntry: false})?.isDirectory()) {
    throw new Error(TRAP_PROBLEM.OUT);
  }
  const root = env[TRAP_ENV.ROOT] || plan.root;
  const startedAt = new Date().toISOString();
  const rosterDirectory = env[CENSUS_COVERAGE_DIR_ENV];
  const rostered = Boolean(rosterDirectory) &&
    path.resolve(rosterDirectory) === path.resolve(outDir);
  const recorder = createTrapRecorder({
    plan, planDigest: digest, mode: env[TRAP_ENV.MODE], root, outDir,
    selection: parseSelection(env[TRAP_ENV.SELECT]),
    processKey: [os.hostname(), process.pid, threadId, startedAt].join(PROCESS_KEY_SEPARATOR),
    entry: process.argv[ENTRY_ARGUMENT] ?? null,
    fileName: observationFileName(process.pid, threadId),
    pid: process.pid, threadId, startedAt, roster: rostered,
  });
  objectDefineProperty(globalThis, TRAP_GLOBAL, {
    value: recorder.trap, writable: false, enumerable: false, configurable: false,
  });
  registerHooks({
    load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      const file = plannedFileOfUrl(url, root);
      if (file === undefined || !Object.hasOwn(plan.files, file)) return result;
      if (result.source === undefined || result.source === null) {
        recorder.noteRefused(file, SOURCE_UNAVAILABLE);
        recorder.flush();
        throw new Error(`${REFUSED_PREFIX}${file}: ${SOURCE_UNAVAILABLE}`);
      }
      let source;
      try {
        source = rewriteSource(plan, file, sourceText(result.source));
      } catch (error) {
        recorder.noteRefused(file, error.reason ?? String(error.message));
        recorder.flush();
        throw error;
      }
      recorder.noteLoaded(file);
      return {...result, source, shortCircuit: true};
    },
  });
  recorder.flush();
  installFlushTriggers(recorder.flush, rostered ? outDir : null);
  process.on(UNCAUGHT_MONITOR, recorder.noteSurfaced);
}

const planPath = process.env[TRAP_ENV.PLAN];
if (planPath) install(planPath);
