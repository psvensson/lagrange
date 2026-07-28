import {types} from 'node:util';
import {
  appendOwnArrayValue,
  digestBenchmarkSemanticData,
} from './benchmark-semantic-integrity.js';
import {
  createBenchmarkResourceComponentInventory,
} from './benchmark-resource-accounting.js';
import {
  createBenchmarkResourcePriceSheet,
} from './benchmark-resource-cost-and-effects.js';
import {
  assertBenchmarkResourceArray,
  assertBenchmarkResourceBytes,
  assertBenchmarkResourceCanonicalData,
  assertBenchmarkResourceDigest,
  assertBenchmarkResourceExactRecord,
  assertBenchmarkResourceInteger,
  assertBenchmarkResourceText,
  createBenchmarkResourceMemoryResolver,
  parseBenchmarkResourceArtifact,
} from './benchmark-resource-evidence-data.js';
import {
  createBenchmarkResourceEvidenceRoot,
  createBenchmarkResourceNonMeasuringCellEvidence,
  createBenchmarkResourceSourceArtifact,
  validateBenchmarkResourceEvidenceRoot,
} from './benchmark-resource-evidence-root.js';
import {
  createBenchmarkResourceMatrixManifest,
} from './benchmark-resource-matrix-manifest.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_CELL_STATE,
} from './benchmark-resource-contract-constants.js';
import {
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_AXES,
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_CELLS,
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_DISPOSITION,
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_PUBLIC_METHOD,
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_PUBLIC_PATH,
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_REASON,
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_RUNTIME,
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_SCENARIO,
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_TOP_N,
} from './comparative-efficiency-movielens-grouped-reduce-constants.js';

export {
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_AXES,
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_CELLS,
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_REASON,
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_SCENARIO,
} from './comparative-efficiency-movielens-grouped-reduce-constants.js';

const inputKeys = Object.freeze([
  'matrixId',
  'pairId',
  'sideIds',
  'sourceRevision',
  'producedAt',
  'validUntil',
  'inventoryId',
  'inventorySides',
  'priceSheet',
  'attempts',
]);
const attemptKeys = Object.freeze([
  'matrixCellIndex',
  'runId',
  'candidateEngaged',
  'alternativeEngaged',
  'reasonCodes',
  'liveEvidence',
]);
const liveEvidenceKeys = Object.freeze([
  'version',
  'matrixCellIndex',
  'dimensions',
  'dataset',
  'operation',
  'runtime',
  'oracle',
  'alternative',
  'teardown',
  'content',
]);
const dimensionKeys =
  Object.freeze(['datasetSize', 'skew', 'topology']);
