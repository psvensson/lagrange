# Rs-raft execution lane register — 2026-10-18

Scheduling plan for [raft-rs-full-cutover](../raft-rs-full-cutover.md).
The [cloud handover](HANDOVER-2026-10-18-cloud.md) and
[closeout plan](closeout-plan-2026-10-17.md) retain their evidence and acceptance
roles. This register orders the work without changing a Quest seal or a verdict.

## Baseline and authority

- Published handover: `f5717e6f53a3ae18c2f470a507a180c3eca2cc17`, on
  `work/rs-raft-event-reconciliation-20261016`.
- U1 production/test subject: `a251ce4fd9c980a78c0fd33d8a5f873161f90870`;
  unchanged by the handover. Independent implementation verdict: **REJECT**.
- Composed candidate recorded by the handover:
  `e7a3525a52afcc1e38218483f87ca3a74a421744`. Re-read its current ref and
  worktree before using it. Candidate-only findings cannot be closed against
  the creation branch merely because a similarly named file exists there.
- Primary checkout `integrate/rs-raft-2026-09-30` and other agents' work stay
  under their existing custody. Use isolated worktrees, never reset or sweep them.
- A/B/C are bounded units of the existing `wasm-creation-genesis` Quest.
  They do not get competing Quests, synthetic terminals or altered acceptance.
- D requires its own sealed Quest after its charter and red probe are reviewed.
  E/F/G use their existing owners. Audit first before declaring additional work.
- Harnessd records execution through accepted task definitions, explicit authority
  references and exact agent revisions. This plan alone grants no task acceptance.

## Model and effort policy

The owner delegated model and effort selection to the coordinating agent on
2026-10-18. The defaults below express that choice; the coordinator may change
them when the work or available models justify it and records the actual choice
with each assignment. Harnessd must validate availability and execution eligibility
and pin its immutable agent revision before work starts. A preferred model name
is not evidence that a deployed backend is certified to write.

| Work | Guidance / independent review | Implementation |
| --- | --- | --- |
| A: approved finality correction | `gpt-6-astra`, xhigh | `gpt-6.1-sol`, high |
| B: inventory, lifetime and serialization | `gpt-6-astra`, xhigh | `gpt-6.1-sol`, xhigh, after design approval |
| C: grant recovery and progress bound | `gpt-6-astra`, xhigh | `gpt-6.1-sol`, xhigh |
| D: production activation | `gpt-6-astra`, xhigh | `gpt-6.1-sol`, high per approved unit; xhigh for recovery/custody |
| E: FreshMG | `gpt-6-astra`, xhigh | `gpt-6.1-sol`, xhigh |
| F: TX1 / CDC | `gpt-6-astra`, xhigh | `gpt-6.1-sol`, xhigh |
| G: snapshot / cleanup custody | `gpt-6-astra`, xhigh | `gpt-6.1-sol`, high for a bounded approved gap |
| L: lab classification / regression | `gpt-6-astra`, high for ambiguous causality | `gpt-6.1-sol`, high for evidence work |
| I: integration and certification | `gpt-6-astra`, xhigh | `gpt-6.1-sol`, high for mechanical composition |

Use a separate verifier, not the implementer reviewing its own change. Reserve
max effort for a specific unresolved contract or counterexample; it is not the
default for routine coding, receipts or polling.

## Lane A — reservation finality (difficulty 3/5)

Owner: [wasm-creation-genesis](../../quests/wasm-creation-genesis/quest.json).
State at handover: bounded design approved; implementation not started.

Read `evidence/recovery-20261017/u1-correction-proposal.md` and
`u1-reservation-finality-bounded-verdict.md` beneath that Quest. Preserve all F1
witnesses in `verifier-recovery-u1-cloud/verdict.md`. Adopt them in the required
test-only checkpoint before production edits.

The deterministic resource-state owner alone supplies `SEALED`; all uncertainty
stays `UNRESOLVED`. REMOVE cancels only with finality proof, while an admission
retains its exact token before retirement. Implement at the four named owners
in the handover. Exercise delayed admission, future/old bindings, ordinal and
content cases, unknown write/read results, and old/fake owner responses.

