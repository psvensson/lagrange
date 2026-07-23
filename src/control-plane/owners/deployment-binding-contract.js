import {createHash} from 'node:crypto';

import {
  DEPLOYMENT_BINDING_BUDGET_FIELDS,
  DEPLOYMENT_BINDING_BUDGET_LIMITS,
} from '../../constants/deployment-binding.js';

const DEPLOYMENT_BINDING_SCHEMA_VERSION = 0;
const DEPLOYMENT_BINDING_GENERATION = 1;

const DEPLOYMENT_BINDING_SOURCE_KIND = Object.freeze({
  BOOT: 'boot',
  CALL: 'call',
  CHANGE: 'change',
  ONCE: 'once',
  PUSHDOWN: 'pushdown',
  REQUEST: 'request',
  TIME: 'time',
});

const DEPLOYMENT_BINDING_SOURCE_INTERFACE = Object.freeze({
  [DEPLOYMENT_BINDING_SOURCE_KIND.BOOT]: 'boot_v1',
  [DEPLOYMENT_BINDING_SOURCE_KIND.CALL]: 'call_v1',
  [DEPLOYMENT_BINDING_SOURCE_KIND.CHANGE]: 'change_v1',
  [DEPLOYMENT_BINDING_SOURCE_KIND.ONCE]: 'once_v1',
  [DEPLOYMENT_BINDING_SOURCE_KIND.PUSHDOWN]: 'pushdown_v1',
  [DEPLOYMENT_BINDING_SOURCE_KIND.REQUEST]: 'request_v1',
  [DEPLOYMENT_BINDING_SOURCE_KIND.TIME]: 'time_v1',
});

const DEPLOYMENT_BINDING_ERROR_CODE = Object.freeze({
  ARTIFACT_NOT_FOUND: 'binding_artifact_not_found',
  BINDING_CONFLICT: 'binding_conflict',
  CORRUPT_RECORD: 'corrupt_binding_record',
  DEPENDENCY_REQUIRED: 'binding_dependency_required',
  INTERFACE_MISMATCH: 'binding_interface_mismatch',
  INVALID_FIELD: 'binding_invalid_field',
  SECURITY_CONTEXT_REQUIRED: 'binding_security_context_required',
});

const DEPLOYMENT_BINDING_PATH = Object.freeze({
  ARTIFACT: '/target',
  BINDING: '/binding',
  BUDGETS: '/budgets',
  CAPABILITIES: '/capabilities',
  CATALOG_OWNER: '/catalogOwner',
  CONTEXTS: '/contexts',
  CREATED_AT: '/created_at',
  ELASTICITY: '/elasticity',
  NAME: '/name',
  NOW: '/now',
  SCHEMA_VERSION: '/schema_version',
  SECURITY_CONTEXT: '/securityContext',
  SOURCE: '/source',
  TARGET: '/target',
});

const DEPLOYMENT_BINDING_MESSAGE = Object.freeze({
  ARTIFACT_MISSING: 'bindable artifact target does not exist',
  BINDING_IMMUTABLE: 'binding name is already bound to another declaration',
  CORRUPT_RECORD: 'durable binding state is outside the Binding v0 contract',
  DEPENDENCY_REQUIRED: 'deployment Binding owner dependencies are required',
  INTERFACE_MISMATCH: 'binding source cannot invoke the selected export interface',
  INVALID_FIELD: 'binding declaration is outside the Binding v0 contract',
  SECURITY_CONTEXT_REQUIRED:
    'authenticated tenant, principal, and roles are required',
});

const SOURCE_FIELDS = Object.freeze({
  [DEPLOYMENT_BINDING_SOURCE_KIND.BOOT]: Object.freeze(['kind']),
  [DEPLOYMENT_BINDING_SOURCE_KIND.CALL]: Object.freeze(['kind', 'name']),
  [DEPLOYMENT_BINDING_SOURCE_KIND.CHANGE]: Object.freeze([
    'kind', 'operations', 'tables',
  ]),
  [DEPLOYMENT_BINDING_SOURCE_KIND.ONCE]: Object.freeze(['kind']),
  [DEPLOYMENT_BINDING_SOURCE_KIND.PUSHDOWN]: Object.freeze(['kind', 'name']),
  [DEPLOYMENT_BINDING_SOURCE_KIND.REQUEST]: Object.freeze([
    'kind', 'method', 'path',
  ]),
  [DEPLOYMENT_BINDING_SOURCE_KIND.TIME]: Object.freeze([
    'kind', 'interval_ms',
  ]),
});