const datasetKeys = Object.freeze([
  'cardinality',
  'digest',
  'sizeBytes',
  'source',
  'skew',
]);
const operationKeys = Object.freeze([
  'authenticatedHttp',
  'method',
  'path',
  'principal',
  'status',
]);
const runtimeKeys = Object.freeze([
  'bindingName',
  'bindingVersionId',
  'componentSourceDigest',
  'executableDigest',
  'kind',
  'packageId',
]);
const oracleKeys = Object.freeze([
  'expectedDigest',
  'observedDigest',
  'passed',
  'rankCount',
]);
const alternativeKeys = Object.freeze([
  'engine',
  'imageId',
  'inputDigest',
  'postgresVersion',
  'postgresVersionSql',
  'querySqlDigest',
  'replicaCount',
  'replicationFactor',
  'replicationReady',
  'returnedAggregateRows',
  'totalRows',
]);
const teardownKeys = Object.freeze([
  'cellAbsent',
  'nodeStopped',
  'postgresContainersAbsent',
  'postgresNetworkAbsent',
  'removedPostgresContainerCount',
  'temporaryDirectoryAbsent',
]);
const contentKeys = Object.freeze([
  'artifacts',
  'indexDigest',
  'replayPassed',
  'validationPassed',
]);
const descriptorKeys = Object.freeze([
  'byteLength',
  'digest',
  'mediaType',
  'name',
  'path',
]);
const semanticPayloadKeys = Object.freeze([
  'version',
  'matrixId',
  'cellId',
  'pairId',
  'runId',
  'sideIds',
  'matrixCellIndex',
  'liveEvidence',
]);
const engagementPayloadKeys = Object.freeze([
  'version',
  'matrixId',
  'cellId',
  'pairId',
  'runId',
  'sideIds',
  'matrixCellIndex',
  'state',
  'candidateEngaged',
  'alternativeEngaged',
  'reasonCodes',
  'semanticReceiptDigest',
  'workloadManifestDigest',
  'alternativeTopologyDigest',
  'preregistrationDigest',
]);
const receiptKeys = Object.freeze(['rootDigest', 'resolver']);
const resolverKeys = Object.freeze(['resolve']);
const CONTENT_NAMES = Object.freeze([
  'movielens-input-bytes',
  'movielens-component-executable',
  'movielens-component-source',
  'raw-live-observation',
  'postgres-logs',
  'source-state',
  'evidence-index',
]);
const workloadManifestPayload = Object.freeze({
  version: 'comparative-movielens-grouped-reduce-workload-v1',
  scenario: COMPARATIVE_MOVIELENS_GROUPED_REDUCE_SCENARIO,
  operationBoundary: Object.freeze({
    authenticated: true,
    method: COMPARATIVE_MOVIELENS_GROUPED_REDUCE_PUBLIC_METHOD,
    path: COMPARATIVE_MOVIELENS_GROUPED_REDUCE_PUBLIC_PATH,
  }),
  selectionPolicy: 'complete_cartesian_matrix',
  semantics: 'confidence_adjusted_top_ten_with_durable_replay',
});
const alternativeTopologyPayload = Object.freeze({
  version: 'comparative-movielens-grouped-reduce-topology-v1',
  candidate: Object.freeze({
    architectureId: 'lagrange',
    capacityAdapterEngaged: false,
    publicRuntime: COMPARATIVE_MOVIELENS_GROUPED_REDUCE_RUNTIME,
  }),
  alternative: Object.freeze({
    architectureId: 'postgresql',
    engine: 'PostgreSQL 16',
    topologyAxis: Object.freeze({
      single_replica: 1,
      replicated: 3,
    }),
  }),
});
const preregistrationPayload = Object.freeze({
  version: 'comparative-movielens-grouped-reduce-preregistration-v1',
  axes: COMPARATIVE_MOVIELENS_GROUPED_REDUCE_AXES,
  outcomePolicy: 'direction_neutral',
  invalidCellPolicy: 'publish_explicit_non_measuring',
  candidateCapacityEngagementRequired: true,
  requiredEvidence: Object.freeze([
    'public_path_semantic_oracle',
    'paired_capacity',
    'whole_topology_resource_windows',
    'capacity_uncertainty',
    'capacity_practical_effect',
    'cost_practical_effect',
  ]),
});
const semanticVersion =
  'comparative-movielens-grouped-reduce-semantic-receipt-v1';
const engagementVersion =
  'comparative-movielens-grouped-reduce-live-engagement-v1';
const liveEvidenceVersion =
  'comparative-movielens-grouped-reduce-live-evidence-v1';
const POSTGRESQL_ENGINE = 'PostgreSQL 16';
const POSTGRESQL_VERSION_SQL = 'SELECT version()';
const HTTP_STATUS_OK = 200;
const maximumReasonCodes = 16;
const contentIndexPosition = CONTENT_NAMES.length - 1;
const dataValueKey = 'value';
const bufferFrom = Buffer.from;
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const reflectApply = Reflect.apply;
const localText = Object.freeze({
  INPUT: 'movielensGroupedReduce',
  ATTEMPTS: 'movielensGroupedReduce.attempts',
  ATTEMPTS_EXACT_MATRIX_REQUIRED:
    'movielensGroupedReduce.attempts:exact_matrix_required',
  CELLS_EXACT_MATRIX_REQUIRED:
    'movielensGroupedReduce.cells:exact_matrix_required',
  CELL_EXPLICIT_NON_MEASURING_REQUIRED:
    'movielensGroupedReduce.cell:explicit_non_measuring_required',
  CELL_LIVE_ENGAGEMENT_REQUIRED:
    'movielensGroupedReduce.cell:live_engagement_required',
  CELL_SEMANTIC_RECEIPT_REQUIRED:
    'movielensGroupedReduce.cell:semantic_receipt_required',
  CELL_SOURCE_ABSENT: 'movielensGroupedReduce.cell:source_absent',
  ENGAGEMENT: 'movielensGroupedReduce.engagement',
  ENGAGEMENT_JOIN_MISMATCH:
    'movielensGroupedReduce.engagement:join_mismatch',
  MATRIX_EXACT_AXES_REQUIRED:
    'movielensGroupedReduce.matrix:exact_cartesian_axes_required',
  PREREGISTRATION: 'movielensGroupedReduce.preregistration',
  ROOT: 'movielensGroupedReduce.root',
  ROOT_INVALID: 'movielensGroupedReduce.root:invalid',
  ROOT_RESOLVER: 'movielensGroupedReduce.root.resolver',
  ROOT_RESOLVER_FUNCTION_REQUIRED:
    'movielensGroupedReduce.root.resolver:function_required',
  SEMANTIC: 'movielensGroupedReduce.semantic',
  SEMANTIC_JOIN_MISMATCH:
    'movielensGroupedReduce.semantic:join_mismatch',
  SIDE_IDS: 'movielensGroupedReduce.sideIds',
  SIDE_IDS_DISTINCT_PAIR_REQUIRED:
    'movielensGroupedReduce.sideIds:distinct_exact_pair_required',
  TOPOLOGY: 'movielensGroupedReduce.topology',
  VALID: 'valid',
  WORKLOAD: 'movielensGroupedReduce.workload',
});

