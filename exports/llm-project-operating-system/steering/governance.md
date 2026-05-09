# Governance Guidelines

## Document Role

This document governs roadmap scope, package lifecycle, and project execution
truth.

Use it for:

- idea-to-roadmap-to-package flow
- active package rules
- closure and handoff rules
- roadmap status truth

Do not use it for local code style or concrete subsystem owner maps.

## Idea Flow

Use one path:

1. `idea -> roadmap sharpening -> work package` for broad or scope-changing
   work.
2. `idea -> direct work package` for bounded work already inside approved
   scope.

Ideas live under `work/ideas/`. Active execution lives under `work/packages/`.

## Active Work

Rules:

1. Active implementation starts from `work/packages/active-YYYYMMDD-slug.md`.
2. At most one active package should own a representative owner boundary.
3. Parallel package work on the same broad area requires explicitly disjoint
   file scope, owner scope, and proof scope.
4. A sprint file may group packages, but it does not replace package files.
5. The main package owner reconciles review and validation results into one
   package status update.

## Roadmap Truth

Rules:

1. Roadmap status must match package and validation evidence.
2. A roadmap row is not complete while an active package still fixes the same
   exit criterion.
3. If implementation discovers that a roadmap row is overstated, correct the
   roadmap with the package closure that discovered it.
4. Broad rows need linked specs or architecture notes before active
   implementation starts.

## Closure Truth

Rules:

1. Completed packages are renamed to `done-...`.
2. Superseded packages are renamed to `superseded-...` and link their
   successor.
3. Package closure proof is not invented after the fact.
4. If a package is reopened, migrated, or closed again, current proof rules
   apply.
5. Commit and push a focused package slice before starting the next package.
