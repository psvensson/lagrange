# BEGIN uncertain INSERT resolution design review — round 2

Reviewer: `subagent:cdc_continuation_56` · 2026-10-11

## Verdict: REVISE

The round-two correction closes the original same-attempt delivery, exact-key readback, restart-boundary, and transaction-owned DWC retention defects. It remains a coherent narrow supplement rather than a transaction redesign. Four integration details still prevent implementation approval: an ordinary failed pgwire `BEGIN` retry carries no expected ID even though the proposed reentry requires one; the post-expiry control turn gives two gateway operations the same full relative timeout instead of one shared absolute budget; retained uncertain descriptors and their periodic redrives have no aggregate reservation or volume bound; and the strict reader accepts any nonempty transaction mode as canonical, allowing malformed data to become collision authority.

This verdict reviews the proposal as a design. It does not require the proposed code or future evidence to exist already.

## Bound subject and source ceiling

- Worktree: `/mnt/data/peter/projects/.worktrees/tx1-work-20261010`; base HEAD `e7c89f4b5114c0238312d3831b65889a4622f4e9`, with the preserved wider dirty/untracked transaction work.
- Subject: `solve/quests/replicated-transaction-decision-and-apply/design-query-begin-uncertain-insert-resolution-2026-10-11.md`, exact SHA256 `a43e0a4f5d1e4022277200fb02db6ad23d40165a6e079e85194620da3af37c1b`.
- Prior review: `review-begin-uncertain-design-cdc56.md`, exact SHA256 `814b6550299880637bc3ddbc274b159c69ca4e3cc0abcc97f780c2acd6960e15`.
- Frozen diagnostic: `c56-transaction-evidence-matrix/round4-diagnostic/evidence-manifest.sha256`, SHA256 `9cddb866431a74eb444b839cdce0a022b9b3baeddde37e2b0cdeac8a7779dfbb`; `diagnostic-summary.json`, SHA256 `82f08d7ee657115136c26cf04d3debd736429c97299eed614ecaefdca5aa1d06`.
- Current inspected source fingerprints include coordinator `c4a1ff872a4b2a3766cefe8fbd06768a62b96f1574602a592a3bcd7c65b29314`, recovery `788befbd180bbb70679eae78f201ecf916d88316027770f7dff571a2a6deb98d`, statement FIFO `3d60e0479dd681a0a304740bf804187b003a6aad9fae0a4aefcef505e3158297`, transaction persistence `f514a4445521b846457818f54e3fcd05268688d8469f612d4e5e1fcf57f4a031`, transaction recovery methods `4fdfa146102b7a0704e66f986d65af97ff8ad7aa3dad0d1da3b285b7d20f2137`, statement admission `fc398002ff8b19e2e34681006917112613f232ac73fd0e5aa8d21f08b24f3055`, lifecycle SQL `54d6ccebd11bca1419d8f3054f0d68e2851c72fc61f5e437bd776a646f10a626`, DWC `ba683bea66935c573158dedab2fe387af4e8f14bda4b25aa9a475b47ec9dec73`, gateway options `da68652c630618e49bb1e647e72dd5c26de68b6531b02c969eb3e47788459904`, gateway mutation submission `4c7553da2e6b58f750c1f796c5ad0aff2b0c20a82309f98ca1ce8624f99c04de`, write identity `d8a79c43e47cc9d0c2e49398b6043c20414c67454b8b7ed1089e5b83459d36ee`, pgwire session `a096de319193d84ac4c642759efb6a892cbc4cbc7ef9fb8763b71c8eb3ef7f58`, and application database `2ab2556849da1953cccc2324436745229cd303778aa020613d082885fcb5ca7f`.
- No source, test, metadata, Quest log, or existing evidence file was changed. This report is the only file written.

The production `a01` transaction binding and test-only `20b` scope remain separate. No compatibility, startup, crash-recovery, or implementation claim follows from this docs-only review.

## Round-one B1–B7 disposition

