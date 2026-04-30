/**
 * Build DWARF mapping indexes and lookup helpers.
 */

import {NUM, TYPEOF} from '../constants/index.js';
import {
  DWARF_INDEX_DEFAULT as DEF,
  DWARF_INDEX_ERROR_MSG as ERR,
} from './dwarf-index-constants.js';

const LOCAL_STR_COLON = ':';

/**
 * Build normalized indexes for source/offset/symbol lookups.
 *
 * @param {Object} parseResult - Parser output.
 * @param {Object} [options] - Builder options.
 * @param {Function} [options.now] - Timestamp provider.
 * @return {Object} Immutable index object.
 */
function buildDwarfIndex(parseResult, options = {}) {
  validateParseResult(parseResult);

  const now = options.now || (() => Date.now());
  const normalizedSourceMappings = normalizeSourceMappings(
    parseResult.sourceMappings,
  );
  const normalizedSymbolMappings = normalizeSymbolMappings(
    parseResult.symbolMappings,
  );
  const sourceFiles = deriveSourceFiles(
    parseResult.sourceFiles || [],
    normalizedSourceMappings,
  );

  const sourceToOffsetIndex = createSourceToOffsetIndex(
    normalizedSourceMappings,
  );
  const symbolNameIndex = createSymbolNameIndex(
    normalizedSymbolMappings,
  );

  return {
    moduleRef: parseResult.moduleRef || null,
    moduleDigest: parseResult.moduleDigest || null,
    rawModuleId: parseResult.rawModuleId || null,
    createdAt: now(),
    sourceFiles,
    sourceMappings: normalizedSourceMappings,
    symbolMappings: normalizedSymbolMappings,
    sourceToOffsetIndex,
    offsetToSourceIndex: normalizedSourceMappings,
    symbolNameIndex,
    symbolOffsetIndex: normalizedSymbolMappings,
  };
}

/**
 * Find offset ranges for a specific source file + line.
 *
 * @param {Object} index - Built DWARF index.
 * @param {string} sourceFileUrl - Source file URL.
 * @param {number} lineNumber - Source line number.
 * @return {Array<Object>} Offset ranges for that line.
 */
function lookupOffsetsForSource(index, sourceFileUrl, lineNumber) {
  ensureIndex(index);
  if (!isNonEmptyString(sourceFileUrl)) {
    throw new Error(ERR.SOURCE_FILE_URL_REQUIRED);
  }
  if (!isNonNegativeInteger(lineNumber)) {
    throw new Error(ERR.LINE_NUMBER_REQUIRED);
  }

  const perSource = index.sourceToOffsetIndex.get(sourceFileUrl);
  if (!perSource) {
    return [];
  }
  const lineRanges = perSource.get(lineNumber);
  return lineRanges ? [...lineRanges] : [];
}

/**
 * Find the first source mapping that contains a code offset.
 *
 * @param {Object} index - Built DWARF index.
 * @param {number} codeOffset - Wasm code offset.
 * @return {Object|null} Source mapping or null.
 */
function lookupSourceForOffset(index, codeOffset) {
  ensureIndex(index);
  if (!isNonNegativeInteger(codeOffset)) {
    throw new Error(ERR.CODE_OFFSET_REQUIRED);
  }

  for (const mapping of index.offsetToSourceIndex) {
    if (mapping.startOffset > codeOffset) {
      break;
    }
    if (codeOffset >= mapping.startOffset &&
      codeOffset <= mapping.endOffset) {
      return mapping;
    }
  }

  return null;
}

/**
 * Find symbol names that contain a code offset.
 *
 * @param {Object} index - Built DWARF index.
 * @param {number} codeOffset - Wasm code offset.
 * @return {string[]} Symbol names covering the offset.
 */
