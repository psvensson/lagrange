# Core Topology Boot Join Rejoin Kernel

## Why

Boot, join, and rejoin must converge through one membership owner contract
instead of phase-local state, seed contact fallbacks, or readiness-side repair.

## In Scope

1. Define and implement the membership owner transition model.
2. Cut boot, join, and rejoin consumers over to the owner contract.
3. Preserve restart and rejoin durability without cache-derived promotion.

## Out Of Scope

1. Placement or rebalancing policy changes beyond membership handoff inputs.