| Prior finding | Round-two disposition |
| --- | --- |
| B1 same-attempt completion proof | **CLOSED at design level.** D:204-238 uses the existing explicit idempotency key, exact retained INSERT bytes, storage PK, serialized apply and exact-key readback. Only specific PK refusal plus a valid exact-key conflicting creation permits re-mint. Generic constraint, inferred completion, timeout, wrong key and MISSING remain uncertain. |
| B2 one creation-state gate | **PARTIAL; finding N1.** D:240-259 names every transaction consumer and separates occupied from usable. It only routes `BEGIN` with the exact expected ID, while the normal pgwire failed-BEGIN path remains idle and supplies no expected ID on its next BEGIN. |
| B3 reachable FIFO reentry | **PARTIAL; findings N1/N3.** D:261-281 correctly names one owned method, the existing session FIFO and the actual periodic sweep, with no invented event. The normal unbound retry is omitted, and the unavailable result's sweep defer/cadence behavior is not defined. |
| B4 process restart | **CLOSED within the stated normal-adapter boundary.** D:283-311 honestly declines cross-process reconstruction, relies on random pgwire/application session domains, never treats MISSING as no-effect, and requires late-row census recovery without a replacement. |
| B5 deadline and post-expiry work | **PARTIAL; finding N2.** D:313-328 freezes the original transaction deadline and correctly separates post-expiry reconciliation from activity permission. Its one `queryTimeoutMs` value is passed independently to INSERT and read, so the actual total can be two full bounds plus FIFO wait. |
| B6 exact-key strict reader | **PARTIAL; finding N4.** D:330-346 supplies exact-key-first, own dense 0/1 rows, one-time data capture and safe numeric checks. It validates `transaction_mode` only as a nonempty string instead of the existing enum, letting a malformed row authorize collision. |
| B7 transaction-owned DWC policy | **CLOSED at design level.** D:348-363 makes REMOVE the generic default, accepts retention only through a private transaction policy and exact candidate in both maps, and requires exact-object checks for every later transition. |

## Blocking findings

### N1 — HIGH — the ordinary same-connection BEGIN retry cannot satisfy the proposed exact-ID reentry precondition

D:251-259 and D:267-269 send only `BEGIN` with the exact expected transaction ID to creation reconciliation. A normal failed pgwire BEGIN does not store that ID in its session: pgwire supplies `expectedTransactionId` only when `session.transactionId` is already set (`src/runtime/pgwire-protocol-handler.js:679-681`), enters a transaction only on successful BEGIN (`:691-695`), and keeps a statement that failed while idle in IDLE (`src/runtime/pgwire-transaction-outcome.js:155-170,215-225`). The next BEGIN on the same still-live connection therefore has the same session ID and no expected ID. The application database path also throws the failed BEGIN and closes its local callback record (`src/query/application-database.js:514-540,593-595`), leaving only the periodic sweep for that adapter.

The single creation gate must state the normal rule explicitly: when operation is BEGIN, `expectedTransactionId` is absent, and the raw owner-key map holds one exact `INSERT_OUTCOME_UNCERTAIN` descriptor for that same live session, reenter that descriptor and return/diagnose its original ID. An explicit different expected ID remains an identity refusal. No public `getTransaction` projection may be used to infer this; the coordinator's raw exact owner binding supplies it. Required witness: real pgwire BEGIN loses the insertion answer, reports typed uncertainty while staying wire-IDLE, then a second BEGIN on the same socket reaches the same descriptor/key/bytes and never mints another ID. Pair it with explicit matching-ID success and explicit wrong-ID refusal.

### N2 — HIGH — the post-expiry “one turn” is two independent full timeouts and excludes FIFO queue time

D:320-324 captures configured `queryTimeoutMs` once and passes it to both redelivery and authoritative read. The gateway treats a supplied `queryTimeoutMs` as a fresh relative timeout for each call (`src/control-plane/control-plane-system-table-gateway-options.js:83-100`). The sweep only enters the session FIFO later (`src/query/distributed/distributed-transaction-recovery.js:255-270`). A blocked FIFO plus a full INSERT timeout plus a full read timeout can therefore exceed the promised one control turn by more than twofold.

