// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {DebugCoordinator} from '../../src/debug-runtime/debug-coordinator.js';
import {DapServer} from '../../src/debug-runtime/dap-server.js';
import {BreakpointManager} from '../../src/debug-runtime/breakpoint-manager.js';
import {RuntimeIntrospector} from '../../src/debug-runtime/runtime-introspector.js';
import {SnapshotRecorder} from '../../src/debug-runtime/snapshot-recorder.js';
import {ReplayRuntime} from '../../src/debug-runtime/replay-runtime.js';
import {buildDwarfIndex} from '../../src/debug-runtime/dwarf-index-builder.js';
import {
  DAP_MESSAGE_TYPE as MT,
  DAP_COMMAND as CMD,
} from '../../src/debug-runtime/dap-constants.js';
import {
  DEBUG_METADATA_TABLE as DT,
  DEBUG_SESSION_FIELD as DSF,
} from '../../src/debug-runtime/debug-metadata-constants.js';

const SESSION_ID = 'session-distributed-e2e';
const LINEAGE_ID = 'lineage-distributed-e2e';
const ENDPOINT_A = 'ws://node-a/debug';
const ENDPOINT_B = 'ws://node-b/debug';
const MODULE_A = 'svc:service-handler@1.0.0';
const MODULE_B = 'svc:callback-stage@1.0.0';
const SOURCE_A = 'file:///src/service.ts';
const SOURCE_B = 'file:///src/callback.ts';

describe('Distributed debug end-to-end scenario', () => {
  it('breakpoints on service stage and auto-handoffs to callback stage',
    async () => {
      const cdc = new EventEmitter();
      const coordinator = new DebugCoordinator();
      coordinator.bindCdcIntegrationService(cdc);

      const endpointRegistry = new Map();
      endpointRegistry.set(ENDPOINT_A, createEndpointRuntime({
        moduleRef: MODULE_A,
        sourceFileUrl: SOURCE_A,
        lineNumber: 5,
        codeOffset: 10,
        locals: [{name: 'rowCount', value: 3, type: 'i32'}],
      }));
      endpointRegistry.set(ENDPOINT_B, createEndpointRuntime({
        moduleRef: MODULE_B,
        sourceFileUrl: SOURCE_B,
        lineNumber: 9,
        codeOffset: 30,
        locals: [{name: 'batchSize', value: 2, type: 'i32'}],
      }));

      const client = new AutoHandoffDebugClient({
        coordinator,
        endpointRegistry,
        lineageId: LINEAGE_ID,
        sessionId: SESSION_ID,
      });

      cdc.emit('upsert', {
        tableName: DT.SESSIONS,
        data: {
          [DSF.SESSION_ID]: SESSION_ID,
          [DSF.LINEAGE_ID]: LINEAGE_ID,
          [DSF.STAGE_ID]: 1,
          [DSF.ENDPOINT]: ENDPOINT_A,
          [DSF.NODE_ID]: 'node-a',
          [DSF.UPDATED_AT]: 10,
        },
      });

      const setServiceBreakpoints = await client.request(CMD.SET_BREAKPOINTS, {
        source: {path: SOURCE_A},
        breakpoints: [{line: 5}],
      });
      assert.equal(setServiceBreakpoints.success, true);
      assert.equal(
        setServiceBreakpoints.body.breakpoints[0].verified,
        true,
      );
      endpointRegistry.get(ENDPOINT_A).server.notifyPaused({codeOffset: 10});

      const serviceVariables = await client.readTopFrameVariables();
      assert.equal(serviceVariables[0].name, 'rowCount');
      assert.equal(serviceVariables[0].value, '3');

      cdc.emit('upsert', {
        tableName: DT.SESSIONS,
        data: {
          [DSF.SESSION_ID]: SESSION_ID,
          [DSF.LINEAGE_ID]: LINEAGE_ID,
          [DSF.STAGE_ID]: 2,
          [DSF.ENDPOINT]: ENDPOINT_B,
          [DSF.NODE_ID]: 'node-b',
          [DSF.UPDATED_AT]: 20,
        },
      });

      const continueOnHandoff = await client.request(CMD.CONTINUE, {});
      assert.equal(continueOnHandoff.success, true);

      const setCallbackBreakpoints = await client.request(CMD.SET_BREAKPOINTS, {
        source: {path: SOURCE_B},
        breakpoints: [{line: 9}],
      });
      assert.equal(setCallbackBreakpoints.success, true);
      endpointRegistry.get(ENDPOINT_B).server.notifyPaused({codeOffset: 30});

      const callbackVariables = await client.readTopFrameVariables();
      assert.equal(callbackVariables[0].name, 'batchSize');
      assert.equal(callbackVariables[0].value, '2');

      assert.equal(client.handoffCount >= 1, true);
      assert.equal(client.getAttachCount(ENDPOINT_A), 1);
      assert.equal(client.getAttachCount(ENDPOINT_B), 1);
      assert.equal(endpointRegistry.get(ENDPOINT_A).requestCount > 0, true);
      assert.equal(endpointRegistry.get(ENDPOINT_B).requestCount > 0, true);
    });
});

