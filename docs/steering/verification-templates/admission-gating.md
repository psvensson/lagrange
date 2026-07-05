# Verification Template: Admission / Gating / Hold Predicates

For changes to admission checks, planning gates, hold predicates, or
readiness fences. Each item requires an evidence path (file:line / test /
log), not yes/no.

1. **Precheck-predicts-enforcement.** If a precheck exists for a later
   enforcement point, verify the precheck consults the SAME state the
   enforcer does. A precheck that admits what enforcement refuses turns
   transients into client failures. (run-25: `checkProvisioningAdmission`
   consulted storage only; the interlock rejected at `createOperation`.)
2. **Transient vs terminal classification.** Every rejection reason the
   change can emit: is it classified transient/hard where consumers
   branch (e.g. `TRANSIENT_PROVISIONING_SHORTFALL_REASONS`)? Whole-cluster
   transient rejections must WAIT under an existing budget, not fail-fast.
   (run-24: cohort fail-fast inside a legitimate hold window.)
3. **Which budget governs?** Name the EXISTING budget that bounds any new
   wait; the fix must re-attribute budgets, never raise them (TEST-0021).
4. **Reason-shape fidelity.** Emitted reasons: objects (`{code}`) vs bare
   strings — verify every consumer normalizes the shape the producer emits
   (a `String({code})` mismatch silently defeats classification).
5. **Hold release path.** What OBSERVABLE releases the hold, how does it
   propagate (CDC/cache lag?), and what is the measured release latency vs
   the callers' budgets? (run-27: the spread hold outlived the physical
   spread by learner-promotion + cache propagation.)
6. **Evaluation freshness.** Does the gate evaluate actuals per decision, or
   a cached snapshot that can go stale mid-hold?
7. **Message honesty.** Do blocking messages embed the state ACTUALLY
   examined (the held/blocking entity), not the admitted operation's ids?
   (run-24 forensics mislabel.)
