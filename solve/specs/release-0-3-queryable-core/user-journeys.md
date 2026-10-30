# Queryable Core user journeys

Planning adoption: 2026-10-30. Full completion target: **0.3.2**; selected bounded
corrections may ship in **0.3.1**. See the
[current epic](../../epics/release-0-3-queryable-core.md#current-summary) and
[execution plan](tasks.md). This specification defines the integration journeys
for the existing eight axes; it does not declare them implemented or accepted.

The [major-feature journey policy](../../../test/guidelines/release-gate.md#major-feature-user-journeys)
is the single proof-policy owner. Define the ordinary application author's
steps and code separately from harness orchestration before implementing a
capability. Use supported public ingress, real production factories and actual
artifact/runtime identities. A fixture may observe or inject a named fault;
it may not supply missing wiring, seed internal authority or replace the feature.

Inherited expression/constraint, installation, operating and publication
predicates stay in the [stabilization requirements](../release-0-2-7-stabilization/requirements.md).
The J labels below are coordination references, not new Quest IDs or seals.

## J2 SQL keys and read semantics

**Owner:** canonical SQL, typed key/partition and TX1 owners. Consume stabilization
Q01-Q03/Q14 and the existing
[key-ordering Quest](../../quests/partition-key-ordering-owner-completion/quest.json);
do not duplicate their acceptance predicates.

**User outcome:** an application creates and updates correctly identified data
through ordinary SQL. Its declared non-id and composite keys, bound parameters,
arithmetic updates and admitted constraints retain their meaning before and
after supported split/merge/restart transitions.

The 0.3 integration work establishes one representation/comparison and read
contract for base scans, local/global index routing, locking discovery and live
snapshots. Exercise admitted integer precision boundaries, UTF-8 text, blobs and
tuples. Invalid or unrepresentable values cannot silently fall back to different
comparison semantics. Full compound equality narrows correctly; partial
predicates scatter safely and contradictory predicates do not create false
candidate sets. Preserve PR151's parameter/join corrections.

Route the demonstrated CHECK-grouping, unchanged-value unique UPDATE,
unsuccessful-read and admitted-key-expression discrepancies to Q01-Q03.
The isolated conflict witness covers `INSERT OR IGNORE`; it is not a general
PostgreSQL UPSERT finding or permission to broaden SQL syntax. Inherited repairs
must preserve supported behavior or refuse unsupported constructs before
effects. Local/partition-safe uniqueness is the boundary here; a cross-partition
preflight scan is not global uniqueness authority. Global uniqueness remains 1.0.

Record supported read freshness, transaction-local visibility and cross-partition
limits once through their existing owners. A TX1 durable decision does not imply
a global read snapshot or serializability. Unknown/unavailable dependencies must
not be projected as an empty successful result or absence of conflict.

**Oracle and witness:** independent reference SQL for the admitted subset,
explicit business invariants and keyed row/value equality across the lifecycle.
Include NULLs, affected-row counts, typed errors, grouped CHECK expressions,
supported conflict/ignore behavior and unsafe key representations. The expected
answer must not come from the routing/evaluation helper under test. Retain an
applicable causal pre-repair/revert/control witness through the real boundary.

## J3 Local and compound indexes

**Owner:** IndexService, canonical parser/planner and partition lifecycle
interaction. Existing A5/A6 labels map here.

**Journey:** create an index through public SQL on populated data, execute an
eligible equality-prefix/range query, inspect `EXPLAIN DISTRIBUTED`, change data,
restart, create a later partition through the supported lifecycle, and query
again. Drop the index and preserve correct results.

Creation and activation must reflect physical outcomes. The current
[partition helper](../../../src/index-management/index-service-partition-methods.js)
accepts creation options but emits ordinary index DDL and does not reject every
unsuccessful returned result. Preserve supported local UNIQUE semantics or
refuse them at admission; never silently create a weaker index. Handle missing
executors, typed partition failures, zero-partition provisioning and partial DDL
honestly. Metadata cannot advertise an index as usable before its promised
materialization exists.

Connect metadata hydration after restart, cross-node propagation and index
creation on later/split/merged partitions through the existing owners. Define
recoverable interrupted create/drop states. This is a truthful lifecycle
requirement, not an expansion to general transactional DDL. Global uniqueness
remains outside this milestone.

**Oracle and witness:** compare against a complete base scan under a controlled
logical state. The same accepted execution must demonstrate complete correct
results and actual index engagement; a separate EXPLAIN or catalog row is
supporting evidence only. Prove left-prefix and equality-prefix-plus-range
selection and rejection of non-leading predicates. Relevant physical index
presence and planner reconstruction must survive the declared lifecycle.

Use controlled negatives that make wrong narrowing, lost supported uniqueness,
false DDL success or missing later-partition materialization observable. An
unavailable/ineligible access path follows its owned complete-read fallback or
typed failure contract; a permanent refusal is not successful index usability.

## J4 Locking reads

**Owner:** canonical SQL admission and the existing TX1 coordinator/participant
interaction. The
[locking architecture](../../../architecture/postgres-locking-reads.md) and
[sealed wait policy](locking-read-wait-policy.json) govern semantics.

**Journey:** two ordinary PostgreSQL clients enter through different runtime
processes/nodes and contend for the same logical base row. The holder reads and
changes the row; the contender receives the declared outcome. After resolution
a successor can acquire and do useful work.

Use the sealed `FOR UPDATE` fail-fast slice. Reject `FOR SHARE`, `NOWAIT`
syntax, `SKIP LOCKED` and broader waiting modes unless their existing scope and
policy are explicitly superseded. Reuse PR151's `40001` mapping where the
transaction outcome warrants it; preserve `55P03` and the distinct timeout,
cancellation, abort and uncertainty outcomes required by the owners.

Move reservation authority to the durable replicated participant interaction.
The current
[process-local reservation maps](../../../src/partition/partition-locking-read-reservation.js)
cannot independently establish distributed exclusion or recovery.
The coordinator owns transaction lifetime and resolution; PG transports the
semantic outcome. Do not create another lock ledger, local-expiry authority or
adapter retry policy.

Define and exercise candidate-read/acquire or revalidation ordering under the
existing read contract. Canonical typed row identity lies beneath the user's
projection: omitted or aliased PK fields must neither weaken locking nor appear
as hidden extra client columns. A failed reservation/candidate read must not
become an empty safe write set. Indexed and scan discovery must reach the same
base-row identity and writer-conflict owner.

**Oracle and witness:** observe client rows/schema, typed outcomes, actual
committed base state, exclusion while held and useful successor progress.
Exercise same-transaction reacquisition and a multi-participant statement that
encounters conflict after earlier reservations were acquired. Terminal
whole-transaction abort is reported only after the contract's release
acknowledgements; unresolved release follows existing TX1 uncertainty handling.

Cover commit, rollback, timeout, cancellation, disconnect and owner
restart/recovery with outstanding obligations. Record the actual fault target
and incarnation. A causal control that bypasses the real reservation mechanism
must break the public contention assertion. Process-local helper state is not
the oracle for a distributed reservation claim.

## J5 Synchronous nonunique global indexes

**Owner:** the current index lifecycle, planner, partition and TX1 interaction.
The [global-index requirements](../global-secondary-indexes/requirements.md)
retain authority. Reconcile and seal or explicitly supersede the provisional
maintenance decision through [C1](tasks.md#c1--planned-global-index-maintenance-mode-seal--design-may-start-early)
before implementation. The adopted direction is synchronous nonunique
maintenance through TX1, not two production modes; global uniqueness remains 1.0.

**Journey:** create a documented global index over existing data while other
public clients insert, update indexed keys and delete. Duplicate indexed values
must work. Execute non-PK and compound-prefix/range reads, including supported
transaction-local reads of staged writes. Interrupt a build, restart and resume;
then drop while work is in flight and recreate under the same public name.

Connect public GLOBAL DDL to the intended lifecycle, provisioned replicated
datasets, participant enlistment, readable activation and existing planner.
The present global classes are component foundations, not a substitute for this
production route. Base and index writes share the promised TX1 durable
commit/abort decision, including multirow changes, lost replies and participant
failures. An unavailable index cannot silently skip synchronous maintenance.
Measure the mode's write latency/availability cost under its existing contract.

Backfill may not skip an unresolved target and publish completeness. Define
concurrent-row-image/version fencing, typed cursor round trips, topology
continuity, resume and activation through the existing lifecycle owner.
Old work for a dropped index identity must not mutate its recreated successor.
Record structured failures durably and retain the required non-readable state.

A user receives complete results within the declared read contract.
Unreadable/unavailable indexes use the existing complete scatter-gather fallback
where R3 requires it; refusal/uncertainty is allowed only when no permitted
complete path can satisfy that contract. Rechecking returned base rows cannot
recover missing candidates. Resolve base-row placement through its current
owner, not a stale stored partition location.

**Oracle and witness:** independent base-table queries/state invariants at
controlled observation points. The same accepted query proves complete results
and actual indexed-path engagement. For an interrupted base/index write retain
its existing transaction/entry identity, client outcome and owned resolution;
inspect base and index state independently afterwards. A callback named rollback
does not prove durable atomicity.

Prove consistent durable outcomes after commit, abort or recovery settles.
During in-flight/unknown outcomes each accepted read obeys the declared
visibility/completeness boundary; this adds no global snapshot or strict
serializability guarantee. Inject meaningful interruption before/after
maintenance and activation. Detect omitted candidates, obsolete backfill
resurrection, incorrect readable state, stale index-generation work and retained
unowned obligations. Contrast useful narrowing with the complete base baseline
on the same workload through the existing proof owners.

## J6 Live query results

**Owner:** canonical SQL plan/result identity, durable partition CDC and live
subscription lifecycle. Consume the
[live-query architecture](../../../architecture/live-query-data-plane.md) and
[existing tasks](../generic-live-query-data-plane/tasks.md).

**Journey:** an application subscribes to an initially empty query. A different
public client commits a row entering its result, modifies it and removes it;
the subscriber receives correct unsolicited results. Repeat with queries sharing
tables/predicates but differing in projection, ordering or limits.

Connect the actual committed user-table event producer to the actual startup
subscription path. Canonical identity includes explicit bound parameters and
session/authorization context where applicable. Lower-level change interest may
be shared without conflating result sets or leaking fields. Simple deltas derive
NULL/type/collation/predicate/projection semantics from the canonical plan,
without a second predicate/projection interpreter. Complex or unsafe incremental
plans may use committed-event-triggered SQL refresh/reset. Unknown expressions
are not true. A bounded per-result owner serializes/coalesces refreshes so stale
completion cannot overwrite a newer result.

The snapshot boundary and subscription acknowledgement come from the real SQL
and CDC owners. Establish which committed occurrences the actual snapshot
represents and which subsequent occurrences require update or explicit reset.
A harness-supplied frontier or unrelated latest-stream counter cannot supply a
missing production handoff.

Use canonical occurrence identity and a frontier for each comparable
partition/source domain, including topology lineage. Preserve multiple operations
sharing one log entry; never compare independent partition positions as one
scalar or mix sequence and log-index domains. Compose frontiers through their
owner without inventing a global snapshot.

Discover future relevant partitions and changing dependencies through the
canonical plan/topology owners, including empty initial results/matching sets
and an initially unmaterialized partition where the product permits it.
Exercise writes during hydration, reconnect, leader changes, split/merge and
loss of continuity. Emit an explicit reset when exact continuation cannot be
established.

Bound hydration buffers, refresh work and slow-client queues without silently
discarding continuity obligations. Name the replay/re-drive/reset owner that
delivers useful current results once pressure or a transient fault clears, or
the documented reconnect/resubscribe action if that is the contract. Endless
resets, silent stalls and permanent disconnection are not useful recovery.
Unsubscribe/disconnect remove interests and retained resources. Idle operation
must not repeatedly read merely to discover changes.

**Oracle and witness:** canonical SQL at controlled/quiescent checkpoints,
plus committed-event identities wherever order/completeness is claimed.
Multiple writes within a transaction, NULL predicates, projection differences,
initially empty results, out-of-order refresh completion and topology races are
discriminating cases. Disconnecting the real committed-event path at its owned
seam must make the public unsolicited-update assertion fail; an applicable
pre-repair/control witness may supply that evidence.

Coordinate producer changes with J2/J7 and durable acknowledgement/retention,
cancellation and slow-consumer behavior with J8. A narrow future edit to
`src/cache/cdc-table-policy.js` requires the existing explicit scope process;
this plan does not grant blanket authority over cache or steering paths.

## J7 Scenario A consumption

**Authority remains:** the graduated
[semantic/workload requirements](../comparative-workload-efficiency-evidence/requirements.md),
[comparison methodology](../../../docs/benchmarks/tidb-reference-scenarios.md)
and their current proof records. The
[superseded comparison epic](../../epics/comparative-workload-efficiency-evidence.md)
is historical provenance, not reopened execution or path authority. Use an
applicable active bounded Quest or a bounded `class: fix` under the approved
repair scope. This section records pickup findings and the evidence 0.3 consumes;
it does not copy or weaken those predicates or revive the legacy umbrella.

For **0.3.2**, an evaluator runs the selected current-core regression through
ordinary public clients with reproducible instructions, genuine formation/
admission evidence and attributable correctness/retry/resource results. For
**0.4**, qualify the first comparison under the existing both-system requirements.
Implementation coverage, executed semantics and qualified performance are
different verdicts.

The comparison owner picks up these remaining interactions:

- Credit PR151 and retain actual current source/dependency identities. The
  [lab fixture](../../../examples/lab-cluster-smoke/README.md) launches source
  processes and may reuse dependencies; release-profile metadata alone does not
  install or verify a named tarball. Genuine formation evidence comes from its
  owner, not caller-authored JSON saying admission passed.
- The imported PG/lab setup updates service metadata through ingress that current
  main refuses. Repair setup through the supported lifecycle/configuration owner,
  retaining arbitrary internal system-table-write refusal. Complete a missing
  public operation if necessary; do not give the fixture privileged raw writes.
- Reconcile the imported semantic-closure workflow's old branch trigger and
  missing `tidb-retryable-conflict-probe-guard.js` reference through the existing
  command, classified runner and lab infrastructure. Do not run every expensive
  benchmark on every push or add another gate service.
- Account for all 33 canonical semantic proof IDs in their existing ownership
  surface: actual predicate/guarantee, implementation, execution receipt and
  version. Identify current-core guarantees before measurement; no promised
  0.3 correctness defect moves to 0.4 merely to obtain a pass. Comparison-only
  work retains an explicit reason and its 0.4 owner. Full 33/33 execution requires
  passing receipts for every required case; `semanticEquivalent` additionally
  requires the corresponding both-system evidence under the same profile.
- Reconcile profile/driver assumptions with current TX1. A benchmark-terminal
  request is not a proven transaction abort. Distinguish acknowledged,
  outcome-unknown and recovered states; do not demand rollback of committed or
  unresolved work or replay ambiguous work as a safe new transaction. Whole
  transaction retries require the durable outcome to permit them.
- Audit adapter translations, including stripped `FOR UPDATE`. SQL removed
  before execution cannot prove locking-read coverage. Retain a common semantic
  denominator without claiming identical internal mechanisms.
- For durability/recovery, record the actual fault target, stopped/restarted
  process or replica incarnation, intended storage continuity/loss, retained
  obligations and readback. Snapshot equality without restart, a no-op fault
  callback or restarting only the PG host cannot prove data-leader or independent
  host failure behavior.
- Retain latency, throughput, retry, failure and resource observations. Diagnose
  setup, metadata/readiness, coordination, commit, queue and recovery cost before
  choosing optimizations. No arbitrary throughput threshold or claim of beating
  TiDB gates semantic completion.

For 0.4 consume the existing preregistered profile/scale, separate load generator,
replica/storage requirements, matched-budget and architecture-native resource
views, intended-issue-time open-loop latency, full offered-load curve, retry/
queue/drain accounting, fresh datasets, repeated counterbalancing and invalid-run/
statistical rules. The small deterministic dataset is a smoke profile, not all
future-scale qualification. Under semantic profile v1 there is no
benchmark-injected per-request deadline: workflow timeout must not become one or
censor unfinished slow requests. Keep ordinary SQL and data-local WASI service
comparisons distinct. A valid slower result remains publishable evidence.

## J9 Bounded public WASI service

**Owner remains:** existing compiler/deployment/call execution owners and
stabilization Q17, with the
[service portability specification](../service-portability-ladder/requirements.md)
and [execution semantics](../../../docs/execution-semantics.md).
The detailed composed-release predicate remains
[Q17](../release-0-2-7-stabilization/requirements.md#q17---prove-one-composed-release-candidate-p1-terminal-acceptance).

For 0.3.2 consume a useful journey using the
[account-summary example](../../../examples/call-binding-account-summary/README.md):
build from the supported installed authoring package, deploy through the current
Artifact/Binding/Cell lifecycle, invoke the authenticated public HTTP endpoint,
and obtain the correct reduced business result from relevant partitions.
Observe real data-local reads, reduction, complete-result publication, a
representative worker/leader interruption, declared retry/failure behavior and
cleanup. Ordinary SQL throughput does not substitute for this service outcome.

The existing example is one process with two partitions. Extend/compose its
existing harness to demonstrate the claimed distributed execution; do not relabel
that local receipt as independent-host proof. J1 owns installed consumer usability,
not every full J9 failure case.

Remain within fixed selectors, bounded input and numeric partials for this
milestone. Argument-derived selectors, paging/cancellation, structured partials
and multi-operation dispatch keep their 0.4 allocation and need journeys that
exceed the old limitation. Preserve exactly-once result visibility without
promising exactly-once execution of external side effects.

## Consumed stabilization journeys

These requirements remain single-homed; the integration owner consumes their
results rather than creating parallel predicates.

| Package | Required dependency home |
| --- | --- |
| J1 - Installed product and claims | [Installed consumer journey](../release-0-2-7-stabilization/requirements.md#j1-installed-consumer-journey), selected 0.3.1 slice; actual artifact bytes and public usability, with broader Q17 still open where unproved. |
| J8 - Core operating obligations | [Retained-history/recovery journey](../release-0-2-7-stabilization/requirements.md#j8-retained-history-and-recovery-journey), 0.3.2 initial correctness; larger pilot qualification remains 0.5. Existing snapshot/ingress/diagnostic fixes receive their actual credit. |
| J10 - Exact candidate and publication | [Integrated candidate/publication](../release-0-2-7-stabilization/requirements.md#j10-integrated-candidate-and-publication), distinct pre-publication candidate and post-publication consumer/remote outcomes. |

## Evidence and completion

Apply the canonical [journey policy](../../../test/guidelines/release-gate.md#major-feature-user-journeys)
and original Quest seals. Bind evidence to actual source, dependencies/artifact,
configuration and topology, retaining the public invocation, independent result,
mechanism engagement, causal negative, failure/progress/resource result and
cleanup through existing records. Source inspection and isolated helpers justify
repairs but cannot close a multi-node public journey. A changed dependency needs
current proof-owner applicability, not automatic reuse of an old branch receipt.

Select one useful positive journey per capability and bounded shared
owner-interaction witnesses, not a Cartesian product of artifacts, key types,
topologies and faults. At least one positive contains the expected business
effects; empty output is valid only when independently expected. Retain one
composed witness for the supported combination.

A controlled negative establishes the production path and fails its named
causal assertion. Import/setup failures or invalid fixtures are not a red proof;
an edge input alone is not automatically a negative control. Across lifecycle/
topology changes exercise stale authority and refusal/reconciliation, followed
by successful fresh work. Under finite faults/pressure preserve acknowledged
obligations and show useful successor progress within the owner's declared
envelope; coalescing or reset need not deliver every intermediate live event.
Cleanup remains attributable if the main journey fails.

The full epic closes only when its original eight axes have working journeys,
inherited stabilization requirements are satisfied by their owners, required
current-core Scenario A regressions and bounded public service evidence exist,
fault/resource claims are measured, CI/proof disagreements are causally resolved
and exact-candidate publication/consumer observations agree. Current claims and
version scope must match measured support. Every residual outside the epic has
an existing owner/version; no required acceptance is hidden as future work.

Only the existing certification process can remove an outstanding oracle axis.
The selected 0.3.1 correction leaves unfinished axes open. The 0.4 comparison/
service expansion, 0.5 pilot envelope and 1.0 production/commercial guarantees
retain their own acceptance and edition homes.
