import {promises as fs} from 'node:fs';
import {dirname} from 'node:path';
import {CLUSTER_STARTUP_GATE_LAYER} from './cluster-startup-gate-layer.js';

const {
  LABELS,
  MIN_TIMEOUT_MS,
  PROCESS_CLEANUP_REGISTRY,
  PROCESS_EVENT_EXIT,
  PROCESS_EVENT_UNCAUGHT_EXCEPTION,
  PROCESS_SIGNAL_EVENTS,
  REUSE_CLUSTER_LEASE_ERROR_CODE,
  REUSE_LEASE_MIN_TIMEOUT_MS,
  REUSE_LEASE_POLL_INTERVAL_MS,
  ZERO,
} = CLUSTER_STARTUP_GATE_LAYER;

const FILE_ENCODING_UTF8 = 'utf8';
const FILE_OPEN_FLAG_EXCLUSIVE_WRITE = 'wx';
const FILE_ERROR_CODE_ALREADY_EXISTS = 'EEXIST';
const FILE_ERROR_CODE_PERMISSION = 'EPERM';
const FILE_ERROR_CODE_NOT_FOUND = 'ENOENT';
const UNKNOWN_SCENARIO = 'unknown';
const REUSABLE_CLUSTER_LEASE_REQUIRED_ERROR =
  'Reusable cluster lease path is required';
const PROCESS_EXIT_SIGNAL_PERMISSION_SENTINEL = ZERO;

let processCleanupHandlersRegistered = false;

// Full per-node logs are captured CONTINUOUSLY during the run by per-node
// streamers (see cluster `_beginNodeLogStream`), which write incrementally to
// disk. On crash/signal cleanup we therefore do NOT re-capture here: a one-shot
// `docker logs` would be stall-prone (the very daemon stall streaming avoids) and
// would CLOBBER the better, continuously-streamed file. The partial streamed file
// is the crash record.
async function bestEffortCleanup(provider, clusterId) {
  try {
    const containers = await provider.listContainers({
      [LABELS.CLUSTER]: clusterId,
    });
    for (const container of containers) {
      try {
        await provider.removeContainer(container.Id);
      } catch (_err) {
        // Best-effort
      }
    }
  } catch (_err) {
    // Best-effort
  }
}

function isProcessAlive(pid) {
  const normalizedPid = Number(pid);
  if (!Number.isInteger(normalizedPid) || normalizedPid <= ZERO) {
    return false;
  }
  try {
    process.kill(normalizedPid, PROCESS_EXIT_SIGNAL_PERMISSION_SENTINEL);
    return true;
  } catch (error) {
    return error?.code === FILE_ERROR_CODE_PERMISSION;
  }
}

function isReusableClusterLeaseTimeoutError(error) {
  return error?.code === REUSE_CLUSTER_LEASE_ERROR_CODE.TIMEOUT;
}

