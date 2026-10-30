#!/usr/bin/env node

import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path, {resolve} from 'node:path';

import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {
  installGcpImage,
  provisionGcpDockerHosts,
} from '../../test/distributed/gcp-run-orchestration.js';
import {
  TIDB_REFERENCE_DEFAULTS,
  startTiDbReferenceCluster,
} from '../../test/distributed/harness/tidb-reference-lifecycle.js';
import {
  createTiDbReferenceLifecycleResourceProvider,
} from
  '../../test/distributed/harness/tidb-reference-lifecycle-resource-policy.js';
import {
  TIDB_REFERENCE_REQUIRED_IMAGES,
  assertTiDbReferenceImagesAvailable,
} from './run-tidb-reference-lifecycle-live.js';
import {
  TIDB_OLTP_MEASUREMENT_WORKLOAD_OPTIONS,
} from './tidb-oltp-measurement.js';

const ZERO = 0;
const ONE = 1;
const EXPECTED_VM_COUNT = 2;
const EXPECTED_MACHINE_TYPE = 'n2-standard-4';
const TIKV_STORE_COUNT = 3;
const DEFAULT_CONFIG =
  'test/distributed/config/gcp-tidb-oltp-loadgen.json';
const OUTPUT_PATH =
  process.env.TIDB_OLTP_LOADGEN_EVIDENCE_PATH ||
  'test-output/tidb-reference/oltp-gcp-loadgen-proof.json';
const PASS_PREFIX = 'tidb-oltp-gcp-loadgen-proof: PASS ';
const LOADGEN_PASS_PREFIX = 'tidb-oltp-loadgen-runner: PASS ';
const TIDB_CONTAINER_SQL_PORT = 8080;
const DB_HOST_SQL_PORT = 8089;
const SHARED_DB_RESOURCE_LIMITS = Object.freeze({memory: '2g', cpus: '2.0'});
const TIKV_RESOURCE_LIMITS = Object.freeze({memory: '3g', cpus: '2.0'});
const READINESS_RESOURCE_LIMITS = Object.freeze({memory: '256m', cpus: '0.5'});
const LOADGEN_RESOURCE_LIMITS = Object.freeze({memory: '1g', cpus: '2.0'});

function parseArgs(argv) {
  let configPath = DEFAULT_CONFIG;
  for (let index = ZERO; index < argv.length; index += ONE) {
    if (argv[index] !== '--config') {
      throw new Error(`Unsupported argument: ${argv[index]}`);
    }
    index += ONE;
    if (!argv[index]) throw new Error('--config requires a path');
    configPath = argv[index];
  }
  return {configPath: resolve(process.cwd(), configPath)};
}

async function loadConfig(configPath) {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  assert.ok(config.gcp, 'TiDB load-generator proof requires gcp block');
  assert.equal(config.gcp.vmCount, EXPECTED_VM_COUNT);
  assert.equal(config.gcp.machineType, EXPECTED_MACHINE_TYPE);
  assert.equal(config.gcp.preemptible, false);
  assert.ok(
    !Array.isArray(config.docker?.hosts) || config.docker.hosts.length === ZERO,
    'load-generator proof must provision fresh controlled hosts',
  );
  return config;
}

