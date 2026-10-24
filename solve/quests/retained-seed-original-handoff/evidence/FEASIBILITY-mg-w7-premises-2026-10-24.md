---
audience: development
documentClass: evidence
---

# W7 feasibility: S1/S2/S3 premises and production readiness

Read-only investigation. Worktree `/mnt/data/peter/projects/.worktrees/mg-delivery-resume-r2-20261023`,
branch `work/mg-delivery-resume-r2-20261023`, HEAD `bed8c6354` (doc-only child of source checkpoint
`947107b63`). `src/partition/partition-cdc-obligation-delivery.js` SHA256 `e75b6327...b53e5b` and
`src/topology/cdc-group-propagation-foreground-retry.js` SHA256 `664f0d4e...dd6712` match the R2
handover table. Pre-existing uncommitted change in the worktree, not made by me: `M test/shards/impact-graph-seal.json`.
No file in the repository was edited and nothing was executed beyond reads/greps. All line numbers below are at this HEAD.

## Verdict (short)

- **Production features W7 needs: present on this branch** (progress cell, weak coverage aggregation,
  fair subscriber + leaf cursors, DRIVE.PROVISIONAL scan release, one-payload hydration, foreground retry
  owner, one-wave topology admission, F3 native-first ingress order and terminal NATIVE_COMMIT forward).
  Exception: there is **no concurrent dispatch window**; topology dispatch is **serial** (one in-flight
  target per wave), which satisfies "no larger than `outboundQueueMaxConcurrent`" but means the
  "window of 2" is only a router-level setting that is engaged only on **remote** (cross-router) delivery.
- **S1: FEASIBLE as-is**, already repaired in the custody test (sessionless `executeQuery`), but unmeasured
  on this candidate.
- **S2: FEASIBLE with the existing (unmeasured) fixture for one target group and one subscriber.**
  W7 needs a **fixture change**: parameterize the provisional-route fixture over N>=3 target groups and
  N B-rows, and split it across two routers. No owner refusal was found in code; the premise has never
  been executed ("no corrected run"), so a runtime owner refusal is still possible (see risks).
- **S3: NOT met by any existing MG fixture.** Both MG native fixtures use one router with
  `startServer:false`; same-node delivery goes to `deliverLocal` and never touches outbound queues,
  serialization, pending-response ledger or the pressure governor. Two-router patterns exist only in
  transport/learner/integration tests.
- **Sequencing caveat:** the R2 handover orders W7 *after* C1/C2 corrections and the focused candidate
  measurement (HANDOVER-2026-10-24-r2-preservation.md:325-351). W7 traverses the exact C1 receiver
  forwarding branch, and its remote wrong-group negative depends on C2. W7 can be *authored* on current
  production but its acceptance would be measured against known-defective C1/C2 code.

---

## 1. S1: legitimately released ordinary source

### Fixture inventory (lines moved since the plan)

- `formAdmittedGroup` moved out of the custody test into
  `test/partition/partition-admitted-group-fixture.js:42-142` (imported at
  `test/message-group/message-group-native-custody-handoff.test.js:37`). It forms a real
  RF-N `PartitionService` group over a **loopback transport** (`createLoopbackTransport`, :17,:53);
  leader is the lone first replica (:109-113), others are admitted through the leader's SERVICES-cache
  reconcile (:114-128). Addresses are `${nodeId}/partition/${replicaId}` (:46-47). Uses `Date.now`
  polling (`waitFor`, :57-66).
- `attachPartitionReleaseOwners`: `test/partition/partition-release-fixture.js:29-144`. Hosts every
  replica through real `ReplicaHandler`s (:36-49), creates a native `sql_transactions` control
  `PartitionService` and campaigns it to leader (:50-58, :92-96), then `release()` calls
  `handler.participantReleaseRecovery.releaseOperator` with measured build provenance and a deadline
  (:109-125), retrying on `retryAfterMs` until `CUT_OVER` or deadline (:127-140). It supplies no OPEN
  flag/census/generation (header :1-3). Exposes `control` (:143).
- The custody test uses them at `message-group-native-custody-handoff.test.js:60-95`
  (`producerFixture`), asserting `CUT_OVER`, native leader and RF3 voters (:88-92).

### The hybrid INSERT is already gone

`writeSource` (`message-group-native-custody-handoff.test.js:107-151`) now calls
`producer.leader.executeQuery(WRITE_SQL, WRITE_PARAMS, {entryId})` (:110) with **zero subscribers**
(:108), waits for one owed obligation on every source replica (:112-114), and asserts: SETTLED/APPLIED
statement outcome (:117-118), canonical row (:119-120), identical debt on every replica (:122),
debt logIndex/term = outcome (:123-124), retained native entry with `type: QUERY`, entryId, sql, params
(:126-135), event table/op/sourcePartition/sourceReplica/data (:136-141), event timestamp ==
command timestamp == `data.updated_at_hlc` (:142-145), commit/applied >= debt index (:146-147).
The provisional-route test has the same pattern for SERVICES (`message-group-native-provisional-route.test.js:54-98`).

