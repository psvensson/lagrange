# Independent activation / linked C3 adjudication — round 8

## Verdict

**Activation / R7-1: STOP — owner/user semantic judgment remains required; revise the acceptance description.** The author correctly stops the proposed pin solution. A later asynchronous retirement cannot guarantee cancellation of an earlier proposal that may commit. However, the document overstates acceptance as a permanent ordered position and its pre-acceptance guarantee as global knowledge. It also has not proved that the original prohibition on mixing incarnation evidence is itself impossible: that property is narrower than universal wall-clock precedence over an in-flight command.

**Route resources / R7-2: APPROVE as a bounded design contract.** The amendment now names pre-read projection, streaming witness/cursor state, shared producer capacity and actual HTTP buffer-release ownership. This approval does not approve implementation, measured defaults, a whole-node memory bound, integrated startup, original-event CDC delivery or C17 source.

**Linked C3: exact dependency consistent with STOP; source remains held.** C3 may consume only a committed applicable authorization. No source approval, Quest closure, whole TX/FreshMG acceptance, merge or publication is given. No further pin variant is requested by this report.

## Exact subjects and evidence

- `T`: `/mnt/data/peter/projects/.worktrees/tx1-work-20261010`.
- `F`: `/mnt/data/peter/projects/.worktrees/freshmg-integration-20261010`.
- `E`: `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`.
- `D`: `T/solve/quests/replicated-transaction-decision-and-apply/design-participant-release-activation-authority-2026-10-11.md`, SHA256 **e82769a592c544a6860cda087bad5af4727f44098c58c2122f336665572fac02**. Superseding round-nine clauses: D:2464–2667.
- `C3`: `F/solve/quests/message-group-fresh-identity-membership/design-c3-automatic-replace-driver-2026-10-11.md`, SHA256 **af9cc658e2a50bdf1e9133b0ed2e0b274744869f035d36c6a52a1f4d7c5dc5af**. C3:966–1023 binds the exact new D hash at :974 and preserves the STOP.
- Cumulative prior report: `E/review-activation-authority-design-round7-marker.md`, SHA256 **791010f243ca5756b7b8af31e2a2c8be7e2a856285b2a6798fdb06b70628274a**. Earlier reports remain immutable; the adjudication below narrows interpretation rather than silently rewriting their counterexamples.

AGENTS/rules/router, runtime contracts, authority-and-recovery and the instantiated verification union remain the governing owners. This round read the superseding clauses and affected source interactions, including the actual Raft port, runtime Ready/apply owner, application transaction and pinned dependency's proposal/log implementation. Source is navigation evidence, not newly approved bytes. Only this report was written; no source/docs/Quest/log/index/test modifications and no runtime tests.

The local dependency is pinned by `vendor/raft-rs-wasm/Cargo.lock:387–390` to raft 0.7.0. Its cached primary source used here is `/home/peter/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/raft-0.7.0/src/raft.rs`, SHA256 **a595cc7420eb83f49546253d004ebc9657e255581db467376a13cf02a383a8eb**. The worktree's retained `vendor/raft-rs-wasm/raft-0.7.0/src/raft_log.rs` SHA256 is **2de371ef878538c215782e8f8ed987e3ed4b1bda966f0c5f5da91d1cea6c42a4**. These identify the inspected dependency semantics, not a fresh binary certification.

The earlier bounded non-main foundation `c6d71665e98be03de916705f272a9d6340e4a842` remains scoped by report `review-checkpoint-cdc-retry-correction.md` (**f3814f63a9dec6c0abe3a1b19bde00310ef65b46498822f9fe0441f6b74b3775**). Historical activation-red disposition **25effd262bc9a66d6073b3597d0cca674975d4d1d638d7c610cb0c30df43b93b** remains narrow: 23 broad activation dependencies open; origin-alone-opens-admission is superseded, with refusal plus complete-authorization positive required. Registration is a **new write**, and the unchanged production pgwire startup remains required. The predecessor's 242,776 ms whole-file duration is not independently a performance defect.

## R8-1 — the STOP is justified for absolute precommit precedence, but acceptance is neither global nor irrevocable

