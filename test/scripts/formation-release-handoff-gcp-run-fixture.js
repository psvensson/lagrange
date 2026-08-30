// Minimal excerpt of the five-node GCP formation-release run
// 2026-08-30T07-13-07.175Z (full-logs node-0..node-4), in the exact event
// shapes the runner reads (scripts/checks/run-formation-release-handoff-gcp.js
// readLogEvents merges the per-node logs in file order). Generation e1:1
// captured joiner a8435bc8 and completed 12.3 s later; generation e1:4
// captured the three remaining joiners, was retained (its last recorded
// transition is `active` at 07:16:52.663 with one member READY), was never
// revoked, and the seed marked draining at 07:17:09.238 with two members
// still pending. Shared by the analyzer classification witness and the
// per-phase projection witness so both read one immutable excerpt.

import {formationReleaseGenerationIdentity} from
  '../../src/control-plane/formation-release-handoff-identity.js';

const SOURCE_FINGERPRINT = 'db3b96930e641e3a';
const SEED = 'd286cc79-65b5-4d65-abe6-5fa32d0a26a0';
const JOINER_FIRST = 'a8435bc8-40c3-48e3-aba5-839320b2d5d0';
const JOINER_SPREAD = 'c8d96fdd-cc4a-47db-b2ca-a9aaf4827f69';
const JOINER_LATE_A = 'ce2e1fe2-4efb-4c30-85c6-7988dfd4bb74';
const JOINER_LATE_B = '69714282-5c61-4590-8d42-4b0e6742b570';
const NODE_IDS = Object.freeze([
  SEED, JOINER_FIRST, JOINER_SPREAD, JOINER_LATE_A, JOINER_LATE_B,
]);
const BOOT_INCARNATION = 1;
const FIRST_EPOCH = 1;
const SECOND_EPOCH = 4;
const TRANSITION_MESSAGE = 'Formation release handoff authority transition';
const BARRIER_MESSAGE = 'Join priority-placement formation barrier';
const DRAINING_MESSAGE = 'Bootstrap readiness marked draining';
const BOOT_MESSAGE = 'Distributed Database System starting';
const STATE_ACTIVE = 'active';
const STATE_COMPLETE = 'complete';
const STATE_REVOKED = 'revoked';
const ACTIVE_REASON = 'retained_until_captured_cohort_ready';
const COMPLETE_REASON = 'captured_cohort_ready';
const REVOKE_REASON_MEMBER_MISSING = 'captured_cohort_member_missing';
const REVOKE_REASON_AUTHORITY_INCOMPATIBLE =
  'startup_authority_incompatible';
const NOT_SPREAD = 'priority_partitions_not_spread';
const BARRIER_WAITING_COHORT = 'waiting_for_formation_cohort';
const BARRIER_WAITING_AUTHORITY = 'waiting_for_startup_authority';
const BARRIER_RELEASED = 'ledger_spread_satisfied';
const SA_READY = 'ready';
const SA_RECOVERY_PENDING = 'recovery_pending';
const DRAIN_PHASE = 'DEGRADED';
const DRAIN_REASONS = Object.freeze([
  'NODE_DRAINING', 'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING',
]);
const DRAIN_DEADLINE_MS = 1788074239222;
const DRAINING_AT = '2026-08-30T07:17:09.238Z';
const LAST_ACTIVE_AT = '2026-08-30T07:16:52.663Z';
const FIRST_CAPTURE_AT = '2026-08-30T07:16:03.868Z';
const FIRST_COMPLETE_AT = '2026-08-30T07:16:16.156Z';
const SECOND_CAPTURE_AT = '2026-08-30T07:16:16.157Z';

