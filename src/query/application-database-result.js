import {types as utilTypes} from 'node:util';

// The public Application Database result and failure-cause shapes.
//
// SqlCore returns an INTERNAL result that carries the cluster's shape
// (partitions, read-authority witnesses, participant results, the distributed
// plan, HLC timestamps naming the serving node). The facade is the public
// boundary, so it projects that result to the one public shape an application
// sees: a frozen null-prototype `{rows, affectedRows}`. Row-level internals
// (`_partition_id`, ...) are already removed by SqlCore's owner projection
// (TableCreationService.stripPartitionDetails, applied in
// SqlCore.executeQuery); this module only copies the application's own row
// data. A raw error THROWN by SqlCore is likewise reduced to primitive
// `{code, message}` before it becomes an ApplicationDatabaseError cause.

const APPLICATION_DATABASE_RESULT_FIELD = Object.freeze({
  AFFECTED_ROWS: 'affectedRows',
  ROWS: 'rows',
});
const APPLICATION_DATABASE_CAUSE_FIELD = Object.freeze({
  CODE: 'code',
  MESSAGE: 'message',
});
const NO_AFFECTED_ROWS = 0;
const NO_CAUSE_FIELD = null;
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_VALUE = 'value';
const ArrayConstructor = Array;
const arrayIsArray = Array.isArray;
const numberIsSafeInteger = Number.isSafeInteger;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const reflectApply = Reflect.apply;
const {isProxy} = utilTypes;

function isInspectableObject(value) {
  return value !== null &&
    (typeof value === LOCAL_STR_OBJECT || typeof value === LOCAL_STR_FUNCTION) &&
    !isProxy(value);
}

function readOwnDataValue(source, property) {
  if (!isInspectableObject(source)) return undefined;
  const descriptor = objectGetOwnPropertyDescriptor(source, property);
  return descriptor && objectHasOwn(descriptor, LOCAL_STR_VALUE) ?
    descriptor.value :
    undefined;
}

function defineDataProperty(target, key, value) {
  reflectApply(objectDefineProperty, Object, [target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  }]);
}

function projectRow(row) {
  if (!isInspectableObject(row)) return row;
  const projected = {};
  const keys = objectKeys(row);
  for (let index = 0; index < keys.length; index++) {
    const descriptor = objectGetOwnPropertyDescriptor(row, keys[index]);
    if (descriptor && objectHasOwn(descriptor, LOCAL_STR_VALUE)) {
      defineDataProperty(projected, keys[index], descriptor.value);
    }
  }
  return projected;
}

function projectRows(result) {
  const rows = readOwnDataValue(result, APPLICATION_DATABASE_RESULT_FIELD.ROWS);
  if (!arrayIsArray(rows) || isProxy(rows)) return new ArrayConstructor(0);
  const projected = new ArrayConstructor(rows.length);
  for (let index = 0; index < rows.length; index++) {
    defineDataProperty(projected, index, projectRow(rows[index]));
  }
  return projected;
}

function projectAffectedRows(result) {
  const affectedRows = readOwnDataValue(
    result,
    APPLICATION_DATABASE_RESULT_FIELD.AFFECTED_ROWS,
  );
  return numberIsSafeInteger(affectedRows) && affectedRows >= NO_AFFECTED_ROWS ?
    affectedRows + NO_AFFECTED_ROWS :
    NO_AFFECTED_ROWS;
}

/**
 * Project a successful SqlCore result to the public result shape.
 * `rows` is the statement's row data (an empty array when the statement
 * produced none); `affectedRows` is the engine-reported mutation count, or 0
 * when the statement reported none (reads, DDL).
 * @param {Object} result - SqlCore result with `success: true`.
 * @return {Readonly<{rows: Object[], affectedRows: number}>}
 */
function projectApplicationDatabaseResult(result) {
  const projected = objectCreate(null);
  projected.affectedRows = projectAffectedRows(result);
  projected.rows = projectRows(result);
  return objectFreeze(projected);
}

function readCauseString(source, property) {
  const value = readOwnDataValue(source, property);
  return typeof value === LOCAL_STR_STRING && value.length > 0 ?
    value :
    NO_CAUSE_FIELD;
}

/**
 * Reduce a value THROWN by SqlCore to the primitive cause an application may
 * see. Nothing else of the engine error (stack, participant, node, partition
 * or address fields, nested causes) crosses the public boundary.
 * @param {*} thrown
 * @return {Readonly<{code: ?string, message: ?string}>}
 */
function projectEngineFailureCause(thrown) {
  const cause = objectCreate(null);
  cause.code = readCauseString(thrown, APPLICATION_DATABASE_CAUSE_FIELD.CODE);
  cause.message = readCauseString(
    thrown,
    APPLICATION_DATABASE_CAUSE_FIELD.MESSAGE,
  );
  return objectFreeze(cause);
}

export {
  projectApplicationDatabaseResult,
  projectEngineFailureCause,
};
