#!/usr/bin/env node
/**
 * Runner for the `test-harness-improvement-batch` quest scenario.
 *
 * The quest's sealed statement is a 15-item checklist (the adversarially-vetted
 * 2026-07-02 harness-audit recommendations, shipped in commits
 * 2882cae0..d9e5026c). Each item corresponds to a concrete mechanism that must
 * exist AND be wired at HEAD; this runner verifies every mechanism
 * deterministically (npm-script wiring, file presence, in-file markers) and
 * writes a scenario-harness report into `test-output/reports/` in the shape the
 * Solver's `scenario-harness` probe reads.
 *
 * A check failing means the mechanism regressed or was unwired — the report
 * then shows FAIL with totalPriorityItems = number of failing checklist items.
 *
 * Usage: node scripts/run-test-harness-improvement-batch-scenario.js
 */

import fs from 'node:fs';
import path from 'node:path';

const SCENARIO = 'test-harness-improvement-batch';
const REPORT_DIR = 'test-output/reports';

function readFileOrEmpty(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (_error) {
    return '';
  }
}

const pkg = JSON.parse(readFileOrEmpty('package.json') || '{}');
const scripts = pkg.scripts || {};

function hasScript(name) {
  return typeof scripts[name] === 'string' && scripts[name].length > 0;
}

function scriptIncludes(name, needle) {
  return hasScript(name) && scripts[name].includes(needle);
}

function fileContains(file, needle) {
  return readFileOrEmpty(file).includes(needle);
}

const CHECKS = [
  {
    id: 'shard-completeness-gate',
    ok: () => hasScript('audit:shards') && hasScript('shards:generate') &&
      scriptIncludes('test:static', 'audit:shards') &&
      fs.existsSync('scripts/generate-test-shards.js'),
  },
  {
    id: 'middle-tier-gate-and-runnable-test-ci',
    ok: () => hasScript('test:gate') && hasScript('test:ci') &&
      !scripts['test:ci'].includes('stryker'),
  },
  {
    id: 'gate-report-diagnostics-dedup',
    ok: () => fileContains(
      'test/distributed/harness/post-rebalance-closure-contract.js',
      'sharedEvidence'),
  },
  {
    id: 'wilson-interval-gate-verdict-with-safety-floor',
    ok: () => fs.existsSync('test/distributed/config/convergence-sealed-bars.json') &&
      fileContains('scripts/rolling-restart-stat-gate.sh', 'gateVerdict'),
  },
  {
    id: 'memory-leak-assertion-surfaced-in-summaries',
    ok: () => fileContains('scripts/summarize-harness-runs.js',
      'memoryLeakAssertion'),
  },
  {
    id: 'rerun-flake-marking',
    ok: () => fileContains('scripts/summarize-harness-runs.js', 'flake'),
  },
  {
    id: 'cross-gate-trend-query',
    ok: () => hasScript('trends:gates') &&
      fs.existsSync('scripts/query-gate-trends.js'),
  },
  {
    id: 'analyzer-triage-dispatcher',
    ok: () => hasScript('triage') &&
      fs.existsSync('scripts/triage-distributed-failure.js'),
  },
  {
    id: 'model-contracts-validators-in-a-gate',
    ok: () => hasScript('model:contracts') &&
      (scriptIncludes('test:gate', 'model:contracts') ||
       scriptIncludes('test:ci', 'model:contracts')),
  },
  {
    id: 'bounded-auto-retention-history-floor',
    ok: () => fileContains('scripts/rolling-restart-stat-gate.sh',
      '--keep-reports 24') &&
      fs.existsSync('scripts/prune-test-output.js'),
  },
  {
    id: 'managed-timers-teardown-helper',
    ok: () => fs.existsSync('src/test-helpers/managed-timers.js'),
  },
  {
    id: 'dt-determinism-runtime-tripwire-and-liferaft-seam',
    ok: () => fs.existsSync('test/distributed/harness/determinism-tripwire.js') &&
      fileContains('src/raft/liferaft.js', 'virtual clock'),
  },
  {
    id: 'repro-tier-routes-to-dt6',
    ok: () => fileContains('docs/deterministic-repro-tier.md', 'DT6') &&
      fileContains('docs/deterministic-repro-tier.md', 'virtual-network'),
  },
  {
    id: 'consolidated-dt-limits-section',
    ok: () => fileContains('docs/deterministic-directed-testing-plan.md',
      'limits table'),
  },
  {
    id: 'pct-headers-granularity-scoped',
    ok: () => fileContains('test/convergence/dt6-network-pct-search.test.js',
      'granularity') &&
      fileContains('test/convergence/dt6-publication-failback-pct-search.test.js',
        'granularity'),
  },
];

function main() {
  const results = CHECKS.map((check) => ({id: check.id, passed: check.ok()}));
  const failing = results.filter((r) => !r.passed);
  const passed = failing.length === 0;
  const timestamp = new Date().toISOString();

  const report = {
    timestamp,
    scenario: SCENARIO,
    summary: {
      total: results.length,
      passed: results.length - failing.length,
      failed: failing.length,
    },
    optimizationSummary: {
      totalPriorityItems: failing.length,
    },
    standardSummary: {
      scenarios: [
        {
          scenario: SCENARIO,
          passed,
          current: {
            passed,
            verdict: passed ? 'PASS' : 'FAIL',
          },
          detail: {checks: results},
        },
      ],
    },
  };

  fs.mkdirSync(REPORT_DIR, {recursive: true});
  const fileStamp = timestamp.replace(/[:.]/g, '-');
  const reportPath = path.join(REPORT_DIR, `${SCENARIO}-${fileStamp}.report.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  process.stdout.write(
    `${SCENARIO}: ${passed ? 'PASS' : 'FAIL'} — ` +
    `${report.summary.passed}/${report.summary.total} checklist items wired` +
    `${failing.length ? ` (failing: ${failing.map((f) => f.id).join(', ')})` : ''}\n` +
    `report: ${reportPath}\n`,
  );
  process.exitCode = passed ? 0 : 1;
}

main();
