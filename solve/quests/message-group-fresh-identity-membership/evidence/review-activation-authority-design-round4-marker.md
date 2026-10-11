# Activation / startup / linked C3 design review — round four

Reviewer: `subagent:review_marker_correction` · 2026-10-11 · **documentation-only independent review**

## Verdict: REVISE

The explicit replicated reservation is an honest proposed owner expansion, the normal four-slot control-first ordering removes the earlier recursive admission defect, and ordinary retained learner recovery is now correctly separated from founder/system-partition startup. Five remaining design findings below prevent approval. They concern the proposed interaction, not the absence of future implementation or tests.

**Linked C3 status:** the actual learner-join storage path, post-current-NODES placement, and operation-local HOLD are compatible with the activation design's intended boundary. C3.13 correctly supersedes C3.11's whole-node HOLD for an ordinary retained learner. This limited interface judgment remains **blocked on activation corrections and future composition/proof**; it approves neither the broader C3 algorithm nor source, cleanup, two-REPLACE, seed loss, TX acceptance, or C17.

## Exact subjects and method

`T=/mnt/data/peter/projects/.worktrees/tx1-work-20261010`; `F=/mnt/data/peter/projects/.worktrees/freshmg-integration-20261010`; `E` is this report's directory. `D:<line>` means T's activation design; `C3:<line>` means F's linked design. Source references are relative to T unless marked F.

| Subject | SHA256 |
| --- | --- |
| `T/solve/quests/replicated-transaction-decision-and-apply/design-participant-release-activation-authority-2026-10-11.md` | `ed489861e905f1cbdc982d02072679c2709874f0370b881984b0a1f50ebbdc3c` |
| `F/solve/quests/message-group-fresh-identity-membership/design-c3-automatic-replace-driver-2026-10-11.md` | `68f3caec18543ce967c14ad5dd7921061697c9735e4ece6925085bd33ae1160a` |
| `E/review-activation-authority-design-round3-cdc56.md` | `aed925c8e9e3a2e8a4196e6bd7b731be1dad04b895315c1e7bbadefb90141634` |
| `T/solve/quests/replicated-transaction-decision-and-apply/evidence/checkpoint-20261011T1537/1-startup-ownership.json` | `3144c4a76dc61b3abc766a8ae8ed63214b78708dfce30f738e5d7f1036767720` |

Read AGENTS → rules → router, runtime contracts, authority-and-recovery, all ten applicable verification templates, both amended design interactions, all prior R3-1…R3-7 findings, and the concrete startup/storage/release/Raft/CDC/CREATE consumers cited below. Historical clauses are interpreted only under their explicit supersessions. The trace is source-navigation evidence, not a startup acceptance result. No source, test, log, Quest, commit, publication, or runtime mutation was performed. This report is the only new file. No test or cluster was run for this design vet.

## Findings — complete round

### R4-1 — HIGH — committing REMOVE does not fence an unreachable recipient's delayed RESUME

D:1120-1139 and :1166-1173 allow the reservation to advance to `RECOVERY_REMOVE_AUTHORIZED`, commit one REMOVE, and then clear after rereading the surviving configuration. The justification that committed removal makes **every** old RESUME stale at the removed recipient is false without an additional recipient-consumed fence.

A reachable schedule is: RESUME is dispatched but withheld from target X; X becomes unreachable to the recovery owner; reachable members are re-paused; the quorum removes X and clears the reservation; X then receives the old RESUME **before it receives/applies the configuration change**. Its live service, pause generation, local configuration and lifecycle can all still match the old request. Leader/quorum committed absence does not change those facts on X. The existing recipient reads only its own service's committed view (`partition-participant-release-facts.js:89-116`), and the final no-await checks/open use that local view (`partition-participant-transaction-pause.js:55-79`; `replica-handler-participant-release.js:96-123`). No timeout or lost ACK proves those bytes reached X.

