# Research synthesis — self-move limit cycle: are we reinventing wheels?

Consolidates three research passes (all in this directory):
- `research-existing-solutions-project-history.md` (this repo's prior art)
- `research-external-systems.md` (CockroachDB, TiKV/PD, etcd, Consul/Vault, KRaft, K8s)
- `research-theory-papers.md` (Ongaro dissertation, ReadIndex/leases, relay-feedback limit cycles)

## The bug in one sentence (theory-canonical form)

A **relay input** (the leadership flap) + a **lagging sensor** (CDC cache read of committed
replica ROWS) + a **discrete decision with no deadband** (replica-count ADD/REMOVE) = a
textbook **relay-feedback limit cycle**. Cutting ANY ONE of the three ingredients breaks it.

## The three cuts, mapped to candidates and to prior art

| Cut | Mechanism | Our path | External wheel | Internal wheel | Verdict |
| --- | --- | --- | --- | --- | --- |
| (a) remove sensor lag | read-fresh-before-act | **E** (services-row raft-index watermark) | Raft **ReadIndex** §6.4; leader leases; CRDB closed timestamps | none — no per-table applied-index exists | **Cleanest ROOT in theory, but reinvents ReadIndex from scratch → HIGH effort** |
| (b) deadband on the count | self-revert / bounded-re-entry guard | **H (NEW, unevaluated)** | **CRDB allocator "simulate the down-replication; if it would remove what we just added, don't"**; K8s HPA stabilization window | **active-gate bounded-re-entry invariant `AllowUnboundedReentry=FALSE`, TLA+-proven** (`theory-20260529-...coupled-invariants`) | **Cheapest, DOUBLY precedented (CRDB + our own shipped fix) → strongest reuse** |
| (c) remove the relay | don't let the flap fire | A / C | Pre-Vote §9.6, leadership transfer §3.10, Consul `ServerStabilizationTime` | run-23 `9234e904` durability-fitness + `deferCandidacy` | **Blocked: the demotion is a CORRECT shipped safety heal, not a bug (A impossible); damping it = the formation circular-dependency trap** |

## Are we reinventing wheels? — Yes, in the E direction. No, if we take H.

- **Path E reinvents Raft ReadIndex/leases** — theoretically the cleanest root, but this repo
  has **no per-table applied-raft-index** to build on (only schema-version / wall-clock /
  causeId, consumed solely by admin diagnostics). So E = building a ReadIndex equivalent
  end-to-end. That is reinventing a well-known wheel from raw materials we don't have.
- **Path H reuses a wheel we already ship.** The active-gate oscillation
  (`theory-20260529-rolling-restart-active-gate-priority-recovery-coupled-invariants`) was
  the SAME class — proven in TLC (`bounded route converges, unbounded oscillates`) and fixed
  with a **bounded-re-entry invariant** in a decision-rule table (exclude already-covered
  nodes from re-entering the reconcile). CockroachDB independently uses the identical
  "simulate the undo, skip the self-reverting move" deadband for the identical non-atomic
  add-then-remove window. Two independent precedents, one of them in-repo.
- **The METHOD is also a wheel we own.** `operational-ground-truth.md:73-89` flags this exact
  six-path whack-a-mole (148→4, 23→54, demo still red, dominant residual rotates) as the
  **COUPLED-INVARIANT** signature and prescribes: stop hand-patching, step to model altitude,
  reuse the `CoupledAdmission` TLA+ harness (`models/readiness-starvation/`). The active-gate
  fix followed exactly this method. So the reuse-first move is to **model H in the existing
  TLC harness before writing a patch**, not to iterate live-run patches.

## Honest open risks (do NOT oversell H)

1. **H's crux is unevaluated and is exactly what killed B/C/D/F:** does a self-revert /
   bounded-re-entry deadband actually FIRE when the driving view is **stale-but-internally-
   consistent**? A fresh leader that miscounts "over-target" would, on the SAME stale view,
   simulate "remove → land at target → no re-add" and the naive undo-check would NOT trip.
   The active-gate variant dodges this by keying on **in-flight-operation coverage**
   (idempotence against work already dispatched), not on the count — that distinction is the
   make-or-break for H and must be adversarially resolved before commitment.
2. **Possible stale-code run (cheap, gating):** `eval-path-a §1` flags it UNCONFIRMED whether
   the last demo (run-5) even executed the post-zombie-fix binary. If it didn't, the residual
   may be smaller or absent — the #1 distributed trap (stale-code runs). Verify BEFORE any
   build.

## Recommendation (reuse-first)

1. **CHEAP FIRST — kill the stale-code question.** Confirm run-5 ran the current binary. If
   not, re-measure; the residual may not justify any build.
2. **Adversarially evaluate Path H** (self-revert / bounded-re-entry deadband) at the same bar
   B/C/D/E/F got — resolving crux risk #1 by testing whether keying on in-flight-operation
   coverage (the active-gate reuse) sidesteps the stale-count defeat.
3. **If H survives, model it in the existing TLC/CoupledAdmission harness** (repo-prescribed
   method for coupled invariants), then implement DT-first with red-on-revert.
4. **Keep Path E (cut a) as the fallback root** only if H's deadband proves to mask rather
   than converge — accepting E means consciously building a ReadIndex equivalent.

Bottom line (as first drafted): do not build Path E yet — evaluate Path H (the deadband) first.

---

## UPDATE — Path H eval returned NO-GO (HIGH); the question has CONVERGED on cut (a)/E.

`eval-path-h-self-revert-bounded-reentry-deadband.md` killed H at the crux:
- **H1 (CRDB undo-simulation) is inert on a stale-but-self-consistent view** — the undo-check
  runs on the SAME stale view that produced the miscount, so neither phantom leg trips
  (`move-planner-move-calculation-methods.js:295-303,329-347,357-361`).
- **H2 (active-gate bounded-re-entry) re-inherits D's staleness** — the in-flight coverage
  read is the same lagging `systemTableCache`, and the just-completed REPLACE it must
  recognize is filtered OUT of the in-flight set (`unified-rebalancer-replica-state.js:613-624`).
- **The reuse was a misread:** the active-gate wheel's load-bearing part is a durable,
  **freshness-fenced** revision (`durablePublicationRevision`/`freshnessRevisionRequirement`,
  `publication-active-gate-handoff-contract-decision.js:332-344`), i.e. **cut (a)** — not a
  rule-table deadband. Reproducing it faithfully IS E's freshness fence.

**The deep lesson: you cannot build a deadband on a lying sensor.** Theory said any of the
three cuts breaks the cycle, but cut (b) computed FROM the lagging sensor inherits the lie.
Cut (c) is uncuttable (correct safety mechanism). **Cut (a) — freshness — is the sole
surviving cut.**

### Re-verdict on "reinventing wheels"
E is NOT greenfield ReadIndex. It **extends two in-repo freshness-fenced decision
mechanisms**: (i) `c7a3bf19`'s cache-bypassing owner-RPC read at the interlock decision
point, and (ii) the active-gate `durablePublicationRevision` fence. Both are the same
read-fresh-before-act pattern (= Raft ReadIndex). So E reuses an established in-repo pattern.

### Remaining open question → the ONE eval left
The E eval assumed the EXPENSIVE form (build a new CDC raft-index watermark end-to-end). The
`c7a3bf19` precedent suggests a CHEAPER correct form: a **cache-bypassing authoritative
services-row read at the fresh-leader's first count-changing move** (reuse `c7a3bf19`'s
pattern) instead of a full watermark. Evaluate cheapest-correct-form-of-E
(cache-bypass-read reuse vs. watermark build) BEFORE committing to implementation, then
implement DT-first with red-on-revert.

