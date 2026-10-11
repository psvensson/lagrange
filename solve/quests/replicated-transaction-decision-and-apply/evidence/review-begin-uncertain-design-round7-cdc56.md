# Independent BEGIN uncertain-insert design review — round 7

**Verdict: APPROVE DESIGN FOR IMPLEMENTATION.** The round-seven amendment closes the sole round-six defect by making capacity a role-neutral creation-record slot paired one-to-one with the already approved maximum byte envelope. The same slot survives every descriptor, entitlement, claim, server-only and unconsumed advanced/ended role, so a full mixed-role population cannot block an admitted record from reclassifying. The compact transition table consistently binds durable identity/state, session entitlement and exact object/count/byte release for retry-before-recovery, recovery-before-retry, ROLLBACK, close, late completion and retained FIFO. No reachable design defect remains under the retained 63-item checklist. This approves the proposal, not an implementation or runtime result.

## Exact subject, predecessor and scope

- Subject `solve/quests/replicated-transaction-decision-and-apply/design-query-begin-uncertain-insert-resolution-2026-10-11.md`: independently verified SHA256 **3679b87f4aeb84fd8d9397aac9f73f686e5fcb990c1e61e86df35e9731f91fa5**.
- Preserved round-six subject `evidence/design-query-begin-uncertain-insert-resolution-round6-07ad9201.md`: independently verified SHA256 **07ad92019e02aa2bff559778bd1894f6b5e77fcf8639e35a1d70794160761cd1**.
- Prior independent report `test-output/continuation-20261011/review-begin-uncertain-design-round6-cdc56.md`: independently verified SHA256 **6a96493ce9485b73d1eda7288868bab9ca1753117bcddc54f7790f659115989d**.
- Source navigation tree remains T HEAD `e7c89f4b5114c0238312d3831b65889a4622f4e9`. Future source foundation `c6d71665e98be03de916705f272a9d6340e4a842` is separately reviewed and is not approved by this docs-only review.
- Read the complete cumulative proposal and predecessor, the prior independent report, and the actual coordinator/FIFO/DWC/persistence/recovery, engine, pgwire handler/adapter and application-database owner paths cited below. AGENTS → rules → router and the same instantiated 63-item verification bar govern this review.
- This report is the only file written. No source, test, Quest log, index, C17, activation or runtime file was changed or executed.

## Narrow round-seven disposition

| Delta | Disposition | Concrete reason |
| --- | --- | --- |
| R6-1 role transition count defect | **CLOSED** | D:1267-1289 defines one global role-neutral record slot, reserves it before INSERT, keeps it across all roles, makes per-role counts diagnostic, and pairs the maximum byte envelope one-to-one with the slot. Role changes cannot require another admission. |
| Exact release ownership | **APPROVE** | D:1291-1301 releases once only after ordinary ACTIVE/recovery/ended ownership and any live result have both transferred or after an exact terminal/no-effect/collision disposition is consumed. Disconnect, expiry, unavailable evidence and age cannot release it. |
| Mixed-role saturation | **APPROVE** | D:1303-1310 refuses a new creation before INSERT/identity/descriptor allocation at the global cap while every admitted record can reclassify in place. D:1344-1353 requires real mixed-role and all-entitlement saturation witnesses with counters, bytes, durable rows and single releases. |
| Compact cumulative transition table | **APPROVE** | D:1319-1331 accounts the stable attempt, durable state, session entitlement/claim, retained owner, slot, envelope, operation token and caller attachment at every requested schedule. Retry and recovery order do not alter the one-slot lifetime. |
| Previously approved round-six byte/acceptance/incarnation contract | **UNCHANGED APPROVAL** | D:1261-1263 expressly retains the maximum byte envelope, result/acceptance state machine, exact consumer-incarnation arbitration, operation/attachment lifetime and protocol projection. Round seven changes only record-count ownership. |

## Compact transition-table audit

