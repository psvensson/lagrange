# Seed Initial Publication Establishment State Machine

## Why

The latest distributed reruns all fail before workload-specific logic matters.
The seed never establishes the first authoritative publication epoch, and the
rest of startup keeps interpreting that absence indirectly.

The system needs one explicit owner workflow for first publication
establishment, not another layer of diagnostics-based inference.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
3. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Seed Startup Authority and Initial Publication Establishment Sprint](../sprints/active-2026-q2-seed-startup-authority-and-initial-publication-establishment.md)

## In Scope

1. Define one seed-owned state model for initial publication establishment.
2. Separate at least:
   `initializing`
   `recovery_pending`
   `authority_unavailable`
   `published`
   `blocked`
3. Make first publication establishment consume authoritative seed-side inputs
   instead of bootstrap-local projections.
4. Surface the state and blocker reason directly in bootstrap/readiness
   diagnostics and failure artifacts.

## Out Of Scope

1. General membership algorithm redesign.
2. Workload-path recovery after startup is already authoritative.
3. Timeout inflation as a substitute for a missing state transition.

## Invariants

1. `publishedControlPlaneEpoch = null` must not be interpreted through multiple
   local fallback meanings.
2. First publication establishment has one owner and one explicit blocker
   vocabulary.
3. The seed does not report superficial startup progress when authority is
   genuinely unavailable.

## Hotspots

1. `src/control-plane/control-plane-readiness-service.js`
2. `src/control-plane/membership-publication-coordinator.js`
3. `src/bootstrap/owners/bootstrap-readiness-owner.js`
4. `src/bootstrap/startup-recovery-coordinator.js`
5. `src/admin/admin-control-snapshot.js`

## Detection / Analysis Tasks

- [ ] Trace the exact transition path from seed startup to first published
      control-plane epoch.
- [ ] Inventory every place where `publishedControlPlaneEpoch = null` is mapped
      to a local meaning.
- [ ] Confirm where `authority_unavailable` and `recovery_pending` still share
      the same local reason path.

## Implementation Tasks

- [ ] Introduce one explicit initial-publication establishment state model at
      the readiness/publication seam.
- [ ] Make bootstrap-readiness and startup-recovery consume that state instead
      of rebuilding it from raw diagnostics.
- [ ] Remove local fallback logic that interprets first-publication absence
      differently per consumer.
- [ ] Expose first-publication state and blocker reason directly in diagnostics
      and harness failure evidence.

## Validation

1. Startup diagnostics clearly show whether the seed is progressing,
   recovering, blocked, or missing authority.
2. The seven-scenario rerun no longer fails behind an ambiguous
   `publishedControlPlaneEpoch = null` state.

## Done When

1. First publication establishment is an explicit owner workflow.
2. Seed-side startup authority is no longer inferred from mixed diagnostics.
3. Any remaining failure after this package is a new explicit invariant breach.

## 2026-04-12 execution update

Status: structurally advanced, runtime blocker remains.

What landed:
- readiness-owned startup authority snapshot now exists and explicitly classifies seed startup authority availability
- bootstrap recovery evaluation now consumes startup authority instead of reconstructing seed authority locally

Validation:
- new startup-authority unit coverage passed
- distributed scenarios still fail before first authoritative publication is established on the seed

Current conclusion:
- the missing transition is inside seed-side initial publication establishment, not in outer bootstrap consumers

## 2026-04-12 pre-implementation analysis

### Working diagnosis

The live startup failure is most plausibly a state-model problem, not a timeout-budget problem.

Observed fixed point:
- `publishedControlPlaneEpoch = null`
- `publishedControlPlaneStatus = null`
- bootstrap remains `DEGRADED`
- reason remains `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`
- rebalancer repeatedly reports `availableNodeCount = 1`

This suggests the seed is not crossing the first authoritative publication boundary at all.

### Why nullable publication fields are too weak

A raw nullable epoch/status pair cannot distinguish between:
- unpublished by design
- publication establishment in progress
- publication authoritatively established
- observation unavailable
- inconsistent observation

That ambiguity allows pre-publication bootstrap to be misread as degraded steady-state recovery.

### Proposed state machine

Define one explicit owner-level `initialPublicationState`:
- `seed_local_not_ready`
- `seed_locally_ready_unpublished`
- `establishing_initial_publication`
- `initial_publication_written_local`
- `initial_publication_authoritative`
- `published_startup_cohort_open`
- `steady_state_recovery`
- `blocked`

State meanings:
- `seed_local_not_ready`: local preconditions for first publication are not yet met
- `seed_locally_ready_unpublished`: seed may create first publication; absence of epoch is expected and non-error
- `establishing_initial_publication`: owner is actively writing / reconciling first publication
- `initial_publication_written_local`: publication row exists locally but authority / observation is not closed yet
- `initial_publication_authoritative`: first publication is authoritatively visible
- `published_startup_cohort_open`: bootstrap and rebalancer may use the published startup cohort
- `steady_state_recovery`: normal post-publication recovery semantics apply
- `blocked`: owner has a concrete blocker and reason

### Contract changes implied

1. Replace nullable publication phase inference with explicit state objects.
2. Make one owner responsible for `0 -> 1` publication establishment.
3. Do not let bootstrap/rebalancer treat `unpublished` as `authority_unavailable`.
4. Normalize any legacy `null` epoch/status to explicit state at ingress.

### Hypotheses to test next

1. First publication establishment is gated on the same startup-authority cohort it is supposed to create.
2. The seed never enters an explicit `seed_locally_ready_unpublished` state; it jumps from local readiness concerns straight to degraded recovery logic.
3. The write path for first publication is either unscheduled or hidden behind observation-oriented policy.

### What would falsify this analysis

1. A single owner already exists for initial publication establishment and clearly logs transition attempts and failures.
2. The seed already enters a distinct unpublished-but-eligible phase and still fails for a concrete storage or owner-RPC error.
3. Rebalancer availability does not influence the first publication writer's ability to run.

### Implementation constraint

Do not add a new startup framework or extra owner layer.

Use and extend existing components:
- `ControlPlaneReadinessService`
- `MembershipPublicationCoordinator`
- `BootstrapReadinessOwner`
- `StartupRecoveryCoordinator`

The target is consolidation, not another wrapper.

## 2026-04-12 implementation slice

Implemented within existing owners/services:
- explicit unpublished observation classification in `recovery-protocol-snapshot`
- explicit startup-authority state `seed_locally_ready_unpublished`
- startup authority now distinguishes `unpublished` from `authority_unavailable`

Important consequence:
- raw nullable publication fields are no longer the only phase signal on this path
- the system now has an explicit owner-carried pre-publication startup state without adding a new subsystem

Validation:
- `test/control-plane/unpublished-recovery-protocol-snapshot.test.js`
- `test/control-plane/startup-authority-snapshot.test.js`
- `test/bootstrap/startup-authority-consumption.test.js`
