// Campaign deployment configuration and the one regeneration path for every
// comparative benchmark artifact. Regeneration reads the raw observation store,
// the invalidation ledger and the history; it writes only derived files (admitted
// cells, matrix, progress summary, pages) and never writes the history.
import fs from 'node:fs/promises';
import path from 'node:path';

import {readInvalidationLedger} from './benchmark-invalidation-ledger.js';
import {writeCitusComparisonStaticWebArtifacts} from './citus-comparison-static-web.js';
import {writeComparativeLandingArtifacts} from './comparative-landing-page.js';
import {writeMultiSystemComparativeMatrix} from './comparative-matrix-runner.js';
import {writeLagrangeEvolutionStaticWebArtifacts} from './lagrange-evolution-static-web.js';
import {
  writeMovementScenarioCScalingStaticWebArtifacts,
} from './movement-scenario-c-scaling-static-web.js';
import {
  DEFAULT_COMPARISON_HISTORY_NDJSON_PATH,
  DEFAULT_COMPARISON_PROGRESS_SUMMARY_PATH,
  buildComparisonProgressSummary,
  parseComparisonHistoryNdjson,
} from './oltp-comparison-history-store.js';
import {writeComparisonStaticWebArtifacts} from './oltp-comparison-static-web.js';
import {
  writePartitionGranularityComparisonStaticWebArtifacts,
} from './partition-granularity-comparison-static-web.js';
import {
  writePostgresqlComparisonStaticWebArtifacts,
} from './postgresql-comparison-static-web.js';
import {
  DEFAULT_ADMITTED_LAB_MEASUREMENTS_PATH,
  serializeAdmittedMeasurements,
} from './raw-observation-store.js';
import {
  writeScaleout3To5ComparisonStaticWebArtifacts,
} from './scaleout-node-rf-comparison-static-web.js';
import {
  writeScenarioBRttWorkingSetStaticWebArtifacts,
} from './scenario-b-rtt-working-set-static-web.js';
import {writeScenarioCComparisonStaticWebArtifacts} from './scenario-c-comparison-static-web.js';
import {
  writeYugabyteIgniteComparisonStaticWebArtifacts,
} from './yugabyte-ignite-comparison-static-web.js';

const arrayMap = Function.call.bind(Array.prototype.map);

// Deployment configuration the campaign runner reads: which image runs where and on
// which port, and the client concurrency/size knobs. It carries no published value:
// labels and claims live in comparative-coverage-manifest.js, results only come
// from admitted observations.
const CAMPAIGN_DEPLOYMENTS = Object.freeze([
  ['lagrange', 'psvensson/lagrange:0.4.0', [0, 1, 2], 19100, true,
    {concurrency: 28, totalOps: 160, keySpace: 200}],
  ['lagrange-5node-rf3', 'psvensson/lagrange:0.4.0', [0, 1, 2, 3, 4], 19110, true,
    {concurrency: 36, totalOps: 200, keySpace: 300}],
  ['tidb-tikv', 'pingcap/tidb:v8.5.8', [0, 1, 2, 3, 4], 19120, true,
    {concurrency: 28, totalOps: 160, keySpace: 200}],
  ['pg-single-primary', 'postgres:17-alpine', [0, 1], 19130, true,
    {concurrency: 32, totalOps: 180, keySpace: 200}],
  ['pg-patroni-sync-ha-rf3', 'postgres:17-alpine', [0, 1, 2, 3], 19140, true,
    {concurrency: 22, totalOps: 140, keySpace: 200}],
  ['pg-plpgsql-single-primary', 'postgres:17-alpine', [3], 19150, true,
    {concurrency: 36, totalOps: 180, keySpace: 200}],
  ['pg-plpgsql-sync-ha-rf3', 'postgres:17-alpine', [0, 1, 2], 19160, true,
    {concurrency: 24, totalOps: 140, keySpace: 200}],
  ['citus-sql-service', 'citusdata/citus:12.1', [0, 1, 2, 3, 4], 19170, false,
    {concurrency: 18, totalOps: 120, keySpace: 200}],
  ['citus-distributed-function', 'citusdata/citus:12.1', [0, 1, 2, 3], 19180, false,
    {concurrency: 22, totalOps: 140, keySpace: 200}],
  ['yugabytedb-ysql-rf3', 'yugabytedb/yugabyte:2.20.7.0-b58', [0, 1, 2, 3], 19190, false,
    {concurrency: 22, totalOps: 140, keySpace: 200}],
  ['yugabytedb-stored-proc', 'yugabytedb/yugabyte:2.20.7.0-b58', [0, 1, 2], 19200, false,
    {concurrency: 22, totalOps: 140, keySpace: 200}],
  ['ignite3-colocated-compute', 'apacheignite/ignite:2.16.0', [0, 1, 2], 19210, false,
    {concurrency: 26, totalOps: 160, keySpace: 200}],
  ['pg-valkey-sync-write-through', 'redis:7-alpine', [0, 1, 2, 3], 19220, false,
    {concurrency: 22, totalOps: 140, keySpace: 200}],
  ['pg-valkey-async-stream', 'redis:7-alpine', [0, 1, 2, 3, 4], 19230, false,
    {concurrency: 24, totalOps: 150, keySpace: 200}],
]);

