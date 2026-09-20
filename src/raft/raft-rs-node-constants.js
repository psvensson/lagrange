// The raft-rs node object's partition of the production node census.
//
// Phase 1 deferred `createNodeClass` and recorded the reason: the provider's
// ten methods are not the integration surface - the object production holds
// in `this.raft` is, and the census derived from `src` finds 20 methods, 33
// properties and 27 events on it. This module classifies every one of them
// into exactly one of three named states:
//
//   SERVED          the core can answer it, and the node answers from the
//                   core. Nothing is computed here that raft-rs already knows.
//   DEFERRED        the raft-rs backend has the concept, but this phase has
//                   not built the path. It refuses by name with the reason.
//   NOT_APPLICABLE  a liferaft-only concept. The node refuses it by name and
//                   will not imitate it, because an imitation that answers
//                   plausibly is worse than a refusal a caller can see: it
//                   would present liferaft's vocabulary over a different
//                   mechanism and be believed.
//
// Every member is PRESENT on the node whichever class it is in. A member that
// were simply absent would read as `undefined` inside an optional chain and
// take a quiet path; a member that throws by name cannot.

import LifeRaft from './liferaft.js';
import {RAFT_EVENT} from './constants.js';
import {
  RAFT_COMMIT_APPLY_ROLLBACK_EVENT,
} from './liferaft-commit-scheduler.js';
import {RAFT_REPLICA_BASE_EVENT} from './raft-replica-base-constants.js';

const RAFT_RS_NODE_MEMBER_CLASS = Object.freeze({
  SERVED: 'served',
  DEFERRED: 'deferred',
  NOT_APPLICABLE: 'not-applicable',
});

// The role the node reports at `raft.state`.
//
// Seven production modules that are not liferaft compare `this.raft.state`
// against LifeRaft's own class constants, so the seam's role vocabulary is
// LifeRaft's. The values are READ OFF LifeRaft rather than restated, so this
// projection cannot drift from the enum it has to satisfy.
//
// raft-rs has a fourth role - PreCandidate, which exists exactly when
// pre_vote is on - and liferaft has no name for it. It is given a value that
// is deliberately none of LifeRaft's, so `state === LifeRaft.CANDIDATE` is
// false for a pre-candidate. That is the truth: a pre-candidate has not
// raised its term and is not campaigning in liferaft's sense.
const PRE_CANDIDATE_STATE = 'raft-rs-pre-candidate';

const RAFT_RS_NODE_STATE = Object.freeze({
  STOPPED: LifeRaft.STOPPED,
  LEADER: LifeRaft.LEADER,
  CANDIDATE: LifeRaft.CANDIDATE,
  FOLLOWER: LifeRaft.FOLLOWER,
  PRE_CANDIDATE: PRE_CANDIDATE_STATE,
});

// raft-rs StateRole, as the binding serialises `st.ss.raft_state as u32`.
const RAFT_RS_CORE_ROLE = Object.freeze({
  FOLLOWER: 0,
  CANDIDATE: 1,
  LEADER: 2,
  PRE_CANDIDATE: 3,
});

const RAFT_RS_CORE_ROLE_STATE = Object.freeze({
  [RAFT_RS_CORE_ROLE.FOLLOWER]: RAFT_RS_NODE_STATE.FOLLOWER,
  [RAFT_RS_CORE_ROLE.CANDIDATE]: RAFT_RS_NODE_STATE.CANDIDATE,
  [RAFT_RS_CORE_ROLE.LEADER]: RAFT_RS_NODE_STATE.LEADER,
  [RAFT_RS_CORE_ROLE.PRE_CANDIDATE]: RAFT_RS_NODE_STATE.PRE_CANDIDATE,
});

// The events the node emits, by value. Four census expressions spell the
// same 'data' value and three owners spell the role events; the values come
// from the owners that export them rather than from a literal here.
const RAFT_RS_NODE_EVENT = Object.freeze({
  LEADER: RAFT_EVENT.LEADER,
  FOLLOWER: RAFT_EVENT.FOLLOWER,
  CANDIDATE: RAFT_EVENT.CANDIDATE,
  COMMIT: RAFT_EVENT.COMMIT,
  LEADER_CHANGE: RAFT_EVENT.LEADER_CHANGE,
  TERM_CHANGE: RAFT_EVENT.TERM_CHANGE,
  DATA: RAFT_REPLICA_BASE_EVENT.DATA,
});

