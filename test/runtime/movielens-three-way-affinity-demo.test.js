import {existsSync} from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';
import {
  computeReduction,
  SqlQueryLoopRuntimeModule,
} from '../../src/runtime/sql-query-loop-runtime-module.js';
import {PREPARE_STATUS} from '../../src/runtime/runtime-driver.js';
import {
  QUALITY_RANKING,
  aggregateRatings,
  confidenceAdjustedScore,
  rankMovieQuality,
} from '../../examples/service-data-affinity/movie-ranking.js';
import {
  buildComparison,
  rankingsEqual,
} from '../../examples/service-data-affinity/run-comparison.js';
import {
  buildBaselineConfig,
  buildPsqlCommand,
} from '../../examples/service-data-affinity/run-postgres-baseline.js';
import {
  RATINGS_TABLE_SPLIT_POLICY,
  CREATE_LAGRANGE_RATINGS_SQL,
  createRatingsTableWithRetry,
} from '../../examples/service-data-affinity/lagrange-loader.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../src/control-plane/owner-contract-outcome.js';

const READY_CREATE_RESULT = Object.freeze({
  contractState: OWNER_CONTRACT_STATE.READY,
  nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
});
const PENDING_CREATE_RESULT = Object.freeze({
  contractState: OWNER_CONTRACT_STATE.PENDING,
  nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
  retryAfterMs: 5000,
});

const RAW_RATINGS = [
  {movie_id: 1, rating: 5},
  {movie_id: 2, rating: 4},
  {movie_id: 2, rating: 5},
  {movie_id: 2, rating: 5},
  {movie_id: 3, rating: 4},
  {movie_id: 3, rating: 4},
];

test('confidence-adjusted ranking rewards supported quality rather than ' +
  'a single five-star vote', (t) => {
  const singleVote = confidenceAdjustedScore(5, 1);
  const supported = confidenceAdjustedScore(14 / 3, 3);
  t.ok(supported > singleVote,
    'Bayesian support and confidence penalty defeat the one-vote winner');

  const ranking = rankMovieQuality(aggregateRatings(RAW_RATINGS));
  t.equal(ranking[0].movieId, 2,
    'the shared PostgreSQL/Lagrange SQL projection uses the richer score');
  t.end();
});

test('replica reduction implements the exact shared ranking formula', (t) => {
  const serviceRows = computeReduction(RAW_RATINGS, {
    groupBy: 'movie_id',
    aggregate: 'confidence_adjusted_avg',
    valueColumn: 'rating',
    limit: 3,
    ...QUALITY_RANKING,
  });
  const reference = rankMovieQuality(aggregateRatings(RAW_RATINGS), 3);
  t.same(serviceRows.map((row) => row.groupKey),
    reference.map((row) => row.movieId),
    'service replicas and grouped-SQL paths produce the same order');
  for (let index = 0; index < reference.length; index += 1) {
    t.ok(Math.abs(serviceRows[index].aggValue - reference[index].score) < 1e-12,
      `rank ${index + 1} score is identical`);
  }
  t.end();
});

test('service and grouped-SQL ranking share the movie-id tie-break', (t) => {
  const tiedRatings = [
    ...[3, 3, 4, 4].map((rating) => ({movie_id: 1, rating})),
    ...[
      ...Array(20).fill(3),
      ...Array(5).fill(4),
    ].map((rating) => ({movie_id: 2, rating})),
  ];
  const service = computeReduction(tiedRatings, {
    groupBy: 'movie_id',
    aggregate: 'confidence_adjusted_avg',
    valueColumn: 'rating',
    limit: 2,
    ...QUALITY_RANKING,
  });
  const reference = rankMovieQuality(aggregateRatings(tiedRatings), 2);
  t.equal(service[0].aggValue, service[1].aggValue,
    'fixture reaches the exact-score tie');
  t.same(service.map((row) => row.groupKey), [1, 2]);
  t.same(reference.map((row) => row.movieId), [1, 2],
    'shared movie-id order cannot diverge at the top-N boundary');
  t.end();
});

test('confidence-adjusted runtime config is explicit and validated', async (t) => {
  const module = new SqlQueryLoopRuntimeModule();
  const definitionFor = (reduce) => ({
    serviceId: 'svc-quality',
    runtime_config: JSON.stringify({
      sql: 'SELECT movie_id, rating FROM ratings',
      reduce: {
        groupBy: 'movie_id',
        aggregate: 'confidence_adjusted_avg',
        valueColumn: 'rating',
        limit: 10,
        ...reduce,
      },
    }),
  });
  const missingPolicy = await module.prepare(definitionFor({}));
  t.equal(missingPolicy.status, PREPARE_STATUS.FAILED,
    'implicit ranking priors are rejected');
  const explicitPolicy = await module.prepare(
    definitionFor(QUALITY_RANKING),
  );
  t.equal(explicitPolicy.status, PREPARE_STATUS.READY,
    'the documented ranking policy is accepted');
  t.end();
});

