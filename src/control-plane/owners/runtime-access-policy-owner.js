import {TABLES} from '../../constants/index.js';
import {deriveRequestServiceDefinitionId} from
  './request-binding-service-definition-contract.js';
import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';

const RUNTIME_ACCESS_POLICY_OWNER_NAME = 'runtime-access-policy-owner';
const RUNTIME_ACCESS_POLICY_SCHEMA_VERSION = 1;
const RUNTIME_ACCESS_POLICY_CONFIG_KEY_PREFIX = 'runtime.access.service.';
const RUNTIME_ACCESS_POLICY_VALUE_TYPE = 'json';
const RUNTIME_ACCESS_POLICY_DESCRIPTION =
  'Directly managed runtime table access policy';
const RUNTIME_ACCESS_POLICY_DEFAULT_VALUE = '{}';
const RUNTIME_ACCESS_POLICY_MAX_TABLE_SLOTS = 1024;
const RUNTIME_ACCESS_POLICY_TABLE_PATTERN =
  /^table:global\.[a-z_][a-z0-9_]*$/u;
const RUNTIME_ACCESS_POLICY_BINDING_PATTERN = /^[a-z][a-z0-9-]{0,127}$/u;
const RUNTIME_ACCESS_POLICY_SERVICE_ID_PATTERN = /^[a-z0-9-]{1,256}$/u;
const SYSTEM_TABLE_IDENTITIES = new Set(
  Object.values(TABLES).map((table) => `table:global.${table}`),
);

const RUNTIME_ACCESS_OPERATION = Object.freeze({
  READ: 'read',
  WRITE: 'write',
});
const RUNTIME_ACCESS_OPERATIONS = Object.freeze(
  Object.values(RUNTIME_ACCESS_OPERATION),
);
const RUNTIME_ACCESS_POLICY_STATUS = Object.freeze({
  DENIED: 'denied',
  RESOLVED: 'resolved',
});
const RUNTIME_ACCESS_POLICY_DECISION = Object.freeze({
  ALLOWED: 'allowed',
  DENIED: 'denied',
});
const RUNTIME_ACCESS_POLICY_REASON = Object.freeze({
  ACCESS_NOT_GRANTED: 'access_not_granted',
  BINDING_NOT_FOUND: 'binding_not_found',
  INVALID_POLICY: 'invalid_policy',
  POLICY_NOT_FOUND: 'policy_not_found',
  POLICY_READ_FAILED: 'policy_read_failed',
  STATEMENT_NOT_ALLOWED: 'statement_not_allowed',
});
const RUNTIME_ACCESS_POLICY_ERROR_CODE = Object.freeze({
  BINDING_NOT_FOUND: 'runtime_access_binding_not_found',
  DEPENDENCY_REQUIRED: 'runtime_access_dependency_required',
  INVALID_FIELD: 'runtime_access_invalid_field',
});
const RUNTIME_ACCESS_POLICY_PATH = Object.freeze({
  BINDING_NAME: '/binding_name',
  DEPENDENCIES: '/dependencies',
  POLICY: '/policy',
  SCHEMA_VERSION: '/schema_version',
  TABLES: '/tables',
});
const RUNTIME_ACCESS_POLICY_MESSAGE = Object.freeze({
  BINDING_NOT_FOUND:
    'runtime access target Binding does not exist for the authenticated tenant',
  DEPENDENCY_REQUIRED:
    'runtime access policy owner requires the deployment Binding owner',
  INVALID_FIELD: 'runtime access policy is outside the supported contract',
});
const RUNTIME_ACCESS_POLICY_ERROR_NAME = 'RuntimeAccessPolicyError';
const POLICY_INPUT_FIELDS = Object.freeze([
  'binding_name',
  'schema_version',
  'tables',
]);
const POLICY_TABLE_FIELDS = Object.freeze([
  'operations',
  'slot',
  'table',
]);
const STORED_POLICY_FIELDS = Object.freeze([
  'binding_version_id',
  'schema_version',
  'service_id',
  'tables',
  'tenant_id',
]);
const SQL_AST_TYPE = Object.freeze({
  ALTER_TABLE: 'ALTER_TABLE',
  BEGIN_TRANSACTION: 'BEGIN_TRANSACTION',
  COMMIT: 'COMMIT',
  CREATE_TABLE: 'CREATE_TABLE',
  DELETE: 'DELETE',
  INSERT: 'INSERT',
  ROLLBACK: 'ROLLBACK',
  SELECT: 'SELECT',
  UPDATE: 'UPDATE',
});
const TRANSACTION_CONTROL_TYPES = new Set([
  SQL_AST_TYPE.BEGIN_TRANSACTION,
  SQL_AST_TYPE.COMMIT,
  SQL_AST_TYPE.ROLLBACK,
]);

