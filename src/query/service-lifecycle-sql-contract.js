/**
 * Exact SQL ingress contract for service lifecycle control.
 *
 * Lifecycle statements are classified before authorization. Parsing remains
 * deliberately narrow: the statement carries one JSON bind parameter while
 * the authenticated session supplies all security identity.
 */

import {SERVICE_LIFECYCLE_COMMAND as SERVICE_LIFECYCLE_SQL_COMMAND} from
  '../service/service-lifecycle-command-contract.js';

const SERVICE_LIFECYCLE_SQL_CLASSIFICATION = Object.freeze({
  LIFECYCLE: 'service_lifecycle',
  ORDINARY: 'ordinary_sql',
});

const SERVICE_LIFECYCLE_EXECUTION_DISPOSITION = Object.freeze({
  HANDLED: 'handled',
  ORDINARY_SQL: 'ordinary_sql',
});

const SERVICE_LIFECYCLE_SQL_ERROR_CODE = Object.freeze({
  INVALID_GRAMMAR: 'service_lifecycle_invalid_grammar',
  INVALID_PARAMETER: 'service_lifecycle_invalid_parameter',
  INVALID_PAYLOAD: 'service_lifecycle_invalid_payload',
  PAYLOAD_TOO_LARGE: 'service_lifecycle_payload_too_large',
});

const SERVICE_LIFECYCLE_SQL_ERROR_PATH = Object.freeze({
  PARAMETERS: '/parameters',
  PAYLOAD: '/payload',
  STATEMENT: '/statement',
});

const SERVICE_LIFECYCLE_SQL_MESSAGE = Object.freeze({
  GRAMMAR_UNSUPPORTED:
    'service lifecycle SQL does not match the supported parameterized grammar',
  JSON_PARAMETER_REQUIRED:
    'service lifecycle SQL requires exactly one JSON string parameter',
  PAYLOAD_INVALID: 'service lifecycle payload must be a JSON object',
  PAYLOAD_TOO_LARGE: 'service lifecycle payload exceeds its size bound',
  SHOW_ALL_PARAMETERS_FORBIDDEN: 'SHOW SERVICES does not accept parameters',
});

const SERVICE_LIFECYCLE_SQL_LITERAL = Object.freeze({
  ERROR_NAME: 'ServiceLifecycleSqlError',
  UTF8: 'utf8',
});

const MUTATION_PAYLOAD_FIELDS = Object.freeze({
  [SERVICE_LIFECYCLE_SQL_COMMAND.CALL_BINDING]: Object.freeze([
    'schema_version', 'name', 'arguments',
  ]),
  [SERVICE_LIFECYCLE_SQL_COMMAND.CONFIGURE_ACCESS]: Object.freeze([
    'schema_version', 'binding_name', 'tables',
  ]),
  [SERVICE_LIFECYCLE_SQL_COMMAND.CREATE_BINDING]: Object.freeze([
    'schema_version', 'name', 'target', 'source', 'budgets',
  ]),
  [SERVICE_LIFECYCLE_SQL_COMMAND.INSTALL]: Object.freeze([
    'artifact_source', 'config', 'idempotency_key', 'manifest',
  ]),
  [SERVICE_LIFECYCLE_SQL_COMMAND.UPGRADE]: Object.freeze([
    'artifact_source', 'config', 'idempotency_key', 'manifest',
  ]),
  [SERVICE_LIFECYCLE_SQL_COMMAND.REMOVE]: Object.freeze([
    'idempotency_key', 'service_name',
  ]),
  [SERVICE_LIFECYCLE_SQL_COMMAND.SHOW_ONE]: Object.freeze([
    'service_name',
  ]),
});

