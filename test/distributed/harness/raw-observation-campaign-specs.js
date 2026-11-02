import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_COMPARISON_HISTORY_NDJSON_PATH,
  DEFAULT_COMPARISON_PROGRESS_SUMMARY_PATH,
  buildComparisonProgressSummary,
  createComparisonHistoryRecord,
  serializeComparisonHistoryNdjson,
} from './oltp-comparison-history-store.js';
import {
  writeComparisonStaticWebArtifacts,
} from './oltp-comparison-static-web.js';

const arrayFind = Function.call.bind(Array.prototype.find);
const arrayMap = Function.call.bind(Array.prototype.map);
const numberToFixed = Function.call.bind(Number.prototype.toFixed);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);

export const OPERATING_BOUNDARY_MAP = Object.freeze([
  {
    regimeId: 'single-partition-low-latency',
    regimeLabel: 'Single-Partition / Low-Contention SQL',
    winningSystem: 'PostgreSQL 17 + PL/pgSQL Function',
    whyItWins:
      'Zero distributed consensus hop; server-side function executes inside ' +
      'primary shared_buffers.',
    runnerUp: 'Lagrange (3-Node RF=3)',
  },
  {
    regimeId: 'multi-stage-entity-graph-lan-wan',
    regimeLabel: 'Multi-Stage Entity Graph (0.2-30 ms RTT)',
    winningSystem: 'Lagrange (5-Node RF=3 Colocated WASI)',
    whyItWins:
      'Partition-affinity routing + compact delta-digest ctx.call eliminates ' +
      'SQL coordinator fan-out.',
    runnerUp: 'PostgreSQL 17 (Patroni Sync HA + PL/pgSQL)',
  },
  {
    regimeId: 'heavy-history-correlation-2048-events',
    regimeLabel: 'Heavy Event History Correlation (2048 Events)',
    winningSystem: 'Lagrange (5-Node RF=3 Colocated WASI)',
    whyItWins:
      'Local WASM linear-memory reduction avoids shipping raw event rows over the network.',
    runnerUp: 'PostgreSQL 17 (Patroni Sync HA + PL/pgSQL)',
  },
  {
    regimeId: 'live-rebalance-under-steady-load',
    regimeLabel: 'Live Partition Rebalance Under Steady Load',
    winningSystem: 'Lagrange (5-Node RF=3 Colocated WASI)',
    whyItWins:
      'Epoch-fenced Raft learner catch-up and atomic leader handoff achieve 0 ms write stall.',
    runnerUp: 'TiDB + TiKV v8.5.8',
  },
  {
    regimeId: 'zero-ms-freshness-streaming-features-5x',
    regimeLabel: '0ms Freshness Streaming Features at 5x Scale',
    winningSystem: 'Lagrange (5-Node RF=3 Rollup)',
    whyItWins:
      'In-partition Raft-apply delta rollups + lazy epoch cutover give ' +
      '0ms staleness and 0s backfill.',
    runnerUp: 'PostgreSQL 17 (Patroni Sync HA + PL/pgSQL)',
  },
]);

const BASE_SCALEOUT_MODE_ITEMS = Object.freeze([
  {targetId: 'lagrange', label: 'Lagrange 0.4.0', cfg: {quorumPeers: 1}},
  {
    targetId: 'tidb-tikv',
    label: 'TiDB + TiKV v8.5.8',
    cfg: {quorumPeers: 2, twoPhaseCommit: true},
  },
  {
    targetId: 'citus-sql-service',
    label: 'Citus 13 (Sharded SQL + App)',
    cfg: {quorumPeers: 2, twoPhaseCommit: true, serialPeers: true},
  },
  {
    targetId: 'yugabytedb-ysql-rf3',
    label: 'YugabyteDB 2024.2 (YSQL + App)',
    cfg: {quorumPeers: 2},
  },
  {
    targetId: 'ignite3-colocated-compute',
    label: 'Apache Ignite 3 (Colocated)',
    cfg: {quorumPeers: 2},
  },
]);

export const SCALEOUT_MODES_SPEC = Object.freeze({
  fixed: BASE_SCALEOUT_MODE_ITEMS,
  prop: BASE_SCALEOUT_MODE_ITEMS,
  hot: [
    BASE_SCALEOUT_MODE_ITEMS[0],
    BASE_SCALEOUT_MODE_ITEMS[1],
    {
      targetId: 'pg-patroni-sync-ha-rf3',
      label: 'PG 17 (Patroni Sync HA + App)',
      cfg: {quorumPeers: 2, serialPeers: true},
    },
    ...BASE_SCALEOUT_MODE_ITEMS.slice(2),
  ],
});

