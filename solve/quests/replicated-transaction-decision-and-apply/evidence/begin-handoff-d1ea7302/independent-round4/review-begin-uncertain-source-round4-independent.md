# Independent BEGIN source review, round 4

## Verdict and exact scope

**REJECT source snapshot `d1ea7302fcf51b2c4be21b8d47db6295bef3d555`.** The original 30 regression assertions now pass. Six additional assertions fail in four grouped findings within the same accepted BEGIN handoff, recovery, deadline and resource contract. All 63 instantiated checklist items are disposed of below. This is a complete bounded cumulative source review, not a design restart or main/startup/corpus approval.

Reviewer: author-distinct `/root/review_activation_ruling`. Source, tests, designs, metadata, index, Quest records, branches and main were not edited; no stage, commit, push or cluster run occurred. Only this report and new diagnostics D were written. AGENTS -> rules -> router and the authority/recovery, Quest and verification owners, INDEX and all ten templates were loaded in this review session. Their evidence-path requirement and the trusted-host/strict-own-data boundary remain in force.

| Subject | Exact identity |
| --- | --- |
| Frozen source | Commit `d1ea7302fcf51b2c4be21b8d47db6295bef3d555`; tree `16798fc8c36dca54a1d06f8ba8f599c39e4ff4ca`; parent `c6d71665e98be03de916705f272a9d6340e4a842` |
| B | `/mnt/data/peter/projects/.worktrees/rs-raft-startup-integration-20261011`; caller HEAD remains c6d71665 |
| E | `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011` |
| D | `E/begin-source-round4-independent` |
| P | `B/test-output/continuation-20261011/begin-source-round4-working` |
| P/source-manifest.sha256 | `0ebfe26ac040a33e3d4c6766d579adfb77b86a9735561b120b1533209facf808` |
| P/freeze-summary.json | `6f98426f839074ae70e1d2d5c10d6728a6ed50385d13693b0d414b5cfde2e83b` |
| P/evidence-manifest.sha256 | `2fb5549b89eb5c541e85cc6ef4018af64b746cb1f54815276b931646882c82f9` |
| Accepted design DS | `B/solve/quests/replicated-transaction-decision-and-apply/design-query-begin-uncertain-insert-resolution-2026-10-11.md`, SHA-256 `3679b87f4aeb84fd8d9397aac9f73f686e5fcb990c1e61e86df35e9731f91fa5` |
| Design approval | Same Quest `evidence/review-begin-uncertain-design-round7-cdc56.md`, SHA-256 `c42b12bb01d1167e9b111c7469c458c82f80cc60e013fdcbfb9583313e1f74d6` |
| PR3, immediate rejected predecessor | `E/review-begin-uncertain-source-round3-independent.md`, SHA-256 `8f40f0b6559acd31db23790b8b7b753013366442e452085b05d2988d2130c8b8`; source `96f0bdc34bd4702e4e365ff329c77aa997648ff0` |
| PR2, cumulative prior coverage | `E/review-begin-uncertain-source-round2-independent.md`, SHA-256 `715e4532bae306ab70619737715173b117556d652e90865737f5c59fc2b1bcf5` |

PR3 and its earlier immutable predecessor references remain preserved.

All 40 source-manifest paths independently match the immutable d1ea7302 snapshot. All 45 author evidence entries independently match their hashes (`D/provenance-verification.json`: 85 entries). The source delta from 96f0bdc3 is exactly six files: creation, creation resources, recovery, persistence, and the two existing BEGIN test files. Each delta was read in full. The final source recheck is `D/source-verification-final.json`.

## Executed evidence and preserved fixes

Independent canonical run, cwd B:

```sh
npm run test:file -- test/query/transaction-begin-source-adversarial.test.js test/query/transaction-begin-uncertain-handoff.test.js test/query/transaction-review-adversarial.test.js
```

**3/3 files, 256 runner assertions pass** (`D/canonical-focused.log:5-11`). Author packet reports seven files/570 runner assertions; its hash-verified component proof stays scoped. Neither count claims independent leaf cases or normal cluster startup.

The unchanged independent round-3 scripts were rerun in D. The old evaluator assumes a second INSERT exists and raises IndexError after the correct no-replay fix; this is a fixture assumption, not a source failure. `D/evaluate-round4-cumulative.py` changes only that assertion to require one INSERT and unchanged durable COMMIT. **30/30 cumulative assertions pass** (`CUM:1-31`). No original diagnostic was overwritten.

The new bounded lifecycle/resource scripts produce **6/12 extension assertions passing**, with **six failures in four findings** (`EXT:1-13`). Combined, these independently executed matrices have 36/42 passing assertions. The failure evaluator exits 1 intentionally. I/O doubles return full canonical rows, enforce the supplied absolute budget, and observe real owner state. RecordingSocket and ordinary pg.Client/TCP tests remain distinct component scopes; no replicated-storage proof is claimed.

