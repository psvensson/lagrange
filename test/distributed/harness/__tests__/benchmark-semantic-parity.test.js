import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {tmpdir} from 'node:os';
import {
  LoadGenerator,
  computeMetrics,
} from '../load-generator.js';
import {
  BENCHMARK_SQL_DIALECT,
  assertBenchmarkOperationResult,
  buildBenchmarkOperationDescriptor,
  buildBenchmarkResultSetEvidence,
  buildBenchmarkSemanticReceipt,
  verifyBenchmarkAcknowledgedWrites,
} from '../benchmark-workload-semantics.js';
import {
  POSTGRES_BASELINE_COMPARISON_BASELINE_CACHE_AND_POLICY_BUNDLE,
} from '../../scenarios/postgres-baseline-comparison-baseline-cache-and-policy.js';
import {
  POSTGRES_BASELINE_COMPARISON_BENCHMARK_TABLE_LOAD_BUNDLE,
} from '../../scenarios/postgres-baseline-comparison-benchmark-table-load.js';

const ZERO = 0;
const TEST_DURATION_MS = 100;
const TEST_OPS_PER_SECOND = 10;
const TEST_SUCCESS_COUNT = 7;
const TEST_FAILED_COUNT = 3;
const TEST_DURATION_SECONDS = 1000;
const EXPECTED_CORRECT_OPS_PER_SECOND = 7;
const EXPECTED_ATTEMPTED_OPS_PER_SECOND = 10;
const CURRENT_CACHE_KEY_PREFIX = 'v4-';
const POSTGRES_DIALECT = 'postgresql';
const BENCHMARK_WORKLOAD_PROFILE = 'benchmark_events_mixed';
const BENCHMARK_SEMANTIC_CONTRACT_VERSION =
  'benchmark-semantic-parity-v1';
const CORRECT_THROUGHPUT_BASIS = 'correct_operations';
const TEST_TIMESTAMP = 1720000000000;
const TEST_EVENT_PREFIX = 'semantic-test-';
const PASS_STATUS = 'pass';
const defineTestProperty = Object.defineProperty;
const deleteTestProperty = Reflect.deleteProperty;

const {
  buildBaselineCacheIdentity,
  buildComparison,
  loadBaselineMetricsFromCache,
} = POSTGRES_BASELINE_COMPARISON_BASELINE_CACHE_AND_POLICY_BUNDLE;
const {
  runBaselineSharedLoad,
} = POSTGRES_BASELINE_COMPARISON_BENCHMARK_TABLE_LOAD_BUNDLE;

function buildRuntimeEvidence(operationCount, selectOutcome = ZERO) {
  const observations = [];
  for (let index = ZERO; index < operationCount; index += 1) {
    const isInsert = index % 2 === ZERO;
    observations.push({
      operationId: index,
      operation: isInsert ? 'INSERT' : 'SELECT',
      outcome: isInsert ? 'command_acknowledged' : selectOutcome,
    });
  }
  const acknowledgedWrites = Math.ceil(operationCount / 2);
  return {
    resultSet: buildBenchmarkResultSetEvidence(observations),
    accounting: {
      offered: operationCount,
      dispatched: operationCount,
      correct: operationCount,
      rejected: ZERO,
      timedOut: ZERO,
      errored: ZERO,
      queueOverflow: ZERO,
      undispatched: ZERO,
      cancelled: ZERO,
      rejectedByReason: {
        queueFull: ZERO,
        flowControl: ZERO,
        admission: ZERO,
      },
    },
    durability: {
      status: PASS_STATUS,
      expected: acknowledgedWrites,
      observed: acknowledgedWrites,
      missingIds: [],
      reason: null,
    },
  };
}

function buildCurrentReceipt(dialect, options = {}) {
  const operationCount = options.operationCount ?? 2;
  return buildBenchmarkSemanticReceipt({
    dialect,
    compiledOperations: operationCount,
    validatedOperations: operationCount,
    successfulOperations: operationCount,
    ...buildRuntimeEvidence(operationCount, options.selectOutcome ?? ZERO),
  });
}

