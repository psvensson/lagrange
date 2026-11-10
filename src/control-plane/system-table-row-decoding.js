/**
 * The shared decoding rules of the system-table row decoders
 * (services-row-decoder.js, nodes-row-decoder.js,
 * replica-operations-row-decoder.js). Each decoder declares its table once
 * from the stored schema; this module turns one stored-shape row into the
 * frozen canonical object and owns every refusal, so the three decoders
 * apply one rule set (no second decoding of any column anywhere).
 *
 * Rules (rules R05, R07; quest system-table-row-decoders):
 * - The row carries exactly the projection's columns, in their stored
 *   snake_case spelling; a missing column, an extra column, or a camelCase
 *   spelling is a typed refusal. The decoder never fetches, caches or
 *   defaults a value the row lacks. The one exception is the system-table
 *   cache's declared local provenance (SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES:
 *   the CDC origin HLC stamped on every delivered row, and partitions-only
 *   leader claims): a cache row is a stored row plus that provenance, so
 *   those keys are neither columns nor refused, and they are not decoded.
 * - SQL NULL decodes to ROW_ABSENT, the one named absent value, in every
 *   column (the code before the decoders read a stored NULL too).
 * - A seeded partial row (lead decision 2026-11-09): a seeder that writes a
 *   row lacking some columns declares a seed projection beside itself
 *   (the table's define<Table>Projection) and marks the row with it
 *   (seedProjectionRow); the cache keeps that marker in its local field
 *   SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD until the row holds every
 *   column. Decoding a marked row decodes every column it carries, refuses
 *   one of the seed projection's columns missing, and gives each other
 *   missing column the named state ROW_NOT_OBSERVED (never observed),
 *   distinct from ROW_ABSENT (a stored NULL). An unmarked row lacking a
 *   column stays a refusal.
 * - Decoding keeps every stored value as stored, case included (lead
 *   decision 2026-11-09, round 5: the decoders read like the code before
 *   them). A closed-domain (state) column whose stored text is one of its
 *   vocabulary values decodes to that value; any other stored value of a
 *   column (an unknown or differently-cased state, a value of the wrong
 *   type, a JSON-array text that holds no array) decodes to the named state
 *   ROW_UNRECOGNISED carrying the raw value (`{state, raw}`, frozen), never
 *   a refusal and never the most common state.
 * - TEXT is a string, INTEGER/REAL a finite number, JSON_ARRAY a JSON text
 *   holding an array (decoded to a frozen array). A JSON-array column the
 *   table declares refusing (replica_operations.steps_history, the earlier
 *   ruling) refuses a text that holds no array instead.
 * - The result is frozen and carries `projection`, the projection's name.
 * - A reader reads a decoded row only through its declared reading
 *   (defineNotObservedReading, readDecodedRow / readDecodedColumn): a named
 *   state never reaches past it. ROW_NOT_OBSERVED reads as the reader
 *   declared, ROW_UNRECOGNISED as its raw value (the reader then compares
 *   exactly as its code compared the stored value before the decoders),
 *   and a folded normaliser's reading (defineNormalizerReading) reads as
 *   that normaliser read the stored value (readText / readLowerText).
 * - The only refusals: a value that is not a row, the projection contract
 *   (a missing column of an unmarked row, an extra or camelCase column, a
 *   malformed seed marker) and the declared refusing JSON-array columns.
 *   They are typed (SystemTableRowDecodeError) and propagate.
 */

import {
  SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES,
  SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD,
} from '../cache/cache-constants.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_SYMBOL = 'symbol';
// Captured at load: the priority census reads under ambient-intrinsic
// mutation, and the normaliser readings lower-case through this one copy.
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);

/**
 * The decoded value of a column whose stored value is SQL NULL.
 * @type {null}
 */
const ROW_ABSENT = null;

/**
 * The decoded value of a column a seeded row never observed: the column lies
 * outside the row's seed projection and no later write supplied it. Distinct
 * from ROW_ABSENT (the stored value is SQL NULL); a reader maps it explicitly.
 * @type {symbol}
 */
const ROW_NOT_OBSERVED = Symbol('system_table_row_not_observed');

/**
 * The state of a stored value outside its column's decoding (an unknown or
 * differently-cased closed-domain value, a value of the wrong type, a
 * JSON-array text holding no array). The decoded value is the frozen
 * `{state: ROW_UNRECOGNISED, raw}`; a reader reads `raw` (readDecodedRow).
 * @type {symbol}
 */
const ROW_UNRECOGNISED = Symbol('system_table_row_unrecognised');