Capture one absolute reconciliation deadline before enqueueing the foreground/sweep action. FIFO wait, exact INSERT redelivery, and exact-key read must all spend that one deadline. Recompute safe positive remaining time after FIFO acquisition and again after redelivery; do not launch the read when no budget remains. Passing one deadline-bearing budget to both gateway calls is coherent because gateway options already recompute remaining time from a timeout budget (`gateway-options.js:89-100`); passing the same relative `queryTimeoutMs` twice is not. The evidence must latch FIFO release, INSERT completion and read start around exact boundaries and prove total elapsed work never becomes two full control windows.

### N3 — HIGH — retained uncertainty has no aggregate reservation, byte accounting, or bounded sweep volume

D:242-243 retains the descriptor and D:213-214 retains canonical initial row bytes/key for an unbounded in-process lifetime. Calling this bounded by “one workflow per session” does not bound the number of sessions. DWC's registries are unbounded maps (`src/workflow/durable-workflow-coordinator.js:49-53`). Explicit `idempotencyKey` delivery bypasses the write-identity owner's 4096 held-instance map (`src/control-plane/control-plane-write-identity.js:389-396`), so that existing cap does not cover these retained copies. During a control-plane outage, normal application-database calls create fresh random sessions and discard the local callback record after each failed BEGIN (`application-database.js:203-205,514-540,593-595`), allowing retained descriptors to accumulate.

The existing sweep runs every second and scans every expired nonterminal workflow (`distributed-transaction-recovery.js:245-270,352-363`). D:280 says unavailable/invalid retains the descriptor but does not say whether that result advances the existing defer/backoff owner, which counters/fold key are emitted, or how many retained sessions one sweep may redeliver. An unavailable result treated as successful sweep bookkeeping can retry every descriptor every second indefinitely.

Before the first INSERT, reserve a bounded transaction-owned uncertain-retention slot and its canonical row/key bytes so an ambiguous answer can always be retained. Refuse a new BEGIN before delivery when capacity is unavailable. Release the exact reservation only on ACTIVE establishment, confirmed foreign collision, terminal classified removal, or process retirement; deadline expiry is not release authority. Keep this as volatile coordinator accounting, not a ledger or scheduler. Define how creation-uncertain maps into the existing retryable sweep defer/backoff path, bound work per sweep/cohort, and report retained count/bytes, oldest deadline, attempts and stop reason with folded cadence. Required evidence pairs a low-cap pre-delivery refusal with a legitimate release/reentry and measures repeated normal sessions plus one unavailable sweep window.

### N4 — MEDIUM — the “canonical” immutable field domain admits arbitrary transaction modes and underspecifies the digest bytes

D:337-340 accepts `transaction_mode` as any nonempty primitive string. The existing canonical domain is exactly `AUTOCOMMIT | EXPLICIT` (`src/constants/transactions.js:1-4`). Under D:342-344, an expected-key row with mode `not-a-mode` is therefore considered valid, differs from the attempted mode, and becomes foreign-collision authority. That contradicts the same paragraph's rule that malformed/noncanonical fields are INVALID and must not re-mint.

Use the existing `TRANSACTION_MODE` enum and `isCanonicalTransactionEpoch`; pin transaction ID to the already requested canonical 32-lowercase-hex key, and use safe nonnegative integer domains for timestamps/deadline with the B5 overflow checks. Also define `canonicalInitialRowBytes` as a fixed field-order, fixed primitive encoding of the complete initial row rather than an implementation-dependent object serialization. The wrong-mode, wrong byte encoding, boxed primitive and reordered-object controls must all retain the original descriptor and must not reach collision. This correction stays within the six immutable creation fields and the same INSERT bytes.

## Complete 63-item matrix

`OK` means coherent at proposal level and still requires the future implementation/evidence packet. `REVISE` points to a blocking finding above. `LIMIT` records an explicit scope ceiling rather than a defect.