class RuntimeAccessPolicyError extends Error {
  constructor(code, path, message) {
    super(message);
    this.name = RUNTIME_ACCESS_POLICY_ERROR_NAME;
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message) {
  throw new RuntimeAccessPolicyError(code, path, message);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requireExactFields(value, fields, path) {
  if (!isPlainObject(value)) {
    fail(
      RUNTIME_ACCESS_POLICY_ERROR_CODE.INVALID_FIELD,
      path,
      RUNTIME_ACCESS_POLICY_MESSAGE.INVALID_FIELD,
    );
  }
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length ||
      actual.some((field, index) => field !== expected[index])) {
    fail(
      RUNTIME_ACCESS_POLICY_ERROR_CODE.INVALID_FIELD,
      path,
      RUNTIME_ACCESS_POLICY_MESSAGE.INVALID_FIELD,
    );
  }
}

function normalizeOperations(operations, path) {
  if (!Array.isArray(operations) || operations.length === 0 ||
      operations.some((operation) =>
        !RUNTIME_ACCESS_OPERATIONS.includes(operation))) {
    fail(
      RUNTIME_ACCESS_POLICY_ERROR_CODE.INVALID_FIELD,
      path,
      RUNTIME_ACCESS_POLICY_MESSAGE.INVALID_FIELD,
    );
  }
  const normalized = RUNTIME_ACCESS_OPERATIONS.filter(
    (operation) => operations.includes(operation),
  );
  if (normalized.length !== operations.length) {
    fail(
      RUNTIME_ACCESS_POLICY_ERROR_CODE.INVALID_FIELD,
      path,
      RUNTIME_ACCESS_POLICY_MESSAGE.INVALID_FIELD,
    );
  }
  return Object.freeze(normalized);
}

function normalizePolicyTables(tables, path = RUNTIME_ACCESS_POLICY_PATH.TABLES) {
  if (!Array.isArray(tables) ||
      tables.length > RUNTIME_ACCESS_POLICY_MAX_TABLE_SLOTS) {
    fail(
      RUNTIME_ACCESS_POLICY_ERROR_CODE.INVALID_FIELD,
      path,
      RUNTIME_ACCESS_POLICY_MESSAGE.INVALID_FIELD,
    );
  }
  const slots = new Set();
  const tableNames = new Set();
  const normalized = tables.map((entry, index) => {
    const entryPath = `${path}/${index}`;
    requireExactFields(entry, POLICY_TABLE_FIELDS, entryPath);
    if (!Number.isSafeInteger(entry.slot) || entry.slot < 0 ||
        entry.slot >= RUNTIME_ACCESS_POLICY_MAX_TABLE_SLOTS ||
        slots.has(entry.slot) ||
        typeof entry.table !== 'string' ||
        !RUNTIME_ACCESS_POLICY_TABLE_PATTERN.test(entry.table) ||
        SYSTEM_TABLE_IDENTITIES.has(entry.table) ||
        tableNames.has(entry.table)) {
      fail(
        RUNTIME_ACCESS_POLICY_ERROR_CODE.INVALID_FIELD,
        entryPath,
        RUNTIME_ACCESS_POLICY_MESSAGE.INVALID_FIELD,
      );
    }
    slots.add(entry.slot);
    tableNames.add(entry.table);
    return Object.freeze({
      context: entry.table,
      operations: normalizeOperations(
        entry.operations,
        `${entryPath}/operations`,
      ),
      read: entry.operations.includes(RUNTIME_ACCESS_OPERATION.READ),
      slot: entry.slot,
      write: entry.operations.includes(RUNTIME_ACCESS_OPERATION.WRITE),
    });
  });
  normalized.sort((left, right) => left.slot - right.slot);
  return Object.freeze(normalized);
}

function normalizePolicyInput(input) {
  requireExactFields(input, POLICY_INPUT_FIELDS, RUNTIME_ACCESS_POLICY_PATH.POLICY);
  if (input.schema_version !== RUNTIME_ACCESS_POLICY_SCHEMA_VERSION) {
    fail(
      RUNTIME_ACCESS_POLICY_ERROR_CODE.INVALID_FIELD,
      RUNTIME_ACCESS_POLICY_PATH.SCHEMA_VERSION,
      RUNTIME_ACCESS_POLICY_MESSAGE.INVALID_FIELD,
    );
  }
  if (typeof input.binding_name !== 'string' ||
      !RUNTIME_ACCESS_POLICY_BINDING_PATTERN.test(input.binding_name)) {
    fail(
      RUNTIME_ACCESS_POLICY_ERROR_CODE.INVALID_FIELD,
      RUNTIME_ACCESS_POLICY_PATH.BINDING_NAME,
      RUNTIME_ACCESS_POLICY_MESSAGE.INVALID_FIELD,
    );
  }
  return Object.freeze({
    bindingName: input.binding_name,
    tables: normalizePolicyTables(input.tables),
  });
}

function storedPolicyTables(tables) {
  return tables.map((entry) => ({
    operations: [...entry.operations],
    slot: entry.slot,
    table: entry.context,
  }));
}

function normalizeStoredPolicy(value, serviceId) {
  requireExactFields(
    value,
    STORED_POLICY_FIELDS,
    RUNTIME_ACCESS_POLICY_PATH.POLICY,
  );
  if (value.schema_version !== RUNTIME_ACCESS_POLICY_SCHEMA_VERSION ||
      typeof value.binding_version_id !== 'string' ||
      value.binding_version_id.length === 0 ||
      typeof value.tenant_id !== 'string' ||
      value.tenant_id.length === 0 ||
      typeof value.service_id !== 'string' ||
      !RUNTIME_ACCESS_POLICY_SERVICE_ID_PATTERN.test(value.service_id) ||
      value.service_id !== serviceId) {
    fail(
      RUNTIME_ACCESS_POLICY_ERROR_CODE.INVALID_FIELD,
      RUNTIME_ACCESS_POLICY_PATH.POLICY,
      RUNTIME_ACCESS_POLICY_MESSAGE.INVALID_FIELD,
    );
  }
  return deepFreeze({
    bindingVersionId: value.binding_version_id,
    schemaVersion: value.schema_version,
    serviceId: value.service_id,
    tables: normalizePolicyTables(value.tables),
    tenantId: value.tenant_id,
  });
}

function canonicalTableIdentity(tableName) {
  if (typeof tableName !== 'string' || tableName.length === 0) return null;
  const withoutNamespace = tableName.startsWith('global.') ?
    tableName.slice('global.'.length) :
    tableName;
  const normalized = withoutNamespace.toLowerCase();
  const canonical = `table:global.${normalized}`;
  return RUNTIME_ACCESS_POLICY_TABLE_PATTERN.test(canonical) ?
    canonical :
    null;
}

function appendReadAccess(accesses, tableName) {
  const table = canonicalTableIdentity(tableName);
  if (!table) return false;
  if (!accesses.some((access) =>
    access.operation === RUNTIME_ACCESS_OPERATION.READ &&
    access.table === table)) {
    accesses.push({
      operation: RUNTIME_ACCESS_OPERATION.READ,
      table,
    });
  }
  return true;
}

function collectExpressionSubqueries(value, accesses, visited) {
  if (Array.isArray(value)) {
    return value.every((entry) =>
      collectExpressionSubqueries(entry, accesses, visited));
  }
  if (!value || typeof value !== 'object') return true;
  if (value.type === SQL_AST_TYPE.SELECT) {
    return collectSelectAccesses(value, accesses, visited);
  }
  if (value.type === 'subquery') {
    return collectSelectAccesses(value.query, accesses, visited);
  }
  return Object.values(value).every((entry) =>
    collectExpressionSubqueries(entry, accesses, visited));
}

function collectSelectAccesses(ast, accesses, visited = new Set()) {
  if (!isPlainObject(ast) || ast.type !== SQL_AST_TYPE.SELECT ||
      visited.has(ast)) {
    return visited.has(ast);
  }
  visited.add(ast);
  const ctes = Array.isArray(ast.ctes) ? ast.ctes : [];
  const cteNames = new Set(ctes.map((cte) => cte?.name).filter(Boolean));
  if (!ctes.every((cte) =>
    collectSelectAccesses(cte?.query, accesses, visited))) {
    return false;
  }
  if (ast.from) {
    if (ast.from.subquery) {
      if (!collectSelectAccesses(ast.from.subquery, accesses, visited)) {
        return false;
      }
    } else if (!cteNames.has(ast.from.name) &&
        !appendReadAccess(accesses, ast.from.name)) {
      return false;
    }
  }
  for (const join of ast.joins || []) {
    if (join?.table?.subquery) {
      if (!collectSelectAccesses(join.table.subquery, accesses, visited)) {
        return false;
      }
    } else if (!cteNames.has(join?.table?.name) &&
        !appendReadAccess(accesses, join?.table?.name)) {
      return false;
    }
  }
  if (ast.setOperation?.right &&
      !collectSelectAccesses(ast.setOperation.right, accesses, visited)) {
    return false;
  }
  return [
    ast.columns,
    ast.where,
    ast.groupBy,
    ast.having,
    ast.orderBy,
  ].every((value) =>
    collectExpressionSubqueries(value, accesses, visited));
}

function statementAccesses(ast) {
  if (!isPlainObject(ast)) {
    return Object.freeze({
      allowedStatement: false,
      accesses: Object.freeze([]),
    });
  }
  if (TRANSACTION_CONTROL_TYPES.has(ast.type)) {
    return Object.freeze({
      allowedStatement: true,
      accesses: Object.freeze([]),
    });
  }
  if (ast.type === SQL_AST_TYPE.SELECT) {
    const accesses = [];
    return Object.freeze({
      allowedStatement: collectSelectAccesses(ast, accesses),
      accesses: Object.freeze(accesses),
    });
  }
  if ([
    SQL_AST_TYPE.INSERT,
    SQL_AST_TYPE.UPDATE,
    SQL_AST_TYPE.DELETE,
  ].includes(ast.type)) {
    const table = canonicalTableIdentity(ast.table);
    const accesses = [{
      operation: RUNTIME_ACCESS_OPERATION.WRITE,
      table,
    }];
    const expressionFields = ast.type === SQL_AST_TYPE.UPDATE ?
      [ast.assignments, ast.where, ast.returning] :
      (ast.type === SQL_AST_TYPE.DELETE ?
        [ast.where, ast.returning] :
        [ast.values, ast.returning]);
    const unsupportedInsertSelect = ast.type === SQL_AST_TYPE.INSERT &&
      Array.isArray(ast.values) && ast.values.length === 0 &&
      typeof ast.rawSql === 'string';
    return Object.freeze({
      allowedStatement: table !== null && !unsupportedInsertSelect &&
        expressionFields.every((value) =>
          collectExpressionSubqueries(value, accesses, new Set())),
      accesses: Object.freeze(accesses),
    });
  }
  if ([
    SQL_AST_TYPE.CREATE_TABLE,
    SQL_AST_TYPE.ALTER_TABLE,
  ].includes(ast.type)) {
    return Object.freeze({
      allowedStatement: false,
      accesses: Object.freeze([]),
    });
  }
  return Object.freeze({
    allowedStatement: false,
    accesses: Object.freeze([]),
  });
}

function deniedPolicy(reason, detail = {}) {
  return deepFreeze({
    status: RUNTIME_ACCESS_POLICY_STATUS.DENIED,
    reason,
    ...detail,
  });
}

function deniedDecision(reason, detail = {}) {
  return deepFreeze({
    decision: RUNTIME_ACCESS_POLICY_DECISION.DENIED,
    reason,
    ...detail,
  });
}

class RuntimeAccessPolicyOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = RUNTIME_ACCESS_POLICY_OWNER_NAME;
  static TABLE_NAME = TABLES.CONFIG;

