import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {AdminWsClient} from '../../scripts/examples/admin-ws-client.js';
import {DEFAULT_TARGET} from './lagrange-loader.js';
import {
  acquireLocalProcessNode,
  awaitLocalProcessAcquisitionStep,
  awaitLocalProcessNodeClosure,
  createLocalProcessAcquisitionState,
  forceRetireLocalProcessAcquisition,
  localProcessAcquisitionResourceState,
  localProcessEarlyExitFailure,
  localProcessFailureEvidence,
  localProcessNodeIsRunning,
  localProcessNodeObservation,
  localProcessNodeResourceState,
  readLocalNodeLogs,
  resetLocalProcessNodeData,
  subscribeLocalProcessNode,
} from './local-process-child-record.js';
import {
  claimLocalProcessDataRoot,
  dataRootIsNarrow,
} from './local-process-data-root-authority.js';
import {
  LOCAL_PROCESS_CLUSTER_FAILURE,
  LOCAL_PROCESS_ENVIRONMENT_NAME,
  buildLocalNodeSpec,
  createLocalProcessError,
  validateEnvironmentOverrides,
  validateLocalProcessNodeSpec,
} from './local-process-node-spec.js';
import {
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
} from './local-process-owner-operations.js';
const DEFAULT_NODE_COUNT = 5;
const DOCKER_ADMIN_PORT = 8081;
const CLUSTER_DATA_ROOT = 'data/examples/movielens-lagrange-cluster';
const CLUSTER_FORM_TIMEOUT_MS = 180000;
const CLUSTER_POLL_INTERVAL_MS = 2000;
const NODE_STATUS_ACTIVE = 'active';
const LOCAL_CLUSTER_ROLLBACK_FAILURE_NOTICE =
  'Local cluster rollback also failed; preserving the startup failure.\n';
