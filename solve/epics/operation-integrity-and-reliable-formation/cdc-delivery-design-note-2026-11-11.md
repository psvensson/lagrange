# Design note: owner-level repair of system-table CDC delivery

Status: proposal for scoped review. Read-only analysis of the working tree on
`work/canonical-authority-epic-20261110` (HEAD `103f132c1` plus uncommitted
changes), 2026-11-11. Nothing here was run; every "fails today" statement is a
source-analysis prediction, not an observation. Structure follows
`docs/development/verification-templates/design-note-template.md`.

Legend for evidence: **[V]** = I read the cited lines myself in this session;
**[H]** = reported by the history census (quest logs, design records, commit
subjects), not re-read by me; **[M]** = measured by the lab runs quoted in the
brief; **[I]** = inferred, not established.

---

## 0. Decisions this note needs from the owner before Stage 2 and Stage 3

The record contains four positions this design touches. Stage 1 needs none of
them changed. Stages 2 to 4 need explicit rulings; they must not be read into the
existing records (R09).

| # | Existing record | What this design does | Ruling needed |
| --- | --- | --- | --- |
| O-A | D1 design §0.1 [H]: "Per-(subscriber, partition) durable marks would be a second progress owner ... I rejected them." `cdc-owed-work-admission` [H]: "No second durable progress ledger, retry framework or alternate write path." | Stage 2 keeps ONE durable fact (the delivered flag / compact prefix). Per-recipient cursors are tenure-local lane metadata, reconstructible, never durable. | Confirm that volatile per-recipient cursors are an extension of the existing in-memory lane progress (`src/cdc/cdc-propagation-progress.js:1-3`), not the rejected durable marks. |
| O-B | `cdc-owed-work-admission` [H]: the capacity "is not a new individual payload, event or target-vector cap"; "do not claim a fixed byte-size bound from event count. Any byte admission policy is a separate explicit owner decision." | Stage 1 adds a *shipping* bound (rows and bytes per wave). It refuses nothing: a row larger than the bound ships alone. | Confirm a scheduling bound is not an admission cap, or name the bound. |
| O-C | Landed D4 [H] + `architecture/bootstrap.md:278-287` [H]: subscribe-before-hydrate; "events at or below P that still arrive are absorbed by the cache's row-version merge". D4 design §4.2-4.4 [H]: ledger-backed catch-up from a cursor "not recommended" (binds D1 retention to min(P), needs a handoff registry surviving leader change). Open group-boundary decision [H] (`solve/epics/raft-rs-full-cutover.md:80`): (a) group subscribe-before-hydrate or (b) positional `readHydrationImage` backfill per partition leader. | Stage 3 is option (b) in a form that needs no source-side registry and does not bind retention: the *recipient* holds its position, each shipped range names its predecessor position, a mismatch is a typed gap, and the recipient re-lists. Events at or below the recipient position are dropped by position before the merge (the merge stays). | Choose (b) in this form; supersede the "absorbed by the merge" sentence with "dropped by position, merge retained as the convergence guarantee". |
| O-D | `architecture/runtime-contracts.md:187-199` [H]: the cache "never grants"; lead decision 2026-11-02 [H] rejected `awaitProjectionAt` inside heartbeat/latency loops. | Stage 4's position wait is a read-model freshness wait with the same restrictions as `awaitProjectionAt`. It gates no admission, promotion or write answer. | Confirm scope; decide whether `awaitProjectionAt` is replaced (one wait) or kept. |

A fifth item is not a contradiction but an inherited obligation [H]
(`solve/epics/raft-rs-full-cutover.md:80`): replace
`cdc_committed_acceptance_unknown` + `deferRetry` + backoff forever with a typed
`SUBSCRIBER_UNCONFIRMED{subscriber, position}`, an owner deadline, then a
permanent typed refusal. Stage 2 gives that state a home (section 5.6); the
deadline value and the permanent-refusal consequence are owner decisions and are
not designed here.

---

## 1. Claim, scope and current evidence

### 1.1 Invariant

For every CDC-propagated system table: every node's `SystemTableCache` reaches
the state of the source partition at committed position N within a delay that is
bounded by the cost of one delivery to *that* node, independent of backlog depth,
of other tables, and of other recipients; and a node that was not a recipient
when an event was acknowledged still obtains its effect without a timer.

### 1.2 Failing witnesses

- **Run A [M]** (no 400 ms poll): seed at 92-100 % CPU; `services` delivery to
  joiners 10 s behind at first targetability, 24-68 s later; drain at ~0.4x real
  time; zero refusals. Cause by source [V]: `drivePage` reads `limit: 1`
  (`src/partition/partition-cdc-obligation-delivery.js:407-412`),
  `deliverObligation` ships one event (`:366-396`), and the node admits one
  durable wave at a time across all tables
  (`src/topology/cdc-group-propagation-durable-delivery.js:477-486`). Each wave
  is a source message-group commit plus one commit per target group
  (`:385-412`, `src/message-group/message-group-cdc-committed-acceptance.js:287-311`).
  One row costs one full wave; rows arrive faster than waves complete.
- **Run B [M]**: one head event retried at 5.0 s intervals with
  `cdc_committed_acceptance_unknown`; every other table and recipient frozen.
  Cause by source [V]: a row is acknowledged only when every branch and leaf is
  covered (`delivery.js:384-389`, `src/cdc/cdc-propagation-progress.js:150-153`);
  an uncovered leaf throws, the row stays owed and the drive stops (`:363-365`);
  the invocation spends its budget; the node-wide slot is held meanwhile.
- **Pre-snapshot replays [M]**: `Out-of-order CDC event detected`
  (`src/message-group/cdc-handler.js:482-497` [V]) on joiners. Cause [V]: a new
  target receives whatever is still owed; nothing relates an event to the
  recipient's snapshot. The joiner's bootstrap snapshot is the seed's *cache*
  with no position (`src/bootstrap/bootstrap-topology-snapshot.js:61-69`,
  `src/bootstrap/phases/query-system-state-phase.js:416-470`).
- **Skipped-then-acknowledged window** (CL-014 [H]; `src/cdc/cdc-integration-service-authoritative-catchup.js:1-26` [V]):
  targets come from the sender's cache
  (`src/topology/cdc-group-propagation-routing.js:481-617` [V]); a group that is
  not yet a target is not a leaf, so the row is acknowledged and reclaimed
  without it. Compensated by timed authority re-reads.

### 1.3 Scope and separate claims

In scope: the delivery interaction between the partition CDC obligation lane
(source owner), `CDCGroupPropagationService` (topology owner of the recipient
set), the message-group committed-acceptance owner (recipient), and the
`SystemTableCache` observation owner. Out of scope: the recording rule (D2), the
ledger tables and `CDC_DELIVERED` byte form (D1), write admission
(`OWED_MAX_EVENTS`), HLC row merge and tombstones, the recipient-domain mapping
landed in `2753c6456` [H].

Three separate claims, per CLAUDE.md: (1) each stage's bounded repair, proven by
its deterministic test; (2) the formation service milestone (joiner caches
converge without the 400 ms loop) — needs a lab run, not claimed by any stage
test; (3) release acceptance — not claimed.

### 1.4 What is hypothesis

- That batching alone removes Run A's deficit. The arithmetic supports it (3.6
  events/s across tables against a wave rate of ~0.4-0.5/s per table means
  batches of under 10 rows keep up), but the seed's CPU saturation may have
  other contributors (memory notes name readiness projection cost). The next
  discriminating check after Stage 1: a lab run without the 400 ms loop,
  measuring per-table owed depth over time. Owed depth flat = confirmed.
- That Run B's stuck recipient was a not-yet-leader or not-ready target group
  rather than a routing error. Stage 2 isolates either; it repairs neither.

### 1.5 Capability comparison

No stage narrows capability. Stage 2b removes the node-wide slot and its
cross-table fairness slice (eleven commits between 11-03 and 11-08 [H]); section
5.5 argues the fairness it provided is unnecessary once no shared slot exists.

---

## 2. The delivery path today (consumed surfaces, all [V] unless marked)

1. **Record.** `recordCommittedOperationCdc` inserts `_cdc_obligations` rows in
   the apply transaction on every replica and, after commit, applies the events
   to the local node cache and (leader only) calls `driveCdcObligations`
   (`src/partition/partition-cdc-obligation.js:225-265`; local apply `:94-104`).
2. **Drive.** `driveOnce` → `drivePage(limit 1)` → `driveOneObligation` →
   `deliverObligation` (`partition-cdc-obligation-delivery.js:599-635`,
   `:407-412`, `:508-531`, `:366-396`). One tenure-local cell
   (`lane.currentObligation`) holds per-subscriber, per-leaf coverage for the one
   row (`src/partition/partition-cdc-obligation-progress.js:57-70`).
3. **Subscriber.** In-process on the leader's node:
   `buildPartitionCdcPropagationSubscriber`
   (`src/bootstrap/shared/partition-cdc-propagation-subscriber.js:206-266`),
   registered through `subscribeToCDCWithHandshake`
   (`src/partition/partition-cdc-delivery.js` — "Subscribe to CDC" method;
   callers `src/bootstrap/node-joining-publication-activation.js:325`,
   `src/bootstrap/bootstrap-service-replica-registration-methods.js:237`,
   `src/bootstrap/phases/seed-cache-hydration-cdc-subscription.js:109`).
4. **Wave.** `propagateDurableCdcEvent` (`durable-delivery.js:477-522`):
   node-wide admission, `captureCdcEvents([options])` (always one event),
   `captureDurablePropagationPlan`, then `deliverUncoveredLeaves` (`:385-412`):
   a serial loop over the source leaf (`source.applyCDCBatch(events)`) and each
   target (`deliverTarget` → `messageRouter.deliver`).
5. **Recipient.** `applyDurableCdcBatch`
   (`message-group-cdc-committed-acceptance.js:287-311`) reserves a wait keyed
   by the vector digest (`:110-147`), proposes one `CDC` or `CDC_BATCH` command
   (`capturedCommand`, `:35-39`), and answers the committed receipt from the
   apply's `afterCommit` (`:312-329`). Commit applies each member to the cache
   (`src/message-group/message-group-service-raft-timing.js:38-51`, `:64-80`).
6. **Acknowledge.** `acknowledgeDelivered` → batch → `CDC_DELIVERED`
   (`delivery.js:130-150`, `:169-216`); apply marks rows, reclaims the delivered
   prefix below the lowest owed row into `_cdc_obligation_progress`
   (`partition-cdc-obligation.js:346-391`,
   `src/partition/partition-cdc-obligation-ledger.js:297-314`).

**Already vector-shaped** (what Stage 1 reuses): the outcome owner binds
receipts to a vector digest and per-event bindings
(`src/cdc/cdc-delivery-outcome.js` — `cdcCommitWaitIdentity`,
`buildCommittedCdcOutcome`, `isCommittedCdcOutcome`); `targetDeliveryPayload`
emits `CDC_PROPAGATION_BATCH` for more than one event
(`durable-delivery.js:338-346`); `applyCDCBatch`, `applyDurableCdcBatch` and
`MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH` take arrays; the receiving side handles
`LATENCY_CDC_PROPAGATION_BATCH`
(`src/message-group/message-group-forwarding-owner-delivery-methods.js:414-514`,
`message-group-forwarding-owner-native-delivery-methods.js:125`). Only the
partition lane and `propagateDurableCdcEvent`'s capture are single-event.

**Positions that exist and are unused.** Events carry `sourceLogIndex` /
`sourceOrdinal` (`delivery.js:91-100`); the cache keeps a per-table monotone
maximum (`src/cache/system-table-cache-cdc-observation.js:158-195`), not a
contiguous position; the local-replica apply passes only `causeId` and
`cdcObservedAtMs`
(`src/control-plane/control-plane-system-table-gateway-cache-reconciliation.js:168-177`).
The authoritative catch-up already records a leader witness with `appliedIndex`
(`authoritative-catchup.js:327-349`). `readHydrationImage` returns rows and
applied index P in one synchronous span
(`src/partition/partition-service-hydration-image-methods.js:38-52`).

---

## 3. Target model in one paragraph

The ledger stays the single ordered, durable log of owed events with one durable
delivered prefix (unchanged D1). The lane ships *ranges* of it (Stage 1), keeps
one volatile cursor per recipient and acknowledges the minimum of the cursors
(Stage 2). Each shipped range names the position of the obligation immediately
before it; the recipient's cache holds a contiguous applied position per source
partition and answers a range whose predecessor it has not applied with a typed
gap, then re-lists from the partition leader at a witnessed applied index
(Stage 3). Consumers wait on that position instead of on timers (Stage 4).

---

## 4. Stage 1 — range shipping

### 4.1 Claim

A drive ships every owed row after the lane's scan cursor, up to a count and
byte bound, as one vector in one wave per target. Waves needed to drain a
backlog of B rows: ceil(B / bound), not B. Order, idempotent effect and
acknowledgement semantics are unchanged.

### 4.2 Changes