### Production path (verified)

- `executeQuery` builds `{type: QUERY, sql, params, entryId, ...}`
  (`src/partition/partition-service-write-metrics-base.js:60-78`), statement admission (:96-99),
  write → `proposeWrite` (:130). `proposeWrite` takes the service HLC `this.hlcClock.now()` (:418) and
  `buildPartitionWriteEntry(operation, {timestamp, proposedBy, proposedAt})` (:420-424), then
  `applyWrite` on the leader (:428-430).
- Debt creation: `partition-service-entry-apply-base.js:656` calls `recordCommittedStatementCdc`
  (`src/partition/partition-cdc-obligation.js:123-135`) → `recordCommittedOperationCdc` (:146-160)
  which `insertCdcObligation(service.db, event)` (:151) in the application transaction and schedules
  delivery in `afterCommit` (:155-).
- Release admission starts CLOSED: `newPause` creates `{state: ADMISSION.CLOSED, ...}`
  (`src/partition/partition-participant-transaction-pause.js:193-198`); `participantReleaseAdmissionOf`
  defaults to it (:201-203); `participantCutoverPauseOf` invalidates then answers the CLOSED admission
  (:210-216); `invalidateParticipantReleaseAdmission` re-closes on any status/proof mismatch (:226-233,
  proof fields :217-224). OPEN is only set by `resumeParticipantCutoverAdmission` (:252-281) after
  lifecycle checks, `readParticipantReleaseFacts`, `releaseCensusDefect` and a final no-await status
  match (:275-280). `pausedWriteAnswerOf` returns `WRITE_CUTOVER_PAUSED`, `deferRetry:true` (:283-289);
  `startAdmittedPartitionWrite` refuses with it first (`partition-service-raft-write-commit.js:441-447`).
- CUT_OVER requires (from `src/node/replica-handler-release-recovery.js:273-282`): a future
  `deadlineAtMs` (else throws `OPERATOR_DEADLINE`), `participantReleaseAuthorizationOwner.authorizeOperator`
  (`src/node/participant-release-authorization-owner.js:35`) bound to the measured `targetBuildDigest`,
  then `requestParticipantRelease`. Build provenance must be `measured`
  (`src/diagnostics/runtime-build-provenance.js:60-77`; requires the raft-rs binding `VERIFIED` (:64),
  sqlite addon/content digests and executable digest). Consensus events invalidate admission
  (`replica-handler-release-recovery.js:244-247`).

### Exact S1 steps for W7

1. `ConfigurationManager`/`LoggingService` reset + init (as `provisional-route-fixture.js:323-328`).
2. `formAdmittedGroup({partitionId, members: 3 x [id, NODE_A], serviceOptions: {tableName: SERVICES,
   tableId: SERVICES, schema: SERVICES_SCHEMA}})` (`provisional-route-fixture.js:281-285`).
3. `attachPartitionReleaseOwners(services, {directory, budgetMs})`, `release(partitionId)`, assert
   `CUT_OVER`, record the full release answer, `readStatus()` of every replica (leader, voters).
4. With `cdcSubscribers.size === 0`, `executeQuery(sql, params, {entryId})` for A, then each B_k, using
   `registrationInsert` (`provisional-route-fixture.js:356-365`, canonical
   `MessageGroupServiceRowOwner.buildRegistrationRow` + `cdcSqlBuilder.buildInsertParts`). Record answer,
   exact debt on every replica (reuse `writeOrdinarySource` assertions,
   `provisional-route.test.js:54-98`). Assert `A.logIndex < B_k.logIndex` (:302).
5. Only then subscribe.

### Expected owner refusals (S1)

- Before release: `pausedWriteAnswerOf` → `{success:false, error: WRITE_CUTOVER_PAUSED,
  failureCode: CUTOVER_PAUSED, deferRetry:true}` (`pause.js:283-289`); nothing proposed.
- `releaseOperator`: throws on non-future deadline (`release-recovery.js:274-276`); non-CUT_OVER
  outcomes (`OBSERVED`/`PAUSED`/`UNAVAILABLE`/`STALE`/census defect) cause the fixture assertion at
  `partition-release-fixture.js:137-138`. Build provenance `UNAVAILABLE` trips
  `partition-release-fixture.js:111` (e.g. missing verified raft-rs binding on the lab host).
- Leader change/term change after release re-closes admission (`pause.js:226-233`) → same pause refusal.
- Schema refusal (`write-metrics-base.js:80-85`) and statement admission refusal (:96-99) if SQL/shape invalid.

Historical: the plan's tv-dator evidence (`5a3cdc71`) traversed release; first failure was the hybrid
INSERT (see section 6). Nothing on this branch has been measured.

---

## 2. S2: provisional-to-native route premise

### An S2 fixture already exists (unmeasured)

