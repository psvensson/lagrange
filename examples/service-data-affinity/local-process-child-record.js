// Private per-generation resource primitives for cluster-harness.js. This
// module never owns a node registry, restart policy, or cluster-wide stop loop.
import {spawn as spawnChildProcess} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import {resolve} from 'node:path';
import {finished} from 'node:stream/promises';
import {
  createOwnedLocalProcessNodeDirectory,
  resetOwnedLocalProcessNodeDirectory,
} from './local-process-data-root-authority.js';
import {
  LOCAL_PROCESS_CLUSTER_FAILURE,
  buildLocalProcessEntrypointArguments,
  createLocalProcessError,
  resolveLocalProcessAcquisitionOptions,
  validateLocalProcessNodeSpec,
} from './local-process-node-spec.js';

function observeCompletion(stream) {
  const observation = {settled: !stream, outcome: {error: null}};
  const promise = stream ? finished(stream).then(
    () => ({error: null}), (error) => ({error})) :
    Promise.resolve({error: null});
  observation.promise = promise.then((outcome) => {
    observation.settled = true;
    observation.outcome = outcome;
    return outcome;
  });
  return observation;
}

function observeStreamClose(stream) {
  if (stream?.closed === true) return Promise.resolve();
  return new Promise((resolveClose) => stream.once('close', resolveClose));
}

function createLocalProcessAcquisitionState(spec, generation, deadlineMs) {
  return {
    nodeId: spec.nodeId,
    index: spec.index,
    generation,
    deadlineMs,
    phase: 'queued',
    operationSettled: false,
    retired: Promise.resolve(),
    failure: null,
    executionCwd: null,
    dataDirIdentity: null,
    logStream: null,
    logCompletion: null,
    childAcquired: false,
    acquiredNode: null,
    predecessor: null,
    postForceTimeout: false,
    retirementSettled: true,
    retirementFailure: null,
    assertActive: null,
  };
}

async function awaitLocalProcessAcquisitionStep(
  state, signal, phase, operation, retireLate = null,
) {
  state.phase = phase;
  state.assertActive?.();
  const task = Promise.resolve().then(operation);
  let abort;
  const interrupted = new Promise((resolveAbort) => {
    if (signal.aborted) {
      resolveAbort(signal.reason);
      return;
    }
    abort = () => resolveAbort(signal.reason);
    signal.addEventListener('abort', abort, {once: true});
  }).then((reason) => {
    throw reason;
  });
  try {
    const value = await Promise.race([task, interrupted]);
    state.assertActive?.();
    return value;
  } catch (error) {
    if (!signal.aborted) throw error;
    state.retired = task.then(
      (value) => retireLate?.(value),
      () => undefined,
    );
    throw signal.reason;
  } finally {
    if (abort) signal.removeEventListener('abort', abort);
  }
}

async function awaitLogOpen(logStream) {
  if (logStream?.pending !== true) return;
  await new Promise((resolveOpen, rejectOpen) => {
    function cleanup() {
      logStream.off('open', handleOpen);
      logStream.off('error', handleError);
    }
    function handleOpen() {
      cleanup();
      resolveOpen();
    }
    function handleError(error) {
      cleanup();
      rejectOpen(error);
    }
    logStream.once('open', handleOpen);
    logStream.once('error', handleError);
  });
}

function createProcessObservation(child) {
  const events = new EventEmitter();
  const exitResult = Promise.withResolvers();
  const closeResult = Promise.withResolvers();
  const state = {exitOutcome: null, closeOutcome: null, spawnError: null};
  function settleExit(exitCode, signal) {
    if (state.exitOutcome) return;
    state.exitOutcome = Object.freeze({
      exitCode, signal, spawnError: state.spawnError});
    exitResult.resolve(state.exitOutcome);
    events.emit('exit', state.exitOutcome);
  }
  child.once('error', (error) => {
    state.spawnError = error;
    settleExit(child.exitCode, child.signalCode);
  });
  child.once('exit', settleExit);
  child.once('close', (exitCode, signal) => {
    settleExit(exitCode, signal);
    state.closeOutcome = Object.freeze({
      exitCode, signal, spawnError: state.spawnError});
    closeResult.resolve(state.closeOutcome);
  });
  return {
    events,
    exited: exitResult.promise,
    closed: closeResult.promise,
    exitOutcome: () => state.exitOutcome,
    closeOutcome: () => state.closeOutcome,
    isExited: () => state.exitOutcome !== null,
    isClosed: () => state.closeOutcome !== null,
  };
}

