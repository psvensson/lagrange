# Query Executor Routing and Delivery Owner Split

## Why

`QueryExecutor` currently answers too many semantic questions at once:
which partition services are candidates, which retries are legal, how much
budget remains for delivery, and how typed failures should be preserved.

That shape violates the simplification goal from the earlier boundary sprint.
It also makes current harness failures harder to isolate because routing
authority and delivery pressure share one branch-heavy owner.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Split `src/query/query-executor.js` into one routing/candidate-selection
   owner and one delivery-budget/retry driver.
2. Preserve one canonical routing snapshot and one canonical typed delivery
   outcome for callers.
3. Touch direct collaborators such as `src/query/sql-query-engine.js` only
   where needed to consume the new extracted owners cleanly.
4. Remove duplicated local routing or retry logic that becomes superseded by
   the extracted owners.

## Out Of Scope

1. New query features
2. Broad planner redesign beyond the touched routing/delivery boundary
3. Transport redesign outside the direct delivery contract consumed here

## Scenario Targets

1. `seven-node-load-during-partitioning`
2. `seven-node-read-write-load-transaction-recovery`
3. `seven-node-read-write-load-distribution`

## Invariants

1. Routing candidate selection must emit one canonical ordered cohort plus
   typed reasons.
2. Delivery-budget and retry behavior must preserve one canonical typed
   outcome instead of rebuilding semantics at each call site.
3. Callers must not need to interpret boolean bags or transport details
   directly after the split.

## Shared Boundary Contract

- Semantic owner: extracted `QueryExecutor` routing-candidate owner and
  delivery-budget owner
- Canonical contract shape / vocabulary: one routing snapshot plus ordered
  candidate cohort, and one typed delivery outcome carrying retry/backpressure
  evidence
- Allowed consumers: `QueryExecutor`, `SQLQueryEngine`, focused query-path
  diagnostics and tests
- Prohibited reinterpretations: callers must not rebuild candidate selection
  or delivery retry semantics from raw cache rows, temporary quarantines, or
  transport failures
- Primary diagnostics / proof surfaces: query-owner tests, fanout/retry
  diagnostics, named distributed harness lanes

## Detection / Analysis Tasks

- [ ] Build the current routing-vs-delivery branch inventory.
- [ ] Mark duplicated retry and candidate-ordering logic.
- [ ] Define the extracted owner interfaces before moving logic.

## Implementation Tasks

- [ ] Extract the routing/candidate-selection owner.
- [ ] Extract the delivery-budget/retry owner.
- [ ] Cut `QueryExecutor` over to those owners and delete superseded local
      logic.

## Residual Closure Inventory

- [ ] `QueryExecutor` no longer mixes routing authority and delivery-budget
      policy in one branch pile.
- [ ] Tail consumers read one canonical routing/delivery contract.
- [ ] Superseded local retry or candidate-selection logic is deleted.

## Validation

1. Targeted `QueryExecutor` unit coverage
2. Focused query-path integration coverage
3. Distributed scenario evidence for the named routing/recovery lanes
4. `npm run test:metrics`

## Done When

1. Routing/candidate selection and delivery-budget behavior have distinct
   semantic owners.
2. The extracted contracts make query-path failures easier to localize.
3. The named scenario lanes keep green or fail with one obvious typed blocker
   story.
