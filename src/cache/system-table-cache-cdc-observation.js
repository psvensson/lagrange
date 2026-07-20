import {CACHE_CDC_OPERATIONS} from './cache-constants.js';

function resolveCdcOriginHlc(row) {
  if (typeof row?.updated_at_hlc === 'string') {
    return row.updated_at_hlc;
  }
  return typeof row?.updatedAtHlc === 'string' ? row.updatedAtHlc : null;
}

/**
 * Retain CDC receipt provenance only when it names the accepted row origin.
 * Stale CDC backfills leave the newer row's observation untouched, while
 * non-CDC mutation owners invalidate CDC-only evidence.
 * @param {Object} apply
 */
function updateSystemTableCacheCdcObservation(apply) {
  if (apply.operation === CACHE_CDC_OPERATIONS.DELETE) {
    apply.observationTable.delete(apply.key);
    return;
  }
  const observedAtMs = apply.options.cdcObservedAtMs;
  if (!Number.isFinite(observedAtMs) || observedAtMs < 0) {
    apply.observationTable.delete(apply.key);
    return;
  }
  if (!apply.incomingVersionAccepted) {
    return;
  }
  const incomingOriginHlc = resolveCdcOriginHlc(apply.data);
  const resultingOriginHlc = resolveCdcOriginHlc(apply.resultingRow);
  if (incomingOriginHlc && incomingOriginHlc === resultingOriginHlc) {
    apply.observationTable.set(apply.key, {
      observedAtMs: Math.floor(observedAtMs),
      originHlc: incomingOriginHlc,
    });
    return;
  }
  apply.observationTable.delete(apply.key);
}

export {updateSystemTableCacheCdcObservation};
