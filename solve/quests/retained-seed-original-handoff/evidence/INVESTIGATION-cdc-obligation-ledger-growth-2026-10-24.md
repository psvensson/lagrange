---
audience: development
documentClass: planning
---

# Investigation: policy-suppressed CDC obligations (2026-10-24)

This was a read-only investigation. The subject is the lineage head `7ee9c6584`
(`/mnt/data/peter/projects/.worktrees/mg-delivery-resume-r2-20261023`).

- I worked in a detached scratch worktree,
  `.../scratchpad/wt-cdc`, with `node_modules` symlinked.
- Probes were throw-away scripts. Copies are in
  `.../scratchpad/legacy/probes-cdc-policy/` (`policy-growth.probe.mjs`,
  `lane.probe.mjs`). They use the controllable partition fixture
  (`test/test-helpers/participant-transaction-fixture.js`) and real
  `PartitionService` code.
- Nothing was edited in the lineage tree or in `/mnt/data/peter/projects/lagrange`.

## 0. Headline

1. **The ledger has no retirement at all.**
   - Every committed write to every table leaves one `_cdc_obligations` row
     forever.
   - The row is *owed* when no subscriber exists, and *delivered* when one
     does.
   - No owner deletes either kind. The ledger says so itself:
     "delivered-row reclamation remain obligations of the existing retention
     owner; this ledger does not claim a compaction policy of its own"
     (`partition-cdc-obligation-constants.js:79-81`). No such retention owner
     exists.
   - The table policy only decides which of the two kinds of permanent row a
     table leaves behind.
2. **Two kinds of table have no consumer at all**:
   - the 23 non-propagated system tables, including `logs` and
     `sql_write_operations`;
   - **every user table**, including the default `externalCdcAllowed:true`
     ones.

   Production attaches partition CDC subscribers only at three bootstrap
   sites, and all three are gated on the 23 propagated tables. So "no external
   subscriber" here means "no consumer at all". For user tables, external CDC
   is *allowed* by policy, but no external subscriber path exists in
   production.
