---
categories: [recovery-replay]
---

# Verification Template: Recovery / Replay / Reconciliation

For changes to restart recovery, cache-vs-authoritative reconciliation, or
replay lanes. Each item requires an evidence path.

1. **Never clobber live with stale.** Recovery that rebuilds in-memory
   state from rows must skip LIVE (in-memory, non-terminal) entries — cache
   rows lag CDC and rebuilt records start with empty registries. Enumerate
   EVERY seam that writes recovered state (the run-23 clobber had four:
   record replace, sub-registry overwrite, recovered-id enrollment,
   list duplication).
2. **Restart vs live discrimination.** How does the code distinguish "I
   restarted, restore everything" from "I am live, fill gaps only"? Show
   the discriminator and its false-positive cost.
3. **Lost-enlistment refusal.** A workflow that ever enlisted participants
   must refuse to run a stage against an empty registry (monotonic
   enlistment witness), while legitimately-empty workflows stay legal.
4. **Replay idempotence.** Replayed rows/commands re-applied after partial
   effects: show the dedup/CAS that makes them safe, and what CLEARS that
   dedup state when a rollback evaporates the effects (Z1).
5. **Absence-proves-nothing.** A row invisible during recovery is not
   evidence of completion or absence — verify no path treats
   unreadable-as-terminal (run-26 late-honor preempt-cancel).