const SYSTEM_TABLE_ROW_DECODE_ERROR_CODE = 'SYSTEM_TABLE_ROW_DECODE_REFUSED';
const SYSTEM_TABLE_ROW_DECODE_ERROR_NAME = 'SystemTableRowDecodeError';

const SYSTEM_TABLE_ROW_DECODE_REFUSAL = Object.freeze({
  NOT_A_ROW: 'not_a_row',
  MISSING_COLUMN: 'missing_column',
  UNEXPECTED_COLUMN: 'unexpected_column',
  MALFORMED_JSON: 'malformed_json',
  MALFORMED_SEED_PROJECTION: 'malformed_seed_projection',
});

const SYSTEM_TABLE_COLUMN_KIND = Object.freeze({
  TEXT: 'text',
  NUMBER: 'number',
  STATE: 'state',
  JSON_ARRAY: 'json_array',
});

// The projection every full-row read (`SELECT *`) decodes through.
const FULL_ROW_PROJECTION_NAME = 'full_row';
const PROJECTION_FIELD = 'projection';

const SCHEMA_TYPE_KIND = Object.freeze({
  TEXT: SYSTEM_TABLE_COLUMN_KIND.TEXT,
  INTEGER: SYSTEM_TABLE_COLUMN_KIND.NUMBER,
  REAL: SYSTEM_TABLE_COLUMN_KIND.NUMBER,
});

const WORD_BOUNDARY = /_([a-z0-9])/gu;

/**
 * A typed refusal to decode one system-table row.
 */
class SystemTableRowDecodeError extends Error {
  /**
   * @param {Object} details `{table, projection, column, reason, value}`
   */
  constructor(details) {
    const {table, projection, column, reason, value} = details;
    super(`${table} row refused (${projection}): ${reason}` +
      `${column === undefined ? '' : ` at ${column}`}`);
    this.name = SYSTEM_TABLE_ROW_DECODE_ERROR_NAME;
    this.code = SYSTEM_TABLE_ROW_DECODE_ERROR_CODE;
    this.table = table;
    this.projection = projection;
    this.column = column;
    this.reason = reason;
    this.value = value;
  }
}

function camelCaseField(column) {
  return column.replace(WORD_BOUNDARY, (_match, letter) => letter.toUpperCase());
}

// A column's decoding kind: a declared state domain, a declared JSON array,
// else its stored type's kind (undefined for a type with no decoding).
function columnKind(definition, domain, jsonArrays) {
  if (domain) return SYSTEM_TABLE_COLUMN_KIND.STATE;
  if (jsonArrays.includes(definition.name)) return SYSTEM_TABLE_COLUMN_KIND.JSON_ARRAY;
  return SCHEMA_TYPE_KIND[definition.type];
}

/**
 * Declare one table's decoding from its stored schema.
 * @param {Object} declaration `{schema, states, jsonArrays,
 *   refusingJsonArrays}`: the stored schema object, `{column: [vocabulary
 *   values]}` for each closed-domain column, the JSON-array column names,
 *   and those of them whose text holding no array is a refusal
 * @return {Object} the frozen table decoding
 */
function defineSystemTableDecoding({schema, states = {}, jsonArrays = [],
  refusingJsonArrays = []}) {
  const columns = new Map();
  for (const definition of schema.columns) {
    const domain = Object.hasOwn(states, definition.name) ? states[definition.name] : null;
    const kind = columnKind(definition, domain, jsonArrays);
    if (!kind) {
      throw new Error(`${schema.tableName}.${definition.name}: no decoding for ` +
        `stored type ${definition.type}`);
    }
    columns.set(definition.name, Object.freeze({
      column: definition.name,
      field: camelCaseField(definition.name),
      kind,
      states: domain ? new Set(domain) : null,
      refusesMalformed: refusingJsonArrays.includes(definition.name),
    }));
  }
  for (const column of [...Object.keys(states), ...jsonArrays]) {
    if (!columns.has(column)) {
      throw new Error(`${schema.tableName}.${column} is not a stored column`);
    }
  }
  for (const column of refusingJsonArrays) {
    if (!jsonArrays.includes(column)) {
      throw new Error(`${schema.tableName}.${column} is not a declared JSON array`);
    }
  }
  const decoding = {table: schema.tableName, columns};
  decoding.fullRow = defineSystemTableProjection(decoding, FULL_ROW_PROJECTION_NAME,
    [...columns.keys()]);
  return Object.freeze(decoding);
}

