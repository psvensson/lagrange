# Independent BEGIN source review, round 3

## Verdict and scope

**REJECT frozen source `96f0bdc34bd4702e4e365ff329c77aa997648ff0`.** Four grouped findings remain, comprising six failed independent semantic assertions. The accepted BEGIN design remains accepted. This is the complete bounded cumulative review of B2-1 through B2-8 and the affected caller, recovery, resource and protocol composition. All 63 instantiated checklist items have evidence dispositions below. It grants no main, merge, corpus, activation-source or normal-startup approval.

Reviewer: author-distinct `/root/review_activation_ruling`. No source, tests, design, metadata, index, Quest logs or branches were edited; no stage, commit, push or cluster run occurred. Only the report and diagnostics under D were written. AGENTS, rules, router, authority/recovery, Quest and verification owners, INDEX and all ten matching verification templates were loaded in this review session. Their evidence-path requirement is retained. The existing trusted-host/strict-own-data boundary applies; there is no new intrinsic-immunity requirement.

| Subject | Identity |
| --- | --- |
| Frozen source | Commit `96f0bdc34bd4702e4e365ff329c77aa997648ff0`; tree `af26a30bbc71035611d5199c800d1eb9c00c9099` |
| Base and actual worktree HEAD | `c6d71665e98be03de916705f272a9d6340e4a842` |
| B | `/mnt/data/peter/projects/.worktrees/rs-raft-startup-integration-20261011` |
| E | `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011` |
| D, new independent diagnostics | `E/begin-source-round3-independent` |
| P, author frozen packet | `B/test-output/continuation-20261011/begin-source-round3-working` |
| P/source-manifest-freeze.sha256 | SHA-256 `825f7bd0aae895f246038ed9da4999728359df8b7fbc1a66dc5683b9c52a3113` |
| P/freeze-summary.json | SHA-256 `cc1d9d377dd009347b8adfb83a9faaa269bd3b534aecc9908c69c29cdf56d732` |
| P/evidence-manifest-freeze.sha256 | SHA-256 `e6aa589a565b9eacd8f93805d6a28fa9122186c59d164376a29d05016c8c29d4` |
| Accepted design | `B/solve/quests/replicated-transaction-decision-and-apply/design-query-begin-uncertain-insert-resolution-2026-10-11.md` (DS), SHA-256 `3679b87f4aeb84fd8d9397aac9f73f686e5fcb990c1e61e86df35e9731f91fa5` |
| Accepted design review | Same Quest `evidence/review-begin-uncertain-design-round7-cdc56.md`, SHA-256 `c42b12bb01d1167e9b111c7469c458c82f80cc60e013fdcbfb9583313e1f74d6` |
| Rejected round 2 | Source `a49fd8d1e686d9cd9dc9196478102a0e417df822`; `E/review-begin-uncertain-source-round2-independent.md` (PR), SHA-256 `715e4532bae306ab70619737715173b117556d652e90865737f5c59fc2b1bcf5` |
| Earlier rejected source/report | `2925863c3e72a17854413fa2c850ce4ff76f6aff`; `E/review-begin-uncertain-source-round1-cdc56.md`, SHA-256 `f5db1b28964bf4982209df80797a24d7c436174853c2896ff8ff83a3977a33aa` |

All 40 frozen packet paths match their immutable source snapshot (`D/source-verification.json`). All 40 source-manifest and 25 evidence-manifest entries match independently (`D/packet-verification.json`). The final source recheck is `D/source-verification-final.json`. Unapproved source navigation is pinned to the above snapshot; no mutable startup integration byte is silently accepted.

## Execution and cumulative results

- Independent canonical command, cwd B: `npm run test:file -- test/query/transaction-begin-source-adversarial.test.js test/query/transaction-begin-uncertain-handoff.test.js test/query/transaction-review-adversarial.test.js`. **3/3 files, 241 runner assertions pass** (`D/canonical-focused.log:5-11`). This is not a count of independent leaf cases.
- Author packet reports seven files/555 runner assertions and its copied semantic evaluator 22/22 green (`P/freeze-summary.json`, hash-verified cumulative/evaluator logs). Those claims remain component-scoped.
- The unchanged independent round-2 scripts were copied and rerun in D: `semantic-probes.mjs`, `advanced-orderings.mjs`, `original-adversary-new.mjs`. Their old files remain intact. The original predecessor output/script is preserved from the already executed exact-2925863c comparison in PR; it was not relabeled a newly executed baseline.
- `D/round3-assertions.log:1-31` records **24/30 current independent assertions pass, six failures in four findings**; `evaluate-round3.py` exits 1 intentionally. The passing controls include malformed/accessor refusal, original and control expiry refusal, post-tag destruction, disconnect, shutdown/census exact identity, backoff/rotation/cap, equal first/retry budget and nonempty durable COMMIT recovery with a missing progress row.
- Two unchanged fixture assumptions require explicit treatment: the former 65,000-byte envelope probe now correctly refuses before its unconditional record dereference, so that diagnostic exception is **not** a source failure (`SP:165-168`). The old starvation script's immediate second sweep now correctly defers. `D/round3-bounded-controls.mjs` tests refusal without dereference, measures the current exact byte cap, and advances the injected clock to the existing defer deadline before checking rotation. These adaptations preserve the original semantic requirements.
- Additional witnesses use real SQLQueryEngine persistence/readback, DWC normalization, coordinator/session FIFO, recovery/decision fanout and actual PostgresWireAdapter/PgWireProtocolHandler. Gateway I/O and RecordingSocket are deterministic component doubles. A settled original INSERT APPLIED answer is a lawful gateway replay outcome, not a transport ACK. These tests do not execute replicated storage, normal cluster startup or a full startup timing margin.

