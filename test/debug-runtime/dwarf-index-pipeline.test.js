import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  DwarfIndexPipeline,
  buildDwarfIndexCacheKey,
} from '../../src/debug-runtime/dwarf-index-pipeline.js';
import {DwarfIndexCache} from '../../src/debug-runtime/dwarf-index-cache.js';
import {
  DWARF_INDEX_ERROR_MSG as ERR,
} from '../../src/debug-runtime/dwarf-index-constants.js';

const MODULE_REF = 'svc:mod-a@1.0.0';
const MODULE_DIGEST = 'sha256:' + 'a'.repeat(64);
const WASM_BYTES = Buffer.from('0061736d01000000', 'hex');

describe('buildDwarfIndexCacheKey', () => {
  it('builds deterministic key from module identity', () => {
    const key = buildDwarfIndexCacheKey(MODULE_REF, MODULE_DIGEST);
    assert.equal(key, `${MODULE_REF}::${MODULE_DIGEST}`);
  });

  it('rejects invalid module identity', () => {
    assert.throws(
      () => buildDwarfIndexCacheKey('', MODULE_DIGEST),
      (err) => err.message === ERR.MODULE_REF_REQUIRED,
    );
  });
});

describe('DwarfIndexPipeline', () => {
  it('uses parser backend + builder and caches by module identity',
    async () => {
      let parseCalls = 0;
      let buildCalls = 0;

      const pipeline = new DwarfIndexPipeline({
        cache: new DwarfIndexCache({maxEntries: 4}),
        parserBackend: {
          async parseModule(_request) {
            parseCalls += 1;
            return {
              moduleRef: MODULE_REF,
              moduleDigest: MODULE_DIGEST,
              rawModuleId: MODULE_DIGEST,
              sourceFiles: ['file:///src/main.ts'],
              sourceMappings: [
                {
                  sourceFileUrl: 'file:///src/main.ts',
                  lineNumber: 1,
                  columnNumber: 0,
                  startOffset: 8,
                  endOffset: 9,
                },
              ],
              symbolMappings: [
                {
                  symbolName: 'run',
                  startOffset: 8,
                  endOffset: 9,
                },
              ],
            };
          },
        },
        buildIndex(parseResult) {
          buildCalls += 1;
          return {parseResult, built: true};
        },
      });

      const request = {
        moduleRef: MODULE_REF,
        moduleDigest: MODULE_DIGEST,
        wasmBytes: WASM_BYTES,
      };

      const first = await pipeline.getModuleIndex(request);
      const second = await pipeline.getModuleIndex(request);

      assert.equal(first.built, true);
      assert.equal(second.built, true);
      assert.equal(parseCalls, 1);
      assert.equal(buildCalls, 1);
    });

  it('supports cache inspection and eviction', async () => {
    const pipeline = new DwarfIndexPipeline({
      parserBackend: {
        async parseModule() {
          return {
            moduleRef: MODULE_REF,
            moduleDigest: MODULE_DIGEST,
            rawModuleId: MODULE_DIGEST,
            sourceFiles: [],
            sourceMappings: [],
            symbolMappings: [],
          };
        },
      },
      buildIndex(parseResult) {
        return {parseResult};
      },
    });

    const request = {
      moduleRef: MODULE_REF,
      moduleDigest: MODULE_DIGEST,
      wasmBytes: WASM_BYTES,
    };
    await pipeline.getModuleIndex(request);
    const cached = pipeline.getCachedModuleIndex({
      moduleRef: MODULE_REF,
      moduleDigest: MODULE_DIGEST,
    });
    assert.notEqual(cached, null);

    const evicted = pipeline.evictModuleIndex({
      moduleRef: MODULE_REF,
      moduleDigest: MODULE_DIGEST,
    });
    assert.equal(evicted, true);
    const afterEvict = pipeline.getCachedModuleIndex({
      moduleRef: MODULE_REF,
      moduleDigest: MODULE_DIGEST,
    });
    assert.equal(afterEvict, null);
  });
});
