/**
 * WASI component derivation owner (quest wasi-component-startup-budget).
 *
 * The jco transpile of a component is a pure function of the component
 * bytes, the pinned transpile toolchain, the world name and the
 * instantiation mode. It is 97% of a Cell start: measured 3.4-3.6 s for the
 * 12.9 MB h1 Hono component on the 20-core controller, against about 0.1 s
 * for everything else in the start. This owner derives each key once per
 * node, single-flight, on one derivation lane, and hands the derived files
 * to every start, restart and replica of that component. The Cell start
 * itself is therefore instantiate-only and keeps its fixed liveness bound.
 *
 * Bounds (R13). A running derivation is never killed on wall time, because
 * wall time measures contention, not progress (four concurrent transpiles
 * on 2 cores: 13.4 s wall, 5.9 s CPU). It is bounded by:
 *   - the artifact admission size cap;
 *   - one derivation lane per runtime, which is one per node;
 *   - a byte-proportional CPU-time ceiling read with worker.cpuUsage();
 *   - owner cancellation: the last holder releases it, a new digest
 *     supersedes it, or the runtime shuts down.
 *
 * Outcomes are named states (R07). A refusal (failed or exhausted) is
 * permanent for its key for the life of the process, with no automatic
 * redo. It is cleared only by a new digest or by an operator restarting the
 * node.
 *
 * @module runtime/wasi-component-derivation
 */
import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';

import {
  resolveModuleDirectory,
  resolvePackagedRuntimeFile,
} from '../sea/runtime-file-resolution.js';
import {
  WASI_COMPONENT_CELL_ERROR_CODE,
  WasiComponentCellError,
} from './wasi-component-cell-errors.js';

// Part of every derivation key. A guard test pins it to package.json.
const DERIVATION_TOOLCHAIN = '@bytecodealliance/jco-transpile@0.4.2';
const DERIVATION_INSTANTIATION = 'async';
// CPU ceiling, decided by the lead on 2026-11-02 (quest
// wasi-component-startup-budget log). Measured cost: a cold transpile of
// the 12,912,649-byte h1 component takes 4.1 s CPU, which is about
// 0.33 s/MiB alone and 0.48 s/MiB under 4x contention on 2 cores. The
// allowance is 2 s/MiB plus 5 s fixed for the transpiler's own start.
// That is 29.6 s for h1 (about 6x this host) and 517 s at the 256 MiB
// admission cap. The ceiling stops a runaway pure function; it is not a
// performance budget. A size-only bound was rejected: a pathological
// component would then hold the node's single derivation lane without
// bound.
const DERIVATION_CPU_MS_PER_MIB = 2000;
const DERIVATION_CPU_FIXED_MS = 5000;
const DERIVATION_CPU_SAMPLE_INTERVAL_MS = 250;
const BYTES_PER_MIB = 1024 * 1024;
const MICROSECONDS_PER_MS = 1000;
// Derived files no Cell holds are kept for a later restart up to one
// admission-cap component's worth of bytes, oldest evicted first.
const DERIVATION_RETAINED_UNHELD_BYTES = 256 * BYTES_PER_MIB;

