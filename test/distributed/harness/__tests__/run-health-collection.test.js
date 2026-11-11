import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {gzipSync} from 'node:zlib';
import {parseContainerStats} from '../docker-provider.js';
import {writeFailureBundlesForReport} from '../failure-bundle.js';
import {
  CONTAINER_NETWORK_COUNTER_SCOPE,
  SAMPLE_UNAVAILABLE_REASON,
} from '../run-health/resource-sample-vocabulary.js';
import {
  DISK_FLUSH_LATENCY_UNAVAILABLE,
  ResourceRateTracker,
  containerSampleFields,
  decodeNodeHostFacts,
  processDiagnosticsUnavailableError,
  processSampleFields,
  processUnavailableFields,
} from '../run-health/resource-sample-contract.js';
import {
  INFRASTRUCTURE_SUSPECT,
  NODE_LOG_MESSAGE,
  RUN_HEALTH_ARTIFACT,
} from '../run-health/run-health-constants.js';
import {
  buildScenarioRunHealth,
  linkBaselineConsumers,
  writeScenarioRunHealth,
} from '../run-health/run-health-artifacts.js';
import {
  collectClusterNodeHealth,
  writeClusterNodeHealth,
} from '../run-health/node-health-harness-collection.js';
import {
  arrayFind,
  includesOf,
} from '../run-health/captured-intrinsics.js';

const MEASURED = 'measured';
const UNAVAILABLE = 'unavailable';
const NODE_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const PEER_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const START = Date.parse('2026-11-11T05:00:00.000Z');

function hostFacts(capturedAt, counters) {
  return {
    capturedAt,
    network: {state: MEASURED, rxBytes: counters.rx, txBytes: counters.tx,
      rxErrorsAndDrops: 0},
    tcp: {state: MEASURED, retransmittedSegments: counters.retransmitted,
      outSegments: counters.sent},
    cpu: {state: MEASURED, stealTicks: counters.steal, iowaitTicks: 0,
      totalTicks: counters.ticks},
    thermalThrottle: {state: UNAVAILABLE, reason: 'no_thermal_throttle_counter'},
  };
}