function lookupSymbolsForOffset(index, codeOffset) {
  ensureIndex(index);
  if (!isNonNegativeInteger(codeOffset)) {
    throw new Error(ERR.CODE_OFFSET_REQUIRED);
  }

  const names = new Set();
  for (const symbolMapping of index.symbolOffsetIndex) {
    if (symbolMapping.startOffset > codeOffset) {
      break;
    }
    if (codeOffset >= symbolMapping.startOffset &&
      codeOffset <= symbolMapping.endOffset) {
      names.add(symbolMapping.symbolName);
    }
  }
  return [...names];
}

/**
 * Find all ranges for a given symbol.
 *
 * @param {Object} index - Built DWARF index.
 * @param {string} symbolName - Symbol name.
 * @return {Array<Object>} Symbol ranges.
 */
function lookupSymbolRangesByName(index, symbolName) {
  ensureIndex(index);
  if (!isNonEmptyString(symbolName)) {
    return [];
  }
  const ranges = index.symbolNameIndex.get(symbolName);
  return ranges ? [...ranges] : [];
}

/**
 * Validate parser output shape.
 *
 * @param {Object} parseResult - Candidate parse result.
 */
function validateParseResult(parseResult) {
  if (!parseResult || typeof parseResult !== TYPEOF.OBJECT) {
    throw new Error(ERR.PARSE_RESULT_REQUIRED);
  }
  if (!Array.isArray(parseResult.sourceMappings)) {
    throw new Error(ERR.SOURCE_MAPPINGS_REQUIRED);
  }
  if (!Array.isArray(parseResult.symbolMappings)) {
    throw new Error(ERR.SYMBOL_MAPPINGS_REQUIRED);
  }
}

/**
 * Ensure lookup helpers receive a built index object.
 *
 * @param {Object} index - Candidate index.
 */
function ensureIndex(index) {
  if (!index || typeof index !== TYPEOF.OBJECT) {
    throw new Error(ERR.INDEX_REQUIRED);
  }
}

/**
 * Normalize source mappings into a sorted canonical array.
 *
 * @param {Array<Object>} sourceMappings - Raw source mappings.
 * @return {Array<Object>} Normalized mappings.
 */
function normalizeSourceMappings(sourceMappings) {
  const normalized = [];

  for (const mapping of sourceMappings) {
    if (!mapping || typeof mapping !== TYPEOF.OBJECT) {
      continue;
    }
    if (!isNonEmptyString(mapping.sourceFileUrl)) {
      continue;
    }
    if (!isNonNegativeInteger(mapping.lineNumber)) {
      continue;
    }
    if (!isNonNegativeInteger(mapping.startOffset) ||
      !isNonNegativeInteger(mapping.endOffset)) {
      continue;
    }
    if (mapping.endOffset < mapping.startOffset) {
      continue;
    }

    normalized.push({
      sourceFileUrl: mapping.sourceFileUrl,
      lineNumber: mapping.lineNumber,
      columnNumber: isNonNegativeInteger(mapping.columnNumber) ?
        mapping.columnNumber :
        DEF.LINE_COLUMN_ZERO,
      startOffset: mapping.startOffset,
      endOffset: mapping.endOffset,
    });
  }

  normalized.sort(compareByOffsetRange);
  return dedupeMappings(normalized, sourceMappingKey);
}

/**
 * Normalize symbol mappings into a sorted canonical array.
 *
 * @param {Array<Object>} symbolMappings - Raw symbol mappings.
 * @return {Array<Object>} Normalized symbol mappings.
 */
function normalizeSymbolMappings(symbolMappings) {
  const normalized = [];

  for (const symbolMapping of symbolMappings) {
    if (!symbolMapping || typeof symbolMapping !== TYPEOF.OBJECT) {
      continue;
    }
    if (!isNonEmptyString(symbolMapping.symbolName)) {
      continue;
    }
    if (!isNonNegativeInteger(symbolMapping.startOffset) ||
      !isNonNegativeInteger(symbolMapping.endOffset)) {
      continue;
    }
    if (symbolMapping.endOffset < symbolMapping.startOffset) {
      continue;
    }

    normalized.push({
      symbolName: symbolMapping.symbolName,
      startOffset: symbolMapping.startOffset,
      endOffset: symbolMapping.endOffset,
    });
  }

  normalized.sort(compareByOffsetRange);
  return dedupeMappings(normalized, symbolMappingKey);
}

