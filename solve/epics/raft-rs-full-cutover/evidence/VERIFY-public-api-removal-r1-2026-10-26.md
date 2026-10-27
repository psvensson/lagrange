---
audience: development
documentClass: evidence
---

# VERIFY: public-API removal unit, round 1 (2026-10-26)

## Verdict: REQUIRED CHANGES (exact, small). Keeping c5c8267cf as the base for them is fine.

The removal is correct. The census holds for every removed family, nothing supported is lost, and the
package root lost exactly the 20 symbols the CHANGELOG names. The inline-ACK keep is justified: I
reproduced it, and the census was wrong about it. Two things block approval:

- **RC-1 (witness loss).** The kept inline-ACK branch is live, but this commit deleted its only two
  witnesses. At head nothing tests it at all.
- **RC-2 (ratchet).** The src+scripts duplication baseline now prints a tightening hint that the commit
  left untightened.

One minor item, RC-3, is the second hand copy of the remote-answer shape.

## Identity

- Commit `c5c8267cfd3947daacbc9c338601879f94145944` = `refs/wip/lab-api-1`, parent `a51f49929`, tree
  `e6d56d46b27abc65daca845b3d9799b6c87b605f`. 72 files, +456/−14,961. The implementer worktree is
  clean at that HEAD.
- Lineage head fetched: `work/mg-delivery-resume-r2-20261023` = `13a173e4c`. It is 21 commits ahead
  of `a51f49929`, and `a51f49929` is its ancestor.

## Required changes

**RC-1. Commit a router-level witness of the coalesced completion.**

- **What is unwitnessed.** The branch `message-router-delivery-behaviors.js:439-445`
  (`hasInlineAckPayload` → `RETIRED_PENDING_RESPONSE_REASON.INLINE_ACK`) is the only thing that
  completes a superseded delivery.
- **Where it was witnessed at base.** Two places: `message-router-delivery-deadline-liveness.test.js`
  MODE.INLINE_ACK, and the C2 round-trip INLINE_ACK lane. I deleted the branch on the base tree and
  both went red: deadline-liveness 3 fails ("the inline ACK settles the delivery"), C2 round-trip
  every INLINE_ACK case.
- **What it looks like at head.** This commit removed both lanes. With the branch deleted on head,
  all 148 files of the transport/node/public-api/edited scope and all 41 files that mention
  `replacedPending|replacePendingKey|heartbeat_only|coalesced` show the same per-file results and the
  same red leaves as with the branch present. The kept production path therefore has zero witnesses.
- **Why the queue-level tests do not count.** `message-router-tail-test-cases.js:43-90` and
  `message-router-critical-source-rotation-and-classification.js:671` go through `enqueueOutbound`
  and never reach `completeRemoteDelivery`.
- **Exact fix.** Turn `scratchpad/api1/coalesce-witness.mjs` into a test in an existing router
  transport file (for example `message-router-transport-cleanup.test.js` or the tail cases). It must
  drive `router.deliver` with three critical heartbeat `NODE_STATE_UPDATE`s and the first send held.
  It asserts:
  - the superseded delivery resolves `{acknowledged: true, replacedPending: true}` well before
    `messageTimeoutMs`;
  - `errorCode` is null.

  Keep the witness's `ws` stub shutdown-safe: its fake `ws` lacks `once`, so `router.shutdown()`
  throws at `message-router-stats-shutdown.js:214`. Q6 later changes this assertion into the named
  coalesced outcome.

**RC-2. Tighten the src+scripts duplication baseline on the hint.**

- **The numbers.** Base is `46/46, 1439/1439`. Head is `44/46, 1383/1439` and prints "Baseline can be
  tightened from 46 to 44 … from 1439 to 1383". The 12 deleted src files caused this.
- **What the commit did.** It tightened only the `[test]` baseline (679/25717 → 658/24752). The hint
  persists on the dry-run merge with the lineage head.
- **Exact fix.** In `scripts/check-duplication.js`, set the src+scripts clone baseline 46 → 44 and the
  duplicated-line baseline 1439 → 1383.

**RC-3 (minor, same commit). Use the one remote-answer helper in deadline-liveness.**

