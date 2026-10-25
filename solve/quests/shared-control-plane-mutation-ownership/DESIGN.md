# Shared control-plane mutation ownership

Author: `subagent:/root/admin_review`. Source baseline:
`709dc2bebd4abdbec9a5d4fb2232c2621d7897f7`. Date: 2026-10-25.

**Contract proposal for root review. No production edits, measured predecessor
receipt or Quest seal yet.** The required receipt list describes the full
interaction, not evidence already obtained. The small predecessor witness is
the first measurement; it cannot close the remaining obligations.

## 1. Scope and superseded premise

The existing classifier treats `{}` and `{success:true}` as applied. The
gateway independently converts them to named `APPLIED`, so changing only a
consumer or requiring a typed gateway string would preserve false progress.
`AuthoritativeRowMutationHelper` then clears its pending value, records it as
persisted and claims cache visibility. Related exact-row consumers can skip
their readback after the same classification. This is the same failure class
recorded in `priority-services-row-marker-clear-integrity`, whose prior repair
retained unknown-shape compatibility.

The classifier/normalizer Quests below have sealed premises preserving valid
legacy envelopes or the seven-value vocabulary. The join Quest also retains
owner-contract fallback admission. Those historical proofs remain true only
within their original scope. This new fix replaces those compatibility
premises for the current supported mutation interface; it does not rewrite
their statements, logs or receipts:

- `control-plane-mutation-apply-classifier`
- `control-plane-mutation-outcome-classifier-core`
- `control-plane-mutation-result-normalization-owner`
- `control-plane-mutation-completion-outcome-normalizer`
- `control-plane-mutation-replica-config-consumers`
- `bootstrap-join-admission-mutation-outcome-consumer`
- `raft-authoritative-row-mutation-outcome-classifier`

The other established cause is alternate mutation execution. The gateway
selects raw SQL when CDC is absent; bootstrap CDC tries local unreplicated SQL
after a Raft answer fails; join publication can choose a raw INSERT delegate.
The bootstrap branch is already documented as F-BOOT in
`solve/quests/replicated-transaction-decision-and-apply/design-leg-a-v10-2026-10-10.md`.
The user's current no-legacy/no-fallback direction applies to these existing
paths as well as newly written code. Supported capabilities must survive at
their actual owner; deleting a path without its capability is incomplete.

## 2. Sole result vocabulary and exact truth table

Keep `CONTROL_PLANE_MUTATION_OUTCOME` in its existing constants owner and
`classifyControlPlaneMutationResult` as the sole effect interpreter. Add
`UNCONFIRMED: 'unconfirmed'`. Gateway completion and owner-contract metadata
are projections of that interpretation, never a second source of application
truth. Unknown input is represented explicitly by this owner.

The existing classification booleans describe the following facts. `applied`
is confirmed positive row effect, or named durable statement replay whose
count is unknown. It does **not** prove that a particular row predicate
matched, nor that a cache observed the value. `accepted` describes the
existing owner-work disposition; it is not consensus admission. `retryable`
means the owning workflow may continue reconciliation; it never grants a new
entry identity or permission to submit changed content under an old identity.

| Outcome | applied | accepted | deferred | retryable | terminal | Required fact and continuation |
| --- | --- | --- | --- | --- | --- | --- |
| `APPLIED` | true | true | false | false | false | Owned positive count, or named settled applied replay with count unknown. Exact-row and visibility obligations still apply. |
| `NO_OP` | false | true | false | true | false | Explicit supersession/no-write disposition from its owner. Does not borrow the successor's effect. |
| `PENDING_VISIBILITY` | true | true | true | true | false | Application confirmed as above; the visibility owner explicitly reports observation pending. Continue that observation, not a fresh write. |
| `DEFERRED` | false | true | true | true | false | Explicit admission/pressure deferral with retained work. Re-enter that admission owner when eligible. |
| `REJECTED` | false | false | false | false | true | Explicit refusal or deterministic statement failure. A committed statement failure is retained as committed; rejection does not imply no log entry. |
| `OWNER_NOT_READY` | false | true | true | true | false | The required owner is demonstrably unavailable before this attempt was handed off. Retain the logical work. Does not erase an earlier uncertain attempt. |
| `OBSERVED_STATE_CHANGED` | false | true | false | true | false | Canonical confirmed count zero for this guarded write. Reconcile the exact observed row; zero alone does not prove the requested destination. |
| **`UNCONFIRMED`** | **false** | **false** | **false** | **true** | **false** | No conclusion about application/admission is justified. Retain the intent, cause and original identity; reconcile or re-deliver only that same entry where its owner permits. |

