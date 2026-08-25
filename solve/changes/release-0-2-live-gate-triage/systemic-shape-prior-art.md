# CL-044 systemic-shape and prior-art analysis (altitude memo)

Read-only research for the `formation-barrier-spread-cure-liveness` quest
decision (quest file does not exist yet — CL-044 is record-before-code).
Anchors: `solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-044.md`,
`solve/changes/release-0-2-live-gate-triage/run4-analysis.md`.
Directive honored: assume the defect is sneakier and more systemic than the
surface mechanism; no code designed here.

---

## 0. Executive verdict (one paragraph)

The systemic defect is not the timer pacing and not the settle-gate
misclassification individually — it is an **unowned three-owner interaction
whose release predicate was silently re-scoped four days before the red run**.
Commit `d29c7d8c8` (2026-08-21, "refactor: enforce single-owner runtime
contracts", no quest, empty commit body) replaced the joiner barrier's
partition-scoped release legs (operation-ledger spread proof + self-op drain)
with the global scalar `startupAuthorityReady === true`
(`src/bootstrap/node-joining-operation-ledger-formation-readiness.js:51-53`).
That widened what the 120s fail-closed hold waits for — from "the one partition
this hold protects is spread" to "every priority recovery reason in the whole
control plane is clear" — while the budget (120s,
`node-joining-constants.js:37`), the cure pacing (70-120s granularity), and the
settle-gate classification all stayed sized for the old scope. Run 4 proves the
delta is binding: `replica_operations-p1` (the old predicate) cured at
06:05:07, ~37s after the 06:04:30 latch — comfortably inside budget — while the
new predicate additionally required `sql_write_operations-p1`, still 2/3
distinct at 06:06:55 (run4-analysis §"stall window"). The seam has **no owned
contract artifact** (doctrine §18 violation, details §3), so per the recorded
CoupledAdmission proof any single-seam patch is expected to ping-pong. The
best-precedented cut is: seal the seam with a decision table + TLC pair first,
then land the settle-gate classification fix (b) and the cold-formation event
cadence (a) **together** as one atomic cross-owner reconcile, with the
predicate-scope question (c2) put to the operator as an explicit owner
decision — not silently reverted, and not silently kept.

---

## 1. Lane 1 — authority-flip semantics

### 1.1 The flip itself is correct; the joiner's consumption of it is not

The startup authority resolves its state as a pure scalar predicate with **no
formation/cohort qualifier**:
`src/control-plane/startup-authority-snapshot-owner.js:536-541` —
`state = blocked ? BLOCKED : (priorityRecoveryReasonCodes.length > 0 || activeGateRecoveryBlocksReadiness ? RECOVERY_PENDING : READY)`.
Any priority reason (`priority_partitions_not_spread` from
`src/control-plane/publication-recovery-gate.js:382-384`) flips the whole
cluster's authority verdict. For its *other* consumers (serve-eligibility,
admission, settle) that flip is semantically right: the priority partitions
genuinely are concentrated on <3 nodes the instant the 3rd node activates. The
defect is that the **joining cohort now consumes the same unqualified scalar as
its release condition**
(`node-joining-operation-ledger-formation-readiness.js:41-54`: release iff
`snapshot.startupAuthorityReady === true`), so a cohort's own mid-formation
state withholds that cohort's own release — formation classified as recovery,
mid-cohort, with the cohort inside the blast radius.

### 1.2 How the coupling got there (the sneaky part)

History of `src/bootstrap/node-joining-operation-ledger-formation-readiness.js`:

- `2f0cd4f1e` (2026-08-10, quest `formation-barrier-release-snapshot-coherence`)
  — barrier releases on **partition-scoped** evidence: settled ledger spread +
  self-operation drain, evaluated in one coherent snapshot; states
  `waiting_for_ledger_spread` / `waiting_for_ledger_observation` /
  `waiting_for_ledger_operation_drain`; explicitly recorded fail-closed floor.
