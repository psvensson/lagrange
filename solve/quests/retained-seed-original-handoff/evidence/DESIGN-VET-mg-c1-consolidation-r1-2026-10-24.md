---
audience: development
documentClass: evidence
---

# DESIGN VET r1: C1 public receiver admission and forwarding custody

Independent design review of the C1 dossier
(`scratchpad/c1/DOSSIER-c1-receiver-admission-forwarding-custody.md`, 663 lines)
and the lead's binding decisions O1-O9 / edits E-1..E-4, for Quest
`retained-seed-original-handoff` (epic `raft-rs-full-cutover`).
Read in `/mnt/data/peter/projects/.worktrees/mg-delivery-resume-r2-20261023`,
HEAD `bed8c6354737df06e8e57a0c5753d3b88f1e5e5f` (production unchanged; the
worktree has a dirty `test/shards/impact-graph-seal.json` and an untracked
evidence directory `mg-delivery-predecessor-c1-2026-10-24/`, neither read as
authority). No repository file was edited, no test was run. Every `file:line`
is at that HEAD. "Unknown" means not established here.

Abbreviations as in the dossier: RCV = `message-group-service-cdc-propagation-runtime-methods.js`,
ACC = `message-group-cdc-committed-acceptance.js`, REP = `message-group-service-cdc-replication-runtime-methods.js`,
RTG = `message-group-proposal-routing.js`, NDM = `message-group-forwarding-owner-native-delivery-methods.js`,
FDM = `message-group-forwarding-owner-delivery-methods.js`, FWO = `message-group-forwarding-owner.js`,
FRM = `message-group-forwarding-owner-routing-methods.js`, PQ = `src/partition/proposal-queue.js`,
BUD = `src/cdc/cdc-delivery-budget.js`, LIFE = `src/transport/message-router-delivery-lifetime.js`,
BEH = `src/transport/message-router-delivery-behaviors.js`, OUT = `src/cdc/cdc-delivery-outcome.js`,
TEST = `test/message-group/message-group-cdc-receiver-admission.test.js`,
FIX = `test/message-group/message-group-native-custody-fixture.js`.

---

## 0. Verdict

**APPROVE WITH REQUIRED CHANGES** for implementation. The dossier's defect
confirmation (section 1), its class census (section 3), and edits E-1, E-2 and
E-4 are correct against the source. The `ownOperation`/`takeResponse`/RELEASED
semantics were traced line by line and E-2's race is sound: no slot leak, no
double release, no successor settlement, no deadlock, given the transport
settles (which LIFE guarantees, O7 below). Three of the lead's decisions need
exact correction before code is written; one edit must be dropped; one R11
guard must be added. None of the required changes widens scope.

| # | Required change | Why (rule) |
|---|---|---|
| RC-1 | **E-3/O2 return must be liveness-typed.** When `deliverCapturedCdc` rejects (or returns) after the response was retired (`!currentWait`), ACC may return the settled `wait.completion` only when it is a non-committed typed answer. If the settled completion is a committed receipt and `liveWait(service, wait.entry)` is false, return `unknownCdcAcceptance()` (receipt may ride as `cause`). Never return a committed receipt on this path without `inputCdcOutcome` (ACC:243-250): the raw completion carries the N digest (`buildCommittedCdcOutcome`, OUT:239-246), not the I digest, and the contract says a late valid receipt "is not success for an expired source invocation" (CONTRACT F1, "Source result and ACK eligibility" row; item 6 "Both success and failure settlement recheck it synchronously"). | R07, R09 |
| RC-2 | **O4 is not implementable as stated; re-decide it.** "Reply metadata from the owner's captured vector" has no source for refusal replies (BACKPRESSURE/INVALID before capture, ACC:113/118) and the owner's answer does not carry the vector (`cdcCommitted` has one binding per *durable* member, OUT:243-245, so `eventCount` is not derivable for mixed vectors). Returning the vector or counts from ACC is an R08 change to OUT (exact-key validation at OUT:166-169; `tableName/operation/eventCount` are classified there as "Optional wrapper metadata", OUT:110-131). Decide one of: (a) decorate from the shallow wrapper only (`request.payload.tableName/operation`, dense `request.incoming.length`, both already validated by `copyStrictOwnDataRecord` + `hasDurableCdcEvents`, NDM:109-118, OUT:172-191) -- consistent with O3 and with OUT's own classification; or (b) add the field to the single canonical owner and its round-trip witness (CONTRACT F4). I recommend (a). | R08, R03 |
| RC-3 | **Drop E-1's "budget.assertCurrent() on the rejected settlement".** With O2 the acceptance owner names expiry; the receiver's existing fulfilled-path assert (RCV:26) stays as its own clock-domain owner and is what makes cut 4 observable (trace in section 3.7). A rejection-path assert re-types an INVALID/other typed refusal as UNKNOWN whenever the grant lapsed in between, a second decision on the same outcome. | R07, R11 |
| RC-4 | **Pair the two custody hooks.** `proposeCDCCommand` (REP:320) must refuse typed INVALID an options bag that supplies exactly one of `proposeCommand` / `forwardCommand`, and REP:339 must not fall back to the uncharged `forwardCDCCommandToLeader` for a durable caller. Today's only durable caller is ACC:213; the non-durable caller REP:255 supplies neither. Without the guard the next durable caller silently re-creates the C1 class. | R11 |
| RC-5 | **Register the witnesses** (dossier 5.6, verified absent by grep): add TEST to both `contracts["cdc-source-native-delivery"].tests` (impact-contracts.json:1344) and `coupledPairs["cdc-source-native-delivery"].witnessTests` (:2886); add the three PQ tests to the coupled pair (PQ is a `recipient-and-response` owner and E-2 makes it a second `ownOperation` consumer). Regenerate canonical metadata. | owner-interaction item 10 |
| RC-6 | **Add the witnesses in section 5** (W-A .. W-H). W-A (O5) is already required by the lead; W-B, W-D, W-E, W-G, W-H cut new mechanism and are required; W-C and W-F are re-measurements of known mechanism in a new shape. | R19 |

