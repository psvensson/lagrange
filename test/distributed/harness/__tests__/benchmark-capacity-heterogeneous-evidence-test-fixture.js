import assert from 'node:assert/strict';

import {
  BENCHMARK_RESOURCE_LIMIT,
} from '../benchmark-resource-contract-constants.js';
import {
  createBenchmarkCapacityWindowReceipt,
} from '../benchmark-capacity-window-receipt.js';
import {
  assertBenchmarkCapacityHeterogeneousOperationEvidence,
  createBenchmarkCapacityAdapterIdentity,
  createBenchmarkCapacityAdapterOwnerReceipt,
  createBenchmarkCapacityHeadroomReceipt,
  createBenchmarkCapacityHeterogeneousOperationReceipt,
} from '../benchmark-capacity-heterogeneous-observation.js';
import {
  encodeBenchmarkCapacityHeterogeneousOperationEvidence,
} from '../benchmark-capacity-heterogeneous-protocol.js';
import {
  digestBenchmarkSemanticData,
} from '../benchmark-semantic-integrity.js';

const POSTGRESQL_QUERY_SQL = 'SELECT grouped_reduce FROM ratings';
const LAGRANGE_RUNTIME_KIND = 'wasm_component';
const POSTGRESQL_RUNTIME_KIND = 'postgresql_16';
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayMap = Function.call.bind(Array.prototype.map);

const FIXTURE_VALUE = Object.freeze({
  ADAPTER_VERSION: 'fixture-v1',
  BACKEND_PID: 123,
  BINDING_NAME: 'movielens-public-grouped-reduce',
  BINDING_VERSION_ID: 'binding-version-v1',
  COMMAND_ACKNOWLEDGED: 'command_acknowledged',
  CORRECT: 'correct',
  DATASET: 'movielens-10k',
  DATASET_KEY: 'fixture',
  DURABILITY: 'input_preserved_and_result_visible_after_completion',
  ERRORED: 'errored',
  ERROR_MESSAGE: 'fixture operation failed',
  ERROR_NAME: 'Error',
  HTTP_INVOCATION_BOUNDARY: 'authenticated_http_request_binding',
  HTTP_STATUS_OK: 200,
  LAGRANGE_OWNER_VERSION: 'movielens-lagrange-runtime-owner-evidence-v2',
  MEASURED: 'measured',
  OPERATION: 'confidence_adjusted_top_ten',
  OPERATION_MANIFEST_VERSION: 'movielens-capacity-operation-manifest-v2',
  ORACLE_VERSION: 'confidence-adjusted-top-ten-v1',
  POSTGRES_IMAGE_DIGEST: 'postgres@sha256:fixture',
  POSTGRES_INVOCATION_BOUNDARY: 'persistent_pg_pool_sql_query',
  POSTGRES_OWNER_VERSION: 'movielens-postgresql-runtime-owner-evidence-v2',
  POSTGRES_PLAN_NODE: 'Aggregate',
  POSTGRES_TOTAL_ROWS: 10_000,
  POSTGRES_VERSION: 'PostgreSQL 16.10',
  POSTGRES_VERSION_SQL: 'SELECT version()',
  RANKING_BASE_SCORE: 5,
  RANKING_LENGTH: 10,
  RANKING_RATING_COUNT_BASE: 100,
  RANKING_SCORE_SCALE: 1_000_000,
  REQUEST_METHOD: 'POST',
  REQUEST_PATH: '/benchmarks/movielens/grouped-reduce',
  SEMANTIC_OPERATION: 'INSERT',
  SERVICE_ID: 'service-v1',
  WORKLOAD_VERSION: 'movielens-capacity-resource-fixture-v1',
});

function fixtureDatasetDigest() {
  return digestBenchmarkSemanticData({dataset: FIXTURE_VALUE.DATASET_KEY});
}

