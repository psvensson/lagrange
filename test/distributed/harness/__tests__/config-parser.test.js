/**
 * Unit tests for config-parser.
 *
 * Validates: Requirements 11.1, 11.5
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {writeFile, mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {parseConfig, mergeWithDefaults} from '../config-parser.js';
import {
  DEFAULT_CLUSTER_SIZE,
  DOCKER_DEFAULTS,
  TIMEOUTS,
  CONVERGENCE_DEFAULTS,
  RESOURCE_DEFAULTS,
  LOAD_DEFAULTS,
  DEBUG_TRACE_DEFAULTS,
  LEAK_DEFAULTS,
  BENCHMARK_DEFAULTS,
  BENCHMARK_GATE_DEFAULTS,
  RAFT_PROVIDER_DEFAULTS,
} from '../constants.js';

// --- Unit Tests ---

test('Unit: mergeWithDefaults fills all fields from empty object', async (t) => {
  await t.test(
    'returns complete config when given empty object',
    async () => {
      const config = mergeWithDefaults({});

      assert.strictEqual(config.size, DEFAULT_CLUSTER_SIZE);
      assert.strictEqual(
        config.docker.socketPath, DOCKER_DEFAULTS.socketPath,
      );
      assert.strictEqual(config.image, DOCKER_DEFAULTS.imageTag);

      assert.strictEqual(config.timeouts.nodeStartup, TIMEOUTS.NODE_STARTUP);
      assert.strictEqual(
        config.timeouts.convergence, TIMEOUTS.CONVERGENCE,
      );
      assert.strictEqual(config.timeouts.quietWindow, TIMEOUTS.QUIET_WINDOW);
      assert.strictEqual(
        config.timeouts.scenarioDefault, TIMEOUTS.SCENARIO_DEFAULT,
      );

      assert.strictEqual(
        config.convergence.targetVoterCount,
        CONVERGENCE_DEFAULTS.targetVoterCount,
      );
      assert.strictEqual(
        config.convergence.settleTimeoutMs,
        CONVERGENCE_DEFAULTS.settleTimeoutMs,
      );
      assert.strictEqual(
        config.convergence.quietWindowMs,
        CONVERGENCE_DEFAULTS.quietWindowMs,
      );
      assert.strictEqual(
        config.convergence.maxSustainedOverTargetMs,
        CONVERGENCE_DEFAULTS.maxSustainedOverTargetMs,
      );
      assert.strictEqual(
        config.convergence.sampleIntervalMs,
        CONVERGENCE_DEFAULTS.sampleIntervalMs,
      );

      assert.strictEqual(
        config.resourceLimits.memory, RESOURCE_DEFAULTS.memory,
      );
      assert.strictEqual(config.resourceLimits.cpus, RESOURCE_DEFAULTS.cpus);

      assert.strictEqual(
        config.load.defaultOpsPerSec, LOAD_DEFAULTS.defaultOpsPerSec,
      );
      assert.strictEqual(
        config.load.defaultDuration, LOAD_DEFAULTS.defaultDuration,
      );

      assert.strictEqual(
        config.debugTrace.enabled,
        DEBUG_TRACE_DEFAULTS.enabled,
      );
      assert.strictEqual(
        config.debugTrace.required,
        DEBUG_TRACE_DEFAULTS.required,
      );
      assert.strictEqual(
        config.debugTrace.serviceName,
        DEBUG_TRACE_DEFAULTS.serviceName,
      );
      assert.strictEqual(
        config.memoryLeak.enabled,
        LEAK_DEFAULTS.enabled,
      );
      assert.strictEqual(
        config.memoryLeak.failOnDetection,
        LEAK_DEFAULTS.failOnDetection,
      );
      assert.strictEqual(
        config.memoryLeak.requireSamples,
        LEAK_DEFAULTS.requireSamples,
      );
      assert.strictEqual(
        config.memoryLeak.minSamplesPerNode,
        LEAK_DEFAULTS.minSamplesPerNode,
      );
      assert.strictEqual(
        config.memoryLeak.maxPositiveSlopeBytesPerMin,
        LEAK_DEFAULTS.maxPositiveSlopeBytesPerMin,
      );
      assert.strictEqual(
        config.memoryLeak.captureHeapArtifacts,
        LEAK_DEFAULTS.captureHeapArtifacts,
      );
      assert.strictEqual(
        config.benchmark.baselineImage,
        BENCHMARK_DEFAULTS.baselineImage,
      );
      assert.strictEqual(
        config.benchmark.durationSeconds,
        BENCHMARK_DEFAULTS.durationSeconds,
      );
      assert.strictEqual(
        config.benchmark.clients,
        BENCHMARK_DEFAULTS.clients,
      );
      assert.strictEqual(
        config.benchmark.replicationFactor,
        BENCHMARK_DEFAULTS.replicationFactor,
      );
      assert.strictEqual(
        config.benchmark.syncReplicaAcks,
        BENCHMARK_DEFAULTS.syncReplicaAcks,
      );
      assert.strictEqual(
        config.benchmark.cacheBaselineMetrics,
        BENCHMARK_DEFAULTS.cacheBaselineMetrics,
      );
      assert.strictEqual(
        config.benchmark.refreshBaselineMetrics,
        BENCHMARK_DEFAULTS.refreshBaselineMetrics,
      );
      assert.strictEqual(
        config.benchmark.baselineCacheTtlMs,
        BENCHMARK_DEFAULTS.baselineCacheTtlMs,
      );
      assert.strictEqual(
        config.benchmarkGate.enabled,
        BENCHMARK_GATE_DEFAULTS.enabled,
      );
      assert.strictEqual(
        config.benchmarkGate.maxThroughputRegressionRatio,
        BENCHMARK_GATE_DEFAULTS.maxThroughputRegressionRatio,
      );
      assert.strictEqual(
        config.benchmarkGate.baselineProvider,
        BENCHMARK_GATE_DEFAULTS.baselineProvider,
      );
      assert.strictEqual(
        config.benchmarkGate.failIfBaselineMissing,
        BENCHMARK_GATE_DEFAULTS.failIfBaselineMissing,
      );
      assert.strictEqual(
        config.benchmarkGate.approvedMitigationId,
        BENCHMARK_GATE_DEFAULTS.approvedMitigationId,
      );
      assert.strictEqual(
        config.raftProvider,
        RAFT_PROVIDER_DEFAULTS.provider,
      );
    },
  );
});

test('Unit: mergeWithDefaults preserves user overrides', async (t) => {
  await t.test('user-specified fields override defaults', async () => {
    const partial = {
      size: 10,
      image: 'custom:v2',
      timeouts: {nodeStartup: 60000},
      convergence: {targetVoterCount: 5},
      resourceLimits: {memory: '1g'},
      load: {defaultOpsPerSec: 500},
      debugTrace: {
        enabled: true,
        required: true,
        serviceName: 'svc-orders',
        requiredLineagePrefix: 'lineage-orders',
      },
      memoryLeak: {
        enabled: true,
        failOnDetection: true,
        requireSamples: true,
        minSamplesPerNode: 25,
        maxPositiveSlopeBytesPerMin: 500000,
        captureHeapArtifacts: true,
        heapSnapshotNearLimitCount: 3,
      },
      benchmark: {
        baselineImage: 'postgres:15',
        durationSeconds: 45,
        clients: 10,
        jobs: 5,
        tableName: 'bench_custom',
        replicationFactor: 5,
        syncReplicaAcks: 2,
        cacheBaselineMetrics: false,
        refreshBaselineMetrics: true,
        baselineCacheTtlMs: 60000,
      },
      benchmarkGate: {
        enabled: true,
        maxThroughputRegressionRatio: 0.2,
        baselineProvider: 'liferaft',
        failIfBaselineMissing: true,
        approvedMitigationId: 'MIT-42',
      },
      raftProvider: 'raft_logic',
    };

    const config = mergeWithDefaults(partial);

    assert.strictEqual(config.size, 10);
    assert.strictEqual(config.image, 'custom:v2');
    assert.strictEqual(config.timeouts.nodeStartup, 60000);
    // Non-overridden timeout fields keep defaults
    assert.strictEqual(config.timeouts.convergence, TIMEOUTS.CONVERGENCE);
    assert.strictEqual(config.convergence.targetVoterCount, 5);
    assert.strictEqual(
      config.convergence.settleTimeoutMs,
      CONVERGENCE_DEFAULTS.settleTimeoutMs,
    );
    assert.strictEqual(config.resourceLimits.memory, '1g');
    assert.strictEqual(config.resourceLimits.cpus, RESOURCE_DEFAULTS.cpus);
    assert.strictEqual(config.load.defaultOpsPerSec, 500);
    assert.strictEqual(
      config.load.defaultDuration, LOAD_DEFAULTS.defaultDuration,
    );
    assert.strictEqual(config.debugTrace.enabled, true);
    assert.strictEqual(config.debugTrace.required, true);
    assert.strictEqual(config.debugTrace.serviceName, 'svc-orders');
    assert.strictEqual(
      config.debugTrace.requiredLineagePrefix,
      'lineage-orders',
    );
    assert.strictEqual(config.memoryLeak.enabled, true);
    assert.strictEqual(config.memoryLeak.failOnDetection, true);
    assert.strictEqual(config.memoryLeak.requireSamples, true);
    assert.strictEqual(config.memoryLeak.minSamplesPerNode, 25);
    assert.strictEqual(
      config.memoryLeak.maxPositiveSlopeBytesPerMin,
      500000,
    );
    assert.strictEqual(config.memoryLeak.captureHeapArtifacts, true);
    assert.strictEqual(config.memoryLeak.heapSnapshotNearLimitCount, 3);
    assert.strictEqual(
      config.memoryLeak.minGrowthBytes,
      LEAK_DEFAULTS.minGrowthBytes,
    );
    assert.strictEqual(config.benchmark.baselineImage, 'postgres:15');
    assert.strictEqual(config.benchmark.durationSeconds, 45);
    assert.strictEqual(config.benchmark.clients, 10);
    assert.strictEqual(config.benchmark.jobs, 5);
    assert.strictEqual(config.benchmark.tableName, 'bench_custom');
    assert.strictEqual(config.benchmark.replicationFactor, 5);
    assert.strictEqual(config.benchmark.syncReplicaAcks, 2);
    assert.strictEqual(config.benchmark.cacheBaselineMetrics, false);
    assert.strictEqual(config.benchmark.refreshBaselineMetrics, true);
    assert.strictEqual(config.benchmark.baselineCacheTtlMs, 60000);
    assert.strictEqual(config.benchmarkGate.enabled, true);
    assert.strictEqual(config.benchmarkGate.maxThroughputRegressionRatio, 0.2);
    assert.strictEqual(config.benchmarkGate.baselineProvider, 'liferaft');
    assert.strictEqual(config.benchmarkGate.failIfBaselineMissing, true);
    assert.strictEqual(config.benchmarkGate.approvedMitigationId, 'MIT-42');
    assert.strictEqual(config.raftProvider, 'raft_logic');
    assert.strictEqual(
      config.benchmark.loadOpsPerSec,
      BENCHMARK_DEFAULTS.loadOpsPerSec,
    );
  });
});

test('Unit: mergeWithDefaults handles docker.hosts for remote', async (t) => {
  await t.test('uses hosts array when provided', async () => {
    const partial = {
      docker: {hosts: ['tcp://vm-1:2376', 'tcp://vm-2:2376']},
    };

    const config = mergeWithDefaults(partial);

    assert.deepStrictEqual(
      config.docker.hosts,
      ['tcp://vm-1:2376', 'tcp://vm-2:2376'],
    );
    assert.strictEqual(config.docker.socketPath, undefined);
  });
});

test('Unit: mergeWithDefaults preserves optional docker fast-local fields', async (t) => {
  await t.test('passes through docker binds and skipBuildOnDirty when set',
    async () => {
      const partial = {
        docker: {
          socketPath: '/var/run/docker.sock',
          skipBuildOnDirty: true,
          reuseContainers: true,
          keepRunningContainers: true,
          binds: [
            '/tmp/project/src:/app/src:ro',
            '',
            42,
          ],
        },
      };

      const config = mergeWithDefaults(partial);

      assert.strictEqual(config.docker.skipBuildOnDirty, true);
      assert.strictEqual(config.docker.reuseContainers, true);
      assert.strictEqual(config.docker.keepRunningContainers, true);
      assert.deepStrictEqual(config.docker.binds, [
        '/tmp/project/src:/app/src:ro',
      ]);
    });
});

test('Unit: mergeWithDefaults passes through gcp config', async (t) => {
  await t.test('includes gcp section when present', async () => {
    const partial = {
      gcp: {project: 'my-proj', zone: 'us-central1-a'},
    };

    const config = mergeWithDefaults(partial);

    assert.deepStrictEqual(config.gcp, {
      project: 'my-proj',
      zone: 'us-central1-a',
    });
  });

  await t.test('omits gcp section when absent', async () => {
    const config = mergeWithDefaults({});
    assert.strictEqual(config.gcp, undefined);
  });
});

test('Unit: mergeWithDefaults with no argument', async (t) => {
  await t.test('works when called with no arguments', async () => {
    const config = mergeWithDefaults();
    assert.strictEqual(config.size, DEFAULT_CLUSTER_SIZE);
    assert.strictEqual(
      config.docker.socketPath, DOCKER_DEFAULTS.socketPath,
    );
  });
});

test('Unit: parseConfig reads JSON file and merges', async (t) => {
  let tmpDir;

  t.beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'config-test-'));
  });

  t.afterEach(async () => {
    await rm(tmpDir, {recursive: true, force: true});
  });

  await t.test('parses a valid JSON config file', async () => {
    const configData = {size: 7, image: 'test:v3'};
    const filePath = join(tmpDir, 'test.json');
    await writeFile(filePath, JSON.stringify(configData));

    const config = await parseConfig(filePath);

    assert.strictEqual(config.size, 7);
    assert.strictEqual(config.image, 'test:v3');
    assert.strictEqual(
      config.docker.socketPath, DOCKER_DEFAULTS.socketPath,
    );
    assert.strictEqual(config.timeouts.nodeStartup, TIMEOUTS.NODE_STARTUP);
  });

  await t.test('throws on non-existent file', async () => {
    await assert.rejects(
      () => parseConfig(join(tmpDir, 'missing.json')),
      {code: 'ENOENT'},
    );
  });

  await t.test('throws on invalid JSON', async () => {
    const filePath = join(tmpDir, 'bad.json');
    await writeFile(filePath, '{not valid json');

    await assert.rejects(
      () => parseConfig(filePath),
      (err) => err instanceof SyntaxError,
    );
  });
});

// --- Property-Based Tests ---
import fc from 'fast-check';

/**
 * Feature: distributed-testing-framework
 * Property 18: Configuration Defaults
 *
 * *For any* partial configuration object with missing fields, parsing it
 * SHALL produce a complete configuration with all missing fields filled
 * by default values.
 *
 * **Validates: Requirements 11.5**
 */