const FIRST_COHORT = Object.freeze([
  Object.freeze({nodeId: JOINER_FIRST, bootIncarnation: BOOT_INCARNATION}),
]);
const SECOND_COHORT = Object.freeze([
  Object.freeze({nodeId: JOINER_LATE_B, bootIncarnation: BOOT_INCARNATION}),
  Object.freeze({nodeId: JOINER_SPREAD, bootIncarnation: BOOT_INCARNATION}),
  Object.freeze({nodeId: JOINER_LATE_A, bootIncarnation: BOOT_INCARNATION}),
]);
const FIRST_GENERATION = formationReleaseGenerationIdentity(
  FIRST_EPOCH, SEED, BOOT_INCARNATION, FIRST_COHORT,
);
const SECOND_GENERATION = formationReleaseGenerationIdentity(
  SECOND_EPOCH, SEED, BOOT_INCARNATION, SECOND_COHORT,
);

function cohortCopy(cohort) {
  return cohort.map((member) => ({...member}));
}

function transition(generation, epoch, cohort, overrides) {
  return {
    nodeId: SEED,
    generation,
    authorityNodeId: SEED,
    authorityBootIncarnation: BOOT_INCARNATION,
    capturedPublicationEpoch: epoch,
    requiredCohort: cohortCopy(cohort),
    msg: TRANSITION_MESSAGE,
    ...overrides,
  };
}

function barrier(time, nodeId, state, startupAuthorityState, handoff) {
  return {
    time,
    nodeId,
    state,
    startupAuthorityState,
    formationReleaseHandoffState: handoff ? STATE_ACTIVE : null,
    formationReleaseHandoffGeneration: handoff ? SECOND_GENERATION : null,
    formationReleaseHandoffReleaseAuthorized: handoff === true,
    msg: BARRIER_MESSAGE,
  };
}

function bootEvents() {
  return NODE_IDS.map((nodeId, index) => ({
    time: `2026-08-30T07:15:4${index}.000Z`,
    nodeId,
    bootedSrcFingerprint: SOURCE_FINGERPRINT,
    expectedSrcFingerprint: SOURCE_FINGERPRINT,
    srcFingerprintMatches: true,
    msg: BOOT_MESSAGE,
  }));
}

function firstGenerationEvents() {
  return [
    transition(FIRST_GENERATION, FIRST_EPOCH, FIRST_COHORT, {
      time: FIRST_CAPTURE_AT,
      state: STATE_ACTIVE,
      reason: ACTIVE_REASON,
      releaseAuthorized: false,
      observedAuthorityReady: true,
      observedRecoveryReasonCodes: [],
      readyNodeIds: [],
      pendingNodeIds: [JOINER_FIRST],
    }),
    transition(FIRST_GENERATION, FIRST_EPOCH, FIRST_COHORT, {
      time: '2026-08-30T07:16:04.469Z',
      state: STATE_ACTIVE,
      reason: ACTIVE_REASON,
      releaseAuthorized: true,
      observedAuthorityReady: true,
      observedRecoveryReasonCodes: [],
      readyNodeIds: [],
      pendingNodeIds: [JOINER_FIRST],
    }),
    transition(FIRST_GENERATION, FIRST_EPOCH, FIRST_COHORT, {
      time: FIRST_COMPLETE_AT,
      state: STATE_COMPLETE,
      reason: COMPLETE_REASON,
      releaseAuthorized: false,
      observedAuthorityReady: true,
      observedRecoveryReasonCodes: [],
      readyNodeIds: [JOINER_FIRST],
      pendingNodeIds: [],
    }),
  ];
}