function retainLocalProcessFailure(error) {
  const evidence = localProcessFailureEvidence(error);
  return createLocalProcessError(
    evidence.code, evidence.message, evidence.details);
}
function createLocalProcessCluster(options = {}) {
  const ownerOptions = Object.freeze({
    ...options,
    environmentOverrides: Object.freeze({...options.environmentOverrides}),
    inheritedEnvironment: options.inheritedEnvironment ?
      Object.freeze({...options.inheritedEnvironment}) : undefined,
  });
  const currentNodes = [];
  const allNodes = [];
  const restartHistory = [];
  const acquisitionFailures = [];
  const acquisitionStates = [];
  const pendingAcquisitions = new Set();
  const observations = new WeakMap();
  const dataRoot = resolve(ownerOptions.dataRoot || '.');
  const logRoot = resolve(ownerOptions.logRoot || dataRoot);
  if (!dataRootIsNarrow(dataRoot) || logRoot !== dataRoot) {
    throw createLocalProcessError(
      LOCAL_PROCESS_CLUSTER_FAILURE.DATA_ROOT_AUTHORITY,
      'Local process cluster requires one narrow owned data/log root',
      {dataRoot, logRoot},
    );
  }
  const wait = ownerOptions.sleep || ((durationMs, waitOptions) =>
    sleep(durationMs, undefined, waitOptions));
  const lifetimeController = new AbortController();
  let dataRootAuthorityPromise = null;
  let stopPromise = null;
  let stopping = false;
  let acquisitionTail = Promise.resolve();
  function currentNodeForSpec(spec) {
    return currentNodes.find((node) => node.index === spec.index ||
      node.nodeId === spec.nodeId) || null;
  }
  function observeNode(node) {
    const observation = localProcessNodeObservation(node);
    observations.set(observation, node);
    return observation;
  }
  function observeCurrentNodes() {
    return Object.freeze(currentNodes.map(observeNode));
  }
  function registerNode(node, previous = null) {
    allNodes.push(node);
    const previousIndex = currentNodes.indexOf(previous);
    if (previousIndex === -1) currentNodes.push(node);
    else currentNodes.splice(previousIndex, 1, node);
    return observeNode(node);
  }
  function beginAcquisition(spec, generation, deadlineMs, operation) {
    const state = createLocalProcessAcquisitionState(
      spec, generation, deadlineMs);
    const settled = Promise.withResolvers();
    const controller = createAcquisitionController(
      state, lifetimeController.signal);
    state.ownedSettled = settled.promise;
    acquisitionStates.push(state);
    pendingAcquisitions.add(state);
    const task = Promise.resolve().then(
      () => operation(state, controller.signal));
    task.then(
      () => {
        state.operationSettled = true;
      },
      (error) => {
        state.operationSettled = true;
        state.failure = error;
        if (error !== lifetimeController.signal.reason) {
          acquisitionFailures.push(retainLocalProcessFailure(error));
        }
      },
    ).finally(() => {
      controller.close();
      state.retirementSettled = false;
      Promise.resolve(state.retired).then(
        () => undefined,
        (error) => {
          state.retirementFailure = retainLocalProcessFailure(error);
        },
      ).finally(() => {
        state.retirementSettled = true;
        pendingAcquisitions.delete(state);
        settled.resolve();
      });
    });
    return task;
  }
  function getDataRootAuthority(state, signal) {
    return awaitLocalProcessAcquisitionStep(
      state, signal, 'data_root_authority', () => {
        if (!dataRootAuthorityPromise) {
          dataRootAuthorityPromise = claimLocalProcessDataRoot(dataRoot);
        }
        return dataRootAuthorityPromise;
      });
  }
  function acquireNode(spec, generation, deadlineMs, prepare = null) {
    validateEnvironmentOverrides(ownerOptions.environmentOverrides);
    return beginAcquisition(spec, generation, deadlineMs,
      async (state, signal) => {
        const dataRootAuthority = await getDataRootAuthority(state, signal);
        if (prepare) await prepare(state, signal, dataRootAuthority);
        return acquireLocalProcessNode(spec, {
          logRoot,
          generation,
          spawn: ownerOptions.spawn,
          createLogStream: ownerOptions.createLogStream,
          inheritedEnvironment: ownerOptions.inheritedEnvironment,
          environmentOverrides: ownerOptions.environmentOverrides,
          logLevel: ownerOptions.logLevel,
          acquisitionState: state,
          dataRootAuthority,
          signal,
        });
      });
  }
  async function executeStartNode(rawSpec, startOptions) {
    const spec = validateLocalProcessNodeSpec(rawSpec);
    if (stopping) {
      throw createLocalProcessError(
        LOCAL_PROCESS_CLUSTER_FAILURE.STOP_FAILURE,
        'Cannot start a local node after cluster teardown has begun',
      );
    }
    const previous = currentNodeForSpec(spec);
    const conflict = findConflictingNode(currentNodes, spec);
    if (conflict && !nodeIdentityMatches(conflict, spec)) {
      throw createLocalProcessError(
        LOCAL_PROCESS_CLUSTER_FAILURE.DUPLICATE_NODE,
        `Local node spec conflicts with running node ${conflict.nodeId}`,
        {
          nodeId: spec.nodeId,
          index: spec.index,
          conflictingNodeId: conflict.nodeId,
          conflictingIndex: conflict.index,
        },
      );
    }
    if (previous) {
      throw createLocalProcessError(
        localProcessNodeIsRunning(previous) ?
          LOCAL_PROCESS_CLUSTER_FAILURE.DUPLICATE_NODE :
          LOCAL_PROCESS_CLUSTER_FAILURE.RESTART_REQUIRED,
        `Local node identity already has an owned generation: ${spec.nodeId}`,
        {
          nodeId: spec.nodeId,
          index: spec.index,
          generation: previous.generation,
        },
      );
    }
    const node = await acquireNode(spec, 0, startOptions.deadlineMs);
    const observation = registerNode(node);
    if (stopping) {
      throw createLocalProcessError(
        LOCAL_PROCESS_CLUSTER_FAILURE.STOP_FAILURE,
        `Local node ${node.nodeId} was acquired during cluster teardown`,
        {nodeId: node.nodeId, index: node.index},
      );
    }
    return observation;
  }
  async function executeRestartNode(previousObservation, restartOptions) {
    const previous = observations.get(previousObservation);
    if (!previous || currentNodeForSpec(previous) !== previous ||
        previous.restartAdjudicationStarted) {
      throw createLocalProcessError(
        LOCAL_PROCESS_CLUSTER_FAILURE.STALE_RESTART,
        'Restart requires the exact current node-generation observation',
      );
    }
    if (!restartOptionsAreAccepted(restartOptions)) {
      throw createLocalProcessError(
        LOCAL_PROCESS_CLUSTER_FAILURE.RESTART_REFUSED,
        'Restart requires ACCEPT_EARLY_EXIT with RESET data disposition',
      );
    }
    if (stopping || localProcessNodeIsRunning(previous)) {
      throw createLocalProcessError(
        LOCAL_PROCESS_CLUSTER_FAILURE.RESTART_REFUSED,
        `Local node ${previous.nodeId} is not eligible for restart`,
      );
    }
    previous.restartAdjudicationStarted = true;
    const spec = validateLocalProcessNodeSpec(previous);
    const successor = await acquireNode(
      spec, previous.generation + 1, restartOptions.deadlineMs,
      async (state, signal, dataRootAuthority) => {
        state.predecessor = previous;
        state.phase = 'restart_predecessor_close';
        await awaitLocalProcessNodeClosure(
          previous, restartOptions.deadlineMs, signal);
        const failureCodes = restartFailureCodes(previous);
        if (!restartCanAcceptEarlyExit(failureCodes)) {
          restartHistory.push(createRestartReceipt(
            previous, 'restart_refused', failureCodes));
          throw createLocalProcessError(
            LOCAL_PROCESS_CLUSTER_FAILURE.RESTART_REFUSED,
            `Local node ${previous.nodeId} has a non-restartable failure`,
            {failureCodes: Object.freeze([...failureCodes])},
          );
        }
        if (stopping || currentNodeForSpec(previous) !== previous) {
          throw createLocalProcessError(
            LOCAL_PROCESS_CLUSTER_FAILURE.STALE_RESTART,
            'Node generation changed while restart awaited resource closure',
          );
        }
        try {
          await resetLocalProcessNodeData(previous, {
            acquisitionState: state,
            dataRootAuthority,
            resetDataDirectory: ownerOptions.resetDataDirectory,
            signal,
          });
        } catch (error) {
          if (signal.aborted) throw signal.reason;
          previous.restartFailure = error;
          const resetCodes = restartFailureCodes(previous);
          restartHistory.push(createRestartReceipt(
            previous, 'restart_reset_failed', resetCodes));
          throw createLocalProcessError(
            LOCAL_PROCESS_CLUSTER_FAILURE.RESTART_RESET_FAILURE,
            `Local node ${previous.nodeId} persistent-state reset failed`,
            {failureCodes: Object.freeze([...resetCodes])}, error);
        }
        previous.restartDisposition =
          LOCAL_PROCESS_RESTART_DECISION.ACCEPT_EARLY_EXIT;
        restartHistory.push(createRestartReceipt(
          previous, previous.restartDisposition, failureCodes));
      });
    const observation = registerNode(successor, previous);
    if (stopping) {
      throw createLocalProcessError(
        LOCAL_PROCESS_CLUSTER_FAILURE.STOP_FAILURE,
        `Local node ${successor.nodeId} was reacquired during teardown`,
      );
    }
    return observation;
  }
  function enqueueAcquisition(acquire) {
    const acquisition = acquisitionTail.then(
      acquire,
    );
    acquisitionTail = acquisition.then(
      () => undefined,
      () => undefined,
    );
    return acquisition;
  }
  function startNode(rawSpec, startOptions) {
    if (!acquisitionOptionsAreValid(startOptions)) {
      return Promise.reject(createLocalProcessError(
        LOCAL_PROCESS_CLUSTER_FAILURE.INVALID_NODE_SPEC,
        'startNode requires a finite caller-owned absolute deadlineMs'));
    }
    let spec;
    try {
      spec = validateLocalProcessNodeSpec(rawSpec);
    } catch (error) {
      return Promise.reject(error);
    }
    const capturedOptions = Object.freeze({
      deadlineMs: Number(startOptions.deadlineMs),
    });
    return enqueueAcquisition(() => executeStartNode(spec, capturedOptions));
  }
  function restartNode(previous, restartOptions) {
    const capturedOptions = Object.freeze({
      decision: restartOptions?.decision,
      dataDisposition: restartOptions?.dataDisposition,
      deadlineMs: typeof restartOptions?.deadlineMs === 'number' ?
        restartOptions.deadlineMs : Number.NaN,
    });
    return enqueueAcquisition(
      () => executeRestartNode(previous, capturedOptions));
  }
  async function waitFor(nodeObservation, probe, waitOptions = {}) {
    const node = observations.get(nodeObservation);
    if (!node || typeof probe !== 'function') {
      throw createLocalProcessError(
        LOCAL_PROCESS_CLUSTER_FAILURE.INVALID_NODE_SPEC,
        'waitFor requires an owned node and probe function',
      );
    }
    const waitConfiguration = resolveWaitConfiguration(
      nodeObservation, waitOptions);
    const {deadlineMs, pollIntervalMs, timeoutError} = waitConfiguration;
    let lastDiagnostic = null;
    const controller = new AbortController();
    const remainingAtStart = Math.max(0, deadlineMs - Date.now());
    const deadlineTimer = setTimeout(() => controller.abort(timeoutError),
      remainingAtStart);
    const cancellation = waitForAbort(controller.signal);
    const interruption = Promise.withResolvers();
    const unsubscribe = subscribeLocalProcessNode(node, (event) => {
      const failure = event.type === 'exit' ?
        localProcessEarlyExitFailure(node, event.outcome) :
        createLocalProcessError(
          LOCAL_PROCESS_CLUSTER_FAILURE.LOG_FAILURE,
          `Local node ${node.nodeId} output stream failed during readiness`,
          {nodeId: node.nodeId, index: node.index},
          event.error,
        );
      controller.abort(failure);
      interruption.resolve(failure);
    });
    const interruptions = [
      interruption.promise.then((error) => {
        throw error;
      }),
      cancellation.then((reason) => {
        throw reason;
      }),
    ];
    try {
      while (Date.now() < deadlineMs) {
        const remainingMs = Math.max(0, deadlineMs - Date.now());
        const observation = await raceReadinessObservation(
          () => probe({
            remainingMs,
            signal: controller.signal,
          }), interruptions, controller);
        const resolved = resolveProbeObservation(observation);
        if (resolved.ready) return resolved.value;
        lastDiagnostic = resolved.diagnostic || lastDiagnostic;
        timeoutError.details.lastDiagnostic = lastDiagnostic;
        const delayMs = Math.min(pollIntervalMs, deadlineMs - Date.now());
        if (delayMs > 0) {
          await raceReadinessObservation(
            () => wait(delayMs, {signal: controller.signal}),
            interruptions, controller);
        }
      }
      timeoutError.details.lastDiagnostic = lastDiagnostic;
      throw timeoutError;
    } finally {
      unsubscribe();
      clearTimeout(deadlineTimer);
      if (!controller.signal.aborted) controller.abort();
    }
  }
  function ownedNodes() {
    const nodes = [...allNodes];
    for (const state of acquisitionStates) {
      if (state.acquiredNode && !nodes.includes(state.acquiredNode)) {
        nodes.push(state.acquiredNode);
      }
    }
    return nodes;
  }
  function ownedClosure() {
    return Promise.all([
      acquisitionTail,
      ...ownedNodes().map((node) => node.closed),
      ...[...pendingAcquisitions].map((state) => state.ownedSettled),
    ]);
  }
  async function waitForCloseStage() {
    const closed = ownedClosure();
    const delay = createAbortableDelay(wait, LOCAL_PROCESS_STOP_GRACE_MS);
    const result = await Promise.race([
      closed.then(() => ({closed: true, error: null})),
      delay.promise.then((outcome) => ({
        closed: false,
        error: outcome.error,
      })),
    ]);
    if (result.closed) await delay.cancel();
    return result;
  }
  async function executeStop() {
    let teardownNodes = ownedNodes();
    const failures = [
      ...signalOwnedNodes(
        teardownNodes, LOCAL_PROCESS_SIGNAL.GRACEFUL, false),
    ];
    const graceOutcome = await waitForCloseStage();
    if (!graceOutcome.closed) {
      if (graceOutcome.error) {
        failures.push(createLocalProcessError(
          LOCAL_PROCESS_CLUSTER_FAILURE.STOP_FAILURE,
          'Local process cluster grace timer failed',
          {},
          graceOutcome.error,
        ));
      }
      teardownNodes = ownedNodes();
      for (const state of pendingAcquisitions) {
        forceRetireLocalProcessAcquisition(state);
      }
      failures.push(...signalOwnedNodes(
        teardownNodes, LOCAL_PROCESS_SIGNAL.FORCE, true));
      const forcedOutcome = await waitForCloseStage();
      if (!forcedOutcome.closed) {
        if (forcedOutcome.error) {
          failures.push(createLocalProcessError(
            LOCAL_PROCESS_CLUSTER_FAILURE.STOP_FAILURE,
            'Local process cluster forced-disposal timer failed',
            {},
            forcedOutcome.error,
          ));
        }
        teardownNodes = ownedNodes();
        closeLingeringNodeStreams(teardownNodes);
        for (const state of pendingAcquisitions) {
          state.postForceTimeout = true;
          forceRetireLocalProcessAcquisition(state);
        }
      }
    }
    teardownNodes = ownedNodes();
    const outcomes = teardownNodes.map((node) => node.outcome);
    failures.push(...acquisitionFailures);
    for (const state of acquisitionStates) {
      if (state.retirementFailure) {
        failures.push(state.retirementFailure);
      }
      if (state.postForceTimeout) {
        failures.push(createLocalProcessError(
          LOCAL_PROCESS_CLUSTER_FAILURE.POST_FORCE_TIMEOUT,
          `Local node ${state.nodeId} acquisition did not retire after force`,
          {resources: localProcessAcquisitionResourceState(state)}));
      }
    }
    failures.push(...collectOwnedNodeFailures(teardownNodes, outcomes));
    if (failures.length > 0) {
      const evidence = Object.freeze(
        failures.map(localProcessFailureEvidence));
      throw createLocalProcessError(
        LOCAL_PROCESS_CLUSTER_FAILURE.STOP_FAILURE,
        `Local process cluster teardown failed (${failures.length})`,
        Object.freeze({
          failures: evidence,
          resources: Object.freeze(
            teardownNodes.map(localProcessNodeResourceState)),
          acquisitions: Object.freeze(
            acquisitionStates.map(localProcessAcquisitionResourceState)),
        }),
        failures[0],
      );
    }
    return {stopped: true, nodeCount: teardownNodes.length};
  }
  function stop() {
    if (!stopPromise) {
      stopping = true;
      lifetimeController.abort(createLocalProcessError(
        LOCAL_PROCESS_CLUSTER_FAILURE.STOP_FAILURE,
        'Local process cluster teardown interrupted acquisition',
      ));
      stopPromise = Promise.resolve().then(executeStop);
    }
    return stopPromise;
  }
  function getLogs() {
    return readLocalNodeLogs(currentNodes, logRoot);
  }
  return Object.freeze({
    get nodes() {
      return observeCurrentNodes();
    },
    get restartHistory() {
      return Object.freeze([...restartHistory]);
    },
    getLogs,
    getNodeLogs: getLogs,
    restartNode,
    startNode,
    stop,
    waitFor,
  });
}
function reportLocalRollbackFailure(dependencies, cleanupError) {
  try {
    if (typeof dependencies.onCleanupFailure === 'function') {
      Promise.resolve(dependencies.onCleanupFailure(cleanupError)).catch(
        () => undefined);
      return;
    }
    process.stderr.write(
      LOCAL_CLUSTER_ROLLBACK_FAILURE_NOTICE +
      `${cleanupError?.code || 'LOCAL_PROCESS_CLUSTER_STOP_FAILURE'}: ` +
      `${cleanupError?.message || String(cleanupError)}\n`,
    );
  } catch {
    // The diagnostic collaborator is outside the resource owner's rollback.
    // Its failure cannot replace the acquisition error identity.
  }
}
async function queryRows(target, sql) {
  const client = new AdminWsClient({target, timeoutMs: 10000});
  try {
    const result = await client.query(sql);
    return result?.results || result?.rows || [];
  } finally {
    await client.close();
  }
}