`src/partition/partition-cdc-obligation-constants.js`
- Add to `PARTITION_CDC_OBLIGATION_BOUND`: `SHIP_MAX_EVENTS` (propose
  `ACK_BATCH_MAX_EVENTS`, 256) and `SHIP_MAX_BYTES` (sum of `event_json` byte
  lengths; value is an owner choice under O-B; it must not exceed the router
  message limit and the message-group proposal limit, neither of which I
  established). Rule: a vector always holds at least one row, so a row above
  `SHIP_MAX_BYTES` ships alone and nothing is refused.

`src/partition/partition-cdc-obligation-delivery.js`
- `drivePage` (`:407-412`): read `limit: SHIP_MAX_EVENTS`, then truncate by
  `SHIP_MAX_BYTES` (first row always kept). Keep the captured tail
  (`lane.scan.through`): a pass stays finite.
- `resolveDriveObligationStep` (`:491-506`) stays per row and runs over the page
  before any await: rows already pending or at or below
  `hydratedThroughLogIndex` are skipped or acknowledged exactly as today; the
  vector is the maximal run of `READY` rows from the page head. An
  `ACKNOWLEDGEMENT_BACKPRESSURE` on the first row ends the pass as today.
- `deliverObligation` (`:366-396`) becomes `deliverObligationVector(delivery,
  lane, obligations, subscribers, context)`: `events = obligations.map(eventOf)`;
  `prepareCdcObligationProgress(delivery, lane, events, subscribers)`; one
  subscriber call per branch with the vector; on `COMMITTED` coverage of the
  whole cell, `acknowledgeDelivered` for each obligation in order.
- `driveOneObligation` / `recordObligationDeliveryResult` /
  `advanceScanCursor`: advance the cursor to the last row of the vector;
  `delivered` counts rows. `visited` (the `DRIVE_PAGE_ROWS` quantum) counts rows,
  so one pass still visits at most 256.
- **Vector pinning.** Coverage is bound to the exact vector digest
  (`observeCdcCoverage`, `coverageMatchesVector`). A retry after partial
  coverage must present the same vector or covered leaves are re-sent. The cell
  therefore records `{first, last}` positions; while a current cell exists the
  page read is `readOwedCdcObligations({after: before(first), through: last})`.
  If that read no longer returns the same rows (some were acknowledged through
  hydration), the cell is discarded and rebuilt; re-delivery is idempotent.
- **Acknowledgement capacity.** A vector is admitted only when
  `lane.commands.size < ACK_MAX_OUTSTANDING_BATCHES` (existing check, `:429-434`).
  Because a vector holds at most 256 rows, acknowledging it forces at most one
  flush; that flush has a free command slot by the precondition, and the
  remainder fits the emptied batch. If `acknowledgeDelivered` nevertheless
  returns false, the unacknowledged rows stay owed and are re-shipped (safe by
  R14); record it in the drive outcome so a test can see it.

`src/partition/partition-cdc-obligation-progress.js`
- `prepareCdcObligationProgress` (`:57-70`): binding is
  `cdcCommitWaitIdentity(events)`; `logIndex`/`ordinal` become `first`/`last`.
- `observeCdcSubscriber`, `cdcSubscriberInvocation`: pass `events`, not `[event]`.

`src/partition/partition-cdc-delivery.js`
- `deliverCDCEventToSubscriber` and `buildCDCSubscriberWrapper`: the durable
  contract becomes `(events, deliveryContext)`. `assertSubscriberAcceptance`
  checks `isCommittedCdcOutcome(answer, events)`. `canAcceptCDCEvent` is asked
  with the first event (the vector is one table, one partition).
  One contract, no per-event adapter (owner rule: one version of any logic).
  The non-durable path (`generateCDCEvent`, user tables) is untouched.

`src/bootstrap/shared/partition-cdc-propagation-subscriber.js`,
`propagatePartitionCDCEvent` in `src/bootstrap/node-joining-publication-activation.js`
and `src/bootstrap/owners/seed-runtime-bridge-owner.js`
- Take and pass the vector.

`src/topology/cdc-group-propagation-service.js`, `-durable-delivery.js`
- `assertPropagationRequest` (`service.js`): require `options.events` (dense,
  durable, one `tableName`).
- `propagateDurableCdcEvent` (`durable-delivery.js:477-522`):
  `captureCdcEvents(options.events)`. Nothing else changes: the wave, the
  progress and the payload builder already take `events`.

No change: ledger, `CDC_DELIVERED`, message-group files, cache.

### 4.3 Transition record

1. **Producer and consumer symbols.** Producer `driveCdcObligations` →
   `deliverObligationVector`. Consumer chain: subscriber wrapper
   (`buildCDCSubscriberWrapper`) → `buildPartitionCdcPropagationSubscriber` →
   `CDCGroupPropagationService.propagate` → `propagateDurableCdcEvent` →
   `source.applyCDCBatch` / `messageRouter.deliver` → `applyDurableCdcBatch`.
2. **Owner-defined shape.** The vector is the existing frozen event array from
   `captureCdcEvents`; each member is `eventOf(obligation)` (`delivery.js:91-100`).
   The answer is the existing committed / provisional / unknown outcome over the
   vector. No new type.
3. **Identity and generation.** Event: `(sourcePartition, eventKey, eventDigest)`.
   Vector: `cdcVectorDigest`. Lane: leadership tenure (`laneIsCurrent`).
   Subscriber: `subscriptionEpoch`. Recipient: `groupId` plus observed route
   lifetime fields (`cdc-propagation-progress.js:11-13`). Receipt: recipient
   `(groupId, logIndex, term)`. All unchanged; only the vector length differs.
4. **Ordering.** Rows are read `ORDER BY log_index, ordinal`; the vector
   preserves it; the recipient commits it as one entry and applies members in
   array order (`raft-timing.js:64-80`). Vectors of one partition are sent one
   at a time (lane single-flight), so vector order is log order.
5. **Absent versus unavailable.** No owed rows: `DRAINED`. No subscribers:
   `NO_SUBSCRIBERS`. Recipient not committed: `cdc_committed_acceptance_unknown`
   with `deferRetry` (unchanged). Not leader: `NOT_LEADER`.
6. **Durable commit.** Unchanged: the recipient group's commit of `CDC_BATCH`
   makes the receipt; the source partition's commit of `CDC_DELIVERED` makes the
   rows delivered.
7. **Retained obligations.** Every row of an uncovered vector stays owed. A
   partially covered vector keeps its covered leaves in the pinned cell; a lost
   cell re-ships the whole vector.
8. **Wake and cleanup.** Wakes unchanged (committed entry, leader elected,
   handshake, retry timer, after flush). Lane reset on tenure change discards
   the cell.

### 4.4 Invariants

- S1-a (R12): the number of waves to drain B owed rows is at most
  ceil(B / SHIP_MAX_EVENTS) plus one per byte-bound split. Pressure changes
  latency, never correctness.
- S1-b (R14): a vector re-shipped after any failure yields the same cache state
  (HLC last-writer-wins merge and tombstones; section 4.6).
- S1-c (R01, R03): a row becomes delivered only by a committed `CDC_DELIVERED`
  naming it, proposed only after every current leaf returned a committed
  receipt bound to a vector containing it.
- S1-d (R08): one durable subscriber contract; one outcome shape.
- S1-e (R13): the lane holds at most one pinned cell of positions and digests;
  no payload between attempts (unchanged header promise of
  `partition-cdc-obligation-progress.js:1-2`).

### 4.5 Failure, restart, leader change

- Source leader change or restart: lane reset; the new leader re-reads owed rows
  and ships them as new vectors. Recipients that committed the old vector apply
  the events again (idempotent).
- Recipient message-group leader change mid-wave: the wait is retired with
  unknown acceptance (`liveWait`, `committed-acceptance.js:55-59`); the leaf
  stays uncovered; the retry presents the same pinned vector. If the old entry
  did commit, the second commit is a duplicate apply.
- Same vector presented while its wait is still open on the recipient: typed
  backpressure (`:119`), as today.
- Unknown `CDC_DELIVERED` outcome: unchanged (`delivery.js:233-255`).

### 4.6 HLC merge and tombstones

A vector may contain several versions of one key (O12 in
`test/partition/partition-cdc-obligation.test.js`). Members are applied in
array order through `cdcHandler.applyImmediate` → `applySystemTableChange`, the
same path as today; `isStaleForExistingRecord` and the tombstone store decide
each member (`src/cache/system-table-cache.js:303-491`). Batching changes
neither the order nor the comparison. Note [H]: the envelope timestamp is
re-minted per receiver; only `data.updated_at_hlc` is origin-stable. A batch
must therefore carry each member's `data` unchanged, which `captureCdcEvents`
already guarantees.

### 4.7 Tests that pin today's behaviour and must change

- `test/partition/partition-cdc-delivery-progress.test.js:225` "source reads one
  payload per await while keeping its 256-visit quantum and captured tail":
  asserts `read.limit === 1`. Restate as "one bounded page per await"; keep the
  captured-tail assertion.
- Same file `:258` "435 owed obligations make bounded progress ..." and `:465`
  "contended page yield preserves open ACK batch ...": call counts change.
- `test/partition/partition-cdc-obligation.test.js`: O3 (`:270`), O4 (`:321`),
  O8 (`:540`), O9 (`:597`), O17 (`:898`), O18 (`:930`) count subscriber calls or
  pages per row.
- `test/partition/cdc-hydration-live-handoff.test.js` W-D4a (`:58`), W-D4c
  (`:143`), W-D4d (`:208`, asserts `prepareCdcObligationProgress` attaches
  `logIndex`).
- `test/partition/partition-cdc-topology-progress-currentness.test.js:194`
  (full continuation path) and the coverage tests at `:77-168`.
- `test/partition/partition-cdc-invocation-custody.test.js`,
  `test/partition/partition-cdc-obligation-reclamation.test.js` W-D1b, W-D1f.
- `test/topology/cdc-group-propagation-service.test.js:100`, `:132` (single
  event request shape) and `test/topology/cdc-group-propagation-service-harness.js`.
- `test/topology/cdc-recipient-domain-and-retained-debt.test.js:427`, `:450`.
- `test/cdc/cdc-delivery-complete-vector.test.js` should pass unchanged; it is
  the existing proof that the outcome owner handles vectors.
The list comes from grep on call-shape and constants, not from running the
suite; expect more.

### 4.8 Deterministic reproducers (fail on today's code)

Use the existing fixture of `partition-cdc-delivery-progress.test.js`
(`fixture(t, {rows, subscribers})`, `f.calls`, `f.drive()`, the partition's
injected `timeSource`).

- **R1-1 drain cost.** 600 owed rows, one subscriber answering committed.
  Drive until `DRAINED`. Assert subscriber calls <= 3 and every row delivered
  once in log order. Today: 600 calls.
- **R1-2 keep-up under load (virtual time).** Model: each subscriber call
  advances the virtual clock by W = 2000 ms; one row is committed per 1000 ms
  of virtual time (rows are inserted from the subscriber callback according to
  the clock). Run for 120 virtual seconds. Assert owed depth after every wave
  <= 2 * W / 1000 + 1. Today: depth grows linearly to about 60.
- **R1-3 partial coverage keeps the vector.** Two leaves; B answers unknown on
  the first wave, committed on the second. Assert A received exactly one
  delivery, the two presented digests are equal, and no `CDC_DELIVERED` was
  proposed before B's receipt.
- **R1-4 wire shape** (topology harness): one propagate with 5 events produces
  one `source.applyCDCBatch` call with 5 members and one
  `messageRouter.deliver` per target with type `CDC_PROPAGATION_BATCH`. Today:
  the request is refused or sends 5 waves.
- **R1-5 oversized row.** A row above `SHIP_MAX_BYTES` ships alone and is
  acknowledged.

### 4.9 Risks

- A larger `CDC_BATCH` entry in the message-group log and a larger router
  message. Bounded by `SHIP_MAX_BYTES`; the limits must be read before the
  value is chosen.
- A poison row now fails its whole vector. This is no weaker than today (the
  lane already stops at the head), but the retry re-ships up to 255 good rows.
- Formation: the seed hydration path acknowledges rows at or below P without
  delivery (`acknowledgeHydratedObligationsThrough`, `delivery.js:768-786`).
  The per-row pre-pass keeps that behaviour; R1 tests must include a
  hydrated prefix.

---

## 5. Stage 2 — recipient isolation

### 5.1 Claim

A recipient that does not answer delays only its own stream. Other recipients of
the same table, and all recipients of other tables, continue at their own rate.
The durable delivered prefix advances to the minimum recipient cursor.

### 5.2 Where progress lives (answering the brief's questions)