test('Property 18: Configuration Defaults', async (t) => {
  await t.test(
    'partial configs always produce complete configs with defaults',
    async () => {
      const partialConfigArb = fc.record({
        size: fc.option(fc.integer({min: 1, max: 100}), {nil: undefined}),
        image: fc.option(fc.string({minLength: 1, maxLength: 30}), {
          nil: undefined,
        }),
        timeouts: fc.option(
          fc.record({
            nodeStartup: fc.option(
              fc.integer({min: 1000, max: 120000}), {nil: undefined},
            ),
            convergence: fc.option(
              fc.integer({min: 1000, max: 120000}), {nil: undefined},
            ),
            quietWindow: fc.option(
              fc.integer({min: 500, max: 30000}), {nil: undefined},
            ),
            scenarioDefault: fc.option(
              fc.integer({min: 5000, max: 600000}), {nil: undefined},
            ),
          }, {requiredKeys: []}),
          {nil: undefined},
        ),
        convergence: fc.option(
          fc.record({
            targetVoterCount: fc.option(
              fc.integer({min: 1, max: 9}), {nil: undefined},
            ),
            settleTimeoutMs: fc.option(
              fc.integer({min: 1000, max: 120000}), {nil: undefined},
            ),
            quietWindowMs: fc.option(
              fc.integer({min: 500, max: 30000}), {nil: undefined},
            ),
            maxSustainedOverTargetMs: fc.option(
              fc.integer({min: 500, max: 30000}), {nil: undefined},
            ),
            sampleIntervalMs: fc.option(
              fc.integer({min: 50, max: 5000}), {nil: undefined},
            ),
          }, {requiredKeys: []}),
          {nil: undefined},
        ),
        resourceLimits: fc.option(
          fc.record({
            memory: fc.option(
              fc.constantFrom('256m', '512m', '1g', '2g'), {nil: undefined},
            ),
            cpus: fc.option(
              fc.constantFrom('0.5', '1.0', '2.0'), {nil: undefined},
            ),
          }, {requiredKeys: []}),
          {nil: undefined},
        ),
        load: fc.option(
          fc.record({
            defaultOpsPerSec: fc.option(
              fc.integer({min: 1, max: 10000}), {nil: undefined},
            ),
            defaultDuration: fc.option(
              fc.constantFrom('10s', '30s', '60s', '5m'), {nil: undefined},
            ),
          }, {requiredKeys: []}),
          {nil: undefined},
        ),
      }, {requiredKeys: []});

      fc.assert(
        fc.property(partialConfigArb, (partial) => {
          // Strip undefined keys to simulate real partial JSON
          const cleaned = JSON.parse(JSON.stringify(partial));
          const config = mergeWithDefaults(cleaned);

          // size must be a number
          assert.strictEqual(typeof config.size, 'number');
          assert.ok(config.size > 0);

          // docker must exist with socketPath or hosts
          assert.ok(config.docker !== undefined);
          assert.ok(
            config.docker.socketPath !== undefined ||
            config.docker.hosts !== undefined,
          );

          // image must be a non-empty string
          assert.strictEqual(typeof config.image, 'string');
          assert.ok(config.image.length > 0);

          // timeouts must have all four fields
          assert.strictEqual(typeof config.timeouts.nodeStartup, 'number');
          assert.strictEqual(typeof config.timeouts.convergence, 'number');
          assert.strictEqual(typeof config.timeouts.quietWindow, 'number');
          assert.strictEqual(
            typeof config.timeouts.scenarioDefault, 'number',
          );

          // convergence must have all five fields
          assert.strictEqual(
            typeof config.convergence.targetVoterCount, 'number',
          );
          assert.strictEqual(
            typeof config.convergence.settleTimeoutMs, 'number',
          );
          assert.strictEqual(
            typeof config.convergence.quietWindowMs, 'number',
          );
          assert.strictEqual(
            typeof config.convergence.maxSustainedOverTargetMs, 'number',
          );
          assert.strictEqual(
            typeof config.convergence.sampleIntervalMs, 'number',
          );

          // resourceLimits must have memory and cpus
          assert.strictEqual(typeof config.resourceLimits.memory, 'string');
          assert.strictEqual(typeof config.resourceLimits.cpus, 'string');

          // load must have defaultOpsPerSec and defaultDuration
          assert.strictEqual(
            typeof config.load.defaultOpsPerSec, 'number',
          );
          assert.strictEqual(
            typeof config.load.defaultDuration, 'string',
          );
        }),
        {numRuns: 10},
      );
    },
  );
});

