#!/usr/bin/env node

import {execFileSync} from 'node:child_process';
import {copyFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const ONE = 1;
const PASS_PREFIX = 'tidb-oltp-loadgen-image: PASS ';
const DEFAULT_TAG = 'lagrange-tidb-oltp-loadgen:local';
const FILES = Object.freeze([
  'test/distributed/reference-client/package.json',
  'test/distributed/reference-client/package-lock.json',
  'test/distributed/reference-client/tidb-oltp-adapter.js',
  'test/distributed/harness/oltp-baseline-dataset.js',
  'test/distributed/harness/oltp-baseline-workload.js',
  'scripts/checks/tidb-oltp-loadgen-runner.js',
]);
const DOCKERFILE = 'test/distributed/reference-loadgen/Dockerfile';

function parseArgs(argv) {
  let tag = DEFAULT_TAG;
  for (let index = 0; index < argv.length; index += ONE) {
    if (argv[index] !== '--tag') {
      throw new Error(`Unsupported argument: ${argv[index]}`);
    }
    index += ONE;
    if (!argv[index]) throw new Error('--tag requires a value');
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
  const {tag} = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const context = await mkdtemp(path.join(os.tmpdir(), 'tidb-loadgen-context-'));
  try {
    for (const relativePath of FILES) {
      await copyIntoContext(root, context, relativePath);
    }
    await copyFile(path.join(root, DOCKERFILE), path.join(context, 'Dockerfile'));
    execFileSync('docker', [
      'build',
      '--pull=false',
      '--file', path.join(context, 'Dockerfile'),
      '--tag', tag,
      context,
    ], {stdio: 'inherit'});
    const imageId = execFileSync(
      'docker',
      ['image', 'inspect', tag, '--format', '{{.Id}}'],
      {encoding: 'utf8'},
    ).trim();
    process.stdout.write(PASS_PREFIX + JSON.stringify({tag, imageId}) + '\n');
  } finally {
    await rm(context, {recursive: true, force: true});
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = ONE;
});
