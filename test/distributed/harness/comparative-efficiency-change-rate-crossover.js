import {
  assertComparativeChangeRateCrossoverLiveEvidence,
  assertComparativeChangeRateCrossoverOwners,
  assertComparativeChangeRateCrossoverSource,
} from './comparative-efficiency-change-rate-crossover-admission.js';
import {
  COMPARATIVE_CHANGE_RATE_CROSSOVER_AXES,
  COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS,
  COMPARATIVE_CHANGE_RATE_CROSSOVER_DISPOSITION,
  COMPARATIVE_CHANGE_RATE_CROSSOVER_REASON,
} from './comparative-efficiency-change-rate-crossover-constants.js';
import {
  createComparativePostgresNonMeasuringEvidenceOwner,
} from './comparative-efficiency-postgres-nonmeasuring-evidence.js';

export {
  COMPARATIVE_CHANGE_RATE_CROSSOVER_POLICY_OWNER_IDS,
  COMPARATIVE_CHANGE_RATE_CROSSOVER_AXES,
  COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS,
  COMPARATIVE_CHANGE_RATE_CROSSOVER_ORACLE,
  COMPARATIVE_CHANGE_RATE_CROSSOVER_REASON,
  COMPARATIVE_CHANGE_RATE_CROSSOVER_SCENARIO,
  comparativeChangeRateCrossoverExpectedResult,
  comparativeChangeRateCrossoverMutationCount,
  comparativeChangeRateCrossoverSql,
} from './comparative-efficiency-change-rate-crossover-constants.js';

const owner = createComparativePostgresNonMeasuringEvidenceOwner({
  pathPrefix: 'changeRateCrossover',
  axes: COMPARATIVE_CHANGE_RATE_CROSSOVER_AXES,
  cells: COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS,
  disposition: COMPARATIVE_CHANGE_RATE_CROSSOVER_DISPOSITION,
  reason: COMPARATIVE_CHANGE_RATE_CROSSOVER_REASON,
  sourceVersion: 'comparative-change-rate-crossover-live-attempt-v1',
  witnessCountField: 'policyWitnessCount',
  admission: Object.freeze({
    assertLiveEvidence: assertComparativeChangeRateCrossoverLiveEvidence,
    assertOwners: assertComparativeChangeRateCrossoverOwners,
    assertSource: assertComparativeChangeRateCrossoverSource,
  }),
});

export const createComparativeChangeRateCrossoverEvidence =
  owner.createEvidence;
export const inspectComparativeChangeRateCrossoverEvidence =
  owner.inspectEvidence;
export const comparativeChangeRateCrossoverEvidenceDigest =
  owner.evidenceDigest;