function fail(message) {
  throw new TypeError(message);
}

function ownDataValue(value, key, path) {
  const descriptor = objectGetOwnPropertyDescriptor(value, key);
  if (!descriptor || !objectHasOwn(descriptor, dataValueKey)) {
    fail(`${path}:own_data_property_required`);
  }
  return descriptor.value;
}

function safeErrorMessage(error) {
  if (!error || typeof error !== 'object' || types.isProxy(error)) {
    return localText.ROOT_INVALID;
  }
  const descriptor = objectGetOwnPropertyDescriptor(error, 'message');
  if (
    descriptor &&
    objectHasOwn(descriptor, dataValueKey) &&
    typeof descriptor.value === 'string'
  ) {
    return descriptor.value;
  }
  return localText.ROOT_INVALID;
}

function arrayContains(values, expected) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === expected) return true;
  }
  return false;
}

function requireBoolean(value, expected, path) {
  if (value !== expected) fail(`${path}:${expected}_required`);
}

function copySideIds(sideIds) {
  assertBenchmarkResourceArray(sideIds, localText.SIDE_IDS, 2);
  if (sideIds.length !== 2 || sideIds[0] === sideIds[1]) {
    fail(localText.SIDE_IDS_DISTINCT_PAIR_REQUIRED);
  }
  const copy = [];
  for (let index = 0; index < sideIds.length; index += 1) {
    assertBenchmarkResourceText(
      sideIds[index],
      `movielensGroupedReduce.sideIds.${index}`,
    );
    appendOwnArrayValue(copy, sideIds[index]);
  }
  return copy;
}

function requireDimensions(dimensions, expected, path) {
  assertBenchmarkResourceExactRecord(dimensions, dimensionKeys, path);
  if (
    dimensions.datasetSize !== expected.datasetSize ||
    dimensions.skew !== expected.skew ||
    dimensions.topology !== expected.topology
  ) {
    fail(`${path}:matrix_cell_mismatch`);
  }
}

function requireDescriptor(descriptor, expectedName, path) {
  assertBenchmarkResourceExactRecord(descriptor, descriptorKeys, path);
  assertBenchmarkResourceInteger(descriptor.byteLength, `${path}.byteLength`);
  assertBenchmarkResourceDigest(descriptor.digest, `${path}.digest`);
  assertBenchmarkResourceText(descriptor.mediaType, `${path}.mediaType`);
  assertBenchmarkResourceText(descriptor.name, `${path}.name`);
  assertBenchmarkResourceText(descriptor.path, `${path}.path`);
  if (descriptor.name !== expectedName) {
    fail(`${path}:name_mismatch`);
  }
}

function requireContent(content, dataset, runtime, path) {
  assertBenchmarkResourceExactRecord(content, contentKeys, path);
  assertBenchmarkResourceArray(
    content.artifacts,
    `${path}.artifacts`,
    CONTENT_NAMES.length,
  );
  if (content.artifacts.length !== CONTENT_NAMES.length) {
    fail(`${path}.artifacts:exact_terminal_set_required`);
  }
  for (let index = 0; index < CONTENT_NAMES.length; index += 1) {
    requireDescriptor(
      content.artifacts[index],
      CONTENT_NAMES[index],
      `${path}.artifacts.${index}`,
    );
  }
  if (
    content.artifacts[0].digest !== dataset.digest ||
    content.artifacts[0].byteLength !== dataset.sizeBytes ||
    content.artifacts[1].digest !== runtime.executableDigest ||
    content.artifacts[2].digest !== runtime.componentSourceDigest ||
    content.artifacts[contentIndexPosition].digest !== content.indexDigest
  ) {
    fail(`${path}:descriptor_binding_mismatch`);
  }
  assertBenchmarkResourceDigest(content.indexDigest, `${path}.indexDigest`);
  requireBoolean(content.validationPassed, true, `${path}.validationPassed`);
  requireBoolean(content.replayPassed, true, `${path}.replayPassed`);
}

function requireDataset(dataset, expected, path) {
  assertBenchmarkResourceExactRecord(dataset, datasetKeys, path);
  assertBenchmarkResourceInteger(
    dataset.cardinality,
    `${path}.cardinality`,
  );
  assertBenchmarkResourceInteger(dataset.sizeBytes, `${path}.sizeBytes`);
  assertBenchmarkResourceDigest(dataset.digest, `${path}.digest`);
  assertBenchmarkResourceText(dataset.source, `${path}.source`);
  if (
    dataset.cardinality !== expected.datasetSize ||
    dataset.skew !== expected.skew ||
    dataset.sizeBytes === 0
  ) {
    fail(`${path}:identity_mismatch`);
  }
}

