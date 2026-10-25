# Independent review of the two preserved admin repairs

Reviewer: `subagent:/root/admin_review`. Review date: 2026-10-25.

## Verdict and exact scope

**Source review: no correction requested for either bounded delta. Final independent acceptance remains pending executable evidence.**

| Unit | Predecessor | Candidate | Source verdict | Execution verdict |
| --- | --- | --- | --- | --- |
| Coordinator exact table identity | `a97f79c35b7e1f6428032493918e16e623339688` | `c582aa545068cf182754da98028812912d628bf0` | The one exact-name predicate is applied consistently at the affected interaction. | Three-file canonical rerun requested; not executed by this reviewer. |
| Config/policy mutation confirmation | `a97f79c35b7e1f6428032493918e16e623339688` | `930abb048f2d04db5bdb47bea20fc2ce7c450a17` | The canonical effect classifier gates all changed success publication. | Five-file canonical rerun requested; not executed by this reviewer. |

This review does not approve composition with the current integration, the rest of the older admin chain, native fault behavior, Quest closure, publication, merge, or release. No product source was edited. Both review worktrees remain detached at the named candidates and clean. `git diff --check HEAD^ HEAD` passes in each.

The governing source inspected was integration `709dc2bebd4abdbec9a5d4fb2232c2621d7897f7`, with AGENTS, rules/router revision 4, verification templates, runtime/authority contracts, the stop handover, the original independent admin review, both authored handoffs and the sealed unit Quests. The scopes below are assessed against their actual diffs, not against author assertion totals.

## Finding E-ADMIN-1: handover manifests name missing raw logs

**Evidence-preservation defect, confirmed by source-tree inspection.** At integration `709dc2bebd4abdbec9a5d4fb2232c2621d7897f7`, the handover's `raw-evidence-manifest.json` declares 52 copied artifacts. Only 21 are present; those 21 all match their declared SHA256. The other 31 are absent from the Git tree. The separate `copied-evidence-manifest.json` declares 20 artifacts: 19 are present and hash-correct, while `fresh-composition-original-failure.log` is absent. Across both manifests there are **32 absent artifacts and zero hash mismatches among the 40 available artifacts**.

All absent names end in `.log`. `git check-ignore -v` identifies root `.gitignore` line 2, `*.log`, for a representative missing path. `git ls-tree -r --name-only HEAD` confirms these are absent from the committed tree, rather than merely hidden by the search tool.

The complete missing path list, original source paths and expected hashes are preserved in `handover-evidence-manifest-audit.json` beside this report. The list includes the coordinator's `red.log` and `green-final.log`, owner outcomes' `red-reviewer.log`, `green-reviewer-r1.log` and `green-r2.log`, and marker, partition-readback and controller logs. The marker's native `.tap` file is present.

**Effect on this review:** the claimed 92 coordinator assertions and 848 owner-outcome assertions remain author-reported results. This reviewer cannot inspect their raw output from the preserved Git tree. Hashes in a manifest do not recover missing bytes. The predecessor red witnesses described in the handoff likewise remain uninspected historical execution claims.

**Disposition:** root and the sole lab coordinator were notified. A read-only retrieval of the original copied evidence on the original controller was requested, using the exact known paths and expected hashes. Preserve original manifests and logs unchanged. Append the recovery result; if bytes are unavailable, say so explicitly. A fresh exact-candidate run supplies current evidence but cannot be relabelled as the original failed or passing run.

## Coordinator identity review

The semantic question is whether a logical table is the transaction coordinator ledger. Its authority now resides in `isCoordinatorTable` in `src/query/distributed/distributed-transaction-schema-enforcement.js`, which consumes the already established `resolveLogicalTableName` and compares exactly to `TABLES.SQL_TRANSACTIONS`. It does not introduce another case/namespace normalizer.

The shared logical resolver preserves case and strips only the existing optional `global.` namespace. Therefore `sql_transactions` and `global.sql_transactions` remain protected ledger identities, while `SQL_TRANSACTIONS` is the distinct user-table identity already established by predecessor a97. Partition-local SQLite identifier folding is not promoted into logical catalog identity.

Affected consumers are consistent:

- Source write admission and committed statement application already consume the schema enforcement owner through `transactionSchemaWriteRefusal` / `assertTransactionSchemaWriteEnforced`.
- Remote ALTER uses `coordinatorTableSchemaRefusal` from that owner.
- Query transaction prechecks, SELECT enlistment selection and actual partition BEGIN consume `coordinatorTableParticipantRefusal`; this function now delegates to the same exact predicate instead of maintaining a lowercase decision.
- Generation-origin application in `partition-participant-transaction-apply.js` uses that predicate before installing coordinator triggers. Installation still happens within the existing committed application transaction, before origin replay/new-origin handling. No read path installs triggers and no caller is granted schema mutation authority.

