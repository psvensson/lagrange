/**
 * Why the planning owner is serving a deferred readiness snapshot instead of
 * an admitted record, stated once per transition, per owner key AND per build
 * variant.
 *
 * In the formation traced by the second causal packet of 2026-09-19 a
 * joiner's planning owner served a deferred snapshot of the seed for 173 s.
 * Every term of the reuse decision and every refusal of the publish decision
 * was silent, so WHICH condition kept a new build from being admitted could
 * not be observed at all. This module is that statement and nothing else: it
 * decides nothing, reads no source, and hands every value it is given
 * straight back (quest readiness-admission-freeze-observed).
 *
 * STATE FOLLOWS THE OWNER'S OWN GRANULARITY. What the owner serves for one
 * read is decided by three things it already keys on: the owner key, the
 * build-options key of the variant, and the read's participation kind - the
 * last because only a ROUTED_READ may be served through the sealed CL-012
 * bridge, so a routed read of a variant can be admitted in the same instant a
 * planning read of that same variant is deferred. All three are the record's
 * key here, and all three are on the line. Keyed by owner key alone this
 * module called two variants in two stable states a flap and logged on every
 * read (round-1 verification measured 999 lines in 1000 reads, and 400 in 400
 * for one variant read two ways).
 *
 * LIFETIME FOLLOWS THE OWNER'S OWN RECORD. There is no eviction policy here.
 * A variant is forgotten when the owner forgets it - `rememberBuildOptions`
 * discarding the oldest variant past its own cap, or `shutdown` - so the
 * diagnostic is exactly as large as the state it describes and can never
 * outlive it. A private FIFO of its own restarted live keys from `unobserved`
 * and turned every steady read into a line (round-1 verification measured
 * 1320 lines in 1320 reads across 66 keys).
 *
 * THE FAILED TERMS ARE THE ONES THE DECISION USED. The caller evaluates its
 * terms exactly as it did before - the reuse chain still short-circuits, so
 * the live-evidence veto is still consulted only when every cheaper term
 * passed - and deposits the resulting bit set here. A term the decision never
 * reached is simply absent from that set; it is never re-evaluated here.
 *
 * A STEADY STATE LOGS NOTHING. The hot path compares one integer: the
 * signature of what is being served (deferred plus its failed terms, or the
 * single admitted signature). An unchanged signature increments a counter and
 * returns. Only a change allocates, reads the clock or emits, and the line it
 * emits says how many identical reads it suppressed. The first read of a
 * variant that serves an admitted record is not a transition and is silent -
 * and reads no clock; the first that serves a deferred one is reported from
 * the `unobserved` state, because a deferral nobody has seen before is
 * exactly the event the packet could not observe.
 *
 * EMISSION CANNOT CHANGE BEHAVIOUR. Main's planning owner logs nothing on
 * these paths, so a logger that throws must not fail a read or abort a
 * publish. The record is advanced BEFORE the line is handed to the logger, so
 * a refused emission is not retried on the next read, and the refusal is
 * counted rather than swallowed: the next line that does get out states
 * `droppedLineCount`. That counter is deliberately absent from the owner's
 * `getDiagnostics`, which is a surface compared against main's.
 *
 * Per-variant state lives in a WeakMap keyed by the planning owner and dies
 * with it. Nothing here is attached to a snapshot, a completed record or a
 * token, so no field added for diagnosis can enter a memo key, an identity, a
 * generation or any equality that decides reuse.
 */

const arrayPush = Function.call.bind(Array.prototype.push);
const mapDelete = Function.call.bind(Map.prototype.delete);
const mapGet = Function.call.bind(Map.prototype.get);
const mapSet = Function.call.bind(Map.prototype.set);
const mapSize = Function.call.bind(
  Object.getOwnPropertyDescriptor(Map.prototype, 'size').get,
);
const mapForEach = Function.call.bind(Map.prototype.forEach);
const numberIsFinite = Number.isFinite;
const objectFreeze = Object.freeze;
const MapConstructor = Map;
const WeakMapConstructor = WeakMap;