// The second generation exactly as recorded: captured, authorized, the owner
// observes the spread reopen (ready -> not spread) while retaining it, one
// member publishes READY, and no later transition is ever recorded.
function secondGenerationRetainedEvents() {
  return [
    transition(SECOND_GENERATION, SECOND_EPOCH, SECOND_COHORT, {
      time: SECOND_CAPTURE_AT,
      state: STATE_ACTIVE,
      reason: ACTIVE_REASON,
      releaseAuthorized: false,
      observedAuthorityReady: true,
      observedRecoveryReasonCodes: [],
      readyNodeIds: [],
      pendingNodeIds: [JOINER_LATE_B, JOINER_SPREAD, JOINER_LATE_A],
    }),
    transition(SECOND_GENERATION, SECOND_EPOCH, SECOND_COHORT, {
      time: '2026-08-30T07:16:16.547Z',
      state: STATE_ACTIVE,
      reason: ACTIVE_REASON,
      releaseAuthorized: true,
      observedAuthorityReady: false,
      observedRecoveryReasonCodes: [NOT_SPREAD],
      readyNodeIds: [],
      pendingNodeIds: [JOINER_LATE_B, JOINER_SPREAD, JOINER_LATE_A],
    }),
    transition(SECOND_GENERATION, SECOND_EPOCH, SECOND_COHORT, {
      time: LAST_ACTIVE_AT,
      state: STATE_ACTIVE,
      reason: ACTIVE_REASON,
      releaseAuthorized: true,
      observedAuthorityReady: false,
      observedRecoveryReasonCodes: [NOT_SPREAD],
      readyNodeIds: [JOINER_SPREAD],
      pendingNodeIds: [JOINER_LATE_B, JOINER_LATE_A],
    }),
  ];
}

function drainingEvent(nodeId, time) {
  return {
    time,
    nodeId,
    phase: DRAIN_PHASE,
    reasons: [...DRAIN_REASONS],
    drainDeadlineMs: DRAIN_DEADLINE_MS,
    msg: DRAINING_MESSAGE,
  };
}

function joinerBarrierEvents() {
  return [
    barrier('2026-08-30T07:16:08.626Z', JOINER_FIRST,
      BARRIER_WAITING_COHORT, SA_READY, false),
    barrier('2026-08-30T07:16:12.708Z', JOINER_FIRST,
      BARRIER_RELEASED, SA_READY, false),
    barrier('2026-08-30T07:16:22.455Z', JOINER_SPREAD,
      BARRIER_WAITING_COHORT, SA_RECOVERY_PENDING, false),
    barrier('2026-08-30T07:16:25.463Z', JOINER_SPREAD,
      BARRIER_WAITING_AUTHORITY, SA_RECOVERY_PENDING, false),
    barrier('2026-08-30T07:16:52.401Z', JOINER_SPREAD,
      BARRIER_RELEASED, SA_READY, true),
    barrier('2026-08-30T07:16:33.949Z', JOINER_LATE_A,
      BARRIER_WAITING_AUTHORITY, SA_RECOVERY_PENDING, false),
    barrier('2026-08-30T07:17:12.128Z', JOINER_LATE_A,
      BARRIER_RELEASED, SA_READY, false),
    barrier('2026-08-30T07:16:33.952Z', JOINER_LATE_B,
      BARRIER_WAITING_AUTHORITY, SA_RECOVERY_PENDING, false),
    barrier('2026-08-30T07:17:12.119Z', JOINER_LATE_B,
      BARRIER_RELEASED, SA_READY, false),
  ];
}

// The run as recorded: seed log first (transitions, then its draining
// marker), then the joiner logs.
function buildStrandedTeardownRunEvents() {
  return [
    ...bootEvents(),
    ...firstGenerationEvents(),
    ...secondGenerationRetainedEvents(),
    drainingEvent(SEED, DRAINING_AT),
    ...joinerBarrierEvents(),
  ];
}

// Counterfactual: the same run with no draining marker anywhere (the log
// ends while the generation is still active) — the retention cannot be
// attributed to teardown.
function buildRetainedWithoutDrainEvents() {
  return [
    ...bootEvents(),
    ...firstGenerationEvents(),
    ...secondGenerationRetainedEvents(),
    ...joinerBarrierEvents(),
  ];
}

