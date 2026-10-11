# Activation cycle round 12 — independent design review, round 2

## Verdict

**REVISE the complete cycle handoff; source remains HOLD.** Three grouped contract boundaries remain:

- **AC12-1 — high:** exact claim custody starts at committed control-row application, leaving the interval after claim submission and before that application without a named durable exact-command recovery record.
- **AC12-2 — high:** conditional supersession is not specified through the actual current-attempt dispatch boundary. Its immutable command, current execution envelope and deterministic dependent predicate remain ambiguous precisely when the captured PAUSE attempt is stale.
- **AC12-3 — medium:** the closure ordinal lacks an explicit durable control-history domain and continuity/refusal rule. The same-lineage high-water proof is feasible; applying it to an old target through a recreated/replaced control owner is not yet defined.

These are design findings, not demands that future source tests already pass. They do not reopen the accepted local HOLD / owner-ordered retirement / deterministic apply semantics.

**Scoped positives retained:** the committed control claim now precedes dependent PAUSE; it stores the complete descriptor and exact PAUSE bytes after commit. The modeled losing contender has no PAUSE right. Monotonic dependent fences can reject delayed old PAUSE within one control history. A bounded high-water can answer delayed A after B/C without keeping unbounded history. The corrected evidence attribution, same-attempt post-ENABLE catch-up, complete population, original foreground budget versus later recovery turn, and R7-2 resource contract remain preserved.

No production source, startup, C3, FreshMG, main, merge, corpus or distribution approval is implied. No product/design/test/metadata/Quest/index/commit/push mutation occurred. New writes are this report and D diagnostics only. No cluster was run.

## Exact subjects and provenance

