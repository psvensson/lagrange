---
audience: development
documentClass: planning
---

# Verified preparation for 0.3 implementation

Verification date: 2026-10-29. Status: **source-verified preparation; design
decisions and runtime witnesses remain open**.

This note preserves the investigation of the remaining 0.3 preparation areas
for the [release epic](../../epics/release-0-3-queryable-core.md) and its
[existing work program](tasks.md). It complements the
[global-index maintenance research](global-index-maintenance-research.md).
It creates no Quest, changes no acceptance predicate or supported SQL subset,
and marks no release axis complete. C1/R2 remains unsealed.

## Evidence baseline and limits

| Inspected material | Pinned revision | Meaning |
| --- | --- | --- |
| Current main | `71179adf82be304b3ad1530f62c108adb35fbd1b` | Implementation and current architecture census |
| 0.3 planning, PR #74 | `eb48a2088d539c22c08844d01f2725acd76c4c5c` | Existing task/acceptance owners and prior index research |
| 0.2.7 proposal, PR #149 | `25c390cb52606b3e6afbee95c1f088d7b2be8302` | Proposed stabilization handoff, not delivered fixes |

The 0.3 branch has an older runtime tree. All source links below intentionally
point to inspected main; this note does not claim those source changes are
present on the planning branch. Main differs from the earlier index census
at `0489a519fe683e2f278ff3f6294bb0787b94cba1` by a formation-health trend
record, not runtime source ([comparison][main-compare]).

Verification included source reads, caller/import searches, adjacent owner
traces, independent cross-review of keys, live queries and index/planner code,
and primary database documentation. No runtime experiment, benchmark, fault
injection or physical-cluster qualification was run for these findings.
Existing tests were inspected as evidence of intended coverage, not reported
as freshly passing. A static mismatch identifies a witness to build; it does
not establish a reproduced public failure.

The raft-rs, TX1, FreshMG and SN1 foundations recorded by the previous research
are inputs to 0.3. This note does not reopen them or certify the epic's
integration fences. Re-census the actual post-0.2.7 candidate before sealing
implementation work. The dated October 2 epic baseline and October 7 A2
reconnaissance remain historical records.

## Preparation priorities

The highest-value work is to make the shared semantic contracts reviewable
before implementing features that depend on them. The order below is a
preparation recommendation, not a replacement dependency graph.

| Priority | Existing owner | Concrete output to review |
| --- | --- | --- |
| 1. Keys and row identity | A2-A4; Q02/Q03 handoff | Admitted key-domain matrix and scalar/compound lifecycle trace |
| 2. Read visibility and locking | B1-B5; C1 read contract | Visibility matrix and reservation/wait/recovery decision table |
| 3. Live-query continuity | D0-D6 | Canonical identity/dependency matrix and snapshot/frontier state table |
| 4. Local-index DDL | A5 | Intent, materialization and readable-capability lifecycle |
| 5. Predicate/access-path semantics | A4/A6 | Supported constraint matrix, conservative fallback and result oracle |
| 6. Release integration | E1; 0.2.7 owners | Handoff map and four public-path journeys |

For each output, record current owners, unresolved alternatives, a conditional
recommendation, and the smallest falsifying witness. Avoid a second planner,
transaction manager, schema workflow or release-proof framework.

## 1. Keys and row identity

### Verified source findings

A2 already has substantive
[boundary-representation reconnaissance](../../epics/release-0-3-queryable-core/a2-boundary-representation-reconnaissance-2026-10-07.md),
including D1-D9 and three representation families: canonical payload with
explicit metadata, a versioned typed envelope, and order-preserving encoding.
Use that discriminator instead of restarting a general encoding survey.

The current path still selects a median with SQLite ordering, persists the
split value in JSON-shaped transition metadata, and stores child boundaries
in catalog columns declared TEXT. The persisted split-plan reader still uses
`if (!splitKey)`, conflating present `0`/empty-string values with absence.
These are source facts; this review did not run a split/restart witness for
either value. Empty-string median reachability depends on the admitted key
domain; zero is the clearer initial discriminator. ([Median owner][median],
[transition persistence][split-persist],
[split-plan reader][split-plan], [catalog schema][catalog].)

