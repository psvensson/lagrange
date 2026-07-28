import {
  digestBenchmarkSemanticData,
} from './benchmark-semantic-integrity.js';
import {
  assertBenchmarkResourceArray,
  assertBenchmarkResourceCanonicalData,
  assertBenchmarkResourceExactRecord,
  assertBenchmarkResourceText,
} from './benchmark-resource-evidence-data.js';
import {
  inspectBenchmarkResourceLiveCalibrationArtifact,
} from './benchmark-resource-live-observation-authority.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_CELL_STATE,
} from './benchmark-resource-contract-constants.js';
import {
  buildComparativeRequestEnrichmentAffinityWitness,
} from './comparative-efficiency-request-enrichment-affinity-witness.js';
import {
  COMPARATIVE_REQUEST_ENRICHMENT_AFFINITY_OWNER_IDS,
  COMPARATIVE_REQUEST_ENRICHMENT_AXES,
  COMPARATIVE_REQUEST_ENRICHMENT_CELLS,
  COMPARATIVE_REQUEST_ENRICHMENT_REASON,
  comparativeRequestEnrichmentExpectedResult,
  comparativeRequestEnrichmentSql,
} from './comparative-efficiency-request-enrichment-constants.js';

const localText = Object.freeze({
  INVALID: 'requestEnrichment.cells:live_attempt_source_mismatch',
  CALIBRATION_INVALID:
    'requestEnrichment.calibration:external_observation_required',
  LIVE_EVIDENCE_INVALID:
    'requestEnrichment.attempt:live_evidence_invalid',
  WORKLOAD_VERSION: 'comparative-request-enrichment-workloads-v1',
  TOPOLOGY_VERSION: 'comparative-request-enrichment-topology-v1',
  PREREGISTRATION_VERSION:
    'comparative-request-enrichment-preregistration-v1',
  LIVE_EVIDENCE_VERSION:
    'comparative-request-enrichment-live-evidence-v1',
  SOURCE_VERSION: 'comparative-request-enrichment-live-attempt-v1',
  SELECTION_POLICY: 'complete_cartesian_matrix',
  OUTCOME_POLICY: 'direction_neutral',
  INVALID_CELL_POLICY: 'publish_explicit_non_measuring',
  CANDIDATE: 'lagrange',
  ALTERNATIVE: 'postgresql',
  DATABASE_COMPONENT: 'postgresql-database',
  CLIENT_COMPONENT: 'postgresql-client',
  ORACLE: 'row_count_and_sum_exact',
  PATH_WORKLOAD: 'requestEnrichment.workload',
  PATH_WORKLOAD_CELLS: 'requestEnrichment.workload.cells',
  PATH_TOPOLOGY: 'requestEnrichment.topology',
  PATH_TOPOLOGY_CANDIDATE: 'requestEnrichment.topology.candidate',
  PATH_TOPOLOGY_ALTERNATIVE: 'requestEnrichment.topology.alternative',
  PATH_TOPOLOGY_CANDIDATE_REASON:
    'requestEnrichment.topology.candidate.reason',
  PATH_PREREGISTRATION: 'requestEnrichment.preregistration',
  PATH_LIVE: 'requestEnrichment.liveEvidence',
  PATH_LIVE_STARTED_AT: 'requestEnrichment.liveEvidence.startedAt',
  PATH_LIVE_ENDED_AT: 'requestEnrichment.liveEvidence.endedAt',
  PATH_LIVE_CANDIDATE: 'requestEnrichment.liveEvidence.candidate',
  PATH_LIVE_ALTERNATIVE: 'requestEnrichment.liveEvidence.alternative',
  PATH_LIVE_ORACLE: 'requestEnrichment.liveEvidence.oracle',
  PATH_LIVE_CANDIDATE_REASON:
    'requestEnrichment.liveEvidence.candidate.reason',
});

const workloadKeys =
  Object.freeze(['version', 'cells', 'selectionPolicy']);
