# Design-Note Template: Scoped Review

Use this structure when a repair needs a design note. It belongs in the existing
Quest evidence or owned design document; it does not require a separate design
stage or a new authority file for every repair. The author and independent
reviewer use the same bounded causal question.

## Claim, Scope, And Current Evidence

Name the invariant, failing witness, affected interaction, real entry path, and
independently complete repair claim. Distinguish that claim from the originating
service scenario and full release acceptance. State what is currently observed,
what follows from source or contract analysis, and what remains a hypothesis.
Record the first failing artifact and the next discriminating check.

If the proposal narrows capability, compare completing the existing mechanism
with safe exclusion. Inspect public, internal, and background callers, admission,
retained obligations, and restart behavior before claiming a path unreachable.
Prefer an existing useful configuration when it suffices. A new product mode or
parallel authority is not justified merely to simplify a test.

## Contract And Failure Analysis

1. **Consumed surfaces.** Cite the current function, event, configuration key,
   table, factory, or seam the design consumes. An uncited surface is unknown
   until checked; say whether it is an unresolved dependency or a proposed
   addition. Do not silently invent it or treat historical design text as
   current wiring.
2. **Typed failure edges.** Follow the bounded operation from trigger and
   admission through durable effect, response, loss, retry, and recovery. Give
   each relevant failure edge the owner-defined typed outcome and caller
   behavior, including absent, empty, and already-satisfied inputs. State which
   owner retains obligations after cancellation or deadline expiry.
3. **Cached views.** For each touched cache, memo, staged copy, or read-through
   view, name its authority, invalidation, stale-read behavior, and recovery
   path. Show why stale observations cannot resurrect a closed operation or
   permanently veto progress after fresh evidence arrives.
4. **Identity and representation.** Name the relevant term, epoch, generation,
   cluster, principal, operation, and content identity, with its source. Show
   what happens when an anchor changes mid-operation. Legitimate adapters and
   representations must preserve authorization, provenance, identity, deadlines,
   and durable obligations; they must not make a second semantic decision.

## Evidence And Closure

State safety, recovery progress under finite-failure assumptions, and resource
bounds separately. Name the deterministic, native, and physical evidence needed
for the actual claim, and which can be reused through the current proof owner.
A helper-only test is insufficient when production never reaches the helper.
An unavailable execution or invalid fixture cannot count as a product pass.

The verifier reports all concrete findings within the scoped categories in one
pass, each with an invariant, reachable path, and evidence. Route unrelated
findings to an owner; block this repair only when its correctness, proof, or safe
integration depends on them. Repeated refutation of the same assumption prompts
reassessment by the existing roles, not an automatic new stage or broader task.
