# Analysis-Closure Steering Hardening

## Why

Recent under-load and lifecycle work exposed a process gap: focused fixes were
landing, but the repository did not force the work package or steering docs to
record when the dominant blocker moved or to declare the lifecycle-progress
grammar that readers needed in order to reason about the next blocker.

That made the analysis better than ad-hoc debugging, but still more implicit
than it should have been.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Tighten steering rules so scenario-driven work must record failure
   migration and probe the next-order blocker before closure.
2. Tighten steering rules so lifecycle, readiness, admission, recovery, and
   convergence work must declare one shared progress grammar.
3. Tighten testing policy so stale-evidence and stale-routing bugs must replay
   the temporal witness order that triggered the failure.
4. Keep the change bounded to steering and work-tracking documentation.

## Out Of Scope

1. Runtime implementation changes.
2. Harness or CI automation changes.
3. Architecture-record changes beyond requiring future packages to make those
   contracts explicit.

## Invariants

1. The repository must keep one work-tracking system rather than adding a
   second analysis tracker.
2. New steering rules must strengthen existing package discipline instead of
   bypassing it.
3. Lifecycle reasoning must move toward one named grammar per concern, not
   more local synonyms.

## Hotspots

1. `.kiro/steering/doctrine.md`
2. `.kiro/steering/system guidelines.md`
3. `.kiro/steering/testing-guidelines.md`
4. `work/README.md`

## Detection / Analysis Tasks

- [x] Identify why recent distributed analysis still left missing lifecycle
      seams implicit.
- [x] Identify where current steering docs already require deep dives but do
      not force failure-migration recording or progress-grammar declaration.
- [x] Bound the fix to steering and work-tracking docs instead of widening it
      into runtime or automation work.

## Implementation Tasks

- [x] Add doctrine guidance for progress grammar and failure migration.
- [x] Add package-discipline guidance for next-order blocker probes and
      progress-grammar declaration.
- [x] Add testing guidance for original-scenario confirmation and temporal
      witness replay.
- [x] Update `work/README.md` so package authors capture the same information
      in the work package itself.

## Residual Closure Inventory

- [x] Steering docs and work-tracking docs use one consistent vocabulary for
      failure migration and progress grammar.
- [x] No second planning/status tracker is introduced.
- [x] No runtime or harness follow-up is silently mixed into this package.
- [x] Required documentation review is complete before closure.

## Validation

1. Read the touched steering/work docs together and confirm the new rules are
   consistent with the existing package-first workflow.
2. Confirm the new rules do not create a second planning or status system.
3. Confirm the new rules require future packages to name both the migrated
   blocker and the lifecycle-progress vocabulary for the affected boundary.

## Done When

1. The repository has an explicit rule that scenario-driven work records
   failure migration instead of treating hot-path green tests as analysis
   closure.
2. The repository has an explicit rule that lifecycle-style boundaries declare
   one shared progress grammar.
3. The repository has an explicit test policy for temporal stale-evidence
   replay.
4. The package is closed without opening a second tracker or side process.