3. **Measured.** Each write adds exactly 1 owed obligation:
   - `logs`: about 360 B of event JSON and about 470 B of ledger pages per
     write;
   - user table: about 180 B / 290 B per write.

   Deleting all the data rows (the table's own retention DELETE) adds one more
   obligation and removes none. The ledger outlives the data it describes.
4. **The ordered lane turns the backlog into a hazard.**
   - The first subscriber ever attached receives the whole history.
   - A subscriber that refuses one event (for example a policy-aware one
     declining a suppressed event) wedges every later event of the partition.
     Retries back off to a 10 s cap, indefinitely.
5. **The sliding window is a second catch-up owner. It is live and measured.**
   - It re-delivered 5 events, already committed delivered in the ledger, to
     a new subscriber outside the ledger.
   - A refusal inside the window throws out of the handshake. That skips the
     ledger drive and leaves the refusing subscriber registered.
6. **The readiness "buffer not drained" arm is a live gate arm on a constant
   input.** It feeds `topologyReady`/`benchmarkReady`, but `bufferedEvents`
   is always 0, so the arm can never fire.

---

## 1. Where the policy lives, who defines `externalCdcAllowed`, who consumes system-table CDC

### 1.1 Policy owner

The policy owner is `src/cache/cdc-table-policy.js`. Each table policy has these
fields:

| Field | Meaning |
| --- | --- |
| `policyClass` | |
| `authorityClass` | |
| `internalCachePropagation` (icp) | |
| `readinessRelevant` | |
| `bootstrapHydrationMode` | |
| `externalCdcAllowed` (ext) | |

Where the values come from:

- **System tables:** a static frozen map, `SYSTEM_TABLE_CDC_POLICIES`
  (`:39-471`).
- **User tables:** `USER_TABLE_EXTERNAL_CDC_POLICY` (`:473-480`, ext true, the
  default) and `USER_TABLE_NO_CDC_POLICY` (`:482-489`).
- **Resolver:** `getTableCdcPolicy` (`:519-529`) picks no-CDC only when a
  caller passes `options.externalCdcAllowed === false`.
- **Derived sets:** `CDC_PROPAGATED_TABLES` / `CDC_NON_PROPAGATED_TABLES`
  (`:495-505`).

**Every system table has `externalCdcAllowed:false`.** Probe over the map: 46
system tables, 23 icp=true and 23 icp=false.

- **Suppressed (icp=false, ext=false; policy class
  `control_no_internal_propagation`):**
  - `sql_write_operations`, `schema_operations`, `schema_migration_partitions`
  - `logs`, `contexts`, `code`, `live_queries`
  - `service_timers`, `service_packages`, `service_revisions`,
    `service_installations`, `service_install_failures`
  - `module_manifests`, `package_registry_mappings`,
    `package_registry_overrides`, `module_dependency_locks`
  - `wasm_operations`, `call_cell_reduce_slots`, `call_cell_reduce_results`
  - `artifact_payloads`, `artifact_payload_chunks`
  - `debug_breakpoints`, `debug_snapshots`
- **Internally propagated (icp=true, ext=false):**
  - `nodes`, `partitions`, `services`, `message_groups`, `tables`
  - `schema_migrations`, `indices`, `node_endpoints`
  - `service_instances`, `service_definitions`, `service_bindings`,
    `service_endpoints`
  - `replica_operations`, `storage_reservations`,
    `control_plane_publications`, `config`
  - `sql_transactions`, `sql_transaction_participants`
  - `debug_sessions`, `latency_groups`, `inter_group_latencies`
  - `service_partition_access`, `call_activation_leases`

**Who sets `externalCdcAllowed` for a user table.** There are two inputs, and
neither is replicated partition state:

1. `PartitionService` option `externalCdcAllowed` (`partition-service-core-base.js:82-85`).
   **No production construction passes it.** A grep for
   `externalCdcAllowed:` in src finds only `cdc-table-policy.js` and
   `partition-cdc-delivery.js:312`.
2. `tables.table_policies` JSON, read **from the system table cache** by
   `isExternalCdcAllowedForTable` (`partition-cdc-delivery.js:288-301`, parse
   `:114-138`). The JSON is written by CREATE TABLE
   (`table-creation-service-create-table.js:194`).
   `validateTablePolicy` checks only the known fields
   (`policy-constants.js:109-118`), so the extra key passes through.

There is a duplicate suppression set:
`CDC_NO_SUBSCRIBER_BUFFER_SUPPRESSED_TABLES = {logs}`
(`partition-cdc-delivery.js:51`, checked `:308`). It is redundant, because
`logs` is already icp=false and ext=false.

**What the policy meant, and where it is applied.** It was never "do not
deliver". It was "do not hold for a future subscriber":
`shouldBufferCdcWithoutSubscribers` = `icp || ext` (`partition-cdc-delivery.js:307-315`).
Its only consumers are on the dead volatile path:
- `cdcEventHasNoAudience` / `bufferCDCEventWithoutSubscribers`
  (`partition-service-cdc-stream-base.js:91-122`);
- `bufferCDCEventForRetry` (`partition-cdc-delivery.js:328-330`);
- all reached only from `generateCDCEvent` (`:129-219`). Its sole caller is
  gated on `sideEffectPlan.emitCdcEntry` (`partition-service-write-metrics-base.js:691`),
  which is null on every path (`partition-write-kernel.js:543,566`,
  `partition-service-raft-write-commit.js:216`).

The durable recorders apply no policy:
- `recordCommittedStatementCdc` `partition-cdc-obligation.js:123-135`
  (called `partition-service-entry-apply-base.js:656`);
- `captureCommittedOperationCdc` `:95-113` /
  `recordCommittedOperationCdc` `:146-172` (called
  `partition-participant-transaction-apply.js:373,405`).

### 1.2 Who consumes partition CDC (all consumers)

The only place a partition subscriber is ever registered is
`partition-cdc-delivery.js:566`, inside `subscribeToCDCWithHandshake`.

**Production callers.** There are three, and all are filtered to the 23
propagated tables:

| Site | Gate |
| --- | --- |
| Dynamic replica registration `bootstrap-service-replica-registration-methods.js:173-240` | `shouldAttachPartitionCdcPropagation(tableName)` |
| Joiner activation `node-joining-publication-activation.js:279-326` | same |
| Seed initial `phases/seed-cache-hydration-cdc-subscription.js:109` via `seed-cache-hydration-phase.js:533-541` | loops `CACHE_HYDRATION_TABLES` |

The filter is `shared/cdc-propagation-filter.js:20-22`, which tests
`CACHE_HYDRATION_TABLES`, and `cache-constants.js:161` defines
`CACHE_HYDRATION_TABLES = CDC_PROPAGATED_TABLES`. A probe confirmed that the
two sets are equal: 23 = 23.

**What each consumer does, and what it reads:**

| Consumer | Reads | Tables |
| --- | --- | --- |
| Message-group propagation subscriber (`shared/partition-cdc-propagation-subscriber.js`), which feeds the cluster system-table cache | partition CDC events | 23 propagated |
| `config` epoch apply, `nodes` ready-rebalance trigger (`seed-cache-hydration-cdc-subscription.js:96-105`, `bootstrap-service-replica-registration-methods.js:226-230`) | same events | `config`, `nodes` |
| Live queries (`live-query-startup-wiring.js:168-247`) | **the system-table cache**, not partition CDC | propagated only, by construction |
| Admin readiness / diagnostics (§5) | `getCDCSubscriptionDiagnostics()` counters, not events | all local partitions |
| CDC pipeline readiness gate (`cdc-pipeline-readiness-gate.js:258-268`) | `partition.cdcSubscribers.size` | propagated |
| **Seed retained-handoff census** (`bootstrap/seed-retained-partition-effects.js:233-283`, `obligationCensusMatches :225-231`, `obligationMatches :193-205`) | **the ledger rows themselves** (`readCdcObligationCensusIn`). It requires exactly one obligation row per applied foundation statement, with the delivered flag and `delivered_index` matching the acknowledgement entry | `message_groups`, `tables`, `partitions` only (`seed-retained-foundation.js:13-22`) |
| `subscribeToCDC` (V10) | – | no src caller |
| No external subscriber API | – | admin, cli, transport, runtime: none found |

**Classification:**
- **Propagated system tables (23):** an internal consumer exists, and is
  attached on every partition replica.
- **Suppressed system tables (23):** no consumer at all. There is no
  subscriber, no ledger reader, and the cache does not hold them.
- **User tables (all):** no consumer at all in production. External CDC is
  "allowed", but nothing subscribes.

---

## 2. Is an obligation recorded on every write, and is it ever retired? (measured)

### 2.1 Growth (probe `policy-growth.probe.mjs`, N = 1000 committed statements per case, no subscriber, leader)

| Case | Policy (icp / ext / old `shouldBuffer…`) | Owed after N | Owed per write | event_json bytes / write | ledger pages (dbstat) after N | after retention DELETE of all rows |
| --- | --- | --- | --- | --- | --- | --- |
| `logs` | false / false / **false** | 1000 | **1** | 360 | 471,040 B (≈471 B/write) | data rows 0; owed **1001**; ledger 475,136 B |
| user table, `externalCdcAllowed=false` | false / false / **false** | 1000 | **1** | 181 | 290,816 B (≈291 B/write) | data rows 0; owed **1001** |
| user table, default | false / true / true | 1000 | **1** | 181 | 290,816 B | data rows 0; owed **1001** |

In all three cases:
- the drive state was `no_subscribers`;
- `bufferedEvents` was 0 and no `CDC_DELIVERED` was proposed;
- a `LEADER_ELECTED` redrive changed nothing.

The retention-style `DELETE ... WHERE` adds one more owed obligation, a DELETE
event with an empty `data`. A production logs write is one `upsertLog` per
entry (`logs-table-service.js:510-535`), so this is one permanent row per log
line. The log retention service's DELETEs (`log-retention-service.js:290-293`)
add rows instead of reclaiming them.

### 2.2 Retirement inventory

The only thing that changes a ledger row is `MARK_DELIVERED`
(`partition-cdc-obligation-constants.js:133-136`), applied by a committed
`CDC_DELIVERED` (`partition-cdc-obligation.js:240-279`). That command is
proposed only by the lane, only after every current subscriber returned a
committed receipt.

| Mechanism | Result |
| --- | --- |
| `DELETE` from `_cdc_obligations` | none: no `DELETE` SQL exists in the ledger SQL (`:83-140`) |
| Expiry / TTL | none |
| Compaction | none in the ledger. Raft log compaction does not read the ledger: the only src readers are the lane and the seed census |
| GC by retention owner | none: `log-retention-service.js` deletes `logs` data rows only |

Design 8.3 point 5 (`solve/quests/replicated-transaction-decision-and-apply/design-leg-a-v10-2026-10-10.md:2523-2527`)
says "An obligation is owed until its flag is committed", and point 6 says
snapshots carry the undelivered rows. So by design, a row with no consumer is
owed forever and travels in every partition image. I did not trace the
rs-raft state-image builder, so whether images carry the table is **unverified**
(see §7).

Delivered rows are never reclaimed either. The `L_ack` probe ended with
`{owed: 0, delivered: 600}`. So the propagated tables also grow by one row per
write without bound. The policy question is only half of the systemic defect.

### 2.3 The ordered lane (probe `lane.probe.mjs`, `logs` partition, 600 owed, then one subscriber attaches)

| Case | Delivered calls | Distinct events | CDC_DELIVERED proposed | Ledger after | lastDrive |
| --- | --- | --- | --- | --- | --- |
| `L_ack`: subscriber answers a committed receipt | 600 | 600 | 3 | owed 0 / delivered 600 | `drained` |
| `L_refuse_first`: subscriber refuses `entry:l-0` (returns no receipt) | 10 (all on l-0) | 1 | 0 | owed 600 / delivered 0 | `held_by_subscriber` on `entry:l-0`, retry 10,000 ms (cap), `retryArmed:true` |

Answer to the blocking question:

- **With no subscriber, nothing is blocked.** `drivePrecondition` returns
  `NO_SUBSCRIBERS` (`partition-cdc-obligation-delivery.js:500-507`), so the
  backlog only accumulates.
- **Once a subscriber exists, the backlog blocks.**
  - The lane delivers in log order. It stops at the first refusal
    (`handleDeliveryFailure :525-538`) and redelivers the same head
    (`DRIVE_PAGE_ROWS` 256, one row per read, `:509-514`).
  - So (a) live events queue behind the whole history, here 600 events and 3
    ack rounds.
  - And (b) one refused event wedges every later event of that partition for
    good. The partition holds only its own table (`tableName` single,
    `partition-service-core-base.js:81`), so the wedge does not cross into
    other tables. Other subscribers of the same partition are wedged too,
    because an event is acknowledged only when every subscriber covered it.
    The `L3b` probe shows this: the new event `u-99` stayed owed while A kept
    receiving it on retry.
- **A policy-aware consumer that declines a suppressed event would therefore
  stall the partition permanently.** That is the reason the policy cannot be
  bolted on at delivery as a refusal.

Side observation: the recorder accepts what the lane can never deliver. A
fixture command with `timestamp: ''` was recorded. The lane then failed
`copyCdcEventMetadata` ("Durable CDC identity requires an event key and source
partition", `cdc-event-envelope.js:58-63`) before any subscriber call, and held
the lane forever. Production commands carry an HLC stamp, so whether this is
reachable is **unknown**. It is an asymmetry between recording and delivery
validation.

---

## 3. Where the policy belongs

**Judgement: apply it once, at recording.** Do not owe what no one may
receive. The reasons:

- **The suppressed set has no consumer of any kind** (§1.2). Delivery-side
  admission therefore has nothing to admit, and a delivery-side refusal wedges
  the lane (§2.3).
- **The ledger's owed state is a promise.** Recording an obligation nobody may
  receive is a false durable debt.
- **"Both" would be two versions of one rule.**

**Predicate.** One owner, `src/cache/cdc-table-policy.js`, gains one exported
predicate, for example `isTableCdcObligationRecorded(tableName)`, defined as
`policy.internalCachePropagation === true || policy.externalCdcAllowed === true`.
It is evaluated **only over the static system map for system tables**. That is
the formula already at `partition-cdc-delivery.js:311-314`, moved to the policy
owner.

**Where it is applied.** In `recordCommittedOperationCdc`
(`partition-cdc-obligation.js:146`), which is the funnel for both statements
and participant decisions: `if (!isTableCdcObligationRecorded(service.tableName)) return 0;`.
Also guard `recordCommittedStatementCdc :123` and the `captureCommittedOperationCdc :95`
call site (`partition-participant-transaction-apply.js:405`). Then no event is
built and no row SELECT runs (`partition-cdc-parameterized-sql.js:236-360`)
for a table that owes nothing.

**What it replaces, and what to delete.** Delete:
- `CDC_NO_SUBSCRIBER_BUFFER_SUPPRESSED_TABLES` (`partition-cdc-delivery.js:51`);
- `shouldBufferCdcWithoutSubscribers`, `isExternalCdcAllowedForTable`,
  `parseExternalCdcAllowedOverride` (`:110-138,284-315`) and the delegates
  (`partition-service-cdc-stream-base.js:526-544`).

These are census V18. They go together with V1/V3/V5.

**Size.** Small: about 1 predicate, 2-3 guards and 2 deletions. Tests:
- rewrite `partition-service.test.js` #23/#24 (`:1048,:1101`, currently
  vacuous on `cdcEventBuffer.size()`) against `countCdcObligations`;
- rewrite `partition-service-cdc-log-suppression.test.js:86-123`.

**Determinism constraint.** This decides the shape of the fix.

- Recording runs inside the application transaction on every replica. The
  predicate must therefore be a pure function of the committed entry and of
  the code. If it is not, replicas diverge in ledger rows at the same entry.
  The consequences of that divergence:
  - a `CDC_DELIVERED` is refused `UNKNOWN_EVENT` on some replicas
    (`partition-cdc-obligation.js:211-215`);
  - the seed census goes `CONTRARY/OBLIGATION`.
- The static system map satisfies this.
- **The user-table override does not**, because it is read from the
  per-node system-table cache (`partition-cdc-delivery.js:295-296`).
- So the per-table user override must become replicated input before
  recording may consult it. Candidates:
  - stamp it into the partition at creation via the existing unused
    `externalCdcAllowed` option (`partition-service-core-base.js:82`), from
    the committed `tables` row;
  - or carry it on the committed command.

  Until then, record-time policy covers system tables only.
- A change to the static map is also an apply-semantics change. It falls under
  the release-owner envelope precondition (design R8-3), the same as any
  envelope change.

### Migration risk

| Concern | Evidence | Risk if the predicate were `externalCdcAllowed` alone |
| --- | --- | --- |
| The 23 propagated system tables (message-group cache propagation, `config` epoch, `nodes` rebalance trigger) depend on obligations | `cdc-propagation-filter.js:20`, bootstrap sites in §1.2 | **Fatal.** Every system table is ext=false, so cluster cache propagation would stop. The predicate must include icp |
| Seed retained-handoff census needs one ledger row per foundation statement on `message_groups`/`tables`/`partitions` | `seed-retained-partition-effects.js:225-231,277` | Safe with `icp||ext` (all three are icp=true). Would break with ext-only |
| Existing owed rows of suppressed tables on live data dirs stay owed forever after the change | ledger has no delete | Needs one deterministic committed retirement. Either a new committed command (for example `CDC_WAIVED`, positional like `CDC_DELIVERED`, admitted from the policy owner) or a one-time apply-time purge at a pinned entry. Size small-medium. Owner decision |
| User tables, ext=true default, no consumer | §1.2 | Recording policy does **not** fix them. See open decision D2 |

---

## 4. The sliding window: a duplicate-delivery path and a second catch-up owner

The mechanism (`partition-cdc-delivery.js`):

- **Recording.** `buildCDCSubscriberWrapper` calls
  `this.owner.cdcEventBuffer.recordDelivered(cdcEvent)` for every
  non-provisional answer (`:521`). This happens before the `CDC_DELIVERED`
  commits, in a 256-slot ring (`cdc-lifecycle-constants.js:17`,
  `cdc-event-buffer.js:218-241`).
- **Replay to a new subscriber.** The handshake replays the ring to every new
  subscriber (`:636-669`). It calls `deliverCDCEventToSubscriber(subscriber,
  replayEvent)` with no context (`:654`), which goes to `deliverCapturedCdcEvent`
  (`:56-69`, `:488-489`). That is a fresh invocation outside the lane, and no
  acknowledgement enters the ledger.
- **Order relative to the ledger drive.** The ledger drive runs only after the
  window replay (`:716`).

**Measured (probe L3, user table).**

- Subscriber A received and acknowledged 5 events, and the ledger committed
  them: `{owed: 0, delivered: 5}`.
- Subscriber B then subscribed. B received the same 5 events (`replayOnly:true`)
  through the window, with handshake `mode: sliding_window`,
  `slidingWindowEventsReplayed: 5`.
- The ledger was unchanged, and no `CDC_DELIVERED` was proposed for B.

**Verdict: yes, this is a duplicate-delivery path by a second owner.**

- One event is acknowledged once, by the ledger for A. A different owner then
  delivers it again, to B, with no ledger record.
- It is also a double for B in the race case. If an event is in the lane's
  `pending` (acknowledged by A, flag not yet committed) and the flush is
  refused, the next drive redelivers it to `{A, B}`. So B gets it twice, once
  from the window and once from the ledger. Consumer de-duplication by
  identity (`cdc-event-buffer.js:41-50`) masks it.

**Measured (L3b).** A third subscriber C refused inside the window.

- `subscribeToCDCWithHandshake` threw `cdc_subscriber_refused` out to the
  bootstrap caller.
- The ledger drive at `:716` was skipped, but C stayed registered
  (`cdcSubscribers.size === 3`).
- C's refusals then held the lane for everyone (`held_by_subscriber` on
  `entry:u-99`).