- **Stored:** in the lane's tenure-local progress, the object the lane already
  keeps between invocations (`cdc-propagation-progress.js`): each leaf's
  per-vector `coverage` is replaced by a `cursor {logIndex, ordinal}` ("this
  recipient holds a committed receipt for everything at or below this") and an
  `inFlight` vector identity.
- **Durable or reconstructible:** reconstructible. A new tenure starts every
  cursor at "unknown", which means the ledger floor (the lowest owed row), and
  re-ships from there; recipients absorb duplicates. Cost per leader change is
  at most `OWED_MAX_EVENTS / SHIP_MAX_EVENTS` = 16 vectors per recipient. After
  Stage 3 the first answer from a recipient carries its applied position and
  the cursor jumps to it. No durable per-recipient mark exists (O-A).
- **Reclaim point:** unchanged D1. `frontier = min(cursor)` over every leaf of
  every subscriber branch. Rows at or below the frontier are acknowledged
  through the existing batch; `reclaimDeliveredCdcObligations` reclaims below
  the lowest owed row. Because acknowledgement is now always a contiguous
  prefix, `RETAINED_DELIVERED_MAX` backpressure (`delivery.js:414-427`) can no
  longer trigger from the lane; keep the check until a test shows it dead, then
  delete it in a separate change.
- **Retention when a recipient is dead:** bounded by the existing
  `OWED_MAX_EVENTS` (4096). When reached, `admitCdcOwedWork` refuses new
  system-table writes with `partition_write_cdc_capacity`
  (`src/partition/partition-cdc-owed-admission.js:58-67`). This is today's
  contract and D1's ("pending obligations keep budget/backpressure, never
  silently dropped"); Stage 2 does not change it. It means a dead recipient
  eventually stops control-plane writes. Releasing it is the recipient-domain
  owner's decision, not the lane's: today a captured leaf is never dropped by
  cache omission (`refreshCdcPropagationRoutes`, `2753c6456` [H]) and is
  released only by lane reset or by the routing-domain transfer
  (`transferInvalidLatencyBindings`, `cdc-propagation-progress.js:39-96`).
  **Proposed, needs owner approval, lands only after Stage 3:** a typed
  recipient state `DETACHED` entered when the recipient-domain owner declares
  the group retired (the `RETIRED` / `INACTIVE` routing classes of `248f6707e`
  [H]); a detached recipient is not part of the frontier, and if it returns its
  first range answers a gap and it re-lists (Stage 3). This is the only
  mechanism in this note that lets an event be reclaimed without a receipt from
  a once-captured recipient, so it is the SUBSCRIBER_UNCONFIRMED permanent
  refusal of section 0 and must not be inferred.

### 5.3 Changes, in two independently landable parts

**2a — per-recipient cursors and frontier acknowledgement (partition lane +
progress).**

`src/cdc/cdc-propagation-progress.js`
- Leaf: `{groupId, route, cursor, inFlight, retry}`; `sourceCoverage` becomes
  the source leaf's cursor. `refreshCdcPropagationRoutes` adds a leaf with
  `cursor: null`. Route replacement keeps the cursor (a native receipt is a
  fact of the group, the rule already stated at `:114-117`) and clears
  `inFlight`. Provisional coverage does not move a cursor.
- `bindCdcPropagationProgress`: replace `next/observe/result` over one vector
  with `leaves()`, `observe(leaf, vectorLast, delivery)` (advance cursor on a
  committed receipt whose vector digest matches `inFlight`), `frontier()`.

`src/partition/partition-cdc-obligation-delivery.js`
- The lane keeps one progress per subscriber branch for the tenure
  (`lane.recipients`), replacing `lane.currentObligation`.
- One single-flight per recipient instead of one per partition:
  `driveRecipient(delivery, lane, leaf)` loops while the lane is current:
  read the vector after `leaf.cursor ?? floor` (bounded as in Stage 1, up to
  the current tail), deliver it to that recipient under its own
  `beginCdcDeliveryInvocation` context, observe, recompute the frontier,
  acknowledge rows that crossed it. `delivery.activeCdcInvocation` becomes a
  per-recipient map.
- `driveCdcObligations` starts or joins `driveRecipient` for every leaf.
- Retry state (`retryDelayMs`, `consecutiveBackpressure`, disposition) moves
  from the lane to the leaf, using `computeRetryDelayMs` unchanged. The lane
  keeps its single retry timer armed at the earliest leaf due time; the
  existing "earlier absolute `dueAtMs` wins" rule (`:330-335`, W-D4e) already
  supports this. No new timer and no new delay constant.
- `drivePrecondition`, `captureSubscriberCurrentness`: unchanged semantics.
- Scan fields `lane.scan.cursor/through/provisional` are replaced by the leaf
  cursors; the "finite pass" bound becomes: one `driveRecipient` iteration
  ships one vector, then yields to the event loop.

`src/partition/partition-cdc-obligation-progress.js`
- `cdcProgressCurrent`, `topologyBindingCurrent`: currentness of the branch and
  of each leaf, no longer of one cell.

**2b — remove the node-wide wave slot (topology).**

`src/topology/cdc-group-propagation-durable-delivery.js`
- `propagateDurableCdcEvent` becomes `deliverCdcVectorToRecipient(owner,
  {events, recipient, sourceMessageGroupService, deliveryContext})`: one
  recipient (the source group or one target), one child scope, no admission
  against `owner.activeDurablePropagation`.
- Delete: `activeDurablePropagation`, `DURABLE_PROPAGATION_ADMISSION.BUSY`, the
  whole slice machinery (`:34-37`, `:38-337`: waiting tables, credits, yield
  hold, `CONTENDED_SLICE_YIELD_HOLD_MS`, `BUSY_CONTENDED_RETRY_AFTER_MS`),
  `releaseDurableSliceContender`, and in the lane
  `registerLaneContentionOwner`, `releaseContendedPropagationOwners`,
  `wakeContendedLaneForSliceTurn`, `sliceTurnReady`.
- `deliverToTargetsWithRetry`
  (`cdc-group-propagation-delivery-methods.js`): the foreground retry loop
  (3 attempts, 50 ms doubling) wraps one recipient's delivery, not a wave.
- `captureDurablePropagationPlan` stays the one observation of the recipient
  set; the lane calls it through `bindTopology` as today.

### 5.4 Transition record

1. **Symbols.** Producer `driveRecipient`. Consumer
   `deliverCdcVectorToRecipient` → `source.applyCDCBatch` or
   `messageRouter.deliver` → `applyDurableCdcBatch`.
2. **Shape.** Request: the Stage 1 vector plus the recipient leaf
   (`groupId`, observed route). Answer: the existing outcome. Lane state:
   `cursor` is a ledger position `{logIndex, ordinal}`.
3. **Identity.** A cursor belongs to (leadership tenure, subscriber
   `subscriptionEpoch`, propagation lifetime, recipient `groupId`). Any of the
   first three changing discards it. A route change keeps it.
4. **Ordering.** Per recipient: one vector in flight, vectors in ledger order,
   so each recipient sees the ledger order. Across recipients: none. Frontier:
   monotone within a tenure; across tenures the durable prefix is monotone
   because `CDC_DELIVERED` only marks.
5. **Absent versus unavailable.** Recipient with no route: leaf retained,
   cursor not advanced, typed unavailable (existing). Recipient unanswered:
   `SUBSCRIBER_UNCONFIRMED{recipient, position}` as the named lane state
   replacing the bare unknown (section 5.6). No recipients at all: frontier is
   the tail (as today a zero-target propagation completes).
6. **Durable commit.** Unchanged: recipient group commit; then
   `CDC_DELIVERED` commit in the source partition.
7. **Retained obligations.** Every row above the frontier is owed in the
   ledger. A recipient ahead of the frontier holds events that are still owed;
   on leader change it receives them again.
8. **Wake and cleanup.** Committed entry and handshake wake every idle
   recipient drive. A leaf's retry is armed on the lane timer. A new leaf
   (re-observed plan) starts its drive at the floor. Lane reset retires every
   per-recipient invocation.

### 5.5 Invariants, and why the slot can go

- S2-a (R12): for recipients r and s of one partition, the time for an event to
  reach r does not depend on whether s answers.
- S2-b (R01, R03): `frontier <= cursor(r)` for every required r; a row is
  acknowledged only at or below the frontier. This is S1-c restated.
- S2-c (R10): cursors are never read by any durable decision other than through
  the frontier-to-`CDC_DELIVERED` path, and a lost cursor only causes
  re-delivery.
- S2-d (R13): in-flight work is bounded by (CDC-propagated tables hosted as
  leader on this node) x (recipients) vectors, each bounded by
  `SHIP_MAX_BYTES`; each has a named owner (its recipient drive) and ends at
  its invocation budget or lane reset.
- S2-e (R11): one delivery path per recipient; an unavailable recipient is a
  typed state on its leaf.

The slot serialised all tables through one wave and then needed slice counts,
credits and a 300 ms hold to stop one table starving another (commits
`ca61b0c2f` … `8ca34d98b` [H]). Its protective effect was to bound concurrent
proposals into message groups on a CPU-saturated seed (`97b6c0e30` "prevent a
seed CDC backpressure CPU storm" [H]). After Stage 1 the proposal *rate* falls
by the batch factor, and after 2a the *concurrency* is bounded structurally by
one in-flight vector per (partition, recipient). A recipient group that cannot
keep up answers typed backpressure from its own proposal queue
(`committed-acceptance.js:40-43`, `:296-299`), which the leaf honours with the
existing hinted delay. With no shared resource there is nothing to be fair
about, so the fairness machinery has no remaining purpose. This is an argument
from structure; whether the seed stays below saturation is the lab check named
in 5.9.

### 5.6 Typed unconfirmed state

Each leaf exposes `{state: CONFIRMED | UNCONFIRMED | DETACHED, position,
since}` in `getCdcObligationDiagnostics`. `UNCONFIRMED` replaces the anonymous
`cdc_committed_acceptance_unknown` retry in logs and admin diagnostics. The
owner deadline after which `UNCONFIRMED` becomes a permanent typed refusal, and
what that refusal does to the ledger, are the open decisions of section 0; 2a
lands the state and the observable without the deadline.

### 5.7 Failure, restart, leader change

- Source leader change: all cursors lost; every recipient is re-shipped from
  the floor. Acknowledgements proposed by the old leader that committed are
  seen in the ledger; those that did not leave rows owed.
- Recipient group leader change: that leaf's in-flight vector ends unknown; its
  drive re-observes the route and re-ships. Other leaves unaffected.
- Source message group (the local group on the leader's node) unavailable: it
  is one leaf; it holds the frontier but does not stop target leaves. Today it
  is leaf 0 of every wave and its failure fails the wave.
- Recipient set grows mid-stream: new leaf, cursor unknown, frontier drops to
  the floor until it catches up. The frontier never passes a row a current leaf
  has not confirmed.

### 5.8 Tests that pin today's behaviour

- `test/topology/cdc-group-propagation-service.test.js:316`, `:400`, `:515`,
  `:650`, `:734`, `:844`, `:909` — the seven "contended durable propagation"
  tests pin the slot and slices; they are deleted with 2b, replaced by R2-3.
- `test/topology/cdc-group-propagation-foreground-boundary.test.js:117-207` —
  foreground retry around a wave; restate around one recipient.
- `test/topology/cdc-group-propagation-stop-arms-nothing.test.js`,
  `test/bootstrap/seed-teardown-pending-cdc-delivery.test.js`,
  `test/message-group/message-group-native-w7-multi-target-route.integration.test.js`,
  `test/message-group/message-group-native-provisional-route.test.js` —
  reference `activeDurablePropagation` or slice fields.
- `test/partition/partition-cdc-delivery-progress.test.js:130`, `:168` (fair
  rotation across subscribers, mixed native and weak coverage),
  `partition-cdc-topology-progress-currentness.test.js` (all),
  `partition-cdc-obligation.test.js` O3, O11, O15, O17, O18,
  `partition-cdc-obligation-reclamation.test.js` W-D1b, W-D1f,
  `test/topology/cdc-recipient-domain-and-retained-debt.test.js:450`.

### 5.9 Deterministic reproducers

- **R2-1 isolation within a table.** Lane fixture, recipients A (commits at
  once) and B (its delivery promise never settles). Commit 50 rows with the
  virtual clock never advanced. Assert A received all 50 in order; no
  `CDC_DELIVERED` names any row; owed = 50; B's leaf is `UNCONFIRMED` at row 1.
  Today: A receives row 1 only.
- **R2-2 frontier.** A commits everything; B commits through row 20 then
  hangs. Assert `CDC_DELIVERED` batches cover exactly rows 1-20 and the compact
  progress or owed head sits at row 21.
- **R2-3 isolation across tables.** Topology harness, tables `services` and
  `replica_operations`, recipient B hangs for `services`. With zero virtual
  time elapsed assert the `replica_operations` vector was delivered to A and B.
  Today: the second table is answered `BUSY`.
- **R2-4 leader change.** Cursors A=30, B=10; reset the lane (new tenure).
  Assert both receive from the floor (row 11 if 1-10 were acknowledged), the
  final cache state equals the single-delivery state, and no row is
  acknowledged twice with a moved flag.
- **R2-5 capacity.** B never answers; commit until owed = `OWED_MAX_EVENTS`.
  Assert the next write is refused `partition_write_cdc_capacity`, A holds all
  4096, and after B answers the frontier and admission recover.
- **R2-6 retry isolation.** B answers backpressure with a hint; assert only B's
  leaf carries a retry due time and A's next vector ships without waiting for
  it.

### 5.10 Risks

- Largest change in the note; it rewrites the lane's scan. Land 2a behind the
  full Stage 1 test set; land 2b separately.
- More concurrent proposals on the seed than today. Lab check after 2b: seed
  CPU and per-recipient lag in a fresh three-host formation.
- `acknowledgeHydratedObligationsThrough` acknowledges rows at or below P for
  *all* recipients on the strength of the local group's image. With cursors,
  express it as "advance the local group leaf's cursor to P" so that remote
  leaves keep their own cursors. That changes seed formation behaviour (rows
  at or below P would then be shipped to remote groups that exist at that
  moment) and is the D4 design's own warning [H]; it needs its own witness.

---

## 6. Stage 3 — defined start position for a recipient

### 6.1 Claim

A recipient applies a range only if it has applied that range's predecessor.
Otherwise it answers a typed gap and re-lists the table from the partition
leader at a witnessed applied index P, after which it applies only events above
P. No event at or below the recipient's position is applied, and no event
acknowledged before the recipient existed is lost.

### 6.2 Mechanism

**Position cell.** The cache keeps, per source partition, a contiguous applied
position `X = {logIndex, ordinal}` or `UNKNOWN`
(`src/cache/system-table-cache-cdc-observation.js`, beside the per-table
watermark). It advances only by: (i) a committed range whose predecessor is at
or below X; (ii) a complete leader-witnessed list at P (`X := max(X, {P, max})`).
Stage 4 adds (iii) the local-replica apply. Provisional ingress, single-row
repairs and follower-served reads never advance it (consistent with
`movielens-ready-lease-cdc-provenance` [H]).

**Chain link.** Each shipped vector carries `sourcePartition`,
`after` = the position of the obligation immediately preceding its first row in
the ledger, and `through` = its last row. `after` is read from the ledger: the
highest retained row below the first, else the compact progress
`{throughLogIndex, throughOrdinal}`, else `{0, -1}`. New ledger function
`readCdcPredecessorPosition(db, position)` in
`partition-cdc-obligation-ledger.js`. This is the Raft `prevLogIndex` idea: a
recipient with `X >= after` has missed nothing; `X < after` means it missed at
least the event at `after`.

**Recipient decision** (group leader, before proposing, in
`applyDurableCdcBatch` via a new cache call `classifySourceRange(partition,
after, through)`):
- `X >= through`: `DUPLICATE`. Answer committed-equivalent "already applied"
  with `appliedThrough: X`; nothing proposed. The source cursor jumps to X.
- `after <= X < through`: `APPLY`. Propose; at apply, members at or below X are
  skipped by position, the rest go through the merge; `X := through`. The
  receipt carries `appliedThrough`.
- `X < after` or `X UNKNOWN`: `GAP`. Answer
  `{success: false, error: cdc_recipient_position_gap, deferRetry: true, have:
  X, need: after}`; nothing proposed; raise the re-list wake for that table on
  this node.

**Every node decides again at apply.** A group member whose own X is below
`after` when the committed entry applies still merges the members (they are
newer information and the merge is safe), does not advance X, and raises the
re-list wake on its own node. The cache is per node; the delivery unit is the
group; the cell must therefore be per node.

**List.** The re-list is the existing CL-014 catch-up for one table
(`hydrateCdcPropagatedTablesFromAuthority({tables: [t]})`), with two
requirements made explicit: it sets X only when the read came from the
witnessed leader (the same condition that already authorises the sweep,
`authoritative-catchup.js:314-326`) and only if rows and applied index were
read in one span on the leader. `readHydrationImage` provides exactly that;
whether the owner-RPC read lane uses it is **not established** (section 10).
If it does not, the leader-side read handler must be changed to.

**Source side.** A gap answer is dispositioned as hinted backpressure on that
leaf (existing policy, at most 250 ms, no doubling), not as transient failure.
After the re-list the recipient answers the same range `DUPLICATE` or `APPLY`.
The source keeps no registry of recipients' start positions and reclaims
nothing differently, so D1 retention is not tied to any recipient's P (the
objection recorded against cursor catch-up in the D4 design [H]).

**Bootstrap snapshot.** The joiner's snapshot from the seed cache
(`bootstrap-topology-snapshot.js:61-69`) carries no position, so X starts
`UNKNOWN`; the first range answers `GAP` and causes one list per table. Once
Stage 4 exists on the seed the snapshot can carry the seed cache's X per
partition and that list is avoided when the snapshot is current. Not required
for Stage 3.

### 6.3 Changes

- `src/cache/system-table-cache-cdc-observation.js`: the cell, 
  `classifySourceRange`, `advanceSourcePosition`, `recordListedPosition`.
  `src/cache/system-table-cache-observation-methods.js`: expose them.
- `src/partition/partition-cdc-obligation-ledger.js`:
  `readCdcPredecessorPosition`. `partition-cdc-obligation-delivery.js`:
  stamp `after`/`through` on the vector request (not inside the events, so
  event digests and the committed command members are unchanged).
- `src/topology/cdc-group-propagation-durable-delivery.js`:
  `targetDeliveryPayload` carries `sourceRange {sourcePartition, after,
  through}`.
- `src/message-group/message-group-cdc-committed-acceptance.js`
  (`applyDurableCdcBatch`, `deliverCapturedCdc`): classify before
  `reserveCdcWait`; `DUPLICATE` and `GAP` answer without proposing.
  `src/message-group/message-group-service-raft-timing.js` (`CDC_BATCH`
  application): skip members at or below X, advance X, raise the wake on a
  member-level gap. The committed command must carry `sourceRange` so that
  followers can decide; that adds one field to `CDC_BATCH`
  (`message-group-committed-command-admission.js:33-37` requires exactly two
  keys today and must be updated in the same change).
- `src/cdc/cdc-delivery-outcome.js`: add `CDC_COMPLETION.POSITION_GAP`,
  optional `appliedThrough` on the committed outcome, and the "already applied"
  outcome. `COMMITTED_OUTCOME_FIELDS` is a closed set (`outcomeFieldsMatch`),
  so each new field must be added there or the answer is rejected.
- `src/cdc/cdc-propagation-progress.js`: on `appliedThrough`, `cursor :=
  max(cursor, appliedThrough)`.
- `src/cdc/cdc-integration-service-authoritative-catchup.js`: per-table
  re-list entry point triggered by the wake; set X on a complete
  leader-witnessed list. `src/message-group/cdc-handler.js:482-497`: the
  out-of-order warning becomes unreachable for ranged events and is removed
  with them.

### 6.4 Transition record

1. **Symbols.** Producer: `driveRecipient` + `readCdcPredecessorPosition`.
   Consumer: `applyDurableCdcBatch` → `classifySourceRange`; committed
   `CDC_BATCH` application; `hydrateCdcPropagatedTablesFromAuthority`.
2. **Shape.** `sourceRange {sourcePartition, after:{logIndex, ordinal},
   through:{logIndex, ordinal}}`, owned by the partition ledger. Answers:
   committed (+`appliedThrough`), already-applied, `cdc_recipient_position_gap
   {have, need}`.
3. **Identity.** Position is (source partition id, log index, ordinal). The
   partition's log index is monotone across leader terms, so term is not part
   of the comparison; the list witness records term for diagnostics. A cell
   belongs to one cache instance; a new cache starts `UNKNOWN`. If a source
   partition is rebuilt with a new log (not a case I found, but D3's clean
   initialisation makes it possible), index comparison is invalid: the cell
   must also store the partition's identity token and treat a change as
   `UNKNOWN`. Which token identifies a partition incarnation is not
   established.
4. **Ordering.** X is monotone. A range is applied only as the immediate
   successor of what the cell holds.
5. **Absent versus unavailable.** `UNKNOWN` is a named state, never treated as
   position zero. A list that was not leader-witnessed leaves X unchanged and
   reports `position_unknown`.
6. **Durable commit.** None new. X is cache state, rebuilt by list. The
   authoritative facts remain the source partition's log and ledger.
7. **Retained obligations.** A gapped range stays owed for that recipient at
   the source. The recipient owes itself a list; that debt is the wake plus
   the fact that every later range will answer `GAP` again, so it cannot be
   lost by a missed wake.
8. **Wake and cleanup.** Gap raises the per-table list wake (single-flight per
   table per node; a second gap while a list runs joins it). Shutdown releases
   it through the existing terminal gate (`cdc-terminal-gate.js`).

### 6.5 Invariants

- S3-a (R01, R03): the recipient never infers completeness from having received
  "recent" events; completeness is the chain link or a leader-witnessed list.
- S3-b (R10): X is a projection fact. It selects between apply, skip and list;
  it grants nothing and discharges nothing at the source except through a
  committed receipt.
- S3-c (R11): a missing predecessor is the typed `GAP`, not a silent merge.
- S3-d (R14): duplicates are skipped by position; anything that slips through
  is still absorbed by the merge.
- S3-e (R12): a recipient that is far behind costs one list, not a replay of
  history.

### 6.6 Failure, restart, leader change

- Recipient node restart: cache and X are new; first range gaps; one list.
- Recipient group leader change: the new leader answers from its own node's X.
  If it is behind, it gaps and lists; the group's other members are unaffected.
- Source leader change: `after` is read from the replicated ledger, identical
  on the new leader.
- List races the stream: ranges answered `GAP` while the list runs are not
  applied by the leader; a follower merges them without advancing X. The list
  result is applied through the existing repair with its stale-merge guards and
  the race-guarded sweep (`authoritative-catchup.js:309-326`), then X := P.
  Events above P that were merged earlier remain (newer by HLC).
- Recovery circularity: the list needs a route to the source partition leader.
  That is the same prerequisite as today's catch-up and does not depend on the
  cache being current for that table. For the tables that provide the route
  (`services`, `nodes`) the bootstrap snapshot provides the initial route; a
  node with neither a route nor a stream cannot list, exactly as today.

### 6.7 HLC merge and tombstones

Position skip happens before the merge, so a replayed pre-list DELETE or UPSERT
is not presented at all; the resurrection cases of
`cdc-cache-delete-resurrection` [H] then arise only on the paths that bypass
position (provisional ingress, follower-gap merge, list apply), where the
existing merge and tombstone fences still apply. X must never be advanced by a
list that could not sweep (CL-014 residual 1 [H]: UPSERT-only catch-up cannot
remove rows deleted in the window): a list from a non-leader source repairs
rows but leaves X unchanged.

### 6.8 Tests that pin today's behaviour

- `test/message-group/cdc-handler.test.js` (out-of-order warning),
  `test/cache/system-table-cache-observation.test.js`,
  `test/cache/system-table-cache-cdc-provenance.test.js` (watermark shape).
- `test/cdc/cdc-authoritative-catchup-hydration.test.js`,
  `test/bootstrap/node-joining-cdc-catchup-wiring.test.js` [H] (catch-up is
  best-effort and positionless).
- `test/message-group/message-group-cdc-receiver-admission.test.js`,
  `message-group-cdc-input-guard.test.js` (closed command and answer shapes).
- `test/cdc/cdc-delivery-outcome.test.js`, `cdc-delivery-complete-vector.test.js`
  (closed outcome field set).
- `test/partition/cdc-hydration-live-handoff.test.js`,
  `test/bootstrap/seed-cache-hydration-handoff.test.js` [H],
  `test/integration/cdc-group-boundary-handoff.integration.test.js` [H]
  (W-D4a/b assert events at or below P are *absorbed*, i.e. delivered).

### 6.9 Deterministic reproducers

Model: a real ledger on a partition fixture; two recipient models each with a
real `SystemTableCache`; a list function that returns `readHydrationImage` of
the fixture. The virtual clock is never advanced in any of these; any timer
that would be needed shows as a failed assertion.

- **R3-1 the D4 critical witness.** Rows 1-10 delivered to A and reclaimed. B
  takes a snapshot at index 4. Rows 5-10 are acknowledged by A alone. B becomes
  a target; row 11 commits. Assert B's cache equals the authority's rows at 11,
  B performed exactly one list, and B applied no event at or below its X.
  Today: B lacks rows 5-10 until a sweep timer fires.
- **R3-2 no pre-snapshot replay.** B lists at P = 8 while rows 6-12 are owed.
  Assert the cache apply log contains only positions 9-12 and no out-of-order
  warning was logged.
- **R3-3 delete in the window.** Row k inserted at 3, deleted at 7; B's
  snapshot at 4 holds k. B becomes a target at 11. Assert k is absent after the
  list and X = P. Then feed a replay of the insert at 3: assert it is skipped
  by position.
- **R3-4 follower-served list.** The list is served without a leader witness.
  Assert X stays `UNKNOWN`, the next range answers `GAP`, and the wake is
  raised again.
- **R3-5 cursor jump.** New source tenure, B already at 40. Assert B answers
  the floor vector already-applied with `appliedThrough` 40 and the source
  ships from 41.
- **R3-6 member-level gap.** Group of two nodes; the follower's X is behind.
  Assert the leader commits, the follower merges without advancing X and lists.

### 6.10 Risks

- Formation: every joiner lists every propagated table once at first contact
  (about ten leader reads per joiner). Today's catch-up already does this once
  after subscription confirmation, so the load is comparable, but it now sits
  on the delivery path: until the list completes the recipient's leaf is
  unconfirmed and holds the frontier.
- A list that can never be leader-witnessed leaves a recipient permanently
  gapped, holding the frontier until `OWED_MAX_EVENTS` backpressure. This is
  the dead-recipient case of 5.2 and needs the same owner decision.
- Unbounded-growth tables (`replica_operations` and others [H]) were excluded
  from the periodic sweep "by construction". A list of such a table is a full
  read; if any is CDC-propagated it needs a bounded list or exclusion.
  `replica_operations` is in the uncommitted fast-catch-up set, so this is
  live.
- The closed shapes (`CDC_BATCH` two keys, outcome field sets) make this stage
  a wire change across the message-group boundary; mixed-version clusters are
  out of scope under the alpha mandate [H] but the change must land as one
  unit (R02).

---

## 7. Stage 4 — freshness contract for consumers

### 7.1 Claim

Every path that changes the cache from a source partition advances the same
per-partition position; a consumer can wait for "partition P applied through
position N" without a timer; and the timed compensations become deletable in a
stated order.

### 7.2 Changes

- **Local-replica path.** `applyCommittedEventsToPartitionState`
  (`src/partition/partition-cdc-obligation.js:94-104`) passes
  `{sourcePartition: service.partitionId, sourceLogIndex: event.logIndex,
  sourceOrdinal: event.ordinal}`; `applyCommittedPartitionCdcEventToCache`
  (`control-plane-system-table-gateway-cache-reconciliation.js:168-177`)
  forwards them and calls `advanceSourcePosition`. A replica applies every
  committed entry in order, so its position is contiguous by construction and
  needs no chain check. This stays the single sanctioned ingress of
  `system-cache-reconciliation-ingress` [H] ("pass operation, original row,
  causeId and explicit CDC timestamp unchanged" — the position is additional
  metadata, not a change to those). The try/catch at `:77-92` currently
  swallows a failed local apply (W-D1h); a failed apply must leave X unadvanced
  and set the cell `UNKNOWN` so the node lists.
- **Seed hydration.** `hydrateTableFromLocalPartition`
  (`src/bootstrap/phases/seed-cache-hydration-phase.js:429-449`) records
  `recordListedPosition(partition, image.appliedIndex)`.
- **Write answer.** The routed write answer already carries
  `position {tableName, key, originHlc}` [H]. Add
  `source {partitionId, logIndex, ordinal}` for a write that produced an event.
  A write that produced none answers the named state "no event" (R07), as the
  zero-row case does today.
- **Wait primitive.** `awaitSourcePosition({partitionId, logIndex, ordinal},
  {abortSignal, statement})` in
  `src/cdc/cdc-integration-service-projection-wait.js`, sharing
  `awaitProjectionAt`'s listener, abort and shutdown handling (`:132-174`):
  resolves `reached` when `X >= position`; typed endings `shutdown`,
  `client_disconnected`, `position_invalid`, `projection_unavailable`. While
  the cell is `UNKNOWN` the wait stays open and the list wake is raised; a
  completed list at `P >= position` resolves it. No timer. Same use
  restrictions as `awaitProjectionAt` (O-D): read-your-writes for a client or a
  durable job, never inside heartbeat or latency loops, never as a grant.
- **Diagnostics.** Admin readiness reports X per partition and each leaf's
  cursor and state, replacing the `bufferedEvents` counter that is always 0
  [H].

Not done: an idle checkpoint (a "resolved through N" marker sent when no event
exists). It would let a wait on an arbitrary log index resolve, but it needs
traffic on an idle partition. The wait is defined on event positions returned
by the write answer, so it is not needed.

### 7.3 Transition record

1. **Symbols.** Producers: committed `CDC_BATCH` application, 
   `applyCommittedPartitionCdcEventToCache`, the list. Consumer:
   `awaitSourcePosition`, admin diagnostics.
2. **Shape.** The Stage 3 cell; the write answer's `source` position.
3. **Identity.** As Stage 3 item 3.
4. **Ordering.** X monotone; a waiter resolves at the first X at or above its
   position.
5. **Absent versus unavailable.** No event: named state, nothing to wait for.
   `UNKNOWN` cell: wait stays open, list wake raised. No cache: 
   `projection_unavailable`.
6. **Durable commit.** None; the write's commit in the source partition is the
   fact, the position is where the projection will show it.
7. **Retained obligations.** Open waiters are held until reached, shutdown or
   client abort (existing `holdUntilShutdown`).
8. **Wake and cleanup.** Cache change listener; removed on settle.

### 7.4 Invariants

- S4-a (R01): one position per (cache, source partition), advanced by one owner
  (`system-table-cache-cdc-observation.js`).
- S4-b (R10, O-D): the position is a read-model fact; no admission, promotion
  or write answer reads it.
- S4-c (R11): one wait; an unknown position is typed.
- S4-d (R13): waiters are owned by the integration service and end at shutdown.

### 7.5 Compensation mechanisms and when each becomes deletable

| # | Mechanism | Where | Deletable after | Condition |
| --- | --- | --- | --- | --- |
| C1 | 400 ms services-convergence loop, 6 s tail, `_fastConvergenceTimer` | uncommitted in `src/control-plane/membership-publication-coordinator-reconcile-helpers.js` (`DEFERRED_SERVICES_CONVERGENCE_CATCHUP_COOLDOWN_MS`, `scheduleFastConvergenceFollowupIfNeeded`) and `-reconcile.js:198-203` | Stage 1 + 2a | Never land it; it also contradicts the routing-table-convergence binding "no new timer, sleep or cadence" [H]. Confirm with the lab check of 1.4. |
| C2 | Node-wide wave slot, slice rotation, 300 ms yield hold, 10 ms busy retry | `src/topology/cdc-group-propagation-durable-delivery.js:34-337` | Stage 2b | R2-3 green. |
| C3 | Foreground wave retry sleeping inside a shared slot | `src/topology/cdc-group-propagation-delivery-methods.js` (`deliverToTargetsWithRetry`) | Stage 2b | Kept, but per recipient; the shared-slot cost disappears. |
| C4 | Out-of-order detection by HLC | `src/message-group/cdc-handler.js:482-497` | Stage 3 | Position skip covers ranged events. |
| C5 | Fast (5 s) cooldown of the propagated-table sweep on a services gap or local non-terminal operations | `membership-publication-coordinator-reconcile-helpers.js` (`resolveDeferredPropagatedCatchupCooldownMs`, `DEFERRED_PUBLICATIONS_CATCHUP_COOLDOWN_MS` branch) | Stage 3 | Gap-triggered list replaces it. |
| C6 | Publications sweep, 5 s cooldown, leader pinned | `membership-publication-coordinator-reconcile.js:93-147` | Stage 3 + lab evidence | Only when the sweep's own counters show zero repairs over a soak; CL-001 (stale publications on a rejoined owner, open [H]) must be closed first. |
| C7 | Propagated-table sweep, 30 s cooldown | `membership-publication-coordinator-reconcile.js:149-226` | owner decision | Keep as a low-rate anti-entropy trigger of the same list algorithm; `authority-and-recovery.md` says periodic reconciliation is a legitimate trigger. Make "sweep found a difference" an alarm metric. Delete only on evidence. |
| C8 | Post-subscription catch-up at join | `src/bootstrap/node-joining-ready-signal-readiness.js:575-607` | Stage 3 | Not deleted: it becomes the first list and sets X. Its "best-effort, never blocks readiness" contract (CL-014 [H]) is unchanged. |
| C9 | Per-row authoritative refresh and cache-visibility wait | `src/cdc/cdc-integration-service-cache-visibility-wait.js` (`refreshAuthoritativeCacheRow`, `:138`), `cdc-integration-service-cache-visibility-authority.js:196-337` | Stage 4 | After a caller census; callers that wait for their own write move to the position wait. |
| C10 | `awaitProjectionAt` (per-row HLC) | `src/cdc/cdc-integration-service-projection-wait.js:132-174`; callers `src/query/table-creation-service-durable-job.js:27`, `src/control-plane/owners/runtime-access-policy-owner.js:627` | Stage 4 | Replace, do not keep both (one wait). Its recorded hazards [H] — bootstrap rows without `updated_at_hlc`, clock skew leaving a wait pending — do not exist for a log position. |
| C11 | Cache divergence detector | `src/cdc/cdc-integration-service-cache-divergence.js` | Stage 4 | Becomes diagnostics only; no repair action. |
| C12 | Per-table monotone watermark | `src/cache/system-table-cache-cdc-observation.js:158-195` | Stage 4 | Superseded by the cell, after a reader census. |
| C13 | Positionless bootstrap snapshot | `src/bootstrap/bootstrap-topology-snapshot.js:61-69` | Stage 4 | Carry X per partition; not deleted. |

Order: C1 (never lands) → C2, C3 with 2b → C4, C5 with Stage 3 → C9-C13 with
Stage 4 → C6 then C7 only on soak evidence and owner decision.

### 7.6 Tests that pin today's behaviour

`test/cdc/cdc-projection-wait-observable.test.js`,
`test/cdc/write-then-read-projection-census.test.js`,
`test/cdc/routed-system-table-write-answers-at-commit.test.js`,
`test/control-plane/runtime-access-settled-replay-projection.test.js` [H],
`test/partition/partition-cdc-obligation-reclamation.test.js` W-D1g, W-D1h
(local apply shape and swallowed failure),
`test/control-plane/membership-publication-deferred-catchup.test.js`,
`test/control-plane/publications-catchup-leader-pinned-read.test.js`,
`test/cdc/cdc-cache-visibility-wait-bound-spent.test.js`,
`test/cdc/cdc-refresh-authoritative-cache-row.test.js`,
`test/cache/system-table-cache-observation.test.js`.

### 7.7 Deterministic reproducers

- **R4-1 local replica records a position.** Three-replica partition fixture;
  commit 5 writes. Assert each replica's cache cell for the partition equals
  the last event position. Today: no index is recorded on this path.
- **R4-2 wait resolves on delivery, not time.** Recipient cache at X = 10;
  `awaitSourcePosition` for 12; deliver range (10, 12]. Assert it resolves in
  the same turn as the apply; the virtual clock holds no pending timer at any
  point.
- **R4-3 wait across a gap.** Waiter for 12, cell `UNKNOWN`. Assert the list
  wake fired once and a list at P = 15 resolves the wait.
- **R4-4 no-event write.** A no-op write answers the named state and a caller
  that waits on it returns at once.
- **R4-5 failed local apply.** Make the cache apply throw for one event.
  Assert X does not advance, the cell is `UNKNOWN`, and the ledger row is
  still owed.
- **R4-6 two feeds, one cell.** On the leader's node the local apply and the
  local group's committed range both arrive. Assert the range is classified
  `DUPLICATE` and each event reached the merge once.

### 7.8 Risks

- A second wait primitive living beside `awaitProjectionAt` for longer than one
  change is exactly the duplication the owner forbids; plan the caller
  migration in the same quest.
- R4-5 changes W-D1h's pinned behaviour (failure stays with the partition
  catch). The row stays owed either way; only the cache-side consequence
  changes.

---

## 8. Cached views (template item 3)

| View | Authority | Invalidation | Stale read | Recovery |
| --- | --- | --- | --- | --- |
| Lane per-recipient cursor | Recipient group's committed receipts; ledger for the floor | Tenure, subscription epoch, propagation lifetime | A low cursor re-ships (idempotent). A cursor cannot be high without a receipt or a recipient-reported applied position. | Reset to the floor. |
| Sender's cache as the recipient set | `services` / `message_groups` / `nodes` partitions | CDC to the sender's own cache | A missing recipient is not shipped to and does not hold the frontier; when it appears it gaps and lists (Stage 3). A stale extra recipient holds the frontier until the domain owner releases it. | Plan re-observed on every currentness check (`cdcPropagationProgressCurrent`). |
| Cache position cell | Source partition log | New cache, failed apply, partition identity change | `UNKNOWN` or low: more lists, never a skipped event. It cannot be high unless a list was wrongly witnessed; hence the leader-witness and one-span requirements. | List. |
| Recipient commit waiters | Recipient group apply | Group lifetime, budget, parent retirement | Unknown acceptance. | Re-ship. |

A stale observation cannot resurrect a closed obligation: delivered rows are
changed only by committed `CDC_DELIVERED`. It cannot veto progress forever: a
low cursor or an `UNKNOWN` cell is repaired by the next answer or list. The one
permanent veto is a recipient that never confirms, which is the open decision.

---

## 9. Comparison with other systems

| Problem | Kafka | Kubernetes informer / etcd watch | CockroachDB rangefeed | This design |
| --- | --- | --- | --- | --- |
| Throughput per round trip | Fetch returns a batch of records from an offset | Watch stream delivers events in order, batched by the transport | Events streamed, checkpoints batched | Stage 1: ship a bounded range of the ledger per wave. |
| Slow consumer | Each consumer group has its own offset; the log does not wait | Each watcher has its own channel; a slow watcher is dropped and must re-list | Each feed has its own frontier | Stage 2: one cursor per recipient. Unlike Kafka the log *does* wait (the frontier is the minimum), because D1 reclaims only what every recipient confirmed. |
| Retention with a dead consumer | Time or size retention; a consumer past it gets offset-out-of-range and resets | Compaction; watcher gets "too old resource version" and re-lists | GC threshold; feed errors and restarts from a new scan | Today and after Stage 2: `OWED_MAX_EVENTS` backpressure on writers. Proposed `DETACHED` + re-list (5.2) is the etcd behaviour and needs an owner decision. |
| Start position | Committed offset, or earliest/latest policy | List returns a resourceVersion; watch starts strictly after it | Catch-up scan from a timestamp, then live events | Stage 3: list at leader-witnessed applied index P, stream above P. |
| Gap detection | Offsets are dense; a jump is visible | Bookmark / resourceVersion continuity; 410 Gone | Checkpoints; restart on error | Stage 3: each range names its predecessor position (the Raft `prevLogIndex` check); mismatch is a typed gap, then re-list. |
| Consumer freshness | Consumer lag = log end offset minus committed offset | Informer `HasSynced`, last synced resourceVersion | Resolved timestamp: "no more events at or below T" | Stage 4: contiguous applied position per source partition and a wait on it. The resolved-timestamp idea (a checkpoint with no event) is deliberately not adopted (7.2). |
| Where the cursor lives | Broker-side, durable (`__consumer_offsets`) | Client-side, volatile | Client-side, checkpointed by the consumer | Source side volatile per tenure (O-A forbids durable marks); recipient side in its cache, rebuilt by list. Closest to the informer. |

Borrowed ideas by stage: Stage 1 — Kafka's batched fetch. Stage 2 — Kafka's
per-consumer offsets, with the reclaim rule kept from D1 rather than Kafka's
time retention. Stage 3 — informer list-then-watch and "too old → re-list",
with Raft's predecessor check as the gap detector. Stage 4 — consumer lag and
the informer's synced version; rangefeed checkpoints considered and left out.

---

## 10. What I could not establish

1. Whether the owner-RPC authoritative read returns rows and applied index from
   one synchronous span on the leader (Stage 3 depends on it). I verified that
   the witness carries `appliedIndex` (`authoritative-catchup.js:327-333`) and
   that `readHydrationImage` is atomic; I did not read the serving handler.
2. Router message size limit and message-group proposal size limit, needed to
   choose `SHIP_MAX_BYTES`. The census reports W9 obligations of "actual 2 MiB"
   and "65-target / over-64-vector" [H]; I did not read those tests.
3. Message-group membership shape in a three-host formation (one group per
   node or shared), and whether a message-group snapshot carries cache state to
   a new member. The per-node cell is designed to be correct either way.
4. Which subscribers register on obligation-recording partitions besides
   `buildPartitionCdcPropagationSubscriber`. I found three registration sites
   that use it; `src/config/dynamic-config-startup-wiring.js:512` and the
   index-service handler were not traced. Stage 1's single vector contract
   needs that census first.
5. Whether a system table can have more than one partition. The code assumes
   one (`INITIAL_PARTITION_IDS`, `isValidSinglePartitionLocalObservation`); the
   cell is keyed by partition so it does not depend on it, but a list is per
   table and would then need all partitions.
6. What identifies a source partition incarnation (Stage 3 item 3).
7. The decision record for `acknowledgeHydratedObligationsThrough` and for
   leader-local apply at commit: the census found none [H]. Stage 2 changes
   the first (5.10) and Stage 4 the second.
8. The census reports `405f35609` "parallelizes remote leaf delivery" [H]; the
   loop I read (`durable-delivery.js:385-412`) awaits each leaf in turn.
   Either it was reverted or the parallelism is elsewhere.
9. The `cdc-recipient-domain-and-retained-debt` log names durable obligations
   in `system.cdc_pending_propagation`; the census found that identifier
   nowhere in source [H]. I treated per-target progress as in-memory only,
   which is what the code shows.
10. The full list of tests each stage breaks. The lists are from grep.
11. I did not read the D1 and D4 design documents or the owner review
    themselves; section 0 rests on the census's quotations of them.
12. No test or lab run was executed. The Run A arithmetic and the claim that
    the slot can be removed without saturating the seed both need the lab
    checks named in 1.4 and 5.10.

---

## 11. Evidence and closure

- **Safety** (per stage): no row is marked delivered without a committed
  receipt from every required recipient (S1-c, S2-b); no cache applies a range
  without its predecessor or skips an event it has not applied (S3-a); cache
  state after any duplicate equals the single-delivery state (S1-b, S3-d).
  Evidence: R1-3, R2-2, R2-4, R3-1, R3-3, R4-6.
- **Recovery progress** under finite failures: after a source leader change,
  recipient leader change, recipient restart or lost answer, every owed row is
  delivered and acknowledged once the failed party answers. Evidence: R2-4,
  R2-5, R3-4, R3-5, R4-3. Not covered: a recipient that never answers (open
  decision).
- **Resource bounds**: waves per backlog (R1-1, R1-2); in-flight vectors
  (S2-d); owed rows (`OWED_MAX_EVENTS`, R2-5); lists per recipient (R3-1).
- **Evidence kinds**: every R-test is deterministic on injected time sources
  with real ledger, lane and cache objects; none uses a wall-clock timeout.
  They prove the bounded repairs. The service milestone (formation converges
  without C1) needs a three-host lab run after Stage 2 and again after Stage 3;
  that is a separate claim and a separate record.
- **Suggested work units**: one Quest per stage part (1, 2a, 2b, 3, 4), each
  with its R-tests as the sealed probe, in that order; O-A and O-B before 2a,
  O-C before 3, O-D before 4.

---

## Amendments 2026-11-11 (external review)

Appended after the Stage 1/2 repair review; the sections above are kept as
written and are superseded only where stated here (R09).

**A. The opening invariant (1.1) is restated.** "Delay bounded by the cost of
one delivery to that node, independent of backlog depth" is not achievable:
Stage 1 itself ships a backlog as several bounded waves. The claims are now:
(i) isolation - a slow, refusing or dead recipient does not delay another
recipient of the same table or any recipient of another table (S2-a; witnessed
by R2-1, L2, L6); (ii) conditional progress - under declared assumptions
(finitely many failures per recipient, offered load below the drain rate of
`SHIP_MAX_EVENTS`-row vectors at the measured per-wave cost) every owed row is
delivered and acknowledged, and catch-up of a backlog of B rows costs
ceil(B / SHIP_MAX_EVENTS) waves per recipient. The bounds are to be measured on
lab hosts: drain throughput, owed depth over time, bytes per wave, receiver
proposal-queue depth and event-loop delay on the seed.

**B. Occurrence identity and order are inside the owned interaction.** The HLC
merge does not safely absorb same-entry siblings: every event of one committed
entry carries the entry's HLC, the recipient's CDC handler deduplicated by
(table, operation, key, timestamp) and dropped the second update of a row in
one entry, and an older range committing late overwrote a newer member.
Repaired now (finding 6): a durable event's identity is its source occurrence
(`eventKey`) in the handler; the cache's merge orders two versions of one
source entry (same origin HLC, source partition and log index) by source
ordinal (`system-table-cache-source-order.js`), including a newer member
superseding its own entry's tombstone. Witnesses:
`test/message-group/cdc-vector-application-equivalence.test.js` (same-entry
replay/reorder, late older range, seeded convergence property). Stage 3's
"a gapped follower may still merge safely" is an open claim that needs its own
proof before Stage 3 relies on it.

**C. Source incarnation and snapshot-position atomicity come first.** No
position-based skip or acknowledgement may land until (1) a position names its
source incarnation (a rebuilt log reusing indexes must never be compared
blindly; the same-entry tie-break above compares only within one origin HLC,
partition and log index), and (2) a list's rows and position describe one
authoritative image read in one span on the witnessed leader.

**D. Late and dead recipients stay explicit.** No pretend-acknowledgement, no
release on cache omission, no retirement inferred from elapsed time. Any
DETACHED / re-list contract needs authoritative lifecycle evidence for the
group's retirement and a witness that the write which retires the group is not
itself refused by the `OWED_MAX_EVENTS` capacity it must free. Removing the
node-wide slot (2b) makes concurrency proportional to (source partitions
leading here) x (recipients); a row-count bound plus a byte target that admits
an oversized singleton is not a fixed node-wide memory bound. Receiver
pressure (proposal-queue backpressure, the typed duplicate-in-flight answer)
stays; what must be measured is in A.

**E. Recipient waits are named (repair of the Stage 2 review).** A recipient
behind the owed tail is either running, waiting on its delivery's actual local
cleanup (woken by that cleanup, also across a tenure change), in its own
backoff (woken by the lane timer armed at its due time; a commit's wake never
ships to it), or started. A drive ends only on one of these, and the lane's
DRAINED outcome (which disarms the retry) derives from the ledger: it is
reported only when no recipient is behind the owed tail. A release of the
propagation binding restarts its primary recipient; a receipt shipped under a
binding that was released meanwhile confirms nothing.

---

## Stage 3 as built, and the dead-recipient measures (2026-11-11)

Appended by the CDC writer under the owner ruling of 2026-11-11 ("please do
all 1, 2 and 3 now"; quest log fresh-formation-user-table-routability, entry
143). The sections above are kept as written; where this section differs it
supersedes them (R09), and each supersession is named below. Unit level only:
nothing here is lab-measured, and nothing is independently verified yet.

### S3.1 What was built

- **Source incarnation.** No per-log incarnation exists in the source: the
  raft-rs applied state, the snapshot identity `{clusterId, raftGroupId}`
  (clusterId is the same for every log of a cluster, and a backup restore keeps
  it), the opening history, the services-row birth (`created_at`, per replica)
  and the node boot incarnation were read; none changes when one partition's
  log is rebuilt. The ledger therefore mints one, owned with the positions it
  qualifies: `_cdc_ledger_incarnation` (`partition-cdc-obligation-ledger.js`,
  `ensureCdcObligationLedger`), written inside the application transaction of
  the first committed entry that records an obligation under this build, from
  that entry's identity (`term:index:entryId`), INSERT OR IGNORE, so every
  replica and every snapshot install holds the same value. Every range and
  every image names it; a position of another incarnation is never compared
  (cell: a range of another incarnation is a GAP; an image of another
  incarnation replaces the cell).
- **Ranges.** Each shipped vector carries `sourceRange {sourcePartition,
  incarnation, after, through}` beside the events (`sourceRangeOf`,
  `partition-cdc-obligation-vector.js`); `after` is
  `readCdcPredecessorPosition` (highest retained row below the first, else the
  compact progress, else `{0,-1}`). It rides the recipient invocation
  (`cdcRecipientInvocation`), the topology payload (`targetDeliveryPayload`),
  the source group's `applyCDCBatch` options, the follower-to-leader forward
  payload, and the committed command: a durable `CDC_BATCH` is exactly `{type,
  events, sourceRange}`; an ordinary one exactly `{type, events}`; a single
  `CDC` command never carries a durable event
  (`message-group-committed-command-admission.js`, refusal
  `message_group_cdc_batch_shape_invalid`). One wire change; no positionless
  durable form remains.
- **Position cell** (`system-table-cache-cdc-observation.js`,
  `SystemTableCacheSourceOrder`, which replaces
  `system-table-cache-source-order.js`): per source partition `{incarnation,
  position, state UNKNOWN|CURRENT|GAP, need}`. It advances only by a committed
  range whose predecessor is at or below it, or by a complete leader image.
  The per-key same-entry order is kept, in the same owner, as the within-entry
  rule for paths no range gates (local-replica apply, provisional ingress, list
  rows): the cell cannot subsume them, and the tie exists only inside one entry
  (same origin HLC, partition and log index).
- **Recipient decisions.** The replica that will propose decides after the
  vector is captured (`classifyDurableRangeAtLeader`,
  `message-group-cdc-source-range.js`): ALREADY_APPLIED when its group's log
  already committed the range in that incarnation (positive typed outcome
  `cdcAlreadyApplied` with `cdcAppliedThrough` and `cdcSourceIncarnation`; a
  closed field set in `cdc-delivery-outcome.js`), GAP when this node's cell has
  not applied `after` (typed `cdc_recipient_position_gap` with a retry hint,
  nothing proposed, the table is listed again), else APPLY. Every member node
  decides again when the committed entry applies (`applyCommittedCdcRange`):
  GAP merges nothing and owes a list; APPLY refuses members at or below the
  cell before the merge and advances the cell to `through`.
- **Re-list.** `relistSourceTable` (`cdc-integration-service-source-relist.js`)
  asks the source leader for its hydration image through the owner-RPC query
  path with `hydrationImage: true`; the partition answers
  `answerHydrationImageQuery` (`partition-service-hydration-image-methods.js`):
  rows, applied index P and the ledger incarnation from one synchronous span on
  the leader, with the leader witness, or a typed refusal
  (`partition_hydration_image_not_leader | _refused | _exceeds_bound`). The
  recipient installs rows (authoritative repair + leader-witnessed sweep) and
  the position in one synchronous span. One list in flight per (cache, source
  partition); a list that leaves the cell stale (image older than what was
  missed) owes another after the relister's backoff. *(Single-shot image and
  its install superseded by S3.9: a paged image from one leader snapshot,
  installed as a swap.)*