## Grouped findings

### B3-1 — HIGH — Original INSERT replay erases already observed advanced durable authority

`PV:125-136` correctly recognizes a complete same-creation advanced row. `CO:452-482` then attempts the existing recovery handoff, but when its fresh row/page read is unavailable it retains only `RECOVERY_PENDING`; the confirmed advanced fact is not retained as a monotonic restriction. `CO:677-679` handles that state only when `transactionCreationAdvancedHandoff` is already true. Otherwise `CO:706-722` redelivers the original INSERT. Its settled APPLIED answer takes the early return at `PV:246-249`, and `CO:739-744,209-250` creates a fresh initial-row success claim. The final consumer accepts it at `CO:264-288` without any intervening authority read.

Reproduction: `D/round3-interactions.mjs`, `RI:5-163`, assertion `W:24`.

1. Initial INSERT loses its answer. Exact authoritative read returns the complete 15-field row for `26c8d8beb6ede6a4b857d8e367715dbe`, status **COMMITTING**, manifest **FROZEN**, participant `p-known`, TWO_PHASE_COMMIT and recorded **COMMIT**. Decision digest is `f61ef2b0378d5e10dd9de154e2bf8f7a3ebf8e642073a73610587f6ff44f1988`.
2. The fresh recovery handoff read is unavailable. Before retry, the exact record owns one slot/979 bytes in RECOVERY_PENDING; two reads and one write have occurred.
3. Plain same-session retry submits exactly the original 15-field INSERT and delivery key `7c5d6ec082698c3cf01500773a3fbddc1cd4fa9ccd75fbd2919a3c5e3616f8b4`. The recorded answer is `{success:true, completionState:'applied'}`. There is **no third read**.
4. Retry returns success; `acceptDistributedBeginForConsumer` returns true. The cached/session transaction is **ENTERED_ACTIVE/ACTIVE/OPEN/NOT_SELECTED**, with zero participants and no decision. Its one slot and 979 bytes are released to zero. The durable row remains COMMITTING/FROZEN/nonempty/COMMIT with exactly the same digest and bytes.

This proves stale initial-state authority was granted; it does **not** claim the witness overwrote durable COMMIT or emitted rollback. The exact write requests/answers, durable row before/after, active projection, and resource counts are in RI. Positive assertion `W:25` confirms identical INSERT/key and unchanged durable COMMIT.

Replay fidelity: `src/control-plane/control-plane-write-identity.js:390-391` preserves the supplied key; `src/cdc/cdc-routed-mutation-readiness.js:131-138,530-533` derives the same participant write identity. `src/partition/partition-write-kernel.js:202-212` defines settled replay; `src/control-plane/control-plane-mutation-outcome-classifier.js:26-27,198-212` deliberately classifies settled replay with unknown count as applied. Such an answer proves the old INSERT happened, not that the row remains initial ACTIVE after a newer authoritative observation. Preserve the confirmed advanced disposition across retry/late INSERT replay and keep the existing recovery owner responsible for revalidation; do not mint a new attempt or downgrade known progress.

### B3-2 — HIGH — Caller expiry retires a still-live session's result entitlement

The corrected final deadline check at `CO:209-213` refuses success after the short control turn expires. But that exit never transfers the live consumer into the retained record. `CR:249-259,274-285,313-325` therefore clears the consumer and sets SERVER_RECOVERY_ONLY when the operation/attachment settles, although no disconnect or consumer retirement occurred. Retry can bind the same consumer again (`CR:288-298`) but `CO:224-227` refuses that server-only state and settlement clears it again. If the sweep wins first, `CO:750-758` transfers the record to ordinary recovery and releases its creation token, leaving ordinary TRANSACTION_ACTIVE for the still-unaccepted session.

`RI:166-305` runs both orderings with owner clock 0, original transaction deadline 1000, caller turn deadline 10, and INSERT completing at clock 20. The original durable initial-row persistence succeeds; there is no decision or rollback. First result correctly refuses late acceptance, but the live consumer is gone and one 906-byte record is SERVER_RECOVERY_ONLY. **Retry first** returns TRANSACTION_CREATION_UNCERTAIN for the original ID and still cannot accept. **Sweep first** releases the slot/bytes, projects ENTERED_ACTIVE, and retry returns TRANSACTION_ACTIVE without the original typed disposition/ID. Both perform two writes, preserve the original attempt, and fail client usability (`W:26-27`).

