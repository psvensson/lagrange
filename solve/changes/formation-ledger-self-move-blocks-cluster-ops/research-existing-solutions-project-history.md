# Research — prior art in THIS repo for the durability-demotion formation limit cycle

Scope: repository history + steering/memory research only. **No source changed.** Every
claim carries a `file:line` or commit SHA. Purpose: inform the decision between **Path E**
(services-row freshness watermark, HIGH effort, `eval-path-e-services-freshness.md`) and
**Path G** (attack the leadership-flap *generator* = the durability demotion, unevaluated).

Companion docs already in this directory (read in full; their conclusions are folded in
below so they are not re-derived): `research-selfmove-limit-cycle.md`,
`research-interlock-serialization.md`, `eval-path-a..f`.

---

## The problem in one sentence (confirmed by the two research docs)

Cold 5-node formation: `replica_operations-p1` rides a **~2-min-period leadership-flap
LIMIT CYCLE**. Driver = a **durability-fitness leadership demotion**
(`src/partition/partition-service-durability-fitness.js:181-217`) forced by an **orphaned
ACTIVE 2PC participant write-session** held on the ledger leader past the 60s legal hold
(`src/control-plane/timeout-budget.js:21`, `PREPARED_HOLD_TIMEOUT_MS=60000`). Each demotion
elects a fresh leader whose local **committed replica-ROW** view (`currentReplicas` →
`activeCount`) is CDC-stale, so it mints a **phantom count-CHANGING move** (REPLACE → ADD
`increase_replica_count` → REMOVE) that fights the in-progress spread → self-move thrash
(25 EXECUTE / ~4 real ops) → the interlock (`self_move_in_flight`/`quorum_concentrated`)
holds every other partition → demo load times out at [2/4]
(`research-selfmove-limit-cycle.md` §1-§3, cited to the run-5 logs).

---

## PRIOR ART IN THIS REPO

Reuse verdict per the repo's reuse-comparison directive (REUSED as-is / EXTEND / NEW):