- **Sender side.** The cursor moves on COMMITTED or ALREADY_APPLIED (for the
  same incarnation, to `cdcAppliedThrough` when higher); GAP holds the
  recipient in the named state `POSITION_GAP` on its own hinted retry. A
  recipient is behind whenever a ledger row lies above its cursor; when nothing
  is owed after its cursor it is shipped the ledger's newest recorded event
  (the position probe), kept as one row beside the ledger
  (`_cdc_ledger_newest`, replaced by every recording inside its application
  transaction) so decision D1's reclamation is unchanged. A change of the sender cache's
  recipient-domain tables (services, message_groups, latency_groups, nodes)
  wakes the lane through a watch held by the bound propagation
  (`watchRecipientDomain`), so a group that becomes a recipient after the last
  write is contacted without a write.
- **Dead-recipient measure 2 (DETACHED{lifecycle}).**
  `partition-cdc-recipient-lifecycle.js` asks
  `readRecipientGroupLifecycle` (`cdc-recipient-lifecycle.js`): leader-witnessed
  reads of services, message_groups and nodes. RETIRED when the group's
  message_groups row is retired/inactive, or it has replica rows and every one
  is stopped or on a node in a terminal state (stopped, failed); ACTIVE if any
  is live; no row is NOT_ESTABLISHED; an unreadable or non-leader answer is
  UNAVAILABLE. Only RETIRED detaches. It is asked only for a held target group
  the sender's cache no longer names, or a MUST_RELIST one (omission is a
  trigger, never evidence), at most one read in flight per recipient. A
  detached group is shipped nothing and is outside the frontier; if the
  lifecycle owner later says ACTIVE and the cache names it, it is attached
  again with no cursor (a new recipient).
