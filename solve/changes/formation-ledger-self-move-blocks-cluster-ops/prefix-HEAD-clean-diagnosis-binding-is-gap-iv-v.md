# Clean current-HEAD diagnosis: the binding settle-stall blocker is gaps (iv)+(v), NOT gap (ii)

Fresh pre-fix diagnostic at current HEAD (post-revert `692c9dbb` = local-only arm-2),
run `data/examples/service-data-affinity-demo` (archived
`run-2026-07-07T08-52-12-009Z`), stdout `scratchpad/prefix-diag-run1.stdout.log`.
Known provenance (unlike the earlier muddy fix-adjacent artifact).

## Demo outcome
- **[1/4] settle STALLED** — completions plateau at 15, inFlight climbs 1→9, "no
  operation completed for 120s — proceeding anyway". **doneWhen settle FAILS.**
- **[2/4] load COMPLETES** (100000 ratings); post-load settle ALSO STALLS (11 inFlight,
  16 completed). Load half of doneWhen passes; settle half fails.
- Demo ends `converged:false, stalled:true` (aborts at [4/4], attributionRows=0 — [4/4]
  is explicitly OUT of this quest's scope).

So the binding blocker for THIS quest's doneWhen = the **settle stall**: formation ops
stop completing for 120s while several remain in flight.

## Why ops stop completing (quantified, this run)
The existing fail-on-timeout path WORKS: 6 ops timed out and ALL 6 durably terminalized
(FAILED/REMOVED, completed_at set) — `failOperation`'s terminal write lands. The stall is
NOT a broken fail path.

The non-completing ops are downstream of the **"No row found for CDC update"** root
(154 events this run — the CDC apply/reconcile routing to a replica that lacks the row):

- **Gap (iv) — premature reservation orphan-release: 7 distinct ops.** e.g. `4f9f74a9`
  (ADD tbl-…-p1) reaches ACTIVE (replica creation completed) then at +30s a reconcile
  read gets `No row found for CDC update` → **"Released orphan storage reservation during
  reconciliation"** → op abandoned before its completion transition → never terminalizes
  → stays in flight. Sibling quest `formation-reservation-reconcile-premature-orphan-release`.
- **Gap (v) — silent ledger write-loss: pervasive (154 No-row events; 18 ops deferring).**
  e.g. `b546e25c` (ADD tbl-…-p1) logs `Operation completed` (08:59:04) yet its durable
  row stays PENDING and it keeps logging `Deferred replica operation dispatch while
  control-plane path recovers` for minutes (09:02, 09:05). The completion UPDATE hit
  `No row found for CDC update` and was lost below the persistence layer. Sibling quest
  `routed-mutation-silent-ledger-write-loss`. Anchor: `partition-cdc-parameterized-sql.js:316-357`
  (update-apply that no-ops as "No row found" when the target replica lacks the row).
- **Budget-stranded dead-target REPLACE (the fail-then-replan / refined-Route-B target):
  NON-DOMINANT.** Only 2 budget-stopped ops this run; the earlier muddy run's
  `partitions-p1`/`latency_groups-p1` stranded REPLACEs do NOT recur. Stuck ops this run
  span live_queries-p1, sql_write_operations-p1, tbl-*, nodes-p1 — the orphan-release +
  write-loss mechanisms dominate.

## Consequence for direction
- Gap (ii) create-on-missing (on any placement): NO-OP (established by 4-route rubber-duck).
- Refined Route B (fail-then-replan the budget-stranded dead-target REPLACE): targets a
  REAL but NON-DOMINANT mechanism. Shipping it would fix ≤2 ops while the settle keeps
  stalling on the 7 orphan-release + 18 write-loss ops → doneWhen still red. Another
  wrong-leg (would not move the binding observable).
- **The binding settle-stall blockers at current HEAD are gaps (iv) and (v)** — the two
  mechanisms already ROUTED to sibling quests. The shared root is the CDC apply/reconcile
  "No row found for CDC update" write/read on a replica missing the (transiently-unhydrated)
  row. Leg A fixed the owner-RPC READ path; the remaining leak is the CDC WRITE/apply +
  reservation-reconcile READ path.

## Recommendation
Pivot from the gap (ii) / fail-then-replan route to the dominant blockers: gap (v)
silent ledger write-loss at the CDC apply layer (`partition-cdc-parameterized-sql.js`)
and/or gap (iv) premature reservation orphan-release (escalate the reservation-reconcile
op-visibility read to owner-RPC before releasing, symmetric to Leg A). Both directly
cause the "no completion for 120s" stall; either reduces stuck ops, and together they
should let settle reach inFlight=0. Re-validate with the same controlled live A/B +
the scenario-harness doneWhen (3x).
