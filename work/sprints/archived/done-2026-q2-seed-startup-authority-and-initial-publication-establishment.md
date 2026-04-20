# Seed Startup Authority and Initial Publication Establishment Sprint (AGPL)

## Goal

Break the seed-side startup authority loop so the cluster can establish its
first authoritative control-plane publication epoch without circular dependency
between publication truth, readiness truth, and available-node policy.

This is not a timeout-budget sprint. The target is one explicit startup
authority contract and one linear initial-publication establishment path.

## Why This Sprint Exists

The latest seven-scenario distributed rerun no longer fragments into several
runtime failure families. All seven scenarios now fail early behind the same
shape:

1. seed phase `DEGRADED`
2. reason `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`
3. `publishedControlPlaneEpoch = null`
4. `publishedControlPlaneStatus = null`
5. bootstrap blocker `control_snapshot_authority_unavailable`
6. rebalancer `availableNodeCount = 1` while `healthyReplicaCount = 3`

That is not ordinary slow startup. It means runtime policy is holding the
cluster in a pre-authoritative state even though enough physical runtime is
already present to form replicas. The remaining problem is structural:

1. startup authority is still reconstructed across bootstrap, readiness, and
   recovery layers
2. initial publication establishment is not expressed as one explicit owner
   workflow
3. rebalancer availability and bootstrap readiness still consume overlapping,
   not identical, node-cohort semantics

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
3. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)

## Relationship to Prior Sprint

This sprint is a focused follow-on to:

1. [Runtime Completion Contracts and Owner Simplification Sprint](../sprints/archived/done-2026-q2-runtime-completion-contracts-and-owner-simplification.md)

Related contract-hardening follow-on:

