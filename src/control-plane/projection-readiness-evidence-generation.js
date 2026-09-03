// Generation for ProjectionReadinessEvidenceOwner reuse.
//
// The normalized semantic core of a node is a PURE function of the picked
// owner-path source S(N) = {dimensions, runtimeAuthority,
// priorityControlPlaneRecovery, runtimeServeEligible, nodeEvidence,
// membershipPublication} (projection-readiness-evidence-source.js pick;
// DEP-SCOPE map: solve/evidence/projection-readiness-per-node-generation-
// granularity.dep-scope.md). The generation is therefore a pure function of
// exactly those observed inputs — every field canonically digested with
// observation-time fields excluded — so node N's generation rotates iff one
// of N's own observed semantic inputs changed. Over-invalidation is
// acceptable; under-invalidation is not.
//
// Quest projection-readiness-per-node-generation-granularity(-v2): this owner
// classifies impact scope; source owners are never asked for
// readiness-specific counters, and the key carries NO cluster-wide table
// version and NO planning-derivation segment:
//  - the former six table versions only ever reached the core through
//    digested verdicts, and rotating every node on every write was the
//    measured A3 over-invalidation (readiness-sync-read-fanout-
//    characterization.md);
//  - a whole-table CONTROL_PLANE_PUBLICATIONS version measured as 50% of the
//    residual builds because refreshes/acks/timestamps rotate it far more
//    often than the membership diagnostics' SEMANTIC content changes; the
//    diagnostics are digested instead (small, depth 5), with the digest
//    cached per FROZEN diagnostics object — a pure cache on an immutable
//    value, never an invalidation signal — so the sync path (one memoized
//    diagnostics object per publication version) digests once per version;
//  - the planning derivation version key measured as 43% of residual builds
//    and is provably redundant: the planning snapshot reaches the core only
//    through digested verdicts (runtimeAuthority, priorityControlPlaneRecovery,
//    dimensions, runtimeServeEligible).
//  - Retained: the publication-mode diagnostics digest (v2 DEP finding C).
//    Transport (finding A), SELF lifecycle (finding B) and repair (finding E)
//    manifest in the digested verdicts and the node's own evidence.
//
// Fail-closed: a picked field outside S(N) or a digest that hits the depth
// cap yields an INCOMPLETE generation, and the seam builds without
// memoizing. NO wall-clock/TTL and no object identity participate in the key.

import {types as nodeUtilTypes} from 'node:util';

import {TABLES} from '../constants/tables.js';
import {
  PROJECTION_READINESS_MAX_OWN_DATA_DEPTH,
} from './projection-readiness-evidence.js';

// The table whose synchronous mutation version stamps the readiness
// service's sync membership-publication diagnostics memo (a memo key so the
// memoized diagnostics object is never staler than the cache; NOT a segment
// of the generation key).
const PROJECTION_READINESS_PUBLICATION_MEMO_TABLES = Object.freeze([
  TABLES.CONTROL_PLANE_PUBLICATIONS,
]);

const PROJECTION_READINESS_COVERAGE = Object.freeze({
  CONTENT: 'content',
});

// Every field that may reach the owner seam, with its coverage class. Any
// other own field on the seam source is UNCLASSIFIED and disables memoization
// for that build (DEP-SCOPE fail-closed).
const PROJECTION_READINESS_SOURCE_FIELD_COVERAGE = Object.freeze({
  dimensions: PROJECTION_READINESS_COVERAGE.CONTENT,
  runtimeAuthority: PROJECTION_READINESS_COVERAGE.CONTENT,
  priorityControlPlaneRecovery: PROJECTION_READINESS_COVERAGE.CONTENT,
  runtimeServeEligible: PROJECTION_READINESS_COVERAGE.CONTENT,
  nodeEvidence: PROJECTION_READINESS_COVERAGE.CONTENT,
  membershipPublication: PROJECTION_READINESS_COVERAGE.CONTENT,
});

const PROJECTION_READINESS_GENERATION_STATE = Object.freeze({
  COMPLETE: 'complete',
  INCOMPLETE: 'incomplete',
});