function fixtureOperationManifest() {
  return {
    version: FIXTURE_VALUE.OPERATION_MANIFEST_VERSION,
    datasetDigest: fixtureDatasetDigest(),
    lagrangePublicRequest: {
      method: FIXTURE_VALUE.REQUEST_METHOD,
      path: FIXTURE_VALUE.REQUEST_PATH,
    },
    postgresqlQuerySqlDigest:
      digestBenchmarkSemanticData(POSTGRESQL_QUERY_SQL),
    result: FIXTURE_VALUE.OPERATION,
    durability: FIXTURE_VALUE.DURABILITY,
  };
}

function fixtureRanking() {
  return Array.from({length: FIXTURE_VALUE.RANKING_LENGTH}, (_, index) => ({
    movieId: index + 1,
    rank: index + 1,
    scoreMicros: Math.trunc(
      (FIXTURE_VALUE.RANKING_BASE_SCORE -
        index / FIXTURE_VALUE.RANKING_LENGTH) *
        FIXTURE_VALUE.RANKING_SCORE_SCALE,
    ),
  }));
}

function fixtureTopMovies() {
  return arrayMap(fixtureRanking(), (row) => ({
    avgRating: row.scoreMicros / FIXTURE_VALUE.RANKING_SCORE_SCALE,
    movieId: row.movieId,
    ratingCount: FIXTURE_VALUE.RANKING_RATING_COUNT_BASE - row.rank,
    score: row.scoreMicros / FIXTURE_VALUE.RANKING_SCORE_SCALE,
  }));
}

export function benchmarkCapacityHeterogeneousWorkloadPayload() {
  return {
    version: FIXTURE_VALUE.WORKLOAD_VERSION,
    dataset: FIXTURE_VALUE.DATASET,
    operation: FIXTURE_VALUE.OPERATION,
    operationManifestDigest:
      digestBenchmarkSemanticData(fixtureOperationManifest()),
    semanticOracleDigest: digestBenchmarkSemanticData(fixtureRanking()),
  };
}

function runtimeOwnerEvidence(sideId, executableDigest, lagrangeSideId) {
  if (sideId === lagrangeSideId) {
    return {
      version: FIXTURE_VALUE.LAGRANGE_OWNER_VERSION,
      bindingName: FIXTURE_VALUE.BINDING_NAME,
      bindingVersionId: FIXTURE_VALUE.BINDING_VERSION_ID,
      datasetDigest: fixtureDatasetDigest(),
      executableDigest,
      routeServiceId: FIXTURE_VALUE.SERVICE_ID,
      runtimeKind: LAGRANGE_RUNTIME_KIND,
      semanticOracleExpected: fixtureRanking(),
      operationManifest: fixtureOperationManifest(),
    };
  }
  return {
    version: FIXTURE_VALUE.POSTGRES_OWNER_VERSION,
    imageId: executableDigest,
    imageRepoDigests: [FIXTURE_VALUE.POSTGRES_IMAGE_DIGEST],
    inputDigest: fixtureDatasetDigest(),
    postgresVersion: FIXTURE_VALUE.POSTGRES_VERSION,
    postgresVersionSql: FIXTURE_VALUE.POSTGRES_VERSION_SQL,
    queryPlan: [{
      'QUERY PLAN': [{Plan: {'Node Type': FIXTURE_VALUE.POSTGRES_PLAN_NODE}}],
    }],
    querySql: POSTGRESQL_QUERY_SQL,
    totalRows: FIXTURE_VALUE.POSTGRES_TOTAL_ROWS,
    operationManifest: fixtureOperationManifest(),
  };
}

