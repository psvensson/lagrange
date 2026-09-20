# Version identity for the membership-operation fence — reconnaissance

READ-ONLY reconnaissance. Nothing in the repository was changed
(`git status --porcelain` empty at the end of the run).

**Exact head (R22).** Every `src/` citation below was read in the checkout at
`/mnt/data/peter/projects/lagrange`, which is at **`3dd08cb25` on `main`**, not
the `49c0b6d0f` named in the briefing. `git diff --stat 3dd08cb25 49c0b6d0f`
shows the two heads differ **only** in two `solve/` documents and **not at all
under `src/`**, so every citation holds identically at both. The difference is
itself load-bearing: `3dd08cb25` carries
`solve/epics/formation-seed-decoupling/binding-direction-replica-membership-model-reduction-2026-09-20.md`,
which `49c0b6d0f` does not — see §0.

**Scope note.** This began as the broad epoch/version census of the owner
decision §6 and was NARROWED mid-run by the binding owner direction to the
membership-operation boundary and the single question:

> What authoritative version identity is minimally necessary to ensure that a
> ReplicaOperation planned against membership M cannot execute against a later
> incompatible membership M'?

Sections 1–6 answer that. The appendix carries what the broader census had
already established at the moment of narrowing and is labelled **PARTIAL** —
it is not a closed census and must not be read as one.

**Evidence marks.** `READ` = the cited line was opened and read in this run.
`INFERRED` = deduced from code read elsewhere, naming, or absence-of-callers
greps; the basis is stated. Citations are `path:line` relative to the
repository root. A claim that rests on an external dependency is marked
`external dep` and cited under `node_modules/`.

**Discipline.** No repairs proposed. No canonical model chosen. No tolerance
proposed. Where two modules disagree, the disagreement is stated, not averaged
(R01/R03 findings are reported, not fixed — R17).

---

## 0. Bearing on the binding direction — a stop condition is met

After the narrowing I located the document it came from:
`solve/epics/formation-seed-decoupling/binding-direction-replica-membership-model-reduction-2026-09-20.md`
(present on `3dd08cb25`, absent on `49c0b6d0f`). Its §12 is the question this
document answers. READ.

Its §19 acceptance target assumes:

> Raft exposes the committed membership and its generation.

and its §20 lists as an explicit stop condition:

> Raft membership generation cannot provide the necessary stale-operation
> fence.

> **That stop condition is met, and for a stronger reason than the wording
> anticipates.** It is not that the Raft membership generation is inadequate —
> §1.0 establishes there is no committed Raft membership object at all. The
> consensus library maintains an unreplicated, per-node, in-memory peer array
> (`node_modules/@markwylde/liferaft/index.js:824-852,862-882`), so there is
> nothing for Raft to expose and nothing for a generation to name. READ.
>
> Reported, not solved: naming the smallest additional concept is the owner's
> call under §20, and this document proposes none (the brief forbids choosing a
> canonical model, and §20 asks for the falsifier to be brought back rather
> than for a leap to Model B).

Two further consequences for the binding direction, stated as evidence only:

- **§7** ("Raft owns which membership configuration has actually committed")
  does not hold as written. Each replica's peer list is local and unagreed, so
  "committed membership" as a consensus fact does not exist per partition. §1.4
  shows the closest referent — the `services` rows — is a set of independently
  LWW-merged rows with no identity.
- **§13**'s fence step "base membership generation is still valid" has no value
  to read today that satisfies it: the only generation the operation carries is
  the membership *publication* epoch, which Finding 1 shows does not advance
  when a partition's membership changes.

Everything else below is the evidence for those statements.

---

## 1. The candidate membership generation(s) and their relation to committed Raft membership

### 1.0 The decisive structural fact: there is no committed Raft membership

**There is no Raft configuration-change protocol in this repository, therefore
there is no committed-Raft-membership object and no generation of one.**

- The consensus engine is the external package `@markwylde/liferaft`
  (`package.json:245`). READ.
- `join(address)` clones a peer representation and pushes it onto the node's
  own in-memory array: `node_modules/@markwylde/liferaft/index.js:824-852`
  (`raft.nodes.push(node); raft.emit('join', node)`). `leave(address)` splices
  it out: `:862-882`. No log entry is appended, no joint configuration exists,
  no configuration index is minted. READ (external dep).
- Quorum is recomputed per call from the local peer-list length:
  `node_modules/@markwylde/liferaft/index.js:432-444`
  (`Math.ceil(this.nodes.length / 2) + 1`). READ (external dep).
- The repository's only peer-add call path is `LifeRaftProvider.joinPeer`
  (`src/raft/liferaft-provider.js:255-260`), reached from
  `src/partition/partition-service-raft-init-base.js:583`,
  `src/raft/raft-replica-base.js:265-275`, `src/raft/raft-group.js:390-405`,
  `src/message-group/message-group-service-raft-lifecycle.js:143` and `:354`.
  READ.
- `src/raft/*.js` contains no `configIndex`, `configurationIndex`, `confIndex`
  or `jointConfig` identifier (grep, zero hits). READ (absence).

**Consequence (INFERRED, from the above).** Each replica's notion of "who is in
this raft group" is its own local, unreplicated peer list. There is no
cluster-agreed membership object for a generation to name, so every candidate
below is a *proxy* for committed membership, never committed membership itself.
The owner's phrase "the generation that describes the membership state from
which the transition was authorized" has, today, no existing per-partition
referent with that meaning.

### 1.1 Candidate C1 — membership publication epoch (`control_plane_publications.publication_epoch`)

This is the value the current fence machinery uses.

Alias graph (indented; a child is the same value under a new name):

- `publication_epoch` — durable column, `INTEGER NOT NULL`
  (`src/bootstrap/system-table-runtime-schema-definitions.js:22`). READ.
  - `publicationEpoch` — canonical camelCase carrier on a normalized row
    (`src/control-plane/system-row-normalizers.js:208-214` normalizes the row).
    READ.
    - `candidatePublicationEpoch` — the one allocation site
      (`src/control-plane/membership-publication-candidate-derivation.js:556-559`).
      READ.
    - `publishedPlanningEpoch` — the epoch **only when status is PUBLISHED**,
      else `null`; minted once
      (`src/control-plane/recovery-protocol-snapshot.js:659-664`). READ.
      - `currentEpoch` (planner side) — the dispatch gate's local name
        (`src/rebalancer/operation-workflow-dispatch-epoch-gate.js:98-100`).
        READ.
    - `membershipEpoch` — the snapshot-catchup identity field
      (`src/raft/snapshot-catchup.js:122`). READ.
      - `leaderMembershipEpoch` / `learnerMembershipEpoch` — the two sides of
        the promotion proof
        (`src/partition/partition-service-learner-promotion-proof-methods.js:109-110`).
        READ.
      - `requestedMembershipEpoch` / `currentMembershipEpoch` — the same
        partition-side answer read twice around a round trip
        (`src/partition/partition-service-learner-promotion-methods.js:519-532`).
        READ.
    - `membershipPublicationEpoch` — the move / operation-record / column
      spelling (`src/rebalancer/replica-status.js:167-168`). READ.
      - `planningMembershipPublicationEpoch` — the one epoch a whole
        rebalance cycle stamps
        (`src/rebalancer/unified-rebalancer-rebalance-loop.js:239-240`). READ.
      - `observedMembershipEpoch` — the epoch a spread-cure authorization was
        minted from (`src/rebalancer/move-planner-move-calculation-methods.js:372-373`;
        field rule `src/rebalancer/spread-cure-transition-authorization.js:181`).
        READ.
      - `observedMembershipEpoch` (second, unrelated reader) — on the learner
        wake path this same NAME holds the *partition-side* reader's answer
        (`src/partition/partition-service-learner-promotion-wake-methods.js:36,63,118-122`).
        READ. **One name, two readers** — see §1.4.