Everything else in the dossier (E-1, E-2 as sketched, E-4, 5.2 invariants,
5.3 schedules, 5.4 cut mapping, O1, O3, O6, O8, O9) is approved as written,
with the wording corrections in section 4.

---

## 1. Frozen behavioural claim

For every public durable CDC input (single or batch, any relay depth, any
`cdcForwardMode`) entering `MessageGroupService.receiveMessage`, the first
state change is the ProposalQueue reservation `queue.enqueue(reservation)`
(ACC:113) on the receiving replica's own `cdcCommitWaiters`; the only reads
before it are the shallow wrapper copy, the shallow durable-member scan, the
forward-context read and the receiver grant (NDM:109-118, BUD:36-62). A refused
input (capacity, duplicate key, invalid capture, dead lifetime) leaves the
queue size unchanged and causes zero proposals, applications or forwards.
Every raw effect (local `raft.propose`, remote forward through
`transport.deliver`) is charged under the same key through
`ownOperation` (PQ:131-151) at most once per route attempt and never nested;
the caller's response is raced against that raw and settles finitely at the
waiter's own deadline, at shutdown, or at local afterCommit, with a typed
outcome named by the acceptance owner; retiring the response never removes an
entry whose raw is open, and raw closure never removes an entry whose response
is pending, so the key/capacity is released exactly once, at the actual
closure of both (PQ:154-174). While the slot is occupied no second forward or
proposal for any input is started on that replica (capacity 1) or for the same
vector (duplicate key). The ingress decision for durable input is made inside
the acceptance/forwarding owners (ACC:192-211, NDM:260-265, NDM:150) and
nowhere in the receiver; the receiver only owns its clock domain
(grant creation at RCV:16-17, grant check at RCV:26) and reply decoration.

Out of the claim (explicit): non-durable CDC (S7), the partition write queue
(S5), generic MESSAGE/ACK routing (S6), transport inbound decode (S8), the
leader's remote-side queue beyond "it is its own queue", source ACK, W7/W9,
classification, two-start acceptance.

---

## 2. Coverage model

Decisions D = {reserve, capture, ingress-decide, local-propose, forward,
settle, release}. Inputs I = {queue free | occupied; leader | follower |
provisional(localIngress) | DEFER; grant live | expired; service live | shutting
down; local afterCommit pending | settled}. Events E = {deadline fires, raw
forward resolves, raw forward rejects, RELEASED rejection, local afterCommit,
shutdown, duplicate same-vector arrival, second distinct arrival}. Temporal T =
{before first await, during the raw await, just after settlement}.

Legend: **C1** = the reviewed TEST; **Dn** = dossier's proposed witness (5.3);
**Ex** = an existing registered witness (named); **--** = uncovered.
Class: **NM** = new mechanism (must be covered before land), **NS** = known
mechanism in a new shape (re-measure), **K** = unchanged, existing coverage.

