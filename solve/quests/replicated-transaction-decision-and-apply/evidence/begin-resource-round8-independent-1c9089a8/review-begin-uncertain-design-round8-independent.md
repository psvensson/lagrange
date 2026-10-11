# Independent BEGIN design supplement review, round 8

## Verdict and boundary

**REJECT the round-eight supplement at SHA-256 `56b96438afe3eb83ee8bd887a517ff239279a0ecdb5526b4f68a00b1f2c6da53`.** Four grouped findings remain in the proposed classification producer, allocation and delivery interaction. All 63 cumulative checklist items are disposed of below. This is a bounded DESIGN review, not a restart of the accepted BEGIN design and not a source rejection based on tests of unimplemented code.

The following direction is coherent and remains approved at design scope: replace BEGIN's retained mutable row with a bounded authoritative classification; retain the exact attempted identity and monotonic advanced marker; have the existing recovery owner reread and revalidate the immutable six and complete before/participants/after fence; release the creation slot only after exact owner acceptance and no live result. The four findings concern whether the proposed producer and transport actually supply that classification with the preserved semantics and resource bound.

The accepted predecessor, prior identity/pgwire/COMMIT controls and unaffected design clauses retain their bounded approvals. Source implementation remains **HOLD**. The narrow descriptor-scratch correction is frozen and unapproved. No production/source/test/design/metadata/Quest/index mutation, stage, commit, push or cluster run occurred. Only this report and new diagnostics D were written. Reviewer: author-distinct `/root/review_activation_ruling`.

## Subjects and exact provenance

| Subject | Exact identity |
| --- | --- |
| B | `/mnt/data/peter/projects/.worktrees/rs-raft-startup-integration-20261011` |
| Q | `B/solve/quests/replicated-transaction-decision-and-apply` |
| E | `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011` |
| D | `E/begin-design-round8-independent` |
| DS, complete subject | `Q/design-query-begin-uncertain-insert-resolution-2026-10-11.md`, SHA-256 `56b96438afe3eb83ee8bd887a517ff239279a0ecdb5526b4f68a00b1f2c6da53` |
| P7, accepted predecessor | `Q/evidence/design-query-begin-uncertain-insert-resolution-round7-3679b87f.md`, SHA-256 `3679b87f4aeb84fd8d9397aac9f73f686e5fcb990c1e61e86df35e9731f91fa5` |
| PR5, prior complete source review | `E/review-begin-uncertain-source-round5-independent.md`, SHA-256 `b4e08617230af527cbb4c66b7e33eb1b4f0d6f77b78010aa5bc23c7effdd2224` |
| Navigation snapshot, unapproved | `86af2cab8b361f777ae7ec1f96793f996043de59`; not implementation or integration approval |
| Frozen resource correction | `src/query/distributed/distributed-transaction-creation-resources.js`, SHA-256 `d2907a63b57562624763346a71ccc897a014f7a21b548faddb468c54acaae9b9` |
| Frozen test correction | `test/query/transaction-begin-source-adversarial.test.js`, SHA-256 `2992e14a1ce6f1049842ef72fcfba36fe86985b919f3e48fdc1e7d253d767e30` |

The design delta is append-only at DS:1363-1613; all pre-existing text is the byte-identical 1361-line accepted predecessor. `D/provenance.json` verifies both design hashes, PR5, the exact supplied test hash, and 21 production/navigation files against 86af2cab. The supplied test is SHA-pinned separately: the test in 86af2cab has SHA `905d7c0e8f181700ba72d753d88f66f41ce052004542304c7864fe37180eec7e`, so the supplied test is not described as byte-identical to that snapshot. No test was run or approved here. Dependency source hashes are recorded separately from Git source provenance.

AGENTS -> rules -> router, authority-and-recovery, Quest, verification INDEX and the ten matching templates were consulted. Every disposition below provides a design/source/diagnostic path or explicit prior scoped coverage. The trusted-host/strict-own-data boundary is preserved; no intrinsic-immunity or hostile-host requirement is added.

## Independent feasibility evidence and its limits

`D/classification-feasibility.mjs` instantiates the supplement's specified type/byte equality predicates in **one SQLite statement**, using the real generated `SQL_TRANSACTIONS_SCHEMA` and the installed better-sqlite3 engine. This is a diagnostic SQL instantiation, not proposed production implementation or a claim that the author supplied final SQL. It exercises actual native expressions and actual `collectBoundedSqliteRows` with one row and a 128-byte result bound. The resulting three-field row is 120 JSON bytes.

Loaded SQLite reports **3.49.2**, source ID `2025-05-07 10:39:52 17144570b0d96ae63cd6f3edca39e27ebd74925252bbaf6723bcb2f6b4861fb1`. `D/classification-explain.json` records the actual VM program. The same statement with positional placeholders passes the existing SQLParser as a SELECT with three columns (`D/parser-feasibility.log`). That is parser feasibility, not an executed SQL-fallback/QueryExecutor proof.

