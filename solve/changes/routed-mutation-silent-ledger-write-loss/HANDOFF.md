# HANDOFF — service-data-affinity [2/4] settle-stall, remaining increments

Session s11 (2026-07-07). HEAD after this session: A1 shipped + live-validated.
Quest: `routed-mutation-silent-ledger-write-loss` (absorbed the gap-v / 2PC-hold work).
Sibling `formation-reservation-reconcile-premature-orphan-release` is PARKED (wrong-leg, do not reopen).

## Where we are (all committed)
- `3717c518` raft fix (removeEntriesAfter committed-entry guard) — prior session; FIRING and healthy.
- `ee7fda5f` residual diagnosis: gap(iv) disproven wrong-leg; gap(v) root = CIRCULAR FORMATION DEADLOCK.
- `b535d0ec` **A1** — engine skips spurious 2PC enlist for single-partition (post-mirror)
  `replica_operations` progress writes. LIVE-VALIDATED (`7556cc84`): the circular deadlock is BROKEN
  (orphaned-hold rollbacks 11→0, durability-unfit 10→0, sql_transaction_participants No-leader 124→0),
  zero regression, completions 43→69. **A1 is necessary-not-sufficient — doneWhen still RED.**
- `eb7d7702`/`56b5007e`/`e484d771` core-logic simplification wins + audit (separate track).

## The doneWhen is still red — 3 residual modes (each its OWN vetted + live-A/B increment)
Read first: `postfix-binding-residual-synthesis.md`, `live-ab-A1-validation.md`, `HANDOFF.md` (this).
Pre-A1 baseline archived at `data/examples/service-data-affinity-demo-archive/run-2026-07-07T17-30-24-010Z.tar.gz`.
Repro: `node examples/service-data-affinity/run-affinity-demo.js` (archives prior run, ~10-15min, writes
`data/examples/service-data-affinity-demo/node-*.log` + on-disk `*/partitions/*/*.db`).

### R1 (recommended next) — slow low-grade `No row found for CDC update` convergence
Post-A1 run1: the hard freeze became SLOW convergence — completions climbed 43→69 but overran the 900s
cap; residual `No row found for CDC update` spread THINLY (~5× each) across replica_operations/services/
storage_reservations/partitions. HYPOTHESIS (unproven): now that the durable-watermark freeze is gone,
this is routing-to-a-not-yet-hydrated-replica read-back lag (the CDC fetch reads a replica that hasn't
applied the committed INSERT yet), which self-heals slowly. NEXT: diagnose on a fresh post-A1 run's DISK
whether the No-row-found rows are (a) genuinely absent on the fetched replica (true lag) vs (b) a
guarded-CAS miss (row present, WHERE moved) — see the pre-A1 disk-diagnosis method in
`diagnose-diskstate-run-10-28Z.md` and `postfix-binding-root-durability-fitness-flap.md`. Likely fix =
level-triggered re-drive / read-escalation on the CDC read-back — but DO NOT add per-failure escalation
(see traps). Confirm whether it's just SLOW (would settle given more time) before building.

### R2 — INSERT/create lane (`persistNewOperationUnlocked`) still spurious-2PCs
The impl-vet flagged: A1 only covers the UPDATE progress-write path (`buildTransitionPersistOptions`
sets the flag). The create/reinsert lane `persistNewOperationUnlocked` passes no bypass flag, so a
single-partition `replica_operations` INSERT still enlists 2PC. It is NO LONGER ORPHANING (the sibling
now has a leader post-A1) so it's not the binding freeze — but it is still spurious work. Extend the same
`bypassSingleParticipantSystemWrite` flag to that path IF a fresh run shows it contributes. Low priority.

### R3 — phase-[4/4] placement-never-engages formation stall (A1-INDEPENDENT, pre-existing)
Post-A1 run2 hit this: phase [4/4] watch showed `replicas=0, onData=0, attributionRows=0` for 300s →
aborted. Churn was on the `nodes`/membership partition (273 participant-failures), NOT replica_operations
(2). This is the known high formation variance (memory: participant-failures vary 0/437/896 across runs)
and predates A1. Separate investigation (placement/attribution chain not engaging). Do not conflate with
gap-v.

## HARD TRAPS — do NOT do these (each cost a prior session)
1. **Do NOT ship A2** ("quorum-durable single-write ack"). The RAFT-mode write path ALREADY awaits the
   majority-gated commit (`write-metrics-base.js:743-750`) → it targets a NON-BUG. Only DIRECT mode
   (`partition-write-kernel.js:44-60`, replicaIds≤1) is a real hole and there is NO disk evidence it binds.
   See `vet-A1-A2-fix-design.md`.
2. **Do NOT re-open gap(iv)** reservation-orphan-release. Proven causally incapable of holding an op
   in-flight (`../formation-reservation-reconcile-premature-orphan-release/wrong-leg-*.md`).
3. **Do NOT narrow the ledger interlock** (self_move_in_flight / quorum_concentrated). Memory runs 20/22:
   UNSAFE + INEFFECTIVE. One subagent recommended it; the memory verdict overrides.
4. **Do NOT add per-failure escalate-and-repair** on the hot write path. That is the reverted arm-2
   (`1ce80391`→`692c9dbb`, ~14× load amplification). Any re-drive must be LEVEL-TRIGGERED / reap-on-timeout,
   fired rarely.
5. **Do NOT trust a green unit DT alone** for a hotpath fix — it can pass while the fix is a live no-op
   (the a9344058/allowlist-drop trap). ALWAYS pair with a 2-pre/2-post live A/B, and drive the DT
   end-to-end through the real threading, not an injected engine precondition.
6. **Formation variance is HIGH.** A single run proves little for aggregate outcomes; use the mechanism
   signals (orphaned-hold rollbacks, durability-unfit, No-row-found counts) which ARE stable, and ≥2 runs
   for any convergence claim.

## Method that worked this session (reuse it)
Diagnose on-disk SQLite + logs FIRST (the freshest run's `*/partitions/*/*.db` are decisive); vet EVERY
step with an adversarial subagent (diagnosis → design → plan → impl diff), IN THAT ORDER — the plan-vet
caught a fix-killing missing allowlist hop that all unit tests would have passed. dt:prove red-on-revert +
live A/B are the two acceptance gates. `node scripts/solve.js finding --id routed-mutation-silent-ledger-write-loss ...`
records durable findings.
