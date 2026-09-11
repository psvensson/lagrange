#!/usr/bin/env node

import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import {resolve} from 'node:path';

import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {
  installGcpImage,
  provisionGcpDockerHosts,
} from '../../test/distributed/gcp-run-orchestration.js';
import {TIDB_REFERENCE_DEFAULTS} from
  '../../test/distributed/harness/tidb-reference-lifecycle.js';
import {
  TIDB_REFERENCE_REQUIRED_IMAGES,
  assertTiDbReferenceImagesAvailable,
} from './run-tidb-reference-lifecycle-live.js';
import {runTiDbOltpMeasurement} from './tidb-oltp-measurement.js';

const ONE = 1;
const DEFAULT_CONFIG =
  'test/distributed/config/gcp-tidb-oltp-single-host.json';
const OUTPUT_PATH =
  process.env.TIDB_OLTP_GCP_EVIDENCE_PATH ||
  'test-output/tidb-reference/oltp-gcp-single-host.json';
const PASS_PREFIX = 'tidb-oltp-gcp-measurement: PASS ';
const EXPECTED_VM_COUNT = 1;
const EXPECTED_MACHINE_TYPE = 'n2-standard-4';
const TIDB_CONTAINER_SQL_PORT = 8080;
const GCP_HOST_SQL_PORT = 8089;
const CONTROLLER_LOCAL_SQL_PORT = TIDB_REFERENCE_DEFAULTS.tidbPort;

function controllerEvidence() {
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

function parseArgs(argv) {
  let configPath = DEFAULT_CONFIG;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--config') {
      throw new Error(`Unsupported argument: ${argv[index]}`);
    }
    index += 1;
    if (!argv[index]) throw new Error('--config requires a path');
    configPath = argv[index];
  }
  return {configPath: resolve(process.cwd(), configPath)};
}

async function loadConfig(configPath) {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  assert.ok(config.gcp, 'TiDB GCP measurement config requires gcp block');
  assert.equal(config.gcp.vmCount, EXPECTED_VM_COUNT);
  assert.equal(config.gcp.machineType, EXPECTED_MACHINE_TYPE);
  assert.equal(config.gcp.preemptible, false);
  assert.ok(
    !Array.isArray(config.docker?.hosts) || config.docker.hosts.length === 0,
    'TiDB GCP measurement must provision its own controlled host',
  );
  return config;
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

          const command = (options.command || []).map((arg) =>
            arg === `-P=${TIDB_REFERENCE_DEFAULTS.tidbPort}` ?
              `-P=${TIDB_CONTAINER_SQL_PORT}` : arg);
          const hostConfigExtras = {
            ...(options.hostConfigExtras || {}),
            PortBindings: {
              ...(options.hostConfigExtras?.PortBindings || {}),
              [`${TIDB_CONTAINER_SQL_PORT}/tcp`]: [{
                HostIp: '0.0.0.0',
                HostPort: String(GCP_HOST_SQL_PORT),
              }],
            },
          };
          const container = await createContainer({
            ...options,
            command,
            hostConfigExtras,
          });
          // The workload driver is in the controller process. A local TCP
          // forwarder below owns the path from 127.0.0.1:4000 to the remote
          // GCP host's published SQL port. Readiness remains provider-local.
          return {...container, ip: '127.0.0.1'};
        };
      }

      if (property === 'execInContainer') {
        return async (containerId, command) => {
          const patched = Array.isArray(command) ? command.map((arg) =>
            arg === `--port=${TIDB_REFERENCE_DEFAULTS.tidbPort}` ?
              `--port=${TIDB_CONTAINER_SQL_PORT}` : arg) : command;
          return execInContainer(containerId, patched);
        };
      }

      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function startTcpForwarder(remoteHost) {
  const sockets = new Set();
  const server = net.createServer((downstream) => {
    const upstream = net.connect({host: remoteHost, port: GCP_HOST_SQL_PORT});
    sockets.add(downstream);
    sockets.add(upstream);
    const closeBoth = () => {
      downstream.destroy();
      upstream.destroy();
      sockets.delete(downstream);
      sockets.delete(upstream);
    };
    downstream.on('error', closeBoth);
    upstream.on('error', closeBoth);
    downstream.on('close', () => sockets.delete(downstream));
    upstream.on('close', () => sockets.delete(upstream));
    downstream.pipe(upstream);
    upstream.pipe(downstream);
  });

  await new Promise((resolvePromise, rejectPromise) => {
    const onError = (error) => {
      server.off('listening', onListening);
      rejectPromise(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolvePromise();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(CONTROLLER_LOCAL_SQL_PORT, '127.0.0.1');
  });

  return {
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolvePromise, rejectPromise) => {
        server.close((error) => error ? rejectPromise(error) : resolvePromise());
      });
    },
  };
}

