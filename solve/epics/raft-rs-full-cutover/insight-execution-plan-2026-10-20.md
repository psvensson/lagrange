# Lagrange: from architectural insights to a verified cutover

Date: 2026-10-20

Status: **OPERATOR-APPROVED PLANNING DIRECTION; PERSISTENCE ONLY**. On 2026-10-20 the operator approved the proposed plan and requested that it be written, persisted, committed/pushed, and accompanied by a handover. This approves the work ordering and preservation of the analysis, not a sealed Quest, an owner-contract amendment, independent implementation approval, a test receipt, or authorization to merge. No production change or implementation task is completed by this record.

Source anchor: `be25caa5f0c3612feec662d4feaa9ba28f8f34df`. The U1 integration branch still resolved to this commit when checked for this plan. It is an analysis anchor, not a declaration that it is the final execution candidate. Input review/model hashes and preservation provenance are in [the input manifest](insight-execution-inputs-2026-10-20.json).

## 1. Recommendation and scope

Attach one bounded delivery plan to the existing `raft-rs-full-cutover` epic. Reuse its contract-first work, existing Quests, independent review requirements, integration owner and certification gates. Do not open a competing architecture programme.

The objective is to demonstrate that complete operations preserve authority, committed outcomes and outstanding obligations through restart, replacement, topology change and temporary unavailability, while retaining Lagrange's existing single-owner architecture.

The five work packages below are planning headings, **not five new subsystems or automatically five new Quests**. Reuse an existing sealed unit where it owns the concern. A new source-changing child is justified only by a bounded, measured gap and its approved contract. The eight abstract counterexamples are test-design inputs, not eight established production defects.

Keep two acceptance scopes explicit:

- **U1 closure:** meet the existing U1 obligations on a named composition. Do not silently enlarge or weaken that seal.
- **Historical failure and release recovery:** repair failures in the required product/test scope through their owners. Inheritance is not a waiver. Relevant safety defects are blockers; unrelated improvements are not retroactively added to U1.

A passing U1 subset is not release acceptance; a release backlog must not make U1 a limitless refactoring task. Any necessary acceptance change is an explicit owner decision with append-only supersession.

### Preserved design boundaries

No second metadata database, bootstrap controller, workflow engine, universal epoch or per-request global topology lookup. Normal routing remains local-view based. Partitions keep consensus/data ownership, Cells remain disposable compute, and transaction isolation is not silently strengthened or weakened. Different lifetimes and generation domains remain distinct. New persistence must protect a genuine recovery/safety obligation rather than copy another ledger.

## 2. Establish the execution baseline before changing behaviour

The integration owner first names the actual execution candidate and reconciles already reviewed corrections by content and provenance. Preserve earlier candidate refs and first failing evidence. Do not replay an old merge order without checking current branch state, and do not absorb unrelated staged work.

Build a small traceability matrix from the review and historical failure ledger, not a complete new inventory of the codebase. Each row links:

`claim -> abstract counterexample -> existing fact/interaction owner -> production reachability -> real witness -> affected historical failures -> verdict at exact SHA`

For the initial investigation, complete only the rows needed to choose the first bounded repair. Extend the matrix as other packages become active. Avoid making perfect classification of every historical failure a prerequisite for fixing a demonstrated systemic cause.

The matrix is an index into existing contracts, Quest logs and execution artifacts. It is not another runtime ledger or an alternative authority. Useful evidence dispositions are:

- **Demonstrated defect:** a reachable production operation violates its contract, with the earliest material cause identified.
- **Already protected:** existing source engages the relevant scenario and a targeted regression demonstrates the witness is discriminating; no production change needed.
- **Excluded by a named invariant:** a reviewed enforcement boundary rules out the proposed schedule. Failure to reproduce is not enough.
- **Unresolved:** setup, availability or reachability is insufficient. Remain explicit; do not call it safe or local.

For each red test, record whether its current first failure is a product defect, fixture-contract defect, downstream symptom, verifier defect or inconclusive execution. Retain the original historical result. Matching names or equal test blobs alone cannot establish equal causes.

## 3. Work packages and dependencies