- A = `/mnt/data/peter/projects/.worktrees/rs-raft-startup-activation-20261011`
- Q = A/`solve/quests/replicated-transaction-decision-and-apply`
- E = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`
- D = E/`activation-cycle-design-round2-independent`
- N = D/`navigation`, pinned actual owner files.

| Alias / artifact | SHA-256 |
| --- | --- |
| DS: Q/design-participant-release-activation-authority-2026-10-11.md | `3aeadfe3b654b6b065cd99ac6d9df583dc2fff4a3636225517da8a945763a32d` |
| P11: Q/evidence/design-participant-release-activation-authority-cycle-round12-predecessor-819e4590.md | `819e4590be60f90a2f1918f6db7899b516c68b7110f91775d1b6495565d5d612` |
| PR1: E/review-activation-cycle-design-round1-independent.md | `5e602b16fac568165bacf2269eb2216108769ee443b57ef1f1bc5815f77148a2` |
| Accepted prefix P10 | `82b11d80a3a4f8abe2b29e5377b9effb73c658384997df34051d2287f29906b9` |
| AUTHOR: Q/evidence/activation-cycle-round12-feasibility.mjs | `2f4ff655f28c82d50807cf4ff0c2f145ea8178714d7b8d34ac662fc4d78d8141` |
| AF: Q/evidence/activation-cycle-round12-feasibility-result.json | `e295803e20127e502e04b7b0ca8eaabec4bed336c6932edf5b1609cd74009f9e` |
| Author evidence note | `efca1ca0ce4944070b05c13d7b2b3a2b795db81710c261ada177c825dc3dd411` |
| Author five-entry manifest | `994656f48468886ccb88970cc2b4e8efd20642d0f06760a5114cc4c6330a58b4` |

DS's complete new appendix and cumulative operative clauses were reviewed against PR1 and the accepted prefix. Both P11 and P10 are exact byte prefixes. Product navigation remains **unapproved snapshot `14fac7d6ef64881daa7a0d266a272b724dfe640a`**. This review independently checked all 1936 blobs selected by `src, package.json, package-lock.json` against actual A: zero mismatches. This is the exact population selected by this review's command; the count is not a source-change claim. Twenty directly read owner/steering/impact files are copied under N. D/provenance.json carries exact hashes and packet checks.

Root's preservation snapshot `b000ae6eea12ce6413e2f6441dd0c49982f109de` retains exact DS. Preservation does not confer source or design approval.

Steering was AGENTS → rules → router; authority-and-recovery and the ten verification templates governed the complete 63-item pass. Current templates retain the already-read requirements. Existing trusted-host scope is preserved; no arbitrary direct Raft injection or hostile intrinsic runtime is introduced as a new requirement.

## Evidence executed and honest limits

### Exact author feasibility

The exact AUTHOR program was copied to D and run unchanged with `/tmp/cdc-node-cap-20261012/node` v22.22.0. Its output is **byte-identical to AF**, including all ten expected observations. It is explicitly a deterministic model with supplied indices/terms; it imports no production apply function.

Useful positives in that model are committed-claim restart, loser-before-effect refusal, same PAUSE/RESERVE replay, delayed old PAUSE under a newer same-dependent fence, supersession-before-PAUSE, and three distinct dependent cycles before delayed A retirement. It models only a single uninterrupted control history. It does not model claim submission before commitment, actual receiver/current-attempt gates, remote validation of old target authorization, or control-history replacement.

### Actual source and retained diagnostic

The unchanged PR1 native script was copied to D/prior and rerun against exact A. It executes canonical PAUSE building, actual SQLite private apply/store, pause-generation CAS and singleton control-revision CAS. Commit coordinates are supplied to the private apply fixture; it is not production Raft commitment. It again obtains:

- first PAUSE generation1; exact immediate replay remains1;
- B PAUSE generation2; delayed A PAUSE generation3;
- consumption conditional on generation2 refuses; the same CAS at generation3 succeeds;
- one actual control-revision CAS winner; second expected-revision writer loses.

Those observations remain **current unapproved source behavior** that the new design intends to replace, not counterexamples executed against nonexistent new code.

The instrumented replica database was copied and opened read-only. D/native-retained-control-reread.json corroborates controlRevision54 and RETIRED authorization `f1aa601553cec2802a03e0ffa0577465a1e79491d808a67d77f126c39dfb7b04`. PR1's retained diagnostic identifies the older `b24ae48e...` RETIRE repeated219 times at indices60–278. DS:3091–3107 now attributes that correctly and separately from the exact oracle's startup refusal. The copied unchanged pgwire oracle remains RED; no new production run supersedes it.

### New bounded independent diagnostic

D/independent-boundaries.mjs/.json separates:

1. An explicit design model of unchanged named durable facts before claim submission versus after uncertain submission but before commit. Rebuilding the captured descriptor after a leader change changes its claim/PAUSE IDs. The post-commit positive recovers the original exact descriptor.
2. Execution of the exact `attemptMatches` function extracted from RECEIVER:37–42: old term7/leader1 accepts before change, refuses against current term8/leader2, and a current execution envelope accepts. This is the real predicate, not a full receiver invocation or future supersession test.
3. Execution of the exact author `historicalRetirement` model with same-domain and different-domain old authorizations. It returns the same superseded result because the model consumes only ordinal/high-water. This illustrates the unstated domain condition; it is **not** a running-product false retirement or evidence that an arbitrary recreation is currently legal.

The diagnostics neither propose commands nor open admission. Their fixed model values are not committed certificates. Commands, exact hashes and limits are retained in D/commands.md and D/manifest.sha256.

## Complete grouped findings

### AC12-1 — HIGH: the submission-to-commit claim interval still lacks recoverable exact custody

**Contract locations:** DS:3114–3115,3130–3202,3375–3389. **Actual owners:** WORKFLOW:55–84,124–161; SEED:192–239; REQUEST:29–41; AUTH's process-local capabilities. **Diagnostic:** FEAS.claimCustody.

The new design correctly moves the durable control winner before PAUSE. Once CLAIM is **committed**, the control row contains root/effect/original deadline, captured predecessor/configuration/attempt and exact PAUSE bytes, so lost PAUSE replies and later compaction can be recovered.

The remaining interval is earlier:

```text
capture root + terminal predecessor + dependent attempt + exact CLAIM/PAUSE
submit CLAIM through operation/transport/Raft owner
origin process dies before committed result or authoritative replacement
control application row is still the prior terminal row
```

DS:3114 promises the exact claim is retained from submission, but assigns its byte custody to route/body/control-candidate reservations. Those are physical memory/resource lifetimes, not a durable record across origin shutdown. DS:3193–3199 makes the control row's ownership start at committed application. No pre-submit revision-CAS of the exact cycle/claim attempt is named in the existing startup/CREATE/operator durable record.

A durable root/effect does not reconstruct the captured predecessor, dependent leader/term and exact command. FEAS shows two captures from the same durable root differing in that attempt produce different IDs. Ordinary replacement of startupInvocation (SEED:214–239) is specifically an execution fence; it cannot stand in for the old capture. REQUEST:29–41's pending-outcome/readback path needs the exact entryId; a volatile pending response is not a post-crash locator.

An empty or old terminal **application** row while CLAIM is queued, forwarded or tentatively appended does not prove nonapplication or replacement. DS:2729–2745 already requires those distinctions. Reading the descriptor after it eventually commits works; the missing case is preserving identity and resolving the branch where the candidate is still uncertain or is replaced before ever appearing in that row. A later fresh capture cannot be relabeled same-command recovery.

The operator wording also needs reconciliation with the preserved accepted contract. DS:846–854 and :887–925 require the exact accepted operator command/effect in the startup/command owner. DS:3114,3172–3178 refers to a live operator request/capability and says a crash “before claim” has no effect. That is safe **before submission**, as the table says; it cannot classify the submitted-but-unresolved interval as effect-free or silently remove the earlier durable accepted-command obligation.

**Required closure:** name the existing durable root/operation/command owner's exact pre-submission claim-attempt capture and readback/retirement transition, or an equally explicit existing-owner custody mechanism that survives this interval. Include exact command bytes/identity, captured predecessor/attempt, original deadline and unknown/replaced state; preserve them until canonical commitment or same-identity replacement evidence. This can extend an existing record. No second ledger, coordinator or retry owner is requested. The decisive pair is crash before submission versus crash after submission/before commit, followed by both later commitment and authoritative replacement.

### AC12-2 — HIGH: stale-attempt supersession has no complete current-execution / immutable-effect contract

**Contract locations:** DS:3116,3180–3192,3214–3265,3350–3379. **Actual owners:** RECEIVER:37–42,373–419; REQUEST:44–85; COMMAND:155–165; APPLY:108–120; STORE:135–157. **Diagnostic:** FEAS.supersessionBoundary and AF's deliberately simplified supersession.

The winner-before-PAUSE ordering and per-dependent monotonic fence are coherent. Within one unchanged history, the model now blocks B before its effect and makes A→successor→delayed A inert. That closes the original control-CAS-after-side-effect schedule at the design level.

The branch meant to recover a **stale captured attempt** is not yet executable without choosing a new contract. DS:3247–3265 calls for “one exact conditional supersession command” and a later leader's bounded execution turn, but does not define that command's canonical fields, identity derivation/persistence point, current routing envelope, or full deterministic apply predicate. The text declares a total order; the actual caller must first be able to deliver the command legally.

The existing receiver checks current target generation, leader/term/configuration and runtime lifetime before action (RECEIVER:388–419). The old PAUSE command deliberately retains its captured leader/term. Therefore:

- replaying the old attempt envelope after leader/process replacement is correctly refused before apply;
- updating immutable PAUSE/claim fields would violate the new exact-cycle rule;
- using a **current execution envelope** around a distinct supersession of the **old immutable cycle** can be feasible, but the amendment has not specified where that separation is owned, captured, persisted, rechecked and consumed.

The same issue recurs if leadership changes after supersession itself is submitted and its answer is lost. “Read back by entryId” requires an exact durable identity and an allowed current route; it does not explain which fields may change, which command remains fixed, or how a same-cycle pre-PAUSE fence differs from an accepted PAUSE being retired.

The model bypasses this seam: `supersedeCurrent()` directly calls a local function with dependentId/cycleId/ordinal; it supplies no actual request attempt, generation/configuration, expected prior fence, committed claim identity/proof binding or held outcome. That is an honest limited model, not the missing contract.

**Required closure:** define the canonical supersession operation within the existing release owner: immutable old-cycle/control-history/dependent identity and expected fence; exact command ID/body custody before dispatch; separately current operation/lifecycle/configuration routing evidence; deterministic replicated predicate and exact typed proof; replay/late-answer/changed-attempt behavior. Cover PAUSE-first, supersession-first, a changed target attempt before supersession, and another change after submission. Keep ordinary mutation admission closed, preserve original deadline and allow only the existing bounded recovery turn. No socket/clock/volatile remote lookup may enter committed apply. No raw Raft bypass or new owner is authorized.

This is an incomplete handoff specification, **not** an observed production deadlock in a future supersession implementation, and does not demand a new full source test before design approval.

### AC12-3 — MEDIUM: closure high-water must be bound to one durable control history

**Contract locations:** DS:3142–3161,3217–3228,3284–3346. **Actual owners:** ID:14–30; STORE:114–123,168–176; APPLY:500–513; RETIRE:58–89,93–125,130–175. **Diagnostic:** FEAS.highWater; AF three-dependent A/B/C positive.

A high-water is a sound bounded summary **within a single gap-free control history**: each next ordinal is admitted only after its predecessor's dependent closure proof. That makes “all cycles at or below N are inapplicable” possible without storing every prior cycle. The A/B/C delayed-target model demonstrates that part and leaves C unchanged.

The declared old-target request/result and dependent fence do not identify which durable control history the ordinal belongs to. They carry controlPartitionId, cycleId/ordinal, current closure index/term/revision and old authorization/target. DS:3343–3346 prohibits reset on **restart**, but does not define control-history continuity through snapshot/replica replacement or what happens on a genuinely new/recreated control generation. Current leader/lifecycle checks establish who serves **now**; they do not establish that the current ordinal sequence contains the old authorization's cycle. Release ID (ID:14–30) binds partition/build/configuration generation; it is not declared an immutable history epoch, and legitimate reconfiguration must not discard closure history.

The current row deliberately no longer has A's cycle mapping after several cycles. Consequently it cannot recover the missing relationship simply by comparing A's cycleId to current C. The target's genuine durable old authorization proves that A authorized that target; it does not, by itself, prove that a same-named current control row's N belongs to A's history.

FEAS passes an exact author model a same-domain versus foreign-domain old authorization and obtains identical results. This is a contract counterexample **if a new history can be reached under the same routed logical partition**. It is not an assertion that existing startup may reset storage or that current guards permit such a transition. The design must resolve that condition explicitly instead of treating every current row as comparable.

The acceptable continuation can remain bounded: bind the ordinal/fence/authorization/result to the existing durable control-origin/history identity, and preserve that identity plus high-water during legitimate restart/snapshot/replacement; or state the existing owner rule that makes identity reuse/reset impossible and gives a canonical retained HOLD on incompatible recreation. Do not use transient boot/lifecycle/leader term as the epoch, because ordinary leadership/restart must still recover old A. Do not require unbounded history.

**Required closure:** give one canonical producer/consumer rule linking old durable target authorization to current history-scoped high-water, including exact target revalidation after the asynchronous read and a no-successor-yet fence. Name how ordinary state transfer preserves it and how history loss/recreation refuses or is ordered through the existing authority. No generic STALE, different current authorization ID or bare scalar comparison may release successor-publication debt.

## Preserved positives and cumulative owner limits

### Pre-effect ordering and post-commit restart

DS:3115,3193–3202,3206–3212 makes CLAIM the global singleton CAS winner. No dependent PAUSE is dispatched until exact committed result/readback. The descriptor includes the exact original PAUSE body, so a later process may recover it without rebuilding under a new leader. The intent→cycleId→body/entryId order avoids a self-referential hash. This repairs the original **post-PAUSE/pre-RESERVE** gap; AC12-1 identifies the earlier unresolved-submission edge rather than rejecting that improvement.

### Local versus replicated facts

DS:2685–2786 remains binding: local affected generation closes admission and wakes the one recovery owner; known invalidity is checked at actual dispatch; queued/forwarded/CORE_OK/append is not commitment. Replicated apply uses only immutable commands and replicated state. Committed historical authorization is not cancelled by a later disconnect. Controlled successor publication waits for canonical retirement and exact current consumer applicability. No new wall-clock precedence, cross-group volatile apply read, pin protocol or local vote is requested.

### Complete population and catch-up

DS:3000–3017 and :3118 retain all current members/configuration/attempt/lifetime/work facts under one original deadline. Same-attempt follower lag waits via the existing wake/poll and does not mint another PAUSE; changed membership/incarnation refuses. All required control members and target OPENED receipts remain complete fixed populations, not successful subsets. Empty/unreadable census remains HOLD.

### Time, pressure and ordinary startup

DS:3375–3379 preserves original foreground deadline and later bounded recovery execution. A later turn cannot create a new foreground cycle or renew the old deadline. DS:3383–3389 charges descriptor/candidate/old-row/command/response overlap before effect, under existing node release and R7-2 route-resource owners. Their exact measurement and physical lifetime source gates remain open; this review does not approve coefficients. Registration stays a NEW WRITE after lawful authority; snapshot/CDC/recovery must remain possible under closed admission through existing owners. The sole readiness publisher and accepted C3 semantics remain untouched.

## Owner aliases and exact evidence paths

All source aliases are pinned under N and remain unapproved snapshot14fac navigation.

| Alias | Path |
| --- | --- |
| WORKFLOW | src/bootstrap/startup-workflow-store.js |
| SEED | src/bootstrap/seed-startup-session-store.js |
| AUTH | src/node/participant-release-authorization-owner.js |
| CUTOVER | src/node/replica-handler-participant-cutover.js |
| RECEIVER | src/node/replica-handler-participant-release.js |
| RECOVERY | src/node/replica-handler-release-recovery.js |
| RETIRE | src/node/participant-release-lifecycle-retirement.js |
| REQUEST | src/partition/partition-participant-release-request.js |
| COMMAND | src/partition/partition-participant-release-command.js |
| APPLY | src/partition/partition-participant-release-apply.js |
| STORE | src/partition/partition-participant-transaction-store.js |
| ID | src/partition/partition-participant-release-identity.js |
| FACTS | src/partition/partition-participant-release-facts.js |
| PAUSE | src/partition/partition-participant-transaction-pause.js |
| FEAS | D/independent-boundaries.json |
| NATIVE | D/current-native-seam-rerun.json |
| AF | D/author-rerun.json, exact author model |
| DB | D/native-retained-control-reread.json |
| IMPACT | N/test/shards/impact-contracts.json |

## Complete 63-item disposition

PASS/PRESERVED means coherent design or historical scoped coverage, **not source acceptance**. FAIL references the three grouped findings; FUTURE identifies source-binding work rather than an additional design rejection.

### Admission A1–A7

| Item | Evidence and disposition |
| --- | --- |
| A1 | **PARTIAL / FAIL AC12-1/2.** DS:3193–3202 puts committed winner before dependent effect; :3230–3244 defines monotonic apply. Uncertain claim custody and actual supersession consume shape remain incomplete. |
| A2 | **PASS with AC12-3 boundary.** DS:3208–3212 HELD/STALE; :3300–3308 canonical superseded versus unknown; :3000–3017 lag versus incarnation change. Cross-history comparability is not an ordinary transient success. |
| A3 | **PASS budget separation; FAIL custody AC12-1.** DS:3375–3379 and preserved :821–827 distinguish original request and bounded later turn; exact captured identity must survive submission. |
| A4 | **FAIL AC12-2/3.** DS:3138–3161 complete descriptor direction is useful, but supersession canonical body/current envelope and history-bound old result lack their complete consumer shape. |
| A5 | **PARTIAL / FAIL AC12-2.** DS:3258–3265 requires exact dependent proof before slot release; the stale-attempt route to obtain that proof remains undefined. Existing wake owner RECOVERY:40–55,93–119 preserved. |
| A6 | **PASS final fences; FAIL AC12-2/3 handoff.** DS:2685–2786 and RECEIVER:388–419 revalidate current population/attempt; currentness must be separated from old immutable effect/history rather than substituted for it. |
| A7 | **PASS truthful attribution; FAIL AC12-1/3 identity scope.** DS:3091–3107 corrects RETIRE/oracle distinction; root/control/target diagnostics must name the retained exact submitted identity and comparable history. |

### Retry Y1–Y7

| Item | Evidence and disposition |
| --- | --- |
| Y1 | **PASS one firing owner; FAIL useful continuation AC12-1/2.** RECOVERY:40–55,93–119 has actual event/timer reentry. It cannot reconstruct unstored captured bytes or choose the missing supersession envelope contract. |
| Y2 | **PASS.** DS:2781–2786,3307–3308,3375–3379 retains unreadable debt under a bounded execution turn; no absent-row completion. |
| Y3 | **FAIL AC12-1 preclaim stop; PASS named later phases.** DS:3114–3120,3350–3372 owns committed states and terminal proof; submitted-but-uncommitted custody is not assigned durably. |
| Y4 | **FAIL AC12-2.** Control cannot close until dependent supersession proof (:3258–3261); recovery must reach that dependent under a changed current attempt without requiring the obsolete attempt it is settling. |
| Y5 | **PASS preserved bounds / FUTURE measured copies.** DS:864–880,1949–2006,3383–3389 keeps four attempts, one preflight and bounded pending bytes; no retry/participant cap or new timer increase. |
| Y6 | **PASS modeled monotonic safety; FAIL full identity AC12-1/2.** AF delayed A under successor is inert; NATIVE exposes actual old1→2→3 behavior. Uncertain claim/supersession identities need the missing durable handoff. |
| Y7 | **PASS.** DS:2729–2745 explicitly excludes ACK, forwarding, CORE_OK and append as result/reset. New claim and supersession inherit this rule; AF coordinates are not certificates. |

### Transport T1–T5

| Item | Evidence and disposition |
| --- | --- |
| T1 | **PASS.** DS:3193–3199 requires committed claim/readback before PAUSE; :2729–2745 actual commit/replacement distinctions remain binding. |
| T2 | **PARTIAL / FAIL AC12-2.** DS:3230–3238 monotonic dependent fence blocks old PAUSE; AF's same-dependent successor positive works. Exact queued supersession scope after target change still needs definition. |
| T3 | **PASS semantic distinction; FAIL history binding AC12-3.** DS:3300–3324 makes RETIRED_SUPERSEDED whole-cycle inapplicability, not target RETIRE or generic STALE. RETIRE:168–175 needs the explicit canonical new consumer branch. |
| T4 | **PASS bounded HOLD; FAIL continuation AC12-2/3.** DS:3307–3308,3375–3379 retains debt on no route/read; restored current route does not automatically validate old attempt/history. |
| T5 | **PASS honest fidelity.** AUTHOR imports no production; NATIVE executes private SQLite apply/CAS only; FEAS extracts one actual request predicate. No future receiver or distributed runtime is claimed. |

### Sweep/time S1–S5

| Item | Evidence and disposition |
| --- | --- |
| S1 | **PASS preserved.** RECOVERY:25–32,40–45 injected clock/unref; DS:1269–1297 same wake owner. No new timer or expiry reset. |
| S2 | **PASS principle; FAIL AC12-2 binding.** DS:3239–3244 forbids volatile apply lookup; RECEIVER:388–419 current leader/generation gates remain. New supersession must connect both without weakening either. |
| S3 | **FAIL AC12-1/3.** Committed descriptor survives (AF crashCopy), but precommit capture has no durable custodian and history continuity across replacement is unstated. Restart alone must not reset either obligation. |
| S4 | **PASS.** DS:3375–3379 and :821–827 preserve valid long recovery after spent foreground entitlement; expired commands remain owed, not evicted or reminted. |
| S5 | **PARTIAL / FAIL AC12-2.** Preserved DS:2428–2434 closed-admission recovery and preflight capacity remain. Stale-attempt settlement must be callable while that admission is closed. |

### Recovery R1–R5

| Item | Evidence and disposition |
| --- | --- |
| R1 | **PASS scoped conditional design.** DS:3230–3238 rejects older accepted/superseded ordinals without changing generation or successor authorization. AF same-dependent late A control preserves generation2; actual NATIVE old code remains unapproved. |
| R2 | **FAIL AC12-1/3.** DS:3164–3202 names durable roots and exact committed bytes, but SEED:214–239 new invocation cannot reconstruct an uncertain old capture. Current control history must also be the old authorization's history. |
| R3 | **PASS.** DS:2685–2690,3004–3009 retains full current control population/target receipts; :3307–3308 missing target authorization does not imply empty or retired. |
| R4 | **PARTIAL / FAIL AC12-1/2/3.** AF covers immediate PAUSE/RESERVE/supersession replay and A/B/C; exact claim before commit, stale supersession execution and history-scoped compaction/replacement still need contracts. |
| R5 | **PASS invariant; FAIL missing locator AC12-1.** DS:2729–2745,2781–2786 excludes missing application row as replacement/cancellation. The owner must retain the exact identity needed for that readback. |

### Concurrency C1–C5

| Item | Evidence and disposition |
| --- | --- |
| C1 | **PASS winner ordering; FAIL AC12-1 custody.** DS:3193–3202 moves control CAS before PAUSE; AF loser has zero dependent effect. Exact candidate retention is still needed before submitting that CAS. |
| C2 | **PASS current checks; FAIL AC12-2.** DS:2718–2727 and RECEIVER:388–419 enforce post-queue/current attempt. Immutable old command and fresh execution evidence need an explicit capture/consume boundary. |
| C3 | **PASS.** DS:3206–3212 names the global control singleton across all dependents; local singleflight only optimizes. NATIVE control CAS and AF no-loser-effect pair bind that direction. |
| C4 | **PARTIAL / FAIL AC12-1/2.** AF exercises replay and stale old PAUSE, but claim submission/crash and changed-attempt supersession after lost answer require owned transitions; existing event coalescing remains. |
| C5 | **PASS keys; FAIL domain AC12-3.** DS:3206–3228 names control singleton plus dependent row, rather than per-process locks. Ordinals on those keys still need a durable shared control-history scope. |

### Formation F1–F5

| Item | Evidence and disposition |
| --- | --- |
| F1 | **Inventory complete / FAIL AC12-1/2.** Durable seed/CREATE/operator root → candidate → control claim → dependent PAUSE/supersession → control continuation → ENABLE/census → RESUME/confirmation → retirement/successor (DS:3114–3120,3430–3437). The first uncertain and stale-dependent crossings remain open. |
| F2 | **PASS prior architecture; FAIL AC12-2 usable recovery.** DS:2428–2434 keeps snapshot/CDC/release recovery ahead of admitted registration. New supersession must use current recovery routing while mutation admission stays closed. |
| F3 | **PASS.** Accepted P10/DS:2669–2680,2770–2779 leaves seed registration a NEW WRITE requiring lawful authority; no force-open or changed readiness publisher. Oracle remains red. |
| F4 | **PASS total window; FAIL recoverability AC12-1.** DS:3375–3379 covers discovery through initial dispatch once, plus bounded later execution. No stage/ordinal replenishes the foreground deadline; precommit capture must retain it. |
| F5 | **PASS prohibition.** DS:3240–3244,3388–3390 and accepted owner ruling exclude raw Raft/DB authority, volatile apply predicates, second coordinator or bypass. Findings request complete existing-owner contracts. |

### Harness H1–H6

| Item | Evidence and disposition |
| --- | --- |
| H1 | **PASS mechanism distinction.** PR1 native causal1→2→3 and retained RETIRE are preserved/rerun. New findings use missing-contract schedules, not failure to import future commands or missing tests. |
| H2 | **PASS.** NATIVE executes real PAUSE builder/store/apply and control CAS with supplied coordinates; FEAS actual attempt predicate is separately labeled. AF remains model-only. |
| H3 | **PASS modeled order / FUTURE production.** AF catch-up compares same incarnation; DS:3375–3379 separates expired foreground from later turn. FEAS captures submission before commit and target attempt change without claiming a runtime crash test. |
| H4 | **FAIL completeness AC12-1/2/3.** DS descriptor is concrete, but pending-claim storage, supersession body/current envelope, and high-water history identity are not. DB holds full actual revision54 control fields. |
| H5 | **PASS nonvacuous model; FUTURE full handoff.** AF has distinct A/B/C delayed target plus same-dependent successor D and supersession E. Those are meaningful controls; they do not exercise a different control history or stale real receiver. |
| H6 | **PASS ceiling.** Exact pgwire oracle remains RED and distinct from scratch RETIRE trace (DS:3091–3107). Source14fac remains HOLD; no model/native private seam is promoted to startup acceptance. |

### Owner interaction O1–O10

| Item | Evidence and disposition |
| --- | --- |
| O1 | **PASS semantic ownership / FAIL AC12-1 custody.** Existing root owns accepted authority, control owns cycle winner, dependent owns local fence. Submitted exact capture still needs a durable custodian before control apply. |
| O2 | **FAIL AC12-2/3.** CLAIM descriptor is named, but supersession operation and history-qualified old-target result are incomplete across actual consumers. No duplicate semantic owner is required. |
| O3 | **PARTIAL.** AF pairs winner/loser, late A/successor and supersession-first/late PAUSE within one model. AC12-1/2/3 prevent treating that as complete retained-debt plus useful current-startup progress. |
| O4 | **PARTIAL / FAIL AC12-2/3.** Same-history delayed A now returns canonical terminal proof without changing C. Stale-attempt and history-mismatch reentry must refuse honestly and still specify legitimate current progress. |
| O5 | **PASS preserved.** DS:3383–3389 keeps old/candidate/copies charged and original capacity/backoff. No limit raise, debt eviction or second retry path is proposed; exact measurements remain future gates. |
| O6 | **PASS existing wake; FAIL AC12-2 release fact.** RECOVERY:40–55,93–119 supplies real retry/events; DS:3258–3265 requires exact dependent proof. A wake cannot select an unspecified supersession command/envelope. |
| O7 | **PASS principle / FAIL AC12-3 scope.** DS:3310–3316 rejects hints/cache/transport as closure. WeakMap token is not restart authority; current leader and scalar high-water still need the old durable history binding. |
| O8 | **PASS.** Exact P10/P11 prefix, five-entry author packet,1936 source blobs, exact author rerun and separate old native/scratch/oracle populations are retained. No changed bytes or treatment are silently substituted. |
| O9 | **PASS prohibition / FAIL AC12-2 missing continuation.** Current chain ROOT→CUTOVER→RECEIVER→REQUEST→APPLY/STORE→RETIRE→RECOVERY was read. No direct stale-as-success or raw apply workaround is authorized. |
| O10 | **FUTURE, not a design rejection.** Preserved DS:668–676,1683–1695,2459–2462 and :3417–3423 require registered actual endpoints/primary witnesses and unchanged oracle. IMPACT is pinned; no new source metadata approval is asserted. |

### Canonical input J1–J8

| Item | Evidence and disposition |
| --- | --- |
| J1 | **PASS arithmetic; FAIL domain AC12-3.** DS:3343–3346 safe ordinal/no -0/exhaustion refusal; original deadlines and index/term domains preserved. Numeric safety alone does not identify the history an ordinal measures. |
| J2 | **PASS strict capture direction; FAIL shape AC12-2.** DS:3138–3161 own primitive descriptor and prior :255–291/1667–1674 remain; exact supersession/result fields must be stated before source validation is judged. |
| J3 | **PASS rule / FAIL durable gap AC12-1.** DS:3138,3180–3202 captures once and forbids rebuild after await. FEAS shows that keeping that capture across submitted-command crash still lacks a named durable record. |
| J4 | **PASS preserved threat scope.** Prior DS:284–291,1667–1674 own-data/prototype/accessor protections remain. No broad arbitrary-host demand or weakening accompanies the new fields. |
| J5 | **PASS states / FUTURE exact new schemas.** DS:3300–3308 and :3350–3372 distinguish named terminal/held/stale phases, not truthiness. Existing boxed/exotic rejection must carry into the completed new shapes. |
| J6 | **SCOPED N/A new hostile-host requirement.** Authority-and-recovery threat model and accepted PR1:J6 preserve existing defenses without demanding arbitrary mutable-intrinsic immunity. |
| J7 | **PASS acyclic hash construction; FAIL AC12-1/2/3 missing bound inputs.** DS:3180–3192 intent→cycle→PAUSE avoids self-reference. Exact pending capture, supersession body and history domain must all be type-pinned within that owned identity. |
| J8 | **PASS preserved bounded populations / FUTURE census.** DS:1974–1999 and :3383–3389 charge full canonical descriptors, old/candidate overlap and command/response custody before effect; no hidden participant truncation or unbounded history is permitted. |

## Complete next correction and proof ceiling

Resolve AC12-1 through AC12-3 in one amendment: durable exact candidate custody before submission, a canonical stale-cycle supersession operation that can traverse the current receiver while retaining old effect identity, and a history-scoped high-water consumed against genuine old target authority. Preserve the accepted winner ordering, monotonic safety, same-attempt catch-up, complete population, fixed resources, original deadline and deterministic replicated apply.

Then source must implement and independently prove the whole real authority→claim→PAUSE/supersession→control continuation→ENABLE/catch-up→RESUME/confirmation→retirement/successor interaction. Include uncertain claim before commit, all leader/process changes, both supersession/PAUSE orders, exact readback after loss/compaction, same-dependent old commands, three distinct cycles plus delayed target, incompatible history refusal and legitimate preserved-history recovery, full resource/metadata gates and unchanged production oracle. These are future source obligations, not additional reasons to reject an otherwise complete design.

The accepted82b owner ruling and R7-2 scope remain unchanged. Product14fac, ordinary startup, broader TX/FreshMG/CDC and merge readiness remain independently open. No policy remand or new permission is required to make the bounded design correction.

