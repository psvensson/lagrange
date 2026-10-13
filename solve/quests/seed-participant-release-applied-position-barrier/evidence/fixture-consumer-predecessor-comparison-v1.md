# V3 fixture-consumer same-host predecessor comparison

Date: 2026-10-13

## Bound inputs

Candidate `e8afaa2cfe87cfbbbb3f11ae0516b294e9d48ba4` (tree `995db773d0ecb3d36488101de0a12ea3dc399359`) and predecessor `77e091f64fb711fbc5ca40a7915ae85f01a5cf4e` (tree `935479206a484dfb45949bf16ccaf006d06c13e1`) ran on the same physical hosts: cohort A on `tv-dator`, cohort B on `lenovo-laptop`. The ten compared test files and `src/**` are byte-identical between the commits. In their relevant scope, only `test/partition/partition-admitted-group-fixture.js` and `test/partition/partition-release-fixture.js` changed (93 insertions, 27 deletions). The predecessor cohorts reran exactly the six candidate-red A files and four candidate-red B files; candidate-only green controls are outside this failure comparison.

| host/input | input.json | result.json | canonical NDJSON | raw TAP |
| --- | --- | --- | --- | --- |
| tv candidate | `6ed6d95f070799bf909ee0e90dd8100242b5bf3925c23330f7b6f912c7cb7811` | `52355d19bb98253fc01fd1119a7c904b4e8628fb1daa569b660bfe51913bb064` | `6000b459ab4e91bdfdd940646ffe3507e90cf7dec97087aae297141c8853bf89` | `ff546562f80ff7cf6733073ba302deecb5339f5ef747e5b665bdfdab20a566d1` |
| tv predecessor | `98d62117e30c6bb9baf0fd7e33057d4a35a1075170b268fd87e1d8455ee88ac1` | `dc44999fd59a971c1a799e975976f97c352bc3a37a044fe024882698e4296ca7` | `05329773153d6ffd77e9de4e951d7460b1cbedf86fb077987e0439def478dabe` | `863b78adfd167038278491948a3aad4880eb590c21d46f1a32fecdb1b125628a` |
| lenovo candidate | `72fb7ec5dfeff134ef85b1f49f8e354014f7107a0f85a62c14b1ec0b3642a3d9` | `7c4051c990988adab7ca050e269d98412d4ca1d6ce231d7d46c772ea3b38e7af` | `ae1f3b7af704cff71b15ab25558ce9801e90c5b03c0cd17eaed4b16cf4a7dd39` | `156bc465bc174e732e00fa08b6d18e6362db9c2f44bbd82579b04beb0f83f922` |
| lenovo predecessor | `8c0921a53471989c671db0c5ea712e7ae6c4a7b78d973a11109b366740544ec6` | `269e6422438d42b8d48b69ed1b0afccb946d1b33a824e09fb427d73cb3a34435` | `ed927eaed6eb344fc59f8327c1a2085e1418fa1a55b603c2b58bc7f935fd169b` | `15f3b3f6fb3e2381c0edd1efd12f878215446650d142939b95dd70f37543b4dc` |

