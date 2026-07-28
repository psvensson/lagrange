import assert from 'node:assert/strict';
import test from 'node:test';

import {
  digestBenchmarkSemanticData,
} from '../distributed/harness/benchmark-semantic-integrity.js';
import {
  createMovielensLagrangeCapacityAdapter,
  createMovielensPostgresqlCapacityAdapter,
  movielensCapacityOperationManifest,
  movielensCapacityOperationManifestDigest,
  movielensCapacitySemanticOracleDigest,
} from '../../examples/service-data-affinity/movielens-capacity-runtime-adapters.js';
import {
  replacePrototypeProperty,
} from '../helpers/hostile-intrinsics.js';

const TOP_MOVIES = Object.freeze(
  Array.from({length: 10}, (_, index) => Object.freeze({
    avgRating: 5 - index / 10,
    movieId: index + 1,
    ratingCount: 100 - index,
    score: 5 - index / 10,
  })),
);
const ALTERNATIVE = Object.freeze({topMovies: TOP_MOVIES});
const DATASET = Object.freeze({
  cardinality: 10_000,
  digest: digestBenchmarkSemanticData({dataset: 'movielens-10k'}),
  source: 'fixture',
});
const POSTGRESQL_QUERY_SQL = 'SELECT grouped_reduce FROM ratings';
const COUNTS = Object.freeze({
  offered: 1,
  dispatched: 1,
  correct: 1,
  rejected: 0,
  timedOut: 0,
  errored: 0,
  queueOverflow: 0,
  undispatched: 0,
  cancelled: 0,
});
const REJECTED = Object.freeze({
  queueFull: 0,
  flowControl: 0,
  admission: 0,
});
const stringSlice = Function.call.bind(String.prototype.slice);

function digestHex(value) {
  return stringSlice(digestBenchmarkSemanticData(value), 7);
}

function expectedRanking() {
  return TOP_MOVIES.map((row, index) => ({
    movieId: row.movieId,
    rank: index + 1,
    scoreMicros: Math.trunc(row.score * 1_000_000),
  }));
}

function coordinate(sideId) {
  return {
    blockIndex: 0,
    blockedOrderIndex: 0,
    sideId,
    offeredLoadPerSecond: 1,
    phase: 'measured',
  };
}

function lagrangeSession(semanticOracleDigest) {
  const executableDigest = digestBenchmarkSemanticData({wasm: 'fixture'});
  return {
    alternative: ALTERNATIVE,
    artifact: {executableDigest},
    dataset: DATASET,
    prepared: {
      deployment: {
        binding: {name: 'movielens-public-grouped-reduce'},
        manifest: {runtime: {kind: 'wasm_component'}},
        readyCell: {
          bindingVersionId: 'binding-version-v1',
          serviceId: 'service-v1',
        },
      },
      async executeCapacityOperation({idempotencyKey, operationId}) {
        const tenantId = 'public';
        const body = {
          datasetDigest: DATASET.digest,
          resultKeyOffset: 0,
          workloadVersion: 'movielens-public-request-workload-v1',
        };
        const normalizedRequest = {
          body,
          headers: {
            'accept': '*/*',
            'content-type': 'application/json',
          },
          method: 'POST',
          path: '/benchmarks/movielens/grouped-reduce',
          query: {},
        };
        const invocationIdentity =
          `request-invocation-${digestHex({
            requestKey: idempotencyKey,
            tenantId,
          })}`;
        const requestDigest =
          digestBenchmarkSemanticData(normalizedRequest);
        const intentDigest = digestBenchmarkSemanticData({
          bindingVersionId: 'binding-version-v1',
          method: normalizedRequest.method,
          path: normalizedRequest.path,
          requestDigest,
          tenantId,
        });
        const journalOperationId =
          `request-cell-operation-${digestHex([
            tenantId,
            invocationIdentity,
          ])}`;
        const journalCommand = `invoke:service-v1:${intentDigest}`;
        const ranking = expectedRanking();
        return {
          oracle: {
            expected: ranking,
            observed: ranking,
            passed: true,
            version: 'confidence-adjusted-top-ten-v1',
          },
          response: {
            status: 200,
            requestWitness: {
              bindingVersionId: 'binding-version-v1',
              body: JSON.stringify(body),
              idempotencyKey,
              intentDigest,
              invocationIdentity,
              journalCommand,
              journalOperationId,
              method: normalizedRequest.method,
              normalizedRequest,
              path: normalizedRequest.path,
              requestDigest,
              routeServiceId: 'service-v1',
              tenantId,
            },
          },
          invocationJournal: {
            command: journalCommand,
            created_at: '2026-07-28T00:00:00.000Z',
            error: '{}',
            idempotency_key: invocationIdentity,
            operation_id: journalOperationId,
            result: JSON.stringify(JSON.stringify({
              body: 'MovieLens grouped reduce completed',
              headers: [[
                'x-lagrange-cell',
                'movielens-public-grouped-reduce',
              ]],
              status: 200,
            })),
            state: 'completed',
            tenant_id: tenantId,
            updated_at: '2026-07-28T00:00:00.001Z',
          },
          result: {
            movieRows: ranking.map((row) => ({
              key: row.rank,
              value: row.movieId,
            })),
            scoreRows: ranking.map((row) => ({
              key: row.rank,
              value: row.scoreMicros,
            })),
          },
          resultKeyOffset: 0,
          operationId,
        };
      },
      async resetRunState() {
        return {
          durableResultRows: 0,
          invocationJournalRows: 0,
          state: 'public_request_results_and_journal_cleared',
        };
      },
    },
    semanticOracleDigest,
  };
}

