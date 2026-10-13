# Final query preservation witness: implementation readiness V1

Status: **READY once the reviewed production `OBSERVE_APPLIED_POSITION` action
and one reusable transport hold seam are frozen.** This is a read-only
implementation preflight. It does not authorize production or test changes and
does not claim behavioral proof.

## Exact binding

- Approved schedule:
  `final-query-proof-schedule-audit-v2.md`, SHA-256
  `3aa13f11faff53b3118342d574adc61c7e57b99237bc1daf89da9b80f164d600`.
- Independent design approval:
  `final-query-proof-schedule-independent-review-v2.md`, SHA-256
  `abad89ac162dce38992a05a632fc56a496eb759b2d364591ed3fda1a6979abb8`.
- Reconciled integration baseline: commit
  `9ba9a1941b2326d0d0bcfa49c581cc2fcf74af8d`, tree
  `c8bc996fe10cca221c68b5ca7954d1a51066d17d`, source tree
  `b09288511757fd86ef92553ac235c8d0fed0b345`.
- Immutable `9ba9` release fixture SHA-256:
  `2025703ba80ff8ab2d20bb70c00d851cd19c687578a5ba5e5e973f99cee522b1`.
- Immutable `9ba9` admitted-group fixture SHA-256:
  `24d4a14f2fab2c5ee43d02846fe32280ec31f5897ae301aa5695123cf1376af0`.
- Frozen controls-V2 shared participant fixture SHA-256:
  `7a95f49285789057f29a95a50ce341b3f44bfadd69f8c4495b39cce8dabd7550`.

The `9ba9` fixture bytes are the integration input. They retain the caller-owned
transport, `releaseOnce`, exact leader lookup, and aggregate cleanup added after
the older `77e` inventory. Those behaviors must remain byte-equivalent except
for the narrow composition seams below.

## Smallest existing-owner composition

Use a new focused file,
`test/partition/participant-release-query-proof-preservation.test.js`, rather
than extending the 1,180-line protocol test, 928-line recovery test, or
1,016-line shared participant fixture. A 300-380 line focused witness should
remain below the 800-line source-size boundary while keeping the one scenario
cohesive.

1. Create one caller-owned loopback transport and one `VirtualTimeSource`.
   Call immutable `formAdmittedGroup` with one real member, canonical
   `INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTION_PARTICIPANTS]`, canonical
   `SQL_TRANSACTION_PARTICIPANTS_SCHEMA`, the caller transport, and the clock in
   `serviceOptions`. The fixture already threads both inputs into the real
   `PartitionService` (`partition-admitted-group-fixture.js:42-54,84-103`) and
   retains robust service/directory cleanup (`:67-83,129-141`).
2. Attach immutable `attachPartitionReleaseOwners` to that real service. This
   remains the sole owner of the registered `ReplicaHandler`, the real
   SQL_TRANSACTIONS control `PartitionService`, the operator release route, and
   cleanup (`partition-release-fixture.js:29-58,59-108`). Retain its exact
   one-attempt `releaseOnce` (`:109-126`) for both the initial control release
   and the target release; do not call its retrying `release` loop.
3. Publish canonical TABLES/PARTITIONS/SERVICES rows for the participant and
   control services into the already-owned shared `SystemTableCache`. Use the
   actual partition, service, node, address, role, and schema values. Update the
   participant rows formed by `formAdmittedGroup`; do not plant a second
   partition, substitute cache-only facts, or seed application rows.
4. Construct exactly one `SQLQueryEngine` with that cache and transport,
   `nowFn: () => clock.now()`, and automatic transaction recovery disabled.
   Its initializer creates its one `ControlPlaneSystemTableGateway`
   (`sql-query-engine-instance-initializer.js:66-82`); assertions and release
   settlement use only `engine.getControlPlaneSystemTableGateway()`
   (`sql-query-engine-lifecycle-and-callback-dispatch.js:249-251`). Bind the
   engine to the same mutable CDC bridge held by the existing handler. The
   release owner resolves this exact bridge engine
   (`replica-handler-participant-cutover.js:91-96`).
5. Prove the participant table is genuinely routed and empty with a successful
   authoritative gateway read returning `rows: []`. This is load-bearing:
   recovery reads the transaction row, unconditionally reads
   SQL_TRANSACTION_PARTICIPANTS, then rereads and fences the transaction row
   (`sql-query-engine-transaction-set-methods.js:65-82`).

