---
audience: development
documentClass: evidence
---

# D1 design and implementation: reclaiming delivered CDC obligations into compact durable progress (2026-10-28)

- **Base H.** `b32f0eca9` (`origin/work/mg-delivery-resume-r2-20261023`). D2
  (the recording policy) and D4 stage A (subscribe-before-hydrate,
  `readHydrationImage`) are already composed there.
- **Branch.** `work/cdc-d1-reclamation-20261028`. This design and its code are
  one commit.
- **Binding input.**
  - Owner review 2026-10-26, decision 4, D1: "reclamation of delivered
    obligations with compact durable progress preserving
    acknowledgement-replay distinguishability, retained-seed inspection
    evidence (or an owner-defined durable summary) and the D4 contract,
    distinguishing source-event from delivery-marker positions, no tombstone
    per write, pending work under budget and backpressure never silently
    dropped".
  - D3: alpha clean-initialization.
  - The D4 design (`DESIGN-cdc-d4-hydration-live-handoff-2026-10-26.md`
    §4.1 and §6): under subscribe-before-hydrate, no subscriber ever needs a
    delivered row.

## 0. Headline

1. **What "delivered" means today.** It is one flag per ledger row, for the
   whole partition. It is not per subscriber.
   - The lane acknowledges an event only when *every current* subscriber
     covered it (`deliverObligation`,
     `src/partition/partition-cdc-obligation-delivery.js`).
   - Only a committed `CDC_DELIVERED` sets the flag (`MARK_DELIVERED`).
   - Subscribers are volatile wrappers held on the leader. They have no
     durable identity, and the three seed subscribers on one replica even
     share one `subscriberId` (D4 §1.4).
   - So the durable progress has exactly one owner: the ledger. Its one
     "subscriber" is the all-current-subscribers set.
   - Per-(subscriber, partition) durable marks would be a second progress
     owner. They would also differ between replicas, because subscribers
     exist only on the leader's node. I rejected them.
2. **The compact form.** One progress row per partition ledger,
   `_cdc_obligation_progress`. It holds:
   - the source-event position `(through_log_index, through_ordinal)` that
     the reclaimed prefix runs through;
   - `reclaimed`, the number of obligations the prefix held;
   - the delivery-marker position `(advanced_index, advanced_term)`: the
     `CDC_DELIVERED` entry that last advanced the prefix.
3. **Reclamation runs inside each committed `CDC_DELIVERED`'s application.**
   - It deletes every delivered row below the lowest owed row, in log order,
     at most `RECLAIM_ROWS_PER_APPLY` (4096) per apply, and folds them into
     the progress row.
   - It reads only committed ledger state, so every replica reclaims the
     same rows at the same entry.
   - Measured on the three-replica fixture: identical ledgers.
4. **There is one delivered predicate,** `readCdcObligationStanding`. A
   position stands in one of four states:
   - `RECLAIMED`: at or below the prefix, so delivered and its row is gone;
   - `OWED` or `DELIVERED`: a retained row;
   - `UNKNOWN`: above the prefix, with no row.

   The `CDC_DELIVERED` judgement, the lane's settlement and the census all
   consume this predicate. `isCdcPositionReclaimed` is the one comparison
   against the prefix.
5. **Growth is bounded.**
   - After the lane drains, the ledger holds 0 rows plus 1 progress row.
     Measured over 2000 writes: ledger pages flat after warm-up (+0). On H
     the same soak grows by 122 pages and keeps 2000 rows.
   - While an owed row is stuck below delivered ones, the retained delivered
     rows stay at or below `RETAINED_DELIVERED_MAX` (1024). Past that bound
     the lane answers `ACKNOWLEDGEMENT_BACKPRESSURE` and nothing is dropped.

## 1. The retirement predicate

### 1.1 Owed and delivered today (H)

The schema is `_cdc_obligations(event_key PK, log_index, term, ordinal,
entry_id, event_json, delivered, delivered_index, delivered_term,
UNIQUE(log_index, ordinal))`.

