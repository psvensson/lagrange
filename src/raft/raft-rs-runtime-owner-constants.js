// The raft-rs runtime owner's private vocabulary: runtime health and group
// usability, the leader and role names read from the core, the core calls
// that take no group handle, the commands and events the runtime dispatches,
// and the phases and reasons its outcomes carry.
//
// Values only. Nothing here reaches the core or the binding; the runtime
// owner remains the sole importer and invoker of both.

import {
  RAFT_EVENT,
  RAFT_PEER_PROGRESS_PROBE_REASON,
} from './raft-operation-port-constants.js';
import {
  RAFT_RS_PERSISTENCE_ADMISSION,
} from './raft-rs-durable-store-constants.js';
import {
  RAFT_RS_PEER_IDENTITY_RESOLUTION,
} from './raft-rs-peer-identity-constants.js';

const HEALTHY = 'healthy';
const UNHEALTHY = 'unhealthy';
const USABLE = 'usable';
const RECOVERY_REQUIRED = 'recovery-required';
const NO_LEADER = '0';
// The core's raft state of a follower (the key of ROLE naming it).
const FOLLOWER_RAFT_STATE = 0;
const CORE_REFUSAL_KIND = 'raft-rs-refusal';
const ROLE_LEADER = 'leader';
const ROLE = Object.freeze({
  0: 'follower',
  1: 'candidate',
  2: ROLE_LEADER,
  3: 'pre-candidate',
});
const CORE_CALL_WITHOUT_HANDLE = new Set([
  'create_node',
  'decode_conf_change_entry',
]);
const CORE_OPERATION = Object.freeze({CONF_STATE: 'conf_state'});
const RUNTIME_COMMAND = Object.freeze({
  READ_STATUS: 'read-status',
  CAMPAIGN: 'campaign',
  // The runtime's own entry for envelopes step() delivered: it drives them
  // through the core and nothing else - it is not a tick, so a replica whose
  // scheduling is stopped never campaigns from it.
  DRAIN_INBOUND: 'drain-inbound',
  PROBE_PEER_PROGRESS: 'probe-peer-progress',
});
const RUNTIME_EVENT = Object.freeze({
  TERM_CHANGE: RAFT_EVENT.TERM_CHANGE,
  LEADER_CHANGE: RAFT_EVENT.LEADER_CHANGE,
});
const PEER_ADDRESS_STATUS = Object.freeze({
  RESOLVED: 'resolved',
  UNAVAILABLE: 'unavailable',
  // A peer the committed configuration names whose identity this replica's
  // registry never reserved: a typed observation, never a status failure.
  UNRESERVED: RAFT_RS_PEER_IDENTITY_RESOLUTION.UNRESERVED,
  NO_LEADER: 'no-leader',
});
// What the runtime last observed delivering to one peer. A failed delivery
// is that peer's transport outcome: raft re-sends on its own schedule, so the
// message is dropped and the group keeps its Ready, its role and its runtime.
const PEER_DELIVERY_OUTCOME = Object.freeze({
  DELIVERED: 'delivered',
  FAILED: 'failed',
  NONE_OBSERVED: 'none-observed',
});
// The per-peer delivery observations a group keeps: one per peer it sent to,
// oldest evicted first past the bound.
const PEER_DELIVERY_OBSERVATION_LIMIT = 256;
const RUNTIME_PHASE = Object.freeze({
  GENERATION_CHANGED: 'runtime-generation-changed',
  BOOTSTRAP_PERSISTENCE: 'bootstrap-persistence',
  ADDRESS_RESOLUTION: 'address-resolution',
  SEND: 'send',
  SEND_NO_HANDLER: 'send-no-handler',
  APPLICATION: 'application',
  READY_DRAIN: 'ready-drain',
  READY_PERSISTENCE: 'ready-persistence',
  CAMPAIGN_ELIGIBILITY: 'campaign-eligibility',
  DISPATCH: 'dispatch',
  ADMISSION: 'admission',
  PROGRESS_PROBE: 'progress-probe',
});
const RUNTIME_REASON = Object.freeze({
  CORE_REFUSED: 'core-refused',
  GENERATION_CHANGED:
    'execution generation changed while host work was pending',
  RESTORED: 'restored',
  CREATED: 'created',
  RUNTIME_RECONSTRUCTED: 'runtime-reconstructed',
  // A group whose host failed was reconstructed alone, in the current core.
  GROUP_RECONSTRUCTED: 'group-reconstructed',
  // An operation on a group whose host failure persists, inside the group's
  // retry window: typed, and nothing entered the core.
  RECOVERY_DEFERRED: 'recovery-deferred',
  EXECUTION_USABLE: 'execution-usable',
  ENTRIES_APPLIED: 'entries-applied',
  READY_DRAIN_BOUND_EXCEEDED: 'ready drain bound exceeded',
  DRAINED: 'drained',
  UNKNOWN: 'unknown',
  NOT_ACTIVE_VOTER: 'not-an-active-voter',
  UNKNOWN_OPERATION: 'unknown-operation',
  INBOUND_ENQUEUED: 'inbound-enqueued',
  INBOUND_DRAINED: 'inbound-drained',
  DELIVERY_FAILED: 'raft delivery failed',
  // The progress probe's outcomes, owned by the port's contract.
  ...RAFT_PEER_PROGRESS_PROBE_REASON,
  CLOSED_WITHOUT_CORE_ENTRY: 'closed-without-core-entry',
  CLOSED: 'closed',
  // The store's own admission state, carried as the reason of the typed,
  // retryable, non-fatal deferral while a user transaction holds the
  // replica's connection.
  USER_TRANSACTION_OPEN: RAFT_RS_PERSISTENCE_ADMISSION.USER_TRANSACTION_OPEN,
  // The command reached the core; the Readies it produced wait in the core
  // until the store admits their persistence again.
  READY_DEFERRED: 'ready-deferred-user-transaction-open',
});
// A Ready already taken holds the core's pending Ready, so its remaining
// durable writes cannot be refused after an asynchronous send: they wait for
// the store's admission. The bound is longer than the partition's own hold
// on a session (60 s), so a session the transaction owner still admits never
// costs the group its runtime; beyond it the connection is wedged and the
// group is reconstructed from its durable record.
// Delivered inbound is drained on the group's next turn of its own clock.
const INBOUND_DRAIN_DELAY_MS = 0;
const PERSISTENCE_ADMISSION_WAIT = Object.freeze({
  POLL_INTERVAL_MS: 10,
  BOUND_MS: 120000,
});

export {
  CORE_CALL_WITHOUT_HANDLE,
  FOLLOWER_RAFT_STATE,
  CORE_OPERATION,
  CORE_REFUSAL_KIND,
  HEALTHY,
  INBOUND_DRAIN_DELAY_MS,
  NO_LEADER,
  PEER_ADDRESS_STATUS,
  PEER_DELIVERY_OBSERVATION_LIMIT,
  PEER_DELIVERY_OUTCOME,
  PERSISTENCE_ADMISSION_WAIT,
  RECOVERY_REQUIRED,
  ROLE,
  ROLE_LEADER,
  RUNTIME_COMMAND,
  RUNTIME_EVENT,
  RUNTIME_PHASE,
  RUNTIME_REASON,
  UNHEALTHY,
  USABLE,
};
