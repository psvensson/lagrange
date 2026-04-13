// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {ReplayRuntime} from '../../src/debug-runtime/replay-runtime.js';
import {SnapshotRecorder} from '../../src/debug-runtime/snapshot-recorder.js';
import {BreakpointManager} from '../../src/debug-runtime/breakpoint-manager.js';
import {RuntimeIntrospector} from '../../src/debug-runtime/runtime-introspector.js';
import {DapServer} from '../../src/debug-runtime/dap-server.js';
import {buildDwarfIndex} from '../../src/debug-runtime/dwarf-index-builder.js';
import {
  DAP_MESSAGE_TYPE as MT,
  DAP_COMMAND as CMD,
  DAP_EVENT,
} from '../../src/debug-runtime/dap-constants.js';
import {
  REPLAY_DRIFT_REASON as DRIFT,
} from '../../src/debug-runtime/replay-runtime-constants.js';

const SESSION_ID = 'session-replay';
const MODULE_REF = 'svc:replay-module@1.0.0';
const MODULE_DIGEST = 'sha256:' + 'b'.repeat(64);
const SOURCE_FILE_URL = 'file:///src/replay.ts';

describe('ReplayRuntime core', () => {
  it('loads snapshot and serves inspect/resume replay state', async () => {
    const snapshotArtifact = await buildSnapshotArtifact();
    const replay = new ReplayRuntime({now: () => 1700000000000});

    const loaded = replay.loadSnapshot(snapshotArtifact);
    assert.equal(loaded.frameCount, 2);
    assert.equal(loaded.hostCallCount, 1);

    const runtimeAdapter = replay.createRuntimeAdapter();
    const inspectA = await runtimeAdapter.inspect({
      instanceHandle: loaded.instanceHandle,
    });
    assert.equal(inspectA.codeOffset, 10);

    await runtimeAdapter.resume({
      instanceHandle: loaded.instanceHandle,
    });
    const inspectB = await runtimeAdapter.inspect({
      instanceHandle: loaded.instanceHandle,
    });
    assert.equal(inspectB.codeOffset, 20);
  });

  it('replays host calls from ledger and reports drift diagnostics', async () => {
    const snapshotArtifact = await buildSnapshotArtifact();
    const replay = new ReplayRuntime();
    replay.loadSnapshot(snapshotArtifact);

    const okResult = replay.replayHostCall({
      namespace: 'db',
      functionName: 'query',
      args: ['SELECT 1'],
    });
    assert.equal(okResult.ok, true);
    assert.deepEqual(okResult.result, [{value: 1}]);

    const driftResult = replay.replayHostCall({
      namespace: 'db',
      functionName: 'query',
      args: ['SELECT 2'],
    });
    assert.equal(driftResult.ok, false);
    assert.equal(driftResult.error, DRIFT.LEDGER_EXHAUSTED);
  });
});

describe('ReplayRuntime local replay DAP integration', () => {
  it('supports breakpoint/step/inspect via existing DAP backend', async () => {
    const snapshotArtifact = await buildSnapshotArtifact();
    const replay = new ReplayRuntime();
    const loaded = replay.loadSnapshot(snapshotArtifact);
    const runtimeAdapter = replay.createRuntimeAdapter();
    const index = buildReplayIndex();

    const breakpointManager = new BreakpointManager({
      runtimeAdapter,
    });
    const runtimeIntrospector = new RuntimeIntrospector({
      runtimeAdapter,
    });

    const outbox = [];
    const dap = new DapServer({
      breakpointManager,
      runtimeIntrospector,
      sendMessage(_framed, payload) {
        outbox.push(payload);
      },
    });

    await sendRequest(dap, 1, CMD.INITIALIZE, {});
    await sendRequest(dap, 2, CMD.ATTACH, {
      sessionId: SESSION_ID,
      moduleRef: MODULE_REF,
      instanceHandle: loaded.instanceHandle,
      index,
    });
    const setBreakpoints = await sendRequest(
      dap,
      3,
      CMD.SET_BREAKPOINTS,
      {
        source: {path: SOURCE_FILE_URL},
        breakpoints: [{line: 5}],
      },
    );
    assert.equal(setBreakpoints.success, true);

    const stackTrace = await sendRequest(dap, 4, CMD.STACK_TRACE, {});
    assert.equal(stackTrace.success, true);
    assert.equal(stackTrace.body.stackFrames.length, 1);

    await sendRequest(dap, 5, CMD.NEXT, {});
    dap.notifyPaused({codeOffset: 20});

    assert.equal(
      outbox.some((payload) => payload.type === MT.EVENT &&
        payload.event === DAP_EVENT.STOPPED),
      true,
    );
  });
});

