---
categories: [recovery-replay]
---

# Verification Template: Recovery / Replay / Reconciliation

For changes to restart recovery, cache-vs-authoritative reconciliation, or
replay lanes. Each item requires an evidence path.

1. **Never clobber live with stale.** Show which durable authority, generation,
   and retained obligations permit recovery to replace in-memory state. A
   lagging cache row cannot erase current enlistment or recreate an old owner;
   in-memory existence alone cannot override newer durable authority either.
   Check each changed recovery write seam (record replacement, sub-registry,
   recovered-id enrollment, and list membership) against that contract.
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
6. **Recovery completes useful work.** Trace admitted obligations across restart,
   partial effect, lost acknowledgement, and replay through the real owner.
   Under stated finite-failure assumptions, prove safety, eventual resolution,
   and bounded retained state separately; refusing forever is not recovery.
