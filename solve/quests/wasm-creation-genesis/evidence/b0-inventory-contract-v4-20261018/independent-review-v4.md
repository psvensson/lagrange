# B0 v4 independent design/oracle review — REVISE

Reviewer `subagent:/root/rsraft_a0_readiness`, independent of author `/root/rsraft_b0_contract`. Exact reviewed clean commit `f21875950648a2a3fe1c1e50330d53012be18a31`; planning base `a1c3cde54fcb46471791062bcae4a6000ae484e0`; production/test subject `a251ce4fd9c980a78c0fd33d8a5f873161f90870`.

Contract SHA256 `0be7069afbc314743cab7223670d685552e1f3e2b8a67a0cc0d37fe22a9ddf1c`; paired oracle SHA256 `2384126db7bdf0430979ea4707efc3a0602958e152efa0771746ef9876a01d07`. Independently verified all 68 manifest entries from exact committed bytes/Git objects, including preserved v3 REVISE; `src/` and `test/` are unchanged. Audit: `/tmp/rsraft-guidance-20261018/b0-v4-independent-manifest-audit.json`.

**REVISE, category-complete for these exact paired bytes.** One additional target-selection gap remains. The complete F2–F6/D1 contract, new two-owner custody handoff, matrix, owner map and conditional B1 packet were reviewed. No implementation, dynamic test, mutation, native or lab pass is claimed. U1 REJECT, v2 INCOMPLETE/REVISE and v3 REVISE remain immutable. This verdict does not accept B1 or close any Quest.

## B04 — fresh UNBOUND REMOVE can bind a stale memo instead of the actual current creation

V4 §7 allows a new owner-confirmed UNBOUND request to nominate an origin from its “current owned memo” and validate its immutable identity through the original creation journal. §7a durably fixes that nomination. Neither section explicitly requires a fresh physical-current observation at this initial target-selection point. Section 8 only protects memo writes and CREATE/retirement state transitions; it does not invalidate an already-installed memo when a direct manager caller changes the physical owner. BD1-12 explicitly admits that stale-memo state and tests its duplicate-CREATE path, but BR-01–10 do not test fresh REMOVE nomination from it.

Concrete permitted schedule: handler ACTIVE memo names I; direct manager legitimately retires/replaces I and makes J physical current, without updating the handler's old memo; a new R arrives whose real replica-operation row is UNBOUND. Handler holds its canonical gate, reads the old owned I memo and validates I's real immutable journal identity. The operation owner durably binds R→I, then original creation handoff/retirement completes or returns I's existing terminal answer. R can report its removal completed although J was already current before R selected its target. Exact replay is now safe, but it faithfully repeats the wrong initial selection. The handler gate cannot exclude direct manager admission, and a valid historical journal identity cannot prove currentness.

Source evidence at the pinned subject: `src/node/runtime-service-handler.js:525–550,644–727` derives removal from its canonical memo; `runtime-service-bound-creation-route.js:275–301` uses current memo presentation; `service-consensus-bootstrap.js:167–210` and `wasm-service-lifecycle.js:222–280,426–434` permit physical owner changes outside that handler. Actual dispatch carries operation/entity/replica rather than an already-bound original creation (`operation-workflow-dispatch-response-reconcile.js:637–647`). The existing physical owner, not another metadata phase table, must qualify the fresh nomination.

Required bounded correction:

- Define the initial target-selection point for a genuinely UNBOUND request. Immediately before selecting the candidate, synchronously consume the existing physical owner's exact origin observation. CURRENT must match that nominated origin; DIFFERENT/UNAVAILABLE must refuse without target CAS/handoff/effects. Do not reinterpret a stale I memo as permission to choose J silently.
- Preserve tokenless/absent-origin cleanup deliberately: an ABSENT physical answer is not grant, and must not choose among multiple legitimate origins by row order, timestamp, phase or selection version. Name the narrow unique original obligation under which a pending/retirement target can be chosen; ambiguity/unavailable identity remains typed current-unresolved.
- Distinguish the selection snapshot from replay: once an origin is validly selected and bound, J appearing later does not change R's immutable I target. Exact I completion is not a promise of canonical-key absence forever. Existing durable replay must continue I even when J is current.
- Add decisive real-owner oracles/mutations for stale ACTIVE-I memo + already-current direct-manager J + new UNBOUND R (zero CAS/handoff/retirement/outcome); valid CURRENT I nomination followed by later J (binding/replay remains I, J untouched); ABSENT tokenless unique origin; ABSENT multiple origins/refusal; CURRENT mismatch and unavailable observation. A route-only answer stub must be paired with the actual physical-owner/direct-manager composition.