All four raw stderr files are empty (SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`). All four runner status records have SHA-256 `3ffe09ecc4a1f39ac6f78caca24c95a5d1182b4dbd23662d5e5938bcc488a56f`.

## Result

The paired runs contain the same **47 failed child tests in the same ten files**. For every child, candidate and predecessor have the same child name, `failureType`, assertion/error code, operator, expected value, actual value, and semantic stack assertion site. Forty-five child payloads are exact after excluding durations and placement-worktree prefixes. The two remaining payload differences do not change the failed branch:

1. `unknown-outcome-same-entry` W2 at `:615:12` reports the same `partition_write_cutover_paused` participant failure and the same `node-1/partition/uo-lc-r1` address; `participantNodeId` is `node-1` in the candidate and `node-3` in the predecessor. The artifacts do not reveal why that descriptive node field differs, and this comparison cannot attribute it to the fixture delta.
2. `write-identity-instance` V6 UPDATE at `:522:16` reports the same expected `partition_write_outcome_unknown`, actual `partition_write_cutover_paused`, and complete participant shape; only embedded `durationMs` differs, 599 ms candidate versus 600 ms predecessor.

Runner and child durations otherwise vary without changing semantics. This is not a broad green claim: all ten files remain red on both inputs, and the comparison establishes only that the fixture-byte delta did not create a new failure name, branch, assertion value, failure type, or semantic stack site in these measured same-host cohorts.

## Exact paired child inventory

### `test/partition/partition-write-leadership-transfer.test.js` — 2/2 paired

Both children fail `test/partition/partition-write-leadership-transfer.test.js:114:12`, `testCodeFailure` / `ERR_ASSERTION`, `strictEqual true -> false`, with `setup: the group serves a write`:

- `a partition write during a leadership transfer is retried and served once the leader takes writes again, never refused`
- `a membership admission during a leadership transfer is DEFERRED, never REFUSED`

### `test/query/partition-write-answer-consumers.test.js` — 1/1 paired

- `F-aj: the query executor re-delivers an unknown outcome under the write's one entryId until it is settled - its client gets the original result, applied once; a router holding the code re-proposes it only under its entryId, idempotently` — `:319:12`, `testCodeFailure` / `ERR_ASSERTION`, `strictEqual true -> false`, `setup: the group serves a write`.

### `test/partition/partition-statement-admission.test.js` — 2/2 paired

- `TX1 admission A2: a ceiling refusal and non-replicated inserts on each replica's connection, followed by an UPDATE, a DELETE and an ignored INSERT, leave byte-identical outcome rows on two replicas; an INSERT outcome still carries its own rowid` — `:209:10`, `testCodeFailure` / `ERR_ASSERTION`, `deepStrictEqual`; both retain identical applies/outcome rows, while the first replica's expected three `rowid_ceiling` disturbance layers are three `undefined` values.
- `TX1 admission A4: on a real three-replica group the B1 shapes are refused on the leader's request path (nothing proposed) and, delivered through the forward-write ingress, refused identically at apply on every replica; an explicit-key REPLACE applies identically` — `:385:10`, `testCodeFailure` / `ERR_ASSERTION`, `deepStrictEqual`; both return `partition_write_cutover_paused` for every ingress and the positive control, leaving no rows/outcomes.

### `test/query/unknown-outcome-redelivery-budget.test.js` — 3/3 paired

All are `testCodeFailure` / `ERR_ASSERTION`, `== true -> false`, `setup: the core trapped the write`:

- `an unknown that outlasts the budget is re-delivered with backoff - a handful of deliveries, not one per retry delay - and ends typed` — `:80:12`.
- `a caller deadline (timeoutBudget (the PG wire statement budget)) bounds the redelivery of an unknown outcome: answered typed unknown at the deadline, never held for the executor budget` — `:111:14`.
- `a caller deadline (timeoutMs) bounds the redelivery of an unknown outcome: answered typed unknown at the deadline, never held for the executor budget` — `:111:14`.

### `test/query/unknown-outcome-same-entry.test.js` — 11/11 paired

- `W1 (R6-B): a registration INSERT cut by a runtime replacement, with no authoritative read, ends ACCEPTED - one row, no UNIQUE error, never "not confirmed"` — `:145:12`, `strictEqual true -> false`, `setup: the engine serves a write`.
- The two `W1/W5/W6: the joiner's registration re-driven ...` children (same row; rebuilt row) — `:211:14`, `== true -> false`, `setup: the core trapped the write`.
- `W3/W4: the typed unknown outcome and its entryId survive every hop; re-delivery is under the same entryId and bounded; the spent budget reports once` — `:264:12`, `strictEqual true -> false`, `setup`.
- `W5/W6: a control-plane owner write retried by its retry loop after an unknown outcome is the same entry (one identity per call)` — thrown `DISTRIBUTED_PARTICIPANT_FAILURE`; the stack begins at `src/control-plane/owners/system-metadata-owner-base.js:157:7` and `:442:15`, then reaches test call site `:390:16`.
- `W3: the control-plane gateway hop carries the typed unknown outcome` — `:416:14`, `strictEqual partition_write_outcome_unknown -> partition_write_cutover_paused`.
- `W5/W6: an endpoint birth re-driven after its unknown outcome is the same entry - applied once, never UNIQUE` — `:453:12`, `== true -> false`, `setup: it commits later (authority_unavailable)`.
- `W5/W6: a reservation birth ensured again after its lost answer is the same entry (the named write identity held while unknown)` — `:486:12`, `== true -> false`, `setup: it commits`.
- `W5/W6: the rebalancer's reservation birth (its own method) created again after its unknown outcome resolves the first entry and is answered by the authority - ALREADY_ACTIVE, one row` — declared at `:503:1`, thrown `DISTRIBUTED_PARTICIPANT_FAILURE`; its two-frame stack begins at `src/rebalancer/replica-operation-repository-mutation-gateway-methods.js:438:21` and `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:252:39`.
- `W5/W6: the CDC service's routed write retries every engine attempt under one entry, and a call that ends unknown re-driven under its key is that entry` — `:589:12`, `== true -> false`, `setup: it commits`.
- `W2: an INSERT whose proposer loses leadership mid-write commits under the new leader, and the caller ends with the original result, exactly once` — `:615:12`, `strictEqual true -> false`, same CUTOVER_PAUSED participant failure except the descriptive `participantNodeId` difference recorded above.

### `test/query/write-identity-instance.test.js` — 17/17 paired

- `V3: a second birth of a held name after the row was deleted executes - the row exists with the new content` (`:122:12`) and `a re-drive refused before it was proposed does not end an instance an earlier attempt left unknown: the next re-drive is that entry` (`:160:12`) — `== true -> false`, `setup: it commits`.
- `a write of a name whose pending instance stays unknown is the typed unknown naming that instance - nothing of the new content is delivered` — `:206:12`, `strictEqual partition_write_outcome_unknown -> undefined`.
- Four `endpoint shape ... unknown birth resolved by readback` children (CDC/SQL paths, new timestamps/identical content) — `:289:16`, `strictEqual true -> false`, identical distributed-participant readback failure.
- `endpoint shape (birth left unresolved): a birth its owner could not read back, its row then deleted by the stopped replica, born again with identical content - the row exists` — `:327:14`, `== true -> false`, `setup: it commits`.
- `endpoint refresh: a new port while the previous refresh is unknown ends with the NEW port, or a typed unknown - never applied with the old port` — `:379:12`, `strictEqual applied -> authority_unavailable`.
- Two `reservation ... a birth ensured again after the reservation was released` children (new timestamps; identical content) — declared at `:413:3`, thrown `DISTRIBUTED_PARTICIPANT_FAILURE`; each two-frame stack begins at `src/rebalancer/replica-operation-repository-mutation-gateway-methods.js:438:21` and `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:252:39`.
- `V1: the joiner registration re-driven after an unknown that outlasts the budget is ACCEPTED with one row` — `:485:12`, `== true -> false`, `setup: it commits`.
- Three `V6 UPDATE/DELETE/INSERT: the engine result carries the typed unknown, its entryId and the spent wait` children — `:522:16`, `strictEqual partition_write_outcome_unknown -> partition_write_cutover_paused`; UPDATE has only the 599/600 ms payload delta above.
- `a counter UPDATE behind the generic retry helper across a runtime replacement applies exactly once, answered with its original count` — `:551:12`, `== true -> false`, `setup: the core trapped the UPDATE`.
- `a cas-from endpoint UPDATE keeps one entryId across its owner's retry loop while its first attempt is unknown` — thrown `DISTRIBUTED_PARTICIPANT_FAILURE`; the stack begins at `src/control-plane/owners/system-metadata-owner-base.js:157:7` and `:442:15`, then reaches test call site `:581:5`.

### `test/partition/partition-write-leadership-transfer-committed.test.js` — 2/2 paired

Both children fail `:181:12`, `testCodeFailure` / `ERR_ASSERTION`, `strictEqual true -> false`, `setup: the group serves a write`:

- `a write the leader serves during a leadership transfer is committed: its row is stored and the log position it names holds it`
- `a write still deferred when its budget ends inside a transfer window is answered as the typed deferral, never success, and nothing of it is stored`

### `test/partition/settled-replay-preserves-result.test.js` — 6/6 paired

All are `testCodeFailure` / `ERR_ASSERTION`, `strictEqual true -> false`, before the named replay behavior:

- `W1: an INSERT in flight across a forced runtime replacement commits once, and its retry is answered applied with its row count - never success with zero rows, never a UNIQUE failure` — `:254:12`, `setup: the lone leader serves a write`.
- `W1: a retry sent while the runtime is still being replaced is proposed, and the application answers it applied with its row count` — `:293:12`, `setup`.
- `W3: an entry committed by the restart that replays the log tail answers its retry applied with its row count` — `:319:12`, `setup`.
- `W2: the replay of an UPDATE of n rows, a DELETE, a multi-row INSERT, an INSERT ... RETURNING and a genuine zero-row UPDATE answers each statement's own result, in process and after a restart` — `:356:14`, `setup a`.
- `W5: an applied outcome row that retains no result answers the named not-retained state, acknowledged and without a count, never zero rows` — `:413:12`, `setup`.
- `W3: on a three-replica group a retry answered by another replica, a forwarded retry, and a retry after a leader change all answer applied with the row count` — `:476:14`, `setup a`.

### `test/query/write-exactly-once-schedules.test.js` — 2/2 paired

Both are `testCodeFailure` / `ERR_ASSERTION`, `strictEqual true -> false`, `setup: the group serves a write`:

- `(c1) two log entries for one entryId, both committed: applied once, the caller answered with the first application's result` — `:98:12`.
- `(c2/d) the first copy on the deposed leader only, the redelivery on the new leader in the next term: the first copy is truncated, the redelivery applies once` — `:156:12`.

### `test/query/write-exactly-once-property.test.js` — 1/1 paired

- `exactly-once property, seed 20261005: 40 logical writes under random faults` — both child tests end `testTimeoutFailure` / `ERR_TEST_FAILURE` at declared location `:231:3`, after the full 300000 ms child-test bound. Neither emits a semantic assertion stack or reaches a second child. Both enclosing test processes then consume the full 600000 ms runner bound and are killed: candidate 600026 ms, predecessor 600053 ms. This is a reproduced live system lifecycle bug. It is not waived as load, environment, or fixture equivalence, and no timeout increase follows from this comparison.

## Attribution and unknowns

The same-host predecessor reproduces every candidate failure branch. Therefore none of these ten red file outcomes can be attributed as a newly introduced semantic regression from the V3 fixture bytes on the retained evidence. This does not make the reds healthy: ordinary writes are still refused before the intended bodies, and the property still exhausts both bounds.

The earlier source-backed triage remains relevant but separate: current partition lifetimes start participant-release admission CLOSED, and many retained answers explicitly report CUTOVER_PAUSED. This comparison shows that interaction existed unchanged before the fixture delta; it does not prove the exact refusal for tests that discarded their answer, explain the `participantNodeId` variance, locate the property hang, or authorize a fixture/release/timeout repair. Those remain owner or harness investigations.