---

## UPDATE 2 — E-cheap REVERTED: DT-proven but wrong leg, live regression (run-6)

The E-cheap fix (`fba0b477`) was committed on DT red-on-revert proof, then the live demo
(run-6) was run to validate. **It did NOT clear [2/4]** and was a measured REGRESSION
(`diagnose-run6-demo-stall.md`):
- The `replica_operations-p1` self-move cycle is driven by **count-NEUTRAL `replace_replica`
  self-moves (44) + `node_not_in_target` REMOVEs (11)** that never terminalize and get
  RE-MINTED on a severe **leadership flap (term reached 22, ~21 elections)** — plus **219**
  over-target "Deferring count-increasing ADD / no count-neutral REPLACE pairing" lines. The
  count is **OVER** target, not stale-LOW.
- E-cheap only refreshes the count-decision `currentReplicas` input. Its authoritative-over-cache
  UNION never under-counts → it only RAISES the count → fires the over-target ADD-deferral MORE
  → starves REPLACE pairing → thrash **5→34 (6.8×)**, completions **38→17 (55% fewer)** vs run-5,
  same window. Plus a synchronous per-tick owner-RPC on the hottest partition (event-loop gaps).

**Root-cause correction:** the earlier evals (A–H) and this synthesis mis-identified the binding
driver as a fresh-leader count MISCOUNT (stale-LOW phantom ADD). The LIVE binding observable shows
the driver is the **count-NEUTRAL REPLACE/REMOVE self-move RE-MINT limit cycle** — the spread
REPLACE never terminalizes and is re-planned on every leadership-flap election. The count decision
is downstream noise, not the lever. This is the "DT-proven but binding-observable-unmoved" trap
(the DT's injected always-fresh gateway proved a mechanism that isn't the driver).

**Reverted** the src + DT (kept the investigation docs + the steering commit). NEXT real lever:
why the self-move REPLACE never terminalizes, the `node_not_in_target` REMOVE re-mint, and the
leadership flap (term 2→22) that re-plans/re-mints every election — i.e. the interlock/completion
+ flap-frequency seam, NOT the count-decision input.
