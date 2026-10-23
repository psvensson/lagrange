// Observation values only. None is an original opening or publication grant.
const SEED_RETAINED_EFFECT_STATE = Object.freeze({
  ACCEPTED: 'original-effects-observed',
  CONTRARY: 'original-effects-contrary',
  UNAVAILABLE: 'original-effects-unavailable',
});
const SEED_RETAINED_EFFECT_REASON = Object.freeze({
  OBSERVATION: 'owner-observation-unavailable',
  OWNER_CONTRARY: 'owner-observation-contrary',
  TRANSACTION: 'caller-transaction',
  IDENTITY: 'original-member-identity',
  NATIVE: 'native-history',
  COVERAGE: 'incomplete-native-coverage',
  CONFIGURATION: 'retained-configuration',
  COMMAND: 'nonoriginal-command',
  ORIGIN: 'participant-origin',
  PARTICIPANT: 'participant-transaction-present',
  GENERATION: 'write-generation',
  OUTCOME: 'statement-outcome',
  ROWS: 'foundation-rows',
  SCHEMA: 'partition-physical-schema',
  ENFORCEMENT: 'participant-origin-schema-enforcement',
  OBLIGATION: 'source-obligation',
  ACK: 'source-acknowledgment',
  PENDING_SOURCE: 'unapplied-source-dependency',
  MG_SOURCE: 'recipient-source-occurrence-unavailable',
});
const SEED_RETAINED_EFFECT_KIND = Object.freeze({
  NOOP: 'native-noop',
  ORIGIN: 'participant-origin',
  FOUNDATION: 'original-foundation',
  ACK: 'source-acknowledgment',
  CDC: 'recipient-foundation-content',
});
export {SEED_RETAINED_EFFECT_STATE, SEED_RETAINED_EFFECT_REASON,
  SEED_RETAINED_EFFECT_KIND};
