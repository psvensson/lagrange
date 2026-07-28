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

const workloadKeys =
  Object.freeze(['version', 'cells', 'selectionPolicy']);
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
const oracleKeys = Object.freeze(['name', 'expected', 'passed']);
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
const localText = Object.freeze({
  ALTERNATIVE: 'postgresql',
  CALIBRATION_INVALID: 'calibration:external_observation_required',
  CANDIDATE: 'lagrange',
  CELL_SOURCE_MISMATCH: 'cells:live_attempt_source_mismatch',
  CLIENT_COMPONENT: 'postgresql-client',
  DATABASE_COMPONENT: 'postgresql-database',
  INVALID_CELL_POLICY: 'publish_explicit_non_measuring',
  LIVE_ALTERNATIVE: 'liveEvidence.alternative',
  LIVE_CANDIDATE: 'liveEvidence.candidate',
  LIVE_CANDIDATE_REASON: 'liveEvidence.candidate.reason',
  LIVE_ENDED_AT: 'liveEvidence.endedAt',
  LIVE_EVIDENCE: 'liveEvidence',
  LIVE_EVIDENCE_INVALID: 'attempt:live_evidence_invalid',
  LIVE_ORACLE: 'liveEvidence.oracle',
  LIVE_STARTED_AT: 'liveEvidence.startedAt',
  OUTCOME_POLICY: 'direction_neutral',
  PREREGISTRATION: 'preregistration',
  SELECTION_POLICY: 'complete_cartesian_matrix',
  TOPOLOGY: 'topology',
  TOPOLOGY_ALTERNATIVE: 'topology.alternative',
  TOPOLOGY_CANDIDATE: 'topology.candidate',
  TOPOLOGY_CANDIDATE_REASON: 'topology.candidate.reason',
  WORKLOAD: 'workload',
  WORKLOAD_CELLS: 'workload.cells',
});

function exactValues(actual, expected) {
  if (actual.length !== expected.length) return false;
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== expected[index]) return false;
  }
  return true;
}

function expectedWitnessDigests(config) {
  const digests = objectCreate(null);
  for (let index = 0; index < config.cells.length; index += 1) {
    objectDefineProperty(digests, index, {
      enumerable: true,
      value: digestBenchmarkSemanticData(
        config.buildWitness(config.cells[index]),
      ),
    });
  }
  return objectFreeze(digests);
}

function text(config, suffix) {
  return `${config.pathPrefix}.${suffix}`;
}