| Required schedule | Stable identity and durable authority | Entitlement/object state | Count and byte result |
| --- | --- | --- | --- |
| Admission | Exact six fields, fixed 15-field bytes and key are installed before delivery; effect is unknown (D:1321). | One DWC record is installed after the pre-FIFO operation token and inside-FIFO slot/envelope reservations. | One role-neutral slot and one maximum envelope are owned before INSERT; pressure exposes no identity and clears temporary inputs. |
| Uncertain answer | Original ID/bytes/key remain; unknown/pending/unavailable/invalid is not success (D:1322). | `WAITING -> UNCERTAIN_ANSWERED`; the exact live incarnation retains the result entitlement. | Record slot/envelope remain; only operation/attachment follow their own settlement lifetime. |
| Retry before recovery | Retry rereads the same record within the original control deadline and never remints (D:1323). | Same entitlement, or one `SUCCESS_CLAIMED(RETRY_HANDOFF)` on authoritative initial ACTIVE evidence. | Retry tokens settle; the record changes no aggregate count or byte ownership. |
| Recovery before retry | Initial or valid advanced same-creation state is preserved (D:1324). | The exact live incarnation retains its result; a later retry may claim it once. | Same record reclassifies in place. Release waits for exact ordinary-owner transfer and no live result, or live disposition consumption. |
| Direct success and acceptance | Canonical APPLIED/exact readback proves original initial row; acceptance rechecks workflow/revision/ID/token/incarnation (D:1325-1326). | `SUCCESS_CLAIMED(DIRECT_FIRST_RESULT) -> ENTERED_ACTIVE`; pgwire/application synchronously retain their local entered state. | Slot/envelope release once only after both normal transaction ownership and protocol/application acceptance are installed. |
| ROLLBACK | Pending/undelivered creation is not an ACTIVE transaction; accepted creation uses ordinary rollback (D:1327). | Pending returns typed creation error and `I` without consuming entitlement; entered state follows normal cleanup. | Pending keeps record slot/envelope and releases only its operation/attachment. Entered state already released creation capacity. |
| Close and late completion | Preaccept identity/evidence remain; retired incarnation cannot reclaim a result (D:1328-1329). | Preaccept becomes `SERVER_RECOVERY_ONLY`; postaccept close uses ordinary entered-block cleanup. | Preaccept holds slot/envelope through exact recovery/terminal transfer. Late callbacks cannot release a successor. |
| Retained FIFO | Never-delivered queued work has no durable attempt; delivered work points to the installed record (D:1330). | Detached retries drop attachments without deleting another invocation’s result or the server record. | Every queued native reaction keeps its own operation charge until settlement; the creation owns at most one slot/envelope. |
| Full mixed-role population | Descriptor, entitlement, claim and server-only diagnostic counts sum exactly to the global cap (D:1331). | Existing states remain intact; no role is discarded to admit another. | Next BEGIN refuses before INSERT. Any admitted record reclassifies without new capacity; one exact release permits one admission. |

## Findings

**None at the design-contract level.** The earlier R6-1 counterexample is no longer reachable: filling all slots with live entitlements makes the next BEGIN refuse before INSERT, while a population admitted before saturation can transition among roles without changing total slots or prepaid bytes. The proposal also keeps operation and caller-attachment tokens distinct because their native Promise/client lifetimes differ (D:1286-1289), so the correction does not hide FIFO work in the creation-record count.

## Full 63-item checklist

Legend: **P/O** means coherent proposed contract with future implementation/evidence obligations. **LIMIT** is an explicit proof boundary, not a defect.