**Correction to the October 7 census:** the broad statement that production
has no safe-integer mode is no longer true. Current source uses
`safeIntegers(true)` in system-table image reads and other durable-state
paths. The actual median goes through ordinary statement admission and plain
`database.prepare(sql)`, then the bounded-row collector's `all`/`iterate` path.
No database-wide `defaultSafeIntegers` use was found under `src`. Exact handling
elsewhere does not establish this path. The driver returns JavaScript numbers
by default and supports explicit BigInt reads/binds. ([Current image read][schema-sql],
[ordinary read preparation][read-statement], [row collector][result-budget],
[driver integer contract][sqlite-integers].)

Do not broaden this into a claim that every literal or parameter is coerced to
Number: top-level AST conversion passes the parser's numeric value through,
and parameterized split extraction preserves supplied values. Explicit Number
conversion does occur in partition-side literal reconstruction and unary key
extraction. Which seam first loses or refuses a particular public large-integer
input remains unexecuted. Simply enabling BigInt reads also needs compatible
result/transition JSON, row-count arithmetic and split comparison. An encoding
added after conversion cannot recover lost precision. ([Expression conversion][expressions],
[partition SQL extraction][partition-sql], [resolver][resolver], [write routing][write-routing],
[row collector][result-budget], [split comparison][split-comparator].)

Declared SQL type alone is insufficient evidence of the actual stored key
domain: SQLite normally uses value storage classes and affinity. Lagrange's
schema normalization maps DECIMAL/NUMERIC to REAL and date/time-like types to
TEXT. The new contract must not accidentally promise exact decimal or temporal
semantics that this normalization does not provide. ([SQLite types][sqlite-types],
[normalization][schema-derivation].)

The declared-key disagreement is reachable source structure. Normal planning
passes parameters/aliases without supplying `keyColumns`; table lookup returns
catalog rows. The resolver reads `primaryKey`/`primary_key`, then falls back
to `id`, while CREATE persists `partition_key`. The write coordinator repeats
the fallback and INSERT extracts only the first key component. The compound
resolver serializes full-equality tuples with JSON, and managed split explicitly
refuses comma-containing partition keys. These are partial, inconsistent
pathways, not evidence of a supported compound lifecycle that merely needs a
faster SELECT. ([Planner][planner], [resolver][resolver], [write routing][write-routing],
[CREATE metadata][create-table], [split admission][managed-split].)

There is also a schema-preservation seam owned by 0.2.7 Q02: table-level PK
intent lives in `ast.primaryKey`/table constraints, while user-table catalog
schema construction retains column flags; replica creation decodes that
schema, and the normal partition DDL emitter emits per-column PK flags.
The generic system-table SQL generator does support `schema.primaryKey`, but
that is a different path and does not repair missing user-table schema intent.
This static trace needs a public CREATE/invalid-insert witness before claiming
a reproduced enforcement failure. ([Parser][parser], [schema derivation][schema-derivation],
[replica metadata][replica-metadata], [partition bootstrap][table-bootstrap],
[generic schema generator][schema-sql], [Q02 requirements][stabilization].)

### Decision preparation

Prepare one matrix covering declared type, normalized SQLite type, admitted
value storage classes, exact precision, NULL, missing versus unbounded,
collation, tuple order/prefix behavior, durable version, and legacy decode or
revalidation. Include D1-D9: `0`, `''`, `9007199254740993`, numeric `500`
versus TEXT `'500'`, U+E000/U+10000 ordering, REAL, unbounded, and ambiguous
old TEXT. SQL tuple comparison with NULL can be unknown; it is not the same
thing as the total order needed by a storage/routing encoding.
([Existing D1-D9 census](../../epics/release-0-3-queryable-core/a2-boundary-representation-reconnaissance-2026-10-07.md),
[SQLite row values][sqlite-row-values].)

