// The forked raft-rs WASM binding, and the deterministic driver every core
// scenario shares.
//
// The fork lives under `raft-core/` beside this file: the Rust source, its
// pinned toolchain, its build recipe and the built artifact. Nothing here
// touches the owner's raft-logic repository and nothing is upstreamed.
//
// Ordering. The driver is the raft-rs model's own Ready loop, as the crate's
// `examples/five_mem_node/main.rs` writes it: send the Ready's messages,
// apply its snapshot, apply its committed entries (a committed configuration
// entry goes through `apply_conf_change` and the RETURNED ConfState is what
// gets stored), append its entries and store its hard state, send its
// persisted messages, and only then advance; then take the LightReady, store
// its commit index, send its messages, apply its committed entries, and
// finally advance the apply index. Everything the host stores lands in a
// durable record OUTSIDE the WASM module, because the WASM module's
// MemStorage is not a durable store - it is process memory. A restart is
// rebuilt from that durable record alone.
//
// Membership witness. Every configuration a scenario is allowed to assert on
// must come out of a core read, so `confStates()` and `statuses()` TAG what
// they return and `coreVoters`/`expectFromCore` refuse anything untagged.
// The counts are the runtime half of the "reported by the core, not declared"
// receipt: a scenario with no core reads cannot pass it.
//
// There is deliberately NO cache parameter anywhere in this module. The
// stale-cache scenario asserts that structurally.

import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const FORK = Object.freeze({
  ROOT: path.join(here, 'raft-core'),
  GLUE: path.join(here, 'raft-core', 'pkg', 'raft_wasm.js'),
  WASM: path.join(here, 'raft-core', 'pkg', 'raft_wasm_bg.wasm'),
  DIGEST: path.join(here, 'raft-core', 'artifact-digest.json'),
  BUILD_DOC: path.join(here, 'raft-core', 'BUILD.md'),
  CARGO_TOML: path.join(here, 'raft-core', 'Cargo.toml'),
  CARGO_LOCK: path.join(here, 'raft-core', 'Cargo.lock'),
  TOOLCHAIN: path.join(here, 'raft-core', 'rust-toolchain.toml'),
  LIB_RS: path.join(here, 'raft-core', 'src', 'lib.rs'),
  SELF: fileURLToPath(import.meta.url),
  NOT_BUILT: 'the forked core binding is not built: missing ',
});

// The raft-rs primitives the fork must expose. Nothing here is a Lagrange
// idea: each is a RawNode operation or a storage operation the raft-rs Ready
// model requires of its host.
const REQUIRED_PRIMITIVES = Object.freeze([
  // upstream, unchanged
  'create_node', 'free', 'tick', 'has_ready', 'take_ready', 'persist_ready',
  'advance_append', 'advance_apply', 'campaign', 'status', 'step', 'propose',
  // the configuration primitives upstream does not have
  'propose_conf_change_v2',
  'apply_conf_change',
  'decode_conf_change_entry',
  'conf_state',
  'set_conf_state',
  // what the raft-rs Ready model needs from its host store and upstream
  // gives no way to do
  'persist_commit_index',
  'export_persisted_state',
  // a measurement primitive, not a membership one
  'wasm_memory_bytes',
]);

// Policy - add a learner, wait for it to catch up, promote it, remove the old
// voter - belongs to Lagrange, not to the binding. If any of these appears,
// the binding has grown an opinion it must not have.
const FORBIDDEN_CONVENIENCE = Object.freeze([
  'add_node', 'addNode', 'remove_node', 'removeNode',
  'add_learner', 'addLearner', 'promote_learner', 'promoteLearner',
  'promote', 'demote', 'change_membership', 'changeMembership',
  'replace_node', 'replaceNode', 'membership', 'set_membership',
]);

// raft-rs ConfChangeV2 vocabulary, as `raft-proto-0.7.0/proto/eraftpb.proto`
// defines it (AddNode=0, RemoveNode=1, AddLearnerNode=2; Auto=0, Implicit=1,
// Explicit=2). The driver speaks only this.
const CONF_CHANGE_TYPE = Object.freeze({
  ADD_NODE: 0,
  REMOVE_NODE: 1,
  ADD_LEARNER_NODE: 2,
});
const CONF_CHANGE_TRANSITION = Object.freeze({
  AUTO: 0,
  IMPLICIT: 1,
  EXPLICIT: 2,
});
const ENTRY_TYPE = Object.freeze({
  NORMAL: 0,
  CONF_CHANGE: 1,
  CONF_CHANGE_V2: 2,
});
const RAFT_STATE = Object.freeze({
  FOLLOWER: 0,
  CANDIDATE: 1,
  LEADER: 2,
  PRE_CANDIDATE: 3,
});

// The points in the loop at which a peer can be killed. The first six are
// positions inside one Ready cycle; the last three are positions in a joint
// configuration's life and are reached by driving the scenario, not by
// stopping the loop.
const RESTART_BOUNDARY = Object.freeze({
  PROPOSED_NOT_PERSISTED: 'proposed-not-persisted',
  PERSISTED_NOT_COMMITTED: 'persisted-not-committed',
  COMMITTED_NOT_APPLIED: 'committed-not-applied',
  CONF_APPLIED_NOT_RECORDED: 'conf-applied-conf-state-not-recorded',
  CONF_STATE_RECORDED_NOT_ADVANCED: 'conf-state-recorded-not-advanced',
  READY_ADVANCED: 'ready-advanced',
  JOINT_ENTERED: 'joint-entered',
  JOINT_COMMITTED: 'joint-committed',
  JOINT_LEFT: 'joint-left',
  // Added after verification round 1, which named them as missing. The first
  // two are positions the nine never reached; they are driven by the same
  // stops against a different entry or a different cluster shape.
  JOINT_LEAVE_DURABLE_NOT_APPLIED: 'joint-leave-entry-durable-not-applied',
  LIGHT_READY_APPLY: 'lightready-phase-apply',
});

// Adversarial HOST orderings. Each is a small switch in the loop or in the
// restore, run against the same scenario. The point is not that raft-rs
// detects every bad sequence - it is that the adapter cannot accidentally
// implement one without it being visible.
const HOST_MUTANT = Object.freeze({
  NONE: 'none',
  ADVANCE_APPEND_BEFORE_PERSIST: 'advance-append-before-persisting-entries',
  HARD_STATE_WITHOUT_ENTRIES: 'persist-hard-state-omit-entries',
  APPLY_CONF_BEFORE_ENTRY_DURABLE: 'apply-conf-change-before-entry-durable',
  CONF_STATE_IN_MEMORY_ONLY: 'update-conf-state-in-memory-only',
  CONF_STATE_WITHOUT_APPLIED: 'persist-conf-state-leave-applied-behind',
  ADVANCE_APPLY_BEFORE_PERSIST: 'advance-apply-before-persisting-applied',
  RESTORE_APPLIED_AHEAD_OF_LOG: 'restore-applied-index-ahead-of-log',
  RESTORE_NEW_CONF_OLD_APPLIED: 'restore-new-conf-state-old-applied-index',
  RESTORE_OLD_CONF_NEW_APPLIED: 'restore-old-conf-state-applied-past-entry',
  // The order this evaluation used before verification round 1, which
  // raft-rs warns against by name at src/lib.rs:304-310.
  APPLY_BEFORE_PERSISTING_COMMIT: 'apply-before-persisting-commit',
  // ConfState and the applied index written as two separate durable writes.
  CONF_STATE_AND_APPLIED_SEPARATE: 'confstate-and-applied-written-separately',
  // NOT a mutant: a switch that changes nothing, run through the same
  // classifier as a control. Round 2 showed the classifier could not fail -
  // the honest loop itself scored `unsafe-recorded` - so a mutant matrix
  // with no honest control proves nothing.
  INERT: 'inert-control-that-changes-nothing',
});

// The orderings that are actually adversarial. NONE and INERT are controls.
const HOST_MUTANT_CONTROLS = Object.freeze([
  HOST_MUTANT.NONE, HOST_MUTANT.INERT]);

const ISOLATION_BREACH =
  'a message crossed the isolation boundary of peer ';

const BOUNDARY_STOP = Symbol('boundary-stop');
const BOUNDARY_ENTRY = Symbol('boundary-entry');
const CORE_READ = Symbol('core-read');

function isConfEntry(entry) {
  const entryType = Number(entry?.entryType);
  return entryType === ENTRY_TYPE.CONF_CHANGE ||
    entryType === ENTRY_TYPE.CONF_CHANGE_V2;
}

// The configuration entry a Ready carries, identified by the index and type
// the CORE assigned it - never by counting cycles.
function confEntryOf(entries) {
  return (entries || []).find(isConfEntry) || null;
}

