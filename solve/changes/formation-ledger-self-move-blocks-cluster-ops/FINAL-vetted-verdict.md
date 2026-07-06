# Final vetted verdict — the plan, after 4 convergent verification passes

Passes: (1) external practice `verify-external-practice-persistence-honesty.md`,
(2) in-repo prior art `verify-inrepo-priorart-machinery.md`, (3) round-2 fresh Raft
review `verify-plan-vs-raft-practice-round2.md`, (4) adversarial constraint re-vet
`vet-refined-plan-vs-shipped-constraints.md`. They converge.

## Correction to my own cross-check
I claimed R1 (stay leader) "re-opens the bare-rollback divergence." That was
imprecise. The bare-rollback SAFETY guard is the heal's OWN role gate
`isStuckTransactionHealPermitted()` (`partition-service-transaction-base.js:396-400`),
consulted at both heal sites — it permits a rollback only on FOLLOWER/LEARNER/solo.
Demotion was merely the choreography that flipped the role to open that gate. So under
R1 the gate stays CLOSED and the divergence CANNOT re-open. R1 is SAFE on bare-rollback.

## But R1 turns a safety problem into a LIVENESS deadlock (confirmed, run-6 is the worst case)
While the unfit node HOLDS the leader role (R1): the heal gate stays closed → the
zombie transaction never rolls back → the node stays durability-unfit → it makes zero
durable progress and (its own apply frozen) cannot even catch a transfer target up.
In the run-6 shape (whole-group degraded, R3 rejects the catching-up learner target,
R4 escalation slow) the node **holds the seat forever, acking nothing durable, blocking
everyone** — STRICTLY WORSE than today's demote-immediately (which at least heals after
becoming a follower). The load-bearing insight: **demotion is what OPENS the heal gate;
you cannot "just never demote."**

## Reconciliation — the plan is safe only with these constraints (C1–C4)
- **C1** — R1 must keep re-asserting `deferCandidacy` every tick while unfit (else the
  electable zombie re-wins: CL-033/034 churn).
- **C2** — R2 (stop CLIENT-ack while unfit; raft minting/replication continue) is only
  safe paired with R3's gate, so a successor never inherits non-durable "committed"
  entries.
- **C3** — **bounded fallback to demote-immediately** when R4 finds no genuinely-viable
  successor within a bound. This is the specific guard that neutralises the run-6
  deadlock: if nobody can take over, DEMOTE (open the heal gate) rather than hold forever.
- **C4** — preserve the heal role gate (`isStuckTransactionHealPermitted`) exactly.

With C1–C4 the reconciled shape is: try a directed transfer to a genuinely-viable
successor (R1+R3), stop client-acking while unfit (R2), keep deferring candidacy (C1),
and **fall back to the shipped demote-immediately if no successor is ready within a
bound (C3)**.

## The decisive re-ranking: the reconciled leadership plan is NECESSARY-but-INSUFFICIENT for run-6
In run-6 there is no viable successor (learner target + degraded peers), so the
reconciled plan **falls back to C3 = demote** — i.e. today's behaviour. After demotion
the node heals... but only once the orphaned transaction's **~60s prepared-state hold
timeout** (`preparedStateHoldTimeoutMs`, the heal trigger at
`enforcePreparedStateHoldTimeouts`) expires. **That ~60s hold is the true binding
latency of the run-6 wedge** (07:04:17 demote → ~07:05:35 heal+re-elect). The
leadership plan does not touch it.

⇒ Two orthogonal levers, and the binding one is the heal latency:
1. **PRIMARY (run-6 binding): shrink the orphan-transaction heal latency.** The stuck
   participant transaction is *provably orphaned* (its 2PC coordinator committed against
   an empty participant set → it will NEVER be completed). If that can be detected and
   rolled back (follower-gated, C4) faster than the blind ~60s hold — e.g. a
   participant-driven coordinator-liveness / presumed-abort recovery query — the whole
   ~66–78s wedge collapses to seconds. Owner: companion quest
   `ledger-participant-transaction-zombie-lifecycle` (SOLVED for the safe-rollback
   mechanism; the fast-trigger is the residual). FEASIBILITY UNVERIFIED — needs a check
   that "orphaned" is locally decidable sooner than the safety hold allows.
2. **SECONDARY (safe defense-in-depth): the reconciled leadership plan (R1+R2+R3, C1–C4).**
   Bounds the void whenever a successor CAN be readied, and with C3 never regresses the
   run-6 case below today. Safe, but does not by itself fix run-6.

They compose: fast heal shrinks the demote→recover latency; the leadership plan bounds
the successor-starvation window when a target exists.

## Recommended next step
Decide the PRIMARY lever:
- If **heal-latency (1)**: research feasibility first — is the orphaned participant
  transaction locally decidable (coordinator-gone / presumed-abort) sooner than the
  ~60s safety hold, without risking a premature rollback of a still-live 2PC? That
  feasibility gate decides whether lever 1 exists. (Read-only; do this before any DT.)
- If **leadership defense (2)**: DT-first on the `dt6-ledger-leader-durability-fitness`
  harness, encoding C1–C4 (esp. assert the C3 bounded demote-fallback fires when R3
  finds no successor — so the plan never deadlocks).

My recommendation: **feasibility-check lever 1 first** (it targets the true binding
latency and is read-only), then build lever 2 as the safe bounded defense regardless.
Do NOT write leadership code until C1–C4 are encoded as the DT's assertions.