/**
 * Feature: distributed-testing-framework
 * Property 20: Configuration Parsing Round Trip
 *
 * *For any* valid configuration object, serializing it to JSON and parsing
 * it back SHALL produce an equivalent configuration object.
 *
 * **Validates: Requirements 11.1**
 */
test('Property 20: Configuration Parsing Round Trip', async (t) => {
  await t.test(
    'mergeWithDefaults is idempotent through JSON round trip',
    async () => {
      const partialConfigArb = fc.record({
        size: fc.option(fc.integer({min: 1, max: 100}), {nil: undefined}),
        image: fc.option(fc.string({minLength: 1, maxLength: 30}), {
          nil: undefined,
        }),
        timeouts: fc.option(
          fc.record({
            nodeStartup: fc.option(
              fc.integer({min: 1000, max: 120000}), {nil: undefined},
            ),
            convergence: fc.option(
              fc.integer({min: 1000, max: 120000}), {nil: undefined},
            ),
          }, {requiredKeys: []}),
          {nil: undefined},
        ),
        convergence: fc.option(
          fc.record({
            targetVoterCount: fc.option(
              fc.integer({min: 1, max: 9}), {nil: undefined},
            ),
            settleTimeoutMs: fc.option(
              fc.integer({min: 1000, max: 120000}), {nil: undefined},
            ),
          }, {requiredKeys: []}),
          {nil: undefined},
        ),
        resourceLimits: fc.option(
          fc.record({
            memory: fc.option(
              fc.constantFrom('256m', '512m', '1g'), {nil: undefined},
            ),
            cpus: fc.option(
              fc.constantFrom('0.5', '1.0', '2.0'), {nil: undefined},
            ),
          }, {requiredKeys: []}),
          {nil: undefined},
        ),
        load: fc.option(
          fc.record({
            defaultOpsPerSec: fc.option(
              fc.integer({min: 1, max: 10000}), {nil: undefined},
            ),
            defaultDuration: fc.option(
              fc.constantFrom('10s', '30s', '60s'), {nil: undefined},
            ),
          }, {requiredKeys: []}),
          {nil: undefined},
        ),
      }, {requiredKeys: []});

      fc.assert(
        fc.property(partialConfigArb, (partial) => {
          const cleaned = JSON.parse(JSON.stringify(partial));

          // First pass: merge partial with defaults
          const first = mergeWithDefaults(cleaned);

          // Round trip: serialize to JSON and parse back, then merge again
          const roundTripped = mergeWithDefaults(
            JSON.parse(JSON.stringify(first)),
          );

          assert.deepStrictEqual(roundTripped, first);
        }),
        {numRuns: 10},
      );
    },
  );
});
