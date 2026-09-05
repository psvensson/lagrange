# DEP-SCOPE — membership-epoch NULL rehydration (durable replica-operation epoch decode owner)

Tree: `.claude/worktrees/membership-epoch-null-rehydration` @ `a6d99aa3d` (origin/main, Quest P published head).

## Demonstrated defect

Live witness: `runs/before/node-0.log` (2026-09-03 19:37:54Z, six occurrences)
`errorMessage: "Stale dispatch for published membership epoch 0; current epoch is 5"`
for freshly created ADD operations on `partitions_p_b8faa725_left`.

```text
replica_operations.membership_publication_epoch = SQL NULL   (direct/unbound create)
  -> rowToOperation: Number(row.membership_publication_epoch)   // Number(null) === 0
  -> Number.isInteger(0) && 0 >= 0                              // admitted as BOUND 0
  -> operation.membershipPublicationEpoch = 0
  -> dispatch epoch gate: planning epoch 0 !== current epoch N  // "Stale dispatch ... epoch 0"
```

Owner: `src/rebalancer/replica-operation-repository-row-methods.js` `rowToOperation`
(the repository is the declared single owner of "row <-> operation object
translation", `replica-operation-repository.js:1-15`). The dispatch gate's
stale/current policy and the current-membership epoch owner are not the defect.

## Existing contract (measured before the change)

| Fact | Evidence |
| --- | --- |
| Column is nullable INTEGER | `src/bootstrap/system-table-runtime-schema-definitions.js:63` (`membership_publication_epoch INTEGER`, no notNull) |
| Encoder writes `operation.membershipPublicationEpoch ?? null` | `replica-operation-repository-mutation-persistence-methods.js:179` |
| Record admits only `Number.isInteger(x) && x >= 0`; unbound = field absent | `replica-status.js:164-167` (createOperationRecord) |
| Dispatch fence: unbound -> no fence; unreadable current -> defer; mismatch -> fail closed | `operation-workflow-dispatch-epoch-gate.js` |
| Creation fence: unbound move -> bypass ("direct callers that never carried an epoch") | `rebalance-coordinator-owner-delegation-methods.js:165-210` |
| Published epochs are minted `\|\| 1` (>= 1) | `membership-publication-candidate-derivation.js:330-343`, `membership-publication-planning-evidence.js:565` |
| Operation domain nevertheless admits epoch 0 (`>= 0`) | same sites as row 3 and the gate |

Semantic distinction the decode must preserve:

```text
NULL / absent column  -> UNBOUND   (no planning-epoch binding)
0                     -> BOUND 0   (legal in the operation domain; never a NULL sentinel)
N >= 1                -> BOUND N
anything else         -> INVALID   (fail closed; never coerced)
```

## Reader inventory (all `src/` sites mentioning the field; classified)

| Site | Class | Before | After |
| --- | --- | --- | --- |
| `replica-operation-repository-row-methods.js` rowToOperation | SQL read / cache decode | `Number(row.col)` (defect) | `assertMembershipPublicationEpochBinding` (throws INVALID) |
| `operation-workflow-dispatch-epoch-gate.js` | dispatch fence (operation side) | local `normalizePlanningEpoch` = `Number(...)` | decoder binding; current-epoch side keeps its own normalizer (other owner's output) |
| `rebalance-coordinator-owner-delegation-methods.js` assertMembershipPublicationEpoch | creation fence | `Number(move.epoch)` (same defect class: `null` -> fenced as epoch 0) | decoder binding |
| `replica-status.js` createOperationRecord | write/encode admission | local `isInteger && >= 0` | `isBoundMembershipPublicationEpoch` |
| `unified-rebalancer-move-execution.js` (2 sites) | move -> request carry | local predicates | `isBoundMembershipPublicationEpoch` |
| `operation-workflow-dispatch-response-reconcile.js` | operation -> executor request carry | local predicate | `isBoundMembershipPublicationEpoch` |
| `unified-rebalancer-rebalance-loop.js` | planner stamping | local predicate | `isBoundMembershipPublicationEpoch` |
| `replica-operation-repository-mutation-row-methods.js` | cache-row encode passthrough | passthrough | unchanged |
| `replica-operation-repository-mutation-persistence-methods.js` | SQL encode (`?? null`) | encode | unchanged |
| `rebalance-coordinator-operation-creation.js` | passes move field into createOperationRecord | passthrough | unchanged |
| constants / SQL text / schema / migration (`replica-operation-constants`, `replica-operation-repository`, `rebalance-coordinator-shared`, `system-table-runtime-schema-definitions`, `partition-service-constants`, `partition-service-entry-apply-base`) | schema | — | unchanged |

Result: 7 behaviour-changing readers, 1 canonical decode module
(`src/rebalancer/replica-operation-membership-epoch-binding.js`), 0 local
numeric reinterpretations. `E8-single-decoder-inventory` pins the
classification structurally (an unclassified new reader fails the test).

## Out of scope (recorded, not changed)

- `control-plane-readiness-publication-planning-snapshot.js:530-538`
  `getCurrentPublishedMembershipEpochSync` does `Number(planningSnapshot?.publishedPlanningEpoch)`;
  `recovery-protocol-snapshot.js:659` sets `publishedPlanningEpoch: null` when no
  publication is PUBLISHED, so the current epoch reads as 0 (not "unreadable")
  before the first publication. Same defect class, different owner
  (current-membership epoch owner). Not touched here; see quest findings.
- `membership-epoch-contract.js` `buildMembershipEpochValue` (publication rows):
  `Number(null)` -> AVAILABLE 0. Publication-row owner; not touched.
- Dispatch stale-epoch policy, topology settling gate, Quest 2 planning
  generation, ReadinessPlanningSnapshotOwner: untouched.

## Receipts

E1 NULL round trip (SQL + cache routes), E2 zero preserved, E3 positive
preserved, E4 unbound dispatch follows the unbound rule, E5 stale bound still
rejected, E6 current bound accepted, E7 malformed durable fails closed, E8
single-decoder inventory — `test/rebalancer/replica-operation-membership-epoch-binding.test.js`,
driven through the real `PartitionService` SQLite partition, the real
`RebalanceCoordinator.createOperation` INSERT encode, the real
`repository.queryOperationById` rehydration, and the real workflow-owner
dispatch lane (`wireEpochDispatchProbe`; only reservation and delivery are
stubbed, never the epoch comparison).

Mutation controls M1 (restore `Number(null)`), M2 (`?? 0`), M3 (disable the
stale-bound comparison), M4 (treat zero as null) are recorded in
`solve/evidence/membership-epoch-null-rehydration.mutations.json`.
