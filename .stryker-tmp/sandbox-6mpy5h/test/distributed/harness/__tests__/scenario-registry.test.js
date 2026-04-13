// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_SCENARIO_MATRIX,
  formatCanonicalScenarioMatrixLines,
  listCanonicalScenarioEntries,
  normalizeScenarioConfigName,
  selectCanonicalScenariosForConfig,
} from '../scenario-registry.js';

describe('scenario-registry', () => {
  it('tracks the canonical 20-scenario matrix', () => {
    assert.equal(CANONICAL_SCENARIO_MATRIX.length, 20);
  });

  it('normalizes config basenames from paths', () => {
    assert.equal(
      normalizeScenarioConfigName('test/distributed/config/local.json'),
      'local.json',
    );
    assert.equal(
      normalizeScenarioConfigName('local-three-node.json'),
      'local-three-node.json',
    );
    assert.equal(normalizeScenarioConfigName(null), null);
  });

  it('lists canonical entries for a specific config', () => {
    const entries = listCanonicalScenarioEntries('local-three-node.json');

    assert.equal(entries.length, 8);
    assert.deepEqual(
      entries.map((entry) => entry.name),
      [
        'admin-query-smoke',
        'examples-catalog',
        'network-partition-split-brain',
        'node-failure-rebalance',
        'rolling-restart',
        'three-node-seed-rebalance',
        'wasm-service-failover',
        'write-ack-visibility',
      ],
    );
  });

  it('selects canonical scenarios for a config in matrix order', () => {
    const scenarios = [
      {name: 'write-ack-visibility', path: '/tmp/write-ack-visibility.js'},
      {name: 'rolling-restart', path: '/tmp/rolling-restart.js'},
      {name: 'admin-query-smoke', path: '/tmp/admin-query-smoke.js'},
      {name: 'slow-follower-under-load', path: '/tmp/slow-follower.js'},
      {name: 'examples-catalog', path: '/tmp/examples-catalog.js'},
    ];

    const selected = selectCanonicalScenariosForConfig(
      scenarios,
      'test/distributed/config/local-three-node.json',
    );

    assert.deepEqual(
      selected.map((scenario) => scenario.name),
      [
        'admin-query-smoke',
        'examples-catalog',
        'rolling-restart',
        'write-ack-visibility',
      ],
    );
  });

  it('formats canonical scenario matrix as config-scenario lines', () => {
    const lines = formatCanonicalScenarioMatrixLines();

    assert.equal(lines.length, 20);
    assert.equal(lines[0], 'local-three-node.json|admin-query-smoke');
    assert.equal(
      lines[lines.length - 1],
      'local-benchmark-7node-partition-split.json|' +
        'seven-node-postgres-baseline-partition-split',
    );
  });
});
