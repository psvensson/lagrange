# Budget diagnostic — the ledger-concentration blocker is BUDGET-BOUND (Rank 1 confirmed)

Session s14. Decisive diagnostic recommended by both the ledger-scoping and
reuse-map analyses: re-run the affinity demo with the CREATE-TABLE provision
budget raised 30s→180s (temporary `TABLE_CREATE_PROVISION_TIMEOUT_MS` bump,
reverted after) to distinguish **budget-bound** (progressing-but-slow spread →
Rank 1) from **dispatch-bound** (second spread REPLACE never dispatched → Rank 2).

## Result (2 runs)

| run | [2/4] provisioning gate | abort reason | reached | voter timeouts |
|---|---|---|---|---|
| 1 | still aborts | **`operation_ledger_self_move_in_flight`** (NOT quorum_concentrated) | [2/4] | 10 |
| 2 | **CLEARED** | none at [2/4] | **[3/4] service deploy** | 0 |

Both runs' `replica_operations-p1` concentration timeline shows
`maxVotersOnOneNode` dropping to **1–2** (spread progressed off the seed).

## Verdict — Rank 1 (budget-bound), and the blocker is LAYERED

1. **The [2/4] quorum-concentration blocker is budget-bound.** With 180s, run 2
   cleared the exact gate that aborted all three original 30s-budget runs and
   reached **[3/4]** (runtime-service deploy). Run 1's concentration ALSO cleared
   — its abort reason CHANGED from `operation_ledger_quorum_concentrated` to a
   different interlock. The bootstrap 3-on-seed → ≤1/node spread is a
   **progressing-but-slow** spread (two serialized REPLACEs), not a wedge. This
   confirms the reuse-map's Rank 1: the spread completes given time.

2. **The crude constant bump is NOT the fix** — it is the diagnostic. The
   disciplined fix is the reuse-map's Rank 1: extend the ALREADY-PRESENT transient
   re-wait (`sql-query-engine-initial-partition-provisioning.js:691-728`,
   `waitOutWholeClusterTransientProvisioningHold`) to the CREATE's full
   provisioning budget **gated on the concentration measure improving between
   probes** (reuse `evaluateOperationLedgerQuorumConcentration`,
   `operation-ledger-quorum-concentration.js:170`): keep waiting while
   `voters-outside-hottest` is increasing; fail fast if it is not budging. This
   is the masking-vs-legitimate line `alt4` drew — wait out a *progressing*
   transient, never a *wedge*. An unconditional longer wait is Rank 4
   (vetted-dead masking) and must not ship.

3. **The blocker is layered — Rank 1 is necessary, not sufficient for demo-green.**
   Clearing the concentration exposes the NEXT gate:
   - run 1: `operation_ledger_self_move_in_flight` interlock rejects the load-time
     provisioning cohort (the self-move serialization, a known sibling seam);
   - run 2: control-plane settling STALLED at [3/4] ("no operation completed for
     120s") → admin-response timeout during service deploy.
   So Rank 1 unblocks the demo-binding [2/4] gate (real forward progress: 0/3 →
   1/2 past provisioning) but downstream gates remain. These are the next targets,
   both in the same self-move / control-plane-settle family.

## Recommended next build

Rank 1 progress-gated re-wait extension (smallest reuse of the proven transient
re-wait), with:
- DT red-on-revert: a directed test where a concentrated ledger spreads slowly;
  assert provisioning waits while concentration improves and succeeds, and fails
  fast when concentration is static (wedge).
- Live 2-pre/2-post A/B on the affinity demo: KEEP if [2/4] clears without
  masking a genuine wedge.
- Note the layered next-blocker (self-move-in-flight / control-plane-settle) as
  the follow-on — Rank 1 alone will not green the full demo.

Temporary constant bump reverted; src clean. Evidence under
`budget-diag-evidence-s14/`.