`UNCONFIRMED` projects to `completionState:'unconfirmed'`,
`contractState:'pending'`, `nextAction:'wait'`. It is not a readiness or
pressure deferral. The existing retry owner may schedule reconciliation at
its bounded cadence; the result does not invent another retry loop.

The original seven rows retain their effect booleans. Existing diagnostic
fields (`valid`, `known`, `failed`) remain diagnostic facts about the input,
not a second effect decision. Invalid/unrecognized input still yields the
explicit `UNCONFIRMED` disposition with no grant. In particular, `failed`
must never be read as proof of definite noncommit.

### Canonical control-plane receipt

The supported mutation result contains a required recognized `outcome`, an
optional **top-level** `affectedRows` that is a safe nonnegative integer, an
optional named `settledReplay`, and visibility and write-identity facts when
their owners actually supplied them. No consumer selects a count from
`partitionResult`, `changes`, a truthy `success`, or transport delivery.

The existing result metadata needed by consumers is preserved: table and
operation identity; `idempotencyKey`, partition/entry identity and durable
commit witness when available; named `pendingInstance`; original cause,
failure code and retry hint; and the original lower receipt as provenance.
`partitionResult` is provenance, not an alternate effect oracle. Avoid
spreading untrusted result objects: normalization uses the classifier's
existing plain-own-data and captured-intrinsic discipline, reads each field
once and freezes its owned snapshot. A proxy/accessor cannot be invoked to
manufacture a count or cause a different second interpretation.

Where the existing protocol retains `success`, it is an owner-derived response
field: true for `APPLIED`, `PENDING_VISIBILITY`, `OBSERVED_STATE_CHANGED` and
`NO_OP`; false for the other four outcomes. It is not an application predicate.
No compatibility branch reads a success-only input as a valid receipt.

| Producer fact or incoming shape | Canonical disposition | Count and evidence rule |
| --- | --- | --- |
| Confirmed committed statement with physical positive count | `APPLIED`, or `PENDING_VISIBILITY` if observation is explicitly pending | Copy the exact count once at the physical-result boundary. |
| Confirmed committed statement with physical zero count | `OBSERVED_STATE_CHANGED` | Preserve zero; a pending visibility fact remains separate and cannot turn zero into applied. |
| Named `OUTCOME_NOT_RETAINED` settled applied replay | `APPLIED`, or `PENDING_VISIBILITY` for pending observation | Omit count entirely. Never synthesize zero or one. Row-specific consumers reconcile. |
| Typed `partition_write_outcome_unknown`, lost answer, or post-submission throw without definitive settlement | `UNCONFIRMED` | Preserve original entry/log identity, cause, and uncertainty from earlier attempts. |
| `success:true, provisional:true, changes:1` (or any provisional count) from transaction staging | Remains a provisional transaction result; `UNCONFIRMED` if offered as control-plane application evidence | No committed application grant. Preserve the participant session's own staging/COMMIT/ABORT protocol and provisional count. |
| Explicit pre-submission pressure/owner refusal | `DEFERRED`, `OWNER_NOT_READY` or `REJECTED` according to that owner's actual fact | No count. A prior unknown instance stays unresolved even if a later attempt is refused. |
| Owner's explicit supersession | `NO_OP` | No count and no application grant. |
| `{}`, `{success:true}`, a missing answer, unknown outcome, malformed count, proxy/accessor, conflicting count/replay, or `APPLIED` without count/named replay evidence | `UNCONFIRMED` | Retain a typed invalid/missing-result cause; neither rejection nor success is inferred. |

