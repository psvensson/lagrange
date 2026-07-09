# Instrumented reproduction s14 — the fork is resolved: durable 4-voter overshoot, drain never planned

Session s14. User-directed targeted instrumented reproduction to decisively pick
between the two tractable upstream fix directions the s14 verification left open:
**(1) upstream over-creation prevention** vs **(2) the guard's stranded
replacement-credit** (`partition-service-learner-promotion-methods.js:525-533`).
The node logs alone could not distinguish "4 genuinely-active voters" from "3
active + 1 status-lagging voter" — that distinction decides the fix. This re-runs
the b6181f69 confirmation with an **extended** diagnostic that also captures the
paired-REMOVE (drain) state and the per-voter status series.

Instrumentation (`TEMP-VDIAG-S14`, reverted after; raw NDJSON preserved under
`instrumented-run-evidence-s14/`):

- **Guard side** (`partition-service-learner-promotion-methods.js`, at the
  over-target promotion defer): at the exact defer, enumerate every voter row the
  guard counts with per-voter `{raftRole, status, nodeId}`, plus
  `activeStatusVoterCount` / `laggingStatusVoterCount` / `distinctVoterNodeCount`
  and the deferred learner id. Re-fires each deferred recheck → a status series
  over the 60s window.
- **Planner side** (`move-planner-move-calculation-methods.js`, after
  `candidateRemoves` is built): the planner's `activeCount` (status==ACTIVE) vs
  `activeVoterCount` (raft_role) divergence, `surplusVoterCount`,
  `distinctRoleVoterNodeCount`, and decisively **`drainRemovePlanned` /
  `drainRemoveTargets`** — does the planner ever emit a REMOVE to drain the
  surplus this cycle?

## Runs (3× affinity demo, trap-6: N runs = N modes)

| run | outcome | guard over-target defers | voter-ready-60s timeouts | planner lines |
|---|---|---|---|---|
| 1 | abort [2/4] | 0 | 0 | 119 |
| 2 | abort [2/4] | **59** | **4** | 157 |
| 3 | abort [2/4] | 0 | 0 | 23 |

Run 2 captured the failing voter-promotion mode. **All three runs abort at the
SAME downstream gate** — step [2/4] ratings load fails with
`Unable to satisfy minimum routable provisioning cohort … provisionable=0 …
operation_ledger_quorum_concentrated` on a data table. See the honesty caveat
below.

## The fork is resolved (run 2, `sql_transaction_participants-p1`)

**Sub-case = 4 genuinely status-active voters, NOT status-lagging.** Every one of
the 59 guard over-target defers is uniform:

```
active=4  lag=0  distinctNodes=3  activeVoterCount=4  target=3  maxAllowed=4  replAllowed=true
```

`laggingStatusVoterCount = 0` on all 59 — at the guard-defer moment the four
voters are all `status=active` on 3 distinct nodes (two co-located). This is a
real, fully-materialised 4-voter overshoot, not a status-lag illusion at the
guard. Row dump (guard view), deferred learner = `…-p1-r6`:

```
r2 follower active  node e106822e   \ co-located pair
r3 follower active  node e106822e   /
r4 follower active  node 8d1da401
r5 follower active  node c5f9720b
r6 (learner) creating node 6a48f314   <- waiting to promote = would be 5th voter
```

**The drain is never planned.** 50 of 58 planner lines for the partition:

```
surplus=4  target=3  activeCount=3  activeVoterCount=4  roleVoters=4
distinctNodes=3  candidateRemoveCount=0  drainRemovePlanned=false  addMoves=0
```

Part 1's authoritative cap **is** firing (`surplus=4>3`, `addMoves=0` — it now
sees the raft_role surplus the status read misses), but it only zeroes adds:
**`candidateRemoveCount=0`, `drainRemovePlanned=false`** — the planner emits **no
REMOVE** to drain 4→3. Confirmed live. By contrast, the 19 over-target planner
lines that *did* plan a drain are all on OTHER partitions
(`sql_write_operations-p1`, `sql_transactions-p1`) via a `node_not_in_target`
voter — those partitions converged.

**Why no drain candidate is generated** (the sharpening the row dump adds):
REMOVE generation is keyed to *node* over-representation (spread), and the
surplus voter that should drain is the **source of an in-flight REPLACE** whose
removal candidate is suppressed by `hasPendingMove` — exactly KILL2 from the
prior adversarial vet (`unified-rebalancer-move-execution.js` matches a REPLACE's
SOURCE id). The planner's owner-node view even shows the cross-node status lag
directly: on that node `r4` reads `status=creating raftRole=follower` (a promoted
voter whose status lags) while the guard node sees `r4=active`. The divergence is
real, but the guard's over-count is genuine.

**Deadlock shape:** a prior replacement over-stacked the group to 4 status-active
voters; `r6` (a *second* replacement learner) waits for its source to drain; the
source will not drain (`hasPendingMove` suppresses its REMOVE + REPLACE
drain-after-promote ordering); `r6` cannot promote because 4→5 exceeds
`maxAllowed=4` → 60s timeout ×4. There is **no syncing voter waiting to resolve**
— the overshoot is durable, not transient, so the "credit assumes a drain that
lands late" timing case does not apply here.

## Verdict against the pre-committed decision table

| observed | verdict |
|---|---|
| 4 genuine `status=active` voters (lag=0 ×59) **+ drain absent** (`drainPlanned=false`, `candRemoves=0` ×50) | **upstream over-creation** — not the stranded-credit-timing case, not a spread-blind-to-distinct-nodes case |

The binding defect is the **durable surplus that never drains**, and the drain is
re-confirmed (now live, third time) to be **structurally blocked** at the
`hasPendingMove`/REPLACE-source seam — i.e. "just plan the drain" walks straight
back into the twice-vetted-dead KILL2. Therefore the tractable lever is
**upstream: stop the group from over-stacking to 4 voters in the first place**,
keyed on the authoritative raft_role voter count (the same read Part 1 introduced
into the ADD cap), extended to the REPLACE-mint / replacement-promotion boundary
so a second concurrent replacement is not minted/promoted while the authoritative
voter count is already at target with an undrained prior-replacement source.

Do **NOT** build a standalone surplus-drain (KILL1/KILL2, industry-wrong absent
joint consensus). Do **NOT** pursue the stranded-credit-timing fix as primary —
the evidence shows no late-resolving syncing voter; the credit is stranded
because a *drain that is structurally never planned*, not because it lands late.

## Honesty caveat — necessary, very likely not sufficient

All three runs abort at the identical downstream gate
(`operation_ledger_quorum_concentrated → provisionable=0` at [2/4]), and **runs 1
and 3 reach it with ZERO voter-ready timeouts and ZERO over-target defers.** So
the voter-surplus deadlock is *one* trigger of the ledger concentration, not
provably the sole binding blocker for the demo. A correct voter-surplus fix is
necessary for the run-2 failure mode but, on this evidence, unlikely to green the
demo by itself. Any fix here MUST be validated by live 2-pre/2-post A/B (the hot
REPLACE-mint path), and the residual [2/4] ledger-concentration abort (present
even without voter timeouts) is a separate, still-open blocker.

Instrumentation was temporary and has been reverted; src is clean.