| Mechanism | file:line / SHA | What it solves | Reusable for the flap-generator fix? |
| --- | --- | --- | --- |
| **Leader durability-fitness demotion** (the flap generator itself) | `9234e904`; `partition-service-durability-fitness.js:181-217`, strike limit :33, legal hold :31-32, consequence/demote :274-323 | Run-23: a zombie `BEGIN IMMEDIATE` made the ledger leader's writes silently non-durable while it stayed leader. Makes leader-local durability part of leadership fitness → an unfit leader sheds leadership (3 strikes @1Hz past 60s hold). | **This IS the generator.** The demotion is a *correct safety response*, not a bug. Path G must not disable it; it can only (a) prevent the orphan upstream (Path A) or (b) prevent the *fresh leader's phantom move* downstream (Paths D/E/F). |
| **Tracked (flap-safe) leader demotion** | `9234e904`; `src/raft/tracked-leader-demotion.js` (extracted single owner; shared with replica drain step-down) | The flap-safe demotion sequence + `deferCandidacy` so the unfit node does not immediately re-win. | REUSED as-is. `deferCandidacy` (`durability-fitness.js:308`) stops the *unfit* node re-winning; it does **nothing** to damp the *new* leader's immediate re-plan (`research-selfmove-limit-cycle.md` §5). |
| **Heal-deferred-until-demotion rule** | `partition-service-constants.js:322`; role gate `partition-service-transaction-base.js:396-401`, deferral :331-341 | A leader must NOT bare-rollback an orphaned ACTIVE hold — it would re-mint acked raft indices and followers would truncate committed entries. So the heal is *deferred until the node is a follower* (demotion = the safe heal). | REUSED (constraint). This is *why* Path A ("close the session in-budget on the leader") is structurally impossible at the participant seam — `eval-path-a §2` proves it against this shipped role gate. |
| **Zombie-transaction lifecycle guards** (companion run-23 quest, SOLVED) | empty-set-commit guard `durable-workflow-coordinator.js:245-248`; recovery-clobber guard `distributed-transaction-recovery.js:503-519`; sessionless-absorption removed `partition-service-transaction-session-methods.js:26-37` | Removes the two enabling defects that stranded the ACTIVE session (silent skip of missing participants + recovery clobbering the live in-memory tx from a CDC-lagging copy). | REUSED (already in tree). `eval-path-a §1` — Path A's core is already shipped; any residual orphan is a *different CDC-lag variant* of the coordinator-finalize gap, and finishing it during formation is formation-vs-steady-state circular (`eval-path-a §3`). |
| **Run-20 self-move serialization** (interlock, Direction B) | `d07c63dc`; `rebalance-coordinator-ledger-interlock-admission.js:195-222` (`self_move_in_flight`) | Co-scheduling a ledger REPLACE with sibling moves failed every progress write into the mid-move ledger raft group. A ledger REPLACE/REMOVE admits only into an idle ledger; all other ops defer while one is live (emergency ADDs exempt). | REUSED / MUST-NOT-WEAKEN. This is the *amplifier* that turns the flap into a whole-control-plane stall, but narrowing it is UNSAFE (weakens run-20/22) and INEFFECTIVE (`research-interlock-serialization.md` §4-§5: the concentration hold dominates). |
| **Run-22 quorum-concentration hold** (interlock) | `e633ad76`; same file `:315-338` (`operation_ledger_quorum_concentrated`), predicate `operation-ledger-quorum-concentration.js:117-155,170` | While any ledger partition's voters cannot form a majority without their hottest node AND spread is actionable, dependent ops defer. | REUSED / MUST-NOT-WEAKEN. The *binding* blocker: it persists the whole window because the ledger never de-concentrates (`research-interlock-serialization.md` §3-§4). Releases only when the spread converges to ≤target de-concentrated. |
| **c7a3bf19 cache-bypassing self-move ghost re-verify** | `c7a3bf19`; interlock `:283-302` | A fresh leader's CACHE-FIRST observation saw a prior spread REPLACE frozen at STOPPING though it terminalized ~5ms earlier on the old leader → rejected every subsequent spread REPLACE. Fix: re-verify a same-partition self-move blocker via a **cache-BYPASSING owner-RPC read**; drop a terminal ghost, keep blocking a genuine in-flight. | **Closest structural precedent** for "fresh leader + stale local view." But it reads the interlock's *self-move blocker STATE* (operation ledger), NOT the replica-count ROWS — a different read path (`eval-path-d §6`, `eval-path-f §7`). Its pathology *predicts F's inertness* (the STOPPING op is filtered out of the planner's in-flight set). REUSE the *pattern* (cache-bypass owner-RPC read), not the code. |
| **c78833f0 drain-phase REPLACE deficit credit** | `c78833f0`; `in-flight-aware-replica-count.js:160-226` (credit :190-211, `deficitEffectiveCount=activeCount+inFlightAddCount+drainPhaseReplacementCredit` :225-226) | A drained REPLACE source (left `activeCount`) whose replacement is still a non-voting LEARNER was counted NOWHERE → false deficit → spurious count-increasing ADD → 4 voters/over-target/concentrated forever. Fix: credit the SPECIFIC materialized non-active learner row of each drain-phase REPLACE (ROW-OP-LINKED; TiKV-PD/CRDB pattern). Cut over-target deferrals 148→4. | REUSED (partial success). It closed the *steady* count divergence but NOT the *leadership-flap window* residual (`eval-path-c §2`). Its own commit message is the load-bearing precedent: *"a read-path correctness fix, not a count heuristic — which is why it bounds where 3 prior count-based approximations were refuted."* |
| **136aebbc durable raft_role write** (voter-visibility read-path class) | `136aebbc` | The role-mutation helper's cache-equality dedup treated a CL-035 locally-seeded services row as proof of durable persistence and dropped the write → a promoted priority replica stayed a durable LEARNER cluster-wide, invisible to the quorum-spread admission hold and planner. Fix: capability-gated authoritative dedup CAS-guarded against the AUTHORITATIVE row, never the seed-protected merged cache. | REUSED (pattern reference). This is the canonical **ROW-OP-LINKED voter-visibility read-path** fix the memory points at ("like `136aebbc`, different path"). Confirms the class: fix the *read of the authoritative row*, not a count/cache heuristic. |
| **In-score hysteresis levers** — `retainHealthyIncumbents`, `INCUMBENT_MOVEMENT_COST` | `placement-owner-evidence.js:165-179` (DEAD — no caller passes `true`); `placement-owner-constants.js:105` (=4) applied `placement-owner-decision.js:174-177` (DATA_AFFINITY-only) | Retain a healthy incumbent replica across re-plans; in-score challenge margin. | **NEW/NO-GO for this bug.** `eval-path-c` proves DECISIVE: these are WHERE (score) levers; the pathology is a COUNT flip decided *before/independently of* scoring (`move-planner.js:260-261`, count math `move-planner-move-calculation-methods.js:295-303,357-361`). Too strong → freezes the concentrated seed (opposite failure); too weak → no effect. |
| **`setLeader` re-plan on leadership gain** (NO hysteresis) | `unified-rebalancer-lifecycle-base.js:474-483` (verified): `if (isLeader && !wasLeader)` → `enqueueRebalanceCheck(PERIODIC_CHECK)` for priority partitions, then `scheduleNextCheck(getLeadershipStartDelayMs())` | Fresh leader of a priority partition re-plans promptly (intended recovery behavior). | **This is the injection site every downstream path targets.** Confirmed: NO cooldown, NO epoch pinning, NO view-freshness gate, NO hysteresis. `getLeadershipStartDelayMs` (`unified-rebalancer-policy-scheduler-methods.js:165-171`) is random jitter floored at 1000ms — a thundering-herd guard, NOT a flap debounce. |
| **Membership-epoch sync freshness read** (shape precedent for E) | `unified-rebalancer-rebalance-loop.js:159-160,300-313`; `getCurrentPublishedMembershipEpochSync` | A sync freshness read already wired INTO the rebalance loop — but it is a *membership epoch*, and it only STAMPS moves (:265-276), it does not GATE the count decision. | EXTEND (shape only). `eval-path-e §5`: right shape (sync freshness read in the loop), wrong signal (membership view, not replica-row watermark). Extending it to a services-row watermark = the whole Path-E build. |