// Counterfactual: the second generation completes 20 s after capture
// instead of being retained at teardown (both generations complete).
function buildBothCompletedRunEvents() {
  const secondCompleteAt = '2026-08-30T07:16:36.157Z';
  return [
    ...bootEvents(),
    ...firstGenerationEvents(),
    ...secondGenerationRetainedEvents(),
    transition(SECOND_GENERATION, SECOND_EPOCH, SECOND_COHORT, {
      time: secondCompleteAt,
      state: STATE_COMPLETE,
      reason: COMPLETE_REASON,
      releaseAuthorized: false,
      observedAuthorityReady: false,
      observedRecoveryReasonCodes: [NOT_SPREAD],
      readyNodeIds: [JOINER_LATE_B, JOINER_SPREAD, JOINER_LATE_A],
      pendingNodeIds: [],
    }),
    drainingEvent(SEED, DRAINING_AT),
    ...joinerBarrierEvents(),
  ];
}

// Counterfactual: the second generation is withdrawn by a VALID
// member-missing revocation after the seed marked draining (the existing
// teardown-truncation class).
function buildTeardownTruncatedRunEvents() {
  return [
    ...bootEvents(),
    ...firstGenerationEvents(),
    ...secondGenerationRetainedEvents(),
    drainingEvent(SEED, DRAINING_AT),
    transition(SECOND_GENERATION, SECOND_EPOCH, SECOND_COHORT, {
      time: '2026-08-30T07:17:09.400Z',
      state: STATE_REVOKED,
      reason: REVOKE_REASON_MEMBER_MISSING,
      releaseAuthorized: false,
      observedAuthorityReady: null,
      observedRecoveryReasonCodes: [],
      readyNodeIds: [],
      pendingNodeIds: [],
    }),
    ...joinerBarrierEvents(),
  ];
}

// Reverted-arm counterfactual: the second generation is withdrawn by an
// INVALID startup-authority-incompatible revocation before the seed marked
// draining (the reverted retention mechanism releasing a captured cohort).
function buildInvalidRevocationRunEvents() {
  return [
    ...bootEvents(),
    ...firstGenerationEvents(),
    ...secondGenerationRetainedEvents(),
    transition(SECOND_GENERATION, SECOND_EPOCH, SECOND_COHORT, {
      time: '2026-08-30T07:16:53.000Z',
      state: STATE_REVOKED,
      reason: REVOKE_REASON_AUTHORITY_INCOMPATIBLE,
      releaseAuthorized: false,
      observedAuthorityReady: null,
      observedRecoveryReasonCodes: [],
      readyNodeIds: [],
      pendingNodeIds: [],
    }),
    drainingEvent(SEED, DRAINING_AT),
    ...joinerBarrierEvents(),
  ];
}

// Reverted-arm counterfactual: only the first generation is ever captured
// and completed; no spread reopen is witnessed, so retention across the
// reopen is never proven.
function buildNoReopenRunEvents() {
  return [
    ...bootEvents(),
    ...firstGenerationEvents(),
    drainingEvent(SEED, DRAINING_AT),
    ...joinerBarrierEvents(),
  ];
}

const STRANDED_TEARDOWN_RUN = Object.freeze({
  sourceFingerprint: SOURCE_FINGERPRINT,
  seed: SEED,
  joiners: Object.freeze({
    first: JOINER_FIRST,
    spread: JOINER_SPREAD,
    lateA: JOINER_LATE_A,
    lateB: JOINER_LATE_B,
  }),
  firstGeneration: FIRST_GENERATION,
  secondGeneration: SECOND_GENERATION,
  firstCaptureAt: FIRST_CAPTURE_AT,
  firstCompleteAt: FIRST_COMPLETE_AT,
  secondCaptureAt: SECOND_CAPTURE_AT,
  lastActiveAt: LAST_ACTIVE_AT,
  drainingAt: DRAINING_AT,
});

export {
  STRANDED_TEARDOWN_RUN,
  buildBothCompletedRunEvents,
  buildInvalidRevocationRunEvents,
  buildNoReopenRunEvents,
  buildRetainedWithoutDrainEvents,
  buildStrandedTeardownRunEvents,
  buildTeardownTruncatedRunEvents,
};
