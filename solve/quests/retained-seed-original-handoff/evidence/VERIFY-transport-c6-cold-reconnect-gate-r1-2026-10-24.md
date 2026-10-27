---
audience: development
documentClass: evidence
---

# VERIFY C6 cold-reconnect delivery grant, round 1 (2026-10-24)

## Verdict

**APPROVE for keeping 9c88e93db.** No required changes. Every implementer
claim verified against the tree and by my own runs; the defect is real, the
fix is the lead's ruling (dial bounded by min(connectTimeoutMs, remaining
grant); defer only below the owner's 5 ms floor), nothing else compares a
debited remainder with the undebited connect limit, and no leaf turned red.
Report-only findings follow (section 5); none blocks the commit. The commit
message is a WIP marker (`wip: C6`); the landing commit needs the real
message, which is the lead's step, not this round's.

## 1. Identity

| Item | Value |
| --- | --- |
| Commit under review | `9c88e93dbe34cb0c6461a9c43faf84af4a5ee459` ("wip: C6") |
| Parent | `bed8c6354737df06e8e57a0c5753d3b88f1e5e5f` |
| Tree | `e392f7071d50d1b1cd92d87fa43ec082ef1ef4fb` |
| `refs/wip/lab-c6-1` | `feec1302593d16a9185322250c5c12b9e0874d6b` -- a DIFFERENT commit object (message "WIP snapshot: C6 ... lab measurement only") with the SAME tree `e392f7071d50`; content-identical |
| Lab placement head (lab-c6-2.log line 3) | `placement-head=9c88e93db...` -- the lab proof names the exact head (R22 satisfied) |
| Implementer worktree | `/mnt/data/peter/projects/.worktrees/transport-cold-reconnect-gate-20261024`, clean, HEAD 9c88e93db |
| My scratch worktrees (detached, node_modules symlinked, removed at the end) | `/mnt/data/peter/projects/.worktrees/verify-c6-after-20261024` (9c88e93db) and `/mnt/data/peter/projects/.worktrees/verify-c6-base-20261024` (bed8c6354) |
| Files changed | 4 src (constants/transport.js, lifecycle-methods, delivery-delegation, reconnect-behaviors), 1 new test, 1 test with a deleted leaf, 4 generated shard files; `message-router-delivery-behaviors.js` unchanged as claimed |

## 2. Defect confirmed

`git log -S shouldDeferColdReconnectForDeliveryBudget -- src/`: introduced by
d7f6d363f (2026-05-17), moved by 9d1f063bb, changed only by 9c88e93db. The
caller started passing the DEBITED remainder in 681da1dc1
(`git log -S'remainingDeliveryMs(options, deliveryTimeoutMs)'`:
delivery-behaviors.js:328-336 and :512-520). `connectTimeoutMs` defaults to
`messageTimeoutMs` (message-router.js:137-144). So at base
`floor(remaining) < floor(5000)` is true for every default delivery once >= 1 ms
has elapsed. Measured: witness leaf 1 (3 ms virtual elapse) red at base, and
the "failed cold dials should not stampede" leaf is a timing flake at base
(red in the implementer's base TAP at 4.41 ms, green in my base run at
1.65 ms) -- the base defect bites whenever a real millisecond ticks, which
the witness makes deterministic with a virtual clock.

## 3. Per-claim table

