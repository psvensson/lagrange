---
audience: development
documentClass: evidence
---

# Intermediate classifier observations

Date: 2026-10-21. These are implementation observations after the engaged
old-classifier run at `96741ee014f2ca441b8d93ef3e894b310bcd0549`, not
implementation acceptance or candidate test results.

The first draft census aborted in `constructedBindings` because a concise
arrow returning a function has a non-array `body.body`. The binding proof
was narrowed to a `BlockStatement` body. This was an implementation setup
failure, not a semantic witness or a safety result.

The completed draft census in `after/raw-census.json` and `after/delta.json`
contains ten removed mixed-source identities and two new raw-null findings
in the draft helper. The helper's publication test only needed a boolean;
it was simplified to a predicate returning false instead of null. No audit
suppression or baseline edit was used. The earlier completed census remains
preserved with its original hashes.

`after/occurrences.json` records every lexical cache/SQL occurrence in the
ten removed functions. Nine removals beyond the intended acquisition arise
solely from object-key labels. One is materially conservative evidence:
`AuthoritativeControlPlaneView.readNodeSnapshot` supplies a
`cacheFallbackPredicate` to its existing `readRows` owner. The author has
requested independent review of narrowing label omission to direct
constructor-option objects so that this delegated-operation evidence and
the other nonconstruction findings remain unchanged.

The first scoped metrics run reports five existing cyclomatic violations
and one existing cognitive violation in unchanged functions of the main
checker. The added helper has no cyclomatic or cognitive violations under
the strict scoped command. One line-length error in the draft helper was
corrected. These checks do not establish full static cleanliness.
