// What the raft-rs-wasm binding must expose for phase 1, what it must never
// expose, and the names of the files that carry it.
//
// The primitive list is not a convenience API: every name is a RawNode
// operation, a raft-rs storage operation, or the export/restore of the state
// the raft-rs Ready model requires its host to keep. Nothing on it is a
// Lagrange idea.

const RAFT_RS_WASM_FILE = Object.freeze({
  // Generated and vendored material lives under the repository's `vendor/`
  // root, not under `src/`: wasm-pack output is nobody's source, and keeping
  // it out of the source tree is what lets every source checker stay on its
  // own default walk with no exclusion for it.
  VENDOR_DIRECTORY: 'vendor',
  PARENT_OF_SOURCE_ROOT: '..',
  DIRECTORY: 'raft-rs-wasm',
  GLUE: 'raft_wasm.js',
  WASM: 'raft_wasm_bg.wasm',
  PACKAGE_DIRECTORY: 'pkg',
  DIGEST: 'artifact-digest.json',
  BUILD_DOC: 'BUILD.md',
  CRATE_SOURCE_DIRECTORY: 'raft-0.7.0',
  // The fork's own Rust, which the wasm was built from. Its match arms are
  // the authority for the wire numbers the JavaScript side must not invent.
  FORK_SOURCE_DIRECTORY: 'src',
  FORK_SOURCE_FILE: 'lib.rs',
});

// Where the binding sits relative to the root that carries it: the repository
// in a source checkout (SOURCE_ROOT_FROM_OWNER above the runtime owner's own
// directory), and the directory of the bundle or the SEA executable in the
// packaged layouts, where scripts/build-sea.js stages STAGED_ENTRIES at this
// same ROOT. The runtime owner finds it through the SEA runtime-file resolver
// (src/sea/runtime-file-resolution.js), whose search order is exactly those
// roots; neither the owner nor the bundler spells the layout itself.
const RAFT_RS_BINDING_ROOT = Object.freeze([
  RAFT_RS_WASM_FILE.VENDOR_DIRECTORY, RAFT_RS_WASM_FILE.DIRECTORY]);
const RAFT_RS_BINDING_LAYOUT = Object.freeze({
  ROOT: RAFT_RS_BINDING_ROOT,
  DIGEST_FROM_ROOT: Object.freeze([
    ...RAFT_RS_BINDING_ROOT, RAFT_RS_WASM_FILE.DIGEST]),
  SOURCE_ROOT_FROM_OWNER: Object.freeze([
    RAFT_RS_WASM_FILE.PARENT_OF_SOURCE_ROOT,
    RAFT_RS_WASM_FILE.PARENT_OF_SOURCE_ROOT]),
  // What the runtime owner reads: the digest, and the wasm-pack package whose
  // own package.json keeps the glue CommonJS under an ESM root.
  STAGED_ENTRIES: Object.freeze([
    RAFT_RS_WASM_FILE.DIGEST, RAFT_RS_WASM_FILE.PACKAGE_DIRECTORY]),
});

// Whether the binding a layout carries is present, matches its recorded
// digests and exposes exactly the primitive facade: the runtime owner's
// verdict, never inferred from a missing file or a thrown error.
const RAFT_RS_BINDING_STATE = Object.freeze({
  VERIFIED: 'verified',
  UNAVAILABLE: 'unavailable',
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

// The core's own Display text of a refusal the host decides on: raft-rs's
// Error::ProposalDropped, which the binding carries as the message of its
// typed refusal (prefixed with the primitive that refused).
const RAFT_RS_CORE_REFUSAL_TEXT = Object.freeze({
  PROPOSAL_DROPPED: 'raft: proposal dropped',
});

export {
  RAFT_RS_BINDING_LAYOUT,
  RAFT_RS_BINDING_STATE,
  RAFT_RS_CORE_ERROR_MSG,
  RAFT_RS_CORE_PRIMITIVES,
  RAFT_RS_CORE_REFUSAL_TEXT,
  RAFT_RS_DIGEST_ALGORITHM,
  RAFT_RS_DIGEST_ENCODING,
  RAFT_RS_DIGEST_KEY,
  RAFT_RS_FORBIDDEN_CONVENIENCE,
  RAFT_RS_WASM_FILE,
};
