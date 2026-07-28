import {
  BENCHMARK_CAPACITY_OUTCOME,
} from '../../test/distributed/harness/benchmark-capacity-protocol-constants.js';
import {
  createBenchmarkCapacityAdapterIdentity,
  createBenchmarkCapacityAdapterOwnerReceipt,
} from '../../test/distributed/harness/benchmark-capacity-heterogeneous-observation.js';
import {
  appendOwnArrayValue,
  digestBenchmarkSemanticData,
  isPlainDataRecord,
  isNonNegativeSafeInteger,
  isSha256Digest,
} from '../../test/distributed/harness/benchmark-semantic-integrity.js';
import {
  BENCHMARK_SQL_DIALECT,
  buildBenchmarkResultSetEvidence,
  buildBenchmarkSemanticReceipt,
} from '../../test/distributed/harness/benchmark-workload-semantics.js';
import {
  MOVIELENS_PUBLIC_REQUEST,
  expectedRankingFromAlternative,
} from './movielens-public-request-workload-contract.js';

const ADAPTER_VERSION = 'movielens-capacity-runtime-adapter-v1';
const RESET_VERSION = 'movielens-capacity-runtime-reset-v1';
const OPERATION_MANIFEST_VERSION =
  'movielens-capacity-operation-manifest-v2';
const LAGRANGE_OWNER_VERSION =
  'movielens-lagrange-runtime-owner-evidence-v2';
const POSTGRES_OWNER_VERSION =
  'movielens-postgresql-runtime-owner-evidence-v2';
const ADAPTER_STATE = Object.freeze({
  ACTIVE: 'active',
  IDLE: 'idle',
  NOT_FINALIZED: 'not_finalized',
});
const IDLE_ADAPTER_STATE = Object.freeze({kind: ADAPTER_STATE.IDLE});
const SEMANTIC_OUTCOME_HEX_START = 7;
const SEMANTIC_OUTCOME_HEX_END = 19;
const OPERATION_IDENTITY_HEX_START = 7;
const OPERATION_IDENTITY_HEX_END = 39;
const FAILURE_MESSAGE_LIMIT = 512;
const numberParseInt = Number.parseInt;
const objectFreeze = Object.freeze;
const stringConstructor = String;
const stringSlice = Function.call.bind(String.prototype.slice);
const localText = Object.freeze({
  CANNOT_RESET_ACTIVE: 'cannot reset an active window',
  CORRECT_EVIDENCE_MISSING: 'correct operation evidence is missing',
  DURABILITY_FAILED: 'operation durability evidence failed',
  ERROR: 'Error',
  FINALIZED_EVIDENCE_REQUIRED: 'finalized window evidence is required',
  LAGRANGE_SESSION_REQUIRED:
    'open Lagrange public request session is required',
  OPERATION_INDEX_INVALID: 'operation index is invalid',
  OPERATION_MANIFEST_REQUIRED:
    'sealed MovieLens operation manifest is required',
  POSTGRES_ORACLE_MISMATCH: 'PostgreSQL grouped-reduce oracle mismatch',
  POSTGRES_SESSION_REQUIRED:
    'open PostgreSQL MovieLens session is required',
  SELECT: 'SELECT',
  SEMANTIC_PASS: 'pass',
  SEMANTIC_FAIL: 'fail',
  TOP_TEN_RESULT: 'confidence_adjusted_top_ten',
  DURABILITY_POLICY:
    'input_preserved_and_result_visible_after_completion',
  SEMANTIC_ORACLE_MISMATCH: 'sealed semantic oracle mismatch',
  UNKNOWN_FAILURE: 'unknown adapter failure',
  WINDOW_ACTIVE: 'window already active',
  WINDOW_INACTIVE: 'window is not active',
});

function fail(reason) {
  throw new TypeError(`MovieLens capacity adapter failed: ${reason}`);
}

function operationIdentity(adapterId, context, operationIndex) {
  const digest = digestBenchmarkSemanticData({
    adapterId,
    blockIndex: context.blockIndex,
    blockedOrderIndex: context.blockedOrderIndex,
    sideId: context.sideId,
    offeredLoadPerSecond: context.offeredLoadPerSecond,
    phase: context.phase,
    operationIndex,
  });
  return `${adapterId}-${stringSlice(
    digest,
    OPERATION_IDENTITY_HEX_START,
    OPERATION_IDENTITY_HEX_END,
  )}`;
}

