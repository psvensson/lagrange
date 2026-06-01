# LLM Steering Confusion Reduction Sprint

Status: done. Created and executed on May 23, 2026.

## Goal

Reduce LLM confusion in the steering system by making precedence, load order,
lane vocabulary, and per-lane first commands explicit before future agents enter
runtime or scenario work.

## Scope

- In: LLM boot guidance, AGENTS load order, generated LLM README source, cold
  start note, package evidence.
- Out: runtime behavior, scenario routing, roadmap status, active rolling
  restart blocker state, and source steering policy changes.

## Package Queue

1. [LLM Steering Boot Contract](../packages/done-20260523-llm-steering-boot-contract.md)
   - Lane: `lightweight-maintenance`
   - Purpose: add one short boot contract and align steering entrypoints.

## Execution Summary

- Added `.kiro/steering/llm/boot.md` as the explicit LLM precedence and lane
  routing contract.
- Updated `AGENTS.md` to load the boot contract after the LLM pack index.
- Updated `lite.md` so it no longer competes with the boot contract.
- Updated `scripts/generate-steering-llm-pack.js` so generated `README.md`
  keeps the same load order.

## Validation

1. `npm run work:validate -- --entry work/packages/done-20260523-llm-steering-boot-contract.md`
2. `npm run work:validate -- --pre-impl work/packages/done-20260523-llm-steering-boot-contract.md`
3. `npm run steering:llm:pack`
4. `git diff --check -- AGENTS.md .kiro/steering/llm/boot.md .kiro/steering/llm/README.md .kiro/steering/llm/lite.md scripts/generate-steering-llm-pack.js work/sprints/done-2026-q2-llm-steering-confusion-reduction.md work/packages/done-20260523-llm-steering-boot-contract.md`

## Closure Note

This sprint is recorded as `done` immediately after execution so the repository
does not gain a second active sprint while the rolling-restart stability sprint
remains the live runtime blocker.
