# Core Topology Projection Readiness Contract

## Why

Projection and readiness must become the single consumer contract for topology
visibility instead of allowing diagnostics, admin, harness, and runtime readers
to recombine raw owner evidence.

## In Scope

1. Define the canonical projection snapshot and revision stream.
2. Define internal, repair, and serve readiness states.
3. Cut diagnostics, admin, harness, and runtime readers over to the shared
   projection/readiness contract.

## Out Of Scope

1. New user-facing topology management concepts.
2. Owner mutation logic outside projection publication.
