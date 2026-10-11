// Canonical enumeration domain for complete CDC cache coverage. Routing ranges
// retain their own comparator; this module owns only the SQLite BINARY order in
// which one supported system table is enumerated and installed.

import {types} from 'node:util';
import {SYSTEM_TABLE_SCHEMAS} from
  '../bootstrap/system-table-schemas-constants.js';
import {digest} from '../utils/canonical-json-data.js';

const CDC_COVERAGE_ENUMERATION_DOMAIN = 'sqlite-binary-text-v1';
const CDC_COVERAGE_ROW_CODEC = 'cdc-system-row-json-v1';
const CDC_COVERAGE_KEY_COMPARATOR = 'utf8-unsigned-v1';
const CDC_COVERAGE_SQLITE = Object.freeze({
  BINARY: 'BINARY',
  INTEGER: 'INTEGER',
  REAL: 'REAL',
  TEXT: 'TEXT',
});
const CDC_COVERAGE_BUFFER_ENCODING = 'utf8';
const CDC_COVERAGE_KEY_TYPE_ERROR =
  'CDC coverage keys must be primitive strings';
const PROPERTY_DESCRIPTOR_VALUE = 'value';

function canonicalColumn(column) {
  return {
    name: column.name,
    type: column.type,
    primaryKey: column.primaryKey === true,
    notNull: column.notNull === true,
    defaultValue: column.defaultValue ?? null,
  };
}

function primaryKeyFields(schema) {
  if (Array.isArray(schema?.primaryKey) && schema.primaryKey.length > 0) {
    return [...schema.primaryKey];
  }
  return Array.isArray(schema?.columns) ? schema.columns
    .filter((column) => column?.primaryKey === true)
    .map((column) => column.name) : [];
}

function storageSchemaShape(schema, primaryKey) {
  return {columns: schema.columns.map((column, index) => ({
    cid: index, name: column.name, type: String(column.type).toUpperCase(),
    notNull: column.notNull === true,
    primaryKeyOrdinal: primaryKey.indexOf(column.name) + 1,
  })), primaryKeyCollation: CDC_COVERAGE_SQLITE.BINARY};
}

function liveStorageSchemaShape(db, tableName, primaryKeyField) {
  const quotedTable = `"${tableName.replaceAll('"', '""')}"`;
  const columns = db.prepare(`PRAGMA table_info(${quotedTable})`).all()
    .map((column) => ({cid: column.cid, name: column.name,
      type: String(column.type).toUpperCase(), notNull: column.notnull === 1,
      primaryKeyOrdinal: column.pk}));
  const primaryIndex = db.prepare(`PRAGMA index_list(${quotedTable})`).all()
    .find((index) => index.origin === 'pk');
  if (!primaryIndex || typeof primaryIndex.name !== 'string') return null;
  const quotedIndex = `"${primaryIndex.name.replaceAll('"', '""')}"`;
  const keyColumn = db.prepare(`PRAGMA index_xinfo(${quotedIndex})`).all()
    .find((column) => column.key === 1 && column.name === primaryKeyField);
  if (!keyColumn || typeof keyColumn.coll !== 'string') return null;
  return {columns, primaryKeyCollation: keyColumn.coll.toUpperCase()};
}