function fixtureLagrangeOperation(
  operationId,
  operationIndex,
  owner,
  semanticOracleDigest,
) {
  const tenantId = 'fixture';
  const body = {
    datasetDigest: owner.datasetDigest,
    resultKeyOffset: operationIndex * 10,
    workloadVersion: 'movielens-public-request-workload-v1',
  };
  const normalizedRequest = {
    body,
    headers: {'accept': '*/*', 'content-type': 'application/json'},
    method: FIXTURE_VALUE.REQUEST_METHOD,
    path: FIXTURE_VALUE.REQUEST_PATH,
    query: {},
  };
  const invocationIdentity =
    `request-invocation-${digestBenchmarkSemanticData({
      requestKey: operationId,
      tenantId,
    }).slice(7)}`;
  const requestDigest = digestBenchmarkSemanticData(normalizedRequest);
  const intentDigest = digestBenchmarkSemanticData({
    bindingVersionId: owner.bindingVersionId,
    method: normalizedRequest.method,
    path: normalizedRequest.path,
    requestDigest,
    tenantId,
  });
  const journalOperationId =
    `request-cell-operation-${digestBenchmarkSemanticData([
      tenantId,
      invocationIdentity,
    ]).slice(7)}`;
  const invocationJournal = {
    command: `invoke:${owner.routeServiceId}:${intentDigest}`,
    created_at: '2026-07-28T00:00:00.000Z',
    error: '{}',
    idempotency_key: invocationIdentity,
    operation_id: journalOperationId,
    result: JSON.stringify(JSON.stringify({
      body: 'MovieLens grouped reduce completed',
      headers: [['x-lagrange-cell', owner.bindingName]],
      status: 200,
    })),
    state: 'completed',
    tenant_id: tenantId,
    updated_at: '2026-07-28T00:00:00.001Z',
  };
  const ranking = fixtureRanking();
  const durableResult = {
    movieRows: arrayMap(ranking, (row) => ({
      key: row.rank,
      value: row.movieId,
    })),
    scoreRows: arrayMap(ranking, (row) => ({
      key: row.rank,
      value: row.scoreMicros,
    })),
  };
  return {
    executableDigest: owner.executableDigest,
    requestWitness: {
      bindingVersionId: owner.bindingVersionId,
      idempotencyKey: operationId,
      intentDigest,
      invocationIdentity,
      normalizedRequest,
      requestDigest,
      routeServiceId: owner.routeServiceId,
      tenantId,
    },
    invocationJournal,
    httpStatus: FIXTURE_VALUE.HTTP_STATUS_OK,
    durableResult,
    semanticOracleReceipt: {
      observed: ranking,
      passed: true,
      version: FIXTURE_VALUE.ORACLE_VERSION,
    },
    semanticOracleDigest,
    durabilityPassed: true,
    durabilityDigest: digestBenchmarkSemanticData({
      datasetDigest: owner.datasetDigest,
      durableResult,
      invocationJournal,
    }),
    semanticObservation: {
      operationId: operationIndex,
      operation: FIXTURE_VALUE.SEMANTIC_OPERATION,
      outcome: FIXTURE_VALUE.COMMAND_ACKNOWLEDGED,
    },
  };
}

function fixturePostgresqlOperation(
  operationId,
  operationIndex,
  owner,
  semanticOracleDigest,
) {
  const topMovies = fixtureTopMovies();
  const durableResultJson = JSON.stringify(topMovies);
  return {
    requestId: operationId,
    backendPid: FIXTURE_VALUE.BACKEND_PID,
    imageId: owner.imageId,
    imageRepoDigestsDigest:
      digestBenchmarkSemanticData(owner.imageRepoDigests),
    inputDigest: owner.inputDigest,
    postgresVersion: owner.postgresVersion,
    queryPlanDigest: digestBenchmarkSemanticData(owner.queryPlan),
    querySqlDigest: digestBenchmarkSemanticData(owner.querySql),
    returnedAggregateRows: topMovies.length,
    durableInputRows: owner.totalRows,
    durableResultJson,
    topMovies,
    durabilityDigest: digestBenchmarkSemanticData({
      durableInputRows: owner.totalRows,
      durableResultJson,
      requestId: operationId,
      topMovies,
    }),
    durabilityPassed: true,
    semanticObservation: {
      operationId: operationIndex,
      operation: FIXTURE_VALUE.SEMANTIC_OPERATION,
      outcome: FIXTURE_VALUE.COMMAND_ACKNOWLEDGED,
    },
    semanticOracleDigest,
  };
}