- **Owed.** `delivered = 0`.
- **Delivered.** `delivered = 1`, with `(delivered_index, delivered_term)` =
  the `CDC_DELIVERED` entry that set it.
- **Positions.** `(log_index, ordinal)` is the event's source position: the
  entry that owes it, and its ordinal within that entry.
- **Counts.** `countCdcObligations` groups the rows by flag.
- **Nothing ever deleted a row.**

### 1.2 Reclaimable

A row is reclaimable exactly when it is delivered and no owed row lies below
it. Equivalently, it lies below the lowest owed position, or anywhere when
nothing is owed. This is the brief's predicate in this architecture:

- **"Every subscriber whose obligation it records has acknowledged it
  durably."** That is `delivered = 1`. The flag is set only by a committed
  `CDC_DELIVERED`, and the lane proposes one only after every current
  subscriber covered the event.
- **"At or below every registered subscriber's durable progress."**
  Registered subscribers share one durable progress: the prefix. A row above
  the lowest owed row is kept even when it is delivered, so the prefix stays
  contiguous. The progress then names a prefix, never a set with holes.
- **"At or below the partition's hydration guarantee."** Under D4 stage A, a
  late subscriber registers *before* it reads image + P (`readHydrationImage`).
  - From its registration on, no event can become delivered without it
    (D4 §4.1).
  - Every row it needs is therefore above P, or still owed at registration.
    Reclamation never touches an owed row.
  - A subscriber that registers later reads a later P. It needs nothing below
    that P, because the image contains it.
  - So no hydration floor beyond "owed rows are kept" exists. W-D1c measures
    this.

### 1.3 Census: every reader of `_cdc_obligations` in `src`, at H

| Reader | Where | Reads | After D1 |
| --- | --- | --- | --- |
| Delivery lane drive | `partition-cdc-obligation-delivery.js` `drivePage` → `readOwedCdcObligations` / `readOwedCdcTail` | owed rows only (`SELECT_OWED_AFTER`, `delivered = 0`) | unchanged; never needs a delivered row |
| Handshake drive | `partition-cdc-delivery.js` `subscribeToCDCWithHandshake` → `driveCdcObligations(SUBSCRIPTION_HANDSHAKE)` | owed rows, through the same drive | unchanged. In the D4 staged deletion (branch `work/cdc-d4-window-deletion-staged-20261028`) the handshake becomes register + this drive, which serves OWED rows only |
| `CDC_DELIVERED` judgement | `partition-cdc-obligation.js` `acknowledgementJudgementOf` (H: `readCdcObligationsAtPosition`) | the row at each named position, delivered or not | now `readCdcObligationStanding`. A reclaimed position is a replay (§5.2) |
| Retained-seed census | `src/bootstrap/seed-retained-partition-effects.js` `obligationCensusMatches` → `readCdcObligationCensusIn` | ALL rows, including delivered rows with `delivered_index/term` | now predicts the reclaimed prefix and checks the progress row (§2.3) |
| Hydration measure | `partition-service-hydration-image-methods.js` `readHydrationImage` | the table image and the durable applied index; **not the ledger** | unaffected |
| Seed repair re-read | `seed-cache-hydration-phase.js` `repairPropagatedCacheTablesFromLocalPartitions` | table images through `readHydrationImage` | unaffected |
| Progress / currentness diagnostics | `getCdcObligationDiagnostics` (lane memory). `countCdcObligations` has no `src` consumer; its consumers are tests: `partition-cdc-delivery-progress.test.js`, `test/test-helpers/cdc-topology-progress-fixture.js`, and others | lane state / `{owed, delivered}` | `countCdcObligations.delivered` = retained delivered rows + `progress.reclaimed`. It is computed from the compact progress, never from a physical row count |
| Event identity fields | `cdc-event-buffer.js`, `cdc/cdc-event-envelope.js` | field *names* only | unaffected |
| Admission | `partition-committed-command-admission.js` | codes and the pinned form only | unaffected |