test('three-way report compares correctness and transfer shape without a ' +
  'misleading speedup', (t) => {
  const ranking = rankMovieQuality(aggregateRatings(RAW_RATINGS), 3);
  const comparison = buildComparison({
    queryDurationMs: 12,
    returnedAggregateRows: 3,
    topMovies: ranking,
  }, {
    ranking: ranking.map(({movieId, score}) => ({movieId, score})),
    lagrangeDistributedSql: {
      inputRatings: RAW_RATINGS.length,
      returnedAggregateRows: 3,
      elapsedMs: 10,
    },
    parallelReduce: {replicas: 2, mergeCandidates: 6},
    learnedAffinity: {placementOptimal: true},
  });
  t.equal(comparison.resultsIdentical, true);
  t.equal(comparison.interpretation.latencyComparable, false,
    'the report refuses an apples-to-oranges speedup ratio');
  t.equal(comparison.lagrangeReplicatedService.mergeCandidates, 6,
    'bounded service exchange is explicit');
  t.ok(rankingsEqual(ranking, ranking));
  t.end();
});

test('PostgreSQL baseline fails closed on replica readiness and emits ' +
  'machine-parseable status SQL', (t) => {
  const config = buildBaselineConfig();
  t.equal(config.allowReplicationTimeout, false,
    'a claimed three-node baseline cannot silently run primary-only');
  const command = buildPsqlCommand({sql: 'SELECT count(*)'});
  t.match(command, / -t -A /,
    'tuples-only unaligned output makes replica counts parseable');
  t.end();
});

test('Lagrange loader confirms one atomic ratings policy through durable CREATE',
  async (t) => {
    let queries = 0;
    let closes = 0;
    let nowMs = 0;
    const retryAttempts = Array.of();
    const sleepDelays = [];
    const result = await createRatingsTableWithRetry({
      target: 'ws://demo',
      clientFactory: () => ({
        query: async () => {
          queries += 1;
          return READY_CREATE_RESULT;
        },
        close: async () => {
          closes += 1;
        },
      }),
      now: () => nowMs,
      sleep: async (delayMs) => {
        sleepDelays.push(delayMs);
        nowMs += delayMs;
      },
      onRetry: ({attempt}) => {
        retryAttempts.push(attempt);
      },
    });
    t.same(result, {
      attempts: 2,
      confirmations: 2,
      policy: RATINGS_TABLE_SPLIT_POLICY,
    });
    t.equal(queries, 2);
    t.equal(closes, 2,
      'each durable confirmation uses and closes a fresh admin session');
    t.same(retryAttempts, [1]);
    t.same(sleepDelays, [5000]);
    t.match(CREATE_LAGRANGE_RATINGS_SQL,
      /rating_id INTEGER PRIMARY KEY/,
      'the split-capable Lagrange table has one deterministic partition key');
    t.match(CREATE_LAGRANGE_RATINGS_SQL,
      /WITH \(split_storage_threshold = 1048576\)/,
      'the sparse teaching policy is part of the durable CREATE intent');
    t.notMatch(CREATE_LAGRANGE_RATINGS_SQL, /UPDATE tables|SELECT table_id/,
      'the loader cannot race CREATE with cache-backed policy SQL');
    t.end();
  });

test('MovieLens durable CREATE confirmation resets after a transport failure',
  async (t) => {
    const outcomes = ['success', 'closed', 'success', 'success'];
    let clientsCreated = 0;
    let clientsClosed = 0;
    let nowMs = 0;
    const retryAttempts = Array.of();
    const result = await createRatingsTableWithRetry({
      target: 'ws://demo',
      clientFactory: () => {
        const outcome = outcomes[clientsCreated];
        clientsCreated += 1;
        return {
          query: async () => {
            if (outcome === 'closed') {
              throw new Error('admin websocket closed during durable replay');
            }
            return READY_CREATE_RESULT;
          },
          close: async () => {
            clientsClosed += 1;
          },
        };
      },
      timeoutMs: 20000,
      now: () => nowMs,
      sleep: async (delayMs) => {
        nowMs += delayMs;
      },
      onRetry: ({attempt}) => {
        retryAttempts.push(attempt);
      },
    });

    t.same(result, {
      attempts: 4,
      confirmations: 2,
      policy: RATINGS_TABLE_SPLIT_POLICY,
    });
    t.equal(clientsCreated, 4);
    t.equal(clientsClosed, 4,
      'the failed durable replay also closes its client');
    t.same(retryAttempts, [1, 2, 3],
      'a failure between successes resets stable confirmation');
    t.end();
  });