async function rewriteEvidenceWithInfrastructure(result, infrastructure) {
  const evidence = {
    ...result.evidence,
    infrastructure,
  };
  await writeFile(
    result.evidencePath,
    JSON.stringify(evidence, null, 2) + '\n',
    'utf8',
  );
  result.evidence = evidence;
}

async function run() {
  const {configPath} = parseArgs(process.argv.slice(2));
  const inputConfig = await loadConfig(configPath);

  // The existing image distributor copies from the controller's local Docker
  // daemon. Fail before provisioning if any exact pinned comparator image is
  // absent rather than creating billable VMs and failing later.
  const localProvider = new DockerProvider();
  await assertTiDbReferenceImagesAvailable(localProvider);

  let provisioner = null;
  let forwarder = null;
  let result = null;
  let primaryError = null;

  try {
    const provisioned = await provisionGcpDockerHosts(inputConfig, true);
    provisioner = provisioned.provisioner;
    assert.ok(provisioner, 'Expected controlled GCP provisioner');
    const hosts = provisioned.runConfig.docker?.hosts || [];
    const hostInfo = provisioned.runConfig.docker?.hostInfo || [];
    assert.equal(hosts.length, EXPECTED_VM_COUNT);
    assert.equal(hostInfo.length, EXPECTED_VM_COUNT);

    for (const image of TIDB_REFERENCE_REQUIRED_IMAGES) {
      await installGcpImage(provisioner, image, true);
    }

    const remoteProvider = new DockerProvider({
      host: hosts[0],
      tls: provisioned.runConfig.docker.tls,
    });
    const benchmarkProvider = createPublishedSqlProvider(remoteProvider);
    forwarder = await startTcpForwarder(hostInfo[0].externalIp);

    result = await runTiDbOltpMeasurement({
      provider: benchmarkProvider,
      outputPath: OUTPUT_PATH,
      evidenceClass: 'gcp-single-host-controlled-non-comparative',
      comparable: false,
      nonComparableReason:
        'The machine class and zone are controlled, but PD, TiDB, and all three ' +
        'TiKV stores still share one VM. Final TiDB/Lagrange comparison requires ' +
        'one storage replica per VM and the paired topology contract.',
      controllerEvidence: controllerEvidence(),
      executionEnvironment: {
        kind: 'gcp-single-host-remote-docker',
        controlled: true,
        project: inputConfig.gcp.project,
        zone: inputConfig.gcp.zone,
        machineType: inputConfig.gcp.machineType,
        vmCount: inputConfig.gcp.vmCount,
        preemptible: inputConfig.gcp.preemptible,
        publishedSqlBridge: {
          containerPort: TIDB_CONTAINER_SQL_PORT,
          hostPort: GCP_HOST_SQL_PORT,
          controllerLocalPort: CONTROLLER_LOCAL_SQL_PORT,
          firewallScope: 'provisioner-runner-ip-plus-vpc',
        },
      },
    });
  } catch (error) {
    primaryError = error;
  }

  let forwarderError = null;
  if (forwarder) {
    try {
      await forwarder.close();
    } catch (error) {
      forwarderError = error;
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
  if (result) {
    await rewriteEvidenceWithInfrastructure(result, {
      teardownVerified: !teardownError,
      controllerForwarderClosed: !forwarderError,
      computeCostEstimate: costEstimate,
    });
  }

  const failures = [primaryError, forwarderError, teardownError].filter(Boolean);
  if (failures.length > ONE) {
    throw new AggregateError(failures, 'TiDB GCP measurement/cleanup failures');
  }
  if (failures.length === ONE) throw failures[0];

  process.stdout.write(PASS_PREFIX + JSON.stringify({
    ...result.summary,
    project: inputConfig.gcp.project,
    zone: inputConfig.gcp.zone,
    machineType: inputConfig.gcp.machineType,
    vmCount: inputConfig.gcp.vmCount,
    costEstimate,
  }) + '\n');
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = ONE;
});
