// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {BreakpointManager} from '../../src/debug-runtime/breakpoint-manager.js';
import {SnapshotRecorder} from '../../src/debug-runtime/snapshot-recorder.js';
import {
  SNAPSHOT_RECORDER_ERROR_MSG as SNAPSHOT_ERR,
} from '../../src/debug-runtime/snapshot-recorder-constants.js';

describe('Debug overhead regression checks', () => {
  it('keeps inactive breakpoint control overhead within budget', async () => {
    const iterations = 500;
    const instanceHandle = {instanceId: 'inactive-overhead'};

    const runtimeAdapter = {
      async resume(_request) {
        return {status: 'running'};
      },
    };
    const manager = new BreakpointManager({runtimeAdapter});

    const baselineMs = await measureAsyncCost(iterations, async () => {
      await runtimeAdapter.resume({instanceHandle});
    });
    const debugMs = await measureAsyncCost(iterations, async () => {
      await manager.continueExecution({
        sessionId: 'session-overhead',
        instanceHandle,
      });
    });

    const allowedMs = baselineMs * 4 + 20;
    assert.equal(debugMs <= allowedMs, true);
    assert.equal(
      manager.getPendingStepAction({sessionId: 'session-overhead'}),
      null,
    );
  });

  it('enforces snapshot byte budget under sustained capture load', async () => {
    const recorder = new SnapshotRecorder({
      maxBytesPerSnapshot: 1024,
      maxFramesPerSession: 2048,
      maxHostCallsPerSession: 2048,
      captureTimeoutMs: 100,
    });

    await recorder.startSessionCapture({
      sessionId: 'session-load',
      moduleRef: 'svc:load@1.0.0',
      moduleDigest: 'sha256:' + 'c'.repeat(64),
    });

    let capturedFrames = 0;
    let budgetError = null;
    for (let index = 0; index < 300; index++) {
      try {
        await recorder.captureInputFrame({
          sessionId: 'session-load',
          frame: {
            codeOffset: index,
            payload: 'x'.repeat(64),
          },
        });
        capturedFrames += 1;
      } catch (error) {
        budgetError = error;
        break;
      }
    }

    assert.ok(budgetError);
    assert.equal(
      budgetError.message,
      SNAPSHOT_ERR.SNAPSHOT_BYTES_LIMIT_EXCEEDED,
    );
    assert.equal(capturedFrames > 0, true);
    assert.equal(capturedFrames < 300, true);
  });
});

async function measureAsyncCost(iterations, work) {
  const start = performance.now();
  for (let index = 0; index < iterations; index++) {
    await work();
  }
  return performance.now() - start;
}
