---
audience: development
documentClass: proposal
---

# Participant release reduction: round-two recovery draft

Status: **WIP design; not independently reviewed, implemented, Quest-landed or certified.**
Base: `97e252d63a44f2862d0643fc740b1ceb00dc12fc`; held source:
`14fac7d6ef64881daa7a0d266a272b724dfe640a`. This is an additive proposed successor
of [round one](design-participant-release-reduction-2026-10-12.md), not an edit
of its review or the sealed TX1 statement. The source and test tree is unchanged.

## Basis and selected direction

Consume the retained [independent REVISE verdict](evidence/activation-reduction-2026-10-12/session-artifacts/review-design-reduction-round1.md),
[startup census](evidence/activation-reduction-2026-10-12/startup-admission-census.md),
[live trace](evidence/activation-reduction-2026-10-12/session-artifacts/activation-trace-14fac7d6.md)
and [predecessor](evidence/activation-reduction-2026-10-12/predecessor-design-participant-release-activation-authority-2026-10-11-d00c8f3e9.md).
The review/census are source evidence, not a new execution in this session.
The interrupted conversation's later test counts have no recovered candidate binding.

Selected design direction under the existing safety-first design mandate:
**membership change alone does not start a partition-wide release pause**;
**steady-state transaction recovery, not release, settles in-doubt transactions**;
**one durable pause ordering, one own-grant projection, one transition driver,
one owner-defined outcome vocabulary**. These are proposed successor semantics,
not a claim that the corresponding sealed clauses have already been superseded.
The disposition map below makes those changes explicit before implementation.

The trace changes the rationale: unperturbed runs wedge after follower lag
causes a dependent to start a nested control cutover. The perturbed run inserted
50 ms sleeps, released 44 dependents, and finished the seed sequence at 19.794 s
with about 10.2 s left, then failed later. It is not a green production oracle
or proof that the budget must grow. Delete the race, not the deadline.

## 1. Consumed surfaces and ownership inventory

Directly re-read at the base above; blob IDs bind the cited source:

| Surface | Blob | Consequence |
| --- | --- | --- |
| `src/partition/partition-participant-release-dispatch-admission.js:41-77` | `e54743f956447845cc94d83a862a976ebbca51df` | FINALIZE/CONFIRM depend on the single slot and local CURRENT equality; deleting SHARE requires changing this fence. |
| `src/partition/partition-participant-release-identity.js:12-25` | `4765759fa7ed259d1d642a6f9bc4cb4eeacf6878` | Build/protocol identity currently also hashes membership. |
| `src/node/participant-release-authorization-owner.js:17-95` | `97a28de1354bf7dac84b135bd6ae8e39748526e6` | Tokens are process-local WeakMap keys; FRESH_SEED hashes invocation/boot/deadline; FRESH_CREATE rechecks CREATE admission. |
| `src/node/replica-handler-release-recovery.js:16-134` | `ccee87a4bb7f74e4a6445bb5d0faae64565fdf9c` | Four active slots and pending/running maps exist; no local leader, OPEN and no-origin branches do not provide the proposed control driver. |

Additional source locations below are retained-review/census citations; they
must be read on the implementation candidate before editing, not treated as
already created APIs. Census B.1/B.2 binds seed ordering and the final SQL
recovery attach; review M3 binds the missing INSPECT cycle-row surface.

| Semantic fact | Sole owner / mutation | Identity and lifetime | Consumers / invalidation / continuation |
| --- | --- | --- | --- |
| Loaded build | Existing runtime provenance and Raft binding/loader owners | Actual loaded JS/WASM/artifacts, including fault recovery | Release consumes the measured result; missing Raft hashes is unmeasured, not success. |
| Physical history | Existing lifecycle, native storage and reseed owners | Established history versus authorized fresh storage | Release consumes their decision; a supplied root or repeated origin position cannot repair lost history. |
| Membership | Existing Raft committed-configuration owner | Configuration belonging to the applied entry | Apply uses that owner; a learner remains locally closed until admitted. No second membership string becomes authority. |
| Release decision | Existing participant store/apply; proposed per-dependent cycle row | Control history, dependent, semantic release, cycle generation and revision | Exact CAS; different dependents cannot overwrite each other; old-row absence is not success. |
| Pause ordering | Existing participant generation row/apply | Committed pause generation for a semantic cutover | Retry, leader change and restart do not themselves mint another pause. |
| Own local grant | Existing admission/lifecycle owner, one derived projection | Exact service/runtime/connection/activation observation | HOLD revokes future effects immediately; only current revalidation can reopen. No SHARE publication of another dependent's grant. |
| Accepted work and retirement debt | Existing write/transaction/lifecycle owners | Original operation and exact target incarnation | Completion survives lost replies; clear only the matching committed retirement on every affected replica. |
| Scheduling | Existing release recovery owner | One pending intent and winner per dependent/release; bounded active slots | Seed/create/operator/restart are submissions or wakeups, not competing algorithms or roots. |