const PROJECTION_READINESS_GENERATION_INCOMPLETE_REASON = Object.freeze({
  UNCLASSIFIED_SOURCE_FIELD: 'unclassified_source_field',
  DIGEST_DEPTH_OVERFLOW: 'digest_depth_overflow',
  // A visited value the strict own-data normalizer would reject (non-plain
  // prototype, proxy, symbol/non-enumerable/accessor key, sparse array,
  // function or symbol leaf): the core would fail closed to its degenerate
  // sourceInvalid form, so the generation must never alias it to a valid one.
  DIGEST_DOMAIN_VIOLATION: 'digest_domain_violation',
});

// Key segments in order. The owner attributes a rotation to the FIRST
// differing segment, so the cluster-wide-by-content membership publication
// comes first, then the node's own evidence, then the verdict digests.
const PROJECTION_READINESS_GENERATION_SEGMENT = Object.freeze([
  'membershipPublication',
  'nodeEvidence',
  'dimensions',
  'runtimeAuthority',
  'priorityControlPlaneRecovery',
  'runtimeServeEligible',
  'publication',
  'repair',
]);

const GENERATION_FIELD_SEPARATOR = '\u001f'; // ASCII unit separator
const GENERATION_ABSENT = '\u0000';

// Deterministic canonical serialization of a small own-data record. Used on
// the compact verdict records (dimensions, runtimeAuthority,
// priorityControlPlaneRecovery, publication, nodeEvidence) and, cached per
// deep-frozen object, on the membership-publication diagnostics.
//
// The digest mirrors the strict own-data normalizer's domain
// (src/utils/strict-own-data.js copyStrictOwnDataRecord /
// copyDenseOwnDataArray, and normalizeProjectionReadinessOwnDataGraph's
// primitive/depth rules): the same depth cap, plain-or-null prototypes only,
// string enumerable data keys only, dense canonical arrays only, no proxies,
// no function/symbol leaves. Anything the normalizer would reject marks the
// generation INCOMPLETE (the core would be the degenerate sourceInvalid form,
// and a key must never alias it to a valid core). Strings and keys are
// length-prefixed so the serialization is injective over that domain: no
// value can forge a separator. No user code is ever invoked (no coercion of
// objects to strings).
const GENERATION_TABLE_VERSION_KV = ':';
const GENERATION_TABLE_VERSION_SEPARATOR = ';';
const GENERATION_SERVE_ELIGIBLE_TRUE = 'e1';
const GENERATION_SERVE_ELIGIBLE_FALSE = 'e0';
// The digest depth cap tracks the normalizer's own-data depth cap exactly:
// the normalizer enters the whole picked source at depth 0, so a seam field's
// value sits at normalizer depth 1 while the digest walks it from depth 0 —
// hence cap - 1. A graph the normalizer would fail closed on is never
// memoized, and every graph it accepts is digested completely (no
// effectiveness cliff below the cap).
const DIGEST_SOURCE_FIELD_DEPTH_OFFSET = 1;
const DIGEST_MAX_DEPTH =
  PROJECTION_READINESS_MAX_OWN_DATA_DEPTH - DIGEST_SOURCE_FIELD_DEPTH_OFFSET;
// Canonical-digest structural tags (no domain meaning — pure serialization).
const DIGEST_TAG = Object.freeze({
  NULL: 'n',
  UNDEFINED: 'u',
  STRING_PREFIX: 's',
  NUMBER_PREFIX: 'd:',
  BOOLEAN_TRUE: 'bT',
  BOOLEAN_FALSE: 'bF',
  BIGINT_PREFIX: 'i:',
  LENGTH_SEPARATOR: ':',
  OVERFLOW: 'x:overflow',
  REJECTED: 'x:rejected',
  ARRAY_OPEN: 'a[',
  ARRAY_CLOSE: ']',
  ARRAY_ELEMENT_SEPARATOR: ',',
  OBJECT_OPEN: 'o{',
  OBJECT_CLOSE: '}',
  OBJECT_PAIR_SEPARATOR: ';',
  OBJECT_KV_SEPARATOR: '=',
});
const DESCRIPTOR_VALUE_FIELD = 'value';
// Private marker for a property slot the strict normalizer would not copy.
const REJECTED_SLOT = Symbol('projection-readiness-digest-rejected-slot');
const isProxyValue = nodeUtilTypes.isProxy.bind(nodeUtilTypes);
const canonicalArrayPrototype = Array.prototype;
const canonicalObjectPrototype = Object.prototype;

