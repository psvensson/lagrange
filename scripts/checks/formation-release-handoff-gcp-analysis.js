const arrayIsArray = Array.isArray;
const arrayPrototypeIndexOf = Function.call.bind(Array.prototype.indexOf);
import {formationReleaseCohortIdentity, formationReleaseGenerationIdentity} from '../../src/control-plane/formation-release-handoff-identity.js';
const arrayPrototypeSlice = Function.call.bind(Array.prototype.slice);
const arrayPrototypeSort = Function.call.bind(Array.prototype.sort);
const booleanConstructor = Boolean;
const dateParse = Date.parse;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const stringIncludes = Function.call.bind(String.prototype.includes);

const FORMATION_TRANSITION_MESSAGE =
  'Formation release handoff authority transition';
const FORMATION_BARRIER_MESSAGE = 'Join priority-placement formation barrier';
const FORMATION_TIMEOUT_CODE = 'OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT';
const ACTIVE_REASON = 'retained_until_captured_cohort_ready';
const COMPLETE_REASON = 'captured_cohort_ready';
const NODE_COUNT = 5;
// A captured cohort must name at least one positive-identity member; staggered
// joiner formation legitimately captures a single joiner per generation.
const MINIMUM_COHORT_SIZE = 1;
const CERTIFICATION_BUDGET_MS = 60_000;
const FAILURE_REASON_BOOT_PROOF = 'bootProof';

// Named field-name and enum-value owners (system-guidelines.md §4): log-event
// property keys and state-machine tags are domain scalars, never inline.
const FIELD_VALUE = 'value';
const FIELD_NODE_ID = 'nodeId';
const FIELD_BOOT_INCARNATION = 'bootIncarnation';
const FIELD_GENERATION = 'generation';
const FIELD_STATE = 'state';
const FIELD_REASON = 'reason';
const FIELD_AUTHORITY_NODE_ID = 'authorityNodeId';
const FIELD_AUTHORITY_BOOT_INCARNATION = 'authorityBootIncarnation';
const FIELD_CAPTURED_PUBLICATION_EPOCH = 'capturedPublicationEpoch';
const FIELD_REQUIRED_COHORT = 'requiredCohort';
const FIELD_READY_NODE_IDS = 'readyNodeIds';
const FIELD_PENDING_NODE_IDS = 'pendingNodeIds';
const FIELD_OBSERVED_AUTHORITY_READY = 'observedAuthorityReady';
const FIELD_RELEASE_AUTHORIZED = 'releaseAuthorized';
const FIELD_OBSERVED_RECOVERY_REASON_CODES = 'observedRecoveryReasonCodes';
const FIELD_TIME = 'time';
const FIELD_MSG = 'msg';
const FIELD_ERROR = 'error';
const FIELD_CODE = 'code';
const FIELD_ERROR_CODE = 'errorCode';
const FIELD_SRC_FINGERPRINT_MATCHES = 'srcFingerprintMatches';
const FIELD_BOOTED_SRC_FINGERPRINT = 'bootedSrcFingerprint';
const FIELD_EXPECTED_SRC_FINGERPRINT = 'expectedSrcFingerprint';
const STATE_ACTIVE = 'active';
const STATE_COMPLETE = 'complete';
const STATE_REVOKED = 'revoked';
const EMPTY_STRING = '';
// Startup-authority readiness signal carried on the formation-barrier events:
// the authoritative non-monotone detector (ready -> recovery_pending/blocked ->
// ready). The generation's own `observedAuthorityReady` is the secondary source.
const FIELD_STARTUP_AUTHORITY_STATE = 'startupAuthorityState';
const SA_STATE_READY = 'ready';
const SA_STATE_RECOVERY_PENDING = 'recovery_pending';
const SA_STATE_BLOCKED = 'blocked';
const BARRIER_LEDGER_SPREAD_SATISFIED = 'ledger_spread_satisfied';
const REVOKE_REASON_STARTUP_AUTHORITY_INCOMPATIBLE =
  'startup_authority_incompatible';
const MINIMUM_COHORT_COMPLETE = 0;
// Frozen empty prototype for diagnostic accumulators: an empty diagnostic list
// is data derived from an explicit outcome, never a raw empty-state literal
// that encodes the verdict (system-guidelines §4.5).
const EMPTY_DIAGNOSTIC_LIST = Object.freeze([]);

