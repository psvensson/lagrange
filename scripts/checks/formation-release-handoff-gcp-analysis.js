const arrayIsArray = Array.isArray;
const arrayPrototypeIndexOf = Function.call.bind(Array.prototype.indexOf);
import {formationReleaseCohortIdentity, formationReleaseGenerationIdentity} from '../../src/control-plane/formation-release-handoff-identity.js';
import {FORMATION_RELEASE_HANDOFF_MINIMUM_COHORT_SIZE} from '../../src/control-plane/formation-release-handoff-policy.js';
import {
  FORMATION_RELEASE_HANDOFF_REASON,
  FORMATION_RELEASE_HANDOFF_STATE,
} from '../../src/control-plane/formation-release-handoff-contract.js';
import {formationReleaseObservedNodeBootMatchesExpected} from
  '../../src/control-plane/formation-release-handoff-state-grammar.js';
const arrayPrototypeSlice = Function.call.bind(Array.prototype.slice);
const arrayPrototypeSort = Function.call.bind(Array.prototype.sort);
const booleanConstructor = Boolean;
const DateConstructor = Date;
const dateParse = Date.parse;
const dateToISOString = Function.call.bind(Date.prototype.toISOString);
const jsonParse = JSON.parse;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const stringIncludes = Function.call.bind(String.prototype.includes);

const FIELD = Object.freeze({
  AUTHORITY_BOOT_INCARNATION: 'authorityBootIncarnation',
  AUTHORITY_NODE_ID: 'authorityNodeId',
  BOOTED_SOURCE_FINGERPRINT: 'bootedSrcFingerprint',
  CAPTURED_CANONICAL_NODE_IDS: 'capturedCanonicalNodeIds',
  CAPTURED_PUBLICATION_EPOCH: 'capturedPublicationEpoch',
  CODE: 'code',
  CURRENT_PRIMARY_BOOT_INCARNATION: 'currentPrimaryBootIncarnation',
  CURRENT_PRIMARY_PRESENT: 'currentPrimaryPresent',
  ERROR_CODE: 'errorCode',
  EXPECTED_BOOT_INCARNATION: 'expectedBootIncarnation',
  EXPECTED_SOURCE_FINGERPRINT: 'expectedSrcFingerprint',
  FORMATION_GENERATION: 'formationReleaseHandoffGeneration',
  FORMATION_RELEASE_AUTHORIZED: 'formationReleaseHandoffReleaseAuthorized',
  FORMATION_STATE: 'formationReleaseHandoffState',
  GENERATION: 'generation',
  MESSAGE: 'message',
  MSG: 'msg',
  NODE_BOOT_INCARNATION: 'nodeBootIncarnation',
  NODE_ID: 'nodeId',
  NODE_ID_SNAKE: 'node_id',
  NODE_PRESENT: 'nodePresent',
  OBSERVED_AUTHORITY_READY: 'observedAuthorityReady',
  OBSERVED_PUBLICATION_EPOCH: 'observedPublicationEpoch',
  OBSERVED_RECOVERY_REASON_CODES: 'observedRecoveryReasonCodes',
  OBSERVED_STARTUP_AUTHORITY_FENCE_IDENTITY:
    'observedStartupAuthorityFenceIdentity',
  OBSERVED_STARTUP_AUTHORITY_PUBLICATION_EPOCH:
    'observedStartupAuthorityPublicationEpoch',
  OBSERVED_STARTUP_AUTHORITY_READY: 'observedStartupAuthorityReady',
  OBSERVED_STARTUP_AUTHORITY_REASON_CODES:
    'observedStartupAuthorityReasonCodes',
  OBSERVED_STARTUP_AUTHORITY_STATE: 'observedStartupAuthorityState',
  OBSERVED_STARTUP_PRIORITY_SPREAD_SATISFIED:
    'observedStartupPrioritySpreadSatisfied',
  PENDING_NODE_IDS: 'pendingNodeIds',
  PENDING_TERMINAL_REASON: 'pendingTerminalReason',
  PENDING_TERMINAL_STATE: 'pendingTerminalState',
  READY_NODE_IDS: 'readyNodeIds',
  REASON: 'reason',
  RELEASE_AUTHORIZED: 'releaseAuthorized',
  REQUIRED_COHORT: 'requiredCohort',
  FENCE_IDENTITY: 'fenceIdentity',
  SOURCE_FINGERPRINT_MATCHES: 'srcFingerprintMatches',
  STATE: 'state',
  TIME: 'time',
  VALUE: 'value',
});
const ACTIVE_NODE_STATUS = 'active';
const JOINING_NODE_STATUS = 'joining';
const CONNECTED_NODE_STATE = 'connected';
const READY_NODE_STATE = 'ready';

const FORMATION_TRANSITION_MESSAGE =
  'Formation release handoff authority transition';
const FORMATION_BARRIER_MESSAGE = 'Join priority-placement formation barrier';
const FORMATION_TIMEOUT_CODE = 'OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT';
const SPREAD_REOPEN_REASON = 'priority_partitions_not_spread';
const PROJECTION_SYNCHRONIZATION_REASON = 'publication_epoch_pending';
const STARTUP_AUTHORITY_READY_STATE = 'ready';
const STARTUP_AUTHORITY_RECOVERY_PENDING_STATE = 'recovery_pending';
const STARTUP_AUTHORITY_OBSERVATION = Object.freeze({
  READY: 'ready',
  SPREAD_REOPEN: 'spread_reopen',
  PROJECTION_SYNCHRONIZATION: 'projection_synchronization',
});
const ACTIVE_REASON = FORMATION_RELEASE_HANDOFF_REASON.RETAINED_UNTIL_READY;
const TERMINAL_PENDING_STATE =
  FORMATION_RELEASE_HANDOFF_STATE.TERMINAL_PENDING;
const TERMINAL_PENDING_REASON =
  FORMATION_RELEASE_HANDOFF_REASON.TERMINAL_DURABILITY_PENDING;
