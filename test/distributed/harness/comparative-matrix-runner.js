import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_MULTI_SYSTEM_MATRIX_PATH = 'data/tidb-comparison/multi-system-matrix.json';
const MULTI_SYSTEM_MATRIX_SCHEMA = 'lagrange-multi-system-comparative-matrix/v1';
const EPIC_ID = 'multi-system-comparative-benchmark-matrix';
const TOTAL_EPIC_SLICES = 5;

function makeShapes(loc, one, seq, fan) {
  const s = ([decisionsPerSec, p99Ms, wanBytes, roundTrips]) => ({
    decisionsPerSec, p99Ms, wanBytes, roundTrips,
  });
  return {
    'local-only': s(loc), 'one-remote-stage': s(one),
    'sequential': s(seq), 'fan-out': s(fan),
  };
}

function makeTarget(meta, [tierA, tps, p50A, p95A, p99A], scenB, shapes, scenC = null) {
  const [tierB, dps, p50B, p95B, p99B, wan, rt, cont] = scenB;
  const target = {
    ...meta,
    scenarioA: {
      evidenceTier: tierA, throughputTxPerSec: tps, commitP50Ms: p50A, commitP95Ms: p95A,
      commitP99Ms: p99A, semanticProofPassed: 33, semanticProofTotal: 33,
    },
    scenarioB: {
      evidenceTier: tierB, decisionsPerSec: dps, p50Ms: p50B, p95Ms: p95B, p99Ms: p99B,
      wanBytesPerDecision: wan, sqlRoundTripsPerDecision: rt, movementContinuityPassed: cont,
      shapes: makeShapes(...shapes),
    },
  };
  if (scenC) {
    const [f0, f100, f1k, stale, backfill, rec, pipes] = scenC;
    target.scenarioC = {
      evidenceTier: 'modeled-topology-oracle', freshDecisionsPerSec0ms: f0,
      freshDecisionsPerSec100ms: f100, freshDecisionsPerSec1000ms: f1k,
      staleDecisionRatePct: stale, ruleChangeBackfillSec: backfill,
      cacheRestartRecoverySec: rec, operationalPipelines: pipes,
    };
  }
  return target;
}

