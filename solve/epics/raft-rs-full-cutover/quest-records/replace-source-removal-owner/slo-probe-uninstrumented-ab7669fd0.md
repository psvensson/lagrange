# SLO probe on tv-dator at ab7669fd0 (diagnostic, not the release gate) - 2026-09-26

Batch stopped at the FIRST red (owner rule): 5 green, run 6 red. 6 of 10 runs executed.

## Host
- tv-dator, 12 cores, `lab fleet` speed **x1.23** (controller x1.00), ready + free before launch, thermal headroom OK (cpu 63C, load 0.21).
- Clone /home/peter/projects/lagrange at 4b6229d01 (census-final); lockfile sha256 82d5f5d6f759... identical at ab7669fd0 => clone `node_modules` symlinked, no `npm ci`.
- Worktree /home/peter/projects/lagrange/.lab-worktrees/slo-probe-ab7669fd0 detached at ab7669fd091c856e6eadce68fd55ff5679bcbd7e (verified). Removed after the batch; bundle and ~/slo-probe removed; the fetched commit stays as refs/lagrange-slo-probe/ab7669fd0. Clone status clean, lock free, no holder record left.
- Machine lock: four-line flock recipe (`flock -w 600`), holder {"project":"lagrange","agent":"claude:slo-probe","controller":"peter-System-Product-Name","purpose":"test:slo-probe","sha":"ab7669fd0...","startedAt":"2026-09-26T12:19:43Z","expectedMinutes":20,"pid":249925}.
- Batch env (mirrors the lab placement wrapper): LAGRANGE_PLACEMENT=local LAGRANGE_TEST_MACHINE_FACTOR=1.3 LAGRANGE_LANE_JOBS_CAP=11 LAGRANGE_LAB_AGENT=claude:slo-probe. The SLO test itself does not read the machine factor (its budgets are the constants below).

## SLO thresholds (test/integration/node-join-convergence-slo.integration.test.js @ ab7669fd0)
- line 46: `const SETTLE_TIMEOUT_MS = 20000;` - settle window; assertion line 620 "cluster should settle within convergence SLO window (inFlight=..., quiet=Nms)"
- line 47: `const QUIET_WINDOW_MS = 5000;` - leader-quiet bound SETTLE+QUIET = 25000 ms, line 628
- line 48: `const MAX_SUSTAINED_OVERTARGET_MS = 2000;` - line 632 "over-target voter duration should stay bounded (Nms <= 2000ms; evidence=...)" (the tail that blocked prior gates)
- line 50: `const INTEGRATION_TEST_TIMEOUT_MS = 120000;`
- The test prints no separate "join time" line. What it reports per run is the `quiet=Nms` (time since the last leader change at the end of the settle loop), the leader-quiet diagnostic `(Nms)`, the leadership-change count and the over-target voter duration `(Nms <= 2000ms)`; the runner adds `ok|not ok FILE (N assertions, Tms)`.

## Runs (batch.out + run-N.tap, host-output/)
| run | verdict | over-target ms (<= 2000) | quiet ms | leader changes | runner wall ms | batch wall ms |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | ok | 0 | 6948 | 0 | 53582 | 53838 |
| 2 | ok | 0 | 7231 | 0 | 53979 | 54223 |
| 3 | ok | 0 | 6509 | 0 | 54154 | 54383 |
| 4 | ok | 0 | 6809 | 0 | 54660 | 54886 |
| 5 | ok | 0 | 6568 | 0 | 54339 | 54573 |
| 6 | **not ok** | **20159** | 18577 | 1 | 74832 | 75081 |
| 7-10 | not run (stopped at first red) | | | | | |

