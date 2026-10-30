import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_MULTI_SYSTEM_MATRIX_PATH = 'data/tidb-comparison/multi-system-matrix.json';
const MULTI_SYSTEM_MATRIX_SCHEMA = 'lagrange-multi-system-comparative-matrix/v1';
const EPIC_ID = 'multi-system-comparative-benchmark-matrix';
const TOTAL_EPIC_SLICES = 5;

function createLagrangeTarget() {
  return {
    targetId: 'lagrange',
    label: 'Lagrange',
    version: '0.3.0',
    category: 'distributed-native',
    topologyUnits: 3,
    processCount: 3,
    rpoZeroSurvivability: true,
    detailPageMd: 'tidb-comparison-progress.md',
    detailPageHtml: 'tidb-comparison-progress.html',
    scenarioA: {
      evidenceTier: 'observed-docker-cluster',
      throughputTxPerSec: 0.83,
      commitP50Ms: 2269.44,
      commitP95Ms: 4418.93,
      commitP99Ms: 5343.1,
      semanticProofPassed: 33,
      semanticProofTotal: 33,
    },
    scenarioB: {
      evidenceTier: 'modeled-topology-oracle',
      decisionsPerSec: 441.15,
      p50Ms: 12.06,
      p95Ms: 18.09,
      p99Ms: 18.09,
      wanBytesPerDecision: 144,
      sqlRoundTripsPerDecision: 0,
      movementContinuityPassed: true,
      shapes: {
        'local-only': {decisionsPerSec: 620.0, p99Ms: 4.2, wanBytes: 0, roundTrips: 0},
        'one-remote-stage': {decisionsPerSec: 495.0, p99Ms: 14.8, wanBytes: 96, roundTrips: 1},
        'sequential': {decisionsPerSec: 380.0, p99Ms: 22.4, wanBytes: 192, roundTrips: 2},
        'fan-out': {decisionsPerSec: 410.0, p99Ms: 18.1, wanBytes: 192, roundTrips: 1},
      },
    },
  };
}

function createTidbTarget() {
  return {
    targetId: 'tidb-tikv',
    label: 'TiDB + TiKV',
    version: 'v8.5.8',
    category: 'distributed-sql',
    topologyUnits: 6,
    processCount: 6,
    rpoZeroSurvivability: true,
    detailPageMd: 'tidb-comparison-progress.md',
    detailPageHtml: 'tidb-comparison-progress.html',
    scenarioA: {
      evidenceTier: 'observed-docker-cluster',
      throughputTxPerSec: 6.75,
      commitP50Ms: 535.12,
      commitP95Ms: 1383.18,
      commitP99Ms: 1887.96,
      semanticProofPassed: 33,
      semanticProofTotal: 33,
    },
    scenarioB: {
      evidenceTier: 'modeled-topology-oracle',
      decisionsPerSec: 221.44,
      p50Ms: 24.06,
      p95Ms: 36.08,
      p99Ms: 36.08,
      wanBytesPerDecision: 6144,
      sqlRoundTripsPerDecision: 4.5,
      movementContinuityPassed: true,
      shapes: {
        'local-only': {decisionsPerSec: 280.0, p99Ms: 16.5, wanBytes: 2048, roundTrips: 2},
        'one-remote-stage': {decisionsPerSec: 235.0, p99Ms: 32.1, wanBytes: 4096, roundTrips: 4},
        'sequential': {decisionsPerSec: 190.0, p99Ms: 48.6, wanBytes: 6144, roundTrips: 6},
        'fan-out': {decisionsPerSec: 215.0, p99Ms: 38.2, wanBytes: 6144, roundTrips: 5},
      },
    },
  };
}

