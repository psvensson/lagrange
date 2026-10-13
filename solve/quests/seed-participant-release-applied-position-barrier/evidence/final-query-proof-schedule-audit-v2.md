# Final query proof schedule audit V2

Status: design-only correction to V1. V1 remains unchanged. No production,
test, fixture, Quest, registry, metadata, or lab input was changed or run. The
active fixture edits in this worktree were not read; immutable `HEAD` fixture
bytes were used for the composition inventory.

## Binding

- Inspected HEAD: `77e091f64fb711fbc5ca40a7915ae85f01a5cf4e`.
- Production diff at inspection: empty; `git diff -- src | sha256sum` was
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- V1 is retained at
  `test-output/seed-native-startup-census-20261013/final-query-proof-schedule-audit-v1.md`,
  SHA-256
  `2c1924282184afc4d19ad87c0052c672b713011a1f00e25c6c8f3b2124a596fb`.
- Corrected owner hashes: coordinator settlement
  `f796055b731684bddaa5fa4ab6b6cfd8ddd7721bbb12ebbd22745262f9947d03`;
  coordinator settlement test
  `dca84ff6c258fb3549d6521e5c024fc54402ec7c90aacf177fb500defd57330a`;
  transaction recovery-set reader
  `b20dba809484d24d5ee6f47805c0c97502fc38166293731a35b3b69661944e58`;
  cutover
  `36b24096246f4c57f11c4238ebd4847276eb0f802b82d7aa56acd347303a57c3`;
  release settlement
  `655972f973a035fed24a248d256eeba2b21c47a3836519c59d251bcdd2b9af08`;
  fixed settlement state machine
  `2ab98f65e566a79718c7ace808fbfe60343d5c13a9e41e7e04bcf10bff05fda3`.
- Immutable helper hashes: query surface
  `a8288e0aaf1caa481bff9903030b9ab3bb0629a0785d69e2b61506d500fe0882`;
  transaction group
  `a0b2974b390237c0782fd98730ab4da6c5b77cdaf079022ad995ec5dbe776040`;
  `HEAD:test/partition/partition-release-fixture.js`
  `c80d2363adf4e0b5c0348f409136e7183009aa4e9db5dd9ad6f52985d75ade95`;
  `HEAD:test/partition/partition-admitted-group-fixture.js`
  `e10e7a2c152a78d7df529b9c929634ba9e650be062fc33b0f5ea8195cf93e4f6`.

## Corrected owner result

An exact redelivery of the terminal `PROGRESS` settlement does **not** answer
`REPLAYED` at the production request boundary. The first delivery applies the
fixed command and atomically retains its owner result, applied log index, and
term. On the exact redelivery, `requestCoordinatorSettlement` finds that
settled record and returns the retained original result before it checks a
pending write or observes the current row
(`src/partition/partition-coordinator-settlement.js:35-44,47-67`). Therefore
the second answer must preserve all of:

- the original `TRANSACTION_SETTLEMENT_OUTCOME.APPLIED` result;
- `committed: true`;
- the original `logIndex` and `term`;
- the identical application request/settlement identity.

The existing actual `PartitionService` test establishes exactly this ordering:
the first settlement is `APPLIED`, the retained JSON equals that result, exact
redelivery returns the same result, and proposal count remains one
(`test/partition/partition-coordinator-settlement.test.js:55-71`). The
`REPLAYED` result at
`src/query/distributed/distributed-transaction-settlement.js:178-183` is the
row validator's answer when it is actually reached. The settled-outcome path
at the partition boundary intentionally returns the earlier retained
`APPLIED` result instead.

This correction strengthens the intended control: redelivery must carry the
actual settlement captured from the release owner's terminal `PROGRESS`
delivery, not a newly built or semantically similar command selected merely to
obtain a replay label. It must leave proposal count, pending committed outcome,
row-generation digest, release identity, term, cohort, and admission state
unchanged.

