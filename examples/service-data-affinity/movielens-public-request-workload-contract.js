import {
  BUDGETS as REQUEST_BINDING_EXAMPLE_BUDGETS,
  buildBindingPayload,
  buildComponent,
  buildInstallPayload,
  buildManifest,
} from '../request-binding-deployment/request-binding-example-contract.js';
import {
  BENCHMARK_DURABILITY_CONTRACT,
} from '../../test/distributed/harness/benchmark-workload-semantics-constants.js';
import {
  appendOwnArrayValue,
  isDenseDataArray,
  isMissingDataValue,
  isNonNegativeSafeInteger,
  isNonNegativeSafeNumber,
  isPlainDataRecord,
  isSha256Digest,
  ownDataValue,
} from '../../test/distributed/harness/benchmark-semantic-integrity.js';

const MOVIELENS_PUBLIC_REQUEST_WORKLOAD_VERSION =
  'movielens-public-request-workload-v1';
const MOVIELENS_PUBLIC_REQUEST_RESULT_ORACLE =
  'confidence-adjusted-top-ten-v1';
const MOVIELENS_PUBLIC_REQUEST_ALTERNATIVE =
  'postgresql-16-grouped-sql';
const MOVIELENS_PUBLIC_REQUEST_RESPONSE_BODY =
  'MovieLens grouped reduce completed';
const MOVIELENS_PUBLIC_REQUEST_RESPONSE_HEADER = 'x-lagrange-cell';
const MOVIELENS_PUBLIC_REQUEST_SCORE_SCALE = 1_000_000;
const MOVIELENS_PUBLIC_REQUEST_TOP_N = 10;
const MOVIELENS_PUBLIC_REQUEST_MAX_MOVIE_ID = 2_047;
const MOVIELENS_PUBLIC_REQUEST_TABLE = Object.freeze({
  RATINGS: 'global.movielens_public_ratings',
  RESULT_MOVIES: 'global.movielens_public_result_movies',
  RESULT_SCORES: 'global.movielens_public_result_scores',
});
const MOVIELENS_PUBLIC_REQUEST = Object.freeze({
  BINDING_NAME: 'movielens-public-grouped-reduce',
  COMPONENT_EXPORT: 'run',
  COMPONENT_FILE: 'movielens-public-grouped-reduce.wasm',
  COMPONENT_SOURCE_FILE: 'movielens-public-grouped-reduce-component.wat',
  IDEMPOTENCY_KEY: 'install-movielens-public-grouped-reduce-v1',
  METHOD: 'POST',
  PATH: '/benchmarks/movielens/grouped-reduce',
  PLATFORM: 'linux/amd64',
  SERVICE_NAME: 'movielens-public-grouped-reduce',
  SOURCE_DATE_EPOCH: 1_700_000_000,
  VERSION: '1.0.0',
});
const MOVIELENS_PUBLIC_REQUEST_BUDGETS = Object.freeze({
  ...REQUEST_BINDING_EXAMPLE_BUDGETS,
  context_bytes: 16 * 1_024 * 1_024,
  cpu_time_ms: 60_000,
  input_bytes: 4_096,
  memory_bytes: 64 * 1_024 * 1_024,
  output_bytes: 4_096,
  wall_time_ms: 60_000,
});
const MOVIELENS_PUBLIC_REQUEST_ACCESS = Object.freeze([
  Object.freeze({
    operations: Object.freeze(['read']),
    slot: 0,
    table: `table:${MOVIELENS_PUBLIC_REQUEST_TABLE.RATINGS}`,
  }),
  Object.freeze({
    operations: Object.freeze(['write']),
    slot: 1,
    table: `table:${MOVIELENS_PUBLIC_REQUEST_TABLE.RESULT_MOVIES}`,
  }),
  Object.freeze({
    operations: Object.freeze(['write']),
    slot: 2,
    table: `table:${MOVIELENS_PUBLIC_REQUEST_TABLE.RESULT_SCORES}`,
  }),
]);

function buildMovielensPublicRequestComponent(paths) {
  return buildComponent(paths, MOVIELENS_PUBLIC_REQUEST);
}

function buildMovielensPublicRequestManifest(receipt) {
  return buildManifest(receipt, MOVIELENS_PUBLIC_REQUEST);
}