This is the accepted distinction between caller wait and session entitlement, not a request to extend the spent caller deadline. DS:782-786 limits expiry to the waiter; DS:1115-1123 and :1324 retain a live exact consumer's result on the same record. A new bounded retry from that live incarnation must obtain its current initial-row result or exact advanced/expired disposition. Explicit consumer retirement must continue to remove entitlement; its existing negative controls pass.

### B3-3 — HIGH — The recovery sweep cancels an unexpired client success claim

`CO:659-674` preserves SUCCESS_CLAIMED only when the caller-supplied consumer equals the record's consumer. The existing sweep calls the same reconciliation with `consumer=null` (`RE:203-216`). Thus merely selecting a live claimed record nulls its acceptance token, even with unchanged original/control deadlines and unchanged consumer incarnation. It re-persists and calls the background success path (`CO:750-752`) which returns UNCERTAIN_ANSWERED. This violates the accepted single-winner claim handoff.

Owner witness `RI:308-341`: `canAccept` is true before the sweep and false after it with the injected clock still zero. The sweep reports one resolved entry despite invalidating the live success result (`W:28`).

Production consumer witness `D/round3-pgwire-sweep.mjs`, `PGW:2-57`: start BEGIN through real PostgresWireAdapter/PgWireProtocolHandler, hold the gateway INSERT, queue the real coordinator sweep on its existing session FIFO, then release INSERT. Without monkeypatching acceptance or protocol methods, the sweep wins the async continuation race before protocol acceptance. The socket receives **E, Z/I**, no CommandComplete; the exact transaction remains UNCERTAIN_ANSWERED with one 909-byte record, and the gateway saw two INSERT deliveries. `W:29` fails. RecordingSocket observes protocol behavior; it does not claim TCP delivery. The prior normal pg.Client listener tests and post-CommandComplete destroy control remain green.

The sweep must respect the currently owned, unexpired claim; expiry/retirement may reclassify it through the existing owner. No second result coordinator or new pin mechanism is needed.

### B3-4 — MEDIUM — The record envelope still undercounts its declared canonical representation

The variable UTF-8 reference fix is preserved. The 65,000-byte pool now refuses the 20,000-byte session before INSERT, and the author's string/buffer lower bound 140,598 is below the 140,828 charge. However `CR:17-22` budgets only 14 numeric fields and 12 references for the record envelope. Its own comment at `CR:336-360` promises the maximum simultaneously retained caller candidate, DWC normalized record, frozen row/buffer and consumer/acceptance representation. The actual live persistence turn retains more fields.

`D/round3-resource-probe.mjs` inspects own data fields while the actual DWC persist callback is pending; `RB:5-311` captures distinct raw and normalized objects. Counting only the raw candidate, normalized record, initial row, consumer, turn budget and reservation produces:

| Quantity | Observed |
| --- | ---: |
| String field references at full canonical UTF-8 bytes | 120,425 |
| Encoded initial row buffer | 20,190 |
| Numeric fields | 25 |
| Non-null object references | 20 |
| Lower bound using the source's own 8-byte numeric/reference weights | **140,975** |
| Charged record envelope | **140,828** |
| Deficit | **147** |

This lower bound excludes timeoutBudget contents, nulls, booleans, object headers, allocator/VM overhead and future manifest growth. It is an audit of the implementation's declared canonical byte model, not a measured heap claim or a requirement for hostile-host immunity. The full record envelope itself is short even while its separate operation token remains charged (`W:30`). Account for every concurrently retained field/copy or drop the unnecessary representation before that boundary, then preserve preallocation and equal maximum first/retry operation budgets. The latter is now independently green at an exact **1,028-byte aggregate cap**: 871 record +157 operation on both deliveries (`BC:4-64`, `W:21`).

## Preserved cumulative corrections

| Round-2 finding | Current disposition |
| --- | --- |
| B2-1 unavailable advanced read / expired claim | Both now reenter the existing owner (`SP:5-76,343-392`; W:8,16). Monotonic advanced evidence is still B3-1; live unexpired claims are B3-3. |
| B2-2 advanced object/client handoff | Accepted advanced handoff rewrites the same record, retains live consumer and slot through terminal disposition (`RE:302-314`; DP:93-101; AO:170,615; W:18,20). Caller-only expiry remains B3-2. |
| B2-3 reference charge | Variable UTF-8 copies and before-write pressure corrected; full canonical envelope remains B3-4. |
| B2-4 retry operation charge | Maximum first/retry operation charges equal at current exact full cap; same attempt succeeds (`BC:4-64`; W:21). |
| B2-5 final control expiry | Injected and real delayed-timer witnesses both refuse late success (`SP:215-240`; W:11-12). Entitlement custody on that refusal is B3-2. |
| B2-6 shutdown/census/new object | Generation checked after census await, exact registration context retained, no object reinstalled/rewritten after shutdown (`RE:163-185`; CO:508-529; SP:241-275; W:13). |
| B2-7 backoff / expired cohort | Typed defer reaches actual owner, one defer count per turn, unselected pending entries cannot leak into ordinary list, cursor rotates after legitimate backoff (`RE:188-200,253-295`; BC; W:14-15,23). |
| B2-8 initializer capture | Production initializer captures own descriptors before reading config; accessor executes zero times and refuses (`IO:68-70,280-287`; CR:77-109; SP:210-214; W:10). |

