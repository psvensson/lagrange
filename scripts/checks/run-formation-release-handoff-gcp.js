#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {computeSourceFingerprint} from
  '../../src/diagnostics/source-fingerprint.js';
import {analyzeFormationReleaseEvents} from
  './formation-release-handoff-gcp-analysis.js';
import {
  startGcpAffinityCluster,
} from '../../examples/service-data-affinity/gcp-cluster-provider.js';

const arraySort = Function.call.bind(Array.prototype.sort);
const arrayFind = Function.call.bind(Array.prototype.find);
const bufferFrom = Buffer.from;
const DateConstructor = Date;
const dateToISOString = Function.call.bind(Date.prototype.toISOString);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const stringConstructor = String;
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringReplaceAll = Function.call.bind(String.prototype.replaceAll);
const stringSplit = Function.call.bind(String.prototype.split);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT_ROOT = path.join(
  ROOT,
  'test-output/reports/formation-release-handoff-closure',
);
const FIXED_VARIANT = 'fixed';
const REVERTED_VARIANT = 'reverted';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseLogLine(line) {
  try {
    const value = jsonParse(line);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

async function readLogEvents(outputDir) {
  const names = arraySort(await fs.readdir(outputDir));
  const events = [];
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    if (!stringIncludes(name, '.log')) continue;
    const bytes = await fs.readFile(path.join(outputDir, name), 'utf8');
    const lines = stringSplit(bytes, '\n');
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const event = parseLogLine(lines[lineIndex]);
      if (event) events[events.length] = event;
    }
  }
  return events;
}

function resolveVariant(argv = process.argv.slice(2)) {
  const value = arrayFind(argv, (arg) =>
    arg === `--variant=${FIXED_VARIANT}` ||
    arg === `--variant=${REVERTED_VARIANT}`);
  return value === `--variant=${REVERTED_VARIANT}` ?
    REVERTED_VARIANT : FIXED_VARIANT;
}

async function runCluster(outputDir) {
  let handle = null;
  let error = null;
  try {
    handle = await startGcpAffinityCluster({
      verbose: true,
      outputDir,
    });
  } catch (caught) {
    error = caught;
  } finally {
    if (handle) {
      try {
        await handle.stop();
      } catch (caught) {
        error ||= caught;
      }
    }
  }
  return {error};
}

async function analyzeClusterOutput(outputDir, sourceFingerprint) {
  try {
    return {
      analysis: analyzeFormationReleaseEvents(
        await readLogEvents(outputDir),
        sourceFingerprint,
      ),
      error: null,
    };
  } catch (error) {
    return {analysis: null, error};
  }
}

async function writeReport(report, outputDir) {
  await fs.mkdir(path.dirname(outputDir), {recursive: true});
  const reportBytes = bufferFrom(`${jsonStringify(report, null, 2)}\n`);
  const reportPath = path.join(path.dirname(outputDir), 'report.json');
  await fs.writeFile(reportPath, reportBytes);
  process.stdout.write(`${jsonStringify({
    ...report,
    report: path.relative(ROOT, reportPath),
    reportSha256: sha256(reportBytes),
  }, null, 2)}\n`);
}

async function runFormationReleaseHandoffGcp(options = {}) {
  const variant = options.variant || resolveVariant();
  const sourceFingerprint = await computeSourceFingerprint(
    path.join(ROOT, 'src'),
  );
  const startedAt = new DateConstructor();
  const runId = stringReplaceAll(dateToISOString(startedAt), ':', '-');
  const outputDir = path.join(REPORT_ROOT, runId, 'full-logs');
  const cluster = await runCluster(outputDir);
  const analyzed = await analyzeClusterOutput(outputDir, sourceFingerprint);
  const error = cluster.error || analyzed.error;
  const analysis = analyzed.analysis;
  const fixedPassed = variant !== FIXED_VARIANT ||
    analysis?.closurePassed === true;
  const report = {
    schemaVersion: 2,
    scenario: 'formation-release-handoff-closure-live-gcp',
    fidelity: 'live-gcp',
    variant,
    sourceFingerprint,
    startedAt: dateToISOString(startedAt),
    finishedAt: dateToISOString(new DateConstructor()),
    passed: error === null && fixedPassed,
    clusterStartPassed: error === null,
    error: error ? stringConstructor(error.message || error) : null,
    analysis,
    logDir: path.relative(ROOT, outputDir),
  };
  await writeReport(report, outputDir);
  if (!report.passed) process.exitCode = 1;
  return report;
}

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await runFormationReleaseHandoffGcp();
}

export {
  analyzeFormationReleaseEvents,
  readLogEvents,
  runFormationReleaseHandoffGcp,
};