const COMPLETE_REASON = FORMATION_RELEASE_HANDOFF_REASON.CAPTURED_COHORT_READY;
const IDLE_REASON = FORMATION_RELEASE_HANDOFF_REASON.NO_SATISFIED_COHORT;
const REVOKED_REASONS = Object.freeze([
  FORMATION_RELEASE_HANDOFF_REASON.AUTHORITY_INCOMPATIBLE,
  FORMATION_RELEASE_HANDOFF_REASON.COHORT_MEMBER_MISSING,
  FORMATION_RELEASE_HANDOFF_REASON.COHORT_INCARNATION_CHANGED,
  FORMATION_RELEASE_HANDOFF_REASON.COHORT_MEMBER_INELIGIBLE,
]);
const NODE_COUNT = 5;
const CERTIFICATION_BUDGET_MS = 60_000;
const REVERT_COUNTEREXAMPLE = Object.freeze({
  TRANSIENT_PROJECTION_OMISSION_REVOCATION:
    'transient_projection_omission_revocation',
  FORMATION_TIMEOUT_WITHOUT_GENERATION:
    'formation_timeout_without_generation',
});
const EVENT_FIELDS = Object.freeze([
  FIELD.AUTHORITY_BOOT_INCARNATION,
  FIELD.AUTHORITY_NODE_ID,
  FIELD.BOOTED_SOURCE_FINGERPRINT,
  'capturedCanonicalNodeIds',
  FIELD.CAPTURED_PUBLICATION_EPOCH,
  FIELD.CODE,
  'error',
  FIELD.ERROR_CODE,
  FIELD.EXPECTED_SOURCE_FINGERPRINT,
  'formationReleaseHandoffGeneration',
  FIELD.FORMATION_RELEASE_AUTHORIZED,
  FIELD.FORMATION_STATE,
  FIELD.GENERATION,
  'observedCanonicalNodeIds',
  FIELD.OBSERVED_AUTHORITY_READY,
  FIELD.OBSERVED_PUBLICATION_EPOCH,
  FIELD.OBSERVED_RECOVERY_REASON_CODES,
  FIELD.OBSERVED_STARTUP_AUTHORITY_FENCE_IDENTITY,
  FIELD.OBSERVED_STARTUP_AUTHORITY_PUBLICATION_EPOCH,
  FIELD.OBSERVED_STARTUP_AUTHORITY_READY,
  FIELD.OBSERVED_STARTUP_AUTHORITY_REASON_CODES,
  FIELD.OBSERVED_STARTUP_AUTHORITY_STATE,
  FIELD.OBSERVED_STARTUP_PRIORITY_SPREAD_SATISFIED,
  FIELD.PENDING_NODE_IDS,
  FIELD.PENDING_TERMINAL_REASON,
  FIELD.PENDING_TERMINAL_STATE,
  'physicalCohortEvidence',
  FIELD.READY_NODE_IDS,
  FIELD.REASON,
  FIELD.RELEASE_AUTHORIZED,
  FIELD.REQUIRED_COHORT,
  FIELD.FENCE_IDENTITY,
  FIELD.SOURCE_FINGERPRINT_MATCHES,
  FIELD.STATE,
]);

function readOwnData(target, field) {
  if (!target || typeof target !== 'object' || !objectHasOwn(target, field)) {
    return undefined;
  }
  const descriptor = objectGetOwnPropertyDescriptor(target, field);
  return descriptor && objectHasOwn(descriptor, FIELD.VALUE) ?
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

function parseLogMetadata(entry) {
  const rawMetadata = readOwnData(entry, 'metadata');
  if (rawMetadata && typeof rawMetadata === 'object') return rawMetadata;
  if (typeof rawMetadata !== 'string') return null;
  try {
    const parsed = jsonParse(rawMetadata);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function copyKnownEventFields(metadata) {
  const event = {};
  for (let index = 0; index < EVENT_FIELDS.length; index += 1) {
    const field = EVENT_FIELDS[index];
    const value = readOwnData(metadata, field);
    if (value !== undefined) event[field] = value;
  }
  return event;
}

function logEntryTime(entry) {
  const rawTimestamp = readOwnData(entry, 'timestamp');
  const parsedTimestamp = typeof rawTimestamp === 'number' ?
    rawTimestamp : dateParse(rawTimestamp || '');
  return numberIsFinite(parsedTimestamp) ?
    dateToISOString(new DateConstructor(parsedTimestamp)) : null;
}

function projectLogEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const metadata = parseLogMetadata(entry);
  const event = copyKnownEventFields(metadata);
  event.time = logEntryTime(entry);
  event.nodeId = readOwnData(entry, FIELD.NODE_ID_SNAKE) ||
    readOwnData(entry, FIELD.NODE_ID) || readOwnData(metadata, FIELD.NODE_ID) || null;
  event.msg = readOwnData(entry, FIELD.MESSAGE) ||
    readOwnData(entry, FIELD.MSG) || readOwnData(metadata, FIELD.MSG) || null;
  return event;
}

function projectLiveLogEntriesToEvents(entries) {
  if (!arrayIsArray(entries)) return [];
  const events = [];
  for (let index = 0; index < entries.length; index += 1) {
    const event = projectLogEntry(readOwnData(entries, index));
    if (event) events[events.length] = event;
  }
  return events;
}

function allTrue(values) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== true) return false;
  }
  return true;
}