const RAFT_RS_NODE_EVENT_VALUES = Object.freeze(
  Object.values(RAFT_RS_NODE_EVENT));

const CLASS = RAFT_RS_NODE_MEMBER_CLASS;

const served = (reason) => Object.freeze({
  memberClass: CLASS.SERVED, reason});
const deferred = (reason) => Object.freeze({
  memberClass: CLASS.DEFERRED, reason});
const never = (reason) => Object.freeze({
  memberClass: CLASS.NOT_APPLICABLE, reason});

const LIFERAFT_INTERNAL =
  'it is liferaft\'s own implementation calling itself. Nothing outside ' +
  'liferaft reaches it, and a raft-rs node presenting it would be naming a ' +
  'mechanism it does not have';
const LIFERAFT_TIMER =
  'liferaft arms its heartbeat and its randomized election timeout from the ' +
  'host. raft-rs elections follow from tick() and the core\'s own ' +
  'election_tick, so a node that accepted a timeout would be accepting a ' +
  'number nothing reads';
const LOCAL_MEMBERSHIP_MUTATION =
  'it edits a local peer array by address, which is the membership defect ' +
  'this backend exists to replace. Under raft-rs a membership change is a ' +
  'proposed configuration change the core commits and applies';

const RAFT_RS_NODE_METHODS = Object.freeze({
  on: served(
    'the node is an emitter; its events come from what the Ready loop ' +
    'observed the core do'),
  emit: served(
    'the host delivers an inbound raft packet by emitting the data event ' +
    'into the node, so emit is this backend\'s ingress: the envelope ' +
    'boundary runs, then step, then the Ready loop'),
  listeners: served('an emitter read'),
  removeListener: served('an emitter read'),
  end: served(
    'stop: the group\'s handle is freed in the runtime that holds it, and ' +
    'the durable record stays where it is'),
  setTickInterval: served(
    'how often the host calls tick() into the core; the interval is the ' +
    'host\'s and the election is the core\'s'),
  configureTickInterval: served(
    'the same owner, in the form the configuration reaches it by'),
  change: never(
    'liferaft\'s change() WRITES a role, a term and a leader onto the node. ' +
    'All three belong to the core under this backend, and a node that ' +
    'accepted the write would report a role the core does not hold'),
  join: never(LOCAL_MEMBERSHIP_MUTATION),
  leave: never(LOCAL_MEMBERSHIP_MUTATION),
  heartbeat: never(LIFERAFT_TIMER),
  timeout: never(LIFERAFT_TIMER),
  message: never(
    'liferaft addresses a packet to a ROLE - message(FOLLOWER, packet) ' +
    'broadcasts to every follower it believes in. raft-rs addresses every ' +
    'message to one peer id the core chose, so there is no role to send to'),
  appendPacket: never(
    'it builds a liferaft append packet out of liferaft\'s own log. The ' +
    'raft-rs append is a Ready message the core produced'),
  commitEntries: never(LIFERAFT_INTERNAL),
  prepareCommitApply: never(LIFERAFT_INTERNAL),
  deferCandidacy: never(LIFERAFT_INTERNAL),
  _onSnapshotCatchupNeeded: never(LIFERAFT_INTERNAL),
  command: deferred(
    'proposing through the node needs the leader-routing path the provider ' +
    'also defers; the primitive itself is served at the provider seam'),
  packet: deferred(
    'building the outbound transport packet is the transport owner\'s half ' +
    'of the integration, and this phase wires the inbound half only'),
});

