#!/usr/bin/env node

import {execFileSync} from 'node:child_process';
import {copyFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const objectFreeze = Object.freeze;
const jsonStringify = JSON.stringify;
const stringTrim = Function.call.bind(String.prototype.trim);

const ONE = 1;
const TWO = 2;
const PASS_PREFIX = 'tidb-oltp-loadgen-image: PASS ';
const DEFAULT_TAG = 'lagrange-tidb-oltp-loadgen:local';
const CLI_ARG_TAG = '--tag';
const ERROR_TAG_REQUIRED = '--tag requires a value';
const DOCKERFILE_NAME = 'Dockerfile';
const DOCKER_BIN = 'docker';
const DOCKER_BUILD = 'build';
const DOCKER_PULL_FALSE = '--pull=false';
const DOCKER_FILE_FLAG = '--file';
const DOCKER_STDIO_INHERIT = 'inherit';
const DOCKER_IMAGE = 'image';
const DOCKER_INSPECT = 'inspect';
const DOCKER_FORMAT_FLAG = '--format';
const DOCKER_FORMAT_ID = '{{.Id}}';
const CONTEXT_TEMP_PREFIX = 'tidb-loadgen-context-';
const ENCODING_UTF8 = 'utf8';
const NEWLINE = '\n';

const FILES = objectFreeze([
  'test/distributed/reference-client/package.json',
  'test/distributed/reference-client/package-lock.json',
  'test/distributed/reference-client/tidb-oltp-adapter.js',
  'test/distributed/harness/oltp-baseline-dataset.js',
  'test/distributed/harness/oltp-baseline-workload.js',
  'test/distributed/harness/oltp-baseline-transaction-executor.js',
  'scripts/checks/tidb-oltp-loadgen-runner.js',
]);
const DOCKERFILE = 'test/distributed/reference-loadgen/Dockerfile';

function parseArgs(argv) {
  let tag = DEFAULT_TAG;
  for (let index = 0; index < argv.length; index += ONE) {
    if (argv[index] !== CLI_ARG_TAG) {
      throw new Error(`Unsupported argument: ${argv[index]}`);
    }
    index += ONE;
    if (!argv[index]) throw new Error(ERROR_TAG_REQUIRED);
    tag = argv[index];
  }
  return {tag};
}

async function copyIntoContext(root, context, relativePath) {
  const destination = path.join(context, relativePath);
  await mkdir(path.dirname(destination), {recursive: true});
  await copyFile(path.join(root, relativePath), destination);
}

async function main() {
  const {tag} = parseArgs(process.argv.slice(TWO));
  const root = process.cwd();
  const context = await mkdtemp(path.join(os.tmpdir(), CONTEXT_TEMP_PREFIX));
  try {
    for (const relativePath of FILES) {
      await copyIntoContext(root, context, relativePath);
    }
    await copyFile(path.join(root, DOCKERFILE), path.join(context, DOCKERFILE_NAME));
    execFileSync(DOCKER_BIN, [
      DOCKER_BUILD,
      DOCKER_PULL_FALSE,
      DOCKER_FILE_FLAG, path.join(context, DOCKERFILE_NAME),
      CLI_ARG_TAG, tag,
      context,
    ], {stdio: DOCKER_STDIO_INHERIT});
    const imageId = stringTrim(execFileSync(
      DOCKER_BIN,
      [DOCKER_IMAGE, DOCKER_INSPECT, tag, DOCKER_FORMAT_FLAG, DOCKER_FORMAT_ID],
      {encoding: ENCODING_UTF8},
    ));
    process.stdout.write(PASS_PREFIX + jsonStringify({tag, imageId}) + NEWLINE);
  } finally {
    await rm(context, {recursive: true, force: true});
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = ONE;
});