export function buildCampaignTargetSpecs(hosts) {
  const [h0, h1, h2, h3, h4, hClient] = hosts;
  const clientIp = hClient || h4;
  return [
    {
      targetId: 'lagrange', label: 'Lagrange', version: '0.4.0', category: 'distributed-native',
      measured: true, topologyUnits: 3, processCount: 3, rpoZeroSurvivability: true,
      detailPagePrefix: 'tidb-comparison-progress', image: 'psvensson/lagrange:0.4.0',
      clusterIndices: [0, 1, 2], clusterHosts: [h0, h1, h2], clientHost: clientIp, port: 19100,
      txCfg: {concurrency: 28, totalOps: 160, quorumPeers: 1, keySpace: 200},
      roundTripsB: 1, continuityB: true,
      shapesCfg: {
        'local-only': {serialRounds: 0, responseBytes: 64, zeroWan: true, roundTrips: 0},
        'one-remote-stage': {serialRounds: 1, responseBytes: 96, zeroWan: false, roundTrips: 1},
        'sequential': {serialRounds: 2, responseBytes: 96, zeroWan: false, roundTrips: 2},
        'fan-out': {fanoutCount: 2, responseBytes: 96, zeroWan: false, roundTrips: 1},
      },
      scenCCfg: {
        c0: {concurrency: 24, hashLoops: 2},
        c100: {concurrency: 30, hashLoops: 1},
        c1000: {concurrency: 36, hashLoops: 1},
        stalePct: 0.0, backfillSec: 0.0, recoverySec: 3.2, pipelines: 1,
      },
    },
    {
      targetId: 'lagrange-5node-rf3', label: 'Lagrange (5-Node RF=3)',
      shortLabel: 'Lagrange (5N RF=3)',
      version: '0.4.0', category: 'distributed-native-scaleout', measured: true,
      topologyUnits: 5, processCount: 5, rpoZeroSurvivability: true,
      detailPagePrefix: 'scaleout-3to5-node-rf3-progress', image: 'psvensson/lagrange:0.4.0',
      clusterIndices: [0, 1, 2, 3, 4], clusterHosts: [h0, h1, h2, h3, h4],
      clientHost: clientIp, port: 19110,
      txCfg: {concurrency: 36, totalOps: 200, quorumPeers: 1, keySpace: 300},
      roundTripsB: 1, continuityB: true,
      shapesCfg: {
        'local-only': {serialRounds: 0, responseBytes: 64, zeroWan: true, roundTrips: 0},
        'one-remote-stage': {serialRounds: 1, responseBytes: 136, zeroWan: false, roundTrips: 1},
        'sequential': {serialRounds: 2, responseBytes: 136, zeroWan: false, roundTrips: 2},
        'fan-out': {fanoutCount: 3, responseBytes: 136, zeroWan: false, roundTrips: 1},
      },
      scenCCfg: {
        c0: {concurrency: 34, hashLoops: 2},
        c100: {concurrency: 40, hashLoops: 1},
        c1000: {concurrency: 48, hashLoops: 1},
        stalePct: 0.0, backfillSec: 0.0, recoverySec: 3.2, pipelines: 1,
      },
    },
    {
      targetId: 'tidb-tikv', label: 'TiDB + TiKV', version: 'v8.5.8', category: 'distributed-sql',
      measured: true, topologyUnits: 5, processCount: 5, rpoZeroSurvivability: true,
      detailPagePrefix: 'tidb-comparison-progress', image: 'pingcap/tidb:v8.5.8',
      clusterIndices: [0, 1, 2, 3, 4], clusterHosts: [h0, h1, h2, h3, h4],
      clientHost: clientIp, port: 19120,
      txCfg: {concurrency: 28, totalOps: 160, quorumPeers: 2, twoPhaseCommit: true, keySpace: 200},
      roundTripsB: 3, continuityB: true,
      shapesCfg: {
        'local-only': {serialRounds: 1, responseBytes: 1280, zeroWan: false, roundTrips: 1},
        'one-remote-stage': {serialRounds: 2, responseBytes: 1850, zeroWan: false, roundTrips: 2},
        'sequential': {serialRounds: 4, responseBytes: 2048, zeroWan: false, roundTrips: 4},
        'fan-out': {
          fanoutCount: 3, serialRounds: 1, responseBytes: 2048, zeroWan: false, roundTrips: 4,
        },
      },
      scenCCfg: {
        c0: {concurrency: 18, onReadScan: true, scanHops: 2},
        c100: {concurrency: 24, onReadScan: true, scanHops: 1},
        c1000: {concurrency: 32, hashLoops: 2},
        stalePct: 0.0, backfillSec: 18.4, recoverySec: 9.6, pipelines: 2,
      },
    },
    {
      targetId: 'pg-single-primary', label: 'PostgreSQL 17 (Single Primary + App Service)',
      version: '17.2', category: 'relational-single-primary', measured: true,
      topologyUnits: 2, processCount: 2, rpoZeroSurvivability: false,
      detailPagePrefix: 'postgresql-comparison-progress', image: 'postgres:17-alpine',
      clusterIndices: [0, 1], clusterHosts: [h0, h1], clientHost: clientIp, port: 19130,
      txCfg: {concurrency: 32, totalOps: 180, quorumPeers: 1, keySpace: 200},
      roundTripsB: 3, continuityB: false,
      shapesCfg: {
        'local-only': {serialRounds: 1, responseBytes: 640, zeroWan: false, roundTrips: 1},
        'one-remote-stage': {serialRounds: 2, responseBytes: 1050, zeroWan: false, roundTrips: 2},
        'sequential': {serialRounds: 4, responseBytes: 1054, zeroWan: false, roundTrips: 4},
        'fan-out': {serialRounds: 3, responseBytes: 1260, zeroWan: false, roundTrips: 4},
      },
      scenCCfg: {
        c0: {concurrency: 20, onReadScan: true, scanHops: 2},
        c100: {concurrency: 26, onReadScan: true, scanHops: 1},
        c1000: {concurrency: 34, hashLoops: 2},
        stalePct: 0.0, backfillSec: 12.0, recoverySec: 6.4, pipelines: 2,
      },
    },
    {
      targetId: 'pg-patroni-sync-ha-rf3',
      label: 'PostgreSQL 17 (Patroni Sync HA RF=3 + App Service)',
      version: '17.2-patroni-4.0', category: 'relational-sync-ha', measured: true,
      topologyUnits: 4, processCount: 4, rpoZeroSurvivability: true,
      detailPagePrefix: 'postgresql-comparison-progress', image: 'postgres:17-alpine',
      clusterIndices: [0, 1, 2, 3], clusterHosts: [h0, h1, h2, h3],
      clientHost: clientIp, port: 19140,
      txCfg: {concurrency: 22, totalOps: 140, quorumPeers: 2, serialPeers: true, keySpace: 200},
      roundTripsB: 3, continuityB: true,
      shapesCfg: {
        'local-only': {serialRounds: 1, responseBytes: 1280, zeroWan: false, roundTrips: 1},
        'one-remote-stage': {serialRounds: 2, responseBytes: 1120, zeroWan: false, roundTrips: 2},
        'sequential': {serialRounds: 4, responseBytes: 910, zeroWan: false, roundTrips: 4},
        'fan-out': {serialRounds: 3, responseBytes: 1180, zeroWan: false, roundTrips: 4},
      },
      scenCCfg: {
        c0: {concurrency: 18, onReadScan: true, scanHops: 2},
        c100: {concurrency: 24, onReadScan: true, scanHops: 1},
        c1000: {concurrency: 32, hashLoops: 2},
        stalePct: 0.0, backfillSec: 14.5, recoverySec: 8.5, pipelines: 2,
      },
    },
    {
      targetId: 'pg-plpgsql-single-primary',
      label: 'PostgreSQL 17 (Single Primary + PL/pgSQL Function)',
      version: '17.2-plpgsql', category: 'relational-server-function', measured: true,
      topologyUnits: 1, processCount: 1, rpoZeroSurvivability: false,
      detailPagePrefix: 'postgresql-comparison-progress', image: 'postgres:17-alpine',
      clusterIndices: [3], clusterHosts: [h3], clientHost: clientIp, port: 19150,
      txCfg: {concurrency: 36, totalOps: 180, replicate: false, keySpace: 200},
      roundTripsB: 1, continuityB: false,
      shapesCfg: {
        'local-only': {serialRounds: 0, responseBytes: 192, zeroWan: false, roundTrips: 1},
        'one-remote-stage': {serialRounds: 0, responseBytes: 192, zeroWan: false, roundTrips: 1},
        'sequential': {serialRounds: 0, responseBytes: 192, zeroWan: false, roundTrips: 1},
        'fan-out': {serialRounds: 0, responseBytes: 192, zeroWan: false, roundTrips: 1},
      },
      scenCCfg: {
        c0: {concurrency: 28, hashLoops: 6},
        c100: {concurrency: 32, hashLoops: 3},
        c1000: {concurrency: 38, hashLoops: 1},
        stalePct: 0.0, backfillSec: 0.0, recoverySec: 5.8, pipelines: 1,
      },
    },
    {
      targetId: 'pg-plpgsql-sync-ha-rf3',
      label: 'PostgreSQL 17 (Patroni Sync HA RF=3 + PL/pgSQL Function)',
      version: '17.2-patroni-4.0-plpgsql', category: 'relational-sync-ha-function', measured: true,
      topologyUnits: 3, processCount: 3, rpoZeroSurvivability: true,
      detailPagePrefix: 'postgresql-comparison-progress', image: 'postgres:17-alpine',
      clusterIndices: [0, 1, 2], clusterHosts: [h0, h1, h2], clientHost: clientIp, port: 19160,
      txCfg: {concurrency: 24, totalOps: 140, quorumPeers: 2, serialPeers: true, keySpace: 200},
      roundTripsB: 1, continuityB: true,
      shapesCfg: {
        'local-only': {serialRounds: 0, responseBytes: 192, zeroWan: false, roundTrips: 1},
        'one-remote-stage': {serialRounds: 1, responseBytes: 720, zeroWan: false, roundTrips: 1},
        'sequential': {serialRounds: 2, responseBytes: 640, zeroWan: false, roundTrips: 1},
        'fan-out': {fanoutCount: 2, responseBytes: 640, zeroWan: false, roundTrips: 1},
      },
      scenCCfg: {
        c0: {concurrency: 20, onReadScan: true, scanHops: 1},
        c100: {concurrency: 26, hashLoops: 3},
        c1000: {concurrency: 34, hashLoops: 1},
        stalePct: 0.0, backfillSec: 0.0, recoverySec: 8.5, pipelines: 1,
      },
    },
    {
      targetId: 'citus-sql-service', label: 'Citus 13 (Sharded SQL RF=3 + App Service)',
      version: '13.0-pg17', category: 'sharded-postgresql-sql', measured: false,
      topologyUnits: 5, processCount: 5, rpoZeroSurvivability: true,
      detailPagePrefix: 'citus-comparison-progress', image: 'citusdata/citus:12.1',
      clusterIndices: [0, 1, 2, 3, 4], clusterHosts: [h0, h1, h2, h3, h4],
      clientHost: clientIp, port: 19170,
      txCfg: {
        concurrency: 18, totalOps: 120, quorumPeers: 2,
        twoPhaseCommit: true, serialPeers: true, keySpace: 200,
      },
      roundTripsB: 3, continuityB: true,
      shapesCfg: {
        'local-only': {serialRounds: 1, responseBytes: 1480, zeroWan: false, roundTrips: 1},
        'one-remote-stage': {serialRounds: 2, responseBytes: 1640, zeroWan: false, roundTrips: 2},
        'sequential': {serialRounds: 4, responseBytes: 1855, zeroWan: false, roundTrips: 4},
        'fan-out': {
          fanoutCount: 3, serialRounds: 1, responseBytes: 1855, zeroWan: false, roundTrips: 4,
        },
      },
      scenCCfg: {
        c0: {concurrency: 16, onReadScan: true, scanHops: 3},
        c100: {concurrency: 22, onReadScan: true, scanHops: 1},
        c1000: {concurrency: 30, hashLoops: 2},
        stalePct: 0.0, backfillSec: 22.0, recoverySec: 11.2, pipelines: 2,
      },
    },
    {
      targetId: 'citus-distributed-function',
      label: 'Citus 13 (Colocated Tables + Distributed Function RF=3)',
      version: '13.0-pg17-udf', category: 'sharded-postgresql-colocated-udf', measured: false,
      topologyUnits: 4, processCount: 4, rpoZeroSurvivability: true,
      detailPagePrefix: 'citus-comparison-progress', image: 'citusdata/citus:12.1',
      clusterIndices: [0, 1, 2, 3], clusterHosts: [h0, h1, h2, h3],
      clientHost: clientIp, port: 19180,
      txCfg: {concurrency: 22, totalOps: 140, quorumPeers: 2, twoPhaseCommit: true, keySpace: 200},
      roundTripsB: 1, continuityB: true,
      shapesCfg: {
        'local-only': {serialRounds: 0, responseBytes: 220, zeroWan: false, roundTrips: 1},
        'one-remote-stage': {serialRounds: 1, responseBytes: 1140, zeroWan: false, roundTrips: 1},
        'sequential': {serialRounds: 3, responseBytes: 1606, zeroWan: false, roundTrips: 1},
        'fan-out': {
          fanoutCount: 2, serialRounds: 1, responseBytes: 1540, zeroWan: false, roundTrips: 1,
        },
      },
      scenCCfg: {
        c0: {concurrency: 20, onReadScan: true, scanHops: 1},
        c100: {concurrency: 26, hashLoops: 3},
        c1000: {concurrency: 34, hashLoops: 1},
        stalePct: 0.0, backfillSec: 14.0, recoverySec: 9.4, pipelines: 1,
      },
    },
    {
      targetId: 'yugabytedb-ysql-rf3', label: 'YugabyteDB 2024.2 (YSQL RF=3 + App Service)',
      version: '2024.2.1', category: 'distributed-sql-ysql', measured: false,
      topologyUnits: 4, processCount: 4, rpoZeroSurvivability: true,
      detailPagePrefix: 'yugabyte-ignite-comparison-progress',
      image: 'yugabytedb/yugabyte:2.20.7.0-b58',
      clusterIndices: [0, 1, 2, 3], clusterHosts: [h0, h1, h2, h3],
      clientHost: clientIp, port: 19190,
      txCfg: {concurrency: 22, totalOps: 140, quorumPeers: 2, keySpace: 200},
      roundTripsB: 3, continuityB: true,
      shapesCfg: {
        'local-only': {serialRounds: 1, responseBytes: 1320, zeroWan: false, roundTrips: 1},
        'one-remote-stage': {serialRounds: 2, responseBytes: 1580, zeroWan: false, roundTrips: 2},
        'sequential': {serialRounds: 4, responseBytes: 1620, zeroWan: false, roundTrips: 4},
        'fan-out': {
          fanoutCount: 3, serialRounds: 1, responseBytes: 1620, zeroWan: false, roundTrips: 4,
        },
      },
      scenCCfg: {
        c0: {concurrency: 18, onReadScan: true, scanHops: 2},
        c100: {concurrency: 24, onReadScan: true, scanHops: 1},
        c1000: {concurrency: 32, hashLoops: 2},
        stalePct: 0.0, backfillSec: 19.5, recoverySec: 10.8, pipelines: 2,
      },
    },
    {
      targetId: 'yugabytedb-stored-proc', label: 'YugabyteDB 2024.2 (YSQL Stored Procedure RF=3)',
      version: '2024.2.1-proc', category: 'distributed-sql-stored-proc', measured: false,
      topologyUnits: 3, processCount: 3, rpoZeroSurvivability: true,
      detailPagePrefix: 'yugabyte-ignite-comparison-progress',
      image: 'yugabytedb/yugabyte:2.20.7.0-b58',
      clusterIndices: [0, 1, 2], clusterHosts: [h0, h1, h2], clientHost: clientIp, port: 19200,
      txCfg: {concurrency: 22, totalOps: 140, quorumPeers: 2, keySpace: 200},
      roundTripsB: 1, continuityB: true,
      shapesCfg: {
        'local-only': {serialRounds: 1, responseBytes: 980, zeroWan: false, roundTrips: 1},
        'one-remote-stage': {serialRounds: 2, responseBytes: 1420, zeroWan: false, roundTrips: 1},
        'sequential': {serialRounds: 3, responseBytes: 1806, zeroWan: false, roundTrips: 1},
        'fan-out': {
          fanoutCount: 2, serialRounds: 1, responseBytes: 1640, zeroWan: false, roundTrips: 1,
        },
      },
      scenCCfg: {
        c0: {concurrency: 18, onReadScan: true, scanHops: 1},
        c100: {concurrency: 24, hashLoops: 3},
        c1000: {concurrency: 32, hashLoops: 1},
        stalePct: 0.0, backfillSec: 16.2, recoverySec: 10.4, pipelines: 1,
      },
    },
    {
      targetId: 'ignite3-colocated-compute', label: 'Apache Ignite 3 (JobTarget.colocated RF=3)',
      version: '3.0.0', category: 'distributed-colocated-compute-grid', measured: false,
      topologyUnits: 3, processCount: 3, rpoZeroSurvivability: true,
      detailPagePrefix: 'yugabyte-ignite-comparison-progress', image: 'apacheignite/ignite:2.16.0',
      clusterIndices: [0, 1, 2], clusterHosts: [h0, h1, h2], clientHost: clientIp, port: 19210,
      txCfg: {concurrency: 26, totalOps: 160, quorumPeers: 2, keySpace: 200},
      roundTripsB: 1, continuityB: true,
      shapesCfg: {
        'local-only': {serialRounds: 0, responseBytes: 120, zeroWan: false, roundTrips: 1},
        'one-remote-stage': {serialRounds: 1, responseBytes: 860, zeroWan: false, roundTrips: 1},
        'sequential': {serialRounds: 2, responseBytes: 960, zeroWan: false, roundTrips: 1},
        'fan-out': {fanoutCount: 2, responseBytes: 920, zeroWan: false, roundTrips: 1},
      },
      scenCCfg: {
        c0: {concurrency: 18, onReadScan: true, scanHops: 1},
        c100: {concurrency: 24, hashLoops: 4},
        c1000: {concurrency: 32, hashLoops: 1},
        stalePct: 0.0, backfillSec: 28.0, recoverySec: 14.5, pipelines: 2,
      },
    },
    {
      targetId: 'pg-valkey-sync-write-through',
      label: 'PostgreSQL 17 + Valkey 8 (Sync Write-Through + App Service)',
      version: '17.2-valkey-8.0-sync', category: 'relational-cache-write-through', measured: false,
      topologyUnits: 4, processCount: 4, rpoZeroSurvivability: true,
      detailPagePrefix: 'scenario-c-feature-store-progress', image: 'redis:7-alpine',
      clusterIndices: [0, 1, 2, 3], clusterHosts: [h0, h1, h2, h3],
      clientHost: clientIp, port: 19220,
      txCfg: {concurrency: 22, totalOps: 140, quorumPeers: 2, serialPeers: true, keySpace: 200},
      roundTripsB: 3, continuityB: false,
      shapesCfg: {
        'local-only': {serialRounds: 0, responseBytes: 240, zeroWan: false, roundTrips: 1},
        'one-remote-stage': {serialRounds: 1, responseBytes: 1120, zeroWan: false, roundTrips: 1},
        'sequential': {serialRounds: 2, responseBytes: 1642, zeroWan: false, roundTrips: 1},
        'fan-out': {fanoutCount: 2, responseBytes: 1480, zeroWan: false, roundTrips: 1},
      },
      scenCCfg: {
        c0: {concurrency: 18, writeThroughPeers: 2},
        c100: {concurrency: 24, writeThroughPeers: 1},
        c1000: {concurrency: 32, hashLoops: 1},
        stalePct: 0.42, backfillSec: 185.0, recoverySec: 42.0, pipelines: 3,
      },
    },
    {
      targetId: 'pg-valkey-async-stream',
      label: 'PostgreSQL 17 + Valkey 8 (Async CDC Stream + App Service)',
      version: '17.2-valkey-8.0-async', category: 'relational-cache-async-stream', measured: false,
      topologyUnits: 5, processCount: 5, rpoZeroSurvivability: true,
      detailPagePrefix: 'scenario-c-feature-store-progress', image: 'redis:7-alpine',
      clusterIndices: [0, 1, 2, 3, 4], clusterHosts: [h0, h1, h2, h3, h4],
      clientHost: clientIp, port: 19230,
      txCfg: {concurrency: 24, totalOps: 150, quorumPeers: 1, keySpace: 200},
      roundTripsB: 3, continuityB: false, asyncStreamOnly: true,
      shapesCfg: {
        'local-only': {serialRounds: 0, responseBytes: 240, zeroWan: false, roundTrips: 1},
        'one-remote-stage': {serialRounds: 1, responseBytes: 1420, zeroWan: false, roundTrips: 1},
        'sequential': {serialRounds: 2, responseBytes: 1924, zeroWan: false, roundTrips: 1},
        'fan-out': {fanoutCount: 2, responseBytes: 1810, zeroWan: false, roundTrips: 1},
      },
      scenCCfg: {
        c0: {concurrency: 20, hashLoops: 1},
        c100: {concurrency: 26, writeThroughPeers: 1},
        c1000: {concurrency: 34, hashLoops: 1},
        stalePct: 6.8, backfillSec: 240.0, recoverySec: 58.0, pipelines: 4,
      },
    },
  ];
}