The captured application payload is exactly `{type, settlement}`. On
redelivery the partition owner legitimately creates a fresh envelope timestamp
and `proposedAt`, while `transactionSettlementBytes` derives the same
settlement text, digest, and entry ID from the captured settlement
(`src/partition/partition-coordinator-settlement-command.js:6-29`). “Exact”
therefore means exact public settlement payload and deterministic committed
entry identity; it does not falsely require equal incidental envelope time.

## Reachability retained from V1

The V1 exclusion still holds. Under one current term/cohort and the raised
PAUSE, no ordinary query or new participant transaction can first become
accepted after the pre-ENABLE query proof while remaining absent from the work
census. A fixed coordinator settlement is the only admitted query-row command;
the proof already requires its row terminal. Its exact terminal redelivery can
therefore return retained evidence but cannot create a new lineage or change
the proof basis. ENABLE may install or repair schema enforcement, and term,
generation, service, or handler changes may refuse the attempt; neither is a
new accepted transaction-row race. This V2 uses the reachable retained-result
interaction and does not fabricate a post-proof mutation.

## What equal pre/final proofs can establish

The release owner settles query rows and constructs the pre-ENABLE proof at
`src/node/replica-handler-participant-cutover.js:266-278`. It then awaits
ENABLE, reads the cohort again, calls `transactionReleaseProofOf` with the
fresh local query census and the retained settlement results, classifies that
final census/proof, checks the control owner, and only then sends RESUME
(`:279-304`). The proof binds the exact release/attempt identity, schema and
semantic versions, row-generation digest, ordered transaction decisions,
terminal statuses, and participants
(`src/query/distributed/distributed-transaction-release-settlement.js:222-239`;
`src/partition/partition-participant-release-contract.js:36-51`).

An actual ENABLE request and actual RESUME request carrying equal proof values
demonstrate that the proof basis was preserved across ENABLE and the admitted
redelivery. They do **not** by themselves prove that the final proof was freshly
rebuilt: a mistaken pass-through could produce equal bytes. Keep an independent
exact-source ordering review as a separate required obligation. It must verify
that the final path really performs the fresh `readCohort`, derives
`finalLocal`, invokes the sole `transactionReleaseProofOf`, and passes that
result through the final `releaseCensusDefect` before RESUME. The behavioral
case must not claim fresh execution from value equality alone.

## Why a real empty participant table is required

Release settlement does not infer a zero-participant transaction from the
`sql_transactions` row alone. For every recovery-state read it reads the
authoritative transaction row, unconditionally reads
`sql_transaction_participants`, rereads the transaction row, and rejects any
fence change
(`src/query/sql-query-engine-transaction-set-methods.js:18-28,65-82`). Even a
transaction whose canonical participant set is `[]` therefore needs a routed,
readable, genuinely empty participant table. An absent table, cache-only empty
projection, in-memory persistence gateway, or direct SQLite seed would not
exercise this owner.

The production engine supplies the required one gateway. It constructs a
single `ControlPlaneSystemTableGateway` from its cache, router, and engine
(`src/query/sql-query-engine-instance-initializer.js:66-82`), and wires that
gateway to transaction persistence and authoritative recovery reads
(`:196-268`; `src/query/sql-query-engine-transaction-persistence-methods.js:129-210,299-319`).
`releaseQueryEngine` consumes the service engine or the handler's CDC bridge
engine and refuses conflicting identities
(`src/node/replica-handler-participant-cutover.js:93-98`). The witness must put
that exact engine on the handler bridge; it must not construct a second gateway
for assertions.

## Existing seams and the minimal composition

No current helper, unchanged, supplies the whole interaction:

- `test/query/unknown-outcome-surface-fixture.js:177-206,243-284` supplies
  routed real partitions and a production `SQLQueryEngine`, but it does not
  host them in the actual release `ReplicaHandler` and constructs a separate
  returned gateway in addition to the engine's gateway. It is a useful pattern,
  not the composition base for this witness.
- `test/test-helpers/transaction-coordinator-group-fixture.js:164-238` supplies
  actual participant Raft groups and release owners, but its coordinator state
  uses `createTransactionPersistenceGateway` over an in-memory store. It cannot
  prove routed `sql_transactions` plus routed empty
  `sql_transaction_participants` recovery reads.