// A boundary is a position RELATIVE TO ONE CONFIGURATION ENTRY. The stop
// fires only in the cycle that actually carries that entry at that stage, so
// an armed boundary cannot go off on an earlier, unrelated Ready.
function boundaryStopper(stopAt) {
  return (boundary, entry) => {
    if (stopAt !== boundary || !entry) {
      return;
    }
    const stop = new Error(
      `stopped at ${boundary} for entry ${entry.index}`);
    stop[BOUNDARY_STOP] = boundary;
    stop[BOUNDARY_ENTRY] = String(entry.index);
    throw stop;
  };
}

function requireBuiltFork() {
  for (const required of [FORK.GLUE, FORK.WASM]) {
    if (!fs.existsSync(required)) {
      throw new Error(`${FORK.NOT_BUILT}${path.relative(here, required)}`);
    }
  }
}

/**
 * Load the forked binding. Fails closed with a named reason when the fork
 * has not been built.
 * @return {Object} the wasm-pack nodejs glue exports
 */
function loadForkedCore() {
  requireBuiltFork();
  const require = createRequire(import.meta.url);
  return require(FORK.GLUE);
}

/**
 * A FRESH WASM runtime: a second instance of the module, not the cached one.
 *
 * Verification round 2 measured a finite fatal budget per instance - after
 * about three hundred aborts every call on every group traps "memory access
 * out of bounds" - so a host that keeps many groups in one instance needs a
 * recovery path, and that path is replacing the instance. The wasm-pack
 * nodejs glue instantiates the module once at module scope, so dropping the
 * require cache entry and requiring it again gives a genuinely new instance.
 * Nothing in the fork changes.
 * @return {Object} a new set of glue exports with its own WASM instance
 */
function instantiateFreshForkedCore() {
  requireBuiltFork();
  const require = createRequire(import.meta.url);
  delete require.cache[require.resolve(FORK.GLUE)];
  return require(FORK.GLUE);
}

// --- host-side ingress validation -------------------------------------------
//
// Round 2: several message shapes reach a raft-rs fatal through `step`, and
// one misrouted heartbeat between groups in a Multi-Raft host is a fatal.
// The host must therefore validate the ENVELOPE before `step`. This checks
// routing only - it does not duplicate Raft protocol validation, which is
// the core's job and must not be second-guessed.
const MESSAGE_TYPE = Object.freeze({
  HUP: 0, BEAT: 1, PROPOSE: 2, APPEND: 3, APPEND_RESPONSE: 4,
  REQUEST_VOTE: 5, REQUEST_VOTE_RESPONSE: 6, SNAPSHOT: 7, HEARTBEAT: 8,
  HEARTBEAT_RESPONSE: 9, UNREACHABLE: 10, SNAP_STATUS: 11, CHECK_QUORUM: 12,
  TRANSFER_LEADER: 13, TIMEOUT_NOW: 14, READ_INDEX: 15, READ_INDEX_RESP: 16,
  REQUEST_PRE_VOTE: 17, REQUEST_PRE_VOTE_RESPONSE: 18,
});

const LOCAL_ONLY = Object.freeze([MESSAGE_TYPE.HUP, MESSAGE_TYPE.BEAT,
  MESSAGE_TYPE.PROPOSE, MESSAGE_TYPE.CHECK_QUORUM]);

const INGRESS_REFUSAL = Object.freeze({
  WRONG_GROUP: 'the message names another Raft group',
  NOT_ADDRESSED_HERE: 'the message is not addressed to this peer',
  UNKNOWN_SENDER: 'the sender is not a member of this peer\'s own ConfState',
  UNKNOWN_TYPE: 'unknown message type',
  LOCAL_TYPE: 'a local-only message type may not arrive from the network',
  COMMIT_BEYOND_LAST: 'a heartbeat commit beyond this peer\'s durable last ' +
    'index',
});

/**
 * Envelope-only validation, before `step`. Returns a refusal reason or null.
 * @param {Object} context {message, selfId, groupId, confState,
 *   durableLastIndex}
 * @return {string|null}
 */
function knownSendersOf(confState) {
  return [
    ...(confState?.voters || []), ...(confState?.learners || []),
    ...(confState?.votersOutgoing || []), ...(confState?.learnersNext || []),
  ].map(String);
}

function routingRefusal(message, selfId, groupId) {
  if (message.groupId !== undefined && groupId !== undefined &&
      String(message.groupId) !== String(groupId)) {
    return INGRESS_REFUSAL.WRONG_GROUP;
  }
  return String(message.to) === String(selfId) ? null :
    INGRESS_REFUSAL.NOT_ADDRESSED_HERE;
}

function typeRefusal(type) {
  if (!Object.values(MESSAGE_TYPE).includes(type)) {
    return INGRESS_REFUSAL.UNKNOWN_TYPE;
  }
  return LOCAL_ONLY.includes(type) ? INGRESS_REFUSAL.LOCAL_TYPE : null;
}

/**
 * Envelope-only validation, before `step`. Returns a refusal reason or null.
 * It checks ROUTING, not the Raft protocol: the core owns that.
 * @param {Object} context {message, selfId, groupId, confState,
 *   durableLastIndex}
 * @return {string|null}
 */
function envelopeRefusal({message, selfId, groupId, confState,
  durableLastIndex}) {
  const type = Number(message.msgType);
  const refusal = routingRefusal(message, selfId, groupId) ||
    typeRefusal(type);
  if (refusal) {
    return refusal;
  }
  if (!knownSendersOf(confState).includes(String(message.from))) {
    return INGRESS_REFUSAL.UNKNOWN_SENDER;
  }
  // A leader only ever sends a commit index it knows the follower has
  // matched, so a heartbeat commit beyond this peer's durable last index
  // cannot come from a correct leader - and it is the shape that reaches
  // raft_log.rs:292.
  const beyond = type === MESSAGE_TYPE.HEARTBEAT &&
    durableLastIndex !== undefined &&
    Number(message.commit || 0) > Number(durableLastIndex);
  return beyond ? INGRESS_REFUSAL.COMMIT_BEYOND_LAST : null;
}

// --- the membership witness -------------------------------------------------

// The BRAND. A module-private WeakMap, so nothing outside this file can put
// a value in it: a membership value is admissible only if this module made
// it, and it made it only out of something the core returned, something the
// host durably wrote, a requested change, or a set operation over those.
//
// Round 1 tagged values with a symbol the scenario chose to ask for, which
// bound nothing: the verifier declared a membership four different ways and
// the receipt stayed green. The brand is now the only way to construct a
// membership value at all - `membershipArray` refuses an unbranded source -
// and `auditMembershipProvenance` refuses to build the artifact out of a
// record that holds one this module did not make.
const PROVENANCE = new WeakMap();

// A CLOSED enum of sources. Anything else is not evidence.
const ORIGIN = Object.freeze({
  CORE_READ: 'conf_state',
  CORE_RETURN: 'apply_conf_change-return',
  STATUS: 'status',
  DURABLE_RECORD: 'durable-record',
  REQUESTED_CHANGE: 'proposed-conf-change',
  DERIVED: 'derived',
});

// THE LEDGER. Verification round 2 defeated the previous brand five ways: a
// branded array could be emptied and refilled, an expectation could have an
// id pushed into it, a declared literal could be laundered through
// `confChangeV2`/`changedNodeIds` because a "requested change" was never
// checked against what was actually proposed to the core, `derivedMembership`
// accepted an invented change, and a core-read ConfState could be mutated in
// place and read again. Owner attack 11 then succeeded with every receipt
// green.
//
// A brand cannot fix that, because a brand is a mark and marks can be moved.
// The ledger is a RECORD: every core read and every proposal is written down
// when it happens, with the value it had at that moment, and the audit
// re-checks each piece of evidence in the artifact against it. Mutation
// after the fact, cloning, and a literal passed through a helper all fail the
// comparison - not a shape check.
const LEDGER = {
  reads: new Map(),
  // canonical change -> the LATEST proposal of it. The same change can be
  // proposed many times, so every operation id ever issued is kept too:
  // evidence minted from an earlier proposal is still evidence.
  proposals: new Map(),
  proposalOperations: new Set(),
  nextOperation: 1,
};

const MEMBERSHIP_SHAPE = Object.freeze(
  ['voters', 'votersOutgoing', 'learners', 'learnersNext']);

function canonicalMembership(values) {
  return [...(values || [])].map(String).sort().join(',');
}

function canonicalChange(change) {
  return JSON.stringify({
    transition: Number(change?.transition ?? 0),
    changes: (change?.changes || []).map((entry) => ({
      changeType: Number(entry.changeType), nodeId: String(entry.nodeId)})),
  });
}

/**
 * Write a core read into the ledger, brand it and FREEZE it, so the value
 * the audit re-checks is the value the core actually returned.
 * @param {string} kind one of ORIGIN
 * @param {string} peerId
 * @param {Object} state the object the core returned
 * @param {Object} [witness]
 * @return {Object} the frozen state
 */