| Prior finding | Current preserved result |
| --- | --- |
| B3-1 original live retry of observed advanced row | No second INSERT; fresh authority read retains RECOVERY_PENDING, same durable COMMIT and slot (`D/round3-interactions.json:5`; CUM:24-25). Expired-budget and retirement variants still fail B4-1. |
| B3-2 caller expires before successful persistence completion | Both retry-first and sweep-first now retain the same live result and accept it under a new control turn (`D/round3-interactions.json`, caller-expiry cases; CUM:26-27). Late uncertain completion remains B4-3. |
| B3-3 sweep races live unexpired claim | Claim remains valid; sweep defers and does not report it resolved. Actual adapter/handler emits C, Z/T (`D/round3-pgwire-sweep.json`; CUM:28-29). |
| B3-4 previous retained-root lower bound | Charge rises to 141,044 and covers the previously enumerated roots/fields. The author's 141,039 extended figure adds booleans/prepaid claim fields to that same root list; additional actual retained roots remain B4-4. |
| B2/SR corrections | Current CUM:1-23 preserves malformed/accessor refusal, no original-expiry ACTIVE, post-tag destroy, disconnect/shutdown, resumed advanced reads, exact live advanced handoff, initializer strict capture, delayed-timer refusal, bounded cohort/backoff and exact-cap reentry. |

`D/advanced-orderings.json` remains green in both retry-first and sweep-first schedules. A canonical nonempty COMMIT manifest with **no participant-progress row** still restores its member as unknown/failed, keeps the same record/live consumer/one slot, emits exactly one COMMIT with the original decision digest, emits zero rollback, and advances the durable row to COMMITTED without changing COMMIT text/digest (`CUM:17-20`). These corrections are not withdrawn by the findings below.

## Complete grouped findings

### B4-1 — HIGH — Advanced-observation recovery is not preserved across control expiry and retirement

**B4-1a: retry/sweep reuse the expired first control budget.** `CO:701-708` calls `reconcileAdvancedCreation` before `installCreationTurnBudget` at :716. For observed-but-unaccepted advanced state, `CO:666-673` immediately calls the recovery handoff; `CO:453-456` passes `retained.transactionCreationTurnBudget` from the earlier attempt. No new control budget is installed on this branch, although both foreground retry and recovery capture a new pre-FIFO operation token (`CO:383-434`).

`LIFE:5-145` uses the real SQLQueryEngine/coordinator and a budget-respecting gateway. At clock 0 the first INSERT loses its reply, an exact canonical COMMITTING/FROZEN/nonempty COMMIT row is observed, and the handoff read is unavailable. The original turn budget is `{startedAtMs:0, deadlineMs:30000}`; the original transaction deadline is 1,000,000. At clock **30001**, a new client retry and a new recovery sweep both still pass **deadline 30000** to the reader. Both are refused as expired. The new operation should have its own bounded recovery deadline; instead the old budget remains installed indefinitely. There is one INSERT, four reads, one 1,167-byte RECOVERY_PENDING record, a live consumer, `advancedObserved:true`, `advancedHandoff:false`, and no installed participant/decision. Durable COMMIT remains unchanged, digest `573eb76840a4acb9a12f533d52227b71234e61c960aaea2670be6fedd1468339`. `EXT:1` fails; :2 confirms original identity/no new INSERT.

This witness proves the wrong absolute budget is handed to the existing owner; it does not claim a real cluster deadline measurement. `PV:323-329 -> RS:69-90` forwards that exact budget through the authority row/page sandwich. The accepted DS:782-789 requires each background reconciliation to capture its own pre-FIFO recovery control deadline, while preserving the original transaction deadline. Fix the existing branch ordering/propagation; do not extend an individual expired operation.

**B4-1b: explicit consumer retirement bypasses monotonic advanced observation.** `CO:280-288` legitimately converts the record to SERVER_RECOVERY_ONLY and clears its consumer. But `CO:666-668` checks advanced observation only in RECOVERY_PENDING. The subsequent sweep therefore falls through to original INSERT persistence (`CO:716-723`). A lawful settled APPLIED replay leads to `CO:754-758`, which marks ENTERED_ACTIVE/ordinary recovery and releases the creation record; release clears `advancedObserved` (`CO:108-123`).