- **The problem.** `message-router-delivery-deadline-liveness.test.js:65-76` hand-writes the plain ACK
  and the SERVICE_RESPONSE with literal `'ACK'` / `'SERVICE_RESPONSE'`. That is a second copy of the
  shape the new helper owns (`test/guidelines/fixtures.md` §"Test Doubles Consume the Owner" rule 1:
  "add exactly one fixture and use it everywhere").
- **Fix.** The child program already imports test helpers through `moduleUrl(...)`. Import
  `acknowledgeThenRespondFrames` from `test/test-helpers/message-router-remote-answer.js` and dispatch
  its frames to `handleAcknowledgment` / `handleServiceResponse`.

## Per-claim table

| # | Claim | Verdict | Evidence |
| --- | --- | --- | --- |
| A1 | WebSocketTransport (+ConnectionState), WebSocketTransportProvider (+WS_PROVIDER_*), TransportProvider, TransportRegistry (+REGISTRY_*), ConnectionPool (+POOL_*) had no production construction or import at base | VERIFIED | Base grep for module specifiers across src/scripts/package.json: the only importers are each other, `src/transport/index.js`, and string constants (`constants/subsystems.js`, `constants/transport.js`). Symbol grep outside the families finds only log strings `constants/transport.js:296,339,365`, the README and a comment. `src/public-api.js:19,23` is the only barrel consumer. No `bin/` directory exists. `package.json` bin is `src/sea-entry.js` and `src/cli/bin/lagrange-admin.js`, and neither reaches the families. |
| A2 | RouterMessageHandler imported by no src module | VERIFIED | Base grep for `router-message-handler` in src/scripts: no hit. |
| A3 | ReplicaLifecycleManager has no production constructor and is a pure delegator; nothing delivers to `/lifecycle/manager` | VERIFIED | `new ReplicaLifecycleManager` appears only in tests at base. RLM never registers an address itself (`replica-lifecycle-manager.js:184-196` comment: "handlers are now registered via transport"). src has no `lifecycle/manager` string. Production replica traffic goes to `${node}/service/replica-handler` (`replica-handler-constants.js:33-36`). Recovery delegated to `ReplicaStateMachine.handleNodeRecovery` (`replica-lifecycle-recovery.js:18-42`). Docs/README/architecture/examples: no promise except the line the commit corrected in `architecture/control-plane.md:336`. The remaining `/lifecycle/manager` strings are in three tests that register their own handler at that address on a real router (`websocket-create-replica-ack`, `bidirectional-websocket`). |
| A4 | No supported capability lost; lagrange-images unaffected | VERIFIED | lagrange-images at `a39d670` has no occurrence of any removed symbol and imports only `createEmbeddedLagrange` (`fixtures/real-lagrange-m6-shared-server-process.js:4`). The release consumer contract stays green in the pack import. The README now names `InProcWebSocket`, which exists (`src/transport/inproc-transport.js:56`). |
| B1 | The inline-ACK branch is LIVE through the coalesce path | VERIFIED (reproduced) | `coalesce-witness.mjs` results. **base:** `secondMs 1, acknowledged true, replacedPending true, sendCalls 2`. **head:** same (2 ms). **head with branch :439-445 deleted:** `secondMs 1502, acknowledged false, ROUTER_MESSAGE_TIMEOUT` (log `verify-coalesce.log`). Mechanism: `outbound-delivery-registry.js:388-391` resolves the replaced item with `buildSupersededPendingResult` (`outbound-queue-admission.js:176-186`). That value becomes `ackResult` (`delivery-behaviors.js:380-383`). Its extra keys `coalesced/replacedPending/deliverySource` are not in `INLINE_ACK_PASSTHROUGH_KEYS` (`shared-vocabulary.js:249-254`), so `hasInlineAckPayload` (`pending-response-ledger.js:484-495`) is true. |
| B2 | Keeping it leaves no dangling constant or import | VERIFIED | Router src is byte-identical between base and head. Every INLINE_ACK symbol keeps its consumer: `.INLINE_ACK` → `outbound-queue-admission.js:74-75`; `STRING_LATE_AFTER_INLINE_ACK` → same; the `INLINE_ACK_*` re-export at `connection-authority.js:573-574` is pre-existing and unchanged, inside the 1412 unused-export count. |
| B3 | "The census was wrong" | AGREE | Census §2.1 row "Inline-ACK consumer" concluded the branch speaks only to the legacy stack, because router peers send plain ACKs. That is true of wire peers. It missed the in-process producer, the outbound queue's superseded result. D2 step 3 ("delete the router inline-ACK consumer") would have turned every superseded delivery into a full-deadline ROUTER_MESSAGE_TIMEOUT. |
| B4 | Replacement belongs to Q6 (named coalesced outcome) | AGREE, scope wider than stated | Q6 (owner decision 6: one `{transport, answer}` shape) is the right owner. The implementer frames it as heartbeats only, but explicit `replacePendingKey` producers also reach this path: priority control-plane transaction deliveries (`query/sql-query-engine.js:91,474` → `query-executor-partition-attempt-budget.js:316-320`) and CDC critical/standard visibility propagation (`cache/cdc-propagation-delivery-profile.js:209,218`). No src consumer reads `coalesced`/`replacedPending`, so a superseded query/CDC delivery reaches its caller as a bare `acknowledged: true`. That is an R07 risk for Q6 to decide, not for this unit. |
| C1 | Edited tests keep every live property witnessed | VERIFIED except RC-1 | See the dropped-halves list below. |
| C2 | ACK-before-handler and correlation properties run on the real router | VERIFIED | `immediate-ack-ordering.property.test.js` and `service-response-correlation.property.test.js` build `new MessageRouter(...)`, `register(...)`, capture only `sendRaw`, and call the router's own `handleServiceMessage` (`message-router-inbound-dispatch.js:426-496`: ACK `:435-439` before handler `:468-470`). Both green (5 and 7 assertions). |
| C3 | Ported recovery guard-miss case is equivalent | VERIFIED (stronger) | The original (base `replica-lifecycle-manager.test.js:531-595`) asserted no cleanup and the exact-generation whereClause through the RLM delegator. The port (`fault-recovery-behavior.property.test.js:491-552`) drives `ReplicaStateMachine.handleNodeRecovery` directly, the owner RLM delegated to. It asserts no delete, the identical whereClause, and additionally `syncingToFailed === 0`. Green (19 → 23 assertions). The RLM-only "rowless storage" and "sweep" recovery tests witnessed properties of the deleted delegator (no second quarantine authority), which are now vacuous. |
| C4 | New helper is one owner-consuming helper | VERIFIED with note | `acknowledgeThenRespond` consumes the real `router.handleServiceResponse`. `acknowledgeThenRespondFrames` restates the two wire frames, but the router has no exported frame builder (the frames are inline at `inbound-dispatch.js:435-439,476-481`), so one helper is what `fixtures.md` rule 1 requires. Note: the helper's SERVICE_RESPONSE omits `sourceAddress`, which the producer sends. Harmless for the consumers. It belongs in the doubles Quest, and if a router frame builder is added later the helper should consume it. RC-3 covers the one second copy. |
| C5 | C2 witness remaining lanes cover owner semantics 1-4 | PARTIAL | LOCAL and SERVICE_RESPONSE lanes plus the idempotence and unit-anchor tests are green (105 → 78). Semantic 1 (stable repeated normalization) keeps `normalizeDeliveryOutcome` idempotence on all 27 cases and the two real-path lanes. Semantics 2-4 never depended on the INLINE_ACK lane. **Now unwitnessed:** the "actual inline-ACK path", meaning a delivered outcome that bypasses SERVICE_RESPONSE and is normalized from the ACK. The legacy `{result}` ACK shape is genuinely retired, so losing that shape does not matter. The same branch still carries the live coalesced shape, so it matters until Q6 replaces the heuristic. Hence RC-1. After Q6 the named outcome needs its own witness and the heuristic its deletion. |
| C6 | Doubles that answered through the ACK now answer plain ACK then SERVICE_RESPONSE | VERIFIED | tail-final ×7, routing-and-recovery, cold-reconnect, CDC fixture and encoding all use the helper; all green, counts unchanged. `transport-cleanup.test.js:186` now returns `{acknowledged: false}` from a stubbed `enqueueOutbound`; the test asserts only option forwarding, so the change is acceptable. |
| D1 | Pack: PACKAGE_VERIFIED 1,982 entries | VERIFIED | My `npm run -s package:npm` printed `PACKAGE_VERIFIED`; the tarball holds 1,982 entries and none of the 12 deleted files. |
| D2 | Tarball import: 322 exports, none of the 20 removed, supported present | VERIFIED | Scratch consumer with the extracted tarball: `{"count":322,"removedPresent":[],"keptMissing":[]}`. Kept set checked: createEmbeddedLagrange, VERSION, ApplicationDatabaseError, MessageRouter, RouterConnectionState, RouterMessageType, RPCClient, ReplicaStateMachine, ReplicaHandler. Source-tree export diff base → head: exactly 20 removed, 0 added. |
| D3 | No bin/docs/examples reference removed symbols; CHANGELOG complete | VERIFIED | Whole-tree grep at head (excluding solve/, node_modules): hits only in CHANGELOG, historical `handover/`, comments, and the `check-duplication.js` comment. The CHANGELOG `### Removed` lists all 20 and the unexported RouterMessageHandler. |
| E1 | Tests before/after | VERIFIED | Base 167 files: 156 ok, 11 red. Head 148 files: 139 ok, 9 red. Every head red is identical in leaf to base. Of the two base-only reds: `message-router.test.js` is a timing flake ("inherit timeoutMs" 1234 vs 1233; it recurred on the nobranch run too). `cross-node-replica-placement` was red only in the deleted RLM subtest ("second call should return already_exists"). No file loaded with 0 assertions. The lab 53 base/head leaf sets in `base-leaves.json`/`head-leaves.json` are identical (my comparison). |
| E2 | eslint / node --check | VERIFIED | 28 added or modified JS files: `node --check` clean; eslint 0 errors (1 ignore-pattern warning). |
| E3 | Ratchets | MIXED | Unused 1412/1412 OK; the 1413 → 1412 hint already existed at base, so this tightening was pre-existing slack. Test duplication 658/24752 exact. **src+scripts duplication hint not applied (RC-2).** Cycles 0/0. File-size exit 0 (one pre-existing listing). Silent-catch matched baseline 90 → 83; the one live violation `raft-rs-membership-transition-runtime.js` is red at base too. `test:unused` exit 1 on the same two pre-existing child files at base. |
| E4 | Impact contracts: same 6 dead paths as base | VERIFIED | The 6 `cdc-source-native-delivery` dead paths are identical at base and head (fixed on the lineage head, per brief). |
| E5 | Metadata zero drift | VERIFIED | `test:metadata:refresh` and `generate-global-owner-debt-inventory.js --refresh` on head leave `git status` clean. |
| E6 | Hook replay | VERIFIED | Cherry-pick -n onto base, run `.githooks/pre-commit` (exit 0, inventory regen included): the staged tree equals c5c8267cf's tree `e6d56d46…`. |
| E7 | Dry-run merge with lineage `13a173e4c` | ONE TRIVIAL CONFLICT | The only conflict is a comment in `scripts/check-unused-exports.js:52`: both sides set 1412, and the lineage adds the "fresh-seed-activation C1-C4" line. Keep both comments; the merged tree measures 1412/1412. Shard/inventory JSON auto-merged by the merge driver, which says the merged tree owes `test:metadata:refresh` + owner-debt regen. The expected conflicts in the C2 witness and transport tests did not occur: the lineage touched no `src/transport`, `test/transport`, barrel or public-api file, and nothing on it imports a deleted module. |

