import {
  PUBLICATION_OWNER_PRESSURE_STATE,
} from './publication-owner-constants.js';
import {
  isRecord,
} from './publication-recovery-evidence-values.js';

function hasPublicationRecoveryPressureDeferredEvidence(source = null) {
  return isRecord(source) &&
    (
      source.pressureDeferred === true ||
      source.pressureCoalesced === true ||
      source.pressureState === PUBLICATION_OWNER_PRESSURE_STATE.DEFERRED ||
      source.pressureState === PUBLICATION_OWNER_PRESSURE_STATE.COALESCED
    );
}

function hasPublicationRecoveryPressureCoalescedEvidence(source = null) {
  return isRecord(source) &&
    (
      source.pressureCoalesced === true ||
      source.pressureState === PUBLICATION_OWNER_PRESSURE_STATE.COALESCED
    );
}

export {
  hasPublicationRecoveryPressureDeferredEvidence,
  hasPublicationRecoveryPressureCoalescedEvidence,
};
