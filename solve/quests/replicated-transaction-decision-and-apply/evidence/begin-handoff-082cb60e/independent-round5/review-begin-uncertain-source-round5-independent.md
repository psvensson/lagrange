# Independent BEGIN source review, round 5

## Verdict and scope

**REJECT source snapshot `082cb60e6d96f17d05f03477c24de247a22be239` for one remaining grouped resource-accounting finding, B5-1.** The cumulative behavioral corrections pass: 30/30 cumulative assertions and 12/12 corrected extension assertions. The independent canonical run passes three files and 280 runner assertions, including ordinary pg.Client/TCP controls. B4-1 through B4-3 are fixed within the reviewed scope; B4-4's previously enumerated roots are covered, but the claimed complete maximum still omits variable capture scratch at the real strict-own-data boundary.

This is a complete bounded cumulative SOURCE review of all 63 instantiated items, with unchanged accepted design and prior scoped approvals preserved. It is not activation, normal startup, cluster, main, merge, publication or corpus approval. Reviewer: author-distinct `/root/review_activation_ruling`. No product/source/test/design/metadata/index/Quest mutation, stage, commit, push or cluster run occurred. Only this report and new diagnostics D were written.

AGENTS -> rules -> router, authority/recovery, Quest, verification INDEX and all ten verification templates were loaded in this review session. Their evidence-path requirement applies below. The existing trusted-host and strict-own-data boundary is unchanged.

## Exact subjects and provenance

| Subject | Exact identity |
| --- | --- |
| Source snapshot | `082cb60e6d96f17d05f03477c24de247a22be239` |
| Tree / parent | `92ffbe89de4350cd73b1558c770d0bddf7eb604d` / `c6d71665e98be03de916705f272a9d6340e4a842` |
| B | `/mnt/data/peter/projects/.worktrees/rs-raft-startup-integration-20261011`; caller HEAD remains c6d71665 |
| E | `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011` |
| D | `E/begin-source-round5-independent` |
| P | `B/test-output/continuation-20261011/begin-source-round5-working` |
| Source manifest, 40 paths | `P/source-manifest.sha256`, SHA-256 `04875d4e8dda8c0e4a59dedd771dc3e1630f53a1b1a3a90d6bf13450970e59b5` |
| Evidence manifest, 57 entries | `P/evidence-manifest.sha256`, SHA-256 `c550f79359432326d38e55b121e75dee48e7ee842351ee86ab565dd1d60fbf77` |
| Freeze packet | `P/freeze-packet.md`, SHA-256 `0aa46eb9d0969797e2ee4845b1e04e62502295dadc384db089443271c028d3c4` |
| Freeze summary | `P/freeze-summary.json`, SHA-256 `0183179bbf6a9021be0e70708792637e9e60c9b626edde26e909272a13847cb0` |
| Ownership map | `P/transition-ownership-map.json`, SHA-256 `df0caa68dc8fc4f99834d653b5740935a2189029784156a74f51da87c077c8b5` |
| Retained census | `P/retained-root-census.json`, SHA-256 `c466c1700d0657d162d230f26060f31e6b70a3ca0b8144c7566af8c96f25d123` |
| Expectation changes | `P/expectation-changes.json`, SHA-256 `9e43cde87f44f93567f4f0ec05766d44e141fbb4591b9b34ec507b021ec4e636` |
| DS, accepted design | `B/solve/quests/replicated-transaction-decision-and-apply/design-query-begin-uncertain-insert-resolution-2026-10-11.md`, SHA-256 `3679b87f4aeb84fd8d9397aac9f73f686e5fcb990c1e61e86df35e9731f91fa5` |
| Design approval | Same Quest `evidence/review-begin-uncertain-design-round7-cdc56.md`, SHA-256 `c42b12bb01d1167e9b111c7469c458c82f80cc60e013fdcbfb9583313e1f74d6` |
| PR4, immediate rejected predecessor | `E/review-begin-uncertain-source-round4-independent.md`, SHA-256 `4460dbaf0eb965947aa2136a54ad2406e37a86a35580909f92128501024dc281`; source `d1ea7302fcf51b2c4be21b8d47db6295bef3d555` |
| PR3, cumulative coverage | `E/review-begin-uncertain-source-round3-independent.md`, SHA-256 `8f40f0b6559acd31db23790b8b7b753013366442e452085b05d2988d2130c8b8` |
| PR2, cumulative coverage | `E/review-begin-uncertain-source-round2-independent.md`, SHA-256 `715e4532bae306ab70619737715173b117556d652e90865737f5c59fc2b1bcf5` |

All 40 manifest files match both their hashes and the immutable snapshot; all 57 author artifacts match (`D/provenance-verification.json`, 97 entries). Evidence paths in the round-5 manifest are relative to P; source paths are relative to B. An initial reviewer path-base mistake and consequent missing diagnostic-module attempts are preserved in `D/setup-diagnostics`; they are setup failures, not product failures. The corrected verification and all substantive reruns completed. `D/source-verification-final.json` independently rechecks the 40 source blobs at review completion.