**Authoritative writer.** One allocation site:
`src/control-plane/membership-publication-candidate-derivation.js:556-559` —
`changed ? baselineEpoch + 1 : Math.max(baselineEpoch, 1)`, where
`baselineEpoch = normalizePositiveInteger(latestPublicationRow?.publicationEpoch, 0)`
(`:522-525`). READ. The durable write funnel is
`src/control-plane/membership-publication-coordinator-persist.js:50-79`
(`persistPublicationRow` → `controlPlanePublicationsOwner.upsertPublication`).
READ.

**Writer singleton discipline.** The periodic owner driver refuses to act
unless this node resolves as the `control_plane_publications` raft leader:
`src/control-plane/membership-publication-coordinator-reconcile.js:636-655`
(`resolveControlPlanePublicationsLeadership(...)`, `if (!isLeader) { ...
CONVERGENCE_REASON.NOT_OWNER ... }`). READ. So the writer is gated on a raft
leadership that can itself flap.

**The event that advances it — and the one that does not.** The `changed`
predicate is
`src/control-plane/membership-publication-candidate-derivation.js:526-536`:
the epoch advances only when (a) `publishedActiveNodeIds` differs from the
previous row's list, or (b) `sourceTopologyEpoch` changed, or (c)
`sourceSnapshotVersion` changed. READ.

`publishedActiveNodeIds` is a list of **cluster node ids**, not a partition's
replica set (`:494-512`, the value is threaded from the active-node views and
fed to `requiredAckNodeIds` as node ids; schema column
`published_active_node_ids`, `src/bootstrap/system-table-runtime-schema-definitions.js:26`).
READ.

Inputs (b) and (c) are dead on the mainline path. A full backward trace of every
assignment to `sourceTopologyEpoch` / `source_topology_epoch` and
`sourceSnapshotVersion` / `source_snapshot_version` in src found every site to
be decode, merge or pass-through plumbing, and no caller in the
coordinator/planning layer ever supplies a value:
`src/control-plane/membership-publication-coordinator-planning.js:159` and
`:230` build the options object without either key, and a grep for the
identifier across `membership-publication-coordinator*.js` /
`membership-publication-planning.js` returns zero hits. READ (delegated trace,
method recorded). The one literal writer is
`src/control-plane/formation-release-handoff-publication.js:291-292`, which
writes `source_topology_epoch: normalized.capturedPublicationEpoch` and
`source_snapshot_version: normalized.observedPublicationEpoch` — i.e. two
**membership publication epochs relabelled as a topology epoch and a snapshot
version**, on the `formation_release_handoff` publication kind only. READ
(delegated).

> **Finding 1 (decisive).** The `changed` predicate has three inputs and only
> one is ever supplied on the membership-publication path. So the membership
> publication epoch advances **if and only if the cluster active-node-id list
> changes**. Adding, removing or replacing a replica of partition P on nodes
> already in that list does not change it, therefore does not advance the
> epoch. The epoch is blind to exactly the transitions a ReplicaOperation
> performs. READ (the predicate and the trace) + INFERRED (the composed
> consequence).
>
> It follows that C1 cannot express "membership M of partition P". It names a
> cluster node-set publication. Two different per-partition memberships are
> routinely the same epoch.

> **Finding 1b (a live consequence of the always-absent columns).**
> `src/control-plane/node-trust-state.js:96-102` computes
> `revisionKnown = Number.isFinite(publicationEpoch) && Number.isFinite(sourceSnapshotVersion)`
> and, when false, forces the node's membership evidence state to
> `NODE_TRUST_EVIDENCE_STATE.UNKNOWN` regardless of what was actually
> published; that feeds `resolveTrustDecision` (`:312-313`) and gates
> `repairEligible` / `serveEligible`. READ (delegated). Since
> `sourceSnapshotVersion` is never supplied on this path, this predicate is
> constantly false. Reported for its owner, not repaired.

**Monotonicity.** Per `publication_kind`, cluster-wide, `+1` per change; it is
NOT per partition. It is monotonic only while the writer can see the previous
row: `baselineEpoch` falls back to `0` when the latest row is not visible
(`:522-525`), so a writer with a cold or incomplete cache derives epoch `1`
over an existing epoch `N`. READ (the fallback) + INFERRED (the regression
consequence).

**Persistence.** Durable in `control_plane_publications`
(`src/bootstrap/system-table-runtime-schema-definitions.js:17-49`).

> **Finding 2 (contradiction with the historical inventory).** The historical
> inventory states the unique index is `(publication_kind, publication_epoch)`
> (`.../historical/membership-epoch-domain-inventory.md` line 31). In src the
> index `idx_control_plane_publications_kind_epoch`
> (`src/bootstrap/system-table-runtime-schema-definitions.js:40-43`) is
> declared WITHOUT `unique: true`, unlike sibling indices in the same file that
> do declare it (e.g. `idx_replica_ops_target_claim_key`, `:81-85`). The
> primary key is `publication_id` (`:20`). READ. Per R25 the source is the
> authority: **(kind, epoch) is not enforced unique at the schema level.**

### 1.2 Candidate C2 — `replica_operations.membership_publication_epoch`

A *copy* of C1's planner-side answer, stamped per operation. Not an
independent domain.

- Durable column, nullable INTEGER
  (`src/bootstrap/system-table-runtime-schema-definitions.js:63`). READ. Added
  to existing replica DBs by an `ALTER TABLE` migration
  (`src/partition/partition-service-entry-apply-base.js:75-86`). READ.
- Single decode owner: `src/rebalancer/replica-operation-membership-epoch-binding.js`
  — `BOUND` / `UNBOUND` / `INVALID`, predicate
  `isBoundMembershipPublicationEpoch = Number.isInteger(value) && value >= 0`
  (`:46-48`); the module header names the `Number(null) === 0` hazard this
  owner exists to prevent (`:16-19`). READ.
- Durable-row decode boundary:
  `src/rebalancer/replica-operation-repository-row-methods.js:93-107`. READ.

### 1.3 Candidate C3 — Raft `term` (per partition group)

The only value with per-partition scope that changes on a leadership event.
It fences **tenure**, not membership.

- Live value `raft.term`; src writer
  `src/raft/liferaft-incoming-data.js:179-187` (adopt a higher packet term).
  READ (subagent) — verified indirectly here by the absence greps below.
- Boot seed for an INSTALLED replica:
  `src/partition/partition-service-raft-init-base.js:487-493`. READ (subagent).
- **Durable persistence is effectively dead on the live path.**
  `PartitionRaftStorage.persistTerm()` / `.persistVotedFor()`
  (`src/partition/partition-raft-storage.js:165,174`) have **no callers
  anywhere in src** — the only other `persistTerm`-prefixed hits are
  `persistTerminalTransitionClear` in the split/merge workflow, an unrelated
  name. READ (grep over src, verified in this run). The liferaft package never
  invokes the log adapter's `setTerm`/`getTerm`/`votedFor` hooks
  (`grep setTerm|getTerm|votedFor node_modules/@markwylde/liferaft/index.js`
  → zero hits). READ (verified in this run). The only durable writer of
  `_raft_state.currentTerm` is the snapshot-install path
  (`src/raft/snapshot-install.js:162-187`, rule at `:200-208`). READ (subagent).
- Decision consumers: `src/raft/liferaft-follower-batch.js:27`
  (`raft.term === packet.term`, the de-facto stale-leader write fence, re-checked
  after each await at `:71,76,105,112,125,133-134`);
  `src/raft/liferaft-incoming-data.js:384,444,587`;
  `src/raft/learner-promotion-progress.js:133-135` (term must be a non-negative
  integer; term 0 is legitimate) and `:220-226`
  (`proof.term < localTerm` → `STALE_PROOF_TERM`). READ (subagent; `:133-135`
  and `:220-226` read directly in this run).

**Relation to committed membership.** None. Term changes on elections, not on
replica-set changes, and a replica-set change does not change the term.