const REQUIRED_PAYLOAD_FIELDS = Object.freeze({
  [SERVICE_LIFECYCLE_SQL_COMMAND.CALL_BINDING]: Object.freeze([
    'schema_version', 'name',
  ]),
  [SERVICE_LIFECYCLE_SQL_COMMAND.CONFIGURE_ACCESS]: Object.freeze([
    'schema_version', 'binding_name', 'tables',
  ]),
  [SERVICE_LIFECYCLE_SQL_COMMAND.CREATE_BINDING]: Object.freeze([
    'schema_version', 'name', 'target', 'source', 'budgets',
  ]),
  [SERVICE_LIFECYCLE_SQL_COMMAND.INSTALL]: Object.freeze([
    'artifact_source', 'idempotency_key', 'manifest',
  ]),
  [SERVICE_LIFECYCLE_SQL_COMMAND.UPGRADE]: Object.freeze([
    'artifact_source', 'idempotency_key', 'manifest',
  ]),
  [SERVICE_LIFECYCLE_SQL_COMMAND.REMOVE]: Object.freeze([
    'idempotency_key', 'service_name',
  ]),
  [SERVICE_LIFECYCLE_SQL_COMMAND.SHOW_ONE]: Object.freeze([
    'service_name',
  ]),
});

const MAX_LIFECYCLE_PAYLOAD_BYTES = 1024 * 1024;
const SQL_COMMENT_TOKEN = Object.freeze({
  BLOCK_CLOSE: '*/',
  BLOCK_OPEN: '/*',
  LINE: '--',
});
const SQL_COMMENT_SCAN_UNTERMINATED = -1;
const SQL_LINE_BREAK_PATTERN = /[\r\n]/u;
const SQL_WHITESPACE_PATTERN = /\s/u;

const COMMAND_PREFIX = Object.freeze([
  Object.freeze({
    pattern: /^\s*CALL\s+BINDING\b/iu,
    command: SERVICE_LIFECYCLE_SQL_COMMAND.CALL_BINDING,
  }),
  Object.freeze({
    pattern: /^\s*CONFIGURE\s+SERVICE\s+ACCESS\b/iu,
    command: SERVICE_LIFECYCLE_SQL_COMMAND.CONFIGURE_ACCESS,
  }),
  Object.freeze({
    pattern: /^\s*CREATE\s+BINDING\b/iu,
    command: SERVICE_LIFECYCLE_SQL_COMMAND.CREATE_BINDING,
  }),
  Object.freeze({
    pattern: /^\s*INSTALL\b/iu,
    command: SERVICE_LIFECYCLE_SQL_COMMAND.INSTALL,
  }),
  Object.freeze({
    pattern: /^\s*UPGRADE\b/iu,
    command: SERVICE_LIFECYCLE_SQL_COMMAND.UPGRADE,
  }),
  Object.freeze({
    pattern: /^\s*REMOVE\b/iu,
    command: SERVICE_LIFECYCLE_SQL_COMMAND.REMOVE,
  }),
  Object.freeze({
    pattern: /^\s*SHOW\s+SERVICES?\b/iu,
    command: SERVICE_LIFECYCLE_SQL_COMMAND.SHOW_ONE,
  }),
]);

const EXACT_STATEMENT = Object.freeze({
  [SERVICE_LIFECYCLE_SQL_COMMAND.CALL_BINDING]:
    /^\s*CALL\s+BINDING\s+\$1\s*;?\s*$/iu,
  [SERVICE_LIFECYCLE_SQL_COMMAND.CONFIGURE_ACCESS]:
    /^\s*CONFIGURE\s+SERVICE\s+ACCESS\s+\$1\s*;?\s*$/iu,
  [SERVICE_LIFECYCLE_SQL_COMMAND.CREATE_BINDING]:
    /^\s*CREATE\s+BINDING\s+\$1\s*;?\s*$/iu,
  [SERVICE_LIFECYCLE_SQL_COMMAND.INSTALL]:
    /^\s*INSTALL\s+SERVICE\s+\$1\s*;?\s*$/iu,
  [SERVICE_LIFECYCLE_SQL_COMMAND.UPGRADE]:
    /^\s*UPGRADE\s+SERVICE\s+\$1\s*;?\s*$/iu,
  [SERVICE_LIFECYCLE_SQL_COMMAND.REMOVE]:
    /^\s*REMOVE\s+SERVICE\s+\$1\s*;?\s*$/iu,
  [SERVICE_LIFECYCLE_SQL_COMMAND.SHOW_ONE]:
    /^\s*SHOW\s+SERVICE\s+\$1\s*;?\s*$/iu,
  [SERVICE_LIFECYCLE_SQL_COMMAND.SHOW_ALL]:
    /^\s*SHOW\s+SERVICES\s*;?\s*$/iu,
});