const PLANNING_OWNER_TYPE = 'object';
const PARTICIPATION_KIND_TYPE = 'string';
// A read that named no participation kind: an explicit named state of its
// own, because such a read can never take the ROUTED_READ bridge.
const READINESS_ADMISSION_PARTICIPATION_UNSTATED = 'unstated';
const NO_TERMS = 0;
const NO_SUPPRESSED_READS = 0;
const NO_DROPPED_LINES = 0;
const NO_TERMS_WITHHELD = 0;
const FIRST_BIT = 1;

/**
 * The state a planning owner is in for one owner key and build variant.
 */
const READINESS_ADMISSION_STATE = objectFreeze({
  ADMITTED: 'admitted',
  DEFERRED: 'deferred',
  UNOBSERVED: 'unobserved',
});

/**
 * The state of that variant's publish decision.
 */
const READINESS_PUBLICATION_STATE = objectFreeze({
  PUBLISHED: 'published',
  REFUSED: 'refused',
  UNOBSERVED: 'unobserved',
});

/**
 * The terms of the read path's admission decision, in the order the owner
 * evaluates them. The first three are the ordered classification barrier and
 * the missing-record case in `readSync`; the rest are the reuse chain in
 * `canReuseCompletedSnapshot`.
 */
const READINESS_ADMISSION_TERM = objectFreeze({
  TRANSPORT_TOPOLOGY_INVALID: 'transport_topology_invalid',
  SOURCE_CHANGE_UNCLASSIFIED: 'source_change_unclassified',
  COMPLETED_RECORD_ABSENT: 'completed_record_absent',
  GENERATION_SATURATED: 'generation_saturated',
  PLANNING_IDENTITY_SATURATED: 'planning_identity_saturated',
  BUILD_OPTIONS_KEY_CHANGED: 'build_options_key_changed',
  FRESHNESS_NOT_CURRENT: 'freshness_not_current',
  LIVE_EVIDENCE_VETO: 'live_evidence_veto',
});

/**
 * The terms of the completion-currency decision that refuse a publish.
 */
const READINESS_PUBLICATION_REFUSAL_TERM = objectFreeze({
  COMPLETION_TOKEN_NOT_CURRENT: 'completion_token_not_current',
  TRANSPORT_TOPOLOGY_INVALID: 'transport_topology_invalid',
  PUBLICATION_GUARD_CHANGED: 'publication_guard_changed',
  PLANNING_IDENTITY_NOT_CURRENT: 'planning_identity_not_current',
  SOURCE_CHANGE_UNCLASSIFIED: 'source_change_unclassified',
});

const READINESS_ADMISSION_LOG_MSG = objectFreeze({
  ADMISSION_TRANSITION: 'Readiness planning admission transition',
  PUBLICATION_REFUSED: 'Readiness planning publication refused',
});

function buildTermBits(names) {
  const bits = {};
  for (let index = 0; index < names.length; index += 1) {
    bits[names[index]] = FIRST_BIT << index;
  }
  return objectFreeze(bits);
}

const READINESS_ADMISSION_TERM_NAMES = objectFreeze([
  READINESS_ADMISSION_TERM.TRANSPORT_TOPOLOGY_INVALID,
  READINESS_ADMISSION_TERM.SOURCE_CHANGE_UNCLASSIFIED,
  READINESS_ADMISSION_TERM.COMPLETED_RECORD_ABSENT,
  READINESS_ADMISSION_TERM.GENERATION_SATURATED,
  READINESS_ADMISSION_TERM.PLANNING_IDENTITY_SATURATED,
  READINESS_ADMISSION_TERM.BUILD_OPTIONS_KEY_CHANGED,
  READINESS_ADMISSION_TERM.FRESHNESS_NOT_CURRENT,
  READINESS_ADMISSION_TERM.LIVE_EVIDENCE_VETO,
]);

const READINESS_PUBLICATION_REFUSAL_TERM_NAMES = objectFreeze([
  READINESS_PUBLICATION_REFUSAL_TERM.COMPLETION_TOKEN_NOT_CURRENT,
  READINESS_PUBLICATION_REFUSAL_TERM.TRANSPORT_TOPOLOGY_INVALID,
  READINESS_PUBLICATION_REFUSAL_TERM.PUBLICATION_GUARD_CHANGED,
  READINESS_PUBLICATION_REFUSAL_TERM.PLANNING_IDENTITY_NOT_CURRENT,
  READINESS_PUBLICATION_REFUSAL_TERM.SOURCE_CHANGE_UNCLASSIFIED,
]);