function semanticOutcomeFromDigest(digest) {
  const outcome = numberParseInt(
    stringSlice(
      digest,
      SEMANTIC_OUTCOME_HEX_START,
      SEMANTIC_OUTCOME_HEX_END,
    ),
    16,
  );
  if (!isNonNegativeSafeInteger(outcome)) {
    fail(localText.SEMANTIC_ORACLE_MISMATCH);
  }
  return outcome;
}

function canonicalFailure(error) {
  return {
    name:
      typeof error?.name === 'string' ? error.name : localText.ERROR,
    message:
      typeof error?.message === 'string' ?
        stringSlice(error.message, 0, FAILURE_MESSAGE_LIMIT) :
        localText.UNKNOWN_FAILURE,
  };
}

function semanticReceipt(
  state,
  counts,
  rejectedByReason,
  correctOperationIndexes,
) {
  const observations = [];
  const missingIds = [];
  let durableOperationCount = 0;
  for (let index = 0; index < correctOperationIndexes.length; index += 1) {
    const operationIndex = correctOperationIndexes[index];
    let operation;
    for (let evidenceIndex = 0;
      evidenceIndex < state.operations.length;
      evidenceIndex += 1) {
      if (state.operations[evidenceIndex].operationIndex === operationIndex) {
        operation = state.operations[evidenceIndex];
        break;
      }
    }
    if (
      operation?.status !== BENCHMARK_CAPACITY_OUTCOME.CORRECT ||
      operation.evidence?.durabilityPassed !== true ||
      typeof operation.evidence.durabilityDigest !== 'string' ||
      !isPlainDataRecord(operation.evidence.semanticObservation) ||
      operation.evidence.semanticObservation.operationId !== operationIndex
    ) {
      appendOwnArrayValue(
        missingIds,
        operation?.operationId || stringConstructor(operationIndex),
      );
      continue;
    }
    durableOperationCount += 1;
    appendOwnArrayValue(
      observations,
      operation.evidence.semanticObservation,
    );
  }
  return buildBenchmarkSemanticReceipt({
    dialect: BENCHMARK_SQL_DIALECT.POSTGRESQL,
    compiledOperations: counts.dispatched,
    validatedOperations: counts.correct,
    successfulOperations: counts.correct,
    oracleFailures: 0,
    resultSet: buildBenchmarkResultSetEvidence(observations),
    accounting: {
      ...counts,
      rejectedByReason: {...rejectedByReason},
    },
    durability: {
      status:
        durableOperationCount === counts.correct ?
          localText.SEMANTIC_PASS :
          localText.SEMANTIC_FAIL,
      expected: counts.correct,
      observed: durableOperationCount,
      missingIds,
      reason:
        durableOperationCount === counts.correct ?
          null :
          localText.DURABILITY_FAILED,
    },
  });
}

function copyCorrectEvidence(state, correctOperationIndexes) {
  const operationIds = [];
  for (let index = 0; index < correctOperationIndexes.length; index += 1) {
    const operationIndex = correctOperationIndexes[index];
    let evidence;
    for (let evidenceIndex = 0;
      evidenceIndex < state.operations.length;
      evidenceIndex += 1) {
      if (state.operations[evidenceIndex].operationIndex === operationIndex) {
        evidence = state.operations[evidenceIndex];
        break;
      }
    }
    if (
      evidence?.status !== BENCHMARK_CAPACITY_OUTCOME.CORRECT ||
      typeof evidence.operationId !== 'string'
    ) {
      fail(localText.CORRECT_EVIDENCE_MISSING);
    }
    appendOwnArrayValue(operationIds, evidence.operationId);
  }
  return operationIds;
}