function fixtureAdapterIdentity(
  receipt,
  executableDigest,
  runtimeOwner,
  lagrangeSideId,
) {
  const lagrange = receipt.sideId === lagrangeSideId;
  return createBenchmarkCapacityAdapterIdentity({
    adapterId: `movielens-${receipt.sideId}`,
    adapterVersion: FIXTURE_VALUE.ADAPTER_VERSION,
    sideId: receipt.sideId,
    runtimeKind:
      lagrange ? LAGRANGE_RUNTIME_KIND : POSTGRESQL_RUNTIME_KIND,
    invocationBoundary: lagrange ?
      FIXTURE_VALUE.HTTP_INVOCATION_BOUNDARY :
      FIXTURE_VALUE.POSTGRES_INVOCATION_BOUNDARY,
    operationManifestDigest:
      digestBenchmarkSemanticData(runtimeOwner.operationManifest),
    executableDigest,
    ownerEvidenceDigest: digestBenchmarkSemanticData(runtimeOwner),
  });
}

function operationEvidenceForWindow(
  receipt,
  sample,
  runtimeOwner,
  lagrangeSideId,
) {
  const operationIds = [];
  const operationEvidence = [];
  const semanticOracleDigest =
    benchmarkCapacityHeterogeneousWorkloadPayload()
      .semanticOracleDigest;
  for (let operationIndex = 0;
    operationIndex < sample.counts.dispatched;
    operationIndex += 1) {
    const operationId =
      `${receipt.sideId}-${receipt.blockIndex}-` +
      `${receipt.offeredLoad}-${operationIndex}`;
    if (operationIndex < sample.counts.correct) {
      operationIds.push(operationId);
      operationEvidence.push({
        status: FIXTURE_VALUE.CORRECT,
        operationIndex,
        operationId,
        evidence:
          receipt.sideId === lagrangeSideId ?
            fixtureLagrangeOperation(
              operationId,
              operationIndex,
              runtimeOwner,
              semanticOracleDigest,
            ) :
            fixturePostgresqlOperation(
              operationId,
              operationIndex,
              runtimeOwner,
              semanticOracleDigest,
            ),
      });
    } else {
      operationEvidence.push({
        status: FIXTURE_VALUE.ERRORED,
        operationIndex,
        operationId,
        failure: {
          name: FIXTURE_VALUE.ERROR_NAME,
          message: FIXTURE_VALUE.ERROR_MESSAGE,
        },
      });
    }
  }
  return {operationIds, operationEvidence, semanticOracleDigest};
}

function heterogeneousEvidenceForWindow(
  preregistration,
  receipt,
  sample,
  lagrangeSideId,
) {
  const executableDigest =
    digestBenchmarkSemanticData({runtime: receipt.sideId});
  const runtimeOwner =
    runtimeOwnerEvidence(receipt.sideId, executableDigest, lagrangeSideId);
  const adapterIdentity = fixtureAdapterIdentity(
    receipt,
    executableDigest,
    runtimeOwner,
    lagrangeSideId,
  );
  const operation =
    operationEvidenceForWindow(
      receipt,
      sample,
      runtimeOwner,
      lagrangeSideId,
    );
  const coordinate = {
    blockIndex: receipt.blockIndex,
    blockedOrderIndex: receipt.blockedOrderIndex,
    sideId: receipt.sideId,
    offeredLoadPerSecond: receipt.offeredLoad,
    phase: receipt.phase,
  };
  const ownerReceipt = createBenchmarkCapacityAdapterOwnerReceipt({
    adapterIdentity,
    operationIds: operation.operationIds,
    evidenceDigest: digestBenchmarkSemanticData({
      adapterIdentityDigest: adapterIdentity.adapterIdentityDigest,
      coordinate,
      semanticOracleDigest: operation.semanticOracleDigest,
      operations: operation.operationEvidence,
    }),
    semanticOracleDigest: operation.semanticOracleDigest,
  });
  const engagement =
    createBenchmarkCapacityHeterogeneousOperationReceipt({
      preregistration,
      sample,
      adapterIdentity,
      ownerReceipt,
      window: {
        blockedOrderIndex: receipt.blockedOrderIndex,
        startedAt: receipt.startedAt,
        endedAt: receipt.endedAt,
      },
      headroom: createBenchmarkCapacityHeadroomReceipt({
        minimumRequiredRatio: 0.1,
        observerCpu: {capacity: 100, observedPeak: 5},
        hostCpu: {capacity: 16, observedPeak: 4},
        hostMemory: {capacity: 64_000, observedPeak: 16_000},
        sharedNetwork: {capacity: 10_000, observedPeak: 2_000},
        sharedStorage: {capacity: 10_000, observedPeak: 1_000},
      }, sample),
    });
  assert.doesNotThrow(
    () => assertBenchmarkCapacityHeterogeneousOperationEvidence(
      engagement,
      operation.operationEvidence,
      sample.semanticReceipt,
      runtimeOwner,
    ),
    `${receipt.sideId} block ${receipt.blockIndex} operation evidence`,
  );
  const rawEvidenceBytes = Buffer.byteLength(JSON.stringify({
    heterogeneousOperationReceipt: engagement,
    operationEvidence: operation.operationEvidence,
    runtimeOwnerEvidence: runtimeOwner,
  }));
  assert.ok(
    rawEvidenceBytes < BENCHMARK_RESOURCE_LIMIT.ARTIFACT_BYTES,
    `${receipt.sideId} raw evidence is ${rawEvidenceBytes} bytes`,
  );
  return {
    engagement,
    operationEvidence: operation.operationEvidence,
    runtimeOwner,
  };
}