export function createComparativePostgresNonMeasuringAdmission(config) {
  const witnessDigests = expectedWitnessDigests(config);
  const preregistrationKeys = Object.freeze([
    'version',
    'axes',
    'sideIds',
    'outcomePolicy',
    'invalidCellPolicy',
    'candidateEngagementRequired',
    config.ownerIdsField,
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
    ...config.liveEvidenceExtraKeys,
  ]);
  const liveCandidateKeys = Object.freeze([
    'architectureId',
    'capacityAdapterEngaged',
    'reason',
    config.witnessField,
  ]);

  function fail(message = text(config, localText.CELL_SOURCE_MISMATCH)) {
    throw new TypeError(message);
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
    return config.projectWorkloadCell(
      cell,
      config.sql(cell),
      config.oracleName,
      config.expectedResult(cell),
    );
  }

  function assertWorkload(workload) {
    if (workload.kind !== BENCHMARK_RESOURCE_ARTIFACT_KIND.WORKLOAD_MANIFEST) {
      fail();
    }
    assertBenchmarkResourceExactRecord(
      workload.payload,
      workloadKeys,
      text(config, localText.WORKLOAD),
    );
    if (
      workload.payload.version !== config.workloadVersion ||
      workload.payload.selectionPolicy !== localText.SELECTION_POLICY
    ) {
      fail();
    }
    assertBenchmarkResourceArray(
      workload.payload.cells,
      text(config, localText.WORKLOAD_CELLS),
      config.cells.length,
    );
    if (workload.payload.cells.length !== config.cells.length) fail();
    for (let index = 0; index < config.cells.length; index += 1) {
      const actual = workload.payload.cells[index];
      assertBenchmarkResourceExactRecord(
        actual,
        config.workloadCellKeys,
        text(config, `workload.cells.${index}`),
      );
      if (
        digestBenchmarkSemanticData(actual) !==
          digestBenchmarkSemanticData(expectedWorkloadCell(config.cells[index]))
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
      text(config, localText.TOPOLOGY),
    );
    assertBenchmarkResourceExactRecord(
      payload.candidate,
      topologyCandidateKeys,
      text(config, localText.TOPOLOGY_CANDIDATE),
    );
    assertBenchmarkResourceExactRecord(
      payload.alternative,
      topologyAlternativeKeys,
      text(config, localText.TOPOLOGY_ALTERNATIVE),
    );
    if (
      payload.version !== config.topologyVersion ||
      payload.candidate.architectureId !== localText.CANDIDATE ||
      payload.candidate.required !== true ||
      payload.candidate.capacityAdapterEngaged !== false ||
      payload.alternative.architectureId !== localText.ALTERNATIVE
    ) {
      fail();
    }
    assertBenchmarkResourceText(
      payload.candidate.reason,
      text(config, localText.TOPOLOGY_CANDIDATE_REASON),
    );
    for (let index = 1; index < topologyAlternativeKeys.length; index += 1) {
      const key = topologyAlternativeKeys[index];
      assertBenchmarkResourceText(
        payload.alternative[key],
        text(config, `topology.alternative.${key}`),
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
      text(config, localText.PREREGISTRATION),
    );
    if (
      payload.version !== config.preregistrationVersion ||
      payload.outcomePolicy !== localText.OUTCOME_POLICY ||
      payload.invalidCellPolicy !== localText.INVALID_CELL_POLICY ||
      payload.candidateEngagementRequired !== true ||
      !exactValues(payload.sideIds, matrix.payload.sideIds) ||
      !exactValues(payload.requiredEvidence, config.requiredEvidence) ||
      digestBenchmarkSemanticData(payload.axes) !==
        digestBenchmarkSemanticData(config.axes) ||
      digestBenchmarkSemanticData(payload[config.ownerIdsField]) !==
        digestBenchmarkSemanticData(config.ownerIds)
    ) {
      fail();
    }
  }

  function assertOwners(owners, matrix) {
    assertWorkload(owners.workload);
    assertTopology(owners.topology);
    assertPreregistration(owners.preregistration, matrix);
  }

  function evaluateOracle(cell, stdout) {
    return typeof stdout === 'string' &&
      stringTrim(stdout) === config.expectedResult(cell);
  }

  function assertLiveDisposition(liveEvidence, matrixCellIndex) {
    const cell = config.cells[matrixCellIndex];
    if (
      !cell ||
      liveEvidence.version !== config.liveEvidenceVersion ||
      liveEvidence.matrixCellIndex !== matrixCellIndex ||
      liveEvidence.candidate.architectureId !== localText.CANDIDATE ||
      liveEvidence.candidate.capacityAdapterEngaged !== false ||
      liveEvidence.alternative.architectureId !== localText.ALTERNATIVE ||
      liveEvidence.alternative.engaged !== true
    ) {
      fail(text(config, localText.LIVE_EVIDENCE_INVALID));
    }
    config.assertLiveExtra(liveEvidence, fail);
    return cell;
  }

  function assertLiveEvidence(liveEvidence, matrixCellIndex) {
    assertBenchmarkResourceExactRecord(
      liveEvidence,
      liveEvidenceKeys,
      text(config, localText.LIVE_EVIDENCE),
    );
    assertTimestamp(
      liveEvidence.startedAt,
      text(config, localText.LIVE_STARTED_AT),
    );
    assertTimestamp(
      liveEvidence.endedAt,
      text(config, localText.LIVE_ENDED_AT),
    );
    if (dateParse(liveEvidence.endedAt) < dateParse(liveEvidence.startedAt)) {
      fail(text(config, localText.LIVE_EVIDENCE_INVALID));
    }
    assertBenchmarkResourceExactRecord(
      liveEvidence.candidate,
      liveCandidateKeys,
      text(config, localText.LIVE_CANDIDATE),
    );
    assertBenchmarkResourceExactRecord(
      liveEvidence.alternative,
      liveAlternativeKeys,
      text(config, localText.LIVE_ALTERNATIVE),
    );
    assertBenchmarkResourceExactRecord(
      liveEvidence.oracle,
      oracleKeys,
      text(config, localText.LIVE_ORACLE),
    );
    const cell = assertLiveDisposition(liveEvidence, matrixCellIndex);
    if (
      liveEvidence.oracle.name !== config.oracleName ||
      liveEvidence.oracle.expected !== config.expectedResult(cell) ||
      liveEvidence.oracle.passed !== true ||
      !evaluateOracle(cell, liveEvidence.alternative.stdout)
    ) {
      fail(text(config, localText.LIVE_EVIDENCE_INVALID));
    }
    assertBenchmarkResourceText(
      liveEvidence.candidate.reason,
      text(config, localText.LIVE_CANDIDATE_REASON),
    );
    const witness = liveEvidence.candidate[config.witnessField];
    assertBenchmarkResourceCanonicalData(witness);
    if (
      digestBenchmarkSemanticData(witness) !== witnessDigests[matrixCellIndex]
    ) {
      fail(text(config, localText.LIVE_EVIDENCE_INVALID));
    }
  }

  function calibrationComponent(calibration, componentId) {
    const components = calibration.payload.components;
    for (let index = 0; index < components.length; index += 1) {
      if (components[index].componentId === componentId) {
        return components[index];
      }
    }
    fail(text(config, localText.CALIBRATION_INVALID));
  }

  function assertCalibration(calibration, root, liveEvidence) {
    const inspection =
      inspectBenchmarkResourceLiveCalibrationArtifact(calibration);
    if (
      calibration.kind !== BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_CALIBRATION ||
      !inspection.valid ||
      calibration.payload.sourceRevision !== root.payload.sourceRevision
    ) {
      fail(text(config, localText.CALIBRATION_INVALID));
    }
    const database = calibrationComponent(
      calibration,
      localText.DATABASE_COMPONENT,
    );
    const client = calibrationComponent(calibration, localText.CLIENT_COMPONENT);
    if (
      database.sideId !== localText.ALTERNATIVE ||
      client.sideId !== localText.ALTERNATIVE ||
      database.containerId !== liveEvidence.alternative.databaseContainerId ||
      client.containerId !== liveEvidence.alternative.clientContainerId
    ) {
      fail(text(config, localText.CALIBRATION_INVALID));
    }
    if (
      dateParse(liveEvidence.startedAt) <
        numberMax(database.start.timestamp, client.start.timestamp) ||
      dateParse(liveEvidence.endedAt) >
        numberMin(database.end.timestamp, client.end.timestamp)
    ) {
      fail(text(config, localText.CALIBRATION_INVALID));
    }
  }

  function assertSourceIdentity(payload, cell, matrixCell, matrix, index) {
    if (
      payload.version !== config.sourceVersion ||
      payload.matrixId !== matrix.payload.matrixId ||
      payload.cellId !== matrixCell.cellId ||
      payload.pairId !== cell.payload.pairId ||
      payload.matrixCellIndex !== index ||
      payload.runId !== cell.payload.runId ||
      !exactValues(payload.sideIds, cell.payload.sideIds) ||
      !exactValues(payload.sideIds, matrix.payload.sideIds)
    ) {
      fail();
    }
  }

  function assertSourceDisposition(payload, cell) {
    if (
      !exactValues(payload.reasonCodes, cell.payload.reasonCodes) ||
      payload.state !== BENCHMARK_RESOURCE_CELL_STATE.NON_MEASURING ||
      payload.candidateEngaged !== false ||
      payload.alternativeEngaged !== true ||
      payload.reasonCodes[0] !== config.reason
    ) {
      fail();
    }
  }

  function assertSourceOwnerDigests(payload, matrix) {
    if (
      payload.workloadManifestDigest !==
        matrix.payload.workloadManifestDigest ||
      payload.alternativeTopologyDigest !==
        matrix.payload.alternativeTopologyDigest ||
      payload.preregistrationDigest !==
        matrix.payload.preregistrationDigest
    ) {
      fail();
    }
  }

  function assertSourceLiveJoin(liveEvidence, owners, index) {
    if (
      liveEvidence.alternative.sql !== config.sql(config.cells[index]) ||
      liveEvidence.candidate.reason !==
        owners.topology.payload.candidate.reason ||
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

  function assertSource(input) {
    const {
      source,
      cell,
      matrixCell,
      matrix,
      root,
      owners,
      calibration,
      index,
    } = input;
    const payload = source.payload;
    const liveEvidence = payload.liveEvidence;
    assertLiveEvidence(liveEvidence, index);
    assertSourceIdentity(payload, cell, matrixCell, matrix, index);
    assertSourceDisposition(payload, cell);
    assertSourceOwnerDigests(payload, matrix);
    assertSourceLiveJoin(liveEvidence, owners, index);
    assertSourceReferences(source, payload);
    assertCalibration(calibration, root, liveEvidence);
  }

  return objectFreeze({
    assertLiveEvidence,
    assertOwners,
    assertSource,
    evaluateOracle,
  });
}