// Length-prefixed text: `s<len>:<text>` for leaves, `<len>:<key>` for keys.
function lengthPrefixed(text) {
  return text.length + DIGEST_TAG.LENGTH_SEPARATOR + text;
}

// Tag for a non-container value, or null when `value` is a container to
// recurse into. A container AT the depth cap is recorded as an overflow; a
// function or symbol leaf is a normalizer-domain violation. Neither path
// coerces the value (no user toString / Symbol.toPrimitive is ever invoked).
function canonicalScalarDigest(value, depth, trace) {
  if (value === null) return DIGEST_TAG.NULL;
  if (value === undefined) return DIGEST_TAG.UNDEFINED;
  if (typeof value === 'string') {
    return DIGEST_TAG.STRING_PREFIX + lengthPrefixed(value);
  }
  if (typeof value === 'number') return DIGEST_TAG.NUMBER_PREFIX + value;
  if (typeof value === 'boolean') {
    return value ? DIGEST_TAG.BOOLEAN_TRUE : DIGEST_TAG.BOOLEAN_FALSE;
  }
  if (typeof value === 'bigint') return DIGEST_TAG.BIGINT_PREFIX + value;
  if (typeof value !== 'object') {
    trace.rejected = true;
    return DIGEST_TAG.REJECTED;
  }
  if (depth >= DIGEST_MAX_DEPTH) {
    trace.overflow = true;
    return DIGEST_TAG.OVERFLOW;
  }
  return null;
}

// Observation-time fields excluded from the SEMANTIC digest (quest
// projection-readiness-evidence-amplification-v4, extended by
// projection-readiness-per-node-generation-granularity). The digested records
// exist to cover live non-table state and the node's own evidence; every
// table-derived value is covered by content or the global version. Each
// excluded name is classified at every embed site (INV / DEP-SCOPE receipts):
//  - `enteredAt` in the priority-recovery projection is the publication row's
//    createdAt/updatedAt (table-covered) or, absent a publication, a
//    per-evaluation clock fallback (observational — the exact field measured
//    rotating the key every call, GCP 2026-09-03); in the CDC publication
//    descriptor it is transition-stamped time whose real transitions also
//    change sibling mode/reason content; in runtimeAuthority.visibility it is
//    publication-row time (table-covered).
//  - `observedAt`/`observedAtMs` mean "this evaluation observed at T"
//    everywhere by repo convention: observation metadata, never semantic.
//  - `heartbeatAgeMs`/`readyLeaseAgeMs` in nodeEvidence are `now - rowField`
//    (control-plane-readiness-node-service-rows.js buildClusterMemberHealthDetails):
//    ages AT observation. The row fields they derive from (`lastHeartbeat`,
//    `readyLeaseExpiresAt`) stay digested, so every real row change rotates;
//    the readiness verdicts that depend on the ages (`readyNow`,
//    clusterMemberHealthy) are digested booleans that rotate on a crossing.
// `repair.recordedAt` is deliberately NOT excluded: it is the repair identity
// (v2 DEP finding E) — two otherwise-identical repairs differ only by it.
const DIGEST_OBSERVATION_TIME_FIELDS = Object.freeze(new Set([
  'enteredAt',
  'observedAt',
  'observedAtMs',
  'heartbeatAgeMs',
  'readyLeaseAgeMs',
]));

// A key is skipped when it is an observation-time field anywhere, or a
// record-specific top-level exclusion at depth 0.
function isDigestExcludedKey(key, depth, topLevelExclusions) {
  return DIGEST_OBSERVATION_TIME_FIELDS.has(key) ||
    (depth === 0 && topLevelExclusions !== null && topLevelExclusions.has(key));
}

