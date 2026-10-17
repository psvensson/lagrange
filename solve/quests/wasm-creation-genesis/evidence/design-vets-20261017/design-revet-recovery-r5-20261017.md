# Design re-vet R5: Revision 5 (record-only) of RECOVERY-DESIGN-20261017

Subject: `solve/quests/wasm-creation-genesis/RECOVERY-DESIGN-20261017.md` lines 961-993
("Revision 5") in `/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016`
at `381750de2`. Worktree state at this read: the design file and the five vet reports
untracked, the activation charter and closeout plan modified, NO change under `src/` or
`test/` (`git status --short`). Read-only; nothing touched; no lab. Every `file:line` carried
from the earlier rounds on this same tree.

Read this round: Revision 5 in full. No new source was needed: the three witness ranges
(`test/service/service-consensus-creation-intent.test.js:113-126, :222-230, :232-239`) and the
handler's wake sites (`runtime-service-bound-creation-route.js` `WAKE_ACTION :299-313`,
`PENDING_WAKE_REASONS :52-53`, `findWakeTarget :316-333`, `releaseBoundCreation :153-160`)
were read in rounds 1 and 4.

## Verdict: APPROVE (R37 CLOSED; N19-N21 recorded; no finding remains)

| Id | Disposition | Clause / reason |
| --- | --- | --- |
| R37 supersession list | CLOSED | R5-A names the three committed witnesses by line, what each pins today, and its successor: `:113-126` -> the scan answers `{status: INVENTORIED, rowState: PENDING, token: null}`, reserves nothing, and P-R12 is the successor of the F3 claim (the RE-ENTRY resolves the same request); `:222-230` -> `{status: INVENTORIED, outcome: CORRUPT_STATE, reentry: false}` (R3-F); `:232-239` -> `ADMISSION_RETAINED` with `phase: UNAVAILABLE` and the opening module deciding (R2-B). The append-never-rewrite rule and "the landing decision names each line" (RV4.3 precedent) are stated. |
| R37 second half (wakePending) | CLOSED | R5-A: a `GRANT_HELD` wake whose detail is `grant.outcome === UNAVAILABLE` sets no `wakePending` on an in-flight entry; the pending-wake rule keys on reason AND detail, so `releaseBoundCreation :153-160` schedules nothing for it. Together with R4-A rule 2 (the HELD-target branch `WAKE_ACTION[HELD] :309-313` RECORDS for any memo), both handler branches that could re-enter on that wake are covered. Implementation note, not a finding: `findWakeTarget :316-333` builds its `diagnostic` from `reason` only today; the detail (`wake.grant?.outcome`, delivered by `deliverWasmCreationWake :27-30` from `publish :94`) must be carried into the decision. |
| N19 sealed-refused HELD follower | recorded | R5-B, routed to the stage-1 owner (R17), not widened here. |
| N20 fully HELD group under a down owner | recorded | R5-B, as stage-1 P13; R4-B covers it. |
| N21 R4-C covers PUBLISHED_UNPROJECTED | recorded | R5-B, `SERVING_STATUSES`, RV4.1. |

Nothing else changed in Revision 5 (record only), and nothing in Revisions 1-4 is re-opened by
it. The supersession list is complete against my census: the generic-row recovery witnesses
(`test/service/service-lifecycle-manager.test.js:432-532`) are untouched by R1-A; the two
UNAVAILABLE route witnesses (`runtime-service-bound-route.test.js:234-243, :277-282, :311-314`)
stand (N15); the only route-level wake witness (`:341-351`) uses the OBSERVED reason and
stands; `wasm-service-lifecycle.test.js:493` is already recorded under N18 with the same
append rule.

## On the unit-1 implementation started in parallel

Not premature on mechanism grounds: round 4 left no mechanism finding, and R37 was a record
change that does not alter what the implementer builds. Two cautions for the record:

1. The implementer must work from Revision 5, not Revision 4: the three witnesses of R5-A are
   red under the new mechanism and must be superseded by APPENDING their successors; an
   implementer who had only Revision 4 in hand could have rewritten them in place, which R21
   forbids and the verifier must check (the old lines preserved, the new ones beside them,
   the landing decision naming each line).
2. I cannot see the unit-1 work: this worktree carries no `src/` or `test/` change at
   `381750de2`. Whatever is being written lives elsewhere; this approval is of the design as
   recorded, not of any implementation, and the independent verifier's judgment of the
   implementation is unchanged by it.

What the implementer must not do (unchanged from round 4): rewrite
`service-consensus-creation-intent.test.js:113-126, :222-230, :232-239` in place; set
`wakePending` for a GRANT_HELD wake whose detail is UNAVAILABLE; widen R4-A rule 1 into sealed
grant refusals in this stage.

This is the vet's verdict only; nothing is reported done on the lead's behalf.
