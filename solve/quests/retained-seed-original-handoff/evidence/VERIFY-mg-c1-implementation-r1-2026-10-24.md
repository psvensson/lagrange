---
audience: development
documentClass: evidence
---

# VERIFY C1 implementation r1: public CDC receiver admission and forward custody

Independent verifier (fable subagent), 2026-10-24. Quest `retained-seed-original-handoff`,
epic `raft-rs-full-cutover`. I did not write the change. Nothing under
`/mnt/data/peter/projects/lagrange` or the subject worktree was edited; this is the only file written.
Every `file:line` below is in the STAGED tree (= snapshot `refs/wip/lab-c1-2`) unless marked `base`.

Abbreviations: RCV = `src/message-group/message-group-service-cdc-propagation-runtime-methods.js`,
ACC = `src/message-group/message-group-cdc-committed-acceptance.js`,
REP = `src/message-group/message-group-service-cdc-replication-runtime-methods.js`,
NDM = `src/message-group/message-group-forwarding-owner-native-delivery-methods.js`,
PQ = `src/partition/proposal-queue.js`, BUD = `src/cdc/cdc-delivery-budget.js`,
OUT = `src/cdc/cdc-delivery-outcome.js`, RTG = `src/message-group/message-group-proposal-routing.js`,
LIFE = `src/transport/message-router-delivery-lifetime.js`, FDM = `message-group-forwarding-owner-delivery-methods.js`,
INV = `src/cdc/cdc-delivery-invocation.js`, TEST = `test/message-group/message-group-cdc-receiver-admission.test.js`.

---

## 0. Verdict: APPROVE WITH REQUIRED CHANGES

The four staged production files are correct against the sealed contract, the dossier edits
E-1/E-2/E-4, the lead decisions O1-O9 (with RC-2 superseding O4) and the design vet's RC-1, RC-3,
RC-4, RC-5. No production-source change is required. The frozen claim holds on every public durable
branch; the custody trace shows exactly-once release with no leak, no successor settlement and no
deadlock; the dropped W-B rejection arm is unreachable for the reason the implementer gives (section
3.2). The 4 reviewed test case bodies are unchanged; the 10 new witnesses cut real owners; the C1 file
is 14/14 green in three local runs; both implementer mutations reproduce exactly; three of my four
extra mutations go red where the vet's model predicts, and the fourth exposes the one coverage gap.

Required before the commit is accepted as reviewed scope:

| # | Required change | Why |
|---|---|---|
| RC-V1 | **Add a witness for the RC-1 committed-but-retired branch (ACC:282-284).** Mutation MV3 (return the settled committed receipt regardless of `liveWait`) leaves the C1 file 14/14 GREEN, so this new owner branch has zero coverage. The exact witness is in section 3.3; I built and ran it: green at the snapshot, red under MV3 (`RC1_RETIRED_PARENT_NEVER_SUCCESS: true !== false`), red under M3 (untyped `Raft CDC replication failed: cdc_committed_acceptance_unknown` throw), red on base sources (caller never settles). Add it to TEST (following its conventions) or as its own registered file in the same contract lists. | vet RC-1 / coverage model: NM cell with no witness; CONTRACT F1 "a late valid receipt is not success for an expired source invocation" |
| RC-V2 | **Build W-E (public `DEFER_STRICT_TARGET_UNKNOWN` repair-and-re-decide controlled negative) before `land`** (may be a follow-up commit in this Quest). Case 10 covers DEFER typing via the exhausted-relay guard (NDM:262-263) and the terminal-at-follower guard (ACC:227-228); it never reaches NDM:265-269. No test in the tree exercises NDM:265-269 with durable input from ANY entry point (grep: the six tests naming the repair/DEFER symbols all use non-durable events), and O1 made this the public path's behaviour. Spec in section 3.4. | vet W-E (NM); lead O1 changed public behaviour |
| RC-V3 | **Correct two claims in the attempt record.** (a) "4 reviewed cases byte-identical": the four case BODIES are identical (zero hunks over TEST:146-348 vs base 141-343) but the file prefix is not: four import additions (TEST:16-23) and the shared `receive` helper gained a `wrapper = {}` parameter (TEST:62-63, 68). (b) "107 reds identical at base": 106 of the 107 are red at both base and change with identical failing leaves (checked by me over the implementer's own TAPs, section 3.8); the 107th, `test/topology/cdc-group-propagation-foreground-boundary.test.js`, is GREEN locally at base and change and red only on the lab host (`test timed out after 2000ms` at test:212 in both lab runs). It is a fixed-budget timing red in a stub-router test that does not reach the MG receiver, not shown "identical at base" by any run. | evidence accuracy |

Recommended, not required: (i) check `wait.entry.parent.context?.assertCurrent()` before
`ownOperation` in `forwardCdcWithinWait` (vet C3; today mirrors PROPOSE ordering, self-fences at
NDM:256 -> BUD:30/61); (ii) pin the microtask-ordering claim with a `logger.error` spy in case 7
asserting the wrapped detail never contains `PROPOSAL_QUEUE_RELEASED_CODE` (section 3.2 explains why
no other observable distinguishes the two arms); (iii) give the custody fixture's router a
`VirtualTimeSource` (vet T3; separate test-only change).

---

## 1. Identity

- Subject worktree `/mnt/data/peter/projects/.worktrees/mg-c1-receiver-admission-20261024`, branch
  `work/mg-c1-receiver-admission-20261024`, HEAD `bed8c6354737df06e8e57a0c5753d3b88f1e5e5f`, index-only
  change (`git diff --stat` empty, no untracked files). `git write-tree` = `18aadc3d795fd6879f56587b59dd96be2ec74351`
  = `refs/wip/lab-c1-2^{tree}`; the ref is commit `26fc0a1357cf441eb22bfcfe24256bf53f65b258`.
- Snapshot/staged equality confirmed per file with `cmp` for the 4 src files, TEST and
  `impact-contracts.json`; `git diff --stat bed8c6354` in the snapshot worktree equals the staged stat
  (10 files, +740/-62).
- Staged blobs: ACC `4ddd5b757`, NDM `7114c11b9`, RCV `d0afccb96`, REP `2926671b8`, TEST `a733d8d13`,
  impact-contracts `db8980998`. SHA256: TEST `a866fc5e6159bd3700a6de0c1249b29a74907ec3fb4e17f98df046c88cf81801`,
  ACC `e57910ff3bd7...658df`, RCV `30fa8244406f...4b3f2`, REP `6a5c2ac98428...4a121`, NDM `d69598b68a38...3eb9`.
- Reviewed predecessor test at `947107b63` has SHA256 `697d8f40301fc87ad410b22ddb3464244b44b027b70d15c73debd2861fdc6072`
  = the R2b-approved hash; fixture `message-group-native-custody-fixture.js` unchanged in the staged
  tree, SHA256 `2806d398...` = R2b's.
- Authority read in full: CONTRACT (recipient completion mechanism, F1-F4, Residual F2), the dossier
  (scratchpad copy; the `evidence/DOSSIER-mg-c1-...` path named in the brief does not exist in the
  subject worktree), the design vet (scratchpad copy; same), the lead decisions (quest log finding
  `2026-10-24T07:35:28Z` and the owner-decision entry `07:57:11Z`, read from the sibling worktree
  `mg-delivery-resume-r2-20261023` because the subject worktree's log ends at `06:45Z`), R2b review,
  the six verification templates, and the owners PQ, BUD, OUT, RTG, LIFE, INV.

---

## 2. Frozen behavioural claim (my own statement, verified)

For every public durable CDC input entering `receiveMessage` (single or batch, leader or follower,
any `relayDepth`, with or without `cdcForwardMode`), the first state change on the receiving replica
is `queue.enqueue(reservation, {})` at ACC:118 on `service.cdcCommitWaiters`. Before it only these
reads happen, all shallow: `copyStrictOwnDataRecord` of the wrapper (NDM:36-49 ->
`strict-own-data.js:61-88`, top-level own data descriptors, `descriptor.value` only, proxies and
accessors refused), the per-member `objectHasOwn(event, eventKey)` scan plus dense check
(OUT:172-191, `canonical-json-data.js:160-177`), `readCdcForwardContext` (NDM:76-92), the receiver
grant (RCV:16-17 -> BUD:36-63) and `applyCDCBatch`'s option copy and terminal check (REP:173-175 ->
NDM:100-107). Deep capture (`captureCdcEvents`, `cdc-event-envelope.js:132-148`) first runs at
ACC:123-124; the ingress decision first runs at ACC:226 (and again, fresh, at NDM:264/268/150). A
refusal (capacity ACC:118 -> PQ:110-115, duplicate key ACC:126, invalid capture ACC:123, dead
lifetime ACC:134) leaves `size` unchanged (ACC:142-144) and causes zero proposals, applications or
forwards. Every raw effect is charged once per route attempt through `ownOperation` (PROPOSE
ACC:151, FORWARD ACC:167), never nested; the caller's response is raced against the forward raw
(ACC:172) and settles at the waiter's own deadline (ACC:73-77), at shutdown (ACC:330-332 ->
PQ:239-269) or at local afterCommit (ACC:322-327) with an answer typed by the acceptance owner
(ACC:273-285, 302-304); response retirement never removes an entry with an open raw and raw closure
never removes an entry whose response is pending (PQ:154-161), so the slot is released exactly once
at the later of the two. Out of claim: non-durable CDC (RCV:46-174, 190-290), the partition write
queue, generic MESSAGE/ACK routing, transport decode, the remote leader's queue, source ACK.