  constructor(options = {}) {
    super(options);
    if (!options.bindingOwner) {
      fail(
        RUNTIME_ACCESS_POLICY_ERROR_CODE.DEPENDENCY_REQUIRED,
        RUNTIME_ACCESS_POLICY_PATH.DEPENDENCIES,
        RUNTIME_ACCESS_POLICY_MESSAGE.DEPENDENCY_REQUIRED,
      );
    }
    this.bindingOwner = options.bindingOwner;
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
  }

  configKey(serviceId) {
    return `${RUNTIME_ACCESS_POLICY_CONFIG_KEY_PREFIX}${serviceId}`;
  }

  timestamp() {
    const value = this.now();
    if (!Number.isSafeInteger(value) || value < 0) {
      fail(
        RUNTIME_ACCESS_POLICY_ERROR_CODE.INVALID_FIELD,
        RUNTIME_ACCESS_POLICY_PATH.POLICY,
        RUNTIME_ACCESS_POLICY_MESSAGE.INVALID_FIELD,
      );
    }
    return value;
  }

  async configureBindingAccess(input, securityContext, options = {}) {
    const normalized = normalizePolicyInput(input);
    const binding = await this.bindingOwner.getBindingByName(
      normalized.bindingName,
      securityContext,
    );
    if (!binding) {
      fail(
        RUNTIME_ACCESS_POLICY_ERROR_CODE.BINDING_NOT_FOUND,
        RUNTIME_ACCESS_POLICY_PATH.BINDING_NAME,
        RUNTIME_ACCESS_POLICY_MESSAGE.BINDING_NOT_FOUND,
      );
    }
    const serviceId = deriveRequestServiceDefinitionId(
      binding.bindingVersionId,
    );
    const stored = {
      binding_version_id: binding.bindingVersionId,
      schema_version: RUNTIME_ACCESS_POLICY_SCHEMA_VERSION,
      service_id: serviceId,
      tables: storedPolicyTables(normalized.tables),
      tenant_id: binding.tenantId,
    };
    const now = this.timestamp();
    const configValue = JSON.stringify(stored);
    await this.upsertRow({
      config_key: this.configKey(serviceId),
      config_value: configValue,
      value_type: RUNTIME_ACCESS_POLICY_VALUE_TYPE,
      requires_restart: 0,
      description: RUNTIME_ACCESS_POLICY_DESCRIPTION,
      default_value: RUNTIME_ACCESS_POLICY_DEFAULT_VALUE,
      updated_by: securityContext.principal,
      updated_at: now,
      created_at: now,
    }, {
      ...options,
      expectedCacheFields: {
        config_value: configValue,
        updated_at: now,
      },
    });
    return normalizeStoredPolicy(stored, serviceId);
  }

