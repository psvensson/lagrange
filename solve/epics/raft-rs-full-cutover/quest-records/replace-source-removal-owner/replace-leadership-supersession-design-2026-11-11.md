# Design note: a REPLACE keeps leadership where it is unless its source leads

Status: proposal that supersedes one sealed owner decision (BR11 of
`solve/epics/raft-rs-full-cutover/quest-records/replace-source-removal-owner/coverage-model-amendment-1.md`).
For the owner before landing. Written 2026-11-11 against the working tree of
`work/canonical-authority-epic-20261110` (HEAD 103f132c1 plus uncommitted work
of other writers; none of the files changed here were dirty before this work).

Conclusion in one paragraph: the proposal is **safe**. It removes nothing the
sealed model relied on for safety: the completion rule (P1), the removal
intent, the retire route through the corroborated leader, the single
transferee (BR9), the attempt record and its resolution (BR10), and the T-9
block all stand. It changes one thing: a fresh, majority-corroborated leader
that is neither the source nor the target now permits the removal, where
BR11 demanded that the target itself lead. That exact path (follower source
removed by a third leader, target a follower throughout) is already the
proven behaviour of every ordinary partition
(`test/rebalancer/replace-real-group-retire-route.test.js`, evidence round 3
S15). The handoff requirement on priority partitions was an availability
measure, never a consensus-safety one.

---

## Claim, Scope, And Current Evidence

**Invariant (the interaction, R02).** The planner and the REPLACE owner must
agree about leadership movement. The planner chooses a non-leader source so
that leadership need not move
(`src/rebalancer/move-planner-move-calculation-methods.js:360-426, 769-777`).
The REPLACE owner must then not move it.

**Failing witness.** Nine lab runs of a fresh 3-node formation (seed hosts all
three replicas of each system partition; six priority partitions spread to
1-1-1). Runs that spread by ADD then REMOVE move no leader and finish the
priority phase in 70 s. Runs that spread by REPLACE transfer leadership of
each partition to the REPLACE target on the joiner even when the removed
replica is a follower; the control plane then saturates on the joiner-seed
link, and the priority phase takes 172-286 s (formation bound missed).
Reported by the caller from the runs; this note did not re-read the run
bundles.

**Where the disagreement is in the code (observed in source).**
- `decideNamedHandoff`,
  `src/rebalancer/operation-workflow-replace-handoff-attempt.js:209-238`:
  LEADERSHIP_SAFE only for `leader === targetReplicaId`; any other known
  leader, the source or a third replica, yields ISSUE.
- `evaluatePriorityPublicationLeaderRemoveSafety`,
  `src/rebalancer/priority-publication-handoff.js:107-112, 160`: every
  partition REPLACE on a handoff-required partition goes to that decision.
  The row-based "follower source safe" result of
  `priority-publication-leader-safety.js:156-177, 273-293` is not consulted.
- `transferRequestOf`,
  `src/node/replica-handler-leader-handoff-methods.js:85-99`: the target, when
  a follower, forwards a named transfer to whoever leads.

**Affected interaction.** planner (source choice) x REPLACE owner (leadership
decision before source removal). Entry path: `executeOperation` at ACTIVE ->
`evaluateRemoveSafety` -> `evaluatePriorityPublicationLeaderRemoveSafety` ->
`evaluateReplaceNamedHandoffSafety` -> `decideReplaceNamedHandoff`.

**Repair claim (independently complete).** On a handoff-required partition, a
REPLACE whose source does not lead removes its source without issuing any
leadership transfer, and completes; a REPLACE whose source leads behaves
exactly as today. This is a bounded repair. It is not the claim that a fresh
formation meets its bound (the originating service scenario), and not release
acceptance. The formation bound needs a lab run after landing.

**Observed / derived / hypothesis.**
- Observed (tests, section "Evidence"): the new decision on a real rs-raft
  group and on the double.
- Derived from source and the sealed record: the safety argument below.
- Hypothesis: that removing the forced transfer returns degraded runs to the
  clean-run timing. Next discriminating check: one lab formation batch with
  the two new log lines (section "Diagnostics").

**Capability comparison.** The proposal narrows nothing: every state that
issued a handoff to make progress still can (source leads). It removes an
action in one state. The alternative "complete the existing mechanism"
(always hand off, then fix the link saturation) keeps the planner/owner
disagreement and was not pursued.

---

## The superseding rule