`RET:5-223` starts from the same complete COMMITTING/FROZEN/nonempty COMMIT observation and an unavailable handoff, then calls the actual exact-consumer retirement owner. Before retirement: one 1,195-byte RECOVERY_PENDING record. After retirement: the same record/charge, SERVER_RECOVERY_ONLY, `advancedObserved:true`, no consumer. After one sweep: **two writes but still only two reads**, cached ACTIVE/OPEN/empty/NOT_SELECTED, `advancedObserved:null`, `advancedHandoff:false`, `recoveryDiscovered:true`, and **zero creation slots/bytes**. Both INSERT requests and delivery key `969600f60a1e5aa9c70c79ddc74652509b395c6cc3b0981fa16b3eabad2fddb6` are identical; the second answer is APPLIED. Durable COMMIT remains unchanged, digest `ff4a089865905b9d8e23e4edcdb503b0b1869ea35bd9b4f2f3c3b3ec1fec9fcb` (`EXT:3-4`).

This retirement witness does not show a disconnected client accepting success or a durable rollback. It shows confirmed advanced evidence discarded and creation custody released before exact advanced recovery acceptance. `recoveryDiscovered:true` does not substitute for that handoff. The monotonic observation must apply to server-only reentry as well as the live RECOVERY_PENDING role; DS:1297-1300,1328-1329 requires the same obligation to remain owned after disconnect.

### B4-2 — HIGH — The new live-consumer guard disables background resolution of an unknown initial INSERT

The new `CO:712-715` guard returns uncertainty whenever the sweep has no consumer, the retained record has a live consumer, and the original transaction remains live. It does not distinguish a claimed/confirmed result from an INSERT whose outcome has never been resolved. The earlier claimed-result branch already preserves a valid claim (`CO:650-657`); this broader guard also suppresses the existing recovery owner for genuine unknown outcomes.

`LIFE:148-278` starts with lost INSERT reply and unavailable exact read. Durable initial ACTIVE then becomes readable. Two legitimate sweeps, with the injected clock advanced to the defer deadline between them, perform **no additional read or write**: totals remain one INSERT/one read, rowInserted false, UNCERTAIN_ANSWERED, live consumer, one 1,104-byte record. Defer attempts rise to two without attempting authoritative reconciliation. A subsequent ordinary client BEGIN immediately performs the second INSERT/read, accepts the same ID and releases the record (`EXT:5` fails, :6 positive control).

This violates the accepted existing-owner background result path at DS:901-924 and :1324; a live idle client need not drive all recovery by retrying. Preserve the valid-claim winner without suppressing unknown-outcome reconciliation. The submitted tests `test/query/transaction-begin-uncertain-handoff.test.js:273-300,685-690` changed their recovery-before-retry expectation from resolved to deferred; that change removes the previously exercised background-progress obligation and cannot certify this contract.

### B4-3 — HIGH — Timer expiry preserves a live consumer, then late uncertainty erases it

The new actual timer path `CR:205-210` transfers the consumer before releasing only its attachment. This is correct. If the in-flight persistence subsequently returns uncertainty, however, `CO:481-488` reads the now-detached operation's null consumer and overwrites the still-live record consumer with null, choosing SERVER_RECOVERY_ONLY. The successful-completion fix at `CO:188-204` does not cover this error branch.

`TIMER:5-165` runs both retry orders with a real 5 ms attachment timer and a held INSERT released after 15 ms. After the timer fires, the exact live consumer is still retained, attachmentCount is zero, operationCount one, and the original record remains INSERTING. A subsequent uncertain completion drops the consumer and sets SERVER_RECOVERY_ONLY while keeping the one record and ending operation charge. No disconnect or explicit consumer retirement occurred.

- **Retry first:** persistence later succeeds under the same ID, but the consumer cannot accept; state remains SERVER_RECOVERY_ONLY with one 1,195-byte record.
- **Sweep first:** recovery releases the record, projects ENTERED_ACTIVE, and client retry returns TRANSACTION_ACTIVE without the original typed disposition/ID; zero creation charge remains.

`EXT:7,9` fail; :8,10 confirm the original server obligation survives the uncertain completion. No transaction decision or rollback was emitted in these DTC persistence-boundary witnesses. Caller-only timer expiry must retain the exact live incarnation through both success and uncertainty, as DS:782-786,1115-1123,1322-1324 requires. Explicit disconnect remains the distinct negative control and is preserved.

### B4-4 — MEDIUM — The revised record census still omits actual simultaneously retained roots

The source's declared canonical model charges each string property reference at full UTF-8 length and each counted scalar/reference at eight bytes (`CR:17-22,340-368`). The new 30 scalar/23 reference totals cover the previously enumerated six objects plus prepaid claim fields. They omit two ordinary live roots at the actual persistence callback boundary:

1. The **original timeout-budget object**, distinct from `transactionCreationTurnBudget`, retained by both raw and normalized workflow records. It adds three numeric fields and the 11-byte operation name.
2. The **persistence projection object** constructed by the real coordinator at `DC:198-217` and passed to `persistTransaction`. This distinct object is alive during the callback/read/write await. It carries another 20,000-byte session reference, transaction ID, delivery key, state strings, five numeric fields and two references. The normal production adapter `IO:254-255 -> PV` consumes this exact projection.