| Package | Concrete outcome | Existing ownership to use | Model inputs | Dependencies / parallel work |
|---|---|---|---|---|
| A. Participant release and control-authority recovery | A recoverable authority refusal has a correct producer-to-consumer path and a retained continuation, without a circular traffic-readiness prerequisite | Existing seed/participant release, control-fact producer, runtime lifecycle and reconciliation owners | M1, M4 | First high-leverage investigation. Source changes coordinated with B wherever they touch the same lifecycle/release interaction. |
| B. Exact physical effect and cleanup lifetime | Delayed old-generation work cannot act on a successor; uncertain native work retains custody until its owner settles it | U1 creation/retirement, physical lifecycle, transport and storage cleanup owners | M2 | Direct U1 safety work. Analysis can run alongside A; disjoint implementation only after shared boundaries are settled. |
| C. Placement authorization through membership admission | The existing sanction is consumed at a current, valid effect boundary and a shared overflow allowance cannot be spent twice | Existing spread-cure authorization, operation history, partition budget and committed-membership owners; coordinate with FreshMG | M3 | Read-only mapping can start immediately. Native end-to-end qualification needs an engaging formation/release path. |
| D. Transaction outcome and replay continuity | Historical committed decisions survive coordinator turnover; prepared work and replay evidence survive topology handoff; record reclamation cannot recreate accepted work | Existing TX1, TX2, transaction coordinator, participant apply, outcome/replay and snapshot owners | M5, M6, M8 | Continue established TX1 prerequisites before TX2 topology changes. Review replay/retention interactions as separate increments rather than one large rewrite. Shares handoff requirements with E. |
| E. Snapshot/CDC continuity | Snapshot-to-stream and topology handoffs maintain explicit coverage for each relevant stream and lineage; missing history cannot masquerade as completeness | Existing snapshot, CDC delivery/retention, message-group and cache owners | M7 | Source/contract review can run alongside D. Joint handoff verification before accepting topology/replay continuity. |

This is a dependency graph, not a mandatory A→B→C→D→E serial chain. A and B are the immediate investigation priorities. Existing TX1 safety work should not be stopped merely to preserve a neat project sequence. One writer owns each changing interaction; independent interactions may proceed in parallel.

Within D, separate decision finality, topology handoff and replay-record reclamation. Within E, separate same-lineage snapshot/watch continuity from lineage-changing split/merge. Each accepted increment preserves the preceding contract and identifies what it does not yet prove.

## 4. First bounded unit: participant release/control authority

### Proposed claim

When documented intact-storage, quorum and dependency prerequisites are available, and topology/scheduling satisfy the stated progress assumptions, existing owners can establish the required control-authority fact and re-enter participant release without depending on the external traffic readiness that recovery is meant to establish. Missing or unavailable authority never grants release. Admitted obligations remain recoverable across notification loss and restart. External traffic still waits for the existing configured admission conditions.

This is a claim to reconcile with the existing seed/participant-release seal, **not permission to bypass it**. A cycle is a hypothesis, not the established cause of `current_control_owner_fact`.

### Investigation deliverables

1. One exact-source causal trace from the original first refusal to the real fact producer and its durable origin, including construction, registration, publication and handoff.
2. A diagram or table of **blocking prerequisites** for that interaction. Distinguish permission, authoritative evidence, cached observation and wake. Do not require the entire feedback-driven architecture to become acyclic.
3. A real-owner deterministic witness that engages the suspected failure; or reviewed evidence that the suspected mechanism is already prevented and identification of the actual divergence.
4. A bounded contract change, if needed, stating precisely which existing decision/path is repaired or removed. No new architecture merely because the first hypothesis was plausible.

### Source-change gate

Before production changes, independently review the proposed contract and the failing witness. Record the complete operation:

`trigger -> current authoritative facts -> permitted effect -> durable commit point -> lost-response/restart behaviour -> remaining obligation and release owner`

If the witness fails in setup, imports, unavailable infrastructure or an unrelated assertion, it has not established the target defect. If the hypothesis is refuted, append that result and redirect the investigation rather than force a patch.

### Acceptance scenarios

