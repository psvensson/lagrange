# Final query proof schedule audit V1

Status: read-only owner and witness-design audit. No source, test, fixture,
Quest, registry, metadata, or lab input was changed or run. This report is the
only file written by this audit. In particular, the active edits to
`test/partition/partition-admitted-group-fixture.js` and
`test/partition/partition-release-fixture.js` were not read or modified.

## Binding

- Inspected HEAD: `77e091f64fb711fbc5ca40a7915ae85f01a5cf4e`.
- Production diff at inspection: empty; `git diff -- src | sha256sum` was
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- Matrix V2 remains
  `61cffd528a15ff0b9df5b416ab235110ddbe9425b294cbcf9e4f0446a45c3054`.
- Main owner hashes: cutover
  `36b24096246f4c57f11c4238ebd4847276eb0f802b82d7aa56acd347303a57c3`;
  release settlement
  `655972f973a035fed24a248d256eeba2b21c47a3836519c59d251bcdd2b9af08`;
  query census
  `856975fe935972ce9b8418c82c2f987a1cf8bf6b19eba672ab06f2000fb1e4ec`;
  schema enforcement
  `4ea083759a78891e169493f98d738a22d8570934453dd2b5a0dd0f3fd37e7d76`;
  fixed settlement state machine
  `2ab98f65e566a79718c7ace808fbfe60343d5c13a9e41e7e04bcf10bff05fda3`.

## Verdict

The V2 proposal of an already-accepted coordinator-row mutation that first
becomes effective after the pre-ENABLE proof is **not a reachable current-owner
schedule under the stated unchanged term, cohort, and PAUSE**. It must not be
fabricated with a direct SQLite update, a copied census, or a test-only
settlement hook.

There are two narrower, reachable facts:

1. ENABLE itself may change the query census by atomically installing or
   repairing the coordinator schema enforcer. The fresh final census and proof
   rebuild are therefore load-bearing even though no new transaction work is
   admitted.
2. The sole query-row operation intentionally admitted during PAUSE is a fixed
   coordinator settlement. Once the pre-ENABLE release proof exists, every row
   it names is terminal. A later canonical fixed command for that row can only
   replay or refuse; it cannot change row lineage, decision, terminal status,
   or the proof's row-generation digest.

The sealed final-query obligation should be discharged with an actual-owner
positive schedule that compares the real ENABLE proof with the real RESUME
proof and issues one terminal fixed-command replay while the new applied-
position observation is held. That proves the reachable post-proof query
interaction and the final proof rebuild without inventing accepted work.

## Owner ordering and exclusion of a hidden mutation

The release owner pauses the cohort, reads a complete census, rejects any
non-drained work, settles the SQL-transactions rows, rereads the cohort, and
builds the invocation proof before the pre-ENABLE full classifier
(`src/node/replica-handler-participant-cutover.js:229-278`). ENABLE is then
awaited, followed by a fresh cohort read and a proof rebuilt from the retained
per-transaction results and the fresh query census (`:279-297`). The final
control check and guarded RESUME occur only afterward (`:298-304`).

The census is not a cached row count. It reads every `sql_transactions` row,
canonicalizes every column, hashes those rows, and classifies every identity as
recoverable or legacy
(`src/query/distributed/distributed-transaction-release-census.js:29-58`). The
proof binds the release ID, current attempt term and leader, schema and semantic
versions, exact row-generation digest, transaction order, decisions, terminal
statuses, and participant identities
(`src/query/distributed/distributed-transaction-release-settlement.js:222-239`;
`src/partition/partition-participant-release-contract.js:36-51`).

Three admission paths cover every possible writer:

- **Ordinary query/coordinator persistence writes.** `executeQuery` constructs
  and admits the statement synchronously before calling `proposeWrite`
  (`src/partition/partition-service-write-metrics-base.js:60-130`). The write
  path checks the canonical PAUSE owner at the proposal boundary
  (`src/partition/partition-service-raft-write-commit.js:428-457`). If the check
  happened before PAUSE, `startPartitionRaftWriteCommit` registers the pending
  outcome synchronously before its asynchronous execution (`:460-474`), so the
  next release facts expose it. If PAUSE happened first, no proposal is made.
  A settled redelivery can bypass admission only to return its retained answer;
  it performs no mutation
  (`src/partition/partition-service-write-metrics-base.js:87-93,659-669`).

