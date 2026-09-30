import {existsSync} from 'node:fs';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import {PassThrough} from 'node:stream';
import {once} from 'node:events';
import net from 'node:net';
import {mock} from 'node:test';
import WebSocket, {WebSocketServer} from 'ws';
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
import {isRetryableControlPlaneError} from
  '../../src/control-plane/control-plane-error-classification.js';
import {
  AdminWsClient,
} from '../../scripts/examples/admin-ws-client.js';
import * as adminClientOwner from '../../scripts/examples/admin-ws-client.js';
import {observeAdminOwner} from '../helpers/admin-owner-observation.js';
import {waitForAffinityDemoSchemaAdmission} from
  '../../examples/service-data-affinity/affinity-demo-preload-gate.js';

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

async function runCreateConfirmationResetScenario({outcomes, queryFor}) {
  const state = {clientsCreated: 0, clientsClosed: 0, nowMs: 0};
  const retryAttempts = Array.of();
  const result = await createRatingsTableWithRetry({
    target: 'ws://demo',
    clientFactory: () => {
      const outcome = outcomes[state.clientsCreated];
      state.clientsCreated += 1;
      return {
        query: async () => queryFor(outcome),
        close: async () => {
          state.clientsClosed += 1;
        },
      };
    },
    timeoutMs: 20000,
    now: () => state.nowMs,
    sleep: async (delayMs) => {
      state.nowMs += delayMs;
    },
    onRetry: ({attempt}) => {
      retryAttempts.push(attempt);
    },
  });
  return {result, retryAttempts, state};
}

test('MovieLens durable CREATE confirmation resets after a transport failure',
  async (t) => {
    const {result, retryAttempts, state} =
      await runCreateConfirmationResetScenario({
        outcomes: ['success', 'closed', 'success', 'success'],
        queryFor: (outcome) => {
          if (outcome === 'closed') {
            throw new Error('admin websocket closed during durable replay');
          }
          return READY_CREATE_RESULT;
        },
      });

    t.same(result, {
      attempts: 4,
      confirmations: 2,
      policy: RATINGS_TABLE_SPLIT_POLICY,
    });
    t.equal(state.clientsCreated, 4);
    t.equal(state.clientsClosed, 4,
      'the failed durable replay also closes its client');
    t.same(retryAttempts, [1, 2, 3],
      'a failure between successes resets stable confirmation');
    t.end();
  });

