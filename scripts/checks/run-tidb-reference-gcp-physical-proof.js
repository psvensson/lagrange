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
import {GcpDataDiskOwner} from
  '../../test/distributed/harness/gcp-data-disk-owner.js';
import {
  TIDB_REFERENCE_DEFAULTS,
} from '../../test/distributed/harness/tidb-reference-lifecycle.js';
import {
  TIDB_REFERENCE_PHYSICAL_DEFAULTS,
  startTiDbReferencePhysicalCluster,
} from '../../test/distributed/harness/tidb-reference-physical-topology.js';
import {
  buildTiDbPhysicalMysqlCommand,
  waitForPhysicalTablePlacement,
} from '../../test/distributed/harness/tidb-reference-physical-placement-proof.js';
import {
  createTiKvPersistentStorageProvider,
  tikvPersistentStorageEvidence,
} from '../../test/distributed/harness/tidb-reference-tikv-storage-provider.js';
import {
  TIDB_REFERENCE_REQUIRED_IMAGES,
  assertTiDbReferenceImagesAvailable,
} from './run-tidb-reference-lifecycle-live.js';

const stringTrim = Function.call.bind(String.prototype.trim);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFilter = Function.call.bind(Array.prototype.filter);

const ZERO = 0;
const ONE = 1;
const EXPECTED_VM_COUNT = 5;
const EXPECTED_MACHINE_TYPE = 'n2-standard-4';
const CONTROL_INDEX = 0;
const STORAGE_INDEXES = Object.freeze([1, 2, 3]);
const LOADGEN_INDEX = 4;
const DATABASE_NAME = 'lagrange_tidb_physical_probe';
const TABLE_NAME = 'probe';
const PROBE_VALUE = '424242';
const CLIENT_KEEPALIVE_SECONDS = '300';
const DEFAULT_CONFIG =
  'test/distributed/config/gcp-tidb-reference-physical.json';
const OUTPUT_PATH =
  process.env.TIDB_REFERENCE_PHYSICAL_EVIDENCE_PATH ||
  'test-output/tidb-reference/gcp-physical-rf3-proof.json';
const PASS_PREFIX = 'tidb-reference-gcp-physical-proof: PASS ';
const SHARED_DB_RESOURCE_LIMITS = Object.freeze({memory: '2g', cpus: '2.0'});
const TIKV_RESOURCE_LIMITS = Object.freeze({memory: '3g', cpus: '2.0'});
const CLIENT_RESOURCE_LIMITS = Object.freeze({memory: '256m', cpus: '0.5'});

const ARG_CONFIG = '--config';
const ERROR_CONFIG_PATH_REQUIRED = '--config requires a path';
const ERROR_STORAGE_DATA_DISK_REQUIRED =
  'TiDB physical proof requires storageDataDisk';
const ERROR_GCP_BLOCK_REQUIRED = 'TiDB physical proof requires gcp block';
const ERROR_MUST_PROVISION_HOSTS =
  'TiDB physical proof must provision fresh controlled hosts';
const ERROR_EXPECTED_PROVISIONER = 'Expected GCP provisioner';
const ERROR_TIKV_PLACEMENTS_MISMATCH =
  'TiKV container placements must match the three storage VMs';
const ERROR_PHYSICAL_PROOF_FAILURES = 'TiDB physical RF3 proof failures';

const DATA_DISK_TYPE_PD_BALANCED = 'pd-balanced';
const DATA_DISK_SIZE_GB = 100;
const DATA_DISK_MOUNT_PATH = '/mnt/lagrange-benchmark-data';
const DATA_DISK_DEVICE_NAME = 'lagrange-benchmark-data';

const SQL_COLUMNS_DEFINITION = 'id BIGINT PRIMARY KEY, value BIGINT NOT NULL';
const SQL_CLOSE_PAREN = ')';
const SQL_STATEMENT_SEPARATOR = '; ';
const SQL_TRAILING_SEMICOLON = ';';

const STATUS_RUNNING = 'running';
const NETWORK_HOST = 'host';
const BENCHMARK_LABEL_PHYSICAL_PROOF = 'tidb-reference-gcp-physical-proof';
const COMMAND_SLEEP = 'sleep';
const FILE_ENCODING_UTF8 = 'utf8';
const NEWLINE = '\n';

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

