# TX1 recovery-owner-key independent review

Verdict: **APPROVE, bounded source-change scope.**

Reviewed candidate `7722a36544df33394e78ccb72a20c484fe2c4fec` against exact base `b32f0eca960891cf937655077616e77a7e25e47b`. The same verdict applies to the TX1 delta in frozen composition `bc8a68193cae6d198f355124322b84ce9668d923`, based on `840d99ab9e638ca10f4e75aa50fd9b717d97b531`. This approves the repair for discovered transaction obligations occupying a client session that never began them. It is not overall TX1, service, release, publication, or process-loss acceptance. No blocking finding in the reviewed delta remains.

Independent verifier: Astra xhigh, subagent `/root/cdc_d1_review`. I wrote no production code. My detached candidate tree is `/tmp/session-worktree-jgoTxb/tx1`; exact predecessor is `/tmp/session-worktree-jgoTxb/base`. Only `review/tx1-independent/` was added to my candidate tree. Author and integration production trees were not edited. Root supplied earlier tests and prepared the composition; I checked their source custody and added separate probes. No push, merge, seal weakening, Quest mutation, new lab run, or production self-repair occurred in this review.

## Decision and locality

The first divergence is the restored workflow's ownership, not transaction decision validation. Before this patch, recovery calls the generic workflow restore with `ownerKey = session_id`, which installs the discovered obligation in `transactionsBySession` when that session map is empty. A restarted DEFAULT session or a different client reusing the old session ID therefore appears to own a transaction it never began. The independent base probe reaches this exact behavioral failure before using any newly added accessor: `hasActiveTransaction('transaction-recovery')` is true after discovery, contrary to the required false.

The candidate makes a narrow change at that seam. Discovery uses the existing workflow-by-ID registry with `RECOVERED_WORKFLOW_BINDING.WORKFLOW_ID_ONLY` and the recovery owner's key. It retains the row's original session ID for persistence and the existing request FIFO. A live transaction still uses its session key. Explicit COMMIT/ROLLBACK requests naming a retained recovered ID get the existing in-doubt answer; they neither adopt, decide, freeze nor mutate it. Bare session operations observe only the transaction that session began. Recovery still reads and validates the exact authoritative row before actuation. No second decision store, completion authority, alternate reader, retry loop or process lease was added.

The paired invariants hold in the same independent witness: a fresh session can BEGIN and retain an enlisted participant, while older COMMIT and ROLLBACK obligations with that same session remain held when authority is missing and finish through recovery once authority returns. The literal session key `transaction-recovery` does not confer recovery authority or make cleanup erase the live owner.

## Identity and composition

- [identity.json](identity.json) records the exact base/candidate, host, Node version, source roots, and SHA256 of all five modified runtime files. Candidate, root reviewer tree and composition bytes are identical for all five.
- [candidate-production.patch](candidate-production.patch) is the reviewed production delta. The extraction into `retainWorkflowById` retains committed transition-history restoration. Generic consumers keep the default owner binding.
- The composition's additional hand-written changes are the cognitive-complexity baseline tightening from 152 to 150, plus explicit no-adoption wording and the new decisive test in both `contract.tests` and `coupledPairs.witnessTests` for `transaction-workflow-recovery-ownership`. These preserve the existing contract and register its decisive proof. The runtime change is unchanged.
- [composition-impact-audit.log](composition-impact-audit.log) is my independent audit on frozen composition: PASS, 72 contracts and 44 coupled pairs, digest `d0d848ea2bdbfefb632540b7956475e1733710129b8be297a25e230c37639dff`.
- Root's normal precommit and generated metadata/inventory logs are retained under [reused/](reused/). Composition was clean at review. This review does not interpret a WIP commit or precommit success as publication authority.

## Measured evidence

