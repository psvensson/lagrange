---
audience: development
documentClass: planning
---

# Advisory review repair plan, 18 November 2026

## Current authority and scope

The operator clarified on 18 November that another local agent owns finalizing
the candidate for the comparative systems run on GCP. This session is limited
to documentation and planning for the initial stages.

That instruction supersedes the implementation assignments in the first draft
checkpoint, ed1225d31742fef1151b7748446a59021845afb4. The local agent owns
production and test changes, candidate integration, native execution, generated
metadata, Solver lifecycle actions, publication/merge decisions and the GCP
campaign. This document is advisory input to that owner. It neither changes
existing acceptance terms nor assigns another implementation writer.

This session may inspect source and evidence and maintain this isolated planning
note. It will not modify or publish source code, test fixtures, configuration,
generated artifacts, Quest records or the local agent's candidate. Shared epic
summary edits from the initial checkpoint are removed from this PR so that this
note does not compete with the local integration owner's current summary.
Resuming implementation requires a subsequent explicit scope assignment.

Rule-set revision 5 and the existing architecture, Solver and proof owners remain
the applicable repository guidance. Recommendations below concern the inspected
source identities; they must be reconciled with the local agent's actual candidate
before they become implementation assignments.

## Source and evidence boundary

The published snapshot was checked on 18 November 2026, between 12:11 and 12:19
Europe/Stockholm (11:11–11:19 UTC). All six implementation PRs below remain
draft and unmerged. These are published identities, not a reconstruction of the
other agent's unpublished local candidate.

| Work | Published source reviewed | Planning relevance |
| --- | --- | --- |
| Runtime repairs, PR 224 | [706ab191723c480342dd13ac3f9ed6ae1b370d81][runtime-head] | Source for the query, admission and comparative-workload analysis below |
| Literal checker, PR 225 | [05a9be673f4797925fba871b0f6fafe3ada29ad2][literal-head] | Separate proof-tool repair; inclusion belongs to the candidate owner |
| Optional GCP expiry, PR 226 | [35493cfe8f820e8c6b012a68a4a718c2ee766859][expiry-head] | Optional creation contract; component tests do not prove live provider expiry |
| Portability Q0, PR 222 | [190fd623a26efb6257d019a0cf0007f505801823][q0-head] | Separate specification-census and provenance work |
| Portability Q1a, PR 223 | [7823d2cbfeab54a3a23846dfa45d23e45b93b9e8][q1a-head] | Source for the conformance-wrapper finding |
| Portability Q1b, PR 227 | [ea3298809b45a4098ca9b5443dfb0814adaec6fb][q1b-head] | Status and dependency review only; no codec repair assigned here |

The inspected integration branch remains
4b0c8ec1de59e9a074afa97ce260afb2868685c5; published main is
4585c318139c4e81edabb5f0002a4c1f8d5e8d5c. Neither identifies the local owner's
current composed source or image. Runtime PR heads 224–226 are unchanged from
the earlier review; Q1b has advanced.

The prior [component records](../review-repairs-2026-11-17/README.md) retain their
original measured results and scope. The three new findings are source-derived.
No new baseline, candidate or combined-product test result has been produced by
this session. A newer local candidate may already answer some findings.

### Relationship to the GCP comparison

The [runtime integration record][runtime-sequence] keeps portability separate
and routes the composed candidate through its applicable gates and physical-lab
pre-gate. The [comparison requirements][comparison-requirements] retain their
own semantic and measurement contract. This advisory note adds no campaign gate.

| Finding | Exposure established by source inspection | Decision retained by the local owner |
| --- | --- | --- |
| Coordinator TRIM/CAST/CASE | The admitted SQL forms have inconsistent semantics; the inspected Scenario A statement dictionary does not use those forms | Reconcile actual candidate and selected workload; a Scenario A pass cannot certify general expression correctness |
| Target admission | Normal UnifiedRebalancer moves opt into the affected admission path, so formation can exercise it | Reconcile formation evidence and the intended admission claim; no particular GCP interleaving or failure is established here |
| Q1a process results | The portability wrapper can credit unavailable inverse-control execution | Relevant where the candidate's proof consumes that wrapper or makes that portability claim; not an automatic runtime dependency |