- Immutable `HEAD:test/partition/partition-release-fixture.js:28-97` is the
  correct release/handler owner. It hosts the supplied real services and a real
  `sql_transactions` control service on their transport, but it currently
  injects `{}` as the handler CDC bridge, does not expose its fixture-owned
  control service, and does not put the handler/control service on the caller's
  clock.
- Immutable `HEAD:test/partition/partition-admitted-group-fixture.js:41-120`
  is the correct real routed partition owner and already accepts service
  options, including a supplied `timeSource`. It should remain the creator of
  the real participant-table service.

The smallest truthful composition is therefore feasible without a new
framework, gateway, release driver, or classifier. It requires narrow seams in
the existing release fixture rather than a parallel fixture:

1. Form a one-replica group for the canonical
   `SQL_TRANSACTION_PARTICIPANTS_SCHEMA` through `formAdmittedGroup`, passing
   one `VirtualTimeSource` in `serviceOptions`. This is the actually routed,
   initially empty participant table.
2. Call the existing `attachPartitionReleaseOwners` on that service. Keep it
   responsible for the actual handlers, actual `sql_transactions` control
   service, release route, and cleanup.
3. Extend only that fixture seam to accept one caller-owned mutable
   `cdcIntegrationService` bridge, pass the exact bridge to each real handler,
   pass the group's same `timeSource` to those handlers and to its control
   `PartitionService`, and return a read-only handle to the already-owned
   control service. Reuse the already-reviewed one-attempt release seam if it
   is present in the final active fixture; do not create another release
   algorithm. The fixture retains all shutdown ownership.
4. Add actual TABLES, PARTITIONS, and SERVICES routing rows for both real
   services to their one shared `SystemTableCache`, using their actual IDs,
   node, addresses, roles, and schemas. The participant table remains empty by
   normal initialization; no row is planted.
5. Construct one `SQLQueryEngine` with that exact cache and transport,
   `nowFn: () => clock.now()`, and recovery auto-start disabled. Use only
   `engine.getControlPlaneSystemTableGateway()`. Assign that engine to the
   mutable bridge so the already-created handler resolves the same engine at
   release time. There is no second gateway, database adapter, or query census.

The clock sharing is load-bearing. The engine clock owns transaction epochs
and deadlines (`src/query/sql-query-engine-instance-initializer.js:119-127,196-200`),
the release service samples its `timeSource`, and the release request deadline
must be meaningful to the handler. Supplying a virtual clock to only the engine
would create incompatible deadline domains. Supplying the one clock through
the existing constructor seams changes no production clock policy.

## Corrected witness schedule

1. **Compose real owners.** Build the routed empty participant-table service,
   attach the real release handler/control service, publish the two services'
   real routing rows, construct the one engine/gateway, and bind that engine to
   the handler bridge. Assert an authoritative participant-table read succeeds
   with `rows: []`; this distinguishes real emptiness from unavailable.
2. **Open the control group normally.** Release the actual
   `sql_transactions` control service through its registered operator route.
   Require normal `CUT_OVER`, installed enforcement/origin, and OPEN admission.
3. **Create one real zero-participant row.** Call public
   `engine.executeQuery('BEGIN', [], {sessionId, timeoutDeadline})`. The SQL
   path passes the options to `transactionCoordinator.begin`
   (`src/query/sql-query-engine-statement-execution.js:396-400,528-532`;
   `src/query/sql-query-engine.js:217-233`). An explicit deadline remains the
   coordinator's normal end-to-end budget: `beginOwned` derives its start from
   that deadline, so the created budget's `deadlineMs` equals the supplied
   deadline
   (`src/query/distributed/distributed-transaction-coordinator.js:230-280`;
   `src/control-plane/timeout-budget.js:40-53`). Advance only the shared owner
   clock beyond it. Assert the normal gateway inserted the row with
   `participant_set_text: '[]'`; do not mutate the database directly.
