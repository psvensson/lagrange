// The host contract of one raft-rs 0.7 Ready cycle, in order, derived from
// raft-rs 0.7 itself.
//
// Every step names the lines of the crate that impose it. Those lines are
// vendored under `vendor/raft-rs-wasm/raft-0.7.0/` with their digests recorded
// in `vendor/raft-rs-wasm/artifact-digest.json`, so each citation resolves
// from this repository and a test reads the cited line and checks the text is
// there. Nothing in this file is copied from an instruction, from a previous
// quest's artifact, or from a summary of the crate.
//
// `raft-rs-ready-loop.js` iterates this list. The loop does not keep its own
// order: the order below is the order it runs, so "the loop's order derives
// from the host contract" is structural rather than asserted.
//
// Where the crate's documentation and the crate's example disagree, the
// safety note governs and both sides are cited: see ORDER_CONTRADICTION.

const RAFT_RS_CRATE = Object.freeze({
  NAME: 'raft',
  VERSION: '0.7.0',
  LIB: 'src/lib.rs',
  RAW_NODE: 'src/raw_node.rs',
  RAFT_LOG: 'src/raft_log.rs',
  EXAMPLE: 'examples/five_mem_node/main.rs',
});

// The one place the crate contradicts itself, and which side this host takes.
const ORDER_CONTRADICTION = Object.freeze({
  documentedOrder:
    'src/lib.rs numbers the steps with the committed entries third ' +
    '(lib.rs:256) and the HardState fifth (lib.rs:337), and the example ' +
    'follows that order: it applies the committed entries at main.rs:312 ' +
    'and only then appends (main.rs:316) and stores the hard state ' +
    '(main.rs:326).',
  safetyNote:
    'the note at src/lib.rs:304-310 says that order is unsafe - "it ' +
    'doesn\'t guarentee commit index is persisted before being applied ... ' +
    'apply index can be larger than commit index and cause panic" - and ' +
    'instructs "persisting commit index with or before applying entries".',
  resolution:
    'the safety note governs. This host appends the entries and stores the ' +
    'hard state, commit index included, BEFORE it applies any committed ' +
    'entry. The alternative the note offers, clamping the commit index to ' +
    'max(commit, applied) after a restart, the note itself calls out as ' +
    'losing log silently.',
  refusalIfIgnored:
    'a restart from a record whose applied index ran past its durable ' +
    'commit index is refused by the core itself at src/raft_log.rs:316, ' +
    '"applied(N) is out of range [prev_applied(..), min(committed(..), ' +
    'persisted(..))]".',
});

// The durable writes a step may make. A step that writes nothing says so with
// a name rather than with null, so a journal entry is never an absence.
const RAFT_RS_HOST_WRITE = Object.freeze({
  NONE: 'none',
  SNAPSHOT: 'snapshot',
  ENTRIES: 'entries',
  HARD_STATE: 'hardState',
  CONF_STATE_AND_APPLIED: 'confStateAndApplied',
  APPLIED: 'applied',
  COMMIT_INDEX: 'commitIndex',
});

const RAFT_RS_HOST_STEP = Object.freeze({
  TAKE_READY: 'take-ready',
  SEND_READY_MESSAGES: 'send-ready-messages',
  PERSIST_SNAPSHOT: 'persist-snapshot',
  PERSIST_ENTRIES: 'persist-entries',
  PERSIST_HARD_STATE: 'persist-hard-state',
  APPLY_READY_COMMITTED_ENTRIES: 'apply-ready-committed-entries',
  SEND_PERSISTED_MESSAGES: 'send-persisted-messages',
  ADVANCE_APPEND: 'advance-append',
  PERSIST_LIGHT_COMMIT_INDEX: 'persist-light-commit-index',
  SEND_LIGHT_MESSAGES: 'send-light-messages',
  APPLY_LIGHT_COMMITTED_ENTRIES: 'apply-light-committed-entries',
  ADVANCE_APPLY: 'advance-apply',
});

function citation(file, line, quote) {
  return Object.freeze({file, line, quote});
}