No live reader needs a delivered row. The judgement's replay case and the
seed census needed one; both now consume the compact progress instead.

## 2. Compact durable progress

### 2.1 Shape

```sql
CREATE TABLE IF NOT EXISTS _cdc_obligation_progress (
  scope TEXT PRIMARY KEY,              -- 'ledger': one row per partition ledger
  through_log_index INTEGER NOT NULL,  -- source-event position the reclaimed prefix runs through
  through_ordinal INTEGER NOT NULL,
  reclaimed INTEGER NOT NULL,          -- obligations folded into the prefix
  advanced_index INTEGER NOT NULL,     -- delivery-marker position: the CDC_DELIVERED entry
  advanced_term INTEGER NOT NULL       --   that last advanced the prefix
)
```

- It is created with the ledger (`ensureCdcObligationLedger`).
- It is also created idempotently by the first reclamation, for a ledger
  that predates it (§4).
- **"Source-event versus delivery-marker positions"** are separate columns.
  P (the applied index) advances on `CDC_DELIVERED` entries that have no
  ledger row. The prefix is a source-event position. The advancing entry is
  a delivery-marker position. Neither is ever compared with the other.

### 2.2 Why rows above the prefix keep a per-row flag (no tombstone per write)

**How holes appear.** The delivered set can have holes. The lane scans past
an event whose coverage is only `PROVISIONAL` (O17 and O18 in
`partition-cdc-obligation.test.js`). Also, two outstanding `CDC_DELIVERED`
batches can commit out of order.

**Why the flag stays.** A delivered row above an owed row keeps its flag and
its `delivered_index/term` until the prefix passes it. Deleting it at once
would make a replayed acknowledgement of its position indistinguishable from
an unknown event (§5.2). It would also lose its delivery-marker position.

**This is not a tombstone per write:**

- it is the row the write already had, kept only while an owed row lies
  below it;
- it is bounded by `RETAINED_DELIVERED_MAX`, plus at most what one in-flight
  pipeline holds (§5.3);
- it is folded into the prefix at the acknowledgement that fills the hole.

### 2.3 Retained-seed inspection evidence (owner-defined durable summary)

The census (`readCdcObligationCensusIn`) now returns
`{exists, rows, progress}`. `progress` holds exact decimal strings, or null
while nothing was reclaimed.

The seed census predicts, from the retained history:

1. **The reclaimed prefix.** These are the applied foundation sources, in log
   order, whose first applied ACK has applied, up to the first source still
   owed.
2. **The progress row.** It names:
   - the last of those sources;
   - their count;
   - the ACK that completed the prefix, which is the latest of their first
     applied ACKs.
3. **The retained rows.** Every other source keeps the existing row checks.

A prefix longer than `RECLAIM_ROWS_PER_APPLY` is outside the reduction and is
refused. No foundation partition reaches that length.

The retained seed is still inspectable: the progress row is the owner-defined
durable summary of the reclaimed foundation obligations, bound to the exact
ACK entry in the retained log.

### 2.4 The `CDC_DELIVERED` command form is unchanged

The command already names positions per event: groups of
`{logIndex, events: [{ordinal, eventKeyDigest}]}`, at most 256 events and
64 KiB. A range form is not needed.

- Reclamation is derived on apply from the committed ledger. The command does
  not carry it.
- So the command bytes, the pinned form and the admission are untouched.
- No replica deletes locally. Each one runs the same deterministic function
  of the same committed state at the same entry. This is the D2
  traffic-counter discipline.

## 3. When reclamation runs

It runs inline, bounded, in each committed `CDC_DELIVERED`'s application
transaction (`applyCdcAcknowledgementCommand`, after the flags move).

- **Measured cost** (probe: one `CDC_DELIVERED` naming 256 events, 7 runs,
  median):
  - H, mark only: 5.13 ms;
  - D1, mark + reclaim 256 rows + upsert progress: 6.98 ms.
  - That is +1.85 ms per maximal batch, about 7 µs per reclaimed row. Inline
    is affordable.
