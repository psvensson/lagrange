# Static Hotspot Follow-On Sprint (AGPL)

## Goal

Continue the remaining high-risk hotspot families after the completed static
metrics sprint reached its exit bars.

This follow-on keeps the work bounded around the unresolved runtime owners
rather than reopening the finished sprint.

## Starting Point

Current repo-owned metrics for `src/` and `scripts/`:

1. cognitive complexity threshold `20`: `147` violations
2. circular dependencies: `0` cycle groups
3. duplication: `15` clone groups and `417` duplicated lines

## Sprint Umbrella

1. [Admin control snapshot follow-on cognitive-complexity reduction](../packages/todo-20260413-admin-control-snapshot-follow-on-cognitive-complexity-reduction.md)
2. [Partition and query cognitive-complexity reduction](../packages/todo-20260413-partition-and-query-cognitive-complexity-reduction.md)
3. [Control-plane and transport cognitive-complexity reduction](../packages/todo-20260413-control-plane-and-transport-cognitive-complexity-reduction.md)
4. [Runtime duplication hotspot consolidation](../packages/todo-20260413-runtime-duplication-hotspot-consolidation.md)
5. [Guideline LLM script cognitive-complexity follow-on](../packages/todo-20260413-guideline-llm-cognitive-complexity-follow-on.md)

## Exit Check

1. Cognitive-complexity baseline drops below `147`
2. Duplication baseline drops below `15` clone groups and `417` duplicated
   lines
3. `npm run test:metrics` stays green
4. Circular dependencies remain at `0`