Both unchanged advanced-ordering witnesses preserve every manifest participant even with **zero participant-progress rows**. For retry first and sweep first, the same record/live consumer/one slot remain, exactly one participant COMMIT is emitted with the durable decision identity, zero rollback is emitted, and durable COMMIT text/digest remain unchanged while status advances COMMITTING to COMMITTED (`AO:170-237,615-682`; W:17-20). These controls preserve the working recovery authority; B3-1 concerns the earlier refused handoff boundary.

## Evidence aliases

Source references are file:line within immutable source 96f0bdc3 (or its exact matching B path). Prior scoped coverage means the cited unchanged implementation and previously executed control remain covered, reinforced by the current canonical component run; it is not a new production claim.

| Alias | File |
| --- | --- |
| CO | `src/query/distributed/distributed-transaction-creation.js` |
| CR | `src/query/distributed/distributed-transaction-creation-resources.js` |
| CT | `src/query/distributed/distributed-transaction-creation-contract.js` |
| DC | `src/query/distributed/distributed-transaction-coordinator.js` |
| RE | `src/query/distributed/distributed-transaction-recovery.js` |
| RA | `src/query/distributed/distributed-transaction-recovery-authority.js` |
| RV | `src/query/distributed/distributed-transaction-recovery-validation.js` |
| DP | `src/query/distributed/distributed-transaction-decision-protocol.js` |
| PV | `src/query/sql-query-engine-transaction-persistence-methods.js` |
| RS | `src/query/sql-query-engine-transaction-set-methods.js` |
| IO | `src/query/sql-query-engine-instance-initializer.js` |
| LC | `src/query/sql-query-engine-lifecycle-methods.js` |
| PG | `src/runtime/pgwire-protocol-handler.js` |
| BA | `src/runtime/pgwire-begin-acceptance.js` |
| AD | `src/query/pg/postgres-wire-adapter.js` |
| CELL | `src/runtime/request-cell-invocation-owner.js` |
| WC | `src/workflow/durable-workflow-coordinator.js` |
| OWN | `src/utils/strict-own-data.js` |
| APP | `src/query/application-database.js` |
| SP | `D/semantic-probes-unchanged.json` |
| AO | `D/advanced-orderings.json` |
| RI | `D/round3-interactions.json` |
| PGW | `D/round3-pgwire-sweep.json` |
| RB | `D/round3-resource-probe.json` |
| BC | `D/round3-bounded-controls.json` |
| W | `D/round3-assertions.log` |

## All 63 instantiated evidence dispositions

PASS is limited to the cited requirement; FAIL identifies the grouped finding preventing its closure. LIMIT preserves a measurement/production gate, not a waiver. All categories were reviewed together before this verdict.

### Admission A1–A7

| Item | Verdict and evidence |
| --- | --- |
| A1 | **FAIL B3-1/B3-3.** Preaccept/accept share exact private token and both deadlines (CO:173-179,264-288; AD:251-277; BA:8-27), but stale advanced authority can obtain a token and the sweep can revoke a lawful one (RI:5,308; PGW:2). |
| A2 | **FAIL B3-1/B3-2.** Canonical missing/invalid/foreign/initial/advanced classification remains PV:125-145,276-311; advanced knowledge and caller-expiry dispositions are lost at later consumers (RI:5,166). |
| A3 | **PASS budget distinction; FAIL custody B3-2.** Original tx and pre-FIFO control deadlines remain separate (CO:173-205,362-424); injected and delayed real timer refuse (SP:215-240). Only the caller expires in RI:166 but session custody is retired. |
| A4 | **FAIL B3-2.** Canonical error/defer shapes now reach the retry owner (CO:46-80; RE:247-295; W:14). Sweep-first caller-expiry yields ordinary TRANSACTION_ACTIVE without original disposition/ID (RI:218). |
| A5 | **FAIL B3-2/B3-3.** Accepted advanced recovery retains live disposition and releases it through exact terminal consumption (CO:677-689; DP:93-101; AO:170,615). Caller expiry and queued sweep still prevent live initial-row acceptance (RI:166; PGW:2). |
| A6 | **FAIL B3-1 overall authority freshness; PASS exact-object correction.** CO:166-170,508-529 and RE:178-184 enforce current map/workflow/generation after awaits; SP:241-275 remains green. Known advanced progress is nevertheless omitted from final acceptance (RI:5). |
| A7 | **FAIL B3-4, B3-3 resolved meaning.** Diagnostics reflect bounded debt/backoff (CO:318-354; RE:275-295; BC), but record bytes undercount their declared representation (RB:5); the invalidated claim is reported resolved (RI:308). |

### Retry Y1–Y7