| # | Claim | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | New gate defers only below `TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS` (5) | TRUE | reconnect-behaviors.js:266-269; constant at control-plane/timeout-budget.js:16; same floor the owner applies in `createChildTimeoutBudget` (timeout-budget.js:127-133). My attack E: remaining 5 -> dials with budget 5; remaining 4 -> typed ROUTER_CONNECTION_CLOSED, no dial |
| 2 | `createDialGrant` gives all candidate dials one shared deadline | TRUE | :274-281 (one `createTimeoutBudget` per ensureNodeConnection, read before each candidate at :420). Attack A: grant 100, 40 ms per failed dial -> budgets 100/60/20; grant 50 -> budgets 50/10 and the third candidate is NOT dialled (remaining 0 < 5 -> break at :421-424) |
| 3 | `recordReconnectCandidateFailure` extracted | TRUE | :283-305; same suppress/metric/log body as the base loop (diff shows pure move); scoped complexity of the async arrow fell 17 -> 15 |
| 4 | `ensureNodeConnection(..., connectBudgetMs)` asks the gate before each dial, breaks when spent | TRUE | :344-349, :408, :420-424, :428-430 |
| 5 | `tryDeliverAfterReconnect` passes its remaining grant | TRUE | :496 (`timeoutMs = remainingDeliveryMs(options, timeoutMs)`), :508-512 |
| 6 | Dial owner forwards the budget; connect timer = min(ladder, grant); not stored on connectionInfo | TRUE | lifecycle-methods.js:293, :309-312, :339-343. Background redial (connection-close-reconnect.js:254) calls `establishConnection(connectionInfo)` with no budget -> `Number.POSITIVE_INFINITY` -> ladder `min(30000, connectTimeoutMs + attempts*5000)` intact. Attack C: connectTimeoutMs 200, grant 2000 -> a 200 ms connect timer armed, delivery typed at 202 ms |
| 7 | Delegation passes through | TRUE | delivery-delegation.js:207-208, :226-227 |
| 8 | `ROUTER_LOG_MSG.RECONNECT_BEFORE_DELIVERY_FAILED` replaces two inline literals | TRUE | constants/transport.js:290-291; used at reconnect-behaviors.js:293, :464 |
| 9 | delivery-behaviors unchanged, callers already pass the debited remainder | TRUE | not in the stat; :328-336 and :512-520 pass `remainingDeliveryMs(options, deliveryTimeoutMs)` |
| 10 | Witness: 4 leaves / 25 assertions, green at commit | TRUE | my 3 runs: `verify/witness-after-run1.tap` (4/4 leaves, leaf 4 returned at 300 ms, socket closed after 309 ms), run2/run3 "25 assertions" green |
| 11 | Witness red at base on leaves 1 and 4 only | TRUE | `verify/witness-base.tap`: leaf 1 red (not dialled; budget undefined), leaf 4 red (never dialled; closedAfterMs null); leaves 2, 3 green |
| 12 | message-router.test.js base -> after: named leaves green, none red | TRUE | my runs `verify/mr-base.tap` (432 ok / 20 not ok) vs `verify/mr-after.tap` (429 / 14); turned green = the 5 "recover a missing remote node connection from the node address resolver" leaves + chunk 1; turned red = none; red both = chunk 3 "test unfinished / child test left in queue" (the unref defect fixed by 6137cbcb7 on another branch). Counts differ from the implementer's 430/22 -> 429/14 only by the base-side flakes (stampede leaf, see sec. 2) |
| 13 | Deleted leaf asserted the d7f6d363f policy with a stub that ignored any bound | TRUE | routing-and-recovery.js diff: 25 ms grant, connectTimeoutMs 5000, stub `connectToNode` sleeps 5000 regardless, asserts `connectCalls === 0`. Ruling in sec. 4 |
| 14 | 20-file local set 18/20, both reds are base reds | TRUE | `verify/twenty-after.log`: reds = quarantine-liveness-guard and message-router.test.js (both red in implementer's suite-base.log; both the unref defect) |
| 15 | Lab 1010 files 902/108, no new red | CONSISTENT (not re-run by me) | lab-c6-2.log head names 9c88e93db; `comm` of base-reds vs lab-reds: the two extra reds are cdc-receiver-admission (red locally at base and after: two-base.log/two-after.log) and the foreground-boundary timeout (sec. 6) |
| 16 | Pre-commit hook passed | CONSISTENT | commit1.log shows the hook output; my own eslint + node --check green |

## 4. (A)/(B) analysis

### A. Gate and bound end to end (default options, 3 ms elapsed)

`deliver` (delivery-behaviors.js:143) -> `withDeliveryLifetime` creates the
lifetime with `requestedMs = messageTimeoutMs` (delivery-lifetime.js:54-56) ->
`deliveryTimeoutMs = remainingMs()` (:150) -> `resolveDeliveryOutcome` ->
`deliverRemote` -> `enqueueOutbound` callback finds no CONNECTED socket ->
`tryDeliverAfterReconnect(..., remainingDeliveryMs(options, deliveryTimeoutMs))`
(:328-336) -> inside, `timeoutMs = remainingDeliveryMs(options, timeoutMs)`
(reconnect-behaviors.js:496) = 4997 -> gate `4997 < 5` false (:497) ->
`ensureNodeConnection(target, addr, 4997)` (:508-512) -> `createDialGrant`
(:408) -> candidate 1: `remainingDialGrantMs()` ~4997, gate false ->
`connectToNode(target, addr, {connectBudgetMs: 4997})` (:428) ->
`establishConnection(connectionInfo, 4997)` (lifecycle:293) -> timer
`min(30000, 5000 + 0*5000, 4997) = 4997` (:339-343). Witness leaf 1 captures
exactly this budget (`<= messageTimeoutMs - 3`).

- Nothing else compares the remainder with `connectTimeoutMs`: `grep -rn
  connectTimeoutMs src/` -> only its definition (message-router.js:137-144) and
  the ladder `Math.min` (lifecycle:341). No test outside the witness references
  the gate or "shorter than connect budget".
- A <= 0 grant never reaches the gate: `remaining()` throws `spent()` when any
  limit or the floored grant is <= 0 (delivery-lifetime.js:103-107, :117-118);
  `withDeliveryLifetime` always injects a lifetime into the operation
  (:209-211), so :496 always reads the owner. Witness leaf 3 and attack A
  (spent loop) both surface `ROUTER_MESSAGE_TIMEOUT` + `deferRetry`.
- In-loop: `getRemainingBudgetMs` clamps at 0 (timeout-budget.js:64), so a
  spent dial grant reads 0 < 5 -> break. A non-finite budget (background path)
  returns `Infinity` -> `Number.isFinite` false -> never deferred (:267, :275).
- The 5 ms floor is the owner's (`MINIMUM_OPERATION_BUDGET_MS`, timeout-budget.js:16,
  consumed by `createChildTimeoutBudget` :127-133 and
  `resolveControlPlaneQueryTimeoutMs` :85-91); not a new constant.
