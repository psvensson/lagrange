import {
  BYTE_ENCODING,
  SHA256_PATTERN,
  allArrayValues,
  arrayIsArray,
  bufferByteLength,
  bufferFrom,
  canonicalDigest,
  digestHex,
  hasExactKeys,
  jsonParse,
  jsonStringify,
  mathTrunc,
  numberIsFinite,
  numberIsSafeInteger,
  objectCreate,
  objectFreeze,
  plainDataEqual,
  reflectApply,
  regexpMatches,
  sameStringMembers,
  sha256,
  snapshotPlainData,
  stringHasPrefix,
} from './evidence-exact-plain-data.js';
import {
  REQUEST_ACCEPT,
} from '../request-binding-deployment/run-request-binding-deployment.js';
import {
  exactLiveSchemas,
} from './movielens-public-request-evidence-schema.js';

const CANONICAL_DATASET_CARDINALITY = 100_000;
const CANONICAL_DATASET_DIGEST =
  'sha256:06416e597f82b7342361e41163890c81036900f418ad91315590814211dca490';
const CANONICAL_DATASET_SOURCE = 'MovieLens 100K u.data';
const CANONICAL_INPUT_ROWS = CANONICAL_DATASET_CARDINALITY + 1;
const CANONICAL_TOP_N = 10;
const MAXIMUM_DATASET_BYTES = 4 * 1_024 * 1_024;
const PUBLIC_BINDING = 'movielens-public-grouped-reduce';
const PUBLIC_METHOD = 'POST';
const PUBLIC_PATH = '/benchmarks/movielens/grouped-reduce';
const PUBLIC_PRINCIPAL = 'request-binding-example-user';
const PUBLIC_TENANT = 'request_binding_example';
const PUBLIC_RESPONSE_BODY = 'MovieLens grouped reduce completed';
const PUBLIC_RESPONSE_HEADER = 'x-lagrange-cell';
const PUBLIC_COMPONENT_SOURCE =
  'examples/service-data-affinity/' +
  'movielens-public-grouped-reduce-component.wat';
const PUBLIC_MANIFEST_REF =
  'registry.example.test/examples/' +
  'movielens-public-grouped-reduce:1.0.0';
const WORKLOAD_VERSION = 'movielens-public-request-workload-v1';
const ORACLE_VERSION = 'confidence-adjusted-top-ten-v1';
const ALTERNATIVE = 'postgresql-16-grouped-sql';
const DURABILITY_CONTRACT =
  'acknowledged_write_visible_after_completion';
const POSTGRES_REPOSITORY_DIGEST_PATTERN =
  /^postgres@sha256:[a-f0-9]{64}$/u;
const COMPLETED_JOURNAL_ERROR = '{}';
const COMPLETED_JOURNAL_RESULT = jsonStringify(jsonStringify({
  body: PUBLIC_RESPONSE_BODY,
  headers: [[PUBLIC_RESPONSE_HEADER, PUBLIC_BINDING]],
  status: 200,
}));
const MINIMUM_EPOCH_MILLISECONDS = 1_000_000_000_000;
const MAXIMUM_DATE_EPOCH_MILLISECONDS = 8_640_000_000_000_000;
const CANONICAL_JOURNAL_TIMESTAMP_PATTERN =
  /^(?:\d{4}|[+-]\d{6})-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const CanonicalDate = Date;
const dateGetTime = Date.prototype.getTime;
const dateToISOString = Date.prototype.toISOString;

function deriveBindingVersionId() {
  const bindingIdentity = objectCreate(null);
  bindingIdentity.bindingName = PUBLIC_BINDING;
  bindingIdentity.tenantId = PUBLIC_TENANT;
  const bindingId =
    `binding-${digestHex(canonicalDigest(bindingIdentity))}`;
  const versionIdentity = objectCreate(null);
  versionIdentity.bindingId = bindingId;
  versionIdentity.generation = 1;
  return `binding-version-${
    digestHex(canonicalDigest(versionIdentity))
  }`;
}

function conditionsHold(conditions) {
  return allArrayValues(conditions, (condition) => condition === true);
}