Trace `PRIMARY KEY (account_no)` and `(account_no, entry_no)` through admission,
physical schema, catalog, INSERT/UPDATE/DELETE routing, SELECT, split/child
creation, restart, and live-result identity. Mark each unsupported transition
explicitly. Preserve A4's bounded target: full compound equality with safe
scatter for unproved partial predicates; do not silently add general compound
range optimization or global uniqueness.

The conditional recommendation remains: choose the smallest representation
that survives the real lifecycle discriminator. If old state cannot be decoded
without guessing, an explicit alpha revalidation/recreation policy is preferable
to lossy migration. Q03 already includes persisted-boundary policy; establish
what it actually delivers before assigning residual work to A2.

**Smallest next witnesses:** one exact scalar boundary through the real median,
transition, child storage and restart path, using a native storage oracle that
does not itself round the integer; then one admitted non-`id` and one
compound table through the full declared lifecycle. Reuse Q02/Q03 proof where
its scope matches, and prove physical partition boundaries rather than mocking
an idealized catalog.

## 2. Read visibility and locking

### Verified source findings

Current [locking-read architecture][locking-architecture] describes staged
read-your-own-writes over current committed state plus partition-generation
first-committer-wins conflict detection. The older 0.3 branch's snapshot-isolation
wording must not be carried forward as a current guarantee.

The participant stages operations in memory. For a statement it replays those
operations inside one synchronous SQLite transaction, reads committed state
plus its own work, then rolls the SQLite transaction back. It holds no SQLite
transaction across requests. Participant BEGIN admits one nonterminal transaction
per partition; PREPARE validates the recorded write generation. A durable
PREPARED row is an obligation resolved by a decision, not by expiring its timer.
([Staging][tx-staging], [participant requests][tx-request], [session lifetime][tx-session].)

TX1 records its insert-once decision before decision fanout and completes a
recorded COMMIT forward even after a lost answer or budget expiry. That is
durable outcome ownership; it does not establish one cross-partition read
snapshot. The transaction grammar explicitly refuses named isolation modes,
READ ONLY and DEFERRABLE rather than claiming to enforce them.
([Decision protocol][tx-decision], [transaction grammar][tx-grammar].)

Cancellation needs its own public-path work. PG startup handles SSLRequest and
protocol startup but has no CancelRequest branch. The SQL adapter supplies a
timeout budget without a caller cancellation token; disconnect performs
best-effort transaction rollback. The outcome mapper preserves unknown COMMIT
outcomes as SQLSTATE 08007. None of these mechanisms alone establishes the
future cancel-a-waiting-lock contract. ([PG startup][pg-handler],
[adapter][pg-adapter], [outcome mapping][pg-outcome].)

### Decision preparation

Keep four questions explicit:

| Question | Decision needed |
| --- | --- |
| Ordinary statement freshness | Eligible replicas, required freshness and behavior when unavailable |
| Distributed read visibility | What a statement can observe across base/index participants and commit application |
| Session reads | How current committed state, staged writes and generation conflicts interact |
| Locking reads | Candidate discovery, reservation identity, conflict handling and release/recovery |

A freshness frontier is not a snapshot; a row reservation is not predicate or
phantom protection. This preparation should specify the supported contract
without silently committing 0.3 to global MVCC or serializability. Index scans
and full scans must reserve the same base-row identity under that contract.

For B1, compare explicit fail-fast conflicts, bounded waiting with deterministic
cycle resolution, and a general distributed deadlock detector. Fail-fast is
smaller but cannot silently substitute NOWAIT-like behavior for an advertised
blocking contract. Bounded waiting is the most promising first investigation,
conditional on owned wakeup, fairness, deadline propagation and multi-statement
deadlock handling. A full detector may be justified by evidence, but expands
the state and recovery problem. Ordering acquisition within one statement does
not eliminate cycles accumulated across multiple statements.

The current one-transaction-per-partition envelope may dominate contention even
if reservations name rows. Decide whether the first slice preserves that limit
or explicitly changes its owner; do not promise independent same-partition row
concurrency for free. PostgreSQL's lock semantics are a compatibility reference,
not proof that Lagrange already has its isolation machinery. Other lock strengths,
NOWAIT, SKIP LOCKED and complex query forms require explicit scope decisions.
([Current architecture][locking-architecture], [PostgreSQL locking][pg-locks].)

