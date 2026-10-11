# BEGIN round 10 — independent bounded design review

## Verdict

**REJECT the complete round-ten supplement; source remains HOLD.** This category-complete round has four grouped findings:

- **D10-1, high:** grant expiry makes server reconciliation impossible after the original transaction deadline.
- **D10-2, high:** the exact result and credit-request shapes omit fields required by their own immutable-six and grant-binding contracts.
- **D10-3, high:** one response slot and the stated grant/expiry transitions do not close the endpoint resource lifetime across competing origins, callbacks and late delivery.
- **D10-4, medium:** blanket missing-trigger incompatibility conflicts with the lawful empty first-install path unless explicitly scoped to an already-originated generation.

The protected completion allowance fixes the prior full-cohort arithmetic. The BOM-preserving decoder and byte-length INSERT condition fix the two tested scalar mismatches. The preliminary-key restrictions, canonical FOREIGN plus definitive PK requirement, immutable identity, live-client entitlement, ordinary recovery and forward-only COMMIT clauses remain preserved. The new failures concern the changed interaction, not a restart of the accepted BEGIN design or a requirement to execute unimplemented production tests.

No product/source/test/design/metadata/Quest/index changes, cluster, stage, commit or push were performed. Only this report and new E diagnostics were written. No source, startup, main, merge or corpus approval is implied.

## Provenance and bounded subjects

