---
id: solver-friction-2026-09-06
roadmapRow: null
status: active
graduatesTo: null
---

# Solver friction found on 2026-09-05

Seven gates that each cost a verifier round, an override or a parked
declaration while the release-process quest was run end to end. Decided
with the operator on 2026-09-06 to fix these before the readiness owner
quest resumes.

## Deliverables (each with a red-on-revert witness)

1. **Probe kind at declaration.** `solve new --class process` defaults the
   draft's doneWhen and frontier to the `test-receipt` probe
   (`solve/evidence/<id>.receipt.json`, receipts from repeatable
   `--required-receipt <id>`, else one `<id>-main` placeholder); `--probe
   scenario-harness|test-receipt` overrides either class. Lint warns when a
   quest's evidence harness exists but its probe is not `test-receipt`.
2. **Steering freshness in preflight.** `solve preflight --full` reports a
   stale steering pack: it regenerates the pack into a scratch copy of the
   configured sources and diffs it against the tree, never touching the tree.
3. **Epic planning bound at authoring time.** Quest lint refuses a
   `links.planDoc` epic (contract version 2) above the 150-line bound, and
   the attempt static gate names a changed epic over the bound; both reuse
   the ledger-consistency rule so the corpus test cannot be the first to
   say it.
4. **Model evidence only for model changes.** `package.json` requires a
   model-evidence finding only when its diff touches a model-checking
   command (`model:` scripts, alloy/decision-table/statechart/contract/
   invariant/owner-trace checkers); a scripts-only or version change does not.
5. **No theory demand on a verifier-directed replacement.** While a
   candidate rejection stands on the frontier, the commit-phase theory gate
   does not demand a frontier theory at the widen-scope rung; the rejection
   finding is the theory.
6. **Scope pressure counts authored scope.** Deleted files and registered
   generated outputs do not count toward the scope-pressure file, owner and
   byte totals.
7. **Comment-only runtime edits in a process quest.** A runtime-scope path
   whose diff section changes only comment or blank lines does not stamp
   runtime scope on a workflow quest's attempt.

## Witness classes

Unit witnesses under test/solve for each gate (fixture logs, diffs and
quests), the existing gate suites staying green, and the receipt harness.