Model acquire, wait/refuse, candidate change while waiting, release, timeout,
cancel, disconnect, leader loss and recovery. PostgreSQL cancellation uses a
separate connection and backend identity; the request has no direct success
acknowledgment, so completion must still be learned on the original query path.
Keep waiter cancellation separate from durable transaction outcome resolution:
a timeout cannot turn a recorded COMMIT into rollback. ([Protocol reference][pg-cancel],
[TX1 decision owner][tx-decision].)

**Smallest next witnesses:** same-row contention; unrelated rows in one partition;
opposite partition acquisition order; candidate mutation while waiting; scan/index
equivalence; commit, rollback, timeout, cancel and disconnect; leader loss/lost
response. Exercise public PG simple and prepared execution, and define implicit
statement transactions outside BEGIN. These are future proof cases, not tests
reported as passing here.

## 3. Live-query identity and continuity

### Verified source findings and corrections

The current startup path installs a SystemTableCache notification adapter.
Generic user-table CDC is explicitly disabled by table policy and current
capability documentation. The live-query architecture labels the generic data
plane an approved direction, not a current general capability. D2 therefore
includes recording/admission/delivery policy for ordinary user tables, beyond
replacing a callback adapter. ([Startup wiring][live-startup], [CDC policy][cdc-policy],
[capabilities][capabilities], [architecture][live-architecture].)

Current grouping uses table plus canonicalized WHERE and retains separate key,
routing and JavaScript predicate logic. This is insufficient by itself to
identify a generic maintained SQL result. It can still be legitimate to share
lower-level source interest between different projections; sharing interest
and sharing an identical result are separate decisions.
([Manager][live-manager], [QueryGroup][live-group], [service][live-service].)

Two earlier concerns need narrower wording. `buildSelectSQL()` omits WHERE,
but no checked-in production caller of `sendSnapshotToClient()` was found.
The admin subscription handler preserves and parses the original SELECT,
registers it, and sends registration metadata; it does not execute an initial
SQL snapshot there. Likewise `resumeLiveQuery()` checks cursor age and re-adds
a client without replay, but only tests call that method in the checked-in
census. Neither helper establishes a released snapshot/resume contract.
([Manager helpers][live-manager], [actual admin dispatch][live-admin].)

**Correction on CDC reuse:** active committed CDC has a durable obligation
ledger. The handshake registers a subscriber and drives owed delivery; it no
longer promises handshake catch-up. Seed hydration registers before a
leader-local image that reads rows and durable applied index P in one synchronous
span. This is real reusable work. It is not a global snapshot, an ordinary
distributed SQL result already bound to frontiers, or indefinite replay for
disconnected clients; delivered event rows can be reclaimed into compact
progress. ([Delivery][cdc-delivery], [hydration image][hydration-image],
[seed hydration][seed-hydration], [obligation reclamation][cdc-obligation].)

The legacy volatile CDC buffer drops oldest on overflow, but current write-side
producers disable that emission and committed application records durable CDC.
Treat that buffer as a reuse hazard, not evidence that the active durable lane
silently loses committed events. Similarly, QueryGroup removes old partition
subscriptions before adding new ones without an explicit frontier handoff, but
its current adapter is cache-backed; this is not a reproduced remote user-table
loss. ([Legacy buffer][cdc-buffer], [current write side effects][write-kernel],
[committed apply][entry-apply], [group reconfiguration][live-group].)

### Decision preparation

Use the canonical SQL owner to describe query/parameter identity, projection,
order/limit, schema/table identity and relevant execution context. Document
whether an eligible result has a stable internal base-row identity or requires
reset. SQL projection can produce duplicate rows: two base rows projecting
`'pending'` must retain multiplicity. Materialize's signed result updates and
explicit progress are useful references, not an implementation dependency.
([SUBSCRIBE reference][materialize-subscribe].)

