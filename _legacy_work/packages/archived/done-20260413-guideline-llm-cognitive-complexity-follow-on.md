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

## Outcome

1. Split the `scripts/check-guidelines-llm.js` false-positive classifier into
   bounded rule groups and separated the direct-execution entrypoint from the
   reusable helpers.
2. Added focused coverage in `test/scripts/check-guidelines-llm.test.js` so
   the script can be imported and regression-tested safely.
3. The sprint closeout kept this package’s gains while the repo-wide cognitive
   and duplication ratchets were tightened to the new measured baselines.

## Validation

1. `npm test -- test/scripts/check-guidelines-llm.test.js`
2. `npm run test:metrics`

## Done When

1. The remaining guideline LLM hotspot count is reduced without weaker checks
2. `npm run test:metrics` stays green on the tightened baselines