function normalizeUniqueStrings(values, minimumLength = 0) {
  if (!arrayIsArray(values) || values.length < minimumLength) {
    return null;
  }
  const result = [];
  for (let index = 0; index < values.length; index += 1) {
    if (!objectHasOwn(values, index)) return null;
    const descriptor = objectGetOwnPropertyDescriptor(values, index);
    const value = descriptor && objectHasOwn(descriptor, FIELD.VALUE) ?
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
  if (!arrayIsArray(values) || values.length < 1) {
    return null;
  }
  const result = [];
  const nodeIds = [];
  for (let index = 0; index < values.length; index += 1) {
    if (!objectHasOwn(values, index)) return null;
    const descriptor = objectGetOwnPropertyDescriptor(values, index);
    const member = descriptor && objectHasOwn(descriptor, FIELD.VALUE) ?
      descriptor.value :
      null;
    const nodeId = readOwnString(member, FIELD.NODE_ID);
    const bootIncarnation = readOwnPositiveInteger(
      member,
      'bootIncarnation',
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
    generation: readOwnString(event, FIELD.GENERATION),
    state: readOwnString(event, FIELD.STATE),
    reason: readOwnString(event, FIELD.REASON),
    authorityNodeId: readOwnString(event, FIELD.AUTHORITY_NODE_ID),
    authorityBootIncarnation:
      readOwnPositiveInteger(event, FIELD.AUTHORITY_BOOT_INCARNATION),
    capturedPublicationEpoch:
      readOwnPositiveInteger(event, FIELD.CAPTURED_PUBLICATION_EPOCH),
    observedPublicationEpoch:
      readOwnPositiveInteger(event, FIELD.OBSERVED_PUBLICATION_EPOCH),
    cohort: normalizeCohort(readOwnData(event, FIELD.REQUIRED_COHORT)),
    readyNodeIds: normalizeUniqueStrings(readOwnData(event, FIELD.READY_NODE_IDS)),
    pendingNodeIds:
      normalizeUniqueStrings(readOwnData(event, FIELD.PENDING_NODE_IDS)),
    observedAuthorityReady: readOwnData(event, FIELD.OBSERVED_AUTHORITY_READY),
    releaseAuthorized: readOwnData(event, FIELD.RELEASE_AUTHORIZED),
    recoveryReasonCodes: normalizeUniqueStrings(
      readOwnData(event, FIELD.OBSERVED_RECOVERY_REASON_CODES),
    ),
    fenceIdentity: readOwnString(event, FIELD.FENCE_IDENTITY),
    startupAuthorityState:
      readOwnString(event, FIELD.OBSERVED_STARTUP_AUTHORITY_STATE),
    startupAuthorityReady:
      readOwnData(event, FIELD.OBSERVED_STARTUP_AUTHORITY_READY),
    startupPrioritySpreadSatisfied: readOwnData(
      event,
      FIELD.OBSERVED_STARTUP_PRIORITY_SPREAD_SATISFIED,
    ),
    startupAuthorityReasonCodes: normalizeUniqueStrings(
      readOwnData(event, FIELD.OBSERVED_STARTUP_AUTHORITY_REASON_CODES),
    ),
    startupAuthorityPublicationEpoch: readOwnPositiveInteger(
      event,
      FIELD.OBSERVED_STARTUP_AUTHORITY_PUBLICATION_EPOCH,
    ),
    startupAuthorityFenceIdentity: readOwnString(
      event,
      FIELD.OBSERVED_STARTUP_AUTHORITY_FENCE_IDENTITY,
    ),
    pendingTerminalState: readOwnString(event, FIELD.PENDING_TERMINAL_STATE),
    pendingTerminalReason: readOwnString(event, FIELD.PENDING_TERMINAL_REASON),
    time: dateParse(readOwnString(event, FIELD.TIME) || ''),
  };
}

function exactSingleReason(values, reason) {
  return values !== null && values.length === 1 && values[0] === reason;
}

function exactProjectionSynchronizationReasons(values, spreadSatisfied) {
  if (spreadSatisfied === true) {
    return exactSingleReason(values, PROJECTION_SYNCHRONIZATION_REASON);
  }
  return spreadSatisfied === false && values !== null &&
    values.length === 2 &&
    values[0] === PROJECTION_SYNCHRONIZATION_REASON &&
    values[1] === SPREAD_REOPEN_REASON;
}

function classifyStartupAuthorityObservation(parts) {
  if (
    parts.startupAuthorityPublicationEpoch === null ||
    parts.startupAuthorityPublicationEpoch < parts.capturedPublicationEpoch ||
    parts.fenceIdentity === null ||
    parts.startupAuthorityFenceIdentity !== parts.fenceIdentity ||
    parts.startupAuthorityReasonCodes === null
  ) return null;
  if (
    parts.startupAuthorityState === STARTUP_AUTHORITY_READY_STATE &&
    parts.startupAuthorityReady === true &&
    parts.startupPrioritySpreadSatisfied === true &&
    parts.startupAuthorityReasonCodes.length === 0
  ) return STARTUP_AUTHORITY_OBSERVATION.READY;
  if (
    parts.startupAuthorityState ===
      STARTUP_AUTHORITY_RECOVERY_PENDING_STATE &&
    parts.startupAuthorityReady === false &&
    parts.startupPrioritySpreadSatisfied === false &&
    exactSingleReason(parts.startupAuthorityReasonCodes, SPREAD_REOPEN_REASON)
  ) return STARTUP_AUTHORITY_OBSERVATION.SPREAD_REOPEN;
  if (
    parts.startupAuthorityState ===
      STARTUP_AUTHORITY_RECOVERY_PENDING_STATE &&
    parts.startupAuthorityReady === false &&
    exactProjectionSynchronizationReasons(
      parts.startupAuthorityReasonCodes,
      parts.startupPrioritySpreadSatisfied,
    )
  ) return STARTUP_AUTHORITY_OBSERVATION.PROJECTION_SYNCHRONIZATION;
  return null;
}

function transitionPartsPresent(parts) {
  return allTrue([
    parts.generation !== null,
    parts.state !== null,
    parts.reason !== null,
    parts.authorityNodeId !== null,
    parts.authorityBootIncarnation !== null,
    parts.capturedPublicationEpoch !== null,
    parts.observedPublicationEpoch !== null,
    parts.observedPublicationEpoch >= parts.capturedPublicationEpoch,
    parts.cohort !== null,
    parts.readyNodeIds !== null,
    parts.pendingNodeIds !== null,
    parts.recoveryReasonCodes !== null,
    numberIsFinite(parts.time),
  ]);
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
  if (parts.state === FORMATION_RELEASE_HANDOFF_STATE.ACTIVE) {
    if (parts.reason !== ACTIVE_REASON) return false;
    if (parts.pendingTerminalState || parts.pendingTerminalReason) return false;
    return activeListsAreExact(
      parts.readyNodeIds,
      parts.pendingNodeIds,
      cohortNodeIds,
    );
  }
  if (parts.state === TERMINAL_PENDING_STATE) {
    if (parts.reason !== TERMINAL_PENDING_REASON) return false;
    if (parts.pendingTerminalState === FORMATION_RELEASE_HANDOFF_STATE.COMPLETE) {
      return parts.pendingTerminalReason === COMPLETE_REASON &&
        parts.pendingNodeIds.length === 0 &&
        setEquals(parts.readyNodeIds, cohortNodeIds);
    }
    if (parts.pendingTerminalState === FORMATION_RELEASE_HANDOFF_STATE.REVOKED) {
      return arrayPrototypeIndexOf(
        REVOKED_REASONS,
        parts.pendingTerminalReason,
      ) !== -1 && parts.readyNodeIds.length === 0 &&
        parts.pendingNodeIds.length === 0;
    }
    return false;
  }
  if (parts.state === FORMATION_RELEASE_HANDOFF_STATE.COMPLETE) {
    if (parts.pendingTerminalState || parts.pendingTerminalReason) return false;
    if (parts.reason !== COMPLETE_REASON) return false;
    return parts.pendingNodeIds.length === 0 &&
      setEquals(parts.readyNodeIds, cohortNodeIds);
  }
  if (parts.state === FORMATION_RELEASE_HANDOFF_STATE.REVOKED) {
    if (parts.pendingTerminalState || parts.pendingTerminalReason) return false;
    return arrayPrototypeIndexOf(REVOKED_REASONS, parts.reason) !== -1 &&
      parts.readyNodeIds.length === 0 &&
      parts.pendingNodeIds.length === 0;
  }
  return false;
}

function transitionAuthorityFlagsAreValid(parts) {
  const active = parts.state === FORMATION_RELEASE_HANDOFF_STATE.ACTIVE;
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
  const startupAuthorityObservation =
    parts.state === FORMATION_RELEASE_HANDOFF_STATE.ACTIVE ?
      classifyStartupAuthorityObservation(parts) : null;
  if (
    parts.state === FORMATION_RELEASE_HANDOFF_STATE.ACTIVE &&
    startupAuthorityObservation === null
  ) return null;
  if (
    parts.state === FORMATION_RELEASE_HANDOFF_STATE.ACTIVE &&
    !physicalEvidenceIsExact(event, {cohort: parts.cohort})
  ) return null;
  return {
    event,
    time: parts.time,
    generation: parts.generation,
    state: parts.state,
    reason: parts.reason,
    releaseAuthorized: parts.releaseAuthorized,
    observedAuthorityReady: parts.observedAuthorityReady,
    capturedPublicationEpoch: parts.capturedPublicationEpoch,
    observedPublicationEpoch: parts.observedPublicationEpoch,
    cohort: parts.cohort,
    cohortNodeIds,
    readyNodeIds: parts.readyNodeIds,
    pendingNodeIds: parts.pendingNodeIds,
    recoveryReasonCodes: parts.recoveryReasonCodes,
    pendingTerminalState: parts.pendingTerminalState,
    pendingTerminalReason: parts.pendingTerminalReason,
    startupAuthorityObservation,
  };
}

function nullGenerationTransitionIsNonAuthorizing(event) {
  return allTrue([
    readOwnData(event, FIELD.GENERATION) === null,
    readOwnData(event, FIELD.STATE) === FORMATION_RELEASE_HANDOFF_STATE.IDLE,
    readOwnData(event, FIELD.REASON) === IDLE_REASON,
    readOwnData(event, FIELD.RELEASE_AUTHORIZED) === false,
    readOwnData(event, FIELD.AUTHORITY_BOOT_INCARNATION) === null,
    readOwnData(event, FIELD.CAPTURED_PUBLICATION_EPOCH) === null,
    readOwnData(event, FIELD.OBSERVED_PUBLICATION_EPOCH) === null,
    readOwnData(event, FIELD.OBSERVED_AUTHORITY_READY) === null,
    readOwnData(event, FIELD.PENDING_TERMINAL_STATE) === null,
    readOwnData(event, FIELD.PENDING_TERMINAL_REASON) === null,
    listsEqual(normalizeUniqueStrings(readOwnData(event, FIELD.READY_NODE_IDS)), []),
    listsEqual(
      normalizeUniqueStrings(readOwnData(event, FIELD.PENDING_NODE_IDS)),
      [],
    ),
    normalizeCohort(readOwnData(event, FIELD.REQUIRED_COHORT)) === null,
    arrayIsArray(readOwnData(event, FIELD.REQUIRED_COHORT)),
    readOwnData(event, FIELD.REQUIRED_COHORT).length === 0,
    listsEqual(normalizeUniqueStrings(
      readOwnData(event, FIELD.OBSERVED_RECOVERY_REASON_CODES),
    ), []),
  ]);
}

function selectGenerationTransitions(events) {
  const normalized = [];
  let malformedCount = 0;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (readOwnString(event, FIELD.MSG) !== FORMATION_TRANSITION_MESSAGE) {
      continue;
    }
    const generation = readOwnData(event, FIELD.GENERATION);
    if (generation === null && nullGenerationTransitionIsNonAuthorizing(
      event,
    )) continue;
    const transition = normalizeGenerationTransition(event);
    if (!transition) {
      malformedCount += 1;
    } else {
      normalized[normalized.length] = transition;
    }
  }
  return {normalized, malformedCount};
}

function sameCohortEverywhere(transitions, expectedNodeIds) {
  for (let index = 0; index < transitions.length; index += 1) {
    if (!listsEqual(transitions[index].cohortNodeIds, expectedNodeIds)) {
      return false;
    }
  }
  return true;
}

function firstTransition(transitions, predicate) {
  for (let index = 0; index < transitions.length; index += 1) {
    if (predicate(transitions[index])) return transitions[index];
  }
  return null;
}

function isCapturedTransition(transition) {
  return transition.state === FORMATION_RELEASE_HANDOFF_STATE.ACTIVE &&
    transition.releaseAuthorized === true;
}

function isPendingDurableCapture(transition) {
  return transition.state === FORMATION_RELEASE_HANDOFF_STATE.ACTIVE &&
    transition.releaseAuthorized === false &&
    transition.observedAuthorityReady === true;
}

function isReopenedTransition(transition) {
  if (transition.state !== FORMATION_RELEASE_HANDOFF_STATE.ACTIVE) return false;
  if (transition.releaseAuthorized !== true) return false;
  if (transition.observedAuthorityReady !== false) return false;
  if (
    transition.startupAuthorityObservation !==
      STARTUP_AUTHORITY_OBSERVATION.SPREAD_REOPEN
  ) return false;
  return transition.recoveryReasonCodes.length === 1 &&
    transition.recoveryReasonCodes[0] === SPREAD_REOPEN_REASON;
}

function isProjectionSynchronizationTransition(transition) {
  return transition.state === FORMATION_RELEASE_HANDOFF_STATE.ACTIVE &&
    transition.releaseAuthorized === true &&
    transition.startupAuthorityObservation ===
      STARTUP_AUTHORITY_OBSERVATION.PROJECTION_SYNCHRONIZATION;
}

function isCompletedTransition(transition) {
  return transition.state === FORMATION_RELEASE_HANDOFF_STATE.COMPLETE;
}

function isRevokedTransition(transition) {
  return transition.state === FORMATION_RELEASE_HANDOFF_STATE.REVOKED;
}

function isTerminalPendingTransition(transition) {
  return transition.state === TERMINAL_PENDING_STATE;
}

function transitionTimesAreMonotonic(transitions) {
  for (let index = 1; index < transitions.length; index += 1) {
    if (transitions[index].time < transitions[index - 1].time) return false;
  }
  return true;
}

function countTransitionState(transitions, state) {
  let count = 0;
  for (let index = 0; index < transitions.length; index += 1) {
    if (transitions[index].state === state) count += 1;
  }
  return count;
}

function releaseNeverRegresses(transitions) {
  let authorized = false;
  for (let index = 0; index < transitions.length; index += 1) {
    const transition = transitions[index];
    if (transition.state !== FORMATION_RELEASE_HANDOFF_STATE.ACTIVE) continue;
    if (transition.releaseAuthorized === true) {
      authorized = true;
      continue;
    }
    if (authorized) return false;
  }
  return true;
}

function groupTransitionsByGeneration(transitions) {
  const groups = [];
  for (let index = 0; index < transitions.length; index += 1) {
    const transition = transitions[index];
    let group = null;
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      if (groups[groupIndex].generation === transition.generation) {
        group = groups[groupIndex];
        break;
      }
    }
    if (!group) {
      group = {generation: transition.generation, transitions: []};
      groups[groups.length] = group;
    }
    group.transitions[group.transitions.length] = transition;
  }
  return groups;
}