The partitions contacted by one execution are not automatically every future
mutation source that can affect its result. A predicate whose result is currently
empty can later match an inserted or updated row; an outside row can enter
top-N; another join input can change membership. Let the canonical planner
supply safe continuing dependencies,
possibly a conservative superset. This refines D1's dependency question without
authorizing a second live planner or different live SQL semantics.

Prepare a contract matrix for scalar-PK lookup, a non-PK predicate with an
initially empty result, predicate entry/exit, and ordering/limit. For each,
record initial read/frontier
assumptions, continuing dependencies, event-image requirements, delta/reset
eligibility and topology/recovery/pressure behavior. Current cache UPDATE/UPSERT
events use the same record as old and new data, while QueryGroup membership
logic expects meaningful before/after images. Classify actual image completeness
before admitting incremental maintenance. ([Adapter events][live-startup],
[membership logic][live-group].)

The architecture already permits relevant-event-triggered re-execution/reset
for complex plans and reset when exact continuation cannot be proved. The
recommended first investigation is a small proved delta subset with that
existing fallback. It does not require full incremental view maintenance in
the first slice. A candidate INITIALIZING/LIVE/RESYNCING/CLOSED state table can
make obligations reviewable, but these names are not a newly sealed state owner.
([Permitted maintenance levels][live-architecture].)

That table should cover registration, image/query read, initial publication,
event overlap/deduplication, custody acknowledgment, disconnect, resume/reset,
and retirement. A vector of partition positions must not be called a globally
consistent snapshot without further proof. Resume needs compatible query/schema/
topology context and retained continuity; a cursor's age alone is insufficient.
For re-execution, consider one evaluation in flight plus an invalidation
generation, so changes during evaluation are not lost and old results cannot
overwrite newer ones. This is a design candidate, not a required new mechanism.

Define successor coverage before retiring a source, or explicitly reset into a
new generation. Fence stale events through the canonical topology owner. Bound
slow-consumer memory and choose reset/refusal behavior rather than unbounded
delivery debt. Distinguish durable source custody from delivery to every UI
client; transient live interest must not become permanent retention authority.

**Smallest next witnesses:** pause writes at the image/stream boundary; remote
insert/update/delete; duplicate event and duplicate projection; a row entering
top-N; a write during re-execution; disconnect with proved resume or explicit
reset; split during writes; final consumer release. Retain D6's idle proof:
zero reads whose purpose is discovering data changes, followed by an unsolicited
correct update. These are proposed witnesses; no generic live capability is
certified by this source review.

## 4. Local-index DDL and activation

### Verified source findings

The parser emits CREATE_INDEX/DROP_INDEX, but normal SqlCore statement dispatch
has no index cases. No production import/instantiation of IndexService or
QueryOptimizer was found outside their scaffold; tests construct them.
This finding concerns public index DDL wiring, not the existence of native or
internal SQLite indexes. ([Parser][parser], [dispatcher][dispatcher],
[IndexService][index-service].)

Inside that scaffold, `getPartition()` returns a catalog row, while physical
index methods expect an object with `executeQuery` and sometimes `tableName`.
The adjacent control-plane gateway preserves result rows without enriching
them into service handles. CREATE persists metadata before physical attempts;
DROP removes metadata before physical removal. Build failures are propagated,
not simply swallowed. The persisted `indices` schema has no build/readability/
drop state or generation. This is an internal integration mismatch and missing
eligibility distinction, not an observed public CREATE INDEX failure.
([IndexService][index-service], [gateway rows][gateway-read], [catalog][catalog].)

Persisting desired metadata first can be correct. The missing proof is when
that intent becomes a usable physical capability on required replicas and how
interrupted work converges. Local SQLite maintains an existing local index
with its table writes; A5 must not acquire the separate global-index row-change
maintenance problem by accident. ([SQLite index reference][sqlite-create-index].)

### Decision preparation

Model intent, building, readable, failed/retryable and dropping outcomes using
existing schema/topology ownership. These are review cells, not prescribed
state names or a second workflow engine. Inspect the existing schema-provisioning
job owner for reusable durable intent, fencing and recovery patterns; its
current CREATE_TABLE workflow is not an already implemented index lifecycle.
([Provisioning owner][schema-jobs].)

