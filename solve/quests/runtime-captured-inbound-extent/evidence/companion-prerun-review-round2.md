# W07 companion independent pre-run review — round 2

APPROVE the exact revised test/helper/plan below for a test-only checkpoint and first normal locked native whole-file baseline run. This is not approval of production source, a passing result, Quest completion, release activation or merge.

Reviewer: subagent:/root/native_witness_verifier, 2026-10-15.
Worktree: /mnt/data/peter/projects/.worktrees/runtime-captured-inbound-correction-20261015
HEAD remains a7e821154f1039df82bfc73ef4f2e25e4fa0468d; production src diff is empty.
I ran no tests, native code, mutations, static checker or lab job and changed no source.

## Final content identities

SHA256:
- test/raft/raft-rs-backend/runtime-captured-inbound-boundary-native.test.js: 9cb552e83ef5fcdcc1ab0248961b7e2b9f14961542b3c1178fad3a95b8d2c1ff
- test/raft/raft-rs-backend/runtime-captured-inbound-companion-fixture.js: 4ac1dce5cc8bb72de533055b03ea892fb212fbd24d16b586edac21243fdc014e
- solve/quests/runtime-captured-inbound-extent/evidence/COMPANION-WITNESS-PLAN.md: b88dfed4f3766440c5762c388095d872b1c5b8a1da1b7db836edab0f3ae6e3b5
- test/shards/impact-contracts.json: 990de129808dba6556f7cccf428136c2b555725c961852bac49a64b9b4e8e1cd
- inspected generated test/shards/impact-graph-seal.json: 6e3bc92817f77a7c3fa141a3e000fb6bf611f7e6a6de98758fa16fd7b8a2701d

The frozen W07 remains SHA256 07f9cd3a396b1036f96e2130efa454f1702b7acc6ad7e45b14274c5c3a3bce8d / Git blob debc16f442ba63b100332d93b285865d36d1c376.

Prior round is immutable:
- /tmp/lagrange-runtime-correction-20261015/w07-companion-prerun-review.md
- SHA256 24ae96250bc882e4694aebb04b3c01d00066f51559914c5195508be4e303f15e
Its full source/hash inventory, ownership map, schedule analysis and limitations remain applicable. The author preserved the reviewed old files at /tmp/lagrange-w07-companion-pre-review.atIrox. I compared each revised file against those bytes.

## Findings resolved and remaining limits

1. R1 resolved at test:180-187. The exact selected outcome, actual durable commit/applied positions and actual marker count are recorded before assertions. Marker replay and position equality precede the selected-success assertion. A before-ensure treatment that produces an actual native proposal refusal can now retain its full reason/phase and distinguish successful reconstruction from subsequent ordering failure. It counts only if the raw first run establishes that mechanism. No missing-symbol, setup, wait-engagement or timeout failure counts.

2. Root's separate duplicate-setup finding is resolved structurally at fixture:50-59. The copied bespoke quiescence loop was removed. Existing PartitionNodeCluster.settle/deliverAll now own both setup propagation and transport quiescence, with a conjunctive one-applied-command and empty-inbox predicate. The setup marker proposal also checks the real result.

The actual native heartbeat interval is THREE ticks, from src/raft/raft-rs-group-constants.js HEARTBEAT_TICK, used directly by src/raft/raft-rs-runtime-tuning.js::tuningOf. It is not calculated as heartbeatMs/tickIntervalMs=5. PartitionNodeCluster.settle (:344-357) ticks only A once per round, then deliverAll (:325-334) can tick A once more if it had inbound messages. After finite append/commit traffic finishes, a heartbeat round produces B/C replies for A; the three-tick period allows a following round with no new heartbeat, in which those replies can be consumed and all inboxes empty. Recipient ticks do not recursively invoke settle. This excludes the proposed heartbeat-every-tick nontermination schedule for the actual fixture. No native execution is claimed. A failure to reach setup remains a fixture failure.

The new setup uses settle's existing default 200-round bound for election and combined commit/quiescence, instead of the removed custom 12-round quiescence loop. Plan:53-59 now says so explicitly. The manual heartbeat and partial-quorum setup bounds remain 12; measured clocks, production intervals, outer execution deadlines and service bounds are unchanged.

3. The current C1 microtask-order proof in round 1 still holds: the already-fired wake enqueues DRAIN on the selected internal runtime token; the test awaits the outer lifecycle/containment Promise. With unheld synchronous sendFor, remainder processing completes before the outer await resumes. Both native inputs/replies can be preserved before the direct ordering negative. No passive observer drives that progress.