## Dropped halves of edited tests, and what still covers each

- `exact-handler-identity-api.test.js`: WebSocketTransport half dropped (36 → 19). The MessageRouter
  half remains and is the production transport.
- `endpoint-incarnation-authority.test.js`: `TransportRegistry.getEndpointsForNode` assertions dropped
  (25 → 23). `resolveNodeWebSocketAddressResult` assertions remain beside them; that is the production
  address owner the census named.
- `replica-state-delegation.test.js`: RLM `pendingOperations` case dropped (13 → 10). The ReplicaHandler
  map/set checks remain.
- `message-router-late-response-classification.test.js`: RouterMessageHandler adapter case dropped
  (11 → 8). The router's own late-response and disposition tests remain.
- `cross-node-replica-placement`: RLM wiring and the RLM idempotency subtest dropped (already red at
  base). The other three subtests remain unchanged. CREATE_REPLICA idempotence on the real owner is in
  `replica-handler.test.js` ("returns already_exists for active replica"). Caveat: that file is red at
  base and head ("child test left in queue"), so the property's live witness is currently red for an
  unrelated cause.
- `websocket-create-replica-ack`: the RLM "async lifecycle handler returns ACK" subtest dropped
  (21 → 10). "Flat ACK structure is preserved through WebSocket" still drives an async handler over
  real routers and asserts resolved fields. The red "timeout" leaf is identical at base.
