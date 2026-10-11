/**
 * The single positive PREPARE-evidence predicate shared by live decision
 * formation and restart recovery. A coordinator may record COMMIT only when
 * every participant supplied all three durable coordinates.
 */

import {copyStrictOwnDataRecord} from '../../utils/strict-own-data.js';

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function completePrepareEvidenceOf(value) {
  // This boundary is also called by injected participant adapters in unit
  // and recovery owners. Capture an ordinary own-data record once so an
  // inherited field or getter cannot change the evidence between validation
  // and retention. The production wire has already bound this canonical
  // evidence to the exact PREPARE request before returning it here.
  const captured = copyStrictOwnDataRecord(value);
  if (captured === null ||
      typeof captured.preparedDigest !== 'string' ||
      captured.preparedDigest.length === 0 ||
      !isPositiveSafeInteger(captured.prepareIndex) ||
      !isPositiveSafeInteger(captured.prepareTerm)) {
    return null;
  }
  return {
    preparedDigest: captured.preparedDigest,
    prepareIndex: captured.prepareIndex,
    prepareTerm: captured.prepareTerm,
  };
}

export {completePrepareEvidenceOf, isPositiveSafeInteger};
