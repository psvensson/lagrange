#!/usr/bin/env node

// Triage dispatcher for distributed-harness failures.
//
// There are ~14 analyze-* scripts with overlapping scope; which one applies
// to a given failure was tribal knowledge in test/distributed/README.local.md
// prose. This dispatcher reads a run report, classifies it (same
// correctness-first classifier the stat-gate uses), and prints the triage
// path: artifacts to read first, then the analyzers that answer THIS
// failure's dominant signature, with real paths substituted.
//
//   node scripts/triage-distributed-failure.js              # newest report
//   node scripts/triage-distributed-failure.js <report.json>
//   npm run triage                                          # alias
//
// It prints commands rather than executing them: triage starts by READING
// the triage summary (mandated order, README.local.md "Failure triage"),
// and most analyzers are cheap enough that running the right one is not the
// bottleneck — picking it is.

import process from 'node:process';
import {readdirSync, readFileSync, statSync, existsSync} from 'node:fs';
import {join, basename, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {classifyRunReport} from './rolling-restart-stat-gate-summary.js';

const DEFAULT_REPORT_DIR = 'test-output/reports';
const REPORT_SUFFIX = '.report.json';
const MODEL_REPORT_SUFFIX = '.model.report.json';

// Signature routes, first match wins; each command is a verified template
// (analyzer usage checked at authoring time — artifact path = the report).
const SIGNATURE_ROUTES = [
  {
    match: /priority_recovery|workflow_progress|handoff_retry|dispatched_waiting/,
    why: 'priority-recovery / workflow-progress head',
    analyzers: [
      'node scripts/analyze-priority-recovery-residuals.js <report>',
      'node scripts/analyze-rolling-restart-liveness.js <report>',
      'node scripts/analyze-redecision-storm.js <report>',
    ],
  },
  {
    match: /spread|topology/,
    why: 'topology/spread convergence head',
    analyzers: [
      'npm run analyze:topology-convergence -- <report>',
      'node scripts/analyze-latent-blockers.js <report>',
    ],
  },
  {
    match: /drain|replica_operations_in_flight|operation_drain|ghost/,
    why: 'operation-drain / REPLACE head',
    analyzers: [
      'node scripts/analyze-monotone-drain.js <playback>',
      'node scripts/analyze-replace-safety-blocks.js <playback>',
      'node scripts/analyze-replace-ghost-retirements.js <playback>',
    ],
  },
  {
    match: /publication|epoch/,
    why: 'publication-visibility head',
    analyzers: [
      'node scripts/analyze-rolling-restart-liveness.js <report>',
      'npm run analyze:topology-convergence -- <report>',
    ],
  },
  {
    match: /convergence_timeout|restart_recovery|quiescence|admission/,
    why: 'general convergence-latency head',
    analyzers: [
      'node scripts/analyze-rolling-restart-liveness.js <report>',
      'node scripts/analyze-latent-blockers.js <report>',
      'node scripts/analyze-precondition-recurrence.js <report>',
    ],
  },
];

const CLASS_GUIDANCE = {
  CORRUPT: [
    'HARD INVARIANT BREACH — correctness first, do not triage as latency.',
    'Read the breach evidence, then reproduce deterministically:',
    '  npm run analyze:distributed-failure -- --report <report>',
    '  npm run repro -- <CL-id>   (if the breach matches a ledger class)',
  ],
  NODE_EXIT: [
    'Unexpected node death (CL-030) — read that node\'s exit evidence first:',
    '  zgrep -h exit <playback>/.full-logs/*/<nodeId>.log.gz | tail -50',
  ],
  ORACLE_BLIND: [
    'UNJUDGEABLE (CL-031): the harness could not read snapshot evidence —',
    'a harness/transport defect, NOT a cluster verdict. Fix observability',
    'before believing anything else in this report.',
  ],
};

function newestReport(reportDir) {
  const candidates = readdirSync(reportDir)
    .filter((file) =>
      file.endsWith(REPORT_SUFFIX) && !file.endsWith(MODEL_REPORT_SUFFIX))
    .map((file) => {
      const path = join(reportDir, file);
      return {path, mtimeMs: statSync(path).mtimeMs};
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0]?.path || null;
}

function playbackDirFor(reportPath) {
  const name = basename(reportPath).replace(REPORT_SUFFIX, '');
  return join(dirname(reportPath), '.playback', name);
}

// The triage summary is written per scenario: <playback>/<scenario>/
// triage-summary.md. The scenario dir name comes from the report itself.
function findTriageSummary(playback, report) {
  const scenarioName = report?.scenarios?.[0]?.scenario;
  const candidate = scenarioName ?
    join(playback, scenarioName, 'triage-summary.md') :
    null;
  return candidate && existsSync(candidate) ? candidate : null;
}

function main() {
  const reportPath = process.argv[2] || newestReport(DEFAULT_REPORT_DIR);
  if (!reportPath || !existsSync(reportPath)) {
    console.error(
      'usage: triage-distributed-failure.js [<run.report.json>] — no report found',
    );
    process.exitCode = 1;
    return;
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const rec = classifyRunReport(report);
  const playback = playbackDirFor(reportPath);
  const substitute = (template) =>
    template.replace('<report>', reportPath).replace('<playback>', playback);

  console.log(`report:   ${reportPath}`);
  console.log(
    `class:    ${rec.class}  (passed=${rec.passed} missing=${rec.missing} ` +
    `hardBreaches=${rec.hardBreaches})`,
  );
  console.log(`reason:   ${rec.reason}`);
  if (rec.closureWitnessClass) {
    console.log(`witness:  ${rec.closureWitnessClass}`);
  }
  console.log('');

  const triageSummary = findTriageSummary(playback, report);
  console.log('read first (mandated order):');
  if (triageSummary) {
    console.log(`  1. ${triageSummary}`);
    console.log(`  2. ${triageSummary.replace(/\.md$/, '.json')}`);
  } else {
    console.log(
      `  1. bash scripts/summarize-distributed-failure-report.sh --report ${reportPath}`,
    );
  }
  console.log('');

  const guidance = CLASS_GUIDANCE[rec.class];
  if (guidance) {
    for (const line of guidance) {
      console.log(substitute(line));
    }
    return;
  }
  if (rec.class === 'CONVERGED' || rec.class === 'SLOW') {
    console.log('run classified healthy — nothing to triage.');
    return;
  }

  const route = SIGNATURE_ROUTES.find((candidate) =>
    candidate.match.test(String(rec.reason)),
  );
  if (route) {
    console.log(`then, for this signature (${route.why}):`);
    route.analyzers.forEach((analyzer, index) => {
      console.log(`  ${index + 1}. ${substitute(analyzer)}`);
    });
  } else {
    console.log('no signature route matched — general failure sweep:');
    console.log(`  1. node scripts/analyze-latent-blockers.js ${reportPath}`);
    console.log(
      `  2. node scripts/analyze-rolling-restart-liveness.js ${reportPath}`,
    );
  }
  console.log('');
  console.log(
    `full logs (gzipped): ls ${playback}/.full-logs/ && zcat <node>.log.gz`,
  );
}

function isDirectRun() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  main();
}

export {SIGNATURE_ROUTES};