| Cell (decision x input x event x time) | Covered by | Class | Note |
|---|---|---|---|
| reserve before capture, leader, queue occupied by real native slot, before first await (single, batch) | C1 cuts 1-2 (TEST:141-183) | NM | Symbol tripwire proves no deep read before ACC:113 |
| reserve before capture, free queue, invalid deep payload -> INVALID, size 0 | C1 cuts 1-2 control (TEST:166-171); Ex `message-group-cdc-input-guard.test.js:119-136` | K | guard test's `forward-handler` entry now also increments `calls.direct` (asserted only on `calls[entry]`, L129) |
| reserve, follower, queue occupied by an open forward with response pending, second distinct arrival -> BACKPRESSURE, no second forward | C1 cut 3 (TEST:245-290) | NM | |
| reserve, follower, occupied by raw-only entry (response retired), second distinct arrival -> BACKPRESSURE | C1 cut 4 `retry` (TEST:314,334) | NM | |
| reserve, duplicate same-vector arrival while the key is held (pending or raw-only) -> BACKPRESSURE at ACC:121 | -- | NS | same code path as `queue.has(key)` for direct callers; one cheap assertion in W-B or W-D closes it |
| capture after reservation, follower FORWARD branch (NDM:256 second capture of captured data) | C1 cuts 3-4 implicitly | K | redundant re-capture is allowed; not measured |
| ingress-decide inside owner only (receiver arm deleted), leader | C1 cuts 1-2, Ex `message-group-native-mixed-vector.test.js` | NS | |
| ingress-decide, follower with native leader observation -> FORWARD_NATIVE_LEADER | C1 cuts 3-4 | NS | |
| ingress-decide, follower cache-selected provisional (localIngress) -> provisional outcome, no forward | Ex `message-group-native-provisional-route.test.js:310-316,343-347` | NS | **highest-risk existing witness**: first hop now routes through `routeMessageGroupCommand` (retry handler); depth accounting unchanged, see 3(b) |
| ingress-decide, follower DEFER_STRICT_TARGET_UNKNOWN on a **public** receive -> repair + re-decide (O1) | -- | **NM** | new behaviour for public input; W-E required |
| ingress-decide, DEFER_NATIVE_TARGET_UNAVAILABLE (terminal at non-leader) -> UNKNOWN via ACC:207-208 after RCV:41-42 is deleted | -- | NS | the owner guard becomes the only guard; a one-line assertion in W-E or W-D |
| ingress-decide, relay depth exhausted (>= 2) -> UNKNOWN, no forward | Ex provisional-route (depth 2 terminal only) | NS | depth>2 is INVALID at NDM:82-85; depth==2 non-terminal -> NDM:259 UNKNOWN: not directly witnessed |
| local-propose charged via `ownOperation`, source expiry during raw, raw holds slot, closure releases once | Ex `message-group-native-custody-handoff.test.js:227-275` | K | |
| forward charged via `ownOperation`, deadline fires during raw await -> response UNKNOWN, entry stays, size 1, responsePending false, later closure -> size 0 | C1 cut 4 (TEST:292-343) | NM | |
| forward raw **resolves** with a committed receipt after the response was retired -> old answer unchanged | C1 cut 4 (TEST:335-336) | NM | |
| forward raw **resolves** with a non-committed answer (remote UNKNOWN/BACKPRESSURE/deferred failure) while response pending -> UNKNOWN+cause, no retry, release once | -- | NS | NDM:222-228/281 existing; custody is the new shape; W-C |
| forward raw **rejects** retryably while response pending -> retry charges a new raw only after the first closed; never two open | -- | **NM** | E-2 + RTG:190-195 + REP:339; W-C |
| forward raw rejects RELEASED in the microtask after a synchronous retirement -> race resolves to the completion, forward never invoked, size 0 | -- | **NM** | E-2 rejection arm; W-B |
| local afterCommit settles committed before the forward reply; raw still holds K; release once at reply | -- (R2b excludes by design) | **NM** | O5 / W-A |
| shutdown during open forward -> waiters UNKNOWN synchronously, raw-only entry survives `release` (PQ:258), closes at transport settlement | -- | **NM** | O6 / W-D |
| successor (reopen or replacement) same key while old raw open -> BACKPRESSURE; late old closure never removes successor entry | -- | **NM** | identity fencing PQ:139-140,145,155-156; W-D |
| grant expired before reservation (received duration <= 0, or parent lapsed) -> typed UNKNOWN, no reservation | Ex `cdc-delivery-budget`-level checks (BUD:18-22,43-46) | K | not re-asserted through the public receiver |
| PROPOSE per-attempt deadline fires while commit pending -> response UNKNOWN; retry dead | -- | K (pre-existing) | finding F-S11, not C1 scope |
| E-4 dead arm: durable `forwardDurableCdcPayload` without `applyProvisionalIngress` -> typed refusal, never a nested reservation | -- | **NM** | W-G |
| RC-4 hook pairing refusal | -- | **NM** | W-H |

Coverage summary: the C1 test covers the four cuts it names (two capture-order
cells, one occupied-follower cell, one expiry-vs-raw cell) and nothing else.
Seven NM cells are uncovered and must be witnessed before landing; four NS
cells need re-measurement of existing witnesses; two K cells are
pre-existing and recorded as findings.

---

## 3. Attack results

### 3(a) The race on key K: waiter timer vs forward closure, line by line

ProposalQueue state per entry: `pendingCommits[K]` (the entry object) and
`proposals[K] = {state, responsePending, rawOperation}` (PQ:116-118).

- `ownOperation(K, op)` (PQ:131-151): throws RELEASED synchronously unless
  `pending && custody.responsePending` (PQ:134-136); returns the open raw if
  one exists (PQ:137, join); otherwise schedules `op` in a microtask that
  re-checks `responsePending` and both identities (PQ:139-140) and attaches
  `closed` to both settlements (PQ:149). `closed` is identity-fenced on
  `custody.rawOperation === raw` (PQ:145), nulls it, calls
  `removeClosedEntry`.
- `removeClosedEntry` (PQ:154-161) removes iff `!responsePending &&
  rawOperation === null && both identities match`.
- `takeResponse(K)` (PQ:164-174): returns null unless pending and
  responsePending; flips responsePending, clears the timer, calls
  `removeClosedEntry`. `resolve`/`reject`/`releaseEntry` all go through it
  (PQ:200-229, 256-269); `releaseEntry` skips raw-only entries (PQ:258).

E-2 as sketched (dossier 5.1): `if (!currentWait) return wait.completion;
raw = ownOperation(K, forward); parent.context?.ownChild(raw); answered =
raw.then(undefined, e => currentWait ? reject(e) : wait.completion); return
race([answered, wait.completion])`.

