// The host contract, DERIVED from raft-rs 0.7 itself.
//
// Every step below cites the crate source it is read from. The crate was
// fetched read-only from crates.io (raft 0.7.0, checksum recorded in
// raft-core/BUILD.md) and read at:
//   examples/five_mem_node/main.rs  - the reference Ready loop
//   src/raw_node.rs                 - what advance/advance_append/advance_apply do
//   src/raft.rs                     - commit_apply and the joint auto-leave
//   src/confchange/restore.rs       - how a ConfState is restored
//
// Nothing here is copied from an instruction: each ordering constraint names
// the line that imposes it, and `writeLogConformsToContract` proves the
// adapter's own durable write log follows it.

// Where raft-rs's own documentation contradicts itself, and which side wins.
const ORDER_NOTE = Object.freeze({
  contradiction: 'src/lib.rs numbers the steps with committed entries (3, ' +
    ':256) before the HardState (5, :337), and examples/five_mem_node/' +
    'main.rs:287-327 follows that order. The note at src/lib.rs:304-310 ' +
    'says that order is unsafe for the commit index and instructs the ' +
    'opposite.',
  resolution: 'the safety note wins; this evaluation persists the hard ' +
    'state before applying, and keeps the example\'s order as a host ' +
    'mutant that the core refuses.',
  firstRoundError: 'round 1 of this evaluation derived the loop from the ' +
    'example and recorded the resulting hazard as "not a gap". That was ' +
    'wrong: the note names it. Withdrawn.',
});

const RAFT_RS = Object.freeze({
  CRATE: 'raft 0.7.0',
  CHECKSUM:
    'f12688b23a649902762d4c11d854d73c49c9b93138f2de16403ef9f571ad5bae',
});

// What the core promises, given the host keeps its side.
const RAFT_RS_GUARANTEES = Object.freeze([
  {
    guarantee: 'a configuration change takes effect only when its entry is ' +
      'committed and applied through apply_conf_change, and the ConfState ' +
      'it returns is the configuration',
    source: 'examples/five_mem_node/main.rs:288-293',
  },
  {
    guarantee: 'at most one configuration change may be pending; a second ' +
      'one proposed while the first is unapplied is neutralised into an ' +
      'empty normal entry rather than rejected',
    source: 'src/raft.rs:206-216 (pending_conf_index)',
  },
  {
    guarantee: 'a joint configuration is restored from a ConfState alone, ' +
      'including its outgoing set and its auto-leave flag',
    source: 'src/confchange/restore.rs:103',
  },
  {
    guarantee: 'advance_append commits the persistence of the Ready and ' +
      'returns the LightReady; advance_apply moves the applied index to ' +
      'what has been collected',
    source: 'src/raw_node.rs:654-705',
  },
  {
    guarantee: 'with an automatic transition the core itself appends the ' +
      'entry that leaves the joint configuration once the enter entry is ' +
      'applied on the leader',
    source: 'src/raft.rs:961-982 (commit_apply)',
  },
  {
    guarantee: 'the applied index a node starts from is Config.applied, ' +
      'and committed entries above it are re-delivered',
    source: 'src/raw_node.rs:302-311 (commit_since_index: config.applied)',
  },
]);

// The ordered steps the HOST must perform around one Ready cycle. `writes`
// names the durable write this step makes, as the adapter records it.
const HOST_STEPS = Object.freeze([
  {
    step: 'take the Ready',
    source: 'examples/five_mem_node/main.rs:250',
    writes: null,
  },
  {
    step: 'send the Ready\'s messages',
    source: 'examples/five_mem_node/main.rs:265-268',
    writes: null,
  },
  {
    step: 'apply the snapshot, if any, to the store',
    source: 'examples/five_mem_node/main.rs:270-279',
    writes: 'snapshot',
  },
  {
    step: 'append the Ready\'s entries to the store',
    source: 'src/lib.rs:312 (step 4); examples/five_mem_node/main.rs:316',
    writes: 'entries',
  },
  {
    step: 'store the Ready\'s hard state, INCLUDING its commit index, ' +
      'before any committed entry is applied',
    source: 'src/lib.rs:337 (step 5) with the safety note at :304-310',
    writes: 'hardState',
  },
  {
    step: 'apply the committed entries; a configuration entry goes through ' +
      'apply_conf_change and the RETURNED ConfState is stored together ' +
      'with the applied index in one write',
    source: 'src/lib.rs:256 (step 3); ' +
      'examples/five_mem_node/main.rs:287-296',
    writes: 'confStateAndApplied',
  },
  {
    step: 'send the persisted messages',
    source: 'examples/five_mem_node/main.rs:329-331',
    writes: null,
  },
  {
    step: 'advance the append phase, taking the LightReady',
    source: 'examples/five_mem_node/main.rs:335',
    writes: 'advanceAppend',
  },
  {
    step: 'store the LightReady\'s commit index in the hard state',
    source: 'examples/five_mem_node/main.rs:337-339',
    writes: 'commitIndex',
  },
  {
    step: 'send the LightReady\'s messages and apply its committed entries',
    source: 'examples/five_mem_node/main.rs:341-343',
    writes: null,
  },
  {
    step: 'advance the apply index',
    source: 'examples/five_mem_node/main.rs:345',
    writes: 'advanceApply',
  },
]);