function createIoFailureObservation(streams) {
  const events = new EventEmitter();
  const state = {error: null};
  function observe(error) {
    if (state.error) return;
    state.error = error;
    events.emit('failure', error);
  }
  for (const stream of streams) stream?.once('error', observe);
  return {events, error: () => state.error};
}

function subscribeLocalProcessNode(node, listener) {
  let active = true;
  const notifyExit = (outcome) => listener({type: 'exit', outcome});
  const notifyIo = (error) => listener({type: 'ioFailure', error});
  node.processObservation.events.on('exit', notifyExit);
  node.ioObservation.events.on('failure', notifyIo);
  const knownExit = node.processObservation.exitOutcome();
  const knownIo = node.ioObservation.error();
  if (knownExit) queueMicrotask(() => active && notifyExit(knownExit));
  if (knownIo) queueMicrotask(() => active && notifyIo(knownIo));
  return () => {
    active = false;
    node.processObservation.events.off('exit', notifyExit);
    node.ioObservation.events.off('failure', notifyIo);
  };
}

function awaitLocalProcessNodeClosure(node, deadlineMs, stopSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(createLocalProcessError(
    LOCAL_PROCESS_CLUSTER_FAILURE.RESTART_PREDECESSOR_CLOSE_TIMEOUT,
    `Local node ${node.nodeId} predecessor did not fully close before restart`,
    {deadlineMs, resources: localProcessNodeResourceState(node)},
  )), Math.max(0, deadlineMs - Date.now()));
  const stop = () => controller.abort(stopSignal.reason);
  stopSignal.addEventListener('abort', stop, {once: true});
  const interrupted = new Promise((resolveAbort) => {
    controller.signal.addEventListener(
      'abort', () => resolveAbort(controller.signal.reason), {once: true});
  }).then((reason) => {
    throw reason;
  });
  return Promise.race([node.closed, interrupted]).finally(() => {
    clearTimeout(timer);
    stopSignal.removeEventListener('abort', stop);
    if (!controller.signal.aborted) controller.abort();
  });
}

async function retireExecutionCwd(runDir) {
  try {
    await rm(runDir, {recursive: true, force: true});
    return {error: null};
  } catch (error) {
    return {error};
  }
}

async function finalizeNode(node) {
  const close = await node.processObservation.closed;
  const [stdout, stderr] = await Promise.all([
    node.stdoutCompletion.promise,
    node.stderrCompletion.promise,
  ]);
  node.logStream.end();
  const log = await node.logCompletion.promise;
  const executionCwd = await retireExecutionCwd(node.executionCwd);
  return Object.freeze({...close, stdout, stderr, log, executionCwd});
}

async function acquireLogStream(spec, logPath, createLog, state, signal) {
  let logStream;
  let completion;
  try {
    logStream = createLog(logPath, {flags: 'a'});
    completion = observeCompletion(logStream);
    state.logStream = logStream;
    state.logCompletion = completion;
    const opened = awaitLogOpen(logStream);
    await awaitLocalProcessAcquisitionStep(
      state, signal, 'log_open', () => opened);
    return {logStream, completion};
  } catch (error) {
    const close = logStream ? observeStreamClose(logStream) : Promise.resolve();
    logStream?.destroy?.();
    const cleanup = Promise.all([
      completion?.promise || Promise.resolve({error: null}),
      close,
    ]);
    state.retired = cleanup;
    if (signal.aborted) throw signal.reason;
    const [logOutcome] = await cleanup;
    throw createLocalProcessError(
      LOCAL_PROCESS_CLUSTER_FAILURE.LOG_FAILURE,
      `Local node ${spec.nodeId} log could not be opened`,
      {
        nodeId: spec.nodeId,
        index: spec.index,
        logPath,
        logCleanupError: logOutcome.error || null,
      },
      error,
    );
  }
}

