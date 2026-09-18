# Formation failure causal packet (2026-09-18)

The question: why does a five-node cold formation whose seed is not starved
sometimes never reach schema admission? This packet is built from six nightly
runs, using only their uploaded artifacts: the live report and the five node
logs. No GCP time was used and no behaviour was changed.

| night | run | head | verdict | seed unexplained blocking in window |
| --- | --- | --- | --- | --- |
| 09-13 | 34735728337 | 0d66b0cb6 | FAIL | 0.6 % |
| 09-14 | 34803119771 | 5532b74b1 | PASS | 2.1 % |
| 09-15 | 34925405521 | 3b1fd7877 | PASS | 1.4 % |
| 09-16 | 35052200699 | 3b1fd7877 | FAIL | 3.6 % |
| 09-17 | 35178550079 | 3b1fd7877 | PASS | 4.3 % |
| 09-18 | 35303538995 | 8ea49df09 | FAIL | 1.7 % |

The last column is the verdict's own starvation measure: event-loop gap
time *not* explained by tagged work, as a share of the formation window. It
is not busy time. The seed is busy most of the window (90 % over the
attribution window of the 09-17 calibration run). The verdict calls a seed
starved above 10 s × machine factor (30 s here) or above 25 % of the window.
The epic's "< 10 % of the window" budget is not implemented anywhere
(`scripts/checks/formation-budget.js` does not exist).

Artifacts are archived at
`~/.local/share/lagrange/evidence/formation-health/<run>.tar.gz` on the
controller. Times below are seconds from the formation window's start
(`formationVerdict.window.startMs`).

## Which comparisons are valid

- **The primary comparison is 09-15 PASS, 09-16 FAIL and 09-17 PASS.** All
  three ran the same commit, 3b1fd7877, on the same runner, zone, machine
  class and machine factor. The GCP nodes run an image built with
  `npm ci --omit=dev` from the lockfile, so the product under test is
  byte-identical across the three.
- **Not identical: the driver's dependencies on the runner.** The workflow
  re-resolved them every night (`--package-lock=false`; npm reported 258, 259,
  260 and 261 changed packages on 09-15 to 09-18). This affects only the
  driver, which is the admission observer's client. It is repaired by
  formation-health-verdicts.
- **09-18 has no pass at its own commit.** 09-13 and 09-14 are also at other
  commits. These three are secondary comparisons. The mechanism below appears
  at every commit.

## The terminal labels are observers

- **`node_ready_lease_incomplete` does not discriminate.** The verdict uses
  this reason whenever admission failed and any rebalancer "waiting for
  transitional cluster membership to settle" line named an unready node
  (`examples/service-data-affinity/formation-verdict.js`, `decideReason`).
  Every run, passes included, has 285 to 643 such waits, with all five nodes
  unready at the last one.
- **`control_plane_pressure` is the admission observer's terminal state.**
  In 09-18 it came with "Timed out opening admin websocket". The seed's admin
  API was accepting connections the whole time (207 connects during the
  wait), at the same rate as in the passes (1.2 to 1.45 per second).
- **What does discriminate is admission never reaching `quiescent`.** The
  driver polls the seed's control-plane quiescence snapshot for about 178 s
  after the formation window. The passes reached quiescent after 81, 88 and
  157 s. The failures ended that wait in `operation_drain_progressing` (09-16)
  or `observation_unavailable` (09-13 and 09-18).

## Failing run, node and nearest pass

- **Failing run:** 09-16. The planner is on the seed n0 (6b9a8908). The stuck
  learner is on n2 (57b2dbab): replica `schema_operations-p1-r5`, operation
  `08b39435`, with `sql_transactions-p1-r5` (operation `7d73d84e`) in the same
  state.
- **Nearest passes:** 09-17, same commit, the same mechanism earlier; 09-15,
  same commit, the same planner decision honoured.

## Timeline, 09-16

| time | node | event |
| --- | --- | --- |
| +243.7 | driver | admission wait starts (`operation_drain_progressing`: replica operations in flight, critical spread open) |
| +258.9 → +272.2 | n0 → n3 | ADD `schema_operations-p1` r4 to n3: voters 3 → 4 (target 3), promoted, completed |
| +272.9 … +303.4 | n0 | rebalancer, repeatedly: "Deferring spread-driven count-increasing ADD while already at/over target" (target 3, active voters 4, distinct nodes 2 of 3 required, `prioritySpreadGapOpen: true`, `overTargetCapAddDecision: retain_spread_cure_adds`, one ADD retained) |
| +300.3, +300.6 | n2 | bootstrap readiness: `warming → degraded` (`PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`), then `degraded → warming` (`READINESS_STABLE_WINDOW_PENDING`) |
| +304.7 | n0 | executes the retained ADD: `schema_operations-p1` → n2, which would make a 5th voter |
| +308.4 | n2 | learner r5 created. **"Learner promotion deferred: would_exceed_target_replica_count"** (active voters 4, learners 1, target 3, `maxAllowedVotersAfterPromotion: 4`), repeated every second |
| +308.8 → +309.3 | n0 → n2 | same for `sql_transactions-p1` r5 (operation `7d73d84e`) |
| +368.7 | n2 | "Replica schema_operations-p1-r5 did not become voter-ready within 60000ms"; the operation fails |
| +370 … +415.6 | n0 | recovery: REMOVE the failed learners, re-ADD elsewhere, REMOVE the seed's surplus replicas |
| +409.9 … +421.5 | driver | `observation_unavailable` ("stale_usable: cache_stale_watermark"); the wait ends and admission is denied |

