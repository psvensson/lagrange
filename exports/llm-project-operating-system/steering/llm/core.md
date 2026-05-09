# Core Steering Pack

Always-load compact rules for ownership, package discipline, safety, and
quality baseline.

## Rules

1. Work packages are one executable concern per file.
2. Package status lives in the filename: `idea-`, `todo-`, `active-`,
   `done-`, or `superseded-`.
3. Do not create a second status system in headings, directories, or sidecar
   trackers.
4. Internal planning lives under `work/`; reserve `docs/` for user-facing or
   operator-facing documentation.
5. The model ledger is advisory and never replaces validation, review,
   sequencing, focused commits, or closure proof.
6. Focused commits include only package-owned changes and allowed handoff
   updates.
7. Do not sweep unrelated dirty worktree changes into a package commit.
8. Do not start a second active package on the same owner boundary while the
   first has unresolved in-scope residuals.
9. Real subagent sequencing is preferred for package work when available:
   review, fixes when needed, then implementation.
10. Non-real labels such as `manual`, `local`, `session`, or
    `current-session` do not prove subagent roles.
11. One durable concern has one semantic owner.
12. Callers submit intent to owners; they do not reproduce owner logic locally.
13. Use one canonical path per semantic decision.
14. If a helper, cache, snapshot, or mode exists, use it or modify it rather
    than creating a duplicate.
15. Do not expose semantic policy through combinable booleans.
16. Define one explicit named mode set when callers choose between policies.
17. Do not write inline domain/runtime scalars.
18. Shared domain values belong to canonical owner modules.
19. File-private values should be top-level named constants.
20. Test-private values should be suite-local named constants.
21. `null` and `undefined` do not encode domain/runtime state.
22. Normalize raw external input at the boundary.
23. When several signals determine one outcome, collect evidence first.
24. Normalize one immutable snapshot before applying policy.
25. Use one explicit state model or decision table for semantic outcomes.
26. Emit canonical outcome, reasons, and retryability together.
27. Do not let empty collections, missing fields, or timeouts silently mean
    success.
28. Pressure may slow, defer, reject, or coalesce work; it must not reduce
    correctness.
29. Every queue, cache, subscriber set, retry registry, or temporary resource
    needs one owner, bound, teardown rule, and diagnostic surface.
30. When bugs cluster at a boundary, shrink the boundary rather than patching
    symptoms repeatedly.
31. A package is not done when only the hot path is fixed.
32. Tail consumers, diagnostics, reports, stale vocabulary, and required proof
    must be closed or explicitly split.
33. Static guardrail proof is required for non-trivial packages.
34. Green behavior tests do not override failed owner-path guardrails.
35. Bug fixes should start from a failing test or replayable probe.
36. Scenario-driven packages must record blocker movement when the failure
    migrates.
37. Different timestamps, ids, counts, or presentation shapes do not prove a
    new blocker by themselves.
38. Roadmap status must match package and validation evidence.
39. Broad or scope-changing work sharpens `roadmap.md` before implementation.
40. Architecture changes update `architecture.md` in the same package.
