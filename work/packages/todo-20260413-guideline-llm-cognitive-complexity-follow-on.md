# Guideline LLM Script Cognitive-Complexity Follow-On

## Why

The guideline script package removed the duplicated audit scaffolding and
tightened the ratchets, but `scripts/check-guidelines-llm.js` remains a large
script-side cognitive-complexity hotspot.

That work should be handled as a dedicated follow-on instead of being hidden
inside the completed duplication package.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Reduce the remaining cognitive-complexity hotspots in
   `scripts/check-guidelines-llm.js`
2. Add focused script regressions when behavior-sensitive logic is split
3. Preserve the tightened metrics ratchets

## Validation

1. Focused script tests
2. `npm run test:metrics`

## Done When

1. The remaining guideline LLM hotspot count is reduced without weaker checks
2. `npm run test:metrics` stays green on the tightened baselines
