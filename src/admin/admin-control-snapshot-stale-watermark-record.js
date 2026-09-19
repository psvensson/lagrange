/**
 * Which node holds the lapsed ready lease the control snapshot's stale
 * watermark is set on, how far past expiry that lease is, and for how long
 * the watermark has been set - stated once per transition.
 *
 * In the formation traced by the second causal packet of 2026-09-19 the
 * seed's admin control snapshot reported `stale_usable` for 167 s because
 * `resolveControlSnapshotCacheStaleWatermark` kept finding an active-or-ready
 * node whose ready lease had lapsed. That is a fact about the cluster, and
 * the nine-table cache repair it selects can never clear it: 27 of 28
 * successful repairs in that run reported `repairedRowCount: 0`. Nothing in
 * the record said which node it was, and the control snapshot owner had no
 * logger at all. This module is that statement and nothing else: it decides
 * nothing, reads no source, holds no clock of its own, and hands the
 * watermark it is given straight back (quest lease-liveness-watermark-observed).
 *
 * NOTHING HERE MAY REACH THE CALLER. The control snapshot owner is on the
 * request path: a throw here would reject a snapshot request main resolves.
 * So the logger reference is read inside a guard (a throwing getter or a
 * proxy is a real shape), the emission is guarded, and the record is
 * committed BEFORE the emission is attempted - otherwise a logger that
 * throws would replay the same transition on every later evaluation. A
 * failed emission is counted, never swallowed, and the count is stated on
 * the next line that does get out. No counter here enters a returned
 * payload.
 *
 * A STEADY STATE LOGS NOTHING. The hot path compares two fields: what the
 * watermark is (cleared, or set) and, when set, on which node. An unchanged
 * answer allocates nothing, counts one suppressed evaluation and returns.
 * Only a change reads the witness or emits, and the line it emits says how
 * many identical evaluations it suppressed. The first evaluation of an owner
 * that finds no stale node is not a transition and is silent; the first that
 * finds one is reported, because a lapsed lease nobody has seen before is
 * exactly the event the packet could not observe.
 *
 * OBSERVATIONS ARRIVE OUT OF ORDER. `buildLocalControlSnapshot` stamps
 * `capturedAt` before it awaits the diagnostics, and requests are not
 * single-flight, so an evaluation of an OLDER cluster can commit after a
 * newer one. Such an evaluation is not a transition of anything: it is
 * counted as an out-of-order observation, stated on the next line, and
 * otherwise ignored. Every duration this module prints is therefore
 * non-negative, and `setForMs` is measured from the FIRST set of the run.
 * This adds no lock and does not serialise the caller.
 *
 * THE VALUES ARE THE DECIDING EVALUATION'S. The node, its status, its
 * connection state and its lease age all come from the witness the deciding
 * evaluation already built, and the observation time is the one that
 * evaluation was given. Nothing here re-reads the nodes rows, and no value it
 * records reaches the watermark, the repair trigger or any comparison that
 * decides them.
 *
 * THE STALE NODE IS NAMED BY A ROLE KEY. `LoggingService.buildConsolePayload`
 * rewrites a top-level `nodeId` to the EMITTING node, so a field called
 * `nodeId` would read as the seed in the node log. The lapsed node is
 * `staleNodeId`.
 *
 * Per-owner state lives in a WeakMap keyed by the control snapshot owner and
 * dies with it. It is one record per owner - not one per node - so it cannot
 * grow.
 */

const CONTROL_SNAPSHOT_OWNER_TYPE = 'object';
const STRING_TYPE = 'string';
const NO_SUPPRESSED_EVALUATIONS = 0;
const NO_FAILED_EMISSIONS = 0;
const NO_OUT_OF_ORDER_OBSERVATIONS = 0;

/**
 * What the watermark is, for this owner, as last observed.
 */
const CONTROL_SNAPSHOT_STALE_WATERMARK_STATE = Object.freeze({
  CLEARED: 'cleared',
  SET: 'set',
  UNOBSERVED: 'unobserved',
});

/**
 * The transitions of that state which are worth one line each.
 */
const CONTROL_SNAPSHOT_STALE_WATERMARK_TRANSITION = Object.freeze({
  CLEARED: 'cleared',
  NODE_CHANGED: 'node_changed',
  SET: 'set',
});

/**
 * How the named node's ready lease stands against the observation time. The
 * watermark predicate also admits rows whose lease has NOT lapsed (a status
 * that differs only in case is compared raw by the readiness owner), so a
 * lease age is never printed as a negative "expired for".
 */
const CONTROL_SNAPSHOT_LEASE_AGE_STATE = Object.freeze({
  EXPIRED: 'expired',
  NOT_EXPIRED: 'not_expired',
  UNAVAILABLE: 'unavailable',
});

const CONTROL_SNAPSHOT_STALE_WATERMARK_LOG_MSG = Object.freeze({
  TRANSITION: 'Control snapshot stale watermark transition',
});

