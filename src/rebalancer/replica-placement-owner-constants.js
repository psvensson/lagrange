import {PLACEMENT_CLASS} from '../bootstrap/system-partition-classification.js';
import {PLACEMENT_ADMISSION_ERROR} from '../partition/partition-placement-admission-constants.js';
// The vocabulary of the one replica placement owner (quest
// replica-placement-admission-owner, design sections 2.5-2.7 and 2.12 item 2):
// the typed outcomes of PLACEMENT_ADMIT and PLACEMENT_RELEASE_HOLD (their
// type names are the partition's, partition-placement-admission-constants.js),
// the placement classes in their one order, the deficit kinds, the copy
// capacities (owner decision D2), and the one table that maps every waiting
// reason on the admission path to the trigger that clears it.
//
// Nothing here decides anything: the owner's pure modules (deficits, order,
// admission statement) and the partition's applier
// (partition/partition-placement-admission.js) read these names.
import {INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME} from
  '../bootstrap/system-table-schemas-constants.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL as WRITE_REFUSAL} from
  '../partition/partition-service-constants.js';

// Owner decision D2 (2026-11-18, WP-A): copy-phase operations per copy source
// and per target. They travel in every command, so every replica's applier
// evaluates the same numbers.
const PLACEMENT_COPY_CAPACITY = Object.freeze({K_SRC: 6, K_TGT: 3});

const PLACEMENT_TRANSITION_KIND = Object.freeze({
  PLACEMENT: 'PLACEMENT',
  FOUND: 'FOUND',
  RUNTIME_SERVICE: 'RUNTIME_SERVICE',
});

const PLACEMENT_MOVE_TYPE = Object.freeze({
  ADD: 'ADD',
  REMOVE: 'REMOVE',
  REPLACE: 'REPLACE',
  PROMOTE: 'PROMOTE',
  GROWTH_PROMOTE: 'GROWTH_PROMOTE',
});

// The one admission order (design section 2.6): the operation ledger, the
// other priority control-plane partitions, then - after the formation latch
// is FORMED - nodes-p1, the other system partitions and user partitions.
const PLACEMENT_CLASS_ORDER = Object.freeze([
  PLACEMENT_CLASS.LEDGER,
  PLACEMENT_CLASS.PRIORITY,
  PLACEMENT_CLASS.FORMATION_DEPENDENCY,
  PLACEMENT_CLASS.SYSTEM,
  PLACEMENT_CLASS.USER,
]);
// Classes admitted only once the formation latch answers FORMED.
const PLACEMENT_FORMATION_GATED_CLASSES = Object.freeze(new Set([
  PLACEMENT_CLASS.FORMATION_DEPENDENCY,
  PLACEMENT_CLASS.SYSTEM,
  PLACEMENT_CLASS.USER,
]));
// Classes whose every move may use all of K_src (design section 2.6).
const PLACEMENT_FULL_SOURCE_CAPACITY_CLASSES = Object.freeze(new Set([
  PLACEMENT_CLASS.LEDGER,
  PLACEMENT_CLASS.PRIORITY,
]));
// Within the system class these go first (design section 2.6, class 4).
const PLACEMENT_SYSTEM_FIRST_PARTITION_IDS = Object.freeze([
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.PARTITIONS],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.TABLES],
]);

