---
documentClass: planning
---

# TX1 alpha single-path census and deletion design

Status: pre-Quest design draft for independent review.  This document is
read-only census/design evidence against
`e6d43bc1acb128a2b83ac89c77a3ec400e7edb1f`; it is not a sealed Quest and it
does not supersede any receipt of `replicated-transaction-decision-and-apply`.

## Decision and unit boundary

The first independently reviewable deletion unit must remove the complete
executable sessionId-only partition transaction engine.  Removing only the
wire fallback is unsafe: the local SQLite owner, its maps, reconstruction,
expiry/heal path, marker apply path, outcomes and direct method entry points
would remain active and competing.  The unit therefore deletes the old
execution owner and repoints every current caller that presently depends on a
legacy-shaped helper or map.

The unit preserves the current TX1 participant request/session/store/apply
owners, the current query coordinator and wire, the current committed-entry
application transaction, topology fences, removal custody, CDC, retry and
deadline semantics.  It changes no FreshMG, lifecycle, startup, current query
coordinator, or snapshot payload semantics.  Historical release/reopen and
connection-stamp cleanup, startup table cleanup, and the raft-rs application
snapshot custody gap are follow-on alpha units unless the source vet rules a
specific dependency into this unit.

This boundary implements the alpha decision at
`solve/epics/raft-rs-full-cutover/alpha-single-path-closeout-20261013.md:3-32`
and its transaction inventory at `:34-64`.  The eight required receipts in
`solve/quests/replicated-transaction-decision-and-apply/quest.json:11-20`
remain immutable.

## Proposed Quest

Suggested id: `tx1-single-path-alpha`.

Proposed statement:

> Every partition transaction control and transaction statement uses the
> current TX1 identity and participant owner.  Every TRANSACTION request,
> including an identity-less or partially current request, is answered only by
> `routeParticipantTransactionRequest` and the existing `identityRefusalOf`;
> no request can open, prepare, commit, roll back, reconstruct, expire/heal or
> answer from a sessionId-only SQLite transaction owner.  A QUERY carrying any
> part of the current identity is refused by that same identity owner before
> ordinary write epoch/leadership routing, while a valid current QUERY retains
> its existing epoch and leadership ordering.  A routing-only QUERY whose
> sessionId collides with a volatile or durable current participant is refused
> by the current participant owner, while an unrelated ordinary QUERY may keep
> sessionId as routing context.  Participant staging remains connection-free;
> durable PREPARE, immutable bound decision and exact outcome remain the only
> transaction protocol; current local-mutation, removal-drain, topology, CDC,
> crash/replay and cleanup guarantees consume their existing owners without a
> duplicate state or compatibility path.

Proposed binary probe: `test-receipt`, reading
`solve/quests/tx1-single-path-alpha/evidence/receipt.json` with the five grouped
receipts fixed by the unsealed Quest metadata:

1. `identityless-transaction-uses-current-admission-with-zero-effects`
2. `partial-query-and-session-collision-cannot-bypass-tx1`
3. `executable-session-engine-and-consumers-removed`
4. `current-release-drain-startup-and-hold-owners-preserved`
5. `current-replicated-transaction-regression-cone-preserved`

The receipt is generated only after the focused red witness, the preserved
current proof cone, no-reference audit and static gates complete on one exact
candidate.  A timeout occurrence is a red system finding; a retry or eventual
green does not satisfy a receipt.  These grouped child receipts require the
relevant regression witnesses for the parent TX1 guarantees, but they do not
claim that this deletion unit closes or certifies all eight parent receipts.

## Strongest baseline falsifier

The behavioral red is the production entry path, not a direct unit call to a
deleted helper.  It must use the fixture's natural current release state and
must not reset the generation origin, open the release pause or manufacture a
historical admitted session:

1. Construct the normal current participant fixture.  Before the origin, its
   current release pause is CLOSED; after the origin, legacy BEGIN is
   permanently fenced.  Therefore the honest baseline red is not an opened
   SQLite transaction.  Deliver identity-less BEGIN, PREPARE, COMMIT,
   ROLLBACK and OUTCOME through `handleApplicationMessage`: the baseline
   reaches the obsolete router/fence/dispatcher and returns an old
   `CUTOVER_PAUSED`/`LEGACY_SESSION_FENCED`/legacy answer instead of the
   canonical current `IDENTITY_REQUIRED`.  The candidate must return the
   current identity refusal for every control, while both baseline and
   candidate prove zero SQLite, session, map, proposal, data and outcome side
   effects.
