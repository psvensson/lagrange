#!/usr/bin/env node

import {execFile} from 'node:child_process';
import {readdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const EVIDENCE_ROOT = resolve(
  'solve/changes/formation-liveness-dependency-serial-planner/live-ab',
);
const MATCHED_WINDOW_MS = 180_000;
const ACK_SKIP_MESSAGE =
  'Skipping ACK-timeout quarantine: peer demonstrably alive (slow, not dead)';
const LOG_PATH_PATTERN =
  /^data\/examples\/service-data-affinity-demo\/node-\d+\.log$/;

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function containsNodesPartition(entry) {
  return JSON.stringify(entry).includes('nodes-p1');
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function topEntries(map, limit = 12) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([message, count]) => ({message, count}));
}

async function readArchiveLogs(archivePath) {
  const {stdout: listing} = await execFileAsync(
    'tar',
    ['-tzf', archivePath],
    {maxBuffer: 64 * 1024 * 1024},
  );
  const logPaths = listing
    .split('\n')
    .filter((entry) => LOG_PATH_PATTERN.test(entry));
  const entries = [];
  for (const logPath of logPaths) {
    const {stdout} = await execFileAsync(
      'tar',
      ['-xOf', archivePath, logPath],
      {maxBuffer: 128 * 1024 * 1024},
    );
    for (const line of stdout.split('\n')) {
      if (!line.trim()) {
        continue;
      }
      try {
        entries.push(JSON.parse(line));
      } catch {
        // The census counts structured log events only.
      }
    }
  }
  entries.sort((left, right) => Date.parse(left.time) - Date.parse(right.time));
  return entries;
}

function census(entries) {
  const firstTime = entries[0]?.time || null;
  const lastTime = entries.at(-1)?.time || null;
  const firstMs = firstTime ? Date.parse(firstTime) : null;
  const lastMs = lastTime ? Date.parse(lastTime) : null;
  const durationMs =
    Number.isFinite(firstMs) && Number.isFinite(lastMs) ?
      Math.max(1, lastMs - firstMs) :
      0;
  const levels = {};
  const matchedLevels = {};
  const errorMessages = new Map();
  const matchedErrorMessages = new Map();
  const nodesWarningMessages = new Map();
  const matchedNodesWarningMessages = new Map();
  let nodesWarnings = 0;
  let matchedNodesWarnings = 0;
  let ackTimeoutPeerAliveSkips = 0;
  let matchedAckTimeoutPeerAliveSkips = 0;
  for (const entry of entries) {
    const level = Number(entry.level);
    levels[level] = (levels[level] || 0) + 1;
    const inMatchedWindow =
      Number.isFinite(firstMs) &&
      Date.parse(entry.time) - firstMs <= MATCHED_WINDOW_MS;
    if (inMatchedWindow) {
      matchedLevels[level] = (matchedLevels[level] || 0) + 1;
    }
    if (level === 40 && containsNodesPartition(entry)) {
      nodesWarnings += 1;
      increment(nodesWarningMessages, entry.msg || '(missing msg)');
      if (inMatchedWindow) {
        matchedNodesWarnings += 1;
        increment(
          matchedNodesWarningMessages,
          entry.msg || '(missing msg)',
        );
      }
    }
    if (entry.msg === ACK_SKIP_MESSAGE) {
      ackTimeoutPeerAliveSkips += 1;
      if (inMatchedWindow) {
        matchedAckTimeoutPeerAliveSkips += 1;
      }
    }
    if (level === 50) {
      increment(errorMessages, entry.msg || '(missing msg)');
      if (inMatchedWindow) {
        increment(matchedErrorMessages, entry.msg || '(missing msg)');
      }
    }
  }
  const durationMinutes = durationMs / 60_000;
  return {
    structuredLogEvents: entries.length,
    firstTime,
    lastTime,
    durationMs,
    level30: levels[30] || 0,
    level40: levels[40] || 0,
    level50: levels[50] || 0,
    nodesP1Level40: nodesWarnings,
    ackTimeoutPeerAliveSkips,
    level50PerMinute: round((levels[50] || 0) / durationMinutes),
    nodesP1Level40PerMinute: round(nodesWarnings / durationMinutes),
    matchedFormationWindow: {
      durationMs: MATCHED_WINDOW_MS,
      level30: matchedLevels[30] || 0,
      level40: matchedLevels[40] || 0,
      level50: matchedLevels[50] || 0,
      nodesP1Level40: matchedNodesWarnings,
      ackTimeoutPeerAliveSkips: matchedAckTimeoutPeerAliveSkips,
      topLevel50Messages: topEntries(matchedErrorMessages),
      topNodesP1Level40Messages: topEntries(matchedNodesWarningMessages),
    },
    topLevel50Messages: topEntries(errorMessages),
    topNodesP1Level40Messages: topEntries(nodesWarningMessages),
  };
}