---

## WHAT WAS TRIED FOR THE FLAP (six paths already adversarially evaluated in this dir)

| Path | Idea | Verdict | Decisive reason (cited) |
| --- | --- | --- | --- |
| **A** | Close the orphaned ACTIVE session in-budget on the leader so no demotion fires | **NO-GO as primary; core already shipped** | Leader-side in-budget close is *structurally impossible* — the only raft-safe heal IS the demotion (`eval-path-a §2`, proven vs the shipped role gate `transaction-base.js:396`). Coordinator-side finalize during formation is formation-vs-steady-state circular (`eval-path-a §3`). |
| **B** | Leadership-gain re-plan cooldown / self-move hysteresis at `setLeader` | **NO-GO** | Node-process boundary: the new leader is a *different process* from the one that self-moved; in-memory `lastSelfMoveCompletionMs` is empty → the naive version is INERT and false-passes a single-instance DT (`eval-path-b §1a`). The correct shared-signal version reads the same lagged ledger = circular; the ~1s fallback is too fast to settle. |
| **C** | Wire in-score incumbent-movement-cost hysteresis for quorum-spread | **NO-GO (HIGH confidence)** | The pathology is a COUNT flip; the incumbent term is a SCORE term that only reorders WHICH node fills a policy-fixed slot count — never gates ADD-vs-REMOVE (`eval-path-c §1`). Too strong → freezes the concentrated seed (`eval-path-c §4`). |
| **D** | Authoritative owner-RPC read of in-flight OPS before the first count move | **NO-GO (HIGH confidence)** | Reads the WRONG table. The miscount is dominated by stale `currentReplicas`/`activeCount`; the in-flight terms an ops read moves are 0 (`inFlightAddCount`) or excluded (`inFlightReplaceInCreationCount`) in the REPLACE→ADD→REMOVE signature (`eval-path-d §1`). On `replica_operations-p1` the read is circular (owner reads its own ledger mid-election) → DEFERRED → collapses to Path B. |
| **E** | Gate the fresh leader's first count-CHANGING move on **SERVICES-replica-ROW** view freshness (raft index/term watermark) | **GO-WITH-CAVEATS (MEDIUM ~0.6)** | First path on the CORRECT axis (stale committed rows, the input D proved dominant) AND not killed by a structural flaw: SERVICES is a *different, non-priority, non-flapping* partition (`system-partition-classification.js:17-23`) → non-circular for the driver, bounded CDC-catch-up deferral. BUT the watermark machinery does NOT exist — needs a raft-index CDC watermark built end-to-end (producer + contiguous cache frontier + sync reader) + async `setLeader` pre-load. HIGH effort (`eval-path-e §1,§8`). |
| **F** | Credit the fresh leader's OWN completed REPLACEs off its local ledger (extend `drainPhaseReplacementCredit`, no watermark) | **NO-GO (HIGH confidence)** | The "lag-free local ledger" premise is FALSE: the planner's only in-flight-ops source is the same CDC-fed `systemTableCache` (`unified-rebalancer-replica-state.js:544`), and COMPLETED/terminal REPLACEs are filtered out of it (`:320-322`; `replica-operation-liveness.js:527-538`) → INERT; forcing it to fire = a refuted node-count heuristic that masks genuine deficits, ADD-leg only (`eval-path-f §1-§3`). |

