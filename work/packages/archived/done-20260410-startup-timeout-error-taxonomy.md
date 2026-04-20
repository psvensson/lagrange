# Startup Timeout/Error Taxonomy Normalization

## Status

Closed on 2026-04-11 without a standalone implementation pass. Structured
readiness-failure classification landed through the later matrix/readiness
unification work, so this older taxonomy package no longer carries separate
useful work.

## Why

Current startup readiness and witnessing code depends on broad string-fragment
matching (`timeout`, etc.) that is fragile and can incorrectly include unrelated
errors in transient pathways.

## Scope Basis

Roadmap/`edition-matrix.md` rows allowing this work:

1. `Operational visibility basics` (AGPL repo)
2. `Failure simulations` (AGPL repo)
3. `Topology workflow stabilization` (AGPL repo)

## Sprint Umbrella

[Startup Gate Evidence Foundation Sprint](../../sprints/archived/done-2026-q2-startup-gate-evidence-foundation.md)

## In Scope

1. Define a shared startup failure code map and classifier.
2. Replace string-fragment heuristics in startup paths with explicit codes
   (`TRANSIENT_ADMIN_READINESS_TIMEOUT`, `TRANSIENT_REACHABILITY`, etc.).
3. Ensure both projection and witness paths consume the same classifier outputs.
4. Distinguish timeout-shaped but non-transient errors from true transient
   reachability/projection errors where possible.
5. Add tests for ambiguous error messages to prevent cross-path reintroduction.

## Out Of Scope

1. General runtime-wide error handling rewrite.
2. Non-startup error taxonomies outside active-gate readiness.
3. Any changes to production retry policy.

## Invariants

1. Classifier output is explicit, testable, and stable by contract.
2. No callsite in startup admission or witnessing uses inline message fragments
   as a semantic gate.
3. Transient designation is only applied where policy allows degradation.

## Hotspots

1. `test/distributed/harness/cluster.js`
2. `test/distributed/harness/active-gate-closure-classification.js`
3. `test/distributed/harness/__tests__/cluster.test.js` (classification coverage)

## Detection / Analysis Tasks

- [ ] Collect all startup error checks that match on message fragments.
- [ ] Build failure fixture matrix by error source (readiness/admin/reachability).
- [ ] Verify current tests do not assert behavior driven by old substring matching.

## Implementation Tasks

- [ ] Add a shared failure classifier module consumed by both target modules.
- [ ] Replace fragment arrays with structured code checks.
- [ ] Add helper methods:
  - `isTimeoutLikeError`
  - `isTransientAdminError`
  - `isTransientReachabilityError`
  - `toAdminEvidenceProfile`
- [ ] Wire projection and witness consumers through helper output.
- [ ] Remove dead legacy constants and string-based fallback checks.

## Validation

1. New unit tests for classifier behavior with ambiguous strings.
2. Snapshot/integration harness tests proving CL-004/CL-006 witness behavior
   changes are intentional.
3. Regression run on startup-heavy distributed scenarios.

## Done When

1. No startup-admission semantic decision relies on raw string heuristics.
2. Classifier codes are consumed uniformly by active projection and witnessing.
3. Ambiguous message-driven transitions are eliminated or explicitly documented.