The lower-case schema and trigger enforcement algorithms are unchanged. Existing generation-origin replay continues to repair missing enforcement before returning the existing idempotent origin result. No participant release, recovery, membership, transaction envelope or generation rule was changed. The added schema module import reaches the existing workflow schema/shared constants; inspection found no new dependency back into participant admission/application.

### Verification lenses

| Lens | Source evidence and result | Evidence limit |
| --- | --- | --- |
| Admission/precheck consistency | The source, committed application, remote ALTER and BEGIN decisions converge on one exact predicate. | This is a source trace; actual new witness execution remains pending. |
| Paired invariants | `coordinator-table-exact-identity.test.js` exercises uppercase user admission and lowercase ledger exclusion in the same fixture family. Lowercase missing-trigger refusal and origin replay remain asserted. | Real PartitionService and SQLite application with controllable consensus; no native formation claim. |
| Replay/retained authority | `applyGenerationOrigin` retains original partition identity, transaction and recorded-origin semantics; only the table predicate changes. | No new recovery algorithm, timer or resource owner is introduced. |
| Fixture fidelity | The new witness records a proposal before applying it, reads the actual SQLite effect, tests a follower application, and tests the actual remote ALTER and BEGIN owners. | Source inspection confirms engagement assertions; historical predecessor red output is missing from Git. |
| Identity/input handling | The shared resolver's primitive-string check and exact namespace semantics are reused. No new coercion, collection or numeric validator is added. | Arbitrary hostile-host mutation of the existing resolver's intrinsics is not a new promise in this unit. |
| Registry alignment | Existing TX1 and exact table identity entries include the new test and changed owners. | Generated metadata's normal-hook pass is recorded by the handover; no whole-corpus audit was rerun. |

Required focused rerun:

```sh
LAGRANGE_RETRY_FAILED_ONCE=0 LAGRANGE_LANE_JOBS_CAP=1 npm run test:file -- test/partition/coordinator-table-exact-identity.test.js test/query/transaction-schema-enforcement.test.js test/query/sql-query-engine-system-table-write-admission.test.js
```

Run on the exact candidate through the established lab owner. Retain complete stdout/stderr, terminal status and source identity.

## Config and policy outcome review

The semantic question is whether the owner may publish successful completion of a mutation that must affect one row. `requireConfirmedSingleRowMutation` delegates effect interpretation to `classifyControlPlaneMutationResult`; config and policy supply only their typed zero/unknown vocabulary. The HTTP adapter adds static 409 mappings and does not introduce reads or its own row-count decision.

The confirmation gate permits completion only when the canonical classifier says applied, neither deferred nor visibility-pending, with an explicitly present affected-row count exactly one. Missing, malformed, multi-row and settled-replay-with-unknown-count evidence therefore cannot produce the new success path. A known failed/terminal receipt uses the existing mutation error builder, with the complete original receipt retained as the error cause. The original receipt's nested cause remains reachable. Other unknown effects produce typed uncertainty with retry indication; an accepted observed zero is distinguished from uncertain application.

The placement of the gate is correct at both owners. `DynamicConfigService.set` captures either insert or update result, checks it, then increments successful-write statistics, logs completed update and returns success. `TablePolicyService.updateTablePolicy` checks before deleting its cache entry, emitting `POLICY_UPDATED`, or returning applied policy. Exceptions thrown by dependencies are not replaced by the gate; the policy catch logs and rethrows the same object. No retry loop, deadline, readback oracle, persistence algorithm or CDC publication mechanism was added.

All 14 paths in the preserved `raw/owner-outcomes/source-manifest-prehook.json` match the actual candidate's SHA256 exactly; the check is preserved as `owner-outcomes-source-manifest-check.json`. Thus the preserved author's source fingerprint matches this candidate. That does not establish the missing execution output.

### Verification lenses