Verified per branch (staged lines):

| Branch | Pre-reservation reads | Reservation | First deep capture / decision | Verdict |
|---|---|---|---|---|
| single, leader | RCV:40 (`captureCdcForwardRequest`), RCV:16-17, REP:173-175 | ACC:118 | ACC:123 / ACC:226 | holds |
| batch, leader | same + O(n) shallow member scan OUT:182-190 | ACC:118 | ACC:123 / ACC:226 | holds |
| follower forward | same | ACC:118 | ACC:123; decision ACC:226 then NDM:264 (fresh) | holds; forward raw charged ACC:167 |
| provisional / local-ingress | same | ACC:118 | ACC:123; ACC:229-232 | holds |
| DEFER (exhausted relay, native target unavailable, strict target unknown) | same | ACC:118 | ACC:123; ACC:227-228 or NDM:262-269 | holds; decided inside the owners only |
| terminal NATIVE_COMMIT at non-leader | same | ACC:118 | ACC:227-228 -> UNKNOWN, no forward | holds (case 10) |

Reply decoration (RCV:23-29) reads `payload.tableName/operation` and `incoming.length` from the
shallow frozen wrapper and the dense array already classified at NDM:112; it never traverses `data`
and cannot override the semantic core (OUT:110-131, exact-key validation OUT:166-169). The deleted
receiver arms (base RCV:18 capture, RCV:22-23 decision, RCV:36-46 DEFER/APPLY_LOCAL/FORWARD switch)
are gone; `assertCdcTerminalEvents` is now evaluated once at REP:174.

---

## 3. Findings and answers to the nine questions

### 3.1 Frozen claim (Q1): HOLDS. See section 2. Additional check: `hasDurableCdcEvents` on
`[payload]` for the single case wraps the frozen null-prototype copy; `isRecord` accepts a null
prototype (`canonical-json-data.js:117-124`), so the single path reaches ACC:123 with the same
semantics as batch. No path captures or decides before ACC:118.

### 3.2 Custody (Q2)

Trace of one admitted follower forward on key K (`pendingCommits[K]` = entry, `proposals[K]` =
{state, responsePending, rawOperation}, PQ:116-118):

1. `forwardCdcWithinWait` (ACC:160-173): `currentWait` guard (ACC:166) in the same synchronous
   segment as `ownOperation` (ACC:167), so PQ:134-136 cannot throw RELEASED synchronously.
   `ownOperation` schedules the body microtask M0 (PQ:138-142), attaches `closed` to both
   settlements (PQ:149) BEFORE any caller handler, and returns the raw. `ownChild(raw)` (ACC:168 ->
   INV:212-223) charges the source invocation when present. `promiseRace([raw, completion])`
   (ACC:172).
2. Deadline fires between `ownOperation` and M0 (case 7): `advance()` runs due timers synchronously
   (`time-source.js:150-178`) -> ACC:73-77 -> `queue.resolve(K, UNKNOWN)` -> `takeResponse` flips
   `responsePending`, clears the timer, `removeClosedEntry` skipped (raw open) (PQ:164-174), then
   `pending.resolve(UNKNOWN)` (PQ:205-207) fulfils `completion` in the SAME call. M0 then observes
   `!custody.responsePending` and throws RELEASED (PQ:139-140); `closed` nulls `rawOperation` and
   removes K (PQ:144-148, 154-161). No forward ran (case 7 asserts `hold.calls.length === 0`,
   `queue.has(key) === false`).
3. Deadline during the raw (cases 4, 5): response retires and settles UNKNOWN; entry stays (size 1,
   `responsePending false`); `ownOperation(K)` for a second attempt throws RELEASED (PQ:134-136) and a
   second admission of any vector is BACKPRESSURE (capacity) or duplicate-key BACKPRESSURE
   (ACC:126; case 5 raises capacity to 2 to prove the duplicate-key arm is what refuses). Raw settles
   later -> `closed` -> single removal (case 5 `size 0` after release).
4. Raw first (case 6): `closed` skips removal (response pending); race resolves with the remote answer;
   ACC:246-249 validates; `finally` (ACC:305-309) retires the response -> `takeResponse` -> removal.
5. Local afterCommit first (case 8): ACC:322-327 settles committed only if `liveWait`; race resolves;
   ACC:301 rebinds the I digest; raw holds K until the held reply closes (case 8 `size 1` while held,
   `0` after).
6. Shutdown (case 9): `isShutdown = true` then `retireCdcCommitWaiters` synchronously
   (`cache-and-lifecycle:150-152`) -> `release` -> `releaseEntry` skips raw-only entries (PQ:258),
   rejects pending ones -> `entry.reject` resolves the completion with `error.answer` = UNKNOWN
   (ACC:132) in the same call. Raw continues; its next `assertCurrent` (ACC:223 -> liveWait ->
   `isShutdown`) or the transport settlement (LIFE:181-232 guarantees settlement: abort on timer,
   parent limits, router shutdown; `onRetired` resolves deferred failures) closes it -> removal.
7. Raw rejects non-RELEASED while the response is pending (case 12): `closed` nulls the raw, entry
   stays (response pending), the retry handler charges a NEW raw only after the first closed (case 12
   `openAtStart [0,0]`, one raw at a time); a non-retryable rejection ends routing, REP wraps, ACC:302
   rethrows if live, `finally` retires -> removal. Raw rejecting after retirement: `closed` removes;
   the race is already settled; `Promise.race`, `raw.then(closed, closed)` and `ownChild`'s handlers
   consume the rejection (no unhandled rejection).