/**
 * Derive source file list from explicit sources plus mappings.
 *
 * @param {Array<string>} sourceFiles - Declared source files.
 * @param {Array<Object>} sourceMappings - Normalized mappings.
 * @return {string[]} Deduped source list.
 */
function deriveSourceFiles(sourceFiles, sourceMappings) {
  const unique = new Set();

  for (const sourceFileUrl of sourceFiles) {
    if (isNonEmptyString(sourceFileUrl)) {
      unique.add(sourceFileUrl);
    }
  }
  for (const sourceMapping of sourceMappings) {
    unique.add(sourceMapping.sourceFileUrl);
  }

  return [...unique];
}

/**
 * Build source->line->offset index.
 *
 * @param {Array<Object>} sourceMappings - Normalized mappings.
 * @return {Map<string, Map<number, Array<Object>>>}
 */
function createSourceToOffsetIndex(sourceMappings) {
  const sourceIndex = new Map();

  for (const sourceMapping of sourceMappings) {
    let lineIndex = sourceIndex.get(sourceMapping.sourceFileUrl);
    if (!lineIndex) {
      lineIndex = new Map();
      sourceIndex.set(sourceMapping.sourceFileUrl, lineIndex);
    }

    const lineNumber = sourceMapping.lineNumber;
    const lineRanges = lineIndex.get(lineNumber) || [];
    lineRanges.push(sourceMapping);
    lineIndex.set(lineNumber, lineRanges);
  }

  return sourceIndex;
}

/**
 * Build symbolName->ranges index.
 *
 * @param {Array<Object>} symbolMappings - Normalized symbol mappings.
 * @return {Map<string, Array<Object>>}
 */
function createSymbolNameIndex(symbolMappings) {
  const symbolNameIndex = new Map();

  for (const symbolMapping of symbolMappings) {
    const ranges = symbolNameIndex.get(symbolMapping.symbolName) || [];
    ranges.push(symbolMapping);
    symbolNameIndex.set(symbolMapping.symbolName, ranges);
  }

  return symbolNameIndex;
}

/**
 * Sort mappings by start offset, then end offset.
 *
 * @param {Object} left - Left mapping.
 * @param {Object} right - Right mapping.
 * @return {number} Sort comparator.
 */
function compareByOffsetRange(left, right) {
  if (left.startOffset !== right.startOffset) {
    return left.startOffset - right.startOffset;
  }
  return left.endOffset - right.endOffset;
}

/**
 * Dedupe mapping entries with a stable key strategy.
 *
 * @param {Array<Object>} mappings - Candidate mappings.
 * @param {Function} keyFn - Key extractor.
 * @return {Array<Object>} Deduped mappings.
 */
function dedupeMappings(mappings, keyFn) {
  const keys = new Set();
  const deduped = [];

  for (const mapping of mappings) {
    const key = keyFn(mapping);
    if (keys.has(key)) {
      continue;
    }
    keys.add(key);
    deduped.push(mapping);
  }

  return deduped;
}

/**
 * @param {Object} mapping
 * @return {string}
 */
function sourceMappingKey(mapping) {
  return [
    mapping.sourceFileUrl,
    mapping.lineNumber,
    mapping.columnNumber,
    mapping.startOffset,
    mapping.endOffset,
  ].join(LOCAL_STR_COLON);
}

/**
 * @param {Object} symbolMapping
 * @return {string}
 */
function symbolMappingKey(symbolMapping) {
  return [
    symbolMapping.symbolName,
    symbolMapping.startOffset,
    symbolMapping.endOffset,
  ].join(LOCAL_STR_COLON);
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= NUM.ZERO;
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === TYPEOF.STRING &&
    value.trim().length > NUM.ZERO;
}

export {
  buildDwarfIndex,
  lookupOffsetsForSource,
  lookupSourceForOffset,
  lookupSymbolsForOffset,
  lookupSymbolRangesByName,
};
