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

function parseArgs(argv) {
  let configPath = DEFAULT_CONFIG;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--config') {
      index += 1;
      if (!argv[index]) throw new Error('--config requires a path');
      configPath = argv[index];
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }
  return {configPath: resolve(process.cwd(), configPath)};
}

async function loadConfig(configPath) {
  const text = await readFile(configPath, 'utf8');
  const config = JSON.parse(text);
  assert.ok(config.gcp, 'TiDB GCP smoke config requires gcp block');
  assert.equal(
    config.gcp.vmCount,
    EXPECTED_VM_COUNT,
    'TiDB GCP lifecycle smoke currently owns exactly one VM',
  );
  assert.ok(
    !Array.isArray(config.docker?.hosts) || config.docker.hosts.length === 0,
    'TiDB GCP lifecycle smoke must provision its own host',
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
    assert.ok(provisioner, 'Expected GCP smoke to provision a Docker host');

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
      mode: 'gcp-remote-docker',
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
      'TiDB GCP lifecycle smoke and infrastructure teardown both failed',
    );
  }
  if (primaryError) throw primaryError;
  if (teardownError) throw teardownError;

  process.stdout.write(PASS_PREFIX + JSON.stringify(result) + '\n');
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