Green runs: all four SLO assertions pass with over-target = 0 ms (the test's samples never counted a 4th voter), settle in the first sample after join.

## Run 6 red: failing assertions (run-6.tap, subtest "settles after join without prolonged over-target voters", 3 of 36 assertions fail)
- `not ok 4 - cluster should settle within convergence SLO window (inFlight=[{"operationId":"replace-op-b0b98821c956268ed7774ca615a1662a","partitionId":"replica_operations-p1","operationType":"REPLACE","sourceNodeId":"...440201","targetNodeId":"...440202","replicaId":"replace-replica-804a44382c8f7676e0f5d04aed17f26e","status":"active","workflowStep":"ACTIVE","createdAt":1790425493244,"updatedAt":1790425498006,"completedAt":null}], quiet=18577ms)` at test:620
- `not ok 7 - over-target voter duration should stay bounded (20159ms <= 2000ms; evidence={"partitionId":"replica_operations-p1","firstObservedAtMs":1790425498206, ... "lastObservedAtMs":1790425518020, "firstObservedToLastObservedMs":19814,"firstObservedToClearedSampleMs":20159,"clearedSampleAtMs":null})` at test:632
- `not ok 8 - final voter counts should not exceed target`
- `ok 5 - leader quiet diagnostic should remain bounded (18577ms)`, `ok 6 - leadership changes should stay bounded (1 <= 180)`
- over-target voter rows (t.comment): replica_operations-p1 has 4 voter-ready rows: r1, r2, r3 all on node ...201 (seed) and replace-replica-804a4438... on node ...202 (joiner); **every row raftRole=follower, status=active** at the end of the window.
- Timeline (epoch ms -> UTC): REPLACE created 1790425493244 (12:24:53.244Z), last updated 1790425498006 (12:24:58.006Z, +4.8 s = ACTIVE); 4th voter first observed 12:24:58.206Z; still 4 voters and REPLACE still ACTIVE at the last sample 12:25:18.020Z; settle deadline expired at 20159 ms with clearedSampleAtMs=null. The REPLACE never left ACTIVE inside the 20 s window.
- run-6.log (LAGRANGE_LOG_FILE) is 0 bytes: the file logger only received error-level entries in runs 1, 3, 4, 5 (ECONNREFUSED / CDC shut-down lines during teardown) and nothing in runs 2 and 6, so there are no node log lines for the red beyond the tap output. Last 30 lines of run-6.out are the later subtests (all ok) and the summary `# { total: 36, pass: 33, fail: 3 }`, `# time=73658.898ms`, `# test-files total=1 pass=0 fail=1 assertions=42`.

## Commands run
Controller, worktree /mnt/data/peter/projects/lagrange/.claude/worktrees/o1-gate (HEAD == ab7669fd0), nothing heavy local:
  node scripts/lab.js fleet ; node scripts/lab.js fleet --json ; node scripts/lab.js list
  git bundle create <scratch>/ab7669fd0.bundle HEAD --not 4b6229d0194bbc31a2c5b9719a971fac14d4c423   (a bare sha is refused as "empty bundle"; HEAD is ab7669fd0; --not = host HEAD = merge-base)
  scp <scratch>/ab7669fd0.bundle <scratch>/batch.sh peter@192.168.86.32:~/slo-probe/
tv-dator (ssh peter@192.168.86.32, PATH += ~/.nvm/versions/node/v22.23.2/bin):
  git fetch ~/slo-probe/ab7669fd0.bundle HEAD:refs/lagrange-slo-probe/ab7669fd0
  git worktree add --detach .lab-worktrees/slo-probe-ab7669fd0 ab7669fd091c856e6eadce68fd55ff5679bcbd7e ; ln -s ~/projects/lagrange/node_modules <wt>/node_modules
  (setsid nohup bash ~/slo-probe/batch.sh > ~/slo-probe/batch.out 2>&1 < /dev/null & echo $! > ~/slo-probe/batch.pid)
  batch.sh (copy in this directory): lock recipe, then for N in 1..10: LAGRANGE_LOG_FILE=<wt>/test-output/slo-probe/run-N.log node scripts/run-classified-test-files.js test/integration/node-join-convergence-slo.integration.test.js > <wt>/test-output/slo-probe/run-N.out 2>&1 ; cp .tap result -> run-N.tap ; sleep 5 ; exit at the first red
  polling: ssh + grep/tail of ~/slo-probe/batch.out at 60 s intervals (Monitor + one bounded on-host wait loop)
  collect: scp -r <wt>/test-output/slo-probe/* and ~/slo-probe/batch.out -> <scratch>/host-output/
  cleanup: git worktree remove --force .lab-worktrees/slo-probe-ab7669fd0 && rmdir .lab-worktrees && rm -rf ~/slo-probe

## Classification (prose)
Same failure class as the A2 tail recorded on 102e127c4 (a2-slo-classification-lab.md): the join triggers a REPLACE of a replica_operations-p1 replica from the seed (201) to the joiner (202), the REPLACE reaches ACTIVE ~4.8 s after creation, the partition then carries 4 voter-ready rows, and the REPLACE's remove step never completes - here not a 2.5 s tail but a full stall for the whole 20 s settle window (over-target 20159 ms, REPLACE still ACTIVE, no clearing sample). All four rows are followers at the end with only one leadership change recorded, which is consistent with the ACTIVE-phase remove-safety evaluation never reaching SAFE (leader-ownership / voter-floor deferrals with refresh-pending participation reads, the mechanism named in the earlier record), but this probe has no recorder instrumentation, so that is a hint, not a proof. Rate on this host at ab7669fd0: 1 red in 6 (the earlier record had 0 reds in 17 instrumented tv-dator runs), so the tail reproduces on the reference lab host, not only on the slow ones.