| Lens | Source evidence and result | Evidence limit |
| --- | --- | --- |
| Single owner and representation | Confirmation consumes the canonical classifier. Config/policy own vocabulary and success side effects; admin maps an owned error to HTTP. | No duplicate completion oracle found in the changed paths. |
| Failure/uncertainty fidelity | `control-plane-single-row-confirmation.js` retains original receipt/cause and refuses unknown counts or pending visibility. | The real-gateway witness source covers deferred, rejected, zero, absent/malformed count and pending visibility; rerun pending. |
| Paired success invariant | The new test asserts HTTP failure together with no stats/cache/event publication, and a subsequent confirmed request re-enters the real owner/gateway. | CDC result is controlled. This is not proof of native SQLite/raft mutation failure or eventual distributed convergence. |
| Retry and progress | No retry loop is introduced or modified. A later request reaches the same owner and fresh gateway call; the test asserts exactly two CDC engagements across deferral then success. | No promise of autonomous retry or recovery completion is inferred. |
| Resource bounds | The gate allocates one error on refusal, no queue, map, timer or retained registry. Existing owner/resource custody remains unchanged. | No endurance claim. |
| Hostile-input handling | New success decision reads the frozen result of the existing defensive classifier, which rejects non-plain/malformed effect evidence. | Existing error formatting and shared classifier threat-model limits are not widened by this repair. |
| Test corrections | Two existing success fixtures now emit canonical `affectedRows: 1`; no production `changes` alias or missing-count compatibility fallback is added. | Historical red and green logs are missing from the committed handover. |
| Registry alignment | `admin-owner-mutation-confirmation` contract and coupled pair identify semantic owners, canonical gateway/classifier and the HTTP witness. | No global audit or composed-candidate proof has been rerun. |

Required focused rerun, matching the registered five-file author cone:

```sh
LAGRANGE_RETRY_FAILED_ONCE=0 LAGRANGE_LANE_JOBS_CAP=1 npm run test:file -- test/admin/admin-owner-mutation-outcomes.test.js test/admin/admin-owner-operations.test.js test/config/dynamic-config-service.test.js test/policy/table-policy-service.test.js test/policy/policy-driven-adjustment.property.test.js
```

## Composition conditions

Both candidates descend from a97 and predate accepted integrated CDC D2 and current Q6. Apply their bounded semantic changes to the integration; do not copy entire old source files. In particular, preserve current table-policy/CREATE CDC guards and current participant-apply behavior. Reconcile shared `test/shards/impact-contracts.json` through its producer/registry owner and regenerate derived metadata normally. The source verdict here applies only to the named deltas; the composition owner must bind any changed surrounding source and the affected proof before landing.

No ratchet baseline, timeout, workload geometry or gate was changed by this review. No author-reported execution is represented as a reviewer rerun.

## Addendum: two further handover-linked hook logs

A subsequent bounded check of the handover's direct links also found `marker-hook-blocked.log` and `partition-readback-hook-blocked.log` absent from the committed tree. These two paths are outside the two manifest counts above, bringing the confirmed missing set to **32 manifest-listed artifacts plus two directly linked failed-hook logs**. The corresponding patch/source hashes remain present; the absent log does not invalidate the exact patch restoration but prevents inspection of the original hook output.

`admin-commit-results.json` records their original sources as `/tmp/codex-admin-stop-preservation-20261025/codex-log-marker-20261025-commit.log` and `/tmp/codex-admin-stop-preservation-20261025/codex-admin-partition-readback-20261025-commit.log`. No expected log-byte hashes for these two were found in their respective patch metadata. Root was notified; recovery must retain that distinction rather than invent an expected hash.

## Recovery addendum and final bounded verdict

**Updated verdict: APPROVE both bounded admin repairs at their named commits, based on independent source/contract review and inspection of the recovered original executable evidence. No new runtime run was performed by this reviewer.** The earlier pending-evidence verdict above records the state before recovery; this addendum supersedes that evidence limitation without deleting it.

The user supplied the original evidence archive. Root verified archive SHA256 `3a78d417eeeb62fc643b31131e000d9fa7555d05592e42a503d48d412b0d0fdf` and both original manifest byte identities. This reviewer independently hashed all 32 previously missing manifest-listed artifacts from `/workspace/scratch/285a938494ce/recovered-rs-raft-evidence` and confirmed that every artifact exactly matches its pre-existing expected hash. Both directly linked hook logs were also recovered, with current hashes recorded by root; they still lack a pre-existing log-byte hash. The original preservation omission remains a true historical finding, now resolved by byte-exact recovery of the 32 hash-bound logs.

The original admin run logs contain complete classified-runner terminal summaries. Their counts reconcile as follows; node:test cases and TAP assertions are reported using the runner's existing counting convention, not recounted as uniform leaf assertions:

| Recovered log | Observed result | Interpretation |
| --- | --- | --- |
| `raw/coordinator/red.log` | 1 file failed; 4 cases failed | All four new user-table cases reach the expected owner and fail on the original folding behavior: source proposal count zero, committed schema refusal, remote ALTER proposal count zero, and rejected uppercase BEGIN. No import/setup failure is substituted for the defect. |
| `raw/coordinator/green-r1.log` | 2/2 files pass; 9 reported cases | Intermediate focused pass, overlapping the final run. |
| `raw/coordinator/green-final.log` | 3/3 files pass; 92 runner-reported assertions/cases | 83 system-write-admission assertions, 4 coordinator identity cases, 5 schema-enforcement cases. Thermal admission logged and classified lane jobs=1. |
| `raw/owner-outcomes/red-reviewer.log` | 1 file failed; 13 runner-reported assertions | Six actual HTTP false-success assertions fail and all six CDC-engagement assertions pass. The enclosing test accounts for the runner's 13th count. This establishes the original F-ADMIN-1 mechanism. |
| `raw/owner-outcomes/green-reviewer-r1.log` | 1/1 file passes; 13 reported assertions | The original reviewer witness passes after correction; inspected as historical author execution of that witness, not a new reviewer run. |
| `raw/owner-outcomes/green-r1.log` | 3/5 files pass; 2 files fail; 842 reported assertions | The new 199-assertion owner witness passes. Existing policy/config fixtures produce unconfirmed outcomes because they return absent count or `changes` instead of canonical `affectedRows`. These actual failures remain preserved. |
| `raw/owner-outcomes/green-r2.log` | 5/5 files pass; 848 runner-reported assertions | Config 439, policy 120, owner-outcome witness 199, admin operation 77, policy-adjustment property 13. Final source changes the two old fixture return values to `affectedRows: 1`; no production compatibility fallback. Thermal admission logged and classified lane jobs=1. |

The run commands in these logs match the exact focused file lists above. Retries disabled is recorded by the preserved receipt/handoff; the output does not include a complete environment dump. The final summaries establish runner completion, not shell exit-code telemetry independent of that runner.

Source applicability is also reconciled. All three coordinator production hashes recorded in its receipt exactly match commit `c582aa545068cf182754da98028812912d628bf0`; check details are in `coordinator-source-receipt-check.json`. All 14 owner-outcome prehook source/evidence fingerprints match commit `930abb048f2d04db5bdb47bea20fc2ce7c450a17`, as previously checked. The preserved normal-hook commit records report frozen source unchanged. The final log hashes are the exact hashes named by those receipts/handoffs, rather than newly substituted test output. Together with the inspected exact deltas and engaged source-bound negatives, that evidence is sufficient for these bounded source repairs; re-executing unchanged tests solely because their original logs were temporarily unavailable is unnecessary.

The approvals remain limited to the a97-to-c582 and a97-to-930 deltas. They do not approve old admin-chain source against current CDC D2/Q6, final composition, physical scenarios, native recovery, public-service acceptance, Quest landing, publication, main merge or release. Composition still requires the existing owner to preserve current integrated behavior and select its affected proof. Previously requested redundant reruns may be cancelled before submission; any already-submitted job must be managed through its actual lab owner.

## Systematic follow-up: caller census, history and inherited compatibility

The user's resumed direction requires investigating recurrence and semantic owners before treating a defect as local. The following additional source review preserves the bounded approvals above while identifying a separate shared contract issue. No owner source was edited and no new runtime witness was executed.

### Exact-name interaction and caller coverage

The source census of `isCoordinatorTable`, `coordinatorTableParticipantRefusal`, `coordinatorTableSchemaRefusal`, `transactionSchemaWriteRefusal` and `assertTransactionSchemaWriteEnforced` traces all direct uses to the already identified owners: statement admission, SELECT participant selection, partition BEGIN admission, source-write precheck, committed statement application, remote ALTER and generation-origin application. Remaining direct `TABLES.SQL_TRANSACTIONS` / `SYSTEM_TABLE_NAME.SQL_TRANSACTIONS` comparisons in participant cutover, settlement, schema/bootstrap and pause/reporting code are exact comparisons. The inspected coordinator identity paths contain no remaining lowercase coordinator alias. Unrelated column, SQL alias, state/error and lexer normalization is not reclassified as catalog identity.

The preserved a97 review explicitly identified coordinator/TX1 folding as a follow-up after correcting catalog creation/resolution and system admission. The c582 handoff then replaced the uppercase coordinator alias expectation with one shared exact predicate and exercised the previously divergent source, committed, ALTER and BEGIN routes. This is a completed correction across that named interaction, not evidence that every SQL identifier rule is identical. In particular, general ALTER/DROP policy and primary-key-column matching remain outside this delta.

### Mutation callers and predecessor recurrence

The exact source census finds two direct callers of the new single-row confirmation helper: `DynamicConfigService.set` and `TablePolicyService.updateTablePolicy`. Their runtime callers preserve the gate's refusal: the registered admin config/policy adapters await and map owner failures; `RaftAdaptiveTimingController.persistRaftTiming` increments its write count only after the awaited config call, and `switchProfile` changes profile/counters only after that method returns. `TablePolicyService.setTablePolicy` delegates directly to `updateTablePolicy`. No second success path or adapter readback was introduced.

