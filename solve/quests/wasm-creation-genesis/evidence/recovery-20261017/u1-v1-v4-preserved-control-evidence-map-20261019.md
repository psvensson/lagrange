# U1 V1–V4: preserved control evidence and remaining discriminators

Author: `subagent:/root/lab_recovery`. Date: 2026-10-19, approximately 16:21 UTC.  
Scope: source/test/evidence inspection only. No behavioral test, mutant, remote write or source/test edit was performed. This is a bounded evidence map, not U1 acceptance.

## Governing subject and evidence ceiling

This map applies the finite checklist's V1–V4 groups to approved v3, its bounded-custody and hydration addenda, and the ordinary HELD-memo wake clarification. It distinguishes a measured historical counterexample, a current positive witness, and an isolated source-only control. Their scopes are not interchangeable.

The relevant current source and tests were inspected while HEAD advanced from `19780f8dbd5c71155d4db8a3c6053570f4df7d31` to `25cb5b1fb487485f2789d63d9b0fcb150788890c`. The accompanying byte binding file records exact inputs. At the latter observation, the working bound-route test had only two indentation changes against HEAD: its working SHA-256 was `66e7f0a7ffcdeb0a94f3d05762f513c455435c794127830e8a3498fc520e5dc4`, versus `2f85d7a2891b66b90261b510452bbf9f717f3710dad983739c413957b2a967be` at HEAD and lab #383. No semantic expectation changed in that diff. This record does not invent an immutable candidate containing uncommitted work.

The inventory, execution, bound-route, handler, recovery-manager and state-record source bytes inspected for V1–V4 match their versions at lab #383's source `a55ab41296faf30a4c404c56117eacbaa993c903`. The restart test and native embedding fixture also match that positive checkpoint. The newer generic REMOVE guard correction and its handler tests are distinct V9 work. The #383 twelve-file PASS is useful bounded positive evidence for unchanged files; it does not become the required new thirteen-file result or a negative control by aggregation.

The original rejected-subject M01–M13 package is not used as passing evidence here. The separately accepted F1 M01/M02/M03 package remains meaningful for reservation-finality inference and original immutable reservation survival, with its own source/test bindings. It does not prove inventory coalescence, exact-plan routing behind J, canonical execution custody, or ordinary J memo-wake progress.

## Recovered baseline and byte lineage