function createAdapter({
  adapterIdentity,
  executeOperation,
  resetRunState,
  projectOperation,
  semanticOracleDigest,
  runtimeOwnerEvidence,
}) {
  let state = IDLE_ADAPTER_STATE;
  function beginWindow(context) {
    if (state.kind !== ADAPTER_STATE.IDLE) fail(localText.WINDOW_ACTIVE);
    state = {
      kind: ADAPTER_STATE.ACTIVE,
      context: objectFreeze({...context}),
      operations: [],
      ownerReceipt: ADAPTER_STATE.NOT_FINALIZED,
      semanticReceipt: ADAPTER_STATE.NOT_FINALIZED,
    };
  }
  async function execute({operationIndex, signal}) {
    if (state.kind !== ADAPTER_STATE.ACTIVE) fail(localText.WINDOW_INACTIVE);
    if (!isNonNegativeSafeInteger(operationIndex)) {
      fail(localText.OPERATION_INDEX_INVALID);
    }
    const operationId = operationIdentity(
      adapterIdentity.adapterId,
      state.context,
      operationIndex,
    );
    const evidenceIndex = state.operations.length;
    appendOwnArrayValue(state.operations, null);
    try {
      const result = await executeOperation({
        operationId,
        operationIndex,
        signal,
      });
      const evidence = projectOperation(
        result,
        operationId,
        operationIndex,
      );
      if (evidence.semanticOracleDigest !== semanticOracleDigest) {
        fail(localText.SEMANTIC_ORACLE_MISMATCH);
      }
      state.operations[evidenceIndex] = objectFreeze({
        status: BENCHMARK_CAPACITY_OUTCOME.CORRECT,
        operationIndex,
        operationId,
        evidence,
      });
      return {status: BENCHMARK_CAPACITY_OUTCOME.CORRECT};
    } catch (error) {
      state.operations[evidenceIndex] = objectFreeze({
        status: BENCHMARK_CAPACITY_OUTCOME.ERRORED,
        operationIndex,
        operationId,
        failure: canonicalFailure(error),
      });
      throw error;
    }
  }
  function finalize({
    counts,
    rejectedByReason,
    correctOperationIndexes,
  }) {
    if (state.kind !== ADAPTER_STATE.ACTIVE) fail(localText.WINDOW_INACTIVE);
    const operationIds =
      copyCorrectEvidence(state, correctOperationIndexes);
    const evidenceDigest = digestBenchmarkSemanticData({
      adapterIdentityDigest: adapterIdentity.adapterIdentityDigest,
      coordinate: state.context,
      semanticOracleDigest,
      operations: state.operations,
    });
    state.ownerReceipt = createBenchmarkCapacityAdapterOwnerReceipt({
      adapterIdentity,
      operationIds,
      evidenceDigest,
      semanticOracleDigest,
    });
    state.semanticReceipt = semanticReceipt(
      state,
      counts,
      rejectedByReason,
      correctOperationIndexes,
    );
    return state.semanticReceipt;
  }
  function completeWindow() {
    if (
      state.kind !== ADAPTER_STATE.ACTIVE ||
      state.ownerReceipt === ADAPTER_STATE.NOT_FINALIZED ||
      state.semanticReceipt === ADAPTER_STATE.NOT_FINALIZED
    ) {
      fail(localText.FINALIZED_EVIDENCE_REQUIRED);
    }
    const operationEvidence = [];
    for (let index = 0; index < state.operations.length; index += 1) {
      appendOwnArrayValue(operationEvidence, state.operations[index]);
    }
    const completed = objectFreeze({
      coordinate: state.context,
      operationEvidence: objectFreeze(operationEvidence),
      ownerReceipt: state.ownerReceipt,
      runtimeOwnerEvidence,
      semanticReceipt: state.semanticReceipt,
    });
    state = IDLE_ADAPTER_STATE;
    return completed;
  }
  return objectFreeze({
    adapterIdentity,
    beginWindow,
    completeWindow,
    executeOperation: execute,
    finalizeSemanticReceipt: finalize,
    async resetRunState(context) {
      if (state.kind !== ADAPTER_STATE.IDLE) {
        fail(localText.CANNOT_RESET_ACTIVE);
      }
      const resetContext = {
        blockIndex: context.blockIndex,
        blockedOrderIndex: context.blockedOrderIndex,
        sideId: context.sideId,
        offeredLoadPerSecond: context.offeredLoadPerSecond,
      };
      const ownerReceipt = await resetRunState(resetContext);
      return objectFreeze({
        version: RESET_VERSION,
        adapterIdentityDigest: adapterIdentity.adapterIdentityDigest,
        sideId: adapterIdentity.sideId,
        context: objectFreeze(resetContext),
        ownerReceipt,
        resetDigest: digestBenchmarkSemanticData({
          adapterIdentityDigest:
            adapterIdentity.adapterIdentityDigest,
          sideId: adapterIdentity.sideId,
          context: resetContext,
          ownerReceipt,
        }),
      });
    },
  });
}

