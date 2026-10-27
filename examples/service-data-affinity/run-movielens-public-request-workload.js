#!/usr/bin/env node

import {createHash} from 'node:crypto';
import {access, mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {
  bootExampleNode,
  EXAMPLE_NODE,
} from '../request-binding-deployment/request-binding-example-node.js';
import {
  REQUEST_ACCEPT,
  executeSql,
  request,
  waitForReadyCell,
} from '../request-binding-deployment/run-request-binding-deployment.js';
import {
  createInvocationIdentity,
  createInvocationIntentDigest,
  createRequestDigest,
} from '../../src/service/request-cell-routing-contract.js';
import {requestCellWitness} from '../../src/runtime/wasm-component-driver.js';
import {
  MOVIELENS_PUBLIC_REQUEST,
  buildMovielensPublicRequestComponent,
} from './movielens-public-request-workload-contract.js';
import {
  loadMovielensPublicRequestDataset,
  loadMovielensPublicRequestDatasetVariant,
} from './movielens-public-request-workload-dataset.js';
import {
  prepareMovielensPublicRequestWorkload,
  runMovielensPublicRequestWorkload,
} from './movielens-public-request-workload-adapter.js';
import {runPostgresBaseline} from './run-postgres-baseline.js';
import {
  MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGE,
  canonicalMovielensPublicRequestFailureCauses,
  isMovielensPublicRequestLiveFailure,
  registerMovielensPublicRequestLiveFailure,
  safeMovielensFailureOwnDataValue,
} from './movielens-public-request-evidence-schema.js';

const EXAMPLE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const NODE_DATA_DIRECTORY = 'node-data';
const OCI_LAYOUT_DIRECTORY = 'oci-layouts';
const REQUEST_CELL_DEADLINE_MS = 90_000;
const REQUEST_IDEMPOTENCY_KEY = 'movielens-public-grouped-reduce-dataset-v1';
const SHA256_PREFIX = 'sha256:';
const REQUEST_CONTENT_TYPE = 'application/json';
const REQUEST_CELL_OPERATION_PREFIX = 'request-cell-operation-';
const REQUEST_CELL_RESPONSE_HEADER = 'x-lagrange-cell';
const LIVE_FAILURE_NAME = 'MovielensPublicRequestLiveFailure';
const LIVE_FAILURE_STAGE = MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGE;
const objectDefineProperties = Object.defineProperties;
const SHA256_ALGORITHM = 'sha256';
const SHA256_ENCODING = 'hex';
const BYTE_ENCODING = 'utf8';
const POSTGRES_ENGINE = 'PostgreSQL 16';
const CLEANUP_OUTCOME = Object.freeze({
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
});
const LIVE_TEXT = Object.freeze({
  CLEANUP_FAILED: 'MovieLens workload cleanup failed',
  CLEANUP_RECEIPT_KEY: 'cleanupReceipt',
  EXECUTABLE_RECEIPT_MISMATCH:
    'WASM executable digest does not bind the OCI payload receipt',
  FILE_NOT_FOUND_CODE: 'ENOENT',
  POSTGRES_INPUT_MISMATCH:
    'PostgreSQL did not consume the retained MovieLens input',
  RESET_CLOSED_SESSION: 'MovieLens workload session is already closed',
  RESET_REQUIRES_DRAIN: 'MovieLens workload reset requires drained operations',
  RESET_STATE: 'public_request_isolated_session_reset',
  TEMPORARY_DIRECTORY_PREFIX: 'lagrange-movielens-public-request-',
});

function sha256(bytes) {
  return `${SHA256_PREFIX}${createHash(SHA256_ALGORITHM)
    .update(bytes)
    .digest(SHA256_ENCODING)}`;
}

function requestCellOperationId(tenantId, invocationIdentity) {
  const digest = createHash(SHA256_ALGORITHM)
    .update(JSON.stringify([tenantId, invocationIdentity]))
    .digest(SHA256_ENCODING);
  return `${REQUEST_CELL_OPERATION_PREFIX}${digest}`;
}

function preregisterRequestWitness(definition, invocation, route) {
  const normalizedRequest = Object.freeze({
    body: invocation.body,
    headers: Object.freeze({
      'accept': REQUEST_ACCEPT,
      'content-type': REQUEST_CONTENT_TYPE,
    }),
    method: definition.METHOD,
    path: definition.PATH,
    query: Object.freeze({}),
  });
  const invocationIdentity = createInvocationIdentity(
    EXAMPLE_NODE.DATABASE,
    invocation.idempotencyKey,
  );
  const requestDigest = createRequestDigest(normalizedRequest);
  const intentDigest = createInvocationIntentDigest({
    bindingVersionId: route.bindingVersionId,
    method: definition.METHOD,
    path: definition.PATH,
    requestDigest,
    tenantId: EXAMPLE_NODE.DATABASE,
  });
  return Object.freeze({
    bindingVersionId: route.bindingVersionId,
    body: JSON.stringify(invocation.body),
    idempotencyKey: invocation.idempotencyKey,
    intentDigest,
    invocationIdentity,
    journalCommand: `invoke:${route.serviceId}:${intentDigest}`,
    journalOperationId: requestCellOperationId(
      EXAMPLE_NODE.DATABASE,
      invocationIdentity,
    ),
    method: definition.METHOD,
    normalizedRequest,
    path: definition.PATH,
    requestDigest,
    routeServiceId: route.serviceId,
    tenantId: EXAMPLE_NODE.DATABASE,
  });
}

function buildPorts(node) {
  async function routeAndReplica(definition) {
    const route = await waitForReadyCell(node, definition);
    const replicaHandle = node.bootstrapService.runtimeServiceHandler
      .localReplicas.get(route.replicaId)?.replicaHandle;
    if (!replicaHandle) {
      throw new Error(`request Cell replica is absent: ${route.replicaId}`);
    }
    return {replicaHandle, route};
  }
  return Object.freeze({
    authenticatedPrincipal: () => EXAMPLE_NODE.USER,
    async cellWitness(definition) {
      const {replicaHandle, route} = await routeAndReplica(definition);
      const driver = node.bootstrapService.runtimeServiceHandler
        .serviceRuntimeLifecycle._resolveDriver('wasm_component');
      return Object.freeze({
        route,
        runtime: requestCellWitness(driver, replicaHandle),
      });
    },
    executeSql: (statement, parameters) =>
      executeSql(node, statement, parameters),
    async invokeRequest(definition, invocation) {
      const {route} = await routeAndReplica(definition);
      const requestWitness =
        preregisterRequestWitness(definition, invocation, route);
      const response = await request(
        node,
        definition.PATH,
        invocation.body,
        {idempotencyKey: invocation.idempotencyKey, method: definition.METHOD},
      );
      return Object.freeze({
        body: response.body,
        headers: Object.freeze({
          [REQUEST_CELL_RESPONSE_HEADER]:
            response.headers[REQUEST_CELL_RESPONSE_HEADER],
        }),
        requestWitness,
        status: response.status,
      });
    },
    async probeUnauthenticated(definition, body) {
      const response = await fetch(`${node.baseUrl}${definition.PATH}`, {
        body: JSON.stringify(body),
        headers: {'content-type': 'application/json'},
        method: definition.METHOD,
      });
      return Object.freeze({
        body: await response.json(),
        status: response.status,
      });
    },
    async readInvocationJournal(idempotencyKey) {
      const invocationId = createInvocationIdentity(
        EXAMPLE_NODE.DATABASE,
        idempotencyKey,
      );
      const result = await executeSql(
        node,
        'SELECT operation_id, tenant_id, idempotency_key, command, ' +
          'state, result, error, created_at, updated_at ' +
          'FROM wasm_operations WHERE tenant_id = $1 ' +
          'AND idempotency_key = $2',
        [EXAMPLE_NODE.DATABASE, invocationId],
      );
      return result.rows || [];
    },
    waitForReadyCell: (definition) => waitForReadyCell(node, definition),
  });
}

function projectPostgresAlternative(baseline) {
  const postgresLogDigests = {};
  for (const [containerId, logs] of Object.entries(baseline.logs)) {
    postgresLogDigests[containerId] = sha256(Buffer.from(logs, BYTE_ENCODING));
  }
  return Object.freeze({
    cleanupReceipt: baseline.cleanupReceipt,
    engine: POSTGRES_ENGINE,
    imageId: baseline.imageId,
    imageInspection: baseline.imageInspection,
    imageRepoDigests: baseline.imageRepoDigests,
    inputDigest: baseline.inputDigest,
    inputSizeBytes: baseline.inputSizeBytes,
    postgresLogDigests: Object.freeze(postgresLogDigests),
    postgresVersion: baseline.postgresVersion,
    postgresVersionSql: baseline.postgresVersionSql,
    querySql: baseline.querySql,
    replicationFactor: baseline.replicationFactor,
    replicationState: baseline.replicationState,
    returnedAggregateRows: baseline.returnedAggregateRows,
    measuredContainerImages: baseline.measuredContainerImages,
    topMovies: baseline.topMovies,
    totalRows: baseline.totalRows,
  });
}

async function stopPreparedCell(node, prepared) {
  const replicaId = prepared.deployment.readyCell.replicaId;
  const runtimeServiceHandler = node.bootstrapService.runtimeServiceHandler;
  const replicaHandle = runtimeServiceHandler.localReplicas
    .get(replicaId)?.replicaHandle;
  if (!replicaHandle) {
    throw new Error(
      `prepared MovieLens request Cell replica not found: ${replicaId}`,
    );
  }
  const lifecycle = runtimeServiceHandler.serviceRuntimeLifecycle;
  const driver = lifecycle._resolveDriver('wasm_component');
  const cellWasRunning = driver._componentRuntime.cells.has(replicaId);
  await lifecycle.stop(replicaHandle);
  if (!cellWasRunning || driver._componentRuntime.cells.has(replicaId)) {
    throw new Error(
      `prepared MovieLens request Cell replica did not stop: ${replicaId}`,
    );
  }
  return Object.freeze({cellStopped: true, replicaId});
}

async function cleanupAttempt(alreadyCompleted, operation) {
  if (alreadyCompleted) return {kind: CLEANUP_OUTCOME.SKIPPED};
  try {
    return {kind: CLEANUP_OUTCOME.COMPLETED, value: await operation()};
  } catch (error) {
    return {error, kind: CLEANUP_OUTCOME.FAILED};
  }
}

function cleanupErrors(attempts) {
  const errors = [];
  for (let index = 0; index < attempts.length; index += 1) {
    if (attempts[index].kind === CLEANUP_OUTCOME.FAILED) {
      errors.push(attempts[index].error);
    }
  }
  return errors;
}

async function requireTemporaryDirectoryAbsent(temporaryRoot) {
  try {
    await access(temporaryRoot);
  } catch (error) {
    if (error.code === LIVE_TEXT.FILE_NOT_FOUND_CODE) return;
    throw error;
  }
  throw new Error(`MovieLens temporary directory remains: ${temporaryRoot}`);
}

async function closeWorkloadSession({
  cleanupState,
  node,
  prepared,
  temporaryRoot,
}) {
  const cell = await cleanupAttempt(
    cleanupState.cellStopped,
    () => stopPreparedCell(node, prepared),
  );
  if (cell.kind === CLEANUP_OUTCOME.COMPLETED) {
    cleanupState.cellStopped = cell.value.cellStopped === true;
  }
  const runtime = await cleanupAttempt(
    cleanupState.nodeStopped,
    () => node.shutdown(),
  );
  if (runtime.kind === CLEANUP_OUTCOME.COMPLETED) {
    cleanupState.nodeStopped = true;
  }
  const canRemoveTemporaryRoot =
    cleanupState.cellStopped === true &&
    cleanupState.nodeStopped === true;
  const temporaryDirectory = canRemoveTemporaryRoot ?
    await cleanupAttempt(cleanupState.tempRemoved, async () => {
      await rm(temporaryRoot, {force: true, recursive: true});
      await requireTemporaryDirectoryAbsent(temporaryRoot);
    }) :
    {kind: CLEANUP_OUTCOME.SKIPPED};
  if (temporaryDirectory.kind === CLEANUP_OUTCOME.COMPLETED) {
    cleanupState.tempRemoved = true;
  }
  const failures = cleanupErrors([cell, runtime, temporaryDirectory]);
  if (failures.length > 0) {
    throw new AggregateError(failures, LIVE_TEXT.CLEANUP_FAILED);
  }
  return cell.kind === CLEANUP_OUTCOME.COMPLETED ? cell.value : null;
}

function unobservedPostgresCleanup() {
  return Object.freeze({
    containersAbsent: null,
    networkAbsent: null,
    networkName: null,
    removedContainerIds: Object.freeze([]),
  });
}

function unobservedWorkloadTeardown() {
  return Object.freeze({
    cellAbsent: null,
    nodeStopped: null,
    postgres: unobservedPostgresCleanup(),
    replicaId: null,
    temporaryDirectoryAbsent: null,
  });
}

async function closeFailedOpening({
  node,
  nodeBootAttempted,
  postgresCleanup,
  prepareAttempted,
  prepared,
  temporaryRoot,
}) {
  const cleanupCauses = [];
  let cellAbsent = prepareAttempted ? null : true;
  if (node && prepared) {
    const cell = await cleanupAttempt(
      false,
      () => stopPreparedCell(node, prepared),
    );
    cellAbsent = cell.kind === CLEANUP_OUTCOME.COMPLETED ?
      cell.value.cellStopped :
      null;
    if (cell.kind === CLEANUP_OUTCOME.FAILED) {
      cleanupCauses.push({
        cause: cell.error,
        role: MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.CELL_CLEANUP,
      });
    }
  }
  let nodeStopped = nodeBootAttempted ? null : true;
  if (node) {
    const runtime = await cleanupAttempt(false, () => node.shutdown());
    nodeStopped = runtime.kind === CLEANUP_OUTCOME.COMPLETED ? true : null;
    if (runtime.kind === CLEANUP_OUTCOME.FAILED) {
      cleanupCauses.push({
        cause: runtime.error,
        role: MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.NODE_CLEANUP,
      });
    }
  }
  let temporaryDirectoryAbsent = temporaryRoot === null ? true : null;
  if (temporaryRoot !== null && cellAbsent === true && nodeStopped === true) {
    const temporaryDirectory = await cleanupAttempt(false, async () => {
      await rm(temporaryRoot, {force: true, recursive: true});
      await requireTemporaryDirectoryAbsent(temporaryRoot);
    });
    temporaryDirectoryAbsent =
      temporaryDirectory.kind === CLEANUP_OUTCOME.COMPLETED ? true : null;
    if (temporaryDirectory.kind === CLEANUP_OUTCOME.FAILED) {
      cleanupCauses.push({
        cause: temporaryDirectory.error,
        role:
          MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE
            .TEMPORARY_DIRECTORY_CLEANUP,
      });
    }
  }
  return Object.freeze({
    cleanupCauses: Object.freeze(cleanupCauses),
    teardown: Object.freeze({
      cellAbsent,
      nodeStopped,
      postgres: postgresCleanup || unobservedPostgresCleanup(),
      replicaId: prepared?.deployment?.readyCell?.replicaId || null,
      temporaryDirectoryAbsent,
    }),
  });
}

function buildResetReceipt(nextRuntime, previousTeardown, previousStoragePath) {
  const {binding, manifest, readyCell} = nextRuntime.prepared.deployment;
  return Object.freeze({
    durableResultRows: nextRuntime.initialCustody.durableResultRows,
    freshSession: Object.freeze({
      bindingName: binding.name,
      bindingVersionId: readyCell.bindingVersionId,
      executableDigest: nextRuntime.artifact.executableDigest,
      replicaId: readyCell.replicaId,
      routeServiceId: readyCell.serviceId,
      runtimeKind: manifest.runtime.kind,
      storagePath: nextRuntime.runtimeObservation.storagePath,
    }),
    invocationJournalRows: nextRuntime.initialCustody.invocationJournalRows,
    previousSessionTeardown: Object.freeze({
      cellAbsent: previousTeardown.cellAbsent,
      nodeStopped: previousTeardown.nodeStopped,
      replicaId: previousTeardown.replicaId,
      storagePath: previousStoragePath,
      temporaryDirectoryAbsent: previousTeardown.temporaryDirectoryAbsent,
    }),
    state: LIVE_TEXT.RESET_STATE,
  });
}

async function openIsolatedLagrangeRuntime({
  alternative,
  componentSourcePath,
  dataset,
  postgres,
}) {
  let stage = LIVE_FAILURE_STAGE.TEMPORARY_DIRECTORY;
  let temporaryRoot = null;
  let node = null;
  let nodeBootAttempted = false;
  let prepared = null;
  let prepareAttempted = false;
  try {
    temporaryRoot = await mkdtemp(
      path.join(tmpdir(), LIVE_TEXT.TEMPORARY_DIRECTORY_PREFIX),
    );
    stage = LIVE_FAILURE_STAGE.ARTIFACT;
    const paths = {
      componentPath: path.join(
        temporaryRoot,
        MOVIELENS_PUBLIC_REQUEST.COMPONENT_FILE,
      ),
      componentSourcePath: componentSourcePath ||
        path.join(
          EXAMPLE_DIRECTORY,
          MOVIELENS_PUBLIC_REQUEST.COMPONENT_SOURCE_FILE,
        ),
      ociOutputRoot: path.join(temporaryRoot, OCI_LAYOUT_DIRECTORY),
    };
    const artifactReceipt = await buildMovielensPublicRequestComponent(paths);
    const componentSourceBytes = await readFile(paths.componentSourcePath);
    const executableBytes = await readFile(paths.componentPath);
    const executableDigest = sha256(executableBytes);
    const executablePayload = artifactReceipt.payloadDescriptors.find(
      (descriptor) => descriptor.digest === executableDigest,
    );
    if (!executablePayload) {
      throw new Error(LIVE_TEXT.EXECUTABLE_RECEIPT_MISMATCH);
    }
    stage = LIVE_FAILURE_STAGE.NODE;
    nodeBootAttempted = true;
    node = await bootExampleNode(
      path.join(temporaryRoot, NODE_DATA_DIRECTORY),
      {requestCellDeadlineMs: REQUEST_CELL_DEADLINE_MS},
    );
    stage = LIVE_FAILURE_STAGE.DEPLOYMENT;
    prepareAttempted = true;
    prepared = await prepareMovielensPublicRequestWorkload({
      alternative,
      artifactReceipt,
      dataset,
      ports: buildPorts(node),
    });
    const initialCustody = await prepared.verifyEmptyCustody();
    const cleanupState = {
      cellStopped: false,
      nodeStopped: false,
      tempRemoved: false,
    };
    return {
      artifact: Object.freeze({
        buildInputFingerprint: artifactReceipt.buildInputFingerprint,
        componentSource: path.relative(process.cwd(), paths.componentSourcePath),
        executableDigest,
        ociManifestDigest: artifactReceipt.topManifestDescriptor.digest,
        ociPayloadDigest: executablePayload.digest,
      }),
      cleanupState,
      componentSourceBytes,
      executableBytes,
      initialCustody,
      node,
      prepared,
      runtimeObservation: Object.freeze({
        processId: process.pid,
        storagePath: temporaryRoot,
      }),
      temporaryRoot,
      async close() {
        const replicaId = prepared.deployment.readyCell.replicaId;
        let stopReceipt;
        try {
          stopReceipt = await closeWorkloadSession({
            cleanupState,
            node,
            prepared,
            temporaryRoot,
          });
        } catch (error) {
          throw new MovielensPublicRequestLiveFailure(
            error,
            Object.freeze({
              cellAbsent: cleanupState.cellStopped ? true : null,
              nodeStopped: cleanupState.nodeStopped ? true : null,
              postgres: postgres.cleanupReceipt,
              replicaId,
              temporaryDirectoryAbsent: cleanupState.tempRemoved ? true : null,
            }),
            LIVE_FAILURE_STAGE.CLEANUP,
          );
        }
        return Object.freeze({
          cellAbsent: cleanupState.cellStopped,
          nodeStopped: cleanupState.nodeStopped,
          postgres: postgres.cleanupReceipt,
          replicaId: stopReceipt?.replicaId || replicaId,
          temporaryDirectoryAbsent: cleanupState.tempRemoved,
        });
      },
    };
  } catch (error) {
    const failedOpening = await closeFailedOpening({
      node,
      nodeBootAttempted,
      postgresCleanup: postgres.cleanupReceipt,
      prepareAttempted,
      prepared,
      temporaryRoot,
    });
    throw new MovielensPublicRequestLiveFailure(
      error,
      failedOpening.teardown,
      stage,
      failedOpening.cleanupCauses,
    );
  }
}

async function openMovielensPublicRequestWorkloadLive(options = {}) {
  let stage = LIVE_FAILURE_STAGE.DATASET;
  let postgresCleanup = null;
  try {
    const dataset = options.datasetIdentity ?
      await loadMovielensPublicRequestDatasetVariant(
        options.ratingsPath,
        options.datasetIdentity,
      ) :
      await loadMovielensPublicRequestDataset(options.ratingsPath);
    stage = LIVE_FAILURE_STAGE.POSTGRES;
    const postgres = await runPostgresBaseline({
      ratingsBytes: dataset.bytes,
      ratingsDigest: dataset.digest,
      replicationFactor: options.replicationFactor,
    });
    postgresCleanup = postgres.cleanupReceipt;
    if (
      postgres.totalRows !== dataset.cardinality ||
      postgres.inputDigest !== dataset.digest
    ) {
      throw new Error(LIVE_TEXT.POSTGRES_INPUT_MISMATCH);
    }
    const alternative = projectPostgresAlternative(postgres);
    const datasetSummary = Object.freeze({
      cardinality: dataset.cardinality,
      digest: dataset.digest,
      sizeBytes: dataset.sizeBytes,
      source: dataset.source,
    });
    const runtimeSpec = {
      alternative,
      componentSourcePath: options.componentSourcePath,
      dataset,
      postgres,
    };
    let activeRuntime = await openIsolatedLagrangeRuntime(runtimeSpec);
    let closedReceipt = null;
    function buildSessionSnapshot(runtime) {
      return Object.freeze({
        alternative,
        artifact: runtime.artifact,
        dataset: datasetSummary,
        prepared: runtime.prepared,
        retained: Object.freeze({
          componentSourceBytes: runtime.componentSourceBytes,
          datasetBytes: dataset.bytes,
          executableBytes: runtime.executableBytes,
          postgresLogs: postgres.logs,
        }),
        runtimeObservation: runtime.runtimeObservation,
        async close() {
          if (closedReceipt) return closedReceipt;
          closedReceipt = await activeRuntime.close();
          return closedReceipt;
        },
        async resetRunState() {
          if (closedReceipt) throw new Error(LIVE_TEXT.RESET_CLOSED_SESSION);
          const drained = await activeRuntime.prepared.drainOperations();
          if (drained.inFlight !== 0) {
            throw new Error(LIVE_TEXT.RESET_REQUIRES_DRAIN);
          }
          const previousStoragePath =
            activeRuntime.runtimeObservation.storagePath;
          const previousTeardown = await activeRuntime.close();
          const nextRuntime = await openIsolatedLagrangeRuntime(runtimeSpec);
          activeRuntime = nextRuntime;
          return Object.freeze({
            ownerReceipt: buildResetReceipt(
              nextRuntime,
              previousTeardown,
              previousStoragePath,
            ),
            session: buildSessionSnapshot(nextRuntime),
          });
        },
      });
    }
    return buildSessionSnapshot(activeRuntime);
  } catch (error) {
    if (isMovielensPublicRequestLiveFailure(error)) throw error;
    postgresCleanup =
      safeMovielensFailureOwnDataValue(error, LIVE_TEXT.CLEANUP_RECEIPT_KEY) ||
      postgresCleanup;
    const failedOpening = await closeFailedOpening({
      node: null,
      nodeBootAttempted: false,
      postgresCleanup,
      prepareAttempted: false,
      prepared: null,
      temporaryRoot: null,
    });
    throw new MovielensPublicRequestLiveFailure(
      error,
      failedOpening.teardown,
      stage,
      failedOpening.cleanupCauses,
    );
  }
}

class MovielensPublicRequestLiveFailure extends Error {
  constructor(
    cause,
    teardown = unobservedWorkloadTeardown(),
    stage = LIVE_FAILURE_STAGE.RUNNER,
    additionalCauses = [],
  ) {
    const causes = canonicalMovielensPublicRequestFailureCauses(
      cause,
      stage,
      additionalCauses,
    );
    const primary = causes[0];
    super(primary.message);
    this.name = LIVE_FAILURE_NAME;
    const failure = Object.freeze({
      causes,
      message: primary.message,
      name: primary.name,
      stack: primary.stack,
      stage,
    });
    objectDefineProperties(this, {
      failure: {
        configurable: false,
        enumerable: true,
        value: failure,
        writable: false,
      },
      teardown: {
        configurable: false,
        enumerable: true,
        value: teardown,
        writable: false,
      },
    });
    registerMovielensPublicRequestLiveFailure(this, causes);
  }
}

function buildMovielensPublicRequestLiveEnvelope(session, result, teardown) {
  const observation = Object.freeze({
    alternative: session.alternative,
    artifact: session.artifact,
    dataset: session.dataset,
    ...result,
    teardown,
  });
  return Object.freeze({observation, retained: session.retained});
}

async function runMovielensPublicRequestWorkloadSession(
  session,
  idempotencyKey = REQUEST_IDEMPOTENCY_KEY,
) {
  let operationFailed = false;
  let operationFailure;
  let result;
  try {
    result = await runMovielensPublicRequestWorkload({
      idempotencyKey,
      prepared: session.prepared,
    });
  } catch (error) {
    operationFailed = true;
    operationFailure = error;
  }
  let cleanupFailed = false;
  let cleanupFailure;
  let teardown;
  try {
    teardown = await session.close();
  } catch (error) {
    cleanupFailed = true;
    cleanupFailure = error;
  }
  if (operationFailed && cleanupFailed) {
    const cleanupTeardown = isMovielensPublicRequestLiveFailure(cleanupFailure) ?
      safeMovielensFailureOwnDataValue(cleanupFailure, 'teardown') :
      unobservedWorkloadTeardown();
    throw new MovielensPublicRequestLiveFailure(
      operationFailure,
      cleanupTeardown,
      LIVE_FAILURE_STAGE.OPERATION,
      [{
        cause: cleanupFailure,
        role: MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.CLEANUP,
      }],
    );
  }
  if (cleanupFailed) throw cleanupFailure;
  if (operationFailed) {
    throw new MovielensPublicRequestLiveFailure(
      operationFailure,
      teardown,
      LIVE_FAILURE_STAGE.OPERATION,
    );
  }
  return buildMovielensPublicRequestLiveEnvelope(session, result, teardown);
}

async function runMovielensPublicRequestWorkloadLive(options = {}) {
  const session = await openMovielensPublicRequestWorkloadLive(options);
  const envelope = await runMovielensPublicRequestWorkloadSession(session);
  if (options.print !== false) {
    process.stdout.write(`${JSON.stringify(envelope.observation, null, 2)}\n`);
  }
  return envelope;
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  await runMovielensPublicRequestWorkloadLive();
}

export {
  LIVE_FAILURE_STAGE,
  MovielensPublicRequestLiveFailure,
  REQUEST_IDEMPOTENCY_KEY,
  buildMovielensPublicRequestLiveEnvelope,
  buildPorts,
  closeFailedOpening,
  closeWorkloadSession,
  isMovielensPublicRequestLiveFailure,
  openMovielensPublicRequestWorkloadLive,
  preregisterRequestWitness,
  projectPostgresAlternative,
  runMovielensPublicRequestWorkloadLive,
  runMovielensPublicRequestWorkloadSession,
  stopPreparedCell,
  unobservedWorkloadTeardown,
};