function recordCoreRead(kind, peerId, state, witness = null) {
  const operationId = `op-${LEDGER.nextOperation}`;
  LEDGER.nextOperation += 1;
  const fields = {};
  for (const field of MEMBERSHIP_SHAPE) {
    fields[field] = canonicalMembership(state?.[field]);
  }
  LEDGER.reads.set(operationId, {operationId, kind, peer: String(peerId),
    fields: Object.freeze(fields)});
  if (witness) {
    witness.reads.push({peerId: String(peerId), source: kind});
    Object.defineProperty(state, CORE_READ, {
      value: {peerId: String(peerId), source: kind},
      enumerable: false, configurable: true});
  }
  brand(state, kind, {operationId, peer: String(peerId)});
  // Frozen so attack 6 - mutate the ConfState in place, then read it again -
  // cannot produce a value the ledger never saw.
  return Object.freeze(state);
}

/**
 * Write a proposal into the ledger. A `proposed-conf-change` evidence object
 * exists ONLY if this recorded the exact change when it was passed to the
 * core.
 * @param {Object} change
 * @param {string} peerId
 * @return {Object} the change
 */
function recordProposal(change, peerId) {
  const operationId = `propose-${LEDGER.nextOperation}`;
  LEDGER.nextOperation += 1;
  LEDGER.proposals.set(canonicalChange(change),
    {operationId, peer: String(peerId)});
  LEDGER.proposalOperations.add(operationId);
  brand(change, ORIGIN.REQUESTED_CHANGE, {operationId, peer: String(peerId)});
  return change;
}

/**
 * The ledger's own counts, so the audit can BOUND the evidence: a
 * `proposed-conf-change` evidence object may only cite a proposal the
 * ledger saw, and there cannot be more distinct cited proposals than
 * proposals.
 * @return {Object}
 */
function ledgerCounts() {
  return {
    coreReads: LEDGER.reads.size,
    proposals: LEDGER.proposalOperations.size,
  };
}

/**
 * Audit a set of records and bound the result against the ledger.
 * @param {*} records
 * @return {Object}
 */
function auditAgainstLedger(records) {
  const found = auditMembershipProvenance(records);
  const counts = ledgerCounts();
  // The absolute ledger totals are process-cumulative and would make the
  // artifact unstable, so what is RECORDED is what is about these records:
  // how many membership fields were checked, their source kinds, and how
  // many distinct proposals the evidence cites. The bound against the
  // ledger is checked here and recorded as a boolean.
  return {
    membershipFieldsChecked: found.checked,
    byOrigin: found.byOrigin,
    violations: found.violations,
    citedProposalOperations: found.citedProposals.size,
    everyCitedProposalWasProposed: [...found.citedProposals]
      .every((operationId) => LEDGER.proposalOperations.has(operationId)) &&
      found.citedProposals.size <= counts.proposals,
  };
}

const MEMBERSHIP_REFUSAL = Object.freeze({
  UNBRANDED_SOURCE: 'this configuration state did not come from the core, ' +
    'the durable record or a requested change; membership may not be declared',
  UNBRANDED_ACTUAL: 'the value under test is not a membership value this ' +
    'harness produced from a core read',
  DECLARED_EXPECTATION: 'the expected side is a declared set of peer ids; ' +
    'an expectation must come from a prior core read, the requested change, ' +
    'or a set operation over those',
  NOT_AN_ARRAY: 'a membership value is an array of peer ids',
  NOT_PROPOSED: 'this configuration change was never proposed to the core, ' +
    'so its node ids are a declared literal, not the requested change',
  LEDGER_MISMATCH: 'this membership value is not what the ledger recorded ' +
    'when the core produced it',
  NO_OPERATION: 'this membership value names no ledger operation',
});

function brand(value, origin, detail = {}) {
  if (value && typeof value === 'object') {
    PROVENANCE.set(value, Object.freeze({origin, ...detail}));
  }
  return value;
}

function brandOf(value) {
  return value && typeof value === 'object' ?
    PROVENANCE.get(value) : undefined;
}

/**
 * Is this value one this harness produced from the core, the durable record,
 * a requested change, or a set operation over those?
 * @param {*} value
 * @return {boolean}
 */
function isFromCore(value) {
  return brandOf(value) !== undefined;
}

/**
 * One membership field of a configuration state, as an array of peer ids.
 * The SOURCE must be branded; the array that comes back is branded too, so
 * an assertion can tell a measured configuration from a written-down one.
 * @param {Object} confState a branded configuration state
 * @param {string} field voters | votersOutgoing | learners | learnersNext
 * @return {Array<string>}
 */
function membershipArray(confState, field) {
  const provenance = brandOf(confState);
  if (!provenance) {
    throw new Error(`${MEMBERSHIP_REFUSAL.UNBRANDED_SOURCE} (${field})`);
  }
  const values = Object.freeze(
    [...(confState[field] || [])].map(String).sort());
  return brand(values, provenance.origin,
    {...provenance, field, value: values.join(',')});
}

/**
 * A membership derived from a prior one by the change that was requested.
 * Both the source and the ids added or removed must themselves be branded.
 * @param {Array<string>} source
 * @param {Object} operation {adding, removing} branded id arrays
 * @param {string} why
 * @return {Array<string>}
 */
function derivedMembership(source, {adding = [], removing = []} = {}, why) {
  for (const operand of [source, adding, removing]) {
    if (!isFromCore(operand)) {
      throw new Error(`${MEMBERSHIP_REFUSAL.DECLARED_EXPECTATION} (${why})`);
    }
  }
  const values = Object.freeze([...source]
    .filter((id) => !removing.includes(id))
    .concat(adding.filter((id) => !source.includes(id)))
    .sort());
  return brand(values, ORIGIN.DERIVED, {why, value: values.join(','),
    from: [source, adding, removing]
      .map((operand) => brandOf(operand)?.operationId)
      .filter(Boolean)});
}

/**
 * The members of a branded membership that satisfy a predicate - still a
 * membership, still branded.
 * @param {Array<string>} source
 * @param {Function} predicate
 * @param {string} why
 * @return {Array<string>}
 */
function selectMembers(source, predicate, why) {
  if (!isFromCore(source)) {
    throw new Error(`${MEMBERSHIP_REFUSAL.DECLARED_EXPECTATION} (${why})`);
  }
  const values = Object.freeze([...source].filter(predicate).sort());
  return brand(values, ORIGIN.DERIVED, {why, value: values.join(','),
    from: [brandOf(source)?.operationId].filter(Boolean)});
}

/**
 * The node ids a requested configuration change names, by change type. The
 * change must be one `confChangeV2` built, which is what makes "the change
 * that was requested" an admissible source for an expectation.
 * @param {Object} change
 * @param {number} [changeType] restrict to one type
 * @return {Array<string>}
 */
function changedNodeIds(change, changeType = null) {
  // Round 2: `changedNodeIds(confChangeV2([...ids I invent]))` minted a
  // branded declared literal, because a "requested change" was never checked
  // against what was proposed to the core. It is now checked against the
  // ledger: a change nobody proposed is not evidence of anything.
  const proposal = LEDGER.proposals.get(canonicalChange(change));
  if (!proposal) {
    throw new Error(`${MEMBERSHIP_REFUSAL.NOT_PROPOSED}: ${
      canonicalChange(change)}`);
  }
  const ids = Object.freeze((change.changes || [])
    .filter((entry) => changeType === null ||
      Number(entry.changeType) === changeType)
    .map((entry) => String(entry.nodeId)).sort());
  return brand(ids, ORIGIN.REQUESTED_CHANGE,
    {changeType, operationId: proposal.operationId, value: ids.join(',')});
}

function createWitness() {
  return {
    reads: [],
    assertions: 0,
    refusals: 0,
    tag(value, peerId, source) {
      this.reads.push({peerId, source});
      if (value && typeof value === 'object') {
        Object.defineProperty(value, CORE_READ, {
          value: {peerId, source}, enumerable: false, configurable: true});
        brand(value, ORIGIN.CORE_READ, {peerId, source});
      }
      return value;
    },
    provenance(value) {
      return value && typeof value === 'object' ? value[CORE_READ] : undefined;
    },
    readsFor(peerId) {
      return this.reads.filter((read) => read.peerId === String(peerId)).length;
    },
    summary() {
      const byPeer = {};
      for (const read of this.reads) {
        byPeer[read.peerId] = (byPeer[read.peerId] || 0) + 1;
      }
      return {
        total: this.reads.length,
        byPeer,
        assertions: this.assertions,
        refusals: this.refusals,
      };
    },
  };
}

const UNTAGGED =
  'this value did not come from a core read; membership may not be declared';

/**
 * Voters, as the core reported them. Refuses anything that is not a tagged
 * core read, and the array it returns carries the same tag so an assertion
 * can check provenance.
 * @param {Object} confState tagged conf state
 * @param {Object} witness
 * @return {Array<string>}
 */