const workloadCellKeys = Object.freeze([
  'datasetSize',
  'fanout',
  'readLocality',
  'skew',
  'requestCount',
  'alternativeSql',
  'oracleName',
  'oracleExpected',
]);
const topologyKeys = Object.freeze(['version', 'candidate', 'alternative']);
const topologyCandidateKeys = Object.freeze([
  'architectureId',
  'required',
  'capacityAdapterEngaged',
  'reason',
]);
const topologyAlternativeKeys = Object.freeze([
  'architectureId',
  'image',
  'imageId',
  'databaseContainerId',
  'clientContainerId',
  'network',
]);
const preregistrationKeys = Object.freeze([
  'version',
  'axes',
  'sideIds',
  'outcomePolicy',
  'invalidCellPolicy',
  'candidateEngagementRequired',
  'affinityOwnerIds',
  'requiredEvidence',
]);
const liveEvidenceKeys = Object.freeze([
  'version',
  'matrixCellIndex',
  'startedAt',
  'endedAt',
  'candidate',
  'alternative',
  'oracle',
]);
const liveCandidateKeys = Object.freeze([
  'architectureId',
  'capacityAdapterEngaged',
  'reason',
  'affinityOwnerWitness',
]);
const liveAlternativeKeys = Object.freeze([
  'architectureId',
  'engaged',
  'image',
  'imageId',
  'databaseContainerId',
  'clientContainerId',
  'sql',
  'stdout',
]);
const oracleKeys = Object.freeze([
  'name',
  'expected',
  'passed',
]);
const requiredEvidence = Object.freeze([
  'paired_capacity',
  'whole_topology_resource_windows',
  'capacity_uncertainty',
  'capacity_practical_effect',
  'cost_practical_effect',
]);
const timestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const dateParse = Date.parse;
const numberIsFinite = Number.isFinite;
const numberMax = Math.max;
const numberMin = Math.min;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const regexpTest = Function.call.bind(RegExp.prototype.test);
const stringTrim = Function.call.bind(String.prototype.trim);

function buildExpectedAffinityWitnessDigests() {
  const digests = objectCreate(null);
  for (let index = 0;
    index < COMPARATIVE_REQUEST_ENRICHMENT_CELLS.length;
    index += 1) {
    objectDefineProperty(digests, index, {
      enumerable: true,
      value: digestBenchmarkSemanticData(
        buildComparativeRequestEnrichmentAffinityWitness(
          COMPARATIVE_REQUEST_ENRICHMENT_CELLS[index],
        ),
      ),
    });
  }
  return objectFreeze(digests);
}

const expectedAffinityWitnessDigests =
  buildExpectedAffinityWitnessDigests();

function fail(message = localText.INVALID) {
  throw new TypeError(message);
}

function exactValues(actual, expected) {
  if (actual.length !== expected.length) return false;
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== expected[index]) return false;
  }
  return true;
}

function assertTimestamp(value, path) {
  if (
    typeof value !== 'string' ||
    !regexpTest(timestampPattern, value) ||
    !numberIsFinite(dateParse(value))
  ) {
    fail(`${path}:iso_timestamp_required`);
  }
}

function expectedWorkloadCell(cell) {
  return {
    datasetSize: cell.datasetSize,
    fanout: cell.fanout,
    readLocality: cell.readLocality,
    skew: cell.skew,
    requestCount: cell.requestCount,
    alternativeSql: comparativeRequestEnrichmentSql(cell),
    oracleName: localText.ORACLE,
    oracleExpected: comparativeRequestEnrichmentExpectedResult(cell),
  };
}

