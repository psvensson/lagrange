import {
  allArrayValues,
  arrayIsArray,
  hasExactKeys,
  objectFreeze,
  plainDataEqual,
  sameStringMembers,
  snapshotPlainData,
} from './evidence-exact-plain-data.js';
import {
  readCanonicalJsonArtifact,
  resolveEvidenceIndex,
  validateSourceStateBindings,
} from './movielens-public-request-evidence-artifacts.js';
import {
  MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLES,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGE,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGES,
} from './movielens-public-request-evidence-schema.js';

const FAILURE_FIDELITY = 'live-integration-failure-raw';
const FAILURE_OBSERVATION_NAME = 'raw-failure-observation';
const FAILURE_PRODUCER =
  'comparative-efficiency-movielens-public-request-live-runner';
const FAILURE_SCENARIO =
  'comparative-efficiency-movielens-public-request-workload';
const MAXIMUM_FAILURE_CAUSES = 16;
const MAXIMUM_FAILURE_MESSAGE_CHARACTERS = 4_096;
const MAXIMUM_FAILURE_NAME_CHARACTERS = 128;
const MAXIMUM_FAILURE_STACK_CHARACTERS = 16_384;

function exactObservedBoolean(value) {
  return value === true || value === false || value === null;
}

function exactStringMember(value, members) {
  if (typeof value !== 'string') return false;
  for (let index = 0; index < members.length; index += 1) {
    if (value === members[index]) return true;
  }
  return false;
}

function exactBoundedString(value, maximumCharacters) {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximumCharacters;
}

function exactFailureCause(cause) {
  if (!hasExactKeys(cause, [
    'message',
    'name',
    'role',
    'stack',
  ])) {
    return false;
  }
  return Boolean(
    exactBoundedString(
      cause.message,
      MAXIMUM_FAILURE_MESSAGE_CHARACTERS,
    ) &&
    exactBoundedString(
      cause.name,
      MAXIMUM_FAILURE_NAME_CHARACTERS,
    ) &&
    exactStringMember(
      cause.role,
      MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLES,
    ) &&
    exactBoundedString(
      cause.stack,
      MAXIMUM_FAILURE_STACK_CHARACTERS,
    ),
  );
}

function expectedPrimaryCauseRole(stage) {
  if (stage === MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGE.CLEANUP) {
    return MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.CLEANUP;
  }
  if (stage === MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGE.OPERATION) {
    return MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.OPERATION;
  }
  if (stage === MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGE.POSTGRES) {
    return MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.POSTGRES_OPERATION;
  }
  return MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.PRIMARY;
}

function exactPostgresCleanup(postgres) {
  if (!hasExactKeys(postgres, [
    'containersAbsent',
    'networkAbsent',
    'networkName',
    'removedContainerIds',
  ])) {
    return false;
  }
  return Boolean(
    exactObservedBoolean(postgres.containersAbsent) &&
    exactObservedBoolean(postgres.networkAbsent) &&
    (
      postgres.networkName === null ||
      (
        typeof postgres.networkName === 'string' &&
        postgres.networkName.length > 0
      )
    ) &&
    arrayIsArray(postgres.removedContainerIds) &&
    postgres.removedContainerIds.length <= 3 &&
    allArrayValues(
      postgres.removedContainerIds,
      (containerId) =>
        typeof containerId === 'string' &&
        containerId.length > 0,
    ) &&
    sameStringMembers(
      postgres.removedContainerIds,
      postgres.removedContainerIds,
    ),
  );
}

function exactFailureTeardown(teardown) {
  if (!hasExactKeys(teardown, [
    'cellAbsent',
    'nodeStopped',
    'postgres',
    'replicaId',
    'temporaryDirectoryAbsent',
  ])) {
    return false;
  }
  return Boolean(
    exactObservedBoolean(teardown.cellAbsent) &&
    exactObservedBoolean(teardown.nodeStopped) &&
    exactObservedBoolean(teardown.temporaryDirectoryAbsent) &&
    (
      teardown.replicaId === null ||
      (
        typeof teardown.replicaId === 'string' &&
        teardown.replicaId.length > 0
      )
    ) &&
    exactPostgresCleanup(teardown.postgres),
  );
}

