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
const SPREAD_REOPEN_REASON = 'priority_partitions_not_spread';
const ACTIVE_REASON = 'retained_until_captured_cohort_ready';
const COMPLETE_REASON = 'captured_cohort_ready';
const NODE_COUNT = 5;
const MINIMUM_COHORT_SIZE = 2;
const CERTIFICATION_BUDGET_MS = 60_000;

function readOwnData(target, field) {
  if (!target || typeof target !== 'object' || !objectHasOwn(target, field)) {
    return undefined;
  }
  const descriptor = objectGetOwnPropertyDescriptor(target, field);
  return descriptor && objectHasOwn(descriptor, 'value') ?
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
    const value = descriptor && objectHasOwn(descriptor, 'value') ?
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
    const member = descriptor && objectHasOwn(descriptor, 'value') ?
      descriptor.value :
      null;
    const nodeId = readOwnString(member, 'nodeId');
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
    generation: readOwnString(event, 'generation'),
    state: readOwnString(event, 'state'),
    reason: readOwnString(event, 'reason'),
    authorityNodeId: readOwnString(event, 'authorityNodeId'),
    authorityBootIncarnation:
      readOwnPositiveInteger(event, 'authorityBootIncarnation'),
    capturedPublicationEpoch:
      readOwnPositiveInteger(event, 'capturedPublicationEpoch'),
    cohort: normalizeCohort(readOwnData(event, 'requiredCohort')),
    readyNodeIds: normalizeUniqueStrings(readOwnData(event, 'readyNodeIds')),
    pendingNodeIds:
      normalizeUniqueStrings(readOwnData(event, 'pendingNodeIds')),
    observedAuthorityReady: readOwnData(event, 'observedAuthorityReady'),
    releaseAuthorized: readOwnData(event, 'releaseAuthorized'),
    recoveryReasonCodes: normalizeUniqueStrings(
      readOwnData(event, 'observedRecoveryReasonCodes'),
    ),
    time: dateParse(readOwnString(event, 'time') || ''),
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
  if (parts.state === 'active') {
    if (parts.reason !== ACTIVE_REASON) return false;
    return parts.pendingNodeIds.length > 0 && activeListsAreExact(
      parts.readyNodeIds,
      parts.pendingNodeIds,
      cohortNodeIds,
    );
  }
  if (parts.state === 'complete') {
    if (parts.reason !== COMPLETE_REASON) return false;
    return parts.pendingNodeIds.length === 0 &&
      setEquals(parts.readyNodeIds, cohortNodeIds);
  }
  if (parts.state === 'revoked') {
    return parts.readyNodeIds.length === 0 &&
      parts.pendingNodeIds.length === 0;
  }
  return false;
}

function transitionAuthorityFlagsAreValid(parts) {
  const active = parts.state === 'active';
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
    if (readOwnString(event, 'msg') !== FORMATION_TRANSITION_MESSAGE) {
      continue;
    }
    const generation = readOwnData(event, 'generation');
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

function uniqueGeneration(transitions) {
  let generation = null;
  for (let index = 0; index < transitions.length; index += 1) {
    if (generation === null) {
      generation = transitions[index].generation;
    } else if (generation !== transitions[index].generation) {
      return null;
    }
  }
  return generation;
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
  return transition.state === 'active' &&
    transition.releaseAuthorized === true;
}

function isPendingDurableCapture(transition) {
  return transition.state === 'active' &&
    transition.releaseAuthorized === false &&
    transition.observedAuthorityReady === true;
}

function isReopenedTransition(transition) {
  if (transition.state !== 'active') return false;
  if (transition.releaseAuthorized !== true) return false;
  if (transition.observedAuthorityReady !== false) return false;
  return transition.recoveryReasonCodes.length === 1 &&
    transition.recoveryReasonCodes[0] === SPREAD_REOPEN_REASON;
}

function isCompletedTransition(transition) {
  return transition.state === 'complete';
}

function isRevokedTransition(transition) {
  return transition.state === 'revoked';
}

function cadenceOrderIsValid(captured, reopened, completed) {
  if (!captured || !reopened || !completed) return false;
  if (captured.time > reopened.time) return false;
  return reopened.time <= completed.time;
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
    if (transition.state !== 'active') continue;
    if (transition.releaseAuthorized === true) {
      authorized = true;
      continue;
    }
    if (authorized) return false;
  }
  return authorized;
}

function fullTransitionSequenceIsValid(transitions, cadence) {
  if (transitions.length < 3) return false;
  if (!transitionTimesAreMonotonic(transitions)) return false;
  if (!isPendingDurableCapture(transitions[0])) return false;
  if (countTransitionState(transitions, 'complete') !== 1) return false;
  if (countTransitionState(transitions, 'revoked') !== 0) return false;
  if (!releaseNeverRegresses(transitions)) return false;
  if (transitions[transitions.length - 1] !== cadence.completed) return false;
  const pendingTime = transitions[0].time;
  if (pendingTime > cadence.captured.time) return false;
  return cadenceOrderIsValid(
    cadence.captured,
    cadence.reopened,
    cadence.completed,
  );
}

function cadenceIsValid(selected, generation, cadence, expectedNodeIds) {
  if (selected.malformedCount !== 0 || generation === null) return false;
  if (!cadence.captured || !cadence.reopened || !cadence.completed) {
    return false;
  }
  if (cadence.revoked) return false;
  if (!sameCohortEverywhere(selected.normalized, expectedNodeIds)) return false;
  return fullTransitionSequenceIsValid(selected.normalized, cadence);
}

