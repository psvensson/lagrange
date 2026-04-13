// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  VscodeDwarfParserBackend,
  validateDwarfModuleRequest,
  normalizeWasmBytesToArrayBuffer,
  normalizeSourceFiles,
  normalizeMappedLines,
} from '../../src/debug-runtime/vscode-dwarf-parser-backend.js';
import {
  DWARF_INDEX_ERROR_MSG as ERR,
} from '../../src/debug-runtime/dwarf-index-constants.js';

const MODULE_REF = 'svc:module-a@1.0.0';
const MODULE_DIGEST = 'sha256:' + 'a'.repeat(64);
const WASM_BYTES = Buffer.from('0061736d01000000', 'hex');

describe('validateDwarfModuleRequest', () => {
  it('rejects missing request shape', () => {
    assert.throws(
      () => validateDwarfModuleRequest(null),
      (err) => err.message === ERR.REQUEST_REQUIRED,
    );
  });

  it('rejects invalid wasm bytes type', () => {
    assert.throws(
      () => validateDwarfModuleRequest({
        moduleRef: MODULE_REF,
        moduleDigest: MODULE_DIGEST,
        wasmBytes: 'not-bytes',
      }),
      (err) => err.message === ERR.WASM_BYTES_REQUIRED,
    );
  });
});

describe('normalize helpers', () => {
  it('normalizes Buffer into detached ArrayBuffer', () => {
    const arrayBuffer = normalizeWasmBytesToArrayBuffer(WASM_BYTES);
    assert.equal(arrayBuffer instanceof ArrayBuffer, true);
    assert.equal(arrayBuffer.byteLength, WASM_BYTES.byteLength);
  });

  it('normalizes source files with dedupe', () => {
    const result = normalizeSourceFiles([
      'file:///a.ts',
      'file:///a.ts',
      '',
      'file:///b.ts',
    ]);
    assert.deepEqual(result, ['file:///a.ts', 'file:///b.ts']);
  });

  it('normalizes mapped lines and drops invalid entries', () => {
    const result = normalizeMappedLines([
      7,
      7,
      -1,
      12,
      Number.NaN,
    ]);
    assert.deepEqual(result, [7, 12]);
  });
});

describe('VscodeDwarfParserBackend', () => {
  it('collects normalized source and symbol mappings from worker API',
    async () => {
      const calls = [];
      const backend = new VscodeDwarfParserBackend({
        spawnWorker: createMockSpawn(calls, {
          hello: async () => undefined,
          addRawModule: async () => ['file:///src/main.ts'],
          getMappedLines: async () => [11],
          sourceLocationToRawLocation: async () => ([
            {startOffset: 16, endOffset: 31},
          ]),
          getFunctionInfo: async () => ({
            frames: [{name: 'runMain'}],
          }),
        }),
      });

      const result = await backend.parseModule({
        moduleRef: MODULE_REF,
        moduleDigest: MODULE_DIGEST,
        wasmBytes: WASM_BYTES,
      });

      assert.equal(result.moduleRef, MODULE_REF);
      assert.equal(result.moduleDigest, MODULE_DIGEST);
      assert.equal(result.sourceFiles.length, 1);
      assert.equal(result.sourceMappings.length, 1);
      assert.equal(result.symbolMappings.length, 1);
      assert.deepEqual(result.sourceMappings[0], {
        sourceFileUrl: 'file:///src/main.ts',
        lineNumber: 11,
        columnNumber: 0,
        startOffset: 16,
        endOffset: 31,
      });
      assert.deepEqual(result.symbolMappings[0], {
        symbolName: 'runMain',
        startOffset: 16,
        endOffset: 31,
      });

      assert.deepEqual(calls.map((call) => call.method), [
        'hello',
        'addRawModule',
        'getMappedLines',
        'sourceLocationToRawLocation',
        'getFunctionInfo',
        'dispose',
      ]);
    });

  it('throws explicit error when parser reports missing symbol files',
    async () => {
      const backend = new VscodeDwarfParserBackend({
        spawnWorker: createMockSpawn([], {
          hello: async () => undefined,
          addRawModule: async () => ({
            missingSymbolFiles: ['module.debug.wasm'],
          }),
        }),
      });

      await assert.rejects(
        () => backend.parseModule({
          moduleRef: MODULE_REF,
          moduleDigest: MODULE_DIGEST,
          wasmBytes: WASM_BYTES,
        }),
        (err) => err.message.includes(ERR.PARSER_MISSING_SYMBOLS),
      );
    });

  it('returns empty mappings when module has no source files', async () => {
    const backend = new VscodeDwarfParserBackend({
      spawnWorker: createMockSpawn([], {
        hello: async () => undefined,
        addRawModule: async () => [],
      }),
    });

    const result = await backend.parseModule({
      moduleRef: MODULE_REF,
      moduleDigest: MODULE_DIGEST,
      wasmBytes: WASM_BYTES,
    });

    assert.deepEqual(result.sourceFiles, []);
    assert.deepEqual(result.sourceMappings, []);
    assert.deepEqual(result.symbolMappings, []);
  });
});

/**
 * Build a spawnWorker stub with deterministic sendMessage handlers.
 *
 * @param {Array<Object>} calls - Mutable call list.
 * @param {Object<string, Function>} handlers - Method handlers.
 * @return {Function} spawnWorker function.
 */
function createMockSpawn(calls, handlers) {
  return function spawnWorker() {
    return {
      rpc: {
        async sendMessage(method, ...args) {
          calls.push({method, args});
          const handler = handlers[method];
          if (!handler) {
            throw new Error(`Unexpected worker method: ${method}`);
          }
          return await handler(...args);
        },
      },
      async dispose() {
        calls.push({method: 'dispose', args: []});
      },
    };
  };
}
