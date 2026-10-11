# Independent BEGIN source review, round 2

## Verdict and exact boundary

**REJECT source snapshot `a49fd8d1e686d9cd9dc9196478102a0e417df822`.** Eight grouped findings below cover ten failing semantic assertions. The accepted BEGIN design remains accepted; these are implementation failures within its existing handoff, resource, deadline, recovery, shutdown, retry and own-data boundaries. All 63 requested items are disposed of below. This review is complete for the bounded packet; it does not authorize main, merge, corpus, normal startup or activation source.

Reviewer: author-distinct `/root/review_activation_ruling`. No source, tests, design, metadata, index, Quest logs or branches were edited. No stage, commit, push or cluster run occurred. Only this report and read-only source diagnostics under `E/begin-source-round2-independent` were written; the old source extraction there is diagnostic material.

| Subject | Exact identity |
| --- | --- |
| Frozen source | commit `a49fd8d1e686d9cd9dc9196478102a0e417df822`; tree `4d492edf6249f68f4a01ac9912ab5bd541929c62`; parent `c6d71665e98be03de916705f272a9d6340e4a842` |
| Live source inspection | `B=/mnt/data/peter/projects/.worktrees/rs-raft-startup-integration-20261011`; all 39 changed paths byte-match the immutable snapshot before and after diagnostics; `D/source-verification.json` |
| Packet | `B/test-output/continuation-20261011/tx-begin-handoff-round2` |
| Packet manifest | SHA-256 `b69b259e09105643cff7ab64f324a342bf3d2d88c8e764a7a374cacf58c9de24` |
| Packet summary | SHA-256 `febe4b67a0fa0cb98a90714acff1630c45f32f3d43a5a21e7110b11856693d69` |
| Approved design | `B/solve/quests/replicated-transaction-decision-and-apply/design-query-begin-uncertain-insert-resolution-2026-10-11.md`, SHA-256 `3679b87f4aeb84fd8d9397aac9f73f686e5fcb990c1e61e86df35e9731f91fa5` |
| Design approval | SHA-256 `c42b12bb01d1167e9b111c7469c458c82f80cc60e013fdcbfb9583313e1f74d6`, preserved without reopening |
| Rejected predecessor | `2925863c3e72a17854413fa2c850ce4ff76f6aff`; report `E/review-begin-uncertain-source-round1-cdc56.md`, SHA-256 `f5db1b28964bf4982209df80797a24d7c436174853c2896ff8ff83a3977a33aa` |
| Evidence root | `E=/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`; `D=E/begin-source-round2-independent` |

AGENTS, rules, router, the authority/recovery and Quest owners, verification INDEX and all ten matching verification templates were loaded in this review session. This uses the parent's fully instantiated category union, including the templates' evidence-path requirement. Existing trusted-host and strict own-data boundaries are retained; no global intrinsic-immunity requirement is added.

## Evidence and scope of execution

- Independent canonical run: `npm run test:file -- test/query/transaction-begin-source-adversarial.test.js test/query/transaction-begin-uncertain-handoff.test.js`, cwd B. **2/2 files pass, 177 runner entries** (`D/canonical-focused.log:5-10`). These are runner-reported assertions, not a claim of 177 independent leaf cases.
- The author's seven-file cumulative run reports **505 runner entries**. Its exact log and all 12 other named packet logs were hash-verified (`D/packet-log-verification.json`). The two independent files are a subset, not another 505-file acceptance claim.
- The original retained adversary was rerun against an extraction of exact predecessor 2925863c and against B. Only its import prefixes were changed. Seven old failures reach their semantic assertions; those seven pass on a49fd8d1. Close-before-tag retains server debt on both (`D/witness-assertions.log:1-16`). No old failure here is an import/setup failure.
- Additional independent scripts exercise real SQLQueryEngine persistence/readback, DWC/session FIFO, creation resource owner, authoritative recovery and decision fanout. Gateway I/O is a deterministic component double; it returns canonical complete rows and a complete empty participant-progress page. The advanced-ordering double maintains the durable row and applies guarded transaction updates. Its COMMIT callbacks are transport observation points, not mocked decision logic. No proof of real replication/durable storage follows from these component schedules.
- `D/witness-assertions.log:17-26` has ten expected-contract failures, grouped into the eight findings below. Evaluator exit is **1**, deliberately preserving the failed assertions. `:26-27` confirms the recorded-COMMIT/missing-progress positive controls in both retry orderings.

### Reusable commands

Use the frozen B above, or an explicitly recorded corrected worktree. Each script accepts its source root. Output is written only under D.

```sh
B=/mnt/data/peter/projects/.worktrees/rs-raft-startup-integration-20261011
D=/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011/begin-source-round2-independent
node "$D/semantic-probes.mjs" "$B" > "$D/semantic-probes-final.log"
node "$D/advanced-orderings.mjs" "$B" > "$D/advanced-orderings.log"
node "$D/original-adversary-old.mjs" > "$D/original-adversary-old.log" 2>&1
node "$D/original-adversary-new.mjs" > "$D/original-adversary-new.log" 2>&1
python3 "$D/extract-results.py"
python3 "$D/evaluate-witnesses.py" > "$D/witness-assertions.log"
```