function reportOutcome(report) {
  const scenario = report.standardSummary?.scenarios?.[0];
  const detail = scenario?.detail || {};
  const history =
    detail.schemaAdmission?.transitionHistory?.transitions || [];
  const observedInflight = history
    .map((transition) => transition.effectiveInFlightCount)
    .filter(Number.isInteger);
  const snapshotInflight =
    detail.schemaAdmission?.snapshot?.effectiveInFlightCount;
  return {
    passed: scenario?.passed === true,
    error: detail.error || null,
    schemaAdmission: {
      admitted: detail.schemaAdmission?.admitted === true,
      state: detail.schemaAdmission?.state || null,
      canonicalBlocker:
        detail.schemaAdmission?.snapshot?.canonicalBlocker || null,
      finalObservedEffectiveInFlightCount:
        Number.isInteger(snapshotInflight) ? snapshotInflight : null,
      maxObservedEffectiveInFlightCount:
        observedInflight.length > 0 ? Math.max(...observedInflight) : null,
    },
    preloadAdmission: {
      admitted: detail.preloadAdmission?.admitted === true,
      loadLaneAdmitted:
        detail.preloadAdmission?.loadLaneAdmission?.admitted === true,
    },
  };
}

async function analyzeSample(sampleFile) {
  const samplePath = resolve(EVIDENCE_ROOT, sampleFile);
  const sample = JSON.parse(await readFile(samplePath, 'utf8'));
  const report = JSON.parse(await readFile(
    resolve(EVIDENCE_ROOT, `${sample.id}.report.json`),
    'utf8',
  ));
  const archivePath = resolve(EVIDENCE_ROOT, `${sample.id}.run-state.tar.gz`);
  return {
    id: sample.id,
    arm: sample.id.startsWith('fixed-') ? 'fixed' : 'reverted',
    measuring: sample.measuring,
    sourceStable: sample.sourceStable,
    preTempC: sample.preTempC,
    postTempC: sample.postTempC,
    sourceIdentity: sample.sourceIdentity,
    outcome: reportOutcome(report),
    logCensus: census(await readArchiveLogs(archivePath)),
    evidence: {
      sample: samplePath,
      reportSha256: sample.report.sha256,
      archiveSha256: sample.archive.sha256,
    },
  };
}

function aggregate(samples, arm) {
  const selected = samples.filter((sample) => sample.arm === arm);
  const sum = (read) => selected.reduce((total, sample) => total + read(sample), 0);
  const durationMs = sum((sample) => sample.logCensus.durationMs);
  const level50 = sum((sample) => sample.logCensus.level50);
  const nodesWarnings = sum((sample) => sample.logCensus.nodesP1Level40);
  return {
    samples: selected.length,
    measuringSamples: selected.filter((sample) => sample.measuring).length,
    stableSourceSamples: selected.filter((sample) => sample.sourceStable).length,
    passedSamples: selected.filter((sample) => sample.outcome.passed).length,
    clusterOrSchemaAdmissionSamples: selected.filter(
      (sample) => sample.outcome.schemaAdmission.state !== 'not_observed',
    ).length,
    schemaAdmittedSamples: selected.filter(
      (sample) => sample.outcome.schemaAdmission.admitted,
    ).length,
    preloadAdmittedSamples: selected.filter(
      (sample) => sample.outcome.preloadAdmission.admitted,
    ).length,
    durationMs,
    level50,
    nodesP1Level40: nodesWarnings,
    level50PerMinute: round(level50 / (durationMs / 60_000)),
    nodesP1Level40PerMinute: round(
      nodesWarnings / (durationMs / 60_000),
    ),
    matchedFormationWindow: {
      durationMs: selected.length * MATCHED_WINDOW_MS,
      level50: sum(
        (sample) => sample.logCensus.matchedFormationWindow.level50,
      ),
      nodesP1Level40: sum(
        (sample) => sample.logCensus.matchedFormationWindow.nodesP1Level40,
      ),
    },
    finalObservedEffectiveInFlightCounts: selected
      .map((sample) =>
        sample.outcome.schemaAdmission.finalObservedEffectiveInFlightCount)
      .filter(Number.isInteger),
    maxObservedEffectiveInFlightCounts: selected
      .map((sample) =>
        sample.outcome.schemaAdmission.maxObservedEffectiveInFlightCount)
      .filter(Number.isInteger),
  };
}

