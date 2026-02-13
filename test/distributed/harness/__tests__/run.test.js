/**
 * Unit tests for the CLI runner (test/distributed/run.js).
 * Tests parseArgs and runScenarios in isolation.
 *
 * Requirements: 9.3, 9.6
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {parseArgs, runScenarios} from '../../run.js';
import {CLI} from '../constants.js';

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
