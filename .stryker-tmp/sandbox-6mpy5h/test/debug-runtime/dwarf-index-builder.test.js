// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  buildDwarfIndex,
  lookupOffsetsForSource,
  lookupSourceForOffset,
  lookupSymbolsForOffset,
  lookupSymbolRangesByName,
} from '../../src/debug-runtime/dwarf-index-builder.js';
import {
  DWARF_INDEX_ERROR_MSG as ERR,
} from '../../src/debug-runtime/dwarf-index-constants.js';

describe('buildDwarfIndex', () => {
  it('builds source, offset, and symbol indexes', () => {
    const index = buildDwarfIndex({
      moduleRef: 'mod-a',
      moduleDigest: 'sha256:' + 'a'.repeat(64),
      rawModuleId: 'raw-a',
      sourceFiles: ['file:///src/a.ts'],
      sourceMappings: [
        {
          sourceFileUrl: 'file:///src/a.ts',
          lineNumber: 10,
          columnNumber: 0,
          startOffset: 12,
          endOffset: 24,
        },
      ],
      symbolMappings: [
        {
          symbolName: 'handle',
          startOffset: 12,
          endOffset: 24,
        },
      ],
    }, {now: () => 1700000000000});

    assert.equal(index.createdAt, 1700000000000);
    assert.equal(index.sourceFiles.length, 1);
    assert.equal(index.sourceMappings.length, 1);
    assert.equal(index.symbolMappings.length, 1);
  });

  it('rejects invalid parse result shape', () => {
    assert.throws(
      () => buildDwarfIndex(null),
      (err) => err.message === ERR.PARSE_RESULT_REQUIRED,
    );
    assert.throws(
      () => buildDwarfIndex({sourceMappings: [], symbolMappings: null}),
      (err) => err.message === ERR.SYMBOL_MAPPINGS_REQUIRED,
    );
  });
});

describe('lookup helpers', () => {
  it('looks up offsets by source line', () => {
    const index = createSampleIndex();
    const ranges = lookupOffsetsForSource(index, 'file:///src/main.ts', 11);
    assert.equal(ranges.length, 1);
    assert.equal(ranges[0].startOffset, 8);
  });

  it('looks up source mapping by code offset', () => {
    const index = createSampleIndex();
    const mapping = lookupSourceForOffset(index, 9);
    assert.notEqual(mapping, null);
    assert.equal(mapping.sourceFileUrl, 'file:///src/main.ts');
    assert.equal(mapping.lineNumber, 11);
  });

  it('looks up symbols by offset and symbol ranges by name', () => {
    const index = createSampleIndex();
    const names = lookupSymbolsForOffset(index, 9);
    assert.deepEqual(names, ['runMain']);
    const ranges = lookupSymbolRangesByName(index, 'runMain');
    assert.equal(ranges.length, 1);
    assert.equal(ranges[0].startOffset, 8);
  });

  it('throws on invalid lookup arguments', () => {
    const index = createSampleIndex();
    assert.throws(
      () => lookupOffsetsForSource(index, '', 1),
      (err) => err.message === ERR.SOURCE_FILE_URL_REQUIRED,
    );
    assert.throws(
      () => lookupSourceForOffset(index, -1),
      (err) => err.message === ERR.CODE_OFFSET_REQUIRED,
    );
  });
});

describe('mapping invariants property tests', () => {
  it('maintains source<->offset and symbol lookup invariants', () => {
    fc.assert(
      fc.property(mappingFixtureArbitrary(), (fixture) => {
        const index = buildDwarfIndex({
          moduleRef: 'mod-prop',
          moduleDigest: 'sha256:' + 'b'.repeat(64),
          rawModuleId: 'raw-prop',
          sourceFiles: fixture.sourceFiles,
          sourceMappings: fixture.sourceMappings,
          symbolMappings: fixture.symbolMappings,
        });

        for (const sourceMapping of fixture.sourceMappings) {
          const ranges = lookupOffsetsForSource(
            index,
            sourceMapping.sourceFileUrl,
            sourceMapping.lineNumber,
          );
          const found = ranges.some((range) => {
            return range.startOffset === sourceMapping.startOffset &&
              range.endOffset === sourceMapping.endOffset;
          });
          if (!found) {
            return false;
          }

          const reverse = lookupSourceForOffset(
            index,
            sourceMapping.startOffset,
          );
          if (!reverse) {
            return false;
          }
          if (reverse.startOffset !== sourceMapping.startOffset) {
            return false;
          }
        }

        for (const symbolMapping of fixture.symbolMappings) {
          const names = lookupSymbolsForOffset(
            index,
            symbolMapping.startOffset,
          );
          if (!names.includes(symbolMapping.symbolName)) {
            return false;
          }
        }

        return true;
      }),
      {numRuns: 10},
    );
  });
});

/**
 * Create a deterministic index fixture for unit tests.
 *
 * @return {Object} Built index.
 */
function createSampleIndex() {
  return buildDwarfIndex({
    moduleRef: 'mod-unit',
    moduleDigest: 'sha256:' + 'c'.repeat(64),
    rawModuleId: 'raw-unit',
    sourceFiles: ['file:///src/main.ts'],
    sourceMappings: [
      {
        sourceFileUrl: 'file:///src/main.ts',
        lineNumber: 11,
        columnNumber: 0,
        startOffset: 8,
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

/**
 * Property arbitrary for non-overlapping mapping fixtures.
 *
 * @return {fc.Arbitrary<Object>}
 */
function mappingFixtureArbitrary() {
  return fc.array(
    fc.record({
      sourceIndex: fc.integer({min: 0, max: 2}),
      lineNumber: fc.integer({min: 0, max: 50}),
      distance: fc.integer({min: 0, max: 4}),
      length: fc.integer({min: 0, max: 8}),
    }),
    {minLength: 1, maxLength: 10},
  ).map((entries) => {
    let cursor = 0;
    const sourceMappings = [];
    const symbolMappings = [];
    const sourceFiles = new Set();

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const startOffset = cursor + entry.distance;
      const endOffset = startOffset + entry.length;
      cursor = endOffset + 1;

      const sourceFileUrl = `file:///src/${entry.sourceIndex}.ts`;
      sourceFiles.add(sourceFileUrl);

      sourceMappings.push({
        sourceFileUrl,
        lineNumber: entry.lineNumber,
        columnNumber: 0,
        startOffset,
        endOffset,
      });
      symbolMappings.push({
        symbolName: `fn_${i}`,
        startOffset,
        endOffset,
      });
    }

    return {
      sourceFiles: [...sourceFiles],
      sourceMappings,
      symbolMappings,
    };
  });
}
