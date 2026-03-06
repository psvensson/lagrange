# Requirements Document

## Introduction

This document specifies requirements for improving control-plane readiness,
placement admission, metadata publication reliability, timeout-budget handling,
and managed partition-split orchestration.

The goal is to make this part of the system easier to understand, less brittle,
and easier to extend by:

1. Making control-plane readiness explicit and machine-readable
2. Expanding `StorageAdmissionService` into the single admission owner for
   provisioning decisions
3. Making split admission denial durable and diagnosable instead of surfacing
   as a generic workflow failure
4. Making metadata publication mode explicit and observable
5. Treating exact-boundary timeouts as correctness bugs with structured
   diagnostics and targeted regression coverage

Motivating failure evidence came from the 7-node partition-split harness run on
March 4, 2026, where:

1. the managed split did not start because too few target nodes were eligible
2. the failure surfaced operationally as a split problem instead of an
   admission problem
3. one node showed repeated exact-boundary timeouts at 4s, 6s, and 30s

## Glossary

- **Control-Plane Readiness**: Multi-dimensional health and eligibility state
  used for routing, provisioning, and control-plane writes
- **Placement Admission**: Canonical decision on whether the system may safely
  create or move replicas
- **Metadata Publication Mode**: Current operating mode of the metadata
  publication owner, such as grouped or conservative fanout
- **Managed Split Workflow**: Durable workflow that prepares, provisions,
  backfills, catches up, and cuts over a partition split
- **Exact-Boundary Timeout**: A timeout occurring exactly at a configured
  constant boundary such as 4s, 6s, 30s, or 60s
- **Blocked Split**: A split candidate that was not admitted and is recorded as
  blocked or deferred rather than failed mid-execution

## Requirements

### Requirement 1: Explicit Control-Plane Readiness Ownership

**User Story:** As an engineer, I want a single owner for control-plane
readiness classification, so that routing, placement, and workflow code do not
re-derive eligibility differently.

#### Acceptance Criteria

1. THE system SHALL introduce a first-class readiness owner named
   `ControlPlaneReadinessService`
2. THE readiness owner SHALL expose separate dimensions for:
   - processAlive
   - clusterMemberHealthy
   - routingReady
   - loadReady
   - placementEligible
   - controlPlaneWritable
   - metadataPublicationHealthy
3. THE readiness owner SHALL derive its result from canonical owners only
4. THE readiness owner SHALL expose stable reason codes for every non-ready
   dimension
5. THE readiness result SHALL be machine-readable and available to diagnostics
   and admission paths without requiring raw log inspection

### Requirement 2: Canonical Placement Admission Ownership

**User Story:** As a control-plane engineer, I want one canonical admission
owner for provisioning decisions, so that split, rebalancing, and replacement
workflows do not implement their own eligibility logic.

#### Acceptance Criteria

1. `StorageAdmissionService` SHALL be expanded into the single owner for
   provisioning admission
2. WHEN a workflow needs to bootstrap split children, add replicas, or create
   replacement replicas THEN it SHALL obtain an admission decision from
   `StorageAdmissionService`
3. THE admission result SHALL include:
   - allowed
   - decisionType
   - operationType
   - requiredReplicaCount
   - eligibleNodeIds
   - ineligibleNodes
   - blockingReasons
   - decisionTimestamp
4. THE admission result SHALL include stable reason codes for ineligible nodes
   and blocking conditions
5. THE system SHALL NOT keep parallel workflow-local target eligibility logic
   once the admission owner is in use

### Requirement 3: Durable Split Admission Outcomes

**User Story:** As an operator, I want split admission denial to be recorded as
durable blocked or deferred workflow state, so that I can tell whether a split
was not attempted or failed during execution.

#### Acceptance Criteria

1. WHEN a split candidate is evaluated THEN the workflow SHALL enter an
   `admission_pending` state before execution begins
2. WHEN admission is denied THEN the workflow SHALL persist `blocked` or
   `deferred` state instead of surfacing only a generic execution error