function assertWorkload(workload) {
  if (workload.kind !== BENCHMARK_RESOURCE_ARTIFACT_KIND.WORKLOAD_MANIFEST) {
    fail();
  }
  assertBenchmarkResourceExactRecord(
    workload.payload,
    workloadKeys,
    localText.PATH_WORKLOAD,
  );
  if (
    workload.payload.version !== localText.WORKLOAD_VERSION ||
    workload.payload.selectionPolicy !== localText.SELECTION_POLICY
  ) {
    fail();
  }
  assertBenchmarkResourceArray(
    workload.payload.cells,
    localText.PATH_WORKLOAD_CELLS,
    COMPARATIVE_REQUEST_ENRICHMENT_CELLS.length,
  );
  if (
    workload.payload.cells.length !==
      COMPARATIVE_REQUEST_ENRICHMENT_CELLS.length
  ) {
    fail();
  }
  for (let index = 0; index < workload.payload.cells.length; index += 1) {
    const actual = workload.payload.cells[index];
    const expected = expectedWorkloadCell(
      COMPARATIVE_REQUEST_ENRICHMENT_CELLS[index],
    );
    assertBenchmarkResourceExactRecord(
      actual,
      workloadCellKeys,
      `requestEnrichment.workload.cells.${index}`,
    );
    if (
      digestBenchmarkSemanticData(actual) !==
        digestBenchmarkSemanticData(expected)
    ) {
      fail();
    }
  }
}

function assertTopology(topology) {
  if (
    topology.kind !== BENCHMARK_RESOURCE_ARTIFACT_KIND.ALTERNATIVE_TOPOLOGY
  ) {
    fail();
  }
  const payload = topology.payload;
  assertBenchmarkResourceExactRecord(
    payload,
    topologyKeys,
    localText.PATH_TOPOLOGY,
  );
  assertBenchmarkResourceExactRecord(
    payload.candidate,
    topologyCandidateKeys,
    localText.PATH_TOPOLOGY_CANDIDATE,
  );
  assertBenchmarkResourceExactRecord(
    payload.alternative,
    topologyAlternativeKeys,
    localText.PATH_TOPOLOGY_ALTERNATIVE,
  );
  if (
    payload.version !== localText.TOPOLOGY_VERSION ||
    payload.candidate.architectureId !== localText.CANDIDATE ||
    payload.candidate.required !== true ||
    payload.candidate.capacityAdapterEngaged !== false ||
    payload.alternative.architectureId !== localText.ALTERNATIVE
  ) {
    fail();
  }
  assertBenchmarkResourceText(
    payload.candidate.reason,
    localText.PATH_TOPOLOGY_CANDIDATE_REASON,
  );
  for (let index = 1; index < topologyAlternativeKeys.length; index += 1) {
    const key = topologyAlternativeKeys[index];
    assertBenchmarkResourceText(
      payload.alternative[key],
      `requestEnrichment.topology.alternative.${key}`,
    );
  }
}

function assertPreregistration(preregistration, matrix) {
  if (
    preregistration.kind !==
      BENCHMARK_RESOURCE_ARTIFACT_KIND.PREREGISTRATION
  ) {
    fail();
  }
  const payload = preregistration.payload;
  assertBenchmarkResourceExactRecord(
    payload,
    preregistrationKeys,
    localText.PATH_PREREGISTRATION,
  );
  if (
    payload.version !== localText.PREREGISTRATION_VERSION ||
    payload.outcomePolicy !== localText.OUTCOME_POLICY ||
    payload.invalidCellPolicy !== localText.INVALID_CELL_POLICY ||
    payload.candidateEngagementRequired !== true ||
    !exactValues(payload.sideIds, matrix.payload.sideIds) ||
    !exactValues(payload.requiredEvidence, requiredEvidence) ||
    digestBenchmarkSemanticData(payload.axes) !==
      digestBenchmarkSemanticData(COMPARATIVE_REQUEST_ENRICHMENT_AXES) ||
    digestBenchmarkSemanticData(payload.affinityOwnerIds) !==
      digestBenchmarkSemanticData(
        COMPARATIVE_REQUEST_ENRICHMENT_AFFINITY_OWNER_IDS,
      )
  ) {
    fail();
  }
}

export function assertComparativeRequestEnrichmentOwners(owners, matrix) {
  assertWorkload(owners.workload);
  assertTopology(owners.topology);
  assertPreregistration(owners.preregistration, matrix);
}