- `B` = `/mnt/data/peter/projects/.worktrees/rs-raft-startup-integration-20261011`
- `Q` = `B/solve/quests/replicated-transaction-decision-and-apply`
- `E` = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`
- `D` = `E/begin-design-round10-independent`
- `N` = `E/begin-design-round9-independent/navigation`, immutable extraction of **unapproved source-navigation snapshot** `86af2cab8b361f777ae7ec1f96793f996043de59`.

| Subject | SHA-256 |
| --- | --- |
| DS: `Q/design-query-begin-uncertain-insert-resolution-2026-10-11.md` | `df779a902d3972db751eebdd8790b828ed8bfa2f422f042a60ecf1445c7acc53` |
| P9: `Q/evidence/design-query-begin-uncertain-insert-resolution-round9-bd551d60.md` | `bd551d60cc2b5c61aacffa59ec93640ee25119784f1196b6e725df90303233c3` |
| P7 accepted predecessor | `3679b87f4aeb84fd8d9397aac9f73f686e5fcb990c1e61e86df35e9731f91fa5` |
| AF: `Q/evidence/begin-round10-resource-domain-feasibility.json` | `eda8880920086a1a5448149c9494277c65708b392a8539fdd4d5d937ee56d2b3` |
| AUTHOR: `Q/evidence/begin-round10-resource-domain-feasibility.mjs` | `facce90847f264f77fb3b6cf5ecd3950598d78122fd0dfed847e51bb389113bc` |
| PR9: `E/review-begin-uncertain-design-round9-independent.md` | `92b86663bd692eab114e252fea6876d2b5f1a3911a2caf5ac6f470fbdf2f2fef` |
| PR5: `E/review-begin-uncertain-source-round5-independent.md` | `b4e08617230af527cbb4c66b7e33eb1b4f0d6f77b78010aa5bc23c7effdd2224` |

DS has P9 as an exact byte prefix. The complete 425-line supplement and full prior cumulative review were consumed, with unchanged accepted clauses retained. Steering remains AGENTS → rules → router, then the authority/recovery, Quest and verification owners. The ten governing templates and their per-item evidence-path rule are retained. The full requested 63-item union is below.

`D/provenance.json` verifies the subjects, ten selected immutable source files against actual B bytes and the installed native dependency hashes. All selected source comparisons match. The driver was copied unchanged into an E-only directory with the required relative layout and rerun there; its result is **byte-identical** to AF. B's evidence file was not executed in place or rewritten.

## Evidence method and preserved progress

### Executed feasibility

`D/independent-feasibility.mjs` uses installed SQLite 3.49.2, the existing immutable creation key encoder, existing decision/participant-manifest builders and the existing schema enforcer from N. It:

- substitutes the specified `octet_length` expression in a private in-memory copy of the actual trigger, then proves exact stored and decoded bytes for ordinary, BOM-only, leading NUL, NUL-plus-text, embedded NUL and supplementary sessions;
- proves fatal UTF-8 rejection for ED A0 80, FF and C0 80;
- constructs the accepted complete initial row and a same-immutable COMMITTING row with a real COMMIT decision/manifest and one manifest member with no progress row;
- reconstructs the original fixed initial encoding from the advanced row's six immutable fields and obtains the identical creation key;
- divides the actual canonical session bytes into fixed pages, sees initial state on the first page and advanced state on later/final pages, and confirms the concatenated bytes and final advanced classification;
- verifies that a conflicting epoch or session changes the reconstructed content key;
- records the actual current enforcer's `install_required → enforced` transition for an empty lawful schema.

The grant/expiry/response schedules and exact row-field checks are **explicit models of the document**, not execution of future source. There is no claim that the new private query, target token or shared runtime context already exists. The complete source/recovery/client witnesses remain future gates.

`D/evaluate-feasibility.py` confirms **14/14 expected observations**, including counterexamples. That count is neither source green nor design approval. The original author JSON's target-credit booleans and key-policy strings are declarative model entries, not executed endpoint proofs; its byte counts are explicitly shape samples, not a complete frame/native heap census.

### D9 findings that are substantively addressed

- **D9-1 direction:** DS:1915-1940 explicitly places one resource context under the existing node SQL runtime lifetime, injects it into all control-partition creation paths and names the router preflight/send-completion refinement. DS:1972-2078 replaces a sender capacity assertion with target-minted grants. This is a concrete owner expansion; the remaining endpoint-state gaps are D10-2/D10-3.
- **D9-2 arithmetic:** DS:2138-2196 subtracts the completion allowance before record admission. At T=3,671, fixed=1, completion=1,835, only one 1,835 record is admitted. At T=5,506, two records plus completion fit. Both admitted records can borrow that already reserved lane without a record upgrade or unrelated release. This closes the old equation, subject to the new token lifetimes and deadlines being coherent.
- **D9-3 scalar bytes:** DS:2198-2237 explicitly preserves all nonempty Unicode scalar strings, uses `ignoreBOM:true`, and changes the committed trigger to octet length through its existing owner. All six positive native controls pass; invalid UTF-8 remains refused. The missing-trigger migration/initialization distinction is D10-4, not a recurrence of the BOM/NUL byte mismatch.

## Complete grouped findings

### D10-1 — HIGH: original expiry prevents every later recovery grant

**Categories:** admission, time, sweep, recovery, progress and ownership.

DS:2034-2036 expires a target grant at the lesser of the target control-turn bound and the original transaction deadline. DS:2043-2045 refuses expired grants. Therefore, after the immutable transaction deadline has passed, no later creation sweep can acquire a live classifier grant, regardless of fresh control-turn budget, target capacity or restored transport.

That directly conflicts with the preserved accepted rule at DS:440-446: after original expiry, a fresh bounded reconciliation turn may resolve the old creation without granting transaction activity. DS:128 onward,1328-1329 and PR5's expiry/late-visibility controls retain server-owned uncertainty after the caller/transaction deadline. The new classifier is required before the exact/advanced handoff, so the cap blocks the existing recovery owner from learning the durable state.

`D/independent-feasibility.json:clockSchedule` supplies the exact schedule:

| now | immutable transaction deadline | current control deadline | round-ten grant expiry | live grant |
| --- | --- | --- | --- | --- |
| 4,000 | 5,000 | 5,000 | 5,000 | yes |
| 6,000 | 5,000 | 7,000 | 5,000 | no |
| 7,000 | 5,000 | 8,000 | 5,000 | no |

The later records retain transaction ID `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` and the recorded COMMIT unchanged. Repeated sweep selection cannot redrive it because every grant is already expired. No new transaction activity, COMMIT rollback or deadline extension is needed to make the recovery read lawful.

**Required closure:** apply the already accepted distinction to endpoint grants. Preserve the original deadline as immutable identity/admission evidence, cap foreground transaction activity appropriately, and let post-expiry server reconciliation use the one captured control-turn deadline. Specify the role at the existing owner and carry it through the private contract without adding an alternate reader. Expiry must never erase the exact retained obligation or mint a new ID.

### D10-2 — HIGH: the declared exact tuples cannot carry their promised authority

**Categories:** canonical shapes, complete decision consumption, transport binding, pages and check-to-act.

Two concrete shape contradictions remain:

1. DS:1989-2007 declares the result to be **exactly** eight own fields. DS:2108-2115 then requires fixed numeric/enum fields in the metadata result so the origin can compare all six immutable fields. The exact row omits `transaction_epoch`, `timeout_deadline`, `transaction_mode` and `created_at`. It has the requested transaction key and paged session bytes, but no exact values for the remaining four fields. Adding them under the current strict shape is INVALID; inferring them from KEY_MATCH would make the preliminary digest authoritative, contrary to DS:2096-2106 and the user's ruling.
2. DS:1972-1978 and AUTHOR's fixed credit request omit `phase` and `page_offset`, yet DS:2027-2029 requires the target to mint the grant bound to those exact values before the classification request is sent. The later classification request includes them, but that does not retroactively bind a previously issued grant. A generic wildcard grant or first-use binding would be a different contract and is not specified.

`D/independent-feasibility.json:shape` lists the four missing immutable fields and two missing credit-binding fields directly. The fixed result in AF has the same eight keys. These are missing facts in exact canonical messages, not requests for optional diagnostic fields.

The current-leader witness may remain in the existing owner-RPC **outer response envelope** (PE:751-752,813); absence from the eight-field row alone is not a separate finding. Its concrete association with each page/target still belongs in the complete request/result contract. Likewise, origin and target resource generations must have explicit domains so one node's local generation is not compared to another node's unrelated counter.

The independent page control shows why the distinction matters. A legitimate COMMITTING row retains the same reconstructed initial key and exact session bytes despite mutable progress. The final page observes advanced state, and the durable COMMIT remains unchanged. A valid key match alone still cannot prove the omitted epoch/deadline/mode/created-at bytes or release a client claim. A canonical differing key without the exact producer PK disposition must retain the old identity.

**Required closure:** publish one consistent exact set of credit, metadata, page and completion tuples, including the four immutable values, grant phase/offset binding, generation domains and outer witness binding. Recompute fixed bounds from those actual tuples. State which final metadata/initial flag decides initial versus advanced state, preserve monotonic advanced observations, and reject incomplete/mixed page sets. Do not solve this by trusting a matching digest or relaxing strict own-data validation.

### D10-3 — HIGH: endpoint response/expiry branches exceed or abandon their declared credit

**Categories:** resource custody, transport, concurrency, shutdown and progress.

The sender-stamp problem is replaced with a target token, but the declared peak remains one fixed global response slot (DS:2011-2014,2026-2040,2150-2151,2275-2281). The following ordinary asynchronous schedules are not covered by that slot or by a defined charged wait state:

**a. Pressure replies while the granted slot is occupied.** Origin A has the target token and retained grant/classification response. Origins B/C/D synchronously send their one lawful credit request. DS:2032-2033 requires each to receive typed pressure without a waiter. Those serialized response frames may remain in WebSocket send custody until callbacks complete. Per-connection ingress credit pays the **credit-request** frame/string/capture (DS:2011-2017), not these additional outbound responses. Four responses can overlap while only one global response slot exists. Serial JavaScript handler execution does not make asynchronous send-buffer retention serial.

**b. Classification arrives before the grant send callback.** The origin may receive the grant and send the classifier before the target's grant-frame callback has released its frame. DS:2037-2040 permits response-slot reuse only after that callback. DS:2041-2052 allows the classifier to consume the grant and execute; DS:2181-2188 says the target never waits holding the lane and completes in the handler turn. Producing the classification response then overlaps two frames, or requires a charged token state that postpones response production/native work until the grant callback. Neither choice is specified. Local origin/target delivery must obey the same real reference lifetimes; sharing the resource context is not proof that two retained representations are one copy.

**c. Grant expiry with a retained send frame.** DS:2034-2040 says unused grant expiry clears/releases the token. If its send callback has not run and the connection still retains the grant frame, expiry cannot release the fixed response charge. DS:2060-2065 elsewhere correctly holds frame credit until callback/error/close. The design needs separate semantic grant expiry and actual send-custody retirement, including a bounded way to clear a stuck send while preserving other accepted work.

**d. Canonical late classification after unused-grant expiry.** A lawful origin sends its classification before its deadline, but delivery reaches the target after the unused grant timer has released the token. The target must receive and parse the canonical frame before it can inspect the expired credit. DS:2076-2078 claims the only pre-token allocation is the fixed credit request; the per-connection allowance is also defined for that request. No target token remains to pay this late classifier parse. Refusing native work is correct, but is later than the receive/parse allocation. This case requires bounded rejection/late-delivery custody within the existing ingress owner, not a hostile-frame threat-model expansion.

`D/independent-feasibility.json:responseSchedules` records these event sequences and declared slot counts. They are contractual schedules, **not** a claim that a future implementation was executed or that every deployed WebSocket run exhibits the callback ordering. Actual source MI:50-52 parses before service dispatch, MI:435-470 ACKs then schedules the handler, and MD:698-701 currently exposes no callback at all; the supplement already acknowledges those owners must change. The correction must define the allowed callback ordering rather than rely on peer receipt as evidence that local references were released.

DS:2026-2035 also reserves the completion allowance at grant time while waiting for the origin's second message, whereas DS:2174-2188 describes borrowing only just before a synchronous step and never waiting while holding it. Bounded unused-grant leases are a feasible direction, but this must be one explicit token state machine with the same retained-credit proof, not two incompatible lifetime descriptions.

**Required closure:** enumerate the actual maximum simultaneous credit grant, pressure/refusal, ACK and classification frames and their owner tokens; or serialize them with explicitly charged, bounded states of the existing token. Distinguish semantic expiry from physical frame retirement. Pay bounded late/duplicate/expired fixed-message parsing after a grant has retired. Preserve exact callback/generation checks and do not allocate an uncharged waiter or new scheduler. The protected native allowance may stay reserved from grant until use/expiry if that lifetime is accounted for honestly. No broad transport protocol or global cap increase is required merely by this finding.

### D10-4 — MEDIUM: the new missing-trigger rule needs a lawful first-install branch

**Categories:** schema authority, recovery/startup composition and supported controls.

DS:2229-2237 recognizes only exact version-two and version-three triggers and says missing triggers remain INCOMPATIBLE. That is safe for a missing required enforcer on an already-originated generation, but the unqualified clause also covers the normal empty `sql_transactions` table before its first committed origin installation.

The existing owner deliberately distinguishes that state:

- EN:57-73 returns `install_required` for a valid table with no enforcer.
- EN:109-124 installs the source-owned trigger inside the caller's existing SQLite application transaction.
- APPLY:577-587 invokes the installer as part of `PARTICIPANT_GENERATION_ORIGIN` before the origin is recorded; replay also calls the owner without resetting generation.
- CENSUS:29-34 accepts REQUIRED as a known pre-origin schema state rather than inventing a completed origin.

`D/independent-feasibility.json:virginSchema` executes this actual empty-schema owner transition: `install_required → enforced`, with no user rows or inferred participant set. The new octet trigger is feasible; an empty lawful schema need not temporarily install version two or fabricate an old digest to receive version three.

**Required closure:** explicitly preserve fresh empty/pre-origin installation of version three under the existing committed-origin authority, separate it from exact V2→V3 upgrade and existing-origin missing/foreign-enforcer refusal, and have source/apply/census consume that same state machine. If “missing is INCOMPATIBLE” was intended only for the upgrade branch, state that scope. This is a concrete consequence of the new trigger contract; it neither reopens activation design nor claims normal startup is already certified.

## Handoff and fixed-page assessment

The key is correctly preliminary in DS:2094-2106: KEY_MATCH starts exact comparison only; KEY_DIFFERENT authorizes no remint without command-specific PK collision. It never authorizes adoption, overwrite, charge release or a durable decision. Reconstructing the initial 15-field encoding must use immutable created-at for its initial updated-at and the fixed initial mutable constants; the independent canonical-builder control shows this works for an actually advanced row.

Every page must be produced in one SQLite snapshot with canonical immutable validation and the bounded native token. Across pages the origin must consume the same requested key, total length, contiguous offset, owner generation and current-leader evidence. The final metadata must carry the complete exact immutable values and the current initial/advanced distinction. A changed key, length, generation/witness, duplicate/gap or unavailable page keeps the original record and live entitlement. D10-2 currently prevents the numeric/enum comparison from being expressed by the exact result shape.

An advanced result remains only monotonic creation knowledge. DS:2128-2134 requires ordinary recovery to reread the complete transaction/participants/current fence and immutable identity before handoff. That preserves a valid COMMIT and a manifest member without a progress row as unknown work. The new diagnostic retains a canonical COMMIT/manifest and proves same-key/page feasibility, but emits **no production COMMIT or ROLLBACK**. PR5 remains the prior actual redrive/client evidence; future combined source proof must renew it on the new endpoint implementation, including both retry-first and recovery-first orderings.

The node-shared context and all constructor paths are explicitly owned at DS:1915-1940. Missing context safely disables the classifier; it cannot be silently treated as capacity. Required-leader routing, exact WITH source, local-read bypass and ordinary/private statement admission are named at DS:1962-1970. Existing removal/readiness fences are preserved; this design never grants a general READY or mutation-admission bypass. D10-1 must restore permitted recovery while new mutation activity remains expired/fenced.

## Evidence aliases

Source aliases refer to N's immutable bytes; B native dependencies are separately hashed. All source references are navigation only.

| Alias | File |
| --- | --- |
| FEAS | `D/independent-feasibility.json` |
| EVAL | `D/feasibility-verdict.log` |
| CR | `src/query/distributed/distributed-transaction-creation-resources.js` |
| CC | `src/query/distributed/distributed-transaction-creation-contract.js` |
| CO | `src/query/distributed/distributed-transaction-creation.js` |
| EN | `src/query/distributed/distributed-transaction-schema-enforcement.js` |
| APPLY | `src/partition/partition-participant-transaction-apply.js` |
| CENSUS | `src/query/distributed/distributed-transaction-release-census.js` |
| MI | `src/transport/message-router-inbound-dispatch.js` |
| MD | `src/transport/message-router-delivery-behaviors.js` |
| PE | `src/partition/partition-service-entry-apply-base.js` |
| OR | `src/cdc/cdc-integration-service-owner-rpc-read-execution.js` |
| CF | `src/cdc/cdc-integration-service-authoritative-read-flow.js` |
| QB | `src/query/query-result-budget.js` |

## All 63 cumulative dispositions

PASS denotes a coherent design obligation, including expressly preserved prior scope. FAIL names a grouped correction required in this supplement. FUTURE is not an executed pass. Every row cites concrete evidence or prior scoped coverage.

### Admission A1–A7

| Item | Disposition and evidence |
| --- | --- |
| A1 | **PASS unchanged entitlement and scalar preaccept parity; FAIL D10-2 complete acceptance evidence.** DS:2096-2098,2248-2258 retains live exact claim and requires all six before success. The exact metadata tuple lacks four fields (DS:1989-2007; FEAS:shape). PR5:A1/pgwire scope is preserved. |
| A2 | **PASS key/refusal/remint policy; FAIL D10-2 tuple completion.** DS:2094-2106 requires canonical KEY_DIFFERENT plus actual PK collision, never timeout/ACK. DS:2003-2007 has explicit invalid/missing/pressure outcomes; omitted exact fields prevent a complete SAME decision. |
| A3 | **FAIL D10-1.** Accepted DS:440-446 separates original transaction expiry from the fresh recovery turn; DS:2034-2036 caps every grant by the expired original deadline. FEAS:clockSchedule shows later valid control turns cannot issue a live grant. |
| A4 | **FAIL D10-2.** DS:1989-2007 exact eight-field row contradicts :2108-2115 numeric/enum metadata requirement; credit request at :1972-1978 lacks phase/offset needed at :2027-2029. FEAS:shape records both omissions. |
| A5 | **PASS existing sweep owner; FAIL D10-1/D10-3 progress.** DS:2171-2179 retains rotation after caller retirement, but expired grants never reach evidence and response custody can consume the only slot without a defined completing state. PR5:A5 remains prior scoped evidence. |
| A6 | **PASS exact late/consumer fence; FAIL D10-2 complete handoff data.** DS:2080-2088,2113-2118,2128-2134 names record, target generation, page and recovery revalidation. The canonical tuples must supply all facts those gates require. |
| A7 | **FAIL D10-3 full attempt/debt census.** DS:2011-2078 names token roots and callbacks but omits competing refusal frames and grant/response overlap. FEAS:responseSchedules distinguishes semantic expiry, sender ACK and actual retained send roots. |

### Retry Y1–Y7

| Item | Disposition and evidence |
| --- | --- |
| Y1 | **PASS sweep still fires; FAIL D10-1 usable reentry.** DS:2171-2179 preserves server-owned debt and existing cursor; DS:2034-2045 rejects all post-original-expiry grants. PR5:Y1 actual sweep invocation remains scoped. |
| Y2 | **PASS missing/invalid identity retention; FAIL D10-3 bounded endpoint branches.** DS:2003-2007,2101 retains the original record on unreadable evidence. Expired late classifier parsing and pressure response frames lack complete current credit (FEAS:responseSchedules). |
| Y3 | **PASS typed origin exits; FAIL D10-3 target expiry exit.** DS:2080-2088,2244-2253 retains exact obligation on cancel/close/shutdown. DS:2034-2040 releases expired grant tokens while :2060-2065 still requires callback/close to retire send frames. |
| Y4 | **PASS protected native headroom; FAIL D10-1/D10-3 suppression.** DS:2138-2196 removes the old record-upgrade cycle, confirmed by FEAS:completionArithmetic. Original expiry and the one response-slot branches still prevent coherent completion. |
| Y5 | **FAIL D10-3 finite retained responses; PASS prior bounded cohorts.** DS:2011-2017 reserves per-connection ingress and one response, while :2032-2033 requires simultaneous origins' pressure replies. PR5:Y5's finite engine cohorts/logs remain scoped. |
| Y6 | **PASS no duplicate INSERT/remint.** DS:2094-2106,2255-2260 retains exact key/identity; key match alone cannot succeed and key difference alone cannot remint. PR5:Y6's retry/late-insert controls remain required cumulatively in DS:2308-2310. |
| Y7 | **PASS no false ACK reset; FAIL D10-3 credit lifetime.** DS:2050-2052,2060-2065 makes ACK and sender timeout non-release events. MI:435-470 confirms real ACK/handler separation; all response/expiry branches must consume that rule consistently. |

### Transport T1–T5

| Item | Disposition and evidence |
| --- | --- |
| T1 | **PASS evidence separation.** DS:2094-2106 requires exact PK disposition and full immutable comparison, not INSERT transport/CommandComplete ACK. PR5:T1 remains historical. D10-3 prevents transport completion from being substituted for frame retirement. |
| T2 | **PASS identity/generation intent; FAIL D10-2/D10-3 exact delivery custody.** DS:2041-2047,2083-2088 denies wrong/stale grants; the phase/offset must actually enter the mint tuple and late fixed delivery must remain charged after grant expiry. |
| T3 | **FAIL D10-2 complete typed boundary.** DS:1991-2000's canonical result cannot supply :2108-2115's four immutable values. Existing outer current-leader witness remains valid owner placement (PE:751-752,813); it is not rederived from a digest. |
| T4 | **PASS typed unavailable/pressure direction; FAIL D10-1/D10-3.** DS:2003-2007,2032-2036 retains missing-owner work, but no post-expiry grant can proceed and target refusal replies need their actual charge. |
| T5 | **PASS proof labels and future owner witnesses.** DS:2275-2310 names real cross-origin, pgwire and construction-path controls. AF's booleans are models, FEAS's scalar/encoder/enforcer operations are real; no new production endpoint witness is claimed executed. |

### Sweep/time S1–S5

| Item | Disposition and evidence |
| --- | --- |
| S1 | **FAIL D10-1 recovery deadline; PASS existing clock domain.** DS:440-446 and PR5:S1 preserve injected time/unref/control-turn capture. DS:2034-2036 incorrectly reapplies original expiry to recovery credit. |
| S2 | **PASS ordinary recovery and COMMIT authority; FAIL D10-1 access.** DS:2128-2134 retains complete ordinary recovery and missing-progress member; FEAS:exactKeyAndPages keeps the real COMMIT unchanged. Expired grants block reaching that owner. |
| S3 | **PASS generation/retained debt; FAIL D10-3 endpoint shutdown release.** DS:2066-2070,2244-2258 preserves old-token-only callbacks and client/server distinction; exact send custody must survive expiry until callback/error/close rather than release on semantic shutdown alone. |
| S4 | **FAIL D10-1 original-vs-control semantics.** The unchanged long-transaction/recovery rule is DS:440-455. FEAS:clockSchedule shows successful current control budget but no usable grant; no new mutation permission or deadline renewal is requested. |
| S5 | **PASS old full-pool equation; FAIL D10-3 complete lane lifetime.** DS:2143-2196 reserves finishing capacity first, verified in FEAS:completionArithmetic. Grant-time reservation (:2026-2035) and “never waits while holding” (:2174-2188) need one consistent bounded state machine. |

### Recovery R1–R5

| Item | Disposition and evidence |
| --- | --- |
| R1 | **PASS no live-map overwrite from key evidence; FAIL D10-2 handoff completeness.** DS:2096-2106 forbids adopt/overwrite/release from a key alone; omitted immutable fields cannot be inferred before exact-object acceptance. PR5:R1 is retained prior map coverage. |
| R2 | **PASS immutable phase/restart separation.** DS:1908-1913,2085-2088,2244-2258 keeps original row/key and live versus server-only claims. No new durable ledger/restart freshness is introduced. D10-1 must not turn expired debt into permanent in-process HOLD. |
| R3 | **PASS full recovery population preserved.** DS:2128-2134 retains ordinary transaction/participant/current-fence validation and a manifest member with no progress row. FEAS:exactKeyAndPages has a real one-member COMMIT manifest and zero progress rows; actual redrive remains prior PR5:R3/future DS:2300-2303. |
| R4 | **PASS same-owner idempotence/forward-only outcome; FAIL D10-1 ability to redrive.** DS:2099-2106,2255-2260 preserves no remint/rollback without proper evidence. Post-deadline grant refusal cannot be used to erase or undo a committed decision. |
| R5 | **PASS missing rows/pages do not complete; FAIL D10-2 incomplete exact census.** DS:2003-2007,2113-2118 retains missing/changed page sets. Four exact immutable values are absent from the declared metadata result, so it cannot certify the complete six. |

### Concurrency C1–C5

| Item | Disposition and evidence |
| --- | --- |
| C1 | **PASS retained/native preallocation direction; FAIL D10-3 all side-effect branches.** DS:2011-2052 reserves target credit before classifier work and :2080-2082 prepays origin capture. Pressure frames and post-expiry classifier parsing still have no complete matching lifetime charge. |
| C2 | **PASS post-await/current-consumer fences; FAIL D10-2/D10-3 check-to-act.** DS:2083-2088,2113-2118,2128-2134 names freshness; grant fields must exist before mint and response-slot callback order must precede actual reuse or be separately charged. |
| C3 | **PASS one creation arbitration owner.** DS:1915-1923,2255-2258 retains node-shared existing resource owner and same role-neutral transaction record; no second durable decision owner or new retry scheduler is authorized. PR5:C3 preserved. |
| C4 | **FAIL D10-3 callback/expiry reentrancy; PASS exact-token intent.** DS:2066-2070 prohibits releasing a successor. FEAS:responseSchedules shows grant expiry and grant/classification send callbacks require separate token states and root ownership before that rule is executable. |
| C5 | **FAIL D10-2/D10-3 reservation key/lifetime.** DS:2027-2029 keys grants by phase/offset absent from credit input; DS:2037-2040 reuses a response slot only after callback without ordering later request execution against that callback. |

### Formation/degraded path F1–F5

| Item | Disposition and evidence |
| --- | --- |
| F1 | **PASS actual owner route inventory; FUTURE construction proof.** DS:1930-1936,1962-1970 explicitly covers shared runtime, all control-partition factories, CDC local skip, required leader, private source and admission. OR:410-430 and CF:511 remain the actual source gates to refine, not bypass. |
| F2 | **PASS existing rediscovery; FAIL D10-1 permitted recovery grant.** DS:2171-2179 keeps the independent sweep while caller activity is fenced. The original deadline must not prevent its authoritative classification after the route returns. |
| F3 | **FAIL D10-4 lawful initial schema; FAIL D10-1 recovery progress.** DS:2229-2237's blanket missing-trigger refusal omits EN:57-73,109-124's empty first-install path. Supported creation/recovery must coexist with modified/foreign-enforcer refusal. |
| F4 | **PASS fixed request/page and current-turn intent; FAIL D10-1/D10-3 real lifetime.** DS:1947-1960,2003-2007 bounds page/request shapes and carries both deadlines; grants and pending send frames need the correct control budget/custody. No startup timing claim is made. |
| F5 | **PASS architecture limits.** DS:2312-2322 prohibits a broad payload protocol, second reader/ledger, waiter queue, raw escape, manifest cap or global increase. D10-3 may be closed by bounded existing-token states/census rather than introducing those alternatives. |

### Harness H1–H6

| Item | Disposition and evidence |
| --- | --- |
| H1 | **PASS predecessor/provenance engagement.** D/provenance.json proves exact P9 prefix, current subject, PR9 and native source pins; unchanged author driver reruns to the exact eda888 hash. Findings reach semantic comparisons rather than missing modules. |
| H2 | **PASS fidelity distinction.** FEAS executes actual SQLite trigger/bytes, canonical key and decision builders, and current enforcer. Credit/response/expiry/page-result schedules are expressly design models; PR5's real pg.Client/application controls remain prior scope. |
| H3 | **FAIL D10-1/D10-3 changed timing schedules; PASS prior cumulative orderings.** FEAS:clockSchedule,responseSchedules covers expiry, callback ordering and late delivery. DS:2308-2310 retains both retry/recovery, caller expiry/close/shutdown and actual client controls. |
| H4 | **PASS real canonical rows/key reconstruction; FAIL D10-2 fixed metadata.** FEAS:exactKeyAndPages uses actual fixed15 encoder and COMMIT/manifest builders. Advanced mutable fields do not alter reconstructed initial key; the exact eight-field result still lacks four immutable values. |
| H5 | **PASS positive/refusal controls; FAIL D10-1..4 closure.** Six BOM/NUL/Unicode positives and invalid UTF-8 controls pass; protected headroom and key conflict controls are paired. EVAL confirms 14 expected observations including failures, not 14 source passes. |
| H6 | **PASS scope ceiling.** DS:2314-2322 and this report keep design feasibility separate from source/runtime/main proof. Historical PR5 component counts are preserved; no normal startLagrangeRuntime or new transport acceptance is inferred. |

### Owner interactions O1–O10

| Item | Disposition and evidence |
| --- | --- |
| O1 | **PASS semantic/resource owner placement.** DS:1915-1940 makes one runtime-owned context and existing creation adjudicator explicit; :2128-2134 preserves ordinary recovery authority. D10-3 is incomplete custody inside that interaction, not justification for another owner. |
| O2 | **FAIL D10-2 complete typed handoff.** The result at DS:1989-2007 cannot deliver :2108-2115's exact six, and credit input cannot mint its declared phase/offset key. Prior DWC/session/pgwire boundary remains PR5:O2. |
| O3 | **PASS identity/client preservation; FAIL D10-1/D10-3 paired usable credit.** DS:2243-2258 retains same record/entitlement while resources are held. Post-expiry grant impossibility and unmatched response custody prevent a complete same-witness identity/usability/charge proof. |
| O4 | **PASS stale/fresh page intent; FAIL D10-1/D10-2 executable reentry.** DS:2113-2118 restarts on changed key/generation/gap; current metadata must actually include all six, and a fresh later recovery turn must receive a live grant. |
| O5 | **PASS protected completion admission; FAIL D10-3 pressure responses.** DS:2138-2196 reserves lane first and keeps oversize historical rows typed pressure. DS:2032-2033 cannot send multiple retained refusal frames from a sole occupied response slot. |
| O6 | **PASS existing wake dependency; FAIL D10-1/D10-3 release path.** DS:2171-2188 keeps existing sweep and no waiter cohort. Grant expiry must permit lawful recovery and must not drop live send roots; exact callback/close ownership remains necessary. |
| O7 | **PASS preliminary evidence is not authority.** DS:2094-2106 forbids ACTIVE/adopt/overwrite/release from key alone; :2128-2134 revalidates ordinary recovery. D10-2 must be closed by real field delivery, not by treating digest match as the omitted facts. |
| O8 | **PASS exact supersession and source limits.** DS:1901-1913 states explicit replacement scope; D/provenance.json verifies bytes/prefix. PR9/PR5 scopes and unapproved navigation remain distinct; D10-4 identifies the concrete new trigger-state conflict. |
| O9 | **PASS complete intended path inventory; FAIL D10-3 endpoint closure.** DS:1930-1940 covers seed/join/registration/ReplicaHandler/snapshot factories and node lifetime; :1962-1970 owns source/private route. MI:52,435-470 and MD:698-701 are the actual receive/ACK/send points whose new token states must compose. |
| O10 | **PASS canonical coupled-proof obligations; add D10-4 control.** DS:2272-2322 retains all earlier canonical matrix/client witnesses and includes runtime/router/partition/schema owners. The combined source packet must include empty first install and exact V2→V3/foreign-trigger refusal; no manual-only fixture substitutes for the canonical runner/impact contract. |

### JavaScript and canonical inputs J1–J8

| Item | Disposition and evidence |
| --- | --- |
| J1 | **PASS checked lattice/headroom; FAIL D10-1 deadline role.** DS:1947-1960,2148-2160 preserves safe integer domains and checked sums. FEAS:completionArithmetic verifies the old counterexample is refused correctly; taking min with an expired immutable deadline is semantically wrong for recovery despite safe arithmetic. |
| J2 | **PASS strict own-data gate; FAIL D10-2 inconsistent exact fields.** DS:2003-2007 rejects extra/missing/accessor tuples. It therefore cannot also accept the four undeclared metadata fields required by :2108-2115. PR5:J2 config capture remains scoped. |
| J3 | **PASS once-captured primitive and byte preservation.** DS:2208-2222 retains own primitive capture, no coercion, BOM-preserving fatal decode and raw page hex. FEAS:scalar/utf8Rejections provides actual native controls; PR5:J3 accessor-once scope is preserved. |
| J4 | **PASS inherited/accessor refusal.** DS:2003-2007 preserves strict own-data shapes; PR5:J4/PR9:J4 retains prototype refusal coverage. No ambient-host/intrinsic mutation premise is added. |
| J5 | **PASS primitive/enums; FAIL D10-2 field completeness.** DS:1947-1960,1991-2007 defines explicit phases/states/numbers and invalid tuples. Existing boxed/exotic refusal remains PR5:J5; missing exact identity fields cannot be defaulted from key truthiness. |
| J6 | **PASS threat-model scope.** Findings use legal retained requests, ordinary scalar bytes, normal delayed callbacks, an empty schema and actual owner methods. PR5:J6/PR9:J6 remains the trusted-host boundary; no intrinsic-immunity or hostile transport expansion is required. |
| J7 | **PASS canonical bytes/key algorithm/scalar correction; FAIL D10-2 exact consumption.** DS:1981-1987,2200-2227 preserves the unchanged 15-field encoding and BOM/NUL bytes. FEAS proves advanced key reconstruction, but key equality cannot replace omitted immutable metadata. |
| J8 | **PASS fixed pages/native envelope direction; FAIL D10-2/D10-3 actual complete bounds.** DS:2003-2007 caps page hex and :2154-2168 bounds native stored input. The wire tuples must include their real fields, and the census must cover pressure/overlap/expired-delivery roots before claiming every allocation is reserved. |

## Reproduction, hashes and broader limits

The unchanged author driver writes beside itself. It was therefore run only in the E-only replay layout, which contains the frozen subject and symlinks to the already retained immutable N/src and installed node_modules. No B evidence/source file was rewritten.

Exact execution commands after that retained layout is prepared:

```sh
node "$D/author-replay/solve/quests/replicated-transaction-decision-and-apply/evidence/begin-round10-resource-domain-feasibility.mjs"
node "$D/independent-feasibility.mjs" > "$D/independent-feasibility.json"
python3 "$D/evaluate-feasibility.py" > "$D/feasibility-verdict.log"
```

For clean reproduction, recreate `D/author-replay/src` as a symlink to `N/src` and `D/author-replay/node_modules` to `B/node_modules`, copy B/package.json, the exact frozen subject and exact driver into the retained relative paths. The immutable N extraction is reproduced with `git -C "$B" archive 86af2cab8b361f777ae7ec1f96793f996043de59 src package.json` into an E-only navigation directory, as documented by PR9. Scripts and all outputs are retained; no hidden /tmp driver is required.

| Artifact | SHA-256 |
| --- | --- |
| Unchanged author replay driver | `facce90847f264f77fb3b6cf5ecd3950598d78122fd0dfed847e51bb389113bc` |
| Author replay JSON | `eda8880920086a1a5448149c9494277c65708b392a8539fdd4d5d937ee56d2b3` |
| `D/independent-feasibility.mjs` | `31bcae21bbe36afbb38b5385d9b1263f7664e2cf620a35bd41c38a0487b45550` |
| `D/independent-feasibility.json` | `c6ec528422729fe51c2169206697c25fff6c1d1c760a1d7c168a74a52ad357d7` |
| `D/proposed-trigger.sql` | `3b5aad21e180aa4507de1c6ceda66e59b1cc56ad250628ca9efa13fbdc088ffd` |
| `D/evaluate-feasibility.py` | `5a63bdc3978e2d98f2185395daaca21f514983bb2fc65c4a5c1222616aa9fed9` |
| `D/feasibility-verdict.log` | `9ced78ca9f4209b61b99154074ac5b9ab35f0397e3ca24c154c1c6ab4be96f55` |
| `D/provenance.json` | `cfa784754cb3b6a3a9592f725806a087190f604e8e5961f35a6ed76baab71a0f` |
| `D/diagnostics-manifest.sha256` (10 entries) | `0c10143df08c5a8b28da365d24818c00c0bf879deec5797aa758e066a1a43cca` |

The native trigger diagnostic instantiates the specified expression correction only. It is not a product migration, a reviewed version-three digest or proof that all source/apply/release-census callers have changed. No process/native heap maximum is claimed. The model response schedules expose obligations the new state machine must own; they are not mislabeled executed production failures.

PR5's historical component proofs remain scoped, including valid COMMIT/no-rollback, same-session retry orderings, timer/disconnect/shutdown and real client acceptance. The frozen B5 scratch correction and all proposed source remain unapproved. Reported global static reds remain unwaived: complexity **1,780 > 1,755** and source-file count **29 > 27**; these were not rerun or reinterpreted. Activation/C3, C17, source integration, normal startup/cluster, main/merge and corpus proof remain separate and open.