2. Deliver a QUERY with only one current identity field (including a null,
   empty or undefined own field) through a natural fixture.  A SELECT can
   demonstrate reachable ordinary execution on the baseline; write variants
   exercise the stale-epoch/follower ordering.  Every malformed current shape
   must return the existing `IDENTITY_REQUIRED` before an ordinary answer,
   stale-epoch refusal or leader redirect.
3. Open one legitimate current participant session, then send a QUERY carrying
   only its routing `sessionId`.  It must be refused `IDENTITY_REQUIRED` and
   neither stage nor autocommit.  An otherwise identical QUERY with an
   unrelated routing sessionId must continue through ordinary routing.  Repeat
   the collision against a durable PREPARED row so the witness covers both
   current volatile and durable custody.

The source-bound companion asserts that the deleted files and symbols have no
production importer and that no old marker/outcome classification remains.
The no-reference audit classifies retained parser/API names separately; it
must not ban legitimate SQL AST/public `BEGIN_TRANSACTION` merely because an
obsolete partition wire alias used the same spelling.

## Current identity and query routing

`partition-participant-transaction-bytes.js:80-95` is the sole identity
refusal algorithm.  It already returns `IDENTITY_REQUIRED` when any of
`transactionId`, `participantId`, `commitMode`, or safe-integer
`transactionEpoch` is absent/malformed, and `IDENTITY_MISMATCH` for a foreign
participant.  Do not reimplement those checks.

`partition-participant-transaction-request.js:115-124` currently treats only
a non-null transactionId as current.  Replace that legacy discriminator with
one canonical current-query classification owned beside the existing identity
owner.  Canonicalize hostile request objects with the existing strict own-data
reader in `src/utils/strict-own-data.js:61-87`; do not add a second safe-object
or accessor/proxy algorithm.  Inherited identity, accessors, proxies, exotic
prototypes or symbol-keyed records must fail closed and can never become an
ordinary QUERY fallback.  Presence includes own fields whose value is null,
undefined or empty; value validity remains exclusively
`identityRefusalOf`'s decision:

- TRANSACTION is always current and always enters
  `routeParticipantTransactionRequest`; it has no undefined legacy fallback.
- QUERY is current-shaped when any one of the four canonical identity fields
  is an own field.  Its malformed-identity answer is built by the existing
  `identityRefusalOf`/`refusalOf`, not by a new predicate or error builder.
- QUERY with no identity field but a routing sessionId naming either a
  volatile current participant session or a durable current PREPARED row is a
  collision.  Preserve the existing composition at
  `legacy-fence.js:101-106,163-174`, move it to the current participant
  session/store owner, and answer via `identityRefusalOf` (`IDENTITY_REQUIRED`).
- QUERY with neither a current identity field nor a current session collision
  is ordinary, even when it carries sessionId routing context.

Expose one participant-query classification/early-refusal function from the
participant request owner.  `handleRemoteQuery` calls only the early malformed
or collision refusal before its ordinary gates.  A complete valid current
identity keeps the existing ordering at
`entry-apply-base.js:712-750`: stale-partition-version and follower redirect
still precede statement staging.  The participant statement handler remains at
the current later position.  This avoids both failure-code drift and weakening
valid current query routing.

Removal-serving admission must consume that same classification.  It admits a
current-shaped or colliding QUERY far enough to reach the participant's typed
answer, admits a valid current query only under current-session custody, and
continues to fence unrelated ordinary work.  It must not duplicate the field
set or session-collision lookup.

The production coordinator already emits the full identity through
`src/query/sql-query-engine-participant-wire.js:59-113` and stamps statement
identity through `src/query/query-executor-partition-request-builders.js:65-75`.
These are preserved interfaces, not deletion targets.

## Complete executable old-path census

### Routing and entry

- `src/partition/partition-service-entry-apply-base.js:414-477` owns the
  transport fallback and old operation dispatcher.  Delete the nullish
  fallback and `executeTransactionControl`; `handleTransactionMessage` calls
  the participant router only.
- `entry-apply-base.js:691-750` owns QUERY ordering.  Add only the participant
  owner's early malformed/collision answer as described above.
- `entry-apply-base.js:320-344` mixes legacy and current removal admission.
  Delete `resolveOpenTransactionState`; consume the current participant-query
  classifier and current session owner.
- `entry-apply-base.js:1122-1125` installs the legacy session-method mixin.
  Delete the mixin and its import.

### Local SQLite engine, maps, reconstruction, expiry and outcomes