- `d29c7d8c8` (2026-08-21, "refactor: enforce single-owner runtime contracts";
  a broad multi-subsystem refactor, 396 lines deleted from this file, **no
  quest, no falsifier, no feasibility argument in the commit body**) — the
  partition-scoped legs (`spreadProofComplete`, `inFlightOperationCount`,
  owner-RPC placement evidence) are deleted and replaced by the authority
  scalar. The only recorded trace is the updated owner-map row
  (`architecture/current-owner-maps.md`, "Startup authority snapshot" row): *"the
  cold-formation barrier owns only cohort engagement/liveness and consumes this
  verdict unchanged."*

So the coupling **is** a recorded single-owner contract — but the contract row
records the delegation, not its liveness consequence (hold budget vs the
widened release path's worst-case duration). The first red with the 3/5-active
signature is dated 2026-08-21 (run4-analysis §1), the same day the refactor
landed. This is the "sneakier than the surface mechanism" core: the
event-cadence and classification defects **pre-existed** (the event-wake quest
measured the 70-80s dead window on 2026-08-10), but they only became
budget-fatal when the predicate widening multiplied the work the 120s hold
waits for by six partitions plus publication/active-gate state.

### 1.3 Existing formation-cohort concepts — half the pattern exists

- **Placement eligibility already has the cohort concept.**
  `src/rebalancer/unified-rebalancer-available-nodes.js:33-77` —
  `ALLOW_RECOVERY_COHORT` admits JOINING nodes as spread targets while priority
  recovery is open (run 4 confirms: cure ADDs landed **on** barrier-holding
  node-3). The oscillation research calls this "the intended circularity cut,
  first-class and always on"
  (`solve/changes/formation-barrier-spread-release-oscillation/RESEARCH.md`,
  "The spread (seed side)").
- **Startup-mode identity already has a model.**
  `models/durable-rejoin-formation-barrier/DurableRejoinFormationBarrier.tla` —
  proves "a durable rejoin is an existing member reentry, not formation;
  peer ready-lease quarantine must not latch that barrier." This is the repo's
  own precedent that *joiner identity must be a first-class input to
  classification*; CL-044 is the mirror image (a formation cohort must not be
  classified as recovery), and no model covers that direction.
- **The settle gate and the authority have NO cohort concept.** The settle
  gate's classifier (`unified-rebalancer-critical-topology-methods.js:85-105`,
  `144-172`) knows only READY / UNREADY_ACTIVE / TRANSITIONAL / FAILED — a
  barrier-holding joiner publishing CONNECTED heartbeat-only liveness
  (`node-joining-operation-ledger-formation-readiness.js:139-161`) is
  indistinguishable from a wedged node. Grep for
  `formation-cohort|cohort barrier|formation-grace` in src/ hits only the
  barrier file itself. The "formation-grace" quest
  (`solve/quests/formation-grace-parallel-start-hardening.json`) is a
  different concept: a 15s observation-retention grace across transient
  evidence-absent reads — not a cohort-classification qualifier.

### 1.4 Is the seam owned? **No — doctrine §18 violation confirmed**

Checked every contract surface doctrine §18 names
(`docs/steering/doctrine/owner-boundaries.md:119-149`):

- `docs/specs/decision-tables/*.json` — 8 tables; `operation-ledger-hold-engagement`
  covers admission holds x move classes, `replica-placement-cure-condition`
  covers cure conditions x move types. **None names the joiner READY-lease hold,
  the settle-gate node classification, or the authority-verdict-for-joiners.**
- `models/CL-INDEX.md` — CoupledAdmission (CL-028), ReadinessStarvation
  (CL-001/CL-036), PrioritySpreadCoverage, DurableRejoinFormationBarrier,
  FormationScheduleFeasibility all border the seam; **none binds "joiner hold
  release path reachable within its fail-closed budget."**
- `architecture/contracts/` — `readiness-handoff-liveness.md` covers the
  startup runtime handoff owner, not this hold.
- `test/shards/impact-contracts.json` `coupledPairs` — pairs exist for
  planner-retention x admission-hold etc.; **no bootstrap-barrier x rebalancer
  pair.**

Conclusion of lane 1: yes, the flip-consumption is the systemic defect, and the
fix must first seal the seam with a contract artifact (DT + TLC pair per the
`models/CL-INDEX.md` procedure) in the same body of work.