describe('resource sample contract', () => {
  it('a host-network container has no network counters, not zero counters', () => {
    // What Docker returns for a host-network container: no `networks` key.
    const hostNetworkStats = {
      ...parseContainerStats({cpu_stats: {}, precpu_stats: {}, memory_stats: {}}),
      networkCounterScope: CONTAINER_NETWORK_COUNTER_SCOPE.NOT_REPORTED,
    };
    assert.equal(hostNetworkStats.rxBytes, 0, 'the provider parser alone still yields zero');
    const fields = containerSampleFields(hostNetworkStats);
    assert.equal(Object.hasOwn(fields, 'rxBytes'), false);
    assert.equal(Object.hasOwn(fields, 'txBytes'), false);
    assert.deepEqual(fields.containerNetworkUnavailable, {state: UNAVAILABLE,
      reason: SAMPLE_UNAVAILABLE_REASON.CONTAINER_HAS_NO_NETWORK_NAMESPACE});
  });

  it('a bridged container keeps its measured counters, zero included', () => {
    const fields = containerSampleFields({cpuPercent: 1, memoryUsageBytes: 2,
      memoryLimitBytes: 3, rxBytes: 0, txBytes: 40,
      networkCounterScope: CONTAINER_NETWORK_COUNTER_SCOPE.CONTAINER_NAMESPACE});
    assert.equal(fields.rxBytes, 0);
    assert.equal(fields.txBytes, 40);
    assert.equal(Object.hasOwn(fields, 'containerNetworkUnavailable'), false);
  });

  it('a provider that states no scope is unavailable, never trusted as zero', () => {
    const fields = containerSampleFields({cpuPercent: 1, rxBytes: 0, txBytes: 0});
    assert.equal(fields.containerNetworkUnavailable.reason,
      SAMPLE_UNAVAILABLE_REASON.PROVIDER_STATED_NO_COUNTER_SCOPE);
  });

  it('types the diagnostics failure: no response versus a refused status', () => {
    const noResponse = processDiagnosticsUnavailableError('node-1', -1);
    assert.equal(noResponse.message,
      'Process resource diagnostics unavailable for node node-1 (status=-1)');
    assert.deepEqual(processUnavailableFields(noResponse, noResponse.message), {
      processDiagnosticsError: noResponse.message,
      processDiagnosticsUnavailable: {state: UNAVAILABLE,
        reason: SAMPLE_UNAVAILABLE_REASON.ADMIN_ENDPOINT_UNREACHABLE, httpStatus: -1},
      host: {state: UNAVAILABLE, reason: SAMPLE_UNAVAILABLE_REASON.ADMIN_ENDPOINT_UNREACHABLE},
    });
    assert.equal(processDiagnosticsUnavailableError('node-1', 503).unavailable.reason,
      SAMPLE_UNAVAILABLE_REASON.ADMIN_ENDPOINT_REFUSED_STATUS);
    assert.equal(processUnavailableFields(new Error('bad body'), 'bad body')
      .processDiagnosticsUnavailable.reason,
    SAMPLE_UNAVAILABLE_REASON.PROCESS_DIAGNOSTICS_INVALID);
  });

  it('a node image without host facts is a named absence', () => {
    assert.deepEqual(decodeNodeHostFacts({process: {}}), {state: UNAVAILABLE,
      reason: SAMPLE_UNAVAILABLE_REASON.NODE_REPORTS_NO_HOST_FACTS});
    const host = hostFacts(1, {rx: 1, tx: 1, retransmitted: 0, sent: 1, steal: 0, ticks: 1});
    assert.equal(decodeNodeHostFacts({host}), host);
    const fields = processSampleFields({capturedAt: 5, process: {rssBytes: 1},
      host, load: {cpuPercent: 12, eventLoopUtilizationPercent: 80}});
    assert.equal(fields.host, host);
    assert.equal(fields.processEventLoopUtilizationPercent, 80);
  });

  it('turns successive cumulative counters into rates with typed gaps', () => {
    const tracker = new ResourceRateTracker();
    const sample = (seconds, counters) => ({nodeId: NODE_ID, timestamp: START + seconds * 1000,
      containerNetworkUnavailable: {state: UNAVAILABLE, reason: 'host'},
      host: hostFacts(START + seconds * 1000, counters)});
    assert.deepEqual(tracker.ratesOf(sample(0,
      {rx: 1000, tx: 500, retransmitted: 10, sent: 100, steal: 5, ticks: 100})),
    {state: UNAVAILABLE, reason: SAMPLE_UNAVAILABLE_REASON.FIRST_READING});
    const rates = tracker.ratesOf(sample(2,
      {rx: 5000, tx: 500, retransmitted: 13, sent: 400, steal: 25, ticks: 300}));
    assert.equal(rates.state, MEASURED);
    assert.equal(rates.hostRxBytesPerSecond, 2000);
    assert.equal(rates.hostTxBytesPerSecond, 0, 'an idle interface is a measured zero');
    assert.equal(rates.tcpRetransmittedSegments, 3);
    assert.equal(rates.tcpOutSegments, 300);
    assert.equal(rates.hostCpuStealShare, 0.1);
    assert.deepEqual(rates.thermalCoreThrottleEvents,
      {state: UNAVAILABLE, reason: 'no_thermal_throttle_counter'});
    assert.deepEqual(rates.containerRxBytesPerSecond, {state: UNAVAILABLE, reason: 'host'});
    // A restarted host or node: the counter is lower than before.
    const restarted = tracker.ratesOf(sample(4,
      {rx: 10, tx: 600, retransmitted: 0, sent: 5, steal: 30, ticks: 500}));
    assert.deepEqual(restarted.hostRxBytesPerSecond,
      {state: UNAVAILABLE, reason: SAMPLE_UNAVAILABLE_REASON.COUNTER_WENT_BACKWARDS});
    assert.equal(restarted.hostTxBytesPerSecond, 50);
    assert.equal(DISK_FLUSH_LATENCY_UNAVAILABLE.reason,
      SAMPLE_UNAVAILABLE_REASON.NO_EXISTING_PROBE);
  });
});

