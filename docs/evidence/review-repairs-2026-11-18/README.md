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

The runtime review inspected
706ab191723c480342dd13ac3f9ed6ae1b370d81 (PR 224), based on integration head
4b0c8ec1de59e9a074afa97ce260afb2868685c5. The Q1a verifier review inspected
7823d2cbfeab54a3a23846dfa45d23e45b93b9e8 (PR 223). The separate Q1b PR 227 is
outside this planning assignment.

The prior [component records](../review-repairs-2026-11-17/README.md) retain their
original measured results and scope. The three new findings are source-derived.
No new baseline, candidate or combined-product test result has been produced by
this session. A newer local candidate may already answer some findings.

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

### Advisory design

- Extend the existing shared scalar/expression owner and remove duplicated
  semantic decisions from its affected consumers.
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
  the unambiguous 1.9-to-integer case.

### Proposed evidence

Use the existing native SQLite query fixtures through the actual parser,
planner and executor. Cover one and multiple partitions, SELECT/HAVING agreement,
residual JOIN CAST, the original negative cases and neighboring valid cases.
Assert which expression reaches the coordinator; a helper-only test does not
establish that the production path consumes the helper.

Parser, import or setup failures are non-measuring. Multi-argument IIF examples
must first be shown to reach the inspected parser and bundled SQLite version.
A boundary-changing consolidation should follow the existing genuine-red Quest
workflow; this session has neither created nor sealed such a Quest.

## 2. Target-wide Phase B admission

### Finding and existing authority

The current incomplete-operation observation is restricted to operations where
the coordinator node is source or target. If A owns two live operations to B,
C's cache lacks them, and C attempts a different system-partition operation to B,
C's owner-scoped census can omit both occupants. Its local create mutex does not
serialize A and C.

The observation-array correction in PR 224 remains valid. The unresolved design
question is how the existing operation authority enforces a target-wide invariant
at the actual durable admission boundary.

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

### Questions to resolve before choosing the repair

1. Establish the durable serialization domain for every participating operation
   row, including manual split/recovery paths and leadership changes. The seed
   ledger has one full-range partition and automatic system-table splitting is
   excluded, but the remaining paths were not fully traced in this session.
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

Use two real coordinator/repository instances with one shared durable authority,
separate retained caches and controlled delayed publication. The fixture should
cover full-target refusal, simultaneous contenders for one vacancy, durable
terminal release with retained objects, occupied drain, answer loss/retry,
unavailable reads and existing policy controls.

A shared SQLite fixture by itself does not prove production routing or Raft
replay. If the repair changes the gateway-to-partition protocol, a corresponding
production binding/replay witness belongs to that same bounded interaction.

## 3. Q1a conformance process results

### Finding at the inspected Q1a source

The wrapper returns null for unsuccessful or unparseable interpreter execution.
Its inverse-control accounting treats every result other than numeric zero as
a successful rejection, so null can satisfy a negative control. Number conversion
also admits blank stdout as zero.

The wrapper, rather than the representation contract or Python decoder, owns this
defect. Existing representation constraints and repaired corpus distinctions
should remain intact.

### Advisory correction and proof

Require successful interpreter completion, no launch error or signal, and an
explicitly present canonical nonnegative decimal integer within the safe integer
range. Preserve the distinction between an unavailable measurement and a measured
deficit. Positive acceptance requires valid zero; inverse-control acceptance
requires a valid value greater than zero.

Plan fault cases through the actual CLI for launch failure, nonzero exit, signal,
missing/empty/malformed output, unsafe integers and incorrect inverse acceptance.
Retain valid positive/negative measurements, ordinary CLI failure, a subsequent
healthy invocation and the actual Python corpus/inverse controls. The existing
eight Python/SQLite witnesses are unaffected by this proposal.

This is a proposed bounded unchanged-contract wrapper repair. No production
checker change or new passing result exists from this session.

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

## Work performed before the scope clarification

- The only remote source-repository checkpoint was documentation: initial PR 228
  at ed1225d31742fef1151b7748446a59021845afb4. This follow-up removes its shared
  epic edits and leaves only this advisory document in the PR diff.
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
