#!/usr/bin/env node

import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const ZERO = 0;
const EXPECTED_SUCCESS_COUNT = 7;
const EXPECTED_FAILED_COUNT = 3;
const TEST_DURATION_MS = 100;
const TEST_DURATION_SECONDS_MS = 1000;
const TEST_OPS_PER_SECOND = 10;
const POSTGRES_DIALECT = 'postgresql';
const BENCHMARK_WORKLOAD_PROFILE = 'benchmark_events_mixed';
const SQLITE_CONFLICT_SQL = 'INSERT OR IGNORE';
const CORRECT_THROUGHPUT_FIELD = 'correctOpsPerSec';
const PUBLICATION_ELIGIBILITY_FIELD = 'publicationEligibility';
const SEMANTIC_CONTRACT_FIELD = 'semanticContract';
const BASELINE_CACHE_V3_PREFIX = 'v3-';
const HEAD_RED_ASSERTION = {
  POSTGRES_DIALECT: 'postgresql_target_received_sqlite_conflict_syntax',
  THROUGHPUT: 'throughput_counted_failed_operations',
  CACHE_IDENTITY: 'cache_identity_lacked_semantic_contract',
  PUBLICATION: 'comparison_lacked_publication_eligibility',
};
const USAGE =
  'usage: probe-benchmark-semantic-parity-head --repo PATH --output PATH';
const VERDICT_PASS = 'PASS';
const VERDICT_FAIL = 'FAIL';

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= ZERO ? process.argv[index + 1] : null;
}

function moduleUrl(repoPath, relativePath) {
  return pathToFileURL(resolve(repoPath, relativePath)).href;
}

async function observeHeadBehavior(repoPath) {
  const loadModule = await import(moduleUrl(
    repoPath,
    'test/distributed/harness/load-generator.js',
  ));
  const policyModule = await import(moduleUrl(
    repoPath,
    'test/distributed/scenarios/' +
      'postgres-baseline-comparison-baseline-cache-and-policy.js',
  ));
  const statements = [];
  const generator = new loadModule.LoadGenerator([
    {
      id: 'head-red-postgres-target',
      async query(sql) {
        statements.push(String(sql));
        return {rows: []};
      },
    },
  ], {
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
  const metrics = loadModule.computeMetrics(
    [],
    EXPECTED_SUCCESS_COUNT,
    EXPECTED_FAILED_COUNT,
    EXPECTED_FAILED_COUNT,
    TEST_DURATION_SECONDS_MS,
  );
  const policy =
    policyModule.POSTGRES_BASELINE_COMPARISON_BASELINE_CACHE_AND_POLICY_BUNDLE;
  const cacheIdentity = policy.buildBaselineCacheIdentity({
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
  }, '/tmp/benchmark-semantic-head-red');
  const comparison = policy.buildComparison(
    {opsPerSec: 12, latency: {p99: 3}},
    {opsPerSec: 10, latency: {avg: 2}},
  );
  return [
    {
      assertion: HEAD_RED_ASSERTION.POSTGRES_DIALECT,
      observed: statements.some((sql) => sql.includes(SQLITE_CONFLICT_SQL)),
      detail: statements[ZERO] || null,
    },
    {
      assertion: HEAD_RED_ASSERTION.THROUGHPUT,
      observed:
        metrics.opsPerSec ===
        EXPECTED_SUCCESS_COUNT + EXPECTED_FAILED_COUNT &&
        metrics[CORRECT_THROUGHPUT_FIELD] === undefined,
      detail: {
        opsPerSec: metrics.opsPerSec,
        success: metrics.success,
        failed: metrics.failed,
      },
    },
    {
      assertion: HEAD_RED_ASSERTION.CACHE_IDENTITY,
      observed:
        cacheIdentity.key.startsWith(BASELINE_CACHE_V3_PREFIX) &&
        cacheIdentity.signature[SEMANTIC_CONTRACT_FIELD] === undefined,
      detail: {
        key: cacheIdentity.key,
        semanticContract:
          cacheIdentity.signature[SEMANTIC_CONTRACT_FIELD] || null,
      },
    },
    {
      assertion: HEAD_RED_ASSERTION.PUBLICATION,
      observed: comparison[PUBLICATION_ELIGIBILITY_FIELD] === undefined,
      detail: comparison,
    },
  ];
}

const repoPath = readArgument('--repo');
const outputPath = readArgument('--output');
if (!repoPath || !outputPath) {
  throw new Error(USAGE);
}
const baseCommit = execFileSync(
  'git',
  ['-C', repoPath, 'rev-parse', 'HEAD'],
  {encoding: 'utf8'},
).trim();
const assertions = await observeHeadBehavior(repoPath);
const passed = assertions.every((entry) => entry.observed === true);
const report = {
  scenario: 'benchmark-semantic-parity-head-red',
  fidelity: 'isolated-base-behavioral-probe',
  baseCommit,
  expected: 'all named legacy defects observed',
  passed,
  assertions,
};
mkdirSync(dirname(outputPath), {recursive: true});
writeFileSync(outputPath, JSON.stringify(report, null, 2));
process.stdout.write(
  `${passed ? VERDICT_PASS : VERDICT_FAIL} ${outputPath}\n`,
);
process.exitCode = passed ? ZERO : 1;
