import fs from 'node:fs';
import {effectiveCpuCores} from '../../src/diagnostics/resource-cpu-capacity.js';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ResourceDiagnosticsSampler} from
  '../../src/diagnostics/resource-diagnostics-sampler.js';
import {readLinuxMemAvailableBytes, sampleNodeHostStatistics} from
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
    typeof report.compact.processCpuPercentOfHostCores,
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

test('ResourceDiagnosticsSampler separates thread CPU and aggregate process core equivalents, separate eventLoopDelayMs, and getSharedReport interval caching', async (t) => {
  setup();
  let nowMs = 1_000_000;
  let threadUserUs = 0;
  let cpuUserUs = 0;
  let cpuSystemUs = 0;
  let eluUtilization = 0.25;
  let eventLoopDelayMs = 4.5;
  let collectCalls = 0;

  const fakeCpus = Array.from({length: 16}, () => ({
    model: 'test-cpu', times: {user: 0, idle: 0},
  }));
  const sampler = new ResourceDiagnosticsSampler({
    nodeId: 'diag-node-1',
    nowFn: () => nowMs,
    cpuUsageFn: () => {
      collectCalls += 1;
      return {user: cpuUserUs, system: cpuSystemUs};
    },
    threadCpuUsageFn: () => ({user: threadUserUs, system: 0}),
    cpusFn: () => fakeCpus,
    eluFn: () => ({utilization: eluUtilization}),
    eventLoopDelayProvider: () => eventLoopDelayMs,
  });

  // A process with workers consumes 1.8 cores while its main thread consumes 20%.
  nowMs += 1_000;
  cpuUserUs = 1_700_000;
  threadUserUs = 200_000;
  cpuSystemUs = 100_000;
  for (const cpu of fakeCpus) {
    cpu.times.user = 12;
    cpu.times.idle = 88;
  }
  eluUtilization = 0.91;
  eventLoopDelayMs = 42.75;

  const report1 = sampler.getSharedReport(500);
  t.equal(report1.sampleId, 1);
  t.equal(report1.latest.sampleId, 1);
  t.equal(report1.latest.process.cpuCount, 16);
  t.equal(report1.latest.process.processCpuCores, 1.8);
  t.equal(report1.latest.process.hostCpuUtilizationPercent, 12);
  t.equal(report1.latest.process.sampleIntervalMs, 1000);
  t.equal(report1.latest.process.processCpuPercentOfHostCores, 11.25);
  t.equal(report1.latest.process.mainThreadCpuPercent, 20);
  t.equal(report1.latest.process.eventLoopUtilizationPercent, 91);
  t.equal(report1.latest.process.eventLoopDelayMs, 42.75);
  t.equal(report1.compact.mainThreadCpuPercent, 20);
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
  t.equal(freshReport.latest.process.mainThreadCpuPercent, 0);

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

  // The first sample establishes an interval baseline.
  const sample1 = sampleNodeHostStatistics(fakeOs, clock, 1_000, 500);
  t.equal(sample1.hostCpuUtilizationPercent, null);
  t.equal(sample1.cpuMeasurementMode, 'unavailable');

  // Within maxAgeMs (t = 1200 < 1500): returns cached sample1:
  const cached = sampleNodeHostStatistics(fakeOs, clock, 1_200, 500);
  t.equal(cached, sample1);

  // Sample 2 at t = 1600: during this 600ms interval, 800 ticks were busy and 200 idle (80% busy!),
  // even though cumulative since boot is still (100,800 / 1,001,000) = 10.07%:
  userTicks += 800;
  idleTicks += 200;
  const sample2 = sampleNodeHostStatistics(fakeOs, clock, 1_600, 500);
  t.equal(sample2.cpuMeasurementMode, 'interval_delta');
  t.equal(sample2.hostCpuUtilizationPercent, 80);
  t.equal(sample2.cpuSampleIntervalMs, 600);

  // Sample 3 at t = 2200: during the next interval, 50 ticks busy and 950 idle (5% busy):
  userTicks += 50;
  idleTicks += 950;
  const sample3 = sampleNodeHostStatistics(fakeOs, clock, 2_200, 500);
  t.equal(sample3.cpuMeasurementMode, 'interval_delta');
  t.equal(sample3.hostCpuUtilizationPercent, 5);
  t.end();
});