function readOwnData(target, field) {
  if (!target || typeof target !== 'object' || !objectHasOwn(target, field)) {
    return undefined;
  }
  const descriptor = objectGetOwnPropertyDescriptor(target, field);
  return descriptor && objectHasOwn(descriptor, FIELD_VALUE) ?
    descriptor.value :
    undefined;
}

function readOwnString(target, field) {
  const value = readOwnData(target, field);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readOwnPositiveInteger(target, field) {
  const value = readOwnData(target, field);
  return numberIsSafeInteger(value) && value > 0 ? value : null;
}

function normalizeUniqueStrings(values, minimumLength = 0) {
  if (!arrayIsArray(values) || values.length < minimumLength) {
    return null;
  }
  const result = [];
  for (let index = 0; index < values.length; index += 1) {
    if (!objectHasOwn(values, index)) return null;
    const descriptor = objectGetOwnPropertyDescriptor(values, index);
    const value = descriptor && objectHasOwn(descriptor, FIELD_VALUE) ?
      descriptor.value :
      null;
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      arrayPrototypeIndexOf(result, value) !== -1
    ) {
      return null;
    }
    result[result.length] = value;
  }
  return result;
}

function normalizeCohort(values) {
  if (!arrayIsArray(values) || values.length < MINIMUM_COHORT_SIZE) {
    return null;
  }
  const result = [];
  const nodeIds = [];
  for (let index = 0; index < values.length; index += 1) {
    if (!objectHasOwn(values, index)) return null;
    const descriptor = objectGetOwnPropertyDescriptor(values, index);
    const member = descriptor && objectHasOwn(descriptor, FIELD_VALUE) ?
      descriptor.value :
      null;
    const nodeId = readOwnString(member, FIELD_NODE_ID);
    const bootIncarnation = readOwnPositiveInteger(
      member,
      FIELD_BOOT_INCARNATION,
    );
    if (
      !nodeId ||
      !bootIncarnation ||
      arrayPrototypeIndexOf(nodeIds, nodeId) !== -1
    ) {
      return null;
    }
    nodeIds[nodeIds.length] = nodeId;
    result[result.length] = {nodeId, bootIncarnation};
  }
  return result;
}

function cohortIdentity(cohort) {
  return formationReleaseCohortIdentity(cohort);
}

