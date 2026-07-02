#!/usr/bin/env node

// Cross-gate failure-signature trend query.
//
// Every stat-gate run already persists a small aggregate summary
// (test-output/reports/stat-gate-<TS>.json) carrying srcFingerprint,
// classTally, dominantReasonTally, and per-run detail — but nothing joined
// them, so "did the dominant failure signature change across gates/commits?"
// was manual archaeology over 150MB per-run reports. This script is that
// join: a chronological signature table over the existing summaries.
//
//   node scripts/query-gate-trends.js               # table, newest last
//   node scripts/query-gate-trends.js --json        # NDJSON, one gate/line
//   node scripts/query-gate-trends.js --scenario rolling-restart
//   node scripts/query-gate-trends.js --report-dir <dir>
//
// Reads ONLY the per-gate aggregates (a few KB each), never the per-run
// reports, so it is safe to run over the whole corpus.

import process from 'node:process';
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const DEFAULT_REPORT_DIR = 'test-output/reports';
const GATE_SUMMARY_PATTERN = /^stat-gate-\d{8}T\d{6}Z\.json$/;
const FINGERPRINT_DISPLAY_LENGTH = 12;
const TOP_REASON_LIMIT = 2;

// Pure: reduce one gate summary JSON to its trend signature row.
function buildTrendRow(summary, file) {
  const tally = summary.dominantReasonTally || {};
  const topReasons = Object.entries(tally)
    .filter(([reason]) => reason !== 'none' && reason !== 'null')
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_REASON_LIMIT)
    .map(([reason, count]) => `${reason}(${count})`);
  const passes = Array.isArray(summary.runsDetail) ?
    summary.runsDetail.filter((run) => run?.passed === true).length :
    null;
  const witnessTally = {};
  for (const run of summary.runsDetail || []) {
    if (run?.closureWitnessClass) {
      witnessTally[run.closureWitnessClass] =
        (witnessTally[run.closureWitnessClass] || 0) + 1;
    }
  }
  return {
    file,
    timestamp: summary.timestamp || null,
    scenario: summary.scenario || null,
    srcFingerprint: summary.srcFingerprint || null,
    runs: summary.runs ?? null,
    passes,
    verdict: summary.gateVerdict?.verdict || null,
    wilsonLowerBound: summary.gateVerdict?.wilson?.lowerBound ?? null,
    safety: {
      corrupt: summary.corruptCount ?? null,
      nodeExit: summary.nodeExitCount ?? null,
      oracleBlind: summary.oracleBlindCount ?? null,
      staleSource: summary.staleSourceRuns ?? null,
    },
    classTally: summary.classTally || {},
    topReasons,
    closureWitnessTally: witnessTally,
  };
}

function loadTrendRows(reportDir) {
  const rows = [];
  for (const file of readdirSync(reportDir)) {
    if (!GATE_SUMMARY_PATTERN.test(file)) {
      continue;
    }
    try {
      const summary = JSON.parse(readFileSync(join(reportDir, file), 'utf8'));
      rows.push(buildTrendRow(summary, file));
    } catch {
      // An unreadable gate summary must not hide the rest of the trend.
      rows.push({file, timestamp: null, unreadable: true});
    }
  }
  rows.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  return rows;
}

function shortFingerprint(fingerprint) {
  return fingerprint ?
    String(fingerprint).slice(0, FINGERPRINT_DISPLAY_LENGTH) :
    '-';
}

function formatRow(row) {
  if (row.unreadable) {
    return `${row.file}  !! unreadable`;
  }
  const classes = Object.entries(row.classTally)
    .map(([cls, count]) => `${cls}:${count}`)
    .join(' ');
  const safetyDirty = Object.values(row.safety).some((count) => count > 0);
  const parts = [
    row.timestamp || row.file,
    row.scenario || '-',
    `src=${shortFingerprint(row.srcFingerprint)}`,
    `runs=${row.runs}`,
    `pass=${row.passes ?? '-'}${row.verdict ? ` ${row.verdict}` : ''}`,
    safetyDirty ? `SAFETY!${JSON.stringify(row.safety)}` : 'safety-clean',
    classes,
  ];
  const line = parts.join('  ');
  const reasons = row.topReasons.length > 0 ?
    `\n    reasons: ${row.topReasons.join(', ')}` :
    '';
  const witnesses = Object.keys(row.closureWitnessTally).length > 0 ?
    `\n    closureWitness: ${JSON.stringify(row.closureWitnessTally)}` :
    '';
  return line + reasons + witnesses;
}

function main() {
  const args = process.argv.slice(2);
  let reportDir = DEFAULT_REPORT_DIR;
  let scenarioFilter = null;
  let asJson = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--report-dir' && args[i + 1]) {
      reportDir = args[++i];
    } else if (args[i] === '--scenario' && args[i + 1]) {
      scenarioFilter = args[++i];
    } else if (args[i] === '--json') {
      asJson = true;
    }
  }

  const rows = loadTrendRows(reportDir).filter(
    (row) => !scenarioFilter || row.scenario === scenarioFilter,
  );
  if (rows.length === 0) {
    console.error(`No stat-gate summaries found in ${reportDir}`);
    process.exitCode = 1;
    return;
  }
  if (asJson) {
    for (const row of rows) {
      console.log(JSON.stringify(row));
    }
    return;
  }
  console.log(
    `Gate trend (${rows.length} gates, oldest first) — ${reportDir}`,
  );
  for (const row of rows) {
    console.log(formatRow(row));
  }
}

function isDirectRun() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  main();
}

export {buildTrendRow, loadTrendRows};
