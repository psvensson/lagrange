# BEGIN round 11 — independent bounded design review

## Verdict

**REJECT the round-eleven supplement as a complete contract; source remains HOLD.** Two grouped corrections remain:

- **D11-1 — high:** the dynamic per-connection allowance can prevent an already admitted attempt from completing after a legitimate connection replacement, even after the old connection fully drains and the protected native lane is free.
- **D11-2 — medium:** the new schema table rejects the lawful exact-V2-plus-origin state produced by the existing committed owner, leaving the promised V2 upgrade unreachable from its normal predecessor. It also removes the existing empty legacy-column installation case without identifying that as a supersession.

The post-original-deadline recovery role, complete immutable metadata, phase/offset binding, separate generation domains, four response slots per connection, semantic-expiry/physical-custody separation and fresh empty V3 install are substantive corrections. Their bounded design coverage is preserved below. Neither finding restarts the accepted BEGIN model or demands that unimplemented production tests already pass.

This is **design feasibility only**. B5 source remains independently held. There is no startup, source, main, merge or corpus approval. No product, design, tests, metadata, Quest, caller index, commit or remote was changed; all new writes are this report and D diagnostics. No cluster was run.

## Exact subjects and evidence

- `B` = `/mnt/data/peter/projects/.worktrees/rs-raft-startup-integration-20261011`
- `Q` = `B/solve/quests/replicated-transaction-decision-and-apply`
- `E` = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`
- `D` = `E/begin-design-round11-independent`
- `N` = `E/begin-design-round9-independent/navigation`, immutable extraction of **unapproved navigation snapshot** `86af2cab8b361f777ae7ec1f96793f996043de59`.

| Alias / subject | SHA-256 |
| --- | --- |
| DS: Q/design-query-begin-uncertain-insert-resolution-2026-10-11.md | `a43acda04119ee312a9452c38d32fc3a67b33e0cdf7a47193a6fff05be1844d1` |
| P10: Q/evidence/design-query-begin-uncertain-insert-resolution-round10-df779a90.md | `df779a902d3972db751eebdd8790b828ed8bfa2f422f042a60ecf1445c7acc53` |
| AUTHOR: Q/evidence/begin-round11-endpoint-feasibility.mjs | `a4c0edb447e39eb92c607a2e6262b71cfc41956328323a50bb5d0ca26c5495c2` |
| AF: Q/evidence/begin-round11-endpoint-feasibility.json | `ef187c6e28d804dfb06ab25d8854445f985893a3aa6bd44b92f17f17edaa3931` |
| PR10: E/review-begin-uncertain-design-round10-independent.md | `68e4b447c7f17e20971999025341ff864265ab2b276499c57ba66439a049d77a` |
| PR9: E/review-begin-uncertain-design-round9-independent.md | `92b86663bd692eab114e252fea6876d2b5f1a3911a2caf5ac6f470fbdf2f2fef` |
| PR5: E/review-begin-uncertain-source-round5-independent.md | `b4e08617230af527cbb4c66b7e33eb1b4f0d6f77b78010aa5bc23c7effdd2224` |
| P7 accepted predecessor: Q/evidence/design-query-begin-uncertain-insert-resolution-round7-3679b87f.md | `3679b87f4aeb84fd8d9397aac9f73f686e5fcb990c1e61e86df35e9731f91fa5` |

The full new appendix DS:2324–2685 and complete cumulative prior scope were reviewed. P10 is an exact byte prefix of DS. `D/provenance.json` records current hashes and verifies all twelve selected N source files against actual frozen B bytes: all match. Caller-untracked files included in N's preservation snapshot are present; they are not treated as deletions or concurrent mutation. Root's preservation commit `4cc1641aedd3b9303bb80120894887b31fe3fe25` is a preservation reference supplied by root, not a source-acceptance commit.

Steering remains AGENTS → rules → router and the authority/recovery, Quest and verification owners. All ten category templates, including their evidence-path requirement, govern the 63 dispositions below. The unchanged prior ownership, client, canonical-input and COMMIT findings are preserved at their actual historical scope.

### Executed evidence and limits

`D/commands.md` gives exact commands. The exact author driver was copied into an E-only relative layout and rerun; its output is byte-identical to AF. It instantiates tuple lengths and describes endpoint/schema schedules. Those arrays and booleans are not production transport execution or a complete native/reference census.

`D/independent-adverse-schedules.mjs` executes:

1. **Actual existing committed-origin application**, through `applyCommittedTransactionCommand`, inside an in-memory SQLite transaction, with the real participant store and enforcer. It produces V2 enforcement and origin `(index=7, term=3)`, then replays the same command without changing generation or origin. Only service logging, proposer answer and after-commit event sinks are stubbed; they do not decide schema/origin behavior.
2. **Real native schema controls:** direct exact V3 trigger installation into a valid empty table, and the existing owner's empty legacy-column installation path.
3. **Explicit executable design models** of deadline roles, exact tuple keys, grant/classifier-before-callback overlap, unused grant expiry, late classifier refusal, four origins, and finite-pool connection replacement. These are not imports of a future private endpoint.

`D/round10-native-controls.mjs` is copied unchanged from PR10's independent driver. It reruns the six real SQLite scalar/BOM/NUL/supplementary controls, three invalid UTF-8 refusals, real immutable key encoding and a canonical COMMIT manifest with a missing progress member. Its obsolete round-ten tuple/deadline/one-response models are retained as historical outputs only; they are **not** failures attributed to DS round eleven.

`D/evaluate-feasibility.py` reports **23/23 expected observations**, including the two grouped counterexamples. This is a diagnostic count, not a source-test acceptance count. The native COMMIT row remains unchanged, and these design diagnostics emit no production COMMIT or ROLLBACK. Actual ordinary recovery fanout remains PR5's prior evidence and a mandatory future source gate.

## Findings

### D11-1 — HIGH: connection replacement can consume the headroom needed to complete accepted work

**Affected categories:** admission, retry, resources, transport recovery, sweep progress, formation and owner interaction.

DS:2143–2160 keeps one fixed total and lets a capability enable/retire change the fixed allowance sum atomically. DS:2470–2476 now measures each generation's actual variable node/address/connection strings and requires a successor to obtain its newly measured allowance before exposing the route. DS:2495–2509 permanently charges its scratch and four frame slots. New records use only the remainder. This correctly makes the connection population finite **at any fixed admitted state**, but does not reserve a way to replace that population while retained obligations occupy the remaining capacity.

The native completion lane protects SQLite work; it does not fund the prerequisite successor connection allowance. DS:2591–2594 and :2661–2664 claim accepted work needs no other transaction to release, and the latter requires a full retained cohort to drain. That guarantee fails under the new dynamic connection cost.

`D/independent-adverse-schedules.json:capacity` gives a safe-integer, fixed-total counterexample (illustrative accounting units, not asserted production heap constants):

| State | Total T | Native reserve | Retained records/claims | Connection allowance | Free |
| --- | ---: | ---: | ---: | ---: | ---: |
| Previously lawful full admission | 1,048,576 | 262,144 | 753,664 | 32,768 | 0 |
| Old generation fully physically drained | 1,048,576 | 262,144 | 753,664 | 0 | 32,768 |
| Equal-envelope successor | 1,048,576 | 262,144 | 753,664 | 32,768 | 0 |
| Successor needs only one more measured unit | 1,048,576 | 262,144 | 753,664 | **32,769 required** | **enable refused** |

The equal-envelope positive control obtains its route and can use the protected lane. The larger-envelope case cannot enable the only current route even after every old physical reference has drained. Repeated sweeps cannot change the arithmetic. The design expressly avoids an invented fixed peer-ID length cap, so a changed legitimate address/identity envelope may cost more. An additional legitimate origin connection at an already full target exhibits the same missing capacity rule.

A concrete composition is target B holding a full cohort of valid live result claims, while origin A has an already admitted unresolved BEGIN whose classification route to B is replaced. B's claims need not retire just to let A classify. A preserves its exact ID/COMMIT debt and B's native lane is free, but A receives unavailable forever unless an unrelated B record releases, the global total grows, or a separately specified capability-reallocation rule makes space. None of those is the promised protected completion path.

This finding does **not** depend on premature frame release, malicious payloads, unbounded hosts, an infinite delayed callback or a new transaction being admitted under pressure. It holds after correct close/drain, with a finite ordinary replacement. Nor does it object to refusing genuinely unsupported historical stored-input sizes; the record was admitted under the current envelope and the failure is endpoint admission before classification.

**Required closure:** define the existing node resource/capability owner's bounded capacity rule for current, retiring and successor connection generations, and show that all previously admitted supported attempts still have a reachable classification route under that rule. Charge before enabling, retain physical roots until actual release, and preserve the fixed total and existing retry owner. The rule must address the concrete larger-successor/full-retained-cohort case; another assertion that the native lane is protected does not close it. No new scheduler, ledger or generic transport protocol is requested.

### D11-2 — MEDIUM: the schema table confuses lawful predecessor installation with defective originated storage

**Affected categories:** schema authority, replay, admission, formation and treatment fidelity.

DS:2604 permits V2→V3 only for a complete empty table with **no generation origin**. DS:2607 makes **every originated exact-V2 store INCOMPATIBLE**, together with missing/foreign enforcers. The normal existing V2 installation does not produce that upgrade precondition:

- EN:109–124 installs V2 inside the caller's existing application transaction.
- APPLY:577–602 installs the enforcer and records origin atomically; installation runs before checking an already recorded origin, so exact replay does not reset origin/generation.
- STORE:66–79,104–122 owns opening and origin recording.

The independent actual-owner witness produces:

```text
before: origin=null, enforcement=install_required
apply PARTICIPANT_GENERATION_ORIGIN at index 7 / term 3
result: applied
after: origin={originIndex:7, originTerm:3}, generation=0,
       enforcement=enforced, schemaVersion=2, rowCount=0
