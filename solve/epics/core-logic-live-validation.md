---
id: core-logic-live-validation
status: open
proof: deterministic
legacy: true
roadmapRow: null
graduatesTo: null
quests: []
authorizes: []
legacyStatus: discussing
---

# Epic: Live validation of the 2026-07-12 core-logic quest batch

**Status:** plan only — nothing below has been executed.
**Scope:** the five committed quests: `distributed-select-global-merge-correctness`
(`58c88b6a`), `fresh-join-multi-peer-contact` (`46422656`),
`cross-partition-join-pushdown` (`3f59356d`),
`distributed-query-straggler-hedging` (`63b2cbfa`),
`managed-partition-merge` (`8e64e19f`).

## Intent

Every quest closed on `deterministic-guard` fidelity evidence, which proves
test-code binding, not live binding (the audit warned exactly this on each
closure). Each quest's log carries a live-validation finding from its
adversarial verifier. This epic turns those findings into a bounded live
program with explicit binding observables, run counts, and kill criteria.
Validation failures become NEW quests — no mid-validation patching.

Prerequisite reading for the executor:
`test/distributed/operational-ground-truth.md` (mandatory before any
distributed-harness work) and `test/distributed/harness/README.md`.

## Standing rules applied

- **Binding observable** (release-gate.md): every scenario names the live
  cluster signal it must move; agent logs alone don't count.
- **Run counts** (operational-ground-truth.md): N=3-4 for mechanistic
  verdicts; N≥8 only where a rate verdict is claimed.
- **Gate runs are a last resort**: this program uses targeted harness
  scenarios and the formation probe, not release-gate sweeps.
- **Client-visible transients ARE the bug**: sibling-range routing errors
  during merge cutover count as failures even if they self-heal.
- **Hot-path A/B** (2-pre vs 2-post): applies to hedging, which changed the
  read fan-out hot path.

## Tier 0 — deterministic re-proof on final HEAD (~15 min, no new work)

1. Re-run the five quest scenario runners on HEAD (all were green pre-commit;
   this pins the post-merge-of-all-five state): `run-distributed-select-merge-`,
   `run-fresh-join-multi-peer-`, `run-cross-partition-join-pushdown-`,
   `run-straggler-hedging-`, `run-managed-partition-merge-scenarios.js`.
2. One full test pipeline run (~8.5 min) for cross-suite interactions the
   per-quest sweeps could not see.

**Verdict gate:** any red here stops the program (fix-forward via a quest).

## Tier 1 — live smoke, existing tooling only (~30-45 min)

3. **Formation probe ×2** (`npm run demo:formation-probe`, ~4 min live
   signal each): the batch touched the join path; formation must be
   regression-free. Binding observable: probe verdict + formation time.
4. **Live SQL correctness (quests 1+3)**: 3-node cluster via the harness
   (`admin-query-smoke` / `examples-catalog` scenarios as the vehicle), run
   the aggregate/GROUP BY/HAVING/LIMIT-OFFSET/JOIN query set from the guard
   suites against live partitions and diff against a SQLite oracle built
   from the same inserts. Binding observable: byte-equal result sets over
   the live cluster. (The guard suites prove this in-proc; this run proves
   the real transport/partition-service path.) N=1 is sufficient —
   correctness is deterministic given a converged cluster.
5. **Fresh-join live (quest 2)**: extend nothing; run
   `three-node-seed-rebalance` live, then manually start a 4th node with
   `SEED_NODE_ADDRESS=<dead-addr>,<follower-addr>` and assert (a) join
   completes, (b) the bootstrap response came from the follower (log
   assertion on seedNodeId), (c) formation SLO respected. Binding
   observable: joined node reaches READY and serves reads.

## Tier 2 — targeted live scenarios (the real work)

### 2a. Hedging A/B (quest 4) — ~1 session

- Vehicle: existing `slow-follower-under-load` scenario (already induces the
  exact condition hedging targets), plus a config-off control.
- Protocol per the hot-path directive: 2 runs with hedging on (default) vs
  2 runs with `queryCoordinator.speculativeExecutionEnabled=false`
  (config-set for the control runs only — never a code flag).
- Binding observables: read-latency p95/p99 under the slow follower
  (must improve with hedging), `speculativeExecutions` metric > 0 in the
  hedged runs, result-set row counts identical across arms (no dup rows),
  and `speculativeExecutions ≈ 0` in a no-fault baseline run (no hedge
  storm — the verifier measured 0 under mild jitter in-proc; confirm live).
- Kill criterion: any duplicate row or hedge-storm signal (majority of
  partitions hedging without an induced fault) → stop, quest it.