const RAFT_RS_NODE_PROPERTIES = Object.freeze({
  state: served(
    'projected from the core\'s own raft_state into the enum the seam ' +
    'compares against, with a named fourth value for the role liferaft has ' +
    'no name for'),
  term: served(
    'read from the core\'s status. The WRITE production performs on a ' +
    'liferaft node is refused by name: the term is the core\'s, and it ' +
    'comes back from the durable Raft record, not from a service row'),
  leader: served(
    'the leader the core reports, projected from its raft peer id to the ' +
    'address the host resolves. The WRITE is refused by name'),
  nodes: served(
    'a read-only projection of the COMMITTED configuration. No push, no ' +
    'splice, and no cache decides it'),
  tickIntervalMs: served('the interval the host set, as the host set it'),
  setTickInterval: RAFT_RS_NODE_METHODS.setTickInterval,
  configureTickInterval: RAFT_RS_NODE_METHODS.configureTickInterval,
  end: RAFT_RS_NODE_METHODS.end,
  constructor: served(
    'the node\'s own class, which JavaScript answers truthfully'),
  log: never(
    'liferaft\'s log object is liferaft\'s storage: its committedIndex, its ' +
    'entries and its follower match-index bookkeeping are that ' +
    'implementation\'s shape. The raft-rs log lives in the core and in the ' +
    'durable record, and getCommittedIndex at the provider answers the one ' +
    'question the host asks of it'),
  timers: never(
    'liferaft\'s Tick bag. raft-rs has no host-owned protocol timer to hold'),
  election: never(LIFERAFT_TIMER),
  beat: never(LIFERAFT_TIMER),
  heartbeat: RAFT_RS_NODE_METHODS.heartbeat,
  timeout: RAFT_RS_NODE_METHODS.timeout,
  // A name production probes as a property AND calls as a method is one
  // member with one reason, shared rather than restated.
  change: RAFT_RS_NODE_METHODS.change,
  join: RAFT_RS_NODE_METHODS.join,
  leave: RAFT_RS_NODE_METHODS.leave,
  deferCandidacy: RAFT_RS_NODE_METHODS.deferCandidacy,
  prepareCommitApply: RAFT_RS_NODE_METHODS.prepareCommitApply,
  protocolTasks: never(LIFERAFT_INTERNAL),
  _onSnapshotCatchupNeeded: RAFT_RS_NODE_METHODS._onSnapshotCatchupNeeded,
  _candidacyReluctantUntilMs: never(LIFERAFT_INTERNAL),
  _catchupTimeSource: never(LIFERAFT_INTERNAL),
  _commitApplyTail: never(LIFERAFT_INTERNAL),
  _committedPrefixDivergenceKeys: never(LIFERAFT_INTERNAL),
  _electionRandomSource: never(LIFERAFT_INTERNAL),
  _followerAppendBatchTail: never(LIFERAFT_INTERNAL),
  _lastCommittedPrefixDivergence: never(LIFERAFT_INTERNAL),
  _lastCommittedPrefixDivergenceError: never(LIFERAFT_INTERNAL),
  _lastSnapshotCatchupDecision: never(LIFERAFT_INTERNAL),
  _lastSnapshotCatchupDecisionError: never(LIFERAFT_INTERNAL),
  command: RAFT_RS_NODE_METHODS.command,
});

const ROLE_EVENT = 'a role, term or commit transition the Ready loop observed';
const DATA_EVENT =
  'the inbound transport packet; emitting it is how a message reaches this ' +
  'backend\'s envelope boundary';

const withValue = (entry, value) => Object.freeze({...entry, value});