function coreField(confState, witness, field) {
  if (!witness.provenance(confState)) {
    witness.refusals += 1;
    throw new Error(UNTAGGED);
  }
  // The value itself comes from the ledger-backed accessor, so the witness
  // counts the read and the LEDGER is what the audit re-checks.
  return membershipArray(confState, field);
}

/**
 * The COMPLETE configuration a core read reports - every field, never
 * reduced to "current voters" - as a branded view, so the view itself can be
 * handed back to `membershipArray` without losing its provenance.
 * @param {Object} confState a tagged core read
 * @param {Object} witness
 * @return {Object}
 */
function fullMembershipFromCore(confState, witness) {
  const view = {
    voters: coreField(confState, witness, 'voters'),
    votersOutgoing: coreField(confState, witness, 'votersOutgoing'),
    learners: coreField(confState, witness, 'learners'),
    learnersNext: coreField(confState, witness, 'learnersNext'),
    autoLeave: confState.autoLeave === true,
  };
  const provenance = brandOf(confState) || {origin: ORIGIN.CORE_READ};
  return brand(view, provenance.origin, {...provenance, view: 'full'});
}

// --- the assertion helpers --------------------------------------------------
//
// Everything a receipt says about a membership goes through one of these.
// They refuse an unbranded actual (nothing has been read from the core) and
// they refuse an unbranded expectation (the membership was written down).
// `assert.deepStrictEqual`, a literal routed through a const, and a `.length`
// or `.join()` comparison are all closed by the same rule, because none of
// them can produce a branded expectation.