function lagrangeOperationEvidence(
  session,
  result,
  operationId,
  operationIndex,
) {
  const requestWitness = result.response.requestWitness;
  const oracleDigest = digestBenchmarkSemanticData(result.oracle.observed);
  const durabilityDigest = digestBenchmarkSemanticData({
    datasetDigest: session.dataset.digest,
    durableResult: result.result,
    invocationJournal: result.invocationJournal,
  });
  return {
    executableDigest: session.artifact.executableDigest,
    requestWitness: {
      bindingVersionId: requestWitness.bindingVersionId,
      idempotencyKey: requestWitness.idempotencyKey,
      intentDigest: requestWitness.intentDigest,
      invocationIdentity: requestWitness.invocationIdentity,
      normalizedRequest: requestWitness.normalizedRequest,
      requestDigest: requestWitness.requestDigest,
      routeServiceId: requestWitness.routeServiceId,
      tenantId: requestWitness.tenantId,
    },
    invocationJournal: result.invocationJournal,
    httpStatus: result.response.status,
    durableResult: result.result,
    semanticOracleReceipt: {
      observed: result.oracle.observed,
      passed: result.oracle.passed,
      version: result.oracle.version,
    },
    durabilityDigest,
    durabilityPassed: result.oracle.passed === true,
    semanticObservation: {
      operationId: operationIndex,
      operation: localText.SELECT,
      outcome: semanticOutcomeFromDigest(oracleDigest),
    },
    semanticOracleDigest: oracleDigest,
  };
}

export function createMovielensLagrangeCapacityAdapter({
  session,
  sideId,
  operationManifest,
  semanticOracleDigest,
}) {
  if (!session?.prepared?.executeCapacityOperation) {
    fail(localText.LAGRANGE_SESSION_REQUIRED);
  }
  const semanticOracleExpected =
    expectedRankingFromAlternative(session.alternative);
  if (
    !isPlainDataRecord(operationManifest) ||
    !isSha256Digest(operationManifest.datasetDigest) ||
    operationManifest.datasetDigest !== session.dataset.digest
  ) {
    fail(localText.OPERATION_MANIFEST_REQUIRED);
  }
  const runtimeOwnerEvidence = objectFreeze({
    version: LAGRANGE_OWNER_VERSION,
    bindingName: session.prepared.deployment.binding.name,
    bindingVersionId:
      session.prepared.deployment.readyCell.bindingVersionId,
    datasetDigest: session.dataset.digest,
    executableDigest: session.artifact.executableDigest,
    routeServiceId: session.prepared.deployment.readyCell.serviceId,
    runtimeKind: session.prepared.deployment.manifest.runtime.kind,
    semanticOracleExpected,
    operationManifest,
  });
  const adapterIdentity = createBenchmarkCapacityAdapterIdentity({
    adapterId: 'movielens-lagrange-public-request',
    adapterVersion: ADAPTER_VERSION,
    sideId,
    runtimeKind: 'wasm_component',
    invocationBoundary: 'authenticated_http_request_binding',
    operationManifestDigest:
      digestBenchmarkSemanticData(operationManifest),
    executableDigest: session.artifact.executableDigest,
    ownerEvidenceDigest:
      digestBenchmarkSemanticData(runtimeOwnerEvidence),
  });
  return createAdapter({
    adapterIdentity,
    runtimeOwnerEvidence,
    semanticOracleDigest,
    async executeOperation({operationId, signal}) {
      return session.prepared.executeCapacityOperation({
        idempotencyKey: operationId,
        operationId,
      }, signal);
    },
    async resetRunState() {
      return session.prepared.resetRunState();
    },
    projectOperation(result, operationId, operationIndex) {
      return lagrangeOperationEvidence(
        session,
        result,
        operationId,
        operationIndex,
      );
    },
  });
}

