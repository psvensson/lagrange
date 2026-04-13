# Implementation Tasks

## Overview

This task list implements the control-plane admission and partition-split
reliability requirements. Tasks are organized to preserve the single-owner
architecture: readiness first, then admission, then workflow adoption, then
shared rollout and diagnostics hardening.

## Task List

### 1. ControlPlaneReadinessService (Requirement 1)

- [x] 1.1 Create `ControlPlaneReadinessService`
  - Add `src/control-plane/control-plane-readiness-service.js`
  - Define canonical readiness dimensions
  - Define stable reason-code constants

- [x] 1.2 Route canonical owner reads through the readiness service
  - Read node lifecycle state from the canonical lifecycle owner
  - Read routing/load information from canonical system metadata
  - Read storage eligibility from storage owners
  - Read publication mode from `CDCGroupPropagationService`

- [x] 1.3 Add unit tests for readiness classification
  - Create `test/control-plane/control-plane-readiness-service.test.js`
  - Cover ready, partially ready, and ineligible nodes
  - Verify stable reason-code output
  - Keep runtime under 2 seconds

### 2. StorageAdmissionService Expansion (Requirement 2)

- [x] 2.1 Extend `StorageAdmissionService` result shape
  - Add structured provisioning result fields
  - Add stable blocking reason codes
  - Preserve one canonical admission owner

- [x] 2.2 Make `StorageAdmissionService` consume readiness output
  - Inject `ControlPlaneReadinessService`
  - Remove duplicated node-eligibility derivation where replaced
  - Validate operation types for split, replace, and rebalance add

- [x] 2.3 Add unit tests for provisioning admission
  - Create or extend `test/rebalancer/storage-admission-service.test.js`
  - Cover admitted, blocked, and deferred results
  - Cover insufficient eligible nodes and degraded publication mode
  - Keep runtime under 2 seconds

### 3. Managed Split Workflow Adoption (Requirement 3)

- [x] 3.1 Route `ManagedSplitWorkflow` through `StorageAdmissionService`
  - Remove split-local target-eligibility logic once replaced
  - Persist `admission_pending` before execution
  - Persist blocked/deferred workflow state on denial

- [x] 3.2 Extend workflow metadata for admission details
  - Store compact admission results in split workflow metadata
  - Distinguish admission denial from execution failure
  - Preserve idempotent retries

- [x] 3.3 Add owner-path tests for split admission
  - Extend `test/partition/managed-split-workflow.test.js`
  - Prove `ManagedSplitWorkflow` consumes the admission owner
  - Verify blocked/deferred outcomes are durable
  - Keep runtime under 2 seconds

### 4. Metadata Publication Mode Surface (Requirement 4)

- [x] 4.1 Expose canonical publication mode from `CDCGroupPropagationService`
  - Add stable mode constants
  - Add reason-code and timestamp tracking for mode transitions
  - Expose read-only diagnostics output

- [x] 4.2 Add unit tests for publication mode transitions
  - Extend `test/topology/cdc-group-propagation-service.test.js`
  - Verify grouped, conservative fanout, and repair-only mode reporting
  - Verify transition reasons are preserved
  - Keep runtime under 2 seconds

### 5. Timeout-Budget Contract (Requirement 5)

- [x] 5.1 Define a shared timeout-budget contract
  - Add shared constants and classification helpers
  - Define exact-boundary detection and deadline-exhaustion categories

- [x] 5.2 Migrate exact-boundary-prone control-plane paths
  - Audit split admission, metadata visibility waits, and admin query waits
  - Convert nested timeouts to use remaining budget
  - Refuse sub-operations when remaining budget is below threshold

- [x] 5.3 Add targeted timeout-boundary regressions
  - Add unit or integration tests for 4s, 6s, 30s, and 60s boundaries where
    those budgets remain configured
  - Verify exact-boundary hits are classified, not silently retried
  - Keep unit tests under 2 seconds and integration tests under 30 seconds

### 6. Diagnostics and Failure Bundle Integration (Requirement 6)

- [x] 6.1 Expose structured readiness and admission diagnostics
  - Add admin/control snapshot fields for readiness vectors and admission
    reasons
  - Avoid log-only explanations

- [x] 6.2 Extend failure bundle generation
  - Include readiness vectors for affected nodes
  - Include publication mode state
  - Include workflow admission results
  - Include timeout classifications where present

- [x] 6.3 Add tests for structured failure artifacts
  - Extend `test/distributed/harness/__tests__/failure-bundle.test.js`
  - Verify new diagnostics sections are emitted
  - Keep runtime under 2 seconds

### 7. Shared Workflow Adoption (Requirement 7)

- [x] 7.1 Route replacement replica flows through the admission owner
  - Remove superseded local admission checks as owner migration completes
  - Preserve storage and policy gating

- [x] 7.2 Route rebalance-add flows through the admission owner
  - Reuse the same provisioning result model
  - Preserve one decision path for topology-changing workflows

- [x] 7.3 Update architecture documentation
  - Document `ControlPlaneReadinessService` as the readiness owner
  - Document expanded `StorageAdmissionService` as the admission owner
  - Document `CDCGroupPropagationService` as the publication-mode owner

### 8. Deterministic Regression Coverage (Requirement 8)

- [x] 8.1 Add integration coverage for blocked split admission
  - Create a deterministic scenario with too few eligible nodes
  - Verify split is persisted as blocked/deferred, not generic failure
  - Keep runtime under 30 seconds

- [x] 8.2 Add integration coverage for degraded publication mode
  - Create a deterministic scenario where grouped publication degrades
  - Verify admission and diagnostics consume the canonical mode output
  - Keep runtime under 30 seconds

- [x] 8.3 Rerun the 7-node partition-split harness checkpoint
  - Verify the run is diagnosable from structured artifacts
  - If it still fails, capture the failure as a new targeted regression before
    closure