| Evidence | Result and meaning |
|---|---|
| [probe.mjs](probe.mjs), [probe-candidate.json](probe-candidate.json) | Two independent probes pass on exact candidate. I1 drives actual SQLQueryEngine, coordinator, local SQLite gateway, recovery authority and immutable decision path. I2 drives the real generic workflow restore/transition/removal path. |
| [probe-base.json](probe-base.json) | Same probe source, same host/dependencies, exact predecessor: both fail through intended behavioral assertions. I1 fails because discovery grants old work to the session. I2 fails because ID-only restore still binds an empty owner map. Neither failure is an import, setup, missing-accessor or timeout failure. |
| [probe-composition.json](probe-composition.json) | Both independent probes pass on exact frozen composition. |
| [reused/tx1-focused-pristine.log](reused/tx1-focused-pristine.log) | Canonical classified runner on candidate: six applicable files pass, 206 runner assertions. Seventh file, poison attribution, has 14 runner assertions and three failing cases; see inherited-failure accounting below. |
| [reused/root-reviewer.patch](reused/root-reviewer.patch), [reused/tx1-independent-live-owner.log](reused/tx1-independent-live-owner.log) | Root's reviewer-only extension adds real-engine fresh-owner preservation checks for DEFAULT, client-7 and the literal recovery key. Seven cases pass. The added probes repeat old discovery and feed stale empty-participant discovery for the fresh live ID, then finish the old obligation and verify live metadata/enrollment. Root runtime bytes match the reviewed candidate. |
| [reused/tx1-composition-focused.log](reused/tx1-composition-focused.log) | Canonical six-file composition run: 206 assertions pass. Runtime and tested files are unchanged by subsequent registry/ratchet/generated-only composition edits. My own frozen-composition probes run after commit. |
| [reused/earlier-head-summary.txt](reused/earlier-head-summary.txt), [reused/earlier-base-summary.txt](reused/earlier-base-summary.txt), [reused/earlier-leaves.diff](reused/earlier-leaves.diff) | Earlier interrupted verifier's preserved secondary evidence: candidate 64 files, 37 pass/27 fail; base 63 files, 36 pass/27 fail. Matching per-file outcomes/counts for all common files. Only the newly added owner-key test lacks a base entry. Raw leaf differences are timing text, one property's seed/shrink/stack identity, the intentional Q5 witness rename, and four new green witnesses. Not a green corpus claim. The retained verifier head/base trees were clean and resolve to the exact candidate/base. |
| [reused/witness-H.tap](reused/witness-H.tap), [reused/witness-head.tap](reused/witness-head.tap) | Earlier four author witnesses are behaviorally red/green. These are supporting evidence; my own source-bound A/B probes establish treatment fidelity independently. |

I1 begins with two nonempty obligations: exact IDs `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` and `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`, one immutable COMMIT and one immutable ROLLBACK, each with an admitted `p1` and retained prepare evidence. Both use session `transaction-recovery`. Missing authoritative rows produce two held failures and zero participant calls. A fresh real-engine BEGIN/enlist succeeds. Four old-ID COMMIT/ROLLBACK requests cause no gateway mutation. Repeated discovery does not multiply recovery IDs. After seeding the authoritative rows, simultaneous sweep/sweep/resume routes the two decisions once each; the second sweep is single-flight skipped. Durable old statuses become COMMITTED/ROLLED_BACK, the fresh enlisted metadata is unchanged, recovered IDs clear and FIFO tails return to zero. Terminal workflow history remains in `workflowsById` (three records, including the live one); this is deliberately reported rather than called bounded reclamation.

I2 verifies restored transition dedup, no duplicate persistence for PREPARED replay, clearing that workflow's dedup on removal, preserving the colliding live owner on removal, an empty owner map remaining empty under ID-only restore, and default binding still working for another generic consumer.

Reproduction from the reviewer tree:

```sh
node review/tx1-independent/probe.mjs /tmp/session-worktree-jgoTxb/tx1
node review/tx1-independent/probe.mjs /tmp/session-worktree-jgoTxb/base
node review/tx1-independent/probe.mjs /mnt/data/peter/projects/.worktrees/codex-tx1-composition-20261025
```

Expected exits: 0, 1, 0. The `.json` output files also contain production logger lines before the structured result; they are exact stdout artifacts, not strict JSON-only documents. All first probe runs are preserved; no failed probe was repaired or discarded.

## Source and historical evidence keys

All source references below are under exact candidate unless noted. The same runtime bytes apply to composition.