The delta against rejected d1ea7302 is exactly four files: CO, CR and the two existing BEGIN test files. Each delta, the self-contained packet and its ownership/census/expectation disclosures were read in full. No recovery, persistence or metadata source changed in this amendment.

## Executed proof, corrections and durable effects

Canonical command, cwd B:

```sh
npm run test:file -- test/query/transaction-begin-source-adversarial.test.js test/query/transaction-begin-uncertain-handoff.test.js test/query/transaction-review-adversarial.test.js
```

**3/3 files, 280 runner assertions pass** (`D/canonical-focused.log`). The author packet's seven files/594 runner assertions and copied 30/30 plus 12/12 matrices remain author evidence, not independent approval or distinct leaf counts.

The previous independent scripts were copied unchanged into D and rerun. CUM passes **30/30**. The unchanged round-4 lifecycle fixture assumes every gateway mutation contains an INSERT row; the corrected source now reaches ordinary recovery updates and exposes that fixture error. Its original output and the resulting old-evaluator error remain preserved. `D/round5-lifecycle-probes.mjs` handles normal update/upsert mutations, records them, and actually executes the ordinary recovery sweep after advanced handoff. It does not skip that sweep. `D/evaluate-round5-extensions.py` also corrects the retirement positive control to require one INSERT and unchanged durable row, and limits the creation-budget assertion to actual creation-handoff reads; the existing ordinary recovery owner uses its own read path. EXT passes **12/12**. These adaptations are explicit, diagnostic-only and do not weaken a source requirement.

| Prior finding / control | Current independently observed result |
| --- | --- |
| B4-1a, expired first control turn | CO:711-715 installs the new pre-FIFO control budget before advanced reconciliation. LIFE's retry at now 30001 uses deadline 60001, while original transaction deadline remains 1000000. Advanced handoff succeeds, same record and consumer remain, one INSERT total. |
| B4-1b, explicit retirement after advanced observation | CO:665-674 respects `advancedObserved` independently of SERVER_RECOVERY_ONLY. RET retains one 1849-byte record before and after retirement/handoff, never replays the initial INSERT, never revives the retired consumer, and preserves the exact COMMIT decision. |
| B4-2, live unknown outcome versus sweep | LIFE observes the existing sweep perform exact reconciliation once evidence returns. It retains the live consumer and one 1737-byte UNCERTAIN_ANSWERED result with `rowInserted:true`; same-session retry accepts the same ID and releases the creation charge. Both recovery-before-retry and retry-before-recovery cumulative controls pass. |
| B4-3, actual timer then late uncertainty | CR's actual 5 ms attachment timer detaches only the caller. CO:478-494 preserves the record consumer when the operation consumer has already detached. TIMER runs both retry-first and sweep-first after a 15 ms held INSERT: one 1849-byte record survives uncertainty, the same ID is accepted, and final record/operation/attachment counts and charges are zero. |
| B4-4, previously missing budget/projection roots | The old measured 161218-byte lower bound is covered by the new 201632-byte record charge. The source test's 201618-byte synthetic figure covers that list plus two row equivalents and three delivery-key references. B5-1 identifies the remaining capture overlap; the earlier lower-bound green is preserved. |
| B3 monotonic evidence / live advanced disposition | CUM:24-29 preserves no replay after advanced observation, both caller-expiry orderings, valid live claim versus sweep, and actual adapter/handler C,Z/T output. A valid live claim is not reported resolved by the competing sweep. |
| SR/B2 identity/input/shutdown/pressure | CUM:1-23 preserves immutable six/full15, missing/foreign/malformed/accessor refusal, no remint on uncertainty, original-expiry refusal, strict initializer capture, exact map/object/generation shutdown fencing, bounded 17-member rotation/backoff, first/retry maximum operation budget and before-write low-cap refusal. |

### Advanced COMMIT positive control, including absent progress

AO preserves the original retry-first and sweep-first controls. LIFE additionally reaches actual ordinary decision fanout after the formerly stranded expired-control handoff:

- Transaction `280ceea2b7a25b9e44f854b4b5d984b7`, original deadline 1000000; authoritative row COMMITTING/FROZEN/TWO_PHASE_COMMIT with manifest member `p-delayed` and a complete empty participant-progress page.
- Recorded COMMIT digest `382183968a570ca1417d9ee0573ed7e73e3088c416dcfb2da41dd7703beec9a8`; the member is restored through the existing recovery owner even without a progress row.
- After the new control turn: advanced handoff true, live consumer retained, RECOVERY_PENDING, one record/1827 bytes, no new INSERT.
- Ordinary sweep emits exactly **one COMMIT and zero rollback**; durable status becomes COMMITTED with unchanged decision text/digest and manifest. The record/1827-byte live-result obligation remains owned for its consumer. Full updates, fanout, result and before/after state are in LIFE.

RET's explicit-retirement schedule retains transaction `4c0c5ca5eacb154d48222a692ec960d8`, digest `1348c98278ebcf7ac752c58b8e589cb5ef5bd429fe5a4e346123002494e89956`, and one original INSERT with key `0207709eb21d1b05a4f628e4f1b7818533a7c384f4d1d901a738a766b6517dd4`. It progresses through authoritative advanced handoff without replay. This schedule does not itself execute the later terminal fanout; LIFE/AO provide that separate proof. No durable COMMIT is rolled back in any executed control.