Portability completion is not an existing blanket prerequisite for the GCP
comparison. The older core-readiness Q0 and the new independent-portability Q0
are different units; sharing a label does not establish a dependency. The
existing comparison requirements also allow Scenario A to progress independently
of Hono. Existing gates and result-admission requirements remain in force.

## Proposed first stages

| Stage | Documentation/planning contribution | Decision or implementation owner |
| --- | --- | --- |
| Reconcile | Map each finding to the local candidate's exact source and existing work; mark already addressed, still present or unresolved | Local candidate owner |
| Bound | Name the existing semantic owner, affected consumers, concrete counterexample and smallest independently useful repair claim | Local candidate owner, informed by this note |
| Review design | Examine authority, representation, retry, terminal release and production binding; retain unresolved questions explicitly | Independent reviewer selected by local owner |
| Plan proof | Specify a measuring negative, a healthy control, real production reachability and the required native evidence | Existing project proof owner |
| Implement later | Measure the baseline, seal when required, then implement, execute, collect, integrate and decide campaign readiness through existing workflows | Local agent; not this documentation session |

These stages are not new gates or a parallel work queue. The existing Quest and
integration owners decide applicability, sequencing and acceptance. Documentation
work must not silently expand the local candidate's implementation scope.

## 1. Coordinator SQL expression semantics

### Finding at the inspected runtime source

The coordinator evaluates wrappers around aggregate partials. Consequently,
successful execution of MAX or SUM in SQLite does not establish that the
surrounding coordinator expression has SQLite semantics.

| Input and expression | Required result | Source-derived candidate behavior |
| --- | --- | --- |
| dept is xxabcxx; TRIM(MAX(dept), 'x') | abc | Ignores the second argument and uses JavaScript trim |
| SUM(amount) is 1.9; CAST to INTEGER in both SELECT and HAVING = 1 | One row with projected value 1 | SELECT computes 1 while HAVING retains 1.9 and rejects |
| CASE WHEN '0' THEN SUM(amount) ELSE 0 END | 0 | JavaScript truthiness selects the SUM branch |

Relevant existing owners are the distributed fanout planner,
src/query/sql-scalar-functions.js, the partial aggregate combiner, the SELECT
aggregation evaluator and the residual predicate evaluator. The narrow native
ROUND/LENGTH/SUBSTR, budget and BINARY ordering repairs remain separate accepted
work; this finding does not revoke those measured results.

The [planner][sql-planner] admits the expressions and assigns aggregate wrappers
to coordinator evaluation. The relevant implementations are the
[partial combiner][sql-combiner], [SELECT/HAVING evaluator][sql-select] and
[residual CAST evaluator][sql-residual]. These are source observations and
inferred consequences, not newly executed counterexamples.

### Actual Scenario A exposure

The [canonical campaign manifest][campaign-manifest] selects Scenario A for
both smoke and capacity. It distinguishes a one-rate, noncomparable smoke from
the paired capacity sweep. The [workload owner][workload-mix] defines five load
families—new-order, payment, order-status, delivery and stock-level—in the
45/43/4/4/4 mix. The separate [semantic registry][semantic-cases] defines nine
proof cases; those are not additional transaction families.

The [complete Lagrange statement dictionary][scenario-a-sql] contains no SQL
TRIM, CAST, CASE, IIF or HAVING. Its STOCK_LEVEL_COUNT uses COUNT(DISTINCT ...)
over a JOIN with bound comparisons, without explicit CAST. The
[state-snapshot builder][snapshot-query] selects named columns and orders by
named keys. Therefore the inspected workload does not directly invoke the
three defective forms. This says nothing about a changed local workload or
general SQL correctness.

STOCK_LEVEL_COUNT is a useful preservation control if explicit CAST handling is
repaired: its declared-column comparisons must continue to accept PG-wire text
bindings. It is not evidence that this CAST finding already corrupts the
comparative result.

The [cloud reproduction guide][cloud-guide] still opens with the superseded
smoke-v1 sweep description, while its later instructions and the manifest
distinguish smoke from capacity. Reconcile planning against the actual frozen
manifest. The shared guide is outside this session's editing scope.

### Advisory design

- Extend the existing shared scalar/expression owner and remove duplicated
  semantic decisions from its affected consumers. This is a proposed extension:
  [sql-scalar-functions.js][scalar-owner] currently exports only sqlLength,
  sqlSubstr and sqlRound, not a general CAST/truth interpreter.
