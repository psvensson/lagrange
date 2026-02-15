/**
 * Constants for DWARF parsing, indexing, and cache behavior.
 */

const DWARF_INDEX_DEFAULT = Object.freeze({
  CACHE_MAX_ENTRIES: 64,
  LINE_COLUMN_ZERO: 0,
  INLINE_FRAME_INDEX_ZERO: 0,
  MAX_MAPPED_LINES_PER_SOURCE: 5000,
});

const DWARF_INDEX_VALUE = Object.freeze({
  CACHE_POLICY_LRU: 'lru',
  WASM_VALUE_I32: 'i32',
  MODULE_CACHE_KEY_SEPARATOR: '::',
});

const DWARF_INDEX_ERROR_MSG = Object.freeze({
  REQUEST_REQUIRED: 'DWARF request is required',
  MODULE_REF_REQUIRED: 'DWARF request requires non-empty moduleRef',
  MODULE_DIGEST_REQUIRED:
    'DWARF request requires non-empty moduleDigest',
  WASM_BYTES_REQUIRED:
    'DWARF request requires wasmBytes as Buffer, Uint8Array, or ArrayBuffer',
  MODULE_URL_REQUIRED: 'DWARF request requires non-empty moduleUrl',
  PARSER_RESPONSE_INVALID:
    'DWARF parser returned invalid response for addRawModule',
  PARSER_MISSING_SYMBOLS:
    'DWARF parser reported missing symbol files',
  PARSE_RESULT_REQUIRED: 'DWARF parse result is required',
  SOURCE_MAPPINGS_REQUIRED:
    'DWARF parse result sourceMappings must be an array',
  SYMBOL_MAPPINGS_REQUIRED:
    'DWARF parse result symbolMappings must be an array',
  SOURCE_FILE_URL_REQUIRED:
    'DWARF source file URL must be a non-empty string',
  LINE_NUMBER_REQUIRED:
    'DWARF lineNumber must be a non-negative integer',
  CODE_OFFSET_REQUIRED:
    'DWARF codeOffset must be a non-negative integer',
  CACHE_KEY_REQUIRED: 'DWARF cache key must be a non-empty string',
  CACHE_MAX_ENTRIES_INVALID:
    'DWARF cache maxEntries must be a positive integer',
  CREATE_FN_REQUIRED:
    'DWARF cache createFn must be a function',
  INDEX_REQUIRED: 'DWARF index is required',
});

const DWARF_INDEX_FIELD = Object.freeze({
  FRAMES: 'frames',
  MISSING_SYMBOL_FILES: 'missingSymbolFiles',
  NAME: 'name',
});

export {
  DWARF_INDEX_DEFAULT,
  DWARF_INDEX_VALUE,
  DWARF_INDEX_ERROR_MSG,
  DWARF_INDEX_FIELD,
};