### 2b. Managed-merge live ladder (quest 5) — 1-2 sessions, NEW scenario needed

The merge verifier's five unverifiable-in-proc items map to four scenarios.
A new harness scenario (`partition-merge-under-load`, mirroring
`seven-node-postgres-baseline-partition-split`'s shape) is the main work
item: lower `partition.mergeThresholdBytes/Qpm` via config so real merges
trigger, run a ledgered writer workload, and assert from the ledger.

1. **Happy path under write load** (N=3): 3+ partition table (split twice,
   then let auto-merge fire). Binding observables: merge lifecycle acks in
   node logs through SOURCE_DISSOLVED; writer-ledger vs post-merge full
   table scan (zero lost acknowledged writes — THE binding observable);
   zero client-visible routing errors on SIBLING ranges during cutover
   (CDC apply-order item; transient stale-route rejections on the sibling
   = failure); retired source raft groups actually gone (process/handle
   census per node); a SECOND merge on the same table completes (terminal
   clear works live).
2. **Source-leader kill** (N=3-4: mid-backfill and inside the cutover
   window): binding observables: no acknowledged-write loss (ledger),
   cluster converges to either aborted-with-sources-authoritative or
   completed-merge within the 2-minute cutover-wait bound; nothing wedges
   past 2× that bound (kill criterion). This exercises the failure-ack
   abort machinery plus the no-mirror-resume gap the verifier flagged.
3. **Merge × rebalancer churn** (N=3): merge concurrent with a REPLACE on
   a source replica (no interlock exists — advisory A2). Expected: abort
   via failure ack, data-safe. Binding observable: ledger intact, table
   retryable afterward. If the mirror survives and merge completes, also
   fine — record which.
4. **Abort → immediate retry** (N=3): inject a failure ack, force the next
   evaluation tick to retry. Binding observable: re-provisioned target
   becomes healthy despite possibly-in-flight teardown of the same
   partition id on some node (the reuse race). Wedge or split-brain
   descriptor state = kill criterion.

Deferred unless a signal appears (Tier 3): dual-owner-node interleaves
(needs owner placement control), overlapping-pair concurrent admission from
two owner nodes — both are last-writer-wins races the verifier judged rare;
watch for their signatures in scenarios 1-4 logs
(`analyze:distributed-failure` triage) rather than forcing them.

### 2c. Fresh-join under formation stress (quest 2) — ~half session

- N=3-4 cold formations where the FIRST listed candidate comes up LAST
  (candidates all down at joiner start — the unprobed-fallback + rotation
  path). Binding observable: formation converges within the existing
  node-join SLO; no joiner stuck on a dead candidate.

## Tier 3 — endurance (only if Tier 2 is green and a rate question remains)

- **Split→merge cycling** (N≥8 cycles in one run): split a table, let it
  merge back, repeat. Watches version-lineage drift, node heap/fd growth
  (the unbounded-snapshot class from CL-030/031), and dissolution debris.
- Release-gate sweep: only if a specific regression signal from Tiers 1-2
  needs population-level confirmation (last-resort rule).

## Work items (sizes)

| Item | Size | Notes |
| --- | --- | --- |
| Tier 0-1 execution | S | existing tooling only |
| Hedging A/B protocol + config-off control wiring | S | scenario exists; add metric assertions |
| `partition-merge-under-load` harness scenario + ledger assertions | L | the bulk; mirror the split scenario's structure |
| Leader-kill / churn / retry variants of the merge scenario | M | parameterize the base scenario |
| Fresh-join formation-stress variant | S | env-list parameterization of an existing formation scenario |

## Quest shape

Execute as one `scenario`-class quest per tier-2 lane (2a, 2b, 2c) so each
gets its own sealed doneWhen and honest terminal; Tier 0-1 needs no quest
(single-sitting, obvious proof). The merge lane (2b) is the priority-1
quest: it validates the only mechanism in the batch that mutates topology.

## Open questions

- Slow-replica induction for 2a: does `slow-follower-under-load` induce
  latency at the right layer (partition read path) for hedge triggering,
  or does it throttle transport-wide? Verify before trusting a null result.
- Merge threshold config: confirm `PARTITION_MERGE_THRESHOLD_BYTES/QPM`
  are runtime-settable per harness node env (they are config keys; check
  env plumbing) — else the scenario needs a config file per node.
- Writer-ledger reuse: `sustained-write-throughput` and the benchmark lanes
  have acknowledged-write ledgers; confirm one is reusable for the merge
  scenario's loss detection rather than building a new one.