`D/round4-complete-resource-probe.mjs` enumerates own data fields of these roots along with the earlier six objects while the real DWC callback is pending. `RESOURCE:327-443` records identity-distinctness and all fields. This uses neither VM heap size nor interning assumptions.

| Canonical quantity | Observed |
| --- | ---: |
| String field references | 140,564 bytes |
| Encoded initial-row buffer | 20,190 bytes |
| Numeric fields | 33 |
| Boolean fields | 3 |
| Non-null object references | 22 |
| Lower bound at source's eight-byte scalar/reference weights | **161,218 bytes** |
| Charged record envelope | **141,044 bytes** |
| Shortfall | **20,174 bytes** |

The lower bound excludes prepaid future claim fields, nulls, object headers/allocator overhead and later gateway-built row copies. The earlier reported 141,039 figure is a lower bound over an incomplete root list, not the complete maximum transition footprint. This remains the same accepted record-envelope obligation (DS:1065-1085), including fixed transition scratch and every simultaneously retained string reference. Correct the lifetime census or drop the redundant representation before that boundary. Do not borrow unrelated operation-token headroom or reinterpret the declared canonical model as heap accounting. The existing before-side-effect reservation, 65 KiB refusal, and equal maximum first/retry operation charge remain green (`CUM:21-23`).

## Source and diagnostic aliases

All source aliases refer to exact d1ea7302 bytes under B. Unchanged prior scoped coverage is identified explicitly; it does not upgrade the current source verdict.

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
| EXT | `D/round4-extension-assertions.log` |
| LIFE | `D/round4-lifecycle-probes.json` |
| RET | `D/round4-advanced-retirement.json` |
| TIMER | `D/round4-timer-orderings.json` |
| RESOURCE | `D/round4-complete-resource-probe.json` |
| SP | `D/semantic-probes-unchanged.json` |
| AO | `D/advanced-orderings.json` |

## All 63 evidence dispositions

PASS is bounded to the cited requirement. FAIL names the finding preventing full closure. LIMIT records an unclaimed production measurement. Every item was reviewed in the same round before verdict.

### Admission A1–A7

| Item | Verdict and evidence |
| --- | --- |
| A1 | **PASS current exact entitlement/preaccept.** CO:253-277, AD:251-277 and BA:8-27 use the same private token, consumer and deadlines; CUM:11-12,24,28-29 proves late refusal, no live advanced reactivation and valid pgwire claim preservation. Retirement custody is B4-1b. |
| A2 | **FAIL B4-1/B4-3.** PV:125-145,276-311 still distinguishes canonical unknown/initial/advanced/foreign; later control expiry or timer uncertainty leaves the wrong recovery/client disposition (LIFE:5; TIMER:5,72). |
| A3 | **FAIL B4-1a.** Pre-FIFO original/control budgets are captured at CO:383-434, but advanced retry uses an already expired prior budget (CO:453-456,666-716; LIFE:14-101). Final success checks themselves remain green CUM:11-12. |
| A4 | **FAIL B4-3.** Canonical uncertainty/defer codes survive actual retry classification (CO:44-77; RE:252-300), but sweep-first late uncertainty yields generic TRANSACTION_ACTIVE without original disposition/ID (TIMER:72). |
| A5 | **FAIL B4-2/B4-3.** Accepted advanced handoff retains live slot (RE:307-319; DP:93-101; CUM:18,20), while initial unknown visibility cannot be resolved by sweep and late uncertainty drops live entitlement (LIFE:148; TIMER). |
| A6 | **PASS exact map/workflow/generation; FAIL disposition freshness B4-1b.** CO:149-153,498-519 and RE:168-189 retain post-await exact identity fences; SP shutdown control/CUM:13 passes. Retirement lets the same record discard advanced evidence (RET:47-157). |
| A7 | **FAIL B4-4.** Role/defer diagnostics remain observational and valid-claim sweep no longer reports resolved (CUM:28-29); record canonical charge omits roots actually retained at the callback (RESOURCE:327-443). |

### Retry Y1–Y7

