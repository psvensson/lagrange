# Requirements Document: Membership Lifecycle And Placement Hard Cutover

## Introduction

This spec defines a full architectural cutover for cluster membership changes,
placement and rebalancing, readiness evaluation, and metadata projection.

The current system already contains many correct building blocks:

1. published control-plane membership
2. durable owner-key workflow queues
3. a single placement planner
4. a durable workflow runtime
5. a CDC-fed system cache

The remaining failures show that these pieces still overlap semantically.
Join, restart, leave, readiness, rebalance, control-plane metadata ingress,
transport health, and cache freshness can all still influence progression of
the same lifecycle. Under rolling restart, that produces late disagreement,
priority spread deadlock, and progress that depends on whichever signal becomes
visible first.

The goal of this spec is to remove those overlaps completely.

After this cutover:

1. one owner SHALL decide cluster membership
2. one owner SHALL decide placement
3. readiness SHALL become read-only
4. CDC and cache SHALL become projection-only
5. bootstrap and join phase machinery SHALL no longer own steady-state truth
6. no runtime path from the prior design SHALL remain active as a fallback,
   compatibility shortcut, or alternate completion oracle

This is intentionally a totality spec. The system is not considered compliant
while the old progression paths still exist in active runtime code.

## Problem Statement

The present architecture is failing at a porous boundary shared by lifecycle,
placement, and metadata dissemination.

Observed failure patterns include:

1. restart and join progress depending on metadata-ingress target selection
2. priority control-plane spread depending on mixed readiness and pressure
   conditions rather than on one published topology contract
3. active-node convergence depending on more than one evidence source
4. readiness both diagnosing and participating in repair progression
5. cache freshness and authoritative repair interacting inside a single
   semantic decision
6. bootstrap and join phase code continuing to influence steady-state routing
   and admission beyond initial handoff

These are not isolated bugs. They are symptoms of one design problem: too many
components can still advance or veto the same semantic workflow.

## Architectural Thesis

The target system is three state machines and one projection:

1. Membership lifecycle machine
   - owns join, restart, leave, and the published active member set
2. Placement and rebalancing machine
   - owns desired placement and replica operation planning
3. Metadata projection machine
   - owns cache hydration, CDC catch-up, and freshness reporting only
4. Readiness projection
   - derives repair and serve decisions from the above, but owns no repair

Transport health remains an input signal. It is not a semantic owner.

## Glossary

- **Membership_Lifecycle_Controller**: The only semantic owner of member
  admission, restart re-entry, drain, removal, and publication epoch cutover.
- **Published_Membership_Epoch**: The durable epoch that defines the one
  canonical active member set for the cluster.
- **Placement_Controller**: The only semantic owner of desired replica
  placement and epoch-bound topology operations.
- **Projection_Runtime**: The cache and CDC runtime that hydrates and updates
  local metadata views but does not own topology completion semantics.
- **Authoritative_Read_Path**: The owner-routed control-plane read path used
  for lifecycle and placement decisions.
- **Projection_Read_Path**: The cache-backed read path used for steady-state
  observation and cheap local metadata access.
- **Repair_Eligible**: A derived readiness dimension meaning the node is safe
  to participate in internal control-plane and repair work.
- **Serve_Eligible**: A derived readiness dimension meaning the node is safe
  to serve ordinary client traffic.
- **Phase_Owner**: Bootstrap, join, or recovery code that exists only to bring
  runtime owners online, not to remain a steady-state owner.
- **Hard_Cutover**: Migration style in which old active paths are removed
  rather than left behind as fallback, feature-flag, or compatibility logic.

## Requirements

### Requirement 1: One Durable Membership Lifecycle Owner

**User Story:** As a distributed systems maintainer, I want one semantic owner
for join, restart, and leave so active membership cannot be inferred from
multiple competing signals.

**Rationale:** The system already has a durable publication artifact, but the
cluster still behaves as if lifecycle truth is spread across bootstrap, join,
readiness, transport, and cache. That must collapse into one owner.