  async getRuntimePolicy(serviceId, options = {}) {
    if (typeof serviceId !== 'string' ||
        !RUNTIME_ACCESS_POLICY_SERVICE_ID_PATTERN.test(serviceId)) {
      return deniedPolicy(RUNTIME_ACCESS_POLICY_REASON.INVALID_POLICY);
    }
    let row;
    try {
      row = await this.readCachedByPrimaryKey(this.configKey(serviceId), options);
    } catch (_error) {
      return deniedPolicy(RUNTIME_ACCESS_POLICY_REASON.POLICY_READ_FAILED);
    }
    if (!row) {
      return deniedPolicy(RUNTIME_ACCESS_POLICY_REASON.POLICY_NOT_FOUND);
    }
    try {
      if (row.value_type !== RUNTIME_ACCESS_POLICY_VALUE_TYPE ||
          typeof row.config_value !== 'string') {
        return deniedPolicy(RUNTIME_ACCESS_POLICY_REASON.INVALID_POLICY);
      }
      const value = JSON.parse(row.config_value);
      return deepFreeze({
        status: RUNTIME_ACCESS_POLICY_STATUS.RESOLVED,
        policy: normalizeStoredPolicy(value, serviceId),
      });
    } catch (_error) {
      return deniedPolicy(RUNTIME_ACCESS_POLICY_REASON.INVALID_POLICY);
    }
  }