An ordinary `APPLIED` receipt therefore requires positive count evidence.
Applied replay with unknown count is the single named exception, grounded in
the existing durable replay owner. A count greater than one remains truthful
but cannot satisfy an exact-one-row semantic owner.

### Named write settlement is distinct from positive row effect

`control-plane-write-identity.js` owns named instances and their lifetime. Its
current `judgeAttempt` and `resolvePendingInstance` success-only decisions
must migrate with the canonical result; tightening the consumer alone would
still allow an uncertain instance to be forgotten. The proposed rules are:

| Result for the original named entry | Instance settlement | Positive row-effect evidence | `pendingAppliedSettles` consequence |
| --- | --- | --- | --- |
| Confirmed positive count | Settled; release the held key after recording its exact result | Exact positive count; semantic owner still checks its required cardinality/identity | Preserve existing prior-instance completion where that exact owner permits it; do not submit replacement birth content. |
| Named applied replay, count unknown | Settled; the original statement application is known | Unknown count, never zero or one | Retain the named prior application evidence and suppress replacement birth; row owner must resolve its exact identity by authoritative readback before reporting completion. |
| Confirmed guarded count zero | Settled, with **no positive row effect** | Exactly zero | Must not report prior APPLIED or complete the row owner. Later new content is a new instance only after the semantic owner's existing observed-state reconciliation authorizes it. |
| Committed deterministic statement failure | Settled as failed; preserve committed flag/cause | None | No prior application grant; preserve the existing collision/failure owner and its reconciliation. |
| Explicit no-op/supersession or proven pre-proposal refusal | This attempt was not submitted; release only when no earlier attempt of this instance is unresolved | None | Cannot clear earlier uncertainty or stand in for an applied prior instance. |
| Unconfirmed/malformed/lost answer or provisional staging result offered to this owner | Unresolved; retain the original instance/key/content | None confirmed | Do not issue changed content or a fresh identity; preserve cause and reconcile the original instance. |

The pending-instance descriptor must carry its original identity and the
immutable canonical mutation result that supports its disposition. It cannot
reduce settlement to a success boolean. A distinct settled-no-effect
disposition at this existing owner represents confirmed zero; it is neither
failed nor applied. Row consumers interpret the carried mutation result
through the sole classifier and retain their row-specific evidence rules.
This is a proposed current-interface change, not a temporary alias or a
second mutation classifier.

An applied write with pending visibility can settle its write identity while
its semantic owner still retains the observation obligation. Retiring a held
entry and clearing a caller's pending publication are different operations.

### Visibility remains an independent fact

Preserve the existing visibility vocabulary and
`authoritativeVisibilityConfirmed`. Actual cache observation may establish
`visible` without claiming an authoritative point read. Skipped waits,
bootstrap mode, absent cache callbacks and missing visibility fields grant
neither claim. They leave the visibility field absent/null rather than
defaulting to `visible`. Durability-only owners may use their exact effect
proof; owners promising a visible row must obtain their existing visibility
proof. Original-seed transfers always require the existing exact committed
same-value read, regardless of the mutation response.

## 3. Actual producer-boundary migration

The lower partition API currently emits physical `changes`; the SQL result
API emits `affectedRows`; CDC has additional adapters at the local-result and
bootstrap-writer layers. Replace that field-selection chain with one
projection of the physical statement result at its owning partition boundary.
The durable `_partition_statement_outcomes.changes` field and SQLite's native
result remain physical storage facts; no on-disk schema change is needed.