function assertStorageDataDisk(config) {
  const policy = config.storageDataDisk;
  assert.ok(policy, ERROR_STORAGE_DATA_DISK_REQUIRED);
  assert.equal(policy.type, DATA_DISK_TYPE_PD_BALANCED);
  assert.equal(policy.sizeGb, DATA_DISK_SIZE_GB);
  assert.equal(policy.mountPath, DATA_DISK_MOUNT_PATH);
  assert.equal(policy.deviceName, DATA_DISK_DEVICE_NAME);
  return policy;
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
  assertStorageDataDisk(config);
  return config;
}

function setupSql() {
  return [
    `DROP DATABASE IF EXISTS ${DATABASE_NAME}`,
    `CREATE DATABASE ${DATABASE_NAME}`,
    `USE ${DATABASE_NAME}`,
    `CREATE TABLE ${TABLE_NAME} (` +
      SQL_COLUMNS_DEFINITION +
      SQL_CLOSE_PAREN,
    `INSERT INTO ${TABLE_NAME} (id, value) VALUES (1, ${PROBE_VALUE})`,
    `SELECT value FROM ${TABLE_NAME} WHERE id = 1`,
  ].join(SQL_STATEMENT_SEPARATOR) + SQL_TRAILING_SEMICOLON;
}

function cleanupSql() {
  return `DROP DATABASE IF EXISTS ${DATABASE_NAME};`;
}

async function removeContainer(provider, container) {
  if (!provider || !container) return false;
  const inspect = await provider.inspectContainerIfExists(container.containerId);
  if (!inspect) return true;
  if (inspect.State?.Running === true || inspect.State?.Status === STATUS_RUNNING) {
    await provider.stopContainer(container.containerId);
  }
  await provider.removeContainer(container.containerId);
  return true;
}

async function writeEvidence(evidence) {
  await mkdir(path.dirname(OUTPUT_PATH), {recursive: true});
  await writeFile(OUTPUT_PATH, JSON.stringify(evidence, null, 2) + NEWLINE, FILE_ENCODING_UTF8);
}

function providerFor(host, tls) {
  return new DockerProvider({host, tls});
}

function diskByHostIndex(records) {
  return new Map(arrayMap(records, (record) => [record.hostIndex, record]));
}

async function collectTiKvStorageEvidence(cluster, disks) {
  const evidence = [];
  for (let index = ZERO; index < cluster.containers.tikvStores.length; index += ONE) {
    const container = cluster.containers.tikvStores[index];
    const inspect = await cluster.provider.inspectContainer(container.containerId);
    const disk = disks[index];
    const storage = tikvPersistentStorageEvidence(
      inspect,
      {hostPath: disk.mountPath},
    );
    assert.equal(
      storage.valid,
      true,
      `TiKV store ${index + ONE} must use its persistent data disk`,
    );
    evidence.push({
      storeIndex: index,
      hostIndex: disk.hostIndex,
      diskName: disk.diskName,
      type: disk.type,
      sizeGb: disk.sizeGb,
      ...storage,
    });
  }
  return evidence;
}

