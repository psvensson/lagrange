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

## UPDATE s12 (2026-07-07): R1 diagnosed + adversarially vetted — the handoff below is SUPERSEDED
**Read `R1-diagnosis-cdc-selfheals-real-root-dispatch-visibility-lag.md` (VET-CORRECTED) FIRST.** Two
post-A1 runs (disk+log) + an adversarial vet that REFUTED 3 of 4 first-pass claims changed the picture:
- **R1 is a NON-ISSUE — do NOT build CDC read-back re-drive.** `No row found for CDC update` SELF-HEALS
  (0/114 keys immortal on the full-length run1; ops converge to byte-identical terminal quorum state;
  run2 same). The "slow convergence overran 900s" framing was wrong — run1's control plane SETTLED
  ~510s and was quiescent 5 min before shutdown.
- **A1 discharged this quest's chartered gap-v.** Zero durability flap both runs; all residual ledger
  ops quorum-consistent; no write-loss divergence. (Minor: r5 carries a benign 3-terminal-row apply lag
  at equal committedIndex — do not assert "all divergence gone".)
- **The doneWhen stays red on PROVISIONING-ADMISSION fragility on a DATA table** — different upstream
  trigger each run, NEITHER is CDC / write-loss / a stuck ledger op:
  - **run1** (phase-4 fail): a 10s window (18:00:08–18:00:18) with 100× `Provisioning admission denied`,
    `eligibleNodeIds:[]`, `control_plane_write_unhealthy`+`cluster_member_unhealthy` — driven by
    control_plane_publications write-leader flux + SWIM membership divergence (only 2 ledger self-moves =
    NOT thrash) → `tbl-d11e7bb8` stuck under-replicated 1/3 → phase-4 times out.
  - **run2** ([2/4] fail): a ledger self-move (`ece665d7`, mid-SYNCING during load) trips the interlock
    (`operation_ledger_self_move_in_flight` ×140) → data-table provisioning cohort rejected
    (`provisionable=0`) → [2/4] times out. Memory s6/s7; root = the over-target self-move sibling.
- **REFUTED decoy — do not chase:** the dramatic 137× dispatch-defer loop on ADD `ab83742f` is a
  REDUNDANT stuck ledger self-move row on an ALREADY-FULLY-PLACED table (tbl-a08a77c7 3/3 on disk); its
  No-row-found was on `storage_reservations` not replica_operations; it is NOT the phase blocker. A
  stuck-op reaper would NOT green either run (binding failure = provisioning-admission eligibility).

**Recommended disposition:** treat routed-mutation (gap-v) as SOLVED-for-scope; the binding residual
belongs to the placement domain. **Next binding work is out-of-quest:** (a) run1's membership /
control_plane_publications write-leadership health transient (why do ALL nodes go provisioning-ineligible
for 10s?), and (b) run2's self-move thrash (the over-target `formation-ledger-over-target-accounting-drain-phase-replace-blind-spot`
sibling). Do NOT narrow the interlock (memory 20/22). The stale R1/R2/R3 framing follows for history only.

---
## (SUPERSEDED — historical) The doneWhen is still red — 3 residual modes
Read first: `postfix-binding-residual-synthesis.md`, `live-ab-A1-validation.md`.
Pre-A1 baseline archived at `data/examples/service-data-affinity-demo-archive/run-2026-07-07T17-30-24-010Z.tar.gz`.
Repro: `node examples/service-data-affinity/run-affinity-demo.js` (archives prior run, ~10-15min, writes
`data/examples/service-data-affinity-demo/node-*.log` + on-disk `*/partitions/*/*.db`).

### R1 (SUPERSEDED — disproven above) — slow low-grade `No row found for CDC update` convergence
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
[s12 verdict: self-heals; NOT the binding blocker; do not build.]

### R2 — INSERT/create lane (`persistNewOperationUnlocked`) still spurious-2PCs
The impl-vet flagged: A1 only covers the UPDATE progress-write path (`buildTransitionPersistOptions`
sets the flag). The create/reinsert lane `persistNewOperationUnlocked` passes no bypass flag, so a
single-partition `replica_operations` INSERT still enlists 2PC. It is NO LONGER ORPHANING (the sibling
now has a leader post-A1) so it's not the binding freeze — but it is still spurious work. Extend the same
`bypassSingleParticipantSystemWrite` flag to that path IF a fresh run shows it contributes. Low priority.
[s12 note: ab83742f's PENDING-freeze MAY be a dropped single-partition self-move progress write on this
lane (unproven, A1-adjacent) — but it lands on an already-placed table, so it is hygiene, not the lever.]

### R3 — phase-[4/4] placement-never-engages formation stall (A1-INDEPENDENT, pre-existing)
Post-A1 run2 hit this: phase [4/4] watch showed `replicas=0, onData=0, attributionRows=0` for 300s →
aborted. Churn was on the `nodes`/membership partition (273 participant-failures), NOT replica_operations
(2). This is the known high formation variance (memory: participant-failures vary 0/437/896 across runs)
and predates A1. [s12: this IS the real residual class — provisioning-admission eligibility; see UPDATE.]

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
