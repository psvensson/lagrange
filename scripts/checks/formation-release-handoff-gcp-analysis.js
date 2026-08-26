const arrayIsArray = Array.isArray;
const arrayPrototypeIndexOf = Function.call.bind(Array.prototype.indexOf);
import {formationReleaseCohortIdentity, formationReleaseGenerationIdentity} from '../../src/control-plane/formation-release-handoff-identity.js';
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

const FORMATION_TRANSITION_MESSAGE =
  'Formation release handoff authority transition';
const FORMATION_BARRIER_MESSAGE = 'Join priority-placement formation barrier';
const FORMATION_TIMEOUT_CODE = 'OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT';
const SPREAD_REOPEN_REASON = 'priority_partitions_not_spread';
const ACTIVE_REASON = 'retained_until_captured_cohort_ready';
const COMPLETE_REASON = 'captured_cohort_ready';
const IDLE_REASON = 'no_satisfied_formation_cohort';
const REVOKED_REASONS = Object.freeze([
  'startup_authority_incompatible',
  'captured_cohort_member_missing',
  'captured_cohort_incarnation_changed',
  'captured_cohort_member_ineligible',
]);
const NODE_COUNT = 5;
const MINIMUM_COHORT_SIZE = 2;
const CERTIFICATION_BUDGET_MS = 60_000;
const REVERT_COUNTEREXAMPLE = Object.freeze({
  CANONICAL_EXPANSION_REVOCATION:
    'canonical_membership_expansion_revocation',
  FORMATION_TIMEOUT_WITHOUT_GENERATION:
    'formation_timeout_without_generation',
});
const EVENT_FIELDS = Object.freeze([
  'authorityBootIncarnation',
  'authorityNodeId',
  'bootedSrcFingerprint',
  'capturedPublicationEpoch',
  'code',
  'error',
  'errorCode',
  'expectedSrcFingerprint',
  'formationReleaseHandoffGeneration',
  'formationReleaseHandoffReleaseAuthorized',
  'formationReleaseHandoffState',
  'generation',
  'observedAuthorityReady',
  'observedPublicationEpoch',
  'observedRecoveryReasonCodes',
  'pendingNodeIds',
  'readyNodeIds',
  'reason',
  'releaseAuthorized',
  'requiredCohort',
  'srcFingerprintMatches',
  'state',
]);

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
  event.nodeId = readOwnData(entry, 'node_id') ||
    readOwnData(entry, 'nodeId') || readOwnData(metadata, 'nodeId') || null;
  event.msg = readOwnData(entry, 'message') ||
    readOwnData(entry, 'msg') || readOwnData(metadata, 'msg') || null;
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
  if (!arrayIsArray(values) || values.length < 1) {
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
    observedPublicationEpoch:
      readOwnPositiveInteger(event, 'observedPublicationEpoch'),
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
    return arrayPrototypeIndexOf(REVOKED_REASONS, parts.reason) !== -1 &&
      parts.readyNodeIds.length === 0 &&
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
    capturedPublicationEpoch: parts.capturedPublicationEpoch,
    observedPublicationEpoch: parts.observedPublicationEpoch,
    cohort: parts.cohort,
    cohortNodeIds,
    readyNodeIds: parts.readyNodeIds,
    pendingNodeIds: parts.pendingNodeIds,
    recoveryReasonCodes: parts.recoveryReasonCodes,
  };
}

