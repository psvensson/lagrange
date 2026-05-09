# Testing Steering Pack

Load for test design, proof ladders, and regression policy.

## Rules

1. The active package defines the validation surface.
2. Tests added during a change must match the package concern.
3. A package does not close until required validation passes.
4. Bug fixes should start with a failing test or replayable probe.
5. Shared contract changes need owner-path proof and direct-consumer proof.
6. Tail-consumer proof is required when diagnostics, reports, APIs, UI, or
   harnesses consume the changed contract.
7. Static guardrails are chosen by boundary, not convenience.
8. Rerun the same relevant guardrails after implementation.
9. A relevant guardrail count must not increase.
10. Do not weaken guards, expand allowlists, or move code out of scan scope to
    make validation pass.
11. Scenario-driven packages rerun the reference scenario or narrow blocker
    probe after focused proof is green.
12. If a scenario still fails, record whether the same owner boundary still
    dominates or the blocker migrated.
13. Aggregated runner crashes should be treated as shared runner-boundary debt
    until proven otherwise.