## Complete grouped finding

### B5-1 — MEDIUM — The complete record envelope omits variable strict-capture scratch

The declared model counts each simultaneously retained string **property reference** at full UTF-8 length, numbers/booleans and object references at eight bytes, independently of VM interning or layout (CR:17-23,342-380). DS:1065-1085 requires a maximum complete transition footprint, including fixed transition scratch whose fields retain variable strings, reserved before row/buffer/DWC/gateway allocation.

The revised census admits nine session/owner references and six row-field copies. The synthetic assertion in `test/query/transaction-begin-source-adversarial.test.js:673-710` adds two full row equivalents to the previously observed persistence roots. The real reader performs another relevant overlap:

1. PV:283-296 receives a plain authoritative row and calls `copyDenseOwnDataRecordArray` while the current creation/persistence owner is still awaiting the read.
2. OWN:90-103 copies the row through `copyStrictOwnDataRecord`; OWN:78 creates a distinct target record.
3. For `session_id`, OWN:81 creates an ordinary own-property descriptor. Its own `value` property holds the 20000-byte session string; three own boolean attributes also exist. OWN:85 then assigns that same string into the target row's own `session_id` property while the raw row and descriptor are still in that copy step.

This is ordinary trusted strict-input capture, with no getter execution, proxy, intrinsic mutation or hostile-host assumption. It is transient scratch within the exact admitted readback path, not a new ledger, route or future manifest scope. The omission also does not require assuming the earlier `builtRow` local remains live: the lower bound below explicitly excludes it.

`D/round5-readback-descriptor-probe.mjs` uses Node's inspector on **unchanged source**. It records the real persistence projection at PV:212 and stops at OWN:85 immediately before the actual property assignment. The real SQLQueryEngine/gateway path executes one initial INSERT, loses that reply, reads the same full canonical row once, and returns a successful same-identity BEGIN result. Injected owner time remains zero. The inspector records own fields, not VM allocation size, and does not retain source objects in a substitute product owner.

At the copy step the diagnostic verifies distinct raw input, target and descriptor; the target already has the 32-byte transaction ID and does not yet have `session_id`. The exact next source operation adds its 20000-byte session property. The following is therefore a canonical source-derived peak at that assignment, using observed own fields and the source's stated weights:

| Canonical component | Bytes |
| --- | ---: |
| Raw candidate, normalized DWC record, frozen/encoded initial row, consumer, original/current budgets, reservation and actual persistence projection | 161174 |
| Raw authoritative row | 20104 |
| Partial target row immediately before assignment | 32 |
| Own descriptor: 20000-byte value plus three booleans | 20024 |
| Target `session_id` field added by OWN:85 | 20000 |
| **Lower bound at the assignment** | **221334** |
| **Reserved record envelope** | **201588** |
| **Shortfall** | **19746** |

`COPY` records the observations; `CENSUS` records the arithmetic. `D/round5-copy-census-assertions.log` has two positive controls and one failed envelope assertion. The smaller zero-clock number versus the author's 201632-byte wall-clock example comes from shorter encoded numeric values, not a changed cap or schema.

This bound excludes the gateway-built row, other callback/index/mutation/options roots, operation/attachment envelopes, null fields, object headers and allocator overhead. It does not count duplicate references to the same object twice as duplicate objects. It counts the actual separate own string properties specified by the admitted canonical model. At this boundary diagnostics report one INSERTING record, one operation, one attachment and totalBytes 241719; that aggregate is not a substitute for the independently reserved role-neutral record envelope. The accepted contract does not allow borrowing unrelated operation headroom to repair this record census.

The accompanying full-row capture diagnostic also observes the distinct raw and captured arrays/rows at PV:307. The decisive finding does not rely on treating every earlier local as retained: even allowing the two synthetic row slots to cover raw input and captured output, the variable descriptor value overlaps that copy. Correct the complete per-phase lifetime census or the representation lifetime and preserve the strict-own-data behavior. Do not merely certify the previous lower bound, change the default 1 MiB cap, or weaken the accepted resource contract. The test-only 250000 cap is disclosed and is not itself a finding.

No additional independent semantic defect was found in the bounded batch. The finding limits resource closure while preserving the successful handoff, timer, recovery and COMMIT controls above.

## Source and diagnostic aliases

Source aliases below refer to exact 082cb60e bytes under B. Prior scoped source coverage is identified explicitly; unchanged source is not treated as newly executed production proof.