const ROOT_FIELDS = Object.freeze([
  'schema_version', 'name', 'target', 'source', 'contexts', 'budgets',
  'elasticity',
]);
const TARGET_FIELDS = Object.freeze([
  'package_id', 'manifest_digest', 'export_name',
]);
const ELASTICITY_FIELDS = Object.freeze([
  'voters', 'min_learners', 'max_learners',
]);
const CHANGE_OPERATIONS = Object.freeze(['delete', 'insert', 'update']);
const REQUEST_METHODS = Object.freeze([
  'DELETE', 'GET', 'PATCH', 'POST', 'PUT',
]);
const TIME_INTERVAL_LIMITS = Object.freeze({
  minimum: 1,
  maximum: 86400000,
});

const NAME_PATTERN = /^[a-z][a-z0-9-]{0,127}$/u;
const PACKAGE_ID_PATTERN = /^service-package-[0-9a-f]{64}$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const TABLE_PATTERN = /^table:global\.[a-z_][a-z0-9_]*$/u;
const HTTP_PATH_PATTERN = /^\/(?:[a-z0-9._~-]+(?:\/[a-z0-9._~-]+)*)?$/u;
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const CAPABILITIES_FIELD = 'capabilities';
const DEPLOYMENT_BINDING_ERROR_NAME = 'DeploymentBindingError';

const BINDING_ROW_FIELDS = Object.freeze([
  'binding_version_id', 'binding_id', 'tenant_id', 'binding_name',
  'generation', 'binding_digest', 'package_id', 'manifest_digest',
  'export_name', 'source_kind', 'normalized_binding', 'created_by', 'created_at',
]);
const BINDING_IDENTITY_ROW_FIELDS = Object.freeze(
  BINDING_ROW_FIELDS.filter((field) =>
    !['created_at', 'created_by'].includes(field)),
);
const BINDING_STRING_ROW_FIELDS = Object.freeze(
  BINDING_ROW_FIELDS.filter((field) =>
    !['created_at', 'generation'].includes(field)),
);

class DeploymentBindingError extends Error {
  constructor(code, path, message) {
    super(message);
    this.name = DEPLOYMENT_BINDING_ERROR_NAME;
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message) {
  throw new DeploymentBindingError(code, path, message);
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

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function digest(value) {
  return createHash(HASH_ALGORITHM)
    .update(canonicalJson(value))
    .digest(HASH_ENCODING);
}

function requireExactFields(value, fields, path) {
  if (!isPlainObject(value)) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD, path,
      DEPLOYMENT_BINDING_MESSAGE.INVALID_FIELD);
  }
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length ||
      actual.some((field, index) => field !== expected[index])) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD, path,
      DEPLOYMENT_BINDING_MESSAGE.INVALID_FIELD);
  }
}

function requireName(value, path) {
  if (typeof value !== 'string' || !NAME_PATTERN.test(value)) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD, path,
      DEPLOYMENT_BINDING_MESSAGE.INVALID_FIELD);
  }
  return value;
}

function requireInteger(value, limits, path) {
  if (!Number.isSafeInteger(value) || value < limits.minimum ||
      value > limits.maximum) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD, path,
      DEPLOYMENT_BINDING_MESSAGE.INVALID_FIELD);
  }
  return value;
}

function requireUniqueSortedStrings(values, options) {
  if (!Array.isArray(values) || values.length < (options.minimumItems || 0)) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD, options.path,
      DEPLOYMENT_BINDING_MESSAGE.INVALID_FIELD);
  }
  const normalized = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== 'string' || !options.accept(value) || seen.has(value)) {
      fail(DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD, options.path,
        DEPLOYMENT_BINDING_MESSAGE.INVALID_FIELD);
    }
    seen.add(value);
    normalized.push(value);
  }
  return normalized.sort();
}