function terminalTransition(transitions) {
  const completed = firstTransition(transitions, isCompletedTransition);
  const revoked = firstTransition(transitions, isRevokedTransition);
  return completed || revoked;
}

function terminalGrammarIsValid(transitions, completed, revoked) {
  const completeCount = countTransitionState(transitions, FORMATION_RELEASE_HANDOFF_STATE.COMPLETE);
  const revokedCount = countTransitionState(transitions, FORMATION_RELEASE_HANDOFF_STATE.REVOKED);
  if (completeCount + revokedCount !== 1) return false;
  const terminal = completed || revoked;
  if (terminal === null || transitions[transitions.length - 1] !== terminal) {
    return false;
  }
  const pendingCount = countTransitionState(
    transitions,
    TERMINAL_PENDING_STATE,
  );
  if (pendingCount > 1) return false;
  if (pendingCount === 0) return completed === null;
  const pending = firstTransition(transitions, isTerminalPendingTransition);
  return transitions[transitions.length - 2] === pending &&
    pending.pendingTerminalState === terminal.state &&
    pending.pendingTerminalReason === terminal.reason;
}

function completionHasRequiredCapture(completed, captured) {
  return completed === null || captured !== null;
}

function completionTimingIsValid(completionMs) {
  return completionMs !== null && completionMs >= 0;
}

