# TX1 removed API and state consumer census

## Inputs and method

This is a read-only comparison of exact baseline
`e6d43bc1acb128a2b83ac89c77a3ec400e7edb1f` (`src` tree
`0fd8f7867e31ad60e31ec8f528d3a0fbb12b9b0a`) with immutable candidate
`2feb3110f196467e015c7741211e35bf597248a0` (`src` tree
`8b6ea2b7b686ea6af345f08923022d9f33e42d84`, `test` tree
`7d90e3ca5f9edd6ca2827944c1774df27c37d793`). It excludes the parallel
constant-field census.

The census parsed every changed JavaScript module to compare declarations,
class methods, object methods, named exports and direct `this` properties. It
then searched `src`, `test`, `scripts`, `.github` and `package.json` for every
removed identifier, module path, quoted/computed property spelling and old
state-field spelling. Import aliases cannot hide a deleted module because no
remaining import names any deleted module. Prototype reflection cannot recover
the old surface for the same reason; current `PartitionService` composition is
the explicit owner list in `partition-service-assembly.js:38-57`.

## Result

There is no remaining live `src` or `test` import, call, alias extraction or
computed property read of the removed session engine APIs. The source deletion
is coherent at the method/module boundary. Two nonconstant stale residues and
three ratchet-baseline residues remain, and one exact-name match belongs to a
different current owner.

## Removed modules and exports

| Removed module/export | Remaining consumer result |
| --- | --- |
| `partition-service-transaction-base.js` / `PartitionServiceTransactionBase` | No current import or prototype consumer. `PartitionServiceWriteMetricsBase` now extends `PartitionServiceEntryApplyBase` directly. |
| `partition-service-transaction-session-methods.js` / `createPartitionServiceTransactionSessionMethods` | No current import, factory call, namespace access or alias. |
| `partition-transaction-handler.js` / `PartitionTransactionHandler` | No current import or construction. Common names such as `begin`, `commit`, `rollback` and `getState` occur on unrelated owners; none is reached through this deleted class. |
| `partition-participant-transaction-legacy-fence.js` / `fenceLegacyTransactionRequest`, `fenceLegacySessionQuery`, `fenceLegacyLocalMutation` | No current import or call. Transaction/query classification is owned by `participantQueryClassification` (`partition-participant-transaction-request.js:124-152`); local unreplicated mutation refusal is owned by `unreplicatedLocalMutationRefusal` (`partition-local-mutation-admission.js:14-32`). |
| `participantTransactionActive` old export | The name was moved, not deleted. Its sole current composition is `hasParticipantSession(service) || isPartitionReserved(service.db)` in `partition-participant-transaction-session.js:117-129`, exported at `:226-234` and consumed by the current request/removal owners. |
| `participantSessionNamed` old export | Correctly de-exported; the function remains private and is used only by current routing-session collision classification (`partition-participant-transaction-session.js:89-108`). |
| `isParticipantSessionKnown` store export | Deleted with no remaining import or call. Current reads use the canonical identity row reader and the prepared-session collision predicate. |

The old internal helpers `markerRefusal`, `markerNotAdmissible`,
`sessionMissing`, `applyLegacyTransactionMarker`,
`isParticipantTransactionRequest`, `hasPendingPreparedTransactions` and
`reportTransactionHoldSpent` also have zero current consumers. Current
committed admission dispatches SQL, participant, CDC and coordinator commands
at `partition-committed-command-admission.js:130-170`; current participant
application dispatches only the three participant commands at
`partition-participant-transaction-apply.js:598-636`. The removed SQLite
checkpoint pending-marker scan has no retained caller; current raft-rs copy
custody remains the separate snapshot contract.

## Removed `PartitionService` method surface

These methods are absent and have no remaining identifier, quoted-key,
bracket-key or destructured consumer:

- reconstruction and maps: `reconstructPreparedState`,
  `collectExpiredPreparedSessions`, `collectExpiredActiveSessions`,
  `runPreparedStateHoldTimeoutSweep`, `isStuckTransactionHealPermitted`;
- local snapshot/write-set engine: `resolveTransactionPrimaryKeyColumn`,
  `resolveTransactionWriteSetKey`, `trackTransactionWriteSetKey`,
  `checkWriteConflicts`, `getOldestRetainedCommitEpoch`, `isSnapshotExpired`,
  `applySnapshotReadFilter`, `pruneCommittedWriteLog`;
- old transaction execution: `beginTransaction`, `prepareTransaction`,
  `commitTransaction`, `rollbackTransaction`, `isInTransaction`,
  `executeTransactionControl`, `executeTransactionWrite`;
- old outcome/marker path: `createTransactionOutcomeTable`,
  `recordTransactionCommitOutcome`, `resolveTransactionCommitOutcome`,
  `replicateTransactionCommit`, `proposeTransactionMarker`,
  `replicateTransactionRollback`;
- old session aliases: `normalizeTransactionSessionId`,
  `resolveActiveTransactionSessionId`, `syncLegacyTransactionAliases`,
  `resolveActiveTransactionState`, `resolvePreparedTransactionSessionId`,
  `resolvePreparedTransactionState`, `resolveOpenTransactionState`,
  `buildPrepareLostResponse`.

The exact names `beginTransaction` and `commitTransaction` still occur on
`SemanticGenerationTracker` in
`control-plane/readiness-planning-semantic-generation.js:182-188`; those calls
are readiness-planning ownership and are unrelated to `PartitionService`.

The cadence/removal/activation methods needed by current ownership were moved
rather than deleted:

- `enforcePreparedStateHoldTimeouts`, `startPreparedStateHoldTimeoutSweep`,
  `stopPreparedStateHoldTimeoutSweep` and `runSnapshotCadenceTick` are composed
  from `partition-service-participant-transaction-cadence-methods.js`;
- `fenceServingAdmissionForRemoval` and `waitForRemovalServingDrain` are
  composed from `partition-service-removal-serving-methods.js:6-23`;
- `isSoloReplicaGroup` remains in durability fitness;
- leader activation always resumes durable mirror workers at
  `partition-service-leader-activation-methods.js:90-120`.

No consumer reads the removed fence result keys `activeTransactionCount` or
`preparedTransactionCount`. Production removal ignores the result and waits on
the canonical drain; current tests read
`{activeServingRequestCount, participantTransactionActive}`.

## Removed instance state

The old `PartitionService` instance fields `activeTransactions`,
`preparedTransactions`, `preparedStateLostSessions`, `committedWriteLog`,
`rowCommitEpoch`, `maxCommittedWriteLogEntries`, `activeTransaction`,
`transactionOperations` and `lastPreparedStateReconstructionTerm` were removed.
There is no current production read or write of those `PartitionService`
fields.

Two exact-name classifications matter:

1. `src/query/sql-query-engine-instance-initializer.js:353` exposes
   `engine.activeTransactions = engine.transactionCoordinator.transactionsBySession`.
   Its five test reads in `cross-partition-rejection.property.test.js` and
   `transaction-support.test.js` are the live distributed coordinator alias,
   not the removed partition map. It must remain.
2. `test/control-plane/cl-036-local-leader-row-seed.test.js:166` assigns
   `context.lastPreparedStateReconstructionTerm = 7` to an object created from
   `PartitionService.prototype`. Current leader activation never reads it.
   This is inert stale fixture residue and should be deleted; replacing it with
   another fake state would hide the deletion.

Two current-owner comments also retain an obsolete owner name:
`partition-participant-transaction-session.js:82-85` says the old "L6
fences" ask `participantSessionNamed`, and
`partition-participant-transaction-store.js:144-146` says an "L6 fence"
refuses a prepared routing session. The executable owner is now
`participantQueryClassification` plus `participantRoutingSessionCollision`.
Reword these comments to that current owner; the collision behavior itself is
load-bearing and must remain.

## Historical executable residues

- `scripts/quest-evidence/tx1-historical-before-l6-witness.mjs:38` reads
  `leader.preparedTransactions`. The paired workflow copies the witness into
  pinned historical commit `2a21e39c...` before executing it
  (`rs-raft-tx1-historical-l6-admission.yml:39-53`), so it is not a current
  runtime consumer. It remains executable old-engine evidence. With historical
  migration support withdrawn, retire the branch-specific workflow and witness
  rather than adapting them to a new compatibility path.
- `scripts/quest-evidence/measure-partition-tx1-admission-20261012.py:21,121-130,167`
  names, reads, mutates and hashes the deleted legacy-fence module. Its paired
  workflow invokes the script at
  `rs-raft-partition-tx1-admission.yml:97-105`. On a source tree containing this
  deletion the driver stops at `Path(FENCE).read_bytes()` before its semantic
  negative. This is a dangling executable evidence harness; retire the stale
  workflow/driver or pin the entire run to its historical source. Do not invent
  a current legacy-fence substitute.

## Ratchet cleanup

Deleted paths retain allowances that can no longer match a source finding:

- four decision-boundary entries for the deleted session-methods module at
  `scripts/check-guideline-decision-boundaries-baseline.json:4853-4886`;
- one literal entry for that module at
  `scripts/check-guideline-literals-baseline.json:10870-10876`;
- two silent-catch entries for the deleted transaction base and one for the
  deleted handler at
  `scripts/check-guideline-silent-catch-baseline.json:484-499,538-544`.

`applyCountBaseline` only consumes allowances for findings that still exist;
these stale entries do not create a current green failure, but they leave the
one-way baseline inflated. Regenerate or surgically remove exactly these eight
allowances without changing any live allowance.

## V3 integration actions from this census

1. Remove the inert CL-036 field assignment.
2. Reword the two stale "L6 fence" comments around the retained current
   routing-session collision owner.
3. Retire or explicitly historical-pin the two obsolete evidence harnesses and
   their branch-specific workflows; do not add compatibility APIs.
4. Tighten the eight dead guideline allowances.
5. Preserve the SQL coordinator `activeTransactions` alias, the moved current
   participant-active predicate, the current removal drain shape, cadence and
   unconditional mirror-worker resumption.

No production or test byte was changed by this census.

## Independent integration disposition

The historical harnesses are retained unchanged as historical-only evidence;
they are not live dangling consumers and receive no compatibility adaptation.

The old admission driver establishes its source boundary before it reads the
legacy fence: it requires `HEAD:src == BASE:src == SOURCE_TREE` and a clean
checkout, then reads and mutates `FENCE`. A current TX1 source invocation is
therefore rejected by the source pin before the deleted path is reached. The
paired workflow and driver remain evidence for their pinned historical tree.
Likewise, the before-L6 witness is copied into its declared historical commit
and executes only there. Its `preparedTransactions` read does not require a
current map or adapter.

The integration actions for V3 are consequently limited to the approved
current-tree cleanup: delete the inert CL-036 assignment, reword the two
routing-collision owner comments, and surgically remove the eight allowances
whose source paths were deleted. The historical scripts and workflows stay
byte-identical.