function normalizeTarget(target) {
  requireExactFields(target, TARGET_FIELDS, DEPLOYMENT_BINDING_PATH.TARGET);
  if (typeof target.package_id !== 'string' ||
      !PACKAGE_ID_PATTERN.test(target.package_id) ||
      typeof target.manifest_digest !== 'string' ||
      !DIGEST_PATTERN.test(target.manifest_digest)) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD,
      DEPLOYMENT_BINDING_PATH.TARGET,
      DEPLOYMENT_BINDING_MESSAGE.INVALID_FIELD);
  }
  return {
    export_name: requireName(
      target.export_name, `${DEPLOYMENT_BINDING_PATH.TARGET}/export_name`),
    manifest_digest: target.manifest_digest,
    package_id: target.package_id,
  };
}

function normalizeRequestSource(source) {
  if (!REQUEST_METHODS.includes(source.method) ||
      typeof source.path !== 'string' ||
      !HTTP_PATH_PATTERN.test(source.path)) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD,
      DEPLOYMENT_BINDING_PATH.SOURCE,
      DEPLOYMENT_BINDING_MESSAGE.INVALID_FIELD);
  }
  return {kind: source.kind, method: source.method, path: source.path};
}

function normalizeChangeSource(source) {
  return {
    kind: source.kind,
    operations: requireUniqueSortedStrings(source.operations, {
      minimumItems: 1,
      path: `${DEPLOYMENT_BINDING_PATH.SOURCE}/operations`,
      accept: (value) => CHANGE_OPERATIONS.includes(value),
    }),
    tables: requireUniqueSortedStrings(source.tables, {
      minimumItems: 1,
      path: `${DEPLOYMENT_BINDING_PATH.SOURCE}/tables`,
      accept: (value) => TABLE_PATTERN.test(value),
    }),
  };
}

function normalizeNamedSource(source) {
  return {kind: source.kind, name: requireName(
    source.name, `${DEPLOYMENT_BINDING_PATH.SOURCE}/name`)};
}

function normalizeTimeSource(source) {
  return {kind: source.kind, interval_ms: requireInteger(
    source.interval_ms,
    TIME_INTERVAL_LIMITS,
    `${DEPLOYMENT_BINDING_PATH.SOURCE}/interval_ms`,
  )};
}

function normalizeKindOnlySource(source) {
  return {kind: source.kind};
}

const SOURCE_NORMALIZERS = Object.freeze({
  [DEPLOYMENT_BINDING_SOURCE_KIND.BOOT]: normalizeKindOnlySource,
  [DEPLOYMENT_BINDING_SOURCE_KIND.CALL]: normalizeNamedSource,
  [DEPLOYMENT_BINDING_SOURCE_KIND.CHANGE]: normalizeChangeSource,
  [DEPLOYMENT_BINDING_SOURCE_KIND.ONCE]: normalizeKindOnlySource,
  [DEPLOYMENT_BINDING_SOURCE_KIND.PUSHDOWN]: normalizeNamedSource,
  [DEPLOYMENT_BINDING_SOURCE_KIND.REQUEST]: normalizeRequestSource,
  [DEPLOYMENT_BINDING_SOURCE_KIND.TIME]: normalizeTimeSource,
});

function normalizeSource(source) {
  const normalizer = isPlainObject(source) ?
    SOURCE_NORMALIZERS[source.kind] : null;
  if (!normalizer) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD,
      DEPLOYMENT_BINDING_PATH.SOURCE,
      DEPLOYMENT_BINDING_MESSAGE.INVALID_FIELD);
  }
  requireExactFields(
    source, SOURCE_FIELDS[source.kind], DEPLOYMENT_BINDING_PATH.SOURCE);
  return normalizer(source);
}