test('PostgreSQL benchmark load compiles idempotent INSERT for PostgreSQL',
  async () => {
    const statements = [];
    const node = {
      id: 'postgres-semantic-target',
      async query(sql) {
        statements.push(String(sql));
        return {rows: []};
      },
    };
    const generator = new LoadGenerator([node], {
      opsPerSec: TEST_OPS_PER_SECOND,
      duration: TEST_DURATION_MS,
      operations: ['INSERT'],
      workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
      sqlDialect: POSTGRES_DIALECT,
      maxInFlight: 1,
      nodeMaxInFlight: 1,
    });
    const run = generator.start();
    try {
      await run.waitComplete();
    } finally {
      run.cancel();
    }

    assert.ok(statements.length > ZERO, 'expected a benchmark INSERT');
    assert.ok(
      statements.every((sql) => sql.includes('ON CONFLICT (event_id) DO NOTHING')),
      'PostgreSQL benchmark INSERTs must use PostgreSQL conflict syntax',
    );
    assert.ok(
      statements.every((sql) => !sql.includes('INSERT OR IGNORE')),
      'SQLite-only INSERT OR IGNORE must never reach PostgreSQL',
    );
  });

test('both dialects compile one shared semantic operation contract', () => {
  const commonOptions = {
    tableName: 'benchmark_events',
    eventIdPrefix: TEST_EVENT_PREFIX,
  };
  const sqlite = buildBenchmarkOperationDescriptor('INSERT', ZERO, {
    ...commonOptions,
    sqlDialect: BENCHMARK_SQL_DIALECT.SQLITE,
  });
  const postgres = buildBenchmarkOperationDescriptor('INSERT', ZERO, {
    ...commonOptions,
    sqlDialect: BENCHMARK_SQL_DIALECT.POSTGRESQL,
  });

  assert.deepEqual(sqlite.semanticOperation, postgres.semanticOperation);
  assert.match(sqlite.sql, /^INSERT OR IGNORE INTO benchmark_events/u);
  assert.match(postgres.sql, /^INSERT INTO benchmark_events/u);
  assert.match(postgres.sql, /ON CONFLICT \(event_id\) DO NOTHING$/u);
});

test('dialect compilation rejects exotic identifiers and escapes text values',
  () => {
    const escaped = buildBenchmarkOperationDescriptor('INSERT', ZERO, {
      tableName: 'benchmark_events',
      eventIdPrefix: 'quoted\'value-',
      timestamp: TEST_TIMESTAMP,
      sqlDialect: BENCHMARK_SQL_DIALECT.POSTGRESQL,
    });
    assert.match(escaped.sql, /quoted''value-0/u);
    assert.throws(
      () => buildBenchmarkOperationDescriptor('INSERT', ZERO, {
        tableName: 'benchmark_events; DROP TABLE benchmark_events',
        timestamp: TEST_TIMESTAMP,
        sqlDialect: BENCHMARK_SQL_DIALECT.POSTGRESQL,
      }),
      /invalid benchmark SQL identifier/u,
    );
    assert.throws(
      () => buildBenchmarkOperationDescriptor('INSERT', ZERO, {
        timestamp: TEST_TIMESTAMP,
        sqlDialect: Object(BENCHMARK_SQL_DIALECT.POSTGRESQL),
      }),
      /unsupported benchmark SQL dialect/u,
    );
  });

