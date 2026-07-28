import {
  assertBenchmarkResourceArray,
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
  COMPARATIVE_NEGATIVE_CONTROL_IDS,
  COMPARATIVE_NEGATIVE_CONTROL_REASON,
  COMPARATIVE_NEGATIVE_CONTROL_WORKLOADS,
} from './comparative-efficiency-negative-controls-constants.js';

const localText = Object.freeze({
  INVALID: 'negativeControls.cells:live_attempt_source_mismatch',
  CALIBRATION_INVALID:
    'negativeControls.calibration:external_observation_required',
  LIVE_EVIDENCE_INVALID:
    'negativeControls.attempt:live_evidence_invalid',
  WORKLOAD_VERSION: 'comparative-negative-controls-workloads-v1',
  TOPOLOGY_VERSION: 'comparative-negative-controls-topology-v1',
  PREREGISTRATION_VERSION:
    'comparative-negative-controls-preregistration-v1',
  LIVE_EVIDENCE_VERSION:
    'comparative-negative-control-live-evidence-v1',
  SOURCE_VERSION: 'comparative-negative-control-live-attempt-v1',
  SELECTION_POLICY: 'complete_preregistered_matrix',
  OUTCOME_POLICY: 'direction_neutral',
  INVALID_CELL_POLICY: 'publish_explicit_non_measuring',
  CANDIDATE: 'lagrange',
  ALTERNATIVE: 'postgresql',
  DATABASE_COMPONENT: 'postgresql-database',
  CLIENT_COMPONENT: 'postgresql-client',
  NEWLINE: '\n',
  PATH_WORKLOAD: 'negativeControls.workload',
  PATH_WORKLOAD_CONTROLS: 'negativeControls.workload.controls',
  PATH_TOPOLOGY: 'negativeControls.topology',
  PATH_TOPOLOGY_CANDIDATE: 'negativeControls.topology.candidate',
  PATH_TOPOLOGY_ALTERNATIVE: 'negativeControls.topology.alternative',
  PATH_TOPOLOGY_CANDIDATE_REASON:
    'negativeControls.topology.candidate.reason',
  PATH_PREREGISTRATION: 'negativeControls.preregistration',
  PATH_LIVE_EVIDENCE: 'negativeControls.liveEvidence',
  PATH_LIVE_STARTED_AT: 'negativeControls.liveEvidence.startedAt',
  PATH_LIVE_ENDED_AT: 'negativeControls.liveEvidence.endedAt',
  PATH_LIVE_CANDIDATE: 'negativeControls.liveEvidence.candidate',
  PATH_LIVE_ALTERNATIVE: 'negativeControls.liveEvidence.alternative',
  PATH_LIVE_ORACLE: 'negativeControls.liveEvidence.oracle',
  PATH_LIVE_CANDIDATE_REASON:
    'negativeControls.liveEvidence.candidate.reason',
  PATH_LIVE_ORACLE_NAME: 'negativeControls.liveEvidence.oracle.name',
  FIRST_LINE_EQUALS: 'first_line_equals',
  LINE_EQUALS: 'line_equals',
  CONTAINS_TEXT_AND_LINE: 'contains_text_and_line',
});
const liveEvidenceKeys = Object.freeze([
  'version',
  'controlId',
  'startedAt',
  'endedAt',
  'candidate',
  'alternative',
  'oracle',
]);
const candidateKeys = Object.freeze(['architectureId', 'engaged', 'reason']);
const alternativeKeys = Object.freeze([
  'architectureId',
  'engaged',
  'image',
  'imageId',
  'databaseContainerId',
  'clientContainerId',
  'sql',
  'stdout',
]);
const oracleKeys = Object.freeze(['name', 'passed']);
const workloadKeys =
  Object.freeze(['version', 'controls', 'selectionPolicy']);
const workloadControlKeys = Object.freeze([
  'controlId',
  'accessDistribution',
  'randomSeed',
  'alternativeSql',
  'oracleName',
  'oracleKind',
  'oracleExpected',
]);
const topologyKeys = Object.freeze(['version', 'candidate', 'alternative']);
const topologyCandidateKeys =
  Object.freeze(['architectureId', 'required', 'engaged', 'reason']);
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
  'controls',
  'sideIds',
  'outcomePolicy',
  'invalidCellPolicy',
  'candidateEngagementRequired',
  'requiredEvidence',
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
const numberMax = Math.max;
const numberMin = Math.min;
const numberIsFinite = Number.isFinite;
const regexpTest = Function.call.bind(RegExp.prototype.test);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringSplit = Function.call.bind(String.prototype.split);

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

function lines(stdout) {
  return stringSplit(stdout, localText.NEWLINE);
}

function containsLine(stdout, expected) {
  const values = lines(stdout);
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === expected) return true;
  }
  return false;
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