const RAFT_RS_NODE_EVENTS = Object.freeze({
  'LIFERAFT_DATA_EVENT':
    withValue(served(DATA_EVENT), RAFT_RS_NODE_EVENT.DATA),
  'PARTITION_SERVICE_EVENT.DATA':
    withValue(served(DATA_EVENT), RAFT_RS_NODE_EVENT.DATA),
  'RAFT_REPLICA_BASE_EVENT.DATA':
    withValue(served(DATA_EVENT), RAFT_RS_NODE_EVENT.DATA),
  'RAFT_EVENT.DATA':
    withValue(served(DATA_EVENT), RAFT_RS_NODE_EVENT.DATA),
  'RAFT_COMMIT_EVENT':
    withValue(served(ROLE_EVENT), RAFT_RS_NODE_EVENT.COMMIT),
  'RAFT_GROUP_LIFERAFT_EVENT.LEADER':
    withValue(served(ROLE_EVENT), RAFT_RS_NODE_EVENT.LEADER),
  'RAFT_GROUP_LIFERAFT_EVENT.FOLLOWER':
    withValue(served(ROLE_EVENT), RAFT_RS_NODE_EVENT.FOLLOWER),
  'RAFT_GROUP_LIFERAFT_EVENT.CANDIDATE':
    withValue(served(ROLE_EVENT), RAFT_RS_NODE_EVENT.CANDIDATE),
  'RAFT_GROUP_LIFERAFT_EVENT.COMMIT':
    withValue(served(ROLE_EVENT), RAFT_RS_NODE_EVENT.COMMIT),
  'RAFT_GROUP_LIFERAFT_EVENT.LEADER_CHANGE':
    withValue(served(ROLE_EVENT), RAFT_RS_NODE_EVENT.LEADER_CHANGE),
  'RAFT_GROUP_LIFERAFT_EVENT.TERM_CHANGE':
    withValue(served(ROLE_EVENT), RAFT_RS_NODE_EVENT.TERM_CHANGE),
  'RAFT_REPLICA_BASE_LIFERAFT_EVENT.LEADER':
    withValue(served(ROLE_EVENT), RAFT_RS_NODE_EVENT.LEADER),
  'RAFT_REPLICA_BASE_LIFERAFT_EVENT.FOLLOWER':
    withValue(served(ROLE_EVENT), RAFT_RS_NODE_EVENT.FOLLOWER),
  'RAFT_REPLICA_BASE_LIFERAFT_EVENT.CANDIDATE':
    withValue(served(ROLE_EVENT), RAFT_RS_NODE_EVENT.CANDIDATE),
  'RAFT_REPLICA_BASE_LIFERAFT_EVENT.COMMIT':
    withValue(served(ROLE_EVENT), RAFT_RS_NODE_EVENT.COMMIT),
  'RAFT_REPLICA_BASE_LIFERAFT_EVENT.LEADER_CHANGE':
    withValue(served(ROLE_EVENT), RAFT_RS_NODE_EVENT.LEADER_CHANGE),
  'RAFT_REPLICA_BASE_LIFERAFT_EVENT.TERM_CHANGE':
    withValue(served(ROLE_EVENT), RAFT_RS_NODE_EVENT.TERM_CHANGE),
  'events.LEADER':
    withValue(served(ROLE_EVENT), RAFT_RS_NODE_EVENT.LEADER),
  'events.FOLLOWER':
    withValue(served(ROLE_EVENT), RAFT_RS_NODE_EVENT.FOLLOWER),
  'events.CANDIDATE':
    withValue(served(ROLE_EVENT), RAFT_RS_NODE_EVENT.CANDIDATE),
  'events.COMMIT':
    withValue(served(ROLE_EVENT), RAFT_RS_NODE_EVENT.COMMIT),
  'events.LEADER_CHANGE':
    withValue(served(ROLE_EVENT), RAFT_RS_NODE_EVENT.LEADER_CHANGE),
  'events.TERM_CHANGE':
    withValue(served(ROLE_EVENT), RAFT_RS_NODE_EVENT.TERM_CHANGE),
  'RAFT_EVENT.COMMITTED_PREFIX_DIVERGENCE': withValue(never(
    'it witnesses a poisoned committed prefix that liferaft\'s own ' +
    'truncation can never repair. raft-rs cannot produce the condition, so ' +
    'a node emitting it would be inventing a defect'),
  RAFT_EVENT.COMMITTED_PREFIX_DIVERGENCE),
  'RAFT_COMMIT_APPLY_ROLLBACK_EVENT': withValue(never(
    'it belongs to liferaft\'s cooperative commit scheduler, which applies ' +
    'committed entries in slices and rolls a slice back. The raft-rs apply ' +
    'half is the Ready loop, and it has no slice to roll back'),
  RAFT_COMMIT_APPLY_ROLLBACK_EVENT),
  // The two remaining names are module-local constants their owners do not
  // export, so no value can be consumed for them. The node refuses any event
  // outside the served set, which covers them without restating a value.
  'RAFT_COMMIT_APPLY_EFFECT_FAILURE_EVENT': withValue(never(
    'the same commit scheduler, reporting an after-commit effect that ' +
    'failed. There is no such effect list under this backend'), null),
  'RAFT_STATE_CHANGE_EVENT': withValue(never(
    'liferaft emits it to its own patched incoming-data listener; nothing ' +
    'outside liferaft subscribes'), null),
});

