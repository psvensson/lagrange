# C17 hydration handoff amendment: independent round-three design review

Date: 2026-10-11. Reviewer: `subagent:/root/review_checkpoint_composition`.
Author-distinct, docs-only review. No source, test, metadata, index or Quest log
was changed. No proposed transport code was executed. This is the complete
finding batch for the bounded revision.

## Separate verdicts

- **APPROVE the caller-only N1/N2 design**, D:62–172, independently of the
  transport amendment. Its exact synchronous settlement operation is
  implementable in the existing catchup/reconcile owners. The approval is a
  contract approval; unchanged source at d23 remains rejected on N1. The
  required source witnesses and source boundary are specified below.
- **REVISE the complete transport/resource design for D9 below.** The disjoint
  completion credits, same-ordinal continuation and bounded byte-identical
  digest clauses address D6/D7/D8. The newly introduced per-pool
  `completionClaimant` does not yet define a coherent winner across remote
  pools. Its local exclusive gates admit the counter-schedule below.
- **Preserve earlier scoped component dispositions.** R3-4/R3-5/R3-6/R3-7
  remain accepted only within their prior source scope. D1–D5 corrections remain
  accepted design directions. R3-1/R3-2 resource source work remains pending.
  This review does not approve source d23, normal startup, whole-process memory
  bounds, transaction BEGIN/activation work, original-event delivery/ACK
  recovery, physical replacement or merging to main.

No additional blocking finding was established in this round. D9 is a design
ambiguity with a reachable schedule under its exclusive-marker reading, not an
executed runtime deadlock or a new regression attributed to frozen source.
Future implementation tests need not already pass for this design review.

## Exact subject, provenance and evidence boundary

