# U1 ordinary HELD memo wake behind another exact execution

Status: independently approved narrow design clarification, before this case's
implementation. Reviewer: `subagent:/root`; implementation owner:
`subagent:/root/u1_inventory_finish`. No execution or complete U1 acceptance.

This supplements v3 section 4a and section 6 and the mandatory bounded-custody
addendum. Their exact-plan-first routing, full-origin equality, stopped fence,
physical authority and unavailable-grant suppression remain authoritative.

## Case and retained custody

A later, non-inventoried creation J can own an ordinary HELD canonical memo
while an older retained startup plan F occupies that replica's canonical gate.
A qualifying native wake for J cannot match or set a bit on F's execution.
Discarding that wake solely because F is busy would weaken the existing HELD
creation wake contract.

The existing J memo may therefore retain exactly one `wakePending` bit. The
wake must match J's complete original intent/binding/token through the existing
matching owner before setting it. No incoming token is adopted. The bit is
owned by the exact existing memo object, not by the canonical key alone.

The existing gate-release resume pass first considers already queued startup
plans, then this memo. It may consume the bit only when the same memo object
and full origin remain installed, the memo remains HELD, the handler is live,
the immediate synchronous physical-owner observation is CURRENT, and the
ordinary gate admits J. A busy attempt leaves the bit on that memo for the
next exact gate settlement. A replacement or no-longer-HELD memo cannot
transfer the bit to a successor or use it to reenter a settled creation.

This adds no listener, timer, queue, durable record or new scheduler. Existing
explicit CREATE redelivery and restart semantics are unchanged. Every attempt
still uses the original J journal and ordinary owner checks.

`CREATION_GRANT_HELD` with `grant.outcome === UNAVAILABLE` and
`CREATION_RESOURCE_CLOSED` remain RECORDED with no pending bit or CREATE.
Malformed, foreign-service, foreign-binding and foreign-token wakes have zero
continuation or memo mutation. Qualifying wakes for inventoried plans continue
to use their plan/entry custody first.

## Explicit bound amendment

The mandatory addendum's inventory bound remains N retained plans and G
admitted executions. For M existing canonical memos there may additionally be
at most M ordinary memo wake bits. Repeated wakes change one boolean and add
no callback or per-request storage. The full bound is N plan wake bits plus
M memo wake bits, with at most one admitted canonical execution per replica.

## Binary witness and mutation requirement

Retain a real HELD J, suspend a different exact F continuation under the
canonical gate, deliver a qualifying full-origin J wake repeatedly, then
release F. Observe one subsequent J continuation under J's original request,
zero F pending-wake mutation, and no new reservation identity. A foreign wake,
an unavailable-grant wake and a resource-close wake each produce zero repeat.
Replace J's memo or its physical origin before gate release and observe zero
stale J admission or successor mutation. Removing the memo bit or omitting
the same-memo/full-origin/currentness fence must make the corresponding
positive or stale-continuation assertion fail. Scripted coverage alone is
only a handler contract witness; real physical custody requires the native
component witnesses retained separately.

Independent design disposition: APPROVE this bounded clarification. Its
implementation, witnesses, mutation controls and combined exact-SHA lab run
remain required; this approval does not open U2.