- **Dead-recipient measure 3 (MUST_RELIST).** `markRelistRecipients` runs at
  every frontier computation while the ledger owes more than
  `RELIST_LAG_ROWS` (= OWED_MAX_EVENTS / 2 = 2048): a target recipient more
  than that many owed rows behind its cursor leaves the frontier (it stays
  required and keeps being shipped to); the ledger reclaims past it; its next
  range answers a gap; it lists once and streams again (confirming puts it
  back in the frontier). No clock is read.
- **Selection churn.** `message-group-selection.js`: both resolvers honour
  `options.boundService` by one rule (registered among the node's
  message-group services and live: the sync resolver names it by identity, the
  async one uses it while ready); the propagation subscriber binds the service
  its delivery used. The lane's currentness check and each delivery now agree,
  and only a real ineligibility rebinds.

### S3.2 Deviations from the plan (sections 6.2-6.4 and the writer's plan)

1. Classification happens after the vector is captured inside the reservation,
   not before it: the leadership read before capture violated the receiver's
   "nothing serialized before capture" guard (input-guard witness). A gap or an
   already-applied range still proposes nothing.
2. ALREADY_APPLIED is a group-log fact (the highest range this group's log
   committed), not the leader node's cell: a list is node-local, so a leader
   that listed must still propose, or its followers would never see the range.