## 2. Transition and identity changes

**Observe before changing state.** A matching OPEN grant is an idempotent
observation; partial committed progress resumes its recorded cycle. Ordinary
follower lag is a bounded wait on the same attempt. A dependent may inspect and
enqueue the control's own work; it never runs a nested control cutover. INSPECT
must be extended to return a typed, leader-routed cycle observation. It is a
hint for selecting work, never sufficient permission to open a replica.

**Per-dependent rows and deterministic apply.** Replace the single control slot
with the existing store's per-dependent cycle records. Use exact history,
dependent, cycle generation and revision on all commands. RESERVED -> AUTHORIZED
-> CONFIRMED; RETIRED is terminal for that cycle. Delete CLAIM/SHARE/DISPATCH only
with their complete consumer migration. The control's own release is a row of
the same model, with explicitly authorized bootstrap prerequisites rather than
a circular requirement for its own preexisting CONFIRMED grant.

**One RETIRE contract.** Its typed scope is CYCLE or TARGET. A matching target
retirement before confirmation terminalizes an incomplete cycle; after
confirmation it revokes that target receipt without revoking unrelated targets.
A cycle retirement terminalizes the matching cycle in any nonterminal state.
Foreign dependent/history/generation/revision is not permission to overwrite a
current row. CYCLE_SUPERSEDED is terminal only when the same-history authoritative
successor transition proves the old cycle was retired; inequality alone is not
that proof. RETIRE apply clears matching local debt on each affected replica,
not only in the leader's request-response continuation. Stale debt cannot clear
a successor's obligation. A known STALE result is answered from the current row
rather than re-appending the identical no-op indefinitely.

**Dispatch is per submission, not per command ID.** Re-key FINALIZE/CONFIRM to
the dependent row and expected transition plus the control leader's own current
lifecycle permission. Do not compare its own authorization ID with the
dependent's. Capture the native dispatch fence for the exact submitted buffer;
HOLD invalidates that capture even if a later submission has identical bytes
and ID. Replacing a map entry by ID or recapturing only at dispatch is forbidden.
This local revocation is a different fact from durable pause ordering, not a
second durable pause generation. A command already accepted by Raft may still
commit: deterministic apply never consults volatile HOLD to rewrite history.
A later effect still needs current permission. The control's own release/build
binding used by dependent FINALIZE must be specified at apply, not just INSPECT.

**Restart preserves decisions, not old observations.** Separate the durable
release identity (partition/protocol/build, anchored to the existing physical
history) from per-boot/per-connection/per-runtime observations in receipts.
Restart begins CLOSED, retains the committed decision, then commits/consumes
fresh-incarnation observation evidence through the same path. A read of an old
CONFIRMED row cannot open the new incarnation. Retry uses retained command and
intent identities; it cannot hash a fresh invocation into a new grant. A real
new release advances the durable pause by committed order; PAUSE must not erase
the only retained decision merely because a retry has a different leader.

**Membership is not a new build.** Keep committed-configuration fencing at apply
and FreshMG/lifecycle eligibility. New/recreated members do not inherit OPEN from
someone else's receipt. Adding a learner does not pause healthy members solely
because release identity included membership. Prove promotion, removal, old
leader rejection and historical replay; this is not a relaxation of Raft quorum
or split/merge admission and does not authorize edits to the parallel FreshMG lane.