- **Participant work.** A new BEGIN checks PAUSE before opening a session
  (`src/partition/partition-participant-transaction-request.js:258-319`). An
  existing session is deliberately allowed to finish, but the session owner is
  visible as `participantStaging`, and PREPARE marks the session PREPARING
  before awaiting its proposal (`:333-387`; session state owner
  `src/partition/partition-participant-transaction-session.js:27-67,117-128`).
  The release facts reject staging, PREPARED custody, proposals, pending
  outcomes, or unequal applied/commit/last positions
  (`src/partition/partition-participant-release-facts.js:46-65`). The current
  behavior is measured at
  `test/partition/partition-participant-release-admission.test.js:51-62`.

- **Fixed coordinator settlement.** Removal/serving admission deliberately
  permits this exact type so an existing transaction owner can finish
  (`src/partition/partition-service-entry-apply-base.js:310-328,357-375`). Its
  request owner first checks leadership and canonical committed-command
  admission, reuses a settled or pending answer, validates the current row, and
  registers a Raft write only for READY (`src/partition/partition-coordinator-
  settlement.js:47-70`). FREEZE can only change OPEN to FROZEN; DECIDE can only
  create ROLLBACK when no decision exists; PROGRESS must match the recorded
  decision; a terminal row returns REPLAYED
  (`src/query/distributed/distributed-transaction-settlement.js:143-183`). The
  CAS binds exact identity, participant set, frozen state, and decision fields
  (`:197-221`). The release settlement owner does not return a transaction
  result until freeze, decision, participant delivery, terminal progress, and
  authoritative readback all agree (`src/query/distributed/distributed-
  transaction-release-settlement.js:118-139,149-203`). Thus a valid proof
  implies this owner has no remaining row transition.

The fixed command bytes also have a deterministic digest-derived entry ID
(`src/query/distributed/distributed-transaction-settlement.js:122-128` and
`src/partition/partition-coordinator-settlement-command.js:9-29`). A retry of
the exact command joins/returns its one retained outcome; an incompatible
command is refused. Existing actual-PartitionService coverage proves closed
ordinary admission plus fixed freeze/rollback and exact replay at
`test/partition/partition-coordinator-settlement.test.js:55-80`, rejects a new
COMMIT before consensus at `:82-97`, and proves CAS conflict rather than lineage
rewrite at `:99-113`.

There is therefore no asynchronous gap in which a canonical ordinary or
participant request can become newly accepted yet stay absent from the
pre-ENABLE work/census. The only admitted special writer is terminal by proof
or becomes an observed pending/proposal defect before ENABLE.

## Reachable query changes and existing coverage

| Reachable transition | Owner result | Existing evidence / remaining need |
| --- | --- | --- |
| First origin or repair installs the coordinator enforcer | Generation-origin apply installs the fixed enforcer in the same application transaction (`src/partition/partition-participant-transaction-apply.js:549-579`; schema owner `src/query/distributed/distributed-transaction-schema-enforcement.js:107-125`). With held rows the required columns must already exist because missing columns plus nonempty rows are refused at `:112-114`; installing a missing trigger changes enforcement evidence, not row lineage. | `test/partition/participant-release-protocol.test.js:302-325` proves install and repair with unchanged durable origin, but on an empty census. The new proof-carrying case below covers the HELD proof path. |
| Actual accepted ordinary write or participant custody exists | The canonical work tuple is non-drained and release stops before query settlement/ENABLE. | Actual pending SQL proposal and later settlement are covered at `participant-release-protocol.test.js:354-493`; participant session/apply behavior is covered at `partition-participant-release-admission.test.js:51-62`. The separately owned native same-promise witness owns follower application lag; this audit does not duplicate it. |
| Query settlement cannot finish | `settleQueryRelease` returns null and release answers `QUERY_DRAIN_PENDING` before ENABLE (`replica-handler-participant-cutover.js:266-273`). | Unreconstructible rows are covered at `participant-release-protocol.test.js:327-352`; freeze/rollback/fanout/proof and unexpired/legacy refusal are covered at `test/query/transaction-release-settlement.test.js:61-114`. |
| Term, configuration, lifecycle generation, service identity, or handler lifecycle changes after an await | The exact attempt/generation checks return STALE/UNAVAILABLE and admission stays CLOSED; this is not a query-census mutation. | Handler/service shutdown and service replacement are covered at `test/node/replica-handler-release-recovery.test.js:215-286,668-698`; the applied-position matrix V2 retains the focused post-await term/configuration/generation cases. |
| Existing origin with a complete, enforced schema and terminal rows | ENABLE is an idempotent success (`partition-participant-transaction-request.js:690-726`); the final query census and rebuilt proof should be identical. | This is the smallest normal positive schedule below. |