const READY_LEASE_EVIDENCE_AVAILABLE = 'available';
const NOT_EXPIRED_AGE_CEILING_MS = 0;
// The age itself was not measurable; `leaseAgeState` is what says so, and
// these two carry no state of their own.
const UNMEASURED_LEASE_AGE = Object.freeze({
  leaseAgeState: CONTROL_SNAPSHOT_LEASE_AGE_STATE.UNAVAILABLE,
  readyLeaseAgeMs: null,
  leaseExpiredForMs: null,
});
// An available lease has no unavailability reason to give.
const NO_READY_LEASE_REASON = null;

const recordsByOwner = new WeakMap();

function isControlSnapshotOwner(owner) {
  return Boolean(owner) && typeof owner === CONTROL_SNAPSHOT_OWNER_TYPE;
}

function readRecord(owner) {
  let record = recordsByOwner.get(owner);
  if (!record) {
    record = {
      state: CONTROL_SNAPSHOT_STALE_WATERMARK_STATE.UNOBSERVED,
      staleNodeId: null,
      setAtMs: null,
      observedAtMs: null,
      suppressedEvaluations: NO_SUPPRESSED_EVALUATIONS,
      outOfOrderObservations: NO_OUT_OF_ORDER_OBSERVATIONS,
      failedEmissions: NO_FAILED_EMISSIONS,
    };
    recordsByOwner.set(owner, record);
  }
  return record;
}

function optionalString(value) {
  return typeof value === STRING_TYPE && value.length > 0 ? value : null;
}

// The logger reference itself can throw: a getter, or a proxy that traps get.
// Reading it is therefore guarded, and an unreadable logger is an emission
// failure like any other rather than an exception on the request path.
function resolveLogger(record, owner) {
  try {
    const logger = owner.logger;
    return typeof logger?.info === 'function' ? logger : null;
  } catch (_error) {
    record.failedEmissions += 1;
    return null;
  }
}

// The lease evidence of the witness the deciding evaluation already built.
// An absent lease, and a lease that has not lapsed, are named states rather
// than a silent zero or a negative age.
function readLeaseEvidence(witness) {
  const readyLease = witness?.readyLease;
  const available = readyLease?.state === READY_LEASE_EVIDENCE_AVAILABLE &&
    Number.isFinite(readyLease?.ageMs);
  if (!available) {
    return {
      readyLeaseState: optionalString(readyLease?.state),
      readyLeaseReason: optionalString(readyLease?.reason),
      ...UNMEASURED_LEASE_AGE,
    };
  }
  const expired = readyLease.ageMs >= NOT_EXPIRED_AGE_CEILING_MS;
  return {
    readyLeaseState: optionalString(readyLease.state),
    readyLeaseReason: NO_READY_LEASE_REASON,
    leaseAgeState: expired ?
      CONTROL_SNAPSHOT_LEASE_AGE_STATE.EXPIRED :
      CONTROL_SNAPSHOT_LEASE_AGE_STATE.NOT_EXPIRED,
    readyLeaseAgeMs: readyLease.ageMs,
    leaseExpiredForMs: expired ? readyLease.ageMs : null,
  };
}

const ABSENT_LEASE_EVIDENCE = Object.freeze({
  readyLeaseState: null,
  readyLeaseReason: null,
  ...UNMEASURED_LEASE_AGE,
});

function resolveSetForMs(record, observedAtMs) {
  return Number.isFinite(record.setAtMs) && Number.isFinite(observedAtMs) ?
    observedAtMs - record.setAtMs :
    null;
}

// An evaluation of an older cluster than one already committed. It is not a
// transition of anything and can only produce a negative duration.
function isOutOfOrder(record, observedAtMs) {
  return Number.isFinite(record.observedAtMs) &&
    Number.isFinite(observedAtMs) &&
    observedAtMs < record.observedAtMs;
}

// The whole steady-state cost: two field comparisons, no allocation and no
// clock read. `unobserved` matches neither branch, so the first evaluation of
// an owner is always a change.
function isUnchanged(record, watermarkSet, staleNodeId) {
  if (watermarkSet) {
    return record.state === CONTROL_SNAPSHOT_STALE_WATERMARK_STATE.SET &&
      record.staleNodeId === staleNodeId;
  }
  return record.state === CONTROL_SNAPSHOT_STALE_WATERMARK_STATE.CLEARED;
}

function resolveTransition(record, watermarkSet) {
  if (!watermarkSet) {
    return CONTROL_SNAPSHOT_STALE_WATERMARK_TRANSITION.CLEARED;
  }
  return record.state === CONTROL_SNAPSHOT_STALE_WATERMARK_STATE.SET ?
    CONTROL_SNAPSHOT_STALE_WATERMARK_TRANSITION.NODE_CHANGED :
    CONTROL_SNAPSHOT_STALE_WATERMARK_TRANSITION.SET;
}