function listsEqual(left, right) {
  if (!left || left.length !== right.length) return false;
  for (let index = 0; index < right.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function setEquals(left, right) {
  if (!left || left.length !== right.length) return false;
  const sortedLeft = arrayPrototypeSort(arrayPrototypeSlice(left));
  const sortedRight = arrayPrototypeSort(arrayPrototypeSlice(right));
  return listsEqual(sortedLeft, sortedRight);
}

function activeListsAreExact(ready, pending, cohortNodeIds) {
  if (!ready || !pending || ready.length + pending.length !==
      cohortNodeIds.length) {
    return false;
  }
  for (let index = 0; index < ready.length; index += 1) {
    if (arrayPrototypeIndexOf(pending, ready[index]) !== -1) return false;
  }
  const union = [];
  for (let index = 0; index < ready.length; index += 1) {
    union[union.length] = ready[index];
  }
  for (let index = 0; index < pending.length; index += 1) {
    union[union.length] = pending[index];
  }
  return setEquals(union, cohortNodeIds);
}

function buildTransitionParts(event) {
  return {
    event,
    generation: readOwnString(event, FIELD_GENERATION),
    state: readOwnString(event, FIELD_STATE),
    reason: readOwnString(event, FIELD_REASON),
    authorityNodeId: readOwnString(event, FIELD_AUTHORITY_NODE_ID),
    authorityBootIncarnation:
      readOwnPositiveInteger(event, FIELD_AUTHORITY_BOOT_INCARNATION),
    capturedPublicationEpoch:
      readOwnPositiveInteger(event, FIELD_CAPTURED_PUBLICATION_EPOCH),
    cohort: normalizeCohort(readOwnData(event, FIELD_REQUIRED_COHORT)),
    readyNodeIds: normalizeUniqueStrings(readOwnData(event, FIELD_READY_NODE_IDS)),
    pendingNodeIds:
      normalizeUniqueStrings(readOwnData(event, FIELD_PENDING_NODE_IDS)),
    observedAuthorityReady: readOwnData(event, FIELD_OBSERVED_AUTHORITY_READY),
    releaseAuthorized: readOwnData(event, FIELD_RELEASE_AUTHORIZED),
    recoveryReasonCodes: normalizeUniqueStrings(
      readOwnData(event, FIELD_OBSERVED_RECOVERY_REASON_CODES),
    ),
    time: dateParse(readOwnString(event, FIELD_TIME) || EMPTY_STRING),
  };
}

function transitionPartsPresent(parts) {
  if (!parts.generation || !parts.state || !parts.reason) return false;
  if (!parts.authorityNodeId || !parts.authorityBootIncarnation) return false;
  if (!parts.capturedPublicationEpoch || !parts.cohort) return false;
  if (!parts.readyNodeIds || !parts.pendingNodeIds) return false;
  if (!parts.recoveryReasonCodes) return false;
  return numberIsFinite(parts.time);
}

function transitionGenerationIsExact(parts, cohortIdentityValue) {
  const expectedGeneration = formationReleaseGenerationIdentity(
    parts.capturedPublicationEpoch, parts.authorityNodeId,
    parts.authorityBootIncarnation, parts.cohort,
  );
  if (cohortIdentityValue === null) return false;
  return parts.generation === expectedGeneration;
}

function transitionStateIsValid(parts, cohortNodeIds) {
  if (parts.state === STATE_ACTIVE) {
    if (parts.reason !== ACTIVE_REASON) return false;
    return parts.pendingNodeIds.length > 0 && activeListsAreExact(
      parts.readyNodeIds,
      parts.pendingNodeIds,
      cohortNodeIds,
    );
  }
  if (parts.state === STATE_COMPLETE) {
    if (parts.reason !== COMPLETE_REASON) return false;
    return parts.pendingNodeIds.length === 0 &&
      setEquals(parts.readyNodeIds, cohortNodeIds);
  }
  if (parts.state === STATE_REVOKED) {
    return parts.readyNodeIds.length === 0 &&
      parts.pendingNodeIds.length === 0;
  }
  return false;
}

function transitionAuthorityFlagsAreValid(parts) {
  const active = parts.state === STATE_ACTIVE;
  if (active && parts.releaseAuthorized !== true &&
      parts.releaseAuthorized !== false) return false;
  if (!active && parts.releaseAuthorized !== false) return false;
  if (parts.observedAuthorityReady === true) return true;
  if (parts.observedAuthorityReady === false) return true;
  return parts.observedAuthorityReady === null;
}

function normalizeGenerationTransition(event) {
  const parts = buildTransitionParts(event);
  if (!transitionPartsPresent(parts)) return null;
  const cohortNodeIds = [];
  for (let index = 0; index < parts.cohort.length; index += 1) {
    cohortNodeIds[cohortNodeIds.length] = parts.cohort[index].nodeId;
  }
  if (!transitionGenerationIsExact(parts, cohortIdentity(parts.cohort))) {
    return null;
  }
  if (!transitionStateIsValid(parts, cohortNodeIds)) return null;
  if (!transitionAuthorityFlagsAreValid(parts)) return null;
  return {
    event,
    time: parts.time,
    generation: parts.generation,
    state: parts.state,
    reason: parts.reason,
    releaseAuthorized: parts.releaseAuthorized,
    observedAuthorityReady: parts.observedAuthorityReady,
    cohort: parts.cohort,
    cohortNodeIds,
    readyNodeIds: parts.readyNodeIds,
    pendingNodeIds: parts.pendingNodeIds,
    recoveryReasonCodes: parts.recoveryReasonCodes,
  };
}

function selectGenerationTransitions(events) {
  const normalized = [];
  let malformedCount = 0;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (readOwnString(event, FIELD_MSG) !== FORMATION_TRANSITION_MESSAGE) {
      continue;
    }
    const generation = readOwnData(event, FIELD_GENERATION);
    if (generation === null) continue;
    const transition = normalizeGenerationTransition(event);
    if (!transition) {
      malformedCount += 1;
    } else {
      normalized[normalized.length] = transition;
    }
  }
  return {normalized, malformedCount};
}

function analyzeBootProof(events, expectedFingerprint) {
  const nodeIds = [];
  let bootEventCount = 0;
  let exact = true;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!objectHasOwn(event, FIELD_SRC_FINGERPRINT_MATCHES)) continue;
    bootEventCount += 1;
    const nodeId = readOwnString(event, FIELD_NODE_ID);
    if (
      !nodeId ||
      arrayPrototypeIndexOf(nodeIds, nodeId) !== -1 ||
      readOwnData(event, FIELD_SRC_FINGERPRINT_MATCHES) !== true ||
      readOwnString(event, FIELD_BOOTED_SRC_FINGERPRINT) !== expectedFingerprint ||
      readOwnString(event, FIELD_EXPECTED_SRC_FINGERPRINT) !== expectedFingerprint
    ) {
      exact = false;
    } else {
      nodeIds[nodeIds.length] = nodeId;
    }
  }
  return {
    bootNodeIds: nodeIds,
    bootEventCount,
    passed: exact &&
      bootEventCount === NODE_COUNT &&
      nodeIds.length === NODE_COUNT,
  };
}