- Keep explicit CAST distinct from comparison affinity. The explicit target is
  available even where general INTEGER/REAL storage-class metadata is absent.
- Use SQL truth conversion and preserve lazy branch selection for CASE/IIF and
  the relevant null-selection functions. A shared eager argument dispatcher can
  still produce the wrong semantics.
- Align planner admission with supported argument forms and arities, not merely
  function names. Preserve canonical parser fields rather than adding alternate
  representation readers.
- Preserve the current PG translation of NUMERIC/DECIMAL to REAL unless the local
  owner explicitly includes that separate contract in scope. Full numeric-to-text
  equivalence needs a representation decision; it is not proved by correcting
  the unambiguous 1.9-to-integer case. The existing
  [query-runtime contract][query-runtime] records that representation ceiling.

### Proposed evidence

These are proposed repair-proof units for the local owner to select, not new
GCP acceptance terms. Reuse the existing [global-merge fixture][merge-fixture]
and [JOIN/affinity fixture][join-fixture] through the actual parser, planner and
executor. Assert which expression reaches the coordinator.

| Proposed unit | Discriminating case and healthy controls | Required binding or limit |
| --- | --- | --- |
| Custom-character TRIM | xxabcxx with character set x yields abc; empty character set and NULL controls | SELECT and HAVING, one and multiple partitions; include spaces versus tabs/newlines if default trimming changes |
| Aggregate explicit CAST | SUM 1.9 projects INTEGER 1; HAVING = 1 retains and = 2 rejects; negative fractional and NULL controls | Same inputs through native oracle and actual coordinator consumers |
| Residual explicit CAST | Numeric-prefix text such as 1x distinguishes explicit INTEGER conversion from ordinary affinity; pair with uncast comparison | Prove that the cross-table predicate remained coordinator residual |
| SQL truth and branch selection | Searched CASE with '0', '1' and NULL; a discriminating witness for any laziness claim | Both affected consumers; include IIF only where parser/version admission and repair scope support it |
| Preservation | Existing ROUND/LENGTH/SUBSTR and comparison-affinity controls; actual STOCK_LEVEL_COUNT with PG-wire text bindings | Reuse applicable proofs and normal affected-proof selection; no general SQL-conformance claim |

Parser, import or setup failures are non-measuring. Multi-argument IIF examples
must first be shown to reach the inspected parser and bundled SQLite version.
A boundary-changing consolidation should follow the existing genuine-red Quest
workflow; this session has neither created nor sealed such a Quest.

## 2. Target admission: observation and serialization

### Finding and existing authority

The [incomplete-operation query][operation-query] is restricted to operations
where the coordinator node is source or target. If A owns two legitimate Phase B
occupants targeting B, C's cache lacks them, and C attempts a different ordinary
system-partition operation to B, C's owner-scoped census can omit both occupants.
Its [local create mutex][local-admission-lock] does not serialize A and C.

The observation-array correction in PR 224 remains valid. Its
[retained acceptance record][slot-acceptance] explicitly adds no cluster-wide
slot-CAS claim. A broader target-admission claim would need complete observation
and atomic admission at the actual durable owner boundary; this is a separate
design question, not a reinterpretation of that accepted repair.

### Scope of the existing capacity policy

Budget enforcement is [opt-in][budget-opt-in], and the
[normal UnifiedRebalancer request][normal-move] opts in. This target gate concerns
prospective ordinary-system ADD/REPLACE admission. The
[priority lane][priority-lane] bypasses this target gate, while the
[phase policy][phase-policy] selects two slots only under its Phase B eligibility,
nodes-spread and priority-operation conditions; otherwise it selects one.
Occupancy uses canonical operation identities, types, terminal states and phases.

The selected limit can shrink without cancelling previously admitted work.
Consequently, an unconditional assertion that every target always has at most
two nonterminal rows would misstate the current policy. Proposed evidence below
holds the relevant policy conditions explicit and preserves the priority lane.

### Preliminary owner census

- ReplicaOperationRepository owns operation-row translation, insertion, collision
  recovery, authoritative recovery and visibility confirmation.
- A cluster-wide incomplete-operation query already exists for ledger-writer
  coordination. It can inform observation design, but a read followed by an
  unconditional write is not atomic across coordinators.
- The existing beforeAttempt callback may refresh or refuse a local write. It
  cannot close the interval in which another coordinator commits an insertion.
