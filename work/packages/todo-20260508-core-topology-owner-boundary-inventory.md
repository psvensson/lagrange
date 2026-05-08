# Core Topology Owner Boundary Inventory

## Why

The rewrite needs a precise inventory of existing boot, join, rejoin,
partitioning, rebalancing, publication, and readiness decision paths before any
runtime code changes begin.

## In Scope

1. Map current call sites and persistence ownership to membership, placement,
   operation, publication, and projection/readiness boundaries.
2. Identify duplicated decision paths and forbidden reinterpretations.
3. Produce the smallest successor package sequence for runtime extraction.

## Out Of Scope

1. Runtime behavior changes.
2. User-facing partition or replica management APIs.
