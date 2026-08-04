/**
 * Structural contract for code-first lagrange.service.js sources.
 *
 * This module is the single normalization owner: it turns a service
 * module's default-export defineService descriptor into an immutable IR
 * whose route and operation identities come only from explicit object
 * keys, or rejects it with one named diagnostic per violation. It does
 * NOT own code generation, deployment records, or componentization —
 * those belong to later owners.
 */

import {pathToFileURL} from 'node:url';
import {types} from 'node:util';

import {
  AUTHORING_DESCRIPTOR_KIND,
  deepFreeze,
} from '../authoring/define-service.js';
import {HTTP_METHOD} from '../authoring/request-handler.js';

const SERVICE_SOURCE_ERROR_CODE = Object.freeze({
  DEFAULT_EXPORT_NOT_PLAIN_OBJECT: 'default_export_not_plain_object',
  DEFINITION_ACCESS_THREW: 'definition_access_threw',
  DUPLICATE_OPERATION_ID: 'duplicate_operation_id',
  DUPLICATE_ROUTE: 'duplicate_route',
  INVALID_CALLS: 'invalid_calls',
  INVALID_FIELD: 'invalid_field',
  INVALID_HANDLER: 'invalid_handler',
  INVALID_IDENTIFIER: 'invalid_identifier',
  INVALID_OPERATION: 'invalid_operation',
  INVALID_STATEMENT: 'invalid_statement',
  MISSING_HANDLE: 'missing_handle',
  MISSING_REDUCE: 'missing_reduce',
  MISSING_RUN: 'missing_run',
  MODULE_NOT_FOUND: 'module_not_found',
  MODULE_THREW_ON_IMPORT: 'module_threw_on_import',
  NO_DEFAULT_EXPORT: 'no_default_export',
  NOT_PLAIN_OBJECT: 'not_plain_object',
  NOT_SERVICE_DEFINITION: 'not_service_definition',
  SINGLE_OPERATION_RESTRICTION: 'single_operation_restriction',
  UNDECLARED_OPERATION: 'undeclared_operation',
});

const SERVICE_SOURCE_MESSAGE = Object.freeze({
  DEFAULT_EXPORT_NOT_PLAIN_OBJECT:
    'the module default export must be a plain object service definition',
  DEFINITION_ACCESS_THREW:
    'reading the service definition threw; definitions must expose plain data properties',
  DUPLICATE_OPERATION_ID:
    'the same distributed operation descriptor is registered under more than one operation id',
  DUPLICATE_ROUTE: 'another handler already declares this method and path',
  INVALID_CALLS: 'handler calls must be an array of declared operation descriptors',
  INVALID_FIELD: 'must be a non-empty string',
  INVALID_HANDLER:
    'handler must be an http request-handler descriptor with a supported method and a / path',
  INVALID_IDENTIFIER: 'ids must start with a letter and contain only letters and digits',
  INVALID_OPERATION: 'operation must be a distributed-operation descriptor',
  INVALID_STATEMENT:
    'operation statement must be a sql template descriptor with non-empty text',
  MISSING_HANDLE: 'handler is missing its handle function',
  MISSING_REDUCE: 'distributed operation is missing its reduce function',
  MISSING_RUN: 'distributed operation is missing its run function',
  MODULE_NOT_FOUND: 'service module could not be found',
  MODULE_THREW_ON_IMPORT: 'service module threw while being imported',
  NO_DEFAULT_EXPORT: 'service module must have a default export',
  NOT_PLAIN_OBJECT: 'must be a plain object keyed by explicit ids',
  NOT_SERVICE_DEFINITION: 'value must be a defineService descriptor',
  SINGLE_OPERATION_RESTRICTION:
    'a service may declare at most one distributed operation',
  UNDECLARED_OPERATION:
    'handler calls an operation that is not declared in operations',
});

const SERVICE_SOURCE_PATH = Object.freeze({
  HANDLERS: '/handlers',
  NAME: '/name',
  OPERATIONS: '/operations',
  ROOT: '/',
  VERSION: '/version',
});