// Own data value at `key`, or REJECTED_SLOT for anything the strict
// normalizer would not copy: a missing or accessor slot, and for record keys
// (copyStrictOwnDataRecord) a non-enumerable one; array indexes mirror
// copyDenseOwnDataArray, which requires only a data slot.
function readOwnDataValue(value, key, trace, requireEnumerable) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, DESCRIPTOR_VALUE_FIELD) ||
      (requireEnumerable && descriptor.enumerable !== true)) {
    trace.rejected = true;
    return REJECTED_SLOT;
  }
  return descriptor.value;
}

function canonicalSlotDigest(slot, trace, depth) {
  return slot === REJECTED_SLOT ?
    DIGEST_TAG.REJECTED :
    canonicalDigest(slot, trace, depth);
}

// Dense canonical array (mirrors copyDenseOwnDataArray): canonical
// prototype, every index an enumerable own data property.
function canonicalArrayDigest(value, trace, depth) {
  if (Object.getPrototypeOf(value) !== canonicalArrayPrototype) {
    trace.rejected = true;
    return DIGEST_TAG.REJECTED;
  }
  let out = DIGEST_TAG.ARRAY_OPEN;
  for (let index = 0; index < value.length; index += 1) {
    out += canonicalSlotDigest(readOwnDataValue(value, index, trace, false),
      trace, depth + 1) + DIGEST_TAG.ARRAY_ELEMENT_SEPARATOR;
    // Mirror the normalizer's first-rejection return: nothing after a
    // rejection can make the generation complete again.
    if (trace.rejected) return DIGEST_TAG.REJECTED;
  }
  return out + DIGEST_TAG.ARRAY_CLOSE;
}

// Own-data record (mirrors copyStrictOwnDataRecord): plain or null
// prototype, string enumerable data keys only (a symbol key rejects).
function canonicalRecordDigest(value, trace, depth, topLevelExclusions) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== canonicalObjectPrototype && prototype !== null) {
    trace.rejected = true;
    return DIGEST_TAG.REJECTED;
  }
  const ownKeys = Reflect.ownKeys(value);
  const keys = [];
  for (let index = 0; index < ownKeys.length; index += 1) {
    if (typeof ownKeys[index] !== 'string') {
      trace.rejected = true;
      return DIGEST_TAG.REJECTED;
    }
    keys.push(ownKeys[index]);
  }
  keys.sort();
  let out = DIGEST_TAG.OBJECT_OPEN;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    // Every own key must be a copyable data slot and every value — including
    // the observation-time ones the digest omits from the TEXT — must lie in
    // the normalizer's domain, because the normalizer knows no exclusions and
    // fails the whole source closed on any of them. So an excluded value is
    // still walked for the shared trace (rejection / overflow / frozenness)
    // and only its rendered text is discarded.
    const slot = readOwnDataValue(value, key, trace, true);
    const rendered = canonicalSlotDigest(slot, trace, depth + 1);
    if (trace.rejected) return DIGEST_TAG.REJECTED;
    if (isDigestExcludedKey(key, depth, topLevelExclusions)) continue;
    out += lengthPrefixed(key) + DIGEST_TAG.OBJECT_KV_SEPARATOR + rendered +
      DIGEST_TAG.OBJECT_PAIR_SEPARATOR;
  }
  return out + DIGEST_TAG.OBJECT_CLOSE;
}

function canonicalDigest(value, trace, depth = 0, topLevelExclusions = null) {
  const scalar = canonicalScalarDigest(value, depth, trace);
  if (scalar !== null) return scalar;
  if (isProxyValue(value)) {
    trace.rejected = true;
    return DIGEST_TAG.REJECTED;
  }
  if (trace.trackFrozen === true && !Object.isFrozen(value)) {
    trace.unfrozen = true;
  }
  if (Array.isArray(value)) return canonicalArrayDigest(value, trace, depth);
  return canonicalRecordDigest(value, trace, depth, topLevelExclusions);
}

