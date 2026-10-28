---
audience: development
documentClass: planning
---

# Global index maintenance research

Research date: 2026-10-28. Decision status: **R2 unsealed**.

This note preserves the secondary-index investigation for the
[0.3 epic](../../epics/release-0-3-queryable-core.md) and its
[C1 maintenance-mode decision](tasks.md#c1--planned-global-index-maintenance-mode-seal--design-may-start-early).
The [global-index requirements](../global-secondary-indexes/requirements.md#r2--maintenance-consistency-decision-sealed-before-implementation)
remain the decision owner. This is research and source inspection, not a
sealed choice, implementation Quest, benchmark or release certification.

## Provisional recommendation and decision boundary

Favor **synchronous TX1-maintained, non-unique global secondary indexes as the
ordinary-SQL default for 0.3**, conditional on a proved read contract and
acceptable measured write cost. Index selection should preserve the semantics
of ordinary application SQL, including the applicable transaction and locking
contracts. Existing TX1 gives synchronous maintenance a substantial foundation;
an asynchronous alternative still needs complete row-change capture, durable
consumer progress and a way to establish candidate completeness for fresh reads.

This is a stronger current hypothesis than the historical async-first lean,
not a replacement seal. Asynchronous maintenance can provide fresh reads with
an appropriate barrier, wait or fallback. Its strongest future fit is explicitly
lag-tolerant derived views, high-volume ingestion, search or embedding
projections. Those are workload hypotheses, not measured customer requirements.

Choose one default through C1. Do not implement two production maintenance paths
in 0.3 merely to defer the decision. Preserve useful common boundaries: index
identity/generation, ordered tuple representation, row-to-entry deltas, durable
lifecycle state and planner eligibility. Local indexes and primary-key narrowing
remain preferable when they already solve a query without global maintenance.

## Evidence baseline and impact on release effort

The source census below is pinned to main
`0489a519fe683e2f278ff3f6294bb0787b94cba1`. The epic is maintained on the older
0.3 foundation branch, whose pre-research head was
`0ec0d720e2278d756149a334d8bcb7a7543eb4a6`. Pinned source links deliberately
refer to the inspected main tree, not to that branch's runtime implementation.
The governing steering revision checked for this preservation is
[Rules, reviewed 2026-10-28][rules]. Re-census the actual post-0.2.7 integration
candidate before turning a source observation here into implementation authority.

[v0.2.6][release] was published at
`a1e26f6de84433a3913c2ef855d1b787e926d7eb`. Its raft-rs cutover, durable boot
incarnation/lifecycle, TX1 decision and participant recovery, FreshMG replacement,
and SN1 snapshot/compaction/reconstruction work are foundations to consume.
They are not missing 0.3 programs to estimate again. The separate
[0.2.7 stabilization proposal][stabilization], inspected at
`25c390cb52606b3e6afbee95c1f088d7b2be8302`, is corrective work, not evidence
that every proposed fix has already landed. Publication does not substitute
for exact-candidate physical qualification or the epic's integration rules.

The qualitative effort implication is that 0.3 adds a broad set of dependent
SQL capabilities on top of shipped foundations. Its risk concentrates in
interactions: ordering and PK identity, index maintenance and read visibility,
locking and candidate discovery, and live-query snapshot/stream continuity.
Selecting sync does not make these cheap; selecting async does not remove them.
No comparative implementation measurement or credible calendar estimate was
produced by this research. Stage the existing A/B/C/D work and prove the risky
interactions before treating the release as a collection of independent features.

## Compare the same semantics

Three separate decisions must not be collapsed into the word "consistent":

1. **Maintenance timing:** when derived entries are updated relative to the base
   write and its acknowledgment.
2. **Query freshness:** which committed changes a statement must include, such
   as the caller's own writes or a specified request-time lower bound.
3. **Read isolation and atomic visibility:** what a query may observe while a
   transaction's participants are prepared, decided or being physically applied.

Synchronous distributed maintenance does not by itself supply a global snapshot,
repeatable read or serializability. Asynchronous maintenance is not necessarily
eventual-only: a query can wait for proved coverage through a required cut.
Compare both choices under the same promised semantics, not fresh synchronous
queries against cheaper stale asynchronous queries.

| Concern | Synchronous TX1 maintenance | Asynchronous CDC maintenance |
| --- | --- | --- |
| Base mutation | Enlists all affected index destinations in the transaction | Atomically records a durable maintenance obligation with the base mutation |
| Write cost | Extra required participants, prepare/decision/apply work and contention | Capture/durability cost now; index application can be batched later |
| Read cost | Must preserve the declared view across index scan and base fetch | Also needs completeness/freshness evidence, bounded wait or safe fallback |
| Index write outage | Couples base-write availability to required index work | Builds maintenance debt until a bounded backlog policy intervenes |
| Recovery | Reuses TX1 outcome and participant recovery with added destinations | Needs replay identity, durable consumer acknowledgment and progress continuity |
| Backfill | Live writes can maintain a write-only generation while it builds | An initial scan/image plus a proved handoff to live maintenance must establish complete coverage |
| Future uniqueness | Useful transaction foundation; uniqueness remains separate work | Later observation alone cannot enforce a synchronous uniqueness invariant |

Both modes must support the declared compound-prefix/range semantics, preserve
base-table results, fail closed when ineligible, and explain selection or
rejection through the existing planner. Non-unique indexes still require correct
candidate coverage: removing uniqueness does not permit incorrect SELECT results.

### Candidate completeness is the central read obligation

An index may return an obsolete entry whose base row no longer matches. Fetching
the row and rechecking the predicate can remove that false positive. It cannot
find a matching row whose entry is absent from the index scan. A synchronous or
asynchronous protocol must prevent such omissions for the promised read view,
or reject that access path and execute a correct fallback.

The same issue affects locking reads: a row omitted by candidate discovery
cannot be reserved later. Keep lock/reservation authority in the existing
[transaction and base-participant owners][locking], not in an index-local lock
manager. This does not invent a phantom-prevention or serializable-isolation
promise. Transaction-local reads must also account for their own staged changes
when the planner uses an index.

The [current execution contract][execution] distinguishes ordinary eligible
replica reads from leader-local CallCell reads and does not establish a global
snapshot. Index integration must state its actual contract rather than copying
another database's timestamp service or isolation model by implication.

## Synchronous maintenance: where it fits and where it can hurt

The useful model is a derived write inside the existing base transaction.
Compute the base-row mutation and all index-entry changes, identify their
destinations and generations, and enlist them before the participant set freezes.
An insert adds entries; a delete removes them; an indexed-value change removes
the old entry and inserts the new one. Validate before-images against concurrent
changes through the existing transaction owner. Do not create a second
coordinator, partition-placement owner or transaction decision ledger.

This aligns ordinary SQL with a successful application write and gives a natural
place for read-your-writes and eventual uniqueness enforcement. It also avoids
making every fresh indexed query pay a separate catch-up protocol. FoundationDB's
[Record Layer paper][record-layer] is a useful precedent for maintaining derived
indexes using an existing transactional substrate. It is not evidence that
Lagrange inherits FoundationDB's isolation or measured performance.

The costs are material:

- A base write that currently qualifies for direct single-partition autocommit
  may become distributed once index destinations are included.
- For one row with its base PK unchanged, changing indexed tuples in `m`
  indexes can touch up to
  `1 + 2m` distinct base/index data partitions: one base partition plus old and
  new destinations for each index. This excludes coordinator metadata work;
  the actual union can be much smaller through colocation and batching.
  Multirow mutations may span additional partitions.
- Phases can parallelize. Latency is often governed by the slowest required
  participant and protocol rounds, not the sum of all participant latencies.
  Historical "first index doubles latency" examples are not a Lagrange forecast.
- A popular index partition can couple otherwise independent base writes.
  Current partition-level transaction admission makes this a concrete
  measurement priority, beyond ordinary Raft ordering within each group.
- An unavailable required index writer affects base-write availability. A read
  fallback cannot rescue that write. After a durable COMMIT, recovery must move
  forward; a timeout cannot turn the decision into rollback.

[Spanner's index documentation][spanner] explicitly describes the added cost of
global index maintenance spanning splits. Its local/interleaved alternative
also illustrates why placement matters. Neither its latency nor its concurrency
implementation transfers directly to Lagrange.

If future policy allows writes to continue after an index is disabled, that
requires a durable lifecycle transition, fenced planner exclusion, generation
handling and rebuild obligations. Silently skipping maintenance is incompatible
with the current synchronous branch of R2.

### TX1 source findings and remaining index-integration questions

| Inspected owner | Observation at the pinned source | Consequence to investigate |
| --- | --- | --- |
| [Decision protocol][tx1-decision] and [participant set][tx1-set] | Durable participant admission precedes requests; the exact set freezes before decision. Successful coordination waits for participants; durable COMMIT is recovered forward. | Add all derived destinations before freezing. Treat in-doubt replies and decided-but-unapplied work under the existing owner. |
| [Write execution][write-execution] | Direct autocommit is selected when the base plan has at most one partition statement. | Expand index mutations before selecting ownership, or explicitly seal an equivalent correct interaction. |
| [Participant session][tx1-session] and [request admission][tx1-request] | One nonterminal participant transaction per partition; conflicting admission can return `ALREADY_ACTIVE`. | Measure skewed global-index contention and long distributed reservations. Async batching may avoid some reservation cost, but still uses ordered partition application. |
| [Participant apply][tx1-apply] | Data changes, participant outcome and applied-position bookkeeping commit in one local SQLite transaction. | This proves a local atomic boundary, not simultaneous visibility across all participants. |
| [Read execution][read-execution] and [remote query methods][remote-query] | Ordinary reads execute through SQLite; leader restriction is applied to writes. No general transaction-decision visibility gate was established by this inspection. | Define index-scan/base-fetch behavior during prepare, decision and staggered application. Do not equate durable outcome with a common read snapshot. |

These are new integration questions, not claims that TX1 is missing or defective.
For comparison, [Yugabyte's transaction architecture][yugabyte] describes how
provisional records and transaction status participate in read visibility;
[RAMP][ramp] treats atomic visibility as a distinct property from serializability.
Their mechanisms show the extra obligation without prescribing Lagrange's design.

## Asynchronous maintenance: useful decoupling, explicit obligations

The base transaction commits a durable index-maintenance obligation; a consumer
then applies index changes. This permits independent scheduling, batching and
safe coalescing, and can share change-capture foundations with live queries and
future projections. It must not be a fire-and-forget post-commit callback.

The difficult part is proving when the derived view is usable. At minimum,
establish complete affected-row changes, enough old/new information to remove
obsolete keys, durable event identity, idempotent replay, ordered application
where required, crash-safe acknowledgment, retention and topology continuity.
An indexed-key move may involve deletion and insertion on different index
partitions; progress cannot acknowledge completion after only one side.

A useful frontier means **all required mutations through a specified cut are
durably reflected**, not "the largest sequence number observed." Per-source
positions need generation/lineage identity and gap detection. Offsets from
independent sources are not globally comparable. An acknowledgment of delivery
to a current subscriber is not automatically a durable, resumable index-consumer
completion record.

For a global predicate, a newly matching row may come from any relevant base
partition. A freshness barrier must cover those sources or consume a trusted
aggregate frontier; the partitions represented by current index hits are not
sufficient. This can reintroduce control-message fanout even when the query
avoids a full base-row scan. A caller's mutation token can establish
read-your-writes without promising visibility of everybody else's latest write.

A lower-bound watermark still does not freeze base and index data at the same
snapshot. Specify what happens when rows change between index lookup and base
fetch, and when a multirow transaction's events reach different destinations.
Deciding a transaction before emitting its events does not make downstream
application of all those events simultaneously visible.

[Couchbase's query settings][couchbase] demonstrate the distinction between
unbounded stale reads, mutation-vector-based `at_plus`, and request-time
`request_plus`, with a bounded scan wait. These are useful freshness choices;
they are not proof of global serializability. Its separate
[transaction contract][couchbase-transactions] reinforces that distinction.

Async availability also has a limit. Sustained writes faster than index
maintenance create unbounded debt unless admission eventually backpressures,
the index is durably invalidated and rebuilt, or another explicit bounded
policy applies. [DynamoDB's GSI backpressure documentation][dynamo-pressure]
shows asynchronous indexing can still throttle base writes. Its
[transaction documentation][dynamo-transactions] separately warns that GSI
and stream propagation can be gradual and interleave transaction records.

### CDC source census: reusable substrate, incomplete index proof

| Inspected owner | What exists | What the index decision still needs |
| --- | --- | --- |
| [CDC table policy][cdc-policy] | Internal/system propagation policy exists; ordinary user-table recording is disabled by the current policy. | An explicit internal index-consumer policy and complete user-row capture, without requiring indiscriminate external streaming or cluster-wide user-table broadcasts. |
| [CDC obligation][cdc-obligation], [generator][cdc-generator] and [parameterized SQL capture][cdc-sql] | A durable source obligation is recorded with partition apply and emitted after commit. Capture is operation-shaped; the inspected parameterized UPDATE path reads one post-write row and DELETE derives fields from its predicate. | Establish complete old/new key deltas for arbitrary supported multirow updates/deletes. This inspection did not establish such a generic mechanism. Sync needs corresponding row-to-index mutation expansion too. |
| [Occurrence ledger][cdc-ledger] and [delivery][cdc-delivery] | Durable source occurrences and delivery bookkeeping exist, with current-subscriber delivery. | Prove resumable per-index consumer acknowledgment, gap detection, retention and replay; do not relabel source delivery bookkeeping as complete index progress. |
| [Owed-work admission][cdc-admission] | Bounded debt admission and drain behavior already exist. | Reuse the policy owner and prove the new index debt/recovery interaction rather than adding an unbounded queue. |
| [Confirmation tracker][cdc-tracker] | The research census did not establish production construction of the promise-based tracker; historical requirements identify it as test-only. | Recheck wiring at implementation time. Per-event cache confirmation alone would not prove whole-index coverage. |
| [Hydration image][hydration] and [subscription handoff][cdc-handoff] | A leader-local image is tied to an applied position; the subscription/image handoff offers an existing local continuity pattern. | Prove bounded, restartable index backfill and topology continuity. A local image position is not a global snapshot or follower read-index protocol. |

The conclusion is neither "CDC already solves indexing" nor "there is no CDC."
The durable substrate is useful. The remaining question is whether it can meet
the complete index contract economically through its existing owners.

## Build, visibility and lifecycle work shared by both modes

Both choices require durable index identity and generation, non-readable build
states, live-write participation during backfill, restart-safe progress, failure
recording and proof before publication. Prevent an older backfill value from
overwriting newer maintenance or resurrecting a deleted row. Fence writers that
have not adopted the active definition. On drop, withdraw planner routes before
physical reclamation; an old build or delivery generation cannot republish itself.

[FoundationDB's online index builder][fdb-build] illustrates write-only
maintenance during bounded backfill transactions. [F1 schema change][f1]
illustrates intermediate states and safe rollout under concurrent writes.
F1's "asynchronous schema change" describes schema rollout, not CDC-maintained
ordinary indexes. Synchronous maintenance is compatible with asynchronous
background construction.

Movement, split/merge, membership and leader changes remain owned by existing
partition/lifecycle machinery. The index interaction must carry identity,
generation, progress and retries through it, not add another topology authority.

Live queries have an additional initial-read/stream boundary. If an initial
snapshot uses a stale index and the subsequent stream starts after the omitted
mutation, a row can disappear from the subscription indefinitely. The
[live-query owner][live-query] must establish a compatible initial read and
gap-free change boundary. Synchronous index maintenance does not prevent
asynchronous post-commit live updates; the two feature choices are independent.

## Workload and future fit

| Usage scenario | Current fit assessment | Qualification |
| --- | --- | --- |
| Transactional app state, metadata and immediate save-then-find | Favors synchronous ordinary indexes | Depends on read visibility and acceptable write cost, not merely 2PC enlistment. |
| Locking reads and future uniqueness | Favors a synchronous foundation | Candidate discovery must be complete; reservations remain with base participants. |
| Heavy ingestion with explicitly delayed derived reads | Favors async evaluation | Lag, retention, backpressure and recovery must be bounded and observable. |
| Live/interactive queries | Either mode can work | A shared initial read/change boundary is required; unqualified stale index reads are unsafe. |
| Future search or embedding projections | Natural async candidate | Their freshness/error contract can be explicit rather than silently changing ordinary SQL. |
| Data-local WASM and later OCI execution | Maintenance mode is secondary | Route candidate base PKs through the existing data/CallCell owner; the index host does not automatically become the execution host or a second scheduler. |

The [roadmap][roadmap] keeps global uniqueness at 1.0, richer index semantics
at 1.x and cost-based combination at 2.0; native OCI has its later 0.6 home.
Do not pull those programs into this decision. A non-unique entry key made from
indexed tuple plus base PK does not enforce uniqueness of the indexed tuple.
Future uniqueness needs reservation/conflict semantics, NULL policy and build
validation even if synchronous maintenance is already available.

Missing workload evidence includes write/read ratio, number of global indexes,
indexed-value update frequency, key skew, read-after-write expectations, and
acceptable latency/availability/freshness budgets. Obtain those before treating
the fit table as a product requirement or inventing quantitative thresholds.

## Other research that sharpens the choice

| Primary source | Relevant finding and boundary |
| --- | --- |
| [YDB secondary indexes][ydb] | Exposes synchronous and asynchronous modes with different read contracts; async uses stale read semantics. This supports making the contract explicit, not shipping both modes in Lagrange 0.3. |
| [PNUTS asynchronous view maintenance][pnuts] | Shows an async design built around per-record timelines. Its consistency assumptions are not automatically an ordinary transactional SQL contract. |
| [SLIK][slik] | Creates new index coverage before publishing the base update and can defer obsolete-entry removal. Base-row validation works with that coverage protocol; it is not evidence that plain after-the-fact CDC can repair missing candidates. |
| [ScaleDB][scaledb] | Combines asynchronous range-index work with synchronous auxiliary coordination. Its single-machine shared-memory setting limits direct transfer to distributed Raft groups. |
| [CockroachDB transaction layer][cockroach] | Logical commit and later intent cleanup are grounded in durable transaction evidence. Asynchronous cleanup is not eventual secondary-index maintenance. |

These sources provide mechanisms and counterexamples, not Lagrange performance
predictions. Likewise, TiDB's [historical async-commit description][tidb]
concerns a transaction-commit optimization; protocol "secondary keys" are not
automatically SQL secondary indexes. No external benchmark number was used to
rank the alternatives here.

## Proposed bounded C1 decision experiment

First state the same write-acknowledgment, read-freshness, isolation,
read-your-writes, locking and fallback contract for both candidates. Then use
the normal bounded Quest process to prepare one narrow vertical slice: a
non-unique compound index with base and index data on different partitions.
This proposal does not authorize implementation before R2's required seal;
decision experiments must remain within C1's explicitly bounded authority.

The useful evidence is:

1. Insert followed by immediate indexed lookup; delete; an indexed-key move
   across old/new index partitions; multirow update/delete; transaction-local
   reads of staged changes. Include the declared NULL/type/collation cases.
2. Controlled observations around prepare, durable decision and apply; slow
   index participants; coordinator/leader loss; lost responses; eligible replica
   reads. Record which observations are allowed by the chosen read contract.
3. For an async candidate, paused consumption, duplicate replay, crash around
   acknowledgment, an unapplied gap, source generation changes and a split during
   catch-up. Prove that progress does not overstate completeness.
4. Concurrent backfill with updates/deletes, restart and drop/rebuild. An obsolete
   generation must not publish, overwrite newer entries or resurrect deleted ones.
5. The same workload with zero, one and several indexes, both uniform and skewed
   keys, plus one slow required participant. Measure throughput; p50/p95/p99
   mutation and fresh-query latency; participant fanout; conflicts/admission
   refusals/retries; backlog bytes/age; recovery; fallback rate; and partitions
   contacted for data and freshness control separately.

Use quiescent equivalence checks and controlled interleavings derived from the
contract. Comparing two independent queries at different times during concurrent
mutation is not a correctness oracle and must not smuggle in a global snapshot
promise. Keep deterministic falsifiers before distributed confirmation.

The synchronous lean strengthens if the shared visibility contract can be
proved through current owners with bounded contention and acceptable measured
cost. It weakens if hot index admission requires a broad concurrency redesign
while an async design can demonstrate the same declared query contract using
bounded, shared CDC progress. Conversely, all-source freshness barriers,
fallback or replay complexity may eliminate async's apparent advantage.

Record the resulting evidence and chosen default in C1/R2 through the existing
owner. Until then, performance, customer workload fit and the final maintenance
choice remain open.

## Source references

Repository observations are pinned to the source reviewed on 2026-10-28.
External references below are primary documentation or papers; living
documentation should be rechecked when the decision is sealed.

[rules]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/docs/steering/rules.md
[release]: https://github.com/psvensson/lagrange/releases/tag/v0.2.6
[stabilization]: https://github.com/psvensson/lagrange/blob/25c390cb52606b3e6afbee95c1f088d7b2be8302/solve/specs/release-0-2-7-stabilization/requirements.md
[locking]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/architecture/postgres-locking-reads.md
[execution]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/docs/execution-semantics.md
[tx1-decision]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/src/query/distributed/distributed-transaction-decision-protocol.js
[tx1-set]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/src/query/distributed/distributed-transaction-participant-set.js
[write-execution]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/src/query/sql-query-engine-write-execution.js
[tx1-session]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/src/partition/partition-participant-transaction-session.js
[tx1-request]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/src/partition/partition-participant-transaction-request.js
[tx1-apply]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/src/partition/partition-participant-transaction-apply.js
[read-execution]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/src/partition/partition-service-write-metrics-base.js
[remote-query]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/src/partition/partition-service-remote-query-methods.js
[cdc-policy]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/src/cache/cdc-table-policy.js
[cdc-obligation]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/src/partition/partition-cdc-obligation.js
[cdc-generator]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/src/partition/partition-cdc-generator.js
[cdc-sql]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/src/partition/partition-cdc-parameterized-sql.js
[cdc-ledger]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/src/partition/partition-cdc-obligation-ledger.js
[cdc-delivery]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/src/partition/partition-cdc-obligation-delivery.js
[cdc-admission]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/src/partition/partition-cdc-owed-admission.js
[cdc-tracker]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/src/cdc/cdc-confirmation-tracker.js
[hydration]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/src/partition/partition-service-hydration-image-methods.js
[cdc-handoff]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/src/partition/partition-cdc-delivery.js
[live-query]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/architecture/live-query-data-plane.md
[roadmap]: https://github.com/psvensson/lagrange/blob/0489a519fe683e2f278ff3f6294bb0787b94cba1/roadmap.md
[record-layer]: https://www.foundationdb.org/files/record-layer-paper.pdf
[fdb-build]: https://foundationdb.github.io/fdb-record-layer/IndexBuilding.html
[spanner]: https://docs.cloud.google.com/spanner/docs/secondary-indexes
[yugabyte]: https://docs.yugabyte.com/stable/architecture/transactions/distributed-txns/
[ramp]: https://www.bailis.org/papers/ramp-sigmod2014.pdf
[couchbase]: https://docs.couchbase.com/server/current/n1ql/n1ql-manage/query-settings.html
[couchbase-transactions]: https://docs.couchbase.com/server/current/learn/data/transactions.html
[dynamo-pressure]: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/gsi-throttling.html
[dynamo-transactions]: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html
[f1]: https://www.vldb.org/pvldb/vol6/p1045-rae.pdf
[ydb]: https://ydb.tech/docs/en/concepts/query_execution/secondary_indexes?version=main
[pnuts]: https://www.cs.albany.edu/~jhh/courses/readings/agrawal.sigmod09.view.pdf
[slik]: https://www.usenix.org/system/files/conference/atc16/atc16_paper-kejriwal.pdf
[scaledb]: https://www.usenix.org/system/files/osdi23-mehdi.pdf
[cockroach]: https://www.cockroachlabs.com/docs/stable/architecture/transaction-layer
[tidb]: https://pingcap.github.io/tidb-dev-guide/understand-tidb/async-commit.html
