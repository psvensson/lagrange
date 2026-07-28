import {
  SCALE_CLAIM_REASON,
} from './scale-evidence-contract.js';

export const COMPARATIVE_CLAIM_PROJECTION_SCHEMA_VERSION =
  'comparative-efficiency-claim-projection-v1';

export const COMPARATIVE_CLAIM_CERTIFICATION_STATE = Object.freeze({
  ABSENT: 'absent',
  ATTACHED: 'attached',
});

export const COMPARATIVE_CLAIM_EFFECT_OUTCOME = Object.freeze({
  ANALYTICAL_ESTIMATE: 'analytical_estimate',
  CANDIDATE_WIN: 'candidate_win',
  ALTERNATIVE_WIN: 'alternative_win',
  NEUTRAL: 'neutral',
  INCONCLUSIVE: 'inconclusive',
  PRACTICALLY_INSIGNIFICANT: 'practically_insignificant',
  NOT_EVALUABLE: 'not_evaluable',
});

export const COMPARATIVE_CLAIM_METRIC = Object.freeze({
  ANALYTICAL_OPPORTUNITY: 'analytical_opportunity',
  CAPACITY: 'capacity',
  COST: 'infrastructure_cost',
});

export const COMPARATIVE_CLAIM_SUBJECT_KIND = Object.freeze({
  ANALYTICAL_WORKLOAD: 'analytical_workload',
  EVIDENCE_ROOT: 'evidence_root',
  MATRIX_CELL: 'matrix_cell',
});

export const COMPARATIVE_CLAIM_PROFILE_STATE = Object.freeze({
  IDENTIFIED: 'identified',
  NOT_APPLICABLE: 'not_applicable',
});

export const COMPARATIVE_CLAIM_EVIDENCE_STATE = Object.freeze({
  ABSENT: 'absent',
  ANALYTICAL_OUTPUT: 'analytical_output',
  VERIFIED_EFFECT: 'verified_effect',
});

export const COMPARATIVE_CLAIM_SOURCE_STATE = Object.freeze({
  CALCULATOR: 'calculator',
  INVALID_ROOT: 'invalid_root',
  VERIFIED_ROOT: 'verified_root',
});

export const COMPARATIVE_CLAIM_REASON = Object.freeze({
  CALCULATOR_ERROR: 'calculator_error',
  EVIDENCE_INVALID: 'evidence_invalid',
  MATRIX_ID_MISMATCH: 'matrix_id_mismatch',
  EVALUATION_TIME_INVALID: 'evaluation_time_invalid',
  EVIDENCE_NOT_YET_VALID: 'evidence_not_yet_valid',
  EVIDENCE_EXPIRED: 'evidence_expired',
  EVIDENCE_NOT_CLAIM_ELIGIBLE: 'evidence_not_claim_eligible',
  NON_MEASURING: 'non_measuring',
  EFFECT_INCONCLUSIVE: 'effect_inconclusive',
  EFFECT_PRACTICALLY_INSIGNIFICANT:
    'effect_practically_insignificant',
  PRICE_NOT_YET_VALID: 'price_not_yet_valid',
  PRICE_EXPIRED: 'price_expired',
  CERTIFICATION_ABSENT:
    SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_ABSENT,
  CERTIFICATION_INVALID:
    SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_RECEIPT_INVALID,
  CERTIFICATION_EVALUATION_TIME_REQUIRED:
    SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_EVALUATION_TIME_REQUIRED,
  CERTIFICATION_NOT_YET_VALID:
    SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_NOT_YET_VALID,
  CERTIFICATION_EXPIRED:
    SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_EXPIRED,
});
