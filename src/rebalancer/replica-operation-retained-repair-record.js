import {copyOperationOutcomeData} from './replica-operation-update-outcome.js';
import {REPAIR_OBSERVATION} from './replica-operation-retained-repair-observation.js';
import {PLACEMENT_TRIGGER} from './replica-placement-owner-constants.js';

// The retained record is one owner's volatile memory of one operation. Every
// field starts in a named state; no null or absent value carries a meaning.
const RETAINED_REPAIR_DECISION = Object.freeze({UNOBSERVED: 'unobserved',
  EXACT: 'exact', CHANGED: 'changed',
  ABSENT: 'absent', UNAVAILABLE: 'unavailable', CONTENDED: 'contended', PENDING: 'pending'});
const RETAINED_REPAIR_MODE = Object.freeze({CONFIRM: 'confirm', RETRY: 'retry',
  HANDOFF: 'handoff', JOIN: 'join', REFRESH: 'refresh', RECEIVER: 'receiver',
  RESOLVE: 'resolve'});
// Modes whose decision may present the pinned entry for native apply. Only an
// arrival that overlaps one of these may inherit its outcome.
const PROPOSING_MODES = new Set([RETAINED_REPAIR_MODE.RETRY, RETAINED_REPAIR_MODE.HANDOFF,
  RETAINED_REPAIR_MODE.JOIN, RETAINED_REPAIR_MODE.RECEIVER]);
// A local caller owns its record until settled; an ingress-only record lives
// within the receiver's ledger tenure (custody) and retires when it ends.
const RETAINED_REPAIR_ORIGIN = Object.freeze({CALLER: 'caller', INGRESS: 'ingress'});
// What a retiring record that refused a caller reports to its composition.
const RETAINED_REPAIR_VERDICT = Object.freeze({CONFIRMED: 'confirmed',
  UNCONFIRMED: 'unconfirmed'});
// A caller awaiting the record hears its answer directly; the last caller's
// refusal (WITHHELD) is owed the verdict the record retires with.
const RETAINED_REPAIR_CALLER = Object.freeze({NONE: 'none', WITHHELD: 'withheld'});
// Why a record retired unconfirmed when no committed refusal names it.
const RETAINED_REPAIR_RETIREMENT = Object.freeze({CHANGED: 'row_changed',
  TENURE_ENDED: 'tenure_ended'});
const CONFIRMED_VERDICT = Object.freeze({state: RETAINED_REPAIR_VERDICT.CONFIRMED});
// PINNED: an exact entry is presented and unresolved. SETTLED: its durable
// outcome settled it; the body still states the copy policy it was judged by.
const RETAINED_REPAIR_ENTRY = Object.freeze({UNPINNED: 'unpinned', PINNED: 'pinned',
  SETTLED: 'settled'});
const RETAINED_REPAIR_BINDING = Object.freeze({UNOBSERVED: 'unobserved', LOCAL: 'local',
  REMOTE: 'remote', UNAVAILABLE: 'unavailable'});
const RETAINED_REPAIR_CUSTODY = Object.freeze({SELF: 'self', DELEGATED: 'delegated'});
const RETAINED_REPAIR_TENURE = Object.freeze({NONE: 'none', LEDGER: 'ledger'});
const RETAINED_REPAIR_NATIVE = Object.freeze({IDLE: 'idle', EXPECTED: 'expected'});
const RETAINED_REPAIR_NATIVE_FENCE = Object.freeze({UNFENCED: 'unfenced', TERM: 'term'});
const RETAINED_REPAIR_NATIVE_ANSWER = Object.freeze({NOT_REQUESTED: 'not_requested',
  REQUESTED: 'requested'});
const RETAINED_REPAIR_BLOCKER = Object.freeze({NONE: 'none', OPERATIONS: 'operations',
  OCCUPANCY: 'occupancy'});
const RETAINED_REPAIR_CONTINUATION = Object.freeze({IDLE: 'idle', ARMED: 'armed',
  OPEN: 'open', SPENT: 'spent'});
const RETAINED_REPAIR_DECISION_RUN = Object.freeze({IDLE: 'idle', RUNNING: 'running'});
// What a record waits for, named on the record and logged once per
// transition: nothing owed (its blocker's trigger or its custodian owns it);
// its bounded continuation; a spent bound (a later legitimate trigger); the
// next ledger route publication; a change of the offending row or binding.
const RETAINED_REPAIR_WAITING = Object.freeze({NONE: 'none', CONTINUATION: 'continuation',
  BOUND_SPENT: 'bound_spent', ROUTE_PUBLICATION: 'route_publication',
  ROW_CHANGE: 'row_change'});