| Alias | Path |
| --- | --- |
| CO | `src/query/distributed/distributed-transaction-creation.js` |
| CR | `src/query/distributed/distributed-transaction-creation-resources.js` |
| CT | `src/query/distributed/distributed-transaction-creation-contract.js` |
| DC | `src/query/distributed/distributed-transaction-coordinator.js` |
| RE | `src/query/distributed/distributed-transaction-recovery.js` |
| RA | `src/query/distributed/distributed-transaction-recovery-authority.js` |
| DP | `src/query/distributed/distributed-transaction-decision-protocol.js` |
| PV | `src/query/sql-query-engine-transaction-persistence-methods.js` |
| RS | `src/query/sql-query-engine-transaction-set-methods.js` |
| IO | `src/query/sql-query-engine-instance-initializer.js` |
| LC | `src/query/sql-query-engine-lifecycle-methods.js` |
| BA | `src/runtime/pgwire-begin-acceptance.js` |
| AD | `src/query/pg/postgres-wire-adapter.js` |
| WC | `src/workflow/durable-workflow-coordinator.js` |
| OWN | `src/utils/strict-own-data.js` |
| CUM | `D/round4-cumulative-assertions.log` |
| EXT | `D/round5-extension-assertions.log` |
| LIFE | `D/round5-lifecycle-probes.json` |
| RET | `D/round4-advanced-retirement.json` |
| TIMER | `D/round4-timer-orderings.json` |
| RESOURCE | `D/round4-complete-resource-probe.json` |
| COPY | `D/round5-readback-descriptor-probe.json` |
| CENSUS | `D/round5-resource-census-result.json` |
| SP | `D/semantic-probes-unchanged.json` |
| AO | `D/advanced-orderings.json` |

## All 63 evidence dispositions

PASS is scoped to the cited requirement and evidence. FAIL names B5-1. LIMIT identifies unclaimed production measurement. Each item was reviewed before this single verdict; previously passing unchanged clauses retain their exact scope.

### Admission A1–A7

| Item | Verdict and evidence |
| --- | --- |
| A1 | **PASS.** CO:253-277, AD:251-277 and BA:8-27 use the same exact private acceptance token, consumer and deadlines. CUM:11-12,24,28-29 and TIMER preserve preaccept/accept entitlement, late refusal and actual queued pgwire claim. |
| A2 | **PASS.** PV:125-145,276-311 separates initial/advanced/foreign/missing/invalid/unavailable. CO:478-494,665-719 preserves uncertain/live/server/advanced meaning after timer, retirement and expiry; EXT:1-10 and RET show typed outcomes with same ID. |
| A3 | **PASS.** CO:383-434 captures original/control budgets before FIFO; CO:711-715 installs current control before advanced handoff. LIFE uses 30001→60001 with original deadline1000000. CUM:3,11-12,16 preserves original-expiry and delayed completion refusal. |
| A4 | **PASS.** CO:44-91,478-494,689-703 and AD:251-277 propagate canonical uncertainty/recovery/success shapes. TIMER both orders returns exact BEGIN identity then accepts; CUM:4 preserves post-tag socket behavior. |
| A5 | **PASS.** Existing sweep and RE:307-319/DP:93-101 retain live result custody. LIFE's visibility schedule resolves unknown INSERT, retains one slot for client, then accepts/releases; AO/LIFE preserve live advanced terminal result. |
| A6 | **PASS.** CO:149-153,461-468,515-519,708-724 and RE:168-189 keep exact object/map/workflow/generation fences after awaits. CUM:6,13 shutdown and RET retirement controls do not clobber or revive a successor. |
| A7 | **FAIL B5-1 accounting; PASS disposition diagnostics.** CO:307-343 reports real roles/debt and CUM:28-29 retains truthful valid-claim deferral. COPY/CENSUS proves the declared record bytes omit capture scratch at OWN:81-85. |

### Retry Y1–Y7

| Item | Verdict and evidence |
| --- | --- |
| Y1 | **PASS.** LC:48-61, RE:425-470 and IO:272-279 remain the existing retry/lifecycle owner. LIFE/RET/TIMER show sweep after caller or consumer retirement actually reaches the current reconciliation/handoff. |
| Y2 | **PASS.** PV:276-311 returns bounded unavailable/missing/invalid; RE:258-300 retains exact work and backoff. LIFE now progresses after an unavailable read and expired prior control; CUM:14-15,23 retains bounded unreadable/census behavior. |
| Y3 | **PASS.** CO:44-91,478-521,730-774 gives typed result and preserves server debt on each error/retirement path. TIMER observes actual detachment followed by late uncertainty without dropping the consumer; shutdown controls CUM:6,13 pass. |
| Y4 | **PASS.** CO:649-719 preserves valid claim arbitration while allowing an unknown live outcome to reconcile. LIFE background visibility, CUM:26-29 and both TIMER orders cover client/pending/sweep composition without the former suppression. |
| Y5 | **FAIL B5-1 maximum bytes; PASS finite selection.** CR:173-181 and RE:193-205,258-300 bound operations, cohorts and folded diagnostics. CUM:14-15,21-23 proves rotation/backoff/pressure; COPY/CENSUS disproves complete record-footprint coverage. |
| Y6 | **PASS.** CT:24-69/PV:211-267 preserves immutable six, exact15 and command key. CO:665-674 refuses original INSERT replay after advanced observation in live and retired roles. RET/AO and CUM:17-20,24-27 preserve no remint or duplicate semantic decision. |
| Y7 | **PASS.** RE:280-300 updates defer once per turn without interpreting uncertainty as a successful ACK reset. CUM:14,23,28-29 and LIFE distinguish actual reconciliation, retained known result and competing claimed-result deferral; original control expiry no longer reuses a spent budget. |