There is also a group-identity distinction: the gate is on the **control** group, while the RESUME targets a **dependent** partition. Removing a control replica on the same node does not change the dependent replica's configuration at all. The reservation record must not conflate node, control-replica and dependent-replica identities.

**Required design correction:** name the exact authority consumed by the RESUME actuator that makes old delivery inadmissible before the slot is cleared, including the unreachable-target case. Preserve the existing separation between quorum absence and source-own applied absence; neither relabel quorum evidence as a local observation nor require a removed process to acknowledge merely to release an unrelated membership lane. Specify the exact command/owner for entering `RECOVERY_REMOVE_AUTHORIZED` (it is not one of the four commands at D:1086-1096), its proof and typed results. The reviewed amendment must demonstrate a safe, noncircular ordering, not just promise a later membership check.

**Required pair:** hold the old RESUME in a real router while withholding configuration delivery to X, commit the permitted removal, then deliver RESUME first. X must stay closed; current legitimate recovery must still finish through the same owners. Include different control/dependent replica identities on one node and removal of a member whose local process never stopped.

### R4-2 — HIGH — the membership-only reservation does not keep the full control census current through dependent actuation

D:1051-1054 deliberately permits leadership transfer, application progress and runtime protocol turns while only membership proposals are gated. D:1115-1118 preserves that gate across a new leader; D:1141-1147 then sends the old reservation receipt and uses the dependent recipient's **local** release/lifecycle/membership checks. There is no consumed interaction that refreshes or fences the control census's member lifecycle/build/connection facts at that actuation point.

For example, reserve and mark dispatch under control census K; restart a control member with a new lifecycle/connection (or change the control leader/term), leaving the committed configuration unchanged; delay the dependent RESUME until afterwards. All dependent-local checks may remain unchanged, and the durable slot still exists, but the old full control census no longer describes the current control cohort. The stored `controlTerm` and `controlLeaderLifecycleIncarnation` identify the old observation; persisting them does not hold those lifetimes. The current admission owner explicitly invalidates permission on term, leader, configuration, runtime or lifecycle change (`partition-participant-transaction-pause.js:41-51`), which is a broader condition than the new gate holds stable.

**Required design correction:** state which invalidations the reservation protects and how the exact current control-incarnation/build/census requirement is consumed at dependent ENABLE/RESUME after those allowed transitions. If dispatch is intended as a durable irrevocable permission despite later control changes, define that changed authority contract explicitly and prove it preserves the required current-population guarantee; the present text still promises that guarantee and provides only a configuration exclusion. Do not freeze Raft protocol progress or turn a self-consistent old census into authority.

**Required pair:** delay dispatch/RESUME across control leader loss and across a control member restart with unchanged configuration; the stale receipt must not open admission, followed by a current full-census recovery that does. This is a design proof obligation, not a request to implement a general host-security model.

### R4-3 — HIGH — durable reservation recovery can wait behind the control release it must unblock

D:1158-1164 arms the existing release recovery owner to re-pause/cancel a dispatched reservation after expiry or restart. But D:1186-1193 classifies work only as control / foreground dependent / background dependent and keeps **all dependent work pending until current control CUT_OVER**. It does not place reconstruction/cancellation of the durable slot before that prerequisite.

After leader loss, let a dispatched slot for P survive and let one control member be unavailable. The replacement control leader cannot obtain its full current release census. The membership owner cannot remove that member because the slot is present. The pending dependent cannot run its re-pause/cancellation because control CUT_OVER has not completed. A timer, slot-clear wake or more queue capacity does not break this cycle. The REMOVE exception does not help unless its authorizing recovery phase itself can run before the control-first barrier.

The actual owner currently reconciles only hosted partition release: it may return early for an already-open local leader, then runs `runParticipantCutover` (`replica-handler-release-recovery.js:70-95`); the control-first call is inside that ordinary release algorithm (`replica-handler-participant-cutover.js:138-168,224-225`). It has no existing independent slot-reconstruction phase to which the design can silently delegate this work.

