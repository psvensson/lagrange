# Current Owner Maps

## Document Role

This document governs current concrete owner maps and shared owner-path building
blocks for the active implementation.

Use this file for:

- current concrete ownership assignments
- current workflow owner boundaries
- current shared control-plane building blocks

Do not use this file for:

- stable implementation rules that should survive refactors
- testing policy
- roadmap scope decisions

For durable implementation rules, use
[`.kiro/steering/system guidelines.md`](../.kiro/steering/system%20guidelines.md).

## Core Ownership Assignments

The current concrete ownership map is:

- Node state -> `NodeLifecycleStateMachine`
- Replica state -> `ReplicaStateMachine`
- Epoch -> `config.current_epoch` via CDC
- Placement planning -> `MovePlanner`
- Operation lifecycle -> `RebalanceCoordinator` + `replica_operations`
- Dispatch -> `ReplicaDispatchService`
- Failure detection -> `FailureDetector`
- System cache -> `SystemTableCache`

## Topology Workflow Owner Map

Current workflow ownership boundaries are:

- `RebalanceCoordinator` is the writer of owner-managed
  `replica_operations` workflow fields.
- `ManagedSplitWorkflow` is the durable owner of split lifecycle phase
  transitions from admission through cleanup.
- Executors such as `ReplicaHandler` and `PartitionService` are participants.
  They emit typed acknowledgements or outcomes and do not persist
  owner-managed phase transitions directly.

## Shared Control-Plane Building Blocks

The current shared building blocks for control-plane work are:

1. `AuthoritativeControlPlaneView`
2. `EligibilitySnapshot`
3. `OperationLane`
4. `WorkflowStepRunner`
5. `TimeoutPolicy`

New control-plane work should extend these shared owners before adding
feature-local mechanics.
