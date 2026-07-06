# Live validation — LEG #1 is the WRONG LEG (does not move [2/4])

Ran the live affinity demo 3× at HEAD `a9344058` (fingerprint 9b668da1, my fix
loaded, not stale). Every run FAILS at [2/4]. LEG #1's rollback NEVER fired.

## The 3-run result
| | Run 1 | Run 2 | Run 3 |
| --- | --- | --- | --- |
| Outcome | [2/4] cohort not provisionable | [2/4] settle STALLED → admin timeout | [2/4] settle STALLED → admin timeout |
| stranded-rollback-fired (my fix) | 0 | 0 | 0 |
| ACTIVE participant BEGINs opened | 0 | 0 | 0 |
| participant-failures | 0 | 437 | 896 |
| durability-unfit | 0 | 0 | 2 |
| self-move execs (replica_operations-p1) | 53 | 55 | 21 |
| leader flaps (p1) | 2 | 2 | 2 |

## Why LEG #1 is inert here
- LEG #1 rolls back a stranded **ACTIVE 2PC participant BEGIN** on the step-down
  edge. The demo opens **ZERO** such transactions (0 `BEGIN IMMEDIATE` /
  participant holds across 3 runs). The ledger writes are **`writeMode=sql-routed`
  single writes** to `replica_operations` ("Failed to update/persist/insert system
  table row"), not client-held participant transactions. My fix's precondition
  never occurs → 0 firings.
- The DT was green only because it **injected** a `beginTransaction` the real
  system never issues on the ledger path. This is the E-cheap trap
  (`96a0917f` revert precedent): a green DT on an injected mock is not proof the
  binding observable moves.
- The "prevent orphan at source" diagnosis (`diagnose-orphan-tx-source.md`)
  mis-modelled the mechanism as an orphaned participant BEGIN. The demo shows the
  real failures are sql-routed writes failing on a self-move-degraded quorum — the
  mechanism THIS session's own earlier diagnosis
  (`verify-model-lever-vs-run6-binding-wedge.md`) correctly named before the pivot.

## The actual [2/4] blocker (confirmed live)
- Ratings-table provisioning is rejected: **318 `operation_ledger_self_move_in_flight`**
  + 68 `operation_ledger_quorum_concentrated` + 4 `waiting_for_idle_ledger`
  (run 3). A ledger self-move in flight defers non-emergency provisioning → ratings
  partition never routable → [2/4] times out.
- The self-moves thrash (21–55 execs) and don't terminalize cleanly because their
  sql-routed progress writes to `replica_operations` fail with "Distributed
  operation failed due to participant failures" (~175 sql-routed failures) + ~508
  "Transient CDC SQL error/exception, retrying" — the self-referential quorum
  degradation (a self-move on the ledger partition degrades the quorum of the very
  table storing its progress).
- Note: participant-failures 0→437→896 and durability-unfit 0/0/2 show the
  persistence-failure severity VARIES run-to-run (a race), but [2/4] fails EVERY
  run regardless — the interlock-defers-provisioning is the reliable blocker.

## Recommendation
LEG #1 is a correct, safe, proven hardening for a real-but-UNREACHED code path
(a stranded participant BEGIN) — but it is NOT this demo's fix and its scenario
does not occur live. Per the E-cheap discipline (revert wrong-leg fixes; a series
of refutals should widen research, not ship a clever variant), RECOMMEND reverting
`a9344058` and pivoting to the real binding blocker: the ledger self-move interlock
deferring ratings provisioning + the self-move sql-routed-write quorum degradation
(the `formation-ledger-self-move-blocks-cluster-ops` / over-target-accounting
domain — memory s6/s7). Keeping LEG #1 is harmless (no-op) but overclaims in its
commit message and leaves an unexercised speculative path.