| Schedule | Result | Leak / double release / successor / deadlock |
|---|---|---|
| Timer first (TEST cut 4) | `resolve(K, UNKNOWN)` -> `takeResponse` flips responsePending, removal skipped (raw open) -> completion resolves UNKNOWN (entry.resolve, ACC:126) -> race resolves. Raw later settles -> `closed` -> removal (responsePending already false). | none; exactly one removal |
| Raw first | `closed` -> removal skipped (response pending); race resolves with the remote answer; ACC:226 validates; `applyDurableCdcBatch` finally (ACC:268-270) retires the response -> `takeResponse` -> removal. | none; exactly one removal |
| Both in the same tick | `takeResponse` and `closed` each call `removeClosedEntry`; only the second call satisfies both predicates. | none |
| Microtask interleave (retired between `ownOperation` return and PQ:138 body) | body throws RELEASED (PQ:139-140); `closed` runs first (attached at PQ:149 before E-2's handler) -> rawOperation null -> removal (response already retired); then E-2's arm sees `!currentWait` -> returns `wait.completion` (already resolved: `takeResponse` runs synchronously inside the same `resolve`/`reject` call that settled the completion, PQ:200-208, ACC:126-127). No forward call happened. | none; **requires the arm** (without it the race rejects RELEASED, a retryable-by-default error at RTG:229, and the retry handler would run `onRetry` -> `assertCurrent` throws -> the caller gets an untyped error) |
| Local afterCommit first | ACC:284-289 settles committed if `liveWait`; race resolves committed; `inputCdcOutcome` rebinds I digest; raw holds K until the reply; `closed` -> removal. | none (W-A to witness) |
| Shutdown during raw | `retireCdcCommitWaiters` -> `release` -> `releaseEntry` -> `reject(K, released)` -> `takeResponse` -> entry stays (raw open) -> `entry.reject` -> completion resolves `error.answer` = UNKNOWN (ACC:127, ACC:293) synchronously. Raw: `forwardDurableCdcPayload` continues; its next `options.assertCurrent()` (ACC:203 -> `liveWait` -> `service.isShutdown`) throws, or the transport settles; raw rejects -> `closed` -> removal. | none; bounded by the transport lifetime (3(g)) |
| Cross-mode join (FORWARD attempt while a PROPOSE raw is open, or vice versa) | PQ:137 returns the open raw; E-2 races it. A PROPOSE raw awaits `wait.completion` (ACC:164), so a joined FORWARD never forwards until that completion settles. | no overlapping effect; liveness only (deliberate per `REVIEW-mg-delivery-native-custody-r1-r6:72-75`; must be stated to the implementer) |
| `wait.completion` never settles | impossible while the waiter's clock advances: armed at ACC:134 to the original budget, re-armed only by PROPOSE attempts (ACC:160-161) and restored on PROPOSE error (ACC:167); E-2 must not re-arm (dossier E-2, correct). | the only deadlock would be a nested `ownOperation` around the whole delivery (PQ:137 returns the outer's own promise) -- excluded by the lead's rule |

Can E-2 **leak a slot**? Only if the raw never settles. The raw is
`forwardCDCCommandToLeader -> forwardDurableCdcPayload`; every await inside it
is `transport.deliver` (NDM:187) or `maybeRepairAuthoritativeForwardTopology`
(NDM:162), both bounded (3(c), 3(g)). Verdict: no leak.

Can E-2 **double-release**? No: `removeClosedEntry` is the single deleter and
is guarded by three predicates; `takeResponse` is idempotent (PQ:167).

Can E-2 **settle a successor's waiter**? No: it only ever returns its own
`wait.completion`; `currentWait` compares the entry object (ACC:45-48);
`closed`/`removeClosedEntry` compare `pending` and `custody` objects
(PQ:139-140,145,155-156); afterCommit compares `entry.lifetime` and the entry
object (ACC:279,285).

Residual observation on E-2's sketch (recommended, not required): `ownChild`
runs `assertCurrent()` (cdc-delivery-invocation.js:212-215) and can throw
*after* `ownOperation` has scheduled the raw. The raw then runs un-owned by
the parent, but self-fences: `createCdcDeliveryBudget` at NDM:252 calls the
parent's `assertCurrent` (BUD:30,58-61) before any transport call and throws,
so the raw rejects and closes without effect. Preferable: check
`parent.context?.assertCurrent()` before `ownOperation` (the pattern LIFE uses
at 181-190, "acquire raw cleanup custody before starting"). The same ordering
exists today at ACC:146-151 for PROPOSE.

### 3(b) `applyCDCBatch` routing vs `message-group-native-provisional-route.test.js`

Relay depth accounting is unchanged: `forwardedCdcRelayDepth` returns
`options.relayDepth` for durable commands (REP:23-28); `forwardCDCBatchToLeader`
passes it (REP:399-406); `deliverDurableCdcForwardTarget` sends
`options.relayDepth + 1` (NDM:182-184). Today's receiver path (RCV:45 ->
`forwardCDCBatchToLeader(events, {...context})`) and the owner path both arrive
at NDM:183 with the same `relayDepth`. The test's `assertActualIngress(FIRST_HOP, 0)`,
`(FOLLOWER, 1)`, `(LEADER, 2)` and `relayDepth === 2` (test:311-313,344-346,376-379)
therefore hold by construction.