| Item | Verdict and evidence |
| --- | --- |
| Y1 | **FAIL B4-1a/B4-2.** Existing lifecycle/sweep still fires (LC:48-61; RE:425-470), but advanced work receives stale control budget and live initial unknown is short-circuited (LIFE:5,148). No new retry owner is requested. |
| Y2 | **FAIL B4-1a progress; PASS bounded retention.** Unreadable row retains original ID/slot, typed defer and backoff (PV:276-311; LIFE:5-145), but forever reusing the first expired budget prevents recovery after availability returns. |
| Y3 | **FAIL B4-3.** Exits retain server debt and are typed (CO:44-91; TIMER:31,116), but late uncertainty after caller expiry loses the still-live result owner and later returns ordinary ACTIVE in sweep-first order. |
| Y4 | **FAIL B4-2.** Valid claimed client/sweep arbitration is fixed (CO:650-657; CUM:28-29). The broader guard CO:712-715 mutually suppresses background resolution until client retry/original expiry (LIFE:148-278). |
| Y5 | **FAIL B4-4 envelope; PASS finite cohorts/turns.** CR:173-181 bounds operations; RE:193-205,258-300 bounds/folds creation cohort; CUM:14-15,21-23 passes exact-cap/rotation. RESOURCE demonstrates undercharged retained roots. |
| Y6 | **FAIL B4-1b semantic knowledge; PASS exact command identity.** CT:24-69/PV:211-267 keep six/15 fields and key; RET:158 onward shows identical replay/key but clears advanced knowledge. CUM:17-20 preserves exact COMMIT/no duplicate decision fanout. |
| Y7 | **PASS counter semantics; FAIL useful work B4-2.** RE:280-300 advances defer once per turn and no false resolved ACK for claimed result (CUM:14,23,29). LIFE:148 shows truthful defer counters rising while the new guard prevents needed reconciliation. |

### Transport T1–T5

| Item | Verdict and evidence |
| --- | --- |
| T1 | **FAIL B4-1b historical APPLIED inference; PASS ACK separation.** PV:246-249 only accepts canonical APPLIED; settled original-command replay cannot erase newer known advanced state (RET). PR3:B3-1 cites actual settled-replay kernel/classifier provenance, unchanged at d1ea. BA:15-27/CUM:4 still destroy after post-tag acceptance failure. |
| T2 | **FAIL B4-1b obligation meaning; PASS no retired client revival.** AD:318-333 and CO:280-288 retire exact consumer; RET has accepted false. The remaining server record then loses advanced evidence/charge on replay. Normal late-close/shutdown controls CUM:6-7,13 stay green. |
| T3 | **PASS typed retry classification.** CO:44-77 includes deferRetry consumed by RE:63-65,252-300; CUM:14,23 observes real backoff. No new generic error-string authority is introduced. |
| T4 | **FAIL B4-1a.** Missing read owner remains UNAVAILABLE (PV:276-311); PV:323-329/RS:69-90 forward the received budget. LIFE:5 proves current retry/sweep supply a spent deadline despite available canonical evidence. |
| T5 | **PASS bounded stub/consumer fidelity.** Current real adapter/handler queued-sweep witness emits C,Z/T, post-tag and close controls pass (CUM:4,7,29). Normal pg.Client/TCP runtime tests pass canonical run. LIFE's gateway enforces the supplied budget; no real replication or wall-clock startup claim. |

### Sweep/time S1–S5

| Item | Verdict and evidence |
| --- | --- |
| S1 | **FAIL B4-1a propagation; PASS time-domain and timers.** CO:156-185 uses owner.now, CR:204-212 unrefs attachment timer, RE:454-470 retains existing sweep timer. Current captured recovery budget is bypassed on advanced reentry (LIFE:14-101). |
| S2 | **FAIL B4-1b role; PASS durable COMMIT fanout.** RA:26-49,80-127 and RE:307-319 restore authoritative manifest/decision; AO/CUM:17-20 preserves missing-progress COMMIT. RET drops known advanced local disposition before that owner accepts it. |
| S3 | **PASS shutdown correction.** LC:85-98, CO:291-304 and RE:168-189 fence process retirement/census; SP and CUM:6,13 show no object reinstalled or rewritten. Existing durable restart recovery remains distinct from live caller timeout. |
| S4 | **FAIL B4-1a/B4-3.** Original-expiry refusal/reentry and long-transaction deadline stay intact (CUM:3,16), but independent control expiry strands advanced recovery or removes a still-live consumer on late uncertainty (LIFE:5; TIMER). |
| S5 | **FAIL B4-2 progress; PASS fair bounded selection.** RE:68-85,193-205 rotates cohorts after backoff (CUM:23). The selected live-unknown record cannot progress under CO:712-715 even when its evidence is available (LIFE:148). |

### Recovery R1–R5

| Item | Verdict and evidence |
| --- | --- |
| R1 | **PASS exact registry custody.** RE:307-319 installs advanced data into the same record; WC live guard and RE:168-189 generation guard remain. AO/CUM:18,20 and SP shutdown control pass. B4-1 changes meaning of that record, not successor identity. |
| R2 | **FAIL B4-3 live-vs-server disposition.** DP:93-101 keeps advanced live terminal result; restart discovery remains RE:565 onward. TIMER:31,116 treats mere caller timeout followed by uncertainty as consumer retirement. |
| R3 | **FAIL B4-1 complete handoff; PASS candidate completeness.** RS:69-90 refuses missing/malformed pages; RA:26-49 preserves every manifest member as unknown/failed without progress. AO/CUM:17-20 emits exact COMMIT. Expired-budget and retired advanced handoff do not consume the complete candidate (LIFE:5; RET). |
| R4 | **FAIL B4-1/B4-2 complete redrive.** No remint or changed key (EXT:2,4); AO/CUM:17-20 preserves idempotent decision fanout. Existing owner can still be suppressed by stale budget or live-consumer guard (LIFE). |
| R5 | **PASS missing/foreign/malformed classification.** PV:276-311 retains distinct MISSING/INVALID/UNAVAILABLE; PV:132-145 requires canonical foreign immutable row plus producer PK collision before remint. CUM:1-2 and current canonical refusals preserve PR3:R5 coverage. |