function requireMembership(value, refusal, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${MEMBERSHIP_REFUSAL.NOT_AN_ARRAY}: ${label}`);
  }
  if (!isFromCore(value)) {
    throw new Error(`${refusal}: ${label}`);
  }
  return value;
}

/**
 * Two membership values, both measured, must be the same set.
 * @param {Array<string>} actual
 * @param {Array<string>} expected
 * @param {string} message
 */
function assertMembershipEqual(actual, expected, message) {
  requireMembership(actual, MEMBERSHIP_REFUSAL.UNBRANDED_ACTUAL, message);
  requireMembership(expected, MEMBERSHIP_REFUSAL.DECLARED_EXPECTATION,
    message);
  if ([...actual].sort().join() !== [...expected].sort().join()) {
    throw new Error(`${message}: [${actual}] !== [${expected}]`);
  }
}

/**
 * A measured membership is empty. The empty set is not a declaration of who
 * the peers are, so no branded expectation is needed.
 * @param {Array<string>} actual
 * @param {string} message
 */
function assertMembershipEmpty(actual, message) {
  requireMembership(actual, MEMBERSHIP_REFUSAL.UNBRANDED_ACTUAL, message);
  if (actual.length !== 0) {
    throw new Error(`${message}: expected no members, saw [${actual}]`);
  }
}

/**
 * A measured membership has at least one member.
 * @param {Array<string>} actual
 * @param {string} message
 */
function assertMembershipNotEmpty(actual, message) {
  requireMembership(actual, MEMBERSHIP_REFUSAL.UNBRANDED_ACTUAL, message);
  if (actual.length === 0) {
    throw new Error(`${message}: no members were reported`);
  }
}

/**
 * Two measured memberships are NOT the same set - the configuration moved.
 * @param {Array<string>} actual
 * @param {Array<string>} previous
 * @param {string} message
 */
function assertMembershipDiffers(actual, previous, message) {
  requireMembership(actual, MEMBERSHIP_REFUSAL.UNBRANDED_ACTUAL, message);
  requireMembership(previous, MEMBERSHIP_REFUSAL.DECLARED_EXPECTATION,
    message);
  if ([...actual].sort().join() === [...previous].sort().join()) {
    throw new Error(`${message}: both are [${actual}]`);
  }
}

/**
 * A measured membership has a given SIZE. A count is not a membership.
 * @param {Array<string>} actual
 * @param {number} size
 * @param {string} message
 */
function assertMembershipSize(actual, size, message) {
  requireMembership(actual, MEMBERSHIP_REFUSAL.UNBRANDED_ACTUAL, message);
  if (actual.length !== size) {
    throw new Error(`${message}: expected ${size} members, saw [${actual}]`);
  }
}

/**
 * Every id in a measured or requested set is a member of another.
 * @param {Array<string>} actual
 * @param {Array<string>} required
 * @param {string} message
 */
function assertMembershipIncludes(actual, required, message) {
  requireMembership(actual, MEMBERSHIP_REFUSAL.UNBRANDED_ACTUAL, message);
  requireMembership(required, MEMBERSHIP_REFUSAL.DECLARED_EXPECTATION,
    message);
  const missing = required.filter((id) => !actual.includes(id));
  if (missing.length > 0) {
    throw new Error(`${message}: [${actual}] is missing [${missing}]`);
  }
}

/**
 * No id of one measured set is a member of another.
 * @param {Array<string>} actual
 * @param {Array<string>} excluded
 * @param {string} message
 */
function assertMembershipExcludes(actual, excluded, message) {
  requireMembership(actual, MEMBERSHIP_REFUSAL.UNBRANDED_ACTUAL, message);
  requireMembership(excluded, MEMBERSHIP_REFUSAL.DECLARED_EXPECTATION,
    message);
  const present = excluded.filter((id) => actual.includes(id));
  if (present.length > 0) {
    throw new Error(`${message}: [${actual}] still holds [${present}]`);
  }
}

// --- the artifact-side gate -------------------------------------------------

// Any record field whose NAME says it holds a set of peer ids. A scenario
// cannot smuggle a declared configuration into the artifact by choosing a
// different field name for it: the name is what makes it a membership claim.
const MEMBERSHIP_FIELD =
  /(voters|learners|outgoing|membership|peerset)/iu;

const NOT_FROM_CORE = 'a membership field in the scenario records did not ' +
  'come from a core read, the durable record or the requested change: ';

/**
 * Walk finished scenario records and refuse any membership-named array the
 * harness did not produce. This runs before the artifact is serialized,
 * because JSON has no brands: the check has to happen while the records are
 * still the objects the scenarios returned.
 * @param {*} value
 * @param {string} [at]
 * @param {Array<string>} [violations]
 * @return {Array<string>} the paths that are not from the core
 */
// Re-check one piece of evidence against the ledger. This is where a
// mutated array, a clone, an invented change and a literal passed through a
// helper all fail: not because of their shape, but because the value they
// carry is not the value the ledger recorded when the core produced it.
function derivedViolation(provenance, current) {
  for (const operationId of provenance.from || []) {
    if (!LEDGER.reads.has(operationId) &&
        !LEDGER.proposalOperations.has(operationId)) {
      return `${MEMBERSHIP_REFUSAL.NO_OPERATION} (${operationId})`;
    }
  }
  return current === canonicalMembership(
    (provenance.value || '').split(',').filter(Boolean)) ? null :
    MEMBERSHIP_REFUSAL.LEDGER_MISMATCH;
}

function ledgerViolation(values) {
  const provenance = brandOf(values);
  if (!provenance) {
    return MEMBERSHIP_REFUSAL.UNBRANDED_ACTUAL;
  }
  if (!Object.values(ORIGIN).includes(provenance.origin)) {
    return `unknown source kind ${provenance.origin}`;
  }
  const current = canonicalMembership(values);
  if (provenance.origin === ORIGIN.DERIVED) {
    return derivedViolation(provenance, current);
  }
  if (provenance.origin === ORIGIN.REQUESTED_CHANGE) {
    return LEDGER.proposalOperations.has(provenance.operationId) ? null :
      MEMBERSHIP_REFUSAL.NOT_PROPOSED;
  }
  if (provenance.origin === ORIGIN.DURABLE_RECORD) {
    // The durable record is a host field, not a core read: it has no
    // operation of its own, and what it must equal is checked by the
    // restore oracle rather than here.
    return null;
  }
  const entry = LEDGER.reads.get(provenance.operationId);
  if (!entry) {
    return `${MEMBERSHIP_REFUSAL.NO_OPERATION} (${provenance.operationId})`;
  }
  const recorded = entry.fields[provenance.field];
  if (recorded === undefined) {
    return `${MEMBERSHIP_REFUSAL.NO_OPERATION} (field ${provenance.field})`;
  }
  return recorded === current ? null : `${
    MEMBERSHIP_REFUSAL.LEDGER_MISMATCH}: ledger [${recorded}] vs [${current}]`;
}

// One membership field: re-checked against the ledger, then counted.
function recordOneEvidence(held, path, found) {
  found.checked += 1;
  const failure = ledgerViolation(held);
  if (failure) {
    found.violations.push(`${path}: ${failure}`);
    return;
  }
  const provenance = brandOf(held);
  found.byOrigin[provenance.origin] =
    (found.byOrigin[provenance.origin] || 0) + 1;
  if (provenance.origin === ORIGIN.REQUESTED_CHANGE &&
      provenance.operationId) {
    found.citedProposals.add(provenance.operationId);
  }
}

function auditMembershipProvenance(value, at = '',
  found = {checked: 0, byOrigin: {}, violations: [],
    citedProposals: new Set()}) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      auditMembershipProvenance(entry, `${at}/${index}`, found));
    return found;
  }
  if (!value || typeof value !== 'object') {
    return found;
  }
  for (const [key, held] of Object.entries(value)) {
    const path = `${at}/${key}`;
    if (Array.isArray(held) && MEMBERSHIP_FIELD.test(key)) {
      recordOneEvidence(held, path, found);
      continue;
    }
    auditMembershipProvenance(held, path, found);
  }
  return found;
}

// --- durable host state -----------------------------------------------------

/**
 * The durable Raft state a host keeps for one peer. This is the ONLY thing a
 * restart may be rebuilt from: no service rows, no other peer's memory, no
 * declared membership.
 * @return {Object}
 */
function durableRecord(initialConfState = null) {
  return {
    hardState: null,
    confState: brand(initialConfState, ORIGIN.DURABLE_RECORD,
      {wrote: 'the configuration the replica was created with'}),
    entries: [],
    snapshot: null,
    appliedIndex: '0',
    // Every durable write in order, so a scenario can restart at an exact
    // boundary and so the ordering receipt can check what was written before
    // which advance.
    writeLog: [],
  };
}

function appendDurableEntries(record, entries) {
  for (const entry of entries) {
    const index = Number(entry.index);
    const at = record.entries.findIndex((held) => Number(held.index) >= index);
    if (at >= 0) {
      record.entries.length = at;
    }
    record.entries.push(entry);
  }
}

// --- the Ready loop ---------------------------------------------------------

function pumpPeer(peer, route, stopAt = null, mutant = HOST_MUTANT.NONE) {
  const core = peer.core;
  if (!peer.alive || peer.halted || !core.has_ready(peer.handle)) {
    return [];
  }
  const applied = [];
  const stop = boundaryStopper(stopAt);
  try {
    runReadyCycle(peer, route, stop, applied, mutant);
  } catch (error) {
    if (!error?.[BOUNDARY_STOP]) {
      throw error;
    }
    // The peer died exactly here: it does nothing further, so the loop must
    // not keep re-entering the same cycle (and must not treat it as busy).
    peer.stoppedAt = error[BOUNDARY_STOP];
    peer.stoppedAtEntryIndex = error[BOUNDARY_ENTRY];
    peer.halted = true;
  }
  return applied;
}

function persistReadySnapshot(peer, ready) {
  if (!ready.snapshot) {
    return;
  }
  peer.record.snapshot = ready.snapshot;
  peer.record.confState = brand(
    ready.snapshot.metadata?.confState, ORIGIN.CORE_RETURN,
    {wrote: 'the ConfState carried by the core\'s own snapshot'}) ||
    peer.record.confState;
  peer.record.writeLog.push({write: 'snapshot'});
}

function persistEntriesAndHardState(peer, ready, mutant) {
  // MUTANT: persist the hard state but omit the entries it accounts for.
  const omitEntries = mutant === HOST_MUTANT.HARD_STATE_WITHOUT_ENTRIES;
  if (!omitEntries) {
    appendDurableEntries(peer.record, ready.entries || []);
    if ((ready.entries || []).length > 0) {
      peer.record.writeLog.push({write: 'entries',
        through: ready.entries[ready.entries.length - 1].index});
    }
  }
  if (ready.hardState) {
    peer.record.hardState = ready.hardState;
    peer.record.writeLog.push({write: 'hardState', ...ready.hardState});
  }
}

function persistLightCommit(peer, light) {
  if (!light.commitIndex) {
    return;
  }
  peer.record.hardState = {
    ...(peer.record.hardState || {}),
    commit: light.commitIndex,
  };
  peer.core.persist_commit_index(peer.handle, light.commitIndex);
  peer.record.writeLog.push({write: 'commitIndex', commit: light.commitIndex});
}

function routeAll(messages, route) {
  for (const message of messages || []) {
    route(message);
  }
}

function runReadyCycle(peer, route, stop, applied, mutant) {
  const core = peer.core;
  peer.cycleRouting = {beforeConfApply: 0, afterConfApply: [],
    confApplied: false};
  const countingRoute = (message) => {
    if (peer.cycleRouting.confApplied) {
      peer.cycleRouting.afterConfApply.push({
        to: String(message.to), msgType: Number(message.msgType),
        index: String(message.index), commit: String(message.commit),
        entryCount: (message.entries || []).length,
      });
    } else {
      peer.cycleRouting.beforeConfApply += 1;
    }
    route(message);
  };
  const ready = core.take_ready(peer.handle);
  // The configuration entry THIS Ready is carrying, if any. Every in-cycle
  // boundary below is relative to it; a Ready that does not carry one can
  // never trip an armed boundary.
  const unpersistedConf = confEntryOf(ready.entries);
  peer.readyPhase = 'ready';

  // Step 1 (src/lib.rs:203): send the Ready's messages.
  routeAll(ready.messages, countingRoute);
  // Step 2 (src/lib.rs:228): apply the snapshot.
  persistReadySnapshot(peer, ready);
  stop(RESTART_BOUNDARY.PROPOSED_NOT_PERSISTED, unpersistedConf);

  // Steps 4 and 5 (src/lib.rs:312, :337) are performed BEFORE step 3
  // (:256, apply the committed entries). The doc's own numbered order puts
  // the committed entries first, but its safety note at src/lib.rs:304-310
  // overrides that for the commit index: "it doesn't guarentee commit index
  // is persisted before being applied ... apply index can be larger than
  // commit index and cause panic. To solve the problem, persisting commit
  // index with or before applying entries." The note wins, and a mixed
  // batch makes the difference observable (see the
  // apply-before-persisting-commit mutant).
  const advanceEarly = mutant === HOST_MUTANT.ADVANCE_APPEND_BEFORE_PERSIST;
  const applyBeforePersistingCommit =
    mutant === HOST_MUTANT.APPLY_BEFORE_PERSISTING_COMMIT;
  const persistThisReady = () => {
    persistEntriesAndHardState(peer, ready, mutant);
    if (!advanceEarly) {
      core.persist_ready(peer.handle);
    }
  };
  if (advanceEarly) {
    peer.record.writeLog.push({write: 'advanceAppend'});
  }
  const earlyLight = advanceEarly ? core.advance_append(peer.handle) : null;
  if (!applyBeforePersistingCommit) {
    persistThisReady();
  }

  const appliedNow = [];
  appliedNow.push(...applyCommittedEntries(
    peer, ready.committedEntries || [], stop, mutant, 'ready'));

  // MUTANT: the pre-repair order, which raft-rs warns against by name.
  if (applyBeforePersistingCommit) {
    persistThisReady();
  }

  // Step 6 (src/lib.rs:362): send the persisted messages.
  routeAll(ready.persistedMessages, countingRoute);
  stop(RESTART_BOUNDARY.PERSISTED_NOT_COMMITTED, unpersistedConf);

  // Step 7 (src/lib.rs:387): advance.
  if (!advanceEarly) {
    peer.record.writeLog.push({write: 'advanceAppend'});
  }
  const light = advanceEarly ? earlyLight : core.advance_append(peer.handle);
  // The LightReady's commit index is stored before its committed entries are
  // applied, for the same reason.
  persistLightCommit(peer, light);
  routeAll(light.messages, countingRoute);

  appliedNow.push(...applyCommittedEntries(
    peer, light.committedEntries || [], stop, mutant, 'lightReady'));
  applied.push(...appliedNow);
  const appliedConf = appliedNow.find((entry) => entry.confState) || null;
  core.advance_apply(peer.handle);
  peer.record.writeLog.push({write: 'advanceApply'});
  stop(RESTART_BOUNDARY.READY_ADVANCED, appliedConf);
}

/**
 * Apply committed entries. A committed configuration entry is applied through
 * the core, and the ConfState the core RETURNS is what becomes durable - that
 * returned value, not anything the test computed, is the configuration a
 * restart restores.
 * @param {Object} peer
 * @param {Array<Object>} entries
 * @param {Function} stop boundary stopper
 * @return {Array<Object>}
 */

// One durable write. The two mutants below are the only ways it comes apart.
function writeConfStateAndApplied(peer, confState, entry, mutant, stop) {
  peer.record.confState = brand(confState, ORIGIN.DURABLE_RECORD,
    {wrote: 'the ConfState apply_conf_change returned', atIndex: entry.index});
  if (mutant === HOST_MUTANT.CONF_STATE_AND_APPLIED_SEPARATE) {
    peer.record.writeLog.push({write: 'confState', confState,
      atIndex: entry.index});
    // The crash the mutant models: between the two writes.
    stop(RESTART_BOUNDARY.CONF_APPLIED_NOT_RECORDED, entry);
    peer.record.appliedIndex = String(entry.index);
    peer.record.writeLog.push({write: 'appliedIndex', atIndex: entry.index});
    return;
  }
  if (mutant !== HOST_MUTANT.CONF_STATE_WITHOUT_APPLIED &&
      mutant !== HOST_MUTANT.ADVANCE_APPLY_BEFORE_PERSIST &&
      Number(entry.index) > Number(peer.record.appliedIndex)) {
    peer.record.appliedIndex = String(entry.index);
  }
  peer.record.writeLog.push({write: 'confStateAndApplied', confState,
    atIndex: entry.index, appliedIndex: peer.record.appliedIndex});
}

function applyCommittedEntries(peer, entries, stop, mutant, phase) {
  const core = peer.core;
  const applied = [];
  const advanceApplied = (entry) => {
    // MUTANT: advance the application before the applied position is
    // durable - modelled by never writing it at all for this cycle.
    if (mutant === HOST_MUTANT.ADVANCE_APPLY_BEFORE_PERSIST) {
      return;
    }
    if (Number(entry.index) > Number(peer.record.appliedIndex)) {
      peer.record.appliedIndex = String(entry.index);
    }
  };
  for (const entry of entries) {
    if (!isConfEntry(entry)) {
      advanceApplied(entry);
      applied.push({...entry});
      continue;
    }
    // Committed by the core, not yet handed to the application.
    peer.readyPhase = phase;
    stop(RESTART_BOUNDARY.COMMITTED_NOT_APPLIED, entry);
    const change = core.decode_conf_change_entry(
      Number(entry.entryType), entry.data);
    peer.applyConfChangeCalls.push(String(entry.index));
    // MUTANT: apply the configuration change before its entry is durable.
    const entryIsDurable = peer.record.entries
      .some((held) => String(held.index) === String(entry.index));
    if (mutant === HOST_MUTANT.APPLY_CONF_BEFORE_ENTRY_DURABLE &&
        entryIsDurable) {
      peer.record.entries = peer.record.entries
        .filter((held) => String(held.index) !== String(entry.index));
      peer.record.writeLog.push({write: 'entryDroppedByMutant',
        atIndex: entry.index});
    }
    let confState = null;
    try {
      confState = recordCoreRead(ORIGIN.CORE_RETURN, peer.id,
        core.apply_conf_change(peer.handle, change));
      // From here on, anything this cycle sends is computed under the NEW
      // configuration. Whether the host sends anything at all before the
      // configuration is durable is the safety question this records.
      if (peer.cycleRouting) {
        peer.cycleRouting.confApplied = true;
        peer.cycleRouting.appliedAtIndex = String(entry.index);
      }
    } catch (error) {
      // The core refused to apply this entry. It is RECORDED, never
      // swallowed: the scenario that owns this run decides whether a
      // refusal is its subject (joint re-delivery) or a failure.
      peer.applyConfChangeErrors.push({
        index: String(entry.index),
        phase,
        error: String(error?.message || error),
      });
      advanceApplied(entry);
      applied.push({...entry, change, applyRefused: true,
        refusal: String(error?.message || error)});
      continue;
    }
    // Applied inside the core, nothing durable about it yet. The applied
    // index must NOT move past an entry whose effect is not yet durable, or
    // a restart would skip it.
    stop(RESTART_BOUNDARY.CONF_APPLIED_NOT_RECORDED, entry);
    // The returned ConfState and the applied index are ONE durable write:
    // a record whose configuration is ahead of its applied index describes a
    // state no crash can produce, and the core refuses to restore from it.
    if (mutant !== HOST_MUTANT.CONF_STATE_IN_MEMORY_ONLY) {
      writeConfStateAndApplied(peer, confState, entry, mutant, stop);
    }
    core.set_conf_state(peer.handle, confState);
    // Recorded durably, but this cycle's advance_apply has not run yet.
    stop(RESTART_BOUNDARY.CONF_STATE_RECORDED_NOT_ADVANCED, entry);
    applied.push({...entry, change, confState});
  }
  return applied;
}

// --- the cluster ------------------------------------------------------------

function bootstrapFromRecord(record) {
  return {
    hardState: record.hardState || undefined,
    snapshot: record.snapshot || undefined,
    entries: record.entries,
    confState: record.confState || undefined,
  };
}

// TEST-ONLY FAULT INJECTION, for the negative controls that have to
// reproduce a verifier attack against the REAL receipt path.
//
// Verification round 2 showed that a "service-row cache" injecting a learner
// into every restored ConfState left all fifteen core tests green - the
// owner's "no service-row cache may repair it" attack succeeding. An attack
// that only exists in a throw-away script cannot keep a receipt honest, so
// the attack is a permanent test, and this is the seam it uses.
//
// It is armed only by a test that names it, it is asserted null in every
// scenario the artifact records, and no scenario function touches it.
let restoreFault = null;

/**
 * Arm or disarm the restore fault. Negative controls only.
 * @param {Object|null} fault {corruptRecord, mutateRestoredConfState, why}
 */
function setRestoreFaultForNegativeControl(fault) {
  restoreFault = fault;
}

/**
 * Is a fault armed? The artifact builder records this as false.
 * @return {boolean}
 */
function restoreFaultIsArmed() {
  return restoreFault !== null;
}

// The configuration a restart is ENTITLED to, computed by the core from the
// durable record alone: a scratch RawNode is built from exactly what was
// persisted and asked what configuration that is. Nothing is declared.
function replayConfEntries(core, handle, entries) {
  for (const entry of entries || []) {
    if (!isConfEntry(entry)) {
      continue;
    }
    const change = core.decode_conf_change_entry(
      Number(entry.entryType), entry.data);
    core.set_conf_state(handle, core.apply_conf_change(handle, change));
  }
}

// A deep copy of a durable record that KEEPS the provenance of its
// configuration: a snapshot of what the host wrote is still the host's
// durable record, not a declaration. JSON.parse(JSON.stringify(...)) loses
// the brand, which is exactly why the copy has to be made here.
function snapshotDurableRecord(record) {
  const copy = JSON.parse(JSON.stringify(record));
  brand(copy.confState, ORIGIN.DURABLE_RECORD,
    {wrote: 'a snapshot of the durable record taken by the harness'});
  return copy;
}

function confStateEntitledByDurableState(core, id, record, tick) {
  const handle = core.create_node({
    id: String(id),
    peers: [...(record.confState?.voters || [])].map(String),
    learners: [...(record.confState?.learners || [])].map(String),
    electionTick: tick.election,
    heartbeatTick: tick.heartbeat,
    applied: String(record.appliedIndex || '0'),
    bootstrap: bootstrapFromRecord(record),
  });
  try {
    // The entitlement is what the durable state justifies AFTER the node has
    // replayed the committed entries its own durable log holds above its
    // durable applied index - which is what a restarted peer does. Reading
    // the ConfState at the instant of construction would understate it.
    for (let round = 0; round < 32 && core.has_ready(handle); round += 1) {
      const ready = core.take_ready(handle);
      replayConfEntries(core, handle, ready.committedEntries);
      core.persist_ready(handle);
      const light = core.advance_append(handle);
      replayConfEntries(core, handle, light.committedEntries);
      core.advance_apply(handle);
    }
    // A restore fault applies HERE too. The round-2 attack patched
    // `create_node` itself, so the restored read and the replay entitlement
    // were faulted equally and the old `restored == entitled` comparison
    // stayed green. A fault that only reached one side would not reproduce
    // the attack.
    const replayed = restoreFault?.mutateRestoredConfState ?
      restoreFault.mutateRestoredConfState({...core.conf_state(handle)}) :
      core.conf_state(handle);
    return {
      confState: recordCoreRead(ORIGIN.CORE_READ, String(id), replayed),
      status: core.status(handle),
    };
  } finally {
    core.free(handle);
  }
}

// The restore mutants rewrite what a restart is handed.
function mutateRestore(created, record, mutant) {
  if (mutant === HOST_MUTANT.RESTORE_APPLIED_AHEAD_OF_LOG) {
    const last = record.entries.length === 0 ? 0 :
      Number(record.entries[record.entries.length - 1].index);
    return {...created, applied: String(last + 5)};
  }
  if (mutant === HOST_MUTANT.RESTORE_NEW_CONF_OLD_APPLIED) {
    return {...created, applied: '0'};
  }
  if (mutant === HOST_MUTANT.RESTORE_OLD_CONF_NEW_APPLIED) {
    const last = record.entries.length === 0 ? 0 :
      Number(record.entries[record.entries.length - 1].index);
    const stale = created.bootstrap?.snapshot?.metadata?.confState || null;
    return {
      ...created,
      applied: String(last),
      peers: created.peers,
      bootstrap: {...created.bootstrap, confState: stale || undefined},
    };
  }
  return created;
}

/**
 * An in-process group of peers driven by explicit ticks and explicit message
 * delivery. No timer, no worker, no socket, and no cache parameter.
 * @param {Object} options
 * @return {Object}
 */
function createDeterministicCluster({
  voters,
  learners = [],
  tick = {election: 10, heartbeat: 3},
  hostMutant = HOST_MUTANT.NONE,
  validateIngress = false,
  groupId = 'group-1',
} = {}) {
  const core = loadForkedCore();
  const witness = createWitness();
  const peers = new Map();
  const createOptions = (id, record) => ({
    id: String(id),
    // What a restart is handed is the durable record's own configuration, so
    // it carries that record's provenance; only the very first creation of a
    // group states who its peers are, which is the one place a membership
    // MUST be declared - it is the input to the group's existence, not a
    // claim about it.
    peers: record ?
      membershipArray(record.confState || {}, 'voters') :
      brand(voters.map(String), ORIGIN.REQUESTED_CHANGE,
        {why: 'the peers the group was created with'}),
    learners: record ?
      membershipArray(record.confState || {}, 'learners') :
      brand(learners.map(String), ORIGIN.REQUESTED_CHANGE,
        {why: 'the learners the group was created with'}),
    electionTick: tick.election,
    heartbeatTick: tick.heartbeat,
    ...(record ? {
      applied: String(record.appliedIndex || '0'),
      bootstrap: bootstrapFromRecord(record),
    } : {}),
  });
  for (const id of [...voters, ...learners]) {
    const handle = core.create_node(createOptions(id, null));
    peers.set(String(id), {
      id: String(id),
      handle,
      // The configuration a replica is created with is durable from the
      // start; a host that did not write it down could not restart at all.
      record: durableRecord(
        recordCoreRead(ORIGIN.CORE_READ, String(id), core.conf_state(handle))),
      inbox: [],
      core,
      alive: true,
      halted: false,
      // Isolation models a peer nobody can reach: its own Ready loop still
      // runs, so what it recovers comes from its own durable log alone.
      isolated: false,
      initialConfState: recordCoreRead(
        ORIGIN.CORE_READ, String(id), core.conf_state(handle)),
      applyConfChangeCalls: [],
      applyConfChangeErrors: [],
    });
  }
  // Cluster-wide counters AND per-peer counters. The verifier's point stands:
  // a cluster-wide `delivered` cannot express "nothing reached THIS peer",
  // so a window with any traffic in it could not pass even honestly. The
  // isolated-restore claim is about one victim, so it is counted per peer.
  // A restored peer whose binding returns a wrong ConfState, modelled. The
  // fault applies only to a peer that has been restarted, because that is
  // what the attack is about.
  const faultedConfState = (peer, state) => {
    if (!restoreFault?.mutateRestoredConfState || !peer.restoreFaultArmed) {
      return state;
    }
    return restoreFault.mutateRestoredConfState({...state});
  };

  const isolation = {blockedInbound: 0, blockedOutbound: 0, delivered: 0};
  const countersOf = (peer) => {
    peer.isolationCounters = peer.isolationCounters ||
      {blockedInbound: 0, blockedOutbound: 0, delivered: 0, attempted: 0};
    return peer.isolationCounters;
  };
  const routeFrom = (fromPeer, message) => {
    const target = peers.get(String(message.to));
    if (fromPeer?.isolated) {
      isolation.blockedOutbound += 1;
      countersOf(fromPeer).blockedOutbound += 1;
      return;
    }
    if (target?.isolated) {
      isolation.blockedInbound += 1;
      const counters = countersOf(target);
      counters.blockedInbound += 1;
      counters.attempted += 1;
      return;
    }
    // A peer halted at a boundary is dead from that instant: it neither
    // pumps nor receives. Otherwise its core would keep advancing on
    // incoming messages and the boundary would not be the moment it names.
    if (target && target.alive && !target.halted) {
      target.inbox.push(message);
    }
  };
  const stopPoints = new Map();
  const pumpAll = () => {
    const applied = new Map();
    for (const peer of peers.values()) {
      applied.set(peer.id, pumpPeer(peer,
        (message) => routeFrom(peer, message),
        stopPoints.get(peer.id) || null, hostMutant));
    }
    return applied;
  };
  const stepRejections = [];
  const ingressRefusals = [];
  const deliver = () => {
    let delivered = 0;
    for (const peer of peers.values()) {
      const inbox = peer.inbox;
      peer.inbox = [];
      for (const message of inbox) {
        if (peer.isolated) {
          // Nothing may reach an isolated peer. Reaching this point means
          // the isolation was breached, which would make an isolated-restore
          // claim rest on the network after all.
          throw new Error(`${ISOLATION_BREACH}${peer.id}`);
        }
        if (!peer.alive || peer.halted) {
          continue;
        }
        if (validateIngress) {
          const refusal = envelopeRefusal({
            message, selfId: peer.id, groupId,
            confState: core.conf_state(peer.handle),
            durableLastIndex: peer.record.entries.length === 0 ? '0' :
              String(peer.record.entries[peer.record.entries.length - 1]
                .index),
          });
          if (refusal) {
            ingressRefusals.push({to: peer.id, from: String(message.from),
              msgType: Number(message.msgType), refusal});
            continue;
          }
        }
        isolation.delivered += 1;
        const counters = countersOf(peer);
        counters.delivered += 1;
        counters.attempted += 1;
        try {
          core.step(peer.handle, message);
          delivered += 1;
        } catch (error) {
          // A real transport faces this too: once a peer has been removed
          // from the configuration the core refuses its messages. Recorded,
          // not swallowed - the scenarios report the count.
          stepRejections.push({
            to: peer.id, from: String(message.from),
            msgType: Number(message.msgType),
            reason: String(error?.message || error),
          });
        }
      }
    }
    return delivered;
  };
  const cluster = {
    core,
    peers,
    witness,
    stepRejections,
    ingressRefusals,
    rounds: 0,
    ticksDriven: 0,
    handleOf(id) {
      return peers.get(String(id)).handle;
    },
    tick(rounds = 1) {
      for (let round = 0; round < rounds; round += 1) {
        for (const peer of peers.values()) {
          if (peer.alive) {
            core.tick(peer.handle);
          }
        }
        cluster.ticksDriven += 1;
      }
    },
    settle(bound = 400) {
      const appliedAll = [];
      for (let round = 0; round < bound; round += 1) {
        cluster.rounds += 1;
        const applied = pumpAll();
        for (const [peerId, entries] of applied) {
          for (const entry of entries) {
            appliedAll.push({peerId, ...entry});
          }
        }
        const delivered = deliver();
        const busy = delivered > 0 ||
          [...peers.values()].some((peer) =>
            peer.alive && !peer.halted && core.has_ready(peer.handle));
        if (!busy) {
          return appliedAll;
        }
      }
      throw new Error(`cluster did not settle within ${bound} rounds`);
    },
    /**
     * The configuration each live peer itself reports, tagged as a core read.
     * @return {Map<string, Object>}
     */
    confStates() {
      const states = new Map();
      for (const peer of peers.values()) {
        if (peer.alive) {
          states.set(peer.id, recordCoreRead(ORIGIN.CORE_READ, peer.id,
            faultedConfState(peer, core.conf_state(peer.handle)), witness));
        }
      }
      return states;
    },
    /**
     * Each live peer's own status, tagged as a core read.
     * @return {Map<string, Object>}
     */
    statuses() {
      const statuses = new Map();
      for (const peer of peers.values()) {
        if (peer.alive) {
          statuses.set(peer.id,
            witness.tag(core.status(peer.handle), peer.id, 'status'));
        }
      }
      return statuses;
    },
    leaders() {
      return [...cluster.statuses().entries()]
        .filter(([, status]) => Number(status.raftState) === RAFT_STATE.LEADER)
        .map(([id]) => id);
    },
    stopAt(id, boundary) {
      stopPoints.set(String(id), boundary);
    },
    stoppedAt(id) {
      return peers.get(String(id))?.stoppedAt;
    },
    stoppedAtEntryIndex(id) {
      return peers.get(String(id))?.stoppedAtEntryIndex;
    },
    readyPhaseOf(id) {
      return peers.get(String(id))?.readyPhase || null;
    },
    /**
     * What this peer routed in its last Ready cycle, split at the moment it
     * applied a configuration change.
     * @param {string} id
     * @return {Object|null}
     */
    cycleRoutingOf(id) {
      return peers.get(String(id))?.cycleRouting || null;
    },
    /**
     * The state the peer's core actually holds, read back out of the module.
     * @param {string} id
     * @return {Object}
     */
    persistedStateOf(id) {
      const state = core.export_persisted_state(peers.get(String(id)).handle);
      recordCoreRead(ORIGIN.CORE_READ, String(id), state.confState);
      return state;
    },
    /**
     * A deep copy of one peer's durable record whose configuration keeps its
     * provenance.
     * @param {string} id
     * @return {Object}
     */
    durableSnapshotOf(id) {
      return snapshotDurableRecord(peers.get(String(id)).record);
    },
    /**
     * Rewrite one peer's durable record, as a corruption of the durable
     * state would. The result is STILL the durable record - that is the
     * whole point of the attack - so it keeps that provenance, with the
     * corruption named in it.
     * @param {string} id
     * @param {string} corruption what was done to it
     * @param {Function} rewrite
     * @return {Object} the corrupted record
     */
    corruptDurableRecord(id, corruption, rewrite) {
      const peer = peers.get(String(id));
      rewrite(peer.record);
      brand(peer.record.confState, ORIGIN.DURABLE_RECORD,
        {wrote: `a durable record corrupted by ${corruption}`, corruption});
      return peer.record;
    },
    /**
     * Propose a configuration change THROUGH the harness, which is what
     * writes it into the ledger. Only a change the core was actually given
     * can afterwards be cited as "the requested change".
     * @param {string} id the peer to propose on
     * @param {Object} change
     */
    proposeConfChangeV2(id, change) {
      recordProposal(change, String(id));
      core.propose_conf_change_v2(peers.get(String(id)).handle, change);
    },
    /**
     * Apply a configuration change to a peer's core directly, outside the
     * Ready loop, and return the ConfState the CORE returned.
     * @param {string} id
     * @param {Object} change
     * @return {Object}
     */
    applyConfChangeOn(id, change) {
      const peer = peers.get(String(id));
      return recordCoreRead(ORIGIN.CORE_RETURN, peer.id,
        core.apply_conf_change(peer.handle, change));
    },
    /**
     * Cut a peer off: nothing reaches it and nothing it sends is delivered.
     * Its own Ready loop keeps running, so whatever it recovers came from
     * its own durable log.
     * @param {string} id
     * @param {boolean} isolated
     */
    setIsolated(id, isolated) {
      const peer = peers.get(String(id));
      peer.isolated = isolated === true;
      if (peer.isolated) {
        peer.inbox = [];
      }
    },
    /**
     * Every index this peer has called apply_conf_change for, in order.
     * @param {string} id
     * @return {Array<string>}
     */
    applyConfChangeCalls(id) {
      return [...peers.get(String(id)).applyConfChangeCalls];
    },
    resetApplyConfChangeCalls(id) {
      peers.get(String(id)).applyConfChangeCalls = [];
    },
    /**
     * Every configuration entry the core REFUSED to apply, with its reason.
     * @param {string} id
     * @return {Array<Object>}
     */
    applyConfChangeErrors(id) {
      return [...peers.get(String(id)).applyConfChangeErrors];
    },
    /**
     * The in-memory configuration this peer's core holds right now, tagged
     * as a core read. Usable while the peer is halted at a boundary and not
     * yet crashed.
     * @param {string} id
     * @return {Object}
     */
    coreConfStateOf(id) {
      const peer = peers.get(String(id));
      return recordCoreRead(ORIGIN.CORE_READ, peer.id,
        faultedConfState(peer, core.conf_state(peer.handle)), witness);
    },
    /**
     * The peer whose core reports itself leader, or null.
     * @return {string|null}
     */
    leaderId() {
      const leaders = cluster.leaders();
      return leaders.length === 1 ? leaders[0] : null;
    },
    durableRecordOf(id) {
      return peers.get(String(id)).record;
    },
    aliveIds() {
      return [...peers.values()].filter((peer) => peer.alive)
        .map((peer) => peer.id);
    },
    /**
     * Kill a peer: the handle goes, and with it everything that was not
     * durably written.
     * @param {string} id
     */
    crash(id) {
      const peer = peers.get(String(id));
      if (!peer.alive) {
        return;
      }
      peer.alive = false;
      peer.halted = false;
      peer.inbox = [];
      core.free(peer.handle);
      peer.handle = null;
    },
    /**
     * Rebuild a crashed peer from its durable record ALONE.
     * @param {string} id
     * @param {Object} [options] {withApplied: false} drops the applied index
     *   so re-application can be measured rather than reasoned about.
     * @return {Object} what the restart was given
     */
    restart(id, options = {}) {
      const peer = peers.get(String(id));
      const record = peer.record;
      if (restoreFault?.corruptRecord) {
        restoreFault.corruptRecord(record);
        brand(record.confState, ORIGIN.DURABLE_RECORD,
          {wrote: `a durable record corrupted by ${restoreFault.why}`});
      }
      peer.restoreFaultArmed = restoreFault !== null;
      stopPoints.delete(String(id));
      peer.halted = false;
      peer.stoppedAt = undefined;
      peer.stoppedAtEntryIndex = undefined;
      peer.applyConfChangeCalls = [];
      // Refusals are NOT cleared by a restart: a scenario must be able to
      // see every refusal the whole run produced.
      let created = createOptions(peer.id, record);
      if (options.withApplied === false) {
        delete created.applied;
      }
      const restoreMutant = options.mutant || hostMutant;
      if (restoreMutant === HOST_MUTANT.RESTORE_OLD_CONF_NEW_APPLIED) {
        created = {...created,
          bootstrap: {...created.bootstrap,
            confState: peer.initialConfState},
          peers: membershipArray(peer.initialConfState, 'voters'),
          learners: membershipArray(peer.initialConfState, 'learners')};
      }
      created = mutateRestore(created, record, restoreMutant);
      peer.handle = core.create_node(created);
      peer.alive = true;
      return created;
    },
    /**
     * The configuration the durable record alone entitles this peer to,
     * computed by the core from a scratch RawNode built from exactly what
     * was persisted.
     * @param {string} id
     * @return {Object}
     */
    entitledConfState(id) {
      return confStateEntitledByDurableState(
        core, id, peers.get(String(id)).record, tick);
    },
    isolationCounters() {
      return {...isolation};
    },
    /**
     * What was attempted at ONE peer: delivered, blocked inbound, blocked
     * outbound. The isolated-restore claim is about a single victim, so a
     * cluster-wide count cannot express it.
     * @param {string} id
     * @return {Object}
     */
    isolationCountersOf(id) {
      return {...countersOf(peers.get(String(id)))};
    },
    /**
     * Tick ONE peer. Used to put real traffic through an isolation window
     * without ticking the whole cluster into an election it did not ask for.
     * @param {string} id
     * @param {number} rounds
     */
    tickPeer(id, rounds = 1) {
      const peer = peers.get(String(id));
      for (let round = 0; round < rounds && peer.alive; round += 1) {
        core.tick(peer.handle);
        cluster.ticksDriven += 1;
      }
    },
    /**
     * Make one peer campaign - deterministically, with no reliance on the
     * randomized election timeout the binding cannot seed.
     * @param {string} id
     */
    campaignOn(id) {
      core.campaign(peers.get(String(id)).handle);
    },
    /**
     * Hand a message straight to a peer's inbox, bypassing routing. Used
     * only to prove that the isolation guard really throws.
     * @param {string} id
     * @param {Object} message
     */
    injectForTest(id, message) {
      peers.get(String(id)).inbox.push(message);
    },
    free() {
      for (const peer of peers.values()) {
        if (peer.alive) {
          core.free(peer.handle);
          peer.alive = false;
        }
      }
    },
  };
  return cluster;
}

/**
 * A ConfChangeV2 in the core's own vocabulary.
 * @param {Array<{type: number, nodeId: string}>} changes
 * @param {number} transition
 * @return {Object}
 */
function confChangeV2(changes, transition = CONF_CHANGE_TRANSITION.AUTO) {
  // NOT branded. Building a change proves nothing; only PROPOSING it to the
  // core writes it into the ledger, and only a proposal in the ledger makes
  // its node ids an admissible expectation.
  return {
    transition,
    changes: changes.map((change) => ({
      changeType: change.type,
      nodeId: String(change.nodeId),
    })),
  };
}

export {
  CONF_CHANGE_TRANSITION,
  CONF_CHANGE_TYPE,
  ENTRY_TYPE,
  FORBIDDEN_CONVENIENCE,
  FORK,
  HOST_MUTANT,
  HOST_MUTANT_CONTROLS,
  ISOLATION_BREACH,
  MEMBERSHIP_FIELD,
  MEMBERSHIP_REFUSAL,
  NOT_FROM_CORE,
  ORIGIN,
  RAFT_STATE,
  REQUIRED_PRIMITIVES,
  RESTART_BOUNDARY,
  assertMembershipDiffers,
  assertMembershipEmpty,
  assertMembershipEqual,
  assertMembershipExcludes,
  assertMembershipIncludes,
  assertMembershipNotEmpty,
  assertMembershipSize,
  auditAgainstLedger,
  auditMembershipProvenance,
  changedNodeIds,
  confChangeV2,
  createDeterministicCluster,
  derivedMembership,
  envelopeRefusal,
  instantiateFreshForkedCore,
  fullMembershipFromCore,
  loadForkedCore,
  membershipArray,
  restoreFaultIsArmed,
  setRestoreFaultForNegativeControl,
  selectMembers,
};