`W` = `/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011`.
`E` = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`.

**D** = `W/solve/quests/replicated-transaction-decision-and-apply/cdc-coverage-response-resource-handoff-amendment-20261011.md`.
SHA-256 **`475490300df5a6f64bfa72d774160ecbab24e578a3e4defb52aec460dd64510b`**.
All D references below refer to these exact 630 lines, read in full.

| Evidence | Exact SHA-256 |
| --- | --- |
| Preserved predecessor `E/cdc-coverage-response-resource-handoff-amendment-12824e5047e8000b6eb85aa27c58c557b2683043ea7345d8da837d1d118ab17c.md` | `12824e5047e8000b6eb85aa27c58c557b2683043ea7345d8da837d1d118ab17c` |
| Prior complete review `E/review-cdc-c17-resource-handoff-round2-checkpoint.md` | `22c52c6222b08fd1787ce649967e51973b6135fe44491bf1d7159642695e949d` |
| Earlier complete source/design review `E/review-cdc-c17-nontransport-and-resource-amendment-marker.md` | `c4d9d172dd9d69aa87198d29f1ffe1abb61ceb16f9f92fbb3f18020d2a32ecce` |
| Earlier preserved amendment `E/cdc-coverage-response-resource-handoff-amendment-864abf590b82dbc302cfc721c3c26ed0aa1853048bb4fdf0ff529eb72d262207.md` | `864abf590b82dbc302cfc721c3c26ed0aa1853048bb4fdf0ff529eb72d262207` |
| Source census `E/cdc-c17-round3-nontransport/source-manifest.sha256` | `40b5c87f667f6375064ff05ea80990beb282ddc49471058d3104623216c94d86` |

Independently checked all **48/48 source/test/metadata entries** in that census
against live W and `git show d23a0746bf5ee6c9b659d43abe27630d86d38397:<path>`;
all match. The census's other entry is the superseded amendment, so D is pinned
separately. Frozen source tree is `8de2a04f24b03c03d5b88d56161089d69f2c7c3c`;
worktree HEAD is `e7c89f4b5114c0238312d3831b65889a4622f4e9` and observed index
tree is `4d45f84daa6d4a2639b4bd3d6ea5e819bf98360d`. The docs amendment does not
replace the source review or its retained reds.

Loaded steering and owner authority: AGENTS, rules, router, architecture index,
runtime contracts, authority-and-recovery contract and the ten applicable
verification templates. The 63 instantiated obligations are disposed below.
Prior reviews and their controls were read cumulatively; current actual owner
paths were checked. Memory was only routing/scope guidance.

### Source reference key

All source paths below are relative to W.

| Key | Path |
| --- | --- |
| CT | `src/cdc/cdc-integration-service-authoritative-catchup.js` |
| RO | `src/cdc/cdc-coverage-reconcile-owner.js` |
| RC | `src/cdc/cdc-complete-coverage-reconcile.js` |
| PO | `src/cdc/cdc-coverage-transfer-owner.js` |
| FC | `src/cdc/cdc-coverage-fragment-consumer.js` |
| SC | `src/partition/partition-cdc-source-coverage.js` |
| ST | `src/partition/partition-cdc-coverage-transfer.js` |
| PE | `src/partition/partition-service-entry-apply-base.js` |
| CO | `src/cache/system-table-cache-cdc-source-order.js` |
| CN | `src/cache/system-table-cache-observation-methods.js` |
| Cache | `src/cache/system-table-cache.js` |
| Domain | `src/cdc/cdc-coverage-domain.js` |
| JSON | `src/utils/canonical-json-data.js` |
| RI | `src/transport/message-router-inbound-dispatch.js` |
| RD | `src/transport/message-router-delivery-behaviors.js` |
| AR | `src/cdc/cdc-integration-service-authoritative-read-flow.js` |
| Registry | `test/shards/impact-contracts.json` |

## Caller-only approval: N1 and N2

The approved design boundary is D:62–172: bounded caller waiter admission,
one captured caller deadline checked before each table, one synchronous exact
settlement operation for every exit, and an independently captured shared
execute closure/deadline. It can be implemented without page-v2, response
handoff, new pool credits, cache comparator or the claimant mechanism.

The actual defect remains at RO:338–373: an existing debt replaces
`debt.execute`, and an in-flight debt returns its shared promise directly at
RO:354–355. CT:36–64 captures an outer deadline but currently does not enforce
the proposed per-table pre-join check. These are the existing owners to change;
no alternate catchup coordinator is authorized by this approval.

D:80–102 is the decisive N2 correction. Before clearing anything it captures
the current clock and the exact waiter's own cancellation, lifecycle, pending
state, map identity and deadline. It chooses mismatched/no-effect, CANCELLED,
RETIRED, SPENT, then an otherwise valid proposed outcome. All timer, cancel,
generation-completion and shutdown paths use that operation. An expired caller
cannot become COMPLETE merely because its timer is queued. Deleting the exact
map entry, removing timer/abort registrations and clearing references occurs
once; the resolve function must be captured for that one final invocation.

D:106–124 preserves the shared generation and legitimate publication. A joining
caller cannot replace its execute closure, extend or shorten its deadline,
cancel another waiter or retract installed coverage. An expired generation
does not inherit a longer caller's time. Subsequent attempts remain within the
existing debt/cooldown owner. No per-join reaction remains attached to the long
shared promise after a caller exits.

**Required implementation evidence, before source approval:**

1. Real CT/RO short joiner expires and drops its references while one shared
   read and a longer caller continue; no extra read and no shared cancellation.
2. The retained default NODES/SERVICES t=31000/t=31050 ordering refuses the
   spent first caller's second-table join while the second call continues.
3. The D:154–159 synchronous t=1040–1060 stall with short deadline 1050 and
   shared/long deadline 2000 gives short SPENT, long COMPLETE and retains the
   valid installed fact, before the short timer has run.
4. Cancellation before/after admission, lifecycle replacement, exact duplicate
   settlement and shutdown remove only the correct waiter and references.
5. A concrete finite `MAX_WAITERS_PER_DEBT` refuses immediately at capacity
   without retaining a timer, abort callback, caller closure or promise
   reaction; a later admitted caller can proceed after capacity returns.
6. Existing failed/spent generation recovery, frozen generation deadline,
   final publication fence and longer valid caller controls stay green; test
   metadata registers the changed caller/reconcile interaction.

The symbolic waiter cap is an implementation constant to fix and prove, not a
reason to withhold this design approval. Caller references must not leak through
the retained generation execute closure. D:106–109 explicitly requires the
generation to retain its context/source work only; verify the actual capture in
the source review. No arbitrary-host threat-model expansion is requested.

## Complete new finding

### D9 — independent exclusive completion claimants can block each other's remote source admission

**Transport progress/ownership contract blocker.** D:319–344 adds a volatile
exact claimant after denied cache growth. While live, each node pool refuses
new coverage roots belonging to every other debt. The marker clears on its own
successful complete-unit admission, attempt deadline, lifecycle replacement or
shutdown. Source contention may also mark that debt as the source pool's local
claimant. The contract does not define conflict arbitration between these
markers, or a progress-preserving interpretation for a transfer spanning two
pools.

Admissible counter-schedule under the exclusive-marker reading:

1. Let debt A hydrate from source node X to recipient node Y; debt B hydrates
   from source Y to recipient X. Each transfer alone fits the appropriate
   local S+H and C+K budgets. This uses two ordinary remote transfers, without
   malformed input, unlimited load or perpetual cache mutation.
2. A finite cache-growth event makes both recipient staging preflights exceed
   their previously admitted K. A follows D:319–326 and leaves claimant A in
   pool Y; B leaves claimant B in pool X. Their old source and recipient units
   fully drain. Both caches then remain unchanged.
3. A's next capture needs a new S+H source root in X, but X refuses other-debt
   roots while claimant B is live. B's next capture needs S+H in Y, but Y
   refuses it while claimant A is live. The recipient C+K admission is later
   than the source OFFER, per D:264–295 and phase 2/5 at D:516–523.
4. No bytes need remain held for these gates to block both attempts. No
   successful complete-unit admission occurs to clear either marker. Resource
   release wakes have already happened; a node-local wake does not revoke the
   conflicting foreign admission predicate.
5. Deadlines can clear the markers, so this is bounded refusal, not an asserted
   permanent runtime hang. However the stated rule alone does not select a
   completing winner; bounded attempts may repeat the same admission order.

An alternative reading of D:333–334 replaces an existing claimant when another
debt's source admission is contended. That avoids the exact exclusive-marker
state only by choosing unspecified overwrite/preemption semantics. It conflicts
with treating the old marker as the exclusive completing winner and can allow
opposing retries to replace each other's claim. The document must choose one
executable rule; an implementer should not invent this authority decision.

This is new proposed behavior. PO:117–146 currently reserves against actual
node-local counts/bytes, and has no completionClaimant. PO:62–81 invokes its
node-local wake callbacks on release; PO:149–157 registers them. RO:138–153
connects those callbacks to service-owned debts, and RO:376–397 skips an already
in-flight generation. RC:47–51 mints a fresh transfer binding for a read. These
actual owners supply neither a cross-node claimant winner nor an implicit
remote wake. D:395–398 already correctly recognizes the remote-wake distinction
for held ordinals; the new root admission rule needs equivalent precision.

**Required bounded correction:** specify the admission/ownership rule at the
existing pool/reconcile boundary so at least one individually affordable
transfer can complete under the finite-contention schedule above. Define the
single-winner/CAS or replacement semantics, which source/recipient admissions
the marker gates, exact identity across a new transfer binding, retirement and
clear events, and the actual existing retry/wake path. The rule must not depend
on a locally chosen marker silently becoming authoritative in another pool.
Release/wake and marker installation must also have an explicit ordering;
current PO release synchronously invokes wake callbacks.

This may simplify or remove the new marker; it does not require a new durable
ledger, remote scheduler, global readiness barrier or generic retry owner.
Preserve the now coherent disjoint completion credits and exact external
custody. The relevant future paired witness is: finite growth, opposite remote
transfers, both old units drained, one supported transfer completes without a
new user write or renewed caller/attempt deadline, and the other remains a
truthful bounded obligation. No implementation test is required merely to
resolve these design bytes.

## Cumulative findings and corrections

| Item | Round-three disposition and exact evidence |
| --- | --- |
| N1 | Caller design approved independently: D:64–78,106–128. Unchanged source RO:354–355 remains rejected until implemented and independently verified. |
| N2 | Corrected in design by the synchronous deadline/cancel/current-identity settlement at D:80–102,111–117; delayed-timer witness D:154–159. |
| D1 | Full captured-envelope preflight retained at D:188–249: raw fields, escaping, base64, final wrapper/messageId/sourceAddress, serializer/frame copies before allocation. Actual PE/RI/RD adapters remain required source work. |
| D2 | D:354–379 preowns one H/data token and gates reuse on actual send terminal events. Receipt/ACK/handler completion cannot release H. D7 continuation now specifies the other endpoint. |
| D3 | D:299–307,346–350 distinguishes pre-adoption CAS from adopted C/K ownership; source TTL/CANCEL cannot reclaim recipient or queued notification references. |
| D4 | D:459–474 transfers Knotify before scheduling; callback finally, schedule failure or actual shutdown drop releases it. Installed state survives. |
| D5 | D:417–432 removes row JSON comparison, includes unchanged identity fast path and direct canonical-schema primitive comparison, including old NUL data outside the incoming page. |
| D6 | D:212–249,264–307,516–538 now gives disjoint S/H/C/K and preowned completion counts/bytes; no later borrowing for H. Fresh K check and exact denied-growth cleanup are specified. The new claimant added for progress has the separate D9 blocker. |
| D7 | D:371–409 makes HELD_ORDINAL_DEFERRED a retained same-transfer continuation, explicitly superseding current FC:144–147/188–191 and RC:271–274 cleanup for that class only. Existing RO context owns bounded waiting; remote reentry is timed, not a fictional source-local wake. |
| D8 | D:476–507 restores bounded incremental canonical JSON hashing under the existing JSON owner with exact prior digest bytes. Dsrc/Drecv/Dcache and metadata are charged; byte/digest equality controls required. |
| R3-1/R3-2 | Resource source remains pending. No claim that the old NUL amplification or colocated reserve-order source red is closed by these documents. |
| R3-4 | Accepted final publication check retained: RC:176–190 and CO:535 immediately before CO:540–545; D:454–457. |
| R3-5 | Accepted CRITICAL descriptor recovery retained at SC:263–271; payload stays BACKGROUND/BULK at RC:76–80 and D:573–574. |
| R3-6 | Accepted node-shared diagnostic census retained at PO:228–261 and D:575. New holds must join the census; counters never prove reference release. |
| R3-7 | Accepted canonical primitive decimal N bound before regex/BigInt retained at CO:318–341 and D:576–577. |

The earlier 3 MiB NUL row, oversized cursor/envelope, old colocated refusal,
same-N replay/conflict, incomplete coverage/absence, suffix UPSERT/DELETE and
stale publication controls remain cumulative. They were not rerun against
nonexistent page-v2 source in this docs review. The required supported 8 MiB
colocated transfer, greater-than-16-MiB row, multi-page backlog, interruption,
real WebSocket terminal custody and queued-notification witness all remain
source-approval obligations at D:591–625.

## Production path and allocation boundary

Normal joining readiness and membership publication use CT, then RO/RC, the
authoritative read gateway, query routing and PE/SC. AR:511–516 disallows the
hosted raw-table shortcut for required owner RPC. SC:398–412 captures the source
applied prefix and rows in one synchronous SQLite transaction; no SQL transaction
spans a transport wait. Source scope/current authority is checked again after
capture. FC consumes the transfer and CO owns cache coverage/publication.

The proposed handoff must traverse the real adapters: PE:72–81/765–769 wraps
partition/read-authority results; RI:476–494 emits the outer SERVICE_RESPONSE;
RD:133–157 handles the local return path; RD:698–701 currently serializes and
sends with no resource handoff. RI:50–52 also materializes received input. The
new measured input/output lifetimes must include those actual objects, and the
private handoff/suppression sentinel must be consumed before generic result
spreading or error serialization. ACK/noHandler is not processed coverage.

The revised allocation equation is now unambiguous: source S excludes H,
recipient C excludes K. A remote source reserves S+maxH plus counts before
materialization; the recipient reserves C+K before accepting/decoding. Colocated
admission reserves S+H+C+K atomically. Sending transfers H custody rather than
freeing credit. Live-root callback returns H to that root; a retiring source
drains H then S. Adoption transfers C/K ownership. Fresh Kactual is measured
against current cache state synchronously before staging; a miss drops actual
consumer references and unused K while external H continues to be charged.
Notification scheduling transfers Knotify rather than completing its lifetime.

Incremental hashing and the nonallocating comparator preserve semantic bytes
and equality rather than using new digests as an authority shortcut. Exact
runtime coefficients, finite count limits and high-water measurements are
implementation obligations. This is a variable-data budget, not a claim about
total Node RSS. D9 concerns the new admission predicate after cleanup, not a
remaining arithmetic overlap among S/H/C/K.

## Category-complete disposition: 63 instantiated obligations

“Design covered” means the stated contract is coherent for that item; it is not
source approval. “Retained” means an existing scoped contract/component is
unchanged. “Pending proof” identifies future source evidence. D9 references
below are consequences of the single grouped finding, not additional findings.

### A — admission, classification and current authority

| ID | Evidence and disposition |
| --- | --- |
| A1 | D:212–249,264–307,434–440; PO:117–146. Same node pool owns preallocation credits and staging. Design accounting covered; D9 holds claimant admission. |
| A2 | D:80–102,371–409,558–564. Exact caller outcomes, held continuation, malformed failure and deferred capacity are distinct; no empty success. Design covered. |
| A3 | D:69–72,80–124,384–401; CT:36–64, RO:325–373. Caller and generation deadlines remain distinct and unrenewed. Caller clause approved; source N1 pending. |
| A4 | D:251–258,354–409; PE:72–81, RI:476–494, RD:133–157, FC:139–191. New local handoff and held result must be consumed at every real adapter. Contract covered; source pending. |
| A5 | D:328–344,363–409,459–474; PO:62–81,149–157. Exact send/notification/waiter releases named. D9 leaves claimant wake/admission propagation unresolved. |
| A6 | D:80–96,388–401,434–457; RC:176–190, CO:535. Current clock/lifecycle/binding checked at terminal consumption and final publication; postpublication fact retained. Covered/retained. |
| A7 | D:39–51,212–236,575; PO:228–261. Diagnostics must name actual S/H/C/K/claimant owners and copies. Retained census; new diagnostic source proof pending. |

### Y — eventual progress and bounded retry

| ID | Evidence and disposition |
| --- | --- |
| Y1 | D:119–128,328–344,384–409; RO:269–322,376–397. Same-ordinal timed continuation now explicit. D9 prevents approving all capacity retry progress. |
| Y2 | D:80–124,542–564; RO:269–289. Unreadable source cannot renew the shared bound; caller wait has its own bound. Caller design approved; no source closure claimed. |
| Y3 | D:299–307,381–409,459–474,542–564. Retired/invalid/spent/installed exits identify whose references remain. Covered; claimant conflict has D9 disposition. |
| Y4 | D:264–307,328–344,381–409. Atomic colocation and preowned H remove old partial-credit cycle; per-ordinal callback waits can continue. Opposing remote claimant gates: D9. |
| Y5 | D:74–78,212–249,516–538; PO defaults/117–146, RO:31–39. Waiter/count/byte/H/Knotify bounds named. Concrete constants/high-water proof pending; no whole-process bound approval. |
| Y6 | D:80–102,299–307,354–409,459–470. Exact waiter/claim/send/notification identity makes duplicate and late release idempotent; same-N controls retained. Design covered. |
| Y7 | D:98–124,384–401,542–564. ACK, later caller and successful page cannot extend caller or generation time. Covered; D9 repair must not use deadline renewal. |

### T — transport and delivery evidence

| ID | Evidence and disposition |
| --- | --- |
| T1 | RI:435–456, RC:54–59; D:354–379. Transport ACK and missing handler cannot prove processed coverage or free H. Retained plus explicit custody design. |
| T2 | D:299–307,346–409,459–470; FC:139–156. Late source/recipient cannot release successor/adopted bytes. Repeated N+1-before-N-callback is explicit positive schedule. Covered. |
| T3 | D:251–258,371–409,558–564; RC:148–173, PE/RI/RD adapters above. Held is continuation, missing/contradictory session recaptures, no response times out to deferred. Typed consumer implementation pending. |
| T4 | D:251–258,398–409,542–564. Missing token/route/callback remains bounded by original request/generation, external references remain charged until actual terminal event. Covered; D9 local gates unresolved. |
| T5 | D:607–614; RI/RD actual socket/local paths. Real callback/throw/close/shutdown and local/remote witnesses mandated; injected latches must expose actual ordering. Pending source proof. |

### S — time, role and lifecycle

| ID | Evidence and disposition |
| --- | --- |
| S1 | D:80–96,384–395; PO:141–145, RO timers. Injected time and existing unref behavior retained; delayed-timer witness required. Caller contract approved, timer source proof pending. |
| S2 | SC:263–271,413–422; D:570–577. Current source scope/role and CRITICAL discovery preserved; payload priority not promoted. Retained R3-5. |
| S3 | D:126–136,542–587. Retirement removes own waiter/generation/reference state while durable obligations survive reconstruction. Normal restart integration remains outside approval. |
| S4 | D:57–58,299–307,346–369,459–474,542–555. TTL/cancel does not free external H, adopted C/K or queued Knotify. Design covered. |
| S5 | AR:511–516, SC:263–271; D:39–51,570–587. Canonical recovery discovery retained without raw-cache dependency. No new activation gate or full startup progress approval. |

### R — recovered state and replay

| ID | Evidence and disposition |
| --- | --- |
| R1 | CO:395–420,430–447,494–545; D:434–474,579–585. Current revision, cover/suffix, tombstones, final map and publication are enumerated; newer suffix UPSERT/DELETE retained. Durable ACK owner unchanged. |
| R2 | RC:47–51; D:80–96,299–307,388–401. Exact live/replaced lifecycle and adopted identity retained. Claimant identity across fresh bindings needs D9 clarification. |
| R3 | RC:67–73,104–173; D:176–186,579–587. Dense bounded rows, full partition/cell/final/next boundaries and absence authority retained; partial cannot become empty success. |
| R4 | D:371–409,476–507,579–585. Same-transfer ordinal retry and semantic same-N replay/conflict preserved; interruption recaptures from durable source. Source proof pending, no SQL rerun authorized. |
| R5 | D:558–587; RC:148–173. Unreadable/missing authority or response yields refusal/deferred, never completion or absence. Covered/retained. |

### C — concurrency and ownership

| ID | Evidence and disposition |
| --- | --- |
| C1 | D:74–102,264–307,354–369,434–470. Waiter/pair/send/notification admissions occur before async custody/allocation. D9 requires claimant installation/release-wake ordering. |
| C2 | D:80–96,388–401,434–457; SC:413–422, FC:139–156, CO:535. Revalidate after waits and at handoff/decode/publication. Covered. |
| C3 | D:299–307,354–379,459–470. Single exact pair/ordinal/notification owner specified. D9 leaves competing claimant winner/CAS undefined. |
| C4 | D:80–102,346–350,363–409,459–474. Timeout/cancel/close/shutdown are once-only exact-owner releases with no post-swap rollback. Covered; source race witnesses pending. |
| C5 | PO:32–49,117–157; D:264–307,328–344. Byte/count protection uses actual node-shared pool. New claimant gates span a remote interaction without a coherent combined winner: D9. |

### F — production dependency and flow

| ID | Evidence and disposition |
| --- | --- |
| F1 | CT/RO/RC → AR:511–516 → PE:765–769/SC → FC → CO; RI/RD described above. Canonical production dependency inventory retained; handoff adapters need source implementation. |
| F2 | RO:138–153,269–322,376–397; D:119–128,384–409,585–587. Existing debt remains the retry owner without requiring a user write. D9 leaves capacity reentry progress unresolved. |
| F3 | D:62–172; CT:36–64. Formation caller stops under its own bound while legitimate longer shared work continues. Independently approved caller design and precise witnesses. |
| F4 | D:212–307,516–538,597–623. S+H+C+K and deadlines explicit; 8 MiB colocation, >16 MiB row, multi-page backlog/interruption required. Arithmetic direction covered; D9 winner and measured proof pending. |
| F5 | D:39–58,176–186,476–507; AR:511–516. No snapshot-only bulk substitute, forced activation, SQL reexecution or alternate coverage authority introduced. D9 correction must remain in existing owners. |

### H — evidence fidelity and controls

| ID | Evidence and disposition |
| --- | --- |
| H1 | Prior complete reviews pinned above; D:591–623. Retained NUL, colocation and join counterexamples remain; delayed timer, repeated held ordinal and D9 opposing-transfer schedule target actual mechanisms. |
| H2 | SC:398–412, PE/RI/RD/FC/CO paths; D:607–614. Future tests must distinguish real SQLite/router/cache from controlled timing/failure injection. This review ran no proposed implementation. |
| H3 | D:143–168,403–409,597–611. Independent short/long deadlines and receive-before-callback ordering explicitly controlled. N2 caller design approved; source witnesses pending. |
| H4 | RC:47–51,104–137, FC:60–105; D:176–210,371–401. Complete source/binding/ordinal/length identity carried and validated; D9 claimant fresh-binding ownership requires clarification. |
| H5 | D:599–623. Nonempty supported transfers, byte-below refusal, existing NUL row outside incoming page, and unchanged/changed controls required. No empty success used as progress evidence. |
| H6 | Exact D/source census and verdicts above; D:627–630. Docs-only approval explicitly separate from d23 source, normal startup and committed-event/ACK recovery. Retained broader obligations remain open. |

### O — semantic ownership and interaction

| ID | Evidence and disposition |
| --- | --- |
| O1 | D:39–58,299–307,454–474,476–507. Reconcile owns debt/waiters, pool owns resources, router send custody, cache publication/notification, JSON digest bytes. D9 cannot add cross-pool authority implicitly. |
| O2 | D:251–258,354–409; PE:72–81, RI:476–494, RD:133–157/698–701. Local non-wire wrapper/sentinel expansion is explicit; real consumers must unwrap before generic serialization/spread. Pending source proof. |
| O3 | D:591–623 plus cumulative prior reviews. Same eventual candidate must show invalid refusal and supported completion through whole handoff. D9 schedule joins this cumulative set; local greens alone insufficient. |
| O4 | D:119–128,398–401,542–587; RO:306–397. Session/lifecycle loss returns to canonical debt owner. D9 claimant must allow fresh progress without a permanent veto. |
| O5 | D:74–78,238–249,264–344. No global limit increase; repeat callers cannot retain unbounded waiters; complete-unit reservations prevent late credit borrowing. Claimant fairness/progress remains D9. |
| O6 | PO:62–81,149–157, RO:138–153/376–397; D:328–344,395–398. Ordinal remote timer versus local wake is correctly distinguished. Claimant release/clear/wake path needs D9 correction. |
| O7 | D:354–369,459–474,575; PO diagnostics, CO:535. Counter, digest, transport ACK and listener scheduling do not prove custody release or grant publication authority. Covered. |
| O8 | Exact hashes and 48/48 live/snapshot census above; predecessor reviews pinned. Prior runtime negatives remain separately attributed. D9 is only a design schedule, not fabricated executed evidence. |
| O9 | AR:511–516, RC:193–203/255–274/336–364, RO:269–289, PE/RI/RD. Actual adjacent read/cancel/retry/wrapper paths examined; no raw shortcut accepted. New claimant arbitration is the bounded interaction finding. |
| O10 | Registry:894–942,1797–1860; D:624–625. Existing interaction must add live caller-waiter, transport and cache-notification endpoints with paired local/WebSocket tests. Metadata/source work pending. |

### J — JavaScript and byte boundaries

| ID | Evidence and disposition |
| --- | --- |
| J1 | D:188–249,576–577; PO:117–146, CO:318–341, FC:84–105. Checked safe sums and full escaping/base64/UTF16/length bounds before allocation; nonfinite/overflow/noncanonical numeric inputs refused. Concrete encoder arithmetic proof pending. |
| J2 | D:188–210,371–379; Domain validation, FC:60–105. Canonical own primitive fields captured before measurement; inherited/accessor authority not admitted. Existing strict boundary preserved. |
| J3 | D:80–96,188–210,434–440. Waiter/current evidence captured before cleanup; wire values captured once before measuring and consuming; current cache estimate and stage in same turn. Design covered. |
| J4 | Domain strict prototype/proxy/own-field checks; D:188–210,417–432,483–489. Existing prototype defenses retained without expanding to arbitrary hostile-host mutation. Covered. |
| J5 | D:74–78,188–210,251–258,371–379. Primitive bounded identity/error/OFFER/defer fields and wrappers before materialization; no truthy boxed-state shortcut. New typed source proof pending. |
| J6 | JSON existing pinned primitives; D:483–507. Incremental mode retains the existing intrinsic/admission contract. Arbitrary runtime patch immunity is outside the declared threat scope and is not requested. |
| J7 | D:417–432,476–507; JSON, SC:435–448, ST:288–299, CO:343–361. Nonallocating comparison plus byte-identical canonical streaming hash closes D8 design gap; NUL/Unicode/number/key-order equality proof mandatory. |
| J8 | D:176–249,476–507,516–538; RC:67–73, SC capture path. Page/row/count/aggregate and digest metadata bounded, no all-data materialization hidden behind page size. Whole-operation source/high-water proof remains open. |

## Review completion

All 63 instantiated items were considered once in the tables, with exact owner
or design evidence and a scoped disposition. One new grouped finding, D9,
holds the complete transport design. The independent caller-only N1/N2 approval
is available immediately for bounded implementation and subsequent source
verification. The frozen source and broader startup/recovery obligations remain
unchanged by this design verdict.
