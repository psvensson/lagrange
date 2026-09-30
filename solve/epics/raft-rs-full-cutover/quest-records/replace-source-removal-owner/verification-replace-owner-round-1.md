# Verification: REPLACE source-removal owner, round 1 (fresh verifier, protocol v2 phase 8)

**Verifier:** fresh (Fable 5.1), not the implementer and not the evidence author. Read-only in `/mnt/data/peter/projects/lagrange/.claude/worktrees/o1-gate` (branch `quest/o1-committed-read-gate`). HEAD was `3f8cb954d` when the session started and `eff0357c6` (the O1 round-2 evidence merge) by the time the first command ran; `git diff --stat d46777ecf HEAD -- src` is empty, so production is exactly `d46777ecf` throughout. Every file:line below is at that SHA.
**Inputs read:** CLAUDE.md, rules.md, the two protocol memories, the owner directive (point 6), D1, D2, O1/O2/O4, coverage-model amendment 1 (sections 2-3), committed-read amendment 1 (B12, B13, section 3, section 8), the implementer report and its four scratch progress notes, the approved R-2 and lease-verdict evidence (not reopened), `evidence-replace-owner-completion.md` rounds 1-2, both instrumented SLO records, the production modules named in the brief plus `operation-workflow-dispatch-response-reconcile.js`, `-recovery-status-reconcile.js`, `-recovery-timeout.js`, `-recovery-drain.js`, `-recovery-observation.js`, `-stopping-starvation.js`, `-terminal-transition-repair.js`, `-dispatch-rearm-evidence.js`, `partition-service-raft-membership-administration.js`, `partition-service-raft-peer-cache-reconciliation.js`, `raft-rs-committed-membership-read.js`, `raft-rs-status-observation.js`, `raft-rs-group-constants.js`, and raft-rs 0.7.0 `raft.rs` (`post_conf_change`, `in_lease`); the evidence tests and harness, the double-based witnesses and the P3 harness.
**Runs (local, one file at a time, `node --test`, frozen tree):** completion 121/121, d2 73/73, scheduling 60/60, handoff 40/40, latency 20/20, remove-safety-post-intent 6/6, source-removal-owner 61/61, recovery-equivalence 264/264, named-handoff-attempt 37/37, consensus-exit 17/17, per-leg census 3/3. Scratch cells and mutation copies live under `scratchpad/verify-replace/` (`deposed-leader-authority.test.js`, `active-budget.test.js`, `mut.sh`, `mut-*`); nothing under `src/` or `test/` was touched.

---

## 0. Verdict

**REJECT.**

One finding changes the guarantee (V1): on `d46777ecf` a REMOVED is written while the committed configuration holds the source, through a mechanism the coverage model has no dimension for (authority currentness: a leader's own belief that it leads is taken as proof that its configuration is the current committed one; raft-rs runs with `check_quorum = false` and no read-index, so a deposed leader keeps answering as leader). Reproduced twice on the real-group harness (a partitioned ex-leader, and the no-partition "stall" shape where the deposing heartbeat sits undelivered in the ex-leader's inbox). This is a contradictory falsifier to the ruling "completion authority = the leader-answered current committed configuration through the single port read", which therefore reopens as an owner decision. A second finding (V2) is a new shape of F2 left in production: the F2 consensus-exit wait is skipped when the REMOVING row write is deferred, so a two-voter group can lose its quorum on the old order.

Everything else holds: the D2 class rule (no elapsed-time route to FAILED after durable intent; every route enumerated in section 4), checklist items (i), (ii), (iv), (v), the anchors, the causal-latency cells, the backstops and the static census. The evidence's own mutation matrix is honest where I re-ran it (section 6).

**What must change**