test('MovieLens durable CREATE confirmation resets after typed pending',
  async (t) => {
    const outcomes = [
      READY_CREATE_RESULT,
      PENDING_CREATE_RESULT,
      READY_CREATE_RESULT,
      READY_CREATE_RESULT,
    ];
    let clientsCreated = 0;
    let clientsClosed = 0;
    let nowMs = 0;
    const retryAttempts = Array.of();
    const result = await createRatingsTableWithRetry({
      target: 'ws://demo',
      clientFactory: () => {
        const outcome = outcomes[clientsCreated];
        clientsCreated += 1;
        return {
          query: async () => outcome,
          close: async () => {
            clientsClosed += 1;
          },
        };
      },
      timeoutMs: 20000,
      now: () => nowMs,
      sleep: async (delayMs) => {
        nowMs += delayMs;
      },
      onRetry: ({attempt}) => {
        retryAttempts.push(attempt);
      },
    });

    t.same(result, {
      attempts: 4,
      confirmations: 2,
      policy: RATINGS_TABLE_SPLIT_POLICY,
    });
    t.equal(clientsCreated, 4);
    t.equal(clientsClosed, 4);
    t.same(retryAttempts, [1, 2, 3],
      'pending resets the streak before two new ready outcomes');
    t.end();
  });

test('MovieLens durable CREATE confirmation exhausts at its time bound',
  async (t) => {
    let clientsCreated = 0;
    let clientsClosed = 0;
    let nowMs = 0;
    await t.rejects(
      createRatingsTableWithRetry({
        target: 'ws://demo',
        clientFactory: () => {
          const shouldFail = clientsCreated % 2 === 1;
          clientsCreated += 1;
          return {
            query: async () => {
              if (shouldFail) {
                throw new Error('admin websocket closed before replay');
              }
              return READY_CREATE_RESULT;
            },
            close: async () => {
              clientsClosed += 1;
            },
          };
        },
        timeoutMs: 10000,
        now: () => nowMs,
        sleep: async (delayMs) => {
          nowMs += delayMs;
        },
        onRetry: () => {},
      }),
      /stable durable confirmation/,
      'the terminal incomplete confirmation is surfaced loudly',
    );
    t.equal(clientsCreated, 3,
      'the canonical owner stops once the virtual deadline is reached');
    t.equal(clientsClosed, 3);
    t.end();
  });

test('MovieLens durable CREATE confirmation never counts typed pending',
  async (t) => {
    let clientsCreated = 0;
    let clientsClosed = 0;
    let nowMs = 0;
    await t.rejects(
      createRatingsTableWithRetry({
        target: 'ws://demo',
        clientFactory: () => {
          clientsCreated += 1;
          return {
            query: async () => PENDING_CREATE_RESULT,
            close: async () => {
              clientsClosed += 1;
            },
          };
        },
        timeoutMs: 10000,
        now: () => nowMs,
        sleep: async (delayMs) => {
          nowMs += delayMs;
        },
        onRetry: () => {},
      }),
      /stable durable confirmation/,
    );
    t.equal(clientsCreated, 3,
      'pending-only CREATE replays exhaust the canonical virtual deadline');
    t.equal(clientsClosed, 3);
    t.end();
  });

test('MovieLens durable CREATE confirmation fails closed without metadata',
  async (t) => {
    let closes = 0;
    await t.rejects(
      createRatingsTableWithRetry({
        target: 'ws://demo',
        clientFactory: () => ({
          query: async () => ({}),
          close: async () => {
            closes += 1;
          },
        }),
        onRetry: () => {},
      }),
      /stable durable confirmation/,
    );
    t.equal(closes, 1,
      'an untyped response closes its session and cannot be retried as ready');
    t.end();
  });

test('obsolete callback demo and orchestration are absent', (t) => {
  t.equal(existsSync(
    'examples/distributed-sql/07-movielens-access-affinity'), false);
  t.equal(existsSync('examples/movielens-access-affinity'), false);
  t.equal(existsSync(
    'examples/service-data-affinity/run-comparison.js'), true,
  'one surviving comparison entry point replaces both demos');
  t.end();
});
