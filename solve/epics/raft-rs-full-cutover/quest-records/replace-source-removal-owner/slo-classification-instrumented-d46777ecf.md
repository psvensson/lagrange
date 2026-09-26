# Instrumented join-SLO acceptance batch at fc9861157 (production d46777ecf = F4 + F1/F2/F3/V1a/V2), tv-dator, 2026-09-26

Acceptance measurement for fix-f4 against the mechanism classified in `classification.md` (ab7669fd0): per-episode over-target must be 0 in every run. Same recipe as the earlier batch (recorder v4, MODE=observe so every run measures the REPLACE episode, poll 200 ms, level poll off). Recordings: `host-output-inst-fc9861157/out-fc9861157/` (rec-N.ndjson, run-N.timeline.txt, run-N.tap, summary.txt, batch.out).

- SHA `fc9861157c6d4a715517920cbe92aad4bf6a608c` (HEAD of `quest/o1-committed-read-gate`), bundled `refs/slo/fc9861157 --not 4b6229d01` (host base). Lockfile hash unchanged at this SHA (82d5f5d6f759), so the host `node_modules` symlink was reused; no `npm ci`.
- Batch: N=10, KEEP_GOING=1, all 10 ran (16:43:52Z-16:48:14Z, lock acquired at once, thermal ok 52-65C), `runs=10 reds=0`. Every probe attached: no `WRAP_MISSING`/`WRAP_ERRORS` in any summary line (the recorder's wrapped names all exist at this SHA; the S9 poll reads `lastAttemptSeq`/`lastAttemptUncertain`, now derived from the handoff attempt via `handoffAttemptSummaryOf`).
- Test file, cluster helper, runner and thermal check unchanged between the two SHAs, so the observer variant is byte-identical in construction.
- Host after the batch: worktree `.lab-worktrees/slo-inst-fc9861157` removed, `~/slo-probe-inst` removed, holder cleared, checkout untouched at 4b6229d01; fetched commit pinned as `refs/lagrange-slo-probe/fc9861157` (the driver's named fetch expects a bundle HEAD; this bundle carried `refs/slo/...`, so the bare fallback fetch ran and I added the ref by hand).

## Per-run table (ms relative to the REPLACE ACTIVE write; same REPLACE shape as before: `replica_operations-p1` r2 on seed 201 -> `replace-replica-804a...` on joiner 202, owner node 202)

| run | verdict | test ot ms (<=2000) | window opens (target row active/follower) | STOPPING | terminal | episode (open -> STOPPING) | evals safe/leader/floor (all steps) | reads of 201 deferred, codes | reads of 202 deferred | wakes / fallback fires | target leads at | PCPRP on 201's completed snapshot |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ok | 1443 | -304 | +1152 | +1555 | 1456 ms | 4/1/0 | 6/9, `[rp]` only | 2/3 | 3 / 0 | +896 | published at +518 (during) |
| 2 | ok | 836 | -164 | +551 | +981 | 715 ms | 4/2/0 | 9/12, `[rp]` only | 2/4 | 5 / 0 | +189 | before ACTIVE (-4806) |
| 3 | ok | 773 | -288 | +426 | +925 | 714 ms | 4/2/0 | 9/12, `[rp]` only | 3/4 | 5 / 0 | +215 | before (-3731) |
| 4 | ok | 1130 | -214 | +564 | +983 | 778 ms | 4/2/0 | 6/12, `[rp]` only | 3/4 | 5 / 0 | +227 | before (-3555) |
| 5 | ok | 802 | -163 | +497 | +929 | 660 ms | 4/2/0 | 6/12, `[rp]` only | 3/4 | 3 (+1 timeout re-entry) / 0 | +301 | before (-3489) |
| 6 | ok | 806 | -130 | +563 | +973 | 693 ms | 4/2/0 | 9/12, `[rp]` only | 3/4 | 5 / 0 | +309 | before (-4845) |
| 7 | ok | 1392 | -298 | +708 | +1151 | 1006 ms | 4/1/0 | 6/9, `[rp]` only | 2/3 | 4 / 0 | +452 | at +318 (during, before the SAFE at +423) |
| 8 | ok | 0 | -112 | +389 | +816 | 501 ms | 4/2/0 | 12/12, `[rp]` only | 4/4 | 5 / 0 | +232 | after (+1724) |
| 9 | ok | 1072 | -245 | +484 | +935 | 729 ms | 4/2/0 | 9/12, `[rp]` only | 3/4 | 5 / 0 | +211 | before (-3953) |
| 10 | ok | 840 | -303 | +398 | +790 | 701 ms | 4/2/0 | 9/12, `[rp]` only | 3/4 | 3 (+1 timeout re-entry) / 0 | +207 | before (-4458) |

Per-episode verdict: **0 of 10 episodes over target** (max episode 1456 ms, max test-reported over-target 1443 ms, both under the 2000 ms bound; the previous head measured 3 of 5 episodes over target, two of them >= 14.3 s). Floor deferrals: **0 in 10 runs** (previous head: 130/42/128 per red). Fallback timer fires: 0 in 10 runs. One handoff attempt per run, `accepted`/`transfer_forwarded`/`trackedRole follower`; the target leads 189-896 ms after ACTIVE (term 2, single election). No red, so no red sequence table is needed; the common green sequence is below.

## The sequence in every run (identical in all 10)

| t | event | source |
|---|---|---|
| -304..-112 | target row active/follower: 4 voter-ready rows, window opens | `cache-svc` |
| 0 | ACTIVE CAS ok, lease stamped | `op-write` |
| +5..+421 | EVAL#1 (`execute_reconcile`): DEFER "replacement leader ownership pending"; reads of 201 deferred `[planning_snapshot_refresh_pending]`; witness leader r1 -> ISSUE | `remove-safety`, `witness-read`, `named-handoff` |
| +2..+20 ms later | EVAL#2 (same turn, 8 of 10 runs): 201 read `eligible [PCPRP]` (served the completed snapshot), still LEADER defer while the transfer lands; witness `L=null/t2` in 6 runs | `remove-safety` |
| +134..+452 | attempt 1 -> target candidate t2 -> leader t2 in 30-72 ms; seeds follow | `step-down`, `transfer`, `role-after-transfer`, `consensus` |
| +156..+717 | 1-2 wake evaluations (`replace_owner_wake`): witness leader = target -> `named-handoff` safe; reads of BOTH nodes deferred `[rp]` ONLY -> `isEvidenceAbsentReadinessDenial` true -> floor carve-out counts the rows -> **SAFE** | `remove-safety` + `participation` calls |
| +381..+665 | STOPPING intent persisted (witness = target, commit index) | `intent`, `updateStep` |
| +389..+1152 | STOPPING in the seed cache; STOPPING evaluation SAFE (F3: the post-intent send re-runs remove safety, second `intent` record); REMOVE_REPLICA effect ok; S9 phases `intent_effect_pending` -> `source_row_retiring`; source row gone | `cache-op`, `effect`, `diag`, `cache-svc-gone` |
| +790..+1555 | completeOperation REMOVED; diagnostic cleared | `completeOperation`, `diag null` |

## Is the readiness mechanism gone from the recordings?

Two facts composed the stall on ab7669fd0. They are answered separately:

1. **Fact 2 (deferred snapshot inheriting PCPRP): GONE.** In 7 of 10 runs `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` was already on 201's completed snapshot 3.5-4.8 s before ACTIVE (the exact pre-condition of the three old reds), in 2 more it arrived during the episode, and in every run every deferred read of 201 (and of 202) answered `[planning_snapshot_refresh_pending]` alone: 0 deferred reads carrying PCPRP across 10 runs (old reds: 387/393, 126/132, 387/387). The eligible reads carry `[PCPRP]`, as before (informational reason on an eligible verdict). `collectDeferredReasonCodeSet(snapshot, decisionDimension)` at fc9861157 (`readiness-planning-publication-contract.js`) copies reasons only when the deferred verdict was itself a denial on the read's dimension, which is what these recordings show. Consequently the floor carve-out (`priority-publication-safety-topology.js:183-190`) counts the seed rows and the completion-safe floor never prints "(2/3)".

2. **Fact 1 (owner-read variant served a STALE deferred snapshot within ms of a current publication): NOT gone, now harmless.** The owner's `replica_operation_owner_read` participation reads of the remote node 201 are still deferred in 50-100% of reads per run (6/9 .. 12/12; old greens 12/12, 12/15), 10-150 ms after 202's own current eligible publication of 201, and the publication token still rotates 2-4 times inside each 0.4-1.2 s episode window (7 of 10 runs: `202>201` tokenChanges 3-4 in <= 0.7 s), i.e. the planning identity is still rotating at a few Hz while the REPLACE evaluates. The episode-window publication storm of the old reds (17-19 pubs/s for 5-14 s) does not recur, but no window here is long enough to say whether it would. Whether the rotation is the liveness flap (F4's "projection moves forward only") or another source-change term is not identifiable from this recorder (no `readSync`/`readReadinessAdmissionEvaluatedTerms` probe; the one open observable named in `classification.md` still stands). What the recordings do prove is that with Fact 2 removed, Fact 1 no longer changes any evaluation's verdict: a deferred `[rp]`-only read is counted by the carve-out exactly like an eligible read.

Alternatives (for completeness): no owner-unavailable release / early close / planner REMOVE, no SQL-fallback op write (all CAS with lease), no handoff refusal or re-issue, `visibility:null` on every evaluation, no lost fallback fire (none armed to fire: every chain was resolved by a wake first). S9 phase labels now follow the handoff decision (`active_attempt_unresolved` with `lastAttemptSeq null` no longer appears; phases seen: `intent_effect_pending`, `source_row_retiring`, reasons `source_removal_effect_pending`, `source_membership_removal_pending`, `effect_revalidation_inputs_moved`), so the secondary finding of `classification.md` is also closed.

Perturbation acknowledged: 200 ms role/diagnostic poll, 25 ms cache poll, level poll off; the read/publication ratios above are counts of production calls, not recorder timing.
