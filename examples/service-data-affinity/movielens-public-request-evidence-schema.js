import {
  DATA_VALUE_KEY,
  allArrayValues,
  arrayIsArray,
  hasExactKeys,
  objectFreeze,
  objectGetOwnPropertyDescriptor,
  objectGetPrototypeOf,
  objectHasOwn,
  reflectApply,
  stringPart,
  utilIsNativeError,
  utilIsProxy,
} from './evidence-exact-plain-data.js';

const MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGE = objectFreeze({
  ARTIFACT: 'artifact-build',
  CLEANUP: 'cleanup',
  DATASET: 'dataset-load',
  DEPLOYMENT: 'deployment',
  NODE: 'node-boot',
  OPERATION: 'operation',
  POSTGRES: 'postgres-baseline',
  RUNNER: 'runner',
  TEMPORARY_DIRECTORY: 'temporary-directory',
});
const MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGES = objectFreeze([
  MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGE.ARTIFACT,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGE.CLEANUP,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGE.DATASET,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGE.DEPLOYMENT,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGE.NODE,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGE.OPERATION,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGE.POSTGRES,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGE.RUNNER,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGE.TEMPORARY_DIRECTORY,
]);
const MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE = objectFreeze({
  AGGREGATE_MEMBER: 'aggregate-member',
  CELL_CLEANUP: 'cell-cleanup',
  CLEANUP: 'cleanup',
  NODE_CLEANUP: 'node-cleanup',
  OPERATION: 'operation',
  POSTGRES_CLEANUP: 'postgres-cleanup',
  POSTGRES_OPERATION: 'postgres-operation',
  POSTGRES_POOL_CLOSE: 'postgres-pool-close',
  PRIMARY: 'primary',
  TEMPORARY_DIRECTORY_CLEANUP: 'temporary-directory-cleanup',
});
const MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLES = objectFreeze([
  MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.AGGREGATE_MEMBER,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.CELL_CLEANUP,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.CLEANUP,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.NODE_CLEANUP,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.OPERATION,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.POSTGRES_CLEANUP,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.POSTGRES_OPERATION,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.POSTGRES_POOL_CLOSE,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.PRIMARY,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.TEMPORARY_DIRECTORY_CLEANUP,
]);
const LIVE_FAILURES = new WeakSet();
const LIVE_FAILURE_CAUSES = new WeakMap();
const weakMapGet = WeakMap.prototype.get;
const weakMapSet = WeakMap.prototype.set;
const weakSetAdd = WeakSet.prototype.add;
const weakSetHas = WeakSet.prototype.has;
const MAXIMUM_FAILURE_CAUSES = 16;
const MAXIMUM_FAILURE_MESSAGE_CHARACTERS = 4_096;
const MAXIMUM_FAILURE_NAME_CHARACTERS = 128;
const MAXIMUM_FAILURE_STACK_CHARACTERS = 16_384;
const FAILURE_TEXT_TRUNCATED = ' [truncated]';
const NON_ERROR_FAILURE_NAME = 'NonErrorThrow';

function boundedFailureText(value, maximumCharacters, fallback) {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  if (value.length <= maximumCharacters) return value;
  return stringPart(
    value,
    0,
    maximumCharacters - FAILURE_TEXT_TRUNCATED.length,
  ) + FAILURE_TEXT_TRUNCATED;
}

function safeOwnDataValue(value, key) {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function') ||
    utilIsProxy(value)
  ) {
    return undefined;
  }
  const descriptor = objectGetOwnPropertyDescriptor(value, key);
  return descriptor && objectHasOwn(descriptor, DATA_VALUE_KEY) ?
    descriptor.value :
    undefined;
}

function safeErrorName(error) {
  let candidate = error;
  for (let depth = 0; candidate && depth < 4; depth += 1) {
    const name = safeOwnDataValue(candidate, 'name');
    if (typeof name === 'string' && name.length > 0) return name;
    if (utilIsProxy(candidate)) break;
    candidate = objectGetPrototypeOf(candidate);
  }
  return 'Error';
}