`test/message-group/message-group-native-provisional-route-fixture.js` (370 lines) and
`test/message-group/message-group-native-provisional-route.test.js` (423 lines), added after the
plan's inspected `68633168` (git diff --stat). Handover: "R4 test-source approval; original S2 fixture
retained; no corrected run" (HANDOVER-2026-10-23-delivery-stop.md:94). Its header says
"One critical target only: this is not the full multi-window W7 witness" (test :3).

Construction (all on ONE `MessageRouter`, `NODE_ID`, `startServer:false`, `fixture.js:333-336`):
- Router `deliver` wrapper: native envelopes queued into `f.native` and pumped (`fixture.js:337-348`,
  `pump` :101-120 with a native cut on `f.cutPeer` for TARGET_GROUP :104-109); application envelopes go
  through `deliverApplication` which can hold B before dispatch to FIRST_HOP (:127-150, `releaseB` :152-155).
- Source MG `SOURCE_GROUP` RF1 with one cache row projecting TARGET_GROUP at FIRST_HOP (:228-229).
- TARGET_GROUP RF5 `[l, h1, h2, f1, f2]` (LEADER, FIRST_HOP=f1, FOLLOWER=f2) with full rows/hints,
  formed by ticking LEADER (:230-251).
- `cutPeer` = FIRST_HOP's reserved native peerId (:252-255). FIRST_HOP reopened from its retained file
  with a stale cache row naming FOLLOWER as raft_role LEADER and **no hints** (:257-258, `reopen`
  :204-225 asserts same file/inode/record/reservations/peerId/confState and `peerAddresses == []`),
  then campaigns while cut (:261-263).
- FOLLOWER reopened with rows for FIRST_HOP and itself only, **no LEADER row, no hints** (:264-265);
  `reconcileRaftPeersFromCache` wrapped only to record invocation (:266-272); ticked until
  `leaderId === LEADER` (:273-276).
- Test asserts the premise (`provisional-route.test.js:105-147`): FIRST_HOP not leader, `leaderId null`,
  `NO_LEADER`; FOLLOWER `role FOLLOWER`, `leaderId LEADER`, `leaderAddress null`,
  `leaderAddressStatus UNAVAILABLE`, no LEADER cache row, empty hints; LEADER is leader; same confState.
- Sequence: A → relay depth0 FIRST_HOP → depth1 FOLLOWER local provisional (:310-325), topology aggregate
  provisional releases scan to B, B held (:327-339); `releaseB` → B hydrates FOLLOWER cache, status
  becomes `RESOLVED`, `leaderAddress == addressOf(LEADER)`, still FOLLOWER, same port/incarnation/
  configurationKey/confState, reconciliation observed (:341-365); explicit redrive → FOLLOWER forwards to
  LEADER at relayDepth 2, committed receipts, then CDC_DELIVERED applied for A and B (:367-419).

### How a follower learns peer addresses (code)

- Raft outbound send: `deliverToPeer` resolves `group.resolvePeerAddress(message.to)` and on throw records
  `ADDRESS_RESOLUTION` failure for that peer (`src/raft/raft-rs-peer-delivery.js:88-95`,
  `peerDeliveryFailed` :60-71). There is **no reply-via-inbound-connection path**: the response is
  addressed by peer id and needs an address.
- Port's resolver maps raft peerId → reserved replica identity, unreserved → throw
  (`src/raft/raft-rs-operation-port.js:266-272`), then calls the MG resolver
  `resolveConsensusPeerAddress` → `buildPeerAddress(id, {allowBootstrapHints: true,
  consensusResolution: true})` (`src/message-group/message-group-consensus-port.js:79-87`).
- `buildPeerAddress` order (`src/message-group/message-group-service-peer-resolution.js:58-99`):
  (1) SERVICES cache row (`resolvePeerAddressFromCache` :135-157: `address` column if valid, else
  formatted from `node_id`; partition-cleanup rows ignored; **no status filter**, so a STOPPED B row
  resolves); (2) live consensus status address — **skipped for consensus resolution** (:85-86) to avoid
  status recursion; (3) bootstrap hints `peerAddresses` (:100-128) only when `allowBootstrapHints`.
  No gossip/SWIM path exists in this resolver.
- Status observation is computed from that same resolver: `resolvePeerObservation` →
  `RESOLVED`/`UNAVAILABLE`/`UNRESERVED` (`src/raft/raft-rs-status-observation.js:27-43`), leader via
  `leaderObservation` (:58-66). An unavailable address is "not a Ready failure" (:37-41); peer delivery
  failures go to `peerDelivery`, not `group.health` (no health writes in `raft-rs-peer-delivery.js`).