// DERIVED and REFUSED are retained for the key; CANCELLED and UNAVAILABLE
// are typed on this start only and never retained, so the next acquire
// derives again (the caller's own cadence is the re-drive; the owner has no
// retry loop). REFUSED is reserved for the two outcomes that are properties
// of the component: a transpile failure the worker reports, and the CPU
// ceiling.
const DERIVATION_OUTCOME = Object.freeze({
  CANCELLED: 'cancelled',
  DERIVED: 'derived',
  REFUSED: 'refused',
  UNAVAILABLE: 'unavailable',
});
const DERIVATION_STATE = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  ...DERIVATION_OUTCOME,
});
const DERIVATION_ERROR_CODE = Object.freeze({
  EXHAUSTED: WASI_COMPONENT_CELL_ERROR_CODE.COMPONENT_DERIVATION_EXHAUSTED,
  FAILED: WASI_COMPONENT_CELL_ERROR_CODE.COMPONENT_DERIVATION_FAILED,
  UNAVAILABLE: WASI_COMPONENT_CELL_ERROR_CODE.COMPONENT_UNAVAILABLE,
});
const DERIVATION_ERROR_MESSAGE = Object.freeze({
  CANCELLED: 'Component derivation cancelled',
  EXHAUSTED: 'Component derivation CPU ceiling exhausted',
  EXITED: 'Component derivation worker exited before deriving',
  FAILED: 'Component derivation failed',
  UNAVAILABLE: 'Component derivation unavailable',
});
const DERIVATION_WORKER_MESSAGE = Object.freeze({
  DERIVED: 'derived',
  FAILED: 'derivation_failed',
});
const DERIVATION_WORKER_EVENT = Object.freeze({
  ERROR: 'error',
  EXIT: 'exit',
  MESSAGE: 'message',
  ONLINE: 'online',
});
const DERIVATION_WORKER_SOURCE_FILE = 'wasi-component-derivation-worker.js';
const DERIVATION_WORKER_BUNDLE_FILE = 'component-derivation-worker.bundle.mjs';
const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';
const KEY_SEPARATOR = '\u0000';
const DERIVATION_MODULE_DIR = resolveModuleDirectory(resolveModuleDirectory);

/**
 * CPU-time ceiling for deriving a component of the given size.
 * @param {number} componentBytes
 * @return {number} milliseconds of derivation-worker CPU time
 */
function derivationCpuBudgetMs(componentBytes) {
  return DERIVATION_CPU_FIXED_MS +
    Math.ceil(componentBytes / BYTES_PER_MIB * DERIVATION_CPU_MS_PER_MIB);
}

function derivationKey(bytes, world) {
  return createHash(DIGEST_ALGORITHM)
    .update(bytes)
    .update([KEY_SEPARATOR, DERIVATION_TOOLCHAIN, world,
      DERIVATION_INSTANTIATION].join(KEY_SEPARATOR))
    .digest(DIGEST_ENCODING);
}

function filesByteLength(files) {
  let total = 0;
  for (const file of Object.values(files)) total += file.byteLength;
  return total;
}

function refused(code, message, detail) {
  return Object.freeze({
    error: new WasiComponentCellError(code, message, {detail}),
    outcome: DERIVATION_OUTCOME.REFUSED,
  });
}

function cancelledOutcome() {
  return Object.freeze({
    error: new WasiComponentCellError(
      DERIVATION_ERROR_CODE.UNAVAILABLE,
      DERIVATION_ERROR_MESSAGE.CANCELLED,
    ),
    outcome: DERIVATION_OUTCOME.CANCELLED,
  });
}

// An infrastructure failure (thread init, OOM at creation, killed before
// deriving): typed on this start, not a property of the component.
function unavailableOutcome(cause) {
  return Object.freeze({
    error: new WasiComponentCellError(
      DERIVATION_ERROR_CODE.UNAVAILABLE,
      `${DERIVATION_ERROR_MESSAGE.UNAVAILABLE}: ${cause.message}`,
      {cause},
    ),
    outcome: DERIVATION_OUTCOME.UNAVAILABLE,
  });
}

function resolveDerivationWorkerPath() {
  return resolvePackagedRuntimeFile({
    bundledFileName: DERIVATION_WORKER_BUNDLE_FILE,
    moduleDir: DERIVATION_MODULE_DIR,
    sourceFileName: DERIVATION_WORKER_SOURCE_FILE,
  });
}

class WasiComponentDerivationOwner {
  constructor() {
    this.workerPath = resolveDerivationWorkerPath();
    this.cpuSampleIntervalMs = DERIVATION_CPU_SAMPLE_INTERVAL_MS;
    this.entries = new Map();
    this.holderKeys = new Map();
    this.lane = Promise.resolve();
    this.counts = {
      cancelled: 0, completed: 0, refused: 0, runs: 0, unavailable: 0,
    };
  }