describe('Snapshot/replay end-to-end scenario', () => {
  it('captures distributed execution then replays locally with DAP stepping',
    async () => {
      const recorder = new SnapshotRecorder();
      await recorder.startSessionCapture({
        sessionId: SESSION_ID,
        moduleRef: MODULE_A,
        moduleDigest: 'sha256:' + 'a'.repeat(64),
        lineageId: LINEAGE_ID,
        stageId: 1,
        tenantId: 'tenant-a',
        serviceName: 'svc-debug',
      });
      await recorder.captureInputFrame({
        sessionId: SESSION_ID,
        frame: {
          codeOffset: 10,
          locals: [{name: 'stage', value: 'service', type: 'string'}],
        },
      });
      await recorder.captureInputFrame({
        sessionId: SESSION_ID,
        frame: {
          codeOffset: 20,
          locals: [{name: 'stage', value: 'callback', type: 'string'}],
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
        label: 'service',
        memoryBytes: Buffer.from([1, 2, 3]),
      });
      await recorder.captureMemoryBoundary({
        sessionId: SESSION_ID,
        label: 'callback',
        memoryBytes: Buffer.from([4, 5, 6]),
      });

      const artifact = await recorder.finalizeSnapshot({
        sessionId: SESSION_ID,
        keepInMemory: true,
      });

      const replay = new ReplayRuntime({now: () => 1700000000000});
      const loaded = replay.loadSnapshot(artifact);
      const runtimeAdapter = replay.createRuntimeAdapter();
      const index = buildDwarfIndex({
        moduleRef: MODULE_A,
        moduleDigest: 'sha256:' + 'a'.repeat(64),
        rawModuleId: MODULE_A,
        sourceFiles: [SOURCE_A],
        sourceMappings: [
          {
            sourceFileUrl: SOURCE_A,
            lineNumber: 5,
            columnNumber: 0,
            startOffset: 10,
            endOffset: 15,
          },
          {
            sourceFileUrl: SOURCE_A,
            lineNumber: 6,
            columnNumber: 0,
            startOffset: 20,
            endOffset: 25,
          },
        ],
        symbolMappings: [{symbolName: 'run', startOffset: 10, endOffset: 25}],
      });

      const breakpointManager = new BreakpointManager({runtimeAdapter});
      const runtimeIntrospector = new RuntimeIntrospector({runtimeAdapter});
      const dap = new DapServer({
        breakpointManager,
        runtimeIntrospector,
        sendMessage(_framed, _payload) {},
      });

      await sendRequest(dap, 1, CMD.INITIALIZE, {});
      await sendRequest(dap, 2, CMD.ATTACH, {
        sessionId: SESSION_ID,
        moduleRef: MODULE_A,
        instanceHandle: loaded.instanceHandle,
        index,
      });
      await sendRequest(dap, 3, CMD.SET_BREAKPOINTS, {
        source: {path: SOURCE_A},
        breakpoints: [{line: 5}, {line: 6}],
      });

      const beforeStepVariables = await readVariables(dap);
      assert.equal(beforeStepVariables[0].name, 'stage');
      assert.equal(beforeStepVariables[0].value, 'service');

      await sendRequest(dap, 4, CMD.NEXT, {});
      dap.notifyPaused({codeOffset: 20});

      const afterStepVariables = await readVariables(dap);
      assert.equal(afterStepVariables[0].name, 'stage');
      assert.equal(afterStepVariables[0].value, 'callback');

      const replayHostCall = replay.replayHostCall({
        namespace: 'db',
        functionName: 'query',
        args: ['SELECT 1'],
      });
      assert.equal(replayHostCall.ok, true);
      assert.deepEqual(replayHostCall.result, [{value: 1}]);

      const deterministic = replay.verifyDeterminism();
      assert.equal(deterministic.deterministic, true);
      assert.equal(deterministic.driftDiagnostics.length, 0);
    });
});

function createEndpointRuntime(request) {
  const runtimeAdapter = {
    async resume(_resumeRequest) {
      return {status: 'running'};
    },
    async inspect(_inspectRequest) {
      return {
        stackFrames: [{frameId: 0, codeOffset: request.codeOffset}],
        localsByFrame: {
          0: request.locals,
        },
        memory: Buffer.from([1, 2, 3]),
      };
    },
  };

  const index = buildDwarfIndex({
    moduleRef: request.moduleRef,
    moduleDigest: 'sha256:' + '1'.repeat(64),
    rawModuleId: request.moduleRef,
    sourceFiles: [request.sourceFileUrl],
    sourceMappings: [
      {
        sourceFileUrl: request.sourceFileUrl,
        lineNumber: request.lineNumber,
        columnNumber: 0,
        startOffset: request.codeOffset,
        endOffset: request.codeOffset + 5,
      },
    ],
    symbolMappings: [
      {
        symbolName: 'run',
        startOffset: request.codeOffset,
        endOffset: request.codeOffset + 5,
      },
    ],
  });

  const breakpointManager = new BreakpointManager({runtimeAdapter});
  const runtimeIntrospector = new RuntimeIntrospector({runtimeAdapter});
  const outbox = [];
  const server = new DapServer({
    breakpointManager,
    runtimeIntrospector,
    sendMessage(_framed, payload) {
      outbox.push(payload);
    },
  });

  return {
    server,
    outbox,
    moduleRef: request.moduleRef,
    sourceFileUrl: request.sourceFileUrl,
    index,
    instanceHandle: {instanceId: `${request.moduleRef}:inst`},
    requestCount: 0,
  };
}

class AutoHandoffDebugClient {
  constructor(options) {
    this.coordinator = options.coordinator;
    this.endpointRegistry = options.endpointRegistry;
    this.lineageId = options.lineageId;
    this.sessionId = options.sessionId;
    this.currentEndpoint = null;
    this.sequence = 1;
    this.initializedEndpoints = new Set();
    this.attachedEndpoints = new Set();
    this.attachCountByEndpoint = new Map();
    this.handoffCount = 0;

    const existing = this.coordinator.getCurrentEndpoint({
      lineageId: this.lineageId,
    });
    this.currentEndpoint = existing ? existing.endpoint : null;
    this.unsubscribe = this.coordinator.subscribeLineage(
      this.lineageId,
      (event) => {
        this.currentEndpoint = event.current.endpoint;
        this.handoffCount += 1;
      },
    );
  }

  getAttachCount(endpoint) {
    return this.attachCountByEndpoint.get(endpoint) || 0;
  }

  async request(command, args) {
    const endpoint = this.currentEndpoint;
    if (!endpoint) {
      throw new Error('No debug endpoint available for lineage');
    }
    const descriptor = this.endpointRegistry.get(endpoint);
    if (!descriptor) {
      throw new Error('No endpoint descriptor registered for handoff endpoint');
    }

    await this.ensureServerReady(endpoint, descriptor);
    descriptor.requestCount += 1;

    return await descriptor.server.handleRequest({
      type: MT.REQUEST,
      seq: this.sequence++,
      command,
      arguments: args,
    });
  }

  async readTopFrameVariables() {
    const stackTrace = await this.request(CMD.STACK_TRACE, {});
    const frameId = stackTrace.body.stackFrames[0].id;
    const scopes = await this.request(CMD.SCOPES, {frameId});
    const reference = scopes.body.scopes[0].variablesReference;
    const variables = await this.request(CMD.VARIABLES, {
      variablesReference: reference,
    });
    return variables.body.variables;
  }

  async ensureServerReady(endpoint, descriptor) {
    if (!this.initializedEndpoints.has(endpoint)) {
      await descriptor.server.handleRequest({
        type: MT.REQUEST,
        seq: this.sequence++,
        command: CMD.INITIALIZE,
        arguments: {},
      });
      this.initializedEndpoints.add(endpoint);
    }

    if (!this.attachedEndpoints.has(endpoint)) {
      await descriptor.server.handleRequest({
        type: MT.REQUEST,
        seq: this.sequence++,
        command: CMD.ATTACH,
        arguments: {
          sessionId: this.sessionId,
          moduleRef: descriptor.moduleRef,
          instanceHandle: descriptor.instanceHandle,
          index: descriptor.index,
        },
      });
      this.attachedEndpoints.add(endpoint);
      this.attachCountByEndpoint.set(endpoint, this.getAttachCount(endpoint) + 1);
    }
  }
}

async function sendRequest(dap, seq, command, args) {
  return await dap.handleRequest({
    type: MT.REQUEST,
    seq,
    command,
    arguments: args,
  });
}

async function readVariables(dap) {
  const stack = await sendRequest(dap, 100, CMD.STACK_TRACE, {});
  const frameId = stack.body.stackFrames[0].id;
  const scopes = await sendRequest(dap, 101, CMD.SCOPES, {frameId});
  const variablesReference = scopes.body.scopes[0].variablesReference;
  const vars = await sendRequest(dap, 102, CMD.VARIABLES, {
    variablesReference,
  });
  return vars.body.variables;
}