- Cache-change wake: `handleSystemTableCacheChange` filters SERVICES rows of this group and type
  MESSAGE_GROUP and calls `scheduleRaftPeerReconciliation` (`peer-resolution.js:188-200`, coalesced
  hop :205-223) → `reconcileRaftPeersFromCache` (`message-group-service-raft-lifecycle.js:134-155`:
  pushes replicaIds hints and `reserveAndAdmitGroupPeer`; doc says a follower records NOT_LEADER).
  **Nuance:** route usability is caused by the cache read inside the consensus resolver, at the next
  `readStatus()`; reconciliation is an observed sibling consequence of the same cache change, not the
  step that installs the address. The W7 assertion "B through the real cache/reconciliation owner makes
  the route usable" should therefore record both: cache row present + reconciliation invoked + status
  `RESOLVED`. (Inferred from code; the follower-side effect of `reserveAndAdmitGroupPeer` was not traced.)

### Can a follower without the leader's address be in the group? Yes, as a receiver only

It receives and steps the leader's APPEND/heartbeats (inbound), learns `leaderId` (identity reserved
from formation), and can apply entries whose commit index the leader advertises; its own responses to
LEADER fail at address resolution, so it does not count toward the leader's quorum. The RF5 fixture
therefore needs LEADER + h1 + h2 (3/5) for quorum while FIRST_HOP is cut both ways and FOLLOWER cannot
reply. RF3 would not have quorum with both a cut and an unresolvable follower; keep RF5 per target group.

### F3 ingress order: implemented (with cites)

`MessageGroupForwardingOwner.resolveCdcIngressDecision` (`src/message-group/message-group-forwarding-owner.js:258-403`):
1. Initialization gate if REQUIRED (:280-293).
2. **Durable events first consult the native decision** (:295-302) —
   `resolveNativeCdcIngressDecision` (`message-group-forwarding-owner-routing-methods.js:127-156`):
   - wrong `targetGroupId` → DEFER `DEFER_NATIVE_TARGET_UNAVAILABLE` (:132-134, :158-163);
   - **actual current local raft leader** (`role LEADER && isCurrentRaftLeader()`) → APPLY_LOCAL
     `LOCAL_RAFT_LEADER` (:135-139);
   - terminal `cdcForwardMode === NATIVE_COMMIT` at a non-leader → DEFER unknown (:140-142);
   - **fresh owned native leader route** `observedNativeLeaderTarget` (:143-155; requires usable status
     `CORE_OK`, same group/replica, `runtimeHealth HEALTHY`, `groupHealth USABLE`, `gateOpen`,
     `identityRecorded` :46-62; leader != self, leader and peer `RESOLVED`, same address, not learner
     :64-76; binding kept in a private WeakMap :37-44,74), with suppression (:147-149) and relay-depth
     (:150-152) checks → FORWARD `FORWARD_NATIVE_LEADER`;
   - otherwise `CACHE_SELECTION_REQUIRED` (:144-146).
3. Only then cache selection (`forwarding-owner.js:315-319`) and
   `shouldUseCanonicalLocalIngressForStrictCDC` (:341-372; routing-methods :532-603) which itself
   refuses local ingress for durable events when a live leader target exists (:540-541) and in
   NATIVE_COMMIT mode (:542), before the relayed/addressed convergence escapes (:563-566).
4. Durable cache targets are additionally constrained: `durableCacheTargetConstraint`/
   `nativeCacheTargetEligible` (:78-89) and `assertCachedCdcForwardTarget` refuses a cache route when a
   native leader is resolvable (:112-125).

So the order "local leader admission → fresh owned native route → provisional hydration last" **is
implemented**. Terminal forward: `deliverDurableCdcForwardTarget` sets `cdcForwardMode: NATIVE_COMMIT`
for native-bound targets and increments `relayDepth` (`message-group-forwarding-owner-native-delivery-methods.js:173-193`);
recipient refuses to re-forward a terminal or depth-exhausted request (:258-259), `tryAddressedDurableCdcIngress`
refuses provisional for terminal (:146), successful forward requires committed for terminal (:131-134),
native targets STOP rather than advance (:136-140). `CDC_FORWARD_MAX_RELAY_DEPTH = 2`
(`message-group-service-runtime-support.js:91`); relayed convergence min depth 1
(`message-group-forwarding-owner-constants.js:83`). Receiver: `applyDurableLatencyCdcDecision`
refuses local-ingress in NATIVE_COMMIT mode (`message-group-service-cdc-propagation-runtime-methods.js:41-42`).

### S2 decision

**FEASIBLE with the existing construction for one target group/one subscriber; FEASIBLE ONLY WITH A
FIXTURE CHANGE for W7** (N target groups, N B-rows, multiple subscribers, two routers — section 5).
No typed refusal by an existing owner was found in code. Unmeasured risks to record before W7 coding:
- The reopened FOLLOWER must satisfy `usableNativeCdcStatus` (`routing-methods.js:46-51`) after reopen
  (gateOpen, identityRecorded, USABLE). If not, the observation is null and the decision silently stays
  on the cache path — the post-B assertion `S2_F3_FOLLOWER_MUST_RELEASE_TO_NATIVE` (test :372-373) is
  then the typed failure point (provisional instead of committed), not a timeout.
- Setup loops are bounded rounds (`SETUP_ROUNDS = 200`, fixture :42); a non-forming premise asserts at
  `fixture.js:244-250` / test `:112-129`.