8. Successor fencing: `liveWait` compares `service.raft === entry.port` and
   `cdcCommitLifetime === entry.lifetime` (ACC:64-68); `currentWait` compares the entry object
   (ACC:46-49); `closed`/`removeClosedEntry` compare `pending` and `custody` objects (PQ:139-140, 145,
   155-156); afterCommit compares `entry.lifetime` and the entry (ACC:317, 323). A replacement
   service has its own queue (`message-group-service-state.js:142`). On the same service, a
   reopened port cannot enqueue K while the old raw-only entry holds it (ACC:126 BACKPRESSURE), so no
   successor entry can exist for the old closure to delete. Witnessed: duplicate refusal while
   raw-only (case 5 `C1_RAW_ONLY_SAME_VECTOR_REFUSED`) and distinct successor after closure
   (case 5, two native occurrences). The port-reopen variant is not witnessed; it is the same code
   path with the same object identities (NS, reasoned).
9. Cross-mode join: a FORWARD attempt while the PROPOSE raw is open gets that raw back (PQ:137) and
   races it; `runCdcProposal` awaits `wait.completion` (ACC:184), which the waiter's own timer
   bounds, so no deadlock. Nested `ownOperation` around the whole delivery does not exist (only
   ACC:151 and ACC:167 call it; `git grep ownOperation src/` confirms).
10. `ownChild` after `ownOperation` (vet C3): if `ownChild` throws, the raw body still runs, but
    `forwardDurableCdcPayload` -> `createCdcDeliveryBudget` (NDM:256 -> BUD:30/61) calls the parent's
    `assertCurrent` and throws before any transport call; the raw rejects, `closed` removes; the
    routing error is retryable-by-default but `onRetry` (REP:363) runs ACC's `assertCurrent`, which
    throws (parent not live), so no second attempt; ACC:302 -> `retiredCdcOutcome` -> typed UNKNOWN.
    No effect, no leak; recommended ordering fix only.