**Required design correction:** put an explicit durable-slot reconciliation phase in the existing owner before normal control-release eligibility. Name its triggering owner/row read, exact key, slot accounting, deadline versus retained-effect lifetime, and typed outcomes. It must make safe cancellation/removal-authority progress while ordinary control admission and dependent dispatch remain closed, without recursively acquiring another running slot. This is an expansion of the existing owner, not a new scheduler. Include all four occupied slots and a replacement leader with lost JS state in the schedule.

### R4-4 — HIGH — the pre-registration recovery cut still names a post-registration verifier and a local-leader-only hydration path

The direction at D:1218-1265 is correct, but moving the listed operations does not yet define a reachable first-seed and remote-restart cut:

- D:1256-1260 permits `hydrateFromLocalPartitions`, **projection verification**, and CDC subscription/replay before registration. The actual `verifyCacheHydration` requires nonempty PARTITIONS, SERVICES, TABLES and MESSAGE_GROUPS cache rows (`seed-cache-hydration-phase.js:455-503`). Those rows are produced by the registration phase that remains after activation (`seed-registration-phase.js:121-125`, :164-467). A genuine first seed therefore cannot pass this verifier before the writes it precedes. D:1248's local founder/birth route correctly avoids needing NODES, but does not supersede these other nonempty-row requirements.
- `hydrateFromLocalPartitions` reads only a **local leader** for every table and records an error when none exists (`seed-cache-hydration-phase.js:355-398`). The intended restart may have a remote control/system leader. D:1238-1254 mentions an owner-RPC route, but does not identify the concrete pre-registration read/route producer that replaces this local-only assumption, or the exact early completion criterion when only part of the projection can be hydrated.
- CDC subscription can be established early, but replay still traverses the real ingress owner: subscription uses `subscribeToCDCWithHandshake` (`seed-cache-hydration-cdc-subscription.js:37-119`), and delivery selects and checks an operational message group (`partition-cdc-propagation-subscriber.js:202-223`). The local message-group leader can report ingress ready without cache rows (`message-group-forwarding-owner.js:409-419`); remote/follower routing uses a different path. Thus neither “all CDC is blocked” nor “moving subscribe proves remote replay” is justified. State which exact readiness/route fact each path consumes. Ordinary CDC readiness and registration completeness must remain after activation.

**Required design correction:** give first birth and existing-origin seed/join separate explicit early read/subscription completion rules at the current owners. Name the pre-registration hosted/remote authority source, what is validly empty, what remains HOLD, and the precise later normal verifier. Do not bypass ordinary verification, invent registration rows, make an empty census successful authority, or create a global readiness barrier. Bind this cut to the actual seed checkpoint and join segment, with the same inherited invocation budget.

**Required pair:** normal `startLagrangeRuntime` first seed with real empty registration tables reaches authorized activation and then writes/normal verification; existing-origin restart with remote control leader and nonempty voters+learners performs authoritative discovery and original committed CDC replay while ordinary user mutation is refused, then resumes registration. No preseeded cache or direct recovery helper may establish this claim.

### R4-5 — HIGH — requiring positive membership-generation indices excludes authentic founders

D:1078-1079 requires all reservation indices to be **positive** safe integers, including `controlMembershipGenerationIndex` and `dependentMembershipGenerationIndex` at :1067-1069. Their canonical owner legitimately returns zero for a founder configuration until the first actual ConfChange. `raft-rs-bootstrap-membership.js:127-136` sets that generation to the GENESIS bootstrap index, and `membership-generation-persistence.test.js:183-197` asserts generation 0 both before and after ordinary committed traffic. Applying a participant origin is ordinary application traffic; it does not manufacture a membership change.

Consequently a genuine first seed can acquire origin and still be unable to reserve for any dependent, permanently failing the proposed valid-fresh positive. This is authentic owner evidence, not a synthetic zero-evidence exception.