  /**
   * Hold the derivation of `component` for `holderId` (one key per
   * holder; a new key supersedes the holder's previous one). Resolves to a
   * named outcome and never rejects.
   * @param {string} holderId
   * @param {{bytes: Uint8Array, world: string}} component
   * @return {Promise<{outcome: string, files?: Object, error?: Error}>}
   */
  acquire(holderId, component) {
    const key = derivationKey(component.bytes, component.world);
    if (this.holderKeys.get(holderId) !== key) this.release(holderId);
    let entry = this.entries.get(key);
    if (!entry) entry = this.enqueue(key, component);
    this.entries.delete(key);
    this.entries.set(key, entry);
    entry.holders.add(holderId);
    this.holderKeys.set(holderId, key);
    return entry.promise;
  }

  release(holderId) {
    const key = this.holderKeys.get(holderId);
    if (key === undefined) return;
    this.holderKeys.delete(holderId);
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.holders.delete(holderId);
    if (entry.holders.size > 0) return;
    if (entry.state === DERIVATION_STATE.QUEUED) {
      this.settle(entry, cancelledOutcome());
    } else if (entry.state === DERIVATION_STATE.RUNNING) {
      entry.abort(cancelledOutcome());
    } else {
      this.enforceRetention();
    }
  }

  enqueue(key, component) {
    const entry = {
      bytes: component.bytes,
      byteLength: component.bytes.byteLength,
      holders: new Set(),
      key,
      state: DERIVATION_STATE.QUEUED,
      world: component.world,
    };
    entry.promise = new Promise((resolve) => {
      entry.resolve = resolve;
    });
    this.entries.set(key, entry);
    this.lane = this.lane.then(() => this.run(entry));
    return entry;
  }

  // A thread that cannot be created settles its entry unavailable and leaves
  // the lane usable for the next derivation (the lane step answers nothing).
  settleUnstarted(entry, error) {
    this.settle(entry, unavailableOutcome(error));
  }

  run(entry) {
    if (entry.state !== DERIVATION_STATE.QUEUED) return undefined;
    entry.state = DERIVATION_STATE.RUNNING;
    this.counts.runs += 1;
    const cpuBudgetMs = derivationCpuBudgetMs(entry.byteLength);
    let worker;
    try {
      worker = new Worker(this.workerPath, {
        workerData: {
          bytes: new Uint8Array(entry.bytes),
          instantiation: DERIVATION_INSTANTIATION,
          name: entry.world,
        },
      });
    } catch (error) {
      return this.settleUnstarted(entry, error);
    }
    return new Promise((laneResolve) => {
      let timer = null;
      const finish = (outcome) => {
        if (entry.state !== DERIVATION_STATE.RUNNING) return;
        clearTimeout(timer);
        worker.removeAllListeners();
        entry.termination = worker.terminate();
        this.settle(entry, outcome);
        laneResolve(entry.termination);
      };
      entry.abort = finish;
      const exhaustedOrNull = (usage) => {
        const cpuMs = (usage.user + usage.system) / MICROSECONDS_PER_MS;
        return cpuMs > cpuBudgetMs ? refused(
          DERIVATION_ERROR_CODE.EXHAUSTED,
          DERIVATION_ERROR_MESSAGE.EXHAUSTED,
          {componentBytes: entry.byteLength, cpuBudgetMs, cpuMs},
        ) : null;
      };
      // Sampled only once the thread runs: before 'online', cpuUsage()
      // rejects ERR_WORKER_NOT_RUNNING. A rejected sample is no sample and
      // is rescheduled; it never decides the outcome.
      const scheduleCpuSample = () => {
        timer = setTimeout(() => {
          worker.cpuUsage().then((usage) => {
            const exhausted = exhaustedOrNull(usage);
            if (exhausted) finish(exhausted);
            else if (entry.state === DERIVATION_STATE.RUNNING) {
              scheduleCpuSample();
            }
          }, () => {
            if (entry.state === DERIVATION_STATE.RUNNING) scheduleCpuSample();
          });
        }, this.cpuSampleIntervalMs);
      };
      worker.once(DERIVATION_WORKER_EVENT.ONLINE, scheduleCpuSample);
      worker.on(DERIVATION_WORKER_EVENT.MESSAGE, (message) => {
        finish(message.type === DERIVATION_WORKER_MESSAGE.DERIVED ?
          Object.freeze({files: message.files,
            outcome: DERIVATION_OUTCOME.DERIVED}) :
          refused(DERIVATION_ERROR_CODE.FAILED,
            message.message || DERIVATION_ERROR_MESSAGE.FAILED,
            {componentBytes: entry.byteLength}));
      });
      worker.on(DERIVATION_WORKER_EVENT.ERROR,
        (error) => finish(unavailableOutcome(error)));
      worker.on(DERIVATION_WORKER_EVENT.EXIT, () => finish(
        unavailableOutcome(new Error(DERIVATION_ERROR_MESSAGE.EXITED))));
    });
  }