const RAFT_RS_NODE_SURFACE = Object.freeze({
  methods: RAFT_RS_NODE_METHODS,
  properties: RAFT_RS_NODE_PROPERTIES,
  events: RAFT_RS_NODE_EVENTS,
});

// The members the node refuses to have WRITTEN, and the projection a peer
// entry is, with the reason for each. They are named here rather than spelled
// at the throw site, because a refusal's reason is a domain value.
const RAFT_RS_NODE_WRITE_REFUSAL = Object.freeze({
  TERM: Object.freeze({
    member: 'term',
    reason:
      'the term is the core\'s, and a restart reads it from this replica\'s ' +
      'own durable Raft record, never from a service row',
  }),
  LEADER: Object.freeze({
    member: 'leader',
    reason:
      'who leads is decided by an election the core ran; writing it would ' +
      'make the node report a leader no quorum chose',
  }),
  PEER_ENTRY: Object.freeze({
    member: 'nodes[]',
    reason: 'the committed configuration is the core\'s',
  }),
});

const RAFT_RS_NODE_PEER_ENTRY_REASON =
  'a liferaft peer entry is a whole node clone; under this backend a peer ' +
  'is the committed configuration\'s member and nothing else';

// What the raft-rs node needs at construction that the seam's context does
// not carry. Each is refused by name when absent rather than defaulted.
const RAFT_RS_NODE_CONTEXT_FIELD = Object.freeze({
  RUNTIME_HOST: 'runtimeHost',
  STORE: 'store',
  GROUP_ID: 'groupId',
  PEER_ID: 'peerId',
  VOTERS: 'voters',
  RESOLVE_PEER_ADDRESS: 'resolvePeerAddress',
  DELIVER_PACKET: 'deliverPacket',
  SCHEDULE_TICK: 'scheduleTick',
});

const RAFT_RS_NODE_REQUIRED_CONTEXT = Object.freeze(
  Object.values(RAFT_RS_NODE_CONTEXT_FIELD));

const RAFT_RS_NODE_ERROR_MSG = Object.freeze({
  notServed: (name, reason) =>
    `the raft-rs node does not serve ${name}: ${reason}`,
  refusedWrite: (name, reason) =>
    `the raft-rs node refuses to have ${name} written: ${reason}`,
  unknownEvent: (event, served) =>
    `the raft-rs node never emits ${JSON.stringify(String(event))}, so a ` +
    'listener for it would never fire; it emits ' +
    `${served.map((name) => JSON.stringify(name)).join(', ')}`,
  missingContext: (field) =>
    `the raft-rs node needs ${field} at construction and the provider seam's ` +
    'context does not carry it; the seam\'s context is shaped for a liferaft ' +
    'node - an address resolver and a packet writer - and a raft-rs node ' +
    'needs its durable store, its group, its raft peer id, the configuration ' +
    'it starts in and a tick schedule',
  unknownRole: (role) =>
    `the core reported raft_state ${JSON.stringify(role)}, which this ` +
    'backend has no seam state for; it refuses rather than guess a role',
});

export {
  RAFT_RS_CORE_ROLE_STATE,
  RAFT_RS_NODE_ERROR_MSG,
  RAFT_RS_NODE_EVENT,
  RAFT_RS_NODE_EVENT_VALUES,
  RAFT_RS_NODE_MEMBER_CLASS,
  RAFT_RS_NODE_PEER_ENTRY_REASON,
  RAFT_RS_NODE_REQUIRED_CONTEXT,
  RAFT_RS_NODE_STATE,
  RAFT_RS_NODE_SURFACE,
  RAFT_RS_NODE_WRITE_REFUSAL,
};