const READINESS_ADMISSION_TERM_BIT = buildTermBits(
  READINESS_ADMISSION_TERM_NAMES,
);
const READINESS_PUBLICATION_REFUSAL_TERM_BIT = buildTermBits(
  READINESS_PUBLICATION_REFUSAL_TERM_NAMES,
);

// The one bit above the term bits, so a deferred read with no failed term can
// never collide with the admitted signature.
const DEFERRED_SIGNATURE_BIT =
  FIRST_BIT << READINESS_ADMISSION_TERM_NAMES.length;
const ADMITTED_SIGNATURE = NO_TERMS;
// No read has been served for this variant yet. An explicit named state: the
// admitted signature is 0 and every deferred one carries the deferred bit, so
// a negative signature is a value no read can produce.
const UNOBSERVED_ADMISSION_SIGNATURE = -1;

const recordsByOwner = new WeakMapConstructor();

function isPlanningOwner(owner) {
  return Boolean(owner) && typeof owner === PLANNING_OWNER_TYPE;
}

function readNestedMap(parent, key, create) {
  let child = mapGet(parent, key);
  if (!child && create) {
    child = new MapConstructor();
    mapSet(parent, key, child);
  }
  return child || null;
}

function readOwnerVariants(owner, ownerKey, create) {
  let byOwnerKey = recordsByOwner.get(owner);
  if (!byOwnerKey) {
    if (!create) return null;
    byOwnerKey = new MapConstructor();
    recordsByOwner.set(owner, byOwnerKey);
  }
  return readNestedMap(byOwnerKey, ownerKey, create);
}

// One build variant of one owner key. `evaluatedTerms` belongs here, not on
// the per-participation record: the reuse decision is made once per variant
// and never looks at the participation kind, so both readers of the variant
// see the terms that one evaluation failed.
function readVariantNode(owner, ownerKey, buildOptionsKey, create) {
  const variants = readOwnerVariants(owner, ownerKey, create);
  if (!variants) return null;
  let variant = mapGet(variants, buildOptionsKey);
  if (!variant && create) {
    variant = {evaluatedTerms: NO_TERMS, byParticipation: new MapConstructor()};
    mapSet(variants, buildOptionsKey, variant);
  }
  return variant || null;
}

function buildRecord(ownerKey, buildOptionsKey, participationKind, variant) {
  return {
    ownerKey,
    buildOptionsKey,
    participationKind,
    variant,
    admissionSignature: UNOBSERVED_ADMISSION_SIGNATURE,
    admissionState: READINESS_ADMISSION_STATE.UNOBSERVED,
    suppressedReads: NO_SUPPRESSED_READS,
    deferredSinceMs: null,
    publicationSignature: NO_TERMS,
    publicationState: READINESS_PUBLICATION_STATE.UNOBSERVED,
    suppressedRefusals: NO_SUPPRESSED_READS,
    refusedSinceMs: null,
    droppedLineCount: NO_DROPPED_LINES,
  };
}

// The read's participation kind as a key: an unstated kind is its own named
// state, never folded into a routed one.
function readParticipationKey(participationKind) {
  return typeof participationKind === PARTICIPATION_KIND_TYPE &&
    participationKind.length > 0 ?
    participationKind :
    READINESS_ADMISSION_PARTICIPATION_UNSTATED;
}

function readVariantRecord(
  owner,
  ownerKey,
  buildOptionsKey,
  participationKind,
  create,
) {
  if (!isPlanningOwner(owner)) return null;
  const variant = readVariantNode(owner, ownerKey, buildOptionsKey, create);
  if (!variant) return null;
  const participationKey = readParticipationKey(participationKind);
  let record = mapGet(variant.byParticipation, participationKey);
  if (!record && create) {
    record = buildRecord(ownerKey, buildOptionsKey, participationKey, variant);
    mapSet(variant.byParticipation, participationKey, record);
  }
  return record || null;
}

// The rendering of a bit set. Only a transition reaches this, so the
// allocation it makes is bounded by the number of state changes. The list is
// bounded by construction: the names are a frozen module constant, so a line
// can carry at most that many entries and nothing is ever withheld. The
// payload still states that (bounded-payload).
function renderTerms(mask, names) {
  const entries = [];
  for (let index = 0; index < names.length; index += 1) {
    if ((mask & (FIRST_BIT << index)) !== NO_TERMS) {
      arrayPush(entries, names[index]);
    }
  }
  return objectFreeze(entries);
}