| Item | Verdict and evidence |
| --- | --- |
| Y1 | **PASS existing retry owner fires; FAIL complete handoff B3-2/B3-3.** LC:48-61 and RE:449-465 retain existing unref sweep; SP:5,343 shows renewed reads/recovery after caller retirement. Sweep affects live dispositions incorrectly (RI:166,308). |
| Y2 | **FAIL B3-1 monotonic knowledge.** Unreadable rows retain bounded debt/backoff (PV:276-311; RE:275-283; W:14), but a subsequent old INSERT APPLIED forgets known advanced evidence (RI:5). |
| Y3 | **FAIL B3-2.** Pressure/uncertain/recovery exits remain typed (CO:46-80), and shutdown retains ownership discipline (SP:241); live caller-expiry exit loses its entitled result and later returns generic ACTIVE (RI:218). |
| Y4 | **FAIL B3-3.** Same-session FIFO exists (DC:291-307; RE:231-237), but sweep selected while BEGIN is pending invalidates the later valid claim before the adapter consumes it (PGW:2). |
| Y5 | **FAIL B3-4 envelope; PASS cohort/counters.** CR:169-177 bounds operation admission, RE:188-200,253-295 bounds/folds each creation cohort, BC rotation reaches all 17; full record charge remains short (RB:5; W:30). |
| Y6 | **FAIL B3-1 semantic replay; PASS no remint.** CT:24-69/PV:211-267 retain immutable six, exact 15 fields and key; RI:107-163/W:25 proves same request/key, but historical APPLIED becomes a new initial-state entitlement. AO:222,667 preserves exact COMMIT fanout. |
| Y7 | **PASS retry-counter correction.** Typed defer is consumed and incremented once per turn (CO:56-80; RE:247-295,493-519); BC records counts 1 then 2 and no work before defer expiry (W:14,23). Claim's false resolved result is separately B3-3, not an ACK reset. |

### Transport T1–T5

| Item | Verdict and evidence |
| --- | --- |
| T1 | **FAIL B3-1 current-state inference; PASS ACK distinction.** PV:246-249 accepts canonical APPLIED, not transport/CommandComplete. Settled replay is lawful but cannot cancel a newer known advanced row (RI:107-163; classifier:26-27,198-212). BA:15-27/W:4 preserve post-tag destroy. |
| T2 | **PASS exact-identity retirement correction.** AD:318-333 retires consumer; CO:291-315 and RE:178-184 fence shutdown/census; original-adversary-new.json close/shutdown plus SP:241-275 preserve identity after late delivery. Caller-only expiry is B3-2, not disconnect. |
| T3 | **PASS typed retry classification.** CO:46-80 supplies deferRetry consumed through existing retry classifier at RE:63-64,247-295; SP:169-208 and W:14 show actual backoff. Consumer disposition failure is A4/B3-2. |
| T4 | **PASS bounded read ownership; FAIL recovery meaning B3-1.** Missing gateway/read method remains typed UNAVAILABLE and read budget is propagated (PV:276-311,323-334; RS:69-90). Reentry runs, but old APPLIED bypasses advanced recovery (RI:5). |
| T5 | **PASS scoped fidelity.** Actual adapter/protocol queued-sweep failure is PGW and its script; unchanged post-tag/disconnect controls pass W:4,7. Ordinary pg.Client/TCP runtime-module fixtures in `test/query/transaction-begin-uncertain-handoff.test.js:86-126,710-769` pass canonical run. No cluster durability is claimed. |

### Sweep/time S1–S5

| Item | Verdict and evidence |
| --- | --- |
| S1 | **PASS clocks/expiry fence.** CO:173-205 checks injected original/control clocks again before acceptance; CR:190-207 timer is unref, RE:449-465 retains existing timer. SP:215-240 checks injected and real delayed timer. B3-2 is custody after correct refusal. |
| S2 | **FAIL B3-1/B3-2 role; PASS COMMIT recovery.** Accepted recovery restores complete manifest/decision at RA:26-49,94-133 and RE:302-314; AO/W:17-20 emits COMMIT only. Refused advanced handoff or caller expiry can subsequently grant/drop the wrong role (RI:5,166). |
| S3 | **PASS corrected shutdown boundary.** LC:85-98, CO:302-315 and RE:163-185 retire disposable process state and reject late census/insert effects; SP:241-275 has no replacement object after shutdown. Durable restart discovery remains owned by existing recovery. |
| S4 | **FAIL B3-2 entitlement separation; PASS original-expiry safety.** Original expired claim now reenters recovery without accepting ACTIVE (SP:343; W:3,16). A legal long original tx at 1000 still loses live entitlement when caller deadline 10 expires (RI:166). |
| S5 | **PASS bounded rotation; FAIL live arbitration B3-3.** Existing FIFO and cursor progress after backoff for all 17 members with cap 16 (BC; RE:67-84,188-200; W:23). Queued sweep can cancel the lawful client winner (PGW:2). |

### Recovery R1–R5

