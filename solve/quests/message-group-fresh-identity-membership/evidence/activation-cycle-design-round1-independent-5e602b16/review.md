# Activation release-cycle supplement — independent design review, round 1

## Verdict

**REJECT the complete new cycle supplement; activation source remains HOLD.** Three grouped design gaps remain:

1. **AC1 — high:** the cycle is not durably recoverable in the PAUSE-before-RESERVE interval. The new descriptor and stable authority identity lack a named pre-effect persistence/readback contract.
2. **AC2 — high:** the control-slot winner is chosen after dependent PAUSE side effects. The single control CAS cannot by itself prevent competing or delayed old PAUSE commands from advancing the dependent generation and invalidating the winner.
3. **AC3 — medium:** retaining only the immediate predecessor leaves no defined canonical result for an older dependent's retirement discovered after further cycles. The actual instrumented diagnostic repeats an older RETIRE, so this is part of the observed interaction, not a hypothetical unrelated history feature.

The new predecessor-bound identity distinguishes a later completed same-term cycle, and the post-ENABLE same-attempt catch-up rule is coherent. Preserve both directions while closing the three handoffs together. The accepted local HOLD / ordered-invalidation / deterministic replicated apply ruling, complete population requirement, source/proof limits and prior R7-2 resource approval remain unchanged. This review does not reopen BEGIN.

No product, source, design, tests, metadata, Quest, index, commit or remote was changed. Only this report and new diagnostics under D were written. No cluster was run. No implementation, startup, C3, main, merge or corpus acceptance is implied.

## Provenance