> A REPLACE removes its source without moving leadership when a fresh,
> term-fenced, majority-corroborated read shows a current leader that is
> neither the source nor absent. The single named-target handoff (always the
> REPLACE's own target) is issued only when the source replica itself leads.
> An attempt that was already issued and is not resolved blocks both a new
> issuance and the removal, exactly as today, unless the target is read
> leading.

Decision table (one path, `decideNamedHandoff`; first match wins):

| # | Condition (fresh reads) | State | Action |
|---|---|---|---|
| 1 | target's own port cannot be read | WAIT_WITNESS_UNAVAILABLE | wait (unchanged) |
| 2 | witness: `lead === t` | LEADERSHIP_SAFE | removal may proceed (unchanged, BR11's own case) |
| 3 | current attempt answered NOT_FOUND | TARGET_NOT_FOUND | fail before intent (unchanged) |
| 4 | an attempt is unresolved (issued this session, or rebuilt after restart) | WAIT_ATTEMPT_UNRESOLVED | wait (unchanged) |
| 5 | witness names no leader | WAIT_NO_LEADER | wait (unchanged) |
| 6 | witness: `lead === s` | ISSUE | one named handoff to t (unchanged) |
| 7 | witness: `lead === L`, L not in {s, t}; current-leader authority confirms (below) | **LEADER_RETAINED** (new) | removal may proceed, **no handoff** |
| 8 | witness: `lead === L`, L not in {s, t}; authority does not confirm | **WAIT_LEADER_NOT_CORROBORATED** (new) | wait; re-evaluated on the next wake or the existing 1 s fallback |

Rows 1-6 are today's code, in today's order. Today row 7/8's condition falls
into ISSUE. Row 7's authority may also answer that the current leader is t
(then row 2's state) or s (then row 6's state): the stronger read wins.

### What counts as "fresh leader, not the source" (row 7)

All of the following, read in the same owner turn, after the last await
before the decision:

1. **The target's own port** (READ_REPLICA_MEMBERSHIP to t, the existing
   witness read, `operation-workflow-replace-witness.js:198-216`) names a
   leader L, with L != s and L != t, at term T_t, and reports its
   participation gate open (`gateOpen === true`: t has applied its own
   admission, the same fact "t leads" used to imply).
2. **The current-leader authority** - the existing
   `readReplaceCompletionAuthority`
   (`operation-workflow-replace-surviving-membership.js:291-295`), unchanged:
   - L's **own** answer (its replica leads in its own observation), reached
     with at most one redirect;
   - L's configuration is the one at its commit index (`appliedIndex ===
     commitIndex`);
   - a **majority** of L's voters - of each half when joint - confirm, each
     by its own read, term == T_L and name L or no leader (S14's rule;
     no commit-index clause, S15's rule).
3. **Agreement between the two:** `T_t === T_L`, the leader L names itself as
   the one t named, and t is a voter in L's committed configuration.

This is the same corroboration S14/S15 require of the completion authority,
plus the target-side clauses of item 1 and 3. It is a stronger read than
BR11's own (t's uncorroborated claim that it leads; a deposed t keeps saying
so with check_quorum off - evidence round 3, R3.4).

Anything less is row 8 (a typed wait), never a permission.

What is deliberately **not** evidence: the partition row's `leader_node_id`,
services-row `raft_role`, the row-based follower-source branch of
`priority-publication-leader-safety.js`, or t's own view alone (R10, BR3).

---

## Safety argument against every case the sealed model considered

Notation: s source, t target, L a third voter, O the owner node (t's node on
priority partitions).

**0. Consensus safety is not touched.** A REPLACE's completion still needs
the corroborated leader's answer that s is out of voters and outgoing voters
at a commit index >= C0 (`decideReplaceCompletion`,
`operation-workflow-replace-owner.js:182-213`); the intent is still durable
before the effect; RETIRE still goes only to the corroborated leader
(`replaceRetirementRouteOf`); conf changes are still leader-only at the port.
None of that code changes. P1 (completion implication), P1' and D2 are
unaffected by which replica leads: the sealed record says so itself
("completion never depends on who leads", amendment-1 A17).

**1. Removing a non-leader voter by the current leader (raft-rs).** The
leader L appends RemoveNode(s); it commits under the configuration in force
(s included; s keeps participating until its own applied configuration drops
it, F2); on apply every member drops s; quorum is then a majority of the
remaining voters. No election is caused: the leader is not the removed
member. This is the path every ordinary-partition REPLACE takes today and is
witnessed live: `replace-real-group-retire-route.test.js` (follower target,
every RETIRE to the corroborated leader that is not t) and scheduling S15.
Removing the *leader* itself is also already supported on ordinary partitions
(V10) but costs an election; that is exactly the case row 6 still hands off.

**2. BR9 - retarget impossibility: at most one transferee per operation.**
Holds, and more strongly. The only request this owner ever issues is still
the named handoff to t (`priority-publication-handoff.js:199-212`, unchanged);
LEADER_RETAINED issues nothing. So the set of transferees named over an
operation's life is {} or {t}. A same-transferee repeat is ignored by raft-rs
without reset (`raft.rs:1889-1898`, cited in the sealed record); forwarded
requests stay term-fenced by raft-rs. The most-caught-up leg and H-B' stay
deleted. Mutation family M6 (retarget) keeps its red cells.

**3. BR9, late effect.** The sealed record notes that a late *effect* of
attempt A "is the same transfer". Under the new rule a late effect can occur
only for a handoff issued while s led: the request reaches t late, t forwards
to whoever leads now (say L), and L begins transferring to t. Consequences:
(a) the transferee is still t; (b) if the owner has meanwhile read
LEADER_RETAINED and sent the effect, a RETIRE proposed at L inside L's
transfer window is dropped typed (T-9 / F1 D4) and R-1f re-issues it when
the witnessed (leader, term, state) level moves or the window passes
(`shouldIssueRetirementAttempt`, `operation-workflow-replace-owner.js:310-325`);
(c) leadership ends on t, which is today's normal outcome. Nothing completes
early; nothing is retargeted. Cost: one leadership move that today always
happens.

**4. BR10 - the lost attempt after an owner restart.** Unchanged code: the
first decision of a new owner session rebuilds an ACCEPTED pseudo-attempt
answered "now" (`rebuildLostHandoffAttempt`, handoff-attempt.js:180-192). The
sealed resolution: it "resolves at once on a fresh `lead === t`, and
otherwise blocks new issuance only", bounded by W_max since the answer.
Under the new rule:
- `lead === t`: row 2, at once (unchanged).
- `lead === s`: row 4 until W_max, then row 6 issues to t (unchanged).
- `lead === L`: row 4 until W_max, **then** rows 7/8. The pseudo-attempt
  also blocks LEADER_RETAINED. This is the conservative reading and is
  required by T-9: the previous session may have issued a handoff (while s
  led) whose forwarded transfer is running at the present leader; a removal
  proposed inside that window would be dropped. Cost: after an owner restart
  only, at most W_max before a follower source is removed. No new timer: the
  window is the one the witness already reports (`transferWindowMaxMs`).
  The stale sentence in the module ("a fresh read of a non-source leader
  resolves it at once") is corrected to say this.

**5. BR11 - accepted-but-unwon evidence.** BR11 exists to stop a *COMPLETED
election answer* (CL-043) from authorizing removal. That stays deleted: no
STEP_DOWN answer, row, or elapsed window authorizes anything. Row 7 is
authorized by fresh reads of raft state only, with no attempt outstanding
(row 4 precedes it). What is superseded is BR11's second sentence ("a fresh
`lead === t` does") being the *only* authorizing read.

Why did BR11 name t and not "not the source"? From the record: (a) on O the
fact "t leads" is a local core fact (BR3), while "L leads" is t's follower
view, which can be stale; (b) the implementer first shipped "any non-source
leader" from t's own view, unprobed
(`implementer-report-steps-0-3-d2.md:92`), and verification tightened it to
the amended text. Reason (a) is real and is answered by clause 2 above: the
third leader is accepted only on the leader-answered, majority-corroborated
read that fix-f7 later built for completion - an authority that did not exist
when BR11 was sealed (2026-09-25; corroboration landed 2026-09-28).

**6. T-9 - removal proposed while a transfer is unresolved.** Preserved by
ordering: row 4 precedes rows 6-8. The section 3.2 revalidation's "no
unresolved attempt" clause is this same decision re-run at every send (F3:
every post-intent send re-runs remove safety). The residual foreign window
(case 3) is R-1f's, as sealed ("the peers' REMOVE_PEER dropped by a foreign
window is re-driven by R-1f").

**7. A stale or partitioned third leader.**
- t's view is stale (t names L, but s or someone else has since won): L's
  own answer is not a leader answer (NOT_LEADER) or a majority does not
  confirm L's term (NOT_CORROBORATED), or the terms disagree (clause 3):
  row 8, wait. No removal, no handoff.
- L is a deposed leader that still answers as leader (check_quorum off): a
  majority at L's term cannot be assembled once a higher-term leader exists
  (election safety; the argument in surviving-membership.js:36-45): row 8.
- L is partitioned from the majority but not yet deposed: no majority
  confirms: row 8.
In each case the wait is typed and re-evaluated by existing wakes (consensus
relay on O, readiness publication, the 1 s deferred-safety fallback, the K1
sweep). When the views converge the decision lands in row 2, 6 or 7.

**8. Leader change between the read and the RETIRE proposal - what fences
it.** Four fences, all existing:
1. The handoff decision is re-run at every send of the effect, including
   every post-intent re-send (F3), so a source that regained leadership
   before a re-send gets row 6.
2. The intent's C0 and the completion rule: completion needs the corroborated
   leader of *that later moment* to answer s absent at commit >= C0.
3. RETIRE is routed to the corroborated leader of the moment of each R-1f
   attempt, and the port refuses a conf change typed NOT_LEADER on a
   non-leader; a conf change appended by a leader that is then deposed
   either commits (then s is gone, the goal) or is lost and re-driven.
4. raft-rs itself: an entry of a deposed term cannot commit without the new
   leader's log containing it.
The one consequence that fences do not prevent: s wins an election *after*
the decision and *before* its removal commits. Then the leader removes
itself - the row-driven owner proposes the leader source's own RemoveNode,
it leaves on its applied removal (F2, V10) - and the partition elects again.
This is safe, costs one election, and exists identically under BR11 (t leads
at the read, s wins before the commit; S14 records the same double move).

**9. Target readiness.** Under BR11 "t leads" implied t is an admitted,
caught-up voter. Under row 7: t's gate is open, t is a voter in L's committed
configuration, t follows L at L's term (clause 1, 3). t's log may lag; the
post-removal quorum is a majority of {voters minus s} and does not require t
when two other voters remain. Whether enough voter-ready replicas remain is
the remove-safety floor's decision (unchanged, authoritative readiness), not
the leadership gate's. RF=1 (B13): the sole voter is s, so s leads or t
does; row 7 is unreachable; B13 is unchanged.

**10. P2 (scheduling equivalence).** New input pairs: (leader change x row
7) and (authority currentness x row 7). Decide-first on stale input answers
WAIT (row 8) or the same state as process-first; it never permits a removal
process-first would refuse, because row 7 requires the same reads
process-first would make. **P3 (recovery):** the pseudo-attempt rule above
makes "destroy, recreate, continue" converge to the same committed
configuration; it differs only in latency (<= W_max).

**11. S14 / S15, T5 and the model's other cells.** S14 (authority
currentness x R-1a) and S15 (corroboration has no commit clause) concern the
completion authority, which is unchanged and now also guards row 7. T5 (the
effect) keeps all its revalidations. AN4 (late answer), AN8 (no handoff after
terminal), BR12 (deferred snapshot issues nothing) are untouched code.

**Not established by this note.** The authority's read is not linearizable
(a read-index at the port is the sealed record's own R5 follow-up); the
argument, like the sealed one, is "current at read time". No native or
physical run was made here.

---

## Contract And Failure Analysis

### 1. Consumed surfaces (all existing)

| Surface | Where | Use |
|---|---|---|
| `readReplaceWitnessMembership(owner, operation)` | `operation-workflow-replace-witness.js:198` | t's own leader, term, gate, window |
| `readReplaceCompletionAuthority(owner, operation)` | `operation-workflow-replace-surviving-membership.js:291` | corroborated current leader (row 7) |
| `REPLACE_HANDOFF_DECISION`, `decideReplaceNamedHandoff` | `operation-workflow-replace-handoff-attempt.js` | the one decision; two states added |
| `evaluateReplaceNamedHandoffSafety` | `priority-publication-handoff.js:172` | maps the decision to SAFE / DEFER / FAIL / handoff request |
| STEP_DOWN_REPLICA with REPLACE_TARGET_LEADER_ELECTION | `replica-handler-leader-handoff-methods.js:85` | unchanged; issued only in row 6 |

Proposed additions: two members of `REPLACE_HANDOFF_DECISION`
(`LEADER_RETAINED`, `WAIT_LEADER_NOT_CORROBORATED`). No new message, table,
configuration key, timer or port answer field.

### 2. Typed failure edges

| Edge | Outcome | Caller behaviour | Obligation owner |
|---|---|---|---|
| target unreadable | WAIT_WITNESS_UNAVAILABLE | deferred remove-safety evaluation | REPLACE owner (ACTIVE, no time bound, S9) |
| no leader known | WAIT_NO_LEADER | same | same |
| third leader not confirmed (leader unreachable, not leader, applied behind commit, no majority, term disagreement, t not a voter, t below gate) | WAIT_LEADER_NOT_CORROBORATED | same | same |
| attempt unresolved | WAIT_ATTEMPT_UNRESOLVED | same | same |
| target NOT_FOUND | TARGET_NOT_FOUND | FAIL before intent | planner (B3) |
| authority read throws | propagates as today's witness read does (the delivery layer answers typed; the read itself does not throw) | - | - |

Absent / empty / already satisfied: s already absent from the committed
voters is R-1e's (completion at entry), before this decision is reached.

### 3. Cached views

| View | Authority | Stale read | Recovery |
|---|---|---|---|
| in-memory attempt record | none durable; rebuilt as a pseudo-attempt (BR10) | blocks, never permits | W_max or `lead === t` |
| `decisionByOperationId` (S9 label) | the last decision | diagnostic only | overwritten each decision |
| cached critical replica rows | **route only** to a named replica's node | wrong route -> LEADER_UNREACHABLE -> row 8 | next wake |
| planner `isLeader` / `replicaId` | the planning rebalancer's own live leadership (set by its partition service) | see "Planner" below | next planning pass |

No stale view can permit a removal: every permitting row needs a fresh port
read. No stale view can veto forever: each wait is re-evaluated by existing
wakes and fallbacks.

### 4. Identity and representation

- Operation: `operationId`; attempt `{operationId, attemptSeq}` (unchanged).
- Term: T_t from t's port, T_L from L's port; must be equal; every
  confirming voter's term must equal T_L.
- Configuration: L's committed configuration at `appliedIndex ===
  commitIndex`.
- When an anchor moves mid-operation (term, leader, membership): the next
  decision reads again; a moved anchor between read and effect is case 8.

---

## The 8-item transition record

Transition: ACTIVE REPLACE -> removal may proceed with leadership retained.

1. **Producer and consumer symbols.** Producer:
   `decideReplaceNamedHandoff` (handoff-attempt module) returning a frozen
   `{state}` from `REPLACE_HANDOFF_DECISION`. Consumer:
   `PriorityPublicationHandoff.evaluateReplaceNamedHandoffSafety`, which
   answers the remove-safety evaluator (`buildSafeRemoveSafetyEvaluation`,
   `buildDeferredRemoveSafetyEvaluationForOperation`,
   `buildFailedRemoveSafetyEvaluation`). Inputs:
   `readReplaceWitnessMembership`, `readReplaceCompletionAuthority`.
2. **Owner-defined shape.** `REPLACE_HANDOFF_DECISION` members (strings);
   the witness and authority observations are the canonical
   `canonicalReplaceMembershipObservation` shape (state, replicaId, term,
   commitIndex, appliedIndex, gateOpen, leaderReplicaId, voterReplicaIds,
   votersOutgoingReplicaIds, transferWindowMaxMs). No new shape.
3. **Identity and generation.** operationId; source, target and leader
   replica ids; terms T_t, T_L; L's commit/applied index; attemptSeq.
4. **Ordering.** witness read -> (row 7/8 only) authority read -> decision ->
   remaining remove-safety checks -> intent CAS (STOPPING, C0) -> effect.
   The decision is recomputed after the authority read returns, so it is
   taken on the attempt state as it is after the last await.
5. **Absent versus unavailable.** No leader = WAIT_NO_LEADER; witness
   unreadable = WAIT_WITNESS_UNAVAILABLE; third leader unconfirmed =
   WAIT_LEADER_NOT_CORROBORATED. No default, no row fallback.
6. **Durable commit.** None at this transition (a decision). The durable
   points are unchanged: the STOPPING intent CAS before the effect, and the
   committed RemoveNode observed through the completion authority.
7. **Retained obligations.** An unresolved or rebuilt attempt keeps blocking
   (row 4). The REPLACE keeps the partition's serial slot and, on the ledger
   partition, the self-move interlock until terminal (unchanged).
8. **Canonical wake and cleanup.** Waits re-enter through the existing
   deferred-safety retry, the consensus relay on O, readiness publications
   and the K1 sweep. Attempt and decision state are released at terminal and
   at shutdown (`clearReplaceHandoffAttempt`,
   `clearAllReplaceHandoffAttempts`), unchanged.

---

## What regresses if this is wrong

- If row 7 fired on stale evidence that hid a leading source: the leader is
  removed without a handoff -> one election on a priority partition (an
  availability dip of one election timeout), no data or membership error.
  This is the pre-BR11 ordinary-partition behaviour.
- If the corroboration were too strict (never satisfiable): REPLACEs with a
  follower source would wait at ACTIVE indefinitely (S9: no time bound),
  holding the partition's serial slot -> formation stalls visibly with
  `WAIT_LEADER_NOT_CORROBORATED`. Detectable in one run; the previous
  behaviour is one revert away.
- Cost that is certain: one corroborated authority read (1 + 1 + voters-1
  small messages) per evaluation in row 7/8, on the same seam the STOPPING
  owner already uses each entry.
- Tests that pinned "a third leader gets the handoff" change (listed below).

---

## Planner determinism (deliverable 3)

**What the planner decides from.** `isLeaderRemovalCandidate`
(calc-methods:372-406) flags a replica as leader when (1) it is the planning
rebalancer's own replica and the rebalancer holds leadership
(`resolveRemovalSourcePartitionLeaderReplicaId`,
`move-planner-placement-tail-methods.js:114-129`); else (2) its services row
reads `raft_role = leader`; else (3) not, when the row has an explicit
non-leader role; else (4) when it sits on the partition row's
`leader_node_id`. (2)-(4) are cached rows.

**Why the sort did not guarantee a non-leader source.** Two gaps, from
source; which one produced the observed run is **not established** (the run
bundle was not available to this work; the new plan log line discriminates
them):

- *Gap A (in scope, fixed).* Even when (1) identifies the leader exactly,
  (2) and (4) still flag other replicas. On a seed that hosts all three
  replicas, any co-located replica whose row has no recognized role is
  flagged by (4), and a stale `leader` role by (2). When every candidate is
  flagged, the stable sort changes nothing and the first row - r1 - is taken.
  Fix: when the planner holds its own live leadership, that identity is the
  only leader evidence; cached rows are not consulted.
- *Gap B (out of scope, reported).* `rebalance()` checks `isLeader` once
  (`unified-rebalancer-rebalance-loop.js:220`) and then awaits three times
  (`:241, :265, :276`) before the synchronous `calculateMoves` (`:277`).
  Leadership lost in that window clears (1); durable rows collapse leader to
  follower (`partition-service-metadata-mutation-helpers.js:54`), so (2)-(4)
  flag nobody; the sort is a no-op and r1 is taken - and r1 may be the new
  leader. The correct repair is a leadership re-check in the loop after its
  last await (typed NOT_LEADER result), which is that file's owner's change.
  A guard inside `calculateMoves` was considered and rejected: 27 test files
  plan without leadership, and an empty plan from a deposed planner would be
  an untyped outcome (R11).

With the owner-side rule above, a leader source that slips through Gap B
costs exactly what it costs today (one named handoff), not more.

---

## Related sub-finding: REPLACE ownership by the target node

`resolveOperationOwnerNodeId`
(`src/rebalancer/replica-operation-repository-row-methods.js:247-281`) makes
the target node the owner of every unsettled system/priority REPLACE, so in a
formation the joiner drives its own replacement.

Assessment: **benign once leadership stays on the seed; no change proposed
now.**
- It is not a circular recovery prerequisite in the contract's sense: the
  REPLACE exists to place a replica on the joiner; if the joiner is dead the
  REPLACE is moot and R-1c / D2 fail it on the failure detector's verdict.
- What made it harmful was the combination with BR11: the owner sat on the
  joiner *and* pulled the partition's leadership - hence that partition's
  planner and all its writes - onto the joiner, behind the one link under
  pressure. With the rule above the joiner-side owner performs a bounded
  number of small reads and CAS writes per operation toward the seed; the
  partition's leader traffic stays on the seed.
- Residual, recorded: a live but slow joiner stalls its own REPLACE with no
  time bound (S9) while holding the partition's serial slot and, for
  `replica_operations-p1`, the ledger self-move interlock. If a lab run after
  this change still shows joiner-driven stalls, the candidate change is
  pre-intent ownership by the planning leader's node; that reopens sealed H3
  (ownership "so the replacement host can survive transient source loss")
  and needs its own quest.

---

## Diagnostics (deliverable 5)

Two info lines, low volume, through the rebalancer logger and
`REBALANCER_LOG_MSG`:
1. one per priority/ledger spread-cure plan decision: the cure-condition
   evidence fields and the chosen source's `sourceIsLeader`;
2. one when the operation-ledger quorum-spread hold is evaluated and does
   not engage - first evaluation and on change only - with the ready node ids
   and the ledger voter rows.

---

## Evidence And Closure

- **Safety** (deterministic, real rs-raft group,
  `test/rebalancer/replace-real-group-harness.js`): follower source, third
  leader, target follower -> zero STEP_DOWN, leader and term unchanged at the
  source's removal, REMOVED with the oracle absent at the write.
- **Negative:** source leads -> exactly one named handoff to t (existing
  cells, unchanged).
- **Recovery progress:** restart with a rebuilt pseudo-attempt and a third
  leader -> waits the window, then LEADER_RETAINED, no handoff.
- **Typed waits:** witness unavailable, no leader, uncorroborated third
  leader.
- **Planner property** over leader x row order x joiner-ready interleaving.
- **Resource bounds:** no new timer, map or subscription; two enum members.
- Not provided here: a native or lab run; the formation bound. The existing
  proof owner for those is the lab formation lane.

Mutation checks a verifier should expect red: (M-a) row 7 without the
authority read -> the stale-view cell; (M-b) row 7 placed before row 4 -> the
unresolved-attempt and restart cells; (M-c) row 6 widened back to "any other
leader" -> the real-group follower-source cell and the planner property.

---

## R09 supersession text (proposed; to be appended by the record's owner)

Do not edit the sealed files. Proposed new file
`solve/epics/raft-rs-full-cutover/quest-records/replace-source-removal-owner/br11-leadership-retained-supersession-2026-11-11.md`:

> **Supersession of BR11 (coverage-model-amendment-1, section 1, row BR11;
> section 0 table row BR9, first sentence) - leadership is retained when the
> source does not lead.**
>
> Superseded text: "REPLACE handoffs become named-target-only (always t)" as
> read with BR11's "A fresh `lead === t` does [authorize removal]" to mean
> that every REPLACE on a handoff-required partition moves leadership to its
> target before its source is removed.
>
> Superseding rule: a REPLACE's source may be removed when either (a) a
> fresh read of the target shows the target leading (BR11, unchanged), or
> (b) no handoff attempt of the operation is unresolved and the group's
> current leader - the leader's own answer, applied at its commit index,
> confirmed by a majority of its voters at its term (the completion
> authority of the owner ruling on FINDING F1 and fix-f7), and agreeing with
> the target's own read at the same term, with the target a voter past its
> participation gate - is neither the source nor the target. In case (b) no
> handoff is issued. The named-target handoff is issued only when the source
> itself leads.
>
> Unchanged and still binding: handoffs are named-target-only (BR9: at most
> one transferee, t, per operation); COMPLETED election evidence authorizes
> nothing (BR11, first sentence); an unresolved attempt, including the
> pseudo-attempt rebuilt after a restart (BR10), blocks issuance and - unless
> the target leads - the removal (T-9); the row-based ownership wait stays
> superseded (BR3); completion is decided only against committed membership
> (P1).
>
> Why: the planner chooses non-leader sources so that leadership need not
> move; the always-handoff reading moved it anyway. In fresh 3-node
> formations this concentrated control-plane leadership on the joining node
> and missed the formation bound (9 lab runs, 2026-11: 70 s without
> leadership movement, 172-286 s with). The authority that makes (b) sound -
> a majority-corroborated current-leader read - did not exist when BR11 was
> sealed.
>
> Tests superseded with this record: the BR11 cell of
> `test/rebalancer/replace-named-handoff-attempt.test.js` ("a third replica
> leading gets the named-target handoff") and the follower-source cells of
> the `replace-real-group-*` family that expected the target to lead; each
> is listed with its reason in the change's report.

---

## Appendix A: what was implemented (working tree, uncommitted)

| Change | Where |
|---|---|
| Two decision states `LEADER_RETAINED`, `WAIT_LEADER_NOT_CORROBORATED` | `src/rebalancer/operation-workflow-replace-handoff-attempt.js:62, 69` |
| The decision (rows 1-8); the authority is read only on the third-leader branch and the decision is then retaken whole | same file `:222-234` (`decideReplaceNamedHandoff`), `:284-318` (`decideNamedHandoff`), `:265-282` (`decideThirdLeader`), `:243-261` (evidence clauses) |
| BR10 comment corrected (rebuilt attempt also blocks a retained-leader removal) | same file `:185-195` |
| The gate consumes both removal-permitting states and supplies the authority read | `src/rebalancer/priority-publication-handoff.js:27-30, 185-193` |
| Planner: own live leadership is the only leader evidence when held | `src/rebalancer/move-planner-placement-tail-methods.js:144-176` (`buildRemovalSourceLeaderClassifier`); consumed at `move-planner-move-calculation-methods.js:367` |
| Plan decision log (on change; priority partitions only; no added cache read) | `move-planner-placement-tail-methods.js:189-210` (`logPrioritySpreadPlanDecision`); evidence handed out at `move-planner-priority-spread-cure.js:311`; wired at `move-planner-move-calculation-methods.js:784-786` |
| Hold-not-engaged log (first and on change) | `src/rebalancer/operation-ledger-quorum-concentration.js:289-312`; called at `rebalance-coordinator-ledger-interlock-admission.js:467-475` |
| Message constants | `src/rebalancer/rebalancer-constants.js:151, 315` |

Not changed: `priority-publication-leader-safety.js` (its row-based
follower-source branch stays unconsulted for a REPLACE - rows are not the
authority), `replica-handler-leader-handoff-methods.js`,
`replica-placement-cure-policy.js`, the completion authority, the witness
seam, the STOPPING owner.

## Appendix B: tests

New or extended (each red under the named mutation; mutations were applied to
the working files, run, and restored byte-identical):

| Test | File | Red under |
|---|---|---|
| leadership retained on a real rs-raft group: follower source, third leader, zero STEP_DOWN, same leader and term at intent, at every RETIRE and after completion | `test/rebalancer/replace-real-group-handoff.test.js` | pre-change rule (third leader -> ISSUE) |
| leadership retained on the double | `test/rebalancer/replace-named-handoff-attempt.test.js` | pre-change rule |
| five "third leader not corroborated" cells (stale target view; no term majority; applied behind commit; target not a voter; target below gate), each with a confirmed control | same | "witness view suffices"; the last two also under "target clauses dropped" |
| T-9: an unresolved attempt blocks the retained removal; only t is ever named | same | "third-leader decision before the attempt check" |
| BR10: rebuilt attempt blocks the retained removal for the window, then proceeds with no handoff; and the unchanged target-leads / source-leads resolutions | same | same mutation (first); pre-change rule |
| existing waits unchanged (unreadable witness, no leader) | same | - (pins unchanged behaviour) |
| planner x owner property over partition x leader x row order x role-evidence shape x joiner-ready interleaving (1620 planning passes, 450 REPLACEs) | `test/rebalancer/spread-cure-source-leadership.property.test.js` | planner: "live leadership not exclusive"; owner: pre-change rule |
| the two diagnostic lines | `test/rebalancer/spread-decision-diagnostic-logs.test.js` | - (new behaviour) |

Changed deliberately:

| Test | Change | Why |
|---|---|---|
| `replace-named-handoff-attempt.test.js` "BR11: only a fresh read of the target leading authorizes removal; a third replica leading gets the named-target handoff" | removed; replaced by the retained and not-corroborated cells above | its second half is the superseded rule; its first half (a third leader named by the target alone authorizes nothing) is kept, sharper, by the five not-corroborated cells |
| `replace-real-group-deposed-leader.test.js` (both cells) | world opened with the source leading instead of a third replica | the premise is "t leads, then is deposed"; t now gains leadership only when the source leads. Assertions unchanged |
| `replace-real-group-scheduling.test.js` S14 x4 | same re-premise | same. Assertions unchanged |

Cells that pass unchanged but now run the retained-leader path (they open
with a third replica leading on the priority partition and assert nothing
about who leads afterwards): `replace-real-group-completion.test.js`, three
cells (P1 terminal boundary; AN10 dead source; AN11 adopted intent, where
the target's deliveries are capped). They were not edited.

Not covered live (double only): the five not-corroborated shapes on a real
group; the late-effect case 3; the "authority names the source or the target
while the witness named a third replica" branches of `decideThirdLeader`
(reached only by a leader change between the two reads).


## Appendix C: follow-up round (same day)

- **Gap B is fixed.** `src/rebalancer/unified-rebalancer-rebalance-loop.js`:
  a rebalance pass re-reads its own leadership at three named checkpoints
  (`REBALANCE_LEADERSHIP_CHECKPOINT`): immediately before the synchronous
  plan, before execution, and before every move batch. A deposed pass answers
  the typed `REBALANCER_RUNTIME_REASON.NOT_LEADER` with the checkpoint, plans
  nothing and creates nothing; the loss is logged at info
  (`LEADERSHIP_LOST_DURING_REBALANCE`). Witness:
  `test/rebalancer/rebalance-pass-leadership-checkpoints.test.js`.
  The "Planner determinism" section above describes Gap B as open; it is
  closed by this change. Gap A's residual (planners without their own
  replica identity) stands.
- **`WAIT_LEADER_NOT_CORROBORATED` has its own deferral message**
  (`buildReplaceLeaderNotCorroboratedDeferral`, owned by the decision module).
- **The two "leader changed between the two reads" branches of
  `decideThirdLeader` are now tested on the double** (the authority names the
  source -> one handoff; names the target -> safe), each red with the branch
  removed.
