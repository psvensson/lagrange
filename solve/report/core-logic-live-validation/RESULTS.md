# Live-validation results — 2026-07-12 core-logic quest batch

Executes [`solve/epics/core-logic-live-validation.md`](../../epics/core-logic-live-validation.md).
Evidence in this directory is the immutable copy (scratchpad and mutable
data dirs rot); the formation-probe entries live in
[`formation-probe-runs.ndjson`](../formation-probe-runs.ndjson) keyed by
timestamp + gitHead.

## Tier 0 — deterministic re-proof on HEAD (2fbc2eee) — GREEN

- All five quest scenario runners PASS on final HEAD (45/45+13/13+6/6,
  43/43+12/12, 71/71+9/9, 30/30+47/47, 51/51+112/112+61/61+35/35).
- Full test pipeline: every lane green, exit 0.

## Tier 1 — live smoke

### Formation probe ×2 — SAME-AS-BASELINE (not a batch regression)

Both HEAD runs (`formation-probe-runs.ndjson` 2026-07-12T18:53:12 and
T18:59:45, gitHead 2fbc2eee9, docker) end `TIMEOUT` with the
`operation_ledger_quorum_concentrated` deferral storm (1342 / 888) and the
ratings partition never ready — byte-for-byte the signature of the two
pre-batch archive entries (2026-07-10, gitHead 919c3452b: 794 / 546,
CREATE_TABLE_FAILED / TIMEOUT). Verdict: the known open formation lineage
(frontier: formation-promoted-voter → formation-ledger-quorum-concentrated
successor), reproduced identically before and after the batch. No new
signal attributable to the five quests.

### Live SQL oracle (quests 1+3) — BLOCKED BY KNOWN ISSUE

`tier1-live-sql-oracle.mjs` (this dir): 3-node local cluster forms in
~2.5-3s, but table provisioning never completes — first CREATE TABLE takes
3 attempts, the second fails 8/8 (admin timeouts + one "Workflow
transition rejected: ownership lease expired"), with 2365
`operation_ledger_quorum_concentrated` deferrals on the seed
(`tier1-live-sql-oracle-run3.log`). Same pre-existing lineage as above; the
live correctness diff cannot be measured until table provisioning
converges. The in-proc guards (real per-partition SQLite executing the
delivered SQL) remain the standing correctness evidence for quests 1+3.

### Fresh-join live (quest 2) — PASS

`tier1-fresh-join-live-pass.log` + `tier1-fresh-join-joiner.log`: 4th node
with candidates `[localhost:9 (dead), localhost:8084 (node-1, follower)]`
joined a live 3-node cluster in **2193 ms**; identity-proven — the
joiner's recorded `seedNodeId` (cc03e3a7…) equals the follower node-1's
nodeId exactly, and the log shows contact attempts on the dead candidate
before rotation. (An earlier FAIL in `tier1-fresh-join-live.mjs` history
was a script port-math bug — 8090 is node-2's message-router WS port,
PORT_STRIDE=4 → follower REST is 8084.)

## Tier 2c — fresh-join formation stress (quest 2) — PASS 3/3

`tier2c.log`: joiner started FIRST with every candidate down; first-listed
candidate (node-1) brought up LAST. All three cold formations converged to
4 active nodes in 24-32s (joiner-visible formation 24035-32200 ms), no
retry-budget exhaustion. The unprobed-fallback + per-retry rotation path is
live-proven.

## Tier 2a / 2b — in progress

- 2a hedging A/B: pending (runs after 2b to avoid docker contention).
- 2b managed-merge ladder: quest + scenario development delegated; see
  quest `managed-partition-merge-live-validation` once authored.

## Standing conclusions so far

1. Nothing in Tiers 0-2c attributes any live regression to the five-quest
   batch. Membership-path operations (formation 2.5-3s, join 2.2s,
   stressed formation <35s) are healthy on HEAD.
2. The single blocking pre-existing issue observed is the
   table-provisioning stall (`operation_ledger_quorum_concentrated` storm)
   on the EXAMPLES-harness bring-up path (formation probe + ad-hoc
   local clusters). It blocks the live SQL oracle as scripted here. The
   distributed test harness uses a different benchmark-table bootstrap
   that historically provisions successfully (its own admission gaps are
   tracked as CL-004/CL-005), so Tier 2a (existing scenario) and 2b (new
   scenario on the same harness) are attempted on that vehicle; if the
   same stall class appears there, the open formation-lineage quest
   becomes a hard prerequisite.
