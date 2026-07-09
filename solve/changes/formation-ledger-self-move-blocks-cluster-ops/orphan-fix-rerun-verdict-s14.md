# Orphan-census fix — live re-run verdict: KEEP (deadlock broken, control plane settles)

Decisive re-run (2 runs) after the topology-guard orphan-census fix (commit
`1ff668b8`), the sufficiency proof the vet flagged as not unit-provable.

## Result — the settle deadlock is broken

| signal | pre orphan-fix (post-[2/4]) | post orphan-fix (both runs) |
|---|---|---|
| `target_replica_count_already_satisfied` on replica_operations-p1 | 810× (blocked the spread ADD) | **0×** |
| replica_operations-p1 `totalVoters` | stuck 2 | **reached 3** (transient 4) |
| control-plane settle | STALLED 120s no-op | **"settled (no in-flight for 30s)"**, 0 stall lines |

The chain the design predicted is confirmed live: orphan excluded from the
count-census → spread ADD admitted (0 blocks) → `totalVoters` 2→3 → interlock
concentration hold releases → control plane settles cleanly. A clean settle is
only reachable if the interlock released, so this is direct proof the fix is
SUFFICIENT for its target gate. **KEEP** (committed `1ff668b8`).

## Honest caveats

- **Next gate (separate):** both runs now abort at `[2/4]` ratings load with
  `Error: Timed out waiting for admin response` (the demo's `AdminWsClient`
  `timeoutMs:15000`). This is a load-phase admin-request timeout, NOT the settle
  deadlock (which is now clean). It appeared pre-fix too. Possible interaction to
  check: the s14 [2/4] progress-gated re-wait can extend server-side provisioning
  to ~90s, while the admin client gives up at 15s — the client deadline may need
  to track the provisioning budget. Diagnose next.
- **Watch item (over-creation):** `totalVoters` transiently reached 4 (2 events
  per run). Expected to be the normal REPLACE add-then-drain window, bounded by
  the planner-side raft_role cap; confirm it drains and is not the orphan-census
  conservative-drop admitting a durable 4th. Low concern on this evidence.

## Net

Two layered gates cleared this session: [2/4] provisioning ledger-concentration
(progress-gated re-wait, A/B KEEP) and the control-plane settle deadlock
(orphan-census, this fix). The demo's remaining blocker is a load-phase
admin-response timeout — the next layer.

Evidence: `orphan-fix-rerun-evidence-s14/`.
