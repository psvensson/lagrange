#!/usr/bin/env node

import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';

const REPORT_MODE_ENABLED = '1';
const DIRECTED_SCENARIO_MODULE =
  '../test/query/durable-provisioning-job-owner-directed.test.js';

process.env.W9_DIRECTED_REPORT_MODE = REPORT_MODE_ENABLED;

const outputFlagIndex = process.argv.indexOf('--output');
const outputPath = outputFlagIndex >= 0 && process.argv[outputFlagIndex + 1] ?
  process.argv[outputFlagIndex + 1] :
  `test-output/reports/durable-provisioning-job-owner-directed-${
    new Date().toISOString().replaceAll(':', '-')}.report.json`;
const checks = {
  equal: assert.equal,
  ok: assert.ok,
};

const {runDurableProvisioningDirectedScenario} = await import(
  DIRECTED_SCENARIO_MODULE
);
const startedAt = new Date().toISOString();
const evidence = await runDurableProvisioningDirectedScenario(checks);
const report = {
  scenario: 'durable-provisioning-job-owner-directed',
  status: 'passed',
  startedAt,
  completedAt: new Date().toISOString(),
  ...evidence,
};
const absoluteOutputPath = resolve(outputPath);
await mkdir(dirname(absoluteOutputPath), {recursive: true});
await writeFile(absoluteOutputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
  `durable-provisioning-job-owner-directed: PASS — ${outputPath}\n`,
);