function generationSequenceIsValid(group) {
  const transitions = group.transitions;
  const initiated = transitions[0] || null;
  const captured = firstTransition(transitions, isCapturedTransition);
  const reopened = firstTransition(transitions, isReopenedTransition);
  const projectionSynchronization = firstTransition(
    transitions,
    isProjectionSynchronizationTransition,
  );
  const completed = firstTransition(transitions, isCompletedTransition);
  const revoked = firstTransition(transitions, isRevokedTransition);
  const terminalPending = firstTransition(
    transitions,
    isTerminalPendingTransition,
  );
  const cohortNodeIds = initiated?.cohortNodeIds || [];
  const terminal = terminalTransition(transitions);
  const completionMs = initiated && terminal ?
    terminal.time - initiated.time : null;
  const baseValid = allTrue([
    transitions.length >= 2,
    transitionTimesAreMonotonic(transitions),
    isPendingDurableCapture(initiated),
    sameCohortEverywhere(transitions, cohortNodeIds),
    releaseNeverRegresses(transitions),
    terminalGrammarIsValid(transitions, completed, revoked),
    completionHasRequiredCapture(completed, captured),
    completionTimingIsValid(completionMs),
  ]);
  return {
    generation: group.generation,
    transitions,
    initiated,
    captured,
    reopened,
    projectionSynchronization,
    completed,
    revoked,
    terminalPending,
    terminal,
    cohort: initiated?.cohort || [],
    cohortNodeIds,
    completionMs,
    valid: baseValid,
  };
}

