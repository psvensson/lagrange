# U1 retirement retains an unfinished STOPPED projection

Status: independently approved narrow implementation clarification before the
carrier's implementation. Reviewer: `subagent:/root`; author proposal:
`subagent:/root/u1_inventory_finish`. Complete U1 acceptance remains pending.

The approved ordering is physical FINAL, then the exact old services STOPPED
projection, then the original creation journal CAS and authoritative terminal
reread. The physical result and remaining projection/journal debt are distinct.

The existing `_projectReplicaState` returns no object when a writer is absent,
and catches non-ACTIVE writer failures without rethrowing. It may also return
a retained projection. Merely awaiting this method therefore does not prove
that the old services row was projected STOPPED.

The runtime withdrawal uses the existing bootstrap vocabulary for a named
`RETIRED_UNPROJECTED` status when physical finality is FINAL but STOPPED
projection is unavailable, retained or throws. It preserves raw finality,
closed, tombstone and close evidence plus a typed projection reason. Absent
returned projection/stateRow is unavailable; a retained writer result is
retained. Only an actual returned STOPPED projection with a non-retained
writer result permits the next original-journal completion step.

The manager may separately project its own physically stopped canonical
record when that exact record and the physical observation allow it. It does
not call `completeConsensusCreation` on `RETIRED_UNPROJECTED`. The handler
keeps the exact plan/debt and returns its existing retryable retirement-held
disposition, naming the unprojected status/reason instead of describing the
raw CLOSED result as the remaining failure.

An explicit exact REMOVE retry, retained retirement continuation or restart
reuses the original origin. Repeating physical retirement is idempotent and
cannot touch a successor; successful projection then permits the original
journal CAS. No generic STOP journal, new operation identity, timer or
separate durable debt registry is introduced.

Required independent witness: form/publish through the real native component
embedding, make the exact STOPPED writer throw or retain its work, and verify
that physical RETIRED/CLOSED is real while the old services row and original
IN_PROGRESS journal remain. Restoring the real writer and retrying the same
origin removes only that row and completes only that original journal.
An absent-writer case covers the other undefined-return path. Removing the
projection-result check or completing the journal on RETIRED_UNPROJECTED must
fail the original-journal or remaining-services-row assertion.

This names a missing carrier for already-required ordering; it does not widen
physical FINAL, make a projection authoritative for physical custody, or
supersede the separate journal-completion requirement. Design/oracle approval
only; exact-source execution and independent source review remain required.
