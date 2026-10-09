---
audience: development
documentClass: current
---

# Authority submission and driver prerequisites

Existing Quest: message-group-fresh-identity-membership.
Exact parent: d3d947f2d98ca9ea03f1cae91403ff551ee4d18d (PR114).
User request: implement commit-authority and driver-activation gates.
This candidate implements prerequisites; it does not close either full gate.

## Existing owners and exact local boundary

The registered callback captures its own router/callback pair. A delayed call
cannot sample a replacement registration as its own. Retirement uses the router
registry's existing exact-token method and cannot delete another handler.

OperationWorkflowOwner acquires its existing retained OperationLane turn before
reading or recording. It captures the local owner fence before waiting, never
borrows a coalesced foreign result, and uses its normalized dispatch timeout.
Its host-only submission predicate is passed to the existing repository and raw
mutation retry owner, not serialized into SQL request options or accepted from
a network payload. Retired invocations cannot newly enter the recorder or submit
another SQL attempt after an awaited read or retry. Holder expiry also bars a
new retry through the existing claim/clock predicate.

The original exact operation-row CAS still orders the write against ordinary
terminal settlement, holder replacement, permit and membership-phase changes.
No field of an issued permit is refreshed. The native result remains immutable
historical evidence, not current action authority. Durable debt and reservations
are neither cancelled nor released by local shutdown.

## Admission is not atomic commit-time revocation

Once an attempt has entered the existing gateway it may have committed even if
the caller retires before receiving its answer. Such a call returns UNKNOWN; it
must not be misclassified as proof of noncommitment. It grants no current CREATE,
new permit or successor permission. A later legitimate holder can reconcile the
same historical result through the existing repository.

This DOES NOT solve PR113 finding 4231684822: an external canonical nodes boot
change or wall-clock expiry, with the operation row unchanged, is not atomically
ordered against the remote SQL commit by a host callback. Those facts have
separate consensus owners. Another reread, callback, or post-write refusal is
not represented as a fix. The stronger commit-authority contract remains open.
No sealed requirement has been superseded or silently weakened here.

## Driver activation remains fail-closed

Do not activate recurring ordinary workflow progression or remove the current
CREATE park on this component proof. The remaining gate needs explicit durable
ordering of record/admission, revocation and successor takeover, plus current
CREATE through existing leader descriptor, exact-generation and sole-worker
owners. Holder succession is not successor-action permission. Missing history
cannot establish predecessor noncommitment. J1 forward recovery remains intact.

## Required evidence

Use real registered inbound callback capture/replacement, exact retirement,
actual OperationLane and DurableWorkflowCoordinator, post-delivery boot-read
suspension, same-socket owner-epoch retirement, retry admission and lease expiry.
An unchanged already-submitted commit must stay UNKNOWN and perform no physical
work. Restore source after every named-assertion negative and retain failures.
Normal SQLite/runner, inherited-complexity comparison, metadata and neighbor
regressions are component evidence only. The full-lab FAIL, timing debt, complete
change-impact/static, physical replacement/seed-loss and exact-main gates remain.
