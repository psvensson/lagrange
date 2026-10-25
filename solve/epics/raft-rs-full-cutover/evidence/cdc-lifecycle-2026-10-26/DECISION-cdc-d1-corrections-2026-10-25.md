---
audience: development
documentClass: evidence
---

# D1 rejection corrections

Input is the user's reviewed continuation instruction and the independent
rejection of `e1d26e0eb2e0947f56440427fc1be5ccb56c65a2`. The original design
and measured attempts remain historical evidence. This decision supersedes its
claims that any coordinate below the compact prefix proves exact event delivery,
and that a fixed set of CDC tables bounds owed work. It preserves the accepted
D1 obligations, D4 handoff, replay, native application and large-input witnesses.

## Exact event identity

A compact prefix proves every actual obligation through that position was
completed. It cannot prove a supplied digest or ordinal existed. New exact-event
acknowledgements below the prefix therefore receive `IDENTITY_COMPACTED`, never
successful exact acknowledgement. Above it, the retained row still proves or
refuses the complete identity. Any refusal consumes the whole command without
marking rows or changing progress.

The delivery owner may reconcile only identities it previously read from the
ledger and still retains as its pending obligations. It reads the committed
prefix from the local ledger, retires covered pending identities and their old
batch, and re-batches any remaining known obligations. This is a named
reconciliation result, not a claim that the new exact-event command succeeded.
No historical per-event tombstone or second delivery predicate is introduced.

Required measurements restore the original misfiled-event case after reclamation,
retain the unreclaimed mismatch case, include nonexistent ordinal and generation
origin positions, and exercise whole and mixed pending batches through the real
lane. Existing unknown-outcome replay and hole/restart/race proofs remain.

## Owed-work admission

The accepted pending-work budget includes durable owed events, not merely
retained delivered rows and outstanding acknowledgement batches. The ledger must
supply the measurement; the existing write admission interaction must reserve
capacity before admitting event-producing work, accounting for concurrent
proposals and complete transaction batches. A PREPARED transaction's later COMMIT
must retain its reserved capacity; neither acknowledgement/drain commands nor
replay of already settled work can be blocked by this budget. Never delete owed
rows, refuse an already decided COMMIT, or introduce the rejected fixed remote
input/event/target caps to make this pass. The precise reservation contract and
red witness are still being prepared; F1 approval alone will not close D1.