4. The newly added guard case remains an explicit final-announcement trap making the old runtime unhealthy before destructive dequeue. Actual generation replacement happens during its separately marked later B.tick. It proves preservation/recovery, not autonomous remainder progress. Consumed-wake service is proved by the different no-rescue case.

5. No new blocker found. Round-1 setup limitations remain: partial PartitionNodeCluster construction can escape caller cleanup, and a setup-catch dispose failure can replace a setup error. Neither may be called a semantic RED. Measured-case cleanup catches its rollback/dispose failures, releases held sends after diagnostics, retains unsettled storage and preserves the first body failure. Ordinary native proposal entry does not imply durable application. Reply generation does not imply remote processing. No transport deadline, snapshot, TX1/release protocol, total capacity or cross-host certification is claimed.

6. Impact registry remains within the two existing owner contracts; generated seal changes only producer/source/snapshot digests. No pair, authority or production path was added. Parent-owned generation/static checking and exact committed identity still must be recorded with the first execution.

## Category-complete round-2 disposition (43 items)

Paths abbreviated here exactly as in round 1: T = final boundary-native test; H = final companion fixture; R = src/raft/raft-rs-runtime-owner.js; P = src/raft/raft-rs-operation-port.js; L = src/raft/raft-rs-replica-lifecycle-owner.js; A = src/raft/raft-rs-persistence-admission.js; D = src/raft/raft-rs-peer-delivery.js; F = test/raft/raft-rs-backend/partition-node-cluster.js. All are evidence paths, not executed proof.