// What raft-rs does NOT do for the host, each read off the same source.
const HOST_MUST_GUARANTEE = Object.freeze([
  {
    obligation: 'the commit index is persisted WITH OR BEFORE the committed ' +
      'entries are applied. raft-rs states this by name and says why: ' +
      '"it doesn\'t guarentee commit index is persisted before being ' +
      'applied ... apply index can be larger than commit index and cause ' +
      'panic. To solve the problem, persisting commit index with or before ' +
      'applying entries." The doc\'s own numbered steps put the committed ' +
      'entries (step 3) before the HardState (step 5); where the steps and ' +
      'this note differ, the note wins. Its alternative - clamping the ' +
      'commit index to max(commit, applied) on restart - the doc itself ' +
      'calls out as silently losing log.',
    source: 'src/lib.rs:304-310 (the note); src/lib.rs:256, :312, :337 ' +
      '(the numbered steps it overrides)',
    measured: 'with one normal entry before the configuration entry and one ' +
      'after, applying before persisting leaves durable applied 3 and ' +
      'durable commit 1, and the restart aborts: ' +
      '"applied(3) is out of range [prev_applied(0), min(committed(1), ' +
      'persisted(4))]" (raft-0.7.0/src/raft_log.rs:314). Kept as the ' +
      'apply-before-persisting-commit host mutant.',
  },
  {
    obligation: 'the ConfState returned by apply_conf_change and the applied ' +
      'index are ONE durable write. A record whose configuration is ahead ' +
      'of its applied index describes a state no crash can produce, and a ' +
      'restart from it re-delivers a configuration entry the record already ' +
      'claims to have applied.',
    source: 'examples/five_mem_node/main.rs:292-293 with ' +
      'src/raw_node.rs:302-311',
    measured: 'the confstate-and-applied-written-separately host mutant ' +
      'fails restart equivalence',
  },
  {
    obligation: 'an apply_conf_change refusal is never swallowed. The core ' +
      'refuses a configuration change it cannot apply ("config is already ' +
      'joint", "can\'t leave a non-joint config"); a host that advances ' +
      'past it has silently diverged from the core.',
    source: 'src/raw_node.rs:397-401 (apply_conf_change returns Result)',
  },
  {
    obligation: 'nothing is advanced before what it accounts for is durable:' +
      ' the entries and hard state of a Ready are stored before ' +
      'advance_append',
    source: 'examples/five_mem_node/main.rs:316-335',
  },
  {
    obligation: 'the ConfState returned by apply_conf_change is stored ' +
      'durably; raft-rs stores it only in the host\'s Storage',
    source: 'examples/five_mem_node/main.rs:292-293',
  },
  {
    obligation: 'the applied index is durable and is handed back as ' +
      'Config.applied on restart, and it never moves past an entry whose ' +
      'effect is not durable',
    source: 'src/raw_node.rs:302-311',
  },
  {
    obligation: 'the commit index from the LightReady is stored; raft-rs ' +
      'returns it and writes nothing',
    source: 'examples/five_mem_node/main.rs:337-339',
  },
  {
    obligation: 'a tick source exists: the core surfaces nothing for an ' +
      'entry it appended itself (the joint auto-leave) until a tick drives ' +
      'the next Ready',
    source: 'src/raft.rs:961-982',
  },
  {
    obligation: 'peer identity is the host\'s: raft-rs takes a u64 and ' +
      'never assigns, recycles or validates one',
    source: 'src/config.rs (Config.id)',
  },
]);