function nullGenerationTransitionIsNonAuthorizing(event) {
  return allTrue([
    readOwnData(event, 'generation') === null,
    readOwnData(event, 'state') === 'idle',
    readOwnData(event, 'reason') === IDLE_REASON,
    readOwnData(event, 'releaseAuthorized') === false,
    readOwnData(event, 'authorityBootIncarnation') === null,
    readOwnData(event, 'capturedPublicationEpoch') === null,
    readOwnData(event, 'observedPublicationEpoch') === null,
    readOwnData(event, 'observedAuthorityReady') === null,
    listsEqual(normalizeUniqueStrings(readOwnData(event, 'readyNodeIds')), []),
    listsEqual(
      normalizeUniqueStrings(readOwnData(event, 'pendingNodeIds')),
      [],
    ),
    normalizeCohort(readOwnData(event, 'requiredCohort')) === null,
    arrayIsArray(readOwnData(event, 'requiredCohort')),
    readOwnData(event, 'requiredCohort').length === 0,
    listsEqual(normalizeUniqueStrings(
      readOwnData(event, 'observedRecoveryReasonCodes'),
    ), []),
  ]);
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
  const completeCount = countTransitionState(transitions, 'complete');
  const revokedCount = countTransitionState(transitions, 'revoked');
  if (completeCount + revokedCount !== 1) return false;
  const terminal = completed || revoked;
  return terminal !== null && transitions[transitions.length - 1] === terminal;
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
  const completed = firstTransition(transitions, isCompletedTransition);
  const revoked = firstTransition(transitions, isRevokedTransition);
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
    completed,
    revoked,
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
  if (!cadence.captured || !cadence.terminal) return false;
  if (readOwnData(event, 'formationReleaseHandoffState') !== 'active') {
    return false;
  }
  if (readOwnData(
    event,
    'formationReleaseHandoffReleaseAuthorized',
  ) !== true) return false;
  if (time < cadence.captured.time || time > cadence.terminal.time) {
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
    if (readOwnString(event, 'msg') !== FORMATION_BARRIER_MESSAGE) continue;
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
        'formationReleaseHandoffReleaseAuthorized',
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
    const time = dateParse(readOwnString(event, 'time') || '');
    const nodeId = readOwnString(event, 'nodeId');
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

function classifyGenerationEvidence(generation, consumer) {
  const exactConsumers = generation.completed === null ||
    setEquals(consumer.nodeIds, generation.cohortNodeIds);
  const consumerPassed = exactConsumers &&
    consumer.malformedOrEarlyCount === 0;
  const withinBudget = generation.completed === null ||
    generation.completionMs <= CERTIFICATION_BUDGET_MS;
  const qualifying = allTrue([
    generation.valid,
    generation.completed !== null,
    generation.revoked === null,
    generation.reopened !== null,
    generation.cohort.length >= MINIMUM_COHORT_SIZE,
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
      requiredCohort: [],
      withinBudget: false,
    };
  }
  const selected = qualifying[0].generation;
  return {
    barrierConsumerNodeIds: qualifying[0].consumer.nodeIds,
    canonicalGeneration: selected.generation,
    capturedAt: readOwnString(selected.initiated.event, 'time'),
    completedAt: readOwnString(selected.completed.event, 'time'),
    completionMs: selected.completionMs,
    durableAcknowledgedAt: readOwnString(selected.captured.event, 'time'),
    reopenedAt: readOwnString(selected.reopened.event, 'time'),
    requiredCohort: selected.cohort,
    withinBudget: selected.completionMs <= CERTIFICATION_BUDGET_MS,
  };
}

function canonicalExpansionRevocationGenerationIsExact(generation) {
  if (!generation || !generation.revoked) return false;
  const revoked = generation.revoked;
  return allTrue([
    generation.valid,
    generation.completed === null,
    generation.captured !== null,
    generation.reopened !== null,
    generation.cohort.length >= MINIMUM_COHORT_SIZE,
    generation.terminal === revoked,
    revoked.reason === 'startup_authority_incompatible',
    revoked.observedPublicationEpoch > revoked.capturedPublicationEpoch,
    revoked.observedAuthorityReady === null,
    revoked.recoveryReasonCodes.length === 0,
  ]);
}

function canonicalExpansionRevocationIsExact(options) {
  return allTrue([
    options.bootPassed,
    options.cadenceValid,
    options.malformedTransitionCount === 0,
    options.malformedOrEarlyBarrierCount === 0,
    options.timeoutCount === 0,
    options.generations.length === 1,
    canonicalExpansionRevocationGenerationIsExact(options.generations[0]),
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
  if (canonicalExpansionRevocationIsExact(options)) {
    return REVERT_COUNTEREXAMPLE.CANONICAL_EXPANSION_REVOCATION;
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
    qualifyingGenerationCount: aggregate.qualifying.length,
    canonicalGeneration: witness.canonicalGeneration,
    requiredCohort: witness.requiredCohort,
    capturedAt: witness.capturedAt,
    durableAcknowledgedAt: witness.durableAcknowledgedAt,
    reopenedAt: witness.reopenedAt,
    completedAt: witness.completedAt,
    completionMs: witness.completionMs,
    malformedTransitionCount: cadence.malformedTransitionCount,
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