// membershipPublication diagnostics (control-plane-readiness-publication-
// planning-snapshot.js buildMembershipPublicationDiagnostics): the top-level
// createdAt/updatedAt are the publication row's timestamps or, for production
// rows (which carry neither), the observedAt of the build — observation-time
// provenance whose only consumer is the visibility descriptor's enteredAt,
// itself already classified observation-time. Everything else in the
// diagnostics (epoch, status, observation state, node-id lists, counts,
// summaries, recovery gate, boundary outcome) is the semantic content.
const MEMBERSHIP_PUBLICATION_TOP_LEVEL_OBSERVATION_FIELDS =
  Object.freeze(new Set(['createdAt', 'updatedAt']));

// Digest cache for DEEP-FROZEN membership-publication diagnostics objects. A
// deep-frozen graph's content cannot change, so identity -> digest is a pure
// cache (the key remains the content); the sync readiness path memoizes one
// diagnostics object per publication version, so the ~6KB graph is digested
// once per version instead of once per evaluation. Object.isFrozen is
// shallow, so the digest walk itself verifies every visited container is
// frozen and only then caches; any unfrozen container (whose content could
// differ under the same identity) means the object is digested every time.
const MEMBERSHIP_PUBLICATION_DIGEST_BY_FROZEN_OBJECT = new WeakMap();

function digestMembershipPublication(value, trace) {
  if (!value || typeof value !== 'object') {
    return canonicalDigest(value, trace, 0,
      MEMBERSHIP_PUBLICATION_TOP_LEVEL_OBSERVATION_FIELDS);
  }
  const cached = MEMBERSHIP_PUBLICATION_DIGEST_BY_FROZEN_OBJECT.get(value);
  if (cached !== undefined) {
    if (cached.overflow) trace.overflow = true;
    if (cached.rejected) trace.rejected = true;
    return cached.digest;
  }
  const local = {
    overflow: false, rejected: false, trackFrozen: true, unfrozen: false,
  };
  const digest = canonicalDigest(value, local, 0,
    MEMBERSHIP_PUBLICATION_TOP_LEVEL_OBSERVATION_FIELDS);
  if (!local.unfrozen) {
    MEMBERSHIP_PUBLICATION_DIGEST_BY_FROZEN_OBJECT.set(value,
      {digest, overflow: local.overflow, rejected: local.rejected});
  }
  if (local.overflow) trace.overflow = true;
  if (local.rejected) trace.rejected = true;
  return digest;
}

// Stamp the publication table mutation version into a comparable string for
// the readiness service's sync diagnostics memo. Returns GENERATION_ABSENT
// when the cache cannot version its tables (unit fixtures): such fixtures
// keep the listener-cleared memo behavior. Not part of the generation key.
function snapshotProjectionReadinessPublicationMemoStamp(systemTableCache) {
  if (!systemTableCache ||
      typeof systemTableCache.getTableMutationVersion !== 'function') {
    return GENERATION_ABSENT;
  }
  let out = '';
  for (
    let index = 0;
    index < PROJECTION_READINESS_PUBLICATION_MEMO_TABLES.length;
    index += 1
  ) {
    const table = PROJECTION_READINESS_PUBLICATION_MEMO_TABLES[index];
    let version;
    try {
      version = systemTableCache.getTableMutationVersion(table);
    } catch {
      return GENERATION_ABSENT;
    }
    out += table + GENERATION_TABLE_VERSION_KV + version +
      GENERATION_TABLE_VERSION_SEPARATOR;
  }
  return out;
}