- target_claim_key is a retained runtime-service identity claim, including on
  terminal updates. It is not an existing transient capacity-slot primitive.
- The inspected gateway/CDC API exposes ordinary INSERT, UPDATE, UPSERT and DELETE.
  No inspected conditional capacity-admission insert contract was found.
- The SQL parser explicitly rejects INSERT ... SELECT. A native SQLite test of
  that syntax would therefore not prove the current production path. This note
  does not prescribe it as an available implementation.
- Existing committed writes carry durable entry/idempotency identity and settled
  outcome replay. Any chosen protocol must preserve that retry authority.

### Serialization-domain census

| Boundary inspected at 706ab191 | Established source fact | Limit on a broader admission claim |
| --- | --- | --- |
| Seed and automatic topology | The ledger starts as the full-range replica_operations-p1 partition; automatic system-table splitting and merging are excluded | Supports the normal unsplit topology, not an unconditional topology invariant |
| Explicit managed split and recovery | The engine delegates to the managed split workflow; system classification influences source routability rather than rejecting every system split; recovery resumes recorded transition/child-plan state | No ledger-specific exclusion was found in this bounded entry/admission/plan/cutover/recovery chain; successful manual splitting of this table was not executed or established |
| Normal INSERT routing | Rows route by the operation_id primary key and active partition metadata | Target identity does not itself co-locate all rows; multiple ledger partitions would require an explicit serialization-domain argument |
| Committed settlement and replay | Participant entry identity derives from logical write identity plus partition ID; committed application retains the outcome before replay | Supports once-per-entry settlement within a partition; neither cross-partition atomic admission nor replay across a topology change follows automatically |

Source anchors: [seed rows][ledger-seed], [automatic exclusion][automatic-split],
[explicit engine entry][explicit-split], [managed admission][managed-split],
[recovery][split-recovery], [INSERT routing][insert-routing],
[participant identity][participant-identity] and [committed settlement][settlement].
The managed system-partition path uses a minimum routable source count of one;
this is not a stronger quorum requirement. Routing-epoch fencing and retained
replay protect their respective boundaries but do not combine independent
partitions into one serialization domain.

The A/B/C observation/race example does not require a split ledger: independent
coordinators can race their checks before insertion even against the initial
single partition. The manual-split question concerns the validity of a future
repair's topology premise. Neither is evidence that a particular GCP campaign
experienced the race or split its operation ledger.

### Questions to resolve before choosing the repair

1. State the supported topology premise and establish the durable serialization
   domain for every participating operation row, including explicit split,
   recovery, routing-generation changes and leadership changes. The bounded
   census above does not justify an unconditional single-partition assumption.
2. Locate the point at which the target-capacity condition and insertion can be
   decided atomically by that existing owner. Do not substitute a process-local
   mutex or introduce a competing reservation store.
3. Define definitive capacity refusal separately from already-existing success
   and unknown write outcome. A zero-row write cannot silently become success.
4. Preserve one canonical operation after answer loss and retry. A settled refusal
   and a later deliberate attempt also need a clear identity rule.
5. Make a fresh complete authoritative observation supersede stale occupancy
   projections without treating unavailable or incomplete observation as empty.
6. Preserve the existing seed-first and priority policy, relevant REPLACE drain
   occupancy, operation terminal states and canonical progress events. Capacity
   must not be released solely by elapsed time.

No concrete production protocol was selected or implemented during this work.

### Proposed evidence

The following matrix is appropriate if the local owner chooses to pursue the
broader target-admission claim. None of these cases has been measured here.
Use two real coordinator/repository instances with shared durable authority,
separate retained caches and controlled delayed publication.

| Proposed case | State and trigger | Observable result and evidence boundary |
| --- | --- | --- |
| Full target | Two legitimate Phase B occupants target B; C lacks both in cache and attempts another ordinary move | Existing typed budget/target-slot refusal; no contender row or dispatch obligation; actual occupant identities retained |
| Concurrent vacancy | One occupant; A and C concurrently attempt different ordinary moves to B while selected capacity remains two | At most one additional admission; overlap at the real durable decision boundary, not merely a local mutex or sequential fixture |
| Terminal release | An occupant durably completes or fails while the same objects retain a stale nonterminal projection | Progress follows the accepted authoritative-release contract; record terminal commit, fresh observation, publication/wake and next creation separately |
| Unavailable observation | Required durable read is unavailable, incomplete or from an invalid routing generation | Typed unavailable/deferred/refused outcome; no empty-capacity success; finite recovery can re-drive normally |
| Duplicate or lost answer | Insertion commits but its answer is lost; retry uses the same logical identity, including after a claimed leader change | One canonical operation and occupancy effect; original settlement preserved; distinguish unknown outcome from definitive refusal |
| Priority and drain | Priority work overlaps ordinary spread; REPLACE remains in a holding drain phase; phase conditions change | Preserve seed-first and priority policy, policy-defined drain occupancy and canonical terminal release; no blanket two-row invariant |