// Built from the record BEFORE it is committed, so the line states what was
// true at the transition; emitted after, so a throwing logger cannot replay
// it.
function buildTransitionFields(record, context) {
  const lease = context.watermarkSet ?
    readLeaseEvidence(context.witness) :
    ABSENT_LEASE_EVIDENCE;
  return {
    transition: context.transition,
    staleNodeId: context.staleNodeId,
    previousStaleNodeId: record.staleNodeId,
    status: context.watermarkSet ?
      optionalString(context.witness?.status) :
      null,
    connectionState: context.watermarkSet ?
      optionalString(context.witness?.connectionState) :
      null,
    readyLeaseState: lease.readyLeaseState,
    readyLeaseReason: lease.readyLeaseReason,
    leaseAgeState: lease.leaseAgeState,
    readyLeaseAgeMs: lease.readyLeaseAgeMs,
    leaseExpiredForMs: lease.leaseExpiredForMs,
    setForMs: context.transition ===
      CONTROL_SNAPSHOT_STALE_WATERMARK_TRANSITION.SET ?
      null :
      resolveSetForMs(record, context.observedAtMs),
    suppressedEvaluations: record.suppressedEvaluations,
    outOfOrderObservations: record.outOfOrderObservations,
    failedEmissions: record.failedEmissions,
  };
}

function commitRecord(record, watermarkSet, staleNodeId, observedAtMs) {
  record.setAtMs = watermarkSet ?
    (record.state === CONTROL_SNAPSHOT_STALE_WATERMARK_STATE.SET ?
      record.setAtMs :
      observedAtMs) :
    null;
  record.state = watermarkSet ?
    CONTROL_SNAPSHOT_STALE_WATERMARK_STATE.SET :
    CONTROL_SNAPSHOT_STALE_WATERMARK_STATE.CLEARED;
  record.staleNodeId = staleNodeId;
  record.observedAtMs = Number.isFinite(observedAtMs) ?
    observedAtMs :
    record.observedAtMs;
  record.suppressedEvaluations = NO_SUPPRESSED_EVALUATIONS;
  record.outOfOrderObservations = NO_OUT_OF_ORDER_OBSERVATIONS;
}

// The emission itself, and only the emission, is allowed to fail. A failure
// bumps a counter the next line that gets out will state; it never reaches
// the caller and never enters a returned payload.
function emitTransitionLine(record, owner, fields) {
  const logger = resolveLogger(record, owner);
  if (!logger) {
    return;
  }
  try {
    const emitted = logger.info(
      CONTROL_SNAPSHOT_STALE_WATERMARK_LOG_MSG.TRANSITION,
      fields,
    );
    record.failedEmissions = NO_FAILED_EMISSIONS;
    // The real logging service's `info` is synchronous and returns nothing.
    // A sink that returns a thenable anyway would otherwise reject with
    // nobody listening, so its rejection is counted like any other failed
    // emission. Registering the handler schedules a microtask; it awaits
    // nothing and changes no ordering the caller can observe.
    if (typeof emitted?.then === 'function') {
      emitted.then(undefined, () => {
        record.failedEmissions += 1;
      });
    }
  } catch (_error) {
    record.failedEmissions += 1;
  }
}

/**
 * State what this evaluation decided the watermark is, then hand that same
 * answer straight back.
 *
 * @param {Object|null} owner - The control snapshot owner that evaluated.
 * @param {Object} watermark - The frozen watermark result of this
 *   evaluation: `{cacheStaleWatermark, readyLeaseAgeWitness}`.
 * @param {number} observedAtMs - The observation time that evaluation used,
 *   from the owner's supplied time source.
 * @return {Object} That same watermark result, unchanged.
 */
function noteControlSnapshotStaleWatermark(owner, watermark, observedAtMs) {
  if (!isControlSnapshotOwner(owner)) {
    return watermark;
  }
  const record = readRecord(owner);
  const watermarkSet = watermark?.cacheStaleWatermark === true;
  const witness = watermarkSet ? watermark.readyLeaseAgeWitness : null;
  const staleNodeId = watermarkSet ? optionalString(witness?.nodeId) : null;
  if (isOutOfOrder(record, observedAtMs)) {
    record.outOfOrderObservations += 1;
    return watermark;
  }
  if (isUnchanged(record, watermarkSet, staleNodeId)) {
    record.suppressedEvaluations += 1;
    record.observedAtMs = Number.isFinite(observedAtMs) ?
      observedAtMs :
      record.observedAtMs;
    return watermark;
  }
  const reportable =
    record.state !== CONTROL_SNAPSHOT_STALE_WATERMARK_STATE.UNOBSERVED ||
    watermarkSet;
  const fields = reportable ?
    buildTransitionFields(record, {
      transition: resolveTransition(record, watermarkSet),
      staleNodeId,
      watermarkSet,
      witness,
      observedAtMs,
    }) :
    null;
  commitRecord(record, watermarkSet, staleNodeId, observedAtMs);
  if (fields) {
    emitTransitionLine(record, owner, fields);
  }
  return watermark;
}

export {
  CONTROL_SNAPSHOT_LEASE_AGE_STATE,
  CONTROL_SNAPSHOT_STALE_WATERMARK_LOG_MSG,
  CONTROL_SNAPSHOT_STALE_WATERMARK_TRANSITION,
  noteControlSnapshotStaleWatermark,
};