// Render the generation key segments (PROJECTION_READINESS_GENERATION_SEGMENT
// order) from the observed records. `trace.overflow` reports a depth-cap hit.
function renderProjectionReadinessGenerationSegments({
  membershipPublication,
  nodeEvidence,
  dimensions,
  runtimeAuthority,
  priorityControlPlaneRecovery,
  runtimeServeEligible,
  publication,
  repairIdentity,
}, trace) {
  return [
    digestMembershipPublication(membershipPublication, trace),
    canonicalDigest(nodeEvidence, trace),
    canonicalDigest(dimensions, trace),
    canonicalDigest(runtimeAuthority, trace),
    canonicalDigest(priorityControlPlaneRecovery, trace),
    runtimeServeEligible === true ?
      GENERATION_SERVE_ELIGIBLE_TRUE : GENERATION_SERVE_ELIGIBLE_FALSE,
    canonicalDigest(publication, trace),
    typeof repairIdentity === 'string' ? repairIdentity : GENERATION_ABSENT,
  ];
}

// String form of the generation key (receipts compare rotation with it).
function buildProjectionReadinessGenerationKey(inputs) {
  return renderProjectionReadinessGenerationSegments(inputs,
    {overflow: false, rejected: false}).join(GENERATION_FIELD_SEPARATOR);
}

// Own fields of the seam source that are not classified in
// PROJECTION_READINESS_SOURCE_FIELD_COVERAGE (empty when fully classified).
function listUnclassifiedProjectionReadinessSourceFields(source) {
  const unclassified = [];
  if (!source || typeof source !== 'object') return unclassified;
  const keys = Object.keys(source);
  for (let index = 0; index < keys.length; index += 1) {
    if (!Object.hasOwn(PROJECTION_READINESS_SOURCE_FIELD_COVERAGE, keys[index])) {
      unclassified.push(keys[index]);
    }
  }
  return unclassified;
}

function incompleteGeneration(reason) {
  return Object.freeze({
    state: PROJECTION_READINESS_GENERATION_STATE.INCOMPLETE,
    reason,
  });
}

// The typed generation the owner seam consumes: COMPLETE with a key, or
// INCOMPLETE with the fail-closed reason.
function buildProjectionReadinessGeneration(inputs, source) {
  if (listUnclassifiedProjectionReadinessSourceFields(source).length > 0) {
    return incompleteGeneration(
      PROJECTION_READINESS_GENERATION_INCOMPLETE_REASON.UNCLASSIFIED_SOURCE_FIELD);
  }
  const trace = {overflow: false, rejected: false};
  const segments = renderProjectionReadinessGenerationSegments(inputs, trace);
  if (trace.overflow) {
    return incompleteGeneration(
      PROJECTION_READINESS_GENERATION_INCOMPLETE_REASON.DIGEST_DEPTH_OVERFLOW);
  }
  if (trace.rejected) {
    return incompleteGeneration(
      PROJECTION_READINESS_GENERATION_INCOMPLETE_REASON.DIGEST_DOMAIN_VIOLATION);
  }
  return Object.freeze({
    state: PROJECTION_READINESS_GENERATION_STATE.COMPLETE,
    key: segments.join(GENERATION_FIELD_SEPARATOR),
  });
}

// Name of the first segment that differs between two COMPLETE keys (rotation
// attribution), or null when equal.
function attributeProjectionReadinessGenerationRotation(previousKey, nextKey) {
  const previous = String(previousKey).split(GENERATION_FIELD_SEPARATOR);
  const next = String(nextKey).split(GENERATION_FIELD_SEPARATOR);
  for (
    let index = 0;
    index < PROJECTION_READINESS_GENERATION_SEGMENT.length;
    index += 1
  ) {
    if (previous[index] !== next[index]) {
      return PROJECTION_READINESS_GENERATION_SEGMENT[index];
    }
  }
  return null;
}

export {
  PROJECTION_READINESS_COVERAGE,
  PROJECTION_READINESS_GENERATION_INCOMPLETE_REASON,
  PROJECTION_READINESS_GENERATION_SEGMENT,
  PROJECTION_READINESS_GENERATION_STATE,
  PROJECTION_READINESS_PUBLICATION_MEMO_TABLES,
  PROJECTION_READINESS_SOURCE_FIELD_COVERAGE,
  attributeProjectionReadinessGenerationRotation,
  buildProjectionReadinessGeneration,
  buildProjectionReadinessGenerationKey,
  snapshotProjectionReadinessPublicationMemoStamp,
};