async function waitForAdmin(target, timeoutMs = 60000) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    try {
      await queryRows(target, 'SELECT 1');
      return;
    } catch (error) {
      lastError = error;
      await sleep(1000);
    }
  }
  throw new Error(
    `Timed out waiting for admin endpoint at ${target}: ` +
    `${lastError?.message || 'no response'}`,
  );
}

async function waitForClusterSize(
  target, expectedCount, timeoutMs = CLUSTER_FORM_TIMEOUT_MS,
) {
  const start = Date.now();
  let lastSeen = 0;
  while (Date.now() - start < timeoutMs) {
    let rows = [];
    try {
      rows = await queryRows(target, 'SELECT node_id, status FROM nodes');
    } catch {
      rows = [];
    }
    const active = rows.filter((row) => row.status === NODE_STATUS_ACTIVE);
    if (active.length !== lastSeen) {
      console.log(`Cluster membership: ${active.length}/${expectedCount} active nodes`);
      lastSeen = active.length;
    }
    if (active.length >= expectedCount) {
      return Date.now() - start;
    }
    await sleep(CLUSTER_POLL_INTERVAL_MS);
  }
  throw new Error(
    `Cluster did not reach ${expectedCount} active nodes within ` +
    `${timeoutMs}ms (saw ${lastSeen})`,
  );
}