- Delete `src/partition/partition-service-transaction-base.js` after moving
  only current responsibilities.  Its old responsibilities are:
  removal counts/drain (`:73-98`), committed-marker reconstruction
  (`:106-176`), old write-set/snapshot filtering (`:182-350`), local
  ACTIVE/PREPARED expiry and bare SQLite rollback (`:356-478`), local
  BEGIN/PREPARE/COMMIT/ROLLBACK (`:561-891`), session outcome table reads and
  writes (`:896-943`), and old marker proposal (`:949-1020`).
- Delete `src/partition/partition-service-transaction-session-methods.js`.
  It owns only the old session normalization/maps/aliases and prepare-lost
  answer.
- `src/partition/partition-service-core-base.js:176-204` allocates
  `activeTransactions`, `preparedTransactions`, `preparedStateLostSessions`,
  old conflict history and aliases.  Delete those fields.
- `core-base.js:597-610` currently couples legacy reconstruction to current
  mirror-worker recovery.  Delete reconstruction and its once-per-term field,
  but preserve `resumeDurableMirrorReplicationWorkers()` on every existing
  leader-activation occurrence with the same activation ordering.  Moving the
  current leader-activation block for file-size ownership must be mechanical.
- `src/partition/partition-service-write-metrics-base.js:60-143` absorbs
  ordinary statements into old sessions.  Remove the legacy lookup, snapshot
  filter and transactional write branch; reads remain ordinary and writes use
  the current committed write owner.
- Delete `write-metrics-base.js:229-283` (`executeTransactionWrite`).
- `write-metrics-base.js:169-219` is a current safety boundary despite the
  legacy helper name: direct local mutation has no replicated outcome.  Move
  the existing origin/pause refusal to a current admission owner and preserve
  it; do not delete or locally rederive it.
- Delete `src/partition/partition-transaction-handler.js`; it has no production
  importer.  Delete its dedicated tests and equivalence arm.

### Fences, current participant activity, markers and admission

- Delete `src/partition/partition-participant-transaction-legacy-fence.js`
  after moving the two current facts it happens to own: current participant
  activity and routing-session collision.
- `legacy-fence.js:67-75` already composes current activity as
  `hasParticipantSession(service) || isPartitionReserved(service.db)`.  Move
  this exact composition into the current participant session owner and use it
  from current BEGIN and removal drain.  Delete `service.isInTransaction()`;
  do not restate the boolean in each caller.
- `src/partition/partition-participant-transaction-request.js:263-292`
  removes only the `service.isInTransaction()` legacy half of current BEGIN.
  Current leadership, origin, determinism, removal, topology, existing-session
  and reservation checks remain.
- `request.js:531-547` currently accepts both production BEGIN/PREPARE and old
  partition aliases.  The implementation should select one canonical current
  wire pair and repoint the participant fixture.  Retire only obsolete
  partition aliases; retain legitimate SQL AST/public-result constants with
  the same text.  This alias decision is pending final source-vet confirmation.
- `src/partition/partition-participant-transaction-apply.js:552-569,653-657`
  applies unknown transaction commands as legacy markers.  Delete the legacy
  marker and make participant command dispatch exhaustive/fail closed.
- `src/partition/partition-committed-command-admission.js` and
  `src/partition/partition-service-constants.js:173-200` recognize old marker
  commands.  Delete old marker admission/classification and marker-only errors,
  logs and constants.  Preserve current participant command types and
  `TRANSACTION_OWNER` origin.
- `src/partition/partition-service-raft-init-base.js:403` directly calls the
  old `createTransactionOutcomeTable`; delete that invocation as a necessary
  consumer removal.  Delete `_transaction_outcomes` DDL/read/upsert constants
  and their orphan error/log vocabulary in
  `partition-service-constants.js`.  This is removal of the old outcome
  registration, not a lifecycle or migration redesign.
- `src/raft/snapshot-checkpoint-store.js:203-226,311-327` scans only old
  SQLite-payload markers.  Remove that scan and old tests.  Do not invent a
  TX1 log inference: the current raft-rs copy path at `:295-308` bypasses the
  old gate, `scrubRaftRsCopy` at `:339-350` strips application/participant
  tables, and `partition-snapshot-cadence.js:8-19,64-73` explicitly reports
  `COMMITTED_LOG_UNSUPPORTED`.  Current application snapshot custody remains a
  separate alpha owner obligation.

### Current cadence, removal and release dependencies

Delete the old heal logic while retaining the cadence's current calls:

- `enforcePreparedStateHoldTimeouts` becomes a current façade over the existing
  `sweepParticipantTransactionHolds`; it must not call the old local rollback
  sweep.
- `startPreparedStateHoldTimeoutSweep`/`stopPreparedStateHoldTimeoutSweep`
  retain their existing timer lifecycle and continue to call current TX1 hold
  observation, leader durability fitness and snapshot cadence at the same
  configured interval.  Normal timeout budgets do not change.
- `isSoloReplicaGroup` remains the current durability-fitness owner's helper;
  move the existing logic there rather than leaving it in a deleted
  transaction base.
- A test that deliberately advances through the hold bound can verify the
  fail-closed timeout consequence, but it cannot satisfy the Quest's healthy
  proof.  Any spent production/test wait bound is recorded red and root-caused.

Preserve public removal methods `fenceServingAdmissionForRemoval` and
`waitForRemovalServingDrain`.  Repoint them to the current participant-active
composition and active serving request count.  A durable PREPARED row and a
volatile session both hold the drain.  No new timeout or healing algorithm is
introduced.

`src/partition/partition-participant-release-facts.js:46-69` currently reads
the old maps and throws when they disappear.  Update its canonical `work`
shape in this unit; never default absent old fields to zero.  Remove
`legacyActive` and `legacyPrepared`, retain the separately-owned current facts
`sqliteTransactionOpen`, `participantStaging`, `participantPrepared`,
`proposals`, `pendingOutcomes`, `appliedIndex`, `commitIndex`, and `lastIndex`,
and update `isReleaseDrained` plus release witnesses together.

The release/reopen/connection-stamp protocol is startup/lifecycle-owned and
is not required to remove the executable old transaction engine.  This unit
does not rewrite it beyond the necessary canonical work-shape change.  Its
`servedLegacy`, connection-generation, reopen action, enable-time check and
tests are explicitly recorded as a follow-on alpha compatibility cleanup;
they must not be claimed absent by this unit.

## Current interfaces and guarantees that survive

- Current volatile owner:
  `partition-participant-transaction-session.js` (`open/find/end/discard`,
  bounded staging discard and durable PREPARED reporting).
- Current durable owner: `partition-participant-transaction-store.js`
  (`_participant_transactions`, generation origin/write generation, exact
  prepared/terminal row and reservation).
- Current request/answer owner:
  `partition-participant-transaction-request.js` plus
  `partition-participant-transaction-bytes.js`; malformed current identity is
  always typed by `identityRefusalOf`.
- Current apply owner:
  `partition-participant-transaction-apply.js`; PREPARE and decision effects
  remain in the same application transaction as applied progress.
- Current coordinator/wire:
  `sql-query-engine.js:217-337,416-475`,
  `sql-query-engine-instance-initializer.js:196-268`,
  `sql-query-engine-participant-wire.js`, request builders, durable workflow
  registry, immutable decision record, recovery set and exact participant
  outcome.  Query `transactionsBySession`, `endedTransactions`, FIFO and
  recovered transaction ids are current and are not deletion targets.
- Current topology and cleanup: participant topology fence, reservation,
  removal serving fence/drain, participant session cleanup, CDC apply and
  delivery, deterministic command bytes, crash replay and retry/deadline
  owners.
- Current unreplicated-local-mutation refusal after generation origin and
  during release pause.
- Mirror worker resumption on leader activation.

## Tests

Add the red witness described above before source changes.  Update current
tests that used an old alias or expected an L6 failure to assert the current
identity refusal without manufacturing historical state.

Retire obsolete-only tests/arms:

- `test/partition/partition-legacy-session-statement-admission.test.js`
- `test/partition/partition-transaction-handler.test.js`
- `PartitionTransactionHandler` arms in
  `test/partition/extracted-module-api-equivalence.property.test.js`
- old-engine cases in
  `partition-service-transactions-query-routing.test.js`,
  `partition-transaction.property.test.js`,
  `partition-transaction-replicated-apply.test.js`,
  `committed-statement-outcome.test.js`,
  `partition-service-write-commit.test.js`,
  `partition-runtime-reconstruction-leadership.test.js`,
  `sql-workflow.integration.test.js`, and the DT6 zombie/legacy durability
  cases.  Preserve unrelated assertions in mixed files.
- old SQLite snapshot PREPARE-marker expectations, replaced only by assertions
  that the obsolete scan is absent; no false current snapshot guarantee.