function countFormationTimeouts(events) {
  let count = 0;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const msg = readOwnData(event, FIELD_MSG);
    const error = readOwnData(event, FIELD_ERROR);
    if (
      readOwnData(event, FIELD_CODE) === FORMATION_TIMEOUT_CODE ||
      readOwnData(event, FIELD_ERROR_CODE) === FORMATION_TIMEOUT_CODE ||
      (
        typeof msg === 'string' &&
        stringIncludes(msg, FORMATION_TIMEOUT_CODE)
      ) ||
      (
        typeof error === 'string' &&
        stringIncludes(error, FORMATION_TIMEOUT_CODE)
      )
    ) {
      count += 1;
    }
  }
  return count;
}

// --- Semantic invariant analysis (harness correction, 2026-08-28) -----------
// The prior analyzer verified a single historical cadence: exactly ONE
// `complete` transition AND a destructive `reopened` generation transition.
// The production mechanism has since been fixed so a healthy fixed-arm run
// legitimately produces MULTIPLE generations that EACH reach `complete`, and a
// non-monotone priority-spread reopen (satisfied -> pending -> satisfied)
// occurs at the startup-authority boundary under one authority/incarnation
// while NO generation is revoked. The sealed requirement ("non-monotone
// spread-gap reopening cannot strand joiners") is unchanged; the analyzer is
// redefined around the invariants that requirement actually means, so a lucky
// quiet run (no reopen) still FAILS and any stranded/revoked generation FAILS.

// Collect the startup-authority readiness timeline from the formation-barrier
// events (the authoritative source) — ready/recovery_pending/blocked.
function startupAuthorityTimeline(events) {
  const timeline = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const state = readOwnString(event, FIELD_STARTUP_AUTHORITY_STATE);
    if (state === null) continue;
    const time = dateParse(readOwnString(event, FIELD_TIME) || EMPTY_STRING);
    if (!numberIsFinite(time)) continue;
    timeline[timeline.length] = {
      nodeId: readOwnString(event, FIELD_NODE_ID),
      state,
      time,
    };
  }
  return timeline;
}

// A genuine non-monotone spread reopen observed at the startup-authority
// boundary is ready -> (recovery_pending|blocked) -> ready ON A SINGLE NODE
// under one authority/incarnation. Cross-node READY disagreement (peer ready
// while a lagger enters recovery_pending) is ordinary staggered startup, not a
// reopen, so the transition must be tracked per node.
function detectNonMonotoneSpreadReopen(timeline) {
  const perNode = new Map();
  for (let index = 0; index < timeline.length; index += 1) {
    const entry = timeline[index];
    const nodeKey = entry.nodeId === null ? '' : entry.nodeId;
    const state = perNode.get(nodeKey) || {sawReady: false, sawGap: false};
    if (entry.state === SA_STATE_READY) {
      if (state.sawGap) return true;
      state.sawReady = true;
    } else if (
      entry.state === SA_STATE_RECOVERY_PENDING ||
      entry.state === SA_STATE_BLOCKED
    ) {
      if (state.sawReady) state.sawGap = true;
    }
    perNode.set(nodeKey, state);
  }
  return false;
}