Production (owner decision first, then one implementer):
1. V1 - the completion authority must prove currentness, not leadership belief. Options for the owner: enable `check_quorum` (leader lease) so a deposed leader steps down within one election timeout and its answer is a lease-bounded read; or a read-index / heartbeat-confirmed witness read at the port (the answer is valid only after a quorum acknowledged the leader's term at or past the answered commit index); or corroboration by a quorum of members' applied configurations at an index >= the answer's. Any of these keeps the "one port read, no rows as membership" shape. The rule "no leader = typed WAIT" stays.
2. V2 - `replica-handler-remove-execution-methods.js:294-301`: await the consensus exit whenever the port is live, not only when the REMOVING row was published in this call (the wait reads the port's own configuration, never the row); keep the FAILED-durable skip as the failure detector's accepted verdict, recorded.

Evidence (after the production change, on the new frozen SHA):
3. The coverage model gains the dimension "authority currentness" (the answering leader's term/lease vs the group's), and P2 is regenerated per its own rule: R-1a now reads the leader, so `leader change x R-1a` (decide-first / process-first) must be a cell in both shapes above; a direct anchor "a stale leader's answer never retires the source". The generic P2 file is defective as it stands (the cell list was not re-derived after F1 added the leader as an R-1a input).
4. A cell for V2 (a deferred REMOVING write in a two-voter group; the fixture's cache write can be made to throw a retryable control-plane error).
5. Record E1 as partially outdated (section 6), record the double-only P3 cells and the RF=1 x ordinary-partition x source-leads cell as uncovered (section 1), and the S9 pre-intent x elapsed-budget cell (section 1, V4) as the missing crossing of a modelled dimension.

---

## 1. Coverage completeness (the model attack)

| # | Dimension | In the model? | Result |
|---|---|---|---|
| 1 | **Authority currentness**: is the answering replica's belief that it leads current (a lease or a quorum-confirmed term), or only its own state? | **Missing.** The model's inputs are "committed membership (real ports)" and "leader, term (the ports)"; the oracle is the fold at the group's highest durable commit index, but the implementation's oracle after F1 is "the answer whose `leaderReplicaId === replicaId`" (`operation-workflow-replace-surviving-membership.js:122-126`). Nothing in the model asks whether that belief is stale. | **V1** (section 2): a deposed leader answers as leader with a stale configuration; REMOVED is written while the committed configuration holds the re-admitted source. |
| 2 | P2 event x decision crossing after F1 | Modelled dimension (events x the decisions that read the moved input) but the **cell is missing**: F1 made R-1a read the leader, and the P2 file (`replace-real-group-scheduling.test.js`) still has only `leader change x handoff attempt` (S3) and `leader/term x R-1f` (AN6). | Generic-test defect, not a hand case: regenerate the crossing (section 0, item 3). |
| 3 | S9 pre-intent x elapsed time | P4 ranges over post-intent states only; pre-intent ACTIVE is measured at 31 s (AN2). | Missing crossing inside a modelled dimension. My scratch cell (`active-budget.test.js`: ACTIVE, attempt unresolved, +61 s / +301 s / +3600 s of every sweep) is **green** on the frozen tree, so production holds; the evidence should carry it (V4). |
| 4 | Restart classes x phases (P3) | Modelled; **17 of 21 cells run only on the witness double** (`replace-owner-recovery-equivalence.test.js:21-24`); the real harness re-does Φ5 x process restart (AN7) and the backstops. COORDINATOR_REINIT and WITNESS_RUNTIME_REBUILD have no live cell. The double's `addressedLeads` (`replace-witness-fixture.js:82-84`) makes every addressee claim to lead, i.e. the double literally encodes V1's mechanism as truth. | Checklist item (vi) is proven live for one cell and on the double for the rest (V5, evidence-only). |
| 5 | RF=1 x ordinary partition x source leads (the removed leader is the group's leader, no handoff) | Not a cell (B13 is priority-partition RF=1, where the handoff moves leadership first; the ordinary cell is RF=3). | Reasoned green (raft-rs `maybe_commit` -> `bcast_append` runs in the drain before the apply-driven exit read retires the port, so the sole survivor learns the commit), unmeasured (V10). |
| 6 | Remote-owner wake hop | Admitted uncovered by the evidence (section 8). The bootstrap wiring `control-plane-setup.js:378` has no unit witness; it is measured live by the instrumented SLO batch (10/10 runs, 3-5 wakes, 0 fallback fires). | Acceptable as measured; recorded (V9). |
| 7 | Terminal routes, timers, enumerations, planner, gate, V2 interaction | Modelled and covered. | Sections 4-8: no gap. |

---

## 2. Findings

### V1 - a deposed leader's answer completes the REPLACE over a re-admitted source (NEW MECHANISM; severity: guarantee)

**Mechanism.** `readReplaceCompletionAuthority` accepts an answer as the authority when the answering replica names itself as leader (`operation-workflow-replace-surviving-membership.js:122-126, 174-196`); `completionVerdictOf` then retires the source on ABSENT with `gateOpen` and `commitIndex >= C0` (`operation-workflow-replace-owner.js:196-210`). The answer's `leaderId` is the core's own `status.lead` mapped to an identity (`raft-rs-status-observation.js:58-66, 101-136`; `raft-rs-committed-membership-read.js:106-117`), its `commitIndex` the core's own `committed`. raft-rs 0.7.0 keeps a leader in `StateRole::Leader` until it receives a higher-term message: `in_lease()` is `check_quorum` (`raft.rs:468-470`) and the runtime sets `CHECK_QUORUM: false`, `PRE_VOTE: false` (`raft-rs-group-constants.js:16-17`). So a leader that is partitioned, or whose node has not yet drained the higher-term heartbeat, answers "I lead, the source is absent at my commit index k >= C0" while a new leader has since re-admitted the source at k+1. C0 bounds staleness only against the intent's own read, not against the group.

**Re-admission is a live production mechanism, not a harness construct.** The leader's row-driven peer reconcile runs on every services-row change of the partition (`partition-service-core-base.js:841-853` -> `:859-877` -> `partition-service-raft-peer-cache-reconciliation.js:335-382`) and admits every row that is not FAILED/REMOVING/REMOVED and not in the configuration (`:96-106, :286-305`). When R-1f removes the source through t before the source node's REMOVING row has reached the (other) leader's cache by CDC, the next reconcile there re-admits the source (BR16/A4). Under F1 alone that is benign (the current leader answers VOTER, R-1f re-drives); combined with a deposed leader it is the violation.

**Reproduction** (`scratchpad/verify-replace/deposed-leader-authority.test.js`, real-group harness, priority partition, source not leading at creation): drive to intent (the handoff makes t the leader), suppress the owner's wakes, let RemoveNode(s) commit under t, then
- shape A: `cluster.isolate(t)`; r2/r3 elect r3; the source node returns (row ACTIVE) and the new leader re-admits it; R-1a reads t: `source_retired` from `r4` (leader r4, commit 4, term 2) while the fold at the group's highest durable commit (r3, index 6, term 3) holds the source; `reconcileOperationProgress` writes **REMOVED with `sourceCommittedVoter: true`** - `not ok 9`, `not ok 10`;
- shape B (no partition): after the re-admission `heal(t)`, tick the new leader so its heartbeat is queued in t's inbox (3 undelivered envelopes), and read before t's runtime drains it: `source_retired` again - `not ok 6`.

Both shapes are "pending event not processed" instances of the leader-change event, which the model lists but never crossed with R-1a. Shape B needs no network fault: an event-loop stall on the target's node longer than the others' election timeout (seed stalls of tens of seconds are on record in this repository) followed by the owner's fallback firing before the raft drain is exactly it.

**Classification.** New mechanism (an authority that cannot prove its own currentness), which also exposes a missing cell inside the modelled event dimension. It contradicts the sealed ruling on the completion authority, so it is an owner decision (protocol phase 9: the guarantee and the oracle change). The oracle itself (the fold at the highest durable commit) is independent and caught it; the anchors did not, because none has a stale leader.

### V2 - the F2 consensus-exit wait is skipped when the REMOVING row write is deferred (NEW SHAPE of F2; severity: guarantee in two-voter groups, none at RF >= 3)

`removeReplicaAsync` (`replica-handler-remove-execution-methods.js:286-301`) awaits `awaitReplicaRemovalConsensusExit` only `if (retiringRow.published)`. `publishReplicaRetiringRow` answers `published: false` in two cases: the durable status is FAILED (`:99-101, :117-121`, the failure detector's verdict - accepted nondeterminism, as A8 records) and a retryable control-plane error after `persistReplicaStatusWithRetry` gave up (`:143-154`, logged `REMOVE_STATUS_WRITE_DEFERRED`). In the second case the handler goes straight to `retireReplica` (`:302-307`) and the row delete, which is the pre-F2 order: the port stops stepping before its own RemoveNode commits, and in a two-voter group (the RF=1 REPLACE of B13, or RF=2) the removal proposed afterwards on the delete never gets the removed replica's ack. The wait does not depend on the row (it reads the port's applied configuration, `replica-removal-consensus-exit.js:57-66, 104-116`), so skipping it because the row write was deferred protects nothing. Static finding; not reproduced (needs a write-fault injection in `replica-removal-consensus-exit-fixture.js`); no cell in `replica-removal-consensus-exit.test.js` or B13 covers a deferred row write. Production change plus one cell.

### V3 - the P2 generic test was not regenerated after F1 (evidence defect; folded into V1's evidence items)

`replace-real-group-scheduling.test.js:13-21` lists the cells as derived before F1. After F1 the leader is an R-1a input; the model's own rule ("each event is crossed only with the decisions that read the input it moves") requires `leader change x R-1a`. Fixing the generic file is the remedy, not a hand-written case.

### V4 - S9 pre-intent x elapsed budgets is unmeasured; the budget exemption is not load-bearing on any measured route (evidence-only / hygiene)

The evidence measures ACTIVE at 31 s only (AN2). My cell at +61 s, +301 s and +3600 s is green on the frozen tree. Under the mutation `isReplaceExemptFromTimeBudget -> false` (`mut-ex-false`) d2 73/73, completion 121/121 and my cell 8/8 stay green: the sweep never reaches `reconcileTimeoutOperation`'s budget for a REPLACE at ACTIVE because `reconcileOperationProgress(cause: 'timeout')` re-executes it first (`operation-workflow-recovery-status-reconcile.js:652-658`), and at STOPPING `routeTimeoutSweepToReplaceOwner` short-circuits (`operation-workflow-recovery-timeout.js:195-203, 269-272`). The evidence already records this mutation as silent alone; the point for the record is that the D2 invariant rests on the routing plus `admitReplaceTerminalFailure` (`operation-workflow-replace-terminal-admission.js:54-61`), and the exemption is defence in depth. Not a defect.

### V5 - checklist item (vi) is proven live for one cell only (evidence-only)

See section 1 row 4. The double cannot express V1 (its `addressedLeads` answers "leader = the addressee"), so the double's convergence is convergence of a model in which authority is never stale.

### V6 - evidence finding E1 is partially outdated (hygiene)

Under `revalidateReplaceSourceRemovalEffect -> SEND` (`mut-e1-revalidate-send`) S11 decide-first goes red (`not ok 7`, scheduling 59/60), so the section-3.2 revalidation is now load-bearing for the concurrent-operation check (F3 made the STOPPING re-send run remove safety, and the WAIT is what withholds the effect in the same turn). S12 and S13 stay green with it removed, so its terminal and failure-detector checks remain shadowed as E1 says. Record E1 as "load-bearing for check 5 only".

### V7 - E3 confirmed (no defect)

Under `gateOpen` check removed (`mut-m10-gate`): completion 121/121, d2 73/73, `evidence-o1-anchors` 8/8, `participation-gate` 5/5 stay green; only W3's double cell is red (60/61). On the real chain the verdict is always a leader's answer and a leader's gate is open by construction (`raft-rs-committed-membership-read.js:81-85` refuses a non-leader only for BOOTSTRAP; for WITNESS the redirect makes the leader answer). The branch is a fail-closed guard on the answer contract, as the evidence says.

### V8 - the 1 s fallback re-arm is dropped past 300 s during an uninitialized window (liveness, hygiene)

`rearmSafetyDeferredRetryWhileUninitialized` (`operation-workflow-dispatch-rearm-evidence.js:327-341`) refuses to re-arm when `isOperationWithinRetryBudget` (`:270-280`, 300 s from `createdAt`) is false, so a REPLACE older than 300 s whose fallback fires during a coordinator re-init loses its 1 s fallback. K1 (`checkTimeouts` -> the owner) and the orphan sweep still reach it (P3 "missed events, each backstop alone" cells), so liveness holds at the sweep cadence rather than 1 s. Not a terminal route.

### V9 - the port -> service -> registry -> coordinator wiring has no unit witness (hygiene)

`control-plane-setup.js:378` (`rebalanceCoordinator.attachReplicaConsensusEvents?.(...)`) is exercised by no test file (the three files that call `attachReplicaConsensusEvents` wire their own relay). The instrumented SLO batch on `fc9861157` shows the wake live (10/10 runs, wakes 3-5, fallback fires 0), which is a stronger measurement than a unit witness; recorded as the implementer report already does.

### V10 - RF=1 x ordinary partition x source leads is uncovered (evidence-only)

See section 1 row 5.

---

## 3. Checklist point 6 on `d46777ecf`

| Item | Production | Evidence: ranging + independent oracle, or double? | Verdict |
|---|---|---|---|
| (i) re-drive of an uncommitted source removal (R-1f, bounded, one attempt in flight) | `redriveReplaceSourceRetirement` (`operation-workflow-replace-owner.js:364-390`): one uncertain attempt (`shouldIssueRetirementAttempt :308-323`: unanswered blocks; re-issue on a changed (leader, term, state) level or after `transferWindowMaxMs`, else 60 s); BR10 rebuild (`:335-352`) never issues at once after a restart. Preconditions: STILL_VOTER, target not gone, source row absent/retiring or `sourceUnreachable` (`:576-593`). | Live, independent oracle: sink, STOPPING owner, AN6 (0 timers), AN7 (restart in Φ5, BR10 outstanding then backstop), W_max backstop, S2 (row-driven removal x lost proposal, no double authority), P5 (idempotent re-drive). | Holds. |
| (ii) a membership change wakes the owner, and only wakes | `announceMembership` on the port; relay `relayPartitionConsensusObservations`; the wake compares a level and re-runs the owner's own turn (`operation-workflow-replace-owner-wake.js:289-302, 399-419`); the event's payload is only a level key (`:250-264`), never read as membership. | Live: latency 2 ("applied on the witness -> completion", 0 ms, 0 timers), AN6, K2/K1/W_max with events suppressed; `membership-changed-event.test.js` on real ports. The bootstrap hop: measured live (V9). | Holds. |
| (iii) completion rereads committed membership (leader's answer; commitIndex >= C0; C0 recorded at first intent, preserved) | R-1a `:179-210`; C0 `operation-workflow-replace-intent.js:59-87` (NaN at STOPPING without an entry, floor 0 before the boundary); `persistReplaceRemovalIntent` keeps the first entry (`operation-workflow-recovery-reconcile.js:516-567`); `completeOperation` gated (`operation-workflow-transition-persistence.js:362-370`); the repair re-decides (`operation-workflow-replace-terminal-admission.js:77-88`). | Live, independent oracle over every success edge (census + 8 edges), AN11 x2 live, B12 live and pinned. **But the authority is not current-proof: V1.** | **Fails on V1.** |
| (iv) the planner cannot independently remove an active REPLACE's source | `excludeNonTerminalReplaceSources` over the in-flight set (`move-planner-move-calculation-methods.js:67-86, 200-211`), `cleanupCountGuarded` (`:243-254`); S10 deleted; A6 (`recovery-timeout.js:703-711, 725-728, 829-831`: owner-phase REPLACE never stale by age, FD-dead target only). | The planner is a pure function of rows: the 12-cell witness ranges over bystanders x non-terminal steps with a control that removes the bystander; S8/AN1 live; A14b fail-closed witness; the evidence's planner mutation goes red there (E2 honest about S8 not isolating it). | Holds. |
| (v) a handoff attempt cannot be retargeted (named target only; attemptSeq; lead === t) | `evaluateReplaceNamedHandoffSafety` always names t (`priority-publication-handoff.js:171-212`); `decideNamedHandoff` LEADERSHIP_SAFE only on `leader === targetReplicaId` (`operation-workflow-replace-handoff-attempt.js:218-224`); one unresolved attempt blocks (`:152-169, :228-233`); late answers dropped (`:137-150`); the per-leg legs and CL-043 are gone (census 3/3; `priority-publication-leader-safety.js:295-315` answers LEADERSHIP_PENDING only). | Live: named-target cell (real forwarded transfer), S3, S5 (held answer), B13 x2; the seq echo (routed) and F-b/BR11/BR12/no-retarget on the double at the answer seam. A deposed t answers LEADERSHIP_SAFE by the V1 mechanism, but that only sends the effect early: the source retires only on its applied removal (F2), so it is not a safety hole here. | Holds. |
| (vi) missed notifications and restarts recover through the same owner | Every entry route converges on R-1e (`dispatch-response-reconcile.js:123-126, 259-261`; `recovery-observation.js:653-657, 776-780`; `safety-topology.js:47-49`; `recovery-status-reconcile.js:61-76, 422-428`; `recovery-timeout.js:195-203`); BR6 epoch gate pre-dispatch only; BR17 releases on any terminal; BR10 rebuild. | Live: AN7, K2/K1/W_max backstops, S7 (BR17), the after-budget restarts; P3's 18+3 cells on the double (V5). | Holds on what is measured; 17 cells double-only. |

---

## 4. D2's class rule: every terminal transition reachable after durable intent

FAILED has one writer (`failOperation`, `transition-persistence.js:522-600`; the only `workflowStep: WORKFLOW_STEP.FAILED` projection) and REMOVED two (`completeOperation :349-479`, the repair `terminal-transition-repair.js` re-persisting a retained projection). The P1 census pins the caller files (9 `failOperation`, 8 `completeOperation`). Every `failOperation` passes `admitOperationFailure -> admitReplaceTerminalFailure` (`operation-workflow-replace-terminal-admission.js:34-61`): the DURABLE step is read, post-intent only `replacePostIntentFailure === TARGET_DEAD_SOURCE_RETAINED` is admitted, and the write carries `expectedWorkflowStep` (a CAS), which closes the implementer's "stale in-memory copy" hole (P1' cell: a stale ACTIVE copy cannot fail it). The only caller passing that option is `handleReplaceTargetDeath` (`operation-workflow-replace-owner.js:503-513`), reached from the STOPPING owner when `isReplaceTargetGone` and the leader's answer is STILL_VOTER.

| Route | Location | Post-intent outcome |
|---|---|---|
| Timeout sweep, locally owned | `recovery-timeout.js:195-203, 269-272` | routed to the owner; no budget read |
| Timeout sweep, remote-owned / budget branch | `recovery-status-reconcile.js:694-703` | diagnostic only (`recordReplaceBudgetDiagnostic`); and the sweep re-executes first (`:652-658`) |
| `isOperationStepTimedOut` consumers | `coordinator-created-handoff-scheduling.js:202-207` (stop re-waking a remote owner), `transition-retry.js:119-125` (CLEAR_RETRY) | liveness only: neither writes a terminal nor creates a cleanup; the owner's own fallback and K1 continue |
| STOPPING starvation | `stopping-starvation.js:117-134` | bypassed by `recovery-observation.js:653-657`; refused by admission if reached |
| `FAIL_STOPPING_RECOVERY` | `recovery-status-reconcile.js:422-428` | routed to the owner |
| Drain stale FAIL (step age) | `recovery-timeout.js:829-831` | never stale at ACTIVE/STOPPING |
| Drain R-1c | `recovery-timeout.js:813-818` | pre-intent only, FD-dead target required |
| Drain superseded-target FAIL (remote settle) | `recovery-drain.js:645-664` | refused by admission (durable step) |
| Dispatch errors, refused safety, NOT_FOUND/ERROR answers | `dispatch-response-reconcile.js:348-357, 391-401, 451-455, 548-549, 572-573, 692-693`; F3's typed wait for a FAIL-class safety answer (post-intent witness 6/6) | refused by admission; the caller's "failed" result is cosmetic (row stays STOPPING) |
| Executor outcome FAILED | executor-outcome-reconcile-methods | refused (P1' cell) |
| Target REMOVED/FAILED row | `recovery-status-reconcile.js:61-76` | post-intent -> the owner; pre-intent -> typed FAILED (AN3, W12) |
| `replayReplaceActiveSourceRemovalFromObservedTarget` | `priority-recovery-superseded-target.js:557` -> `replace-replay.js:494-516` fabricates an ACTIVE copy | the intent CAS fails and the copy adopts the durable intent (`recovery-reconcile.js:542-567`); no terminal |
| Post-intent target death | `replace-owner.js:503-519` | the one admitted FAILED (leader's STILL_VOTER + FD-dead target); P6(b) live |

No route to FAILED based only on elapsed time remains after the boundary. P6(b') nondeterminism stands as accepted (P1' holds at the write instant).

---

## 5. Authority and races

- **C0 vs a deposed leader:** V1. C0 is a lower bound on the witness's staleness against the intent, not against the group; a leader's `commitIndex` is its own.
- **Re-admitted source (AN11/A4/BR16):** with a current leader the answer is VOTER -> STILL_VOTER -> R-1f re-drives on the changed level (W14 double, AN11 live x2, S2). Re-admission is live in production (section 2, V1); under F2 a re-admitted replica whose port already retired is a dead voter until the next RemoveNode commits (majority of the others).
- **Target below its gate (B12):** the target's answer names its leader; the leader answers STILL_VOTER; a never-admitted target names none -> typed `LEADER_UNKNOWN` wait (live cell + anchors). The V2-deferred AddNode(t) is the same shape.
- **Target dead + leaderless:** typed wait, nothing written (P6 b/c, target-gone, P1'); the surviving-member read is the witness caller with another addressee (ruling). Ordinary convergence while the REPLACE waits: the planner excludes the source (in-flight set includes STOPPING) and guards cleanup counts; an RF deficit (dead target) may plan an ADD, which D2 does not forbid; once a leader answers, D2 resolves the REPLACE (FAILED source-retained or REMOVED).
- **F2's exit paths:** the deferred REMOVING write skips the wait - V2. The FAILED-durable skip is the failure detector's verdict (accepted nondeterminism). Node shutdown aborts the wait (`replica-handler-runtime-methods.js:553`) and `throwIfShuttingDown` then leaves the port unretired (`:300, :390-395`). A removed leader stays `StateRole::Leader` in raft-rs (`raft.rs:2667-2685`, the early return, no step-down); its `bcast_append` at commit precedes the apply-driven exit read in the same drain, so followers learn the commit before the port retires; RF >= 3 survivors elect regardless (target-gone, P6 c live).
- **Handoff and a deposed target:** `decideNamedHandoff` reads t's belief; a deposed t answers LEADERSHIP_SAFE and the effect leaves early. Harmless under F2 (the source keeps participating until its applied removal), liveness only.

---

## 6. Mutations re-run in scratch (`scratchpad/verify-replace/mut.sh`, copies of the frozen tree)

| Mutation | Files | Result | Reading |
|---|---|---|---|
| `isReplaceExemptFromTimeBudget -> false` | d2, completion, my ACTIVE-budget cell | 73/73, 121/121, 8/8 green | silent, as the evidence records; the exemption is not load-bearing on any measured route (V4) |
| `revalidateReplaceSourceRemovalEffect -> SEND` | scheduling, post-intent, source-removal-owner | **S11 decide-first red** (59/60); 6/6; 61/61 | E1 outdated for check 5 (V6); S12/S13 still shadowed |
| `gateOpen` check removed (E3) | completion, d2, O1 anchors, participation-gate, source-removal-owner | 121/121, 73/73, 8/8, 5/5 green; **W3 red** (60/61) | E3 confirmed (V7) |
| (reproduction, no mutation) deposed leader, two shapes | `deposed-leader-authority.test.js` | **red on the frozen tree** (13/16) | V1 |

---

## 7. Enumerations, static census, timing arithmetic

- **Enumerations imported by the evidence:** `OPERATION_TERMINAL_WORKFLOW_STEPS_BY_TYPE` (REPLACE: FAILED, REMOVED), `REPLACE_COMPLETION_VERDICT` (4, each with a cell), `REPLACE_OWNER_PHASE` (6) x `REPLACE_OWNER_RESTART_CLASS` (3) in P3, `getWorkflowSteps(REPLACE)` in the epoch-gate witness, `PARTITION_REPLICA_MEMBERSHIP_STATE` (VOTER, ABSENT, UNRESOLVED, UNAVAILABLE) at the seam (`membership-administration.js:315-329`: UNRESOLVED fails closed), `RAFT_EVENT.MEMBERSHIP_CHANGED` and `CONF_CHANGE_APPLIED`/`GATE_OPENED` (the exit's wake events, `consensus-exit.js:44-47`). The P1 census pins the terminal persist sites and caller files.
- **Port-read callers outside `src/raft`: two** - `partition-service-raft-membership-administration.js:343` (WITNESS) and `replica-handler-committed-membership-methods.js:36` (BOOTSTRAP, reached from `rebalancer/committed-membership-bootstrap-read.js:82` through the handler message). **confState readers outside `src/raft`:** the wake's level key (`replace-owner-wake.js:251-256`, event data, wake-only), the relay (`partition-service-raft-lifecycle-wiring.js:135`), a doc comment (`replica-handler-membership-relay.js:89`). **Per-leg symbols:** the census (3/3 green) covers src, test and scripts; `LEADERSHIP_PENDING` remains as a snapshot state, not evidence.
- **Timing:** F2 exit backstop 30 s (`replica-handler-constants.js:24`) < REMOVING step budget 60 s (`rebalancer-constants.js:89`), and the REPLACE is budget-exempt post-intent anyway; K2 fallback 1 s (`operation-workflow-owner-shared.js:342`); T5' re-send and R-1f backstop 60 s (`REPLACE_REMOVAL_PENDING_ESCALATION_MS`, `operation-workflow-replace-owner-state.js:44`), preferring the group's transfer window W_max (`membership-administration.js:287-310`, election timeouts over `service.replicaIds`); handoff attempt resolution = W_max since the answer (else a fresh `lead === t`), the "5 s retry" of B13 being `recoveryRetryWindowMsOf = electionTick x tickMs`; CL-043 staleness of a concurrent PENDING operation 30 s on the owner's clock (`PENDING_TIMEOUT_MS`) - REPLACE owner phases excluded from age (A6); SYNCING 300 s vs V2's event-driven deferral (no timer); the 300 s `REBALANCE_OPERATION_BUDGET_MS` still gates the uninitialized-window re-arm (V8). The deposed-leader window (V1) is unbounded with `check_quorum = false`: no timing relationship bounds it.

---

## 8. Participation gate and V2 on the REPLACE path

- A target whose AddNode is deferred (V2 `CONF_CHANGE_PENDING`) stays below its gate: its witness answer names the leader (gateOpen false), R-1a redirects, the leader answers STILL_VOTER; the named handoff to a non-voter is refused or times out and resolves by the window (B13: one refusal, then completion once admitted). No decision is taken from the target's view.
- The source's REMOVING row triggers `retireRaftPeerFromAuthoritativeServiceChange` on every replica of the partition (`peer-cache-reconciliation.js:215-260`; followers forward, the leader proposes) and R-1f proposes through t: duplicate REMOVE_PEER of the same identity is a raft no-op (`changer.rs`), a proposal behind a pending change is DEFERRED at the port and re-proposed on `CONF_CHANGE_APPLIED` (`:395-413`), and a forwarded follower proposal the crate drops at the leader is re-driven by R-1f's level/backstop (AN7, W_max, S2). The identity -> peer id derivation is pure, so no proposal names another replica. No double authority: S2 shows one committed removal with both paths active.

---

## 9. Verdict (verbatim, for the handback)

**REJECT.** V1 (NEW MECHANISM, guarantee): on `d46777ecf` a deposed leader (raft-rs `check_quorum = false`, `raft-rs-group-constants.js:17`; `in_lease` = check_quorum, `raft.rs:468-470`) answers `leaderId === self` with its stale applied configuration; `readReplaceCompletionAuthority` (`operation-workflow-replace-surviving-membership.js:122-126, 174-196`) takes that as the current committed configuration and `completionVerdictOf` (`operation-workflow-replace-owner.js:196-210`) writes REMOVED while the group's committed configuration holds the re-admitted source. Reproduced on the real-group harness in two shapes (partitioned ex-leader; undelivered deposing heartbeat, no partition): `scratchpad/verify-replace/deposed-leader-authority.test.js`, 13/16, the P1 write captured with `sourceCommittedVoter: true` at the fold's commit 6. The coverage model lacks the dimension "authority currentness", and P2 lacks the `leader change x R-1a` cell F1 made necessary. This contradicts the sealed completion-authority ruling and is an owner decision (lease/check_quorum, read-index-confirmed read, or quorum corroboration). V2 (NEW SHAPE of F2, guarantee in two-voter groups): `replica-handler-remove-execution-methods.js:294-301` skips the consensus-exit wait when the REMOVING row write was deferred (`:143-154`), retiring the port before its removal commits. Everything else holds (D2 class rule enumerated, checklist (i), (ii), (iv), (v) live; (vi) live for one cell, double for the rest). Must change: production 1-2 (section 0), then evidence 3-5 on the new frozen SHA; no acceptance battery before that.