| Key | Evidence |
|---|---|
| S1 | `src/query/distributed/distributed-transaction-recovery.js`: `heldRecoveryObligation`, `recoveryObligationAnswer`, `getRecoveryObligation`, `recoverFromSystemTables`. |
| S2 | `src/workflow/durable-workflow-coordinator.js`: `recover`, `restoreRecoveredWorkflowRow`, `retainWorkflowById`, `setWorkflowState`, `updateWorkflow`, `removeWorkflow`, `clearCommittedTransitions`; `src/workflow/workflow-constants.js`: binding enum. |
| S3 | `src/query/distributed/distributed-transaction-coordinator.js`: `begin`, `commit`, `commitOwned`, `rollbackOwned`, metadata; `distributed-transaction-statement.js`: `runTransactionOperation`, read/write admission. |
| S4 | `src/query/distributed/distributed-transaction-recovery-authority.js`: authoritative identity/set/decision validation and `redriveAuthoritativeRecovery`; `distributed-transaction-decision.js`: immutable decision record/adoption; `distributed-transaction-decision-protocol.js`: decision fanout and identity-guarded `endTransaction`. |
| S5 | `distributed-transaction-recovery.js`: `resumeRecoveredTransactions`, `runRecoverySweep`, timer/defer functions; `distributed-transaction-protocol.js`: participant attempts, budget and typed outcome handling; `distributed-transaction-coordinator-constants.js`: retry defaults. |
| T1 | `test/query/transaction-recovery-owner-key.test.js` W-R1 through W-R4; exact runtime engagement in root/candidate focused logs. |
| T2 | `test/query/transaction-recovery-ownership.test.js`, 14 cases: exact decisions, FIFO, durable PREPARED persistence, stale/live identity, detached retry, malformed/missing authority, nonempty census and late read admission. |
| T3 | `test/query/transaction-recovery-decision-validation.test.js`, 13 cases: invalid restored shapes, valid re-drive, lost admission answer, no false commit-point-negative. |
| T4 | `test/workflow/durable-workflow-{coordinator,recovery-identity,storage-ownership}.test.js`, green focused evidence. |
| C1 | Composition `test/shards/impact-contracts.json`: `transaction-workflow-recovery-ownership`, both contracts and coupledPairs. |
| C2 | Accepted `solve/quests/replicated-transaction-decision-and-apply/design-query-recovery-set-2026-10-11.md`; authority/recovery architecture contract. Scope is the existing admitted set, immutable decision and session FIFO, not a new lease. |
| H1 | Commit `d0f7f776cc2281a8d4bbfc93463420c55a4dec67`: run-23 stale empty recovery registry orphaned an enlisted participant. All four skip-live seams are still present: workflow replacement, participant hydration, recovered-ID enrollment and write-operation membership. |
| H2 | Commit `8d0fb8c1a8ef4546a40b8e044e3515823c0712fc`: poison recovery cannot announce readiness. Current inherited fixture failure is not evidence that this safety requirement is waived. |
| H3 | Composition `solve/quests/retained-seed-original-handoff/evidence/VERIFY-tx1-recovery-validators-r1-2026-10-26.md`, r2 follow-up: prior negative commit-point stamp fixed; finding (c) identifies discovered obligations in the session namespace. This candidate repairs that carried finding without reverting its validation repair. |

## Required checklist verdicts

PASS below means satisfied for this changed ownership boundary. LIMIT means the broader property was inspected but is not established by this bounded review; it is explicitly excluded from the approval claim. UNCHANGED identifies an inherited mechanism whose replacement is outside this patch, not a waiver of a release requirement.

### Recovery / replay

| Item | Verdict and evidence |
|---|---|
| 1. Never clobber live with stale | PASS. S1 keeps `knownIds` and `restoredWorkflowIds` guards at all four H1 seams. S4 alone may refresh discovered state from validated authoritative identity/epoch/set/decision. Root's three fresh-owner cases feed stale empty live rows and complete old work; I1 retains fresh enlisted metadata during old COMMIT/ROLLBACK completion. |
| 2. Restart versus live discriminator | PASS. Unknown workflow ID may be restored; any known workflow ID is not replaced by discovery, including known terminal history. Discovery now never installs a session binding. Actual authoritative recovery refresh remains separate, so existence does not overrule newer durable evidence. S1/S2, T2/T4, I1/I2. |
| 3. Lost-enlistment refusal | PASS, preserved. Authoritative `participant_set_text`, not current/empty cache registry, defines admitted identities. T2's nonempty decision/empty census cases and T3's live lost-admission-answer case refuse without mutation. Root stale-live census probe preserves `p1`. S4 and H1. |
| 4. Replay and partial effects | PASS for ownership/dedup, LIMIT for physical crash. S2 restores committed transition keys identically in both binding modes and clears only the removed workflow's keys; I2 measures both. S4 replays exact immutable decisions with participant identity; I1 concurrent drivers fan out once per old decision. Generic physical rollback and native apply dedup are unchanged and not newly certified here. |
| 5. Absence proves nothing | PASS. S4 distinguishes missing/unavailable/invalid/legacy from available authority and returns retained in-doubt without fanout. I1 measures missing rows then valid rows; T2/T3 cover invalid state. Held client answers have no `commitPointReached: false`. |
| 6. Recovery useful progress | PASS for finite component failures: I1 missing authority then both recorded decisions complete, while fresh session continues. T2/T3 cover failed PREPARED persistence and lost admission answer. LIMIT: no new process-kill/network/storage-loss experiment and no global retained-state bound. These are separate broader acceptance obligations. |

