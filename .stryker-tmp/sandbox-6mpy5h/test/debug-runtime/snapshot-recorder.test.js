// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  SnapshotRecorder,
  serializeSnapshotEnvelope,
  deserializeSnapshotEnvelope,
} from '../../src/debug-runtime/snapshot-recorder.js';
import {
  SNAPSHOT_RECORDER_ERROR_MSG as ERR,
} from '../../src/debug-runtime/snapshot-recorder-constants.js';

const SESSION_ID = 'session-snapshot';
const MODULE_REF = 'svc:snapshot-module@1.0.0';
const MODULE_DIGEST = 'sha256:' + 'a'.repeat(64);

describe('SnapshotRecorder core capture', () => {
  it('captures input frames, host calls, memory boundaries, and finalizes',
    async () => {
      const recorder = new SnapshotRecorder();
      await recorder.startSessionCapture({
        sessionId: SESSION_ID,
        moduleRef: MODULE_REF,
        moduleDigest: MODULE_DIGEST,
        lineageId: 'lineage-s1',
        stageId: 3,
      });

      await recorder.captureInputFrame({
        sessionId: SESSION_ID,
        frame: {
          context: {requestId: 'r1'},
          rows: [{id: 1}],
        },
      });
      await recorder.captureHostCall({
        sessionId: SESSION_ID,
        hostCall: {
          namespace: 'db',
          functionName: 'query',
          args: ['SELECT 1'],
          result: [{value: 1}],
        },
      });
      await recorder.captureMemoryBoundary({
        sessionId: SESSION_ID,
        label: 'after_run',
        memoryBytes: Buffer.from([1, 2, 3, 4]),
        offset: 0,
        length: 4,
      });

      const finalized = await recorder.finalizeSnapshot({
        sessionId: SESSION_ID,
      });

      assert.ok(Buffer.isBuffer(finalized.envelope));
      assert.equal(finalized.manifest.frameCount, 1);
      assert.equal(finalized.manifest.hostCallCount, 1);
      assert.equal(finalized.manifest.memoryBoundaryCount, 1);
    });
});

describe('SnapshotRecorder quota and safety controls', () => {
  it('enforces max frames and max host calls limits', async () => {
    const recorder = new SnapshotRecorder({
      maxFramesPerSession: 1,
      maxHostCallsPerSession: 1,
    });
    await recorder.startSessionCapture({
      sessionId: SESSION_ID,
      moduleRef: MODULE_REF,
      moduleDigest: MODULE_DIGEST,
    });

    await recorder.captureInputFrame({
      sessionId: SESSION_ID,
      frame: {rows: []},
    });
    await assert.rejects(
      () => recorder.captureInputFrame({
        sessionId: SESSION_ID,
        frame: {rows: []},
      }),
      (err) => err.message === ERR.SNAPSHOT_FRAME_LIMIT_EXCEEDED,
    );

    await recorder.captureHostCall({
      sessionId: SESSION_ID,
      hostCall: {name: 'a'},
    });
    await assert.rejects(
      () => recorder.captureHostCall({
        sessionId: SESSION_ID,
        hostCall: {name: 'b'},
      }),
      (err) => err.message === ERR.SNAPSHOT_HOST_CALL_LIMIT_EXCEEDED,
    );
  });

  it('enforces max bytes per snapshot', async () => {
    const recorder = new SnapshotRecorder({
      maxBytesPerSnapshot: 60,
    });
    await recorder.startSessionCapture({
      sessionId: SESSION_ID,
      moduleRef: MODULE_REF,
      moduleDigest: MODULE_DIGEST,
    });

    await assert.rejects(
      () => recorder.captureInputFrame({
        sessionId: SESSION_ID,
        frame: {
          veryLargePayload: 'x'.repeat(200),
        },
      }),
      (err) => err.message === ERR.SNAPSHOT_BYTES_LIMIT_EXCEEDED,
    );
  });

  it('enforces capture timeouts', async () => {
    const recorder = new SnapshotRecorder({
      captureTimeoutMs: 1,
      setTimeoutFn(callback, _ms) {
        callback();
        return 1;
      },
      clearTimeoutFn(_id) {},
    });

    await assert.rejects(
      () => recorder.startSessionCapture({
        sessionId: SESSION_ID,
        moduleRef: MODULE_REF,
        moduleDigest: MODULE_DIGEST,
      }),
      (err) => err.message === ERR.SNAPSHOT_CAPTURE_TIMEOUT,
    );
  });
});

describe('SnapshotRecorder serialization round-trip', () => {
  it('round-trips versioned binary envelope and manifest', async () => {
    const recorder = new SnapshotRecorder();
    await recorder.startSessionCapture({
      sessionId: SESSION_ID,
      moduleRef: MODULE_REF,
      moduleDigest: MODULE_DIGEST,
      lineageId: 'lineage-rt',
      stageId: 1,
    });
    await recorder.captureInputFrame({
      sessionId: SESSION_ID,
      frame: {batch: [1, 2]},
    });

    const finalized = await recorder.finalizeSnapshot({
      sessionId: SESSION_ID,
      keepInMemory: true,
    });
    const decoded = deserializeSnapshotEnvelope(finalized.envelope);

    assert.equal(decoded.manifest.snapshotId, finalized.manifest.snapshotId);
    assert.equal(decoded.manifest.sessionId, SESSION_ID);
    assert.equal(decoded.snapshot.inputFrames.length, 1);
    assert.equal(decoded.snapshot.moduleRef, MODULE_REF);

    const reencoded = serializeSnapshotEnvelope(
      decoded.snapshot,
      decoded.manifest,
    );
    const secondDecode = deserializeSnapshotEnvelope(reencoded);
    assert.equal(
      secondDecode.manifest.snapshotId,
      decoded.manifest.snapshotId,
    );
  });
});