1. In the existing partition statement-outcome/write-kernel ownership,
   project confirmed application and replay to canonical `affectedRows` or
   the named count-unknown replay. The commit callback in
   `partition-service-entry-apply-base.js` and `answerSettledStatement` consume
   that one projection. Preserve all durable witnesses and statement failures.
2. Migrate the actual SQL/parallel result producers together:
   `query-executor-sql-command-rendering.js`,
   `distributed/parallel-query-partition-outcomes.js`,
   `distributed/distributed-write-coordinator.js`, and the parallel/straggler
   paths consuming the same partition result. Aggregate only known canonical
   counts; any named unknown replay keeps aggregate count unknown. Never
   infer count from a successful delivery or fill an absent count with zero.
3. CDC INSERT/UPDATE/DELETE/UPSERT build the control-plane receipt through the
   existing outcome owner from those actual write facts plus the separate
   visibility result. Refusal/uncertainty is classified before statistics,
   cache waits or publication side effects. Direct CDC callers receive the
   same contract as gateway callers.
4. Remove `normalizeLocalSystemTableWriteResult` and
   `normalizeBootstrapMutationEffect` once their actual producers emit the
   canonical count. Remove downstream count guessing in gateway telemetry
   as well as behavioral consumers. Unknown remains unknown in diagnostics.
5. Gateway admission/coalescing build explicit canonical no-write receipts;
   the gateway validates CDC receipts and projects their contract state. It
   does not promote a lower unknown or malformed shape to application.

The transitive public application-result projection also needs an explicit
disposition. `application-database-result.js:projectAffectedRows` currently
turns an absent count into zero. The proposed current public shape is
`affectedRows:null` for a **named applied DML replay with unknown count**;
ordinary known counts remain numbers, including genuine zero. A malformed
DML receipt is a typed invalid-result failure, not this named replay case.
Read/DDL presentation keeps its existing zero behavior under the statement
kind supplied by the existing SQL owner, without a second SQL classifier.
Known statement application is preserved: count unavailability must not be
relabeled unconfirmed application. The PG-wire count/tag owner retains its
existing typed refusal for a DML result whose count cannot be represented in
its command tag; its failure must preserve the application/replay cause.
This public shape and its caller/contract migration are proposed for review
before production; the predecessor test supplies no coverage for it.

The exact partition result consumer census must be completed before the
producer signature changes. Every affected fixture must model its actual
producer, while intentional malformed inputs stay explicit negative tests.
No period accepting both `changes` and `affectedRows` is proposed.

## 4. Earliest original-seed capability and admission

The supported earliest seed cannot depend on a populated system cache or a
SQLQueryEngine: `CDCIntegrationSetup.createForBootstrap` deliberately constructs
CDC before either exists. The canonical capability at this stage is the
already-created original partition replicas' **Raft `executeQuery`** entry,
selected by exact initial partition identity. It is the same committed
mutation owner used after routing becomes available, not a local SQLite
mutation substitute.

`SeedPartitionsPhase` first creates the declared original replicas with their
original allocation openings. It starts the registration cohort's elections,
waits through the existing leadership owner, then starts the remaining
cohorts. `SeedRegistrationPhase.phaseRegistration` repeats/reuses the
registration gate before enabling its writer. The current early gate covers
partitions, services, tables and message_groups; later registration also
writes config and built-in metadata tables. Their first write needs the same
existing per-partition leadership gate when their cohort has not yet become
ready; it must not silently select a leaderless local write. Do not broaden
the early scheduler cohort or lengthen its timeouts to hide this dependency.

The proposed capability binding is:

- The existing original preparation and `assertOriginalSeedContinuation`
  authorize the bootstrap writer; its local routing selector accepts only
  the original declared partition cohort for the exact table. A boolean
  bootstrap flag or arbitrary map alone grants no birth/transfer authority.