const RAFT_RS_HOST_STEPS = Object.freeze([
  Object.freeze({
    id: RAFT_RS_HOST_STEP.TAKE_READY,
    step: 'take the Ready',
    writes: RAFT_RS_HOST_WRITE.NONE,
    sources: Object.freeze([
      citation(RAFT_RS_CRATE.EXAMPLE, 250, 'let mut ready = raft_group.ready();'),
    ]),
  }),
  Object.freeze({
    id: RAFT_RS_HOST_STEP.SEND_READY_MESSAGES,
    step: 'send the Ready\'s messages',
    writes: RAFT_RS_HOST_WRITE.NONE,
    sources: Object.freeze([
      citation(RAFT_RS_CRATE.LIB, 203, '1. Check whether `messages` is empty or not.'),
      citation(RAFT_RS_CRATE.EXAMPLE, 266, 'handle_messages(ready.take_messages());'),
    ]),
  }),
  Object.freeze({
    id: RAFT_RS_HOST_STEP.PERSIST_SNAPSHOT,
    step: 'durably store the Ready\'s snapshot, if it carries one',
    writes: RAFT_RS_HOST_WRITE.SNAPSHOT,
    sources: Object.freeze([
      citation(RAFT_RS_CRATE.LIB, 228, '2. Check whether `snapshot` is empty or not.'),
      citation(RAFT_RS_CRATE.EXAMPLE, 272, 'store.wl().apply_snapshot(s)'),
    ]),
  }),
  Object.freeze({
    id: RAFT_RS_HOST_STEP.PERSIST_ENTRIES,
    step: 'durably append the Ready\'s entries',
    writes: RAFT_RS_HOST_WRITE.ENTRIES,
    sources: Object.freeze([
      citation(RAFT_RS_CRATE.LIB, 312, '4. Check whether `entries` is empty or not.'),
      citation(RAFT_RS_CRATE.EXAMPLE, 316, 'store.wl().append(ready.entries())'),
    ]),
  }),
  Object.freeze({
    id: RAFT_RS_HOST_STEP.PERSIST_HARD_STATE,
    step: 'durably store the Ready\'s hard state - term, vote and commit ' +
      'index - before any committed entry is applied',
    writes: RAFT_RS_HOST_WRITE.HARD_STATE,
    sources: Object.freeze([
      citation(RAFT_RS_CRATE.LIB, 337, '5. Check whether `hs` is empty or not.'),
      citation(RAFT_RS_CRATE.LIB, 308,
        'persisting commit index with or before applying entries.'),
      citation(RAFT_RS_CRATE.EXAMPLE, 326, 'store.wl().set_hardstate(hs.clone());'),
    ]),
  }),
  Object.freeze({
    id: RAFT_RS_HOST_STEP.APPLY_READY_COMMITTED_ENTRIES,
    step: 'apply the Ready\'s committed entries; a configuration entry goes ' +
      'through apply_conf_change and the ConfState it RETURNS is stored ' +
      'together with the applied index in one write',
    writes: RAFT_RS_HOST_WRITE.CONF_STATE_AND_APPLIED,
    sources: Object.freeze([
      citation(RAFT_RS_CRATE.LIB, 256,
        '3. Check whether `committed_entries` is empty or not.'),
      citation(RAFT_RS_CRATE.EXAMPLE, 312,
        'handle_committed_entries(raft_group, ready.take_committed_entries());'),
      citation(RAFT_RS_CRATE.EXAMPLE, 292, 'let cs = rn.apply_conf_change(&cc).unwrap();'),
      citation(RAFT_RS_CRATE.EXAMPLE, 293, 'store.wl().set_conf_state(cs);'),
      citation(RAFT_RS_CRATE.RAW_NODE, 311, 'commit_since_index: config.applied,'),
    ]),
  }),
  Object.freeze({
    id: RAFT_RS_HOST_STEP.SEND_PERSISTED_MESSAGES,
    step: 'send the persisted messages',
    writes: RAFT_RS_HOST_WRITE.NONE,
    sources: Object.freeze([
      citation(RAFT_RS_CRATE.LIB, 362,
        '6. Check whether `persisted_messages` is empty or not.'),
      citation(RAFT_RS_CRATE.EXAMPLE, 331,
        'handle_messages(ready.take_persisted_messages());'),
    ]),
  }),
  Object.freeze({
    id: RAFT_RS_HOST_STEP.ADVANCE_APPEND,
    step: 'advance the append phase, taking the LightReady',
    writes: RAFT_RS_HOST_WRITE.NONE,
    sources: Object.freeze([
      citation(RAFT_RS_CRATE.LIB, 387, '7. Call `advance` to notify that the previous work is completed.'),
      citation(RAFT_RS_CRATE.RAW_NODE, 669,
        'pub fn advance_append(&mut self, rd: Ready) -> LightReady {'),
      citation(RAFT_RS_CRATE.EXAMPLE, 335, 'let mut light_rd = raft_group.advance(ready);'),
    ]),
  }),
  Object.freeze({
    id: RAFT_RS_HOST_STEP.PERSIST_LIGHT_COMMIT_INDEX,
    step: 'durably store the LightReady\'s commit index, before its ' +
      'committed entries are applied',
    writes: RAFT_RS_HOST_WRITE.COMMIT_INDEX,
    sources: Object.freeze([
      citation(RAFT_RS_CRATE.EXAMPLE, 338, 'store.wl().mut_hard_state().set_commit(commit);'),
      citation(RAFT_RS_CRATE.LIB, 308,
        'persisting commit index with or before applying entries.'),
    ]),
  }),
  Object.freeze({
    id: RAFT_RS_HOST_STEP.SEND_LIGHT_MESSAGES,
    step: 'send the LightReady\'s messages',
    writes: RAFT_RS_HOST_WRITE.NONE,
    sources: Object.freeze([
      citation(RAFT_RS_CRATE.EXAMPLE, 341, 'handle_messages(light_rd.take_messages());'),
    ]),
  }),
  Object.freeze({
    id: RAFT_RS_HOST_STEP.APPLY_LIGHT_COMMITTED_ENTRIES,
    step: 'apply the LightReady\'s committed entries, recording the applied ' +
      'index - and any ConfState they produce - in one write',
    writes: RAFT_RS_HOST_WRITE.CONF_STATE_AND_APPLIED,
    sources: Object.freeze([
      citation(RAFT_RS_CRATE.EXAMPLE, 343,
        'handle_committed_entries(raft_group, light_rd.take_committed_entries());'),
    ]),
  }),
  Object.freeze({
    id: RAFT_RS_HOST_STEP.ADVANCE_APPLY,
    step: 'advance the apply index inside the core',
    writes: RAFT_RS_HOST_WRITE.NONE,
    sources: Object.freeze([
      citation(RAFT_RS_CRATE.LIB, 389, 'to advance the applied index inside.'),
      citation(RAFT_RS_CRATE.RAW_NODE, 703, 'pub fn advance_apply(&mut self) {'),
      citation(RAFT_RS_CRATE.EXAMPLE, 345, 'raft_group.advance_apply();'),
    ]),
  }),
]);