| Item | Final source evidence and bounded disposition |
| --- | --- |
| Harness 1 — right RED | T:67-70,101-102,230-231,180-191 name actual order/loss/refusal mechanisms. R1 now retains the negative result. Execution/treatment proof pending. |
| Harness 2 — seam honesty | F:147-194 real ports/SQLite; H:73-87 genuine send delay; T:150-158,201-210 explicit faults, no injected success. |
| Harness 3 — time fidelity | H:50-59 setup driver changed explicitly; F:344 default 200; T:60,84,161 unchanged owned intervals. No measured compression. |
| Harness 4 — fields | H:144-151 full-envelope hash plus exact accepted reason; H:121-127 native arguments; T:180-185 actual result/positions/count. |
| Harness 5 — nonvacuity | H:56-59 actual application and empty inboxes; T:33-38 actual held predecessor; H:171-178 steps/replies/admissions; T:173,184 real wait/replay. |
| Harness 6 — live binding | R:342-359 native entry paired with H:73-87 real output. Native fixture binding only; first locked run is pending. |
| Concurrency 1 — sync gate | R:961-987 and L:240-255 are existing gates; T:31-39,85-89 prove the selected/wake queue cuts. |
| Concurrency 2 — after await | T:166-195 covers actual ensure wait; T:198-237 guards current execution before dequeue. R:1736-1742 is intended capture point. |
| Concurrency 3 — single winner | Existing ordinary/scheduled FIFO R:961,1820; T:66,97,188 exact selected count and T:235 no replay. No new durable claim CAS. |
| Concurrency 4 — timer reentry | T:84-89 observes callback/request while Ready is held and native steps remain one. |
| Concurrency 5 — key honesty | Existing group/peer key; H:119,131-134,160-168 scopes actual group/B messages. No global mutex claim. |
| Recovery 1 — live custody | R:583-590 does not clear inbound during invalidation; T:198-237 requires h2 preserved through actual shared replacement. Broader caches unengaged. |
| Recovery 2 — discriminator | T:136-141 actual application host failure versus T:209-219 core trap; R:920-932 chooses the existing scope. |
| Recovery 3 — lost enrollment | TX enrollment unengaged. H:149-150,176-177 and T:222-223 explicitly require accepted occurrences rather than inferring empty custody. |
| Recovery 4 — atomic replay | F:187-193 afterCommit; T:140-141 commit>applied; T:181-185 preserves exact one replay and aligned durable positions before outcome. |
| Recovery 5 — absence | T:220-237 combines no selected entry with positive admissions, failure and later step/reply; T:180-185 supplies positive recovery facts for the negative. |
| Transport 1 — ACK | H:149-150 custody receipt separated from native step/reply at H:171-178. No remote processing claim. |
| Transport 2 — late result | T:73-103 keeps the original Ready and queued service across late send completion; SERVICE_RESPONSE waiter policy unengaged. |
| Transport 3 — classification | No new shapes. T:218-219 exact phase; T:183 full selected outcome; D:74-85 unchanged classification. Frozen W07 retains actual peer-refusal control. |
| Transport 4 — bound | H:184 releases all test-held sends; A:45,60-61 supplies existing persistence bound. Disconnected-router timeout unengaged. |
| Transport 5 — stub fidelity | F:165-173/H:73-87 preserve real native packet and Promise. Fixture transport is explicit, no fabricated router success. |
| Sweep 1 — clock | H:93-102 injects actual clock; existing referenced custody timers stay referenced per A:55-61, no generic-unref override. |
| Sweep 2 — authority | H:50-70 actual leader/follower formation and heartbeat; T:193-195 native forwarding. No synthetic role/authority. |
| Sweep 3 — crash equivalent | T:198-237 actual failure/new generation, T:120-195 durable reconstruction, no manual record deletion. Snapshot/caches outside scope. |
| Sweep 4 — expiry | Existing poll/budget, released after one poll interval at T:161. No obligation expiry or deadline change; exhaustion behavior not certified. |
| Sweep 5 — self starvation | T:73-103 observes existing queue ownership and requires no-rescue remainder. Finite schedule only; no infinite-load or memory-bound proof. |
| Owner 1 — single owner | R decides capture/consumption; P/L lifecycle, A persistence, native core protocol. H/T do not adjudicate readiness. |
| Owner 2 — typed seam | P:299-320, R:1945-1982 and existing outcome constants; real SQL hold, not counterfeit admission. |
| Owner 3 — paired invariant | T:51-71 preaccepted tail/order; T:73-103 selected service/remainder; T:198-237 failure refusal/retention. Same-trace tests present, results pending. |
| Owner 4 — stale then fresh | T:217-237 failed old turn then canonical new-generation service without selected retry; T:178-185 actual admission/replay. |
| Owner 5 — pressure/backoff | T:33-38,80-89,172-186 respects predecessor, Ready and store wait; no forced progress/retry loop. Other impact suites remain needed. |
| Owner 6 — wake | T:84-95 actual callback-to-FIFO transfer; T:178 releases SQL; R:1820 existing queue. No unconditional rearm authority. |
| Owner 7 — projections | H:113-178 passive assertions; only T:150-158,201-210 active faults. Diagnostics never progress the measured work. |
| Owner 8 — negatives | Final T unchanged across future source treatments; Plan:80-84 excludes setup failures; T:183 now retains exact negative provenance. Treatments not run. |
| Owner 9 — escape hatch | No measured status/settle/deliverAll. T:228 explicit separate recovery tick; H:50-70 setup driver; H:181-209 cleanup cannot prove service. |
| Owner 10 — alignment | impact-contracts.json:563,597,666; final Plan:33-43 and Quest DESIGN:9-11. Existing owners, same Quest, classified checkpoint still pending. |
| Admission 1 — same state | R:1731 and R:1147 consult actual A:persistenceAdmission; T:155 real connection BEGIN. |
| Admission 2 — transient/terminal | T:138 actual application failure, T:218-219 current-runtime failure; terminal reseed/close excluded from success claims. |
| Admission 3 — budget | A:45,60-61 unchanged existing bound/poll; H:35-40 passive seam guard is not a service deadline. |
| Admission 4 — reason shape | H:149-150 exact inbound reason; T:183 full result; T:218-219 native phase. No coercion or synthetic outcome. |
| Admission 5 — release observable | T:61,91 genuine send settlement; T:159-161,178 real SQL rollback/poll; T:94-102 subsequent no-rescue service. No wall-clock budget claim. |
| Admission 6 — freshness | T:55-60 after-enqueue arrivals; T:177 during ensure wait; T:198-237 current execution before destructive dequeue. |
| Admission 7 — identity | H:131-134 named actual replica/group, H:122-127 exact native arguments, T:151 actual B peer; T:183 includes canonical progress/outcome. |

## Stop boundary

Approval is content-bound to these exact test bytes and their declared native baseline attempt. Preserve raw first failures, input/source identities, stdout/TAP and exit codes without retry-until-green. An unexpected setup or seam failure requires classification and a newly reviewed revision, not a semantic-red claim.

No new runtime source is reviewed or approved in this receipt. Frozen W07, historical evidence, the accepted release rejection and all broader successor/merge holds remain intact.