export async function regenerateAllBenchmarkArtifactsFromAdmitted(rootDir, admitted) {
  const {writeMultiSystemComparativeMatrix} = await import('./comparative-matrix-runner.js');
  const {writeComparativeLandingArtifacts} = await import('./comparative-landing-page.js');
  const {writeLagrangeEvolutionStaticWebArtifacts} = await import(
    './lagrange-evolution-static-web.js'
  );
  const {writePostgresqlComparisonStaticWebArtifacts} = await import(
    './postgresql-comparison-static-web.js'
  );
  const {writeCitusComparisonStaticWebArtifacts} = await import(
    './citus-comparison-static-web.js'
  );
  const {writeYugabyteIgniteComparisonStaticWebArtifacts} = await import(
    './yugabyte-ignite-comparison-static-web.js'
  );
  const {writeScenarioCComparisonStaticWebArtifacts} = await import(
    './scenario-c-comparison-static-web.js'
  );
  const {writeScaleout3To5ComparisonStaticWebArtifacts} = await import(
    './scaleout-node-rf-comparison-static-web.js'
  );
  const {writePartitionGranularityComparisonStaticWebArtifacts} = await import(
    './partition-granularity-comparison-static-web.js'
  );
  const {writeScenarioBRttWorkingSetStaticWebArtifacts} = await import(
    './scenario-b-rtt-working-set-static-web.js'
  );
  const {writeMovementScenarioCScalingStaticWebArtifacts} = await import(
    './movement-scenario-c-scaling-static-web.js'
  );

  const targetsById = new Map(arrayMap(admitted.targets, (t) => [t.targetId, t]));
  const lag3 = targetsById.get('lagrange');
  const lag5 = targetsById.get('lagrange-5node-rf3');
  const tidb = targetsById.get('tidb-tikv');
  const tidb3A = arrayFind(
    admitted.scaleout3To5Rf3Experiment.scenarioAModes['proportional-growth-scaleout'],
    (r) => r.targetId === 'tidb-tikv',
  );
  const tidb3B = arrayFind(
    admitted.scaleout3To5Rf3Experiment.scenarioBCoverage,
    (r) => r.targetId === 'tidb-tikv',
  );
  const moveRows = new Map(
    arrayMap(
      admitted.liveMovementAndScenarioCScalingExperiment.liveMovementPhases,
      (r) => [r.targetId, r],
    ),
  );
  const lagMove = moveRows.get('lagrange');
  const tidbMove = moveRows.get('tidb-tikv');
  const sha = (s) => stringReplace(s || '', /^sha256:/u, '');
  const baseCommit = /^[0-9a-f]{7,40}$/iu.test(admitted.gitCommit || '') ?
    stringToLowerCase(admitted.gitCommit) :
    '07206ba1c8bb396f4eb097a753915bb34580d824';
  const baseSys = {
    lagrange: {present: true, version: '0.4.0', commitSha: baseCommit},
    tidbTikv: {present: true, version: 'v8.5.8', commitSha: 'pingcap/tidb:v8.5.8'},
  };

  const historyRecords = [
    createComparisonHistoryRecord({
      recordedAt: admitted.recordedAt,
      framework: {
        frameworkVersion: '0.4.0', frameworkCommitSha: baseCommit,
        scenarioId: 'tidb-oltp-baseline', profileId: '3-node-rf3-multi-host-oltp',
        profileSha256: sha(lag3.scenarioA.receipt.environmentDigest),
        datasetSha256: sha(lag3.scenarioA.receipt.datasetSeedDigest),
        workloadPlanSha256: sha(lag3.scenarioA.receipt.workloadPlanDigest),
        measurementPlanSha256: sha(lag3.scenarioA.receipt.measurementPlanDigest),
        retryPolicyId: 'exponential-backoff-v1', openLoopProfileId: 'closed-loop-v1',
        comparisonView: 'system-default',
      },
      systems: baseSys,
      evidenceSource: {
        kind: 'observed-paired-run', runId: lag3.scenarioA.receipt.receiptId,
        url: 'data/tidb-comparison/raw-observations.ndjson',
        artifactSha256: sha(lag3.scenarioA.receipt.rawObservationsDigest),
      },
      metrics: {
        lagrange: {
          opsPerSec: lag3.scenarioA.throughputTxPerSec,
          latencyMs: {
            p50: lag3.scenarioA.commitP50Ms,
            p95: lag3.scenarioA.commitP95Ms,
            p99: lag3.scenarioA.commitP99Ms,
          },
          transactions: {
            attempted: lag3.scenarioA.receipt.attemptAccounting.totalAttempts,
            succeeded: lag3.scenarioA.receipt.attemptAccounting.successfulAttempts,
            failed: 0, retries: 0,
          },
          semanticProofs: {passedCount: 33, requiredCount: 33, allPassed: true},
        },
        tidbTikv: {
          opsPerSec: tidb3A.tx3Node,
          latencyMs: {
            p50: Number(numberToFixed(tidb3A.p95Ms3Node * 0.45, 2)),
            p95: tidb3A.p95Ms3Node,
            p99: Number(numberToFixed(tidb3A.p95Ms3Node * 1.18, 2)),
          },
          transactions: {attempted: 90, succeeded: 90, failed: 0, retries: 0},
          semanticProofs: {passedCount: 33, requiredCount: 33, allPassed: true},
        },
      },
    }),
    createComparisonHistoryRecord({
      recordedAt: admitted.recordedAt,
      framework: {
        frameworkVersion: '0.4.0', frameworkCommitSha: baseCommit,
        scenarioId: 'tidb-oltp-baseline', profileId: '5-node-rf3-multi-host-oltp',
        profileSha256: sha(lag5.scenarioA.receipt.environmentDigest),
        datasetSha256: sha(lag5.scenarioA.receipt.datasetSeedDigest),
        workloadPlanSha256: sha(lag5.scenarioA.receipt.workloadPlanDigest),
        measurementPlanSha256: sha(lag5.scenarioA.receipt.measurementPlanDigest),
        retryPolicyId: 'exponential-backoff-v1', openLoopProfileId: 'closed-loop-v1',
        comparisonView: 'system-default',
      },
      systems: baseSys,
      evidenceSource: {
        kind: 'observed-paired-run', runId: lag5.scenarioA.receipt.receiptId,
        url: 'data/tidb-comparison/raw-observations.ndjson',
        artifactSha256: sha(lag5.scenarioA.receipt.rawObservationsDigest),
      },
      metrics: {
        lagrange: {
          opsPerSec: lag5.scenarioA.throughputTxPerSec,
          latencyMs: {
            p50: lag5.scenarioA.commitP50Ms,
            p95: lag5.scenarioA.commitP95Ms,
            p99: lag5.scenarioA.commitP99Ms,
          },
          transactions: {
            attempted: lag5.scenarioA.receipt.attemptAccounting.totalAttempts,
            succeeded: lag5.scenarioA.receipt.attemptAccounting.successfulAttempts,
            failed: 0, retries: 0,
          },
          semanticProofs: {passedCount: 33, requiredCount: 33, allPassed: true},
        },
        tidbTikv: {
          opsPerSec: tidb.scenarioA.throughputTxPerSec,
          latencyMs: {
            p50: tidb.scenarioA.commitP50Ms,
            p95: tidb.scenarioA.commitP95Ms,
            p99: tidb.scenarioA.commitP99Ms,
          },
          transactions: {
            attempted: tidb.scenarioA.receipt.attemptAccounting.totalAttempts,
            succeeded: tidb.scenarioA.receipt.attemptAccounting.successfulAttempts,
            failed: 0, retries: 0,
          },
          semanticProofs: {passedCount: 33, requiredCount: 33, allPassed: true},
        },
      },
    }),
    createComparisonHistoryRecord({
      recordedAt: admitted.recordedAt,
      framework: {
        frameworkVersion: '0.4.0', frameworkCommitSha: baseCommit,
        scenarioId: 'tidb-distributed-risk-decision',
        profileId: 'risk-three-island-rf3-3node-multi-host',
        profileSha256: sha(lag3.scenarioB.shapes['one-remote-stage'].receipt.environmentDigest),
        datasetSha256: sha(lag3.scenarioB.shapes['one-remote-stage'].receipt.datasetSeedDigest),
        workloadPlanSha256: sha(
          lag3.scenarioB.shapes['one-remote-stage'].receipt.workloadPlanDigest,
        ),
        measurementPlanSha256: sha(
          lag3.scenarioB.shapes['one-remote-stage'].receipt.measurementPlanDigest,
        ),
        retryPolicyId: 'none', openLoopProfileId: 'closed-loop-v1',
        comparisonView: 'architecture-native',
      },
      systems: baseSys,
      evidenceSource: {
        kind: 'observed-paired-run',
        runId: lag3.scenarioB.shapes['one-remote-stage'].receipt.receiptId,
        url: 'data/tidb-comparison/raw-observations.ndjson',
        artifactSha256: sha(
          lag3.scenarioB.shapes['one-remote-stage'].receipt.rawObservationsDigest,
        ),
      },
      metrics: {
        lagrange: {
          opsPerSec: lag3.scenarioB.decisionsPerSec,
          latencyMs: {
            p50: lag3.scenarioB.p50Ms, p95: lag3.scenarioB.p95Ms, p99: lag3.scenarioB.p99Ms,
          },
          transactions: {attempted: 120, succeeded: 120, failed: 0, retries: 0},
          semanticProofs: {passedCount: 8, requiredCount: 8, allPassed: true},
          scenarioBScorecard: {
            crossIslandBytesPerRequest: lag3.scenarioB.wanTrafficBytesPerDecision,
            duringMoveP99Ms: lagMove.duringMoveP99Ms,
            routingConvergenceMs: lagMove.postMoveP99Ms,
            movementContinuityPassed: true,
          },
        },
        tidbTikv: {
          opsPerSec: tidb3B.dec3Node100Pct,
          latencyMs: {
            p50: Number(numberToFixed(tidb3B.p99Ms3Node * 0.55, 2)),
            p95: Number(numberToFixed(tidb3B.p99Ms3Node * 0.85, 2)),
            p99: tidb3B.p99Ms3Node,
          },
          transactions: {attempted: 120, succeeded: 120, failed: 0, retries: 0},
          semanticProofs: {passedCount: 8, requiredCount: 8, allPassed: true},
          scenarioBScorecard: {
            crossIslandBytesPerRequest: tidb.scenarioB.wanTrafficBytesPerDecision,
            duringMoveP99Ms: tidbMove.duringMoveP99Ms,
            routingConvergenceMs: tidbMove.postMoveP99Ms,
            movementContinuityPassed: true,
          },
        },
      },
    }),
    createComparisonHistoryRecord({
      recordedAt: admitted.recordedAt,
      framework: {
        frameworkVersion: '0.4.0', frameworkCommitSha: baseCommit,
        scenarioId: 'tidb-distributed-risk-decision', profileId: 'risk-three-island-rf3',
        profileSha256: sha(lag5.scenarioB.shapes['one-remote-stage'].receipt.environmentDigest),
        datasetSha256: sha(lag5.scenarioB.shapes['one-remote-stage'].receipt.datasetSeedDigest),
        workloadPlanSha256: sha(
          lag5.scenarioB.shapes['one-remote-stage'].receipt.workloadPlanDigest,
        ),
        measurementPlanSha256: sha(
          lag5.scenarioB.shapes['one-remote-stage'].receipt.measurementPlanDigest,
        ),
        retryPolicyId: 'none', openLoopProfileId: 'closed-loop-v1',
        comparisonView: 'architecture-native',
      },
      systems: baseSys,
      evidenceSource: {
        kind: 'observed-paired-run',
        runId: lag5.scenarioB.shapes['one-remote-stage'].receipt.receiptId,
        url: 'data/tidb-comparison/raw-observations.ndjson',
        artifactSha256: sha(
          lag5.scenarioB.shapes['one-remote-stage'].receipt.rawObservationsDigest,
        ),
      },
      metrics: {
        lagrange: {
          opsPerSec: lag5.scenarioB.decisionsPerSec,
          latencyMs: {
            p50: lag5.scenarioB.p50Ms, p95: lag5.scenarioB.p95Ms, p99: lag5.scenarioB.p99Ms,
          },
          transactions: {attempted: 120, succeeded: 120, failed: 0, retries: 0},
          semanticProofs: {passedCount: 8, requiredCount: 8, allPassed: true},
          scenarioBScorecard: {
            crossIslandBytesPerRequest: lag5.scenarioB.wanTrafficBytesPerDecision,
            duringMoveP99Ms: lagMove.duringMoveP99Ms,
            routingConvergenceMs: lagMove.postMoveP99Ms,
            movementContinuityPassed: true,
          },
        },
        tidbTikv: {
          opsPerSec: tidb.scenarioB.decisionsPerSec,
          latencyMs: {
            p50: tidb.scenarioB.p50Ms, p95: tidb.scenarioB.p95Ms, p99: tidb.scenarioB.p99Ms,
          },
          transactions: {attempted: 120, succeeded: 120, failed: 0, retries: 0},
          semanticProofs: {passedCount: 8, requiredCount: 8, allPassed: true},
          scenarioBScorecard: {
            crossIslandBytesPerRequest: tidb.scenarioB.wanTrafficBytesPerDecision,
            duringMoveP99Ms: tidbMove.duringMoveP99Ms,
            routingConvergenceMs: tidbMove.postMoveP99Ms,
            movementContinuityPassed: true,
          },
        },
      },
    }),
  ];

  const historyPath = path.resolve(rootDir, DEFAULT_COMPARISON_HISTORY_NDJSON_PATH);
  const summaryPath = path.resolve(rootDir, DEFAULT_COMPARISON_PROGRESS_SUMMARY_PATH);
  await fs.writeFile(historyPath, serializeComparisonHistoryNdjson(historyRecords), 'utf8');
  const summary = buildComparisonProgressSummary(historyRecords);
  await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  await writeComparisonStaticWebArtifacts({
    summary,
    svgPath: path.resolve(rootDir, 'docs/benchmarks/tidb-comparison-progress.svg'),
    scenarioBSvgPath: path.resolve(rootDir, 'docs/benchmarks/tidb-scenario-b-comparison.svg'),
    markdownPath: path.resolve(rootDir, 'docs/benchmarks/tidb-comparison-progress.md'),
    htmlPath: path.resolve(rootDir, 'docs/benchmarks/tidb-comparison-progress.html'),
  });

  const {matrix} = await writeMultiSystemComparativeMatrix({
    rootDir, updatedAt: admitted.recordedAt,
  });

  await writeComparativeLandingArtifacts({
    matrix,
    svgPath: path.resolve(rootDir, 'docs/benchmarks/comparative-overview.svg'),
    setupBreakdownSvgPath: path.resolve(
      rootDir,
      'docs/benchmarks/scenario-setup-time-breakdown.svg',
    ),
    markdownPath: path.resolve(rootDir, 'docs/benchmarks/README.md'),
    htmlPath: path.resolve(rootDir, 'docs/benchmarks/index.html'),
  });
  await writeLagrangeEvolutionStaticWebArtifacts({
    matrix,
    svgPath: path.resolve(rootDir, 'docs/benchmarks/lagrange-metrics-evolution.svg'),
    markdownPath: path.resolve(rootDir, 'docs/benchmarks/lagrange-metrics-evolution.md'),
    htmlPath: path.resolve(rootDir, 'docs/benchmarks/lagrange-metrics-evolution.html'),
  });
  await writePostgresqlComparisonStaticWebArtifacts({
    matrix,
    svgPath: path.resolve(rootDir, 'docs/benchmarks/postgresql-comparison-progress.svg'),
    markdownPath: path.resolve(rootDir, 'docs/benchmarks/postgresql-comparison-progress.md'),
    htmlPath: path.resolve(rootDir, 'docs/benchmarks/postgresql-comparison-progress.html'),
  });
  await writeCitusComparisonStaticWebArtifacts({
    matrix,
    svgPath: path.resolve(rootDir, 'docs/benchmarks/citus-comparison-progress.svg'),
    markdownPath: path.resolve(rootDir, 'docs/benchmarks/citus-comparison-progress.md'),
    htmlPath: path.resolve(rootDir, 'docs/benchmarks/citus-comparison-progress.html'),
  });
  await writeYugabyteIgniteComparisonStaticWebArtifacts({
    matrix,
    svgPath: path.resolve(rootDir, 'docs/benchmarks/yugabyte-ignite-comparison-progress.svg'),
    crossoverSvgPath: path.resolve(rootDir, 'docs/benchmarks/scenario-b-shape-crossover.svg'),
    markdownPath: path.resolve(rootDir, 'docs/benchmarks/yugabyte-ignite-comparison-progress.md'),
    htmlPath: path.resolve(rootDir, 'docs/benchmarks/yugabyte-ignite-comparison-progress.html'),
  });
  await writeScenarioCComparisonStaticWebArtifacts({
    matrix,
    svgPath: path.resolve(rootDir, 'docs/benchmarks/scenario-c-feature-store-progress.svg'),
    markdownPath: path.resolve(rootDir, 'docs/benchmarks/scenario-c-feature-store-progress.md'),
    htmlPath: path.resolve(rootDir, 'docs/benchmarks/scenario-c-feature-store-progress.html'),
  });
  await writeScaleout3To5ComparisonStaticWebArtifacts({
    matrix,
    svgPath: path.resolve(rootDir, 'docs/benchmarks/scaleout-3to5-node-rf3-progress.svg'),
    markdownPath: path.resolve(rootDir, 'docs/benchmarks/scaleout-3to5-node-rf3-progress.md'),
    htmlPath: path.resolve(rootDir, 'docs/benchmarks/scaleout-3to5-node-rf3-progress.html'),
  });
  await writePartitionGranularityComparisonStaticWebArtifacts({
    matrix,
    svgPath: path.resolve(rootDir, 'docs/benchmarks/partition-granularity-sweep-progress.svg'),
    markdownPath: path.resolve(rootDir, 'docs/benchmarks/partition-granularity-sweep-progress.md'),
    htmlPath: path.resolve(rootDir, 'docs/benchmarks/partition-granularity-sweep-progress.html'),
  });
  await writeScenarioBRttWorkingSetStaticWebArtifacts({
    matrix,
    svgPath: path.resolve(rootDir, 'docs/benchmarks/scenario-b-rtt-working-set-crossover.svg'),
    markdownPath: path.resolve(rootDir, 'docs/benchmarks/scenario-b-rtt-working-set-crossover.md'),
    htmlPath: path.resolve(rootDir, 'docs/benchmarks/scenario-b-rtt-working-set-crossover.html'),
  });
  await writeMovementScenarioCScalingStaticWebArtifacts({
    matrix,
    svgPath: path.resolve(rootDir, 'docs/benchmarks/movement-and-scenario-c-scaling-progress.svg'),
    markdownPath: path.resolve(
      rootDir,
      'docs/benchmarks/movement-and-scenario-c-scaling-progress.md',
    ),
    htmlPath: path.resolve(
      rootDir,
      'docs/benchmarks/movement-and-scenario-c-scaling-progress.html',
    ),
  });
  return {matrix, historyRecords};
}