function assertWorkloadControl(actual, expected, index) {
  const path = `negativeControls.workload.controls.${index}`;
  assertBenchmarkResourceExactRecord(actual, workloadControlKeys, path);
  if (
    actual.controlId !== expected.controlId ||
    actual.accessDistribution !== expected.accessDistribution ||
    actual.randomSeed !== expected.randomSeed ||
    actual.alternativeSql !== expected.alternativeSql ||
    actual.oracleName !== expected.oracleName ||
    actual.oracleKind !== expected.oracleKind
  ) {
    fail(localText.INVALID);
  }
  assertBenchmarkResourceArray(
    actual.oracleExpected,
    `${path}.oracleExpected`,
    expected.oracleExpected.length,
  );
  if (!exactValues(actual.oracleExpected, expected.oracleExpected)) {
    fail(localText.INVALID);
  }
}

function assertWorkload(workload) {
  if (workload.kind !== BENCHMARK_RESOURCE_ARTIFACT_KIND.WORKLOAD_MANIFEST) {
    fail(localText.INVALID);
  }
  const payload = workload.payload;
  assertBenchmarkResourceExactRecord(
    payload,
    workloadKeys,
    localText.PATH_WORKLOAD,
  );
  if (
    payload.version !== localText.WORKLOAD_VERSION ||
    payload.selectionPolicy !== localText.SELECTION_POLICY
  ) {
    fail(localText.INVALID);
  }
  assertBenchmarkResourceArray(
    payload.controls,
    localText.PATH_WORKLOAD_CONTROLS,
    COMPARATIVE_NEGATIVE_CONTROL_WORKLOADS.length,
  );
  if (payload.controls.length !== COMPARATIVE_NEGATIVE_CONTROL_WORKLOADS.length) {
    fail(localText.INVALID);
  }
  for (let index = 0; index < payload.controls.length; index += 1) {
    assertWorkloadControl(
      payload.controls[index],
      COMPARATIVE_NEGATIVE_CONTROL_WORKLOADS[index],
      index,
    );
  }
}

function assertTopology(topology) {
  if (topology.kind !== BENCHMARK_RESOURCE_ARTIFACT_KIND.ALTERNATIVE_TOPOLOGY) {
    fail(localText.INVALID);
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
    payload.candidate.engaged !== false ||
    payload.alternative.architectureId !== localText.ALTERNATIVE
  ) {
    fail(localText.INVALID);
  }
  assertBenchmarkResourceText(
    payload.candidate.reason,
    localText.PATH_TOPOLOGY_CANDIDATE_REASON,
  );
  for (let index = 1; index < topologyAlternativeKeys.length; index += 1) {
    const key = topologyAlternativeKeys[index];
    assertBenchmarkResourceText(
      payload.alternative[key],
      `negativeControls.topology.alternative.${key}`,
    );
  }
}

function assertPreregistration(preregistration, matrix) {
  if (
    preregistration.kind !==
      BENCHMARK_RESOURCE_ARTIFACT_KIND.PREREGISTRATION
  ) {
    fail(localText.INVALID);
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
    !exactValues(payload.controls, COMPARATIVE_NEGATIVE_CONTROL_IDS) ||
    !exactValues(payload.sideIds, matrix.payload.sideIds) ||
    !exactValues(payload.requiredEvidence, requiredEvidence)
  ) {
    fail(localText.INVALID);
  }
}

export function assertComparativeNegativeControlOwners(owners, matrix) {
  assertWorkload(owners.workload);
  assertTopology(owners.topology);
  assertPreregistration(owners.preregistration, matrix);
}

export function assertComparativeNegativeControlLiveEvidence(
  liveEvidence,
  controlId,
) {
  assertBenchmarkResourceExactRecord(
    liveEvidence,
    liveEvidenceKeys,
    localText.PATH_LIVE_EVIDENCE,
  );
  if (
    liveEvidence.version !== localText.LIVE_EVIDENCE_VERSION ||
    liveEvidence.controlId !== controlId
  ) {
    fail(localText.LIVE_EVIDENCE_INVALID);
  }
  assertTimestamp(liveEvidence.startedAt, localText.PATH_LIVE_STARTED_AT);
  assertTimestamp(liveEvidence.endedAt, localText.PATH_LIVE_ENDED_AT);
  if (dateParse(liveEvidence.endedAt) < dateParse(liveEvidence.startedAt)) {
    fail(localText.LIVE_EVIDENCE_INVALID);
  }
  assertBenchmarkResourceExactRecord(
    liveEvidence.candidate,
    candidateKeys,
    localText.PATH_LIVE_CANDIDATE,
  );
  assertBenchmarkResourceExactRecord(
    liveEvidence.alternative,
    alternativeKeys,
    localText.PATH_LIVE_ALTERNATIVE,
  );
  assertBenchmarkResourceExactRecord(
    liveEvidence.oracle,
    oracleKeys,
    localText.PATH_LIVE_ORACLE,
  );
  if (
    liveEvidence.candidate.architectureId !== localText.CANDIDATE ||
    liveEvidence.candidate.engaged !== false ||
    liveEvidence.alternative.architectureId !== localText.ALTERNATIVE ||
    liveEvidence.alternative.engaged !== true ||
    liveEvidence.oracle.passed !== true
  ) {
    fail(localText.LIVE_EVIDENCE_INVALID);
  }
  assertBenchmarkResourceText(
    liveEvidence.candidate.reason,
    localText.PATH_LIVE_CANDIDATE_REASON,
  );
  for (let index = 2; index < alternativeKeys.length; index += 1) {
    const key = alternativeKeys[index];
    assertBenchmarkResourceText(
      liveEvidence.alternative[key],
      `negativeControls.liveEvidence.alternative.${key}`,
    );
  }
  assertBenchmarkResourceText(
    liveEvidence.oracle.name,
    localText.PATH_LIVE_ORACLE_NAME,
  );
}