| Item | Result and concrete evidence path |
| --- | --- |
| A1 | **REVISE N1.** D:240-259 names one gate for BEGIN, parsed statements, direct reads/writes, enlistment, commit/rollback, lifecycle, shutdown and recovery. Exact-ID BEGIN is coherent, but the normal wire retry has no expected ID (`pgwire-protocol-handler.js:679-693`). |
| A2 | **OK.** D:221-231 and D:332-346 separate exact same creation, specific PK conflict, malformed/wrong-key uncertainty and all other uncertain answers. |
| A3 | **REVISE N2.** D:315-328 freezes the original transaction deadline and adds one post-expiry configured bound, but two calls currently receive the same full relative timeout. |
| A4 | **OK.** D:206-231 rejects synthesized/no-effect inference and composes the captured producer answer only with the typed exact-key read state; current completion inference at `gateway-mutation-contracts.js:46-67` is explicitly not authority. |
| A5 | **REVISE N1/N3.** Exact-ID foreground BEGIN and the existing sweep are real triggers (D:267-271), but ordinary unbound pgwire reentry is absent and unavailable sweep disposition/cadence is unspecified. |
| A6 | **REVISE N4.** D:332-346 captures the requested key and six immutable fields once and excludes mutable progress, but arbitrary nonempty mode strings are treated as canonical. |
| A7 | **OK.** D:367-370 requires attempted descriptor/key/bytes, captured answer, read state, both maps and resulting operations; diagnostics remain about the held first ID rather than a prospective replacement. |
| Y1 | **REVISE N1.** The periodic timer is reachable (`sql-query-engine-lifecycle-and-callback-dispatch.js:191-195`; recovery `:352-363`) and matching-ID BEGIN is named, but a normal same-socket retry is unbound. |
| Y2 | **OK.** D:280 retains the exact descriptor on unavailable/invalid evidence; D:315-328 preserves frozen creation metadata across expiry. |
| Y3 | **OK with implementation evidence.** D:251-259 and D:273-281 give typed uncertain, mismatch, collision, stale callback and resolution exits; shutdown is included in the one gate. N3 must add loud capacity/backoff stops. |
| Y4 | **OK.** `reconcileTransactionCreationOwned` is the FIFO-held method (D:263-269); BEGIN and sweep can call it directly from their existing queued contexts without recursively enqueueing. DWC policy runs in registration failure, not as another FIFO waiter. |
| Y5 | **REVISE N3.** One record per session and the session FIFO bound same-session concurrency, but total retained descriptors/bytes, repeated fresh sessions and sweep work are unbounded. |
| Y6 | **OK.** D:216-238 redelivers the identical INSERT bytes/key; storage PK plus the existing entry identity makes late-first and redelivery converge on one row without participant effects. |
| Y7 | **OK.** D:315-328 prohibits identity/epoch/deadline renewal; generic constraint, stale read and uncertainty never enter the mint branch (D:226-231). |
| T1 | **OK.** D:206-231 makes ACK/APPLIED/inferred REJECTED insufficient alone; an exact authoritative row and specific PK result govern classification. |
| T2 | **OK.** D:263-281 and D:357-363 require exact object/map/state checks after each await and prevent a late first result from replacing a newer owner. |
| T3 | **OK.** D:221-231 reads only the specific producer PK refusal as collision evidence; generic gateway error classification remains uncertain. |
| T4 | **REVISE N2.** Existing gateway mutation/read paths are bounded, but their two independent relative bounds do not form one operation budget including FIFO wait. |
| T5 | **OK as future-proof requirement.** D:367-386 requires the real gateway and SQLite row with latched late apply; scripted classification alone cannot satisfy it. |
| S1 | **OK.** The proposal reuses the existing injected coordinator clock and unref recovery interval (`distributed-transaction-recovery.js:352-363`) and adds no timer. |
| S2 | **OK.** D:251-258 excludes uncertain creation from rollback/decision authority regardless of timeout; ordinary transaction decision roles remain unchanged. |
| S3 | **OK/LIMIT.** D:283-311 honestly loses volatile descriptors at process death while preserving durable rows as obligations; no restart reconstruction claim is made. |
| S4 | **OK.** D:315-324 permits bounded settlement after expiry without granting activity or deleting the hold; N2 narrows its time geometry. |
| S5 | **OK.** Mutation/read options use the existing control-plane recovery-eligible gateway path (`gateway-options.js:78-81`); creation becomes ACTIVE only after exact evidence. |
| R1 | **OK.** D:263-281/357-363 enumerate exact map checks, exact removal, same-object ACTIVE, collision removal and advanced-row handoff without overwriting a newer binding; current DWC clobber guard is `durable-workflow-coordinator.js:603-629`. |
| R2 | **OK.** D:283-311 distinguishes live uncertain memory, durable rows and a new-process session domain; pgwire/application IDs are random per connection/call (`pgwire-protocol-handler.js:357`, `application-database.js:203-205`). |
| R3 | **OK.** D:273-276 hands matching advanced state to normal recovery; the required evidence explicitly includes nonempty COMMIT (D:377-378), whose authoritative owner rereads transaction plus participant census (`sql-query-engine-transaction-set-methods.js:65-82`). |
| R4 | **OK.** Same key/bytes and exact descriptor checks make late apply/read/repeated reconciliation idempotent (D:204-238,263-281). |
| R5 | **OK/LIMIT.** D:298-311 says MISSING proves only no currently durable row, mints nothing for the retired session and waits for ordinary census to discover a late row. Cross-process retry is explicitly outside scope. |
| C1 | **REVISE N3.** DWC installs the candidate synchronously before persistence (`durable-workflow-coordinator.js:61-70`) and gateway/PK is the async backstop, but capacity to retain an ambiguous result is not pre-reserved. |
| C2 | **OK except N2 timing.** D:263-281/357-363 requires exact object/map/state revalidation after gateway and read awaits. The same discipline must include the shared absolute deadline. |
| C3 | **OK.** Existing `runTransactionOperation` is a per-session FIFO (`distributed-transaction-statement.js:22-33`); foreground/sweep converge on the one owned classifier. |
| C4 | **OK.** D:263-281 routes timer and BEGIN through the same exact-object gate and makes shutdown/replacement callbacks typed no-ops. |
| C5 | **OK.** Session ID owns FIFO/owner-key contention and transaction ID owns the durable row; D:263-266 checks both maps and both identities. |
| F1 | **OK.** D:204-238 and D:330-346 use the existing SQL transactions gateway INSERT and exact-key authoritative reader; durable census/participant refresh stays with the normal recovery owner. |
| F2 | **OK.** D:269-271 claims only the existing timer and explicit BEGIN, so unavailable control cannot erase identity or rely on an invented event. N3 must bound timer retries. |
| F3 | **REVISE N1.** Matching expected-ID client behavior is specified; ordinary pgwire has no expected ID after a failed BEGIN, and application database exposes no retry on its closed local record. |
| F4 | **REVISE N2.** INSERT + read + FIFO queue do not yet share one absolute control deadline. |
| F5 | **OK.** D:200-202/206-238 adds no ledger, attempt-status API, raw SQL reader, private gateway-state read or local fallback. |
| H1 | **OK.** Frozen round4 diagnostic engages the real first INSERT and observes wrong/incomplete remint and descriptor loss; future latches at D:375-376 require late apply after engagement. |
| H2 | **OK.** D:367-386 requires production SQLQueryEngine, gateway and SQLite; any controlled reply boundary must remain explicitly bounded to response scheduling. |
| H3 | **REVISE N2.** Late-first ordering is explicit, but the future timing witness must also prove one shared absolute turn rather than two full relative timeouts. |
| H4 | **OK except N4 domain.** D:208-214/332-346 carries the attempted six fields, exact bytes/key, completion/read/class/result ID and excludes mutable progress. |
| H5 | **OK.** D:367-386 requires nonempty before/after durable rows plus participant/decision operations, including genuine advanced COMMIT and wrong-key/malformed negatives. |
| H6 | **OK/LIMIT.** D:388-389 holds source implementation; the packet is design approval only and makes no startup/crash certification claim beyond the explicit restart schedule. |
| O1 | **OK.** Transaction coordinator owns identity/FIFO/gate, SQL persistence owns classification, gateway supplies delivery/read evidence, and DWC consumes a private policy (D:204-249,348-363). |
| O2 | **OK.** Exact INSERT answer, four-state exact-key read and private REMOVE/RETAIN policy are typed separate interactions; caller booleans cannot grant retention. |
| O3 | **OK.** D:372-380 pairs invalid/wrong evidence refusal with exact initial and advanced recovery in the same required matrix. |
| O4 | **OK.** D:273-281 requires unavailable/invalid retention followed by fresh exact evidence and normal owner reentry. |
| O5 | **REVISE N3.** Same-session FIFO prevents amplification within one session, but fresh sessions can grow retained state and sweep load without a pre-reserved cap. |
| O6 | **OK/LIMIT with N3 cadence correction.** The proposal honestly uses explicit BEGIN and the existing timer only; no gateway event is invented. Timer-only liveness is an explicit ceiling, but unavailable retries still need bounded defer/report semantics. |
| O7 | **OK.** Error labels, cached rows, expected IDs and synthesized completion are evidence/projections only; exact persistence owner classification decides (D:206-231). |
| O8 | **OK as future requirement.** D:367-386 binds source path behavior, descriptor/key/bytes, maps and before/after effects; the implementation packet must add exact source/control fingerprints. |
| O9 | **OK.** D:200-202/216-231 prohibits alternate remint, force/boolean authority, attempt-query API and raw reader fallback. |
| O10 | **OK with findings added to scope.** D:367-386 requires coupled coordinator/DWC/persistence/recovery witnesses. Landing metadata must also register pgwire unbound retry, capacity reservation and shared-deadline tests. |
| J1 | **OK except N4 canonical subdomains.** D:325-328 rejects nonfinite, unsafe, fractional, `-0` and addition overflow. Use existing epoch/mode predicates and safe timestamp domains. |
| J2 | **OK.** D:332-340 requires own requested key, all six own fields and own dense 0/1 array elements. |
| J3 | **OK.** D:208-214/332-340 captures canonical initial bytes, producer answer, array slot and row fields once before hash/compare/policy. |
| J4 | **OK.** D:332-340 rejects inherited/accessor/prototype-polluted evidence; no broader arbitrary trusted-host claim is introduced. |
| J5 | **REVISE N4.** Primitive/boxed refusal is present, but transaction mode is validated as a generic nonempty string instead of the existing enum. |
| J6 | **OK at design level.** D:332-340 requires own data descriptors, no iterator/accessor/coercion, matching the existing strict-own boundary rather than inventing a wider host model. |
| J7 | **REVISE N4.** The tuple is type-pinned and SHA-256 is fixed (D:208-214), but `canonicalInitialRowBytes` needs fixed field order/primitive encoding so object serialization order cannot define identity. |
| J8 | **OK.** D:332-340 rejects length >1, holes, inherited/accessor elements and avoids iterator materialization before exact 0/1 cardinality. |

## Required bounded revision

One short round-three section can close all four findings without adding a ledger, scheduler or broader transaction state machine:

1. route unbound BEGIN on the same live session and exact retained owner binding to the original descriptor; keep explicit wrong-ID refusal;
2. use one absolute reconciliation deadline captured before FIFO enqueue and recompute remaining time before INSERT and read;
3. pre-reserve a bounded count/byte slot before first delivery, release it only by exact classified lifecycle events, and map unavailable sweep results into the existing bounded defer/folded diagnostics; and
4. use the existing transaction mode/epoch domains and define fixed ordered canonical initial-row bytes.

The evidence matrix should add real pgwire unbound reentry, low-cap multi-session refusal/release, one shared FIFO+INSERT+read budget, arbitrary-mode INVALID/no-remint, and a fixed digest vector. The existing late apply, restart MISSING, advanced nonempty COMMIT, exact-candidate race and before/after durable-row requirements remain necessary.