F-ADMIN-1 is a recurrence of a documented effect-handling class, not a new HTTP-only symptom. The older `solve/quests/priority-services-row-marker-clear-integrity/quest.json` records a 2026-08-11 lifecycle defect: a nonthrowing readiness refusal or zero-row CDC result cleared a durable-progress marker and suppressed needed reconciliation. Its recorded repair handled those failures but explicitly retained unknown-shape compatibility. The October independent admin review then demonstrated the same discard-of-returned-effect class in config and policy, with actual gateway engagement. The new helper fixes those two operations at their existing semantic owners and blocks success side effects without adding retries, a raw-SQL path, a readback oracle or a `changes` alias.

The local Git checkout is shallow. The bounded candidate/predecessor diffs and preserved in-tree historical Quest/review records were inspected; an exhaustive pre-e701 commit-history search has not been performed. This limit is recorded rather than presenting the available `git log` as complete repository history.

### Confirmed inherited compatibility outside these two gates

`src/control-plane/control-plane-mutation-outcome-classifier.js` still classifies a valid plain result with neither typed outcome nor affected-row count as `applied: true` when it has no explicit failure. The existing classifier test at lines 108-113 deliberately expects `{success: true}` to remain an applied legacy envelope. This is explicit compatibility behavior, rather than a speculative reading of an untested branch.

The gateway also propagates the ambiguity: `resolveMutationCompletionStateFromClassification` and `resolveControlPlaneMutationOutcomeSnapshot` in `control-plane-system-table-gateway-mutation-contracts.js` choose `APPLIED` for a valid otherwise-unknown no-count result. `ControlPlaneSystemTableGateway.normalizeMutationResult` publishes those normalized fields. INSERT, UPDATE, UPSERT and DELETE submission paths all normalize the corresponding CDC result through this owner. Consequently, merely requiring a typed normalized outcome in a caller would not remove the original ambiguity.

`mutation-classifier-call-census.json` records **31 direct classifier calls across 23 source files** at candidate930. This is an exact textual direct-call census, not a computed dynamic call graph. The consumer surface includes replica creation/recovery/durability and cleanup, service registration, partition and message-group row owners, node registration/removal, config seeding, lease updates, timing/projection helpers, CDC mutation helpers, the gateway and the new stricter publication gate. The classifier, gateway normalization, gateway submission and classifier-test files are byte-identical between candidate930 and integration709; `shared-classifier-current-source-comparison.json` preserves their hashes.

The config/policy gate blocks missing-count ambiguity because it independently requires an explicit single affected row and excludes deferred/pending visibility. Thus this inherited issue does not invalidate approval of their bounded repair. It does prevent a claim of complete mutation-owner closure under the new instruction to remove legacy/fallback behavior. The next shared-owner investigation must bind actual producer envelopes to the consumers that rely on `applied`, preserve explicit uncertainty, and establish engaged negative/positive controls before changing the classifier. This report does not assert that an actual current CDC producer emitted an empty result, and no production-impact reproduction has yet been run.

### Primary comparable-system checks

The official [etcd v3.6 API guarantees](https://etcd.io/docs/v3.6/learning/api_guarantees/#operation-completed), inspected on 2026-10-25, distinguish durable completion from a client's uncertain observation after a timeout or network disruption. That is relevant precedent for preserving uncertainty through a mutation gateway; it does not prove Lagrange's producers or authorize translating an unknown receipt into either success or definite noncommit.

The official [PostgreSQL lexical-structure documentation](https://www.postgresql.org/docs/current/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS), inspected on the same date, defines folding of unquoted identifiers separately from case-sensitive quoted identifiers. This comparison reinforces that identifier behavior is an owned language/catalog contract. Lagrange's existing exact logical catalog identity remains the controlling contract here; another engine's physical comparison rules are not a reason to add a coordinator alias.

### Hook failure locality

The marker/cohort hook failures are separately proven local to their reported new ambient calls: the recovered original full-patch logs report 13/14 new findings in exactly one test apiece, scoped reproduction reports the same 13/14, and capture-only substitution produces zero new findings. The original full logs also report 4/761 inherited baseline findings; those have not been removed or reclassified. Module-load captures preserve the original arguments, predicates, fixture events and assertions. No checker, baseline, allowlist, production runtime path or fallback was changed. Root independently approved only those bounded substitutions; full restored marker/cohort implementation acceptance remains its own review.
