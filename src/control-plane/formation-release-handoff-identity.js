const arrayIsArray = Array.isArray;
const numberIsSafeInteger = Number.isSafeInteger;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;

const OWN_DATA_VALUE_FIELD = 'value';
const FIELD_NODE_ID = 'nodeId';
const FIELD_BOOT_INCARNATION = 'bootIncarnation';
const FIELD_REQUIRED_COHORT = 'requiredCohort';

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
  return descriptor && objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD) ?
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
    if (!descriptor || !objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD)) return null;
    const nodeId = readOwnData(descriptor.value, FIELD_NODE_ID);
    const bootIncarnation = readOwnData(descriptor.value, FIELD_BOOT_INCARNATION);
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
        !objectHasOwn(leftDescriptor, OWN_DATA_VALUE_FIELD) ||
        !objectHasOwn(rightDescriptor, OWN_DATA_VALUE_FIELD) ||
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
        readOwnData(leftMember, FIELD_NODE_ID) !==
          readOwnData(rightMember, FIELD_NODE_ID) ||
        readOwnData(leftMember, FIELD_BOOT_INCARNATION) !==
          readOwnData(rightMember, FIELD_BOOT_INCARNATION)) return false;
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
    readOwnData(left, FIELD_REQUIRED_COHORT),
    readOwnData(right, FIELD_REQUIRED_COHORT),
  );
}

export {
  formationReleaseCohortIdentity,
  formationReleaseContractsEqual,
  formationReleaseGenerationIdentity,
};