function requireOperation(operation, path) {
  assertBenchmarkResourceExactRecord(operation, operationKeys, path);
  requireBoolean(
    operation.authenticatedHttp,
    true,
    `${path}.authenticatedHttp`,
  );
  assertBenchmarkResourceText(operation.principal, `${path}.principal`);
  if (
    operation.method !==
      COMPARATIVE_MOVIELENS_GROUPED_REDUCE_PUBLIC_METHOD ||
    operation.path !==
      COMPARATIVE_MOVIELENS_GROUPED_REDUCE_PUBLIC_PATH ||
    operation.status !== HTTP_STATUS_OK
  ) {
    fail(`${path}:public_boundary_mismatch`);
  }
}

function requireRuntime(runtime, path) {
  assertBenchmarkResourceExactRecord(runtime, runtimeKeys, path);
  const runtimeTextFields = ['bindingName', 'bindingVersionId', 'packageId'];
  for (let fieldIndex = 0;
    fieldIndex < runtimeTextFields.length;
    fieldIndex += 1) {
    const field = runtimeTextFields[fieldIndex];
    assertBenchmarkResourceText(runtime[field], `${path}.${field}`);
  }
  assertBenchmarkResourceDigest(
    runtime.componentSourceDigest,
    `${path}.componentSourceDigest`,
  );
  assertBenchmarkResourceDigest(
    runtime.executableDigest,
    `${path}.executableDigest`,
  );
  if (runtime.kind !== COMPARATIVE_MOVIELENS_GROUPED_REDUCE_RUNTIME) {
    fail(`${path}:kind_mismatch`);
  }
}

function requireOracle(oracle, path) {
  assertBenchmarkResourceExactRecord(oracle, oracleKeys, path);
  assertBenchmarkResourceDigest(
    oracle.expectedDigest,
    `${path}.expectedDigest`,
  );
  assertBenchmarkResourceDigest(
    oracle.observedDigest,
    `${path}.observedDigest`,
  );
  if (
    oracle.passed !== true ||
    oracle.rankCount !==
      COMPARATIVE_MOVIELENS_GROUPED_REDUCE_TOP_N ||
    oracle.expectedDigest !== oracle.observedDigest
  ) {
    fail(`${path}:exact_top_ten_required`);
  }
}

function requireAlternative(alternative, dataset, expected, path) {
  assertBenchmarkResourceExactRecord(alternative, alternativeKeys, path);
  const alternativeTextFields = [
    'engine',
    'postgresVersion',
    'postgresVersionSql',
  ];
  for (let fieldIndex = 0;
    fieldIndex < alternativeTextFields.length;
    fieldIndex += 1) {
    const field = alternativeTextFields[fieldIndex];
    assertBenchmarkResourceText(alternative[field], `${path}.${field}`);
  }
  assertBenchmarkResourceDigest(
    alternative.imageId,
    `${path}.imageId`,
  );
  assertBenchmarkResourceDigest(
    alternative.inputDigest,
    `${path}.inputDigest`,
  );
  assertBenchmarkResourceDigest(
    alternative.querySqlDigest,
    `${path}.querySqlDigest`,
  );
  if (
    alternative.engine !== POSTGRESQL_ENGINE ||
    alternative.postgresVersionSql !== POSTGRESQL_VERSION_SQL ||
    alternative.inputDigest !== dataset.digest ||
    alternative.replicationFactor !== expected.replicationFactor ||
    alternative.replicationReady !== true ||
    alternative.replicaCount !== expected.replicationFactor - 1 ||
    alternative.returnedAggregateRows !==
      COMPARATIVE_MOVIELENS_GROUPED_REDUCE_TOP_N ||
    alternative.totalRows !== expected.datasetSize
  ) {
    fail(`${path}:topology_or_input_mismatch`);
  }
}

function requireTeardown(teardown, expected, path) {
  assertBenchmarkResourceExactRecord(teardown, teardownKeys, path);
  const teardownBooleans = [
    'cellAbsent',
    'nodeStopped',
    'postgresContainersAbsent',
    'postgresNetworkAbsent',
    'temporaryDirectoryAbsent',
  ];
  for (let fieldIndex = 0;
    fieldIndex < teardownBooleans.length;
    fieldIndex += 1) {
    const field = teardownBooleans[fieldIndex];
    requireBoolean(teardown[field], true, `${path}.${field}`);
  }
  if (
    teardown.removedPostgresContainerCount !==
      expected.replicationFactor
  ) {
    fail(`${path}:postgres_topology_mismatch`);
  }
}