### Transport T1–T5

| Item | Verdict and evidence |
| --- | --- |
| T1 | **PASS.** PV:246-263 requires canonical APPLIED or authoritative readback; CO:665-674 never treats replayed initial-command status as permission to erase advanced evidence. RET has one INSERT; CUM:4 and BA:15-27 preserve CommandComplete/socket separation. PR3's settled replay provenance remains scoped. |
| T2 | **PASS.** AD:318-333/CO:280-304 retires exact consumer/process identity. RET preserves durable COMMIT and server debt after explicit retirement; TIMER keeps live identity after caller-only expiry. CUM:6-7,13 covers late close and shutdown. |
| T3 | **PASS.** CO:44-77 supplies typed retry/defer codes consumed by RE:63-65,252-300. CUM:14,23 observes actual backoff; EXT covers typed advanced and initial recovery paths. |
| T4 | **PASS bounded component.** PV:276-311 and RS:69-90 retain missing-owner/read-transport classification and forward the actual budget. LIFE's previously stranded read now receives a fresh bounded control budget. Real network/formation margin remains unmeasured. |
| T5 | **PASS scoped fidelity.** Canonical run includes normal pg.Client/TCP; CUM's RecordingSocket adapter/handler controls remain separate. LIFE handles normal update/upsert and executes real recovery fanout. COPY uses the real strict capture, no source replacement or intrinsic patch. |

### Sweep/time S1–S5

| Item | Verdict and evidence |
| --- | --- |
| S1 | **PASS.** CO:156-185,711-715 uses the owner's injected clock and original deadlines; CR:204-212 unrefs caller timer; RE:454-470 retains existing sweep timer. LIFE tests independent recovery turn; TIMER exercises actual 5 ms timer followed by late completion. |
| S2 | **PASS.** RA:26-49,80-127/RE:307-319 restores complete manifest and durable decision; DP:93-101 retains live advanced result. AO and LIFE emit exact COMMIT for a member with no progress row, zero rollback; RET stays in server recovery after consumer retirement. |
| S3 | **PASS.** LC:85-98, CO:291-304, RE:168-189 fence disposal and discovery. SP/CUM:6,13 show exact map/workflow/generation protection and no post-shutdown installation. Existing durable restart recovery remains distinct from live caller expiry. |
| S4 | **PASS.** CO:156-185,711-737 separates original transaction expiry from current control turn. LIFE keeps deadline1000000 while renewing only the recovery turn; CUM:3,16 and TIMER preserve long transaction legality and late caller-only retention. |
| S5 | **PASS.** DC:291-307 and RE:68-85,193-205 retain FIFO plus bounded rotating cohort. CUM:23 covers 17-member fairness/backoff; LIFE proves the chosen live-unknown item can now reconcile without a client retry dependency. |

### Recovery R1–R5

| Item | Verdict and evidence |
| --- | --- |
| R1 | **PASS.** RE:307-319 installs advanced data into the same record; WC registration/live guards and RE:168-189 prevent successor clobber. AO/LIFE retain exact record/slot; SP/CUM:13 passes stale-object shutdown. |
| R2 | **PASS.** CO:478-494 distinguishes detached caller from retired consumer; DP:93-101 retains the live terminal result. TIMER both orders and RET cover opposite dispositions. RE:565 onward restart discovery remains separate, unchanged PR4:R2 scope. |
| R3 | **PASS.** RS:69-90 validates complete row/page sandwich; RA:26-49 preserves each manifest member as unknown/failed when progress is empty. AO/LIFE retains nonempty COMMIT and emits it; CUM/canonical refusals cover malformed/foreign/missing pages, and legal empty controls stay green. |
| R4 | **PASS.** CO:665-719 preserves monotonic advanced evidence and exact redrive owner. RET has one initial INSERT; AO/LIFE emits unchanged COMMIT without rollback. CUM:17-20 retains dedup reset/idempotent decision coverage; no fresh ID is minted for unknown outcome. |
| R5 | **PASS.** PV:276-311 never converts absent/unreadable/malformed row into completion or collision. PV:132-145 requires canonical foreign immutable evidence plus producer PK collision. CUM:1-2 and canonical tests preserve PR4:R5 negative/positive controls. |

### Concurrency C1–C5

| Item | Verdict and evidence |
| --- | --- |
| C1 | **FAIL B5-1 completeness; PASS reservation order.** DC:291-307 captures admission before FIFO; CO:560-580 reserves before row/buffer/DWC allocation. CUM:22 refuses before first write. COPY/CENSUS shows the admitted envelope does not cover the capture transition it later reaches. |
| C2 | **PASS freshness.** CO:149-185,461-468,515-519,708-724 checks exact identity/deadlines at result boundaries; current budget precedes advanced await. CUM:11-13 and EXT:1-10 cover timer/retirement/shutdown and post-await consumer state. |
| C3 | **PASS.** Existing session FIFO, CO:649-719 and synchronous BA:15-27 establish one acceptance winner. CUM:28-29 preserves queued-sweep claim; TIMER retains owner transfer across late uncertainty; shutdown remains exact. |
| C4 | **PASS.** CR:205-210 transfers consumer before detaching; CO:478-494 respects that retained consumer. Actual timer schedules in TIMER both accept the same later result; injected late-success refusal remains CUM:11-12. |
| C5 | **FAIL B5-1 resource footprint; PASS keys.** CR:215-245,292-329,383-414 use exact invocation/session/reservation identities and maximum operation envelopes. CUM:21 covers first/retry equality; OWN:81-85 creates the omitted variable record-transition scratch. |