- **Per-apply bound.** `RECLAIM_ROWS_PER_APPLY` = 4096. It exceeds what one
  command adds (256) plus the retained bound (1024), so any backlog shrinks
  with every acknowledgement.
- **Lane cost.** Each obligation the lane drives past the lowest owed row
  adds two indexed reads: the owed head (`LIMIT 1`), and the retained
  delivered count (`LIMIT 1024`, on the `(delivered, log_index, ordinal)`
  index, which is about 0 rows in steady state).

## 4. Alpha clean-initialization (D3)

No migration code exists. A pre-existing ledger file is handled as follows.

- **An ordinary partition opened by this build:**
  - the first `CDC_DELIVERED` it applies creates `_cdc_obligation_progress`,
    at that entry and on every replica;
  - the same predicate then reclaims the old delivered prefix, at most
    `RECLAIM_ROWS_PER_APPLY` per apply.

  This is the current rule applied to current state, not a translation of an
  old format. Qualification still uses fresh storage, per D3.
- **A retained seed written by a pre-D1 build**, with an applied ACK and the
  delivered row still present but no progress row: the seed census refuses
  it typed, `CONTRARY` / `REASON.OBLIGATION`.
  - Witness: `pre-D1 storage (the delivered row retained, no compact progress)
    is contrary`, in `test/bootstrap/seed-retained-effects.test.js`.

## 5. Invariants

### 5.1 No reclamation while a subscriber still owes a row

Only rows with `delivered = 1` below the lowest `delivered = 0` row are
deleted. The DELETE carries `delivered = 1` and is checked against the
selected count. A mismatch throws, and the application fails closed.

### 5.2 Acknowledgement-replay distinguishability

