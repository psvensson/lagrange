# Independent BEGIN uncertain-insert design review — round 6

**Verdict: REVISE.** The round-six amendment closes the byte-pool transition deadlock, completes the uncertain/direct/retry acceptance state machine, and closes the protocol-session retirement race. One resource defect remains: descriptor and live-result-entitlement counts are still separate capped populations, but the role transition reserves no future entitlement slot. A full entitlement population can therefore block or overflow an admitted descriptor’s resolution even though its maximum byte envelope was prepaid. This is the complete finding round under the retained 63-item bar. Missing implementation is not a design rejection.

## Exact subject and evidence

- Subject `solve/quests/replicated-transaction-decision-and-apply/design-query-begin-uncertain-insert-resolution-2026-10-11.md`: independently verified SHA256 **07ad92019e02aa2bff559778bd1894f6b5e77fcf8639e35a1d70794160761cd1**.
- Preserved round-five subject `evidence/design-query-begin-uncertain-insert-resolution-round5-44e72047.md`: verified SHA256 **44e72047a3319b020e3c77e3586ef8bcaa0282cd3231ccdd52d74b8028a9f326**.
- Prior independent report `test-output/continuation-20261011/review-begin-uncertain-design-round5-cdc56.md`: verified SHA256 **c6fa50e11e4d55b347e6315b68f0ede424f9d7fb1ef277dfbf6b1ff92fff9b40**.
- Source navigation tree remains T HEAD `e7c89f4b5114c0238312d3831b65889a4622f4e9`. The separately reviewed future implementation foundation `c6d71665e98be03de916705f272a9d6340e4a842` exists but is not approved by this docs review. Actual production owner paths cited below retain the same interaction locations.
- Retained diagnostic manifest remains `9cddb866431a74eb444b839cdce0a022b9b3baeddde37e2b0cdeac8a7779dfbb`; all four files including `diagnostic.log` passed in the preceding independent round. It remains old-source evidence.
- Read the complete superseding proposal, prior report, actual coordinator/FIFO/DWC/persistence/recovery owners, pgwire handler/session/adapter, failed-outcome mapping and application-database transaction wrapper. AGENTS → rules → router and the ten instantiated verification categories remain the review bar.
- Docs only. This report is the only file written. No source, test, Quest log, metadata, C17, activation or runtime file was changed or executed.

## R5-1 through R5-3 disposition

| Correction | Disposition | Evidence |
| --- | --- | --- |
| R5-1 maximum transition byte envelope | **REVISE count contract only; byte contract approved** | D:1051-1087 reserves the maximum simultaneous byte footprint before INSERT and performs one synchronous same-record rewrite with no second byte reservation. This closes the prior aggregate-byte deadlock. D:1089-1093 keeps descriptor and entitlement counts separate and attempts a decrement/increment transition without pre-reserving the target count; R6-1 remains. |
| R5-2 complete acceptance state machine | **APPROVE as proposed** | D:1102-1133 names WAITING, UNCERTAIN_ANSWERED, SUCCESS_CLAIMED, ENTERED_ACTIVE and server/recovery states. D:1135-1175 defines the actual no-await handler/coordinator/local-T linearization after CommandComplete enqueue and before ReadyForQuery, with connection destruction and Ready suppression for post-tag refusal. D:1177-1198 gives application-database its distinct in-process acceptance before projection/callback. |
| R5-3 incarnation and close arbitration | **APPROVE as proposed** | D:1202-1240 binds an exact private adapter/application incarnation, retires it synchronously before session deletion/rollback, and gives close-wins, install-wins and post-accept cleanup explicit results. This matches current handler destroy `pgwire-protocol-handler.js:165-180` and adapter close `postgres-wire-adapter.js:276-305`. |

## Finding — one category-complete round

### R6-1 — HIGH — separate descriptor and live-result count caps can still deadlock the role transition

Round five keeps separate configured count limits for operations, attachments, descriptors and result handoffs (D:839-851). Round six preserves those counts and says the same owner atomically decrements `uncertain-descriptor count` and increments `live-result-entitlement count` when the record changes role (D:1089-1093). Unlike the byte envelope, no live-result count slot is reserved when the descriptor is admitted.

A reachable legal state therefore has `maxUncertainTransactionCreations` live result entitlements and the same separately allowed number of uncertain descriptors. Resolving any live-consumer descriptor requires entitlement count `max + 1`. The implementation must either exceed the declared cap, refuse/retain the resolved descriptor indefinitely, or silently choose `SERVER_RECOVERY_ONLY` despite a current live consumer. None preserves the design. Decrementing the descriptor counter in the same turn does not create room in the distinct entitlement counter.