### Formation/degraded path F1–F5

| Item | Verdict and evidence |
| --- | --- |
| F1 | **PASS source route inventory.** PV:211-311 initial write/read, RS:69-90 advanced sandwich, PV:163-207,344 onward decision/progress writes and `sql-query-engine-transaction-recovery-methods.js:158-173` census use existing gateway/degraded owners. LIFE reaches ordinary updates and commit fanout through this composition. |
| F2 | **PASS.** IO:272-279 wires existing census and handoff; RE:168-189 preserves retained IDs on discovery failure. LIFE background visibility and RET exercise recovery independently of the live client; no added discovery owner or ledger. |
| F3 | **PASS bounded behavior; B5-1 limits bytes.** CUM:21-23 and canonical controls retain finite admission, same ID and pressure refusal. LIFE/TIMER now complete the supported degraded readback handoff after prior control expiry/late uncertainty. |
| F4 | **PASS local budget propagation; LIMIT full startup margin.** LIFE passes current absolute control deadline through PV:323-329/RS:69-90, preserving original transaction deadline. No real startLagrangeRuntime end-to-end formation timing is certified. |
| F5 | **PASS.** IO:254-287/DC:291-307/LC:48-61 retains existing gateway, DWC, FIFO, lifecycle and recovery owner. No forced-open fixture, alternate raw transport, new ledger, second owner or readiness bypass is introduced. |

### Harness H1–H6

| Item | Verdict and evidence |
| --- | --- |
| H1 | **PASS.** PR4 preserves exact predecessor semantic reds; current source/97 artifacts match provenance verification. Original scripts and initial evaluator outputs remain unchanged/preserved. Diagnostic-only fixture adjustments and reasons are documented above; CUM/EXT then reach actual assertions. |
| H2 | **PASS scopes.** Normal pg.Client/TCP runs separately from RecordingSocket adapter/handler controls. LIFE reaches actual update/upsert/fanout logic. COPY pauses existing source at exact readback/capture statements; it proves canonical data references, not a cluster or VM heap bound. |
| H3 | **PASS schedules.** CUM covers original/control expiry, delayed callback, queued claim, disconnect and shutdown. LIFE adds expired advanced control; RET explicit retirement; TIMER both recovery/retry orders after actual timer and late uncertainty. |
| H4 | **PASS.** CT:24-69/PV:125-129 consume canonical immutable six/full15. AO/LIFE/RET supply complete manifest and COMMIT bytes; missing progress is a complete empty page. COPY uses a full canonical initial row, not local metadata as freshness. |
| H5 | **FAIL complete resource closure B5-1; PASS behavioral controls.** CUM30/30 and EXT12/12 have both refusal and success cases. COPY's two positive controls reach the real successful path before the envelope assertion fails; CENSUS is not inferred solely from validators. |
| H6 | **PASS scope honesty.** P/freeze-summary.json and this report distinguish component, global, activation/startup and corpus gates. Neither 594 author nor 280 independent runner entries certifies startLagrangeRuntime. |

### Owner interactions O1–O10

| Item | Verdict and evidence |
| --- | --- |
| O1 | **PASS.** DC:291-362/CO remains sole creation adjudicator; WC:72-84 supplies retained registration/maps. Current behavioral fixes stay in that ownership. B5-1 concerns its declared reservation, not an authority split. |
| O2 | **PASS behavioral boundary.** DC:198-217 → PV:211-266 → CO:197-277,478-494 → AD:251-277/BA:8-27 preserves exact typed handoff. LIFE/TIMER and canonical pgwire controls verify the previously failing budget/consumer transitions. |
| O3 | **FAIL B5-1 complete charge; PASS coupled identity/usability.** TIMER and LIFE record same ID, live entitlement, durable state and charge before/after successful recovery. COPY simultaneously records actual retained data, one record/operation/attachment and deficient record charge at the consumer boundary. |
| O4 | **PASS.** CO:711-715 renews only current operation budget; LIFE unavailable-then-readable authority now progresses. CUM:13 retains shutdown stale-object refusal; RET preserves newer advanced evidence over the older INSERT result. |
| O5 | **FAIL B5-1 envelope; PASS pressure control.** CR:383-414 synchronously reserves and CUM:21-23 verifies exact-cap reentry/first-retry equality/65 KiB before-write refusal. CENSUS shows one admitted transition exceeds the declared record envelope; no accepted debt was dropped in behavioral controls. |
| O6 | **PASS.** LC:48-61, IO:272-279, PV:323-334 and RE:307-319 remain the existing wake/visibility/release chain. LIFE/AO/TIMER proves it resolves unknown and advanced obligations while preserving the exact client result. |
| O7 | **PASS authority separation; FAIL accounting B5-1.** CO:253-260 uses private token/maps/deadlines, not metrics. CO:307-343 reports charge; COPY/CENSUS shows that number's declared canonical coverage is incomplete. |
| O8 | **PASS.** Exact snapshot, four-file delta, accepted design and all predecessors are pinned above; D/provenance-verification.json and final source recheck pass. Historical failures, current reruns, setup mistakes and fixture changes remain separate and preserved. |
| O9 | **PASS unchanged inventory.** PR3:O9/PR4:O9 covers `sql-query-engine.js:96-119,249-251`, `sql-query-engine-request-dispatch.js:144-168`, `sql-request.js:171`, `application-database.js:193-214`, `request-cell-invocation-owner.js:91-150`, runtime module:140-154,395 and actual AD:251-277. These bytes are unchanged; current normal pgwire/adapter proof reinforces that inventory without a raw fallback. |
| O10 | **PASS wiring; FAIL complete resource acceptance B5-1.** Existing classified test files and `test/shards/impact-contracts.json:54` already couple these owners; P's impact/shards gates pass with no metadata delta. The synthetic source test at :673-710 omits the strict-capture overlap and must not be labeled complete resource acceptance. |