3. THE persisted workflow state SHALL include structured admission reasons
4. THE workflow SHALL distinguish between:
   - admission denial
   - publication-health blocking
   - timeout-budget failure
   - split execution failure
5. RETRYING a blocked or deferred split SHALL be idempotent

### Requirement 4: Explicit Metadata Publication Mode

**User Story:** As a distributed systems engineer, I want the metadata
publication subsystem to expose its operating mode explicitly, so that other
components can consume one canonical health signal.

#### Acceptance Criteria

1. `CDCGroupPropagationService` SHALL remain the single owner of metadata
   publication mode
2. THE publication owner SHALL expose one current mode from a stable set of
   modes
3. THE initial required publication modes SHALL include:
   - `grouped`
   - `conservative_fanout`
   - `repair_only`
4. WHEN publication mode changes THEN the system SHALL record a reason code and
   timestamp
5. ADMISSION and diagnostics SHALL consume publication health only through
   canonical owner outputs

### Requirement 5: Canonical Timeout-Budget Contract

**User Story:** As an engineer debugging distributed failures, I want timeout
budgets to compose consistently, so that exact-boundary timeout clusters can be
identified as correctness bugs and fixed deterministically.

#### Acceptance Criteria

1. THE system SHALL define a canonical timeout-budget contract for
   control-plane operations
2. NESTED operations SHALL derive budgets from remaining time, not from fresh
   fixed constants
3. THE system SHALL classify timeout failures into stable categories including:
   - local scheduler starvation
   - remote call timeout
   - publication wait timeout
   - cache-visibility timeout
   - absolute deadline exhausted
4. WHEN remaining budget is below the minimum viable threshold for a
   sub-operation THEN that sub-operation SHALL NOT be started
5. EXACT-boundary timeout clusters SHALL emit structured diagnostics suitable
   for targeted regression tests

### Requirement 6: Structured Diagnostics Surface

**User Story:** As an operator, I want structured diagnostics for readiness,
admission, publication mode, and timeout failures, so that I can diagnose a
failed run from reports and failure bundles instead of log archaeology.

#### Acceptance Criteria

1. THE system SHALL expose per-node readiness dimensions and reasons
2. THE system SHALL expose per-node placement-eligibility explanations
3. THE system SHALL expose current metadata publication mode and recent mode
   transitions
4. THE system SHALL expose per-workflow admission decisions and blocking reasons
5. FAILURE bundles SHALL include the structured diagnostics for affected nodes
   and workflows

### Requirement 7: Shared Adoption Across Topology-Changing Workflows

**User Story:** As a maintainer, I want the new readiness and admission model to
be reused by all provisioning workflows, so that the system converges on one
owner path instead of gaining another split-only subsystem.

#### Acceptance Criteria

1. `ManagedSplitWorkflow` SHALL consume `StorageAdmissionService`
2. REPLICA replacement workflows SHALL consume `StorageAdmissionService`
3. REBALANCE add workflows SHALL consume `StorageAdmissionService`
4. THE system SHALL remove superseded workflow-local admission logic as each
   owner-path migration completes
5. ARCHITECTURE documentation SHALL identify the canonical owners for readiness,
   admission, and publication mode

### Requirement 8: Regression Coverage for Run-Discovered Failures

**User Story:** As a developer, I want deterministic tests for the failure
classes seen in the 7-node baseline, so that those issues do not remain
reproducible only in long harness runs.

#### Acceptance Criteria

1. THE implementation SHALL add targeted tests for blocked split admission with
   insufficient eligible nodes
2. THE implementation SHALL add targeted tests for degraded publication mode
   affecting admission
3. THE implementation SHALL add targeted tests for exact-boundary timeout
   classification
4. THE tests SHALL follow the repo limits:
   - unit tests under 2 seconds
   - integration tests under 30 seconds
5. A 7-node harness failure in this area SHALL be diagnosable primarily through
   structured artifacts rather than raw log inspection
