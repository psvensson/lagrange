import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {BreakpointManager} from '../../src/debug-runtime/breakpoint-manager.js';
import {buildDwarfIndex} from '../../src/debug-runtime/dwarf-index-builder.js';
import {
  BREAKPOINT_STEP_ACTION as STEP,
} from '../../src/debug-runtime/breakpoint-manager-constants.js';

const SESSION_ID = 'session-integration';
const MODULE_REF = 'svc:module-b@1.0.0';
const SOURCE_FILE_URL = 'file:///src/integration.ts';

describe('BreakpointManager lifecycle integration', () => {
  it('runs a full breakpoint and step lifecycle for one session',
    async () => {
      const resumeCalls = [];
      const manager = new BreakpointManager({
        runtimeAdapter: {
          async resume(payload) {
            resumeCalls.push(payload);
            return {status: 'running'};
          },
        },
      });
      const index = buildIntegrationIndex();
      const instanceHandle = {instanceId: 'inst-1'};

      const setResult = manager.setBreakpoints({
        sessionId: SESSION_ID,
        moduleRef: MODULE_REF,
        index,
        sourceFileUrl: SOURCE_FILE_URL,
        breakpoints: [
          {lineNumber: 20},
          {lineNumber: 21},
        ],
      });
      assert.equal(setResult.breakpoints.length, 2);
      assert.equal(setResult.breakpoints.every((bp) => bp.resolved), true);

      const firstHit = manager.handlePause({
        sessionId: SESSION_ID,
        moduleRef: MODULE_REF,
        codeOffset: 40,
      });
      assert.equal(firstHit.reason, 'breakpoint');
      assert.equal(firstHit.hitBreakpoints.length, 1);
      assert.equal(firstHit.hitBreakpoints[0].lineNumber, 20);
      assert.equal(firstHit.hitBreakpoints[0].hitCount, 1);

      const secondHit = manager.handlePause({
        sessionId: SESSION_ID,
        moduleRef: MODULE_REF,
        codeOffset: 40,
      });
      assert.equal(secondHit.reason, 'breakpoint');
      assert.equal(secondHit.hitBreakpoints[0].hitCount, 2);

      const stepInResult = await manager.stepIn({
        sessionId: SESSION_ID,
        instanceHandle,
      });
      assert.equal(stepInResult.action, STEP.STEP_IN);
      assert.equal(
        manager.getPendingStepAction({sessionId: SESSION_ID}),
        STEP.STEP_IN,
      );

      const stepPause = manager.handlePause({
        sessionId: SESSION_ID,
        moduleRef: MODULE_REF,
        codeOffset: 999,
      });
      assert.equal(stepPause.reason, 'step');
      assert.equal(stepPause.stepAction, STEP.STEP_IN);
      assert.equal(
        manager.getPendingStepAction({sessionId: SESSION_ID}),
        null,
      );

      const continueResult = await manager.continueExecution({
        sessionId: SESSION_ID,
        instanceHandle,
      });
      assert.equal(continueResult.action, STEP.CONTINUE);
      assert.equal(resumeCalls.length, 2);

      const cleared = manager.clearSession({sessionId: SESSION_ID});
      assert.equal(cleared, true);
      const afterClear = manager.getBreakpoints({
        sessionId: SESSION_ID,
        moduleRef: MODULE_REF,
      });
      assert.deepEqual(afterClear, []);
    });
});

function buildIntegrationIndex() {
  return buildDwarfIndex({
    moduleRef: MODULE_REF,
    moduleDigest: 'sha256:' + 'd'.repeat(64),
    rawModuleId: MODULE_REF,
    sourceFiles: [SOURCE_FILE_URL],
    sourceMappings: [
      {
        sourceFileUrl: SOURCE_FILE_URL,
        lineNumber: 20,
        columnNumber: 0,
        startOffset: 40,
        endOffset: 45,
      },
      {
        sourceFileUrl: SOURCE_FILE_URL,
        lineNumber: 21,
        columnNumber: 0,
        startOffset: 46,
        endOffset: 55,
      },
    ],
    symbolMappings: [
      {
        symbolName: 'runPipeline',
        startOffset: 40,
        endOffset: 55,
      },
    ],
  });
}