// Deficit kinds, in severity order (design section 2.6, founding-membership
// section 2.7.1). Repair kinds may use all of K_src in every class.
const PLACEMENT_DEFICIT_KIND = Object.freeze({
  DEAD_LEARNER: 'DEAD_LEARNER',
  FAILED_OR_DEAD: 'FAILED_OR_DEAD',
  PROMOTION_READY: 'PROMOTION_READY',
  LEARNER_DEFICIT: 'LEARNER_DEFICIT',
  UNDER_REPLICATED: 'UNDER_REPLICATED',
  HOST_SPREAD: 'HOST_SPREAD',
  SURPLUS: 'SURPLUS',
  REBALANCE: 'REBALANCE',
});
const PLACEMENT_DEFICIT_SEVERITY = Object.freeze([
  PLACEMENT_DEFICIT_KIND.DEAD_LEARNER,
  PLACEMENT_DEFICIT_KIND.FAILED_OR_DEAD,
  PLACEMENT_DEFICIT_KIND.PROMOTION_READY,
  PLACEMENT_DEFICIT_KIND.LEARNER_DEFICIT,
  PLACEMENT_DEFICIT_KIND.UNDER_REPLICATED,
  PLACEMENT_DEFICIT_KIND.HOST_SPREAD,
  PLACEMENT_DEFICIT_KIND.SURPLUS,
  PLACEMENT_DEFICIT_KIND.REBALANCE,
]);
const PLACEMENT_REPAIR_DEFICIT_KINDS = Object.freeze(new Set([
  PLACEMENT_DEFICIT_KIND.DEAD_LEARNER,
  PLACEMENT_DEFICIT_KIND.FAILED_OR_DEAD,
  PLACEMENT_DEFICIT_KIND.UNDER_REPLICATED,
]));

// The durable dispatch hold an engaged ledger move is admitted with; the
// owner's committed PLACEMENT_RELEASE_HOLD lifts it at copy-phase idle.
const PLACEMENT_DISPATCH_HOLD = Object.freeze({
  LEDGER_AWAITING_COPY_IDLE: 'LEDGER_AWAITING_COPY_IDLE',
});

// The formation answer placement consumes (formation-latch-design.md 6.2):
// answerCommittedNodes().formation.state.
const PLACEMENT_FORMATION_STATE = Object.freeze({
  FORMED: 'FORMED',
  FORMING: 'FORMING',
  UNDECLARED: 'UNDECLARED',
  UNAVAILABLE: 'UNAVAILABLE',
});

// The committed outcome of one PLACEMENT_ADMIT / PLACEMENT_RELEASE_HOLD,
// recorded under its entryId.
const PLACEMENT_OUTCOME = Object.freeze({
  ADMITTED: 'ADMITTED',
  RELEASED: 'RELEASED',
  REFUSED: 'REFUSED',
});

// The applier's typed refusals (design section 2.5 steps 3-7; a runtime
// service's spent target identity; the hold release's own two).
const PLACEMENT_REFUSAL = Object.freeze({
  CDC_CAPACITY: 'CDC_CAPACITY',
  SYSTEM_PARTITION_SEED_FOUNDED: 'SYSTEM_PARTITION_SEED_FOUNDED',
  ALREADY_FOUNDED: 'ALREADY_FOUNDED',
  PARTITION_BUSY: 'PARTITION_BUSY',
  RETAINED_IDENTITY_CHANGED: 'retained_identity_changed',
  RETAINED_ROW_CHANGED: 'retained_row_changed',
  RETAINED_ADMISSION_REQUIRED: 'retained_admission_required',
  RETAINED_COPY_POLICY_UNAVAILABLE: 'retained_copy_policy_unavailable',
  LEDGER_TRANSITION_UNRESOLVED: 'LEDGER_TRANSITION_UNRESOLVED',
  SOURCE_AT_CAPACITY: 'SOURCE_AT_CAPACITY',
  TARGET_AT_CAPACITY: 'TARGET_AT_CAPACITY',
  TARGET_CLAIM_TAKEN: 'TARGET_CLAIM_TAKEN',
  HOLD_NOT_HELD: 'HOLD_NOT_HELD',
  COPY_PHASE_NOT_IDLE: 'COPY_PHASE_NOT_IDLE',
  LEDGER_PARTITION_REQUIRED: 'LEDGER_PARTITION_REQUIRED',
});

