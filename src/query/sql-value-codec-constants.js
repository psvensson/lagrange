// The names the SQL value codec (src/query/sql-value-codec.js) owns: the
// storage-class tags of its one typed wire encoding and its typed refusals.

// SQLite's five storage classes, one character each. A TypedRowSet row and a
// TypedParams record carry one character per value, in column/parameter order.
const SQL_STORAGE_CLASS = Object.freeze({
  NULL: 'n',
  INTEGER: 'i',
  REAL: 'r',
  TEXT: 't',
  BLOB: 'b',
});

// Two refusal families, decided on differently by consumers:
// - INVALID: a wire form (row set, row, params record or cell) that is not
//   the one canonical encoding. Only a defective or foreign producer emits
//   one; the decoder never guesses what it meant.
// - UNREPRESENTABLE: a JavaScript value that has no SQL storage class under
//   the input-typing table (design D3), or a producer input the encoder
//   cannot frame. A client parameter refusal belongs to this family.
const SQL_VALUE_CODEC_ERROR_CODE = Object.freeze({
  INVALID: 'SQL_VALUE_CODEC_INVALID',
  UNREPRESENTABLE: 'SQL_VALUE_UNREPRESENTABLE',
});

// Why a value or form was refused. Every refusal names exactly one reason.
const SQL_VALUE_CODEC_REFUSAL = Object.freeze({
  // The record's `v` is not the codec version.
  VERSION_UNSUPPORTED: 'version_unsupported',
  // Not a record with exactly the expected fields, a field of the wrong
  // kind, a non-array where an array is required, or a non-string name.
  SHAPE_INVALID: 'shape_invalid',
  // A row or params record whose class string and cells disagree in count,
  // or a row whose width differs from the column count.
  ARITY_MISMATCH: 'arity_mismatch',
  // A class character outside SQL_STORAGE_CLASS.
  STORAGE_CLASS_UNKNOWN: 'storage_class_unknown',
  // A cell that is not the one canonical form of its class.
  CELL_NOT_CANONICAL: 'cell_not_canonical',
  // An INTEGER outside the signed 64-bit range SQLite stores.
  INTEGER_OUT_OF_RANGE: 'integer_out_of_range',
  // NaN: SQLite stores a bound NaN as NULL, so it has no REAL form.
  REAL_NOT_A_NUMBER: 'real_not_a_number',
  // A string with an unpaired UTF-16 surrogate: it has no UTF-8 form, and
  // SQLite would store bytes that read back as U+FFFD.
  TEXT_NOT_WELL_FORMED: 'text_not_well_formed',
  // A JavaScript value outside the input-typing table: boolean, undefined,
  // symbol, function, a plain object or a typed array other than Uint8Array.
  VALUE_TYPE_UNSUPPORTED: 'value_type_unsupported',
});

export {
  SQL_STORAGE_CLASS,
  SQL_VALUE_CODEC_ERROR_CODE,
  SQL_VALUE_CODEC_REFUSAL,
};