Decide the public completion rule for ordinary CREATE INDEX: bounded blocking
work or an explicitly owned durable job and its observable result. Distinguish
that choice from adding PostgreSQL CONCURRENTLY syntax. The latter has separate
semantics and is not implicit 0.3 scope. Name equality alone also does not prove
same-definition idempotency; PostgreSQL's IF NOT EXISTS documentation makes
that distinction explicit. ([CREATE INDEX reference][pg-create-index].)

Record same-intent retry versus conflicting definition; partial physical fanout;
coordinator loss; replica restart; later partition/split creation; generation
fencing; readable publication; and removal from eligible plans before physical
drop. Determine what existing read route observes during each phase. Physical
readiness must be scoped to the replicas/routes that can use the index, not
inferred solely from the existence of a catalog row.

**Smallest next witness:** build over existing rows, interrupt partial fanout,
restart/retry, introduce a later partition and then drop. Observe catalog intent,
physical SQLite state and public SQL behavior through the real execution owner.
Consume A5's existing requirements; keep C2/C3 global lifecycle/backfill separate.

## 5. Predicate and access-path semantics

### Verified source findings

The orphan QueryOptimizer reduces WHERE/JOIN expressions to sets of column
names and ORDER BY to names without directions. Its prefix/arbitrary-column
heuristic cannot prove equality versus range, Boolean composition, requested
order or full covering-index eligibility. It does not mutate the original AST,
and is not wired into the current production SELECT planner. Do not describe
this as today's engine dropping WHERE operators during execution.
([Optimizer scaffold][optimizer].)

The active PK resolver has a different, concrete preparation concern: AND
visits a shared mutable constraint accumulator, repeated same-side range bounds
overwrite, equality adds values, and OR refuses narrowing. This lacks normalized
intersection/contradiction handling, but overwrite alone does not prove missing
rows: `id > 20 AND id > 10` can merely select extra partitions while residual
SQL filters correctly. Require the actual candidate/result witness.
([Resolver constraint extraction][resolver].)

Also include NOT IN, mixed literal/expression IN and unresolved parameters in
that witness. The canonical parser preserves IN negation and expression members;
the resolver's IN handler ignores negation and drops values it cannot extract.
This is a static risk requiring runtime confirmation, not a certified defect
from this review. ([Expression conversion][expressions], [IN extraction][resolver].)

### Decision preparation

The shared A4/A6 contract should retain qualified column identity, operators,
values/parameters, Boolean structure, NULL/type/collation semantics and requested
ordering. A normalized conjunction is one candidate implementation; safe
conservative fallback remains valid where extraction is unsupported. The
original predicate remains the residual correctness authority.

For `(a,b,c)`, enumerate full/partial equality prefixes, an equality prefix plus
next-column range, `b` alone, contradictions, reordered repeated bounds, OR
branches, NULL, aliases and parameters. Prove that candidate selection includes
every possible match. Extra candidates can be filtered; omitted candidates
cannot be restored by rechecking returned rows. Filtering eligibility and
ORDER BY eligibility need separate evidence; avoid an accidental index-only
scan commitment.

A6's refusal to claim `b`-only distributed ordered narrowing is a bounded
Lagrange contract. It is not a universal statement that SQLite can never use
such an index: SQLite documents local skip-scan. Preserve that distinction
when comparing plans. ([SQLite optimizer][sqlite-optimizer].)

**Smallest next witness:** compare routed/indexed execution with a native or
scatter result oracle over a controlled dataset and declared read contract.
Use deterministic write pauses or an owned visibility cut when concurrency is
involved; two reads at different times are not automatically comparable.
`EXPLAIN DISTRIBUTED` should explain selected prefix/range or rejection through
stable owned fields. Do not turn SQLite's unstable EXPLAIN QUERY PLAN text into
a public/test contract. ([SQLite plan-output guidance][sqlite-eqp].)

## 6. The 0.2.7 handoff and release journeys