const SERVICE_SOURCE_STATUS = Object.freeze({
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
});

const ABSOLUTE_URL_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const IDENTIFIER_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;
const IR_HANDLER_KIND = 'request';
const MODULE_NOT_FOUND_ERROR_CODES = Object.freeze([
  'ERR_MODULE_NOT_FOUND',
  'MODULE_NOT_FOUND',
]);
const SUPPORTED_ROUTE_METHODS = new Set(Object.values(HTTP_METHOD));

const MESSAGE_BY_ERROR_CODE = Object.freeze(Object.fromEntries(
  Object.entries(SERVICE_SOURCE_ERROR_CODE)
    .map(([key, code]) => [code, SERVICE_SOURCE_MESSAGE[key]]),
));

// Prototype-checked plainness (deployment-binding-contract idiom) with an
// explicit proxy rejection: proxy traps can lie between reads, so proxies
// never reach the read-once validation below.
function isPlainObject(value) {
  if (!value || typeof value !== 'object' || types.isProxy(value)) {
    return false;
  }
  if (Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function serviceSourceError(code, path) {
  return {code, path, message: MESSAGE_BY_ERROR_CODE[code]};
}

function rejectedResult(errors) {
  const sorted = [...errors].sort((left, right) =>
    `${left.path}:${left.code}`.localeCompare(`${right.path}:${right.code}`));
  return deepFreeze({
    status: SERVICE_SOURCE_STATUS.REJECTED,
    errors: sorted,
  });
}

const POINTER_TILDE = '~';
const POINTER_TILDE_ESCAPE = '~0';
const POINTER_SEPARATOR = '/';
const POINTER_SEPARATOR_ESCAPE = '~1';
const ROUTE_PATH_PREFIX = '/';

function pointerSegment(key) {
  return key
    .replaceAll(POINTER_TILDE, POINTER_TILDE_ESCAPE)
    .replaceAll(POINTER_SEPARATOR, POINTER_SEPARATOR_ESCAPE);
}

function operationPointer(id) {
  return `${SERVICE_SOURCE_PATH.OPERATIONS}/${pointerSegment(id)}`;
}

function handlerPointer(id) {
  return `${SERVICE_SOURCE_PATH.HANDLERS}/${pointerSegment(id)}`;
}

// Inherited properties are invisible to normalization: descriptor fields are
// copied own-key-only into a null-prototype record before any read, so
// Object.prototype pollution can neither satisfy a required field nor inject
// values into the IR. Each own getter still fires exactly once.
function ownRecord(value) {
  const record = Object.create(null);
  for (const key of Object.keys(value)) record[key] = value[key];
  return record;
}

function sqlStatementText(statement) {
  if (!isPlainObject(statement)) return null;
  const {kind, text} = ownRecord(statement);
  if (kind !== AUTHORING_DESCRIPTOR_KIND.SQL_STATEMENT ||
      typeof text !== 'string' || text.length === 0) {
    return null;
  }
  return text;
}

// Reads every operation property exactly once into locals; the returned
// entries are what the IR is built from, so a getter cannot show the
// validator one value and the IR another.
function collectOperations(operations, errors) {
  const collected = {idByDescriptor: new Map(), operations: []};
  if (!isPlainObject(operations)) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.NOT_PLAIN_OBJECT, SERVICE_SOURCE_PATH.OPERATIONS));
    return collected;
  }
  const ids = Object.keys(operations);
  if (ids.length > 1) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.SINGLE_OPERATION_RESTRICTION,
      SERVICE_SOURCE_PATH.OPERATIONS));
  }
  for (const id of ids) {
    const pointer = operationPointer(id);
    if (!IDENTIFIER_PATTERN.test(id)) {
      errors.push(serviceSourceError(
        SERVICE_SOURCE_ERROR_CODE.INVALID_IDENTIFIER, pointer));
    }
    const descriptor = operations[id];
    if (!isPlainObject(descriptor)) {
      errors.push(serviceSourceError(
        SERVICE_SOURCE_ERROR_CODE.INVALID_OPERATION, pointer));
      continue;
    }
    const {kind, reduce, run, statement} = ownRecord(descriptor);
    if (kind !== AUTHORING_DESCRIPTOR_KIND.DISTRIBUTED_OPERATION) {
      errors.push(serviceSourceError(
        SERVICE_SOURCE_ERROR_CODE.INVALID_OPERATION, pointer));
      continue;
    }
    if (collected.idByDescriptor.has(descriptor)) {
      errors.push(serviceSourceError(
        SERVICE_SOURCE_ERROR_CODE.DUPLICATE_OPERATION_ID, pointer));
      continue;
    }
    collected.idByDescriptor.set(descriptor, id);
    const text = sqlStatementText(statement);
    if (text === null) {
      errors.push(serviceSourceError(
        SERVICE_SOURCE_ERROR_CODE.INVALID_STATEMENT, `${pointer}/statement`));
    }
    if (typeof run !== 'function') {
      errors.push(serviceSourceError(
        SERVICE_SOURCE_ERROR_CODE.MISSING_RUN, pointer));
    }
    if (typeof reduce !== 'function') {
      errors.push(serviceSourceError(
        SERVICE_SOURCE_ERROR_CODE.MISSING_REDUCE, pointer));
    }
    collected.operations.push({id, reduce, run, statement: {text}});
  }
  collected.operations.sort((left, right) => left.id.localeCompare(right.id));
  return collected;
}