test('paired baseline runtime sends PostgreSQL SQL and emits a durability receipt',
  async () => {
    const statements = [];
    const events = new Map();
    const pool = {
      async query(sql) {
        const statement = String(sql);
        statements.push(statement);
        if (statement.startsWith('INSERT INTO benchmark_events ')) {
          const values = statement.match(
            /VALUES \('([^']+)', ([0-9]+), ([0-9]+)\)/u,
          );
          if (values) {
            events.set(values[1], {
              payload: Number(values[2]),
              createdAt: Number(values[3]),
            });
          }
          return {rows: [], rowCount: values ? 1 : ZERO};
        }
        if (statement.startsWith('SELECT count(*) AS matched_count')) {
          const predicate = statement.match(/WHERE payload = ([0-9]+)$/u);
          const expectedPayload = predicate ? Number(predicate[1]) : null;
          let matchedCount = ZERO;
          for (const event of events.values()) {
            if (event.payload === expectedPayload) matchedCount += 1;
          }
          return {rows: [{matched_count: String(matchedCount)}]};
        }
        if (statement.startsWith('SELECT event_id AS event_id')) {
          return {
            rows: [...events.keys()].map((eventId) => ({event_id: eventId})),
          };
        }
        throw new Error(`unexpected PostgreSQL semantic SQL: ${statement}`);
      },
    };

    const metrics = await runBaselineSharedLoad({
      pool,
      createLoadGenerator: (nodes, options) =>
        new LoadGenerator(nodes, options),
      loadNodeCount: 1,
      loadOpsPerSec: 20,
      loadDuration: TEST_DURATION_MS,
      loadMaxInFlight: 1,
      loadNodeMaxInFlight: 1,
      maxPendingQueueDepth: null,
      earlyRejectOnQueueFull: false,
      nodeFailureThreshold: 1,
      nodeFailureCooldownMs: 1,
      tableName: 'benchmark_events',
      onProgress: null,
      progressHeartbeatIntervalMs: TEST_DURATION_SECONDS,
      semanticParityEnabled: true,
    });

    assert.equal(metrics.semanticParity.status, PASS_STATUS);
    assert.equal(
      metrics.semanticParity.dimensions.durability,
      PASS_STATUS,
    );
    assert.ok(
      statements.some((sql) =>
        sql.includes('ON CONFLICT (event_id) DO NOTHING')),
    );
    assert.ok(statements.every((sql) => !sql.includes('INSERT OR IGNORE')));
  });

test('paired baseline runtime fails closed on a malformed successful result',
  async () => {
    const eventIds = new Set();
    const pool = {
      async query(sql) {
        const statement = String(sql);
        if (statement.startsWith('INSERT INTO benchmark_events ')) {
          const match = statement.match(/VALUES \('([^']+)'/u);
          if (match) eventIds.add(match[1]);
          return {rows: [], rowCount: match ? 1 : ZERO};
        }
        if (statement.startsWith('SELECT count(*) AS matched_count')) {
          return {rows: []};
        }
        if (statement.startsWith('SELECT event_id AS event_id')) {
          return {
            rows: [...eventIds].map((eventId) => ({event_id: eventId})),
          };
        }
        throw new Error(`unexpected PostgreSQL semantic SQL: ${statement}`);
      },
    };

    await assert.rejects(
      runBaselineSharedLoad({
        pool,
        createLoadGenerator: (nodes, options) =>
          new LoadGenerator(nodes, options),
        loadNodeCount: 1,
        loadOpsPerSec: 20,
        loadDuration: TEST_DURATION_MS,
        loadMaxInFlight: 1,
        loadNodeMaxInFlight: 1,
        maxPendingQueueDepth: null,
        earlyRejectOnQueueFull: false,
        nodeFailureThreshold: 1,
        nodeFailureCooldownMs: 1,
        tableName: 'benchmark_events',
        onProgress: null,
        progressHeartbeatIntervalMs: TEST_DURATION_SECONDS,
        semanticParityEnabled: true,
      }),
      /benchmark_semantic_parity_failed:semantic_oracle_failed/u,
    );
  });

test('result oracle accepts normalized counts and rejects malformed success',
  () => {
    const descriptor = buildBenchmarkOperationDescriptor('SELECT', ZERO, {
      sqlDialect: BENCHMARK_SQL_DIALECT.POSTGRESQL,
      timestamp: TEST_TIMESTAMP,
    });

    assert.deepEqual(
      assertBenchmarkOperationResult(descriptor, {
        rows: [{matched_count: '3'}],
      }).normalizedRows,
      [{matchedCount: 3}],
    );
    assert.throws(
      () => assertBenchmarkOperationResult(descriptor, {rows: []}),
      /one non-negative count row/u,
    );
  });