The [0.2.7 requirements][stabilization] are an open proposal at the pinned head.
They identify work to consume and re-check, not fixes this note certifies as
landed. Avoid both duplicating their scope and assuming they deliver all 0.3
semantics.

| Proposed package | Handoff to inspect | Remaining 0.3 boundary |
| --- | --- | --- |
| Q01 expressions | Canonical expression meaning preserved or explicitly refused | General access-path/constraint semantics still belong to A4/A6 |
| Q02 schema constraints | Inline/table constraints survive or are refused; physical/restart behavior proved | Declared-key routing consumes that schema; per-partition uniqueness is not global uniqueness |
| Q03 storage-compatible order | Shared ordering, Unicode/numeric cases and persisted-boundary revalidation/migration decision | Determine the residual typed/tuple domain before A2; do not describe Q03 as only a comparator edit |
| Q10 retention | Per-role checkpoint-proven reclamation, repeated compaction, restart and lagging follower proof | No automatic replay-retention contract for live clients or index builds |
| Q11 observation | Typed cadence/checkpoint/compaction/debt reporting | Reuse diagnostics; no second readiness authority or retry loop |
| Q14 operating contract | Actual replica reads, partition transaction slots, generation/replay bounds and unknown outcomes | No new global snapshot/isolation guarantee; any public retry identity needs its own seal |

Q17's release candidate and physical-cutover qualification retain their own
evidence boundaries. Earlier foundation proof can be reused only where the
actual candidate and claim permit; this note supplies no substitute release
receipt. The 0.2.7 ownership table explicitly protects completed TX1/SN1/FreshMG
and numeric work and excludes secondary indexes and general serializable/
linearizable reads. ([Handoff and exclusions][stabilization].)

Prepare four E1 integration journeys using existing owners and proof harnesses:

1. **Declared-key lifecycle:** admitted non-`id` and compound schemas through
   writes, routed reads, real boundaries/topology and restart, with explicit
   refusal of transitions outside the sealed subset.
2. **Indexed application query:** existing rows, key-changing mutation, correct
   fallback and interrupted build/recovery under the chosen read contract.
3. **Public locking transaction:** contention, release, timeout/cancel and
   outcome/recovery through PG, including more than one participant.
4. **Live application view:** remote changes, relevant future mutations,
   reconnect with resume/reset, topology change and final-interest cleanup.

These are ways to organize existing acceptance evidence, not four newly opened
Quests or replacement acceptance predicates. Add observation of fanout, wait,
retained debt and cleanup through existing diagnostics. Keep performance and
customer workload assumptions marked unmeasured until representative evidence
exists. Source preparation does not justify a calendar estimate.

## Recommended next bounded preparation

Start with the admitted key-domain/lifecycle matrix and the read-visibility
matrix. They feed the existing C1 index decision as well as B1 and D1/D3.
Develop the live identity/frontier matrix in parallel once those dependencies
are explicit. Re-census A5's real execution owner and A6's supported constraint
cases before implementation task sealing.

At each handoff, record what 0.2.7 actually repaired, what remains, the owner
that decides it, and one minimal production-path discriminator. Choose no
encoding, wait policy, live continuation algorithm or index maintenance mode
merely by preserving this note. The purpose is to turn the existing 0.3 program
into bounded, reviewable decisions with fewer hidden interactions.

## Pinned source and primary references

Repository links identify the inspected revisions. External primary references
were checked on 2026-10-29 and inform the comparisons; they do not define new
Lagrange acceptance requirements.