Use one role-neutral creation-record slot that remains owned as the same record moves from descriptor to entitlement/server recovery, with per-role values as diagnostics rather than independent admission caps; or reserve the future entitlement count token with the descriptor before INSERT and release it only when the exact incarnation becomes server-only/terminal. The correction must retain early refusal and avoid reducing descriptor capacity accidentally through an undocumented two-slot multiplier.

Extend the full-capacity witness with a count-saturation case: fill live entitlements to their configured cap, separately admit the allowed descriptor cohort, resolve one while its consumer is live, and prove bounded forward progress without exceeding any configured count, discarding client delivery, or waiting for an unrelated entitlement to retire. Repeat for direct success, background ACTIVE_READY and application acceptance.

## Full 63-item checklist

Legend: **P/O** means coherent proposed contract with future implementation/evidence obligations; **BLOCK R6-1** is the remaining count-transition defect; **LIMIT** is an explicit proof boundary, not a rejection by itself.

| Item | Disposition and concrete evidence path |
| --- | --- |
| A1 | **P/O.** The accepted single creation gate remains D:240-259 across BEGIN, statement/use, enlistment, COMMIT, ROLLBACK, lifecycle, shutdown and sweep. B4-3 D:964-1003 distinguishes occupied creation from entered block. Actual paths remain `distributed-transaction-coordinator.js:230-245,469-520,555-557`, `distributed-transaction-statement.js:48-103`, and `sql-query-engine-service-lifecycle-execution.js:109-123`. |
| A2 | **P/O.** D:78-118,204-238 and P2 D:690-729 preserve exact same creation, producer-specific PK collision, terminal no-effect, invalid/wrong-key/incomplete and advanced same-creation classifications. Round six changes no evidence authority. |
| A3 | **P/O.** N2 D:438-461 captures one turn deadline before FIFO; B4-1 D:830-890 retains that operation/deadline after caller expiry. No result/acceptance transition renews identity or budget. |
| A4 | **P/O.** Typed gateway/reader/DWC outcomes remain, and R5-2 adds exact delivery states and private acceptance tokens at D:1102-1133. B4-3 keeps the three-state engine projection. Actual current projection is `sql-query-engine-statement-admission.js:138-145`. |
| A5 | **P/O.** Same-session BEGIN and existing sweep remain real reentry edges. UNCERTAIN_ANSWERED now survives a normal answer; direct/retry claims have one acceptance path; retired consumers become SERVER_RECOVERY_ONLY (D:1117-1133,1202-1240). |
| A6 | **P/O.** Every acceptance compares exact record/token, IDs and consumer incarnation (D:1113-1115); handler rechecks phase/session/incarnation/type/ID/token after engine await (D:1141-1149); close/result compare synchronously (D:1211-1224). |
| A7 | **P/O.** Existing retained-resource diagnostics remain required; round-six states add record role, consumer incarnation, source and acceptance token/state. Full-cap evidence must expose both configured role counts to detect R6-1. |
| Y1 | **P/O.** Existing unref recovery sweep and foreground same-session BEGIN remain the only wakes (N3 D:505-527; `distributed-transaction-recovery.js:352-370`). Result acceptance adds synchronous interactions, no scheduler. |
| Y2 | **P/O.** Unavailable/invalid reads retain exact descriptor and frozen metadata. Recovery turns remain deadline bounded; no result state resets the original deadline. |
| Y3 | **P/O.** WAITING→UNCERTAIN_ANSWERED closes the normal uncertain-answer gap; stale/refused claims, close, server-only and terminal states are loud. R6-1 requires pressure on the target count to be refused before initial admission rather than discovered during resolution. |
| Y4 | **BLOCK R6-1.** FIFO/sweep/acceptance contain no wait cycle and the byte envelope cannot self-block, but a full independent entitlement count leaves an admitted descriptor without a legal target role. |
| Y5 | **BLOCK R6-1.** Operations, attachments, descriptors, entitlement roles, bytes and sweep batch are individually bounded. The combined count arithmetic does not guarantee that every admitted descriptor can transition while another separately capped cohort remains live. |
| Y6 | **P/O.** Same INSERT key/bytes remain idempotent; exact claim token makes direct/retry success once-only; stale workflow/claim cannot enter a replacement session. |
| Y7 | **P/O.** Timeouts, uncertain answers, acceptance and close do not remint, reset deadline or change createdAt/epoch. |
| T1 | **P/O.** ACK/noHandler never becomes INSERT proof. Success claim is created only after the persistence classifier’s existing canonical evidence and still requires current workflow recheck at acceptance. |
| T2 | **P/O.** Exact record/revision/token/incarnation checks fence late classification, close and replacement. CommandComplete enqueue is explicitly local, not remote ACK (D:1141-1167). |
| T3 | **P/O.** Specific PK conflict and typed mutation/read states remain canonical. Delivery states describe consumption only and do not reclassify persistence. |
| T4 | **P/O.** Undeliverable work becomes SERVER_RECOVERY_ONLY under the existing sweep; handler post-tag refusal destroys the connection and suppresses Ready, avoiding indefinite/misleading live protocol state (D:1152-1175). |
| T5 | **P/O.** D:1191-1198 and D:1234-1240 require deterministic real handler/adapter/application schedules at every relevant boundary. Future production pg.Client evidence must observe frames and ReadyForQuery, not scripted booleans. |
| S1 | **P/O.** No timer is added; existing recovery interval remains the injected/unref background owner (`distributed-transaction-recovery.js:352-370`). Acceptance and retirement are synchronous. |
| S2 | **P/O.** UNCERTAIN_ANSWERED/SUCCESS_CLAIMED are delivery states only; they grant no COMMIT, rollback or participant authority. ENTERED_ACTIVE requires exact workflow recheck and local protocol entry. |
| S3 | **P/O.** Exact consumer incarnation distinguishes socket/application retirement from process shutdown. Process loss retains the prior honest durable-census ceiling; no token crosses process identity. |
| S4 | **P/O with BLOCK R6-1.** Foreground expiry leaves bounded server debt and legitimate settlement no longer waits on bytes. Separate target-role count fullness can still stall otherwise legitimate resolution. |
| S5 | **P/O.** Canonical gateway CRITICAL mutation/read and existing sweep remain usable while ordinary transaction activity is closed; no readiness/cache fallback is introduced. Actual gateway calls remain `sql-query-engine-transaction-persistence-methods.js:136-229,305-318`. |
| R1 | **P/O.** Same-object rewrite and exact token protect newer workflow/session state. Advanced rows still transfer unchanged to ordinary recovery; stale callbacks cannot release successors. |
| R2 | **P/O.** Live pending, live delivery claim, server-only record, durable restart census and new-process session remain distinct. |
| R3 | **P/O.** P2’s general advanced-row domain and nonempty COMMIT/participant preservation are unchanged. Round-six result states do not overwrite advanced mutable fields. |
| R4 | **P/O.** Exact replay, same object, one acceptance token, synchronous close arbitration and no recreated handoff make delivery idempotent. |
| R5 | **P/O.** MISSING alone remains nonauthoritative; exact terminal no-effect pairing and honest restart semantics are unchanged. |
| C1 | **BLOCK R6-1.** Operation and maximum byte envelope reserve before FIFO/INSERT allocation. Target role count capacity is not secured before the mutation can become owed. |
| C2 | **P/O.** Handler and application recheck exact private token/incarnation after await; acceptance and close final rewrites have no await. Stale/refused post-tag path closes the socket. |
| C3 | **P/O.** Foreground retry and recovery sweep share the one session FIFO/record. Acceptance is a synchronous owner interaction, not a competing creation lane. |
| C4 | **P/O.** Uncertain answer, direct result, retry result, close, handler failure and shutdown now have explicit exact-token transitions. The latch matrix covers their orderings. |
| C5 | **P/O.** Session/consumer incarnation/invocation/acceptance token are private volatile identities distinct from durable transaction/workflow ID. Existing owner-key lookup remains canonical. |
| F1 | **P/O.** Actual path remains pgwire/application → engine → coordinator/DWC → canonical gateway, with handler/session acceptance and adapter/application retirement added as one coupled interaction. No cached readiness dependency appears. |
| F2 | **P/O.** Unavailable control retains exact owned descriptor; background sweep remains independent. Byte/accounting transitions no longer wait on global headroom, subject to the count fix. |
| F3 | **P/O.** Same live incarnation can retry; reconnect receives a new private incarnation/session and cannot consume the old token. Application transaction scope has its own generation record (`application-database.js:514-540`). |
| F4 | **P/O.** One reconciliation deadline still includes FIFO, INSERT and read. Synchronous protocol acceptance adds no wait or budget refresh. |
| F5 | **P/O.** No raw SQL, alternate reader/ledger, remote ACK, forced-open state, retry scheduler or cross-session inference is added (D:1242-1250). |
| H1 | **P/O.** Retained semantic red engaged the INSERT and lost response. Future correction witness must add the exact count-saturation transition rather than a setup-only pressure failure. |
| H2 | **P/O.** Required paths are real SQL engine/gateway/SQLite and real pgwire/application owners. Current handler ordering is `pgwire-protocol-handler.js:619-669,691-697`; application projection currently occurs inside `executeCanonical` at `application-database.js:180-200`. |
| H3 | **P/O.** D:1191-1198 latches after engine success, before tag, between tag/acceptance and before Ready; D:1234-1240 latches close around every role transition. Add count-full direct/background/application schedules for R6-1. |
| H4 | **P/O.** Evidence must record immutable six fields, complete 15-field bytes, general advanced row, record/token charge, role counts, invocation, consumer incarnation, source and acceptance token/state. |
| H5 | **P/O with BLOCK R6-1.** Durable before/after rows, participant/decision effects, frames and resource counters are required. The positive population must include a nonempty full entitlement cohort plus separately admitted descriptors. |
| H6 | **P/O/LIMIT.** This approves only coherent proposal portions. It does not certify source foundation `c6d71665…`, implementation, startup, activation, CDC, crash survival of undurable requests or production behavior. |
| O1 | **P/O.** Coordinator owns record/resource/result state; DWC owns generic maps; persistence owns classification; handler/session owns local protocol state; adapter/application owns consumer incarnation. Interactions are named and narrow. |
| O2 | **P/O.** One private acceptance token crosses engine→pgwire/application; one synchronous coordinator interaction consumes it. Projection does not duplicate workflow authority. |
| O3 | **P/O with BLOCK R6-1.** Byte-pressure refusal and legitimate full-byte-pool resolution are paired. Count-pressure refusal must likewise occur at initial admission while preserving a legal full-count recovery positive. |
| O4 | **P/O.** Stale/invalid evidence retains; fresh same-creation evidence resolves; stale token/incarnation cannot veto or enter a replacement. |
| O5 | **BLOCK R6-1.** Preallocation and actual operation/byte lifetimes are coherent, but per-role count caps lack a progress-safe ownership transfer. |
| O6 | **P/O.** Existing sweep and foreground retry fire; normal uncertain answer now leaves a live entitlement; close converts it server-only. No dead registered wake remains after the count correction. |
| O7 | **P/O.** Wire I/T, acceptance token and application generation are projections/consumption capabilities, never durable INSERT or decision authority. |
| O8 | **P/O.** Exact subject/prior/report/diagnostic hashes are retained. Future packet must fingerprint the full coupled source and count-saturation negative/positive witnesses. |
| O9 | **P/O.** No correlation by SQL, credentials, address or time; no implicit autocommit escape, force switch or alternate owner. |
| O10 | **P/O.** Future impact registration must couple coordinator record/resource, DWC disposition, persistence, recovery, engine private result token, handler/session, adapter close and application scope. |
| J1 | **P/O with BLOCK R6-1.** Byte/deadline arithmetic is safe and target scalars validated. Count transition must also prove checked nonnegative totals and cap compliance without overflow or implicit cap waiver. |
| J2 | **P/O.** Producer/read arrays/rows remain own dense data; private result/incarnation/token fields are exact captured values, not inherited evidence. |
| J3 | **P/O.** Fields are captured once before compare/charge/transition. No accessor is invoked by fixed encoding or exact-token state changes. |
| J4 | **P/O.** Existing strict-own-data/prototype boundary remains; private exact objects are generated by owners. No arbitrary hostile-host claim is added. |
| J5 | **P/O.** IDs/modes/numbers/dispositions/projections/sources are primitive canonical domains; incarnation and acceptance token are private exact objects rather than coerced labels. |
| J6 | **P/O.** Fixed-field/intrinsics contract remains scoped to existing strict boundaries; no unsupported global-intrinsic assertion appears. |
| J7 | **P/O.** Fixed canonical row/key encoding vectors remain unchanged. Acceptance/incarnation tokens are private and do not alter hashes or become durable identity. |
| J8 | **BLOCK R6-1.** Count and maximum variable-byte footprint must both be secured before INSERT. Byte preallocation is now complete; future-role count capacity is not. |

## Required bounded correction

Preserve the entire R5-2 and R5-3 amendment and the R5-1 maximum byte envelope. Replace the separate transition-time entitlement admission with one of these equivalent owned forms:

1. one role-neutral creation-record slot reserved before INSERT and held while the same record is descriptor, live entitlement, claim or server-only, with per-role counters diagnostic only; or
2. an exact future-entitlement count reservation acquired with the descriptor before INSERT and transferred/released by the same guarded token.

State the resulting configured-count semantics explicitly and add the cross-role saturation witness. Then the bounded BEGIN proposal is ready for source implementation review; no wider transaction redesign is required.