Preserve and run the current proof cone selected by the impact contracts:
participant apply/staging/envelope and v3 A1-A5; real three-replica Leg A;
coordinator/participant protocol, evidence binding, collision and recovery;
coordinator restart/process-loss; exact participant record/unreadable-record;
CDC obligation; topology/removal; persistence admission; current public
Application Database transaction facade.  The eight existing TX1 receipts are
re-measured, never rewritten.

## Source size and ownership extraction

Baseline sizes include:

| file | lines | bytes | disposition |
| --- | ---: | ---: | --- |
| `partition-service-transaction-base.js` | 1024 | 37050 | delete after current extractions |
| `partition-service-entry-apply-base.js` | 1126 | 43021 | delete fallback; extract remote-query methods so touched file is <=800 |
| `partition-service-write-metrics-base.js` | 800 | 29503 | legacy branch deletion takes it below limit |
| `partition-service-core-base.js` | 868 | 33581 | delete maps/reconstruction; mechanically extract coherent current leader-activation methods so touched file is <=800 |
| `partition-participant-transaction-request.js` | 679 | 27940 | preserve current owner, simplify routing |
| `partition-participant-transaction-legacy-fence.js` | 193 | 8981 | delete after moving current facts |
| `partition-service-transaction-session-methods.js` | 168 | 5544 | delete |
| `partition-transaction-handler.js` | 280 | 7766 | delete |

The `entry-apply-base` extraction moves the coherent remote-query methods
(`buildRemoteReadAuthorityWitness`, epoch evidence helpers,
`handleRemoteQuery`, migration query/default helpers and `isWriteQuery`) into
a bounded partition remote-query methods owner without logic changes.  The
core extraction moves the coherent leader-activation scheduling block without
changing readiness/FreshMG logic, and removes only the legacy reconstruction
branch while keeping mirror resumption.  No baseline is raised and no helper
is copied.

## Static and exact-head preflight

Run on the candidate selected by the parent; all reports and receipts bind the
exact SHA:

- `node scripts/check-fast-static.js --base e6d43bc1acb128a2b83ac89c77a3ec400e7edb1f --explain`
- `npm run audit:attempt-preflight`
- strict changed-file size, complexity and cognitive audits; zero new decision
  boundary/guideline literal debt and no baseline increase
- `npm run audit:impact-contracts`, `npm run audit:shards`,
  `npm run audit:guidelines`, `npm run lint`
- regenerate/check impact graph and test classifications after file/test
  deletion; run the canonical import graph and `npm run test:unused:prod`
- source-bound `rg`/AST no-reference classification for deleted files,
  functions, maps, outcomes and markers, with retained homonyms attributed to
  their current SQL/query owner
- Quest landing's full `npm test` and the parent-selected locked-lab proof
  cone on the same SHA

## Explicit exclusions and follow-on inventory

- No change to FreshMG, general lifecycle/startup behavior, the current query
  coordinator, current timeout budgets, or normal query routing semantics.
- No fix for the separately found provisioning `wait_bound_spent`; it is a
  systemic policy-ordering unit and cannot be counted as clean proof here.
- No current raft-rs application snapshot payload claim.  Removing the old
  SQLite marker scan exposes but does not repair the separate snapshot custody
  gap.
- No deletion of `partition-legacy-consensus-state.js`; it is a separate
  nontransaction startup compatibility unit.
- Connection stamps, release reopen branches and L6-named release outcomes are
  follow-on no-reference cleanup.  The final alpha closeout must delete them;
  this unit must list any survivor exactly.  The old `_transaction_outcomes`
  startup invocation, DDL and read/upsert constants are included in this child
  because deleting their method owner otherwise leaves a broken caller.
- No flags, adapters, compatibility parsers, second identity/refusal
  algorithm, second transaction activity map, or replacement recovery scan.

## Unresolved source-vet decisions

1. Confirm the canonical current participant wire spelling for BEGIN/PREPARE.
   Production query wire emits `BEGIN`/`PREPARE`, while the participant fixture
   currently uses partition aliases `BEGIN_TRANSACTION`/`PREPARE_TRANSACTION`.
   Retire the obsolete aliases if the fixture is the only current consumer;
   retain same-spelled SQL AST/public constants under their separate owner.
2. Confirm whether connection-stamp/reopen cleanup remains a follow-on given
   the explicit FreshMG/startup exclusion.  It is no longer an executable
   transaction owner after this unit, but it is obsolete alpha compatibility
   surface.
3. Confirm the exact mechanical core extraction boundary required by the
   touched-file size gate; it must preserve readiness and mirror-worker
   activation byte-for-byte except for deleted reconstruction.
