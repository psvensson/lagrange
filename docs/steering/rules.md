---
audience: agent
last_reviewed: 2026-09-06
---

# Rules

Twenty-five cross-cutting invariants. An agent can violate this repository
merely by not knowing these before acting; everything else belongs to an
owner and is consulted when relevant. Each rule states one invariant, names
one owner through [`router.md`](router.md), and says what to do when the code
in front of you disagrees. A rule never restates what its owner defines, so
changing an owner's detail does not change a rule.

## R01. One semantic owner per concern

**Invariant.** Every semantic concern has exactly one authoritative owner.
**Owner.** `architecture`
**On conflict.** Change the owner. Never satisfy a caller by re-deriving the
owner's decision locally.

## R02. An interaction between owners is itself owned

**Invariant.** Where two owners meet, the interaction is a named contract, and
that contract is the change boundary.
**Owner.** `owner-interactions`
**On conflict.** Change the interaction as one unit; never tune one side.

## R03. Authority is consumed, not copied

**Invariant.** A consumer asks its owner; it never restates the owner's
knowledge in its own terms.
**Owner.** `architecture`
**On conflict.** Replace the copy with a call to the owner.

## R04. A symptom is an owner defect

**Invariant.** A local failure is evidence that an owner or a boundary is
wrong; it is never grounds for a local fallback, adapter or compatibility
path.
**Owner.** `architecture`
**On conflict.** Repair the owner the symptom points at.

## R05. Derived material is not an authority

**Invariant.** Generated, cached or projected material never competes with the
producer it came from.
**Owner.** `generated-artifacts`
**On conflict.** Regenerate from the producer; fix the producer, not its output.

## R06. Scalars, states and names have owners

**Invariant.** A domain value lives in its owner module and is imported, never
written inline at a use site.
**Owner.** `guideline-audits`
**On conflict.** Move the value to its owner and import it.

## R07. A semantic outcome is a named state

**Invariant.** A decision outcome is an explicit named state, never inferred
from an empty, absent or ambiguous value.
**Owner.** `guideline-audits`
**On conflict.** Name the state and decide on it.

## R08. A shared contract has one canonical shape

**Invariant.** A contract crossing a boundary has one representation, defined
once.
**Owner.** `contracts`
**On conflict.** Converge on the canonical shape rather than translating.

## R09. A sealed contract is superseded, never reinterpreted

**Invariant.** Once sealed, acceptance terms change only by superseding the
sealed record; they are never weakened, widened or reread to fit an outcome.
**Owner.** `sealed-acceptance`
**On conflict.** Supersede explicitly and record why.

## R10. Durable authority excludes transient state

**Invariant.** Cached, in-flight or projected state never becomes the durable
authority for a decision.
**Owner.** `contracts`
**On conflict.** Read the durable owner and treat the projection as a hint.

## R11. One execution path, and unavailability is explicit

**Invariant.** A semantic decision has one path. When a dependency is
unavailable that is an explicit, typed outcome, not a quieter alternative
path.
**Owner.** `contracts`
**On conflict.** Delete the alternate path and surface the unavailability.

## R12. Load slows the system, never breaks it

**Invariant.** Pressure may degrade latency or throughput; it may never change
correctness or drop an acknowledged obligation.
**Owner.** `contracts`
**On conflict.** Add backpressure, not a shortcut.

## R13. Resource lifetime is owned and bounded

**Invariant.** Anything acquired has a named owner and a bounded lifetime.
**Owner.** `contracts`
**On conflict.** Give the resource an owner and a bound before extending its use.

## R14. Mutations are idempotent

**Invariant.** A mutation may be retried without changing the result.
**Owner.** `contracts`
**On conflict.** Make the operation idempotent rather than guarding the caller.

## R15. Work starts from one bounded, sealed unit

**Invariant.** Work likely to need more than one measured attempt, or that
changes an owner boundary, starts from a sealed statement with a binary probe.
**Owner.** `quest-lifecycle`
**On conflict.** Seal the unit before continuing.

## R16. Authority is bounded and widening is explicit

**Invariant.** A unit of work changes only what its scope authorises, and takes
an irreversible or outward-facing action only where that authority already
exists; widening either is a recorded decision of the person who holds the
authority, never a side effect.
**Owner.** `quest-lifecycle`
**On conflict.** Obtain the wider authority explicitly, or leave the action out.

## R17. Discoveries outside scope are recorded, not absorbed

**Invariant.** Something found but not in scope becomes a durable finding for
its owner; it is neither silently fixed nor silently dropped.
**Owner.** `quest-lifecycle`
**On conflict.** Record the finding and route it to the owner.

## R18. Read the owners before writing code

**Invariant.** Before changing behaviour, the owners and interactions the
change touches are known.
**Owner.** `architecture`
**On conflict.** Stop and read the owner first.

## R19. Implementation success is not proof

**Invariant.** A claim holds only when its declared proof measures it. Working
locally, reading correct, or passing an unrelated check is not proof.
**Owner.** `sealed-acceptance`
**On conflict.** Measure the declared proof, or change nothing.

## R20. Terminal state is not terminal proof

**Invariant.** Recording that work is finished is separate from retaining the
evidence that makes the claim reproducible; a closed unit keeps that evidence
and nothing else.
**Owner.** `terminal-proof`
**On conflict.** Keep exactly what the sealed claim requires.

## R21. History is append-only

**Invariant.** Recorded findings, attempts, verdicts and terminal entries are
appended to; they are never rewritten, truncated, relocated or deleted.
**Owner.** `record-history`
**On conflict.** Append a correcting entry; never edit a recorded one.

## R22. A claim names the exact head it is true of

**Invariant.** Statements about landing, publishing or continuous integration
identify the exact commit they were measured on.
**Owner.** `publication`
**On conflict.** Re-measure against the current head before claiming.

## R23. No gate is bypassed to obtain a green state

**Invariant.** Gates are satisfied, not skipped, weakened or worked around,
and a red shared branch is repaired by naming the failure and the head it
repairs.
**Owner.** `publication`
**On conflict.** Fix the cause the gate found.

## R24. Steering routes; owners hold detail

**Invariant.** Steering states cross-cutting invariants and routes to owners.
Detail lives with its owner and is loaded only when relevant.
**Owner.** `steering`
**On conflict.** Move the detail to its owner and leave a route.

## R25. Memory informs, authority decides

**Invariant.** Notes, prior reports, historical records and conversation
context inform work; the repository's current owners decide it.
**Owner.** `steering`
**On conflict.** Verify against the owner before acting on remembered detail.