// The waiting reasons the owner's pass records for a candidate it did not
// admit (design section 2.7), beside the applier's refusals and the write
// kernel's codes.
const PLACEMENT_WAITING_REASON = Object.freeze({
  FORMATION_NOT_LATCHED: 'FORMATION_NOT_LATCHED',
  NO_ELIGIBLE_TARGET: 'NO_ELIGIBLE_TARGET',
  TARGET_MEMORY_CONSTRAINED: 'TARGET_MEMORY_CONSTRAINED',
  TARGET_STORAGE_CONSTRAINED: 'TARGET_STORAGE_CONSTRAINED',
  TARGET_STORAGE_UNKNOWN: 'TARGET_STORAGE_UNKNOWN',
  LEADER_UNKNOWN: 'LEADER_UNKNOWN',
  NODE_AUTHORITY_UNAVAILABLE: 'NODE_AUTHORITY_UNAVAILABLE',
  INCUMBENT_AUTHORITY_UNAVAILABLE: 'INCUMBENT_AUTHORITY_UNAVAILABLE',
  INCUMBENT_ROLE_UNAVAILABLE: 'INCUMBENT_ROLE_UNAVAILABLE',
  SERVICES_READ_UNAVAILABLE: 'SERVICES_READ_UNAVAILABLE',
  INPUT_READ_DEFERRED: 'INPUT_READ_DEFERRED',
  REMOVE_FLOOR_WOULD_FAIL: 'REMOVE_FLOOR_WOULD_FAIL',
  LEDGER_AWAITING_COPY_IDLE: PLACEMENT_DISPATCH_HOLD.LEDGER_AWAITING_COPY_IDLE,
});

// Every trigger of the owner's pass (design section 2.3). RESYNC is the one
// declared cadence and never a clearing trigger (owner decision D5).
// TERM_START_APPLIED is the ledger port's APPLIED_PROGRESS while a tenure's
// term-start barrier is pending (the barrier is a pass stop, not a waiting
// reason: replica-placement-owner-tenure.js).
const PLACEMENT_TRIGGER = Object.freeze({
  TERM_START_APPLIED: 'TERM_START_APPLIED',
  LEDGER_COMMIT: 'LEDGER_COMMIT',
  NODES_OR_FORMATION: 'NODES_OR_FORMATION',
  SERVICES_CHANGED: 'SERVICES_CHANGED',
  PARTITIONS_CHANGED: 'PARTITIONS_CHANGED',
  TARGET_CAPACITY_CHANGED: 'TARGET_CAPACITY_CHANGED',
  WRITE_PATH_RELEASED: 'WRITE_PATH_RELEASED',
  PRESSURE_RELEASED: 'PRESSURE_RELEASED',
  LEADERSHIP_START: 'LEADERSHIP_START',
  RESYNC: 'RESYNC',
});
const TRIGGER = PLACEMENT_TRIGGER;

// The owner's one classification of every code on the admission path (design
// section 2.7): each code is either DEFINITE - a definite answer, nothing to
// wait for: retrying the same command or intent never changes it - or waits
// for the named trigger whose event clears it. A code reachable on the
// admission path that is in neither declaration is a defect; moving a code
// into or out of DEFINITE is a change of this declaration.
//
// DEFINITE: the provisioning owner adopts ALREADY_FOUNDED's ids;
// SYSTEM_PARTITION_SEED_FOUNDED is permanent by partition kind; a claimed
// runtime-service identity is spent for ever; a release of a row that holds
// nothing has nothing to wait for; a retained repair whose identity, row or
// admission changed is replaced, not retried; a command from another origin,
// for another table, with invalid or colliding bytes (its entryId already
// settled for another command), an unscoped REMOVE intent, or a settled
// record whose result is unreadable never becomes admissible by waiting.
const PLACEMENT_DEFINITE_ANSWER_CODES = Object.freeze([
  PLACEMENT_ADMISSION_ERROR.ORIGIN,
  PLACEMENT_ADMISSION_ERROR.BYTES,
  PLACEMENT_ADMISSION_ERROR.TARGET,
  PLACEMENT_ADMISSION_ERROR.REMOVE_INTENT_UNSCOPED,
  PLACEMENT_ADMISSION_ERROR.RESULT,
  PLACEMENT_REFUSAL.RETAINED_IDENTITY_CHANGED,
  PLACEMENT_REFUSAL.RETAINED_ROW_CHANGED,
  PLACEMENT_REFUSAL.RETAINED_ADMISSION_REQUIRED,
  PLACEMENT_REFUSAL.HOLD_NOT_HELD,
  PLACEMENT_REFUSAL.TARGET_CLAIM_TAKEN,
  PLACEMENT_REFUSAL.ALREADY_FOUNDED,
  PLACEMENT_REFUSAL.SYSTEM_PARTITION_SEED_FOUNDED,
  PLACEMENT_REFUSAL.LEDGER_PARTITION_REQUIRED,
]);