| Item | Disposition and concrete evidence path |
| --- | --- |
| A1 | **P/O.** The cumulative single creation gate remains across BEGIN, statement/use, enlistment, COMMIT, ROLLBACK, lifecycle, shutdown and sweep; round seven adds one pre-INSERT global slot at D:1267-1272. Actual entry paths remain `distributed-transaction-coordinator.js:230-245,469-520,555-557`, `distributed-transaction-statement.js:48-103` and `sql-query-engine-service-lifecycle-execution.js:109-123`. |
| A2 | **P/O.** Exact same creation, producer-specific PK collision, terminal no-effect, invalid/wrong-key/incomplete and advanced same-creation classifications are unchanged. D:1322-1325 makes all uncertain, retry and recovery schedules retain the original identity and authoritative classification. |
| A3 | **P/O.** The original pre-FIFO deadline still governs INSERT/read/reconciliation; D:1323 explicitly spends only the original captured control deadline. Role changes and result acceptance do not renew it. |
| A4 | **P/O.** Typed gateway/reader/DWC outcomes and the approved private acceptance token are unchanged. D:1319-1331 names each state transition and exact release result; current engine projection remains `sql-query-engine-statement-admission.js:138-145`. |
| A5 | **P/O.** Same-session BEGIN and the existing recovery sweep remain the real reentry edges. D:1323-1324 proves retry-before-recovery and recovery-before-retry converge on the same record without an invented wake. |
| A6 | **P/O.** Exact record/token, invocation, consumer incarnation, workflow revision and ID checks from round six remain mandatory after awaits. D:1326,1328-1329 keeps claim and close arbitration tied to the current exact object. |
| A7 | **P/O.** D:1282-1289 requires safe diagnostic role counters whose sum exactly equals owned slots in the same synchronous turn. D:1350-1352 requires cap, total slots, role counts, exact bytes, durable rows and single releases in evidence. |
| Y1 | **P/O.** Existing foreground same-session retry and unref recovery sweep remain the only retry wakes; actual sweep is `distributed-transaction-recovery.js:352-370`. D:1323-1324 covers both firing orders. |
| Y2 | **P/O.** Unavailable/invalid reads retain the frozen original identity/deadline and slot/envelope (D:1322,1329). No state change converts unreadable evidence into permission or a fresh budget. |
| Y3 | **P/O.** Pending, terminal, stale, detached, server-only and accepted exits are typed. Full capacity refuses before INSERT/identity exposure (D:1303-1304); no silent descriptor/result deletion is used for pressure. |
| Y4 | **P/O.** FIFO, sweep, acceptance and handoff have no mutual capacity wait: operation/attachment resources settle by their own lifetimes, while record role changes need no new slot or envelope (D:1282-1289,1330-1331). |
| Y5 | **P/O.** Global records, maximum bytes, pre-FIFO operations, attachments and sweep batch are independently bounded. Diagnostic role sums equal the global count; D:1344-1353 requires all-entitlement and mixed-role full-cap witnesses using real owners. |
| Y6 | **P/O.** Same INSERT key/bytes and one record make late first completion/idempotent redelivery converge. D:1325-1326 permits one exact claim and one synchronous acceptance, with no duplicate participant effect. |
| Y7 | **P/O.** Uncertainty, ACK, retry, recovery, acceptance and close never remint ID or renew createdAt/deadline. D:1323 and D:1329 retain the original bytes/key through retry and late completion. |
| T1 | **P/O.** Transport ACK/noHandler remains nonauthoritative. Direct success requires canonical APPLIED or exact initial readback (D:1325), then a separate local acceptance edge (D:1326). |
| T2 | **P/O.** Late INSERT/read completion is exact-token fenced against consumer retirement and current record state; it cannot replace a successor or revive a retired incarnation (D:1328-1329). |
| T3 | **P/O.** Producer-specific PK collision and typed persistence outcomes remain the only collision/error authority. Record roles and wire/application results are consumption state, not persistence reclassification. |
| T4 | **P/O.** Undeliverable live work becomes bounded `SERVER_RECOVERY_ONLY` and remains under the existing sweep. The retained round-six post-tag refusal destroys the connection and suppresses Ready rather than presenting success. |
| T5 | **P/O.** D:1344-1353 requires the real engine/gateway/SQLite and pgwire/application consumers, not scripted classifications. Actual handler path remains `pgwire-protocol-handler.js:619-669,691-697`; adapter close is `postgres-wire-adapter.js:276-305`. |
| S1 | **P/O.** No timer is added. Existing injected/unref recovery interval remains `distributed-transaction-recovery.js:352-370`; record reclassification and acceptance are synchronous owner turns. |
| S2 | **P/O.** Uncertain/result/claim roles grant no COMMIT or rollback authority. `ENTERED_ACTIVE` requires exact workflow retention and completed protocol/application acceptance before creation capacity releases (D:1294-1296,1326). |
| S3 | **P/O.** Socket/application close retires only the exact consumer incarnation and keeps server recovery ownership (D:1328). Process retirement uses the documented reference-drop hook without claiming undurable work survives a crash (D:1299-1301). |
| S4 | **P/O.** Foreground expiry leaves bounded recovery debt; disconnect, expiry, unavailable evidence and age cannot release it (D:1297-1301). Legitimate settlement can reclassify within prepaid capacity. |
| S5 | **P/O.** Canonical gateway CRITICAL mutation/read and the existing sweep remain usable while ordinary transaction activity is closed; no readiness/cache dependency is introduced. Actual gateway calls remain `sql-query-engine-transaction-persistence-methods.js:136-229,305-318`. |
| R1 | **P/O.** One exact DWC record is rewritten in place, preventing stale callbacks from clobbering advanced workflow/session state. D:1324 preserves valid advanced rows and releases only after exact owner transfer/result consumption. |
| R2 | **P/O.** Live pending, live result entitlement, success claim, server-only obligation, durable restart census and new-process session remain distinct roles/owners. One slot does not equate their authority. |
| R3 | **P/O.** General advanced-row classification and nonempty COMMIT/participant progress remain unchanged. D:1324 transfers advanced state toward existing recovery/ended ownership without rebuilding the initial row. |
| R4 | **P/O.** Exact replay, same object, one claim token, synchronous acceptance and close arbitration are idempotent. D:1323-1326 and D:1329 make both ordering races converge without duplicate INSERT/decision. |
| R5 | **P/O.** MISSING alone remains nonauthoritative. Slot retention through unavailable evidence/close prevents absence from becoming terminal/no-effect proof or permission for a new identity. |
| C1 | **P/O.** The operation token is reserved before FIFO and the role-neutral slot plus maximum byte envelope inside FIFO before INSERT/descriptor allocation (D:1321). This closes the prior target-role count gap. |
| C2 | **P/O.** Exact object/token/incarnation/deadline/readback checks remain required after every await; final role rewrites and protocol/application acceptance are synchronous. D:1328-1329 gives close and late completion deterministic fencing. |
| C3 | **P/O.** Foreground retry and recovery share one FIFO/record winner. D:1323-1324 demonstrates either order rewrites the same admitted record at unchanged capacity. |
| C4 | **P/O.** Timer, detach, shutdown, result delivery and late callback races all preserve the same slot/envelope until their exact transfer condition. D:1327-1330 covers ROLLBACK, close, late completion and retained FIFO. |
| C5 | **P/O.** Volatile session/incarnation/invocation/claim tokens remain separate from durable transaction/workflow identity; the role-neutral slot is resource ownership, not a new lookup authority. |
| F1 | **P/O.** Actual path remains pgwire/application → engine → coordinator/DWC → canonical gateway, with handler/session acceptance and adapter/application retirement. Round seven adds no dependency or owner, only one coordinator aggregate slot. |
| F2 | **P/O.** Unavailable control retains owned redrive and the existing sweep remains independent. D:1297-1301 forbids cache/readiness/expiry from clearing the obligation; D:1331 ensures role changes do not wait for external capacity. |
| F3 | **P/O.** Same live incarnation may retry; reconnect/new process cannot adopt an old private entitlement. Application transaction scope remains separately generation-bound at `application-database.js:514-540`. |
| F4 | **P/O.** FIFO, INSERT, read and reconciliation share the original captured budget. Synchronous role/acceptance transitions add no second full wait; D:1323 expressly prevents a renewed control deadline. |
| F5 | **P/O.** D:1357-1361 adds no queue, result object, ledger, scheduler, remote ACK or cross-session inference. No raw SQL, alternate reader or forced-open path is proposed. |
| H1 | **P/O.** Required red engages the actual first INSERT and loses its response. Added saturation negative must refuse before INSERT, while mixed-role positives must resolve admitted descriptors rather than fail setup (D:1344-1353). |
| H2 | **P/O.** Evidence is coupled to real SQL engine/gateway/SQLite and real pgwire/application consumers. Current application projection remains `application-database.js:180-200`; docs approval does not claim the future source exists. |
| H3 | **P/O.** The cumulative table specifies deadline, retry/recovery, close, late completion and acceptance orderings. D:1340-1342 retains protocol latches around CommandComplete/Ready and disconnect/completion races. |
| H4 | **P/O.** Evidence carries immutable six fields, fixed 15-field initial bytes, advanced row state, invocation/incarnation/claim, slot, envelope and diagnostic role counts (D:1335-1352). |
| H5 | **P/O.** D:1344-1353 requires nonempty real cohorts, durable rows, participant/decision emissions, wire/application results and single releases. All-entitlement and mixed-role capacity tests prevent vacuous positives. |
| H6 | **P/O/LIMIT.** This is a docs-only design approval. It does not certify source foundation `c6d71665…`, implementation, tests, startup, activation, CDC, durable restart behavior or crash survival of undurable requests. |
| O1 | **P/O.** Coordinator owns identity, record/resource/result state; DWC owns generic maps; persistence owns durable classification; handler/session owns local protocol acceptance; adapter/application owns consumer incarnation. One coordinator slot spans the record’s roles. |
| O2 | **P/O.** Typed reader/disposition/private acceptance interactions remain the only owner crossings. Diagnostic role counters and engine/wire projection do not duplicate occupancy or durable authority. |
| O3 | **P/O.** Full-cap refusal and legitimate admitted resolution are paired: new work refuses before INSERT, while existing exact records reclassify in place (D:1303-1310,1344-1353). |
| O4 | **P/O.** Invalid/stale evidence retains the record; fresh exact same-creation evidence resolves it. Stale token/incarnation cannot veto or enter a replacement, and no role-specific capacity can strand fresh evidence. |
| O5 | **P/O.** Pressure is acquired before INSERT/allocation and follows actual operation, attachment, slot and envelope lifetimes. A full entitlement cohort cannot consume a second role pool because no second pool exists. |
| O6 | **P/O.** Existing foreground retry and recovery sweep are the actual release/progress edges. D:1323-1324 and D:1328-1329 preserve them after disconnect and either resolution order; no timer-only new wake is invented. |
| O7 | **P/O.** Wire `I`/`T`, error labels, claim tokens, role diagnostics and cached row views remain projections/consumption capabilities, never durable INSERT/decision authority. |
| O8 | **P/O.** Exact subject, predecessor and prior-report hashes are recorded. D:1335-1353 requires future coupled source fingerprints and semantic refusal/recovery evidence with real counters and bytes. |
| O9 | **P/O.** No cross-session correlation, implicit autocommit escape, boolean force, raw read bypass, second ledger or global barrier is introduced. One slot is existing aggregate resource ownership, not a framework. |
| O10 | **P/O.** Future impact registration must couple coordinator resource/record, DWC disposition, persistence/recovery, engine private result, handler/session, adapter close and application scope, including saturation and both retry/recovery orders. |
| J1 | **P/O.** Slot total and role counters must be nonnegative safe integers with exact sum checked synchronously (D:1282-1285); existing deadline/count/byte guards reject nonfinite, unsafe, negative and overflow domains. |
| J2 | **P/O.** Exact key/six fields and dense 0/1 reader rows remain own data. Slot, envelope, invocation, incarnation and claim are private owner values, not inherited evidence. |
| J3 | **P/O.** Fields are captured once before encode/compare/charge. Same-object synchronous rewrites and fixed-field encoding do not recapture getters after awaits. |
| J4 | **P/O.** Existing strict own-data/prototype boundaries remain; private tokens/slots are owner-created exact objects. Round seven makes no polluted-prototype or arbitrary-host claim. |
| J5 | **P/O.** IDs, modes, numbers, dispositions and projections remain primitive canonical domains; slot/envelope/incarnation/claim are private exact resources rather than boxed/coerced labels. |
| J6 | **P/O.** The fixed-field/intrinsics contract remains scoped to the existing strict boundaries. The slot correction introduces no weaker coercion or unsupported global-intrinsics assertion. |
| J7 | **P/O.** Canonical fixed 15-field initial encoding and idempotency digest remain type-pinned exact bytes. Slot/role/acceptance state is volatile resource metadata and cannot alter the durable key. |
| J8 | **P/O.** One global count and maximum variable-byte envelope are both secured before INSERT/descriptor allocation (D:1271-1289,1321). Reader arrays remain dense bounded 0/1 and invalid multiplicity/accessors cannot grant classification. |

## Bounded approval and required implementation evidence

The proposal is coherent for source implementation without a wider transaction redesign. Future implementation must preserve all cumulative constraints and produce one coupled evidence packet that:

1. fills the global slot pool entirely with live entitlements and proves the next BEGIN refuses before INSERT or identity exposure;
2. fills a mixed-role cohort to the same cap and resolves every admitted descriptor through direct, background, application and server-only paths with no count/byte growth or unrelated release;
3. exercises retry-before-recovery and recovery-before-retry, pending ROLLBACK, close at `I`/legacy `E`, postaccept close, late completion and retained FIFO using real owners;
4. records exact subject/source fingerprints, immutable identity/bytes, durable before/after rows, role counters whose sum equals slots, maximum envelope bytes, operation/attachment lifetimes and single releases.

This verdict authorizes implementation review only. It does not approve `c6d71665e98be03de916705f272a9d6340e4a842`, any future source bytes, tests, production behavior, startup, activation or CDC closure.