### Concurrency C1–C5

| Item | Verdict and evidence |
| --- | --- |
| C1 | **FAIL B4-4 charge; PASS synchronous reservation.** DC:291-307 reserves before FIFO, CO:560-580 before row/buffer/DWC allocation; CUM:22 proves before-write pressure. RESOURCE identifies live projection/budget roots outside the charged model. |
| C2 | **FAIL B4-1a/B4-3 semantic post-await fence.** Exact identity and final deadline checks remain (CO:149-185,197-204,720-721); advanced branch uses prior budget and late uncertainty overwrites retained live consumer (LIFE:5; TIMER:31,116). |
| C3 | **FAIL B4-3 late-result winner; PASS claimed arbitration.** Existing session FIFO and synchronous BA:15-27 acceptance remain sole owner. CUM:28-29 fixes claimed success versus sweep, while CO:481-488 overwrites the timer's live-consumer transfer (TIMER). |
| C4 | **FAIL B4-3 timer reentrancy.** CR:205-210 correctly preserves exact consumer before detach, but subsequent uncertainty reverses that owner rewrite (TIMER:17-43,102-128). Injected/delayed-timer late-success refusal remains CUM:11-12. |
| C5 | **FAIL B4-4 representation charge.** Exact invocation/session/reservation tokens and equal maximum first/retry operation charge remain (CR:215-245,292-329,385-414; CUM:21). Real DC persistence projection is a separate retained object with an additional session reference (RESOURCE:351). |

### Formation/degraded path F1–F5

| Item | Verdict and evidence |
| --- | --- |
| F1 | **PASS route inventory; FAIL B4-1/B4-2 progress.** Initial INSERT/read PV:211-311, recovery sandwich RS:69-90, decision/progress persistence PV:163-207,344 onward and cache census `sql-query-engine-transaction-recovery-methods.js:158-173` stay on existing gateway owners. LIFE demonstrates the composed degraded-path failures. |
| F2 | **FAIL B4-2 despite existing discovery.** IO:272-279 wires census/advanced handoff; RE:168-189 preserves retained IDs when census fails. Live-unknown creation returns before any authoritative redrive (CO:712-715; LIFE:148); no new discovery owner is needed. |
| F3 | **FAIL B4-1a/B4-3 current handoff; PASS bounded admission.** CUM:21-23 preserves pressure/operation bounds and original identity. Available evidence after control expiry or late uncertainty still cannot restore the correct live/result disposition (LIFE:5; TIMER). |
| F4 | **FAIL B4-1a local budget handoff; LIMIT full formation margin.** The row/page reader receives stale deadline 30000 at now 30001 (LIFE:56 onward), despite new captured turn. No startLagrangeRuntime end-to-end timing/formation proof is claimed. |
| F5 | **PASS architectural boundary.** Same gateway, DWC, FIFO, lifecycle and recovery owner remain (IO:254-287; DC:291-307; LC:48-61). No forced-open fixture, new ledger, fallback transport or second adjudicator is introduced. |

### Harness H1–H6

| Item | Verdict and evidence |
| --- | --- |
| H1 | **PASS old/new provenance.** PR3/PR2 preserve exact predecessor semantic reds. Current unchanged scripts execute; old evaluator's missing second INSERT is explicitly a corrected fixture premise, repaired in one assertion without source change. CUM:1-31 then passes all 30. |
| H2 | **PASS fidelity scopes.** Real adapter/handler uses RecordingSocket in current queued-claim witness; normal pg.Client/TCP listener tests pass separately. AO executes real decision/recovery with canonical I/O doubles; LIFE/TIMER invoke actual owner branches. No component result is labeled cluster proof. |
| H3 | **FAIL current expiry/retirement behavior, complete schedules.** CUM covers original/control expiry, disconnect, shutdown and queued claim; LIFE:5 adds expired prior control on advanced reentry, RET retirement after advanced observation, TIMER both orders after actual timer then late uncertainty. |
| H4 | **PASS canonical complete witness input.** CT:24-69/PV:125-129 require immutable six/full15. LIFE/RET durable rows include canonical nonempty manifest and COMMIT digest; AO missing progress is complete empty page, not absent/malformed page. No local metadata substitutes freshness. |
| H5 | **FAIL closure coverage.** CUM has 30 greens, EXT six failures paired with six positive controls. The recovery-before-retry tests were weakened from resolved to deferred (`transaction-begin-uncertain-handoff.test.js:273-300,685-690`), leaving B4-2 unproved. |
| H6 | **PASS scope honesty.** P/freeze-summary.json and this report retain component-only, global, activation/startup and corpus limits. No ordinary startup assertion follows from 570 author or 256 independent runner entries. |