---

## 3. S3: native vs physical transport cuts

### `message-group-native-custody-fixture.js` capabilities (135 lines)

- Real `MessageGroupService` replicas, durable SQLite files, real `MessageRouter` and registered
  handlers (`:94-115`), one `VirtualTimeSource` per replica (`:103-104`).
- Native custody: router `deliver` wrapper queues every raft-rs envelope (`:83-92`); `pump` delivers/holds
  (`:37-59`): `holdEntries` holds leader APPEND carrying data (`:44-46`), `isolateLeader` cuts all to/from
  the leader (`:42-43`); held items retained in `f.held`; clocks advanced with `advance(0)` (`:56`).
- **Hard-coded identities**: `NODE_ID`, `GROUP_ID`, three `REPLICAS` (`:19-22`); `replicaCount` must be
  1 or 3 (`:62`); CONFIG subscription only (`:114`); all replicas full rows + hints (`:93-109`). Not
  parameterizable for multiple target groups without editing.
- **Single router, `startServer:false`** (`:67-68`, `:82`). Application traffic to same-node addresses
  is `deliverLocal` (`src/transport/message-router-delivery-pressure-routing.js:357-364`, versus
  `deliverRemote` :366-373): no outbound queue, no JSON encode (`message-router-delivery-behaviors.js:241`),
  no pending-response ledger, no pressure input. Same holds for the provisional-route fixture (`:333-336`).

### What is missing for two real routers with remote handlers

- No MG/CDC native test uses two routers today. Existing two-router patterns:
  - `test/test-helpers/learner-recipient-fixture.js:27-52` `connectRouters`: two routers with
    `inProcess: true`, fixed `wsPort` 24271/24272, `startServer:true`, `connectToNode`, waits for both
    IDENTIFY directions; remote `MessageGroupServiceHandler` registered on the recipient (:99-104).
    In-process mode uses `InProcWebSocket` (`src/transport/inproc-transport.js:88-115`): real router
    server/dial owners, JSON string frames via microtasks, but no `ws` library framing or `maxPayload`.
  - Real `ws` on fixed ports: `test/integration/websocket-create-replica-ack.integration.test.js:98-125,198`
    (ports 19876/19877), `test/integration/bidirectional-websocket.integration.test.js`,
    `test/integration/multi-node-cluster.integration.test.js`, many transport suites
    (`test/transport/message-router-tail-*-test-cases.js`, `message-router-routing-and-recovery.js`,
    `node-incarnation-websocket-fence.test.js`, `message-router-critical-capacity-reservation.js`).
  - `test/message-group/cdc-non-leader-propagation.test.js` has many routers but uses
    `createControllableMessageGroupService` (controllable port, not native) — not reusable as native evidence.
- No bound-port readback exists in `src/transport` (no `address().port` / bound-port API found), so a
  real-ws fixture must use fixed ports (lab collision risk) or the in-process environment.