async function startLocalCluster(
  nodeCount,
  dataRoot,
  target,
  dependencies = {},
) {
  const awaitAdmin = dependencies.waitForAdmin || waitForAdmin;
  const awaitClusterSize =
    dependencies.waitForClusterSize || waitForClusterSize;
  const ownedDataRoot = resolve(dataRoot);
  const formationDeadlineMs = Date.now() + CLUSTER_FORM_TIMEOUT_MS;
  const nodeIds = Array.from({length: nodeCount}, () => randomUUID());
  console.log(`Starting ${nodeCount}-node local Lagrange cluster...`);
  const cluster = createLocalProcessCluster({
    ...dependencies,
    dataRoot: ownedDataRoot,
    logRoot: ownedDataRoot,
  });
  try {
    await cluster.startNode(buildLocalNodeSpec(0, ownedDataRoot, nodeIds[0]), {
      deadlineMs: formationDeadlineMs,
    });
    console.log('Waiting for seed admin endpoint...');
    await awaitAdmin(target, Math.max(0, formationDeadlineMs - Date.now()));

    for (let i = 1; i < nodeCount; i += 1) {
      await cluster.startNode(
        buildLocalNodeSpec(i, ownedDataRoot, nodeIds[i]), {
          deadlineMs: formationDeadlineMs,
        });
    }
    console.log('Waiting for cluster formation...');
    const clusterFormationMs = await awaitClusterSize(
      target, nodeCount, Math.max(0, formationDeadlineMs - Date.now()));
    console.log(`Cluster formed in ${clusterFormationMs}ms.`);

    return {
      mode: 'local-processes',
      target,
      clusterFormationMs,
      nodes: cluster.nodes,
      getLogs: cluster.getLogs,
      getNodeLogs: cluster.getNodeLogs,
      startNode: cluster.startNode,
      stop: cluster.stop,
      waitFor: cluster.waitFor,
    };
  } catch (error) {
    // This function owns every child until it returns the cluster handle.
    // Formation failure cannot transfer that ownership to a caller, so the
    // acquisition owner must roll back every child before surfacing the cause.
    try {
      await cluster.stop();
    } catch (cleanupError) {
      // Never decorate the primary failure here. It may be frozen, sealed, a
      // hostile proxy, or even a primitive; attempting to mutate it can replace
      // the acquisition cause with a TypeError. Cleanup remains best-effort and
      // the ownership boundary always rethrows the original value unchanged.
      reportLocalRollbackFailure(dependencies, cleanupError);
    }
    throw error;
  }
}