### The actual locations and outcomes

| Event | Actual owner/location | What it proves |
| --- | --- | --- |
| Local release queue / port call | Release recovery enqueue; `src/raft/raft-rs-operation-port.js:300–319,373–375` enters lifecycle/dispatcher | Local work requested, no log position or authorization. |
| Runtime proposal dispatch | `src/raft/raft-rs-runtime-owner.js:1482–1497` may defer and drains inbound first; :1413–1439 invokes native propose then drains Ready | This is still not a command-specific committed result. A pre-call observation can be stale before actual dispatch. |
| Native proposal input | `vendor/raft-rs-wasm/src/lib.rs:899–905` → `raw_node.rs:353–363` → Raft step | A follower can forward the proposal rather than append it; native success alone is not leader append. Cached raft.rs:2310–2323. |
| Leader append / tentative order | Cached raft.rs:2022–2040 checks leader proposal conditions; :2092–2102 appends/broadcasts. `append_entry` at :1021–1034 assigns current term and log index, then appends | This is the concrete candidate log-order location corresponding to D's “acceptance,” if that word is retained. The entry is still uncommitted and may be replaced. |
| Consensus commitment and deterministic application | Runtime `finishReady` :905–948 applies only committed entries. `raft-rs-application-transaction-owner.js:51–98` applies the command and durable applied state in one SQLite transaction, with post-commit effects afterward | The exact conditional application result can persist RESUME_AUTHORIZED/confirmation. This, not port return or append, is the permission-changing application decision. |
| Later effect/admission | Proposed committed control-row consumer plus existing `partition-participant-transaction-pause.js:63–79` final local identity/native check | The current local instance can consume only an applicable complete decision; a successor does not inherit an old instance's local OPEN projection. |

The generic public port does **not** currently return a command's accepted `(term,index)` certificate or provide cancellation. Runtime `drainReady` can return CORE_OK/DRAINED or READY_DEFERRED (:970–980); the promise is a runtime turn outcome. An implementation must not treat that outcome, transport ACK, follower forwarding or `readStatus` as the proposed acceptance event. If a new finalization admission hook/observation is needed, it belongs in the existing operation-port/runtime interaction, with explicit typed purpose and identity. Raw core access or a second sequencer is not justified.

### What the incompatibility claim gets right

For a retained log prefix with final command F at 41 and retirement R at 42, replicas must apply F before R if both commit. An observation between append and commit cannot make one replica apply F differently by consulting its own socket state, timer or volatile pin. A cancellation command ordered later does not jump ahead. The application callback is synchronous inside the deterministic SQLite apply transaction (`raft-rs-application-transaction-owner.js:61–86`); throwing or consulting local volatile state there is not a valid cross-replica veto.

Thus the universal rule **“an uncontrolled invalidation observed at any owner before F commits must always prevent F's decision”** cannot be guaranteed by the proposed asynchronous observations plus ordinary Raft while native traffic continues. The old pin protocol does not repair it. This is a legitimate reason to stop that protocol and obtain a semantic decision, not a reason to implement another timing check.

### What must be corrected in D:2479–2481,2522–2528,2548–2551 and C3:978–984