function generationWindowsDoNotOverlap(generations) {
  const ordered = arrayPrototypeSort(arrayPrototypeSlice(generations),
    (left, right) => left.initiated.time - right.initiated.time);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].initiated.time < ordered[index - 1].terminal.time) {
      return false;
    }
  }
  return true;
}

function analyzeTransitionCadence(events) {
  const selected = selectGenerationTransitions(events);
  const grouped = groupTransitionsByGeneration(selected.normalized);
  const generations = [];
  let transitionCount = 0;
  let valid = selected.malformedCount === 0 && grouped.length > 0;
  for (let index = 0; index < grouped.length; index += 1) {
    const analyzed = generationSequenceIsValid(grouped[index]);
    generations[generations.length] = analyzed;
    transitionCount += analyzed.transitions.length;
    if (!analyzed.valid) valid = false;
  }
  if (valid && !generationWindowsDoNotOverlap(generations)) valid = false;
  return {
    generations,
    malformedTransitionCount: selected.malformedCount,
    transitionCount,
    valid,
  };
}

function barrierConsumerIsValid(event, cadence, nodeIds, time, nodeId) {
  if (!nodeId || !numberIsFinite(time)) return false;
  if (!cadence.captured) return false;
  if (readOwnData(event, FIELD.FORMATION_STATE) !== FORMATION_RELEASE_HANDOFF_STATE.ACTIVE) {
    return false;
  }
  if (readOwnData(
    event,
    FIELD.FORMATION_RELEASE_AUTHORIZED,
  ) !== true) return false;
  if (
    time < cadence.captured.time ||
    (cadence.terminal !== null && time > cadence.terminal.time)
  ) {
    return false;
  }
  if (arrayPrototypeIndexOf(cadence.captured.cohortNodeIds, nodeId) === -1) {
    return false;
  }
  return arrayPrototypeIndexOf(nodeIds, nodeId) === -1;
}

function analyzeBootProof(events, expectedFingerprint) {
  const nodeIds = [];
  let bootEventCount = 0;
  let exact = true;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!objectHasOwn(event, FIELD.SOURCE_FINGERPRINT_MATCHES)) continue;
    bootEventCount += 1;
    const nodeId = readOwnString(event, FIELD.NODE_ID);
    if (
      !nodeId ||
      arrayPrototypeIndexOf(nodeIds, nodeId) !== -1 ||
      readOwnData(event, FIELD.SOURCE_FINGERPRINT_MATCHES) !== true ||
      readOwnString(event, FIELD.BOOTED_SOURCE_FINGERPRINT) !== expectedFingerprint ||
      readOwnString(event, FIELD.EXPECTED_SOURCE_FINGERPRINT) !== expectedFingerprint
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

function analyzeBarrierConsumers(events, generations) {
  const results = [];
  for (let index = 0; index < generations.length; index += 1) {
    results[results.length] = {
      generation: generations[index].generation,
      nodeIds: [],
      malformedOrEarlyCount: 0,
    };
  }
  let globalProblemCount = 0;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (readOwnString(event, FIELD.MSG) !== FORMATION_BARRIER_MESSAGE) continue;
    const generationId = readOwnData(
      event,
      'formationReleaseHandoffGeneration',
    );
    if (
      generationId === null ||
      generationId === undefined
    ) {
      if (readOwnData(
        event,
        FIELD.FORMATION_RELEASE_AUTHORIZED,
      ) === true) {
        globalProblemCount += 1;
      }
      continue;
    }
    let generationIndex = -1;
    for (let scan = 0; scan < generations.length; scan += 1) {
      if (generations[scan].generation === generationId) {
        generationIndex = scan;
        break;
      }
    }
    if (generationIndex < 0) {
      globalProblemCount += 1;
      continue;
    }
    const cadence = generations[generationIndex];
    const result = results[generationIndex];
    const time = dateParse(readOwnString(event, FIELD.TIME) || '');
    const nodeId = readOwnString(event, FIELD.NODE_ID);
    const valid = barrierConsumerIsValid(
      event,
      cadence,
      result.nodeIds,
      time,
      nodeId,
    );
    if (!valid) {
      result.malformedOrEarlyCount += 1;
      globalProblemCount += 1;
    } else {
      result.nodeIds[result.nodeIds.length] = nodeId;
    }
  }
  return {
    results,
    globalProblemCount,
    passed: globalProblemCount === 0,
  };
}