`semantic-probes-final.json` is the JSON after the literal `SEMANTIC_RESULTS_START` line in its log; `advanced-orderings.json` is the JSON after `RESULTS_START`. The two original-adversary JSON files are the final objects beginning with `invalidAdvancedMutableRow`. The evaluator reads these four JSON outputs. Keep a separate diagnostic directory for a corrected rerun so this evidence remains immutable. The archived predecessor uses its exact `src` and `package.json`, with B's installed `node_modules`; it is not a new install/dependency certification.

| Diagnostic | SHA-256 |
| --- | --- |
| `D/semantic-probes.mjs` | `f57721fb740439695895c002c90513c0d5bad93f2c33d5ae2feb693bab129881` |
| `D/semantic-probes-final.json` | `7c48f7d7e7d1bb711362eebf0792215ec064841141243a2c5f3368f2017adb1e` |
| `D/advanced-orderings.mjs` | `378596bf6f1003f2ce3127fd66c3a67be1fa1723facf57c5240c1d6ca731d49e` |
| `D/advanced-orderings.json` | `83f608fbb0322af3c094be077b4640e51d2fd2ff476ac7c1d81c60f328541cc0` |
| `D/extract-results.py` | `4f0f631176acfb5ed2e70645496c02bef5d469cc13b2851b3cb74a02ceb890e1` |
| `D/evaluate-witnesses.py` | `4f83c28d15fe9d104bef474d73197895199fa61001d16ece0f690a69f4381784` |
| `D/witness-assertions.log` | `5753e57822925ed4f8ffef5de6952b54bdc914aa53d0c159dc995f737fe3b5d7` |
| `D/original-adversary-old.mjs` | `efbc5c411f4e7f7a8912e23c2b491e9d8f92cb778ad88edf3a87f92d9b5ba92a` |
| `D/original-adversary-new.mjs` | `264101c8f02b3e2619475de8b35c6061cd9b2c9870e6e6caa0f2cca9ce53c5dc` |
| `D/canonical-focused.log` | `f2bcd5b6261df074e66afd36c7f4b3710beb5eb55aee41b44d9c1241fb691033` |

All other diagnostic hashes are in `D/diagnostics.sha256`. The earlier exploratory `semantic-probes.json` includes an under-cap fixture setup error; it is superseded by the final log/JSON and is not rejection evidence.

## Grouped source findings

### B2-1 — HIGH — Recovery/retry: one unavailable advanced handoff permanently suppresses revalidation