function primitiveFailureMessage(value) {
  if (value === null) return 'thrown null';
  switch (typeof value) {
  case 'undefined':
    return 'thrown undefined';
  case 'string':
    return boundedFailureText(
      value,
      MAXIMUM_FAILURE_MESSAGE_CHARACTERS,
      'thrown empty string',
    );
  case 'number':
    return `thrown number ${value}`;
  case 'bigint':
    return `thrown bigint ${value}`;
  case 'boolean':
    return `thrown boolean ${value}`;
  case 'symbol':
    return 'thrown symbol';
  case 'function':
    return 'thrown function';
  default:
    return 'thrown object';
  }
}

function exactFailureCauseRole(role) {
  for (
    let index = 0;
    index < MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLES.length;
    index += 1
  ) {
    if (role === MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLES[index]) {
      return role;
    }
  }
  return MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.PRIMARY;
}

function summarizeFailureCause(value, role) {
  if (utilIsProxy(value) || !utilIsNativeError(value)) {
    const message = primitiveFailureMessage(value);
    return objectFreeze({
      message,
      name: NON_ERROR_FAILURE_NAME,
      role: exactFailureCauseRole(role),
      stack: `${NON_ERROR_FAILURE_NAME}: ${message}`,
    });
  }
  const message = boundedFailureText(
    safeOwnDataValue(value, 'message'),
    MAXIMUM_FAILURE_MESSAGE_CHARACTERS,
    'error without an own message',
  );
  const name = boundedFailureText(
    safeErrorName(value),
    MAXIMUM_FAILURE_NAME_CHARACTERS,
    'Error',
  );
  return objectFreeze({
    message,
    name,
    role: exactFailureCauseRole(role),
    stack: boundedFailureText(
      safeOwnDataValue(value, 'stack'),
      MAXIMUM_FAILURE_STACK_CHARACTERS,
      `${name}: ${message}`,
    ),
  });
}

function safeCauseEntry(value) {
  const role = safeOwnDataValue(value, 'role');
  if (exactFailureCauseRole(role) !== role) return null;
  const causeDescriptor =
    objectGetOwnPropertyDescriptor(value, 'cause');
  if (!causeDescriptor || !objectHasOwn(causeDescriptor, DATA_VALUE_KEY)) {
    return null;
  }
  return {cause: causeDescriptor.value, role};
}

function safeCauseEntries(error) {
  const entries = safeOwnDataValue(error, 'failureCauseEntries');
  if (
    utilIsProxy(entries) ||
    !arrayIsArray(entries) ||
    entries.length === 0 ||
    entries.length > MAXIMUM_FAILURE_CAUSES
  ) {
    return null;
  }
  const safeEntries = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = safeCauseEntry(
      safeOwnDataValue(entries, `${index}`),
    );
    if (!entry) return null;
    safeEntries.push(entry);
  }
  return safeEntries;
}

function safeAggregateMembers(error) {
  const errors = safeOwnDataValue(error, 'errors');
  if (
    utilIsProxy(errors) ||
    !arrayIsArray(errors) ||
    errors.length === 0
  ) {
    return null;
  }
  const members = [];
  const retainedLength = errors.length < MAXIMUM_FAILURE_CAUSES ?
    errors.length :
    MAXIMUM_FAILURE_CAUSES;
  for (let index = 0; index < retainedLength; index += 1) {
    const descriptor =
      objectGetOwnPropertyDescriptor(errors, `${index}`);
    if (!descriptor || !objectHasOwn(descriptor, DATA_VALUE_KEY)) {
      return null;
    }
    members.push(descriptor.value);
  }
  return members;
}

function appendFailureCause(causes, value, role) {
  if (causes.length >= MAXIMUM_FAILURE_CAUSES) return;
  if (isMovielensPublicRequestLiveFailure(value)) {
    const retained = reflectApply(
      weakMapGet,
      LIVE_FAILURE_CAUSES,
      [value],
    );
    for (
      let index = 0;
      index < retained.length &&
        causes.length < MAXIMUM_FAILURE_CAUSES;
      index += 1
    ) {
      causes.push(retained[index]);
    }
    return;
  }
  if (!utilIsProxy(value) && utilIsNativeError(value)) {
    const entries = safeCauseEntries(value);
    if (entries) {
      for (
        let index = 0;
        index < entries.length &&
          causes.length < MAXIMUM_FAILURE_CAUSES;
        index += 1
      ) {
        appendFailureCause(
          causes,
          entries[index].cause,
          entries[index].role,
        );
      }
      return;
    }
  }
  causes.push(summarizeFailureCause(value, role));
  if (utilIsProxy(value) || !utilIsNativeError(value)) return;
  const aggregateMembers = safeAggregateMembers(value);
  if (!aggregateMembers) return;
  for (
    let index = 0;
    index < aggregateMembers.length &&
      causes.length < MAXIMUM_FAILURE_CAUSES;
    index += 1
  ) {
    appendFailureCause(
      causes,
      aggregateMembers[index],
      MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.AGGREGATE_MEMBER,
    );
  }
}