describe('node health collection by the harness', () => {
  it('asks every node over its admin route and names the ones that do not answer', async () => {
    const asked = [];
    const fetchImpl = async (url) => {
      asked.push(url);
      if (includesOf(url, '10.0.0.2')) return {ok: false, status: 404};
      return {ok: true, status: 200, json: async () => ({nodeId: 'n1', health: {entriesHeld: 3}})};
    };
    const result = await collectClusterNodeHealth({sinceMs: 77, timeoutMs: 50, fetchImpl,
      nodes: [{id: 'n1', ip: '10.0.0.1', _adminApiPort: 8081},
        {id: 'n2', ip: '10.0.0.2', _adminApiPort: 8091}, {id: 'n3'}]});
    assert.deepEqual(asked, ['http://10.0.0.1:8081/api/admin/diagnostics/health?sinceMs=77',
      'http://10.0.0.2:8091/api/admin/diagnostics/health?sinceMs=77']);
    assert.deepEqual(result.nodes, [
      {nodeId: 'n1', state: 'collected', health: {entriesHeld: 3}},
      {nodeId: 'n2', state: 'unreachable', reason: 'request_failed',
        detail: 'admin route answered status 404'},
      {nodeId: 'n3', state: 'unreachable', reason: 'request_failed',
        detail: 'node handle has no admin endpoint'},
    ]);
  });
});