Positive controls pass for a canonical initial row, a valid foreign row, embedded NUL equality and inequality, and valid multibyte text. The diagnostic also directly invokes the existing CDC authoritative merger with the proposed three-field record. No manually supplied classification flags are used to prove the SQL classifications.

`D/feasibility-verdict.log` records the counterexamples. Its process exits zero because its assertions confirm that the design counterexamples were reproduced; the explicit verdict lines say FAIL. No unchanged 30/30, 12/12 or canonical pgwire suite was rerun while source was held. Their exact earlier scope remains PR5, not current amended-source approval.

A small diagnostic-only SQLite extension queried native memory high-water APIs. This build returns zero for those APIs, so these values **do not measure allocation or prove zero allocation**. D8-2 instead rests on executed bytecode and the exact bundled VDBE allocation path. No heap-peak figure is claimed. All SQLite databases used here are private in-memory diagnostic databases.

## Complete grouped findings

### D8-1 — HIGH — `0/0` conflates malformed immutable data with a valid foreign creation

DS:1424-1427 classifies `immutable_match=0, initial_match=0` as FOREIGN_IDENTITY and permits remint when paired with the producer-specific PK refusal. DS:1440-1448 tests stored types and equality against valid attempted values, but it does not independently establish that **all stored immutable fields are canonical** before deciding foreign conflict. A type failure, invalid domain value or out-of-range number makes the equality false and reaches exactly the same pair as a valid different creation.

The real generated-schema diagnostic produces:

| Stored row variant | Existing canonical initial-row validator | Proposed flags |
| --- | --- | --- |
| Valid different session | true | 0 / 0 |
| `transaction_epoch = -1` | false | 0 / 0 |
| `transaction_mode = 'UNRECOGNIZED'` | false | 0 / 0 |
| `session_id` stored as BLOB | false | 0 / 0 |

Evidence: FEAS `results` cases `valid-foreign`, `malformed-negative-epoch`, `malformed-mode`, `malformed-blob-session`; CT:61-97; DS:1426,1440-1454. The generated schema supplies affinity, not these canonical domains (SCHEMA:17-40). A valid expected caller is not proof that an existing stored conflicting row is well formed. These cases do not require arbitrary host mutation; malformed durable evidence is already an explicit refusal case in the accepted contract.

P7's exact-key, canonical-six-before-comparison contract (DS:353-369, retained unchanged) and DS:1382-1386 explicitly preserve the collision rule. DS:1588-1592 likewise requires malformed SQL-domain evidence to refuse without replacement. The proposed two-flag truth table cannot distinguish those cases under its stated producer predicates. An exact key echoed from the bound attempt is correlation, not stored-row validity.

**Required design correction:** define the producer's canonical-validity outcome separately from equality and preserve typed INVALID for malformed/incomplete/noncanonical stored identity before foreign classification. A valid foreign row plus exact producer PK disposition must remain the positive remint control. No new transaction owner or whole mutable-row read is required. This is a correction to the stated classification predicate, not a demand for future source tests to pass now.

### D8-2 — HIGH for resource closure — A fixed output row does not bound the input, native evaluation or complete request graph

There are two related omissions in DS:1466-1505 and its phase census at :1554-1559.

**Native stored-column allocation occurs before the output collector.** DS:1440-1444 requires `CAST(stored_text AS BLOB)` comparisons. For foreign sessions of 1024, 1048576 and 8388608 bytes, the diagnostic returns the same 120-byte result under the real 128-byte output cap. EXPLAIN nevertheless contains a normal `Column` for `session_id` with `p5=0` followed by `Cast` (instructions 19-20), distinct from the metadata-only `typeof` column with `p5=128` (instructions16-17).

The bundled SQLite implementation makes the consequence explicit:

- SQLC:96718-96742 bypasses overflow content only for the metadata flags; ordinary `Column(p5=0)` calls `vdbeColumnFromOverflow`.
- SQLC:94267-94298 derives the full stored-column byte length, allocates `sqlite3RCStrNew(len+3)` for a large table value, and reads that payload. Its limit is SQLite's existing `SQLITE_LIMIT_LENGTH`, not this classification's 128-byte result budget.
- SQLC:84318-84334 likewise allocates `amt+1` on the other payload path.
- QB:72-89 checks the request before iteration, then obtains the native row at :73 and only afterwards checks deadline, row count and JSON bytes. It cannot retroactively prevent the preceding native allocation or interrupt a single synchronous native step from that later check.