// WAITING: the trigger that clears each waiting code.
const PLACEMENT_WAITING_CLEARING_TRIGGER = Object.freeze({
  [PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE]: TRIGGER.LEADERSHIP_START,
  [PLACEMENT_ADMISSION_ERROR.REPAIR_PENDING]: TRIGGER.LEDGER_COMMIT,
  [PLACEMENT_REFUSAL.RETAINED_COPY_POLICY_UNAVAILABLE]: TRIGGER.NODES_OR_FORMATION,
  [PLACEMENT_REFUSAL.PARTITION_BUSY]: TRIGGER.LEDGER_COMMIT,
  [PLACEMENT_REFUSAL.SOURCE_AT_CAPACITY]: TRIGGER.LEDGER_COMMIT,
  [PLACEMENT_REFUSAL.TARGET_AT_CAPACITY]: TRIGGER.LEDGER_COMMIT,
  [PLACEMENT_REFUSAL.LEDGER_TRANSITION_UNRESOLVED]: TRIGGER.LEDGER_COMMIT,
  [PLACEMENT_REFUSAL.CDC_CAPACITY]: TRIGGER.LEDGER_COMMIT,
  [PLACEMENT_REFUSAL.COPY_PHASE_NOT_IDLE]: TRIGGER.LEDGER_COMMIT,
  [WRITE_REFUSAL.BACKPRESSURE]: TRIGGER.LEDGER_COMMIT,
  [WRITE_REFUSAL.CDC_CAPACITY]: TRIGGER.LEDGER_COMMIT,
  [WRITE_REFUSAL.CDC_DEMAND_EXCEEDS_CAPACITY]: TRIGGER.LEDGER_COMMIT,
  [WRITE_REFUSAL.RESERVED]: TRIGGER.LEDGER_COMMIT,
  [WRITE_REFUSAL.CUTOVER_PAUSED]: TRIGGER.WRITE_PATH_RELEASED,
  // The kernel answers CONSENSUS_SESSION_OPEN only for a group held by its
  // host failure (isHeldByHostFailure), and a held group announces no role
  // (raft-rs-runtime-owner.js groupFailed): the owner is deactivated and
  // the reconstructed group's next leader starts a new owner.
  [WRITE_REFUSAL.CONSENSUS_SESSION_OPEN]: TRIGGER.LEADERSHIP_START,
  [WRITE_REFUSAL.COMMIT_DEADLINE_EXCEEDED]: TRIGGER.LEDGER_COMMIT,
  [WRITE_REFUSAL.OUTCOME_UNKNOWN]: TRIGGER.LEDGER_COMMIT,
  [WRITE_REFUSAL.NOT_LEADER]: TRIGGER.LEADERSHIP_START,
  [WRITE_REFUSAL.CONSENSUS_RECOVERY_REQUIRED]: TRIGGER.LEADERSHIP_START,
  [WRITE_REFUSAL.CONSENSUS_HOST_FAILURE]: TRIGGER.LEADERSHIP_START,
  [WRITE_REFUSAL.CONSENSUS_REFUSED]: TRIGGER.LEADERSHIP_START,
  [WRITE_REFUSAL.SERVICE_SHUTDOWN]: TRIGGER.LEADERSHIP_START,
  [PLACEMENT_WAITING_REASON.FORMATION_NOT_LATCHED]: TRIGGER.NODES_OR_FORMATION,
  [PLACEMENT_WAITING_REASON.NO_ELIGIBLE_TARGET]: TRIGGER.NODES_OR_FORMATION,
  [PLACEMENT_WAITING_REASON.TARGET_MEMORY_CONSTRAINED]:
    TRIGGER.TARGET_CAPACITY_CHANGED,
  [PLACEMENT_WAITING_REASON.TARGET_STORAGE_CONSTRAINED]:
    TRIGGER.TARGET_CAPACITY_CHANGED,
  [PLACEMENT_WAITING_REASON.TARGET_STORAGE_UNKNOWN]:
    TRIGGER.TARGET_CAPACITY_CHANGED,
  // The wait ends when the target's leader is published: its PARTITIONS row
  // (leader_node_id), the row the owner reads; SERVICES rows carry follower
  // roles only.
  [PLACEMENT_WAITING_REASON.LEADER_UNKNOWN]: TRIGGER.PARTITIONS_CHANGED,
  [PLACEMENT_WAITING_REASON.NODE_AUTHORITY_UNAVAILABLE]:
    TRIGGER.NODES_OR_FORMATION,
  [PLACEMENT_WAITING_REASON.INCUMBENT_AUTHORITY_UNAVAILABLE]:
    TRIGGER.NODES_OR_FORMATION,
  [PLACEMENT_WAITING_REASON.INCUMBENT_ROLE_UNAVAILABLE]: TRIGGER.SERVICES_CHANGED,
  [PLACEMENT_WAITING_REASON.SERVICES_READ_UNAVAILABLE]: TRIGGER.SERVICES_CHANGED,
  [PLACEMENT_WAITING_REASON.INPUT_READ_DEFERRED]: TRIGGER.PRESSURE_RELEASED,
  [PLACEMENT_WAITING_REASON.REMOVE_FLOOR_WOULD_FAIL]: TRIGGER.NODES_OR_FORMATION,
  [PLACEMENT_WAITING_REASON.LEDGER_AWAITING_COPY_IDLE]: TRIGGER.LEDGER_COMMIT,
});