**Required design correction:** use each canonical numeric domain: membership generation allows safe nonnegative integer zero (reject negative zero); actual reserve commit index/term and revision retain their appropriate positive domain. Preserve overflow/nonfinite/boxed-value rejection. Required paired witness uses the real founder owner at generation 0, obtains release/reservation/resume without an artificial ADD/REMOVE, and rejects invalid numeric boundaries.

## Prior R3 disposition and linked C3

| Prior finding | This round's disposition |
| --- | --- |
| R3-1 — nonexistent reservation API | **Corrected structurally.** D:1048-1118 explicitly expands the application row/commands and operation-port proposal gate and does not hold a runtime enqueue turn. R4-3/R4-5 remain; actual callback binding/apply ordering are future implementation proof. |
| R3-2 — consume releases before actuation | **Partly corrected.** Durable `RESUME_DISPATCHED` and exact processed receipts at D:1141-1156 preserve the fence through ordinary lost replies. R4-1/R4-2 identify the new exception/lifetime gaps. |
| R3-3 — nested four slots / fairness | **Normal ordering corrected; recovery composition incomplete.** D:1186-1216 specifies control-first admission, four phases, 3:1 due-work fairness, capacity wake and charged queue time. R4-3 is the crash/degraded-control interaction. |
| R3-4 — activation blocks recovery | **Partly corrected.** D:1218-1265 moves read/committed recovery before writes; R4-4 supplies the concrete first-seed and remote-read obstacles. |
| R3-5 — unnamed events | **Coherent proposed expansion.** D:1269-1297 names producers, subscriber, exact key, fallback, shutdown fence and event-before-timer witnesses. Existing source has only service/consensus subscriptions; new revision/topology/handler/slot producers must be implemented and proved, not assumed available today. R4-3 governs slot-recovery eligibility. |
| R3-6 — nonexistent restore workflow | **Corrected.** D:1299-1307 makes ambiguous/copied/restored storage a typed conflict and claims no restore command. Physical-identity-preserving block restore remains outside what the tuple can automatically detect; the unsupported policy does not make it detectable. |
| R3-7 — generic partition / learner path conflation | **Corrected and qualified.** D:1311-1335 and C3:850-867 accurately separate the paths. F's learner path checks `targetGenerationPresent` (:153-162), installs (:247-257), then opens (:290-310); generic `PartitionService.initialize` is separate. |

C3:837-931 pins D's **exact reviewed hash**. D:1344-1394 and C3:869-929 agree: canonical repository enumeration → current boot takeover → exact operation/attempt/learner/physical claim → sole snapshot-install decision → open/register/initialize/adopt. Ordinary learner HOLD/conflict is operation-local background debt and may coexist with healthy node READY; affected target remains unopened/unroutable. F's `ReplicaCreateAdmissionOwner` already has `runExclusive`, `commitSnapshotInstall`, `snapshotTargetAdmissions`, `takeoverRetained` (:319,337,419,475); the new normal startup recovery method and background handoff are **proposed**, not existing runtime proof.

Implementation must bind OperationWorkflowOwner's actual repository/NODES/timer reentry to that exact handler/operation without retaining a physical worker across a deferred wait, preserve original CREATE deadline/exhaustion disposition, and prove restart reconstructs the registration. No generic snapshot bypass, new deferred replica registry, second handler or READY authority is approved. Historical 399-component and bounded two-path marker evidence remain their original component/safety ceilings; neither proves this normal-startup caller. The prior 212 marker population is separate, not combined into a new integrated total.

## All 63 requested items

**P** = coherent design rule; **O** = required future implementation/proof, not a reason to reject documentation alone; **B** = blocked by a finding above. The declared network/record boundary is reviewed without inventing an arbitrary trusted-host threat requirement.