- `W` = `/mnt/data/peter/projects/.worktrees/tx1-work-20261010`
- `Q` = `W/solve/quests/replicated-transaction-decision-and-apply`
- `A` = `/mnt/data/peter/projects/.worktrees/rs-raft-startup-activation-20261011`
- `E` = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`
- `D` = `E/activation-cycle-design-round1-independent`
- `DS` = `Q/design-participant-release-activation-authority-2026-10-11.md`
- `PR` = `E/review-activation-ruling-round9-independent.md`

| Subject | SHA-256 |
| --- | --- |
| DS, 3,074 lines | `819e4590be60f90a2f1918f6db7899b516c68b7110f91775d1b6495565d5d612` |
| P: Q/evidence/design-participant-release-activation-authority-cycle-predecessor-82b11d80.md, accepted exact 2,839-line prefix | `82b11d80a3a4f8abe2b29e5377b9effb73c658384997df34051d2287f29906b9` |
| PR, prior complete bounded design approval | `5cf2a8d0a83935d491a902b27e1800c928594a529cd7c885e1c1a31c6b18318b` |
| Q/evidence/activation-retirement-reconstruction/pgwire-oracle.log.txt | `aca296ecce3e3c3116749b902f3dea1746f02a44907ef721955e992268562ab7` |
| A/test-output/continuation-20261011/startup-activation/retirement-reconstruction/source-manifest.json | `7357539a7730f4a672d4a5f81b3b9812172225903839259962960bff3d4a9162` |
| AF: Q/evidence/activation-release-cycle-round11-diagnostic.json | `b5d127272ef959ce9dd081b6837b03ede498eeccc8deec3a6c79f7d9153dc258` |
| Q/evidence/activation-cycle-round11-retained/retention.json | `84db09bf0457c29fcfc1f466af3376ef1ef0dd3ecf9cf3e2cfb3200321e208fd` |
| Retained instrumentation.diff | `32269137b7f674352ff354ff47a2e726c9b6d8a590fec8751937d2579e918736` |

`D/provenance.json` proves the accepted prefix is byte-exact, verifies all 67 manifest paths, and compares all **1,935** source/package files in source snapshot **`14fac7d6ef64881daa7a0d266a272b724dfe640a`** to actual A bytes by Git blob hash: zero mismatches. That snapshot is **frozen unapproved navigation**, not an accepted source candidate. Root supplied preservation commit `5667b62155fc3762470a7baff15b46840a8ff5e9` for the design; its preservation role does not change this verdict.

The complete appended DS:2841–3074, accepted ruling at :2669–2839 and full prior report were consumed. AGENTS → rules → router, architecture/authority-and-recovery, runtime contracts, sealed Quest and the ten category templates govern the review. Every one of the 63 requested items has a disposition below. Prior scoped coverage is cited rather than relabeled as new execution.

## Evidence and honest limits

### The production red and the instrumented diagnostic are distinct

The unchanged oracle's line 6 records actual startup failure in `BootstrapService.releaseSeedParticipantCohorts` before the pgwire client phase: first `post_enable_release_census / release_drain_pending`, then `current_control_owner_fact / release_generation_changed / committed_control_reservation`, under the original deadline. Its later teardown error is not the asserted failure mechanism. No new production run supersedes that red.

AF and its raw retained logs/three database archive come from `/tmp/activation-retirement-diag-1234593`, with two disclosed instrumentation edits. `D/retained-diagnostic-verification.json` independently hashes all seven retained artifacts. The edits add cohort/state diagnostics and retain the runtime directory; they do not make the scratch byte-identical to snapshot14fac.

The diagnostic establishes the follower-lag observation: leader applied/commit/last `3/3/3`; followers `2/2/3`; all accepted-work counters zero. It also establishes an important distinction from DS:2873–2878's simplified description:

- AF's `decisiveRepeat.type` is **RETIRE_PARTICIPANT_RELEASE**, not RESERVE.
- Authorization `b24ae48e1d2841f978cd10f5d375ce5b2e5a42db5dced35e1081a5ac32b49a30` repeats one RETIRE entry at indices **60–278, 219 occurrences**.
- The current row is a **different** authorization, `f1aa601553cec2802a03e0ffa0577465a1e79491d808a67d77f126c39dfb7b04`, RETIRED at index59, term1, controlRevision54.

`D/read-retained-control.mjs` opens a copied retained replica database read-only and independently corroborates that full current row. Its database hash is `34511e1a76caf8b5d787baaff078e571f0b28493d85f9f68f1cb8e10133d603b`. The complete canonical control member/target/receipt data are in `D/native-retained-control.json`. This is still instrumented diagnostic evidence. The exact oracle's reservation refusal and this diagnostic's older retirement loop must not be collapsed into one supposedly observed RESERVE loop or proof that new hash bytes alone fix production.

### Independent bounded witnesses

`D/independent-cycle-schedules.mjs` executes the existing canonical PAUSE command builder, actual SQLite PAUSE apply owner, local expected-pause-generation CAS and control-row revision CAS from exact snapshot14fac. The fixture supplies fixed application coordinates to the private apply callback and commits its SQLite transaction. It does **not** run Raft proposal, append or replicated runtime commit.

It independently observes:

- first PAUSE advances generation to1; immediate exact replay remains1;
- a different PAUSE advances to2; replay of the first PAUSE then advances to3;
- a consumer conditional on generation2 refuses after that old replay; the same opaque CAS probe succeeds at the actual generation3;
- singleton control CAS chooses one winner, but only after the modeled dependent PAUSE effects have occurred;
- the durable PAUSE row does not contain the new cycle predecessor/root/original deadline or pause index/term;
- the same pause invocation in the existing command builder produces a different entry ID when the captured leader/term changes;
- an old process's root token is not recognized by a new authorization owner, and reissuing operator authority creates a different ID.

Control-CAS payloads and the local authorization-CAS marker are explicitly diagnostic values; they are not offered as valid full authorization or RESUME witnesses. The generation check depends on the actual CAS key, not the marker's semantic contents.

New-cycle hashes, bounded predecessor-history loss, catch-up, both retirement/finalization orders and later execution-window schedules are explicitly **design models**. The native/store probes show the real boundary the supplement must refine; they do not pretend the proposed new cycle implementation already exists. `D/evaluate-cycle-schedules.py` confirms **23/23 expected observations**, including the three counterexample groups. The count is not source acceptance.

Exact commands, scope and reproduction preconditions are in `D/commands.md`. Scripts, results, copied subjects, provenance and retained read-only database are covered by `D/manifest.sha256`.

## Complete grouped findings

### AC1 — HIGH: no complete durable cycle descriptor before the PAUSE effect

**Paths:** DS:2891–2940,3024–3032; STORE:114–157; REQUEST:44–87; COMMAND:155–165; AUTH:17–38,40–75; SEED:192–239; FEAS:restart,roots.

The supplement captures the predecessor and expected revision, then commits PAUSE, then constructs authorization/RESERVE from the committed proof. It first explicitly stores the predecessor/proof/deadline/population descriptor in the control row **at RESERVE** (:2938–2940). It nevertheless promises restart after lost PAUSE can reconstruct the exact cycle from the dependent PAUSE/authorization row and control row (:3024–3032).

At the gap after PAUSE applies and before RESERVE, neither row has that descriptor. The actual dependent row contains `pauseGeneration`, `pauseEntryId`, control revision/text, and authorization text/index/term. PAUSE clears the latter authorization. The control row remains the old terminal predecessor or empty. The current PAUSE command contains partition, invocation ID, captured leader and term; its hash is not a reversible copy of the root, predecessor, old execution deadline or full command context.

The independent `FEAS:restart` starts at an empty control row, commits the actual canonical PAUSE and loses the reply. The row has generation1 and entry ID, with controlText and authorizationText null. Two descriptors differing only in original deadline (5000 versus8000) produce the same proposed pause invocation; the deadline is not recoverable from that row or hash. If another cycle changes the control row before restart, reading its newer predecessor is expressly prohibited by :2935–2937. No durable owner is specified that retains the captured old one before that change.

The root identity also needs an explicit authoritative source. The named current AUTH owner uses a process-local WeakMap; fresh-create/operator IDs default to random UUIDs, and fresh-seed IDs include startup invocation, boot and execution deadline. SEED issues new invocation/boot fields on replacement. The accepted design at DS:783–827 and :906–925 already separates immutable authority/effect from boot execution. The supplement must bind `rootAuthorizationId` to that retained authority/effect/command, rather than implicitly inheriting current transient token derivation. Reissuing a current token is not recovery of the original command.

Finally, the existing PAUSE **entry ID**, unlike the proposed pause invocation ID, hashes captured leader ID and term. FEAS shows the same invocation plus a new leader/term gives a different entry ID. Recovering only `pauseInvocationId` would therefore remint the actual command after a leader change unless the exact original command bytes are retained. The desired pause proof also includes index and term that the current dependent row/replay answer does not retain. Naming a committed entry does not establish its availability after log compaction or snapshot restore.

**Required closure:** state which existing durable owner stores the complete immutable cycle descriptor and exact PAUSE command/proof before or atomically with its first effect, and how restart reads it after compaction, leader/process change or control-slot advancement. Bind root authority to the existing durable admitted authority, while current boot/lifecycle remains an applicability fence. Preserve original deadline and exact command identity; no recapture, new root token, timeout or missing answer may substitute. This can extend the existing owned row/record; no new ledger is requested.

### AC2 — HIGH: the control CAS does not serialize or fence preceding dependent PAUSE effects

**Paths:** DS:2934–2957,3036–3040; CUTOVER:638–650,763–798; STORE:135–176,179–195; APPLY:108–120; FEAS:concurrent.

The race schedule in :3036–3040 selects the winner at RESERVE, after each contender has committed its PAUSE. That serializes the control slot, but not the earlier effect in the dependent partition. The inherited singleflight is keyed by handler/partition in memory; different processes and different dependents can still reach the shared control slot. The new PAUSE command has no described durable compare-and-transition against a prior dependent generation/cycle or preselected control-cycle owner.

For two requests of the same dependent and terminal predecessor, distinct roots produce distinct PAUSE invocations. The actual effect sequence is:

```text
A PAUSE applies -> dependent generation1
B PAUSE applies -> dependent generation2
A RESERVE wins control revision CAS using A's generation1 proof
B RESERVE loses
```

The winner now refers to a superseded dependent proof. Refusing that proof is correct, but leaves a PAUSE side effect and claimed control slot needing an owned disposition; choosing A at the later control CAS did not make A the winner at the dependent effect boundary. Saying B stays CLOSED does not undo B's effect on the same dependent.

There is also a direct delayed-old-command case. `FEAS:concurrent` runs A→B→delayed A through the actual SQLite PAUSE apply. Generations are **1→2→3**. Immediate replay is inert, but an older replay after another PAUSE is treated as a new effect and invalidates B's generation2 proof. A matching-generation CAS positive control excludes an unrelated fixture failure. The new control slot's immediate-predecessor fields cannot themselves reject that PAUSE inside another partition's replicated application: no cross-group atomic read or authoritative local comparison is named. A volatile pre-send observation would still leave an admitted/queued-command gap.

This does not demand reopening retired authorization IDs or using socket state at apply. It exposes the missing ordering at the newly introduced **pre-RESERVE** phase. A changed invocation hash is not a durable mutation fence. The statement that the control slot refuses an old PAUSE (:2953–2955) needs an executable handoff at the partition that actually applies PAUSE.

**Required closure:** use the existing control/lifecycle/release owners to establish and durably recover the winning cycle before dependent side effects, or specify an equivalent dependent conditional-apply protocol with exact loser/old-command settlement. The same contract must name the contended key across all dependents using the control slot, reject stale PAUSE at actual dispatch/apply without volatile replicated predicates, preserve admitted uncertain commands, and prevent an old replay from advancing/clearing a successor generation. Do not add another coordinator or treat a failed later RESERVE as proof the preceding PAUSE never happened.

### AC3 — MEDIUM: bounded immediate history lacks an outcome for older target retirement

**Paths:** DS:2949–2958,2962–2975; RETIRE:58–89,130–175; APPLY:375–471; FEAS:history; AF:decisiveRepeat; D/native-retained-control.json.

The supplement deliberately reuses one control row, retaining only the immediate predecessor digest/retirement coordinates. It permits a new predecessor once every **already-known** controlled-successor retirement has an exact result. A target that is disconnected and later reconstructed may discover its obligation only after that point. Existing RETIRE reconstructs from the dependent's durable authorization and requires a canonical ordered result before successor publication.

The new rule handles another target while its old cycle is still the terminal current row, and potentially the next row's immediate predecessor. It does not define the result after two later cycles:

```text
cycle A authorized target A2; A2 becomes unavailable
A retires through another required member/receipt
cycle B runs and retires; cycle C replaces B
A2 restarts and reconstructs its durable authorization A
current row = C; retained immediate predecessor = B
```

`FEAS:history` demonstrates the representation boundary: A's retirement coordinates are available in B's immediate predecessor, but not C's. A2 was not an already-known controlled-successor obligation before B/C, so :2973–2975 does not forbid the schedule. Older commands may return STALE (:2954–2955), but STALE is not the promised target retirement or the specified canonical terminal read proving A already invalid. The current contract does not name a typed historical-inapplicability predicate that derives that conclusion from monotonic control revisions and the dependent's exact committed authorization.

This is a missing **owner result**, not an argument that unbounded history is required. A bounded canonical proof rule may be possible within the existing row/revision owner. It must be stated and consumed by the actual retirement/replacement owner; neither the caller's inference from a different current ID nor fabricated target-specific retirement is acceptable.

The retained diagnostic makes the interaction concrete: older b24… RETIRE is appended219 times while a different f1… row is already RETIRED at revision54. The new same-cycle whole-retirement rule is a useful correction, but the report must preserve that older-authorization/target consumer, and future proof must go beyond a two-cycle same-request success. DS:2873–2878 should identify which assertion comes from the exact oracle, source deduction, or this instrumented RETIRE trace.

**Required closure:** define the bounded canonical outcome and evidence that lets a later-discovered old target finish its retirement/replacement handoff after arbitrary subsequent legal cycles, without altering the current cycle or certifying an uncommitted target-specific retirement. Preserve no same-ID resurrection, exact current-generation fencing and known pending obligations. Include at least three different dependent cycles and a delayed old target in the paired witness, using the actual retirement consumer.

## Preserved conclusions and important limits

### Same-attempt catch-up

DS:3000–3017 correctly distinguishes follower applied/commit lag from accepted mutation debt. Same cohort, configuration, leader attempt, lifecycle/runtime/connection/admission identities and every drain predicate must still match. The owner waits on the existing consensus/recovery wake or bounded poll under the original deadline; it does not return to the outer lifecycle and mint PAUSE. Changed membership/incarnation stays STALE/HOLD. FEAS:catchup models the positive and changed-incarnation/expiry controls; the production source behavior remains unimplemented and unapproved.

### Retirement and uncertainty

DS:2962–2996 makes retiring a required current element invalidate and terminalize the whole cycle, with both ordered outcomes: retirement first rejects delayed finalization; finalization first remains historical, with later retirement affecting future applicability. Preserve DS:2685–2690's complete exact population and :2747–2767's replicated-state-only predicate. No root/cycle hash or diagnostic replaces it. The supplement must define the exact pre-claim/partial-cycle target case as part of AC1/AC2's loser settlement; an empty census is never a grant.

Known local disconnect still closes only identified affected local mutation admission, invalidates observations and wakes the existing release owner. Actual queued dispatch rejects knowledge already invalid at that gate. Controlled successor publication waits for the canonical ordered outcome. Reconnect alone never opens admission. Runtime `CORE_OK`, forwarding, ACK, native propose success and tentative leader append do not prove PAUSE/RESERVE/finalization/retirement committed or was replaced. Exact unresolved identities survive all of them.

### Expiry versus continuing recovery

The explicit accepted rule remains DS:805–827 and :918–940: an expired request/effect stays pending, and a later legitimate execution invocation may reconcile the **same** immutable command/effect. That is not renewal of the expired request or new activation authority. DS:2992–2994/3016–3017's retention of the original cycle/deadline must be read with that rule, not as a requirement to execute every later recovery RPC under an already spent wall-clock deadline.

FEAS:catchup.laterRecoveryWindow records that distinction; it is a preserved design model, not newly executed source proof. Current RETIRE:137–138 refuses spent execution deadlines, while RECOVERY:93–95 supplies a bounded current turn. Future source must carry original identity/deadline separately from the legitimate recovery execution window, and must not change the RESERVE descriptor or grant new mutation authority. AC1's pre-RESERVE persistence gap prevents recovering those original fields; once fixed, the accepted later-window rule must remain. No additional framework or deadline extension is authorized.

### Scope kept intact

PR's approved local-HOLD/ordered-retirement ruling and linked C3 dependency remain approved at their old exact hashes. R7-2's route-resource design and required measured owner/HTTP lifetime gates remain unchanged. Seed registration is still a NEW WRITE after lawful authority; closed-admission snapshot/CDC/recovery paths remain available through their existing owners. Ordinary learner HOLD stays operation-local, required founder conflicts retain startup consequences, and no NODES READY/ACTIVE publisher is changed. The earlier same-host startup red versus predecessor control is not superseded by this new design or its diagnostic.

## Source aliases

The following paths are under A and byte-verified against frozen unapproved snapshot14fac. `FEAS` means D/independent-cycle-schedules.json; `EVAL` means D/cycle-verdict.log.

| Alias | Source |
| --- | --- |
| STORE | src/partition/partition-participant-transaction-store.js |
| COMMAND | src/partition/partition-participant-release-command.js |
| REQUEST | src/partition/partition-participant-release-request.js |
| APPLY | src/partition/partition-participant-release-apply.js |
| PAUSE | src/partition/partition-participant-transaction-pause.js |
| CUTOVER | src/node/replica-handler-participant-cutover.js |
| RETIRE | src/node/participant-release-lifecycle-retirement.js |
| AUTH | src/node/participant-release-authorization-owner.js |
| RECOVERY | src/node/replica-handler-release-recovery.js |
| SEED | src/bootstrap/seed-startup-session-store.js |

## All 63 dispositions

**PASS/PRESERVED** denotes coherent design or retained prior scope, not current source acceptance. **FAIL** identifies one of AC1–AC3. **FUTURE** identifies the necessary real production/source proof. Every item cites a concrete path or prior scoped coverage.

### Admission A1–A7

| Item | Evidence and disposition |
| --- | --- |
| A1 | **FAIL AC1/AC2.** DS:2934–2940 does not establish the cycle claim before PAUSE, while :2951 promises stale-proof enforcement. FEAS:restart/concurrent shows the precheck/control CAS and actual dependent enforcer are different boundaries. Complete population predicate remains PR:A1/DS:2685–2690. |
| A2 | **PASS typed refusal, with AC3 progress gap.** DS:2946–2951 distinguishes same-current replay, different-cycle HOLD/STALE and retired refusal; :3011–3017 distinguishes lag from generation change/expiry. Old historical STALE needs the missing canonical terminal outcome in AC3. |
| A3 | **PASS preserved budgets; FAIL AC1 recoverability.** DS:873–880,3000–3017 retains original foreground time; :821–827 permits later bounded recovery execution without renewal. FEAS:restart proves the original deadline is not retained in the proposed pre-RESERVE durable facts. |
| A4 | **FAIL AC1/AC3 canonical handoff completeness.** DS:2909–2915 requires pause index/term/generation; REQUEST:53–62 and STORE:114–123 do not retain the full pre-RESERVE descriptor. DS:2970–2972 names a terminal read but no older-than-immediate result shape. |
| A5 | **FAIL AC2/AC3; PASS catch-up wake.** DS:3011–3013 uses existing consensus/recovery wake. AC2's displaced PAUSE and AC3's old target have no complete terminal/re-drive handoff; AF:decisiveRepeat demonstrates the older RETIRE loop. |
| A6 | **PASS full current evidence; FAIL AC2 earlier effect fence.** DS:3004–3009 and :2771–2779 keep cohort/consumer identity. A control CAS after PAUSE does not enforce that freshness at dependent apply (STORE:143–157; FEAS:concurrent). |
| A7 | **FAIL AC1 identity provenance; PASS evidence separation.** DS:2902–2923 binds root to hashes but AUTH:17–38,56–75 exposes transient root IDs. FEAS:roots/restart retains exact inputs, and this report distinguishes raw oracle, scratch diagnostic and models. |

### Retry Y1–Y7

| Item | Evidence and disposition |
| --- | --- |
| Y1 | **PASS existing owed retry owner; FAIL AC1/AC3 useful recovery.** DS:1269–1297/RECOVERY:40–55,93–119 supplies events/timer. No retry can reconstruct an unstored descriptor or consume an undefined old-retirement outcome. |
| Y2 | **PASS bounded unreadable HOLD.** DS:2781–2786,3015–3017 retains exact debt rather than declaring absence terminal. PR:Y2 remains scoped. AC1 identifies information that must survive, not permission to recapture when readback is missing. |
| Y3 | **FAIL AC1/AC2 incomplete pre-RESERVE stops; PASS later-phase retention.** DS:3024–3032 promises lost PAUSE/restart ownership before any control descriptor exists; :2992–2996 retains later nonterminal cycle. Loser side effects need exact disposition. |
| Y4 | **FAIL AC2/AC3 mutual suppression.** DS:3036–3040 serializes RESERVE after both PAUSEs; FEAS:concurrent.controlCas leaves the winning proof stale. The shared control slot later blocks old-target retirement without a defined result (FEAS:history). |
| Y5 | **PASS prior bounds; FAIL AC2/AC3 no bounded-progress proof.** DS:864–880,1949–2006 preserves four cohort slots/one preflight and bounded pending data. AF repeats RETIRE219 times; bounded concurrency alone does not close the semantic loop. |
| Y6 | **FAIL AC1/AC2 late-effect identity.** FEAS shows immediate PAUSE replay inert but A→B→A advances1→2→3; COMMAND:155–165 also changes entry ID under leader rotation. DS:2953–2955's old-PAUSE refusal lacks the dependent apply fence. |
| Y7 | **PASS ACK is never completion or retry reset.** DS:2729–2745,2781–2786 remains binding for every new cycle command. Neither AF's appended repeats nor FEAS's private apply calls are transport ACK or production commitment certificates. |

### Transport T1–T5

| Item | Evidence and disposition |
| --- | --- |
| T1 | **PASS preserved actual boundary.** DS:2729–2751 and PR:T1 separate queue/turn/forward/append from committed application. New cycle IDs cannot turn runtime success into PAUSE or RETIRE proof. |
| T2 | **FAIL AC1/AC2 late answers and admitted commands.** DS:2935–2937/3024–3032 needs exact lost-answer recovery; FEAS:restart/concurrent shows required data and old-command fencing are missing before RESERVE. Late known-invalid requests remain refused by DS:2720–2727. |
| T3 | **FAIL AC3 classification consumer.** RETIRE:168–175 accepts only RETIRED before clearing obligation. DS:2970–2972's canonical whole-cycle terminal read must become one actual typed result for older cycles, without relabeling generic STALE as success. |
| T4 | **PASS bounded route unavailability; FAIL AC3 restored-route progression.** PR:T4/DS:2781–2786 preserves uncertainty and existing route wakes. A readable current C row still lacks the stated A-terminal result (FEAS:history). |
| T5 | **PASS fidelity labels; FUTURE real endpoints.** D/commands.md identifies native private apply/store probes versus design models. DS:3046–3052 requires actual proposed/committed rows and outer reentry; no stub or diagnostic is presented as that proof. |

### Sweep/time S1–S5

| Item | Evidence and disposition |
| --- | --- |
| S1 | **PASS clocks/unref.** PR:S1, DS:1269–1297 and RECOVERY:25–32,40–45 retain injected time and one fallback. DS:3000–3017 never renews the foreground catch-up deadline. |
| S2 | **PASS authoritative roles; FAIL AC3 old target handoff.** DS:2685–2690/2747–2779 preserves replicated authority and local applicability. Only the canonical old-retirement outcome may release controlled successor publication, not the caller's current-row comparison. |
| S3 | **FAIL AC1 crash/memory equivalence.** DS:3030–3032 promises exact reconstruction; FEAS:restart shows missing root/predecessor/deadline/proof before RESERVE and FEAS:roots rejects old process token. Durable descriptor must survive memory loss. |
| S4 | **PASS preserved legal windows; source gate explicit.** DS:821–827,918–940 separates later execution from immutable effect/original request; :3016–3017 retains cycle on expiry. FEAS:catchup.laterRecoveryWindow does not mint authority; RETIRE:137–138 requires a valid execution budget. |
| S5 | **FAIL AC2/AC3 semantic starvation; PASS scheduler bounds.** DS:1949–1972 preserves independent preflight capacity. No scheduler fairness can repair a generation displaced before winner selection or an undefined older terminal read (FEAS:concurrent/history). |

### Recovery R1–R5

| Item | Evidence and disposition |
| --- | --- |
| R1 | **FAIL AC2 stale clobber.** STORE:143–157 applies distinct old PAUSE again and clears dependent authorization; FEAS:concurrent shows stale generation2 consumption refusal after replay. The newer control cycle must remain untouched by old work. |
| R2 | **FAIL AC1 restart/live discriminator.** DS:2935–2940,3030–3032 must recover one cycle rather than capture a new predecessor/root. AUTH:17–38 and SEED:192–239 show why process invocation identity cannot be the durable authority identity. |
| R3 | **PASS full population preserved.** DS:2685–2690,3004–3009 and PR:R3 keep all voters/learners/current claims/shares and separate target receipts. Zero work counters or missing observations never mean empty eligible population. Native retained control preserves real three-member fields. |
| R4 | **FAIL AC2/AC3 replay CAS scope.** FEAS immediate replay and exact control CAS positives pass; delayed old PAUSE mutates again, and immediate-only history loses older retirement coordinates. Same-identity RETIRED reuse remains forbidden (:2949). |
| R5 | **PASS absence/unreadable remains pending; FAIL AC1 proof availability.** DS:2783–2786 never converts missing PAUSE/RESERVE/retirement readback to cancellation. A missing pre-RESERVE descriptor needs durable recovery, not fresh identity. |

### Concurrency C1–C5

| Item | Evidence and disposition |
| --- | --- |
| C1 | **FAIL AC1/AC2 gate before side effects.** DS:2934–2940 commits dependent PAUSE before the durable control reservation. Actual STORE:168–176 CAS succeeds only after the PAUSE effects in FEAS:concurrent; memory singleflight is not a cross-process durable backstop. |
| C2 | **FAIL AC2 pre-RESERVE check-to-act; PASS accepted final fences.** DS:2718–2727,2771–2779 preserves actual final dispatch/consume checks. DS:2951's stale PAUSE proof check needs a named owner at dependent apply, not only a prior remote observation. |
| C3 | **FAIL AC2 whole-handoff winner; PASS one control-row owner.** DS:2942–2951 selects a unique RESERVE winner, confirmed by FEAS:controlCas. It does not select who may perform the preceding PAUSE or settle the losing already-applied command. |
| C4 | **FAIL AC2 delayed replay; PASS existing event coalescing.** DS:1269–1297 coalesces timers/events. FEAS:A→B→A shows why late exact commands must be inert/refused at the real dependent generation despite no simultaneous JS execution. |
| C5 | **FAIL AC2 full contended key.** CUTOVER:763–798 keys local runs by handler/partition, while different dependents share the control slot. DS:1956–1963 preflight key includes control/reservation/revision; the new pre-RESERVE phase must have equivalent actual ownership. |

### Formation F1–F5

| Item | Evidence and disposition |
| --- | --- |
| F1 | **FAIL AC1/AC2 incomplete new handoff inventory.** Actual CUTOVER:601–650 releases control, reads cohort and pauses dependent; :746–754 reuses control facts before authorization. New predecessor→PAUSE→RESERVE crosses these owners before the sole durable descriptor exists. PR:F1's seed/register route remains preserved. |
| F2 | **PASS closed-gate recovery architecture; FAIL AC1/AC3 useful continuation.** DS:2428–2434 and PR:F2 retain recovery before authorized new registration. Missing cycle data or old-terminal result can still strand the restored route; no force-open is authorized. |
| F3 | **PASS original startup budget and same-attempt catch-up; FUTURE runtime proof.** DS:3000–3017 pairs lag retry with current-identity refusal. Oracle line6 fails before client; a design model does not establish pgwire startup succeeds. |
| F4 | **PASS bounded window arithmetic; FAIL AC1 recoverable original budget.** DS:873–880 includes queue/control/discovery/drain/reopen/RESUME; :3011–3014 forbids renewal. FEAS:restart has indistinguishable PAUSE identity for deadline5000 versus8000 without stored descriptor. |
| F5 | **PASS no bypass.** DS:2847–2849 preserves owners/scheduler/deadline; PR:F5 keeps registration NEW WRITE, original transport/recovery and sole readiness publisher. Corrections must use existing rows/owners rather than raw reads or alternate authority. |

### Harness H1–H6

| Item | Evidence and disposition |
| --- | --- |
| H1 | **PASS real mechanism red and semantic probes.** Copied oracle line6 reaches production seed release before client; FEAS reaches actual PAUSE apply/generation CAS. The later teardown error is not the claimed mechanism. No new green production run is asserted. |
| H2 | **PASS explicit seam fidelity.** D/commands.md labels supplied apply coordinates, observer callbacks and opaque CAS payloads. Existing builder/store/apply code is real; new cycle/history/catch-up are models. AF is instrumented scratch, not exact14fac execution. |
| H3 | **FAIL AC1/AC2 changed ordering; PASS catch-up schedule.** FEAS models lost PAUSE before RESERVE, new leader command, A/B/delayed A, and full later cycle advancement. DS:3041–3044 and FEAS:catchup retain same-deadline follower lag versus incarnation change. |
| H4 | **PASS complete relevant field fidelity; FAIL AC1 missing durable fields.** FEAS has canonical full PAUSE command, explicit predecessor/proof/deadline; D/native-retained-control.json contains actual full control targets/claims/receipts. The CAS marker is expressly not a complete authority fixture. |
| H5 | **PASS nonvacuous controls; FAIL supplement closure.** EVAL pairs immediate replay with delayed replay, matched generation with stale generation, control-CAS winner/loser, same-cycle hash with next predecessor, immediate retirement evidence with older missing evidence. 23 expected observations include failures. |
| H6 | **PASS actual observable versus model limits; AC3 attribution correction required.** AF:decisiveRepeat and native database identify older RETIRE219 times, distinct from exact-oracle reservation refusal. DS:2873–2878 must not relabel that scratch trace as repeated RESERVE or new source proof. |

### Owner interactions O1–O10

| Item | Evidence and disposition |
| --- | --- |
| O1 | **PASS intended one authority; FAIL AC1/AC2 pre-effect ownership.** DS:2888 names the control row as sole serialized owner, but :2934–2940 allows a dependent effect before that row owns the attempt. The missing phase belongs in the existing interaction, not a second owner. |
| O2 | **FAIL AC1/AC3 canonical handoff shapes.** PAUSE proof/descriptor recovery and historical terminal result are not fully supplied by named producer rows/typed replies (REQUEST:53–62, STORE:114–123, RETIRE:168–175). Prior finalization/consumer seam remains DS:2685–2779. |
| O3 | **FAIL AC2 paired winner/progress.** FEAS:concurrent simultaneously preserves single control-CAS winner and shows its dependent pause proof displaced. Refusing stale evidence is correct; the same witness needs a lawful exact successor/recovery continuation. |
| O4 | **FAIL AC1/AC3 stale-then-fresh convergence.** A restored leader/token cannot recover unstored predecessor/command bytes; a readable newer control row cannot yet supply the stated older terminal outcome. FEAS:restart/roots/history preserves identity instead of local fallback. |
| O5 | **PASS backoff/count bounds; FAIL AC2/AC3 semantic retry loop.** DS:864–880,1949–2006 keeps bounded owner queues. AF's repeated RETIRE must end through a canonical result, never pressure-induced dropping of population/retirement debt. |
| O6 | **PASS actual wake owner; FAIL AC3 release outcome.** DS:1269–1297 names consensus, service, control revision and capacity events; RECOVERY:93–119 reenters. RETIRE:170–175 still needs an exact accepted result before clearing the controlled successor obligation. |
| O7 | **PASS projections never authority.** DS:2685–2690,2729–2751 excludes local HOLD/status/ACK/append from replicated decisions. New hashes are identifiers, not proof of current PAUSE or retirement; FEAS opaque CAS payloads grant no semantic authority. |
| O8 | **PASS exact fingerprints; AC3 evidence attribution scoped.** D/provenance.json verifies819e/82b prefix, all67manifest and1935source blobs. Seven scratch artifacts/diff are separately verified; no scratch acceptance is promoted to14fac or PR's prior approval. |
| O9 | **FAIL AC1/AC2 unclosed consumer chain; PASS no escape hatch.** Source inventory covers AUTH/SEED→CUTOVER→REQUEST→APPLY/STORE→PAUSE/RETIRE→RECOVERY. An old PAUSE or root cannot be repaired through a second raw reader or inferred current ID; DS:2710–2714 remains binding. |
| O10 | **PASS future coupled-contract/registry obligation.** PR:O10/DS:668–676,1683–1695,2459–2462 requires actual endpoints, canonical runner/impact metadata together. DS:3021–3052 adds source witnesses; AC1–AC3 must join that same production interaction, not manual-only fixtures. |

### Canonical JavaScript J1–J8

| Item | Evidence and disposition |
| --- | --- |
| J1 | **PASS preserved numeric lattice; FUTURE new field validation.** DS:562–566,1664–1679 requires safe integers/no -0 and positive index/term versus ordinal revision. New predecessor/pause fields (:2891–2915) must use those owners and checked generation increments; no relaxed arithmetic is approved. |
| J2 | **PASS strict own fields; FAIL AC1 completeness.** DS:255–291,1667–1674 preserves exact own-data capture; :2926 requires captured primitives. The complete durable descriptor needs a declared shape before any PAUSE authority, not inherited/missing defaults. |
| J3 | **PASS capture-once rule; FAIL AC1/AC2 durable TOCTOU.** DS:1667–1674,2934–2937 requires captured predecessor, never recapture after loss. Native probes show a copied primitive hash cannot substitute for persistent descriptor or dependent generation CAS. |
| J4 | **PASS preserved prototype/accessor refusal.** PR:J4 and DS:284–291,1667–1674 rejects inherited/accessor/sparse input. Full current population remains :2685–2690; no polluted property can stand in for CURRENT or terminal history. |
| J5 | **PASS explicit states and primitive domain.** DS:2894–2899 has EMPTY/RETIRED and explicit nullable coordinates; :2944–2951 has named replay/HELD/STALE outcomes. PR:J5 preserves boxed/exotic rejection and no truthy/empty authorization default. |
| J6 | **SCOPED N/A to new hostile-host requirements; existing protection preserved.** authority-and-recovery:Threat model and PR:J6 separate genuine mutation/private-boundary input defenses from arbitrary intrinsic mutation. No scope widening or weakening is inferred. |
| J7 | **PASS explicit versioned identity direction; FAIL AC1 root source.** DS:2902–2926 explicitly introduces cycle-v2 tags using captured canonical primitives. Stable authority input must come from the durable owner, not process token issuance (AUTH:17–38,56–75; FEAS:roots). Old unresolved command bytes cannot be silently recoded. |
| J8 | **PASS preserved genuine bounded arrays/resources; FUTURE augmented record census.** DS:1974–1999 and PR:J8 bound full population/canonical bytes before allocation. New predecessor/proof fields must fit the same counted row/pending envelope; no unbounded history/list or omitted member is authorized. |

## Required next step and proof ceiling

Correct AC1–AC3 as one bounded handoff amendment: durable pre-PAUSE cycle/root/command recovery, actual PAUSE winner/stale-effect fencing, and canonical retirement result for older dependents after slot reuse. Preserve the same-attempt post-ENABLE catch-up, original foreground deadline, legitimate later execution-window recovery, full current population and both retirement/finalization orderings. Then freeze the amendment for independent design review; source remains held.

Future source witnesses must cross actual production authority issuance, admission, PAUSE dispatch/apply/readback, control RESERVE/claims/shares/finalization, ENABLE catch-up, dependent RESUME/OPENED/confirmation, lifecycle retirement and controlled successor publication. Include loss/crash before and after PAUSE and RESERVE, leader change/log compaction, same-dependent and different-dependent contenders, delayed old PAUSE after a newer cycle, three-cycle delayed old-target retirement, exact retired-ID refusal and valid current progress. Preserve real transport forwarding/ACK/runtime status limits, canonical input/resource tests and the unchanged pgwire startup oracle on exact source.

PR's scoped design approvals remain intact. The source snapshot is unapproved, the production startup oracle remains RED, and instrumented feasibility cannot provide whole-TX/FreshMG/startup/merge/corpus closure. Root retains this report and its returned hash; no Quest or source record was updated by this reviewer.