- N addresses cannot spend more than the grant in total: attack A (sec. 7).
  Each candidate's bound is the remaining shared grant and the loop stops at
  the floor. A stub that ignores its bound can overrun (as my stub does on
  purpose); the real dial owner cannot, since the timer is the bound.
- Concurrent short/long grant: attack B. A (grant 300) and B (grant 5000)
  started 30 ms apart. Measured: ONE TCP accept; `ensureNodeConnection` was
  called once (by A, budget 300) -- B never reached it: B waited in the
  per-target outbound lane behind A and, when its turn came at ~300 ms,
  `buildReconnectInProgressFailure` saw the pending dial / armed owner and
  returned `ROUTER_CONNECTION_CLOSED`, `deferRetry: true`,
  `retryAfterMs = 1000 = reconnectIntervalMs`. After settling: one owner in
  RECONNECTING with one `reconnectTimeout`; no second dial. So the typed,
  retryable, non-duplicating claim holds. Cost: B lost its own dial
  opportunity (its 5000 ms grant was not used for a dial) and depends on the
  background redial or its caller's retry -- a latency degradation under this
  interleaving, not a correctness change (R12: slow, not broken). This
  queue/pending sharing predates C6; C6 only makes the first delivery's grant
  the pending dial's bound. Report-only finding F1.
