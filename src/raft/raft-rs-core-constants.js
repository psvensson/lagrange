// What the raft-rs-wasm binding must expose for phase 1, what it must never
// expose, and the names of the files that carry it.
//
// The primitive list is not a convenience API: every name is a RawNode
// operation, a raft-rs storage operation, or the export/restore of the state
// the raft-rs Ready model requires its host to keep. Nothing on it is a
// Lagrange idea.

const RAFT_RS_WASM_FILE = Object.freeze({
  DIRECTORY: 'raft-rs-wasm',
  GLUE: 'raft_wasm.js',
  WASM: 'raft_wasm_bg.wasm',
  PACKAGE_DIRECTORY: 'pkg',
  DIGEST: 'artifact-digest.json',
  BUILD_DOC: 'BUILD.md',
  CRATE_SOURCE_DIRECTORY: 'raft-0.7.0',
});

// The primitives phase 1 carries forward. Create/restore, the tick, the
// message step, the proposal, the Ready and LightReady lifecycle, the advance
// of append and apply, the status, the export of durable state, and the
// configuration primitives the apply half of the loop needs to turn a
// committed configuration entry into a ConfState.
const RAFT_RS_CORE_PRIMITIVE = Object.freeze({
  CREATE_NODE: 'create_node',
  FREE: 'free',
  TICK: 'tick',
  STEP: 'step',
  PROPOSE: 'propose',
  HAS_READY: 'has_ready',
  TAKE_READY: 'take_ready',
  PERSIST_READY: 'persist_ready',
  ADVANCE_APPEND: 'advance_append',
  ADVANCE_APPLY: 'advance_apply',
  // Phase 3. It is the core's own election primitive, and §11 of the binding
  // direction forbids reaching it for a learner, a removed peer, or a peer
  // that is not a voter in its own committed ConfState. It is on the facade
  // so that raft-rs-election-safety.js can be the one path to it.
  CAMPAIGN: 'campaign',
  STATUS: 'status',
  EXPORT_PERSISTED_STATE: 'export_persisted_state',
  CONF_STATE: 'conf_state',
  SET_CONF_STATE: 'set_conf_state',
  PERSIST_COMMIT_INDEX: 'persist_commit_index',
  APPLY_CONF_CHANGE: 'apply_conf_change',
  DECODE_CONF_CHANGE_ENTRY: 'decode_conf_change_entry',
  PROPOSE_CONF_CHANGE_V2: 'propose_conf_change_v2',
});

const RAFT_RS_CORE_PRIMITIVES = Object.freeze(
  Object.values(RAFT_RS_CORE_PRIMITIVE),
);

// Membership policy - add a learner, wait for it to catch up, promote it,
// remove the old voter - is Lagrange's. A binding that grows one of these
// names has taken an opinion it must not have.
const RAFT_RS_FORBIDDEN_CONVENIENCE = Object.freeze([
  'add_node', 'addNode', 'remove_node', 'removeNode',
  'add_learner', 'addLearner', 'promote_learner', 'promoteLearner',
  'promote', 'demote', 'change_membership', 'changeMembership',
  'replace_node', 'replaceNode', 'membership', 'set_membership',
]);

const RAFT_RS_DIGEST_ALGORITHM = 'sha256';
const RAFT_RS_DIGEST_ENCODING = 'hex';
const RAFT_RS_DIGEST_KEY = Object.freeze({
  WASM: 'wasmSha256',
  GLUE: 'glueSha256',
});

const RAFT_RS_CORE_ERROR_MSG = Object.freeze({
  missingPrimitive: (name) =>
    `the raft-rs-wasm binding does not export ${name}(...); ` +
    'the artifact in pkg/ is not the one this backend was written against',
  forbiddenConvenience: (name) =>
    `the raft-rs-wasm binding exports ${name}, which is membership policy; ` +
    'the binding exposes raft-rs primitives only',
  digestMismatch: (file, recorded, actual) =>
    `${file} does not match artifact-digest.json: recorded ${recorded}, ` +
    `found ${actual}`,
});

export {
  RAFT_RS_CORE_ERROR_MSG,
  RAFT_RS_CORE_PRIMITIVES,
  RAFT_RS_DIGEST_ALGORITHM,
  RAFT_RS_DIGEST_ENCODING,
  RAFT_RS_DIGEST_KEY,
  RAFT_RS_FORBIDDEN_CONVENIENCE,
  RAFT_RS_WASM_FILE,
};