**Drain before destructive reopen.** Keep proposalQueue and pendingWriteOutcomes
in the pre-reopen accepted-work obligation: they contain more than release work.
Do not subtract counters without an owner-provided classification. Separate
post-origin/control-log catch-up from this drain. Connection replacement stays
with lifecycle and must retain all owed completion/CDC work. Distinguish
NEVER_ACTIVATED from UNKNOWN_AFTER_RESTART: an empty volatile CURRENT alone does
not prove no retirement is owed. A lifecycle-proven never-activated store can
proceed without inventing a SERVICES-route dependency; uncertainty stays held.

**One driver, original budgets.** Reuse the existing pending/running owner and
four-slot bound, with typed submissions carrying one retained intent rather
than seed-versus-recovery roots. Local single-flight does not fence an old
remote leader: control-side reservation/supersession must consume current
leader authority and reject stale terms/identities. A term supplied by a caller
is not self-authenticating. Joining callers retain their own deadlines; expiry
must not cancel an already admitted durable obligation or extend another caller.
Keep the seed's original 30 s bound and min(caller deadline, remaining attempt
budget). No per-wave or per-reply reset. With N dependents and concurrency C,
ceil(N/C) waves is the relevant scheduling bound, not the slowest partition.
Measure unperturbed end-to-end startup and the original seed window separately,
including cold provenance work where it falls inside each window. Missing the
bound stays a failure; recovery progress is reported separately.

**Transaction recovery is not a release sub-protocol.** Preserve the explicitly
scoped one-time legacy migration and its obligations. Thereafter the existing
transaction recovery owner settles in-doubt rows and release reports typed
pending recovery. Census B.1/B.2 places normal recovery activation after release:
simply deleting the release settler would create a startup cycle. A reviewed
pre-serving activation/handoff of the SAME recovery owner is required before
that deletion. No second coordinator, ledger, SQL path or success-by-absence.

## 3. Typed failure edges and cached views

Names here are proposed owner-enum entries, not claims that exports exist.
Consumers must branch on the canonical outcome, not free-text stage names.

| Edge / outcome | Admission and owned next step |
| --- | --- |
| ALREADY_RELEASED | Matching live grant only; no new command or deadline. |
| CONTINUE_CYCLE | Durable matching partial cycle; driver resumes exact recorded work. |
| CATCH_UP_PENDING / DRAIN_PENDING | No destructive reopen or nested cutover; bounded owner wake. |
| CONTROL_RELEASE_PENDING | Remain closed; named reachable control driver owns progress. |
| AUTHORITY_REQUIRED / HISTORY_UNAVAILABLE | Closed; explicit authority/lifecycle action, not an endless pending loop. |
| NOT_LEADER | Existing route owner redirects under original deadline; revalidate at destination. |
| LOCAL_GRANT_MISMATCH | Local HOLD; owner revalidates, no promotion of a stale projection. |
| STALE_CYCLE / RETIRED / CYCLE_SUPERSEDED | Re-read exact authoritative row; only proven terminal answer clears matching debt. |
| TRANSACTION_RECOVERY_PENDING | Existing recovery owner, available before serving, owns settlement. |
| DEADLINE_EXPIRED | Caller settles; no late permission or renewal; admitted debt remains owned. |

Disposable views: own-grant projection, INSPECT response, queued dispatch capture,
pending-outcome map and scheduler maps. Every use returns to the relevant row
and/or live owner; none grants authority after invalidation. A lost outcome-map
entry triggers exact-row resolution, not an unconditional re-proposal. The
persisted decision is not a disposable view. Receipt refresh cannot resurrect a
retired target while a replica is reopening; test both commit orderings.

## 4. All fourteen accepted-clause dispositions

This is a proposed supersession map, not retroactive acceptance. Preserve the
original sealed TX1 receipts and predecessor evidence. S numbers are the retained
review's numbers; its exact clause text remains the historical authority.