async function startDockerCluster(nodeCount) {
  const {mergeWithDefaults} =
    await import('../../test/distributed/harness/config-parser.js');
  const {CLUSTER_FACTORY_LAYER} =
    await import('../../test/distributed/harness/cluster-factory-layer.js');
  const {createCluster} = CLUSTER_FACTORY_LAYER;
  const {buildImage} = await import('../../test/distributed/run.js');
  const {applySourceFingerprintConfig} = await import(
    '../../test/distributed/source-fingerprint-config.js'
  );

  console.log(`Starting ${nodeCount}-node Lagrange cluster in Docker...`);
  const config = await applySourceFingerprintConfig(
    mergeWithDefaults({size: nodeCount}),
  );
  console.log(`Ensuring image ${config.image} is current...`);
  await buildImage(config, false);

  const cluster = createCluster(config);
  if (typeof cluster.setScenarioName === 'function') {
    cluster.setScenarioName('movielens-service-data-affinity-demo');
  }
  const formationStart = Date.now();
  await cluster.start();
  const clusterFormationMs = Date.now() - formationStart;
  console.log(`Cluster formed in ${clusterFormationMs}ms.`);

  const seed = cluster.getNodes()[0];
  return {
    mode: 'docker',
    target: `ws://${seed.ip}:${DOCKER_ADMIN_PORT}/api/admin/stream`,
    clusterFormationMs,
    getNodeLogs: () => Promise.all(cluster.getNodes().map(async (node) => {
      try {
        return {nodeId: node.id, text: await node.getLogs()};
      } catch (error) {
        return {
          nodeId: node.id,
          text: '',
          readError: error?.message || String(error),
        };
      }
    })),
    stop: () => cluster.stop(),
  };
}