A shared SQLite fixture by itself does not prove production routing or Raft
replay. If the repair changes the gateway-to-partition protocol, a corresponding
production binding/replay witness belongs to that same bounded interaction.

## 3. Q1a conformance process results

### Finding at the inspected Q1a source

The wrapper returns null for unsuccessful or unparseable interpreter execution.
Its inverse-control accounting treats every result other than numeric zero as
a successful rejection, so null can satisfy a negative control. Number conversion
also admits blank stdout as zero. The finding remains present in the
[published Q1a wrapper][q1a-wrapper]. It concerns verifier reliability, not an
observed runtime data-corruption result.

The wrapper, rather than the representation contract or Python decoder, owns this
defect. Existing representation constraints and repaired corpus distinctions
should remain intact.

### Advisory correction and proof

Require successful interpreter completion, no launch error or signal, and an
explicitly present canonical nonnegative decimal integer within the safe integer
range. Preserve the distinction between an unavailable measurement and a measured
deficit. Positive acceptance requires valid zero; inverse-control acceptance
requires a valid value greater than zero.

| Process observation | Positive case | Inverse control |
| --- | --- | --- |
| Successful execution, explicit valid zero | Measured success | Incorrect acceptance; control fails |
| Successful execution, explicit valid positive integer | Measured deficit | Measured rejection |
| Launch error, signal or nonzero exit | Unavailable measurement | Unavailable measurement; never credited as rejection |
| Missing, blank, malformed or unsafe metric | Invalid measurement | Invalid measurement; never credited as rejection |

Plan fault cases through the actual CLI for launch failure, nonzero exit, signal,
missing/empty/malformed output, unsafe integers and incorrect inverse acceptance.
Retain valid positive/negative measurements, ordinary CLI failure, a subsequent
healthy invocation and the actual Python corpus/inverse controls. The existing
eight Python/SQLite witnesses are unaffected by this proposal.

This is a proposed bounded unchanged-contract wrapper repair. No production
checker change or new passing result exists from this session.

## Portability status and dependency boundaries

The following CI statuses were independently read from published workflow
records. Component test counts in PRs and Quest logs remain reports from their
original executions; this session did not rerun or re-certify them.

| Unit | Current published workflow observation | Remaining claim boundary |
| --- | --- | --- |
| Q0 at 190fd623 | [Run 44125147730][q0-ci] completed successfully | Original seal-lineage recovery and canonical Solver/publisher completion are not established by the inspected published record |
| Q1a at 7823d2cb | [Run 44125154327][q1a-ci] completed successfully | Green CI does not refute the wrapper finding; declared Q0 predecessor and original-seal provenance remain separate holds |
| Q1b at ea329880 | [Run 44247821716][q1b-ci] completed successfully, including ordinary proof; whole-repository structural analysis was skipped | Value-only scope; no solved terminal entry or native Solver/publisher receipt established in the inspected record |

Q1b's [Quest][q1b-quest] names
4585c318139c4e81edabb5f0002a4c1f8d5e8d5c as sealedAt. That commit is present in
the published head's ancestry: the [comparison][q1b-ancestry] is 27 commits ahead,
zero behind, with that exact merge base. Do not copy the Q0/Q1a missing-original-
seal diagnosis to Q1b. Reachability does not authenticate seal-time execution or
replace native landing. The [Q1b log][q1b-log] records repairs and independent
verification, but contains no solved terminal entry in the inspected snapshot.

Q1b remains a separate finite-JSON value slice. It does not validate the Q1a
wrapper or establish envelopes, group keys, HLC, transport, persisted
compatibility or production certification. The [portability plan][portability-plan]
retains its own sequence and explicitly creates no new release gate. Applicability
to a particular candidate proof depends on what that proof consumes and claims.

