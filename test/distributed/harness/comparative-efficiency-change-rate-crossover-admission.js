import {
  assertBenchmarkResourceExactRecord,
} from './benchmark-resource-evidence-data.js';
import {
  createComparativePostgresNonMeasuringAdmission,
} from './comparative-efficiency-postgres-nonmeasuring-admission.js';
import {
  buildComparativeChangeRateCrossoverPolicyWitness,
} from './comparative-efficiency-change-rate-crossover-policy-witness.js';
import {
  COMPARATIVE_CHANGE_RATE_CROSSOVER_POLICY_OWNER_IDS,
  COMPARATIVE_CHANGE_RATE_CROSSOVER_AXES,
  COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS,
  COMPARATIVE_CHANGE_RATE_CROSSOVER_REASON,
  comparativeChangeRateCrossoverExpectedResult,
  comparativeChangeRateCrossoverSql,
} from './comparative-efficiency-change-rate-crossover-constants.js';

const measurementDispositionKeys = Object.freeze([
  'state',
  'capacityConfidenceInterval',
  'wholeTopologyResourceBreakdown',
  'infrastructureCostProjection',
  'practicalEffectClassification',
  'crossoverClassification',
]);
const expectedDisposition = Object.freeze({
  state: 'non_measuring',
  capacityConfidenceInterval: 'absent',
  wholeTopologyResourceBreakdown: 'absent',
  infrastructureCostProjection: 'absent',
  practicalEffectClassification: 'not_evaluable',
  crossoverClassification: 'not_evaluable',
});
const localText = Object.freeze({
  DISPOSITION:
    'changeRateCrossover.liveEvidence.measurementDisposition',
  LIVE_EVIDENCE_INVALID:
    'changeRateCrossover.attempt:live_evidence_invalid',
});

function assertMeasurementDisposition(liveEvidence, fail) {
  const disposition = liveEvidence.measurementDisposition;
  assertBenchmarkResourceExactRecord(
    disposition,
    measurementDispositionKeys,
    localText.DISPOSITION,
  );
  for (let index = 0; index < measurementDispositionKeys.length; index += 1) {
    const field = measurementDispositionKeys[index];
    if (disposition[field] !== expectedDisposition[field]) {
      fail(localText.LIVE_EVIDENCE_INVALID);
    }
  }
}

const owner = createComparativePostgresNonMeasuringAdmission({
  pathPrefix: 'changeRateCrossover',
  workloadVersion: 'comparative-change-rate-crossover-workloads-v1',
  topologyVersion: 'comparative-change-rate-crossover-topology-v1',
  preregistrationVersion:
    'comparative-change-rate-crossover-preregistration-v1',
  liveEvidenceVersion:
    'comparative-change-rate-crossover-live-evidence-v1',
  sourceVersion: 'comparative-change-rate-crossover-live-attempt-v1',
  axes: COMPARATIVE_CHANGE_RATE_CROSSOVER_AXES,
  cells: COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS,
  reason: COMPARATIVE_CHANGE_RATE_CROSSOVER_REASON,
  ownerIdsField: 'policyOwnerIds',
  ownerIds: COMPARATIVE_CHANGE_RATE_CROSSOVER_POLICY_OWNER_IDS,
  witnessField: 'policyWitness',
  buildWitness: buildComparativeChangeRateCrossoverPolicyWitness,
  oracleName: 'row_count_sum_and_diversity_exact',
  expectedResult: comparativeChangeRateCrossoverExpectedResult,
  sql: comparativeChangeRateCrossoverSql,
  workloadCellKeys: Object.freeze([
    'datasetSize',
    'mutationRate',
    'mutationDivisor',
    'workloadDiversity',
    'diversityCount',
    'skew',
    'policy',
    'requestCount',
    'alternativeSql',
    'oracleName',
    'oracleExpected',
  ]),
  projectWorkloadCell(cell, alternativeSql, oracleName, oracleExpected) {
    return {
      datasetSize: cell.datasetSize,
      mutationRate: cell.mutationRate,
      mutationDivisor: cell.mutationDivisor,
      workloadDiversity: cell.workloadDiversity,
      diversityCount: cell.diversityCount,
      skew: cell.skew,
      policy: cell.policy,
      requestCount: cell.requestCount,
      alternativeSql,
      oracleName,
      oracleExpected,
    };
  },
  requiredEvidence: Object.freeze([
    'paired_capacity',
    'whole_topology_resource_windows',
    'capacity_uncertainty',
    'capacity_practical_effect',
    'cost_practical_effect',
    'crossover_classification',
    'immutable_raw_artifacts',
  ]),
  liveEvidenceExtraKeys: Object.freeze(['measurementDisposition']),
  assertLiveExtra: assertMeasurementDisposition,
});

export const assertComparativeChangeRateCrossoverLiveEvidence =
  owner.assertLiveEvidence;
export const assertComparativeChangeRateCrossoverOwners = owner.assertOwners;
export const assertComparativeChangeRateCrossoverSource = owner.assertSource;
export const evaluateComparativeChangeRateCrossoverOracle =
  owner.evaluateOracle;