/**
 * Start (or attach to) a demo cluster using the demo's mode selection:
 * noStart attaches to a running cluster, local starts local node
 * processes, and the default is the Docker harness.
 * @param {Object} options
 * @param {boolean} [options.noStart]
 * @param {boolean} [options.local]
 * @param {number} [options.nodeCount]
 * @param {string} [options.dataDir]
 * @param {string} [options.target]
 * @return {Promise<Object>} handle {mode, target, clusterFormationMs,
 *   getNodeLogs?, stop?}
 */
async function startCluster(options = {}) {
  const nodeCount = options.nodeCount || DEFAULT_NODE_COUNT;
  if (options.noStart === true) {
    console.log('Using already-running cluster (--no-start).');
    const target = options.target || DEFAULT_TARGET;
    await waitForAdmin(target);
    return {mode: 'external', target, clusterFormationMs: null};
  }
  if (options.local === true) {
    return startLocalCluster(
      nodeCount,
      options.dataDir || resolve(CLUSTER_DATA_ROOT, `run-${randomUUID()}`),
      options.target || DEFAULT_TARGET,
    );
  }
  return startDockerCluster(nodeCount);
}

export {
  LOCAL_PROCESS_CLUSTER_FAILURE,
  LOCAL_PROCESS_DATA_DISPOSITION,
  LOCAL_PROCESS_ENVIRONMENT_NAME,
  LOCAL_PROCESS_RESTART_DECISION,
  buildLocalNodeSpec,
  createLocalProcessCluster,
  queryRows,
  startCluster,
  startDockerCluster,
  startLocalCluster,
  waitForAdmin,
  waitForClusterSize,
};