/**
 * Declare a named projection: the exact stored columns one query selects.
 * @param {Object} decoding the table decoding
 * @param {string} name the projection's name (its marker on decoded rows)
 * @param {Array<string>} columns the stored column names selected
 * @return {Object} the frozen projection
 */
function defineSystemTableProjection(decoding, name, columns) {
  for (const column of columns) {
    if (!decoding.columns.has(column)) {
      throw new Error(`${decoding.table} projection ${name}: ${column} is not a stored column`);
    }
  }
  if (new Set(columns).size !== columns.length) {
    throw new Error(`${decoding.table} projection ${name}: duplicate column`);
  }
  return Object.freeze({table: decoding.table, name, columns: Object.freeze([...columns])});
}

/**
 * The seeder's row marked with its seed projection: the projection the
 * seeder declares once beside itself (define<Table>Projection), naming the
 * exact stored columns it writes. The row must carry exactly those columns
 * (plus cache-local fields).
 * @param {Object} seedProjection the seeder's declared projection
 * @param {Object} row the partial stored-shape row
 * @return {Object} a copy of the row carrying the marker
 */
function seedProjectionRow(seedProjection, row) {
  for (const column of seedProjection.columns) {
    if (!Object.hasOwn(row, column)) {
      throw new Error(`${seedProjection.table} seed ${seedProjection.name}: ` +
        `the row lacks ${column}`);
    }
  }
  for (const key of Object.keys(row)) {
    if (!seedProjection.columns.includes(key) &&
        !SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES.includes(key)) {
      throw new Error(`${seedProjection.table} seed ${seedProjection.name}: ` +
        `${key} is outside the seed projection`);
    }
  }
  return {
    ...row,
    [SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD]: {
      table: seedProjection.table,
      name: seedProjection.name,
      columns: [...seedProjection.columns],
    },
  };
}

function refuse(decoding, projection, reason, column, value) {
  throw new SystemTableRowDecodeError({table: decoding.table,
    projection: projection.name, column, reason, value});
}

/**
 * The decoded value of a stored value outside its column's decoding.
 * @param {*} raw the stored value
 * @return {Object} the frozen `{state: ROW_UNRECOGNISED, raw}`
 */
function unrecognisedValue(raw) {
  return Object.freeze({state: ROW_UNRECOGNISED, raw});
}

/**
 * Whether a decoded value is the named ROW_UNRECOGNISED state.
 * @param {*} value a decoded value
 * @return {boolean} whether it is unrecognised
 */
function isRowUnrecognised(value) {
  return typeof value === LOCAL_STR_OBJECT && value !== null &&
    value.state === ROW_UNRECOGNISED;
}

// A JSON-array column: the frozen array its text holds; else the declared
// refusal of a refusing column (the parse error's message, or the stored
// value that is no array text), or ROW_UNRECOGNISED carrying the value.
function decodeJsonArray(decoding, projection, spec, value) {
  let parsed;
  let parseError = null;
  if (typeof value === LOCAL_STR_STRING) {
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      parseError = error;
    }
  }
  if (Array.isArray(parsed)) return Object.freeze(parsed);
  if (spec.refusesMalformed) {
    refuse(decoding, projection, SYSTEM_TABLE_ROW_DECODE_REFUSAL.MALFORMED_JSON, spec.column,
      parseError === null ? value : String(parseError.message));
  }
  return unrecognisedValue(value);
}

function decodeColumn(decoding, projection, spec, value) {
  if (value === null) return ROW_ABSENT;
  switch (spec.kind) {
  case SYSTEM_TABLE_COLUMN_KIND.NUMBER:
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    break;
  case SYSTEM_TABLE_COLUMN_KIND.TEXT:
    if (typeof value === LOCAL_STR_STRING) return value;
    break;
  case SYSTEM_TABLE_COLUMN_KIND.STATE:
    if (spec.states.has(value)) return value;
    break;
  default:
    return decodeJsonArray(decoding, projection, spec, value);
  }
  return unrecognisedValue(value);
}

/**
 * Declare one decoded reader's reading of ROW_NOT_OBSERVED (lead ruling
 * 2026-11-09, round 4): for each decoded field the reader reads, the value
 * the reader's code read before the decoders for a row that lacked the
 * column (a raw `row.x` read: undefined; `?? null`: null; a folded
 * normaliser: ''; a JSON list: []; a stored NULL's reading where that code
 * read NULL and missing alike). Declared once beside the reader, from that
 * code; the reader reads a decoded row only through readDecodedRow /
 * readDecodedColumn, so no named state reaches past it.
 * @param {Object} decoding the table decoding
 * @param {string} reader the reader's name (diagnostics)
 * @param {Object} readings `{field: reading}` for every field it reads
 * @param {Object|null} normalizer null, or a folded normaliser's reading
 *   (defineNormalizerReading)
 * @return {Object} the frozen reading
 */
