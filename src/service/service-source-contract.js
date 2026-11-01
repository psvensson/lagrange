/**
 * Structural contract for code-first lagrange.service.js sources.
 *
 * This module is the single normalization owner: it turns a service
 * module's default-export defineService descriptor into an immutable IR
 * whose route/mount and operation identities come only from explicit object
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
import {
  assertSelectorParameterCorrespondence,
  inspectSelectorPlaceholders,
  normalizeCallSelectorParameterSchema,
} from './call-selector-parameter-contract.js';

const SERVICE_SOURCE_ERROR_CODE = Object.freeze({
  DEFAULT_EXPORT_NOT_PLAIN_OBJECT: 'default_export_not_plain_object',
  DEFINITION_ACCESS_THREW: 'definition_access_threw',
  DUPLICATE_OPERATION_ID: 'duplicate_operation_id',
  DUPLICATE_ROUTE: 'duplicate_route',
  INVALID_CALLS: 'invalid_calls',
  INVALID_DEPENDENCIES: 'invalid_dependencies',
  INVALID_FIELD: 'invalid_field',
  INVALID_HANDLER: 'invalid_handler',
  INVALID_IDENTIFIER: 'invalid_identifier',
  INVALID_MOUNT: 'invalid_mount',
  INVALID_OPERATION: 'invalid_operation',
  INVALID_PARAMETERS: 'invalid_parameters',
  INVALID_STATEMENT: 'invalid_statement',
  LEGACY_HANDLERS_UNSUPPORTED: 'legacy_handlers_unsupported',
  MISSING_FETCH: 'missing_fetch',
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
  INVALID_DEPENDENCIES:
    'dependencies must be an array of canonical call binding names',
  INVALID_FIELD: 'must be a non-empty string',
  INVALID_HANDLER:
    'handler must be an http request-handler descriptor with a supported method and a / path',
  INVALID_IDENTIFIER: 'ids must start with a letter and contain only letters and digits',
  INVALID_MOUNT:
    'mount must declare a valid host and path-segment prefix starting with /',
  INVALID_OPERATION: 'operation must be a distributed-operation descriptor',
  INVALID_PARAMETERS:
    'operation parameters must declare typed selector parameter slots matching the statement placeholders',
  INVALID_STATEMENT:
    'operation statement must be a sql template descriptor with non-empty text',
  LEGACY_HANDLERS_UNSUPPORTED:
    'custom handlers DSL is superseded by defineService({ name, version, operations, fetch }); migrate routes to a Hono/Fetch entry and regenerate',
  MISSING_FETCH:
    'service definition must provide a fetch(request, context) function',
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
  DEPENDENCIES: '/dependencies',
  FETCH: '/fetch',
  HANDLERS: '/handlers',
  MOUNT: '/mount',
  NAME: '/name',
  OPERATIONS: '/operations',
  ROOT: '/',
  VERSION: '/version',
});

const SERVICE_SOURCE_STATUS = Object.freeze({
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
});

const IR_ENTRY_KIND = Object.freeze({
  FETCH: 'fetch',
  HANDLERS: 'handlers',
});

const ABSOLUTE_URL_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const IDENTIFIER_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;
const DEPENDENCY_BINDING_PATTERN = /^[a-z][a-z0-9-]{0,127}$/u;
const MOUNT_HOST_PATTERN = /^(?:\*|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?)$/u;
const MOUNT_PATH_PREFIX_PATTERN = /^\/(?:[a-zA-Z0-9._~-]+(?:\/[a-zA-Z0-9._~-]+)*)?$/u;
const DOT_SEGMENT_SINGLE = '.';
const DOT_SEGMENT_DOUBLE = '..';
const DEFAULT_MOUNT_HOST = '*';
const DEFAULT_MOUNT_PATH_PREFIX = '/';
const FETCH_HANDLER_ID = 'fetch';
const FETCH_HANDLER_KIND = 'fetch';
const FETCH_HANDLER_METHOD = 'ANY';
const IR_HANDLER_KIND = 'request';

const IR_TARGET = Object.freeze({
  SERVICE_CELL: 'service-cell',
  SERVICE_CELL_V2: 'service-cell-v2',
});
const MODULE_NOT_FOUND_ERROR_CODES = Object.freeze([
  'ERR_MODULE_NOT_FOUND',
  'MODULE_NOT_FOUND',
]);
const SUPPORTED_ROUTE_METHODS = new Set(Object.values(HTTP_METHOD));

const MESSAGE_BY_ERROR_CODE = Object.freeze(Object.fromEntries(
  Object.entries(SERVICE_SOURCE_ERROR_CODE)
    .map(([key, code]) => [code, SERVICE_SOURCE_MESSAGE[key]]),
));

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

function ownRecord(value) {
  const record = Object.create(null);
  for (const key of Object.keys(value)) record[key] = value[key];
  return record;
}

const NOT_SQL_STATEMENT_TEXT = null;

function sqlStatementText(statement) {
  if (!isPlainObject(statement)) return NOT_SQL_STATEMENT_TEXT;
  const {kind, text} = ownRecord(statement);
  if (kind !== AUTHORING_DESCRIPTOR_KIND.SQL_STATEMENT ||
      typeof text !== 'string' || text.length === 0) {
    return NOT_SQL_STATEMENT_TEXT;
  }
  return text;
}

function validateOperationParameters(pointer, text, rawParameters, errors) {
  if (rawParameters === undefined) {
    if (text === null) return undefined;
    try {
      const info = inspectSelectorPlaceholders(text);
      if (info.logicalCount > 0) {
        errors.push(serviceSourceError(
          SERVICE_SOURCE_ERROR_CODE.INVALID_PARAMETERS,
          `${pointer}/parameters`));
      }
    } catch {
      errors.push(serviceSourceError(
        SERVICE_SOURCE_ERROR_CODE.INVALID_STATEMENT, `${pointer}/statement`));
    }
    return undefined;
  }
  try {
    const normalized = normalizeCallSelectorParameterSchema(rawParameters);
    if (text !== null) {
      assertSelectorParameterCorrespondence(text, normalized);
    }
    return normalized;
  } catch {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.INVALID_PARAMETERS, `${pointer}/parameters`));
    return undefined;
  }
}

function validateOperationDescriptor(id, descriptor, collected, errors) {
  const pointer = operationPointer(id);
  if (!IDENTIFIER_PATTERN.test(id)) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.INVALID_IDENTIFIER, pointer));
  }
  if (!isPlainObject(descriptor)) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.INVALID_OPERATION, pointer));
    return;
  }
  const {kind, params, parameters, reduce, run, statement} =
    ownRecord(descriptor);
  if (kind !== AUTHORING_DESCRIPTOR_KIND.DISTRIBUTED_OPERATION) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.INVALID_OPERATION, pointer));
    return;
  }
  if (collected.idByDescriptor.has(descriptor)) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.DUPLICATE_OPERATION_ID, pointer));
    return;
  }
  collected.idByDescriptor.set(descriptor, id);
  const text = sqlStatementText(statement);
  if (text === null) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.INVALID_STATEMENT, `${pointer}/statement`));
  }
  const rawParameters = parameters !== undefined ? parameters : params;
  const normalizedParameters = validateOperationParameters(
    pointer, text, rawParameters, errors);
  if (typeof run !== 'function') {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.MISSING_RUN, pointer));
  }
  if (typeof reduce !== 'function') {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.MISSING_REDUCE, pointer));
  }
  collected.operations.push({
    id,
    ...(normalizedParameters !== undefined ?
      {parameters: normalizedParameters} :
      {}),
    reduce,
    run,
    statement: {text},
  });
}

function collectOperations(operations, errors, options) {
  const collected = {idByDescriptor: new Map(), operations: []};
  if (!isPlainObject(operations)) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.NOT_PLAIN_OBJECT, SERVICE_SOURCE_PATH.OPERATIONS));
    return collected;
  }
  const ids = Object.keys(operations);
  if (ids.length > 1 && options.multiOperationTarget !== true) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.SINGLE_OPERATION_RESTRICTION,
      SERVICE_SOURCE_PATH.OPERATIONS));
  }
  for (const id of ids) {
    validateOperationDescriptor(id, operations[id], collected, errors);
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

function validateHandlerDescriptor(
  id,
  descriptor,
  declaredRoutes,
  idByDescriptor,
  collected,
  errors,
) {
  const pointer = handlerPointer(id);
  if (!IDENTIFIER_PATTERN.test(id)) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.INVALID_IDENTIFIER, pointer));
  }
  if (!isPlainObject(descriptor)) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.INVALID_HANDLER, pointer));
    return;
  }
  const {calls, handle, kind, method, path: routePath} = ownRecord(descriptor);
  if (!isRouteShape(kind, method, routePath)) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.INVALID_HANDLER, pointer));
    return;
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

function collectHandlers(handlers, idByDescriptor, errors) {
  const collected = [];
  if (!isPlainObject(handlers)) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.NOT_PLAIN_OBJECT, SERVICE_SOURCE_PATH.HANDLERS));
    return collected;
  }
  const declaredRoutes = new Set();
  for (const id of Object.keys(handlers)) {
    validateHandlerDescriptor(
      id,
      handlers[id],
      declaredRoutes,
      idByDescriptor,
      collected,
      errors,
    );
  }
  collected.sort((left, right) => left.id.localeCompare(right.id));
  return collected;
}

function isValidMountPathPrefix(pathPrefix) {
  if (typeof pathPrefix !== 'string' || !MOUNT_PATH_PREFIX_PATTERN.test(pathPrefix)) {
    return false;
  }
  const segments = pathPrefix.split(POINTER_SEPARATOR).filter(Boolean);
  return !segments.some(
    (segment) => segment === DOT_SEGMENT_SINGLE || segment === DOT_SEGMENT_DOUBLE,
  );
}

function extractMountCandidate(mount) {
  if (mount === undefined) {
    return {host: DEFAULT_MOUNT_HOST, pathPrefix: DEFAULT_MOUNT_PATH_PREFIX};
  }
  if (typeof mount === 'string') {
    return {host: DEFAULT_MOUNT_HOST, pathPrefix: mount};
  }
  if (!isPlainObject(mount)) {
    return null;
  }
  const record = ownRecord(mount);
  const rawHost = record.host === undefined ? DEFAULT_MOUNT_HOST : record.host;
  const rawPrefix = record.pathPrefix ?? record.path_prefix ?? DEFAULT_MOUNT_PATH_PREFIX;
  if (typeof rawHost !== 'string') {
    return null;
  }
  return {host: rawHost.toLowerCase(), pathPrefix: rawPrefix};
}

function normalizeServiceMount(mount, errors) {
  const candidate = extractMountCandidate(mount);
  if (
    candidate === null ||
    !MOUNT_HOST_PATTERN.test(candidate.host) ||
    !isValidMountPathPrefix(candidate.pathPrefix)
  ) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.INVALID_MOUNT,
      SERVICE_SOURCE_PATH.MOUNT,
    ));
    return {host: DEFAULT_MOUNT_HOST, pathPrefix: DEFAULT_MOUNT_PATH_PREFIX};
  }
  return candidate;
}

function normalizeServiceDependencies(dependencies, errors) {
  if (dependencies === undefined) {
    return [];
  }
  if (!Array.isArray(dependencies)) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.INVALID_DEPENDENCIES,
      SERVICE_SOURCE_PATH.DEPENDENCIES,
    ));
    return [];
  }
  const unique = new Set();
  for (const entry of dependencies) {
    if (
      typeof entry !== 'string' ||
      !DEPENDENCY_BINDING_PATTERN.test(entry) ||
      unique.has(entry)
    ) {
      errors.push(serviceSourceError(
        SERVICE_SOURCE_ERROR_CODE.INVALID_DEPENDENCIES,
        SERVICE_SOURCE_PATH.DEPENDENCIES,
      ));
      return [];
    }
    unique.add(entry);
  }
  return [...unique].sort((left, right) => left.localeCompare(right));
}

function isFetchDefinitionMode(record, options) {
  return (
    options.requireFetchContract === true ||
    record.fetch !== undefined ||
    record.mount !== undefined ||
    record.dependencies !== undefined
  );
}

function normalizeFetchEntryDefinition(record, errors) {
  if (record.handlers !== undefined) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.LEGACY_HANDLERS_UNSUPPORTED,
      SERVICE_SOURCE_PATH.HANDLERS,
    ));
  }
  if (typeof record.fetch !== 'function') {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.MISSING_FETCH,
      SERVICE_SOURCE_PATH.FETCH,
    ));
  }
  const operationsInput = record.operations === undefined ? {} : record.operations;
  const collectedOperations = collectOperations(
    operationsInput,
    errors,
    {multiOperationTarget: true},
  );
  const mount = normalizeServiceMount(record.mount, errors);
  const dependencies = normalizeServiceDependencies(record.dependencies, errors);
  if (errors.length > 0) {
    return rejectedResult(errors);
  }
  const allowedOperations = collectedOperations.operations.map((op) => op.id);
  const fetchHandler = {
    allowedDependencies: dependencies,
    allowedOperations,
    handle: record.fetch,
    host: mount.host,
    id: FETCH_HANDLER_ID,
    kind: FETCH_HANDLER_KIND,
    method: FETCH_HANDLER_METHOD,
    path: mount.pathPrefix,
    pathPrefix: mount.pathPrefix,
  };
  return deepFreeze({
    status: SERVICE_SOURCE_STATUS.ACCEPTED,
    ir: {
      allowedDependencies: dependencies,
      allowedOperations,
      dependencies,
      entryKind: IR_ENTRY_KIND.FETCH,
      fetch: record.fetch,
      handlers: [fetchHandler],
      mount,
      name: record.name,
      operations: collectedOperations.operations,
      target: IR_TARGET.SERVICE_CELL_V2,
      version: record.version,
    },
  });
}

function validateHeaderFields(record, errors) {
  if (typeof record.name !== 'string' || record.name.length === 0) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.INVALID_FIELD, SERVICE_SOURCE_PATH.NAME));
  }
  if (typeof record.version !== 'string' || record.version.length === 0) {
    errors.push(serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.INVALID_FIELD, SERVICE_SOURCE_PATH.VERSION));
  }
}

function normalizeDefinition(definition, options = {}) {
  if (!isPlainObject(definition)) {
    return rejectedResult([serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.NOT_SERVICE_DEFINITION, SERVICE_SOURCE_PATH.ROOT)]);
  }
  const record = ownRecord(definition);
  if (record.kind !== AUTHORING_DESCRIPTOR_KIND.SERVICE_DEFINITION) {
    return rejectedResult([serviceSourceError(
      SERVICE_SOURCE_ERROR_CODE.NOT_SERVICE_DEFINITION, SERVICE_SOURCE_PATH.ROOT)]);
  }
  const errors = [];
  validateHeaderFields(record, errors);
  if (isFetchDefinitionMode(record, options)) {
    return normalizeFetchEntryDefinition(record, errors);
  }
  const collectedOperations = collectOperations(
    record.operations,
    errors,
    options,
  );
  const collectedHandlers = collectHandlers(
    record.handlers,
    collectedOperations.idByDescriptor,
    errors,
  );
  if (errors.length > 0) return rejectedResult(errors);
  return deepFreeze({
    status: SERVICE_SOURCE_STATUS.ACCEPTED,
    ir: {
      entryKind: IR_ENTRY_KIND.HANDLERS,
      handlers: collectedHandlers,
      name: record.name,
      operations: collectedOperations.operations,
      target: options.multiOperationTarget === true ?
        IR_TARGET.SERVICE_CELL_V2 :
        IR_TARGET.SERVICE_CELL,
      version: record.version,
    },
  });
}

function normalizeServiceDefinition(definition, options) {
  try {
    return normalizeDefinition(definition, options);
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
  moduleUrlOrPath, {load = (url) => import(url), ...options} = {}) {
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
  return normalizeServiceDefinition(defaultExport, options);
}

export {
  IR_ENTRY_KIND,
  IR_TARGET,
  SERVICE_SOURCE_ERROR_CODE,
  SERVICE_SOURCE_MESSAGE,
  SERVICE_SOURCE_PATH,
  SERVICE_SOURCE_STATUS,
  normalizeServiceDefinition,
  normalizeServiceSource,
};