---

## 2. Lane 2 — the three candidate cuts

A precise mechanism note first, because it changes the (a)-vs-(b) weighting:
the dead windows come from **two distinct pacing laws**, and the landed
event-wake (`d75b01706`) covers neither of the ones that bound run 4:

1. **Blocked-branch flat sleep** — non-priority entities parked behind the
   spread blocker draw `getBackgroundPrioritySpreadReleaseDelayMs()` = 70s
   stable window + [0,10s) jitter
   (`unified-rebalancer-policy-scheduler-methods.js:208-217`, consumed at
   `rebalancer-priority-recovery-planning-gate-methods.js:275-277`). The
   d75b01706 wake (`registerBackgroundPrioritySpreadStableReleaseWake`, :275)
   fires on *stable release after the gap clears* — it does nothing while the
   gap is still open.
2. **Settle-gate escalating deferral** — the rebalancer-leader's
   critical-system planning defers via `increaseCurrentInterval(WAIT)`
   (`rebalancer-planning-gate-methods.js:427-430`; run 4: 5000 → 75000 x39 →
   120000 x38). Crucially the escape ladder in
   `rebalancer-planning-gate-constants.js:137-160` puts
   `TOPOLOGY_OPERATION_TARGET_IN_FLIGHT → DEFER_PLANNING` (:142-148, :169-171)
   **above** `PRIORITY_RECOVERY_OPERATION_CREATION_REQUIRED → ALLOW` (:149-155):
   when the unready node named by the blocker is itself the cure's
   operation-creation target, planning defers. Reasonable anti-duplicate-mint
   in steady state; in cold formation it is literally doctrine §18's "a hold
   deferring the cure its own policy documents", because the target's readiness
   awaits the barrier, which awaits the authority, which awaits this cure.

### (a) Event-cadence cure actuation during cold formation

Extend the event-wake law (operation-terminal / placement-eligibility edges
re-run evaluation; wakes replace dead timer time only) to the two parked states
above.

- **Systemic soundness**: correct *within its family* — it is the exact
  obligation the GCP soak names (`wait mode event_driven`,
  `create_recovery_operation` never actuated) and the open
  `blocked-spread-evaluation-event-wake` quest owns the law and its fail-closed
  floor (the 70s post-clear stability window is a recorded oscillation cure and
  is untouched by wakes that replace *pre-release* dead time).
- **Ping-pong risk if shipped alone: HIGH.** Faster re-evaluation of a gate
  that still returns DEFER (the settle-gate state table) produces faster
  deferrals, not cure operations. Run 4's binding chain passes through the
  classification defect; (a) alone re-runs the same wrong classification at
  event cadence.
- **Blast radius**: medium — touches scheduler/tracker plumbing already
  hardened by d75b01706; the storm risk (CL-034 projection-rebuild-storm class)
  requires wake coalescing.

### (b) Settle-gate classification fix

Barrier-holding joiners with valid spread-target eligibility must not be
counted as `NODE_READY_LEASE_INCOMPLETE` planning blockers
(`unified-rebalancer-critical-topology-methods.js:144-172`), and/or the
`TOPOLOGY_OPERATION_TARGET_IN_FLIGHT` defer row must not fire when the
"in-flight target" is a formation-cohort member whose readiness awaits this
very cure.

- **Systemic soundness**: this is the circularity cut, and it is the recurrence
  of a *named* repo pattern: "two owners disagreeing about actionability" (the
  event-wake quest statement recorded the admission scan counting only
  `connection_state=ready` while placement eligibility accepts JOINING). Here
  the same rebalancer that **admits** joiners as cure targets
  (`unified-rebalancer-available-nodes.js:35,51-53`) **counts** them as
  planning blockers one method over. Single-owner doctrine says one truth about
  a joiner's actionability.
- **Ping-pong risk if shipped alone: MODERATE.** With classification fixed but
  pacing untouched, the 70-80s flat sleeps on the blocked branch still exist;
  whether cure completion fits 120s becomes schedule arithmetic
  (`models/formation-schedule-feasibility/` exists precisely because such
  arithmetic must be proven, not assumed). Also risk of migrating the binding
  constraint to the admission owner (over-target cap, ledger-quorum-spread
  hold) — the §16 failure-migration shape.