## Provenance and proof-preparation notes

The recovered q0-portability-sealed-20261117.bundle and
q1a-portability-sealed-20261117.bundle both passed bundle prerequisite verification
against fc626cbf377a334c6960836afb92d837acd25ed9. They advertise WIP heads
0932b7072052383751bed0b91d9f976132d6c449 and
376c240b2b656271f01f42fad0d5a7fc9a1d7d75 respectively.

They do not advertise the remembered later solved heads. The inspected restore
was missing five prerequisite blobs needed to expand the thin packs. Original
red-seal ancestry, exact tree equivalence and authentic solved lifecycle state
were not established before the scope change. A valid bundle or matching tree
alone must not be promoted to Solver landing evidence. The local owner can
complete recovery in a separate repository without rewriting original archives
or synthesizing lifecycle entries.

Earlier proof preparation encountered physical temporary-path and cold model-tool
download problems. Planning should reuse the current temporary-directory owner
and checksum-pinned dependency/cache owner, retain the first failure and verify
installed capability. This session will not alter Harnessd/Lab infrastructure,
launch preparation jobs or change thermal/resource policy.

## Handoff to the local candidate owner

The useful next planning step is to reconcile these findings in the owner's
existing candidate/campaign record. No new tracking system or parallel assignment
is proposed. The reconciliation should identify:

1. The actual composed source commit/tree, any additional local changes, and the
   product image/content identity with its source binding.
2. The selected frozen campaign manifest and profile, harness revision,
   dataset/workload/semantic identities, and any changes to the query dictionary
   or semantic-case registry. Smoke success is not a capacity comparison.
3. Each finding's disposition: already repaired, present and relevant to the
   chosen claim, outside the selected workload, or unresolved. Preserve broader
   defects even when they are outside this campaign.
4. Applicable original native baseline/candidate artifacts and the scope of
   reused component evidence. Confirm the existing composed gates and physical
   pre-gate through their owners, rather than transferring a component receipt
   to an unmeasured candidate.
5. Which owner resolves the remaining admission-domain and portability-provenance
   questions. These questions do not assign implementation to this session.

Campaign readiness and result admission remain with the existing comparison
owner: semantic parity, separated load generation, exact source/image identity,
real physical/GCP observations, original measurement evidence and resource
closure. This note neither certifies readiness nor requires completion of every
independent issue before a properly bounded campaign can proceed.

## Work performed before the scope clarification

- Remote checkpoints in PR 228 contain documentation only. The initial
  ed1225d31742fef1151b7748446a59021845afb4 included shared epic edits;
  7e21c890cb89d5b93356b91bec1a010c6b904305 removed those edits and left this one
  advisory document. The current continuation updates only this document.
- No production source was edited by any assigned worker.
- Three test-file drafts were edited in isolated unpublished worktrees:
  test/query/distributed-select-global-merge-correctness.test.js,
  test/query/cross-partition-join-pushdown.test.js and
  test/partition/portability-observation-v1.test.js. They remain uncommitted,
  unexecuted and outside this PR. They are not inputs to the local candidate.
- The admission work remained entirely read-only. The Q1a author also wrote an
  unpublished scope note and test-only scratch patch; neither is a runtime repair.
- No project test, audit, generator, diagnostic or comparative workload was
  submitted or executed. Lab requests 5476 and 5477 were read-only controller
  health and fleet observations.
- No Quest was sealed, mutated or landed; no candidate was merged; no GCP
  resources were allocated.

Implementation workers have stopped. Further contributions from this session
are documentation and planning only, until the operator explicitly assigns
a new implementation scope.