Thus “stored values are not selected” in DS:1556 is not proof that they are not loaded to evaluate the selected predicates. A full advanced mutable value can similarly be referenced by an initial-field comparison unless a producer-enforced lazy guard excludes its materialization first. The document gives no such predicate or pre-load admission owner. The counterexample is within BEGIN's new classification evaluation, before the separate recovery handoff, so assigning later manifest allocation to the existing recovery owner does not resolve it.

SQLite documents byte-length metadata and lazy CASE evaluation mechanisms that can inform a bounded producer, but their exact use and deployed bytecode must be part of the design, not assumed from a small output. Text `length()` is unsuitable as an unqualified byte/cheap-loading substitute: its NUL and loading semantics differ. [SQLite scalar functions](https://www.sqlite.org/lang_corefunc.html), [SQLite CASE expressions](https://www.sqlite.org/lang_expr.html#the_case_expression).

**Variable request representations are also missing from the census.** DS:1402-1408 sends the attempted six/full15 and key as query parameters, yet DS:1556 says the execution phase retains only the existing record/key plus a fixed query result. The actual gateway builds a serialized single-flight key from SQL and parameters (GQ:89-99,116-129; GN:18-34). SQLite binding also creates a V8 UTF-8 representation and uses `SQLITE_TRANSIENT`, which copies the binding (BIND:1978; SQLC:84265-84276). Those lifetimes overlap the existing descriptor and query request; they are not paid for merely by capping the returned row.

Even the diagnostic's economical named-parameter instantiation grows from 144 to 20128 text-parameter bytes and from 2415 to 22399 serialized-key bytes when the session grows from16 to20000 bytes (FEAS `parameterMaterialization`). Positional syntax can repeat the immutable parameters inside both predicates. This is a concrete variable graph, not VM-header accounting. The supplement names a payer for the fixed row but not the admitted bound and release custody for these variable request/binding/key representations.

**Required design correction:** provide a producer-feasible, input-length-derived native evaluation bound before large stored-value loading, and a complete phase/ownership census for parameter arrays/text or byte buffers, serialization, native bindings, returned rows and capture scratch. Name which existing reservation pays each overlap and how deadline/cancel/late completion retains the remaining obligation. Native guards must preserve malformed versus foreign semantics and supported large advanced-state handoff. No new manifest policy, global limit increase or unrelated pool borrowing is requested.

### D8-3 — HIGH for progress — The fixed result does not compose with the current local authoritative path

The diagram DS:1479-1485 lists CDC owner RPC or SQL fallback through QueryExecutor, while DS:1491 claims local-owner, RPC and fallback routes consume the same bounds. The existing local route is materially different:

- GR:145-217 defaults to OWNER_LOCAL_ONLY unless the existing authority chooses another mode.
- CF:464-489 passes only consistency to the local authoritative reader. CF:250-257 calls the local helper without query options.
- CL:200-213 and :256-258 invokes local partition query/admitted DB read directly, rather than the diagram's QueryExecutor result-budget path.
- CF:198-222 merges local rows by the table primary key or `id`; rows with neither are skipped. CF:280-284 returns the merged rows as an available result.

The supplement mandates **exactly** `attempt_key`, `immutable_match`, `initial_match` (DS:1393-1414). Such a valid row has neither `transaction_id` nor `id`, so the existing merger discards it. The independent direct call to this actual helper returns `[]` (FEAS `localCdcMerge`) for the valid 1/1 classification. The available local empty result can then become MISSING under DS:1415, leaving a legitimate initial creation held despite available authority.

This is not a request for a new fallback or a broad CDC retry rewrite. Merely forwarding two fields through `buildGatewayQueryOptions` does not define how the existing local producer retains this non-table-shaped result, enforces its result bounds and returns it without falsely merging away authority. Returning UNAVAILABLE on an unsupported branch is safe, but the design also needs a supported canonical route that actually progresses under the existing routing authority; “all routes use the same options” is presently an incorrect handoff claim.

The remote budget handoff also needs to name the existing representations: SQL-engine select reads nested `queryOptions.budgets.RESULT_MAX_*` (SE:90-101), whereas direct owner-RPC spreads its query options into QueryExecutor execution options (OR:393-405), whose partition builder consumes lower-case `resultMaxRows/resultMaxBytes` (QP:20-40). This is a design endpoint inventory requirement, not a rejection because forwarding code has not yet been written.

**Required design correction:** name the exact existing local/RPC/SQL producer and consuming result contract for the fixed classification, including aggregate/merge behavior, result-budget and original-deadline/cancellation transport. Preserve the existing CDC shared-generation retry/deadline owner; do not add a separate reader or a permanent unsupported-path HOLD masquerading as supported recovery.

### D8-4 — MEDIUM — The claimed SQL/JavaScript equality equivalence lacks a canonical text-binding domain

DS:1435-1458 says byte comparison is the existing JavaScript equality contract, while preserving the earlier identity/encoding domain. CT:70-77,146-156 currently accepts any nonempty primitive session string, including an unpaired UTF-16 surrogate. CT:100-107 encodes with Node Buffer UTF-8. The native driver's text binding uses V8 `Utf8Value` and SQLite `SQLITE_TRANSIENT` (BIND:1978). These are not interchangeable for that accepted input.

The actual diagnostic shows both relevant binding choices:

- Stored session U+FFFD, attempted session U+D800: both pass the current expected identity type/domain gate, and the captured JavaScript strings differ. Node `Buffer.from(attempt,'utf8')` is `EF BF BD`; binding those UTF-8 bytes makes the stored session comparison true. The supplement's proposed byte equality would therefore collapse an existing unequal identity unless this input domain is explicitly resolved.
- Binding the unpaired surrogate as native text instead stores/binds `ED A0 80` in this build. The same native-text predicate returns 1/1, while ordinary driver readback produces three U+FFFD code units and the existing JavaScript immutable comparison is false. Merely saying “bind text instead of bytes” does not establish the claimed equivalence.

Evidence: FEAS cases `replacement-vs-unpaired-surrogate` and `unpaired-surrogate-self`, including native hex, Node UTF-8 hex, JS equality and the actual blob predicate. Exact and differing embedded-NUL cases and a valid supplementary Unicode character are positive controls; they work with byte comparison here and must remain covered. The diagnostic does not assume that all Unicode strings are unsafe or propose collation/coercion equality.

**Required design correction:** define exact parameter bytes and accepted stored/attempted text domains, including non-round-tripping UTF-16/UTF-8 inputs, before declaring the new producer equivalent. Any producer-domain refinement or canonical-byte migration must be an explicit bounded supersession, not a silent change hidden in equality or digest generation. Preserve valid NUL/multibyte behavior, existing delivery identity and malformed-evidence refusal.

## Source and evidence aliases

All product aliases below refer to the verified navigation snapshot unless explicitly called a dependency. DS line numbers refer to the frozen subject above. PR5 is preserved prior scoped coverage, never new source approval.

| Alias | Path |
| --- | --- |
| CT | `B/src/query/distributed/distributed-transaction-creation-contract.js` |
| PV | `B/src/query/sql-query-engine-transaction-persistence-methods.js` |
| RS | `B/src/query/sql-query-engine-transaction-set-methods.js` |
| RA | `B/src/query/distributed/distributed-transaction-recovery-authority.js` |
| GQ | `B/src/control-plane/control-plane-system-table-gateway-query-execution.js` |
| GO | `B/src/control-plane/control-plane-system-table-gateway-options.js` |
| GR | `B/src/control-plane/control-plane-system-table-gateway-read-contracts.js` |
| GS | `B/src/control-plane/control-plane-system-table-gateway-read-strategies.js` |
| GN | `B/src/control-plane/control-plane-system-table-gateway-normalizers.js` |
| CF | `B/src/cdc/cdc-integration-service-authoritative-read-flow.js` |
| CL | `B/src/cdc/cdc-integration-service-local-system-table-routing.js` |
| OR | `B/src/cdc/cdc-integration-service-owner-rpc-read-execution.js` |
| QB | `B/src/query/query-result-budget.js` |
| QP | `B/src/query/query-executor-partition-request-builders.js` |
| SE | `B/src/query/sql-query-engine-select-execution.js` |
| SCHEMA | `B/src/bootstrap/system-table-workflow-schema-definitions.js` |
| BIND | `B/node_modules/better-sqlite3/src/better_sqlite3.cpp`, separately hashed dependency |
| SQLC | `B/node_modules/better-sqlite3/deps/sqlite3/sqlite3.c`, separately hashed dependency |
| FEAS | `D/classification-feasibility.json` |
| EXPLAIN | `D/classification-explain.json` |
| VERDICT | `D/feasibility-verdict.log` |

## All 63 cumulative design dispositions

PASS means the design obligation is coherent, including preserved predecessor coverage. FAIL identifies the grouped amendment gap. FUTURE/LIMIT distinguishes scheduled implementation/production proof. No item treats an unexecuted future test as an executed pass.

### Admission A1–A7

| Item | Disposition and evidence |
| --- | --- |
| A1 | **PASS unchanged entitlement.** DS:1104-1187,1322-1331 and :1543-1548 preserve exact preaccept/accept token, consumer and current incarnation. PR5:A1 supplies prior scoped pgwire/application controls; new classification cannot release a claim. |
| A2 | **FAIL D8-1/D8-4.** DS:1412-1433 names explicit outcomes but 0/0 lacks canonical stored validity and byte equivalence is not established. FEAS malformed and surrogate cases show the deciding predicate gap. |
| A3 | **PASS original/control separation; FAIL native/path bound D8-2/D8-3.** DS:429-459,782-789 and :1511-1512 preserve one current pre-FIFO deadline plus immutable transaction deadline. QB:72-89 and CF:464-489 leave native-step/local transport bound unresolved. |
| A4 | **FAIL D8-1/D8-3.** DS:1396-1427 defines a canonical three-field shape, but CF:198-222 discards it and its 0/0 conflates two meanings. Actual consumers must receive the authoritative complete classification. |
| A5 | **PASS existing owner; FAIL supported local progress D8-3.** DS:1429-1433,1531-1548 retains the existing sweep/recovery wake. Valid local 1/1 currently merges to empty (FEAS); PR5:A5 remains unchanged historical coverage. |
| A6 | **PASS design fence.** DS:1531-1545 requires fresh immutable-six and full before/page/after fence, exact-object acceptance and no release from classification alone. DS:1584-1587 schedules change/delete/stale-then-current cases. |
| A7 | **FAIL D8-2 census.** DS:1597-1602 correctly requests separate maxima and real retained debt, but :1556 omits native evaluation and variable parameter/key/binding lifetimes. FEAS/EXPLAIN and SQLC:94267-94298 are evidence. |

### Retry Y1–Y7

| Item | Disposition and evidence |
| --- | --- |
| Y1 | **PASS owner, FAIL D8-3 reachability.** Existing FIFO/sweep remains sole reentry (DS:282-301,1429-1433); local merger needs a consumable classification for an available row to release HOLD. PR5:Y1 remains scoped. |
| Y2 | **PASS debt retention; FAIL D8-2 bounded query work.** DS:1429-1433 never forgets missing/unavailable work and preserves prior defer budget. Fixed output does not bound full-column loading before the first row (EXPLAIN/SQLC). |
| Y3 | **PASS design exits.** DS:1415-1418,1429-1433,1500-1502 retain typed INVALID/UNAVAILABLE and exact record on budget, cancel or malformed result; PR5:Y3 preserves earlier timer/shutdown exit coverage. D8-1 fixes which exit applies. |
| Y4 | **PASS unchanged arbitration; FAIL D8-3 supported progress.** DS:1321-1331 and :1543-1548 preserve caller/sweep winner and server debt. The local classification must survive its owner boundary to avoid permanent repeated MISSING. |
| Y5 | **FAIL D8-2.** Prior finite cohorts/operation/slot bounds remain DS:1259-1308 and PR5:Y5, but classification's variable native/request graph has no named admitted maximum. DS:1597-1602 future census is not that missing bound. |
| Y6 | **PASS same-command/advanced policy; FAIL foreign replacement D8-1/D8-4.** DS:1384-1386,1425-1433,1509-1545 retains exact key and advanced marker. Only genuinely canonical foreign evidence may retire it; FEAS demonstrates false foreign/equality cases. |
| Y7 | **PASS preserved counter contract.** DS:1429-1433 preserves prior uncertain outcome and retry owner; PR5:Y7 covers no false transport-ACK reset. Fixed flags require semantic classification, not a mere successful query transport result (DS:1412-1427). |

### Transport T1–T5

| Item | Disposition and evidence |
| --- | --- |
| T1 | **PASS separation, FAIL producer validity D8-1.** DS:1390-1392 classifies non-definitive INSERT; :1426,1430-1433 requires the exact PK disposition, never generic ACK. Prior CommandComplete/runtime/durable distinctions remain PR5:T1. Canonical foreign evidence is still missing. |
| T2 | **PASS unchanged late-consumer fence.** DS:1205-1237,1328-1331,1543-1548 preserve retired exact incarnation and server-only debt. PR5:T2/TIMER is retained scoped evidence; new fixed result grants no new consumer authority. |
| T3 | **PASS named result shape intent; FAIL D8-1/D8-3 actual interpretation.** DS:1412-1433 supplies typed classification/refusal outcomes. Existing local merge is a different row contract (CF:198-222); malformed immutable rows need a distinct producer refusal. |
| T4 | **FAIL D8-2/D8-3.** DS:1491-1493 requires typed unavailable if bounds cannot be enforced, but local route/budget shape and pre-result native work are not yet a coherent bounded owner handoff. QB:72-89, CL:200-213, OR:393-405. |
| T5 | **PASS witness intent; FUTURE implementation.** DS:1564-1595 demands actual SQLite/gateway/query execution and pg.Client/TCP. FEAS proves only real native predicate/collector and merger feasibility; parser log proves only parseability. No hand-built flags or transport stub establishes production completion. |

### Sweep/time S1–S5

| Item | Disposition and evidence |
| --- | --- |
| S1 | **PASS retained clock/timer contract; FAIL new-path bounds D8-2/D8-3.** DS:429-459,782-789 retains original absolute budgets and existing unref timer coverage (PR5:S1). QB deadlines surround native iteration, and local transport drops options before the listed collector. |
| S2 | **PASS recovery/COMMIT authority.** DS:1525-1541 gives complete current state to existing recovery, preserves missing-progress member as unknown and redrives COMMIT. Invalid/fence-changed authority emits neither decision; PR5:S2 remains scoped. |
| S3 | **PASS unchanged restart/shutdown.** DS:311-335,1328-1331 and :1543-1548 preserve exact process/consumer retirement; PR5:S3 covers exact map/generation guards. No new durable receipt or synthetic restart identity is introduced. |
| S4 | **PASS separation; FAIL D8-2 pre-result bound.** DS:1384-1386 and :1511-1512 preserve long transaction versus current control turn. Nothing permits original expiry to erase durable debt; native evaluation must still fit the admitted current operation. |
| S5 | **PASS existing selection, FAIL D8-3 path progress.** Existing rotating FIFO/sweep controls remain PR5:S5; DS:1584-1587 specifies returning authority releases HOLD. A valid projected local row must not disappear before that owner sees it. |

### Recovery R1–R5

| Item | Disposition and evidence |
| --- | --- |
| R1 | **PASS design exactness.** DS:1531-1545 requires still-retained immutable descriptor and exact-object recovery acceptance, not replacement by classification. PR5:R1 retains prior map/registry collision guards. |
| R2 | **PASS role/phase preservation.** DS:1321-1331,1543-1548 keeps live result, server debt and process restart distinct; advanced marker is monotonic. No predecessor partial observations are inherited by another incarnation. |
| R3 | **PASS complete recovery population.** DS:1516-1541 names before transaction, participant page, after transaction, fence and authority candidate. Missing progress preserves the manifest member; missing/invalid page refuses. Prior AO/LIFE COMMIT control remains PR5:R3, future renewed in DS:1579-1587. |
| R4 | **PASS redrive owner; FAIL identity retirement D8-1/D8-4.** DS:1425-1433,1509-1545 preserves exact command and no rollback after COMMIT. The producer may not remint from malformed identity or silently change text equality. |
| R5 | **PASS missing-is-pending, FAIL D8-1/D8-3 producer meaning.** DS:1415-1433 keeps actual missing/unreadable rows uncertain. Existing local merge manufactures an empty projection from a present valid row, and malformed stored identity becomes foreign flags. |

### Concurrency C1–C5

| Item | Disposition and evidence |
| --- | --- |
| C1 | **FAIL D8-2 complete admission.** DS:1065-1085,1554-1556 preserves before-side-effect record reservation, but query parameter/key/binding and native stored-column loads lack the corresponding reserved overlap. GQ:89-99, BIND:1978, SQLC:94267-94298. |
| C2 | **PASS fresh consumption; FAIL D8-2 query allocation boundary.** DS:1531-1545 explicitly revalidates after classification/recovery awaits. Fixed result checks occur after native statement execution (QB:73-89), so resource check-to-act is still missing. |
| C3 | **PASS same winner.** DS:1104-1187,1321-1331 and :1543-1548 preserve one coordinator/FIFO, synchronous consumer acceptance and no new pin/coordinator. PR5:C3 remains bounded prior proof. |
| C4 | **PASS explicit retirement ordering.** DS:1205-1237 and :1543-1548 preserve actual caller-timer versus disconnect semantics by reference to earlier rules; PR5:C4/TIMER covers both late-uncertainty orders. No fixed result releases committed/server debt. |
| C5 | **PASS identity key, FAIL D8-2 resource key/custody.** DS:1402-1408 binds exact key and parameters; GQ:89-99 confirms serialization. The serialized request/native bindings need their named reservation and release, not an assumed fixed-result charge. |

### Formation/degraded path F1–F5

| Item | Disposition and evidence |
| --- | --- |
| F1 | **FAIL D8-3 inventory completion.** DS:1479-1493's diagram omits the actual local direct query/merge boundary CL:200-213 → CF:198-222. Recovery reads remain the existing RS:69-90 gateway path; no raw replacement reader is authorized. |
| F2 | **PASS existing rediscovery, FAIL D8-3 live route.** DS:1429-1433,1584-1587 retains the current independent sweep. It needs an available classification producer, not repeated empty results from a shape-incompatible merger. |
| F3 | **PASS typed hold; FAIL D8-2/D8-3 supported bounded recovery.** DS:1415-1433 refuses safely; DS:1566-1578 requires successful same-ID initial control. Native work and local result consumption presently fail that combined design claim. |
| F4 | **LIMIT production margin; FAIL local-bound completeness D8-2/D8-3.** Original/control deadlines remain DS:429-459. No startLagrangeRuntime timing is claimed; the new producer must name its pre-result native and local transport bound before source proof. |
| F5 | **PASS architecture restriction.** DS:1525-1529,1604-1613 prohibits alternate readers, ledger, scheduler, manifest policy and global cap increases. D8-3 requires repair within the actual existing producer interaction, not a forced-open route. |

### Harness H1–H6

| Item | Disposition and evidence |
| --- | --- |
| H1 | **PASS provenance and semantic engagement.** Exact DS/P7/PR5 hashes verified in D/provenance.json. FEAS executes native predicates and the real merger with positive controls; findings are not missing-module failures. No source-round green is claimed for an unimplemented supplement. |
| H2 | **PASS scope labels; FUTURE production transport.** DS:1566-1595 names real gateway, query executor and normal pgwire. FEAS is actual SQLite/collector/merger feasibility, parser log is parse-only; native high-water zeros are explicitly non-measurements. |
| H3 | **PASS scheduled orderings; FAIL native bound D8-2.** DS:1584-1595 preserves change/delete, retry/sweep, timer, close and protocol sequences, with prior PR5:H3 proof intact. A one-row output check cannot establish the whole native-step budget. |
| H4 | **FAIL D8-1/D8-4 semantic field fidelity.** DS:1402-1458 includes full attempt fields, but canonical stored validity and exact binding domain are incomplete. FEAS valid, malformed, NUL and surrogate rows carry all15 fields and use actual SQLite storage types. |
| H5 | **PASS nonvacuous controls; FAIL closure for D8-1..4.** FEAS pairs valid initial/foreign and NUL/multibyte controls with malformed/equality failures; 8 MiB stored text still returns one bounded row. Complete source acceptance remains a future packet (DS:1597-1602). |
| H6 | **PASS ceiling.** DS:1604-1613 and this report distinguish design feasibility from source/startup/merge proof. PR5's component-only approval limits and independent 30/30+12/12/280 counts are preserved historically, not rerun or promoted. |

### Owner interactions O1–O10

| Item | Disposition and evidence |
| --- | --- |
| O1 | **PASS owner identity.** DS:1390-1392,1509-1545 keeps persistence as evidence producer, coordinator as creation adjudicator and ordinary recovery as current advanced-state owner. No competing transaction decision owner is added. |
| O2 | **FAIL D8-1/D8-3 complete boundary.** The three-column producer contract does not distinguish canonical foreign evidence and is incompatible with the existing local table-row merger. DS:1412-1427 versus CF:198-222; FEAS. |
| O3 | **FAIL D8-2 complete paired resource invariant; PASS identity/result preservation direction.** DS:1543-1560 keeps one slot and live claim, but variable request/native work is excluded from the phase census. PR5's same-witness identity/consumer controls remain required in DS:1597-1602. |
| O4 | **PASS freshness rule; FAIL D8-3 release execution.** DS:1531-1541 and :1584-1587 explicitly handles changed then stable authority. Current local result loss would prevent that stable result reaching the deciding owner. |
| O5 | **FAIL D8-2.** DS:1468-1477 retains global limits but a returned-row cap is not native/request admission. Parameter growth and full-value VDBE load precede output enforcement; pressure must not be bypassed to restore progress. |
| O6 | **PASS existing wake/custody, FAIL D8-3 handoff.** DS:1429-1433,1543-1548 preserves the same sweep and no early release. The producer/merge/result-budget path needs an executable consequence through its actual owner. |
| O7 | **PASS projections are not authority; FAIL D8-1 predicate.** DS:1424-1433 consumes producer evidence and PK disposition rather than metrics; DS:1531-1545 prevents historical classification from authorizing later changed state. The producer's malformed/foreign meaning still needs correction. |
| O8 | **PASS exact supersession scope.** DS:1363-1386 names PR5, accepted predecessor and narrow replacement; D/provenance.json verifies actual subject and navigation pins. Descriptor source correction and current test remain unapproved and separately identified. |
| O9 | **FAIL D8-3 actual path inventory.** GS:343-429 reaches CDC local/RPC/fallback owners; CL:200-213 bypasses the depicted QueryExecutor collector and CF merges table-shaped rows. Preserve existing authority rather than silently forcing a different transport. |
| O10 | **PASS cumulative proof intent; design packet must include D8-3 endpoints.** DS:1564-1613 requires actual coupled production witnesses and canonical prior controls. The local/CDC/query-budget interaction must be named in the implementation impact contract; no source-only or manual-only acceptance is approved. |

### JavaScript/canonical input J1–J8

| Item | Disposition and evidence |
| --- | --- |
| J1 | **PASS attempted numeric lattice; FAIL stored validity D8-1.** DS:1445-1448 preserves safe canonical expected integers, but a negative stored epoch still produces FOREIGN flags. CT:61-77 and FEAS demonstrate the missing stored-domain distinction. |
| J2 | **PASS fixed-result own-data gate; FAIL producer canonicality D8-1.** DS:1412-1418 requires exactly three own properties/dense one row; malformed SQL identity must be refused before those well-shaped flags become authority. |
| J3 | **PASS once-captured exact attempt; FAIL byte binding D8-4.** DS:1402-1408 uses the exact prior descriptor/key and :1412-1418 forbids getters. BIND:1978 and FEAS show that exact JS capture alone does not define equivalent native/Buffer text bytes. |
| J4 | **PASS preserved own/prototype boundary.** DS:1412-1418 rejects non-own/accessor/proxy shapes, and earlier strict-own-data refusal controls remain PR5:J4. No global intrinsic mutation requirement is introduced. |
| J5 | **PASS primitive/exotic result domain.** DS:1412-1418,1445-1448 restrict primitive flags/key/numbers; prior CT/config boxed/exotic refusal remains PR5:J5. SQLite storage-type validity is separately D8-1. |
| J6 | **PASS threat-model scope.** Authority-and-recovery:103-111 and prior PR5:J6 remain binding. Findings use ordinary generated-schema data, driver encoding, own result fields and native query behavior; no hostile-host premise. |
| J7 | **FAIL D8-4 equivalence; PASS unchanged digest ownership intent.** DS:1384-1386,1435-1458 promises unchanged identity/bytes, while CT:100-107 and BIND:1978 differ for currently admitted surrogate inputs. Explicit binding/domain ownership is required before supersession. |
| J8 | **FAIL D8-2 complete preallocation; PASS fixed own-array gate.** DS:1412-1418 bounds captured result shape, and :1554 retains earlier admission. Native full-column load and variable parameter/key/binding materialization are not bounded by the fixed row collector (QB:62-99; SQLC:94267-94298). |

## Reproduction and proof ceilings

Exact diagnostic commands (B and D as above):

```sh
gcc -shared -fPIC -I "$B/node_modules/better-sqlite3/deps/sqlite3" "$D/native_census.c" -o "$D/native_census.so"
node "$D/classification-feasibility.mjs" "$B" > "$D/classification-feasibility.json"
node "$D/parser-feasibility.mjs" "$B" > "$D/parser-feasibility.log" 2>&1
python3 "$D/evaluate-feasibility.py" > "$D/feasibility-verdict.log"
```

These execute private SQLite/query feasibility diagnostics and read existing modules; they do not start a cluster, change product source or certify future transport. `specified-predicate-instantiation.sql` and EXPLAIN are regenerated by the diagnostic. Exact selected artifact hashes follow; the complete diagnostic manifest includes the extension and logs.

The unwaived global source gates from PR5 remain **complexity1780 >1755** and **source-file count29 >27**. They were not rerun or reinterpreted by this design review. Existing source, activation/C3, C17, real startup/cluster, merge and corpus gates remain separate and open. No tests of the proposed future implementation are required to pass to approve a coherent corrected design; the blockers above are contradictions or missing owned boundaries in this design itself.

## Diagnostic artifact hashes

| Artifact | SHA-256 |
| --- | --- |
| `D/provenance.json` | `86206d434761d13cffc18f2f25bf5b1834f34ed4ba655635da0eb94cb84288b6` |
| `D/classification-feasibility.mjs` | `09fede8ab666646e5c0f396566b19de7854268211eb1cb057bd6845a72661f21` |
| `D/classification-feasibility.json` | `07a58520c50a33301d9767cc4f5b2cb1096ef406d86a4068d117f7a9ea74c9f7` |
| `D/specified-predicate-instantiation.sql` | `b54227307a3af3b773689c00002c90be2739625614a7af02098c4fc7b2f2e3f9` |
| `D/classification-explain.json` | `ed0ee20922e02d7a2d7bf761a929f224b1789e9a49e4d6eece5375b00a4f268b` |
| `D/parser-feasibility.mjs` | `dcbe07bf20ca51e61abaffe438b8831dbd25b2bd9988c511e7cfe20065b9106a` |
| `D/parser-feasibility.log` | `e96d2a7a89c107c030314b5db07f8a92d107c593d2ad58036b5671f3c2453375` |
| `D/evaluate-feasibility.py` | `210f86f7abbd3757f6bc33c579a4d535bed19465099979f0ccebe051686818aa` |
| `D/feasibility-verdict.log` | `5d6cffdfd86f4200b6f9da3a37e61473c603e7920e2f8cd24275aa8bfac92e14` |
| `D/native_census.c` | `bf51fe2d2a4a1eefdf5edcb05c19533ba128395a18a74e05a5484f70b088813e` |
| `D/diagnostics-manifest.sha256` | `7ee64824466b9fcdcaf86398b4fedcaea1389857591ee6c0e9e64ff49eff0094` |