The frozen controls-V2 participant fixture is not a composition base. Its
membership/observation controls require a controllable consensus port, whereas
this witness needs a real native admitted service. It should remain unchanged
and unimported.

## Three narrow release-fixture seams

Only `test/partition/partition-release-fixture.js` needs composition changes:

1. Accept one caller-owned mutable `cdcIntegrationService` object and pass that
   exact object to each created `ReplicaHandler` instead of the current `{}` at
   `:39-42`.
2. Derive `timeSource` from `services[0].timeSource`; pass it to each handler
   and the fixture-owned SQL_TRANSACTIONS control service at `:39-58`. Deriving
   the clock avoids a second independently configurable deadline domain.
3. Return a read-only handle to the already-owned `control` service alongside
   `host`, `release`, `releaseOnce`, `dispose`, and `outcomes` at `:141`.
   Cleanup ownership remains inside the fixture.

No admitted-group or frozen participant-fixture change is needed.

## Exact schedule and observations

- First invoke `releaseOnce(control.partitionId)` normally so the control
  partition has current origin/enforcement and OPEN admission.
- Invoke public `engine.executeQuery('BEGIN', [], {sessionId,
  timeoutDeadline})`. Read the resulting transaction through the engine's
  gateway and require the actual row identity, deadline, ACTIVE state, and
  `participant_set_text: '[]'`.
- Only after that row/deadline is observed, advance the shared owner clock past
  the BEGIN deadline. Then start the second `releaseOnce(control.partitionId)`.
  Its request deadline is minted by the existing fixture at the advanced clock
  (`partition-release-fixture.js:109-126`), so it is later than the expired
  transaction deadline. There is no expired-before-engagement shortcut.
- A transparent, restoring delegate around the real control service's existing
  `handleApplicationMessage` records the exact terminal PROGRESS `{type,
  settlement}` and otherwise preserves receiver, arguments, synchronous throw,
  promise, answer, and error. The production settlement owner applies that
  payload directly (`distributed-transaction-release-settlement.js:93-103,
  184-203`). The delegate stays local to the focused test because it currently
  has one consumer.
- After the actual ENABLE answer, hold only the real
  `OBSERVE_APPLIED_POSITION` delivery. While held, redeliver the captured
  payload through the same control service. Require the retained original
  APPLIED result, `committed: true`, `logIndex`, and `term`; exact command
  identity; unchanged proposal queue/pending outcome/retained outcome,
  commit/applied position, row/digest/proof inputs; and CLOSED admission. The
  retained branch returns before row validation and proposal
  (`partition-coordinator-settlement.js:35-44,47-70`), with the existing real
  partition test establishing one-proposal replay (`partition-coordinator-settlement.test.js:55-71`).
- Forward the held observation exactly once and require the same release
  attempt to reach canonical final control adjudication and CUT_OVER. Capture
  actual ENABLE and RESUME requests and compare their proof values only as a
  preservation assertion. Exact-source review separately retains the fresh
  final `readCohort`, `finalLocal`, sole `transactionReleaseProofOf`, final
  `releaseCensusDefect`, control check, and RESUME ordering
  (`replica-handler-participant-cutover.js:264-302`).

## Remaining missing seam

The immutable integration source does not yet define a production
`OBSERVE_APPLIED_POSITION` action. Its native witness contains a test-local
route observer (`participant-release-native-application-order.test.js:385-533`),
but that observer records and forwards; it does not provide a reusable
one-delivery hold. Implementing a second query-only transport classifier would
duplicate the reviewed native boundary.

After the production action and native witness are frozen, use that witness's
reviewed generic one-shot delivery gate if it is exported. If it remains local,
extract one shared transport-delivery gate only when the native witness and
this focused test are both actual consumers. The gate must delegate the
original transport with the original receiver/arguments, retain the original
promise/result/error, hold only the exact production action for the control
partition, forward once, and restore only if it still owns the installed
delegate. This is the only implementation dependency that cannot be completed
against immutable `9ba9` alone.

## Cleanup and nonclaims

Restore the exact application and transport delegates before owner shutdown.
Shut down the engine, then the release owners/control service, then the admitted
group. Preserve primary and each cleanup failure; retain the directory when an
owner fails to stop. Do not force-commit pending work or overwrite a replacement
delegate.

This focused case preserves the real registered callback path, one release
attempt, original deadline, shared clock, actual gateway, and fixture-owned
lifecycle. It does not replace the native three-voter application-position
witness and does not prove fresh final proof construction from equal values.