- Escalation ladder with a larger grant: `connectToNode` always creates a
  connectionInfo with `reconnectAttempts: 0` (lifecycle:279), so the
  delivery-triggered dial is `min(connectTimeoutMs, grant)`; the ladder
  applies to the background redial which passes no budget (close-reconnect:254).
  Attack C measured the limit (200) winning over the grant (2000).
- In-process transport: `establishInProcessConnection` ignores the budget
  (lifecycle:313-315); it connects synchronously, so there is no timer to
  bound. Harmless; noted.

### B. History and the deleted leaf

d7f6d363f "Close reconnect delivery snapshot slice" (work package
`done-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md`)
introduced the comparison because a routed SQL read with a 3000 ms query
budget "waits behind repeated message-router reconnect attempts to a restarted
seed until the existing 3000ms query budget expires"; the protection was
"return typed ROUTER_CONNECTION_CLOSED promptly so read delivery falls through
to another live candidate inside the caller's query budget" -- not stampede
control (that is `OwnerRetryBudget`, :374-380) and not dangling dials. The
new design preserves the bound (the dial can no longer outlive the delivery
grant: attacks A/C, witness leaf 4) and the armed owner, and trades
"defer immediately when grant < connect limit" for "dial within the grant".
Where the restarted peer refuses TCP, the dial fails fast and the result is
still prompt; where it accepts and hangs, the delivery now spends its grant
on the dial instead of returning at once -- the lead's ruling accepts this.
The query executor's own fall-through is independent of the router gate: it
passes `timeoutMs: 1` to not-connected candidates
(`query-executor-partition-attempt-budget.js:12-16, :253-259`) and the 5 ms
floor keeps that a no-dial deferral (see F3); its tests stub `deliver`
(query-executor-routable-services-and-read-delivery.test.js:624-726, 854-939)
and are green at the commit (128 assertions).