function validJournalTimestamp(value) {
  if (
    typeof value !== 'string' ||
    !regexpMatches(CANONICAL_JOURNAL_TIMESTAMP_PATTERN, value)
  ) {
    return false;
  }
  try {
    const date = new CanonicalDate(value);
    const timestamp = reflectApply(dateGetTime, date, []);
    return Boolean(
      numberIsFinite(timestamp) &&
      numberIsSafeInteger(timestamp) &&
      timestamp >= MINIMUM_EPOCH_MILLISECONDS &&
      timestamp <= MAXIMUM_DATE_EPOCH_MILLISECONDS &&
      reflectApply(dateToISOString, date, []) === value,
    );
  } catch {
    return false;
  }
}

function plainDigestOrEmpty(value) {
  try {
    return canonicalDigest(value);
  } catch {
    return '';
  }
}

function boundBindingDigestOrEmpty(deployment) {
  const bound = objectCreate(null);
  bound.budgets = deployment.binding.budgets;
  bound.capabilities = deployment.manifest.capabilities;
  bound.name = deployment.binding.name;
  bound.schema_version = deployment.binding.schema_version;
  bound.source = deployment.binding.source;
  bound.target = deployment.binding.target;
  return plainDigestOrEmpty(bound);
}

function deriveRequestWitness(entry, deployment, expectedOffset) {
  try {
    const entryKeys = [
      'bindingVersionId',
      'body',
      'idempotencyKey',
      'intentDigest',
      'invocationIdentity',
      'journalCommand',
      'journalOperationId',
      'method',
      'normalizedRequest',
      'path',
      'requestDigest',
      'routeServiceId',
      'tenantId',
    ];
    if (!hasExactKeys(entry, entryKeys)) return null;
    const entryValid = conditionsHold([
      entry.method === PUBLIC_METHOD,
      entry.path === PUBLIC_PATH,
      entry.tenantId === PUBLIC_TENANT,
      typeof entry.idempotencyKey === 'string',
      entry.idempotencyKey.length > 0,
      typeof entry.body === 'string',
      typeof entry.body === 'string' &&
        reflectApply(bufferByteLength, Buffer, [
          entry.body,
          BYTE_ENCODING,
        ]) <= 4_096,
    ]);
    if (!entryValid) return null;
    const body = snapshotPlainData(jsonParse(entry.body));
    const bodyKeys = [
      'datasetDigest',
      'resultKeyOffset',
      'workloadVersion',
    ];
    if (!hasExactKeys(body, bodyKeys)) return null;
    const bodyValid = conditionsHold([
      body.datasetDigest === CANONICAL_DATASET_DIGEST,
      body.resultKeyOffset === expectedOffset,
      body.workloadVersion === WORKLOAD_VERSION,
    ]);
    if (!bodyValid) return null;
    const normalized = entry.normalizedRequest;
    const normalizedKeys = ['body', 'headers', 'method', 'path', 'query'];
    if (!hasExactKeys(normalized, normalizedKeys)) return null;
    if (!hasExactKeys(
      normalized.headers,
      ['accept', 'content-type'],
    )) {
      return null;
    }
    const normalizedValid = conditionsHold([
      normalized.method === PUBLIC_METHOD,
      normalized.path === PUBLIC_PATH,
      plainDataEqual(normalized.body, body),
      normalized.headers.accept === REQUEST_ACCEPT,
      normalized.headers['content-type'] === 'application/json',
      hasExactKeys(normalized.query, []),
    ]);
    if (!normalizedValid) return null;
    const identityFields = objectCreate(null);
    identityFields.requestKey = entry.idempotencyKey;
    identityFields.tenantId = PUBLIC_TENANT;
    const invocationIdentity =
      `request-invocation-${digestHex(canonicalDigest(identityFields))}`;
    const requestDigest = canonicalDigest(normalized);
    const intentFields = objectCreate(null);
    intentFields.bindingVersionId =
      deployment.readyCell.bindingVersionId;
    intentFields.method = PUBLIC_METHOD;
    intentFields.path = PUBLIC_PATH;
    intentFields.requestDigest = requestDigest;
    intentFields.tenantId = PUBLIC_TENANT;
    const intentDigest = canonicalDigest(intentFields);
    const operationIdentity = [PUBLIC_TENANT, invocationIdentity];
    const journalOperationId =
      `request-cell-operation-${digestHex(
        canonicalDigest(operationIdentity),
      )}`;
    const routeServiceId = deployment.readyCell.serviceId;
    const journalCommand =
      `invoke:${routeServiceId}:${intentDigest}`;
    const bindingsValid = conditionsHold([
      entry.bindingVersionId ===
        deployment.readyCell.bindingVersionId,
      entry.routeServiceId === routeServiceId,
      entry.invocationIdentity === invocationIdentity,
      entry.requestDigest === requestDigest,
      entry.intentDigest === intentDigest,
      entry.journalOperationId === journalOperationId,
      entry.journalCommand === journalCommand,
    ]);
    if (!bindingsValid) return null;
    return {
      body,
      intentDigest,
      invocationIdentity,
      journalCommand,
      journalOperationId,
      requestDigest,
    };
  } catch {
    return null;
  }
}