## Smallest honest final-query witness

Place one added case beside the existing registered participant release protocol
tests. Reuse their real `PartitionService`, `ReplicaHandler`, registered release
route, and controllable consensus owner. Add the existing production
`ControlPlaneSystemTableGateway`/`SQLQueryEngine` composition pattern already
used for routed real partitions at
`test/query/unknown-outcome-surface-fixture.js:240-284`; do not add a query
classifier, direct database gateway, or copied settlement algorithm.

1. Release the empty SQL-transactions service once through the actual operator
   route. This installs origin/enforcement and opens current admission.
2. Through the real `SQLQueryEngine` coordinator and production control-plane
   gateway, BEGIN a zero-participant transaction. Advance the owner clock past
   its recorded deadline. This creates the row through the one persistence
   owner; there is no raw seed or participant double.
3. Start a second registered release. It raises PAUSE, settles that expired OPEN
   row through canonical FREEZE, ROLLBACK, zero-participant fanout, terminal
   PROGRESS, authoritative reread, and builds the pre-ENABLE proof. Passively
   record the actual ENABLE route request and its `queryDrainProof`.
4. Hold the **new OBSERVE_APPLIED_POSITION delivery boundary** after ENABLE has
   answered, using the separately reviewed observation seam. This is the first
   point that proves the pre-ENABLE settlement/proof and ENABLE are complete;
   no fixed wait or private helper signal is sufficient.
5. While OBSERVE is held, send one canonical terminal PROGRESS settlement for
   the stored row through `service.handleApplicationMessage` using the actual
   fixed-settlement request type and row decision digest. Require REPLAYED,
   zero new proposal/pending outcome, unchanged row-generation digest, same
   term/cohort/generations, and CLOSED admission. This is legitimate work the
   PAUSE contract admits, and it proves that post-proof query traffic cannot
   mutate the proof basis.
6. Release OBSERVE. Passively record the actual RESUME request. Require its
   rebuilt `queryDrainProof` to have the same release/attempt identity,
   row-generation digest, ordered terminal transaction result, and participant
   list as ENABLE's proof. Require the normal final classifier/control check,
   RESUMED/CUT_OVER, and no spent bound.

This case is stronger and smaller than trying to retain a proposal after the
proof: any real proposal retained there would contradict the pre-ENABLE full
census. It also distinguishes final-proof execution from unit-only proof
construction. Reverting the future application-position repair may still fail
earlier at its intended application-lag red, so this control should be assessed
as a preservation witness, not the primary source-revert falsifier.

An optional paired repair-state case may use the already-established actual
schema-repair precondition (missing trigger, not a post-drain row edit) and
prove ENABLE changes enforcement from REQUIRED to ENFORCED while the held row
digest and terminal result stay fixed. It is not needed if the existing
install/repair test plus the normal held-proof schedule are both retained.

## Explicitly rejected schedules

- Directly updating/inserting/deleting `sql_transactions` after the proof.
- Replacing `settleTransactionReleaseRows`, `readTransactionReleaseCensus`, or
  `releaseCensusDefect` with a test double.
- Holding a fixed settlement proposal before the pre-ENABLE census and then
  claiming it first became accepted later; its proposal/pending outcome must
  already make the census non-drained.
- Opening a participant session after PAUSE, or hiding an existing session from
  `participantStaging`/PREPARED custody.
- Treating term/generation loss or origin schema installation as a transaction
  row race. They are separate reachable owner transitions with their own typed
  outcomes and witnesses.

## Conclusion

The V2 final-query gap is real as a **whole release-path proof-carrying
preservation witness**, but its proposed mutable-row race is not reachable
through current owners. Keep the sealed obligation explicit and satisfy it with
the terminal fixed-command replay schedule above, plus the existing schema
install, query-refusal, accepted-work, and lifecycle controls. No production
query/release behavior or classifier change is justified by this audit.