### Concurrency / serialization

| Item | Verdict and evidence |
|---|---|
| 1. Actual boundary | PASS. S3's per-session Promise FIFO holds complete client and recovery operations; it does not use the shared recovery owner key as a global single-flight key. S4's exact durable CAS/insert-once decision remains the cross-process authority. No new process exclusion is claimed. T2 Q2/Q3, I1. |
| 2. Await revalidation | PASS for changed seams. New lookup/refusal and restore/retain operations are synchronous. Existing asynchronous authoritative refresh executes under the row's session FIFO and validates immutable identity/set/decision before replacing retained fields. Queued client stages check expected ID inside that FIFO. T2 held-read/late-stage cases, T3, I1. |
| 3. Single winner | PASS, preserved. S4 frozen-set/decision CAS owns durable settlement; old-ID client calls only report a refusal. I1 overlapping sweep/resume produces one fanout per old decision. This does not substitute local FIFO for the durable CAS. |
| 4. Timer reentrancy | PASS for no new bypass. S5 `recoverySweepInFlight` gates overlapping sweeps, and resume/sweep share S3's FIFO. I1 overlaps both trigger kinds. Timer cadence/registration itself is unchanged; no timer scheduling reliability experiment was added. |
| 5. Lock key scope | PASS. Recovery retains original `sessionId` for its request lane and persists that identity; `ownerKey` only controls ownership lookup. Two old IDs sharing the literal recovery session plus a fresh live transaction are distinguished in I1. S2 object-identity guards prevent removing someone else's owner binding; I2. |
| 6. Custody through uncertainty | PASS for fixed admitted work; LIMIT for aggregate queue/state bounds. Workflow IDs and durable rows retain old work while reads fail. Caller refusal does not delete it. I1 clears recovered-ID enrollment and queue tails after finite failure. Arbitrarily many calls/transaction identities have no new global admission cap in this patch. |

### Retry / re-drive

| Item | Verdict and evidence |
|---|---|
| 1. Retry must fire | PASS for retained routing, UNCHANGED timer machinery. S5 scans `workflowsById`, so removing session ownership does not suppress sweep eligibility. Discovery-load exceptions do not suppress already retained IDs. T2 detached-obligation retry and I1 demonstrate useful next-drive progress. No new retry registration exists. |
| 2. Bound from frozen evidence | LIMIT, inherited. Authority may stay unreadable indefinitely; owner retains exact debt rather than inferring completion from a spent client budget. Each finite sweep traverses its captured retained set; this review proves neither eventual termination under permanent unreadability nor a global count cap. S4/S5 and I1 held state. |
| 3. Observable exits/log bounds | PASS for unchanged typed exits; LIMIT on lifetime totals. Sweep returns skipped, deferred/deadline, failed and resolved summaries; authority exposes missing/unavailable/invalid/legacy; client stages get typed in-doubt or no-transaction. Timer errors are logged. S5 logs/attempts remain unchanged and can repeat over unbounded outage duration. |
| 4. Mutual suppression | PASS. No path waits for an old session binding to reappear: both triggers use workflow ID and row session FIFO. Stale cache failure does not suppress authority retries. I1 reaches fresh authority and completes both old decisions with a live session still present. |
| 5. Storm ceiling | UNCHANGED/LIMIT. Default timer is 1 s, one sweep in flight. Default recovery participant attempts are at most 4 per participant per stage invocation (3 retries, with 10/20/40 ms default delays); finite observation interval T permits at most roughly `(floor(T/1000)+1) * N * 4` such attempts per stage for N eligible obligations under timer-only driving, plus logs for retries/exhaustion. Explicit resume calls are additional serialized drivers; there is no claimed global caller, lifetime-log or admission cap. No new driver is added by this patch. |
| 6. Late success duplicate safety | PASS at changed interaction. S4 immutable decision/readback and S3 FIFO remain intact. I1 simultaneous sweeps/resume yields two old fanouts total, with exact IDs and distinct decisions; known terminal history is not resurrected by discovery (T2/T4). Physical receiver idempotency remains an existing participant contract. |
| 7. Reset semantics | PASS for no introduced reset. Binding selection and held old-ID answers reset no retry counters. Existing deferred sweep state resets only after a sweep with no deferred result; participant settlement still requires typed protocol success/durable evidence, not a raw transport ACK. S4/S5 and T2/T3. |
| 8. Finite failure clears | PASS component safety/progress; LIMIT resource total. I1 holds missing authority, restores it and completes exact COMMIT/ROLLBACK while preserving fresh work. T2's failed PREPARED persistence is retried before decision. Durable obligations outlive caller waits. No service-wide finite-failure or aggregate-memory certification is inferred. |

