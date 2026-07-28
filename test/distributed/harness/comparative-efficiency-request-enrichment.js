import {
  assertComparativeRequestEnrichmentLiveEvidence,
  assertComparativeRequestEnrichmentOwners,
  assertComparativeRequestEnrichmentSource,
} from './comparative-efficiency-request-enrichment-admission.js';
import {
  COMPARATIVE_REQUEST_ENRICHMENT_AXES,
  COMPARATIVE_REQUEST_ENRICHMENT_CELLS,
  COMPARATIVE_REQUEST_ENRICHMENT_DISPOSITION,
  COMPARATIVE_REQUEST_ENRICHMENT_REASON,
} from './comparative-efficiency-request-enrichment-constants.js';
import {
  createComparativePostgresNonMeasuringEvidenceOwner,
} from './comparative-efficiency-postgres-nonmeasuring-evidence.js';

export {
  COMPARATIVE_REQUEST_ENRICHMENT_AFFINITY_OWNER_IDS,
  COMPARATIVE_REQUEST_ENRICHMENT_AXES,
  COMPARATIVE_REQUEST_ENRICHMENT_CELLS,
  COMPARATIVE_REQUEST_ENRICHMENT_ORACLE,
  COMPARATIVE_REQUEST_ENRICHMENT_REASON,
  COMPARATIVE_REQUEST_ENRICHMENT_SCENARIO,
  comparativeRequestEnrichmentExpectedResult,
  comparativeRequestEnrichmentSql,
} from './comparative-efficiency-request-enrichment-constants.js';

const owner = createComparativePostgresNonMeasuringEvidenceOwner({
  pathPrefix: 'requestEnrichment',
  axes: COMPARATIVE_REQUEST_ENRICHMENT_AXES,
  cells: COMPARATIVE_REQUEST_ENRICHMENT_CELLS,
  disposition: COMPARATIVE_REQUEST_ENRICHMENT_DISPOSITION,
  reason: COMPARATIVE_REQUEST_ENRICHMENT_REASON,
  sourceVersion: 'comparative-request-enrichment-live-attempt-v1',
  witnessCountField: 'affinityOwnerWitnessCount',
  admission: Object.freeze({
    assertLiveEvidence: assertComparativeRequestEnrichmentLiveEvidence,
    assertOwners: assertComparativeRequestEnrichmentOwners,
    assertSource: assertComparativeRequestEnrichmentSource,
  }),
});

export const createComparativeRequestEnrichmentEvidence =
  owner.createEvidence;
export const inspectComparativeRequestEnrichmentEvidence =
  owner.inspectEvidence;
export const comparativeRequestEnrichmentEvidenceDigest =
  owner.evidenceDigest;