async function run() {
  const {configPath} = parseArgs(process.argv.slice(2));
  const inputConfig = await loadConfig(configPath);
  const dataDiskPolicy = assertStorageDataDisk(inputConfig);
  const localProvider = new DockerProvider();
  await assertTiDbReferenceImagesAvailable(localProvider);

  const runSuffix = randomUUID().slice(0, 8);
  const runId = `lagrange-tidb-physical-${runSuffix}`;
  let provisioner = null;
  let dataDiskOwner = null;
  let dataDisks = [];
  let cluster = null;
  let loadgenProvider = null;
  let loadgenClient = null;
  let hostInfo = [];
  let placementProof = null;
  let physicalPlacements = null;
  let tikvStorageEvidence = null;
  let queryValue = null;
  let primaryError = null;
  const cleanupErrors = [];
  let loadgenClientRemoved = false;
  let clusterStopped = false;
  let dataDisksDestroyed = false;

  try {
    const provisioned = await provisionGcpDockerHosts(inputConfig, true);
    provisioner = provisioned.provisioner;
    assert.ok(provisioner, ERROR_EXPECTED_PROVISIONER);

    const hosts = provisioned.runConfig.docker?.hosts || [];
    hostInfo = provisioned.runConfig.docker?.hostInfo || [];
    assert.equal(hosts.length, EXPECTED_VM_COUNT);
    assert.equal(hostInfo.length, EXPECTED_VM_COUNT);

    for (const image of TIDB_REFERENCE_REQUIRED_IMAGES) {
      await installGcpImage(provisioner, image, true);
    }

    dataDiskOwner = new GcpDataDiskOwner({
      project: inputConfig.gcp.project,
      zone: inputConfig.gcp.zone,
    });
    dataDisks = await dataDiskOwner.attachDataDisks({
      hostInfo,
      hostIndexes: STORAGE_INDEXES,
      namePrefix: `tidb-data-${runSuffix}`,
      ...dataDiskPolicy,
    });
    const disks = diskByHostIndex(dataDisks);

    const providers = arrayMap(hosts, (host) =>
      providerFor(host, provisioned.runConfig.docker.tls));
    const control = {
      provider: providers[CONTROL_INDEX],
      host: hostInfo[CONTROL_INDEX].internalIp,
    };
    const storage = arrayMap(STORAGE_INDEXES, (index) => {
      const disk = disks.get(index);
      assert.ok(disk, `Missing data disk for storage host ${index}`);
      return {
        provider: createTiKvPersistentStorageProvider(providers[index], {
          hostPath: disk.mountPath,
        }),
        host: hostInfo[index].internalIp,
      };
    });
    loadgenProvider = providers[LOADGEN_INDEX];

    cluster = await startTiDbReferencePhysicalCluster({
      control,
      storage,
      namePrefix: runId,
      resourceLimits: SHARED_DB_RESOURCE_LIMITS,
      tikvResourceLimits: TIKV_RESOURCE_LIMITS,
      readinessResourceLimits: CLIENT_RESOURCE_LIMITS,
    });

    physicalPlacements = arrayMap(
      cluster.containers.tikvStores,
      ({containerId}) => cluster.provider.getPhysicalPlacement(containerId),
    );
    assert.deepEqual(
      arrayMap(physicalPlacements, ({host}) => host),
      arrayMap(storage, ({host}) => host),
      ERROR_TIKV_PLACEMENTS_MISMATCH,
    );
    tikvStorageEvidence = await collectTiKvStorageEvidence(cluster, dataDisks);

    loadgenClient = await loadgenProvider.createContainer({
      name: `${runId}-loadgen-client`,
      image: TIDB_REFERENCE_DEFAULTS.mysqlClientImage,
      network: NETWORK_HOST,
      hostNetwork: true,
      resourceLimits: CLIENT_RESOURCE_LIMITS,
      labels: {'lagrange.benchmark': BENCHMARK_LABEL_PHYSICAL_PROOF},
      entrypoint: [COMMAND_SLEEP],
      command: [CLIENT_KEEPALIVE_SECONDS],
    });

    const setup = await loadgenProvider.execInContainer(
      loadgenClient.containerId,
      buildTiDbPhysicalMysqlCommand(cluster.endpoints.mysql, setupSql()),
    );
    assert.equal(
      setup.exitCode,
      ZERO,
      `TiDB physical probe setup failed: ${setup.stderr || setup.stdout}`,
    );
    queryValue = stringTrim(String(setup.stdout || ''));
    assert.equal(queryValue, PROBE_VALUE);

    const expectedAddresses = arrayMap(storage, ({host}) =>
      `${host}:${TIDB_REFERENCE_PHYSICAL_DEFAULTS.tikvPort}`);
    placementProof = await waitForPhysicalTablePlacement({
      provider: loadgenProvider,
      clientContainerId: loadgenClient.containerId,
      endpoint: cluster.endpoints.mysql,
      databaseName: DATABASE_NAME,
      tableName: TABLE_NAME,
      expectedAddresses,
      replicaTarget: STORAGE_INDEXES.length,
    });
    assert.equal(placementProof.ready, true);

    const drop = await loadgenProvider.execInContainer(
      loadgenClient.containerId,
      buildTiDbPhysicalMysqlCommand(cluster.endpoints.mysql, cleanupSql()),
    );
    assert.equal(
      drop.exitCode,
      ZERO,
      `TiDB physical probe cleanup SQL failed: ${drop.stderr || drop.stdout}`,
    );
  } catch (error) {
    primaryError = error;
  }

  if (loadgenProvider && loadgenClient) {
    try {
      loadgenClientRemoved = await removeContainer(loadgenProvider, loadgenClient);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cluster) {
    try {
      await cluster.stop();
      clusterStopped = true;
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (dataDiskOwner) {
    try {
      await dataDiskOwner.destroy();
      dataDisksDestroyed = true;
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
  const allErrors = arrayFilter(
    [primaryError, ...cleanupErrors, teardownError],
    Boolean,
  );

  const evidence = {
    schemaVersion: 2,
    scenario: 'tidb-physical-rf3-gcp-proof',
    evidenceClass: 'gcp-physical-rf3-persistent-disk-correctness-non-comparative',
    comparable: false,
    nonComparableReason:
      'This run proves physical RF3 and explicit TiKV data disks. Publishable ' +
      'comparison still requires the matching Lagrange disk policy and ' +
      'measurement-window resource accounting.',
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
        {hostIndex: CONTROL_INDEX, role: 'tidb-pd-control'},
        ...arrayMap(STORAGE_INDEXES, (hostIndex, index) => ({
          hostIndex,
          role: `tikv-storage-${index + ONE}`,
        })),
        {hostIndex: LOADGEN_INDEX, role: 'correctness-load-generator'},
      ],
      trafficPath: 'vpc-internal',
      teardownVerified: Boolean(provisioner) && teardownError === null,
      computeCostEstimate: costEstimate,
      computeCostEstimateScope: 'compute-only; data-disk cost not estimated',
      storageDataDiskPolicy: dataDiskPolicy,
      storageDataDisks: dataDisks,
    },
    topology: {
      physicalPorts: TIDB_REFERENCE_PHYSICAL_DEFAULTS,
      controlHost: hostInfo[CONTROL_INDEX]?.internalIp || null,
      storageHosts: arrayMap(STORAGE_INDEXES, (index) =>
        hostInfo[index]?.internalIp || null),
      loadGeneratorHost: hostInfo[LOADGEN_INDEX]?.internalIp || null,
      distinctSystemHosts: 4,
      separateLoadGeneratorHost: true,
      physicalPlacements,
      tikvStorageEvidence,
    },
    resourcePolicy: {
      sharedDatabase: SHARED_DB_RESOURCE_LIMITS,
      tikv: TIKV_RESOURCE_LIMITS,
      client: CLIENT_RESOURCE_LIMITS,
    },
    images: {
      pd: TIDB_REFERENCE_DEFAULTS.pdImage,
      tikv: TIDB_REFERENCE_DEFAULTS.tikvImage,
      tidb: TIDB_REFERENCE_DEFAULTS.tidbImage,
      mysqlClient: TIDB_REFERENCE_DEFAULTS.mysqlClientImage,
    },
    correctness: {
      queryValue,
      readinessAttempts: cluster?.readiness?.attempts ?? null,
      placementProof,
    },
    cleanup: {
      loadgenClientRemoved,
      clusterStopped,
      dataDisksDestroyed,
      infrastructureDestroyed: Boolean(provisioner) && teardownError === null,
    },
    failure: allErrors.length === ZERO ? null : {
      messages: arrayMap(allErrors, (error) => String(error?.message || error)),
    },
  };
  await writeEvidence(evidence);

  if (allErrors.length > ONE) {
    throw new AggregateError(allErrors, ERROR_PHYSICAL_PROOF_FAILURES);
  }
  if (allErrors.length === ONE) throw allErrors[ZERO];

  process.stdout.write(PASS_PREFIX + JSON.stringify({
    evidencePath: OUTPUT_PATH,
    queryValue,
    readinessAttempts: cluster.readiness.attempts,
    placementAttempts: placementProof.attempts,
    regionCount: placementProof.regions.length,
    expectedAddresses: placementProof.expectedAddresses,
    dataDiskType: dataDiskPolicy.type,
    dataDiskSizeGb: dataDiskPolicy.sizeGb,
    zone: inputConfig.gcp.zone,
    vmCount: inputConfig.gcp.vmCount,
    costEstimate,
  }) + NEWLINE);
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}${NEWLINE}`);
  process.exitCode = ONE;
});
