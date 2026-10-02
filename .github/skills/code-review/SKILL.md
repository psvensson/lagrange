---
name: code-review
description: Adversarially review Lagrange pull requests using the sealed Solver Quest, repository verification templates, controlled-negative evidence, and exact-head identity. Use for every Lagrange code review, especially source changes tied to solve/quests.
---

# Lagrange code review

Review the pull request as an independent verifier, not as an implementation assistant.

## Establish the review subject

1. Record the exact pull-request head commit SHA being reviewed.
2. Enumerate every changed path.
3. If the PR names a Solver Quest, read its `solve/quests/<id>/quest.json` and
   append-only `log.ndjson`. Treat the sealed statement, constraints and
   doneWhen predicate as the verification contract.
4. Reject conclusions or workflow evidence that belong to a different source
   candidate SHA unless the Quest log explicitly content-binds the exact files
   being reviewed.

## Load the applicable verification templates

Read `docs/development/verification-templates/INDEX.md`, classify the diff,
and load every matching checklist. Do not add unrelated templates merely to
make the review longer.

Typical mappings include:

- new/changed tests, fixtures, A/B or red-on-revert controls:
  `harness-fidelity.md`;
- guards, comparators, validators, hostile JavaScript input:
  `adversarial-js-intrinsics.md`;
- registered cross-owner semantic seams:
  `owner-interaction.md`;
- retry/re-drive loops: `retry-loops.md`;
- recovery/replay: `recovery-replay.md`;
- concurrency/serialization: `concurrency-serialization.md`;
- transport/delivery: `transport-delivery.md`;
- timers/sweeps: `sweep-timer.md`;
- admission/hold predicates: `admission-gating.md`;
- formation-vs-steady-state dependencies: `formation-circularity.md`.

## Category-complete review

For every applicable checklist category:

1. enumerate ALL findings in the same review round; never stop at the first;
2. give each checklist item a verdict: PASS, FAIL, or NOT APPLICABLE;
3. attach a concrete evidence path to every verdict: file:line, test name,
   Solver log entry, or immutable workflow run;
4. distinguish production-semantic defects from test/probe/harness defects;
5. explicitly search for bypasses, fallback logic, duplicate semantic owners,
   coercions and compatibility paths around the claimed change.

## Controlled-negative fidelity

When a Quest relies on red-before/green-after or red-on-revert evidence:

- verify the red control reaches the claimed production mechanism and the named
  behavioral assertion;
- reject import/setup/missing-method/timeout-before-engagement failures as
  non-proofs;
- verify the green run uses the exact candidate bytes under review;
- verify any source/test fingerprints in the Quest log match the reviewed
  candidate.

A green CI run alone is never terminal evidence for a new semantic claim.

## Final verification summary

End the review with one compact section containing:

- exact reviewed head SHA;
- applicable verification categories;
- all findings grouped by category;
- any inherited/out-of-scope findings clearly separated;
- verdict: `ACCEPT` only if every applicable load-bearing item passes,
  otherwise `REJECT`;
- evidence paths supporting the verdict.

Do not approve merely because the implementation is small or the focused tests
are green. Prefer a concrete rejection to an ungrounded approval.