export function evaluateComparativeNegativeControlOracle(workload, stdout) {
  const expected = workload.oracleExpected;
  if (workload.oracleKind === localText.FIRST_LINE_EQUALS) {
    return lines(stdout)[0] === expected[0];
  }
  if (workload.oracleKind === localText.LINE_EQUALS) {
    return containsLine(stdout, expected[0]);
  }
  if (workload.oracleKind === localText.CONTAINS_TEXT_AND_LINE) {
    return stringIndexOf(stdout, expected[0]) >= 0 &&
      containsLine(stdout, expected[1]);
  }
  return false;
}

function findCalibrationComponent(calibration, componentId) {
  const components = calibration.payload.components;
  for (let index = 0; index < components.length; index += 1) {
    if (components[index].componentId === componentId) return components[index];
  }
  return null;
}

function assertCalibration(calibration, root, liveEvidence) {
  const inspection =
    inspectBenchmarkResourceLiveCalibrationArtifact(calibration);
  if (
    calibration.kind !== BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_CALIBRATION ||
    !inspection.valid ||
    calibration.payload.sourceRevision !== root.payload.sourceRevision
  ) {
    fail(localText.CALIBRATION_INVALID);
  }
  const database = findCalibrationComponent(
    calibration,
    localText.DATABASE_COMPONENT,
  );
  const client = findCalibrationComponent(
    calibration,
    localText.CLIENT_COMPONENT,
  );
  const startedAt = dateParse(liveEvidence.startedAt);
  const endedAt = dateParse(liveEvidence.endedAt);
  if (
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

function assertSourceIdentity(payload, cell, matrixCell, matrix, workload) {
  if (
    payload.version !== localText.SOURCE_VERSION ||
    payload.matrixId !== matrix.payload.matrixId ||
    payload.cellId !== matrixCell.cellId ||
    payload.pairId !== cell.payload.pairId ||
    payload.controlId !== workload.controlId ||
    payload.runId !== cell.payload.runId ||
    !exactValues(payload.sideIds, cell.payload.sideIds) ||
    !exactValues(payload.sideIds, matrix.payload.sideIds) ||
    !exactValues(payload.reasonCodes, cell.payload.reasonCodes)
  ) {
    fail(localText.INVALID);
  }
}

function assertSourceOwners(payload, matrix) {
  if (
    payload.workloadManifestDigest !== matrix.payload.workloadManifestDigest ||
    payload.alternativeTopologyDigest !==
      matrix.payload.alternativeTopologyDigest ||
    payload.preregistrationDigest !== matrix.payload.preregistrationDigest
  ) {
    fail(localText.INVALID);
  }
}

function assertSourceDisposition(payload) {
  if (
    payload.state !== BENCHMARK_RESOURCE_CELL_STATE.NON_MEASURING ||
    payload.candidateEngaged !== false ||
    payload.alternativeEngaged !== true ||
    payload.reasonCodes[0] !== COMPARATIVE_NEGATIVE_CONTROL_REASON
  ) {
    fail(localText.INVALID);
  }
}

function assertLiveOwnerJoin(liveEvidence, workload, topology) {
  if (
    liveEvidence.alternative.sql !== workload.alternativeSql ||
    liveEvidence.oracle.name !== workload.oracleName ||
    !evaluateComparativeNegativeControlOracle(
      workload,
      liveEvidence.alternative.stdout,
    ) ||
    liveEvidence.candidate.reason !== topology.payload.candidate.reason ||
    liveEvidence.alternative.image !==
      topology.payload.alternative.image ||
    liveEvidence.alternative.imageId !==
      topology.payload.alternative.imageId ||
    liveEvidence.alternative.databaseContainerId !==
      topology.payload.alternative.databaseContainerId ||
    liveEvidence.alternative.clientContainerId !==
      topology.payload.alternative.clientContainerId
  ) {
    fail(localText.INVALID);
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
    fail(localText.INVALID);
  }
}

export function assertComparativeNegativeControlSource({
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
  const workload = COMPARATIVE_NEGATIVE_CONTROL_WORKLOADS[index];
  assertComparativeNegativeControlLiveEvidence(
    liveEvidence,
    workload.controlId,
  );
  assertSourceIdentity(payload, cell, matrixCell, matrix, workload);
  assertSourceOwners(payload, matrix);
  assertSourceDisposition(payload);
  assertLiveOwnerJoin(liveEvidence, workload, owners.topology);
  assertSourceReferences(source, payload);
  assertCalibration(calibration, root, liveEvidence);
}
