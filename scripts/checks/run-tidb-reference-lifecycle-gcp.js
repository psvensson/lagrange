#!/usr/bin/env node

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {
  installGcpImage,
  provisionGcpDockerHosts,
} from '../../test/distributed/gcp-run-orchestration.js';
import {
  TIDB_REFERENCE_REQUIRED_IMAGES,
  assertTiDbReferenceImagesAvailable,
  runTiDbReferenceLifecycleSmoke,
} from './run-tidb-reference-lifecycle-live.js';

const DEFAULT_CONFIG =
  'test/distributed/config/gcp-tidb-reference-smoke.json';
const PASS_PREFIX = 'tidb-reference-lifecycle-gcp: PASS ';
const EXPECTED_VM_COUNT = 1;
const ARG_CONFIG = '--config';
const ERROR_CONFIG_PATH_REQUIRED = '--config requires a path';
const ERROR_GCP_BLOCK_REQUIRED = 'TiDB GCP smoke config requires gcp block';
const ERROR_EXACTLY_ONE_VM =
  'TiDB GCP lifecycle smoke currently owns exactly one VM';
const ERROR_MUST_PROVISION_HOST =
  'TiDB GCP lifecycle smoke must provision its own host';
const ERROR_EXPECTED_PROVISIONER =
  'Expected GCP smoke to provision a Docker host';
const ERROR_DUAL_FAILURE =
  'TiDB GCP lifecycle smoke and infrastructure teardown both failed';
const MODE_GCP_REMOTE_DOCKER = 'gcp-remote-docker';
const FILE_ENCODING_UTF8 = 'utf8';
const NEWLINE = '\n';

function parseArgs(argv) {
  let configPath = DEFAULT_CONFIG;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === ARG_CONFIG) {
      index += 1;
      if (!argv[index]) throw new Error(ERROR_CONFIG_PATH_REQUIRED);
      configPath = argv[index];
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }
  return {configPath: resolve(process.cwd(), configPath)};
}

async function loadConfig(configPath) {
  const text = await readFile(configPath, FILE_ENCODING_UTF8);
  const config = JSON.parse(text);
  assert.ok(config.gcp, ERROR_GCP_BLOCK_REQUIRED);
  assert.equal(
    config.gcp.vmCount,
    EXPECTED_VM_COUNT,
    ERROR_EXACTLY_ONE_VM,
  );
  assert.ok(
    !Array.isArray(config.docker?.hosts) || config.docker.hosts.length === 0,
    ERROR_MUST_PROVISION_HOST,
  );
  return config;
}

async function run() {
  const {configPath} = parseArgs(process.argv.slice(2));
  const inputConfig = await loadConfig(configPath);

  // Fail before provisioning billable infrastructure if the pinned comparator
  // images are not available to distribute through the existing GCP owner.
  const localProvider = new DockerProvider();
  await assertTiDbReferenceImagesAvailable(localProvider);

  let provisioner = null;
  let primaryError = null;
  let result = null;

  try {
    const provisioned = await provisionGcpDockerHosts(inputConfig, true);
    provisioner = provisioned.provisioner;
    assert.ok(provisioner, ERROR_EXPECTED_PROVISIONER);

    const hosts = provisioned.runConfig.docker?.hosts || [];
    assert.equal(hosts.length, EXPECTED_VM_COUNT);

    for (const image of TIDB_REFERENCE_REQUIRED_IMAGES) {
      await installGcpImage(provisioner, image, true);
    }

    const remoteProvider = new DockerProvider({
      host: hosts[0],
      tls: provisioned.runConfig.docker.tls,
    });
    const smoke = await runTiDbReferenceLifecycleSmoke({
      provider: remoteProvider,
      requireImages: true,
    });

    result = {
      ...smoke,
      mode: MODE_GCP_REMOTE_DOCKER,
      project: inputConfig.gcp.project,
      zone: inputConfig.gcp.zone,
      machineType: inputConfig.gcp.machineType,
      vmCount: inputConfig.gcp.vmCount,
    };
  } catch (error) {
    primaryError = error;
  }

  let teardownError = null;
  if (provisioner) {
    try {
      await provisioner.destroy();
    } catch (error) {
      teardownError = error;
    }
  }

  if (primaryError && teardownError) {
    throw new AggregateError(
      [primaryError, teardownError],
      ERROR_DUAL_FAILURE,
    );
  }
  if (primaryError) throw primaryError;
  if (teardownError) throw teardownError;

  process.stdout.write(PASS_PREFIX + JSON.stringify(result) + NEWLINE);
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}${NEWLINE}`);
  process.exitCode = 1;
});