function defaultFailureCauseRole(stage) {
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

function canonicalMovielensPublicRequestFailureCauses(
  cause,
  stage,
  additionalCauses,
) {
  const causes = [];
  appendFailureCause(
    causes,
    cause,
    defaultFailureCauseRole(stage),
  );
  if (arrayIsArray(additionalCauses) && !utilIsProxy(additionalCauses)) {
    for (
      let index = 0;
      index < additionalCauses.length &&
        causes.length < MAXIMUM_FAILURE_CAUSES;
      index += 1
    ) {
      const entry = safeCauseEntry(
        safeOwnDataValue(additionalCauses, `${index}`),
      );
      if (entry) appendFailureCause(causes, entry.cause, entry.role);
    }
  }
  return objectFreeze(causes);
}

function isMovielensPublicRequestLiveFailure(value) {
  return Boolean(
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    reflectApply(weakSetHas, LIVE_FAILURES, [value]),
  );
}

function registerMovielensPublicRequestLiveFailure(value, causes) {
  reflectApply(weakSetAdd, LIVE_FAILURES, [value]);
  reflectApply(weakMapSet, LIVE_FAILURE_CAUSES, [value, causes]);
}

function exactRankingRows(rows) {
  return arrayIsArray(rows) &&
    allArrayValues(
      rows,
      (row) => hasExactKeys(row, ['movieId', 'rank', 'scoreMicros']),
    );
}

function recordOrEmpty(value) {
  return value && typeof value === 'object' ? value : {};
}

function exactLiveSchemas(live) {
  if (!live || typeof live !== 'object') return false;
  const liveKeys = [
    'alternative',
    'artifact',
    'authentication',
    'dataset',
    'deployment',
    'drainReceipt',
    'durability',
    'inputDurability',
    'journalEvidence',
    'operationBoundary',
    'oracle',
    'repeatedOperation',
    'requestEvidence',
    'responseEvidence',
    'teardown',
    'timeoutSemantics',
    'workloadManifest',
  ];
  if (!hasExactKeys(live, liveKeys)) return false;
  const alternative = recordOrEmpty(live.alternative);
  const deployment = recordOrEmpty(live.deployment);
  const repeated = recordOrEmpty(live.repeatedOperation);
  const manifest = recordOrEmpty(deployment.manifest);
  const binding = recordOrEmpty(deployment.binding);
  const workload = recordOrEmpty(live.workloadManifest);
  const teardown = recordOrEmpty(live.teardown);
  const schemas = [
    [live.dataset, ['cardinality', 'digest', 'sizeBytes', 'source']],
    [workload, [
      'alternative',
      'consistency',
      'dataset',
      'durability',
      'operationBoundary',
      'resultOracle',
      'version',
    ]],
    [workload.dataset, ['cardinality', 'digest', 'source']],
    [workload.operationBoundary, ['method', 'path']],
    [live.oracle, ['expected', 'observed', 'passed', 'version']],
    [live.durability, [
      'contract',
      'expected',
      'observed',
      'replayPreserved',
      'status',
    ]],
    [live.inputDurability, ['expected', 'observed']],
    [live.operationBoundary, [
      'authenticatedHttp',
      'componentHeader',
      'distinctIdempotencyKey',
      'idempotencyKey',
      'journalReplayPreserved',
      'method',
      'path',
      'principal',
      'status',
    ]],
    [live.authentication, [
      'deniedStatus',
      'durableInvocationJournalRowsAfterDenial',
      'durableResultRowsAfterDenial',
      'durableTableRowsAfterDenial',
      'principal',
      'unauthenticatedInvoked',
    ]],
    [live.drainReceipt, ['inFlight', 'status']],
    [live.journalEvidence, [
      'distinct',
      'first',
      'replayAfter',
      'replayBefore',
    ]],
    [repeated, [
      'distinctDurableKeyRange',
      'distinctGeneration',
      'distinctInvocationCount',
      'distinctOperationOracle',
      'distinctOperationResultKeyOffset',
      'firstInvocationCount',
      'firstOperationResultKeyOffset',
      'generation',
      'replayGeneration',
      'replayInvocationCount',
      'sameGenerationDistinctOperationsEquivalent',
      'semanticStatus',
    ]],
    [repeated.distinctDurableKeyRange, [
      'lowerInclusive',
      'upperInclusive',
    ]],
    [repeated.distinctOperationOracle, [
      'expected',
      'observed',
      'passed',
      'version',
    ]],
    [live.requestEvidence, ['distinct', 'first', 'replay']],
    [live.responseEvidence, ['distinct', 'first', 'replay']],
    [alternative, [
      'cleanupReceipt',
      'engine',
      'imageId',
      'imageInspection',
      'imageRepoDigests',
      'inputDigest',
      'inputSizeBytes',
      'measuredContainerImages',
      'postgresLogDigests',
      'postgresVersion',
      'postgresVersionSql',
      'querySql',
      'replicationFactor',
      'replicationState',
      'returnedAggregateRows',
      'topMovies',
      'totalRows',
    ]],
    [alternative.imageInspection, ['id', 'repoDigests']],
    [alternative.replicationState, ['ready', 'replicaCount']],
    [live.artifact, [
      'buildInputFingerprint',
      'componentSource',
      'executableDigest',
      'ociManifestDigest',
      'ociPayloadDigest',
    ]],
    [deployment, [
      'binding',
      'bindingReceipt',
      'manifest',
      'packageId',
      'readyCell',
    ]],
    [binding, [
      'budgets',
      'name',
      'schema_version',
      'source',
      'target',
    ]],
    [binding.budgets, [
      'context_bytes',
      'cpu_time_ms',
      'input_bytes',
      'memory_bytes',
      'output_bytes',
      'wall_time_ms',
    ]],
    [binding.source, ['kind', 'method', 'path']],
    [binding.target, [
      'export_name',
      'manifest_digest',
      'package_id',
    ]],
    [deployment.bindingReceipt, ['manifest_digest']],
    [manifest, [
      'artifact',
      'capabilities',
      'exports',
      'name',
      'runtime',
      'schema_version',
      'version',
    ]],
    [manifest.artifact, [
      'digest',
      'media_type',
      'ref',
      'size_bytes',
      'type',
    ]],
    [manifest.runtime, ['kind']],
    [deployment.readyCell, [
      'bindingDigest',
      'bindingVersionId',
      'method',
      'nodeId',
      'path',
      'replicaId',
      'serviceId',
      'targetAddress',
      'targetNodeId',
      'tenantId',
    ]],
    [teardown, [
      'cellAbsent',
      'nodeStopped',
      'postgres',
      'replicaId',
      'temporaryDirectoryAbsent',
    ]],
    [teardown.postgres, [
      'containersAbsent',
      'networkAbsent',
      'networkName',
      'removedContainerIds',
    ]],
    [alternative.cleanupReceipt, [
      'containersAbsent',
      'networkAbsent',
      'networkName',
      'removedContainerIds',
    ]],
  ];
  for (let index = 0; index < schemas.length; index += 1) {
    if (!hasExactKeys(schemas[index][0], schemas[index][1])) return false;
  }
  return allArrayValues(
    [
      exactRankingRows(live.oracle?.expected),
      exactRankingRows(live.oracle?.observed),
      exactRankingRows(repeated.distinctOperationOracle?.expected),
      exactRankingRows(repeated.distinctOperationOracle?.observed),
      arrayIsArray(manifest.capabilities),
      manifest.capabilities?.length === 0,
      allArrayValues(
        manifest.exports,
        (entry) => hasExactKeys(entry, ['interface', 'name']),
      ),
      allArrayValues(
        alternative.topMovies,
        (row) => hasExactKeys(
          row,
          ['avgRating', 'movieId', 'ratingCount', 'score'],
        ),
      ),
    ],
    (condition) => condition === true,
  );
}

export {
  MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLES,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGE,
  MOVIELENS_PUBLIC_REQUEST_FAILURE_STAGES,
  canonicalMovielensPublicRequestFailureCauses,
  exactLiveSchemas,
  isMovielensPublicRequestLiveFailure,
  registerMovielensPublicRequestLiveFailure,
  safeOwnDataValue as safeMovielensFailureOwnDataValue,
};