same command replay: replayed, origin and generation unchanged
round-eleven table for this exact state: INCOMPATIBLE
```

The counterexample reaches the real application mechanism. It is not a hand-fabricated V2/no-origin fixture. Since enforcer and origin commit together, the author model's unoriginated V2 case cannot demonstrate migration from the normal successfully installed predecessor. A crash does not turn the committed pair into that missing-origin state.

PR10 D10-4 required a distinction among lawful first install, lawful exact V2 upgrade and **missing/foreign** enforcement on an originated generation. It did not require classifying every exact source-owned V2 predecessor as defective. P10:2227–2235 already places the V2 replacement under the same paused current-cohort/drain proof and committed schema owner. The new restriction silently removes that intended progression.

There is a second supported branch in the same changed table: DS:2605 rejects all missing columns before origin, including an empty valid legacy shape. EN:112–121 allows the fixed missing columns to be added when row count is exactly zero, and CENSUS:41–44 distinguishes `EMPTY_LEGACY_SCHEMA` from a nonempty held census. `FEAS:schema.emptyLegacyShape` executes the actual existing installer, `install_required → enforced`, while the new table classifies the same empty predecessor as INCOMPATIBLE. The appendix's limited supersession at DS:2333–2337 does not identify removal of this existing empty migration path.

**Required closure:** specify the legal exact-V2/current-origin upgrade through the existing committed owner and ordered drain, preserving origin identity and write generation; keep missing/modified/foreign enforcement on an originated generation refused. Preserve the existing owner-controlled empty legacy-shape installation, or explicitly obtain and record the owner decision to remove that supported state. The real V2-plus-origin predecessor must be the positive control. Do not manufacture a no-origin V2 fixture, reinstall on read, rewrite live rows, reset origin or create another authority.

## Cumulative D10 corrections and remaining source gates

### D10-1: corrected deadline role

DS:2341–2366 captures the foreground turn before FIFO, caps it by original deadline, and gives server reconciliation a fresh bounded control turn after original expiry. `FEAS:deadlineRoles` demonstrates `now=6000, original=5000, reconciliationDeadline=7000` while foreground remains expired. The classifier cannot INSERT, enlist, remint or decide COMMIT/ROLLBACK. Ordinary recovery may subsequently redrive the already recorded decision under its own unchanged authority.

This is accepted as a **work-role split**, not a consumer-retirement rule. DS:2335–2337 preserves client entitlement; DS:2631 explicitly retains live advanced entitlement; DS:1324 and :1328 distinguish expired/advanced typed result retention from actual consumer retirement. Accordingly “server-owned” in :2362/:2622 must not clear the surviving live consumer's one-use typed expired/advanced disposition. Caller-only expiry still releases an attachment, not the record or consumer. These are preserved constraints, not a new finding or a request for new client semantics. Likewise :2632's shorthand cannot let a server-only role mint a replacement in contradiction of :2350/:2646–2648; the existing foreground collision owner remains the sole authorized remint path.

### D10-2: complete identity and same-response witness

DS:2375–2432 supplies phase/offset/bytes before grant minting and all four non-session immutable values on metadata, page and COMPLETE results. Session bytes are fixed-size raw octet pages. DS:2435–2442 requires exact `Object.is` comparison and monotonic advanced knowledge; :2444–2466 separates origin-local, target-local and outer connection generations and binds the actual current-leader witness to the same response/message.

`FEAS:shape` confirms the former omissions are filled. The exact grant's expiry is the captured turn deadline; the target's compact binding must retain the credit-request fields repeated by classification, including original deadline and turn start. The complete declared family, rather than the old eight-field sample or a bare digest, determines future strict validation and census.

The preliminary key remains routing evidence only (DS:2094–2106). It cannot activate, adopt, overwrite or release the record. Different key alone cannot mint a new transaction; command-specific definitive PK collision is still required. Metadata/each page/final completion must match the exact immutable six, contiguous page set, identity, generations and current-leader witness. Changed/missing data restarts a later bounded turn with the same record. An initial page followed by a valid advanced page remains advanced.

DS:2128–2134 still makes ordinary recovery reread full transaction, manifest, participant/fence and immutable identity before accepting an advanced marker. A manifest member without a progress row remains UNKNOWN/FAILED work to redrive; recorded COMMIT does not become ROLLBACK. The rerun native control contains the full canonical one-member COMMIT row and preserves its exact key and decision. PR5's actual same-session retry-first/recovery-first, missing-progress COMMIT fanout, real pgwire and explicit retirement controls remain cumulative source gates, not newly rerun production proof.

### D10-3: finite endpoint states are improved; capability admission is still incomplete

DS:2493–2594 provides distinct credit ACK/outcome and classifier ACK/outcome slots, permanently prepaid parse scratch, one compact binding, semantic expiry versus physical subclaims, expiry/classifier CAS, and a close-without-waiter response to occupied-slot reentry. `FEAS:endpoint` executes these model transitions:

- Four origins use four disjoint endpoint allowances; B/C/D pressure frames do not borrow A's occupied grant slot.
- Classifier before grant callback holds all four A frames at once, performs one native call, and each callback clears only its own slot.
- Expiry releases the native lane while the grant frame stays charged.
- Classifier after expiry uses the prepaid scratch/refusal slots and makes zero native calls.

The native lane is now explicitly held from grant mint to consumption/expiry, superseding the earlier “borrow only at SQLite” lifetime. No duplicate owner or waiter is needed. Equal-cost capability retirement/re-enable is a feasible control. D11-1 concerns the missing fixed-total progress rule across capability changes, not a recurrence of the four old frame-slot failures.

**Physical custody remains an implementation gate:** RETIRING (:2533) may release the allowance only after its actual frame/request roots have gone. A close event is a release mechanism only where the existing router/socket implementation really detaches those exact roots; semantic close, sender timeout or counter decrement alone is insufficient. MI:435–495 has ACK plus asynchronous handler/result closures; MD:698–701 currently exposes no send callback. The named router refinement must census those roots, native receiver/frame copies and late callbacks, including colocation, and compare exact old tokens before clearing anything. This is explicitly future work in :1933 and :2487–2491; its current absence is not an additional design rejection. No compression-only or hostile-host case was introduced to expand scope.

### D10-4: lawful first V3 install fixed, normal V2 predecessor still omitted

DS:2603 explicitly permits direct V3 installation into a complete empty pre-origin schema under the existing origin apply transaction. The independent native control proves the proposed exact trigger can be installed directly. That closes PR10's blanket missing-trigger first-install defect. D11-2 identifies the newly restricted predecessor states and preserves missing/foreign originated-enforcer refusal.

## Owner and source navigation

All source aliases below are under N and remain **unapproved navigation**, not acceptance of snapshot86af or the held B5 correction.

| Alias | Path |
| --- | --- |
| CO | src/query/distributed/distributed-transaction-creation.js |
| CR | src/query/distributed/distributed-transaction-creation-resources.js |
| CC | src/query/distributed/distributed-transaction-creation-contract.js |
| EN | src/query/distributed/distributed-transaction-schema-enforcement.js |
| APPLY | src/partition/partition-participant-transaction-apply.js |
| STORE | src/partition/partition-participant-transaction-store.js |
| CENSUS | src/query/distributed/distributed-transaction-release-census.js |
| MI | src/transport/message-router-inbound-dispatch.js |
| MD | src/transport/message-router-delivery-behaviors.js |
| CLOSE | src/transport/message-router-connection-close-reconnect.js |
| PE | src/partition/partition-service-entry-apply-base.js |
| OR | src/cdc/cdc-integration-service-owner-rpc-read-execution.js |
| CF | src/cdc/cdc-integration-service-authoritative-read-flow.js |
| QB | src/query/query-result-budget.js |
| FEAS | D/independent-adverse-schedules.json |
| NATIVE | D/round10-native-controls.json |
| EVAL | D/feasibility-verdict.log |

The self-dependent route inventory remains DS:1930–1970: node SQL runtime creates one shared resource context; every relevant control-partition factory receives it; the creation/persistence owner uses the private classifier through gateway/CDC owner-RPC/QueryExecutor/partition; router preflight owns receive/ACK/frame custody; partition SQLite owns bounded metadata-first native work; creation consumes exact evidence; ordinary recovery owns full reread and durable decision redrive. OR:410–430 selects required-leader/control-plane recovery admission; CF:464–511 must gain the expressly named skip of local row-set merge. PE:562–578,751–752,813 supplies the actual outer witness. QUERY/source/admission recognition must reach this path while mutation admission is closed. These named future changes are not a raw read, alternate recovery path or forced-open readiness gate.

## All 63 cumulative dispositions

**PASS** means coherent bounded design coverage or explicitly preserved prior evidence. **FAIL** identifies D11-1 or D11-2. **FUTURE** marks an implementation/canonical-proof gate, never a test claimed executed. Every item has a concrete design/source/diagnostic or prior scoped evidence path.

### Admission A1–A7

| Item | Disposition and evidence |
| --- | --- |
| A1 | **PASS exact preaccept/enforcement evidence; FAIL D11-2 schema parity.** DS:2435–2466 requires complete six and same-response authority; :2604–2607 rejects the lawful V2 predecessor shown by FEAS:schema. Prior client acceptance remains DS:1125–1175 and PR5:A1. |
| A2 | **PASS typed transient/hard/unknown policy.** DS:2420–2421,2542–2549,2571–2572 supplies invalid/input-capacity/expired/pressure outcomes; :2094–2106 forbids absence or key difference alone becoming collision. D11-1 is a permanently unsatisfied transient capacity case, not permission to reinterpret it as success. |
| A3 | **PASS deadline separation.** DS:2341–2366 captures original versus role-owned control turns before queueing. FEAS:deadlineRoles proves late reconciliation without new mutation/ACTIVE authority; PR5:A3 and S4 long-window controls remain scoped. |
| A4 | **PASS completed canonical successful tuples.** DS:2375–2466 supplies credit phase/offset, exact metadata fields, separate generation domains and outer witness. FEAS:shape confirms former omissions; typed refusal and actual wrapper census remain source gates (:2487–2491). |
| A5 | **FAIL D11-1 observable HOLD release; PASS existing owner.** DS:2171–2179,2623–2625 retains sweep/rotation, but FEAS:capacity.largerEnvelopeSuccessor has no capability release event that can create the missing unit without unrelated retirement. |
| A6 | **PASS per-decision freshness.** DS:2435–2466,2083–2088,2128–2134 requires exact record/scan/immutable/leader/resource generations after delivery and before recovery handoff. PR5:A6's exact map/workflow/shutdown fences remain required. |
| A7 | **PASS identity/debt distinction; FAIL D11-1 complete capacity prognosis.** DS:2526–2576 distinguishes live grant, expired binding, physical frames and durable obligation. FEAS:capacity retains the ID/COMMIT while showing free native capacity does not mean route eligibility. |

### Retry Y1–Y7

| Item | Disposition and evidence |
| --- | --- |
| Y1 | **PASS retained sweep fires; FAIL D11-1 useful reentry.** PR5:Y1 proves the existing DWC/lifecycle sweep after retirement; DS:2350–2359 gives it a live post-expiry control turn. A larger successor route remains unavailable in FEAS:capacity. |
| Y2 | **PASS bounded unreadable evidence without forgetting.** DS:2108–2118,2365–2366,2547–2549 retains the record on missing/invalid/unavailable/page expiry; prepaid fixed parse and no-SQL late refusal are exercised in FEAS:endpoint.late. |
| Y3 | **PASS typed exits and debt custody.** DS:2526–2576,2622–2633 separates timeout, expiry, occupied-slot close and shutdown from record release. PR5:Y3 caller/consumer retirement scope remains; actual callback/ref detachment is FUTURE. |
| Y4 | **FAIL D11-1 resource/route suppression; PASS client/sweep single claim.** DS:1324–1331 preserves one record and live entitlement; :2143–2160 plus :2474–2497 allows admitted capacity to exclude a necessary successor. FEAS:capacity pairs equal-cost progress with larger-cost refusal. |
| Y5 | **PASS bounded endpoint population at fixed state; FAIL D11-1 population transition.** DS:2495–2515 permanently prepays four slots and :2561–2567 closes occupied-slot reentry without waiter. FEAS:endpoint has 8 occupied frames within 16 prepaid slots. Successor admission still lacks protected capacity. |
| Y6 | **PASS late success/idempotence.** DS:2439–2442 retains monotonic advanced evidence; :2094–2106 retains command identity/no remint on uncertainty. PR5:Y6 retry/late INSERT and NATIVE:exactKeyAndPages remain cumulative. |
| Y7 | **PASS ACK never resets retry or releases credit.** DS:2569–2576 explicitly separates ACK and outcome physical subclaims; MI:435–470 confirms ACK-before-handler production semantics. PR5:Y7's no false recovery-counter reset is unchanged. |

### Transport T1–T5

| Item | Disposition and evidence |
| --- | --- |
| T1 | **PASS ACK versus processing/decision.** DS:2569–2572 and :2099–2106 deny semantic meaning to ACK and require actual PK disposition. PR5:T1 preserves INSERT/CommandComplete/pgwire acceptance distinctions. |
| T2 | **PASS late-response debt and generation ownership.** DS:2444–2450,2533–2559 fences old connection/resource tokens, holds frames after semantic expiry and bounds one retired binding. FEAS:endpoint.late exercises retained frame/zero-SQL refusal; actual close drainage is FUTURE. |
| T3 | **PASS typed outcome consumers.** DS:2370–2466 defines exact evidence through current leader response, consumed by creation and ordinary recovery (:2128–2134). No digest/ACK fallback authorizes. PR5:T3 typed caller errors remain scoped. |
| T4 | **PASS bounded missing route; FAIL D11-1 recovery route progress.** DS:2152–2154 gives unreserved connections unavailable and :2564–2567 uses existing retry. FEAS:capacity proves that restored transport plus full native capacity need not restore this private capability. |
| T5 | **PASS faithful seam/proof labels.** D/commands.md and FEAS:scope distinguish actual committed-origin/native execution from endpoint arithmetic/state models. AUTHOR's model booleans are not live ACK/close proof. DS:2643–2675 retains actual production witnesses. |

### Sweep/time S1–S5

| Item | Disposition and evidence |
| --- | --- |
| S1 | **PASS existing clocks/unref and pre-FIFO budget.** DS:2347–2359 applies the accepted DS:440–446 separation; FEAS:deadlineRoles demonstrates both original-expiry orders. PR5:S1 remains the source injected-clock/unref evidence. |
| S2 | **PASS correct recovery role and COMMIT authority.** DS:2350,2361–2366,2128–2134 allows read/handoff only, with ordinary recovery redriving recorded COMMIT. NATIVE:exactKeyAndPages and PR5:S2 preserve a real manifest member with no progress row. |
| S3 | **PASS memory/crash distinction and exact shutdown; FAIL D11-2 replay compatibility.** DS:2573–2576 fences transient endpoint resources without erasing durable debt; PR5:S3 retains exact disposal guards. FEAS:schema actual origin replay remains V2, refused by :2607. |
| S4 | **PASS legal long windows and late recovery.** DS:2341–2366 never renews the immutable transaction deadline; post-expiry reconciliation is separately bounded. FEAS:deadlineRoles and PR5:S4 cover long original windows versus spent caller turns. |
| S5 | **FAIL D11-1 starvation from capability admission.** The existing cursor/backoff at DS:2171–2179 still rotates; FEAS:capacity shows an infinite sequence of bounded unavailable turns cannot enable a larger successor without unrelated release. No new fairness scheduler is requested. |

### Recovery R1–R5

| Item | Disposition and evidence |
| --- | --- |
| R1 | **PASS no stale live-registry clobber.** DS:2094–2106 forbids adoption/overwrite from key evidence; :2435–2466 and :2128–2134 require exact current comparison. PR5:R1 live map/registry controls are preserved. |
| R2 | **PASS restart versus live pending distinction; FAIL D11-2 schema predecessor.** DS:1324–1329 preserves live typed disposition versus retired server work; :2365–2366 retains durable identity across turns. FEAS:schema proves a legitimate installed origin is not a missing-origin migration fixture. |
| R3 | **PASS enlisted obligations and legal empty.** DS:2128–2134 retains complete ordinary recovery population; :2672–2675 explicitly preserves missing-progress COMMIT redrive. NATIVE has a canonical one-member manifest and zero progress rows; no empty census erases it. |
| R4 | **PASS BEGIN replay CAS; FAIL D11-2 legal schema replay/upgrade.** DS:2439–2442 and PR5:R4 preserve monotonic identity/idempotence. APPLY:577–602 and FEAS:schema show actual exact origin replay; :2607 makes the lawful V2 predecessor terminally incompatible. |
| R5 | **PASS absence/unreadable never terminal success.** DS:2108–2118,2365–2366 and :2547–2549 keep old identity on missing page, changed witness or expired credit. Missing progress remains recoverable unknown; PR5:R5 remains historical. |

### Concurrency C1–C5

| Item | Disposition and evidence |
| --- | --- |
| C1 | **PASS synchronous slot/native reserve before side effects; FAIL D11-1 lifetime admission completeness.** DS:1919–1933,2474–2522 puts preflight and grant reservation before ACK/native work; four-slot overlap fits FEAS:endpoint. A retained record's later endpoint replacement is not protected by the admission equation. |
| C2 | **PASS post-await exact freshness.** DS:2083–2088,2435–2466 and :2128–2134 name origin record/scan/generation/leader/immutable rechecks. PR5:C2 and the preserved page controls cover changed consumer and advanced marker; future source must apply them after actual dispatch awaits. |
| C3 | **PASS single winner.** DS:2542–2549 makes classifier/expiry one resource-owner CAS; :1324–1331 keeps caller/sweep/retirement in one creation record. FEAS:endpoint exercises classifier-first and expiry-first outcomes; no second coordinator appears. |
| C4 | **PASS timer reentrancy contract.** DS:2535–2549 disarms the unused-grant timer after consume and releases physical slots independently. FEAS:endpoint.overlap/late never double-executes native work; exact callback/close source proof remains FUTURE. |
| C5 | **PASS actual grant/connection keys; FAIL D11-1 aggregate contended resource.** DS:2375–2413,2444–2450 binds phase/offset and connection delivery independently of local resource generations. The contended capacity is the node total across records plus current/retiring/successor capabilities (FEAS:capacity), not the native lane alone. |

### Formation F1–F5

| Item | Disposition and evidence |
| --- | --- |
| F1 | **PASS complete intended self-dependent route inventory; FUTURE binding.** DS:1930–1970 names runtime/factories/router/gateway/CDC/partition/source/admission. OR:410–430 and CF:464–511 identify the actual required-leader/recovery and local-merge sites to change. No new independent reader is claimed. |
| F2 | **FAIL D11-1/D11-2 supported degraded progress; PASS existing retry owner.** Recovery has a fresh post-expiry turn (:2350), but needed capability can remain unavailable and lawful V2 schema can remain refused. FEAS:capacity/schema supplies both concrete cycles/refusals. |
| F3 | **PASS original client budget; FAIL D11-2 supported startup predecessor.** DS:2349 fences expired foreground activity and :2603 permits fresh V3. :2604–2607 refuses normal installed V2 and empty legacy columns, demonstrated by actual owner controls. No normal startup claim is made. |
| F4 | **PASS checked bounded turn/page arithmetic; FAIL D11-1 endpoint capacity window.** DS:2349–2359,2393–2397 bounds role time and fixed pages; :2487 uses checked census sums. FEAS:capacity shows no finite retry window fixes insufficient successor allowance. Startup wall-clock margin remains a separate future gate. |
| F5 | **PASS no consistency bypass.** DS:2677–2685 forbids alternate reader, durable ledger, raw escape, generic protocol, new retry scheduler, manifest cap or total increase. Required D11 corrections stay within resource/capability and committed schema owners. |

### Harness H1–H6

| Item | Disposition and evidence |
| --- | --- |
| H1 | **PASS semantic engagement.** FEAS:schema actually reaches committed origin and exact replay; FEAS:capacity reaches the fixed-total admission equation, not import/setup failure. D/provenance.json pins current/predecessor bytes and all selected source. |
| H2 | **PASS seam fidelity and limits.** D/independent-adverse-schedules.mjs imports the actual apply/store/enforcer; only observer callbacks are stubbed. Endpoint schedules are explicitly models. PR5's real pg.Client versus helper scope remains unchanged; no model replaces it. |
| H3 | **PASS expiry/callback order controls; FAIL D11-1 churn ordering.** FEAS:deadlineRoles and endpoint cover before/after original expiry, classifier before grant callback, semantic expiry before late classifier. FEAS:capacity deliberately waits for full old physical drain before the failing successor enable. |
| H4 | **PASS complete fields.** AF tuple lists and FEAS:shape contain all four missing immutables plus phase/offset; NATIVE uses the real initial15 encoder and canonical advanced COMMIT/manifest. Numeric values are actual same-creation values, not local metadata promoted into freshness. |
| H5 | **PASS nonvacuous paired controls; FAIL D11-1/D11-2 contract closure.** EVAL contains equal-envelope versus larger successor, fresh V3 versus lawful V2 refusal, exact replay, empty legacy owner control, six scalar positives and three invalid UTF-8 refusals. 23 expected observations includes counterexamples. |
| H6 | **PASS claim ceiling.** DS:2637–2641,2677–2685 and this report distinguish native/component/model scopes from live startLagrangeRuntime. No source, heap ceiling, cluster, main or corpus acceptance is inferred. |

### Owner interactions O1–O10

| Item | Disposition and evidence |
| --- | --- |
| O1 | **PASS one semantic owner.** DS:1915–1940 preserves existing creation adjudication with one node-runtime resource context; :2128–2134 keeps ordinary recovery as durable decision owner; :2609–2613 keeps schema under committed apply. No projection adjudicates separately. |
| O2 | **PASS canonical typed seam; FAIL D11-2 state transition.** DS:2370–2466 supplies complete request/evidence ownership; the schema state shared by source/apply/census (:2609–2613) lacks the normal V2 predecessor progression (FEAS:schema). Prior DWC/session/pgwire seam is PR5:O2. |
| O3 | **FAIL D11-1 paired retention and usability; PASS preserved client identity.** FEAS:capacity keeps the accepted ID/COMMIT and honest charges but cannot restore the route; it pairs equal-cost success in the same equation. DS:1324–1331 and :2631 preserve live entitlement rather than sacrificing it for free capacity. |
| O4 | **FAIL D11-1/D11-2 stale-then-fresh convergence; PASS exact evidence restart.** DS:2460–2466 restarts on changed leader/generation. Correct new route or exact V2 predecessor still cannot progress under the new tables; FEAS:capacity/schema identifies why repeated canonical reentry is insufficient. |
| O5 | **PASS pressure obeys backoff; FAIL D11-1 completing work.** DS:2561–2567 closes occupied-slot reentry without queue; :2625 retains existing cursor/pressure. It must not bypass admission, discard claims or raise total to solve the demonstrated route shortage. |
| O6 | **PASS named canonical wake/release; FAIL D11-1 sufficient release.** DS:2530–2559 names consume, expiry, exact callbacks and ordered next-credit drain; CLOSE:103–160 owns actual disconnect/reconnect. FEAS:capacity remains blocked even after the exact old allowance releases. |
| O7 | **PASS projections never authority.** DS:2094–2106 keeps the key preliminary; :2435–2466 requires actual six-field/page/witness comparison and :2128–2134 full ordinary recovery. Resource counts indicate custody only, not durable transaction decisions. |
| O8 | **PASS fingerprints and negative treatment.** D/provenance.json verifies exact prefix/driver/native pins; EVAL separates current expected failures from preserved native positives. PR10/PR9/PR5 scope is not promoted. D11-2 names the new semantic restriction explicitly. |
| O9 | **PASS intended no-fallback inventory; FUTURE real route implementation.** DS:1930–1970,2679–2685 names every runtime/partition/router/CDC owner and forbids raw/local alternate success. MI:50–52,435–495, MD:698–701 and PE:562–578 are concrete current boundaries, not existing private-token proof. |
| O10 | **PASS required coupled contract/registry/canonical proof gate; add both counterexamples.** DS:2643–2675 preserves production/client/recovery and source-registration witnesses. Future source packet must update the existing coupled impact contract and canonical runner together, with actual V2-origin and successor-capacity controls. No manual-only diagnostic substitutes for that gate. |

### Canonical JavaScript J1–J8

| Item | Disposition and evidence |
| --- | --- |
| J1 | **PASS numeric lattice/checked arithmetic; FAIL D11-1 semantic capacity sufficiency.** DS:2370–2373,2487–2491 pins safe integers/no -0 and checked sums; :2349–2359 pins original versus control budget. FEAS:capacity fails with entirely safe values; arithmetic validity alone does not reserve completion resources. |
| J2 | **PASS exact own fields.** DS:2370–2432 requires dense exact-own-data non-proxy records and supplied immutable values; PR5:J2 preserves strict own-property config/row capture. Extra/omitted fields remain refused; old tuple omission is corrected. |
| J3 | **PASS once-captured inputs.** DS:2448–2453 captures delivery/witness once and :2470–2475 measures immutable connection strings before enabling. DS:2208–2222/PR5:J3 preserve accessor refusal/no re-read and exact scalar bytes. Actual new capture code is FUTURE. |
| J4 | **PASS inherited/prototype refusal.** DS:2370–2373 requires exact own data; PR5:J4 and PR10:J4 preserve hostile inherited-field controls within the accepted input boundary. No inherited default can manufacture authorization. |
| J5 | **PASS boxed/exotic rejection.** DS:2370–2373 and preserved CC:61–107 require primitive canonical numbers/enums/strings before encoding; PR5:J5 coverage remains scoped. No truthy/empty authorization default is introduced. |
| J6 | **SCOPED N/A beyond existing trusted host; preserved boundary PASS.** PR5:J6/PR10:J4–J6 and DS:2370–2373 retain own-data input protection. No new hostile global-intrinsic mutation immunity requirement is inferred for repository-owned internals. |
| J7 | **PASS canonical bytes before coercion.** DS:2208–2222,2435–2439 keeps scalar primitive validation, fatal BOM-preserving UTF-8 and raw page octets; NATIVE:scalar/utf8Rejections proves six native positives and invalid encodings refused. Creation key bytes remain unchanged. |
| J8 | **PASS bounded page/array/manifest ownership; FAIL D11-1 complete lifetime census.** DS:2393–2397,2427–2429 bounds page materialization and :2128–2134 keeps the manifest in ordinary recovery. DS:2487–2491 requires actual root/native census before constants; connection-generation transitions still need the fixed-total closure shown by FEAS:capacity. |

## Required next step and limits

Correct D11-1 and D11-2 together within the already named resource/capability and committed schema owners, preserving the accepted role/identity/client/COMMIT model and the newly coherent endpoint states. Then freeze the amended design for a bounded author-distinct review. This report grants no permission to implement the held source during design correction.

Future source acceptance must prove the real pre-parse/ACK/dispatch/private-native/witness/consumer path, full retained-reference census with connection churn/colocation/late close callbacks, exact target token CAS, the actual lawful schema predecessors, strict canonical tuples and mixed-role saturation. It must renew both same-session retry orderings, real pg.Client `I/T/E` transitions and post-CommandComplete failure behavior, actual missing-progress COMMIT redrive with zero ROLLBACK, caller expiry versus retirement, shutdown/exact-object fences, rotating sweep/backoff and strict initializer/config capture through registered coupled contracts and canonical tests.

Global complexity **1780 > 1755** and source-file count **29 > 27** remain known, unwaived source gates. The touched-file ceiling and prior component counts do not waive them. Normal startup/cluster, activation/C3, main/merge and corpus acceptance remain separate. The old source acceptance status and exact durable decision authority are unchanged.

Artifact hashes are in `D/manifest.sha256`; `D/provenance.json` pins external source dependencies. The manifest excludes this report to avoid self-reference; root should retain the report's independently returned SHA-256 with the manifest.