test('result oracle rejects inherited, boxed, unsafe, and negative-zero counts',
  () => {
    const descriptor = buildBenchmarkOperationDescriptor('SELECT', ZERO, {
      sqlDialect: BENCHMARK_SQL_DIALECT.POSTGRESQL,
      timestamp: TEST_TIMESTAMP,
    });
    const inheritedRow = Object.create({matched_count: '3'});
    for (const matchedCount of [
      Object(3),
      Number.MAX_SAFE_INTEGER + 1,
      -0,
    ]) {
      assert.throws(
        () => assertBenchmarkOperationResult(descriptor, {
          rows: [{matched_count: matchedCount}],
        }),
        /one non-negative count row/u,
      );
    }
    assert.throws(
      () => assertBenchmarkOperationResult(descriptor, {
        rows: [inheritedRow],
      }),
      /one non-negative count row/u,
    );
  });

test('result oracle rejects accessors without executing them', () => {
  const descriptor = buildBenchmarkOperationDescriptor('SELECT', ZERO, {
    sqlDialect: BENCHMARK_SQL_DIALECT.POSTGRESQL,
    timestamp: TEST_TIMESTAMP,
  });
  let rowsReads = ZERO;
  const result = {};
  Object.defineProperty(result, 'rows', {
    enumerable: true,
    get() {
      rowsReads += 1;
      return [{matched_count: ZERO}];
    },
  });

  assert.throws(
    () => assertBenchmarkOperationResult(descriptor, result),
    /one non-negative count row/u,
  );
  assert.equal(rowsReads, ZERO);
});

test('durability oracle verifies every acknowledged write', async () => {
  const ids = ['semantic-test-1', 'semantic-test-2'];
  const pass = await verifyBenchmarkAcknowledgedWrites({
    tableName: 'benchmark_events',
    ids,
    query: async () => ({
      rows: ids.map((eventId) => ({event_id: eventId})),
    }),
  });
  const fail = await verifyBenchmarkAcknowledgedWrites({
    tableName: 'benchmark_events',
    ids,
    query: async () => ({rows: [{event_id: ids[ZERO]}]}),
  });

  assert.equal(pass.status, PASS_STATUS);
  assert.deepEqual(pass.missingIds, []);
  assert.equal(fail.status, 'fail');
  assert.deepEqual(fail.missingIds, [ids[1]]);
});

test('durability oracle rejects iterator-controlled acknowledged IDs',
  async () => {
    const ids = ['semantic-test-1'];
    let iteratorRuns = ZERO;
    Object.defineProperty(ids, Symbol.iterator, {
      configurable: true,
      enumerable: false,
      value: function* hostileIterator() {
        iteratorRuns += 1;
        yield 'fabricated-id';
      },
    });

    await assert.rejects(
      verifyBenchmarkAcknowledgedWrites({
        tableName: 'benchmark_events',
        ids,
        query: async () => ({rows: [{event_id: 'fabricated-id'}]}),
      }),
      /dense string array/u,
    );
    assert.equal(iteratorRuns, ZERO);
  });

test('semantic receipt seals result, ordering, transaction, consistency, durability, and error dimensions',
  () => {
    const runtimeEvidence = buildRuntimeEvidence(4);
    const receipt = buildBenchmarkSemanticReceipt({
      dialect: BENCHMARK_SQL_DIALECT.SQLITE,
      compiledOperations: 4,
      validatedOperations: 4,
      successfulOperations: 4,
      ...runtimeEvidence,
    });

    assert.equal(receipt.status, PASS_STATUS);
    assert.equal(receipt.throughputBasis, CORRECT_THROUGHPUT_BASIS);
    assert.match(receipt.receiptDigest, /^sha256:[a-f0-9]{64}$/u);
    for (const dimension of [
      'resultSet',
      'ordering',
      'transaction',
      'consistency',
      'durability',
      'errorBehavior',
    ]) {
      assert.equal(receipt.dimensions[dimension], PASS_STATUS);
    }
  });

