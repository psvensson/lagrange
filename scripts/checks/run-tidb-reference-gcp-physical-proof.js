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
  TIDB_REFERENCE_REQUIRED_IMAGES,
  assertTiDbReferenceImagesAvailable,
} from './run-tidb-reference-lifecycle-live.js';

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
  assert.ok(config.gcp, 'TiDB physical proof requires gcp block');
  assert.equal(config.gcp.vmCount, EXPECTED_VM_COUNT);
  assert.equal(config.gcp.machineType, EXPECTED_MACHINE_TYPE);
  assert.equal(config.gcp.preemptible, false);
  assert.ok(
    !Array.isArray(config.docker?.hosts) || config.docker.hosts.length === ZERO,
    'TiDB physical proof must provision fresh controlled hosts',
  );
  return config;
}

function setupSql() {
  return [
    `DROP DATABASE IF EXISTS ${DATABASE_NAME}`,
    `CREATE DATABASE ${DATABASE_NAME}`,
    `USE ${DATABASE_NAME}`,
    `CREATE TABLE ${TABLE_NAME} (` +
      'id BIGINT PRIMARY KEY, value BIGINT NOT NULL' +
      ')',
    `INSERT INTO ${TABLE_NAME} (id, value) VALUES (1, ${PROBE_VALUE})`,
    `SELECT value FROM ${TABLE_NAME} WHERE id = 1`,
  ].join('; ') + ';';
}

function cleanupSql() {
  return `DROP DATABASE IF EXISTS ${DATABASE_NAME};`;
}

async function removeContainer(provider, container) {
  if (!provider || !container) return false;
  const inspect = await provider.inspectContainerIfExists(container.containerId);
  if (!inspect) return true;
  if (inspect.State?.Running === true || inspect.State?.Status === 'running') {
    await provider.stopContainer(container.containerId);
  }
  await provider.removeContainer(container.containerId);
  return true;
}

async function writeEvidence(evidence) {
  await mkdir(path.dirname(OUTPUT_PATH), {recursive: true});
  await writeFile(OUTPUT_PATH, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
}

function providerFor(host, tls) {
  return new DockerProvider({host, tls});
}

async function run() {
  const {configPath} = parseArgs(process.argv.slice(2));
  const inputConfig = await loadConfig(configPath);
  const localProvider = new DockerProvider();
  await assertTiDbReferenceImagesAvailable(localProvider);

  const runId = `lagrange-tidb-physical-${randomUUID().slice(0, 8)}`;
  let provisioner = null;
  let cluster = null;
  let loadgenProvider = null;
  let loadgenClient = null;
  let hostInfo = [];
  let placementProof = null;
  let physicalPlacements = null;
  let queryValue = null;
  let primaryError = null;
  const cleanupErrors = [];
  let loadgenClientRemoved = false;
  let clusterStopped = false;

  try {
    const provisioned = await provisionGcpDockerHosts(inputConfig, true);
    provisioner = provisioned.provisioner;
    assert.ok(provisioner, 'Expected GCP provisioner');

    const hosts = provisioned.runConfig.docker?.hosts || [];
    hostInfo = provisioned.runConfig.docker?.hostInfo || [];
    assert.equal(hosts.length, EXPECTED_VM_COUNT);
    assert.equal(hostInfo.length, EXPECTED_VM_COUNT);

    for (const image of TIDB_REFERENCE_REQUIRED_IMAGES) {
      await installGcpImage(provisioner, image, true);
    }

    const providers = hosts.map((host) =>
      providerFor(host, provisioned.runConfig.docker.tls));
    const control = {
      provider: providers[CONTROL_INDEX],
      host: hostInfo[CONTROL_INDEX].internalIp,
    };
    const storage = STORAGE_INDEXES.map((index) => ({
      provider: providers[index],
      host: hostInfo[index].internalIp,
    }));
    loadgenProvider = providers[LOADGEN_INDEX];

    cluster = await startTiDbReferencePhysicalCluster({
      control,
      storage,
      namePrefix: runId,
      resourceLimits: SHARED_DB_RESOURCE_LIMITS,
      tikvResourceLimits: TIKV_RESOURCE_LIMITS,
      readinessResourceLimits: CLIENT_RESOURCE_LIMITS,
    });

    physicalPlacements = cluster.containers.tikvStores.map(({containerId}) =>
      cluster.provider.getPhysicalPlacement(containerId));
    assert.deepEqual(
      physicalPlacements.map(({host}) => host),
      storage.map(({host}) => host),
      'TiKV container placements must match the three storage VMs',
    );

    loadgenClient = await loadgenProvider.createContainer({
      name: `${runId}-loadgen-client`,
      image: TIDB_REFERENCE_DEFAULTS.mysqlClientImage,
      network: 'host',
      hostNetwork: true,
      resourceLimits: CLIENT_RESOURCE_LIMITS,
      labels: {'lagrange.benchmark': 'tidb-reference-gcp-physical-proof'},
      entrypoint: ['sleep'],
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
    queryValue = String(setup.stdout || '').trim();
    assert.equal(queryValue, PROBE_VALUE);

    const expectedAddresses = storage.map(({host}) =>
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
    scenario: 'tidb-physical-rf3-gcp-proof',
    evidenceClass: 'gcp-physical-rf3-correctness-non-comparative',
    comparable: false,
    nonComparableReason:
      'This run proves physical RF3 placement and separate same-zone client ' +
      'reachability. Publishable performance comparison still requires ' +
      'persistent-disk parity and measurement-window resource accounting.',
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
        ...STORAGE_INDEXES.map((hostIndex, index) => ({
          hostIndex,
          role: `tikv-storage-${index + ONE}`,
        })),
        {hostIndex: LOADGEN_INDEX, role: 'correctness-load-generator'},
      ],
      trafficPath: 'vpc-internal',
      teardownVerified: Boolean(provisioner) && teardownError === null,
      computeCostEstimate: costEstimate,
    },
    topology: {
      physicalPorts: TIDB_REFERENCE_PHYSICAL_DEFAULTS,
      controlHost: hostInfo[CONTROL_INDEX]?.internalIp || null,
      storageHosts: STORAGE_INDEXES.map((index) =>
        hostInfo[index]?.internalIp || null),
      loadGeneratorHost: hostInfo[LOADGEN_INDEX]?.internalIp || null,
      distinctSystemHosts: 4,
      separateLoadGeneratorHost: true,
      physicalPlacements,
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
      infrastructureDestroyed: Boolean(provisioner) && teardownError === null,
    },
    failure: allErrors.length === ZERO ? null : {
      messages: allErrors.map((error) => String(error?.message || error)),
    },
  };
  await writeEvidence(evidence);

  if (allErrors.length > ONE) {
    throw new AggregateError(allErrors, 'TiDB physical RF3 proof failures');
  }
  if (allErrors.length === ONE) throw allErrors[ZERO];

  process.stdout.write(PASS_PREFIX + JSON.stringify({
    evidencePath: OUTPUT_PATH,
    queryValue,
    readinessAttempts: cluster.readiness.attempts,
    placementAttempts: placementProof.attempts,
    regionCount: placementProof.regions.length,
    expectedAddresses: placementProof.expectedAddresses,
    zone: inputConfig.gcp.zone,
    vmCount: inputConfig.gcp.vmCount,
    costEstimate,
  }) + '\n');
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = ONE;
});
