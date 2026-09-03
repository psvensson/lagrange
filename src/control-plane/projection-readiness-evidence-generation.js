// Generation key for ProjectionReadinessEvidenceOwner reuse.
//
// The normalized contract is a pure function of the observed source. The key
// must therefore change whenever ANY input that can change that source changes
// (DEP census: solve/evidence/projection-readiness-evidence-amplification-v2.dep.md),
// and must be cheap enough that computing it is far cheaper than the normalize
// it guards. Over-invalidation is acceptable; under-invalidation is not.
//
// Coverage (per the census):
//  - Control-plane-table-derived inputs (nodeRow, serviceRows,
//    membershipPublication, capacity, planning-derived priorityRecovery): the
//    per-table monotonic mutation versions of the six tables that feed them,
//    PLUS the membership planning derivation version. These are O(1) reads and
//    let the big membershipPublication graph be covered WITHOUT walking it.
//  - Transport / router connectivity (finding A) and SELF lifecycle
//    (finding B): captured transitively by digesting the small already-computed
//    verdict records `dimensions` and `runtimeAuthority`, whose values are the
//    live transport/lifecycle readiness the observation just read.
//  - Publication mode (finding C) and repair (finding E): folded in directly as
//    O(1) identity/content digests.
//
// The version snapshot is also used as an R6 stability bracket: the caller
// captures it before observation and the owner re-checks it after the build, so
// a contract built across a mutation window is never memoized under a
// generation it may not match. NO object identity (sources are minted fresh per
// read) and NO wall-clock/TTL are used.

import {TABLES} from '../constants/tables.js';

// The tables whose mutation versions cover every control-plane-derived input to
// the projection readiness contract.
const PROJECTION_READINESS_GENERATION_TABLES = Object.freeze([
  TABLES.NODES,
  TABLES.SERVICES,
  TABLES.CONTROL_PLANE_PUBLICATIONS,
  TABLES.PARTITIONS,
  TABLES.STORAGE_RESERVATIONS,
  TABLES.REPLICA_OPERATIONS,
]);

const GENERATION_FIELD_SEPARATOR = '\u001f'; // ASCII unit separator
const GENERATION_ABSENT = '\u0000';

// Deterministic canonical serialization of a small own-data record (sorted
// keys, bounded, no prototype walk). Used only on the compact verdict records
// (dimensions, runtimeAuthority, priorityControlPlaneRecovery, publication,
// repair) — never on the large membershipPublication graph, which is covered by
// the table versions instead.
const GENERATION_TABLE_VERSION_KV = ':';
const GENERATION_TABLE_VERSION_SEPARATOR = ';';
const GENERATION_SERVE_ELIGIBLE_TRUE = 'e1';
const GENERATION_SERVE_ELIGIBLE_FALSE = 'e0';
const DIGEST_MAX_DEPTH = 8;
// Canonical-digest structural tags (no domain meaning — pure serialization).
const DIGEST_TAG = Object.freeze({
  NULL: 'n',
  UNDEFINED: 'u',
  STRING_PREFIX: 's:',
  NUMBER_PREFIX: 'd:',
  BOOLEAN_TRUE: 'bT',
  BOOLEAN_FALSE: 'bF',
  BIGINT_PREFIX: 'i:',
  OPAQUE_PREFIX: 'x:',
  ARRAY_OPEN: 'a[',
  ARRAY_CLOSE: ']',
  ARRAY_ELEMENT_SEPARATOR: ',',
  OBJECT_OPEN: 'o{',
  OBJECT_CLOSE: '}',
  OBJECT_PAIR_SEPARATOR: ';',
  OBJECT_KV_SEPARATOR: '=',
});