class ServiceLifecycleSqlError extends Error {
  constructor(code, path, message) {
    super(message);
    this.name = SERVICE_LIFECYCLE_SQL_LITERAL.ERROR_NAME;
    this.code = code;
    this.path = path;
  }
}

function sqlFailure(code, path, message) {
  throw new ServiceLifecycleSqlError(code, path, message);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function scanLineCommentEnd(statement, start) {
  let cursor = start + SQL_COMMENT_TOKEN.LINE.length;
  while (cursor < statement.length &&
      !SQL_LINE_BREAK_PATTERN.test(statement[cursor])) {
    cursor += 1;
  }
  while (cursor < statement.length &&
      SQL_LINE_BREAK_PATTERN.test(statement[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function scanBlockCommentEnd(statement, start) {
  let cursor = start + SQL_COMMENT_TOKEN.BLOCK_OPEN.length;
  let depth = 1;
  while (cursor < statement.length) {
    if (statement.startsWith(SQL_COMMENT_TOKEN.BLOCK_OPEN, cursor)) {
      depth += 1;
      cursor += SQL_COMMENT_TOKEN.BLOCK_OPEN.length;
      continue;
    }
    if (statement.startsWith(SQL_COMMENT_TOKEN.BLOCK_CLOSE, cursor)) {
      depth -= 1;
      cursor += SQL_COMMENT_TOKEN.BLOCK_CLOSE.length;
      if (depth === 0) return cursor;
      continue;
    }
    cursor += 1;
  }
  return SQL_COMMENT_SCAN_UNTERMINATED;
}

function leadingSqlExecutableOffset(statement) {
  let cursor = 0;
  while (cursor < statement.length) {
    while (cursor < statement.length &&
        SQL_WHITESPACE_PATTERN.test(statement[cursor])) {
      cursor += 1;
    }
    if (statement.startsWith(SQL_COMMENT_TOKEN.LINE, cursor)) {
      cursor = scanLineCommentEnd(statement, cursor);
      continue;
    }
    if (statement.startsWith(SQL_COMMENT_TOKEN.BLOCK_OPEN, cursor)) {
      const next = scanBlockCommentEnd(statement, cursor);
      if (next === SQL_COMMENT_SCAN_UNTERMINATED) return cursor;
      cursor = next;
      continue;
    }
    return cursor;
  }
  return cursor;
}

function classifyServiceLifecycleSql(statement) {
  if (typeof statement !== 'string') {
    return Object.freeze({
      kind: SERVICE_LIFECYCLE_SQL_CLASSIFICATION.ORDINARY,
    });
  }
  const executableStatement = statement.slice(
    leadingSqlExecutableOffset(statement),
  );
  for (const candidate of COMMAND_PREFIX) {
    if (!candidate.pattern.test(executableStatement)) continue;
    const showAll = candidate.command === SERVICE_LIFECYCLE_SQL_COMMAND.SHOW_ONE &&
      EXACT_STATEMENT[SERVICE_LIFECYCLE_SQL_COMMAND.SHOW_ALL]
        .test(executableStatement);
    return Object.freeze({
      kind: SERVICE_LIFECYCLE_SQL_CLASSIFICATION.LIFECYCLE,
      command: showAll ?
        SERVICE_LIFECYCLE_SQL_COMMAND.SHOW_ALL :
        candidate.command,
    });
  }
  return Object.freeze({kind: SERVICE_LIFECYCLE_SQL_CLASSIFICATION.ORDINARY});
}

function parsePayloadParameter(parameters) {
  if (!Array.isArray(parameters) || parameters.length !== 1 ||
      typeof parameters[0] !== 'string') {
    sqlFailure(
      SERVICE_LIFECYCLE_SQL_ERROR_CODE.INVALID_PARAMETER,
      SERVICE_LIFECYCLE_SQL_ERROR_PATH.PARAMETERS,
      SERVICE_LIFECYCLE_SQL_MESSAGE.JSON_PARAMETER_REQUIRED,
    );
  }
  if (Buffer.byteLength(
    parameters[0], SERVICE_LIFECYCLE_SQL_LITERAL.UTF8,
  ) > MAX_LIFECYCLE_PAYLOAD_BYTES) {
    sqlFailure(
      SERVICE_LIFECYCLE_SQL_ERROR_CODE.PAYLOAD_TOO_LARGE,
      SERVICE_LIFECYCLE_SQL_ERROR_PATH.PAYLOAD,
      SERVICE_LIFECYCLE_SQL_MESSAGE.PAYLOAD_TOO_LARGE,
    );
  }
  let payload;
  try {
    payload = JSON.parse(parameters[0]);
  } catch (_error) {
    sqlFailure(
      SERVICE_LIFECYCLE_SQL_ERROR_CODE.INVALID_PAYLOAD,
      SERVICE_LIFECYCLE_SQL_ERROR_PATH.PAYLOAD,
      SERVICE_LIFECYCLE_SQL_MESSAGE.PAYLOAD_INVALID,
    );
  }
  if (!isPlainObject(payload)) {
    sqlFailure(
      SERVICE_LIFECYCLE_SQL_ERROR_CODE.INVALID_PAYLOAD,
      SERVICE_LIFECYCLE_SQL_ERROR_PATH.PAYLOAD,
      SERVICE_LIFECYCLE_SQL_MESSAGE.PAYLOAD_INVALID,
    );
  }
  return payload;
}

function validatePayloadShape(command, payload) {
  const allowed = MUTATION_PAYLOAD_FIELDS[command];
  const required = REQUIRED_PAYLOAD_FIELDS[command];
  for (const field of Object.keys(payload)) {
    if (!allowed.includes(field)) {
      sqlFailure(
        SERVICE_LIFECYCLE_SQL_ERROR_CODE.INVALID_PAYLOAD,
        `${SERVICE_LIFECYCLE_SQL_ERROR_PATH.PAYLOAD}/${field}`,
        `unsupported service lifecycle payload field: ${field}`,
      );
    }
  }
  for (const field of required) {
    if (!Object.hasOwn(payload, field)) {
      sqlFailure(
        SERVICE_LIFECYCLE_SQL_ERROR_CODE.INVALID_PAYLOAD,
        `${SERVICE_LIFECYCLE_SQL_ERROR_PATH.PAYLOAD}/${field}`,
        `service lifecycle payload requires ${field}`,
      );
    }
  }
}

function parseServiceLifecycleSql(statement, parameters = []) {
  const classification = classifyServiceLifecycleSql(statement);
  if (classification.kind !== SERVICE_LIFECYCLE_SQL_CLASSIFICATION.LIFECYCLE) {
    return classification;
  }
  const command = classification.command;
  if (!EXACT_STATEMENT[command].test(statement)) {
    sqlFailure(
      SERVICE_LIFECYCLE_SQL_ERROR_CODE.INVALID_GRAMMAR,
      SERVICE_LIFECYCLE_SQL_ERROR_PATH.STATEMENT,
      SERVICE_LIFECYCLE_SQL_MESSAGE.GRAMMAR_UNSUPPORTED,
    );
  }
  if (command === SERVICE_LIFECYCLE_SQL_COMMAND.SHOW_ALL) {
    if (!Array.isArray(parameters) || parameters.length !== 0) {
      sqlFailure(
        SERVICE_LIFECYCLE_SQL_ERROR_CODE.INVALID_PARAMETER,
        SERVICE_LIFECYCLE_SQL_ERROR_PATH.PARAMETERS,
        SERVICE_LIFECYCLE_SQL_MESSAGE.SHOW_ALL_PARAMETERS_FORBIDDEN,
      );
    }
    return Object.freeze({...classification, payload: Object.freeze({})});
  }
  const payload = parsePayloadParameter(parameters);
  validatePayloadShape(command, payload);
  return Object.freeze({...classification, payload: Object.freeze(payload)});
}

export {
  SERVICE_LIFECYCLE_SQL_CLASSIFICATION,
  SERVICE_LIFECYCLE_EXECUTION_DISPOSITION,
  SERVICE_LIFECYCLE_SQL_COMMAND,
  SERVICE_LIFECYCLE_SQL_ERROR_CODE,
  ServiceLifecycleSqlError,
  classifyServiceLifecycleSql,
  parseServiceLifecycleSql,
};
