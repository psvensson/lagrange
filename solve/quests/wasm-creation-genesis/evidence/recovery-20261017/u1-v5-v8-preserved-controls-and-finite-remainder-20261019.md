# U1 V5-V8 preserved controls and finite evidence remainder

Reviewer: `subagent:/root/lifecycle_design_research`, 2026-10-19.

Read-only census of the finite checklist's V5-V8 mechanisms at
`25cb5b1fb487485f2789d63d9b0fcb150788890c`. V1-V4 belong to the parallel lab
reviewer. No test or source mutation was executed, and no production/test file
was changed for this report. The seven start/return/strict-option control plan
remains separately approved at
`u1-seven-isolated-controls-independent-plan-verdict-20261019.md`, SHA256
`bde1a92202b02f0c3705d4eb29af6c7f8d5addc9f7c28bdbc02a5d4a6a4de61f`.

## What can retain its existing bounded evidence

The old broad U1 verdict was REJECT, but that does not invalidate every
independent lower-owner mutation in it. **Original M06 and M07 remain useful
exact-source/exact-test lower-storage controls.**

| Existing control | Measured first effect | Current lineage and ceiling |
| --- | --- | --- |
| Original U1 M06, storage absence called a tombstone | `wasm-creation-local-record` gets RETIRED instead of CREATION_STORAGE_MISSING; original runner line 64. | Entire `wasm-creation-opening.js` and entire local-record test are still byte-identical from `a251ce4` to current. This proves the local absence classifier's sensitivity; it does not prove the new HISTORY_UNAVAILABLE finality consumer. |
| Original U1 M07, five-field file identity | `FILE_IDENTITY_CHANGE_REOPENED` at original runner line 52; N13 also fails. | Same unchanged opening owner and local-record test. This proves retained file-identity exclusion, not the new physical-currentness comparison or current combined U1. |

The exact opening source is SHA256
`67f531f34df55d320c698cf4b91da10944f1256c6da6885fe1a4a7b913a44d7c`;
the exact test is
`13a8595fd6117a56032d2bd4629cb195a9208851124f525290acd4f413e3c296`.
The original patches, before/after maps and full logs remain under
`verifier-recovery-u1-cloud/mutations/`; its verdict lines 308-331 identify
their substantive failures. **Do not recreate these two controls merely
because an unrelated U1 owner or appended test changed.**

The #266 physical baseline also retains meaningful sensitivity at exact
preserved case and fixture bytes. Its source was
`9f815cf46f72cfdcd5d9ca4c7f95b23d6ace55b4`, physical test SHA256
`fa02bf81ef0e12dcef88a4be502bc3cec59e4fa6541cb59291136f0b1e618cad`.
Compared with the current 818-line test, Git shows only an added endpoint-ID
import, the independently approved pre-start assertion reorder, and five
appended return tests. Every other original case block remains verbatim.
The entire embedding fixture is also unchanged at both commits:
`fae23bc1c01d42b70d1020bdfd4670cbef256d2d58812221529aaeec774d5515`,
18,854 bytes.

| Preserved #266 case/block | First failure actually reached | Existing claim retained |
| --- | --- | --- |
| Reentrant first collaborator/shutdown | `REENTRANT_SHUTDOWN_MISSED_ADMITTED_RETIREMENT`, true versus false | Registration-before-invocation / shutdown population sensitivity. |
| Equal requests and same-ID body conflict | `DUPLICATE_OR_CONFLICTING_RETIREMENT_ENTERED_OWNER_AGAIN`, 22 versus 1 | Duplicate physical owner effects are observed; later conflict-carrier assertions did not execute in that failed case. |
| Failed retirement retried by shutdown | `SHUTDOWN_RETRY_DROPPED_THE_ADMITTED_RETIREMENT_INTENT`, ADMITTED versus RETIRED | Lost tombstone obligation is observed after real failed cleanup. |
| Retirement joins a failed ordinary stop | `JOINED_ORDINARY_STOP_DROPPED_THE_ADMITTED_RETIREMENT_INTENT`, ADMITTED versus RETIRED | The joining retirement's separate cleanup debt is observed. |
| Direct STOPPING blocks new bound object | Missing expected exception, `DIRECT_STOPPING_OBJECT_DID_NOT_FENCE_BOUND_RECREATION` | Wrong physical replacement admission is observed. |
| Throw/retained/absent STOPPED writer, three leaves | `ORIGINAL_JOURNAL_COMPLETED_BEFORE_ITS_STOPPED_PROJECTION`, completed versus in_progress | Original-journal mutation precedes carrier checks and is the measured effect. |

