import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ResourceDiagnosticsSampler} from
  '../../src/diagnostics/resource-diagnostics-sampler.js';
import {sampleNodeHostStatistics} from
  '../../src/node/node-host-statistics-sampler.js';

function setup() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'diag-node-1'}});
  LoggingService.resetInstance();
  LoggingService.getInstance().initialize({nodeId: 'diag-node-1', level: 'error'});
}

function teardown() {
  LoggingService.resetInstance();
  ConfigurationManager.resetInstance();
}

test('ResourceDiagnosticsSampler returns process and component snapshots', async (t) => {
  setup();
  const ownerState = {queueDepth: 3};
  const owner = {
    messageRouter: {
      getStats: () => ({
        queueDepth: ownerState.queueDepth,
      }),
    },
  };

  const sampler = new ResourceDiagnosticsSampler({
    nodeId: 'diag-node-1',
    owner,
  });
  const report = sampler.getReport();

  t.equal(report.nodeId, 'diag-node-1');
  t.ok(report.latest.process.rssBytes > 0);
  t.equal(
    report.latest.components.messageRouter.queueDepth,
    3,
    'should include owner component stats',
  );
  t.equal(
    typeof report.compact.cpuPercent,
    'number',
    'should expose compact cpu percent field',
  );
  t.equal(
    typeof report.compact.eventLoopUtilizationPercent,
    'number',
    'should expose compact event-loop utilization field',
  );
  t.ok(
    Array.isArray(report.compact.topGrowingSignals),
    'should expose compact top growing signals list',
  );

  teardown();
  t.end();
});

test('ResourceDiagnosticsSampler ranks growing component signals', async (t) => {
  setup();
  const ownerState = {queueDepth: 1, delivered: 10};
  const owner = {
    messageRouter: {
      getStats: () => ({
        queueDepth: ownerState.queueDepth,
        delivered: ownerState.delivered,
      }),
    },
  };

  const sampler = new ResourceDiagnosticsSampler({
    nodeId: 'diag-node-1',
    owner,
  });

  sampler.getReport();
  ownerState.queueDepth = 40;
  ownerState.delivered = 200;
  const secondReport = sampler.getReport();
  const topSignals = secondReport.trend?.topGrowingSignals || [];

  t.ok(topSignals.length > 0, 'should include growing signals');
  t.ok(
    topSignals.some((entry) => entry.signal === 'messageRouter.queueDepth'),
    'should include growing queue depth signal',
  );
  t.ok(
    topSignals.some((entry) => entry.signal === 'messageRouter.delivered'),
    'should include growing delivered signal',
  );
  t.ok(
    secondReport.compact.topGrowingSignals.length <= 10,
    'compact top growing signals should be capped at 10 entries',
  );
  t.equal(
    secondReport.compact.rssGrowthPerMinBytes,
    secondReport.trend.rssGrowthPerMinBytes,
    'compact report should mirror trend rss growth value',
  );

  teardown();
  t.end();
});