## The first PASS/FAIL divergence

**The learner-promotion count check, applied to a spread-cure ADD that the
planner retained at voters = target + 1.**

| run | refused 5th voter | when | outcome |
| --- | --- | --- | --- |
| 09-14 | no: granted; the 5th-voter operations completed in 3.2 to 4.8 s | +257 to +263 | PASS |
| 09-15 | no: granted; completed in 2.9 to 7.1 s | +346 to +351 | PASS |
| 09-17 | yes: 3 learners stalled 61 to 64 s (2 failed) | +237 to +245, at the start of the wait | PASS (recovery done by +332, quiescent at +401) |
| 09-13 | yes: 4 learners (3 failed), and again at +360, +362 and +432 | +298, before and into the wait | FAIL |
| 09-16 | yes: 2 learners | +308, 64 s into the wait | FAIL |
| 09-18 | yes: 4 learners (3 failed) | +290, at the start of the wait | FAIL |

The planner's decision to retain the ADD appears in all six runs. The
partition's refusal appears in all three failures and in one pass. In that
pass the refusal came early enough for the 60 s stall and the recovery to
finish inside the wait.

## Responsible boundary and the missing arrow

Two owners answer one question: *may this critical system partition hold a
voter above target + 1 while its spread is open?*

- **The planner on the seed**
  (`src/rebalancer/replica-placement-cure-policy.js`,
  `classifyPriorityOverTargetSpreadCureCondition`, applied in
  `move-planner-priority-spread-cure.js`) retains a spread-cure ADD whenever
  voters are above target and the partition sits on fewer distinct nodes than
  required. It has no upper bound relative to target + 1.
- **The partition on the learner's node**
  (`src/partition/partition-service-learner-promotion-methods.js`) promotes
  only up to target + (1 for a replacement or single-voter expansion) + the
  `temporaryOverflowVoterBudget` from
  `src/control-plane/priority-recovery-completion.js`.
  - That budget is 2 or 0.
  - It is derived from the learner node's own view: its bootstrap readiness
    reason (`PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`) or the priority-recovery
    planning answer of its local control-plane readiness service, plus the
    operations visible in its system-table cache.

The ADD carries nothing of the planner's sanction to the partition, so the
partition re-derives it and can disagree. When it does, the operation cannot
complete by any route other than the 60 s voter-ready timeout. After that the
planner undoes it and re-plans. This cost 60 to 110 s per occurrence and
recurred in 09-13.

**The missing arrow: the planner's over-target spread-cure decision does not
reach the learner-promotion guard, which consults a different authority.**

## Not yet demonstrated (stated gaps)

1. **Which of the learner node's inputs made the budget 0 at +308.4.** The
   refusal log records only the result (`maxAllowedVotersAfterPromotion: 4`).
   It is not the bootstrap readiness reason alone: in 09-15, n3 granted the
   same step while it too was `warming`. So n3's local planning answer showed
   the spread gap and n2's, by elimination, did not. That has to be read, not
   inferred: from the simulator ingesting the 09-16 run, or from the refusal
   logging its inputs.
2. **Why the observer ends in `observation_unavailable`** (a stale cache
   watermark in 09-13 and 09-16; websocket open timeouts in 09-18). In all
   three it follows the stall and the recovery churn (09-18: from +368, after
   the failed operations at +351 to +353). It is not shown to be an
   independent cause, and not shown not to be.
3. **Sub-second seed blocking in the admission phase** was not measured. The
   gap watchdog's threshold is 1 s.

## Competing explanations and their falsifiers

| explanation | falsified by |
| --- | --- |
| Seed event-loop starvation (formation window) | the verdict's starvation rule fired in none of the six nightlies (unexplained blocking 0.6 to 4.3 %) or in the 09-17 calibration run (7.4 %), yet three nightlies failed; the one run of the period in which it fired, the 09-13 calibration run on 8a6275a4d (63.1 s, 18.5 %), passed. By this measure starvation is neither necessary nor sufficient for failure |
| Seed starvation after the window | 2 to 3 watchdog gaps of about 1 s per failing run over a 178 s wait (sub-second not measured) |
| Ready-lease incompleteness as the cause | present in every run with all nodes unready at the last wait, passes included; it is the verdict's classification order |
| Driver dependency drift | the 09-16 fail sits between passes whose trees differ by one package each way; the mechanism is node-side and the node image is lockfile-exact |
| The seed's message-router WebSocket error flood | 31 k (09-16 fail) against 36 k (09-17 pass) |
| "Attempted to write to read-only cache" | present in passes (09-14, 09-15), absent in 09-17 pass |
| Admin connection volume | 1.2 to 1.45 connects per second in every run |
| Commit-specific regression | the same refusal at four heads (0d66b0cb6, 3b1fd7877, 8ea49df09) and absent at 5532b74b1 and in one 3b1fd7877 pass |
| Timeout too short | not a cause: the refused promotion cannot succeed at any timeout, because the partition refuses deterministically every second |

## What this packet does not decide

Which of the two owners becomes the single authority, and whether the cure
is REMOVE-first at voters = target + 1, a sanctioned overflow carried on the
operation, or something else, is the decision this packet is for. Nothing here argues for
a longer timeout, a longer admission wait or a larger budget.