function spawnLocalNode(spec, acquisition, resources) {
  try {
    return acquisition.spawn(process.execPath,
      buildLocalProcessEntrypointArguments(spec), {
        cwd: resources.executionCwd,
        env: acquisition.environment,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
  } catch (error) {
    throw createLocalProcessError(
      LOCAL_PROCESS_CLUSTER_FAILURE.SPAWN_FAILURE,
      `Local node ${spec.nodeId} failed to spawn`,
      {
        nodeId: spec.nodeId,
        index: spec.index,
        logCleanupError: null,
        executionCwdCleanupError: null,
      },
      error,
    );
  }
}

async function acquireOwnedNodeResources(spec, acquisition, options) {
  const {acquisitionState: state, signal} = options;
  const dataDirIdentity = await awaitLocalProcessAcquisitionStep(
    state,
    signal,
    'node_data_directory',
    () => createOwnedLocalProcessNodeDirectory(
      options.dataRootAuthority, spec.dataDir),
    (identity) => resetOwnedLocalProcessNodeDirectory(
      options.dataRootAuthority,
      {dataDir: identity.path, dataDirIdentity: identity},
    ),
  );
  state.dataDirIdentity = dataDirIdentity;
  let executionCwd;
  try {
    executionCwd = await awaitLocalProcessAcquisitionStep(
      state,
      signal,
      'execution_cwd',
      () => mkdtemp(resolve(
        acquisition.logRoot,
        `.node-${spec.index}-generation-${acquisition.generation}-cwd-`,
      )),
      (lateCwd) => rm(lateCwd, {recursive: true, force: true}),
    );
  } catch (error) {
    state.retired = Promise.all([
      state.retired,
      resetOwnedLocalProcessNodeDirectory(
        options.dataRootAuthority, {dataDir: spec.dataDir, dataDirIdentity}),
    ]);
    if (signal.aborted) throw signal.reason;
    await state.retired;
    throw error;
  }
  state.executionCwd = executionCwd;
  const logPath = resolve(acquisition.logRoot, `node-${spec.index}.log`);
  let log;
  try {
    log = await acquireLogStream(
      spec, logPath, acquisition.createLog, state, signal);
  } catch (error) {
    const cleanup = Promise.all([
      state.retired,
      retireExecutionCwd(executionCwd),
      resetOwnedLocalProcessNodeDirectory(
        options.dataRootAuthority, {dataDir: spec.dataDir, dataDirIdentity}),
    ]);
    state.retired = cleanup;
    if (signal.aborted) throw signal.reason;
    const [, executionCwdCleanup] = await cleanup;
    error.details.executionCwdCleanupError =
      executionCwdCleanup.error || null;
    throw error;
  }
  const resources = {dataDirIdentity, executionCwd, logPath,
    logStream: log.logStream, logCompletion: log.completion};
  if (signal.aborted) {
    resources.logStream.end();
    state.retired = Promise.all([
      resources.logCompletion.promise,
      retireExecutionCwd(resources.executionCwd),
      resetOwnedLocalProcessNodeDirectory(
        options.dataRootAuthority,
        {dataDir: spec.dataDir, dataDirIdentity: resources.dataDirIdentity}),
    ]);
    throw signal.reason;
  }
  return resources;
}

async function spawnOwnedLocalProcess(spec, acquisition, options, resources) {
  const {acquisitionState: state, signal} = options;
  let child;
  try {
    state.phase = 'spawn';
    state.assertActive?.();
    child = spawnLocalNode(spec, acquisition, resources);
  } catch (error) {
    resources.logStream.end();
    const cleanup = Promise.all([
      state.retired,
      resources.logCompletion.promise,
      retireExecutionCwd(resources.executionCwd),
      resetOwnedLocalProcessNodeDirectory(
        options.dataRootAuthority,
        {dataDir: spec.dataDir, dataDirIdentity: resources.dataDirIdentity}),
    ]);
    state.retired = cleanup;
    if (signal.aborted) throw signal.reason;
    const [, logOutcome, cwdOutcome] = await cleanup;
    error.details.logCleanupError = logOutcome.error || null;
    error.details.executionCwdCleanupError = cwdOutcome.error || null;
    throw error;
  }
  return child;
}

function createOwnedLocalProcessNodeRecord(
  spec, acquisition, state, resources, child,
) {
  const {dataDirIdentity, executionCwd, logPath} = resources;
  state.childAcquired = true;
  const processObservation = createProcessObservation(child);
  const stdoutCompletion = observeCompletion(child.stdout);
  const stderrCompletion = observeCompletion(child.stderr);
  const ioObservation = createIoFailureObservation([
    child.stdout, child.stderr, resources.logStream]);
  const node = {
    ...spec,
    generation: acquisition.generation,
    dataDirIdentity,
    observationId: `${spec.nodeId}:${acquisition.generation}:${randomUUID()}`,
    child,
    signal: child.kill.bind(child),
    executionCwd,
    logPath,
    logStream: resources.logStream,
    logCompletion: resources.logCompletion,
    stdoutCompletion,
    stderrCompletion,
    ioObservation,
    processObservation,
    closed: null,
    outcome: null,
    stopRequested: false,
    forcedKill: false,
    forcedStreamClose: false,
    killRefused: false,
    postForceTimeout: false,
    restartAdjudicationStarted: false,
    restartDisposition: null,
    restartFailure: null,
  };
  state.acquiredNode = node;
  node.closed = finalizeNode(node).then((outcome) => {
    node.outcome = outcome;
    return outcome;
  });
  node.publicExited = processObservation.exited.then((outcome) =>
    Object.freeze({exitCode: outcome.exitCode, signal: outcome.signal}));
  node.publicClosed = node.closed.then((outcome) =>
    Object.freeze({
      exitCode: outcome.exitCode,
      signal: outcome.signal,
      logFailed: Boolean(outcome.stdout.error || outcome.stderr.error ||
        outcome.log.error),
      executionCwdRetired: outcome.executionCwd.error === null,
    }));
  try {
    child.stdout?.pipe(resources.logStream, {end: false});
    child.stderr?.pipe(resources.logStream, {end: false});
  } catch (cause) {
    throw createLocalProcessError(
      LOCAL_PROCESS_CLUSTER_FAILURE.LOG_FAILURE,
      `Local node ${spec.nodeId} output could not attach to its owned log`,
      {nodeId: spec.nodeId, index: spec.index, logPath}, cause);
  }
  return node;
}

async function acquireLocalProcessNode(rawSpec, options = {}) {
  const spec = validateLocalProcessNodeSpec(rawSpec);
  const acquisition = resolveLocalProcessAcquisitionOptions(spec, {
    ...options,
    createLogStream: options.createLogStream || createWriteStream,
    spawn: options.spawn || spawnChildProcess,
    inheritedEnvironment: options.inheritedEnvironment || process.env,
    logLevel: options.logLevel || 'info',
  });
  const resources = await acquireOwnedNodeResources(spec, acquisition, options);
  const child = await spawnOwnedLocalProcess(
    spec, acquisition, options, resources);
  return createOwnedLocalProcessNodeRecord(
    spec, acquisition, options.acquisitionState, resources, child);
}

function resetLocalProcessNodeData(node, options) {
  return awaitLocalProcessAcquisitionStep(
    options.acquisitionState,
    options.signal,
    'reset_node_data',
    () => resetOwnedLocalProcessNodeDirectory(
      options.dataRootAuthority,
      node,
      options.resetDataDirectory,
    ),
  );
}

function localProcessNodeIsRunning(node) {
  return !node.processObservation.isExited();
}

function localProcessNodeObservation(node) {
  const exit = node.processObservation.exitOutcome();
  const outcome = node.outcome;
  return Object.freeze({
    observationId: node.observationId,
    generation: node.generation,
    index: node.index,
    nodeId: node.nodeId,
    dataDir: node.dataDir,
    executionCwd: node.executionCwd,
    restPort: node.restPort,
    adminPort: node.adminPort,
    transportPort: node.transportPort,
    seedAddresses: Object.freeze([...node.seedAddresses]),
    ports: Object.freeze({
      rest: node.restPort,
      admin: node.adminPort,
      transport: node.transportPort,
    }),
    process: Object.freeze({
      pid: node.child.pid ?? null,
      exitCode: exit?.exitCode ?? null,
      signalCode: exit?.signal ?? null,
    }),
    exited: node.publicExited,
    closed: node.publicClosed,
    logPath: node.logPath,
    activeWaitSubscriptions:
      node.processObservation.events.listenerCount('exit') +
      node.ioObservation.events.listenerCount('failure'),
    outcome: outcome ? Object.freeze({
      exitCode: outcome.exitCode,
      signal: outcome.signal,
      logFailed: Boolean(outcome.stdout.error || outcome.stderr.error ||
        outcome.log.error),
      executionCwdRetired: outcome.executionCwd.error === null,
    }) : null,
  });
}

async function readLocalNodeLogs(nodes, dataRoot) {
  return Promise.all(nodes.map(async (node) => {
    const nodeId = node.nodeId;
    const logPath = node.logPath || resolve(
      dataRoot, `node-${node.index}.log`);
    try {
      return {nodeId, text: await readFile(logPath, 'utf8')};
    } catch (error) {
      return {nodeId, text: '', readError: error?.message || String(error)};
    }
  }));
}

function localProcessNodeResourceState(node) {
  return Object.freeze({
    observationId: node.observationId,
    nodeId: node.nodeId,
    generation: node.generation,
    exitObserved: node.processObservation.isExited(),
    closeObserved: node.processObservation.isClosed(),
    stdoutSettled: node.stdoutCompletion.settled,
    stderrSettled: node.stderrCompletion.settled,
    logSettled: node.logCompletion.settled,
    executionCwdRetired: node.outcome?.executionCwd?.error === null,
  });
}

function forceRetireLocalProcessNodeStreams(node) {
  node.forcedStreamClose = true;
  node.child.stdout?.destroy();
  node.child.stderr?.destroy();
  node.logStream.destroy();
}

function forceRetireLocalProcessAcquisition(state) {
  state.logStream?.destroy?.();
}

function localProcessAcquisitionResourceState(state) {
  return Object.freeze({
    nodeId: state.nodeId,
    index: state.index,
    generation: state.generation,
    phase: state.phase,
    operationSettled: state.operationSettled,
    retirementSettled: state.retirementSettled,
    retirementFailed: Boolean(state.retirementFailure),
    childAcquired: state.childAcquired,
    logSettled: state.logCompletion?.settled ?? true,
    executionCwd: state.executionCwd,
    postForceTimeout: state.postForceTimeout,
  });
}

function nodeOutcomeDetails(node, outcome) {
  return {
    nodeId: node.nodeId,
    index: node.index,
    generation: node.generation,
    exitCode: outcome?.exitCode ??
      node.processObservation.exitOutcome()?.exitCode ?? null,
    signal: outcome?.signal ??
      node.processObservation.exitOutcome()?.signal ?? null,
  };
}

function spawnFailure(node, outcome, details) {
  if (!outcome?.spawnError) return null;
  return createLocalProcessError(
    LOCAL_PROCESS_CLUSTER_FAILURE.SPAWN_FAILURE,
    `Local node ${node.nodeId} failed to spawn`, details, outcome.spawnError);
}

function logFailure(node, outcome, details) {
  const error = [
    outcome?.stdout?.error,
    outcome?.stderr?.error,
    outcome?.log?.error,
  ].find(Boolean);
  if (!error) return null;
  return createLocalProcessError(
    LOCAL_PROCESS_CLUSTER_FAILURE.LOG_FAILURE,
    `Local node ${node.nodeId} log pipeline failed`, details, error);
}

function executionCwdFailure(node, outcome, details) {
  if (!outcome?.executionCwd?.error) return null;
  return createLocalProcessError(
    LOCAL_PROCESS_CLUSTER_FAILURE.EXECUTION_CWD_FAILURE,
    `Local node ${node.nodeId} execution cwd cleanup failed`,
    details,
    outcome.executionCwd.error,
  );
}

function forcedKillFailure(node, details) {
  if (!node.forcedKill) return null;
  return createLocalProcessError(
    LOCAL_PROCESS_CLUSTER_FAILURE.FORCED_KILL,
    `Local node ${node.nodeId} required SIGKILL`, details);
}

function killRefusedFailure(node, details) {
  if (!node.killRefused) return null;
  return createLocalProcessError(
    LOCAL_PROCESS_CLUSTER_FAILURE.KILL_REFUSED,
    `Local node ${node.nodeId} refused SIGKILL`, details);
}

function streamTimeoutFailure(node, details) {
  if (!node.forcedStreamClose) return null;
  return createLocalProcessError(
    LOCAL_PROCESS_CLUSTER_FAILURE.STREAM_TIMEOUT,
    `Local node ${node.nodeId} output streams required forced retirement`,
    details);
}

function postForceTimeoutFailure(node, details) {
  if (!node.postForceTimeout) return null;
  return createLocalProcessError(
    LOCAL_PROCESS_CLUSTER_FAILURE.POST_FORCE_TIMEOUT,
    `Local node ${node.nodeId} did not close after SIGKILL`,
    {...details, resources: localProcessNodeResourceState(node)});
}

function restartResetFailure(node, details) {
  if (!node.restartFailure) return null;
  return createLocalProcessError(
    LOCAL_PROCESS_CLUSTER_FAILURE.RESTART_RESET_FAILURE,
    `Local node ${node.nodeId} persistent-state reset failed`,
    details,
    node.restartFailure,
  );
}

function nonzeroExitFailure(node, outcome, details) {
  const exitCode = outcome?.exitCode ??
    node.processObservation.exitOutcome()?.exitCode;
  if (!Number.isInteger(exitCode) || exitCode === 0) return null;
  return createLocalProcessError(
    LOCAL_PROCESS_CLUSTER_FAILURE.NONZERO_EXIT,
    `Local node ${node.nodeId} exited with code ${exitCode}`, details);
}

function earlyExitFailure(node, details) {
  if (node.stopRequested) return null;
  return createLocalProcessError(
    LOCAL_PROCESS_CLUSTER_FAILURE.EARLY_EXIT,
    `Local node ${node.nodeId} exited before owner teardown`, details);
}

function localProcessNodeFailures(node, outcome = node.outcome) {
  const details = nodeOutcomeDetails(node, outcome);
  return [
    spawnFailure(node, outcome, details),
    logFailure(node, outcome, details),
    executionCwdFailure(node, outcome, details),
    forcedKillFailure(node, details),
    killRefusedFailure(node, details),
    streamTimeoutFailure(node, details),
    postForceTimeoutFailure(node, details),
    restartResetFailure(node, details),
    nonzeroExitFailure(node, outcome, details),
    earlyExitFailure(node, details),
  ].filter(Boolean);
}

function localProcessEarlyExitFailure(node, outcome) {
  return localProcessNodeFailures(node, outcome)[0] || createLocalProcessError(
    LOCAL_PROCESS_CLUSTER_FAILURE.EARLY_EXIT,
    `Local node ${node.nodeId} exited before readiness`,
    {nodeId: node.nodeId, index: node.index, generation: node.generation});
}

function localProcessFailureEvidence(error) {
  return Object.freeze({
    code: error?.code || LOCAL_PROCESS_CLUSTER_FAILURE.STOP_FAILURE,
    message: error?.message || String(error),
    details: Object.freeze({...error?.details}),
  });
}

export {
  acquireLocalProcessNode,
  awaitLocalProcessAcquisitionStep,
  awaitLocalProcessNodeClosure,
  createLocalProcessAcquisitionState,
  forceRetireLocalProcessAcquisition,
  forceRetireLocalProcessNodeStreams,
  localProcessEarlyExitFailure,
  localProcessFailureEvidence,
  localProcessNodeFailures,
  localProcessNodeIsRunning,
  localProcessNodeObservation,
  localProcessNodeResourceState,
  localProcessAcquisitionResourceState,
  readLocalNodeLogs,
  resetLocalProcessNodeData,
  subscribeLocalProcessNode,
};
