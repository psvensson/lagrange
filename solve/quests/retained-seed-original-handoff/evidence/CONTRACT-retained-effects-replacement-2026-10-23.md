---
audience: development
documentClass: evidence
---

# Replacement retained-effect classification: design for independent review

This is new work from f5fb317bebc3dc074f3d8d4102122ba4ddb94ecc, whose
production/test ancestry is the verified bcba7d2a/d7ef793b checkpoint. It is
not recovered feefa272 source. The current steering read for this continuation
is origin/main 240dfaaac22402f5ba8f80dbe5df520e8a450644 (2026-10-22 rules).
The original Quest seal, eight receipts and R1/R2 requirements are unchanged.

## Claim and boundary

Implement the read-only correspondence between retained original commands,
their original producers and already-applied application facts. This is an
observation increment, not permission to resume public startup. Both
CLASSIFICATION_UNAVAILABLE in startup and CONTINUATION_UNAVAILABLE before
registration remain until the remaining R1/R2 consumers are composed and
proved. No protected activation, service/cluster publication, transition
workers, public ingress or cleanup behavior is opened by this increment.

The observer returns ACCEPTED, CONTRARY or UNAVAILABLE with the exact member,
native frontiers, classified entries and retained obligations. ACCEPTED means
only that this member's observed effects match the bounded original extent;
it is not an opening capability, serving grant or acknowledgment. The
preparation owner alone may eventually consume an assessment, under its
existing complete-cohort and final-construction checks.

## Consumed surfaces

- `src/raft/raft-rs-durable-store.js` / `readRetainedHistoryIn` owns the native
  snapshot and exact APPLIED / COMMITTED_PENDING / LOCAL_UNCOMMITTED ranges.
- `src/partition/partition-participant-transaction-store.js:182` owns the
  read-only origin/history transaction. Extend this owner with an in-snapshot
  read so one application observation includes native history, origin,
  participant rows, statement outcomes and source obligations. No open hook,
  migrations or repair run during observation.
- `src/bootstrap/phases/seed-registration-phase.js:170` and `:379` own
  MESSAGE_GROUPS, TABLES and PARTITIONS foundation production. Extract those
  row constructors, preserving ordinary behavior. Original work pins their
  timestamp to declaration.declaredAt, minted before native effects. The
  classifier consumes these constructors, not copied row literals.
- `src/cdc/cdc-system-table-mutation-sql-helpers.js:11` owns canonical mutation
  construction. Expose the complete upsert SQL/parameters and use it from
  both the existing CDC mutation producer and the classifier.
- `src/bootstrap/system-table-schema-sql.js:8` owns CREATE TABLE / INDEX SQL.
  Only its exact schema commands are eligible; no SQL parser or permissive
  query-kind allowlist grants permission.
- `src/partition/partition-service-entry-apply-base.js:622` owns statement
  deduplication, durable outcome, CDC capture and generation advancement.
  `partition-committed-statement-outcome.js:109` owns outcome reads. Extend
  these owners with exact read-only census/identity functions; the classifier
  must not invent another dedup rule or normalize unsafe native positions.
- `src/partition/partition-cdc-obligation-ledger.js:83` owns obligation rows
  and its pinned acknowledgment decoder. Add exact read-only observation to
  that owner; retain owed and delivered rows, including their complete keys,
  positions, payloads and acknowledgment positions.
- `src/message-group/message-group-committed-command-admission.js:38` owns
  committed MG command interpretation. Add a strict retained-event observation
  there; ordinary type admission remains its existing contract.
- `src/partition/partition-cdc-obligation-delivery.js:170` supplies source
  eventKey, entryId, logIndex and ordinal. However,
  `message-group-service-cdc-propagation-runtime-methods.js:251` and single
  CDC command construction in `message-group-service-cdc-replication-runtime-methods.js:220`
  drop source-occurrence identity. Existing MG event content cannot establish
  delivery of a specific source occurrence.

## Classification rules and typed failure edges

1. Native no-ops and participant origin remain with their current owners.
   Canonical original ENABLE is eligible in every retained range. Invalid
   native bytes or contradictory origin are CONTRARY; missing observations,
   incomplete snapshot coverage and uninterpreted configuration history are
   UNAVAILABLE. Positions remain decimal strings / BigInt comparisons.
2. SQL must equal an exact canonical foundation upsert or the member's schema
   producer, with exact parameters. Bind table/group, original row primary
   key, immutable creation stamp, node and schema. Noncanonical statements,
   extra command effects, sessions, transaction commands, mutations of other
   rows and transition work are CONTRARY, regardless of command type.
3. Original SERVICES and cluster CONFIG rights are still all UNUSED in the
   cold extent. Any corresponding retained publication is CONTRARY. Other
   phaseRegistration writers (meta definitions/endpoints, size updates,
   dynamic config, epochs) are not inferred inert: their commands or durable
   rows are CONTRARY in this bounded pre-publication extent.