Exit: independent bounded implementation approval on the exact changed head,
with the required controls and mutation evidence. This is not whole-U1 approval.
A and B can overlap, but shared intent/runtime/handler files have one writer at
a time; the integrator chooses the order and re-verifies their composed behavior.

## Lane B — inventory and retirement (difficulty 5/5)

Owner: `wasm-creation-genesis`. State: **DRAFT / REVISE**, production not authorized
by the existing draft. Treat F2–F6 as one coherent lifetime/recovery correction.

Resolve preliminary D1 in `u1-inventory-continuation-contract-v2.md`: an exact
retained origin must still have a real retry route after another creation owns
the canonical memo. Finish independent content-bound contract/oracle review,
including named RV6.2/RV7.3 amendments, before production changes.

Preserve every original journal obligation; use the existing CREATE/REMOVE
serialization; join inventory and by-path retirement to physical custody; prevent
late scans from reviving a dead lifetime or overwriting current state. Physical
closure with original completion UNKNOWN does not discharge journal debt.

Exit: all six U1 finding classes have independent exact-head verification after
A+B composition. Preserve ten measured counterexamples, five controls and the
required mutation coverage; adapt the overlap witness to await a correctly shared
startup promise without deadlocking the test. Focused green is not this exit.

## Lane C — U2 confirmation and abrupt restart (difficulty 4/5)

Owner: `wasm-creation-genesis`. Preparation can overlap A/B. Production follows
independent approval of corrected U1.

Resolve `u2-progress-bound-amendment-draft.md` before implementing
`u2-owner-plan.md`: payload-free APPLIED_PROGRESS may cover a batch larger than
K writes. State and review the actual write-bound contract; do not silently
substitute an event count. Include quiet-group zero-phase behavior, reopened HELD
followers, the exact UNAVAILABLE wake detail, and original grant identity.

Exit: independent U2 approval including real child-process SIGKILL/C9 evidence,
the approved bound and all preserved recovery obligations. Startup wiring and
serving/publication activation remain D's responsibility.

## Lane D — production activation (difficulty 5/5)

Owner: prospective activation Quest, not yet sealed. Read
`wasm-creation-genesis/evidence/recovery-20261017/activation-prerequisite-audit.md`.
Charter/probe preparation may overlap recovery; production activation depends on
corrected U1, U2 and E's learner-cleanup custody prerequisite.

Work in the audited order:

1. P0: independent charter/oracle review and meaningful red probe; seal the Quest.
2. A1: installed catalog lineage reaches desired/reconcile ownership; complete
   pre-selection K/request has durable custody, including original nonce/peers.
3. A2: bounded instance-resource reads and shared identity classification across
   all eight consumers and the SQL prefilter.
4. A3: production manager/journal/system gateway and artifact/module dependencies;
   await corrected inventory before seed/join transport; own restart quorum policy.
5. A4: HELD respects both step and total operation budgets without FAILED/live debt.
6. A5: RETAINED → APPLIED → endpoint → PRESENT with exact lifetime and cleanup.
   Repeated START cannot substitute for the APPLIED continuation.
7. A6: actual cohort planning, dispatch, leader replacement and retirement end to end.
8. A7: remove the old unbound path only after that production proof.

Exit: independently verified integrated startup/recovery/serving proof and deletion
of the superseded path. A helper API or mocked projection receipt is insufficient.

## Lane E — FreshMG (difficulty 4/5)

Owner: [message-group-fresh-identity-membership](../../quests/message-group-fresh-identity-membership/quest.json).
Inventory the exact candidate evidence and source first. Complete learner failure
cleanup at the actual host-custody owner before D's production join host depends
on it. Retain existing canonical/changed-discovery, CREATE, replacement/recovery,
promotion and off-seed `mg-1` requirements.

Can run independently of A/B in an isolated checkout. Coordinate runtime/lifecycle
changes with G and the integrator; do not duplicate a cleanup repair in two lanes.
Exit: current-head independent evidence at the existing seal, then compatible
composition with the creation and activation stack.

## Lane F — transactions and CDC (difficulty 5/5)

Owners: [replicated-transaction-decision-and-apply](../../quests/replicated-transaction-decision-and-apply/quest.json)
and [tx1-single-path-alpha](../../quests/tx1-single-path-alpha/quest.json).
Reconcile exact candidate status, reviews and all remaining receipts before edits.
CDC proof remains attached to its actual transaction/custody owner.