// What raft-rs does NOT do for its host. Each is a rule the host keeps, and
// each names the line that imposes it.
const RAFT_RS_HOST_OBLIGATIONS = Object.freeze([
  Object.freeze({
    id: 'commit-index-durable-with-or-before-apply',
    obligation:
      'the commit index is durably recorded with or before the committed ' +
      'entries are applied. raft-rs states it by name and says why: an ' +
      'applied index larger than the durable commit index panics on restart.',
    sources: Object.freeze([
      citation(RAFT_RS_CRATE.LIB, 305,
        'but it doesn\'t guarentee commit index is persisted before being applied.'),
      citation(RAFT_RS_CRATE.LIB, 308,
        'persisting commit index with or before applying entries.'),
      citation(RAFT_RS_CRATE.RAFT_LOG, 316,
        '"applied({}) is out of range [prev_applied({}), min(committed({}), persisted({}))]",'),
    ]),
  }),
  Object.freeze({
    id: 'conf-state-and-applied-are-one-write',
    obligation:
      'the ConfState apply_conf_change returns and the applied index are ' +
      'ONE durable write. A record whose configuration is ahead of its ' +
      'applied index describes a state no crash can produce, and a restart ' +
      'from it re-delivers a configuration entry the record already claims ' +
      'to have applied, because the core starts delivering from ' +
      'Config.applied.',
    sources: Object.freeze([
      citation(RAFT_RS_CRATE.EXAMPLE, 292, 'let cs = rn.apply_conf_change(&cc).unwrap();'),
      citation(RAFT_RS_CRATE.EXAMPLE, 293, 'store.wl().set_conf_state(cs);'),
      citation(RAFT_RS_CRATE.RAW_NODE, 311, 'commit_since_index: config.applied,'),
    ]),
  }),
  Object.freeze({
    id: 'apply-conf-change-refusal-is-never-swallowed',
    obligation:
      'apply_conf_change returns a Result. The core refuses a configuration ' +
      'change it cannot apply, and a host that advances past that refusal ' +
      'has silently diverged from the core.',
    sources: Object.freeze([
      citation(RAFT_RS_CRATE.RAW_NODE, 397,
        'pub fn apply_conf_change(&mut self, cc: &impl ConfChangeI) -> Result<ConfState> {'),
    ]),
  }),
]);

export {
  ORDER_CONTRADICTION,
  RAFT_RS_HOST_OBLIGATIONS,
  RAFT_RS_HOST_STEP,
  RAFT_RS_HOST_STEPS,
  RAFT_RS_HOST_WRITE,
};
