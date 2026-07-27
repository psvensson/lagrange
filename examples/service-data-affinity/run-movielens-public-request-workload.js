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
import {
  MOVIELENS_PUBLIC_REQUEST,
  buildMovielensPublicRequestComponent,
} from './movielens-public-request-workload-contract.js';
import {
  loadMovielensPublicRequestDataset,
} from './movielens-public-request-workload-dataset.js';
import {
  prepareMovielensPublicRequestWorkload,
  runMovielensPublicRequestWorkload,
} from './movielens-public-request-workload-adapter.js';
import {
  runPostgresBaseline,
} from './run-postgres-baseline.js';
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
const REQUEST_IDEMPOTENCY_KEY =
  'movielens-public-grouped-reduce-dataset-v1';
const SHA256_PREFIX = 'sha256:';
const REQUEST_CONTENT_TYPE = 'application/json';
const REQUEST_CELL_OPERATION_PREFIX = 'request-cell-operation-';
const REQUEST_CELL_RESPONSE_HEADER = 'x-lagrange-cell';
const LIVE_FAILURE_NAME = 'MovielensPublicRequestLiveFailure';
const LIVE_FAILURE_STAGE = MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGE;
const objectDefineProperties = Object.defineProperties;

function sha256(bytes) {
  return `${SHA256_PREFIX}${createHash('sha256').update(bytes).digest('hex')}`;
}

function requestCellOperationId(tenantId, invocationIdentity) {
  const digest = createHash('sha256')
    .update(JSON.stringify([tenantId, invocationIdentity]))
    .digest('hex');
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
    journalCommand:
      `invoke:${route.serviceId}:${intentDigest}`,
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
    const replicaHandle =
      node.bootstrapService.runtimeServiceHandler.localReplicas
        .get(route.replicaId)?.replicaHandle;
    if (!replicaHandle) {
      throw new Error(`request Cell replica is absent: ${route.replicaId}`);
    }
    return {replicaHandle, route};
  }
  return Object.freeze({
    authenticatedPrincipal() {
      return EXAMPLE_NODE.USER;
    },
    async cellWitness(definition) {
      const {replicaHandle, route} =
        await routeAndReplica(definition);
      const driver =
        node.bootstrapService.runtimeServiceHandler
          .serviceRuntimeLifecycle._resolveDriver('wasm_component');
      return Object.freeze({
        route,
        runtime: driver.requestCellWitness(replicaHandle),
      });
    },
    executeSql(statement, parameters) {
      return executeSql(node, statement, parameters);
    },
    async invokeRequest(definition, invocation) {
      const {route} = await routeAndReplica(definition);
      const requestWitness =
        preregisterRequestWitness(definition, invocation, route);
      const response = await request(
        node,
        definition.PATH,
        invocation.body,
        {
          idempotencyKey: invocation.idempotencyKey,
          method: definition.METHOD,
        },
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
      const response = await fetch(
        `${node.baseUrl}${definition.PATH}`,
        {
          body: JSON.stringify(body),
          headers: {'content-type': 'application/json'},
          method: definition.METHOD,
        },
      );
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
    waitForReadyCell(definition) {
      return waitForReadyCell(node, definition);
    },
  });
}

function projectPostgresAlternative(baseline) {
  const postgresLogDigests = {};
  for (const [containerId, logs] of Object.entries(baseline.logs)) {
    postgresLogDigests[containerId] =
      sha256(Buffer.from(logs, 'utf8'));
  }
  return Object.freeze({
    cleanupReceipt: baseline.cleanupReceipt,
    engine: 'PostgreSQL 16',
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
  const runtimeServiceHandler =
    node.bootstrapService.runtimeServiceHandler;
  const replicaHandle =
    runtimeServiceHandler.localReplicas
      .get(replicaId)?.replicaHandle;
  if (!replicaHandle) {
    throw new Error(
      `prepared MovieLens request Cell replica not found: ${replicaId}`,
    );
  }
  const lifecycle = runtimeServiceHandler.serviceRuntimeLifecycle;
  const driver = lifecycle._resolveDriver('wasm_component');
  const cellWasRunning =
    driver._componentRuntime.cells.has(replicaId);
  await lifecycle.stop(replicaHandle);
  return Object.freeze({
    cellStopped:
      cellWasRunning && !driver._componentRuntime.cells.has(replicaId),
    replicaId,
  });
}

async function cleanupAttempt(alreadyCompleted, operation) {
  if (alreadyCompleted) return {kind: 'skipped'};
  try {
    return {
      kind: 'completed',
      value: await operation(),
    };
  } catch (error) {
    return {error, kind: 'failed'};
  }
}

function cleanupErrors(attempts) {
  const errors = [];
  for (let index = 0; index < attempts.length; index += 1) {
    if (attempts[index].kind === 'failed') {
      errors.push(attempts[index].error);
    }
  }
  return errors;
}

async function requireTemporaryDirectoryAbsent(temporaryRoot) {
  try {
    await access(temporaryRoot);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(
    `MovieLens temporary directory remains: ${temporaryRoot}`,
  );
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
  if (cell.kind === 'completed') {
    cleanupState.cellStopped = cell.value.cellStopped;
  }
  const runtime = await cleanupAttempt(
    cleanupState.nodeStopped,
    () => node.shutdown(),
  );
  if (runtime.kind === 'completed') cleanupState.nodeStopped = true;
  const temporaryDirectory = await cleanupAttempt(
    cleanupState.tempRemoved,
    async () => {
      await rm(temporaryRoot, {force: true, recursive: true});
      await requireTemporaryDirectoryAbsent(temporaryRoot);
    },
  );
  if (temporaryDirectory.kind === 'completed') {
    cleanupState.tempRemoved = true;
  }
  const failures = cleanupErrors([
    cell,
    runtime,
    temporaryDirectory,
  ]);
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      'MovieLens workload cleanup failed',
    );
  }
  return cell.kind === 'completed' ? cell.value : null;
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
    cellAbsent = cell.kind === 'completed' ?
      cell.value.cellStopped :
      null;
    if (cell.kind === 'failed') {
      cleanupCauses.push({
        cause: cell.error,
        role:
          MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.CELL_CLEANUP,
      });
    }
  }
  let nodeStopped = nodeBootAttempted ? null : true;
  if (node) {
    const runtime = await cleanupAttempt(false, () => node.shutdown());
    nodeStopped = runtime.kind === 'completed' ? true : null;
    if (runtime.kind === 'failed') {
      cleanupCauses.push({
        cause: runtime.error,
        role:
          MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.NODE_CLEANUP,
      });
    }
  }
  let temporaryDirectoryAbsent =
    temporaryRoot === null ? true : null;
  if (temporaryRoot !== null) {
    const temporaryDirectory = await cleanupAttempt(
      false,
      async () => {
        await rm(temporaryRoot, {force: true, recursive: true});
        await requireTemporaryDirectoryAbsent(temporaryRoot);
      },
    );
    temporaryDirectoryAbsent =
      temporaryDirectory.kind === 'completed' ? true : null;
    if (temporaryDirectory.kind === 'failed') {
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
      replicaId:
        prepared?.deployment?.readyCell?.replicaId || null,
      temporaryDirectoryAbsent,
    }),
  });
}