The meaningful earlier baseline is [lab #247](https://github.com/psvensson/lagrange-lab/issues/247), source `8c9b14141f89872938d21cc35472b262929818d6`. It ran the bound-route and restart files against the earlier combined implementation and failed twenty leaf tests. Its complete 91,437-byte log was rehashed in this inspection:

`cb09c3ad451e0683c6b3b0d3979a68ba4a6d16100f6d57aec7efd36cf5846708`.

The two original files were fetched by that immutable SHA and their returned Git blob identities were independently checked from their bytes:

| Baseline file | Git blob | SHA-256 |
| --- | --- | --- |
| `test/wasm-service/bound-creation-restart.integration.test.js` | `9be21308124f57d349addbeb25fb4171f17eccea` | `d8c2a7c403aa03526a7e9e31766a9d8d706cca347aeaea38d9fe228ca877cb30` |
| `test/node/runtime-service-bound-route.test.js` | `754cd462fafb848155a26ab316fe5ffb12a089e7` | `c9d6d8a8151d99d007d8fba1db803dd64e6fbacca1d1225ef1c2f1ba6e7318c2` |
| `test/wasm-service/bound-creation-handler-embedding-fixture.js` | `be078e3939f8fe3673bd90f28de099cc68199e44` | `fae23bc1c01d42b70d1020bdfd4670cbef256d2d58812221529aaeec774d5515` |

The native fixture and the restart file's 6,530-byte shared helper prefix are byte-identical to current inputs. Seven relevant native witness regions also survive verbatim: journal-read shutdown, startup-first retirement gate, historical predecessor/successor order pair, older-ABSENT order pair, HELD/ACTIVE future routing pair, local-read shutdown, and one-journal-SELECT. Region boundaries and exact hashes are in the binding file. Appending unrelated tests does not erase these measured counterexamples.

There are two relevant qualifications. The coalescence case gained an explicit physical-materialization prerequisite before forming the group; its decisive assertions were preserved, but its whole region is not byte-identical. The duplicate-conflict case now expects the approved `outcome: CORRUPT_STATE` carrier rather than `code`; its historical failure was a missing rejection, not a measured wrong carrier. The bound-route file's scripted physical owner also gained the currentness/finality contract; unchanged assertion text alone therefore does not prove an unchanged full fixture.

## What the original first failures actually establish

| Group | Original first failed assertion in #247 | Retained claim and ceiling |
| --- | --- | --- |
| V1 journal-read lifetime | `INVENTORY_REENTERED_AFTER_PROCESS_CUSTODY_TRANSFER` | A stopped old handler invoked the original resume after a replacement composition held the real directory owner. Exact witness and native fixture survive. The test logs memo/in-flight state diagnostically but does not assert their absence. |
| V1 coalescence | `OVERLAPPING_INVENTORY_STARTED_A_SECOND_SCAN`, actual 2, expected 1 | Concurrent startup performed another observation. Later shared-plan/replay/ACTIVE-memo assertions in that leaf were not reached on the baseline. The current additional materialization prerequisite is explicit. |
| V1 local-read lifetime | `STOPPED_LOCAL_INSPECTION_ADMITTED_A_CREATION` | An old handler resumed after the actual local inspection crossed shutdown. Exact region survives. Later memo/ready/outcome checks did not run after this first throw. |
| V1 one observation | `RECOVERY_TORE_ONE_JOURNAL_SNAPSHOT_INTO_TWO_READS`, actual 2, expected 1 | The real journal transition was observed through two reads. Exact case survives; the later duplicate-entry assertion was not reached. |
| V1 duplicate reader | `SAME_OBLIGATION_WAS_RETAINED_TWICE`; separately `Missing expected rejection: CONFLICTING_OBSERVATIONS_WERE_ORDERED_INTO_A_WINNER` | The broken reader result retained identical rows twice or accepted conflicting rows. The current conflict carrier is separately revised; this baseline is evidence of missing rejection, not validation of the former carrier. |
| V2 original debts | `DISTINCT_RETAINED_CREATION_OBLIGATION_LOST_BY_INVENTORY_ORDER` in both orders | One original predecessor journal stayed IN_PROGRESS; in the successor-first case J's resume and memo were also lost. Exact pair survives. It covers one I plus J, not two I debts or every J projection. |
| V2 older ABSENT | `OLDER_REENTER_PLAN_SUPPRESSED_SUCCESSOR_REENTRY` in successor-first order | J was not resumed and the old FAILED memo won. Exact pair survives; only the successor-first member failed in this baseline. |
| V2 exact future F | `KNOWN_RETAINED_F_REDIRECTED_TO_CURRENT_J` in the HELD case | The original F request resumed J. Exact HELD/ACTIVE region survives. The ACTIVE member first failed `already_exists` versus `in_progress`; its later wrong-owner assertion did not execute. |
| V3 startup-first gate | `RESTART_REDRIVE_BYPASSED_EXISTING_REMOVE_SINGLE_FLIGHT`, actual 2, expected 1 | Startup and coordinator entered the actual manager STOP twice. Exact witness and native fixture survive. It does not measure every observer identity, opposite admission order, target replacement or late settlement. |

These remain useful measured mechanism sensitivity. #247 changed several owning guarantees together; it is not a set of isolated current-source perturbations. Explicit final-candidate mutation requirements remain separate. No new execution is required merely to repeat its count or refresh its date.

The hydration shutdown/replacement baseline members failed the setup assertion `unknown first CREATE never hydrated its exact journal origin`. They establish the missing hydration prerequisite only. They do **not** demonstrate that a post-hydration stopped/entry guard was exercised. The PENDING-wake baseline likewise stopped at `PENDING original was not hydrated before resume`, before token-adoption exclusion. The failed-hydration member did reach the substantive `failed hydration was followed by a blind bound resume`; its unchanged intent retry remains a consumer-level journal/handler witness with the revised physical fixture limitation above.

## V1: inventory owner and lifetime

Current owner paths are `runtime-service-restart-inventory.js` (`recoverRetainedCreations`, `inventoryAttempt`, `createRestartLatch`), the manager's recoverable reader, `service-lifecycle-recovery.js`, and `operation-lifecycle.js`'s SQL builder. The restart owner remains byte-identical to the coherent `ac092686` source approval; the manager/recovery files have later changes and must use their current source-review disposition.

The existing coalescence leaf now checks `OVERLAPPING_INVENTORY_STARTED_A_SECOND_SCAN`, `CALLERS_DID_NOT_SHARE_THE_APPLIED_PLAN`, `SUCCESSFUL_INVENTORY_WAS_RESCANNED`, and `STALE_STARTUP_SCAN_OVERWROTE_LIVE_ACTIVE_MEMO`. The local-read leaf checks `STOPPED_LOCAL_INSPECTION_ADMITTED_A_CREATION`, `STOPPED_LOCAL_INSPECTION_WROTE_MEMOS`, `STOPPED_LOCAL_INSPECTION_REOPENED_READY`, and `STOPPED_LOCAL_INSPECTION_EMITTED_AN_OUTCOME`. These are actual current assertions, not proposed labels.

Minimal missing work is the explicitly required separate coalescence and stopped-lifetime perturbation evidence on the frozen final witnesses, plus the following currently absent observations:

- Failed, unapplied inventory followed by restoration of the real reader and one successful explicit retry, then retained successful replay. The duplicate-conflict case stops after rejection/no effects; the coalescence case begins with a successful observation. Neither proves this transition.
- Journal-await shutdown assertions for memo, ready and outcome exclusion. The existing journal-await case proves no resume and only prints the other state. An empty observation is useful for isolating this cut because a later local-read guard can otherwise mask omission of the journal-return guard.

No new fabricated assertion name is supplied for absent witnesses. The corresponding author must first provide a reviewable oracle. Source mutants must remove the named semantic guarantee while keeping the real observation prerequisites intact; a surviving downstream fence or a setup timeout is not an executed exclusion.

## V2: exact plans and canonical projection

Current owners are the original per-operation plans in `runtime-service-restart-inventory.js`, `replyToRestartPlan` before the public handler memo route, bound `writesMemo`/`maySettleRemovalMemo`, and `service-lifecycle-state-record.js`'s physical-current projection.

The preserved order and HELD-F counterexamples remain meaningful. Current future progress assertions include `LATER_EXACT_F_TRIGGER_WAS_UNREACHABLE`, unchanged original `intent_json`, original admission operation ID, and the same physical J object after the real selection prerequisite changes. These are more specific than a final suite count.

The minimal explicit source-only exclusions still needing their own current evidence are: memo ownership made a prerequisite for an old RETIRED cleanup; an unconditional old STARTING/STOPPED canonical claim; and exact retained lookup moved below ordinary memo routing. The existing named witnesses above are valid starting discriminators, but they do not cover every required state:

- The D1 loop contains HELD and ACTIVE only, with F deliberately placed first. REMOVING(J) and the required other enumeration order are absent from that pair.
- The historical debt order case contains one I plus J. It asserts original journal states, J's memo and resume IDs; it does not assert the full J manager record, driver state, exact physical object, endpoint and services preservation tuple. Two old debts plus J is absent.
- The reconstructed physical P1/P3 witnesses concern late STARTING/RUNNING returns after old retirement. They are not the old-retirement STOPPED-over-J experiment. The V5–V8 reviewer independently confirmed this boundary.

The missing composed cases can carry multiple assertions in one reviewed fixture. There is no need to repeat already measured one-I order counterexamples merely because that fixture gains the required additional debt/projection checks.

## V3: canonical handler execution custody

`runtime-service-creation-execution.js` is the single installed execution/observer owner. `admitBoundRemoval` captures `creationOperationId` and origin before queueing; `queueBoundRemoval` and `routeBoundRemoval` consume that entry and compare current object identity. Physical custody remains with the lower lifecycle.

The startup-first duplicate-STOP failure is measured. The newer coordinator-first case has actual assertions `COORDINATOR_REMOVE_DID_NOT_REACH_ORIGINAL_OWNER`, `IDENTICAL_COORDINATOR_REQUEST_LOST_ITS_CAPTURED_TARGET`, `FOREIGN_COORDINATOR_REQUEST_WAS_UNBOUNDEDLY_ADMITTED`, `DUPLICATE_COORDINATOR_REMOVE_ENTERED_ANOTHER_STOP`, and `COALESCED_REMOVE_EMITTED_MULTIPLE_OUTCOMES`. The two occupied startup-observer-ID consumer cases check `OBSERVER_OPERATION_ID_ATTACHED_TO_ANOTHER_REPLICA`, `CONFLICTING_OBSERVER_ID_EARNED_AN_EXECUTOR_RESULT`, and `CONFLICTING_OBSERVER_ID_STARTED_ANOTHER_OWNER_EFFECT`; their local RETIRED result is explicitly scripted. Those first carrier checks must not be reported as later forbidden-effect execution when a mutant stops there.

The current hydration replacement case checks zero resume/runtime calls/outcomes, unchanged memo and exact replacement entry, but those decisive assertions are unnamed. Its original #247 execution never reached them. A control removing only post-read current-entry/lifetime enforcement therefore remains required to establish that sensitivity.

Minimal remaining custody experiments concern shared-gate bypass, captured-target substitution, exact-entry late settlement, bounded observer identity and thrown-call release. The current test population has material gaps that should be filled before trying to claim those effects:

- The coordinator-first case repeats one request while its own STOP is pending; it does not also introduce a later startup inventory/plan competing with that coordinator-owned execution.
- No composed bound REMOVE witness replaces the canonical memo after admission and proves the exact old target is still used. The new generic memo/STOP tests have a separate owner and V9 scope.
- No composed unresolved old I attempt releases its gate for already queued J, retains I's original debt and avoids autonomous self-retry. No corresponding thrown bound-owner call followed by J progress was found. The generic stop-throws test only checks a FAILED memo; it does not observe the next bound plan.
- The startup-first observer case proves one occupied observer and cross-replica operation-ID protection. Repeated matching requests, distinct refused observer IDs, bounded retained state and subsequent normal admission after release still need their complete stated disposition.

These are finite v3/D3 transitions. Several can share one new composed test with a typed-unresolved/throw parameter, provided each run reaches its own actual effect assertion. A carrier refusal or hung prerequisite cannot stand in for duplicate/wrong-owner effects.

## V4: ordinary HELD J wake behind F

The current native fixture and the new ordinary-memo cases are valid positive/negative witnesses, but they were appended after #247 and no preserved isolated red result was found for them. The narrow clarification explicitly requires their mutation discrimination.

Two required source perturbations have direct current decisive assertions: remove J's memo wake-bit retention and require `ORDINARY_J_WAKE_WAS_LOST_BEHIND_F`; omit physical-current admission and require `STALE_ORDINARY_J_WAKE_ENTERED_AFTER_REPLACEMENT` in the real physical replacement member. The positive additionally checks `GATE_RELEASE_DID_NOT_CONSUME_EXACTLY_ONE_ORIGINAL_J_WAKE` and `WAKE_CREATED_A_NEW_JOURNAL_OR_CHANGED_ORIGINAL_RESERVATION`.

The current tests retain foreign, unavailable-grant and RESOURCE_CLOSED no-pending controls. Their effect assertions include `NONQUALIFYING_WAKE_RESUMED_J`, `NO_REENTRY_FOR_AN_UNAVAILABLE_GRANT` and `NO_WAKE_PENDING_FOR_AN_UNAVAILABLE_GRANT`; state assertions also keep J's wake out of F's entry/plan and keep F's token null. No earlier rejected-subject wake mutant is promoted to proof of this new ordinary-memo composition.

The volatile memo replacement member replaces J before gate release and removes the pending bit from the new memo. It proves that an old detached bit does not transfer. It does not independently perturb the post-observation same-memo comparison inside `resumeHeldMemoWake`, because that function first reads the replacement memo and sees no bit. Any claim to have killed that exact reentrant post-observation guard requires a corresponding seam; it must not be inferred from the existing replacement title. This is a coverage boundary, not an instruction to manufacture arbitrary mutants beyond the named same-memo/full-origin/currentness guarantee.

## Practical disposition

Retain #247's seven unchanged native regions and substantive first effects as measured bounded controls. Keep its revised coalescence/carrier and scripted hydration lineage explicit. Preserve #383 as an unchanged-file positive checkpoint, then use the required immutable thirteen-file result when available. Run only the named missing source-only discriminators after their test tree is frozen and any genuinely absent oracles receive independent review. V1–V4 stay open until those exact observations and the current source review are reconciled; this map neither adds a new implementation lane nor opens U2.

The physical-review agent has been informed of the concrete missing V1–V4 cases and owns any draft additions outside the checkout. The parallel design-research agent owns V5–V8 and the six physical start/return plus strict controls. Root owns all execution submissions and source publication.