What changes (new shape, legitimate, must be re-measured):
1. The first hop's forward now runs under `commandRetryHandler.executeWithRetry`
   (REP:333-360, RTG:211-242): up to `retryMaxAttempts` (default 3,
   `constants.js:103`) attempts, but only on **thrown** errors with
   `retryable !== false` (RTG:229); a resolved non-success answer returns
   `{success: true, answer}` (RTG:222) and is accepted by the retry handler
   (message-retry-handler.js:284) -- no retry. The FOLLOWER's provisional
   answer is accepted at NDM:222 (`successfulForward`, non-terminal) and
   validated at ACC:226-227. So the recorded ordinals change only if a
   transport error is *thrown* on the first hop, which the fixture does not do.
2. `assertMessageGroupCommandAdmitted` (REP:323, RTG:212) now gates public
   forwarded input on the follower; it already gated the same command on the
   leader via RCV:43 -> ACC -> REP:320, so no new refusal class.
3. `onRetry` (REP:343-345) throws when `retryDelayMs >= remainingMs()`;
   with `retryInitialDelayMs` default 100 and a 5 s grant this is inert here.

Verdict: a legitimate behaviour change, not a regression; the dossier's
"highest-risk existing witness" classification is right because the witness
asserts exact ordinals, and ordinals are the only thing a retry could move.

### 3(c) O1 repair-and-re-decide on a public receive: bounded?

- The repair is `maybeRepairAuthoritativeForwardTopology` (FDM:62-119):
  single-flight (`forwardTopologyRepairInFlight`, FDM:68-70), cooldown-gated
  (FDM:72-78; defaults 1000/2000/5000 ms, runtime-support.js:84-90), and its
  read is bounded by `queryTimeoutMs = min(forwardTopologyRepairQueryTimeoutMs
  (1500), remainingMs())` (forwarding-owner-constants.js:178-191; the
  `remainingMs` function passed at NDM:163 is ACC's, which also runs
  `assertCurrent`). It is a control-plane *read* (`gateway.executeRead`,
  FDM:138-139), not a CDC forward, so **no follower<->leader recursion** is
  possible through it.