These are eight meaningful failing leaves, not fourteen meaningful mutation
kills. The first three #266 cases stop at
`PHYSICAL_OWNER_CURRENTNESS_OBSERVATION_MISSING`; the two history cases stop
at missing finality vocabulary; the old pre-start case stops at its carrier
assertion. None receives credit for a later physical assertion. The full log
is 21,658 bytes, SHA256
`d51446519aec15e4a14ecfe7101bddaf4ced1fee3385c463aea337145ec57cda`;
`lab-recovery-20261019/lab-266-failure-analysis.json` retains every first failure.
The useful baseline is not a final-candidate single-source mutation receipt.

## V5: physical currentness and identity

Current owners are `wasm-creation-custody.js:15-46,49-75` and
`wasm-service-lifecycle.js:226-249`. The current physical tests at lines 103-161
exercise real CREATED/STARTING/READY, actual cleanup failure, direct
STOPPING/registered STOPPED, absent registration and closed lifetime; full
intent mismatch has its own case. The source independently approved at
`ed9c5ccc` is unchanged here.

**Existing bounded controls:** lower file identity M07 and the #266 direct
STOPPING admission failure above. **Still missing meaningful changed-owner
control evidence:** the D2 currentness implementation exists only in the
corrected source, so old missing-interface failures cannot prove `.live`,
registered-not-live/ABSENT, token-only currentness, or premature registration
loss errors. The active/still-retiring same-operation full-body admission
guard also has a current decisive restart oracle but no preserved isolated
negative in the searched records: `CHANGED_BODY_ENTERED_RESOURCE_RELEASE_BEFORE_ORIGIN_CHECK`
at restart lines 1345-1379.

The D2 clarification requires both legitimate CREATED start reachability and
CLEANUP_REQUIRED exclusion. A blanket mutation back to `.live` will first fail
the real `driver.prepare` call inside `preparedHost` for all three cases; it
cannot be credited as reaching the cleanup-required observation. If isolated
controls are prepared, separate the state rows while retaining interface and
capture semantics so the cleanup-specific counterexample is actually reached.
This report does not authorize a new test rewrite or an arbitrary number of
additional mutants. The required guarantees are finite and named above.

The dedicated pre-start currentness omission and the five actual-return
projection omissions are already the six physical controls in the approved
seven-control plan. They must not be duplicated under a new V5 label.

## V6: admitted physical tasks and shutdown join

Current owners are `wasm-creation-custody.js:49-94`,
`wasm-creation-retirement.js:118-187` and
`wasm-service-lifecycle.js:654-669,748-784`. Exact task registration is before
collaborator invocation; the lifecycle closes admission and joins retained
tasks before its caller releases directory custody.

The reentrant, coalescing and both failed-cleanup #266 effects above retain
their useful baseline sensitivity. Restart lines 771-809 separately pause
the actual metadata **release** of an unopened by-path retirement and observe
real directory transfer; #247 measures
`PROCESS_OWNER_RELEASED_WITH_ADMITTED_BY_PATH_RETIREMENT_OUTSTANDING`.
Its explicit release schedule is not evidence for a close-held schedule.

**Confirmed required positive gap:** v3 section 11, additional binary oracle 6,
requires release and **separately close** suspension after retirement admission.
Neither the current physical file nor current restart file holds the close
call while shutdown attempts to release directory custody. Existing lifecycle
tests cover orderly shutdown; publication P4 records release/tombstone/close
order but does not hold the close/shutdown interval. A separate actual-close
schedule is required. Root has authorized its draft after this census.

The retained v3 source-review requirement still calls for meaningful targeted
registration and join perturbations with frozen tests. There is no preserved
final-candidate isolated registration/join receipt in the searched U1 records.
Do not discard the existing baselines or create a second set of equivalent
case rewrites. Bind the minimum actual source omissions to those existing
effect assertions and to the separately required close-held oracle.

## V7: physical finality, projection debt and original journal completion

Current finality owners are `wasm-creation-retirement.js:149-165`,
`service-runtime-consensus-publication.js:128-160`,
`service-consensus-bootstrap.js`'s bound-stop completion path and
`service-consensus-creation-intent.js`'s original completion CAS/reread.

The #266 three STOPPED-writer failures retain their specific meaningful
original-journal counterexamples. Restart lines 1048-1073 retain the physical
CLOSED/original-journal-unconfirmed positive-and-retry case. Restart lines
1381-1434 compose the actual stopped projection owner and assert original
journal immutability before result vocabulary; the isolated stopped-owner
guard omission still lacks a preserved negative receipt at these bytes.

**Confirmed required positive gap:** v3 section 11, additional binary oracle 5,
requires real old local RETIRED plus real owner HISTORY_UNAVAILABLE to reach
runtime STOPPED and original journal COMPLETED. Current physical lines 340-360
genuinely trim history but stop at `lifecycle.retireReplica` finality; they do
not pass that result through runtime/manager completion. Bound-route lines
818-835 test the upper consumer with a scripted final retirement. Those
separate measurements cannot be combined into the required composed witness.
No such actual-history/STOPPED/original-COMPLETED case was found in the current
physical, restart, creation-recovery or publication files. Root has authorized
that narrow draft too.

