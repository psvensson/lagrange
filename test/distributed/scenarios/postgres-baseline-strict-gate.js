const ZERO = 0;

const DISCOVERY_READINESS_REASON_ADMIN_NOT_QUERYABLE = 'admin_not_queryable';
const DISCOVERY_READINESS_REASON_ROUTING_NOT_READY = 'routing_not_ready';
const DISCOVERY_READINESS_REASON_TOPOLOGY_NOT_READY = 'topology_not_ready';
const DISCOVERY_READINESS_REASON_SCHEMA_VERSION_UNKNOWN =
  'schema_version_unknown';
const DISCOVERY_READINESS_REASON_SCHEMA_VERSION_LAG = 'schema_version_lag';
const DISCOVERY_READINESS_REASON_READINESS_MISSING = 'readiness_missing';

function normalizeRequiredSchemaVersion(value) {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > ZERO ? normalized : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'bigint') {
    return String(value);
  }
  return null;
}

function extractAppliedSchemaVersionFromReadiness(readiness) {
  if (!readiness || typeof readiness !== 'object') {
    return null;
  }
  const fieldCandidates = [
    'appliedSchemaVersion',
    'applied_schema_version',
    'schemaVersion',
    'schema_version',
  ];
  for (const fieldName of fieldCandidates) {
    const normalizedValue = normalizeRequiredSchemaVersion(readiness[fieldName]);
    if (normalizedValue) {
      return normalizedValue;
    }
  }
  return null;
}

function parseHlcVersion(value) {
  const text = String(value || '');
  const parts = text.split(':');
  if (parts.length < 3) {
    return null;
  }
  const physical = Number.parseInt(parts[0], 10);
  const logical = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(physical) || !Number.isFinite(logical)) {
    return null;
  }
  return {
    physical,
    logical,
    nodeId: parts.slice(2).join(':'),
  };
}

function compareSchemaVersions(appliedSchemaVersion, requiredSchemaVersion) {
  if (appliedSchemaVersion === requiredSchemaVersion) {
    return ZERO;
  }

  const appliedHlc = parseHlcVersion(appliedSchemaVersion);
  const requiredHlc = parseHlcVersion(requiredSchemaVersion);
  if (appliedHlc && requiredHlc) {
    if (appliedHlc.physical !== requiredHlc.physical) {
      return appliedHlc.physical - requiredHlc.physical;
    }
    if (appliedHlc.logical !== requiredHlc.logical) {
      return appliedHlc.logical - requiredHlc.logical;
    }
    return appliedHlc.nodeId.localeCompare(requiredHlc.nodeId);
  }

  const appliedNumeric = Number(appliedSchemaVersion);
  const requiredNumeric = Number(requiredSchemaVersion);
  if (Number.isFinite(appliedNumeric) && Number.isFinite(requiredNumeric)) {
    return appliedNumeric - requiredNumeric;
  }

  return String(appliedSchemaVersion).localeCompare(String(requiredSchemaVersion));
}

function evaluateCanonicalVersionedReadiness({
  adminQueryable,
  routingReady,
  topologyReady,
  requiredSchemaVersion,
  appliedSchemaVersion,
}) {
  const reasons = [];
  if (adminQueryable !== true) {
    reasons.push(DISCOVERY_READINESS_REASON_ADMIN_NOT_QUERYABLE);
  }
  if (routingReady !== true) {
    reasons.push(DISCOVERY_READINESS_REASON_ROUTING_NOT_READY);
  }
  if (topologyReady !== true) {
    reasons.push(DISCOVERY_READINESS_REASON_TOPOLOGY_NOT_READY);
  }

  const normalizedRequiredSchemaVersion =
    normalizeRequiredSchemaVersion(requiredSchemaVersion);
  const normalizedAppliedSchemaVersion =
    normalizeRequiredSchemaVersion(appliedSchemaVersion);
  if (!normalizedRequiredSchemaVersion || !normalizedAppliedSchemaVersion) {
    reasons.push(DISCOVERY_READINESS_REASON_SCHEMA_VERSION_UNKNOWN);
  } else if (compareSchemaVersions(
    normalizedAppliedSchemaVersion,
    normalizedRequiredSchemaVersion,
  ) < ZERO) {
    reasons.push(DISCOVERY_READINESS_REASON_SCHEMA_VERSION_LAG);
  }

  return {
    ready: reasons.length === ZERO,
    reasons,
    requiredSchemaVersion: normalizedRequiredSchemaVersion,
    appliedSchemaVersion: normalizedAppliedSchemaVersion,
  };
}

function classifyCanonicalReadinessReasonsFromDiscoveryError(error) {
  const errorMessage = String(error?.message || error || '').toLowerCase();
  if (!errorMessage) {
    return null;
  }
  if (errorMessage.includes('topologyready')) {
    return [DISCOVERY_READINESS_REASON_TOPOLOGY_NOT_READY];
  }
  if (errorMessage.includes('routingready')) {
    return [DISCOVERY_READINESS_REASON_ROUTING_NOT_READY];
  }
  if (errorMessage.includes('missing object readiness')) {
    return [DISCOVERY_READINESS_REASON_READINESS_MISSING];
  }
  if (errorMessage.includes('schemaready') ||
      errorMessage.includes('appliedschemaversion') ||
      errorMessage.includes('requiredschemaversion')) {
    return [DISCOVERY_READINESS_REASON_SCHEMA_VERSION_UNKNOWN];
  }
  return null;
}

function buildCanonicalReadinessFromDiscoveryError({
  error,
  requiredSchemaVersion,
}) {
  const classifiedReasons = classifyCanonicalReadinessReasonsFromDiscoveryError(
    error,
  );
  if (Array.isArray(classifiedReasons) && classifiedReasons.length > ZERO) {
    return {
      ready: false,
      reasons: classifiedReasons,
      requiredSchemaVersion: normalizeRequiredSchemaVersion(requiredSchemaVersion),
      appliedSchemaVersion: null,
    };
  }
  return evaluateCanonicalVersionedReadiness({
    adminQueryable: false,
    routingReady: false,
    topologyReady: false,
    requiredSchemaVersion,
    appliedSchemaVersion: null,
  });
}

export {
  DISCOVERY_READINESS_REASON_ADMIN_NOT_QUERYABLE,
  DISCOVERY_READINESS_REASON_ROUTING_NOT_READY,
  DISCOVERY_READINESS_REASON_TOPOLOGY_NOT_READY,
  DISCOVERY_READINESS_REASON_SCHEMA_VERSION_UNKNOWN,
  DISCOVERY_READINESS_REASON_SCHEMA_VERSION_LAG,
  normalizeRequiredSchemaVersion,
  extractAppliedSchemaVersionFromReadiness,
  compareSchemaVersions,
  evaluateCanonicalVersionedReadiness,
  buildCanonicalReadinessFromDiscoveryError,
};