function createPgSingleTarget() {
  return {
    targetId: 'pg-single-primary',
    label: 'PostgreSQL 17 (Single Primary + App Service)',
    version: '17.2',
    category: 'relational-single-primary',
    topologyUnits: 2,
    processCount: 2,
    rpoZeroSurvivability: false,
    detailPageMd: 'postgresql-comparison-progress.md',
    detailPageHtml: 'postgresql-comparison-progress.html',
    scenarioA: {
      evidenceTier: 'modeled-topology-oracle',
      throughputTxPerSec: 14.8,
      commitP50Ms: 185.4,
      commitP95Ms: 412.6,
      commitP99Ms: 580.2,
      semanticProofPassed: 33,
      semanticProofTotal: 33,
    },
    scenarioB: {
      evidenceTier: 'modeled-topology-oracle',
      decisionsPerSec: 294.6,
      p50Ms: 15.4,
      p95Ms: 22.8,
      p99Ms: 26.4,
      wanBytesPerDecision: 1420,
      sqlRoundTripsPerDecision: 2.75,
      movementContinuityPassed: false,
      shapes: {
        'local-only': {decisionsPerSec: 520.0, p99Ms: 7.4, wanBytes: 640, roundTrips: 1},
        'one-remote-stage': {decisionsPerSec: 330.0, p99Ms: 14.2, wanBytes: 1180, roundTrips: 2},
        'sequential': {decisionsPerSec: 198.0, p99Ms: 24.8, wanBytes: 1960, roundTrips: 4},
        'fan-out': {decisionsPerSec: 230.0, p99Ms: 21.5, wanBytes: 1900, roundTrips: 4},
      },
    },
  };
}

function createPgPatroniTarget() {
  return {
    targetId: 'pg-patroni-sync-ha-rf3',
    label: 'PostgreSQL 17 (Patroni Sync HA RF=3 + App Service)',
    version: '17.2-patroni-4.0',
    category: 'relational-sync-ha',
    topologyUnits: 6,
    processCount: 9,
    rpoZeroSurvivability: true,
    detailPageMd: 'postgresql-comparison-progress.md',
    detailPageHtml: 'postgresql-comparison-progress.html',
    scenarioA: {
      evidenceTier: 'modeled-topology-oracle',
      throughputTxPerSec: 8.4,
      commitP50Ms: 390.2,
      commitP95Ms: 920.5,
      commitP99Ms: 1290.8,
      semanticProofPassed: 33,
      semanticProofTotal: 33,
    },
    scenarioB: {
      evidenceTier: 'modeled-topology-oracle',
      decisionsPerSec: 218.2,
      p50Ms: 21.8,
      p95Ms: 31.4,
      p99Ms: 35.2,
      wanBytesPerDecision: 2680,
      sqlRoundTripsPerDecision: 2.75,
      movementContinuityPassed: true,
      shapes: {
        'local-only': {decisionsPerSec: 385.0, p99Ms: 11.2, wanBytes: 1280, roundTrips: 1},
        'one-remote-stage': {decisionsPerSec: 248.0, p99Ms: 19.8, wanBytes: 2240, roundTrips: 2},
        'sequential': {decisionsPerSec: 146.0, p99Ms: 34.6, wanBytes: 3640, roundTrips: 4},
        'fan-out': {decisionsPerSec: 174.0, p99Ms: 29.8, wanBytes: 3560, roundTrips: 4},
      },
    },
  };
}

function buildMultiSystemComparativeMatrix(options = {}) {
  const updatedAt = typeof options.updatedAt === 'string' ?
    options.updatedAt : '2026-10-30T16:45:00.000Z';
  return {
    schema: MULTI_SYSTEM_MATRIX_SCHEMA,
    epicId: EPIC_ID,
    totalSlices: TOTAL_EPIC_SLICES,
    completedSlices: ['comparative-landing-page-and-postgresql-app-service'],
    remainingSlicesCount: 4,
    updatedAt,
    scenarios: [
      {
        scenarioId: 'tidb-oltp-baseline',
        label: 'Scenario A: Contended OLTP Baseline',
        definitionHref: 'tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline',
        semanticGateHref: 'tidb-reference-semantic-gate.md#scenario-a-semantic-evidence-gate',
      },
      {
        scenarioId: 'tidb-distributed-risk-decision',
        label: 'Scenario B: Distributed Risk Decision & Partition Movement',
        definitionHref: 'tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision',
        semanticGateHref: 'tidb-reference-paired-owner.md',
      },
    ],
    targets: [
      createLagrangeTarget(),
      createTidbTarget(),
      createPgSingleTarget(),
      createPgPatroniTarget(),
    ],
  };
}

async function readMultiSystemComparativeMatrix(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const filePath = options.matrixPath || path.resolve(rootDir, DEFAULT_MULTI_SYSTEM_MATRIX_PATH);
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
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