function resolveCdcCoverageDomain(tableName) {
  const schema = SYSTEM_TABLE_SCHEMAS.find(
    (candidate) => candidate?.tableName === tableName);
  if (!schema || !Array.isArray(schema.columns)) return null;
  const primaryKey = primaryKeyFields(schema);
  if (primaryKey.length !== 1) return null;
  const keyColumn = schema.columns.find(
    (column) => column?.name === primaryKey[0]);
  if (!keyColumn || String(keyColumn.type).toUpperCase() !==
      CDC_COVERAGE_SQLITE.TEXT) return null;
  const schemaShape = {
    tableName,
    columns: schema.columns.map(canonicalColumn),
    primaryKey,
  };
  const schemaDigest = digest(schemaShape);
  const storageSchemaDigest = digest(storageSchemaShape(schema, primaryKey));
  const value = {
    version: CDC_COVERAGE_ENUMERATION_DOMAIN,
    comparator: CDC_COVERAGE_KEY_COMPARATOR,
    rowCodec: CDC_COVERAGE_ROW_CODEC,
    tableName,
    primaryKeyField: primaryKey[0],
    columns: Object.freeze(schema.columns.map((column) => Object.freeze({
      name: column.name, type: String(column.type).toUpperCase(),
    }))),
    schemaDigest,
    storageSchemaDigest,
    domainDigest: digest({
      version: CDC_COVERAGE_ENUMERATION_DOMAIN,
      comparator: CDC_COVERAGE_KEY_COMPARATOR,
      rowCodec: CDC_COVERAGE_ROW_CODEC,
      schemaDigest,
      storageSchemaDigest,
      primaryKeyField: primaryKey[0],
    }),
  };
  return Object.freeze(value);
}

function validStorageValue(type, value) {
  if (value === null) return true;
  if (type === CDC_COVERAGE_SQLITE.TEXT) return typeof value === 'string';
  if (type === CDC_COVERAGE_SQLITE.INTEGER) return Number.isSafeInteger(value);
  return type === CDC_COVERAGE_SQLITE.REAL && typeof value === 'number' &&
    Number.isFinite(value) && !Object.is(value, -0);
}

function validCdcCoverageRow(domain, row) {
  if (!row || typeof row !== 'object' || Array.isArray(row) ||
      types.isProxy(row)) return false;
  const prototype = Object.getPrototypeOf(row);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (Reflect.ownKeys(row).length !== domain.columns.length) return false;
  for (const column of domain.columns) {
    const descriptor = Object.getOwnPropertyDescriptor(row, column.name);
    if (!descriptor || descriptor.enumerable !== true ||
        !Object.hasOwn(descriptor, PROPERTY_DESCRIPTOR_VALUE) ||
        !validStorageValue(column.type, descriptor.value)) return false;
  }
  return true;
}

function resolveLiveCdcCoverageDomain(db, tableName) {
  const domain = resolveCdcCoverageDomain(tableName);
  if (domain === null || typeof db?.prepare !== 'function') return null;
  try {
    const live = liveStorageSchemaShape(db, tableName, domain.primaryKeyField);
    return live !== null && digest(live) === domain.storageSchemaDigest ?
      domain : null;
  } catch {
    return null;
  }
}

function compareCdcCoverageKeys(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') {
    throw new TypeError(CDC_COVERAGE_KEY_TYPE_ERROR);
  }
  return Buffer.compare(Buffer.from(left, CDC_COVERAGE_BUFFER_ENCODING),
    Buffer.from(right, CDC_COVERAGE_BUFFER_ENCODING));
}

function validCdcCoverageKey(value) {
  return typeof value === 'string' && value.length > 0;
}

function keyInCdcCoverageInterval(key, lower, upper) {
  if (!validCdcCoverageKey(key)) return false;
  return (lower === null || compareCdcCoverageKeys(key, lower) >= 0) &&
    (upper === null || compareCdcCoverageKeys(key, upper) < 0);
}

function cdcCoverageCellId({scopeId, domainDigest, lower, upper}) {
  return digest({scopeId, domainDigest, lower, upper});
}

export {
  CDC_COVERAGE_ENUMERATION_DOMAIN,
  CDC_COVERAGE_KEY_COMPARATOR,
  CDC_COVERAGE_ROW_CODEC,
  cdcCoverageCellId,
  compareCdcCoverageKeys,
  keyInCdcCoverageInterval,
  resolveCdcCoverageDomain,
  resolveLiveCdcCoverageDomain,
  validCdcCoverageRow,
  validCdcCoverageKey,
};