function requiredEnvironment(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function createPublishedSqlProvider(remoteProvider) {
  const createContainer = remoteProvider.createContainer.bind(remoteProvider);
  const execInContainer = remoteProvider.execInContainer.bind(remoteProvider);

  return new Proxy(remoteProvider, {
    get(target, property) {
      if (property === 'createContainer') {
        return async (options) => {
          const isTiDb =
            options?.image === TIDB_REFERENCE_DEFAULTS.tidbImage &&
            String(options?.name || '').endsWith('-tidb');
          if (!isTiDb) return createContainer(options);
          return createContainer({
            ...options,
            command: (options.command || []).map((argument) =>
              argument === `-P=${TIDB_REFERENCE_DEFAULTS.tidbPort}` ?
                `-P=${TIDB_CONTAINER_SQL_PORT}` : argument),
            hostConfigExtras: {
              ...(options.hostConfigExtras || {}),
              PortBindings: {
                ...(options.hostConfigExtras?.PortBindings || {}),
                [`${TIDB_CONTAINER_SQL_PORT}/tcp`]: [{
                  HostIp: '0.0.0.0',
                  HostPort: String(DB_HOST_SQL_PORT),
                }],
              },
            },
          });
        };
      }
      if (property === 'execInContainer') {
        return async (containerId, command) => execInContainer(
          containerId,
          Array.isArray(command) ? command.map((argument) =>
            argument === `--port=${TIDB_REFERENCE_DEFAULTS.tidbPort}` ?
              `--port=${TIDB_CONTAINER_SQL_PORT}` : argument) : command,
        );
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function parseLoadgenResult(stdout) {
  const line = String(stdout || '')
    .split(/\r?\n/u)
    .find((candidate) => candidate.startsWith(LOADGEN_PASS_PREFIX));
  if (!line) {
    throw new Error(
      'load-generator container did not emit a PASS result: ' +
      JSON.stringify(String(stdout || '').slice(-4000)),
    );
  }
  return JSON.parse(line.slice(LOADGEN_PASS_PREFIX.length));
}

async function removeContainer(provider, container) {
  if (!container) return;
  const inspect = await provider.inspectContainerIfExists(container.containerId);
  if (!inspect) return;
  if (inspect.State?.Running === true) {
    await provider.stopContainer(container.containerId);
  }
  await provider.removeContainer(container.containerId);
}

async function writeEvidence(evidence) {
  await mkdir(path.dirname(OUTPUT_PATH), {recursive: true});
  await writeFile(OUTPUT_PATH, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
}

async function run() {
  const {configPath} = parseArgs(process.argv.slice(2));
  const inputConfig = await loadConfig(configPath);
  const loadgenImage = requiredEnvironment('TIDB_OLTP_LOADGEN_IMAGE');

  const localProvider = new DockerProvider();
  await assertTiDbReferenceImagesAvailable(localProvider);
  assert.ok(
    await localProvider.inspectImage(loadgenImage),
    `Expected local load-generator image ${loadgenImage}`,
  );

  const runId = `lagrange-tidb-loadgen-${randomUUID().slice(0, 8)}`;
  let provisioner = null;
  let dbProvider = null;
  let loadgenProvider = null;
  let dbNetwork = null;
  let cluster = null;
  let loadgenContainer = null;
  let loadgenResult = null;
  let primaryError = null;
  const cleanupErrors = [];
  let hostInfo = [];
  let loadgenContainerRemoved = false;
  let databaseClusterStopped = false;
  let databaseNetworkRemoved = false;

  try {
    const provisioned = await provisionGcpDockerHosts(inputConfig, true);
    provisioner = provisioned.provisioner;
    assert.ok(provisioner, 'Expected GCP provisioner');
    const hosts = provisioned.runConfig.docker?.hosts || [];
    hostInfo = provisioned.runConfig.docker?.hostInfo || [];
    assert.equal(hosts.length, EXPECTED_VM_COUNT);
    assert.equal(hostInfo.length, EXPECTED_VM_COUNT);

    for (const image of [...TIDB_REFERENCE_REQUIRED_IMAGES, loadgenImage]) {
      await installGcpImage(provisioner, image, true);
    }

    dbProvider = new DockerProvider({
      host: hosts[ZERO],
      tls: provisioned.runConfig.docker.tls,
    });
    loadgenProvider = new DockerProvider({
      host: hosts[ONE],
      tls: provisioned.runConfig.docker.tls,
    });

    const publishedDbProvider = createPublishedSqlProvider(dbProvider);
    const benchmarkDbProvider = createTiDbReferenceLifecycleResourceProvider(
      publishedDbProvider,
      {tikvResourceLimits: TIKV_RESOURCE_LIMITS},
    );

    dbNetwork = await benchmarkDbProvider.createNetwork(`${runId}-db-net`, {
      'lagrange.benchmark': 'tidb-oltp-loadgen-proof',
    });
    cluster = await startTiDbReferenceCluster({
      provider: benchmarkDbProvider,
      network: `${runId}-db-net`,
      namePrefix: runId,
      tikvStoreCount: TIKV_STORE_COUNT,
      resourceLimits: SHARED_DB_RESOURCE_LIMITS,
      readinessResourceLimits: READINESS_RESOURCE_LIMITS,
    });

    loadgenContainer = await loadgenProvider.createContainer({
      name: `${runId}-loadgen`,
      image: loadgenImage,
      network: 'host',
      hostNetwork: true,
      resourceLimits: LOADGEN_RESOURCE_LIMITS,
      labels: {'lagrange.benchmark': 'tidb-oltp-loadgen-proof'},
      env: {
        TIDB_ENDPOINT_HOST: hostInfo[ZERO].internalIp,
        TIDB_ENDPOINT_PORT: String(DB_HOST_SQL_PORT),
        TIDB_DATABASE_NAME: 'lagrange_tidb_loadgen_proof',
        TIDB_WORKLOAD_JSON: JSON.stringify(TIDB_OLTP_MEASUREMENT_WORKLOAD_OPTIONS),
      },
    });

    const execution = await loadgenProvider.execInContainer(
      loadgenContainer.containerId,
      ['node', '/bench/scripts/checks/tidb-oltp-loadgen-runner.js'],
    );
    if (execution.exitCode !== ZERO) {
      throw new Error(
        `load-generator workload failed exit=${execution.exitCode}: ` +
        String(execution.stderr || execution.stdout || '').slice(-6000),
      );
    }
    loadgenResult = parseLoadgenResult(execution.stdout);
    assert.equal(loadgenResult.status, 'passed');
    assert.equal(
      loadgenResult.workload.measurement.succeeded,
      TIDB_OLTP_MEASUREMENT_WORKLOAD_OPTIONS.workers *
        TIDB_OLTP_MEASUREMENT_WORKLOAD_OPTIONS.measurementOperationsPerWorker,
    );
    assert.equal(loadgenResult.workload.measurement.failed, ZERO);
  } catch (error) {
    primaryError = error;
  }

  if (loadgenProvider && loadgenContainer) {
    try {
      await removeContainer(loadgenProvider, loadgenContainer);
      loadgenContainerRemoved = true;
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cluster) {
    try {
      await cluster.stop();
      databaseClusterStopped = true;
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (dbProvider && dbNetwork) {
    try {
      await dbProvider.removeNetwork(dbNetwork.id);
      databaseNetworkRemoved = true;
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  let teardownError = null;
  if (provisioner) {
    try {
      await provisioner.destroy();
    } catch (error) {
      teardownError = error;
    }
  }
  const costEstimate = provisioner?.estimateCost() || null;

  const allErrors = [primaryError, ...cleanupErrors, teardownError].filter(Boolean);
  const evidence = {
    schemaVersion: 1,
    scenario: 'tidb-oltp-load-generator-placement-proof',
    evidenceClass: 'gcp-same-zone-loadgen-proof-non-comparative',
    comparable: false,
    nonComparableReason:
      'This proves same-zone load-generator placement and workload semantics. ' +
      'The final comparison still requires distributed TiKV placement and ' +
      'measurement-window resource integration.',
    generatedAt: new Date().toISOString(),
    source: {
      gitSha: process.env.GITHUB_SHA || null,
      githubRunId: process.env.GITHUB_RUN_ID || null,
    },
    infrastructure: {
      project: inputConfig.gcp.project,
      zone: inputConfig.gcp.zone,
      machineType: inputConfig.gcp.machineType,
      vmCount: inputConfig.gcp.vmCount,
      roles: [
        {hostIndex: ZERO, role: 'tidb-reference-topology'},
        {hostIndex: ONE, role: 'oltp-load-generator'},
      ],
      trafficPath: 'vpc-internal',
      teardownVerified: Boolean(provisioner) && teardownError === null,
      computeCostEstimate: costEstimate,
    },
    resourcePolicy: {
      sharedDatabase: SHARED_DB_RESOURCE_LIMITS,
      tikv: TIKV_RESOURCE_LIMITS,
      loadGenerator: LOADGEN_RESOURCE_LIMITS,
    },
    images: {
      ...Object.fromEntries(
        Object.entries(TIDB_REFERENCE_DEFAULTS)
          .filter(([key]) => key.endsWith('Image')),
      ),
      loadGenerator: loadgenImage,
    },
    topology: {
      tikvStoreCount: TIKV_STORE_COUNT,
      loadGeneratorOnSeparateVm: true,
      loadGeneratorSameZone: true,
      databaseHostCount: ONE,
      loadGeneratorHostCount: ONE,
    },
    workload: loadgenResult,
    cleanup: {
      loadgenContainerRemoved,
      databaseClusterStopped,
      databaseNetworkRemoved,
      infrastructureDestroyed: Boolean(provisioner) && teardownError === null,
    },
    failure: allErrors.length === ZERO ? null : {
      messages: allErrors.map((error) => String(error?.message || error)),
    },
  };
  await writeEvidence(evidence);

  if (allErrors.length > ONE) {
    throw new AggregateError(allErrors, 'TiDB load-generator proof failures');
  }
  if (allErrors.length === ONE) throw allErrors[ZERO];

  process.stdout.write(PASS_PREFIX + JSON.stringify({
    evidencePath: OUTPUT_PATH,
    measuredTransactions: loadgenResult.workload.measurement.succeeded,
    opsPerSec: loadgenResult.workload.opsPerSec,
    p50Ms: loadgenResult.workload.latency.p50,
    p95Ms: loadgenResult.workload.latency.p95,
    p99Ms: loadgenResult.workload.latency.p99,
    datasetSha256: loadgenResult.datasetSha256,
    measurementPlanSha256: loadgenResult.workload.measurementPlanSha256,
    zone: inputConfig.gcp.zone,
    vmCount: inputConfig.gcp.vmCount,
    costEstimate,
  }) + '\n');
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = ONE;
});