async function main() {
  const sampleFiles = (await readdir(EVIDENCE_ROOT))
    .filter((name) => name.endsWith('.sample.json'))
    .sort();
  const samples = [];
  for (const sampleFile of sampleFiles) {
    samples.push(await analyzeSample(sampleFile));
  }
  const fixed = aggregate(samples, 'fixed');
  const reverted = aggregate(samples, 'reverted');
  const summary = {
    schemaVersion: 'formation-liveness-live-ab-analysis-v1',
    question:
      'Does the narrow nodes-p1 formation-liveness dependency advance the ' +
      'real MovieLens boundary without the broad-priority experiment’s ' +
      'matched-window error, nodes-warning, or in-flight amplification?',
    comparisonContract: {
      minimumMeasuringSamplesPerArm: 2,
      interleaving: ['fixed-1', 'reverted-1', 'fixed-2', 'reverted-2'],
      matchedFormationWindowMsPerSample: MATCHED_WINDOW_MS,
      nodesWarningDefinition:
        'structured level-40 event whose JSON contains exact nodes-p1',
      errorDefinition: 'all structured level-50 events',
      caveat:
        'Raw totals are retained, but fixed runs execute 4.266x more wall-clock ' +
        'work because both reverted runs fail before load. Safety therefore ' +
        'uses the equal first-180-second window and full-run rates.',
    },
    samples,
    aggregate: {fixed, reverted},
    ratios: {
      rawLevel50: round(fixed.level50 / Math.max(1, reverted.level50)),
      level50PerMinute: round(
        fixed.level50PerMinute / Math.max(0.0001, reverted.level50PerMinute),
      ),
      matchedWindowLevel50: round(
        fixed.matchedFormationWindow.level50 /
        Math.max(1, reverted.matchedFormationWindow.level50),
      ),
      rawNodesP1Level40: round(
        fixed.nodesP1Level40 / Math.max(1, reverted.nodesP1Level40),
      ),
      nodesP1Level40PerMinute: round(
        fixed.nodesP1Level40PerMinute /
        Math.max(0.0001, reverted.nodesP1Level40PerMinute),
      ),
      matchedWindowNodesP1Level40: round(
        fixed.matchedFormationWindow.nodesP1Level40 /
        Math.max(1, reverted.matchedFormationWindow.nodesP1Level40),
      ),
    },
    decision: {
      outcome:
        fixed.schemaAdmittedSamples === 2 &&
        reverted.schemaAdmittedSamples === 0 ?
          'IMPROVED_BOUNDARY_2_OF_2_VS_0_OF_2' :
          'NO_REPRODUCIBLE_BOUNDARY_IMPROVEMENT',
      fullDemo: fixed.passedSamples === 2 ?
        'PASSED' :
        'NOT_YET_PASSED',
      next:
        'Require independent A/B review. Proceed to the ordered unchanged ' +
        '5-probe gate only if the matched-window and rate evidence rejects ' +
        'amplification; do not run demos unless all probes pass.',
    },
  };
  const output = resolve(EVIDENCE_ROOT, 'live-ab-analysis.json');
  await writeFile(output, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({
    output,
    aggregate: summary.aggregate,
    ratios: summary.ratios,
    decision: summary.decision,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