### 1.4 Candidate C4 — the per-partition replica set itself has no version

The de-facto per-partition membership is the set of `services` rows for a
`partition_id` with their `raft_role` and `status`
(`src/bootstrap/system-table-core-schema-definitions.js:221-249`). READ.

That schema has **no version, generation, epoch or sequence column**. Its only
ordering is row-level last-writer-wins on `updated_at`, or on the cache-only
`updated_at_hlc` causal stamp when present:
`src/cache/system-table-cache-row-merge.js:38-74` (`isStaleForExistingRecord`),
HLC parse at `:30-35`. READ. The HLC stamp is applied by the CDC generator to
the row payload and is explicitly never persisted
(`src/partition/partition-cdc-generator.js:233-256`, "Cache-only: the
durable-write path filters unknown columns ... this stamp is never persisted").
READ.

> **Finding 3.** The object the fence would most want to name — "partition P's
> committed replica set" — is a set of independently LWW-merged rows with no
> identity of its own. A generation of it would have to be minted, not found.
> READ (schema + merge path) + INFERRED (the conclusion).

### 1.5 Candidate C5 — `nodes.boot_incarnation` (per-node, durable, real)

- Durable column `src/bootstrap/system-table-core-schema-definitions.js:141`
  (`INTEGER NOT NULL DEFAULT 0`, comment: "Locally minted monotonic boot
  incarnation of the row's writer ... receivers refuse a stale-incarnation
  writer before the heartbeat watermark comparison"). READ.
- Mint: `src/bootstrap/rejoin-hints.js:285-296` (`mintBootIncarnation` =
  persisted value + 1, read at `:277-283`), captured once per boot at
  `src/lagrange-runtime-startup.js:111` and `:404`. READ.
- Decision consumers: connection adoption
  (`src/transport/message-router-connection-authority.js:248`), formation-release
  handoff cohort identity
  (`src/control-plane/formation-release-handoff-contract.js:321,354,368-369`;
  `src/control-plane/formation-release-handoff-closure-owner.js:60-61,93-98,307,399`),
  all `!==` identity comparisons, not ordering. READ.
- Relation to membership: it fences a NODE incarnation across restarts. It says
  nothing about a partition's replica set.

### 1.6 Candidate C6 — node heartbeat watermark (ordering, not a counter)

`compareNodeHeartbeatWatermarks` orders `(last_heartbeat, ready_lease_expires_at,
connection_state)` lexicographically
(`src/node/node-readiness-policy.js:102-141`), and
`isNodeHeartbeatWatermarkRegression` (`:139-141`) is consulted by the cache
merge for `nodes` rows only (`src/cache/system-table-cache-row-merge.js:48-51,
62-74`). READ. Clock-derived; not a generation.

### 1.7 Summary of §1

| Candidate | Scope | Advances on a partition replica-set change? | Durable | Names committed raft membership? |
| --- | --- | --- | --- | --- |
| C1 publication epoch | cluster node-set, per kind | **No** (Finding 1) | yes | no |
| C2 operation epoch column | per operation | copy of C1 | yes | no |
| C3 raft term | per partition group | no (elections only) | effectively no (§1.3) | no |
| C4 services rows | per partition | n/a — no version exists | rows yes, version no | closest referent, unversioned |
| C5 boot_incarnation | per node | no | yes | no |
| C6 heartbeat watermark | per node | no | derived from clocks | no |

**Answer to the narrowed question, as the code stands.** No existing value both
(a) describes a per-partition membership and (b) advances when that membership
changes. C1 satisfies neither for the per-partition case; C3 satisfies (a) but
not (b); C4 satisfies (a) and would satisfy (b) if it had an identity, which it
does not.

---

## 2. Creation-time recording

**What is recorded.** Exactly one value: `membership_publication_epoch` on the
`replica_operations` row.

1. Per rebalance cycle the planner resolves the epoch **once**:
   `src/rebalancer/unified-rebalancer-rebalance-loop.js:239-240`
   (`this.resolvePublishedMembershipPlanningEpoch()`), which delegates to the
   planner-side reader `getCurrentPublishedMembershipEpochSync(nodeId, now)`
   (`:384-395`). READ.
2. The same value is passed into planning as
   `{membershipPublicationEpoch: planningMembershipPublicationEpoch}`
   (`:241-247`) and stamped onto every limited move (`:349-358`), guarded by
   `isBoundMembershipPublicationEpoch`. READ. **All move types are stamped**,
   including REMOVE.
3. Creation asserts it against a fresh read of the same planner-side reader:
   `src/rebalancer/rebalance-coordinator-operation-creation.js:307`
   (`this.assertMembershipPublicationEpoch(move)`) →
   `src/rebalancer/rebalance-coordinator-owner-delegation-methods.js:188-224`.
   READ. Behaviour: UNBOUND returns early (unfenced); unreadable current epoch
   throws with `REBALANCER_SKIP_REASON.MEMBERSHIP_EPOCH_UNAVAILABLE` (`:200-212`);
   `currentEpoch === requestedEpoch` passes (`:213-215`); anything else throws
   `MEMBERSHIP_EPOCH_CHANGED` (`:217-223`). Comparison is strict equality.
4. The record is built with the field
   (`src/rebalancer/rebalance-coordinator-operation-creation.js:716-724` →
   `createOperationRecord`), and the field is attached only when bound
   (`src/rebalancer/replica-status.js:166-169`). The column is written at
   `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:179`
   (`operation.membershipPublicationEpoch ?? null`). READ.

**Who supplies the value.** The planner-side reader
`ControlPlaneReadinessService.getCurrentPublishedMembershipEpochSync`
(`src/control-plane/control-plane-readiness-publication-planning-snapshot.js:599-608`):
it takes the node's membership-publication *planning answer* and decodes
`publishedPlanningEpoch` through
`readPublishedMembershipEpoch(value) = Number.isInteger(value) && value >= 0 ? value : null`
(`src/control-plane/published-membership-epoch-reading.js:23-25`). READ. It
never coerces absence to 0.

**The spread-cure authorization carrier.** The landed
`critical-spread-transition-authority-carry` record carries
`observedMembershipEpoch` and nothing else epoch-like.

- Field list and rules:
  `src/rebalancer/spread-cure-transition-authorization.js:156-187`
  (`observedMembershipEpoch: isBoundMembershipPublicationEpoch`, `:181` — it
  reuses the operation column's predicate rather than minting a second one).
  READ.
- Who supplies it: the move planner, from the **same per-cycle planning epoch**:
  `src/rebalancer/move-planner-move-calculation-methods.js:372-373`
  (`const observedMembershipEpoch = planningContext.membershipPublicationEpoch;`),
  threaded to the cure policy at `:465` and `:709`, and into the policy record at
  `src/rebalancer/replica-placement-cure-policy.js:429` and
  `src/rebalancer/move-planner-priority-spread-cure.js:42,169`. READ.
- The coordinator completes the record with the two identities it owns and
  stamps it into `stepsHistory[0]`:
  `src/rebalancer/spread-cure-transition-authorization.js:510-549`, called from
  `src/rebalancer/rebalance-coordinator-operation-creation.js:796-800`. READ.

> **Finding 4.** The authorization's `observedMembershipEpoch` and the row's
> `membership_publication_epoch` are the same per-cycle value, so on the
> planner path they cannot disagree. This is the one place where "the
> generation the transition was authorized from" is recorded today — but it is
> C1, which per Finding 1 does not describe the partition's membership.

> **Finding 5 (creation bypass, R01-adjacent).** The managed-split dissolution
> path constructs and sends a `REMOVE_REPLICA` node message directly
> (`src/partition/managed-split-workflow-dissolution-methods.js:505-525`),
> bypassing `createOperationInternal` and therefore the creation-time epoch
> assert entirely. READ. A second producer of membership mutations exists that
> carries no epoch binding.

> **Finding 6 (the stamp is not always the plan's epoch).** When a move reaches
> the coordinator request builder carrying no bound epoch, the executor path
> substitutes a **fresh** read of the current planner epoch:
> `src/rebalancer/unified-rebalancer-move-execution.js:66-70`
> (`resolveMoveMembershipPublicationEpoch`: `isBound(move.membershipPublicationEpoch)
> ? move.… : rebalancer.resolvePublishedMembershipPlanningEpoch()`), applied at
> `:88-93`. READ. On that path the recorded epoch is the epoch at
> *request-build* time, not the epoch the plan was computed under — the row
> then asserts a membership state it was not authorized from.

---

## 3. Execution-time checks

Seven places in the lifecycle could check. Two compare, one is a dead carry,
one explicitly declines, one compares a different reader's answer, and two do
nothing.

**(a) Creation.** `assertMembershipPublicationEpoch`,
`src/rebalancer/rebalance-coordinator-owner-delegation-methods.js:188-224`.
Comparison `currentEpoch === requestedEpoch`. Mismatch → throw with
`MEMBERSHIP_EPOCH_CHANGED`; unreadable → throw with
`MEMBERSHIP_EPOCH_UNAVAILABLE`. Fail closed, the plan is abandoned and
re-planned on the next cycle (INFERRED: the skip reason routes into the
rebalancer's skip handling, not a patch path). READ.

**(b) Dispatch.** `ensureDispatchMembershipEpochOrSkip`,
`src/rebalancer/operation-workflow-dispatch-epoch-gate.js:81-122`. READ.
- Only for ADD and REPLACE (`isEpochFencedOperationType`, `:31-36`). **REMOVE
  is never dispatch-fenced.**
- UNBOUND operation → no fence (`:89-96`).
- `currentEpoch === null` (unreadable) → `DEFERRED_RETRY_PENDING` skip (`:101-110`).
- `currentEpoch === planningEpoch` → proceed (`:111-113`).
- Anything else → `failOperation` with `Stale dispatch for published membership
  epoch N; current epoch is M` (`:114-121`). Note this fails a *higher*
  planning epoch too: the comparison is equality, not staleness.
- The "current" side is `owner.getCurrentPublishedMembershipEpoch()`
  (`:98-100`), i.e. the planner-side reader again via
  `src/rebalancer/rebalance-coordinator-owner-delegation-methods.js:163-168`.
  READ.

**(c) The executor request carry — a dead end.** The dispatch response
reconciler copies the epoch onto the outgoing request with the comment "so
ADD/REPLACE execution can reject staleness against it"
(`src/rebalancer/operation-workflow-dispatch-response-reconcile.js:404-413`).
READ.

> **Finding 7.** Nothing reads it. `grep -rn "ReplicaOperationField.MEMBERSHIP_PUBLICATION_EPOCH" src`
> returns four hits, all inside `src/rebalancer/` (the dispatch gate at
> `operation-workflow-dispatch-epoch-gate.js:48` and the three reconcile lines
> above). `grep -rn "membershipPublicationEpoch|membership_publication_epoch" src`
> outside `src/rebalancer/` returns **only** the schema column declaration
> (`src/bootstrap/system-table-runtime-schema-definitions.js:63`), the two
> partition-service constant/DDL spellings
> (`src/partition/partition-service-constants.js:213,253,391`,
> `src/partition/partition-service-entry-apply-base.js:63-86`) — none of which
> is a comparison. READ (both greps run in this run). The receiving node's ADD
> and REMOVE executors contain no epoch, generation or version identifier at
> all (`grep -niE "epoch|generation|version" src/node/replica-handler-create-methods.js
> src/node/replica-handler-remove-execution-methods.js` → zero hits). READ.
>
> **The executing side performs no membership fence of any kind.** The stated
> intent of the carry is not realised in code.

**(d) The spread-cure authorization evaluation — explicitly not evaluated.**
`evaluateSpreadCureTransitionAuthorization`,
`src/rebalancer/spread-cure-transition-authorization.js:384-408,488-508`. READ.
- Criteria in fixed order: intent, operationId, destination node+replica,
  desired RF, then the membership fence.
- `if (!isBoundMembershipPublicationEpoch(context.partitionMembershipEpoch))`
  → `MEMBERSHIP_FENCE_NOT_EVALUATED` (`:401-403`) — a named third outcome,
  neither honoured nor refused.
- Otherwise `authorization.observedMembershipEpoch < context.partitionMembershipEpoch`
  → `MEMBERSHIP_GENERATION_STALE`, else `HONOURED` (`:404-407`). Note the
  direction: a *higher* authorization epoch is honoured, and a supplied `0`
  honours everything.
- The sole caller supplies the named non-value:
  `src/partition/partition-service-learner-promotion-count-check-methods.js:266-284`
  sets `partitionMembershipEpoch: SPREAD_CURE_PARTITION_EPOCH_NOT_READ`
  (`'not_read_by_the_carrier'`,
  `src/rebalancer/spread-cure-transition-authorization.js:75`) and passes no
  epoch into the evaluation. READ.

> **Finding 8.** Today the spread-cure fence is never applied. The guard reads
> no epoch, by design (the module header states the ruling:
> `spread-cure-transition-authorization.js:40-47`), and the result is recorded
> in the log payload only — `partition-service-learner-promotion-count-check-methods.js:249-256`
> ("the result is stated in the log payload only"). READ. This is the good news
> for the owner's constraint: *this* guard does not determine a current epoch
> independently, because it determines none at all.

**(e) The learner promotion proof — a different guard, and it DOES determine
the epoch independently.**

- The learner mints a request epoch, sends it, then **re-reads its own epoch**
  at receipt: `src/partition/partition-service-learner-promotion-methods.js:517-532`
  (`requestedMembershipEpoch = this.resolveLearnerPromotionMembershipEpoch()`
  at `:519-520`; `currentMembershipEpoch: this.resolveLearnerPromotionMembershipEpoch()`
  at `:532`). READ.
- The leader independently resolves its own:
  `src/partition/partition-service-learner-promotion-proof-methods.js:109`
  (`leaderMembershipEpoch: this.resolveLearnerPromotionMembershipEpoch()`). READ.
- Both resolve through `buildSnapshotCatchupIdentityFromCache` →
  `selectLatestPublishedMembershipEpoch(options.publicationRows)`
  (`src/partition/partition-service-learner-promotion-proof-methods.js:50-56`;
  `src/raft/snapshot-catchup.js:111-124`), over **each node's own cached
  `control_plane_publications` rows** (`src/raft/snapshot-catchup.js:126-137`,
  `readCachedPublicationRows`). READ.
- Comparisons: leader side refuses on `leaderMembershipEpoch !== learnerMembershipEpoch`
  (`src/raft/learner-promotion-progress.js:145`) and on either value not being a
  non-negative integer (`:137-143`); learner side refuses on the three-way
  `EPOCH_CHANGED` rule (`src/raft/learner-promotion-progress.js:211-219`:
  `currentMembershipEpoch !== requestedMembershipEpoch` OR
  `proof.membershipEpoch !== currentMembershipEpoch`). All strict equality. READ.
- On refusal: defer and reschedule on the retry cadence
  (`src/partition/partition-service-learner-promotion-methods.js:534-548`).
  On acceptance: `this.becomeFollower()` (`:559`) — the actual membership
  transition. READ.

> **Finding 9 (answers the owner's question directly).** **Yes — the promotion
> guard determines a "current epoch" independently today, three times per
> proof** (learner at mint, learner at receipt, leader at answer), each from its
> own cached publication rows, via a reader that is *not* the reader the mint
> used. The authorization path uses the planner-side reader
> (`getCurrentPublishedMembershipEpochSync`, null on absence); the promotion
> path uses the partition-side reader (`selectLatestPublishedMembershipEpoch`,
> **0** on absence, and no `publication_kind` filter — see §1.4 of the
> historical inventory and `src/control-plane/membership-epoch-contract.js:300-321`).
> READ.

**(f) REMOVE execution.** No check. The dispatch gate excludes REMOVE
(`operation-workflow-dispatch-epoch-gate.js:31-36`) and the remove executor
holds no version identifier (Finding 7). READ (absence).

**(g) The split/merge dissolution REMOVE.** No check; it never entered the
coordinator (Finding 5).

### 3.1 The two readers, as they stand in src

`selectLatestPublishedMembershipEpoch`
(`src/control-plane/membership-epoch-contract.js:300-321`) — filters to
PUBLISHED rows, takes the maximum available epoch, returns **0** when none.
No `publication_kind` filter in the function itself; the filter, if any, is the
caller's (`src/raft/snapshot-catchup.js:126-137` passes *all* cached rows). READ.

`getCurrentPublishedMembershipEpochSync`
(`src/control-plane/control-plane-readiness-publication-planning-snapshot.js:599-608`)
— returns the node's planning answer's `publishedPlanningEpoch`, which is
non-null only when that row's normalized status is PUBLISHED
(`src/control-plane/recovery-protocol-snapshot.js:659-664`), else **null**. READ.

They disagree about absence (`0` vs `null`), about publication kind, and about
the establishing window. The historical inventory measured this on real owners;
this run re-read the two functions and confirms the shapes. The divergence is
therefore **not** legitimate lag alone: the two readers answer different
questions under one concept name.

---

## 4. Restart and leader-change behaviour

**(a) Raft term across a restart.** Per §1.3 the live term is never written to
`_raft_state` on the normal path (`persistTerm`/`persistVotedFor` uncalled;
the liferaft package never calls the adapter's term hooks). A replica that has
never installed a snapshot therefore boots at term 0
(`src/partition/partition-service-raft-init-base.js:487-493` seeds only from
`this.storage.currentTerm`, which `loadPersistedState` read from a row that
only the snapshot-install path ever wrote). READ (the absence greps) +
INFERRED (the boot-at-0 consequence). C3 is not restart-stable.

**(b) Membership publication epoch across a restart.** The epoch itself is
durable, but both readers depend on the node's **cache** of
`control_plane_publications`:
- the partition-side reader returns **0** for an empty/cold cache
  (`src/control-plane/membership-epoch-contract.js:318-320`) — and 0 is a
  legitimate epoch, indistinguishable from "no rows yet". READ. This is the
  same shape as the `Number(null) → 0` family the binding owner exists to
  prevent (`src/rebalancer/replica-operation-membership-epoch-binding.js:16-19`),
  surviving in a different module.
- the planner-side reader returns `null` for the same situation
  (`published-membership-epoch-reading.js:23-25`). READ.

> **Finding 10.** On a node whose publication cache has not yet hydrated, the
> promotion guard's independently determined epoch is `0` while the leader's is
> `N`. The strict `!==` at `src/raft/learner-promotion-progress.js:145` then
> refuses the promotion with `EPOCH_MISMATCH` for as long as the cache lags.
> READ (both sides) + INFERRED (the composed outcome; this reading alone does
> not establish the live frequency — see §6).

**(c) The allocator across a restart.** `baselineEpoch` falls back to 0 when
the latest publication row is not visible
(`src/control-plane/membership-publication-candidate-derivation.js:522-525`),
so a newly elected publication owner with an incomplete view derives epoch 1
over an existing N. Combined with Finding 2 (no unique index on
`(kind, epoch)`) nothing in the schema refuses the duplicate. READ + INFERRED.

**(d) Raft leader change.** The membership publication epoch is not
raft-leader-bound in its value — it is bound in its *writer*, via
`resolveControlPlanePublicationsLeadership`
(`src/control-plane/membership-publication-coordinator-reconcile.js:636-655`).
A leadership flap of the `control_plane_publications` group therefore changes
who may allocate, not what the epoch means. READ.

A partition's own raft leader change: `_followerMatchIndexByAddress` is cleared
on every state change (`src/raft/liferaft-incoming-data.js:675-678`, READ via
subagent), so a promotion proof after a leader change starts from
`matchIndex = 0` (fail-closed, `src/raft/liferaft-incoming-data.js:73-85`) and
must re-accumulate evidence. The membership epoch is untouched by that event.

**(e) The operation row across a restart.** The durable column decodes through
one owner and fails closed on a malformed value
(`src/rebalancer/replica-operation-repository-row-methods.js:93-107`), so a
rehydrated row is BOUND, UNBOUND, or an explicit error — the `Number(null)`
hazard is closed *on this path*. READ.

---

## 5. Is a second generation domain required?

**Yes — one, and it is the partition SHAPE (split/merge) domain. It is a
genuinely distinct semantic, and today nothing interlocks it with membership
operations.**

The domain: `tables.active_partition_version`, `tables.pending_partition_version`,
`tables.partition_transition_state`
(`src/bootstrap/system-table-core-schema-definitions.js:28-35`) and
`partitions.partition_version` (`:56-61`). READ.

- It has its own contract owner and a real decision function:
  `src/partition/partition-descriptor-epoch-contract.js` —
  `buildPartitionDescriptorEpochDecision` (`:195-275`) returns ACCEPT/REJECT with
  named states (`ACTIVE_MATCH`, `PENDING_MATCH`, `SPLIT_TARGET_MATCH`,
  `STALE_ROUTE`, `MISSING_EVIDENCE`). Comparisons are strict equality plus one
  `activePartitionVersion + 1 === routeTargetVersion` successor rule (`:158-164`).
  READ.
- It is advanced by the managed split workflow's cutover:
  `src/partition/managed-split-workflow-ownership-methods.js:277-302`
  (writes `pending_partition_version`, then on cutover promotes it into
  `active_partition_version` and clears `pending`). READ.
- It is consumed for **query routing** (`src/query/sql-query-engine-table-routing-methods.js:389-390,427,464,482-487`)
  and live queries (`src/live-query/live-query-group.js:339,356-361`). READ.
- Initial values are written at table creation
  (`src/query/table-creation-service-create-table.js:196-209`). READ.

Additional decision consumers of this domain, all strict equality (READ,
delegated trace, spot-verified here):
- write-path fence `src/partition/partition-service-entry-apply-base.js:549`
  (`localVersion !== expectedVersion` → `STALE_PARTITION_EPOCH_WRITE`);
- call-cell dispatch fence
  `src/node/runtime-service-call-cell-handler.js:191-198`
  (`current.activePartitionVersion !== Number(fence.activePartitionVersion ?? 1)`
  → `TARGET_STALE`);
- routing visibility, duplicated in three places with the same predicate:
  `src/query/sql-query-engine-table-routing-methods.js:490`,
  `src/live-query/live-query-group.js:344`,
  `src/admin/admin-helpers.js:147`.

Decode inconsistency worth its own finding: the three routing copies silently
reset a missing or invalid value to `DEFAULT_PARTITION_VERSION = 1`
(`src/query/sql-query-engine-shared.js:177`, applied at
`sql-query-engine-table-routing-methods.js:459-468`,
`live-query-group.js:332-343`, `admin-helpers.js:116-126`), while
`resolveLocalActivePartitionVersion`
(`src/partition/partition-service-entry-apply-base.js:176-178`) returns `null`
for the same input. READ (delegated). Two modules disagree about what an absent
partition version means — the same `Number(null) → legitimate value` family as
§4(b). Reported, not repaired.

**Can membership work overlap a split or merge, and what fences that today?**

> **Finding 11 (corrected).** An earlier draft of this document claimed the
> rebalancer contains no reference to the partition-shape domain. **That was
> wrong** and is corrected here rather than removed (the claim, its correction
> and the verification are all recorded).
>
> The move planner *does* have a descriptor-epoch gate:
> `src/rebalancer/move-planner-state-methods.js:480-482` puts
> `descriptorEpochDecision: this.resolvePartitionDescriptorEpochDecision()` on
> the transition snapshot, and `src/rebalancer/move-planner.js:383-387`
> (`isDescriptorEpochRejected`) turns a `REJECT` decision into zero feasible
> placement candidates (`buildDescriptorEpochRejectedDiagnostics`, `:396-411`).
> READ (verified directly in this run).
>
> **But nothing feeds it.** `resolvePartitionDescriptorEpochDecision`
> (`move-planner-state-methods.js:491-524`) asks the move state provider for
> `getPartitionDescriptorEpochDecision`, `getPartitionDescriptorEpochSnapshot`
> or `getPartitionDescriptorEpochEvidence` and returns `null` when none is a
> function. `grep -rn "getPartitionDescriptorEpoch" src` returns **six hits,
> all of them these call sites** — no module in src implements any of the three.
> READ (grep verified directly in this run). So in production the decision is
> `null`, `isDescriptorEpochRejected` is false, and planning proceeds.
>
> The corrected statement: **the interlock exists as an unfed seam, not as a
> fence.** A REPLACE of a replica of partition P and a cutover of P's key range
> can be in flight simultaneously, and the one place that could refuse is
> reading `null`. The coordinator, dispatch gate and executors remain entirely
> unaware (no `partition_transition_state` / `partition_version` reference in
> `src/rebalancer/*.js` outside the two planner files above). Conversely the
> split dissolution issues membership mutations directly (Finding 5).

There IS a fence token in the split/merge domain, but it fences *workflow
ownership*, not membership: `claimWorkflowOwnershipCore`
(`src/partition/managed-workflow-ownership-core.js:63-79`) mints
`currentFence + 1` per fresh claim and renews keep it; consumers refuse with
`STALE_FENCE_TOKEN` (`src/partition/managed-merge-workflow-persistence-methods.js:398,454`).
READ (the mint verified in this run; the consumers via subagent).

**No other second domain is required by a concrete membership semantic that
this reading found.** Specifically:
- The Raft term is not a second membership domain — it fences tenure, and the
  promotion proof already reads it alongside the epoch (§3e).
- `boot_incarnation` is not a second membership domain for the *operation*
  fence — it identifies a node across restarts, which a membership transition
  representation would carry as part of a replica identity rather than as a
  generation.
- The schema/catalog and service-binding generations are unrelated to membership
  (appendix).

---

## 6. Unknowns, and the measurement that would settle each

Each entry states what reading could NOT settle, and the smallest read-only or
existing-test measurement that would.

**U1. How often does the promotion guard's independent epoch read actually
disagree in a live formation?** Finding 10 is a composition of two READ facts,
not a measurement. *Settle by:* the existing local 5-process formation driver
recorded in memory under `lab-formations-and-placement` reproduces the refusal
in ~7 min; counting `LEARNER_PROMOTION_DEFERRED` log lines whose reason is
`epoch_mismatch`/`EPOCH_CHANGED` against the leader's epoch would quantify it
without any code change. Not run here (no clusters, per the brief).

**U2. Can two PUBLISHED rows share `(publication_kind, publication_epoch)` in
practice?** Finding 2 establishes the index is not unique and §4(c) gives a
mechanism; whether a real leadership flap produces it is untested. *Settle by:*
a read-only query over an existing captured formation DB
(`data/` artefacts referenced by the epic's evidence) grouping
`control_plane_publications` by `(publication_kind, publication_epoch)`.

**U3. — SETTLED by reading, see Finding 1.** They are never supplied on the
membership-publication path; the only writer is the formation-release handoff
kind, writing relabelled publication epochs
(`src/control-plane/formation-release-handoff-publication.js:291-292`). One
residual: whether a captured formation DB confirms the columns are NULL for
`cluster_membership` rows in a real run. *Settle by:* the same read-only query
as U2, selecting those two columns grouped by `publication_kind`.

**U4. Is the `resolveMoveMembershipPublicationEpoch` fallback (Finding 6) ever
taken in production?** It fires only when a move reaches the request builder
unbound. The rebalance loop stamps all limited moves (§2 step 2), so the
fallback may be unreachable from the planner — but other move producers exist.
*Settle by:* a static reachability read of every caller of
`applyCoordinatorOperationRequestMutationContext`, or a one-line counter in a
lab run.

**U5. — SETTLED by reading.** `replica_operations` has no sequence column
(`src/bootstrap/system-table-runtime-schema-definitions.js:55-100`). Ordering is
three mechanisms, none of them a counter: (i) `workflow_step` used as a CAS
fence — `UPDATE ... WHERE operation_id = ? AND workflow_step = ?`
(`src/rebalancer/replica-operation-repository.js:196-199`); (ii) `steps_history`
array **length**, with a strict-extension guard that throws
`DURABLE_ROW_NOT_EXTENDED` when a write does not append
(`src/rebalancer/operation-workflow-persistence.js:106-131`); (iii) a
first-terminal-wins guard `... AND completed_at IS NULL`
(`src/rebalancer/replica-operation-repository.js:200-207`). `created_at`
ordering is display-only
(`src/rebalancer/replica-operation-repository.js:185`, consumed by `getStats`).
READ (delegated).

*Residual for the owner decision §5 invariant ("at most one unresolved
membership transition per partition"):* these three give a total order **per
operation row**, not across a partition's operations. Nothing found orders two
concurrent operations on one partition. *Settle by:* reading the in-flight
accounting path (`transitionSnapshot.inventory.accounting`,
`src/rebalancer/move-planner-move-calculation-methods.js:389-390`) to see what,
if anything, serialises them today.

**U6. Does any consumer of the spread-cure evaluation act on
`MEMBERSHIP_FENCE_NOT_EVALUATED`, or is it purely logged?** The count-check
comment says log-only (`partition-service-learner-promotion-count-check-methods.js:249-256`)
and this reading found no other consumer, but the payload builder was read only
around the call site. *Settle by:* reading
`src/partition/learner-promotion-count-check-evidence.js` end to end and
grepping consumers of the built payload.

**U7. Whether `services` rows for one partition can be read as a set with any
consistency guarantee.** Finding 3 says they are independently LWW-merged; what
a planner actually observes (and whether the "unpromoted learner counted as the
3rd holder" shape from the 2026-09-18 causal packet is this) was not re-derived
here. *Settle by:* re-reading the placement inventory's read path against the
cache merge semantics — a pure reading task, no run needed.

**U8. Whether the `control_plane_publications` leadership predicate can be true
on two nodes at once.** §4(c)+(d) depend on it. *Settle by:* reading
`resolveControlPlanePublicationsLeadership` and its leadership source; not read
in this run.

---

## Appendix — PARTIAL material from the broader census (superseded scope)

**This appendix is explicitly incomplete.** It records what the repository-wide
version/epoch census had established before the scope was narrowed, plus the
four delegated read-only traces that returned after the narrowing (raft,
topology/partition-shape, readiness/lease/planning, ledger/sequence/fence). It
is **not** a closed domain census: it did not trace the 32 unresolved tokens of
the historical inventory — that work was stopped by the narrowing and was not
resumed — and several values listed here were classified without reading every
consumer. It must not be cited as a complete inventory.

Entries marked "(delegated)" were established by a subagent trace that reported
file:line citations and its own READ/INFERRED marks. Where a delegated claim
bore on sections 1–6 it was re-verified directly in this run before being used
there; delegated claims that remain only in this appendix were not
independently re-verified. One delegated result contradicted a claim in an
earlier draft of §5; that claim was verified, found wrong, and corrected in
place with the correction recorded (Finding 11).

### A1. Durable version-like columns found in the system-table schemas

READ, from `src/bootstrap/system-table-{core,runtime,workflow}-schema-definitions.js`:

- membership / topology / placement
  - `control_plane_publications.publication_epoch` (runtime:22),
    `.source_topology_epoch` (runtime:24), `.source_snapshot_version` (runtime:25)
  - `replica_operations.membership_publication_epoch` (runtime:63)
  - `tables.active_partition_version` (core:28), `.pending_partition_version`
    (core:33), `.partition_transition_state` (core:34)
  - `partitions.partition_version` (core:57)
  - `nodes.boot_incarnation` (core:141), `.ready_lease_expires_at` (core:142),
    `.last_heartbeat` (core:137)
- not membership-related (named here only so a later census need not re-find them)
  - `sql_transactions.transaction_epoch` (workflow:20)
  - `schema_operations.record_version` (workflow:113), `.row_version`
    (workflow:114), `.intent_version` (workflow:129), `.schema_revision`
    (workflow:131)
  - `debug_snapshots.format_version` (workflow:306)
  - `service_bindings.generation` (runtime:309) with unique index
    `(binding_id, generation)` (runtime:320-324)
  - `service_packages.manifest_schema_version` (runtime:343)
  - `code.version` (core:357)
  - `module_manifests.version` (runtime:443)

### A2. In-memory increment sites found by a repository-wide grep

READ (the grep and the listed lines). This is the complete result of the pattern
`*(Version|Generation|Epoch|Revision|Incarnation|Term|Sequence|Watermark) (++ | += 1 | = X + 1)`
over `src/`, 30 sites. It is NOT the complete set of generation writers — values
derived from a clock, a digest, or a table read are not matched by it. Verdicts
below came from the delegated traces and are marked as such.

*Not membership generations (internal counters with no cross-module decision
consumer):*
- `src/rebalancer/operation-workflow-owner-retry-registry.js:146,168-185`
  (`operationOwnershipFenceEpoch`) — bumped from exactly one call site,
  graceful shutdown (`src/rebalancer/rebalance-coordinator.js:216-227`); read
  by `src/rebalancer/operation-workflow-owner-execution-lane.js:280-298`
  (`!==` → stand down). In-memory, per process. An AbortController generation
  in effect. READ (delegated).
- `src/control-plane/membership-swim-prober.js:171,181,187` (`_generation`) —
  read only at `:199,209` in the same file; no external reader. READ (delegated).
- `src/control-plane/node-liveness-semantic-projection-owner.js:287,300,343` and
  `src/rebalancer/storage-capacity-semantic-projection-owner.js:450,458,494,551`
  — reentrancy and timer-cancellation guards; zero readers outside their own
  files. READ (delegated).
- `src/partition/partition-cdc-delivery.js:425-452` (`cdcSubscriptionEpoch`) —
  stamped onto subscriber state and events, **never compared anywhere**. READ
  (delegated).
- `src/query/distributed/distributed-transaction-coordinator.js:110-118`
  (`nextEpoch`) → `sql_transactions.transaction_epoch` — an MVCC
  snapshot-isolation epoch consumed by
  `src/partition/partition-service-transaction-base.js:198-221,245-257,265-289`.
  Unrelated to membership. Note it seeds from `this.now()` at construction and
  no recovery read of `MAX(transaction_epoch)` was found, so it is not
  restart-stable (READ + INFERRED, delegated).
- `src/bootstrap/bootstrap-api-admission-methods.js:87-108`
  (`bootstrapAdmissionSequence`) — used only to build a unique `admissionId`
  string; value never compared. READ (delegated).
- `src/query/execution-context.js:303,450`,
  `src/runtime/oci-host-agent-receipt-ledger.js:316,328`,
  `src/runtime/wasi-component-cell-runtime.js:234`,
  `src/service/service-installation-reconciler.js:107,114,157`,
  `src/admin/admin-cache-owner-state.js:28`,
  `src/control-plane/control-plane-diagnostics-ledger.js:48`,
  `src/bootstrap/rejoin-hints.js:219`,
  `src/cli/core/base-view-model.js:153` — not traced to a membership decision
  in this run.
- `src/topology/topology-anti-entropy-reconciler.js:101,190,193` (`scanSequence`)
  — a per-process reconciler-pass tally used only to build a human-readable
  `scanId` for logs; never compared. An exhaustive grep of `src/topology/`
  found **no other version/generation/epoch/revision identifier in that whole
  directory**. READ (delegated).

*Real, live, but not a membership-operation fence:*
- `src/control-plane/membership-swim-detector.js:98,290-298,317-319`
  (`_selfIncarnation` / `entry.incarnation`) — the SWIM liveness-dispute
  counter, in-memory, reset to its minimum every boot. A **different domain**
  from `nodes.boot_incarnation` (§1.5), which is durable and cross-restart,
  despite the shared word. READ (delegated).

*Resolved non-finding (this was flagged as a possible R01 and is not one):*
- `src/control-plane/control-plane-readiness-participation-base.js:516` and
  `src/control-plane/control-plane-readiness-snapshot-store.js:549` both
  increment `membershipPublicationPlanningSourceRevision`. They are **one field
  on one object**: the field is declared at
  `control-plane-readiness-participation-base.js:174`, and the snapshot-store
  methods are installed onto the same prototype chain by
  `installControlPlaneReadinessSnapshotStoreMethods`
  (`src/control-plane/control-plane-readiness-snapshot-store.js:691-698`,
  called from `src/control-plane/control-plane-readiness-diagnostics-eligibility.js:693-695`).
  Two methods, two events — cache swap vs per-table mutation — one counter.
  READ (delegated). **Not an R01 finding.**

*Dead code (reported for its owner, R17):*
- `src/control-plane/publication-recovery-evidence.js:22-42`
  (`TopologyEpochFencer`, `advanceEpoch`, `assertEpochValid`) has **no
  production caller**; the only other reference in the repository is a unit
  test. The same file's `adjudicateRecoveryPreemption` (`:74-93`) computes
  `hasEpochMismatch = localEpoch < globalEpoch` from fields no production
  caller supplies (`:145-146` default both to 0), and no module reads the
  resulting `preemptionAdjudication`. READ (delegated).
- `src/control-plane/projection-readiness-evidence-owner.js:202`
  (`invalidateNode`) has no call site in src. READ (delegated).

### A3. A dormant epoch domain the historical inventory did not name

`src/rebalancer/assignment-epoch-manager.js` declares itself the "Single Epoch
Authority" for **assignment epochs** — partition→node assignments versioned by
a CAS'd integer, durable as the `config.current_epoch` row, propagated by CDC
(`:1-26`, `:97-124`). READ.

> **PARTIAL finding.** It never advances in production. `proposeEpoch`
> (`:220-278`) and `proposeEpochWithRetry` (`:279-...`) have **no caller
> anywhere in src** (grep: the only external hit is
> `src/cdc/cdc-event-handler.js:229`, which calls `applyEpoch`). READ. The
> durable row is written once, if missing, at seed registration with the
> initial epoch
> (`src/bootstrap/phases/seed-registration-phase.js:560-600`), and the manager
> is initialised at epoch 0 when no persisted row is found
> (`src/bootstrap/phases/seed-partitions-phase.js:591-637`). `applyEpoch` only
> accepts strictly newer epochs (`:383-400`). READ.
>
> So a second, self-declared authority over partition placement generations
> exists, is wired end to end, and never advances. Reported for its owner
> (R17), not repaired. It is *not* a candidate for the membership-operation
> fence, because nothing advances it.
>
> It is, however, **read**: it is surfaced at join time as
> `topologySnapshotMeta.topologyEpoch` via
> `src/bootstrap/bootstrap-topology-snapshot.js:11-21,76-79`
> (`resolvePublishedTopologyEpoch`) and
> `src/bootstrap/owners/bootstrap-request-owner-handler.js:517-521`. READ
> (delegated). **Name collision worth recording:** this `topologyEpoch` (real
> value, permanently 0) and `sourceTopologyEpoch` (the publication column,
> permanently null — Finding 1) are two different concepts sharing a
> vocabulary, and neither is ever wired to the other; a delegated trace of every
> `topologySnapshotMeta` / `bootstrapResponse.currentEpoch` consumer confirmed
> no path from one to the other. `tableVersion`, `shapeVersion`,
> `topologyVersion` and `topologyGeneration` return **zero hits in src** — those
> spellings do not exist. READ (delegated).

### A4. Other ordering values touched but not closed

- `updated_at_hlc` — a per-row causal version stamped by the CDC generator onto
  the row payload and used by the cache as the authoritative staleness order
  (`src/cache/system-table-cache-row-merge.js:38-74`); **never persisted**
  (`src/partition/partition-cdc-generator.js:233-256`). READ.
- `compareSchemaVersions` (`src/cache/system-table-cache-row-merge.js:225-247`)
  — orders by HLC, else by number, else by string locale compare. A three-way
  fallback on one comparison. READ; its callers were not traced.
- Raft `committedIndex` — durable and explicitly monotonic-clamped
  (`src/raft/sqlite-log-adapter.js:700-728`); `lastApplied` is a separate
  durable watermark (`src/partition/partition-raft-storage.js:190-199`) whose
  public getter currently returns the *committed* index instead
  (`:158-160`) — a naming trap worth a finding of its own. READ (subagent).
- Snapshot `lastIncludedIndex` / `lastIncludedTerm`, aliased as
  `generationIndex` (`src/raft/snapshot-catchup.js:219,376`), with a
  `membershipEpoch >= ` staleness rule in the checkpoint identity rules
  (`src/raft/snapshot-checkpoint-format.js:149-172`). READ (subagent).
- `clusterIncarnationFence` — resolved from the local data dir at startup
  (`src/lagrange-runtime-startup.js:123-130`) and carried on the publication
  snapshot (`src/control-plane/active-node-publication-snapshots.js:714-726`);
  a join-admission construct, not an operation fence. READ, not closed.

### A5. The readiness / planning generation family (delegated, READ)

Not membership-operation fences, but they gate whether the planner runs at all,
so they bound how fresh C1 can be at mint time.

- **Per-node projection-readiness generation** — a **content digest**, not a
  counter: eight ordered segments joined with a unit separator
  (`src/control-plane/projection-readiness-evidence-generation.js:90-99,418-421,446,461-464`),
  minted at
  `src/control-plane/control-plane-readiness-diagnostics-eligibility.js:342-359`,
  memoised per node in an in-memory Map by the owner
  (`src/control-plane/projection-readiness-evidence-owner.js:95,145,153`),
  compared with `===` only. Dropped wholesale on cache swap
  (`control-plane-readiness-participation-base.js:518`) and lifecycle reset
  (`control-plane-readiness-lifecycle.js:34`). It can repeat — same content,
  same key — so it is not an ordering.
- **The real planning generation** — `readMembershipPlanningDerivationVersionKey`
  (`src/control-plane/membership-planning-version-key.js:13-20,43,52-65`):
  a concatenation of six tables' mutation versions, **latched for 250 ms**
  (`MEMBERSHIP_PLANNING_VERSION_KEY_REFRESH_FLOOR_MS`, `:32`), stored in a
  WeakMap keyed by the cache object (`:33,51,66`). Consumed with `===` by
  `control-plane-readiness-publication-planning-snapshot.js:392-410` and
  `control-plane-readiness-publication-planning-resolution.js:434-465`.
- **The stale grace** — `isReadinessPlanningMemoWithinStaleGrace`
  (`control-plane-readiness-publication-planning-snapshot.js:242-251`), a
  wall-clock `<=` against `membershipPublicationPlanningActiveStaleGraceMs`,
  default 15 s (`src/control-plane/priority-recovery-admission-constants.js:52`).
  The two compose: a version key may be reused for 250 ms, and a projection
  built from it for up to 15 s.
- **`membershipPublicationPlanningSourceRevision`** is only the `??` fallback
  when the floored key is unavailable
  (`control-plane-readiness-publication-planning-snapshot.js:377-382`).

> **Bearing on the fence.** The epoch the planner stamps (§2) is read through
> this memo stack, so the mint can observe a membership view up to ~15 s old
> while the operation it authorises executes later still. That is an additional
> temporal gap on top of the reader divergence in §3.1, and it is orthogonal to
> both.

### A6. The node readiness lease has no generation

`nodes.ready_lease_expires_at` is an absolute wall-clock expiry, re-minted on
every heartbeat as `now + readyLeaseMs`
(`src/control-plane/heartbeat-service-publication-methods.js:126-129`). There is
**no lease generation or epoch number anywhere** — only the timestamp. READ
(delegated). Decisions: `isNodeRecordReady`
(`src/node/node-readiness-policy.js:151-169`, `leaseExpiry <= now` → not ready),
`wasNodeRecordReadyWhenWritten` (`:181-206`), and the explicitly-revoked state
`isNodeReadyLeaseExplicitlyCleared` (`:222-239`) — a named third state
distinguishing "cleared by the owner" from "expired".

The blocker reason `node_ready_lease_incomplete`
(`src/rebalancer/unified-rebalancer-shared.js:203`) is produced at
`src/rebalancer/unified-rebalancer-critical-topology-methods.js:163` when any
ACTIVE node classifies as unready — and that classification runs primarily
through `getNodeReadinessSync` (the content-digest path above), not the raw
lease column. READ (delegated). The name therefore points at the lease while
the mechanism is the readiness projection.

### A7. Wall-clock staleness as a placement decision key

Several real placement/readiness decisions compare wall-clock timestamps, none
using the HLC (READ, delegated): the two planning stale-grace gates above;
`src/rebalancer/priority-publication-safety-topology.js:298-301,344-347,394-397`
(leader-handoff evidence discarded after `STALE_AFTER_MS`);
`src/rebalancer/rebalance-coordinator-priority-budget-helper.js:363-379`
(stuck-step timeout); `src/rebalancer/replica-operation-topology-drain.js:9-70`
with `src/rebalancer/unified-rebalancer-topology-drain-methods.js:11-30`
(`candidate.drainedAtMs > latestDrain.drainedAtMs` → a cluster-wide drain
watermark consumed by planning); `src/rebalancer/replica-inventory.js:483-505`
(observed-at skew gate); and the operation owner lease
(`src/rebalancer/replica-operation-owner-lease.js:66-84,102-124`,
TTL 30 s at `:40`, expiry anchored to `operation.updatedAt` at `:138-144`).

The HLC itself (`src/hlc/hlc-clock-service.js:23-79`, per partition, warmed
from durable witnesses at `src/partition/partition-hlc-warmup.js:1-49`) has
**no membership or placement consumer**: outside `src/hlc/`, the only
`compare`/`isBefore`/`isAfter` call site is that warm-up. READ (delegated).

### A8. Schema and catalog versions — none membership-related

`schema_operations.record_version` and `.intent_version` are hardcoded `1`
constants (`src/query/schema-provisioning-job-constants.js:1-2`);
`.schema_revision` is written once as `1`
(`src/query/schema-provisioning-job-owner.js:96`) and never read; `code.version`
is a reserved, unimplemented schema
(`src/bootstrap/system-table-core-schema-definitions.js:347-369`). The one real
counter is `.row_version`, a local optimistic-concurrency CAS token for the
schema-provisioning job row
(`src/query/schema-provisioning-job-repository.js:143-153,224-250`). READ
(delegated).

One membership-adjacent exception: the join schema-version resolver
(`src/bootstrap/join-schema-version-resolver.js:43-112`) compares per-table
version strings (HLC-formatted, else numeric, else lexicographic) and a lag
produces `SCHEMA_VERSION_LAG`, which gates whether a joining node may be
promoted into active membership
(`src/bootstrap/join-readiness-evaluation-tail-methods.js:59-111`). READ
(delegated). It is a readiness precondition, not a generation.
