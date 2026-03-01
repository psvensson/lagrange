import {INVARIANT_SEVERITY} from '../../../src/invariants/invariant-catalog.js';

const HARD_INVARIANT_SEVERITIES = new Set([
  INVARIANT_SEVERITY.CRITICAL,
  INVARIANT_SEVERITY.ERROR,
]);

function normalizeInvariantEntries(invariants) {
  return Array.isArray(invariants) ?
    invariants.filter((invariant) => invariant && typeof invariant === 'object') :
    [];
}

function toSerializableBreach(invariant) {
  return {
    invariantId: typeof invariant.invariantId === 'string' ?
      invariant.invariantId :
      null,
    reasonCode: typeof invariant.reasonCode === 'string' ?
      invariant.reasonCode :
      (typeof invariant.code === 'string' ? invariant.code : null),
    severity: typeof invariant.severity === 'string' ?
      invariant.severity :
      INVARIANT_SEVERITY.WARNING,
    scope: typeof invariant.scope === 'string' ? invariant.scope : null,
    entityId: typeof invariant.entityId === 'string' ? invariant.entityId : null,
    owningSubsystem:
      typeof invariant.owningSubsystem === 'string' ?
        invariant.owningSubsystem :
        null,
    observed:
      invariant.observed && typeof invariant.observed === 'object' &&
        !Array.isArray(invariant.observed) ?
        {...invariant.observed} :
        {},
    details:
      invariant.details && typeof invariant.details === 'object' &&
        !Array.isArray(invariant.details) ?
        {...invariant.details} :
        {},
  };
}

function summarizeInvariantBreaches(invariants) {
  const failing = normalizeInvariantEntries(invariants)
    .filter((invariant) => invariant.passed === false)
    .map(toSerializableBreach);
  const hardBreaches = failing.filter((invariant) =>
    HARD_INVARIANT_SEVERITIES.has(invariant.severity),
  );
  const softBreaches = failing.filter((invariant) =>
    !HARD_INVARIANT_SEVERITIES.has(invariant.severity),
  );

  return {
    totalCount: failing.length,
    hardCount: hardBreaches.length,
    softCount: softBreaches.length,
    failing,
    hardBreaches,
    softBreaches,
  };
}

function hasHardInvariantBreaches(invariants) {
  return summarizeInvariantBreaches(invariants).hardCount > 0;
}

export {
  hasHardInvariantBreaches,
  summarizeInvariantBreaches,
};
