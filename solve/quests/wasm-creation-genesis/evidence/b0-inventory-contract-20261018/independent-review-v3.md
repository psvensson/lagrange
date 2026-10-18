# B0 v3 independent design/oracle review — REVISE

Reviewer: `subagent:/root/rsraft_a0_readiness`, independent of author `/root/rsraft_b0_contract`. Exact reviewed commit `8d4145064671a5b400e12eb226ffddf0b22b97b7`; planning base `a1c3cde54fcb46471791062bcae4a6000ae484e0`; production/test subject `a251ce4fd9c980a78c0fd33d8a5f873161f90870`. Author worktree remained clean and unmodified by reviewer.

Contract SHA256 `cf420d78fd66a2453293c709167f4fcabe111a177116e9af93fc3a64ee81e2cc`; oracle matrix SHA256 `f7325da12df3d9d74cf3c7679a74a76d212fccbb94594ccc2d3e01db691994e4`. Independently verified all 51 subject/source/preserved-input manifest hashes from actual files/Git objects. Reviewed full F2–F6/D1 interaction, owner map and first executable handoff; not only the earlier D1. No new dynamic test/mutation/native/lab pass is claimed.

**REVISE, category-complete for these exact draft bytes.** Three remaining boundary gaps prevent design/oracle approval. This is not rejection of the overall architecture or approval of unimplemented subsections. Existing U1 REJECT, v2 INCOMPLETE/REVISE and parent Quest remain unchanged.

## B01 — settled REMOVE replay may recapture the successor

Contract §7 captures REMOVE target from the memo at admission, removes the stable gate entry after a HELD attempt, and retains an admitted request/target in a retirement-only plan. It does not require lookup of that retained request binding before a later same-request admission reads the current memo.

Concrete permitted schedule: R_I admitted for I; retirement physically terminates but projection/completion remains UNKNOWN; its gate entry settles and is removed; J becomes current and owns the canonical memo; unchanged R_I is redelivered. The stated capture-at-admission rule can now select J. R_I can retire J or emit an outcome for J under the original I-removal request. Keeping I as an eligible historical housekeeping plan does not fix request routing. Source `runtime-service-handler.js:525–550,644–727` and `runtime-service-bound-creation-route.js:446–455` demonstrate the current canonical-only target derivation; the actual transport request contains operation/entity/replica, not an immutable creation target (`operation-workflow-dispatch-response-reconcile.js:637–647`).

Required correction: define request→captured-target lookup and conflicting-input refusal before fresh memo capture, including after HELD settlement. State lifetime, retention and restart/lost-binding behavior. A volatile map cannot provide cross-restart idempotency; choose an existing authoritative request owner for any durable association, or make loss explicitly fail closed without retiring a new target. Do not create a parallel handler ledger or imply another owner's guarantee. Add a direct oracle for same R_I retry after J takeover, terminal replay, conflict, and restart/lost association. B03-06 currently tests the historical pass rather than this duplicate request.

## B02 — exact wake validation has no token exposure linearization

Contract §6 permits an exact in-flight native wake to set a pending bit, but a tokenless plan cannot match a token-bearing wake until the original journal's authoritative continuation/reread has exposed that token. It does not state where that exposure occurs relative to physical/native continuation. Current handler route awaits the entire `resumeConsensusCreation` (`runtime-service-bound-creation-route.js:188–190`), and manager resumes by awaiting recovery then immediately performing physical continuation (`service-consensus-bootstrap.js:208–210`). The source explicitly delivers a wake from inside a run (`bound route:149–150`).

Concrete permitted schedule: F starts tokenless; original journal durably retains token; physical continuation emits the one applicable genesis/grant wake before handler's manager await resolves; handler still has no authoritative token to match; wake is dropped/rejected. The run returns deferred/HELD with no pending bit, despite an applicable native event that could release it. No later native event is promised. BD1-05 does not isolate durable-token-persisted / handler-token-not-exposed.

Required correction: name an operational owner-backed retention/exposure point before physical continuation can emit its wake, or a bounded untrusted hint retained during the in-flight attempt and validated only once authoritative identity is exposed. Keep wake enqueue-only; do not await its own continuation or accept an event token as journal authority. Add actual owner ordering and wrong-token controls at this cut. Clarify any genuinely unavoidable loss as an explicit conditional retry limit, not an implied reliable wake guarantee.