// The one refusal-to-trigger table every consumer reads, built from the two
// declarations above: a DEFINITE code maps to null, a waiting code to its
// trigger.
const PLACEMENT_CLEARING_TRIGGER = Object.freeze({
  ...Object.fromEntries(PLACEMENT_DEFINITE_ANSWER_CODES.map((code) => [code, null])),
  ...PLACEMENT_WAITING_CLEARING_TRIGGER,
});

// operation_id = pl-<partitionId>-<applyIndex>-<n> (design section 2.5 step 8).
const PLACEMENT_OPERATION_ID_PREFIX = 'pl-';
const PLACEMENT_OPERATION_ID_SEPARATOR = '-';

export {
  PLACEMENT_CLASS,
  PLACEMENT_CLASS_ORDER,
  PLACEMENT_CLEARING_TRIGGER,
  PLACEMENT_DEFINITE_ANSWER_CODES,
  PLACEMENT_COPY_CAPACITY,
  PLACEMENT_DEFICIT_KIND,
  PLACEMENT_DEFICIT_SEVERITY,
  PLACEMENT_DISPATCH_HOLD,
  PLACEMENT_FORMATION_GATED_CLASSES,
  PLACEMENT_FORMATION_STATE,
  PLACEMENT_FULL_SOURCE_CAPACITY_CLASSES,
  PLACEMENT_MOVE_TYPE,
  PLACEMENT_OPERATION_ID_PREFIX,
  PLACEMENT_OPERATION_ID_SEPARATOR,
  PLACEMENT_OUTCOME,
  PLACEMENT_REFUSAL,
  PLACEMENT_REPAIR_DEFICIT_KINDS,
  PLACEMENT_SYSTEM_FIRST_PARTITION_IDS,
  PLACEMENT_TRANSITION_KIND,
  PLACEMENT_TRIGGER,
  PLACEMENT_WAITING_CLEARING_TRIGGER,
  PLACEMENT_WAITING_REASON,
};
