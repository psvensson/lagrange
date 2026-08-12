#!/usr/bin/env node

// Scenario-harness runner for the golden-capability TLC model Quests. Unlike
// the guard-test runners, these scenarios are proven by executing the model
// configurations registered in scripts/model-tlc-configs.js through the
// canonical runner's exact --mode selector (scripts/model-tlc.js) with the
// real tla2tools.jar, then translating the runner's per-mode verdict into the
// scenario-harness report shape the Solver probe reads
// (scripts/solve/probes/scenario-harness.js): one passing "guard file" per
// registered mode whose expectation was met.
//
// A scenario goes green only when EVERY registered mode — the converging
// fixed configuration and each expected-failure mutant — meets its sealed
// expectation, so a mutant that silently stops reproducing flips the
// scenario red exactly like a regressed fix.

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {CONFIGS} from '../model-tlc-configs.js';

const REPORT_DIR = 'test-output/reports';
const MODEL_REPORTS_DIR = 'test-output/reports';
const RUNNER_SCRIPT = 'scripts/model-tlc.js';
const MODE_ARGUMENT = '--mode';
const SCENARIOS = Object.freeze([
  'planner-retention-admission-hold-model',
  'priority-service-publication-census-model',
]);
const UTF8_ENCODING = 'utf8';
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringReplace = Function.call.bind(String.prototype.replace);
const REPORT_TIMESTAMP_PATTERN = /[:.]/g;
const REPORT_TIMESTAMP_REPLACEMENT = '-';
const PRODUCER_NAME = 'golden-capability-model-scenarios';
// Model-check evidence: each sample re-executes TLC over the registered
// configurations, so the report certifies live model-binding, not merely a
// green deterministic guard (the deterministic-guard stamp would trigger the
// Solver audit's closure-fidelity warning for a product-class quest).
const FIDELITY_STAMP = 'live-model-check';
const VERDICT_PASS = 'PASS';
const VERDICT_FAIL = 'FAIL';
const EXPECTATION_MET_LABEL = 'met';
const EXPECTATION_UNMET_LABEL = 'UNMET';
const DETAIL_SEPARATOR = ' ';

function configsForScenario(scenario) {
  return arrayFilter(CONFIGS, (config) => config.scenario === scenario);
}

function runMode(config) {
  const result = spawnSync(
    process.execPath,
    [RUNNER_SCRIPT, MODE_ARGUMENT, config.mode],
    {encoding: UTF8_ENCODING},
  );
  const modelReportPath = path.join(MODEL_REPORTS_DIR, config.report);
  let modelReport = null;
  try {
    modelReport = JSON.parse(fs.readFileSync(modelReportPath, UTF8_ENCODING));
  } catch (_error) {
    modelReport = null;
  }
  const expectationMet =
    result.status === 0 && modelReport?.expectationMet === true;
  return {
    file: `${config.mode} (${path.basename(config.cfg)})`,
    passed: expectationMet,
    assertions: 1,
    assertionsPassed: expectationMet ? 1 : 0,
  };
}

function buildReport(scenario, results, timestamp) {
  const failing = arrayFilter(results, (result) => !result.passed);
  const passed = failing.length === 0;
  return {
    timestamp,
    scenario,
    producer: PRODUCER_NAME,
    fidelity: FIDELITY_STAMP,
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
          scenario,
          passed,
          current: {
            passed,
            verdict: passed ? VERDICT_PASS : VERDICT_FAIL,
          },
          detail: {
            guardTests: results,
          },
        },
      ],
    },
  };
}

function runScenario(scenario) {
  const configs = configsForScenario(scenario);
  if (configs.length === 0) {
    process.stderr.write(`unknown scenario: ${scenario}\n`);
    process.exitCode = 2;
    return false;
  }
  const results = arrayMap(configs, runMode);
  const timestamp = new Date().toISOString();
  const report = buildReport(scenario, results, timestamp);
  fs.mkdirSync(REPORT_DIR, {recursive: true});
  const reportPath = path.join(
    REPORT_DIR,
    `${scenario}-${stringReplace(timestamp, REPORT_TIMESTAMP_PATTERN, REPORT_TIMESTAMP_REPLACEMENT)}.report.json`,
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const passed = report.summary.failed === 0;
  process.stdout.write(
    `${scenario}: ${passed ? VERDICT_PASS : VERDICT_FAIL} — ` +
    `${report.summary.passed}/${report.summary.total} modes met ` +
    `(${arrayMap(results, (r) => `${r.file}=${r.passed ? EXPECTATION_MET_LABEL : EXPECTATION_UNMET_LABEL}`).join(DETAIL_SEPARATOR)})\n` +
    `report: ${reportPath}\n`,
  );
  return passed;
}

const only = process.argv[2];
const names = only ? [only] : SCENARIOS;
let allPassed = true;
for (const name of names) {
  if (!arrayIncludes(SCENARIOS, name)) {
    process.stderr.write(`unknown scenario: ${name}\n`);
    process.exitCode = 2;
    process.exit();
  }
  if (!runScenario(name)) allPassed = false;
}
if (!allPassed) process.exitCode = 1;