function defineNotObservedReading(decoding, reader, readings, normalizer = null) {
  const fieldReadings = new Map();
  const fieldByColumn = new Map();
  for (const [field, reading] of Object.entries(readings)) {
    const spec = [...decoding.columns.values()].find((entry) => entry.field === field);
    if (!spec) {
      throw new Error(`${decoding.table} reader ${reader}: ${field} is not a decoded field`);
    }
    fieldByColumn.set(spec.column, field);
    if (typeof reading === LOCAL_STR_SYMBOL) {
      throw new Error(`${decoding.table} reader ${reader}: ${field} reads as a named state`);
    }
    fieldReadings.set(field, Array.isArray(reading) ? Object.freeze([...reading]) : reading);
  }
  for (const field of normalizer?.lowerCaseFields ?? []) {
    if (!fieldReadings.has(field)) {
      throw new Error(`${decoding.table} reader ${reader}: ${field} is not a read field`);
    }
  }
  return Object.freeze({table: decoding.table, reader, fieldReadings, fieldByColumn,
    normalizer});
}

/**
 * Declare the reading of the readers that read a row through one folded
 * normaliser before the decoders (normalizeServiceRow, normalizeNodeRow in
 * system-row-normalizers.js, HEAD 730225bf1): they read a missing column and
 * a stored NULL alike (`readings`, the field's value for both), any other
 * stored value as its text (readText: a string as stored, another value as
 * String(value)), and lower-cased the `lowerCaseFields` (readLowerText).
 * @param {Object} decoding the table decoding
 * @param {string} reader the reader's name (diagnostics)
 * @param {Object} readings `{field: reading}` of a missing or NULL value
 * @param {Array<string>} lowerCaseFields the fields the normaliser lower-cased
 * @return {Object} the frozen reading
 */
function defineNormalizerReading(decoding, reader, readings, lowerCaseFields) {
  return defineNotObservedReading(decoding, reader, readings,
    Object.freeze({lowerCaseFields: Object.freeze([...lowerCaseFields])}));
}

// One field's value as the reader reads it: ROW_NOT_OBSERVED as declared,
// ROW_UNRECOGNISED as its raw value; under a normaliser reading also a
// stored NULL as declared and every stored value as the normaliser's text.
function readDeclaredValue(reading, field, value) {
  if (value === ROW_NOT_OBSERVED) return reading.fieldReadings.get(field);
  const stored = isRowUnrecognised(value) ? value.raw : value;
  if (reading.normalizer === null) return stored;
  if (stored === ROW_ABSENT || stored === undefined) return reading.fieldReadings.get(field);
  const text = typeof stored === LOCAL_STR_STRING ? stored : String(stored);
  return reading.normalizer.lowerCaseFields.includes(field) ? stringToLowerCase(text) : text;
}

/**
 * The reader's view of one decoded row: exactly its declared fields, each
 * read as declared (readDeclaredValue: ROW_NOT_OBSERVED as the declared
 * reading, ROW_UNRECOGNISED as its raw value, ROW_ABSENT unchanged unless a
 * normaliser reading), frozen.
 * @param {Object} reading the reader's declared reading
 * @param {Object} decodedRow a decoded row of the reading's table
 * @return {Object} the frozen view
 */
function readDecodedRow(reading, decodedRow) {
  const view = {};
  for (const field of reading.fieldReadings.keys()) {
    const value = decodedRow[field];
    if (value === undefined) {
      throw new Error(`${reading.table} reader ${reading.reader}: the decoded row ` +
        `has no ${field}`);
    }
    view[field] = readDeclaredValue(reading, field, value);
  }
  return Object.freeze(view);
}

/**
 * The reader's reading of one decoded column (decodeSystemTableRowColumn's
 * result), read as declared for its field (readDecodedRow).
 * @param {Object} reading the reader's declared reading
 * @param {string} column the stored column the value was decoded from
 * @param {*} value the decoded value
 * @return {*} the reader's value
 */
function readDecodedColumn(reading, column, value) {
  const field = reading.fieldByColumn.get(column);
  if (field === undefined) {
    throw new Error(
      `${reading.table} reader ${reading.reader}: ${column} has no declared reading`);
  }
  return readDeclaredValue(reading, field, value);
}