- Missing pieces: (a) per-node router + per-node native `deliver` interception (the native hold must
  wrap each router's `deliver` because cross-node native packets would otherwise go to `deliverRemote`);
  (b) per-node SystemTableCache rows with `node_id` so `buildSafeTargets` emits `coordinatorNodeId` of
  the recipient node; (c) `PressureGovernor.getShared({nodeId, messageRouter})` is keyed per node and
  reads router `outboundQueues` stats (`src/control-plane/pressure-governor.js:333-349`), so a
  pressure episode is only constructible with a remote outbound queue; (d) owner decision whether
  in-process WebSocket counts as "actual connection" for W7 or real `ws` is required.

---

## 4. Production readiness for W7 (per item)

| Item | State | Implementing code |
| --- | --- | --- |
| Source-owned progress cell | IMPLEMENTED | `lane.currentObligation` in `createCdcObligationLane` (`partition-cdc-obligation-delivery.js:88-110`, field :94); created/reused by `prepareCdcObligationProgress` (`partition-cdc-obligation-progress.js:50-60`, binding = `cdcCommitWaitIdentity([event])` :51); dropped on tenure reset (`delivery.js:147-157`) and at scan release/commit (`delivery.js:490-492`). Currentness: lane/tenure/leader/subscriber-set size and per-branch wrapper/original/subscription/epoch (`progress.js:16-48`); topology owner/source replacement invalidates (`progress.js:68-77`, `cdc-propagation-progress.js:72-85`). Metadata only: no payload (asserted in `test/partition/partition-cdc-delivery-progress.test.js:142-143`). |
| Topology leaf progress | IMPLEMENTED | `cdc/cdc-propagation-progress.js`: per-group leaves with observed route lifetime (:8-24), route replacement clears weak tag (:37-61), new required group discards weak tags (:58-60), `bindCdcPropagationProgress` observe/result with currentness (:106-147); committed receipts survive route change (:133). |
| Weak PROVISIONAL_COVERAGE aggregation | IMPLEMENTED | `observeCdcCoverage` (`cdc/cdc-delivery-outcome.js:349-363`, transport vs local predicates :336-347), `cdcCoverageState` (:372-387: all leaves must match vector digest; all COMMITTED → COMMITTED else PROVISIONAL), `completeCdcPropagation` (:389-401, provisional → `buildProvisionalCdcOutcome` with source group). Subscriber level: `observeCdcSubscriber`/`cdcObligationCoverage` (`progress.js:92-98`). Provisional predicate requires groupId when expected (`outcome.js:321-330`). |
| Fair cursor | IMPLEMENTED | Subscribers: round-robin `nextCdcSubscriber` (`progress.js:62-66`), covered branches skipped (`delivery.js:473-481`). Leaves: `nextUncoveredLeaf` with persistent `nextLeaf` (`cdc-propagation-progress.js:92-104`), source leaf at index 0. |
| Late-answer fence | IMPLEMENTED | `scoped.assertCurrent()` after the subscriber await (`delivery.js:478-480`), wave `context.assertCurrent()` before `progress.observe` (`topology/cdc-group-propagation-durable-delivery.js:104-105`, catch rethrows via :110), `observe` asserts currentness (`cdc-propagation-progress.js:124-125`). Scope helpers `cdc/cdc-delivery-invocation.js:77-117` (subscriber scope), `:122-169` (child scope inherits `bindTopology` via `...parent`). |
| DRIVE.PROVISIONAL scan release | IMPLEMENTED | `deliverObligation` returns PROVISIONAL without ACK/metrics/hooks (`delivery.js:493`); `driveOneObligation` sets `scan.provisional`, advances cursor, counts 0 delivered (:554-558); `drivePageFinished` → `DRIVE.PROVISIONAL` + `scheduleDeliveryRetry` and clears scan (:573-577). Subscriber returns provisional before `afterPropagation` hooks (`bootstrap/shared/partition-cdc-propagation-subscriber.js:183-190, 245-251`); UNKNOWN throws (:186-189). |
| One payload per await / 256 quantum | IMPLEMENTED | `drivePage` reads `limit: 1` (`delivery.js:509-514`) under the `DRIVE_PAGE_ROWS` loop (:589-610), invocation reserved before read (:590-594). |
| Single-flight / cleanup custody | IMPLEMENTED | `driveCdcObligations` joins in-flight or active invocation (`delivery.js:645-650`), `JOINED_IN_FLIGHT` after a still-active invocation (:606-609), `resumeAfterCdcCleanup` (:627-633). |
| Foreground retry helper | IMPLEMENTED | `src/topology/cdc-group-propagation-foreground-retry.js:8-29` (STOPPED/ATTEMPTS_EXHAUSTED/ADVANCE; wave `prepareWait` refuses `retryDelayMs >= remainingMs`, `cdc-group-propagation-durable-delivery.js:144-148`); loop `deliverToTargetsWithRetry` (`cdc-group-propagation-delivery-methods.js:93-117`). Defaults: 3 attempts, 50 ms initial, x2, max 1000 ms (`cdc-group-propagation-constants.js:74-80`). Durable waves have no background entry (`durable-delivery.js:153-154`). |
| One-wave topology admission | IMPLEMENTED | `activeDurablePropagation` BUSY → `BACKPRESSURE` with `retryAfterMs` (`durable-delivery.js:34-46,176-190`), released on actual child cleanup (:188-190). |
| Dispatch window | PARTIAL: SERIAL ONLY | `deliverUncoveredLeaves` dispatches one leaf at a time (`durable-delivery.js:89-115`; comment :93-94 "A serial dispatch window is bounded by every positive router concurrency"). No concurrent window of N exists. Router option: `outboundQueueMaxConcurrent` constructor option or config (`src/transport/message-router.js:163-172`, default 32 `config-definitions.js:110`, schema minimum 1 `config-schema-constants.js:121`), applied per node queue (`message-router-outbound-delivery-registry.js:330`); value 2 used e.g. `test/transport/message-router-critical-capacity-reservation.js:166`. **Engaged only for remote delivery** (`deliverLocal` bypass, `delivery-pressure-routing.js:357-364`). |
| Pressure gate in durable wave | IMPLEMENTED | `deliverTarget` returns BACKPRESSURE when `PressureGovernor` DEFER (`durable-delivery.js:65-70`; gate `cdc-group-propagation-delivery-methods.js:604-621`). |
| Grouped/safe plan | IMPLEMENTED | `captureDurablePropagationPlan` (`topology/cdc-group-propagation-durable-plan.js:14-31`), safe-target refresh during wait (`durable-delivery.js:149-152`). |
| F3 native-first order + terminal forward | IMPLEMENTED | Section 2. |
| Seed/join bridges carry `deliveryContext` | IMPLEMENTED | `bootstrap/owners/seed-runtime-bridge-owner.js:200-216`; `bootstrap/node-joining-publication-activation.js:719-729` (and registration :323-324). |
| C1 receiver admission | NOT IMPLEMENTED (known) | Public durable receiver captures events before any queue reservation (`message-group-service-cdc-propagation-runtime-methods.js:18`) and its FORWARD branch calls `forwardCDCBatchToLeader` outside bounded admission (:45). W7's follower→leader terminal hop traverses this branch. |
| C2 transport metadata erasure | NOT IMPLEMENTED (known) | Per R2 handover :238-257 (`normalizeDeliveryOutcome`, `transport-semantic-outcome.js`); not re-traced here. Affects remote contradictory/wrong-group negatives. |

Drift notes: R2 handover says the delivery module is 789 lines; `wc -l` gives 700 with the matching
SHA256. The contract's `message-router-delivery-behaviors.js:689` serialization cite is stale (file
has 621 lines; `JSON.stringify` at :241 and :558).

