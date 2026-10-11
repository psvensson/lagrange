# BEGIN round 9 — independent bounded design supplement review

## Verdict and scope

**REJECT the round-nine supplement as a complete design contract. Source remains HOLD.** Three grouped findings remain: D9-1 target resource admission/custody, D9-2 full-cohort upgrade progress, and D9-3 scalar-domain consistency across the producer and classifier. This is one category-complete batch, with all 63 requested dispositions below.

The metadata-first SQLite approach is feasible on the installed build. Canonical FOREIGN is now separated from malformed identity, and the explicit scalar restriction correctly withdraws the earlier unpaired-surrogate equivalence claim. The selected current-leader RPC route and ordinary recovery handoff are coherent design directions. Those improvements and unchanged accepted lifecycle/caller/COMMIT clauses are preserved; this rejection does not reopen the accepted BEGIN design or demand that future implementation tests already pass.

Review is documentation/feasibility only. No product, test, design, metadata, Quest log, index or main modification; no cluster, staging, commit or push. The diagnostics use the real installed SQLite and selected existing owner methods, with their limits identified. No new source, startup, merge or corpus approval is implied.

## Exact subjects and evidence

Paths:

- `B` = `/mnt/data/peter/projects/.worktrees/rs-raft-startup-integration-20261011`
- `Q` = `B/solve/quests/replicated-transaction-decision-and-apply`
- `E` = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`
- `D` = `E/begin-design-round9-independent`
- `N` = `D/navigation`, a read-only extraction of immutable, **unapproved navigation snapshot** `86af2cab8b361f777ae7ec1f96793f996043de59`.

| Subject | SHA-256 |
| --- | --- |
| DS: `Q/design-query-begin-uncertain-insert-resolution-2026-10-11.md` | `bd551d60cc2b5c61aacffa59ec93640ee25119784f1196b6e725df90303233c3` |
| P8: `Q/evidence/design-query-begin-uncertain-insert-resolution-round8-56b96438.md` | `56b96438afe3eb83ee8bd887a517ff239279a0ecdb5526b4f68a00b1f2c6da53` |
| P7: `Q/evidence/design-query-begin-uncertain-insert-resolution-round7-3679b87f.md` | `3679b87f4aeb84fd8d9397aac9f73f686e5fcb990c1e61e86df35e9731f91fa5` |
| Author feasibility: `Q/evidence/begin-round9-classification-feasibility.json` | `d152760498062037c344df8f14b3be297624595f2618ac28df990d3e9c6f4f88` |
| PR8: `E/review-begin-uncertain-design-round8-independent.md` | `1c9089a84a37fab440963c685ff9535e95e97dddef8ce38ab6df385942c91a2a` |
| PR5: `E/review-begin-uncertain-source-round5-independent.md` | `b4e08617230af527cbb4c66b7e33eb1b4f0d6f77b78010aa5bc23c7effdd2224` |
| Exact author driver retained from `/tmp/begin-round9-feasibility.mjs`: `D/author-feasibility.mjs` | `87d7ec2fd0528fd50e529c9fddde7b16be64039cfab161f28c70bfdda88dd257` |

`D/provenance.json` verifies these subjects, the native dependency hashes and all 1,916 JavaScript files in N against the actual B bytes: **zero mismatches**. A preliminary `git diff 86af... -- src` displayed six caller-untracked snapshot additions as deletions; that was Git index treatment, not concurrent mutation. Actual file-byte comparison resolved it. The current test correction is not inferred to be part of this navigation pin.

The complete current supplement and its predecessor delta, prior complete PR8 report, accepted P7 clauses and prior PR5 cumulative evidence were consumed. Steering remains AGENTS → rules → router and the named authority/recovery, Quest and verification owners. All ten verification templates and their per-item evidence-path requirement are retained. No hostile-host or mutable-intrinsic expansion is used.

## Preserved improvements and proof limits

1. **D8-1 canonical classification:** DS:1636-1671 now distinguishes INVALID, SAME, FOREIGN, reservation pressure, MISSING and UNAVAILABLE. Remint still requires the actual PK disposition plus canonical FOREIGN. Real SQLite controls separate valid foreign from negative epoch, BLOB text, invalid UTF-8 and invalid enum. An eight-byte invalid mode also returns INVALID when the private predicate is reached. See `D/author-feasibility-rerun.json:cases` and `D/independent-feasibility.json:invalidSameLengthEnum`.
2. **D8-2 native guard subproblem:** the exact driver rerun reproduces the author's JSON **byte for byte**. Under a 1,024-byte input reservation, an 8 MiB stored session returns a 204-byte pressure result with zero predicate calls. An exact 8 MiB stamp permits one predicate call over 8,388,640 input bytes. `D/classification.sql` and full `D/classification-explain.json` preserve the real SQL and opcode program. This establishes conditional metadata-first evaluation, not endpoint admission or total native allocation. SQLite metadata Column flags precede the ordinary session Column/Cast/function. The mutable manifest is excluded from the result and guarded by metadata before comparison.
3. **D8-3 route choice:** DS:1627-1634,1743-1775 selects required-leader OWNER_RPC_REQUIRED, no SQL/follower fallback and direct owner-RPC result consumption. The existing owner-RPC path and current-leader witness provide a viable owner location. The future implementation must explicitly skip the preliminary local read in CF:511, stamp an explicit source for the WITH statement, pass result caps and the private contract, and gate every ordinary prepare path. These are named implementation obligations, not a demand to pass unimplemented tests now.
4. **D8-4 scalar correction:** DS:1716-1739 explicitly rejects unpaired UTF-16 before INSERT allocation, uses canonical UTF-8 and preserves original bytes for equality. The actual invalid-UTF-8 and valid supplementary/NUL-inside controls support that correction. D9-3 identifies two remaining end-to-end domain cases; it does not restore surrogate acceptance.
5. **Advanced state:** DS:1822-1835 preserves a monotonic marker, original immutable six, ordinary transaction-before/page/after/fence reread, missing-progress manifest membership and exactly one COMMIT/no ROLLBACK under stable committed authority. The new native diagnostic returns SAME/0 for an 8 MiB mutable manifest while its private predicate consumes only 48 immutable input bytes. This is a classification feasibility control, **not** a valid complete manifest/recovery execution witness. Prior valid COMMIT and live-client controls remain PR5's scoped evidence; the new source packet must renew them.

## Grouped findings

### D9-1 — HIGH: a sender reservation stamp does not admit the target's receive/native graph

**Categories:** admission, transport, concurrency, resources, owner interactions, canonical bounds.

DS:1779-1794 calculates an originating-process prepaid graph, including expected native copies. DS:1795-1800 then relies on serving QueryExecutor/PartitionService pressure/result owners admitting a request whose *stamped* input reservation was checked. There is no target-owned aggregate byte/count acquisition, no defined pre-receive/parse reservation boundary, and no target token custody/release mechanism. A stamp says how much one origin reserved; it does not establish how much the serving process can hold across different origins or after sender timeout/ACK.

Actual boundaries:

- MI:50-52 converts the received frame to a string and parses its full JSON before target dispatch/admission.
- MI:435-470 ACKs immediately, retains the parsed payload in the envelope/promise, then runs the handler asynchronously. That ACK releases sender queue pressure while target work remains.
- QA:543-555 is an outbound **count** gate. It is not aggregate inbound byte admission on the server.
- PE:691-704 receives SQL/params/output caps; PE:771-780 forwards result limits into executeQuery. Neither a result cap nor a remotely supplied input cap owns the existing parsed request/native graph.
- QB:72-89 checks around iteration and sizes the emitted row after native stepping. It cannot retroactively admit native parameter/transient/UDF Buffer/decoder allocations.
- BIND:1978 binds copied UTF-8 with SQLITE_TRANSIENT; BIND:38 and :1898-1905 convert native BLOB values into copied JS Buffers before the predicate decoder runs. The input byte count in the author JSON is not that overlapping allocation census.

The independent actual inbound-method diagnostic queues four ordinary requests from four origins with 16,384-byte sessions and defers their handler completion. It observes four ACKs and all four parsed requests retained, totaling 65,536 session bytes, before any completion (`D/inbound-retention.json:peak`). This is an owner-boundary witness with a deferred handler double, not a socket/load/heap measurement or a claimed production target-limit breach. The design gap is visible without assuming malicious senders: individually lawful stamps have no defined target aggregate admission.

DS:1805-1809 also requires frame/native/result references to be gone before credit reuse, but sender timeout/cancellation cannot prove remote completion or reference retirement. The serving owner must retain its own accepted obligation and credit until its real completion. Existing request generation and same-record exclusivity do not serialize requests from different origin processes.

**Required design closure:** identify the existing target admission/resource owner, exact count/byte acquisition point covering receive/parse and native work, aggregate bound, typed refusal, and token release/late-result/shutdown handoff. Tie the private SQL contract to that actual target credit; do not treat a wire stamp, output limit, generic WebSocket ceiling or successful transport ACK as credit. Name the explicit WITH-source profile and private statement admission handoff as part of this same interaction. A finite bound derived from an existing admitted outer envelope is acceptable if the document actually identifies and accounts for it. The solution must stay within the permitted existing owners and avoid a new broad payload protocol/ledger.

The accounting model must also remain explicit: DS:1071-1073/P7 charge every simultaneous retained string reference; DS:1792-1794 excludes parameter aliases as copied bodies. A new classification-specific alias model may be proposed, but its exact reference/root charge and scope must be stated rather than assuming the earlier canonical per-reference certificate covers a changed formula. No byte-undercount measurement of the future implementation is claimed here.

### D9-2 — HIGH: upgrade retries can permanently strand an affordable accepted cohort

**Categories:** retry/sweep, pressure admission, completion liveness, release ownership.

DS:1684-1692 and :1812-1818 require each unresolved record to retain its base reservation, acquire additional same-pool bytes to classify a larger stored session, and retry on the rotating cursor until bytes release. DS:1816-1818 claims this avoids full-pool deadlock. It does not identify any completing-work credit or release that is possible when the pool consists entirely of such accepted records.

Concrete schedule: two admitted records have base envelopes B each; the pool is 2B+1; each needs an upgrade B. Each record plus its upgrade fits alone, but free capacity is only one byte. Neither may drop its unresolved exact identity/base debt. Each needs classification before its resolution/release. Rotating the sweep fairly repeats refusal forever. New admission need not occur, and no unfair scheduler or leaked unrelated resource is involved.

`D/independent-feasibility.json:upgrade` instantiates actual existing resource reservations: B=1,835, pool=3,671, total=3,670, count=2, free=1; all eight alternating proposed upgrade decisions refuse and preserve both tokens. This is a **design-rule model atop real current resource tokens**, not a run of an unimplemented upgrade API. Adding a fixed prepaid request amount only changes B; it does not eliminate the schedule. Both records remain individually affordable.

This conflicts with the preserved no-extra-capacity/full-cohort progress contract in DS:1078-1098. A legal accepted cohort must be able to make the completion transition without depending on another identical blocked transition releasing first. The larger-than-pool case is separate: this finding does not require accepting an arbitrarily large value into a smaller pool. Raising configuration/restarting is not completion progress for an otherwise affordable live cohort, and restart cannot preserve the old caller's in-process entitlement.

**Required design closure:** name a bounded finishing allowance or an equivalent same-owner staged release/streaming mechanism that guarantees at least one affordable accepted classifier can complete without weakening retained identity/custody. Define how it is acquired before fresh work can consume it, how selection rotates, and how exact release survives timeout/late completion. Do not erase unknown work or turn pressure into foreign/invalid. Preserve live-client entitlement, exact command identity and original transaction deadline. The new witness must cover the cohort consisting entirely of upgrade waiters, not only pressure relieved by an unrelated record.

### D9-3 — MEDIUM: the declared scalar domain is inconsistent at two actual producer boundaries

**Categories:** canonical input/encoding, collision/refusal semantics, producer/consumer fidelity.

DS:1717-1729 accepts every nonempty Unicode scalar string, preserves NUL and compares original UTF-8 bytes. The frozen feasibility implementation and unchanged INSERT owner do not compose for that domain:

1. **BOM-only identity:** session U+FEFF (UTF-8 EF BB BF) passes the exact scalar admission scan and the actual INSERT enforcer. In the retained author predicate, `new TextDecoder('utf-8', {fatal:true})` strips the leading BOM (AUTHOR:5,24-37). Decoding this session becomes the empty string; scalar validation returns false, so an exact initial row produces INVALID/0 instead of SAME/1. A BOM followed by `x` and ordinary/supplementary sessions pass. A BOM-preserving fatal decoder (`ignoreBOM:true`) returns U+FEFF in the diagnostic; no lossy normalization or digest change is needed.
2. **Leading NUL identity:** sessions U+0000 and U+0000 + `a` pass scalar admission and classify SAME/1 when stored. The actual production INSERT trigger EN:24-42 uses `length(NEW.session_id)>0`, which sees an empty prefix at NUL and rejects both with `SQLITE_CONSTRAINT_TRIGGER: transaction_initial_row_refused`; no row is inserted. NUL inside `a\0b` is a positive control. The feasibility CREATE TABLE omitted this fixed producer trigger, hiding the mismatch.

Evidence is `D/independent-feasibility.json:controls,producer,bomDecoder`, using the exact author SQL/predicate and `installTransactionSchemaEnforcement` from N. Full 15-field initial rows, fixed transaction key and immutable coordinates were used; there was no remint, recovery decision or COMMIT/ROLLBACK emission in these native feasibility cases. This does not allege a new rollback effect.

**Required design closure:** make producer preallocation validation, lawful first INSERT and classification use the same explicitly owned scalar domain. Specify BOM-preserving decoding and align or explicitly supersede the NUL/initial-row producer condition through its existing owner. If a narrower producer domain is chosen, make that supersession explicit before identity exposure; do not leave a supposedly valid input to become uncertain trigger refusal. The user has permitted consideration of a bounded producer refinement, not silent narrowing or an unreviewed schema-owner change.

## Actual route inventory and future implementation gates

These are part of the selected interaction and source acceptance scope, not additional findings just because the proposed code is not implemented:

- Persistence → gateway explicit delivery/coalescing key and immutable read authority → CDC owner RPC → QueryExecutor → QUERY → partition SQLite/admission → fixed result/witness → same creation/recovery owner (DS:1743-1775,1822-1835).
- OWNER_RPC_REQUIRED disables SQL fallback (GR:192-199). OR:410-430 enforces leader mode and uses CONTROL_PLANE_RECOVERY_ELIGIBLE. A recovery-pending leader can serve that route; no READY publication or mutation-admission override is granted.
- CF:464-511 currently performs a preliminary local read even with OWNER_RPC_REQUIRED. The new private query must bypass that stage before evaluation, not merely ignore its result. CF/local merge is not an alternate classifier.
- GN:160-184 recognizes SELECT, INSERT, UPDATE, DELETE, not WITH. The exact private SQL is WITH; the actual resolver returns null without an explicit source and `control-plane:read:sql_transactions` with the explicit READ operation (FEAS:route). Wire this existing source profile deliberately instead of relying on SQL-head inference.
- PA:299-318 currently admits the registered private function as an ordinary sessionless read in the diagnostic. DS:1705-1712 requires new private contract admission. Registration alone cannot enforce it; all ordinary/local/remote prepare paths through the statement owner must refuse that function except the exact admitted owner invocation. Current behavior here is an implementation obligation, not proof that the proposed gate was implemented incorrectly.
- PE:328-344 removal-fences a sessionless QUERY. The selected route must honor that existing refusal and rediscover a lawful owner; do not force open removal/startup admission. “Recovery while mutations are closed” does not authorize bypassing every independent lifecycle fence.
- QP:26-41 carries output caps/deadline; GO must preserve them. Current-leader witness, exact contract/bindings and credit must survive actual request construction. The author requestGraph is an allocation sample, not a runnable production request: its six positional parameters omit the named attempt_key/input_cap in the exact SQL. Future source must instantiate the real binding shape and complete envelope census.
- Original immutable transaction deadline, current pre-FIFO turn budget, cancellation and post-await exact-object/consumer checks remain P7/PR5. A bounded native input is not permission to install a result after expiry or release a live client merely because its invocation ended.

## Evidence aliases

All source line references below are in N unless explicitly marked B dependency. The line-numbered source bytes are immutable 86af navigation, never integrated/source approval.

| Alias | Path |
| --- | --- |
| AUTHOR | `D/author-feasibility.mjs` |
| FEAS | `D/independent-feasibility.json` |
| AF | `D/author-feasibility-rerun.json` |
| IN | `D/inbound-retention.json` |
| CR | `src/query/distributed/distributed-transaction-creation-resources.js` |
| CT | `src/query/distributed/distributed-transaction-creation-contract.js` |
| EN | `src/query/distributed/distributed-transaction-schema-enforcement.js` |
| GQ | `src/control-plane/control-plane-system-table-gateway-query-execution.js` |
| GN | `src/control-plane/control-plane-system-table-gateway-normalizers.js` |
| GO | `src/control-plane/control-plane-system-table-gateway-options.js` |
| GR | `src/control-plane/control-plane-system-table-gateway-read-contracts.js` |
| CF | `src/cdc/cdc-integration-service-authoritative-read-flow.js` |
| OR | `src/cdc/cdc-integration-service-owner-rpc-read-execution.js` |
| QP | `src/query/query-executor-partition-request-builders.js` |
| QB | `src/query/query-result-budget.js` |
| PA | `src/partition/partition-statement-admission.js` |
| PE | `src/partition/partition-service-entry-apply-base.js` |
| MI | `src/transport/message-router-inbound-dispatch.js` |
| QA | `src/transport/message-router-outbound-queue-admission.js` |
| BIND | `B/node_modules/better-sqlite3/src/better_sqlite3.cpp` |

## All 63 cumulative dispositions

PASS means a coherent design obligation or expressly preserved prior scoped coverage. FAIL maps to the grouped findings. FUTURE means the implementation/production witness remains required; it is not an executed pass. Each item has an evidence path or exact prior scoped coverage.

### Admission A1–A7

| Item | Disposition and evidence |
| --- | --- |
| A1 | **PASS entitlement; FAIL D9-3 producer-domain composition.** DS:1104-1187,1322-1331 keeps one preaccept/accept entitlement; PR5:A1 retains application/pgwire coverage. DS:1717-1729 with EN:29 and FEAS:producer admits leading-NUL inputs that the first producer rejects. |
| A2 | **PASS corrected classification; FAIL D9-3 valid-input refusal.** DS:1636-1671 and AF:cases separate canonical foreign from invalid/missing/pressure; only PK+FOREIGN remints. FEAS:controls records the canonical BOM-only row incorrectly INVALID. |
| A3 | **PASS original/control budget distinction; FAIL D9-1 whole-request custody.** DS:429-459,782-789,1761-1775 preserves original timeout and current turn. MI:50-52,435-470/QB:72-89 need admitted target lifetime through late completion, not sender timeout release. |
| A4 | **PASS complete fixed decision shape.** DS:1636-1661 gives exact five own fields, keys, legal tuples and missing/unavailable distinctions. DS:1764-1768 uses direct RPC output; CF:511 must be skipped in future source. D9-3 concerns producer meaning, not a partial consumer census. |
| A5 | **PASS existing wake owner; FAIL D9-2 affordable-progress cycle.** DS:1684-1688 retains the rotating creation sweep; FEAS:upgrade shows fair retries cannot free a pool consisting entirely of retained upgrade waiters. PR5:A5 remains historical. |
| A6 | **PASS post-await freshness.** DS:1772-1775,1822-1835 preserves current leader witness, exact generation and recovery immutable-six/fence revalidation. PR5:A6 retains exact-map/consumer controls; no classification-only acceptance is introduced. |
| A7 | **FAIL D9-1 resource census.** DS:1779-1815 names origin and extra scratch but does not supply target aggregate credit/retirement. IN:peak distinguishes sender ACK from retained target debt. PR5:A7 remains scope-limited diagnostics coverage. |

### Retry Y1–Y7

| Item | Disposition and evidence |
| --- | --- |
| Y1 | **PASS existing sweep invocation; FAIL D9-2 progress.** DS:282-301,1684-1688 and PR5:Y1 preserve sweep after caller retirement. FEAS:upgrade demonstrates that invocation alone does not provide finishing credit. |
| Y2 | **PASS exact unreadable debt; FAIL D9-1 bounded target work.** DS:1668-1671 retains identity for INVALID/MISSING/UNAVAILABLE/pressure; DS:1675-1703 bounds one stored load conditional on credit. MI:52 and BIND:1978 expose the unowned target aggregate/request work. |
| Y3 | **PASS typed exits/retention.** DS:1646-1651,1668-1671,1807-1810 explicitly retains the same obligation on missing, invalid, deadline/cancel/late completion. PR5:Y3/TIMER remains prior scoped exit evidence; target release is D9-1. |
| Y4 | **PASS client/sweep arbitration; FAIL D9-2 mutual capacity suppression.** DS:1321-1331,1802-1809 keeps one record execution and live client debt. DS:1685-1688 supplies no release when all admitted records need upgrades; FEAS:upgrade. |
| Y5 | **FAIL D9-1 aggregate bound; PASS prior finite cohorts.** DS:1259-1308 and PR5:Y5 preserve bounded foreground/sweep/log counts. DS:1795-1800's sender stamp supplies no target aggregate receive/native bound; IN:peak. |
| Y6 | **PASS exact retry/no remint.** DS:1663-1671,1802-1810 preserves delivery identity across uncertainty and duplicate results; DS:1822-1835 retains monotonic advanced marker. D9-3's refusal must retain identity, not become collision. PR5:Y6 prior replay controls remain. |
| Y7 | **PASS counters/ACK semantics.** PR5:Y7 and DS:1617-1620,1663-1671 preserve no false success reset; MI:435-470 makes ACK-before-completion explicit. D9-1 must not reuse capacity from that ACK. |

### Transport T1–T5

| Item | Disposition and evidence |
| --- | --- |
| T1 | **PASS durability distinction; FAIL D9-1 resource equivalence.** DS:1663-1671 requires command-specific collision/classification, preserving PR5:T1's INSERT/CommandComplete distinctions. IN:peak/MI:435-470 shows transport ACK does not retire remote work or credit. |
| T2 | **PASS late identity/consumer fence.** DS:1205-1237,1328-1331,1772-1775,1807-1810 retains the exact record and denies late installation after generation/deadline changes. PR5:T2 remains prior timer/disconnect coverage. |
| T3 | **PASS typed result contract; FAIL D9-3 canonical predicate edge.** DS:1646-1671 supplies owned states; AF proves malformed/foreign separation. AUTHOR:5,24-43 and FEAS:controls show BOM-only meaning still differs across producer/consumer. |
| T4 | **PASS unavailable retention; FAIL D9-1/D9-2 bounded eventual handling.** DS:1630-1634 and OR:356-430 retain the existing owner-RPC route. Input/result limits do not acquire target credit, and pressure retry can cycle (FEAS:upgrade). |
| T5 | **PASS honest witness scope; FUTURE production route.** DS:1839-1886 names actual owners and pg.Client controls. AF is exact native feasibility; IN is actual inbound method with deferred handler double. Neither is an executed production transport/startup proof. |

### Sweep/time S1–S5

| Item | Disposition and evidence |
| --- | --- |
| S1 | **PASS clock/budget preservation; FAIL D9-1 endpoint lifetime.** DS:429-459,782-789,1761-1775 retains the existing clock and original budget; PR5:S1 retains unref/injected-clock proof. Sender expiry cannot imply target native/frame retirement (MI:468-495). |
| S2 | **PASS correct recovery/COMMIT role.** DS:1822-1835 requires ordinary recovery current-state reads, immutable/fence revalidation and one COMMIT for stable committed authority, including missing progress. PR5:S2 remains scoped actual decision coverage. |
| S3 | **PASS durable-versus-disposable split; FAIL D9-2 restart-as-progress escape.** DS:311-335,1328-1331,1807-1810 preserves durable debt and process-local claims. DS:1690-1692 cannot repair the affordable live-cohort cycle by restarting; FEAS:upgrade. |
| S4 | **PASS long transaction versus current turn.** DS:1384-1386,1511-1512,1617-1620 preserves original immutable transaction deadline without treating caller expiry as durable rollback. PR5:S4 remains historical; D9-1 still gates actual resource custody. |
| S5 | **FAIL D9-2 no circular capacity wait.** Fair rotating selection is retained (DS:1685-1688); FEAS:upgrade alternates both tokens eight times without progress although each fits alone. This contradicts DS:1085-1098's full-cohort completion promise. |

### Recovery R1–R5

| Item | Disposition and evidence |
| --- | --- |
| R1 | **PASS exact map/registry owner.** DS:1822-1828 uses the same creation record and exact immutable descriptor before acceptance; DS:1802-1810 retains generation exclusivity. PR5:R1 exact-object map controls remain scoped. |
| R2 | **PASS restart/live distinction, with D9-2 progress failure.** DS:1321-1331 and :1807-1810 preserve live consumer versus server debt. DS:1691-1692 is not authority to reconstruct an expired process's claim or discard retained uncertainty. |
| R3 | **PASS manifest completeness.** DS:1824-1835 preserves before/page/after/fence and every manifest member despite absent progress; invalid/missing/foreign page holds. PR5:R3 is the actual prior complete COMMIT witness; FEAS:largeAdvanced proves projection exclusion only. |
| R4 | **PASS exact idempotent redrive.** DS:1663-1671,1822-1835 preserves no remint from unknown outcome and no ROLLBACK after COMMIT. PR5:R4 retains dedup/replay evidence; private classification does not decide transaction outcome. |
| R5 | **PASS no absent-row completion; FAIL D9-3 supported row recognition.** DS:1649-1651,1668-1671 preserves actual missing as pending. FEAS:controls shows a present lawful BOM row misclassified INVALID; no empty or foreign success is authorized. |

### Concurrency C1–C5

| Item | Disposition and evidence |
| --- | --- |
| C1 | **FAIL D9-1 full allocation admission.** DS:1779-1790 adds origin pre-FIFO charge, preserving prior before-INSERT capacity gate. MI:52/BIND:1978 allocate target parse/bind work without identified target aggregate reservation. |
| C2 | **PASS consume freshness; FAIL D9-1 allocation check-to-act.** DS:1772-1775,1824-1828 revalidates after awaits. QB:73-89 checks emitted result after native work; input cap must be backed by actual target credit before native/receive allocations. |
| C3 | **PASS single semantic winner.** DS:1104-1187,1321-1331,1802-1810 preserves same coordinator/FIFO/generation and synchronous entitlement acceptance. No new durable adjudicator, pin or coordinator is proposed. PR5:C3 remains scoped. |
| C4 | **PASS timer/retirement ownership; FAIL D9-1 remote completion release.** DS:1205-1237,1807-1810 retains exact local obligation through cancel/disconnect. MI:468-495 shows deferred target completion; sender timer cannot clear those roots. PR5:C4 preserved. |
| C5 | **PASS exact record key; FAIL D9-1 endpoint resource key.** DS:1639-1649,1759-1761 binds transaction/delivery keys and authority. DS:1795-1800 lacks a serving aggregate token keyed to the accepted request and its actual lifetime. |

### Formation/degraded path F1–F5

| Item | Disposition and evidence |
| --- | --- |
| F1 | **PASS selected lawful owner path; FUTURE exact routing work.** DS:1743-1768 names gateway→CDC owner RPC→QueryExecutor→partition; OR:410-430 supplies required-leader recovery-eligible routing. CF:511 must be skipped and GN:160-184 explicitly sourced for WITH. No raw alternate reader is approved. |
| F2 | **PASS existing rediscovery; FAIL D9-2 completing credit.** DS:1632-1634,1685-1688 preserves independent existing sweep and transport-unavailable→available schedule (:1872-1875). That wake cannot resolve the full-cohort pressure cycle (FEAS:upgrade). |
| F3 | **PASS safe HOLD; FAIL D9-1/D9-2 bounded supported progress.** DS:1668-1671 preserves refusal and original identity. Target admission and affordable-cohort completion remain missing. OR's recovery eligibility does not authorize bypassing PE:328-344 removal fences. |
| F4 | **PASS original deadline contract; FUTURE production margin; FAIL D9-1 custody.** DS:1761-1775 carries timeout/cancel; QP:26-41 can stamp deadline/caps. No normal-startup timing is claimed and target work cannot be considered released at caller expiry. |
| F5 | **PASS architecture restriction.** DS:1888-1897 prohibits new durable owner/manifest policy/scheduler/ledger/raw escape/global increase. D9-1/D9-2 must be resolved through an executable existing-owner mechanism rather than forced-open fixtures or a broad new transport protocol. |

### Harness H1–H6

| Item | Disposition and evidence |
| --- | --- |
| H1 | **PASS exact predecessor engagement.** D/provenance.json hashes DS/P8/P7/PR8/PR5. AF reruns the exact driver to the identical d152 hash. New counterexamples reach native SQL/trigger semantics and real owner methods, not a module-load failure. |
| H2 | **PASS fidelity labels.** AF/FEAS use deployed SQLite; FEAS:producer installs the real trigger omitted from the author fixture. IN declares deferred handler double/no sockets. PR5's pg.Client/application controls remain prior scope, not rerun by this design review. |
| H3 | **PASS preserved schedules; FAIL D9-2 missing all-waiter schedule.** DS:1883-1886 keeps retry/sweep/expiry/disconnect/shutdown and PR5:H3. DS:1864-1866 tests release by others but omits a cohort whose own classification is required for every release; FEAS:upgrade supplies it. |
| H4 | **PASS full canonical row cases; FAIL D9-3 producer composition.** AUTHOR:108-115/FEAS use the fixed 15-field initial row and exact coordinates; no metadata-as-freshness substitution. Real enforcer rejects leading NUL, and exact BOM bytes classify INVALID. |
| H5 | **PASS nonvacuous positive/refusal pairs; FAIL D9-1..3 closure.** AF valid initial/foreign/NUL/supplementary/malformed/metadata-upgrade controls reproduce. FEAS pairs BOM-only/NUL-leading failures with ordinary and NUL-inside success. D/evaluate-feasibility.py confirms 14 expected observations, not 14 design approvals. |
| H6 | **PASS proof ceiling.** DS:1888-1897 and this report preserve source/startup/cluster/merge separation; PR5 component counts remain historical. Unchanged tests were not rerun to manufacture a whole-runtime acceptance claim. |

### Owner interactions O1–O10

| Item | Disposition and evidence |
| --- | --- |
| O1 | **PASS semantic adjudicator; FAIL D9-1 resource owner gap.** DS:1705-1712 and :1822-1835 keeps partition evidence production, creation adjudication and ordinary recovery. The target aggregate byte/custody concern has no concrete acquisition/release mechanism (:1795-1800). |
| O2 | **PASS typed creation/client handoff; FAIL D9-1/D9-3 boundary composition.** DS:1104-1187 and :1636-1671 retain typed states; actual receive/admission and initial-row scalar producer do not yet satisfy the new contract. MI:52,435-470; EN:29; FEAS. |
| O3 | **FAIL D9-1/D9-2 paired charge/progress invariant; PASS live claimant model.** DS:1802-1810 preserves claim/identity while charging the base, but target custody and full-cohort finishing credit are absent. PR5:O3 same-witness client usability evidence remains scoped and must be renewed. |
| O4 | **PASS stale-then-fresh authority rule; FAIL D9-2 eventual consumption.** DS:1830-1835 holds changed/deleted/foreign pages until current complete authority returns; PR5:O4 preserved. A fresh row cannot be consumed when all exact records wait on each other's upgrade release. |
| O5 | **FAIL D9-1/D9-2 pressure integrity.** DS:1685-1692 refuses over-capacity and retains identity, but origin stamp cannot spend target capacity and fair retries do not create completing credit. FEAS:upgrade/IN:peak show the two distinct boundaries. |
| O6 | **PASS existing wake owner; FAIL D9-2 release path.** DS:1632-1634,1685-1688 retains only existing sweep; no new queue is introduced. DS:1809-1815 releases after accepted completion, which is circular for the full-cohort schedule. |
| O7 | **PASS metrics/projection are not authority.** DS:1663-1671 requires authoritative classification plus actual PK evidence; DS:1822-1835 prevents marker/diagnostics from replacing current recovery authority. Input stamps similarly must not substitute resource ownership (D9-1). |
| O8 | **PASS exact supersession/provenance, with D9-1 accounting clarification.** DS:1617-1623,1716-1739 explicitly supersedes classification/text clauses; D/provenance.json pins actual bytes. DS:1071-1073 versus :1792-1794 must make the classification alias accounting scope explicit. |
| O9 | **PASS actual route inventory; FAIL D9-1 admission completion.** DS:1743-1768 names selected route; CF:511, GN:160-184, PA:299-318, PE:771-780 and MI:50-52 are inventoried above. Source must skip local evaluation, stamp source/private contract and obtain real target credit; no fallback is approved. |
| O10 | **PASS canonical future proof obligations.** DS:1839-1886,1893-1897 requires coupled BEGIN/gateway/CDC/query/SQLite/admission source review and prior canonical controls. D9-3 adds the existing INSERT-enforcer interaction to that scope. No manual-only fixture can replace the canonical runner/impact-pair obligations preserved by PR5:O10. |

### JavaScript/canonical inputs J1–J8

| Item | Disposition and evidence |
| --- | --- |
| J1 | **PASS stored/attempted numeric lattice; FAIL D9-1 aggregate credit.** DS:1653-1659,1735-1739 and AUTHOR:64-77 bound safe canonical integers; required bytes must be safe (:1643-1649). Checked addition is required, but sender arithmetic alone cannot reserve target totals. |
| J2 | **PASS strict own-data result/config contract; FAIL D9-3 producer domain.** DS:1646-1651 requires one dense exact-own-data row and explicit states. PR5:J2 config capture remains scoped. FEAS:producer shows a canonical scalar admitted upstream but refused by actual INSERT. |
| J3 | **PASS once-captured attempt; FAIL D9-3 decoder transformation.** DS:1717-1727 scans captured primitive code units; earlier accessor-once safeguards remain PR5:J3. AUTHOR:5,24-37 strips BOM before nonempty validation despite exact captured bytes. |
| J4 | **PASS own/prototype boundary.** DS:1646-1649 rejects accessor/extra/missing properties; PR5:J4 retains polluted-prototype refusal. No inherited evidence authorizes the classifier, and no global intrinsic-immunity requirement is introduced. |
| J5 | **PASS explicit primitive/state domain.** DS:1636-1661 rejects coerced flags/impossible tuples/unsafe bytes; prior CT/config boxed/exotic refusals remain PR5:J5. The prototype's numeric enum is feasibility representation; future wire enum must be one owned shape. |
| J6 | **PASS existing threat model.** PR5:J6/PR8:J6 and the authority/recovery owner remain binding. Findings use ordinary scalar strings, lawful independent origins, real native types and existing admission methods, not hostile host or intrinsic mutation. |
| J7 | **PASS explicit surrogate supersession; FAIL D9-3 remaining scalar composition.** DS:1716-1739 leaves delivery-key algorithm unchanged and explicitly excludes unpaired UTF-16. FEAS shows BOM-only decode and leading-NUL producer disagreement; neither may silently normalize/remint. |
| J8 | **PASS fixed result/native metadata guard; FAIL D9-1 full preallocation.** DS:1646-1649 bounds result arrays; DS:1675-1703/AF/EXPLAIN establish metadata-first stored loads. Origin/target request, parsed/native/UDF/decoder lifetimes still require actual matching aggregate reservations. |

## Exact reproduction commands and artifact hashes

Commands from B/D as defined above; all output is confined to D. The immutable extraction is diagnostic navigation, not an implementation checkout:

```sh
mkdir -p "$D/navigation"
git -C "$B" archive 86af2cab8b361f777ae7ec1f96793f996043de59 src package.json | tar -x -C "$D/navigation"
ln -s "$B/node_modules" "$D/navigation/node_modules"
node "$D/author-feasibility.mjs" "$D/author-feasibility-rerun.json"
node "$D/independent-feasibility.mjs" > "$D/independent-feasibility.json"
node "$D/inbound-retention.mjs" > "$D/inbound-retention.json"
python3 "$D/evaluate-feasibility.py" > "$D/feasibility-verdict.log"
```

The links/extraction already exist in the retained diagnostics; the first three commands are for clean reproduction. The independent script retains the exact author predicate and SQL prefix, adds edge cases and imports the pinned existing owners. It regenerates `classification.sql` and the complete EXPLAIN output. The evaluator confirms **14/14 expected observations**, including the failures; it does not certify source or design. No process-wide heap/native high-water maximum is claimed.

| Diagnostic | SHA-256 |
| --- | --- |
| `D/author-feasibility.mjs` | `87d7ec2fd0528fd50e529c9fddde7b16be64039cfab161f28c70bfdda88dd257` |
| `D/author-feasibility-rerun.json` | `d152760498062037c344df8f14b3be297624595f2618ac28df990d3e9c6f4f88` |
| `D/independent-feasibility.mjs` | `d5656d55a93d626bfd7474d485abde889984aec1abd21f81b94ae24728a191b2` |
| `D/independent-feasibility.json` | `99e0040e1ceb8d943a61ad871a4886050eb0977781f3ef4413d8f89e0f3527de` |
| `D/classification.sql` | `0de35e9bc2a7dd8be47c5c1c0160e9043256b4a9a6d5121f986e871043f86a68` |
| `D/classification-explain.json` | `e0b2b4c3302760ef24939c3bc2f2655fa51db49bfe3700ab266690e184584e98` |
| `D/inbound-retention.mjs` | `c7f48187ce9e10449e70a31662304dcec62c0ee119d3cda5b1f0e3b718c2be00` |
| `D/inbound-retention.json` | `3137bfd16d59d0c79a4b750f937ec1278742deada268fd6a86407658ae75bf6b` |
| `D/evaluate-feasibility.py` | `3121ce6e8dc5298fba30045bff1a757150e8748e27ef7af2397eaa00ba76338a` |
| `D/feasibility-verdict.log` | `714d43df387fd102276de87b4e0988c5f5e7c04c28fedfc48f6d7a9477f30012` |
| `D/provenance.json` | `5dd0135c19129e28544c058d3d45ecfc4776c5d217c0366678dad4d1bda08893` |
| `D/diagnostics-manifest.sha256` | `859161e7672819f4932b4791eecea421b30bc1d472cd9f02266fddfe30b08318` |

## Source and broader acceptance limits

The narrow B5 scratch correction and all proposed supplement implementation remain unapproved. PR5's historical component controls are preserved at their exact scope; this review did not rerun unchanged canonical behavior or claim ordinary production startup. The reported global static reds remain unwaived: complexity **1,780 > 1,755** and source-file count **29 > 27**. They were not rerun or reinterpreted here. Activation/C3, C17, source integration, production startup/cluster, main/merge and corpus gates remain separate and open.

Approval of a coherent amended design would permit its bounded source phase; it would not approve implementation or production behavior. The present rejection is for the three executable-contract gaps above, not for the absence of future test executions.
