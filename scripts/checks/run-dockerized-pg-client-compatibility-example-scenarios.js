#!/usr/bin/env node

import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';

import {runDatabasePortabilityExample} from
  '../../examples/service-portability/run-database-portability.js';
import {runTestFileSync} from '../run-test-files.js';

const SCENARIO = 'dockerized-pg-client-compatibility-example';
const REPORT_DIR =
  'test-output/reports/dockerized-pg-client-compatibility-example';
const CONTRACT_TEST =
  'test/examples/dockerized-pg-client-compatibility-example.test.js';
const LIVE_REPORT_SEGMENT = 'live';
const TEXT_ENCODING = 'utf8';
const VERDICT = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
});
const LIVE_STATUS = Object.freeze({
  NOT_RUN: 'not_run',
  PASSED: 'passed',
  FAILED: 'failed',
});
const FAILURE_STAGE = Object.freeze({
  CONTRACT: 'contract test failed',
  TEARDOWN: 'failure-safe teardown probe failed',
});
const TEARDOWN_EXPECTED_ERROR =
  'database portability example failed during failure-safe-teardown-probe';

async function runTeardownProbe() {
  try {
    await runDatabasePortabilityExample({
      reportDirectory: path.join(REPORT_DIR, LIVE_REPORT_SEGMENT),
      failAfterFirstApplicationCreate: true,
      failOnCleanupError: true,
    });
    return false;
  } catch (error) {
    return error.message === TEARDOWN_EXPECTED_ERROR;
  }
}

async function runLiveMeasurement() {
  try {
    return {
      status: LIVE_STATUS.PASSED,
      value: await runDatabasePortabilityExample({
        reportDirectory: path.join(REPORT_DIR, LIVE_REPORT_SEGMENT),
        failOnCleanupError: true,
      }),
    };
  } catch (error) {
    return {
      status: LIVE_STATUS.FAILED,
      failureStage: error.message,
    };
  }
}

async function runScenario() {
  const contract = runTestFileSync(CONTRACT_TEST, {
    print: false,
    timeoutMs: 300000,
  });
  const teardownPassed = contract.ok ? await runTeardownProbe() : false;
  const liveOutcome = contract.ok && teardownPassed ?
    await runLiveMeasurement() : {
      status: LIVE_STATUS.NOT_RUN,
      failureStage: FAILURE_STAGE.CONTRACT,
    };
  const livePassed = liveOutcome.status === LIVE_STATUS.PASSED;
  const passed = contract.ok && teardownPassed && livePassed;
  const timestamp = new Date().toISOString();
  const report = {
    timestamp,
    scenario: SCENARIO,
    producer: 'dockerized-pg-client-compatibility-example-runner',
    fidelity: 'live-integration',
    summary: {
      total: 3,
      passed: Number(contract.ok) + Number(teardownPassed) +
        Number(livePassed),
      failed: Number(!contract.ok) + Number(!teardownPassed) +
        Number(!livePassed),
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
          verdict: passed ? 'PASS' : 'FAIL',
        },
        detail: {
          contract: {
            passed: contract.ok,
            assertions: contract.assertions,
          },
          failureSafeTeardown: teardownPassed,
          liveReport: livePassed ? liveOutcome.value.reportPath : null,
          image: livePassed ? liveOutcome.value.report.image : null,
          stages: livePassed ? liveOutcome.value.report.stages : null,
          attacks: livePassed ? liveOutcome.value.report.attacks : null,
          failureStage: !teardownPassed ? FAILURE_STAGE.TEARDOWN :
            (livePassed ? null : liveOutcome.failureStage),
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