### JavaScript/canonical inputs J1–J8

| Item | Verdict and evidence |
| --- | --- |
| J1 | **PASS arithmetic; FAIL census B5-1.** CR:25-52,89-99 uses primitive numeric lattice and checked sums; CO:359-368 bounds deadlines. CENSUS failure is an omitted simultaneously held string property, not integer overflow. |
| J2 | **PASS.** IO:68-70,280-287 captures own options; CR:77-109 refuses accessor/proxy limits. PV:296-311/RS:81-82 uses strict row/array capture; CUM:2,5,10 keeps zero getter execution. B5-1 requires paying for that capture, not weakening it. |
| J3 | **PASS identity capture.** CT:24-69 and CO:560-635 retain exact immutable six/15 through queue/result. CUM:2,5,10 and RET preserve no coercion/getter drift. COPY observes own descriptors only; no accessor is executed. |
| J4 | **PASS.** OWN:61-103/PV:125-129 enforce own plain/null-prototype canonical data; IO:68-70 and CR:77-109 reject inherited config authority. PR4:J4 strict-domain coverage and current canonical negatives remain applicable. |
| J5 | **PASS.** CR:89-99, CT:71-113 and `distributed-transaction-identity.js:32-43` reject boxed/nonprimitive limits/modes/IDs/numbers. Current canonical run preserves these controls; no new exotic host threat model. |
| J6 | **PASS boundary.** OWN and `architecture/contracts/authority-and-recovery.md:103-111` retain existing trusted host/strict data scope. B5-1 observes normal descriptor copying under the declared canonical model, not intrinsic compromise or allocator/heap immunity. |
| J7 | **PASS.** CT:114-231 encoding/delivery bytes and PV:125-145 collision comparisons remain unchanged. RET/AO/LIFE preserve exact original key, row and durable COMMIT text/digest; no migration or early coercion introduced. |
| J8 | **FAIL B5-1 complete materialization; PASS own-array/input gate.** CO:560-580/CT:146-182 measures before row/buffer/DWC; OWN:26-52,90-103 requires dense own arrays. CUM:22 refuses large admission before INSERT. OWN:81-85 still creates the uncharged variable capture overlap; later manifest/route growth remains outside this approval. |

## Reusable commands

These commands were executed against the exact frozen B bytes. Use a new directory for any corrected-source rerun; do not overwrite D or its predecessors. Scripts embedding B retain that path; other scripts receive B explicitly. Canonical command is above.

```sh
B=/mnt/data/peter/projects/.worktrees/rs-raft-startup-integration-20261011
D=/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011/begin-source-round5-independent
node "$D/semantic-probes.mjs" "$B" > "$D/semantic-probes-unchanged.log"
node "$D/advanced-orderings.mjs" "$B" > "$D/advanced-orderings.log"
node "$D/original-adversary-new.mjs" > "$D/original-adversary-new.log" 2>&1
node "$D/round3-interactions.mjs" "$B" > "$D/round3-interactions.log"
node "$D/round3-pgwire-sweep.mjs" > "$D/round3-pgwire-sweep.log" 2>&1
node "$D/round3-resource-probe.mjs" "$B" > "$D/round3-resource-probe.json"
node "$D/round3-bounded-controls.mjs" "$B" > "$D/round3-bounded-controls.json"
python3 "$D/extract-round3.py"
python3 "$D/evaluate-round4-cumulative.py" > "$D/round4-cumulative-assertions.log"
node "$D/round4-lifecycle-probes.mjs" "$B" > "$D/round4-lifecycle-probes.log"
node "$D/round4-advanced-retirement.mjs" "$B" > "$D/round4-advanced-retirement.log"
node "$D/round4-timer-orderings.mjs" "$B" > "$D/round4-timer-orderings.log"
node "$D/round4-complete-resource-probe.mjs" "$B" > "$D/round4-complete-resource-probe.json"
python3 "$D/extract-round4.py"
python3 "$D/evaluate-round4-extensions.py" > "$D/round4-extensions-assertions.log"
node "$D/round5-lifecycle-probes.mjs" "$B" > "$D/round5-lifecycle-probes.log"
python3 -c 'import json,pathlib; p=pathlib.Path("/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011/begin-source-round5-independent"); (p/"round5-lifecycle-probes.json").write_text(json.dumps(json.loads((p/"round5-lifecycle-probes.log").read_text().split("RESULTS_START\n")[-1]),indent=2)+"\n")'
python3 "$D/evaluate-round5-extensions.py" > "$D/round5-extension-assertions.log"
node "$D/round5-readback-copy-probe.mjs" "$B" > "$D/round5-readback-copy-probe.json"
node "$D/round5-readback-descriptor-probe.mjs" "$B" > "$D/round5-readback-descriptor-probe.log"
python3 "$D/evaluate-round5-copy-census.py" > "$D/round5-copy-census-assertions.log"
```

