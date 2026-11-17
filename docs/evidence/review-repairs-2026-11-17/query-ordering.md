---
audience: evidence
recorded: 2026-11-17
---

# Native-discovered coordinator text ordering repair

## Assignment before implementation

The operator's development takeover includes correcting errors encountered while
making the comparison candidate semantically valid. Managed job
[4911](https://github.com/psvensson/lagrange-lab/issues/4911) on source
`aa552dae30d7aed5deb53b962b42d8b9f8ee6253` exposed a separate existing defect:
the actual coordinator returned the emoji group before `abc` for `ORDER BY
dept`, while native SQLite returned `abc` first. Both one- and two-partition
tests had correct ROUND values and reversed text ordering. The complete native
log SHA256 is
`1eea631bf3b0b25c3913f40fcafabfd8ff625ff4b987a851f4d0731ae8617bb0`.

The two-string branch of `compareOrderByClauseValues` uses locale-dependent
`localeCompare`; it is unchanged from the original `4b0c8ec1` candidate. Both
the partial aggregate and buffered raw-row merge consumers reach this owner.
This is a known local contract violation with an unchanged binary text-order
contract and an engaged native oracle, so it is a separate bounded direct
repair. It does not change an owner boundary or introduce a new comparator
subsystem. Root records this scope amendment before behavior changes.

The author is `core_args_control`, working serially after the query author's
frozen scalar/budget edits. Writable files are this record,
`src/query/query-executor-select-aggregation.js`, and
`test/query/distributed-select-global-merge-correctness.test.js`. The scalar
helper, raw-budget owners and other query tests remain under `core_args_data`.

## Hypothesis and acceptance

Compare two represented text values by UTF-8 bytes, matching the native
partition database's default BINARY ordering. Keep the existing equality,
direction and secondary-key behavior. Prove ASC and DESC with native SQLite
expected values through both live coordinator consumers, including ASCII case,
prefix/empty strings, supplementary Unicode, and U+E000 versus U+10000. Assert
the database encoding and real partition delivery. The existing native
`abc`/emoji failure must pass without sorting expected or actual results in the
fixture.

Material exclusions: no custom COLLATE support, mixed-storage-class redesign,
NULL ordering change, new scalar-admission vocabulary, numeric-to-text storage
class reconstruction, or change to the unused streaming sort helper. A wider
finding is recorded separately rather than silently included. The surrounding
query, JOIN and budget interaction proofs remain required before integration.

Source review and native verification of the repaired ordering are pending.

## Author preparation and owner trace

Implementation starts from local commit
`50c7fa25631aed8c859d6bb840b9e670b093377b`, retaining the query author's frozen
Boolean and empty-BLOB corrections. The incoming global-merge test SHA256 is
`85ef86f0bc36330733a55ef71764db56a6cc90286fe40026fcf6e4d0f925efdd`.
Rule-set revision 5 applies. Loaded instructions include `AGENTS.md`, the
steering rules and router, the Quest workflow, query owner card and runtime
architecture, code style, fixture/regression policy, and owner-interaction and
harness-fidelity templates.

`QueryExecutor` exports `QueryExecutorPartitionServiceResolution`, whose
prototype receives `applyOrderBy` from the aggregation helper installer.
`QueryExecutorBase.executeSelect` supplies the real partition results and fanout
plan to `DistributedMergeEngine.mergePartitionResults`. Its partial-aggregate
consumer calls `combinePartialAggregateRows`, then `queryExecutor.applyOrderBy`;
its raw-row consumer calls `queryExecutor.aggregateSelectResults`, which reaches
the same ordering owner. Both retain ORDER BY before the global LIMIT/OFFSET.

The partition database returns represented text values through
`collectBoundedSqliteRows`; no locale collation belongs to that boundary. The
repair changes only comparison between two strings to `Buffer.compare` of the
UTF-8 bytes produced by `Buffer.from(string)`. Equality, direction and further
keys retain the existing owner path. The material UTF-16 counterexample is
U+E000 versus U+10000: JavaScript relational string comparison is not a suitable
replacement for the byte comparison.

## Retained witness and added proof obligations

The native #4911 one- and two-partition failures precede this behavior edit and
remain the measuring baseline. All existing scalar oracle assertions, including
the original ordered `abc`/emoji case, remain unchanged. The added matrix uses
the existing native cluster fixture, parser, planner, QueryExecutor and bounded
partition collector. It covers raw rows and partial aggregates, ASC and DESC,
whole results and LIMIT/OFFSET, repeated text keys with a descending numeric
second key, and a numeric-order control on the same data. Data includes empty
text, ASCII case and prefixes, accents and combining characters, embedded NUL,
emoji, and U+E000/U+10000. Each partition and the oracle must report UTF-8 from
the actual SQLite connection. Expected ordering comes directly from SQLite;
neither expected nor returned rows are re-sorted by the fixture.

Owner-interaction checks: the same comparator owns both active consumers;
native rows retain their text values, and canonical service rows and delivery
envelopes come from their production builders. The paired obligations are byte
ordering for text and unchanged numeric/secondary-key behavior in one witness.
No cache, state transition, retry, wake, durable mutation or admission boundary
is changed, so lifecycle, release and backpressure attacks are inapplicable to
this synchronous comparison repair. The original #4911 source and output retain
the known-bad treatment rather than changing the pass criterion.

Harness-fidelity checks: only transport delivery and readiness composition use
the existing fixture seams; the native database executes actual delivered SQL
and parameters. Both selected partitions contain every tested text key, making
raw concatenation incorrect and making aggregate groups span the partitions.
The fixture requires nontrivial results, the intended plan kind and delivery to
both partitions. No time compression or comparator substitution is introduced.
Every newly opened database is closed by test teardown. This is native query
semantics evidence, not physical network, replication or service-readiness proof.

No local project execution is authorized. Root owns native submission, scoped
static checks, independent review and exact-source capture. Verification remains
pending until those results are retained; source completion is not acceptance.

## Source handoff

The authorized comparator branch and regression additions are prepared. The
source edit is one comparison replacement plus its encoding comment. The test
addition uses 13 distinct text keys, two numeric keys per text value, and the
same rows on two partitions with distinct primary keys: 52 raw rows and 26
combined groups. Eight native-oracle queries cover both merge kinds, both
directions, and complete/windowed results; a ninth preserves numeric sorting.
The existing fixture exposes its actual partition database map only so the new
test can observe connection encoding. The scalar assertions were not changed.

Prepared source SHA256:
`5dbc90bd95cef4449ff71f0a1e26c796ca8c63af07989edac32d812df928d1e0`.
Prepared global-merge test SHA256:
`37f212678fc1a2c580aa41d599a9709e3dfc054c37a541caafd471db24ceb88a`.
The scalar helper and scalar-test input hashes remain, respectively,
`00259aa7c10ba1a3fa5ae814bd887b61ba0564acba37295ed7fdaa590258f713` and
`3dd4c494073c9ea531eba369712a5f782aabcaf82854c2804c22dabedced30c0`.
Manual source/diff review and Git whitespace validation found no additional
scope changes. Files remain under their source/test size limits. No local
project, checker, or test execution was performed. Independent approval and
managed native proof remain pending with the root integration owner.

## Final native proof and independent review

Managed [job 4918](https://github.com/psvensson/lagrange-lab/issues/4918)
ran exact query candidate `232725ae1a34b68583295f395efd616c9ea1184b`.
The comparator and global-merge test retained the two hashes above. The
global suite passed all 304 reported assertions, including the original
one/two-partition scalar ordering cases and the added raw/partial,
ASC/DESC, complete/windowed UTF-8 BINARY matrix. The full ten-suite query
interaction passed 1,299 assertions. The original native log SHA256 is
`75bca17c88aa981b94591bb83c857be3691155c8c2dc10005b3f2baaa30c9acb`;
the [query record](query.md) retains complete worker and collection identities.

Independent verifier `subagent:core_args_data` traced both actual merge paths
through this comparator before global LIMIT, reviewed the exact comparator
and test hashes, and found no material blocker. This reviewer did not author
the ordering repair. Root inspected the native results and confirmed exact
source and scope closure, satisfying that review's native condition.

The scalar helper and its unit tests changed separately after the source
handoff above; their final hashes and independent approval are retained in
`query.md`. Their historical earlier hashes are not asserted as current.
This accepts only represented UTF-8 text under the existing default BINARY
ordering contract. It does not add custom collations, change NULL or
mixed-storage-class ordering, or establish physical/GCP readiness.