- Fresh formation and intact restart take their legitimate, distinct existing routes; the readiness gate does not open early.
- Temporary inability to observe an existing authority never grants fresh-storage initialization or cleanup.
- Known destructive loss is handled through its existing recovery/operator contract, not as an intact reopen.
- Replacement, shutdown, membership change or a relevant generation change during an await cannot authorize a stale effect.
- A dropped or duplicated notification and a restart at the measured boundary do not discard admitted debt; the same owner reconsiders it when prerequisites return.
- Lost answers after durable action are recovered without inventing failure, duplicating a non-idempotent action or erasing committed facts.
- Bounded pressure refuses new work where necessary but preserves accepted obligations and gives critical recovery a fair continuation. Existing caller deadlines do not silently restart.

Demonstrate both a safe refusal and actual eventual progress under explicit finite-failure assumptions. A design that refuses everything is not accepted. Conversely, permanent quorum loss is not a promise of eventual availability.

Use targeted source regressions to show the test detects the claimed safety and progress defects. The negative must fail at its intended assertion, not at setup or timeout before the relevant operation runs.

## 5. One proof ladder, reused for every package

The plan does not create a new verifier or runner. Use existing machinery and preserve these distinct evidence ceilings:

| Gate | What is required | What it does not establish |
|---|---|---|
| Contract and source correspondence | Named owners, current source hashes, real entry path, identity domains, commit/settlement points, assumptions and affected seal | Production correctness from a design alone |
| Deterministic real-owner witness | Existing production owners and real persistence/adapter boundary where claimed; actual intended first effect and invariant observed | Cross-host/process or hardware behaviour not exercised |
| Discriminating regression | Unchanged positive oracle detects the deliberate source-level defect for the intended semantic reason | Unbounded state-space coverage |
| Exact-candidate composition | Approved deltas composed once; canonical metadata, relevant focused/interaction checks and required change selection run on that SHA | Release-wide coverage from a narrow selection |
| Physical distributed witness | Existing lab/GCP harness, actual required fault domains, restart/loss/pressure scenarios, complete logs and cleanup | Power-loss/storage-controller certification from a process kill |
| Existing acceptance and publication | Independent exact-head verdicts, original U1/TX1/epic requirements, full required corpus, certification and publication procedure | Authority to weaken or skip other release gates |

FoundationDB's official testing documentation reinforces the distinction: deterministic simulation, live performance tests and hardware-based failure tests are complementary. Do not undertake a simulator rewrite before using Lagrange's existing deterministic seams and harness.

Behavioural harnesses execute in the authorized test environment. A Solver `doneWhen` probe reads the preserved results; it must not start infrastructure under the guise of measuring them.

Relevant source changes invalidate affected evidence. Freeze certification candidates, inspect failed first runs, and do not rerun unchanged bytes simply to obtain a streak of green. Retain any existing explicit consecutive-run requirement and its exact topology; this plan does not replace it.

## 6. Parallel execution and integration discipline

Assign one integration owner, a writer for each non-overlapping owner interaction, and an independent reviewer. These are roles, not required new hires or a fixed number of agents.

Suggested initial allocation:

- Primary investigation: A, from the control-authority refusal to its actual producer and enabling path.
- Direct U1 safety review: B, including sink-side fencing and cleanup settlement.
- Parallel read-only review: existing TX1/TX2 outcome, manifest, replay handoff and reclamation obligations; CDC lineage/coverage requirements.
- Isolated maintenance: already demonstrated fixture corrections and the source-conformance scanner, preserving the policy and testing real violations. No production fallbacks to satisfy incomplete doubles.

Parallelize by the authority being changed, not by filename or number of failed tests. Two agents modifying separate files on opposite sides of one contract are still competing writers unless a single owner has assigned compatible changes.

Every execution task names exact base SHA, permitted source scope, invariant, entry path, witness, output artifact and stop condition. Task scheduling may use Harnessd; contracts and accepted results stay in Lagrange's existing repository records. No task-system status is a substitute for a test or verifier receipt.

Merge an accepted correction into one selected candidate, refresh generated artifacts through their producers, and test its affected composition before integrating another overlapping change. Do not treat a branch name or a GitHub mergeable flag as acceptance.

## 7. Durable planning artifacts

This plan is persisted at `solve/epics/raft-rs-full-cutover/insight-execution-plan-2026-10-20.md`. Start continuation from [the handover](HANDOVER-2026-10-20-insight-plan.md) and [the initial proof matrix](insight-proof-matrix-2026-10-20.md). The source-bound review and original model evidence (`evidence/insight-review-2026-10-20/README.md`) are preserved byte-for-byte from the earlier verification packet.