| ID | Proposed disposition and required proof |
| --- | --- |
| S1 | SUPERSEDE single generation-row control slot with per-dependent rows; cross-dependent isolation and migration proof. |
| S2 | SUPERSEDE single-slot predecessor/root identity with exact per-dependent CAS and retained intent; replay/unknown-answer proof. |
| S3 | SUPERSEDE CURRENT claim/share revisions; new per-cycle native dispatch and committed-configuration proofs. |
| S4 | SUPERSEDE whole-cycle retirement after confirmation with typed target retirement; preserve both orderings before confirmation. |
| S5 | KEEP all six round-ten witnesses, including 2, 3 and inverse controls of 6; ack, runtime turn and uncommitted append never prove commitment. |
| S6 | KEEP restart CLOSED and committed evidence before reopening; revise receipt shape, not the safety promise. |
| S7 | KEEP exact pre-submit candidate custody across restart; move custody to the existing intent owner, not reconstruction from new live fields. |
| S8 | KEEP immutable semantic body versus execution envelope; no supersession rewritten from a later census. |
| S9 | KEEP incompatible-history HOLD; lifecycle/reseed owns history, never a new release root. |
| S10 | KEEP original captured deadline without renewal; no hidden per-wave raise. |
| S11 | KEEP all retained legacy and accepted-write obligations across reopen and migration. |
| S12 | KEEP full v10 retirement map, real three-replica A1-A5 and persisted-migration M1; component results do not replace them. |
| S13 | ADAPT remote-control absence/positive witnesses to leader-routed INSPECT plus a real driver; no nested cutover. |
| S14 | SUPERSEDE control-population claims only with committed-configuration and control-release binding plus new-member refusal proofs. |

## 5. Review closure and execution order

All 25 retained findings have a disposition; none is marked independently closed.

| Findings | Draft response / remaining falsifier |
| --- | --- |
| H1, L6 | Per-dependent dispatch plus control own-release apply binding; stale capture, same-ID resubmission and control retirement races. |
| H2, M4 | Stable decision/intent versus refreshed receipt; restart and leader-change without invented PAUSE or old-incarnation OPEN. |
| H3, M3, M5, M13 | One driver with explicit authority-bearing pre-origin and remote continuation; stale leader and competing-root refusal. This owner seam remains OPEN. |
| H4 | Original deadline and wave arithmetic retained; no new performance result claimed. |
| H5, M7, M8, L4 | Restore full native commit witnesses; discriminate retry after OPEN and control release; one RESUME command per partition, per-target receipts; zero pause deferrals, not eventual success. |
| M1, M12 | Preserve accepted writes and lifecycle debt; close pre-serving transaction-recovery and snapshot-route circularity. These owner seams remain OPEN. |
| M2, M6, M10, L2 | Typed retirement, no foreign overwrite, every-member clearing, exact stale resolution; physical-history binding remains OPEN. |
| M9, M11 | Explicit changed surfaces, typed outcomes and two bounded implementation increments after vetting. |
| L1, L5, L7 | Correct current source citations; delete dead authorizeControlFrom/route consumers only through the consumer map; use retained predecessor path. |
| L3 | Trace section 3 attributes the analogous run-3 failure; retained idx 59->60 is still not directly measured. No stronger attribution claimed. |

**Implementation blockers, not invented existing APIs:** (a) actual pre-origin
control scheduling and remotely consumable authorization through the existing
seed/CREATE owners (WeakMap tokens do not travel); (b) intact-versus-recreated
history evidence through lifecycle/reseed, with cross-history collision tests;
(c) pre-serving transaction recovery and lifecycle no-activation/debt distinction;
(d) actual loaded Raft provenance, including native-fault recovery. Inspect the
preserved TX1 binding-owner correction before creating another implementation.
A tuple (originIndex, originTerm) alone is not assumed unique across recreation.

After category-complete independent design vet: increment 1 is store/command/
apply/dispatch plus real fixture/native boundary witnesses; increment 2 is
observation/restart/lifecycle/driver and seed/create/transaction-recovery consumer
migration. Serialize shared-owner edits. Retain first reds, source-revert or
semantic-mutation reds, exact source/test hashes and independent verdicts.
Then run the unchanged production oracle, followed by isolated physical lab
proof on the exact candidate. Keep W-A/W-G, rewrite W-B/W-C/W-D/W-E/W-F/W-H as
above, and retain W-I's separate scope. Do not treat the earlier reported
7 native + 9 record + 2 serving tests as recovered implementation evidence.

Review categories: admission-gating, recovery-replay, concurrency-serialization,
formation-circularity, owner-interaction, and transport-delivery for the newly
specified remote continuation. A self-check or document-consistency check is
not an independent verdict and does not close the eight sealed TX1 receipts.
