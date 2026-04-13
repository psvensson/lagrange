// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  DapMessageFramer,
  DapServer,
  encodeDapProtocolMessage,
} from '../../src/debug-runtime/dap-server.js';
import {
  DAP_MESSAGE_TYPE as MT,
  DAP_COMMAND as CMD,
  DAP_EVENT,
  DAP_ERROR_MSG as ERR,
} from '../../src/debug-runtime/dap-constants.js';

describe('DapMessageFramer', () => {
  it('parses complete message across chunk boundaries', () => {
    const framer = new DapMessageFramer();
    const payload = {
      type: MT.REQUEST,
      seq: 1,
      command: CMD.INITIALIZE,
      arguments: {},
    };
    const framed = encodeDapProtocolMessage(payload);
    const firstPart = framed.slice(0, 10);
    const secondPart = framed.slice(10);

    const firstMessages = framer.push(firstPart);
    assert.deepEqual(firstMessages, []);

    const secondMessages = framer.push(secondPart);
    assert.equal(secondMessages.length, 1);
    assert.deepEqual(secondMessages[0], payload);
  });
});

describe('DapServer lifecycle', () => {
  it('rejects requests before initialize and then accepts after attach',
    async () => {
      const outbox = [];
      const server = new DapServer({
        breakpointManager: createNoopBreakpointManager(),
        runtimeIntrospector: createNoopRuntimeIntrospector(),
        sendMessage(_framed, payload) {
          outbox.push(payload);
        },
      });

      const beforeInit = await server.handleRequest({
        type: MT.REQUEST,
        seq: 1,
        command: CMD.THREADS,
        arguments: {},
      });
      assert.equal(beforeInit.success, false);
      assert.equal(beforeInit.message, ERR.INITIALIZE_REQUIRED);

      const init = await server.handleRequest({
        type: MT.REQUEST,
        seq: 2,
        command: CMD.INITIALIZE,
        arguments: {},
      });
      assert.equal(init.success, true);
      assert.equal(
        outbox.some((msg) => msg.type === MT.EVENT &&
          msg.event === DAP_EVENT.INITIALIZED),
        true,
      );

      const attach = await server.handleRequest({
        type: MT.REQUEST,
        seq: 3,
        command: CMD.ATTACH,
        arguments: {
          sessionId: 'session-1',
          moduleRef: 'svc:mod@1',
          instanceHandle: {instanceId: 'inst-1'},
          index: {id: 'index'},
        },
      });
      assert.equal(attach.success, true);

      const threads = await server.handleRequest({
        type: MT.REQUEST,
        seq: 4,
        command: CMD.THREADS,
        arguments: {},
      });
      assert.equal(threads.success, true);
      assert.equal(threads.body.threads.length, 1);
    });
});

function createNoopBreakpointManager() {
  return {
    setBreakpoints() {
      return {breakpoints: []};
    },
    async continueExecution() {
      return {};
    },
    async next() {
      return {};
    },
    async stepIn() {
      return {};
    },
    async stepOut() {
      return {};
    },
    handlePause() {
      return {reason: 'pause', hitBreakpoints: [], stepAction: null};
    },
  };
}

function createNoopRuntimeIntrospector() {
  return {
    async listStackFrames() {
      return {frames: []};
    },
    async listLocals() {
      return {frameId: 0, variables: []};
    },
  };
}