describe('run health artefacts', () => {
  async function scenarioFixture() {
    const outputDir = await mkdtemp(join(tmpdir(), 'run-health-artifacts-'));
    const scenarioDir = join(outputDir, 'some-scenario');
    const fullLogs = join(outputDir, RUN_HEALTH_ARTIFACT.FULL_LOG_DIRECTORY, 'some-scenario');
    await mkdir(scenarioDir, {recursive: true});
    await mkdir(fullLogs, {recursive: true});
    const samples = [];
    for (let second = 0; second <= 60; second += 2) {
      samples.push(JSON.stringify({timestamp: START + second * 1000, nodeId: NODE_ID,
        cpuPercent: 99, containerMemoryWorkingSetBytes: 1, containerMemoryLimitBytes: 10}));
    }
    await writeFile(join(scenarioDir, RUN_HEALTH_ARTIFACT.SAMPLES), samples.join('\n') + '\n');
    const line = (second, msg, fields) => JSON.stringify({level: 30,
      time: new Date(START + second * 1000).toISOString(), ...fields, msg});
    await writeFile(join(fullLogs, `${NODE_ID}${RUN_HEALTH_ARTIFACT.FULL_LOG_SUFFIX}`),
      gzipSync([
        line(1, 'Data directory configured', {}),
        line(9, NODE_LOG_MESSAGE.EVENT_LOOP_GAP_DETECTED, {gapMs: 1800}),
        line(20, NODE_LOG_MESSAGE.QUARANTINE_SKIPPED_PEER_ALIVE,
          {targetNodeId: PEER_ID, lastInboundAgoMs: 6100}),
      ].join('\n') + '\n'));
    // The curated playback log and the merged timeline must not be read
    // when the complete log exists.
    await writeFile(join(scenarioDir, `${NODE_ID}.log`),
      line(2, NODE_LOG_MESSAGE.EVENT_LOOP_GAP_DETECTED, {gapMs: 99999}) + '\n');
    await writeFile(join(scenarioDir, '_timeline.log'), 'not a node log\n');
    return {outputDir, scenarioDir};
  }

  it('classifies a scenario directory from its complete logs and writes both artefacts',
    async () => {
      const {outputDir, scenarioDir} = await scenarioFixture();
      try {
        const runHealth = await writeScenarioRunHealth({scenarioDir});
        assert.equal(runHealth.infrastructureSuspect, INFRASTRUCTURE_SUSPECT.UNKNOWN);
        const node = arrayFind(runHealth.nodes, (entry) => entry.nodeId === NODE_ID);
        assert.equal(node.verdicts[0].state, 'flagged');
        assert.equal(node.verdicts[2].evidence.maxGapMs, 1800);
        assert.deepEqual(runHealth.inputs.nodeEvidence[0].logSource, 'full_log');
        assert.equal(runHealth.inputs.nodeEvidence[0].logIsComplete, true);
        assert.deepEqual(JSON.parse(await readFile(
          join(scenarioDir, RUN_HEALTH_ARTIFACT.JSON), 'utf8')), runHealth);
        assert.match(await readFile(join(scenarioDir, RUN_HEALTH_ARTIFACT.MARKDOWN), 'utf8'),
          /FLAGGED cpu_saturated \[workload\]/u);
      } finally {
        await rm(outputDir, {recursive: true, force: true});
      }
    });

  it('falls back to the playback log as an incomplete source, and to nothing', async () => {
    const {outputDir, scenarioDir} = await scenarioFixture();
    try {
      await rm(join(outputDir, RUN_HEALTH_ARTIFACT.FULL_LOG_DIRECTORY), {recursive: true});
      const curated = await buildScenarioRunHealth({scenarioDir});
      assert.equal(curated.inputs.nodeEvidence[0].logSource, 'playback_log');
      assert.equal(curated.inputs.nodeEvidence[0].logIsComplete, false);
      const empty = await buildScenarioRunHealth({scenarioDir: join(outputDir, 'absent')});
      assert.equal(empty.infrastructureSuspect, INFRASTRUCTURE_SUSPECT.UNKNOWN);
      assert.deepEqual(empty.nodes, []);
    } finally {
      await rm(outputDir, {recursive: true, force: true});
    }
  });

  it('uses the run link baseline, records the consumer, then prefers its own copy',
    async () => {
      const {outputDir, scenarioDir} = await scenarioFixture();
      try {
        const baselinePath = join(outputDir, 'run.link-baseline.json');
        await writeFile(baselinePath, JSON.stringify({schemaVersion: 1, hosts: [],
          preRun: {pairs: []}, postRun: {state: 'unavailable', pairs: []}}));
        const first = await buildScenarioRunHealth({scenarioDir, linkBaselinePath: baselinePath});
        assert.equal(first.inputs.linkBaseline.state, 'measured');
        assert.deepEqual(await linkBaselineConsumers(baselinePath), [scenarioDir]);
        await writeFile(join(scenarioDir, RUN_HEALTH_ARTIFACT.LINK_BASELINE),
          JSON.stringify({schemaVersion: 1, hosts: [], preRun: {pairs: []},
            postRun: {pairs: []}}));
        await buildScenarioRunHealth({scenarioDir, linkBaselinePath: baselinePath});
        assert.deepEqual(await linkBaselineConsumers(baselinePath), [scenarioDir]);
        assert.deepEqual(await linkBaselineConsumers(join(outputDir, 'none.json')), []);
      } finally {
        await rm(outputDir, {recursive: true, force: true});
      }
    });

  it('reads the node health the harness collected at the end of the run', async () => {
    const {outputDir, scenarioDir} = await scenarioFixture();
    try {
      await writeClusterNodeHealth({scenarioDir, sinceMs: START, timeoutMs: 50,
        nodes: [{id: NODE_ID, ip: '10.0.0.1', _adminApiPort: 8081}],
        fetchImpl: async () => ({ok: true, status: 200, json: async () => ({health: {
          collectors: {eventLoop: {state: 'measured', downsampled: [], raw: [
            {atMs: START, delayP50Ms: 1, delayP99Ms: 2, delayMaxMs: 3,
              eventLoopUtilization: 0.2}]}}}})})});
      const runHealth = await buildScenarioRunHealth({scenarioDir});
      const evidence = arrayFind(runHealth.inputs.nodeEvidence, (node) => node.nodeId === NODE_ID);
      assert.deepEqual(evidence.healthCollection, {state: 'collected'});
      assert.equal(evidence.seriesSources.eventLoopDelay, 'node_health_collection');
      assert.equal(evidence.eventLoopDelaySamples, 1);
    } finally {
      await rm(outputDir, {recursive: true, force: true});
    }
  });
});