export function evaluateComparativeRequestEnrichmentOracle(cell, stdout) {
  return typeof stdout === 'string' &&
    stringTrim(stdout) === comparativeRequestEnrichmentExpectedResult(cell);
}

function assertLiveDisposition(liveEvidence, matrixCellIndex) {
  const cell = COMPARATIVE_REQUEST_ENRICHMENT_CELLS[matrixCellIndex];
  if (
    !cell ||
    liveEvidence.version !== localText.LIVE_EVIDENCE_VERSION ||
    liveEvidence.matrixCellIndex !== matrixCellIndex ||
    liveEvidence.candidate.architectureId !== localText.CANDIDATE ||
    liveEvidence.candidate.capacityAdapterEngaged !== false ||
    liveEvidence.alternative.architectureId !== localText.ALTERNATIVE ||
    liveEvidence.alternative.engaged !== true
  ) {
    fail(localText.LIVE_EVIDENCE_INVALID);
  }
  return cell;
}

function assertLiveOracle(liveEvidence, cell) {
  if (
    liveEvidence.oracle.name !== localText.ORACLE ||
    liveEvidence.oracle.expected !==
      comparativeRequestEnrichmentExpectedResult(cell) ||
    liveEvidence.oracle.passed !== true ||
    !evaluateComparativeRequestEnrichmentOracle(
      cell,
      liveEvidence.alternative.stdout,
    )
  ) {
    fail(localText.LIVE_EVIDENCE_INVALID);
  }
}

function assertLiveAffinityWitness(liveEvidence, matrixCellIndex) {
  assertBenchmarkResourceCanonicalData(
    liveEvidence.candidate.affinityOwnerWitness,
  );
  if (
    digestBenchmarkSemanticData(
      liveEvidence.candidate.affinityOwnerWitness,
    ) !== expectedAffinityWitnessDigests[matrixCellIndex]
  ) {
    fail(localText.LIVE_EVIDENCE_INVALID);
  }
}

export function assertComparativeRequestEnrichmentLiveEvidence(
  liveEvidence,
  matrixCellIndex,
) {
  assertBenchmarkResourceExactRecord(
    liveEvidence,
    liveEvidenceKeys,
    localText.PATH_LIVE,
  );
  assertTimestamp(
    liveEvidence.startedAt,
    localText.PATH_LIVE_STARTED_AT,
  );
  assertTimestamp(
    liveEvidence.endedAt,
    localText.PATH_LIVE_ENDED_AT,
  );
  if (dateParse(liveEvidence.endedAt) < dateParse(liveEvidence.startedAt)) {
    fail(localText.LIVE_EVIDENCE_INVALID);
  }
  assertBenchmarkResourceExactRecord(
    liveEvidence.candidate,
    liveCandidateKeys,
    localText.PATH_LIVE_CANDIDATE,
  );
  assertBenchmarkResourceExactRecord(
    liveEvidence.alternative,
    liveAlternativeKeys,
    localText.PATH_LIVE_ALTERNATIVE,
  );
  assertBenchmarkResourceExactRecord(
    liveEvidence.oracle,
    oracleKeys,
    localText.PATH_LIVE_ORACLE,
  );
  const cell = assertLiveDisposition(liveEvidence, matrixCellIndex);
  assertLiveOracle(liveEvidence, cell);
  assertBenchmarkResourceText(
    liveEvidence.candidate.reason,
    localText.PATH_LIVE_CANDIDATE_REASON,
  );
  assertLiveAffinityWitness(liveEvidence, matrixCellIndex);
}

function calibrationComponent(calibration, componentId) {
  const components = calibration.payload.components;
  for (let index = 0; index < components.length; index += 1) {
    if (components[index].componentId === componentId) {
      return components[index];
    }
  }
  return null;
}

