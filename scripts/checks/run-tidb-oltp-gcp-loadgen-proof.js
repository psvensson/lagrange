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

const stringTrim = Function.call.bind(String.prototype.trim);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);

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

const ARG_CONFIG = '--config';
const ERROR_CONFIG_PATH_REQUIRED = '--config requires a path';
const ERROR_GCP_BLOCK_REQUIRED = 'TiDB load-generator proof requires gcp block';
const ERROR_MUST_PROVISION_HOSTS =
  'load-generator proof must provision fresh controlled hosts';
const ERROR_EXPECTED_PROVISIONER = 'Expected GCP provisioner';
const ERROR_LOADGEN_NO_PASS_PREFIX =
  'load-generator container did not emit a PASS result: ';
const ERROR_LOADGEN_PROOF_FAILURES = 'TiDB load-generator proof failures';

const METHOD_CREATE_CONTAINER = 'createContainer';
const METHOD_EXEC_IN_CONTAINER = 'execInContainer';
const HOST_IP_ANY = '0.0.0.0';
const NETWORK_HOST = 'host';
const STATUS_PASSED = 'passed';
const BENCHMARK_LABEL_LOADGEN_PROOF = 'tidb-oltp-loadgen-proof';
const DATABASE_NAME_LOADGEN_PROOF = 'lagrange_tidb_loadgen_proof';
const TIDB_CONTAINER_NAME_SUFFIX = '-tidb';
const IMAGE_KEY_SUFFIX = 'Image';
const FILE_ENCODING_UTF8 = 'utf8';
const NEWLINE = '\n';
const RUN_ID_SUFFIX_LENGTH = 8;
const STDOUT_TAIL_LIMIT_FOUR_THOUSAND = 4000;
const STDERR_TAIL_LIMIT_SIX_THOUSAND = 6000;

const RUNNER_COMMAND = Object.freeze([
  'node',
  '/bench/scripts/checks/tidb-oltp-loadgen-runner.js',
]);

function parseArgs(argv) {
  let configPath = DEFAULT_CONFIG;
  for (let index = ZERO; index < argv.length; index += ONE) {
    if (argv[index] !== ARG_CONFIG) {
      throw new Error(`Unsupported argument: ${argv[index]}`);
    }
    index += ONE;
    if (!argv[index]) throw new Error(ERROR_CONFIG_PATH_REQUIRED);
    configPath = argv[index];
  }
  return {configPath: resolve(process.cwd(), configPath)};
}

async function loadConfig(configPath) {
  const config = JSON.parse(await readFile(configPath, FILE_ENCODING_UTF8));
  assert.ok(config.gcp, ERROR_GCP_BLOCK_REQUIRED);
  assert.equal(config.gcp.vmCount, EXPECTED_VM_COUNT);
  assert.equal(config.gcp.machineType, EXPECTED_MACHINE_TYPE);
  assert.equal(config.gcp.preemptible, false);
  assert.ok(
    !Array.isArray(config.docker?.hosts) || config.docker.hosts.length === ZERO,
    ERROR_MUST_PROVISION_HOSTS,
  );
  return config;
}

