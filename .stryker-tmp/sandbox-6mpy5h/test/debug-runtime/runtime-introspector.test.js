// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {RuntimeIntrospector} from '../../src/debug-runtime/runtime-introspector.js';
import {buildDwarfIndex} from '../../src/debug-runtime/dwarf-index-builder.js';
import {
  RUNTIME_INTROSPECTOR_ERROR_MSG as ERR,
} from '../../src/debug-runtime/runtime-introspector-constants.js';

const MODULE_REF = 'svc:module-introspect@1.0.0';
const SOURCE_FILE_URL = 'file:///src/introspect.ts';
const INSTANCE_HANDLE = {instanceId: 'inst-introspect'};

describe('RuntimeIntrospector', () => {
  it('enumerates stack frames with DWARF source and symbols', async () => {
    const introspector = new RuntimeIntrospector({
      runtimeAdapter: {
        async inspect() {
          return {
            stackFrames: [
              {frameId: 0, codeOffset: 9},
              {frameId: 1, codeOffset: 80},
            ],
          };
        },
      },
    });
    const index = createIndex();

    const result = await introspector.listStackFrames({
      instanceHandle: INSTANCE_HANDLE,
      index,
    });

    assert.equal(result.frames.length, 2);
    assert.equal(result.frames[0].frameId, 0);
    assert.equal(result.frames[0].source.sourceFileUrl, SOURCE_FILE_URL);
    assert.deepEqual(result.frames[0].symbols, ['run']);
    assert.equal(result.frames[1].source, null);
  });

  it('maps locals through frame DWARF source context', async () => {
    const introspector = new RuntimeIntrospector({
      runtimeAdapter: {
        async inspect() {
          return {
            stackFrames: [{frameId: 2, codeOffset: 10}],
            localsByFrame: {
              2: [
                {name: 'count', value: 7, type: 'i32'},
                {value: 'x'},
              ],
            },
          };
        },
      },
    });
    const index = createIndex();

    const result = await introspector.listLocals({
      instanceHandle: INSTANCE_HANDLE,
      index,
      frameId: 2,
      maxVariables: 2,
    });

    assert.equal(result.frameId, 2);
    assert.equal(result.variables.length, 2);
    assert.equal(result.variables[0].name, 'count');
    assert.equal(result.variables[0].source.sourceFileUrl, SOURCE_FILE_URL);
    assert.equal(result.variables[1].name, 'local_1');
  });

  it('reads bounded memory slices', async () => {
    const introspector = new RuntimeIntrospector({
      runtimeAdapter: {
        async inspect() {
          return {
            memory: Buffer.from([1, 2, 3, 4, 5]),
          };
        },
      },
      maxMemoryReadBytes: 4,
    });
    const index = createIndex();

    const read = await introspector.readMemory({
      instanceHandle: INSTANCE_HANDLE,
      index,
      offset: 1,
      length: 3,
    });

    assert.equal(read.offset, 1);
    assert.equal(read.length, 3);
    assert.deepEqual([...read.bytes], [2, 3, 4]);

    await assert.rejects(
      () => introspector.readMemory({
        instanceHandle: INSTANCE_HANDLE,
        index,
        offset: 0,
        length: 5,
      }),
      (err) => err.message === ERR.MEMORY_READ_LIMIT_EXCEEDED,
    );
  });

  it('enforces request limits and timeout safety', async () => {
    const introspector = new RuntimeIntrospector({
      runtimeAdapter: {
        async inspect() {
          return await new Promise(() => {});
        },
      },
      maxVariablesPerScope: 1,
      requestTimeoutMs: 1,
      setTimeoutFn(callback, _timeoutMs) {
        callback();
        return 1;
      },
      clearTimeoutFn(_timeoutId) {},
    });
    const index = createIndex();

    await assert.rejects(
      () => introspector.listLocals({
        instanceHandle: INSTANCE_HANDLE,
        index,
        frameId: 0,
        maxVariables: 2,
      }),
      (err) => err.message === ERR.VARIABLES_LIMIT_EXCEEDED,
    );

    await assert.rejects(
      () => introspector.listStackFrames({
        instanceHandle: INSTANCE_HANDLE,
        index,
      }),
      (err) => err.message === ERR.INSPECT_TIMEOUT,
    );
  });
});

function createIndex() {
  return buildDwarfIndex({
    moduleRef: MODULE_REF,
    moduleDigest: 'sha256:' + 'f'.repeat(64),
    rawModuleId: MODULE_REF,
    sourceFiles: [SOURCE_FILE_URL],
    sourceMappings: [
      {
        sourceFileUrl: SOURCE_FILE_URL,
        lineNumber: 30,
        columnNumber: 0,
        startOffset: 8,
        endOffset: 20,
      },
    ],
    symbolMappings: [
      {
        symbolName: 'run',
        startOffset: 8,
        endOffset: 20,
      },
    ],
  });
}