- `code-path-uniqueness`, `replica-lifecycle-durable-generation`, `committed-membership-census`,
  `critical-placement-trace-classifier`: deleted paths removed from source lists. The two red files
  have the same failing leaves and diffs at base. `REPLICA_APPEARED` now maps to
  `replica-handler-create-methods.js`, the production create owner.
- `deadline-liveness`: INLINE_ACK mode replaced by ACK_AND_RESPONSE. The timer-disposal property is
  still witnessed; the inline completion is not (RC-1).
- C2 round-trip: see C5.

## Other findings (not blocking, for their owners)

- **F1 (Q6).** The coalesced path covers query and CDC deliveries, not only heartbeats (B4). Q6 should
  migrate all three `replacePendingKey` producers and decide what a superseded control-plane
  transaction or CDC delivery returns to its caller.
- **F2 (transport, follow-up).** `ENTITY_TYPE.LIFECYCLE` stays in `ROUTER_VALID_ENTITY_TYPES` /
  `ROUTER_EXPECTED_ENTITY_TYPES` (`constants/transport.js:176-191`), but production now registers no
  `/lifecycle/...` handler. Only tests use it. It is a candidate for removal under "one version".
- **F3 (pre-existing).** `PartitionService.deliverWithAck` has no caller in src (its own constant at
  `partition-service-constants.js:669` already says so). Out of scope.