  async authorizeStatement(serviceId, ast, options = {}) {
    const statement = statementAccesses(ast);
    if (!statement.allowedStatement) {
      return deniedDecision(RUNTIME_ACCESS_POLICY_REASON.STATEMENT_NOT_ALLOWED);
    }
    if (statement.accesses.length === 0) {
      return deepFreeze({
        decision: RUNTIME_ACCESS_POLICY_DECISION.ALLOWED,
        accesses: statement.accesses,
      });
    }
    const resolved = await this.getRuntimePolicy(serviceId, options);
    if (resolved.status !== RUNTIME_ACCESS_POLICY_STATUS.RESOLVED) {
      return deniedDecision(resolved.reason);
    }
    const grants = new Map(
      resolved.policy.tables.map((table) => [table.context, table]),
    );
    const denied = statement.accesses.find((access) => {
      const grant = grants.get(access.table);
      return !grant || grant[access.operation] !== true;
    });
    if (denied) {
      return deniedDecision(
        RUNTIME_ACCESS_POLICY_REASON.ACCESS_NOT_GRANTED,
        {access: denied},
      );
    }
    return deepFreeze({
      decision: RUNTIME_ACCESS_POLICY_DECISION.ALLOWED,
      accesses: statement.accesses,
      policy: resolved.policy,
    });
  }
}

export {
  RUNTIME_ACCESS_OPERATION,
  RUNTIME_ACCESS_POLICY_DECISION,
  RUNTIME_ACCESS_POLICY_ERROR_CODE,
  RUNTIME_ACCESS_POLICY_REASON,
  RUNTIME_ACCESS_POLICY_SCHEMA_VERSION,
  RUNTIME_ACCESS_POLICY_STATUS,
  RuntimeAccessPolicyError,
  RuntimeAccessPolicyOwner,
  canonicalTableIdentity,
  normalizePolicyInput,
  statementAccesses,
};
