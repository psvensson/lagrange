// @ts-nocheck
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

const SESSION_ID = 'session-service';
const MODULE_REF = 'svc:service-handler@1.0.0';
const SOURCE_FILE_URL = 'file:///src/service-handler.ts';

describe('DapServer service integration', () => {
  it('handles service debug session lifecycle and core DAP requests',
    async () => {
      const outbox = [];
      const runtimeAdapter = {
        async resume(_request) {
          return {status: 'running'};
        },
        async inspect(_request) {
          return {
            stackFrames: [{frameId: 0, codeOffset: 10}],
            localsByFrame: {
              0: [{name: 'rowCount', value: 3, type: 'i32'}],
            },
            memory: Buffer.from([1, 2, 3]),
          };
        },
      };
      const breakpointManager = new BreakpointManager({runtimeAdapter});
      const runtimeIntrospector = new RuntimeIntrospector({runtimeAdapter});
      const index = buildServiceIndex();
      const server = new DapServer({
        breakpointManager,
        runtimeIntrospector,
        sendMessage(_framed, payload) {
          outbox.push(payload);
        },
      });

      const initialize = await sendRequest(server, 1, CMD.INITIALIZE, {});
      assert.equal(initialize.success, true);

      const attach = await sendRequest(server, 2, CMD.ATTACH, {
        sessionId: SESSION_ID,
        moduleRef: MODULE_REF,
        instanceHandle: {instanceId: 'service-inst'},
        index,
      });
      assert.equal(attach.success, true);

      const setBreakpoints = await sendRequest(
        server,
        3,
        CMD.SET_BREAKPOINTS,
        {
          source: {path: SOURCE_FILE_URL},
          breakpoints: [{line: 5}],
        },
      );
      assert.equal(setBreakpoints.success, true);
      assert.equal(setBreakpoints.body.breakpoints.length, 1);
      assert.equal(setBreakpoints.body.breakpoints[0].verified, true);

      const threads = await sendRequest(server, 4, CMD.THREADS, {});
      assert.equal(threads.success, true);
      assert.equal(threads.body.threads.length, 1);

      const stackTrace = await sendRequest(server, 5, CMD.STACK_TRACE, {});
      assert.equal(stackTrace.success, true);
      assert.equal(stackTrace.body.stackFrames.length, 1);
      assert.equal(stackTrace.body.stackFrames[0].source.path, SOURCE_FILE_URL);

      const scopes = await sendRequest(server, 6, CMD.SCOPES, {frameId: 0});
      assert.equal(scopes.success, true);
      const variablesReference = scopes.body.scopes[0].variablesReference;

      const variables = await sendRequest(server, 7, CMD.VARIABLES, {
        variablesReference,
      });
      assert.equal(variables.success, true);
      assert.equal(variables.body.variables.length, 1);
      assert.equal(variables.body.variables[0].name, 'rowCount');
      assert.equal(variables.body.variables[0].value, '3');

      const continueResponse = await sendRequest(server, 8, CMD.CONTINUE, {});
      assert.equal(continueResponse.success, true);

      server.notifyPaused({codeOffset: 10});

      assert.equal(
        outbox.some((payload) => payload.type === MT.EVENT &&
          payload.event === DAP_EVENT.CONTINUED),
        true,
      );
      assert.equal(
        outbox.some((payload) => payload.type === MT.EVENT &&
          payload.event === DAP_EVENT.STOPPED &&
          payload.body.reason === 'breakpoint'),
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

function buildServiceIndex() {
  return buildDwarfIndex({
    moduleRef: MODULE_REF,
    moduleDigest: 'sha256:' + '1'.repeat(64),
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
    ],
    symbolMappings: [
      {
        symbolName: 'handleRequest',
        startOffset: 10,
        endOffset: 15,
      },
    ],
  });
}