function buildMovielensPublicRequestInstallPayload(manifest, receipt) {
  return buildInstallPayload(
    manifest,
    receipt,
    MOVIELENS_PUBLIC_REQUEST,
  );
}

function buildMovielensPublicRequestBinding(packageId, manifest) {
  return buildBindingPayload(
    packageId,
    manifest,
    MOVIELENS_PUBLIC_REQUEST,
    MOVIELENS_PUBLIC_REQUEST_BUDGETS,
  );
}

function buildMovielensPublicRequestAccessPayload() {
  return {
    binding_name: MOVIELENS_PUBLIC_REQUEST.BINDING_NAME,
    schema_version: 1,
    tables: MOVIELENS_PUBLIC_REQUEST_ACCESS.map((table) => ({
      operations: [...table.operations],
      slot: table.slot,
      table: table.table,
    })),
  };
}

function scoreMicros(score) {
  if (!isNonNegativeSafeNumber(score)) {
    throw new TypeError('MovieLens score must be a non-negative number');
  }
  return Math.trunc(score * MOVIELENS_PUBLIC_REQUEST_SCORE_SCALE);
}

function requiredRowNumber(row, primaryKey, fallbackKey) {
  if (!isPlainDataRecord(row)) {
    throw new TypeError('MovieLens ranking row must be a plain data record');
  }
  const primary = ownDataValue(row, primaryKey);
  const value = isMissingDataValue(primary) ?
    ownDataValue(row, fallbackKey) :
    primary;
  if (isMissingDataValue(value) || typeof value !== 'number') {
    throw new TypeError(`MovieLens ranking ${primaryKey} must be numeric`);
  }
  return value;
}

function expectedRankingFromAlternative(alternative) {
  const topMovies = isPlainDataRecord(alternative) ?
    ownDataValue(alternative, 'topMovies') :
    null;
  if (
    !isDenseDataArray(topMovies) ||
    topMovies.length !== MOVIELENS_PUBLIC_REQUEST_TOP_N
  ) {
    throw new TypeError(
      'named alternative must provide exactly ten ranked MovieLens rows',
    );
  }
  const expected = [];
  for (let index = 0; index < topMovies.length; index += 1) {
    const row = ownDataValue(topMovies, String(index));
    const movieId = requiredRowNumber(row, 'movieId', 'movie_id');
    const score = requiredRowNumber(row, 'score', 'score');
    if (
      !isNonNegativeSafeInteger(movieId) ||
      movieId === 0 ||
      movieId > MOVIELENS_PUBLIC_REQUEST_MAX_MOVIE_ID
    ) {
      throw new TypeError('MovieLens ranking movieId is invalid');
    }
    appendOwnArrayValue(expected, {
      movieId,
      rank: index + 1,
      scoreMicros: scoreMicros(score),
    });
  }
  return expected;
}

function observedRankingFromRows(movieRows, scoreRows) {
  if (
    !isDenseDataArray(movieRows) ||
    !isDenseDataArray(scoreRows) ||
    movieRows.length !== MOVIELENS_PUBLIC_REQUEST_TOP_N ||
    scoreRows.length !== MOVIELENS_PUBLIC_REQUEST_TOP_N
  ) {
    throw new TypeError('public workload result rows are required');
  }
  const observed = new Array(MOVIELENS_PUBLIC_REQUEST_TOP_N);
  for (let index = 0; index < movieRows.length; index += 1) {
    const movieRow = ownDataValue(movieRows, String(index));
    const scoreRow = ownDataValue(scoreRows, String(index));
    const row = observedRankingRow(movieRow, scoreRow);
    if (observed[row.rank - 1] !== undefined) {
      throw new TypeError('public workload result row is invalid');
    }
    observed[row.rank - 1] = row;
  }
  return observed;
}

function observedRankingRow(movieRow, scoreRow) {
  const rank = requiredRowNumber(movieRow, 'key', 'key');
  const movieId = requiredRowNumber(movieRow, 'value', 'value');
  const scoreRank = requiredRowNumber(scoreRow, 'key', 'key');
  const scoreValue = requiredRowNumber(scoreRow, 'value', 'value');
  if (
    !isNonNegativeSafeInteger(rank) ||
    rank === 0 ||
    rank > MOVIELENS_PUBLIC_REQUEST_TOP_N ||
    rank !== scoreRank ||
    !isNonNegativeSafeInteger(movieId) ||
    movieId === 0 ||
    !isNonNegativeSafeInteger(scoreValue)
  ) {
    throw new TypeError('public workload result row is invalid');
  }
  return {
    movieId,
    rank,
    scoreMicros: scoreValue,
  };
}