  settle(entry, outcome) {
    entry.state = outcome.outcome;
    entry.bytes = null;
    entry.abort = null;
    if (outcome.outcome === DERIVATION_OUTCOME.DERIVED) {
      this.counts.completed += 1;
      entry.files = outcome.files;
      entry.filesBytes = filesByteLength(outcome.files);
    } else if (outcome.outcome === DERIVATION_OUTCOME.REFUSED) {
      this.counts.refused += 1;
    } else {
      this.counts[outcome.outcome] += 1;
      this.forget(entry);
    }
    entry.resolve(outcome);
    if (entry.holders.size === 0) this.enforceRetention();
  }

  // A non-retained outcome drops the entry and its holders' claims, so the
  // next acquire of the key enqueues a fresh derivation.
  forget(entry) {
    if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
    for (const holderId of entry.holders) {
      if (this.holderKeys.get(holderId) === entry.key) {
        this.holderKeys.delete(holderId);
      }
    }
  }

  enforceRetention() {
    const unheld = [...this.entries.values()].filter((entry) =>
      entry.holders.size === 0 && entry.state === DERIVATION_STATE.DERIVED);
    let retainedBytes = 0;
    for (const entry of unheld) retainedBytes += entry.filesBytes;
    for (const entry of unheld) {
      if (retainedBytes <= DERIVATION_RETAINED_UNHELD_BYTES) return;
      retainedBytes -= entry.filesBytes;
      this.entries.delete(entry.key);
    }
  }

  telemetry() {
    let inFlight = 0;
    let retained = 0;
    for (const entry of this.entries.values()) {
      if (entry.state === DERIVATION_STATE.QUEUED ||
          entry.state === DERIVATION_STATE.RUNNING) {
        inFlight += 1;
      } else if (entry.state === DERIVATION_STATE.DERIVED) {
        retained += 1;
      }
    }
    return Object.freeze({...this.counts, inFlight, retained});
  }

  async shutdown() {
    const terminations = [];
    for (const entry of [...this.entries.values()]) {
      if (entry.state === DERIVATION_STATE.QUEUED) {
        this.settle(entry, cancelledOutcome());
      } else if (entry.state === DERIVATION_STATE.RUNNING) {
        entry.abort(cancelledOutcome());
      }
      if (entry.termination) terminations.push(entry.termination);
    }
    this.entries.clear();
    this.holderKeys.clear();
    await Promise.all(terminations);
  }
}

export {
  DERIVATION_CPU_FIXED_MS,
  DERIVATION_CPU_MS_PER_MIB,
  DERIVATION_OUTCOME,
  DERIVATION_TOOLCHAIN,
  WasiComponentDerivationOwner,
  derivationCpuBudgetMs,
};