const UNPINNED_ENTRY = Object.freeze({state: RETAINED_REPAIR_ENTRY.UNPINNED});
const UNOBSERVED_BINDING = Object.freeze({state: RETAINED_REPAIR_BINDING.UNOBSERVED});
const SELF_CUSTODY = Object.freeze({state: RETAINED_REPAIR_CUSTODY.SELF});
const NO_TENURE = Object.freeze({state: RETAINED_REPAIR_TENURE.NONE});
const NATIVE_IDLE = Object.freeze({state: RETAINED_REPAIR_NATIVE.IDLE});
const NO_BLOCKER = Object.freeze({kind: RETAINED_REPAIR_BLOCKER.NONE});
const IDLE_CONTINUATION = Object.freeze({state: RETAINED_REPAIR_CONTINUATION.IDLE});
const IDLE_DECISION = Object.freeze({state: RETAINED_REPAIR_DECISION_RUN.IDLE});
const UNOBSERVED_DECISION = Object.freeze({state: RETAINED_REPAIR_DECISION.UNOBSERVED});
const NOT_WAITING = Object.freeze({state: RETAINED_REPAIR_WAITING.NONE});

function pinnedEntry(entryId, body) {
  return Object.freeze({state: RETAINED_REPAIR_ENTRY.PINNED, entryId, body});
}

function settledEntry(entry) {
  return entry.state === RETAINED_REPAIR_ENTRY.PINNED ?
    Object.freeze({state: RETAINED_REPAIR_ENTRY.SETTLED, body: entry.body}) : entry;
}

function entryBody(entry) {
  return entry.state === RETAINED_REPAIR_ENTRY.UNPINNED ? null : entry.body;
}

function unconfirmedVerdict(reason) {
  return Object.freeze({state: RETAINED_REPAIR_VERDICT.UNCONFIRMED, reason});
}

function retainedRepairRecord(operation, origin, entry = UNPINNED_ENTRY) {
  return {operation: copyOperationOutcomeData(operation), origin, entry,
    callerAnswer: RETAINED_REPAIR_CALLER.NONE, awaitingCallers: 0,
    binding: UNOBSERVED_BINDING, custody: SELF_CUSTODY, tenure: NO_TENURE,
    nativeIngress: NATIVE_IDLE, blocker: NO_BLOCKER,
    // What the last committed or observed refusal waits for. A failed read
    // never rewrites it: revalidation it leaves owed is `owed`.
    clearingTrigger: PLACEMENT_TRIGGER.LEDGER_COMMIT,
    decision: IDLE_DECISION, lastAnswer: UNOBSERVED_DECISION,
    lastDecision: UNOBSERVED_DECISION,
    // Hints queued for the drain, and the revalidation a failed read left owed.
    observations: REPAIR_OBSERVATION.NONE, owed: REPAIR_OBSERVATION.NONE,
    continuation: IDLE_CONTINUATION, waiting: NOT_WAITING,
    minimumLedgerIndex: 0, minimumLedgerTerm: 0};
}

function materializeRepairContention(result, rows) {
  if (!Array.isArray(result.operationIds) || result.operationIds.length === 0) return result;
  const blockingOperations = result.operationIds.map((operationId) => {
    const row = rows.find((candidate) => candidate.operation_id === operationId);
    return {operationId, createdAt: row.created_at, workflowStep: row.workflow_step,
      completedAt: row.completed_at};
  });
  return {...result, blockingOperations};
}

export {RETAINED_REPAIR_DECISION, RETAINED_REPAIR_MODE, PROPOSING_MODES, RETAINED_REPAIR_ORIGIN,
  RETAINED_REPAIR_VERDICT, RETAINED_REPAIR_CALLER, RETAINED_REPAIR_RETIREMENT, CONFIRMED_VERDICT,
  unconfirmedVerdict,
  RETAINED_REPAIR_ENTRY, RETAINED_REPAIR_BINDING, RETAINED_REPAIR_CUSTODY, RETAINED_REPAIR_TENURE,
  RETAINED_REPAIR_NATIVE, RETAINED_REPAIR_NATIVE_FENCE, RETAINED_REPAIR_NATIVE_ANSWER,
  RETAINED_REPAIR_BLOCKER, RETAINED_REPAIR_CONTINUATION, RETAINED_REPAIR_DECISION_RUN,
  RETAINED_REPAIR_WAITING, UNPINNED_ENTRY, SELF_CUSTODY, NO_TENURE, NATIVE_IDLE, NO_BLOCKER,
  IDLE_CONTINUATION, IDLE_DECISION, NOT_WAITING, pinnedEntry, settledEntry, entryBody,
  retainedRepairRecord, materializeRepairContention};