// The columns a marked row's seed projection observed, or null for an
// unmarked row. A marker that is not this table's seed projection of stored
// columns is a refusal.
function seededColumns(decoding, projection, row) {
  if (!Object.hasOwn(row, SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD)) return null;
  const marker = row[SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD];
  const wellFormed = typeof marker === LOCAL_STR_OBJECT && marker !== null &&
    marker.table === decoding.table && typeof marker.name === LOCAL_STR_STRING &&
    Array.isArray(marker.columns) &&
    marker.columns.every((column) => decoding.columns.has(column));
  if (!wellFormed) {
    refuse(decoding, projection, SYSTEM_TABLE_ROW_DECODE_REFUSAL.MALFORMED_SEED_PROJECTION,
      SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD, marker);
  }
  return new Set(marker.columns);
}

// A column the row does not carry: ROW_NOT_OBSERVED when the row's seed
// projection never observed it, else a refusal.
function missingColumnValue(decoding, projection, seeded, column) {
  if (seeded && !seeded.has(column)) return ROW_NOT_OBSERVED;
  return refuse(decoding, projection, SYSTEM_TABLE_ROW_DECODE_REFUSAL.MISSING_COLUMN, column);
}

/**
 * Decode one stored-shape row through a projection.
 * @param {Object} decoding the table decoding
 * @param {Object} row the stored row
 * @param {Object} projection the projection the query selected
 * @return {Object} the frozen canonical object
 */
function decodeSystemTableRow(decoding, row, projection) {
  if (!projection || projection.table !== decoding.table) {
    throw new Error(`${decoding.table} row decoded through a foreign or absent projection`);
  }
  if (typeof row !== LOCAL_STR_OBJECT || row === null || Array.isArray(row)) {
    refuse(decoding, projection, SYSTEM_TABLE_ROW_DECODE_REFUSAL.NOT_A_ROW, undefined, row);
  }
  const keys = Object.keys(row);
  for (const key of keys) {
    if (!projection.columns.includes(key) &&
        !SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES.includes(key)) {
      refuse(decoding, projection, SYSTEM_TABLE_ROW_DECODE_REFUSAL.UNEXPECTED_COLUMN, key,
        row[key]);
    }
  }
  const seeded = seededColumns(decoding, projection, row);
  const decoded = {};
  for (const column of projection.columns) {
    const spec = decoding.columns.get(column);
    decoded[spec.field] = Object.hasOwn(row, column) ?
      decodeColumn(decoding, projection, spec, row[column]) :
      missingColumnValue(decoding, projection, seeded, column);
  }
  decoded[PROJECTION_FIELD] = projection.name;
  return Object.freeze(decoded);
}

/**
 * Decode ONE column of a stored full row, under the same rules as
 * decodeSystemTableRow (a missing column of an unmarked row refuses;
 * ROW_NOT_OBSERVED for a seeded row's unobserved column; ROW_UNRECOGNISED
 * for a value outside the column's decoding). For a hot-path prefilter that
 * selects rows by one column before decoding the selected rows whole; it
 * does not judge the row's other columns, so a consumer never reads
 * anything but the selector from it.
 * @param {Object} decoding the table decoding
 * @param {Object} row the stored full row
 * @param {string} column the stored column name
 * @return {*} the decoded value (ROW_ABSENT for SQL NULL)
 */
function decodeSystemTableRowColumn(decoding, row, column) {
  const projection = decoding.fullRow;
  const spec = decoding.columns.get(column);
  if (!spec) {
    throw new Error(`${decoding.table}.${column} is not a stored column`);
  }
  if (typeof row !== LOCAL_STR_OBJECT || row === null || Array.isArray(row)) {
    refuse(decoding, projection, SYSTEM_TABLE_ROW_DECODE_REFUSAL.NOT_A_ROW, undefined, row);
  }
  if (!Object.hasOwn(row, column)) {
    return missingColumnValue(decoding, projection,
      seededColumns(decoding, projection, row), column);
  }
  return decodeColumn(decoding, projection, spec, row[column]);
}

export {
  FULL_ROW_PROJECTION_NAME,
  ROW_ABSENT,
  ROW_NOT_OBSERVED,
  ROW_UNRECOGNISED,
  SYSTEM_TABLE_ROW_DECODE_ERROR_CODE,
  SYSTEM_TABLE_ROW_DECODE_REFUSAL,
  SystemTableRowDecodeError,
  decodeSystemTableRow,
  decodeSystemTableRowColumn,
  defineNormalizerReading,
  defineSystemTableDecoding,
  defineNotObservedReading,
  defineSystemTableProjection,
  isRowUnrecognised,
  readDecodedColumn,
  readDecodedRow,
  seedProjectionRow,
};