function exactFailureObservation(observation) {
  if (!hasExactKeys(observation, [
    'failure',
    'fidelity',
    'producer',
    'scenario',
    'sourceState',
    'teardown',
    'timestamp',
  ])) {
    return false;
  }
  if (!hasExactKeys(observation.failure, [
    'causes',
    'message',
    'name',
    'stack',
    'stage',
  ])) {
    return false;
  }
  const primaryCause = observation.failure.causes?.[0];
  return Boolean(
    observation.fidelity === FAILURE_FIDELITY &&
    observation.producer === FAILURE_PRODUCER &&
    observation.scenario === FAILURE_SCENARIO &&
    arrayIsArray(observation.failure.causes) &&
    observation.failure.causes.length > 0 &&
    observation.failure.causes.length <= MAXIMUM_FAILURE_CAUSES &&
    allArrayValues(
      observation.failure.causes,
      exactFailureCause,
    ) &&
    primaryCause?.message === observation.failure.message &&
    primaryCause?.name === observation.failure.name &&
    primaryCause?.stack === observation.failure.stack &&
    primaryCause?.role === expectedPrimaryCauseRole(
      observation.failure.stage,
    ) &&
    exactBoundedString(
      observation.failure.message,
      MAXIMUM_FAILURE_MESSAGE_CHARACTERS,
    ) &&
    exactBoundedString(
      observation.failure.name,
      MAXIMUM_FAILURE_NAME_CHARACTERS,
    ) &&
    exactBoundedString(
      observation.failure.stack,
      MAXIMUM_FAILURE_STACK_CHARACTERS,
    ) &&
    exactStringMember(
      observation.failure.stage,
      MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGES,
    ) &&
    typeof observation.timestamp === 'string' &&
    observation.timestamp.length > 0 &&
    exactFailureTeardown(observation.teardown),
  );
}

function exactArtifactNames(descriptors, expectedNames) {
  let expected;
  try {
    expected = snapshotPlainData(expectedNames);
  } catch {
    return false;
  }
  if (!arrayIsArray(expected)) return false;
  const actual = [];
  for (let index = 0; index < descriptors.length; index += 1) {
    actual[actual.length] = descriptors[index].name;
  }
  return sameStringMembers(actual, expected);
}

async function replayFailureEvidenceIndex(
  index,
  {
    expectedNames,
    root,
  } = {},
) {
  const options = root === undefined ? {} : {root};
  const resolved = await resolveEvidenceIndex(index, options);
  const descriptors = resolved.raw.artifacts;
  if (!exactArtifactNames(descriptors, expectedNames)) {
    throw new Error('failure evidence artifact names are invalid');
  }
  const observationArtifact = await readCanonicalJsonArtifact(
    descriptors,
    FAILURE_OBSERVATION_NAME,
    root,
  );
  const sourceStateArtifact = await readCanonicalJsonArtifact(
    descriptors,
    'source-state',
    root,
  );
  const teardownArtifact = await readCanonicalJsonArtifact(
    descriptors,
    'teardown-receipt',
    root,
  );
  const observation = observationArtifact.value;
  if (
    !exactFailureObservation(observation) ||
    !plainDataEqual(
      resolved.raw.observationArtifact,
      observationArtifact.retained.descriptor,
    ) ||
    !plainDataEqual(
      resolved.raw.sourceState,
      sourceStateArtifact.value,
    ) ||
    !plainDataEqual(
      resolved.raw.sourceState,
      observation.sourceState,
    ) ||
    !plainDataEqual(
      teardownArtifact.value,
      observation.teardown,
    ) ||
    !validateSourceStateBindings(
      descriptors,
      sourceStateArtifact.value,
    )
  ) {
    throw new Error('failure evidence retained identity binding failed');
  }
  return objectFreeze({
    artifacts: resolved.artifacts,
    failure: observation.failure,
    indexDigest: resolved.indexDigest,
    passed: true,
    teardown: observation.teardown,
  });
}

export {
  FAILURE_FIDELITY,
  FAILURE_OBSERVATION_NAME,
  FAILURE_PRODUCER,
  FAILURE_SCENARIO,
  replayFailureEvidenceIndex,
};