1. **Append is tentative.** `raft_log.rs:249–278` permits a conflicting suffix above the committed index to replace old entries, and :357–378 truncates/appends only beyond committed history. Normal leader change can therefore remove an accepted but uncommitted F. The q1→q4 trace is a possible surviving-prefix outcome, not a guaranteed consequence of acceptance. Neither an application-level cancellation nor an assumption of inevitable commit is justified. The safe state is an unresolved exact command that *may* commit or be replaced.
2. **Knowledge has a location.** A known invalidation can prevent dispatch when it reaches the authoritative finalization/proposal gate before that gate's synchronous check. A remote lifecycle owner observing a close before leader append does not make the leader know it before append. D:2522–2523 and the first table row at :2548 overpromise if “known” means known anywhere. The remaining asynchronous propagation interval must be stated. Controlled changes can be withheld pending durable retirement; an uncontrolled remote observation cannot be serialized by wishing the callback were synchronous at another host.
3. **“Historically valid” is the unresolved policy, not a Raft theorem.** Raft proves a committed order. It does not decide whether a complete candidate built from earlier current observations is semantically admissible after an intervening physical/observed change. Calling F historically valid at :2528 silently chooses the very interpretation for which the text declares STOP.
4. **Recovery distinguishes uncertainty from impossibility.** Lost answer, deadline and a currently missing row do not prove F will never commit. Conversely, a proved replaced proposal is not eternally pending. Recovery must resolve through the same authoritative command identity/generation and may perform its defined idempotent re-drive or fresh current-generation evaluation once allowed by that owner. It must neither remint authority from partial old shares nor permanently veto progress after an old suffix is conclusively superseded. “No replacement” in :2551 is appropriate while unresolved, not a blanket prohibition on future legitimate owner recovery.

These are corrections to the STOP's explanation and attainable guarantee. They do not authorize cancellation of committed history, expose RawNode or approve the stopped finalization design.

## The precise attainable contract and the decision still owed

The original user requirements contain several separate properties:

- Old-incarnation partial observations cannot combine with new observations to manufacture a complete authorization.
- A complete persisted authorization may survive restart.
- Opening admission consumes that complete decision with the applicable current identities/population satisfied.
- Ordinary mutation remains closed while required snapshot/discovery/CDC recovery proceeds.

**The first property is not inherently incompatible with the existing owners.** A bounded correction for **controlled/admitted incarnation changes** is available without another framework:

1. Keep exact current member claim and revision, release/configuration/population identity, partial shares and final decision in the existing control generation row.
2. Conditional share application binds the exact CURRENT revision. Final application atomically requires the full fixed population's shares to match that same owner-defined current population/revision set. No cached census can fill a missing share.
3. Existing lifecycle/CREATE/reopen/startup owners must commit retirement (or read back its exact result) **before admitting/publishing a successor incarnation or actuating a controlled replacement**. Restart begins closed and cannot publish a new CURRENT claim before retiring its predecessor. If an earlier final proposal is unresolved, read back/order the retirement in the same owner; do not infer cancellation.
4. Retirement/new CURRENT invalidates old partials. Any final command evaluated after that transition fails its exact revision predicate. A final command that commits before the controlled supersession is a complete saved decision, which is permitted to survive; later consumption still fences successors and changed configurations.

This ordering establishes **no mixed pre/post-supersession generation authorization**, including fresh observation after restart, using existing control-row CAS and lifecycle admission. It also states exactly where controlled supersession happens. It does not pretend that a physical crash can be delayed by the application.

For **uncontrolled physical or transport change**, there are two distinct candidate semantics. The reviewer cannot silently pick between them:

| Semantic boundary | Guarantee / consequence |
| --- | --- |
| Owner-ordered admitted incarnation supersession | Old/new claims cannot mix across the committed supersession. Known local invalidation immediately closes local admission; retirement is submitted through the same control owner. A previously assembled final candidate may still commit if its surviving log order precedes retirement; it is not permission before commit and cannot open a mismatched successor. This is attainable, but whether that candidate is an admissible complete decision after the uncontrolled observation requires explicit owner/user judgment. |
| Universal observed-before-commit invalidation veto | Any relevant owner observing physical/liveness invalidation before F commits must defeat F, even if F was already appended and the observation/retirement cannot reach its leader first. This is not guaranteed by the permitted asynchronous owner protocol. Another finite pin/lease/validation round merely moves the interval. The honest outcome is STOP/unavailability, not claimed fulfillment. |

**Required root judgment:** does “superseded incarnation” for assembling durable authorization mean the existing owner's committed/admitted generation transition (with uncontrolled changes immediately closing local consumption), or must the uncontrolled observation itself globally invalidate an already in-flight candidate before any commit? State separately whether transient connection loss is incarnation supersession or a local admission/freshness HOLD. If the stricter interpretation is retained, this proposed protocol cannot satisfy it; the conflict must be taken to the user rather than reclassified as implementation work. If owner-ordered supersession is accepted, amend the contract explicitly and retain both the no-mixed-generation invariant and current-consumer fencing. This report does **not** select that alternative or count it as current approval.

