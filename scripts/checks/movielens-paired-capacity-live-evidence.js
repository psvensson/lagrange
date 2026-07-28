import {execFile} from 'node:child_process';
import {
  mkdir,
  readFile,
  statfs,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
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

const execFileAsync = promisify(execFile);
const DECIMAL_COUNTER = /^(?:0|[1-9][0-9]*)$/u;
const arrayMap = Function.call.bind(Array.prototype.map);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const mathMax = Math.max;
const mathMin = Math.min;
const numberConstructor = Number;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const regExpTest = Function.call.bind(RegExp.prototype.test);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);
const MILLISECONDS_PER_SECOND = 1_000;
const MINIMUM_HEADROOM_RATIO = 0.02;
const NETWORK_TRANSMIT_FIELD_INDEX = 8;
const SHARED_NETWORK_BYTES_PER_SECOND = 125_000_000;
const REPORT_DIRECTORY = 'test-output/reports';
const EVIDENCE_TEXT = Object.freeze({
  ARTIFACT_SCALING_HEADROOM_INSUFFICIENT:
    'live artifact scaling headroom is below the sealed minimum',
  CAPACITY_FAILURE_PREFIX: 'paired MovieLens live proof failed: ',
  FRESH_EVAL: '--eval',
  FRESH_INPUT_TYPE: '--input-type=module',
  HEADROOM_HOST_CPU: 'host CPU',
  HEADROOM_HOST_MEMORY: 'host memory',
  HEADROOM_OBSERVER_CPU: 'observer CPU',
  HEADROOM_SHARED_NETWORK: 'shared network',
  HEADROOM_SHARED_STORAGE: 'shared storage',
  LAGRANGE_NETWORK_OBSERVATION_MISSING:
    'quantitative Lagrange public HTTP payload observation missing',
  NETWORK_COUNTER_INCOMPLETE: 'incomplete /proc/net/dev counters',
  NETWORK_COUNTER_MALFORMED: 'malformed /proc/net/dev counter',
  NETWORK_COUNTER_RANGE: 'out-of-range /proc/net/dev counter',
  NETWORK_COUNTER_TOTAL_RANGE:
    'out-of-range aggregate /proc/net/dev counter',
  NETWORK_DEVICE_FILE: '/proc/net/dev',
  NEWLINE: '\n',
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

function networkCounter(value) {
  if (
    typeof value !== 'string' ||
    !regExpTest(DECIMAL_COUNTER, value)
  ) {
    fail(EVIDENCE_TEXT.NETWORK_COUNTER_MALFORMED);
  }
  const counter = numberConstructor(value);
  if (!numberIsSafeInteger(counter)) {
    fail(EVIDENCE_TEXT.NETWORK_COUNTER_RANGE);
  }
  return counter;
}

function parseProcNetworkBytes(text) {
  let total = 0;
  const lines = stringSplit(text, EVIDENCE_TEXT.NEWLINE);
  for (let lineIndex = 2; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const separator = stringIndexOf(line, ':');
    if (separator < 0) continue;
    const fields = stringSplit(
      stringTrim(stringSlice(line, separator + 1)),
      /\s+/u,
    );
    if (fields.length <= NETWORK_TRANSMIT_FIELD_INDEX) {
      fail(EVIDENCE_TEXT.NETWORK_COUNTER_INCOMPLETE);
    }
    total +=
      networkCounter(fields[0]) +
      networkCounter(fields[NETWORK_TRANSMIT_FIELD_INDEX]);
    if (!numberIsSafeInteger(total)) {
      fail(EVIDENCE_TEXT.NETWORK_COUNTER_TOTAL_RANGE);
    }
  }
  return total;
}

async function networkBytes() {
  return parseProcNetworkBytes(
    await readFile(
      EVIDENCE_TEXT.NETWORK_DEVICE_FILE,
      EVIDENCE_TEXT.UTF8,
    ),
  );
}

async function hostObservation(directory) {
  const filesystem = await statfs(directory);
  return {
    cpu: process.cpuUsage(),
    load: os.loadavg()[0],
    freeMemory: os.freemem(),
    networkBytes: await networkBytes(),
    storageCapacity: filesystem.blocks * filesystem.bsize,
    storageAvailable: filesystem.bavail * filesystem.bsize,
  };
}

function boundedMeasurement(capacity, observedPeak, name) {
  if (
    !numberIsFinite(capacity) ||
    capacity <= 0 ||
    !numberIsFinite(observedPeak) ||
    observedPeak < 0 ||
    observedPeak > capacity
  ) {
    fail(`${name} capacity exceeded`);
  }
  return {capacity, observedPeak};
}

function headroom(start, end, durationMs) {
  const cpuCount = os.cpus().length;
  const totalMemory = os.totalmem();
  const observerCpu =
    end.cpu.user + end.cpu.system - start.cpu.user - start.cpu.system;
  const networkDelta = end.networkBytes - start.networkBytes;
  return {
    minimumRequiredRatio: MINIMUM_HEADROOM_RATIO,
    observerCpu: boundedMeasurement(
      durationMs * MILLISECONDS_PER_SECOND * cpuCount,
      observerCpu,
      EVIDENCE_TEXT.HEADROOM_OBSERVER_CPU,
    ),
    hostCpu: boundedMeasurement(
      cpuCount,
      mathMax(start.load, end.load),
      EVIDENCE_TEXT.HEADROOM_HOST_CPU,
    ),
    hostMemory: boundedMeasurement(
      totalMemory,
      mathMax(
        totalMemory - start.freeMemory,
        totalMemory - end.freeMemory,
      ),
      EVIDENCE_TEXT.HEADROOM_HOST_MEMORY,
    ),
    sharedNetwork: boundedMeasurement(
      SHARED_NETWORK_BYTES_PER_SECOND *
        durationMs / MILLISECONDS_PER_SECOND,
      networkDelta,
      EVIDENCE_TEXT.HEADROOM_SHARED_NETWORK,
    ),
    sharedStorage: boundedMeasurement(
      mathMin(start.storageCapacity, end.storageCapacity),
      mathMax(
        start.storageCapacity - start.storageAvailable,
        end.storageCapacity - end.storageAvailable,
      ),
      EVIDENCE_TEXT.HEADROOM_SHARED_STORAGE,
    ),
  };
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