function requireLiveEvidence(live, index) {
  const path = `movielensGroupedReduce.attempts.${index}.liveEvidence`;
  const expected = COMPARATIVE_MOVIELENS_GROUPED_REDUCE_CELLS[index];
  assertBenchmarkResourceExactRecord(live, liveEvidenceKeys, path);
  assertBenchmarkResourceCanonicalData(live);
  if (
    live.version !== liveEvidenceVersion ||
    live.matrixCellIndex !== index
  ) {
    fail(`${path}:identity_mismatch`);
  }
  requireDimensions(live.dimensions, expected, `${path}.dimensions`);
  requireDataset(live.dataset, expected, `${path}.dataset`);
  requireOperation(live.operation, `${path}.operation`);
  requireRuntime(live.runtime, `${path}.runtime`);
  requireOracle(live.oracle, `${path}.oracle`);
  requireAlternative(
    live.alternative,
    live.dataset,
    expected,
    `${path}.alternative`,
  );
  requireTeardown(live.teardown, expected, `${path}.teardown`);
  requireContent(live.content, live.dataset, live.runtime, `${path}.content`);
}

function copyReasonCodes(reasonCodes, index) {
  const path = `movielensGroupedReduce.attempts.${index}.reasonCodes`;
  assertBenchmarkResourceArray(reasonCodes, path, maximumReasonCodes);
  if (
    reasonCodes.length === 0 ||
    !arrayContains(
      reasonCodes,
      COMPARATIVE_MOVIELENS_GROUPED_REDUCE_REASON,
    )
  ) {
    fail(`${path}:candidate_absence_reason_required`);
  }
  const copy = [];
  for (let reasonIndex = 0;
    reasonIndex < reasonCodes.length;
    reasonIndex += 1) {
    assertBenchmarkResourceText(
      reasonCodes[reasonIndex],
      `${path}.${reasonIndex}`,
    );
    appendOwnArrayValue(copy, reasonCodes[reasonIndex]);
  }
  return copy;
}

function copyAttempts(attempts) {
  assertBenchmarkResourceArray(
    attempts,
    localText.ATTEMPTS,
    COMPARATIVE_MOVIELENS_GROUPED_REDUCE_CELLS.length,
  );
  if (
    attempts.length !==
      COMPARATIVE_MOVIELENS_GROUPED_REDUCE_CELLS.length
  ) {
    fail(localText.ATTEMPTS_EXACT_MATRIX_REQUIRED);
  }
  const copy = [];
  for (let index = 0; index < attempts.length; index += 1) {
    const path = `movielensGroupedReduce.attempts.${index}`;
    const attempt = attempts[index];
    assertBenchmarkResourceExactRecord(attempt, attemptKeys, path);
    if (attempt.matrixCellIndex !== index) {
      fail(`${path}:matrix_cell_order_mismatch`);
    }
    assertBenchmarkResourceText(attempt.runId, `${path}.runId`);
    requireBoolean(
      attempt.candidateEngaged,
      false,
      `${path}.candidateEngaged`,
    );
    requireBoolean(
      attempt.alternativeEngaged,
      true,
      `${path}.alternativeEngaged`,
    );
    requireLiveEvidence(attempt.liveEvidence, index);
    appendOwnArrayValue(copy, {
      matrixCellIndex: index,
      runId: attempt.runId,
      candidateEngaged: false,
      alternativeEngaged: true,
      reasonCodes: copyReasonCodes(attempt.reasonCodes, index),
      liveEvidence: attempt.liveEvidence,
    });
  }
  return copy;
}

function rootReceipt(artifacts, root) {
  const resolvedArtifacts = [];
  for (let index = 0; index < artifacts.length; index += 1) {
    appendOwnArrayValue(resolvedArtifacts, artifacts[index]);
  }
  appendOwnArrayValue(resolvedArtifacts, root);
  return {
    rootDigest: root.digest,
    resolver: createBenchmarkResourceMemoryResolver(resolvedArtifacts),
  };
}