[main-compare]: https://github.com/psvensson/lagrange/compare/0489a519fe683e2f278ff3f6294bb0787b94cba1...71179adf82be304b3ad1530f62c108adb35fbd1b
[catalog]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/bootstrap/system-table-core-schema-definitions.js
[median]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/partition/partition-split-merge-manager-core-methods.js#L422-L464
[split-persist]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/partition/managed-split-workflow-persistence-methods.js
[split-plan]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/partition/managed-split-workflow-provisioning-methods.js#L33-L55
[schema-sql]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/bootstrap/system-table-schema-sql.js
[read-statement]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/partition/partition-read-statement-owner.js
[schema-derivation]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/query/table-creation-service-schema-derivation.js
[planner]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/query/distributed/distributed-query-planner.js#L328-L336
[resolver]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/query/partition-resolver.js
[write-routing]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/query/distributed/distributed-write-coordinator.js
[create-table]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/query/table-creation-service-create-table.js
[managed-split]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/partition/managed-split-workflow.js#L198-L209
[parser]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/query/sql-parser.js
[replica-metadata]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/node/replica-handler-runtime-metadata-methods.js
[table-bootstrap]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/partition/partition-service-table-bootstrap.js#L228-L256
[stabilization]: https://github.com/psvensson/lagrange/blob/25c390cb52606b3e6afbee95c1f088d7b2be8302/solve/specs/release-0-2-7-stabilization/requirements.md
[locking-architecture]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/architecture/postgres-locking-reads.md
[tx-staging]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/partition/partition-participant-transaction-staging.js
[tx-request]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/partition/partition-participant-transaction-request.js
[tx-session]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/partition/partition-participant-transaction-session.js
[tx-decision]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/query/distributed/distributed-transaction-decision-protocol.js
[tx-grammar]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/query/sql-transaction-control-grammar.js
[pg-handler]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/runtime/pgwire-protocol-handler.js#L237-L298
[pg-adapter]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/query/pg/postgres-wire-adapter.js
[pg-outcome]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/runtime/pgwire-transaction-outcome.js
[live-startup]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/live-query/live-query-startup-wiring.js
[cdc-policy]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/cache/cdc-table-policy.js#L484-L573
[capabilities]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/docs/current-capabilities-and-limitations.md
[live-architecture]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/architecture/live-query-data-plane.md
[live-manager]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/live-query/live-query-manager.js
[live-group]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/live-query/live-query-group.js
[live-service]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/live-query/live-query-service.js
[live-admin]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/admin/admin-websocket-message-dispatch-methods.js#L195-L234
[cdc-delivery]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/partition/partition-cdc-delivery.js
[hydration-image]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/partition/partition-service-hydration-image-methods.js
[seed-hydration]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/bootstrap/phases/seed-cache-hydration-phase.js#L404-L450
[cdc-obligation]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/partition/partition-cdc-obligation.js#L269-L302
[cdc-buffer]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/partition/cdc-event-buffer.js#L105-L137
[write-kernel]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/partition/partition-write-kernel.js#L524-L563
[entry-apply]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/partition/partition-service-entry-apply-base.js
[dispatcher]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/query/sql-query-engine-statement-execution.js#L298-L348
[index-service]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/index-management/index-service.js
[gateway-read]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/control-plane/control-plane-system-table-gateway-read-strategies.js
[schema-jobs]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/query/schema-provisioning-job-owner.js
[optimizer]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/index-management/query-optimizer.js
[expressions]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/query/sql-parser-expression-methods.js
[result-budget]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/query/query-result-budget.js#L62-L89
[partition-sql]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/partition/partition-sql-parser.js
[split-comparator]: https://github.com/psvensson/lagrange/blob/71179adf82be304b3ad1530f62c108adb35fbd1b/src/partition/split-key-comparator.js
[sqlite-integers]: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/integer.md
[sqlite-types]: https://www.sqlite.org/datatype3.html
[sqlite-row-values]: https://www.sqlite.org/rowvalue.html
[sqlite-optimizer]: https://www.sqlite.org/optoverview.html
[sqlite-eqp]: https://www.sqlite.org/eqp.html
[sqlite-create-index]: https://www.sqlite.org/lang_createindex.html
[pg-locks]: https://www.postgresql.org/docs/current/explicit-locking.html
[pg-cancel]: https://www.postgresql.org/docs/current/protocol-flow.html#PROTOCOL-FLOW-CANCELING-REQUESTS
[pg-create-index]: https://www.postgresql.org/docs/current/sql-createindex.html
[materialize-subscribe]: https://materialize.com/docs/sql/subscribe/