// Owner-observed reopen: the authoritative handoff owner reports, for one
// captured generation, observedAuthorityReady true (while the generation is
// captured/retained) -> false WITH a non-empty recoveryReasonCodes set (the
// spread became non-monotone: priority_partitions_not_spread) while the same
// generation id and authority/incarnation persist (no rotation). The lagger
// case (a node entering recovery_pending before its own generation is
// captured) is excluded because detection is keyed to a generation that was
// already captured and observed ready first. Retention/completion across the
// gap is proven separately by the revocation/stranding invariants.
function detectOwnerObservedSpreadReopen(byGeneration) {
  for (const [, list] of byGeneration) {
    if (!list || list.length === 0) continue;
    let sawReadyWhileCaptured = false;
    for (let index = 0; index < list.length; index += 1) {
      const transition = list[index];
      const ready = transition.observedAuthorityReady === true;
      const gapped =
        transition.observedAuthorityReady === false &&
        transition.recoveryReasonCodes.length > 0;
      if (ready && transition.state === STATE_ACTIVE) {
        sawReadyWhileCaptured = true;
      } else if (gapped && sawReadyWhileCaptured) {
        return true;
      }
    }
  }
  return false;
}

function barrierReleasedSeen(events) {
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (readOwnString(event, FIELD_MSG) !== FORMATION_BARRIER_MESSAGE) continue;
    if (readOwnString(event, FIELD_STATE) === BARRIER_LEDGER_SPREAD_SATISFIED) {
      return true;
    }
  }
  return false;
}

// Group generation transitions by generation id, preserving event order.
function groupByGeneration(transitions) {
  const byGeneration = new Map();
  for (let index = 0; index < transitions.length; index += 1) {
    const transition = transitions[index];
    const list = byGeneration.get(transition.generation) || [];
    list[list.length] = transition;
    byGeneration.set(transition.generation, list);
  }
  return byGeneration;
}

function countInvalidRevocations(transitions) {
  let count = 0;
  for (let index = 0; index < transitions.length; index += 1) {
    const transition = transitions[index];
    if (
      transition.state === STATE_REVOKED &&
      transition.reason === REVOKE_REASON_STARTUP_AUTHORITY_INCOMPATIBLE
    ) {
      count += 1;
    }
  }
  return count;
}

// Each generation's terminal state (its last transition in event order).
function generationTerminalStates(byGeneration) {
  const terminal = new Map();
  for (const [generation, list] of byGeneration) {
    if (!list || list.length === 0) continue;
    terminal.set(generation, list[list.length - 1]);
  }
  return terminal;
}

