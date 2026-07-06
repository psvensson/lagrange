# Verify — in-repo prior art & machinery for the phantom-index / vote-recusal direction

Read-only audit. Question: does the repo already own machinery or learnings for
durable-before-ack, phantom/last-index honesty, vote recusal, pre-vote,
leadership transfer, or the self-referential ledger-persistence class — and does
the proposed "durability-unfit voter recuses from the §5.4 up-to-date veto"
direction (`research-lever-synthesis.md`) reinvent or contradict any of them?

Proposed direction under test (synthesis:41-61): the binding wedge is a raft
leader advertising a PHANTOM-HIGH, non-durable last index (sqlite adapter reads
through a wedged connection); root fix = make a durability-UNFIT voter RECUSE
from the §5.4 up-to-date veto (mute its veto), plus a directed reseat on
demotion.

---

## 1. CL-040 / CL-041 / CL-042 raft-safety fixes — **CONFIRMED-EXISTS; CL-042 is a near-neighbour and a constraint on the proposed direction**

Closure ledger: `solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-04{0,1,2}.md`;
repros `test/closure/CL-04x.repro.test.js` via `npm run repro -- CL-04x` (`package.json:151` → `scripts/run-closure-repro.js`).

- **CL-042 (`CL-042.md`) — directly on the LAST-INDEX / up-to-date-VETO path.**
  Title: "An empty log's last-log-term must be 0 … or an empty-log candidate wins
  leadership over voters holding committed entries." firstViolatedInvariant
  (CL-042:8): the adapters masqueraded an empty log's last-log-term as
  `node.term`, so an isolated node advertised a **fake HIGH last-log-term** and
  was granted votes / won over voters holding committed entries (Leader-
  Completeness violation → committed-log divergence). Fix (CL-042:32, loci
  CL-042:41): normalize an empty log's last-log-term to 0 in
  `getLastEntry`/`getLastInfo` of BOTH `src/raft/in-memory-log-adapter.js` and
  `src/raft/sqlite-log-adapter.js` — verified live at
  `sqlite-log-adapter.js:157-168` (the `!isOpen()` and no-row branches return
  `{index:0, term:0}`) and `in-memory-log-adapter.js:84-86`.
  **"A node advertising a log position it does not truly hold" is ALREADY a
  known, fixed class here** — but fixed by CORRECTING THE ADVERTISED VALUE at the
  adapter, NOT by muting the veto. The masquerade "bites both sides" (CL-042:30):
  a candidate over-advertises (safety) and a voter over-computes its own last-term
  (liveness) — so the fix had to be SYMMETRIC. This is the precedent the proposed
  fix should extend, and it argues the honest home is the `getLastInfo()` value,
  not the veto.

- **CL-041 (`CL-041.md`) — the vote-GRANT path (double-vote TOCTOU).** A follower
  must grant ≤1 vote/term (§5.2); fix serializes vote packets in
  `src/raft/liferaft.js patchIncomingDataListener`. Same handler the proposal
  would touch; direction is orthogonal (grant-once vs veto-honesty) but shows this
  path is raft-safety-critical and already hardened.

- **CL-040 (`CL-040.md`) — committed-entry agreement (§5.3 log matching).**
  `truncateConflictingSameIndexTail` in `src/raft/liferaft.js`; refuses to
  truncate a *committed* entry.