[runtime-head]: https://github.com/psvensson/lagrange/commit/706ab191723c480342dd13ac3f9ed6ae1b370d81
[literal-head]: https://github.com/psvensson/lagrange/commit/05a9be673f4797925fba871b0f6fafe3ada29ad2
[expiry-head]: https://github.com/psvensson/lagrange/commit/35493cfe8f820e8c6b012a68a4a718c2ee766859
[q0-head]: https://github.com/psvensson/lagrange/commit/190fd623a26efb6257d019a0cf0007f505801823
[q1a-head]: https://github.com/psvensson/lagrange/commit/7823d2cbfeab54a3a23846dfa45d23e45b93b9e8
[q1b-head]: https://github.com/psvensson/lagrange/commit/ea3298809b45a4098ca9b5443dfb0814adaec6fb
[runtime-sequence]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/solve/epics/operation-integrity-and-reliable-formation.md#L114
[comparison-requirements]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/solve/specs/developer-journey-and-measured-comparisons/requirements.md
[sql-planner]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/src/query/distributed/distributed-select-fanout-plan.js#L317
[sql-combiner]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/src/query/distributed/partial-aggregate-combiner.js#L351
[sql-select]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/src/query/query-executor-select-aggregation.js#L559
[sql-residual]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/src/query/distributed/residual-predicate-evaluator.js#L439
[campaign-manifest]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/test/distributed/harness/comparative-benchmark-campaign-manifest.js#L60
[workload-mix]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/test/distributed/harness/oltp-baseline-workload.js#L19
[semantic-cases]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/test/distributed/harness/oltp-scenario-a-proof-cases.js#L33
[scenario-a-sql]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/test/distributed/reference-client/lagrange-oltp-adapter.js#L55
[snapshot-query]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/test/distributed/reference-client/oltp-state-snapshot-shared.js#L134
[cloud-guide]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/docs/benchmarks/cloud-reproduction-guide.md#L10
[scalar-owner]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/src/query/sql-scalar-functions.js#L152
[query-runtime]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/architecture/query-runtime.md#L166
[merge-fixture]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/test/query/distributed-select-global-merge-correctness.test.js#L683
[join-fixture]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/test/query/cross-partition-join-pushdown.test.js#L518
[operation-query]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/src/rebalancer/replica-operation-repository.js#L170
[local-admission-lock]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/src/rebalancer/rebalance-coordinator-concurrent-add-budget.js#L56
[slot-acceptance]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/docs/evidence/review-repairs-2026-11-17/target-slot.md#L98
[budget-opt-in]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/src/rebalancer/rebalance-coordinator-priority-budget-admission.js#L78
[normal-move]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/src/rebalancer/unified-rebalancer-move-execution.js#L55
[priority-lane]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/src/rebalancer/rebalance-coordinator-concurrent-budget-gate.js#L158
[phase-policy]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/src/rebalancer/system-spread-transition-policy.js#L248
[ledger-seed]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/src/bootstrap/seed-foundation-rows.js#L26
[automatic-split]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/src/partition/partition-split-merge-manager-core-methods.js#L461
[explicit-split]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/src/query/sql-query-engine-partition-routing-readiness.js#L141
[managed-split]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/src/partition/managed-split-workflow.js#L190
[split-recovery]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/src/partition/managed-split-workflow-state-methods.js#L145
[insert-routing]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/src/query/distributed/distributed-write-coordinator.js#L552
[participant-identity]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/src/query/distributed/distributed-write-coordinator.js#L66
[settlement]: https://github.com/psvensson/lagrange/blob/706ab191723c480342dd13ac3f9ed6ae1b370d81/src/partition/partition-service-entry-apply-base.js#L675
[q1a-wrapper]: https://github.com/psvensson/lagrange/blob/7823d2cbfeab54a3a23846dfa45d23e45b93b9e8/scripts/checks/q1-partition-observation-conformance.js#L24
[q0-ci]: https://github.com/psvensson/lagrange/actions/runs/44125147730
[q1a-ci]: https://github.com/psvensson/lagrange/actions/runs/44125154327
[q1b-ci]: https://github.com/psvensson/lagrange/actions/runs/44247821716
[q1b-quest]: https://github.com/psvensson/lagrange/blob/ea3298809b45a4098ca9b5443dfb0814adaec6fb/solve/quests/independent-portability-q1b-finite-json-value/quest.json
[q1b-ancestry]: https://github.com/psvensson/lagrange/compare/4585c318139c4e81edabb5f0002a4c1f8d5e8d5c...ea3298809b45a4098ca9b5443dfb0814adaec6fb
[q1b-log]: https://github.com/psvensson/lagrange/blob/ea3298809b45a4098ca9b5443dfb0814adaec6fb/solve/quests/independent-portability-q1b-finite-json-value/log.ndjson
[portability-plan]: https://github.com/psvensson/lagrange/blob/ea3298809b45a4098ca9b5443dfb0814adaec6fb/solve/epics/core-architecture-convergence/independent-portability-plan-2026-11-17.md
