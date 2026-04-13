import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  waitForProgressOrStall,
} from '../progress-wait.js';

describe('progress-wait', () => {
  it('returns once success is reached after observable progress', async () => {
    const snapshots = [
      {status: 'ACTIVE'},
      {status: 'PREPARED'},
      {status: 'COMMITTED'},
    ];
    let index = 0;

    const result = await waitForProgressOrStall({
      timeoutMs: 1000,
      noProgressTimeoutMs: 200,
      pollIntervalMs: 1,
      probe: async () => {
        const snapshot = snapshots[Math.min(index, snapshots.length - 1)];
        index += 1;
        return snapshot;
      },
      isSuccess: (snapshot) => snapshot.status === 'COMMITTED',
      getProgressToken: (snapshot) => snapshot.status,
    });

    assert.equal(result.reason, 'success');
    assert.equal(result.sampleCount, 3);
    assert.equal(result.lastSnapshot.status, 'COMMITTED');
  });

  it('fails early when progress token stops changing', async () => {
    let attempts = 0;

    await assert.rejects(
      waitForProgressOrStall({
        timeoutMs: 60000,
        noProgressTimeoutMs: 20,
        pollIntervalMs: 1,
        probe: async () => {
          attempts += 1;
          return {
            status: 'ACTIVE',
          };
        },
        isSuccess: () => false,
        getProgressToken: (snapshot) => snapshot.status,
        buildError: (context) => {
          return new Error(
            'stalled with no progress: attempts=' +
            context.attemptCount +
            ', noProgressMs=' + context.noProgressDurationMs,
          );
        },
      }),
      /stalled with no progress/i,
    );

    assert.ok(
      attempts < 100,
      'expected no-progress failure to stop well before the full timeout budget',
    );
  });

  it('uses context-dependent no-progress budgets once a stalled phase begins',
    async () => {
      const snapshots = [
        {phase: 'warming', status: 'ACTIVE'},
        {phase: 'ready', status: 'ACTIVE'},
        {phase: 'ready', status: 'ACTIVE'},
        {phase: 'ready', status: 'ACTIVE'},
      ];
      let index = 0;

      await assert.rejects(
        waitForProgressOrStall({
          timeoutMs: 60000,
          noProgressTimeoutMs: 1000,
          pollIntervalMs: 1,
          probe: async () => {
            const snapshot = snapshots[Math.min(index, snapshots.length - 1)];
            index += 1;
            return snapshot;
          },
          isSuccess: () => false,
          getProgressToken: (snapshot) => ({
            phase: snapshot.phase,
            status: snapshot.status,
          }),
          getNoProgressTimeoutMs: (context) =>
            context.lastSnapshot?.phase === 'ready' ? 20 : 1000,
          buildError: (context) => {
            return new Error(
              'ready plateau stalled: budget=' +
              context.noProgressTimeoutMs +
              ', noProgressMs=' + context.noProgressDurationMs,
            );
          },
        }),
        /ready plateau stalled/i,
      );

      assert.ok(index < 100);
    });
});
