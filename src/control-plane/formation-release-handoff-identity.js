const arrayIsArray = Array.isArray;
const numberIsSafeInteger = Number.isSafeInteger;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;

const SCALAR_FIELDS = Object.freeze([
  'state',
  'reason',
  'active',
  'releaseAuthorized',
  'generation',
  'authorityNodeId',
  'authorityBootIncarnation',
  'capturedPublicationEpoch',
  'observedPublicationEpoch',
  'observedAuthorityReady',
  'fenceIdentity',
]);
const ARRAY_FIELDS = Object.freeze([
  'canonicalNodeIds',
  'observedRecoveryReasonCodes',
  'readyNodeIds',
  'pendingNodeIds',
]);

function readOwnData(target, field) {
  if (!target || typeof target !== 'object') return undefined;
  const descriptor = objectGetOwnPropertyDescriptor(target, field);
  return descriptor && objectHasOwn(descriptor, 'value') ?
    descriptor.value : undefined;
}

function encodePrimitive(value) {
  const serialized = `${value}`;
  return `${serialized.length}:${serialized}`;
}

function formationReleaseCohortIdentity(cohort) {
  if (!arrayIsArray(cohort)) return null;
  let result = `c${cohort.length}:`;
  for (let index = 0; index < cohort.length; index += 1) {
    const descriptor = objectGetOwnPropertyDescriptor(cohort, index);
    if (!descriptor || !objectHasOwn(descriptor, 'value')) return null;
    const nodeId = readOwnData(descriptor.value, 'nodeId');
    const bootIncarnation = readOwnData(descriptor.value, 'bootIncarnation');
    if (
      typeof nodeId !== 'string' || nodeId.length === 0 ||
      !numberIsSafeInteger(bootIncarnation) || bootIncarnation <= 0
    ) {
      return null;
    }
    result += `n${encodePrimitive(nodeId)}b${encodePrimitive(bootIncarnation)}`;
  }
  return result;
}

function formationReleaseCohortContainsNodeId(value, nodeId) {
  if (typeof nodeId !== 'string' || nodeId.length === 0) return false;
  const cohort = readOwnData(value, 'requiredCohort');
  if (!arrayIsArray(cohort)) return false;
  for (let index = 0; index < cohort.length; index += 1) {
    if (readOwnData(readOwnData(cohort, index), 'nodeId') === nodeId) {
      return true;
    }
  }
  return false;
}

function formationReleaseCanonicalContainsCapturedSet(evidence, generation) {
  const currentNodeIds = readOwnData(evidence, 'canonicalNodeIds');
  const capturedNodeIds = readOwnData(generation, 'canonicalNodeIds');
  if (!arrayIsArray(currentNodeIds) || !arrayIsArray(capturedNodeIds)) {
    return false;
  }
  for (let index = 0; index < capturedNodeIds.length; index += 1) {
    const capturedNodeId = readOwnData(capturedNodeIds, index);
    let found = false;
    for (let scan = 0; scan < currentNodeIds.length; scan += 1) {
      if (readOwnData(currentNodeIds, scan) === capturedNodeId) found = true;
    }
    if (!found) return false;
  }
  return true;
}

function formationReleaseGenerationIdentity(
  publicationEpoch,
  authorityNodeId,
  authorityBootIncarnation,
  cohort,
) {
  if (
    !numberIsSafeInteger(publicationEpoch) || publicationEpoch <= 0 ||
    typeof authorityNodeId !== 'string' || authorityNodeId.length === 0 ||
    !numberIsSafeInteger(authorityBootIncarnation) ||
    authorityBootIncarnation <= 0
  ) {
    return null;
  }
  const cohortIdentity = formationReleaseCohortIdentity(cohort);
  return cohortIdentity === null ? null :
    `e${encodePrimitive(publicationEpoch)}` +
    `a${encodePrimitive(authorityNodeId)}` +
    `b${encodePrimitive(authorityBootIncarnation)}${cohortIdentity}`;
}

function denseArrayEqual(left, right) {
  if (!arrayIsArray(left) || !arrayIsArray(right) ||
      left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftDescriptor = objectGetOwnPropertyDescriptor(left, index);
    const rightDescriptor = objectGetOwnPropertyDescriptor(right, index);
    if (!leftDescriptor || !rightDescriptor ||
        !objectHasOwn(leftDescriptor, 'value') ||
        !objectHasOwn(rightDescriptor, 'value') ||
        leftDescriptor.value !== rightDescriptor.value) return false;
  }
  return true;
}

function cohortEqual(left, right) {
  if (!arrayIsArray(left) || !arrayIsArray(right) ||
      left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftMember = readOwnData(left, index);
    const rightMember = readOwnData(right, index);
    if (!leftMember || !rightMember ||
        readOwnData(leftMember, 'nodeId') !==
          readOwnData(rightMember, 'nodeId') ||
        readOwnData(leftMember, 'bootIncarnation') !==
          readOwnData(rightMember, 'bootIncarnation')) return false;
  }
  return true;
}

function formationReleaseContractsEqual(left, right) {
  if (!left || !right) return false;
  for (let index = 0; index < SCALAR_FIELDS.length; index += 1) {
    const field = SCALAR_FIELDS[index];
    if (readOwnData(left, field) !== readOwnData(right, field)) return false;
  }
  for (let index = 0; index < ARRAY_FIELDS.length; index += 1) {
    const field = ARRAY_FIELDS[index];
    if (!denseArrayEqual(readOwnData(left, field), readOwnData(right, field))) {
      return false;
    }
  }
  return cohortEqual(
    readOwnData(left, 'requiredCohort'),
    readOwnData(right, 'requiredCohort'),
  );
}

export {
  formationReleaseCanonicalContainsCapturedSet,
  formationReleaseCohortContainsNodeId,
  formationReleaseCohortIdentity,
  formationReleaseContractsEqual,
  formationReleaseGenerationIdentity,
};