function postgresqlOperationEvidence(
  session,
  result,
  operationId,
  operationIndex,
  semanticOracleDigest,
) {
  const observedRanking = expectedRankingFromAlternative({
    topMovies: result.topMovies,
  });
  const observedDigest = digestBenchmarkSemanticData(observedRanking);
  if (observedDigest !== semanticOracleDigest) {
    fail(localText.POSTGRES_ORACLE_MISMATCH);
  }
  return {
    requestId: result.requestId,
    backendPid: result.backendPid,
    imageId: session.imageId,
    imageRepoDigestsDigest:
      digestBenchmarkSemanticData(session.imageInspection.repoDigests),
    inputDigest: session.inputDigest,
    postgresVersion: session.postgresVersion,
    queryPlanDigest: digestBenchmarkSemanticData(session.queryPlan),
    querySqlDigest: digestBenchmarkSemanticData(session.querySql),
    returnedAggregateRows: result.returnedAggregateRows,
    durableInputRows: result.durableInputRows,
    durableResultJson: result.durableResultJson,
    topMovies: result.topMovies,
    durabilityDigest: digestBenchmarkSemanticData({
      durableInputRows: result.durableInputRows,
      durableResultJson: result.durableResultJson,
      requestId: result.requestId,
      topMovies: result.topMovies,
    }),
    durabilityPassed: result.durabilityPassed,
    semanticObservation: {
      operationId: operationIndex,
      operation: localText.SELECT,
      outcome: semanticOutcomeFromDigest(observedDigest),
    },
    semanticOracleDigest: observedDigest,
  };
}

export function createMovielensPostgresqlCapacityAdapter({
  session,
  sideId,
  operationManifest,
  semanticOracleDigest,
}) {
  if (!session?.executeGroupedReduce) {
    fail(localText.POSTGRES_SESSION_REQUIRED);
  }
  if (
    !isPlainDataRecord(operationManifest) ||
    operationManifest.postgresqlQuerySqlDigest !==
      digestBenchmarkSemanticData(session.querySql)
  ) {
    fail(localText.OPERATION_MANIFEST_REQUIRED);
  }
  const runtimeOwnerEvidence = objectFreeze({
    version: POSTGRES_OWNER_VERSION,
    imageId: session.imageId,
    imageRepoDigests: session.imageInspection.repoDigests,
    inputDigest: session.inputDigest,
    postgresVersion: session.postgresVersion,
    postgresVersionSql: session.postgresVersionSql,
    queryPlan: session.queryPlan,
    querySql: session.querySql,
    totalRows: session.totalRows,
    operationManifest,
  });
  const adapterIdentity = createBenchmarkCapacityAdapterIdentity({
    adapterId: 'movielens-postgresql-grouped-reduce',
    adapterVersion: ADAPTER_VERSION,
    sideId,
    runtimeKind: 'postgresql_16',
    invocationBoundary: 'persistent_pg_pool_sql_query',
    operationManifestDigest:
      digestBenchmarkSemanticData(operationManifest),
    executableDigest: session.imageId,
    ownerEvidenceDigest:
      digestBenchmarkSemanticData(runtimeOwnerEvidence),
  });
  return createAdapter({
    adapterIdentity,
    runtimeOwnerEvidence,
    semanticOracleDigest,
    executeOperation({operationId, signal}) {
      return session.executeGroupedReduce(
        {requestId: operationId},
        signal,
      );
    },
    resetRunState() {
      return session.resetRunState();
    },
    projectOperation(result, operationId, operationIndex) {
      return postgresqlOperationEvidence(
        session,
        result,
        operationId,
        operationIndex,
        semanticOracleDigest,
      );
    },
  });
}

export function movielensCapacitySemanticOracleDigest(alternative) {
  return digestBenchmarkSemanticData(
    expectedRankingFromAlternative(alternative),
  );
}

export function movielensCapacityOperationManifest(
  dataset,
  postgresqlQuerySql,
) {
  if (
    !isSha256Digest(dataset?.digest) ||
    typeof postgresqlQuerySql !== 'string' ||
    postgresqlQuerySql.length === 0
  ) {
    fail(localText.OPERATION_MANIFEST_REQUIRED);
  }
  return objectFreeze({
    version: OPERATION_MANIFEST_VERSION,
    datasetDigest: dataset.digest,
    lagrangePublicRequest: objectFreeze({
      method: MOVIELENS_PUBLIC_REQUEST.METHOD,
      path: MOVIELENS_PUBLIC_REQUEST.PATH,
    }),
    postgresqlQuerySqlDigest:
      digestBenchmarkSemanticData(postgresqlQuerySql),
    result: localText.TOP_TEN_RESULT,
    durability: localText.DURABILITY_POLICY,
  });
}

export function movielensCapacityOperationManifestDigest(
  dataset,
  postgresqlQuerySql,
) {
  return digestBenchmarkSemanticData(
    movielensCapacityOperationManifest(dataset, postgresqlQuerySql),
  );
}