function postgresqlSession() {
  return {
    imageId: digestBenchmarkSemanticData({image: 'postgres:16'}),
    imageInspection: {
      repoDigests: ['postgres@sha256:fixture'],
    },
    inputDigest: DATASET.digest,
    totalRows: DATASET.cardinality,
    postgresVersion: 'PostgreSQL 16.10',
    postgresVersionSql: 'SELECT version()',
    querySql: POSTGRESQL_QUERY_SQL,
    queryPlan: [{Plan: {'Node Type': 'Aggregate'}}],
    async executeGroupedReduce({requestId}) {
      const durableResultJson = JSON.stringify(TOP_MOVIES);
      return {
        backendPid: 123,
        durableInputRows: DATASET.cardinality,
        durableResultJson,
        durabilityDigest: digestBenchmarkSemanticData({requestId}),
        durabilityPassed: true,
        requestId,
        returnedAggregateRows: TOP_MOVIES.length,
        topMovies: TOP_MOVIES,
      };
    },
    async resetRunState() {
      return {
        inputDigest: DATASET.digest,
        rowCount: DATASET.cardinality,
        state: 'read_only_input_preserved',
      };
    },
  };
}

async function executeOne(adapter) {
  adapter.beginWindow(coordinate(adapter.adapterIdentity.sideId));
  assert.deepEqual(
    await adapter.executeOperation({operationIndex: 0, signal: null}),
    {status: 'correct'},
  );
  const semanticReceipt = adapter.finalizeSemanticReceipt({
    counts: COUNTS,
    rejectedByReason: REJECTED,
    correctOperationIndexes: [0],
  });
  return {
    semanticReceipt,
    completed: adapter.completeWindow(),
  };
}

test('Lagrange and PostgreSQL adapters join the same sealed MovieLens oracle', async () => {
  const semanticOracleDigest =
    movielensCapacitySemanticOracleDigest(ALTERNATIVE);
  const operationManifest =
    movielensCapacityOperationManifest(DATASET, POSTGRESQL_QUERY_SQL);
  const operationManifestDigest =
    movielensCapacityOperationManifestDigest(
      DATASET,
      POSTGRESQL_QUERY_SQL,
    );
  const lagrange = createMovielensLagrangeCapacityAdapter({
    session: lagrangeSession(semanticOracleDigest),
    sideId: 'lagrange',
    operationManifest,
    semanticOracleDigest,
  });
  const postgresql = createMovielensPostgresqlCapacityAdapter({
    session: postgresqlSession(),
    sideId: 'postgresql',
    operationManifest,
    semanticOracleDigest,
  });
  const candidate = await executeOne(lagrange);
  const alternative = await executeOne(postgresql);
  assert.equal(
    lagrange.adapterIdentity.operationManifestDigest,
    operationManifestDigest,
  );
  assert.equal(
    postgresql.adapterIdentity.operationManifestDigest,
    operationManifestDigest,
  );
  assert.equal(
    candidate.semanticReceipt.resultSet.digest,
    alternative.semanticReceipt.resultSet.digest,
  );
  assert.equal(
    candidate.completed.operationEvidence[0]
      .evidence.semanticOracleDigest,
    semanticOracleDigest,
  );
  assert.equal(
    alternative.completed.operationEvidence[0]
      .evidence.semanticOracleDigest,
    semanticOracleDigest,
  );
  assert.notEqual(
    lagrange.adapterIdentity.adapterIdentityDigest,
    postgresql.adapterIdentity.adapterIdentityDigest,
  );
});

test('adapter reset receipts are owner-derived and side-specific', async () => {
  const semanticOracleDigest =
    movielensCapacitySemanticOracleDigest(ALTERNATIVE);
  const operationManifest =
    movielensCapacityOperationManifest(DATASET, POSTGRESQL_QUERY_SQL);
  const adapter = createMovielensLagrangeCapacityAdapter({
    session: lagrangeSession(semanticOracleDigest),
    sideId: 'lagrange',
    operationManifest,
    semanticOracleDigest,
  });
  const receipt = await adapter.resetRunState(coordinate('lagrange'));
  assert.equal(receipt.sideId, 'lagrange');
  assert.match(receipt.resetDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(
    receipt.ownerReceipt.state,
    'public_request_results_and_journal_cleared',
  );
});

test('runtime adapter digest boundaries survive poisoned intrinsics', async () => {
  const semanticOracleDigest =
    movielensCapacitySemanticOracleDigest(ALTERNATIVE);
  const operationManifest =
    movielensCapacityOperationManifest(DATASET, POSTGRESQL_QUERY_SQL);
  const adapter = createMovielensLagrangeCapacityAdapter({
    session: lagrangeSession(semanticOracleDigest),
    sideId: 'lagrange',
    operationManifest,
    semanticOracleDigest,
  });
  const poison = (name) => () => {
    throw new Error(`poisoned ${name}`);
  };
  const restores = [
    replacePrototypeProperty(
      String.prototype,
      'slice',
      poison('String.prototype.slice'),
    ),
    replacePrototypeProperty(
      Number,
      'parseInt',
      poison('Number.parseInt'),
    ),
  ];
  let completed;
  try {
    completed = await executeOne(adapter);
  } finally {
    for (let index = restores.length - 1; index >= 0; index -= 1) {
      restores[index]();
    }
  }
  assert.equal(completed.completed.operationEvidence.length, 1);
});