| Item | Verdict and evidence |
| --- | --- |
| R1 | **PASS exact map/registry correction.** Same-record advanced install RE:302-314, DWC live guard and shutdown-generation guard RE:163-185 preserve registries (AO:170,615; SP:241). B3-1 changes the meaning of the same record, not another object's identity. |
| R2 | **FAIL B3-2 live-vs-restart disposition.** Accepted advanced live record is retained through DP:93-101 while restart discovery uses RE:560 onward. Caller-only expiry wrongly enters the server-only/ordinary path as if no live entitlement existed (RI:166). |
| R3 | **FAIL B3-1 current final admission; PASS complete recovery candidate.** RS:69-90 refuses unavailable/malformed pages; RA:26-49 keeps missing-progress manifest members FAILED/UNKNOWN, and legal empty is accepted. AO:222,667 emits exact COMMIT for the missing-progress member. RI:5 later wrongly grants an empty initial projection after known nonempty advanced evidence. |
| R4 | **FAIL B3-1 replay authority; PASS exact fanout.** No remint or changed key in RI:107-163; historical APPLIED nonetheless resets logical authority. AO/W:17-20 preserves one exact COMMIT and no rollback in both orders; backoff reset correction is W:14,23. |
| R5 | **PASS bounded absence/collision handling.** PV:276-311 distinguishes MISSING/INVALID/UNAVAILABLE; PV:132-145 needs immutable foreign identity plus producer PK collision before remint. W:1-2/current canonical malformed/foreign/missing-page cases remain green. |

### Concurrency C1–C5

| Item | Verdict and evidence |
| --- | --- |
| C1 | **FAIL B3-4 charge; PASS reservation order.** DC:291-307 reserves before FIFO; CO:570-589 reserves before row/buffer/DWC. BC preallocation refuses before INSERT, but retained record envelope is below its canonical bound (RB:5). |
| C2 | **FAIL B3-1/B3-3 authority checks.** Post-await object/generation and deadline guards are fixed (CO:166-205,720-722; RE:178-184; SP:215,241). Monotonic advanced fact and existing live claim are omitted from reconciliation/consumption checks (RI:5,308). |
| C3 | **FAIL B3-3.** Client/sweep/shutdown share existing lane/owner (DC:291-307; RE:231-237; BA:15-27), but sweep null-consumer invalidates the exact claimed winner (CO:659-674; PGW:2). |
| C4 | **PASS delayed-timer safety; FAIL expiry consequence B3-2.** Real blocked-event-loop witness refuses spent caller result (SP:229; W:12); release then drops a still-live consumer (CR:249-259; RI:166). |
| C5 | **FAIL B3-4.** Exact session/invocation/operation/reservation identities are retained and maximum first/retry charge equals (CR:209-241,288-325,381-410; BC:4). Actual retained record fields exceed the record charge (RB:5). |

### Formation/degraded path F1–F5

| Item | Verdict and evidence |
| --- | --- |
| F1 | **PASS path inventory; FAIL composed degraded handoff B3-1/B3-2.** Initial INSERT/readback PV:211-311; recovery row/page sandwich RS:69-90; decision/progress writes PV:163-207,344 onward; cache census `sql-query-engine-transaction-recovery-methods.js:158-173` remain existing gateway owners. RI:5,166 shows incorrect disposition during recovery. |
| F2 | **PASS independent existing rediscovery.** IO:272-279 wires cache census/advanced readback; RE:163-185 failed census does not suppress retained IDs. SP:5 shows reads resume; shutdown refuses retired census. No new subscriber/ledger. |
| F3 | **FAIL B3-1/B3-2 correctness, bounded work preserved.** Degraded BEGIN retains original attempt, typed pressure/defer and bounded work (PV:228-266; BC; W:14). Visibility plus old replay or caller expiry yields wrong client outcome (RI:5,166). |
| F4 | **PASS local absolute-budget correction; LIMIT production formation margin.** CO:173-205 plus PV:228-266/RS:69-90 carry/check original control budget through reads and acceptance (SP:215-240). No measured full startLagrangeRuntime deadline margin follows. |
| F5 | **PASS architectural boundary.** Same gateway, DWC, session FIFO, lifecycle and sweep remain (IO:254-287; DC:291-307; LC:48-61). No forced-open fixture, second durable owner or alternate raw path is introduced. Findings require fixes inside those owners. |

### Harness H1–H6

| Item | Verdict and evidence |
| --- | --- |
| H1 | **PASS scoped baseline treatment.** PR/WIT and preserved original-adversary-old JSON record exact 2925863c semantic reds, not import failures. Current original script reaches its assertions (W:1-7). Correct backoff changes the immediate-second-sweep fixture premise, explicitly replaced by BC's deadline advance. |
| H2 | **PASS fidelity distinctions.** PGW runs actual adapter/handler with RecordingSocket; ordinary pg.Client/TCP listener controls remain separate in canonical `transaction-begin-uncertain-handoff.test.js:710-769`. RA/decision logic executes in AO with only I/O doubles. |
| H3 | **FAIL tested behavior B3-2/B3-3.** Original expiry, control expiry before timer, caller expiry versus retry/sweep, pre-tag disconnect, post-tag throw and census/shutdown have distinct schedules (SP:215-275,343; RI:166,308; PGW; W:3-7). No expired acceptance is mislabeled fixed custody. |
| H4 | **PASS full witness domain.** CT:24-69/PV:125-129 require canonical six/15 fields. RI:25-42 and AO beforeRetry include full advanced manifest/COMMIT identity; row/page negative controls remain canonical, not local metadata substituted as authority. |
| H5 | **FAIL submitted closure, positive controls retained.** W has six failures paired with 24 controls; AO/W:17-20 proves nonempty COMMIT missing-progress success, BC proves refusal-before-write and exact-cap success. No vacuous refusal-only acceptance claim. |
| H6 | **PASS scope.** P/freeze-summary.json explicitly limits gateway/listener evidence; this report retains global, activation, normal-startup and corpus gates. Component passes never become startLagrangeRuntime approval. |

