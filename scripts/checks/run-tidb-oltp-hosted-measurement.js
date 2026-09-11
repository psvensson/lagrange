#!/usr/bin/env node

import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {runTiDbOltpAdapterSmoke} from
  './run-tidb-oltp-adapter-live.js';

const ONE = 1;
const OUTPUT_PATH =
  process.env.TIDB_OLTP_EVIDENCE_PATH ||
  'test-output/tidb-reference/oltp-hosted-smoke.json';
const PASS_PREFIX = 'tidb-oltp-hosted-measurement: PASS ';
const WORKLOAD_OPTIONS = Object.freeze({
  seed: 20260911,
  workers: 4,
  warmupOperationsPerWorker: 200,
  measurementOperationsPerWorker: 500,
  warehouseCount: 4,
  districtsPerWarehouse: 10,
  customersPerDistrict: 300,
  itemCount: 2000,
});

async function inspectImageIdentity(provider, tag) {
  const inspect = await provider.inspectImage(tag);
  assert.ok(inspect, `Expected pinned image ${tag} to exist`);
  return {
    tag,
    imageId: inspect.Id || null,
    repoDigests: Array.isArray(inspect.RepoDigests) ?
      [...inspect.RepoDigests].sort() :
      [],
  };
}

async function imageIdentities(provider, images) {
  const entries = await Promise.all(
    Object.entries(images).map(async ([role, tag]) => [
      role,
      await inspectImageIdentity(provider, tag),
    ]),
  );
  return Object.fromEntries(entries);
}

function runnerEvidence() {
  return {
    operatingSystem: os.platform(),
    architecture: os.arch(),
    cpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    githubRunnerOs: process.env.RUNNER_OS || null,
    githubRunnerArch: process.env.RUNNER_ARCH || null,
    githubRunnerName: process.env.RUNNER_NAME || null,
  };
}

async function main() {
  const provider = new DockerProvider();
  const run = await runTiDbOltpAdapterSmoke({
    provider,
    workloadOptions: WORKLOAD_OPTIONS,
  });

  assert.equal(run.status, 'passed');
  assert.equal(run.workload.measurement.failed, 0);
  assert.equal(
    run.workload.measurement.succeeded,
    WORKLOAD_OPTIONS.workers *
      WORKLOAD_OPTIONS.measurementOperationsPerWorker,
  );
  assert.ok(run.workload.opsPerSec > 0);
  assert.ok(run.workload.latency.count > 0);
  assert.match(run.workload.measurementPlanSha256, /^[a-f0-9]{64}$/u);

  const evidence = {
    schemaVersion: 1,
    scenario: 'tidb-oltp-baseline',
    evidenceClass: 'hosted-smoke-non-comparative',
    comparable: false,
    nonComparableReason:
      'GitHub-hosted runner resources and placement are not the controlled ' +
      'GCP benchmark environment; these numbers validate measurement plumbing only.',
    generatedAt: new Date().toISOString(),
    source: {
      gitSha: process.env.GITHUB_SHA || null,
      githubRunId: process.env.GITHUB_RUN_ID || null,
      githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    },
    runner: runnerEvidence(),
    topology: {
      tikvStoreCount: run.tikvStoreCount,
      persistentMysqlWorkerConnections: run.workerConnectionIds.length,
    },
    images: await imageIdentities(provider, run.images),
    dataset: {
      sha256: run.datasetSha256,
      summary: run.datasetSummary,
    },
    workloadProfile: WORKLOAD_OPTIONS,
    measurement: run.workload,
    correctness: {
      workerConnectionIds: run.workerConnectionIds,
      stateCounts: run.stateCounts,
    },
  };

  await mkdir(path.dirname(OUTPUT_PATH), {recursive: true});
  await writeFile(OUTPUT_PATH, JSON.stringify(evidence, null, 2) + '\n', 'utf8');

  process.stdout.write(PASS_PREFIX + JSON.stringify({
    evidencePath: OUTPUT_PATH,
    measuredTransactions: run.workload.measurement.succeeded,
    opsPerSec: run.workload.opsPerSec,
    p50Ms: run.workload.latency.p50,
    p95Ms: run.workload.latency.p95,
    p99Ms: run.workload.latency.p99,
    measurementPlanSha256: run.workload.measurementPlanSha256,
    datasetSha256: run.datasetSha256,
  }) + '\n');
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = ONE;
});
