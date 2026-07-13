---
id: self-hosting-circularity-generic-treatment
roadmapRow: null
status: discussing
graduatesTo: null
---

# Self-hosting circularity: one declared contract instead of N rediscovered patches

## Intent (why now)

Everything about this system is stored in the system itself (membership, placement,
operation progress, publications). That makes one bug CLASS recur: a steady-state
invariant "you need X to do Y" goes circular during formation/recovery because Y is
what produces X. The class is already named and censused (external memory
`circular-dependency-class-formation-vs-steady-state`: five cycles A–E found
2026-06-09), and the repository has paid for it repeatedly — the formation-ledger
lineage (the ledger self-move persists its own progress THROUGH the ledger being
moved), the spread-target-derived-from-current-readiness deadlock, the
CLUSTER_MEMBER_HEALTHY join cycle, the admission-gate mesh livelock. Each instance
was solved locally, expensively, and the solutions themselves have converged on a
small mechanism family that was never declared as THE generic treatment. The user
directive (2026-07-13): handle the class centrally/generically so future instances
are either impossible or have a well-known recipe.

## What the repo has ALREADY converged on (undeclared generic mechanisms)

The point fixes are not random — they are five recurring escape shapes:

1. **Owner-local durable establishment + later supersession** — the proven core
   primitive: when the self-hosted durable write cannot land, the OWNER seeds its
   locally-decided row (LWW + tombstone fence) and the still-retrying durable write
   supersedes it. Instances: bootstrap mode direct writes
   (`cdc-integration-service-lifecycle.js` `setBootstrapMode`), lever-(a)
   `applyLocalPriorityOperationProgressRow` (64a18b76), the drain extension
   (bb2a6ca2), the join deferred-seed (L-write increments 1+2a). See
   `solve/epics/control-plane-write-wedge-leader-local-establishment.md`.
2. **Exemption classes for availability-critical operations** — the cure must stay
   admissible through the hold it cures: CL-013 (ledger spread ADDs exempt from the
   self-move interlock), emergency quorum-restore ADD exemption
   (`rebalance-coordinator-ledger-interlock-admission.js:136-141`).
3. **Freshness escapes** — cache-bypassing owner-RPC reads at decision points whose
   inputs the hold itself staleness-poisons (c7a3bf19 ghost re-verify;
   the active-gate durable-revision fence).
4. **Staleness bounds** — a wedged holder is a reaper candidate, not a serialization
   holder (CL-043 step-timeout exclusion).
5. **Intent-derived targets, not readiness-derived targets** — derive goals from
   intended membership/replication factor, not from the readiness the goal is
   supposed to produce (the spread-target fix 14bbe56a; the concentration
   predicate's `totalVoters<=2 ⇒ always concentrated` is an open violation of this
   rule, live in the 2026-07-13 probe tail).

## Options under discussion

- **Option 1 — Declare the availability dependency order and make it checkable.**
  A short steering contract: system resources form a partial order (L0
  transport/raft → L1 operation ledger + publications → L2 other system tables →
  L3 user tables/services); *no operation on the availability-critical path of a
  resource may hard-require that resource's own availability* — it must use one of
  the five escape shapes above, by name. Add an analyzer/audit (grep-able seams:
  who writes to `replica_operations` during a `replica_operations`
  reconfiguration; which planning gates read the readiness they produce) that
  flags new violations. Cheapest; turns the class into a reviewable rule.
- **Option 2 — Promote owner-local establishment from opt-in call sites to the
  gateway.** Today lever-(a) coverage is per-call-site (CREATING, drain ACTIVE/
  REMOVED, join tables). Move the decision into the control-plane gateway: any
  priority-partition write whose target partition is the writer's own subject (or
  currently under reconfiguration) automatically takes the owner-local durable
  journal + CDC supersession path. One owner, no per-instance rediscovery.
  Trade-off: the L-write epic's history shows per-table safety fences
  (B4/`control_plane_publications` single-leader) — the gateway must consult an
  explicit fence table; higher blast radius than Option 1.
- **Option 3 — Formation-progress watchdog (cycle detector).** Systemic handler #5
  from the class memory: detect "no progress + mutually blocked" (two holds each
  sustaining the other's input) and surface the cycle with owners named, instead
  of a silent 300s timeout. Complements 1/2; does not itself fix anything.
- **Option 4 — Separate metadata quorum (KRaft/PD-style), i.e. stop self-hosting
  the bootstrap-critical spine.** The industry answer (CockroachDB gossips system
  config out-of-band; Kafka KRaft runs a dedicated controller quorum; TiKV puts
  placement in PD; FDB has coordinators). Named for completeness: it is a
  re-architecture, contradicts the single-substrate design premise, and the five
  escape shapes exist precisely to avoid it. Not proposed.

## Open questions

- Which of Options 1–3 graduate to a spec first? (Recommendation: 1 now — it is a
  steering+analyzer change; 2 after the current formation-ledger quest closes, so
  its evidence seeds the fence table; 3 opportunistically.)
- Option 1's order: is L1 `operation ledger + publications` one layer or two
  (B4 single-leader publications may need to sit above the ledger)?
- The concentration predicate's `totalVoters<=2` unconditional-concentration is a
  live Option-1 violation (readiness-derived target). Fix inside the current quest
  lineage or as the first Option-1 enforcement case?
- What is the minimal analyzer that catches cycle-shaped regressions without a
  full dependency-graph extraction (candidate: assert-at-runtime "hold X engaged
  for >T while the operation class that clears X is deferred BY X" — the
  self-sustaining-hold detector)?

## Decision log

- 2026-07-13 — Epic authored on user directive after the formation-ledger dig
  re-hit the class (ledger self-move progress writes through the mid-reconfig
  ledger; hold predicate unsatisfiable at ≤2 voters). Inventory of the five
  in-repo escape shapes compiled from the class memory, the L-write epic, and the
  interlock/quorum-concentration source.
