#!/usr/bin/env node

import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {
  runTopologyFailureGateMatrix,
} from '../test/distributed/harness/topology-failure-gate-runner.js';

const TOPOLOGY_FAILURE_GATE_SCRIPT_ARG_CONFIG = '--config';
const TOPOLOGY_FAILURE_GATE_SCRIPT_ARG_OUTPUT = '--output';
const TOPOLOGY_FAILURE_GATE_SCRIPT_DEFAULT_OUTPUT =
  'test-output/reports/topology-failure-gates/latest/invariant-gate.report.json';
const TOPOLOGY_FAILURE_GATE_SCRIPT_JSON_SPACE = 2;
const TOPOLOGY_FAILURE_GATE_SCRIPT_ARG_MISSING_INDEX = 0;
const TOPOLOGY_FAILURE_GATE_SCRIPT_ARG_VALUE_OFFSET = 1;
const TOPOLOGY_FAILURE_GATE_SCRIPT_EMPTY_TEXT = '';
const TOPOLOGY_FAILURE_GATE_SCRIPT_NEWLINE = '\n';
const TOPOLOGY_FAILURE_GATE_SCRIPT_FAILURE_EXIT_CODE = 1;

function readArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index < TOPOLOGY_FAILURE_GATE_SCRIPT_ARG_MISSING_INDEX) {
    return TOPOLOGY_FAILURE_GATE_SCRIPT_EMPTY_TEXT;
  }
  return process.argv[index + TOPOLOGY_FAILURE_GATE_SCRIPT_ARG_VALUE_OFFSET] ||
    TOPOLOGY_FAILURE_GATE_SCRIPT_EMPTY_TEXT;
}

async function main() {
  const outputPath =
    readArgValue(TOPOLOGY_FAILURE_GATE_SCRIPT_ARG_OUTPUT) ||
    TOPOLOGY_FAILURE_GATE_SCRIPT_DEFAULT_OUTPUT;
  const configPathOrName = readArgValue(TOPOLOGY_FAILURE_GATE_SCRIPT_ARG_CONFIG);
  const report = await runTopologyFailureGateMatrix({
    configPathOrName,
  });
  await mkdir(dirname(outputPath), {recursive: true});
  await writeFile(
    outputPath,
    JSON.stringify(report, null, TOPOLOGY_FAILURE_GATE_SCRIPT_JSON_SPACE),
  );
  process.stdout.write([
    `topology failure gates passed ${report.passedCount}/${report.gateCount}`,
    `report ${join(process.cwd(), outputPath)}`,
  ].join(TOPOLOGY_FAILURE_GATE_SCRIPT_NEWLINE));
}

main().catch((error) => {
  process.stderr.write(
    `${error.stack || error.message}${TOPOLOGY_FAILURE_GATE_SCRIPT_NEWLINE}`,
  );
  process.exitCode = TOPOLOGY_FAILURE_GATE_SCRIPT_FAILURE_EXIT_CODE;
});