// The observation time the caller already read from the owner's supplied
// clock for this read or this publish. This module never reads a clock of its
// own - not an ambient one, and not a second call to the owner's - so it can
// add no clock read main did not make, under any clock.
function normalizeNowMs(nowMs) {
  return numberIsFinite(nowMs) ? nowMs : null;
}

function resolveAgeMs(nowMs, sinceMs) {
  return numberIsFinite(nowMs) && numberIsFinite(sinceMs) ?
    nowMs - sinceMs :
    null;
}

// Emission is the last thing that happens and the only thing that may fail.
// A logger that throws is counted, never rethrown: main logs nothing here, so
// a sink failure may not change a read, a publish or a build count. EVERY
// step of reaching the sink is inside the guard - a hostile `service.logger`
// getter, an `info` getter and a Proxy all throw on the read itself, not on
// the call - and a sink that returns a thenable has its rejection counted
// rather than left unhandled. The handler awaits nothing and changes no
// ordering a caller can observe.
function emit(owner, record, message, payload) {
  try {
    const logger = owner?.service?.logger;
    if (typeof logger?.info !== 'function') {
      record.droppedLineCount += 1;
      return;
    }
    const emitted = logger.info(message, payload);
    record.droppedLineCount = NO_DROPPED_LINES;
    if (typeof emitted?.then === 'function') {
      emitted.then(undefined, () => {
        record.droppedLineCount += 1;
      });
    }
  } catch {
    record.droppedLineCount += 1;
  }
}

function emitAdmissionTransition(owner, record, context) {
  emit(owner, record, READINESS_ADMISSION_LOG_MSG.ADMISSION_TRANSITION, {
    ownerKey: record.ownerKey,
    buildOptionsKey: record.buildOptionsKey,
    participationKind: record.participationKind,
    previousState: context.previousState,
    state: context.state,
    failedTerms: renderTerms(
      context.failedTerms,
      READINESS_ADMISSION_TERM_NAMES,
    ),
    failedTermsWithheld: NO_TERMS_WITHHELD,
    inheritedRecordAgeMs: resolveAgeMs(context.nowMs, context.completedAtMs),
    deferredForMs: context.deferredForMs,
    suppressedReads: context.suppressedReads,
    droppedLineCount: record.droppedLineCount,
  });
}

function emitPublicationOutcome(owner, record, context) {
  emit(owner, record, READINESS_ADMISSION_LOG_MSG.PUBLICATION_REFUSED, {
    ownerKey: record.ownerKey,
    buildOptionsKey: record.buildOptionsKey,
    previousState: context.previousState,
    state: context.state,
    refusalTerms: renderTerms(
      context.refusalTerms,
      READINESS_PUBLICATION_REFUSAL_TERM_NAMES,
    ),
    refusalTermsWithheld: NO_TERMS_WITHHELD,
    refusedForMs: context.refusedForMs,
    suppressedRefusals: context.suppressedRefusals,
    droppedLineCount: record.droppedLineCount,
  });
}

// While admitted, the failed terms of a bridged or bootstrapped read are not
// a transition, so every admitted read carries the same signature: a record
// that is being served is a record that is being served.
function admissionSignature(deferred, failedTerms) {
  return deferred ?
    (failedTerms | DEFERRED_SIGNATURE_BIT) :
    ADMITTED_SIGNATURE;
}

/**
 * Start one read of one owner key and build variant: forget the terms any
 * earlier evaluation deposited on this variant.
 *
 * @param {Object|null} owner - The planning owner answering.
 * @param {string|null} ownerKey - The owner key this read is for.
 * @param {string|null} buildOptionsKey - The build variant this read is for.
 * @return {Object|null} The variant's record, or null for a non-owner.
 */
function beginReadinessAdmissionRead(
  owner,
  ownerKey,
  buildOptionsKey,
  participationKind,
) {
  const record = readVariantRecord(
    owner, ownerKey, buildOptionsKey, participationKind, true);
  if (record) record.variant.evaluatedTerms = NO_TERMS;
  return record;
}