export function createComparativeMovielensGroupedReduceEvidence(input) {
  assertBenchmarkResourceExactRecord(
    input,
    inputKeys,
    localText.INPUT,
  );
  const textFields = [
    'matrixId',
    'pairId',
    'sourceRevision',
    'producedAt',
    'validUntil',
    'inventoryId',
  ];
  for (let index = 0; index < textFields.length; index += 1) {
    const field = textFields[index];
    assertBenchmarkResourceText(
      input[field],
      `movielensGroupedReduce.${field}`,
    );
  }
  const sideIds = copySideIds(input.sideIds);
  const attempts = copyAttempts(input.attempts);
  const workloadManifest = createBenchmarkResourceSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.WORKLOAD_MANIFEST,
    workloadManifestPayload,
  );
  const alternativeTopology = createBenchmarkResourceSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.ALTERNATIVE_TOPOLOGY,
    alternativeTopologyPayload,
  );
  const preregistration = createBenchmarkResourceSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.PREREGISTRATION,
    preregistrationPayload,
  );
  const matrix = createBenchmarkResourceMatrixManifest({
    matrixId: input.matrixId,
    axes: COMPARATIVE_MOVIELENS_GROUPED_REDUCE_AXES,
    sideIds,
    workloadManifestDigest: workloadManifest.digest,
    alternativeTopologyDigest: alternativeTopology.digest,
    preregistrationDigest: preregistration.digest,
    profileEnvelopeDigest: null,
  });
  const inventory = createBenchmarkResourceComponentInventory({
    inventoryId: input.inventoryId,
    matrixId: input.matrixId,
    sides: input.inventorySides,
  });
  const price = createBenchmarkResourcePriceSheet(input.priceSheet);
  const semantics = [];
  const engagements = [];
  const cells = [];
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    const matrixCell = matrix.artifact.payload.cells[index];
    const semantic = createBenchmarkResourceSourceArtifact(
      BENCHMARK_RESOURCE_ARTIFACT_KIND.SEMANTIC_RECEIPT,
      {
        version: semanticVersion,
        matrixId: input.matrixId,
        cellId: matrixCell.cellId,
        pairId: input.pairId,
        runId: attempt.runId,
        sideIds,
        matrixCellIndex: index,
        liveEvidence: attempt.liveEvidence,
      },
      [
        workloadManifest.digest,
        alternativeTopology.digest,
        preregistration.digest,
      ],
    );
    const engagement = createBenchmarkResourceSourceArtifact(
      BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_ENGAGEMENT,
      {
        version: engagementVersion,
        matrixId: input.matrixId,
        cellId: matrixCell.cellId,
        pairId: input.pairId,
        runId: attempt.runId,
        sideIds,
        matrixCellIndex: index,
        state: BENCHMARK_RESOURCE_CELL_STATE.NON_MEASURING,
        candidateEngaged: false,
        alternativeEngaged: true,
        reasonCodes: attempt.reasonCodes,
        semanticReceiptDigest: semantic.digest,
        workloadManifestDigest: workloadManifest.digest,
        alternativeTopologyDigest: alternativeTopology.digest,
        preregistrationDigest: preregistration.digest,
      },
      [
        semantic.digest,
        workloadManifest.digest,
        alternativeTopology.digest,
        preregistration.digest,
      ],
    );
    appendOwnArrayValue(semantics, semantic);
    appendOwnArrayValue(engagements, engagement);
    appendOwnArrayValue(
      cells,
      createBenchmarkResourceNonMeasuringCellEvidence({
        matrixManifestDigest: matrix.digest,
        matrixId: input.matrixId,
        cellId: matrixCell.cellId,
        pairId: input.pairId,
        runId: attempt.runId,
        sideIds,
        reasonCodes: attempt.reasonCodes,
        sourceDigests: [semantic.digest, engagement.digest],
        sourceRevision: input.sourceRevision,
        producedAt: input.producedAt,
        validUntil: input.validUntil,
      }),
    );
  }
  const artifacts = [
    workloadManifest,
    alternativeTopology,
    preregistration,
    matrix,
    inventory,
    price,
  ];
  for (let index = 0; index < semantics.length; index += 1) {
    appendOwnArrayValue(artifacts, semantics[index]);
    appendOwnArrayValue(artifacts, engagements[index]);
  }
  const cellEvidenceDigests = [];
  for (let index = 0; index < cells.length; index += 1) {
    appendOwnArrayValue(artifacts, cells[index]);
    appendOwnArrayValue(cellEvidenceDigests, cells[index].digest);
  }
  const root = createBenchmarkResourceEvidenceRoot({
    matrixManifestDigest: matrix.digest,
    componentInventoryDigest: inventory.digest,
    priceSheetDigest: price.digest,
    cellEvidenceDigests,
    sourceRevision: input.sourceRevision,
    producedAt: input.producedAt,
    validUntil: input.validUntil,
    artifacts,
  });
  return {
    receipt: rootReceipt(artifacts, root),
    root,
    artifacts,
    matrix,
    inventory,
    price,
    semantics,
    engagements,
    cells,
  };
}

function resolveArtifact(resolved, digest) {
  const bytes = mapGet(resolved, digest);
  if (bytes === undefined) {
    fail(localText.CELL_SOURCE_ABSENT);
  }
  return parseBenchmarkResourceArtifact(bytes, digest);
}