- Phase selection chooses how to find the same partition mutation owner:
  original local cohort before cache hydration, ordinary routing afterward.
  It never selects a different durable mutation implementation after failure.
- Before the first write to a required cohort, consume the existing
  leadership admission. Immediately before each actual hop, retain terminal
  fencing and the partition's own current role/recovery check. Leadership
  loss after the gate yields its typed refusal or uncertain answer.
- Carry the write's supplied key through bootstrap routing and derive the
  partition entry identity with the same derivation as normal local routing;
  the current `_options` discard is removed. Direct writer calls need one
  admitted logical key at their existing write owner, not a fresh key per hop.
- `executeLocalQuery` remains read-only in this interaction. Remove all
  post-Raft local write attempts, their fallback log marker and the obsolete
  fan-out tests. A missing mutation owner produces typed readiness hold.
- Original service and cluster-identity births keep their existing single
  `publishOriginalRight` submission: durable `UNUSED -> SUBMITTED` precedes
  it, and only exact committed same-value readback transfers the right.
  Unknown/zero/absence cannot reset to UNUSED, issue another INSERT, change
  the birth or cluster identity, or open public admission. Same-entry
  continuation beneath an already admitted call cannot become a second
  original-right submission.

This removes the leaderless-write capability rather than recreating it under
another name. Its supported replacement is a typed hold followed by the
existing consensus leadership/registration continuation. The full proof must
exercise both the hold and later completion with the original issuer, not
only prove that local SQL was never called.

## 5. Gateway and join capability removal

Delete `shouldUseSqlMutationFallback` and `executeSqlMutationFallback` and
their method-presence selection. Phase scope remains admission context; it
does not authorize another mutation implementation. The two phase-scope
creators in `bootstrap-api-control-plane-methods.js` and
`node-registration-owner-publication-methods.js`, plus move assignment,
reservation/rollback and service-handoff callers, require the canonical CDC
owner or receive typed `OWNER_NOT_READY` before submission. If an earlier
write is unresolved, the write-identity owner preserves that uncertainty.

Join-time `create-message-group-phase.js` must retain its deferred row through
the existing retrying publication owner. Wire the production delegate at
construction; remove the alternate delegate chain through
`node-joining-cdc-subscription-and-backfill.js` and the raw INSERT branch in
`query-system-state-phase.js`. Missing capability produces an explicit
retained-work result. Clear the deferred row only after its exact publication
requirement is confirmed. Do not add a second retry owner.

## 6. Consumer migration and authority requirements

The baseline has 27 direct classifier calls in 19 files. This exact call census
is not the whole dynamic call graph; wrapper consumers and success-only
side effects below are part of the same interaction.

[`OWNER-CENSUS.md`](OWNER-CENSUS.md) records the completed source-interface
walk beyond those direct calls, including rebalancer SQL alternatives,
schema workflows, transaction staging/settlement, semantic descendants,
unchecked publication effects and physical-count exclusions.
`evidence/current-interface-census.json` binds the 72 files matched by four
literal interface patterns. Its 59 gateway calls and 63 system-table method
calls include forwarding wrappers and are not a dynamic reachability claim.