export function createBenchmarkCapacityHeterogeneousEvidenceFixture({
  preregistration,
  report: sourceReport,
  lagrangeSideId,
}) {
  const report = structuredClone(sourceReport);
  const windowEvidence = [];
  let postgresqlReplay = null;
  for (let index = 0; index < report.windowReceipts.length; index += 1) {
    const receipt = report.windowReceipts[index];
    if (receipt.phase !== FIXTURE_VALUE.MEASURED) continue;
    const sample = arrayFind(
      report.rawSamples,
      (candidate) =>
        candidate.sampleDigest === receipt.capacitySampleDigest,
    );
    const evidence = heterogeneousEvidenceForWindow(
      preregistration,
      receipt,
      sample,
      lagrangeSideId,
    );
    const boundReceipt = createBenchmarkCapacityWindowReceipt({
      blockIndex: receipt.blockIndex,
      blockedOrderIndex: receipt.blockedOrderIndex,
      sideId: receipt.sideId,
      phase: receipt.phase,
      offeredLoad: receipt.offeredLoad,
      startedAt: receipt.startedAt,
      endedAt: receipt.endedAt,
      capacitySampleDigest: receipt.capacitySampleDigest,
      semanticReceiptDigest: receipt.semanticReceiptDigest,
      liveEngagementDigest: evidence.engagement.receiptDigest,
      resourceWindowDigest: null,
    }, sample, preregistration);
    report.windowReceipts[index] = boundReceipt;
    const c3 = {
      receipt: boundReceipt,
      sample,
      engagement: evidence.engagement,
      adapterEvidence: {
        operationEvidence: evidence.operationEvidence,
        encodedOperationEvidence:
          encodeBenchmarkCapacityHeterogeneousOperationEvidence(
            evidence.operationEvidence,
            evidence.engagement.adapterIdentity.runtimeKind,
          ),
        runtimeOwnerEvidence: evidence.runtimeOwner,
      },
    };
    windowEvidence.push(c3);
    if (
      receipt.sideId !== lagrangeSideId &&
      postgresqlReplay === null
    ) {
      postgresqlReplay = {
        preregistration,
        sample,
        engagement: evidence.engagement,
        operationEvidence: evidence.operationEvidence,
        runtimeOwner: evidence.runtimeOwner,
      };
    }
  }
  delete report.reportDigest;
  report.reportDigest = digestBenchmarkSemanticData(report);
  return {report, windowEvidence, postgresqlReplay};
}