function captureValidatedArtifacts(receipt) {
  assertBenchmarkResourceExactRecord(
    receipt,
    receiptKeys,
    localText.ROOT,
  );
  const rootDigest = ownDataValue(
    receipt,
    'rootDigest',
    localText.ROOT,
  );
  const resolver = ownDataValue(
    receipt,
    'resolver',
    localText.ROOT,
  );
  assertBenchmarkResourceExactRecord(
    resolver,
    resolverKeys,
    localText.ROOT_RESOLVER,
  );
  const resolve = ownDataValue(
    resolver,
    'resolve',
    localText.ROOT_RESOLVER,
  );
  if (typeof resolve !== 'function') {
    fail(localText.ROOT_RESOLVER_FUNCTION_REQUIRED);
  }
  const resolved = new Map();
  const capturedResolver = {
    resolve(digest) {
      if (mapHas(resolved, digest)) return bufferFrom(mapGet(resolved, digest));
      const bytes = reflectApply(resolve, resolver, [digest]);
      if (bytes !== undefined) {
        assertBenchmarkResourceBytes(
          bytes,
          'movielensGroupedReduce.root.bytes',
        );
        mapSet(resolved, digest, bufferFrom(bytes));
      }
      return bytes;
    },
  };
  const validation = validateBenchmarkResourceEvidenceRoot({
    rootDigest,
    resolver: capturedResolver,
  });
  if (!validation.valid) {
    fail(`movielensGroupedReduce.root:invalid:${validation.reason}`);
  }
  return {rootDigest, resolved};
}

function requireOwner(owner, kind, expectedPayload, path) {
  if (
    owner.kind !== kind ||
    digestBenchmarkSemanticData(owner.payload) !==
      digestBenchmarkSemanticData(expectedPayload)
  ) {
    fail(`${path}:owner_mismatch`);
  }
}

function requireSemanticSource(semantic, cell, matrixCell, index) {
  if (semantic.kind !== BENCHMARK_RESOURCE_ARTIFACT_KIND.SEMANTIC_RECEIPT) {
    fail(localText.CELL_SEMANTIC_RECEIPT_REQUIRED);
  }
  assertBenchmarkResourceExactRecord(
    semantic.payload,
    semanticPayloadKeys,
    localText.SEMANTIC,
  );
  if (
    semantic.payload.version !== semanticVersion ||
    semantic.payload.matrixId !== cell.payload.matrixId ||
    semantic.payload.cellId !== matrixCell.cellId ||
    semantic.payload.pairId !== cell.payload.pairId ||
    semantic.payload.runId !== cell.payload.runId ||
    semantic.payload.matrixCellIndex !== index ||
    digestBenchmarkSemanticData(semantic.payload.sideIds) !==
      digestBenchmarkSemanticData(cell.payload.sideIds)
  ) {
    fail(localText.SEMANTIC_JOIN_MISMATCH);
  }
  requireLiveEvidence(semantic.payload.liveEvidence, index);
}

function requireEngagementIdentity(payload, cell, matrixCell, index) {
  if (
    payload.version !== engagementVersion ||
    payload.matrixId !== cell.payload.matrixId ||
    payload.cellId !== matrixCell.cellId ||
    payload.pairId !== cell.payload.pairId ||
    payload.runId !== cell.payload.runId ||
    payload.matrixCellIndex !== index
  ) {
    fail(localText.ENGAGEMENT_JOIN_MISMATCH);
  }
}

function requireEngagementState(payload) {
  if (
    payload.state !== BENCHMARK_RESOURCE_CELL_STATE.NON_MEASURING ||
    payload.candidateEngaged !== false ||
    payload.alternativeEngaged !== true ||
    !arrayContains(
      payload.reasonCodes,
      COMPARATIVE_MOVIELENS_GROUPED_REDUCE_REASON,
    )
  ) {
    fail(localText.ENGAGEMENT_JOIN_MISMATCH);
  }
}

function requireEngagementOwners(payload, semanticDigest, matrix) {
  if (
    payload.semanticReceiptDigest !== semanticDigest ||
    payload.workloadManifestDigest !==
      matrix.payload.workloadManifestDigest ||
    payload.alternativeTopologyDigest !==
      matrix.payload.alternativeTopologyDigest ||
    payload.preregistrationDigest !==
      matrix.payload.preregistrationDigest
  ) {
    fail(localText.ENGAGEMENT_JOIN_MISMATCH);
  }
}

function requireEngagementSource(
  engagement,
  semanticDigest,
  cell,
  matrix,
  matrixCell,
  index,
) {
  if (
    engagement.kind !==
      BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_ENGAGEMENT
  ) {
    fail(localText.CELL_LIVE_ENGAGEMENT_REQUIRED);
  }
  const payload = engagement.payload;
  assertBenchmarkResourceExactRecord(
    payload,
    engagementPayloadKeys,
    localText.ENGAGEMENT,
  );
  requireEngagementIdentity(payload, cell, matrixCell, index);
  requireEngagementState(payload);
  requireEngagementOwners(payload, semanticDigest, matrix);
  if (
    digestBenchmarkSemanticData(payload.sideIds) !==
      digestBenchmarkSemanticData(cell.payload.sideIds)
  ) {
    fail(localText.ENGAGEMENT_JOIN_MISMATCH);
  }
}