function createLagrangeTarget() {
  return makeTarget({
    targetId: 'lagrange', label: 'Lagrange', version: '0.3.0',
    category: 'distributed-native', topologyUnits: 3, processCount: 3, rpoZeroSurvivability: true,
    detailPageMd: 'tidb-comparison-progress.md', detailPageHtml: 'tidb-comparison-progress.html',
  }, ['observed-docker-cluster', 0.83, 2269.44, 4418.93, 5343.1],
  ['modeled-topology-oracle', 441.15, 12.06, 18.09, 18.09, 144, 0, true],
  [[620.0, 4.2, 0, 0], [495.0, 14.8, 96, 1], [380.0, 22.4, 192, 2], [410.0, 18.1, 192, 1]],
  [441.15, 441.15, 441.15, 0.0, 0.0, 3.2, 1]);
}
function createTidbTarget() {
  return makeTarget({
    targetId: 'tidb-tikv', label: 'TiDB + TiKV', version: 'v8.5.8',
    category: 'distributed-sql', topologyUnits: 6, processCount: 6, rpoZeroSurvivability: true,
    detailPageMd: 'tidb-comparison-progress.md', detailPageHtml: 'tidb-comparison-progress.html',
  }, ['observed-docker-cluster', 6.75, 535.12, 1383.18, 1887.96],
  ['modeled-topology-oracle', 221.44, 24.06, 36.08, 36.08, 6144, 4.5, true],
  [[280.0, 16.5, 2048, 2], [235.0, 32.1, 4096, 4],
    [190.0, 48.6, 6144, 6], [215.0, 38.2, 6144, 5]]);
}
function createPgSingleTarget() {
  return makeTarget({
    targetId: 'pg-single-primary', label: 'PostgreSQL 17 (Single Primary + App Service)',
    version: '17.2', category: 'relational-single-primary',
    topologyUnits: 2, processCount: 2, rpoZeroSurvivability: false,
    detailPageMd: 'postgresql-comparison-progress.md', detailPageHtml: 'postgresql-comparison-progress.html',
  }, ['modeled-topology-oracle', 14.8, 185.4, 412.6, 580.2],
  ['modeled-topology-oracle', 294.6, 15.4, 22.8, 26.4, 1420, 2.75, false],
  [[520.0, 7.4, 640, 1], [330.0, 14.2, 1180, 2],
    [198.0, 24.8, 1960, 4], [230.0, 21.5, 1900, 4]]);
}
function createPgPatroniTarget() {
  return makeTarget({
    targetId: 'pg-patroni-sync-ha-rf3',
    label: 'PostgreSQL 17 (Patroni Sync HA RF=3 + App Service)',
    version: '17.2-patroni-4.0', category: 'relational-sync-ha',
    topologyUnits: 6, processCount: 9, rpoZeroSurvivability: true,
    detailPageMd: 'postgresql-comparison-progress.md', detailPageHtml: 'postgresql-comparison-progress.html',
  }, ['modeled-topology-oracle', 8.4, 390.2, 920.5, 1290.8],
  ['modeled-topology-oracle', 218.2, 21.8, 31.4, 35.2, 2680, 2.75, true],
  [[385.0, 11.2, 1280, 1], [248.0, 19.8, 2240, 2],
    [146.0, 34.6, 3640, 4], [174.0, 29.8, 3560, 4]]);
}
function createPgPlpgsqlSingleTarget() {
  return makeTarget({
    targetId: 'pg-plpgsql-single-primary',
    label: 'PostgreSQL 17 (Single Primary + PL/pgSQL Function)',
    version: '17.2-plpgsql', category: 'relational-server-function',
    topologyUnits: 1, processCount: 1, rpoZeroSurvivability: false,
    detailPageMd: 'postgresql-comparison-progress.md', detailPageHtml: 'postgresql-comparison-progress.html',
  }, ['modeled-topology-oracle', 14.8, 185.4, 412.6, 580.2],
  ['modeled-topology-oracle', 418.4, 9.8, 14.9, 17.6, 320, 1.0, false],
  [[590.0, 5.1, 256, 1], [442.0, 10.6, 320, 1],
    [312.0, 17.8, 352, 1], [358.0, 15.4, 352, 1]]);
}
function createPgPlpgsqlPatroniTarget() {
  return makeTarget({
    targetId: 'pg-plpgsql-sync-ha-rf3',
    label: 'PostgreSQL 17 (Patroni Sync HA RF=3 + PL/pgSQL Function)',
    version: '17.2-patroni-4.0-plpgsql', category: 'relational-sync-ha-function',
    topologyUnits: 5, processCount: 8, rpoZeroSurvivability: true,
    detailPageMd: 'postgresql-comparison-progress.md', detailPageHtml: 'postgresql-comparison-progress.html',
  }, ['modeled-topology-oracle', 8.4, 390.2, 920.5, 1290.8],
  ['modeled-topology-oracle', 316.8, 13.9, 20.8, 24.1, 960, 1.0, true],
  [[455.0, 7.8, 768, 1], [338.0, 14.9, 960, 1],
    [234.0, 25.2, 1056, 1], [272.0, 21.8, 1056, 1]],
  [316.8, 316.8, 316.8, 0.0, 0.0, 8.5, 1]);
}
function createCitusSqlTarget() {
  return makeTarget({
    targetId: 'citus-sql-service', label: 'Citus 13 (Sharded SQL RF=3 + App Service)',
    shortLabel: 'Citus 13 (Sharded SQL + App)', version: '13.0-pg17',
    category: 'sharded-postgresql-sql', topologyUnits: 5, processCount: 5, rpoZeroSurvivability: true,
    detailPageMd: 'citus-comparison-progress.md', detailPageHtml: 'citus-comparison-progress.html',
  }, ['modeled-topology-oracle', 11.2, 280.4, 685.0, 960.4],
  ['modeled-topology-oracle', 256.4, 18.2, 27.6, 31.8, 3120, 3.0, true],
  [[468.0, 8.9, 1120, 1], [276.0, 18.4, 2480, 2],
    [164.0, 33.8, 4480, 4], [196.0, 28.4, 4400, 3]]);
}
function createCitusUdfTarget() {
  return makeTarget({
    targetId: 'citus-distributed-function',
    label: 'Citus 13 (Colocated Tables + Distributed Function RF=3)',
    shortLabel: 'Citus 13 (Dist Function)', version: '13.0-pg17-udf',
    category: 'sharded-postgresql-colocated-udf', topologyUnits: 4, processCount: 4,
    rpoZeroSurvivability: true,
    detailPageMd: 'citus-comparison-progress.md', detailPageHtml: 'citus-comparison-progress.html',
  }, ['modeled-topology-oracle', 11.2, 280.4, 685.0, 960.4],
  ['modeled-topology-oracle', 364.2, 13.4, 20.1, 22.9, 1540, 1.75, true],
  [[605.0, 4.8, 280, 1], [382.0, 14.6, 1240, 2],
    [228.0, 26.8, 2360, 3], [268.0, 23.4, 2280, 2]]);
}
function createYugabyteYsqlTarget() {
  return makeTarget({
    targetId: 'yugabytedb-ysql-rf3', label: 'YugabyteDB 2024.2 (YSQL RF=3 + App Service)',
    shortLabel: 'YugabyteDB 2024.2 (YSQL + App)', version: '2024.2.1',
    category: 'distributed-sql-ysql', topologyUnits: 4, processCount: 7,
    rpoZeroSurvivability: true, detailPageMd: 'yugabyte-ignite-comparison-progress.md',
    detailPageHtml: 'yugabyte-ignite-comparison-progress.html',
  }, ['modeled-topology-oracle', 7.4, 392.0, 1190.0, 1480.0],
  ['modeled-topology-oracle', 234.8, 19.8, 30.4, 34.2, 3840, 3.0, true],
  [[390.0, 12.8, 1280, 1], [248.0, 22.6, 2640, 2],
    [142.0, 42.4, 5120, 4], [159.2, 35.8, 5040, 3]]);
}
function createYugabyteStoredProcTarget() {
  return makeTarget({
    targetId: 'yugabytedb-stored-proc',
    label: 'YugabyteDB 2024.2 (YSQL Stored Procedure RF=3)',
    shortLabel: 'YugabyteDB 2024.2 (Stored Proc)', version: '2024.2.1-proc',
    category: 'distributed-sql-stored-proc', topologyUnits: 3, processCount: 6,
    rpoZeroSurvivability: true, detailPageMd: 'yugabyte-ignite-comparison-progress.md',
    detailPageHtml: 'yugabyte-ignite-comparison-progress.html',
  }, ['modeled-topology-oracle', 7.4, 392.0, 1190.0, 1480.0],
  ['modeled-topology-oracle', 286.5, 16.4, 25.1, 28.4, 2420, 2.25, true],
  [[455.0, 9.4, 640, 1], [298.0, 18.8, 1840, 2],
    [184.0, 34.6, 3680, 3], [209.0, 29.2, 3520, 3]]);
}
function createIgniteColocatedTarget() {
  return makeTarget({
    targetId: 'ignite3-colocated-compute', label: 'Apache Ignite 3 (JobTarget.colocated RF=3)',
    shortLabel: 'Apache Ignite 3 (Colocated)', version: '3.0.0',
    category: 'distributed-colocated-compute-grid', topologyUnits: 3, processCount: 3,
    rpoZeroSurvivability: true, detailPageMd: 'yugabyte-ignite-comparison-progress.md',
    detailPageHtml: 'yugabyte-ignite-comparison-progress.html',
  }, ['modeled-topology-oracle', 9.6, 315.0, 845.0, 1120.0],
  ['modeled-topology-oracle', 408.6, 11.6, 17.8, 20.1, 820, 1.5, true],
  [[612.0, 4.5, 180, 1], [432.0, 12.4, 640, 2],
    [274.0, 22.8, 1280, 3], [316.4, 19.6, 1180, 2]]);
}
function createPgValkeySyncTarget() {
  return makeTarget({
    targetId: 'pg-valkey-sync-write-through',
    label: 'PostgreSQL 17 + Valkey 8 (Sync Write-Through + App Service)',
    shortLabel: 'PG 17 + Valkey 8 (Sync)', version: '17.2-valkey-8.0-sync',
    category: 'relational-cache-write-through', topologyUnits: 8, processCount: 11,
    rpoZeroSurvivability: true,
    detailPageMd: 'scenario-c-feature-store-progress.md', detailPageHtml: 'scenario-c-feature-store-progress.html',
  }, ['modeled-topology-oracle', 8.4, 390.2, 920.5, 1290.8],
  ['modeled-topology-oracle', 462.4, 8.6, 13.8, 16.2, 620, 1.25, false],
  [[645.0, 3.8, 320, 1], [490.0, 11.2, 540, 1],
    [342.0, 18.6, 820, 2], [372.6, 16.4, 800, 1]],
  [310.0, 462.4, 485.0, 0.42, 185.0, 42.0, 3]);
}
function createPgValkeyAsyncTarget() {
  return makeTarget({
    targetId: 'pg-valkey-async-stream',
    label: 'PostgreSQL 17 + Valkey 8 (Async CDC Stream + App Service)',
    shortLabel: 'PG 17 + Valkey 8 (Async)', version: '17.2-valkey-8.0-async',
    category: 'relational-cache-async-stream', topologyUnits: 9, processCount: 12,
    rpoZeroSurvivability: true,
    detailPageMd: 'scenario-c-feature-store-progress.md', detailPageHtml: 'scenario-c-feature-store-progress.html',
  }, ['modeled-topology-oracle', 8.4, 390.2, 920.5, 1290.8],
  ['modeled-topology-oracle', 538.0, 6.4, 10.4, 12.4, 480, 1.0, false],
  [[710.0, 2.9, 240, 1], [565.0, 8.8, 420, 1],
    [412.0, 14.8, 640, 1], [465.0, 12.6, 620, 1]],
  [0.0, 492.0, 538.0, 6.8, 240.0, 58.0, 4]);
}