| Item | Disposition and evidence |
| --- | --- |
| A1 | **P/O; B R4-1/R4-2.** D:435-457,911-934 consume exact birth/command/CREATE at ENABLE; D:1063-1118 binds control slot/config. The same current control-incarnation facts are not held through delayed RESUME. |
| A2 | **P/O.** D:623-635 distinguishes HOLD/conflict/expired-pending/readback; D:1385-1394 and C3:907-929 correctly change ordinary learner HOLD to operation-local debt. Canonical consumers must preserve these distinct classes. |
| A3 | **P/O.** D:543-575,834-862 names seed invocation, join start/maxElapsed, configured admin timeout and original CREATE timestamp; every queue/discovery/phase uses remaining time. R4-4 must place early reads inside that bound. |
| A4 | **P/O; B R4-1.** D:329-346 gives thrown own-field checkpoint error; :1086-1106 names new reserve/dispatch/confirm/cancel/read operations. Specify recovery-remove command/results; propagate canonical code objects unchanged. |
| A5 | **P/O; B R4-3.** D:1269-1297 maps row/service/config/route/capacity/slot/repository wakes and 1-s fallback. Event firing plus dispatch latency must fit remaining budget; an event cannot release circular eligibility. |
| A6 | **P/O; B R4-1/R4-2.** D:568-575,911-934,1108-1118 requires current post-await facts; dependent-local final checks cannot establish changes at an unreachable/remote control owner. |
| A7 | **P/O.** D:329-341,1063-1074,1269-1293 identifies held workflow/operation/target/boot/config/generation/deadline. Future diagnostics must name the slot and actually examined missing fact, not substitute caller IDs. |
| Y1 | **P/O; B R4-3/R4-4.** D:343-389,1286-1297 owns seed/join/operator wakes; actual join outer loop is `node-joining-admission-readiness.js:399-505,661-752`. C3 background method is proposed; prove firing/loud exhaustion at that owner. |
| Y2 | **P/O.** D:800-827,834-862 freezes durable invocation/command timestamps; unreadable or malformed rows cannot renew them. Recovery of an admitted effect is distinct from renewing its request. |
| Y3 | **P/O.** D:623-635,1203-1210,1289-1293 names expiry/abort/conflict and retained debt. New reservation recovery/remove outcomes need R4-1/R4-3 completion. |
| Y4 | **B R4-3/R4-4.** Normal slot recursion is removed, but reservation cancellation can depend on unavailable control CUT_OVER; first-seed projection verification depends on later registration writes. |
| Y5 | **P/O; B R4-3.** D:873-880,1186-1216 gives ≤4 phases × ≤1024 members, 100-ms election/pause, 1-s background cadence, 3:1 due-work fairness and one entry/local partition plus sequential accepted plans. Queue time is charged; prove logs/retained waiter bounds and recovery-phase accounting. |
| Y6 | **P/O; B R4-1.** D:800-827,911-940,1086-1096 defines CAS and exact same-effect/resume IDs; F CREATE lane and installed evidence are reused. Delayed old resume after cancellation/removal needs the causal fence. |
| Y7 | **P/O.** D:821-827,849-862,1203-1205 disallows ACK/retry renewal. New fenced boot invocation is distinct execution budget over retained authority, not a reset of the expired request. |
| T1 | **P/O.** D:492-493,1145-1147 requires processed semantic receipts. Existing `participant-release-client.js:41-50` rejects noHandler/non-delivered results; new commands must reuse it. |
| T2 | **B R4-1/R4-2.** Durable dispatch fixes lost-memory permission, but delayed RESUME can outlive remote removal/lifecycle change while its local evidence remains unchanged. |
| T3 | **P/O.** Existing client `:41-54` normalizes transport delivery; D:488-493,1083-1089 requires retryable reserve pressure and typed results. Future reserve/confirm/cancel/remove must retain canonical defer/retryAfter. |
| T4 | **P/O.** D:568-575,1203-1205 caps discovery/callback/command waits to one deadline; unresolved dispatched effects survive expiry. R4-3 must give those retained effects a reachable bounded attempt. |
| T5 | **P/O.** D:655-659,1177-1182 prescribes real serialized handlers/router, noHandler/redirect and delayed replies. Add R4-1/R4-2 schedules with separately delayed membership traffic; direct helper fixtures cannot certify them. |
| S1 | **P/O.** D:383-389,562-566,1162-1164,1289 names injected epoch clock, unref one-shot/fallback timers. No timer alone authorizes resume or deletion. |
| S2 | **P/O; B R4-1/R4-5.** D:1102-1118,1127-1139 gates actual transition by native authority/quorum. The valid canonical zero membership generation must remain legal. |
| S3 | **P/O; B R4-3.** D:783-827 reconstructs birth/command/invocation; :1115-1164 retains slot after JS loss; C3:923-929 retains operation. Name the boot-time slot reconciliation phase before control release. |
| S4 | **P/O.** D:873-880,1158-1164 retains dispatched effect after deadline and allows legitimate settlement within remaining window. Missing-member handling must not replace causal evidence with expiry (R4-1). |
| S5 | **P/O; B R4-3/R4-4.** D:1051-1054 leaves ticks/messages/apply live. Actual CDC ACK uses internal commit (`partition-cdc-obligation.js:287-303`); delivery needs leadership/subscribers (`partition-cdc-obligation-delivery.js:480-489`). Startup must provide those dependencies before activation. |
| R1 | **P/O.** D:245-317,764-827,911-940 enumerates create/load/clone/checkpoint/failure/invocation/command/effect CAS. D:1086-1096 adds slot writes; C3:758-798 exact takeover/install/adopt. All must preserve advanced current rows/identities. |
| R2 | **P/O.** D:809-827,1299-1307 separates completed restart, first birth, copied/unproved storage and retained CREATE. C3:916-930 distinguishes ordinary learner from required founder, without an empty-storage inference. |
| R3 | **P/O; B R4-4.** D:412-426,522-536,592-613 refuses missing/full-population/manifests; first-seed genuinely empty registration projection must not be confused with an empty authorized cohort. |
| R4 | **P/O; B R4-1/R4-3.** D:774-781,918-940,1149-1173 prescribes fsync/CAS/dispatch/confirm lost-answer readback; cancellation's removal proof and reconstruction eligibility remain incomplete. |
| R5 | **P/O.** D:705-715,774-781,1100-1105 makes corrupt/missing/unreadable facts conflict/unavailable; receipt absence alone is not proof of no effect. No restore workflow exists. |
| C1 | **P/O.** D:180-235,696-733,764-781 names stable rendezvous → inner claim, no-follow physical identity, release-and-retry ordering and durable record CAS/fsync. Current process owner is simpler (`data-directory-process-owner.js:27-53`); the expansion is explicit. |
| C2 | **P/O; B R4-1/R4-2.** D:1108-1118 addresses reserve-vs-native-proposal race with applied readback plus same-turn gate. That gate does not fence every fact used at remote resume. |
| C3 | **P/O.** D:800-808,911-925,1079-1084 gives revision-CAS winners for record/effect/slot; C3:875-883 uses existing exact CREATE lane/claim. Prove duplicate/takeover readback before actuation. |
| C4 | **P/O; B R4-3.** D:1269-1297 coalesces events/timers and fences shutdown; row recovery must get an eligible execution phase rather than a permanently pending key. |
| C5 | **P/O; B R4-1.** D:705-725 keys physical leaf/record; :1063-1074 binds group/partition/release/invocation; :1269-1271 names wake key. Control/dependent replica identities must remain distinct during removal. |
| F1 | **B R4-4; O.** D:1224-1260 inventories intended steps, but actual normal cache verifier needs registration rows and local hydration needs local leaders. Registration writes, CDC ingress/ACK and remote route producers need the explicit early/late split. |
| F2 | **B R4-3/R4-4.** Hosted founder identity is a coherent first-seed route; remote restart discovery/CDC and retained slot recovery still lack a noncircular executable ordering. |
| F3 | **P/O.** D:1220,1240-1246 keeps ordinary mutation admission closed; D:543-575 preserves client windows. Old accepted decision/CDC work must use existing internal commit owners. |
| F4 | **P/O; B R4-3/R4-4.** D:873-880,1203-1205 charges discovery, queue, settlement, reopen, origin, reserve/resume to one window. No measured margin exists yet, appropriately; complete the reachable schedule before estimating normal startup margin. |
| F5 | **P/O.** D:584-619 retains pause→accepted-work settlement→drain→reopen→origin→resume; :1439-1440 forbids raw authority/bypass/global barrier/new ledger. R4-4 requires changing the existing phase contract, not bypassing normal verification. |
| H1 | **P/O.** D:637-666,1177-1182 prescribes semantic negatives. Future treatments must reach actual ENABLE/RESUME/native transition rather than fail for a missing new API. R4-1…R4-5 add concrete schedules. |
| H2 | **P/O.** D:1262-1265,1404-1417 and C3:889-896,927-930 require normal `startLagrangeRuntime` seed/join and genuine CREATE interruption, not manual helpers. Add real first-seed empty rows and remote closed-admission restart. |
| H3 | **P/O.** D:727-733,774-781,936-940,1177-1182 prescribes deterministic latch/clock/crash/late-reply boundaries. Independently delay recipient configuration vs RESUME for R4-1. |
| H4 | **P/O.** D:742-750,788-797,890-903,1063-1074 includes actual physical/workflow/boot/config/operation/invocation fields; C3:764-767 adds exact admission/learner basis. Numeric generation must follow R4-5. |
| H5 | **P/O.** D:1262-1265 requires nonempty remote voter+learner census; :1405-1417 genuine retained artifacts; R4-4 adds original committed CDC debt under closed admission. Empty projection is valid only for first birth, never a vacuous cohort. |
| H6 | **P/O.** Both subjects are proposals. Historical 399 component/212 marker populations and narrow marker source safety are separate; neither proves normal startup, C3 recovery, original CDC delivery or full TX. |
| O1 | **P/O; B R4-1.** D:1003-1023,1431-1437 names birth/store/command/config/CREATE/image/release owners; READY remains existing node owner. Exact recovery-remove authority must be bound to a named existing transition owner/command. |
| O2 | **P/O.** D:1048-1106 honestly introduces row commands/private callback rather than claiming an existing reservation API. R4-1 requires the fifth state transition's command/result seam; R4-3 names its execution phase. |
| O3 | **P/O.** D:641-663,727-733,1177-1182,1404-1417 pairs refusal/recovery including writable-parent cases. Add stale delivery then valid release and authentic zero-generation founder in the same harness. |
| O4 | **P/O; B R4-3.** D:988-999,1295-1297 and C3:927-930 require stale→current reentry; a current owner event cannot release the reservation/control scheduling cycle until corrected. |
| O5 | **P/O.** D:1083-1084,1186-1216 respects reservation pressure, four-slot capacity and 3:1 due-work fairness. No urgency bypass; R4-3's reconstruction must share accounting. |
| O6 | **P/O; B R4-3.** D:1274-1297 gives concrete producer/subscriber/key map and fallback. Current recovery source subscribes only service/consensus (:121-131); proposed producer revisions must be implemented with event-before-timer proof. |
| O7 | **P/O; B R4-1/R4-2.** D:1248-1260/C3:683-689 keeps cache/route/census as evidence, not authority. Remote committed absence or old census cannot stand in for an unchanged recipient's current actuation facts. |
| O8 | **O.** D:637-676 requires controlled semantic pairs; exact source/patch/test/log fingerprints and negative-vs-positive populations must accompany later implementation. No new runtime treatment is claimed here. |
| O9 | **P/O.** D:1439-1440 and C3:859-896 forbid raw Raft, generic snapshot defer, filesystem-derived authority and second recovery path. Search actual implementation callers again before approval; this review adds no escape. |
| O10 | **O.** D:668-676,1431-1437 requires coupled impact and generated classifications covering storage/startup/release/Raft/CREATE/image/CDC. Add exact recipient pause and reservation-reconstruction endpoints; current registration alone is not design implementation. |
| J1 | **B R4-5; P/O.** D:562-566 rejects unsafe/nonfinite/-0/overflow times; :1078 incorrectly makes canonical membership generation positive. Apply each owner's exact domain to indices, term, revision and sums. |
| J2 | **P/O.** D:287-296,329-341,466-481,1078 specifies own exact primitive records. Implement one strict boundary for disk, CLI/admin and new wire commands; inherited authority must refuse. |
| J3 | **O.** The strict own-data rule must use descriptor capture once before hashing/CAS/actuation, rejecting accessors; no repeated getter can change the validated tuple. Current future command implementations do not yet exist. |
| J4 | **O.** Canonical own-data records and dense indexed arrays must ignore hostile enumerable prototypes at the declared exposed boundary. No arbitrary trusted-host rewrite is required to demonstrate R4 findings. |
| J5 | **P/O.** D:287-296,466-481,1078 type-pins IDs/digests/numeric fields; reject boxes/exotic coercion and nonprimitive booleans before deriving identity or fanout. |
| J6 | **N/A** to a new arbitrary-host hardening demand. **O** to reuse existing strict validators/captured intrinsics at changed exposed boundaries without weakening them; architecture/authority-and-recovery threat-model clause governs. |
| J7 | **P/O.** D:752-754 fixes physical BigInt decimal and SHA256 byte domains; :911-934/1063-1084 require exact effect/slot receipts. Hash only captured type-pinned canonical fields, with deterministic ordering. |
| J8 | **P/O.** D:412-426,522-536,873-874 requires dense own unique concrete plan/cohort arrays and existing ≤1024 membership cap before materialization/fanout. No new transaction-participant cap is introduced. |

