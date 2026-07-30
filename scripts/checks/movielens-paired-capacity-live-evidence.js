import {execFile} from 'node:child_process';
import {
  mkdir,
  writeFile,
} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {promisify} from 'node:util';

import {
  inspectBenchmarkCapacityProtocolReport,
  inspectBenchmarkCapacityTerminalMeasurement,
} from
  '../../test/distributed/harness/benchmark-capacity-protocol.js';
import {
  BENCHMARK_RESOURCE_LIMIT,
} from
  '../../test/distributed/harness/benchmark-resource-contract-constants.js';
import {
  benchmarkComparatorHostHeadroom as headroom,
  observeBenchmarkComparatorHost as hostObservation,
  parseProcNetworkBytes,
} from './benchmark-comparator-host-observation.js';

const execFileAsync = promisify(execFile);
const arrayMap = Function.call.bind(Array.prototype.map);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const mathMax = Math.max;
const stringReplace = Function.call.bind(String.prototype.replace);
const REPORT_DIRECTORY = 'test-output/reports';
const EVIDENCE_TEXT = Object.freeze({
  ARTIFACT_SCALING_HEADROOM_INSUFFICIENT:
    'live artifact scaling headroom is below the sealed minimum',
  CAPACITY_FAILURE_PREFIX: 'paired MovieLens live proof failed: ',
  FRESH_EVAL: '--eval',
  FRESH_INPUT_TYPE: '--input-type=module',
  LAGRANGE_NETWORK_OBSERVATION_MISSING:
    'quantitative Lagrange public HTTP payload observation missing',
  PASS: 'PASS',
  REPORT_FIDELITY:
    'live-public-wasm-and-postgresql-with-cgroup-container-metering',
  REPORT_PRODUCER:
    'comparative-efficiency-movielens-paired-runtime-live',
  UTF8: 'utf8',
  WRITE_EXCLUSIVE: 'wx',
});

function fail(reason) {
  throw new Error(EVIDENCE_TEXT.CAPACITY_FAILURE_PREFIX + reason);
}

function parsePairedRuntimeReplayOutput(value) {
  return jsonParse(value);
}

function serializePairedRuntimeReport(value, replacer, space) {
  return jsonStringify(value, replacer, space);
}

function assertCapacityBracketing(
  report,
  preregistration,
  offeredLoads,
  sideIds,
) {
  const reportInspection =
    inspectBenchmarkCapacityProtocolReport(report, preregistration);
  const terminalInspection =
    inspectBenchmarkCapacityTerminalMeasurement(report, preregistration);
  if (!reportInspection.valid || !terminalInspection.valid) {
    fail(
      `C3 terminal report invalid: ${reportInspection.reason}; ` +
      `${terminalInspection.reason}; executionFailure=` +
      serializePairedRuntimeReport(report.executionFailure),
    );
  }
  const topLoad = offeredLoads[offeredLoads.length - 1];
  for (let sideIndex = 0; sideIndex < sideIds.length; sideIndex += 1) {
    const sideId = sideIds[sideIndex];
    const capacity = report.summary.capacityBySide[sideId];
    if (
      capacity.maxSloOfferedLoadPerSecond === null ||
      capacity.maxSloOfferedLoadPerSecond >= topLoad
    ) {
      fail(`top load did not bracket ${sideId} capacity`);
    }
  }
}

function assertLagrangeNetworkObservation(
  windowEvidence,
  lagrangeSideId,
  lagrangeComponentId,
) {
  let eligibleWindows = 0;
  for (let index = 0; index < windowEvidence.length; index += 1) {
    const evidence = windowEvidence[index];
    if (
      evidence.c3.sample.sideId !== lagrangeSideId ||
      evidence.c3.sample.counts.correct === 0
    ) continue;
    const components = evidence.calibration.artifact.payload.components;
    let observed = false;
    for (let componentIndex = 0;
      componentIndex < components.length;
      componentIndex += 1) {
      const component = components[componentIndex];
      if (
        component.sideId === lagrangeSideId &&
        component.componentId === lagrangeComponentId &&
        component.delta.networkBytes > 0
      ) {
        observed = true;
        break;
      }
    }
    if (!observed) {
      fail(EVIDENCE_TEXT.LAGRANGE_NETWORK_OBSERVATION_MISSING);
    }
    eligibleWindows += 1;
  }
  if (eligibleWindows === 0) {
    fail(EVIDENCE_TEXT.LAGRANGE_NETWORK_OBSERVATION_MISSING);
  }
}