Run independently where source owners are disjoint. Serialize changes to shared
apply, snapshot, restart or lifecycle paths with E/G. Preserve replicated decision
and application authority, final query seam and original transaction identity.
Exit: existing transaction and CDC claims proved on the composed head. Separate
0.3 release obligations stay separate; this plan neither expands nor waives them.

## Lane G — snapshots and cleanup custody (difficulty 4/5)

Owners: `snapshot-receiver-admission`, `snapshot-lifecycle-staging-boundary`,
`replica-opening-history`, `startup-refusal-cleanup-custody`, and
`replica-cleanup-host-custody`.

Start with an exact-head audit. Already proven work is retained; create a bounded
repair only for an evidenced remaining obligation. Preserve application provenance,
transaction/HLC/replay state and failed-shutdown custody. Snapshot recovery cannot
be certified from a membership-only image or a primitive install test.

Coordinate learner-host cleanup with E and shared apply behavior with F. Exit:
current-head obligations accounted for, with independent proof for new changes
and an explicit integrated snapshot/recovery result.

## Lane L — lab and regression evidence (difficulty 3/5, high elapsed time)

Shared evidence function, not a new correctness owner. Use the existing lab
controller and locks. Analysis can overlap code; source jobs obey the deployed
controller's actual serialization and cannot be assumed asynchronous.

- Re-read current custody/deployment. #160 was reconciled; do not repeat it.
- Retrieve #184's first complete failure and compare exact base signatures.
  Local inherited conformance failures do not classify the lab failure by analogy.
- Reconcile first stage-1c replacement ID `c057e0b45fd2f2f4017b88425f18ec83`
  before retrying. The other three were never submitted. The preserved bodies
  expire at 2026-10-18 08:45:10 UTC; recheck time before submission. After expiry,
  new requests need truthful new IDs/timestamps once uncertainty is resolved.
- Set A: classify failed claimed-good endpoint before attempting bisection.
- Set B: historical good `9ff61abd…`, bad `9b53962f…`, 35 first-parent commits;
  next `c425ef42…` was not submitted. Recheck receipts before resuming.
- Preserve inherited static reds, import-seal discrepancy and exact coverage.
  Upload the oversized duplication bytes through the existing evidence owner when
  the original saved asset is available and verified against its recorded checksum.

Exit: typed, exact-source receipts and classified regressions. Component runs do
not become certification formations. Each repair returns to its source owner.

## Lane I — integration, certification and merge (difficulty 4/5)

Owner: epic coordinator. Maintain the source/base/ref and changed-file ownership
ledger per task. Integration preparation overlaps implementation; accept only
exact reviewed commits and recheck affected interactions after composition.

After prerequisites: freeze one candidate, resolve all required gates, obtain full
static/corpus and independent review, then three consecutive certification
formations at that same SHA on five distinct machines. Source changes invalidate
affected downstream evidence. The handover's four-host lab snapshot is insufficient.

Produce the closeout report with actual verifier/test/lab receipts, explicit release
blockers/follow-ups and exact owner merge approval. Follow the existing publisher
and post-merge procedure. No lane badge, PR merge or Harnessd PROVEN state replaces
the epic's final oracle or exact-main proof.

## Scheduling and durable updates

Start with at most four active agents: coordinator, A implementer, B design worker,
independent verifier. Reallocate slots to E/F or evidence analysis when an upstream
lane waits. Do not start seven source writers merely because seven lanes exist.
Keep one active writer per shared file group and an independent verifier slot.

At every bounded handoff record the exact base/head, owner, changed scope, model
and effort, proof results, unresolved obligations and the next checkpoint in the
owning Quest's append-only log. Record epic-wide composition in the closeout plan's
append-only Tracking section. Update this scheduling document when assignments or
dependencies change; retain historical decisions in those existing logs.

Harnessd tasks for A/B/C reference `wasm-creation-genesis` explicitly, with separate
bounded task scopes and dependencies. Their completion is task completion only.
Parallel tasks use separate ordinary lanes; do not let the sequential epic-run
coordinator compete for the same accepted tasks. See the
[Harnessd runbook](harnessd-tracking-2026-10-18.md) for the activation boundary.