// What a backend implementer will assume the core does, and it does not.
// Each line is something THIS evaluation drove, not something read.
const CORE_DOES_NOT_DO_THIS_FOR_YOU = Object.freeze([
  {
    assumption: 'propose_conf_change returning ok means the change will ' +
      'happen',
    reality: 'it means the proposal was accepted for appending. A second ' +
      'change proposed while one is pending also returns ok and is ' +
      'neutralised into an empty normal entry that never takes effect.',
    measured: 'pending-conf-change: both proposals returned ok, the ' +
      'committed entry types were [2, 0], and the second change never took ' +
      'effect',
    source: 'src/raft.rs:206-216 (pending_conf_index)',
  },
  {
    assumption: 'pendingConfIndex tells you whether a change is in progress',
    reality: 'it does NOT clear when the change is applied. The signal is ' +
      'pendingConfIndex > applied, not pendingConfIndex != 0.',
    measured: 'pending-conf-change: pendingConfIndexAfter stayed at the ' +
      'entry index after the change was applied',
    source: 'src/raft.rs:206-216',
  },
  {
    assumption: 'the core will not promote a learner that has not caught up',
    reality: 'it promotes whatever the change names. Catch-up is a HOST ' +
      'policy and must be read from the core\'s own progress.',
    measured: 'promotion-gating: a learner that never received anything ' +
      '(matched behind the leader\'s commit) was promoted to voter; the ' +
      'same position with the policy reading progress refused',
    source: 'src/confchange/changer.rs (apply_conf_change applies the ' +
      'requested change)',
  },
  {
    assumption: 'the core notices a peer id being reused',
    reality: 'it checks nothing. Identity is wholly a host obligation, and ' +
      'the retired set must be DURABLE or a restarted owner will hand a ' +
      'dead replica\'s id to a live one.',
    measured: 'peer-identity: the mapping double refuses a retired id, and ' +
      'the refusal survives a restart of the mapping owner rebuilt from its ' +
      'durable rows alone',
    source: 'src/config.rs (Config.id is a u64 the host chooses)',
  },
  {
    assumption: 'asking any node to campaign is safe',
    reality: 'a node the configuration no longer holds PANICS if it wins: a ' +
      'quorum over an empty voter set is trivially satisfied and ' +
      'become_leader then unwraps its own missing progress. The host must ' +
      'never campaign a peer that its own ConfState does not contain.',
    measured: 'driving the retained-follower joint-left row without that ' +
      'guard trapped with "called `Option::unwrap()` on a `None` value" at ' +
      'raft-0.7.0/src/raft.rs:1225',
    source: 'src/raft.rs:1225 (become_leader, ' +
      'self.mut_prs().get_mut(id).unwrap())',
  },
  {
    assumption: 'a message-driven pump is enough',
    reality: 'with the automatic transition the core appends the entry that ' +
      'leaves the joint configuration ITSELF and surfaces nothing for it ' +
      'until a tick. Without a tick source the group stays joint forever.',
    measured: 'auto-leave-entry-self-appended-before-any-tick: has_ready was ' +
      'false on every peer, the leader held the entry and no follower did, ' +
      'and it committed only after the leader was ticked',
    source: 'src/raft.rs:961-982 (commit_apply)',
  },
  {
    assumption: 'a proposal whose leader died before persisting it is lost',
    reality: 'if one follower held it, it can still commit.',
    measured: 'lost-proposal-one-follower: driven, observed, and the only ' +
      'assertion is the safety property',
    source: 'the Raft paper\'s leader-completeness property',
  },
  {
    assumption: 'the core protects you from a corrupted durable record',
    reality: 'the record IS the configuration. A consistently rewritten ' +
      'ConfState at a boundary where the change is not yet applied cannot ' +
      'be contradicted by anything the core holds.',
    measured: 'durable-record-corruptions: add-a-voter, drop-a-voter and ' +
      'learner-into-voter are caught at every boundary except joint-entered, ' +
      'where they are undetectable from durable state alone',
    source: 'src/storage.rs:106-112 (initial_state returns what the host ' +
      'persisted)',
  },
  {
    assumption: 'elections can be made reproducible',
    reality: 'raft-rs 0.7 draws the randomized election timeout from its own ' +
      'RNG and Config exposes no seed. Every election in this evaluation is ' +
      'forced with campaign() instead.',
    measured: 'determinism-proof: with only the leader ticked and every ' +
      'election forced, 200 runs of each scenario produce identical records',
    source: 'src/config.rs (no seed field)',
  },
]);