test('ResourceDiagnosticsSampler exposes singleCoreCpuPercent without dividing by host core count, separate eventLoopDelayMs, and getSharedReport interval caching', async (t) => {
  setup();
  let nowMs = 1_000_000;
  let cpuUserUs = 0;
  let cpuSystemUs = 0;
  let eluUtilization = 0.25;
  let eventLoopDelayMs = 4.5;
  let collectCalls = 0;

  const fakeCpus = Array.from({length: 16}, () => ({model: 'test-cpu'}));
  const sampler = new ResourceDiagnosticsSampler({
    nodeId: 'diag-node-1',
    nowFn: () => nowMs,
    cpuUsageFn: () => {
      collectCalls += 1;
      return {user: cpuUserUs, system: cpuSystemUs};
    },
    cpusFn: () => fakeCpus,
    eluFn: () => ({utilization: eluUtilization}),
    eventLoopDelayProvider: () => eventLoopDelayMs,
  });

  // 1 second elapsed, 900,000 us of single-thread JS execution on a 16-core machine:
  nowMs += 1_000;
  cpuUserUs = 800_000;
  cpuSystemUs = 100_000;
  eluUtilization = 0.91;
  eventLoopDelayMs = 42.75;

  const report1 = sampler.getSharedReport(500);
  // Host-normalized CPU is 90% / 16 = 5.63%, whereas singleCoreCpuPercent is 90%:
  t.equal(report1.sampleId, 1);
  t.equal(report1.latest.sampleId, 1);
  t.equal(report1.latest.process.cpuCount, 16);
  t.equal(report1.latest.process.cpuPercent, 5.63);
  t.equal(report1.latest.process.singleCoreCpuPercent, 90);
  t.equal(report1.latest.process.eventLoopUtilizationPercent, 91);
  t.equal(report1.latest.process.eventLoopDelayMs, 42.75);
  t.equal(report1.compact.singleCoreCpuPercent, 90);
  t.equal(report1.compact.eventLoopDelayMs, 42.75);

  const callsAfterFirst = collectCalls;
  nowMs += 200;
  const cachedReport = sampler.getSharedReport(500);
  t.equal(cachedReport, report1, 'getSharedReport reuses sample within maxAgeMs');
  t.equal(cachedReport.latest.sampleId, 1, 'cached report preserves sampleId');
  t.equal(collectCalls, callsAfterFirst);

  nowMs += 400;
  cpuUserUs += 300_000;
  const freshReport = sampler.getSharedReport(500);
  t.not(freshReport, report1, 'getSharedReport collects fresh sample after maxAgeMs');
  t.equal(freshReport.sampleId, 2);
  t.equal(freshReport.latest.sampleId, 2, 'fresh report increments sampleId');
  t.equal(freshReport.latest.process.singleCoreCpuPercent, 50);

  teardown();
  t.end();
});

test('sampleNodeHostStatistics computes CPU usage from interval deltas rather than cumulative boot counters', async (t) => {
  let idleTicks = 900_000;
  let userTicks = 100_000;
  const clock = () => 0;
  const fakeOs = {
    cpus: () => [
      {
        model: 'interval-cpu',
        times: {user: userTicks, nice: 0, sys: 0, idle: idleTicks, irq: 0},
      },
    ],
    totalmem: () => 16 * 1024 * 1024 * 1024,
    freemem: () => 8 * 1024 * 1024 * 1024,
    platform: () => 'linux',
    arch: () => 'x64',
    hostname: () => 'host-1',
  };

  // Sample 1 at t = 1000: cumulative since boot is 10% (100k busy / 1000k total):
  const sample1 = sampleNodeHostStatistics(fakeOs, clock, 1_000, 500);
  t.equal(sample1.cpuUsagePercent, 10);
  t.equal(sample1.cpuMeasurementMode, 'cumulative_baseline');

  // Within maxAgeMs (t = 1200 < 1500): returns cached sample1:
  const cached = sampleNodeHostStatistics(fakeOs, clock, 1_200, 500);
  t.equal(cached, sample1);

  // Sample 2 at t = 1600: during this 600ms interval, 800 ticks were busy and 200 idle (80% busy!),
  // even though cumulative since boot is still (100,800 / 1,001,000) = 10.07%:
  userTicks += 800;
  idleTicks += 200;
  const sample2 = sampleNodeHostStatistics(fakeOs, clock, 1_600, 500);
  t.equal(sample2.cpuMeasurementMode, 'interval_delta');
  t.equal(sample2.cpuUsagePercent, 80);

  // Sample 3 at t = 2200: during the next interval, 50 ticks busy and 950 idle (5% busy):
  userTicks += 50;
  idleTicks += 950;
  const sample3 = sampleNodeHostStatistics(fakeOs, clock, 2_200, 500);
  t.equal(sample3.cpuMeasurementMode, 'interval_delta');
  t.equal(sample3.cpuUsagePercent, 5);
  t.end();
});