**Ruling on the deleted leaf: justified.** regression-policy.md:380-384 reserves
deletion for behaviour intentionally removed; the lead's ruling removes the
"25 ms grant -> no dial" policy. Its remaining properties are re-witnessed:
prompt typed return and armed owner for a real short-grant dial (witness leaf
4, 300 ms grant against a real black-hole socket), typed no-dial deferral for a
spent grant (leaf 2), second delivery reusing the armed owner / one owner
(stampede leaf, now deterministic via leaf 1's virtual clock). A rewrite in
place was not possible without replacing the stub (it ignored any bound);
the witness file is the rewrite.

## 5. Findings (report-only, none blocking)

- **F1 (design, pre-existing structure, R12).** A short-grant delivery's dial
  becomes the bound of the shared pending dial, and a concurrent longer-grant
  delivery is deferred typed instead of dialling with its own grant
  (measured in attack B: B returned at 270 ms of its 5000 ms grant with
  `retryAfterMs 1000`). Correct and non-duplicating; a latency cost under one
  interleaving. If it matters, the owner could let a joiner with a longer
  remaining grant extend the shared dial's deadline (one dial, max of grants).
- **F2 (R03, minor).** `shouldDeferColdReconnectForDeliveryBudget` restates the
  owner's floor comparison (`remainingMs < MINIMUM_OPERATION_BUDGET_MS`) and
  `createDialGrant` re-derives a child budget, while the owner already offers
  `createChildTimeoutBudget(parent, {requestedBudgetMs}).allowed/grantedBudgetMs`
  (timeout-budget.js:121-158). Consuming it would make the F1 contract
  ("child grant = min(parent remaining, local limit), refused below the
  floor") one call instead of a comparison plus a `Math.min` in two files.
- **F3 (R02, outside C6 scope, route to the query owner).** The query executor
  encodes "cut a not-connected candidate" as a 1 ms delivery grant
  (`query-executor-partition-attempt-budget.js:12-16`), relying on the router
  deferring without a dial below 5 ms. That interaction is implicit (a magic
  1 ms against a floor it does not import). Pre-existing; the 5 ms floor keeps
  it working.
- **F4 (one-version, as briefed).** `LOG_PRESSURE_MESSAGE_FRAGMENT.FAILED_TO_RECONNECT_TARGET_NODE_BEFORE_DELIVERY`
  (`src/logging/logs-table-service-constants.js:84, :102-103`) duplicates the
  text of `ROUTER_LOG_MSG.RECONNECT_BEFORE_DELIVERY_FAILED`
  (constants/transport.js:290-291), consumed by the pressure-family classifier
  (`logs-table-service-pressure-helpers.js:235-243`); the same block also
  copies `RECONNECTION_FAILED`, `WEBSOCKET_ERROR`, `NO_CONNECTION`,
  `MESSAGE_TIMEOUT`. The classifier should import the router's constants (or
  the router should log a typed event the classifier keys on). C6 made the
  router side one-version; the logging copy remains.
- **F5 (timers, as briefed).** The WebSocket connect timer in
  `establishConnection` is unref'd (lifecycle:358-363); 6137cbcb7's census on
  the other branch already rules it "correctly unref'd". Judged against
  "owned-obligation timers are ref'd, advisory ones unref'd": the owned
  obligation is the delivery deadline (the lifetime timer; on THIS branch it
  is still unref'd at delivery-lifetime.js:92 until 6137cbcb7 merges); the
  connect timer is advisory to it, and the connecting TCP socket is a ref'd
  handle for the dial's whole life. Measured (`verify/liveness-A.log`,
  `verify/liveness-B.log`): a child process holding only a router and one cold
  dial to a black-hole server received the typed refusal at 301 ms (grant 300,
  ROUTER_MESSAGE_TIMEOUT) and at 207 ms (connectTimeoutMs 200 < grant 2000,
  ROUTER_CONNECTION_CLOSED) and exited 0 -- no early exit. Consistent with
  the rule; no change needed.
- **F6 (generated metadata, R05/R16).** The commit's shard refresh added 15
  test files that predecessor WIP commits had left unclassified
  (`audit:shards` is RED at base bed8c6354: "primary classification: 15
  problem(s)"; green at the commit; `test:metadata:refresh` at the commit =
  zero drift). Correct per the generator; the commit therefore carries
  metadata for files outside C6's declared scope. Record it in the landing
  message rather than treat it as C6 scope.
- **F7 (pre-existing, not C6).** The test duplication ratchet is red
  identically at base and at the commit (`[test] 701 clone groups / 26618
  lines vs baseline 697 / 26369`); C6 adds no clone group
  (`verify/dup-verify-c6-base-20261024.log` vs `...-after-...log`).
- **F8 (process).** Several timing-sensitive leaves in this file set assert
  with the real clock (stampede leaf, 1234 leaf); the witness correctly uses
  `VirtualTimeSource` for the gate and a real socket only where the connect
  timer itself is the subject.

## 6. (D) Classifications

- **Query-transport timeout-inheritance leaf** (routing-and-recovery.js:449-497,
  asserts `transportDeliveryOptions.timeoutMs === 1234`). Unrelated to the
  gate: the path is the query data-plane send
  (`resolveDeliveryOutcome` -> `resolveQueryTransportDeliveryOutcome`), no
  reconnect. Root cause: `deliver` reads the DEBITED remainder
  `deliveryTimeoutMs = options.deliveryLifetime.remainingMs()`
  (delivery-behaviors.js:150) and forwards it as `timeoutMs`
  (:177-181); `buildQueryTransportSendOptions` floors it
  (pressure-routing.js:250-256). Whenever one real millisecond ticks between
  lifetime creation and :150, the value is 1233. Since 681da1dc1. Green in
  both my runs (fast path); flaky by construction. Fix belongs to C2's file:
  assert `<= 1234 && >= 1234 - slack`, or drive the router with a
  `VirtualTimeSource`.
- **Lab-only foreground-boundary red**
  (`test/topology/cdc-group-propagation-foreground-boundary.test.js`). Lab
  detail: subtest 5 "durable foreground attempt exhaustion retains source debt
  and source continuation" failed at `duration_ms: 2039` against the file's
  fixed node:test budget `TEST_TIMEOUT_MS = 2000` (:28, :213) on tv-dator
  (banner "speed x1.43"); the other 7 subtests passed. Locally green 3/3 at
  the commit (1627-2024 ms whole file; `verify/fg-boundary-{1,2,3}.log`) and
  green at base and after in the implementer's two-file runs. The test does
  not import transport reconnect code (imports at :7-23). Classification:
  fixed test budget vs host speed variance; not C6.

## 7. What I ran (all at the stated head, logs under `.../scratchpad/c6/verify/`)

| Run | Head | Result | Log |
| --- | --- | --- | --- |
| Thermal gate before each heavy run | -- | ok (cpu 46-66C, nvme 68C) | inline |
| Witness x3 | 9c88e93db | 3/3 green, 25 assertions; leaf 4 at 300 ms / closed 309 ms | `witness-after-run1.tap`, `witness-after-run2.log`, `witness-after-run3.log` |
| Witness at base (file copied into the base scratch tree, then removed) | bed8c6354 | leaves 1 and 4 red, 2 and 3 green | `witness-base.tap` |
| message-router.test.js | bed8c6354 / 9c88e93db | 432/20 -> 429/14 leaves; turned red: none | `mr-base.tap`, `mr-after.tap`, `mr-leaf-compare.txt` |
| 20-file set (`files.txt`) | 9c88e93db | 18/20; reds = quarantine-liveness-guard, message-router.test.js (unref defect, base reds) | `twenty-after.log` |
| Verifier attack probes A/E/B/C | 9c88e93db | all green (r2; r1 failed only on my own too-early owner-state read) | `attacks-after.tap`, `attacks-after-r2.tap` |
| Idle-process liveness probes | 9c88e93db | typed refusal at 301 ms / 207 ms, exit 0 | `liveness-A.log`, `liveness-B.log`, `liveness-{parent,child}.mjs` |
| `node --check` + eslint on the 6 changed JS files | 9c88e93db | clean | inline |
| `check-complexity.js --scoped` (4 src files) | both | 4 violations both; the loop arrow 17 -> 15; nothing worsened | inline |
| `npm run test:cycles` | 9c88e93db | 0/0 cycle groups | inline |
| `npm run audit:shards` | bed8c6354 / 9c88e93db | RED (15 unclassified) / green | inline |
| `npm run test:metadata:refresh` + `git status --porcelain` | 9c88e93db | zero drift | inline |
| `npm run test:duplication` | both | identical red (test ratchet 701/26618 vs 697/26369), src+scripts OK | `dup-verify-c6-*.log` |
| foreground-boundary x3 | 9c88e93db | 3/3 green | `fg-boundary-{1,2,3}.log` |

## 8. Limits and unknowns

- I did not re-run the 1010-file lab cone; I checked the lab log's head,
  the file-level results of the relevant files, and the red-list difference.
- Attack B measured one interleaving (B started 30 ms after A). A B that
  reaches `ensureNodeConnection` while A's dial is pending would join the
  pending promise (reconnect-behaviors.js:357-359) and receive `null` ->
  `buildReconnectInProgressFailure` -> the same typed deferral; traced, not
  measured.
- The escalation ladder on the background redial path is code-traced
  (close-reconnect.js:254 passes no budget), not measured.
- Verification of the lifetime unref'd-vs-ref'd rule is against the rule text
  quoted in the brief and 6137cbcb7's message (another branch); the rule is
  not yet recorded in this tree.
- Scratch worktrees `verify-c6-after-20261024` and `verify-c6-base-20261024`
  were removed and pruned after this report was written (implementer worktree
  and primary checkout both still clean, 0 status lines). The verifier attack
  probe source is preserved at
  `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/c6/verify/zz-verify-c6-attacks.test.js`
  (it ran from `test/transport/` of the after scratch tree; not part of the commit).