- **F4.** The kept code is still documented as legacy: `hasInlineAckPayload` JSDoc says "legacy inline
  handler payload" and the reason lives under `RETIRED_PENDING_RESPONSE_REASON`. Q6 should rename or
  replace it.

## What I ran (logs under `scratchpad/api1/v/`)

- **Scratch worktrees** (all removed at the end), node_modules symlinked from the primary: `base`
  (a51f49929), `head` (c5c8267cf), `nobranch` (head with `:439-445` deleted), `merge` (13a173e4c plus
  `merge --no-commit c5c8267cf`, aborted), `replay`.
- **Coalesce witness**, base/head/nobranch: `verify-coalesce.log`.
- **Scoped tests:** `run-base.log`, `run-head.log`, `run-nobranch.log`, summaries `*-sum.txt`; file
  lists `base-files.txt`, `head-files.txt`.
- **Coalesce scope** (41 files), head vs nobranch: `run-coalesce-{head,nobranch}.log`,
  `leaves-*.txt`.
- **Base with the branch deleted** (deadline-liveness + C2): `run-base-nobranch.log`.
- **Ratchets:** `ratchets-base.log`, `ratchets-head.log`.
- **Impact contracts:** `ic-base.log`, `ic-head.log`.
- **Metadata:** `meta.log`, `owner-debt.log`.
- **Pack:** `pack-head.log`; export diff `exports-{base,head}.txt`.
- **Hook replay:** `hook.log` (first run timed out at 580 s during inventory regen), `hook2.log`.
- **Merge:** `merge.log`.
- **eslint:** `eslint.log`.
- Thermal gate run before every heavy step (54-74 °C); runs were serial.

## Limits

- I did not rerun the lab corpus. The 53-file comparison relies on the implementer's leaf JSON, which
  I diffed but did not regenerate.
- I did not run the base pack, so the 1,994 base count is the implementer's figure. The 12 missing
  entries match the 12 deleted src files.
- External consumers other than lagrange-images remain unknown, as the census already recorded.
- The `message-router.test.js` timeout flake (1233 vs 1234 ms) was seen on base and nobranch, not on
  head. It is timing, not this change.
