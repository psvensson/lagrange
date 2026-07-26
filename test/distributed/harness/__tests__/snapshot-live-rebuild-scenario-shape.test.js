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
import {
  SCALE_CLAIM_REASON,
  validateScaleEvidenceReport,
} from '../scale-evidence-contract.js';
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

  it('builds and validates the authoritative live P0 evidence report', () => {
    const evidence = scenarioModule.buildR5EvidenceSlice({
      preload: {source: 'benchmark_load', table: 'benchmark_logs'},
      target: {
        partitionId: 'partition-1',
        replicaId: 'replica-2',
        followerNodeId: 'node-2',
        leaderNodeId: 'node-1',
      },
      wiped: {
        dbPath: '/data/partitions/partition-1/replica-2.db',
        checkpointsDir: '/data/partitions/partition-1/checkpoints/replica-2',
      },
      catchupDurationMs: 1200,
      metrics: {
        total: 100,
        success: 99,
        opsPerSec: 40,
        latency: {p95: 8, p99: 12},
        queueDelay: {max: 3},
      },
      rebuildWindow: {total: 50, success: 49, successRate: 0.98},
      acknowledgedWriteVisibility: {visible: true},
      restartabilityLeg: {state: 'not_requested'},
      config: {
        floorBytes: 8_388_608,
        loadOpsPerSec: 40,
        loadDuration: '120s',
        preloadRows: 1024,
        preloadPayloadBytes: 8192,
        preWipeSettleMs: 14_000,
      },
      nodeCount: 7,
      replicaCount: 3,
      startedAt: '2026-07-26T10:00:00.000Z',
      completedAt: '2026-07-26T10:02:00.000Z',
    });
    const report = evidence.details.scaleEvidenceReport;
    const validation = validateScaleEvidenceReport(report);

    assert.equal(validation.valid, true);
    assert.equal(report.profile.id, 'P0');
    assert.equal(report.run.fidelity, 'live');
    assert.equal(report.claimEligibility.scaleCertification, false);
    assert.ok(report.claimEligibility.reasonCodes.includes(
      SCALE_CLAIM_REASON.DEVELOPMENT_PROFILE,
    ));
    assert.equal(evidence.details.contract, undefined);
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