test('MovieLens durable CREATE retries a typed ambiguous admin timeout on ' +
  'fresh bounded sessions', async (t) => {
  const server = new WebSocketServer({host: '127.0.0.1', port: 0});
  let timeoutClient = null;
  let cleanup;
  const stop = () => cleanup ||= closeAdminFixture(timeoutClient, server, () => {
    for (const peer of server.clients) peer.terminate();
  });
  t.teardown(stop);
  await observeAdminOwner(once(server, 'listening'), 'durable response server listening');
  const serverAddress = server.address();
  const target = `ws://127.0.0.1:${serverAddress.port}`;
  let resolveRequest;
  const requestReceived = new Promise((resolve) => {
    resolveRequest = resolve;
  });

  let serverSocket = null;
  server.on('connection', (socket) => {
    serverSocket = socket;
    socket.once('message', (data) => {
      resolveRequest(JSON.parse(data.toString()));
    });
  });
  timeoutClient = new AdminWsClient({target, timeoutMs: 20});
  let timeoutError = null;
  let timedOutRequest = null;
  try {
    try {
      await observeAdminOwner(timeoutClient.query(CREATE_LAGRANGE_RATINGS_SQL),
        'real response timeout');
    } catch (error) {
      timeoutError = error;
    }
    timedOutRequest = await observeAdminOwner(requestReceived, 'timed-out request received');
    t.equal(timeoutError?.code, 'ADMIN_RESPONSE_TIMEOUT');
    t.equal(timeoutError?.deferRetry, true);
    t.equal(timeoutError?.queryId, timedOutRequest.queryId);
    t.equal(timeoutError?.timeoutMs, 20);
    t.equal(timedOutRequest.timeoutMs, 20,
      'the caller response deadline crosses the websocket owner boundary');
    t.equal(timeoutClient.pending.size, 0,
      'the real timer removes the expired request before rejecting');
    t.equal(isRetryableControlPlaneError(timeoutError), true,
      'the canonical retry owner receives the real typed timeout');

    const lateFrameObserved = once(timeoutClient.socket, 'message');
    serverSocket.send(JSON.stringify({
      type: 'query_result',
      queryId: timedOutRequest.queryId,
      results: [{contractState: OWNER_CONTRACT_STATE.READY}],
    }));
    await observeAdminOwner(lateFrameObserved, 'late frame observation');
    t.equal(timeoutClient.pending.size, 0,
      'a late result cannot resurrect or satisfy the expired attempt');
  } finally {
    await stop().catch((error) => t.fail('durable response fixture cleanup failed', {cause: error}));
  }

  t.ok(timeoutError instanceof Error,
    'the retry witness comes from the AdminWsClient timer seam');
  t.equal(timeoutError.deferRetry, true);

  const outcomes = [
    READY_CREATE_RESULT,
    timeoutError,
    READY_CREATE_RESULT,
    READY_CREATE_RESULT,
  ];
  const clientOptions = [];
  let clientsCreated = 0;
  let clientsClosed = 0;
  let nowMs = 0;
  const retryAttempts = [];
  const result = await createRatingsTableWithRetry({
    target: 'ws://demo',
    clientFactory: (_target, factoryOptions) => {
      const outcome = outcomes[clientsCreated];
      clientsCreated += 1;
      clientOptions.push(factoryOptions);
      return {
        query: async () => {
          if (outcome instanceof Error) {
            nowMs += 15000;
            throw outcome;
          }
          return outcome;
        },
        close: async () => {
          clientsClosed += 1;
        },
      };
    },
    timeoutMs: 50000,
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
    'every ambiguous or confirming attempt closes its fresh session');
  t.same(clientOptions, Array.from({length: 4}, () => ({timeoutMs: 15000})),
    'each attempt deadline is shorter than the non-resetting outer budget');
  t.same(retryAttempts, [1, 2, 3],
    'the timeout resets the first confirmation before two new READY results');
  t.ok(nowMs < 50000,
    'typed timeout replay and confirmations remain inside the outer budget');
  t.end();
});

test('AdminWsClient bounds a stalled websocket opening and releases it',
  async (t) => {
    const sockets = new Set();
    let connections = 0;
    const server = net.createServer((socket) => {
      connections += 1;
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    let client = null;
    let cleanup;
    const stop = () => cleanup ||= closeAdminFixture(client, server, () => {
      for (const peer of sockets) peer.destroy();
    });
    t.teardown(stop);
    server.listen(0, '127.0.0.1');
    await observeAdminOwner(once(server, 'listening'), 'stalled opening server listening');
    const serverAddress = server.address();
    const target = `ws://127.0.0.1:${serverAddress.port}`;
    client = new AdminWsClient({target, timeoutMs: 100});
    const startedAt = Date.now();
    let firstError = null;
    let secondError = null;
    try {
      try {
        await observeAdminOwner(client.connect(), 'first real opening timeout');
      } catch (error) {
        firstError = error;
      }
      const firstElapsedMs = Date.now() - startedAt;
      t.equal(firstError?.code, 'ADMIN_CONNECT_TIMEOUT');
      t.equal(firstError?.deferRetry, true);
      t.equal(firstError?.target, target);
      t.equal(firstError?.timeoutMs, 100);
      t.equal(isRetryableControlPlaneError(firstError), true,
        'the canonical retry owner accepts the typed opening timeout');
      t.ok(firstElapsedMs >= 100 && firstElapsedMs < 1000,
        'the stalled opening rejects inside a bounded real deadline');
      t.equal(client.socket, null, 'no opened socket is retained');
      t.equal(client.openingSocket, null, 'the opening socket is released');
      t.equal(client.socketReady, null, 'the opening promise is released');

      try {
        await observeAdminOwner(client.connect(), 'second real opening timeout');
      } catch (error) {
        secondError = error;
      }
      t.equal(secondError?.code, 'ADMIN_CONNECT_TIMEOUT');
      t.not(secondError, firstError, 'a later attempt owns a fresh timeout');
      t.equal(connections, 2, 'a later attempt opens a fresh TCP session');
      t.equal(client.openingSocket, null,
        'the repeated timeout also releases socket ownership');
    } finally {
      await stop().catch((error) => t.fail('stalled opening fixture cleanup failed', {cause: error}));
    }
  });

test('MovieLens durable CREATE does not replay a hard validation error',
  async (t) => {
    let clientsCreated = 0;
    let clientsClosed = 0;
    await t.rejects(
      createRatingsTableWithRetry({
        target: 'ws://demo',
        clientFactory: () => {
          clientsCreated += 1;
          return {
            query: async () => {
              throw new Error('ratings schema validation failed');
            },
            close: async () => {
              clientsClosed += 1;
            },
          };
        },
        onRetry: () => {
          throw new Error('hard validation must not enter retry delay');
        },
      }),
      /ratings schema validation failed/,
    );
    t.equal(clientsCreated, 1,
      'a non-retryable failure stops at the existing owner boundary');
    t.equal(clientsClosed, 1,
      'the terminal attempt still closes its admin session');
    t.end();
  });

test('MovieLens durable CREATE confirmation resets after typed pending',
  async (t) => {
    const {result, retryAttempts, state} =
      await runCreateConfirmationResetScenario({
        outcomes: [
          READY_CREATE_RESULT,
          PENDING_CREATE_RESULT,
          READY_CREATE_RESULT,
          READY_CREATE_RESULT,
        ],
        queryFor: (outcome) => outcome,
      });

    t.same(result, {
      attempts: 4,
      confirmations: 2,
      policy: RATINGS_TABLE_SPLIT_POLICY,
    });
    t.equal(state.clientsCreated, 4);
    t.equal(state.clientsClosed, 4);
    t.same(retryAttempts, [1, 2, 3],
      'pending resets the streak before two new ready outcomes');
    t.end();
  });

test('MovieLens durable CREATE confirmation exhausts at its time bound',
  async (t) => {
    let clientsCreated = 0;
    let clientsClosed = 0;
    let nowMs = 0;
    const attemptTimeouts = [];
    await t.rejects(
      createRatingsTableWithRetry({
        target: 'ws://demo',
        clientFactory: (_target, factoryOptions) => {
          const shouldFail = clientsCreated % 2 === 1;
          clientsCreated += 1;
          attemptTimeouts.push(factoryOptions.timeoutMs);
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
    t.equal(clientsCreated, 2,
      'the canonical owner creates no fresh client at its virtual deadline');
    t.equal(clientsClosed, 2);
    t.same(attemptTimeouts, [10000, 5000],
      'each fresh session is capped by the canonical remaining budget');
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
    t.equal(clientsCreated, 2,
      'pending-only replay creates no client after deadline exhaustion');
    t.equal(clientsClosed, 2);
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

// Real protocol peers own their sockets independently of the client under test.
// Cleanup does not rely on the client contract being correct in a red witness.
async function closeAdminFixture(client, server, disposePeers) {
  const closing = Promise.resolve().then(() => client?.close());
  disposePeers();
  const serverClosed = new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()));
  const results = await observeAdminOwner(Promise.allSettled([closing, serverClosed]),
    'client and server cleanup');
  const errors = results.filter((result) => result.status === 'rejected')
    .map((result) => result.reason);
  if (errors.length) throw new AggregateError(errors, 'Admin fixture cleanup failed');
}

async function createAdminLifetimeFixture(t) {
  const server = new WebSocketServer({host: '127.0.0.1', port: 0});
  let client = null;
  t.teardown(async () => {
    await closeAdminFixture(client, server, () => {
      for (const socket of server.clients) socket.terminate();
    });
  });
  await observeAdminOwner(once(server, 'listening'), 'server listening');
  client = new AdminWsClient({
    target: `ws://127.0.0.1:${server.address().port}`,
    timeoutMs: 100,
  });
  return {
    client,
    server,
    async connect() {
      const accepted = once(server, 'connection');
      const socket = await observeAdminOwner(client.connect(), 'client OPEN');
      const [peer] = await observeAdminOwner(accepted, 'peer accepted');
      return {socket, peer};
    },
  };
}

test('AdminWsClient refuses invalid lifetime budgets before acquiring sockets', (t) => {
  for (const timeoutMs of [Infinity, -Infinity, NaN, -1, 0.5, 2147483648, '100']) {
    t.throws(() => new AdminWsClient({timeoutMs}), {code: 'ADMIN_INVALID_TIMEOUT'});
  }
  const defaultClient = new AdminWsClient({timeoutMs: 0});
  t.equal(defaultClient.socket, null, 'legacy zero selects the default without allocating a socket');
  t.end();
});

test('AdminWsClient close is single-flight and observes actual socket close', async (t) => {
  const fixture = await createAdminLifetimeFixture(t);
  const {socket} = await fixture.connect();
  const first = fixture.client.close();
  const second = fixture.client.close();
  t.equal(first, second, 'concurrent close calls share the exact retirement promise');
  await observeAdminOwner(first, 'single-flight close');
  t.equal(socket.readyState, WebSocket.CLOSED,
    'successful cleanup certifies the owned socket is CLOSED, not merely CLOSING');
  t.equal(fixture.client.pending.size, 0);
});

test('AdminWsClient revalidates a mutable opening budget before generation acquisition', async (t) => {
  const fixture = await createAdminLifetimeFixture(t);
  for (const timeoutMs of [Infinity, -Infinity, NaN, -1, 0.5, 2147483648, '100']) {
    fixture.client.timeoutMs = timeoutMs;
    const connecting = fixture.client.connect().catch((error) => error);
    t.equal(fixture.client.openingSocket, null, 'invalid capture must not acquire a socket');
    const result = await observeAdminOwner(connecting, 'invalid mutable opening budget');
    t.equal(result?.code, 'ADMIN_INVALID_TIMEOUT');
    await observeAdminOwner(fixture.client.close(), 'invalid opening cleanup');
  }
});

test('AdminWsClient revalidates a mutable request budget before serialization and send', async (t) => {
  const fixture = await createAdminLifetimeFixture(t);
  const {peer, socket} = await fixture.connect();
  let sends = 0;
  let serialized = 0;
  let observedBudget;
  const send = socket.send.bind(socket);
  socket.send = (...args) => {
    sends += 1;
    return send(...args);
  };
  peer.on('message', (bytes) => {
    const request = JSON.parse(bytes.toString());
    observedBudget = request.timeoutMs;
    peer.send(JSON.stringify({type: 'query_result', queryId: request.queryId, rows: []}));
  });
  const params = {toJSON() {
    serialized += 1;
    return [];
  }};
  for (const timeoutMs of [Infinity, -Infinity, NaN, -1, 0.5, 2147483648, '100']) {
    fixture.client.timeoutMs = timeoutMs;
    const result = await observeAdminOwner(
      fixture.client.query('SELECT 1', params).catch((error) => error), 'invalid request budget');
    t.equal(result?.code, 'ADMIN_INVALID_TIMEOUT');
    t.equal(fixture.client.pending.size, 0);
  }
  t.equal(serialized, 0, 'rejected budget cannot execute caller serialization');
  t.equal(sends, 0, 'rejected budget cannot enter the transport');
  fixture.client.timeoutMs = 20;
  const result = await observeAdminOwner(fixture.client.query('SELECT 1', params), 'valid shrink');
  t.same(result.rows, []);
  t.equal(observedBudget, 20, 'a valid shrunken request budget remains supported');
  t.equal(sends, 1);
});

test('AdminWsClient close owns a connecting socket through actual close', async (t) => {
  const accepted = Promise.withResolvers();
  const peers = new Set();
  const server = net.createServer((socket) => {
    peers.add(socket);
    socket.on('error', () => undefined);
    accepted.resolve();
  });
  let client = null;
  t.teardown(async () => {
    await closeAdminFixture(client, server, () => {
      for (const peer of peers) peer.destroy();
    });
  });
  server.listen(0, '127.0.0.1');
  await observeAdminOwner(once(server, 'listening'), 'raw server listening');
  client = new AdminWsClient({
    target: `ws://127.0.0.1:${server.address().port}`,
    timeoutMs: 100,
  });
  const opening = client.connect().catch((error) => error);
  const socket = client.openingSocket;
  await observeAdminOwner(accepted.promise, 'raw TCP accepted');
  await observeAdminOwner(client.close(), 'CONNECTING close');
  t.equal(socket.readyState, WebSocket.CLOSED,
    'CONNECTING termination also waits for the close event');
  const error = await observeAdminOwner(opening, 'retired opening rejection');
  t.equal(error.code, 'ADMIN_CLIENT_CLOSED', 'opening is rejected by retirement authority');
  t.equal(client.socketReady, null);
});

test('AdminWsClient retired callbacks cannot reset or complete a fresh session', async (t) => {
  const fixture = await createAdminLifetimeFixture(t);
  const {socket: oldSocket} = await fixture.connect();
  const oldClose = oldSocket.listeners('close');
  const oldMessage = oldSocket.listeners('message');
  const closed = once(oldSocket, 'close');
  await observeAdminOwner(fixture.client.close(), 'old session close');
  await observeAdminOwner(closed, 'old CLOSE observation');
  const {socket, peer} = await fixture.connect();
  const requested = once(peer, 'message');
  let settled = false;
  const query = fixture.client.query('SELECT 1').then(
    (value) => {
      settled = true; return value;
    },
    (error) => {
      settled = true; return error;
    },
  );
  const [request] = await observeAdminOwner(requested, 'fresh request frame');
  const {queryId} = JSON.parse(request);
  const frame = {type: 'query_result', queryId, results: [{value: 'fresh'}]};
  const staleFrame = {...frame, results: [{value: 'retired'}]};
  for (const listener of oldMessage) {
    listener.call(oldSocket, Buffer.from(JSON.stringify(staleFrame)));
  }
  for (const listener of oldClose) listener.call(oldSocket);
  await Promise.resolve();
  t.equal(settled, false, 'stale frames and CLOSE cannot settle fresh pending work');
  t.equal(fixture.client.socket, socket, 'fresh connection remains authoritative');
  peer.send(JSON.stringify(frame));
  t.same(await observeAdminOwner(query, 'fresh response'), frame,
    'only the current socket completes its request');
});

test('AdminWsClient retires a physically closing socket without losing its close observation',
  async (t) => {
    const fixture = await createAdminLifetimeFixture(t);
    const {socket} = await fixture.connect();
    const held = holdCloseObservation(socket);
    t.teardown(held.release);
    fixture.server.on('connection', (peer) => peer.on('message', (data) => {
      const {queryId} = JSON.parse(data.toString());
      peer.send(JSON.stringify({type: 'query_result', queryId, value: 'fresh'}));
    }));
    socket.close();
    const result = await observeAdminOwner(
      fixture.client.query('SELECT 1').catch((error) => error), 'physical CLOSING successor query');
    t.equal(result.value, 'fresh', 'physical CLOSING is not reusable OPEN admission');
    await observeAdminOwner(held.observed, 'old physical CLOSE');
    const closing = fixture.client.close();
    held.release();
    const outcome = await observeAdminOwner(closing, 'both generations closed');
    t.equal(outcome.sockets.length, 2, 'old and new real connections stay owned through close');
  });

test('AdminWsClient retirement fences the post-connect request admission gap', async (t) => {
  const fixture = await createAdminLifetimeFixture(t);
  // The actual OPEN event is the explicit acquisition gate: retirement is
  // published by its synchronous observer before the awaiting request resumes.
  const request = fixture.client.query('SELECT 1').catch((error) => error);
  const socket = fixture.client.openingSocket;
  let sends = 0;
  const send = socket.send.bind(socket);
  socket.send = (...args) => {
    sends += 1; return send(...args);
  };
  let closing;
  socket.once('open', () => {
    closing = fixture.client.close();
  });
  const error = await observeAdminOwner(request, 'post-OPEN request rejection');
  await observeAdminOwner(closing, 'post-OPEN close');
  t.equal(sends, 0, 'resumed admitted caller cannot send on the retired socket');
  t.equal(error.code, 'ADMIN_CLIENT_CLOSED');
  t.equal(fixture.client.pending.size, 0, 'no response timer survives retirement');
});

test('AdminWsClient publishes retirement before synchronous socket callbacks', async (t) => {
  const fixture = await createAdminLifetimeFixture(t);
  const {socket} = await fixture.connect();
  const close = socket.close.bind(socket);
  let reentrant;
  socket.close = () => {
    socket.close = close;
    reentrant = fixture.client.close();
    return close();
  };
  const closing = fixture.client.close();
  t.equal(reentrant, closing, 'synchronous reentry observes the published owner promise');
  await observeAdminOwner(closing, 'reentrant close');
  t.equal(socket.readyState, WebSocket.CLOSED);
});

test('AdminWsClient serialization cannot send across synchronous retirement', async (t) => {
  const fixture = await createAdminLifetimeFixture(t);
  const {socket} = await fixture.connect();
  const send = socket.send.bind(socket);
  let sends = 0;
  let closing;
  socket.send = (...args) => {
    sends += 1;
    return send(...args);
  };
  const params = {toJSON() {
    closing = fixture.client.close();
    return [];
  }};
  const result = await observeAdminOwner(
    fixture.client.query('SELECT 1', params).catch((error) => error), 'serialization retirement');
  await observeAdminOwner(closing, 'serialization-triggered close');
  t.equal(result.code, 'ADMIN_CLIENT_CLOSED');
  t.equal(sends, 0, 'caller serialization runs before the final send admission fence');
  t.equal(fixture.client.pending.size, 0);
});

test('MovieLens client cleanup preserves an exact frozen primary query failure', async (t) => {
  const primary = Object.freeze(Object.assign(new Error('query participant failed'), {
    errorCode: 'PARTITION_ROUTING_FAILED',
    participantFailures: [{partitionId: 'ratings-p1'}],
  }));
  const cleanup = Object.assign(new Error('close incomplete'), {code: 'ADMIN_CLOSE_TIMEOUT'});
  let closes = 0;
  const result = await createRatingsTableWithRetry({
    target: 'ws://demo',
    clientFactory: () => ({
      query: async () => {
        throw primary;
      },
      close: async () => {
        closes += 1; throw cleanup;
      },
    }),
  }).catch((error) => error);
  t.equal(result, primary, 'cleanup must not replace the query owner error or its classification');
  t.equal(closes, 1, 'the failed operation still closes exactly once');
});

test('MovieLens incomplete cleanup vetoes retry before sleep or fresh client creation', async (t) => {
  const primary = Object.freeze(Object.assign(new Error('response incomplete'), {deferRetry: true}));
  const cleanup = Object.assign(new Error('close incomplete'), {code: 'ADMIN_CLOSE_TIMEOUT'});
  let now = 0;
  let clients = 0;
  let retries = 0;
  let sleeps = 0;
  const result = await createRatingsTableWithRetry({
    target: 'ws://demo', timeoutMs: 11000,
    now: () => now,
    sleep: async (delay) => {
      sleeps += 1; now += delay;
    },
    onRetry: () => {
      retries += 1;
    },
    clientFactory: () => {
      clients += 1;
      return {
        query: async () => {
          throw primary;
        },
        close: async () => {
          throw cleanup;
        },
      };
    },
  }).catch((error) => error);
  t.equal(result, primary);
  t.equal(primary.deferRetry, true, 'query classification is preserved, not mutated into a veto');
  t.equal(clients, 1);
  t.equal(retries, 0, 'cleanup authority is checked before the injected retry observer');
  t.equal(sleeps, 0);
});

test('AdminWsClient observes unresponsive peer disposal inside one close budget', async (t) => {
  const fixture = await createAdminLifetimeFixture(t);
  const {socket, peer} = await fixture.connect();
  // This is peer fault injection, not a client cleanup implementation. The
  // real peer cannot read/respond to the close frame while its TCP is paused.
  peer._socket.pause();
  fixture.client.timeoutMs = 1;
  const result = await observeAdminOwner(fixture.client.close(), 'unresponsive peer close');
  t.equal(result.outcome, 'closed');
  t.equal(socket.readyState, WebSocket.CLOSED);
  t.equal(result.sockets[0].code, 1006, 'observed abnormal code is retained without a force claim');
  t.equal(Object.isFrozen(result), true);
  t.equal(Object.isFrozen(result.sockets), true);
  t.equal(Object.isFrozen(result.sockets[0]), true);
  peer._socket.resume();
});

function holdCloseObservation(socket) {
  const observed = Promise.withResolvers();
  const emit = socket.emit;
  let closeArgs;
  socket.emit = function(event, ...args) {
    if (event === 'close') {
      closeArgs = args;
      observed.resolve();
      return true;
    }
    return emit.call(this, event, ...args);
  };
  return {
    observed: observed.promise,
    release() {
      socket.emit = emit;
      if (closeArgs) {
        const args = closeArgs;
        closeArgs = null;
        emit.call(socket, 'close', ...args);
      }
    },
  };
}

test('AdminWsClient explicit retirement has one hard-deadline timer owner', async (t) => {
  const fixture = await createAdminLifetimeFixture(t);
  await fixture.connect();
  mock.timers.enable({apis: ['Date'], now: Date.now()});
  const schedule = globalThis.setTimeout;
  const scheduled = [];
  globalThis.setTimeout = (callback, delay, ...args) => {
    scheduled.push(delay);
    return schedule(callback, delay, ...args);
  };
  try {
    await observeAdminOwner(fixture.client.close(), 'single hard-deadline close');
  } finally {
    globalThis.setTimeout = schedule;
    mock.timers.reset();
  }
  t.equal(scheduled.filter((delay) => delay === 100).length, 1,
    'global close owns the deadline; joined generations do not separately fire it');
});

test('AdminWsClient close timeout cannot veto later authoritative CLOSE', async (t) => {
  const fixture = await createAdminLifetimeFixture(t);
  const originalTarget = fixture.client.target;
  const {socket} = await fixture.connect();
  const held = holdCloseObservation(socket);
  t.teardown(held.release);
  mock.timers.enable({apis: ['setTimeout', 'Date'], now: Date.now()});
  t.teardown(() => mock.timers.reset());
  const failed = fixture.client.close().catch((error) => error);
  fixture.client.target = 'ws://future-target.invalid';
  await observeAdminOwner(held.observed, 'withheld physical CLOSE');
  mock.timers.tick(99);
  let settled = false;
  failed.then(() => {
    settled = true;
  });
  await Promise.resolve();
  t.equal(settled, false, 'observed completion, not physical socket state, owns release');
  mock.timers.tick(1);
  const error = await observeAdminOwner(failed, 'hard close deadline');
  t.equal(error.code, 'ADMIN_CLOSE_TIMEOUT');
  t.equal(error.timeoutMs, 100);
  t.equal(error.generations.length, 1);
  t.equal(error.target, originalTarget, 'deadline diagnostics retain the acquired endpoint');
  t.equal(error.generations[0].target, originalTarget);
  await t.rejects(observeAdminOwner(fixture.client.connect(), 'incomplete close admission veto'),
    {code: 'ADMIN_CLOSE_TIMEOUT'},
    'unresolved old generation is retained and fences new admission');
  held.release();
  const freshClose = await observeAdminOwner(fixture.client.close(), 'late CLOSE cleanup');
  t.equal(freshClose.outcome, 'closed', 'late CLOSE permits a fresh cleanup attempt');
  t.equal(await failed, error, 'the expired attempt stays rejected with its exact error');
  mock.timers.reset();
  fixture.client.target = originalTarget;
  const fresh = await fixture.connect();
  t.not(fresh.socket, socket, 'fresh connection becomes legal after observed old CLOSE');
});

test('AdminWsClient one close deadline retains every unresolved generation', async (t) => {
  const fixture = await createAdminLifetimeFixture(t);
  const firstTarget = fixture.client.target;
  const first = await fixture.connect();
  const firstHeld = holdCloseObservation(first.socket);
  t.teardown(firstHeld.release);
  first.socket.close();
  fixture.client.target = `${firstTarget}/second-generation`;
  const second = await fixture.connect();
  await observeAdminOwner(firstHeld.observed, 'first physical CLOSE');
  const secondHeld = holdCloseObservation(second.socket);
  t.teardown(secondHeld.release);
  mock.timers.enable({apis: ['setTimeout', 'Date'], now: Date.now()});
  t.teardown(() => mock.timers.reset());
  const closing = fixture.client.close();
  const failed = closing.catch((error) => error);
  await observeAdminOwner(secondHeld.observed, 'second physical CLOSE');
  mock.timers.tick(100);
  const error = await observeAdminOwner(failed, 'shared generation deadline');
  t.equal(error.code, 'ADMIN_CLOSE_TIMEOUT');
  t.same(error.generations.map((generation) => generation.generation), [1, 2],
    'one immutable deadline reports both still-owned generations');
  t.equal(error.target, null, 'a mixed-target retirement has no fabricated common endpoint');
  t.same(error.generations.map((generation) => generation.target),
    [firstTarget, `${firstTarget}/second-generation`]);
  firstHeld.release();
  const veto = await observeAdminOwner(fixture.client.connect().catch((failure) => failure),
    'partial late CLOSE admission veto');
  t.equal(veto, error, 'one late CLOSE cannot release another unresolved generation');
  secondHeld.release();
  const completed = await observeAdminOwner(fixture.client.close(), 'all late CLOSE observed');
  t.equal(completed.outcome, 'closed');
  t.equal(await failed, error, 'late completion never rewrites the expired attempt');
  mock.timers.reset();
  const fresh = await fixture.connect();
  t.not(fresh.socket, second.socket, 'only complete retirement permits fresh admission');
});

test('AdminWsClient automatic retirement timeout vetoes real preload degradation', async (t) => {
  const fixture = await createAdminLifetimeFixture(t);
  const {socket} = await fixture.connect();
  const held = holdCloseObservation(socket);
  t.teardown(held.release);
  mock.timers.enable({apis: ['setTimeout', 'Date'], now: Date.now()});
  t.teardown(() => mock.timers.reset());
  socket.close();
  await fixture.connect();
  await observeAdminOwner(held.observed, 'automatic old physical CLOSE');
  mock.timers.tick(100);
  const veto = await observeAdminOwner(fixture.client.connect().catch((error) => error),
    'automatic retirement admission veto');
  t.equal(veto.code, 'ADMIN_CLOSE_TIMEOUT');
  t.equal(adminClientOwner.getAdminCleanupFailure(veto), veto,
    'owner-produced timeout enters the same authority as composed cleanup');
  let now = 0;
  let queries = 0;
  let sleeps = 0;
  const result = await observeAdminOwner(waitForAffinityDemoSchemaAdmission({
    target: fixture.client.target, timeoutMs: 2, pollIntervalMs: 1, stableWindowMs: 1,
    now: () => now,
    sleep: async (delay) => {
      sleeps += 1; now += delay;
    },
    query: () => {
      queries += 1; return fixture.client.query('SELECT 1');
    },
  }).catch((error) => error), 'preload consumes automatic close failure');
  t.equal(result, veto, 'real preload owner cannot convert incomplete cleanup into a snapshot');
  t.equal(queries, 1);
  t.equal(sleeps, 0);
  let uploads = 0;
  let artifacts = 0;
  const catalog = await t.mockImport('../../scripts/examples/run-examples-catalog.js', {
    '../../scripts/examples/admin-ws-client.js': adminClientOwner,
    '../../scripts/examples/package-examples.js': {
      packageExamples: async () => [{id: 'first'}, {id: 'second'}],
    },
    '../../scripts/examples/example-execution.js': {
      uploadExample: (client) => {
        uploads += 1; return client.query('SELECT 1');
      },
      executeExample: async () => undefined,
    },
    'node:fs/promises': {...fsPromises, mkdir: async () => undefined, writeFile: async () => {
      artifacts += 1;
    }},
  });
  const catalogResult = await observeAdminOwner(catalog.runExamplesCatalog({
    client: fixture.client, failOnRequired: false,
  }).catch((error) => error), 'catalog consumes automatic close failure');
  t.equal(catalogResult, veto, 'catalog preserves the same real owner-produced cleanup veto');
  t.equal(uploads, 1, 'no second example is admitted');
  t.equal(artifacts, 0, 'incomplete cleanup cannot become a completed catalog artifact');
  held.release();
  mock.timers.reset();
  await observeAdminOwner(fixture.client.close(), 'automatic retirement final cleanup');
});

test('AdminWsClient private pending ownership survives snapshot mutation and settles once', async (t) => {
  const fixture = await createAdminLifetimeFixture(t);
  const {socket, peer} = await fixture.connect();
  const received = Promise.withResolvers();
  let requests = 0;
  peer.on('message', () => {
    requests += 1;
    if (requests === 2) received.resolve();
  });
  let rejected = 0;
  const pending = [fixture.client.query('SELECT 1'), fixture.client.query('SELECT 2')]
    .map((promise) => promise.catch((error) => {
      rejected += 1; return error;
    }));
  await observeAdminOwner(received.promise, 'both pending requests received');
  const snapshot = fixture.client.pending;
  snapshot.clear();
  t.equal(fixture.client.pending.size, 2, 'snapshot mutation cannot erase pending authority');
  await observeAdminOwner(fixture.client.close(), 'pending requests close');
  const errors = await observeAdminOwner(Promise.all(pending), 'pending rejections');
  t.equal(rejected, 2);
  t.equal(errors[0].code, 'ADMIN_CLIENT_CLOSED');
  t.equal(errors[0], errors[1], 'one retirement reason settles both requests');
  t.equal(fixture.client.pending.size, 0);
  t.equal(socket.listenerCount('message'), 0);
  t.equal(socket.listenerCount('error'), 0);
});

function trackFixtureTimers(t) {
  const scheduled = new Set();
  const schedule = globalThis.setTimeout;
  const cancel = globalThis.clearTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => {
    const timer = schedule(function(...values) {
      scheduled.delete(timer);
      return callback.apply(this, values);
    }, delay, ...args);
    scheduled.add(timer);
    return timer;
  };
  globalThis.clearTimeout = (timer) => {
    scheduled.delete(timer);
    return cancel(timer);
  };
  t.teardown(() => {
    globalThis.setTimeout = schedule;
    globalThis.clearTimeout = cancel;
  });
  return scheduled;
}

test('AdminWsClient repeated sessions retire listeners, requests and callback frames', async (t) => {
  const timers = trackFixtureTimers(t);
  const fixture = await createAdminLifetimeFixture(t);
  for (let index = 0; index < 8; index += 1) {
    const {socket, peer} = await fixture.connect();
    peer.once('message', (data) => {
      const request = JSON.parse(data.toString());
      peer.send(JSON.stringify({type: 'query_result', queryId: request.queryId, value: index}));
    });
    const result = await observeAdminOwner(fixture.client.partitionCallback({
      statement: 'SELECT 1', callbackModuleRef: 'module', callbackExport: 'run',
      runtimeKind: 'native_js',
    }), 'repeated callback response');
    t.equal(result.value, index);
    const closed = await observeAdminOwner(fixture.client.close(), 'repeated session close');
    t.equal(closed.sockets.length, 1, 'only this generation remains in the owned set');
    t.equal(fixture.client.pending.size, 0);
    t.equal(socket.listenerCount('open') + socket.listenerCount('message') +
      socket.listenerCount('close') + socket.listenerCount('error'), 0);
    t.equal(timers.size, 0, 'opening, response, handshake and close deadlines are all retired');
  }
});

test('MovieLens batch failure closes its long-lived client and unfinished input', async (t) => {
  const input = new PassThrough();
  t.teardown(() => input.destroy());
  const primary = new Error('batch query failed');
  const clients = [];
  class Client {
    constructor() {
      this.closed = false;
      clients.push(this);
    }
    async query(sql) {
      if (sql === CREATE_LAGRANGE_RATINGS_SQL) return READY_CREATE_RESULT;
      throw primary;
    }
    async close() {
      this.closed = true;
    }
  }
  const loader = await t.mockImport('../../examples/service-data-affinity/lagrange-loader.js', {
    'node:fs': {...fs, createReadStream: () => input},
    'node:fs/promises': {...fsPromises, stat: async () => ({size: 1})},
    '../../scripts/examples/admin-ws-client.js': {...adminClientOwner, AdminWsClient: Client},
    '../../src/bootstrap/shared/retryable-control-plane-write.js': {
      // This witness owns the batch session, not the separately tested schema
      // retry cadence. Preserve both real READY confirmations without a sleep.
      runRetryableControlPlaneWrite: async (executor) => {
        await executor();
        return executor();
      },
    },
  });
  input.write('1\t1\t5\t100\n'.repeat(500));
  const result = await observeAdminOwner(
    loader.loadRatingsIntoLagrange({target: 'ws://fixture'}).catch((error) => error),
    'batch failure input retirement');
  t.equal(result, primary);
  t.equal(clients.length, 3, 'two schema sessions precede one batch session');
  t.equal(clients.every((client) => client.closed), true);
  t.equal(input.destroyed, true, 'early iterator return also releases the owned input');
  t.equal(input.closed, true, 'native input close is observed before the load rejects');
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