My previous R7-1 counterexample remains valid against the stated absolute precommit interpretation. It must not be generalized into a claim that *every* incarnation-fenced control-row design is impossible. Conversely, the current author's ordered trace is not proof that the original safety bar has been met. The decision, not another pin implementation, is the remaining frontier.

Liveness under the attainable owner-ordered contract is conditional: with a reachable current quorum/owners, bounded capacity and stable applicable identities, the same canonical release recovery queue resolves exact effects, retires stale claims and retries with fresh complete evidence. Without those prerequisites it reports typed HOLD and preserves debt beyond caller expiry. No leader/quorum traffic, durable CDC ACK or internal recovery is paused to manufacture a timing guarantee. New request budgets do not renew an old invocation or erase its unresolved effect.

Required future counterexamples include local enqueue rejected before native dispatch; follower forwarding without leader append; appended F retained and later committed; appended F replaced by normal leader-change reconciliation; exact retirement/current-generation transition before a new final decision; lost answer after actual committed decision; and controlled versus uncontrolled invalidation. Each must observe the actual named boundary, not equate a submitted request with either complete authority or irreversible noncommitment.

## Independent R7-2 resource verdict

**APPROVE the amended resource design, with implementation/proof gates retained.** D:2555–2563 identifies the actual request owner and explicitly extends it; it does not call PressureGovernor a byte lease. The construction limits at :2565–2572 now include concurrent producers and aggregate retained bytes. The authoritative timeline :2657–2660 acquires capacity before scalar preflight/variable projection. Scalar type/length/identity/witness preflight, checked escaping/overhead and one-descriptor rolling digest/cursor at :2574–2606 remove the prior full-cell/full-census allocation contract gap. The full projection must remain in its synchronous source read/witness transaction; no network-held SQLite transaction is authorized.

D:2610–2624 transfers the byte claim through encoding and `reply.send(buffer)` to actual `reply.raw` terminal events. Ordinary request-count `finally` is explicitly distinct. This matches the real source change boundary: `bootstrap-api-admission-methods.js:87–116` owns count leases; `bootstrap-api-server-methods.js:122–125` invokes the handler; current `bootstrap-request-owner-handler.js:611,667–669` returns a response then releases work admission. The new source must extend this boundary, not merely add counters beside the current finally block.

The consumer claim remains separate (:2626–2632). Caller timeout/abort does not release a retained sender payload, and installed route cells retain their own overlay charge. The proposed finish/close/error handlers are ownership-release conditions, not authority to declare complete contact or erase recovery debt. Terminal send-error handling must actually relinquish stream/payload ownership; a nonterminal notification is not that event. Release-once callbacks must drop their own retained references as part of the handoff.

The accepted design does not yet measure defaults or worst-case copy amplification. Implementation must verify all IDs/cursor keys as bounded before materializing them, the complete response envelope/escaping cost, actual source and HTTP node placement, remote-query copies, and count/byte claims on the actual owning node. The claim covers the new recovery-purpose producer population; it is not proof of a general query/whole-server aggregate bound. Cold routing must reach the existing bounded debt owners without smuggling backlog into a page. These are concrete future implementation/proof obligations of the specified contract, not new docs rejection findings.

The required paired schedule D:2634–2646 is appropriate: scalar pre-read oversize refusal; blocked real HTTP send with overlapping contacts and backpressure; caller timeout/disconnect preserving sender charge until true terminal release; exact-once release/wake; supported later completion and >16 MiB real backlog progress through its separate owners under the unchanged invocation. It must be exercised through actual source/HTTP/consumer/overlay code, then the unchanged production pgwire startup. No source execution is claimed here.

## Preserved startup / C3 scope

D:2293–2338 remains a coherent durable-seed hint→entrypoint→`startSeedNode`→one BootstrapService→recovery-purpose ContactSeedPhase handoff, with original absolute deadline and a separate response consumer. D:2350–2442 carries minimal positive route cells, not full table/debt snapshots; partial cells never certify absence/completion. The existing bootstrap overlay/query/readiness owners remain the consumers and normal cache hydration supersedes the overlay.