**What one owner of catch-up looks like.**

- Delete the window: `recordDelivered` at `:521`, the block `:630-669`, the
  ring in `cdc-event-buffer.js`, and the `slidingWindowEventsReplayed`
  handshake field (V16).
- The handshake becomes: register the wrapper, then
  `driveCdcObligations(SUBSCRIPTION_HANDSHAKE)`.

**What the window papers over (migration risk).** A subscriber that attaches
after another subscriber already acknowledged an event never receives it from
the ledger. The ledger serves only *owed* rows (`SELECT_OWED_AFTER`,
`partition-cdc-obligation-constants.js:113-119`). At bootstrap, subscriptions
are serialized per message group (`seed-cache-hydration-cdc-subscription.js:38-60`
and the `for` loops of the other sites). So message group 2 can miss events
that message group 1 already acknowledged, if they committed after group 2's
hydration read. **Unknown** whether hydration's read position always covers
that gap. The window covers it only heuristically: up to 256 events, and only
events already delivered to someone.

**The owner-shaped replacement: the ledger serves the handshake by position.**

1. The subscriber passes the position its hydration read was taken at (the
   partition's applied index).
2. The ledger owner adds a reader
   `readCdcObligationsAfter(db, {after, includeDelivered:true})`.
3. The handshake drive delivers from that position, delivered rows included,
   to that subscriber only.

That makes the ledger a cursor log, and couples catch-up to reclamation (§6
D1): delivered rows must be kept until every registered subscriber's position
has passed them. Size: medium to large. It touches the lane (a per-subscriber
cursor instead of the all-subscriber `pending` set), the three bootstrap sites
(pass a position), and the ledger (reader plus retention floor).

**Tests that pin the window.**
- `test/partition/cdc-sliding-window-catchup.exploration.test.js` (`:122-243`,
  asserts `slidingWindowEventsReplayed > 0` at `:199-204`);
- `test/partition/cdc-sliding-window-catchup.preservation.test.js` (`:144-293`);
- `test/integration/cdc-subscription-catchup.integration.test.js:294-316,458,520,606-632`;
- `test/partition/partition-cdc-obligation.test.js` O19 "sliding" variant
  (`:852-880`, plants into the ring by hand);
- `test/partition/cdc-event-buffer.test.js:348-366`.

All of them pin the volatile ring, not a ledger property.

---

## 5. Admin readiness reads `bufferedEvents` (always 0)

**Consumers.**

- `admin-service-discovery-readiness-context-methods.js:637-650`
  (`buildDiscoveryLocalPartitionCdcState`).
  - It reads `subscriberCount`, `bufferedEvents` and `bufferReplayInFlight`
    from `getCDCSubscriptionDiagnostics` (`partition-cdc-delivery.js:752-773`).
  - It applies only to `readinessRelevant` tables (`:613`), and every one of
    those is a propagated system table.
- `admin-control-snapshot-local-diagnostics-methods.js`:
  - `buildLocalCdcTelemetry :125-215` (`bufferedEvents`, `catchupLagEvents`,
    `mode`), exposed in the control snapshot
    (`admin-control-snapshot-local-build-base.js:753`);
  - `buildLocalCdcDiagnostics :220-323` (per-partition
    `ready = subscriberCount>0 && bufferedEvents===0 && !replayInFlight`,
    `bufferedPartitionIds`), served at
    `admin-websocket-diagnostics-route-methods.js:194`.

**Does a gate depend on it today?**

- **Yes, structurally.**
  - `markDiscoveryLocalPartitionCdcBuffered` sets `state.ready=false`
    (`admin-service-discovery.js:142-145`).
  - That feeds `localCdcReady`, then `topologyReady`, then
    `benchmarkReady`/`workloadReady`
    (`admin-service-discovery-replica-readiness-methods.js:125-142`), plus
    the reason `local_cdc_buffer_not_drained` (`:322-329`).
- **Its input is the dead buffer** (always 0, `bufferReplayInFlight` always
  false). So the arm never fires, and the gate depends in practice only on
  `subscriberCount`.
- **Tests that pin the arm use hand-written stubs:**
  - `test/admin/admin-websocket-api-http-and-debug-routes.test.js:58`
    (`bufferedEvents: 3`), `:97`;
  - `test/admin/admin-service-discovery.test.js:834-893` (injected
    `bufferedPartitionIds`).
- No script or harness consumer was found.
- Separately, `buildLocalCdcDiagnostics` marks every user-table and
  suppressed-table partition `ready:false` / `noSubscriber`. That is correct
  under §1.2, but it is noise for tables that by policy have no consumer.

**What readiness should read.** The owner's undelivered backlog: owed rows
that the lane has not yet acknowledged locally. The reason: an acknowledged row
stays owed for up to `ACK_FLUSH_DEADLINE_MS` (1 s), so raw `owed` would flap
the gate.

- The lane owns the input. One method on the delivery owner, for example
  `getCdcObligationBacklog()`, returns:
  - `{owed}` from `countCdcObligations(db).owed`
    (`partition-cdc-obligation-ledger.js:202-215`);
  - `pendingAcknowledgements` from the lane (`:678`);
  - `undelivered = owed - pending`;
  - `held` and `lastDrive.state` (`held_by_subscriber` meaning stuck);
  - the oldest owed log index.
- Readiness then reads:
  - "not drained" = `undelivered > 0` and the lane is held or the backlog is
    older than one flush deadline;
  - and `replay in flight` = `lane.inFlight`.

  Both admin consumers switch to that method, and `bufferedEvents` and
  `bufferReplay*` leave `getCDCSubscriptionDiagnostics` (census V15).
- Size: small. One owner method, two consumer edits, and two stub tests
  rewritten against a real lane state.
- Behaviour change: today the gate never fires on backlog. Afterwards it fires
  whenever a propagated system-table partition is wedged. That is the intended
  meaning, but it is a new failure surface for readiness waits. Budget a lab
  formation run.

---

## 6. Systemic root, fixes, open decisions

**Root.**

- `4151a3ab4` (2026-10-12, an unreviewed proof snapshot) did two things. It
  extended the TX1 obligation, which was designed for "a CDC event a committed
  participant decision owes" (`partition-cdc-obligation-ledger.js:3`), to every
  ordinary statement (`recordCommittedStatementCdc`). And it nulled the
  volatile emitter.
- It did not carry over the two things the volatile path did for an event
  nobody wants:
  1. the audience policy (`cdcEventHasNoAudience`: drop when no subscriber and
     icp=false, ext=false);
  2. a bound (a 1000-slot ring with drop-oldest).
- Design 8.3 never covers the no-consumer case. It specifies "owed until its
  flag is committed" and defers reclamation to a "retention owner" that does
  not exist.
- Historically, the policy itself was invented for exactly this growth
  problem: `ec1902973` (2026-03-02, "Fix benchmark CDC buffering") added
  `externalCdcAllowed` and `shouldBufferCdcWithoutSubscribers` to stop
  benchmark user-table writes filling the buffer, and `02b0c2b72`
  (2026-02-22) added the `logs` suppression set. The cutover reopened the same
  defect, durably and unbounded.

**Fixes.** Each has one owner.

| # | Defect | Owner / function | Change | Size |
| --- | --- | --- | --- | --- |
| F1 | Suppressed system tables owe forever | `cdc-table-policy.js` (new predicate) + `partition-cdc-obligation.js:146` (`recordCommittedOperationCdc`), guards `:123`, `participant-transaction-apply.js:405` | Record only when `icp || ext`, over the static map; delete V18 and the `logs` set | S |
| F2 | Existing owed rows for suppressed tables | ledger owner | One deterministic committed retirement (new positional command, or pinned purge) | S-M, decision D3 |
| F3 | Delivered rows never reclaimed (all propagated tables) | ledger owner + retention/snapshot owner | Reclaim delivered rows below a floor. This conflicts with (a) idempotent `CDC_DELIVERED` replay (`:211-215` refuses unknown positions), (b) the seed census, which needs delivered rows with `deliveredIndex` (`seed-retained-partition-effects.js:200-204`), and (c) position catch-up (§4) | M, decision D1 |
| F4 | User tables owe forever (no consumer exists) | `cdc-table-policy.js` `USER_TABLE_EXTERNAL_CDC_POLICY` + replicated override | Either default user tables to no-CDC until an external consumer exists, or build the consumer with a durable cursor; make the override replicated (partition creation stamp) before recording reads it | S (policy) / L (consumer), decision D2 |
| F5 | Sliding window second owner | `partition-cdc-delivery.js` handshake | Delete `:521`, `:630-669`, ring; ledger serves catch-up by subscriber position | M-L (with position), decision D4 |
| F6 | Readiness reads dead counter | delivery owner (new backlog method) + two admin consumers | §5 | S |

**Open decisions (owner).**

- **D1.** The reclamation floor for delivered rows. Options: the snapshot or
  compaction floor; the minimum subscriber position; or keep forever and
  accept growth on propagated tables. The decision must also settle `CDC_DELIVERED` replay
  idempotency below the floor, and the seed census reading delivered rows.
- **D2.** User-table external CDC. No production subscriber exists, so is
  `externalCdcAllowed:true` a promise with no consumer (the no-legacy rule:
  delete it, default to no-CDC), or a product to build?
- **D3.** How existing owed debt on suppressed tables is retired on upgraded
  data dirs, and under which release precondition.
- **D4.** Whether a late subscriber needs history at all. Two models:
  - CDC carries it: the ledger serves a position-based catch-up;
  - hydration carries it: the subscriber hydrates after subscribing, from the
    hydration read position.

  This decides whether the window's coverage of the multi-message-group
  bootstrap race is replaced, or proven unnecessary.

## 7. Unknowns

- **Partition images.** Whether the rs-raft partition state image carries
  `_cdc_obligations`. Design 8.3.6 says yes. I read only the peer-identity
  checkpoint (`snapshot-checkpoint-store.js:302-316`, which drops all
  non-peer tables), not the state-image builder.
- **Production write rate.** The real rate of `logs` writes per node. I did
  not measure it: one obligation per log line, times
  `LOGGING_BATCH_SIZE`/`FLUSH_INTERVAL_MS`. Note that metrics logs are off by
  default (`logging-constants.js:18`).
- **Hydration race.** Whether hydration's read position always covers events
  acknowledged between two serialized message-group subscriptions (§4).
- **Empty timestamps.** Whether a production command can carry an empty
  timestamp. If it can, it is recorded and then wedges the lane (§2.3).
- **Mixed versions.** Whether mixed-version replicas, where only one build
  applies F1, are excluded by the release precondition.

## 8. Probe reproduction

- The probes are run from the scratch tree:
  - `N=1000 node probe/policy-growth.probe.mjs {logs|user_external_false|user_default}`
  - `node probe/lane.probe.mjs`
- Copies of the probes:
  `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/legacy/probes-cdc-policy/`.
- Probe commands must carry an HLC timestamp. A fixture `timestamp: ''`
  reproduces the §2.3 side observation instead.