test('load throughput counts only correct operations', () => {
  const metrics = computeMetrics(
    [],
    TEST_SUCCESS_COUNT,
    TEST_FAILED_COUNT,
    TEST_FAILED_COUNT,
    TEST_DURATION_SECONDS,
  );

  assert.equal(metrics.correct, TEST_SUCCESS_COUNT);
  assert.equal(
    metrics.correctOpsPerSec,
    EXPECTED_CORRECT_OPS_PER_SECOND,
  );
  assert.equal(metrics.opsPerSec, EXPECTED_CORRECT_OPS_PER_SECOND);
  assert.equal(
    metrics.attemptedOpsPerSec,
    EXPECTED_ATTEMPTED_OPS_PER_SECOND,
  );
});

test('load accounting keeps every non-success denominator explicit', () => {
  const metrics = computeMetrics(
    [],
    4,
    2,
    2,
    TEST_DURATION_SECONDS,
    [],
    ZERO,
    [],
    {
      targetOperations: 9,
      dispatchedOperations: 7,
      undispatchedOperations: 1,
      undispatchedByReason: {
        capacity: 1,
        durationTimeout: ZERO,
        cancelled: ZERO,
      },
    },
    null,
    {
      rejectedOperations: 2,
      rejectedByReason: {
        queueFull: 1,
        flowControl: ZERO,
        admission: 1,
      },
    },
    null,
    null,
    null,
    {
      timedOut: 1,
      errored: 1,
      queueOverflow: 1,
    },
  );

  assert.equal(metrics.offered, 9);
  assert.equal(metrics.dispatchedOperations, 7);
  assert.equal(metrics.correct, 4);
  assert.equal(metrics.rejectedOperations, 2);
  assert.equal(metrics.timedOut, 1);
  assert.equal(metrics.errored, 1);
  assert.equal(metrics.queueOverflow, 1);
  assert.equal(metrics.undispatchedOperations, 1);
  assert.equal(metrics.opsPerSec, 4);
  assert.equal(metrics.attemptedOpsPerSec, 7);
});

test('cancelled dispatched work receives a loud terminal outcome', async () => {
  let signalQueryStarted;
  const queryStarted = new Promise((resolve) => {
    signalQueryStarted = resolve;
  });
  const node = {
    id: 'cancellation-target',
    query() {
      signalQueryStarted();
      return new Promise(() => {});
    },
  };
  const generator = new LoadGenerator([node], {
    opsPerSec: 100,
    duration: TEST_DURATION_MS,
    operations: ['SELECT'],
    maxInFlight: 1,
    nodeMaxInFlight: 1,
  });
  const run = generator.start();
  await queryStarted;
  run.cancel();
  const metrics = await run.waitComplete();

  assert.equal(metrics.dispatchedOperations, 1);
  assert.equal(metrics.cancelled, 1);
  assert.equal(
    metrics.dispatchedOperations,
    metrics.correct +
      metrics.timedOut +
      metrics.errored +
      metrics.cancelled +
      metrics.rejectedByReason.admission,
  );
});

test('PostgreSQL cache identity seals the semantic contract version', () => {
  const identity = buildBaselineCacheIdentity({
    baselineImage: 'postgres:16',
    user: 'postgres',
    database: 'lagrange',
    port: 5432,
    loadOpsPerSec: TEST_OPS_PER_SECOND,
    loadDuration: '1s',
    loadMaxInFlight: 1,
    baselineLoadNodeCount: 1,
    tableName: 'benchmark_events',
    replicationFactor: 1,
    syncReplicaAcks: ZERO,
  }, '/tmp/benchmark-semantic-parity');

  assert.ok(identity.key.startsWith(CURRENT_CACHE_KEY_PREFIX));
  assert.equal(
    identity.signature.semanticContract.version,
    BENCHMARK_SEMANTIC_CONTRACT_VERSION,
  );
  assert.equal(
    identity.signature.semanticContract.dialect,
    POSTGRES_DIALECT,
  );
  assert.equal(
    identity.signature.semanticContract.throughputBasis,
    CORRECT_THROUGHPUT_BASIS,
  );
});