The author independently confirmed during review that “current owned” does not make this physical check explicit enough and will supersede these bytes. That agreement is not the evidence for this finding; the permitted schedule above is.

## Disposition of the three prior findings and new custody scope

V3 B01 is substantively corrected for **settled replay**: §7/7a puts immutable request→origin binding on the existing replica-operation row, requires exact authoritative CAS/read, rejects legacy/absent evidence, preserves every row writer/retention path, and gives original creation mode its separate durable handoff. BR-01–10 cover replay, restart, conflicting input, REPLACE source, lost answers, terminal/evidence-expired refusals, real production ingress and GENERIC immutability. The present B04 concerns initial nomination, not a repeat of the resolved replay rule.

V3 B02 is corrected in design: §6 installs a synchronous validated ADMISSION_RETAINED observer after original journal authority and before adapter continuation can emit its own native wake. BW-01/02 require actual retention/open ordering, wrong-token controls and refused observer→zero physical work. Native wake cannot supply authority or await its own run. Independent pre-exposure wakes retain an explicit conditional retry limit.

V3 B03 is corrected in design: §8 covers all generic/bound manager and driver writers, including catch/recovery/uninstalled prepare, through captured entry/ownership plus pre-effect and post-await guards. BG-01/02 test both ownership directions and every shared store. No disjoint-key assumption or second currentness registry remains.

The explicit parent-approved B1 scope expansion is coherent: replica-operation binding supplies request routing; the original creation row supplies the remaining retirement obligation. Target ACK alone cannot authorize effects. Handoff CAS/read precedes acceptance/effects; committed mode reconstructs before attempts; exact operation+intent physical fence protects tokenless/direct in-flight reentry; settled fences hold no resources and do not permanently fence J. Two-table cuts are ordered, not an atomic transaction claim. Terminal workflow failure does not erase original retirement debt, and retention cannot erase unresolved routing custody. Ordinary production schema/inserts/serializers/updates/repair/divergence/retention/dispatch/gateway wiring are implementation prerequisites, not replaced by injected callbacks. B04 must close the first selection boundary of this otherwise coherent interaction.

## Complete sealed checklist dispositions

Each “adequate” below is design/oracle judgment, not an executed pass. The seven sealed categories and all 43 items are addressed.

### Owner interaction (10)

1. Adequate: §2/7a assigns request binding, original mode/token, physical admission, resource finality and effects to existing distinct owners; no second journal.
2. Adequate: §8 and BG-01/02 give every generic/bound canonical writer the same captured ownership discipline.
3. Adequate oracle; unexecuted: matrix fidelity observes journal/resource/physical/memo/manager/driver/projection/outcome together.
4. REVISE B04: fresh target selection must qualify stale memo against physical currentness. Settled replay and stale generic writers are otherwise explicitly covered by BR/BG.
5. Adequate: §7 finite plan waiters, one pending wake, exact gate entries and B03-05 fairness; no unbounded accepted request queue.
6. Adequate: §6/BW-01/02 names synchronous authoritative token exposure before own native wake.
7. REVISE B04 for nomination; §8 otherwise consumes physical currentness through one value-only observation and guards all canonical writers.
8. Adequate oracle; unexecuted: original 13 mutations plus added mechanisms require unmutated positive control, named assertion and exact restoration.
9. Adequate except B04: retained-plan dispatch reenters ordinary authority; §7a lost answers fail closed and do not infer admission from CAS ACK.
10. Implementation prerequisite: owner map names shared impact groups; expanded ordinary production interaction must update actual registered owner cone. Additional constructors inspected: `bootstrap/shared/runtime-service-handler-setup.js:177–187`, `guarded-runtime-service-handler.js:20–34`, `startup-service-lifecycle-owner.js:29–33`; absent gateway/journal wiring must refuse, not use caches. The source map is illustrative, not permission to omit those compositions.

### Admission gating (7)

1. REVISE B04: CURRENT/ABSENT/DIFFERENT/UNAVAILABLE is well defined, but new UNBOUND nomination needs its own required observation.
2. Adequate: current-unresolved, target-unresolved/legacy attention and busy are unadmitted typed refusals; no INITIATED/outcome before target and handoff confirmed.
3. Bounded design: one attempt releases gate; conditional retry is explicit; no new latency guarantee or relaxed existing owner budget.
4. Adequate: §7a/9 closed target/mode shapes and separate physical/projection/journal facts; raw booleans cannot discharge debt.
5. Adequate except initial-selection B04: known binding replay, original redelivery, wake, retirement mode and restart triggers are explicit; legacy loss requires owner attention.
6. Adequate: irreversible handler lifetime, exact gate entry and generic/bound captured post-await guards; request/boot rechecks after authority awaits.
7. REVISE B04: valid request/target identity is durable after CAS but must be chosen under actual physical-current/unique-origin evidence first.

