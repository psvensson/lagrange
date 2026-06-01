# Governance Guidelines

## Document Role

This document governs roadmap scope, implementation lifecycle, and project
execution truth.

Use it for:

- idea-to-roadmap-to-implementation flow
- active implementation rules
- closure and handoff rules
- roadmap status truth

Do not use it for local code style or concrete subsystem owner maps.

## Idea Flow

Use one path:

1. `idea -> roadmap sharpening -> implementation slice` for broad or scope-changing
   work.
2. `idea -> direct implementation slice` for bounded work already inside approved
   scope.

Legacy work-package templates live under `_legacy_work/work/` for reference
only. Active execution should use the target repository's current workflow.

## Active Work

Rules:

1. Active implementation starts from a recorded, scoped owner boundary.
2. At most one active implementation slice should own a representative owner boundary.
3. Parallel work on the same broad area requires explicitly disjoint
   file scope, owner scope, and proof scope.
4. A planning file may group implementation slices, but it does not replace
   live evidence.
5. The main owner reconciles review and validation results into one status
   update.

## Roadmap Truth

Rules:

1. Roadmap status must match implementation and validation evidence.
2. A roadmap row is not complete while active work still fixes the same
   exit criterion.
3. If implementation discovers that a roadmap row is overstated, correct the
   roadmap with the closure update that discovered it.
4. Broad rows need linked specs or architecture notes before active
   implementation starts.

## Closure Truth

Rules:

1. Completed work is closed only with live proof.
2. Superseded work links its successor.
3. Closure proof is not invented after the fact.
4. If work is reopened, migrated, or closed again, current proof rules apply.
5. Commit and push a focused slice before starting the next slice.