function errnoError(code) {
  return Object.assign(new Error(code), {code});
}

test('effective capacity intersects affinity and visible ancestor quotas', (t) => {
  if (process.platform !== 'linux') return t.end();
  const files = new Map([
    ['/proc/self/status', 'Cpus_allowed_list:\t1-4,6'],
    ['/proc/self/cgroup', '0::/service/node'],
    ['/sys/fs/cgroup/service/node/cpu.max', 'max 100000'],
    ['/sys/fs/cgroup/service/cpu.max', '150000 100000'],
    ['/sys/fs/cgroup/cpu.max', 'max 100000'],
  ]);
  const read = (path) => {
    if (!files.has(path)) throw errnoError('ENOENT');
    return files.get(path);
  };
  t.strictSame(effectiveCpuCores(read), {cores: 1.5});
  files.set('/sys/fs/cgroup/service/cpu.max', 'max 100000');
  t.strictSame(effectiveCpuCores(read), {cores: 5});
  files.delete('/sys/fs/cgroup/service/cpu.max');
  t.strictSame(effectiveCpuCores(read), {refusal: 'file_unreadable', code: 'ENOENT'});
  files.set('/proc/self/cgroup', '0::/');
  files.set('/sys/fs/cgroup/cpu.max', '200000 100000');
  t.strictSame(effectiveCpuCores(read), {cores: 2});
  files.set('/sys/fs/cgroup/cpu.max', '100000 100000');
  t.strictSame(effectiveCpuCores(read), {cores: 1});
  t.end();
});

test('effective capacity refuses with a typed reason when capacity cannot be proven', (t) => {
  if (process.platform !== 'linux') return t.end();
  const status = 'Cpus_allowed_list:\t0-3';
  const reader = (overrides) => (path) => {
    if (path in overrides) {
      const value = overrides[path];
      if (value instanceof Error) throw value;
      return value;
    }
    throw errnoError('ENOENT');
  };
  t.strictSame(effectiveCpuCores(reader({'/proc/self/cgroup': errnoError('EACCES')})),
    {refusal: 'file_unreadable', code: 'EACCES'});
  t.strictSame(effectiveCpuCores(reader({'/proc/self/cgroup': '1:name=x:/y'})),
    {refusal: 'cgroup_v2_membership_absent'});
  t.strictSame(effectiveCpuCores(reader({'/proc/self/cgroup': '0::/../x'})),
    {refusal: 'cgroup_outside_hierarchy'});
  t.strictSame(effectiveCpuCores(reader({'/proc/self/cgroup': '0::/', '/proc/self/status': 'none'})),
    {refusal: 'affinity_list_absent'});
  t.strictSame(effectiveCpuCores(reader({
    '/proc/self/cgroup': '0::/', '/proc/self/status': 'Cpus_allowed_list:\t4-2',
  })), {refusal: 'affinity_list_malformed'});
  t.strictSame(effectiveCpuCores(reader({
    '/proc/self/cgroup': '0::/', '/proc/self/status': status, '/sys/fs/cgroup/cpu.max': 'abc def',
  })), {refusal: 'quota_malformed'});
  t.end();
});

test('effective capacity continues past a level without cpu.max and refuses unreadable quotas', (t) => {
  if (process.platform !== 'linux') return t.end();
  const files = {
    '/proc/self/cgroup': '0::/svc',
    '/proc/self/status': 'Cpus_allowed_list:\t0-3',
    '/sys/fs/cgroup/svc/cgroup.controllers': 'cpu',
    '/sys/fs/cgroup/cpu.max': '200000 100000',
  };
  const reader = (extra) => (path) => {
    const all = {...files, ...extra};
    if (!(path in all)) throw errnoError('ENOENT');
    if (all[path] instanceof Error) throw all[path];
    return all[path];
  };
  t.strictSame(effectiveCpuCores(reader({})), {cores: 2});
  t.strictSame(effectiveCpuCores(reader({'/sys/fs/cgroup/svc/cpu.max': errnoError('EACCES')})),
    {refusal: 'file_unreadable', code: 'EACCES'});
  t.end();
});