function normalizeBudgets(budgets) {
  requireExactFields(
    budgets,
    DEPLOYMENT_BINDING_BUDGET_FIELDS,
    DEPLOYMENT_BINDING_PATH.BUDGETS,
  );
  const normalized = {};
  for (const field of DEPLOYMENT_BINDING_BUDGET_FIELDS) {
    normalized[field] = requireInteger(
      budgets[field], DEPLOYMENT_BINDING_BUDGET_LIMITS[field],
      `${DEPLOYMENT_BINDING_PATH.BUDGETS}/${field}`,
    );
  }
  if (normalized.wall_time_ms < normalized.cpu_time_ms) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD,
      `${DEPLOYMENT_BINDING_PATH.BUDGETS}/wall_time_ms`,
      DEPLOYMENT_BINDING_MESSAGE.INVALID_FIELD);
  }
  return normalized;
}

function normalizeElasticity(elasticity) {
  requireExactFields(
    elasticity, ELASTICITY_FIELDS, DEPLOYMENT_BINDING_PATH.ELASTICITY);
  const voters = requireInteger(
    elasticity.voters, {minimum: 3, maximum: 9},
    `${DEPLOYMENT_BINDING_PATH.ELASTICITY}/voters`,
  );
  const minLearners = requireInteger(
    elasticity.min_learners, {minimum: 0, maximum: 32},
    `${DEPLOYMENT_BINDING_PATH.ELASTICITY}/min_learners`,
  );
  const maxLearners = requireInteger(
    elasticity.max_learners, {minimum: 0, maximum: 32},
    `${DEPLOYMENT_BINDING_PATH.ELASTICITY}/max_learners`,
  );
  if (voters % 2 === 0 || minLearners > maxLearners) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD,
      DEPLOYMENT_BINDING_PATH.ELASTICITY,
      DEPLOYMENT_BINDING_MESSAGE.INVALID_FIELD);
  }
  return {max_learners: maxLearners, min_learners: minLearners, voters};
}

function normalizeDeploymentBinding(input) {
  requireExactFields(input, ROOT_FIELDS, DEPLOYMENT_BINDING_PATH.BINDING);
  if (input.schema_version !== DEPLOYMENT_BINDING_SCHEMA_VERSION) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD,
      DEPLOYMENT_BINDING_PATH.SCHEMA_VERSION,
      DEPLOYMENT_BINDING_MESSAGE.INVALID_FIELD);
  }
  const normalized = canonicalize({
    budgets: normalizeBudgets(input.budgets),
    contexts: requireUniqueSortedStrings(input.contexts, {
      path: DEPLOYMENT_BINDING_PATH.CONTEXTS,
      accept: (value) => TABLE_PATTERN.test(value),
    }),
    elasticity: normalizeElasticity(input.elasticity),
    name: requireName(input.name, DEPLOYMENT_BINDING_PATH.NAME),
    schema_version: DEPLOYMENT_BINDING_SCHEMA_VERSION,
    source: normalizeSource(input.source),
    target: normalizeTarget(input.target),
  });
  return deepFreeze(normalized);
}

function normalizeCapabilities(capabilities) {
  if (capabilities === undefined) return [];
  return requireUniqueSortedStrings(capabilities, {
    path: DEPLOYMENT_BINDING_PATH.CAPABILITIES,
    accept: (value) => value.length > 0 && value.trim() === value,
  });
}