- A public receive that joins an in-flight repair waits for the other caller's
  read (bounded by that caller's grant <= 5 s); its own `assertCurrent` at
  NDM:164 fences the result.
- Relay depth: `readCdcForwardContext` refuses depth > 2 as INVALID (NDM:82-85);
  `forwardDurableCdcPayload` returns UNKNOWN at depth >= 2 before any forward
  (NDM:258-259); `resolveNativeCdcIngressDecision` returns DEFER at depth >= 2
  (FRM:150-152); terminal NATIVE_COMMIT never forwards (NDM:258, ACC:207-208).
  Maximum chain: depth 0 -> 1 -> 2, three handlers.
- Amplification: worst case `retryMaxAttempts^2` terminal requests from one
  source occurrence within one 5 s grant, only under repeated *thrown*
  retryable transport failures; duplicates at the leader are refused by
  `queue.has(key)` (ACC:121) while the first is pending. Each hop re-stamps a
  strictly smaller duration (NDM:191-194, BUD:24-26), so budget is never
  violated.

Verdict: bounded. O1 is approved. Note the dossier's wording for O1 changes
*public* behaviour (today RCV:39 returns UNKNOWN with no repair); W-E is the
controlled negative that proves the public path now reaches the repair.

### 3(d) E-1 and F1 (clock domains, decreasing duration)

- Receiver grant: `createCdcDeliveryBudget(service, {...localDelivery,
  receivedRemainingMs}, startedAtMs)` (RCV:16-17, BUD:36-62) on
  `service.timeSource`, started at handler entry (RCV:55/199). E-1 keeps it.
- ACC budget: `captureCdcParentGrant` takes `min(deliveryTimeoutMs,
  context.remainingMs(), options.remainingMs())` (ACC:235-237) where
  `options.remainingMs` is the receiver grant; its clock is
  `queue.timeSource` = `service.timeSource` (ACC:115-116, state.js:142). Same
  domain, non-increasing.
- Forward budget: `createCdcDeliveryBudget(service, incomingOptions)` at
  NDM:252 with parent = ACC's `remainingMs`/`assertCurrent` (BUD:42,46,54);
  transport gets `timeoutMs: options.remainingMs()` and `remainingMs` as a
  parent limit (NDM:189; LIFE:34-43,101-114 shortens, never renews); the wire
  carries only `cdcDeliveryRemainingMs` (NDM:191-194, BUD:24-26).
- `copyStrictOwnDataRecord` keeps function-valued options (data descriptors,
  strict-own-data.js:61-88), so `assertCurrent`/`remainingMs`/`proposeCommand`
  survive `captureCdcForwardRecord` (NDM:36-49) -- confirmed by the existing
  RF3 follower-forward witness passing through this path.

Verdict: E-1 preserves F1 exactly; it removes a deep copy, not a clock.

### 3(e) Shutdown / replacement and exact-entry fencing

Traced in 3(a) "Shutdown during raw". Additionally: `retireCdcCommitWaiters`
runs at `shutdown()` (cache-and-lifecycle:152), at port open
(consensus-port.js:150) and at close (:213); `cdcCommitLifetime` is a fresh
frozen object per port open (:155) and `null` after close (:214);
`liveWait` compares `service.raft === entry.port` and
`service.cdcCommitLifetime === entry.lifetime` (ACC:64-66);
`registerCdcCommittedAcceptance` ignores entries of another lifetime (ACC:279).
A reopened service reuses the same `cdcCommitWaiters` object (constructor,
state.js:142), so an old raw-only entry can still occupy a slot and refuse a
successor's same-key admission with BACKPRESSURE until the old transport
settles; that is the contract's intended retaining behaviour
(CONTRACT "Residual F2" para. "All F1/F2 cleanup rules still apply").

O6 as decided is exactly what the code does: no await on open raws at
shutdown; `release` settles pending responses only (PQ:258 skips raw-only).

Verdict: no late reply can settle a successor's waiter or release a
successor's slot. W-D required to pin it.

### 3(f) Local fallbacks, compatibility paths, second grammars

| Item | Finding |
|---|---|
| E-1 receiver assert on rejection | second expiry decision -> **RC-3** (drop) |
| O4 "from the owner's captured vector" | not available for refusals; R08 change implied -> **RC-2** |
| REP:339 `options.forwardCommand ? ... : forwardCDCCommandToLeader(...)` | charged/uncharged selected by option presence -> **RC-4** (pair + refuse) |
| E-3 "return await wait.completion" | correct state naming (R07) but can leak a committed N-digest receipt past expiry -> **RC-1** |
| E-4 deletion of the bare `applyCDCBatch` arm (NDM:153-155) | correct R11 deletion; makes `applyProvisionalIngress` required for durable |
| Ingress predicate evaluated at ACC:206, NDM:260, NDM:264, NDM:150 | one owner *path*, several *evaluations* with fresh observation (F3 requires recheck before dispatch). Not a second grammar; the lead's "the owner is the one decision path" must be worded "one owner path; the predicate is re-evaluated at NDM:260/264/150 with fresh observation" |
| Receiver reply decoration | wrapper metadata only (OUT:110-131); cannot override the semantic core (exact-key validation OUT:166-169). Fine under RC-2(a) |

### 3(g) O7: is cut 4 provable without a transport change?

**In the test:** yes. The hold sits in the test's `router.deliver` wrapper
*after* the real `deliver` resolves (TEST:215-225), so the forward raw is the
wrapper's promise; the real transport lifetime has already settled and
disposed. No transport change is needed.

**In production:** `transport.deliver` always settles. `withDeliveryLifetime`
(LIFE:218-232) -> `runDeliveryOperation` (LIFE:181-216): the public `result`
rejects on `lifetime.signal` abort (LIFE:192-193); the timer armed on the
router clock (LIFE:82-93,162) calls `remaining()` which throws `spent()` at
zero (LIFE:103-107,117-118) and `refuse` aborts (LIFE:72-77,120-123); parent
limits (`remainingMs`, `deliveryContext`) shorten it (LIFE:34-43,101-114);
router shutdown aborts it (LIFE:151-154); `deliver`'s `onRetired` turns a
timeout/shutdown into a *resolved* deferred failure (BEH:192-202). The pending
response registry aborts on the same signal
(message-router-pending-response-ledger.js:383-389). So the raw settles within
the grant whenever the router clock advances; NDM:197's `assertCurrent` then
rejects the raw if the grant is spent, else NDM:222/226-228 classify the
deferred failure as non-success (resolved UNKNOWN+cause).

**Harness limit (R19, not a design defect):** FIX's router has no
`timeSource` (FIX:67-68) and runs on the **host** clock
(message-router.js:264 `resolveTimeSource`), while the three replicas run on
`VirtualTimeSource`s (FIX:103). In cut 4 the 100 ms received grant becomes
`timeoutMs: 100` on the host clock for the forward (NDM:189 -> LIFE:54-56,162),
and the local delivery to the leader (`deliverLocal`, BEH:29-75 via
pressure-routing.js:358-359) must return the committed receipt within 100 ms
of **wall time** (RF3 commit driven by `pump`, FIX:37-59). If it does not,
`deliver` resolves a deferred failure, the wrapper holds *that*, and
`assertHeldNativeAnswer` fails (TEST:230-243) -- a setup red (non-proof), never
a false green. On a slow runner (memory: GCP 2.4x) this is a flake source.
Recommend the fixture give the router a dedicated `VirtualTimeSource` that the
tests never advance; the fixture is shared by three tests
(`native-custody-handoff`, `cdc-input-guard`, TEST), so that is a separate
test-only change with its own re-measurement.

---

## 4. Findings by category

Each finding: location, classification (NM / NS / K), disposition.

### Admission / gating
- A1 (NM, covered C1 cuts 1-3): deep capture before reservation at RCV:18 and
  the uncharged public forward at RCV:45 -> NDM:247-256. Confirmed. E-1 fixes
  both; ACC:113 becomes the first state change. Precheck = enforcement (same
  queue), transient classification = BACKPRESSURE with `retryAfterMs`
  (ACC:40-43), budget = the existing receiver grant (no new budget).
- A2 (NS): after E-1 the refusals the input-guard test observes through the
  `forward-handler` entry move from RCV:18 to ACC:118 and are still released
  in the `finally` at ACC:137-139; `calls.direct` now increments for that
  entry (test asserts only `calls[entry]`, L129). Re-measure.
- A3 (K, pre-admission reads, O3): `copyStrictOwnDataRecord` (top-level own
  data descriptors only), `hasDurableCdcEvents` (dense check + per-member
  `objectHasOwn`, no accessor invocation, OUT:172-191;
  canonical-json-data.js:160-174 is shallow), `readCdcForwardContext`, grant
  creation. None allocates a deep copy. O3 approved; define "capture" in the
  ACC/envelope comments as the frozen application copy
  (`cdc-event-envelope.js:101-102` already says so).

### Concurrency / serialization
- C1 (NM, covered C1 cut 4 for timer-first; W-A/W-B for the other schedules):
  E-2 race, traced in 3(a). Sound.
- C2 (NS, deliberate): cross-mode join via PQ:137 means a FORWARD attempt
  after a PROPOSE per-attempt rejection joins the open PROPOSE raw and does
  not forward. State it in the implementer brief.
- C3 (recommended): acquire parent custody before scheduling the raw (3(a)
  residual).

### Retry loops
- R1 (K, **pre-existing finding F-S11, record for the ACC/RTG owner, not C1
  scope**): `runCdcProposal` re-arms the waiter to the per-attempt budget
  (ACC:158-161) and `liveWait` reads `entry.budget` (ACC:66). When a PROPOSE
  attempt's `withinProposalDeadline` expires (RTG:143-149, armed first at
  RTG:150) the waiter's own timer fires at the same instant and retires the
  response UNKNOWN (ACC:72-75); the retry handler's `onRetry` (REP:343-345,
  called outside any try at message-retry-handler.js:261-266) then runs
  `assertCurrent` against the spent per-attempt budget and throws, aborting
  routing. Net: PROPOSE retries are dead for commit-wait timeouts; the
  effective attempt count is 1 (`computeCdcProposeTimeoutMs(3)` = 1500 ms,
  REP:467-486). This contradicts CONTRACT item 3 "Keep existing retry
  counts" and is retry-loops template item 1 ("registered-but-dead retry").
  Introduced by 681da1dc1. The C1 design must not rely on PROPOSE retries;
  E-2's "do not re-arm for FORWARD" is correct and keeps the forward on the
  original budget.
