# Bootstrap alternate-entry retirement — review packet

Status: **source preserved for independent review; no runtime acceptance**.
The existing executable integration remains frozen. This change is deliberately
isolated from fresh-seed activation and listener acceptance.

## Earlier project finding and cause

The fresh-seed seal review found that `BootstrapService.bootstrapOrExit` had
no production callers, while a test and architecture prose called it a public
seed entry point. The finding was retained in
`solve/epics/raft-rs-full-cutover/evidence/stop-2026-10-25/fresh-seed-author-handoff.md`
and explicitly left outside the previously sealed fresh-seed scope. The
2026-10-25 STOP handover requested its separate retirement.

The current entry is `startLagrangeRuntime` in
`src/lagrange-runtime-startup.js`. It reserves the boot incarnation before
constructing `BootstrapService`, defers shutdown in the startup acquisition
ledger, and propagates bootstrap failure through that ledger. A separate
static service entry that calls `process.exit(1)` skips this owner and could
abandon pending cleanup or diagnostic I/O if invoked in the future. Node.js
documents immediate termination and pending-I/O loss for `process.exit()`:
<https://nodejs.org/api/process.html#processexitcode>.

## Bounded source proposal

- Remove the uncalled `BootstrapService.bootstrapOrExit` and its now unused
  `BOOTSTRAP_EXIT_FAILED` log-message definition.
- Remove only its obsolete test invocation. Retain the constructor checks
  for both seed and joining owners, including zero side effects and durable
  storage observations when a boot incarnation is unissued.
- Name the real public startup owner in the architecture contract.
- Make the old handwritten bootstrap-sequence test headings accurately claim
  internal phase characterization, with all existing checks retained.

The source/use census covers `src/`, `test/`, `architecture/`, `docs/`, and
`scripts/`. It found exactly one service definition, one test call and one
documentation reference before the change. It found no production caller.
The actual process startup and joining counterparts were inspected, as were
the fresh-seed seal findings and current registration/writer owners.

## Reviewer obligations and evidence limit

Check that no dynamic or exported entry is lost, that `LoggingService` and
its subsystem constants remain used by the constructor, that no additional
reference survives, and that the real startup still reserves and propagates
errors through the cleanup ledger. Check that no meaningful boot-incarnation
assertion was removed: the constructor and no-side-effect assertions remain.
The test headings must describe their existing observations without claiming
public startup acceptance.

Only syntax, repository static checks, and normal Git hooks may be claimed
until a real lab controller executes the relevant test files and canonical
fresh-seed receipt. A passing hook is not that receipt. Independent source
review is still required before integration or Quest landing. This packet
does not authorize production publication, main merge or release.