## B03 — mechanical generic writes can clobber the unified bound record

Contract §8 converts every generic manager writer mechanically to `{state,ownershipKind,origin}` but assigns post-await/currentness guards only to bound CREATE/retirement. The source has unguarded generic post-await writes and failure writes: `service-lifecycle-operations.js:159,245,290–299,313–328` and recovery `:182–219`. These share the same canonical `_replicaStateById` map. The design supplies no source-backed disjoint-key invariant.

Concrete permitted schedule: a generic I operation waits in an adapter (or its old failure callback is delayed); bound J legitimately acquires that canonical manager record; I then writes generic STOPPED/FAILED/CREATED over J. A failing generic create can also write FAILED without a successful physical admission. Record shape conversion alone does not stop ownership loss. Protecting only bound writers does not preserve the canonical record that later getters and guards consume.

Required correction: specify captured-entry/ownership checks for every canonical writer, including generic recovery, normal completion and catch/failure paths, or prove a real existing enforced disjoint-identity invariant. Preserve uncontended generic behavior while refusing stale writes over a new bound owner; no shadow currentness map. Apply the same reasoning to shared driver bookkeeping if generic and bound keys collide. Add a real manager generic-I→bound-J late-result/failure oracle; B06-04 currently names mechanical conversion without isolating this collision.

## Complete sealed checklist dispositions

“Design adequate” is source/oracle judgment only, not a dynamic pass. “Implementation prerequisite” remains mandatory later. Every category below was considered before this verdict.

### Owner interaction

1. **Design adequate.** Contract §2 assigns journal, reservation, physical currentness, presentation and effects to existing owners; no second finality interpreter.
2. **REVISE B03.** §8 gives a canonical record but only bound writers receive ownership rules; generic stale writes remain underspecified.
3. **Oracle adequate; unexecuted.** B02–B06 pair journal/resource/physical/memo/projection invariants in the same scenarios; no dynamic pass is inferred.
4. **REVISE B01/B03.** Same settled REMOVE replay after J takes over and late generic state writes can act on newer ownership.
5. **Design adequate.** §7 stable synchronous gate, one queued record and coalesced wake; B03-05 initial fairness/pressure mutation.
6. **REVISE B02.** §6 requires exact wake identity without specifying exposure of newly retained token before an in-flight native wake.
7. **REVISE B03.** §8 physical owner is authoritative, but mechanical generic writes can replace its bound presentation record.
8. **Oracle adequate; unexecuted.** Matrix requires actual unmutated controls, exact fingerprints, named mutation assertions and full restoration.
9. **Design adequate except findings.** §5 exact-plan precedence re-enters the ordinary owner and does not derive finality from cache state. Findings identify adjacent unfinished boundaries.
10. **Implementation prerequisite.** Owner map identifies existing coupled groups/producer metadata; later source and witnesses must update their actual registered cone.

### Admission gating

1. **Design adequate.** §8 physical observation comes from lifecycle; handler plan/memo is not admission authority. B06-05 distinguishes CURRENT/ABSENT/DIFFERENT/UNAVAILABLE.
2. **Design adequate.** §4/7 named current-unresolved/busy retryable refusals, no admitted outcome for refused work. Existing transport-semantic-outcome.js:321–340 preserves deferRetry; dispatch-response-reconcile.js:744,795–830 consumes it.
3. **Bounded design only.** §7 no new timer/deadline; existing owner attempt settles before the next waiter, no claim of fixed progress latency. Later implementation must retain existing operation budgets.
4. **Design adequate.** §5–9 typed refusal/physical/projection/completion shapes; no closed/retired diagnostic interpreted by downstream local table.
5. **REVISE B01/B02.** Ordinary redelivery/wake release path is promised but exact old REMOVE target and early token-bearing wake need closed rules.
6. **REVISE B03.** Bound checks are synchronous and post-await; generic post-await writes are not yet covered by an explicit ownership condition.
7. **Design adequate.** §7 captured request/origin/entry identity and B03/B06 outcomes preserve the real blocked target, subject to B01 replay correction.

### Concurrency serialization