- **Blast radius**: the settle gate protects planning from acting over
  genuinely broken topology; the exemption must be keyed to *actuals* (the
  joiner's published CONNECTED heartbeat-only liveness + spread-target
  validity), never to targets or to blanket "formation mode" (c-actuals
  constraint, `formation-ledger-quorum-spread-first.json`).
- **Precedent warning**: CL-036's landed quorum escape at the same locus
  (:154-160) is recorded as **inert exactly when the spread gap is open**
  (`shouldRequireFullControlPlanePublicationEndpointVisibility()` returns true
  whenever `priorityRecoveryActive`,
  `unified-rebalancer-control-plane-readiness-methods.js:379-401`). A second
  escape bolted beside an inert first escape, with no contract artifact, is the
  parallel-path smell — (b) should *replace/refine* the classification, with
  the DT settling which escape owns which edge.

### (c) Authority/altitude cut

Two distinguishable forms:

- **(c1) Suppress or qualify the flip itself** (authority stays `ready` or
  gains a `formation_pending` state while a joining cohort is mid-formation).
  **Reject.** The authority scalar gates serve-eligibility, admission, and
  settle cluster-wide; masking a genuine concentration state during formation
  is the "formation fast-path masking a real recovery" trap, and it is
  anti-precedented in production systems (§4: nobody suppresses the health
  signal; they make classifiers consume staged member identity). It would also
  weaken the recorded serve-eligibility semantics that the
  `spread_satisfied_in_flight` carve-out at
  `startup-authority-snapshot-owner.js:516-535` was carefully argued around.
- **(c2) Re-scope what the *joiner cohort* consumes** — the authority owner
  itself answers a formation-qualified question for barrier release ("are the
  recovery reasons that remain attributable solely to this joining cohort's own
  incomplete formation?" or the pre-d29c7d8c8 partition-scoped question,
  answered by the readiness owner rather than by bootstrap-local reads).
  **This is the altitude fix that matches the actual causal delta** (§1.2), and
  it can be done without violating the owner-map contract: the barrier still
  "consumes the verdict unchanged" — the *verdict* gains a cohort qualifier
  inside its single owner, exactly as `DurableRejoinFormationBarrier` gave the
  barrier a startup-mode qualifier.
- **History check (was cohort-aware formation attempted/rejected?):**
  - `formation-grace-parallel-start-hardening` — no; its scope was observation
    retention grace + parallel container start + the 60s operator window; the
    barrier's release predicate was untouched (constraint
    `sealed-formation-guards-verbatim` kept dt6 guards byte-stable).
  - `formation-ledger-quorum-spread-first` — no cohort qualifier either, but
    its verifier finding is directly on point: deferring the
    planner-gate-consults-concentration extension was traced as a **"REACHABLE
    PERMANENT WEDGE: the hold itself sustains
    PRIORITY_CONTROL_PLANE_RECOVERY_PENDING by blocking non-emergency priority
    cures... cure never planned, hold never releases"**
    (`solve/log/formation-ledger-quorum-spread-first.ndjson:2`). The repo has
    already once proven, at the ledger-placement level, that this seam wedges
    when the cure's planning gate consumes states the hold sustains. CL-044 is
    the same theorem one level up.
  - Nothing in the quest ledger records cohort-aware *authority* classification
    being attempted and rejected. The predicate widening in d29c7d8c8 was a
    refactor-lane change, not a deliberate rejection of cohort awareness.

---

## 3. Lane 3 — interaction-contract completeness (the CoupledAdmission test)

`models/readiness-starvation/CoupledAdmission.tla` (CL-028) is the recorded
proof that two definitionally-coupled invariant families with overlapping
green-ranges oscillate under single-frontier patches, and only an atomic
whole-system reconcile settles both (`EventuallySteady` fails without
`AtomicReconcile`, :78-97, :128-148). Map CL-044's three owners onto it:

- **Family A (hold)**: barrier green ⇔ authority ready within 120s of latch.
- **Family B (classification)**: settle gate green ⇔ no unready
  active-authority nodes — *defined over A's subjects* (the joiners' missing
  ready leases).
- **Family C (actuation)**: cure lane green ⇔ planning evaluated while the gap
  is open — *gated by B's deferrals and paced by the blocked-branch law*.

A is defined in terms of C's output (authority ready needs the cures); B is
defined in terms of A's subjects; C is gated by B. That is the CoupledAdmission
shape with three knobs instead of one. Predictions it licenses:

- **(a) alone**: C re-evaluates fast but B still defers → A still times out.
  Whack-a-mole toward "wake didn't cover state X" (already happened once:
  d75b01706 covered the stable-release edge, CL-044 is the uncovered
  cold-formation edge).
- **(b) alone**: B greens, cures mint, but C's flat sleeps and the admission
  holds become binding; a slow box (run 3's `replica_operations_in_flight=4`
  contention shape) re-reds A. Failure migrates to the admission owner.
- **(c2) alone**: A greens on the ledger-scoped predicate (run-4 arithmetic:
  release ≈ 06:05:07), joiners publish leases, B's blocker dissolves
  (subjects become ready), C unwinds — **the only single cut that
  mechanically collapses all three families in run 4's exact state**. But it
  leaves B and C latently wrong for the *next* edge (a 7-node GCP soak where
  even the ledger-scoped cure needs the event cadence — the soak reds show the
  actuation obligation failing with four system partitions
  `eligible_but_no_operation_created`), and it re-opens the question
  d29c7d8c8 answered (what does the barrier actually protect?).

**Minimal set that must change together**: (b) + (a) are one atomic pair — the
classification family and the actuation family jointly constitute "the release
path is reachable within budget" for the current predicate, and the CL-044
falsifier already asserts both plus the end-to-end budget (assertions a, b, c).
Shipping either alone is the single-frontier patch CoupledAdmission forbids.
(c2) is severable — it is a *predicate-scope decision*, not a third frontier —
and can safely ship alone **only** as an explicit operator decision with its
own recorded feasibility argument; it does not substitute for (b)+(a) because
the GCP soak evidence shows the actuation defect binds even where the barrier
edge differs.

What can safely ship alone: nothing inside the seam. The only safely-alone
change is the contract artifact itself (DT + TLC pair), which is
record-before-code anyway.

---

## 4. Lane 4 — production prior art (named mechanisms)

How mature systems keep "new member joining" out of "cluster needs recovery,"
and keep cure actuation event-driven with stability windows:

- **etcd — raft learners + gated promotion.** `member add --learner` adds a
  non-voting learner; it is excluded from quorum math and health classification
  by *identity*, and `member promote` refuses until the learner's log is caught
  up. The joining state is a first-class lifecycle stage the rest of the
  cluster's health logic consumes; a join can never present as a quorum/health
  degradation.
- **Kubernetes — provisioning identity + readiness gates + stabilization
  windows.** A registering node is `NotReady` without putting the cluster into
  any recovery mode — schedulers *exclude* it, they do not *alarm* on it;
  Cluster Autoscaler tracks freshly-provisioned nodes in an expected-to-appear
  set with `--max-node-provision-time` grace so "still coming up" is
  structurally distinct from "unhealthy." Pod `readinessGates` separate
  placement from serving-readiness (Lagrange's CREATE_REPLICA-on-joiners
  already mirrors this). HPA's `stabilizationWindowSeconds` is the canonical
  split CL-044's fail-closed floor demands: the control loop **evaluates at
  event/short cadence** while the **decision** carries the stabilization
  window — the window never paces evaluation.
- **CockroachDB — learner-first replica addition + liveness-vs-rebalance
  separation + event-driven replicate queue.** Replicas are added as
  non-voting LEARNERs then promoted via joint consensus; the allocator
  distinguishes recovery (dead/decommissioning stores, gated by
  `server.time_until_store_dead` ≈ 5min stabilization) from rebalancing
  (diversity), so a store that just appeared is an *opportunity*, never a
  *fault*. The replicate queue is per-replica and **event-woken** (liveness
  edges, span-config changes) with a periodic scanner as the fallback — the
  exact "wakes replace dead timer time, fixed-cadence fallback stays" law the
  event-wake quest recorded.