### Owner interactions O1–O10

| Item | Verdict and evidence |
| --- | --- |
| O1 | **PASS sole adjudicator structure.** DC:291-362/CO own creation; WC:72-84 provides retained registration/maps. The four findings are defects within that owner composition, not a proposed authority split. |
| O2 | **FAIL B4-1/B4-3.** DWC -> persistence projection -> typed result/consumer -> adapter/protocol handoff remains named (DC:198-217; PV:211-266; CO:197-277; AD:251-277; BA:8-27). Budget and live disposition are lost at actual intermediate branches (LIFE; TIMER). |
| O3 | **FAIL B4-1/B4-3/B4-4.** RET records durable COMMIT, server role, exact key and counts before/after; TIMER records live consumer and charges across actual timer/error ordering; RESOURCE counts actual callback roots. Identity retention alone is not usability or charge. |
| O4 | **FAIL B4-1a/B4-2.** Stale/unavailable then available authority cannot progress after prior budget expiry or through the live-unknown guard (LIFE:5,148). Current shutdown stale-object controls remain fixed (CUM:13). |
| O5 | **FAIL B4-4 envelope; PASS exact-cap transition.** CR:367-381 preallocation and CUM:21-23 preserve before-write pressure/equal operation charge. The role-neutral maximum footprint remains undercounted by observed roots (RESOURCE:327-443). |
| O6 | **FAIL B4-1/B4-2/B4-3.** LC:48-61, IO:272-279, PV:323-334 and RE:307-319 retain existing wake/handoff owners; CUM:17-20 proves working advanced transfer. LIFE/RET/TIMER show the remaining suppressed or lost obligations. |
| O7 | **PASS metrics are not authority; FAIL accounting B4-4.** CO:307-343 diagnostics do not grant acceptance; CO:253-260 uses private exact token/maps/deadline. The declared byte amount is inaccurate for RESOURCE, with no metrics-based substitute proposed. |
| O8 | **PASS exact provenance.** Forty snapshot paths and 45 artifacts match D/provenance-verification.json; final recheck and all design/predecessor hashes are preserved. Six-file delta read; current/old evidence and fixture adaptation remain distinct. |
| O9 | **PASS unchanged consumer inventory.** PR3:O9 covers engine `sql-query-engine.js:96-119,249-251`, request dispatch `sql-query-engine-request-dispatch.js:144-168`, `sql-request.js:171`, `application-database.js:193-214`, `request-cell-invocation-owner.js:91-150` and runtime module:140-154,395 to actual AD:251-277. These source bytes are unchanged; current canonical/pgwire run reinforces coverage without adding raw fallback. |
| O10 | **PASS metadata wiring; FAIL maintained proof B4-2/B4-4.** Existing classified files/impact contract `test/shards/impact-contracts.json:54` include coupled BEGIN owners; no metadata delta needed and hashed impact/shards gates pass. Current tests omit two resource roots and weaken background progress. New schedules must enter canonical tests before closure. |

### JavaScript/canonical input J1–J8

| Item | Verdict and evidence |
| --- | --- |
| J1 | **PASS safe arithmetic; FAIL model census B4-4.** CR:25-52,89-99 checks primitive lattice/safe sums; CO:359-368 checks deadlines. Resource failure is omitted fields/copies, not overflow: RESOURCE has 33 numbers/3 booleans/22 refs plus strings/buffer. |
| J2 | **PASS own config/row capture.** IO:68-70/280-287 captures own options before use; CR:77-109 rejects accessors/proxies; PV:296-311/RS:81-82 copy strict rows/arrays. CUM:2,5,10 preserves zero getter execution. |
| J3 | **PASS canonical capture across queue.** CT:24-69 and CO:560-635 retain immutable six/15 bytes; CUM:2,5,10 plus RET identical writes prove no getter/coercion identity drift. The additional persistence projection is captured actual data, with charge failure B4-4. |
| J4 | **PASS no inherited authority.** OWN:69-113 and PV:125-129 demand own canonical fields; IO:68-70 and CR:77-109 no longer promote inherited config to accepted own values. PR3:J4 unchanged strict-domain coverage/current tests applies. |
| J5 | **PASS bounded primitive/exotic refusal.** CR:89-99, CT:71-113, `distributed-transaction-identity.js:32-43` reject boxed/nonprimitive limits/mode/ID/numbers. Canonical test run preserves the prior negative controls; no fabricated host compromise assumed. |
| J6 | **PASS trusted-host scope.** Existing OWN and `architecture/contracts/authority-and-recovery.md:103-111` remain scope. Resource evidence counts own data under the source's declared model and does not claim actual heap size or intrinsic mutation immunity. |
| J7 | **PASS canonical identity bytes.** CT:114-231 encoding/delivery digest unchanged; PV:125-145 compares canonical own values before collision/adoption. RET preserves exact initial row/key and durable COMMIT bytes; B4-1b is disposition loss, not a migration. |
| J8 | **FAIL B4-4 maximum materialization; PASS input/preallocation.** CO:560-580/CT:146-182 measure before row/buffer/DWC; OWN:25-67,116-132 validates dense own arrays; CUM:22 refuses oversized creation before INSERT. RESOURCE adds ordinary simultaneously retained roots missing from the maximum envelope. Future manifest/route growth is not certified. |