1. **Design adequate.** §7 gate installed synchronously before owner calls; physical lifecycle and real metadata CAS remain lower enforcement. B03-01/02/05.
2. **REVISE B03.** §3/8 cover bound post-await lifetime/currentness; generic operations/recovery/failure writers can still clobber newer canonical ownership.
3. **Design adequate.** All triggers use the same canonical gate; separate physical task registry only owns already admitted file/native lifetime, not handler admission.
4. **Design adequate.** Deferred callbacks and gate waiters recheck the same irreversible lifetime; B02-05/B03-04 attack old callbacks.
5. **Design adequate.** Canonical replica conflicts serialize handler work, exact origin/token identifies physical task joins, and actual directory owner retains file ownership. These are distinct resource lifetimes.

### Recovery replay

1. **REVISE B03.** Single application/lifetime fixes stale scans, but every writer of the unified manager record needs ownership protection including generic paths.
2. **Design adequate.** §3 retained successful startup promise vs explicit failed pre-application retry; replacement handler has new irreversible lifetime.
3. **Design adequate; native excluded.** §3 refuses unavailable/nonarray whole results and retains distinct origins; B02-02/06/B06-02 prohibit empty-as-success. Production enlisted/formation reconstruction is activation/U2, not this design approval.
4. **REVISE B01.** Captured REMOVE target is lost from active gate at HELD settlement; durable/reconstructible request binding or fail-closed replay semantics must be specified.
5. **Design adequate.** §9 exact RETIRED/ALREADY+HISTORY_UNAVAILABLE is distinguished from missing storage, bare booleans and unreadable evidence. Applied STOPPED and separately confirmed journal completion remain required.

### Transport delivery

1. **Existing boundary retained.** No new network ACK grants completion. B03-03 requires actual caller refusal/retry classification; native transport certification is not claimed.
2. **REVISE B01.** Late/duplicate REMOVE after settled HELD cannot choose J from a newer memo under R_I.
3. **Design adequate.** Typed BOUND_OPERATION_BUSY/deferRetry unadmitted carrier aligns with existing transport classifier. Exact request/target replay still requires B01.
4. **Existing boundary retained.** No new awaiting network owner. Ready/busy refuses typed and existing caller budgets retain authority; future implementation transport tests remain mandatory.
5. **Oracle adequate; unexecuted.** Matrix fidelity permits route stubs only alongside actual owner seam witnesses; no new stub is approved or dynamic delivery pass claimed.

### Harness fidelity

1. **Oracle adequate; unexecuted.** Matrix requires original F2–F6 witnesses to reach named semantic assertions, not setup/ABI/timeout errors. B0 ran no dynamic tests.
2. **Oracle adequate; unexecuted.** Actual SQLite/CAS/opening/directory owner and corresponding real interaction required beside route-only scripted cells.
3. **Oracle adequate; unexecuted.** Explicit promise gates and actual ownership transfer; no compressed polling/timeouts may become semantic progression.
4. **Oracle adequate; unexecuted.** Full original intent/token/descriptor/local file identity and actual publication rows are required. B05-02 guards missing storage.
5. **REVISE oracle omissions.** Add settled REMOVE replay after J, wake before handler token exposure, and stale generic writer over bound J. Existing matrix does not isolate these decisive schedules.
6. **Honest ceiling.** No B0 runtime/native/live proof claimed; later real checkpoint, implementation, exact-head review, mutations and lab obligations remain explicit.

### Formation circularity

1. **Design adequate with explicit gap.** §3 names missing production recovery reader; journal query atomicity is storage-bound, not assumed across RPC/local inspection. §9 production projection continuation is activation-owned.
2. **REVISE B02.** Conditional original redelivery/restart is explicit for no-native F, but an applicable in-flight native wake must not disappear solely because handler token exposure lags its durable journal.
3. **Design adequate.** Pre-ready NOT_READY and unresolved canonical currentness/busy typed refusal preserve caller retry; no new startup serving grant.
4. **Not a formation latency approval.** No formation-window timing measured or asserted. Later native/activation proof retains existing budgets, not relaxed by B0.
5. **Design adequate except unresolved B01 owner.** No parallel journal/selection policy. B01 must choose the existing request owner for any durable binding, or explicitly fail closed without inventing a handler authority.

## Required next step

Preserve this verdict beside its exact v3 subjects, then write one explicit successor/amendment addressing all three boundaries and the new decisive rows. Re-review the complete paired contract/oracle against its new hashes. No B1 production task, task-v2 PROVEN surrogate, witness execution, parent closure or whole-U1 approval follows from this REVISE. A0 remains a separately approved expected-red checkpoint; A1 owns reservation finality and B must consume that eventual reviewed result without inference.
