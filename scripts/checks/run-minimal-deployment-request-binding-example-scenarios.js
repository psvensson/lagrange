#!/usr/bin/env node

import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';

import {runRequestBindingDeploymentExample} from
  '../../examples/request-binding-deployment/run-request-binding-deployment.js';
import {runTestFileSync} from '../run-test-files.js';

const SCENARIO = 'minimal-deployment-request-binding-example';
const REPORT_DIR = 'test-output/reports';
const CONTRACT_TEST =
  'test/examples/minimal-deployment-request-binding-example.test.js';
const TEST_TIMEOUT_MS = 300_000;
const TEXT_ENCODING = 'utf8';
const VERDICT = Object.freeze({
  FAIL: 'FAIL',
  PASS: 'PASS',
});

async function runLiveExample() {
  try {
    return {
      passed: true,
      report: await runRequestBindingDeploymentExample({print: false}),
    };
  } catch (error) {
    return {
      passed: false,
      error: error.stack || error.message,
      report: null,
    };
  }
}

async function runScenario() {
  const contract = runTestFileSync(CONTRACT_TEST, {
    print: false,
    timeoutMs: TEST_TIMEOUT_MS,
  });
  const live = contract.ok ?
    await runLiveExample() :
    {passed: false, error: 'contract test failed', report: null};
  const passed = contract.ok && live.passed;
  const timestamp = new Date().toISOString();
  const report = {
    timestamp,
    scenario: SCENARIO,
    producer: 'minimal-deployment-request-binding-example-runner',
    fidelity: 'live-integration',
    summary: {
      total: 2,
      passed: Number(contract.ok) + Number(live.passed),
      failed: Number(!contract.ok) + Number(!live.passed),
    },
    optimizationSummary: {
      totalPriorityItems: passed ? 0 : 1,
    },
    standardSummary: {
      scenarios: [{
        scenario: SCENARIO,
        passed,
        current: {
          passed,
          verdict: passed ? VERDICT.PASS : VERDICT.FAIL,
        },
        detail: {
          contract: {
            assertions: contract.assertions,
            passed: contract.ok,
          },
          live: live.report,
          failure: live.error || null,
        },
      }],
    },
  };

  mkdirSync(REPORT_DIR, {recursive: true});
  const fileStamp = timestamp.replace(/[:.]/gu, '-');
  const reportPath = path.join(
    REPORT_DIR,
    `${SCENARIO}-${fileStamp}.report.json`,
  );
  writeFileSync(
    reportPath,
    `${JSON.stringify(report, null, 2)}\n`,
    TEXT_ENCODING,
  );
  process.stdout.write(
    `${SCENARIO}: ${passed ? VERDICT.PASS : VERDICT.FAIL} — ` +
    `${report.summary.passed}/${report.summary.total} gates green\n` +
    `report: ${reportPath}\n`,
  );
  process.exitCode = passed ? 0 : 1;
}

await runScenario();