test('legacy cache payload copied under a current path is rejected', async () => {
  const outputDir = await mkdtemp(
    join(tmpdir(), 'benchmark-semantic-cache-'),
  );
  const config = {
    baselineImage: 'postgres:16',
    user: 'postgres',
    database: 'lagrange',
    port: 5432,
    loadOpsPerSec: TEST_OPS_PER_SECOND,
    loadDuration: '1s',
    loadMaxInFlight: 1,
    baselineLoadNodeCount: 1,
    tableName: 'benchmark_events',
    replicationFactor: 1,
    syncReplicaAcks: ZERO,
    cacheBaselineMetrics: true,
    refreshBaselineMetrics: false,
    baselineCacheTtlMs: TEST_DURATION_SECONDS,
  };
  const identity = buildBaselineCacheIdentity(config, outputDir);
  try {
    await mkdir(dirname(identity.path), {recursive: true});
    await writeFile(identity.path, JSON.stringify({
      schemaVersion: 3,
      key: identity.key,
      signature: identity.signature,
      cachedAt: new Date().toISOString(),
      metrics: {opsPerSec: 10},
    }), 'utf8');

    const loaded = await loadBaselineMetricsFromCache(identity, config);
    assert.equal(loaded.metrics, null);
    assert.equal(loaded.metadata.reason, 'cache-invalid');
    assert.equal(loaded.metadata.publicationEligibility.eligible, false);
  } finally {
    await rm(outputDir, {recursive: true, force: true});
  }
});

test('legacy comparison metrics are explicitly publication-ineligible', () => {
  const comparison = buildComparison(
    {opsPerSec: 12, latency: {p99: 3}},
    {opsPerSec: 10, latency: {avg: 2}},
  );

  assert.equal(comparison.publicationEligibility.eligible, false);
  assert.ok(
    comparison.publicationEligibility.reasonCodes.includes(
      'semantic_contract_missing',
    ),
  );
});

test('comparison becomes eligible only for paired current semantic receipts',
  () => {
    const sutReceipt = buildCurrentReceipt(BENCHMARK_SQL_DIALECT.SQLITE);
    const baselineReceipt = buildCurrentReceipt(
      BENCHMARK_SQL_DIALECT.POSTGRESQL,
    );
    const comparison = buildComparison(
      {
        correctOpsPerSec: 12,
        opsPerSec: 99,
        latency: {p99: 3},
        semanticParity: sutReceipt,
      },
      {
        correctOpsPerSec: 10,
        opsPerSec: 88,
        latency: {avg: 2},
        semanticParity: baselineReceipt,
      },
    );

    assert.equal(comparison.publicationEligibility.eligible, true);
    assert.deepEqual(comparison.publicationEligibility.reasonCodes, []);
    assert.equal(comparison.sutOpsPerSec, 12);
    assert.equal(comparison.baselineTps, 10);
    assert.equal(comparison.throughputRatioSutToBaseline, 1.2);
  });

test('paired result transcripts must match before publication', () => {
  const comparison = buildComparison(
    {
      correctOpsPerSec: 12,
      latency: {p99: 3},
      semanticParity: buildCurrentReceipt(
        BENCHMARK_SQL_DIALECT.SQLITE,
        {selectOutcome: ZERO},
      ),
    },
    {
      correctOpsPerSec: 10,
      latency: {avg: 2},
      semanticParity: buildCurrentReceipt(
        BENCHMARK_SQL_DIALECT.POSTGRESQL,
        {selectOutcome: 999},
      ),
    },
  );

  assert.equal(comparison.publicationEligibility.eligible, false);
  assert.ok(
    comparison.publicationEligibility.reasonCodes.includes(
      'paired_result_set_mismatch',
    ),
  );
});