- **TiKV/PD — staged store states.** Stores are Up / Down (after
  `max-store-down-time`) / Offline / Tombstone; recovery replication triggers
  only on the *timed-out* Down classification, never on a store that is
  joining/restarting. Joint consensus (5.0+) makes add-then-promote atomic.
- **Consul — autopilot `server_stabilization_time`.** A new server joins as a
  **non-voter** and must be healthy and stable for the window (default 10s)
  before autopilot promotes it to voter. While a non-voter, it is excluded
  from quorum health entirely. This is the cleanest single-mechanism analog to
  CL-044: *joiner identity is a first-class classification input with a
  stabilization-window promotion, so cluster-health assessment definitionally
  cannot classify a joining server as a fault.*

**The invariant all five share**: membership change is a staged lifecycle
(learner/non-voter → promotion), and *health/recovery classifiers consume the
stage*. None of them suppresses the health signal during joins (anti-(c1));
none of them lets the join wait on global health (the etcd learner does not
wait for the whole cluster to be "not recovering" before catching up — it
waits on *its own* log gap, the analog of the pre-d29c7d8c8 partition-scoped
predicate). And all of them run cure/rebalance actuation event-driven with
stabilization on decisions (pro-(a) with the recorded floor).

**Cleanest mapping onto CL-044**: Consul's non-voter classification exclusion
maps onto cut (b) (the settle gate must classify barrier-holding cohort members
as their own stage, not as unready-active blockers); etcd's learner-waits-on-
its-own-gap maps onto (c2) (the joiner hold waits on the evidence the hold
protects, not on global health); CockroachDB's replicate queue maps onto (a).

---

## 5. Lane 5 — verdict

### Recommended cut

1. **Seal the seam first (same change, doctrine §18)**:
   - A decision table (`docs/specs/decision-tables/`) owning
     **formation-cohort member classification**: inputs (node stage:
     barrier-holding-cohort-member / durable-rejoin / unknown-transitional /
     failed; spread-target validity: actual placement-eligible or not;
     recovery lane active or not) x outputs (settle-gate blocker verdict,
     planning action, cure-target admissibility), with invariants
     "the hold's own subjects are never its release path's planning blockers"
     and "an undeclared stage fails closed to defer" — settling in one artifact
     the argument currently split across
     `unified-rebalancer-critical-topology-methods.js:144-172`,
     `rebalancer-planning-gate-constants.js:137-171`, and
     `unified-rebalancer-available-nodes.js:33-77`.
   - A TLC bug/fixed pair per `models/CL-INDEX.md` binding the CL-044
     invariant: *a joiner READY-lease hold's release path is reachable within
     its own fail-closed budget* — modeled with the cohort qualifier
     (DurableRejoinFormationBarrier is the template) and the pacing/
     classification toggles (bug cfg: timer-paced + circular classification →
     budget exceeded; fixed cfg: event cadence + cohort classification →
     `EventuallyReleased` within budget). This is exactly the design-class the
     index says scenario reruns can never prove fixed.
2. **Land (b) + (a) together** as the atomic cross-owner reconcile, under the
   CL-044 falsifier (assertions a+b+c jointly, fake clock proving no timer wait
   is load-bearing) and the recorded floors: the 70s post-clear stability
   window untouched; fixed-cadence fallback timers retained; no budget raises.