| Consumer group | Current interface to migrate | Required authority after migration |
| --- | --- | --- |
| Service handoff; node terminal fence; endpoint incarnation; node registration incarnation | Applied shortcuts and named pending-instance completion | Exact-one guarded effect or existing exact identity/version readback. Preserve same-registration pending-instance proof. |
| Lease node reaper | Applied result authorizes endpoint cleanup | Exact observed node incarnation terminal transition before destructive follow-up. |
| Message-group/partition service-row owners; runtime replica projection; registered activation; recovery admission; lifecycle close | Applied shortcuts synthesize intended rows | Exact-one effect or existing authoritative exact-row reconciliation. Preserve D2 handler and cleanup custody. |
| Replica tombstone acquisition/takeover/release and create admission | Classification chiefly chooses diagnostics/retry after mandatory reads | Keep mandatory exact token/incarnation readback as authority; preserve cause and uncertainty. |
| Replica state-machine durability/create/transition/leader-clear | Boolean true or envelope clears durable debt | One owned result preserving real readback-resolved completion; no boolean-or-envelope interpretation. |
| Dynamic config seeding | Applied versus skipped | One confirmed insert is seeded; confirmed ignore-existing zero is skipped; unconfirmed/deferred remains outstanding. |
| Shared authoritative-row helper | Applied clears pending, records persisted value and reports visible | Exact guarded effect/readback and separately required visibility; same pending intent survives unconfirmed answers and completes when proof arrives. |
| Helper constructors in partition metadata, message-group metadata and WASM metadata (two each) | Custom adapters and cache/read capabilities | Same canonical producer contract. No cache-only or missing-method fallback may manufacture durable authority. |
| Gateway completion/normalization/telemetry; bootstrap API invalidation | Missing-field success/count inference | Project canonical outcome; preserve unknown count; invalidate only on the semantic operation's confirmed effect. |
| Join admission/withdrawal and deferred message-group publication | `.accepted`/owner-contract fallback or success-only pending-row clear | Distinguish owned unresolved work from admission and completed publication; no loss of pending work on `UNCONFIRMED`. |

The incoming separately reviewed admin changes add four direct consumers:
conditional CDC deletion visibility, conditional NodesOwner removal, PG-wire
desired-state confirmation and config/policy exact-one-row completion. Their
row-specific contracts remain intact during composition; they must consume
the canonical root count and explicit visibility rather than regain a legacy
alias. Those commits are not source in this baseline worktree.

## 7. Engaged predecessor and full proof

The first witness uses a real `AuthoritativeRowMutationHelper`, its real
`ControlPlaneSystemTableGateway`, and a controlled CDC producer at the normal
method boundary. The only fabricated behavior is the producer answer and the
existing injectable clock/timer. No mocked classifier, mocked gateway or
replacement completion helper can supply the verdict.

For each `{}` and `{success:true}` first answer, a real first submission must
occur. It must return explicit unconfirmed application, retain pending work,
leave persisted/cache-visible progress unset and schedule its bounded
continuation. Then the producer offers a canonical exact-one visible answer,
and the same retained intent is flushed again without queueing or restoring
the value. A second actual producer call and true completion are required.
Both phases assert the same fixed caller-owned write key, exact row guard and
payload. On the predecessor the premature pending clear also prevents the
second call; the paired positive exposes that lost work instead of reseeding
the fixture after the failure.

That explicit `idempotencyKey` exercises `runControlPlaneWrite`'s forwarding
branch. It does **not** enter named-instance `judgeAttempt`,
`resolvePendingInstance` or `pendingAppliedSettles`. Named custody/settlement
and provisional-transaction exclusion therefore have their own required
receipt IDs. They remain unexecuted obligations; the small test makes no claim
to cover them.

This deterministic seam proves neither real Raft commit nor a physical
network schedule. The other required receipt obligations cover canonical
producer/count/replay truth, exact-row consumers, seed custody under real
owner refusals/lost replies, join publication without alternate SQL, and the
existing actual public fresh-seed startup/write/read witness. Use the normal
classified test runner through the sole lab submission coordinator. Preserve
source hashes, command, completion and all failed/passing logs; no unchanged
historical run is relabeled as current proof.

Comparable systems confirm the need for separate facts, not this repository's
implementation. [etcd's operation-completion guarantee](https://etcd.io/docs/v3.6/learning/api_guarantees/#operation-completed)
distinguishes uncertain client answers from server completion. [PostgreSQL's
UPDATE result contract](https://www.postgresql.org/docs/current/sql-update.html#SQL-UPDATE-OUTPUTS)
distinguishes a successfully executed statement from its affected count,
including zero. The source/history census and engaged predecessor are the
evidence for the local defect.
