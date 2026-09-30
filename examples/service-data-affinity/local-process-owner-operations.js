// Private operations consumed by the one registry/admission/restart/stop owner
// in cluster-harness.js. No cluster registry or child process is owned here.
import {
  forceRetireLocalProcessNodeStreams,
  localProcessAcquisitionResourceState,
  localProcessNodeFailures,
  localProcessNodeIsRunning,
  localProcessNodeResourceState,
} from './local-process-child-record.js';
import {
  LOCAL_PROCESS_CLUSTER_FAILURE,
  createLocalProcessError,
} from './local-process-node-spec.js';

const LOCAL_PROCESS_WAIT_POLL_INTERVAL_MS = 100;
const LOCAL_PROCESS_STOP_GRACE_MS = 15000;
const LOCAL_PROCESS_SIGNAL = Object.freeze({
  FORCE: 'SIGKILL',
  GRACEFUL: 'SIGTERM',
});
const LOCAL_PROCESS_RESTART_DECISION = Object.freeze({
  ACCEPT_EARLY_EXIT: 'accept_early_exit',
});
const LOCAL_PROCESS_DATA_DISPOSITION = Object.freeze({RESET: 'reset'});

function resolveProbeObservation(observation) {
  if (observation === true) return {ready: true, value: true};
  if (observation?.ready === true) {
    return {ready: true, value: observation.value ?? observation};
  }
  return {ready: false, diagnostic: observation?.diagnostic || null};
}

function waitForAbort(signal) {
  return new Promise((resolveAbort) => {
    if (signal.aborted) {
      resolveAbort(signal.reason);
      return;
    }
    signal.addEventListener(
      'abort', () => resolveAbort(signal.reason), {once: true});
  });
}

function createAbortableDelay(wait, durationMs) {
  const controller = new AbortController();
  const promise = Promise.resolve()
    .then(() => wait(durationMs, {signal: controller.signal}))
    .then(
      () => ({elapsed: true, error: null}),
      (error) => controller.signal.aborted ?
        {elapsed: false, error: null} : {elapsed: false, error});
  return {
    promise,
    async cancel() {
      controller.abort();
      return promise;
    },
  };
}

function findConflictingNode(nodes, spec) {
  const ports = new Set([spec.restPort, spec.adminPort, spec.transportPort]);
  return nodes.find((node) => node.index === spec.index ||
    node.nodeId === spec.nodeId || node.dataDir === spec.dataDir ||
    ports.has(node.restPort) || ports.has(node.adminPort) ||
    ports.has(node.transportPort)) || null;
}

function nodeIdentityMatches(node, spec) {
  return node?.index === spec.index && node.nodeId === spec.nodeId &&
    node.dataDir === spec.dataDir && node.restPort === spec.restPort &&
    node.adminPort === spec.adminPort &&
    node.transportPort === spec.transportPort &&
    node.seedAddresses.length === spec.seedAddresses.length &&
    node.seedAddresses.every((address, index) =>
      address === spec.seedAddresses[index]);
}

function signalOwnedNodes(nodes, signal, forced) {
  const failures = [];
  for (const node of nodes) {
    if (!localProcessNodeIsRunning(node)) continue;
    node.stopRequested = true;
    try {
      const accepted = node.signal(signal);
      if (forced) {
        node.forcedKill = accepted !== false;
        node.killRefused = accepted === false;
      }
      if (accepted !== false || forced) continue;
      failures.push(createLocalProcessError(
        LOCAL_PROCESS_CLUSTER_FAILURE.STOP_FAILURE,
        `Local node ${node.nodeId} refused ${signal}`,
        {nodeId: node.nodeId, generation: node.generation, signal}));
    } catch (error) {
      failures.push(createLocalProcessError(
        LOCAL_PROCESS_CLUSTER_FAILURE.STOP_FAILURE,
        `Failed to signal local node ${node.nodeId}`,
        {nodeId: node.nodeId, signal}, error));
    }
  }
  return failures;
}

function closeLingeringNodeStreams(nodes) {
  for (const node of nodes) {
    if (node.outcome) continue;
    node.postForceTimeout = true;
    forceRetireLocalProcessNodeStreams(node);
  }
}

function collectOwnedNodeFailures(nodes, outcomes) {
  return nodes.flatMap((node, index) =>
    node.restartDisposition ===
      LOCAL_PROCESS_RESTART_DECISION.ACCEPT_EARLY_EXIT ? [] :
      localProcessNodeFailures(node, outcomes[index]));
}

function resolveWaitConfiguration(node, waitOptions) {
  const deadlineMs = Number(waitOptions.deadlineMs);
  if (!Number.isFinite(deadlineMs)) {
    throw createLocalProcessError(
      LOCAL_PROCESS_CLUSTER_FAILURE.INVALID_NODE_SPEC,
      'waitFor requires a finite absolute deadlineMs');
  }
  const code = waitOptions.code || LOCAL_PROCESS_CLUSTER_FAILURE.WAIT_TIMEOUT;
  return {
    deadlineMs,
    pollIntervalMs: Number.isFinite(waitOptions.pollIntervalMs) ?
      Math.max(1, Math.floor(waitOptions.pollIntervalMs)) :
      LOCAL_PROCESS_WAIT_POLL_INTERVAL_MS,
    timeoutError: createLocalProcessError(
      code, `Timed out waiting for local node ${node.nodeId}`,
      {deadlineMs, lastDiagnostic: null}),
  };
}