// Scalar/opaque tag for a non-container value, or null when `value` is a
// container to recurse into. Split out to keep canonicalDigest under the
// per-function complexity bound.
function canonicalScalarDigest(value, depth) {
  if (value === null) return DIGEST_TAG.NULL;
  if (value === undefined) return DIGEST_TAG.UNDEFINED;
  if (typeof value === 'string') return DIGEST_TAG.STRING_PREFIX + value;
  if (typeof value === 'number') return DIGEST_TAG.NUMBER_PREFIX + value;
  if (typeof value === 'boolean') {
    return value ? DIGEST_TAG.BOOLEAN_TRUE : DIGEST_TAG.BOOLEAN_FALSE;
  }
  if (typeof value === 'bigint') return DIGEST_TAG.BIGINT_PREFIX + value;
  if (typeof value !== 'object' || depth >= DIGEST_MAX_DEPTH) {
    return DIGEST_TAG.OPAQUE_PREFIX + String(value);
  }
  return null;
}

function canonicalDigest(value, depth = 0) {
  const scalar = canonicalScalarDigest(value, depth);
  if (scalar !== null) return scalar;
  if (Array.isArray(value)) {
    let out = DIGEST_TAG.ARRAY_OPEN;
    for (let index = 0; index < value.length; index += 1) {
      out += canonicalDigest(value[index], depth + 1) +
        DIGEST_TAG.ARRAY_ELEMENT_SEPARATOR;
    }
    return out + DIGEST_TAG.ARRAY_CLOSE;
  }
  const keys = Object.keys(value).sort();
  let out = DIGEST_TAG.OBJECT_OPEN;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    out += key + DIGEST_TAG.OBJECT_KV_SEPARATOR +
      canonicalDigest(value[key], depth + 1) + DIGEST_TAG.OBJECT_PAIR_SEPARATOR;
  }
  return out + DIGEST_TAG.OBJECT_CLOSE;
}

// Snapshot the six covering table mutation versions into a comparable string.
// Guarded for an absent cache (unit fixtures without a systemTableCache): an
// absent cache yields a constant token, so those callers simply never memoize
// on version changes they cannot observe.
function snapshotProjectionReadinessTableVersions(systemTableCache) {
  if (!systemTableCache ||
      typeof systemTableCache.getTableMutationVersion !== 'function') {
    return GENERATION_ABSENT;
  }
  let out = '';
  for (
    let index = 0;
    index < PROJECTION_READINESS_GENERATION_TABLES.length;
    index += 1
  ) {
    const table = PROJECTION_READINESS_GENERATION_TABLES[index];
    let version;
    try {
      version = systemTableCache.getTableMutationVersion(table);
    } catch {
      version = GENERATION_ABSENT;
    }
    out += table + GENERATION_TABLE_VERSION_KV + version +
      GENERATION_TABLE_VERSION_SEPARATOR;
  }
  return out;
}

// Assemble the full generation key from the version snapshot plus the observed
// verdict digests. `tableVersions` must be a snapshot taken from the SAME
// observation window as the verdict records (the R6 bracket).
function buildProjectionReadinessGenerationKey({
  tableVersions,
  planningVersionKey,
  dimensions,
  runtimeAuthority,
  priorityControlPlaneRecovery,
  runtimeServeEligible,
  publication,
  repairIdentity,
}) {
  return [
    typeof tableVersions === 'string' ? tableVersions : GENERATION_ABSENT,
    typeof planningVersionKey === 'string' || typeof planningVersionKey ===
      'number' ? String(planningVersionKey) : GENERATION_ABSENT,
    canonicalDigest(dimensions),
    canonicalDigest(runtimeAuthority),
    canonicalDigest(priorityControlPlaneRecovery),
    runtimeServeEligible === true ?
      GENERATION_SERVE_ELIGIBLE_TRUE : GENERATION_SERVE_ELIGIBLE_FALSE,
    canonicalDigest(publication),
    typeof repairIdentity === 'string' ? repairIdentity : GENERATION_ABSENT,
  ].join(GENERATION_FIELD_SEPARATOR);
}

export {
  PROJECTION_READINESS_GENERATION_TABLES,
  buildProjectionReadinessGenerationKey,
  snapshotProjectionReadinessTableVersions,
  canonicalDigest,
};