4. Observe application rows through the existing partition/schema owner.
   Empty original rows may be legitimate before their first application.
   Nonempty foundation rows must have exact producer identity and agree with
   applied permitted commands; absent-after-applied, extra, changed or
   transitioning rows are CONTRARY. Missing required schema/owner tables is
   UNAVAILABLE. Never execute retained SQL to find out what it would do.
5. Bind every applied statement to its first durable outcome at exact index
   and term; repeated entry identities must describe the same effect. Reject
   stray outcomes, failed/nonoriginal outcomes and missing applied outcomes.
   Require participant transaction census to be empty and generation to
   correspond to the existing apply owner's successful distinct effects and
   canonical origin behavior. A recognized ENABLE never hides other work.
6. Source CDC observations retain full obligation identity. Bind each source
   event to the permitted applied statement and exact source position, using
   the existing generator's canonical event construction. Preserve both owed
   and delivered debt; no observer mutates flags, applies an ACK or deletes a
   row. A pending ACK must use the ledger owner's exact pinned groups and
   refer to known obligations; unknown or mismatching events are CONTRARY.
7. MG CDC/BATCH is observed strictly without filtering malformed members or
   inventing timestamps. MESSAGE, ACK, malformed batches, foreign rows and
   transition content are CONTRARY. Exact original row content can be
   reported as matching, but cannot confer source-occurrence authority.
   A missing source-occurrence binding is UNAVAILABLE, with the events and
   source debt preserved. This gap is an explicit remaining interaction,
   not an invented empty ledger or content-based acknowledgment. Resolving
   it requires an independently reviewed producer-to-recipient identity
   change and cross-member proof before full classification is claimed.
8. Unreadable state yields UNAVAILABLE; contradictory readable state yields
   CONTRARY. Both block original opening. No wait, retry, timer or deadline
   changes are introduced. Reassessment re-reads actual durable owners.

## Cached-view audit

No cache, live service registry, local query engine replay, memoized approval
or new ledger is introduced. Each assessment reads one SQLite snapshot. The
original declaration is immutable input verified by the preparation/catalog
owners. Extracted foundation producers are pure constructors. Any future
cohort aggregation must revalidate exact native/application observations at
the existing final native construction cut; this increment does not claim
cross-database atomicity.

## Identity anchoring and obligation ownership

The declaration pins allocationId, nodeId, buildDigest, catalogDigest,
declaredAt and member groupId/replicaId/incarnation/membership/createdAt/token.
The native owner pins term/index and all three ranges. Applied outcome identity
and CDC event identity come from their existing stores. Foundation identity
comes from the same producer invoked by registration. Native replay remains
the normal application transaction's work. Source delivery/acknowledgment
remains the existing CDC owner's work. An observation cannot discharge either.

## Evidence required

Use real SQLite/native histories with legitimate original ENABLE and foundation
work in applied, committed-pending and local-uncommitted ranges. Prove the
read-only inspector leaves database bytes/rows/frontiers and CDC flags intact,
and pending work replays through the existing application owner. Preserve a
same-fixture discriminator for altered SQL, parameters, row identity,
publication rights, participant rows, outcomes, origin/generation and CDC
obligations. MG positives must distinguish content correspondence from exact
source delivery; content-only must remain UNAVAILABLE. Re-run the existing
retained-history/opening/lifetime cone with the new tests on a locked lab
worker, then exact-candidate metadata/static checks. Full startup and the
eight receipts stay red until the full composed witness engages.

## Related-system and project evidence

The R1/R2 independent correction review already rejected type-only admission,
commit==applied admission and ordinary role/resumer side effects. The completed
RF3 witness's ordered-voter comparison failure was repaired at its actual
test consumer by using raftRsConfStateKey, not by changing native authority.
The preserved statement replay contract answers from the original outcome,
and CDC delivery retains exact event keys across lost answers.

External references consulted on 2026-10-23:
- https://docs.rs/raft/latest/raft/ (persisted/applied progress and ordinary replay)
- https://github.com/etcd-io/raft/blob/main/doc.go (ordered append/apply obligations)
- https://debezium.io/documentation/faq/ (restart from recorded source offsets)

These inform the analysis; the repository's approved owners and sealed
acceptance remain authoritative. No external algorithm is transplanted here.

## Independent-review corrections, 2026-10-23

These clarify rules 4 and 6 without broadening the observation claim.

The source obligation census is bidirectional. Every distinct applied
event-producing statement must have exactly its canonical obligation at its
first applied position, and every observed obligation must be accounted for
by such a statement. Deduplicated retries owe no additional event. Every
delivered flag must name the first actually applied canonical acknowledgment
that covers that occurrence; an unapplied acknowledgment cannot justify a
delivered flag. Missing debt, extra debt, mismatched payloads, and invented or
moved delivery positions are contrary readable state. The inspector retains
the complete owed/delivered census and never changes it.

