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

## Tier 2a — hedging live A/B (quest 4) — PARTIAL: no-regression PASS, engagement UNBINDABLE

- Run 1 (`tier2a-run1-report.json`): FAIL before load dispatch —
  `nodeAdmissionBlocked: 14465`, dominantReason
  `publication_missing_active_node` (the tracked CL-004 load-admission
  class); transient — run 2 passed on identical setup.
- Run 2 (`tier2a-on-pass-report.json`): **PASS** with hedging ON (the
  shipped default) — 200 ms injected follower latency, success rate over
  threshold, p50 34 ms / p95 297 ms / p99 371 ms. Live no-regression
  evidence: the hedging change does not destabilize the read/write path
  under a slow follower.
- Hedge ENGAGEMENT could not be bound on this vehicle, for two
  independently sufficient reasons: (1) `SPECULATIVE_EXEC_START` is
  logged at debug level (`parallel-query-coordinator-hedging-methods.js:266`)
  and harness containers run at info — absence in logs proves nothing;
  (2) the scenario's load table is single-partition, and hedging is gated
  on multi-partition fan-outs (`partitionIds.length > 1`), so no hedge can
  fire regardless. The OFF arm was therefore skipped as information-free.
- Follow-ups for a binding A/B: an info-level hedge counter (or metrics
  surfacing in the harness report), and a multi-partition load table —
  which requires the provisioning prerequisite below.
- Run deviations: `timeouts.nodeStartup` raised to 120 s (seed cold boot
  exceeds the default 30 s no-progress window on this machine);
  `--no-fast-local` hermetic runs (root-owned `.tmp/reuse-data` from
  aborted runs breaks container reuse; SRC fingerprint guaranteed by
  image rebuild).

## Tier 2b — managed-merge live ladder (quest 5) — BLOCKED (scenario built, committed)

The `partition-merge-under-load` scenario + failure variants + config +
unit tests are complete, gates-green, and committed; see quest
`managed-partition-merge-live-validation` (BLOCKED finding with evidence
under `solve/changes/managed-partition-merge-live-validation/`). 4 of 4
product runs died in the pre-existing
`operation_ledger_quorum_concentrated` admission storm before the merge
machinery emitted a single log line (SRC_FINGERPRINT verified each run;
analyzers: `dominantReason=nodeAdmissionBlocked`,
`failureMode=partition_growth_stalled`). None of the five binding
observables was evaluated.

## Final verdict

- **No live regression attributable to the five-quest batch was found
  anywhere in Tiers 0-2.** Membership and join paths are live-healthy
  (quest 2 fully live-validated, twice over); hedging is live-stable at
  its default; the SQL and merge correctness quests rest on their
  real-execution in-proc guards.
- **The single gating issue for the remaining depth (live SQL oracle,
  hedge-engagement A/B, the entire merge ladder) is the pre-existing
  formation/provisioning admission storm** — now reproduced on BOTH
  harness vehicles and at the pre-batch commit. Fixing the open
  `formation-ledger` lineage unblocks all three in one stroke; the
  scenarios and scripts to run afterwards are committed and ready.

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