Place the reviewed source manifest, abstract model inputs and their limitations under the existing epic/Quest evidence conventions. Link from the existing historical failure ledger. Findings and verdicts append to the owning Quest's log; preserve historical records and add corrections rather than rewrite them. Reuse existing closure/evidence indexes rather than maintain duplicate per-agent truth.

This persistence change is planning/evidence only. It should state the rejected alternatives so future work does not rediscover and rebuild them: parallel metadata/control plane, generic workflow replacement, collapsed epochs, cache-derived authority, timeout-based finality, global CDC maximum and uncoordinated replay-record TTL.

The planning matrix needs three independent verdicts for each claimed fix: **safety**, **recovery progress**, and **resource/latency behaviour**. A fail-closed stall may be safe but not recovered; a fast successful run may have no meaningful race coverage.

## 8. Milestones and completion criteria

**M0 — executable plan established.** Current candidate and preserved anchors named; review linked under the existing epic; first package has owner, scope and source-bound question; relevant historical failures mapped. No global census project is required before proceeding.

**M1 — first systemic interaction closed.** A or B has a demonstrated production defect repaired, or a reviewed exclusion/already-protected result; where repaired, the original witness is green, its deliberate regression is meaningfully red, safety and progress are both engaged, and applicable source changes are independently approved. Unresolved first failures remain open.

**M2 — safe composition.** Applicable packages and existing U1/TX1/FreshMG requirements are reconciled at one candidate. Every relevant historical failure is causally classified and required failures are repaired, not waived as inherited. Joint transaction/CDC/topology obligations have end-to-end witnesses where in scope.

**M3 — existing certification satisfied.** Required full corpus, static gates, exact-head physical formations/fault scenarios, independent closeout and publication pass through the current owners. No claim of merge/release until those owners say so. Follow-ups cannot conceal a failure of a supported required contract.

Progress should be reported as contracts with source-bound proof and failures causally resolved—not file count, lines changed, abstractions added, or green component totals.

## 9. Immediate recommendation

Persist this plan and the review beneath the current epic, reconcile the candidate, and start the participant-release/control-authority investigation together with the existing U1 exact-custody review. Keep transaction and CDC analysis parallel where source ownership permits. Approve the first bounded contract and real-owner discriminator before widening production scope.

Do not wait for a grand redesign. Complete one whole operation, demonstrate why its former failure cannot recur under the stated model, and reuse that verification discipline for the next interaction.

## Sources and currentness

Repository reads for this plan:

- U1 branch resolves to `be25caa5f0c3612feec662d4feaa9ba28f8f34df`.
- `solve/epics/raft-rs-full-cutover.md`, same source anchor; blob `c6f6af31a414f78f971b88eb8bef182e40cff972`.
- `solve/epics/raft-rs-full-cutover/closeout-plan-2026-10-17.md`, same source anchor. Its dated status snapshots are historical; the plan retains its acceptance constraints without treating old branch statuses as current.
- `docs/steering/workflow-guidelines/solver-quests.md`, same source anchor; blob `54a43a1a0485d788bb87455cb53a9b354f313c39`.
- Historical research PR #141 was open, draft and unmerged when read, head `bdc94775708e357c5b0129fded70be4cea48079b`. This is a research/evidence input, not approval.
- Previously inspected canonical authority/recovery, runtime and system-model contracts are bound in the supplied architecture review. The local review and abstract-model input hashes are retained separately in `insight-execution-inputs-2026-10-20.json`.

External primary source, checked 2026-10-20: FoundationDB, Simulation and Testing — https://apple.github.io/foundationdb/testing.html . Used only to corroborate complementary proof modalities, not to establish Lagrange implementation status.

## Planning decision recorded on 2026-10-20

The operator approved this direction and requested a committed, pushed plan and a handover. Existing source and acceptance authorities remain unchanged. The eight abstract checks were re-executed during preservation with byte-identical JSON output; that result does not run or certify Lagrange. The execution candidate must still be selected against live branch and owner state before production work. No new Quest was sealed, source task launched, main merge performed, or U1/TX1/activation acceptance granted by this planning publication.