## Source fingerprints supporting the findings

These are old implementation bytes used to verify real owner semantics, not implementation approval for the design.

| T-relative path | SHA256 |
| --- | --- |
| `src/partition/partition-participant-transaction-pause.js` | `cfaed57de5d72786ac528eab1dc93fdd13411c1ce2a854f682569582df3fc85e` |
| `src/partition/partition-participant-release-facts.js` | `6bafc1af433d3f53c43671ffff2ea1e9a65dfe613457b1b4b5d016c784d736d0` |
| `src/node/replica-handler-release-recovery.js` | `07594e7e2aeaae7305c0f39eddd6d5e6227a08e4de659e28b6e19a24125a41e3` |
| `src/node/replica-handler-participant-cutover.js` | `de7c59950179093519f5a161e61768df9c25759980e0618543bb6e076df0d271` |
| `src/bootstrap/phases/seed-cache-hydration-phase.js` | `d67b91a71d6665e75f0f188e0071cf5efabd0303a6baa012a56617ee4fc79c30` |
| `src/bootstrap/phases/seed-registration-phase.js` | `ea726696d17f4611e3b46f57f054bcc37cb8ab3233b0c42db58dbf2d532784f0` |
| `src/raft/raft-rs-bootstrap-membership.js` | `fa7163f3099253c35f13ab279d4ea19fd783160fa4f3066d3e063c5800ecf5f3` |
| `test/raft/raft-rs-backend/membership-generation-persistence.test.js` | `3dd16d5470a5af60659b7feac89da7a6441d1fc8893774f66f38a0ecdf3f8227` |
| `src/storage/data-directory-process-owner.js` | `26317d935c35dfe438a698cd21533bf0fb98f63e908a57b46510a41e5c4ca150` |
| `src/bootstrap/startup-workflow-store.js` | `7bd5f8d95e4580d0ed62a72c499e7e6d23843d8c7b8a2e14a7047bb590347b65` |
| `src/bootstrap/node-joining-admission-readiness.js` | `987f7424e2ff7f997b765dc431ca39a859f5b3138b9c776a196d1829c0f95ce4` |

No mandatory inspection capability was unavailable. The next step is one bounded design amendment addressing these five findings, followed by independent design review. Source remains held. Full normal-startup recovery, original committed CDC delivery without another user write, and lost-ACK continuation remain future acceptance obligations.