function countFormationTimeouts(events) {
  let count = 0;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const msg = readOwnData(event, FIELD.MSG);
    const error = readOwnData(event, 'error');
    if (
      readOwnData(event, FIELD.CODE) === FORMATION_TIMEOUT_CODE ||
      readOwnData(event, FIELD.ERROR_CODE) === FORMATION_TIMEOUT_CODE ||
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

function classifyGenerationEvidence(generation, consumer) {
  const exactConsumers = generation.completed === null ||
    setEquals(consumer.nodeIds, generation.cohortNodeIds);
  const consumerPassed = exactConsumers &&
    consumer.malformedOrEarlyCount === 0;
  const withinBudget = generation.completed === null ||
    generation.completionMs <= CERTIFICATION_BUDGET_MS;
  const synchronizationOrderValid =
    generation.projectionSynchronization === null ||
    (
      generation.reopened !== null &&
      generation.projectionSynchronization !== generation.reopened &&
      generation.projectionSynchronization.time < generation.reopened.time
    );
  const qualifying = allTrue([
    generation.valid,
    generation.completed !== null,
    generation.revoked === null,
    generation.terminalPending !== null,
    generation.terminalPending?.pendingTerminalState === FORMATION_RELEASE_HANDOFF_STATE.COMPLETE,
    generation.reopened !== null,
    synchronizationOrderValid,
    generation.cohort.length >=
      FORMATION_RELEASE_HANDOFF_MINIMUM_COHORT_SIZE,
    consumerPassed,
  ]);
  return {consumerPassed, exactConsumers, qualifying, withinBudget};
}

function closureEvidencePasses(options) {
  return allTrue([
    options.bootPassed,
    options.cadenceValid,
    options.everyConsumerObserved,
    options.everyCompletedWithinBudget,
    options.oneQualifyingGeneration,
    options.selectedWithinBudget,
    options.noTimeout,
  ]);
}

function aggregateGenerationEvidence(generations, consumerResults) {
  const qualifying = [];
  let everyConsumerObserved = true;
  let everyCompletedWithinBudget = true;
  let revoked = false;
  for (let index = 0; index < generations.length; index += 1) {
    const generation = generations[index];
    const evidence = classifyGenerationEvidence(
      generation,
      consumerResults[index],
    );
    if (generation.revoked !== null) revoked = true;
    if (!evidence.consumerPassed) everyConsumerObserved = false;
    if (!evidence.withinBudget) everyCompletedWithinBudget = false;
    if (evidence.qualifying) {
      qualifying[qualifying.length] = {
        generation,
        consumer: consumerResults[index],
      };
    }
  }
  return {
    everyCompletedWithinBudget,
    everyConsumerObserved,
    qualifying,
    revoked,
  };
}

function projectQualifyingWitness(qualifying) {
  if (qualifying.length !== 1) {
    return {
      barrierConsumerNodeIds: [],
      canonicalGeneration: null,
      capturedAt: null,
      completedAt: null,
      completionMs: null,
      durableAcknowledgedAt: null,
      reopenedAt: null,
      projectionSynchronizedAt: null,
      requiredCohort: [],
      withinBudget: false,
    };
  }
  const selected = qualifying[0].generation;
  return {
    barrierConsumerNodeIds: qualifying[0].consumer.nodeIds,
    canonicalGeneration: selected.generation,
    capturedAt: readOwnString(selected.initiated.event, FIELD.TIME),
    completedAt: readOwnString(selected.completed.event, FIELD.TIME),
    completionMs: selected.completionMs,
    durableAcknowledgedAt: readOwnString(selected.captured.event, FIELD.TIME),
    reopenedAt: readOwnString(selected.reopened.event, FIELD.TIME),
    projectionSynchronizedAt: selected.projectionSynchronization === null ?
      null :
      readOwnString(selected.projectionSynchronization.event, FIELD.TIME),
    requiredCohort: selected.cohort,
    withinBudget: selected.completionMs <= CERTIFICATION_BUDGET_MS,
  };
}

function projectGenerationEvidence(generations, consumers) {
  const result = [];
  for (let index = 0; index < generations.length; index += 1) {
    const generation = generations[index];
    const consumer = consumers[index];
    const classification = classifyGenerationEvidence(generation, consumer);
    result[result.length] = {
      generation: generation.generation,
      valid: generation.valid,
      qualifying: classification.qualifying,
      capturedAt: generation.captured === null ? null :
        readOwnString(generation.captured.event, FIELD.TIME),
      projectionSynchronizedAt:
        generation.projectionSynchronization === null ? null :
          readOwnString(
            generation.projectionSynchronization.event,
            FIELD.TIME,
          ),
      reopenedAt: generation.reopened === null ? null :
        readOwnString(generation.reopened.event, FIELD.TIME),
      terminalPendingAt: generation.terminalPending === null ? null :
        readOwnString(generation.terminalPending.event, FIELD.TIME),
      terminalAt: generation.terminal === null ? null :
        readOwnString(generation.terminal.event, FIELD.TIME),
      terminalState: generation.terminal?.state || null,
      completionMs: generation.completionMs,
      requiredCohort: generation.cohort,
      barrierConsumerNodeIds: consumer.nodeIds,
      malformedOrEarlyBarrierCount: consumer.malformedOrEarlyCount,
    };
  }
  return result;
}

function physicalStateIsEligible(evidence) {
  const status = readOwnString(evidence, 'nodeStatus');
  const connectionState = readOwnString(evidence, 'nodeConnectionState');
  return (status === ACTIVE_NODE_STATUS || status === JOINING_NODE_STATUS) &&
    (connectionState === CONNECTED_NODE_STATE ||
      connectionState === READY_NODE_STATE);
}

function physicalEvidenceIsExact(event, generation) {
  const values = readOwnData(event, 'physicalCohortEvidence');
  if (!arrayIsArray(values)) return false;
  const expected = [{
    nodeId: readOwnString(event, FIELD.AUTHORITY_NODE_ID),
    bootIncarnation: readOwnPositiveInteger(
      event,
      FIELD.AUTHORITY_BOOT_INCARNATION,
    ),
  }];
  for (let index = 0; index < generation.cohort.length; index += 1) {
    expected[expected.length] = generation.cohort[index];
  }
  if (values.length !== expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    const evidence = readOwnData(values, index);
    const expectedIdentity = expected[index];
    if (
      readOwnString(evidence, FIELD.NODE_ID) !== expectedIdentity.nodeId ||
      readOwnPositiveInteger(evidence, FIELD.EXPECTED_BOOT_INCARNATION) !==
        expectedIdentity.bootIncarnation ||
      readOwnData(evidence, FIELD.NODE_PRESENT) !== true ||
      !formationReleaseObservedNodeBootMatchesExpected(
        expectedIdentity.bootIncarnation,
        readOwnData(evidence, FIELD.NODE_BOOT_INCARNATION),
      ) ||
      readOwnData(evidence, FIELD.CURRENT_PRIMARY_PRESENT) !== true ||
      readOwnPositiveInteger(evidence, FIELD.CURRENT_PRIMARY_BOOT_INCARNATION) !==
        expectedIdentity.bootIncarnation ||
      !physicalStateIsEligible(evidence)
    ) return false;
  }
  return true;
}

function capturedProjectionWasTransientlyOmitted(event, generation) {
  const captured = normalizeUniqueStrings(
    readOwnData(event, 'capturedCanonicalNodeIds'),
    FORMATION_RELEASE_HANDOFF_MINIMUM_COHORT_SIZE + 1,
  );
  const observed = normalizeUniqueStrings(
    readOwnData(event, 'observedCanonicalNodeIds'),
  );
  const authorityNodeId = readOwnString(event, FIELD.AUTHORITY_NODE_ID);
  if (!captured || !observed || !authorityNodeId) return false;
  if (arrayPrototypeIndexOf(captured, authorityNodeId) === -1) return false;
  let omittedCapturedCohortMember = false;
  for (let index = 0; index < generation.cohortNodeIds.length; index += 1) {
    const nodeId = generation.cohortNodeIds[index];
    if (arrayPrototypeIndexOf(captured, nodeId) === -1) return false;
    if (arrayPrototypeIndexOf(observed, nodeId) === -1) {
      omittedCapturedCohortMember = true;
    }
  }
  return omittedCapturedCohortMember;
}

function transientProjectionOmissionRevocationGenerationIsExact(generation) {
  if (!generation || !generation.revoked) return false;
  const revoked = generation.revoked;
  return allTrue([
    generation.valid,
    generation.completed === null,
    generation.captured !== null,
    generation.reopened !== null,
    generation.cohort.length >=
      FORMATION_RELEASE_HANDOFF_MINIMUM_COHORT_SIZE,
    generation.terminal === revoked,
    revoked.reason === FORMATION_RELEASE_HANDOFF_REASON.AUTHORITY_INCOMPATIBLE,
    revoked.observedPublicationEpoch > revoked.capturedPublicationEpoch,
    revoked.observedAuthorityReady === null,
    revoked.recoveryReasonCodes.length === 0,
    capturedProjectionWasTransientlyOmitted(revoked.event, generation),
    physicalEvidenceIsExact(revoked.event, generation),
  ]);
}

function transientProjectionOmissionRevocationIsExact(options) {
  return allTrue([
    options.bootPassed,
    options.cadenceValid,
    options.malformedTransitionCount === 0,
    options.malformedOrEarlyBarrierCount === 0,
    options.timeoutCount === 0,
    options.generations.length === 1,
    transientProjectionOmissionRevocationGenerationIsExact(
      options.generations[0],
    ),
  ]);
}

function timeoutWithoutGenerationIsExact(options) {
  return allTrue([
    options.bootPassed,
    options.generations.length === 0,
    options.malformedTransitionCount === 0,
    options.malformedOrEarlyBarrierCount === 0,
    options.timeoutCount > 0,
  ]);
}

function classifyRevertedCounterexample(options) {
  if (transientProjectionOmissionRevocationIsExact(options)) {
    return REVERT_COUNTEREXAMPLE.TRANSIENT_PROJECTION_OMISSION_REVOCATION;
  }
  if (timeoutWithoutGenerationIsExact(options)) {
    return REVERT_COUNTEREXAMPLE.FORMATION_TIMEOUT_WITHOUT_GENERATION;
  }
  return null;
}

function analyzeFormationReleaseEvents(events, expectedFingerprint) {
  const boot = analyzeBootProof(events, expectedFingerprint);
  const cadence = analyzeTransitionCadence(events);
  const consumers = analyzeBarrierConsumers(events, cadence.generations);
  const timeoutCount = countFormationTimeouts(events);
  const aggregate = aggregateGenerationEvidence(
    cadence.generations,
    consumers.results,
  );
  const generationEvidence = projectGenerationEvidence(
    cadence.generations,
    consumers.results,
  );
  if (!consumers.passed) aggregate.everyConsumerObserved = false;
  const witness = projectQualifyingWitness(aggregate.qualifying);
  const counterexampleClassification = classifyRevertedCounterexample({
    bootPassed: boot.passed,
    cadenceValid: cadence.valid,
    generations: cadence.generations,
    malformedTransitionCount: cadence.malformedTransitionCount,
    malformedOrEarlyBarrierCount: consumers.globalProblemCount,
    timeoutCount,
  });
  const closurePassed = booleanConstructor(closureEvidencePasses({
    bootPassed: boot.passed,
    cadenceValid: cadence.valid,
    everyConsumerObserved: aggregate.everyConsumerObserved,
    everyCompletedWithinBudget: aggregate.everyCompletedWithinBudget,
    oneQualifyingGeneration: aggregate.qualifying.length === 1,
    selectedWithinBudget: witness.withinBudget,
    noTimeout: timeoutCount === 0,
  }));
  return {
    expectedFingerprint,
    bootNodeCount: boot.bootNodeIds.length,
    bootEventCount: boot.bootEventCount,
    bootProofPassed: boot.passed,
    positiveGenerationCount: cadence.generations.length,
    generationEvidence,
    qualifyingGenerationCount: aggregate.qualifying.length,
    canonicalGeneration: witness.canonicalGeneration,
    requiredCohort: witness.requiredCohort,
    capturedAt: witness.capturedAt,
    durableAcknowledgedAt: witness.durableAcknowledgedAt,
    projectionSynchronizedAt: witness.projectionSynchronizedAt,
    reopenedAt: witness.reopenedAt,
    completedAt: witness.completedAt,
    completionMs: witness.completionMs,
    malformedTransitionCount: cadence.malformedTransitionCount,
    cadenceValid: cadence.valid,
    transitionCount: cadence.transitionCount,
    barrierConsumerNodeIds: witness.barrierConsumerNodeIds,
    malformedOrEarlyBarrierCount: consumers.globalProblemCount,
    everyConsumerObserved: aggregate.everyConsumerObserved,
    revoked: aggregate.revoked,
    timeoutCount,
    counterexampleClassification,
    closurePassed,
  };
}

export {
  analyzeFormationReleaseEvents,
  analyzeTransitionCadence,
  FORMATION_TIMEOUT_CODE,
  normalizeGenerationTransition,
  projectLiveLogEntriesToEvents,
  REVERT_COUNTEREXAMPLE,
};