function assertArtifactScalingHeadroom(
  artifacts,
  maximumArtifactUsageRatio,
) {
  let maximumBytes = 0;
  for (let index = 0; index < artifacts.length; index += 1) {
    maximumBytes = mathMax(maximumBytes, artifacts[index].byteLength);
  }
  if (
    maximumBytes >=
      BENCHMARK_RESOURCE_LIMIT.ARTIFACT_BYTES *
        maximumArtifactUsageRatio
  ) {
    fail(EVIDENCE_TEXT.ARTIFACT_SCALING_HEADROOM_INSUFFICIENT);
  }
  return maximumBytes;
}

async function replayInFreshProcess(rootDigest, artifactDirectory) {
  const validatorUrl = pathToFileURL(resolve(
    'test/distributed/harness/benchmark-resource-evidence-root.js',
  )).href;
  const resolverUrl = pathToFileURL(resolve(
    'test/distributed/harness/benchmark-resource-durable-resolver.js',
  )).href;
  const source =
    `import {validateBenchmarkResourceEvidenceRoot as validate} from ${
      jsonStringify(validatorUrl)
    };` +
    `import {createBenchmarkResourceDurableResolver as resolver} from ${
      jsonStringify(resolverUrl)
    };` +
    'process.stdout.write(JSON.stringify(validate({' +
    `rootDigest:${jsonStringify(rootDigest)},` +
    `resolver:resolver(${jsonStringify(artifactDirectory)})` +
    '})));';
  const {stdout} = await execFileAsync(
    process.execPath,
    [
      EVIDENCE_TEXT.FRESH_INPUT_TYPE,
      EVIDENCE_TEXT.FRESH_EVAL,
      source,
    ],
    {encoding: EVIDENCE_TEXT.UTF8},
  );
  return parsePairedRuntimeReplayOutput(stdout);
}

async function writeScenarioReport(detail, scenarios) {
  const timestamp = new Date().toISOString();
  const scenarioResults = arrayMap(scenarios, (scenario) => ({
    scenario,
    passed: true,
    current: {passed: true, verdict: EVIDENCE_TEXT.PASS},
    detail,
  }));
  const report = {
    timestamp,
    scenario: scenarios[2],
    producer: EVIDENCE_TEXT.REPORT_PRODUCER,
    fidelity: EVIDENCE_TEXT.REPORT_FIDELITY,
    summary: {
      total: scenarioResults.length,
      passed: scenarioResults.length,
      failed: 0,
    },
    optimizationSummary: {totalPriorityItems: 0},
    standardSummary: {scenarios: scenarioResults},
  };
  await mkdir(REPORT_DIRECTORY, {recursive: true});
  const stamp = stringReplace(timestamp, /[:.]/gu, '-');
  const reportPath = resolve(
    REPORT_DIRECTORY,
    `${scenarios[2]}-${stamp}.report.json`,
  );
  await writeFile(
    reportPath,
    serializePairedRuntimeReport(report, null, 2),
    {flag: EVIDENCE_TEXT.WRITE_EXCLUSIVE},
  );
  return reportPath;
}

export {
  assertArtifactScalingHeadroom,
  assertCapacityBracketing,
  assertLagrangeNetworkObservation,
  headroom,
  hostObservation,
  parsePairedRuntimeReplayOutput,
  parseProcNetworkBytes,
  replayInFreshProcess,
  serializePairedRuntimeReport,
  writeScenarioReport,
};
