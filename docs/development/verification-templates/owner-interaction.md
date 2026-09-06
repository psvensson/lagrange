---
categories: [owner-interaction]
---

# Verification Template: Owner Interaction

Use this checklist for changes that touch a registered cross-owner interaction,
especially a `coupledPairs` entry in `test/shards/impact-contracts.json`.

The verifier must attack the **interaction contract**, not review each owner in
isolation. Every item requires a concrete evidence path (source, contract,
test, model, or immutable run artifact).

## Checklist

1. **Single semantic question owner**
   - Name the semantic question the interaction answers.
   - Identify the one component allowed to make that decision.
   - Prove diagnostics, harnesses, retained views, caches, and participants do
     not independently derive an equivalent verdict from lower-level evidence.

2. **Interaction owner and typed boundary**
   - Identify what each participant owns and what it only supplies as intent,
     evidence, or actuation.
   - Show the typed contract that crosses the seam and the component that
     adjudicates its meaning.
   - Reject aliases, boolean option bags, or local fallback logic that create a
     second interpretation of the same interaction.

3. **Paired-invariant / ping-pong attack**
   - Name the invariants on both sides that historically pull in opposite
     directions.
   - Prove they are green **in the same deterministic witness**, not only in
     separate tests.
   - For a known historical fix class, show that restoring the old local
     shortcut makes the paired witness red.

4. **Stale-then-fresh temporal replay**
   - Replay an older stale/degraded witness followed by newer authoritative
     evidence.
   - Prove the old observation cannot remain a permanent semantic veto after
     the evidence it described changes.
   - Prove the consumer re-enters the canonical owner path rather than using a
     local reinterpretation.

5. **Pressure and backoff attack**
   - Prove a liveness fix does not bypass owner-owned backpressure, retry-after,
     single-flight, or failure deferral.
   - Repeated callers must not amplify work or turn a bounded retry owner into a
     repair storm.
   - Caller urgency/force intent is not permission to bypass an owner safety
     policy unless the contract explicitly says so.

6. **Wake / release-path attack**
   - Identify the event or revision that can make the blocked decision become
     satisfiable.
   - Prove that transition re-drives or invalidates the consumer through the
     canonical owner queue/path.
   - Polling/timers may remain recovery fallbacks; they must not be the sole
     correctness progression mechanism.

7. **Projection-authority attack**
   - Enumerate diagnostic and presentation projections that expose related
     state.
   - Prove none is promoted into a competing operational authority merely
     because it is cheaper, fresher-looking, or easier for a harness to read.

8. **Controlled-negative / treatment-fidelity attack**
   - When the proof uses a fixed/reverted A/B or red-on-revert control, prove the
     treatment actually changes source/behavior, not only the pass criterion.
   - Bind the control to source/change fingerprints and keep expected-negative
     samples out of the positive certification population.

9. **No local escape hatch**
   - Search touched callers for direct raw reads, alternate retry loops, force
     flags, fallback success, or duplicated decision predicates that bypass the
     registered pair.
   - Any surviving exception must be explicit in the interaction contract,
     bounded, and covered by the paired witness.

10. **Contract + registry + proof stay aligned**
    - The changed paths are covered by the named impact contract.
    - The registered pair has live endpoints and exact primary-classified
      witness tests.
    - Contract/model/decision-table changes and the witness change together when
      semantics change; a source-only semantic change is a rejection.
    - The registry entry rides in the same product Quest as the owner change
      (`test/shards/impact-contracts.json` classifies as `test`); it needs no
      separate Quest.

## Verdict bar

Approve only when the same candidate preserves both participant invariants,
keeps a single semantic decision owner, and has a reachable event-driven release
path under pressure. A local fix that merely moves the failure to the adjacent
owner is a rejection even when its focused unit test is green.