#### Acceptance Criteria

1. THE system SHALL define one `Membership_Lifecycle_Controller` as the only
   owner of node admission, restart re-entry, drain, removal, and publication
   progression.
2. THE controller SHALL persist a durable lifecycle state for every member.
3. Join, restart, and leave SHALL be represented as transitions in the same
   lifecycle model rather than as separate architecture stacks.
4. No other component SHALL publish, infer, or mutate active membership as an
   independent semantic owner.
5. Runtime code SHALL not retain a second active-node derivation contract once
   the controller is cut over.

### Requirement 2: Published Membership Is The Only Active-Set Authority

**User Story:** As an operator, I want exactly one published active-node set so
rolling restart cannot end with nodes disagreeing about cluster membership.

**Rationale:** Active-node disagreement is the clearest evidence that more than
one authority still exists. The publication row must become final truth.

#### Acceptance Criteria

1. THE durable published membership artifact SHALL be the only authority for
   the canonical active-node set.
2. All convergence checks, harness success gates, restart readiness gates, and
   benchmark admission gates SHALL consume the published membership epoch and
   published active-node set.
3. Cache observation, transport connectivity, local service rows, and readiness
   snapshots SHALL not override the published active-node set.
4. If the published membership artifact is absent or non-terminal, the system
   SHALL fail closed with typed diagnostics instead of falling back to an
   alternate active-set contract.
5. Legacy active-node derivation paths SHALL be removed from active runtime
   decisions after cutover.

### Requirement 3: Restart Is A Membership Transition, Not A Separate System

**User Story:** As a maintainer, I want restart to reuse the same lifecycle
machine as join and leave so recovery behavior is understandable and resumable.

**Rationale:** Restart brittleness comes from treating restart as a special
blend of bootstrap, join, durable rejoin hints, cache hydration, and transport
repair. The design should instead model restart as an existing member moving
back through the lifecycle controller.

#### Acceptance Criteria

1. THE lifecycle model SHALL represent restart as a transition for an existing
   member identity, not as a second architecture beside join.
2. Durable restart progression SHALL resume from canonical lifecycle state,
   not from ad hoc startup classification heuristics alone.
3. `BootstrapService` and `NodeJoiningService` SHALL become ingress adapters or
   phase runners for lifecycle intent; they SHALL not remain separate semantic
   owners of restart truth.
4. Rejoin hints or startup hints MAY exist as inputs, but SHALL not become a
   second lifecycle authority.
5. Completion semantics for restart SHALL be owned by the lifecycle controller
   and published membership, not by cache visibility or message-group routing
   heuristics.

### Requirement 4: Placement Consumes Published Membership Only

**User Story:** As an operator, I want rebalance and placement to depend on one
published topology contract so priority spread cannot deadlock behind mixed
control conditions.

**Rationale:** Placement today still consumes more than membership and health.
It also depends on startup gates, publication gating special cases, and mixed
budget semantics. That must narrow.

#### Acceptance Criteria

1. THE `Placement_Controller` SHALL be the only semantic owner of desired
   placement and epoch-bound topology planning.
2. Placement planning SHALL consume:
   - published membership epoch
   - health inputs
   - current authoritative replica state
   and no second topology truth.
3. `UnifiedRebalancer` MAY remain the orchestration owner, but it SHALL not
   consume unpublished membership as if it were stable cluster truth.
4. If the published membership epoch changes, in-flight placement decisions for
   the prior epoch SHALL be invalidated through the canonical owner path.
5. Special-case placement progression paths keyed to bootstrap or join phases
   SHALL be removed from steady-state rebalance semantics after cutover.

### Requirement 5: Priority Control-Plane Spread Is A Placement Invariant

**User Story:** As a reliability engineer, I want priority partition spread to
be enforced as a first-class placement invariant so control-plane recovery does
not depend on opportunistic retries.