`src/query/distributed/distributed-transaction-coordinator.js:221-233` sets `RECOVERY_PENDING` when canonical readback reports a valid advanced row. `src/query/distributed/distributed-transaction-creation.js:415-438` then tries the ordinary recovery handoff once. If its fresh row/page read is unavailable, the record stays `RECOVERY_PENDING`. Reentry at `:610-613` returns immediately, ahead of budget installation or any read. Both a plain retry and the existing sweep take that same branch. Cache discovery cannot rescue it: recovery preserves known live IDs (`src/query/distributed/distributed-transaction-recovery.js:594-609`, `:690-702`; DWC's live-record guard).

Witness `D/semantic-probes-final.json:5-80`: one valid advanced row, first handoff read unavailable, then transport/row available. Two real sweeps and same-session BEGIN perform **zero additional reads**, one original write remains, and the exact record/slot remains `RECOVERY_PENDING`. The pending hold is safe against mutation but has no executable revalidation path. Restore the existing owner's bounded retry of this state; retain its exact identity while unavailable. This is the original SR4 handoff and Y1/Y4/O6 requirement, not a new recovery framework.

The adjacent `SUCCESS_CLAIMED` fast path at `creation.js:603-609` has the same missing reentry consequence after original transaction expiry. `SP:396` (`expired-success-claim-never-hands-off`) creates a valid unconsumed claim, advances the injected original clock past expiry, then runs a sweep and retry: final `canAccept` correctly refuses, but the sweep never calls recovery and the retry still returns success under the old token. The exact slot stays `SUCCESS_CLAIMED` indefinitely for that live consumer. This is a stale response/liveness failure; the witness does **not** show pgwire entering T after original expiry. Both pending roles need the existing owner to revalidate and retain the exact current disposition.

### B2-2 — HIGH — Admission/owner handoff: advanced recovery drops the live result and its resource token

`src/query/distributed/distributed-transaction-recovery.js:164-180` removes the original workflow and installs a recovery object. `src/query/distributed/distributed-transaction-creation.js:437` releases the old token unconditionally on acceptance. The replacement has no creation state, live consumer or pending disposition (`recovery.js:616-674`). Consequently `transactionCreationAdmission` returns null and `beginOwned` reaches ordinary `TRANSACTION_ACTIVE` (`coordinator.js:309-337`). The approved same-record/live-disposition envelope is not retained through consumption.

The paired trace is `D/advanced-orderings.json:3-361` (retry first) and `:364-729` (sweep first): both start with the original uncertain ID, live consumer and one charged slot. Retry first returns recovery-incomplete but replaces the object and releases its live disposition before consumer acceptance. Sweep first releases the slot **before any retry**, then plain BEGIN returns `TRANSACTION_ACTIVE` without the original typed disposition/ID. The creation gate is absent while the protocol has never accepted BEGIN. The design explicitly requires the advanced/ended disposition to remain charged until exact live consumption or retirement (design:1051-1088,1286-1297,1324).

The recovery positive control is deliberately preserved: `advanced-orderings.json:170` and `:538`, plus `witness-assertions.log:27-28`, show one exact COMMIT to `partition-x`, zero ROLLBACK emissions and unchanged durable decision text/digest despite the absent progress row. The defect is the client/resource handoff, not a claim that ordinary replay loses the durable manifest or changes COMMIT. Initial reconstruction temporarily has no participant row; the authoritative replay restores the manifest member as FAILED/unknown before fanout (`recovery-authority.js:26-49,96-133`).

### B2-3 — HIGH — Resources: the fixed envelope still undercharges retained variable references

`src/query/distributed/distributed-transaction-creation-resources.js:264-272` charges 1024 + one encoded row + key + one transaction/session/mode string. The installed record simultaneously retains the encoded row, the initial-row string fields, `sessionId`, `ownerKey`, `transactionId`, `workflowId` and delivery key (`creation.js:542-585`; DWC normalizes another candidate at `durable-workflow-coordinator.js:539-566`). The accepted rule charges each retained reference as a copy and requires the maximum transition footprint before allocation (design:849-859,1059-1088). Raising the old constant to 1024 does not cover strings of arbitrary admitted length.

`D/semantic-probes-final.json:146-158`: a 20,000-byte session is admitted under a 65,000-byte aggregate limit; its settled record is charged **41,318** bytes. A lower bound counting only the listed retained buffer/strings is **80,382** bytes, already above that limit, excluding fixed objects, operation/attachment and scratch. This is a contract accounting bound, not a V8 heap-size estimate. Preallocation order is improved, but the admitted envelope is not conservative. Compute and reserve the actual accepted reference/transition envelope; preserve the same token across the handoff.

### B2-4 — HIGH — Resources/progress: exact full-pool admission cannot reserve its own recovery turn

The first unadorned BEGIN's operation charge omits an expected ID (`creation-resources.js:98-112`). After uncertainty, capture supplies the retained transaction ID (`creation.js:341-345,386-400`), making both foreground retry and recovery operation **32 bytes larger**. All use the same aggregate cap before FIFO.

`D/semantic-probes-final.json:320-377`: with fixed clock 1000, admitted record 1308 bytes, first operation 398 bytes, cap **1706**, the first INSERT is admitted and returns uncertainty. When the persistence path becomes available, retry needs 430 bytes and returns pressure; the sweep is deferred without another write. The one admitted record can never free itself without unrelated capacity or process loss. Preserve the design's exact-limit progress property for an admitted obligation (design:1090-1093,1286-1307); do not solve it by dropping debt or raising a ratchet/default.

### B2-5 — HIGH — Deadline/concurrency: a delayed timer lets a spent control turn grant acceptance

The attachment uses a timer (`creation-resources.js:138-142`), while `buildTransactionCreationResult` and final acceptance validate only the original transaction deadline (`creation.js:176-216,229-237`). The captured control deadline is checked before delivery (`:156-174`), not on the success/consumer edge. A completion microtask can run after the absolute control deadline but before the timer callback.

`D/semantic-probes-final.json:215-258`: injected-clock control proves the gap, and the real-clock schedule blocks the event loop inside the persistence callback for 25 ms with a 10 ms control budget. At 26 ms, BEGIN returns success and exact acceptance returns true. The transaction's 1000 ms lifetime remains valid; the failure is the expired foreground entitlement, not a request to shorten a valid entered transaction. Recheck the existing absolute caller/control deadline at publication/consumption independently of timer dispatch, while retaining any admitted durable work. Design:438-461,782-786,864-889; mandatory C4/S1/S4.

### B2-6 — HIGH — Shutdown/identity: late registration rewrites a newer census-restored object

The direct post-await guard at `coordinator.js:213-224` now refuses ownerless success. Its error consumer is still not exact-object safe: `creation.js:459-473` finds **whatever** object currently occupies the ID and rewrites its consumer/state. Meanwhile `recovery.js:310-323` accepts the result of an already-running census after shutdown with no generation/shutdown check. Stopping the interval is not cancellation of that already-running owner turn.

`D/semantic-probes-final.json:260-317` latches original INSERT and census; shutdown removes/releases the original; census resumes and installs a distinct normal recovery object under that ID; original INSERT settles last. The old error path changes the restored object to `SERVER_RECOVERY_ONLY`. Diagnostics show **one server-only role but zero record count/bytes**. This uses production DWC recovery and registration callbacks, not a direct map edit. Preserve captured workflow/generation identity through every error and post-await branch and prevent retired census turns from installing disposable state. The old direct-shutdown negative now passes; it did not cover this interleaving.

### B2-7 — MEDIUM — Sweep/typing: uncertainty bypasses backoff; expired pending records bypass the selected cohort

(a) Creation returns `retryable: true` with the new typed code (`creation.js:55-65`). `recovery.js:63-64,410-416` sends it to `isRetryableControlPlaneError`, whose candidate classifier does not consume that marker/code (`src/control-plane/control-plane-error-classification.js:247-264`). After unavailable INSERT/readback, the new typed wrapper also discards the original defer/retry-after evidence. Sweeps report failure and clear defer state (`recovery.js:445-448`). `D/semantic-probes-final.json:161-207` shows immediate repeated sweeps deliver again, with deferredAttempts=0 and deferredUntil=0. The accepted N3 contract requires existing defer once per turn. The full-pool pressure branch similarly reports deferred with no actual defer deadline (`:348-356`; B2-4 trace).

(b) The rotating first 16 are correct before expiry. But `recovery.js:331-342` appends every other expired pending creation to the ordinary stuck list. Those enter the session FIFO without a creation operation token (`:347-377`). `D/semantic-probes-final.json:380-395` processes 17 pending entries with cap 16 and reports selectedCount=16. Only 16 additional gateway writes occur, so this is not a claim of a seventeenth transport delivery; it is an unreserved seventeenth creation FIFO turn and misleading cohort accounting. Keep every pending creation under the one selected/bounded cohort and make typed defer accounting truthful. The original prefix-starvation control remains fixed.

### B2-8 — MEDIUM — Own-data configuration: SQLQueryEngine executes getters before the strict owner sees them

The DTC constructor now captures limits through own descriptors and rejects accessors. Production SQLQueryEngine construction reads `options.maxUncertainTransactionCreations` and the other two limit properties directly before constructing that owner (`src/query/sql-query-engine-instance-initializer.js:274-279`). Thus the strict downstream reader sees an ordinary numeric data property after the accessor has already executed; inherited values also become own properties in that newly constructed object.

`D/semantic-probes-final.json:210-213` constructs SQLQueryEngine with a getter for `maxUncertainTransactionCreations`: construction is accepted and the getter executes once. The original DTC-only old/new check now passes but is insufficient for the actual config consumer. Capture the three limit values at the SQL-engine boundary with the accepted own-data rules before evaluating them. Design:465-481; mandatory J2/J3/J4. No hostile-host mutation of intrinsics is involved.

## Exact source alias map for the checklist

Every source alias resolves under frozen B; line numbers below refer to those bytes. `DS` is the approved design path above. `WIT` is `D/witness-assertions.log`; `SP` is `D/semantic-probes-final.json`; `AO` is `D/advanced-orderings.json`; `FOC` is `D/canonical-focused.log`.

| Alias | File |
| --- | --- |
| CO | `src/query/distributed/distributed-transaction-creation.js` |
| CR | `src/query/distributed/distributed-transaction-creation-resources.js` |
| CT | `src/query/distributed/distributed-transaction-creation-contract.js` |
| DC | `src/query/distributed/distributed-transaction-coordinator.js` |
| RE | `src/query/distributed/distributed-transaction-recovery.js` |
| RA | `src/query/distributed/distributed-transaction-recovery-authority.js` |
| RV | `src/query/distributed/distributed-transaction-recovery-validation.js` |
| PV | `src/query/sql-query-engine-transaction-persistence-methods.js` |
| RS | `src/query/sql-query-engine-transaction-set-methods.js` |
| IO | `src/query/sql-query-engine-instance-initializer.js` |
| LC | `src/query/sql-query-engine-lifecycle-methods.js` |
| PG | `src/runtime/pgwire-protocol-handler.js` |
| BA | `src/runtime/pgwire-begin-acceptance.js` |
| AD | `src/query/pg/postgres-wire-adapter.js` |
| RI | `src/runtime/request-cell-invocation-owner.js` |
| SA | `src/query/sql-query-engine-statement-admission.js` |
| WC | `src/workflow/durable-workflow-coordinator.js` |
| OWN | `src/utils/strict-own-data.js` |
| APP | `src/query/application-database.js` |

## All 63 evidence dispositions

PASS is bounded to the cited subclaim; FAIL points to the finding which prevents the requested item from closing. LIMIT records an explicitly unclaimed production measurement. No PASS below upgrades the overall source verdict.

### Admission — A1–A7

| Item | Verdict and concrete evidence |
| --- | --- |
| A1 | **FAIL B2-5**, spent-turn entitlement still accepts (CO:176-237; SP:247). Corrected pgwire preaccept/accept share the same private token and consumer (AD:251-277; BA:8-28; PG:662-684; WIT:13). |
| A2 | **FAIL B2-1/B2-2.** Expired claimed success at SP:396 and unknown/PK collision/initial/advanced classes are explicit at PV:125-145,211-267, but advanced pending never retries and sweep-first consumer gets ordinary ACTIVE (CO:610; AO:411-444). |
| A3 | **FAIL B2-5.** Pre-FIFO control turn and separate original tx deadline are captured at CO:353-378 and applied at :156-174; post-await final entitlement omits control expiry (SP:215-258). |
| A4 | **FAIL B2-2/B2-7.** Canonical error codes exist (CO:46-76), but advanced retry loses its disposition/ID and the actual retry classifier does not consume the new uncertainty type (AO:437; RE:410-416). |
| A5 | **FAIL B2-1/B2-2.** Normal initial-row background handoff is exercised in the canonical tests; valid advanced/unavailable and advanced/sweep-first cases retain or release the wrong client obligation (SP:5; AO:411). |
| A6 | **FAIL B2-6.** Positive acceptance exact-map checks CO:144-149,229-237; late registration error branch CO:459-473 rewrites a restored replacement after shutdown (SP:260). |
| A7 | **FAIL B2-3/B2-6/B2-7.** Diagnostics are observational at CO:283-319; record charge is below the required bound, role count can exceed owned slots, and attempts/defer remain zero (SP:146,260,380). |

### Retry — Y1–Y7

| Item | Verdict and concrete evidence |
| --- | --- |
| Y1 | **FAIL B2-1/B2-4.** Existing unref sweep at RE:477-490 reaches retained creation via :366-377; RECOVERY_PENDING short-circuit and exact-pool reservation prevent any redrive (SP:5,320). |
| Y2 | **FAIL B2-1/B2-7.** Unknown row remains charged and per-delivery budget is bounded (PV:233-266), but unavailable recovery is either permanently suppressed or repeatedly delivered without its accepted defer (SP:5,161). |
| Y3 | **FAIL B2-2/B2-7.** Pressure, uncertainty, recovery incomplete and ordinary collision outcomes are typed at CO:46-90; actual advanced consumer and defer exits do not retain the required reason/owner meaning (AO:437; SP:161). |
| Y4 | **FAIL B2-1/B2-4.** Same-session FIFO excludes client/sweep overlap (DC:291-307; RE:359-377), but both rescuers suppress themselves forever on pending state or the admitted full-byte pool (SP:5,320). |
| Y5 | **FAIL B2-3/B2-7.** Operation/attachment counts are bounded at CR:104-112; the reference envelope and expired cohort exceed their specified bounds (SP:146,380). |
| Y6 | **PASS bounded identity/effect subclaim.** CT:24-69 fixes the 15/6 fields; PV:211-267 retains original insert/key and requires actual PK code before remint. Canonical same-session orderings and old/new controls pass; AO:170,538 emits one same-ID COMMIT per schedule. Client disposition remains B2-2. |
| Y7 | **FAIL B2-7.** New retryable uncertainty never enters defer, so counters stay/reset at zero after failed turns (RE:410-448; SP:161-207); no transport ACK is otherwise reclassified as durable APPLIED (PV:244-252). |

### Transport — T1–T5

| Item | Verdict and concrete evidence |
| --- | --- |
| T1 | **PASS bounded durability distinction.** PV:244-267 accepts canonical APPLIED or exact authoritative initial row; PG:674-684/BA:15-27 make CommandComplete local enqueue followed by synchronous token acceptance. WIT:13 proves no Error/Ready after post-tag failure. |
| T2 | **FAIL B2-6; normal close fixed.** AD:318-333 retires consumer before close; CO:256-265 prevents normal close revival; WIT:16 preserves that control. The distinct census/shutdown late result still changes newer identity (SP:260). |
| T3 | **FAIL B2-7.** New uncertainty code and retryable marker (CO:55-65) are not recognized by actual control-plane retry classification consumed at RE:63,410. SP:161 shows the mismatch. |
| T4 | **FAIL B2-1/B2-4.** Missing gateway/read owner is typed unavailable (PV:276-312); operations retain original row and budget. Available-again reads do not recover the permanent pending state or full pool (SP:5,320). |
| T5 | **PASS fidelity boundary, with limits.** Actual PostgresWireAdapter missing-owner and post-tag paths run in `test/query/transaction-begin-source-adversarial.test.js:191-258`; normal pg.Client listeners use runtime module in `transaction-begin-uncertain-handoff.test.js:86-126,710-769`. FOC:8-10 passes these component files; no real cluster durability claim. |

### Sweep/time — S1–S5

| Item | Verdict and concrete evidence |
| --- | --- |
| S1 | **FAIL B2-5.** Arithmetic uses owner.now and safe checked deadlines (CO:329-339), timers are unref (CR:138-142; RE:477-490), but final acceptance relies on timer execution rather than the same absolute time predicate (SP:247). |
| S2 | **FAIL B2-2; COMMIT authority preserved in replay.** Advanced owner drops pending-consumer gate (RE:164-180), while RA:96-133 restores the manifest/decision before redrive. AO:170,538 proves missing progress does not convert COMMIT to rollback. |
| S3 | **FAIL B2-6.** LC:85-98 stops sweep and retires volatile creation state; CO:267-281 releases only pending records, but in-flight census can reinstall then be rewritten by stale completion (SP:260-317). |
| S4 | **FAIL B2-1/B2-5, with original-expiry acceptance refusal preserved.** SP:396 shows an expired claimed result never entering recovery. WIT:11 proves expired original transaction cannot enter ACTIVE. SP:247 separately proves a spent short control turn can grant a still-long-lived transaction; an entered long transaction must retain its own deadline. |
| S5 | **FAIL B2-1/B2-4/B2-7.** Rotating cursor RE:66-84 fixes prefix starvation (WIT:12), but pending short-circuit, unavailable reentry capacity and extra expired cohort prevent the complete progress/bound claim (SP:5,320,380). |

### Recovery — R1–R5

| Item | Verdict and concrete evidence |
| --- | --- |
| R1 | **FAIL B2-6.** WC recovery normally preserves live maps and RE:594-609 filters their progress rows; the late error handler has no captured-object comparison and clobbers the restored object (CO:459-473; SP:260). |
| R2 | **FAIL B2-2/B2-6.** Restart discovery uses the existing durable-row recovery path (RE:582-736); successful live advanced handoff wrongly treats its new recovery object as if no client entitlement existed, and retired census can install after shutdown (AO:411; SP:260). |
| R3 | **PASS bounded canonical manifest recovery.** RS:69-91 refuses missing/malformed progress pages; RA:26-49 retains every canonical manifest pair even without progress, as FAILED/unknown. Canonical foreign/duplicate/mismatched negatives at `transaction-review-adversarial.test.js:461-493`; AO/WIT:27-28 provides actual recorded COMMIT fanout, including legal empty-progress input. |
| R4 | **FAIL B2-1/B2-7 for complete redrive.** PV:211-267 retains exact insert identity; AO:170,538 preserves exact decision identity/no rollback; dead pending and false retry resets block idempotent eventual recovery (SP:5,161). |
| R5 | **PASS bounded absence classification.** PV:276-312 maps absent row to MISSING and malformed to INVALID; PV:132-145 requires canonical foreign identity plus producer PK collision before remint. WIT:9-10 confirms malformed/accessor rows cannot authorize. Unavailable handoff liveness remains B2-1. |

### Concurrency — C1–C5

| Item | Verdict and concrete evidence |
| --- | --- |
| C1 | **FAIL B2-3/B2-7b.** DC:291-307 reserves before client FIFO, CO:531-547 reserves before row/buffer/DWC construction. Envelope undercharges, and expired unselected pending sweep entries bypass operation admission (RE:331-377; SP:146,380). |
| C2 | **FAIL B2-5/B2-6.** Success path post-await exact guards exist (DC:213-224; CO:623-630), but final control expiry and post-await registration-error/census boundaries are incomplete (SP:247,260). |
| C3 | **FAIL B2-2/B2-6.** The sole FIFO and synchronous PG acceptance correctly serialize normal paths (DC:291-307; BA:15-27), but advanced transfer loses the consumer winner and shutdown census escapes the generation winner (AO:411; SP:260). |
| C4 | **FAIL B2-5.** Real-clock 25 ms blocked event loop with 10 ms attachment timer lets Promise continuation claim and accept success first (SP:247-258). Timer callback ordering cannot be the only expiry fence. |
| C5 | **FAIL B2-3/B2-4/B2-6.** Tokens have exact attachment/invocation/session keys (CR:148-175,182-234), but retained references exceed charge, same identity reentry needs unreserved extra bytes, and roles can outlive token custody (SP:146,260,320). |

### Formation/degraded path — F1–F5

| Item | Verdict and concrete evidence |
| --- | --- |
| F1 | **FAIL B2-1/B2-7 for degraded-path completion.** Inventory: initial INSERT and exact read PV:211-312; transaction/participant/transaction sandwich RS:69-91; status/decision/progress writes PV:163-207,344-379,417 onward; cache discovery `sql-query-engine-transaction-recovery-methods.js:158-173`. All stay on the existing gateway/cache owners. Degradation retains identity but pending advanced state never rereads (SP:5). |
| F2 | **FAIL B2-1/B2-4.** Existing independent discovery is IO:269-270 -> cache census and RE:310-323; retained IDs do not need discovery, yet their pending state/capacity prevent the recovery path from firing (SP:5,320). No new discovery owner is requested. |
| F3 | **FAIL B2-4/B2-7.** Client BEGIN during unavailable metadata gets typed uncertainty/pressure and original identity (PV:233-267); after metadata returns the exact admitted byte pool remains blocked and unavailable sweeps lack intended defer (SP:161,320). |
| F4 | **FAIL B2-5; LIMIT full formation margin.** One captured budget is passed through INSERT/readback/advanced sandwich (CO:156-174; PV:233-266,323-329; RS:69-91), but final success omits control expiry. This packet provides no measured startLagrangeRuntime formation window or full startup deadline margin. |
| F5 | **PASS architectural boundary, not progress approval.** Same gateway, DWC, session FIFO and sweep owners remain; no alternate durable ledger/forced-open path is added (IO:198-283; DC:291-307; LC:48-61). B2-1/B2-4 must be fixed within those owners. |

### Harness/evidence — H1–H6

| Item | Verdict and concrete evidence |
| --- | --- |
| H1 | **PASS.** Exact old/new original adversary executes through semantic results; WIT:1-16 shows seven old failing assertions, seven corrected new passes and preserved close control. Source/provenance in D/original-adversary-{old,new}.mjs and JSON, no red import/setup. |
| H2 | **PASS scoped fidelity.** RecordingSocket post-tag fault is a synchronous protocol component test; distinct ordinary pg.Client/TCP fixtures run actual runtime module (`transaction-begin-uncertain-handoff.test.js:86-126,710-769`). Independent AO uses real recovery/decision logic with explicit gateway/participant I/O doubles. Neither proves normal cluster startup. |
| H3 | **FAIL source behavior, covered schedules.** Original expiry (WIT:11), control completion-before-timer (SP:215,247), retirement-before-late-insert (WIT:15-16), and census/shutdown/late completion (SP:260) are distinguished. The latter control/shutdown cases fail. |
| H4 | **PASS witness domain.** CT:24-69 and PV:125-129 demand all 15 canonical creation fields; AO:50-85,411-436 records complete advanced rows, canonical participant-set text and canonical COMMIT text/digest. Malformed/control tests do not use partial rows as freshness. |
| H5 | **FAIL completeness of submitted closure; independent controls supplied.** Submitted FOC passes its 177 entries, but exact-byte saturation, advanced revalidation/disposition and shutdown-census schedules fail WIT:17-26. AO/WIT:27-28 pairs these with valid nonempty COMMIT/missing-progress controls. |
| H6 | **PASS scope honesty.** Packet `source-boundary.json` and `evidence-summary.json` explicitly limit pg.Client traces to components; this report retains activation/startup/global-gate holds and makes no startLagrangeRuntime/corpus claim. |

### Owner interactions — O1–O10

| Item | Verdict and concrete evidence |
| --- | --- |
| O1 | **PASS sole-owner structure.** DC:291-362 and CO:415-681 remain transaction creation adjudication; WC supplies storage maps and registration, not a second decision authority. Eight findings are errors within this composition, not authority delegated elsewhere. |
| O2 | **FAIL B2-2/B2-7.** DWC failure retention at WC:72-84, coordinator state, private result token, adapter preaccept and protocol acceptance are named end-to-end (CO:176-265; AD:251-277; BA:15-27), but advanced disposition and retry typing are dropped between actual owners. |
| O3 | **FAIL B2-2/B2-3/B2-4.** AO:50-127/411-478 combines exact identity, durable COMMIT, live client entitlement and actual slot/bytes in one witness; SP:146,320 combines actual accounting and transport effect. Identity retention alone does not prove usability or charge. |
| O4 | **FAIL B2-1/B2-6.** Unavailable then readable advanced evidence remains permanently pending (SP:5), and stale completion after fresh census rewrites the new object (SP:260). RI:91-150 correctly refuses replaced executor acceptance in its submitted component test, without fixing these coordinator cases. |
| O5 | **FAIL B2-3/B2-4.** Pressure initially refuses before side effects (CO:531-547; CR:274-289) but the admitted byte envelope is too small and may lack reentry capacity. SP:146,320 records retained debt and zero escape via extra INSERT. |
| O6 | **FAIL B2-1/B2-2.** LC:48-61 activates the existing sweep/replay; IO:271-276 wires advanced handoff; PV:323-335 calls that owner. Failed handoff never retries and accepted handoff prematurely releases client custody (SP:5; AO:411). |
| O7 | **PASS authority separation, failed accuracy recorded elsewhere.** CO:283-319 diagnostics do not grant BEGIN or durable authority; preaccept uses exact maps/token and durable read classifier (CO:229-237; PV:125-145). B2-3/B2-6/B2-7 make diagnostics/accounting inaccurate, not a new authority. |
| O8 | **PASS provenance.** Frozen snapshot/tree/parent, 39-byte checks and all 13 packet log hashes are recorded above and in D/source-verification.json/D/packet-log-verification.json; WIT:1-16 distinguishes old vs new rather than treating baseline reds as new regressions. |
| O9 | **PASS bounded production-path inventory.** Engine `sql-query-engine.js:96-119,249-251`, request dispatch `sql-query-engine-request-dispatch.js:144-168`, private carrier `sql-request.js:171`, application APP:193-214, scoped executor RI:91-150, runtime `pgwire-runtime-module.js:140-154,395` and actual AD:251-277 reach the same owner. Missing acceptance on real PostgresWireAdapter refuses before C (`transaction-begin-source-adversarial.test.js:221-258`); no fallback raw acceptance is added. |
| O10 | **PASS metadata/runner wiring; LIMIT closure.** `test/shards/impact-contracts.json:54` registers the coupled BEGIN owners/tests, with transaction control metadata; packet impact/shards logs hash-match and canonical runner FOC:5-10 executes registered files. New failing independent schedules must become maintained witnesses; standalone diagnostics do not substitute canonical acceptance. |

### JavaScript/canonical input — J1–J8

| Item | Verdict and concrete evidence |
| --- | --- |
| J1 | **FAIL accounting invariant B2-3/B2-6; basic numeric lattice passes.** CR:11-26,41-46 and CO:329-339 safely check primitive counts/sums/deadlines; CT:71-113 rejects noncanonical initial values. Role count versus owned slot count is not checked at CR:58-71, and SP:260 reaches 1 role/0 slots. |
| J2 | **FAIL B2-8.** PV:289-307/RS:17-30,79-83 use strict own row/array capture, but IO:274-279 evaluates configuration fields before CR:29-38 own-descriptor capture (SP:210). |
| J3 | **FAIL B2-8.** Captured immutable six and initial 15 bytes traverse DWC/async queue (CT:24-69; CO:542-585); row element getter no longer executes (WIT:10). Production configuration getter still executes before capture (SP:210). |
| J4 | **FAIL B2-8 at configuration adapter.** OWN:69-113 rejects unsupported record prototypes/accessors and copies into null-prototype records; own required fields checked at PV:125-129. IO:274-279 can promote an inherited config value to an accepted own numeric field. No prototype mutation is needed for this source trace. |
| J5 | **PASS bounded value-domain checks.** CR:41-46 rejects boxed/noninteger limits; CT:71-113 and `distributed-transaction-identity.js:32-43` reject nonprimitive mode/ID/integer values. Canonical tests `transaction-begin-source-adversarial.test.js:287-352` run in FOC; production accessor capture remains separately failed J2/J3. |
| J6 | **PASS trusted-boundary scope.** Existing OWN descriptor/proxy/prototype rules are used; report B2-8 uses an ordinary accessor on config, not host compromise. Authority/recovery owner contract `architecture/contracts/authority-and-recovery.md:103-111` remains the session's scope; no global intrinsic-mutation immunity demanded. |
| J7 | **PASS canonical byte identity.** CT:114-231 encodes typed fields and constructs the deterministic SHA-256 delivery key; PV:125-145 compares canonical own values before adoption/collision classification. Fixed vectors at `transaction-begin-uncertain-handoff.test.js:170-219` are in FOC. No migration or digest format change inferred. |
| J8 | **FAIL B2-3, partial correction preserved.** Initial scalar measurement precedes buffer/key/DWC allocation (CO:531-547; CT:146-182) and own dense arrays are validated (OWN:25-67,116-132). The actual retained envelope remains below its variable reference lower bound (SP:146); this does not certify unbounded future manifest/route materialization. |

## Preserved corrections and remaining gates

SR1's reserve-before-row/buffer/DWC order is implemented; its envelope and exact-full-pool progress are not. SR2 now queues the fixed operation token instead of spreading the original request options, clears attachment consumer references and retains operation charge until FIFO settlement (DC:291-307; CR:198-260); that correction does not certify the total byte envelope. SR3's original-transaction expiry refusal is corrected, while final control-turn expiry is not. SR4's malformed/accessor read rejection and missing-progress COMMIT recovery are corrected, while pending revalidation/live disposition are not. SR5's actual distributed preaccept and post-CommandComplete destruction are corrected. SR6's simple direct shutdown race is corrected, while census/replacement error handling is not. SR7's preexpiry rotation is corrected, while backoff/cohort accounting are not. SR8's DTC validation is corrected, while actual engine config capture and complete resource witnesses are not.

The author's global cyclomatic gate remains **1781 > 1755**, and global file-size gate remains **source 29 > 27, test 21/21**. Packet provenance says the oversized path set equals rejected 2925863c and shrinks from c6 after extraction; this is classification, not a waiver or source approval. The separately classified 27 broad coordinator failures are not claimed green here. Scoped lint/complexity/impact/shards passes remain scoped to their hashed logs.

No additional broad design restart or cluster run is required to establish these source failures. Fix the complete grouped batch under the existing approved design and preserve this exact evidence before author edits. Future source review must cover the corrected byte snapshot and maintained semantic witnesses; all activation, production startup, full-operation, corpus and main gates remain open as previously owned.
