/**
 * Shape tests for the snapshot-live-rebuild scenario (S6, Phase B).
 *
 * Verifies without a docker run that:
 *  - the scenario module is discoverable and exports run(cluster),
 *  - resolveScenarioOptions merges the 'snapshotLiveRebuild' cluster config and
 *    resolveSnapshotLiveRebuildScenarioConfig produces the expected frozen shape,
 *  - the wipeReplicaData chaos verb builds the correct explicit-argv rm commands
 *    (db + WAL/SHM sidecars + checkpoints dir) with no shell globs.
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {
  discoverScenarios,
  filterScenarios,
} from '../scenario-discovery.js';
import {
  resolveScenarioOptions,
  resolveSnapshotLiveRebuildScenarioConfig,
} from '../scenario-config.js';
import {ChaosPrimitives} from '../chaos.js';
import * as scenarioModule from '../../scenarios/snapshot-live-rebuild.js';

const SCENARIOS_DIR = fileURLToPath(new URL('../../scenarios', import.meta.url));
const SCENARIO_NAME = 'snapshot-live-rebuild';

describe('snapshot-live-rebuild scenario shape', () => {
  it('exports a run function and named helpers', () => {
    assert.equal(typeof scenarioModule.run, 'function');
    assert.equal(typeof scenarioModule.resolveRebuildTarget, 'function');
    assert.equal(typeof scenarioModule.buildR5EvidenceSlice, 'function');
  });

  it('is auto-discoverable by the scenario discovery scanner', async () => {
    const scenarios = await discoverScenarios(SCENARIOS_DIR);
    const names = scenarios.map((scenario) => scenario.name);
    assert.ok(
      names.includes(SCENARIO_NAME),
      'expected discovery to include ' + SCENARIO_NAME +
        ', got: ' + names.join(', '),
    );
    const filtered = filterScenarios(scenarios, SCENARIO_NAME);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].name, SCENARIO_NAME);
  });

  it('resolveScenarioOptions merges the cluster snapshotLiveRebuild block', () => {
    const cluster = {
      _config: {
        scenarios: {
          snapshotLiveRebuild: {floorBytes: 12345, loadDuration: '90s'},
        },
      },
    };
    const merged = resolveScenarioOptions({}, cluster, 'snapshotLiveRebuild');
    assert.equal(merged.floorBytes, 12345);
    assert.equal(merged.loadDuration, '90s');

    const resolved = resolveSnapshotLiveRebuildScenarioConfig(merged);
    assert.equal(resolved.floorBytes, 12345);
    assert.equal(resolved.loadDuration, '90s');
  });

  it('resolveSnapshotLiveRebuildScenarioConfig applies frozen defaults', () => {
    const resolved = resolveSnapshotLiveRebuildScenarioConfig({});
    assert.ok(Object.isFrozen(resolved));
    assert.equal(resolved.tableName, 'logs');
    assert.equal(typeof resolved.floorBytes, 'number');
    assert.ok(resolved.floorBytes > 0);
    assert.ok(resolved.preloadRows > 0);
    assert.ok(resolved.preloadPayloadBytes > 0);
    assert.ok(resolved.preloadBatchSize > 0);
    assert.equal(typeof resolved.loadDuration, 'string');
    assert.ok(resolved.perNodeConvergenceTimeoutMs > 0);
    assert.ok(resolved.acknowledgedWriteVisibilityTimeoutMs > 0);
    assert.equal(resolved.restartabilityLegEnabled, false);
  });

  it('restartabilityLegEnabled is opt-in via strict boolean true', () => {
    assert.equal(
      resolveSnapshotLiveRebuildScenarioConfig({restartabilityLegEnabled: true})
        .restartabilityLegEnabled,
      true,
    );
    assert.equal(
      resolveSnapshotLiveRebuildScenarioConfig({restartabilityLegEnabled: 'yes'})
        .restartabilityLegEnabled,
      false,
    );
  });
});

describe('wipeReplicaData chaos verb', () => {
  function createMockProvider() {
    const calls = [];
    return {
      calls,
      execInContainer: async (id, cmd) => {
        calls.push({method: 'execInContainer', args: [id, cmd]});
        return {exitCode: 0, stdout: '', stderr: ''};
      },
    };
  }

  function createMockNodes() {
    return new Map([
      ['node-1', {containerId: 'container-aaa'}],
      ['node-2', {containerId: 'container-bbb'}],
    ]);
  }

  it('removes the replica db, WAL/SHM sidecars, and checkpoints dir with explicit argv', async () => {
    const provider = createMockProvider();
    const chaos = new ChaosPrimitives(provider, createMockNodes(), 'main-net');

    const result = await chaos.wipeReplicaData('node-2', {
      partitionId: 'part-7',
      replicaId: 'rep-9',
    });

    assert.equal(provider.calls.length, 3);

    const [dbRm, checkpointsRm, sync] = provider.calls;
    assert.equal(dbRm.args[0], 'container-bbb');
    assert.deepEqual(dbRm.args[1], [
      'rm',
      '-f',
      '/data/partitions/part-7/rep-9.db',
      '/data/partitions/part-7/rep-9.db-wal',
      '/data/partitions/part-7/rep-9.db-shm',
    ]);

    assert.deepEqual(checkpointsRm.args[1], [
      'rm',
      '-rf',
      '/data/partitions/part-7/checkpoints/rep-9',
    ]);

    assert.deepEqual(sync.args[1], ['sync']);

    // No shell globs / wildcards in any argv element.
    for (const call of provider.calls) {
      for (const token of call.args[1]) {
        assert.ok(!token.includes('*'), 'argv must not contain a glob: ' + token);
      }
    }

    assert.equal(result.dbPath, '/data/partitions/part-7/rep-9.db');
    assert.equal(
      result.checkpointsDir,
      '/data/partitions/part-7/checkpoints/rep-9',
    );
  });

  it('rejects a missing partitionId or replicaId before touching the container', async () => {
    const provider = createMockProvider();
    const chaos = new ChaosPrimitives(provider, createMockNodes(), 'main-net');

    await assert.rejects(
      () => chaos.wipeReplicaData('node-1', {replicaId: 'rep-9'}),
      /partitionId/,
    );
    await assert.rejects(
      () => chaos.wipeReplicaData('node-1', {partitionId: 'part-7'}),
      /replicaId/,
    );
    assert.equal(provider.calls.length, 0);
  });
});