- **Conflict assessment:** all three fixes STRENGTHEN vote/up-to-date safety
  (deny more, truncate conflicting, correct the advertised term). The proposed
  recusal **WEAKENS** a veto (grant where §5.4 would deny). The synthesis itself
  flags this (synthesis:59-61: "muting a voter's §5.4 veto is raft-safety critical
  (cf. CL-040/041/042) … only sound if the unfit voter's advertised index is
  provably NON-authoritative"). So the direction is at RISK of contradicting the
  CL-04x posture unless the correctness lemma is discharged — and CL-042 shows a
  SAFER, precedent-matching alternative: make `getLastInfo()` advertise the
  DURABLE index (as CL-042 corrected the empty-log term), so the veto stays honest
  and no veto is ever muted.

## 2. Sibling quest `formation-ledger-leader-local-persistence-wedge` (SOLVED) — **CONFIRMED-EXISTS; it is DETECT + DEMOTE only, and it explicitly REFUTED the phantom-HIGH premise**

Report `solve/report/formation-ledger-leader-local-persistence-wedge.md`; code
`src/partition/partition-service-durability-fitness.js` (commit `9234e904` per
`research-existing-solutions-project-history.md:36`) + extraction
`src/raft/tracked-leader-demotion.js`.

- **What the fix does:** detect (dual signal — `db.inTransaction` beyond
  `PREPARED_HOLD_TIMEOUT_MS` 60s, and a declared-vs-durable commit-index
  divergence read via a **separate readonly connection**,
  `readDurableCommittedIndexWitness` :112-143) → surface loudly → `deferCandidacy`
  every tick while unfit (:308-309) → `performTrackedLeaderDemotion` when a
  successor is viable (:316-320). It touches NOTHING in the vote/last-index/up-to-
  date path. Report L48 boundary ruling: "THIS quest = detect + demote + surface
  loudly + stay-non-candidate-while-unfit."

- **The hook the proposal would extend already exists** — `isLeaderDurabilityUnfit`
  / `activeReason` state (:60-61, :211), `deferCandidacy()` (:309), and a
  ready-made honest durable watermark (`readDurableCommittedIndexWitness`). A
  vote-recusal or an honest-`getLastInfo` fix would plug into exactly this signal.

- **CRITICAL TENSION the caller must weigh — the sibling quest's design-vet
  REFUTED "the zombie advertises a higher index."** Report L48: *"'shorter log
  disfavors the zombie in votes' is FALSE while alive (in-memory log reads 155 ==
  followers)"* — i.e. the zombie's advertised index EQUALS the followers', which
  is precisely WHY `deferCandidacy` must be re-asserted (vote rules do NOT
  disfavor it). The durability-fitness code comment says the same
  (`partition-service-durability-fitness.js:303-307`: "The alive zombie's
  in-memory log matches the followers', so vote rules do NOT disfavor it"). The
  synthesis's "phantom-HIGH index that VETOES honest candidates" (synthesis:26,
  lever-c:56-62) is a *different and stronger* claim than what the SOLVED quest
  established (index EQUAL, so §5.4's strict `index > packet.last.index` would NOT
  veto an equal peer). The two are reconcilable only if the honest target is a
  freshly-voter-ready node whose DURABLE log is BEHIND the zombie's in-memory
  index — which is plausible for run-6's catching-up target `4e1551aa` but is NOT
  the run-23 configuration the shipped fix modelled, and **is not yet reproduced
  by any DT** (synthesis:64-73 makes building that DT step 1). **The phantom-HIGH
  veto is currently a HYPOTHESIS, not a confirmed mechanism.**

- **Fitness signal availability at VOTE time:** the fitness verdict rides the 1s
  sweep (`enforceLeaderDurabilityFitness`, :181) and is stored on
  `this.isLeaderDurabilityUnfit`. It is a strike-latched, ≥60s-hold signal — it is
  NOT computed at the instant a vote packet arrives, and by construction it fires
  only after a sustained hold. So a vote-recusal keyed on it would recuse only
  AFTER the 3-strike/~63s window — i.e. no earlier than the demotion it already
  triggers. This blunts the proposed benefit (the recusal would not act during the
  early part of the ~66s storm).

## 3. Durable-before-ack — **ABSENT (never implemented); the phantom-ack is a pre-existing gap, NOT a regression**