function assertCalibration(calibration, root, liveEvidence) {
  const inspection =
    inspectBenchmarkResourceLiveCalibrationArtifact(calibration);
  const database =
    calibrationComponent(calibration, localText.DATABASE_COMPONENT);
  const client =
    calibrationComponent(calibration, localText.CLIENT_COMPONENT);
  const startedAt = dateParse(liveEvidence.startedAt);
  const endedAt = dateParse(liveEvidence.endedAt);
  if (
    calibration.kind !== BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_CALIBRATION ||
    !inspection.valid ||
    calibration.payload.sourceRevision !== root.payload.sourceRevision ||
    !database ||
    !client ||
    database.sideId !== localText.ALTERNATIVE ||
    client.sideId !== localText.ALTERNATIVE ||
    database.containerId !== liveEvidence.alternative.databaseContainerId ||
    client.containerId !== liveEvidence.alternative.clientContainerId ||
    startedAt < numberMax(database.start.timestamp, client.start.timestamp) ||
    endedAt > numberMin(database.end.timestamp, client.end.timestamp)
  ) {
    fail(localText.CALIBRATION_INVALID);
  }
}

function assertSourceIdentity(payload, cell, matrixCell, matrix, index) {
  if (
    payload.version !== localText.SOURCE_VERSION ||
    payload.matrixId !== matrix.payload.matrixId ||
    payload.cellId !== matrixCell.cellId ||
    payload.pairId !== cell.payload.pairId ||
    payload.matrixCellIndex !== index ||
    payload.runId !== cell.payload.runId ||
    !exactValues(payload.sideIds, cell.payload.sideIds) ||
    !exactValues(payload.sideIds, matrix.payload.sideIds) ||
    !exactValues(payload.reasonCodes, cell.payload.reasonCodes)
  ) {
    fail();
  }
}

function assertSourceDisposition(payload) {
  if (
    payload.state !== BENCHMARK_RESOURCE_CELL_STATE.NON_MEASURING ||
    payload.candidateEngaged !== false ||
    payload.alternativeEngaged !== true ||
    payload.reasonCodes[0] !== COMPARATIVE_REQUEST_ENRICHMENT_REASON
  ) {
    fail();
  }
}

function assertSourceOwners(payload, matrix) {
  if (
    payload.workloadManifestDigest !== matrix.payload.workloadManifestDigest ||
    payload.alternativeTopologyDigest !==
      matrix.payload.alternativeTopologyDigest ||
    payload.preregistrationDigest !== matrix.payload.preregistrationDigest
  ) {
    fail();
  }
}

function assertLiveOwnerJoin(liveEvidence, owners, index) {
  if (
    liveEvidence.alternative.sql !==
      comparativeRequestEnrichmentSql(
        COMPARATIVE_REQUEST_ENRICHMENT_CELLS[index],
      ) ||
    liveEvidence.candidate.reason !== owners.topology.payload.candidate.reason ||
    liveEvidence.alternative.image !==
      owners.topology.payload.alternative.image ||
    liveEvidence.alternative.imageId !==
      owners.topology.payload.alternative.imageId ||
    liveEvidence.alternative.databaseContainerId !==
      owners.topology.payload.alternative.databaseContainerId ||
    liveEvidence.alternative.clientContainerId !==
      owners.topology.payload.alternative.clientContainerId
  ) {
    fail();
  }
}

function assertSourceReferences(source, payload) {
  if (
    !exactValues(source.references, [
      payload.calibrationDigest,
      payload.workloadManifestDigest,
      payload.alternativeTopologyDigest,
      payload.preregistrationDigest,
    ])
  ) {
    fail();
  }
}

export function assertComparativeRequestEnrichmentSource({
  source,
  cell,
  matrixCell,
  matrix,
  root,
  owners,
  calibration,
  index,
}) {
  const payload = source.payload;
  const liveEvidence = payload.liveEvidence;
  assertComparativeRequestEnrichmentLiveEvidence(liveEvidence, index);
  assertSourceIdentity(payload, cell, matrixCell, matrix, index);
  assertSourceDisposition(payload);
  assertSourceOwners(payload, matrix);
  assertLiveOwnerJoin(liveEvidence, owners, index);
  assertSourceReferences(source, payload);
  assertCalibration(calibration, root, liveEvidence);
}