/**
 * Deposit the terms one evaluation failed, for the read in flight on that
 * variant. Called by the reuse decision, which the read path reaches through
 * the owner's own method.
 *
 * @param {Object|null} owner - The planning owner answering.
 * @param {string|null} ownerKey - The owner key.
 * @param {string|null} buildOptionsKey - The build variant.
 * @param {number} failedTerms - Bit set of the terms that failed.
 * @return {void}
 */
function noteReadinessAdmissionTerms(
  owner,
  ownerKey,
  buildOptionsKey,
  failedTerms,
) {
  const variant = isPlanningOwner(owner) ?
    readVariantNode(owner, ownerKey, buildOptionsKey, true) : null;
  if (variant) variant.evaluatedTerms |= failedTerms;
}

/**
 * The terms deposited on this variant by the evaluation that just ran.
 *
 * @param {Object|null} record - The variant record from `begin`.
 * @return {number} The bit set, or none.
 */
function readReadinessAdmissionEvaluatedTerms(record) {
  return record ? record.variant.evaluatedTerms : NO_TERMS;
}

function applyAdmissionTransition(owner, record, context) {
  const previousState = record.admissionState;
  const suppressedReads = record.suppressedReads;
  const deferredSinceMs = record.deferredSinceMs;
  const silentFirstAdmission =
    previousState === READINESS_ADMISSION_STATE.UNOBSERVED && !context.deferred;
  const nowMs = context.nowMs;
  // The record is advanced BEFORE the line is handed to the logger, so a sink
  // that throws cannot make the next read emit the same transition again.
  record.admissionSignature = context.signature;
  record.suppressedReads = NO_SUPPRESSED_READS;
  record.admissionState = context.deferred ?
    READINESS_ADMISSION_STATE.DEFERRED :
    READINESS_ADMISSION_STATE.ADMITTED;
  record.deferredSinceMs = context.deferred ?
    (previousState === READINESS_ADMISSION_STATE.DEFERRED ?
      deferredSinceMs : nowMs) :
    null;
  if (silentFirstAdmission) return;
  emitAdmissionTransition(owner, record, {
    previousState,
    state: record.admissionState,
    failedTerms: context.failedTerms,
    completedAtMs: context.completedAtMs,
    nowMs,
    deferredForMs: context.deferred ?
      null :
      resolveAgeMs(nowMs, deferredSinceMs),
    suppressedReads,
  });
}

/**
 * State what this read served and why, then hand the answer straight back.
 *
 * @param {Object|null} record - The variant record from `begin`.
 * @param {Object|null} owner - The planning owner that answered.
 * @param {number} failedTerms - Bit set of the terms the decision failed.
 * @param {number|null} completedAtMs - When the record whose verdict is being
 *   inherited was completed, on the owner's clock.
 * @param {Object|null} served - The snapshot this read is about to return.
 * @param {boolean} deferred - True when `served` is a deferred snapshot.
 * @return {Object|null} That same snapshot, unchanged.
 */
function noteReadinessAdmissionRead(
  record,
  owner,
  nowMs,
  failedTerms,
  completedAtMs,
  served,
  deferred,
) {
  if (!record) return served;
  const signature = admissionSignature(deferred, failedTerms);
  if (record.admissionSignature === signature) {
    record.suppressedReads += 1;
    return served;
  }
  applyAdmissionTransition(owner, record, {
    signature,
    failedTerms,
    completedAtMs,
    deferred,
    nowMs: normalizeNowMs(nowMs),
  });
  return served;
}

function applyPublicationTransition(owner, record, context) {
  const refusalTerms = context.refusalTerms;
  const refused = refusalTerms !== NO_TERMS;
  const previousState = record.publicationState;
  const suppressedRefusals = record.suppressedRefusals;
  const refusedSinceMs = record.refusedSinceMs;
  const silentFirstPublication =
    previousState === READINESS_PUBLICATION_STATE.UNOBSERVED && !refused;
  const nowMs = context.nowMs;
  record.publicationSignature = refusalTerms;
  record.suppressedRefusals = NO_SUPPRESSED_READS;
  record.publicationState = refused ?
    READINESS_PUBLICATION_STATE.REFUSED :
    READINESS_PUBLICATION_STATE.PUBLISHED;
  record.refusedSinceMs = refused ?
    (previousState === READINESS_PUBLICATION_STATE.REFUSED ?
      refusedSinceMs : nowMs) :
    null;
  if (silentFirstPublication) return;
  emitPublicationOutcome(owner, record, {
    previousState,
    state: record.publicationState,
    refusalTerms,
    refusedForMs: refused ? null : resolveAgeMs(nowMs, refusedSinceMs),
    suppressedRefusals,
  });
}