**Net of the six:** Paths B/C/D/F are all NO-GO for a *shared* structural reason — they act
on WHEN/WHICH/OPS but the pathology is a **stale committed-replica-ROW COUNT** read by a
fresh leader. **E** is the only downstream path on the correct axis, but it is a HIGH-effort
new-machinery build. **A** removes the generator but is structurally blocked at the leader
seam and circular at the coordinator seam. **Path G** (attack the demotion generator
directly) is NOT among the six — it is the unevaluated option.

---

## THE FORMATION-vs-STEADY-STATE CIRCULAR-DEPENDENCY META-PATTERN

Source: `~/.claude/.../memory/circular-dependency-class-formation-vs-steady-state.md`
(found 2026-06-09 via a 5-agent cycle hunt). **The class:** a steady-state invariant ("you
need X to do Y") is correct in steady state but CIRCULAR during formation/recovery, because
X does not exist yet and Y is what creates X. Cold-start bootstrap has escape hatches
(direct local writes, seed snapshot); RECOVERY/re-formation systematically LACKS the
equivalent escapes (memory lines 10-16).

Prescribed **systemic** remedies (memory lines 54-67):
1. **Always-on liveness phase** — loops that must run to BREAK a stall start
   UNCONDITIONALLY, never gated on the readiness they produce.
2. **Leader-authoritative local establishment generalized to recovery** — let the
   self-identified leader write control-plane/replica metadata LOCALLY (bootstrap-direct
   pattern, extended past bootstrap).
3. **Single authoritative leadership accessor** — in-memory raft role, never the lagging
   cache tiers (removes cache-circularity).
4. Accept-and-queue admission + idempotent re-discovery/authoritative topology push.
5. **META: a formation-progress watchdog / cycle detector** — detect "no progress +
   mutually-blocked" and surface/break-glass rather than silently time out.

Root cause pinned earlier (memory 69-91): **the self-defeating spread target** — the
required distinct-node count was derived from the *current* readiness, so it could not grow
past the bootstrap floor of 1. Fix direction: derive the target from the INTENDED
membership, not the already-ACTIVE count. (Different instance, same class as our flap.)

**Steering — `docs/steering/operational-ground-truth.md` (directly load-bearing here):**
- Lines 73-89 — **the COUPLED-INVARIANT warning.** *"one-invariant-at-a-time fails when the
  invariants are COUPLED. If single-frontier patches keep flipping one family green and
  another red — the rotating dominant reason, the whack-a-mole — you are not making
  progress, you are bouncing a coupling."* The `CoupledAdmission` TLA+ model proves single-
  owner patches bounce forever at a shared knob; only an *atomic cross-owner reconcile*
  converges. Prescribed response: **stop patching, zoom to architecture altitude**
  (`reflect --altitude`), and EXHAUST-and-pivot if the lever is out of the Quest's scope.
- Lines 108-119 — **formation-vs-steady-state circularity is a HARD TRIGGER for
  ledger lookup BEFORE writing a fix** (grep `solve/theory-ledger.md` + closure ledger;
  the recorded theory usually names the owner + the *refuted* fixes). The affinity demo
  "paid one 10-minute live run per half-wired link it could have found in a single audit."

**Why this matters for the E-vs-G decision:** the six-path sweep (A-F) has the exact
signature the coupled-invariant warning describes — successive single-frontier fixes
(56ebbedb poison, ab15e03e create-lane, c78833f0 over-target, c7a3bf19 ghost) each moved a
metric (23→54 completions, 148→4 deferrals) but the demo stays red; the dominant residual
rotates (over-target → self-move flap). That is the "bouncing a coupling" tell. The coupled
knob here is **leadership + committed-row view freshness during formation**: the demotion
(safety owner) and the rebalancer count-plan (placement owner) are two owners sharing the
fresh-leader-on-a-stale-view seam.

---

## GAP — what a flap-generator (Path G) fix needs that does NOT exist

The demotion is *correct* and MUST stay (run-23 safety prerequisite, `9234e904`). "Attack
the generator" therefore means one of two sub-targets; both have concrete gaps:

**G1 — prevent the orphaned ACTIVE session (= Path A, coordinator side).**
- GAP: the leader-side close is impossible (shipped role gate). The only tractable residual
  is coordinator-side finalize-within-budget across a workflow-owner leadership change
  during formation. That path reads authoritative `SQL_TRANSACTIONS` /
  `SQL_TRANSACTION_PARTICIPANTS` rows (`operation-workflow-transition-orchestration.js:75-136`)
  which are CDC-lagged and gated behind the *same* interlock this quest must not narrow →
  **formation-vs-steady-state circular** (`eval-path-a §3`).
- GAP: **no DT asserts "coordinator finalizes across a workflow-owner move within budget
  during formation"** — that is NEW substrate (`eval-path-a §5`), and building a faithful
  formation-churn repro is itself significant effort.
- OPEN QUESTION flagged by `eval-path-a §1`: it is UNCONFIRMED whether run-5 even ran the
  post-11:12 zombie-fix binary. If run-5 predates the fix, the Path-A/G1 residual may not
  exist at all. **Confirm the running binary before investing in G1.**

**G2 — stop the fresh leader from re-planning on a stale view (dampen the generator's
downstream effect without disabling the demotion).**
- GAP: NO leadership-gain hysteresis / epoch pin / view-freshness gate exists at
  `setLeader` (`unified-rebalancer-lifecycle-base.js:474-483`, verified — immediate
  `enqueueRebalanceCheck` + jitter-only `scheduleNextCheck`).
- GAP: `setLeader(isLeader)` carries **NO reason code** — the new leader cannot distinguish
  "gained after a durability demotion" from "gained after a real node loss"
  (`eval-path-b §2`). Damping ALL leadership gains blunts genuine priority recovery; damping
  only demotion-triggered gains needs NEW plumbing from the demotion path into `setLeader`.
- GAP: any in-memory "recent self-move" signal is per-node and INVISIBLE to the new leader
  (node-process boundary, `eval-path-b §1a`); a correct shared signal reads the lagged
  ledger = circular. This is why G2-as-a-timer collapses into Path B.
- The **only correct downstream shape** is E's: gate the first count-CHANGING move on
  **committed-replica-ROW view freshness** keyed to a raft index/term watermark that is
  *shared* (node-boundary-immune) and *non-circular* (reads SERVICES, not the flapping
  partition) — and that watermark machinery **does not exist** (`eval-path-e §1`: only
  schema-version / wall-clock `Date.now` / opaque `causeId` are tracked, consumed solely by
  admin diagnostics; no per-table raft index, no contiguous applied frontier, no sync
  planner reader). Building it = the HIGH-effort Path-E plumbing.

**What is genuinely missing across BOTH sub-targets:** a **shared, node-boundary-immune,
non-circular freshness/epoch signal on the leadership handoff** — either (a) a services-row
raft-index watermark (E's build) so the count plan reads rows reflecting the prior epoch, or
(b) a demotion→setLeader reason plumb so the fresh leader can defer *only* a
demotion-triggered re-plan until its view settles. Neither exists today. The demotion itself,
the tracked-demotion sequence, `deferCandidacy`, the interlock, and the run-23 zombie guards
are ALL already shipped and correct — the gap is purely the **fresh-leader-view-freshness
seam**, which is exactly the coupled knob the operational-ground-truth warning names.

---

## Bottom line for the E-vs-G decision

- **Path A/G1** removes the generator but is blocked at the leader seam (shipped role gate)
  and circular at the coordinator seam during formation; may not even have a live residual
  (unconfirmed binary). HIGH risk (run-23 blast radius), NEW DT substrate required.
- **Path G2 as a timer/cooldown** collapses into the already-refuted Path B (node boundary +
  no reason code + ~1s fallback). The *correct* G2 shape converges onto E's row-freshness
  gate.
- **Path E** is the only downstream path on the correct axis (stale committed replica ROWS,
  the dominant miscount input) that is non-circular for the driving partition and bounded —
  but it is a HIGH-effort end-to-end raft-index watermark build, plus async `setLeader`
  plumbing, plus multi-node DT.
- **The operational-ground-truth coupled-invariant rule** (lines 73-89) says the six-path
  whack-a-mole is the signature of *bouncing a coupling*, and prescribes a **step-back to
  architecture altitude** before committing to another single-owner patch — i.e. before
  choosing E or G, weigh whether the honest move is the *atomic cross-owner reconcile* of the
  leadership/row-freshness seam (or an EXHAUST-and-pivot if that lever is out of this Quest's
  scope). Per the same rule (lines 108-119), grep `solve/theory-ledger.md` + the closure
  ledger for this exact seam BEFORE writing either fix.

*(This document is research output for the caller; it changed no source.)*
