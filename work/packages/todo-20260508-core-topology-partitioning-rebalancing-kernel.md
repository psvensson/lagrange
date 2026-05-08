# Core Topology Partitioning Rebalancing Kernel

## Why

Partitioning and rebalancing need separate placement intent and operation
actuation owners so assignment policy, workflow progress, retry, and terminal
outcomes cannot be inferred from incidental cache or timer evidence.

## In Scope

1. Define placement owner inputs, outputs, and policy vocabulary.
2. Define operation owner lifecycle, retry, resume, and terminal vocabulary.
3. Cut split, move, repair, and recovery paths over to the owner contracts.

## Out Of Scope

1. Membership admission decisions except as consumed owner evidence.
2. Projection/readiness consumer cutover.