A `CDC_DELIVERED` committed again after its positions were reclaimed
(retry after an unknown outcome, O14's path) is not refused.

- **The answer.** It is answered `success`, `delivered: 0`,
  `alreadyDelivered: n`, `alreadyReclaimed: n`, `idempotent`.
- **Why it matters.** It is never `UNKNOWN_EVENT`, which would set
  `lane.held` (`acknowledgementFailureIsTerminal`) and stall the partition.
- **Above the prefix.** A position with no row there is still
  `UNKNOWN_EVENT`, typed.
- **The stated ceiling.** A position below the prefix that never held an
  obligation is indistinguishable from a reclaimed one: both are delivered by
  the predicate, and acknowledging it moves nothing. The digest check
  therefore applies to retained rows only.
- **The lane.** Settlement also drops pending acknowledgements at or below the
  returned prefix (`settleAcknowledgedObligations(…, progress)`).

### 5.3 Pending work under budget, never dropped

Owed rows are never reclaimed.

- **A stuck owed row.** The lane delivers past the lowest owed row only while
  retained delivered rows + its pending acknowledgements stay below
  `RETAINED_DELIVERED_MAX`. At the bound it answers
  `ACKNOWLEDGEMENT_BACKPRESSURE`, clears its scan and retries from the lowest
  owed row. The lowest owed row is always deliverable, so the hole is retried
  and never starved.
- **Owed growth when no subscriber acknowledges.** Examples are
  `NO_SUBSCRIBERS`, a held subscriber, or `NOT_LEADER`. In these cases the
  owed rows are pending work.
  - D2 bounds which tables record at all: only internally propagated system
    tables, which always carry propagation subscribers on the leader.
  - The subscriber lifecycle owner is `PartitionCDCDelivery`
    (`subscribeToCDCWithHandshake` / `unsubscribeFromCDC`).
- **A lapsing subscriber** (deregistered or dead).
  - It owns no rows of its own. Its removal changes the current set, an
    in-flight delivery becomes non-current (`captureSubscriberCurrentness`),
    and the next drive delivers to the remaining set.
  - So the rows it had not covered are acknowledged by whoever remains. They
    are neither held for it forever nor dropped.
  - With no subscriber left, rows stay owed until one registers (the fresh
    seed's history replay depends on this, D4 §2.2 interval A).

### 5.4 Diagnostics consume the compact progress

`countCdcObligations` returns delivered = retained delivered rows +
`progress.reclaimed`. The fixtures
(`cdc-topology-progress-fixture.js`, the delivery-progress tests) keep their
semantic `{owed, delivered}` assertions. The census exposes `progress`.

## 6. Witnesses

**Where.** `test/partition/partition-cdc-obligation-reclamation.test.js`.

**Fixture.** `test/test-helpers/cdc-hydration-handoff-fixture.js`, extended.
It provides:

- one pump that applies each proposed `CDC_DELIVERED` on the leader and on
  every follower, in one order;
- `commitOnAll`;
- `ledgerFactsOf`: rows, `dbstat` pages, counts, and the census with its
  progress.

**Owners exercised.** Real `PartitionService` replicas
(`participant-transaction-fixture.js` `startLeader` / `startReplica`,
`tableName: CDC_TABLE`) and `acknowledgingCdcSubscriber`.

| Witness | Claim | H (`b32f0eca9`) | D1 |
| --- | --- | --- | --- |
| W-D1a | 600 writes, K=3 acknowledging subscribers, 3 replicas: ledger rows after the pump O(1), not N; applied index advanced; identical ledger on every replica | **red**: rows [600,600,600], progress null | green: rows [0,0,0], progress {reclaimed 600, through 602} ×3, `image` identical, applied identical |
| W-D1b | a slow subscriber holds from event 40 of 100: owed rows kept, the acknowledged prefix reclaimed, nothing ≥ the held event reclaimed; on release reclamation catches up | **red**: rows 100, reclaimed null | green: held rows 60 = owed 60, reclaimed 40, retained keys = b-40..b-99 all owed; released rows 0, reclaimed 100 |
| W-D1c | after reclamation, a late subscriber registers, reads image + P, receives every event committed above P | **red**: rows 627, reclaimedBelowPAtRead false | green: reclaimed ≥ 20 and through ≤ P at the read; missing 0, divergence 0, final rows 0, reclaimed 627 |
| W-D1d | growth bound over M = 2000 writes, sampled every 250 | **red**: max rows 2000, pages +122 after warm-up | green: max rows after drain 0, pages +0 after warm-up |
| W-D1e | replay of a reclaimed ACK answered as a replay; unknown above the prefix still refused; lane not held | **red**: rows 3; below-prefix position UNKNOWN_EVENT; no `alreadyReclaimed` | green |
| W-D1f | a provisional hole keeps delivered rows only up to `RETAINED_DELIVERED_MAX`, `ACKNOWLEDGEMENT_BACKPRESSURE` observed, nothing dropped; on release everything reclaimed | **red**: retained 1323 (unbounded), no backpressure | green: retained ≤ 1024, owed + delivered = 1324; released rows 0, reclaimed 1324 |

W-D4a (`cdc-hydration-live-handoff.test.js`) now measures what the late
subscriber missed against the committed traffic keys rather than against
ledger rows, which are reclaimed now. It is green on H and on D1.

## 7. Known residue and out of scope

- `PartitionCDCDelivery.subscribeToCDCWithHandshake` keeps its pre-existing
  scoped-complexity violation (26 / 12). This unit touches only the
  `settleAcknowledgedObligations` wrapper in that file. The D4 staged window
  deletion removes most of that method.
- The staged D4 branch edits `cdc-hydration-handoff-fixture.js` (5 lines). Its
  composition will need a trivial merge with this unit's fixture extension.
- Pre-existing reds at H, identical with D1:
  - `message-group-native-provisional-route.test.js` 1/1 fails at `:385`,
    before its ACK assertions. Those assertions were still migrated to the
    standing predicate.
  - `partition-cdc-delivery-progress.test.js` O3:
    `Cannot set properties of null (setting 'prepare')`.
  - `partition-cdc-topology-progress-currentness.test.js` 7/12.