Actual seed REGISTRATION_READY runs release before registration (`bootstrap-service-seed-workflow.js:345–362`); CACHE_HYDRATED and CONTROL_PLANE_READY follow (:366–379). First birth retains its independent authentic empty-storage/local-membership cut. Existing seed/join remote recovery must progress while ordinary writes remain closed. New registration requires complete applicable authorization; it is not granted a “recovery write” exception.

C3:966–1023 correctly remains held on this semantic decision. Its ordinary learner retained CREATE recovery is still after canonical current NODES/operation authority, under the same CREATE/physical claim/sole installer, before opening that learner. Its HOLD remains operation-local; required founder/system-partition failure remains startup-significant. Leader/quorum committed absence releases the membership lane; source-own applied absence separately permits stop/cleanup. The ordered-acceptance wording correction above applies to C3's repeated explanation too. No wider C3 redesign is requested.

## Cumulative 63-item evidence index

**P/O** = coherent or retained design plus future implementation/proof; **J** = R8-1 semantic judgment/correction, not approval of stopped source; **R** = approved bounded R7-2 resource design with future measurement/proof. All instantiated categories apply. No unrelated trusted-host or performance obligation is added. D/C3 are exact subjects above; source paths are relative to T.

| Item | Concrete evidence and disposition |
| --- | --- |
| A1 | **J; P/O.** D:911–934 exact birth/effect authority retained; :2482–2486 distinguishes control committed decision/current consumer. Actual apply owner :61–98 supplies commit boundary; acceptance alone cannot grant permission. |
| A2 | **P/O; J.** D:319–389/623–635 HOLD/conflict/expired-pending/completed remain. :2531–2534 resolves unknown exact outcomes; :2570–2572 pressure is DEFERRED, not invalid or complete. |
| A3 | **P/O; R.** D:538–581 inherited seed/admin/CREATE/join budgets; :2320–2326 contact pages/rotation/backoff consume one original deadline; :2618–2632 separates wait expiry from buffer/effect lifetime. |
| A4 | **P/O; J.** D:2192–2206 distinct control claim/target receipt domains retained. :2477–2486 stages need the corrected native append/commit vocabulary; generic port CORE_OK is not accepted/committed command evidence. |
| A5 | **P/O; R.** D:1269–1297 actual owner wake map retained; :2570–2572/:2641–2643 capacity release/config revision wakes same request owner. Existing release arm/enqueue `replica-handler-release-recovery.js:42–55`. |
| A6 | **J; P/O.** D:2522–2528 must qualify where invalidation is known and owner-ordered supersession. D:2574–2599 source transaction/witness validates projection after admission; current local RESUME check `partition-participant-transaction-pause.js:63–79`. |
| A7 | **P/O.** D:329–341 held operation/invocation/partition; :2192–2206 exact domains; :2363–2375 page/witness/cursor identity; :2532 exact ordered command readback. Diagnostics distinguish tentative append from committed result. |
| Y1 | **P/O; J.** D:2310–2338 seed retry/contact, actual release queue `replica-handler-release-recovery.js:97–130`; C3:923–930 operation reentry retained. Unknown pending commands do not justify unbounded dead registration. |
| Y2 | **P/O.** D:805–827 durable invocation timestamps and :2320–2326 fixed deadline survive unreadable state. :2531–2534 holds uncertainty without inventing cancellation/new authority. |
| Y3 | **P/O; J.** D:2334–2338 explicit contact refusal/defer, :2570 pressure. :2551 must distinguish unresolved from authoritatively replaced commands so STOP/debt is explicit, not a permanent veto. |
| Y4 | **P/O.** D:1572–1606 zero-slot reconstruction/control-first order; :2428–2434 routes→existing debt recovery→activation→new registration. No circular registration prerequisite is introduced by the resource amendment. |
| Y5 | **P/O; R.** D:1949–2006 four ordinary + one preflight, bounded pending keys/bytes/log cadence retained; :2565–2572/:2612–2624 now bounds concurrent new route producers and all retained response claims. |
| Y6 | **J; P/O.** D:911–934 immutable effect CAS and :2531–2537 exact result recovery retain idempotence. Pending/appended/replaced/committed cases require distinct source witnesses; new identity is not an uncertain-result retry. |
| Y7 | **P/O.** D:805–827 new boot invocation does not replace durable authorization; :2320–2326 ACK/page/reentry cannot renew time; :2630–2632 HTTP completion cannot discharge debt. |
| T1 | **P/O; J.** D:2477–2486 denies authority to enqueue/acceptance; actual follower forwarding raft.rs:2310–2323 and port CORE_OK show why ACK/noHandler/turn return cannot prove append/commit. |
| T2 | **J.** D:2492–2508 is a possible surviving-prefix trace only. Late F may commit or be overwritten; `raft_log.rs:249–278` supplies latter case. Old/mismatched target consumption stays closed. |
| T3 | **P/O.** D:2334–2338 typed page DEFERRED/refusal plus retry timing; :2570–2572 RESOURCE_PRESSURE remains canonical. Existing router DELIVERED/DEFERRED/FAILED semantics are not changed by HTTP page completion. |
| T4 | **P/O; R.** D:2320–2326 bounded request/redirect; :2402–2414 bounded decode; :2618–2624 sender retains bytes through actual terminal release despite caller timeout. Unknown finalization still retains debt. |
| T5 | **O.** D:2544–2551 and :2634–2646 require real consensus/HTTP boundaries. Add follower forwarding and uncommitted replacement controls per R8-1; real two-router/handler integration remains a future source witness. |
| S1 | **P/O.** D:1269–1297 injected clocks/unref fallback retained; actual release timer :42–45 and shutdown :177–185. Expiry is scheduling/caller bound, not cancellation of Raft or permission. |
| S2 | **J; P/O.** D:2482–2486 requires committed decision plus current consumer. Actual application callback `raft-rs-application-transaction-owner.js:61–86` is synchronous/deterministic, so no volatile precommit veto is added there. |
| S3 | **P/O; J.** D:805–827/1572–1606 reconstructs durable debt, :2531–2534 exact outcome recovery. Volatile pins are no longer offered as restart authority; pending log commands may remain or be replaced through consensus. |
| S4 | **P/O; R.** D:540–581 distinguishes owed effects and request windows; :2618–2632 expressly keeps live sender/overlay allocations after caller expiry. A saved complete authorization is distinct from uncommitted partial/candidate state. |
| S5 | **P/O.** D:1108–1118/2428–2434 internal protocol/recovery remains active while ordinary admission is closed. No suppression of Raft replication/elections/CDC ACK is approved to manufacture precommit veto. |
| R1 | **P/O; J.** D:735–827 startup row clone/load/create/checkpoint/invocation, :882–940 operator/effect CAS retained. Exact control claim/share/authorization/receipt revisions cannot be overwritten from stale caches; outcome resolution obeys authoritative log/application state. |
| R2 | **P/O.** D:696–827/1299–1307 distinguishes birth/authorized restart/copied or unproved storage; :2293–2318 route hints do not alter seed verdict. C3:850–887 retained ordinary CREATE remains separate. |
| R3 | **P/O; J.** Exact complete population/current share revision predicate remains the attainable no-mixing mechanism. D:2416–2434 partial route cells never complete a table/population or erase debt; uncontrolled-supersession semantics remain unchosen. |
| R4 | **P/O; J.** D:764–781/911–934 fsync/effect CAS replay, :2531–2537 exact lost answer. Source `raft_log.rs:249–278` prohibits treating mere append as durable identity; application decision uses exact committed command identity. |
| R5 | **P/O.** D:245–317/735–827 refuses missing/unreadable authority; :2334–2338 malformed/foreign response; :2531–2534 missing result is HOLD, never freshness, completion or noncommitment. |
| C1 | **P/O; R.** Physical rendezvous/inner claim D:696–733 and store CAS :764–781 retained; :2565–2600 now requires aggregate source capacity before projection and checked preflight. |
| C2 | **J; R.** D:2522–2528 needs deciding-owner knowledge/actual append ordering. D:2574–2599 same source transaction/witness prevents preflight/full-read drift without network-held DB transaction. |
| C3 | **P/O; J.** One effect/CREATE/command revision winner remains; a unique appended entry is not yet a unique immutable outcome. Committed-prefix guard versus replaceable suffix `raft_log.rs:249–278,357–378` is the exact distinction. |
| C4 | **P/O; R.** D:1949–1972 coalesces owner scheduling; :2615–2624 terminal send callbacks release once across timeout/close/error/shutdown. Actual buffer references must be relinquished at that terminal handoff in future source. |
| C5 | **P/O.** D:696–733 physical key; :1956–1958 preflight key; :2192–2206 exact control/target domains; :2363–2375 invocation/cursor. Resource pool now names BootstrapRequestOwner's actual recovery-purpose producer population. |
| F1 | **P/O.** Actual seed `bootstrap-service-seed-workflow.js:345–379`: release before registration, then hydration/control. D:1617–1629 firstbirth, :2313–2318/2428–2434 remote read-only recovery retain required dependencies; C3 needs current NODES. |
| F2 | **P/O; R.** D:2293–2338 actual hint→runtime→contact chain and :2350–2434 positive routes unlock existing owners without fabricated metadata. Aggregate pressure is typed with a real release wake; no blanket READY prerequisite added. |
| F3 | **P/O; J.** D:319–389/538–581 existing caller budgets; registration remains closed pending complete applicable authority. C3:907–930 ordinary learner HOLD is local, not a new whole-node barrier. |
| F4 | **P/O; R.** D:2320–2326 keeps discovery/pages/backoff under one invocation; :2618–2632 separates retained buffer lifetimes. Stable quorum/capacity/current owners are liveness prerequisites, not a promise to finish under permanent unavailability. |
| F5 | **P/O.** D:2316–2318 read-only purpose, :2431–2434 no registration exception, :2602–2606 no raw SQL authority or network-held transaction, :2664–2667 no new ledger/scheduler. Pause→settle→drain retained D:584–619. |
| H1 | **O; J.** D:2544–2551 must distinguish actual leader append, commitment, overwrite and owner observation. The incompatible trace remains a recorded semantic counterexample, not an accepted positive or helper error. |
| H2 | **O.** D:2342–2346/2460–2462 actual seed/no CLI override/pgwire startup; C3:889–896 genuine interrupted learner startLagrangeRuntime. New resource pair :2634–2646 uses actual source/HTTP/overlay owners. |
| H3 | **O; J/R.** Latch enqueue, follower-forward, leader-append, precommit, committed result/readback separately; order valid leader replacement without pretending app cancellation. Latch real raw HTTP retention/finish/close, not only a resolved handler promise. |
| H4 | **P/O.** D:2192–2206 control/target lifecycle/runtime/connection/revision; :2363–2375 page/native witness; :2574–2589 bounded descriptors/cursors. Birth/CREATE/boot/config/origin retain full existing schemas. |
| H5 | **O; R.** D:2634–2646 pairs oversized pre-read refusal, supported queued send and >16 MiB real debt through separate owners. Keep remote voters/learners/nonempty obligations; empty/preseeded fixtures cannot certify startup. |
| H6 | **O.** D:2662–2667 explicitly stops activation and limits resource contract to design. Historical marker leaves/212/399 and c6d71665 component proof do not imply full startup/original-event/lostACK acceptance. |
| O1 | **P/O; J.** D:2482–2486 sole committed decision/current consumer; :2555–2563 actual request-count/byte owner expansion. Raft orders operations; it does not independently define admissibility policy for remote observations. |
| O2 | **J; R.** Actual acceptance location is native leader append, not existing port success. Any proposed typed admission hook must stay with the operation port/runtime. Resource interaction :2612–2616 names the actual send handoff and count/byte distinction. |
| O3 | **O.** Preserve invalid old/new generation mix refusal AND supported normal authorized startup in the same future source. The pending proposal incompatible trace cannot be relabelled the saved-authorization positive. Resource negative/progress pair is :2634–2646. |
| O4 | **P/O; J.** Exact retirement/new CURRENT/retry lets fresh current evidence release HOLD; a conclusively replaced old proposal cannot create permanent veto. Existing canonical queue/readback remains the path, not a timer-only rescue. |
| O5 | **P/O; R.** D:1949–2006 ordinary/preflight fairness retained; :2565–2572 concurrent/aggregate capacity before reads; :2618–2624 queued payload keeps charge. No urgency or request-count-finally byte escape. |
| O6 | **P/O; R.** Actual release subscriptions `replica-handler-release-recovery.js:121–130` and same-owner capacity release/config revision D:2570–2572/2641–2643 drive reentry. They are observations/wakes, not global instantaneous invalidation. |
| O7 | **J; P/O.** Enqueue/append/status/pin/cache/hints never grant permission. D:2300–2308 route hints stay hints; :2482–2486 committed owner decides. Whether a later-committed candidate is valid after uncontrolled observation remains explicit policy judgment. |
| O8 | **P/O.** Current subject/prior report/dependency source hashes verified above; future exact candidate/mutant/positive populations remain distinct. No altered startup criterion or broad performance claim is introduced. |
| O9 | **P/O; J.** No RawNode, log truncation, force-open, new sequencer or volatile apply veto. Normal Raft suffix replacement is a consensus behavior, not a cancellation API for the release owner. |
| O10 | **P/O.** Future coupled pairs include lifecycle/release→operation-port/apply/current consumer; contact/request capacity→remote projection/HTTP→overlay/CDC; C3 CREATE/snapshot. Exact C3 dependency :971–974 matches D; metadata/witnesses move with future source. |
| J1 | **P/O; R.** D:1664–1679 authentic +0 membership versus positive index/revision; :2565–2568 safe resource domains; :2580–2583 checked length/escaping sums. No -0/nonfinite/overflow authority or byte reservation. |
| J2 | **P/O; R.** Retained strict own-data D:245–317/488–493; :2300–2303 hint records and :2384 single field capture apply to new descriptors/cursors/claims. Inherited values cannot certify length, identity or permission. |
| J3 | **P/O; R.** D:1987–1989/2384 one capture; :2574–2599 typed scalar preflight/full projection in same transaction/witness avoids getter and row-change TOCTOU. Implementation must include identity/key fields, not just payload fields. |
| J4 | **P/O.** Existing strict prototype/authority boundary D:245–317/464–536 remains. No arbitrary trusted-host threat expansion and no weakening of sealed pollution protections. |
| J5 | **P/O; R.** Primitive domains D:1667–1674, exact identities :2192–2206, scalar SQLite type check :2578–2583; malformed versus unsupported size is explicit. Boxed/exotic values do not become empty success. |
| J6 | **P/O.** Authority-and-recovery threat contract retained; use existing strict own-data/intrinsic defenses where exposed. This round neither demands global host hardening nor certifies mutable-intrinsic attacks outside that boundary. |
| J7 | **P/O; R.** D:2580–2589 checked JSON escaping/envelope cost and bounded rolling digest/cursor, :2613–2614 one charged encoding. Hash/type/byte facts are validation, not current routing or release authority. |
| J8 | **P/O; R.** D:1977–1999 release dense unique full sets retained; :2565–2589 cell/page/count/streaming limits and :2416–2426 overlay cap. Partial pages never certify population; no new transaction participant cap. |

## Required next action

Root should resolve the precise supersession/admissibility semantics above with the authoritative owner/user and record that choice explicitly. Until then, activation finalization/confirmation/consumers and linked C3 source remain held. Do not substitute a new pin round or assume irrevocable acceptance.

R7-2 may be carried forward as an approved **design** dependency. Its measured limits, exact implementation, integrated refusal/progress controls and Lab evidence remain future gates. The main implementation frontier is still unchanged production startup with correct registration authority and closed-admission recovery.