4. **Start the actual release once.** The real settlement owner must
   authoritatively read both tables, freeze the row, record rollback, perform
   zero participant deliveries, apply terminal `PROGRESS`, reread both tables,
   and build the pre-ENABLE proof
   (`src/query/distributed/distributed-transaction-release-settlement.js:93-103,118-139,149-219`).
   Passively record the actual ENABLE request and its proof.
5. **Capture, do not rebuild, terminal PROGRESS.** Install one transparent,
   restoring delegate around the actual control service's existing
   `handleApplicationMessage` before release. It records the exact
   coordinator-settlement payload whose `settlement.kind` is terminal
   `PROGRESS`, then calls the original method with the same receiver and
   arguments. It contains no classifier, canonicalizer, mutation, or answer
   replacement. This is necessary because the release owner invokes the
   service directly (`distributed-transaction-release-settlement.js:93-103`)
   and exposes no external event containing those bytes.
6. **Hold only the reviewed post-ENABLE observation seam.** After ENABLE has
   answered, hold the actual OBSERVE_APPLIED_POSITION delivery owned by the
   separately reviewed application-position witness. While it is held, resend
   the exact captured application payload through the same real control
   service. Require the complete answer to retain original `APPLIED`,
   `committed: true`, `logIndex`, and `term`. Snapshot the existing
   `proposalQueue`, pending-outcome accessor, retained committed outcome, and
   Raft commit/applied positions for the canonical captured entry ID; require
   all to remain unchanged and no pending outcome after redelivery. Require the
   transaction row/digest, proof identity inputs, and still-CLOSED admission to
   remain unchanged. The independent source check must additionally confirm
   the settled-record branch returns before `startPartitionRaftWriteCommit`;
   behavior should not overclaim an unavailable native proposal-call counter.
7. **Complete release.** Release the observation gate and passively record the
   actual RESUME request. Require normal final control adjudication and
   `CUT_OVER`, no exhausted bound, and equality of ENABLE/RESUME proof fields.
   Describe this as preservation across the reachable interaction. Bind the
   fresh-final-read/proof-construction ordering separately to exact source in
   independent review.

The transparent capture delegate should live in the focused test unless a
second selected test actually consumes it; speculative fixture extraction
would create a new seam without reuse. It observes an existing boundary and
must restore the original method during cleanup while retaining both primary
and cleanup failures.

## Required observations and exclusions

The case is nonvacuous only if it observes the real BEGIN mutation, successful
authoritative reads of both tables, exact terminal settlement capture,
one committed outcome for the captured PROGRESS entry with no queue, pending,
commit-index, or applied-index change on redelivery, a held actual post-ENABLE
observation, and actual ENABLE and RESUME requests. The same session,
transaction ID, epoch, participant-set text, settlement payload, entry
identity, release ID, term, leader, row-generation digest, and decision digest
must remain pinned.

Do not:

- expect `REPLAYED` from the exact settled partition redelivery;
- construct a different PROGRESS command to obtain a convenient label;
- claim equal proof bytes demonstrate fresh proof construction;
- use `createTransactionPersistenceGateway`, a raw database seed, a cache-only
  empty participant projection, or a direct read of the participant database
  as the engine's recovery source;
- add a second gateway/runtime bundle, release loop, classifier, drain
  predicate, or application-position fixture;
- advance a clock that is not shared by engine, handlers, and both control
  partitions; or
- treat this singleton control composition as the separately owned native
  multi-replica application-barrier proof.

## Feasibility verdict

**Feasible without a new framework.** The needed production owners and routing
mechanisms already exist. Current immutable helpers are not directly
composable unchanged, because the release fixture hides its control service,
installs no engine bridge, and does not share the caller's clock. The narrow
fixture boundary additions above make the existing release fixture compose
with the existing admitted-group and production engine owners; they do not add
an alternate gateway, release algorithm, transaction store, or classifier.

This is a corrected design plan, not implementation authorization or proof.
The active fixture bytes must be reconciled against these requirements by their
current owner before test implementation, without replacing concurrent work.