## Reusable commands and artifact hashes

Use a new diagnostic directory for corrected-source reruns so D remains immutable. The original round-3 scripts were copied unchanged; root-argument scripts receive B. Original-adversary-new and pgwire-sweep scripts embed the same B import prefix. The cumulative evaluator changes only the now-invalid second-INSERT assumption.

```sh
B=/mnt/data/peter/projects/.worktrees/rs-raft-startup-integration-20261011
D=/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011/begin-source-round4-independent
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
python3 "$D/evaluate-round4-extensions.py" > "$D/round4-extension-assertions.log"
```

Expected current evaluator exits: cumulative 0, extensions 1. Extraction scripts only parse JSON from preserved logs. New timer schedules wait 15 ms on an actual 5 ms unref attachment timer; all other new schedules use owner-controlled time or deterministic I/O. The complete original rows, mutation answers, consumers, roles, decisions and charges are retained in JSON, rather than replaced by assertions alone.

| Artifact | SHA-256 |
| --- | --- |
| `D/round4-lifecycle-probes.mjs` | `56e1e04b876c06a02f20c94f6a684503f39814ddcb9dfde596c5040f9f866f1a` |
| `D/round4-lifecycle-probes.json` | `f59ff0665c4af003ba1cdf9cdb2beb54d1e9e38f4b05a8ae572ead0284b6c766` |
| `D/round4-advanced-retirement.mjs` | `ea2679dce39cf814e250766a0d1fdc358c2c80e0ae814c2585ccb357623339d3` |
| `D/round4-advanced-retirement.json` | `c8322957be2e11d489138f3a458ceb546853dbf42df959d531d77def24186351` |
| `D/round4-timer-orderings.mjs` | `8eb2a36f7653a88ab24e972d74e8e6291e1242a357aeef47ed6875d1151e0541` |
| `D/round4-timer-orderings.json` | `06fe35707e60ae5ba442eda8686a8fbd6f0d7afb4b20333430531932faab0620` |
| `D/round4-complete-resource-probe.mjs` | `ced2c666acfd54254f84acd7202ce00bfc1874e45f86b329824ad5b0499ad786` |
| `D/round4-complete-resource-probe.json` | `84f3880da2186ad184d9cbf35d20caffcf41142b3bf7afefad8febdd48ae48b8` |
| `D/extract-round4.py` | `71561955015284021197e18d334fce65b8c7d9fa795f95bcd468c22cb50bf3eb` |
| `D/evaluate-round4-cumulative.py` | `05fdd727d5815746c58ab47c0d17aa6d7c98bbc2082831eb5633ec034a1baec3` |
| `D/round4-cumulative-assertions.log` | `428e2ed507f40d356d09507c05f6b35488c2aed22929d9a672a69ac9cc55c8e4` |
| `D/evaluate-round4-extensions.py` | `b1ddadc9ecd8afbf74ed250822c47d73e8142f3f817338ad43a8e9242af69220` |
| `D/round4-extension-assertions.log` | `99f44e6b0039b7ac463d3dd567bcde1702721756050cee1dc11aff6eee1c76a0` |
| `D/canonical-focused.log` | `d6cadd8f59089370b9d0ff8de5925cf0ca5fec62db916536c3f8957ef119ebef` |

All remaining artifacts are listed in `D/diagnostics.sha256`. Before/after source verification, all 85 manifest checks and exact commands above preserve provenance.

Global cyclomatic **1780 > 1755** and global source-file-size **29 > 27** remain red and unwaived; test file count is 21/21, touched source maximum 799 lines. The separate activation source, normal startup, cluster/full-operation, corpus and main gates remain open. No further broad test or design restart is required to establish this rejection. Preserve the complete four-group report and artifacts before coherent author correction; future source acceptance must cover the corrected exact bytes and maintained cumulative witnesses.
