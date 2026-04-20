# Distributed Stability And Recovery Completion Sprint (AGPL)

## Goal

Finish the remaining AGPL-scoped stability work so the cluster converges
predictably under load, node joins, rolling restarts, seed restarts, and
seven-node stress.

## Why This Sprint Exists

The repo already has the main substrate in place:

1. `RebalanceCoordinator` is the single durable writer for
   `replica_operations`.
2. Learner promotion, priority recovery, readiness, and routing all have
   owner-owned building blocks.
3. The distributed harness is strong enough to reproduce and classify complex
   recovery failures.

But the latest seven-node checkpoint still fails in one concentrated recovery
family rather than many unrelated ones.

Latest local evidence:

1. Scenario `seven-node-read-write-load-transaction-recovery` still fails with
   `publication_convergence_blocked`.
2. The timeout shape is `recoveryProtocolState=priority_spread_pending` even
   when publication ack state is already satisfied.
3. `sql_transaction_participants-p1` is classified as `operation_stalled` with
   `operation_created_but_no_step_transitions`.
4. The target node retries pending work while critical visibility remains
   incomplete:
   - canonical leader metadata gaps
   - endpoint visibility gaps
   - routed system-table timeouts
   - transaction-control partition pressure

That means the remaining problem is architectural:

`plan durable operation -> dispatch execution -> prove visibility -> complete or resume after restart`

The current system can create the operation and keep retrying, but it still
does not guarantee that critical recovery work advances through one explicit,
restart-safe, load-aware owner path.

## Current Logic Baseline

Current concrete owners already in the repo:

1. `RebalanceCoordinator` owns durable operation lifecycle intent in
   `replica_operations`.
2. `ReplicaDispatchService` owns dispatch and retry behavior.
3. `PriorityRecoveryCompletion` owns one completion view for critical
   recovery.
4. `CanonicalLeaderRoutingGap` owns one leader-gap vocabulary for routing.
5. `JoinReadinessEvaluator` and related readiness owners combine topology,
   endpoint, and routing evidence.

The latest failure shows the remaining gap between those owners:

1. planning can create a `REPLACE` operation for a priority partition
2. execution can remain stuck in `PENDING`
3. the target node can stay "ready enough to retry" but not "ready enough to
   finish"
4. routing and visibility still report contradictory truths for the same
   critical partitions
5. restart and load pressure still amplify the same ambiguity instead of
   collapsing it

The affected family is now narrow enough to target directly:

1. `control_plane_publications-p1`
2. `replica_operations-p1`
3. `sql_transaction_participants-p1`
4. `sql_transactions-p1`
5. `sql_write_operations-p1`

## Comparative Analysis

The comparison set is not meant to copy foreign architectures wholesale. It is
meant to extract the stable ideas that match the failure family above.

### 1. etcd

Relevant pattern:

1. new members join as non-voting learners
2. quorum size does not change until catch-up is complete
3. promotion is explicitly validated
4. leadership is never transferred to a learner

Useful takeaways for this repo:

1. critical replacement and rejoin work should have a quorum-neutral catch-up
   lane
2. critical recovery targets should stay non-serving until promotion
   conditions are explicitly satisfied
3. "ready enough to retry" and "eligible to promote/serve" must not be the
   same state

### 2. TiKV / PD

Relevant pattern:

1. scheduling decisions are driven by store and region heartbeats
2. scheduling plans are explicit operators
3. pending operators are monitored through follow-up heartbeats
4. scheduling concurrency is limited so balancing does not destabilize the
   online path

Useful takeaways for this repo:

1. critical `replica_operations` need one explicit operator-controller model
   with per-step witnesses
2. the system must detect and surface "operation created but no progress" as a
   first-class owner state, not as a timeout-only symptom
3. critical recovery needs lane-local concurrency budgets and rate limits

### 3. CockroachDB

Relevant pattern:

1. internal system ranges are treated differently from ordinary user data
2. those ranges get stronger replication and placement expectations because
   cluster availability depends on them

Useful takeaways for this repo:

1. transaction-control and control-plane priority partitions should use a
   stricter placement and spread policy than generic partitions
2. the repo should stop treating critical partitions as if generic balancing
   policy is enough

### 4. FoundationDB

Relevant pattern:

1. fault-domain placement is deliberate rather than accidental
2. ratekeeping and data-movement health are explicit operational concerns
3. deterministic simulation is treated as a core correctness tool, not a
   sidecar

Useful takeaways for this repo:

1. critical recovery must obey explicit ratekeeping and load-shedding policy
2. diagnostics should expose recovery health directly instead of forcing log
   archaeology
3. boundary scenarios should reproduce critical recovery logic cheaply before
   seven-node reruns

## Design Direction

The stable target state for this repo is:

1. Critical partitions have a dedicated recovery lane, not generic balancing
   semantics with extra guards.
2. Every in-flight critical operation has one explicit step, witness, timeout
   class, and legal next action.
3. Critical routing, endpoint visibility, canonical leader identity, and
   readiness collapse onto one convergence contract.
4. Recovery under load obeys explicit budgets and cannot self-starve the
   control plane.
5. Restarts resume or supersede recovery work deterministically.
6. Diagnostics and gates report typed root causes and measurable stability
   bars.

## Sprint Umbrella

1. [Distributed stability architecture baseline and gap matrix](../packages/archived/done-20260417-distributed-stability-architecture-baseline-and-gap-matrix.md)
2. [Critical partition quorum-neutral catch-up lane](../packages/archived/done-20260417-critical-partition-quorum-neutral-catch-up-lane.md)
3. [Priority recovery operator controller and step witnesses](../packages/archived/done-20260417-priority-recovery-operator-controller-and-step-witnesses.md)
4. [Critical visibility and authority convergence](../packages/archived/done-20260417-critical-visibility-and-authority-convergence.md)
5. [System partition placement and spread policy hardening](../packages/archived/done-20260417-system-partition-placement-and-spread-policy-hardening.md)
6. [Recovery ratekeeping and load shedding](../packages/archived/done-20260417-recovery-ratekeeping-and-load-shedding.md)
7. [Restart-safe recovery generations and resume](../packages/archived/done-20260417-restart-safe-recovery-generations-and-resume.md)
8. [Stability diagnostics and production gates](../packages/archived/done-20260417-stability-diagnostics-and-production-gates.md)
9. [Boundary scenario matrix and seven-node acceptance](../packages/archived/done-20260417-boundary-scenario-matrix-and-seven-node-acceptance.md)

## Rollout Order

1. Lock the baseline:
   - architecture gap matrix
   - critical-lane invariants
   - exit gates
2. Fix the recovery core:
   - quorum-neutral catch-up lane
   - operator controller with step witnesses
   - visibility / authority convergence
3. Harden the environment around that core:
   - critical placement and spread policy
   - ratekeeping and load shedding
   - restart-safe recovery generations
4. Make the system provable:
   - stronger diagnostics and SLO-like gates
   - deterministic boundary matrix
   - seven-node acceptance reruns

## Exit Check

1. `seven-node-read-write-load-transaction-recovery` passes on the local
   seven-node benchmark config.
2. The rolling-restart, seed-restart-under-load, and node-join-under-load
   checkpoints also pass without manual intervention.
3. Critical convergence failures no longer surface `unknown` root cause when a
   canonical witness already exists.
4. Critical recovery work has one explicit step/witness model and one restart
   resume model.
5. Each completed package ends with the required affected-area deep dive, and
   any spotted mistakes, irregularities, or doctrine violations are fixed or
   split into new package files before closure.

## Comparative Reference Set

Official references used to shape this sprint:

1. etcd learner and runtime reconfiguration:
   - https://etcd.io/docs/v3.3/learning/learner/
   - https://etcd.io/docs/v3.6/op-guide/runtime-configuration/
2. TiKV / PD scheduling and scheduling limits:
   - https://tikv.org/docs/7.1/reference/architecture/scheduling/
   - https://tikv.org/docs/7.1/deploy/configure/pd-configuration-file/
   - https://tikv.org/docs/6.1/deploy/configure/limit/
3. CockroachDB system-range replication controls:
   - https://www.cockroachlabs.com/docs/stable/configure-replication-zones
4. FoundationDB fault tolerance, status, and testing:
   - https://apple.github.io/foundationdb/fault-tolerance.html
   - https://apple.github.io/foundationdb/administration.html
   - https://apple.github.io/foundationdb/mr-status.html
   - https://apple.github.io/foundationdb/testing.html