**Rationale:** Priority partitions are currently both business-critical and too
entangled with startup gating. Spread must be explicit in placement, not a
side effect of other readiness loops.

#### Acceptance Criteria

1. THE placement owner SHALL treat priority control-plane spread as a mandatory
   invariant when planning and validating placement.
2. Budget, in-flight operation limits, and authoritative reads required for
   priority control-plane placement SHALL execute with critical semantics.
3. Non-priority work SHALL not progress in ways that bypass the priority spread
   invariant.
4. Priority spread success or failure SHALL be exposed as placement diagnostics,
   not inferred indirectly from cache rows.
5. Legacy retry loops that attempt to compensate for missing priority-spread
   ownership SHALL be removed after cutover.

### Requirement 6: Readiness Becomes Read-Only

**User Story:** As a maintainer, I want readiness to explain the system rather
than repair it so lifecycle and placement semantics stop depending on hidden
readiness side effects.

**Rationale:** The current readiness service is too powerful. It diagnoses,
reconciles, and can participate in repair decisions. That confuses ownership.

#### Acceptance Criteria

1. `ControlPlaneReadinessService` SHALL become a read-only projection owner.
2. Readiness SHALL derive at least:
   - `repairEligible`
   - `serveEligible`
   - typed reason codes
3. Readiness SHALL not perform semantic progression, publish membership,
   complete placement, or act as a repair writer.
4. Any authoritative repair or reconciliation currently embedded in readiness
   SHALL be moved behind explicit owner-key reconcilers.
5. Internal control-plane consumers SHALL use `repairEligible`; routing and
   external traffic admission SHALL use `serveEligible`.

### Requirement 7: CDC And Cache Are Projection-Only

**User Story:** As an operator, I want the cache and CDC pipeline to remain the
observational read model without serving as a second control-plane oracle.

**Rationale:** The cache is necessary, but it is still participating too much
in lifecycle completion semantics. That is the wrong abstraction boundary.

#### Acceptance Criteria

1. `SystemTableCache` SHALL remain the steady-state read model for
   CDC-propagated metadata.
2. Cache hydration, CDC replay, freshness watermarks, and divergence reporting
   SHALL be owned by the projection runtime only.
3. Membership or placement completion SHALL not be inferred from cache
   visibility alone.
4. Cache divergence MAY trigger diagnostics and owner-queue repair signals, but
   SHALL not trigger a second direct mutation path.
5. Runtime correctness SHALL not depend on phase-owned CDC bridges after phase
   completion.

### Requirement 8: Phase Code Must Hand Off Completely

**User Story:** As a platform engineer, I want bootstrap and join code to bring
runtime owners online and then get out of the way so steady-state correctness
does not depend on phase machinery.

**Rationale:** The doctrine is explicit here: phase code must hand off
completely. Current restart behavior still shows phase-owned routing and
message-group selection influencing runtime convergence.

#### Acceptance Criteria

1. Bootstrap and join phases SHALL own initialization only.
2. By phase completion, all steady-state lifecycle, placement, readiness, and
   projection responsibilities SHALL have been transferred to runtime owners.
3. No phase-scoped message-group ingress, cache bridge, or lifecycle shortcut
   SHALL remain the only live runtime path after handoff.
4. Phase completion SHALL reduce temporary machinery instead of leaving a live
   compatibility path behind.
5. Old phase-owned steady-state logic SHALL be removed, not merely bypassed.

### Requirement 9: Control-Plane Reads Use Two Explicit Paths Only

**User Story:** As a maintainer, I want control-plane reads to use either the
projection path or the authoritative owner path so semantic decisions are easy
to audit.

**Rationale:** The current gateway is compensating for too many mixed-source
callers. A hard cutover needs explicit read classes.

#### Acceptance Criteria

1. THE system SHALL define exactly two control-plane read classes:
   - `Projection_Read_Path`
   - `Authoritative_Read_Path`