---

## 5. Minimal W7 fixture plan

### Files

1. **Extend `test/message-group/message-group-native-provisional-route-fixture.js`** (test limit 1500
   lines, `docs/development/code-style.md:58`) — parameterize, do not copy:
   - `TARGET_GROUPS = [{groupId, replicas:[l,h1,h2,f1,f2]}] x N (N>=3)`; `addressOf(nodeId, replicaId)`.
   - Per node: one `MessageRouter` (node A: producer partition, source MG, release owners; node B:
     all target MGs) connected with the existing `connectRouters` pattern
     (`learner-recipient-fixture.js:27-52`), `outboundQueueMaxConcurrent: 2` on node A.
   - Per-router native interception (lift `fixture.js:337-348` into a per-router installer) and the
     existing per-group cut (`pump` :104-109 generalized to a `Set` of cut peers keyed by group).
   - `prepareRecipients` looped per group (`:227-279`), each with its own FIRST_HOP isolation and
     FOLLOWER reopen without the group's LEADER row/hints.
   - Generalize `holdB` to a hold predicate over (target address, eventKey) so the schedule can hold
     "one final target" once and later release it (the held raw send is the late valid answer).
   - Optionally extract the multi-router/multi-group composition into one new helper
     (e.g. `test/message-group/message-group-native-w7-composition.js`) if file size requires.
2. **New `test/bootstrap/cdc-source-occurrence-delivery.integration.test.js`** (plan allocation, PLAN:107)
   containing the W7 composite and its paired negatives.
3. Reuse (import, do not copy): `formAdmittedGroup`, `attachPartitionReleaseOwners`,
   `registrationInsert`, `writeOrdinarySource`-style assertions (move to the fixture if shared),
   `buildPartitionCdcPropagationSubscriber`, `SeedRuntimeBridgeOwner`,
   `NodeJoiningPublicationActivation.prototype.propagatePartitionCDCEvent` invoked on a minimal owner
   context `{latencyTopology}` (`node-joining-publication-activation.js:719-729`), `LatencyTreeService`,
   `CDCGroupPropagationService` wiring (`provisional-route.test.js:149-190`), `pendingRouteSnapshot`
   (:206-240) for captured-only cuts, `observePendingNativeDelivery`/`closeExpiredNativeDelivery`
   pattern for expiry + cleanup (`native-custody-handoff.test.js:227-275`).

### Real owners that must stay real (per plan)

Partition source ledger/admission/release, `executeQuery`, subscriber factory, seed and joining bridges,
`CDCGroupPropagationService` durable wave, `LatencyTreeService`, MessageRouter(s) and connection,
MG handlers/forwarding owner/ProposalQueue/native raft-rs ports, SystemTableCache CDC application and
peer reconciliation, `cdc-delivery-outcome` validators, source CDC_DELIVERED proposal/apply.

### Allowed controls (test physics)

Transport custody only: hold/release native envelopes and individual application sends; the RF5 cut;
reopen with omitted rows/hints; explicit `driveCdcObligations`/`flushCdcAcknowledgements` actuation;
manual `tick`/`pump`; inducing pressure through actual remote outbound queue occupancy. Not allowed:
role/status/readStatus replacement, fabricated outcomes/receipts, OPEN flags, timeout increases.
A controlled-recipient variant (as in `partition-cdc-delivery-progress.test.js:46-51`) is component-level only.

### Schedule mapping (plan W7 steps)

- Clock: the producer `PartitionService` uses its own time source (`partition-service-core-base.js:78`);
  `formAdmittedGroup` passes none, so source invocation budget is real time:
  `min(messageGroup.deliveryTimeoutMs, transport.messageTimeoutMs)` = 5000 ms defaults
  (`cdc-delivery-invocation.js:56-63`, `message-group/constants.js:102`, `constants/transport.js:75`).
  Each forced expiry therefore costs ~5 s real time; source retry delay starts 50 ms, doubles, max 10 s
  (`partition-service-constants.js:39-40`, `delivery.js:440-464`). Whether the release owners and
  partition raft tolerate an injected virtual/delayed clock is UNKNOWN; do not assume it.