// THE BACKEND OBLIGATIONS. What a Lagrange raft-rs backend must do, each
// with the measurement or verifier observation behind it and its
// attribution. Two independent verification rounds produced these; they are
// the part of this evaluation a backend implementer actually needs.
const BACKEND_OBLIGATIONS = Object.freeze([
  {
    heading: 'Inbound message safety',
    obligation: 'validate the ENVELOPE of every message before `step`: the ' +
      'group id, that the message is addressed to this peer, that the ' +
      'sender is in this peer\'s own ConfState read from the core, that the ' +
      'type is known and not local-only, and that a heartbeat\'s commit is ' +
      'not beyond this peer\'s durable last index. Do NOT duplicate Raft ' +
      'protocol validation.',
    measured: 'verification round 2 found several message shapes reaching a ' +
      'raft-rs fatal through `step`, from the leader, from a non-leader, ' +
      'from an unknown peer and with `to != self`. The ingress-validation ' +
      'scenario runs them with and without the validator and records which ' +
      'become clean refusals and which still reach a fatal.',
    attribution: 'hosting-model',
  },
  {
    heading: 'Runtime trap recovery',
    obligation: 'treat a trap or fatal as a RUNTIME-HEALTH event with ' +
      'bounded recovery: stop using the affected runtime, instantiate a ' +
      'fresh WASM module and restore the groups from their durable records. ' +
      'Multi-Raft in one WASM instance is viable only on that basis.',
    measured: 'the handle-table poisoning is fixed and one fatal no longer ' +
      'immediately poisons other handles, but aborts are a finite ' +
      'per-instance budget - the runtime-trap-recovery scenario measures ' +
      'how many, and what a fresh instance plus restore costs at 100 and ' +
      '1,000 groups. PRELIMINARY figures.',
    attribution: 'wasm-binding',
  },
  {
    heading: 'Membership and elections',
    obligation: 'never call `campaign()` on a learner, on a removed peer, ' +
      'or on any peer absent from its own committed ConfState.',
    measured: 'round 2: only a host `campaign()` reaches the panic at ' +
      'raft-0.7.0/src/raft.rs:1225 - ticks do not, because raft.rs:1083 ' +
      'requires `promotable`. The MECHANISM this evaluation previously ' +
      'stated (a quorum over an empty voter set) is WRONG and withdrawn: ' +
      'what was measured is that the real voters granted their votes to the ' +
      'removed peer, the live leader was deposed, and the removed peer then ' +
      'panicked on the winning vote response. Separately, a host ' +
      '`campaign()` on a LEARNER does not panic - the learner BECOMES ' +
      'LEADER and commits.',
    attribution: 'host-obligation',
  },
  {
    heading: 'pre_vote and check_quorum',
    obligation: 'decide both explicitly at the integration stage.',
    measured: 'NOT EVALUATED HERE. Neither is configured or exercised ' +
      'anywhere in this evaluation. Round 2 measured the consequence of ' +
      'leaving them off: a removed peer that kept ticking campaigned ' +
      'repeatedly, reached term 28, and deposed the live leader on ' +
      'reconnect, with real voters granting it their votes. Do not assume ' +
      'the defaults suit.',
    attribution: 'raft-rs',
  },
  {
    heading: 'Promotion policy',
    obligation: 'gate promotion on the core\'s own progress. raft-rs ' +
      'permits promoting a learner that has not caught up; catch-up is a ' +
      'Lagrange control-plane responsibility.',
    measured: 'the promotion-gating scenario promotes a learner that never ' +
      'received anything, and shows the same position refused by a policy ' +
      'reading the leader\'s progress for that learner.',
    attribution: 'host-obligation',
  },
  {
    heading: 'Peer-id reuse',
    obligation: 'own peer identity entirely, and make the retired set ' +
      'DURABLE: raft-rs checks nothing about ids.',
    measured: 'the core re-added a removed id and caught an amnesiac ' +
      'replica up under it. The peer-identity scenario\'s registry refuses ' +
      'a retired id, and the refusal survives a restart of the mapping ' +
      'owner rebuilt from its durable rows alone.',
    attribution: 'host-obligation',
  },
  {
    heading: 'Snapshot and configuration atomicity',
    obligation: 'a snapshot must advance the durable applied index and the ' +
      'ConfState together. The binding exports no snapshot or compaction ' +
      'primitive, which is an integration gap, and this evaluation ' +
      'therefore does NOT claim the full RawNode lifecycle - the verdict ' +
      'input is named `readyLifecycleExposed` for what was driven.',
    measured: 'round 2 (snap.mjs) hand-built a MsgSnapshot to a learner: ' +
      'the host loop stored a snapshot at index 5 and left the durable ' +
      'applied index at "0"; only raft-rs\'s tolerance saved the restart. ' +
      'No snapshot produced by a real leader could be tested, because the ' +
      'binding cannot produce one.',
    attribution: 'wasm-binding',
  },
  {
    heading: 'Joint consensus',
    obligation: 'persist enough application progress that an applied ' +
      'ConfChange is never replayed. Re-applying an enter-joint or leave ' +
      'entry is REFUSED by the core, not idempotent.',
    measured: 'round 2 saw "config is already joint" (x5) and "can\'t leave ' +
      'a non-joint config" (x2) when the applied index was rewound at the ' +
      'joint boundaries. The narrowed re-application sentence covers only ' +
      'the idempotent SIMPLE change measured here. raft-rs carries a TODO ' +
      'at src/raft.rs:962 - "it may never auto_leave if leader steps down ' +
      'before enter joint is applied" - which is upstream behaviour ' +
      'requiring integration testing, not a reason to reject the core.',
    attribution: 'raft-rs',
  },
]);