test('incomplete and digest-tampered semantic receipts are ineligible', () => {
  const sutReceipt = buildCurrentReceipt(BENCHMARK_SQL_DIALECT.SQLITE);
  const baselineReceipt = buildCurrentReceipt(
    BENCHMARK_SQL_DIALECT.POSTGRESQL,
  );
  const tamperedSutReceipt = {
    ...sutReceipt,
    receiptDigest: `sha256:${'0'.repeat(64)}`,
  };
  const incompleteBaselineReceipt = {
    version: baselineReceipt.version,
    contractDigest: baselineReceipt.contractDigest,
    dialect: baselineReceipt.dialect,
    status: PASS_STATUS,
    dimensions: baselineReceipt.dimensions,
  };
  const comparison = buildComparison(
    {
      correctOpsPerSec: 12,
      latency: {p99: 3},
      semanticParity: tamperedSutReceipt,
    },
    {
      correctOpsPerSec: 10,
      latency: {avg: 2},
      semanticParity: incompleteBaselineReceipt,
    },
  );

  assert.equal(comparison.publicationEligibility.eligible, false);
  assert.ok(
    comparison.publicationEligibility.reasonCodes.includes(
      'semantic_receipt_digest_mismatch',
    ),
  );
  assert.ok(
    comparison.publicationEligibility.reasonCodes.includes(
      'semantic_evidence_incomplete',
    ),
  );
});

test('invalid correct throughput never publishes under the correct basis', () => {
  const sutReceipt = buildCurrentReceipt(BENCHMARK_SQL_DIALECT.SQLITE);
  const baselineReceipt = buildCurrentReceipt(
    BENCHMARK_SQL_DIALECT.POSTGRESQL,
  );
  for (const correctOpsPerSec of [null, -1, Object(12)]) {
    const comparison = buildComparison(
      {
        correctOpsPerSec,
        opsPerSec: 999,
        latency: {p99: 3},
        semanticParity: sutReceipt,
      },
      {
        correctOpsPerSec: 10,
        latency: {avg: 2},
        semanticParity: baselineReceipt,
      },
    );
    assert.equal(comparison.publicationEligibility.eligible, false);
    assert.equal(
      comparison.throughputBasis,
      'legacy_diagnostic_ops_per_sec',
    );
  }
});

test('derived comparison arithmetic fails closed on overflow', () => {
  const comparison = buildComparison(
    {
      correctOpsPerSec: Number.MAX_SAFE_INTEGER,
      latency: {p99: 3},
      semanticParity: buildCurrentReceipt(BENCHMARK_SQL_DIALECT.SQLITE),
    },
    {
      correctOpsPerSec: Number.MIN_VALUE,
      latency: {avg: 2},
      semanticParity: buildCurrentReceipt(
        BENCHMARK_SQL_DIALECT.POSTGRESQL,
      ),
    },
  );

  assert.equal(comparison.throughputRatioSutToBaseline, null);
  assert.equal(comparison.publicationEligibility.eligible, false);
  assert.ok(
    comparison.publicationEligibility.reasonCodes.includes(
      'derived_metric_invalid',
    ),
  );
});

test('zero-work receipts fail without querying or becoming publishable', () => {
  const emptyRuntimeEvidence = {
    resultSet: buildBenchmarkResultSetEvidence([]),
    accounting: {
      offered: ZERO,
      dispatched: ZERO,
      correct: ZERO,
      rejected: ZERO,
      timedOut: ZERO,
      errored: ZERO,
      queueOverflow: ZERO,
      undispatched: ZERO,
      cancelled: ZERO,
      rejectedByReason: {
        queueFull: ZERO,
        flowControl: ZERO,
        admission: ZERO,
      },
    },
    durability: {
      status: 'fail',
      expected: ZERO,
      observed: ZERO,
      missingIds: [],
      reason: 'acknowledged_writes_not_visible',
    },
  };
  const sutReceipt = buildBenchmarkSemanticReceipt({
    dialect: BENCHMARK_SQL_DIALECT.SQLITE,
    compiledOperations: ZERO,
    validatedOperations: ZERO,
    successfulOperations: ZERO,
    ...emptyRuntimeEvidence,
  });
  const baselineReceipt = buildBenchmarkSemanticReceipt({
    dialect: BENCHMARK_SQL_DIALECT.POSTGRESQL,
    compiledOperations: ZERO,
    validatedOperations: ZERO,
    successfulOperations: ZERO,
    ...emptyRuntimeEvidence,
  });
  const comparison = buildComparison(
    {correctOpsPerSec: ZERO, semanticParity: sutReceipt},
    {correctOpsPerSec: ZERO, semanticParity: baselineReceipt},
  );

  assert.equal(sutReceipt.status, 'fail');
  assert.equal(baselineReceipt.status, 'fail');
  assert.equal(comparison.publicationEligibility.eligible, false);
});