3. **Raise (c2) as an explicit operator decision**, not code: was d29c7d8c8's
   widening of the barrier release predicate from ledger-spread to global
   authority-ready an intended semantic change or a refactor side-effect? If
   intended, the feasibility obligation transfers to (b)+(a) and the TLC model
   must prove the 120s budget covers the whole-plane cure under event cadence
   (FormationScheduleFeasibility's lesson: schedule arithmetic is proven by
   TLC, not assumed). If unintended, restore partition-scoped release **inside
   the authority owner** as a formation-qualified verdict (owner-map contract
   preserved; the barrier still consumes one owner's verdict unchanged). Do
   not decide this inside the quest silently — it reverses a recorded
   single-owner contract row from four days before the red.

### Why the not-chosen cuts are worse

- **(a) alone**: re-runs a wrong classification faster; ping-pongs to "the
  wake didn't cover state N+1" (already the second uncovered-state iteration);
  risks wake storms against the CL-034 precedent.
- **(b) alone**: leaves flat 70-80s dead windows in the blocked branch; the
  120s-budget arithmetic stays unproven; failure migrates to admission holds
  (§16 shape); and bolting a second escape beside CL-036's recorded-inert one
  without a DT is the parallel-path smell (`no-dual-forms` memory rule).
- **(c1)**: suppresses a true health signal cluster-wide; anti-precedented
  everywhere (§4); weakens the serve-eligibility floor argued at
  `startup-authority-snapshot-owner.js:516-535`.
- **(c2) alone**: greens run 4 but leaves the GCP-soak actuation red
  (`eligible_but_no_operation_created` binds without any barrier involvement)
  and leaves the settle-gate circularity latent for the next consumer of
  `node_ready_lease_incomplete`.
- **Budget raise (non-cut)**: forbidden (TEST-0021 constraint recorded in
  `formation-ledger-quorum-spread-first`); would trade a deterministic 120s
  witness for a probabilistic longer stall.

### Does the quest need a decision-table + TLC artifact sealed in-change?

**Yes — mandatory, not optional.** The seam is unowned across every §18
surface (§1.4); CL-044's failure class (hold-without-reachable-release-path,
lost-wake) is precisely the class `models/CL-INDEX.md` declares provable only
by model check; and CL-044 already notes CL-036's guard cannot go red on this
edge, so without a new owned artifact the fix has no red-on-revert witness at
the interaction level.

### Sneakier-than-it-looks checklist (ways a naive fix ships green and is wrong live)