/**
 * State whether a completed build was published and, when it was not, which
 * terms refused it - once per change of the reason, under the same rule the
 * read side uses. Returning to a published build is itself a change and says
 * how many refusals were suppressed and for how long publishes were refused.
 *
 * @param {Object|null} owner - The planning owner that published.
 * @param {string|null} ownerKey - The owner key the build was for.
 * @param {string|null} buildOptionsKey - The build variant.
 * @param {number} refusalTerms - Bit set of the refused terms; 0 published.
 * @return {void}
 */
function noteReadinessPublicationOutcome(
  owner,
  ownerKey,
  buildOptionsKey,
  refusalTerms,
  nowMs,
) {
  // A publish belongs to the variant, not to a reader of it, so it is
  // recorded under the build path's own participation state.
  const record = readVariantRecord(
    owner,
    ownerKey,
    buildOptionsKey,
    READINESS_ADMISSION_PARTICIPATION_UNSTATED,
    true,
  );
  if (!record) return;
  if (record.publicationState !== READINESS_PUBLICATION_STATE.UNOBSERVED &&
      record.publicationSignature === refusalTerms) {
    if (refusalTerms !== NO_TERMS) record.suppressedRefusals += 1;
    return;
  }
  applyPublicationTransition(owner, record, {
    refusalTerms,
    nowMs: normalizeNowMs(nowMs),
  });
}

/**
 * Forget one variant, because the owner just forgot it. This module has no
 * eviction policy of its own; it drops exactly what the owner drops.
 *
 * @param {Object|null} owner - The planning owner.
 * @param {string|null} ownerKey - The owner key.
 * @param {string|null} buildOptionsKey - The discarded build variant.
 * @return {void}
 */
function forgetReadinessAdmissionVariant(owner, ownerKey, buildOptionsKey) {
  const variants = isPlanningOwner(owner) ?
    readOwnerVariants(owner, ownerKey, false) : null;
  if (!variants) return;
  mapDelete(variants, buildOptionsKey);
  if (mapSize(variants) === NO_TERMS) {
    mapDelete(recordsByOwner.get(owner), ownerKey);
  }
}

/**
 * Forget everything this owner was tracking, because the owner stopped.
 *
 * @param {Object|null} owner - The planning owner.
 * @return {void}
 */
function forgetReadinessAdmissionOwner(owner) {
  if (isPlanningOwner(owner)) recordsByOwner.delete(owner);
}

/**
 * How many variants this module is tracking for an owner. The witness for the
 * lifetime claim: it never exceeds what the owner itself tracks.
 *
 * @param {Object|null} owner - The planning owner.
 * @return {number} Tracked variant count.
 */
function readReadinessAdmissionTrackedVariantCount(owner) {
  const byOwnerKey = isPlanningOwner(owner) ? recordsByOwner.get(owner) : null;
  if (!byOwnerKey) return NO_TERMS;
  let total = NO_TERMS;
  mapForEach(byOwnerKey, (variants) => {
    mapForEach(variants, (variant) => {
      total += mapSize(variant.byParticipation);
    });
  });
  return total;
}

export {
  READINESS_ADMISSION_LOG_MSG,
  READINESS_ADMISSION_STATE,
  READINESS_ADMISSION_TERM,
  READINESS_ADMISSION_TERM_BIT,
  READINESS_ADMISSION_TERM_NAMES,
  READINESS_PUBLICATION_REFUSAL_TERM,
  READINESS_PUBLICATION_REFUSAL_TERM_BIT,
  READINESS_PUBLICATION_REFUSAL_TERM_NAMES,
  READINESS_PUBLICATION_STATE,
  beginReadinessAdmissionRead,
  forgetReadinessAdmissionOwner,
  forgetReadinessAdmissionVariant,
  noteReadinessAdmissionRead,
  noteReadinessAdmissionTerms,
  noteReadinessPublicationOutcome,
  readReadinessAdmissionEvaluatedTerms,
  readReadinessAdmissionTrackedVariantCount,
};