- R2 (NS): FORWARD retries occur only on thrown retryable errors; a resolved
  deferred failure ends the attempt (RTG:222, retry-handler:284). Bounded by
  `onRetry`'s `retryDelayMs >= remainingMs()` throw (REP:345). W-C.

### Transport / delivery
- T1 (K, answered O7): raw settlement guaranteed by LIFE (3(g)).
- T2 (K): "ACK is not processed" -- the forward's acceptance uses
  `isCommittedCdcDelivery` (NDM:132-135 -> OUT:336-339), which requires both
  the transport DELIVERED classification and the exact committed outcome.
  Unchanged by C1.
- T3 (harness, R19): host-clock transport lifetime in FIX (3(g)).
- T4 (K, recorded S8/S10): inbound `JSON.parse` before admission is the
  transport owner's wire-domain finding (CONTRACT "Residual F2").

### Owner interaction
- O-1 (NM): single semantic owner for the durable ingress decision becomes
  ACC/NDM (receiver arm deleted). Predicate re-evaluation sites remain
  ACC:206, NDM:260, NDM:264, NDM:150 (wording correction in 3(f)).
- O-2 (RC-5): registry alignment; the C1 test is in neither list.
- O-3 (NM, W-E): O1 changes public DEFER semantics from immediate UNKNOWN
  (RCV:39) to bounded repair + re-decide. Controlled negative required.
- O-4 (RC-2): reply decoration source.
- O-5 (RC-4): hook pairing.

### Recorded, not absorbed (O8, R17)
- S5 partition write commit deadline vs parked handoff
  (`partition-service-cdc-stream-base.js:328-337`,
  `partition-service-raft-write-commit.js:262-266`) -- partition owner;
  defect status unknown.
- S6 generic MESSAGE/ACK `withinProposalDeadline` without custody
  (RTG:135-161,183-184) -- MG routing owner; contract keeps the append
  contract.
- S7 non-durable receiver branches without any queue (RCV:62-190,206-305) --
  R12 pressure path unknown.
- S8 transport inbound decode before admission -- already the wire-domain
  finding.
- F-S11 (R1 above) -- ACC/RTG owner.

---

## 5. Additional witnesses required

Each: the production seam it cuts, and the mutation that must make it red.
All are component witnesses on the real `MessageGroupService`,
`ProposalQueue`, native port and router (no stubbed queue results), following
TEST's conventions.

