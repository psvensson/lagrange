import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {BreakpointManager} from '../../src/debug-runtime/breakpoint-manager.js';
import {buildDwarfIndex} from '../../src/debug-runtime/dwarf-index-builder.js';
import {
  BREAKPOINT_STEP_ACTION as STEP,
  BREAKPOINT_MANAGER_ERROR_MSG as ERR,
} from '../../src/debug-runtime/breakpoint-manager-constants.js';

const SESSION_A = 'session-a';
const SESSION_B = 'session-b';
const MODULE_REF = 'svc:module-a@1.0.0';
const SOURCE_FILE_URL = 'file:///src/main.ts';

describe('BreakpointManager', () => {
  it('stores breakpoints per session scope', () => {
    const manager = new BreakpointManager();
    const index = createIndex();

    manager.setBreakpoints({
      sessionId: SESSION_A,
      moduleRef: MODULE_REF,
      index,
      sourceFileUrl: SOURCE_FILE_URL,
      breakpoints: [{lineNumber: 11}],
    });
    manager.setBreakpoints({
      sessionId: SESSION_B,
      moduleRef: MODULE_REF,
      index,
      sourceFileUrl: SOURCE_FILE_URL,
      breakpoints: [{lineNumber: 11}],
    });

    const a = manager.getBreakpoints({
      sessionId: SESSION_A,
      moduleRef: MODULE_REF,
    });
    const b = manager.getBreakpoints({
      sessionId: SESSION_B,
      moduleRef: MODULE_REF,
    });

    assert.equal(a.length, 1);
    assert.equal(b.length, 1);
    assert.equal(a[0].sessionId, SESSION_A);
    assert.equal(b[0].sessionId, SESSION_B);
  });

  it('resolves breakpoints to offsets and detects hits', () => {
    const manager = new BreakpointManager();
    const index = createIndex();

    const result = manager.setBreakpoints({
      sessionId: SESSION_A,
      moduleRef: MODULE_REF,
      index,
      sourceFileUrl: SOURCE_FILE_URL,
      breakpoints: [
        {lineNumber: 11},
        {lineNumber: 999},
      ],
    });

    assert.equal(result.breakpoints.length, 2);
    assert.equal(result.breakpoints[0].resolved, true);
    assert.equal(result.breakpoints[1].resolved, false);

    const hit = manager.detectBreakpointHit({
      sessionId: SESSION_A,
      moduleRef: MODULE_REF,
      codeOffset: 10,
    });
    assert.equal(hit.hit, true);
    assert.equal(hit.breakpoints.length, 1);

    const miss = manager.detectBreakpointHit({
      sessionId: SESSION_A,
      moduleRef: MODULE_REF,
      codeOffset: 1000,
    });
    assert.equal(miss.hit, false);
  });

  it('supports continue and step primitives via runtime resume', async () => {
    const resumeCalls = [];
    const manager = new BreakpointManager({
      runtimeAdapter: {
        async resume(payload) {
          resumeCalls.push(payload);
          return {status: 'running'};
        },
      },
    });

    const instanceHandle = {instanceId: 'i-1'};
    const nextResult = await manager.next({
      sessionId: SESSION_A,
      instanceHandle,
    });
    assert.equal(nextResult.action, STEP.NEXT);
    assert.equal(
      manager.getPendingStepAction({sessionId: SESSION_A}),
      STEP.NEXT,
    );

    const pause = manager.handlePause({
      sessionId: SESSION_A,
      moduleRef: MODULE_REF,
      codeOffset: 999,
    });
    assert.equal(pause.reason, 'step');
    assert.equal(pause.stepAction, STEP.NEXT);
    assert.equal(
      manager.getPendingStepAction({sessionId: SESSION_A}),
      null,
    );

    const continueResult = await manager.continueExecution({
      sessionId: SESSION_A,
      instanceHandle,
    });
    assert.equal(continueResult.action, STEP.CONTINUE);
    assert.equal(
      manager.getPendingStepAction({sessionId: SESSION_A}),
      null,
    );
    assert.equal(resumeCalls.length, 2);
  });

  it('validates required request fields', () => {
    const manager = new BreakpointManager();
    assert.throws(
      () => manager.setBreakpoints({}),
      (err) => err.message === ERR.SESSION_ID_REQUIRED,
    );
    assert.throws(
      () => manager.detectBreakpointHit({
        sessionId: SESSION_A,
        moduleRef: MODULE_REF,
        codeOffset: -1,
      }),
      (err) => err.message === ERR.CODE_OFFSET_REQUIRED,
    );
  });
});

function createIndex() {
  return buildDwarfIndex({
    moduleRef: MODULE_REF,
    moduleDigest: 'sha256:' + 'a'.repeat(64),
    rawModuleId: MODULE_REF,
    sourceFiles: [SOURCE_FILE_URL],
    sourceMappings: [
      {
        sourceFileUrl: SOURCE_FILE_URL,
        lineNumber: 11,
        columnNumber: 0,
        startOffset: 8,
        endOffset: 12,
      },
      {
        sourceFileUrl: SOURCE_FILE_URL,
        lineNumber: 12,
        columnNumber: 0,
        startOffset: 13,
        endOffset: 20,
      },
    ],
    symbolMappings: [
      {
        symbolName: 'runMain',
        startOffset: 8,
        endOffset: 20,
      },
    ],
  });
}