function validateLiveObservation(live) {
  const failures = [];
  const witness = (condition, message) => {
    if (!condition) failures[failures.length] = message;
  };
  try {
    live = snapshotPlainData(live);
  } catch {
    failures[failures.length] =
      'live observation must be exact own plain data';
    return objectFreeze({
      failures: objectFreeze(failures),
      passed: false,
    });
  }

  if (!exactLiveSchemas(live)) {
    failures[failures.length] = 'live observation exact schema invalid';
    return objectFreeze({
      failures: objectFreeze(failures),
      passed: false,
    });
  }
  const {
    alternative,
    artifact,
    authentication,
    dataset,
    deployment,
    drainReceipt,
    durability,
    inputDurability,
    journalEvidence: journal,
    operationBoundary: operation,
    oracle,
    repeatedOperation: repeated,
    requestEvidence: requestWitnesses,
    responseEvidence,
    teardown,
    timeoutSemantics,
    workloadManifest,
  } = live;
  witness(
    conditionsHold([
      dataset.cardinality === CANONICAL_DATASET_CARDINALITY,
      dataset.digest === CANONICAL_DATASET_DIGEST,
      dataset.source === CANONICAL_DATASET_SOURCE,
      numberIsSafeInteger(dataset.sizeBytes),
      dataset.sizeBytes > 0,
      dataset.sizeBytes <= MAXIMUM_DATASET_BYTES,
    ]),
    'dataset identity/size witness invalid',
  );
  witness(
    conditionsHold([
      workloadManifest.version === WORKLOAD_VERSION,
      workloadManifest.alternative === ALTERNATIVE,
      workloadManifest.resultOracle === ORACLE_VERSION,
      workloadManifest.durability === DURABILITY_CONTRACT,
      workloadManifest.consistency ===
        'statement_reads_committed_state',
      workloadManifest.dataset.cardinality === dataset.cardinality,
      workloadManifest.dataset.digest === dataset.digest,
      workloadManifest.dataset.source === dataset.source,
      workloadManifest.operationBoundary.method === PUBLIC_METHOD,
      workloadManifest.operationBoundary.path === PUBLIC_PATH,
    ]),
    'workload manifest does not bind the canonical dataset',
  );

  witness(
    conditionsHold([
      oracle.passed === true,
      oracle.version === ORACLE_VERSION,
      arrayIsArray(oracle.expected),
      oracle.expected.length === CANONICAL_TOP_N,
      plainDataEqual(oracle.expected, oracle.observed),
      allArrayValues(
        oracle.expected,
        (row, index) =>
          conditionsHold([
            row.rank === index + 1,
            numberIsSafeInteger(row.movieId),
            row.movieId > 0,
            numberIsSafeInteger(row.scoreMicros),
            row.scoreMicros >= 0,
          ]),
      ),
    ]),
    'oracle expected/observed top-ten witness invalid',
  );
  witness(
    conditionsHold([
      repeated.distinctOperationOracle.passed === true,
      plainDataEqual(
        repeated.distinctOperationOracle.expected,
        oracle.expected,
      ),
      plainDataEqual(
        repeated.distinctOperationOracle.observed,
        oracle.observed,
      ),
    ]),
    'distinct operation oracle witness invalid',
  );
  witness(
    conditionsHold([
      durability.contract === DURABILITY_CONTRACT,
      durability.expected === CANONICAL_TOP_N * 2,
      durability.observed === CANONICAL_TOP_N * 2,
      durability.replayPreserved === true,
      durability.status === 'pass',
    ]),
    'durability and replay receipt invalid',
  );
  witness(
    conditionsHold([
      inputDurability.expected === CANONICAL_INPUT_ROWS,
      inputDurability.observed === CANONICAL_INPUT_ROWS,
    ]),
    'durable canonical input row count invalid',
  );

  witness(
    conditionsHold([
      operation.authenticatedHttp === true,
      operation.method === PUBLIC_METHOD,
      operation.path === PUBLIC_PATH,
      operation.status === 200,
      operation.componentHeader === PUBLIC_BINDING,
      operation.principal === PUBLIC_PRINCIPAL,
      operation.journalReplayPreserved === true,
      typeof operation.idempotencyKey === 'string',
      operation.idempotencyKey.length > 0,
      typeof operation.distinctIdempotencyKey === 'string',
      operation.distinctIdempotencyKey !== operation.idempotencyKey,
    ]),
    'public authenticated operation boundary invalid',
  );
  witness(
    conditionsHold([
      authentication.deniedStatus === 401,
      authentication.unauthenticatedInvoked === false,
      authentication.principal === PUBLIC_PRINCIPAL,
      authentication.durableInvocationJournalRowsAfterDenial === 0,
      authentication.durableResultRowsAfterDenial === 0,
      hasExactKeys(
        authentication.durableTableRowsAfterDenial,
        [
          'global.movielens_public_result_movies',
          'global.movielens_public_result_scores',
        ],
      ),
      authentication.durableTableRowsAfterDenial[
        'global.movielens_public_result_movies'
      ] === 0,
      authentication.durableTableRowsAfterDenial[
        'global.movielens_public_result_scores'
      ] === 0,
    ]),
    'unauthenticated denial/no-effect witness invalid',
  );

  witness(
    conditionsHold([
      typeof repeated.generation === 'string',
      repeated.generation.length > 0,
      repeated.distinctGeneration === repeated.generation,
      repeated.replayGeneration === repeated.generation,
      repeated.firstInvocationCount === 1,
      repeated.distinctInvocationCount === 2,
      repeated.replayInvocationCount === 2,
      repeated.sameGenerationDistinctOperationsEquivalent === true,
      repeated.firstOperationResultKeyOffset === 0,
      repeated.distinctOperationResultKeyOffset === CANONICAL_TOP_N,
      repeated.distinctDurableKeyRange.lowerInclusive === 11,
      repeated.distinctDurableKeyRange.upperInclusive === 20,
      repeated.semanticStatus === 'equivalent',
    ]),
    'same-generation component invocation counters invalid',
  );
  witness(
    conditionsHold([
      drainReceipt.inFlight === 0,
      drainReceipt.status === 'drained',
      timeoutSemantics === 'ambiguous_until_drain_verified',
    ]),
    'timeout/drain semantics witness invalid',
  );

  const firstRequest = deriveRequestWitness(
    requestWitnesses.first,
    deployment,
    0,
  );
  const distinctRequest = deriveRequestWitness(
    requestWitnesses.distinct,
    deployment,
    CANONICAL_TOP_N,
  );
  const replayRequest = deriveRequestWitness(
    requestWitnesses.replay,
    deployment,
    0,
  );
  witness(
    conditionsHold([
      firstRequest !== null,
      distinctRequest !== null,
      replayRequest !== null,
      plainDataEqual(requestWitnesses.first, requestWitnesses.replay),
      requestWitnesses.first.idempotencyKey === operation.idempotencyKey,
      requestWitnesses.distinct.idempotencyKey ===
        operation.distinctIdempotencyKey,
    ]),
    'exact signal-free public request bytes invalid',
  );

  const completedJournal = (row, request) => {
    const journalKeys = [
      'command',
      'created_at',
      'error',
      'idempotency_key',
      'operation_id',
      'result',
      'state',
      'tenant_id',
      'updated_at',
    ];
    if (request === null || !hasExactKeys(row, journalKeys)) return false;
    return conditionsHold([
      row.state === 'completed',
      row.tenant_id === PUBLIC_TENANT,
      row.operation_id === request.journalOperationId,
      row.idempotency_key === request.invocationIdentity,
      row.command === request.journalCommand,
      row.error === COMPLETED_JOURNAL_ERROR,
      row.result === COMPLETED_JOURNAL_RESULT,
      validJournalTimestamp(row.created_at),
      validJournalTimestamp(row.updated_at),
    ]);
  };
  witness(
    conditionsHold([
      completedJournal(journal.first, firstRequest),
      completedJournal(journal.distinct, distinctRequest),
      completedJournal(journal.replayBefore, replayRequest),
      completedJournal(journal.replayAfter, replayRequest),
      journal.first.operation_id !== journal.distinct.operation_id,
      journal.first.idempotency_key !== journal.distinct.idempotency_key,
      journal.first.command !== journal.distinct.command,
      plainDataEqual(journal.first, journal.replayBefore),
      plainDataEqual(journal.replayBefore, journal.replayAfter),
    ]),
    'completed invocation journal identity/replay witness invalid',
  );
  const validResponse = (response, requestWitness) => {
    const responseKeys = ['body', 'headers', 'requestWitness', 'status'];
    if (!hasExactKeys(response, responseKeys)) return false;
    if (!hasExactKeys(response.headers, [PUBLIC_RESPONSE_HEADER])) {
      return false;
    }
    return conditionsHold([
      response.status === 200,
      response.body === PUBLIC_RESPONSE_BODY,
      response.headers[PUBLIC_RESPONSE_HEADER] === PUBLIC_BINDING,
      plainDataEqual(response.requestWitness, requestWitness),
    ]);
  };
  witness(
    conditionsHold([
      validResponse(responseEvidence.first, requestWitnesses.first),
      validResponse(
        responseEvidence.distinct,
        requestWitnesses.distinct,
      ),
      validResponse(responseEvidence.replay, requestWitnesses.replay),
    ]),
    'public response/request binding witness invalid',
  );

  const querySql = alternative.querySql;
  witness(
    conditionsHold([
      alternative.engine === 'PostgreSQL 16',
      typeof alternative.postgresVersion === 'string',
      stringHasPrefix(alternative.postgresVersion, 'PostgreSQL 16.'),
      alternative.postgresVersionSql === 'SELECT version()',
    ]),
    'exact PostgreSQL version query witness invalid',
  );
  const measuredContainerImages =
    alternative.measuredContainerImages;
  const measuredContainerIds = [];
  if (arrayIsArray(measuredContainerImages)) {
    for (let index = 0;
      index < measuredContainerImages.length;
      index += 1) {
      measuredContainerIds[measuredContainerIds.length] =
        measuredContainerImages[index].containerId;
    }
  }
  witness(
    conditionsHold([
      typeof alternative.imageId === 'string',
      regexpMatches(SHA256_PATTERN, alternative.imageId),
      hasExactKeys(alternative.imageInspection, [
        'id',
        'repoDigests',
      ]),
      alternative.imageInspection.id === alternative.imageId,
      arrayIsArray(alternative.imageRepoDigests),
      alternative.imageRepoDigests.length > 0,
      allArrayValues(
        alternative.imageRepoDigests,
        (digest) =>
          typeof digest === 'string' &&
          regexpMatches(POSTGRES_REPOSITORY_DIGEST_PATTERN, digest),
      ),
      sameStringMembers(
        alternative.imageRepoDigests,
        alternative.imageInspection.repoDigests,
      ),
      arrayIsArray(measuredContainerImages),
      measuredContainerImages.length === 3,
      allArrayValues(
        measuredContainerImages,
        (container) =>
          conditionsHold([
            hasExactKeys(container, ['containerId', 'inspectImage']),
            typeof container.containerId === 'string',
            container.containerId.length > 0,
            container.inspectImage === alternative.imageInspection.id,
          ]),
      ),
      hasExactKeys(
        alternative.postgresLogDigests,
        measuredContainerIds,
      ),
      allArrayValues(
        measuredContainerImages,
        (container) => {
          const digest =
            alternative.postgresLogDigests[container.containerId];
          return typeof digest === 'string' &&
            regexpMatches(SHA256_PATTERN, digest);
        },
      ),
      sameStringMembers(
        measuredContainerIds,
        teardown.postgres.removedContainerIds,
      ),
    ]),
    'immutable PostgreSQL image witness invalid',
  );
  witness(
    conditionsHold([
      alternative.inputDigest === dataset.digest,
      alternative.inputSizeBytes === dataset.sizeBytes,
      alternative.totalRows === CANONICAL_DATASET_CARDINALITY,
      alternative.returnedAggregateRows === CANONICAL_TOP_N,
      alternative.replicationFactor === 3,
      alternative.replicationState.ready === true,
      alternative.replicationState.replicaCount === 2,
    ]),
    'PostgreSQL input/cardinality/RF3 witness invalid',
  );
  witness(
    conditionsHold([
      typeof querySql === 'string',
      regexpMatches(
        /AVG\s*\(\s*rating\s*\)\s+AS\s+avg_rating/iu,
        querySql,
      ),
      regexpMatches(
        /COUNT\s*\(\s*\*\s*\)\s+AS\s+rating_count/iu,
        querySql,
      ),
      regexpMatches(
        /SUM\s*\(\s*rating\s*\)\s+AS\s+rating_sum/iu,
        querySql,
      ),
      regexpMatches(
        /\(\s*rating_sum\s*\+\s*87\.5\s*\)\s*\/\s*\(\s*rating_count\s*\+\s*25\s*\)/iu,
        querySql,
      ),
      regexpMatches(
        /0\.5\s*\/\s*SQRT\s*\(\s*rating_count\s*\)/iu,
        querySql,
      ),
      regexpMatches(
        /ORDER\s+BY\s+score\s+DESC\s*,\s*movie_id\s+ASC/iu,
        querySql,
      ),
      regexpMatches(/LIMIT\s+10/iu, querySql),
    ]),
    'PostgreSQL grouped confidence ranking SQL invalid',
  );
  witness(
    conditionsHold([
      arrayIsArray(alternative.topMovies),
      alternative.topMovies.length === CANONICAL_TOP_N,
      allArrayValues(
        alternative.topMovies,
        (row, index) =>
          conditionsHold([
            row.movieId === oracle.expected[index].movieId,
            mathTrunc(row.score * 1_000_000) ===
              oracle.expected[index].scoreMicros,
            numberIsFinite(row.avgRating),
            numberIsSafeInteger(row.ratingCount),
            row.ratingCount > 0,
          ]),
      ),
    ]),
    'PostgreSQL top-ten SQL rows do not bind the oracle',
  );

  witness(
    conditionsHold([
      deployment.manifest.runtime.kind === 'wasm_component',
      deployment.manifest.name === PUBLIC_BINDING,
      deployment.manifest.schema_version === 3,
      deployment.manifest.version === '1.0.0',
      deployment.manifest.artifact.media_type === 'application/wasm',
      deployment.manifest.artifact.ref === PUBLIC_MANIFEST_REF,
      deployment.manifest.artifact.type === 'oci',
      numberIsSafeInteger(deployment.manifest.artifact.size_bytes),
      deployment.manifest.artifact.size_bytes > 0,
      arrayIsArray(deployment.manifest.exports),
      deployment.manifest.exports.length === 1,
      deployment.manifest.exports[0].name === 'run',
      deployment.manifest.exports[0].interface === 'request_v1',
      deployment.binding.name === PUBLIC_BINDING,
      deployment.binding.schema_version === 2,
      deployment.binding.budgets.context_bytes === 16_777_216,
      deployment.binding.budgets.cpu_time_ms === 60_000,
      deployment.binding.budgets.input_bytes === 4_096,
      deployment.binding.budgets.memory_bytes === 67_108_864,
      deployment.binding.budgets.output_bytes === 4_096,
      deployment.binding.budgets.wall_time_ms === 60_000,
      deployment.binding.source.kind === 'request',
      deployment.binding.source.method === PUBLIC_METHOD,
      deployment.binding.source.path === PUBLIC_PATH,
      deployment.binding.target.export_name === 'run',
      deployment.binding.target.package_id === deployment.packageId,
      deployment.binding.target.manifest_digest ===
        deployment.bindingReceipt.manifest_digest,
      deployment.binding.target.manifest_digest ===
        plainDigestOrEmpty(deployment.manifest),
      deployment.readyCell.method === PUBLIC_METHOD,
      deployment.readyCell.path === PUBLIC_PATH,
      deployment.readyCell.tenantId === PUBLIC_TENANT,
      typeof deployment.readyCell.bindingDigest === 'string',
      regexpMatches(
        SHA256_PATTERN,
        deployment.readyCell.bindingDigest,
      ),
      deployment.readyCell.bindingDigest ===
        boundBindingDigestOrEmpty(deployment),
      typeof deployment.readyCell.bindingVersionId === 'string',
      deployment.readyCell.bindingVersionId === deriveBindingVersionId(),
      typeof deployment.readyCell.serviceId === 'string',
      deployment.readyCell.serviceId ===
        `binding-service-${digestHex(sha256(bufferFrom(
          deployment.readyCell.bindingVersionId,
          BYTE_ENCODING,
        )))}`,
      typeof deployment.packageId === 'string',
      deployment.packageId.length > 0,
      deployment.binding.target.package_id === deployment.packageId,
      typeof deployment.readyCell.replicaId === 'string',
      deployment.readyCell.replicaId.length > 0,
      deployment.readyCell.nodeId === deployment.readyCell.targetNodeId,
      deployment.readyCell.targetAddress ===
        `${deployment.readyCell.nodeId}/service/runtime-service-handler`,
    ]),
    'WASM Component manifest/binding/ready-cell witness invalid',
  );
  witness(
    conditionsHold([
      typeof artifact.buildInputFingerprint === 'string',
      regexpMatches(
        SHA256_PATTERN,
        artifact.buildInputFingerprint,
      ),
      typeof artifact.executableDigest === 'string',
      regexpMatches(SHA256_PATTERN, artifact.executableDigest),
      artifact.executableDigest === artifact.ociPayloadDigest,
      typeof artifact.ociManifestDigest === 'string',
      regexpMatches(
        SHA256_PATTERN,
        artifact.ociManifestDigest,
      ),
      artifact.ociManifestDigest === deployment.manifest.artifact.digest,
      artifact.componentSource === PUBLIC_COMPONENT_SOURCE,
    ]),
    'executable/OCI artifact identity witness invalid',
  );
  witness(
    conditionsHold([
      alternative.cleanupReceipt.containersAbsent === true,
      alternative.cleanupReceipt.networkAbsent === true,
      plainDataEqual(
        alternative.cleanupReceipt,
        teardown.postgres,
      ),
      teardown.cellAbsent === true,
      teardown.nodeStopped === true,
      teardown.temporaryDirectoryAbsent === true,
      teardown.postgres.containersAbsent === true,
      teardown.postgres.networkAbsent === true,
      typeof teardown.postgres.networkName === 'string',
      teardown.postgres.networkName.length > 0,
      teardown.replicaId === deployment.readyCell.replicaId,
      arrayIsArray(teardown.postgres.removedContainerIds),
      teardown.postgres.removedContainerIds.length === 3,
    ]),
    'post-cleanup cell/node/temp/container/network absence invalid',
  );
  return objectFreeze({
    failures: objectFreeze(failures),
    passed: failures.length === 0,
  });
}

export {
  validateLiveObservation,
};