function collectAllowedOperations(calls, idByDescriptor, pointer, errors) {
  if (!Array.isArray(calls)) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.INVALID_CALLS, `${pointer}/calls`));
    return [];
  }
  const allowed = new Set();
  for (const [index, call] of calls.entries()) {
    const operationId = idByDescriptor.get(call);
    if (operationId === undefined) {
      errors.push(serviceSourceError(
        SERVICE_SOURCE_ERROR_CODE.UNDECLARED_OPERATION,
        `${pointer}/calls/${index}`));
      continue;
    }
    allowed.add(operationId);
  }
  return [...allowed].sort((left, right) => left.localeCompare(right));
}

function isRouteShape(kind, method, routePath) {
  return kind === AUTHORING_DESCRIPTOR_KIND.REQUEST_HANDLER &&
    SUPPORTED_ROUTE_METHODS.has(method) &&
    typeof routePath === 'string' && routePath.startsWith(ROUTE_PATH_PREFIX);
}

function collectHandlers(handlers, idByDescriptor, errors) {
  const collected = [];
  if (!isPlainObject(handlers)) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.NOT_PLAIN_OBJECT, SERVICE_SOURCE_PATH.HANDLERS));
    return collected;
  }
  const declaredRoutes = new Set();
  for (const id of Object.keys(handlers)) {
    const pointer = handlerPointer(id);
    if (!IDENTIFIER_PATTERN.test(id)) {
      errors.push(serviceSourceError(
        SERVICE_SOURCE_ERROR_CODE.INVALID_IDENTIFIER, pointer));
    }
    const descriptor = handlers[id];
    if (!isPlainObject(descriptor)) {
      errors.push(serviceSourceError(
        SERVICE_SOURCE_ERROR_CODE.INVALID_HANDLER, pointer));
      continue;
    }
    const {calls, handle, kind, method, path: routePath} = ownRecord(descriptor);
    if (!isRouteShape(kind, method, routePath)) {
      errors.push(serviceSourceError(
        SERVICE_SOURCE_ERROR_CODE.INVALID_HANDLER, pointer));
      continue;
    }
    const routeKey = `${method} ${routePath}`;
    if (declaredRoutes.has(routeKey)) {
      errors.push(serviceSourceError(
        SERVICE_SOURCE_ERROR_CODE.DUPLICATE_ROUTE, pointer));
    }
    declaredRoutes.add(routeKey);
    if (typeof handle !== 'function') {
      errors.push(serviceSourceError(
        SERVICE_SOURCE_ERROR_CODE.MISSING_HANDLE, pointer));
    }
    const allowedOperations =
      collectAllowedOperations(calls, idByDescriptor, pointer, errors);
    collected.push({
      allowedOperations,
      handle,
      id,
      kind: IR_HANDLER_KIND,
      method,
      path: routePath,
    });
  }
  collected.sort((left, right) => left.id.localeCompare(right.id));
  return collected;
}