function analyzeTransitionCadence(events) {
  const selected = selectGenerationTransitions(events);
  const generation = uniqueGeneration(selected.normalized);
  const captured = firstTransition(selected.normalized, isCapturedTransition);
  const reopened = firstTransition(selected.normalized, isReopenedTransition);
  const completed = firstTransition(selected.normalized, isCompletedTransition);
  const revoked = firstTransition(selected.normalized, isRevokedTransition);
  const expectedNodeIds = captured?.cohortNodeIds || [];
  const initiated = selected.normalized[0] || null;
  const completionMs = initiated && completed ?
    completed.time - initiated.time :
    null;
  const cadence = {captured, reopened, completed, revoked};
  const valid = cadenceIsValid(
    selected,
    generation,
    cadence,
    expectedNodeIds,
  );
  return {
    generation,
    initiated,
    captured,
    reopened,
    completed,
    revoked,
    completionMs,
    malformedTransitionCount: selected.malformedCount,
    transitionCount: selected.normalized.length,
    valid,
  };
}

function barrierConsumerIsValid(event, cadence, nodeIds, time, nodeId) {
  if (!nodeId || !numberIsFinite(time)) return false;
  if (!cadence.captured || !cadence.reopened || !cadence.completed) return false;
  if (readOwnData(event, 'formationReleaseHandoffState') !== 'active') {
    return false;
  }
  if (readOwnData(
    event,
    'formationReleaseHandoffReleaseAuthorized',
  ) !== true) return false;
  if (time < cadence.reopened.time || time > cadence.completed.time) {
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
    if (!objectHasOwn(event, 'srcFingerprintMatches')) continue;
    bootEventCount += 1;
    const nodeId = readOwnString(event, 'nodeId');
    if (
      !nodeId ||
      arrayPrototypeIndexOf(nodeIds, nodeId) !== -1 ||
      readOwnData(event, 'srcFingerprintMatches') !== true ||
      readOwnString(event, 'bootedSrcFingerprint') !== expectedFingerprint ||
      readOwnString(event, 'expectedSrcFingerprint') !== expectedFingerprint
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

function analyzeBarrierConsumers(events, cadence) {
  const nodeIds = [];
  let malformedOrEarlyCount = 0;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (
      readOwnString(event, 'msg') !== FORMATION_BARRIER_MESSAGE ||
      readOwnData(event, 'formationReleaseHandoffGeneration') !==
        cadence.generation
    ) {
      continue;
    }
    const time = dateParse(readOwnString(event, 'time') || '');
    const nodeId = readOwnString(event, 'nodeId');
    const valid = barrierConsumerIsValid(
      event,
      cadence,
      nodeIds,
      time,
      nodeId,
    );
    if (!valid) {
      malformedOrEarlyCount += 1;
    } else {
      nodeIds[nodeIds.length] = nodeId;
    }
  }
  return {
    nodeIds,
    malformedOrEarlyCount,
    passed: malformedOrEarlyCount === 0 &&
      cadence.captured !== null &&
      setEquals(nodeIds, cadence.captured.cohortNodeIds),
  };
}

function countFormationTimeouts(events) {
  let count = 0;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const msg = readOwnData(event, 'msg');
    const error = readOwnData(event, 'error');
    if (
      readOwnData(event, 'code') === FORMATION_TIMEOUT_CODE ||
      readOwnData(event, 'errorCode') === FORMATION_TIMEOUT_CODE ||
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

function analyzeFormationReleaseEvents(events, expectedFingerprint) {
  const boot = analyzeBootProof(events, expectedFingerprint);
  const cadence = analyzeTransitionCadence(events);
  const consumers = analyzeBarrierConsumers(events, cadence);
  const timeoutCount = countFormationTimeouts(events);
  const withinBudget = cadence.completionMs !== null &&
    cadence.completionMs >= 0 &&
    cadence.completionMs <= CERTIFICATION_BUDGET_MS;
  const closurePassed = booleanConstructor(
    boot.passed * cadence.valid * consumers.passed * withinBudget *
    (timeoutCount === 0),
  );
  return {
    expectedFingerprint,
    bootNodeCount: boot.bootNodeIds.length,
    bootEventCount: boot.bootEventCount,
    bootProofPassed: boot.passed,
    positiveGenerationCount: cadence.generation ? 1 : 0,
    canonicalGeneration: cadence.generation,
    requiredCohort: cadence.captured?.cohort || [],
    capturedAt: cadence.initiated ?
      readOwnString(cadence.initiated.event, 'time') : null,
    durableAcknowledgedAt: cadence.captured ?
      readOwnString(cadence.captured.event, 'time') : null,
    reopenedAt: cadence.reopened ?
      readOwnString(cadence.reopened.event, 'time') : null,
    completedAt: cadence.completed ?
      readOwnString(cadence.completed.event, 'time') : null,
    completionMs: cadence.completionMs,
    malformedTransitionCount: cadence.malformedTransitionCount,
    transitionCount: cadence.transitionCount,
    barrierConsumerNodeIds: consumers.nodeIds,
    malformedOrEarlyBarrierCount: consumers.malformedOrEarlyCount,
    everyConsumerObserved: consumers.passed,
    revoked: cadence.revoked !== null,
    timeoutCount,
    closurePassed,
  };
}

export {
  analyzeFormationReleaseEvents,
  analyzeTransitionCadence,
  normalizeGenerationTransition,
};