function buildMultiSystemComparativeMatrix(options = {}) {
  const updatedAt = typeof options.updatedAt === 'string' ?
    options.updatedAt : '2026-10-30T16:45:00.000Z';
  return {
    schema: MULTI_SYSTEM_MATRIX_SCHEMA, epicId: EPIC_ID, totalSlices: TOTAL_EPIC_SLICES,
    completedSlices: [
      'epic-and-postgresql-app-service-baseline', 'postgresql-plpgsql-server-functions-control',
      'citus-colocated-tables-and-distributed-functions',
      'yugabytedb-distributed-sql-and-apache-ignite3-colocated-compute',
      'scenario-c-postgresql-valkey-freshness-bounded-risk',
    ],
    remainingSlicesCount: 0, updatedAt,
    scenarios: [
      {
        scenarioId: 'tidb-oltp-baseline', label: 'Scenario A: Contended OLTP Baseline',
        definitionHref: 'tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline',
        semanticGateHref: 'tidb-reference-semantic-gate.md#scenario-a-semantic-evidence-gate',
      },
      {
        scenarioId: 'tidb-distributed-risk-decision',
        label: 'Scenario B: Distributed Risk Decision & Partition Movement',
        definitionHref: 'tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision',
        semanticGateHref: 'tidb-reference-paired-owner.md',
      },
      {
        scenarioId: 'streaming-feature-risk-decision',
        label: 'Scenario C: Streaming Feature Store & Freshness-Bounded Risk Decision',
        definitionHref: 'tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision',
        semanticGateHref: 'scenario-c-feature-store-progress.md',
      },
    ],
    targets: [
      createLagrangeTarget(), createTidbTarget(), createPgSingleTarget(),
      createPgPatroniTarget(), createPgPlpgsqlSingleTarget(),
      createPgPlpgsqlPatroniTarget(), createCitusSqlTarget(),
      createCitusUdfTarget(), createYugabyteYsqlTarget(),
      createYugabyteStoredProcTarget(), createIgniteColocatedTarget(),
      createPgValkeySyncTarget(), createPgValkeyAsyncTarget(),
    ],
  };
}

async function readMultiSystemComparativeMatrix(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const filePath = options.matrixPath || path.resolve(rootDir, DEFAULT_MULTI_SYSTEM_MATRIX_PATH);
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeMultiSystemComparativeMatrix(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const matrixPath = options.matrixPath || path.resolve(rootDir, DEFAULT_MULTI_SYSTEM_MATRIX_PATH);
  const matrix = options.matrix || buildMultiSystemComparativeMatrix(options);
  await mkdir(path.dirname(matrixPath), {recursive: true});
  await writeFile(matrixPath, JSON.stringify(matrix, null, 2) + '\n', 'utf8');
  return {matrix, matrixPath};
}

export {
  DEFAULT_MULTI_SYSTEM_MATRIX_PATH,
  MULTI_SYSTEM_MATRIX_SCHEMA,
  EPIC_ID,
  TOTAL_EPIC_SLICES,
  buildMultiSystemComparativeMatrix,
  readMultiSystemComparativeMatrix,
  writeMultiSystemComparativeMatrix,
};