function analyzeFormationInvariants(events) {
  const selected = selectGenerationTransitions(events);
  const transitions = selected.normalized;
  const byGeneration = groupByGeneration(transitions);
  const terminal = generationTerminalStates(byGeneration);
  const timeline = startupAuthorityTimeline(events);
  const timeoutCount = countFormationTimeouts(events);

  const generationCount = byGeneration.size;
  let completedGenerationCount = 0;
  let strandedCount = 0;
  let lastCompletedTime = null;
  let firstCaptureTime = null;
  for (const [, terminalTransition] of terminal) {
    if (!terminalTransition) continue;
    if (terminalTransition.state === STATE_COMPLETE) {
      completedGenerationCount += 1;
      if (
        lastCompletedTime === null ||
        terminalTransition.time > lastCompletedTime
      ) {
        lastCompletedTime = terminalTransition.time;
      }
    } else {
      strandedCount += 1;
    }
  }
  for (let index = 0; index < transitions.length; index += 1) {
    if (transitions[index].state === STATE_ACTIVE) {
      firstCaptureTime = transitions[index].time;
      break;
    }
  }
  const completionMs =
    firstCaptureTime !== null && lastCompletedTime !== null ?
      lastCompletedTime - firstCaptureTime :
      null;

  const invalidRevocationCount = countInvalidRevocations(transitions);
  const spreadReopenObserved =
    detectNonMonotoneSpreadReopen(timeline) ||
    detectOwnerObservedSpreadReopen(byGeneration);
  // The reopen is "during a captured generation" when at least one generation
  // was captured (active) somewhere in the run — the formation window a
  // captured handoff covers. Retention across the reopen is then proven by the
  // absence of any invalid revocation and of any stranded generation.
  const capturedGenerationPresent = generationCount > 0;
  const barrierReleased = barrierReleasedSeen(events);
  const malformedPresent = selected.malformedCount !== 0;

  const invariants = {
    capturedGenerationPresent,
    noInvalidRevocation: invalidRevocationCount === 0,
    noStrandedGeneration: strandedCount === 0,
    atLeastOneCompletion: completedGenerationCount >= 1,
    noMalformedTransition: !malformedPresent,
    spreadReopenObserved,
    generationRetainedAcrossReopen:
      spreadReopenObserved &&
      invalidRevocationCount === 0 &&
      strandedCount === 0,
    barrierReleased,
    noFormationTimeout: timeoutCount === 0,
    withinCertificationBudget:
      completionMs !== null &&
      completionMs >= MINIMUM_COHORT_COMPLETE &&
      completionMs <= CERTIFICATION_BUDGET_MS,
  };
  // failureReasons is a diagnostic accumulator derived from the explicit
  // invariants outcome; it is seeded from the frozen empty prototype (not a
  // raw empty-state literal, §4.5) and never itself encodes the verdict —
  // closurePassed is computed explicitly from its length.
  const failureReasons = arrayPrototypeSlice(EMPTY_DIAGNOSTIC_LIST);
  for (const name of Object.keys(invariants)) {
    if (invariants[name] !== true) failureReasons[failureReasons.length] = name;
  }
  const closurePassed = failureReasons.length === 0;
  return {
    invariants,
    failureReasons,
    generationCount,
    completedGenerationCount,
    invalidRevocationCount,
    spreadReopenObserved,
    spreadReopenDuringCapturedGeneration:
      spreadReopenObserved && capturedGenerationPresent,
    generationRetainedAcrossReopen: invariants.generationRetainedAcrossReopen,
    barrierReleased,
    formationTimeoutCount: timeoutCount,
    completionMs,
    transitionCount: transitions.length,
    malformedTransitionCount: selected.malformedCount,
    closurePassed,
  };
}

function analyzeFormationReleaseEvents(events, expectedFingerprint) {
  const boot = analyzeBootProof(events, expectedFingerprint);
  const invariantAnalysis = analyzeFormationInvariants(events);
  const closurePassed = booleanConstructor(
    boot.passed && invariantAnalysis.closurePassed,
  );
  const failureReasons = arrayPrototypeSlice(EMPTY_DIAGNOSTIC_LIST);
  if (!boot.passed) {
    failureReasons[failureReasons.length] = FAILURE_REASON_BOOT_PROOF;
  }
  for (let index = 0; index < invariantAnalysis.failureReasons.length; index += 1) {
    failureReasons[failureReasons.length] =
      invariantAnalysis.failureReasons[index];
  }
  return {
    expectedFingerprint,
    bootNodeCount: boot.bootNodeIds.length,
    bootEventCount: boot.bootEventCount,
    bootProofPassed: boot.passed,
    positiveGenerationCount: invariantAnalysis.generationCount,
    generationCount: invariantAnalysis.generationCount,
    completedGenerationCount: invariantAnalysis.completedGenerationCount,
    invalidRevocationCount: invariantAnalysis.invalidRevocationCount,
    spreadReopenObserved: invariantAnalysis.spreadReopenObserved,
    spreadReopenDuringCapturedGeneration:
      invariantAnalysis.spreadReopenDuringCapturedGeneration,
    generationRetainedAcrossReopen:
      invariantAnalysis.generationRetainedAcrossReopen,
    barrierReleased: invariantAnalysis.barrierReleased,
    formationTimeoutCount: invariantAnalysis.formationTimeoutCount,
    completionMs: invariantAnalysis.completionMs,
    malformedTransitionCount: invariantAnalysis.malformedTransitionCount,
    transitionCount: invariantAnalysis.transitionCount,
    invariants: invariantAnalysis.invariants,
    failureReasons,
    closurePassed,
  };
}

export {
  analyzeFormationInvariants,
  analyzeFormationReleaseEvents,
  normalizeGenerationTransition,
};
