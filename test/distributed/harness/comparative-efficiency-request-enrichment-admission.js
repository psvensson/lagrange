import {
  createComparativePostgresNonMeasuringAdmission,
} from './comparative-efficiency-postgres-nonmeasuring-admission.js';
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

const owner = createComparativePostgresNonMeasuringAdmission({
  pathPrefix: 'requestEnrichment',
  workloadVersion: 'comparative-request-enrichment-workloads-v1',
  topologyVersion: 'comparative-request-enrichment-topology-v1',
  preregistrationVersion:
    'comparative-request-enrichment-preregistration-v1',
  liveEvidenceVersion: 'comparative-request-enrichment-live-evidence-v1',
  sourceVersion: 'comparative-request-enrichment-live-attempt-v1',
  axes: COMPARATIVE_REQUEST_ENRICHMENT_AXES,
  cells: COMPARATIVE_REQUEST_ENRICHMENT_CELLS,
  reason: COMPARATIVE_REQUEST_ENRICHMENT_REASON,
  ownerIdsField: 'affinityOwnerIds',
  ownerIds: COMPARATIVE_REQUEST_ENRICHMENT_AFFINITY_OWNER_IDS,
  witnessField: 'affinityOwnerWitness',
  buildWitness: buildComparativeRequestEnrichmentAffinityWitness,
  oracleName: 'row_count_and_sum_exact',
  expectedResult: comparativeRequestEnrichmentExpectedResult,
  sql: comparativeRequestEnrichmentSql,
  workloadCellKeys: Object.freeze([
    'datasetSize',
    'fanout',
    'readLocality',
    'skew',
    'requestCount',
    'alternativeSql',
    'oracleName',
    'oracleExpected',
  ]),
  projectWorkloadCell(cell, alternativeSql, oracleName, oracleExpected) {
    return {
      datasetSize: cell.datasetSize,
      fanout: cell.fanout,
      readLocality: cell.readLocality,
      skew: cell.skew,
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
  ]),
  liveEvidenceExtraKeys: Object.freeze([]),
  assertLiveExtra() {},
});

export const assertComparativeRequestEnrichmentLiveEvidence =
  owner.assertLiveEvidence;
export const assertComparativeRequestEnrichmentOwners = owner.assertOwners;
export const assertComparativeRequestEnrichmentSource = owner.assertSource;
export const evaluateComparativeRequestEnrichmentOracle =
  owner.evaluateOracle;