describe('ReplayRuntime determinism verification', () => {
  it('same snapshot replay yields equivalent deterministic outcomes',
    async () => {
      const snapshotArtifact = await buildSnapshotArtifact();
      const replayA = new ReplayRuntime();
      const replayB = new ReplayRuntime();
      replayA.loadSnapshot(snapshotArtifact);
      replayB.loadSnapshot(snapshotArtifact);

      const resultA = replayA.replayHostCall({
        namespace: 'db',
        functionName: 'query',
        args: ['SELECT 1'],
      });
      const resultB = replayB.replayHostCall({
        namespace: 'db',
        functionName: 'query',
        args: ['SELECT 1'],
      });
      assert.deepEqual(resultA, resultB);

      const verificationA = replayA.verifyDeterminism();
      const verificationB = replayB.verifyDeterminism();
      assert.equal(verificationA.deterministic, true);
      assert.equal(verificationB.deterministic, true);
    });

  it('reports drift diagnostics when replay diverges', async () => {
    const snapshotArtifact = await buildSnapshotArtifact();
    const replay = new ReplayRuntime();
    replay.loadSnapshot(snapshotArtifact);

    const mismatch = replay.replayHostCall({
      namespace: 'db',
      functionName: 'query',
      args: ['SELECT wrong'],
    });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.error, DRIFT.HOST_CALL_ARGS_MISMATCH);

    const verification = replay.verifyDeterminism();
    assert.equal(verification.deterministic, false);
    assert.equal(verification.driftDiagnostics.length > 0, true);
    assert.equal(
      verification.driftDiagnostics[0].reason,
      DRIFT.HOST_CALL_ARGS_MISMATCH,
    );
  });
});

async function buildSnapshotArtifact() {
  const recorder = new SnapshotRecorder();
  await recorder.startSessionCapture({
    sessionId: SESSION_ID,
    moduleRef: MODULE_REF,
    moduleDigest: MODULE_DIGEST,
    lineageId: 'lineage-r',
    stageId: 1,
  });
  await recorder.captureInputFrame({
    sessionId: SESSION_ID,
    frame: {
      codeOffset: 10,
      locals: [{name: 'count', value: 1, type: 'i32'}],
    },
  });
  await recorder.captureInputFrame({
    sessionId: SESSION_ID,
    frame: {
      codeOffset: 20,
      locals: [{name: 'count', value: 2, type: 'i32'}],
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
    label: 'frame0',
    memoryBytes: Buffer.from([1, 2, 3]),
  });
  await recorder.captureMemoryBoundary({
    sessionId: SESSION_ID,
    label: 'frame1',
    memoryBytes: Buffer.from([4, 5, 6]),
  });
  return await recorder.finalizeSnapshot({
    sessionId: SESSION_ID,
    keepInMemory: true,
  });
}

function buildReplayIndex() {
  return buildDwarfIndex({
    moduleRef: MODULE_REF,
    moduleDigest: MODULE_DIGEST,
    rawModuleId: MODULE_REF,
    sourceFiles: [SOURCE_FILE_URL],
    sourceMappings: [
      {
        sourceFileUrl: SOURCE_FILE_URL,
        lineNumber: 5,
        columnNumber: 0,
        startOffset: 10,
        endOffset: 15,
      },
      {
        sourceFileUrl: SOURCE_FILE_URL,
        lineNumber: 6,
        columnNumber: 0,
        startOffset: 20,
        endOffset: 25,
      },
    ],
    symbolMappings: [
      {
        symbolName: 'replayRun',
        startOffset: 10,
        endOffset: 25,
      },
    ],
  });
}

async function sendRequest(dap, seq, command, args) {
  return await dap.handleRequest({
    type: MT.REQUEST,
    seq,
    command,
    arguments: args,
  });
}
