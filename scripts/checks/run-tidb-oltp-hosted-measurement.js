#!/usr/bin/env node

import os from 'node:os';
import {pathToFileURL} from 'node:url';

import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {runTiDbOltpMeasurement} from './tidb-oltp-measurement.js';

const ONE = 1;
const OUTPUT_PATH =
  process.env.TIDB_OLTP_EVIDENCE_PATH ||
  'test-output/tidb-reference/oltp-hosted-smoke.json';
const PASS_PREFIX = 'tidb-oltp-hosted-measurement: PASS ';

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

async function main() {
  const result = await runTiDbOltpMeasurement({
    provider: new DockerProvider(),
    outputPath: OUTPUT_PATH,
    evidenceClass: 'hosted-smoke-non-comparative',
    comparable: false,
    nonComparableReason:
      'GitHub-hosted runner resources and placement are not the controlled ' +
      'GCP benchmark environment; these numbers validate measurement plumbing only.',
    controllerEvidence: controllerEvidence(),
    executionEnvironment: {
      kind: 'github-hosted-local-docker',
      colocatedWithController: true,
    },
  });
  process.stdout.write(PASS_PREFIX + JSON.stringify(result.summary) + '\n');
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = ONE;
  });
}