Expected evaluator results: cumulative exit0/30 pass; unchanged extension evaluator fails on the disclosed old fixture; corrected extensions exit0/12 pass; copy-census exit1/two positive controls and one resource failure. The first readback-copy file retains mixed engine log/JSON output despite its historical `.json` diagnostic name; the descriptor evaluator writes clean parsed JSON and arithmetic separately. No source is instrumented or changed.

## Remaining gates and limits

The global complexity result **1780 > 1755** and global source-file result **29 > 27** remain red and unwaived. The touched-source size bound remains at or below 799 lines. The default resource cap remains 1 MiB; the 250000-byte test-only cap is disclosed. Impact/shard and component greens remain their exact packet scopes.

The BEGIN implementation remains held for B5-1 and all separately required source/global/activation/startup/cluster/corpus gates. This review supplies no normal startLagrangeRuntime or rs-raft merge approval. Accepted design, prior bounded source approvals outside the changed interaction and the cumulative behavioral fixes above remain intact.

## Diagnostic artifact hashes

All diagnostic files, including unchanged predecessors, logs, fixture-error outputs and setup diagnostics, are covered by `D/diagnostics-manifest.sha256`. Selected review inputs/results:

| Artifact | SHA-256 |
| --- | --- |
| `D/provenance-verification.json` | `3d953294f9fb1ea3501ecdf796b60e25672ad9a217827b977a1c128afa2d9e3b` |
| `D/source-verification-final.json` | `e15990435fd3a24701f3139766502c7ccb6d61f534c4d89f5f8452675cc92fd9` |
| `D/canonical-focused.log` | `bf332f4c6d4458d3fcafa48f0df7f7358808ac8d60c5e719bdcd8c99261c04a9` |
| `D/round4-cumulative-assertions.log` | `428e2ed507f40d356d09507c05f6b35488c2aed22929d9a672a69ac9cc55c8e4` |
| `D/round5-extension-assertions.log` | `389c73494e52ca2fa9d5e4104cefb9852b64c52b69b4c11e5d960481a1a192b2` |
| `D/round5-lifecycle-probes.mjs` | `2892b382c7bb96ae4883508422b03fea31f39b9710a0b53ce8d53a785e4b8fad` |
| `D/round5-lifecycle-probes.json` | `c3e0cf6fe4affaba611f09e6f7abec923d57d983846ec9194d380c9ce5ab6e71` |
| `D/evaluate-round5-extensions.py` | `733390d894b83eb7fbbe7dafc87d4f861af4b681b572f5b925f6e33d71d2277e` |
| `D/round4-advanced-retirement.json` | `8a579b7e95a0921deac2473442e1cfc751707ef31c4b9d1aed1dda918abd31fe` |
| `D/round4-timer-orderings.json` | `e78d5f68fb024e2d63c6809ece56062552a07abda2c9470cabe54c7c822d9bbb` |
| `D/round4-complete-resource-probe.json` | `dcdd888dd146b1d0496c9a3b1427cfb562768c7ba9bafcc0496c0fe994407c56` |
| `D/round5-readback-descriptor-probe.mjs` | `ab1217dbc44d76d8f368ed5d5f62c59ec69171a4b33e895bd84d85a5c864f29a` |
| `D/round5-readback-descriptor-probe.json` | `fe22f23d884656b33c3ab183b3617fc78429a46c4dbcc67b641e93a4521a9711` |
| `D/evaluate-round5-copy-census.py` | `317ca2c9ccd84a41c8fe5fca0ed646a6e22fb5ff568ff27d162d30a46f203d01` |
| `D/round5-resource-census-result.json` | `c1b653974db9c130465649d4e65f46781376845f843ac800639ba119c1c905c9` |
| `D/round5-copy-census-assertions.log` | `44b748182eba5d9c48dac997c778db360f9ce46cf584e71322b76df8fd033914` |
| `D/diagnostics-manifest.sha256` | `adbe4c99d4cbc27060f1ab52ca6e5acb02ebac6476664378f80b74d6774829d9` |