async function openMovielensPublicRequestWorkloadLive(options = {}) {
  let stage = LIVE_FAILURE_STAGE.DATASET;
  let dataset = null;
  let postgres = null;
  let postgresCleanup = null;
  let temporaryRoot = null;
  let node = null;
  let nodeBootAttempted = false;
  let prepared = null;
  let prepareAttempted = false;
  try {
    dataset = await loadMovielensPublicRequestDataset(
      options.ratingsPath,
    );
    stage = LIVE_FAILURE_STAGE.POSTGRES;
    postgres = await runPostgresBaseline({
      ratingsBytes: dataset.bytes,
      ratingsDigest: dataset.digest,
    });
    postgresCleanup = postgres.cleanupReceipt;
    if (
      postgres.totalRows !== dataset.cardinality ||
      postgres.inputDigest !== dataset.digest
    ) {
      throw new Error(
        'PostgreSQL did not consume the retained MovieLens input',
      );
    }
    const alternative = projectPostgresAlternative(postgres);
    stage = LIVE_FAILURE_STAGE.TEMPORARY_DIRECTORY;
    temporaryRoot = await mkdtemp(
      path.join(tmpdir(), 'lagrange-movielens-public-request-'),
    );
    stage = LIVE_FAILURE_STAGE.ARTIFACT;
    const paths = {
      componentPath: path.join(
        temporaryRoot,
        MOVIELENS_PUBLIC_REQUEST.COMPONENT_FILE,
      ),
      componentSourcePath: path.join(
        EXAMPLE_DIRECTORY,
        MOVIELENS_PUBLIC_REQUEST.COMPONENT_SOURCE_FILE,
      ),
      ociOutputRoot: path.join(temporaryRoot, OCI_LAYOUT_DIRECTORY),
    };
    const artifactReceipt =
      await buildMovielensPublicRequestComponent(paths);
    const executableBytes = await readFile(paths.componentPath);
    const executableDigest = sha256(executableBytes);
    const executablePayload =
      artifactReceipt.payloadDescriptors.find(
        (descriptor) => descriptor.digest === executableDigest,
      );
    if (!executablePayload) {
      throw new Error(
        'WASM executable digest does not bind the OCI payload receipt',
      );
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
    const cleanupState = {
      cellStopped: false,
      nodeStopped: false,
      tempRemoved: false,
    };
    let closedReceipt = null;
    return Object.freeze({
      alternative,
      artifact: Object.freeze({
        buildInputFingerprint: artifactReceipt.buildInputFingerprint,
        componentSource: path.relative(
          process.cwd(),
          paths.componentSourcePath,
        ),
        executableDigest,
        ociManifestDigest:
          artifactReceipt.topManifestDescriptor.digest,
        ociPayloadDigest: executablePayload.digest,
      }),
      dataset: Object.freeze({
        cardinality: dataset.cardinality,
        digest: dataset.digest,
        sizeBytes: dataset.sizeBytes,
        source: dataset.source,
      }),
      prepared,
      retained: Object.freeze({
        datasetBytes: dataset.bytes,
        executableBytes,
        postgresLogs: postgres.logs,
      }),
      async close() {
        if (closedReceipt) return closedReceipt;
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
              cellAbsent:
                cleanupState.cellStopped ? true : null,
              nodeStopped:
                cleanupState.nodeStopped ? true : null,
              postgres: postgres.cleanupReceipt,
              replicaId: prepared.deployment.readyCell.replicaId,
              temporaryDirectoryAbsent:
                cleanupState.tempRemoved ? true : null,
            }),
            LIVE_FAILURE_STAGE.CLEANUP,
          );
        }
        closedReceipt = Object.freeze({
          cellAbsent: cleanupState.cellStopped,
          nodeStopped: cleanupState.nodeStopped,
          postgres: postgres.cleanupReceipt,
          replicaId: stopReceipt?.replicaId ||
            prepared.deployment.readyCell.replicaId,
          temporaryDirectoryAbsent: cleanupState.tempRemoved,
        });
        return closedReceipt;
      },
    });
  } catch (error) {
    postgresCleanup =
      safeMovielensFailureOwnDataValue(error, 'cleanupReceipt') ||
      postgresCleanup;
    const failedOpening = await closeFailedOpening({
      node,
      nodeBootAttempted,
      postgresCleanup,
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

function buildMovielensPublicRequestLiveEnvelope(
  session,
  result,
  teardown,
) {
  const observation = Object.freeze({
    alternative: session.alternative,
    artifact: session.artifact,
    dataset: session.dataset,
    ...result,
    teardown,
  });
  return Object.freeze({
    observation,
    retained: session.retained,
  });
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
    const cleanupTeardown =
      isMovielensPublicRequestLiveFailure(cleanupFailure) ?
        safeMovielensFailureOwnDataValue(
          cleanupFailure,
          'teardown',
        ) :
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
  return buildMovielensPublicRequestLiveEnvelope(
    session,
    result,
    teardown,
  );
}

async function runMovielensPublicRequestWorkloadLive(options = {}) {
  const session = await openMovielensPublicRequestWorkloadLive(options);
  const envelope =
    await runMovielensPublicRequestWorkloadSession(session);
  if (options.print !== false) {
    process.stdout.write(
      `${JSON.stringify(envelope.observation, null, 2)}\n`,
    );
  }
  return envelope;
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  await runMovielensPublicRequestWorkloadLive();
}

export {
  LIVE_FAILURE_STAGE,
  MovielensPublicRequestLiveFailure,
  REQUEST_IDEMPOTENCY_KEY,
  buildMovielensPublicRequestLiveEnvelope,
  buildPorts,
  closeFailedOpening,
  isMovielensPublicRequestLiveFailure,
  openMovielensPublicRequestWorkloadLive,
  preregisterRequestWitness,
  projectPostgresAlternative,
  runMovielensPublicRequestWorkloadLive,
  runMovielensPublicRequestWorkloadSession,
  stopPreparedCell,
  unobservedWorkloadTeardown,
};