function normalizeDefinition(definition) {
  if (!isPlainObject(definition)) {
    return rejectedResult([serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.NOT_SERVICE_DEFINITION, SERVICE_SOURCE_PATH.ROOT)]);
  }
  const {handlers, kind, name, operations, version} = ownRecord(definition);
  if (kind !== AUTHORING_DESCRIPTOR_KIND.SERVICE_DEFINITION) {
    return rejectedResult([serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.NOT_SERVICE_DEFINITION, SERVICE_SOURCE_PATH.ROOT)]);
  }
  const errors = [];
  if (typeof name !== 'string' || name.length === 0) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.INVALID_FIELD, SERVICE_SOURCE_PATH.NAME));
  }
  if (typeof version !== 'string' || version.length === 0) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.INVALID_FIELD, SERVICE_SOURCE_PATH.VERSION));
  }
  const collectedOperations = collectOperations(operations, errors);
  const collectedHandlers =
    collectHandlers(handlers, collectedOperations.idByDescriptor, errors);
  if (errors.length > 0) return rejectedResult(errors);
  return deepFreeze({
    status: SERVICE_SOURCE_STATUS.ACCEPTED,
    ir: {
      handlers: collectedHandlers,
      name,
      operations: collectedOperations.operations,
      version,
    },
  });
}

function normalizeServiceDefinition(definition) {
  try {
    return normalizeDefinition(definition);
  } catch (_error) {
    return rejectedResult([serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.DEFINITION_ACCESS_THREW,
      SERVICE_SOURCE_PATH.ROOT)]);
  }
}

function toModuleUrl(moduleUrlOrPath) {
  if (moduleUrlOrPath instanceof URL) return moduleUrlOrPath.href;
  const source = String(moduleUrlOrPath);
  return ABSOLUTE_URL_PATTERN.test(source) ? source : pathToFileURL(source).href;
}

async function normalizeServiceSource(
  moduleUrlOrPath, {load = (url) => import(url)} = {}) {
  let module;
  try {
    module = await load(toModuleUrl(moduleUrlOrPath));
  } catch (caught) {
    const code = MODULE_NOT_FOUND_ERROR_CODES.includes(caught?.code) ?
      SERVICE_SOURCE_ERROR_CODE.MODULE_NOT_FOUND :
      SERVICE_SOURCE_ERROR_CODE.MODULE_THREW_ON_IMPORT;
    return rejectedResult([serviceSourceError(code, SERVICE_SOURCE_PATH.ROOT)]);
  }
  let defaultExport;
  try {
    defaultExport = module?.default;
  } catch (_error) {
    return rejectedResult([serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.DEFINITION_ACCESS_THREW,
      SERVICE_SOURCE_PATH.ROOT)]);
  }
  if (defaultExport === undefined) {
    return rejectedResult([serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.NO_DEFAULT_EXPORT, SERVICE_SOURCE_PATH.ROOT)]);
  }
  if (!isPlainObject(defaultExport)) {
    return rejectedResult([serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.DEFAULT_EXPORT_NOT_PLAIN_OBJECT,
      SERVICE_SOURCE_PATH.ROOT)]);
  }
  return normalizeServiceDefinition(defaultExport);
}

export {
  SERVICE_SOURCE_ERROR_CODE,
  SERVICE_SOURCE_MESSAGE,
  SERVICE_SOURCE_PATH,
  SERVICE_SOURCE_STATUS,
  normalizeServiceDefinition,
  normalizeServiceSource,
};