async function raceReadinessObservation(task, interruptions, controller) {
  try {
    return await Promise.race([Promise.resolve().then(task), ...interruptions]);
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  }
}

function restartFailureCodes(node) {
  return localProcessNodeFailures(node).map(({code}) => code);
}

function restartCanAcceptEarlyExit(failureCodes) {
  const refused = new Set([
    LOCAL_PROCESS_CLUSTER_FAILURE.SPAWN_FAILURE,
    LOCAL_PROCESS_CLUSTER_FAILURE.LOG_FAILURE,
    LOCAL_PROCESS_CLUSTER_FAILURE.EXECUTION_CWD_FAILURE,
    LOCAL_PROCESS_CLUSTER_FAILURE.FORCED_KILL,
    LOCAL_PROCESS_CLUSTER_FAILURE.KILL_REFUSED,
    LOCAL_PROCESS_CLUSTER_FAILURE.STREAM_TIMEOUT,
    LOCAL_PROCESS_CLUSTER_FAILURE.POST_FORCE_TIMEOUT,
    LOCAL_PROCESS_CLUSTER_FAILURE.RESTART_RESET_FAILURE,
  ]);
  return failureCodes.includes(LOCAL_PROCESS_CLUSTER_FAILURE.EARLY_EXIT) &&
    !failureCodes.some((code) => refused.has(code));
}

function createRestartReceipt(node, decision, failureCodes) {
  const exit = node.processObservation.exitOutcome();
  return Object.freeze({
    nodeId: node.nodeId,
    index: node.index,
    generation: node.generation,
    exitCode: exit?.exitCode ?? null,
    signal: exit?.signal ?? null,
    decision,
    failures: Object.freeze([...failureCodes]),
  });
}

function restartOptionsAreAccepted(options) {
  return options?.decision ===
      LOCAL_PROCESS_RESTART_DECISION.ACCEPT_EARLY_EXIT &&
    options?.dataDisposition === LOCAL_PROCESS_DATA_DISPOSITION.RESET &&
    Number.isFinite(options?.deadlineMs);
}

function acquisitionTimeoutError(state) {
  const predecessorClose = state.phase === 'restart_predecessor_close';
  const resources = predecessorClose && state.predecessor ?
    localProcessNodeResourceState(state.predecessor) :
    localProcessAcquisitionResourceState(state);
  return createLocalProcessError(
    predecessorClose ?
      LOCAL_PROCESS_CLUSTER_FAILURE.RESTART_PREDECESSOR_CLOSE_TIMEOUT :
      LOCAL_PROCESS_CLUSTER_FAILURE.ACQUISITION_TIMEOUT,
    predecessorClose ?
      `Local node ${state.nodeId} predecessor did not fully close before restart` :
      `Local node ${state.nodeId} acquisition exceeded its caller deadline`,
    {deadlineMs: state.deadlineMs, resources});
}

function createAcquisitionController(state, lifetimeSignal) {
  const controller = new AbortController();
  function assertActive() {
    if (!controller.signal.aborted && Date.now() >= state.deadlineMs) {
      controller.abort(acquisitionTimeoutError(state));
    }
    if (controller.signal.aborted) throw controller.signal.reason;
  }
  const remainingMs = state.deadlineMs - Date.now();
  let timer = null;
  if (remainingMs <= 0) controller.abort(acquisitionTimeoutError(state));
  else {
    timer = setTimeout(
      () => controller.abort(acquisitionTimeoutError(state)), remainingMs);
  }
  const stop = () => controller.abort(lifetimeSignal.reason);
  lifetimeSignal.addEventListener('abort', stop, {once: true});
  state.assertActive = assertActive;
  return {
    assertActive,
    signal: controller.signal,
    close() {
      if (timer) clearTimeout(timer);
      lifetimeSignal.removeEventListener('abort', stop);
    },
  };
}

function acquisitionOptionsAreValid(options) {
  return Number.isFinite(options?.deadlineMs);
}

export {
  LOCAL_PROCESS_DATA_DISPOSITION,
  LOCAL_PROCESS_RESTART_DECISION,
  LOCAL_PROCESS_SIGNAL,
  LOCAL_PROCESS_STOP_GRACE_MS,
  acquisitionOptionsAreValid,
  closeLingeringNodeStreams,
  collectOwnedNodeFailures,
  createAbortableDelay,
  createAcquisitionController,
  createRestartReceipt,
  findConflictingNode,
  nodeIdentityMatches,
  raceReadinessObservation,
  resolveProbeObservation,
  resolveWaitConfiguration,
  restartCanAcceptEarlyExit,
  restartFailureCodes,
  restartOptionsAreAccepted,
  signalOwnedNodes,
  waitForAbort,
};
