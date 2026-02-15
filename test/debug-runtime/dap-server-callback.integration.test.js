import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {DapServer} from '../../src/debug-runtime/dap-server.js';
import {BreakpointManager} from '../../src/debug-runtime/breakpoint-manager.js';
import {RuntimeIntrospector} from '../../src/debug-runtime/runtime-introspector.js';
import {buildDwarfIndex} from '../../src/debug-runtime/dwarf-index-builder.js';
import {
  DAP_MESSAGE_TYPE as MT,
  DAP_COMMAND as CMD,
  DAP_EVENT,
} from '../../src/debug-runtime/dap-constants.js';

const SESSION_ID = 'session-callback';
const MODULE_REF = 'svc:callback-stage@1.0.0';
const SOURCE_FILE_URL = 'file:///src/callback-stage.ts';

describe('DapServer callback integration', () => {
  it('handles callback-stage stepping flow with launch lifecycle',
    async () => {
      const outbox = [];
      const runtimeAdapter = {
        async resume(_request) {
          return {status: 'running'};
        },
        async inspect(_request) {
          return {
            stackFrames: [{frameId: 0, codeOffset: 30}],
            localsByFrame: {
              0: [{name: 'batchSize', value: 2, type: 'i32'}],
            },
          };
        },
      };
      const breakpointManager = new BreakpointManager({runtimeAdapter});
      const runtimeIntrospector = new RuntimeIntrospector({runtimeAdapter});
      const index = buildCallbackIndex();
      const server = new DapServer({
        breakpointManager,
        runtimeIntrospector,
        sendMessage(_framed, payload) {
          outbox.push(payload);
        },
      });

      const initialize = await sendRequest(server, 1, CMD.INITIALIZE, {});
      assert.equal(initialize.success, true);

      const launch = await sendRequest(server, 2, CMD.LAUNCH, {
        sessionId: SESSION_ID,
        moduleRef: MODULE_REF,
        instanceHandle: {instanceId: 'callback-inst'},
        index,
      });
      assert.equal(launch.success, true);

      const setBreakpoints = await sendRequest(
        server,
        3,
        CMD.SET_BREAKPOINTS,
        {
          source: {path: SOURCE_FILE_URL},
          breakpoints: [{line: 9}],
        },
      );
      assert.equal(setBreakpoints.success, true);
      assert.equal(setBreakpoints.body.breakpoints[0].verified, true);

      const nextResponse = await sendRequest(server, 4, CMD.NEXT, {});
      assert.equal(nextResponse.success, true);
      server.notifyPaused({codeOffset: 999});

      const stepOutResponse = await sendRequest(server, 5, CMD.STEP_OUT, {});
      assert.equal(stepOutResponse.success, true);
      server.notifyPaused({codeOffset: 999});

      const stackTrace = await sendRequest(server, 6, CMD.STACK_TRACE, {});
      assert.equal(stackTrace.success, true);
      assert.equal(stackTrace.body.stackFrames[0].source.path, SOURCE_FILE_URL);

      assert.equal(
        outbox.filter((payload) => payload.type === MT.EVENT &&
          payload.event === DAP_EVENT.CONTINUED).length >= 2,
        true,
      );
      assert.equal(
        outbox.filter((payload) => payload.type === MT.EVENT &&
          payload.event === DAP_EVENT.STOPPED &&
          payload.body.reason === 'step').length >= 2,
        true,
      );
    });
});

async function sendRequest(server, seq, command, args) {
  return await server.handleRequest({
    type: MT.REQUEST,
    seq,
    command,
    arguments: args,
  });
}

function buildCallbackIndex() {
  return buildDwarfIndex({
    moduleRef: MODULE_REF,
    moduleDigest: 'sha256:' + '2'.repeat(64),
    rawModuleId: MODULE_REF,
    sourceFiles: [SOURCE_FILE_URL],
    sourceMappings: [
      {
        sourceFileUrl: SOURCE_FILE_URL,
        lineNumber: 9,
        columnNumber: 0,
        startOffset: 30,
        endOffset: 40,
      },
    ],
    symbolMappings: [
      {
        symbolName: 'onBatch',
        startOffset: 30,
        endOffset: 40,
      },
    ],
  });
}