1. [Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

That sprint simplified several owner paths and removed broad ambiguity. This
new sprint targets the one runtime blocker that remained once the rest of the
system stopped failing first.

## Sprint Umbrella

1. [Seed initial publication establishment state machine](../packages/active-20260412-seed-initial-publication-establishment-state-machine.md)
2. [Startup authority and available-node contract unification](../packages/archived/done-20260412-startup-authority-and-available-node-contract-unification.md)
3. [Publication observation ingress and bootstrap consumer collapse](../packages/archived/done-20260412-publication-observation-ingress-and-bootstrap-consumer-collapse.md)

## Simplification Rules

1. One startup-authority answer must drive bootstrap, readiness, rebalancer,
   and harness startup evaluation.
2. Initial publication establishment must be a linear owner workflow, not a
   bag of conditionals spread across consumers.
3. `authority_unavailable` and `recovery_pending` must be distinct explicit
   states.
4. Available-node policy must not depend on a weaker or different cohort
   contract than startup authority.
5. Read-only observation must not advance publication workflow.
6. Do not solve this sprint by extending startup timeouts unless progress is
   demonstrably monotonic.

## Completed-When Architecture

At sprint exit, the startup path should have three explicit contracts:

1. one seed-owned initial publication establishment state machine
2. one startup-authority snapshot reused by bootstrap and rebalancer
3. one publication-observation ingress through the readiness owner

Everything else should consume those contracts rather than reconstructing
startup truth locally.

## Active Queue

1. [Seed initial publication establishment state machine](../packages/active-20260412-seed-initial-publication-establishment-state-machine.md)

## Out-of-Scope for This Sprint

1. Broad rebalancer redesign outside startup-authority semantics.
2. General transport-stack redesign.
3. Blanket startup timeout increases used to mask a circular dependency.
4. Workload-path optimization outside the startup blocker.
5. Pro or Enterprise-only operational work not mapped to AGPL ownership in
   `edition-matrix.md`.

## Rollout Order

1. Define the first-publication establishment state machine on the seed path.
2. Collapse bootstrap and rebalancer onto one startup-authority and
   available-node contract.
3. Remove remaining publication-observation bypasses and consumer-local
   startup-authority reconstruction.
4. Re-run the seven-scenario distributed set and treat any remaining failure as
   a new runtime family, not as continuation of the old ambiguity.

## Exit Check

1. The seed can distinguish `authority_unavailable` from legitimate
   `recovery_pending` through one owner-owned answer.
2. `availableNodeCount` and startup-authority node cohorts are derived from the
   same contract.
3. Bootstrap consumers no longer reconstruct startup authority from raw
   diagnostics or weaker node-status fallbacks.
4. The seven-scenario distributed rerun either stabilizes or reduces to one
   new explicit invariant breach after first publication is established.

## 2026-04-12 execution update

Execution status: implemented and validated.

Implemented slices:
- readiness-owned startup authority snapshot and consumer wiring
- startup-authority and available-node contract unification across bootstrap, join, and rebalancer
- publication observation ingress remains readiness-owned and read-only for bootstrap consumers

Focused unit validation passed for the new startup-authority suites and the touched bootstrap, readiness, and rebalancer suites.

Distributed validation result:
- `0/7` scenarios passed
- all 7 scenarios now fail in the same early seed-startup family
- failure window is roughly `96s` to `100s`
- dominant live shape remains `DEGRADED` with `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`
- seed bootstrap never establishes first authoritative publication / control-snapshot authority
- rebalancer still reports `availableNodeCount=1` while healthy replicas already exist

Conclusion:
- this sprint removed consumer-layer ambiguity and made startup authority explicit
- the remaining blocker is deeper than bootstrap consumer policy
- the next target is seed-side initial publication establishment itself

## 2026-04-12 pre-implementation analysis note

### Why this does not look like timeout tuning

The last distributed reruns do not show slow monotonic progress. They show an early stable fixed point:
- `publishedControlPlaneEpoch = null`
- `publishedControlPlaneStatus = null`
- bootstrap phase `DEGRADED`
- reason `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`
- repeated rebalancer `availableNodeCount = 1`

That shape suggests a startup authority loop, not raw machine slowness.

### Primary hypotheses

1. Circular dependency between startup authority and first publication establishment.
   - bootstrap waits for startup authority
   - startup authority depends on authoritative publication / control snapshot
   - rebalancer availability is constrained by startup authority
   - first authoritative publication may itself depend on the node cohort that rebalancer/bootstrap keep closed

2. Pre-publication bootstrap is being interpreted with steady-state recovery semantics.
   - `null` publication fields are likely being treated as authority failure instead of a distinct `not yet established` phase

3. The `0 -> 1` publication transition still lacks one hard owner.
   - consumer-side unification did not move runtime behavior
   - that suggests the missing transition is in publication establishment itself, not in how consumers interpret it

### Disproof criteria

1. Hypothesis 1 is false if the seed can attempt initial publication without any startup-authority / available-node gate and fails for a concrete write-side reason.
2. Hypothesis 2 is false if pre-publication bootstrap already has an explicit non-error state and the seed transitions through it before failure.
3. Hypothesis 3 is false if one single owner method is responsible for first publication establishment and has deterministic entry, exit, and failure accounting.

### Why `null` is a problem here

`null` currently appears to stand in for more than one meaning:
- first publication has not been created yet
- publication exists but is not yet authoritatively observed
- control-snapshot authority is unavailable
- observation path could not determine the answer

Those are different states. Allowing `null` at the contract boundary collapses protocol phase and observation failure into one value.

### State-definition direction

The system should stop using raw nullable publication fields as protocol state. Use explicit lifecycle/state objects instead.

Recommended split:
- `publicationEstablishmentState`
- `publicationObservationState`
- `startupAuthorityState`

Recommended initial publication establishment states:
- `seed_local_not_ready`
- `seed_locally_ready_unpublished`
- `establishing_initial_publication`
- `initial_publication_written_local`
- `initial_publication_authoritative`
- `published_startup_cohort_open`
- `steady_state_recovery`
- `blocked`

Recommended observation states:
- `unpublished`
- `establishing`
- `authoritative`
- `observation_unavailable`
- `inconsistent`

### Null-elimination rule

Within the runtime core, `epoch` and `status` should not be used as nullable phase indicators.

Instead:
- `publicationObservationState` is always required
- `epoch` is present only when the state semantically guarantees an epoch exists
- `status` is present only when publication has actually been established
- legacy nullable inputs, if any, should be normalized immediately at the ingress boundary

### Implementation consequence

The next implementation pass should begin by defining one explicit state table for initial publication establishment and making one owner responsible for all `0 -> 1` transitions. Only after that should consumer policy be adjusted.

### Implementation constraint

Do not introduce a new subsystem or parallel layer for startup authority.

Required approach:
- extend existing readiness / bootstrap / publication owners
- concentrate `0 -> 1` publication establishment responsibility into an existing owner boundary
- normalize nullable legacy fields at existing ingress points
- remove duplicated inference instead of adding another abstraction beside it

## 2026-04-12 implementation slice: explicit unpublished startup state

Implemented:
- reused the existing recovery-protocol snapshot to expose explicit `publicationObservationState`
- classified no-publication startup as `unpublished` instead of collapsing it into generic authority absence
- made startup authority treat unpublished observation as an explicit pre-publication state (`seed_locally_ready_unpublished`)
- extended `MembershipPublicationCoordinator` with cache-backed sync planning derivation
- made `ControlPlaneReadinessService` consume coordinator-owned planning answers directly
- removed the readiness/publication planning cycle on the startup-authority path by disabling nested planning recursion for the readiness-owned call path

Focused validation passed:
- recovery protocol snapshot tests
- startup authority snapshot tests
- startup authority consumption tests
- membership publication coordinator suite
- control-plane readiness service suite
- bootstrap API suite

This slice did not rerun distributed scenarios yet.
