#!/usr/bin/env node

import {spawn, execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises';
import {basename, resolve} from 'node:path';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const COOL_START_MAX_C = 70;
const THERMAL_INVALID_C = 85;
const REPORT_PREFIX = 'movielens-lagrange-service-affinity-live-';
const REPORT_SUFFIX = '.report.json';
const DEMO_SCRIPT = 'examples/service-data-affinity/run-affinity-demo.js';
const DATA_ROOT = 'data/examples/service-data-affinity-demo';

function parseArgs(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(
        'usage: run-live-ab-sample.js --id <sample> --root <source-root> ' +
        '--output-root <evidence-dir>',
      );
    }
    result[key.slice(2)] = value;
  }
  if (!result.id || !result.root || !result['output-root']) {
    throw new Error(
      'usage: run-live-ab-sample.js --id <sample> --root <source-root> ' +
      '--output-root <evidence-dir>',
    );
  }
  return {
    id: result.id,
    root: resolve(result.root),
    outputRoot: resolve(result['output-root']),
  };
}

function maxTempFromSensorsJson(parsed) {
  let max = null;
  for (const chip of Object.values(parsed || {})) {
    for (const readings of Object.values(chip || {})) {
      if (typeof readings !== 'object' || readings === null) {
        continue;
      }
      for (const [key, value] of Object.entries(readings)) {
        if (key.endsWith('_input') && typeof value === 'number') {
          max = max === null ? value : Math.max(max, value);
        }
      }
    }
  }
  return max;
}

async function readMaxTempC() {
  try {
    const {stdout} = await execFileAsync('sensors', ['-j']);
    return maxTempFromSensorsJson(JSON.parse(stdout));
  } catch {
    return null;
  }
}

async function sha256File(file) {
  const content = await readFile(file);
  return createHash('sha256').update(content).digest('hex');
}

async function sourceIdentity(root) {
  const {computeSourceFingerprint} = await import(
    new URL('../../../src/diagnostics/source-fingerprint.js', import.meta.url)
  );
  const [gitHashResult, sourceDiffResult, sourceFingerprint] = await Promise.all([
    execFileAsync('git', ['rev-parse', 'HEAD'], {cwd: root}),
    execFileAsync('git', ['diff', '--binary', 'HEAD', '--', 'src'], {
      cwd: root,
      maxBuffer: 128 * 1024 * 1024,
    }),
    computeSourceFingerprint(resolve(root, 'src')),
  ]);
  return {
    gitHash: gitHashResult.stdout.trim(),
    sourceFingerprint,
    sourceDeltaSha256: createHash('sha256')
      .update(sourceDiffResult.stdout)
      .digest('hex'),
  };
}

async function reportNames(root) {
  const directory = resolve(root, 'test-output/reports');
  try {
    return new Set(
      (await readdir(directory))
        .filter((name) => name.startsWith(REPORT_PREFIX))
        .filter((name) => name.endsWith(REPORT_SUFFIX)),
    );
  } catch {
    return new Set();
  }
}

function runDemo(root) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('node', [DEMO_SCRIPT], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on('error', rejectPromise);
    child.on('close', (code) => resolvePromise({
      exitCode: code === null ? 1 : code,
      stdout,
      stderr,
    }));
  });
}

async function findNewReport(root, before) {
  const directory = resolve(root, 'test-output/reports');
  const candidates = [];
  for (const name of await reportNames(root)) {
    if (before.has(name)) {
      continue;
    }
    const file = resolve(directory, name);
    candidates.push({file, mtimeMs: (await stat(file)).mtimeMs});
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  if (candidates.length === 0) {
    throw new Error('demo produced no new live report');
  }
  return candidates[0].file;
}

async function archiveRun(root, outputFile) {
  await execFileAsync(
    'tar',
    ['-czf', outputFile, '-C', root, DATA_ROOT],
    {maxBuffer: 8 * 1024 * 1024},
  );
}

async function main() {
  const {id, root, outputRoot} = parseArgs(process.argv);
  await mkdir(outputRoot, {recursive: true});
  const beforeIdentity = await sourceIdentity(root);
  const preTempC = await readMaxTempC();
  if (preTempC !== null && preTempC >= COOL_START_MAX_C) {
    throw new Error(
      `thermal start rejected: ${preTempC}C >= ${COOL_START_MAX_C}C`,
    );
  }
  const beforeReports = await reportNames(root);
  const startedAt = new Date().toISOString();
  const run = await runDemo(root);
  const completedAt = new Date().toISOString();
  const postTempC = await readMaxTempC();
  const afterIdentity = await sourceIdentity(root);
  const sourceStable =
    JSON.stringify(afterIdentity) === JSON.stringify(beforeIdentity);
  const sourceReport = await findNewReport(root, beforeReports);
  const copiedReport = resolve(outputRoot, `${id}.report.json`);
  const archive = resolve(outputRoot, `${id}.run-state.tar.gz`);
  await copyFile(sourceReport, copiedReport);
  await archiveRun(root, archive);
  const failedThermally =
    run.exitCode !== 0 &&
    postTempC !== null &&
    postTempC >= THERMAL_INVALID_C;
  const sample = {
    schemaVersion: 'formation-liveness-live-ab-sample-v1',
    id,
    root,
    startedAt,
    completedAt,
    exitCode: run.exitCode,
    green: run.exitCode === 0,
    measuring: !failedThermally,
    preTempC,
    postTempC,
    thermalPolicy: {
      coolStartMaxC: COOL_START_MAX_C,
      failedRunInvalidAtOrAboveC: THERMAL_INVALID_C,
    },
    sourceStable,
    sourceIdentity: beforeIdentity,
    completedSourceIdentity: afterIdentity,
    report: {
      sourcePath: sourceReport,
      evidencePath: copiedReport,
      sha256: await sha256File(copiedReport),
    },
    archive: {
      evidencePath: archive,
      sha256: await sha256File(archive),
    },
    stdoutTail: run.stdout.split('\n').slice(-40),
    stderrTail: run.stderr.split('\n').slice(-40),
  };
  const samplePath = resolve(outputRoot, `${id}.sample.json`);
  await writeFile(samplePath, JSON.stringify(sample, null, 2));
  console.log(`A/B sample: ${samplePath}`);
  console.log(
    `A/B verdict: ${sample.measuring ? 'MEASURING' : 'NON_MEASURING'} ` +
    `${sample.green ? 'GREEN' : 'RED'}; source ${sourceStable ? 'stable' : 'changed'}`,
  );
  process.exitCode =
    sourceStable && sample.measuring ? run.exitCode : 2;
}

main().catch((error) => {
  console.error(`${basename(process.argv[1])}: ${error.stack || error.message}`);
  process.exitCode = 2;
});
