# U1 integrated lab verification and baseline discriminator — 2026-10-20

**Status: measured, NOT approved.** This is a preservation-only evidence note, deliberately committed on a separate evidence branch based on `be25caa5`. It neither changes nor certifies the tested U1 candidate; it is NOT a new authority, a green verdict, a new quest owner, or a main-merge authorization. The existing raft-rs epic/quest log, oracle and independent-verification protocol remain binding.

## Exact subject and comparison

- U1 integration candidate: `be25caa5f0c3612feec662d4feaa9ba28f8f34df`, `refs/heads/work/u1-integration-candidate-20261020`.
- Pre-U1 comparison: `381750de29af647d446b19adedf1da53eb712093`, `refs/heads/probe/rs-raft-stage1c-381750de2-20261017`.
- The two remote branch tips were checked before requests. All twelve failing test files were individually read from both refs and their Git **blob SHAs match**. Matching test bytes alone does not prove matching causal failures.
- Source tests ran on the permitted `tv-dator`, `lenovo-laptop`, `adam-laptop`, `adams-gamla` pool through controller `b4a2e06c193c44b09f1b67d02e8d80f4`. No source test was executed on the cloud controller. File-parallel placement is not distributed five-host certification.

## Candidate: four settled lab batches

| Lab issue | Files | Passed | Failed | Runner-reported assertions |
| --- | ---: | ---: | ---: | ---: |
| [#525](https://github.com/psvensson/lagrange-lab/issues/525) | 32 | 29 | 3 | 141 |
| [#526](https://github.com/psvensson/lagrange-lab/issues/526) | 31 | 27 | 4 | 1,632 |
| [#527](https://github.com/psvensson/lagrange-lab/issues/527) | 32 | 29 | 3 | 991 |
| [#553](https://github.com/psvensson/lagrange-lab/issues/553) | 32 | 30 | 2 | 350 |
| **Total** | **127** | **115** | **12** | **3,114** |

Each row is a terminal `COMPLETE/FAIL` executor result at the same source SHA. This is not the complete ~1,898-file corpus, a final negative-control suite, a mutational certificate, or a verifier approval. Failed files remain FAILED even if many child assertions passed.

### File-level failure ledger

| File | Observed failure/consequence | Lab |
| --- | --- | --- |
| `test/raft/raft-rs-backend/committed-membership-census.test.js` | Static exact-caller census rejects added consumers, including participant pause, message-group recipient, WASM genesis. Verify authoritative-reader boundary before changing census. | #525 |
| `test/raft/raft-rs-backend/durable-commit-replica-kinds.test.js` | Partition write refused `partition_write_cutover_paused`; message-group application durability observation; WASM invalid writer command. | #525 |
| `test/raft/raft-rs-backend/lifecycle-registry-runtime-generation.test.js` | Retire-call census finds a call that does not syntactically name `runtime:`. Determine exact source call; do not blindly weaken invariant. | #525 |
| `test/node/replica-create-admission-recovery.test.js` | Unsettled promise and cascaded cancelled child tests. Find first causal wait, not the many secondary cancellations. | #526 |
| `test/node/replica-handler-owner-path-bypass.test.js` | First outcome-emitter scenario does not settle; nested tests subsequently terminate without running. | #526 |
| `test/node/replica-handler-cache-state.test.js` | Fresh-create release authority unavailable during cache-only ACTIVE repair; subsequent tests abort. | #526 |
| `test/node/replica-handler.test.js` | 89-subtest suite aborted; later child tests never ran. Determine first causal error via full log, not its tail. | #526 |
| `test/partition/participant-release-first-prepare-native.test.js` | **First PREPARE creates durable obligation after production PAUSE.** This is a real safety counterexample, not cosmetic test drift. | #527 |
| `test/partition/participant-release-prepare-identity-native.test.js` | PREPARE identity/admission proof rejects. | #527 |
| `test/partition/partition-write-leadership-transfer-committed.test.js` | Serving-write setup fails; review both subtests and exact admission state. | #527 |
| `test/wasm-service/wasm-strong-write-native-completion.test.js` | `INVALID_WRITER_COMMAND` refusal means no durable proposal (assertion expects exact proposal position). | #553 |
| `test/wasm-service/wasm-writer-recreation-origin-v1.test.js` | **`OLD_WRITER_REVIVED_AFTER_RECREATION`** deterministic counterexample. | #553 |

Full native logs remain in the private lab's owned `executor.log` for each root request, with terminal comment log digest/length. Bounded, redacted evidence read receipts: [#532](https://github.com/psvensson/lagrange-lab/issues/532), [#533](https://github.com/psvensson/lagrange-lab/issues/533), [#534–#541](https://github.com/psvensson/lagrange-lab/issues/534), [#549–#550](https://github.com/psvensson/lagrange-lab/issues/549), [#554–#561](https://github.com/psvensson/lagrange-lab/issues/554). These are read-only evidence requests, not additional source execution.

## Same-test pre-U1 comparison

| Lab issue | Files | Passed | Failed | Role |
| --- | ---: | ---: | ---: | --- |
| [#543](https://github.com/psvensson/lagrange-lab/issues/543) | 3 | 0 | 3 | All three Raft-census/durability failures |
| [#551](https://github.com/psvensson/lagrange-lab/issues/551) | 7 | 1 | 6 | Four replica/node and two partition files, plus `partition-participant-release-admission` control |
| [#552](https://github.com/psvensson/lagrange-lab/issues/552) | 1 | 0 | 1 | `participant-release-prepare-identity-native` |
| [#562](https://github.com/psvensson/lagrange-lab/issues/562) | 2 | 0 | 2 | Both WASM writer failures |
| **Total** | **13** | **1** | **12** | **Comparison fails at same aggregate file count** |

The comparison result is **not** enough to mark each failure "inherited". Match each *first causal assertion / error / cancellation chain* between exact baseline and candidate. In particular, node parent-suite cancellations and one extra included positive control can obscure mismatched failure identities. Preserve per-file classification explicitly (`SAME_SIGNATURE_INHERITED`, `CHANGED_SIGNATURE`, `NEW`, or `INFRASTRUCTURE`). Do not count file-level aggregate parity as zero regressions.

### Safety and ownership decisions

1. The two **bold** counterexamples are release-relevant safety failures even if inherited from pre-U1. Route to established participant mutation-admission and WASM writer-state owners. Neither may be waived as a pre-existing baseline red for eventual release/certification.
2. Keep the U1 owner implementation scoped to finality, inventory/recovery lifetime, retirement serialisation, physical custody and journal completion. No unrelated opportunistic fixes in this frozen branch.
3. Complete the U1 adverse-witness / mutation kill matrix, owner vetoes and 55-item independent checklist against a single frozen candidate. Classification is not independent APPROVE.
4. Only extend the remaining full corpus in bounded, source-authorized lab batches; retain exact per-file and baseline signatures, first causal failures and log hashes, without suppressing tests or raising ratchets.
5. The distributed real five-host / GCP recovery, three consecutive frozen-SHA formation certifications, integrated independent closeout and **explicit owner's approval before merge** all remain outstanding.

At this checkpoint `solve/oracle/raft-rs-full-cutover.json` still reports `metric: 8`, `target: 0`, `status: transport-predecessor-in-progress`, `terminalEvidence: null`. This evidence-only note cannot change those facts.


## Continuation, 2026-10-20: bootstrap cone and explicit U1 acceptance gate

The next exact-source candidate run [lab #563](https://github.com/psvensson/lagrange-lab/issues/563) settled **COMPLETE/FAIL**: 32 files, **30 PASS / 2 FAIL**, **692 runner assertions**, candidate SHA unchanged `be25caa5`. The new cumulative candidate measured **159 distinct source test files, 145 PASS / 14 FAIL, 3,806 assertions**. This extends breadth but is not a full-corpus proof.

The two newly observed files (both have byte-identical committed test blobs at the pre-U1 baseline) are:

- `test/bootstrap/partition-activation-handler-boundary.test.js`: N2 exact-handler identity, activation vs retirement and successive-generation behavioral cases passed; the **N2 static removal-path census** rejected the shutdown/removal routing (“shutdown retires the handler in the lane before closing the store”). Full native log evidence was accessed through [#564](https://github.com/psvensson/lagrange-lab/issues/564) and [#565](https://github.com/psvensson/lagrange-lab/issues/565). Do not loosen the census without the owner authority and proof that no competing removal path exists.
- `test/bootstrap/fresh-join-registration-runtime-replacement.integration.test.js`: the fresh-join registration scenario did **not** reach its essential setup. Seed bootstrap refused participant release at `indices-p1` with `release_fact_unavailable`, missing `release_deadline`, budget 1,000 ms spent at ~1,006 ms after 13/46 releases. Subsequent join assertions have no valid prerequisite. Treat this as an actual readiness/release failure (with measured 1-second budget), not as proof of any registration/replacement behavior. The exact source log is accessible via [#565](https://github.com/psvensson/lagrange-lab/issues/565).

For same-SHA test-signature discrimination, the explicit pre-U1 comparison request [lab #568](https://github.com/psvensson/lagrange-lab/issues/568) targeted exactly these two files on `adam-laptop`. **At this note's measurement, it has no terminal evidence yet.** Do not infer inherited behavior or call the 1-second spent budget a flaky pass.

The explicitly required **thirteen-file positive U1 suite** was submitted as [lab #567](https://github.com/psvensson/lagrange-lab/issues/567) on the same original immutable candidate `be25caa5`; it had been claimed and was running, but is NOT certified or a PASS in this snapshot. Its complete file membership matches the named selection in `u1-finite-acceptance-checklist-and-cell-scope-20261019.md`. Await actual terminal counts before disposition.

Reading that existing checklist also confirmed the **seven separate U1 completion gates U1-1…U1-7** were marked OPEN in its own review snapshot: net nine-path production source review, immutable oracle tree checkpoint, corrected-source static gate, 13-file current positive selection, P0–P5 source-only controls, affected-owner compatibility, and category-complete independent 55-item combined conclusion. Earlier bounded F1 and physical source approvals **do not** grant whole-U1 approval or supersede these requirements. The adjacent Cell queued-START finding is explicitly not waived.

No candidate/main change and no U2/activation/GCP distributed certification authorization arises from any of the above. Keep the source frozen for the signature comparison and control-gate review.


## Continuation, 2026-10-20: required thirteen-file positive suite passed

[Lab #567](https://github.com/psvensson/lagrange-lab/issues/567) reached a terminal **COMPLETE/PASS** at `2026-10-20T08:49:41Z`, with **13/13 files PASS, 0 FAIL, 413 runner assertions**, and `executor.log` length 5,207 bytes. It ran the precise thirteen-file positive selection documented by U1-4 against the unchanged exact source `be25caa5f0c3612feec662d4feaa9ba28f8f34df`. This closes **the measured execution component** of U1-4 for that immutable source; independent evidence validation and complete U1 acceptance are still required.

The aggregate of candidate test-file *executions* reported so far is **172 runs, 158 PASS and 14 FAIL, 4,219 runner assertions** across six batches (#525, #526, #527, #553, #563 and #567); three of the thirteen positive-selection files also ran successfully in #553. Therefore the exact **distinct** tested files number **169**, with **155 distinct passing files and 14 distinct failing files**, rather than 172 unique files. All failures remain blockers until disposition, not hidden in the overall passing count.

Note the distinction between U1-4's positive suite result and U1-1, U1-2, U1-3, U1-5, U1-6 and U1-7: the latter have not been independently discharged by lab #567.


## Continuation, 2026-10-20: bootstrap baseline causal comparison

The same-host immutable pre-U1 [lab #568](https://github.com/psvensson/lagrange-lab/issues/568) completed at `2026-10-20T08:51:42Z`, **0/2 file PASS, 2/2 FAIL, 49 runner assertions**, pinned source `381750de2`. The 8,000-byte first native log slice [#569](https://github.com/psvensson/lagrange-lab/issues/569) identifies **the same first substantive failed subtest in both files** as integrated candidate [#563](https://github.com/psvensson/lagrange-lab/issues/563):

1. Partition activation handler boundary: N2 census, `shutdown retires the handler in the lane before closing the store`, fails on both. Its seven preceding individual N2 scenarios passed on candidate. Classification **SAME_FIRST_FAILED_ORACLE_IN_PRE_U1**, but full differing source-path semantics have not received independent review.
2. Fresh-join registration runtime replacement: prerequisite seed/bootstrap first fails with `Seed participant release failed`, `release_fact_unavailable`, missing `release_deadline`; both precede any claimed join proof. On candidate the observed seed shared budget was exactly 1,000 ms and was spent around ordinal 14 of 46 cohorts, after 13 successful releases. The code at `src/bootstrap/bootstrap-service-seed-workflow.js` computes **one shared absolute cohort deadline** from `config.leadershipWaitTimeoutMs` and advances it across all cohorts rather than granting 1,000 ms per cohort. This may explain predictable failure under ordinary host contention, but a budget policy change needs owner review and actual latency measurements, not a test timeout increase or pass waiver. Classification **SAME_SEED_RELEASE_PRECONDITION_FAILURE_IN_PRE_U1**.

These two now have *matched first-failure* evidence, stronger than matching file-level failure counts. They remain red for eventual release. No change to U1 code, budget, or oracle is authorized by this record.

The terminal **13/13 positive U1 run** remains [#567](https://github.com/psvensson/lagrange-lab/issues/567). This does not replace the outstanding source-review, mutation-control, full-corpus, Cell compatibility and independent 55-item certification work.
