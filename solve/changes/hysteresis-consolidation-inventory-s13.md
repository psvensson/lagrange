# Hysteresis / anti-flap inventory — HEAD `0bbf88ee` (session s13)

Read-only research. Enumerates every distinct hysteresis / anti-flap / debounce /
grace / stability-delay mechanism present TODAY, maps each to the epic's 5-primitive
frame (`solve/epics/hysteresis-consolidation.md`), and reconciles the count against
the epic's "floor N≈4-5" and memory's "11th instance / P2 redundancy 5×" claims.

Scope note: the epic's "~11" was **scoped to the node-liveness/membership cluster**
(P1/P2). This inventory is broader — it also captures hysteresis-shaped mechanisms
in other subsystems (raft timing, partition split/merge, placement scoring, topology
anti-entropy, priority-publication handoff) that the epic did not count because they
are outside its liveness-veto target. They are listed and classed so the "reduce
fragmentation" effort has the full map, but the epic's redundancy claim only ever
concerned the P2 liveness sub-cluster.

## 1. Current inventory table

### A. The node-liveness / membership cluster (the epic's ~11)

| # | Instance | file:line (symbol) | Class | Signal → guarded action | Params | Consolidated? |
|---|---|---|---|---|---|---|
| 1 | ACK-timeout quarantine + liveness window | `transport/message-router-reconnect-behaviors.js:529-556` (`quarantineConnectionAfterAckTimeout`); threshold/window in `transport/message-router.js:77-110` | **P1** (verdict folds to P2-input; **teardown ACTION is irreducible P1**) | ACK-timeout streak vs "recently received from peer" → tear down / skip quarantine | `ackTimeoutQuarantineThreshold`, `ackTimeoutQuarantineLivenessWindowMs` (config) | standalone (correct — irreducible P1) |
| 2 | lease-sweep transport grace | `control-plane/lease-service.js:282` (`isNodeTransportConnected` → `hasLiveTransportEvidence`) | **P2** | lease expired + live transport connected → skip eviction ("slow, not dead", CL-007) | window-free atom | **STAGE 1 — routes `hasLiveTransportEvidence`** |
| 3 | projection transport retention grace | `control-plane/active-node-projection.js:163` (`hasRuntimeTransportEvidence`), retention at `:308-370`, `:530-549` | **P2** | stale heartbeat but transport/readiness evidence → retain in projected active set | `ACTIVE_NODE_HEARTBEAT_GRACE_MS = 60000` (`:38`,`:89`) | **standalone** — reads consensus-installed `connectedNodeIds` Set + readiness composite; **no `messageRouter` in scope** → deliberately excluded from the atom (design.md Non-Goals) |
| 4 | membershipFreeze aggregate band | `control-plane/active-node-projection.js:39-43` (`MEMBERSHIP_FREEZE_DEFAULT`), `:686-713` (`membershipFreezeActive`) | **P2-aggregate** (C4: own primitive) | broad correlated suspicion (≥N published, ≥M suspected, ≥ratio) → freeze membership mutation | `MIN_PUBLISHED=3`, `MIN_SUSPECTED=2`, `MIN_SUSPECTED_RATIO=0.5` | standalone (correct — **do-not-collapse**, inverse logic) |
| 5 | SWIM-alive protect | `control-plane/active-node-projection.js:389` (`isSwimAliveProtected`), used `:430`,`:529` | **P2** | SWIM `alive` verdict → protect node from a false readiness/liveness-grace trim (asymmetric) | derived from SWIM state; no local window | standalone — `swimVerdict` not in scope at readiness/lease-sweep (design.md); not an atom input |
| 6 | authoritative-repair cooldown ladder | `control-plane/authoritative-node-evidence-reconciler.js:18-20,405-458,680-689` (`resolveCooldownMs`, `shouldBypassCooldown`) | **P4** | repair outcome (ok/fail/no-change) → outcome-tiered cooldown before re-repair; force-fresh bypass floor | `5000 / 30000 / 15000` ms + bypass floor | standalone (correct — **do-not-collapse**, P4→P3 merge = event-loop starvation) |
| 7 | CONVERGENCE_GRACE phase grace | `control-plane/control-plane-readiness-constants.js:76`; consumed `...runtime-authority-methods.js:318`, `...diagnostics-eligibility.js:600` | **P5** | active-recovery in progress → suppress "provisioning-ineligible" verdict during formation | gated on active-recovery only (the epic gap) | standalone (correct — P5 lifecycle; **epic's remaining stage** = promote to cover ordinary formation blips) |
| 8 | transient-shortfall allowlist + whole-cluster re-wait / DDL convergence wait | `query/sql-query-engine-initial-partition-provisioning.js:132-188` (`waitOutWholeClusterTransientProvisioningHold`); `query/sql-query-engine-provision-target-methods.js:110-185`; const `sql-query-engine-shared.js:185` | **P3** | provisioning admission shortfall (whole-cluster transient hold) → re-wait / adaptive convergence wait instead of edge-deny | `TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS = 10000` | standalone (correct — P3 purgatory; P3→P1 merge IS MODE-A) |
| 9 | heartbeat-staleness window (readiness) | `control-plane/control-plane-readiness-node-service-rows.js:462,517` (`isRecentHeartbeat`); const `control-plane-readiness-constants.js:127` | **P2** | ingested heartbeat age ≤ window → healthy | `CLUSTER_MEMBER_STALE_HEARTBEAT_MAX_AGE_MS = 30000` | standalone — the cached-heartbeat term; **backstopped by** the atom veto (#11) after the outer gates |
| 10 | self-node fast-path | `control-plane/control-plane-readiness-node-service-rows.js:502-503` (`isClusterMemberHealthy`) | **P1-degenerate** (observer-relative) | node evaluating its own membership → trivially healthy | none | standalone (correct — degenerate observer-relative) |
| 11 | live-transport veto (MODE-A fix `a79b3728`) | `control-plane/control-plane-readiness-node-service-rows.js:532` (`isClusterMemberHealthy` → `hasLiveTransportEvidence`) | **P2** | stale ingested heartbeat but live router CONNECTED → healthy (trust transport over stale cache) | window-free atom | **STAGE 1 — routes `hasLiveTransportEvidence`** |
| — | rebalancer available-nodes live term | `rebalancer/unified-rebalancer-available-nodes.js:312` (→ `hasLiveTransportEvidence`); cached conjunct `:296-305` retained | **P2** | live transport not CONNECTED → reject as placement target | window-free atom | **STAGE 1 — routes `hasLiveTransportEvidence`** |
| — | DDL provision-target connection gate | `query/sql-query-engine-provisioning-methods.js:269` (`resolveProvisionTargetNodeDiagnostics` → `hasLiveTransportEvidence` OR-rescue) | **P2** | stale-negative `connection_state` column but live router CONNECTED → keep node as provision target | window-free atom, monotone OR | **STAGE 2 — routes `hasLiveTransportEvidence`** (`dd54c827`) |

`hasLiveTransportEvidence` is defined at `control-plane/live-transport-evidence.js:31`.
Confirmed **4 live call sites** on HEAD (grep): readiness veto, lease-sweep, rebalancer,
DDL provisioning — matching stage-1 (3) + stage-2 (1).

### B. Hysteresis-shaped mechanisms OUTSIDE the epic's liveness cluster (NEW classes)

| # | Instance | file:line | Class | Signal → guarded action | Params | Notes |
|---|---|---|---|---|---|---|
| N1 | raft adaptive-timing profile hysteresis | `config/raft-adaptive-timing-controller.js:5,30-31,43-44`; defaults `config/config-definitions.js:41-42` | **P2/P4 (asymmetric-sample anti-flap)** | consecutive load samples over/under CPU/write/RSS thresholds → switch raft timing active↔idle | `promoteSamples=2`, `demoteSamples=6` (asymmetric) | genuine anti-flap; **NEW class** — not in epic; different signal domain (process load, not node liveness) |
| N2 | partition reactive-evaluation debounce | `partition/partition-split-merge-manager.js:38,140-144` | **P4 (debounce)** | write-activity events → debounce reactive split/merge evaluation | `REACTIVE_EVALUATION_DEBOUNCE_MS = 1000` | NEW; distinct actuator |
| N3 | partition size-update / split-write debounce | `partition/partition-service-constants.js:11,13` | **P4 (debounce)** | size / write-activity churn → debounce | `SIZE_UPDATE_DEBOUNCE_MS=5s`, `MANAGED_SPLIT_WRITE_ACTIVITY_DEBOUNCE_MS=5s` | NEW; distinct actuator |
| N4 | learner-promotion stability delay | `partition/partition-service-constants.js:25` | **P5 (phase grace)** | learner caught up → wait min-time before promotion to voter | `LEARNER_PROMOTION_DELAY_MS=30s` "for stability" | NEW; P5-shaped, distinct from CONVERGENCE_GRACE (raft-membership lifecycle, not provisioning) |
| N5 | placement in-score hysteresis margin | `rebalancer/placement-owner-constants.js:94,105` (`INCUMBENT_MOVEMENT_COST`); rationale `placement-owner-decision.js:121` | **P2 (anti-flap / limit-cycle)** | challenger must beat incumbent by margin → suppress placement churn / limit-cycles | `INCUMBENT_MOVEMENT_COST=4` | NEW; score-space hysteresis, not time-based — do-not-collapse |
| N6 | topology anti-entropy scan cooldown | `topology/topology-anti-entropy-reconciler.js:403-408` (`resolveScanGate`); `SCAN_INTERVAL_MS=30s` `topology-anti-entropy-constants.js:23` | **P4 (rate-limit)** | scan recently ran → cooldown-gate next scan | `SCAN_INTERVAL_MS=30000` | NEW; actuator rate-limit |
| N7 | priority-publication source-handoff escalate window | `rebalancer/priority-publication-leader-safety.js:19-24,50-51` | **P5/P3 (sustained-non-progress grace)** | source-leader handoff non-progressing for sustained window → escalate to election | `SOURCE_HANDOFF_ESCALATE_AFTER_MS=30s` | NEW; escalation grace |

Supporting signal (not itself a veto): heartbeat consecutive-failure counter
`control-plane/heartbeat-service-constants.js:34` (`HEARTBEAT_FAILURE_WARN_THRESHOLD=3`) —
the one real self-disruption signal; the C2 LHM-wiring bonus that would consume it was
**REFUTED + parked** (memory `hysteresis-consolidation-stage2.md`).

## 2. Count reconciliation vs epic / memory

- **Epic's ~11 (liveness cluster):** all 11 accounted for above (section A, #1-#11), plus
  the 2 extra atom-routed sites (rebalancer, DDL) that the epic listed under P2/P3.
- **Memory "11th instance = my MODE-A fix added the 5th P2 copy":** ACCURATE at the time.
  On HEAD it is instance **#11** (`...node-service-rows.js:532`), and it is now
  **atom-routed** (stage 1), so it is no longer a 5th *drifting* copy — it shares the
  single `hasLiveTransportEvidence` atom with #2 and the rebalancer/DDL sites.
- **Memory "P2 redundancy 5×":** the epic named five P2 copies of the
  `transportAlive ∨ freshHeartbeat ∨ swimAlive` fold: (2) lease-sweep, (3) projection
  retention, (5) SWIM-alive, (9) heartbeat window, (11) transport veto. **Status on HEAD:**
  the *live-transport sub-atom* of that fold is now unified across **4 sites** (#2, #11,
  rebalancer, DDL) via stage 1+2. The **other three P2 members are NOT collapsed** and
  each for a principled reason: #3 projection retention (no router in scope; consensus
  view), #5 SWIM-alive (different input, not in scope at the eligibility sites), #9
  heartbeat window (the *cached-heartbeat disjunct*, deliberately kept + backstopped by
  the atom). So "5× redundant, collapsible into one helper" is **half-true and now
  half-done**: the redundant *transport* term is unified (4 sites); the remaining "5×"
  is a fold of **three genuinely-different signals** at different layers, not five copies
  of one rule.
- **Net current standalone count (liveness cluster):** of the epic's 11, **4 are now
  atom-routed** (#2, #11, + rebalancer + DDL = the 4 `hasLiveTransportEvidence` sites);
  **7 remain standalone** (#1 P1-teardown, #3 projection, #4 freeze, #5 SWIM, #6 P4-cooldown,
  #7 P5-grace, #8 P3-purgatory, #9 heartbeat-window, #10 self-fast-path — 9 items, but #9
  and #10 co-reside inside `isClusterMemberHealthy` with the atom veto, and #3/#5 co-reside
  in the projection). Grouped by class:
  - **P1:** 2 standalone (#1 teardown, #10 self-fast-path).
  - **P2:** 4 atom-routed (unified) + 3 standalone-by-design (#3, #5, #9).
  - **P2-aggregate:** 1 (#4 freeze) — do-not-collapse.
  - **P3:** 1 (#8) — do-not-collapse.
  - **P4:** 1 (#6) — do-not-collapse.
  - **P5:** 1 (#7 CONVERGENCE_GRACE) — epic's remaining promote target.
- **Broader system (section B): 7 additional hysteresis instances** the epic never
  counted (N1-N7), spanning P2/P4/P5 in raft-timing, partition, placement, topology,
  and handoff subsystems. These raise the true system-wide hysteresis count to **~18**,
  but they are in **different signal domains** and are not the epic's target.

## 3. Consolidation opportunities (ranked)

### Genuinely redundant / collapsible
1. **(already the plan, mostly done) The P2 live-transport term.** Unified across 4
   sites via stages 1-2. The one *remaining* same-signal same-shape candidate is
   **projection retention (#3)** — it computes the same "transport-alive despite stale
   heartbeat" idea but over the consensus-installed `connectedNodeIds` Set, not the
   local live router. It is collapsible ONLY under the epic's C3 precondition (cut the
   projection↔provisioning-eligibility cycle and give the projection a router / a
   `nodeTrustState` view). Highest structural value, highest blast radius.
2. **Nothing else in section A is redundant.** #9 (heartbeat window) and #11 (atom
   veto) look like duplicates inside `isClusterMemberHealthy` but are a deliberate
   disjunction: cached-fast-path OR live-backstop. Collapsing #9 into the atom would
   drop the cheap common-case path.

### Do-NOT-collapse traps (verified against design.md Non-Goals + core-logic-simplification-audit)
- **#4 membershipFreeze into per-node anti-flap** — inverse logic (distrust-observer
  vs trust-target); it's the aggregate circuit-breaker. (epic "Do NOT"; design.md.)
- **#8 P3-purgatory into #1/#11 liveness** — that merge IS the MODE-A bug (a flap
  cancels in-flight placement → table strands 1/3). (epic; design.md.)
- **#6 P4-cooldown into #8 P3-reconciler** — re-creates "9 repairs in 4s → event-loop
  starvation". (epic; design.md.)
- **#7 P5-grace into #4/#2** — single-forming-entity lifecycle suppression; different
  signal domain. (epic.)
- **#5 SWIM-alive / FD protocol** — different input, not in scope at eligibility sites;
  folding it changes membership semantics. (design.md.)
- **N5 INCUMBENT_MOVEMENT_COST** — score-space hysteresis, not time/liveness; collapsing
  into any liveness atom is a category error.
- **N1 raft promote/demote samples** — process-load domain; unrelated to node liveness.
- Cross-check with `core-logic-simplification-audit.md`: the repair-path and
  durability-signal collapses are known **live-regression traps** (reverted `1ce80391` /
  `692c9dbb`) — do not fold #6/#8 on their account.

## 4. Single highest-value next consolidation target

**Promote P5 `CONVERGENCE_GRACE` (#7) to cover ordinary bounded formation blips** —
NOT the projection-retention collapse.

Rationale:
- It is the **epic's own named remaining stage** (epic §3 + Status; memory
  `hysteresis-consolidation-stage2.md`), and it **directly touches MODE-A's provisioning
  half** — the gap the whole epic exists to close. Currently `CONVERGENCE_GRACE` gates on
  active-recovery ONLY (`control-plane-readiness-runtime-authority-methods.js:318`,
  `...diagnostics-eligibility.js:600`), so an ordinary formation blip that is not an
  active-recovery still yields a "broken" provisioning verdict.
- It is **bounded blast radius** (one phase-grace predicate, one constant window) versus
  the projection-retention collapse (#3), which requires cutting the projection↔
  eligibility cycle first (epic's hard precondition) and re-plumbing a consensus-installed
  authority — far higher risk, and the epic explicitly forbids doing it before the cut.
- It is **not a do-not-collapse trap** (P5 stays its own primitive; this is a *scope
  widening* of an existing grace, not a merge).

Second choice, only after the C3 cycle-cut lands: unify projection retention (#3) into a
shared `nodeTrustState(node) → {ALIVE|SUSPECT|DEAD}` derived view (epic roadmap stage 1),
which would finally absorb the last standalone P2 transport-retention copy and make
"grace missing at one consumer" structurally impossible. High value, high precondition cost.