test('prototype pollution cannot fabricate semantic publication evidence', () => {
  const baselineReceipt = buildCurrentReceipt(
    BENCHMARK_SQL_DIALECT.POSTGRESQL,
  );
  const restoreSemanticParity = Object.getOwnPropertyDescriptor(
    Object.prototype,
    'semanticParity',
  );
  const restoreEvery = Array.prototype.every;
  defineTestProperty(Object.prototype, 'semanticParity', {
    configurable: true,
    enumerable: true,
    value: buildCurrentReceipt(BENCHMARK_SQL_DIALECT.SQLITE),
  });
  defineTestProperty(Array.prototype, 'every', {
    configurable: true,
    writable: true,
    value: () => true,
  });
  let comparison;
  try {
    comparison = buildComparison(
      {correctOpsPerSec: 12, latency: {p99: 3}},
      {
        correctOpsPerSec: 10,
        latency: {avg: 2},
        semanticParity: baselineReceipt,
      },
    );
  } finally {
    defineTestProperty(Array.prototype, 'every', {
      configurable: true,
      writable: true,
      value: restoreEvery,
    });
    if (restoreSemanticParity) {
      defineTestProperty(
        Object.prototype,
        'semanticParity',
        restoreSemanticParity,
      );
    } else {
      deleteTestProperty(Object.prototype, 'semanticParity');
    }
  }

  assert.equal(comparison.publicationEligibility.eligible, false);
});

test('captured intrinsics preserve publication decisions under pollution', () => {
  const sutReceipt = buildCurrentReceipt(BENCHMARK_SQL_DIALECT.SQLITE);
  const baselineReceipt = buildCurrentReceipt(
    BENCHMARK_SQL_DIALECT.POSTGRESQL,
  );
  const replacements = [
    [Number, 'isFinite', () => true],
    [Number, 'isInteger', () => true],
    [Number, 'isSafeInteger', () => true],
    [Array, 'isArray', () => false],
    [Object, 'getOwnPropertyDescriptor', () => undefined],
    [Object, 'getPrototypeOf', () => null],
    [Object, 'hasOwn', () => true],
    [Object, 'keys', () => []],
    [Reflect, 'ownKeys', () => []],
    [JSON, 'stringify', () => '"polluted"'],
    [Array.prototype, Symbol.iterator, function* pollutedIterator() {
      yield 'fabricated';
    }],
  ];
  const descriptors = replacements.map(([owner, key]) => [
    owner,
    key,
    Object.getOwnPropertyDescriptor(owner, key),
  ]);
  let comparison;
  try {
    for (const [owner, key, value] of replacements) {
      defineTestProperty(owner, key, {
        configurable: true,
        writable: true,
        value,
      });
    }
    comparison = buildComparison(
      {
        correctOpsPerSec: 12,
        latency: {p99: 3},
        semanticParity: sutReceipt,
      },
      {
        correctOpsPerSec: 10,
        latency: {avg: 2},
        semanticParity: baselineReceipt,
      },
    );
  } finally {
    for (let index = descriptors.length - 1; index >= ZERO; index -= 1) {
      const descriptorEntry = descriptors[index];
      const owner = descriptorEntry[ZERO];
      const key = descriptorEntry[1];
      const descriptor = descriptorEntry[2];
      if (descriptor) {
        defineTestProperty(owner, key, descriptor);
      } else {
        deleteTestProperty(owner, key);
      }
    }
  }

  assert.equal(comparison.publicationEligibility.eligible, true);
  assert.equal(comparison.throughputRatioSutToBaseline, 1.2);
});