| ID | Witness | Seam cut | Mutation that must fail it |
|---|---|---|---|
| W-A (O5) | Follower public receive forwards; leader commits; **follower's replication is not held**, so the follower's own afterCommit (ACC:284-289) settles committed before the held forward reply; assert the caller answer is committed with the I digest (`inputCdcOutcome`), `queue.size === 1` and `isResponsePending === false` while the reply is held, `size === 0` after release; the late reply does not change the answer. | ACC:284-289, E-2 race, PQ:154-161 | remove `rawOperation !== null` from `removeClosedEntry` (PQ:155) -> size 0 while the reply is held -> a second admission succeeds -> red |
| W-B | `forwardCdcWithinWait` with a forward callback that records invocation; after it returns and before yielding, `queue.resolve(K, unknown)` synchronously; assert: callback never invoked, returned promise resolves to the UNKNOWN completion (not RELEASED), `size === 0` after microtasks, no transport call. Also assert a duplicate same-vector `applyCDCBatch` while K is raw-only returns BACKPRESSURE. | PQ:138-141, E-2 rejection arm, ACC:121 | delete the rejection arm -> promise rejects RELEASED -> red |
| W-C | Follower forward whose transport `deliver` (a) resolves a deferred failure (`buildDeferredDeliveryFailure`) and (b) throws a retryable error once then succeeds; assert (a) UNKNOWN+cause, no retry, one raw, size 0 after; (b) exactly one raw open at any time, second attempt charged only after the first `closed`, final committed, size 0. | NDM:222-233, RTG:190-195, REP:339, PQ:137 | call `forwardCDCCommandToLeader` directly at REP:339 (bypass `forwardCommand`) -> at the deadline `size` drops to 0 while the forward is open -> red |
| W-D (O6/e) | Hold the forward reply; `service.shutdown()`; assert the public caller settles UNKNOWN synchronously (before release), `size === 1`, `isResponsePending(K) === false`; release -> `size === 0`. Variant: reopen the port (same service object) or construct a replacement service with the same key while the old raw is held -> BACKPRESSURE; after release the successor's admission commits; the old closure never deletes the successor's entry (compare entry objects). | ACC:292-294, PQ:239-269, PQ:139-140,145,155-156, consensus-port.js:150-155 | make `release` delete raw-only entries -> size 0 before release -> red; or remove the `pending`/`custody` identity checks at PQ:155-156 -> successor entry deleted -> red |
| W-E (O1) | Public receive at a follower with no native leader observation and empty cache targets (DEFER_STRICT_TARGET_UNKNOWN, FWO:390-403); wrap `maybeRepairAuthoritativeForwardTopology` to count calls (real method); assert exactly one repair read bounded by `queryTimeoutMs <= remainingMs()`, re-decision, answer UNKNOWN or provisional, zero `transport.deliver` application calls when no target, `size === 0` after, relay depth unchanged; a second concurrent public receive joins the in-flight repair (count stays 1). Also assert a NATIVE_COMMIT receive at a non-leader returns UNKNOWN with no forward and no repair (ACC:207-208, NDM:258). | NDM:260-265, FDM:62-119, ACC:207 | restore the receiver's immediate-UNKNOWN DEFER arm (RCV:39) -> repair count 0 -> red |
| W-F (re-measure) | `message-group-native-provisional-route.test.js`, `message-group-native-mixed-vector.test.js`, `message-group-cdc-input-guard.test.js`, `message-group-native-custody-handoff.test.js`, `test/partition/proposal-queue*.test.js`, `test/transport/message-router-cdc-custody.test.js` unchanged. | 3(b) | n/a (existing registered witnesses) |
| W-G (E-4) | Durable `forwardDurableCdcPayload` reached with `applyProvisionalIngress` absent -> typed INVALID before any reservation or forward. | NDM:145-158 after deletion | restore the bare `applyCDCBatch` arm -> nested same-key reservation -> the caller's own vector answers BACKPRESSURE instead of INVALID/provisional -> red |
| W-H (RC-4) | `proposeCDCCommand(command, {proposeCommand})` without `forwardCommand` (and the converse) -> typed INVALID before `routeMessageGroupCommand`; `proposeCDCCommand(command)` with neither still routes (non-durable). | REP:320-340 | remove the guard -> the follower forward runs uncharged -> red in W-C's mutation sense |

Measurement order (per the handovers): freeze the C1 test and these witnesses,
regenerate canonical metadata, measure the predecessor red on unchanged
production, then implement E-1..E-4 with RC-1..RC-4 and measure green, then
W-F.

---

## 6. Explicit limits and unknowns

- Nothing here was executed; all schedules are source traces. The predicted
  predecessor failure mechanisms in dossier 5.4 are plausible from source and
  remain predictions until measured (handover order step 4).
- Unknown: whether the host-clock transport lifetime in FIX (3(g)) makes cut 4
  flaky on the lab runners; it cannot produce a false green.
- Unknown: whether S5 is a defect (partition owner).
- Unknown: the effect of F-S11 (dead PROPOSE retries) on the W7/W9 lab
  witnesses; it is outside C1 and recorded for its owner.
- Not reviewed: C2 (transport normalization), the source-side F2 progress
  cell, classification, activation, two-start acceptance. This vet does not
  authorize landing; it authorizes implementation of the design with RC-1..RC-6
  and the measured red first.
- Sealed bar: the quest declares `verificationTemplates` including
  admission-gating, retry-loops, transport-delivery, concurrency-serialization
  (quest.json); the findings above are grouped to those categories plus
  owner-interaction. Categories outside the bar (harness fidelity T3) are
  reported once as out-of-bar.

Reviewer: independent design vet (fable subagent), 2026-10-24. Wrote only this
file.