The missing-storage local classifier remains covered by exact M06; the new
history-to-FINAL distinction and original completion consumers still need
their own current evidence. A closed-boolean shortcut cannot replace either
the required history positive or the unconfirmed-journal negative. Full
old-retirement/J manager/driver/row preservation belongs to the parallel V2
census: the five new START-return tests do not hold an old STOPPED projection.

## V8: strict legacy authority and handler lifetime

Current strict source is `replica-dispatch-service.js:47-74`, repository read
`replica-operation-repository-read-methods.js:425-438`, and absence
classification `replica-operation-repository-visibility-methods.js:489-493`.
The revised strict test independently approved at SHA256 `0dd845ca...` pins
the original operation ID, OWNER_RPC_REQUIRED and requireAbsenceConfirmation
against a scripted repository. Its newly approved option-omission control is
already control seven; do not count it twice or call it native RPC evidence.

Current handler tests at lines 473-640 preserve original-authority recovery,
wrong-entity no-poison, unavailable-then-valid retry and late authorization
after replacement. At lines 644-754 they cover queued admission, late STOP
settlement and gate reuse. The exact #382 source-reversion baseline has
meaningful memo corruption failures
`STALE_REMOVE_REPLACED_SUCCESSOR_MEMO` and
`OLD_STOP_SETTLED_AND_OVERWROTE_SUCCESSOR_MEMO`. #387 separately exposes retained
execution and blocked successor cleanup; the narrow approved source correction
addresses those. The logs expressly stop at first failure and cannot prove
later unexecuted assertions. See the retained lifetime-continuation README.

No preserved isolated original-operation/owner-mode omission, unavailable-to-
absence authority mutation or late-authorization-guard mutation was found in
the current U1 evidence census. Current positives remain meaningful consumer
tests. The final reviewer should require only controls demanded by the actual
legacy ownership claim; neither the new registry wording nor this census
adds a real RPC/physical STOP-safety acceptance claim. In particular a late
STOP result not overwriting a memo is narrower than proving that an already
admitted external STOP cannot affect a successor.

## Current byte bindings and scope of the search

| Current owner/oracle | SHA256 |
| --- | --- |
| `src/wasm-service/wasm-creation-custody.js` | `f24645c771d848563a5767221a84749b037106ae0b654774ef30b07b3808c297` |
| `src/wasm-service/wasm-creation-retirement.js` | `dc1f2b1671cb5042fcb24579a69cce6e4fec84117ecc9e0254bfd3f9930c290d` |
| `src/wasm-service/wasm-service-lifecycle.js` | `1b416375caa9ceb5dc9eb876cdf766e11bb286fc8da1237260700ebef3a0b417` |
| `src/runtime/service-runtime-consensus-publication.js` | `82533d9c688f9c306f243f57f1c9ee3c1e14d4f7457c8c2abab13a0c07e496fd` |
| `src/service/service-consensus-creation-intent.js` | `19f996fc5c079db1a01096ad4d657a1ee8c4d53db1c63bcd6ffb75e18db4ed3d` |
| `src/control-plane/replica-dispatch-service.js` | `385217923b84a9981204398d25b434453d01df709aa09daf429f24c378e04352` |
| `test/wasm-service/bound-creation-physical-custody.integration.test.js` | `b22348a23a705765b92be5480737b2532d79aa90570fd0209554a2fa83de7d6b` |
| `test/wasm-service/bound-creation-restart.integration.test.js` | `197cf1610af6b779dfed1edb60c86faa31b882b47967b4b493a5963e29c1f945` |
| `test/node/runtime-service-handler.test.js` | `e6fb5b6b658fa855ecabe22689c7e3d7896e783fe68ed7a19a17dc961cb77fe3` |
| `test/control-plane/replica-dispatch-reservation-identity.test.js` | `0dd845ca42bcdbb3db8851fd610df077438ca145bf15c43d8a039d091be86b17` |

The census read the current named tests and owners, v3 and D2 addenda, the
preserved coherent physical/source/oracle verdicts, original M06/M07 patches
and source maps, #247/#266 complete failure analysis, the retained #382/#383/
#387 receipt/log records and the quest's appended control/checkpoint findings.
It does not claim an exhaustive search of unrelated historical quests or
remote unpublished objects. No additional meaningful control is inferred from
an old total, a green source review or an apparatus failure. Earlier accepted
F1 reservation-finality remains a separate bounded accepted package; U2 is
still gated on complete independent U1 approval.
