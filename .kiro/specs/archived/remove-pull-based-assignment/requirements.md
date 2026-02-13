# Requirements Document

## Introduction

Remove the pull-based replica assignment path from the node joining service. Currently two independent mechanisms create replicas when a new node joins the cluster: the rebalancer (driven by the seed node detecting the new node via CDC) and a pull-based assigner (driven by the joining node itself). Both paths run simultaneously, causing duplicate replica creation, even replica counts violating the Raft odd-replica invariant, sync timeout failures, and log spam. This change removes the pull-based path entirely, leaving the rebalancer as the single owner of replica placement.

## Glossary

- **Node_Joining_Service**: The service that handles a new node joining an existing cluster, managing the bootstrap sequence from contacting the seed node through to signaling readiness.
- **Pull_Based_Replica_Assigner**: The class that analyzes the current epoch from the joining node's perspective and proposes new partition assignments by pulling replicas from overloaded nodes. This is the component being removed.
- **Assignment_Epoch_Manager**: The class that manages immutable assignment epochs with compare-and-swap coordination. Used by both the seed node bootstrap and the joining node; only the joining node's usage is removed.
- **Assignment_Epoch**: An immutable versioned snapshot of partition-to-node assignments. Used by both the seed node bootstrap and the joining node; only the joining node's usage is removed.
- **Unified_Rebalancer**: The single rebalancer implementation for both partitions and message groups, triggered by CDC events when a node becomes ready. This is the path being kept.
- **Rebalance_Coordinator**: The component that creates and dispatches replica operations (ADD/REMOVE) on behalf of the rebalancer.
- **Node_Lifecycle_State_Machine**: The state machine managing explicit node lifecycle states (STARTING, CONNECTING, DISCOVERING, JOINING, SYNCING, READY, etc.).
- **SYNCING_State**: A node lifecycle state used for syncing pulled replica data. Only used by the pull-based path in the joining flow; removal requires updating the state machine transitions so JOINING can transition directly to READY.

## Requirements

### Requirement 1: Remove Pull-Based Assignment from Join Flow

**User Story:** As a system maintainer, I want the pull-based replica assignment path removed from the node joining service, so that there is a single code path for replica placement owned by the Unified_Rebalancer.

#### Acceptance Criteria

1. WHEN a new node joins the cluster, THE Node_Joining_Service SHALL NOT create a Pull_Based_Replica_Assigner instance
2. WHEN a new node joins the cluster, THE Node_Joining_Service SHALL NOT create an Assignment_Epoch_Manager instance for pull-based assignment
3. WHEN a new node joins the cluster, THE Node_Joining_Service SHALL NOT call initializePullBasedAssignment or syncPulledReplicas
4. WHEN a new node joins the cluster, THE Node_Joining_Service SHALL NOT maintain _replicasToPull tracking state
5. WHEN a new node completes the JOINING phase, THE Node_Joining_Service SHALL transition directly from JOINING to READY without passing through SYNCING

### Requirement 2: Delete Pull-Based Replica Assigner Module

**User Story:** As a system maintainer, I want the PullBasedReplicaAssigner class deleted, so that no dead code remains in the codebase.

#### Acceptance Criteria

1. THE codebase SHALL NOT contain the file src/rebalancer/pull-based-replica-assigner.js
2. THE codebase SHALL NOT contain any import statements referencing pull-based-replica-assigner
3. THE codebase SHALL NOT contain test files that test the Pull_Based_Replica_Assigner class
4. THE rebalancer constants SHALL NOT contain PULL_ASSIGNER_ERROR_MSG after cleanup

### Requirement 3: Preserve Rebalancer-Driven Replica Placement

**User Story:** As a system operator, I want the rebalancer-driven replica placement path to remain fully functional, so that new nodes still receive replicas after joining.

#### Acceptance Criteria

1. WHEN a node transitions to READY state, THE bootstrap service SHALL trigger rebalancing on all partition leaders via handleNodeReadyRebalanceTrigger
2. WHEN the Unified_Rebalancer detects a new ready node via CDC, THE Unified_Rebalancer SHALL run checkRebalance to plan and dispatch ADD operations
3. THE Rebalance_Coordinator SHALL continue to create and dispatch replica operations to the joining node

### Requirement 4: Update Node Lifecycle State Machine Transitions

**User Story:** As a system maintainer, I want the node lifecycle state machine updated so that JOINING can transition directly to READY, so that the joining flow no longer requires the SYNCING intermediate state.

#### Acceptance Criteria

1. THE Node_Lifecycle_State_Machine SHALL allow a transition from JOINING directly to READY
2. THE Node_Lifecycle_State_Machine SHALL continue to allow the existing JOINING to SYNCING transition for the seed node auto-transition path
3. THE Node_Lifecycle_State_Machine SHALL continue to allow the existing SYNCING to READY transition for the seed node auto-transition path

### Requirement 5: Preserve Seed Node Epoch Management

**User Story:** As a system maintainer, I want the Assignment_Epoch_Manager and Assignment_Epoch classes preserved, so that the seed node bootstrap and CDC epoch propagation continue to function.

#### Acceptance Criteria

1. THE codebase SHALL retain the file src/rebalancer/assignment-epoch-manager.js
2. THE codebase SHALL retain the file src/rebalancer/assignment-epoch.js
3. WHEN the seed node bootstraps, THE bootstrap service SHALL continue to create and use an Assignment_Epoch_Manager
4. WHEN a CDC epoch change event is received, THE CDC integration service SHALL continue to apply epochs via the Assignment_Epoch_Manager

### Requirement 6: Clean Up Unused Constants and Imports

**User Story:** As a system maintainer, I want all constants, imports, and accessor methods that only served the pull-based path removed, so that the codebase has no dead references.

#### Acceptance Criteria

1. THE Node_Joining_Service SHALL NOT contain imports of Pull_Based_Replica_Assigner, Assignment_Epoch_Manager, or Assignment_Epoch
2. THE Node_Joining_Service SHALL NOT contain the getPullBasedAssigner accessor method
3. THE Node_Joining_Service SHALL NOT contain the getEpochManager accessor method
4. THE Node_Joining_Service SHALL NOT contain the getBootstrapCurrentEpoch, readAuthoritativeEpochConfig, persistProposedEpochWithCas, executeEpochSql, or applyCurrentEpochFromCache helper methods that only served the pull-based path
5. THE Node_Joining_Service SHALL NOT return pullBasedAssigner or epochManager in the join result object
6. THE node joining constants SHALL NOT contain log messages or error messages that only served the pull-based path