### Owner interactions O1–O10

| Item | Verdict and evidence |
| --- | --- |
| O1 | **PASS sole adjudicator structure.** DC:291-362/CO:452-779 own transaction creation; WC:72-84 provides retained registration/maps. The four failures are within this composition, not a transfer of authority to diagnostics or a second owner. |
| O2 | **FAIL B3-1/B3-2/B3-3.** DWC persistence -> private consumer/token -> adapter preaccept -> protocol acceptance remains explicit (PV:211-266; CO:209-288; AD:251-277; BA:8-27). Known advanced state, caller entitlement and live claim are respectively lost at those handoffs (RI; PGW). |
| O3 | **FAIL B3-1/B3-2/B3-4.** RI records exact attempt, durable decision, client acceptance and charged slot/bytes together; RB inspects actual DWC raw/normalized references. Identity retention alone does not prove client usability or accounting. |
| O4 | **FAIL B3-1/B3-3.** Unavailable then readable evidence now redrives (SP:5), but confirmed advanced state can be downgraded by historical APPLIED and a valid claim can be canceled by sweep reentry (RI:5,308). Shutdown stale-object witness is fixed (SP:241). |
| O5 | **FAIL B3-4 envelope; PASS capacity reentry.** CR:363-377 preallocation and BC exact cap/refusal pass; all role transitions keep one reservation. The promised representation bound remains below observed canonical fields (RB:5). |
| O6 | **FAIL B3-2/B3-3 live release; PASS recovery activation wiring.** LC:48-61, IO:272-279, PV:323-334 and RE:302-314 reach existing owner; AO preserves advanced live slot through decision completion. RI:166/PGW still orphan or revoke live initial-result entitlement. |
| O7 | **PASS authority separation; FAIL diagnostic accuracy as B3-4.** CO:318-354 diagnostics grant no durable authority; CO:264-271 uses private token/maps/deadlines. Undercharge and claim falsely reported resolved are findings, not a proposed metrics-based grant. |
| O8 | **PASS provenance.** Forty snapshot paths and 65 total manifest entries independently match (D/source-verification.json, packet-verification.json, final recheck); exact predecessor/design/report hashes above. Old evidence and changed fixture premises stay explicit. |
| O9 | **PASS unchanged production-path inventory.** Engine `sql-query-engine.js:96-119,249-251`, request dispatch `sql-query-engine-request-dispatch.js:144-168`, private carrier `sql-request.js:171`, APP:193-214, CELL:91-150, runtime `pgwire-runtime-module.js:140-154,395`, AD:251-277 reach the same owner. Missing real-adapter acceptance refuses before C; no fallback/direct raw acceptance was added. Prior scoped coverage PR:244 plus current component run applies. |
| O10 | **PASS metadata/runner wiring; LIMIT closure.** `test/shards/impact-contracts.json:54` names coupled owners/tests; source and impact/shard logs hash-match. Current canonical runner executes 3 files/241 assertions. Four new diagnostics must become maintained canonical witnesses before corrected-source closure; manual scripts alone do not certify acceptance. |

### JavaScript/canonical input J1–J8

| Item | Verdict and evidence |
| --- | --- |
| J1 | **PASS primitive arithmetic; FAIL model count B3-4.** CR:25-52,89-99 checks safe positive numeric inputs/sums/subtraction; CO:173-205 checks deadlines. The declared field counts 14/12 at CR:21-22 are below observed 25/20 (RB); no arithmetic overflow is needed. |
| J2 | **PASS corrected own config/row capture.** IO:68-70 captures before property reads; CR:77-109 rejects accessors/proxies and ignores absent inherited keys. PV:296-311/RS:81-82 retain strict rows/arrays. SP:210 and W:2,10 pass. |
| J3 | **PASS capture without accessor execution.** Exact immutable six/15 bytes traverse DWC/queue (CT:24-69; CO:570-645). Row/config accessors execute zero times (W:2,5,10); no unsafe coercion precedes identity capture. |
| J4 | **PASS inherited-field boundary.** OWN:69-113 captures allowed own descriptors to null-prototype records; PV:125-129 requires own fields. IO:68-70 no longer promotes inherited resource config to own data (CR:77-109); prior strict-row coverage retained with current tests. |
| J5 | **PASS value-domain checks.** CR:89-99 rejects boxed/noninteger limits; CT:71-113 and `distributed-transaction-identity.js:32-43` reject exotic/nonprimitive identity/mode/numbers. Current canonical source-adversarial input cases pass; no broader host threat model claimed. |
| J6 | **PASS trusted-host scope.** Existing OWN descriptor/proxy/prototype rules and `architecture/contracts/authority-and-recovery.md:103-111` remain authoritative. B3-4 counts ordinary own data using declared weights; it assumes no hostile intrinsic mutation or VM layout guarantee. |
| J7 | **PASS byte identity.** CT:114-231 canonical encoding/delivery digest unchanged; PV:125-145 compares captured own values before collision/adoption. RI:107-163/W:25 confirms identical key and initial row through replay. Monotonic-state misuse remains B3-1, not a digest migration. |
| J8 | **FAIL B3-4 retained envelope; PASS preallocation/dense input.** CO:570-589 and CT:146-182 measure before allocation; OWN:25-67,116-132 enforces dense own arrays. BC refuses oversized creation before INSERT. RB shows retained field/copy bound still short; this review does not certify future manifest/route materialization. |