export function buildCampaignTargetSpecs(hosts) {
  const [h0, h1, h2, h3, h4, hClient] = hosts;
  const byIndex = [h0, h1, h2, h3, h4];
  return arrayMap(CAMPAIGN_DEPLOYMENTS, ([targetId, image, clusterIndices, port, measured,
    txCfg]) => ({
    targetId, image, clusterIndices, measured, port, txCfg,
    clusterHosts: arrayMap(clusterIndices, (i) => byIndex[i]),
    clientHost: hClient || h4,
  }));
}

export async function regenerateAllBenchmarkArtifactsFromAdmitted(rootDir, admitted) {
  const {writeAdmittedLabMeasurementsFromRawObservations} = await import(
    './scaleout-series-experiments.js'
  );
  const derived = admitted || writeAdmittedLabMeasurementsFromRawObservations(rootDir).derived;
  if (admitted) {
    const filePath = path.resolve(rootDir, DEFAULT_ADMITTED_LAB_MEASUREMENTS_PATH);
    await fs.mkdir(path.dirname(filePath), {recursive: true});
    await fs.writeFile(filePath, serializeAdmittedMeasurements(derived), 'utf8');
  }
  const historyText = await fs.readFile(
    path.resolve(rootDir, DEFAULT_COMPARISON_HISTORY_NDJSON_PATH), 'utf8');
  const summary = buildComparisonProgressSummary(parseComparisonHistoryNdjson(historyText),
    {invalidations: readInvalidationLedger(rootDir)});
  await fs.writeFile(path.resolve(rootDir, DEFAULT_COMPARISON_PROGRESS_SUMMARY_PATH),
    `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  const docs = (name) => path.resolve(rootDir, 'docs/benchmarks', name);
  await writeComparisonStaticWebArtifacts({
    summary,
    svgPath: docs('tidb-comparison-progress.svg'),
    scenarioBSvgPath: docs('tidb-scenario-b-comparison.svg'),
    markdownPath: docs('tidb-comparison-progress.md'),
    htmlPath: docs('tidb-comparison-progress.html'),
  });
  const {matrix} = await writeMultiSystemComparativeMatrix({rootDir});
  await writeComparativeLandingArtifacts({
    matrix,
    svgPath: docs('comparative-overview.svg'),
    setupBreakdownSvgPath: docs('scenario-setup-time-breakdown.svg'),
    markdownPath: docs('README.md'),
    htmlPath: docs('index.html'),
  });
  const page = (prefix) => ({
    matrix, svgPath: docs(`${prefix}.svg`), markdownPath: docs(`${prefix}.md`),
    htmlPath: docs(`${prefix}.html`),
  });
  await writeLagrangeEvolutionStaticWebArtifacts(page('lagrange-metrics-evolution'));
  await writePostgresqlComparisonStaticWebArtifacts(page('postgresql-comparison-progress'));
  await writeCitusComparisonStaticWebArtifacts(page('citus-comparison-progress'));
  await writeYugabyteIgniteComparisonStaticWebArtifacts({
    ...page('yugabyte-ignite-comparison-progress'),
    crossoverSvgPath: docs('scenario-b-shape-crossover.svg'),
  });
  await writeScenarioCComparisonStaticWebArtifacts(page('scenario-c-feature-store-progress'));
  await writeScaleout3To5ComparisonStaticWebArtifacts(page('scaleout-3to5-node-rf3-progress'));
  await writePartitionGranularityComparisonStaticWebArtifacts(
    page('partition-granularity-sweep-progress'));
  await writeScenarioBRttWorkingSetStaticWebArtifacts(
    page('scenario-b-rtt-working-set-crossover'));
  await writeMovementScenarioCScalingStaticWebArtifacts(
    page('movement-and-scenario-c-scaling-progress'));
  // History is append-only and forensic: regeneration never creates or rewrites a
  // history record.
  return {matrix, historyRecords: []};
}
