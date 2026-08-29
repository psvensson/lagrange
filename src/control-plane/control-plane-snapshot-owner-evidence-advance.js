// Evidence-advance helpers (mechanism A/B) behind the ControlPlaneSnapshotOwner
// entrypoint: the active-gate owner re-evaluates the ACTIVE meaning of a
// repair-deferred observation against NOW-advanced authoritative evidence,
// through the repair owner's own probe (the repair owner stays the sole
// repair-admission owner; the deferral is never bypassed). Nothing here
// re-derives cluster-ACTIVE from nodes.status or publishedActive — it consumes
// the repair owner's typed observation and normalizes it for the owner's
// existing evaluation.

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_FUNCTION = 'function';

function resolveNumericAuthoritativeObservedAtMs(observation = null) {
  const observedAtMs = Number(
    observation?.authoritativeObservedAtMs ?? observation?.observedAtMs,
  );
  return Number.isFinite(observedAtMs) ? observedAtMs : null;
}

function resolveNumericEvidenceRevision(value) {
  const revision = Number(value);
  return Number.isFinite(revision) && revision > 0 ? Math.floor(revision) :
    null;
}

// The deferred repair's own evidence revision: the repair owner's typed
// revision first, then the probe's deferred revision, then the failure's
// completion time — the watermark the probe result is compared against.
function resolveDeferredEvidenceRevision(repair, probe) {
  return resolveNumericEvidenceRevision(
    repair.evidenceRevision ??
      probe.deferredRepairEvidenceRevision ??
      repair.completedAtMs,
  );
}

// Evidence advanced materially only when BOTH watermarks are known and the
// probed authoritative observation is strictly newer than the deferred
// repair's evidence revision; an unknown side never counts as an advance.
function hasAuthoritativeEvidenceAdvanced(
  authoritativeObservedAtMs,
  deferredEvidenceRevision,
) {
  return (
    authoritativeObservedAtMs !== null &&
    deferredEvidenceRevision !== null &&
    authoritativeObservedAtMs > deferredEvidenceRevision
  );
}

// Typed normalization of the repair owner's probe payload fields.
function normalizeRepairOwnerProbeObservation(probe) {
  const authoritativeObservation =
    probe.authoritativeObservation &&
      typeof probe.authoritativeObservation === LOCAL_STR_OBJECT ?
      probe.authoritativeObservation :
      null;
  return {
    probeTableName:
      typeof probe.tableName === LOCAL_STR_STRING ? probe.tableName : null,
    rows: Array.isArray(probe.rows) ? probe.rows : [],
    authoritativeObservation,
  };
}

// Probe the repair owner for advanced authoritative evidence while a repair
// stays deferred. Runs only through the repair owner's own probe method,
// never as a repair bypass; the deferral itself is untouched.
async function probeRepairOwnerEvidenceAdvance(
  serviceDiscovery = null,
  repair = null,
  repairOptions = {},
) {
  const probeFn = serviceDiscovery?.probeAuthoritativeDiscoveryEvidenceRevision;
  if (typeof probeFn !== LOCAL_STR_FUNCTION || repair?.deferred !== true) {
    return null;
  }
  const probe = await probeFn.call(serviceDiscovery, repairOptions);
  if (!probe || typeof probe !== LOCAL_STR_OBJECT) {
    return null;
  }
  const authoritativeObservedAtMs =
    resolveNumericAuthoritativeObservedAtMs(probe.authoritativeObservation);
  const deferredEvidenceRevision = resolveDeferredEvidenceRevision(
    repair,
    probe,
  );
  return {
    evidenceAdvanced: hasAuthoritativeEvidenceAdvanced(
      authoritativeObservedAtMs,
      deferredEvidenceRevision,
    ),
    authoritativeObservedAtMs,
    deferredEvidenceRevision,
    ...normalizeRepairOwnerProbeObservation(probe),
  };
}

// Mechanism A (evidence-revision invalidation / level-trigger): when the
// repair owner's probe reports authoritative evidence materially NEWER than
// the deferred repair's own evidence revision, the deferred failure
// observation no longer governs the ACTIVE meaning — the local evidence has
// advanced past it. The active-gate owner (sole ACTIVE-decision owner) then
// re-evaluates freshness against the ADVANCED evidence watermark instead of
// the stale rebuilt snapshot. The repair owner stays the sole repair-admission
// owner: no repair is re-admitted, the backoff/retryAtMs gate is untouched,
// and success-reuse/failure-deferral are never bypassed.
function resolveEvidenceAdvancedWatermark(
  repairedSnapshot = null,
  evidenceAdvance = null,
) {
  const base = Number.isFinite(Number(repairedSnapshot?.cacheWatermarkMs)) ?
    Number(repairedSnapshot.cacheWatermarkMs) :
    0;
  const advanced = resolveNumericAuthoritativeObservedAtMs(
    evidenceAdvance?.authoritativeObservation,
  );
  return advanced !== null && advanced > base ? advanced : base;
}

export {
  probeRepairOwnerEvidenceAdvance,
  resolveEvidenceAdvancedWatermark,
};
