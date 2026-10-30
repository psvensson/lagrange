---
audience: agent
last_reviewed: 2026-10-30
---

# Rules

Read these cross-cutting invariants before acting. Each states one invariant,
routes to one owner through [`router.md`](router.md), and resolves disagreement.
Owners hold the detail, consulted when relevant; their detail can change without
changing a rule. The adjacent manifest seals one entry per independently violable
invariant. Rule count follows those invariants, never an arbitrary total.

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

**Invariant.** A consumer uses the owner's contract and outcomes; it never
re-derives the owner's decision or creates competing authority.
**Owner.** `architecture`
**On conflict.** Delegate the decision to its owner; preserve its meaning across
any owner-defined representation boundary.

## R04. A failure is repaired at its proven cause

**Invariant.** A failure is traced to its first causal divergence before the
repair is assigned. Product, fixture, verifier and infrastructure failures are
distinguished; none authorizes a fallback that invents owner authority.
**Owner.** `architecture`
**On conflict.** Repair the demonstrated cause and its affected interaction;
do not infer an architectural defect from the symptom alone.

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

**Invariant.** A contract crossing a boundary has one owner-defined semantic
shape. Encodings and adapters preserve its authority, identities, deadlines,
outcomes and retained obligations.
**Owner.** `contracts`
**On conflict.** Remove competing interpretations; make any required conversion
explicit at the owned boundary and prove that it preserves the contract.

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

## R16. Scope is bounded and widening is explicit

**Invariant.** A unit of work changes only what its declared scope permits;
widening is a recorded decision, never a side effect.
**Owner.** `quest-lifecycle`
**On conflict.** Widen the scope explicitly, or leave the change out.

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

**Invariant.** A claim holds only when its declared proof measures it; local success or source inspection is insufficient.
For a major feature, proof includes a useful user journey through its supported public entrypoint and real production composition.
**Owner.** `sealed-acceptance`
**On conflict.** Withhold the unsupported acceptance claim, record the evidence
gap and perform the investigation or proof that can resolve it.

## R20. Terminal state is not terminal proof

**Invariant.** Recording that work is finished is separate from retaining the
evidence that makes the claim reproducible; a closed unit keeps that evidence
and nothing else.
**Owner.** `terminal-proof`
**On conflict.** Keep exactly what the sealed claim requires.

## R21. History is append-only

**Invariant.** Recorded findings, attempts, verdicts and terminal entries are
appended to; they are never rewritten, truncated, relocated or deleted. A current
summary is a mutable index to those records, not a replacement for them.
**Owner.** `record-history`
**On conflict.** Append a correcting entry; never edit a recorded one.

## R22. A claim names the exact head it is true of

**Invariant.** Statements about landing, publishing or continuous integration
identify the exact commit they were measured on.
**Owner.** `publication`
**On conflict.** Re-measure or establish applicability through the existing proof
owner before claiming coverage; exact-candidate publication and release gates
still run where required.

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
context inform work; current owners decide repository semantics under the user's
instructions and standing authority.
**Owner.** `steering`
**On conflict.** Verify against the owner before acting on remembered detail.

## R26. An outward or irreversible action waits for authority it lacks

**Invariant.** An action that cannot be taken back, or that leaves this
repository, is performed only where the operator's authority for it already
exists.
**Owner.** `action-authority`
**On conflict.** Ask for the missing authority and explain the boundary. Existing
authorization for the same scope persists; unrelated authorization does not
extend it.

## R27. A probe measures, it never acts

**Invariant.** A probe reads the tree and prints a number; it never starts a
cluster, a demo, or a network call. The solver marks its measurement, and every
harness refuses to run under that mark.
**Owner.** `solve-probes`
**On conflict.** Move the work the probe would have started into an attempt;
a probe that needs to act is a harness wearing a probe's name.
