import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {buildPerformanceDiagnostics} from '../performance-diagnostics.js';

describe('performance-diagnostics', () => {
  it('builds write-path phase attribution from metrics logs', () => {
    const diagnostics = buildPerformanceDiagnostics([
      {
        message: 'metrics.partition.raft_propose',
        metadata: JSON.stringify({
          durationMs: 40,
          isLeader: true,
          forwarded: false,
          acknowledged: true,
          writePhaseTimingMs: {
            entryBuildMs: 2,
            forwardDeliverMs: 0,
            logAppendMs: 4,
            sqliteRunMs: 8,
            raftCommandDispatchMs: 3,
            applyWriteMs: 20,
            totalMs: 40,
          },
        }),
      },
      {
        message: 'metrics.partition.raft_propose',
        metadata: JSON.stringify({
          durationMs: 50,
          isLeader: false,
          forwarded: true,
          acknowledged: true,
          writePhaseTimingMs: {
            entryBuildMs: 3,
            forwardDeliverMs: 10,
            logAppendMs: 5,
            sqliteRunMs: 10,
            raftCommandDispatchMs: 2,
            applyWriteMs: 30,
            totalMs: 50,
          },
        }),
      },
      {
        message: 'metrics.transport.deliver',
        metadata: JSON.stringify({
          durationMs: 12,
          queueWaitMs: 3,
          queueDepth: 2,
          acknowledged: true,
        }),
      },
      {
        message: 'metrics.transport.deliver',
        metadata: JSON.stringify({
          durationMs: 18,
          queueWaitMs: 5,
          queueDepth: 3,
          acknowledged: false,
        }),
      },
      {
        message: 'metrics.partition.sqlite',
        metadata: JSON.stringify({
          durationMs: 7,
          rowCount: 4,
        }),
      },
    ]);

    assert.ok(diagnostics);
    assert.equal(diagnostics.sampleCounts.raftPropose, 2);
    assert.equal(diagnostics.sampleCounts.transportDeliver, 2);
    assert.equal(diagnostics.sampleCounts.partitionSqlite, 1);

    assert.ok(diagnostics.writePath);
    assert.equal(diagnostics.writePath.sampleCount, 2);
    assert.equal(diagnostics.writePath.leaderSamples, 1);
    assert.equal(diagnostics.writePath.forwardedSamples, 1);
    assert.equal(diagnostics.writePath.acknowledgedSamples, 2);
    assert.equal(diagnostics.writePath.phaseBreakdown[0].phase, 'applyWriteMs');

    assert.ok(diagnostics.transport);
    assert.equal(diagnostics.transport.sampleCount, 2);
    assert.equal(diagnostics.transport.acknowledgedSamples, 1);
    assert.equal(diagnostics.transport.queueWaitMs.count, 2);

    assert.ok(diagnostics.sqlite);
    assert.equal(diagnostics.sqlite.sampleCount, 1);
    assert.equal(diagnostics.sqlite.durationMs.count, 1);
  });

  it('accepts object metadata payloads from live stream collectors', () => {
    const diagnostics = buildPerformanceDiagnostics([
      {
        message: 'metrics.partition.raft_propose',
        metadata: {
          durationMs: 11,
          acknowledged: true,
          writePhaseTimingMs: {
            entryBuildMs: 1,
            forwardDeliverMs: 0,
            logAppendMs: 1,
            sqliteRunMs: 2,
            raftCommandDispatchMs: 1,
            applyWriteMs: 5,
            totalMs: 11,
          },
        },
      },
    ]);

    assert.ok(diagnostics);
    assert.ok(diagnostics.writePath);
    assert.equal(diagnostics.writePath.sampleCount, 1);
    assert.equal(diagnostics.writePath.durationMs.avg, 11);
  });

  it('returns null when no supported metrics are present', () => {
    const diagnostics = buildPerformanceDiagnostics([
      {message: 'regular.log.message', metadata: '{"foo":"bar"}'},
      {message: 'warn.message', metadata: null},
    ]);
    assert.equal(diagnostics, null);
  });
});
