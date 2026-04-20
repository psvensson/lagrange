# Static Hotspot Follow-On Sprint (AGPL)

## Goal

Continue the remaining high-risk hotspot families after the completed static
metrics sprint reached its exit bars.

This follow-on keeps the work bounded around the unresolved runtime owners
rather than reopening the finished sprint.

## Outcome

Sprint exit bars were achieved on `2026-04-18`.

Starting point for repo-owned `src/` + `scripts/` metrics:

1. cognitive complexity threshold `20`: `147` violations
2. circular dependencies: `0` cycle groups
3. duplication: `15` clone groups and `417` duplicated lines

Final repo-owned `src/` + `scripts/` metrics:

1. cognitive complexity threshold `20`: `146` violations
2. circular dependencies: `0` cycle groups
3. duplication: `12` clone groups and `307` duplicated lines

## Delivered Packages

1. [Runtime duplication hotspot consolidation](../../packages/archived/done-20260413-runtime-duplication-hotspot-consolidation.md)
2. [Guideline LLM script cognitive-complexity follow-on](../../packages/archived/done-20260413-guideline-llm-cognitive-complexity-follow-on.md)

## Delivered Sprint Slices

1. Reduced clean hotspot functions across CLI, query, topology, node-policy,
   and guideline audit owners to push the cognitive baseline below the sprint
   bar without reopening the already-dirty runtime hotspot files.
2. Preserved zero cycles and repaired a narrow control-plane import cycle by
   cutting the mutation-readiness dependency on
   `ControlPlaneReadinessService`.
3. Tightened the repo ratchets to the achieved baselines:
   `146` cognitive-complexity violations, `12` clone groups, and
   `307` duplicated lines.

## Backlog Candidates Retained

These candidate packages were not required to clear the sprint exit bars and
remain backlog work rather than completed sprint deliverables.

1. [Admin control snapshot follow-on cognitive-complexity reduction](../../packages/todo-20260413-admin-control-snapshot-follow-on-cognitive-complexity-reduction.md)
2. [Partition and query cognitive-complexity reduction](../../packages/todo-20260413-partition-and-query-cognitive-complexity-reduction.md)
3. [Control-plane and transport cognitive-complexity reduction](../../packages/todo-20260413-control-plane-and-transport-cognitive-complexity-reduction.md)

## Validation

1. Focused hotspot regressions covering scripts, CLI, query, topology,
   readiness-policy, and mutation-readiness owners
2. `npm run test:metrics`