- No fsync / "don't advance matchIndex until persisted" invariant exists. Grep of
  `src/raft/*log-adapter*.js` for `fsync/synchronous/matchIndex` → none. The
  leader self-acks in `saveCommand` regardless of persistence
  (`in-memory-log-adapter.js:40`; `sqlite-log-adapter.js:274`,
  `commandAck` :329 with the comment at :332 "Self-acks are stamped at saveCommand,
  not here").
- The sibling report explicitly RECORDS this as a pre-existing, un-fixed class
  (report L48): *"leader phantom-ack quorum accounting — saveCommand self-acks
  regardless of persistence (adapter:284-287), majority ceil(others/2)+1 can rest
  on 2 durable + 1 phantom copy (pre-existing; step-down shrinks the window)."*
- Partial durability plumbing that DOES exist: `lastDeclaredCommitIndex` stamped
  before the isOpen guard (`sqlite-log-adapter.js:305,417-419`) and the readonly
  durable-watermark witness — but these are used only by the fitness DETECTOR, not
  to gate acks/commits.
- **Verdict:** the phantom index is a NEVER-IMPLEMENTED invariant, not a regressed
  one. A "restore durable-before-ack" framing would be NEW machinery on the
  commit/ack hot path — the same high-blast-radius surgery the sibling quest chose
  to AVOID in favour of detect+demote (report L47 "full decoupling = protocol
  surgery; STEP-DOWN DOES NOT REQUIRE IT").

## 4. Pre-Vote / CheckQuorum / leader-lease — **ABSENT in production; the prevote spike is DEAD/unwired**

- Grep `src/` for `prevote|pre-vote|preVote|checkQuorum|lease` (raft sense): the
  only hit is `src/raft/spike/raft-logic-spike-adapter.js:231` `preVote: true`.
  That adapter wraps the EXTERNAL `raft-logic` library's `ThreadedRaftNode` — a
  contained investigation spike — and **nothing in `src/` imports it** (grep for
  importers of `raft-logic-spike-adapter` outside `/spike/` → empty). The `lease`
  hits are readiness/owner leases, not raft leader leases.
- `research-lever-c-election-gap.md:73-79,120-129` reaches the same conclusion and
  argues pre-vote would quiet the 2→21 term climb but NOT lift the veto → does not
  fix the wedge. The synthesis already DROPS lever C for this reason
  (synthesis:36). **Consistent; nothing to reinvent; do not re-chase pre-vote.**

## 5. Leadership transfer / directed election — **CONFIRMED-EXISTS (rebalancer/drain use only); demotion path is a BLIND step-down**

- `requestElectionNow` (`liferaft-provider.js:276`, contract const
  `raft-provider-contract-constants.js:6`), `requestTrackedReplacementLeaderElection`
  / `requestTrackedPartitionLeaderHandoff`
  (`replica-handler-leader-handoff-methods.js:31,58`), `STEP_DOWN_REPLICA` directed
  handoff naming a specific `dispatchNodeId`/`replacementReplicaId`
  (`priority-publication-handoff.js:114-146,129,186`). Used by the rebalancer's
  surplus-drain / safe-remove path.
- **The durability-demotion path does NOT use it.** `performTrackedLeaderDemotion`
  (`tracked-leader-demotion.js:18-41`) sheds leadership into an empty `leader`
  field and re-arms the RANDOMIZED timer — no successor argument, no directed
  `STEP_DOWN_REPLICA` (documented in `research-lever-b-reseat-after-demotion.md:20-40`).
- So there is NO existing path that transfers leadership away from a node that
  detects its OWN storage unfitness — the storage-unfit node currently blind-steps-
  down. Proposed lever B (extend `requestElectionNow` to durability-demoted
  sources) is an EXTENSION of shipped machinery (synthesis:38), not new — and the
  synthesis correctly sequences it AFTER the root fix (a directed election still
  loses the veto until the advertised index is honest: lever-c:105-112).

## 6. Prior refutations / learnings in the research corpus — **PARTIAL; the phantom-index/vote framing is confined to lever-c + synthesis and is NOT yet DT-grounded**

- The "phantom" that dominates `research-SYNTHESIS.md`, `eval-path-{d,e,f,h}.md`,
  `research-existing-solutions-project-history.md`, `impl-e-cheap-report.md` is a
  DIFFERENT phantom — the fresh-leader **stale-view phantom COUNT move**
  (phantom ADD/REMOVE), the shipped Path-E lane. It is NOT the raft last-index
  phantom. Do not conflate: the committed Path-E fix does not touch the raft
  vote/index path.
- The raft phantom-index / veto / durable-before-ack / vote-muting discussion
  lives ONLY in `research-lever-c-election-gap.md` (:40-70,167-196) and
  `research-lever-synthesis.md`. Lever C's own verdict (lever-c:130-138,187-196):
  *"you cannot elect around a lying voter … correctness (§5.4 leader completeness,
  the very invariant CL-042/getLastInfo guards protect) REQUIRES vetoing candidates
  behind it. Fix the lie … or its vote muted while unfit."* — it frames the honest
  fix first as **making `getLastInfo()` advertise the durable index**, and only
  secondarily as vote-muting.
- **Flags for the new direction:**
  1. Do NOT re-chase pre-vote or election-timer tuning (lever C DROPPED; §4).
  2. Do NOT treat directed-reseat (lever B) as a root fix — it is downstream of
     the veto and correctly deprioritised.
  3. The phantom-HIGH-veto mechanism is UNPROVEN by any DT and is in tension with
     the SOLVED sibling quest's "index == followers" finding (§2). Building the DT
     (synthesis step 1) must come first and may falsify the phantom-HIGH premise.
  4. Lever A (off-partition operation store) was DEPRIORITISED as a
     secondary-source-of-truth the codebase forbids (synthesis:37) — do not revive
     it as the primary path.

---

## OVERALL

**Yes — the repo already contains a better, earlier, precedent-matching home for
this fix, and the proposed veto-MUTING form is at risk of contradicting the
CL-04x raft-safety posture.**

1. **Better home = correct the advertised value, not the veto.** CL-042 already
   established the exact class ("a node must not advertise a log position it does
   not truly hold") and fixed it by normalizing `getLastInfo()`/`getLastEntry()`
   at BOTH adapters — SYMMETRICALLY, correcting the value both a candidate
   advertises and a voter computes. The durability-fitness quest already computes
   the honest durable watermark (`readDurableCommittedIndexWitness`,
   `partition-service-durability-fitness.js:112-143`). The consistent extension is
   to make an unfit leader's `sqlite-log-adapter.getLastInfo()` advertise the
   DURABLE index (so §5.4 stays honest and no veto is muted) — a CL-042-shaped
   value correction, not the "mute the §5.4 veto" the synthesis proposes.

2. **The proposed veto-recusal WEAKENS a §5.4 veto**, the opposite direction from
   all three CL-04x fixes (which strengthen vote/up-to-date safety). The synthesis
   acknowledges this is "raft-safety critical" and sound only under an unproven
   correctness lemma (durability-unfit ⟹ advertised-index-not-committed). That
   lemma is exactly what CL-042's value-correction sidesteps.

3. **Two premises are not yet established and are in tension with SOLVED work:**
   the phantom-HIGH-veto is un-reproduced and contradicts the sibling quest's
   "in-memory index == followers" finding; and the fitness signal is a ≥60s
   strike-latched verdict, not a per-vote signal, so a recusal keyed on it cannot
   act earlier than the demotion already does.

4. **Durable-before-ack is ABSENT, never implemented** — the phantom-ack is a
   recorded pre-existing gap, so "restore an invariant" is the wrong framing; that
   path is the protocol surgery the sibling quest deliberately avoided.

**Net recommendation to the caller:** before committing to vote-recusal, (a) build
the DT that either confirms or falsifies the phantom-HIGH-veto (synthesis already
sequences this first), and (b) prefer the CL-042-consistent form — an unfit
adapter advertising its DURABLE index via the already-computed watermark — over
muting the veto, which fights the CL-040/041/042 safety posture. Levers B (directed
reseat, EXTENDS shipped `STEP_DOWN_REPLICA`) and the pre-vote drop are already
correctly classified; no reinvention there.