### Owner interaction

| Item | Verdict and evidence |
|---|---|
| 1. Single semantic question owner | PASS. Query coordinator owns whether a session holds its own live transaction; transaction recovery owns discovered exact IDs; authoritative transaction decision remains S4. Workflow registry stores the owner's binding choice. Metadata/caches do not decide settlement. S1-S4, C1/C2. |
| 2. Typed boundary | PASS. `RECOVERED_WORKFLOW_BINDING` is a named internal enum with existing default preserved. Query explicitly chooses ID-only binding. `sessionId`, transaction ID/epoch and authority decision semantics survive conversion. In-doubt is the existing named outcome, not success inferred from missing metadata. S1-S4, I1/I2. |
| 3. Paired invariant / old shortcut | PASS. I1 proves fresh session ownership and old decision progress together. Same source against base is red at discovered-session adoption. Author W-R2 also pairs ordinary write admission with recovery completion and is behaviorally red before the repair. A/B source identities and raw failures retained. |
| 4. Stale then fresh | PASS. I1 missing authority then valid durable rows re-enters S4; old IDs finish. T2/T3 provide stale PREPARING, malformed decision and live stale-empty census coverage. No cached in-doubt result becomes a permanent veto. |
| 5. Pressure/backoff | PASS for changed path, LIMIT aggregate pressure. Client old-ID calls are synchronous read/refusal inside existing FIFO and cannot drive authority/participant work. S5 sweep single-flight and defer logic unchanged; I1 overlaps triggers. No force/retry bypass was added. Global pressure/capacity remains outside this source repair. |
| 6. Wake/release path | PASS component. Existing timer/resume/sweep remains the canonical trigger; authoritative availability changes what its next read permits. I1 measures useful progress and recovered enrollment release. C2 permits that existing sweep. No new event-driven requirement is replaced by polling. |
| 7. Projection authority | PASS. `getTransaction` and `getRecoveryObligation` share one metadata projection; neither permits a mutation. Cache status/participant/write-operation rows remain hints, never decision/set authority. S1/S4, T2/T3. |
| 8. Controlled negative | PASS. Identical independent probe loads production and fixture owners from each explicitly named source root. Base assertions are behavioral and occur before any absent new accessor could fail. `identity.json`/patch bind treatment. Expected-negative artifacts are not counted in any positive suite or certification population. |
| 9. No local escape hatch | PASS. Touched callers add only exact-ID held lookup and the named restore mode. Source search found no new raw read, force flag, local decision copy or alternate retry loop. Commit/rollback still use canonical protocol for live ownership and only report old recovery obligations. S1-S5. |
| 10. Contract/registry/proof | PASS on frozen composition. C1 has live endpoints, explicit no-session-adoption wording, new primary-classified witness in both registry lists, and existing paired T2/T4 witnesses. My audit is green. Candidate alone had the existing contract/witnesses but omitted the new decisive file from its registry; composition corrects that metadata omission without changing runtime. |

### Harness fidelity