function requiredEnvironment(name) {
  const value = stringTrim(String(process.env[name] || ''));
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function createPublishedSqlProvider(remoteProvider) {
  const createContainer = remoteProvider.createContainer.bind(remoteProvider);
  const execInContainer = remoteProvider.execInContainer.bind(remoteProvider);

  return new Proxy(remoteProvider, {
    get(target, property) {
      if (property === METHOD_CREATE_CONTAINER) {
        return async (options) => {
          const isTiDb =
            options?.image === TIDB_REFERENCE_DEFAULTS.tidbImage &&
            stringEndsWith(String(options?.name || ''), TIDB_CONTAINER_NAME_SUFFIX);
          if (!isTiDb) return createContainer(options);
          return createContainer({
            ...options,
            command: arrayMap(options.command || [], (argument) =>
              argument === `-P=${TIDB_REFERENCE_DEFAULTS.tidbPort}` ?
                `-P=${TIDB_CONTAINER_SQL_PORT}` : argument),
            hostConfigExtras: {
              ...(options.hostConfigExtras || {}),
              PortBindings: {
                ...(options.hostConfigExtras?.PortBindings || {}),
                [`${TIDB_CONTAINER_SQL_PORT}/tcp`]: [{
                  HostIp: HOST_IP_ANY,
                  HostPort: String(DB_HOST_SQL_PORT),
                }],
              },
            },
          });
        };
      }
      if (property === METHOD_EXEC_IN_CONTAINER) {
        return async (containerId, command) => execInContainer(
          containerId,
          Array.isArray(command) ? arrayMap(command, (argument) =>
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
  const lines = stringSplit(String(stdout || ''), /\r?\n/u);
  const line = arrayFind(lines, (candidate) =>
    stringStartsWith(candidate, LOADGEN_PASS_PREFIX));
  if (!line) {
    throw new Error(
      ERROR_LOADGEN_NO_PASS_PREFIX +
      JSON.stringify(String(stdout || '').slice(-STDOUT_TAIL_LIMIT_FOUR_THOUSAND)),
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
  await writeFile(OUTPUT_PATH, JSON.stringify(evidence, null, 2) + NEWLINE, FILE_ENCODING_UTF8);
}

async function setupBenchmarkInfrastructure(inputConfig, loadgenImage, runId) {
  const provisioned = await provisionGcpDockerHosts(inputConfig, true);
  const provisioner = provisioned.provisioner;
  assert.ok(provisioner, ERROR_EXPECTED_PROVISIONER);
  const hosts = provisioned.runConfig.docker?.hosts || [];
  const hostInfo = provisioned.runConfig.docker?.hostInfo || [];
  assert.equal(hosts.length, EXPECTED_VM_COUNT);
  assert.equal(hostInfo.length, EXPECTED_VM_COUNT);

  for (const image of [...TIDB_REFERENCE_REQUIRED_IMAGES, loadgenImage]) {
    await installGcpImage(provisioner, image, true);
  }

  const dbProvider = new DockerProvider({
    host: hosts[ZERO],
    tls: provisioned.runConfig.docker.tls,
  });
  const loadgenProvider = new DockerProvider({
    host: hosts[ONE],
    tls: provisioned.runConfig.docker.tls,
  });

  const publishedDbProvider = createPublishedSqlProvider(dbProvider);
  const benchmarkDbProvider = createTiDbReferenceLifecycleResourceProvider(
    publishedDbProvider,
    {tikvResourceLimits: TIKV_RESOURCE_LIMITS},
  );

  const dbNetwork = await benchmarkDbProvider.createNetwork(`${runId}-db-net`, {
    'lagrange.benchmark': BENCHMARK_LABEL_LOADGEN_PROOF,
  });
  const cluster = await startTiDbReferenceCluster({
    provider: benchmarkDbProvider,
    network: `${runId}-db-net`,
    namePrefix: runId,
    tikvStoreCount: TIKV_STORE_COUNT,
    resourceLimits: SHARED_DB_RESOURCE_LIMITS,
    readinessResourceLimits: READINESS_RESOURCE_LIMITS,
  });

  const loadgenContainer = await loadgenProvider.createContainer({
    name: `${runId}-loadgen`,
    image: loadgenImage,
    network: NETWORK_HOST,
    hostNetwork: true,
    resourceLimits: LOADGEN_RESOURCE_LIMITS,
    labels: {'lagrange.benchmark': BENCHMARK_LABEL_LOADGEN_PROOF},
    env: {
      TIDB_ENDPOINT_HOST: hostInfo[ZERO].internalIp,
      TIDB_ENDPOINT_PORT: String(DB_HOST_SQL_PORT),
      TIDB_DATABASE_NAME: DATABASE_NAME_LOADGEN_PROOF,
      TIDB_WORKLOAD_JSON: JSON.stringify(TIDB_OLTP_MEASUREMENT_WORKLOAD_OPTIONS),
    },
  });

  return {
    provisioner,
    hostInfo,
    dbProvider,
    loadgenProvider,
    dbNetwork,
    cluster,
    loadgenContainer,
  };
}

async function executeLoadgenWorkload(loadgenProvider, loadgenContainer) {
  const execution = await loadgenProvider.execInContainer(
    loadgenContainer.containerId,
    RUNNER_COMMAND,
  );
  if (execution.exitCode !== ZERO) {
    throw new Error(
      `load-generator workload failed exit=${execution.exitCode}: ` +
      String(execution.stderr || execution.stdout || '').slice(-STDERR_TAIL_LIMIT_SIX_THOUSAND),
    );
  }
  const loadgenResult = parseLoadgenResult(execution.stdout);
  assert.equal(loadgenResult.status, STATUS_PASSED);
  assert.equal(
    loadgenResult.workload.measurement.succeeded,
    TIDB_OLTP_MEASUREMENT_WORKLOAD_OPTIONS.workers *
      TIDB_OLTP_MEASUREMENT_WORKLOAD_OPTIONS.measurementOperationsPerWorker,
  );
  assert.equal(loadgenResult.workload.measurement.failed, ZERO);
  return loadgenResult;
}

async function cleanupContainer(provider, container) {
  if (!provider || !container) return false;
  try {
    await removeContainer(provider, container);
    return true;
  } catch (error) {
    return error;
  }
}

async function cleanupCluster(cluster) {
  if (!cluster) return false;
  try {
    await cluster.stop();
    return true;
  } catch (error) {
    return error;
  }
}

async function cleanupNetwork(provider, network) {
  if (!provider || !network) return false;
  try {
    await provider.removeNetwork(network.id);
    return true;
  } catch (error) {
    return error;
  }
}

async function cleanupProvisioner(provisioner) {
  if (!provisioner) return null;
  try {
    await provisioner.destroy();
    return null;
  } catch (error) {
    return error;
  }
}

async function cleanupBenchmarkResources(infra) {
  const cleanupErrors = [];
  const containerResult = await cleanupContainer(
    infra?.loadgenProvider,
    infra?.loadgenContainer,
  );
  const loadgenContainerRemoved = containerResult === true;
  if (containerResult instanceof Error) cleanupErrors.push(containerResult);

  const clusterResult = await cleanupCluster(infra?.cluster);
  const databaseClusterStopped = clusterResult === true;
  if (clusterResult instanceof Error) cleanupErrors.push(clusterResult);

  const networkResult = await cleanupNetwork(
    infra?.dbProvider,
    infra?.dbNetwork,
  );
  const databaseNetworkRemoved = networkResult === true;
  if (networkResult instanceof Error) cleanupErrors.push(networkResult);

  const teardownError = await cleanupProvisioner(infra?.provisioner);

  return {
    cleanupErrors,
    teardownError,
    loadgenContainerRemoved,
    databaseClusterStopped,
    databaseNetworkRemoved,
  };
}

function buildLoadgenEvidence({
  inputConfig,
  loadgenImage,
  provisioner,
  teardownError,
  costEstimate,
  loadgenResult,
  cleanupRecord,
  allErrors,
}) {
  const images = {
    ...Object.fromEntries(
      arrayFilter(
        Object.entries(TIDB_REFERENCE_DEFAULTS),
        ([key]) => stringEndsWith(key, IMAGE_KEY_SUFFIX),
      ),
    ),
    loadGenerator: loadgenImage,
  };

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
    images,
    topology: {
      tikvStoreCount: TIKV_STORE_COUNT,
      loadGeneratorOnSeparateVm: true,
      loadGeneratorSameZone: true,
      databaseHostCount: ONE,
      loadGeneratorHostCount: ONE,
    },
    workload: loadgenResult,
    cleanup: {
      loadgenContainerRemoved: cleanupRecord.loadgenContainerRemoved,
      databaseClusterStopped: cleanupRecord.databaseClusterStopped,
      databaseNetworkRemoved: cleanupRecord.databaseNetworkRemoved,
      infrastructureDestroyed: Boolean(provisioner) && teardownError === null,
    },
    failure: allErrors.length === ZERO ? null : {
      messages: arrayMap(allErrors, (error) => String(error?.message || error)),
    },
  };
  return evidence;
}

function handleProofErrors(allErrors) {
  if (allErrors.length > ONE) {
    throw new AggregateError(allErrors, ERROR_LOADGEN_PROOF_FAILURES);
  }
  if (allErrors.length === ONE) {
    throw allErrors[ZERO];
  }
}

function printProofPass(inputConfig, loadgenResult, costEstimate) {
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
  }) + NEWLINE);
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

  const runId = `lagrange-tidb-loadgen-${randomUUID().slice(0, RUN_ID_SUFFIX_LENGTH)}`;
  let infra = null;
  let loadgenResult = null;
  let primaryError = null;

  try {
    infra = await setupBenchmarkInfrastructure(inputConfig, loadgenImage, runId);
    loadgenResult = await executeLoadgenWorkload(
      infra.loadgenProvider,
      infra.loadgenContainer,
    );
  } catch (error) {
    primaryError = error;
  }

  const cleanupRecord = await cleanupBenchmarkResources(infra);
  const costEstimate = infra?.provisioner?.estimateCost() || null;
  const allErrors = arrayFilter(
    [primaryError, ...cleanupRecord.cleanupErrors, cleanupRecord.teardownError],
    Boolean,
  );

  const evidence = buildLoadgenEvidence({
    inputConfig,
    loadgenImage,
    provisioner: infra?.provisioner,
    teardownError: cleanupRecord.teardownError,
    costEstimate,
    loadgenResult,
    cleanupRecord,
    allErrors,
  });
  await writeEvidence(evidence);

  handleProofErrors(allErrors);

  printProofPass(inputConfig, loadgenResult, costEstimate);
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}${NEWLINE}`);
  process.exitCode = ONE;
});