- Multiple invocations: hold one leaf's application send; await `invocation.context.signal.aborted`;
  assert UNKNOWN, no source ACK, debt owed; release the held send (late valid answer must not record);
  await `context.cleanup`; next drive starts at the advanced `nextLeaf`/`nextSubscriber`.
- Multiple subscribers: two subscriptions (seed bridge + joining bridge) on the producer leader sharing
  node A's topology service; serial delivery means the one-wave admission is not contended.
- B_k: one STOPPED registration row per target-group LEADER after A (`registrationInsert`), so captured
  targets stay unchanged (asserted for one group at `provisional-route.test.js:364`).
- Pressure/safe-fallback episode: needs remote outbound queue stats; with two routers saturate node A's
  queue to node B (window 2) — exact recipe UNKNOWN; consult `test/control-plane/pressure-governor.test.js`
  and `message-router-critical-capacity-reservation.js`.

### Paired negatives and the production seam each cuts

| Negative (plan W7 / contract F2-P) | Seam |
| --- | --- |
| Remove weak-coverage accumulation/aggregation | `cdc-propagation-progress.js:124-139` (store PROVISIONAL tag), `partition-cdc-obligation-progress.js:92-98`, `cdc-delivery-outcome.js:372-387` PROVISIONAL branch. Expect A UNKNOWN, B unvisited. |
| Retain only native leaves | `cdc-propagation-progress.js:133` (accept only COMMITTED). |
| Restart each attempt at subscriber one | `partition-cdc-obligation-progress.js:50-66` (new cell / reset `nextSubscriber`), `delivery.js:477` skip. |
| Restore always-local addressed ingress | `message-group-forwarding-owner-routing-methods.js:540-541` and `message-group-forwarding-owner.js:296-302` (native decision first). Expect provisional after B, no native receipt/ACK. |
| Withhold one target / final subscriber | `nextUncoveredLeaf` (`cdc-propagation-progress.js:92-104`) + `cdcCoverageState` all-leaves rule; subscriber `cdcObligationCoverage`. |
| Right event from wrong group | `isProvisionalCdcOutcome` group check `cdc-delivery-outcome.js:321-325`; remote path also depends on C2. |
| Changed vector member | `matchesCdcVector` `cdc-delivery-outcome.js:304-306`. |
| Valid answer after actual expiry, timer delayed | `durable-delivery.js:104,110`; `delivery.js:479`; synchronous expiry in `cdc-delivery-invocation.js` scopes. |
| Same-text subscriber replacement | `subscriberBindingCurrent` `partition-cdc-obligation-progress.js:23-28`. |
| Source/topology replacement | `progress.js:68-73`; `cdc-propagation-progress.js:72-85`. |
| Tenure reset while cleanup held | `delivery.js:116-157`, `:645-650` (no overlapping hydration while `activeCdcInvocation`). |
| Local provisional without transport ACK vs real-router | `cdc-delivery-outcome.js:336-347` local vs transport predicates. |
| Progress cell holding topology capacity | `durable-delivery.js:185-190` (slot released on cleanup). |

---

## 6. Historical setup failures to avoid

From `solve/quests/runtime-ordering-completion-consumer-proof/evidence/closeout/MG-FIRST-RESULT-CLASSIFICATION.md`:
- Frozen `5a3cdc71` on tv-dator: 0/1 pass; first failure `0 !== 1` "exact actual recipient proposal is
  retained" (:9-12). Not a custody RED.
- Cause: fixture called `applyWrite` with `type: INSERT` + sql/params but no `data` and no owner
  timestamp (:32-34); generator extracts params only for QUERY, so event data was
  `{"updated_at_hlc": ""}` (:20-23, :36-44). Recipient cache rejects data without primary key before
  proposal (source-backed, not observed) (:54-64).
- Avoid: never build entries by hand; always `executeQuery(sql, params, {entryId})` (QUERY + service HLC)
  or `insertData` (INSERT + data) (:46-52); assert event data and HLC before subscribing (the current
  `writeSource` does, `native-custody-handoff.test.js:136-145`). The seed-bridge identity and subscriber
  outcome concerns listed there (:74-80) are addressed on this branch (bridge spreads `copyCdcEvent`
  and passes `deliveryContext`, `seed-runtime-bridge-owner.js:200-216`; subscriber returns the answer,
  `partition-cdc-propagation-subscriber.js:239-251`).
Other setup traps visible in code: CUT_OVER needs measured build provenance (verified raft-rs binding);
fixed WS ports collide on shared lab hosts; S2 setup bounded by 200 rounds; real 5 s budgets per expiry.

## Unknowns

- Whether the S2 premise forms on this candidate (never run).
- Follower-side effect of `reserveAndAdmitGroupPeer` during reconciliation.
- Producer/release owners under a non-real clock.
- Exact pressure-episode recipe through real outbound queues.
- Whether in-process WebSocket satisfies "actual connection" (owner decision).
- C2 effect on remote positive answers (only negatives assessed from the handover text).