async function readReusableClusterLease(lockPath) {
  try {
    const raw = await fs.readFile(lockPath, FILE_ENCODING_UTF8);
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

async function tryRemoveReusableClusterLease(lockPath) {
  try {
    await fs.unlink(lockPath);
    return true;
  } catch (error) {
    if (error?.code === FILE_ERROR_CODE_NOT_FOUND) {
      return false;
    }
    throw error;
  }
}

async function acquireReusableClusterLease(options = {}) {
  const lockPath = String(options.lockPath || '');
  if (lockPath.length === ZERO) {
    throw new Error(REUSABLE_CLUSTER_LEASE_REQUIRED_ERROR);
  }
  const timeoutMs = Math.max(
    REUSE_LEASE_MIN_TIMEOUT_MS,
    Math.floor(Number(options.timeoutMs) || REUSE_LEASE_MIN_TIMEOUT_MS),
  );
  const pollIntervalMs = Math.max(
    MIN_TIMEOUT_MS,
    Math.floor(Number(options.pollIntervalMs) || REUSE_LEASE_POLL_INTERVAL_MS),
  );
  const sleep =
    typeof options.sleep === 'function' ?
      options.sleep :
      (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const metadata =
    options.metadata && typeof options.metadata === 'object' ?
      options.metadata :
      {};
  const deadlineAtMs = Date.now() + timeoutMs;
  await fs.mkdir(dirname(lockPath), {recursive: true});

  while (true) {
    let handle = null;
    try {
      handle = await fs.open(lockPath, FILE_OPEN_FLAG_EXCLUSIVE_WRITE);
      await handle.writeFile(
        JSON.stringify(
          {
            ...metadata,
            pid: Number.isInteger(metadata.pid) ? metadata.pid : process.pid,
          },
          null,
          2,
        ),
        FILE_ENCODING_UTF8,
      );
      let released = false;
      return {
        lockPath,
        release: async () => {
          if (released) {
            return;
          }
          released = true;
          try {
            await handle.close();
          } catch (_error) {
            // Best-effort close
          }
          await tryRemoveReusableClusterLease(lockPath);
        },
      };
    } catch (error) {
      if (handle) {
        try {
          await handle.close();
        } catch (_closeError) {
          // Best-effort close
        }
      }
      if (error?.code !== FILE_ERROR_CODE_ALREADY_EXISTS) {
        throw error;
      }

      const existingLease = await readReusableClusterLease(lockPath);
      const holderPid = Number(existingLease?.pid) || null;
      if (!isProcessAlive(holderPid)) {
        await tryRemoveReusableClusterLease(lockPath);
        continue;
      }

      const holderScenario =
        typeof existingLease?.scenarioName === 'string' &&
        existingLease.scenarioName.length > ZERO ?
          existingLease.scenarioName :
          UNKNOWN_SCENARIO;
      if (holderPid === process.pid) {
        const reentryError = new Error(
          'Reusable cluster lease already held in this process ' +
            '(path=' +
            lockPath +
            ', holderPid=' +
            holderPid +
            ', holderScenario=' +
            holderScenario +
            ')',
        );
        reentryError.code = REUSE_CLUSTER_LEASE_ERROR_CODE.ALREADY_HELD;
        throw reentryError;
      }

      if (Date.now() >= deadlineAtMs) {
        const timeoutError = new Error(
          'Timed out waiting for reusable cluster lease ' +
            '(path=' +
            lockPath +
            ', timeoutMs=' +
            timeoutMs +
            ', holderPid=' +
            String(holderPid) +
            ', holderScenario=' +
            holderScenario +
            ')',
        );
        timeoutError.code = REUSE_CLUSTER_LEASE_ERROR_CODE.TIMEOUT;
        throw timeoutError;
      }
      await sleep(pollIntervalMs);
    }
  }
}

function registerClusterCleanup(provider, clusterId) {
  registerProcessCleanupHandlers();
  PROCESS_CLEANUP_REGISTRY.set(clusterId, {
    provider,
    clusterId,
  });
  return () => {
    PROCESS_CLEANUP_REGISTRY.delete(clusterId);
  };
}

function registerProcessCleanupHandlers() {
  if (processCleanupHandlersRegistered) {
    return;
  }
  processCleanupHandlersRegistered = true;

  process.on(PROCESS_EVENT_EXIT, handleExitCleanup);
  for (const signal of PROCESS_SIGNAL_EVENTS) {
    process.on(signal, handleSignalCleanup);
  }
  process.on(PROCESS_EVENT_UNCAUGHT_EXCEPTION, handleExceptionCleanup);
}

function drainCleanupRegistry() {
  const entries = Array.from(PROCESS_CLEANUP_REGISTRY.values());
  PROCESS_CLEANUP_REGISTRY.clear();
  return entries;
}

async function cleanupEntries(entries) {
  await Promise.all(
    entries.map((entry) => bestEffortCleanup(entry.provider, entry.clusterId)),
  );
}

function handleExitCleanup() {
  const entries = drainCleanupRegistry();
  for (const entry of entries) {
    bestEffortCleanup(entry.provider, entry.clusterId).catch(() => {});
  }
}

function handleSignalCleanup(signal) {
  const entries = drainCleanupRegistry();
  cleanupEntries(entries)
    .catch(() => {})
    .finally(() => {
      process.removeListener(signal, handleSignalCleanup);
      process.kill(process.pid, signal);
    });
}

function handleExceptionCleanup(error) {
  const entries = drainCleanupRegistry();
  cleanupEntries(entries)
    .catch(() => {})
    .finally(() => {
      process.removeListener(
        PROCESS_EVENT_UNCAUGHT_EXCEPTION,
        handleExceptionCleanup,
      );
      process.nextTick(() => {
        throw error;
      });
    });
}

export {
  acquireReusableClusterLease,
  bestEffortCleanup,
  cleanupEntries,
  drainCleanupRegistry,
  handleExceptionCleanup,
  handleExitCleanup,
  handleSignalCleanup,
  isProcessAlive,
  isReusableClusterLeaseTimeoutError,
  readReusableClusterLease,
  registerClusterCleanup,
  registerProcessCleanupHandlers,
  tryRemoveReusableClusterLease,
};