| Item | Verdict and evidence |
|---|---|
| 1. Behavioral red | PASS. Independent base I1 fails on `true !== false` for session adoption. I2 fails on an unexpectedly bound workflow object instead of null. Both entered the real mechanism; imports and setup succeeded. Exact first stdout/stderr retained. |
| 2. Binding-seam stubs | PASS with stated ceiling. SQL engine, coordinator, generic workflow, schema and mutation SQL are real. Gateway uses a single local SQLite database, not replicated system partitions. Participant router uses the repository typed protocol double, not native partition commit; this is sufficient to expose session-owner selection and count correctly identified fanout, not physical exactly-once effects. |
| 3. Time fidelity | PASS for tested ordering. I1 introduces no compressed timeout schedule: explicit missing/readable authority phases, awaited BEGIN/enlist/refusals and concurrent triggers define the interleaving. Old rows are expired; new BEGIN uses its real budget. I2 has no timers. No wall-clock failure-domain claim. |
| 4. Field fidelity | PASS. Probe builds manifests, participant IDs and decision bytes with the owners loaded from each tested tree. Rows include canonical epoch, deadline, mode, frozen count, set text, exact decision digest and complete PREPARED evidence. Candidate shared fixture similarly uses owner builders. |
| 5. Nonvacuity | PASS. Two nonempty old obligations, two different recorded decisions, one real fresh BEGIN, a fresh enlisted `p1`, two initially held read failures, explicit four client refusals, and persisted terminal statuses exclude empty/no-op success. I2 checks actual persistence suppression and populated transition history. |
| 6. Entry/owner fidelity | PASS for scope. I1 starts at real `SQLQueryEngine.executeQuery('BEGIN')` and coordinator enlist/recovery entries; authority query and production SQL persistence execute in SQLite. W-R2 directly opens/executes the engine write seam with an injected effect callback, so it proves admission/execution reachability, not a physical application write. |
| 7. Evidence ceiling | LIMIT, explicit. Node and local SQLite are real. No real RPC loss, replicated coordinator partition, native participant decision application, cross-host restart or service deployment is certified by these probes. Prior broad failed lab/controller evidence is not converted into success. |
| 8. Failure/progress fidelity | PASS in accounting. Exact base/candidate failures retained; poison fixtures fail before their intended dimensions on both. Earlier process-loss scenario reds remain outer failures/target-not-reached where custody prevents TX1 engagement. Useful component progress is measured separately from bounds. No failing gate was changed to obtain approval. |

## Nonblocking carry-forward findings and limits

1. **Inherited poison attribution fixture mismatch remains red.** Both exact base and candidate fail the same three cases: incomplete frozen set attribution, multi-participant one-phase mode attribution, and the nominal valid-row case. They fail first at invalid/missing canonical `transaction_epoch`, before the intended decision dimension. [Candidate](reused/tx1-focused-pristine.log) and [base](reused/tx1-poison-base.log) retain full failures. This patch neither introduces nor repairs that mismatch. H2 remains an obligation for its owner; this review does not approve historical supersession or waive a sealed gate.
2. **Global resources and permanent-failure recovery are not established.** The candidate adds no new loop or durable ledger, and does not duplicate records on repeated discovery. Nevertheless workflow history and admitted debt have no new aggregate limit; per-session FIFO has no new admission cap for arbitrary callers. Permanent unavailable/invalid authority may retain debt indefinitely. The probe explicitly reports terminal history still present. The approval is for ownership separation and useful progress for fixed admitted obligations under finite failures, not bounded total transaction lifetime storage or full service recovery.
3. **Broad source/service proof remains distinct.** The interrupted verifier's 27 common failing files, including seed process-loss/cutover paths, remain failed evidence. Some integration targets are not reached because the earlier O3 allocation-directory custody hold stops them. Matching base outcomes establish inheritance only; they do not establish correctness of those scenarios. No new lab workload was necessary to resolve this local ownership finding, and no broad runtime acceptance is claimed.

The initial registry omission is resolved in the reviewed composition, not left as a required follow-up. There are no proposed production repairs hidden behind this approval.

## Primary-system context and applicability

The review used external sources to choose failure questions, not to grant Lagrange guarantees. FoundationDB documents ambiguous commit outcomes and recommends retaining a stable operation identity and checking durable completion evidence before replay. That supports testing exact transaction identity and refusing to infer rollback from a missing client answer. FoundationDB's particular guarantee that `commit_unknown_result` is no longer in flight is **not** assumed for Lagrange timeouts or cancellation. [FoundationDB developer guide](https://apple.github.io/foundationdb/developer-guide.html#transactions-with-unknown-results).

TiKV's historical async-commit design separates transaction recovery from the originating client and consults transaction/participant lock evidence. That motivates checking recovery's authoritative participant set and decision independently of a reused client session. Its timestamp, lock, success and absent-lock rules are TiKV-specific; none is imported into this patch. [TiKV initial async-commit design](https://github.com/tikv/sig-transaction/blob/master/design/async-commit/initial-design.md).

These analogies are subordinate to C2, the current source owners, the two project historical failures, and the measured local A/B evidence. The exact reviewed runtime change is approved for composition; remaining Quest, release, laboratory and publication decisions stay with their existing owners.