describe('run health on the report entry of every scenario', () => {
  const sampleLine = (second, fields) => JSON.stringify({
    timestamp: START + second * 1000, nodeId: NODE_ID, cpuPercent: 30,
    containerMemoryWorkingSetBytes: 1, containerMemoryLimitBytes: 10, ...fields});

  async function reportFixture(passedSamples) {
    const outputDir = await mkdtemp(join(tmpdir(), 'run-health-report-'));
    for (const [scenario, lines] of Object.entries(passedSamples)) {
      await mkdir(join(outputDir, scenario), {recursive: true});
      await writeFile(join(outputDir, scenario, RUN_HEALTH_ARTIFACT.SAMPLES),
        lines.join('\n') + '\n');
    }
    return outputDir;
  }

  it('a PASSED scenario gets its artefacts and a compact summary; a flagged ' +
    'infrastructure verdict on a pass is visible', async () => {
    const throttled = [];
    for (let second = 0; second <= 40; second += 2) {
      throttled.push(sampleLine(second, {rates: {state: 'measured',
        thermalCoreThrottleEvents: second === 10 ? 3 : 0, thermalPackageThrottleEvents: 0}}));
    }
    const outputDir = await reportFixture({'passing-but-throttled': throttled,
      'failing-scenario': [sampleLine(0, {})]});
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (text) => warnings.push(String(text));
    try {
      const passed = {scenario: 'passing-but-throttled', passed: true, duration: 5,
        predicates: {sealed: {met: true}}};
      const sealed = JSON.stringify(passed.predicates);
      const failed = {scenario: 'failing-scenario', passed: false, duration: 5,
        error: 'load readiness timeout', details: {diagnostics: {}}};
      const absent = {scenario: 'never-recorded', passed: true, duration: 1};
      await writeFailureBundlesForReport({scenarios: [passed, failed, absent],
        reportOutputPath: join(outputDir, 'report.json'), outputDir,
        reportSummary: {total: 3, passed: 2, failed: 1}, workspaceRoot: outputDir});

      assert.equal(passed.passed, true, 'the outcome is untouched');
      assert.equal(JSON.stringify(passed.predicates), sealed, 'predicates are untouched');
      assert.equal(passed.runHealth.infrastructureSuspect, INFRASTRUCTURE_SUSPECT.TRUE);
      assert.deepEqual(passed.runHealth.flagged, [
        {id: `node:${NODE_ID}:thermally_throttled`, attribution: 'infrastructure'}]);
      assert.equal(passed.runHealth.jsonPath, 'passing-but-throttled/run-health.json');
      assert.equal(Object.hasOwn(passed, 'failureBundle'), false);
      const written = JSON.parse(await readFile(
        join(outputDir, passed.runHealth.jsonPath), 'utf8'));
      assert.equal(written.infrastructureSuspect, INFRASTRUCTURE_SUSPECT.TRUE);
      assert.match(await readFile(join(outputDir, 'passing-but-throttled',
        RUN_HEALTH_ARTIFACT.MARKDOWN), 'utf8'), /FLAGGED thermally_throttled/u);
      assert.ok(includesOf(warnings.join('\n'),
        'passing-but-throttled PASSED with infrastructure verdicts flagged'));

      assert.equal(failed.runHealth.infrastructureSuspect, INFRASTRUCTURE_SUSPECT.UNKNOWN);
      assert.deepEqual(failed.runHealth.flagged, []);
      assert.match(await readFile(join(outputDir, 'failing-scenario',
        'failure-bundle.md'), 'utf8'), /^# Failure Bundle\n\n## Run Health\n/u);
      assert.equal(JSON.parse(await readFile(join(outputDir, 'failing-scenario',
        'failure-bundle.json'), 'utf8')).runHealth.schemaVersion, 1);

      assert.deepEqual(absent.runHealth, {unavailable: 'scenario_directory_absent'});
    } finally {
      console.warn = originalWarn;
      await rm(outputDir, {recursive: true, force: true});
    }
  });
});