function bindDeploymentArtifact(declaration, artifact) {
  if (!isPlainObject(artifact) || !isPlainObject(artifact.manifest) ||
      artifact.packageId !== declaration.target.package_id ||
      artifact.manifestDigest !== declaration.target.manifest_digest) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.ARTIFACT_NOT_FOUND,
      DEPLOYMENT_BINDING_PATH.ARTIFACT,
      DEPLOYMENT_BINDING_MESSAGE.ARTIFACT_MISSING);
  }
  const exportDeclaration = artifact.manifest.exports?.find(
    (entry) => entry.name === declaration.target.export_name,
  );
  if (!exportDeclaration) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.ARTIFACT_NOT_FOUND,
      `${DEPLOYMENT_BINDING_PATH.TARGET}/export_name`,
      DEPLOYMENT_BINDING_MESSAGE.ARTIFACT_MISSING);
  }
  const expectedInterface =
    DEPLOYMENT_BINDING_SOURCE_INTERFACE[declaration.source.kind];
  if (exportDeclaration.interface !== expectedInterface) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.INTERFACE_MISMATCH,
      DEPLOYMENT_BINDING_PATH.SOURCE,
      DEPLOYMENT_BINDING_MESSAGE.INTERFACE_MISMATCH);
  }
  const allowedContexts = new Set([
    ...exportDeclaration.reads,
    ...exportDeclaration.writes,
  ]);
  if (declaration.contexts.some((table) => !allowedContexts.has(table))) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD,
      DEPLOYMENT_BINDING_PATH.CONTEXTS,
      DEPLOYMENT_BINDING_MESSAGE.INVALID_FIELD);
  }
  if (declaration.source.kind === DEPLOYMENT_BINDING_SOURCE_KIND.CHANGE &&
      declaration.source.tables.some((table) => !allowedContexts.has(table))) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD,
      `${DEPLOYMENT_BINDING_PATH.SOURCE}/tables`,
      DEPLOYMENT_BINDING_MESSAGE.INVALID_FIELD);
  }
  const bound = canonicalize({
    ...declaration,
    capabilities: normalizeCapabilities(artifact.manifest.capabilities),
  });
  return deepFreeze(bound);
}

function validateSecurityContext(securityContext) {
  const valid = typeof securityContext?.tenantId === 'string' &&
    securityContext.tenantId.length > 0 &&
    typeof securityContext?.principal === 'string' &&
    securityContext.principal.length > 0 &&
    Array.isArray(securityContext?.roles) &&
    securityContext.roles.every((role) => typeof role === 'string');
  if (!valid) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.SECURITY_CONTEXT_REQUIRED,
      DEPLOYMENT_BINDING_PATH.SECURITY_CONTEXT,
      DEPLOYMENT_BINDING_MESSAGE.SECURITY_CONTEXT_REQUIRED);
  }
  return securityContext;
}

function deriveBindingId(tenantId, bindingName) {
  return `binding-${digest({bindingName, tenantId})}`;
}

function deriveBindingVersionId(bindingId) {
  return `binding-version-${digest({
    bindingId,
    generation: DEPLOYMENT_BINDING_GENERATION,
  })}`;
}

function buildBindingRow(declaration, securityContext, createdAt) {
  const context = validateSecurityContext(securityContext);
  if (!Number.isSafeInteger(createdAt) || createdAt < 0) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD,
      DEPLOYMENT_BINDING_PATH.CREATED_AT,
      DEPLOYMENT_BINDING_MESSAGE.INVALID_FIELD);
  }
  const bindingId = deriveBindingId(context.tenantId, declaration.name);
  const normalizedBinding = canonicalJson(declaration);
  return deepFreeze({
    binding_version_id: deriveBindingVersionId(bindingId),
    binding_id: bindingId,
    tenant_id: context.tenantId,
    binding_name: declaration.name,
    generation: DEPLOYMENT_BINDING_GENERATION,
    binding_digest: `sha256:${createHash(HASH_ALGORITHM)
      .update(normalizedBinding)
      .digest(HASH_ENCODING)}`,
    package_id: declaration.target.package_id,
    manifest_digest: declaration.target.manifest_digest,
    export_name: declaration.target.export_name,
    source_kind: declaration.source.kind,
    normalized_binding: normalizedBinding,
    created_by: context.principal,
    created_at: createdAt,
  });
}

function normalizeStoredBinding(parsed) {
  if (!isPlainObject(parsed) ||
      !Object.hasOwn(parsed, CAPABILITIES_FIELD)) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.CORRUPT_RECORD,
      DEPLOYMENT_BINDING_PATH.BINDING,
      DEPLOYMENT_BINDING_MESSAGE.CORRUPT_RECORD);
  }
  const {capabilities, ...input} = parsed;
  try {
    return canonicalize({
      ...normalizeDeploymentBinding(input),
      capabilities: normalizeCapabilities(capabilities),
    });
  } catch (_error) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.CORRUPT_RECORD,
      DEPLOYMENT_BINDING_PATH.BINDING,
      DEPLOYMENT_BINDING_MESSAGE.CORRUPT_RECORD);
  }
}