// The order constraints the steps above impose, as a pair list the write log
// must satisfy within one cycle.
const ORDER_CONSTRAINTS = Object.freeze([
  {before: 'hardState', after: 'confStateAndApplied',
    why: 'the commit index is persisted with or before the committed ' +
      'entries are applied (src/lib.rs:304-310)'},
  {before: 'entries', after: 'advanceAppend',
    why: 'entries are durable before the append phase advances'},
  {before: 'hardState', after: 'advanceAppend',
    why: 'the hard state is durable before the append phase advances'},
  {before: 'confStateAndApplied', after: 'advanceApply',
    why: 'the returned ConfState is durable before the apply index moves ' +
      'past the configuration entry'},
]);

/**
 * Split a durable write log into cycles. A cycle ends at advanceApply.
 * @param {Array<Object>} writeLog
 * @return {Array<Array<string>>}
 */
function writeLogCycles(writeLog) {
  const cycles = [];
  let current = [];
  for (const write of writeLog) {
    current.push(write.write);
    if (write.write === 'advanceApply') {
      cycles.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    cycles.push(current);
  }
  return cycles;
}

/**
 * Check one adapter's durable write log against the derived contract.
 * @param {Array<Object>} writeLog
 * @return {{conforms: boolean, violations: Array<Object>, cycles: number}}
 */
function writeLogConformsToContract(writeLog) {
  const violations = [];
  const cycles = writeLogCycles(writeLog);
  cycles.forEach((cycle, index) => {
    for (const constraint of ORDER_CONSTRAINTS) {
      const beforeAt = cycle.lastIndexOf(constraint.before);
      if (beforeAt < 0) {
        continue;
      }
      const afterAt = cycle.indexOf(constraint.after, beforeAt);
      if (afterAt < 0) {
        // The cycle may legitimately end before the later step runs; only a
        // later step that happened BEFORE the earlier one is a violation.
        const earlier = cycle.indexOf(constraint.after);
        if (earlier >= 0 && earlier < beforeAt) {
          violations.push({cycle: index, ...constraint,
            problem: `${constraint.after} ran before ${constraint.before}`});
        }
        continue;
      }
    }
  });
  return {conforms: violations.length === 0, violations, cycles: cycles.length};
}

export {
  BACKEND_OBLIGATIONS,
  CORE_DOES_NOT_DO_THIS_FOR_YOU,
  ORDER_NOTE,
  HOST_MUST_GUARANTEE,
  HOST_STEPS,
  ORDER_CONSTRAINTS,
  RAFT_RS,
  RAFT_RS_GUARANTEES,
  writeLogConformsToContract,
};