2. Semantic lifecycle and placement decisions SHALL use the authoritative read
   path only.
3. Steady-state observation and local convenience reads MAY use the projection
   read path.
4. Mixed cache-and-authoritative fallback inside one semantic decision SHALL be
   forbidden in active runtime code.
5. `ControlPlaneSystemTableGateway` or its replacement SHALL enforce the read
   class boundaries structurally.

### Requirement 10: Transport Is Evidence, Not Truth

**User Story:** As a distributed systems maintainer, I want transport health to
inform lifecycle and readiness without becoming a second membership owner.

**Rationale:** Transport must matter, but it must not be able to redefine who
is active. It is an input into publication and readiness, not a substitute.

#### Acceptance Criteria

1. Transport connectivity MAY contribute health evidence used by lifecycle or
   readiness owners.
2. Transport connectivity SHALL not publish or override active membership on
   its own.
3. Message-group routing, router connection state, and endpoint visibility
   SHALL not become alternate membership truth.
4. If transport evidence conflicts with published membership, the system SHALL
   preserve published membership as truth and emit typed diagnostics.
5. Legacy transport-driven shortcuts for lifecycle completion SHALL be removed
   from active control-plane progression.

### Requirement 11: Hard Cutover Removes The Old Design Completely

**User Story:** As an architect, I want the refactor to complete in totality so
the old design cannot still influence runtime behavior after the new owners are
introduced.

**Rationale:** The repository doctrine forbids dual paths. This spec is not
successful if the new model exists alongside legacy fallback semantics.

#### Acceptance Criteria

1. No feature flag, compatibility branch, or fallback path SHALL leave both the
   old and new lifecycle semantics active for the same concern.
2. Legacy join/restart progression branches that duplicate lifecycle ownership
   SHALL be removed after delegation cutover is verified.
3. Legacy readiness-side repair paths SHALL be removed from active runtime
   semantics.
4. Legacy cache-as-proof or phase-owned runtime progression paths SHALL be
   removed from active runtime semantics.
5. Completion SHALL require a deletion inventory proving which old paths were
   removed.

### Requirement 12: Deterministic Regression Closure And Architecture Guards

**User Story:** As a test owner, I want this architectural cutover to be locked
in by deterministic tests and structural guards so the old porous boundary does
not return.

**Rationale:** Distributed reruns should confirm the fix, not discover it.

#### Acceptance Criteria

1. Each failure class closed by this spec SHALL have a targeted deterministic
   regression before broader harness confirmation.
2. Tests SHALL prove:
   - published membership is the only active-set authority
   - restart re-entry uses the lifecycle owner path
   - placement consumes published membership only
   - readiness is read-only
   - cache is observational, not proof of completion
   - phase handoff leaves no phase-owned live runtime dependency
3. Structural import or API boundary guards SHALL fail if non-owner runtime
   code bypasses the canonical lifecycle or placement owner path.
4. Distributed harness reruns SHALL verify one published membership epoch and
   one published active-node set across rolling restart, join under load, and
   seed restart under load.
5. The spec SHALL not be marked complete while only unit tests pass and the
   deletion gates remain unverified.

### Requirement 13: Architecture And Operations Documentation Must Match

**User Story:** As a maintainer, I want the architecture documents and runbooks
to describe only the new ownership model so future work does not rebuild the
old one.

**Rationale:** If the documents still describe mixed owners, the code will drift
back there.

#### Acceptance Criteria

1. `architecture.md` SHALL document the lifecycle controller, placement owner,
   projection boundary, and readiness projection as the canonical model.
2. Architecture docs SHALL remove obsolete descriptions of old active runtime
   fallback semantics.
3. Operations documentation SHALL explain how to interpret published
   membership, placement invariants, projection freshness, and typed
   disagreement diagnostics.
4. The final architecture text SHALL make it clear that cache and transport are
   evidence sources, not alternate membership owners.
5. The spec task plan SHALL trace documentation updates to these requirements.