function bindingRowHasExactFields(row) {
  return isPlainObject(row) &&
    Object.keys(row).length === BINDING_ROW_FIELDS.length &&
    BINDING_ROW_FIELDS.every((field) => Object.hasOwn(row, field));
}

function bindingRowHasInspectableValues(row) {
  return BINDING_STRING_ROW_FIELDS.every(
    (field) => typeof row[field] === 'string' && row[field].length > 0,
  ) && Number.isSafeInteger(row.created_at) && row.created_at >= 0;
}

function bindingRowMatchesDeclaration(row, declaration) {
  const bindingId = deriveBindingId(row.tenant_id, declaration.name);
  const expectedDigest = `sha256:${createHash(HASH_ALGORITHM)
    .update(row.normalized_binding)
    .digest(HASH_ENCODING)}`;
  const exactValues = [
    [row.generation, DEPLOYMENT_BINDING_GENERATION],
    [row.binding_id, bindingId],
    [row.binding_version_id, deriveBindingVersionId(bindingId)],
    [row.binding_name, declaration.name],
    [row.binding_digest, expectedDigest],
    [row.package_id, declaration.target.package_id],
    [row.manifest_digest, declaration.target.manifest_digest],
    [row.export_name, declaration.target.export_name],
    [row.source_kind, declaration.source.kind],
    [row.normalized_binding, canonicalJson(declaration)],
  ];
  return exactValues.every(([actual, expected]) => actual === expected);
}

function inspectBindingRow(row) {
  if (!bindingRowHasExactFields(row) ||
      !bindingRowHasInspectableValues(row)) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.CORRUPT_RECORD,
      DEPLOYMENT_BINDING_PATH.BINDING,
      DEPLOYMENT_BINDING_MESSAGE.CORRUPT_RECORD);
  }
  let parsed;
  try {
    parsed = JSON.parse(row.normalized_binding);
  } catch (_error) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.CORRUPT_RECORD,
      DEPLOYMENT_BINDING_PATH.BINDING,
      DEPLOYMENT_BINDING_MESSAGE.CORRUPT_RECORD);
  }
  const declaration = normalizeStoredBinding(parsed);
  if (!bindingRowMatchesDeclaration(row, declaration)) {
    fail(DEPLOYMENT_BINDING_ERROR_CODE.CORRUPT_RECORD,
      DEPLOYMENT_BINDING_PATH.BINDING,
      DEPLOYMENT_BINDING_MESSAGE.CORRUPT_RECORD);
  }
  return deepFreeze({declaration, row});
}

function projectBinding(row, replayed = false) {
  const inspected = inspectBindingRow(row);
  return deepFreeze({
    bindingVersionId: row.binding_version_id,
    bindingId: row.binding_id,
    tenantId: row.tenant_id,
    name: row.binding_name,
    generation: row.generation,
    declaration: inspected.declaration,
    createdBy: row.created_by,
    createdAt: row.created_at,
    replayed,
  });
}

function bindingRowsMatch(left, right) {
  return BINDING_IDENTITY_ROW_FIELDS.every(
    (field) => left?.[field] === right?.[field]);
}

export {
  DEPLOYMENT_BINDING_ERROR_CODE,
  DEPLOYMENT_BINDING_MESSAGE,
  DEPLOYMENT_BINDING_PATH,
  DEPLOYMENT_BINDING_SOURCE_INTERFACE,
  DEPLOYMENT_BINDING_SOURCE_KIND,
  DeploymentBindingError,
  bindDeploymentArtifact,
  bindingRowsMatch,
  buildBindingRow,
  canonicalJson,
  deriveBindingId,
  deriveBindingVersionId,
  normalizeDeploymentBinding,
  projectBinding,
  validateSecurityContext,
};