test('a reader that returns null for cpu.max is not an absent file', (t) => {
  if (process.platform !== 'linux') return t.end();
  const result = effectiveCpuCores((path) => {
    if (path === '/proc/self/cgroup') return '0::/';
    if (path === '/proc/self/status') return 'Cpus_allowed_list:\t0-3';
    return null;
  });
  t.equal(result.refusal, 'unexpected_error');
  t.equal(result.cores, undefined, 'published as unavailable, as before');
  t.end();
});

test('thrown non-errors are refusals, never an exception from the capacity read', (t) => {
  if (process.platform !== 'linux') return t.end();
  const odd = [null, undefined, 'text', Object.assign(new Error('x'), {code: Symbol('c')})];
  for (const thrown of odd) {
    for (const stage of ['/proc/self/cgroup', '/proc/self/status', '/sys/fs/cgroup/cpu.max']) {
      const result = effectiveCpuCores((path) => {
        if (path === stage) throw thrown;
        if (path === '/proc/self/cgroup') return '0::/';
        return 'Cpus_allowed_list:\t0-3';
      });
      t.equal(result.refusal, 'unexpected_error', `${String(stage)} throwing ${String(thrown?.message ?? thrown)}`);
      t.ok(Object.hasOwn(result, 'error'));
      t.equal(result.error, thrown);
    }
  }
  t.end();
});

test('sampler logs every kind of thrown non-error once and publishes NULL', async (t) => {
  setup();
  for (const thrown of [null, undefined, 'text']) {
    const errors = [];
    const sampler = new ResourceDiagnosticsSampler({
      nodeId: 'diag-node-1',
      cpuCapacityFn: () => ({refusal: 'unexpected_error', error: thrown}),
      eventLoopDelayProvider: () => 1,
    });
    sampler.logger = {error: (message, data) => errors.push([message, data])};
    t.equal(sampler.collect().process.effectiveCpuCores, null);
    sampler.collect();
    t.equal(errors.length, 1, `logged once for ${String(thrown)}`);
  }
  teardown();
  t.end();
});

test('effective capacity names an unexpected error instead of hiding it as unavailable', (t) => {
  if (process.platform !== 'linux') return t.end();
  const bug = new TypeError('read returned a non-string');
  const result = effectiveCpuCores((path) => {
    if (path === '/proc/self/cgroup') return '0::/';
    throw bug;
  });
  t.equal(result.refusal, 'unexpected_error');
  t.equal(result.error, bug);
  t.end();
});

test('sampler publishes NULL for a refused capacity and logs an unexpected error once', async (t) => {
  setup();
  const bug = new TypeError('read returned a non-string');
  const errors = [];
  let capacity = {refusal: 'unexpected_error', error: bug};
  const sampler = new ResourceDiagnosticsSampler({
    nodeId: 'diag-node-1',
    cpuCapacityFn: () => capacity,
    eventLoopDelayProvider: () => 1,
  });
  sampler.logger = {error: (message, data) => errors.push([message, data])};
  t.equal(sampler.collect().process.effectiveCpuCores, null);
  t.equal(sampler.collect().process.effectiveCpuCores, null);
  t.equal(errors.length, 1, 'one error-level log for repeated unexpected errors');
  t.equal(errors[0][1].error, 'read returned a non-string');
  t.equal(errors[0][1].stack, bug.stack);
  capacity = {refusal: 'file_unreadable', code: 'EACCES'};
  t.equal(sampler.collect().process.effectiveCpuCores, null);
  t.equal(errors.length, 1, 'an expected refusal is not logged as an error');
  capacity = {cores: 2.5};
  t.equal(sampler.collect().process.effectiveCpuCores, 2.5);
  teardown();
  t.end();
});

test('readLinuxMemAvailableBytes reads meminfo as text, not as a Buffer', (t) => {
  const reads = [];
  const original = fs.readFileSync;
  fs.readFileSync = (file, encoding) => {
    reads.push([file, encoding]);
    return 'MemAvailable:     2048 kB\n';
  };
  try {
    t.equal(readLinuxMemAvailableBytes(10_000_000, 5), 2_097_152);
  } finally {
    fs.readFileSync = original;
  }
  t.same(reads, [['/proc/meminfo', 'utf8']]);
  t.end();
});