The CDC ledger is lazy. Its absence is legal only when no applied permitted
statement could have emitted an event. Missing required native, participant,
origin, outcome or application schema remains unavailable. An absent lazy
ledger after an event-producing application is a missing-obligation
contradiction, rather than an empty-debt conclusion.

A follower may retain a pending foundation SQL command and a later pending
ACK before that SQL has applied or the lazy ledger exists. Exact ACK binding
to that earlier retained source command is an unresolved application
dependency: report unavailable with both commands preserved. Absence of its
not-yet-applied obligation alone is not contrary. An ACK with no preceding
canonical source occurrence, a wrong digest/position, or an already-applied
ACK without its applied source is contrary. The observer never executes the
source command to manufacture this evidence.

The MG follow-on must use the existing `cdc-event-envelope.js` and
`cdc-delivery-outcome.js` owners. Preserving source fields alone is
insufficient: recipient committed application must carry its exact outcome
back through relays/subscriber delivery to source ACK eligibility. Ordinary
success, content equality, pre-handler answers and lost answers cannot
discharge source debt. That follow-on remains outside this observation
increment and requires independent interaction review before implementation.

## Producer census and physical-schema correction, 2026-10-23

Source/test review disproved the proposed native schema-SQL eligibility in
rule 2. The original partition opener creates its table and indexes directly
through `createPartitionServiceTable`; no original startup producer places
either CREATE TABLE or CREATE INDEX in native history. Generic SQL admission
is not original-producer authority (CREATE TABLE is refused there anyway).
Remove all retained DDL eligibility. Such commands are contrary to this
bounded original extent. Keep physical schema inspection under its real
creator, including on empty tables, without executing DDL.

Missing required table/columns/indexes are unavailable; readable extra or
incompatible schema effects are contrary. The existing live creator omits
descriptor `unique` and composite `primaryKey`, unlike the general catalog
DDL generator. This pre-existing discrepancy is not repaired here. Fixtures
and the observer must follow the actual creator's shape. Extract its CREATE
construction without changing bytes; compare its owned durable shape plus
indexes/triggers. Do not execute a second schema to infer correspondence.

The SQL_TRANSACTIONS origin installs its canonical enforcement trigger in
the origin's application transaction. Read the existing enforcement owner:
pre-origin REQUIRED is legitimate; applied origin requires ENFORCED.
Unreadable/missing schema remains unavailable, but a lost/changed trigger
after origin application is contrary. The observer never installs it.

Legacy MG relays can remint the envelope timestamp while retaining the
origin HLC inside row data. Independently valid unequal stamps with exact
original row content remain unavailable pending source-occurrence evidence;
inequality alone is not contrary. Preserve both stamps. Malformed stamps
and changed/foreign row content remain contrary, and source obligation
payload correspondence still requires the exact generator-produced stamp.

The independent focused dispositions are appended to
`REVIEW-retained-effects-replacement-2026-10-23.md`. None is a runtime,
source-approval, startup-continuation or Quest-receipt claim.

## Source-review repair disposition, 2026-10-23

S1 applies the same schema rule to every required internal application owner,
including empty tables. Each owner supplies its complete explicit projection,
CREATE definition and indexes to a read-only SQLite mechanics helper. Missing
columns or required indexes are unavailable; altered constraints, extra indexes
or triggers are contrary. Formatting normalization admits the same owner shape
after its established ALTER ADD COLUMN upgrades; no migration executes during
observation. Raw stored integer/text/null types are checked before conversion
to exact decimal strings. The generation owner observes its complete singleton
census, not only a selected row that could hide another singleton. Lazy CDC
ledger absence remains separately governed by the emitting-statement census.

S2 preserves the startup consumer's outward CLASSIFICATION_UNAVAILABLE hold.
Intact observations remain in its detail; an inspection failure remains the
exact cause, including any primary-plus-cleanup AggregateError. The preparation
owner still retains a read handle whose close failed. Observation installs no
opening mode and issues no opening or publication right.

S3 follows the actual partition producer's clock: a native source command's
HLC node identity equals its proposedBy replica identity, including forwarded
commands. Physical time need not equal proposedAt or the declaration timestamp.
Original composition installs no optional CDC source scope, so an injected scope
is not eligible merely because its fields could describe the catalog. The
separate legacy MG unequal-stamp observation remains unavailable as specified
above. No source-scope producer or delivery receipt is added by this repair.

These answer the complete S1-S3 source finding set. Independent delta review,
new preparation-consumer tests and exact-candidate locked lab proof are still
required; this disposition is not evidence that those gates have passed.