function inspectCell(resolved, cell, matrix, index) {
  const matrixCell = matrix.payload.cells[index];
  if (
    cell.kind !== BENCHMARK_RESOURCE_ARTIFACT_KIND.CELL_EVIDENCE ||
    cell.payload.state !== BENCHMARK_RESOURCE_CELL_STATE.NON_MEASURING ||
    cell.payload.cellId !== matrixCell.cellId ||
    cell.payload.sourceDigests.length !== 2 ||
    !arrayContains(
      cell.payload.reasonCodes,
      COMPARATIVE_MOVIELENS_GROUPED_REDUCE_REASON,
    )
  ) {
    fail(localText.CELL_EXPLICIT_NON_MEASURING_REQUIRED);
  }
  const semantic = resolveArtifact(resolved, cell.payload.sourceDigests[0]);
  const engagement = resolveArtifact(resolved, cell.payload.sourceDigests[1]);
  requireSemanticSource(semantic, cell, matrixCell, index);
  requireEngagementSource(
    engagement,
    cell.payload.sourceDigests[0],
    cell,
    matrix,
    matrixCell,
    index,
  );
}

export function inspectComparativeMovielensGroupedReduceEvidence(receipt) {
  try {
    const capture = captureValidatedArtifacts(receipt);
    const root = resolveArtifact(capture.resolved, capture.rootDigest);
    const matrix = resolveArtifact(
      capture.resolved,
      root.payload.matrixManifestDigest,
    );
    if (
      digestBenchmarkSemanticData(matrix.payload.axes) !==
        digestBenchmarkSemanticData(
          COMPARATIVE_MOVIELENS_GROUPED_REDUCE_AXES,
        ) ||
      matrix.payload.cells.length !==
        COMPARATIVE_MOVIELENS_GROUPED_REDUCE_CELLS.length
    ) {
      fail(localText.MATRIX_EXACT_AXES_REQUIRED);
    }
    requireOwner(
      resolveArtifact(
        capture.resolved,
        matrix.payload.workloadManifestDigest,
      ),
      BENCHMARK_RESOURCE_ARTIFACT_KIND.WORKLOAD_MANIFEST,
      workloadManifestPayload,
      localText.WORKLOAD,
    );
    requireOwner(
      resolveArtifact(
        capture.resolved,
        matrix.payload.alternativeTopologyDigest,
      ),
      BENCHMARK_RESOURCE_ARTIFACT_KIND.ALTERNATIVE_TOPOLOGY,
      alternativeTopologyPayload,
      localText.TOPOLOGY,
    );
    requireOwner(
      resolveArtifact(
        capture.resolved,
        matrix.payload.preregistrationDigest,
      ),
      BENCHMARK_RESOURCE_ARTIFACT_KIND.PREREGISTRATION,
      preregistrationPayload,
      localText.PREREGISTRATION,
    );
    if (
      root.payload.cellEvidenceDigests.length !==
        COMPARATIVE_MOVIELENS_GROUPED_REDUCE_CELLS.length
    ) {
      fail(localText.CELLS_EXACT_MATRIX_REQUIRED);
    }
    for (let index = 0;
      index < root.payload.cellEvidenceDigests.length;
      index += 1) {
      inspectCell(
        capture.resolved,
        resolveArtifact(
          capture.resolved,
          root.payload.cellEvidenceDigests[index],
        ),
        matrix,
        index,
      );
    }
    return {
      valid: true,
      reason: localText.VALID,
      complete: true,
      claimEligible: false,
      claimDisposition: COMPARATIVE_MOVIELENS_GROUPED_REDUCE_DISPOSITION,
      measuringCellCount: 0,
      nonMeasuringCellCount:
        COMPARATIVE_MOVIELENS_GROUPED_REDUCE_CELLS.length,
      publicPathPassCount:
        COMPARATIVE_MOVIELENS_GROUPED_REDUCE_CELLS.length,
      rawReplayPassCount:
        COMPARATIVE_MOVIELENS_GROUPED_REDUCE_CELLS.length,
      matrixId: matrix.payload.matrixId,
      matrixDigest: root.payload.matrixManifestDigest,
      rootDigest: capture.rootDigest,
    };
  } catch (error) {
    return {
      valid: false,
      reason: safeErrorMessage(error),
      complete: false,
      claimEligible: false,
      claimDisposition: null,
      measuringCellCount: 0,
      nonMeasuringCellCount: 0,
      publicPathPassCount: 0,
      rawReplayPassCount: 0,
      matrixId: null,
      matrixDigest: null,
      rootDigest: null,
    };
  }
}