1. **Precondition-never-live DT.** The headless falsifier injects
   `recovery_pending` + barrier-holding joiners but stubs the very predicates
   that made CL-036's escape inert
   (`shouldRequireFullControlPlanePublicationEndpointVisibility`,
   `isPriorityControlPlaneRecoveryActive`) — the guard passes forever while
   the live composition never reaches the modeled state. CL-036's own
   adversarial verification recorded this exact inertness ("the fix is INERT
   exactly when the summary still shows the gap"); the new witness must drive
   the real predicate chain, not a mocked verdict.
2. **Wake storm re-importing the cured oscillation.** Wiring
   operation-terminal/eligibility edges to re-evaluate without preserving the
   70s post-clear stability window (or without coalescing per the CL-034
   rebuild-storm precedent) re-creates the flap the release tracker's window
   cured. Wakes must replace *pre-release dead timer time only*; a wake that
   shortcuts the stability window will pass every liveness assertion and
   oscillate live.
3. **Formation fast-path masking a real recovery.** An exemption keyed to
   "formation mode" or to *all* unready nodes (instead of exactly:
   barrier-holding cohort members, publishing CONNECTED heartbeat-only
   liveness, that are currently valid spread-cure targets by actuals) lets a
   genuinely wedged or partitioned joiner ride the exemption — planning
   proceeds over a node that will never appear, and remove/replace math runs
   against phantom capacity. The exemption inputs must be actuals (c-actuals:
   targets never gate liveness).
4. **Joiner-as-target admitted but the target evaporates.** Run 4 shows cure
   ADDs landing on barrier-holding node-3, and the barrier's timeout tears the
   joiner down to `stopped` with `preserveForResume` rejoin. A cure operation
   mid-flight against a joiner that fail-closed-times-out mid-operation must
   not strand the operation non-terminal (the operation-ledger-terminal-hold
   model's territory) or count the vanished target's replica toward spread
   (`SpreadNeverRegresses`, incremental-replace-spread). The fix makes this
   window *narrower* but more *frequent* (more ops target joiners sooner).
5. **Budget or waiter raised instead of the release path fixed.** Raising
   `priorityPlacementFormationTimeoutMs` (120s), the settle deferral cap, or
   the demo's 180s waiter goes green on the box and leaves the dead-window law
   intact — explicitly forbidden, and it converts a deterministic witness into
   a flake.
6. **Green-by-race witness.** The live witness without the deterministic
   10-15s joiner stagger passes by landing all four joiners pre-flip (run 1's
   split) and never exercises the 2/2 latch. The stagger is load-bearing; a
   "flaky, removed for stability" edit to the witness silently deletes the
   theorem.
7. **Fixing the wrong parked state (third iteration).** Extending the
   d75b01706 wake to the blocked branch does not touch the settle-gate's
   `increaseCurrentInterval` escalation
   (`rebalancer-planning-gate-methods.js:427-430`) nor the
   `TOPOLOGY_OPERATION_TARGET_IN_FLIGHT` defer row
   (`rebalancer-planning-gate-constants.js:142-148,169-171`) — the exact
   "landed wake doesn't cover this state" gap that produced CL-044 out of the
   d75b01706 fix, recurring one seam over. The DT must enumerate *every*
   deferral lane on the release path; the model's fairness assumptions must
   match the enumerated wakes.
8. **Single-frontier ping-pong into the admission owner.** (b) alone unblocks
   planning that then meets the over-target cap
   (`retain_spread_cure_adds`), the ledger-quorum-spread hold, and priority
   budget admission — the binding constraint migrates and the 5-node gate
   still reds, now with an admission-owner signature (the CoupledAdmission
   A→B migration; `formation-ledger-quorum-spread-first`'s verifier already
   traced one such wedge to a deferred planner-gate extension).

---

## Appendix: load-bearing citations

| Claim | Locus |
| --- | --- |
| Barrier releases solely on authority-ready | `src/bootstrap/node-joining-operation-ledger-formation-readiness.js:41-54,261-266` |
| Cohort engagement latch (>=3 candidates, >=2 pre-ready) | same file `:169-179,245-249` |
| CONNECTED heartbeat-only liveness while holding | same file `:139-161` |
| Authority state = scalar predicate, no cohort qualifier | `src/control-plane/startup-authority-snapshot-owner.js:536-541` |
| `priority_partitions_not_spread` reason production | `src/control-plane/publication-recovery-gate.js:373-385` |
| Settle-gate blocker + CL-036 escape | `src/rebalancer/unified-rebalancer-critical-topology-methods.js:144-172` |
| CL-036 escape inert while recovery active | `src/rebalancer/unified-rebalancer-control-plane-readiness-methods.js:379-401` |
| Flat 70+[0,10)s blocked-branch delay | `src/rebalancer/unified-rebalancer-policy-scheduler-methods.js:208-217` |
| Stable-release wake + delay consumption | `src/rebalancer/rebalancer-priority-recovery-planning-gate-methods.js:275-277` |
| Settle deferral escalation | `src/rebalancer/rebalancer-planning-gate-methods.js:409-444` |
| Target-in-flight row defers above op-creation-required allow | `src/rebalancer/rebalancer-planning-gate-constants.js:137-171` |
| JOINING nodes admitted as cure targets (recovery cohort) | `src/rebalancer/unified-rebalancer-available-nodes.js:33-77` |
| Predicate widening commit | `d29c7d8c8` (2026-08-21), prior form at `2f0cd4f1e` (2026-08-10) |
| Owner-map delegation row | `architecture/current-owner-maps.md` "Startup authority snapshot" row |
| Doctrine §18 text | `docs/steering/doctrine/owner-boundaries.md:119-149` |
| CoupledAdmission oscillation proof | `models/readiness-starvation/CoupledAdmission.tla:1-148` |
| Startup-mode qualifier precedent | `models/durable-rejoin-formation-barrier/DurableRejoinFormationBarrier.tla` |
| Schedule-arithmetic-by-TLC precedent | `models/formation-schedule-feasibility/abstract-protocol.md` |
| Ledger-level wedge verifier trace | `solve/log/formation-ledger-quorum-spread-first.ndjson:2` |
| Owner-disagreement prior art | `solve/quests/blocked-spread-evaluation-event-wake.json` statement; `solve/changes/formation-barrier-spread-release-oscillation/RESEARCH.md` |