### Concurrency serialization (5)

1. Adequate: existing synchronous canonical pre-admission gate, authoritative row CAS/read and lower physical admission fence; no parallel handler scheduler.
2. Adequate: §3/6/8 all old owner results and generic catches cannot overwrite a newer entry; refused observer prevents continuation.
3. Adequate: startup/CREATE/wake/REMOVE share gate; lifecycle task registry owns already-admitted path/native custody only.
4. Adequate: delayed callback/waiter/settlement checks same stopped lifetime and stable entry; B02-05/B03-04.
5. Adequate except B04 target nomination: exact origin/token joins, canonical scheduling and real directory ownership are distinct lifetimes. BR-06 covers in-flight/direct CREATE vs handoff fence.

### Recovery replay (5)

1. Adequate: one applied inventory plus all generic/bound guards, not scans over current state; exact distinct plans retained.
2. Adequate: synchronous shared startup promise; only failed pre-application attempt explicitly retries; success/lifetime retained.
3. Adequate with explicit activation ceiling: unavailable/malformed whole read cannot become empty; total per-row diagnostics and one actual storage query; production multi-shard reader equivalence remains unproven.
4. Adequate for replay: §7a exact binding, retirement mode, six crash cuts, legacy/missing/refused evidence, terminal and retention behavior; BR-01–10. B04 is new admission, not loss of replay identity.
5. Adequate: exact local RETIRED/ALREADY + HISTORY_UNAVAILABLE versus missing storage/booleans; physical proof, applied STOPPED and original authoritative completion remain separate.

### Transport delivery (5)

1. Existing boundary retained: ACK only after target/handoff; no network response grants physical/resource finality. Real emitter/gateway production composition required by BR-07.
2. Adequate for duplicates: settled R_I rereads immutable binding before memo, survives restart and J; terminal/evidence-expired answer cannot select new target.
3. Adequate: unadmitted busy/binding-pending ERROR+deferRetry is distinguishable from admitted IN_PROGRESS. Existing semantic classifier and dispatch retry remain mandatory real witnesses.
4. Existing owner budgets retained: no new transport wait or fixed latency guarantee, no budget weakening. Terminal operation does not authorize new effects.
5. Adequate oracle; unexecuted: route stubs require paired real-owner interaction; BR cases require actual operation gateway/row CAS/read and ordinary emitter.

### Harness fidelity (6)

1. Adequate oracle; unexecuted: preserved F2–F6 cases must reach named assertions; ABI/setup/zero-test/timeout failures are rejected.
2. Adequate oracle; unexecuted: actual SQLite, journal/resource CAS, opening files and directory owner required; no scripted authority for proof fact.
3. Adequate oracle; unexecuted: explicit owner promise gates, physical admission and directory transfer rather than time compression.
4. Adequate oracle; unexecuted: complete original intent/token/local storage and exact physical projection identities; wrong evidence remains negative.
5. REVISE B04 matrix omission: BW/BG and BR now isolate all three v3 findings, but no fresh UNBOUND stale-memo/physical-current nomination row yet.
6. Honest ceiling: no B0 dynamic/native/live proof; checkpoint and future B1 ordinary green/mutations/static/corpus/lab/composed review remain mandatory.

### Formation circularity (5)

1. Adequate with explicit gaps: §3 missing production recovery-reader is lane D; ordinary REMOVE ingress is now required B1, not deferred. Production projection/endpoint completion is also not claimed wired.
2. Adequate: own native wake cannot be lost solely to token exposure; no-native F and independent pre-exposure event have named conditional redelivery/restart limits.
3. Adequate: pre-ready/current-unresolved/busy/legacy refusals retain owner retry/attention and no borrowed serving grant.
4. No formation latency approval: none measured; later native/activation must satisfy existing budgets.
5. Adequate authority split except B04: existing operation row and original journal own distinct facts, not duplicate ledgers; discard of volatile state cannot widen permissions.

## Next step

Preserve this exact REVISE beside v4; prepare a bounded successor explicitly closing B04 and paired nomination oracles, then obtain complete exact-content review. No need to undo the three valid v3 corrections or reopen their resolved rules. Any new bytes need a new verdict. Future B witness adoption remains test-only and honestly expected-red; B1 remains unschedulable until actual approved checkpoint/base/shared A1 ownership and ordinary proof inputs exist. U1 REJECT is unchanged.