function assertMovielensPublicRequestResult({
  alternative,
  movieRows,
  scoreRows,
}) {
  const expected = expectedRankingFromAlternative(alternative);
  const observed = observedRankingFromRows(movieRows, scoreRows);
  if (observed.length !== expected.length) {
    throw new Error(
      'MovieLens result cardinality mismatch: ' +
      `${observed.length} !== ${expected.length}`,
    );
  }
  for (let index = 0; index < expected.length; index += 1) {
    const expectedRow = expected[index];
    const observedRow = observed[index];
    if (
      observedRow.rank !== expectedRow.rank ||
      observedRow.movieId !== expectedRow.movieId ||
      observedRow.scoreMicros !== expectedRow.scoreMicros
    ) {
      throw new Error(
        `MovieLens result mismatch at rank ${expectedRow.rank}: ` +
        `${JSON.stringify(observedRow)} !== ${JSON.stringify(expectedRow)}`,
      );
    }
  }
  return Object.freeze({
    expected,
    observed,
    passed: true,
    version: MOVIELENS_PUBLIC_REQUEST_RESULT_ORACLE,
  });
}

function buildMovielensPublicWorkloadManifest(dataset) {
  const cardinality = isPlainDataRecord(dataset) ?
    ownDataValue(dataset, 'cardinality') :
    null;
  const digest = isPlainDataRecord(dataset) ?
    ownDataValue(dataset, 'digest') :
    null;
  const source = isPlainDataRecord(dataset) ?
    ownDataValue(dataset, 'source') :
    null;
  if (
    !isNonNegativeSafeInteger(cardinality) ||
    cardinality === 0 ||
    !isSha256Digest(digest) ||
    typeof source !== 'string' ||
    source.length === 0
  ) {
    throw new TypeError('canonical MovieLens dataset identity is required');
  }
  return Object.freeze({
    alternative: MOVIELENS_PUBLIC_REQUEST_ALTERNATIVE,
    consistency: 'statement_reads_committed_state',
    dataset: Object.freeze({
      cardinality,
      digest,
      source,
    }),
    durability: BENCHMARK_DURABILITY_CONTRACT,
    operationBoundary: Object.freeze({
      method: MOVIELENS_PUBLIC_REQUEST.METHOD,
      path: MOVIELENS_PUBLIC_REQUEST.PATH,
    }),
    resultOracle: MOVIELENS_PUBLIC_REQUEST_RESULT_ORACLE,
    version: MOVIELENS_PUBLIC_REQUEST_WORKLOAD_VERSION,
  });
}

export {
  MOVIELENS_PUBLIC_REQUEST,
  MOVIELENS_PUBLIC_REQUEST_ACCESS,
  MOVIELENS_PUBLIC_REQUEST_ALTERNATIVE,
  MOVIELENS_PUBLIC_REQUEST_BUDGETS,
  MOVIELENS_PUBLIC_REQUEST_MAX_MOVIE_ID,
  MOVIELENS_PUBLIC_REQUEST_RESPONSE_BODY,
  MOVIELENS_PUBLIC_REQUEST_RESPONSE_HEADER,
  MOVIELENS_PUBLIC_REQUEST_RESULT_ORACLE,
  MOVIELENS_PUBLIC_REQUEST_SCORE_SCALE,
  MOVIELENS_PUBLIC_REQUEST_TABLE,
  MOVIELENS_PUBLIC_REQUEST_TOP_N,
  MOVIELENS_PUBLIC_REQUEST_WORKLOAD_VERSION,
  assertMovielensPublicRequestResult,
  buildMovielensPublicRequestAccessPayload,
  buildMovielensPublicRequestBinding,
  buildMovielensPublicRequestComponent,
  buildMovielensPublicRequestInstallPayload,
  buildMovielensPublicRequestManifest,
  buildMovielensPublicWorkloadManifest,
  expectedRankingFromAlternative,
  observedRankingFromRows,
  scoreMicros,
};