**Dropped W-B arm: unreachable, confirmed.** RELEASED is thrown by M0 only when
`custody.responsePending` is false or the identities changed (PQ:139-140). `responsePending` is
flipped only inside `takeResponse` (PQ:168), and every caller of `takeResponse` (`resolve`
PQ:200-209, `reject` PQ:219-229, `releaseEntry` PQ:256-269) settles the entry's completion
synchronously in the same call; `entry.reject` resolves (never rejects) the completion (ACC:132).
Identity change requires removal, which requires `!responsePending`, so the same holds. Therefore
whenever M0 can throw RELEASED, `completion` is already fulfilled and its race reaction was
enqueued either at fulfilment (race registered first) or at the `promiseRace` call (retirement
first, case 7's schedule) -- in both orders before M0 runs, hence before the raw's rejection
reactions are enqueued. The race resolves with the completion. Promise semantics relied on:
reactions are enqueued at settlement time in registration order; `Promise.race` registers on its
inputs synchronously.

What breaks if `wait.completion` were ever settled asynchronously (e.g. a deferred `entry.resolve`
or a thenable): the race could reject RELEASED. RELEASED carries no `retryable`, so RTG:229 treats
it as retryable; `onRetry` (REP:363) calls ACC's `assertCurrent`, which throws for a deadline or
shutdown retirement (liveWait false), aborting routing; REP:385-407 wraps it; ACC:302 sees
`!currentWait` and returns `retiredCdcOutcome` = the settled typed UNKNOWN. For an afterCommit
retirement (liveWait true) one retry would run after the backoff and `forwardCdcWithinWait` would
return `wait.completion` (ACC:166) without forwarding. So the public answer stays typed and no
second forward occurs in either case; the costs would be a spurious `RAFT_CDC_COMMAND_FAILED`
error log carrying `proposal_released_without_answer` and, in the afterCommit case, one wasted
backoff. The ACC:302-304 catch is the backstop that makes the arm redundant. Note: no assertion in
case 7 distinguishes "race resolved UNKNOWN" from "race rejected RELEASED then the catch typed it",
because RTG:221's `assertCurrent` throws on the expired budget either way and REP logs
`RAFT_CDC_COMMAND_FAILED` either way; only the wrapped detail string differs. Recommendation (ii)
pins it.

### 3.3 RC-1 `retiredCdcOutcome` (Q3)

ACC:273-285 and the catch ACC:302-304. Reached when `deliverCapturedCdc` or ACC:301's
`inputCdcOutcome` throws and the wait is not (current AND live).
- `currentWait` false (retired by deadline/shutdown -> settled UNKNOWN; by afterCommit -> settled
  committed): `await wait.completion` cannot hang because retirement always settles it (3.2).
  Non-committed -> returned as is (typed; UNKNOWN or the released answer).
  Committed -> returned only if `liveWait` (budget `entry.budget` > 0 on the service clock AND
  parent grant live AND port/lifetime/group unchanged, ACC:64-68), rebound to the I digest through
  `inputCdcOutcome`; otherwise `{...unknownCdcAcceptance(), cause: settled}`. A committed receipt is
  therefore never returned past the budget or for a non-live wait, and never without the I-digest
  rebinding. Note `liveWait` reads `entry.budget`, which the FORWARD path never re-arms (ACC:160-173
  does not call `armCdcWait`), so for forwards the bound is the original budget; PROPOSE re-arms to
  the per-attempt budget (ACC:180-181), the pre-existing F-S11 shape.
- `currentWait` true but `liveWait` false (budget crossed zero before the timer dispatched, parent
  retired, port changed): ACC:278-280 resolves UNKNOWN itself, then returns it. Typed.
- Re-typing: a typed INVALID/BACKPRESSURE thrown from the raw while the wait is current and live is
  rethrown unchanged (ACC:303; `wrapCdcProposeError` copies `code`, `runtime-support.js:252-274`).
  After retirement the response's single settlement (UNKNOWN or the receipt) wins over a late raw
  error; that is the response's one answer, not a second decision. No INVALID is turned into
  success; no BACKPRESSURE is turned into INVALID. Remote BACKPRESSURE at the leader still surfaces
  on the follower as UNKNOWN+cause (NDM:285, pre-existing, unchanged).
- Edge (K, pre-existing shape): `inputCdcOutcome` inside `retiredCdcOutcome` (ACC:283) runs
  `assertCdcRequestCurrent` synchronously right after `liveWait` passed; a real clock could tick
  across zero between the two reads, in which case the error thrown (ACC:196, message UNKNOWN,
  `retryable:false`, no `code`) escapes the catch untyped. Same shape exists at ACC:246-247 and
  ACC:300-301; record for the ACC owner (add `code: CDC_COMPLETION.UNKNOWN` at ACC:196).

**Witness required (RC-V1), exact.** Seam: the parent grant passed to `applyCDCBatch`
(`captureCdcParentGrant`, ACC:252-262) and the real `queue.resolve`. Controlled answers: none for
the transport (real RF3, real router; only the terminal reply is HELD as in case 8 with follower
replication flowing), a controlled `parent = {assertCurrent, remainingMs}` that throws
`cdcDeliveryBudgetError()` once `retired` is set, and a wrapper around the real `queue.resolve`
that sets `retired = true` synchronously after a committed resolve. Sequence: follower's own
afterCommit (ACC:322-327) settles committed while live -> race resolves committed -> RTG:221
`assertCurrent` -> `liveWait` -> `parentWaitIsLive` throws -> routing aborts -> REP wraps ->
ACC:302 (`!currentWait`) -> `retiredCdcOutcome` -> settled committed, `liveWait` false ->
UNKNOWN+cause. Expected typed result: `error === undefined`; `answer.success === false`;
`answer.error === CDC_COMPLETION.UNKNOWN`; `answer.deferRetry === true`;
`isCommittedCdcOutcome(answer.cause, [event], GROUP_ID) === true`; no own `cdcVectorDigest`;
`queue.size === 1` and `isResponsePending(key) === false` while the reply is held; `size === 0`
after release; one application forward. Mutations that must fail it: MV3 (return `settled`) ->
`success true`; M3 (drop the catch) -> untyped throw. Full file archived at
`scratchpad/v/W-I-verifier-rc1-committed-past-parent.test.js.txt`; results: WI-clean 1/1,
WI-MV3 0/1, WI-M3 0/1, WI-base 0/1 (base red at "the caller settles at the committed settlement":
the uncharged forward is awaited; the C1 mechanism is absent). Must it exist before acceptance:
YES. It is the only guard against returning a native receipt as success past a retired parent on a
branch introduced by this change, and the subject's own file cannot detect its removal.

### 3.4 O1 / DEFER (Q4)

- Public DEFER now flows: RCV:18 -> ACC:118 reserve -> ACC:226 decision (used only for the terminal
  guard and the local-ingress check) -> `proposeCDCCommand` -> RTG:190-195 FORWARD -> ACC:167 ->
  NDM:245-272. Terminal-at-non-leader returns UNKNOWN before any forward (ACC:227-228; case 10
  `C1_TERMINAL_AT_FOLLOWER_UNKNOWN`). Exhausted relay returns UNKNOWN before any forward
  (NDM:262-263; case 10 `C1_DEFER_IS_TYPED_UNKNOWN`, `hold.calls.length` unchanged).
- Repair bound: `maybeRepairAuthoritativeForwardTopology` (FDM:62-119) is single-flight
  (`forwardTopologyRepairInFlight`, FDM:68-70; a joiner awaits the first caller's read and is fenced
  by its own `assertCurrent` at NDM:162), cooldown-gated (FDM:72-78), and its read is bounded by
  `min(forwardTopologyRepairQueryTimeoutMs, remainingMs())` (`forwarding-owner-constants.js:178-181`,
  `remainingMs` = ACC's, which also asserts currency). It is a control-plane read, not a CDC
  forward: no follower<->leader recursion. Relay depth: `readCdcForwardContext` refuses > 2
  (NDM:82-85); NDM:262-263 returns UNKNOWN at >= 2; each hop sends `relayDepth + 1` (NDM:181) and a
  strictly smaller duration (NDM:190-193 -> BUD:24-26). `CDC_FORWARD_MAX_RELAY_DEPTH` unchanged.
  Bounded.
- The dossier's E-3 first bullet ("DEFER -> UNKNOWN inside ACC") was correctly NOT implemented: O1
  chose the forward owner's repair-and-re-decide as canonical, which that bullet would have made
  unreachable. Consistent with the lead's recorded decision.
- W-E absence: classified **NM, required before land (RC-V2)**. The mechanism NDM:265-269 is
  pre-existing code, but no witness in the tree exercises it with durable input from any entry
  point, and O1 made it reachable from public input where the old receiver returned immediate
  UNKNOWN. Case 10 does not reach it. Spec: follower whose native observation has no leader route
  and whose cache selection yields no targets (`DEFER_STRICT_TARGET_UNKNOWN`,
  `message-group-forwarding-owner.js:390-403`); wrap the real `maybeRepairAuthoritativeForwardTopology`
  to count calls and capture `queryTimeoutMs`; public `receiveMessage` of a durable batch; assert
  exactly one repair, `queryTimeoutMs <= remainingMs()` at the call, re-decision, answer UNKNOWN (or
  provisional if addressed ingress applies), zero application `transport.deliver` calls,
  `size === 0` after, relay depth unchanged; a second concurrent public receive observes count 1.
  Controlled negative: restore the base receiver DEFER arm (base RCV:39) -> repair count 0 -> red.

### 3.5 F1 / F4 / INVALID owner (Q5)

- Receiver grant on the service clock: RCV:16-17 `createCdcDeliveryBudget(service, {...localDelivery,
  receivedRemainingMs: payload[CDC_DELIVERY_REMAINING_MS]}, startedAtMs)` with `startedAtMs` taken
  at handler entry (RCV:39, 183) on `service.timeSource` (BUD:38, 47-48); the grant is
  `min(received, enclosing)` (BUD:44-46) and only ever shortens (BUD:49-57).
- ACC budget <= remaining: `captureCdcParentGrant` takes `min(deliveryTimeoutMs, context.remainingMs(),
  options.remainingMs())` (ACC:256-258) where `options.remainingMs` is the receiver grant; the waiter
  clock is `queue.timeSource` = `service.timeSource` (ACC:120-121, state.js:142). Same domain.
- Forward: NDM:256 derives the hop budget from ACC's `remainingMs`/`assertCurrent` (BUD:42, 46,
  54-56); transport gets `timeoutMs: options.remainingMs()` and `remainingMs` as a parent limit
  (NDM:187; LIFE:34-43, 101-114 shorten, never renew); the wire carries only
  `cdcDeliveryRemainingMs` (NDM:189-193 -> BUD:24-26). No absolute time crosses the wire. Unchanged
  by C1 for the owner path; the public path now inherits it instead of the base's RCV:45 direct
  forward with a fresh budget.
- F4: no outcome is fabricated. The receiver spreads `...answer` last (RCV:28) and adds only
  metadata fields OUT classifies as wrapper metadata (OUT:112-131); a committed/provisional answer
  is validated by the owner predicates before and after (ACC:247-249, 266-270); DEFER/expiry/
  shutdown produce `unknownCdcAcceptance()` (OUT:332-334) with the real receipt only as `cause`.
- NDM:253-255 refuses typed INVALID (`cdcDeliveryBudgetError(INVALID)`: `deferRetry: true,
  retryable: false`, BUD:14-16) a durable forward without `applyProvisionalIngress`, after the two
  shallow wrapper copies and before `captureCdcEvents` (NDM:260), reservation or any forward. Right
  owner (the single funnel of `forwardCDCEventToLeader`/`forwardCDCBatchToLeader`/
  `forwardCDCPayloadToLeader`, FDM:369-374, 410-414, 532-533) and right code (a caller-contract
  violation, non-retryable). No production caller hits it: RCV's non-durable arms (RCV:142, 270)
  carry no `eventKey`/`cdcForwardMode`; FDM:398/455 are reached only after the durable branch
  returned. Case 13 witnesses both entry points.
- RC-4 `assertCdcRouteCustody` (REP:32-38, called at REP:339 before `routeMessageGroupCommand`):
  refuses `proposeCommand XOR forwardCommand`, and neither on a durable command; the non-durable
  caller `applyCDCBatch` (REP:255 region) supplies neither and still routes (case 14). REP:357-360
  falls back to the uncharged forward only when `forwardCommand` is absent, which after RC-4 means
  non-durable. ACC always supplies both (ACC:243-244).

### 3.6 Tests (Q6)

- Byte identity: see RC-V3(a). `git show 947107b63:TEST` (343 lines) vs staged TEST (732 lines):
  hunks only at imports (TEST:16-23: `createCdcDeliveryBudget`, `MESSAGE_GROUP_COMMAND_TYPE`,
  `MESSAGE_GROUP_CDC_INGRESS_ACTION`, `CDC_FORWARD_MAX_RELAY_DEPTH`) and at `receive`
  (TEST:62-63 `wrapper = {}`, TEST:68 `...wrapper`, spread after the duration field, default `{}`
  for the four reviewed cases); the four case bodies TEST:146-348 are identical to base 141-343.
- The 10 witnesses (TEST:382-732) assert at named cuts (`C1_RACE_DEADLINE_FIRST_SETTLES`,
  `C1_OWNER_EXPIRY_IS_TYPED_UNKNOWN`, `C1_RAW_ONLY_SAME_VECTOR_REFUSED`, `C1_RACE_RAW_FIRST_CUSTODY`,
  `C1_RACE_INTERLEAVE_TYPED_UNKNOWN`/`_NO_FORWARD`, `C1_RACE_LOCAL_COMMIT_FIRST_SETTLES`/
  `_RAW_CUSTODY`, `C1_SHUTDOWN_DOES_NOT_AWAIT_FORWARD`/`_SETTLES_WAITER`, `C1_DEFER_FOLLOWS_ADMISSION`,
  `C1_DEFER_IS_TYPED_UNKNOWN`, `C1_TERMINAL_AT_FOLLOWER_UNKNOWN`, `C1_FORWARD_DEFERRED_UNKNOWN`,
  `C1_FORWARD_RETRY_ONE_RETRY`/`_NEVER_TWO_OPEN_RAWS`, `C1_E4_UNADMITTED_FORWARD_INVALID`,
  `C1_RC4_UNPAIRED_HOOKS_INVALID`) on the real RF3 fixture (three `MessageGroupService`s on
  `VirtualTimeSource`s, real raft-rs, real `MessageRouter`), the real `ProposalQueue` (capacity set
  on the instance, TEST:118-124; `ownOperation` wrapped but delegated, TEST:465-470, 611-621), and
  declared controlled transport answers for application forwards only (TEST:590-606,
  `buildDeferredDeliveryFailure` is the router's own builder). Setup cuts are named apart from
  behavioural cuts (e.g. TEST:474 `interleaved === 1`, TEST:495-499, TEST:665-667). Vacuity
  excluded where it matters: case 5 raises capacity to 2 before the same-vector probe (TEST:403-406);
  case 9 checks `isResponsePending` synchronously before any await (TEST:528-529); case 12 checks
  the first raw closed before the retry (TEST:667) and `openAtStart [0,0]` (TEST:677-678).
- My runs (snapshot worktree, `node --test --test-reporter=tap`): 14/14 x3, empty stderr
  (`scratchpad/v/c1-run{1,2,3}.tap`, durations 3228/3308/1584 ms).
- Mutations (scratch worktree `scratchpad/v/wt-mut` at `26fc0a13`, applied by
  `scratchpad/v/mut/apply.py`, reverted after each; TAPs in `scratchpad/v/mut/`):
  M1 uncharged forward (REP:360 -> `forward()`): reds 4,5,7,8,9,12 -- matches the claim.
  M3 untyped expiry (delete ACC:302-304): reds 4,5,7,9 -- matches the claim.
  MV1 skip `assertCdcRouteCustody` (REP:339): red 14 only -- as the vet's W-H row predicts.
  MV4 no race (ACC:172 -> `return raw`): reds 4,5,8,9 -- the four "response settles before raw"
  cells. MV5 PQ releases on retirement (PQ:155 drop `rawOperation !== null`): reds 4,5,8,9 -- the
  vet's W-A mutation. MV3 RC-1 guard removed (ACC:283-284 -> `return settled`): **0 reds** -- the
  coverage gap behind RC-V1.

### 3.7 Impact contract (Q7)

TEST and the three ProposalQueue tests are present in both
`contracts["cdc-source-native-delivery"].tests` and `coupledPairs["cdc-source-native-delivery"].witnessTests`
(parsed from the staged JSON); the pair's `recipient-and-response` endpoint already owns PQ, ACC,
REP, NDM. `npm run -s audit:impact-contracts` at the snapshot: PASS (71 contracts, 44 coupled pairs,
sha256 `58f8d0a0...`). `npm run -s test:metadata:refresh` at the snapshot rewrites identical digests
(`fnv1a32-42fd6ea4 / 48203f78 / 3727d304`, seal snapshot `4f6ec871...`) with zero `git status` drift
under `test/shards`: the staged metadata is canonical. TEST is classified `unit`.

### 3.8 Lab cone classification (Q8; the 1009-file cone was not re-run)

- Implementer evidence cross-check (no runs): `reds-local-base.tap` and `reds-local-change.tap` each
  have 106 red files, the same set; first failing leaves differ in 4 files -- three property tests
  differ only by fast-check seed/shrink path with the same counterexample shape, and
  `test/transport/message-router.test.js` has an extra flaky leaf at base ("subsequent deliveries
  should defer behind the armed reconnect owner") on top of the shared "ack timeout ... test
  unfinished" leaf. Of the 109 lab reds, 2 are run-2-only, 106 are these, and the 107th
  (`cdc-group-propagation-foreground-boundary`) is green locally at base and change (RC-V3(b)).
- My spot check (scratch worktrees `wt-base` at `bed8c6354`, `wt-snap` at `26fc0a13`, node_modules
  linked, committed metadata; `node --test` per file; TAPs in `scratchpad/v/reds/`): failing-leaf
  sets identical base vs snapshot for all 8 files -- `config/code-path-uniqueness.property` (3),
  `cdc/cdc-shutdown-terminal-owner-write` (1), `message-group/cdc-non-leader-propagation` (40),
  `message-group/message-group-service-raft-replication-and-cdc` (2),
  `message-group/message-group-service-strict-cdc-forward-routing` (2),
  `message-group/message-group-proposal-deadline-wait-bound-spent` (8),
  `partition/partition-cdc-delivery-progress` (1), `transport/message-router` (0: GREEN at both in
  my runs, 23 vs 35 subtests counted, 0 cancelled -- a flaky file with variable completion, red for
  the implementer locally and on the lab, no MG involvement). The seven red sets also equal the
  implementer's base leaves name for name. No mismatch attributable to C1.
- Run-2-only files at base locally: `partition/partition-runtime-reconstruction-leadership` 20/20
  green (lab run 1 green, run 2 red at W-B6-3 after 40 s: flake, as claimed);
  `scripts/test-placement` 26/26 green (lab run 2 red at "an interrupted placed run stops every
  machine at once: Missing expected exception", the known placement race).
- `cdc-group-propagation-foreground-boundary` locally: 8/8 green at base and twice at the snapshot;
  subtest 5 ("durable foreground attempt exhaustion ...", the lab timeout at 2000 ms) takes
  770-785 ms here, 2042-2043 ms on adams-gamla in both lab runs. The test uses a stub router and a
  services-row stub (test:55-63); it does not reach the MG receiver, so C1 cannot change its timing.
  Unknown: whether it times out at base on that host (not run there).
- `message-group-native-provisional-route` red at test:395 (`expected 'mg-provisional-target-l',
  got null`) with byte-identical failure bodies at base and snapshot (implementer's TAPs). The
  depth/ordinal assertions before line 395 pass at the snapshot, so the first-hop re-routing through
  `routeMessageGroupCommand` preserved them; the pre-existing lineage red prevents W-F from being
  conclusive beyond that point.

### 3.9 Statics (Q9)

`node --check` OK and `eslint` clean for the 4 src files and TEST (snapshot). `npm run -s
audit:guidelines` at base and snapshot: identical counts in every sub-audit (literals 312 new /
1261 inherited at both -- pre-existing lineage debt under `scripts/quest-evidence` etc.; exit 1 at
both) -> zero new from C1. `check-complexity.js --scoped` on the 4 src files + TEST: 3 inherited
violations at both (`handleLatencyCdcPropagationMessage` 23, `...BatchMessage` 15, `applyCDCBatch`
31; line numbers shift only). Duplication ratchet unchanged (implementer's base vs final outputs
identical). No new exports (`forwardCdcWithinWait`, `retiredCdcOutcome`, `assertCdcRouteCustody`,
`cdcCommandEvents` are module-private); removed RCV imports remain consumed elsewhere.

---

## 4. Coverage-table deltas vs the vet's model (section 2 of the vet)

| Vet cell | Now covered by | Status |
|---|---|---|
| reserve before capture, leader, occupied, single/batch | cases 1-2 | covered (unchanged) |
| free queue, invalid deep payload -> INVALID, size 0 | cases 1-2 control | covered |
| follower occupied by open forward, second distinct arrival -> BACKPRESSURE | case 3 | covered |
| follower raw-only entry, second distinct arrival -> BACKPRESSURE | case 4 `retry`, case 5 | covered |
| duplicate same-vector while key held -> BACKPRESSURE at ACC:126 (was NS uncovered) | case 5 `C1_RAW_ONLY_SAME_VECTOR_REFUSED` (capacity raised to 2) | **now covered** |
| ingress decided inside the owner only, leader | cases 1-2, mixed-vector (green) | covered |
| follower native-leader FORWARD | cases 3-6 | covered |
| follower provisional localIngress -> provisional, no forward (NS, highest-risk) | `native-provisional-route` | re-measured: depth/ordinal assertions pass; file red at test:395 identically at base (lineage) |
| public DEFER_STRICT_TARGET_UNKNOWN -> repair + re-decide (NM) | -- | **UNCOVERED, NM -> RC-V2** |
| DEFER_NATIVE_TARGET_UNAVAILABLE (terminal at non-leader) -> UNKNOWN via ACC:227 (NS) | case 10 `C1_TERMINAL_AT_FOLLOWER_UNKNOWN` | **now covered** |
| relay depth exhausted -> UNKNOWN, no forward (NS) | case 10 `C1_DEFER_IS_TYPED_UNKNOWN` (depth 2, non-terminal) | **now covered** |
| PROPOSE charged, source expiry during raw (K) | `native-custody-handoff` (green) | covered |
| forward charged, deadline during raw -> UNKNOWN, entry stays, later closure -> 0 | cases 4, 5 | covered |
| forward resolves committed after retirement -> old answer unchanged | cases 4, 5 | covered |
| forward resolves non-committed while pending -> UNKNOWN+cause, no retry, release once (NS) | case 11 | **now covered** |
| forward rejects retryably -> new raw only after first closed, never two open (NM) | case 12 | **now covered** |
| RELEASED in the microtask after synchronous retirement -> completion wins, no forward (NM, W-B) | case 7 (public outcome; the arm itself is unreachable, 3.2) | covered at the public seam; the race-level distinction is not observable (rec. ii) |
| local afterCommit first; raw holds K; release at reply (NM, W-A) | case 8 | **now covered** |
| shutdown during open forward -> waiters UNKNOWN synchronously, raw-only survives `release` (NM, W-D) | case 9 | **now covered** |
| successor same key while old raw open -> BACKPRESSURE; late closure never removes successor (NM, W-D) | case 5 (dup refusal; distinct successor after close) | covered on one queue; port-reopen variant reasoned, not run (NS) |
| grant expired before reservation (K) | BUD-level tests | unchanged |
| PROPOSE per-attempt deadline kills retries (K, F-S11) | -- | pre-existing finding, not C1 |
| E-4 dead arm -> typed refusal (NM, W-G) | case 13 | **now covered** |
| RC-4 hook pairing (NM, W-H) | case 14 | **now covered** |
| RC-1 committed receipt past liveness -> UNKNOWN+cause (new branch, not in the vet table) | -- (MV3 green) | **UNCOVERED, NM -> RC-V1** (witness supplied and run) |

Seven of the vet's NM cells are now covered; the two remaining uncovered NM cells are RC-V1 and
RC-V2. Two NS cells (same-vector duplicate, terminal/exhausted DEFER) are covered beyond the vet's
expectation.

---

## 5. Findings by template category

- **Admission-gating.** A1 holds (section 2): precheck = enforcement (one queue), transient
  classification BACKPRESSURE with `retryAfterMs` (ACC:41-44), no new budget. A2: the receiver's
  fulfilled-path `budget.assertCurrent()` (RCV:20) is kept as its own clock-domain owner (RC-3
  honoured, no rejection-path assert); it can replace a BACKPRESSURE answer by a thrown typed
  UNKNOWN when the receiver grant lapsed during the call -- by design. A3: shallow pre-admission
  reads enumerated and confirmed shallow.
- **Concurrency / serialization.** C1 race sound (3.2). C2 cross-mode join deliberate and documented
  (ACC:163-165). C3 ordering recommended. TOCTOU: every await in ACC is followed by `assertCurrent`
  or `currentWait` (ACC:246, 265, 283, 303, 306).
- **Retry-loops.** FORWARD retries only on thrown retryable errors (RTG:229; a resolved deferred
  failure is accepted at RTG:222, case 11); one raw at a time (case 12); bounded by `onRetry`'s
  `retryDelayMs >= remainingMs()` throw (REP:364). Every expiry on the follower forward path (and the
  PROPOSE path, pre-existing) logs `RAFT_CDC_COMMAND_FAILED` at error level for an expected typed
  deadline because RTG:221's `assertCurrent` throws after the completion wins (K, hot-path
  diagnostics owner). F-S11 (dead PROPOSE retries) remains pre-existing and out of scope.
- **Transport-delivery.** Acceptance of a forward reply uses `isCommittedCdcDelivery` (NDM:132-135 ->
  OUT:336-339): ACK alone is never processed-evidence. Raw settlement guaranteed by LIFE (3.2 item
  6). Stubs: the tests wrap the real router's `deliver` with declared controlled answers for
  application forwards only; native envelopes keep the fixture's real schedule.
- **Owner-interaction.** Single semantic owner for the durable ingress decision is now ACC/NDM
  (receiver arm deleted); the predicate is re-evaluated with fresh observation at ACC:226,
  NDM:264/268/150 (one owner path, F3 recheck-before-dispatch). Registry aligned (3.7). No local
  escape hatch: `git grep` shows no other `ownOperation` consumer and no uncharged durable forward
  caller (3.5). Paired witness: case 3 (occupied follower) and case 4 (expiry vs raw) are green in
  the same file with the historical shortcut restored by M1 making both red.
- **Harness-fidelity.** Reds for the right reason: `impl-before.tap` 0/4 and `witness-on-base.tap`
  0/10 at base sources; my mutation reds name the behavioural cuts (e.g. MV4 red at
  `C1_RACE_DEADLINE_FIRST_SETTLES`). Known limit (vet T3): the fixture router runs on the host clock
  (`message-router.js:264`, fixture has no `timeSource`), so the held-reply cases depend on the RF3
  commit finishing within the 100 ms wall-clock transport timeout; a slow host yields a setup red
  (`assertHeldNativeAnswer`), never a false green. Three local runs were stable.

---

## 6. What I ran (all under `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/`)

- Worktrees: `v/wt-snap` (26fc0a13, read-only runs), `v/wt-mut` (26fc0a13, mutations + W-I),
  `v/wt-base` (bed8c6354); node_modules symlinked to the main checkout; committed metadata.
- `v/c1-run{1,2,3}.tap` -- C1 file at the snapshot, 14/14 x3.
- `v/mut/{M1,M3,MV1,MV3,MV4,MV5}.tap`, `v/mut/apply.py` -- mutations; `v/mut/WI-{clean,MV3,M3,base}.tap`
  and `v/W-I-verifier-rc1-committed-past-parent.test.js.txt` -- the RC-1 witness.
- `v/reds/{base,snap,snap1,snap2}-*.tap` + `v/chain2.log` -- lab-red spot checks, run-2-only files,
  foreground-boundary timing; `v/leafcmp.py`, `v/leaves.py` -- leaf comparisons.
- `v/statics-{wt-base,wt-snap}-{guidelines,complexity}.txt`, `v/statics-wt-snap-impact.txt`,
  `v/statics-wt-snap-metadata-refresh.txt`, `v/statics-wt-snap-metadata-drift.txt` (empty).
- `c1-verify-base-test.js` / `c1-verify-staged-test.js` -- the byte-identity diff inputs.
- All runs were serialized behind `scripts/checks/wait-for-thermal-headroom.js` (one gate per phase;
  the host was at 81-95C from other load for most of the session).

## 7. Limits and unknowns

- The 1009-file lab cone was not re-run; classification rests on the 8+2(+1) local spot checks and
  the implementer's own paired TAPs. Unknown: whether `cdc-group-propagation-foreground-boundary`
  times out at base on adams-gamla (mechanism independent of C1).
- The port-reopen successor variant (W-D second half) and the public DEFER repair path (W-E) were
  reasoned from source, not run. The W-B race-level distinction is reasoned (promise semantics), not
  observable through the current assertions.
- Statics ran as `node --test`/direct scripts, not through `solve land`'s gate; the land gate's
  unused-exports, file-size and duplication ratchets were not re-run (no export/size change; the
  implementer's duplication outputs are identical at base and final).
- Not reviewed: C2, the source-side F2 progress cell, classification, activation, two-start
  acceptance. This verdict covers the C1 staged tree only and does not authorize `land`.

---

## Re-verification r2 (append-only), 2026-10-24: snapshot `refs/wip/lab-c1-3` = 4406547c

Subject: the STAGED tree in the same worktree (HEAD still `bed8c6354`); `git write-tree` =
`79ada53000c6aa2a2a093d5c578145e9bd02569a` = `4406547c^{tree}`; REP, both test files and
`impact-contracts.json` `cmp`-identical to `4406547c`; index-only (no unstaged or untracked files).
Bounded to `git diff 26fc0a13 4406547c`: REP (+15/-12), TEST (+112, cases 15-16), new
`test/message-group/message-group-cdc-public-defer-repair.test.js` (97 lines), impact-contracts
(+1 test in both lists), regenerated metadata. ACC, RCV, NDM unchanged since r1 (the brief's "REP +
NDM" for C4 is REP only). All three run-3 lab logs name placement worktree `4406547c3d1e-...`.

### Verdict r2: REQUIRED CHANGES before commit (naming 4406547c)

| # | Required change | Why |
|---|---|---|
| r2-RC-1 (C4, one version) | **Move the relay-depth increment into the send owner for both input kinds and delete the durability branch.** The concept "the next send carries this hop's depth + 1" is implemented at FOUR sites in TWO conventions: NDM:181 (`relayDepth: options.relayDepth + 1`, durable send owner increments; callers pass the hop depth) versus REP:44-47 `forwardedCdcRelayDepth` (`hasDurable ? hopDepth : hopDepth + 1`), RCV:145 and RCV:271 (`relayDepth: relayDepth + 1`), all three CALLERS of the ordinary send incrementing while FDM's ordinary send (`forwardCDCEventToLeader` FDM:365-404, `forwardCDCBatchToLeader` FDM:407-460, `forwardCDCPayloadToLeader` FDM:528-...) puts the caller's value on the wire unchanged. C4 ADDED the third caller-side increment and the branch whose only purpose is to reconcile the two conventions: that is two versions of one concept (owner directive 2026-10-24, one version of any logic), introduced by this change. Required shape: (a) REP `forwardedCdcRelayDepth` returns `options.relayDepth ?? 0` (the hop depth) for every command, no `hasDurableCdcEvents` branch; (b) the ordinary send owner increments at its send exactly as NDM:181 does (set the wire `relayDepth` to hop + 1 where FDM builds the payload, FDM:381-395 and FDM:440-455), both send sites consuming ONE helper (e.g. `cdcRelaySendDepth(hopDepth)` next to `CDC_FORWARD_MAX_RELAY_DEPTH`'s owner); (c) RCV:145 and RCV:271 pass `relayDepth` (the hop) instead of `relayDepth + 1`; RCV:139/267's `>= MAX` guards stay (they guard the hop). Wire-observable depths are unchanged by construction (receiver hop = sender hop + 1 in both conventions today), so case 16 and the existing non-durable depth assertions (`cdc-non-leader-propagation`, `strict-cdc-forward-routing`) must stay as they are. **Alternative compliant path:** drop C4 from this commit (restore REP to the 26fc0a13 form) and record the attempt-as-depth defect (base REP:23-30, pre-existing since before C1) as an R17 finding for the forwarding owner; C1 + RC-V1/RC-V2 do not depend on C4. Either path is acceptable to me; (a)-(c) is the systemic fix. |
| r2-RC-2 (W-E) | **Tighten the single-flight assertion**: `assert.ok(repairs.length >= 1, 'C1_PUBLIC_DEFER_REACHES_REPAIR')` -> `assert.equal(repairs.length, 2, ...)` (both public receives must request the repair) so that `reads.length === 1` is a proof of single-flight and not vacuous. As written, one receive reaching the repair and the other never requesting it also satisfies `>= 1` and `=== 1`. I ran the tightened copy at 4406547c: GREEN (`scratchpad/v/r3/WE-tight.tap`), so the claim is true in fact and the change is one line. |

Everything else in the round-3 delta is approved: case 15 is my RC-V1 witness in substance and pins
the RC-1 branch (MV3 reds exactly case 15); the DEFER test covers the NM cell I named (with r2-RC-2);
C4 is a correct fix of a real pre-existing defect (its location is what r2-RC-1 objects to, not its
semantics); registration and metadata are canonical; lab run 3 is 106 base reds + the lab-only timing
red, C1 16/16 and DEFER 1/1 green on adams-gamla. After r2-RC-1 (either path) and r2-RC-2 are applied
and case 16 + the two non-durable depth witnesses re-measured, I would APPROVE for commit; W-E was the
last open item from r1 and is now covered.

### (1) RC-V1 -> case 15 (TEST:735-786)

Assertions present, in substance mine: `success === false` (`C1_RC1_RETIRED_PARENT_NEVER_SUCCESS`),
`error === UNKNOWN`, `deferRetry === true`, `isCommittedCdcOutcome(answer.cause, [event], GROUP_ID)`,
no own `cdcVectorDigest`, `queue.size === 1` and `isResponsePending(key) === false` while the reply
is held, `size === 0` after `hold.release()`, `hold.calls.length === 1`; setup cuts `committedSettlements
=== 1` and `hold.response` present; the controlled parent grant throws `cdcDeliveryBudgetError()`
imported from BUD (TEST:16-17), set `retired` synchronously inside a wrapper around the real
`queue.resolve` (TEST:748-756) exactly as my witness did. My runs at 4406547c: C1 file 16/16
(`v/r3/c1.tap`); MV3 (`return settled` at ACC:283-284) -> 15 pass / 1 fail, red only case 15
(`v/r3/MV3.tap`), matching `c1/mutation-MV3.txt`.

### (2) RC-V2 -> `message-group-cdc-public-defer-repair.test.js`

- Owners real: the fixture (`message-group-native-provisional-route-fixture.js`, header: real released
  SERVICES producer, RF1 source MG, RF5 target MG, real `MessageRouter`; the only fault is transport
  custody) reopens the follower with no bootstrap address hints (fixture:204-223, `peerAddresses ===
  []`), so `leaderAddressStatus === UNAVAILABLE` (test:49-51) is the real port's observation, not a
  status double. `maybeRepairAuthoritativeForwardTopology` and `repairAuthoritativeForwardTopology`
  are wrapped only to record `context.remainingMs()` / call count and `Reflect.apply` to the real
  methods (test:62-71): the single-flight (FDM:68-70), cooldown (FDM:72-78) and the control-plane read
  all run. Owners stay real.
- Coverage of the NM cell: public `receiveMessage` (LATENCY_CDC_PROPAGATION_BATCH, test:35-43) with a
  durable SERVICES occurrence -> decision `DEFER` / `DEFER_STRICT_TARGET_UNKNOWN` /
  `shouldRepairAuthoritativeTopology` (test:54-58) -> repair reached with `0 < remainingMs <= 5000`
  (`C1_PUBLIC_DEFER_REACHES_REPAIR`, the ACC/NDM `remainingMs` handed to FDM at NDM:160-161, which
  bounds the read via `min(1500, remainingMs())`) -> exactly one read across two concurrent receives
  (`C1_PUBLIC_DEFER_REPAIR_SINGLE_FLIGHT`) -> re-decision to a valid provisional outcome per vector
  (`C1_PUBLIC_DEFER_RE_DECIDES_TO_PROVISIONAL`, `isProvisionalCdcOutcome` with the target group) ->
  zero application sends, `cdcCommitWaiters.size === 0`, route still UNAVAILABLE. This is the cell I
  named in r1 (public DEFER_STRICT_TARGET_UNKNOWN -> repair + re-decide, NDM:264-269), now executed
  from the public entry. Not asserted vs the vet's W-E text: `queryTimeoutMs <= remainingMs()`
  directly (owner code, unchanged) and "relay depth unchanged" (no send happens, so moot).
- Single-flight: NOT proven as written (r2-RC-2); proven in fact by my tightened run (both receives
  request the repair, one read).
- Negatives, mine at 4406547c: repair never requested (NDM:265 `if (false)`) -> red at
  `C1_PUBLIC_DEFER_REACHES_REPAIR` (`v/r3/WE-norepair.tap`); DEFER test on base sources -> red at
  the same cut (`v/r3/WE-base.tap`; the base receiver arm returns immediate UNKNOWN, the vet's
  controlled negative). Both match `c1/mutation-WE-*.txt`. Green twice at 4406547c (`v/r3/defer-{1,2}.tap`).

### (3) C4 relay depth

- Code: REP:44-47 `forwardedCdcRelayDepth(command, options)`; REP:272 ordinary `applyCDCBatch` now
  passes `{relayDepth}` (its parsed hop depth, REP:181-184, default 0) to `proposeCDCCommand`;
  REP:357-361 `forwardToLeader: (command) => forwardCDCCommandToLeader(command, options)`;
  REP:418-419 signature `(command, options = {})`. Grep: the only caller is REP:360 and it passes
  `options`; no test calls it; no caller passes an attempt. Base REP:23-30 returned `attempt` for
  ordinary input (attempt 3 -> depth 3 -> `readCdcForwardContext` INVALID at NDM:82-85 via
  `captureCdcForwardOptions` FDM:367/409): a real pre-existing defect that made every ordinary
  follower forward's third attempt fail `cdc_committed_acceptance_invalid`.
- One-version attack: see r2-RC-1. Trace of the two send sites: durable NDM:174-197
  (`relayDepth: options.relayDepth + 1` at :181, `options.relayDepth` = hop); ordinary FDM:365-404 /
  407-460 build `payload.relayDepth = options.relayDepth` unchanged and `forwardCDCPayloadToLeader`
  (FDM:528-...) sends it, using `logContext.relayDepth` only for selection/logging (FDM:548-550). The
  "+1" for ordinary therefore lives in every caller (REP:46, RCV:145, RCV:271). Two conventions, four
  increment sites; the increment belongs in exactly one place, the send owner, for both inputs.
- Case 16 (TEST:788-842): three attempts of one hop admitted (`attempts === 3`,
  `C4_THIRD_ATTEMPT_IS_ADMITTED`; final error not INVALID), every send at depth 1 or 2
  (`C4_RETRIES_OF_ONE_HOP_KEEP_ITS_DEPTH`, >= 3 depth-1 sends), a genuine depth-2 input refused
  INVALID before any transport call (`C4_THIRD_HOP_REFUSED`, `forward.calls.length` unchanged). The
  controlled answers are a `Proxy` over the answers array (TEST:800-801) returning a retryable
  refusal while `attempts < 3`, then passing through to the real router; the real
  `forwardCDCCommandToLeader` runs under a counting wrapper. My C4 negative (REP from 26fc0a13 in the
  4406547c tree) -> 15 pass / 1 fail, red only case 16 with `Raft CDC replication failed:
  cdc_committed_acceptance_invalid` (`v/r3/C4-base-rep.tap`), matching `c1/mutation-C4-base-rep.txt`.
- "Cluster-M1 lost the relay signature": from the implementer's `c1/cmp/{base,c4}-*.tap` leaf names,
  `cdc_committed_acceptance_invalid` leaves go 2 -> 0 in `cdc-non-leader-propagation` and 1 -> 0 in
  `message-group-service-raft-replication-and-cdc` (0 -> 0 in the other two); remaining leaves there
  are `Unable to resolve unified peer address ...` / `leader address is unavailable` (PEER_UNRESOLVED)
  plus parent-suite names and, in `message-group-service.test.js`, six live-leader/bootstrap-hint
  routing leaves (status-double shaped). I did not reproduce the "14 -> 0, 6 -> 0" figures (they are
  not leaf counts; probably nested occurrence counts). My own runs: `cdc-non-leader-propagation` base
  22 red subtests / 40 leaves -> snapshot 21 / 39; the base-only leaves are the INVALID message plus
  two subtests that now PASS ("does not fall back to bootstrap peer hints for steady-state forwarding",
  "steady-state forwarding should fail closed when only bootstrap peer hints remain"), i.e. C4 also
  unmasked their intended fail-closed error; snapshot-only leaves are two PEER_UNRESOLVED messages
  replacing the INVALID one. `strict-cdc-forward-routing` 1 red (same leaf as base),
  `raft-replication-and-cdc` 1 red (same parent; leaf now PEER_UNRESOLVED instead of INVALID).

### (4) Lab run 3

Final per-file status with lane precedence (run3 ordinary 866 files/72 red, run3b bootstrap 213/20,
run3c exclusive 47/24; the main log's `fail=216` counts lane-reassigned files): 1010 files, 107 reds
= `run3-all-reds.txt` = the 106 local-base reds + `cdc-group-propagation-foreground-boundary`
(lab-only timing red, as in r1). C1 `ok (16 assertions)`, DEFER `ok (1 assertions)` on adams-gamla.
Spot check of red files' failing leaves (lab run 3 vs `reds-local-base.tap`): identical first leaf
and leaf sets for `config/code-path-uniqueness.property` (3), `cdc/cdc-shutdown-terminal-owner-write`
(1), `message-group/message-group-proposal-deadline-wait-bound-spent` (8),
`partition/partition-cdc-delivery-progress` (1), `raft/raft-rs-backend/operation-port-boundary` (1),
`bootstrap/seed-infrastructure-phase` (3), `bootstrap/retained-seed-original-handoff.integration` (1),
`integration/cdc-propagation.integration` (14), `rebalancer/replica-operation-membership-epoch-binding`
(3). `cdc-non-leader-propagation` differs by exactly the removed INVALID leaf (39 vs 40), the expected
C4 effect.

### Statics r2 (at 4406547c, `v/r3/`)

`node --check` + eslint clean for REP and both test files; `audit:impact-contracts` PASS (71/44,
sha256 `2febffec...`); scoped complexity on REP: 1 inherited (`applyCDCBatch` 31), none new;
`test:metadata:refresh` zero drift. Scratch worktrees `v/wt3` (4406547c) and `v/wt3base` (bed8c6354)
removed after the runs.
