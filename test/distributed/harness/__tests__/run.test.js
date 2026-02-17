/**
 * Unit tests for the CLI runner (test/distributed/run.js).
 * Tests parseArgs and runScenarios in isolation.
 *
 * Requirements: 9.3, 9.6
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {relative} from 'node:path';
import {URL} from 'node:url';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
  parseArgs,
  runScenarios,
  normalizeScenarioPayload,
  evaluateTraceAssertions,
  evaluateMemoryLeakAssertions,
  buildImage,
  deriveRunOutputDir,
  loadHistoricalReports,
  loadScenarioModule,
  shouldPrintLiveLogEntry,
} from '../../run.js';
import {CLI} from '../constants.js';
import {DockerProvider} from '../docker-provider.js';

describe('parseArgs', () => {
  it('returns defaults when no args provided', () => {
    const result = parseArgs([]);
    assert.equal(result.config, CLI.DEFAULT_CONFIG);
    assert.equal(result.scenario, null);
    assert.equal(result.output, CLI.DEFAULT_OUTPUT);
    assert.equal(result.verbose, false);
  });

  it('parses --config flag', () => {
    const result = parseArgs(['--config', 'gcp-small.json']);
    assert.equal(result.config, 'gcp-small.json');
  });

  it('parses --scenario flag', () => {
    const result = parseArgs(['--scenario', 'node-failure']);
    assert.equal(result.scenario, 'node-failure');
  });

  it('parses --output flag', () => {
    const result = parseArgs(['--output', 'results.json']);
    assert.equal(result.output, 'results.json');
  });

  it('parses --verbose flag', () => {
    const result = parseArgs(['--verbose']);
    assert.equal(result.verbose, true);
  });

  it('parses all flags together', () => {
    const result = parseArgs([
      '--config', 'local.json',
      '--scenario', 'rolling-restart',
      '--output', 'out.json',
      '--verbose',
    ]);
    assert.equal(result.config, 'local.json');
    assert.equal(result.scenario, 'rolling-restart');
    assert.equal(result.output, 'out.json');
    assert.equal(result.verbose, true);
  });

  it('ignores unknown flags', () => {
    const result = parseArgs(['--unknown', 'value']);
    assert.equal(result.config, CLI.DEFAULT_CONFIG);
    assert.equal(result.scenario, null);
  });

  it('handles --config without value at end of argv', () => {
    const result = parseArgs(['--config']);
    assert.equal(result.config, CLI.DEFAULT_CONFIG);
  });
});

describe('runScenarios', () => {
  const baseOptions = {output: '/tmp/test-report.json', verbose: false};
  const baseConfig = {
    size: 3,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'test:latest',
    timeouts: {nodeStartup: 1000, convergence: 1000},
    resourceLimits: {},
  };

  it('catches unhandled scenario error and marks failed', async () => {
    const failPath = new URL(
      '../__fixtures__/failing-scenario.js',
      import.meta.url,
    ).pathname;

    const scenarios = [{name: 'fail-test', path: failPath}];

    // createCluster will throw because Docker isn't available,
    // which exercises the error-catch-and-continue path (Req 9.6)
    const {report, hasFailures} = await runScenarios(
      baseConfig,
      scenarios,
      baseOptions,
    );

    assert.equal(hasFailures, true);
    assert.equal(report.scenarios.length, 1);
    assert.equal(report.scenarios[0].passed, false);
    assert.ok(report.scenarios[0].error);
    assert.ok(report.scenarios[0].duration >= 0);
    assert.equal(report.scenarios[0].clusterSize, 3);
    assert.equal(report.scenarios[0].performanceDiagnostics, null);
  });

  it('continues to next scenario after failure', async () => {
    const failPath = new URL(
      '../__fixtures__/failing-scenario.js',
      import.meta.url,
    ).pathname;

    const scenarios = [
      {name: 'first-fail', path: failPath},
      {name: 'second-fail', path: failPath},
    ];

    const {report, hasFailures} = await runScenarios(
      baseConfig,
      scenarios,
      baseOptions,
    );

    assert.equal(hasFailures, true);
    assert.equal(report.scenarios.length, 2);
    assert.equal(report.scenarios[0].scenario, 'first-fail');
    assert.equal(report.scenarios[1].scenario, 'second-fail');
  });

  it('records startedAt and duration for each scenario', async () => {
    const failPath = new URL(
      '../__fixtures__/failing-scenario.js',
      import.meta.url,
    ).pathname;

    const scenarios = [{name: 'timed', path: failPath}];

    const {report} = await runScenarios(
      baseConfig,
      scenarios,
      baseOptions,
    );

    const entry = report.scenarios[0];
    assert.ok(entry.startedAt);
    assert.ok(typeof entry.duration === 'number');
    assert.ok(entry.duration >= 0);
  });

  it('returns hasFailures false when all pass', async () => {
    // With no scenarios, there are no failures
    const {report, hasFailures} = await runScenarios(
      baseConfig,
      [],
      baseOptions,
    );

    assert.equal(hasFailures, false);
    assert.equal(report.scenarios.length, 0);
  });
});

describe('normalizeScenarioPayload', () => {
  it('returns null for non-object payloads', () => {
    assert.equal(normalizeScenarioPayload(null), null);
    assert.equal(normalizeScenarioPayload(undefined), null);
    assert.equal(normalizeScenarioPayload('x'), null);
    assert.equal(normalizeScenarioPayload(42), null);
    assert.equal(normalizeScenarioPayload([]), null);
  });

  it('returns object payload for merge into scenario result', () => {
    const payload = {
      exampleResults: {
        total: 2,
        passed: 2,
        failed: 0,
      },
      artifactPath: 'test-output/examples/run-1.json',
    };
    assert.deepEqual(normalizeScenarioPayload(payload), payload);
  });
});

describe('evaluateTraceAssertions', () => {
  it('returns null when trace assertions are not required', () => {
    const result = evaluateTraceAssertions(
      {eventCount: 1, lineageIds: ['lineage-1']},
      {enabled: true, required: false},
    );
    assert.equal(result, null);
  });

  it('fails when required trace artifact is missing', () => {
    const result = evaluateTraceAssertions(
      null,
      {enabled: true, required: true},
    );
    assert.equal(result.required, true);
    assert.equal(result.passed, false);
    assert.equal(result.error, 'trace artifact missing');
  });

  it('fails when required trace has no captured events', () => {
    const result = evaluateTraceAssertions(
      {eventCount: 0, lineageIds: []},
      {enabled: true, required: true},
    );
    assert.equal(result.passed, false);
    assert.equal(result.error, 'no trace events captured');
  });

  it('enforces required lineage prefix when configured', () => {
    const result = evaluateTraceAssertions(
      {
        eventCount: 2,
        lineageIds: ['lineage-a', 'lineage-b'],
      },
      {
        enabled: true,
        required: true,
        requiredLineagePrefix: 'lineage-z',
      },
    );
    assert.equal(result.passed, false);
    assert.equal(
      result.error,
      'required lineage prefix not found: lineage-z',
    );
  });

  it('passes when required lineage prefix is present', () => {
    const result = evaluateTraceAssertions(
      {
        eventCount: 2,
        lineageIds: ['lineage-z-1', 'lineage-b'],
      },
      {
        enabled: true,
        required: true,
        requiredLineagePrefix: 'lineage-z',
      },
    );
    assert.equal(result.passed, true);
    assert.equal(result.matchedRequiredLineagePrefix, true);
  });
});

describe('evaluateMemoryLeakAssertions', () => {
  it('returns null when memory leak checks are disabled', () => {
    const result = evaluateMemoryLeakAssertions(
      {analyzed: true, leakDetected: false},
      {enabled: false},
    );
    assert.equal(result, null);
  });

  it('fails when samples are required but analysis is unavailable', () => {
    const result = evaluateMemoryLeakAssertions(
      {analyzed: false, leakDetected: false},
      {enabled: true, requireSamples: true, failOnDetection: false},
    );
    assert.equal(result.enabled, true);
    assert.equal(result.passed, false);
    assert.equal(result.error, 'memory samples unavailable');
  });

  it('fails when leak detection is enabled and leak is found', () => {
    const result = evaluateMemoryLeakAssertions(
      {
        analyzed: true,
        leakDetected: true,
        leakingNodeCount: 2,
        leakingNodes: ['node-2', 'node-4'],
      },
      {enabled: true, requireSamples: false, failOnDetection: true},
    );
    assert.equal(result.passed, false);
    assert.equal(
      result.error,
      'memory leak detected on nodes: node-2,node-4',
    );
  });

  it('passes when analysis is present and no leak is detected', () => {
    const result = evaluateMemoryLeakAssertions(
      {
        analyzed: true,
        leakDetected: false,
        leakingNodeCount: 0,
        leakingNodes: [],
      },
      {enabled: true, requireSamples: true, failOnDetection: true},
    );
    assert.equal(result.passed, true);
    assert.equal(result.error, null);
  });
});

describe('buildImage', () => {
  it('passes positional DockerProvider arguments and commit label', async () => {
    const originalBuildImage = DockerProvider.prototype.buildImage;
    const originalGetImageLabel = DockerProvider.prototype.getImageLabel;
    const calls = [];

    DockerProvider.prototype.buildImage =
      async function(contextPath, tag, dockerfile, _progressSink, labels) {
        calls.push({contextPath, tag, dockerfile, labels});
      };
    DockerProvider.prototype.getImageLabel = async function() {
      return null;
    };

    try {
      await buildImage({
        docker: {socketPath: '/var/run/docker.sock'},
        image: 'distributed-db:test',
        dockerfile: 'Dockerfile',
      }, false, null, {gitHash: 'abc1234', gitDirty: false});
    } finally {
      DockerProvider.prototype.buildImage = originalBuildImage;
      DockerProvider.prototype.getImageLabel = originalGetImageLabel;
    }

    assert.equal(calls.length, 1);
    assert.equal(calls[0].contextPath, '.');
    assert.equal(calls[0].tag, 'distributed-db:test');
    assert.equal(calls[0].dockerfile, 'Dockerfile');
    assert.deepEqual(calls[0].labels, {'ddb.git-hash': 'abc1234'});
  });

  it('reuses existing image when git hash label matches', async () => {
    const originalBuildImage = DockerProvider.prototype.buildImage;
    const originalGetImageLabel = DockerProvider.prototype.getImageLabel;
    let buildCallCount = 0;

    DockerProvider.prototype.buildImage = async function() {
      buildCallCount++;
    };
    DockerProvider.prototype.getImageLabel = async function() {
      return 'abc1234';
    };

    let result;
    try {
      result = await buildImage({
        docker: {socketPath: '/var/run/docker.sock'},
        image: 'distributed-db:test',
        dockerfile: 'Dockerfile',
      }, false, null, {gitHash: 'abc1234', gitDirty: false});
    } finally {
      DockerProvider.prototype.buildImage = originalBuildImage;
      DockerProvider.prototype.getImageLabel = originalGetImageLabel;
    }

    assert.equal(buildCallCount, 0);
    assert.equal(result.reused, true);
  });

  it('does not reuse git-hash image when workspace is dirty', async () => {
    const originalBuildImage = DockerProvider.prototype.buildImage;
    const originalGetImageLabel = DockerProvider.prototype.getImageLabel;
    let buildCallCount = 0;

    DockerProvider.prototype.buildImage = async function() {
      buildCallCount++;
    };
    DockerProvider.prototype.getImageLabel = async function() {
      return 'abc1234';
    };

    let result;
    try {
      result = await buildImage({
        docker: {socketPath: '/var/run/docker.sock'},
        image: 'distributed-db:test',
        dockerfile: 'Dockerfile',
      }, false, null, {gitHash: 'abc1234', gitDirty: true});
    } finally {
      DockerProvider.prototype.buildImage = originalBuildImage;
      DockerProvider.prototype.getImageLabel = originalGetImageLabel;
    }

    assert.equal(buildCallCount, 1);
    assert.equal(result.reused, false);
  });
});

describe('deriveRunOutputDir', () => {
  it('derives run-scoped playback directory from report path', () => {
    const outputDir = deriveRunOutputDir('test-output/my-run.report.json');
    assert.equal(outputDir, 'test-output/.playback/my-run');
  });

  it('falls back to output basename when report extension differs', () => {
    const outputDir = deriveRunOutputDir('test-output/results.json');
    assert.equal(outputDir, 'test-output/.playback/results');
  });
});

describe('loadHistoricalReports', () => {
  it('loads existing output report and sibling .report.json files', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'historical-report-test-'));
    const outputPath = join(tempDir, 'latest.report.json');
    const siblingPath = join(tempDir, 'older.report.json');
    const invalidPath = join(tempDir, 'invalid.report.json');

    try {
      await writeFile(outputPath, JSON.stringify({
        timestamp: '2026-02-17T10:00:00.000Z',
        scenarios: [{scenario: 's1'}],
      }));
      await writeFile(siblingPath, JSON.stringify({
        timestamp: '2026-02-16T10:00:00.000Z',
        scenarios: [{scenario: 's0'}],
      }));
      await writeFile(invalidPath, '{"not":"a-report"}');

      const reports = await loadHistoricalReports(outputPath);
      assert.equal(reports.length, 2);
      assert.equal(reports[0].path, outputPath);
      assert.equal(reports[1].path, siblingPath);
      assert.equal(reports[0].scenarios[0].scenario, 's1');
      assert.equal(reports[1].scenarios[0].scenario, 's0');
    } finally {
      await rm(tempDir, {recursive: true, force: true});
    }
  });
});

describe('loadScenarioModule', () => {
  it('loads workspace-relative scenario path', async () => {
    const fixtureAbsolutePath = new URL(
      '../__fixtures__/failing-scenario.js',
      import.meta.url,
    ).pathname;
    const fixtureRelativePath = relative(
      process.cwd(),
      fixtureAbsolutePath,
    );

    const module = await loadScenarioModule(fixtureRelativePath);
    assert.equal(typeof module.run, 'function');
  });
});

describe('shouldPrintLiveLogEntry', () => {
  it('returns false for load-generator entries', () => {
    assert.equal(
      shouldPrintLiveLogEntry({
        node_id: 'load-generator',
        level: 'error',
        message: 'error',
      }),
      false,
    );
  });

  it('returns true for warn/error levels', () => {
    assert.equal(
      shouldPrintLiveLogEntry({
        node_id: 'node-1',
        level: 'warn',
        message: 'slow follower',
      }),
      true,
    );
    assert.equal(
      shouldPrintLiveLogEntry({
        node_id: 'node-2',
        level: 'error',
        message: 'timeout',
      }),
      true,
    );
  });

  it('returns true for error-like messages at info level', () => {
    assert.equal(
      shouldPrintLiveLogEntry({
        node_id: 'node-1',
        level: 'info',
        message: 'delivery timeout',
      }),
      true,
    );
    assert.equal(
      shouldPrintLiveLogEntry({
        node_id: 'node-1',
        level: 'info',
        message: 'all good',
      }),
      false,
    );
  });
});
