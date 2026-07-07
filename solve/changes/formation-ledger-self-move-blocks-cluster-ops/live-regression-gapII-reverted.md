# Gap (ii) fix REVERTED — live regression (unit-green, binding-observable-worse)

The gap (ii) arm-2 divergence-repair fix (`1ce80391`) was **reverted** after live
validation showed it regresses the real cluster despite being unit-correct,
DT-red-on-revert-proven, and adversarially verified SHIP.

## Controlled comparison (affinity demo, HEAD 1ce80391 source vs its HEAD~1 source)

Same demo, same machine, back-to-back. `pf` = "Distributed operation failed due to
participant failures" lines carrying `tableName:replica_operations`; `throws` =
`Failed to persist operation`; `reinsert` = the fix's create-on-missing firing.

| run | source | pf | throws | reinsert | [2/4] load |
|---|---|---:|---:|---:|---|
| run-legA-1 (06:34) | pre-fix | 4 | 2 | 0 | PASS (100000 ratings) |
| run-PREFIX-control (07:53) | pre-fix | 0 | 0 | 0 | PASS (100000 ratings) |
| run-gapII-1 (07:35) | **fix** | 57 | 28 | 6 | **ABORT** (participant failure crashes loader) |
| run-gapII-2 (07:42) | **fix** | 55 | 27 | 7 | **ABORT** (participant failure crashes loader) |

2/2 pre-fix runs load 100k; 2/2 fix runs abort at the load. The fix drives a ~14×
increase in participant-failures and persist-throws on the `replica_operations` path
during cold formation. The consistency across both fix runs (57/28/6 and 55/27/7) vs
both pre-fix runs (≤4/≤2/0) attributes the effect to the fix, not formation variance.

## Why the fix is unit-correct but live-regressive

The DT proved the ISOLATED behavior: arm 2 now recovers a single diverged
participant-failure by escalating to the owner-RPC authority (durable-success) or
re-inserting the owner's copy (genuine-missing). That behavior is correct in
isolation. But live, `resolveFailedOperationUpdateResult` is hit by the retryable
participant-failure class **constantly** during cold-formation leadership churn, and
the fix reacts to EVERY such failure with (a) up to two extra authority reads
(OWNER_LOCAL_ONLY + owner-RPC) and (b) a re-insert write when the authority read
misses. This is read/write amplification on the hottest failure path at the worst
time. Mechanistically likely: the pre-fix "Deferred retryable transition failure" is a
**backoff** that lets a lagging participant hydrate; the fix short-circuits that
backoff (advance-now / reinsert-now), pushing ops forward into more writes against
not-yet-ready participants, which cascades into the participant-failure storm that
starves and crashes the [2/4] load.

This is the "DT moved the unit signal but NOT the binding observable" trap
(operational-ground-truth: deterministic-first is necessary but the live binding
signal is the arbiter). The unit DT and adversarial verify were both correct about
what they measured; they simply could not see the aggregate live load effect.

## Redesign direction (do NOT re-ship the escalate-on-every-failure shape)

The frontier research (`self-move-cdc-nontermination-research.md`) already named the
safe shape and it is the OPPOSITE of what was shipped: **reap-on-timeout +
level-triggered re-derivation** (K8s finalizers, CRDB 60s circuit breaker, PD operator
TTL), NOT a per-failure escalate/reinsert. A safe redesign must:
- Fire the divergence repair RARELY — only for an operation that has been genuinely
  stuck (deferred > T seconds / K attempts), not on every transient participant
  failure. This bounds the amplification to the handful of truly-wedged ops.
- Prefer a **leader-pinned / owner-authoritative repair write** (the design's own
  caveat) over re-inserting through the same gateway that may re-route to the diverged
  replica.
- Re-validate against the SAME controlled live comparison (≥2 pre vs ≥2 post, compare
  pf/throws on replica_operations AND the [2/4] load outcome), not just a unit DT.

## Status

- Source reverted to pre-fix (`resolveFailedOperationUpdateResult` local-only recovery,
  `resolveZeroChangeOperationUpdate` inline). DT test
  `replica-operation-failed-update-divergence-repair.test.js` removed (it asserted the
  reverted behavior).
- Diagnosis (`diagnose-legA-run1-settle-stall.md`), design
  (`design-cdc-nontermination-fix.md`), and sibling quests
  (`formation-reservation-reconcile-premature-orphan-release` = gap iv,
  `routed-mutation-silent-ledger-write-loss` = gap v) are KEPT — the three-mechanism
  diagnosis stands; only the gap-ii fix shape is retracted.
- The binding-root understanding is unchanged; the lever is not.