## Reproduction, artifacts and remaining gates

Run these exact scripts against the frozen B or an explicitly identified corrected source, writing to a **new** evidence directory. The original scripts copied from round 2 are unchanged; their hashes are included below. The original-adversary scripts embed the same B import prefix (old one embeds its preserved predecessor extraction); root-argument scripts accept B explicitly.

```sh
B=/mnt/data/peter/projects/.worktrees/rs-raft-startup-integration-20261011
D=/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011/begin-source-round3-independent
node "$D/semantic-probes.mjs" "$B" > "$D/semantic-probes-unchanged.log"
node "$D/advanced-orderings.mjs" "$B" > "$D/advanced-orderings.log"
node "$D/original-adversary-new.mjs" > "$D/original-adversary-new.log" 2>&1
node "$D/round3-interactions.mjs" "$B" > "$D/round3-interactions.log"
node "$D/round3-pgwire-sweep.mjs" > "$D/round3-pgwire-sweep.log" 2>&1
node "$D/round3-resource-probe.mjs" "$B" > "$D/round3-resource-probe.json"
node "$D/round3-bounded-controls.mjs" "$B" > "$D/round3-bounded-controls.json"
python3 "$D/extract-round3.py"
python3 "$D/evaluate-round3.py" > "$D/round3-assertions.log"
```

`extract-round3.py` only extracts JSON from the preserved logs; it does not run code under review. The expected current evaluator exit is 1. No runtime sleep or cluster is needed for these deterministic bounded schedules, except the unchanged 25 ms real-clock timer witness. Their I/O boundaries and actual durable-state observation are explicit above.

| Diagnostic | SHA-256 |
| --- | --- |
| `D/semantic-probes.mjs` | `f57721fb740439695895c002c90513c0d5bad93f2c33d5ae2feb693bab129881` |
| `D/advanced-orderings.mjs` | `378596bf6f1003f2ce3127fd66c3a67be1fa1723facf57c5240c1d6ca731d49e` |
| `D/original-adversary-new.mjs` | `264101c8f02b3e2619475de8b35c6061cd9b2c9870e6e6caa0f2cca9ce53c5dc` |
| `D/round3-interactions.mjs` | `08faf80f95e588c9b3f380eb6d0440b3b9a9e2448616a50829212325b7465cd7` |
| `D/round3-interactions.json` | `ddb4b230d4d4689035c34927a10947475513bdf7be646ae68e89f7627d36484d` |
| `D/round3-pgwire-sweep.mjs` | `e04e833d2e30527bf907654afe9b3a26135dd2a6e279ed9593b9a6d490d4366e` |
| `D/round3-pgwire-sweep.json` | `94c597bd5a66c2d2d218d2ae00e01cc977166f98c3146e9f25376eebea237c1d` |
| `D/round3-resource-probe.mjs` | `80f4dab2ba74bf19330905944a3d1f5bdb749880abf31b8245d854c55ece0003` |
| `D/round3-resource-probe.json` | `1a34e021bcc21baccd1b9295b392afdf89b0861eae86632888a82e47767b878b` |
| `D/round3-bounded-controls.mjs` | `6dc49137ab80949e2033715687cd7bef42e6695424383543f4b5273c3d9cb5fa` |
| `D/round3-bounded-controls.json` | `10099b738ed0d867ad0935763270bf50eccbc2853b35b2198489afcc5fc8a8ea` |
| `D/extract-round3.py` | `da964e15ea0de65a4bd5a75a5365ecf4bf7d882d0ab82881c988195fa17c9423` |
| `D/evaluate-round3.py` | `1241e35bdac6965c7d0e4658db400df35fde42a71bba2304f0ddb5aeec8cce00` |
| `D/round3-assertions.log` | `3a956a709f4bac66dc2eeb8fc665f4c073d70d49e1eb86561fe3f167d2eb7f7d` |
| `D/canonical-focused.log` | `8ee6a80e5fb4d35b95e4cdfaf53eaee4662cd1b7dcb7893077c8eed85bc3b6f3` |

All other diagnostic hashes are preserved in `D/diagnostics.sha256`. The source manifest, evidence manifest and accepted design retain the exact hashes above.

The global cyclomatic gate remains **1780 > 1755**, global source-file-size gate **29 > 27** (tests 21/21), and touched-source maximum is 799 lines. Those are unwaived independent gates, not waived by component greens. P reports global cognitive 151/152 with tightening available; this review makes no baseline edit. The separate activation/startLagrangeRuntime/full-operation/corpus/main gates remain open under their existing owners. Preserve this report and exact evidence before author correction. The complete four-finding batch is source work within the accepted BEGIN design, with no design restart requested.