3. A gapped member never merges (6.2 "every node decides again ... still merges
   the members" and amendment B's open claim are withdrawn): it lists instead.
4. The re-list is a new positioned path, not the CL-014 catch-up: that read is
   not one span (the witness's applied index is read before an async query);
   CL-014 is left unchanged.
5. The new-recipient window is closed by the position probe and the
   recipient-domain wake, not by the recipient listing on its own.
6. MUST_RELIST and DETACHED apply only to target groups of a bound
   propagation (they speak ranges); a branch's primary recipient never leaves
   the frontier.

### S3.3 Supersessions (R09)

- **D1 reclamation is NOT superseded.** A first version retained the ledger's
  newest row; it changed the seed census and the D1 witnesses, so the probe now
  reads a separate one-row record and D1 stands as written. Only
  `cdc-hydration-old-order.test.js` (W-D4a negative) is restated: the late
  positionless subscriber now also receives the probe row (1 event; 599 of
  600 still missing).
- **O-A (no second durable progress ledger).** Not superseded: the incarnation
  and newest-event rows are identity and probe records, not progress; no
  per-recipient durable mark exists.
- **O-C (section 0).** Chosen in the form built here, with the supersession
  the row asked for: events at or below the recipient's position are dropped
  by position; the merge is retained as the convergence guarantee of the
  unranged paths.
- **Section 5.2 / 5.6 (DETACHED "proposed, needs owner approval"; no deadline,
  no permanent refusal).** Approved by the owner ruling of 2026-11-11 and built
  as DETACHED{lifecycle} plus MUST_RELIST; still no deadline and no permanent
  refusal: neither state is entered on elapsed time.
- **OWED_MAX_EVENTS.** Unchanged as the capacity of ordinary writes; its
  meaning gains: with MUST_RELIST no single recipient can hold more than
  RELIST_LAG_ROWS of it. **RETAINED_DELIVERED_MAX** unchanged.
- **Amendment B (source-order module).** "Stage 3 ... subsumes this
  tie-break, which is then deleted" is superseded: the module is deleted, and
  its rule is kept in the cell's owner as the within-entry rule.
- **Pinned race cell (message-group-cdc-receiver-admission.test.js, C1 race,
  "the same vector is admitted again after real raw closure").** Superseded: a
  replay of a range the group's log committed is answered already-applied and
  proposes nothing.

### S3.4 Bounds per node now

- Lane: per (source partition led here, recipient) one vector in flight
  (SHIP_MAX_EVENTS / SHIP_MAX_BYTES, a singleton above the byte bound ships
  alone), plus one lifecycle read per held target recipient.
- Ledger: owed rows below OWED_MAX_EVENTS (ordinary writes); no single
  recipient holds more than RELIST_LAG_ROWS of them; RETAINED_DELIVERED_MAX;
  plus two one-row records (incarnation, newest event).
- Recipient: one image in flight per (cache, source partition), each at most
  RELIST_IMAGE_MAX_ROWS (65 536) rows and RELIST_IMAGE_MAX_BYTES (16 MiB);
  a re-list per 2048 rows of lag at most for a slow recipient. *(Image bound
  superseded by S3.9: no table-size bound; pages, slots and the per-row
  bound instead.)*
- Unbounded / not established: the total of in-flight vectors is (source
  partitions led here) x (recipients), each bounded by bytes except a
  singleton; images of different partitions may be in flight together;
  the per-group committed map is volatile and bounded by source partitions.

### S3.5 Timers and sweeps

- No new timer. The relister's retry is the existing CDCIntegrationService
  `delayUntilShutdown` (RELIST_RETRY_DELAY_MS 500) of an owed list.
- Redundant by construction for the joiner window (follow-up deletions, not
  done here: they are control-plane and bootstrap files outside this writer's
  scope, and the lab must confirm): C5 (5 s fast propagated-table cooldown),
  C8's role as the window's closure (the post-subscription catch-up), and the
  joiner-window purpose of C6/C7. C4 (CDCHandler out-of-order warning) is
  unreachable for ranged events but still fires on unranged ingress; kept.

### S3.6 Open

- Dead-recipient measure 1 (admission reserve) is not built: system-table
  lifecycle writes reach the partition as TX1 PREPARE commands whose bytes
  (`partition-participant-transaction-bytes.js`, operations `{entryId, sql,
  params}`) are pinned by another active writer's owner; a typed intent can only
  reach `admitCdcOwedWork` through those bytes and the SQL engine's write plan.
  The constant `OWED_RETIREMENT_RESERVE_EVENTS` (= ACK_BATCH_MAX_EVENTS) and its
  justification are in place; the class, the threading and the witness are
  owed. With measures 2 and 3 a dead recipient can no longer drive the ledger
  to the cap; the cap is still reachable by a leader with no subscriber or by
  acknowledgements that cannot commit.
- A backup restore keeps the ledger incarnation while rewinding positions: the
  restore owner must re-mint it (or caches must be new).
- A new member of an existing message group whose node cell is UNKNOWN learns
  it is stale only at its group's next committed range.
- Images above RELIST_IMAGE_MAX_* are refused typed and leave the recipient
  gapped; a chunked image is not designed. *(Closed by S3.9.)*
- The positioned path is unit-witnessed only; the formation service milestone
  needs the lab run named in the writer's report.

### S3.7 Follow-up round (2026-11-11, later the same day)

- **Read currency (built).** A projection wait for a deletion is satisfied by
  absence only while the table's source cell is CURRENT; on a gapped or
  position-unknown cache it stays open and is woken by the cell becoming
  current (`SystemTableCacheSourceOrder.onCurrent`). Upsert waits are
  unchanged. Census: `awaitProjectionAt` is the one currency-requiring cache
  reader (callers table-creation-service-durable-job.js and
  runtime-access-policy-owner.js); the cache-visibility repairs read the
  authority. Observation only: it grants no write or admission.
- **New member (built).** A message-group replica's initialization marks every
  CDC-propagated source its node cache holds no position of as owing a list
  (`requireSourcePositions`), so a quiet group's new member lists without
  waiting for a range.
- **Compensation repair counters (built).** The join catch-up, the 5 s
  publications sweep and the 5 s / 30 s propagated sweep name their trigger;
  a run that changed cache rows is counted and logged
  (`CDC_CATCHUP_TRIGGER`, "CDC catch-up repaired cache rows"). Zero over a
  formation soak is the evidence for deleting them.
- **Restore (finding).** The restore port (`hydratePartitionSnapshots`) is
  bound to NULL_PORT in production; restore is refused as unsupported. Contract
  for whoever binds it: mint a new ledger incarnation in the same restore
  transaction.
- **Not built in this round:** the admission reserve (Part B) and the chunked
  re-list. The owner ruled the PREPARE byte change; the traced hops are in the
  writer's report.

### S3.8 Dead-recipient measure 1: the retirement reserve (built 2026-11-11)

Built under the owner ruling of 2026-11-11 (admission reserve for
recipient-retirement writes). Unit and component level only; not lab-measured,
not independently verified.

- **Carrier: the committed write entry, not the PREPARE.** Tracing the write
  path refuted the premise of S3.6 and the ruling's wording: a lifecycle write
  (one row of `nodes` or `services`) is a single-partition statement, so the
  engine runs it DIRECT_AUTOCOMMIT
  (`sql-query-engine-write-execution.js` `resolveWriteTransactionOwnership`):
  it reaches the partition as one ordinary committed write entry (`QUERY`),
  never as a participant PREPARE. The class therefore rides that entry; the
  pinned participant bytes (`partition-participant-transaction-bytes.js`) are
  unchanged, and a classified write whose plan would need a participant
  transaction (two partitions, an explicit transaction) is refused typed
  (`cdc_admission_class_refused`, reason `not_direct_write`) instead of
  losing its class.
- **The class** (`partition-cdc-admission-class.js`, a leaf): closed
  `PARTITION_CDC_ADMISSION_CLASS {ORDINARY, RECIPIENT_RETIREMENT}`. In process
  it is an intent: the frozen token `RECIPIENT_RETIREMENT_WRITE` under
  `cdcAdmissionIntent`, spread from `RECIPIENT_RETIREMENT_WRITE_OPTIONS` by a
  lifecycle owner only. At the partition boundary (the QUERY request, the
  local-leader leg, the committed entry) it is `cdcAdmissionClass:
  'recipient_retirement'`; ORDINARY is the field's absence. One conversion
  (`cdcAdmissionClassOfIntent`), one decode (`committedCdcAdmissionClassOf`,
  `partition-cdc-owed-admission.js`).
- **Who sets it** (typed intent at the transition owner, never from a table
  name, SQL text or a caller option): `MessageGroupServiceRowOwner` (the
  ACTIVE->STOPPED transition of a replica and the removal of its staged
  STOPPED row); `applyNodeTerminalTransition` (a node's own graceful shutdown
  and failed-join withdrawal; both callers spread what it passes); the
  stranded-join reaper (`LeaseService.reapStrandedJoiningRows`);
  `NodesOwner.removeTerminalNode` (the owner's intent is spread last, a
  caller's options cannot remove it). No message_groups retirement writer
  exists in src (the lifecycle read's message_groups branch has no producer).
- **Enforcement.** The engine entry (`resolveClientStatementRefusal`, every
  `executeQuery`) refuses a class on a client statement (`client_ingress`), a
  raw class value or a forged intent (`not_owner_intent`); the client
  SqlRequest entry carries a request's claim there so it is refused, not
  silently dropped (the canonical `createSqlRequest` never carries one). The
  CDC routed write refuses a forged intent before its local leg. The partition
  refuses a carried class on a client-ingress statement and any value but
  `recipient_retirement` (`invalid_value`). A census test pins the src
  modules that name the token.
- **The reserve** (`admitCdcOwedWork`): ORDINARY is admitted while owed +
  required <= OWED_MAX_EVENTS (4096) and otherwise refused
  `partition_write_cdc_capacity` as before; RECIPIENT_RETIREMENT also within
  OWED_RETIREMENT_RESERVE_EVENTS (256) above it (state ADMITTED_FROM_RESERVE,
  logged by the leader's preflight with owed depth, required, table and
  class); past it the write is refused
  `partition_write_cdc_retirement_reserve_exhausted` (retryable, deferRetry;
  named state RESERVE_EXHAUSTED, logged). Only acknowledgements draining
  clear it.
- **Determinism.** Admission runs where it did: the leader's preflight
  (`partition-service-raft-write-commit.js` `startPartitionRaftWriteCommit`)
  and again at apply on every replica (`partition-service-entry-apply-base.js`
  committed statement path; `partition-participant-transaction-apply.js` for a
  PREPARE). The apply decision reads only the replicated ledger count and the
  committed entry's own class field, so every replica decides alike.
- **Old entries.** A committed write entry written before this field existed
  decodes ORDINARY, which is what it was: absence is the format's definition
  of ORDINARY, not a fallback, and there is one decoder. In-place upgrade is
  unsupported on 0.x (docs/current-capabilities-and-limitations.md, "Rolling
  -upgrade contract: Unsupported on 0.x"), but the TX1 envelope ruling already
  has committed entries from an earlier build applied as carried, so an old
  entry can exist in a live log; it needs no second path.
- **Bound of 256.** Each committed lifecycle statement owes exactly one ledger
  row (`recordCommittedStatementCdc`). Retiring one replica writes two rows on
  the services partition (STOPPED, then the removal); a node's own terminal
  transition one row on the nodes partition (removal one more). 256 covers 128
  replica retirements, or about 42 three-replica groups, per partition before
  one acknowledgement batch drains it. Retiring several nodes that host more
  than 128 replicas between two drains exhausts it: the further retirement
  writes are refused typed and retried by their owners; nothing is lost, and
  the first ones admitted already carry the evidence the lane detaches on.
- **What the reserve relieves, stated plainly.** With measure 3 a dead target
  group never pins the frontier to the cap: above RELIST_LAG_ROWS it is
  MUST_RELIST and the ledger reclaims past it. The cap is reached by the two
  other causes (no propagation subscriber; acknowledgements that cannot
  commit) or a dead primary recipient (never detached, S3.2 item 6). The
  reserve's guarantee is that the lifecycle writes still commit at the cap;
  under a stalled acknowledgement path they do not by themselves drain it.

#### S3.8.1 The other two ways to the cap

| Cause | Cleared by | Armed? | Reserve consumable? | Operator sees |
| --- | --- | --- | --- | --- |
| NO_PROPAGATION_SUBSCRIBER | the deferred attachment's retry: a message-group service's init / leader-election event, or a lane drive that finds owed rows and no subscriber | yes: `once` listeners on the node's message-group services at arm time; every committed write (a reserve write included) drives the lane | yes, up to 256; each admitted write also wakes the attachment | warn "CDC obligations owed on a propagated table with no propagation subscriber" (once per tenure, with owed), attachment AWAITING warns per failed attempt, drive state in the lane diagnostics |
| FLUSH PROPOSER_UNAVAILABLE | a proposer registered | yes: the lane retry timer | yes | warn PROPOSER_UNAVAILABLE per flush |
| FLUSH OUTCOME_UNKNOWN | the ledger decides the pending command (reconciliation), or tenure end | yes: the lane retry timer | yes | warn ACKNOWLEDGEMENTS_REFUSED (proposed: true) |
| FLUSH REFUSED, non-terminal code | the retry | yes: the lane retry timer | yes | warn ACKNOWLEDGEMENTS_REFUSED |
| FLUSH REFUSED, terminal code (UNKNOWN_EVENT, ENTRY_MISMATCH, POSITION_MISMATCH, BYTES_INVALID, IDENTITY_MISMATCH) or refused before proposal | **nothing in the tenure**: `lane.held` is set and only a new lane (leader change) clears it | **no** | yes, then RESERVE_EXHAUSTED until a leader change | warn ACKNOWLEDGEMENTS_REFUSED once; diagnostics `acknowledgementHeld` |
| FLUSH NOT_LEADER | the new leader's lane | leader election | n/a on this replica | debug ACKNOWLEDGEMENTS_DROPPED_NOT_LEADER |
| DRIVE ACKNOWLEDGEMENT_BACKPRESSURE | the next flush or retry (outstanding batches commit) | yes: flush deadline / retry | yes | the obligation backpressure report |

Findings for the CDC delivery owner (outside this writer's files): the
terminal `lane.held` has no event that clears it within a tenure; the deferred
attachment listens only to the message-group services present when it armed.

#### S3.8.2 Supersessions (R09)

- **S3.6 "system-table lifecycle writes reach the partition as TX1 PREPARE
  commands"** is withdrawn: they are DIRECT_AUTOCOMMIT committed write
  entries. The participant PREPARE byte format is **not** changed (the ruling
  authorised one change; none was needed there).
- **The committed write entry** (`QUERY`/SQL command built by
  `buildQueryOperation` + `buildPartitionWriteEntry`) gains one optional
  field, `cdcAdmissionClass`, present only as `recipient_retirement`.
- **OWED_MAX_EVENTS** is the capacity of ORDINARY writes; the ledger's bound
  is OWED_MAX_EVENTS + OWED_RETIREMENT_RESERVE_EVENTS, the extra rows only for
  RECIPIENT_RETIREMENT writes (S3.3's restatement stands otherwise).
- **S3.4 Ledger bound** becomes: owed rows below OWED_MAX_EVENTS for ordinary
  writes, below OWED_MAX_EVENTS + OWED_RETIREMENT_RESERVE_EVENTS in all.

### S3.9 Paged re-list (built 2026-11-11)

Unit and component level; not lab-measured, not independently verified.
Replaces the single-shot hydration image of S3.1 (re-list), whose
65 536-row / 16 MiB bound left a larger table permanently gapped (its
recipient retried every 500 ms forever; before-run of witness (a) on the old
code: 13 consecutive `partition_hydration_image_exceeds_bound`, cell GAP with
no position).

- **What holds the image (source).** One read snapshot per image, owned by
  `PartitionHydrationImages` (`partition-hydration-image-pages.js`, created
  on the partition on first use): a second, read-only connection to the
  replica database in a read transaction (`BEGIN`; WAL), or for an in-memory
  database a private `serialize()` copy. The applied index P, the ledger
  incarnation and every page are read from that snapshot, so all pages of an
  image are the table after every entry at or below P and none above,
  whatever the leader applies meanwhile. Rows come from one open cursor in
  the snapshot's scan order. Chosen over a position-pinned re-read because
  nothing in the source can reconstruct the table at an old P once later
  entries apply (the ledger reclaims), while a read transaction gives it for
  free.
- **Page.** At most PAGE_MAX_ROWS (4096) rows and PAGE_MAX_BYTES (1 MiB,
  JSON bytes); the recipient may ask less (`resultMaxRows`/`resultMaxBytes`),
  never more. A row above the byte bound ships alone. Absolute per-row bound
  ROW_MAX_BYTES (16 MiB, below the router's message size): beyond it the
  image is closed and answered `partition_hydration_image_row_exceeds_bound`
  (this is the one remaining permanent refusal: a single system row above
  16 MiB cannot be listed).
- **Lifetime and cost (R13).** At most OPEN_IMAGES_MAX (4) open images per
  partition leader; a fifth is `partition_hydration_image_unavailable` with
  `retryAfterMs` 500. An image closes on: its last page; a page asked out of
  order (`_expired`); leadership ending or a new tenure (`_not_leader` /
  `_expired`); the leader applying more than APPLIED_ADVANCE_MAX (65 536)
  entries past P; no page asked between two idle sweeps (IDLE_SWEEP_MS 10 s,
  one timer per partition, armed only while an image is open: an abandoned
  image lives at most 20 s); the partition closing. A held read transaction
  pins the WAL: the WAL the images keep is bounded by the writes of at most
  APPLIED_ADVANCE_MAX entries and at most two idle sweeps after the last
  page asked, times at most four images (in practice one snapshot point each).
  Expiry is a resource decision only: the recipient restarts from page 0 and
  its correctness never depends on when it happens.
- **Wire (one change, no dual path).** The query carries `hydrationImage:
  true` plus `hydrationImagePage: {imageId (null opens), page}`; a request
  without a cursor is `_refused`. A page answer is {rows, rowSetComplete
  (= last), readAuthorityWitness, sourceImage {sourcePartition, incarnation,
  appliedIndex}, imagePage {imageId, page, last, rowCount, byteCount}}.
  Refusals: `partition_hydration_image_not_leader | _refused | _expired |
  _unavailable | _row_exceeds_bound`. `_exceeds_bound` is deleted. The seed's
  local `readHydrationImage` (one span on the leader's own connection) is
  unchanged except that it takes no limits.
- **Recipient.** `relistSourceTable` fetches page by page
  (`fetchSourceImage`): the next page is asked only after the previous one is
  staged (one page in flight; request/response is the pacing, no timer). Every
  page must name page 0's imageId, P and incarnation, else
  `source_relist_image_changed`; any failed page discards the whole stage and
  the image restarts from page 0 after the leader's hint or 500 ms. The stage
  is an in-memory map off the cache (canonical rows, one per key): the cache
  holds the whole table after the swap anyway, so staging costs one extra
  copy of the table being listed; at most RELIST_IMAGES_MAX (2) images are
  fetched at once per node cache (further lists wait for a slot, never
  refused), so the peak is cache + two staged tables. Old rows stay visible
  and the cell stays GAP (currency-required reads keep waiting) until the
  install.
- **Install (swap, one span).** `installSourceImage`
  (`system-table-cache-source-image.js`) asks the cell
  (`SystemTableCacheSourceOrder.admitImage` against the token of
  `beginImage`): CELL_CHANGED if the cell was reset or moved to an incarnation
  that is neither the one begun against nor the image's (stage discarded,
  restart); OBSOLETE if the cell already holds a position at or past P in the
  same incarnation (ranges applied meanwhile; image discarded, rows
  untouched); else INSTALL: every image row replaces its key's row, every
  cached row the image lacks is removed (new cache mutation mode
  SOURCE_IMAGE_REPLACEMENT: no HLC merge, no tombstone fence, no tombstone
  left), and the position is recorded, all in one synchronous span. A row
  deleted at or before P cannot resurrect. The table's authoritative
  watermark records term and applied index but no longer an observation
  time: the position orders what follows the image, and a wall-clock
  absence fence on later inserts (a source/recipient clock skew hazard of
  the old install) is not created.
- **Stream during the image.** Ranges arriving while the image is fetched
  gap (nothing merged, `need` raised); after the install the cell is at P;
  the sender's held range (after its cursor, at or below P) applies, members
  at or below P refused; a later gap lists again.
- **Group members.** Each member node fetches and installs its own image into
  its own cache (the cache is node-local; the group's log carries only
  ranges, and ALREADY_APPLIED stays a group-log fact). Members may install at
  different P; the ranges that follow converge them, as before. A recipient
  group leader change does not touch a node's image; a node crash loses the
  stage (nothing was installed).
- **Observability.** One info line per image, "CDC source table image listed
  from its leader": table, partition, outcome (install | obsolete | stopped |
  retry), pages, rows, bytes, durationMs, restarts and restartReasons, cell
  state, applied index, rows upserted/deleted. Source: a debug line per image
  closed before its last page, with the reason.
- **Witnesses.** test/cdc/cdc-paged-relist.test.js (9 tests: (a) ~20 MiB /
  5000 rows over ~20 pages with a currency wait released only at install,
  (b) source leader change, (b2) a page of another image, (c) idle expiry,
  (d) commits during the image, (e) recipient stopped / cache reset,
  (f) oversized rows, the source bounds, (g) 48-trial property over size x
  page bound x interleaved commits x six fault kinds: 48 installs each equal
  to the table at its own P); the S3-5 property of
  cdc-vector-application-equivalence now runs on 2-row pages. Mutations
  killed: swap without deletes ((a), (e), (g)); install without position (8
  of 9); per-page image identity removed ((b2)); stage kept across restarts
  ((b), (b2), (e), (g)); obsolete image installed ((g)); reset cell ignored
  ((e), (g)).
- **R09.** S3.1's single-shot re-list and its install (authoritative repair +
  leader-witnessed sweep, `_exceeds_bound`), S3.4's recipient image bound
  (65 536 rows / 16 MiB) and S3.6's open item are superseded by this section
  as recorded here: a table of any size lists; the only size refusal left is
  a single row above 16 MiB.
- **Open.** The lab must measure image sizes, pages, restarts and WAL growth
  during images on a long-running cluster; INDEX.md regeneration and the
  duplication ratchet are owed to the integration owner.
